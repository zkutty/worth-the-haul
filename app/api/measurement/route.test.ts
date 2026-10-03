import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
import { parseMeasurementRow } from "@/lib/measurement-contract";
const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const receipt = { event: "decision_displayed", operation_id: id, attempt_id: id, event_id: id };
const request = (value: unknown) => new Request("https://local/api/measurement", { method: "POST", body: JSON.stringify(value) });
beforeEach(() => { vi.spyOn(console, "log").mockImplementation(() => {}); vi.stubGlobal("fetch", vi.fn()); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
describe("bounded client receipt endpoint", () => {
  it.each([receipt, { ...receipt, event: "mode_changed", mode: "walking" }])("stamps valid receipt time/revision and emits only the allowlist", async value => {
    const response = await POST(request(value));
    expect(response.status).toBe(204);
    const row = parseMeasurementRow(vi.mocked(console.log).mock.calls[0][1]);
    expect(row).toMatchObject(value);
    expect(row.at).toMatch(/Z$/);
    expect(row).toHaveProperty("revision");
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each([null, [], {}, { ...receipt, query: "private" }, { ...receipt, at: "private" },
    { ...receipt, revision: null }, { ...receipt, event: "score_start" }, { ...receipt, mode: "walking" },
    { ...receipt, event_id: "bad" }, { ...receipt, event: "mode_changed", mode: "flying" },
  ])("rejects invalid receipt %# without logging or providers", async value => {
    expect((await POST(request(value))).status).toBe(400);
    expect(console.log).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("bounds both advertised and streamed UTF-8 bytes, including absent content-length", async () => {
    const advertised = new Request("https://local", { method: "POST", headers: { "content-length": "1025" }, body: "{}" });
    expect((await POST(advertised)).status).toBe(413);
    expect((await POST(new Request("https://local", { method: "POST", body: "é".repeat(513) }))).status).toBe(413);
    expect((await POST(new Request("https://local", { method: "POST", body: "{" }))).status).toBe(400);
    expect(console.log).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
  });
  it("returns success despite loss of custom logging", async () => {
    vi.mocked(console.log).mockImplementation(() => { throw new Error("unavailable"); });
    expect((await POST(request(receipt))).status).toBe(204);
  });
});
