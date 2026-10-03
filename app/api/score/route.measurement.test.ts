import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseMeasurementRow } from "@/lib/measurement-contract";

const { createMessage, access } = vi.hoisted(() => ({ createMessage: vi.fn(), access: vi.fn() }));
vi.mock("@anthropic-ai/sdk", () => ({ default: class {
  messages = { create: createMessage };
} }));
vi.mock("@/lib/score-access", () => ({ checkScoreAccess: access, scoreEnvironment: () => ({ WTH_REVISION: "a".repeat(40) }) }));
import { POST } from "./route";

const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const modes = ["driving", "transit", "walking", "bicycling"] as const;
const model = { fire: 8, schlep: 3, fire_reason: "Appeal estimate.", fire_details: [], schlep_reason: "Effort estimate.",
  schlep_details: [], verdict: "Worth It", verdict_reason: "Estimate.", distance_note: "Nearby", mode_estimates: modes.map(mode => ({ mode, schlep: 3, reason: "Effort estimate." })) };
const request = (body: unknown = { place: "Private destination", from: "Private origin" }, headers = {}) => new Request("https://local/api/score", {
  method: "POST", body: JSON.stringify(body), headers: { "X-WTH-Operation-Id": id, "X-WTH-Traffic": "controlled_smoke", ...headers },
});
function rows() { return vi.mocked(console.log).mock.calls.map(call => parseMeasurementRow(call[1])); }
function terminal(status: number, outcome: string) {
  const events = rows();
  expect(events.filter(row => row.event === "score_start")).toHaveLength(1);
  expect(events.filter(row => row.event === "score_outcome")).toEqual([expect.objectContaining({ status, outcome })]);
  expect(events.every(row => row.operation_id === id && row.attempt_id === events[0].attempt_id)).toBe(true);
}
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv("GOOGLE_MAPS_API_KEY", "private-key"); vi.stubEnv("ANTHROPIC_API_KEY", "private-key");
  vi.spyOn(console, "log").mockImplementation(() => {}); vi.spyOn(console, "warn").mockImplementation(() => {}); vi.spyOn(console, "error").mockImplementation(() => {});
  access.mockResolvedValue(null);
  vi.stubGlobal("fetch", vi.fn().mockImplementation(async (url: string) => url.includes("findplace")
    ? Response.json({ status: "OK", candidates: [{ name: "Private resolved", place_id: "private-id" }] })
    : Response.json({ status: "OK", rows: [{ elements: [{ status: "OK", duration: { text: "10 mins", value: 600 }, distance: { text: "2 km" } }] }] })));
  createMessage.mockResolvedValue({ content: [{ type: "text", text: JSON.stringify(model) }] });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
