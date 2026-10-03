import { afterEach, beforeEach, expect, it, vi } from "vitest";

const { environment } = vi.hoisted(() => ({ environment: vi.fn() }));
vi.mock("@/lib/score-access", () => ({ scoreEnvironment: environment }));
import { GET } from "./route";

const revision = "a".repeat(40);
const configured = { SCORE_BUDGET: {}, SCORE_DAILY_LIMIT: "100", WTH_REVISION: revision, CF_VERSION_METADATA: { id: "fixture-version" } };
beforeEach(() => {
  vi.stubEnv("GOOGLE_MAPS_API_KEY", "fixture");
  vi.stubEnv("ANTHROPIC_API_KEY", "fixture");
  environment.mockReturnValue(configured);
});
afterEach(() => vi.unstubAllEnvs());

it("returns exact revision and version without contacting providers", async () => {
  const response = await GET();
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(await response.json()).toEqual({ ready: true, revision, version: "fixture-version" });
});
it.each([{ ...configured, SCORE_DAILY_LIMIT: "0" }, { ...configured, SCORE_DAILY_LIMIT: "invalid" },
  { ...configured, SCORE_ENABLED: "false" }, { ...configured, SCORE_BUDGET: undefined }, { ...configured, WTH_REVISION: "wrong" },
])("fails readiness on unavailable cost/revision configuration", async env => {
  environment.mockReturnValue(env);
  const response = await GET();
  expect(response.status).toBe(503);
  expect((await response.json()).ready).toBe(false);
});
it("fails readiness on missing provider keys without exposing configuration", async () => {
  vi.stubEnv("ANTHROPIC_API_KEY", "");
  const response = await GET();
  expect(response.status).toBe(503);
  expect(JSON.stringify(await response.json())).not.toMatch(/API_KEY|fixture"/);
});
