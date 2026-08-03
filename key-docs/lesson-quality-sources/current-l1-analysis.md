# V3-LES-130923 (L1) — Derived Lesson-Quality Analysis

**Status:** Derived, rights-safe analysis only; not a scored report, gold label, or
human approval record.
**Revision under analysis:** `V3-LES-130923`, lesson-script
`content_sha256` `fe39da36ee66404bcfd168d608dcdce670ba3238bbbe76f87c0537f15b202eff`.
**Analysis date:** 2026-08-03.
**Rights boundary:** This report uses internal identifiers, hashes, and paraphrases.
It does not reproduce protected answer keys, answer rationales, or expressive source
material.

> **Currency notice** (added 2026-08-03, cross-document correction wave). This analysis
> was written against the rubric `v0.4 planning draft` at `f299b1ad…db16ab`, and that
> provenance is accurate and deliberately preserved: the pins in §2 record what was
> actually read. **The current standard is rubric `0.9.1` with anchor-set
> `0.9.1-candidate`.** Section numbers, criterion wording, dimension boundaries, required
> evidence, and reviewer-role names have all changed since. Read every rubric reference
> below as a v0.4 reference; none has been re-derived against `0.9.1`. The findings about
> the lesson remain the record of what was observed at the lesson hash above. Where this
> file and the current rubric differ on a criterion, the rubric governs.

## 1. Scope, authority, and limits

This analysis reads the current rubric, the controlling authority resolutions, the
synthetic calibration design, the candidate-anchor inventory, all four L1 artifacts,
the actual L1 runtime/UI/protected-answer path, relevant tests, and the existing
browser report.

It deliberately does **not**:

- assign `PASS`, `FAIL`, or `BLOCKED` evaluation verdicts;
- promote any candidate anchor or infer a gold label;
- substitute for required product/pedagogy, domain/construct, blind-solve,
  accessibility, rights, reliability, or final-approval receipts; or
- treat structural validation, a unit test, or a screenshot as evidence of learner
  outcomes, mastery calibration, efficacy, readiness, or production release.

The governing boundaries are important here:

- The rubric is a non-enforcing v0.4 planning draft. Structural validation and the
  Lesson → Evidence → Mastery contract remain separate authorities.
- `rubric-authority-resolutions.md` requires route-relative evaluation, fail-closed
  evidence, and the precedence `FAIL > BLOCKED > PASS` when a future evaluator is
  authorized to produce a verdict.
- A `CHANGED_EXIT`/transfer claim does not itself establish mastery or BKT
  eligibility.
- The anchor catalog and anchor-set are candidate-only: all records remain
  `CANDIDATE_PENDING_REVIEW`, have empty review receipts, and have
  `gold_verdict: null`.

## 2. Revision identity and inspected source hashes

The canonical artifact content hashes and the byte hashes below are different
identifiers: the former are artifact-defined canonical content hashes; the latter are
SHA-256 values of the inspected repository files on 2026-08-03.

| Source                                                            | Role                                              | Canonical content hash / inspected byte SHA-256 |
| ----------------------------------------------------------------- | ------------------------------------------------- | ----------------------------------------------- |
| `content/lessons/v3-les-130923/lesson-script.json`                | Primary authored script                           | `fe39da36…202eff` / `ab6540ae…2752a5`           |
| `content/lessons/v3-les-130923/kc-coverage-matrix.json`           | Route and KC coverage artifact                    | `623771d6…acdae80` / `c71b4f76…e89de0`          |
| `content/lessons/v3-les-130923/lesson-presentation-plan.json`     | Authored screen/representation plan               | `f17a9a25…541861` / `6f70d8a7…81f3a4`           |
| `content/lessons/v3-les-130923/lesson-quality-report.json`        | Internal draft gate report                        | `a3a6f18d…c8ceee2` / `cca97b01…2423be`          |
| `key-docs/lesson-quality-rubric.md`                               | Rubric v0.4                                       | `f299b1ad…db16ab`                               |
| `key-docs/lesson-quality-sources/rubric-authority-resolutions.md` | Controlling run decisions                         | `8126c3e1…d615fd`                               |
| `key-docs/lesson-quality-sources/synthetic-defects-analysis.md`   | Synthetic calibration design                      | `3de7f442…eab03d`                               |
| `key-docs/lesson-quality-rubric-anchors.md`                       | Candidate catalog                                 | `9c57279b…618ea8`                               |
| `packages/content/src/v3-vector-lesson-artifacts.ts`              | Parallel L1 data used by runtime/protected module | `19fdcf65…8e373`                                |
| `services/lambdas/learner-api/src/vector-lesson-runtime.ts`       | Actual bespoke L1 state machine and DTO renderer  | `5c9f8d06…cb44a`                                |
| `services/lambdas/learner-api/src/vector-lesson-protected.ts`     | Server-only choice and feedback authority         | `0de95b23…311ee`                                |
| `apps/learner-web/src/screens/VectorLesson.tsx`                   | Actual learner UI                                 | `311b3920…64280`                                |
| `tests/browser/vector_lesson_browser.py`                          | Browser harness source                            | `dab72063…a06cc`                                |
| `tests/browser/evidence/v3-les-130923/browser-report.json`        | Existing browser-report byte hash                 | `ca22e827…5e615`                                |

