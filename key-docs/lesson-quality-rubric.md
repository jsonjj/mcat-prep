# Lesson Quality Rubric

**Status:** CANDIDATE STANDARD — DOCUMENTATION ONLY, NON-ENFORCING
**Rubric version:** `0.9.1`
**Owner decision:** candidate standard approved 2026-08-03 10:01 UTC-5; see
[`lesson-quality-human-decision-packet.md`](./lesson-quality-human-decision-packet.md)
**Owner calibration:** proposed pass/fail/boundary policy lines approved for all 12
dimensions on 2026-08-03; anchors remain provisional and non-gold
**Companion anchor catalog:** [`lesson-quality-rubric-anchors.md`](./lesson-quality-rubric-anchors.md), anchor-set version `0.9.1-candidate`
**Date:** 2026-08-03 · **Supersedes:** `0.9` (cross-document correction wave) · `0.4 planning draft`
**Controlling run decisions:** [`rubric-authority-resolutions.md`](./lesson-quality-sources/rubric-authority-resolutions.md)
**Correction basis:** the four independent reviews in [`lesson-quality-reviews/`](./lesson-quality-reviews/). No
evaluation was ever run against `0.9`, so nothing is relabelled by this version change.
No evaluation or gold promotion has run against `0.9.1`; the bounded corrections below repair
contract mechanics and references without changing a criterion boundary, so this candidate remains
`0.9.1` and is still identified by its exact hash.

---

## 1. Status, authority, and nonclaims

This rubric answers one question: **is this structurally valid lesson also good enough to teach
and to serve?** It is a written standard for humans and for a future evaluator. It is not
software. No evaluator service, judge runner, calibration harness, CI check, registration gate,
or approval workflow is implemented by this file. Any claim that this rubric is a live or
executable quality gate is wrong.

**Authority order.**

1. [`05-LESSON-STRUCTURAL-AUTHORING-SPEC.md`](../docs/design/05-LESSON-STRUCTURAL-AUTHORING-SPEC.md)
   and the R1–R15 validator decide whether a lesson is well formed. The validator, not its prose,
   is the source of truth.
2. [`lesson-evidence-mastery-contract.md`](../docs/lesson-evidence-mastery-contract.md) decides
   what an accepted response may mean for evidence and mastery.
3. This rubric evaluates authored instructional quality and the rendered learner experience,
   after 1 and 2.
4. Learner-outcome evaluation is a separate, later program, never inferred from a rubric result.

[`04-V3-LESSON-AUTHORING-QUALITY-AND-UI.md`](../docs/design/04-V3-LESSON-AUTHORING-QUALITY-AND-UI.md)
is a candidate design source, not an authority. Conflicts with items 1–3 are adjudicated, not
silently inherited; its own version line and changelog disagree, so cite it only with an exact
commit or subject hash.

**Nonclaims.** A `PASS` establishes no efficacy, learning, mastery calibration, BKT (Bayesian
Knowledge Tracing) eligibility, readiness, score improvement, rights clearance, production release,
or rollout safety. It approves nothing: a human decides.

### 1.1 Glossary of load-bearing abbreviations

Expanded here once so no document in this family depends on a reader already holding them.

| Term                 | Expansion and meaning in this rubric                                                                                                                                                                    |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| BKT                  | **Bayesian Knowledge Tracing** — the mastery-estimation model named by [`lesson-evidence-mastery-contract.md`](../docs/lesson-evidence-mastery-contract.md). This rubric never decides BKT eligibility. |
| `pL`                 | **Probability of the learned (mastered) state** for a knowledge component, exactly as the mastery contract defines it. No rubric verdict moves `pL`.                                                    |
| DOK                  | **Depth of Knowledge** — Webb's framework, the named referent for LQR-C06 (§6.1).                                                                                                                       |
| KC                   | **Knowledge component** — the curriculum-grain unit a lesson teaches, resolved from the curriculum manifest.                                                                                            |
| assistive technology | Written out in full everywhere in this family. **Do not abbreviate it to `AT`**; that token is ambiguous across domains and is not part of this vocabulary.                                             |
| WCAG                 | **Web Content Accessibility Guidelines**, version 2.2, Level AA unless stated otherwise.                                                                                                                |

---

## 2. Result model

### 2.1 Namespaces

"Blocked" names three unrelated things. Always qualify it.

| Namespace                      | Values                                                                                              | Owner                                    |
| ------------------------------ | --------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| `evaluation_verdict`           | `PASS` \| `FAIL` \| `BLOCKED`                                                                       | this rubric                              |
| `route_applicability`          | `APPLICABLE` \| `NOT_APPLICABLE` \| `BLOCKED`                                                       | the structural route-proof record (§3.2) |
| `runtime_terminal_disposition` | the honest end state the runtime reports for a branch — completed, paused, planner handoff, blocked | the runtime state machine                |

A blocked `runtime_terminal_disposition` is a product behavior, not a result: it can occur inside
a dimension that receives `evaluation_verdict: PASS` (LQR-X06). A blocked `route_applicability`
is a missing route decision, not a demonstrated defect.

### 2.2 The one result algorithm

For each applicable dimension, in order:

```text
1. FAIL    if revision-bound evidence demonstrates at least one blocking defect.
2. BLOCKED if no blocking defect is demonstrated and any required evidence is missing,
           stale, contradictory, unbound to the evaluated revision, self-approved, or
           awaiting a required EVIDENCE role (§7.4).
3. PASS    otherwise. A PASS may carry non-blocking findings.
```

Precedence is `FAIL > BLOCKED > PASS`: a demonstrated blocking defect is never hidden by missing
evidence elsewhere. There is no composite, average, or compensation between dimensions.

**Only an evidence role blocks a dimension.** §7.4 splits the seven canonical roles into
`evidence_roles`, whose receipts are inputs a judge reads, and `decision_roles`, which decide
_after_ the evaluation. A dimension is `BLOCKED` while a required **evidence** receipt is absent.
An outstanding **decision** role — `PRODUCT_PEDAGOGY_OWNER` acting as approver — never makes a
dimension `BLOCKED`; it withholds approval at the lesson level (§2.4). Without this split, §7.4's
always-required product/pedagogy owner would make `PASS` unreachable on every dimension forever,
which would make the rubric non-discriminating rather than honest.

`PASS` conditions are deliberately **not** restated on the cards. A dimension passes when no card
`FAIL` condition is demonstrated and its required evidence is complete. One algorithm, one place
to change it.

**Severity and workflow.** _Blocking_ (`CRITICAL`) means the defect can teach the wrong construct,
mismeasure learning, mislead the learner, fail an applicable route, or deny meaningful access.
_Non-blocking_ (`NONCRITICAL`) means localized, and unable to change construct, answer, route,
evidence meaning, or accessibility. No other severity word changes a verdict. `REVISE` is a
workflow disposition issued after a `FAIL`, not an `evaluation_verdict`. Lifecycle, review-progress,
and rights-use values are statuses, not verdicts.

### 2.3 `dimension_result` — one fixed contract

Every dimension definition and every recorded result uses exactly these ten fields:

```text
dimension_id
applicability
evaluation_verdict
blocking_findings[]
non_blocking_findings[]
evidence_refs[]
blocker_refs[]
required_remediation[]
required_human_roles[]
human_decision
```

**Ten fields means ten.** No document in this family may add a field to this object or call a
larger object a `dimension_result`. Analysis a producer must also record — the criteria it
assessed, its rationale, its uncertainty — travels beside the result in an envelope (§2.5), never
inside it.

`applicability` takes exactly one of:

```text
dimension_applicability: REQUIRED | NOT_REQUIRED_WITH_PROOF | BLOCKED
```

All twelve dimensions default to `REQUIRED`. `NOT_REQUIRED_WITH_PROOF` requires an authoritative
absence-proof reference in `evidence_refs[]`, on the same discipline §3.2 applies to routes:
reviewer opinion, an empty coverage row, and a runtime fallback are not absence proofs. `BLOCKED`
requires a named blocker in `blocker_refs[]`. There is no `N/A`, and free text is not a legal
value. A dimension is "required" for §2.4 exactly when its `applicability` is `REQUIRED`.
`NOT_REQUIRED_WITH_PROOF` is a **non-scoring** outcome: its normalized wire verdict is always
`PASS`, its blocking and blocker arrays are empty, and route/lesson recomputation ignores it. That
fixed value records successful proof of absence; it is not a claim that the dimension was scored.
An applicability of `BLOCKED` means the evaluator cannot yet determine whether the dimension is
required. Its normalized `evaluation_verdict` is `BLOCKED`, its named blocker is required, and it
blocks the route recommendation until applicability is resolved.

**Finding contract.** Every finding, in either array, carries:

```text
finding_id
origin: LESSON | RUBRIC | EVIDENCE
criterion_ref            (a stable criterion ID, §6.0)
description
evidence_refs[]          (at least one, resolved in the input manifest)
remediation
owner_role               (one of the seven canonical roles, §7.4)
root_cause_id            (stable ID shared by every record of one root defect)
owner_dimension_id       (the dimension §5 assigns that root cause to)
finding_disposition: PRIMARY | NON_COUNTING_CROSS_REFERENCE
```

`origin: NONE` marks the _absence_ of a finding and is never a value inside an emitted finding.
A suspected rubric defect is recorded as `origin: RUBRIC` and, when material, produces `BLOCKED`;
it is never resolved by failing the lesson.

**One root defect, one blocking owner (§5).** A `root_cause_id` has exactly one `PRIMARY` blocking
finding per evaluation, filed under its `owner_dimension_id`. Every other record of the same root
cause is a `NON_COUNTING_CROSS_REFERENCE`, must name the primary `finding_id`, and must sit in
`non_blocking_findings[]` — never in `blocking_findings[]`. A disputed grouping is surfaced for
human adjudication, not resolved by counting the defect twice.

This rubric does not define, name, or replace the structural `lesson-quality-report.json` wire
schema. The scored-report filename, schema, and hash treatment are open decisions (§10).

### 2.4 Route recommendation and trusted lesson aggregation

One judge invocation evaluates one exact route. Its model-generated recommendation is therefore
`route_verdict`, never `lesson_verdict`:

