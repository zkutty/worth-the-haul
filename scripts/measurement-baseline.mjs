#!/usr/bin/env node
// Read-only extractor for sanitized measurement rows. It never emits row data,
// identifiers, input paths, tail envelopes, or raw provider/application text.
import { createReadStream } from "node:fs";
import { readFile } from "node:fs/promises";
import { createInterface } from "node:readline";

const schema = JSON.parse(await readFile(new URL("../lib/measurement-schema.json", import.meta.url), "utf8"));
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA_40 = /^[0-9a-f]{40}$/i;
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const MAX_ELAPSED_MS = 86_400_000;

const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const finiteInt = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;
const enumValue = (value, values) => typeof value === "string" && values.includes(value);

function validTimestamp(value) {
  if (typeof value !== "string" || !ISO_UTC.test(value)) return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}

function validRevision(value) {
  return value === null || (typeof value === "string" && SHA_40.test(value));
}

/** Validate a row against the checked-in schema; return only a safe reason code. */
export function validateRow(row) {
  if (!row || typeof row !== "object" || Array.isArray(row)) return "not_object";
  if (!Number.isInteger(row.v) || row.v !== schema.version) return "version";
  if (!enumValue(row.event, Object.keys(schema.events))) return "event";
  if (Object.keys(row).some((key) => ![...schema.common, ...schema.events[row.event]].includes(key))) return "unknown_field";
  const expected = [...schema.common, ...schema.events[row.event]];
  if (Object.keys(row).length !== expected.length || expected.some((key) => !own(row, key))) return "shape";
  if (!validTimestamp(row.at)) return "timestamp";
  if (typeof row.operation_id !== "string" || !UUID_V4.test(row.operation_id) || typeof row.attempt_id !== "string" || !UUID_V4.test(row.attempt_id)) return "id";
  if (!validRevision(row.revision)) return "revision";

  switch (row.event) {
    case "score_start":
      return enumValue(row.traffic, schema.traffic) ? null : "traffic";
    case "score_outcome":
      if (!finiteInt(row.status, 100, 599)) return "status";
      if (!enumValue(row.outcome, schema.outcomes)) return "outcome";
      if (!enumValue(row.code, schema.codes)) return "code";
      return finiteInt(row.elapsed_ms, 0, MAX_ELAPSED_MS) ? null : "elapsed_ms";
    case "provider_start":
      if (!enumValue(row.provider, schema.providers)) return "provider";
      return typeof row.call_id === "string" && UUID_V4.test(row.call_id) ? null : "call_id";
    case "provider_finish":
      if (!enumValue(row.provider, schema.providers)) return "provider";
      if (typeof row.call_id !== "string" || !UUID_V4.test(row.call_id)) return "call_id";
      if (!finiteInt(row.elapsed_ms, 0, MAX_ELAPSED_MS)) return "elapsed_ms";
      return enumValue(row.result, schema.providerResults) ? null : "result";
    case "decision_displayed":
      return typeof row.event_id === "string" && UUID_V4.test(row.event_id) ? null : "event_id";
    case "mode_changed":
      if (typeof row.event_id !== "string" || !UUID_V4.test(row.event_id)) return "event_id";
      return enumValue(row.mode, schema.modes) ? null : "mode";
    default:
      return "event";
  }
}

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function dedupeKey(row) {
  switch (row.event) {
    case "score_start":
    case "score_outcome": return `${row.event}:${row.attempt_id}`;
    case "provider_start":
    case "provider_finish": return `${row.event}:${row.attempt_id}:${row.call_id}`;
    case "decision_displayed":
    case "mode_changed": return `${row.event}:${row.attempt_id}:${row.event_id}`;
  }
}

function utcMillis(value, option) {
  if (!validTimestamp(value)) throw new Error(`--${option} must be an ISO UTC timestamp ending in Z`);
  return Date.parse(value);
}

