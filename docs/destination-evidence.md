# Destination evidence contract

`findPlace` preserves Google's first candidate, including its `name` and any
supplied, valid `formatted_address` and `place_id`. It does not select another
branch or substitute the typed query for the resolved identity. Addresses remain
provider text and are not parsed. `ZERO_RESULTS` remains no match; malformed
required identity and operational provider failures remain classified errors.

`PlaceData` / `ResolvedPlace` contains provider facts only. Optional facts are
omitted when absent or invalid, with no coercion or fabricated defaults:

| Field | Accepted value |
| --- | --- |
| `formatted_address`, `place_id` | Nonempty strings |
| `rating` | Finite number from 1 through 5 |
| `user_ratings_total` | Nonnegative safe integer; missing means unknown, supplied 0 remains 0 |
| `price_level` | Integer from 0 through 4; relative cost, not formality |
| `lat`, `lng` | Finite numbers in [-90, 90] and [-180, 180] respectively |

The Legacy field-support matrix excludes `user_ratings_total` from Find Place.
It is not requested and normally remains unknown. If the provider response
actually supplies it, the adapter retains only a valid count; the type and prompt
also support that supplied fact. No Place Details call is added to fill the gap.

Travel uses `place_id:ID` first, then a valid coordinate pair. Without either,
travel is unavailable rather than re-resolving an ambiguous name. A missing
route is distinct from an operational route lookup failure.

The additive `ScoreResult.resolvedPlace` field carries these facts separately
from AI scores and explanations. `evidence` identifies `provider: "google_maps"`
and `assessment: "ai_estimate"`. `from`, when supplied by the result assembler,
must be the committed origin used for that request. These fields are optional
for compatibility; the route/UI integration supplies them in a subsequent
packet. `ModelScore` explicitly picks only the existing model output fields.

The prompt uses only supplied fields and labels qualitative reasons as
estimates. Missing facts are unknown. It cannot establish reviewer sentiment,
uniqueness, parking, waits, reservations, transfers, last-mile conditions,
opening hours, or time-of-day conditions. Rating count includes ratings with or
without text. The output shape, 600-token limit, single unusable-output retry,
and disabled SDK retries remain unchanged. Prompt grounding is a model
instruction, not proof that every generated statement will obey it.

## Provider references and data lifetime

Reviewed 2026-10-03:

- [Find Place (Legacy) fields and response](https://developers.google.com/maps/documentation/places/web-service/legacy/search-find-place): resolved identity and optional field semantics/ranges.
- [Legacy field-support matrix](https://developers.google.com/maps/documentation/places/web-service/legacy/place-data-fields): rating count and review text are unavailable through Find Place.
- [Distance Matrix (Legacy) requests](https://developers.google.com/maps/documentation/distance-matrix/distance-matrix): `place_id:` destination syntax.
- [Distance Matrix (Legacy) policies](https://developers.google.com/maps/documentation/distance-matrix/policies): content restrictions and attribution; the documented place-ID exception is not a general content-cache exception.
- [Google Maps Platform Service Specific Terms](https://cloud.google.com/maps-platform/terms/maps-service-terms): general attribution/ID provisions and Distance Matrix terms. Applicable agreement and billing region govern.

Provider fetches explicitly use `cache: "no-store"`. This packet adds no cache,
server/global storage, browser persistence, or permission to reuse Google Maps
Content to avoid provider requests. These facts support the current result
display; downstream integration must preserve source attribution and separation
from AI opinions. Installed Next.js fetch documentation was reviewed before the
adapter change.
