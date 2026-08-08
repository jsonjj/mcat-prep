# Synthetic Single-Defect Lesson-Quality Calibration Suite

**Status:** DESIGN COMPLETE — CANDIDATE PROPOSALS ONLY
**Rubric authority:** `key-docs/lesson-quality-rubric.md` v0.4
**Current anchor catalog:** `key-docs/lesson-quality-rubric-anchors.md` v0.1-draft
**Machine contract reviewed:** `tests/evals/lesson-quality/anchors/anchor-set.schema.json`
**Controlling run decisions:** `key-docs/lesson-quality-sources/rubric-authority-resolutions.md`
**Date:** 2026-08-03
**Scope:** One matched clear-pass/clear-fail pair and one boundary case for each of
`LQR-C01`–`LQR-C06` and `LQR-X01`–`LQR-X06`

This report is a design artifact. It does not modify the rubric, anchor catalog,
machine-readable anchor set, lessons, application code, or tests. The case IDs below
are working IDs, not registered anchors.

> **Currency notice** (added 2026-08-03, cross-document correction wave). The rubric `v0.4`
> and anchor-catalogue `v0.1-draft` pins above are the versions actually read when this
> suite was designed, and are preserved for that reason. **The current standard is rubric
> `0.9.1` with anchor-set `0.9.1-candidate`.** Three changes matter most for reading the
> designs below. Criterion wording and dimension ownership boundaries moved, so a case
> designed to isolate one dimension under v0.4 may not isolate it under `0.9.1` — C01/C02,
> C02/X01, and C03/C05 boundaries in particular were re-drawn. An exclusion check must now
> compare **byte-identical adjacent deciding facts** between the two variants, not argue
> that the adjacent verdict is unchanged; every exclusion note below is therefore intent
> pending computation. And no case may be run as a pair until both variants exist and are
> hashed (`pair_runnable`). Nothing here has been re-derived against `0.9.1`.

## 1. Result and authority limits

The proposed suite contains 36 working cases:

- 12 source-matched clear-pass controls;
- 12 clear-fail variants, each differing from its pass control by one material fact;
  and
- 12 boundary variants, each differing from a named source-derived comparator by one
  material fact.

Every verdict in this report is an **expected proposed verdict**, never a gold label
or current evaluation result. All cases remain `CANDIDATE_PENDING_REVIEW`; any
candidate export must keep `gold_verdict: null`. Under the controlling run decisions,
the source shapes are `source_inspection_status: PRESENT`, while the unmaterialized
synthetic cases are `adjudication_evidence_status: NOT_REVIEWED`. The legacy
`current_evidence_status` field in the v0.1 candidate schema is not treated as
adjudication readiness.

Once a case is materialized, evaluation precedence is `FAIL > BLOCKED > PASS`: a
revision-bound demonstrated blocking defect produces `FAIL`; otherwise missing
required evidence produces `BLOCKED`; only complete evidence can produce `PASS`.
Expected verdicts and eventual adjudicated verdicts must remain outside judge input
during calibration.

The suite tests rubric discrimination. It does not establish lesson efficacy, learner
outcomes, mastery calibration, broad accessibility, or production readiness.

## 2. Single-defect construction contract

### 2.1 Source-derived control

Each trio starts from an exact, hash-bound source shape in Lessons 1–3. A control may
neutralize unrelated source defects before pairing, but that neutralized control must
be materialized once, hashed, and shared byte-for-byte by its pass and fail cases.
Neutralization work is not itself an anchor and cannot vary between the pair.

This is essential for `LQR-C02`: the current trigonometry route bundles several
special-angle omissions. A clean pair cannot call a partial repair a pass.

### 2.2 One material fact

A material fact is one semantic variable that can change the target dimension's
verdict. Examples are:

- whether one required relation was taught;
- whether one accepted answer was classified as an error;
- whether global lesson chrome is present;
- whether one control has a programmatic label; or
- whether a recovery action actually retries the failed command.

Mechanical consequences of that one fact—new hashes, regenerated projections, a
corresponding answer-key value, or an accessibility-tree capture—do not count as
additional transforms only when they are deterministic and recorded. A second manual
content, behavior, styling, routing, scoring, or accessibility change invalidates the
case.

### 2.3 Pair and boundary rules

For every clear pair:

1. The pass control and fail variant use the same source revision, route, item or
   screen, branch preconditions, and evidence recipe.
2. The fail variant applies one named transform.
3. All non-target blocking criteria are invariant and must have evidence.
4. The pair is rejected if another rubric dimension would change verdict for an
   independent reason.
5. Route coverage follows the controlling universe—`STANDARD`, `CONCISE`,
   `MISCONCEPTION`, and `PREREQUISITE_SUPPORT`—using the structural route-proof record
   as the sole applicability authority.

For every boundary case:

1. The comparator is named.
2. One near-line transform is applied.
3. The proposed verdict may be `PASS`, `FAIL`, or `BLOCKED`.
4. `BLOCKED` is used when the deciding construct or evidence is genuinely unavailable;
   it is not a substitute for an uncertain guess.

