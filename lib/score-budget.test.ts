import { afterEach, describe, expect, it, vi } from "vitest";
import { readBudgetConfig, ScoreBudget, type BudgetStorage, type BudgetTransaction, type ScoreBudgetEnv } from "./score-budget";

class MemoryTransaction implements BudgetTransaction {
  constructor(public values = new Map<string, unknown>(), public alarmTime: number | null = null) {}
  async get<T>(key: string): Promise<T | undefined> { return structuredClone(this.values.get(key)) as T | undefined; }
  async put<T>(key: string, value: T): Promise<void> { this.values.set(key, structuredClone(value)); }
  async delete(key: string): Promise<boolean> { return this.values.delete(key); }
  async list<T>({ prefix, limit }: { prefix: string; limit: number }): Promise<Map<string, T>> {
    return new Map([...this.values.entries()].filter(([key]) => key.startsWith(prefix)).sort(([a], [b]) => a.localeCompare(b)).slice(0, limit)) as Map<string, T>;
  }
  async getAlarm(): Promise<number | null> { return this.alarmTime; }
  async setAlarm(time: number): Promise<void> { this.alarmTime = time; }
}

class MemoryStorage extends MemoryTransaction implements BudgetStorage {
  private pending: Promise<unknown> = Promise.resolve();
  failCommit = false;
  transaction<T>(callback: (transaction: BudgetTransaction) => Promise<T>): Promise<T> {
    const result = this.pending.then(async () => {
      const transaction = new MemoryTransaction(structuredClone(this.values), this.alarmTime);
      const value = await callback(transaction);
      if (this.failCommit) throw new Error("Storage failure with private details");
      this.values = transaction.values;
      this.alarmTime = transaction.alarmTime;
      return value;
    });
    this.pending = result.catch(() => undefined);
    return result;
  }
}

const env = { SCORE_DAILY_LIMIT: "100" };
const client = "192.0.2.1";
const start = Date.UTC(2026, 9, 3, 12);
function reserve(budget: ScoreBudget, identity = client, extra?: Record<string, unknown>): Promise<Response> {
  return budget.fetch(new Request("https://score-budget.internal/reserve", {
    method: "POST", body: JSON.stringify({ client: identity, ...extra }),
  }));
}
function setup(config: ScoreBudgetEnv = env, storage = new MemoryStorage()) {
  vi.spyOn(Date, "now").mockReturnValue(start);
  return { storage, budget: new ScoreBudget({ storage }, config) };
}
afterEach(() => vi.restoreAllMocks());

describe("readBudgetConfig", () => {
  it("requires the global cap and provides the historic client defaults", () => {
    expect(readBudgetConfig({ SCORE_DAILY_LIMIT: "0" })).toEqual({ enabled: true, dailyLimit: 0, clientLimit: 20, clientWindowSeconds: 60 });
    expect(readBudgetConfig({ SCORE_DAILY_LIMIT: "45", SCORE_ENABLED: "false", SCORE_CLIENT_LIMIT: "7", SCORE_CLIENT_WINDOW_SECONDS: "3" })).toEqual({ enabled: false, dailyLimit: 45, clientLimit: 7, clientWindowSeconds: 3 });
    expect(readBudgetConfig({ SCORE_DAILY_LIMIT: String(Number.MAX_SAFE_INTEGER), SCORE_CLIENT_WINDOW_SECONDS: "86400" }).dailyLimit).toBe(Number.MAX_SAFE_INTEGER);
  });

  it.each([undefined, null, 5, "", "-1", "1.5", "NaN", "Infinity", "1e2", " 5", "5 ", "5\n", "05", "+5", "9007199254740992"])("rejects invalid daily cap %#", (value) => {
    expect(() => readBudgetConfig({ SCORE_DAILY_LIMIT: value })).toThrow("Cost protection configuration is invalid.");
  });

  it.each([
    { SCORE_ENABLED: "yes" }, { SCORE_ENABLED: true }, { SCORE_ENABLED: null },
    { SCORE_CLIENT_LIMIT: "0" }, { SCORE_CLIENT_LIMIT: "-1" }, { SCORE_CLIENT_LIMIT: "1.1" }, { SCORE_CLIENT_LIMIT: null },
    { SCORE_CLIENT_WINDOW_SECONDS: "0" }, { SCORE_CLIENT_WINDOW_SECONDS: "86401" }, { SCORE_CLIENT_WINDOW_SECONDS: "1e2" }, { SCORE_CLIENT_WINDOW_SECONDS: null },
  ])("rejects invalid optional configuration %#", (invalid) => {
    expect(() => readBudgetConfig({ ...env, ...invalid })).toThrow("Cost protection configuration is invalid.");
  });
});