Short hashes are shown only for readability; the full values are available in the
source artifacts and the analysis command record.

## 3. Authored, delivered, and evidence distinctions

### 3.1 Authored L1 bundle

The authored bundle is a draft four-file L1 envelope: lesson script, KC coverage
matrix, presentation plan, and internal quality report. It declares three required
KCs, 51 expected nodes, 42 expected items, a four-route universe, low-stakes entry
checks, staged support/fading, near and changed exits, repair confirmations, and
fresh re-entry families.

The internal quality report itself says:

- structural checks and targeted runtime/browser smoke checks exist;
- prerequisite-support applicability, exhaustive browser evidence, independent
  accessibility review, production pins, calibrated exit policy, and required
  human reviews remain blocked; and
- the lesson is `INTERNAL_DRAFT_ONLY`.

### 3.2 Actual delivered L1 path

The delivered L1 path is not a direct rendering of the vendored script:

1. `lesson-content-provider.ts` reads the vendored script to obtain the definition
   hash and authored question-evidence-plan bindings.
2. `vector-lesson-runtime.ts` imports `VECTOR_LESSON_KCS` from
   `v3-vector-lesson-artifacts.ts` and uses that code data for current KC selection,
   item selection, authored body text, visuals, support, repair text, and screen
   construction.
3. `vector-lesson-protected.ts` also imports that code data, then constructs the
   server-only answer/feedback authority.
4. `VectorLesson.tsx` renders the closed server DTO under the shared `AppShell`.

This is a material authored-versus-delivered distinction. The script's definition
hash is checked on restore, but the actual rendered content is drawn from a parallel
TypeScript dataset. The code comments describe that dataset as inert legacy data
after artifacts became vendored, yet both the runtime and protected module import it
directly. The reviewed tests verify artifact hash-chain consistency and many runtime
properties; they do not provide a revision-bound semantic-equivalence receipt proving
that every rendered field in `VECTOR_LESSON_KCS` equals its vendored-script peer.

That duplication is not evidence of a current visible divergence by itself. It is,
however, an L1-specific X01 integrity risk: a script-only edit can change the
definition hash and quality artifacts while the bespoke runtime continues to render
parallel code data unless a parity mechanism detects it.

### 3.3 Route applicability is unresolved

The coverage matrix marks `CONCISE`, `STANDARD`, and `MISCONCEPTION` coverage as
present for all three KCs, while every `PREREQUISITE_SUPPORT` row is `BLOCKED` because
the schema has no authoritative `NOT_APPLICABLE` disposition for KCs with no canonical
hard predecessor. The actual runtime accepts concise and valid misconception
resolutions, but downgrades `PREREQUISITE_SUPPORT` to `STANDARD`.

Under the authority resolution, that is not proof that prerequisite support is absent,
complete, or acceptable. It is a cross-cutting route-applicability/evidence block for
every dimension that depends on the full four-route universe.

### 3.4 Existing browser evidence is stale or incomplete for quality use

The existing `browser-report.json` binds the three authored artifact content hashes,
but it is not a revision-bound quality evidence bundle:

- It has no bundle manifest, branch matrix, application git commit, build ID,
  capture timestamp, rubric version, DOM/accessibility-tree capture, focus trace,
  request log, or Safari + VoiceOver receipt.
- The evidence directory currently contains only `browser-report.json`. The report
  lists nine screenshot files and hashes, but those raw screenshots are absent.
- `vector_lesson_browser.py` drives the learner UI with a hand-authored
  `MockLessonAuthority`, not the actual L1 runtime or persistence path. Its happy
  path jumps through a small fabricated screen list; its repair path omits the
  runtime's real confirmation sequence and uses mock persistence across reload.