### 2.4 Common fixture receipts

Every materialized case needs:

- source lesson ID and frozen source SHA-256;
- route applicability proof or an authoritative `NOT_APPLICABLE` absence proof;
- exact source refs and an extracted input manifest;
- a semantic-diff receipt naming one material fact;
- hashes for control, variant, and all deterministic derivatives;
- rubric, prompt, model, and fixture versions;
- target-dimension evidence plus exclusion checks for adjacent dimensions;
- separate `source_inspection_status` and `adjudication_evidence_status` values;
- proposed verdict stored separately from judge input;
- required reviewer roles and empty receipts before review; and
- an adjudication record before any promotion to `GOLD_APPROVED`.

For rendered cases, screenshots alone are insufficient. Dynamic behavior requires
DOM/accessibility-tree state, action traces, focus traces, request logs, checkpoint
assertions, or assistive-technology review as applicable.

## 3. Repairs required by the supplied anchor-review findings

The current catalog remains authoritative as a candidate inventory, but the following
source-inspected hypotheses should be superseded when the suite is materialized. No
severity, confirmation, or human approval is inferred:

1. **`LQR-C02` special-angle completeness.** Adding a model for only selected
   30°/45° facts does not establish adequacy for a route that also demands 60° use and
   multiple 45° relations. The repaired control teaches every consequential
   special-angle fact; the fail deletes one 45° relation only.
2. **`LQR-X02` shared-shell contamination.** Comparing an L3 question screen with an
   L1 route does not isolate focus because L1, L2, and L3 all sit under the same
   `AppShell`. The repaired pair uses the exact same lesson screen and toggles one
   focused-shell mode.
3. **`LQR-X04` control/fidelity overlap.** Collapsing an authored three-field response
   into one short input also fails `LQR-X01`. The repaired pair keeps authored and
   rendered behavior aligned and changes only whether an auxiliary interaction exposes
   a KC relationship or produces decoration.
4. **`LQR-X05` multi-change accessibility control.** Simultaneously adding labels,
   errors, focus management, keyboard behavior, and an alternative cannot serve as a
   single-defect pass control. The repaired pair starts from the current native-radio
   shape and changes one label association.
5. **`LQR-X06` repair-quality contamination.** A pedagogically incomplete repair
   branch invokes `LQR-C05` regardless of whether it terminates honestly. The repaired
   X06 cases occur before any lesson item or repair and vary only start-failure
   recovery.

## 4. Proposed 36-case suite

### 4.1 LQR-C01 — Transfer validity

**Source shape:** L3 logarithm near/changed exits:
`content/lessons/v3-les-844372/lesson-script.json:3376-3445` and
`content/lessons/v3-les-844372/learner-safe-items.json:321-342`.

**Clear pair — `SYN-C01-P` / `SYN-C01-F`**

- **Pass control:** Preserve the source changed task
  `log10(n / 5) = 2 → n`, which starts in logarithmic form and requires inverse-form
  conversion plus restoration of the outer scale. Expected proposed verdict:
  `PASS`.
- **One transform:** Replace only the changed task's governing relation with a
  numeric/variable clone of the near task's exponential-isolation relation. Symbols
  and numbers may change, but the solution-path shape becomes the same as the near
  task. Regenerate the key mechanically. Expected proposed verdict for the fail
  variant: `FAIL`.
- **Invariants:** KC and success condition; route and assistance level; response type;
  semantic-family separation and freshness; first-attempt policy; no pre-commit cue;
  difficulty range; uniquely defensible key; and all teaching needed by both forms.
- **Evidence needed:** Taught-model/near/changed trace; semantic-structure diff;
  family-exposure ledger; protected key and rationale; source/variant hashes; two
  keyless blind solves; an SME construct comparison; and explicit confirmation that
  no BKT/evidence eligibility claim is being inferred from the transfer judgment.
- **Reviewer roles:** `PRODUCT_PEDAGOGY_OWNER`, `DOMAIN_CONSTRUCT_SME`,
  `INDEPENDENT_BLIND_SOLVER`.
- **Why isolated:** The changed-task shape is the only semantic variable. Teaching,
  clarity, distractors, scoring, support, and delivery stay fixed, so a verdict change
  can be attributed to substantive versus cosmetic transfer.

**Boundary — `SYN-C01-B`**

- **Comparator and one transform:** Starting from the real L3 graph near task, change
  only the graph scale from linear to semilog, matching the source changed-task shape
  at `lesson-script.json:2711-2780`.
- **Expected proposed verdict:** `BLOCKED` until the governed KC is fixed as broad
  graph decoding or narrow signed-slope execution.
- **Invariants:** Data values, response format, assistance, family freshness, prompt
  complexity, key validity, and all non-scale graphical cues.
- **Evidence needed:** Exact graph pair; KC scope and non-goals; solution-path
  comparison; keyless solves; and a written SME construct decision.