```text
FAIL     if any REQUIRED dimension on this route is FAIL.
BLOCKED  else if any dimension has applicability BLOCKED, or any REQUIRED dimension is BLOCKED.
PASS     otherwise.
```

`NOT_REQUIRED_WITH_PROOF` dimensions are ignored by this recomputation. An applicability of
`BLOCKED` is never ignored. A demonstrated blocking
defect is never hidden by missing evidence elsewhere: precedence remains `FAIL > BLOCKED > PASS`.
The model cannot emit a lesson aggregate, `human_gate_status`, `approval_withheld`, or
`approval_blockers`.

Only a trusted controller may create `lesson_rollup`, and only after the four-member route-proof
record exists and exactly one accepted, identity-matched route record exists for every route whose
`route_applicability` is `APPLICABLE`. Until then there is no `lesson_verdict`; the controller
records the missing route record or proof as a rollup blocker outside model output.

```text
lesson_rollup:                         (trusted controller-generated; never model-emitted)
  lesson_revision_id
  route_proofs                         (exactly the four canonical members)
  evaluations[]:
    route                              (one distinct APPLICABLE route)
    evaluation_id
    route_verdict
    dimensions[]                       (one full §2.5 envelope set)
  lesson_verdict
  human_gate_status:
    status: PENDING | SATISFIED | BLOCKED
    required_roles[]
    unmet_roles[]
  approval_withheld: true | false
  approval_blockers[]
```

The controller derives `lesson_verdict` with `FAIL > BLOCKED > PASS`: `FAIL` if any accepted route
record is `FAIL`; otherwise `BLOCKED` if any is `BLOCKED` or any route proof is `BLOCKED`; otherwise
`PASS`. `human_gate_status` is `SATISFIED` only when every required receipt exists, is
revision-bound, and is not self-approved. `approval_withheld` is true whenever `lesson_verdict` is
not `PASS`, `human_gate_status` is not `SATISFIED`, or a required human decision is still pending.
Whenever it is true, `approval_blockers[]` is nonempty and every entry names the condition and the
role or evidence that would resolve it; when it is false, that array is empty. No model-issued
field is proof that the controller performed these checks.

### 2.5 Recorded envelope for producer output

An author self-audit or judge output records each dimension as an envelope, not as a widened
result:

```text
dimensions[]:
  result:                    (exactly the ten fields of §2.3, unchanged)
  analysis:
    criteria_assessed[]      (stable criterion IDs actually checked)
    rationale                (why the deciding fact does or does not cross a criterion)
    uncertainty:
      material: true | false
      reason
      evidence_needed[]
```

`result` is the canonical record and the only thing a downstream consumer may treat as a
`dimension_result`. `analysis` is producer commentary: it is required, it is inspectable, and it
carries no verdict authority of its own. Material uncertainty recorded in `analysis` forces
`result.evaluation_verdict: BLOCKED` unless a blocking defect is already demonstrated.

---

## 3. Evaluation unit, routes, and gates

### 3.1 Unit and preconditions

The unit is **one exact lesson revision on one exact build, on one exact route**: lesson ID and
content hash, the dependent artifact hashes, the server-authoritative delivery behavior, the route
and its consequential branches, and the browser evidence captured from that build. A result for one
revision cannot approve another, and no decision carries forward automatically.

**One evaluation is one route.** `dimension_result` carries no route field, so a single result set
cannot honestly represent two routes with different declared learner profiles — which is exactly
what §4's route-relative adequacy forbids. The evaluation identity's `route` is therefore non-null
and names one of the four canonical routes.

The controller's immutable evaluation envelope distinguishes runtime implementation from build
deployment:

```text
evaluation_identity:
  lesson_revision_id
  artifact_hashes
  app_git_commit
  build_id
  route: STANDARD | CONCISE | MISCONCEPTION | PREREQUISITE_SUPPORT
  runtime_kind: vector | normalized
  build_environment: PRODUCTION_BUILD | STAGING_BUILD | LOCAL_BUILD | PROTOTYPE
  evidence_bundle_sha256
  input_manifest_sha256
```

`runtime_kind` says which runtime contract produced the route; `build_environment` says where that
build was deployed. They are separate, required fields in the envelope and in every receipt. The
controller compares both byte-for-byte with manifested evidence. A trusted `lesson_rollup` then
holds exactly one accepted result set per `APPLICABLE` route (§2.4), and §7.2's per-route branch
minimums attach to that route's evaluation. A route with `NOT_APPLICABLE` or `BLOCKED`
applicability contributes a route proof and no evaluation.

Evaluation begins only after R1–R15 structural validation passes; the lesson and every required KC
resolve against the curriculum catalog; protected answers, scoring material, and pre-release
rationales are server-only; the applicable route can start, resume, and terminate while preserving
its revision; and the evidence the judged dimension requires exists. A failed precondition is not
a low score — it produces `BLOCKED`, and a failed global precondition blocks all twelve dimensions.
A null application commit or build ID creates `APPLICATION_IDENTITY_NULL`; protected keys, scoring
rules, or private rationale found outside their authorized boundary create
`PROTECTED_CONTENT_EXPOSURE`. Either is a run-voiding global precondition failure.

### 3.2 Route universe and applicability authority

The rubric route universe is exactly `STANDARD`, `CONCISE`, `MISCONCEPTION`, and
`PREREQUISITE_SUPPORT`.

The **structural route-proof record is the sole applicability authority**. It is an **object with
exactly those four named members** — never a list, which cannot express "one proof per route" and
admits four proofs for the same route:

```text
route_proofs:
  STANDARD:              route_proof
  CONCISE:               route_proof
  MISCONCEPTION:         route_proof
  PREREQUISITE_SUPPORT:  route_proof

route_proof:
  route_applicability: APPLICABLE | NOT_APPLICABLE | BLOCKED
  absence_proof_ref     (non-null and resolved iff NOT_APPLICABLE)
  blocker_ref           (non-null and resolved iff BLOCKED)
  evidence_refs[]       (non-empty in every state)
```

State-specific proof requirements:

- `APPLICABLE` — evaluated under every relevant dimension, and carries at least one evidence
  reference that resolves in the manifested structural record.
- `NOT_APPLICABLE` — requires an explicit, authoritative absence proof **and** its evidence
  reference. Reviewer opinion, an empty coverage row, and a runtime fallback are not absence
  proofs.
- `BLOCKED` — requires a named blocker **and** its evidence reference, and blocks lesson-level
  approval while the route is required.
- A missing member, an unresolved reference, or an empty `evidence_refs[]` blocks lesson-level
  approval exactly as a missing route proof does.

The current three-lane structural check (`concise`, `standard`, `misconception`) is a baseline
structural check only. It is not proof that `PREREQUISITE_SUPPORT` is absent, complete, or
acceptable, and a runtime that downgrades `PREREQUISITE_SUPPORT` to `STANDARD` has not covered
that route.

### 3.3 Two gates

The **Authored Content Gate** (LQR-C01–C06) judges what was authored. The **Rendered Experience
Gate** (LQR-X01–X06) judges what the learner receives in a browser on the exact build. A good
presentation plan cannot compensate for a renderer that ignores it, and a polished renderer cannot
compensate for weak instruction. Rendered dimensions are never inferred from a presentation plan.

---

## 4. Locked decisions

- **Route-relative adequacy, with a floor.** `STANDARD` must teach a learner who has the declared
  prerequisites but not the target KC. Every other route is judged against its own declared learner
  profile, never against `STANDARD`. **The floor:** every applicable route must teach every
  consequential demand its own profile does not already supply. Profile declaration reassigns
  _where_ a demand is taught; it never removes a demand from the inventory. A declared profile is
  also not self-certifying — a named route-selection authority must be able to produce the learner
  state the profile describes (LQR-C02).
- **A declared prerequisite is an evidence-bearing claim, not an author assertion.** It resolves to
  a named curriculum relation whose teaching sits before this lesson's sequence position, it is
  bounded by the KC's declared non-goals, and the route either checks it or hands off honestly.
  Declaring a prerequisite is not a way to discharge a teaching obligation by text edit (LQR-C02).
- **Low-stakes discovery is allowed** under the four-part exception in LQR-C02. It can never move
  mastery, select a route, or satisfy an exit.
- **Critical defects block; minor findings do not.** A `PASS` may carry non-blocking findings, each
  with evidence, an owner, and a remediation.
- **No score averaging.** Dimensions pass or fail independently.
- **Human final authority.** A judge recommends; a qualified human decides and records the reason.
  Model confidence never substitutes for a qualified reviewer.
- **Instructional transfer is independent of mastery eligibility.** LQR-C01 judges construct
  preservation and substantive situation change. It never infers BKT (Bayesian Knowledge Tracing)
  or evidence eligibility from a `CHANGED_EXIT` label, transfer claim, reasoning operation,
  activity role, or assistance affordance. Only the mastery contract decides whether a response can
  move `pL`, the probability-of-learned state it defines. Volatile "N of M bindings" counts and
  current runtime capabilities are implementation status, not durable criteria, and are not
  restated here.
- **Accessibility is blocking.** Applicable WCAG 2.2 Level AA criteria and construct-equivalent
  alternatives are approval requirements. The 48 CSS px product touch target is a preferred product
  standard with an explicit non-blocking boundary (LQR-X05).
- **Evidence covers every consequential branch** (§7.2); one representative happy path is not
  branch evidence. Automation supplies the repeatable matrix and an independent real-browser
  assistive-technology review supplies what automation cannot establish (§7.3).
- **Missing evidence fails closed.** Absent, stale, contradictory, self-approved, or unhashable
  evidence produces `BLOCKED`.

---

## 5. Ownership and non-counting cross-references

All twelve dimensions are retained, and each root cause is owned **once**. A dependent dimension
may record a _non-counting cross-reference_ describing downstream impact, but must not raise a
second blocking finding for the same root defect.