function validateOptions(options) {
  const fromMs = utcMillis(options.from, "from");
  const toMs = utcMillis(options.to, "to");
  if (toMs <= fromMs) throw new Error("--to must be later than --from");
  if (options.revision !== "null" && !SHA_40.test(options.revision)) throw new Error("--revision must be a 40-character SHA or null");
  if (!/^[a-z0-9][a-z0-9._-]{0,63}$/i.test(options.provenance ?? "")) throw new Error("--provenance must be a short label using letters, numbers, dot, underscore, or hyphen");
  if (!options.inputs?.length) throw new Error("At least one --input is required");
  return { fromMs, toMs, revision: options.revision === "null" ? null : options.revision.toLowerCase() };
}

function parseArgs(argv) {
  const options = { inputs: [], tail: false };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === "--tail") { options.tail = true; continue; }
    if (arg === "--help" || arg === "-h") { options.help = true; continue; }
    if (!["--input", "--from", "--to", "--revision", "--provenance"].includes(arg)) throw new Error("Unknown option");
    const value = argv[++index];
    if (!value || value.startsWith("--")) throw new Error("Missing option value");
    if (arg === "--input") options.inputs.push(value);
    else options[arg.slice(2)] = value;
  }
  return options;
}

function usage() {
  return "Usage: node scripts/measurement-baseline.mjs --input <sanitized.jsonl|-> [--input <file>] --from <UTC-Z> --to <UTC-Z> --revision <40-char-sha|null> --provenance <label> [--tail]";
}

/** Extract candidates only from Wrangler tail console log messages. */
export function extractTailRows(envelope) {
  if (!envelope || typeof envelope !== "object" || Array.isArray(envelope) || !Array.isArray(envelope.logs)) return [];
  const rows = [];
  for (const entry of envelope.logs) {
    if (!entry || typeof entry !== "object" || !Array.isArray(entry.message)) continue;
    const markerIndex = entry.message.indexOf("wth_measurement");
    if (markerIndex < 0) continue;
    for (const part of entry.message.slice(markerIndex + 1)) {
      if (part && typeof part === "object" && !Array.isArray(part)) {
        if (validateRow(part) === null) rows.push(part);
        continue;
      }
      if (typeof part !== "string") continue;
      try {
        const decoded = JSON.parse(part);
        if (Array.isArray(decoded)) rows.push(...decoded.filter((value) => value && typeof value === "object" && !Array.isArray(value)));
        else if (decoded && typeof decoded === "object") rows.push(decoded);
      } catch { /* Non-JSON console text is intentionally discarded. */ }
    }
  }
  return rows;
}

export async function* jsonDocuments(lines, { tail }) {
  if (!tail) {
    for await (const line of lines) {
      if (!line.trim()) continue;
      try { yield JSON.parse(line); } catch { yield null; }
    }
    return;
  }

  // Wrangler's JSON tail can pretty-print one envelope across many lines.
  // Frame one JSON value at a time while retaining only that value in memory.
  const maxEnvelopeChars = 1_000_000;
  let buffer = "";
  let depth = 0;
  let quoted = false;
  let escaped = false;
  let discarding = false;
  for await (const line of lines) {
    for (const char of `${line}\n`) {
      if (!buffer && !discarding) {
        if (/\s/.test(char)) continue;
        if (char !== "{" && char !== "[") continue;
        depth = 0; quoted = false; escaped = false;
      }
      if (discarding) {
        if (quoted) {
          if (escaped) escaped = false;
          else if (char === "\\") escaped = true;
          else if (char === '"') quoted = false;
        } else if (char === '"') quoted = true;
        else if (char === "{" || char === "[") depth++;
        else if (char === "}" || char === "]") depth--;
        if (depth <= 0) { discarding = false; buffer = ""; depth = 0; quoted = false; escaped = false; }
        continue;
      }
      buffer += char;
      if (buffer.length > maxEnvelopeChars) {
        buffer = ""; discarding = true; // Keep framing without saving the oversized tail payload.
      }
      if (quoted) {
        if (escaped) escaped = false;
        else if (char === "\\") escaped = true;
        else if (char === '"') quoted = false;
      } else if (char === '"') quoted = true;
      else if (char === "{" || char === "[") depth++;
      else if (char === "}" || char === "]") depth--;
      if (depth === 0 && buffer.trim()) {
        try { yield JSON.parse(buffer); } catch { yield null; }
        buffer = "";
      }
    }
  }
  if (buffer.trim() || discarding) yield null;
}