- **Reviewer roles:** `PRODUCT_PEDAGOGY_OWNER`, `DOMAIN_CONSTRUCT_SME`,
  `INDEPENDENT_BLIND_SOLVER`.
- **Why isolated:** Only scale type changes. `BLOCKED` records the missing construct
  boundary without inventing a human conclusion.

### 4.2 LQR-C02 — Instructional adequacy

**Source shape:** L1 trigonometry teaching and special-angle demands:
`content/lessons/v3-les-130923/lesson-script.json:495-633`,
`:3383-3637`, and `:3711-3776`.

**Clear pair — `SYN-C02-P` / `SYN-C02-F`**

- **Pass control:** Materialize a source-shaped trigonometry route whose pre-exit
  model explicitly teaches every special-angle relation later demanded: the relevant
  30° and 60° sine/cosine values, equal legs at 45°, and the 45° leg-to-hypotenuse
  relation. Keep the source tasks and keys unchanged. Expected proposed verdict:
  `PASS`.
- **One transform:** Delete only the 45° leg-to-hypotenuse relation from the model.
  Keep the equal-legs fact and every 30°/60° fact. The unchanged `8√2` re-entry then
  requires one untaught relation. Expected proposed verdict for the fail variant:
  `FAIL`.
- **Invariants:** Objective, prerequisites, route profile, sequence, worked reasoning,
  guided/faded practice, all prompts and keys, all non-45° teaching, response
  controls, repair logic, rendering, and route-proof applicability across all four
  controlling route types.
- **Evidence needed:** Full special-angle demand inventory; item-to-instruction trace
  for every consequential task; source/control/variant semantic diff; deterministic
  route trace; protected keys; and SME verification of the complete table and deleted
  relation.
- **Reviewer roles:** `PRODUCT_PEDAGOGY_OWNER`, `DOMAIN_CONSTRUCT_SME`.
- **Why isolated:** The shared control closes every bundled special-angle omission.
  The pair differs only in whether one relation needed by one unchanged task was
  taught, eliminating the partial-completeness defect in the current candidate.

**Boundary — `SYN-C02-B`**

- **Comparator and one transform:** Use the real low-stakes L1 entry shape
  (`lesson-script.json:97-114`; `vector-lesson-runtime.ts:843-860`) and change only
  its consequence from “records a baseline only” to “selects the learner's route.”
- **Expected proposed verdict:** `FAIL`.
- **Invariants:** Entry prompt, honest abstention option, position before instruction,
  no answer-bearing feedback, and the full teaching sequence that follows.
- **Evidence needed:** Authored consequence declaration; event/run trace showing the
  route decision; mastery/evidence ledger; and source diff.
- **Reviewer roles:** `PRODUCT_PEDAGOGY_OWNER`, `DOMAIN_CONSTRUCT_SME`.
- **Why isolated:** Prompt quality and later teaching do not change. Only the
  consequentiality of pre-instruction discovery crosses the rubric's explicit line.

### 4.3 LQR-C03 — Distractor and error-model quality

**Source shape:** L3 system construction and its conflicting accepted-form mapping:
`content/lessons/v3-les-844372/lesson-script.json:3081-3133` and
`content/lessons/v3-les-844372/protected-items.json:98-120`.

**Clear pair — `SYN-C03-P` / `SYN-C03-F`**

- **Pass control:** Treat the protected accepted equation `2L + 2W = 22` as correct
  and do not attach an error-pattern route to that exact form. Expected proposed
  verdict: `PASS`.
- **One transform:** Classify that same accepted equation as
  `PERIMETER_COEFFICIENT_NOT_SIMPLIFIED` and route it to targeted repair, while the
  scoring authority continues to accept it. Expected proposed verdict for the fail
  variant: `FAIL`.
- **Invariants:** Prompt, required fields, expected solution, accepted-response
  authority, all other error mappings, response format, route, and learner-visible
  wording.
- **Evidence needed:** Prompt and field schema; complete accepted-answer set; error
  map; route lookup trace for the exact response; protected rationale; and SME
  equivalence review.
- **Reviewer roles:** `PRODUCT_PEDAGOGY_OWNER`, `DOMAIN_CONSTRUCT_SME`.
- **Why isolated:** No prompt, key, UI, or feedback text changes. Only the protected
  classification of one response changes, directly testing whether a defensible
  answer is falsely authored as a misconception.

**Boundary — `SYN-C03-B`**

- **Comparator and one transform:** From L1 vector choice A's observable mapping
  (`packages/content/src/v3-vector-lesson-artifacts.ts:266-281`), change only the
  rationale wording from categorical cause language to “is consistent with adding
  unsigned magnitudes.”
- **Expected proposed verdict:** `PASS`, with no learner-trait claim.
- **Invariants:** Choice text, key, observable arithmetic feature, repair destination,
  protected status, and learner-facing feedback.
