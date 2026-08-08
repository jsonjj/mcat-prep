# Lesson Quality Rubric Consistency Audit

**Status:** NOT READY FOR A SINGLE-SCRIBE v0.9 REWRITE
**Audit date:** 2026-08-03
**Scope:** Source-only consistency audit of the rubric, anchor catalog and fixtures,
the two authoring specifications, and the Lesson → Evidence → Mastery Contract.
No candidate was promoted, no gold label was assigned, and no human receipt was
created or inferred.

## Disposition

The rubric has a useful 12-card shape: all **12/12** cards state `PASS`, `FAIL`,
and `BLOCKED` conditions. It is not yet internally calibrated enough to rewrite
by one scribe without first resolving the four Critical authority decisions below.
The present documents can give a careful reviewer or agent mutually incompatible
instructions about:

1. which result vocabulary controls;
2. whether missing evidence masks a demonstrated defect;
3. what “sufficient” anchor evidence means;
4. which item can move `pL`; and
5. which routes must be reviewed.

## Evidence inspected

- `key-docs/lesson-quality-rubric.md`
- `key-docs/lesson-quality-rubric-anchors.md`
- `tests/evals/lesson-quality/anchors/anchor-set.json`
- `tests/evals/lesson-quality/anchors/anchor-set.schema.json`
- `docs/design/04-V3-LESSON-AUTHORING-QUALITY-AND-UI.md`
- `docs/design/05-LESSON-STRUCTURAL-AUTHORING-SPEC.md`
- `docs/lesson-evidence-mastery-contract.md`

This audit does not assert that a cited implementation is correct. Several source
documents expressly say that a prose/code divergence needs owner adjudication.

## Counts

| Severity | Count |
| --- | ---: |
| Critical | 4 |
| Important | 6 |
| Minor | 3 |

Anchor-fixture facts, not adjudications:

- 36 candidate records; all are `CANDIDATE_PENDING_REVIEW` with `gold_verdict: null`
  and no receipt.
- Proposed verdicts: 20 `PASS`, 12 `FAIL`, 4 `BLOCKED`.
- `current_evidence_status`: 11 `SUFFICIENT`, 25 `BLOCKED`.
- The candidate schema intentionally caps `review_receipts` at zero, so none can
  become an approved record in this schema version.

## Verdict semantics across all 12 cards

The mechanical shape is consistent but the operational result is not:

- `PASS requires`: 12 occurrences.
- `FAIL when`: 12 occurrences.
- `BLOCKED when`: 12 occurrences.
- Explicit `Non-blocking examples`: 1 occurrence, on C04 only.

The shared card contract requires each dimension and scored result to identify
non-blocking examples, evidence references, remediation, and a human decision or
override (`key-docs/lesson-quality-rubric.md:148-162`). The cards do not provide
a common result record or severity mapping, and only C04 labels a concrete
non-blocking example (`key-docs/lesson-quality-rubric.md:321-322`).

| Card | P/F/B stated | Operational gap that can change a verdict |
| --- | --- | --- |
| C01 Transfer validity | Yes | “Transfer” is not explicitly separated from BKT-eligible `TRANSFER`; changed-exit licensing is contradicted elsewhere. |
| C02 Instructional adequacy | Yes | “Applicable route” has no rubric-owned route universe or authority proof. |
| C03 Distractor/error model | Yes | Feedback and first-invalid-step checks overlap C05 and X03. |
| C04 Prompt clarity | Yes | The only explicit non-blocking example; blind-solve sufficiency is not defined. |
| C05 Repair quality | Yes | “Bounded” and “appropriate” assistance lack a decision rule; rendered repair also appears in X03/X06. |
| C06 DOK | Yes | DOK target, rationale, and acceptable boundary are not calibrated. |
| X01 Presentation/UI fidelity | Yes | No minimal semantic-diff test distinguishes a fidelity failure from a permissible layout change. |
| X02 Focus/pacing/visual clarity | Yes | “Job,” “focus,” “trust,” and “avoidable overload” lack observable decision rules. |
| X03 Feedback/scaffolding | Yes | Repeats C03/C05 repair and feedback checks without primary ownership. |
| X04 Interaction/representation | Yes | “Meaningful” and “important relationship” are uncalibrated predicates. |
| X05 Accessibility/equivalence | Yes | 48 px product target, exceptions, reflow, and construct equivalence lack a single threshold/receipt rule. |
| X06 Responsive/recovery/branch completion | Yes | Repeats X05 viewport/reflow checks and uses `BLOCKED` as a runtime terminal state as well as an evaluation verdict. |