function providerTotals(starts) {
  return Object.fromEntries(schema.providers.map((provider) => [provider, starts.filter((row) => row.provider === provider).length]));
}

function rate(numerator, denominator) {
  return denominator === 0 ? null : numerator / denominator;
}

function durationSummary(values) {
  if (!values.length) return { matchedCount: 0, totalMs: 0, meanMs: null };
  const totalMs = values.reduce((sum, value) => sum + value, 0);
  return { matchedCount: values.length, totalMs, meanMs: totalMs / values.length };
}

/** Deterministically aggregate already-decoded JSON rows. */
export function aggregateRows(rows, options) {
  const { fromMs, toMs, revision } = validateOptions({ ...options, inputs: options.inputs ?? ["memory"] });
  const diagnostics = { invalidRows: 0, invalidReasons: {}, exactRepeatDuplicates: 0, conflictingDuplicateKeys: 0, revisionMismatchRows: 0, orphanEvents: 0 };
  const candidates = [];
  for (const row of rows) {
    const invalid = validateRow(row);
    if (invalid) {
      diagnostics.invalidRows++;
      diagnostics.invalidReasons[invalid] = (diagnostics.invalidReasons[invalid] ?? 0) + 1;
      continue;
    }
    if (row.revision !== revision) { diagnostics.revisionMismatchRows++; continue; }
    candidates.push(row);
  }

  const groups = new Map();
  for (const row of candidates) {
    const key = dedupeKey(row);
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }
  const cleanRows = [];
  for (const group of groups.values()) {
    const forms = new Set(group.map(stable));
    if (forms.size > 1) {
      diagnostics.conflictingDuplicateKeys++;
      continue;
    }
    diagnostics.exactRepeatDuplicates += group.length - 1;
    cleanRows.push(group[0]);
  }
  const usable = cleanRows;
  const windowStarts = usable.filter((row) => row.event === "score_start" && Date.parse(row.at) >= fromMs && Date.parse(row.at) < toMs);
  const cohortOperationIds = new Set(windowStarts.map((row) => row.operation_id));
  // Once an operation is admitted by a start in the window, include its other
  // attempts from the same revision even when their starts fall outside it.
  const cohortAttempts = usable.filter((row) => row.event === "score_start" && cohortOperationIds.has(row.operation_id));
  const attemptIds = new Set(cohortAttempts.map((row) => row.attempt_id));
  const operationByAttempt = new Map(cohortAttempts.map((row) => [row.attempt_id, row.operation_id]));
  const cohortRows = usable.filter((row) => attemptIds.has(row.attempt_id) && operationByAttempt.get(row.attempt_id) === row.operation_id);

  for (const row of usable) {
    if (row.event !== "score_start" && row.event !== "provider_finish" &&
      (!attemptIds.has(row.attempt_id) || operationByAttempt.get(row.attempt_id) !== row.operation_id)) diagnostics.orphanEvents++;
  }
  const outOfCohortProviderFinishes = usable.filter((row) => row.event === "provider_finish" &&
    (!attemptIds.has(row.attempt_id) || operationByAttempt.get(row.attempt_id) !== row.operation_id)).length;
  diagnostics.orphanEvents += outOfCohortProviderFinishes;

  const outcomesByAttempt = new Map(cohortRows.filter((row) => row.event === "score_outcome").map((row) => [row.attempt_id, row]));
  const successfulAttempts = new Set([...outcomesByAttempt].filter(([, row]) => row.outcome === "success").map(([id]) => id));
  const successfulOperations = new Set(cohortAttempts.filter((row) => successfulAttempts.has(row.attempt_id)).map((row) => row.operation_id));
  const displayedAttemptIds = new Set(cohortRows.filter((row) => row.event === "decision_displayed" && successfulAttempts.has(row.attempt_id)).map((row) => row.attempt_id));
  const displayedOperations = new Set(cohortAttempts.filter((row) => displayedAttemptIds.has(row.attempt_id)).map((row) => row.operation_id));
  const outcomeCount = cohortAttempts.filter((row) => outcomesByAttempt.has(row.attempt_id)).length;
  const outcomeClasses = new Map();
  for (const [attemptId, row] of outcomesByAttempt) {
    const key = `${row.outcome}/${row.code}`;
    const bucket = outcomeClasses.get(key) ?? { attempts: 0, operationIds: new Set() };
    bucket.attempts++;
    const operationId = operationByAttempt.get(attemptId);
    if (operationId) bucket.operationIds.add(operationId);
    outcomeClasses.set(key, bucket);
  }
  const outcomeDistribution = Object.fromEntries([...outcomeClasses].sort(([a], [b]) => a.localeCompare(b)).map(([key, bucket]) => [key, { attempts: bucket.attempts, logicalOperations: bucket.operationIds.size }]));

  const providerStarts = cohortRows.filter((row) => row.event === "provider_start");
  const providerFinishes = cohortRows.filter((row) => row.event === "provider_finish");
  const finishMap = new Map(providerFinishes.map((row) => [`${row.operation_id}:${row.attempt_id}:${row.call_id}`, row]));
  const matchedFinishes = providerStarts.map((start) => finishMap.get(`${start.operation_id}:${start.attempt_id}:${start.call_id}`)).filter((finish) => finish && providerStarts.some((start) => start.operation_id === finish.operation_id && start.attempt_id === finish.attempt_id && start.call_id === finish.call_id && start.provider === finish.provider));
  const matchedFinishKeys = new Set(matchedFinishes.map((row) => `${row.operation_id}:${row.attempt_id}:${row.call_id}`));
  const missingFinishes = providerStarts.filter((row) => !matchedFinishKeys.has(`${row.operation_id}:${row.attempt_id}:${row.call_id}`)).length;
  const orphanProviderFinishes = providerFinishes.filter((finish) => !providerStarts.some((start) => start.operation_id === finish.operation_id && start.attempt_id === finish.attempt_id && start.call_id === finish.call_id && start.provider === finish.provider)).length;
  diagnostics.orphanEvents += orphanProviderFinishes;
  const operationLatency = [...outcomesByAttempt.values()].map((row) => row.elapsed_ms);
  const trafficCounts = { controlled_smoke: cohortAttempts.filter((row) => row.traffic === "controlled_smoke").length, unclassified: cohortAttempts.filter((row) => row.traffic === "unclassified").length };

  return {
    schemaVersion: schema.version,
    window: { from: options.from, to: options.to, includesFrom: true, includesTo: false },
    revision,
    provenance: options.provenance,
    cohort: {
      attempts: cohortAttempts.length,
      logicalOperations: cohortOperationIds.size,
      windowStarts: windowStarts.length,
      traffic: trafficCounts,
      serverSuccessfulLogicalOperations: successfulOperations.size,
      serverSuccessRate: rate(successfulOperations.size, cohortOperationIds.size),
      displayedLogicalOperations: displayedOperations.size,
      displayRateAmongServerSuccessfulOperations: rate(displayedOperations.size, successfulOperations.size),
      matchedSuccessfulAttemptsDisplayed: displayedAttemptIds.size,
      matchedModeChangesOnSuccessfulAttempts: cohortRows.filter((row) => row.event === "mode_changed" && successfulAttempts.has(row.attempt_id)).length,
    },
    providerUsage: {
      starts: { total: providerStarts.length, byProvider: providerTotals(providerStarts) },
      startsPerCohortLogicalOperation: rate(providerStarts.length, cohortOperationIds.size),
      startsPerServerSuccessfulLogicalOperation: rate(providerStarts.length, successfulOperations.size),
      startsPerDisplayedLogicalOperation: rate(providerStarts.length, displayedOperations.size),
      finishes: { matched: matchedFinishes.length, missing: missingFinishes, resolved: matchedFinishes.filter((row) => row.result === "resolved").length, rejected: matchedFinishes.filter((row) => row.result === "rejected").length },
      providerDurationMs: durationSummary(matchedFinishes.map((row) => row.elapsed_ms)),
    },
    serverAttemptLatencyMs: durationSummary(operationLatency),
    eventCounts: {
      scoreStarts: cohortAttempts.length,
      scoreOutcomes: outcomeCount,
      decisionDisplayedReceipts: cohortRows.filter((row) => row.event === "decision_displayed" && successfulAttempts.has(row.attempt_id)).length,
      modeChangedReceipts: cohortRows.filter((row) => row.event === "mode_changed" && successfulAttempts.has(row.attempt_id)).length,
    },
    outcomeDistribution: {
      denominators: { attempts: cohortAttempts.length, logicalOperations: cohortOperationIds.size },
      byOutcomeAndCode: outcomeDistribution,
    },
    missingOutcomes: cohortAttempts.filter((row) => !outcomesByAttempt.has(row.attempt_id)).length,
    orphanReceipts: usable.filter((row) => ["decision_displayed", "mode_changed"].includes(row.event) &&
      (!attemptIds.has(row.attempt_id) || operationByAttempt.get(row.attempt_id) !== row.operation_id || !successfulAttempts.has(row.attempt_id))).length,
    unavailable: { shareContinuation: "pending_human_study_and_gated_implementation", organicTrafficClaims: "unavailable_without_trusted_provenance" },
    diagnostics,
    limitations: [
      "Client receipts are unauthenticated, lossy, and forgeable; displayed counts and rates are observed reports, not a trusted funnel or lower bound.",
      "Controlled smoke and unclassified traffic are separate; unclassified traffic is not evidence of organic use.",
      "Provider durations can overlap and must not be summed as operation latency.",
      "This aggregate contains no row identifiers and makes no adoption or billing-dollar claim.",
    ],
  };
}

