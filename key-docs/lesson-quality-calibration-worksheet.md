# Lesson Quality Calibration Worksheet

**Status:** TEMPLATE + OWNER POLICY CALIBRATION — NO GOLD ANCHOR APPROVALS
**Worksheet version:** `0.3`
**Date:** 2026-08-03 · **Supersedes:** `0.2` (cross-document correction wave) · `0.1` (pinned to rubric `0.4 planning draft`)
**Rubric authority:** [`lesson-quality-rubric.md`](./lesson-quality-rubric.md), version `0.9.1`
**Anchor catalog:** [`lesson-quality-rubric-anchors.md`](./lesson-quality-rubric-anchors.md), version `0.9.1-candidate`
**Evidence detail:** [`lesson-quality-evidence-protocol.md`](./lesson-quality-evidence-protocol.md)

## 0. Owner product/pedagogy calibration record

**Decision date:** 2026-08-03
**Decision role:** `PRODUCT_PEDAGOGY_OWNER`
**Decision scope:** proposed pass/fail/boundary policy lines, not exact-input anchor
adjudication
**Result:** all 12 dimension lines approved without requested changes

- `LQR-C01`: approved the new-solution-path transfer line and the SME-blocked
  graph-construct boundary.
- `LQR-C02`: approved complete teaching-to-demand traceability and the four-part
  low-stakes discovery exception.
- `LQR-C03`: approved distinct observable distractors and the observation-versus-trait
  inference boundary.
- `LQR-C04`: approved stated scoring conventions and the unique-defensible-answer
  qualifier boundary.
- `LQR-C05`: approved fresh functional re-entry after repair and honest bounded
  assistance.
- `LQR-C06`: approved solution-trace-grounded DOK labels and human blocking at a
  genuine adjacent-level classification boundary.
- `LQR-X01`: approved authored-meaning fidelity and non-blocking treatment of
  meaning-preserving heading drift.
- `LQR-X02`: approved focused scored screens and failure when unrelated controls
  compete for primary-action priority.
- `LQR-X03`: approved observable, actionable feedback and the low-stakes versus
  consequential brevity boundary.
- `LQR-X04`: approved KC-revealing interaction and the no-interaction-quota boundary
  when static equivalents are complete.
- `LQR-X05`: provisionally approved the accessible-name and native-control boundary
  while preserving every independent accessibility-evidence and specialist blocker.
- `LQR-X06`: approved retrying the failed transition and an honest return-to-curriculum
  as an acceptable non-dead-end boundary.

This record satisfies the plan's owner-level product/pedagogy calibration step. It
does not populate `review_receipts[]`, `human_verdict`, or `gold_verdict`; it does not
make any design-only pair runnable. Required domain, blind-solve, novice,
accessibility, reliability, source-rights, fixture, hash, browser, and assistive-
technology evidence remains governed by the rubric and catalog.

## 1. Use and present boundary

Copy this worksheet once per exact calibration example. It records source identity,
rights-safe use, proposed and human decisions, the blocking boundary, disagreements,
review receipts, and later version follow-up.

This worksheet does not create a gold anchor. No evaluator service, calibration
harness, quality gate, or automatic promotion workflow exists. All 36 anchor-set
`0.9.1-candidate` records remain `CANDIDATE_PENDING_REVIEW` with `gold_verdict: null`
and empty `review_receipts[]`; do not fill a human receipt or promote a lifecycle
state without the named qualified reviewer.

**What the completed anchor set would and would not be.** It is a _discrimination
smoke set_: enough to tell whether a judge separates a clear pass from a clear fail and
behaves sanely at a known boundary. It is not a false-pass rate estimator. Its cases are
hand-built to be decidable and to isolate one dimension each, so they are not a sample
of the lesson population; a rate computed over them describes the anchor set, not the
lessons. Write no sentence in a completed worksheet that reports an agreement figure as
a property of the judge's behaviour on real lessons.

## 2. Shared verdict and version contract

Every non-null value in a field named `*_verdict` uses exactly (rubric §2.2):

- `PASS` — every blocking criterion is demonstrated; non-blocking findings may remain.
- `FAIL` — at least one blocking (`CRITICAL`) defect is demonstrated.
- `BLOCKED` — required evidence is absent, contradictory, stale, contaminated, or not
  bound to the exact example revision.

