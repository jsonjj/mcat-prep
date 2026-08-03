# Lesson Quality Author Protocol

**Status:** DRAFT OPERATING PROTOCOL — DOCUMENTATION ONLY, NOT AN IMPLEMENTED SERVICE
**Protocol version:** `0.3`
**Date:** 2026-08-03 · **Supersedes:** `0.2` (cross-document correction wave) · `0.1` (pinned to rubric `0.4 planning draft`)
**Rubric authority:** [`lesson-quality-rubric.md`](./lesson-quality-rubric.md), version `0.9.1`
**Anchor catalog:** [`lesson-quality-rubric-anchors.md`](./lesson-quality-rubric-anchors.md), anchor-set version `0.9.1-candidate` — candidate only, never calibration authority (§2.4)
**Evidence detail:** [`lesson-quality-evidence-protocol.md`](./lesson-quality-evidence-protocol.md)

## 1. Purpose and present boundary

This protocol tells a lesson-authoring agent how to prepare one exact lesson revision
for quality review. No evaluator service, judge runner, calibration harness, CI check,
registration gate, or automatic revise-until-pass service is implemented by this
document. It is a written procedure for a human or an agent to follow by hand; any
claim that following it constitutes a live, executable gate is wrong.

Following this protocol grants no quality approval, domain approval, accessibility
approval, rights clearance, efficacy, mastery calibration, registration, publication,
or rollout authorization.