- **Evidence needed:** Choice-to-feature map; key; repair target; proof that no
  persistent learner trait is written; and SME review.
- **Reviewer roles:** `PRODUCT_PEDAGOGY_OWNER`, `DOMAIN_CONSTRUCT_SME`.
- **Why isolated:** Only epistemic strength inside the reviewer-side error model
  changes. Scoring, prompt clarity, and rendered feedback are constant.

### 4.4 LQR-C04 — Prompt clarity

**Source shape:** L2 normalized-scientific-notation short response and exact-text
scoring: `content/lessons/v3-les-789208/learner-safe-items.json:427-433` and
`content/lessons/v3-les-789208/protected-items.json:912-937`.

**Clear pair — `SYN-C04-P` / `SYN-C04-F`**

- **Pass control:** Use a plain-text response convention accepted by the synthetic
  scorer and state it explicitly in the prompt, for example: “Enter your answer in
  e-notation, such as `7.2e-4`.” Expected proposed verdict: `PASS`.
- **One transform:** Remove only the entry-convention sentence. Keep the input and
  exact accepted string unchanged, so mathematically equivalent forms are rejected
  under an unstated convention. Expected proposed verdict for the fail variant:
  `FAIL`.
- **Invariants:** Number, requested normalization, mathematical answer, control type,
  scorer, accepted string, assistance, feedback, and all accessibility semantics.
- **Evidence needed:** Learner projection; control capture; scorer inputs/outputs for
  common equivalent forms; source diff; and independent keyless blind solves.
- **Reviewer roles:** `PRODUCT_PEDAGOGY_OWNER`, `DOMAIN_CONSTRUCT_SME`,
  `INDEPENDENT_BLIND_SOLVER`.
- **Why isolated:** The item has no distractors and the scorer does not change. Only
  whether the learner is told the required syntax can explain the verdict change.

**Boundary — `SYN-C04-B`**

- **Comparator and one transform:** Introduce one non-semantic typo in the otherwise
  explicit pass prompt, such as `scientfic` for `scientific`.
- **Expected proposed verdict:** `PASS` with a non-blocking clarity finding.
- **Invariants:** Every number, unit, operation, convention, response format, and
  scoring interpretation.
- **Evidence needed:** Exact diff; keyless blind-solve notes confirming one
  interpretation; and accessibility text capture.
- **Reviewer roles:** `PRODUCT_PEDAGOGY_OWNER`, `DOMAIN_CONSTRUCT_SME`,
  `INDEPENDENT_BLIND_SOLVER`.
- **Why isolated:** The one typo tests the rubric's explicit non-blocking line without
  changing meaning, key uniqueness, operation, or access.

### 4.5 LQR-C05 — Repair quality

**Source shape:** L1 exact repair and re-entry path:
`services/lambdas/learner-api/src/vector-lesson-runtime.ts:699-752`,
`:938-1073`, and
`services/lambdas/learner-api/src/vector-lesson-runtime.test.ts:408-464`.

**Clear pair — `SYN-C05-P` / `SYN-C05-F`**

- **Pass control:** Keep repair-confirmation responses classified as process evidence
  only; a successful confirmation proceeds to the existing fresh exact re-entry, and
  only re-entry can close the failed exit. Expected proposed verdict: `PASS`.
- **One transform:** Change only the successful repair confirmation's evidence
  eligibility from non-exit process evidence to exit-success evidence. Delivery still
  proceeds through the same fresh re-entry so branch completion does not change.
  Expected proposed verdict for the fail variant: `FAIL`.
- **Invariants:** Miss, observable response feature, repair content, assistance bound,
  fresh family and item, re-entry delivery, repeated-failure handoff, UI, and
  checkpoint behavior.
- **Evidence needed:** Evidence-eligibility record; miss→repair→confirmation→re-entry
  trace; family exposure ledger; exit-credit ledger before and after confirmation;
  and exact semantic diff.
- **Reviewer roles:** `PRODUCT_PEDAGOGY_OWNER`, `DOMAIN_CONSTRUCT_SME`.
- **Why isolated:** The runtime branch remains safe and complete, so `LQR-X06` does not
  change. Only whether process repair is incorrectly allowed to count as demonstrated
  exit success changes.

**Boundary — `SYN-C05-B`**

- **Comparator and one transform:** From the source's two-confirmation maximum, change
  only the bound to one confirmation attempt; a miss then returns safely to the
  planner, while a success still requires fresh re-entry.
- **Expected proposed verdict:** `PASS`.
- **Invariants:** Repair target, support level, no answer reveal, re-entry family,
  exit-credit rule, and honest handoff.
- **Evidence needed:** Both success and repeated-miss traces; configured bound;
  checkpoint and family ledger; and SME review of support appropriateness.
- **Reviewer roles:** `PRODUCT_PEDAGOGY_OWNER`, `DOMAIN_CONSTRUCT_SME`.
- **Why isolated:** No fixed attempt quota is mandated. The single transform tests
  bounded assistance while preserving exact repair, fresh recheck, and safe
  termination.