| Owner   | Owns                                                                                                                                                                                                                                    |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| LQR-C01 | changed-task construct identity and substantive situation change                                                                                                                                                                        |
| LQR-C02 | route-relative teaching of every consequential demand, and the instructional completeness of the authored route — orientation and stated purpose, expert selection modelling, fading of assistance, boundary and non-example, and recap |
| LQR-C03 | keys, accepted-answer sets, distractors, authored observable-error mappings                                                                                                                                                             |
| LQR-C04 | prompts, directions, supplied information, ability to express a valid response                                                                                                                                                          |
| LQR-C05 | the authored repair graph and fresh re-entry design                                                                                                                                                                                     |
| LQR-C06 | declared depth targets, item-level depth judgments, and their rationale                                                                                                                                                                 |
| LQR-X01 | semantic authored-to-rendered fidelity                                                                                                                                                                                                  |
| LQR-X02 | cognitive focus, pacing, hierarchy, competing chrome                                                                                                                                                                                    |
| LQR-X03 | delivered post-commitment feedback, support presentation, focus and announcement                                                                                                                                                        |
| LQR-X04 | representation and interaction warrant, and response-mode fitness                                                                                                                                                                       |
| LQR-X05 | accessibility semantics and construct equivalence                                                                                                                                                                                       |
| LQR-X06 | state persistence, recovery, termination, responsive completion                                                                                                                                                                         |

The six boundaries that previously double-counted:

- **C01 / C02** — C02 owns whether any consequential demand is untaught on the route, **including a
  demand that first appears on the changed task**. C01 owns only whether the changed task's
  decision point differs from the near task's, given the teaching that exists. An untaught relation
  required by a changed exit is one root cause with `owner_dimension_id: LQR-C02`; C01 records it,
  if at all, as a `NON_COUNTING_CROSS_REFERENCE`.
- **C02 / X01** — C02 owns whether the _authored_ route teaches every consequential demand; X01
  owns whether that authored teaching reaches the learner. A C02 `PASS` recorded alongside an X01
  teaching-omission finding must carry the cross-reference, because the two together mean "the
  artifact contains teaching that the learner never receives."
- **C03 / C04** — C03 owns the option set, keys, and error mappings; C04 owns the prompt,
  directions, and whether a valid response can be expressed. A defensible distractor is C03; an
  unstated entry convention is C04.
- **C05 / X03** — C05 owns the authored repair graph and whether a fresh re-entry of the exact
  failed function exists and is reachable; X03 owns the feedback and support actually delivered,
  and its focus behavior.
- **X01 / X02** — X01 owns whether authored meaning reached the screen; X02 owns what competes for
  attention on the screen that did render. Omitted teaching is X01; buried or crowded teaching is
  X02.
- **X05 / X06** — X05 owns whether an access method exists and preserves the construct; X06 owns
  whether the screen and its state survive required widths, zoom, interruption, and recovery. A
  control unreachable by keyboard is X05; a control clipped at 320 px is X06.

---

## 6. Dimension cards

Every card uses the same six subheadings in the same order: **Purpose and owner**, **Required
evidence**, **FAIL (blocking)**, **BLOCKED**, **Non-blocking / still-pass boundary**, and
**Remediation and human roles**.

Each `FAIL` condition names an observable — a trace, inventory, measurement, counted feature,
recorded reviewer answer, or named receipt. A judgment that cannot cite one is `BLOCKED`, not
`FAIL`. "Clear," "trustworthy," "polished," "engaging," and "appropriate" carry no decision weight
anywhere in this rubric.

### 6.0 Criterion identifiers

`criterion_ref` is a stable ID, never free text, so a finding can be counted, compared across runs,
and traced when wording changes. The form is:

```text
<dimension_id>.<subheading>.<criterion_key>

subheading: FAIL | BLOCKED | NB     (NB = non-blocking / still-pass boundary)
criterion_key:
  - a printed stable semantic name such as DEAD_REPAIR; or
  - the 1-based position of an unnamed bullet within that subheading
```

A printed semantic key is canonical and does not change when a neighboring bullet is inserted;
cross-card references use it whenever one exists. An unnamed ordinal remains bound to this rubric
version and hash: reordering or inserting a bullet creates a new rubric version, and prior records
keep their original rubric identity rather than being renumbered (see the worksheet's
wording-change record). Never invent a semantic key that is not printed on its bullet.

### 6.1 Authored Content Gate

#### LQR-C01 — Transfer validity

**Purpose and owner.** Owns whether a changed task preserves the governed KC and reasoning
construct while changing the situation substantively. Not prompt wording (C04), the option set
(C03), whether the route taught what the changed task demands (C02), or any mastery claim (mastery
contract).

**Decision point — the predicate this card turns on.** A **decision point** is a step in the
keyless solution trace at which the solver must select among two or more operations,
representations, or orientations that the taught model licenses, and at which carrying the near
task's selection forward yields a wrong or unreachable answer. It is located, not asserted: the
changed-task worksheet names the decision point and cites the corresponding step in **both** traces
by step index. Two reviewers holding the same pair of traces must be able to point at the same
step, or the judgment is `BLOCKED` rather than `FAIL`.

**Required evidence.** Target KC competency and success condition; the taught model on the route;
near-use item; changed-task item; **the near and changed keyless solution traces, step-aligned,
with the named decision point and its step index in each**; declared changed dimension and
reasoning operation; semantic-family lineage and exposure ledger; protected key and scoring
authority; two independent keyless blind solves; an SME construct comparison.

**FAIL (blocking).**

- The changed task's solution trace is reproducible from the near task by substituting names,
  numerals, symbols, units, or clause order only — no decision point changes at any step-aligned
  position.
- Its governed KC or success condition differs from the declared one.
- An item in the changed family was previously exposed with its answer or answer-bearing feedback.
- A keyless blind solver reaches a defensible answer other than the key, or records that
  administration or wording cues the key.

_Untaught relations are C02, not C01._ A changed task that requires a relation neither taught on
the route nor bound to a declared prerequisite is one root cause owned by LQR-C02
(`LQR-C02.FAIL.UNTAUGHT_CONSEQUENTIAL_DEMAND`). C01 may record it only as a
`NON_COUNTING_CROSS_REFERENCE` naming that primary finding; it never raises a second blocking
finding for it.

**BLOCKED.** The taught model, near/changed pair, step-aligned traces, family-exposure ledger,
protected key, or a required blind-solve or SME receipt cannot be tied to the exact revision; or
the traces exist but no reviewer can locate the claimed decision point in both of them.

**Non-blocking / still-pass boundary.** Changing surface features _in addition to_ a decision point
is fine — one changed decision point is the test, not the absence of cosmetic change. A `PASS`
asserts instructional transfer only, and makes no claim of BKT eligibility or evidence-mode
licensing.

**Remediation and human roles.** Change a decision point, or re-scope the declared construct and
re-derive the pair. `PRODUCT_PEDAGOGY_OWNER`, `DOMAIN_CONSTRUCT_SME`, `INDEPENDENT_BLIND_SOLVER` ×2.

#### LQR-C02 — Instructional adequacy and completeness

**Purpose and owner.** Owns whether each applicable route teaches every relation, convention, and
operation that route later requires, **and whether the authored route is a complete teaching cycle
rather than a coverage list**: it states its purpose, models expert selection where selection is
the skill, withdraws assistance, shows where the procedure does not apply, and closes with a recap
that does not hand the learner an unearned answer. Not whether authored teaching reaches the screen
(X01) or how it is paced there (X02).

R8 mandates fifteen instructional node kinds. Five of them — `ORIENTATION`, `EXPERT_THINK_ALOUD`,
`LIGHT_SUPPORT_PRACTICE`, `CONTRAST_BOUNDARY`, and `RECAP` — carry instructional functions that no
other dimension inspects, so they are judged here. This card asks whether those functions are
_performed_, not whether a node of that kind exists; node presence is the validator's question.

**Required evidence.** KC objective, scope, non-goals; the **learner-facing objective or success
statement** and the prior-knowledge bridge node, with the declared prerequisite relation ID it
activates; **each declared prerequisite bound to its curriculum relation ID from the frozen task
packet `hard_prerequisites[]`, with the sequence position that places its teaching before this
lesson**; the declared learner profile per applicable route, **the named route-selection authority,
and the observable learner state that selects each `APPLICABLE` route**; the authored teaching
sequence; a **demand inventory** of every relation, convention, and operation any consequential
task requires; an **item-to-instruction trace** binding each demand to a prior teaching node on the
same route; **a per-item assistance-affordance inventory across `GUIDED_PRACTICE` →
`LIGHT_SUPPORT_PRACTICE` → `SOLO_PRACTICE` → exits**; the KC's declared reasoning operation and
`kc_non_goals[]`; the delivered order or a deterministic run trace.

**FAIL (blocking).**

- **Untaught consequential demand (`LQR-C02.FAIL.UNTAUGHT_CONSEQUENTIAL_DEMAND`).** The demand
  inventory contains a consequential demand with no prior teaching node on the same route and no
  declared prerequisite bound to a curriculum relation.
- A consequential demand is discharged by a declared prerequisite that resolves to no curriculum
  relation for this lesson, is absent from the frozen task packet's `hard_prerequisites[]`, or is
  taught only at or after this lesson's sequence position.
- Explanation narrates the answer for the worked case with no reusable procedure — no stated cue,
  operation, and validity check that generalizes past that case.
- Every guided step's only learner action is advancing; no step requires a consequential response.
- Support is withdrawn before any supported attempt at the target operation exists on the route.
- **Fading.** Assistance available at the route's final consequential exit is not strictly less
  than at its first supported practice — the same hint, worked reference, or cue panel remains
  available at the exit, as shown by the assistance-affordance inventory.
- **Orientation and intent.** The route states no learner-facing purpose for the KC before the
  first consequential demand: neither what the learner will be able to do, nor an explicit bridge
  from at least one declared prerequisite to the target relation.
- **Expert modelling.** Where the KC's declared reasoning operation is a selection or strategy
  operation, no node makes selection reasoning visible: the route shows how to execute the
  operation but never when to choose it over a competing operation the KC's scope admits.
- **Boundary and non-example.** The route teaches a procedure whose declared scope carries a stated
  non-goal or contrast boundary in `kc_non_goals[]`, and no node presents a case where the
  procedure does not apply.
- **Recap.** A recap supplies the answer to a consequential item the learner has not attempted.
- An applicable alternate route omits teaching its own declared profile requires.
- An applicable route's declared learner profile presumes the target KC that route claims to teach,
  or no observable state the named route-selection authority can produce maps to that profile.
