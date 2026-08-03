# Current Lesson 2 (L2) Quality-Source Analysis — V3-LES-789208

**Status:** SOURCE ANALYSIS — AGENT CANDIDATE FINDINGS, NO GOLD VERDICTS, NO HUMAN RECEIPTS
**Task:** `current-l2-analysis` (overnight capacity-recovery, per-lesson disjoint scope)
**Model:** claude-opus-4-8-thinking-max
**Rubric authority:** [`lesson-quality-rubric.md`](../lesson-quality-rubric.md) (v0.4 planning draft; 12 dimensions)
**Result algorithm / namespaces:** [`rubric-authority-resolutions.md`](./rubric-authority-resolutions.md)
(`evaluation_verdict` precedence `FAIL > BLOCKED > PASS`; split anchor readiness statuses)
**Date:** 2026-08-03

> Every verdict below is an **agent candidate finding** only. No blind-solve, SME,
> learning-science, accessibility, or browser evidence exists for this revision, so no
> dimension is gold-eligible. `adjudication_evidence_status` is `NOT_REVIEWED`/`BLOCKED`
> everywhere. This report identifies calibration candidates; it does not approve or gate
> the lesson.

> **Currency notice** (added 2026-08-03, cross-document correction wave). This analysis
> was written against the rubric `v0.4 planning draft`, and that provenance is accurate
> and deliberately preserved. **The current standard is rubric `0.9.1` with anchor-set
> `0.9.1-candidate`.** Criterion wording, dimension ownership boundaries, required
> evidence, and reviewer-role names have changed since; in particular the anchor
> catalogue now records a proposal as `hypothesized_verdict_under_complete_evidence`
> alongside an `actual_verdict_on_available_evidence`, and the bare term
> `proposed_verdict` is retired. Read every rubric reference below as a v0.4 reference.
> No finding here has been re-derived against `0.9.1`; where the two differ, the rubric
> governs.

---

## 1. Evaluation unit and identity