### 4.6 LQR-C06 — DOK appropriateness and distribution

**Source shape:** L3 logarithm progression, including `LOG_POWER_START` and subsequent
inverse-form tasks:
`content/lessons/v3-les-844372/lesson-script.json:971-1257` and
`content/lessons/v3-les-844372/learner-safe-items.json:273-342`.

**Clear pair — `SYN-C06-P` / `SYN-C06-F`**

- **Pass control:** Attach item-level DOK targets and rationales to a fixed,
  source-shaped progression. Classify the unchanged “10 raised to the third power”
  entry task as DOK 1 and explain that it is direct recall/computation; classify later
  routine inverse-form applications separately. Expected proposed verdict: `PASS`.
- **One transform:** Change only the entry task's declaration from DOK 1 to DOK 3.
  Leave the task, rationale, phase, and complete distribution unchanged. Expected
  proposed verdict for the fail variant: `FAIL`.
- **Invariants:** KC, route purpose, all item text, sequence, assistance, final depth,
  changed task, keys, and every other DOK target/rationale.
- **Evidence needed:** KC competency; phase purpose; full item-level DOK worksheet;
  unchanged task bytes; metadata diff; and SME rationale approval.
- **Reviewer roles:** `PRODUCT_PEDAGOGY_OWNER`, `DOMAIN_CONSTRUCT_SME`.
- **Why isolated:** No cognitive demand changes. Only one inflated depth label changes,
  so the case cannot be explained by hidden prerequisites, prompt complexity, or
  distribution changes.

**Boundary — `SYN-C06-B`**

- **Comparator and one transform:** On the unchanged L3
  `SYSTEM_FORMULA_FINAL` task (`learner-safe-items.json:194-213`), change only the
  proposed item-level declaration from DOK 2 to DOK 3.
- **Expected proposed verdict:** `BLOCKED` pending an SME decision about whether the
  formula-to-system translation is routine application or non-routine strategic
  reasoning.
- **Invariants:** Prompt, three required fields, formula context, solve operation,
  scoring authority, assistance, and phase.
- **Evidence needed:** Keyless solution trace; route teaching trace; item-level DOK
  rubric; and written SME reasoning about the deciding feature.
- **Reviewer roles:** `PRODUCT_PEDAGOGY_OWNER`, `DOMAIN_CONSTRUCT_SME`.
- **Why isolated:** Only the depth declaration changes. `BLOCKED` avoids fabricating a
  human DOK classification for a genuine 2/3 boundary.

### 4.7 LQR-X01 — Presentation-to-UI fidelity

**Source shape:** L3 authored log worked example and current placeholder projection:
`content/lessons/v3-les-844372/lesson-script.json:1089-1109`,
`packages/content/src/lesson-normalization/normalize.ts:186-194`, and
`services/lambdas/learner-api/src/normalized-lesson-runtime.ts:519-527`.

**Clear pair — `SYN-X01-P` / `SYN-X01-F`**

- **Pass control:** Resolve `NODE:ALG-LOG-WORKED-01` to the authored inverse-form
  reasoning in the run payload and rendered body. Expected proposed verdict: `PASS`.
- **One transform:** Replace only that resolved body with the raw internal token
  `[worked example: ALG-LOG-WORKED-01]`. Expected proposed verdict for the fail
  variant: `FAIL`.
- **Invariants:** Authored lesson and presentation plan, stage order, heading, layout,
  actions, focus target, response behavior, route, build, and all neighboring screens.
- **Evidence needed:** Node-to-screen map; exact run payload; DOM/accessibility-tree
  body; full screenshot; action trace; source/build hashes; and protected-boundary
  scan.
- **Reviewer roles:** `PRODUCT_PEDAGOGY_OWNER`, `DOMAIN_CONSTRUCT_SME`.
- **Why isolated:** The source meaning is fixed and the only changed output is whether
  that meaning or an internal placeholder reaches the learner. Focus, interaction,
  accessibility behavior, and recovery are unchanged.

**Boundary — `SYN-X01-B`**

- **Comparator and one transform:** On the L2 changed exit, change only the rendered
  stage label from authored “Changed-task check” to “Final check,” matching the real
  drift at `lesson-presentation-plan.json:440-463` and
  `learner-safe-items.json:69-80`.
- **Expected proposed verdict:** `PASS` with a non-blocking fidelity finding.
- **Invariants:** Prompt, operation, response control, sequence, feedback, progress
  state, and all accessibility semantics.
- **Evidence needed:** Plan/payload/DOM comparison and a screenshot showing label
  context.
- **Reviewer roles:** `PRODUCT_PEDAGOGY_OWNER`.
- **Why isolated:** One non-consequential label changes while instructional meaning
  and learner operation remain identical.

### 4.8 LQR-X02 — Cognitive focus, pacing, and visual clarity