- An applicable `MISCONCEPTION` route targets a misconception that appears in no authored
  observable-error mapping for a consequential item, or that no distractor or accepted
  wrong-response pattern can trigger.

**BLOCKED.** Route profile, route-selection authority, prerequisite relation binding, demand
inventory, item-to-instruction trace, assistance-affordance inventory, or delivered order cannot be
established for the revision. Also `BLOCKED` — not `FAIL` — when the route declares a hard
prerequisite and neither checks it before the first consequential demand nor routes a learner who
fails that check to an applicable support route or an honest handoff: `PREREQUISITE_SUPPORT` has no
authoritative absence proof today (§10 open decision 4), so the honest state of that gap is a
missing route decision rather than a demonstrated authoring defect.

**Non-blocking / still-pass boundary.** _Low-stakes discovery exception:_ a pre-instruction prompt
may precede teaching and still pass when **all four** hold — declared and delivered as low stakes;
an honest abstention path exists **and selecting it is recorded as an abstention rather than as an
incorrect response**; it cannot select a route, satisfy an exit, or move mastery; and the full
teaching for the probed relation follows on the same route. Remove any one and it becomes a
consequential untaught demand (`FAIL`). A recap that restates the model without requiring retrieval
is a non-blocking finding, not a defect. Repetition across routes, extra worked examples, and route
length are not defects.

**Claim limit.** A C02 `PASS` asserts that the _authored_ route teaches every consequential demand
and performs the five instructional functions above. **It makes no claim that the teaching is
delivered.** Delivery fidelity is X01, and a C02 `PASS` recorded alongside an X01 teaching-omission
finding must carry that cross-reference (§5). Read without it, "C02 Instructional adequacy: `PASS`"
can be mistaken for "the lesson teaches" on a lesson whose learner receives no instruction.

**Remediation and human roles.** Teach the relation before the demand, remove the demand, or bind
it to a proven route prerequisite; state the objective and the bridge; model the selection; reduce
assistance across the route; add the non-applying case; make the recap require retrieval.
`PRODUCT_PEDAGOGY_OWNER`, `DOMAIN_CONSTRUCT_SME`.

#### LQR-C03 — Distractor and error-model quality

**Purpose and owner.** Owns keys, accepted-answer sets, distractors, and authored observable-error
mappings. Not prompt language (C04) or delivered feedback text (X03).

**Required evidence.** Prompt and response format; the complete accepted-answer set or scoring
rubric; every incorrect option or anticipated wrong-response pattern with its observable-feature or
first-invalid-step rationale; an option-presentation inventory covering length, grammar, position,
and formatting across the item set; SME equivalence review.

**FAIL (blocking).**

- An incorrect option or rejected response is defensible under the prompt, or a form the scoring
  authority accepts is routed as an error.
- Two options are duplicates, or one entails another.
- The key is identifiable from presentation alone, measured against the option-presentation
  inventory: it is the only grammatically consistent option; **its length exceeds the median
  incorrect-option length by more than one standard deviation of incorrect-option length across the
  item set**; or a fixed correct-option position across the item set lets a position heuristic pass
  the consequential exits.
- A consequential item's incorrect option has no observable-feature or first-invalid-step rationale.
- An authored mapping asserts a stable learner trait or settled misconception from a single
  response.

_Unreachable repair is C05, not C03._ An authored repair function that no option or accepted
wrong-response pattern can trigger is a repair-graph defect owned by LQR-C05
(`LQR-C05.FAIL.DEAD_REPAIR`). C03 owns the converse — an incorrect option with no rationale, and wrong
choices that fall through to a generic fallback — and records the unreachable-repair side only as a
`NON_COUNTING_CROSS_REFERENCE`.

**BLOCKED.** The key, accepted-answer set, error map, option-presentation inventory, or protected
scoring authority is unavailable to the authorized reviewer, or SME equivalence review is missing
where an alternate form is plausible.

**Non-blocking / still-pass boundary.** An option plausible only to a learner who has not met the
route's declared prerequisite is a valid distractor. Reviewer-side wording hedged to the observation
— "is consistent with adding unsigned magnitudes" — is the required form; categorical trait language
is the blocking version of the same mapping.

**Remediation and human roles.** Reclassify the accepted form, replace or de-duplicate the option,
balance presentation or shuffle at delivery, supply the missing rationale.
`PRODUCT_PEDAGOGY_OWNER`, `DOMAIN_CONSTRUCT_SME`.

#### LQR-C04 — Prompt clarity

**Purpose and owner.** Owns prompts, directions, supplied information, and whether the learner can
express a valid response. Not option defensibility (C03) or whether the rendered control matches the
operation (X04).

**Required evidence.** The exact learner-safe prompt and directions; response format and any
required entry convention; the representation or data supplied; the reviewer-side accepted-answer
set; the accessibility-equivalent wording; two independent keyless blind solves.

**FAIL (blocking).**

- Two independent keyless solvers answer different defensible questions, or one produces a
  defensible answer the scorer rejects.
- A fact, unit, label, convention, or reference frame the task requires is neither supplied nor a
  declared prerequisite.
- Scoring depends on an entry convention — notation, symbol, spacing, rounding, significant figures
  — the prompt and directions never state, and equivalent correct forms are rejected.
- The response format cannot express a valid answer to the prompt.
- Reading demand not attributable to the target construct determines success, such as an operation
  recoverable only from nested negation the KC does not teach.

**BLOCKED.** The exact learner projection, the reviewer-side scoring interpretation, or the required
blind solves are unavailable.

**Non-blocking / still-pass boundary.** A localized typo, awkward sentence, or redundant clause that
cannot change the operation, the set of defensible answers, or the accessible equivalent. An honest
"not sure" abstention option is not a clarity defect.

**Remediation and human roles.** State the convention, supply the missing fact, widen the accepted
set, or change the response control. `PRODUCT_PEDAGOGY_OWNER`, `DOMAIN_CONSTRUCT_SME`,
`INDEPENDENT_BLIND_SOLVER` ×2.

#### LQR-C05 — Repair quality

**Purpose and owner.** Owns the authored repair graph and fresh re-entry design: trigger, repair
content, assistance bound, fresh re-entry, termination. Not how repair is presented or announced
(X03), or whether the runtime branch is state-safe (X06).

**Required evidence.** The failed function and its observable response feature; the repair trigger
binding; repair content and assistance level; **the diff between repair content and the route's
original teaching for the same function**; **the feature-to-repair mapping in both directions —
every triggering feature to its repair, and every authored repair function back to at least one
incorrect option or anticipated wrong-response pattern**; the fresh re-entry item and its family
exposure ledger; the configured attempt bound; the exit-credit ledger before and after repair; a
delivered miss → repair → re-entry → termination trace.

**FAIL (blocking).**

- The miss path serves repair but administers no fresh re-entry of the exact failed function —
  including when an authored re-entry exists but is unreachable, unbound, or unrecognized as a
  re-entry by delivery.
- Repair targets a different function or misconception than the observed response feature.
- Repair content reveals the fresh re-entry's answer, or the re-entry reuses an exposed family item.
- Repair completion alone closes the exit: process evidence credited as exit success.
- The branch has no bound — it can repeat without limit, strand the learner, or advance past the
  failed function with no re-check.
- **Repair content.** The repair content for the observed feature supplies no reusable cue,
  operation, or validity check for the failed function — it only restates the key, the correct
  answer, or the route's original explanation verbatim, as shown by the content diff. A repair that
  administers a correctly bound fresh re-entry but teaches nothing between the miss and the
  re-entry is not a repair.
- **Dead repair (`LQR-C05.FAIL.DEAD_REPAIR`).** An authored repair function or misconception route
  has no incorrect option and no anticipated wrong-response pattern whose observable feature
  triggers it, as shown by the reverse direction of the feature-to-repair mapping.

**BLOCKED.** The complete miss → repair → re-entry → termination path, the repair-content diff, or
the feature-to-repair mapping cannot be executed or inspected for the exact revision. An
uncoverable repair branch whose _cause is a missing capture_ is `BLOCKED` with `origin: EVIDENCE`;
an uncoverable branch whose cause is that nothing can trigger it is the dead-repair `FAIL` above,
with `origin: LESSON`. Do not record the second as the first.

**Non-blocking / still-pass boundary.** No fixed attempt quota applies. A one- or two-attempt bound
passes when success re-checks the exact function and exhaustion returns control honestly. Generous
scaffolding passes while the fresh re-entry stays unrevealed and independently answerable.

**Remediation and human roles.** Bind the authored re-entry so delivery recognizes it, retarget
repair to the observed feature, or add a bound and an honest handoff. `PRODUCT_PEDAGOGY_OWNER`,
`DOMAIN_CONSTRUCT_SME`.

#### LQR-C06 — DOK appropriateness and distribution

**Purpose and owner.** Owns declared depth targets, item-level depth judgments, and their rationale.
Not difficulty, item count, or assistance level, none of which imply depth.

**Named framework.** DOK is **Webb's Depth of Knowledge**. This rubric adopts that published
four-level framework rather than inventing a scale, and reads each level against the item's own
keyless solution trace:

| Level | Name                    | Trace observable that supports the declaration                                                                                                                   |
| ----- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DOK 1 | Recall and reproduction | The trace closes in one recalled fact or one directly prescribed substitution or computation.                                                                    |
| DOK 2 | Skill and concept       | The trace requires selecting among taught procedures, or two or more dependent steps whose order the learner must decide.                                        |
| DOK 3 | Strategic thinking      | The trace requires reasoning under a non-routine condition — justifying a choice, resolving conflicting cues, or planning a path the route did not prescribe.    |
| DOK 4 | Extended thinking       | The trace spans multiple sources or sessions and requires synthesis beyond a single item. Not expected inside one lesson item; declaring it needs SME rationale. |

The level is the _reasoning operation the trace demands_, never the reading load, arithmetic
burden, or number of steps. A genuine adjacent-level boundary is adjudicated by
`DOMAIN_CONSTRUCT_SME` against the recorded deciding feature; this rubric does not resolve it by
fiat.

**Required evidence.** KC competency and governing reasoning operation; curriculum phase and route
purpose; the author-declared depth target with rationale, stated as a Webb DOK level; an item-level
depth worksheet covering every consequential task; keyless solution traces for the deepest claimed
items; SME rationale review.

