# Destination decision validation

Focused validation for ZK-1266, ZK-1267 and ZK-1268, recorded 2026-10-03.
The actual Next page and compiled score route ran locally with synthetic
provider and quota adapters outside the repository. No test mode or provider
credentials are shipped. Deployed provider validation remains a release gate.

## Browser and accessibility check

Method: native macOS Chrome accessibility tree, keyboard operation, DOM
measurements and a 390×844 mobile viewport. This was an AX/keyboard check,
not a spoken VoiceOver listening test.

- Named destination/origin fields support Tab and Enter submission. Keyboard
  input focus showed a solid 2px orange outline. Successful scoring focuses
  the resolved-destination summary; correction returns focus and selection to
  the destination input. A mode change retains its button focus and exposes
  its selected state with `aria-pressed`. Errors retain form focus and use
  `role="alert"`; scoring and mode changes update the polite status region.
- The ambiguous cafe fixture showed the East Branch and its supplied address
  before the AI verdict and supporting details/map. After editing both form
  drafts, keyboard Walk selection preserved that branch, the committed origin
  and Fire 7. Schlep 9, ratio 0.78 and Hard Pass agreed. Fixture counters stayed
  exactly one place, route, model and score request across the mode change.
- The native evidence disclosure opened by keyboard and separated Google
  facts/route estimates from AI estimates. Supplied rating count 0 and price
  level 0 remained visible; parking, waits, review text, uniqueness and other
  unsupported logistics remained Unknown.
- A missing-data candidate with only one coordinate remained usable. Its
  missing address, rating/count, price, full coordinate pair, selected mode
  and route duration were Unknown. No name-only map was embedded; travel time
  was explicitly unknown.
- The controlled-error fixture announced a retryable error and kept submission
  usable. Batched slow-then-fast submissions ended on the fast destination,
  with the latest ready state and no stuck loading state.
- At 390px, document and body widths were both 390px, including expanded
  evidence: no horizontal overflow. The accessibility tree exposed named
  inputs, selected mode, expandable evidence and readable estimate text.

Muted small text is now `#7D7D7D`: 4.9223:1 on `#060606` and 4.7215:1 on
`#0D0D0D`, above the 4.5:1 ordinary-text threshold in
[WCAG contrast minimum](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html).
Core controls have visible keyboard focus, checked against the
[focus-visible criterion](https://www.w3.org/WAI/WCAG22/Understanding/focus-visible.html).

## Implementation packets and deterministic gates

| Packet | Worker | Model and effort | Result |
| --- | --- | --- | --- |
| Destination evidence (M) | `destination_evidence` | Sol 6.1 high | Accepted adapter/prompt/schema/semantics; 48 focused tests |
| Contrast and focus (XS) | `readability_focus` | Luna high | Accepted CSS; parsed stylesheet and calculated contrast |
| Immutable mode context (L, split server/helper and client/page units) | `immutable_mode_context` | Sol 6.1 xhigh | Accepted contracts, pair-derived decision, request sequencing and page; 163 focused tests |
| Decision presentation (S) | `decision_presentation` | Luna high | Accepted compact summary/evidence; 3 focused tests |

All worker handles are under `/root/milestone_execution/`. The coordinator
accepted packet output before final integration. Final aggregate lint and
typecheck passed; 260 tests passed. The actual local Cloudflare quota runtime
also passed concurrency, persistent daily cap, window reset, failed-reservation
and fail-closed gates. Exact-map fallback has three focused regression tests.
See [evidence semantics](destination-evidence.md),
[trip integrity/retention](trip-context.md) and
[release/recovery gates](scoring-operations.md).