Decision order is: demonstrated blocking defect → `FAIL`; otherwise missing or
materially uncertain evidence → `BLOCKED`; otherwise all blocking criteria must be
demonstrated for `PASS`. Precedence is `FAIL > BLOCKED > PASS`. There is no `N/A`,
score averaging, or compensation. `CRITICAL` means blocking; `NONCRITICAL` means
non-blocking. `REVISE` is an author-side workflow disposition after a `FAIL`; it is
never written into any `*_verdict` field in this worksheet.

Dimension `applicability: NOT_REQUIRED_WITH_PROOF` is non-scoring: it requires a
resolved absence proof, carries normalized `evaluation_verdict: PASS` with empty
blocking and blocker arrays, and is ignored by route and lesson recomputation.

Do not conflate `evaluation_verdict`/`*_verdict` with `route_applicability`
(`APPLICABLE | NOT_APPLICABLE | BLOCKED`) or `runtime_terminal_disposition` (rubric
§2.1) — both use the word `BLOCKED` for an unrelated concept.

An agent's proposal, a blind judge's `route_verdict`, and its scored dimension verdict
are recommendations, not approval. `human_verdict` becomes a gold label only after all required humans approve
the exact input, evidence, rationale, and boundary, and only when
`adjudication_evidence_status: RECEIPTS_COMPLETE`. The proposal fields, `route_verdict`,
scored-dimension verdict, `human_verdict`, and `gold_verdict` are stored separately and
are never merged or back-filled from each other (rubric §8.3). Lifecycle, rights-use,
and review-progress fields are statuses, not verdicts.

**A proposal about a real artifact is a hypothesis, not a verdict.** Worksheet `0.2`
let a candidate record carry `proposed_verdict: PASS` for a real lesson whose rendered
evidence does not exist. Written down, that is a `PASS` for an artifact nobody has
evidence for, sitting in a field named "verdict," in a document whose purpose is to
become a gold label. Two fields replace it:

```text
hypothesized_verdict_under_complete_evidence: PASS | FAIL | BLOCKED | null
  the verdict the proposer expects IF the named missing evidence were supplied and
  showed what the proposer expects; always paired with evidence_still_required[]
actual_verdict_on_available_evidence: PASS | FAIL | BLOCKED | null
  what the rubric algorithm returns on what exists today — for a real artifact with
  no rendered evidence bundle, this is BLOCKED
```

For a real artifact, `actual_verdict_on_available_evidence` is the field that may ever
be promoted. A hypothesis is never promoted, never compared against a judge run, and
never counted as agreement.

Pin the rubric's displayed version and exact SHA-256. Also pin the anchor-set version,
fixture hash, rationale version, prompt version, model/configuration, and evidence
hashes used in each run. A change to any governed byte creates a new calibration
record; decisions do not carry forward automatically.

Finding origin uses the same vocabulary as the author and judge protocols:
`LESSON | RUBRIC | EVIDENCE`. `NONE` marks the absence of a finding and is never
written into a finding record.

## 3. Example identity