The following ranges have no labeled concrete non-blocking examples despite the
shared contract: C01 `:166-203`, C02 `:205-245`, C03 `:247-281`, C05
`:324-359`, C06 `:361-395`, X01 `:403-445`, X02 `:447-488`, X03
`:490-532`, X04 `:534-577`, X05 `:579-630`, and X06 `:632-674` in
`key-docs/lesson-quality-rubric.md`.

## Critical findings

### C-01 — No canonical status model, report contract, or failure precedence

**Evidence**

- The rubric has only `PASS | FAIL | BLOCKED`, permits `PASS` with non-blocking
  findings, and says any required `FAIL` or `BLOCKED` prevents approval
  (`key-docs/lesson-quality-rubric.md:76-98`).
- It also uses undefined severity words: “critical defects” block and “minor”
  findings do not (`key-docs/lesson-quality-rubric.md:110-122`).
- Spec 04 defines `PASS | FAIL | REVISE | BLOCKED`, P0–P3 findings, and gives
  `FAIL` precedence over incomplete evidence when a P0/P1 is proven
  (`docs/design/04-V3-LESSON-AUTHORING-QUALITY-AND-UI.md:1629-1642`,
  `:1884-1919`, `:3730-3731`).
- The structural specification requires a `lesson-quality-report.json` and pins
  its draft final gate to `BLOCKED`
  (`docs/design/05-LESSON-STRUCTURAL-AUTHORING-SPEC.md:21-31`,
  `:134-139`), while the rubric says the scored report filename and schema are
  later decisions (`key-docs/lesson-quality-rubric.md:1044-1050`).

**Why this is Critical**

The same P2/non-blocking issue is `PASS` in the rubric but `REVISE` in Spec 04.
A demonstrated blocking defect plus missing branch evidence is ambiguous in the
rubric but deterministically `FAIL` in Spec 04. An agent can therefore report a
different release decision without violating the document it chose to follow.

**Exact v0.9 edit**

Add one authoritative result algorithm and delete competing outcome claims from
the rubric:

```text
For a dimension:
1. FAIL if revision-bound evidence demonstrates one blocking defect.
2. Otherwise BLOCKED if any required evidence is missing, stale, contradictory,
   or not revision-bound.
3. Otherwise PASS. PASS may contain only non-blocking findings.

REVISE is a workflow disposition after a verdict, not a dimension or approval
verdict. “Critical” means blocking; “minor” means non-blocking. No other severity
word changes a verdict.
```

Define a single `dimension_result` record with `dimension_id`, `applicability`,
`verdict`, `blocking_findings[]`, `non_blocking_findings[]`,
`evidence_refs[]`, `blocker_refs[]`, `required_remediation`, and
`human_decision`. Make the structural report name/schema an explicit dependency
or leave it out of v0.9 entirely; it cannot remain both required and undecided.

### C-02 — Anchor evidence status is internally inconsistent and cannot support calibration

**Evidence**

- The rubric says `current_evidence_status` is `SUFFICIENT | BLOCKED`, and that
  required browser, SME, accessibility, or blind-solve evidence missing means
  `BLOCKED` (`key-docs/lesson-quality-rubric.md:1001-1031`).
- The human catalog instead defines `SUFFICIENT` as merely whether source material
  “needed for human adjudication exists” (`key-docs/lesson-quality-rubric-anchors.md:41-46`).
- For example, `LQA-C02-F01` is `SUFFICIENT` but has no evidence reference or
  receipt (`tests/evals/lesson-quality/anchors/anchor-set.json:105-127`);
  all 36 records have `review_receipts: []`.
