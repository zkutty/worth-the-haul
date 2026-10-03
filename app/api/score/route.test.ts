import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProviderError } from "@/lib/provider-error";

const { lookup, distance, score, access } = vi.hoisted(() => ({
  lookup: vi.fn(), distance: vi.fn(), score: vi.fn(), access: vi.fn(),
}));
vi.mock("@/lib/google", () => ({ findPlace: lookup, getDistance: distance }));
vi.mock("@/lib/claude", () => ({ scoreWithClaude: score }));
vi.mock("@/lib/score-access", () => ({ checkScoreAccess: access }));
import { POST } from "./route";

const validScore = {
  fire: 8, schlep: 3, fire_reason: "Excellent.", fire_details: ["Distinctive."],
  schlep_reason: "An easy trip.", schlep_details: ["Direct route."],
  verdict: "Worth It", verdict_reason: "Quality outweighs effort.", distance_note: "Nearby", mode_estimates: [],
};
function request(payload: unknown) {
  return new Request("http://localhost/api/score", { method: "POST", body: JSON.stringify(payload) });
}
function noProviders() {
  expect(lookup).not.toHaveBeenCalled();
  expect(distance).not.toHaveBeenCalled();
  expect(score).not.toHaveBeenCalled();
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("GOOGLE_MAPS_API_KEY", "fixture");
  vi.stubEnv("ANTHROPIC_API_KEY", "fixture");
  vi.spyOn(console, "error").mockImplementation(() => {});
  lookup.mockResolvedValue({ name: "Example", lat: 37, lng: -122 });
  distance.mockResolvedValue({ legs: [] });
  score.mockImplementation(() => Promise.resolve({ ...validScore }));
  access.mockResolvedValue(null);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

describe("score route contracts and failure recovery", () => {
  it.each([null, [], "place", {}, { place: 1 }, { place: " " }, { place: "x".repeat(201) },
    { place: "Example", from: {} }, { place: "Example", from: "x".repeat(151) },
    { place: "Example", mode: "flying" }, { place: "Example", lockFire: [] },
    { place: "Example", lockFire: { fire: 2, fire_reason: "reason", fire_details: [4] } },
    { place: "Example", lockFire: { fire: 7, fire_reason: "Original", fire_details: [] } },
    { place: "Example", knownPlace: { name: "Spoofed", rating: 5 } },
    { place: "Example", knownLegs: [] }, { place: "Example", context: {} },
    { place: "Example", hiddenPayload: "extra" },
  ])("rejects invalid shape/types/fields before any upstream call: %j", async payload => {
    const response = await POST(request(payload));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "INVALID_REQUEST" });
    noProviders();
    expect(access).not.toHaveBeenCalled();
  });
  it("controls malformed and oversized bodies, even without a content-length header", async () => {
    const malformed = await POST(new Request("http://localhost/api/score", { method: "POST", body: "{" }));
    expect(malformed.status).toBe(400);
    const oversized = await POST(new Request("http://localhost/api/score", { method: "POST", body: " ".repeat(32_769) }));
    expect(oversized.status).toBe(413);
    noProviders();
  });
  it("rejects an oversized content-length before reading", async () => {
    const response = await POST(new Request("http://localhost/api/score", { method: "POST", headers: { "content-length": "32769" }, body: "{}" }));
    expect(response.status).toBe(413);
    noProviders();
  });
  it.each(["GOOGLE_MAPS_API_KEY", "ANTHROPIC_API_KEY"])("fails closed without %s", async key => {
    vi.stubEnv(key, "");
    const response = await POST(request({ place: "Example" }));
    expect(response.status).toBe(503);
    noProviders();
    expect(access).not.toHaveBeenCalled();
  });
  it("limited concurrent requests return clear retry information and make zero provider calls", async () => {
    access.mockImplementation(() => Promise.resolve(Response.json({ error: "Too many scoring requests. Try again in 30 seconds.", code: "CLIENT_RATE_LIMIT" }, { status: 429, headers: { "Retry-After": "30" } })));
    const responses = await Promise.all(Array.from({ length: 50 }, () => POST(request({ place: "Example", from: "Origin" }))));
    expect(responses.every(response => response.status === 429 && response.headers.get("retry-after") === "30")).toBe(true);
    noProviders();
  });
  it("cost-control outages fail closed", async () => {
    access.mockResolvedValue(Response.json({ error: "Unavailable" }, { status: 503 }));
    expect((await POST(request({ place: "Example" }))).status).toBe(503);
    noProviders();
  });
  it("keeps genuine zero results distinct from provider failures", async () => {
    lookup.mockResolvedValue(null);
    const response = await POST(request({ place: "Example" }));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "PLACE_NOT_FOUND" });
    expect(score).not.toHaveBeenCalled();
  });
  it.each([["configuration", 503], ["quota", 503], ["network", 502], ["response", 502]] as const)("returns controlled %s failure without misleading specificity advice", async (kind, status) => {
    lookup.mockRejectedValue(new ProviderError("places", kind, "fixed_fixture_code"));
    const response = await POST(request({ place: "Example" }));
    expect(response.status).toBe(status);
    const json = await response.json();
    expect(json.code).toBe(`PLACES_${kind.toUpperCase()}`);
    expect(json.error).not.toMatch(/more specific/);
    expect(score).not.toHaveBeenCalled();
  });
  it("handles route exceptions and failed scoring without exposing raw exceptions", async () => {
    distance.mockRejectedValueOnce(new ProviderError("routes", "network", "fetch_failed"));
    expect((await POST(request({ place: "Example", from: "Origin" }))).status).toBe(502);
    score.mockRejectedValueOnce(new Error("private upstream text"));
    const response = await POST(request({ place: "Example" }));
    expect(response.status).toBe(502);
    expect(JSON.stringify(await response.json())).not.toContain("private upstream text");
    expect(console.error).not.toHaveBeenCalledWith(expect.anything(), expect.any(Error));
  });
  it("returns committed resolved facts with unknown travel when no origin is supplied", async () => {
    const response = await POST(request({ place: " Example " }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ fire: 8, schlep: 3, verdict: "Legendary Haul", place_name: "Example", resolvedPlace: { name: "Example", lat: 37, lng: -122 }, evidence: { provider: "google_maps", assessment: "ai_estimate" }, legs: [], mode_estimates: [], distance_note: "Travel time unknown" });
    expect(lookup).toHaveBeenCalledWith("Example");
    expect(distance).not.toHaveBeenCalled();
    expect(score).toHaveBeenCalledTimes(1);
  });
  it.each([undefined, "walking", "transit"])("selects an available coherent initial mode for preference %s", async mode => {
    distance.mockResolvedValue({ legs: [
      { mode: "driving", duration: "30 mins", distance: "20 km", durationSeconds: 1800 },
      { mode: "walking", duration: "3 hours", distance: "15 km", durationSeconds: 10800 },
    ] });
    score.mockResolvedValue({ ...validScore, mode_estimates: [{ mode: "driving", schlep: 3, reason: "Driving estimate." }, { mode: "walking", schlep: 9, reason: "Walking estimate." }] });
    const response = await POST(request({ place: " Example ", from: " Origin ", mode }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ fire: 8, schlep: mode === "walking" ? 9 : 3, verdict: mode === "walking" ? "Hard Pass" : "Legendary Haul", selected_mode: mode === "walking" ? "walking" : "driving", from: "Origin" });
    expect(lookup).toHaveBeenCalledTimes(1);
    expect(distance).toHaveBeenCalledWith("Origin", expect.objectContaining({ name: "Example" }));
    expect(score).toHaveBeenCalledTimes(1);
  });
  it("fails controlled when supplied-mode estimates are incomplete or scores are invalid", async () => {
    distance.mockResolvedValue({ legs: [{ mode: "walking", duration: "30 mins", distance: "2 km", durationSeconds: 1800 }] });
    expect((await POST(request({ place: "Example", from: "Origin" }))).status).toBe(502);
    distance.mockResolvedValue(null);
    score.mockResolvedValue({ ...validScore, fire: 0 });
    expect((await POST(request({ place: "Example" }))).status).toBe(502);
  });
  it("preserves a one-sided valid coordinate without treating travel as measured", async () => {
    lookup.mockResolvedValue({ name: "Example", lat: 37 });
    distance.mockResolvedValue(null);
    const response = await POST(request({ place: "Example", from: "Origin" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ resolvedPlace: { name: "Example", lat: 37 }, distance_note: "Travel time unknown", from: "Origin" });
  });
});
