// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { decisionFor } from "./decision";
import { parseScoreResult } from "./score-contract";
import { useScore } from "./use-score";
import type { ScoreRequest, ScoreResult } from "./types";

function fixture(name = "Resolved branch", from = "Original origin"): ScoreResult {
  return {
    fire: 8, schlep: 3, fire_reason: "AI estimate: appeal based on supplied rating.", fire_details: [],
    schlep_reason: "AI estimate: moderate driving effort.", schlep_details: ["AI estimate: based on Google route: driving · 30 mins · 20 km."],
    ...decisionFor(8, 3, "driving"), distance_note: "driving: 30 mins (20 km)",
    place_name: name, maps_query: encodeURIComponent(name), from,
    resolvedPlace: { name, formatted_address: "10 First St", place_id: "branch-a", rating: 4.2 },
    evidence: { provider: "google_maps", assessment: "ai_estimate" }, selected_mode: "driving",
    legs: [
      { mode: "driving", duration: "30 mins", distance: "20 km", durationSeconds: 1800 },
      { mode: "walking", duration: "3 hours", distance: "15 km", durationSeconds: 10800 },
    ],
    mode_estimates: [
      { mode: "driving", schlep: 3, reason: "AI estimate: moderate driving effort." },
      { mode: "walking", schlep: 9, reason: "AI estimate: high walking effort." },
    ],
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function respond(value: unknown, status = 200) { return Response.json(value, { status }); }

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("immutable client trip and synchronous mode selection", () => {
  it("captures trimmed input, and edited inputs cannot change mode trip, Fire or identity", async () => {
    const pending = deferred<Response>();
    const fetchMock = vi.fn().mockReturnValue(pending.promise);
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useScore());
    const input: ScoreRequest = { place: "  Typed original  ", from: " Original origin " };
    let search!: Promise<void>;
    act(() => { search = result.current.search(input); });
    input.place = "Edited destination";
    input.from = "Edited origin";
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ place: "Typed original", from: "Original origin" });
    await act(async () => { pending.resolve(respond(fixture())); await search; });
    const original = result.current.result;
    act(() => { result.current.selectMode("walking"); result.current.selectMode("driving"); result.current.selectMode("walking"); });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.current.result).toMatchObject({ place_name: "Resolved branch", from: "Original origin", fire: 8, schlep: 9, selected_mode: "walking", verdict: "Hard Pass", resolvedPlace: original?.resolvedPlace });
    expect(result.current.result?.fire_reason).toBe(original?.fire_reason);
    expect(result.current.result?.verdict_reason).toContain("0.89 for walking");
    expect(result.current.loading).toBe(false);
    expect(result.current.completedSearchId).toBe(1);
    expect(Object.isFrozen(result.current.result?.resolvedPlace)).toBe(true);
    expect(Object.isFrozen(result.current.result?.mode_estimates)).toBe(true);
    act(() => result.current.selectMode("transit"));
    expect(result.current.result?.selected_mode).toBe("walking");
  });
  it.each(["older-first", "latest-first"])("keeps latest request authoritative when completion order is %s", async order => {
    const older = deferred<Response>();
    const latest = deferred<Response>();
    const fetchMock = vi.fn().mockReturnValueOnce(older.promise).mockReturnValueOnce(latest.promise);
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useScore());
    let oldSearch!: Promise<void>; let newSearch!: Promise<void>;
    act(() => { oldSearch = result.current.search({ place: "Old", from: "Old origin" }); });
    act(() => { newSearch = result.current.search({ place: "Latest", from: "New origin" }); });
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
    if (order === "older-first") {
      await act(async () => { older.resolve(respond(fixture("Old", "Old origin"))); await oldSearch; });
      expect(result.current.loading).toBe(true);
      expect(result.current.result).toBeNull();
      await act(async () => { latest.resolve(respond(fixture("Latest", "New origin"))); await newSearch; });
    } else {
      await act(async () => { latest.resolve(respond(fixture("Latest", "New origin"))); await newSearch; });
      act(() => result.current.selectMode("walking"));
      await act(async () => { older.resolve(respond(fixture("Old", "Old origin"))); await oldSearch; });
      expect(result.current.result?.selected_mode).toBe("walking");
    }
    expect(result.current.result).toMatchObject({ place_name: "Latest", from: "New origin", fire: 8 });
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.completedSearchId).toBe(2);
  });
  it("stale errors/finally cannot replace a newer result or clear loading", async () => {
    const older = deferred<Response>(); const latest = deferred<Response>();
    vi.stubGlobal("fetch", vi.fn().mockReturnValueOnce(older.promise).mockReturnValueOnce(latest.promise));
    const { result } = renderHook(() => useScore());
    let oldSearch!: Promise<void>; let newSearch!: Promise<void>;
    act(() => { oldSearch = result.current.search({ place: "Old" }); newSearch = result.current.search({ place: "Latest", from: "Original origin" }); });
    await act(async () => { older.reject(new TypeError("Stale network failure")); await oldSearch; });
    expect(result.current.loading).toBe(true);
    expect(result.current.error).toBeNull();
    await act(async () => { latest.resolve(respond(fixture())); await newSearch; });
    expect(result.current.result?.place_name).toBe("Resolved branch");
    expect(result.current.loading).toBe(false);
  });
  it("new searches clear old results immediately, and a latest failure leaves no old decision", async () => {
    const latest = deferred<Response>();
    const fetchMock = vi.fn().mockResolvedValueOnce(respond(fixture())).mockReturnValueOnce(latest.promise);
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useScore());
    await act(async () => { await result.current.search({ place: "Original", from: "Original origin" }); });
    act(() => result.current.selectMode("walking"));
    let search!: Promise<void>;
    act(() => { search = result.current.search({ place: "Fresh", from: "Fresh origin" }); });
    expect(result.current.result).toBeNull();
    expect(result.current.loading).toBe(true);
    act(() => result.current.selectMode("driving"));
    await act(async () => { latest.resolve(respond({ error: "Place not found." }, 400)); await search; });
    expect(result.current.error).toBe("Place not found.");
    expect(result.current.result).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it("preserves honest unknown travel when no route or origin is supplied", async () => {
    const unknown = { ...fixture(), ...decisionFor(8, 3), legs: [], mode_estimates: [], distance_note: "Travel time unknown",
      schlep_reason: "AI estimate: travel effort unknown without an available route.", schlep_details: ["AI estimate: limited; travel time unknown."] };
    delete (unknown as Partial<ScoreResult>).from;
    delete (unknown as Partial<ScoreResult>).selected_mode;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respond(unknown)));
    const { result } = renderHook(() => useScore());
    await act(async () => { await result.current.search({ place: "Original" }); });
    expect(result.current.error).toBeNull();
    expect(result.current.result?.selected_mode).toBeUndefined();
    expect(result.current.result?.distance_note).toBe("Travel time unknown");
  });
});