| Field | Value |
|---|---|
| Lesson id | `V3-LES-789208` (learner title: "Quantitative Measurement and Scaling") |
| Grouping | `V3-CL-789208` |
| Grammar | `L2_PROMPTREF` (two-hop join: `prompt_ref → protected.learner_token → learner-safe`) |
| Runtime kind | shared `normalized-lesson-runtime` engine + `CatalogLesson.tsx` UI (NOT L1's bespoke machine) |
| Ordered KCs | `V3-KC-399019` (units/dimensional analysis), `V3-KC-799492` (precision/sig-figs), `V3-KC-919842` (ratios/proportion/probability/√-estimate), `V3-KC-981438` (scientific notation) |
| Normalized items | 40 scored (10/KC), **all `scored: true`, zero re-entry, zero worked-example** (`normalize.test.ts:138-168`) |

**Artifact hashes (from `artifact-manifest.json`, canonicalization `MCAT_REPO_CANONICAL_SORTED_JSON_SHA256_V1`):**

- lesson-script `content_sha256` = `bce8010490b939c606ef8057a8b1dcca40bdc00ed18288751d3cc51c301fb754`
  (file_sha256 `c578eb2440695bbf3330f0b684e6ad40ce3d6fc171de12e170c3b5a263054fbc`)
- kc-coverage `content_sha256` = `dedaaed3d4cb328f423bece53c39470e243ce76280f664e872e0aaf98f83297d`
- presentation-plan `content_sha256` = `eec5d6a899d1cec1aa56640f4c86c3c5dbf845e3608e204316d31166037fc812`
- quality-report `content_sha256` = `2f9ff0630a34ca7ba93dc5514aeb6b759e9ce54961b13a2bc117b59d7c57888a`
- protected-items file_sha256 = `d94d60b9fa3f64330fd28f6b470983dc1bc92e31c54351c9a804c5d9f955a3f1`
- learner-safe file_sha256 = `5072377614e1823478b0dfc2625005c6264d96211b3b0788d2e49edd09e4e1aa`

**Consistency note:** the anchor catalog's L2 baseline source hash
(`lesson-quality-rubric-anchors.md:23`, `bce8010490b939…fb754`) equals the lesson-script
`content_sha256`, so anchor line references and this analysis address the same revision.
`source_inspection_status: PRESENT` for every artifact and every referenced code file.

---

## 2. Delivery topology — the authored-vs-delivered gap (cross-cutting context)

L2's script authors **three parallel layers**, but the runtime consumes only one of them.
This single structural fact drives most blocking findings, so it is stated once here and
cross-referenced (non-counting) below.

| Authored layer (in `lesson-script.json`) | Contents | Delivered? |
|---|---|---|
| `payload.nodes` (`:365-2214`) | Per-KC ORIENTATION, EXPLANATION, MENTAL_MODEL, EXPERT_THINK_ALOUD, CONTRAST, WORKED_EXAMPLE, RECAP prose blocks; `route_eligibility` for all 4 routes | **No** |
| `payload.activities` (`:2215-3332`) | 11 activities/KC incl. `WORKED_EXAMPLE` instruction step (`activity_role: WORKED_EXAMPLE`, `item_binding_id: null`, `:2242-2265`) | **No** |
| `payload.question_evidence_plan` (`:4368-5705`) | 40 scored items (10/KC) | **Yes — only this** |

`lessonContentProvider.getNormalizedLesson` → `normalizeLesson` reads **only**
`payload.question_evidence_plan` (`normalize.ts:51-59, 251-252`). The renderer
(`renderNormalizedLessonRun`, `normalized-lesson-runtime.ts:484-544`) walks only the
normalized items. Therefore every authored teaching node, every worked example, and every
authored post-commitment rationale is **absent from the delivered STANDARD route**. The
`kc-coverage-matrix.json` route-coverage rows nonetheless mark all four routes
`coverage_status: "CONTENT_AUTHORED"` (`:230-329`) and declare `exact_reentry_refs`
(`:220-223`) — intent the delivery engine never realizes.

**Route applicability (resolutions §4):** `route_policy_ref` declares
`CONCISE/STANDARD/MISCONCEPTION/PREREQUISITE_SUPPORT` with
`production_resolution: "BLOCKED_SHARED_RUNTIME"`, `entry_check_can_select_route: false`,
governing hold `V3-HOLD-110009` (`lesson-script.json:349-364`). The runtime serves ONE
linear sequence with no route branching. There is no structural route-proof record; per
resolutions §4, non-STANDARD route applicability is unproven and **blocks lesson-level
approval** independent of any single dimension.

**Global evidence posture (`lesson-quality-report.json`):** `script_gate` PASS on
content-only checks but `SME_SOURCE_FACTUAL_REVIEW`, `LEARNING_SCIENCE_REVIEW`,
`BLIND_SOLVE`, `SOURCE_RIGHTS_REVIEW` = `BLOCKED` (`:229-271`); `presentation_gate`
`BROWSER_QA_SHARED_RUNTIME` = `BLOCKED_SHARED_RUNTIME`, `HUMAN_ACCESSIBILITY_REVIEW` =
`BLOCKED` (`:272-295`); `integrated_gate` all `BLOCKED` (`:296-351`); every human reviewer
role `BLOCKED_EXTERNAL_HUMAN_REQUIRED` (`:150-210`); `final_gate_status: BLOCKED`,
`release_eligibility: INTERNAL_DRAFT_ONLY` (`:414-415`). Consequently the **entire Rendered
Experience Gate lacks its revision-bound evidence bundle** (rubric v0.4 §8.8 fail-closed;
the equivalent rule is rubric `0.9.1` §7.1 "Identity and fail-closed rules"). Where
a blocking defect is nonetheless demonstrable from the exact-build code + unit tests, it is
recorded as a `FAIL` candidate (precedence `FAIL > BLOCKED`); otherwise `BLOCKED`.

---

## 3. Verdict summary (agent proposed only)

| Dim | Name | Proposed verdict | Evidence sufficiency | Root-cause owner? |
|---|---|---|---|---|
| C01 | Transfer validity | PASS (candidate) | BLOCKED (blind-solve/SME) | own |
| C02 | Instructional adequacy | PASS (authored) / defect at delivery | BLOCKED (learning-science) | own; delivery → X01 |
| C03 | Distractor & error-model | **FAIL (candidate)** | BLOCKED (SME) — cue demonstrable | own |
| C04 | Prompt clarity | **FAIL (candidate)** | BLOCKED (blind-solve) — rejection demonstrable | own |
| C05 | Repair quality | **FAIL (candidate)** | SUFFICIENT (code+tests) | own |
| C06 | DOK appropriateness | BLOCKED | BLOCKED (no authored DOK + no SME) | own |
| X01 | Presentation→UI fidelity | **FAIL (candidate)** | code-demonstrable; browser BLOCKED | own (teaching omission) |
| X02 | Focus / pacing / clarity | BLOCKED | BLOCKED (no viewport/novice evidence) | own |
| X03 | Feedback & scaffolding | **FAIL (candidate)** | code-demonstrable; focus/assistive-technology evidence BLOCKED | own (generic feedback) |
| X04 | Meaningful interaction/representation | BLOCKED | BLOCKED (no rendered-rep evidence) | own |
| X05 | Accessibility & construct equivalence | BLOCKED | BLOCKED (no a11y/VoiceOver receipt) | own |
| X06 | Responsive / recovery / branch completion | **FAIL (candidate)** on start-recovery; matrix BLOCKED | start dead-end code-demonstrable; matrix BLOCKED | own |

No composite average (locked decision). Any one `FAIL`/`BLOCKED` prevents approval.

---

## 4. Authored Content Gate

### LQR-C01 — Transfer validity — proposed PASS (candidate); adjudication BLOCKED

**Applies to:** each KC's `CHANGED_EXIT` (`candidate_evidence_modes: ["TRANSFER"]`,
e.g. `lesson-script.json:4567`).

