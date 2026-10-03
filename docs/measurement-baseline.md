# Measurement baseline extraction

This read-only tool turns schema-valid measurement events into aggregate counts
for one exact Git revision and UTC start window. It follows
[`measurement-contract.md`](./measurement-contract.md) and validates each row
against [`../lib/measurement-schema.json`](../lib/measurement-schema.json).
It does not query analytics, call providers, edit application state, or claim
product adoption.

## Run against sanitized JSONL

Provide rows that have already been sanitized to the measurement allowlist. The
tool accepts one or more JSONL inputs, or `-` for standard input:

```sh
node scripts/measurement-baseline.mjs \
  --input /path/to/sanitized-measurements.jsonl \
  --from 2026-10-03T00:00:00.000Z \
  --to 2026-10-04T00:00:00.000Z \
  --revision "$WTH_REVISION_SHA" \
  --provenance controlled-smoke
```

The window is half-open: score starts at `from` are included and starts at `to`
are excluded. An operation enters the cohort when any start is in the window;
all same-revision attempts for that operation are included, even when a retry
starts outside the window. Events may also fall after `to`; they are joined by
the exact revision, operation ID, and attempt ID. Use `null` as the revision
only when the emitted schema rows actually have a null revision.

For a live Wrangler tail, pipe JSON directly to the extractor so raw envelopes
are not written to a file:

```sh
npx wrangler tail --format json | node scripts/measurement-baseline.mjs \
  --input - --tail \
  --from 2026-10-03T00:00:00.000Z \
  --to 2026-10-04T00:00:00.000Z \
  --revision "$WTH_REVISION_SHA" \
  --provenance controlled-smoke
```

Tail mode frames multiline JSON envelopes in memory and extracts only strict
measurement rows from console `message` arguments after the `wth_measurement`
marker, whether Wrangler represents rows as objects or serialized JSON
strings. It also accepts a direct measurement row as a JSON document. Other envelope fields and non-JSON console
messages are discarded. Keep stdout as the aggregate report only; do not save
or forward raw tail data. This command does not establish that any traffic is
organic.

## Definitions

- **Attempt**: one valid `score_start`, including retries and requests that do
  not produce a successful response.
- **Logical operation**: a unique operation ID among cohort starts. Server
  success is counted once per operation if at least one matching attempt has a
  `score_outcome` of `success`.
- **Observed display receipt**: a unique successful operation with at least one
  `decision_displayed` receipt joined on operation and attempt. Its observed
  rate uses server-successful logical operations as the denominator. Receipts
are unauthenticated, lossy, and forgeable, so counts and rates are untrusted
reports, not a funnel or lower bound.
- **Provider usage**: every distinct `provider_start` for a cohort attempt,
  including failed requests and retries. Counts are shown per cohort logical
  operation, per server-successful logical operation, and per displayed logical
  operation. Zero denominators produce `null` rates.
- **Provider duration**: only finishes that match a start on operation,
  attempt, call ID, and provider. Calls can overlap; their durations are not
  operation latency. Operation latency uses matched `score_outcome` elapsed
  times and is reported separately.
- **Repeated rows**: byte-content-equivalent JSON values after key-order
  normalization are counted once and reported as repeat duplicates. If a
  deduplication key has contradictory rows, every row for that key is excluded
  from metrics and a diagnostic is emitted. A conflicting duplicate makes the
  command exit nonzero.
- **Orphans and missing data**: unmatched events and client receipts are counted
  as diagnostics; attempts without outcomes and provider starts without
  matching finishes are reported explicitly. They are not treated as success.
- **Outcome distribution**: `outcomeDistribution` groups matched server
  outcomes by schema outcome and code, with attempt and unique logical-operation
  counts. The report states both denominators.
- **Traffic**: `controlled_smoke` and `unclassified` score starts remain
  separate. An unclassified request is not evidence of organic traffic.

The report contains aggregate counts, durations, rates, the requested revision,
window, and a short provenance label. It contains no operation, attempt, call,
or event IDs; input rows; raw envelopes; location text; model text; provider
responses; or file paths. Invalid-row diagnostics name only a validation
category. Do not add names, addresses, free-text notes, or participant
identifiers to provenance.
Invalid rows, revision-mismatched rows, malformed JSON lines, and contradictory
duplicate keys still produce a redacted report for diagnosis and make the CLI
exit nonzero. Non-measurement Wrangler log envelopes are expected and counted
separately in tail mode.

## Baseline record

At source freeze on 2026-10-03, an observed provider baseline for this
instrumentation had not been collected. The release gate collects it from the
exact deployed revision and saves the aggregate report, UTC window, extraction
command and caveats on [ZK-1269](https://linear.app/zkutty/issue/ZK-1269).
The following fields are required in that report; this source document does
not substitute synthetic tests for deployed evidence or human-study findings.

| Field | Pending value |
| --- | --- |
| Revision | Pending exact 40-character SHA |
| UTC window `[from,to)` | Pending explicit timestamps |
| Provenance label | Pending; distinguish controlled smoke, synthetic, or other supplied evidence |
| Input source | Pending; do not retain raw tail envelopes |
| Aggregate report | Pending; no IDs or raw inputs |
| Data quality | Pending invalid rows, conflicting keys, orphans, missing outcomes/finishes, and loss limits |
| Interpretation | Pending; no organic-usage, adoption, or billing-dollar claim |

The actual-app synthetic browser integration was independently extracted on
2026-10-03 over `[21:34:23.433Z,21:35:29.000Z)`, using its fixture revision
`e1d6d9bc0b98b74aebbf2feace90eca0612c6237`. It produced 3 attempts and 3
server-successful logical operations, 18 provider starts (3 Places, 12 Routes,
3 model), 2 displayed-operation reports and 1 mode change. Provider usage was
6 per server-successful operation and 9 per reported displayed operation.
The stale Slow response incurred provider work and no display receipt. All
diagnostics, missing outcomes and missing finishes were zero in that controlled
fixture. These are synthetic interface/correlation checks; they are not an
observed Google/Anthropic baseline, organic traffic, or participant findings.

Share continuation is unavailable pending human-study evidence and the gated
sharing implementation. A missing share event is not a measured zero. The
application's current best-effort client receipts can be lost or forged, and
older provider or platform logs may have different retention and privacy
properties from the application event allowlist.
