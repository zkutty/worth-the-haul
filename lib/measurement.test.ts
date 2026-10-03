import { afterEach, describe, expect, it, vi } from "vitest";
import { parseClientReceipt, parseMeasurementRow } from "./measurement-contract";
import { emitMeasurement, scoreMeasurement } from "./measurement";

const operation_id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const attempt_id = "bbbbbbbb-bbbb-4bbb-9bbb-bbbbbbbbbbbb";
const base = { v: 1, at: "2026-10-03T12:00:00.000Z", revision: "a".repeat(40), operation_id, attempt_id };
const rows = [
  { ...base, event: "score_start", traffic: "unclassified" },
  { ...base, event: "score_outcome", status: 200, outcome: "success", code: "SUCCESS", elapsed_ms: 0 },
  { ...base, event: "provider_start", provider: "places", call_id: operation_id },
  { ...base, event: "provider_finish", provider: "routes", call_id: operation_id, elapsed_ms: 86_400_000, result: "rejected" },
  { ...base, event: "decision_displayed", event_id: operation_id },
  { ...base, event: "mode_changed", event_id: operation_id, mode: "walking" },
];
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
describe("strict sanitized measurement contract", () => {
  it.each(rows)("accepts only exact valid fields for $event", row => {
    expect(parseMeasurementRow(row)).toEqual(row);
    expect(() => parseMeasurementRow({ ...row, query: "private" })).toThrow();
    const missing = { ...row } as Record<string, unknown>; delete missing.at;
    expect(() => parseMeasurementRow(missing)).toThrow();
  });
  it.each([
    { v: 2 }, { event: "unknown" }, { event: "constructor" }, { operation_id: "aaaaaaaa-aaaa-1aaa-8aaa-aaaaaaaaaaaa" },
    { attempt_id: "bbbbbbbb-bbbb-4bbb-7bbb-bbbbbbbbbbbb" }, { revision: "not-a-sha" },
    { at: "2026-10-03T12:00:00.000+00:00" }, { at: "2026-02-30T12:00:00.000Z" }, { at: "invalid" },
    { status: 99 }, { status: 600 }, { status: 200.1 }, { elapsed_ms: -1 }, { elapsed_ms: 86_400_001 }, { elapsed_ms: NaN },
    { elapsed_ms: Infinity }, { elapsed_ms: 1.1 }, { code: "PRIVATE_MESSAGE" }, { outcome: "anything" },
  ])("rejects invalid common/outcome field %#", change => {
    expect(() => parseMeasurementRow({ ...rows[1], ...change })).toThrow();
  });
  it.each([
    [{ ...rows[0], traffic: "organic" }], [{ ...rows[2], provider: "google" }],
    [{ ...rows[2], call_id: null }], [{ ...rows[3], result: "success" }],
    [{ ...rows[4], event_id: "x" }], [{ ...rows[5], mode: "flying" }],
  ])("rejects invalid event-specific values %#", row => expect(() => parseMeasurementRow(row)).toThrow());
  it("accepts null revision but rejects client-supplied common/server fields", () => {
    expect(parseMeasurementRow({ ...rows[0], revision: null })).toBeTruthy();
    const receipt = { event: "decision_displayed", operation_id, attempt_id, event_id: operation_id };
    expect(parseClientReceipt(receipt)).toEqual(receipt);
    expect(() => parseClientReceipt({ ...receipt, at: base.at })).toThrow();
    expect(() => parseClientReceipt({ ...receipt, revision: base.revision })).toThrow();
    expect(() => parseClientReceipt({ ...receipt, event: "score_start" })).toThrow();
  });
  it("drops invalid events and isolates console failures", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => { throw new Error("logging failed"); });
    expect(() => emitMeasurement({ ...rows[0], raw: "secret" })).not.toThrow();
    expect(log).not.toHaveBeenCalled();
    expect(() => emitMeasurement(rows[0])).not.toThrow();
  });
  it("replaces malformed IDs and classifies tags without copying arbitrary headers", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.stubEnv("WTH_REVISION", "bad private text");
    const context = scoreMeasurement(new Request("https://local/api/score", { headers: { "X-WTH-Operation-Id": "private", "X-WTH-Traffic": "secret" } }));
    const response = context.finish(new Response(null, { status: 400 }), "invalid", "private");
    const events = log.mock.calls.map(call => parseMeasurementRow(call[1]));
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({ traffic: "unclassified", revision: null });
    expect(events[1]).toMatchObject({ code: "UNKNOWN_FAILURE" });
    expect(response.headers.get("X-WTH-Operation-Id")).toBe(events[0].operation_id);
    expect(response.headers.get("X-WTH-Attempt-Id")).toBe(events[0].attempt_id);
    expect(JSON.stringify(events)).not.toContain("private");
  });
  it("preserves actual invocation results and errors when logging fails", async () => {
    vi.spyOn(console, "log").mockImplementation(() => { throw new Error("log failure"); });
    const context = scoreMeasurement(new Request("https://local/api/score"));
    await expect(context.wrap("places", async () => 42)).resolves.toBe(42);
    const failure = new Error("provider failure");
    await expect(context.wrap("model", async () => { throw failure; })).rejects.toBe(failure);
  });
});

describe("measurement setup failure isolation", () => {
  it("does not fail provider work or change response when UUID generation fails", async () => {
    vi.spyOn(crypto, "randomUUID").mockImplementation(() => { throw new Error("UUID unavailable"); });
    const context = scoreMeasurement(new Request("https://local/api/score"));
    await expect(context.wrap("model", async () => 42)).resolves.toBe(42);
    const response = Response.json({ ok: true });
    expect(context.finish(response, "success", "SUCCESS")).toBe(response);
  });
  it("does not fail scoring when the timer is unavailable", async () => {
    vi.spyOn(performance, "now").mockImplementation(() => { throw new Error("timer unavailable"); });
    const context = scoreMeasurement(new Request("https://local/api/score"));
    await expect(context.wrap("places", async () => 42)).resolves.toBe(42);
    expect(context.finish(Response.json({ ok: true }), "success", "SUCCESS").status).toBe(200);
  });
});