**Strengths / strongest candidate example (`LQA-C01-P01` corroborated).** Units near→changed
reverses direction while preserving the governed construct:
- near `prompt-qms-units-near` — L→mL, key `1.25 L × (1,000 mL / 1 L) = 1,250 mL`
  (`protected-items.json:119-151`; QEP `lesson-script.json:4501-4533`).
- changed `prompt-qms-units-changed` — mL→L, key `240 mL × (1 L / 1,000 mL)`
  (`protected-items.json:152-184`; QEP `:4534-4567`), with
  `construct_preserving_change.preserved_construct` = "Choose and apply a supplied conversion
  factor so the starting unit cancels and the requested unit remains",
  `changed_dimension: "direction"` (`:4551-4554`). Substantive situational change, KC and
  success condition preserved, fresh family (`fam-…-changed_exit-initial`) → clean transfer.

**Boundary (candidate `LQA-C01-B01`-style, SME needed).** Ratios changed-exit shifts from
proportion→percent (near `prompt-qms-ratios-near`, "18/60 → 30%",
`protected-items.json:684-715`) to **probability→expected-count** (changed
`prompt-qms-ratios-changed`, "0.16 on 50 trials → 8", `:717-748`). The KC competency covers
both probability and proportion, but whether rate×trials preserves the *same reasoning
construct* or tests a different sub-skill is a construct-identity SME decision.

**Evidence / reviewer gaps.** `INDEPENDENT_BLIND_SOLVER` and `DOMAIN_FACTUAL_REVIEWER`
unassigned (`lesson-quality-report.json:164-198`). `DOMAIN_FACTUAL_REVIEWER` is a legacy
artifact role name; it resolves to `DOMAIN_CONSTRUCT_SME` (rubric §7.4 alias map). No keyless blind-solve → C01 required
evidence incomplete; PASS is agent-proposed only.

### LQR-C02 — Instructional adequacy — proposed PASS (authored); DELIVERY defect (→ X01)

**Applies to:** every required KC on every applicable route.

**Strengths (authored).** Teaching is authored per KC (`nodes:365-2214`): orientation
("A conversion is not a hunt for a remembered list… orient that factor so the unit you are
leaving cancels", `:406`), explanation (units-as-labels, `:432`), mental model (`:458`),
expert think-aloud (cue→principle→operation→check, `:483-484`), plus worked-example and
recap nodes; `kc-coverage-matrix.json` maps `explanation_node_ids`, `mental_model_node_ids`,
`worked_example_node_ids`, `guided/light/solo` activities, exits, repair, recap for all four
routes (`:174-329`). Entry checks are legitimately low-stakes: "Not sure" option, node states
it "cannot select a route, satisfy an exit, or establish mastery" (`:380`), matching the
rubric's low-stakes discovery rule.

**Blocking defect — but assigned to X01 (non-counting here).** The delivered STANDARD route
teaches **nothing**: the runtime renders only the 40 scored QEP items (`normalize.test.ts:143`
asserts all scored, no worked example), so a learner who knows prerequisites but not the KC
receives entry→guided→light→solo→four exit questions with no orientation, model, or worked
reasoning. This violates C02's PASS requirement that "every consequential demand traces to
prior teaching on the route." Per resolutions §5 the root cause (renderer ignores authored
teaching) is owned by **X01**; recorded here as a non-counting cross-reference so it is not
double-blocked.

**Evidence / reviewer gaps.** `LEARNING_SCIENCE_REVIEW` and SME `BLOCKED`
(`lesson-quality-report.json:249,164-167`); guided practice is a single item/KC and the
worked example is one prose block — adequacy of intermediate-decision exposure needs
learning-science SME.

### LQR-C03 — Distractor and error-model quality — proposed FAIL (candidate); adjudication BLOCKED

**Owns:** keys, distractors, authored observable-error mappings.

