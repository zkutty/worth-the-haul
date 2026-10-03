// Local test entrypoint only. There are no live providers or provider credentials.
import { SCORE_BUDGET_OBJECT_NAME } from "../lib/score-budget";
export { ScoreBudget } from "../lib/score-budget";

interface HarnessEnv {
  SCORE_BUDGET: {
    idFromName(name: string): unknown;
    get(id: unknown): { fetch(request: Request): Promise<Response> };
  };
  TEST_PROVIDER: { fetch(request: Request): Promise<Response> };
}

const harness = {
  async fetch(request: Request, env: HarnessEnv): Promise<Response> {
    const budget = env.SCORE_BUDGET.get(env.SCORE_BUDGET.idFromName(SCORE_BUDGET_OBJECT_NAME));
    const decision = await budget.fetch(new Request("https://score-budget.internal/reserve", request));
    if (!decision.ok) return decision;
    // The reservation bounds one lookup, four routing calls and two model calls.
    // Every call is a local Miniflare service-binding stub, never an internet fetch.
    const providers = await Promise.all(Array.from({ length: 7 }, () => env.TEST_PROVIDER.fetch(new Request("https://provider-stub.internal"))));
    if (providers.some((result) => !result.ok)) return Response.json({ code: "STUB_PROVIDER_FAILED" }, { status: 503 });
    return decision;
  },
};

export default harness;