```text
worksheet_id:
anchor_id:                          (catalogue identity; NEVER given to a judge)
opaque_case_id:                     (ocid-<32 hex>, single use, minted by the controller)
anchor_set_version: 0.9.1-candidate
candidate_status: CANDIDATE          (restate at every record; never omit)
case_kind: CLEAR_PASS | CLEAR_FAIL | BOUNDARY
source_kind: REAL_ARTIFACT | REAL_DELIVERED_BEHAVIOR | SYNTHETIC_SINGLE_TRANSFORM | DERIVED_EXTERNAL_OBSERVATION
materialization_status: SOURCE_OBSERVABLE | DESIGN_ONLY
pair_runnable: true | false          (see "Pair runnability" below)
pair_runnable_blocker:               (required when pair_runnable is false)
lifecycle_state: CANDIDATE_PENDING_REVIEW | RETIRED_CANDIDATE | GOLD_APPROVED
source_inspection_status:      PRESENT | MISSING | STALE | CONTRADICTORY
adjudication_evidence_status:  NOT_REVIEWED | RECEIPTS_COMPLETE | BLOCKED
hypothesized_verdict_under_complete_evidence: PASS | FAIL | BLOCKED | null
evidence_still_required[]:           (required whenever the hypothesis is non-null)
actual_verdict_on_available_evidence: PASS | FAIL | BLOCKED | null
human_verdict:    PASS | FAIL | BLOCKED | null
gold_verdict:     PASS | FAIL | BLOCKED | null
dimension_id: LQR-___                (the ONE dimension this anchor scores)

rubric:
  path: key-docs/lesson-quality-rubric.md
  version: 0.9.1
  sha256:
  criterion_refs[]:

source_example:
  title_or_description:
  source_lesson_id:
  source_revision_sha256:
  source_artifact_hashes:
  source_refs[]:
  app_git_commit:
  build_id:
  route: STANDARD | CONCISE | MISCONCEPTION | PREREQUISITE_SUPPORT
  runtime_kind: vector | normalized
  build_environment: PRODUCTION_BUILD | STAGING_BUILD | LOCAL_BUILD | PROTOTYPE
  evidence_bundle_sha256:

fixture:
  fixture_ref:
  fixture_sha256:
  rationale_version:
  exact_input_manifest_ref:
  exact_input_manifest_sha256:

synthetic_transform:
  used: true | false
  base_fixture_ref:
  one_transform:
  facts_held_constant[]:
  exclusion_check:
  unintended_differences[]:
```

Identity rules:

- Use one criterion-level example that minimizes unrelated defects.
- A synthetic case changes **one** material fact from a hashed control that both
  variants share byte for byte; a second manual change invalidates the case (rubric
  §8.1). Deterministic derivatives (regenerated hashes, projections, a mechanically
  derived key) are recorded but are not extra transforms.
- Every record names an `exclusion_check` (see below).
- Lesson ID, slug, or title alone is insufficient; include the exact revision/content
  hash. Two retired preview lessons reused production lesson IDs with different
  content, so a citation must always carry a hash or version.
- `route` is required and is one of the four canonical routes. An evaluation is one
  revision on one route (rubric §3.1), so an anchor whose deciding fact is only reachable
  on `MISCONCEPTION` is not an anchor for `STANDARD`, and a case that does not say which
  route it was observed on cannot be reproduced.
- A before/after pair records both hashes and the isolated change.
- Hash or source mismatch is `BLOCKED`, not an invitation to reconstruct the example.

**An anchor scores one dimension.** `dimension_id` names it. A calibration run over
this case compares the judge's verdict on _that dimension only_ against the adjudicated
label. The other eleven verdicts in the same judge record have no gold label here and
must not be counted as agreements, false passes, or errors. Counting them would score
the judge against a label nobody adjudicated.

**Exclusion check: compare inputs and deciding facts, never outputs or verdicts.** The check must
establish that the adjacent dimension's deciding fact is **byte-identical between the
two variants** of the pair, so the isolated change cannot move it:

```text
exclusion_check:
  adjacent_dimension_id:
  adjacent_deciding_fact_locator:     (the exact bytes: JSON pointer, line range, or branch id)
  variant_a_fact_sha256:
  variant_b_fact_sha256:
  identical: true | false             (must be true; the two hashes above must match)
  note:
```

Recording that the adjacent dimension "would also pass" or "is unaffected because its
verdict does not change" is not an exclusion check. Two variants can share a verdict on
a dimension while differing in the facts that produced it, and in that case the isolated
change was not isolated. If `identical` is false, the case does not isolate its
dimension and cannot be promoted.

**Pair runnability.** A boundary case is only meaningful if both sides of the pair can
actually be evaluated. Set `pair_runnable: true` only when every artifact, hash, and
required evidence item for **both** variants exists and is inspectable today. A pair
whose second variant is `DESIGN_ONLY`, or whose rendered evidence does not exist for
either side, is `pair_runnable: false` with a named `pair_runnable_blocker`. Such a case
may be drafted and reviewed, but it cannot enter a calibration run and cannot be
promoted — a pair you cannot run cannot demonstrate that the judge discriminates.

**Candidate status is restated at every record, never inferred.** `candidate_status`
appears in the identity block, in each proposal, in each run-log entry, and in any
summary. A reader who opens the file at one section must be able to see that they are
looking at a candidate without scrolling to a header.