- The machine schema permits `SUFFICIENT` with no evidence constraints and
  prohibits any receipt by setting `maxItems: 0`
  (`tests/evals/lesson-quality/anchors/anchor-set.schema.json:102-109`,
  `:135-181`).

**Why this is Critical**

“Sufficient” currently means source-inspectable in the catalog but sounds like
adjudication-ready in the rubric. An agent can falsely treat 11 candidates as
evidence-complete or treat a proposed `FAIL` as a confirmed failing anchor.
The schema cannot represent the receipts the prose says are required.

**Exact v0.9 edit**

Replace `current_evidence_status` with two fields:

```text
source_inspection_status: PRESENT | MISSING | STALE | CONTRADICTORY
adjudication_evidence_status: NOT_REVIEWED | RECEIPTS_COMPLETE | BLOCKED
```

State that only `RECEIPTS_COMPLETE` can support a gold verdict. Keep the current
candidate fixture schema immutable and candidate-only; define a later, separate
adjudicated-anchor schema rather than changing any candidate or creating a
receipt. In that later schema, require:

- exactly one `CLEAR_PASS`, `CLEAR_FAIL`, and `BOUNDARY` per dimension;
- unique `anchor_id`s;
- at least one blocking fact on `CLEAR_FAIL`;
- source revision identity that matches an allowlisted baseline or a content hash;
- receipts whose roles match the canonical role matrix.

### C-03 — Mastery/transfer rules and current-state claims contradict each other

**Evidence**

- Spec 05 says only a licensed `CHANGED_EXIT` moves `P(L)`
  (`docs/design/05-LESSON-STRUCTURAL-AUTHORING-SPEC.md:154-174`).
- The mastery contract allows seven evidence modes, including `INDEPENDENT`,
  `TRANSFER`, `DELAYED`, `MIXED`, `PASSAGE`, `TIMED`, and `PROTECTED`
  (`docs/lesson-evidence-mastery-contract.md:317-359`, `:550-617`).
  Spec 04 even supplies a BKT-eligible `SOLO_PRACTICE` example
  (`docs/design/04-V3-LESSON-AUTHORING-QUALITY-AND-UI.md:1199-1323`).
- The mastery contract’s update says L1 now has six `TRANSFER` changed exits,
  then its immediately following table and conclusion say no lesson authors a
  mode and no lesson moves `pL`
  (`docs/lesson-evidence-mastery-contract.md:1092-1139`).
- Spec 04 still says no binding is eligible and the runtime cannot observe graded
  assistance (`docs/design/04-V3-LESSON-AUTHORING-QUALITY-AND-UI.md:1179-1187`,
  `:2191-2199`), while the mastery contract says the runtime now observes it
  (`docs/lesson-evidence-mastery-contract.md:244-273`, `:1122-1127`).

**Why this is Critical**

An evaluator cannot tell whether transfer validity is an instructional-only
property, a `CHANGED_EXIT`-only mastery property, or a general eligible-binding
property. The stale counts also make an agent confidently state an obsolete
implementation capability.

**Exact v0.9 edit**

Add this authority boundary:

```text
Instructional transfer is judged by C01 independently of BKT eligibility.
Only the Lesson → Evidence → Mastery Contract determines whether a response can
move pL. The rubric never infers BKT eligibility from an activity role,
CHANGED_EXIT label, transfer claim, or assistance affordance.
```

Move volatile “N of M bindings” and runtime-observation claims to one
commit-pinned implementation-status note or a verified report. Spec 05 must defer
to the mastery contract for BKT eligibility instead of asserting that only
`CHANGED_EXIT` can move `P(L)`.

### C-04 — “Applicable route” has four incompatible operational meanings

**Evidence**

- Spec 05 structurally requires three lanes: `concise`, `standard`, and
  `misconception` (`docs/design/05-LESSON-STRUCTURAL-AUTHORING-SPEC.md:96-99`).
