import { getCloudflareContext } from "@opennextjs/cloudflare";

type BudgetNamespace = {
  idFromName(name: string): unknown;
  get(id: unknown): { fetch(request: Request): Promise<Response> };
};
export type ScoreEnvironment = {
  SCORE_BUDGET?: BudgetNamespace;
  SCORE_ENABLED?: string;
  SCORE_DAILY_LIMIT?: string;
  SCORE_CLIENT_LIMIT?: string;
  SCORE_CLIENT_WINDOW_SECONDS?: string;
  WTH_REVISION?: string;
  CF_VERSION_METADATA?: { id?: string; tag?: string; timestamp?: string };
};

export function scoreEnvironment(): ScoreEnvironment {
  try {
    return getCloudflareContext().env as ScoreEnvironment;
  } catch {
    return process.env as ScoreEnvironment;
  }
}

export async function checkScoreAccess(req: Request): Promise<Response | null> {
  const env = scoreEnvironment();
  if (!env.SCORE_BUDGET) {
    return Response.json({ error: "Scoring is temporarily unavailable. Please try again later.", code: "COST_PROTECTION_UNAVAILABLE" }, { status: 503 });
  }
  // Cloudflare overwrites this header on public requests. Never trust arbitrary
  // X-Forwarded-For values. Missing identity shares a single conservative bucket.
  const candidate = req.headers.get("cf-connecting-ip") ?? "";
  const client = /^[a-fA-F0-9.:]{3,45}$/.test(candidate) && /[.:]/.test(candidate) ? candidate : "unknown";
  try {
    const budget = env.SCORE_BUDGET.get(env.SCORE_BUDGET.idFromName("score-budget-v1"));
    const response = await budget.fetch(new Request("https://score-budget.internal/reserve", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client }),
    }));
    if (!response.ok) return response;
    const decision = await response.json();
    if (decision?.allowed !== true) throw new Error("Invalid quota decision");
    return null;
  } catch {
    console.error("score_failure", { provider: "budget", kind: "unavailable" });
    return Response.json({ error: "Scoring is temporarily unavailable. Please try again later.", code: "COST_PROTECTION_UNAVAILABLE" }, { status: 503 });
  }
}
