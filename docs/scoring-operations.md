# Dependable scoring: verification and recovery

This runbook supports ZK-1263, ZK-1264, and ZK-1265. A passing configuration
readiness response does not certify Google or Anthropic availability. Release
certification requires successful scoring against the deployed revision.

## Historical provenance and current diagnosis

The inspected production source is main commit
`02f141da6585ffd69e0e372152bf55ca7c3ca4da`. On 2026-10-03, the public built-in
Benu example again returned HTTP 400 and `Place not found. Try being more
specific.` Main collapses all unsuccessful Google lookups to this result; that
message cannot identify the actual provider cause.

Related historical Done issues ZK-7/8/9/14/17/18/22 have implementation on
[open, unmerged PR #6](https://github.com/zkutty/worth-the-haul/pull/6), head
`cfccaa48edf2c88b1c949f6eb7ec709d3a7c090d`. Those changes are absent from main.
PR #7 added CI and output retry, and PR #8 corrected the lockfile. Preserve
historical issue states; this milestone verifies and remedies current behavior.
Do not merge PR #6's additional PWA, sharing, or rescore features into this scope.

Before production release, record the active Worker version/deployed source
revision, existing Worker bindings and secret **names**, and applicable zone
rate rules. Record fixed provider classifications, not keys, complete upstream
responses, customer locations, prompts, or model output. The current production
provider cause and external rule configuration remain unverified until this
inspection is completed. Do not infer a legacy API migration from a generic 400.

## Input and output contracts

The body must be a JSON object with only `place`, optional `from`, `mode`, and
`lockFire`. `place` accepts 1–200 characters after requiring a nonempty trimmed
value; `from` accepts up to 150 characters and an empty value means no origin.
Length checks apply before trimming. These limits follow the existing ZK-9
input proposal and comfortably cover the built-in destinations and origins.

Allowed modes are driving, transit, walking, and bicycling. Optional fields
must have the correct type when present. `lockFire` accepts only a finite score
from 1 through 10, a nonempty reason up to 500 characters, and up to six nonempty
detail strings of 500 characters each. A streamed body above 32 KiB returns 413,
even without `Content-Length`; malformed shapes and field limits return 400.
Invalid requests neither reserve quota nor contact providers.

Model output requires finite numeric Fire/Schlep scores in 1–10, a recognized
verdict, nonempty reasons up to 500 characters, and arrays of up to six nonempty
500-character details. Empty detail arrays and an empty distance note are
allowed. The note is limited to 300 characters. Invalid scores are never coerced
or clamped into success; invalid verdicts never become a default positive verdict.
An unusable model result gets one retry. Anthropic SDK retries are disabled;
each invocation has a 20-second timeout and a 600-token output cap.

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
