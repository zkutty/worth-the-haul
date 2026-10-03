# Dependable scoring: verification and recovery

This runbook supports ZK-1263 through ZK-1269. A passing configuration
readiness response does not certify Google or Anthropic availability. Release
certification requires successful scoring against the deployed revision.

## Historical provenance and resolved diagnosis

The initial inspected repository main was commit
`02f141da6585ffd69e0e372152bf55ca7c3ca4da`; the active production Worker's Git
SHA cannot be recovered from its metadata. On 2026-10-03, the public built-in
Benu example again returned HTTP 400 and `Place not found. Try being more
specific.` Main collapses all unsuccessful Google lookups to this result; that
message cannot identify the actual provider cause.

Related historical Done issues ZK-7/8/9/14/17/18/22 have implementation on
[open, unmerged PR #6](https://github.com/zkutty/worth-the-haul/pull/6), head
`cfccaa48edf2c88b1c949f6eb7ec709d3a7c090d`. Those changes are absent from main.
PR #7 added CI and output retry, and PR #8 corrected the lockfile. Preserve
historical issue states; this milestone verifies and remedies current behavior.
Do not merge PR #6's additional PWA, sharing, or rescore features into this scope.

Initial Cloudflare inspection on 2026-10-03 found production serving 100% version
`c7394967-e4d0-4a0a-b93f-0580e89d200f`, uploaded 2026-05-10. Its metadata has no
Git revision; its bindings contain `ASSETS`, `GOOGLE_MAPS_API_KEY`, and
`ANTHROPIC_API_KEY`, with no shared scoring quota binding. Both custom domains
map to this Worker. Zone rate-limit reads returned 403 with the existing OAuth
scope, so that API read could not establish whether edge rules existed.

The development Worker version `1896c17a-b247-40db-a568-e08f5c1bc520` registered
the isolated quota object with the owner-approved daily cap of 10. Independent
development secrets are unavailable. A native `wrangler dev --remote` session
of revision `5570ceed05bd324b28b2fe2444cbaba2dd094a3c` inherited the existing
production secret bindings and delegated quota to that development object.
Readiness passed, then Benu returned 503 `PLACES_CONFIGURATION`; the fixed
provider log classified the denial as `billing_not_enabled`. Two of the ten
development reservations were consumed by diagnosis. Production traffic was
unchanged. The owner subsequently enabled Google billing; all three examples
then passed in development and production. PR #9 released main revision
`01260d29622b37f4c264087771c33a2731ee4838`, production version
`0cedfee6-6b19-4df8-be08-3e2482668d2e`, with the persistent quota binding and
10/day cap. Authenticated, unfiltered zone UI inspection later that day showed
no custom, rate-limiting, or managed rules. The application quota closes the
observed cost-control gap. These are historical release records; current
availability still requires the deployed smoke gate. No legacy API migration
was needed to correct this billing denial.

Record fixed provider classifications, not keys, complete upstream responses,
customer locations, prompts, or model output. Denial details map to fixed
configuration codes; unmatched provider text remains `REQUEST_DENIED`.

## Input and output contracts

The body must be a JSON object with only `place`, optional `from`, and `mode`.
`place` accepts 1–200 characters after requiring a nonempty trimmed
value; `from` accepts up to 150 characters and an empty value means no origin.
Length checks apply before trimming. These limits follow the existing ZK-9
input proposal and comfortably cover the built-in destinations and origins.

Allowed modes are driving, transit, walking, and bicycling. Optional fields
must have the correct type when present. Legacy `lockFire`, `knownPlace`,
`knownLegs`, and arbitrary `context` are rejected rather than trusted. A streamed
body above 32 KiB returns 413,
even without `Content-Length`; malformed shapes and field limits return 400.
Invalid requests neither reserve quota nor contact providers.

Model output requires finite numeric Fire/Schlep scores in 1–10, a recognized
verdict, nonempty reasons up to 500 characters, and arrays of up to six nonempty
500-character details. Empty detail arrays and an empty distance note are
allowed. The note is limited to 300 characters. Invalid scores are never coerced
or clamped into success; invalid verdicts never become a default positive verdict.
Each initial assessment also supplies exactly one finite Schlep estimate per
available route mode, with a reason up to 200 characters. The response includes
the resolved Google candidate and committed origin, labels AI explanations as
estimates, and derives the verdict from the final displayed score pair. A
browser parser verifies this complete context before displaying it. Mode changes
select a precomputed estimate in current-page memory, without Google or model
calls; form edits do not alter the displayed trip. Every new submission performs
fresh lookup. See [trip context](trip-context.md) and
[destination evidence](destination-evidence.md) for identity and retention limits.

An unusable model result gets one retry. Anthropic SDK retries are disabled;
each invocation has a 20-second timeout and a 600-token output cap.

Measurement adds ephemeral operation/attempt response headers, without changing
the score JSON contract. The client reports only the latest committed validated
decision and committed mode transitions to a bounded `/api/measurement` endpoint.
These reports are best-effort, unauthenticated and separate from server-success
counts. Provider events count every actual invocation, including failed/retried
calls and work whose response the client no longer displays. See
[measurement definitions](measurement-contract.md) and the reproducible
[baseline extraction](measurement-baseline.md). Automatic Worker invocation URL
logs are disabled; application custom events are allowlisted. Edge, upstream
provider and historical logs remain outside that application-event boundary.

## Cost protection

Every valid request reserves quota from the single `score-budget-v1` Durable
Object before Google or Anthropic calls. The reservation transaction updates
both the global daily count and the client window together. The object stores
daily salted client hashes and counters, never raw client identities or inputs.
Reservations persist across Worker restarts; failed provider calls still count.
There is no refund or in-memory fallback that can exceed the ceiling.

| Configuration | Behavior |
| --- | --- |
| `SCORE_DAILY_LIMIT` | Required nonnegative integer; global reservation cap per UTC day. The owner approved `10` requests per environment on 2026-10-03; `0` stops scoring. |
| `SCORE_CLIENT_LIMIT` | Positive integer, default `20`, following the historical ZK-7 proposal. Shared networks share this allowance. |
| `SCORE_CLIENT_WINDOW_SECONDS` | Positive integer, default `60`, maximum `86400`; client allowance resets after its window. |
| `SCORE_ENABLED` | `false` pauses all new scoring; default `true`. |
| `WTH_REVISION` | Full 40-character Git SHA passed with deployment; readiness requires it. |

A daily cap of N bounds new scoring work to at most N place calls, 4N route
calls, and 2N model calls per UTC day. This is a request bound, not a dollar
guarantee: pricing, failed-call billing, and Cloudflare execution/storage costs
are separate. Set provider console quotas/budgets from the owner's dollar
constraint too. Do not raise limits automatically to make a smoke test pass.

429 responses include a clear message and `Retry-After` in seconds. Wait for the
client window or daily reset before retrying; rejected requests consume no new
provider calls. Missing bindings, invalid configuration, or quota-storage
failure return 503 and fail closed. `CF-Connecting-IP` is the only trusted client
header on public Cloudflare requests; unknown identities share one bucket.

To stop spend, set `SCORE_ENABLED=false` on the deployed Worker and verify a
valid request returns 503 without a provider call. In-flight requests already
admitted may finish (at most the remaining reserved daily allowance). For an
urgent provider incident, also disable the affected provider API key/quota in
its console. Restore corrected configuration only after diagnosing the fixed
provider failure code; verify readiness and the three examples before resuming.

## Local and deployed gates

Run the contract/adapter/route suite and production build:

```bash
npm run lint
npm run typecheck
npm test
node scripts/check-score-budget.mjs
npm run cf:build
```

The budget checker uses the actual local Cloudflare runtime and test-only
provider counters; it makes no Google/Anthropic requests. Verify exact admitted
counts under concurrency, zero provider calls on denial, persistence, and window
recovery. Use `npm run cf:preview` for a full local Worker with the quota binding.
Plain `next dev` has no shared binding and scoring fails closed. Put test keys
only in ignored `.dev.vars`; never pass keys on the command line or into logs.

Deploy the reviewed commit to the `development` environment first, with its
own quota object and provider secrets. The development environment has no
production custom domains. Record CI for that exact commit, development Worker
version, owner-selected nonzero daily cap, and provider diagnosis. Then run:

```bash
node scripts/smoke-score.mjs https://DEVELOPMENT_WORKER_URL FULL_GIT_SHA
```

The default checks all three built-ins. A measurement-only change that preserves
the already-certified scoring behavior can select one public example with
`--case example-sf`; record this narrower scope explicitly and keep the full
deterministic provider-boundary tests. This option preserves the persistent daily
allowance rather than resetting counters or raising the cap. Every smoke sends
an observed `controlled_smoke` tag and verifies valid correlation response
headers; the tag does not authenticate traffic provenance.

When only the existing production Worker has provider secrets, a native remote
development session can inherit those bindings without reading their values.
Use the unchanged built app handler with a foreign `SCORE_BUDGET` binding to
`worth-the-haul-development`; omit a local quota class export from that temporary
development entry. Keep the same persistent development object and daily cap
across sessions. Do not enable historical public version URLs as a shortcut:
the inspected Worker has both workers.dev and version routing disabled.

The checker refuses to call providers until `/api/health` is ready and matches
the expected revision. It scores all three public built-in examples and records
only example IDs, status, usability, latency, revision, and Worker version.
Repeat the bounded health checks 30–60 seconds apart after deployment success.
Release production only when every development/local gate passes and the actual
provider cause is corrected. Promote that exact reviewed commit without unrelated
changes, then run the same three-example smoke against `https://worththehaul.app`.
Record both Worker versions, exact commit, CI run, smoke output, and observation
timestamps on the milestone issues before marking them Done.

Provider errors expose fixed stage/classification codes: genuine no-results is
`PLACE_NOT_FOUND`/400; configuration or quota is 503; network or invalid provider
responses are 502. Provider log records contain only fixed provider/kind/code
fields. A route with no travel options can score with travel time unavailable;
a provider outage should be recovered before presenting a scored trip.

## Rollback

Revert only this milestone's scoped commit on development, validate it, and
promote the verified rollback through the same release sequence. Keep the
additive `score-budget-v1` migration and Durable Object data; do not delete the
namespace or reset the counter to evade an exhausted budget. A stopped or failed
release leaves the milestone open. Never silently hotfix production or promote
an unverified rollback.
