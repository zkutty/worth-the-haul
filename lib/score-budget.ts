export const SCORE_BUDGET_OBJECT_NAME = "score-budget-v1";
const DAY_MS = 86_400_000;
const MAX_INTERNAL_BODY_BYTES = 256;
const CLEANUP_BATCH_SIZE = 128;

export interface ScoreBudgetEnv {
  SCORE_DAILY_LIMIT?: unknown;
  SCORE_CLIENT_LIMIT?: unknown;
  SCORE_CLIENT_WINDOW_SECONDS?: unknown;
  SCORE_ENABLED?: unknown;
}

export interface BudgetConfig {
  enabled: boolean;
  dailyLimit: number;
  clientLimit: number;
  clientWindowSeconds: number;
}

function integer(value: unknown, minimum: number, maximum = Number.MAX_SAFE_INTEGER): number {
  if (typeof value !== "string" || value.trim() !== value || !/^(0|[1-9]\d*)$/.test(value)) {
    throw new Error("Cost protection configuration is invalid.");
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error("Cost protection configuration is invalid.");
  }
  return parsed;
}

/** A daily cap is mandatory. Client windows are bounded to one day for salt retention. */
export function readBudgetConfig(env: ScoreBudgetEnv): BudgetConfig {
  const enabled = env.SCORE_ENABLED === undefined ? "true" : env.SCORE_ENABLED;
  if (enabled !== "true" && enabled !== "false") {
    throw new Error("Cost protection configuration is invalid.");
  }
  return {
    enabled: enabled === "true",
    dailyLimit: integer(env.SCORE_DAILY_LIMIT, 0),
    clientLimit: integer(env.SCORE_CLIENT_LIMIT === undefined ? "20" : env.SCORE_CLIENT_LIMIT, 1),
    clientWindowSeconds: integer(env.SCORE_CLIENT_WINDOW_SECONDS === undefined ? "60" : env.SCORE_CLIENT_WINDOW_SECONDS, 1, 86_400),
  };
}

// These structural types also work in regular TypeScript/Vitest without importing
// cloudflare:workers. Production must bind this class as a SQLite-backed DO.
export interface BudgetTransaction {
  get<T>(key: string): Promise<T | undefined>;
  put<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<boolean>;
  list<T>(options: { prefix: string; limit: number }): Promise<Map<string, T>>;
  getAlarm(): Promise<number | null>;
  setAlarm(time: number): Promise<void>;
}

export interface BudgetStorage extends BudgetTransaction {
  transaction<T>(callback: (transaction: BudgetTransaction) => Promise<T>): Promise<T>;
}

interface BudgetState {
  storage: BudgetStorage;
}

interface DailyCount {
  day: number;
  count: number;
  salt: string;
  previous?: { day: number; salt: string };
}

interface ClientWindow {
  count: number;
  expiresAt: number;
}

interface Expiry {
  clientKey: string;
  expiresAt: number;
}

type Decision =
  | { allowed: true }
  | { allowed: false; error: string; code: string; retryAfter?: number };

function response(decision: Decision, status: number): Response {
  const headers: Record<string, string> = { "Cache-Control": "no-store" };
  if (!decision.allowed && decision.retryAfter !== undefined) {
    headers["Retry-After"] = String(decision.retryAfter);
  }
  return Response.json(decision, { status, headers });
}

function unavailable(): Response {
  return response({
    allowed: false,
    error: "Scoring is temporarily unavailable. Please try again later.",
    code: "COST_PROTECTION_UNAVAILABLE",
  }, 503);
}

