# Minimal measurement contract

ZK-1269, version 1, 2026-10-03. The authoritative allowlist is
`lib/measurement-schema.json`. Reuse existing Cloudflare custom logs; add no
analytics service, identity, storage binding or scoring quota. Existing fixed
failure logs cannot reconstruct a historical funnel or provider-call baseline.

## Correlation and event definitions

Each logical browser submission generates a random UUIDv4 in
`X-WTH-Operation-Id`. Each server attempt generates a separate UUIDv4 and returns
both IDs in `X-WTH-Operation-Id` / `X-WTH-Attempt-Id`. Invalid/missing operation
headers are replaced, never logged. These ephemeral correlation tokens identify
operations, not people; they are not authentication or account identifiers.
Repeated attempts can share one logical operation; their provider costs all count.
`X-WTH-Traffic: controlled_smoke` is an observed test tag, not authenticated
evidence of organic traffic. Otherwise traffic is unclassified.

Every row contains only the common schema fields plus its event's listed fields.
`at` is a canonical server UTC ISO timestamp (`YYYY-MM-DDTHH:mm:ss.sssZ`);
`revision` is a public 40-character Git SHA
or null when unavailable. All IDs are UUIDv4. Numeric times are finite integer
milliseconds from 0 through 86400000; HTTP status is an integer from 100–599.
Enums must exactly match the schema. Unknown fields and malformed values fail
validation; raw text is never copied into a measurement event.

| Event | Meaning and denominator |
| --- | --- |
| score_start | One observed server attempt, including invalid/denied requests. |
| score_outcome | Terminal response classification and attempt latency. Success means a server-generated validated response, not a displayed decision. |
| provider_start | One explicit Places/Routes fetch or model SDK invocation actually initiated, including retries and failures. A no-op missing route emits none. |
| provider_finish | That invocation settled; resolved/rejected describes the promise, not provider payload validity. Duration can overlap other routes. |
| decision_displayed | Best-effort client report after the latest validated result commits. Count only when joined to that successful server attempt. |
| mode_changed | Best-effort report of a committed mode transition in the same result, joined to its successful attempt; no provider operation. |

The score route owns request-local measurement context. Inject its optional
provider wrapper at actual Google fetch and `messages.create` boundaries; retain
timeouts, 600-token cap and one unusable-output retry. Start/outcome events and
response headers cover every branch. Measurement failures never fail scoring.
The client sends bounded allowlisted receipts to `/api/measurement`, using the
returned attempt ID. Emit after React commit, suppress stale/duplicate effects,
and never send a query, origin, model text or result payload. Endpoint input is
at most 1 KiB, permits only the two client event types and stamps its own time.
Client reports are unauthenticated and lossy; do not call this a trusted funnel.

## Extraction and privacy

The extractor consumes sanitized schema rows only, with an explicit UTC window,
revision and provenance label. Cohort membership uses score_start in [from,to).
Deduplicate event repeats by event type and attempt/call/event IDs; contradictory
duplicates must produce a diagnostic rather than silently select a success.
Unique logical operations, not request attempts, form server-success and
client-displayed denominators. Count every observed provider_start, including
duplicate/stale attempts. Ignore unmatched client receipts for completion.
Report orphan events, missing outcomes/finishes, unknown traffic and telemetry
loss limitations. A zero/unknown denominator yields null, never a fabricated
completion rate. Report provider usage against both explicitly named completion
denominators, separate overlapping provider durations from operation latency.

Share continuation is a defined future operation: a recipient opens a supported
destination link and explicitly submits their own score. Generic clipboard text
cannot establish this attribution. Until ZK-1270 supports go and ZK-1271 ships,
share continuation is unavailable, not an observed zero. No sharing code is
authorized by this contract.

Disable automatic invocation URL logs in the scoped Worker configuration; retain
custom logs. Existing edge/provider logs and prior invocation logs are a separate
boundary, not covered by the application allowlist. Cloudflare documents a
maximum seven-day Workers Logs retention in its
[current logs documentation](https://developers.cloudflare.com/workers/observability/logs/workers-logs/).
Do not retain raw tail envelopes. A temporary local extraction keeps only validated
rows, deletes them after aggregate verification, and commits aggregate counts
without correlation IDs. Label controlled smoke, synthetic tests and unavailable
organic history separately. The report makes no adoption or billing-dollar claim.

## Execution graph and release unit

The coordinator is Sol 6.1 xhigh. P-M1 (M, Sol 6.1 high) implements route,
provider-boundary and committed-client instrumentation plus strict receipt
validation and the log configuration. P-M2 (S, Luna high) implements the standalone
extractor and report. Both consume this accepted schema; neither waits on the
other's source files. Integration consumes both passing test results, then a
synthetic actual-app browser audit and the ordinary CI/Worker gates. Rollback
reverts instrumentation, its client/route integration and configuration together;
the standalone extraction tooling can be removed independently. No quota data
or namespace is deleted.

ZK-1269 is a separately releasable measurement unit. Its production baseline
feeds ZK-1270; a consented human study supplies the decision consumed by ZK-1271.
Prepared protocol and synthetic tests do not supply that decision. ZK-1270 and
the milestone remain open until real human evidence is sufficient. ZK-1271
remains unimplemented unless that evidence supports go; a supported defer is
recorded without implementing sharing. Packet corrections are bounded to three
attempts and accepted outputs are frozen.

Historical verification on 2026-10-03 found ZK-10 Done but PR #6 still open and
unmerged at `cfccaa48edf2c88b1c949f6eb7ec709d3a7c090d`. Its full-result base64
URL includes the committed origin and decodes without the current validated
result contract. Current main only copies text with a generic homepage URL.
Neither behavior meets the proposed destination-only, explicit-recipient-scoring
acceptance. Preserve the historical issue and PR; this is verification of the
current gated option, not authorization to merge that implementation.