- The browser report itself labels this arrangement
  `STATEFUL_PLAYWRIGHT_ROUTE_MOCK_FOR_UI` and only claims real kernel/persistence
  coverage through a separate API test.

Treat the report as a historical targeted smoke artifact, not as fresh evidence for
any rendered-experience dimension or for the exact runtime/UI bytes listed above.
The missing raw artifacts alone fail the rubric's evidence-bundle completeness rules.

## 4. Cross-cutting strong patterns and blockers

### Strong patterns

- The L1 state machine has explicit first-attempt preservation, opaque screen tokens,
  fresh-family tracking, bounded repair, checkpoint validation, pause/resume, and
  safe planner handoff.
- Protected answer fields are kept server-only in the actual DTO path; contract,
  client, runtime, and architecture tests include boundary checks for that property.
- The authored script states that entry checks are low-stakes and non-route-selecting,
  and the runtime repeats that boundary after commitment.
- The UI uses semantic radio controls, fieldset/legend grouping, heading focus, live
  feedback status, a visible focus style, a 48px design token, narrow-width rules,
  and reduced-motion styling.

### Source-demonstrated blockers or high-risk blockers

1. **C02 instructional coverage:** L1 declares 30°/45°/60° relationships in scope,
   but its trig teaching sequence supplies a general ratio model and a 3–4–5 worked
   example rather than a complete special-angle model. Later L1 demands special-angle
   use in near/changed/re-entry work, including a 45° leg-from-hypotenuse re-entry.
   This is a source-demonstrated teaching-to-demand gap, not merely an evidence gap.
2. **C03 response quality:** `vtr-vec-repair-confirmation-near-2` includes two
   identical response strings in distinct option positions. The rubric explicitly
   treats duplicated distractors as blocking. Separately, many wrong choices lack an
   authored observable-feature mapping and therefore receive the protected module's
   generic fallback rather than first-invalid-step feedback.
3. **Rendered experience evidence:** no current complete, real-runtime browser
   evidence bundle exists; the available report is mock-driven and references absent
   screenshots. This blocks the X01–X06 evidence basis even where source and unit
   tests are strong.
4. **Route universe:** prerequisite-support applicability remains unresolved and is
   downgraded at runtime rather than evaluated as an authoritative route state.
5. **X02 focused-shell concern:** L1 is routed inside `AppShell`, which always renders
   the global header, desktop sidebar, and mobile bottom navigation. There is no
   focused-lesson shell mode. Whether that creates the rubric's observable cognitive
   competition still needs viewport captures and novice walkthroughs, but the source
   condition matches the known X02 candidate concern.

## 5. Dimension-by-dimension analysis

### LQR-C01 — Transfer validity

- **Strong authored pattern:** Each KC has a near/changed pair, separate semantic
  families, an explicit changed dimension, a declared reasoning operation, and a
  `TRANSFER` candidate mode on changed exits. The vector pair changes the unknown and
  direction of inference; the trig pair changes to a physical representation/context;
  the directional pair changes to a three-dimensional force context.
- **Blocking defect or evidence gap:** No independent blind-solve record, construct
  comparison, or SME receipt exists for any L1 pair. The unresolved
  prerequisite-support route also prevents route-complete transfer review. The C02
  special-angle coverage defect means the trig pair is not cleanly separable from
  adequacy concerns.
- **Non-blocking boundary:** A transfer observation is not a mastery/BKT conclusion.
  Conversely, changing only names, values, color, or wording would not be substantive
  transfer; L1's claimed unknown/context/representation changes are the right type of
  candidate distinction to inspect.
- **Authored versus delivered:** The script records changed dimensions and family
  lineage; the bespoke runtime chooses corresponding code-data items and tracks
  exposure. A source-parity receipt is still needed before asserting the delivered
  pair matches the authored pair.
- **Candidate example:** The vector changed-exit initial/re-entry pair is a useful
  candidate source shape because it changes inference rather than only numerals. It
  remains a candidate, not an adjudicated calibration case.
- **Required evidence/review:** Exact taught-model/near/changed trace, protected-key
  review, family-exposure trace, keyless blind solves, and product/pedagogy plus
  domain/construct review.
- **Primary refs:** `lesson-script.json:1842-1918,2718-3075,3433-3790,4150-4506`;
  `vector-lesson-runtime.ts:362-403,699-752`; authority resolution §3.

### LQR-C02 — Instructional adequacy

- **Strong authored pattern:** For each KC, the script declares orientation,
  explanation, mental model, think-aloud, worked example, guided work, faded support,
  solo work, contrast, exits, repair, re-entry, and recap. The runtime enforces the
  staged sequence and does not let the entry prompt select a route or complete an
  exit.
