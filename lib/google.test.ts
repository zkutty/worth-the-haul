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
    expect(await getDistance("fixture origin", { name: "fixture destination" })).toBeNull();
    fetchMock.mockImplementation(() => Promise.resolve(Response.json({ status: "REQUEST_DENIED" })));
    await expect(getDistance("fixture origin", { name: "fixture destination" })).rejects.toMatchObject({ provider: "routes", kind: "configuration" });
  });
});
