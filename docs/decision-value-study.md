# Decision value study: facilitator packet and report template

Status: protocol prepared; **no human findings have been collected**. This packet
supports the small, consented task study for ZK-1270/1271. Synthetic fixtures,
agent review, desk review and automated checks can prepare the study, but they
cannot count as participant observations or satisfy human acceptance criteria.

## Purpose and decision

Find out whether Worth The Haul helps a person make or revise a real decision
about going to a destination, whether its Fire/Schlep explanation is understood,
and whether participants can tell supplied facts from AI and route estimates.
Observe what happens when the participant changes travel mode and when the
result conflicts with their own expectations. Also determine whether the
current Share action meets a real sharing need.

This is a formative study, not a representative population survey or a test of
model accuracy. It cannot establish that a score is objectively correct. The
facilitator records what each person was deciding before seeing a result, what
they did with the result, and whether it supported or changed their intended
action.

## Product measurement and baseline boundary

The proposed product event vocabulary is documented in the
[minimal measurement contract](measurement-contract.md), with its authoritative
allowlist in `lib/measurement-schema.json`. It separates server attempts,
outcomes, provider calls, best-effort displayed decisions and mode changes.
The contract also states that current generic clipboard text cannot establish
a share continuation. This is a measurement plan; **an actual product baseline
has not yet been collected**. Do not fill baseline fields with synthetic,
agent, controlled-smoke or human-study counts. If a baseline becomes available,
report its UTC window, revision, provenance and limitations separately from
participant observations. Telemetry cannot replace the consented human tasks
in this packet.

## Sample and recruiting

Recruit 5–8 adults who have recently made, or expect to make soon, an optional
outing or destination choice that involves some travel. Include a mix of people
who commonly travel by car/ride-hail, transit, walking or bicycle, and people
who have used at least two of those modes. Seek variation in familiarity with
the destination type and comfort with AI-generated advice. Do not recruit only
the product team, close collaborators, or people already coached on the score
rule. A participant may fit more than one dimension.

This small purposive sample is meant to expose distinct decision contexts and
comprehension problems quickly; it is not a prevalence estimate. Record the
recruiting rationale in broad, non-identifying terms. Do not retain names,
contact details, exact home/work addresses, precise location histories, or
unnecessary demographic details in the study report. Stop at 8 unless a
materially different user context is still missing; document the reason before
adding any session.

## Materials and task setup

Use the current product build in a facilitator-controlled browser and let the
participant enter a real destination they are considering. Ask for an origin
at neighborhood, district, town, or transit-station level; an exact private
address is never needed. Let them use a broad area or decline to enter an
origin. Do not ask them to disclose sensitive destinations. If their real
example is sensitive, offer one of the neutral fictionalized tasks below and
mark it as a study scenario rather than a real personal decision.

Suggested task cards, selected to cover different destination types and travel
contexts (they are prompts, not expected answers):

| Task | Destination prompt | Origin prompt | Decision context to elicit |
| --- | --- | --- | --- |
| A | A restaurant across town that you are considering for a meal | A nearby neighborhood or district | Would you go there for this meal, given the trip? |
| B | A well-reviewed specialty shop or market outside your usual area | Your town center, district, or nearest transit station | Is the item or experience worth making a separate trip for? |
| C | A park, museum, or event venue for a planned afternoon | A broad area where you would start | Which available mode, if any, makes the outing worthwhile? |
| D | A familiar local destination you already know well | A broad starting area, if useful | Does the result change a decision you had mostly made already? |

For a real task, use the participant's own destination and the broadest origin
that still makes route choices useful. Do not substitute the built-in examples
for a participant's real decision unless the participant chooses one. Record
the task wording without personally identifying details.

## Consent and privacy

Before starting, explain the purpose, what will be observed, the approximate
session length (20–30 minutes), the voluntary nature of participation, and how
notes will be anonymized. This packet uses notes only; do not record audio or
screen. Record an affirmative consent flag under the participant ID, without a
name or signature in the study notes. Do not record credentials, private
addresses, payment information, or unrelated personal content. The participant
may skip a question, stop at any time, or ask to remove their session notes
before the report is finalized. Keep coded notes in the study's restricted
internal artifact or repository location, then delete participant-level notes
within 30 days of the final report. Retain only anonymized aggregate findings
after that date. Share only anonymized, aggregated observations outside the
study team.

Do not paste participant-specific origin/destination pairs, screenshots,
clipboard contents or verbatim identifying comments into a public issue or
report. Use participant IDs (P01–P08), broad context labels, and paraphrases.
Do not record participant names or contact details for note retention.

## Facilitator script

Read or paraphrase this before the task:

> We are evaluating the product, not you. I’m interested in how you decide and
> what is clear or confusing. Please think aloud as you go. You can skip any
> question or stop at any time. We will anonymize notes and won’t need an exact
> address. Information shown by the product may be incomplete or inaccurate.
> I’ll take anonymized notes that will be deleted within 30 days of the final
> report. Is it okay to continue and take notes?

Obtain an affirmative response before note-taking. Then ask:

1. “What destination are you considering, and what are you deciding?”
2. “Before using this, what would you probably do? How certain are you?”
3. “What would make the trip worthwhile or not worthwhile for you?”

Have the participant perform one task with minimal interruption. Use neutral
prompts such as “What are you looking at?” and “What would you do next?” Do not
explain Fire, Schlep, the ratio, or the verdict before they have interpreted
the result. Do not coach toward a particular mode or answer.

After the result appears, ask:

1. “What do you think this result is saying? What would you do now?”
2. “Which parts are facts from a source, and which parts are estimates?”
3. “What does a higher Schlep score mean to you? Is it better or worse?”
4. “What, if anything, would you verify before acting on this?”
5. “How has this changed your decision, if at all? What specifically changed?”
6. “Would you choose another available travel mode? Please try it and tell me
   what you expect to stay the same and what you expect to change.”
7. “Did the new mode change your decision? Why?”
8. “Would someone else need this destination information to make their own
   decision? How would you get the destination context to them today?”
9. “If a link opened with this destination already filled in, what would you
   expect the recipient to do next? What would they still need to decide?”
10. “Would the current generic app link give them enough context? What would be
    lost or repeated?”

After the participant has completed the unprompted decision task, give this
factual description of the current Share output: it copies the destination
name, scores and reasons, verdict, and generic app link; it carries no origin
or destination-prefill URL. Ask whether that would give their recipient the
context needed. Do not send the copied content or store it in the notes. If
they decline to discuss sharing, record no observation rather than inferring a
preference.

If a participant misunderstands a score, first record the unprompted
interpretation and its effect. Then clarify the interface's stated meaning so
the session can continue, and mark later behavior as prompted. Never represent
prompted correction as spontaneous comprehension.

Close by asking what information was missing, whether the product changed a
real decision, and what one change would most improve it. Thank them and
confirm the participant ID's consent flag. Do not collect a name or contact
details for note retention.

## Observation and disagreement coding

Record observable actions and short, anonymized paraphrases. Separate what the
participant said or did from the facilitator's interpretation. Capture the
initial decision, confidence, result interpretation, mode changes, final
decision, and the stated reason for any change. Mark estimates and unknowns as
such; do not treat a participant's belief as ground truth for place quality or
route accuracy.

Use one or more disagreement codes when their expectation and the result
differ:

| Code | Classification | Examples to record |
| --- | --- | --- |
| DESTINATION | Wrong or ambiguous place | Wrong branch, name collision, address does not match intended place |
| FACT | Supplied place fact is missing, surprising, stale, or misunderstood | Rating/count/price or address concern; record whether the UI marks it unknown |
| ROUTE | Route estimate or available modes conflict with expectation | Duration, distance, unavailable mode, or route suitability concern |
| SCHLEP | AI travel burden estimate feels wrong | State participant's reason; distinguish unfamiliarity from a concrete omitted burden |
| FIRE | AI destination appeal estimate feels wrong | State participant's own priorities or destination knowledge |
| RULE | Pair, ratio tier, or verdict does not match participant's trade-off | Note whether they reject the threshold, arithmetic, or verdict wording |
| CONTEXT | Important personal constraint is absent | Mobility, schedule, cost, companions, weather, safety, accessibility, or another stated factor |
| COMPREHENSION | Score direction, estimate status, or evidence source is unclear | Preserve the first interpretation and whether it affected action |
| SHARE | Generic link loses destination context for a recipient | Recipient task, context gap, and whether destination prefill would resolve it |
| OTHER | Disagreement not covered above | Describe without forcing it into another category |

For each disagreement, ask what evidence or personal constraint would resolve
it, whether it changes the decision, and whether the issue is about data,
estimate, rule, or presentation. Do not collapse “I disagree” into one generic
count.

## Sharing behavior and proposed decision to evaluate

The current Share button copies plain text to the clipboard: destination name,
Fire and Schlep scores with their reasons, verdict, and the generic
`https://worththehaul.app` link. It includes no origin or trip-specific URL and
does not automatically score a shared link when opened. Ask what a recipient
needs to learn, how the participant would provide destination context today,
and whether a generic link loses that context. The study decision is whether to
proceed with a recipient-facing link that pre-fills the destination only. The
recipient must still explicitly start a fresh score; the link must not include
the origin or trigger automatic scoring. Treat origin omission and explicit
fresh scoring as fixed acceptance constraints, not design questions. Do not
click a system share target or send anything during the session. The study
evaluates recipient need and context loss; it does not approve the current
clipboard behavior or validate a future link implementation.