**FAIL (blocking).**

- A declared depth is contradicted by the item's own solution trace — a task closed by one recalled
  substitution declared as strategic reasoning.
- The route's deepest consequential task sits below the operation the declared objective names.
- Claimed depth comes from an untaught prerequisite, added reading, or added arithmetic rather than
  from the reasoning operation.
- Every consequential task repeats one operation while the success condition names a broader set.

**BLOCKED.** No declared target, item-level judgment, or rationale can be tied to the KC, phase, and
exact revision; or the SME review needed to settle a genuine adjacent-level boundary is missing.

**Non-blocking / still-pass boundary.** No fixed distribution or quota. A low-depth scaffold passes
when the worksheet shows it feeding a deeper consequential task. Reasonable disagreement between two
adjacent levels is not a defect when the deciding feature is recorded; it is `BLOCKED` only when no
defensible judgment exists at all.

**Remediation and human roles.** Author the item-level worksheet, correct the inflated declaration,
or deepen the final consequential task. `PRODUCT_PEDAGOGY_OWNER`, `DOMAIN_CONSTRUCT_SME`.

### 6.2 Rendered Experience Gate

These dimensions judge the delivered browser experience on the exact build, never a presentation
plan. Every applicable route and consequential branch is evaluated.

#### LQR-X01 — Presentation-to-UI fidelity

**Purpose and owner.** Owns semantic authored-to-rendered fidelity: whether authored instructional
meaning reaches the learner. Not on-screen competition (X02), response-mode fitness (X04), or
accessible semantics (X05).

**Required evidence.** The exact lesson script and presentation plan; the node/item-to-screen map;
server run-view payloads; DOM or accessibility-tree captures; captures of every applicable branch; a
protected-boundary scan; source and build identity.

**FAIL (blocking).**

- An authored teaching, direction, representation, support, or rationale element required on the
  route is absent from both the delivered payload and the DOM.
- A placeholder, internal ID, unresolved reference token, or implementation string reaches the
  learner.
- The renderer introduces consequential teaching, scoring, or sequencing that was not authored, or
  reorders content with instructional consequence.
- Protected keys, rationales, or reviewer-only controls appear in the learner client.
- The rendered screen changes the learner operation the authored item states.

**BLOCKED.** The artifact-to-screen map, a rendered branch, or revision and build identity cannot be
inspected. Also `BLOCKED` when delivered content is generated from a second, independently
maintained source with no parity receipt binding it to the evaluated artifacts — a matching hash on
one source does not prove fidelity of the other.

**Non-blocking / still-pass boundary.** Layout, chunking, grouping, and wording that preserve the
operation, the information available, the instructional consequence of the sequence, and access. A
stage-label drift that keeps operation and information intact is a non-blocking fidelity finding.

**Remediation and human roles.** Resolve the authored reference in the delivery path, remove the
leaked token, or bind the parallel source with a parity receipt. `PRODUCT_PEDAGOGY_OWNER`; add
`DOMAIN_CONSTRUCT_SME` when the omitted or added element carries domain content.

#### LQR-X02 — Cognitive focus, pacing, and visual clarity

**Purpose and owner.** Owns cognitive focus, pacing, hierarchy, and competing chrome on the screen
that did render. Not missing content (X01), accessible semantics (X05), or clipping at required
widths (X06).

**Required evidence.** The full screen sequence with a declared primary job per screen; an action
and landmark inventory per screen; full-viewport captures at desktop, 375 px, and 320 px; scroll
measurements; the focus destination for each transition; a **novice walkthrough** recording the
reviewer's answers to four fixed questions per consequential screen — _What is this screen asking
me to do? What changed after my last action? What happens next? What will I be able to do that I
couldn't before?_; timing observations when available.

**FAIL (blocking).**

- A screen presents more than one control with primary-action treatment for different jobs, as shown
  by computed style and the action inventory.
- Required teaching is reachable only behind a disclosure control, off-screen with no scroll cue, or
  removed at a required width.
- The novice walkthrough cannot answer any one of the four fixed questions for a consequential
  screen.
- Global or lesson-external navigation and chrome remain visually competing and operable during a
  scored screen.
- A screen carries no learner-consequential content: its only action advances and its content
  duplicates the previous screen.

**BLOCKED.** A complete route capture at the required widths, the action and landmark inventory, or
the novice walkthrough is unavailable.

**Non-blocking / still-pass boundary.** No screen count, click count, or duration proves quality.
Aesthetic preference, brand-token choices, and density preferences are non-blocking; authentic domain
reading load is not overload. One primary action plus clearly secondary utilities — pause and return,
skip — passes. The fourth walkthrough question — _What will I be able to do that I couldn't
before?_ — may be answered once per KC rather than once per screen; only an unanswerable-per-KC
result is blocking. C02 owns whether the route _states_ that purpose at all; X02 owns whether a
novice can read it off the delivered screens.

**Remediation and human roles.** Suppress competing chrome for the lesson route, restore one primary
action, surface required teaching, or merge duplicate advance-only screens. `PRODUCT_PEDAGOGY_OWNER`,
`NOVICE_WALKTHROUGH_REVIEWER`; add `ACCESSIBILITY_REVIEWER` when the finding concerns focus or
reflow.

#### LQR-X03 — Feedback and scaffolding quality

**Purpose and owner.** Owns delivered post-commitment feedback, support presentation, and focus and
announcement behavior. Not the authored error map (C03) or the authored repair graph (C05).

**Required evidence.** The rendered feedback payload and DOM for every response outcome — correct,
each mapped incorrect feature, omitted, invalid, help or reveal, repair, re-entry; focus destination
and status-announcement capture for each; support and assistance transitions; the reviewer-side
protected rationale for comparison; repeated-failure and handoff traces.

**FAIL (blocking).**

- Correctness or answer-bearing content is presented before commitment.
- Delivered feedback on a consequential item carries only an outcome token — "Correct," "Not quite" —
  with no reference to the reasoning, the cue, or the observable divergence, while an authored
  rationale exists or is required.
- Delivered feedback names a different function or misconception than the observed response feature.
- Feedback or a hint discloses the fresh re-entry's answer.
- Feedback presents a single response as a settled learner diagnosis.
- An assistance, repair, or failure state leaves no operable next action, or advances past the item
  with no feedback at all.
- Feedback exposes internal codes or IDs instead of learner language.

**BLOCKED.** A consequential outcome branch, assistance state, repair, or re-entry cannot be rendered
and inspected, or focus and announcement behavior has no capture.

**Non-blocking / still-pass boundary.** Brief feedback on a low-stakes entry check passes when the
full model follows on the route (the C02 exception). Tone, warmth, and length are non-blocking while
the reasoning reference is present.

**Remediation and human roles.** Deliver the authored rationale and observable-error action, retarget
the message, or fix the focus destination. `PRODUCT_PEDAGOGY_OWNER`, `ACCESSIBILITY_REVIEWER`; add
`DOMAIN_CONSTRUCT_SME` when feedback explains domain reasoning.

#### LQR-X04 — Meaningful interaction and representation

**Purpose and owner.** Owns whether each representation and interaction carries the cognitive work it
claims, and whether the response mode can perform the authored operation.

**Required evidence.** Target KC and authored learner operation; a representation or interaction
warrant naming the decisive feature; rendered before/after state for each interactive action as DOM
plus capture; the feedback or visibility change the action produces; the static and reduced-motion
fallback; the accessible alternative and its construct-preservation review.

**FAIL (blocking).**

- An interactive control's only state effect is decorative: no change to information available,
  diagnosis, feedback, or the visibility of a KC relationship.
- The response mode cannot perform or express the authored operation — a multi-field constructed
  operation collapsed into one free-text field.
- A representation omits the decisive feature the task requires, or substituted prose cannot support
  the operation.
- Visual treatment — highlight, ordering, emphasis — marks the scored answer.
- Essential meaning is carried only by animation, color, sound, hover, or a precise gesture.

**BLOCKED.** The representation warrant, the rendered interactive states, or the
accessible-alternative comparison is unavailable.

**Non-blocking / still-pass boundary.** No interaction quota. A static representation passes when it
exposes every decisive relationship and the response control performs the operation. Removing an
optional, unscored auxiliary interaction is not a defect when nothing it revealed becomes
unavailable.

**Remediation and human roles.** Give the control a relationship-specific state effect, restore the
authored response fields, or make the decisive feature present. `PRODUCT_PEDAGOGY_OWNER`,
`DOMAIN_CONSTRUCT_SME`, `ACCESSIBILITY_REVIEWER` when a representation or alternative is material.

#### LQR-X05 — Accessibility and construct equivalence

**Purpose and owner.** Owns accessibility semantics and the construct equivalence of alternatives.
Not responsive clipping and recovery (X06).

**Required evidence.** A keyboard-only completion trace for every applicable branch; focus order,
visible focus, and focus-not-obscured captures; accessibility-tree name/role/value results; text and
non-text **`contrast_measurements`** — the foreground/background pair, the measured ratio, the
applicable threshold, and the tool or method, as specified in the evidence protocol §5; 200 % zoom
and 320 px reflow measurements; status-message announcement capture; target size and spacing
measurements; motion and reduced-motion behavior; screen-reader review of prose, math, tables,
charts, and diagrams; **for symbolic or numeric notation, an `accessible_math_transcript`: exactly
what the screen reader announces for each distinct expression, checked against that expression's
intended mathematical reading, plus the markup technique used (MathML, accessible HTML, or image
alt text)**; an alternative-representation construct comparison; an independent real Safari +
VoiceOver receipt recorded by someone other than the primary author.

**FAIL (blocking).**

- An applicable WCAG 2.2 Level AA success criterion fails on a required screen, control,
  representation, feedback state, or navigation path. Conformance at AA includes the applicable
  Level A criteria; those normally in scope for a lesson are at least 1.1.1, 1.3.1, 1.3.2, 1.3.3,
  1.4.1, 1.4.3, 1.4.4, 1.4.10, 1.4.11, 1.4.12, 2.1.1, 2.1.2, 2.2.2, 2.4.3, 2.4.7, 2.4.11, 2.5.1,
  2.5.7, 2.5.8, 3.3.1, 3.3.2, 3.3.3, 4.1.2, and 4.1.3. The enumeration is a floor, not the scope:
  the condition is the whole applicable standard.