**The catalogue identity never reaches the judge.** `anchor_id`, `case_kind`,
`dimension_id`, `hypothesized_verdict_under_complete_evidence`, `human_verdict`,
`gold_verdict`, and the gold rationale stay controller-side. A judge receives
`opaque_case_id` and the evaluation input, and nothing here. An identifier that encodes
the dimension or the case kind is not opaque.

`source_inspection_status: PRESENT` means the cited source can be inspected; it says
nothing about whether the proposed verdict is right.
`adjudication_evidence_status: NOT_REVIEWED` means adjudication has not begun and
nothing has been declared unavailable; `BLOCKED` means a required evidence item or
specialist receipt is identified as missing, stale, contradictory, or unobtainable.
**Only `adjudication_evidence_status: RECEIPTS_COMPLETE` can support a gold verdict.**
The superseded single field `current_evidence_status: SUFFICIENT | BLOCKED` must not
be used in any new or edited record.

## 4. Rights-safe use

An agent may inventory rights evidence but cannot grant permission. Record the human
rights decision and its exact intended use.

```text
rights_safe_use:
  source_owner_or_copyright_holder:
  source_provenance:
  license_or_permission_basis:
  permission_receipt_refs[]:
  intended_use:
    internal_human_review: allowed | restricted | unknown
    model_calibration: allowed | restricted | unknown
    excerpt_storage: allowed | restricted | unknown
    synthetic_transformation: allowed | restricted | unknown
    external_distribution: allowed | restricted | unknown
  excerpt_boundaries:
  attribution_required:
  retention_or_access_limits:
  learner_or_personal_data_present: true | false
  deidentification_record:
  protected_answers_or_rationales_present: true | false
  protected_handling:
  rights_reviewer_identity:
  rights_reviewer_role:
  rights_receipt_ref:
  rights_use_status: PENDING | PERMITTED | RESTRICTED | PROHIBITED
  unresolved_rights_questions[]:
```

`PENDING`, `RESTRICTED`, or unknown permission keeps the example out of model
calibration and external distribution. Rights-safe handling does not establish the
rubric verdict, and a rubric verdict does not establish rights clearance. A record
derived from external material additionally requires `source_kind:
DERIVED_EXTERNAL_OBSERVATION` (§3) and pairing with an internal or synthetic control
before admission (rubric §9.2).

## 5. Proposed and human verdicts

```text
proposed_decision:
  proposed_by:
  candidate_status: CANDIDATE
  hypothesized_verdict_under_complete_evidence: PASS | FAIL | BLOCKED
  evidence_still_required[]:
  actual_verdict_on_available_evidence: PASS | FAIL | BLOCKED
  proposed_at:
  rationale:
  blocking_facts[]:
  noncritical_findings[]:
  evidence_refs[]:
  uncertainty:
    material: true | false
    reason:
    evidence_needed[]:
  finding_origin: LESSON | RUBRIC | EVIDENCE

blind_judge_decision:
  evaluation_id:
  judge_protocol_version:
  prompt_version:
  model_provider:
  model_id:
  model_configuration:
  route: STANDARD | CONCISE | MISCONCEPTION | PREREQUISITE_SUPPORT
  route_verdict: PASS | FAIL | BLOCKED
  judge_verdict_on_scored_dimension: PASS | FAIL | BLOCKED
  schema_valid: true | false
  evidence_refs_resolved: true | false
  expected_label_visible: false
  label_exposure_detected: true | false
  rationale_ref:

human_decision:
  human_verdict: PASS | FAIL | BLOCKED | null
  gold_rationale:
  blocking_facts[]:
  accepted_noncritical_findings[]:
  adjudicated_at:
  adjudication_receipt_refs[]:
```

A boundary example still receives `PASS`, `FAIL`, or `BLOCKED`; `BOUNDARY` is
`case_kind`, not a verdict. A judge run with label exposure, invalid schema, unresolved
citations, or mismatched identity is invalid and cannot support `human_verdict`. On
promotion, catalog `gold_verdict` must equal the receipt-backed `human_verdict`, and
must equal `actual_verdict_on_available_evidence` — never the hypothesis.