**Strengths.** MCQ distractors mostly encode real confusions: units near offers the reciprocal
factor with tell-tale wrong units "`1.25 L × (1 L / 1,000 mL) = 0.00125 L²/mL`" and an
additive trap (`learner-safe-items.json:59-63`); exit items carry
`observable_response_feature_mapping` with first-invalid-step repair actions
(`feature-qms-units-factor-orientation` `protected-items.json:137-143`;
`feature-qms-precision-round-final-result` `:419-425`;
`feature-qms-ratios-denominator-selection` `:701-707`;
`feature-qms-notation-exponent-operation` `:985-991`).

**Blocking defect (candidate) — fixed-position correct-answer bias.** Across the MCQ set the
correct option is the **first substantive option** in the large majority of items (units KC:
all 8 MCQ keys at index 0; precision/ratios/notation: mostly index 0, a few at index 1);
"Not sure" is always last. The renderer preserves source order and never shuffles
(`normalize.ts:101-104` `mapStringOptions`; `CatalogLesson.tsx:326-343`), so the ordering is
deterministic at delivery. A test-wise learner can pass exits by heuristic ("pick the first
real option") — matching the C03 FAIL condition "the correct answer is signaled by
presentation … measures test-taking cues rather than the target construct." This is a **new
candidate** beyond the anchor set; needs SME to confirm exploitability and a fix
(position-balance or delivery-time shuffle).

**Boundary (`LQA-C03-B01` corroborated).** notation-near lists "`24 × 10^-3`"
(`learner-safe-items.json:452`), numerically equal to the key "`2.4 × 10^-2`" and only wrong
because the prompt says "normalized" and the rationale names 24×10⁻³ as the pre-normalized
form (`protected-items.json:993`). Plausible distractor vs defensible alternate answer —
PASS only while "normalized" is salient.

**Evidence / reviewer gaps.** `QUESTION_EVIDENCE_REVIEWER` / SME `BLOCKED` — the legacy
name resolves to `DOMAIN_CONSTRUCT_SME` (rubric §7.4 alias map)
(`lesson-quality-report.json:176-179`). Authored observable-error mappings are never
delivered (see X03).

### LQR-C04 — Prompt clarity — proposed FAIL (candidate); adjudication BLOCKED

**Owns:** prompts, directions, ability to express a valid response.

**Blocking defect — unstated response-entry convention on exact-text short items
(`LQA-C04-F01` + `SYN-C04` corroborated; "exact-text responses" focus item).** All
`SHORT_RESPONSE` items score by `NORMALIZED_TEXT_EXACT_MATCH_WITH_AUTHORED_EQUIVALENTS_ONLY`,
and the engine's `normalizeText` only trims and collapses whitespace
(`normalized-lesson-runtime.ts:162`, `:175-197`). Strongest instance —
`prompt-qms-notation-light`: prompt "Write 0.00072 in normalized scientific notation."
(`learner-safe-items.json:429`) with directions "Commit one response before feedback
appears." (no format guidance); accepted set is only "`7.2 × 10^-4`" / "`7.2×10^-4`"
(Unicode ×, caret; `protected-items.json:926-928`). Equivalent learner inputs `7.2e-4`,
`7.2 x 10^-4` (ASCII x), `7.2*10^-4` are scored **incorrect** for notation, not the construct.
The pattern repeats across every short item (units-light `2.5 m`/`2.5m` rejects `2.50 m`,
`2.5 meters`; units-solo `3600 mm`/`3600mm` rejects `3,600 mm`; precision-light `0.0048`
rejects `4.8e-3`; ratios-light `25%` rejects `0.25`/`25 percent`; notation-solo
`2.5 × 10^7`). Matches FAIL condition "the key depends on an unstated convention."

**Strengths.** MCQ prompts are generally explicit and self-contained (supply quantity,
factor, requested unit).

**Boundary (`LQA-C04-B01`).** notation-near's single word "normalized" is what makes
`24 × 10^-3` incorrect (`learner-safe-items.json:447-452`); removing it is the paired
synthetic FAIL.

**Evidence / reviewer gaps.** No keyless blind-solve to enumerate the equivalent-form
rejection rate (`INDEPENDENT_BLIND_SOLVER` BLOCKED).

### LQR-C05 — Repair quality — proposed FAIL (candidate); adjudication SUFFICIENT (code+tests)

**Owns:** authored repair graph and fresh re-entry design. ("missing re-entry semantics" focus item.)

**Authored strength.** Each KC authors a bounded repair→fresh-re-entry design: targeted
`REPAIR_CONFIRMATION` (near + changed) + a fresh exact re-entry in a *different* context
(near re-entry uses trail 0.62 km vs the near exit's solution volume,
`protected-items.json:213-238`), with
`post_failure_authoring_handoff: "AFTER_ONE_AUTHORED_REPAIR_CYCLE, A_FURTHER_MISS_REQUIRES_PLANNER_HANDOFF; NO_LOCAL_REPAIR_LOOP_IS_AUTHORED"`
(`lesson-script.json:2412,2437,2462`) and coverage `exact_reentry_refs`
(`kc-coverage-matrix.json:220-223`). On paper this is a strong C05 design.

**Blocking defect — the authored fresh re-entry is never delivered (`LQA-C05-F01`
corroborated; authored-vs-delivered).** The L2 re-entry items carry
`activity_id` = `qms-units-activity-near_exit-near_use` / `…-changed_exit-changed_task`
(`lesson-script.json:2421,2471`) and no `exact_reentry_for`. The normalizer's re-entry test
reads only `activity_id.includes('reentry')` or `exact_reentry_for`
(`normalize.ts:74-78`), so **`isReentry` is false for every L2 item**
(`normalized-lesson-runtime.test.ts:178` asserts exactly this). Consequently:
- On a miss of any exit, `advance()` diverts to the repair confirmation, then — with no item
  recognized as re-entry — returns `status: BLOCKED` (`normalized-lesson-runtime.ts:281-300`).
  `normalized-lesson-runtime.test.ts:167-189` asserts a missed L2 exit ends `BLOCKED`.
- The authored fresh re-entry (`prompt-qms-units-reentryNear` …) is therefore **never
  administered after a miss**; the exact failed function is never re-checked. On the *no-miss*
  path those same items are (mis)delivered as extra baseline exits — four exit questions/KC
  with no repair linkage.
- Root cause: the re-entry signal lives in `item_binding_id` ("…reentry…"),
  `administration_stage` (`NEAR_USE`/`CHANGED_TASK`), and coverage `exact_reentry_refs` —
  none of which the L2 normalizer reads. Contrast L3, whose `exact_reentry_for` drives a
  working re-entry (`normalized-lesson-runtime.test.ts:135-165`).

Matches FAIL conditions "no usable fresh re-entry exists" and the miss path cannot re-check
the failed function. Demonstrable without a browser (code + green tests), so evidence is
SUFFICIENT for this finding. (The honest `BLOCKED` *termination* itself is a recovery-honesty
matter owned by X06 — see `LQA-X06-B01`.)

### LQR-C06 — DOK appropriateness and distribution — proposed BLOCKED

**Owns:** DOK targets, item DOK judgments, DOK rationale.

**BLOCKED.** No DOK target, item-level DOK judgment, or DOK rationale exists anywhere in the
L2 bundle (repository search for `dok`/`DOK`/`depth_of_knowledge`/`cognitive_depth` across
`content/lessons/v3-les-789208/` returns **zero** matches). The rubric sets `BLOCKED` when
"no defensible target, item judgment, or DOK rationale can be tied to the KC, phase, and
exact lesson revision." A distribution is observable (entry recall → exit application/
inference, e.g. probability→expected-count is plausibly DOK 2), but with no authored target
and `DOMAIN_FACTUAL_REVIEWER` BLOCKED, C06 cannot be scored. Candidate synthetic anchors
(label-inflation) should be built on L3 per `synthetic-defects-analysis.md:354-368`.