- A required branch cannot be completed with an applicable access method — keyboard only, screen
  reader, or zoom and reflow.
- An alternative changes the learner operation, or supplies a relationship the original task requires
  the learner to derive, while both produce the same evidence meaning.
- A control's accessible name is absent, or does not include its visible label.
- A distinct symbolic or numeric expression is announced in a form that does not match its intended
  mathematical reading, as recorded in the `accessible_math_transcript`.

**Criteria other dimensions depend on.** Eight of the listed criteria are the WCAG reading of
conditions another card owns, and are enumerated here so a reviewer checking only this list cannot
miss them: **1.4.1 Use of Color**, **1.3.3 Sensory Characteristics**, and **2.5.1 Pointer
Gestures** are the accessibility readings of X04's sensory-channel and gesture condition; **3.3.2
Labels or Instructions** is the reading of C04's unstated-entry-convention condition; **2.5.7
Dragging Movements** is X04-owned when the same root cause is an interaction with no non-dragging
alternative;
**3.3.3 Error Suggestion** is X03-owned when the same root cause is missing corrective feedback;
and **1.4.12 Text Spacing** and **2.2.2 Pause, Stop, Hide** are X06-owned when the same root cause is
responsive clipping or an inoperable pause/termination state. Two additional listed criteria are
owned directly by X05: **1.4.4 Resize Text** and **1.3.2 Meaningful Sequence**, measured by the
200 % zoom result and spoken-reading-order receipt respectively. Record a shared root cause once
under the owning dimension and cross-reference X05 as `NON_COUNTING_CROSS_REFERENCE` (§2.3, §5).

**BLOCKED.** A required automated result, keyboard or focus trace, reflow or target measurement, or
the independent Safari + VoiceOver receipt is missing, stale, or self-approved; or a material
construct-equivalence review has not been performed by a qualified reviewer.

**Non-blocking / still-pass boundary.** The **48 CSS px product touch target is a preferred product
standard, not a WCAG minimum.** Missing it is a non-blocking finding when WCAG 2.5.8 target size and
its spacing allowances pass _and_ no usability, pointer-accuracy, or focus defect is observed at any
required width; it becomes blocking when either condition fails. AAA-level enhancements,
screen-reader verbosity preferences, and decorative alt phrasing are non-blocking. Automated scanning
detects only part of the applicable criteria, so a clean scan is never sufficient evidence alone.

**Remediation and human roles.** Restore the programmatic name or semantic, fix the failing criterion,
or redesign the alternative to preserve the operation. `ACCESSIBILITY_REVIEWER` (independent of the
author), `DOMAIN_CONSTRUCT_SME` for construct equivalence, `PRODUCT_PEDAGOGY_OWNER` for approval.

#### LQR-X06 — Responsive behavior, recovery, and branch completion

**Purpose and owner.** Owns state persistence, recovery, branch termination, and responsive
completion. Not whether an access method exists (X05) or whether repair content is pedagogically
right (C05).

**Required evidence.** Captures of every primary screen and consequential branch at desktop, 375 px,
and 320 px; 200 % zoom traces; page-level and contained-overflow measurements; pause/resume, refresh,
and reconnect runs; injected save or network failure and retry runs; persisted checkpoint and
revision-identity assertions; console and failed-request logs; the `runtime_terminal_disposition` of
every branch.

**FAIL (blocking).**

- A required control or content is clipped, overlapped, or unreachable at a required width or at
  200 % zoom, or page-level horizontal scrolling is required.
- An interruption — pause, refresh, reconnect, save failure — loses, duplicates, or advances a
  committed response, or restores a checkpoint bound to a different revision.
- A displayed recovery action neither retries nor resolves the failed transition and no truthful
  alternative exit is offered: the learner reaches a state with no operable path forward.
- An error or loading state persists with no next action, or claims progress was saved when it was
  not.
- A branch has no terminal disposition: it loops, dead-ends, or silently advances past a required
  check.
- A console or runtime error invalidates the learner path.

**BLOCKED.** The viewport, interruption, and recovery matrix has not been executed against the exact
build and revision, or the branch inventory has an uncovered applicable branch.

**Non-blocking / still-pass boundary.** A `runtime_terminal_disposition` of blocked is an honest
terminal state, not a defect, when it truthfully reports what happened, claims no unearned progress,
and returns control — for example to the planner or curriculum. In-place retry is not mandatory when
a truthful alternative exit exists. Vertical scrolling, minor layout shift, and reflow-driven
reordering pass while no control is obscured and the operation is unchanged.

**Remediation and human roles.** Make the recovery action reissue the failed idempotent command or
replace it with a truthful exit; bind the checkpoint to the revision; give every branch a terminal
disposition. `PRODUCT_PEDAGOGY_OWNER`, `PLATFORM_RELIABILITY_REVIEWER`; add `ACCESSIBILITY_REVIEWER`
when the finding concerns focus or an access method.

---

## 7. Evidence minimums and reviewer roles

This section states what must be true of evidence. It deliberately does **not** specify storage
paths, manifest schemas, browser-profile identifiers, receipt wire shapes, harness design, or CI
integration; those belong to the protocols in §10.

### 7.1 Identity and fail-closed rules

Every evidence item is bound to the evaluated revision and build by lesson ID and content hash, the
dependent artifact hashes, the application commit and build identifier, the route,
`runtime_kind: vector | normalized`, `build_environment: PRODUCTION_BUILD | STAGING_BUILD |
LOCAL_BUILD | PROTOTYPE`, the capture environment, and the rubric version. Evidence is addressed by
content hash; a listed item that is missing or hash-mismatched blocks evaluation, and an unlisted
artifact is not evidence.

Missing, stale, contradictory, self-approved, label-contaminated, or unhashable evidence produces
`BLOCKED`. A path with no bytes, a narrative assurance, a screenshot from another revision, and model
recall are all non-evidence. A screenshot proves appearance only — never keyboard operability, focus
movement, screen-reader semantics, dynamic feedback, checkpoint persistence, network recovery, branch
termination, or construct equivalence.

Build identity is part of rendered-evidence identity, not an optional label: **a null application
commit or build identifier creates the global precondition
`APPLICATION_IDENTITY_NULL` and voids the route evaluation, forcing all twelve dimensions
`BLOCKED`**, including every `LQR-X*` dimension, because nothing observed in a browser can then be
bound to the build that produced it.

### 7.2 Branch coverage minimum

"Every consequential branch" means every distinct transition and outcome the lesson can produce, not
every cross-product of viewport, theme, KC, and response. Coverage must include each applicable
instance of: new start and resume; correct response; incorrect near-use response; incorrect
changed-task response; omission or skip; support or help request; reveal where supported; targeted
repair; the exact fresh re-entry after each failed function; repeated repair failure with planner
handoff or honest block; invalid or unavailable item behavior; pause and resume both before and after
commitment; refresh and reconnect; uncertain save or command failure; revision mismatch or unavailable
lesson; KC transition; lesson completion; and every response encoding the lesson uses. The matrix must
also exercise each required KC, each exit function, each repair and re-entry implementation, and each
unique representation or control type.

### 7.3 Rendered-evidence minimum

Automated capture must cover every consequential branch in at least one profile, and every primary
screen and consequential repair branch at desktop, 375 px, and 320 px, plus 200 % zoom, reduced
motion, and keyboard-only conditions. It records, as applicable: DOM and accessibility-tree state;
primary heading and action counts; focus order and post-action focus destinations; keyboard
completion; form and status semantics; automated accessibility findings; page and contained-overflow
measurements; target-size measurements; console errors; failed requests; route and checkpoint
transitions; persisted revision and run identity; and expected versus actual terminal disposition.

Automation cannot establish that a real browser and screen reader communicate the lesson coherently.
A human reviewer therefore records an independent, revision-bound Safari + VoiceOver review covering
at least one end-to-end route per runtime kind and every unique semantic control or representation
type, reporting spoken reading order, control names, focus and announcement behavior, construct
equivalence, and its findings. Novice walkthrough and independent blind-solve observations use the
receipt shapes in the evidence protocol §6 and carry no verdict field in judge-visible form.
**The primary author may not self-approve any of those reviews.**

Protected answers, scoring rules, private rationales, credentials, and learner data must never enter a
raw learner-evidence artifact.

### 7.4 Reviewer role matrix

Canonical roles: `PRODUCT_PEDAGOGY_OWNER`, `DOMAIN_CONSTRUCT_SME`, `INDEPENDENT_BLIND_SOLVER`,
`ACCESSIBILITY_REVIEWER`, `NOVICE_WALKTHROUGH_REVIEWER`, `PLATFORM_RELIABILITY_REVIEWER`,
`RIGHTS_REVIEWER`. These seven names are the only legal values of any `role`, `owner_role`, or
`required_human_roles[]` field anywhere in this family.

**Evidence roles versus decision roles.** The two kinds compose differently with §2.2 and §2.4, so
they are named separately:

```text
evidence_roles:  DOMAIN_CONSTRUCT_SME, INDEPENDENT_BLIND_SOLVER, ACCESSIBILITY_REVIEWER,
                 NOVICE_WALKTHROUGH_REVIEWER, PLATFORM_RELIABILITY_REVIEWER, RIGHTS_REVIEWER
decision_roles:  PRODUCT_PEDAGOGY_OWNER, and any role acting as approver for a lesson revision
```

An `evidence_role` produces a receipt the evaluation _reads_; its absence is an evidence gap, and
the dimensions that require it are `BLOCKED` (§2.2). A `decision_role` decides _after_ the
evaluation; its absence never makes a dimension `BLOCKED`, and instead sets
`human_gate_status: PENDING` and `approval_withheld: true` at the lesson level (§2.4). A role may
appear in both lists for different acts — a `DOMAIN_CONSTRUCT_SME` supplying a construct comparison
is acting as an evidence role, and the same person signing off as approver is acting as a decision
role — and the two acts need separate receipts.