function newSalt(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function clientKey(day: number, salt: string, client: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${salt}\0${client.toLowerCase()}`));
  const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `client:${day}:${hash}`;
}

function expiryKey(key: string, expiresAt: number): string {
  return `expiry:${String(expiresAt).padStart(16, "0")}:${key}`;
}

function validDaily(value: DailyCount): boolean {
  return Number.isSafeInteger(value.day) && Number.isSafeInteger(value.count) && value.count >= 0 &&
    /^[a-f0-9]{64}$/.test(value.salt) &&
    (!value.previous || (value.previous.day === value.day - 1 && /^[a-f0-9]{64}$/.test(value.previous.salt)));
}

function validWindow(value: ClientWindow): boolean {
  return Number.isSafeInteger(value.count) && value.count > 0 && Number.isSafeInteger(value.expiresAt);
}

async function readClient(request: Request): Promise<string | null> {
  if (Number(request.headers.get("content-length")) > MAX_INTERNAL_BODY_BYTES || !request.body) return null;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > MAX_INTERNAL_BODY_BYTES) {
      void reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    const body: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (body === null || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length !== 1) return null;
    const client = (body as { client?: unknown }).client;
    // The caller supplies the trusted CF IP; reject unbounded or non-IP-shaped
    // identities here as well. No raw identity is written or included in errors.
    return typeof client === "string" && (client === "unknown" ||
      (client.trim() === client && /^[0-9a-fA-F:.]{3,45}$/.test(client) && /[.:]/.test(client))) ? client : null;
  } catch {
    return null;
  }
}

/** Reservations are consumed before providers, including when providers fail. No refunds. */
export class ScoreBudget {
  constructor(private readonly state: BudgetState, private readonly env: ScoreBudgetEnv) {}

  async fetch(request: Request): Promise<Response> {
    if (this.env.SCORE_ENABLED === "false") {
      return response({ allowed: false, error: "Scoring is paused. Please try again later.", code: "SCORING_PAUSED" }, 503);
    }
    let config: BudgetConfig;
    try {
      config = readBudgetConfig(this.env);
    } catch {
      return unavailable();
    }
    if (request.method !== "POST") {
      return response({ allowed: false, error: "Invalid budget request.", code: "INVALID_BUDGET_REQUEST" }, 405);
    }
    try {
      const client = await readClient(request);
      if (client === null) {
        return response({ allowed: false, error: "Invalid budget request.", code: "INVALID_BUDGET_REQUEST" }, 400);
      }
      const decision = await this.state.storage.transaction(async (transaction): Promise<Decision> => {
        // Capture time inside the transaction; requests waiting for the lock must
        // use their admission time when deciding the day and window boundaries.
        const now = Date.now();
        const day = Math.floor(now / DAY_MS);
        const stored = await transaction.get<DailyCount>("daily");
        if (stored && (!validDaily(stored) || stored.day > day)) throw new Error("Invalid budget state.");
        const daily: DailyCount = stored?.day === day ? stored : {
          day, count: 0, salt: newSalt(),
          ...(stored?.day === day - 1 ? { previous: { day: stored.day, salt: stored.salt } } : {}),
        };
        const key = await clientKey(day, daily.salt, client);
        const current = await transaction.get<ClientWindow>(key);
        if (current && !validWindow(current)) throw new Error("Invalid budget state.");
        let window = current && current.expiresAt > now ? current : undefined;
        let previousKey: string | undefined;
        let previous: ClientWindow | undefined;
        // Carry an active first-request window across UTC midnight while rotating
        // its hash. A maximum 24-hour window needs only the previous day's salt.
        if (!window && daily.previous) {
          previousKey = await clientKey(daily.previous.day, daily.previous.salt, client);
          previous = await transaction.get<ClientWindow>(previousKey);
          if (previous && !validWindow(previous)) throw new Error("Invalid budget state.");
          if (previous && previous.expiresAt > now) window = previous;
        }
        const clientExhausted = !!window && window.count >= config.clientLimit;
        const dailyExhausted = daily.count >= config.dailyLimit;
        if (dailyExhausted || clientExhausted) {
          const retryAt = Math.max(dailyExhausted ? (day + 1) * DAY_MS : 0, clientExhausted ? window!.expiresAt : 0);
          const retryAfter = Math.max(1, Math.ceil((retryAt - now) / 1000));
          return {
            allowed: false,
            error: dailyExhausted ? "Today's scoring limit has been reached. Please try again later." : `Too many scoring requests. Try again in ${retryAfter} seconds.`,
            code: dailyExhausted ? "DAILY_SCORE_LIMIT" : "CLIENT_RATE_LIMIT",
            retryAfter,
          };
        }
        const next: ClientWindow = { count: (window?.count ?? 0) + 1, expiresAt: window?.expiresAt ?? now + config.clientWindowSeconds * 1000 };
        // Explicit transaction provides an atomic durable commit even though
        // WebCrypto hashing yields. No external I/O occurs inside this closure.
        // https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/#transaction
        if (current && current.expiresAt !== next.expiresAt) await transaction.delete(expiryKey(key, current.expiresAt));
        if (previousKey && previous) {
          await transaction.delete(previousKey);
          await transaction.delete(expiryKey(previousKey, previous.expiresAt));
        }
        await transaction.put(key, next);
        await transaction.put(expiryKey(key, next.expiresAt), { clientKey: key, expiresAt: next.expiresAt } satisfies Expiry);
        await transaction.put("daily", { ...daily, count: daily.count + 1 });
        const alarm = await transaction.getAlarm();
        if (alarm === null || alarm > next.expiresAt) await transaction.setAlarm(next.expiresAt);
        return { allowed: true };
      });
      return response(decision, decision.allowed ? 200 : 429);
    } catch {
      return unavailable();
    }
  }

  async alarm(): Promise<void> {
    await this.state.storage.transaction(async (transaction) => {
      const now = Date.now();
      const expirations = await transaction.list<Expiry>({ prefix: "expiry:", limit: CLEANUP_BATCH_SIZE });
      for (const [key, expiry] of expirations) {
        if (expiry.expiresAt > now) break;
        const client = await transaction.get<ClientWindow>(expiry.clientKey);
        // An older queued expiration cannot remove a renewed client window.
        if (client?.expiresAt === expiry.expiresAt) await transaction.delete(expiry.clientKey);
        await transaction.delete(key);
      }
      const next = (await transaction.list<Expiry>({ prefix: "expiry:", limit: 1 })).values().next().value;
      if (next) await transaction.setAlarm(Math.max(now + 1, next.expiresAt));
    });
  }
}