---

## 5. Rendered Experience Gate

*Whole-gate caveat:* no revision-bound evidence bundle exists (§2). Findings below marked
"code-demonstrable" are derived from the exact-build source + unit tests; all browser,
viewport, focus, contrast, and VoiceOver confirmations are BLOCKED.

### LQR-X01 — Presentation-to-UI fidelity — proposed FAIL (candidate); browser BLOCKED

**Owns:** semantic authored-to-rendered fidelity. (Primary owner of "omitted presentation/teaching".)

**Blocking defect — required teaching omitted from delivery (code-demonstrable).** The
authored teaching layer (nodes + WORKED_EXAMPLE activities, §2) never renders: normalization
consumes only `question_evidence_plan` (`normalize.ts:251-252`), and `normalize.test.ts:143`
confirms all 40 delivered items are scored with no worked example. The FEEDBACK/QUESTION/
EXPOSITION render paths (`normalized-lesson-runtime.ts:507-543`) have no source for node
prose. Result: orientation, explanation, mental model, expert think-aloud, worked example,
and recap — all authored, all eligible for STANDARD — are dropped. Matches X01 FAIL
"required teaching, directions, visuals, support, rationale … are omitted."

**Cross-references (non-counting).** Feedback-rationale omission → X03; representation
(cancellation ledger) omission → X04.

