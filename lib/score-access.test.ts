import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { context, reserve } = vi.hoisted(() => ({ context: vi.fn(), reserve: vi.fn() }));
vi.mock("@opennextjs/cloudflare", () => ({ getCloudflareContext: context }));
import { checkScoreAccess, scoreEnvironment } from "./score-access";

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  context.mockReturnValue({ env: { SCORE_BUDGET: { idFromName: (name: string) => name, get: () => ({ fetch: reserve }) } } });
  reserve.mockResolvedValue(Response.json({ allowed: true }));
});
afterEach(() => vi.restoreAllMocks());

describe("shared scoring access binding", () => {
  it("reserves using one singleton and trusted Cloudflare identity", async () => {
    expect(await checkScoreAccess(new Request("http://localhost", { headers: { "cf-connecting-ip": "192.0.2.1", "x-forwarded-for": "198.51.100.2" } }))).toBeNull();
    const request = reserve.mock.calls[0][0] as Request;
    expect(await request.json()).toEqual({ client: "192.0.2.1" });
  });
  it("does not trust spoofable forwarded identity", async () => {
    await checkScoreAccess(new Request("http://localhost", { headers: { "x-forwarded-for": "198.51.100.2" } }));
    expect(await (reserve.mock.calls[0][0] as Request).json()).toEqual({ client: "unknown" });
  });
  it("preserves quota rejection status and Retry-After", async () => {
    reserve.mockResolvedValue(Response.json({ code: "CLIENT_RATE_LIMIT" }, { status: 429, headers: { "Retry-After": "60" } }));
    const response = await checkScoreAccess(new Request("http://localhost"));
    expect(response?.status).toBe(429);
    expect(response?.headers.get("retry-after")).toBe("60");
  });
  it("fails closed on missing binding, missing runtime, thrown reserve, and malformed decisions", async () => {
    context.mockReturnValueOnce({ env: {} });
    expect((await checkScoreAccess(new Request("http://localhost")))?.status).toBe(503);
    context.mockImplementationOnce(() => { throw new Error("No platform"); });
    expect(scoreEnvironment()).toBe(process.env);
    reserve.mockRejectedValueOnce(new Error("Private platform details"));
    expect((await checkScoreAccess(new Request("http://localhost")))?.status).toBe(503);
    reserve.mockResolvedValueOnce(Response.json({ unexpected: true }));
    expect((await checkScoreAccess(new Request("http://localhost")))?.status).toBe(503);
  });
});