A real artifact whose rendered evidence does not exist has
`actual_verdict_on_available_evidence: BLOCKED`. That is a legitimate anchor: a case
that should be `BLOCKED` and is correctly reported `BLOCKED` tests a real behaviour the
judge must get right. What it cannot be is an anchor whose expected label is `PASS`.

## 6. Rationale and criterion trace

```text
criterion_trace[]:
  criterion_ref:
  criterion_text_sha256:
  applicability:
  required_evidence:
  supplied_evidence_refs[]:
  deciding_fact:
  result: SATISFIED | VIOLATED | UNRESOLVED

rationale_quality:
  states_deciding_fact: true | false
  distinguishes_observation_from_inference: true | false
  addresses_closest_counterexample: true | false
  avoids_model_confidence_as_evidence: true | false
  avoids_approval_or_outcome_claims: true | false
  notes_other_dimension_findings_without_conflation: true | false
```

The rationale must explain why the deciding fact crosses or does not cross a blocking
criterion. It must not rely on the desired label, superficial similarity to another
lesson, or an unsupported claim that a reviewer/tool approved the example.

## 7. Boundary location

Complete this section for every `BOUNDARY` case and whenever reviewers disagree about
severity.

```text
boundary_location:
  blocking_criterion_ref:
  closest_passing_state:
  allowed_noncritical_finding:
  single_fact_that_crosses_the_line:
  first_critical_consequence:
  closest_failing_state:
  paired_or_counterfactual_ref:
  expected_boundary_verdict: PASS | FAIL | BLOCKED
  evidence_that_locates_boundary[]:
  alternative_boundary_considered:
  why_alternative_was_rejected:
```

The boundary must distinguish a `PASS` with a non-blocking finding from a `FAIL` with
a construct-, answer-, route-, evidence-, or accessibility-changing defect. Use
`BLOCKED` when evidence cannot locate that line — never as a hedge for an uncertain
guess (rubric §8.1).

## 8. Lesson defect versus rubric defect

```text
defect_assessment:
  finding_origin: LESSON | RUBRIC | EVIDENCE
  lesson_behavior_or_content_at_issue:
  rubric_text_at_issue:
  higher_authority_ref:
  contradiction_or_ambiguity:
  evidence_gap:
  can_the_current_rubric_decide: true | false
  proposed_owner_role:
  proposed_disposition:
```

Use `LESSON` only when a clear criterion is violated. Use `RUBRIC` when wording is
ambiguous, contradictory, or conflicts with a higher authority. Use `EVIDENCE` when
the truth may be decidable but the required proof is absent or contaminated. Do not
edit lesson content to conceal a rubric defect or edit rubric wording to rescue a
lesson.

## 9. Disagreements and adjudication

Record disagreement rather than collapsing it into majority vote:

```text
disagreements[]:
  disagreement_id:
  issue:
  reviewer_positions[]:
    reviewer_identity:
    reviewer_role:
    reviewer_verdict: PASS | FAIL | BLOCKED
    recorded_before_seeing_other_positions: true | false
    rationale:
    evidence_refs[]:
  concerns_domain_accuracy: true | false
  concerns_construct_identity: true | false
  concerns_accessibility_equivalence: true | false
  concerns_product_or_pedagogy: true | false
  concerns_rights: true | false
  status: OPEN | RESOLVED
  adjudicator_identity:
  adjudicator_role:
  resolution:
  resulting_human_verdict: PASS | FAIL | BLOCKED | null
  receipt_ref:
```

An open disagreement leaves the anchor `CANDIDATE_PENDING_REVIEW`. Product authority
cannot overrule a domain or accessibility requirement outside its qualification.

## 10. Rubric wording-change record

```text
rubric_wording_change:
  change_needed: true | false | undecided
  criterion_ref:
  current_wording:
  observed_problem:
  proposed_wording:
  clarifies_or_changes_intent: CLARIFIES | CHANGES | UNDECIDED
  examples_affected[]:
  dimensions_affected[]:
  proposed_target_version:
  retroactive_relabel_requested: true | false
  required_review_roles[]:
  decision_receipt_refs[]:
  criterion_reference_resolution_check:
    references_checked[]:
    all_resolve_to_printed_bullets: true | false
    checked_at:
```