The author produces artifacts, evidence references, a self-audit, and revisions. A
judge produces a recommendation under the
[`lesson-quality-judge-protocol.md`](./lesson-quality-judge-protocol.md). Qualified
humans retain final authority (rubric §1, §4 Locked decisions — "Human final
authority").

## 2. Shared decision language and version semantics

### 2.1 Namespaces

Do not conflate these three (rubric §2.1):

| Namespace                      | Values                                        | Owner                                              |
| ------------------------------ | --------------------------------------------- | -------------------------------------------------- |
| `evaluation_verdict`           | `PASS` \| `FAIL` \| `BLOCKED`                 | rubric dimension results, self-audit, judge output |
| `route_applicability`          | `APPLICABLE` \| `NOT_APPLICABLE` \| `BLOCKED` | the structural route-proof record (§4.2)           |
| `runtime_terminal_disposition` | honest end state a branch reaches             | the runtime state machine                          |

A blocked `runtime_terminal_disposition` can occur inside a dimension that still
receives `evaluation_verdict: PASS`; it is a product behavior, not a defect, when it
is truthful (rubric LQR-X06). A `route_applicability: BLOCKED` is a missing route
decision, not a demonstrated lesson defect.

### 2.2 The one result algorithm

For every required rubric dimension, in order (rubric §2.2):

```text
1. FAIL    if revision-bound evidence demonstrates at least one blocking defect.
2. BLOCKED if no blocking defect is demonstrated and any required evidence is missing,
           stale, contradictory, unbound to the evaluated revision, self-approved, or
           awaiting a required EVIDENCE role's receipt.
3. PASS    otherwise. A PASS may carry non-blocking findings.
```

Precedence is `FAIL > BLOCKED > PASS`: a demonstrated blocking defect is never hidden
by missing evidence elsewhere. There is no `N/A`, score, average, or compensation
between dimensions. `REVISE` is a workflow disposition issued after a `FAIL`, never an
`evaluation_verdict` value. `PENDING_HUMAN_REVIEW`, `READY_FOR_HUMAN_REVIEW`, and other
`workflow_status` values are statuses, not verdicts.

Step 2 turns on **evidence** roles only (rubric §7.4). A missing novice-walkthrough,
blind-solve, SME construct-comparison, Safari + VoiceOver, or construct-equivalence
receipt blocks the dimension that needs it, because the dimension genuinely cannot be
decided without it. An outstanding `PRODUCT_PEDAGOGY_OWNER` _approval_ does not, because
approval is the act that comes after the assessment. Protocol `0.2` conflated the two
and made `PASS` unreachable by construction: the owner cannot approve until the
assessment is complete, and the assessment could not complete until the owner approved.

_Blocking_ (`CRITICAL`) means the defect can teach the wrong construct, mismeasure
learning, mislead the learner, fail an applicable route, or deny meaningful access.
_Non-blocking_ (`NONCRITICAL`) means localized and unable to change construct, answer,
route, evidence meaning, or accessibility. No other severity word changes a verdict.

**Route output versus lesson aggregate (rubric §2.4).** One author self-audit and one
judge invocation each cover one exact route:

```text
route_verdict      PASS | FAIL | BLOCKED   recomputed from REQUIRED dimensions on this route
```

`route_verdict` uses the same `FAIL > BLOCKED > PASS` precedence as a dimension and
ignores every `NOT_REQUIRED_WITH_PROOF` result. The author and judge model do not emit
`lesson_verdict`, `human_gate_status`, `approval_withheld`, or `approval_blockers`.
Only a trusted controller may create those fields in `lesson_rollup`, after exactly one
accepted route record exists for every `APPLICABLE` route. Until that set is complete,
there is no lesson aggregate to drive the revise loop.

`PASS` in an author self-audit is a proposal about the pinned criteria, never human
approval.

### 2.3 `dimension_result` — one fixed contract, carried in an envelope

Every dimension result recorded by this protocol (self-audit or otherwise) uses
exactly the ten fields the rubric defines, and gains none (rubric §2.3):

```text
dimension_id
applicability             REQUIRED | NOT_REQUIRED_WITH_PROOF | BLOCKED
evaluation_verdict
blocking_findings[]
non_blocking_findings[]
evidence_refs[]
blocker_refs[]
required_remediation[]
required_human_roles[]
human_decision
```

The author's own working notes — which criteria were checked, why, and what remains
uncertain — are real and must be recorded, but they are not part of the result. Package
them beside it (rubric §2.5):

```text
self_audit[]:
  result:    the exact ten fields above
  analysis:  criteria_assessed[], rationale, uncertainty
```

`applicability` is a closed enum. `NOT_REQUIRED_WITH_PROOF` requires a named absence
proof in `evidence_refs[]` — it is the dimension-level analogue of a route absence
proof, and an author asserting "not applicable" without one is self-certifying. It is
non-scoring, carries normalized `evaluation_verdict: PASS`, has empty blocking and
blocker arrays, and is ignored by route and lesson recomputation.
An applicability of `BLOCKED` requires a named blocker, carries normalized
`evaluation_verdict: BLOCKED`, and blocks the route recommendation until the
applicability question is resolved.

Every finding (in either array) carries:

```text
finding_id
origin: LESSON | RUBRIC | EVIDENCE
criterion_ref            stable ID, e.g. LQR-C05.FAIL.DEAD_REPAIR (rubric §6.0)
description
evidence_refs[]          at least one
remediation
owner_role               one of the seven canonical roles (§3.1)
root_cause_id
owner_dimension_id       the owner rubric §5 assigns
finding_disposition: PRIMARY | NON_COUNTING_CROSS_REFERENCE
primary_finding_id       required when NON_COUNTING_CROSS_REFERENCE
```

`origin: NONE` is not a finding value. It marks the absence of a finding, and a finding
that asserts no defect is not a finding. A suspected rubric defect is recorded as
`origin: RUBRIC` and, when material, produces `BLOCKED`; it is never resolved by
silently changing the lesson or the rubric, and it never appears in
`blocking_findings[]`, because a rubric defect is not a lesson failure.

Exactly one record per `root_cause_id` is `PRIMARY` and may block. Every other record
of that same root cause is a `NON_COUNTING_CROSS_REFERENCE` naming the primary. Without
these two fields, rubric §5's "one root defect, one blocking owner" rule is a sentence
nobody can check.

### 2.4 Anchors are never calibration authority

Anchors are pinned at anchor-set version `0.9.1-candidate`. Every record in that catalog
is `CANDIDATE_PENDING_REVIEW`, has `human_verdict: null` and `gold_verdict: null`, and
carries an empty `review_receipts[]`. **No candidate anchor — regardless of its
`source_inspection_status` — is calibration authority, and none may gate, score, or
justify a verdict for any real lesson.** The two candidate-readiness statuses are kept
separate and must never be read as one field (rubric §8.2):

```text
source_inspection_status:      PRESENT | MISSING | STALE | CONTRADICTORY
adjudication_evidence_status:  NOT_REVIEWED | RECEIPTS_COMPLETE | BLOCKED
```

The superseded single field `current_evidence_status: SUFFICIENT | BLOCKED` must not
be read, written, or inferred anywhere in this protocol's output. Only
`adjudication_evidence_status: RECEIPTS_COMPLETE` on a `GOLD_APPROVED` record could
ever support a gold label, and no such record exists today. An anchor may enter author
context only after its exact record is `GOLD_APPROVED` with all required receipts; the
rubric remains authoritative if an anchor and a criterion ever disagree.

## 3. Exact context order

Load and preserve context in this order. Do not let later, lower-authority material
override earlier contracts.

1. The controlling task, its write scope, and this protocol.
2. [`autonomous-lesson-authoring-context.md`](./autonomous-lesson-authoring-context.md).
3. `curriculum/v3/v3-lesson-authoring-manifest.json` and the frozen per-lesson task
   packet derived from it.
4. The structural contract, in this order:
   1. [`05-LESSON-STRUCTURAL-AUTHORING-SPEC.md`](../docs/design/05-LESSON-STRUCTURAL-AUTHORING-SPEC.md);
   2. [`06-LESSON-AUTHORING-WORKFLOW.md`](../docs/design/06-LESSON-AUTHORING-WORKFLOW.md);
   3. [`template/v3-les-000000/README.md`](../docs/lesson-authoring/template/v3-les-000000/README.md);
   4. every JSON file in that template directory.
5. The evidence and mastery contract, then the reasoning-operation vocabulary:
   1. [`lesson-evidence-mastery-contract.md`](../docs/lesson-evidence-mastery-contract.md);
   2. [`MCAT-skills`](./MCAT-skills).
6. The exact pinned [`lesson-quality-rubric.md`](./lesson-quality-rubric.md), version
   `0.9.1`, and its companion
   [`lesson-quality-evidence-protocol.md`](./lesson-quality-evidence-protocol.md) for
   evidence-manifest and branch-matrix detail.
7. `GOLD_APPROVED` anchors for the pinned anchor-set version, if any exist. Anchor-set
   `0.9.1-candidate` has none (§2.4). Do not load expected labels for a blind judge run.
8. The source packet, rights/permission records, qualified SME decisions, and product
   constraints applicable to this lesson.
9. The exact draft artifact bundle, protected reviewer-only material, runtime
   projection, and revision-bound browser evidence available for review.

Conflict resolution follows the same authority boundary as the rubric (§1): the
validator governs R1–R15 structure; the evidence/mastery contract governs evidence
meaning; the rubric governs lesson quality; qualified humans adjudicate domain,
accessibility, rights, and rubric-boundary questions. Examples and existing lessons do
not override any contract. Cite
[`04-V3-LESSON-AUTHORING-QUALITY-AND-UI.md`](../docs/design/04-V3-LESSON-AUTHORING-QUALITY-AND-UI.md)
only as a candidate design source with an exact commit or subject hash, never as
authority (rubric §1).

**Warning — Spec 05 §4 evidence prose is superseded for evidence meaning.** Item 4.1
above loads the structural spec before item 5 loads the evidence and mastery contract,
which is correct for _structure_: Spec 05 governs the shape of the artifacts and the
R1–R15 rules. But Spec 05 §4 also describes what evidence _means_ — which responses
count, what independence implies, what moves mastery — and that prose predates the
Lesson → Evidence → Mastery Contract and no longer matches it. Where the two differ on
the meaning, sufficiency, independence, or mastery consequence of a response, **the
mastery contract wins and Spec 05 §4 is read as historical context only.** Do not
resolve the conflict by loading order: a lower-authority document read earlier does not
override a higher-authority document read later, which is precisely why this section
says "do not let later, lower-authority material override earlier contracts" rather
than "later wins." Record any specific divergence you rely on as a document/
implementation divergence under §6, rule 9.

### 3.1 Ownership and reviewer roles

All twelve rubric dimensions are retained; each root cause is owned once (rubric §5).
Do not file a second blocking finding for the same root defect under a dependent
dimension — record a non-counting cross-reference there instead, carrying the same
`root_cause_id` and naming the primary finding. Consult rubric §5 for the ownership
table and the six boundaries that previously double-counted: C01/C02, C02/X01, C03/C04,
C05/X03, X01/X02, and X05/X06.

Canonical reviewer roles (rubric §7.4), used consistently across this protocol, the
judge protocol, and the calibration worksheet:

```text
evidence_roles:  DOMAIN_CONSTRUCT_SME, INDEPENDENT_BLIND_SOLVER, ACCESSIBILITY_REVIEWER,
                 NOVICE_WALKTHROUGH_REVIEWER, PLATFORM_RELIABILITY_REVIEWER, RIGHTS_REVIEWER
decision_roles:  PRODUCT_PEDAGOGY_OWNER, and any role acting as approver
```

These seven names are the only legal values of `owner_role` and `required_human_roles[]`
in this protocol's output. Older artifacts under `key-docs/lesson-quality-report/` use
superseded spellings (`NOVICE_CLARITY_REVIEWER`, `SOURCE_RIGHTS_REVIEWER`,
`ACCESSIBILITY_CONSTRUCT_EQUIVALENCE_REVIEWER`); rubric §7.4 carries the alias map for
reading them. Do not emit a legacy name in new output and do not rewrite the legacy
artifacts to match.

The rubric's role-by-dimension matrix, minimum receipt counts, and "when required"
triggers (rubric §7.4) are authoritative; do not restate a shorter or different role
list elsewhere. An unavailable required **evidence** specialist makes the dimension
`BLOCKED` — never downgraded to a non-blocking finding, delegated to model judgment,
waived, or satisfied by an automated scan. An outstanding **decision** role withholds
lesson approval and appears in `required_human_gates[]`; it does not block a dimension.
The primary author of the evaluated content may not be its sole approver, may not
record its own Safari + VoiceOver receipt, may not serve as either independent blind
solver, and may not be the novice walkthrough reviewer for their own lesson.

## 4. Input contract

The controller must supply or resolve the following immutable task packet before
authoring:

```text
request_id
requested_name
lesson_id
grouping_id
curriculum_manifest_sha256
phase_placements[]:
  phase_id
  source_relation_ids[]
module_placements[]:
  module_id
  source_relation_ids[]
pathway_placements[]:
  pathway_id
  source_relation_ids[]
sequence_positions[]:
  scope_id
  position
  source_relation_ids[]
ordered_kc_ids[]
kc_competency_and_scope[]
kc_non_goals[]
hard_prerequisites[]
helpful_context[]
attachments[]
source_anchors[]
open_holds[]
reasoning_operations[]
route_universe: [STANDARD, CONCISE, MISCONCEPTION, PREREQUISITE_SUPPORT]
route_proofs:                     (object, exactly four named members)
  STANDARD:             { route_applicability, absence_proof_ref, blocker_ref, evidence_refs[] }
  CONCISE:              { same shape }
  MISCONCEPTION:        { same shape }
  PREREQUISITE_SUPPORT: { same shape }
required_human_review_roles[]
source_records[]:
  source_id
  source_locator
  permitted_use
  rights_status
  permission_receipt_refs[]
rubric_path
rubric_version
rubric_sha256
anchor_set_version
output_directory
max_revision_cycles
```

### 4.1 Placement is a projection, never inferred truth

A lesson's phase, module, pathway, and sequence placement are **generated views**
(`placement_projection`, `not_independent_truth: true` in the curriculum manifest),
derived from named `source_relation_ids` (for example `R14-PM-01`), not standalone
facts. Use arrays, not a single inferred `phase`/`module`/`pathway`/`sequence_position`
field: a lesson may appear in more than one placement, and every placement must carry
the exact relation IDs that produced it. Never derive a placement from a lesson title
or from proximity to another lesson.

### 4.2 Route universe and applicability authority

The rubric route universe is exactly `STANDARD`, `CONCISE`, `MISCONCEPTION`, and
`PREREQUISITE_SUPPORT` (rubric §3.2). The **structural route-proof record is the sole
applicability authority** — never reviewer opinion, an empty coverage row, or a
runtime fallback.

`route_proofs` is an **object with exactly those four members**, not a list. A list
cannot express "all four routes were considered": four entries named `STANDARD`
satisfy any list-shaped contract, and three entries look identical to four entries with
one omitted. With a fixed four-member object, an unconsidered route is a missing key,
which is a detectable error rather than a silent gap. Each member carries:

- `APPLICABLE` — the route is evaluated under every relevant dimension. Both
  `absence_proof_ref` and `blocker_ref` are null; `evidence_refs[]` names the structural
  record that establishes the route exists.
- `NOT_APPLICABLE` — requires a non-null `absence_proof_ref` naming an explicit,
  authoritative absence proof. `blocker_ref` is null.
- `BLOCKED` — requires a non-null `blocker_ref` naming the blocker. `absence_proof_ref`
  is null. Blocks lesson-level approval while the route is required.
- A missing member blocks lesson-level approval and is a controller-detectable defect.

**One evaluation is one route.** A single evaluation record covers exactly one exact
revision on exactly one route named in its identity block. A lesson that offers three
applicable routes produces three result sets, held in a rollup beside the shared
`route_proofs` object. Do not average routes, do not report one verdict for a lesson
with several applicable routes, and do not let a `CONCISE` observation decide a
`STANDARD` dimension.

The current three-lane structural check (`concise`, `standard`, `misconception`) is a
baseline structural check only (R9 in the structural spec). It is **not** proof that
`PREREQUISITE_SUPPORT` is absent, complete, or acceptable. Until an owner resolves that
open decision (rubric §10, item 4), treat `PREREQUISITE_SUPPORT` as `BLOCKED` unless a
named, authoritative absence proof exists for this lesson.

`max_revision_cycles` must be a positive finite integer; use `3` when the controller
does not set it. `output_directory` must be an isolated draft location outside
`content/lessons/` until human and integration gates permit movement.

`rehash` and `lesson-validate` accept an explicit draft directory. The current
`proposed-kcs` and `computed-quality` commands sweep `content/lessons/`; they do not
evaluate an isolated draft. Report those draft checks as `BLOCKED_TOOLING_GAP` unless
a reviewed explicit-directory runner exists. Do not move work in progress into the
served catalog or describe a served-catalog report as draft evidence.

Authoring is `BLOCKED` rather than guessed when a requested name is ambiguous; a
canonical identity, KC, relation, prerequisite, source permission, scoring authority,
reasoning operation, or required contract cannot be resolved; or task-packet hashes
do not match the loaded inputs. A title is never authority for IDs, scope, or
placement.

## 5. Draft contract

For each required KC, author a complete route-appropriate teaching microcycle and the
artifacts required by R1–R15. Preserve the declared KC identity, scope, order, and
prerequisites. Do not invent a KC, relation, source permission, scoring rule, or
evidence meaning.

**A complete microcycle, in the sense `LQR-C02` checks.** Structural validation
confirms the required node _kinds_ are present; it cannot confirm they teach. Author
each of these deliberately, because C02 now checks each one and structure alone will
not carry them:

| Element          | What C02 looks for                                                                                                                                    |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Orientation      | what this is about, why it matters here, and what prior knowledge it builds on — before the first demand                                              |
| Expert modelling | at least one worked instance that shows the _selection_ reasoning, not only the executed steps: why this approach, and what ruled the alternative out |
| Fading           | support that decreases across the cycle, so the learner ends less scaffolded than they began                                                          |
| Contrast         | at least one non-example or near-miss that marks the boundary of the concept                                                                          |
| Recap            | a close that consolidates the KC rather than restating the prompt                                                                                     |

Where a route legitimately omits one — a `CONCISE` route may carry no expert modelling —
the omission is a route profile decision that must be recorded and justified against the
declared route, not asserted after the fact to explain what is missing.

**Prerequisites are evidence-bearing claims.** Every declared prerequisite names a
canonical relation ID and its sequence position. For each one, either check it inside
the lesson and support the learner who fails the check, or hand off honestly to the
lesson that teaches it. A prerequisite named without a check and without a handoff is an
unbounded escape hatch: it lets any missing instruction be reclassified as assumed prior
knowledge, which is the single easiest way to make an inadequate lesson look complete.

Keep these boundaries explicit:

- Author metadata describes the task and assistance available. Runtime facts describe
  what was delivered and taken. Server policy alone decides correctness,
  independence, evidence kind, and mastery movement.
- `candidate_evidence_modes` is a permission set, not an outcome. Absence fails closed
  to `INSTRUCTIONAL`; eligible modes and `reasoning_operation` require deliberate,
  reviewable support.
- `activity_role` and exit function are different governed fields. Do not infer one
  vocabulary from free text or relabel an item to manufacture transfer.
- **Instructional transfer is independent of mastery eligibility under Bayesian
  Knowledge Tracing (BKT)** (rubric §4 Locked decisions). A rubric `LQR-C01` transfer
  judgment about construct preservation and substantive situation change never licenses
  `TRANSFER` mode, never infers BKT eligibility from a `CHANGED_EXIT` label, and never
  substitutes for the Lesson → Evidence → Mastery Contract's own decision about whether
  a response can move `pL` — the probability that the learner has reached the learned
  or mastered state for a knowledge component, as the mastery contract defines it.
  Author `candidate_evidence_modes` and `reasoning_operation` as their own deliberate,
  reviewed decision, never as a byproduct of a transfer-validity judgment.
- Worked examples are exposition, not failed attempts. Repair confirmation is process
  evidence, not exit success.
- A changed task must preserve the governed construct while making a substantive
  change. A fresh re-entry must not reuse exposed content or its answer.
- Protected keys, scoring logic, and pre-release rationales remain server-only and
  outside learner-safe projections and browser evidence.

## 6. Evidence discipline

Every quality assertion must cite inspectable evidence using:

```text
evidence_ref
artifact_or_bundle_sha256
path_or_uri
json_pointer_or_line_range_or_branch_id
revision_id
what_the_evidence_demonstrates
```

The exact evidence-manifest fields, consequential branch-matrix minimums, rendered
capture minimums by viewport/zoom/motion/keyboard, and the manual Safari + VoiceOver
receipt requirement are defined once in
[`lesson-quality-evidence-protocol.md`](./lesson-quality-evidence-protocol.md). This
section states only the discipline principles the author must follow:

1. Bind every reference to the exact lesson revision and, for rendered evidence, the
   exact application commit/build, route, `runtime_kind: vector | normalized`,
   `build_environment: PRODUCTION_BUILD | STAGING_BUILD | LOCAL_BUILD | PROTOTYPE`,
   and manifest hash.
2. Separate direct observation from inference. Never invent a file, hash, run,
   reviewer receipt, permission, test result, or browser behavior.
3. Cover every consequential branch (rubric §7.2) — every correct, miss, omission,
   help/reveal, repair, fresh re-entry, repeated-failure, pause/resume, save-error,
   revision-mismatch, and completion path, plus every response encoding. One happy
   path is not branch evidence.
4. Cite protected material only in authorized reviewer context; do not copy it into
   learner-facing or raw browser artifacts.
5. A screenshot proves appearance only. It cannot alone prove focus, keyboard use,
   announcements, dynamic branches, persistence, recovery, or construct equivalence
   (rubric §7.1).
6. Missing, stale, contradictory, self-approved, label-contaminated, or hash-mismatched
   evidence yields `BLOCKED`; prose assurances do not replace evidence.
7. Rights status is evidence for a human rights decision, not an author-granted
   clearance. Unknown or restricted use stops extraction or distribution.
8. Candidate anchors and current lessons may suggest checks but prove neither a
   criterion nor a verdict (§2.4).
9. Report a document/implementation divergence with both locations and the suspected
   defect origin. Do not silently choose whichever is more permissive.

## 7. Draft, revision identity, and self-audit output

Return one revision-bound author record:

```text
author_protocol_version
request_id
revision_id:
  lesson_id
  lesson_script_content_sha256
  artifact_hashes
  app_git_commit
  build_id
  route
  runtime_kind: vector | normalized
  build_environment: PRODUCTION_BUILD | STAGING_BUILD | LOCAL_BUILD | PROTOTYPE
rubric:
  path
  version
  sha256
anchor_set_version
task_packet_ref
source_and_rights_refs[]
artifacts_written[]:
  path
  sha256
structural_validation:
  command
  exit_code
  report_ref
route_proofs:                     (object, four named members — §4.2)
  STANDARD:             { route_applicability, absence_proof_ref, blocker_ref, evidence_refs[] }
  CONCISE:              { same shape }
  MISCONCEPTION:        { same shape }
  PREREQUISITE_SUPPORT: { same shape }
evidence_bundle:
  manifest_ref
  manifest_sha256
  completeness
self_audit[]:                     (one entry per dimension, for the ONE route above)
  result:                         (exactly the ten fields of §2.3)
    dimension_id
    applicability: REQUIRED | NOT_REQUIRED_WITH_PROOF | BLOCKED
    evaluation_verdict: PASS | FAIL | BLOCKED
    blocking_findings[]:
      finding_id
      origin: LESSON | RUBRIC | EVIDENCE
      criterion_ref
      description
      evidence_refs[]
      remediation
      owner_role
      root_cause_id
      owner_dimension_id
      finding_disposition: PRIMARY
      primary_finding_id: null
    non_blocking_findings[]:
      (same shape; finding_disposition may be NON_COUNTING_CROSS_REFERENCE
       with a non-null primary_finding_id)
    evidence_refs[]
    blocker_refs[]
    required_remediation[]
    required_human_roles[]
    human_decision: null
  analysis:
    criteria_assessed[]
    rationale
    uncertainty:
      material: true | false
      reason
      evidence_needed[]
route_recommendation:
  route_verdict: PASS | FAIL | BLOCKED
  derivation: ANY_REQUIRED_DIMENSION_FAIL | ANY_REQUIRED_DIMENSION_BLOCKED
              | ANY_DIMENSION_APPLICABILITY_BLOCKED
              | ALL_REQUIRED_DIMENSIONS_PASS
workflow_status: PENDING_HUMAN_REVIEW | BLOCKED
required_human_gates[]
unresolved_decisions[]
```

Evaluate all 12 dimensions using the `dimension_result` contract (§2.3), for the one
route this record covers. If rendered evidence does not exist for the exact revision,
the applicable `LQR-X*` dimensions are `BLOCKED`; do not infer them from a presentation
plan. A null application commit or build ID is stronger: it creates
`APPLICATION_IDENTITY_NULL`, voids the route record as a global precondition failure,
and forces all twelve dimensions `BLOCKED`.

`route_verdict` follows rubric §2.4 with precedence `FAIL > BLOCKED > PASS`. A required
dimension that `FAIL`s makes this route `FAIL`; otherwise a dimension with
`applicability: BLOCKED` or a required dimension with `evaluation_verdict: BLOCKED`
makes it `BLOCKED`; otherwise it is `PASS`. A
`NOT_REQUIRED_WITH_PROOF` dimension is ignored. Record which rule fired in
`route_recommendation.derivation`.
Use `ANY_DIMENSION_APPLICABILITY_BLOCKED` for unresolved applicability and
`ANY_REQUIRED_DIMENSION_BLOCKED` only for a dimension already established as required.

The controller-generated `lesson_rollup.human_gate_status.required_roles[]` carries a
receipt count, not just a role name, because two dimensions need **two** independent
blind-solve receipts (rubric §7.4). A bare role array cannot distinguish "one solver
has reported" from "both have," and the difference decides whether `LQR-C01` and
`LQR-C04` are `BLOCKED`.

A self-audit `PASS` remains proposed, and `workflow_status` remains
`PENDING_HUMAN_REVIEW`. The route record contains no approval field. A trusted
controller may create the rubric §2.4 `lesson_rollup` only after every `APPLICABLE`
route has one accepted route record; whenever that rollup has
`approval_withheld: true`, its `approval_blockers[]` must be nonempty. No such
controller is implemented today, so current output reports the blocker and does not
fabricate a lesson rollup.

## 8. Responding to judge findings

For every judge finding:

1. Reproduce the cited condition against the pinned revision.
2. Record `ACCEPT`, `CHALLENGE_WITH_EVIDENCE`, or `REFER_TO_HUMAN` as a finding
   disposition; these are dispositions, not verdicts.
3. If `origin: LESSON`, revise the smallest coherent unit that fixes the cause and
   recheck all affected dimensions and branches.
4. If `origin: EVIDENCE`, obtain or recapture the missing revision-bound evidence;
   do not edit lesson content merely to make the gap disappear.
5. If `origin: RUBRIC`, preserve the lesson and criterion text, document the ambiguity
   or contradiction, and stop for human adjudication. An author never edits the rubric
   as part of a lesson revision.
6. Resolve every finding in `blocking_findings[]` before proposing `PASS`. A finding in
   `non_blocking_findings[]` may remain only with an owner, remediation, and human
   visibility.
7. Do not weaken criteria, change a key without SME review, broaden accepted answers
   without scoring review, relabel evidence, expose a fresh answer, or suppress an
   evidence branch to obtain a more favorable verdict.

Any content change creates a new lesson revision and invalidates its prior route
records and any controller-generated lesson rollup. Any learner-visible implementation
or route change requires new rendered evidence. Preserve finding lineage from old
revision to new revision, but never copy an old verdict forward.

## 9. Finite revise-until-pass loop

One cycle is one complete set of route recommendations on one exact revision. Run at most
`max_revision_cycles` (default `3`):

1. Freeze and identify the draft revision; rehash and run structural validation.
2. Produce the 12-dimension self-audit for each applicable route, the four-member route
   proof object, and the evidence inventory.
3. Obtain one `judge_recommendation.route_verdict` per `APPLICABLE` route using the
   judge protocol, if judge invocations are available; otherwise stop
   `PENDING_HUMAN_REVIEW`.
4. A trusted controller creates `lesson_rollup` only after every `APPLICABLE` route has
   exactly one accepted, identity-matched record. If any is missing, stop with the
   named rollup blocker; do not synthesize a lesson verdict from a partial set.
5. If `lesson_rollup.lesson_verdict` is `PASS`, stop revising and enter the human gates.
   A route `PASS` while another route is `FAIL` or `BLOCKED` is not a lesson pass.
6. If `FAIL`, revise only accepted lesson-origin defects, mint a new revision identity,
   rerun every invalidated check, and begin the next cycle.
7. If `BLOCKED`, obtain the named input/evidence or stop. A blocked cycle is not
   converted to a pass by further prose.
8. At the cycle limit, stop with unresolved findings and request human adjudication.
   A human may authorize a new finite budget after resolving the cause; the author may
   not silently reset the counter.

## 10. Human stop gates

Stop and preserve the exact revision whenever any of these applies:

- canonical identity, scope, prerequisite, relation, or hold disposition is missing or
  disputed;
- a new/changed KC, curriculum relation, evidence vocabulary, or mastery-policy change
  would be required;
- domain accuracy, construct identity, key, alternate answer, Depth of Knowledge (DOK),
  or transfer validity needs qualified SME judgment (`DOMAIN_CONSTRUCT_SME`);
- rights or permitted source use is unresolved (`RIGHTS_REVIEWER`);
- an accessible alternative or construct-equivalence claim needs qualified review
  (`ACCESSIBILITY_REVIEWER`);
- a rubric boundary, rubric defect, reviewer disagreement, or hidden-label
  contamination is material;
- required evidence cannot be bound to the revision;
- a required route has no `APPLICABLE` proof and no authoritative absence/blocker
  record;
- the finite revision budget is exhausted;
- all dimensions are proposed `PASS` and human product/pedagogy
  (`PRODUCT_PEDAGOGY_OWNER`), domain, accessibility, rights, or publication decisions
  remain; or
- registration, publication, efficacy, mastery calibration, readiness, score
  improvement, rollout safety, or learner validation would be claimed.

## 11. Prohibited claims

The author must not state or imply that:

- structural validation proves instructional quality;
- a self-audit or judge recommendation is approval;
- completion proves learning, mastery, readiness, efficacy, or score improvement;
- an authored evidence label proves independence or moves mastery;
- a rights-safe-looking excerpt is rights-cleared;
- a candidate anchor is gold, calibration-ready, or the judge is calibrated;
- browser behavior, accessibility, recovery, or branch coverage was tested when no
  revision-bound evidence exists;
- a quality evaluator service, calibration harness, automatic gate, approval
  workflow, registration integration, or generation pipeline exists when it does not —
  this protocol is documentation only; or
- a verdict for one revision approves another.

The honest terminal output is a revision-bound review package with proposed
`PASS`/`FAIL`/`BLOCKED` verdicts, explicit evidence, unresolved human gates, and no
approval claim.