- Spec 04 defines four routes, adding `PREREQUISITE_SUPPORT`, with explicit
  `APPLICABLE | NOT_APPLICABLE | BLOCKED` proof forms
  (`docs/design/04-V3-LESSON-AUTHORING-QUALITY-AND-UI.md:607-619`,
  `:827-912`).
- The rubric evaluates “every applicable route” but names no route set, source of
  applicability, absence proof, or effect of a blocked route
  (`key-docs/lesson-quality-rubric.md:112-114`, `:205-245`,
  `:397-401`).

**Why this is Critical**

All 12 cards can silently omit a support route, call it inapplicable without
proof, or disagree on whether a blocked route blocks the lesson or is simply not
evaluated.

**Exact v0.9 edit**

Define the rubric route universe once:

```text
Routes: STANDARD, CONCISE, MISCONCEPTION, PREREQUISITE_SUPPORT.
The structural route-proof record is the sole applicability authority.
NOT_APPLICABLE requires its absence proof; BLOCKED requires its blocker.
Every applicable route receives a card result. A lesson-level approval is
BLOCKED while any required route is BLOCKED or lacks a route proof.
```

If the three-lane validator is intentional, explicitly say it validates the
baseline lanes only and add a testable fourth-route rule before v0.9 calls it
complete.

## Important findings

### I-01 — The shared card contract is not fulfilled by 11 cards

**Evidence:** The required schema is at
`key-docs/lesson-quality-rubric.md:148-162`; C04 alone gives a concrete
non-blocking example at `:321-322`. The other 11 cards are listed in the
12-card table above.

**Risk:** A reviewer can turn a local clarity or presentation issue into a
blocking defect, or leave a true non-blocker unrecorded. Required remediation,
evidence references, and human override fields are similarly not normalized.

**Exact v0.9 edit:** Give every card the same five short subheadings:
`Required evidence`, `FAIL (blocking)`, `BLOCKED`, `Non-blocking / still-pass
boundary`, and `Owner + remediation`. Require exactly one concrete
near-boundary example per card.

### I-02 — Reviewer roles drift among the rubric, catalog, fixture, and Spec 04

**Evidence**

- The rubric names product, domain, and accessibility approvals
  (`key-docs/lesson-quality-rubric.md:973-985`).
- The C01 catalog asks for product/domain reviewers
  (`key-docs/lesson-quality-rubric-anchors.md:50-67`), but its fixture also
  requires `INDEPENDENT_BLIND_SOLVER`
  (`tests/evals/lesson-quality/anchors/anchor-set.json:14-39`).
  C04 has the same mismatch
  (`key-docs/lesson-quality-rubric-anchors.md:109-125`,
  `tests/evals/lesson-quality/anchors/anchor-set.json:228-249`).
- The fixture enum has six role names
  (`tests/evals/lesson-quality/anchors/anchor-set.schema.json:163-181`);
  Spec 04 requires a much broader cardinality/qualification catalog and
  separation rules (`docs/design/04-V3-LESSON-AUTHORING-QUALITY-AND-UI.md:1800-1841`,
  `:1851-1882`).

**Risk:** A record can look reviewed while missing a required role, or request a
role the fixture cannot encode.

**Exact v0.9 edit:** Add one role matrix keyed by `dimension_id` and trigger:
`required_role_enum[]`, `minimum_receipts`, `independence_rule`, and
`when_required`. “Add [role] when material” must become an explicit trigger,
not reviewer discretion. The current candidate set remains receipt-free.

### I-03 — Three clusters of dimensions duplicate root-cause scoring

**Evidence**

- C03 includes feedback/error diagnosis (`key-docs/lesson-quality-rubric.md:247-281`),
  C05 includes repair (`:324-359`), and X03 repeats feedback, repair, and
  termination (`:490-532`).
- C03 and C04 both judge cueing, answer defensibility, and response validity
  (`:247-322`).
- X05 and X06 both demand reflow/zoom/narrow viewport evidence
  (`:579-630`, `:632-674`).
- A prior source analysis proposed merging C03/C04 and X01/X02
  (`key-docs/lesson-quality-sources/spec-exemplars-analysis.md:125-131`).