The repository's historical documentation records PR #6 as open and unmerged
at the time of that historical review; that record is not a statement of its
current status. Treat the current page behavior above as the study baseline.

## Decision rubric

Apply this rubric only after real consented participant observations are
collected. The thresholds are predeclared formative decision rules, not
validated population estimates. For a threshold stated as 75%, use the ceiling
of 75% of the applicable denominator (4/5, 5/6, 6/7, or 6/8). A single severe
destination or privacy issue can justify a change before a threshold is
reached. Report the number of participants and the specific evidence behind
each decision; do not turn this small sample into a population claim.

| Outcome | Evidence threshold for this formative study | Action |
| --- | --- | --- |
| **Keep** | At least the 75% ceiling threshold independently explain Fire as an AI estimate where higher means more appealing, Schlep as an AI estimate where higher means more effort, and route/place facts as distinct from those estimates; at least the same threshold cite a concrete way the result supported, revised, or reinforced their stated decision criteria; no repeated high-severity wrong-destination, misleading-evidence, or privacy issue | Keep the tested behavior for the next milestone. Record counterexamples, remaining disagreement, and uncertainty. |
| **Change** | The core decision flow supports some real decisions, but 2 or more participants share the same actionable confusion or missing context; a mode change is missed or its effect is misunderstood by 2 or more; or at least 2 participants identify the same concrete sharing mismatch | Change the specific label, evidence, mode, context, or sharing behavior implicated; then run a focused follow-up with consented people affected by that change before claiming the issue is resolved. |
| **Stop / reconsider** | 2 or more participants make or nearly make a consequential decision based on a wrong destination or a fact presented as known when it is not; 3 or more cannot distinguish AI estimate from supplied fact after neutral use; or any participant's private trip information is exposed through the observed sharing flow in a way they did not expect | Pause the implicated decision or sharing flow, document the evidence, and define a safer product decision before further rollout. Do not infer that the whole product must stop if the evidence isolates one component. |

If fewer than 5 valid sessions are completed, report the counts and treat the
thresholds as directional. For 5–8 participants, use the predeclared ceiling
rule above so every denominator has an explicit threshold. Do not claim “keep”
based solely on synthetic or agent results. Any material change requires fresh
human observation for the affected behavior.

## Sharing go/defer criteria

Make a separate decision about proceeding with the proposed destination-prefill
link for a recipient who needs destination context. **Go** only when at least
three participants describe a concrete recipient need and at least the 75%
ceiling threshold of those participants show that the generic app link loses
useful destination context, while a destination-only prefill would let the
recipient start from the intended place. Record the need denominator, examples
of context loss, and counterexamples. Preserve the fixed behavior: origin is
omitted and opening the link never scores automatically; the recipient must
choose to start a fresh score.

**Defer** if fewer than five valid sessions were observed, fewer than three
participants had a real recipient need, no repeated generic-link context gap
appears, or the evidence does not show that prefilled destination context
helps. Do not treat approval of today's clipboard contents as evidence to go.
This criterion decides whether the need merits implementation; a later human
check should verify the implemented destination-only link and explicit fresh
score flow before calling that behavior validated.

## Anonymized session note template

Copy one blank block per participant. Use only a coded affirmative consent
flag; collect no participant identity or separate signature record in this
packet. Delete participant-level notes within 30 days of the final report.

```text
Study status: protocol / in progress / completed
Participant ID: P__
Session date (date only): YYYY-MM-DD
Consent flag: yes/no; notes only; withdrawal/removal requested yes/no
Broad user context (no identifying detail):
Recruiting rationale / sample dimension:
Task type: restaurant / shop / park-event / familiar local / participant task
Origin granularity: district / neighborhood / town / station / omitted
Destination wording (anonymized; no precise private address):

Before product
  Real decision and timing:
  Likely action:
  Confidence (participant's words or low/medium/high):
  Personal criteria / constraints volunteered:

Observed use (actions, not interpretation)
  Destination resolved as intended? Evidence:
  What they first read as facts:
  What they first read as AI or route estimates:
  Initial Fire interpretation and direction:
  Initial Schlep interpretation and direction:
  Initial verdict/ratio interpretation:
  Evidence disclosure opened? What did they look for?
  Mode(s) selected and order:
  What changed with mode; what stayed fixed in their understanding:
  Neutral / prompted help given (quote prompt or describe):

Decision effect
  Intended action before → after:
  Changed / reinforced / no effect / unclear:
  Participant's stated reason:
  Would verify something before acting? What?
  Decision confidence before → after, if stated:

Disagreements (codes DESTINATION / FACT / ROUTE / SCHLEP / FIRE / RULE /
  CONTEXT / COMPREHENSION / SHARE / OTHER):
  Participant's expectation and observed conflict:
  Evidence or constraint that would resolve it:
  Effect on real decision: none / minor / material / unclear

Recipient destination context (do not send anything)
  Recipient need or no need; concrete task:
  How participant would provide destination context today:
  What generic app link loses:
  Expected effect of a destination-prefill link:
  Expected recipient action before scoring:
  Any expectation of origin inclusion or automatic scoring (record only; these
    are fixed constraints, not options):

Facilitator interpretation (separate from observation):
Severity: low / moderate / high; rationale:
Potential product action:
Follow-up needed:
Note retention/removal request:
```

