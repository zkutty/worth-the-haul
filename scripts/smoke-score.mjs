// Uses only the public built-in examples. Never print keys, request bodies,
// customer locations, model text, or upstream error bodies.
const [baseUrl, expectedRevision] = process.argv.slice(2);
if (!baseUrl || !expectedRevision) {
  throw new Error("Usage: node scripts/smoke-score.mjs <base-url> <expected-revision>");
}
const base = new URL(baseUrl);
const cases = [
  { id: "example-seattle", place: "Din Tai Fung, Seattle", from: "Capitol Hill, Seattle" },
  { id: "example-sf", place: "Benu, SF", from: "Mission District, SF" },
  { id: "example-nyc", place: "Joe's Pizza, NYC", from: "Midtown Manhattan" },
];
const verdicts = ["Legendary Haul", "Worth It", "Barely Worth It", "Hard Pass"];
const health = await fetch(new URL("/api/health", base), { signal: AbortSignal.timeout(10_000) });
const readiness = await health.json();
if (!health.ok || !readiness.ready || readiness.revision !== expectedRevision) {
  throw new Error(`Readiness/revision gate failed: HTTP ${health.status}`);
}
console.log(JSON.stringify({ checkedAt: new Date().toISOString(), origin: base.origin, revision: readiness.revision, version: readiness.version, ready: true }));

for (const fixture of cases) {
  const started = Date.now();
  const response = await fetch(new URL("/api/score", base), {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ place: fixture.place, from: fixture.from }),
    signal: AbortSignal.timeout(65_000),
  });
  const result = await response.json();
  const usable = response.ok && [result.fire, result.schlep].every(value =>
    typeof value === "number" && Number.isFinite(value) && value >= 1 && value <= 10) &&
    verdicts.includes(result.verdict) &&
    [result.place_name, result.fire_reason, result.schlep_reason, result.verdict_reason].every(value =>
      typeof value === "string" && value.trim().length > 0) &&
    [result.fire_details, result.schlep_details, result.legs].every(Array.isArray);
  console.log(JSON.stringify({ id: fixture.id, httpStatus: response.status, usable, latencyMs: Date.now() - started, code: typeof result.code === "string" ? result.code : undefined }));
  if (!usable) throw new Error(`${fixture.id} did not complete a usable score`);
}