**Re-evaluation:** The proposed X01/X02 merge is not necessary if X01 owns
semantic delivery fidelity and X02 owns cognitive focus. The C03/C04,
C05/X03, and X05/X06 boundaries still need explicit ownership.

**Exact v0.9 edit:** Keep the 12 cards only with a `Primary owner / non-counting
cross-reference` line:

- C03 = key, distractor, and observable response feature; C04 = prompt,
  directions, and response expression.
- C05 = authored repair graph; X03 = delivered feedback/focus behavior.
- X05 = accessibility semantics and construct equivalence; X06 = state,
  recovery, and responsive completion.

Record a defect once under its primary card and link dependent card impacts
without adding duplicate blocking findings.

### I-04 — Several decisive criteria and calibration gates are untestable

**Evidence**

- C06 requires “justified” depth but supplies no calibrated decision procedure
  (`key-docs/lesson-quality-rubric.md:361-395`).
- X02 relies on “one manageable cognitive job,” “clarity,” “trust,” and
  “avoidable overload” (`:447-488`); X04 relies on “meaningful” interaction and
  an “important relationship” (`:534-577`).
- The rubric promises calibration reports but gives no acceptance criteria, then
  lists calibration acceptance criteria as future work
  (`:1033-1042`, `:1052-1063`).

**Risk:** A confident agent can convert taste or a plausible explanation into a
blocking judgment, especially on boundary anchors.

**Exact v0.9 edit:** For each subjective criterion, require a citation to a
named observable: an item-to-instruction trace, a failed task-expression check,
a novice answer to “focus / changed / next,” a browser assertion, or a
dimension-specific gold anchor. State that enforcement remains disabled until
an owner sets calibration sample, repeatability, false-pass, and adjudication
criteria; do not invent those thresholds in v0.9.

### I-05 — The candidate-anchor schema cannot enforce the advertised 36-anchor design

**Evidence:** The schema enforces only an array length of 36
(`tests/evals/lesson-quality/anchors/anchor-set.schema.json:50-57`), simple
ID patterns (`:88-106`), and unconstrained facts/findings arrays
(`:119-180`). It does not enforce one pass/fail/boundary triple per dimension,
unique anchor IDs, nonempty blocking facts for clear failures, or source-hash
membership in `baseline_revisions`.

**Risk:** A syntactically valid fixture can omit a dimension, duplicate an ID,
or call a clear failure without a blocking fact.

**Exact v0.9 edit:** Add a separate fixture invariant test (or a later
adjudicated-schema rule) for all four conditions above. Do not change the
candidate data or infer missing facts.

### I-06 — The rubric mixes a concise decision standard with an unimplemented harness blueprint

**Evidence**

- The rubric calls itself a non-enforcing planning draft
  (`key-docs/lesson-quality-rubric.md:3-8`) but embeds storage layout, manifest
  fields, branch matrices, browser profiles, and receipt content
  (`:676-920`).
- It then says the implementation details and scored-report contract remain
  planning work (`:1044-1063`).
- A source analysis incorrectly calls the draft rubric “the definitive executable
  quality gate” (`key-docs/lesson-quality-sources/spec-exemplars-analysis.md:10-17`).

**Risk:** The rubric is too long to apply consistently yet too incomplete to
implement. Its own secondary analysis can cause agents to treat planning prose
as a live gate.

**Exact v0.9 edit:** Keep only evidence minimums, revision identity, and the
verdict algorithm in the rubric. Move storage paths, browser profile matrices,
report schemas, and receipt wire shapes to named protocols. Amend the source
analysis to call the rubric a non-enforcing candidate standard until its
enforcement prerequisites exist.

## Minor findings

### M-01 — Spec 04 version/date claims are stale within the same document

The header says `0.4-candidate` dated July 27
(`docs/design/04-V3-LESSON-AUTHORING-QUALITY-AND-UI.md:3-8`), while the
changelog describes `0.5-candidate` on July 28 and says its changes require a
new decision-register hash (`:42-54`). Use one version/status line and one
commit or subject hash before any rubric cites Spec 04.

### M-02 — X05 conflates WCAG conformance with a stricter product target