- **Blocking defect:** The trig orientation names “stated 30°/45°/60°
  relationships,” but the explanation/model/worked sequence teaches side roles,
  ratios, inverses, and a 3–4–5 example rather than every later special-angle
  relation. The script subsequently demands 30° and 60° uses plus a 45°
  hypotenuse-to-leg re-entry. Asking a repair-confirmation question about a 45°
  invariant is not a prior reusable model for the consequential 45° demand.
- **Non-blocking boundary:** The entry checks are explicitly low stakes, do not select
  a route, and are followed by instruction. Their pre-instruction placement is not
  the C02 defect. Route repetition by itself is also not a defect; the unresolved
  prerequisite-support applicability is a separate route-proof block.
- **Authored versus delivered:** The missing special-angle model appears in both the
  vendored script and the runtime's parallel KC data. The browser mock cannot prove
  that all authored instruction is actually delivered in a real run.
- **Candidate example:** Existing L1 C02 candidate material isolates the special-angle
  demand/teaching gap and a proposed completed model. It remains
  `CANDIDATE_PENDING_REVIEW`; no result is promoted here.
- **Required evidence/review:** A complete special-angle demand inventory, per-route
  item-to-instruction trace, a full special-angle model before each consequential
  demand, and product/pedagogy plus domain/construct review.
- **Primary refs:** `lesson-script.json:495-633,714-833,1518-1609,3383-3790`;
  `synthetic-defects-analysis.md:189-231`; `anchor-set.json:LQA-C02-*`.

### LQR-C03 — Distractor and error-model quality

- **Strong authored pattern:** Many L1 wrong choices carry observable-feature
  mappings rather than learner-trait labels. The protected module turns mapped
  features into post-commitment feedback and the runtime records observed response
  features, which is a sound separation between an answer pattern and a diagnosis.
- **Blocking defect:** In `vtr-vec-repair-confirmation-near-2`, the B and D option
  strings are identical. That is a duplicated distractor under the rubric's explicit
  blocking condition. In addition, the source maps only some wrong choices; unmapped
  choices take the generic protected fallback. That incomplete mapping prevents
  consistently identifying a first invalid step for every consequential wrong
  response.
- **Non-blocking boundary:** Saying a response is “consistent with” an observable
  operation is appropriate; asserting a stable learner misconception from one
  response is not. The current candidate catalog correctly treats a single mapped
  vector near-exit choice as only a narrow source shape, not a verdict on the whole
  item inventory.
- **Authored versus delivered:** Observable mappings originate in parallel
  `VECTOR_LESSON_KCS` data, and delivered feedback is generated in the server-only
  protected module. This makes the mapping/fallback behavior a C03 root cause with
  a non-counting X03 delivery impact.
- **Candidate example:** `vtr-vec-near-exit-initial` with a mapped
  unsigned-magnitude response is a useful candidate example of cautious
  observable-error wording. It cannot offset the duplicate option or unmapped
  choices elsewhere.
- **Required evidence/review:** Item-by-item distractor audit, protected-key and
  alternate-answer review, exact feedback/repair trace for every wrong option, and
  domain/construct review.
- **Primary refs:** `lesson-script.json:2821-2869`; `v3-vector-lesson-artifacts.ts:266-333`;
  `vector-lesson-protected.ts:62-107`; `vector-lesson-runtime.ts:803-821`.

### LQR-C04 — Prompt clarity

- **Strong authored pattern:** Learner-safe L1 prompts declare one selected response
  operation and the delivered UI uses a radio group with fieldset/legend semantics.
  The authored question-evidence plan retains prompt/choice projections and
  server-only authority references rather than placing keys in the learner DTO.
- **Blocking defect or evidence gap:** No independent keyless blind-solve notes,
  accessibility-equivalent wording review, or domain review is present for the 42
  L1 prompts. Therefore the analysis cannot establish that all trigonometric,
  directional, unit, and notation assumptions are defensible for the declared
  learner profile. The duplicate response is a C03 defect, not a second C04 finding.
- **Non-blocking boundary:** An awkward sentence or harmless typo is non-blocking
  only if it cannot change the operation, answer interpretation, or access. A
  low-stakes “not sure” option is not a prompt-clarity defect when it is an honest
  abstention path.
- **Authored versus delivered:** The runtime/UI can express L1's single-select
  response shape. That does not prove that the parallel code data and authored script
  have identical prompt wording or that a human can interpret every prompt without a
  key.