## Study report template

Replace every bracketed field from real sessions. Delete unused prompts. Do not
fill this with invented participants, synthetic outcomes, or agent conclusions.

```text
# Worth The Haul decision-value study report

Status: [protocol only / in progress / completed]
Collection dates: [date range or not started]
Facilitator(s): [role/name per internal policy]
Valid consented sessions: [N]; withdrawn/excluded: [N and non-identifying reason]
Study build/revision: [identifier]
Current clipboard behavior inspected: [yes/no; method]
Measurement baseline: [not collected / available; if available, UTC window,
  revision and provenance]

## Sample
[N and broad recruiting dimensions; rationale; who was missing. No names,
exact locations, or unnecessary demographic detail.]

## Method and limits
[Tasks used, session length, consent modes, prompts, whether help was given,
and why this purposive small study cannot estimate population prevalence or
objective score accuracy. State explicitly if fewer than five valid sessions.]

## Product measurement baseline (separate from human sessions)
[Proposed vocabulary: docs/measurement-contract.md. Actual baseline: not
collected / available. If available, state UTC window, revision, provenance,
denominators and telemetry loss limits. Do not use synthetic or controlled
smoke counts as organic baseline or human decision observations.]

## Findings by decision question
1. Decision before/after and observed effect: [counts with denominator,
   anonymized examples, and uncertainty]
2. Fire/Schlep direction and AI estimate comprehension: [spontaneous vs prompted]
3. Provider facts, route estimates, AI estimates and unknowns: [what was
   correctly separated; misunderstandings]
4. Mode changes and decision effect: [selected modes; expected invariants;
   changed/unchanged decisions]
5. Disagreement classes: [counts by code, severity, and effect on decision]
6. Recipient destination context: [need denominator, generic-link context gap,
   expected value of destination prefill, counterexamples]

## Decisions against rubric
Core flow: [keep / change / stop / insufficient evidence]
Evidence and threshold calculation: [participants and observations]
Destination-prefill link: [go / defer]
Evidence and threshold calculation: [recipient-need denominator and
  observations; fixed origin omission and explicit fresh scoring acknowledged]
Unresolved risks / missing user contexts: [items]

## Actions
Change or follow-up: [owner, scoped action, and human recheck needed]
Keep: [behavior and supporting evidence]
Stop/pause: [component, evidence, and decision owner]

## Data handling
Consent flag and anonymized-note location: [restricted internal reference]
Participant-level note deletion date (within 30 days of final report): [date]
Removal requests completed: [count/status]
External sharing: [aggregated/anonymized only; destination or none]
```

## Requirements coverage

| Requirement | Covered in |
| --- | --- |
| Actionable consented human task study; no fabricated findings | Status, Purpose, Consent, Script, Report template |
| Sample rationale and representative potential users | Sample and recruiting |
| Realistic destinations/origins without exact private addresses | Materials and task setup, task cards |
| Facts distinguished from AI estimates and unknowns | Script, Observation, note/report templates |
| Schlep score direction | Script and comprehension coding |
| Mode changes and effect on a real decision | Script, note/report templates, rubric |
| Disagreement classification | Observation and disagreement coding |
| Explicit keep/change/stop rubric | Decision rubric |
| Separate destination-prefill link go/defer criteria | Sharing behavior and proposed decision; Sharing go/defer criteria |
| Current generic-link clipboard behavior; no origin URL or automatic shared-link scoring | Sharing behavior and proposed decision |
| Historical PR #6 contextualized without claiming current status | Sharing behavior and proposed decision |
| Facilitator consent script and reviewable report template | Consent and privacy; Facilitator script; Study report template |
| Proposed product measurement vocabulary referenced; baseline status not fabricated | Product measurement and baseline boundary; report template |
| Notes-only consent flag and bounded retention | Consent and privacy; session note template; report template |