**Source shape:** All current lesson routes are children of `AppShell`:
`apps/learner-web/src/app/router.tsx:39-50`;
the shell renders global header, desktop sidebar, and mobile bottom navigation at
`apps/learner-web/src/screens/AppShell.tsx:64-110`.

**Clear pair — `SYN-X02-P` / `SYN-X02-F`**

- **Pass control:** Render one exact L3 question state in a `FOCUSED_LESSON` shell mode
  that retains the skip link and lesson-local pause/return action but suppresses the
  global header, sidebar, and bottom navigation. Expected proposed verdict: `PASS`.
- **One transform:** Change only `shell_mode` from `FOCUSED_LESSON` to `STANDARD`, so
  the same screen displays the shared global chrome. Expected proposed verdict for the
  fail variant: `FAIL`.
- **Invariants:** Lesson ID/revision, item, prompt, choices, selected state, feedback
  state, lesson-local actions, typography tokens, viewport, theme, scroll position,
  focus target, and renderer bytes.
- **Evidence needed:** Side-by-side full-viewport captures at desktop, 375 px, and
  320 px; DOM action/landmark inventory; focus order; scroll measurements; source
  diff for the one mode fact; and novice walkthrough notes.
- **Reviewer roles:** `PRODUCT_PEDAGOGY_OWNER`, `ACCESSIBILITY_REVIEWER`,
  `NOVICE_WALKTHROUGH_REVIEWER`.
- **Why isolated:** It compares the same lesson, item, renderer, and viewport. The
  only cognitive-load variable is competing global chrome, repairing the current
  cross-lesson/shared-shell confound.

**Boundary — `SYN-X02-B`**

- **Comparator and one transform:** In the focused pass control, change only the
  lesson-local “Pause and return” action's visual priority from secondary text action
  to the same primary styling as “Submit response.”
- **Expected proposed verdict:** `FAIL`.
- **Invariants:** Labels, handlers, number of controls, DOM order, content, viewport,
  focus, and all responsive behavior.
- **Evidence needed:** Computed style and hierarchy capture; action inventory;
  screenshots at required widths; and product review of primary-action competition.
- **Reviewer roles:** `PRODUCT_PEDAGOGY_OWNER`, `ACCESSIBILITY_REVIEWER`.
- **Why isolated:** Navigation, operation, and semantics do not change. Only visual
  action priority crosses the one-primary-action boundary.

### 4.9 LQR-X03 — Feedback and scaffolding quality

**Source shape:** L1 vector near-exit response mapping and targeted feedback:
`packages/content/src/v3-vector-lesson-artifacts.ts:266-281`,
`services/lambdas/learner-api/src/vector-lesson-protected.ts:75-86`, and
`services/lambdas/learner-api/src/vector-lesson-runtime.ts:938-977`.

**Clear pair — `SYN-X03-P` / `SYN-X03-F`**

- **Pass control:** For the unsigned-magnitude wrong choice, render feedback that names
  the observable sign-handling divergence and directs the learner to the first cue or
  operation to rebuild. Expected proposed verdict: `PASS`.
- **One transform:** Replace only the learner-facing feedback payload with
  “Not quite.” Keep outcome, focus, announcement, repair destination, and all branch
  behavior unchanged. Expected proposed verdict for the fail variant: `FAIL`.
- **Invariants:** Prompt, response, key, protected rationale, authored/rendered
  alignment, timing after commitment, assistance level, repair, re-entry freshness,
  focus destination, and terminal behavior.
- **Evidence needed:** Correct/miss branch payloads; protected rationale; DOM/live
  region capture; focus trace; repair transition; and source/control/variant diff.
- **Reviewer roles:** `PRODUCT_PEDAGOGY_OWNER`, `DOMAIN_CONSTRUCT_SME`,
  `ACCESSIBILITY_REVIEWER`.
- **Why isolated:** Both variants' authored payload and render are aligned, so X01
  remains constant. The only changed fact is actionable specificity after commitment.

**Boundary — `SYN-X03-B`**

- **Comparator and one transform:** On the real low-stakes entry state, replace only
  its explanatory response body with the brief message “Starting point recorded.”
- **Expected proposed verdict:** `PASS`.
- **Invariants:** Entry status, no mastery or route consequence, honest abstention,
  post-commit timing, announcement behavior, and full teaching immediately following.
- **Evidence needed:** Entry event/evidence ledger; complete subsequent teaching
  trace; DOM/live-region and focus capture.
- **Reviewer roles:** `PRODUCT_PEDAGOGY_OWNER`, `DOMAIN_CONSTRUCT_SME`,
  `ACCESSIBILITY_REVIEWER`.
- **Why isolated:** Consequentiality and later instruction are proved constant. Brief
  feedback is tested only at the rubric's explicit low-stakes exception.

### 4.10 LQR-X04 — Meaningful interaction and representation

**Source shape:** L1's semantic static vector/trigonometry representation:
`services/lambdas/learner-api/src/vector-lesson-runtime.ts:1287-1325` and
`apps/learner-web/src/screens/VectorLesson.tsx:279-293`.