A worksheet may propose wording but cannot edit or approve the rubric. A rubric change
requires a new rubric version/hash and fresh review of affected examples. Never
retroactively relabel old runs without preserving their original rubric identity.
After any criterion-bullet insertion, deletion, or reorder, re-resolve every
`LQR-*.FAIL.*`, `LQR-*.BLOCKED.*`, and `LQR-*.NB.*` reference in this document family
against the printed bullet it names. Prefer a printed semantic key such as
`LQR-C05.FAIL.DEAD_REPAIR` over an ordinal cross-card reference.

## 11. Required reviewer roles and receipts

The canonical role set is fixed by rubric §7.4 and used identically across this
worksheet and both protocols. Consult the rubric's role-by-dimension matrix for
`minimum_receipts` and `when_required` triggers; do not restate a shorter role list.

```text
required_reviewer_roles[]:
  role: PRODUCT_PEDAGOGY_OWNER | DOMAIN_CONSTRUCT_SME | INDEPENDENT_BLIND_SOLVER
      | ACCESSIBILITY_REVIEWER | NOVICE_WALKTHROUGH_REVIEWER
      | PLATFORM_RELIABILITY_REVIEWER | RIGHTS_REVIEWER
  why_required:
  qualification_requirement:
  minimum_receipts:            (from rubric §7.4 for this dimension)

novice_walkthrough_receipt:          (JUDGE-VISIBLE EVIDENCE; no verdict field)
  reviewer_identity
  reviewer_role: NOVICE_WALKTHROUGH_REVIEWER
  reviewer_is_primary_author: false
  previously_authored_route: false
  previously_walked_route: false
  holds_target_kc: false
  saw_reviewer_only_key_or_rationale: false
  recorded_without_author_coaching: true
  lesson_id
  lesson_revision_id
  lesson_script_content_sha256
  app_git_commit
  build_id
  route: STANDARD | CONCISE | MISCONCEPTION | PREREQUISITE_SUPPORT
  runtime_kind: vector | normalized
  build_environment: PRODUCTION_BUILD | STAGING_BUILD | LOCAL_BUILD | PROTOTYPE
  target_kc_id
  evidence_manifest_sha256
  evidence_refs[]
  screen_answers[]:
    screen_ref
    target_kc_id
    question_what_is_this_screen_asking
    question_what_changed_after_last_action
    question_what_happens_next
    question_what_will_i_be_able_to_do
    purpose_answer_scope: PER_SCREEN | PER_TARGET_KC
    evidence_refs[]
  recorded_at
  receipt_ref

blind_solve_receipt:                 (JUDGE-VISIBLE EVIDENCE; no verdict field)
  reviewer_identity
  reviewer_role: INDEPENDENT_BLIND_SOLVER
  reviewer_is_primary_author: false
  authored_item: false
  saw_key_or_rationale_or_feedback: false
  worked_independently: true
  consulted_other_solvers_before_recording: false
  lesson_id
  lesson_revision_id
  lesson_script_content_sha256
  app_git_commit
  build_id
  route: STANDARD | CONCISE | MISCONCEPTION | PREREQUISITE_SUPPORT
  runtime_kind: vector | normalized
  build_environment: PRODUCTION_BUILD | STAGING_BUILD | LOCAL_BUILD | PROTOTYPE
  item_ref
  evidence_manifest_sha256
  evidence_refs[]
  answer_produced
  answer_judged_defensible_by_solver: true | false
  administration_or_wording_cues_observed[]
  keyless_solution_trace_ref
  recorded_at
  receipt_ref

review_receipts[]:                   (ADJUDICATIONS — never enter judge context)
  receipt_id:
  reviewer_identity:
  reviewer_role:
  qualification_or_authority_ref:
  lesson_revision_id:
  app_git_commit:
  build_id:
  route: STANDARD | CONCISE | MISCONCEPTION | PREREQUISITE_SUPPORT
  runtime_kind: vector | normalized
  build_environment: PRODUCTION_BUILD | STAGING_BUILD | LOCAL_BUILD | PROTOTYPE
  exact_fixture_sha256:
  exact_evidence_manifest_sha256:
  rubric_version:
  rubric_sha256:
  rationale_version:
  verdict: PASS | FAIL | BLOCKED
  independent_of_other_reviewers: true | false
  saw_other_reviewer_verdict_before_recording: true | false
  approved_boundary_statement:
  reservations:
  recorded_at:
  signature_or_receipt_ref:

pre_adjudication_agreement:          (per dimension, recorded BEFORE discussion)
  dimension_id:
  independent_reviewer_count:        (at least two, qualified, non-author)
  independent_verdicts[]:
  agreed_before_discussion: true | false
  disagreement_ref:
  recorded_at:
```