**Legacy role aliases (read-only, do not propagate).** Pre-existing
`lesson-quality-report.json` artifacts under `content/lessons/` predate this matrix and use role
names that are not canonical. Those artifacts are lesson artifacts and are **out of scope for this
documentation family; they are not edited here.** When reading one, resolve its role names through
this map, and never write these aliases into a new record:

| Legacy value found in artifacts                | Canonical role                                                                                   |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `NOVICE_CLARITY_REVIEWER`                      | `NOVICE_WALKTHROUGH_REVIEWER`                                                                    |
| `SOURCE_RIGHTS_REVIEWER`                       | `RIGHTS_REVIEWER`                                                                                |
| `ACCESSIBILITY_CONSTRUCT_EQUIVALENCE_REVIEWER` | `ACCESSIBILITY_REVIEWER` (which covers both accessibility and construct equivalence for LQR-X05) |
| `DOMAIN_FACTUAL_REVIEWER`                      | `DOMAIN_CONSTRUCT_SME`                                                                           |
| `QUESTION_EVIDENCE_REVIEWER`                   | `DOMAIN_CONSTRUCT_SME`                                                                           |

The last two split one canonical role across two artifact fields — factual accuracy in one,
item/evidence adequacy in the other. This matrix does not preserve that split, because the
qualification is the same and a single SME receipt covers both acts. A legacy artifact showing one
satisfied and the other unassigned resolves to an **unsatisfied** `DOMAIN_CONSTRUCT_SME`
requirement; partial coverage of a merged role is not coverage.

A legacy alias also does not carry the legacy artifact's dimension attribution: novice walkthrough
is an `LQR-X02` obligation, never an `LQR-C04` one, whatever an older artifact filed it under.

| Dimension                                       | Required roles                                                               | Minimum receipts | When required                                                       |
| ----------------------------------------------- | ---------------------------------------------------------------------------- | ---------------- | ------------------------------------------------------------------- |
| LQR-C01                                         | `PRODUCT_PEDAGOGY_OWNER`, `DOMAIN_CONSTRUCT_SME`, `INDEPENDENT_BLIND_SOLVER` | 1 + 1 + 2        | always                                                              |
| LQR-C02                                         | `PRODUCT_PEDAGOGY_OWNER`, `DOMAIN_CONSTRUCT_SME`                             | 1 + 1            | always                                                              |
| LQR-C03                                         | `PRODUCT_PEDAGOGY_OWNER`, `DOMAIN_CONSTRUCT_SME`                             | 1 + 1            | always                                                              |
| LQR-C04                                         | `PRODUCT_PEDAGOGY_OWNER`, `DOMAIN_CONSTRUCT_SME`, `INDEPENDENT_BLIND_SOLVER` | 1 + 1 + 2        | always                                                              |
| LQR-C05                                         | `PRODUCT_PEDAGOGY_OWNER`, `DOMAIN_CONSTRUCT_SME`                             | 1 + 1            | always                                                              |
| LQR-C06                                         | `PRODUCT_PEDAGOGY_OWNER`, `DOMAIN_CONSTRUCT_SME`                             | 1 + 1            | always                                                              |
| LQR-X01                                         | `PRODUCT_PEDAGOGY_OWNER`                                                     | 1                | always                                                              |
| LQR-X01                                         | `DOMAIN_CONSTRUCT_SME`                                                       | 1                | the omitted or added element carries domain content                 |
| LQR-X02                                         | `PRODUCT_PEDAGOGY_OWNER`, `NOVICE_WALKTHROUGH_REVIEWER`                      | 1 + 1            | always                                                              |
| LQR-X02                                         | `ACCESSIBILITY_REVIEWER`                                                     | 1                | the finding concerns focus or reflow                                |
| LQR-X03                                         | `PRODUCT_PEDAGOGY_OWNER`, `ACCESSIBILITY_REVIEWER`                           | 1 + 1            | always                                                              |
| LQR-X03                                         | `DOMAIN_CONSTRUCT_SME`                                                       | 1                | feedback explains domain reasoning                                  |
| LQR-X04                                         | `PRODUCT_PEDAGOGY_OWNER`, `DOMAIN_CONSTRUCT_SME`                             | 1 + 1            | always                                                              |
| LQR-X04                                         | `ACCESSIBILITY_REVIEWER`                                                     | 1                | a representation or accessible alternative is material              |
| LQR-X05                                         | `ACCESSIBILITY_REVIEWER`, `PRODUCT_PEDAGOGY_OWNER`                           | 1 + 1            | always                                                              |
| LQR-X05                                         | `DOMAIN_CONSTRUCT_SME`                                                       | 1                | an alternative could change the construct                           |
| LQR-X06                                         | `PRODUCT_PEDAGOGY_OWNER`, `PLATFORM_RELIABILITY_REVIEWER`                    | 1 + 1            | always                                                              |
| LQR-X06                                         | `ACCESSIBILITY_REVIEWER`                                                     | 1                | the finding concerns focus or an access method                      |
| any dimension using third-party source material | `RIGHTS_REVIEWER`                                                            | 1                | before extraction, storage, calibration use, or distribution (§9.2) |

Each "when required" entry is a trigger, not discretion. "Add a role when it seems material" is not a
rule.

**Independence.** The primary author of the evaluated content may not be its sole approver and may
not record its Safari + VoiceOver receipt. A blind solver must not have seen the key, rationale, or
prior feedback for that item, and must not have authored it. A novice walkthrough reviewer must not
have authored or previously walked that route **and must not hold the target KC** — the four
orienting questions test what a proxy learner can read off the screen, and a domain expert answers
them from knowledge the learner does not have, which inverts the signal X02 needs. Where no such
reviewer is available, the dimension is `BLOCKED`; it is not staffed by a domain expert. One
qualified person may hold multiple roles only where independence is not thereby lost.

**An unavailable specialist is `BLOCKED`.** If a required role cannot be staffed, the dimension is
`BLOCKED`. It is never downgraded to a non-blocking finding, delegated to model judgment, waived by
seniority, or satisfied by an automated scan. An unavailable specialist is a scheduling problem with
an honest name; a falsely passed dimension is a defect that ships.

---

## 8. Anchor lifecycle and calibration

### 8.1 Set shape and construction

The calibration set holds **36 candidates**: one `CLEAR_PASS`, one `CLEAR_FAIL`, and one `BOUNDARY`
per dimension. Anchors are criterion-level examples, not whole lessons presumed good or bad; each
isolates one dimension and minimizes unrelated defects. A `BOUNDARY` case may propose `PASS`, `FAIL`,
or `BLOCKED`; its job is to locate the blocking line, and `BLOCKED` is used only when the deciding
construct or evidence is genuinely unavailable, never as a hedge.

**This set is a discrimination smoke test, not an estimator.** With one `CLEAR_FAIL` per dimension,
a per-dimension false-pass rate is a single Bernoulli trial and reports nothing. The set can show
that a judge distinguishes a pass control from its one-transform fail; it cannot bound a false-pass
rate, and no reader may treat a clean run over these 36 cases as an accuracy result. Sizing an
estimator is §8.4's owner decision.

**A pair must be runnable before it is used.** Both members must be materialized, hashed, and
captured; a `SOURCE_OBSERVABLE` case whose paired control is `DESIGN_ONLY` is not a runnable pair.
Each dimension's rollup row records `pair_runnable: true | false` alongside "pair matched" —
matching is a claim about design symmetry, runnability is a claim about existing bytes, and they
are routinely confused.

**An anchor scores one dimension.** A case's `judge_verdict` is
`dimensions[<the anchor's dimension_id>].result.evaluation_verdict`. The other eleven results in
that run are not scored: they are `BLOCKED` for reasons that have nothing to do with the case.

A synthetic case changes **one material fact** from a hashed control its pass and fail variants share
byte for byte. Deterministic consequences of that fact — regenerated hashes, projections, a derived
key value — are recorded but are not extra transforms. Any second manual change invalidates the case.

The catalog lives in [`lesson-quality-rubric-anchors.md`](./lesson-quality-rubric-anchors.md). This
file remains the dimension authority and embeds no anchor content.

### 8.2 Split readiness statuses

Two independent statuses, never one:

```text
source_inspection_status:      PRESENT | MISSING | STALE | CONTRADICTORY
adjudication_evidence_status:  NOT_REVIEWED | RECEIPTS_COMPLETE | BLOCKED
```

`PRESENT` means the cited source can be inspected; it says nothing about whether the proposed verdict
is right. `NOT_REVIEWED` means adjudication has not begun and nothing has been declared unavailable —
an unmaterialized synthetic design is `NOT_REVIEWED`. `BLOCKED` means a required evidence item or
specialist receipt is identified as missing, stale, contradictory, or unobtainable. **Only
`RECEIPTS_COMPLETE` can support a gold verdict.**

The superseded single field `current_evidence_status: SUFFICIENT | BLOCKED` conflated these and must
not be read as adjudication readiness.

### 8.3 Lifecycle and verdict separation

```text
lifecycle_state:  CANDIDATE_PENDING_REVIEW | RETIRED_CANDIDATE | GOLD_APPROVED
proposed_verdict: PASS | FAIL | BLOCKED            (agent recommendation)
human_verdict:    PASS | FAIL | BLOCKED | null     (recorded per receipt)
gold_verdict:     PASS | FAIL | BLOCKED | null     (only when promoted)
```

The three verdict fields are stored separately and are never merged or back-filled from each other.
An agent cannot promote its own candidate. Promotion to `GOLD_APPROVED` requires
`adjudication_evidence_status: RECEIPTS_COMPLETE`, every required role receipt from §7.4 matching the
exact input hashes, `pair_runnable: true` for the dimension, **per-dimension pre-adjudication
reviewer agreement recorded** (§8.4), and written resolution of any disagreement; disagreement
leaves the record `CANDIDATE_PENDING_REVIEW`.

**A proposed verdict on a real artifact is a hypothesis, not an observation.** Where a record's
deciding evidence does not exist, the honest label is `BLOCKED`; where the record is genuinely
stating what a complete evidence bundle would find, the field is named
`hypothesized_verdict_under_complete_evidence` so the label cannot be lifted out of context and
read as a finding about shipped behavior.

