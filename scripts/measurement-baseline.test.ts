import { describe, expect, it } from "vitest";
import { aggregateRows, extractTailRows, jsonDocuments, validateRow } from "./measurement-baseline.mjs";

const revision = "a".repeat(40);
const op1 = "10000000-0000-4000-8000-000000000001";
const op2 = "10000000-0000-4000-8000-000000000002";
const attempt1 = "20000000-0000-4000-8000-000000000001";
const attempt2 = "20000000-0000-4000-8000-000000000002";
const call1 = "30000000-0000-4000-8000-000000000001";
const call2 = "30000000-0000-4000-8000-000000000002";
const event1 = "40000000-0000-4000-8000-000000000001";
const event2 = "40000000-0000-4000-8000-000000000002";
const base = { v: 1, revision };
const start = (operation_id = op1, attempt_id = attempt1, at = "2026-10-03T00:00:00.000Z") => ({ ...base, event: "score_start", at, operation_id, attempt_id, traffic: "controlled_smoke" });
const outcome = (operation_id = op1, attempt_id = attempt1, result = "success") => ({ ...base, event: "score_outcome", at: "2026-10-03T00:00:01.000Z", operation_id, attempt_id, status: result === "success" ? 200 : result === "invalid" ? 400 : 502, outcome: result, code: result === "success" ? "SUCCESS" : result === "invalid" ? "INVALID_REQUEST" : "SCORING_NETWORK", elapsed_ms: 1000 });
const providerStart = (operation_id = op1, attempt_id = attempt1, call_id = call1, provider = "places") => ({ ...base, event: "provider_start", at: "2026-10-03T00:00:00.100Z", operation_id, attempt_id, provider, call_id });
const providerFinish = (operation_id = op1, attempt_id = attempt1, call_id = call1, provider = "places") => ({ ...base, event: "provider_finish", at: "2026-10-03T00:00:00.500Z", operation_id, attempt_id, provider, call_id, elapsed_ms: 400, result: "resolved" });
const displayed = (operation_id = op1, attempt_id = attempt1, event_id = event1) => ({ ...base, event: "decision_displayed", at: "2026-10-03T00:00:02.000Z", operation_id, attempt_id, event_id });
const options = { from: "2026-10-03T00:00:00.000Z", to: "2026-10-04T00:00:00.000Z", revision, provenance: "controlled-smoke" };