- **Candidate example:** One changed-exit prompt/control pair per KC can be used for
  a future blind-solve candidate after source parity and special-angle remediation;
  it must not be labeled from this analysis.
- **Required evidence/review:** Exact learner projection, accessible equivalent,
  protected scoring interpretation, independent blind solve, and domain/construct
  review.
- **Primary refs:** `lesson-script.json:2359-4506`; `VectorLesson.tsx:170-235`;
  `lesson-quality-rubric.md:283-322`.

### LQR-C05 — Repair quality

- **Strong delivered pattern:** The runtime starts repair from the failed near or
  changed function, preserves the original checkpoint, selects an untouched
  function-matched re-entry family, limits immediate confirmations to two, and
  returns to a planner handoff on exhaustion. Repair confirmation is explicitly
  process-only; it does not close an exit before fresh re-entry.
- **Blocking defect or evidence gap:** No authored C05 root defect is demonstrated in
  the inspected source for the tested vector/trig/direction branches. However,
  complete real-browser evidence for omission, support, both confirmation attempts,
  invalidation, re-entry miss, and handoff is absent. Incomplete C03 mappings may
  weaken repair targeting, but that remains a non-counting C03-origin impact rather
  than a duplicate C05 defect.
- **Non-blocking boundary:** A two-attempt limit is not intrinsically inadequate.
  Bounded support is acceptable when the exact function is rechecked and exhaustion
  terminates honestly; repair confirmation itself is not exit evidence.
- **Authored versus delivered:** The script names repair and re-entry bindings; the
  runtime enforces them and the runtime tests cover all three KCs. The browser mock
  does not exercise the actual confirmation sequence.
- **Candidate example:** L1's changed-task miss → targeted repair → confirmation →
  fresh changed re-entry is an existing candidate source shape. It has no review
  receipt and is not a gold example.
- **Required evidence/review:** Real run traces for both exit functions and all
  terminal dispositions, family ledger, proof that re-entry remains answer-unrevealed,
  and product/pedagogy plus domain/construct review.
- **Primary refs:** `lesson-script.json:1878-1918,2922-3075`;
  `vector-lesson-runtime.ts:699-752,938-1073`;
  `vector-lesson-runtime.test.ts:346-485`.

### LQR-C06 — DOK appropriateness and distribution

- **Strong authored pattern:** The sequence is visibly scaffolded from model and
  worked reasoning through structured, one-cue, and unsupported work. Changed exits
  declare reasoning operations and changed dimensions, which are useful raw inputs to
  a later DOK analysis.
- **Blocking evidence gap:** No `DOK` declaration, item-level DOK judgment, target,
  rationale, or explanation of distribution appears in the L1 artifact directory.
  Assistance state, activity role, number of screens, and a reasoning-operation label
  do not substitute for the required DOK evidence.
- **Non-blocking boundary:** The rubric has no fixed DOK quota. A lower-depth
  scaffold may be appropriate when it leads to the intended independent operation;
  depth cannot be inferred merely from numerical difficulty or an exit label.
- **Authored versus delivered:** The runtime delivers stages and assistance mechanics,
  not a defensible DOK declaration. Its implementation cannot repair absent
  author-side rationale.
- **Candidate example:** L1 should not be made a DOK anchor until a versioned
  item-level DOK worksheet exists. The current synthetic C06 material is L3-based and
  remains candidate-only.
- **Required evidence/review:** KC/phase rationale, an item-level DOK worksheet,
  complete task inventory, keyless solution traces, and domain/construct review.
- **Primary refs:** no `DOK`/`dok` field found under
  `content/lessons/v3-les-130923`; `lesson-quality-rubric.md:361-395`;
  `synthetic-defects-analysis.md:354-393`.

### LQR-X01 — Presentation-to-UI fidelity

- **Strong source pattern:** The plan supplies screen IDs, node-to-screen mappings,
  response/control expectations, representation plans, focus targets, and
  learner/reviewer separation. The runtime DTO is schema-validated, and browser-side
  contracts reject protected answer fields.
- **Blocking evidence gap:** There is no complete actual-runtime DOM/screenshot/trace
  set for the exact build. More importantly, the script and the runtime's parallel
  `VECTOR_LESSON_KCS` data are independently maintained; no reviewed parity receipt
  binds every authored node/item/representation to every delivered screen. The mock
  browser flow cannot establish semantic fidelity.