Each `review_receipts[]` entry carries a verdict, which makes that whole array an
**adjudication** record under evidence protocol §6.3: it is never supplied to a judge,
in whole or in part, in any run. This is the opposite handling from the _evidence_
receipts (novice walkthrough, blind solve, SME comparison, Safari + VoiceOver, and
construct equivalence), whose judge-visible shapes contain no verdict field because the
dimensions cannot otherwise reach `PASS`. The two copied shapes above must remain
field-for-field identical to evidence protocol §6.1 and §6.2.

The novice receipt's `holds_target_kc: false`, `previously_authored_route: false`, and
`previously_walked_route: false` are required attestations. This worksheet does not
rename or restaff that role; rubric §10's `PROXY_LEARNER_REVIEWER` naming question
remains open.

**Independent agreement is recorded before discussion, not after.** Two reviewers who
converge after talking have demonstrated that they can reach consensus, which is a
different and much weaker claim than that the criterion is stable enough for two
qualified people to apply it the same way independently. Record each reviewer's verdict
before they see the other's. A criterion where independent qualified reviewers disagree
before discussion is not ready to gate anything, regardless of how the discussion ends.

At minimum, the product/pedagogy owner approves intent; a qualified MCAT/domain SME
approves domain accuracy, construct identity, keys, alternate answers, transfer, and
Depth of Knowledge (DOK) where applicable; **two** independent blind-solver receipts are
required for LQR-C01 and LQR-C04; and a qualified accessibility reviewer approves
accessibility behavior and construct equivalence, including the independent
Safari + VoiceOver receipt required for LQR-X05. A rights reviewer decides permitted
source use before any third-party material is stored, transformed, or distributed
(rubric §7.4, §9.2). One qualified person may hold multiple roles only where
independence is not thereby lost; the primary author cannot be the sole gold approver
for their own example, cannot record its own Safari + VoiceOver receipt, and cannot
serve as either blind solver.

Missing, unqualified, contradictory, or hash-mismatched receipts leave
`human_verdict: null` and lifecycle `CANDIDATE_PENDING_REVIEW`. An unavailable required
specialist is `BLOCKED` — never downgraded, delegated to model judgment, or waived.

## 12. Calibration run log

Gold labels stay outside judge context until each output is immutable.

```text
calibration_runs[]:
  run_id:
  repeat_index:
  opaque_case_id:
  candidate_status: CANDIDATE
  controller_verified_gold_approved: true | false     (must be true to run)
  controller_verified_receipts_complete: true | false (must be true to run)
  controller_attestation_ref:                         (controller-side; never model-emitted)
  pair_runnable: true | false                          (must be true to run)
  rubric_version:
  rubric_sha256:
  anchor_set_version:                 (controller-side only; never in judge context)
  fixture_sha256:
  prompt_version:
  model_provider:
  model_id:
  model_configuration:
  evidence_bundle_sha256:
  app_git_commit:
  build_id:
  route: STANDARD | CONCISE | MISCONCEPTION | PREREQUISITE_SUPPORT
  runtime_kind: vector | normalized
  build_environment: PRODUCTION_BUILD | STAGING_BUILD | LOCAL_BUILD | PROTOTYPE
  expected_label_visible: false
  label_exposure_detected: true | false
  scored_dimension_id:                (the anchor's ONE dimension)
  route_verdict: PASS | FAIL | BLOCKED
  judge_verdict_on_scored_dimension: PASS | FAIL | BLOCKED
  judge_verdicts_on_other_dimensions: RECORDED_UNSCORED
  human_verdict_revealed_after_run: PASS | FAIL | BLOCKED
  result: AGREEMENT | FALSE_PASS | FALSE_FAIL | BLOCKED_ERROR | BOUNDARY_ERROR
  schema_valid: true | false
  repeatability_group:
  notes:
```