describe("actual request-local provider measurement", () => {
  it("counts one Places, four parallel Routes and both actual model retry calls", async () => {
    createMessage.mockResolvedValueOnce({ content: [{ type: "text", text: "private invalid output" }] });
    const response = await POST(request());
    expect(response.status).toBe(200); terminal(200, "success");
    expect(response.headers.get("X-WTH-Operation-Id")).toBe(id);
    expect(response.headers.get("X-WTH-Attempt-Id")).toBe(rows()[0].attempt_id);
    const starts = rows().filter(row => row.event === "provider_start");
    const finishes = rows().filter(row => row.event === "provider_finish");
    expect(starts.map(row => row.provider)).toEqual(["places", "routes", "routes", "routes", "routes", "model", "model"]);
    expect(new Set(starts.map(row => row.call_id)).size).toBe(7);
    expect(finishes).toHaveLength(7);
    expect(finishes.every(row => row.result === "resolved")).toBe(true);
    // All four starts precede the first route finish: elapsed provider time overlaps.
    const events = rows();
    const firstRouteFinish = events.findIndex(row => row.event === "provider_finish" && row.provider === "routes");
    expect(events.slice(0, firstRouteFinish).filter(row => row.event === "provider_start" && row.provider === "routes")).toHaveLength(4);
    expect(JSON.stringify(events)).not.toMatch(/Private|private|origin|destination|https|key/);
  });
  it("counts no Routes for a name-only resolved place", async () => {
    vi.mocked(fetch).mockResolvedValue(Response.json({ status: "OK", candidates: [{ name: "Name only" }] }));
    createMessage.mockResolvedValue({ content: [{ type: "text", text: JSON.stringify({ ...model, mode_estimates: [] }) }] });
    expect((await POST(request())).status).toBe(200);
    expect(rows().filter(row => row.event === "provider_start").map(row => row.provider)).toEqual(["places", "model"]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("pairs rejected fetch invocations without leaking thrown URLs", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("private URL/key/origin"));
    expect((await POST(request())).status).toBe(502); terminal(502, "provider_failure");
    expect(rows().filter(row => row.event === "provider_finish")).toEqual([expect.objectContaining({ provider: "places", result: "rejected" })]);
    expect(JSON.stringify(rows())).not.toContain("private");
  });
  it.each([
    ["invalid", 400], ["denied", 429], ["not_found", 400], ["configuration", 503], ["unusable_result", 502], ["failure", 502],
  ] as const)("emits exactly one outcome and headers for %s", async (branch, status) => {
    if (branch === "denied") access.mockResolvedValue(Response.json({ code: "CLIENT_RATE_LIMIT" }, { status: 429, headers: { "Retry-After": "30" } }));
    if (branch === "not_found") vi.mocked(fetch).mockResolvedValue(Response.json({ status: "ZERO_RESULTS" }));
    if (branch === "configuration") vi.stubEnv("GOOGLE_MAPS_API_KEY", "");
    if (branch === "unusable_result") createMessage.mockResolvedValue({ content: [] });
    if (branch === "failure") createMessage.mockRejectedValue(new Error("private API error"));
    const response = await POST(request(branch === "invalid" ? {} : undefined));
    expect(response.status).toBe(status);
    expect(response.headers.get("X-WTH-Attempt-Id")).toBeTruthy();
    terminal(status, branch === "configuration" ? "provider_failure" : branch);
    if (["invalid", "denied", "configuration"].includes(branch)) {
      expect(fetch).not.toHaveBeenCalled(); expect(createMessage).not.toHaveBeenCalled();
      expect(rows().filter(row => row.event === "provider_start")).toHaveLength(0);
    }
    if (branch === "denied") expect(response.headers.get("Retry-After")).toBe("30");
    if (branch === "failure") {
      expect(rows().filter(row => row.event === "provider_finish" && row.provider === "model")).toEqual([expect.objectContaining({ result: "rejected" })]);
      expect(createMessage).toHaveBeenCalledTimes(1);
    }
  });
  it("correlates repeated logical operations with distinct server attempts", async () => {
    const first = await POST(request()); const second = await POST(request());
    expect(first.headers.get("X-WTH-Operation-Id")).toBe(second.headers.get("X-WTH-Operation-Id"));
    expect(first.headers.get("X-WTH-Attempt-Id")).not.toBe(second.headers.get("X-WTH-Attempt-Id"));
    expect(rows().filter(row => row.event === "score_start")).toHaveLength(2);
    expect(rows().filter(row => row.event === "provider_start")).toHaveLength(12);
  });
  it.each(["{", " ".repeat(32_769)])("covers malformed and oversized bodies before provider work", async body => {
    const response = await POST(new Request("https://local/api/score", { method: "POST", body, headers: { "X-WTH-Operation-Id": id } }));
    terminal(body.length > 32_768 ? 413 : 400, "invalid");
    expect(response.headers.get("X-WTH-Attempt-Id")).toBeTruthy();
    expect(fetch).not.toHaveBeenCalled(); expect(createMessage).not.toHaveBeenCalled();
  });
  it("pairs every parallel route fetch even when one fails", async () => {
    let routeCalls = 0;
    vi.mocked(fetch).mockImplementation(async (input) => {
      if (String(input).includes("findplace")) return Response.json({ status: "OK", candidates: [{ name: "Private", place_id: "id" }] });
      if (++routeCalls === 1) throw new Error("private URL");
      return Response.json({ status: "ZERO_RESULTS" });
    });
    expect((await POST(request())).status).toBe(502);
    const routeStarts = rows().filter(row => row.event === "provider_start" && row.provider === "routes");
    const routeFinishes = rows().filter(row => row.event === "provider_finish" && row.provider === "routes");
    expect(routeStarts).toHaveLength(4); expect(routeFinishes).toHaveLength(4);
    expect(routeFinishes.filter(row => row.result === "rejected")).toHaveLength(1);
    expect(createMessage).not.toHaveBeenCalled();
  });
  it("preserves score JSON when UUID setup or the log sink fail", async () => {
    vi.spyOn(crypto, "randomUUID").mockImplementationOnce(() => { throw new Error("UUID unavailable"); });
    expect((await POST(request())).status).toBe(200);
    expect(console.log).not.toHaveBeenCalled();
    vi.mocked(console.log).mockImplementation(() => { throw new Error("sink unavailable"); });
    expect((await POST(request())).status).toBe(200);
  });
});