- **Non-blocking boundary:** Literal layout parity is not required. A changed layout
  is acceptable if it preserves meaning, learner operation, response format, support,
  sequence, and access.
- **Authored versus delivered:** This is L1's clearest authored/delivered split:
  definition hash and response bindings come from the script, while screen text and
  item selection come from TypeScript code. A matching hash of the script alone does
  not prove code-data fidelity.
- **Candidate example:** A future candidate should bind one authored worked screen,
  one question, one feedback state, and one repair/re-entry state to exact actual
  DOM/DTO captures after a single source-of-truth or automated equivalence check
  exists.
- **Required evidence/review:** Full node/item-to-screen map, actual DTO and DOM/AX
  captures, protected-boundary scan, source/build hashes, all branch screenshots, and
  product/pedagogy review.
- **Primary refs:** `lesson-presentation-plan.json:95-1307`;
  `vector-lesson-runtime.ts:1-26,1341-1561`;
  `VectorLesson.tsx:146-293`; `lesson-quality-rubric.md:403-445`.

### LQR-X02 — Cognitive focus, pacing, and visual clarity

- **Strong source pattern:** The plan declares one primary job/action, bounded
  callouts, visible required teaching, coherent stage labels, and responsive behavior.
  `VectorLesson.tsx` presents one primary action on content, question, feedback, and
  terminal screens; it also offers a secondary pause/return action.
- **Blocking defect or evidence gap:** L1 is always a child of `AppShell`. The shared
  header, full desktop sidebar, and five-item mobile bottom navigation remain visible;
  no focused-lesson mode suppresses them. This is a source-demonstrated candidate for
  competing chrome, but the necessary viewport captures and novice walkthrough are
  missing, so its observed learner impact is unproven. The route itself also has many
  sequential content/feedback stages, and no timing or walkthrough evidence separates
  coherent chunking from low-value clicking.
- **Non-blocking boundary:** No fixed number of screens, clicks, or minutes proves
  quality. A static presentation or a continue transition may be appropriate when it
  advances a coherent learner job; it becomes a problem only when it fragments or
  competes with that job.
- **Authored versus delivered:** The plan's focus expectations are authored
  declarations. The delivered router/AppShell composition adds global chrome that the
  plan cannot suppress.
- **Candidate example:** Existing L1 X02 candidate material isolates the shared-shell
  condition and the route's long sequence. It remains unreviewed and does not prove a
  current human conclusion.
- **Required evidence/review:** Exact desktop/375px/320px captures, action/landmark
  inventory, scroll and focus traces, timing observations, and novice/product
  walkthrough.
- **Primary refs:** `app/router.tsx:39-50`; `AppShell.tsx:64-110`;
  `lesson-presentation-plan.json:95-911`; `vector-lesson-runtime.ts:64-89,1081-1101`.

### LQR-X03 — Feedback and scaffolding quality

- **Strong delivered pattern:** The runtime creates feedback only after response
  commitment, stores the delivery ledger before closing the item screen, provides a
  bounded cue where offered, directs a consequential miss into repair, and gives the
  feedback heading logical focus. The UI exposes feedback through a live status
  region.
- **Blocking defect or evidence gap:** Mapped wrong choices can receive
  observable-feature feedback, but unmapped wrong choices receive a generic fallback
  that does not identify a specific divergent step. The root cause is the incomplete
  C03 authored error map; record this as a non-counting X03 impact rather than a
  duplicated blocker. Actual feedback announcement, focus, support, repair, and
  re-entry behavior lack real-browser evidence.
- **Non-blocking boundary:** Brief entry-check feedback is permitted because the entry
  is explicitly low stakes and followed by instruction. The same brevity would not be
  adequate for a consequential exit.
- **Authored versus delivered:** The authoring data supplies observed features; the
  protected module generates delivered feedback; the runtime controls when it appears;
  the UI announces it. The browser mock's feedback strings are not proof of that full
  path.
- **Candidate example:** The vector near-exit mapped wrong-response path is a useful
  candidate for observable, non-trait feedback. It remains candidate-only and needs
  real rendered evidence.
- **Required evidence/review:** Correct/wrong/omitted/support/re-entry branch DTOs,
  DOM/live-region and focus captures, exact repair transitions, and
  product/pedagogy/domain review.
- **Primary refs:** `vector-lesson-protected.ts:75-86`;
  `vector-lesson-runtime.ts:771-821,830-1073,1501-1545`;
  `VectorLesson.tsx:239-259`; `anchor-set.json:LQA-X03-*`.

### LQR-X04 — Meaningful interaction and representation