Do not populate this section for current candidate anchors as though calibration
occurred. No calibration run has been executed; no gold label exists; no agreement
figure has been measured.

Once eligible gold anchors exist, compare agreement, false passes, false failures,
blocked/boundary errors, and repeatability **by dimension**, scoring only each anchor's
own dimension. Every prerequisite in the run record above must be verified by the
controller before the run, not asserted in the worksheet: a run against a case that is
not `GOLD_APPROVED` with `RECEIPTS_COMPLETE`, or whose pair cannot be run, is not a
calibration run. These verification fields and `controller_attestation_ref` live only
in the controller-side run log; they are never requested from the model, copied from
model output, or treated as proof merely because a JSON object contains them.

Enforcement cannot be inferred from one run, from aggregate accuracy that hides false
passes, or from this set at all without two owner decisions recorded in advance: the
**minimum number of cases per dimension per case kind**, and the **independent
pre-adjudication human agreement** that criterion must reach (§11). Neither number is
set by this document, and neither may be back-filled from a completed run — choosing a
threshold after seeing the results is not a threshold (rubric §8.4).

## 13. Version follow-up

`0.9.1` is the rubric version this worksheet is currently pinned to — it is the live
candidate standard, not a future target. Any later rubric version (`v1.0` or
otherwise) is an unassigned future milestone label, not a claim that a later rubric
exists or is approved.

```text
v0_9_current_follow_up:
  pinned_rubric_version: 0.9.1
  re_review_required: true | false | undecided
  unresolved_boundary_or_wording_issue:
  evidence_to_collect[]:
  anchors_to_pair_or_retire[]:
  owner_role:
  due_or_milestone:
  completion_receipt_ref:

v_next_follow_up:
  target_rubric_version:               (unassigned; do not guess a number)
  carry_forward_candidate: true | false | undecided
  fresh_blind_review_required: true | false
  breaking_criterion_changes[]:
  rights_reconfirmation_required: true | false
  reviewer_reconfirmation_roles[]:
  fixture_or_rationale_migration[]:
  prior_record_preservation_location:
  owner_role:
  completion_receipt_ref:
```

Promotion at `0.9.1` never implies carry-forward to any future version. Preserve the old
worksheet, fixture, verdict, receipts, and hashes; create a new version-bound decision
whenever the rubric, fixture, rationale, rights basis, or required evidence changes.

## 14. Gold-promotion check

Leave lifecycle `CANDIDATE_PENDING_REVIEW` unless every box is evidenced:

```text
[ ] Exact source and fixture identities are pinned and reproducible.
[ ] The example isolates one dimension and, for a synthetic case, one controlled fact.
[ ] The exclusion check compares byte-identical adjacent deciding facts (identical: true).
[ ] pair_runnable is true: both variants exist and are inspectable today.
[ ] Rights use is PERMITTED for the intended calibration/storage scope.
[ ] Required evidence is present, hash-matched, and revision-bound.
[ ] The rationale identifies the deciding fact and blocking boundary.
[ ] Every required qualified reviewer supplied a matching receipt.
[ ] At least two qualified non-author reviewers recorded independent verdicts BEFORE
    discussion, and pre_adjudication_agreement is recorded for the scored dimension.
[ ] All disagreements are resolved in writing.
[ ] human_verdict is PASS, FAIL, or BLOCKED and matches the receipts.
[ ] gold_verdict equals actual_verdict_on_available_evidence, not a hypothesis.
[ ] adjudication_evidence_status is RECEIPTS_COMPLETE.
[ ] The fixture/catalog IDs, hashes, verdict, and rationale version agree.
[ ] The gold label, anchor_id, case_kind, and dimension_id remained hidden from blind
    judge runs; the judge saw only an opaque single-use case ID.
[ ] Version-specific follow-up and retirement conditions are recorded.
```

Only a qualified human adjudication process may then record `GOLD_APPROVED`. An agent
cannot self-promote the example. If any box is false or unknown, record the missing
evidence or decision and keep the candidate out of calibration.