describe("ScoreBudget", () => {
  it.each([{}, { SCORE_DAILY_LIMIT: "bad" }, { SCORE_DAILY_LIMIT: "-1" }])("fails closed for missing or invalid global cap %#", async (config) => {
    const { budget, storage } = setup(config);
    const result = await reserve(budget);
    expect(result.status).toBe(503);
    expect(await result.json()).toMatchObject({ allowed: false, code: "COST_PROTECTION_UNAVAILABLE" });
    expect(storage.values.size).toBe(0);
  });

  it("stops all reservations immediately with the kill switch", async () => {
    const { budget, storage } = setup({ SCORE_ENABLED: "false" });
    const result = await reserve(budget);
    expect(result.status).toBe(503);
    expect(await result.json()).toMatchObject({ allowed: false, code: "SCORING_PAUSED" });
    expect(storage.values.size).toBe(0);
  });

  it("admits exactly the client threshold and rejects without consuming daily budget", async () => {
    const { budget, storage } = setup();
    const responses = await Promise.all(Array.from({ length: 45 }, () => reserve(budget)));
    expect(responses.filter((result) => result.status === 200)).toHaveLength(20);
    expect(responses.filter((result) => result.status === 429)).toHaveLength(25);
    const rejected = responses.find((result) => result.status === 429)!;
    expect(rejected.headers.get("Retry-After")).toBe("60");
    expect(await rejected.json()).toEqual({ allowed: false, error: "Too many scoring requests. Try again in 60 seconds.", code: "CLIENT_RATE_LIMIT", retryAfter: 60 });
    expect(await storage.get("daily")).toMatchObject({ count: 20 });
  });

  it("enforces the global threshold across distinct clients", async () => {
    const { budget, storage } = setup({ SCORE_DAILY_LIMIT: "25", SCORE_CLIENT_LIMIT: "100" });
    const results = await Promise.all(Array.from({ length: 48 }, (_, i) => reserve(budget, `192.0.2.${i + 1}`)));
    expect(results.filter((result) => result.status === 200)).toHaveLength(25);
    expect(results.filter((result) => result.status === 429)).toHaveLength(23);
    const rejected = results.find((result) => result.status === 429)!;
    expect(rejected.headers.get("Retry-After")).toBe("43200");
    expect(await rejected.json()).toMatchObject({ code: "DAILY_SCORE_LIMIT", retryAfter: 43200 });
    expect(await storage.get("daily")).toMatchObject({ count: 25 });
  });

  it("consumes successful reservations permanently, including after a restart or provider failure", async () => {
    const { budget, storage } = setup({ SCORE_DAILY_LIMIT: "1" });
    expect((await reserve(budget)).status).toBe(200);
    const restarted = new ScoreBudget({ storage }, { SCORE_DAILY_LIMIT: "1" });
    const denied = await reserve(restarted, "192.0.2.2");
    expect(denied.status).toBe(429);
    expect(await storage.get("daily")).toMatchObject({ count: 1 });
  });

  it("anchors client windows to the first admission, rounds Retry-After up, and admits at exact expiry", async () => {
    const { budget, storage } = setup({ SCORE_DAILY_LIMIT: "100", SCORE_CLIENT_LIMIT: "2" });
    expect((await reserve(budget)).status).toBe(200);
    vi.mocked(Date.now).mockReturnValue(start + 30_000);
    expect((await reserve(budget)).status).toBe(200);
    vi.mocked(Date.now).mockReturnValue(start + 59_001);
    const denied = await reserve(budget);
    expect(denied.headers.get("Retry-After")).toBe("1");
    expect(await storage.get("daily")).toMatchObject({ count: 2 });
    vi.mocked(Date.now).mockReturnValue(start + 60_000);
    expect((await reserve(budget)).status).toBe(200);
    expect(await storage.get("daily")).toMatchObject({ count: 3 });
  });

  it("resets the daily cap at UTC midnight and rotates hashes while preserving the client window", async () => {
    const { budget, storage } = setup({ SCORE_DAILY_LIMIT: "2", SCORE_CLIENT_LIMIT: "2" });
    const midnight = Date.UTC(2026, 9, 4);
    vi.mocked(Date.now).mockReturnValue(midnight - 20_000);
    expect((await reserve(budget)).status).toBe(200);
    const oldKey = [...storage.values.keys()].find((key) => key.startsWith("client:"))!;
    const oldSalt = (await storage.get<{ salt: string }>("daily"))!.salt;
    vi.mocked(Date.now).mockReturnValue(midnight + 5_000);
    expect((await reserve(budget)).status).toBe(200);
    expect(storage.values.has(oldKey)).toBe(false);
    expect((await storage.get<{ salt: string }>("daily"))!.salt).not.toBe(oldSalt);
    expect(await storage.get("daily")).toMatchObject({ count: 1 });
    const denied = await reserve(budget);
    expect(denied.status).toBe(429);
    expect(denied.headers.get("Retry-After")).toBe("35");
    vi.mocked(Date.now).mockReturnValue(midnight + 40_000);
    expect((await reserve(budget)).status).toBe(200);
  });

  it("uses the later reset when both daily and client limits are exhausted", async () => {
    const { budget } = setup({ SCORE_DAILY_LIMIT: "1", SCORE_CLIENT_LIMIT: "1" });
    const midnight = Date.UTC(2026, 9, 4);
    vi.mocked(Date.now).mockReturnValue(midnight - 10_000);
    expect((await reserve(budget)).status).toBe(200);
    const denied = await reserve(budget);
    expect(denied.headers.get("Retry-After")).toBe("60");
    expect(await denied.json()).toMatchObject({ code: "DAILY_SCORE_LIMIT" });
  });

  it("permits no reservations for a zero cap", async () => {
    const { budget, storage } = setup({ SCORE_DAILY_LIMIT: "0" });
    expect((await reserve(budget)).status).toBe(429);
    expect(storage.values.size).toBe(0);
  });

  it.each(["", "name", "192.0.2.1 ", "192.0.2.1\n", "x".repeat(100), "192.0.2.1,192.0.2.2"])("rejects invalid internal identity %# without storage", async (identity) => {
    const { budget, storage } = setup();
    const result = await reserve(budget, identity);
    expect(result.status).toBe(400);
    expect(await result.json()).toEqual({ allowed: false, error: "Invalid budget request.", code: "INVALID_BUDGET_REQUEST" });
    expect(storage.values.size).toBe(0);
  });

  it("rejects caller thresholds and oversized payloads instead of trusting them", async () => {
    const { budget, storage } = setup();
    expect((await reserve(budget, client, { dailyLimit: 500 })).status).toBe(400);
    expect((await reserve(budget, client, { secret: "s".repeat(500) })).status).toBe(400);
    expect((await budget.fetch(new Request("https://score-budget.internal", { method: "GET" }))).status).toBe(405);
    expect((await budget.fetch(new Request("https://score-budget.internal", { method: "POST", body: "{broken" }))).status).toBe(400);
    expect(storage.values.size).toBe(0);
  });

  it("stores only salted SHA256 client keys and aggregate counts", async () => {
    const { budget, storage } = setup();
    const result = await reserve(budget);
    expect(result.headers.get("Cache-Control")).toBe("no-store");
    expect(await result.json()).toEqual({ allowed: true });
    const keys = [...storage.values.keys()];
    expect(keys.find((key) => key.startsWith("client:"))).toMatch(/^client:\d+:[a-f0-9]{64}$/);
    expect(JSON.stringify([...storage.values.entries()])).not.toContain(client);
    expect(storage.alarmTime).toBe(start + 60_000);
  });

  it("accepts the caller's conservative shared bucket when CF identity is unavailable", async () => {
    const { budget, storage } = setup({ SCORE_DAILY_LIMIT: "100", SCORE_CLIENT_LIMIT: "1" });
    expect((await reserve(budget, "unknown")).status).toBe(200);
    expect((await reserve(budget, "unknown")).status).toBe(429);
    expect(JSON.stringify([...storage.values.entries()])).not.toContain("unknown");
  });

  it("fails closed and rolls back both counters on storage failure", async () => {
    const { budget, storage } = setup();
    storage.failCommit = true;
    const result = await reserve(budget);
    expect(result.status).toBe(503);
    expect(JSON.stringify(await result.json())).not.toContain("private details");
    expect(storage.values.size).toBe(0);
    storage.failCommit = false;
    expect((await reserve(budget)).status).toBe(200);
  });

  it("fails closed on corrupt count state and clock reversal", async () => {
    const { budget, storage } = setup();
    await storage.put("daily", { day: Math.floor(start / 86_400_000), count: -1, salt: "a".repeat(64) });
    expect((await reserve(budget)).status).toBe(503);
    await storage.put("daily", { day: Math.floor(start / 86_400_000) + 1, count: 5, salt: "a".repeat(64) });
    expect((await reserve(budget)).status).toBe(503);
  });

  it("cleans expired hash history in bounded alarm batches while retaining the daily count", async () => {
    const { budget, storage } = setup({ SCORE_DAILY_LIMIT: "200", SCORE_CLIENT_WINDOW_SECONDS: "1" });
    for (let i = 0; i < 130; i++) expect((await reserve(budget, `192.0.2.${i + 1}`)).status).toBe(200);
    vi.mocked(Date.now).mockReturnValue(start + 1000);
    storage.alarmTime = null;
    await budget.alarm();
    expect([...storage.values.keys()].filter((key) => key.startsWith("client:"))).toHaveLength(2);
    expect(storage.alarmTime).toBe(start + 1001);
    storage.alarmTime = null;
    await budget.alarm();
    expect([...storage.values.keys()]).toEqual(["daily"]);
    expect(await storage.get("daily")).toMatchObject({ count: 130 });
    expect(storage.alarmTime).toBeNull();
  });
});
