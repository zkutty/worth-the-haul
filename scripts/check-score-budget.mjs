// Actual workerd + SQLite-backed Durable Objects. Only local provider stubs run.
// Output is aggregate counts; no client identifiers, request content or credentials.
import assert from "node:assert/strict";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { build } from "esbuild";
import { Miniflare, Log, LogLevel } from "miniflare";

const root = fileURLToPath(new URL("../", import.meta.url));
const bundled = await build({
  entryPoints: [path.join(root, "scripts/score-budget-harness.ts")],
  bundle: true, write: false, format: "esm", platform: "browser", target: "es2022",
});
const directory = await mkdtemp(path.join(tmpdir(), "score-budget-check-"));
// workerd's startup handles can be unref'd; keep Node alive until disposal.
const keepAlive = setInterval(() => {}, 1000);
const runtimes = new Set();
let providerCalls = 0;
let providerFailure = false;
function runtime(name, bindings) {
  const instance = new Miniflare({
    name: "score-budget-local-check", modules: true, script: bundled.outputFiles[0].text,
    compatibilityDate: "2025-03-01",
    durableObjects: { SCORE_BUDGET: { className: "ScoreBudget", useSQLite: true } },
    durableObjectsPersist: path.join(directory, name),
    bindings,
    serviceBindings: {
      TEST_PROVIDER: async () => {
        providerCalls++;
        return new Response("local stub", { status: providerFailure ? 503 : 200 });
      },
    },
    // Unexpected outbound network calls fail locally; nothing can spend money.
    outboundService: async () => { throw new Error("Unexpected outbound request in budget test"); },
    log: new Log(LogLevel.ERROR),
  });
  runtimes.add(instance);
  return instance;
}
async function reserve(instance, client = "192.0.2.1") {
  const result = await instance.dispatchFetch("http://score-budget.test/reserve", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ client }),
  });
  // Consume each body immediately rather than holding open 40+ HTTP streams.
  return { status: result.status, headers: result.headers, body: await result.json() };
}
async function wave(instance, count, distinct = false) {
  return Promise.all(Array.from({ length: count }, (_, index) => reserve(instance, distinct ? `192.0.2.${index + 1}` : undefined)));
}
async function checkWave(results, allowed, code) {
  assert.equal(results.filter((result) => result.status === 200).length, allowed);
  assert.equal(results.filter((result) => result.status === 429).length, results.length - allowed);
  for (const result of results) {
    const body = result.body;
    if (result.status === 200) assert.deepEqual(body, { allowed: true });
    else {
      assert.equal(body.code, code);
      assert.equal(body.allowed, false);
      assert.ok(Number.isInteger(body.retryAfter) && body.retryAfter > 0);
      assert.equal(result.headers.get("Retry-After"), String(body.retryAfter));
    }
  }
}

try {
  const client = runtime("client", { SCORE_DAILY_LIMIT: "100", SCORE_CLIENT_LIMIT: "20", SCORE_CLIENT_WINDOW_SECONDS: "2" });
  await checkWave(await wave(client, 45), 20, "CLIENT_RATE_LIMIT");
  assert.equal(providerCalls, 20 * 7);
  await delay(2100);
  await checkWave(await wave(client, 45), 20, "CLIENT_RATE_LIMIT");
  assert.equal(providerCalls, 40 * 7);
  console.log(JSON.stringify({ check: "client-concurrency-and-window-reset", requestsPerWave: 45, allowedPerWave: 20, waves: 2, stubCalls: 280, passed: true }));
  await client.dispose();
  runtimes.delete(client);

  providerCalls = 0;
  const dailyBindings = { SCORE_DAILY_LIMIT: "25", SCORE_CLIENT_LIMIT: "100", SCORE_CLIENT_WINDOW_SECONDS: "60" };
  const daily = runtime("daily", dailyBindings);
  await checkWave(await wave(daily, 48, true), 25, "DAILY_SCORE_LIMIT");
  assert.equal(providerCalls, 25 * 7);
  await daily.dispose();
  runtimes.delete(daily);
  const persistedFiles = await readdir(path.join(directory, "daily"), { recursive: true });
  assert.ok(persistedFiles.some((file) => String(file).endsWith(".sqlite")), "SQLite persistence was not created");
  const restarted = runtime("daily", dailyBindings);
  await checkWave(await wave(restarted, 42, true), 0, "DAILY_SCORE_LIMIT");
  assert.equal(providerCalls, 25 * 7);
  console.log(JSON.stringify({ check: "global-concurrency-and-persistent-cap", firstWaveRequests: 48, allowed: 25, deniedAfterRestart: 42, stubCalls: 175, sqlitePersistence: true, passed: true }));

  providerCalls = 0;
  providerFailure = true;
  const failed = runtime("failed", { SCORE_DAILY_LIMIT: "1" });
  assert.equal((await reserve(failed)).status, 503);
  providerFailure = false;
  const denied = await reserve(failed);
  assert.equal(denied.status, 429);
  assert.equal(denied.body.code, "DAILY_SCORE_LIMIT");
  assert.equal(providerCalls, 7);
  console.log(JSON.stringify({ check: "provider-failure-still-consumes-reservation", stubCalls: 7, passed: true }));

  providerCalls = 0;
  for (const [name, bindings, code] of [
    ["missing", {}, "COST_PROTECTION_UNAVAILABLE"],
    ["invalid", { SCORE_DAILY_LIMIT: "bad" }, "COST_PROTECTION_UNAVAILABLE"],
    ["paused", { SCORE_ENABLED: "false" }, "SCORING_PAUSED"],
  ]) {
    const closed = runtime(name, bindings);
    const result = await reserve(closed);
    assert.equal(result.status, 503);
    assert.equal(result.body.code, code);
    await closed.dispose();
    runtimes.delete(closed);
  }
  assert.equal(providerCalls, 0);
  console.log(JSON.stringify({ check: "fail-closed-config-and-kill-switch", stubCalls: 0, passed: true }));
} finally {
  await Promise.allSettled([...runtimes].map((instance) => instance.dispose()));
  await rm(directory, { recursive: true, force: true });
  clearInterval(keepAlive);
}