- **Strong source pattern:** The runtime uses a semantic static figure with a caption,
  textual equivalent, and labeled token list; question selection is the meaningful
  learner action. The L1 visual design avoids requiring a precise gesture or a drag
  simulation for vector, trig, or directional reasoning.
- **Blocking defect or evidence gap:** No interaction quota is required, so the
  absence of manipulation is not a defect. What remains unproven is whether the
  generic runtime visual preserves the full decisive relationship for every authored
  representation and whether its alternative is construct-equivalent in actual
  browser/assistive-technology use.
- **Non-blocking boundary:** A semantic static representation can be sufficient when
  it exposes the information and the response control performs the target operation.
  A decorative control or a replacement that removes a decisive relationship would
  cross the blocking line.
- **Authored versus delivered:** The presentation plan has six representation plans;
  the runtime collapses them to three generic visual kinds. This is an X01/X04 review
  question, not proof of semantic loss without item/screen comparison.
- **Candidate example:** The L1 static vector worked representation is an existing
  boundary candidate precisely because it has no manipulation. It is not approved and
  still requires construct/access review.
- **Required evidence/review:** Representation warrant, exact authored-to-rendered
  comparison, before/after DOM/AX states, keyboard/reduced-motion traces, and
  product/pedagogy/domain/accessibility review.
- **Primary refs:** `lesson-presentation-plan.json:1119-1299`;
  `vector-lesson-runtime.ts:1287-1338,1379-1392`;
  `VectorLesson.tsx:279-293`; `anchor-set.json:LQA-X04-B01`.

### LQR-X05 — Accessibility and construct equivalence

- **Strong source pattern:** L1 uses native radio inputs inside labels, fieldset/legend
  semantics, heading focus after screen changes, a live feedback region, visible
  `:focus-within` styling, reduced-motion CSS, narrow-width layout rules, and the
  `--mc-touch: 48px` product token.
- **Blocking evidence gap:** No independent Safari + VoiceOver receipt, actual
  accessibility-tree capture, full keyboard trace, contrast result, target-size
  measurement, zoom/reflow measurement, or construct-equivalence review exists for
  L1's actual runtime and branches. The absent screenshot/trace bundle means the
  existing browser report cannot fill these gaps.
- **Non-blocking boundary:** The authority resolution treats 48 CSS px as a preferred
  product standard when applicable WCAG target-size/spacing conditions otherwise
  pass; L1's CSS token is 48px, so there is no source-only target-size concern to
  elevate. This does not replace actual geometry and assistive-technology checks.
- **Authored versus delivered:** The plan declares text equivalents and pending
  independent construct review; the runtime and UI render a different generic visual
  layer. Source semantics alone cannot establish spoken order or equivalent operation.
- **Candidate example:** A future L1 candidate should use one actual radio question
  and one visual/feedback state with an exact Safari + VoiceOver receipt, not reuse
  the L2 radio candidate as if it covered L1.
- **Required evidence/review:** Complete keyboard and focus trace, automated AX and
  contrast results, zoom/reflow/target measurements, real Safari + VoiceOver review,
  and qualified domain/accessibility construct-equivalence review.
- **Primary refs:** `VectorLesson.tsx:170-235,239-259`;
  `app.css:2758-3013`; `packages/design-tokens/src/tokens.css:42`;
  `lesson-presentation-plan.json:1321-1339`.

### LQR-X06 — Responsive behavior, recovery, and branch completion

- **Strong delivered pattern:** The runtime validates run identity, screen tokens,
  definition hash, checkpoint fields, current item exposure, and delivery-ledger
  consistency on restore. It supports pause/resume, stale-command rejection,
  bounded repair termination, and honest blocked/completion states. The API tests
  exercise real in-memory HTTP-kernel persistence, idempotency, persistence failure,
  invalidation, and a complete three-KC run.
- **Blocking evidence gap:** There is no real-browser recovery matrix for actual L1:
  start failure, action-save uncertainty, pause/resume, refresh, reconnect, invalid
  item, repair exhaustion, blocked state, and completion must each be exercised at
  desktop, 375px, 320px, and 200% zoom as applicable. The browser mock's reload
  checks do not establish actual persistence or network recovery.
- **Non-blocking boundary:** An honest planner handoff is an acceptable terminal
  disposition; in-place retry is not mandatory when the learner is told what
  happened and can safely return. L1's start control retries the start mutation on a
  later click after a failed attempt, unlike the separate L2 candidate dead-end.