describe("measurement baseline extractor", () => {
  it("deduplicates repeats while counting every attempt's provider starts and using distinct denominators", () => {
    const rows = [
      start(), start(), outcome(op1, attempt1, "failure"),
      start(op1, attempt2), outcome(op1, attempt2), providerStart(op1, attempt1),
      providerStart(op1, attempt2, call2, "model"), providerFinish(op1, attempt2, call2, "model"),
      displayed(op1, attempt2, event2),
    ];
    const result = aggregateRows(rows, options);
    expect(result.cohort).toMatchObject({ attempts: 2, logicalOperations: 1, serverSuccessfulLogicalOperations: 1, displayedLogicalOperations: 1 });
    expect(result.cohort.serverSuccessRate).toBe(1);
    expect(result.cohort.displayRateAmongServerSuccessfulOperations).toBe(1);
    expect(result.providerUsage.starts.total).toBe(2);
    expect(result.providerUsage.startsPerCohortLogicalOperation).toBe(2);
    expect(result.providerUsage.startsPerServerSuccessfulLogicalOperation).toBe(2);
    expect(result.providerUsage.startsPerDisplayedLogicalOperation).toBe(2);
    expect(result.providerUsage.finishes).toMatchObject({ matched: 1, missing: 1 });
    expect(result.diagnostics.exactRepeatDuplicates).toBe(1);
  });

  it("excludes conflicting outcomes instead of selecting a success", () => {
    const result = aggregateRows([start(), outcome(), outcome(op1, attempt1, "failure")], options);
    expect(result.diagnostics.conflictingDuplicateKeys).toBe(1);
    expect(result.cohort.serverSuccessfulLogicalOperations).toBe(0);
    expect(result.cohort.serverSuccessRate).toBe(0);
    expect(result.missingOutcomes).toBe(1);
  });

  it("shows failure classes with both attempt and logical-operation denominators", () => {
    const attemptB = "20000000-0000-4000-8000-000000000005";
    const result = aggregateRows([
      start(), outcome(op1, attempt1, "invalid"),
      start(op1, attemptB), { ...outcome(op1, attemptB, "provider_failure"), code: "PLACES_QUOTA", status: 503 },
    ], options);
    expect(result.outcomeDistribution).toEqual({
      denominators: { attempts: 2, logicalOperations: 1 },
      byOutcomeAndCode: {
        "invalid/INVALID_REQUEST": { attempts: 1, logicalOperations: 1 },
        "provider_failure/PLACES_QUOTA": { attempts: 1, logicalOperations: 1 },
      },
    });
  });

  it("uses the half-open UTC start window and exact revision", () => {
    const otherRevision = "b".repeat(40);
    const result = aggregateRows([
      start(op1, attempt1, options.from),
      start(op2, attempt2, options.to),
      { ...start(op2, "20000000-0000-4000-8000-000000000003"), revision: otherRevision },
    ], options);
    expect(result.cohort).toMatchObject({ attempts: 1, logicalOperations: 1 });
    expect(result.diagnostics.revisionMismatchRows).toBe(1);
  });

  it("keeps later attempts and provider usage for a logical operation admitted by the window", () => {
    const outsideWindowAttempt = "20000000-0000-4000-8000-000000000004";
    const result = aggregateRows([
      start(), outcome(),
      start(op1, outsideWindowAttempt, options.to),
      providerStart(op1, outsideWindowAttempt, call2, "model"),
    ], options);
    expect(result.cohort).toMatchObject({ attempts: 2, windowStarts: 1, logicalOperations: 1 });
    expect(result.providerUsage.starts.total).toBe(1);
    expect(result.providerUsage.finishes.missing).toBe(1);
  });

  it("rejects orphan and forged cross-operation receipts from display totals", () => {
    const forged = displayed(op2, attempt1, event2);
    const result = aggregateRows([start(), outcome(), forged], options);
    expect(result.cohort.displayedLogicalOperations).toBe(0);
    expect(result.orphanReceipts).toBe(1);
    expect(result.diagnostics.orphanEvents).toBe(1);
  });

  it("returns null rates when a denominator is zero and reports absent outcomes", () => {
    const result = aggregateRows([], options);
    expect(result.cohort.serverSuccessRate).toBeNull();
    expect(result.cohort.displayRateAmongServerSuccessfulOperations).toBeNull();
    expect(result.providerUsage.startsPerDisplayedLogicalOperation).toBeNull();
    expect(result.missingOutcomes).toBe(0);
  });

  it("counts a provider finish without cohort attempt context as an orphan", () => {
    const result = aggregateRows([providerFinish()], options);
    expect(result.diagnostics.orphanEvents).toBe(1);
    expect(result.providerUsage.starts.total).toBe(0);
    expect(result.cohort.serverSuccessfulLogicalOperations).toBe(0);
  });

  it("strictly rejects prototype event names, coercible IDs, unknown fields and private payloads", () => {
    expect(validateRow({ ...start(), event: "toString" })).toBe("event");
    expect(validateRow({ ...start(), operation_id: [op1] })).toBe("id");
    expect(validateRow({ ...start(), place: "private address" })).toBe("unknown_field");
    expect(validateRow({ ...start(), at: "2026-10-03T00:00:00Z" })).toBe("timestamp");
    const row = { ...start() };
    expect(JSON.stringify(aggregateRows([{ ...row, place: "private address" }], options))).not.toContain("private address");
  });

  it("extracts only custom rows from tail console messages and frames multiline JSON safely", async () => {
    const row = start();
    const extracted = extractTailRows({ logs: [
      { level: "log", message: ["wth_measurement", row, JSON.stringify(row), "private text"] },
      { level: "log", message: [JSON.stringify(row)] },
    ], event: { request: { url: "private URL" } } });
    expect(extracted).toEqual([row, row]);
    async function* lines() {
      yield "{";
      yield '  "logs": [{"message": ["wth_measurement", ' + JSON.stringify(JSON.stringify(row));
      yield "]}]";
      yield "}";
    }
    const documents = [];
    for await (const document of jsonDocuments(lines(), { tail: true })) documents.push(document);
    expect(documents).toHaveLength(1);
    expect(extractTailRows(documents[0])).toEqual([row]);
  });

  it("does not count valid-looking rows outside the custom tail marker", () => {
    expect(extractTailRows({ logs: [{ message: [JSON.stringify(start())] }] })).toEqual([]);
  });
});
