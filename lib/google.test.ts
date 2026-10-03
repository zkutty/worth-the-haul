import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { findPlace, getDistance } from "./google";

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubEnv("GOOGLE_MAPS_API_KEY", "fixture-key");
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("Google provider failure classification", () => {
  it("retains the first resolved branch with its address, ID, and supplied facts", async () => {
    const chosen = {
      name: "Same Name", formatted_address: "10 First St, City A", place_id: "branch-a",
      rating: 4.2, user_ratings_total: 40, price_level: 2,
      geometry: { location: { lat: 37, lng: -122 } },
    };
    fetchMock.mockResolvedValue(Response.json({ status: "OK", candidates: [chosen,
      { name: "Same Name", formatted_address: "20 Second St, City B", place_id: "branch-b" },
    ] }));
    expect(await findPlace("Same Name")).toEqual({
      name: chosen.name, formatted_address: chosen.formatted_address, place_id: chosen.place_id,
      rating: 4.2, user_ratings_total: 40, price_level: 2, lat: 37, lng: -122,
    });
    const request = new URL(fetchMock.mock.calls[0][0]);
    expect(request.searchParams.get("fields")?.split(",")).toContain("place_id");
    expect(request.searchParams.get("fields")?.split(",")).not.toContain("user_ratings_total");
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ cache: "no-store" });
  });
  it("leaves missing optional facts absent", async () => {
    fetchMock.mockResolvedValue(Response.json({ status: "OK", candidates: [{ name: "Sparse", rating: 4.2 }] }));
    expect(await findPlace("Sparse")).toEqual({ name: "Sparse", rating: 4.2 });
  });
  it.each([
    { rating: "4.2", user_ratings_total: -1, price_level: 5, geometry: { location: { lat: 91, lng: -181 } } },
    { rating: 0, user_ratings_total: 1.5, price_level: 2.5, geometry: { location: { lat: "37", lng: null } } },
    { rating: Infinity, user_ratings_total: Number.MAX_SAFE_INTEGER + 1, price_level: "2", geometry: { location: { lat: NaN, lng: Infinity } } },
    { rating: 5.1, user_ratings_total: "40", price_level: -1, formatted_address: 7, place_id: " " },
  ])("omits malformed optional facts without losing the candidate %#", async (invalid) => {
    // Custom json preserves non-finite numbers for boundary validation.
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ status: "OK", candidates: [{ name: "Sparse", ...invalid }] }) });
    expect(await findPlace("Sparse")).toEqual({ name: "Sparse" });
  });
  it("keeps actual supplied zero count/price and coordinate boundaries", async () => {
    fetchMock.mockResolvedValue(Response.json({ status: "OK", candidates: [{ name: "Boundary", rating: 1, user_ratings_total: 0, price_level: 0, geometry: { location: { lat: -90, lng: 180 } } }] }));
    expect(await findPlace("Boundary")).toMatchObject({ rating: 1, user_ratings_total: 0, price_level: 0, lat: -90, lng: 180 });
  });
  it("routes to the resolved ID before coordinates instead of another named branch", async () => {
    fetchMock.mockImplementation(async () => Response.json({ status: "OK", rows: [{ elements: [{ status: "OK", duration: { text: "10 mins", value: 600 }, distance: { text: "1 km" } }] }] }));
    expect((await getDistance("Origin", { name: "Same Name", place_id: "branch-a", lat: 37, lng: -122 }))?.legs).toHaveLength(4);
    for (const [url] of fetchMock.mock.calls) {
      expect(new URL(url).searchParams.get("destinations")).toBe("place_id:branch-a");
    }
  });
  it("uses validated coordinates only when no ID is supplied", async () => {
    fetchMock.mockImplementation(async () => Response.json({ status: "ZERO_RESULTS" }));
    await getDistance("Origin", { name: "Same Name", lat: 37, lng: -122 });
    expect(new URL(fetchMock.mock.calls[0][0]).searchParams.get("destinations")).toBe("37,-122");
  });
  it("does not route an ambiguous name without an ID or valid coordinate pair", async () => {
    expect(await getDistance("Origin", { name: "Same Name" })).toBeNull();
    expect(await getDistance("Origin", { name: "Same Name", lat: 91, lng: -122 })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("accepts a supported place and preserves source fields", async () => {
    fetchMock.mockResolvedValue(Response.json({ status: "OK", candidates: [{ name: "Benu", rating: 4.6, geometry: { location: { lat: 37, lng: -122 } } }] }));
    expect(await findPlace("Benu, SF")).toMatchObject({ name: "Benu", rating: 4.6, lat: 37, lng: -122 });
  });
  it("only genuine zero results are not found", async () => {
    fetchMock.mockResolvedValue(Response.json({ status: "ZERO_RESULTS", candidates: [] }));
    expect(await findPlace("fixture")).toBeNull();
    fetchMock.mockResolvedValue(Response.json({ status: "OK", candidates: [] }));
    await expect(findPlace("fixture")).rejects.toMatchObject({ kind: "response", code: "invalid_candidate" });
  });
  it.each([ ["REQUEST_DENIED", "configuration"], ["INVALID_REQUEST", "configuration"], ["OVER_QUERY_LIMIT", "quota"], ["OVER_DAILY_LIMIT", "quota"], ["UNKNOWN_ERROR", "response"] ])("classifies %s without leaking provider error text", async (status, kind) => {
    fetchMock.mockResolvedValue(Response.json({ status, error_message: "private provider details" }));
    await expect(findPlace("fixture")).rejects.toMatchObject({ kind });
    await expect(findPlace("fixture")).rejects.not.toThrow("private provider details");
  });
  it.each([[403, "configuration"], [429, "quota"], [503, "response"]])("classifies HTTP %s", async (status, kind) => {
    fetchMock.mockResolvedValue(new Response("private response", { status }));
    await expect(findPlace("fixture")).rejects.toMatchObject({ kind, code: `http_${status}` });
  });
  it.each([
    ["Legacy API is not enabled for private-project", "legacy_api_not_enabled"],
    ["Billing must be enabled on private-project", "billing_not_enabled"],
    ["The provided API key is invalid: private-key", "key_invalid"],
    ["API keys with referer restrictions cannot be used with this API", "key_referrer_restriction"],
    ["Requests from this IP address private-ip are blocked", "key_ip_restriction"],
    ["This API project is not authorized to use this API", "api_not_authorized"],
    ["private unknown details", "REQUEST_DENIED"],
  ])("records only a fixed denial classification", async (error_message, code) => {
    fetchMock.mockResolvedValue(Response.json({ status: "REQUEST_DENIED", error_message }));
    await expect(findPlace("fixture")).rejects.toMatchObject({ kind: "configuration", code });
    await expect(findPlace("fixture")).rejects.not.toThrow(error_message);
  });
  it("controls network exceptions, invalid JSON, and missing keys", async () => {
    fetchMock.mockRejectedValueOnce(new Error("secret key/url"));
    await expect(findPlace("fixture")).rejects.toMatchObject({ kind: "network", code: "fetch_failed" });
    fetchMock.mockResolvedValueOnce(new Response("not JSON"));
    await expect(findPlace("fixture")).rejects.toMatchObject({ kind: "response", code: "invalid_json" });
    vi.stubEnv("GOOGLE_MAPS_API_KEY", "");
    await expect(findPlace("fixture")).rejects.toMatchObject({ kind: "configuration", code: "missing_key" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it("distinguishes unavailable routes from operational route failures", async () => {
    fetchMock.mockImplementation(() => Promise.resolve(Response.json({ status: "OK", rows: [{ elements: [{ status: "ZERO_RESULTS" }] }] })));
    expect(await getDistance("fixture origin", { name: "fixture destination", place_id: "fixture-id" })).toBeNull();
    fetchMock.mockImplementation(() => Promise.resolve(Response.json({ status: "REQUEST_DENIED" })));
    await expect(getDistance("fixture origin", { name: "fixture destination", place_id: "fixture-id" })).rejects.toMatchObject({ provider: "routes", kind: "configuration" });
  });
});