describe("strict response validation", () => {
  const malformed: Record<string, unknown>[] = [
    { evidence: undefined }, { evidence: { provider: "google_maps", assessment: "measured" } },
    { fire: "8" }, { fire: 0 }, { schlep: 4 }, { selected_mode: "transit" }, { mode_estimates: [] },
    { resolvedPlace: { name: "Different identity" } }, { maps_query: "Edited%20place" },
    { lat: 40 }, { verdict: "Worth It" }, { verdict_reason: "AI estimate: fabricated verdict." },
    { fire_reason: "Measured quality." }, { from: "Spoofed origin" }, { knownPlace: {} },
    { legs: [{ mode: "driving", duration: "30 mins", distance: "20 km", durationSeconds: NaN }] },
  ];
  it.each(malformed)("controls malformed or inconsistent successful response %#", async changes => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respond({ ...fixture(), ...changes })));
    const { result } = renderHook(() => useScore());
    await act(async () => { await result.current.search({ place: "Original", from: "Original origin" }); });
    expect(result.current.result).toBeNull();
    expect(result.current.error).toBe("Scoring returned an unusable result. Please try again.");
    expect(result.current.loading).toBe(false);
  });
  it("keeps supplied zero rating count but rejects a fabricated zero rating", () => {
    expect(parseScoreResult({ ...fixture(), resolvedPlace: { ...fixture().resolvedPlace, user_ratings_total: 0 } }).resolvedPlace?.user_ratings_total).toBe(0);
    expect(() => parseScoreResult({ ...fixture(), resolvedPlace: { ...fixture().resolvedPlace, rating: 0 } })).toThrow("rating");
  });
  it("handles malformed JSON and latest network failures without leaving loading stuck", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response("not json")).mockRejectedValueOnce(new TypeError("Fetch failed")));
    const { result } = renderHook(() => useScore());
    await act(async () => { await result.current.search({ place: "Original" }); });
    expect(result.current.error).toContain("unusable result");
    await act(async () => { await result.current.search({ place: "Fresh" }); });
    expect(result.current.error).toBe("Network error. Try again.");
    expect(result.current.loading).toBe(false);
  });
});
