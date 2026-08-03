# Pedagogy and Construct Review — Lesson Quality Rubric v0.9-candidate

**Status:** `AGENT_REVIEW_RECOMMENDATION` — not an approval, not a human decision, not a gate.
**Reviewer:** automated agent. No human reviewer role was staffed, consulted, or represented here.
**Mode:** read-only. No canonical doc, anchor, protocol, lesson, code, test, config, status file, or
plan was modified. This file is the only write.
**Scope of authority:** this review can recommend corrections to rubric and protocol *text*. It
cannot adjudicate an anchor, promote a dimension, clear rights, or record a receipt.

---

## 0. Scope, method, and the two verdicts

### 0.1 Documents reviewed

| Document | Lines | Role in this review |
| --- | --- | --- |
| `key-docs/lesson-quality-rubric.md` | 927 | Primary subject |
| `key-docs/lesson-quality-rubric-anchors.md` | 771 | Calibration construct |
| `key-docs/lesson-quality-author-protocol.md` | 526 | Applicability by author agent |
| `key-docs/lesson-quality-judge-protocol.md` | 725 | Applicability by judge agent |
| `key-docs/lesson-quality-evidence-protocol.md` | — | Evidence sufficiency |
| `key-docs/lesson-quality-calibration-worksheet.md` | — | Adjudication capture |
| `key-docs/autonomous-lesson-authoring-context.md` | — | Agent entry point |
| `key-docs/lesson-quality-sources/*.md` (9 files) | — | Provenance and example safety |
| `docs/design/05-LESSON-STRUCTURAL-AUTHORING-SPEC.md` | — | Structural contract (R1–R15) |
| `docs/lesson-evidence-mastery-contract.md` | — | Mastery/evidence contract |
| `packages/content/src/lesson-validator/types.ts` | 93–109 | `REQUIRED_NODE_KINDS`, read to verify R8 |

### 0.2 Method

Each of the twelve dimension cards was read against four questions: (1) does every FAIL condition
name an observable a second reviewer could locate without re-deriving the author's intent;
(2) is the pedagogical construct the card claims to own actually covered by its conditions;
(3) does the card's claim limit match what a `PASS` on it would be read to mean; and (4) can the
author and judge protocols mechanically produce and consume that card's result. Structural
coverage was checked by taking the fifteen `REQUIRED_NODE_KINDS` the validator enforces and
searching the rubric for a criterion governing each. Example safety was checked by reading every
source-analysis file for language that asserts, rather than hypothesises, quality or clearance.

### 0.3 Verdicts

**Verdict 1 — Rubric foundation compliance: `COMPLIANT_WITH_REQUIRED_CORRECTIONS`.**
The rubric implements the six controlling decisions in `rubric-authority-resolutions.md` and the
six required edits in `rubric-consistency-audit.md` substantially and, in several places, exactly.
Its non-claims are disciplined and consistently repeated. Four foundation exceptions remain, all
textual and all correctable without re-opening a locked decision: the `FAIL > BLOCKED > PASS`
precedence established in §2.2 is inverted by both protocols at the lesson level (CR-4); the
route-relative adequacy decision at §4 has no floor, so an author-declared learner profile can
delete a teaching obligation (CR-3); the §5 ownership register omits a live C01/C02 overlap
(IM-2); and `kaplan-analysis.md` grants itself the rights clearance §9.2 says an agent cannot
grant, while the rubric names that file the worked example of the permitted form (IM-1).

**Verdict 2 — Future-agent usability: `NOT_READY_FOR_UNSUPERVISED_USE`.**
Usable today as a supervised checklist for a human reviewer who already holds the pedagogical
model. Not usable by an unsupervised authoring or judging agent, for three independent reasons.
`PASS` is currently unreachable both per-dimension and per-lesson, so an agent following the
documents literally emits `BLOCKED` for everything forever — honest, but non-discriminating, which
defeats the rubric's stated purpose at §1 `:13-14`. Five of the fifteen instructional node kinds
the structural validator mandates have no quality criterion in any dimension, so a compliant agent
can ship a route with no stated purpose, no expert modelling, no fading, no boundary cases, and a
recap that requires no retrieval (CR-1). And two escape hatches — declared prerequisites (CR-2) and
declared route profiles (CR-3) — give an agent optimising for `PASS` legal ways to discharge C02
without teaching anything. The minimum unblock set is CR-1 through CR-4; CR-5 must land before any
calibration result is reported or any enforcement threshold is set.

Both verdicts are recommendations to `PRODUCT_PEDAGOGY_OWNER`. Neither is a gate outcome.

---

## 1. Critical

Blocking for the rubric's stated purpose. Each is a defect in the standard itself, not in a lesson.

### CR-1 — Five of the fifteen mandated instructional node kinds have no quality criterion

**Refs:** `docs/design/05-LESSON-STRUCTURAL-AUTHORING-SPEC.md` R8 §`:89-93`;
`packages/content/src/lesson-validator/types.ts:93-109`; `lesson-quality-rubric.md:284-292` (C02
FAIL), `:296-301` (exception), `:211-222` (§5 ownership).

R8 requires fifteen node kinds and the validator enforces the list. The rubric governs ten of them.
It contains **zero** occurrences of *orientation*, *think-aloud*, *contrast boundary*, *recap*,
*non-example*, or *fade/fading*. The two hits for "worked example" are a route-length boundary at
`:301` and the Kaplan filename at `:870`; the only hit for "contrast" outside colour is
`:589` (non-text contrast measurement). Unjudged: `ORIENTATION`, `EXPERT_THINK_ALOUD`,
`LIGHT_SUPPORT_PRACTICE`, `CONTRAST_BOUNDARY`, `RECAP`.

These are not incidental node kinds. They carry the four instructional functions with the strongest
evidence base — prior-knowledge activation and stated intent, expert selection reasoning made
visible, fading from supported to independent performance, and discrimination training through
non-examples — plus retrieval at close. The structural spec mandates the shape of a complete
teaching cycle; the quality standard declines to inspect five of its parts. C02's five FAIL
conditions test *coverage* (is every demand taught somewhere) and one shape condition
(`:290`: support withdrawn before any supported attempt exists). Neither reaches quality of
modelling, presence of a purpose statement, direction of assistance across the route, presence of
a boundary case, or whether the recap requires retrieval.

Note also that no dimension requires a learner-facing objective or success statement. The rubric's
only "objective" references are `:277` (KC objective as an *authoring input*) and `:421` (C06's
declared objective as a depth referent). Nothing requires the learner to be told what they will be
able to do.

**Correction.** Add five FAIL conditions to C02 and one required-evidence line each, then add the
new territory to the §5 ownership row for C02:

- *Orientation and intent* — "The route states no learner-facing purpose for the KC before the
  first consequential demand: neither what the learner will be able to do, nor an explicit bridge
  from at least one declared prerequisite to the target relation." Evidence: "the learner-facing
  objective or success statement, and the prior-knowledge bridge node with the declared
  prerequisite relation ID it activates."
- *Expert modelling* — "Where the KC's declared reasoning operation is a selection or strategy
  operation, no node makes selection reasoning visible: the route shows how to execute the
  operation but never when to choose it over a competing operation the KC's scope admits."
  (Blocking only for selection/strategy KCs; non-blocking elsewhere.)
- *Fading* — "Assistance available at the route's final consequential exit is not strictly less
  than at its first supported practice — the same hint, worked reference, or cue panel remains
  available at the exit." Evidence: "the per-item assistance-affordance inventory across
  `GUIDED_PRACTICE` → `LIGHT_SUPPORT_PRACTICE` → `SOLO_PRACTICE` → exits."
- *Boundary and non-example* — "The route teaches a procedure whose declared scope carries a stated
  non-goal or contrast boundary, and no node presents a case where the procedure does not apply."
  Binds to `kc_non_goals[]` in the frozen task packet (author protocol §4 `:196-240`).
- *Recap* — "A recap supplies the answer to a consequential item the learner has not attempted"
  (blocking). Add as a non-blocking boundary: "a recap that restates the model without requiring
  retrieval is a non-blocking finding, not a defect."

If the owner prefers to hold twelve dimensions, all five belong in C02 and its claim limit must be
widened accordingly. If a thirteenth dimension is acceptable, `LQR-C07 — Instructional design
completeness` is the cleaner home and leaves C02 as pure coverage.

### CR-2 — "Declared prerequisite" is an unbounded escape hatch that neutralises C01(c) and C02(a)

**Refs:** rubric `:255` (C01 FAIL c), `:285-286` (C02 FAIL a), `:276-282` (C02 required evidence),
`:303-304` (C02 remediation), `:161-163` (§4 route-relative adequacy), `:917-918`;
`current-l1-analysis.md:163-167`, `:223-228`; anchors `:755-757`.

C02 FAIL (a) fires only when a consequential demand has "no prior teaching node on the same route
**and no declared prerequisite**." The remediation line at `:303-304` says to "declare **and prove**
it as a route prerequisite" — but no FAIL condition tests the *prove*. Required evidence at `:277`
lists "declared prerequisites" as an input with no binding to the curriculum graph, no sequence
check, and no verification obligation. The declaration is therefore self-certifying.

The consequence is concrete and already visible in the source set. `current-l1-analysis.md:163-167`
finds that L1's orientation places 30/45/60 special-angle values in scope while the route never
teaches them. Moving those values from KC scope into `hard_prerequisites[]` — a text edit — would
discharge that C02 FAIL entirely, with no rubric condition standing in the way and no change to
what the learner receives.

A second gap compounds it: nothing requires a route to *check* a declared prerequisite, and nothing
routes a learner who lacks it. The one mechanism that would, `PREREQUISITE_SUPPORT`, is unimplemented
and honestly recorded as such (`:917-918`, anchors `:755-757`), and C02's low-stakes exception
explicitly forbids the entry check from selecting a route (`:298-299`). So the rubric permits an
author to declare a prerequisite, never verify it, and have no path for the learner who fails it.

**Correction.**

- C02 required evidence: "each declared prerequisite bound to its curriculum relation ID from the
  frozen task packet `hard_prerequisites[]`, with the sequence position that places its teaching
  before this lesson."
- New C02 FAIL: "A consequential demand is discharged by a declared prerequisite that resolves to no
  curriculum relation for this lesson, is absent from the frozen task packet's
  `hard_prerequisites[]`, or is taught only at or after this lesson's sequence position."
- New C02 FAIL: "The route declares a hard prerequisite and neither checks it before the first
  consequential demand nor routes a learner who fails that check to an applicable support route or
  an honest handoff." (`BLOCKED` rather than `FAIL` while `PREREQUISITE_SUPPORT` has no
  authoritative absence proof — which is the honest current state.)
- §4 locked decisions: state that a declared prerequisite is an evidence-bearing claim about the
  curriculum graph, not an author assertion, and that total declared prerequisite load is bounded by
  the KC's declared non-goals.

### CR-3 — Route-relative adequacy has no floor and no reachability test

**Refs:** rubric `:161-163`; `:277-278` (declared learner profile per applicable route); `:291-292`
(C02 FAIL e); `:298-299`; §3.2 `:131-148`.

§4 locks: "Every other route is judged against its own declared learner profile, never against
`STANDARD`." That is the right call for `CONCISE` and `MISCONCEPTION`, and it is the *only* yardstick
those routes get. The profile is author-declared, and no criterion requires that (a) any real learner
state maps to it, (b) any named authority can route a learner there, or (c) a `MISCONCEPTION` route
target a misconception that appears anywhere in C03's authored error model.

C02 FAIL (e) — "An applicable alternate route omits teaching its own declared profile requires" —
is therefore circular. The author writes the profile, and the profile determines the obligation.
A `CONCISE` route declared for "learners who already hold the target KC" teaches nothing, requires
nothing, and passes C02. Combined with the entry-check routing ban at `:298-299`, the rubric can
certify a route that no mechanism can send anyone to.

**Correction.**

- C02 required evidence: "the route-selection authority and the observable learner state that
  selects each `APPLICABLE` route."
- New C02 FAIL: "An applicable route's declared learner profile presumes the target KC that route
  claims to teach, or no state the named route-selection authority can produce maps to that
  profile."
- New C02 FAIL: "An applicable `MISCONCEPTION` route targets a misconception that appears in no
  authored observable-error mapping for a consequential item, or that no distractor or accepted
  wrong-response pattern can trigger."