**Every current record is candidate-only and no gold anchor exists.** The v0.1 machine fixture caps
review receipts at zero by construction, so no record in that schema version can ever be promoted
within it; a later, separate adjudicated-anchor schema is required. Do not simulate promotion by
editing candidate fields. That later schema must enforce exactly one `CLEAR_PASS`, `CLEAR_FAIL`, and
`BOUNDARY` per dimension; unique anchor IDs; at least one blocking fact on every `CLEAR_FAIL`; a
source revision identity matching an allowlisted baseline or content hash; and receipts whose roles
match §7.4.

### 8.4 Synchronization and calibration use

The human catalog is the review surface; machine fixtures under
`tests/evals/lesson-quality/anchors/` are the evaluator input. Anchor IDs, case kinds, proposed
verdicts, source refs, and rationale versions must agree across both. **They do not agree today:**
the catalog is at `0.9.1-candidate` while the frozen fixture remains at `0.1-draft`. The catalog
records which candidates were superseded and why; regenerating the fixture is an out-of-scope
implementation task tracked in §10.

**Calibration mode is rejected until a trusted controller exists.** Calibration eligibility is a
controller precondition, never a judge claim. Before any model is invoked in calibration mode, a
trusted controller must verify a `GOLD_APPROVED` anchor record with
`adjudication_evidence_status: RECEIPTS_COMPLETE`, reject every candidate-only schema or anchor-set
version, and supply an opaque case token. No such controller exists, and no record is
`GOLD_APPROVED`, so **calibration mode is rejected outright today** — the rejection does not depend
on a model recognizing that `0.9.1-candidate` is ineligible. The stale `0.1-draft` fixture is the
concrete hazard this closes: it sits at an evaluator-input path, is structurally valid against its
own schema, and carries candidate records with label-bearing IDs.

In calibration: the judge never receives the expected verdict, and case IDs must not encode pass,
fail, or boundary. Anchor IDs of the printed form `LQA-C01-P02` encode the case kind, so they are a
review-surface identifier only; the judge receives a **random `opaque_case_id`** generated at
fixture time and held outside model context, never the catalog ID. Every run pins the rubric
version and hash, prompt version, anchor-set version, model and configuration, fixture hash, and
evidence-bundle hash. Gold labels stay hidden until each output is immutable, and any label
exposure is recorded as contamination. Reporting covers false passes, false failures, boundary
errors, repeatability, and agreement **by dimension**, scoring only the anchor's own dimension
(§8.1); aggregate accuracy that hides false passes is not a result.

**Judge-visible versus adjudication evidence.** Required-role _evidence_ receipts — novice
walkthrough, blind solve, SME construct comparison, Safari + VoiceOver, and construct equivalence —
are judge-visible input with no verdict field; without them, `PASS` is structurally unreachable on
the dimensions that require them. _Adjudication_ receipts — the worksheet's `review_receipts[]`,
which carry a verdict — are never judge-visible.

**Report reviewer agreement, not just judge agreement.** Independent-reviewer agreement is measured
and reported **per dimension, before adjudication**, alongside judge agreement. When the thing
under test is whether twelve criteria are operational, human–human pre-adjudication agreement _is_
the measurement of operational clarity. A dimension whose independent reviewers disagree before
adjudication is recorded with `origin: RUBRIC`, never as a judge error.

**Enforcement stays disabled** until an owner sets the calibration sample size, repeatability
requirement, false-pass ceiling, and adjudication criteria. The sample size must be expressed as
**cases per dimension per case kind**, with `CLEAR_FAIL` and fail-side boundary counts sized to the
chosen false-pass ceiling — an aggregate case count cannot support a per-dimension claim. This
rubric deliberately does not invent those thresholds.

---

## 9. Source-use policy for examples

Examples inform this rubric. They never become presumed-good content and never enter it verbatim.

### 9.1 Internal sources

**Lessons 1–3** are frozen candidate-source baselines before remediation, and are the initial
calibration set. Nothing in them is presumed to pass; their current content may supply failing or
boundary candidates, and any real example becomes gold only after human adjudication. The previously
suspected Lesson 3 role-mislabelling is **not** a valid failing anchor — later investigation found
those records were intentionally authored re-entries.

**Retired app-native preview lessons** are anti-pattern and boundary evidence only. Extract structural
patterns — screen rhythm, the alt plus text-equivalent visual contract, per-option feedback shape,
progress grouping. Do not reuse their item text, passages, diagram labels, or feedback prose. Two
preview slugs reused production lesson IDs, so any citation must carry a content hash or version,
never a slug alone.

**Specification exemplars** are design sources, not gates (§1). **Synthetic designs are designs:** a
synthetic case is evidence of nothing until it is materialized, hashed, and captured.

### 9.2 External sources, and admitting new material

External instructional material — commercial prep books, competitor lessons, released exam material,
licensed question banks — may inform calibration only as **rights-safe derived observations**.

_Permitted:_ structural and sequence analysis; pedagogical pattern description; strengths,
anti-patterns, and boundary observations; page or locator references; short paraphrase; counts and
distributions. _Not permitted:_ substantial verbatim text; complete questions, options, passages,
figures, or tables; reproductions of visual assets; or any excerpt used as shippable lesson content.

Before an external source is used it must record: the copyright holder and provenance; the license or
permission basis and its receipt; intended uses marked separately as allowed, restricted, or unknown
for internal human review, model calibration, excerpt storage, synthetic transformation, and external
distribution; excerpt boundaries; attribution and retention limits; and a `RIGHTS_REVIEWER` decision
of `PENDING | PERMITTED | RESTRICTED | PROHIBITED`. Anything other than `PERMITTED` keeps the material
out of model calibration and out of any stored fixture. An agent may inventory rights evidence but
cannot grant permission. Rights clearance does not establish a rubric verdict, and a rubric verdict
does not establish rights clearance.

**No external source currently holds a complete admission record.**
[`kaplan-analysis.md`](./lesson-quality-sources/kaplan-analysis.md) is the only external-derived
analysis in this family. Its admission record is `rights_use_status: PENDING` with
`RIGHTS_REVIEWER: UNASSIGNED`, so it is **not** a worked example of the permitted form and must not
be cited as one until a named rights reviewer records a decision. A document cannot confer on
itself the clearance this section reserves to a human.

**External material may inform a criterion only through the same admission record.** Where an
external observation shaped a criterion's wording, record that provenance in the criterion's own
history; a source that has not been admitted cannot supply criteria indirectly by being read
closely. The following v0.9 criteria were shaped by observations in `kaplan-analysis.md` while its
record is `PENDING`, and are therefore held as **provisional pending that rights decision**: C02's
teach-before-assess rule with the low-stakes exception; C03's per-distractor observable rationale;
C04's negation and reading-load condition; and C05's no-answer-reveal plus fresh re-entry pairing.
Each is independently supported by the internal source analyses, so none is withdrawn — but the
provenance is recorded rather than left implicit.

**Admitting a new external example.** A candidate derived from external material is admitted only
when it also: names the dimension it isolates and why the observation is separable from adjacent
dimensions; expresses the observation as a derived description rather than a reproduction; is paired
with an internal or synthetic control so calibration never depends on material that cannot be stored;
and carries `source_kind: DERIVED_EXTERNAL_OBSERVATION` with
`lifecycle_state: CANDIDATE_PENDING_REVIEW`. External material is never presumed good, and its
provenance is never a substitute for adjudication.

---

## 10. Implementation boundary and open owner decisions

**Deliberately out of scope here:** evidence storage layout and file naming; evidence manifest
schema; browser-profile identifiers and harness design; receipt wire shapes; judge input/output
schema and prompt-injection boundary; CI and registration integration; and the scored report's
filename, schema, and hash chain. These belong to:

- [`lesson-quality-author-protocol.md`](./lesson-quality-author-protocol.md) — author input, evidence
  discipline, self-audit record, revise loop.
- [`lesson-quality-judge-protocol.md`](./lesson-quality-judge-protocol.md) — judge prompts, security
  and evidence boundary, output schema, hidden-anchor protocol.
- [`lesson-quality-calibration-worksheet.md`](./lesson-quality-calibration-worksheet.md) —
  per-example adjudication, rights record, receipts, run log.
- [`lesson-quality-evidence-protocol.md`](./lesson-quality-evidence-protocol.md) — evidence
  identity and manifest fields, the consequential-branch coverage matrix, rendered-capture
  minimums, and the manual receipt shapes.

**The evidence protocol now exists** and is the current documentation-only detail contract for
everything §7 states as a minimum. What does **not** exist is the harness: no capture tool, no
manifest generator, no receipt-collection surface, and no CI step reads or writes any of it. §7
states the evidence minimums; the evidence protocol states their documented shape; neither is an
implementation, and nothing in this family is enforcing.

**Open owner decisions.**

1. Calibration acceptance criteria — cases per dimension per case kind, repeatability, false-pass
   ceiling, pre-adjudication agreement threshold, and adjudication rules — before any enforcement
   is enabled.
2. The scored-report filename, schema, and hash treatment, and its relationship to the structural
   `lesson-quality-report.json`.
3. Regeneration of the machine anchor fixture to match catalog `0.9.1-candidate`, plus the separate
   adjudicated-anchor schema in §8.3.
4. Whether `PREREQUISITE_SUPPORT` becomes a real route or receives an authoritative absence proof,
   per current lesson.
5. Staffing of the §7.4 roles, including `RIGHTS_REVIEWER`, which the current candidate fixture's
   role enumeration cannot encode.
6. The calibration-to-enforcement transition for Lessons 1–3: not immediately disabled by an
   uncalibrated rubric, and not permanently grandfathered.
7. The evidence **harness** — capture tooling, manifest generation, receipt collection, and CI
   integration — to implement what the evidence protocol documents. The protocol itself is written
   and is no longer an open decision; only its implementation is.
8. Whether `NOVICE_WALKTHROUGH_REVIEWER` should be renamed `PROXY_LEARNER_REVIEWER`. The
   independence rule at §7.4 now states the binding constraint (must not hold the target KC), so
   this is a naming decision about legibility, not a behavior change.
9. Rights disposition for `kaplan-analysis.md` (§9.2). Its admission record is `PENDING`, which
   holds four criteria's external provenance provisional and keeps the material out of any stored
   fixture.