**Clear pair — `SYN-X04-P` / `SYN-X04-F`**

- **Pass control:** Add one accessible, unscored “Compare side roles” action to the
  source-shaped static representation. Activation highlights the opposite, adjacent,
  and hypotenuse labels for the selected reference angle. All required relations also
  remain available in static text. Expected proposed verdict: `PASS`.
- **One transform:** Change only the action's state effect from relationship-specific
  highlighting to a decorative border-color pulse. The control, label, action count,
  timing, and static teaching remain unchanged. Expected proposed verdict for the fail
  variant: `FAIL`.
- **Invariants:** KC, authored/rendered alignment, representation content, text
  equivalent, decisive facts, layout, control semantics, keyboard behavior,
  reduced-motion behavior, feedback policy, and no scoring consequence.
- **Evidence needed:** Interaction warrant; before/after DOM and screenshot states;
  state-transition trace; keyboard and reduced-motion trace; accessibility-tree
  capture; and construct-preservation review.
- **Reviewer roles:** `PRODUCT_PEDAGOGY_OWNER`, `DOMAIN_CONSTRUCT_SME`,
  `ACCESSIBILITY_REVIEWER`.
- **Why isolated:** X01 is held by aligning authored and rendered behavior, C02 is held
  by keeping all teaching statically available, and X02 is held by keeping one action
  and identical layout. Only meaningful versus decorative state effect changes.

**Boundary — `SYN-X04-B`**

- **Comparator and one transform:** Remove only the optional compare action from the
  pass control, leaving the semantic figure, text equivalent, and labeled values.
- **Expected proposed verdict:** `PASS`.
- **Invariants:** Every relationship and decisive feature, reading order, layout,
  teaching, and learner progression.
- **Evidence needed:** Representation warrant; static DOM/accessibility tree;
  screenshot; and SME/accessibility comparison showing no operation or information
  was lost.
- **Reviewer roles:** `PRODUCT_PEDAGOGY_OWNER`, `DOMAIN_CONSTRUCT_SME`,
  `ACCESSIBILITY_REVIEWER`.
- **Why isolated:** The case directly locates the no-interaction-quota boundary. It
  avoids the current three-field control mismatch and therefore does not invoke X01.

### 4.11 LQR-X05 — Accessibility and construct equivalence

**Source shape:** Current native radio choices wrapped by labels:
`apps/learner-web/src/screens/CatalogLesson.tsx:322-343` and their visually hidden
input/focus treatment at `apps/learner-web/src/styles/app.css:2876-2922`.

**Clear pair — `SYN-X05-P` / `SYN-X05-F`**

- **Pass control:** Keep the current source-shaped native radio group with fieldset,
  legend, wrapping labels, visible option text, minimum touch area, and
  `focus-within` indicator. Expected proposed verdict: `PASS`, contingent on the
  required browser and assistive-technology evidence.
- **One transform:** For one required option only, replace the label association with
  a visually identical non-label wrapper, leaving the radio with no other accessible
  name. Expected proposed verdict for the fail variant: `FAIL`.
- **Invariants:** Prompt/legend, option text and order, key, response behavior, visual
  layout, CSS, target size, keyboard event handling, focus style, contrast, route,
  and alternative-representation content.
- **Evidence needed:** DOM and accessibility-tree diff; keyboard-only trace; focus
  capture; automated name/role/value results; contrast/target-size/zoom/reflow
  results; and real Safari + VoiceOver review.
- **Reviewer roles:** `PRODUCT_PEDAGOGY_OWNER`, `DOMAIN_CONSTRUCT_SME`,
  `ACCESSIBILITY_REVIEWER`.
- **Why isolated:** The learner operation, visuals, control type, and construct do not
  change. Only one programmatic name association changes, replacing the current
  multi-change accessibility fixture with a true single defect.

**Boundary — `SYN-X05-B`**

- **Comparator and one transform:** From the pass control, change only the native
  radio hiding technique from positioned `opacity: 0` to `display: none`, while
  retaining the visually identical custom marker and label text.
- **Expected proposed verdict:** `FAIL`.
- **Invariants:** Visible rendering, prompt, option text, key, layout, target area,
  and JavaScript response logic.
- **Evidence needed:** Accessibility-tree presence; tab-order and keyboard-selection
  trace; visible-focus capture; and Safari + VoiceOver control discovery.
- **Reviewer roles:** `PRODUCT_PEDAGOGY_OWNER`, `ACCESSIBILITY_REVIEWER`.
- **Why isolated:** Sighted appearance is fixed. The one CSS fact locates the boundary
  between visually hidden native semantics and removal from keyboard and assistive-technology access.

### 4.12 LQR-X06 — Responsive behavior, recovery, and branch completion

**Source shape:** L2/L3 initial start handling and error action:
`apps/learner-web/src/screens/CatalogLesson.tsx:48-55` and `:120-140`.