- §4, add the floor: "Every applicable route must teach every consequential demand its own profile
  does not already supply. Profile declaration reassigns where a demand is taught; it never removes
  a demand from the inventory."

### CR-4 — Lesson-level aggregation inverts `FAIL > BLOCKED > PASS`, and `PASS` is unreachable

**Refs:** rubric `:69-70` ("Precedence is `FAIL > BLOCKED > PASS`: a demonstrated blocking defect is
never hidden by missing evidence elsewhere"), `:62-66` (§2.2 conditions), §2.4 `:108-112`;
judge `:56-60`, `:247-250`, `:294-299`, `:707`; author `:426-433`, `:461-477`, `:498-500`;
rubric §7.4 `:724-742`; `:917-918`.

Two independent unreachability problems, both of which produce the same outcome: nothing can ever
pass, and the difference between a good lesson and a bad one stops being expressible.

**(a) Lesson level.** §2.2 fixes precedence at the dimension level. §2.4 is written as
approval-withholding and defines no lesson-level verdict, so the protocols supplied one — and
inverted it. Judge `:56-60` evaluates `BLOCKED` first and falls through to `FAIL`. Because
`PREREQUISITE_SUPPORT` has no `APPLICABLE` proof for any current lesson (`:917-918`; author
`:264-268` instructs treating it as `BLOCKED`; anchors `:755-757`), **every lesson evaluated today
resolves to `overall_recommendation: BLOCKED`** regardless of how many demonstrated pedagogical
defects it carries. That is exactly what `:69-70` forbids, at the level a human reads first. It also
makes the author's revise-until-pass loop inert: author §9 steps 4 and 5 (`:461-477`) branch on the
judge outcome, and a judge `FAIL` can no longer surface to trigger them.

**(b) Dimension level.** §2.2 `:65` makes "awaiting a required human role" a `BLOCKED` condition.
§7.4 `:724-741` requires `PRODUCT_PEDAGOGY_OWNER` on all twelve dimensions with trigger "always".
The judge must emit `human_decision: null` (judge `:250`, `:707`). Composing those three: no
dimension a judge evaluates can ever be `PASS`. Author `:498-500` contemplates a state where "all
dimensions are proposed `PASS`" while the product/pedagogy decision is still outstanding, which is
the coherent reading — but it contradicts §2.2 as written.

The root cause is that §2.2 conflates two different kinds of human role: reviewers who *produce
evidence a judge reads* (blind solver, SME, accessibility, novice walkthrough, platform
reliability, rights) and reviewers who *make a decision after the judge* (product/pedagogy owner).
Only the first kind is an evidence gap.

**Correction.**

- §2.4: "Lesson-level aggregation obeys the same precedence. `lesson_verdict` is `FAIL` if any
  required dimension is `FAIL`; otherwise `BLOCKED` if any required dimension is `BLOCKED`, any
  required route lacks an `APPLICABLE` proof, or the bundle is incomplete; otherwise `PASS`.
  Approval is a separate boolean, `approval_withheld`, with `approval_blockers[]`. It is `true`
  whenever the lesson verdict is not `PASS` or a required human decision is unrecorded."
- Judge §2.1 and §8: reorder to match; add `approval_withheld` and `approval_blockers[]` to the
  schema; delete the clause that forces `BLOCKED` "even when every dimension individually proposes
  `PASS`".
- §2.2 and §7.4: split the role matrix into `evidence_roles` — receipts that are judge-visible input
  and do gate `PASS` — and `decision_roles` (`PRODUCT_PEDAGOGY_OWNER`, and any role acting as
  approver). Restrict §2.2's "awaiting a required human role" to `evidence_roles`. Author §10's
  "all dimensions are proposed `PASS`" bullet then becomes coherent as written.
- Author §9: branch steps 4–6 on the per-dimension verdicts and `approval_blockers[]`, not on
  `overall_recommendation` alone.

*Overlap note:* the judge-consistency review filed a Critical on judge/human-gate conflation. This
finding covers the same root cause from the pedagogy side and adds the lesson-level precedence
inversion. Count the root cause once.

### CR-5 — The 36-case anchor set cannot produce what §8.4 requires it to report

**Refs:** rubric §8.1 `:764-772`, §8.3 `:807-808`, §8.4 `:826-836`; anchors `:22-26`, `:108-110`,
`:656-681`; judge `:281`, `:689-692`; worksheet §11.

Four separate defects in the calibration construct. Together they mean the rubric's operational
clarity is never measured, and the false-pass ceiling §8.4 defers to the owner cannot be estimated
from this set.

**(a) The set cannot estimate a false-pass rate.** Only `FAIL`-labelled cases can detect a false
pass. The rollup at `:656-681` gives twelve dimensions and, for ten of them, exactly one
`FAIL`-labelled case. A per-dimension false-pass rate from n=1 is a single Bernoulli trial. §8.4
correctly refuses aggregate accuracy that hides false passes — but with n=1 per dimension there is
nothing else to report either.

**(b) No pair is runnable.** Verified by enumerating the thirteen `SOURCE_OBSERVABLE` records:
`LQA-C01-P02`, `LQA-C01-B01`, `LQA-C02-B01`, `LQA-C03-F01`, `LQA-C04-F01`, `LQA-C04-B01`,
`LQA-C05-F01`, `LQA-X01-F02`, `LQA-X01-B01`, `LQA-X03-P01`, `LQA-X03-B01`, `LQA-X05-P02`,
`LQA-X06-F01`. **No dimension has both its `CLEAR_PASS` and its `CLEAR_FAIL` observable**, and
C06, X02, and X04 have no observable record at all. Zero of twelve discrimination pairs can be run
today. The rollup's "Pair matched: yes" column reports design symmetry, not runnability, and a
reader will take it for the latter.

**(c) The expected label is not the label a compliant judge should produce.** Every `CLEAR_PASS`
record proposes `PASS` while its own `adjudication_evidence_status` is `BLOCKED`. Under §2.2 the
correct output for those inputs is `BLOCKED`. The catalog patches this honestly at `:25-26` by
defining `proposed_verdict` as a hypothesis about a complete-evidence evaluation — but it leaves
unresolved which receipts a judge may see. Judge §9.2 `:691` says never a reviewer decision;
judge §7 `:281` includes "HUMAN RECEIPTS" in judge-visible evidence. For any `PASS` case the blind
solve, SME comparison, and Safari + VoiceOver receipts must be judge-visible or `PASS` is
structurally unreachable.

**(d) No human-agreement baseline is required.** §8.3 `:807-808` requires written resolution of
disagreement, and the worksheet records disagreements — but nothing measures or reports independent
reviewer agreement *per dimension, before adjudication*. When the thing under test is whether twelve
criteria are operational, human-human pre-adjudication agreement **is** the measurement of
operational clarity. Without it, a dimension can be promoted to gold on the strength of two
reviewers who never independently agreed, and a genuine rubric ambiguity gets recorded as a judge
error.

**Correction.**

- §8.1: state that the 36-case set is a discrimination smoke test, not an estimator. Require the
  owner-set sample size in §8.4 to be expressed as cases per dimension per case kind, with
  `CLEAR_FAIL` and `FAIL`-side boundary counts sized to the chosen false-pass ceiling.
- §8.4: "Report independent-reviewer agreement per dimension, measured before adjudication,
  alongside judge agreement. A dimension whose independent reviewers disagree before adjudication
  is recorded with `origin: RUBRIC`, never as a judge error."
- §8.3 promotion prerequisites: add "per-dimension pre-adjudication reviewer agreement recorded."
- Judge §7 and §9.2, plus evidence protocol §6: state explicitly that required-role *evidence*
  receipts (blind solve, SME comparison, Safari + VoiceOver, construct equivalence) are
  judge-visible with any verdict field stripped, while *adjudication* receipts (worksheet
  `review_receipts[]`, which carry a verdict) are never judge-visible.
- Anchors §8: require both members of a pair to be materialised before the pair is used, and record
  `pair_runnable: true|false` in the rollup alongside "Pair matched".

---

## 2. Important

Substantive defects that will produce inconsistent application or misread claims, but that do not by
themselves make the rubric inoperable.

### IM-1 — Kaplan analysis grants itself the clearance §9.2 says an agent cannot grant

**Refs:** `kaplan-analysis.md:3-8`; rubric `:870-871`, `:873-880`, `:742`, `:878-879`;
author `:512`; anchors `:716-721`.

`kaplan-analysis.md:3-8` states that it "contains only rights-safe, derived observations" and is
"conducted solely for internal rubric calibration". The file records copyright holder and provenance
but not the license or permission basis, its receipt, the five per-use permission statuses, excerpt
boundaries, attribution and retention limits, or a `RIGHTS_REVIEWER` decision — all of which §9.2
`:873-880` requires before calibration use. §9.2 `:878-879` says an agent "may inventory rights
evidence but cannot grant permission"; author `:512` forbids stating or implying that a
rights-safe-*looking* excerpt is rights-*cleared*. The file does the second thing, and the rubric at
`:870-871` designates it "the worked example of the permitted form."

This is the clearest instance of **wording that could fabricate approval** in the reviewed set. It
is not a missing-receipt complaint: the correct state is an honest `PENDING`, and the file instead
asserts a conclusion.

Separately, the file's twelve "Calibration:" lines are prescriptions, and at least four were adopted
into rubric criteria: C02's teach-before-assess with a low-stakes exception (`:296-301`), C03's
per-distractor observable rationale (`:324`), C05's no-answer-reveal plus fresh re-entry
(`:391`, `:387-389`), and C04's negation and reading-load clause (`:360-361`). §9.2 permits external
material to *inform* calibration; it never contemplates external material *supplying* criteria.

**Correction.** Either complete the §9.2 admission record in `kaplan-analysis.md` with
`rights_use_status: PENDING` and `RIGHTS_REVIEWER: UNASSIGNED` — the honest `BLOCKED` — or remove
the "worked example of the permitted form" designation at rubric `:870-871` until that record
exists. Add to §9.2: "A derived external observation may inform a criterion only through the same
admission record. Record in each criterion's provenance which external source informed it."

### IM-2 — C01 FAIL (c) and C02 FAIL (a) double-count an untaught relation

**Refs:** rubric `:255`, `:285-286`, `:211-222` (§5's four listed boundaries), `:190-192`.

An untaught relation required by a changed-exit item satisfies both conditions simultaneously. §5
`:190-192` forbids a second blocking finding for the same root defect and lists four boundaries;
this pair is not among them. C01's claim limit at `:265-266` disclaims prompt wording, options, and
mastery — not instructional adequacy.

**Correction.** Add a fifth §5 bullet: "**C01 / C02** — C02 owns whether any consequential demand is
untaught on the route, including a demand that first appears on the changed task. C01 owns only
whether the changed task's decision point differs from the near task's, given the teaching that
exists." Then delete C01 FAIL (c) or restate it as a non-counting cross-reference to C02.

### IM-3 — "Decision point", the load-bearing predicate of C01, is undefined

**Refs:** rubric `:253`, `:263`, `:264`, `:268` — the only four occurrences; §6 preamble `:232-235`.

C01 is the dimension the entire transfer construct rests on and carries the largest receipt burden
(`INDEPENDENT_BLIND_SOLVER` ×2 plus SME, `:269`). Its FAIL condition turns on whether "no decision
point changes", and §6 requires each FAIL condition to name an observable. The observable named is
the solution trace; the *predicate applied to it* is never defined. Two reviewers holding the same
trace can defensibly disagree about whether a change is cosmetic.

**Correction.** Define in C01: "A **decision point** is a step in the keyless solution trace at which
the solver must select among two or more operations, representations, or orientations that the
taught model licenses, and at which carrying the near task's selection forward yields a wrong or
unreachable answer. The changed-task worksheet must name the decision point and cite the
corresponding step in both traces." Add to required evidence: "the near and changed keyless solution
traces, step-aligned."

### IM-4 — C05 owns repair topology, but no criterion inspects repair *content*

**Refs:** rubric `:376-378`, `:380-383`, `:387-394`, `:400-402`; C02 `:287-288`; X03 `:517-518`;
`kaplan-analysis.md:95-96`.

C05's required evidence includes "repair content and assistance level" (`:382`), but no FAIL
condition reads it. The five conditions cover trigger targeting, fresh re-entry existence and
reachability, answer leakage, exit crediting, and bounds — all topology. The non-blocking boundary
at `:400-402` explicitly tolerates generous scaffolding. C02's reusable-procedure test (`:287-288`)
is scoped to the route's explanation, and X03 owns *delivered* feedback.

Result: a repair that reveals nothing, restates the route's original explanation verbatim, and then
administers a correctly-bound fresh re-entry passes C05, C02, and X03 as written. That is precisely
the pattern `kaplan-analysis.md:95-96` flags ("block repair designs that only reveal the correct
answer"); the rubric adopted the fresh-re-entry half and dropped the content half.

**Correction.** Add a C05 FAIL mirroring C02(b): "The repair content for the observed feature
supplies no reusable cue, operation, or validity check for the failed function — it only restates
the key, the correct answer, or the route's original explanation verbatim." Add to required
evidence: "the diff between repair content and the route's original teaching for the same
function."

### IM-5 — No criterion requires an authored repair or misconception route to be reachable

**Refs:** rubric C03 `:317-325`, C05 `:380-383`; evidence protocol `:108`;
`current-l1-analysis.md:168-172`, `:251-256`.

C03 requires every incorrect option to carry an observable-feature rationale (`:324`), but not the
converse: nothing requires every authored repair function to have a triggering option or accepted
wrong-response pattern. Dead repair content currently surfaces only as an uncoverable branch in the
evidence protocol's per-branch minimum — which produces `BLOCKED` with `origin: EVIDENCE`,
misattributing a lesson defect to an evidence gap.

**Correction.** Add a C03 FAIL: "An authored repair function or misconception route has no incorrect
option or anticipated wrong-response pattern whose observable feature triggers it." Add to C03
required evidence: "the feature-to-repair mapping, in both directions." (The converse defect — many
wrong choices unmapped and falling through to a generic fallback, as found at
`current-l1-analysis.md:168-172` — is already covered by `:324`.)

### IM-6 — `applicability` is a required field with no defined value set

**Refs:** rubric `:88-98` (ten-field contract), `:59`, `:73`, `:110-112`; author `:57-59` ("There is
no `N/A`"); judge `:542-545` (`{"type":"string","minLength":1}`).

The rubric requires an applicability decision on every dimension, forbids `N/A`, defines no legal
values, and never defines how a dimension stops being "required" despite §2.4 turning on that term.
Routes get a disciplined applicability regime at §3.2 — authoritative absence proof, named blocker,
missing proof blocks approval. Dimensions get an unconstrained free-text string.

**Correction.** Define `dimension_applicability: REQUIRED | NOT_REQUIRED_WITH_PROOF | BLOCKED` with
§3.2's discipline: `NOT_REQUIRED_WITH_PROOF` needs an authoritative absence proof reference,
`BLOCKED` needs a named blocker reference, and all twelve default to `REQUIRED`. Constrain the judge
schema field to that enum.

### IM-7 — One evaluation cannot represent more than one route, but the rubric requires all of them

**Refs:** rubric `:138`, `:439-440`, `:83-98`; judge `:402-404`, `:503-512`, `:478-502`.

`dimension_result` has no route field, and `evaluation_identity.route` is a single nullable string —
yet `:138` requires every `APPLICABLE` route to be "evaluated under every relevant dimension" and
`:439-440` requires every applicable route and consequential branch to be evaluated. The two
readings are both broken: if one run equals one route, the rubric has no defined cross-route rollup
and §7.2's per-route branch minimums have no home; if one run covers all routes, then
`evaluation_identity.route` is wrong and every dimension result silently aggregates routes with
different declared learner profiles — which is exactly what §4's route-relative adequacy forbids.

**Correction.** State in §3.1 that the evaluation unit is one exact revision **on one route**. Add a
lesson-level rollup record carrying one `dimension_result` set per `APPLICABLE` route plus the
route-proof table. Require `evaluation_identity.route` to be non-null.

### IM-8 — C02 has no claim limit, so a C02 `PASS` reads as "the lesson teaches"

**Refs:** rubric `:273-275`, `:265-266` (C01 is the only card with an explicit claim limit),
`:218-219` ("Omitted teaching is X01"); `current-l2-analysis.md:139-160`, `:419-424`.

C02's purpose line disclaims delivery, but the card states no claim limit, and §5 assigns delivered
teaching omission to X01. `current-l2-analysis.md:139-160` documents the most consequential
pedagogical failure in the entire source set — a delivered route in which the learner receives no
instruction — and assigns it to X01. X01 goes `BLOCKED` whenever browser evidence is missing, which
is the current state for every lesson. So the authored-content gate can record "C02 Instructional
adequacy: `PASS`" for a lesson that teaches a real learner nothing, and a reader scanning a
per-dimension table will read it as the opposite of the truth.

**Correction.** Add to C02's non-blocking boundary: "A C02 `PASS` asserts that the *authored* route
teaches every consequential demand. It makes no claim that the teaching is delivered. Delivery
fidelity is X01, and a C02 `PASS` recorded alongside an X01 teaching-omission finding must carry
that cross-reference." Add the same sentence to §5's C02 ownership entry.

### IM-9 — Anchor exclusion checks are stated in terms the result algorithm cannot produce

**Refs:** anchors `:108-110`, and record wording at `:170-171` ("so C03 and C04 cannot move"),
`:183` ("so C03, C04, and X01 hold"), `:426` ("so X02, X04, and X05 hold"), and similar throughout
§6; rubric `:61-67`.

For every current record the adjacent dimensions have no complete evidence, so their verdicts are
`BLOCKED` in both members of the pair. They do not "hold at a stable verdict" — a judge scoring an
anchor emits eleven `BLOCKED`s. The intended claim is that the adjacent dimensions' *deciding facts*
are byte-identical across the pair, which is true and checkable; the stated claim is about verdicts,
which is neither.

**Correction.** Restate every exclusion check as "the deciding facts for `<adjacent dimension>` are
byte-identical across the pair." Add to anchors §4: "An exclusion check is a claim about inputs,
never about adjacent verdicts." Add to the judge and worksheet calibration sections: "A case's
`judge_verdict` is `dimensions[<the anchor's dimension_id>].evaluation_verdict`. The other eleven
results are not scored."

### IM-10 — `LQA-X05-P02` proposes `PASS` on shipped UI for the one property source inspection cannot establish

**Refs:** anchors `:573-583`; rubric `:612-617`, `:608-610`, `:747-751`, `:766-768`.

The record's own text is exemplary in its honesty: "Blocked for gold, explicitly and non-negotiably:
a real Safari + VoiceOver receipt, keyboard-only trace, contrast and target measurements, and zoom
and reflow results do not exist. Source semantics and automated scanning cannot substitute." That
is the rubric's stated condition for `BLOCKED` at `:766-768` — the deciding evidence is genuinely
unavailable. The record nonetheless carries `proposed_verdict: PASS`, and the rollup at `:668`
prints "`LQA-X05-P02` · PASS" against real shipped UI. Of everything in the catalog, this is the
label most likely to be lifted out of context and read as an accessibility conclusion about shipped
behaviour. The same pattern, less sharply, applies to `LQA-C01-P02`, `LQA-X03-P01`, and the four
boundary records proposing `PASS` on real artifacts (`LQA-C02-B01`, `LQA-C04-B01`, `LQA-X01-B01`,
`LQA-X03-B01`).

Flagged as approval-fabricating wording, not as a missing receipt: the records are scrupulous about
the absence of receipts, and the defect is entirely in the label.

**Correction.** Set `LQA-X05-P02` to `proposed_verdict: BLOCKED`, or rename the field on
real-artifact records to `hypothesized_verdict_under_complete_evidence`. Either way, add a banner at
the head of anchors §6: "A proposed `PASS` on a real artifact is a hypothesis about an evidence
bundle that does not exist. It is not an observation about shipped behaviour and must never be cited
as one." The catalog says this once at `:24-26`; it needs to be where a future agent reads a record.

### IM-11 — `NOVICE_WALKTHROUGH_REVIEWER` is not novice to anything the three questions test

**Refs:** rubric `:481-487`, `:495-496`, `:749-751`.

The independence rule requires only that the reviewer "must not have authored or previously walked
that route" — novel to the *route*, not to the *KC*. An SME who has never walked the route answers
"What is this screen asking me to do?" from domain knowledge, which is the inverse of the
proxy-learner signal X02 needs. The role can be satisfied by exactly the person whose knowledge
invalidates it.

**Correction.** Extend the independence rule at `:749-751`: "A novice walkthrough reviewer must not
have authored or previously walked that route **and must not hold the target KC**. Where no such
reviewer is available the dimension is `BLOCKED`; it is not staffed by a domain expert." Consider
renaming the role `PROXY_LEARNER_REVIEWER` so the constraint is legible from the name.

### IM-12 — X05's enumerated WCAG list omits the criteria other dimensions' findings depend on

**Refs:** rubric `:597-601`; X04 `:568`; C04 `:357-358`; X05 evidence `:589-592`.

The enumeration is explicitly a floor and the FAIL condition covers the whole standard, so this is a
precision defect rather than a coverage gap — but the omissions are load-bearing. **1.4.1 Use of
Color** and **1.3.3 Sensory Characteristics** are the WCAG hooks for X04's own FAIL condition at
`:568` ("Essential meaning is carried only by animation, color, sound, hover, or a precise
gesture"); **2.5.1 Pointer Gestures** covers the gesture half; **3.3.2 Labels or Instructions** is
the hook for C04's unstated-entry-convention FAIL at `:357-358`; and **1.4.4 Resize Text** and
**1.3.2 Meaningful Sequence** are what the card's own 200 % zoom and reading-order evidence at
`:589-592` actually measure.

**Correction.** Add 1.3.2, 1.3.3, 1.4.1, 1.4.4, 2.5.1, and 3.3.2 to the enumeration, plus one
sentence: "X04's sensory-channel and gesture conditions and C04's stated-convention condition are
the instructional readings of 1.4.1/1.3.3/2.5.1 and 3.3.2. Record the root cause once under the
owning dimension and cross-reference X05."

---

## 3. Minor

Precision, ordering, and hygiene. None changes a verdict; each costs reviewer time or invites drift.

**MN-1 — C02's abstention clause is circular.** `:297-298`: "an honest abstention path exists where
guessing is uninformative." Read one way a condition, the other a description. Correct to: "an
honest abstention path exists, and selecting it is recorded as an abstention rather than as an
incorrect response."

**MN-2 — "Substantially longest option" is uncounted.** `:320-323`. The neighbouring position clause
is testable ("a position heuristic passes the consequential exits"); the length clause is not.
Express it against the required option-presentation inventory — e.g. "the key exceeds the median
incorrect-option length by more than one standard deviation across the item set."

**MN-3 — C06 names no depth framework.** `:407-435`. The anchors reason in DOK 1/2/3 levels
(`:381-383`, `:389-391`, `:399-401`) that the rubric never defines. Either name Webb's Depth of
Knowledge explicitly and pin a four-level operational table keyed to trace observables, or rename
the dimension "declared depth" and state that levels are author-declared and SME-adjudicated with
no canonical scale.

**MN-4 — Spec 05 §4's BKT prose contradicts the mastery contract, and the author protocol loads it
first.** `05-LESSON-STRUCTURAL-AUTHORING-SPEC.md:160-168` says only a licensed `CHANGED_EXIT`
licensed to `['TRANSFER']` is BKT-eligible; `lesson-evidence-mastery-contract.md:331-334` names
seven eligible modes (`INDEPENDENT`, `TRANSFER`, `DELAYED`, `MIXED`, `PASSAGE`, `TIMED`,
`PROTECTED`) and explicitly warns against restating the rule as "any mode other than
`INSTRUCTIONAL`" — which is close to what Spec 05 `:165-168` does. `rubric-consistency-audit.md`
C-03 asked Spec 05 to defer; the rubric resolves it correctly by scoping Spec 05 to structure
(`:19-27`) and the author protocol's conflict rule (`:151-155`) is right. But author §3 loads Spec
05 at step 4 and the mastery contract at step 5 (`:132-139`), so an agent reads the contradicted
claim first. Add one sentence to author §3 step 4: "Spec 05 §4's statement that only a licensed
`CHANGED_EXIT` moves `P(L)` is superseded for evidence meaning by step 5. Read Spec 05 for structure
only." (Spec 05 itself is outside this review's write scope.)

**MN-5 — Judge output permits null build identity with no semantic consequence.** judge `:396-401`;
rubric `:672-676`. Rendered dimensions require build identity, but the semantic-constraint list at
judge `:294-299` does not force `BLOCKED` when `app_git_commit` or `build_id` is null — and anchors
`:90-93` records that no commit is pinned for the code-sourced records. Add: "A null
`app_git_commit` or `build_id` forces `BLOCKED` for every `LQR-X*` dimension."

**MN-6 — Judge schema does not require the four route proofs to be distinct.** judge `:478-502` sets
`minItems`/`maxItems` 4 with no uniqueness constraint. Add to the semantic constraints: "each of the
four canonical routes appears exactly once in `route_proofs[]`; `absence_proof_ref` is non-null when
`NOT_APPLICABLE`; `blocker_ref` is non-null when `BLOCKED`." (Overlaps a judge-consistency review
finding; count once.)

**MN-7 — Anchor IDs encode the case kind the judge is meant not to see.** rubric `:827-828`; anchors
`:114-115`, `:698`. IDs read `LQA-C01-P02`, `LQA-C02-F02`, `LQA-X02-B02`. The opaque-case-ID
mitigation exists at judge `:689-692`, so this is process discipline rather than a live leak — but
it is improvised per run. Add a required `opaque_case_id` field per record, generated at fixture
time and stored outside judge input.

**MN-8 — The C03 clear pair discards a demonstrated single-fact defect for a design-only control.**
`current-l1-analysis.md:168-172` documents two identical option strings in
`vtr-vec-repair-confirmation-near-2` — a real defect mapping to exactly one FAIL bullet (`:319`)
with a trivially materialisable corrected control (delete the duplicate). Anchors `:275-282` demotes
it to a corroborating observation while `LQA-C03-P02` stays `DESIGN_ONLY`. Either adopt it as the
C03 pair or record in the supersession register why a materialisable real pair was not preferred
over a design-only one.

**MN-9 — X02's three fixed questions omit purpose.** `:484-486` tests orientation, feedback, and
next-step legibility, but never "why am I doing this?" If the owner accepts CR-1's orientation
criterion, the matching walkthrough question belongs here: "What will I be able to do that I
couldn't before?" Add it as a fourth fixed question with a non-blocking boundary permitting one
answer per KC rather than per screen.

---

## 4. Do the examples presume current or Kaplan lessons are good?

**At the policy level, no — and the discipline is unusually strong.** Rubric §9.1 states that
current lessons are calibration subjects, not exemplars. Anchors §3 and §11 mark every record
`CANDIDATE_PENDING_REVIEW` with no gold approvals and no human receipts. The three current-lesson
analyses lead with defects: `current-l1-analysis.md:163-167` (untaught special angles),
`:168-172` (duplicate options, unmapped wrong choices), `current-l2-analysis.md:139-160` (delivered
route omits the teaching layer), `current-l3-analysis.md` (repair and presentation-fidelity
defects). `autonomous-lesson-authoring-context.md` §4 repeats the non-exemplar framing. Nothing in
the reviewed set holds up a current lesson as a model to imitate.

**Two exceptions, both already filed above.**

1. **Record-level labels.** `proposed_verdict: PASS` against real artifacts (IM-10) is defined as a
   hypothesis at anchors `:24-26` and printed as a bare verdict at every record and in the rollup.
   The definition is 550 lines away from where a future agent reads. `LQA-X05-P02` is the sharp
   case: an accessibility `PASS` on shipped UI whose own text says the deciding receipt does not
   exist.
2. **Kaplan.** The rubric calls `kaplan-analysis.md` "the worked example of the permitted form"
   (`:870-871`) while that file's rights self-clearance is the form §9.2 prohibits (IM-1). Distinct
   from lesson quality, but the same failure mode: a source document asserting a status only a
   named human can confer. Four Kaplan "Calibration:" prescriptions were also adopted as rubric
   criteria without provenance, which is a weaker version of treating the source as authoritative.

## 5. Claim-limit and fabricated-approval scan

Checked every reviewed file for language that asserts approval, clearance, verification, or quality
that no recorded human decision supports. Honest `BLOCKED` states were **not** flagged.

| Location | Wording | Assessment |
| --- | --- | --- |
| `kaplan-analysis.md:3-8` | "contains only rights-safe, derived observations" | **Flagged** (IM-1). Author-granted clearance; §9.2 `:878-879` forbids it. |
| anchors `:573-583`, `:668` | `LQA-X05-P02` · `PASS` on shipped UI | **Flagged** (IM-10). Record's own text says the deciding receipt is unobtainable. |
| anchors, all `CLEAR_PASS` and four boundary records | bare `proposed PASS` on real artifacts | **Flagged** (IM-10). Hypothesis framing exists once at `:24-26`, not at the records. |
| rubric `:870-871` | Kaplan file as "worked example of the permitted form" | **Flagged** (IM-1). Endorses an incomplete admission record. |
| C02 `PASS` with X01 teaching omission | no claim limit on C02 | **Flagged** (IM-8). Reads as "the lesson teaches" when it means "the artifact contains teaching." |
| anchors `:22-26`, `:656-681` | `CANDIDATE_PENDING_REVIEW`, no gold, no receipts | Clean. Honest and repeated. |
| rubric `:917-922` | open questions incl. `PREREQUISITE_SUPPORT`, role staffing | Clean. Honest `BLOCKED`. |
| author `:505-515`, judge `:247-250`, `:707` | agent claim prohibitions, `human_decision: null` | Clean. Among the strongest text in the set. |
| worksheet, all sections | blank, awaiting reviewers | Clean. Correctly empty. |
| every reviewed file's status line | version pin and candidate status | Clean. Verified present and accurate. |

No file claims a running harness, a passing gate, an adjudicated anchor, or a staffed role.

---

## 6. Verdicts

### 6.1 Rubric foundation compliance — `COMPLIANT_WITH_REQUIRED_CORRECTIONS`

The rubric implements all six controlling decisions in `rubric-authority-resolutions.md`. Verified
individually: the canonical ten-field result and `FAIL > BLOCKED > PASS` precedence exist at §1–§2
(inverted downstream, CR-4); split anchor readiness is implemented fully and consistently across the
rubric, both protocols, the anchors, and the worksheet; the instructional-transfer-versus-mastery
separation is implemented repeatedly and correctly; the four-route universe and route-proof
authority are implemented, with the `PREREQUISITE_SUPPORT` gap honestly recorded; single ownership
holds for the four registered boundaries; and the accessibility thresholds are implemented
precisely, including the two-condition 48 px rule. The six required edits from
`rubric-consistency-audit.md` are all addressed; all twelve cards carry all six subheadings
(verified by count). The rubric's non-claims are disciplined throughout.

Four exceptions require correction before the foundation can be called clean: CR-4 (precedence
inverted at the lesson level, contradicting `:69-70`), CR-3 (route-relative adequacy has no floor,
so §4's locked decision can be used to delete a teaching obligation), IM-2 (an unregistered
C01/C02 double-count, contradicting §5 `:190-192`), and IM-1 (a rights self-clearance the rubric
endorses, contradicting §9.2). CR-1, CR-2, and CR-5 are gaps in pedagogical coverage and
calibration design rather than contradictions of the foundation, but CR-1 and CR-2 bear directly on
whether the standard measures instruction at all.

### 6.2 Future-agent usability — `NOT_READY_FOR_UNSUPERVISED_USE`

Usable now as a supervised checklist by a reviewer who already holds the pedagogical model: the
vocabulary is precise, the namespaces and version pins are clean, the evidence discipline is
genuinely reusable, and the ownership map prevents most double-counting.

Not usable by an unsupervised agent. `PASS` is unreachable per-dimension (§2.2's human-role clause
composed with §7.4's always-required product/pedagogy owner and the judge's mandatory
`human_decision: null`) and per-lesson (`PREREQUISITE_SUPPORT` has no `APPLICABLE` proof, and the
judge evaluates `BLOCKED` before `FAIL`). An agent following the documents literally emits `BLOCKED`
for every dimension of every lesson indefinitely, hiding demonstrated defects behind missing
evidence and leaving the author's revise-until-pass loop unable to fire. Five of the fifteen
mandated instructional node kinds carry no criterion, so a fully compliant route can have no stated
purpose, no expert modelling, no fading, no boundary case, and a recap requiring no retrieval. Two
author-declared fields — prerequisites and route learner profiles — can each discharge C02's central
obligation without changing what a learner receives. And the anchor set cannot measure whether any
of the twelve criteria are applied consistently, because no discrimination pair is runnable, ten
dimensions have a single `FAIL` case, and no pre-adjudication human-agreement baseline is required.

**Minimum unblock set:** CR-1, CR-2, CR-3, CR-4. **Before any calibration result is published or any
enforcement threshold is set:** CR-5.

---

## 7. Review provenance and limits

- **Read-only.** No canonical document, anchor, protocol, lesson, code file, test, config, status
  file, claims file, or plan was modified.
- **Verification performed.** `REQUIRED_NODE_KINDS` read directly from
  `packages/content/src/lesson-validator/types.ts:93-109` and matched against R8. Absence of
  *fading*, *think-aloud*, *orientation*, *recap*, *contrast boundary*, and *non-example* in the
  rubric confirmed by exhaustive search. Card subheading completeness confirmed by count (12 cards
  × 6 subheadings). The thirteen `SOURCE_OBSERVABLE` anchor records enumerated by ID and checked
  pair-by-pair; zero runnable pairs confirmed. Spec 05 `:160-168` and mastery contract `:331-334`
  read directly and compared. Every line reference in this document was re-read at the cited
  location before being cited.
- **Not verified.** No lesson was rendered, executed, or inspected in a browser. No claim here
  depends on runtime behaviour; where a source analysis is cited for a lesson defect, it is cited as
  that analysis's finding, not as an independent observation.
- **Not represented.** No human reviewer role. This review does not satisfy, substitute for, or
  anticipate `PRODUCT_PEDAGOGY_OWNER`, `DOMAIN_CONSTRUCT_SME`, or any other role in rubric §7.4.
- **Overlap disclosure.** CR-4 overlaps the judge-consistency review's finding on judge/human-gate
  conflation, and MN-6 overlaps its route-proof schema finding. Both are the same root cause viewed
  from the pedagogy side; count each root cause once.

---
---

# Re-review — 2026-08-03 (targeted verification pass against v0.9.1)

**Status:** `AGENT_REVIEW_RECOMMENDATION` — not an approval, not a human decision, not a gate.
**Reviewer:** automated agent. No human reviewer role was staffed, consulted, or represented.
**Mode:** read-only. No canonical document, anchor, protocol, lesson, code file, test, config, status
file, claims file, or plan was modified. This report is the only write.
**Subject:** rubric `0.9.1` / anchor set `0.9.1-candidate`, dated 2026-08-03, superseding the `0.9`
this report's first section reviewed. Sections 0–7 above are preserved unedited as the record of what
was found in `0.9`; this section supersedes their verdicts.

## R0. What was re-read, and how each finding was checked

Read in full or in the relevant part: `lesson-quality-rubric.md` (1362 lines, was 927),
`lesson-quality-rubric-anchors.md` (912, was 771), `lesson-quality-author-protocol.md` (674, was
526), `lesson-quality-judge-protocol.md` (1456, was 725), `lesson-quality-evidence-protocol.md`
(385), `lesson-quality-calibration-worksheet.md` (616), `autonomous-lesson-authoring-context.md`
(364), all nine `lesson-quality-sources/*.md`, and the Spec 05 and mastery-contract sections
previously cited.

Every finding was checked against the corrected text rather than against a changelog. Structural
claims were re-derived: `FAIL` bullets were counted programmatically per card to test criterion
ordinals; every `LQR-*.FAIL.*` citation in the family was extracted and resolved against the bullet
it names; the anchor rollup's `pair_runnable` and verdict-field counts were read from the catalog;
and the family was scanned for surviving approval-asserting language.

## R1. Disposition of the 26 prior findings

**All five Critical and all twelve Important findings are resolved. All nine Minor findings are
resolved.** One Important finding is resolved in rule but leaves residual nonconforming wording in
four anchor records (IM-9). Details below, with the corrections that discharge each.

### Critical

| ID | Prior defect | Disposition |
| --- | --- | --- |
| CR-1 | Five R8 node kinds unjudged | **Resolved.** `rubric:484-487` assigns `ORIENTATION`, `EXPERT_THINK_ALOUD`, `LIGHT_SUPPORT_PRACTICE`, `CONTRAST_BOUNDARY`, `RECAP` to C02 with the right framing — whether the function is *performed*, not whether the node exists. Five new `FAIL` bullets at `:512-524`; learner-facing objective and assistance-affordance inventory added to required evidence `:489-499`; `:358` widens the §5 ownership row; recap-without-retrieval placed as non-blocking at `:545-546`. |
| CR-2 | Declared-prerequisite escape hatch | **Resolved.** `§4:320-323` makes a prerequisite an evidence-bearing claim; `C02.FAIL.2` (`:505-507`) tests curriculum-relation resolution, `hard_prerequisites[]` membership, and sequence position; required evidence binds the relation ID `:491-493`. The unchecked-prerequisite case is `BLOCKED`, not `FAIL` (`:534-538`), correctly reasoned from open decision 4. |
| CR-3 | No route-adequacy floor or reachability test | **Resolved.** `§4:315-319` states the floor verbatim — profile declaration reassigns where a demand is taught, never removes it — and denies self-certification. `C02.FAIL.12` (`:526-527`) catches a profile presuming its own KC or unreachable by the named authority; `C02.FAIL.13` (`:528-530`) requires a `MISCONCEPTION` route's target to be triggerable. |
| CR-4 | `PASS` unreachable; precedence inverted at lesson level | **Resolved, thoroughly.** `§2.2:87-93` splits evidence from decision roles and states the failure it prevents; `§7.4:1038-1053` enumerates both lists and handles a person acting in both; `§2.4:168-196` separates `lesson_verdict`, `human_gate_status`, and `approval_withheld`, with `FAIL` evaluated first and the reason given at `:182-184`. The judge schema now *enforces* it: `judge:653-676` pins `lesson_verdict` by `if/then`, `:718` makes `approval_withheld` `const true`, `:1305-1311` adds route-agreement and verdict-recomputation checks. Author `:619-622` reads the loop off `lesson_verdict`. |
| CR-5 | Calibration set cannot measure what §8.4 promises | **Resolved, and hardened beyond the recommendation.** `§8.1:1129-1133` states the set is a discrimination smoke test and that one `CLEAR_FAIL` per dimension reports nothing; `:1135-1139` adds `pair_runnable` and distinguishes matched from runnable; `:1141-1143` scores only the anchor's own dimension. `§8.3:1180-1184` gates promotion on pre-adjudication agreement and `pair_runnable`. `§8.4:1229-1245` splits judge-visible evidence receipts from adjudications, requires per-dimension pre-adjudication reviewer agreement with `origin: RUBRIC` on disagreement, and requires sample size as cases per dimension per case kind. The catalog reports `pair_runnable` **0 true / 12 false** (`anchors:812`) and `actual_verdict_on_available_evidence` **36 `BLOCKED`** (`:810`). Beyond what I asked: `§8.4:1209-1217` rejects calibration mode outright until a trusted controller verifies a `GOLD_APPROVED` record, naming the stale `0.1-draft` fixture as the concrete hazard. |

### Important

| ID | Prior defect | Disposition |
| --- | --- | --- |
| IM-1 | Kaplan self-granted rights clearance | **Resolved.** `kaplan-analysis.md:3-19` now carries `rights_use_status: PENDING`, `RIGHTS_REVIEWER: UNASSIGNED`, no receipt, no permission basis, and explicitly names the prior paragraph as a self-clearance an author cannot grant. `rubric:1289-1294` removes the "worked example of the permitted form" designation and forbids citing it as one. `:1296-1304` adds the provenance rule and holds the four Kaplan-shaped criteria provisional while recording that each is independently supported internally. Open decision 9 tracks the disposition. |
| IM-2 | C01/C02 double-count unregistered | **Resolved.** `§5:372-376` registers the boundary and assigns `owner_dimension_id: LQR-C02`; `C01:458-461` restates it and confines C01 to a non-counting cross-reference. |
| IM-3 | "Decision point" undefined | **Resolved.** `C01:434-440` defines it as a selection step in the keyless trace where carrying the near task's choice forward fails, requires it to be *located* by step index in both traces, and makes an unlocatable claim `BLOCKED` rather than `FAIL`. Step-aligned traces added to required evidence `:443-444`. |
| IM-4 | No criterion inspected repair content | **Resolved.** `C05.FAIL.6` (`:660-664`) blocks repair that only restates the key, the answer, or the original explanation, judged against a required content diff (`:643-644`), and adds the sharpest sentence: a repair that administers a correctly bound re-entry but teaches nothing between miss and re-entry is not a repair. |
| IM-5 | Unreachable repair had no owner | **Resolved.** `C05.FAIL.7` (`:665-667`) with a bidirectional feature-to-repair mapping in required evidence (`:644-646`), plus the exact origin discipline the prior review asked for at `:669-673`: a missing capture is `BLOCKED`/`origin: EVIDENCE`, nothing-can-trigger-it is `FAIL`/`origin: LESSON`, "do not record the second as the first." |
| IM-6 | `applicability` an unconstrained string | **Resolved.** `§2.3:128-138` defines `REQUIRED | NOT_REQUIRED_WITH_PROOF | BLOCKED`, applies §3.2's absence-proof discipline, and defines "required" for §2.4. `judge:998` constrains the enum; `:1174` conditions the absence-proof requirement on it. |
| IM-7 | One evaluation could not carry multiple routes | **Resolved.** `§3.1:231-234` fixes the unit at one route and makes the identity's `route` non-null; `:236-254` adds `lesson_rollup` with one envelope set per `APPLICABLE` route and attaches §7.2's per-route branch minimums to that route's evaluation. `judge:1305-1307` voids an evaluation of a non-applicable route. |
| IM-8 | C02 had no claim limit | **Resolved.** `C02:549-553` adds an explicit **Claim limit** paragraph stating that a `PASS` claims authored teaching only, requiring the X01 cross-reference, and naming the misreading it prevents. `§5:377-380` registers C02/X01. |
| IM-9 | Exclusion checks stated as adjacent verdicts | **Resolved in rule; residual wording.** `anchors:190-207` replaces prose with a hashed `exclusion_check` object comparing byte-identical adjacent deciding facts, names "C03 and C04 cannot move" and "the adjacent dimension would also pass" as *not* exclusion checks, and discloses that every §6 prose note is a statement of intent pending computation. Four §6 records still use the rejected phrasing verbatim — see NR-5. |
| IM-10 | `PASS` labels on real artifacts | **Resolved.** The field is renamed `hypothesized_verdict_under_complete_evidence` (`anchors:52`, `:83`) and paired with a new `actual_verdict_on_available_evidence`, `BLOCKED` for all thirty-six. Record headers now read "hypothesized `PASS` · actual `BLOCKED`" (e.g. `LQA-X05-P02` at `:704`), and the rollup states "None of these is a label, an expected verdict, or a claim about a real lesson" (`:808-809`). `rubric:1186-1190` states the rule. |
| IM-11 | Novice reviewer not novice to the KC | **Resolved.** `§7.4:1105-1109` adds "and must not hold the target KC", explains why a domain expert inverts the signal, and requires `BLOCKED` rather than expert substitution. Per the review instruction, open decision 8 — whether to rename the role `PROXY_LEARNER_REVIEWER` — is an honestly open naming question, explicitly scoped as "not a behavior change", and is **not** counted as a defect. |
| IM-12 | X05's WCAG list omitted dependent criteria | **Resolved.** `X05:896-901` enumerates twenty-four criteria including all six named — 1.3.2, 1.3.3, 1.4.1, 1.4.4, 2.5.1, 3.3.2 — and keeps the enumeration a floor. `:910-917` adds a **Criteria other dimensions depend on** subsection mapping each to the card that owns the root cause. |

### Minor

All nine resolved: MN-1 abstention now recorded as an abstention (`C02:542-543`); MN-2 option length quantified as one standard deviation above the median incorrect option (`C03:576-578`); MN-3 Webb's DOK named with a four-level table keyed to trace observables (`C06:688-702`) plus a glossary entry (`:49`); MN-4 author `:212-219` warns that Spec 05 §4's evidence prose is superseded and is read as historical context; MN-5 `§7.1:995-997` forces `BLOCKED` on every `LQR-X*` when build identity is null; MN-6 `route_proofs` is a four-member object with `additionalProperties: false` and all four required (`rubric:267-283`, `judge:613-619`), making duplication structurally impossible rather than rule-enforced; MN-7 a single-use random `opaque_case_id` is minted per run and held outside model context (`§8.4:1219-1222`, `anchors:43`); MN-8 the C03 pair was **replaced** with the L1 duplicated-distractor defect, decidable by string comparison with a control produced by deleting one option string, and the reasoning is recorded in the supersession register (`anchors:234-237`, `:348-380`); MN-9 X02 now asks four fixed questions with the per-KC boundary and an explicit C02/X02 ownership split (`:777-779`, `:800-803`).

## R2. Remaining findings

No Critical findings remain. Two Important and four Minor.

### Important

#### NR-1 — C03's cross-reference to the dead-repair criterion names the wrong ordinal

**Refs:** `rubric:584-588` (C03's cross-reference note, citing `LQR-C05.FAIL.6`);
`C05:650-667` (the seven `FAIL` bullets); `§6.0:407-423` (ordinal scheme).

C03's note routes the unreachable-repair root cause to LQR-C05 and cites `LQR-C05.FAIL.6`. Counted
in printed order as §6.0 requires, C05's `FAIL` bullets are: 1 no fresh re-entry (`:652`), 2 repair
targets a different function (`:655`), 3 repair reveals the re-entry answer (`:656`), 4 repair
completion closes the exit (`:657`), 5 no bound (`:658`), 6 **Repair content** (`:660`), 7 **Dead
repair** (`:665`). The dead-repair criterion is `LQR-C05.FAIL.7`. `FAIL.6` is the repair-content
criterion — a different root cause with a different deciding observable (a content diff, not the
reverse direction of the feature-to-repair mapping).

This matters more than a typo because the two cards now disagree about the criterion ID of one root
cause, which is precisely what §2.3's `root_cause_id` / `owner_dimension_id` discipline and §6.0's
stable-ID promise exist to prevent. An agent following C03's pointer files the cross-reference
against the wrong criterion, and per-criterion calibration reporting under §8.4 would attribute it
to the wrong bullet. It is also the predicted failure mode of §6.0's own warning at `:420-423`:
these two criteria were the last two bullets added to C05, and the ordinal was written before the
insertion settled.

**Correction.** Change `LQR-C05.FAIL.6` to `LQR-C05.FAIL.7` at `rubric:586`. Then add a
verification step wherever the worksheet's wording-change record is maintained: after any bullet
insertion, re-resolve every `LQR-*.FAIL.*` citation in the family against the bullet it names. The
family currently contains exactly two substantive criterion citations — this one and
`LQR-C02.FAIL.1` at `:460`, which resolves correctly — so the check is cheap now and will not stay
cheap.

#### NR-2 — Two judge-visible evidence receipts have no documented shape

**Refs:** `evidence-protocol:258-306` (Safari + VoiceOver and construct-equivalence shapes),
`:308-320` (§6.1 names "the independent blind-solve record and the SME construct comparison" as
judge-visible evidence receipts); `rubric:1318-1331` (§10 assigns "the manual receipt shapes" to the
evidence protocol); `X02:774-779`, `:787-788`, `:794-795`; `C01:446`, `:455-456`; `C04:611`,
`:615-616`; `§7.4:1088`.

The evidence protocol defines two receipt shapes. Three more are required by the rubric and named as
judge-visible, and two of those have no shape anywhere in the family:

- **Novice walkthrough.** Required "always" for X02 (`§7.4:1088`), and its recorded answers are the
  sole deciding observable for `LQR-X02.FAIL.3`. Nothing documents who records it, how the four
  answers are captured per consequential screen, how the per-KC allowance for the fourth question is
  represented, or — most consequentially — how the reviewer attests to the constraint that just
  became binding, that they do not hold the target KC (`§7.4:1105-1109`). An independence rule with
  no receipt field to record it is unverifiable in practice.
- **Independent blind solve.** Two receipts each for C01 and C04 (`§7.4:1080`, `:1083`).
  `C01.FAIL.4` turns on whether the solver reached a defensible non-key answer *or recorded that
  administration cued the key*; `C04.FAIL.1` turns on whether two solvers answered different
  defensible questions. Both are comparisons across two records, and neither the fields nor the
  keylessness attestation is specified.

This is a documentation gap on the path to `PASS`, not a reachability blocker: §2.2 correctly yields
`BLOCKED` while the receipts are absent, which is the honest state. But it is asymmetric with how
carefully the other two receipts are specified, and it sits on the one dimension whose evidence is
entirely a human answer set. The gap is also the reason the X02 question-count slip in NR-3 had
nowhere to be caught.

**Correction.** Add to evidence protocol §6 a `novice_walkthrough_receipt` — reviewer identity and
role, `holds_target_kc: false` attestation, `previously_walked_route: false`, lesson revision, route,
per-screen answers to the four fixed questions with the screen reference, the per-KC answer to the
fourth question where that allowance is used, `recorded_at`, `receipt_ref` — and a
`blind_solve_receipt`: solver identity, `saw_key_or_rationale_or_feedback: false`, item reference,
the answer produced, whether the solver judged it defensible, any administration or wording cue
observed, `recorded_at`, `receipt_ref`. Both are observations, so both belong in §6.1's judge-visible
list, which already names the blind solve.

### Minor

**NR-3 — `§7.4` says the novice walkthrough has three questions; X02 says four.**
`rubric:1106-1107` reads "the three orienting questions test what a proxy learner can read off the
screen," while `X02:777-779` lists four, `:787-788` makes failing any one of "the four fixed
questions" blocking, and `:800-803` discusses "the fourth walkthrough question." The independence
paragraph was not updated when MN-9's fourth question was added. Correct "three" to "four" at
`:1106`.

**NR-4 — `§5` announces five boundaries and lists six.**
`rubric:370` reads "The five boundaries that previously double-counted:" above six bullets — C01/C02
(`:372`), C02/X01 (`:377`), C03/C04 (`:381`), C05/X03 (`:384`), X01/X02 (`:387`), X05/X06 (`:390`).
The original four gained two in this wave. Correct the count to six, or reword to "The boundaries
that previously double-counted, including two this version adds:".

**NR-5 — Four anchor records still phrase exclusion checks as adjacent verdicts.**
`anchors:287` ("so C03, C04, and X01 hold"), `:438` ("so C03 holds"), `:640` ("so X01 holds"),
`:680` ("X01 holds"), plus `:275` ("cannot move") — the exact two formulations `§4:203` names as not
being exclusion checks. The risk is contained: `§4:205-207` discloses that every §6 prose note is a
statement of intent pending hash comparison and that none has been computed, and `LQA-C03-F03` at
`:356-359` already models the corrected form ("Exclusion check (pending computation): … the one
transform touches none of them, so all three hashes should compare identical once the control
exists"). This is wording hygiene, not a live claim. Conform the remaining records to the
`LQA-C03-F03` pattern.

**NR-6 — One status file outside this review's set still calls the Kaplan analysis rights-safe.**
`key-docs/lesson-quality-run-status.md:17` reads "Rights-safe Kaplan lesson-structure analysis." It
is the last surviving instance of the phrase corrected everywhere else in this wave, and it now
contradicts both `kaplan-analysis.md:3-19` (`PENDING`, `UNASSIGNED`) and `rubric:1289-1294`. Flagged
only because the review brief asks specifically for wording that could fabricate approval; it is
outside the reviewed document set and outside this report's write scope, so it is recorded here for
the owner rather than corrected. Restate as "Kaplan lesson-structure analysis (rights
`PENDING`)".

*Not counted as findings.* The unstaffed `NOVICE_WALKTHROUGH_REVIEWER` and every other §7.4 role
(open decision 5), the `PROXY_LEARNER_REVIEWER` rename (open decision 8), `PREREQUISITE_SUPPORT`
(open decision 4), the `0.1-draft` fixture regeneration (open decision 3), the absent harness (open
decision 7), and the Kaplan rights disposition (open decision 9) are all honestly recorded as open
or blocked, with the consequence of each stated where it bites. Per the review brief and rubric
§7.4's own rule that an unavailable specialist is `BLOCKED`, these are scheduling and ownership
items, not documentation defects.

## R3. Examples, claim limits, and approval wording — re-scan

**Do the examples presume current or Kaplan lessons are good? No, and the two prior exceptions are
closed.** The `hypothesized_verdict_under_complete_evidence` rename plus the new
`actual_verdict_on_available_evidence` (36 `BLOCKED`) removes the bare-`PASS`-on-real-UI reading;
record headers now carry both values, so the disclaimer travels with the label instead of sitting
550 lines away. `LQA-X05-P02` (`anchors:704-714`) now reads "hypothesized `PASS` · actual
`BLOCKED`" above the same honest note that the Safari + VoiceOver receipt does not exist. The Kaplan
designation is withdrawn and its four downstream criteria are marked provisional with recorded
provenance. `§9.1:1255-1259` still states that nothing in Lessons 1–3 is presumed to pass, and every
source analysis carries an accurate status line.

**Approval-fabricating wording:** one instance remains, in a status file outside the reviewed set
(NR-6). Within the reviewed set the scan is clean. `GOLD_APPROVED` appears only in prohibitions,
preconditions, and open decisions; `rights-safe` appears only in the permitted-form definition, in
prohibitions, and in the Kaplan file's own correction notice; author `:663` retains the "a
rights-safe-looking excerpt is rights-cleared" prohibition. Worksheet `:25-28` adds a rule I had not
asked for and would have: the anchors are hand-built to isolate one dimension each and are not a
sample of the lesson population, so no completed worksheet may report an agreement figure as a
property of the judge's behaviour on real lessons.

**Claim limits** now exist where they were missing: C02's authored-versus-delivered limit
(`:549-553`), C01's transfer-only limit (`:467-470`), X05's 48 px preferred-standard boundary
(`:923-928`), `§8.1:1129-1133` on what 36 cases can and cannot show, and `§1:37-39`'s nonclaims.

## R4. Verdicts

### R4.1 Rubric foundation compliance — `COMPLIANT`

All four foundation exceptions from the prior pass are closed. Precedence is `FAIL > BLOCKED >
PASS` at the dimension level (`§2.2:84-85`) and at the lesson level (`§2.4:172-184`), with the
inversion's consequence stated and the judge schema enforcing it. Route-relative adequacy has an
explicit floor and a non-self-certifying profile rule (`§4:313-319`). The C01/C02 boundary is
registered with a single `owner_dimension_id` (`§5:372-376`). The Kaplan self-clearance is withdrawn,
its record is honestly `PENDING`, and the criteria it shaped are marked provisional (`§9.2:1289-1304`).

Compliance with the six controlling decisions in `rubric-authority-resolutions.md` is now clean
rather than substantial, and the six required edits from `rubric-consistency-audit.md` remain
addressed. The two remaining defects are an incorrect criterion ordinal in one cross-reference
(NR-1) and an undocumented shape for two required receipts (NR-2). Neither contradicts a locked
decision, a controlling resolution, or a stated nonclaim; both are defects in *applying* rules the
rubric states correctly. The version discipline is also honest: `:8-9` records that no evaluation
was ever run against `0.9`, so nothing is relabelled by the version change.

### R4.2 Future-agent usability — `READY_FOR_UNSUPERVISED_USE_WITH_TWO_RECOMMENDED_FIXES`

The three blockers from the prior pass are gone. `PASS` is reachable per dimension, because only an
evidence role blocks one and the split is stated in the algorithm itself rather than left to be
inferred. `PASS` is reachable per lesson, because approval withholding is a separate boolean from
the verdict and a demonstrated defect outranks the unproven route. The five previously unjudged
instructional functions now carry blocking conditions with named observables, so an authoring agent
that satisfies R8 and C02 has actually built a teaching cycle rather than a coverage list. The two
escape hatches are closed: a declared prerequisite must resolve to a curriculum relation taught
earlier, and a declared route profile must be reachable from an observable learner state and cannot
presume its own KC.

An authoring agent can now work the loop end to end: thirteen C02 conditions with stated
observables, a self-audit envelope that separates result from analysis, a revise loop keyed to
`lesson_verdict`, and a `BLOCKED` state it is instructed to report rather than route around. A
judging agent can emit a schema-valid result whose precedence and route agreement are machine-checked
(`judge:653-676`, `:1305-1311`) and whose approval field it cannot set. Calibration is not merely
described honestly but hard-gated: no controller exists, no record is `GOLD_APPROVED`, and
`§8.4:1209-1217` rejects calibration mode without depending on a model noticing that the anchor set
is candidate-only.

Two fixes are recommended before a first agent run rather than after. NR-1 because a wrong criterion
ordinal silently misfiles a cross-reference and corrupts per-criterion reporting, and it is a
one-character change. NR-2 because X02 and C01/C04 cannot be driven to `PASS` by any agent until the
receipts they require have a shape someone can produce and validate — the dimensions correctly sit
at `BLOCKED` meanwhile, so this is a gap on the path rather than a false claim. Neither requires
reopening a locked decision.

The remaining distance to enforcement is implementation and staffing, both honestly enumerated in
§10: no harness, no receipts, no staffed roles, no gold anchors, a stale fixture. Judged as what it
claims to be — a written standard, not software — this family is now internally consistent enough for
an unsupervised agent to apply.

## R5. Re-review provenance and limits

- **Read-only.** No canonical document, anchor, protocol, lesson, code file, test, config, status
  file, claims file, or plan was modified. This report is the sole write, appended below the
  preserved `0.9` review.
- **Verified in this pass.** C05's seven and C02's thirteen `FAIL` bullets counted programmatically
  in printed order; all six `LQR-*.FAIL.*` citations in the family extracted and resolved against
  the bullets they name (four are format examples of the form `LQR-C02.FAIL.3`, two are substantive,
  one of those is wrong); §5's boundary bullets counted against its stated total; `pair_runnable` and
  the verdict-field counts read from the anchor rollup; the family scanned for `rights-safe`,
  `GOLD_APPROVED`, and clearance-asserting phrasing; the evidence protocol's §6 receipt shapes
  enumerated against the receipts §7.4 requires; every line reference re-read at its cited location.
- **Not verified.** Nothing was rendered, executed, or inspected in a browser. No hash was computed.
  No anchor was materialized. The claim that no pair is runnable is the catalog's own, now
  self-reported at `anchors:812`, not an independent check of bytes.
- **Not represented.** No human reviewer role. This re-review does not satisfy, substitute for, or
  anticipate any role in §7.4, and it approves nothing.
- **Scope note.** NR-6 concerns a status file outside the review set; it is reported, not corrected,
  and it is the only finding here that falls outside the exact document set reviewed.

---
---

# Final gate review — 2026-08-03 (post-bounded-correction)

**Status:** `AGENT_REVIEW_RECOMMENDATION` — not an approval, not a human decision, not a gate
outcome. A qualified human decides.
**Reviewer:** automated agent. No human reviewer role was staffed, consulted, or represented.
**Mode:** read-only. No canonical document, anchor, protocol, lesson, code file, test, config, status
file, claims file, or plan was modified. This report is the only write. `git status` confirms no
tracked file was edited.
**Subject:** live rubric `0.9.1` (1406 lines), anchors `0.9.1-candidate` (932), evidence protocol
(508), judge protocol (1454), author protocol (677), calibration worksheet (711) — after the bounded
correction responding to the re-review above.
**Preceding sections are preserved unedited.** This section supersedes their verdicts.

## G0. Result

| Severity | Count | Detail |
| --- | --- | --- |
| Critical | **0** | None open. None regressed. |
| Important | **1** | GT-1, new: `applicability: BLOCKED` has no stated consequence for `route_verdict`. |
| Minor | **0** | All four prior Minor findings resolved. |

Both prior Important findings (NR-1, NR-2) and all four prior Minor findings (NR-3 – NR-6) are
resolved. No prior Critical or Important finding regressed; three were strengthened beyond their
corrections.

## G1. The six prior findings — verified resolved

**NR-1 — criterion cross-reference ordinal. Resolved, and the class of defect was eliminated rather
than the instance.** Rather than changing `.6` to `.7`, `§6.0:437-456` introduces a stable semantic
`criterion_key` alongside the ordinal form, makes the semantic key canonical for cross-card
references, states that it "does not change when a neighboring bullet is inserted," and forbids
inventing a key that is not printed on its bullet. Verified mechanically: every
`LQR-*.<subheading>.<key>` citation in the family was extracted and resolved — eight citations, all
semantic, **zero numeric ordinals remaining**. Both keys are printed on the bullets they name:
`LQR-C02.FAIL.UNTAUGHT_CONSEQUENTIAL_DEMAND` at `rubric:536` (cited from C01 at `:492`) and
`LQR-C05.FAIL.DEAD_REPAIR` at `:699` (cited from C03 at `:620`). C05's `FAIL` bullets were recounted
in printed order and dead repair remains the seventh, which is now irrelevant to the citation — the
point of the fix.

**NR-2 — undocumented receipt shapes. Resolved, with more than was asked for.** Evidence protocol
§6.1 `:346-393` adds `novice_walkthrough_receipt` and §6.2 `:395-426` adds `blind_solve_receipt`.
Beyond the recommendation: the four questions are named literally in prose with the note that "they
are not reviewer-selected prompts" (`:351-353`); the per-KC allowance is a field,
`purpose_answer_scope: PER_SCREEN | PER_TARGET_KC` (`:349-350`, `:383`); the independence
constraints are literal-false attestations with an explicit rule that true *or unknown* cannot
satisfy X02 (`:389-391`); both receipts bind lesson revision, content hash, application commit,
build ID, build environment, and manifest hash; and the blind-solve receipt carries the two fields
`C01.FAIL` and `C04.FAIL` actually turn on — `answer_judged_defensible_by_solver` and
`administration_or_wording_cues_observed[]` — plus `consulted_other_solvers_before_recording:
false`, which is what makes two receipts two independent observations. §6.3 `:432` updates to "the
four shapes above," and the judge-visibility rule is tightened from stripping a verdict field to
**rejecting the whole record** from judge context "rather than trusted because it can be stripped"
(`:435-438`, `:447-449`) — a stronger boundary than the version I reviewed.

**NR-3 — stale question count. Resolved.** `§7.4:1150-1151` now reads "the four orienting
questions." No `three (orienting|fixed)` construction survives anywhere in the rubric, including
across line breaks.

**NR-4 — boundary count. Resolved.** `§5:400` reads "The six boundaries that previously
double-counted," matching six bullets.

**NR-5 — exclusion-check wording. Resolved comprehensively, not just for the four records flagged.**
All fourteen exclusion checks in the anchor inventory now read "Exclusion check (pending
computation): … bytes are the adjacent deciding facts …", conforming to the `LQA-C03-F03` pattern.
Zero instances of `hold`, `cannot move`, or `would also pass` remain in any exclusion check.

**NR-6 — surviving "rights-safe" claim in a status file. Resolved.** No `rights-safe` construction
remains in `lesson-quality-run-status.md`. *Scope disclosure:* that file is outside the
rubric/anchors/protocols set this pass was directed to read; I checked one line of it solely to
close my own prior finding, and edited nothing.

## G2. Regression spot-checks — all clear

Each prior Critical and Important was re-resolved at its live location, not assumed from the absence
of a changelog entry.

| Prior finding | Live state |
| --- | --- |
| CR-1 five node kinds | Intact. Five function bullets at `rubric:546-558`; C02 still carries thirteen `FAIL` bullets (recounted). |
| CR-2 prerequisite hatch | Intact. `hard_prerequisites[]` binding and sequence-position condition present. |
| CR-3 route floor | Intact. `§4` "The floor:" present; profile-presumes-KC and misconception-reachability conditions present. |
| CR-4 result/human-gate semantics | **Strengthened.** See below. |
| CR-5 calibration claims | Intact. Discrimination-smoke-test framing, `pair_runnable` **0 true / 12 false**, `actual_verdict_on_available_evidence` **36 `BLOCKED`**, calibration mode "rejected outright," pre-adjudication agreement required for promotion. |
| IM-1 Kaplan rights | Intact. `rights_use_status: PENDING`, `RIGHTS_REVIEWER: UNASSIGNED`, "**not** a worked example of the permitted form" (`:1335-1336`). |
| IM-2 – IM-5 | Intact. §5 C01/C02 boundary; decision-point definition; repair-content and dead-repair conditions with the `origin: EVIDENCE` vs `LESSON` discipline. |
| IM-6 applicability enum | Intact as an enum — but one member's consequence is unspecified. See GT-1. |
| IM-7 route rollup | **Strengthened.** See below. |
| IM-8 C02 claim limit | Intact. |
| IM-10 hypothesis labels | Intact. Rollup counts unchanged and still carry "None of these is a label, an expected verdict, or a claim about a real lesson." |
| IM-11 novice independence | Intact, and now enforceable: `§7.4:1149-1153` plus the `holds_target_kc: false` attestation field. |
| IM-12 X05 WCAG list | Intact, including the "Criteria other dimensions depend on" subsection. |
| MN-2, MN-3, MN-6, MN-7 | Intact: standard-deviation length test; Webb's DOK named; four-member `route_proofs` object with `additionalProperties: false` and all four required (`judge:620-628`); `opaque_case_id`. |
| MN-5 build identity | **Strengthened.** `§7.1:1035-1038` upgrades it from "forces `BLOCKED` for every `LQR-X*`" to a named global precondition `APPLICATION_IDENTITY_NULL` that voids the route evaluation and forces **all twelve** dimensions `BLOCKED`, consistent with §3.1's global-precondition rule. |

**CR-4 and IM-7 strengthened.** `§2.4:174-220` splits what was one lesson aggregation into a
model-emitted `route_verdict` for the one evaluated route and a `lesson_verdict` that **only a
trusted controller may create**, after the four-member route-proof record exists and exactly one
accepted, identity-matched route record exists per `APPLICABLE` route. Precedence `FAIL > BLOCKED >
PASS` holds at both levels (`:186`, `:213-215`), the model is barred from emitting
`lesson_verdict`, `human_gate_status`, `approval_withheld`, or `approval_blockers` (`:187-188`), and
`:220` adds "No model-issued field is proof that the controller performed these checks." The judge
schema enforces the split: `derivation` is a closed four-value enum pinned to `route_verdict` by
`if/then` (`judge:640-681`), and `route_verdict: PASS` requires every dimension to be `PASS`
(`:731-756`). This closes the residual risk in the version I reviewed, where a model could report a
lesson-level aggregate it had no standing to compute.

## G3. Remaining finding

### GT-1 (Important, new) — `applicability: BLOCKED` has no stated consequence for `route_verdict`

**Refs:** `rubric §2.3:134-144`, `§2.4:180-185`; `author:121-125`, `:563-567`;
`judge:1190-1207`, `:731-756`; contrast `rubric §3.2:292-331`.

`§2.3` defines a closed three-value applicability enum and specifies the consequence of two members
precisely. `REQUIRED` is scored. `NOT_REQUIRED_WITH_PROOF` is handled in unusual detail at
`:142-144` — non-scoring, normalized wire verdict always `PASS`, empty blocking and blocker arrays,
ignored by route and lesson recomputation, and explicitly "not a claim that the dimension was
scored." For `BLOCKED`, `§2.3` requires a named blocker in `blocker_refs[]` and says nothing further.

`§2.4:180-185` then recomputes the route verdict from `REQUIRED` dimensions only, ignoring
`NOT_REQUIRED_WITH_PROOF`. A dimension whose `applicability` is `BLOCKED` is in neither class, so
the literal algorithm counts it for neither `FAIL` nor `BLOCKED` and the route falls through to
`PASS`. The direction of error is unsafe: `applicability: BLOCKED` means the evaluation could not
determine *whether the dimension even applies*, which is strictly less knowledge than a `REQUIRED`
dimension that is `BLOCKED` for missing evidence — and the latter blocks the route while the former
does not.

The asymmetry with the route namespace makes this legible as an oversight rather than a design
choice. `§3.2:315-322` gives `route_applicability` the same three values and states the third
member's consequence explicitly: a `BLOCKED` route "requires a named blocker **and** its evidence
reference, and blocks lesson-level approval while the route is required." The dimension namespace
never got the parallel sentence.

**The judge path is already closed; the author path is not.** The judge schema forces
`applicability: BLOCKED` → `evaluation_verdict: BLOCKED` with a non-empty `blocker_refs`
(`:1190-1207`), and separately forces `route_verdict: PASS` → all twelve dimensions `PASS`
(`:731-756`). No judge output can express the unsafe combination. The author self-audit can:
`author:121-125` mirrors §2.3's careful `NOT_REQUIRED_WITH_PROOF` paragraph and is likewise silent
on `BLOCKED`, and `author:563-567` restates the `REQUIRED`-only precedence rule with a three-value
`derivation` enum. An authoring agent following the prose records `route_verdict: PASS` on a route
carrying a dimension of undetermined applicability.

**Origin.** This is the residue of IM-6 rather than a fresh defect: IM-6 asked for a closed enum
with §3.2's discipline and got it, but the consequence of one member was never specified. It is also
partly a consequence of this correction wave. The `lesson_verdict` I reviewed carried a catch-all —
"or the evidence bundle is incomplete under §7.1–§7.3" — that plausibly swept this in. The tighter
`route_verdict` enumerates only `REQUIRED`-dimension conditions plus `PRECONDITIONS_BLOCKED`, and
that latter value covers *global* preconditions such as `APPLICATION_IDENTITY_NULL`, not a
per-dimension applicability blocker.

**Correction — one sentence in each of three places; no design decision required, because the judge
schema already implements the intended behavior.**

- `§2.3`, after the `NOT_REQUIRED_WITH_PROOF` paragraph: "`BLOCKED` applicability is a scoring
  outcome, not an exemption. The dimension's `evaluation_verdict` is `BLOCKED`, and route and lesson
  recomputation treat it exactly as a `REQUIRED` dimension that is `BLOCKED`. An undetermined
  applicability is less knowledge than a determined one and never yields a `PASS`."
- `§2.4:180-182`: change the `BLOCKED` clause to "else if any dimension whose `applicability` is
  `REQUIRED` or `BLOCKED` is `BLOCKED`," or rename the derivation value
  `ANY_REQUIRED_DIMENSION_BLOCKED` to `ANY_SCORING_DIMENSION_BLOCKED` and define scoring as
  `REQUIRED | BLOCKED`.
- `author:121-125` and `:563-567`: carry the same sentence and the same derivation wording, so the
  self-audit path cannot license what the judge schema rejects.

**Severity: Important, not Critical.** The state is rare, requiring an author to assert undetermined
applicability; the judge path rejects it; and the blast radius is a misleading self-audit record
rather than a false approval, because `§2.4:216-219` withholds approval unless `lesson_verdict` is
`PASS` **and** the human gate is `SATISFIED`, and only a trusted controller computes either.

## G4. Open human decisions — recorded, not counted as defects

Per the review instruction and rubric §7.4's own rule that an unavailable specialist is `BLOCKED`,
the following are ownership and scheduling items with honest fail-closed behavior, and are **not**
findings:

- **Novice / proxy-learner reviewer staffing and naming.** Fail-closed behavior verified honest in
  two places: `rubric §7.4:1152-1153` — "Where no such reviewer is available, the dimension is
  `BLOCKED`; it is not staffed by a domain expert" — and `evidence-protocol:389-393`, which makes
  the three independence fields literal-false attestations, states that true *or unknown* cannot
  satisfy X02, and explicitly scopes the rename to rubric §10 rather than resolving it. The binding
  constraint is stated and enforceable; only the label is undecided.
- `PREREQUISITE_SUPPORT` route disposition; `0.1-draft` fixture regeneration and the adjudicated-anchor
  schema; §7.4 role staffing including `RIGHTS_REVIEWER`; the evidence harness; the Kaplan rights
  disposition; and the calibration-to-enforcement transition. Each is enumerated in §10 with its
  consequence stated where it bites.

## G5. Final verdicts

### G5.1 Rubric foundation compliance — `COMPLIANT`

Unchanged from the re-review, and now with no supporting defect in the criterion-identifier scheme.
All six controlling decisions in `rubric-authority-resolutions.md` and all six required edits in
`rubric-consistency-audit.md` remain implemented. Precedence holds at the dimension, route, and
lesson levels, and is machine-enforced at the route level. The route-adequacy floor, the
evidence-bearing prerequisite rule, single root-cause ownership across six registered boundaries,
the accessibility thresholds, and the transfer-versus-mastery separation are all intact. Nonclaims
are disciplined; `:10-11` extends the version discipline honestly to `0.9.1` by recording that no
evaluation or gold promotion has run against it either.

GT-1 does not change this verdict. It is a place where the fail-closed doctrine the rubric states
everywhere else is not stated, not a contradiction of a locked decision, a controlling resolution,
or a nonclaim — and the behavior it omits is already implemented in the judge schema.

### G5.2 Future-agent usability — `READY_FOR_UNSUPERVISED_USE`

Both fixes recommended before a first agent run have landed, and both landed in the stronger form.
The criterion-identifier scheme no longer depends on bullet position, so cross-card references
survive editing — which matters because C02 now carries thirteen conditions and C05 seven, and both
cards will keep growing. The two missing receipt shapes exist with independence attestations that
are checkable fields rather than prose expectations, which is what makes `LQR-X02.FAIL` on the four
walkthrough questions and `LQR-C01`/`LQR-C04`'s two-solver comparisons actually reachable by an
agent assembling a bundle.

An authoring agent can work the loop end to end against stated observables; a judging agent emits a
single-route recommendation whose precedence, route agreement, dimension count, and PASS conditions
are schema-checked, and cannot emit a lesson aggregate or an approval at all; and calibration is
hard-gated by a trusted controller that does not exist, so no calibration claim can be manufactured.

GT-1 is advisory rather than blocking for this verdict: it is closed on the judge path, its unsafe
expression requires a rare author assertion, and it cannot produce a false approval. It is worth
closing before authoring runs at volume, because the one place it can surface — a self-audit
recording `PASS` on a route with a dimension of undetermined applicability — is exactly the kind of
record a human reviewer would reasonably trust.

The remaining distance to enforcement is implementation and staffing, both honestly enumerated: no
harness, no receipts collected, no staffed roles, no gold anchors, a stale fixture. Judged as what
it claims to be — a written standard, not software — this family is internally consistent and
applicable by an unsupervised agent.

## G6. Gate provenance and limits

- **Read-only.** Nothing canonical was modified; `git status --untracked-files=no` returns empty.
  This report is the sole write.
- **Verified in this pass.** All eight `criterion_ref` citations in the family extracted and resolved
  against the bullets they name; C05's and C02's `FAIL` bullets recounted in printed order; the two
  new receipt shapes read in full against the fields the dependent `FAIL` conditions require; all
  fourteen anchor exclusion checks scanned for the rejected phrasing; the anchor rollup's
  `pair_runnable` and verdict counts re-read; `§2.4`'s route/lesson split read in full and traced
  into the judge schema's `derivation` and `route_verdict` constraints and into the author
  protocol's self-audit rule; every regression row above re-resolved at its live location.
- **Not verified.** Nothing was rendered, executed, or inspected in a browser. No hash was computed,
  no anchor materialized, no schema executed against an instance. The judge-schema behaviors cited
  are read from the written schema, not from a validator run. The claim that no pair is runnable
  remains the catalog's own self-report.
- **Not represented.** No human reviewer role. This gate review does not satisfy, substitute for, or
  anticipate `PRODUCT_PEDAGOGY_OWNER` or any other role in §7.4, and it approves nothing. The
  decision to accept GT-1 as advisory, or to require it before first use, belongs to the product and
  pedagogy owner.
- **Scope.** Read set was the live rubric, anchors, four protocols, and worksheet, as directed, plus
  one line of `lesson-quality-run-status.md` to close prior finding NR-6.

---
---

# Closure note — 2026-08-03 (GT-1 verification)

**Status:** `AGENT_REVIEW_RECOMMENDATION` — not an approval and not a gate outcome. A qualified human
decides. **Mode:** read-only; no canonical file was edited (`git status --untracked-files=no` empty).
**Scope:** GT-1 only, in the live rubric (1411 lines), author protocol, and judge protocol, plus a
precedence regression spot-check. Nothing else was re-audited.

## Result

| Severity | Count |
| --- | --- |
| Critical | **0** |
| Important | **0** |
| Minor | **1** (CL-1, new: `derivation` reason code has no value for the applicability-blocked cause) |

**GT-1 is resolved.** All four required properties hold in all three documents.

## GT-1 — verified resolved

| Required property | Rubric | Author protocol | Judge protocol |
| --- | --- | --- | --- |
| Requires a named blocker | `§2.3:145-147` — "its named blocker is required" | `:126-128` — "requires a named blocker" | Schema `:1209` — `blocker_refs` `minItems: 1`; controller check `:1291-1292` |
| Normalizes to `evaluation_verdict: BLOCKED` | `§2.3:146` — "Its normalized `evaluation_verdict` is `BLOCKED`" | `:126-127` — "carries normalized `evaluation_verdict: BLOCKED`" | Schema `:1210` — `"evaluation_verdict": { "const": "BLOCKED" }` |
| Blocks the route recommendation | `§2.4:184` — "`BLOCKED` else if any dimension has applicability BLOCKED, or any REQUIRED dimension is BLOCKED" | `:566-569` — "a dimension with `applicability: BLOCKED` or a required dimension with `evaluation_verdict: BLOCKED` makes it `BLOCKED`" | `:68-71`; `:343-344` — "treat any `applicability: BLOCKED` result as route-blocking"; `:1287-1289` — recompute "from `REQUIRED` dimensions **plus any result whose applicability is `BLOCKED`**" |
| Only `NOT_REQUIRED_WITH_PROOF` is ignored | `§2.4:188-189` — "`NOT_REQUIRED_WITH_PROOF` dimensions are ignored by this recomputation. An applicability of `BLOCKED` is never ignored." | `:570` | `:74-75`; `:1289` — "ignore `NOT_REQUIRED_WITH_PROOF` by construction" |

The rubric also now states the semantics rather than only the mechanics: `§2.3:145-147` says an
applicability of `BLOCKED` "means the evaluator cannot yet determine whether the dimension is
required" and blocks "until applicability is resolved." That is the reasoning the prior gap was
missing, and it makes the rule derivable rather than memorized. The judge's controller check at
`:1290-1292` closes the loop from the other side by requiring positive confirmation that every
applicability-blocked result carries the normalized `BLOCKED` verdict and a named blocker.

## Precedence spot-check — no regression

`FAIL > BLOCKED > PASS` is intact, with `FAIL` still evaluated first, in all three documents and in
the schema:

- Rubric `§2.4:183-186` orders `FAIL` → `BLOCKED` → `PASS`, and `:189-190` restates "A demonstrated
  blocking defect is never hidden by missing evidence elsewhere: precedence remains
  `FAIL > BLOCKED > PASS`." Widening the `BLOCKED` clause did not disturb the `FAIL` clause, which
  still fires on any `REQUIRED` dimension at `FAIL`.
- Author `:83` and `:566-569`; judge `:68-71` and `:342`.
- Judge schema `:655-683` still pins each `derivation` value to its verdict by `if/then` —
  `ANY_REQUIRED_DIMENSION_FAIL` → `FAIL`, `ALL_REQUIRED_DIMENSIONS_PASS` → `PASS`, and the two
  blocked derivations → `BLOCKED`.

A dimension whose applicability is `BLOCKED` cannot mask a `FAIL`, because it normalizes to
`evaluation_verdict: BLOCKED` and the `FAIL` clause is evaluated before the `BLOCKED` clause.

## CL-1 (Minor, new) — no `derivation` value names the applicability-blocked cause

**Refs:** `author:552-553`, `:570-571`; `judge:646-652`, `:1288-1289`; `rubric §2.4:183-185`.

The route `BLOCKED` clause now has two distinct causes, but the `derivation` reason code was not
widened. The author enum is `ANY_REQUIRED_DIMENSION_FAIL | ANY_REQUIRED_DIMENSION_BLOCKED |
ALL_REQUIRED_DIMENSIONS_PASS`; the judge enum adds only `PRECONDITIONS_BLOCKED`. When the *sole*
cause is a dimension whose applicability is `BLOCKED`, both available labels misdescribe it:
`ANY_REQUIRED_DIMENSION_BLOCKED` asserts the dimension is `REQUIRED`, which is precisely what is
undetermined, and `PRECONDITIONS_BLOCKED` belongs to the §3.1 global-precondition path such as
`APPLICATION_IDENTITY_NULL`. Author `:571` nonetheless instructs the producer to "Record which rule
fired," and judge `:1288-1289` compares the recomputed verdict against `derivation`.

The verdict is unaffected and fail-closed, which is why this is Minor rather than a reopening of
GT-1. The cost is accuracy in one recorded field, and downstream in `origin` attribution and
§8.4's per-dimension reporting: an unresolved-applicability gap gets filed as a required-dimension
evidence gap, which points remediation at the wrong thing.

**Correction.** Add `ANY_DIMENSION_APPLICABILITY_BLOCKED` to both enums and pin it to `BLOCKED` in
the judge schema's `allOf` alongside the two existing blocked derivations, or rename
`ANY_REQUIRED_DIMENSION_BLOCKED` to `ANY_SCORING_DIMENSION_BLOCKED` and define the scoring set as
`REQUIRED | BLOCKED` where the term is introduced. The first is more informative; the second is a
smaller edit.

## Gate verdict

**Gate: PASS**, with one advisory Minor finding.

- **Rubric foundation compliance — `COMPLIANT`.** GT-1 was the last open item and is closed in all
  three documents, with the semantics stated and the behavior machine-pinned. No locked decision,
  controlling resolution, or nonclaim is contradicted.
- **Future-agent usability — `READY_FOR_UNSUPERVISED_USE`.** The dimension applicability namespace
  now has a defined consequence for each of its three values, and the author self-audit path can no
  longer license a route `PASS` that the judge schema would reject. CL-1 does not gate use: it
  affects a reason code, not a verdict, and cannot produce a false approval.

**Limits.** Read-only; nothing rendered, executed, hashed, or schema-validated against an instance —
schema behavior is read from the written schema. No human reviewer role is represented or
anticipated; this closure note approves nothing, and whether to accept CL-1 as advisory belongs to
`PRODUCT_PEDAGOGY_OWNER`. Only GT-1 and the precedence chain were examined in this pass; the broader
findings and verdicts stand as recorded in the gate section above.

---
---

# Closure — 2026-08-03 (CL-1 verification) · 0 Critical, 0 Important, 0 Minor · Gate: PASS

**CL-1 is closed.** `ANY_DIMENSION_APPLICABILITY_BLOCKED` is present in every site that carries the
reason code: the judge output schema's `derivation` enum (`judge:654`, now five values), the judge
schema's blocked-pinning `allOf` (`:681`, whose `then` is `route_verdict: BLOCKED` at `:688`), and the
author protocol's `route_recommendation` shape (`author:553`). No other site needs it — the rubric
states the §2.4 algorithm without reason codes (zero `derivation` occurrences), and neither the
worksheet nor the evidence protocol carries the field. The reservation is stated in prose in **both**
protocols rather than left to the schema: `judge:77-80` and `author:573-574` each direct the new value
to unresolved applicability, restrict `ANY_REQUIRED_DIMENSION_BLOCKED` to "a dimension already
established as required," and — in the judge, which owns the fourth value — reserve
`PRECONDITIONS_BLOCKED` for global preconditions. That is the three-way disambiguation CL-1 asked
for, and it removes the only reading under which an unresolved-applicability gap would be misfiled as
a required-dimension evidence gap. **Verdict precedence is unchanged.** The value was added solely to
the BLOCKED-pinning enum; the `FAIL` pin (`ANY_REQUIRED_DIMENSION_FAIL` → `FAIL`, `judge:661-667`)
and the `PASS` pin (`ALL_REQUIRED_DIMENSIONS_PASS` → `PASS`, `:668-673`) remain single-value `const`
conditions, untouched, and `author:567-572` still orders `FAIL` → `BLOCKED` → `PASS` under an explicit
`FAIL > BLOCKED > PASS` statement. Because the new code appears only where `route_verdict` is already
pinned to `BLOCKED`, it describes a verdict rather than deciding one, and cannot produce or suppress a
`FAIL` or a `PASS`. **Remaining findings: 0 Critical, 0 Important, 0 Minor. Gate: PASS** — rubric
foundation compliance `COMPLIANT`, future-agent usability `READY_FOR_UNSUPERVISED_USE`, with the
standing implementation and staffing items (harness, receipts, role staffing, gold anchors, fixture
regeneration, `PREREQUISITE_SUPPORT`, Kaplan rights, proxy-learner naming) recorded as honestly open
owner decisions under rubric §10 rather than defects. *Limits:* read-only, no canonical file edited
(`git status --untracked-files=no` empty); only the author and judge protocols were read in this pass
and only for CL-1; schema behavior is read from the written schema, not from a validator run; no human
reviewer role is represented, and this closure approves nothing.