**Boundary (`LQA-X01-B01` corroborated).** The presentation plan heads the units changed
exit "Changed-task check: Convert units and dimensions" (`lesson-presentation-plan.json:447-448`),
but delivery uses the learner-safe `phase_label` "Final check"
(`learner-safe-items.json:70`; render heading = `projection.title` at
`normalized-lesson-runtime.ts:537`). The operation survives; the KC-orienting wording is
dropped — reviewers decide whether this drift is semantically faithful. It also shows the
presentation plan is organized around `script_node_ids` the runtime never consults.

**Evidence gaps.** Exact artifact-to-screen capture BLOCKED (`presentation_gate` BLOCKED).

### LQR-X02 — Cognitive focus, pacing, visual clarity — proposed BLOCKED

**Owns:** focus, pacing, hierarchy, competing chrome.

**BLOCKED.** No viewport captures, novice walkthrough, or timing evidence
(`presentation_gate.BROWSER_QA_SHARED_RUNTIME` BLOCKED).

**Candidate observations (code).** PASS-supporting: one `<h1>` heading, one `fieldset`/
`legend` prompt, one primary Submit + secondary Skip + "Pause and return", single-column
screen, deterministic focus-to-heading on each screen change
(`CatalogLesson.tsx:159-192, 317-360`; focus rAF `:62-67`); progress label "Concept X of Y"
(`:148-151`). Concerns needing capture: (a) teaching omission (§2/X01) yields a long
test-only run — 32 bare questions on the happy path with four exit questions/KC and no
teaching between (pacing/fragmentation, cross-ref X01, non-counting); (b) whether the L2
route renders inside global `AppShell` chrome during focused instruction (the `LQA-X02-F01`
concern raised for L1) is unconfirmed for L2 and needs a viewport capture.

### LQR-X03 — Feedback and scaffolding quality — proposed FAIL (candidate); focus/assistive-technology evidence BLOCKED

**Owns:** delivered post-commitment feedback, support presentation, focus. ("generic feedback" focus item.)