**Clear pair — `SYN-X06-P` / `SYN-X06-F`**

- **Pass control:** In a deterministic initial-start failure state, “Try again”
  reissues the idempotent start command and then loads the resulting authoritative
  run. Expected proposed verdict: `PASS`.
- **One transform:** Change only the recovery action target from `RETRY_START` to
  `REFETCH_STATUS_AND_RUN`. Keep `startAttempted` true, reproducing the source-shaped
  dead end in which no start is retried. Expected proposed verdict for the fail
  variant: `FAIL`.
- **Invariants:** Pre-item `NOT_STARTED` state, injected failure, copy, visible action,
  focus, route, lesson revision, network response sequence before the click,
  viewport, and absence of any repair or learner response.
- **Evidence needed:** Request log and command count; start mutation state; status/run
  trace; focus and error-state capture; exact checkpoint/revision assertions; console
  log; and branch terminal disposition at desktop, 375 px, and 320 px.
- **Reviewer roles:** `PRODUCT_PEDAGOGY_OWNER`,
  `PLATFORM_RELIABILITY_REVIEWER`, `ACCESSIBILITY_REVIEWER`.
- **Why isolated:** The case occurs before instruction, scoring, feedback, or repair,
  so C05 cannot contaminate it. Only whether the displayed recovery action retries
  the failed transition changes.

**Boundary — `SYN-X06-B`**

- **Comparator and one transform:** From the failed source-shaped control, change only
  the recovery action contract from the inert “Try again” transition to an explicit,
  truthfully labeled `RETURN_TO_CURRICULUM` transition.
- **Expected proposed verdict:** `PASS`: in-place retry is absent, but the branch
  returns control safely and does not claim progress was saved.
- **Invariants:** Failure cause, no run/checkpoint, lesson revision, error state,
  viewport, focus, and no learner response or repair.
- **Evidence needed:** Navigation trace; request log proving no duplicate start;
  error-copy capture; focus destination; and branch-matrix terminal disposition.
- **Reviewer roles:** `PRODUCT_PEDAGOGY_OWNER`,
  `PLATFORM_RELIABILITY_REVIEWER`, `ACCESSIBILITY_REVIEWER`.
- **Why isolated:** The only change is recovery disposition. The case replaces the
  current repair-based boundary with a pre-instruction branch and tests the rubric's
  explicit allowance to return control safely.

## 5. Materialization and calibration checklist

Before any working case replaces a canonical candidate:

1. Freeze the exact source excerpt and neutralized control; record lesson and source
   hashes.
2. Generate the fail and boundary variants from declarative transforms, not manual
   copy editing.
3. Assert a one-row semantic diff and reject any undeclared second fact.
4. Run structural/security prerequisites. A transform that fails a prerequisite is
   not a rubric anchor.
5. Capture all dimension-required evidence and adjacent-dimension exclusion checks.
6. Keep `proposed_verdict` and eventual adjudicated verdict outside judge input.
7. Randomize pair order and case order; do not expose `P`, `F`, or `B` in judge-visible
   IDs.
8. Collect independent required-role receipts on the exact hashes.
9. Record disagreements without averaging; unresolved cases remain
   `CANDIDATE_PENDING_REVIEW`.
10. Report false passes, false failures, boundary errors, repeatability, and agreement
    by dimension. Do not begin enforcement until repeated calibration demonstrates
    that blocking defects are not falsely passed.

## 6. Concerns

- The exact synthetic fixtures and browser evidence do not yet exist. Consequently,
  none of the expected pass controls is presently an evidenced pass.
- A demonstrated fail variant would take precedence over missing evidence, but no
  synthetic fail is demonstrated until its exact revision-bound fixture exists.
- The C02 control must be reviewed as a complete special-angle demand/teaching trace;
  a partial table would recreate the defect this design is intended to repair.
- Some rubric criteria are intentionally adjacent—especially C03/C04, C05/X06, and
  X01/X04. The exclusion checks above are mandatory; a case that changes an adjacent
  verdict must be split or retired.
- X02 visual competition and the C06 DOK 2/3 boundary require qualified human
  adjudication. This report records proposed or blocked outcomes only and makes no
  claim that such review has occurred.
- X05 pass evidence requires real Safari + VoiceOver review. Source semantics and
  automated accessibility checks cannot substitute for that receipt.
- Reviewer roles in this report use the current candidate-schema enum and anchor
  trigger rules. A future canonical role/cardinality matrix may require stricter
  receipts before adjudication.
- The calibration boundaries intentionally span proposed `PASS`, `FAIL`, and
  `BLOCKED`, as allowed by rubric §9.1. Any FAIL/BLOCKED boundary reused in the v0.9
  dimension cards does not replace that rewrite's separate required non-blocking
  example.
- The anchor schema currently permits only empty `review_receipts` and null
  `gold_verdict` in the draft set. Promotion requires a later lifecycle/schema path;
  it must not be simulated by editing the current draft fields.