X05 makes a 48 CSS px product target blocking “unless a documented exception
applies” (`key-docs/lesson-quality-rubric.md:600-616`), while Spec 04 separately
uses WCAG rules plus a product target and documented exceptions
(`docs/design/04-V3-LESSON-AUTHORING-QUALITY-AND-UI.md:2023-2037`).
State separately which WCAG 2.2 AA minimum is mandatory, whether 48 px is a
product standard, who may grant its exception, and whether a missed product
target is blocking or non-blocking.

### M-03 — `BLOCKED` names three different things

The word can mean a rubric verdict (`key-docs/lesson-quality-rubric.md:76-86`),
a route applicability state
(`docs/design/04-V3-LESSON-AUTHORING-QUALITY-AND-UI.md:607-625`), and an
honest learner-runtime terminal disposition
(`key-docs/lesson-quality-rubric-anchors.md:261-278`). Prefix them as
`evaluation_verdict`, `route_applicability`, and `runtime_terminal_disposition`
in prose and future records.

## Re-evaluation of prior anchor-review material

No reviewed artifact in the audited scope contains an earlier finding list
explicitly labelled **Critical** or **Important**. Therefore no prior severity
can be carried forward as an established result.

| Prior material | Re-evaluation | Status now |
| --- | --- | --- |
| Suspected Lesson 3 role-mislabelling | The rubric and derived analysis explicitly retract it: the records were intentional re-entries (`key-docs/lesson-quality-rubric.md:954-955`; `key-docs/lesson-quality-sources/spec-exemplars-analysis.md:10-13`). | Does not remain. Not an anchor. |
| Retired-preview repair without fresh re-entry and ignored `repairNodeId` | The historical analysis documents both defects (`key-docs/lesson-quality-sources/historical-previews-analysis.md:59-63`, `:133-157`). | Remains only as historical candidate-source evidence; not a current lesson verdict or gold anchor. |
| Retired-preview missing browser/AT/recovery evidence | The historical analysis documents missing evidence and says previews would be blocked (`key-docs/lesson-quality-sources/historical-previews-analysis.md:77-81`, `:183-209`). | Remains a source-level `BLOCKED` condition for previews only. |
| Current L1–L3 candidate FAIL/PASS/BOUNDARY proposals | All are still candidate hypotheses. Their sources may be inspectable, but no required human receipt exists and the candidate schema cannot contain one. | No proposal is confirmed, promoted, or given a severity. |

## Proposed concise v0.9 outline

1. **Status, authority, and nonclaims**
   Identify the structural contract, the mastery contract, the route-proof source,
   and the explicit non-enforcing status.

2. **One vocabulary and result algorithm**
   Define `PASS | FAIL | BLOCKED`, evidence/finding namespaces, severity mapping,
   precedence, and the fixed `dimension_result` output.

3. **Route applicability and evaluation unit**
   Define the four-route universe, source of applicability, revision identity, and
   lesson-level aggregation.

4. **Twelve concise dimension cards**
   Give each card the same five subheadings, one non-blocking boundary, a primary
   defect owner, and cross-references that do not double-count a root cause.

5. **Evidence minimums and reviewer matrix**
   State minimum evidence by card, independent roles/cardinality, and what creates
   a typed blocker. Link—not duplicate—the browser, accessibility, receipt, and
   storage protocols.

6. **Anchor lifecycle and calibration**
   Separate source inspection from adjudication evidence; keep all current records
   candidate-only; define a later gold schema and explicit owner-set acceptance
   criteria before enabling a judge.

7. **Open decisions and implementation boundary**
   List only decisions that affect rubric use, link the authoritative status
   record, and prohibit implementation-state counts from serving as durable
   normative claims.

## Rewrite gate

Do not begin a single-scribe v0.9 rewrite until owners resolve C-01 through C-04:
the result model, anchor evidence semantics, mastery/transfer authority, and
route universe. Once those are decided, the outline above is small enough for a
single-scribe documentation rewrite without changing canonical lessons, anchors,
protocols, code, tests, or configuration.