**Blocking defect — generic feedback on consequential items (code-demonstrable).** The
FEEDBACK screen carries only `outcome: 'CORRECT' | 'INCORRECT'`
(`normalized-lesson-runtime.ts:469, 507-517`) and the UI renders exactly "Correct" / "Not
quite" plus Continue (`CatalogLesson.tsx:241-251`). The authored `post_commitment_feedback` /
`rationale` (e.g. units near "The conversion preserves the quantity while changing only its
unit label and scale", `protected-items.json:146`) is resolved server-side into
`ServerItemAnswer.rationale` (`lesson-content-provider.ts:199-205, 232`) and then **dropped
before render**. Authored observable-error repair actions are never surfaced. On consequential
exits this is the X03 FAIL "feedback is only generic praise, 'Correct,' or 'Not quite'." (Same
runtime/UI mechanism as `LQA-X03-F01`, which cites the L3 instance.)

**Candidate strength (code).** The feedback `<h1>` receives programmatic focus on the
FEEDBACK screen (`CatalogLesson.tsx:244` + focus rAF); a `role="status" aria-live="polite"`
region announces saving (`:182-184`). Announcement correctness needs assistive-technology capture (BLOCKED).

### LQR-X04 — Meaningful interaction and representation — proposed BLOCKED

**Owns:** interaction/representation warrant.

**BLOCKED.** No rendered-representation capture or accessible-alternative comparison
(`presentation_gate` / `HUMAN_ACCESSIBILITY_REVIEW` BLOCKED).

**Candidate observations.** Authored representations (`rep-qms-units-cancellation-ledger`,
tables, estimate/forecast strips) referenced by nodes and prompts are **not rendered as
representations** — the cancellation ledger lives in the omitted teaching layer (cross-ref
X01), and table/strip items appear only as prose ("A measurement table lists 6.4 and 2.3…",
`learner-safe-items.json:257`). Response modes largely match the operation (single-select of
a factor-orientation expression suits the changed-exit decision, akin to `LQA-X04-P01`); no
decorative/busywork interaction is present. The exact-text short input cannot reliably
express the authored notation (cross-ref C04). Whether prose-only representation preserves
the intended cognitive work is the `LQA-X04-B01` static-inspection boundary and needs SME +
rendered evidence.

### LQR-X05 — Accessibility and construct equivalence — proposed BLOCKED

**Owns:** accessibility semantics and construct equivalence.

**BLOCKED.** No keyboard trace, focus-order/visible-focus, contrast, 200%/320px reflow,
reduced-motion, target-size, or Safari+VoiceOver receipt exists
(`HUMAN_ACCESSIBILITY_REVIEW` BLOCKED; `ACCESSIBILITY_REVIEWER` unassigned,
`lesson-quality-report.json:200-203`).

**Candidate observations.** PASS-supporting (code): native `<input type="radio">` inside
`<label>` within a `fieldset`/`legend`, visible marker `aria-hidden`, text input has
`aria-label` (`CatalogLesson.tsx:322-353`); per-item `accessibility_alternative` present.
Boundary (`LQA-X05-B01`): the CatalogLesson radios' visual-hiding + `focus-within` styling
means real VoiceOver naming/order is unverified. Construct-equivalence concern: the
`accessibility_alternative` is an identical boilerplate string on every item
("available as ordered text … keyboard-only input", e.g. `learner-safe-items.json:20`) and
describes no actual representation — a non-blocking clarity concern while representations are
undelivered, but not a construct-equivalent alternative for any authored table/strip.

### LQR-X06 — Responsive behavior, recovery, branch completion — proposed FAIL (candidate) on start-recovery; matrix BLOCKED

**Owns:** state persistence, recovery, termination, responsive completion.

**Blocking defect (candidate) — unrecoverable initial-start failure (`LQA-X06-F01` +
`SYN-X06` corroborated; "start recovery" focus item).** `CatalogLesson` sets
`startAttempted.current = true` immediately before `start.mutate()`
(`CatalogLesson.tsx:38, 53-54`) and the auto-start effect is guarded by that ref
(`:50-52`), so a failed start is never retried. The error UI's "Try again" calls
`status.refetch()` + `run.refetch()` only (`:127-135`) — it never reissues `start` or resets
`startAttempted`. With `runState` still `NOT_STARTED`, `runEnabled` stays false and `view`
stays undefined, so the screen loops back to the same error state: a dead end reached before
any instruction. Server route exists (`normalizedLessonStart` `POST /v1/lessons/{slug}/start`,
`routes.ts:634-641`), so a transient start failure is realistic. `synthetic-defects-analysis.md:600-611`
independently models this as a FAIL (fix: "Try again" reissues the idempotent start).

**Candidate strengths.** (a) Honest terminal `BLOCKED` (`LQA-X06-B01`): after repair the run
BLOCKS with "Let's pause here… Your progress is saved" + Back-to-curriculum
(`normalized-lesson-runtime.ts:259,300`; `CatalogLesson.tsx:254-267`) — no strand/loop/
fabricated pass; recovery honesty is separable from the C05 pedagogical incompleteness.
(b) Revision-pinned persistence: the run stores `definitionHash`; restore rejects a stale/
mismatched revision and round-trips a mid-run blob
(`normalized-lesson-runtime.ts:556-591`; `normalized-lesson-runtime.test.ts:192-211`).

**BLOCKED remainder.** The full desktop/375px/320px + 200% zoom + refresh/reconnect +
save-failure viewport-and-recovery matrix has not been executed against this build
(`BROWSER_QA_SHARED_RUNTIME` BLOCKED), so the dimension beyond the start-recovery finding is
BLOCKED.

---

## 6. Strongest three findings

1. **Delivered route teaches nothing (X01, code-demonstrable).** The authored teaching layer
   (`nodes:365-2214` + WORKED_EXAMPLE activities `:2242…`; all routes `CONTENT_AUTHORED` in
   coverage) is discarded because the runtime normalizes only `question_evidence_plan`
   (`normalize.ts:251-252`; `normalize.test.ts:143`). The learner receives 40 bare scored
   questions with no orientation, model, or worked reasoning — the single largest
   authored-vs-delivered gap.

2. **Missing re-entry semantics → miss = dead end (C05, evidence SUFFICIENT).** L2 re-entry
   items are keyed `…near_exit-near_use`/`…changed_exit-changed_task` with no
   `exact_reentry_for`, so `deriveIsReentry` (`normalize.ts:74-78`) returns false for all of
   them; a missed exit serves one repair then `BLOCKED` and the authored fresh re-entry is
   never administered (`normalized-lesson-runtime.ts:281-300`; test `:167-189`). The exact
   failed function is never re-checked despite fully authored re-entry content
   (`kc-coverage-matrix.json:220-223`).

3. **Generic feedback on consequential items (X03, code-demonstrable).** Delivered feedback
   is only "Correct"/"Not quite" (`CatalogLesson.tsx:241-251`; outcome-only screen
   `normalized-lesson-runtime.ts:507-517`); the authored rationale + observable-error repair
   are resolved server-side (`lesson-content-provider.ts:199-205, 232`) and then dropped.

*Runners-up (also strong):* C04 exact-text short-answer scoring with no stated convention
(notation-light, `protected-items.json:926-928` vs `normalizeText` `:162`); C03 fixed
first-position correct-answer bias; X06 unrecoverable start failure.

---

## 7. L2 candidate anchor inventory (agent-proposed; `adjudication_evidence_status` per row)

| Anchor use | Dim | case_kind | proposed | source_inspection | adjudication | Key refs |
|---|---|---|---|---|---|---|
| units near→changed direction reversal | C01 | CLEAR_PASS | PASS | PRESENT | BLOCKED | script:4501-4567; protected:119-184 |
| ratios changed proportion→expected-count | C01 | BOUNDARY | BLOCKED | PRESENT | BLOCKED | protected:684-748 |
| fixed first-position correct-answer bias | C03 | CLEAR_FAIL (new) | FAIL | PRESENT | BLOCKED | learner-safe MCQ set; CatalogLesson:326-343 |
| notation-near "24×10⁻³" normalized distractor | C03 | BOUNDARY | PASS | PRESENT | BLOCKED | learner-safe:444-457; protected:967-999 |
| notation-light exact-text, no convention | C04 | CLEAR_FAIL | FAIL | PRESENT | BLOCKED | learner-safe:426-434; protected:911-938; runtime:162 |
| notation-near "normalized" salience | C04 | BOUNDARY | PASS | PRESENT | BLOCKED | learner-safe:444-457 |
| miss→repair→BLOCKED, no fresh re-entry | C05 | CLEAR_FAIL | FAIL | PRESENT | NOT_REVIEWED (code SUFFICIENT) | normalize.ts:74-78; runtime:281-300; test:167-189 |
| no authored DOK target | C06 | — | BLOCKED | PRESENT | BLOCKED | bundle-wide (0 DOK fields) |
| teaching layer omitted at delivery | X01 | CLEAR_FAIL | FAIL | PRESENT | BLOCKED (browser) | normalize.ts:251-252; test:143; nodes:365-2214 |
| "Changed-task check" vs "Final check" heading drift | X01 | BOUNDARY | PASS | PRESENT | BLOCKED | presentation:447-448; learner-safe:70; runtime:537 |
| "Correct"/"Not quite" only | X03 | CLEAR_FAIL | FAIL | PRESENT | BLOCKED (focus/assistive technology) | runtime:507-517; CatalogLesson:241-251 |
| CatalogLesson hidden radios (VoiceOver) | X05 | BOUNDARY | BLOCKED | PRESENT | BLOCKED | CatalogLesson:322-343 |
| start-failure "Try again" dead end | X06 | CLEAR_FAIL | FAIL | PRESENT | BLOCKED (browser) | CatalogLesson:38,50-55,127-135 |
| honest terminal BLOCKED after repair | X06 | BOUNDARY | PASS | PRESENT | BLOCKED | runtime:259,300; CatalogLesson:254-267 |

All rows remain `CANDIDATE_PENDING_REVIEW`; synthetic single-transform variants for C03/C04/
C05/X06 already specified in `synthetic-defects-analysis.md` (§4.4, §4.5, §4.12).

---

## 8. Concerns, limitations, and reviewer/evidence gaps

- **Not gold, not gating.** All verdicts are agent recommendations. No blind-solve, SME,
  learning-science, source-rights, accessibility, or browser evidence exists for
  `bce80104…fb754` (`lesson-quality-report.json:150-351`). The whole Rendered Experience Gate
  is fail-closed `BLOCKED` for gold; code-demonstrable defects are flagged `FAIL` candidates
  under precedence only.
- **Owner-boundary discipline (resolutions §5).** The single root defect "renderer ignores
  authored layers" surfaces in C02/X02/X04 as well as X01/X03; it is blocked once (X01
  teaching, X03 feedback) with non-counting cross-references elsewhere to avoid duplicate
  blocking findings.
- **Route applicability unproven.** Four routes are authored but delivery has no route
  branching and no structural route-proof (`route_policy_ref` `BLOCKED_SHARED_RUNTIME`); per
  resolutions §4 this blocks lesson-level approval regardless of per-dimension outcomes.
- **Fix locality.** C05/X01 re-entry + teaching gaps stem from the L2 normalizer reading
  `activity_id`/`question_evidence_plan` only; the authored intent is intact
  (`item_binding_id`, `administration_stage`, coverage `exact_reentry_refs`, `nodes`), so
  these are delivery/normalization defects, not authoring-content defects — relevant when
  Lesson 2 remediation is scoped (baseline is frozen; a fix requires a new source hash).
- **Domain accuracy unverified.** Keys read as arithmetically sound on inspection, but SME
  confirmation (e.g., significant-figures conventions, √50 bracketing under the ratios KC,
  probability→expected-count construct identity) is `BLOCKED`.
- **Scope compliance.** This run wrote only
  `key-docs/lesson-quality-sources/current-l2-analysis.md`; no lesson artifact, code, test,
  rubric, anchor, config, or other report was modified.