async function* inputLines(input) {
  const source = input === "-" ? process.stdin : createReadStream(input, { encoding: "utf8" });
  const reader = createInterface({ input: source, crlfDelay: Infinity });
  for await (const line of reader) yield line;
}

async function main() {
  let options;
  try { options = parseArgs(process.argv.slice(2)); }
  catch (error) { process.stderr.write(`${error.message}\n${usage()}\n`); process.exitCode = 2; return; }
  if (options.help) { process.stdout.write(`${usage()}\n`); return; }
  try { validateOptions(options); }
  catch (error) { process.stderr.write(`${error.message}\n${usage()}\n`); process.exitCode = 2; return; }

  const rows = [];
  const ingestion = { malformedLines: 0, nonMeasurementTailLines: 0 };
  for (const input of options.inputs) {
    try {
      for await (const decoded of jsonDocuments(inputLines(input), { tail: options.tail })) {
        if (!decoded) { ingestion.malformedLines++; continue; }
        if (options.tail) {
          if (validateRow(decoded) === null) rows.push(decoded);
          else {
            const found = extractTailRows(decoded);
            if (!found.length) ingestion.nonMeasurementTailLines++;
            rows.push(...found);
          }
        } else rows.push(decoded);
      }
    } catch {
      process.stderr.write("Unable to read input stream.\n");
      process.exitCode = 2;
      return;
    }
  }
  const output = aggregateRows(rows, options);
  output.ingestion = ingestion;
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  if (output.diagnostics.invalidRows > 0 || output.diagnostics.conflictingDuplicateKeys > 0 ||
      output.diagnostics.revisionMismatchRows > 0 || output.ingestion.malformedLines > 0) process.exitCode = 1;
}

if (process.argv[1] && new URL(import.meta.url).pathname === process.argv[1]) await main();