- **Authored versus delivered:** The script declares checkpoint behavior and the
  runtime implements it. The quality of the delivered UI recovery path still depends
  on actual HTTP/browser evidence, not on unit/API tests alone.
- **Candidate example:** L1 pause/resume with definition-hash-checked restore is an
  existing candidate recovery source shape. It has no browser bundle or independent
  review receipt and is not a gold example.
- **Required evidence/review:** Actual browser branch matrix, request/console logs,
  persisted revision and checkpoint assertions, width/zoom measurements, and
  product/pedagogy, accessibility, and platform-reliability review.
- **Primary refs:** `vector-lesson-runtime.ts:1161-1266,1564-1660`;
  `VectorLesson.tsx:32-55,102-109`; `Curriculum.tsx:1613-1660`;
  `vector-lesson-runtime.test.ts:467-523`;
  `vector-lesson-api.test.ts:135-658`.

## 6. Reviewer and evidence gap ledger

The following receipts are absent for the exact L1 revision and should remain absent
from any claim until independently completed:

- product/pedagogy review for transfer, adequacy, focus, feedback, and candidate
  boundaries;
- domain/construct SME review for special-angle coverage, answer uniqueness,
  right-hand-rule content, changed-task construct identity, and DOK;
- independent keyless blind solves for consequential prompts;
- independent source-rights approval;
- accessibility review with real Safari + VoiceOver, construct-equivalence review,
  and complete keyboard/AX/contrast/reflow evidence;
- platform/reliability review of a real browser recovery matrix;
- final approval and any adjudication record;
- route authority resolving `PREREQUISITE_SUPPORT` to an applicable route or an
  authoritative `NOT_APPLICABLE` proof; and
- a complete evidence-bundle manifest with build identity, source hashes, raw
  artifacts, branch matrix, and preservation of all findings.

These are not administrative polish. Missing source-bound or independent receipts
prevent a quality-approval conclusion under the current rubric.

## 7. L1-specific calibration recommendations for the v0.9 rewrite

1. **Make one source authoritative for delivered L1 content.** Prefer compiling the
   runtime's KC/item/representation data from the vendored script, or add a strict
   semantic-parity test and a delivery manifest that hashes both the script and the
   code source. Do not rely on a comment calling still-imported data inert.
2. **Repair the special-angle trace before using L1 C02 material.** Inventory every
   30°/45°/60° demand, teach every needed relation in a reusable model before the
   demand, then use a one-fact synthetic transform for calibration. The existing
   partial trace should remain a candidate defect source, not a passing control.
3. **Audit every L1 distractor and mapping.** Remove the duplicated option, require a
   unique defensible key/distractor set, and make every meaningful wrong option map
   to an observable divergence or an explicitly reviewed generic-feedback exception.
4. **Treat L1's static representation as a boundary case, not a presumed pass.**
   Preserve the no-interaction-quota rule; require a concrete warrant that the static
   visual and accessible alternative retain the same operation.
5. **Resolve all four routes before collecting whole-lesson examples.** Either
   implement a real prerequisite-support route or obtain an authoritative absence
   proof. A runtime downgrade is not route coverage.
6. **Build the evidence bundle around the actual runtime.** Replace mock-only browser
   proof with revision/build-bound real API runs, raw screenshots/traces/AX captures,
   a branch matrix, and independent Safari + VoiceOver review. Retain listed raw
   evidence rather than only its hash list.
7. **Add item-level DOK metadata separately from runtime behavior.** Capture target,
   rationale, phase purpose, and reviewer evidence without treating activity labels,
   support levels, or BKT eligibility as DOK.
8. **Isolate dimensions in calibration.** Keep C03's authored mapping defect separate
   from X03's delivered feedback impact, C05 repair quality separate from X06
   termination honesty, and X01 source/render fidelity separate from X04's
   interaction warrant.

## 8. Concerns for the v0.9 rewrite

- Do not convert structural-test success, content hashes, or internal-draft status
  into learner-quality approval.
- Do not reuse the mock browser report as a v0.9 evidence bundle; it is unbound to
  current application bytes and its referenced screenshots are absent.
- Do not let a transferred response or a changed-exit label stand in for a construct,
  DOK, blind-solve, or human-review conclusion.
- Do not hide the unresolved prerequisite-support route behind a runtime fallback to
  `STANDARD`.
- Do not count the same root cause twice across C03/X03 or C05/X06.
- Do not expose protected keys or rationales while creating source-to-render
  equivalence receipts; hashes, opaque item IDs, and authorized reviewer-side
  comparisons are sufficient.
