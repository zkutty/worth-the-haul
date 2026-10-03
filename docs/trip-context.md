# Current-trip integrity and mode selection

A submission captures a trimmed destination query and optional origin. The
server performs a fresh Google place lookup, travel lookup when an origin is
supplied, and one Claude assessment. The response separates the selected
Google candidate (`resolvedPlace`), committed origin (`from`), route estimates
(`legs`), and app-owned AI mode estimates (`mode_estimates`). The provider and
assessment labels are `google_maps` and `ai_estimate`.

Claude must return one finite 1–10 Schlep estimate for each actually supplied
mode, with no duplicate or invented mode. The original 600-token cap, disabled
SDK retries, and one retry for unusable model output remain. Missing or
incomplete mode coverage fails with the controlled scoring error; partial
coverage never becomes a result. Reasons are concise and all displayed AI
explanations carry an estimate label. Prompt grounding limits the model to
supplied facts; it cannot prove semantic compliance of every generated claim.
Parking, waits, reviewer text, reservations, transfers, uniqueness, and other
unsupplied logistics remain unknown.

The server chooses the requested mode only when available, otherwise the first
supplied route. With no routes, selected mode is absent and travel time is
explicitly unknown. Fire remains the single destination estimate. Selecting a
mode synchronously selects its validated Schlep estimate, route context, and
pair-derived verdict. Editing form fields does not affect this current result.

The provisional app rule uses the existing Fire/Schlep ratio bands:

| Ratio | Existing ratio tier | Verdict |
| --- | --- | --- |
| At least 2 | Steal | Legendary Haul |
| At least 1.3, below 2 | Solid ROI | Worth It |
| At least 0.9, below 1.3 | Coin flip | Barely Worth It |
| At least 0.6, below 0.9 | Tough sell | Hard Pass |
| Below 0.6 | Net negative | Hard Pass |

`decision.ts` owns these bands. The verdict reason names the selected mode,
actual score pair and ratio; a model verdict cannot override that final pair.
The result parser checks identity, source labels, numeric bounds, exact mode
coverage, route selection and verdict coherence before display. Browser state
freezes the parsed current result. A request sequence and AbortController make
newest search authoritative, including successful responses, errors and loading
cleanup. New searches clear the old decision immediately.

Historical PR #6 was unmerged and is not the shipped design. It proposed
unsigned `knownPlace` / `knownLegs` reuse and pinned client Fire after a model
verdict. This implementation rejects `lockFire`, `knownPlace`, `knownLegs` and
arbitrary `context` before access checks or provider calls. There is no mode
rescore endpoint, client context trusted by a server, signing secret or cache.

## Retention decision

Google facts support only the currently displayed result in active page memory.
Mode selection changes the app's existing AI assessment and displayed route;
it does not call Google or Claude. Every new submission performs fresh lookup.
No server cache, browser persistence, localStorage or URL serialization is
introduced. The explicit clipboard share contains the app's AI scores and
resolved destination name; it does not retain route or provider fact payloads.

Reviewed 2026-10-03: Google's
[service-specific terms](https://cloud.google.com/maps-platform/terms/maps-service-terms)
require documented attribution and distinguish ID caching provisions from
service-specific permissions. The
[Distance Matrix policies](https://developers.google.com/maps/documentation/distance-matrix/policies)
restrict prefetching, caching and storage, with a place-ID exception; that is
not general permission to cache route content. This design asserts no TTL
cache permission. Applicable agreement and billing region govern. Google
attribution remains next to source facts and route estimates, separate from
AI scores.
