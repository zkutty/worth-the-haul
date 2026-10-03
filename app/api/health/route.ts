import { requireProviderKeys } from "@/lib/provider-error";
import { scoreEnvironment } from "@/lib/score-access";
import { readBudgetConfig } from "@/lib/score-budget";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Configuration readiness only: this endpoint never calls paid providers.
export async function GET() {
  const env = scoreEnvironment();
  const revision = env.WTH_REVISION;
  let ready = false;
  try {
    requireProviderKeys();
    const budget = readBudgetConfig(env);
    ready = Boolean(env.SCORE_BUDGET && budget.enabled && budget.dailyLimit > 0 &&
      typeof revision === "string" && /^[a-f0-9]{40}$/.test(revision));
  } catch { /* Report readiness without exposing secrets or binding values. */ }
  return Response.json({ ready, revision: revision ?? null,
    version: env.CF_VERSION_METADATA?.id ?? null }, {
    status: ready ? 200 : 503, headers: { "Cache-Control": "no-store" },
  });
}
