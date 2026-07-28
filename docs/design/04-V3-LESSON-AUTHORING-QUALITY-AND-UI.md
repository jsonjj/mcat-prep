# V3 Lesson Authoring Quality and UI

## Normative companion specification

**Status:** Candidate normative authoring standard; pending independent re-audit and validation of
the five designated golden candidates  
**Version:** 0.3-candidate  
**Date:** July 27, 2026  
**Audience:** Curriculum authors, subject-matter reviewers, instructional designers, question and
evidence reviewers, source and rights reviewers, designers, accessibility reviewers, engineers,
analytics reviewers, and release integrators  
**Scope:** Converting one canonical V3 lesson shell into an immutable lesson script, KC coverage
proof, presentation plan, quality report, and reviewed learner experience  
**Implementation claim:** None. Current lesson-viewer pilots and renderer fixtures are quarantined
design inputs, not conforming `LessonDefinition` records.  
**Approval claim:** None. This revision has not passed the next defect-first audit, the W00 trust
gate, learner validation, rights clearance, or production approval.

Only the existing five quarantined pilot implementations and explicitly noncanonical renderer
fixtures may continue pre-W00 visual investigation. No later canonical internal or production
authoring wave may start until the signed foundation, trust, and W00 prerequisites in §10.3 are
verified. The remaining 109 production jobs MUST NOT claim Spec 04 compliance before that point.

### Changelog

| Version         | Date          | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| --------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `0.3-candidate` | July 27, 2026 | Added the Lesson → Evidence → Mastery Contract to the authority order (§1.2); added the mastery-seam author-time metadata closure and Spec 04 ↔ seam key correspondence (§5.1.7); added the conditional `reasoning_operation` / optional `dok_level` rule and the `learner_operation` distinction (§5.1.8); added a complete worked binding example (§5.1.9); clarified that `question_evidence_plan` is aggregate review evidence and not a mastery award (§5.1.5); added gate checks `QEV-006` and `QEV-007` (§7.1); added compile rejections and no-default rules (§9.2); added lesson-rollup and instructional-only-evidence boundaries (§9.4); added three author checklist rows (Appendix A). |
| `0.2-candidate` | July 23, 2026 | Prior candidate normative authoring standard.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |

Per §10.5, this normative change requires a new decision-register hash and invalidates dependent
subjects and receipts. The Appendix E fixture predates the §5.1.7 closure and is therefore
non-conforming under 0.3-candidate until it is regenerated; its embedded digests MUST be recomputed
by the pinned canonicalizer, never hand-edited (§3.2).

---

## 1. Authority, purpose, and nonclaims

### 1.1 Normative terms

- **MUST** and **MUST NOT** state requirements.
- **SHOULD** and **SHOULD NOT** state defaults. An exception requires a recorded rationale and an
  authorized receipt bound to the affected immutable subject hash.
- **MAY** states a permitted option.
- **Fail closed** means stop, request clarification, or use only a more supportive behavior already
  authorized by Spec 03. It never means invent scope, an evidence role, a route, a key, a receipt,
  or a passing status.
- **Consequential question** means a question whose response can affect instructional exit,
  evidence, repair, completion, or a future planner decision.

### 1.2 Authority order

Authority resolves in this order:

1. The pinned V3 authoritative registry owns identity, ownership, scope, ordered KC membership,
   graph and sequence relations, attachments, exclusions, holds, and required delivery.
2. [MCAT App Complete Learning Flow v0.3](./mcat-complete-learning-flow.md) owns cross-system
   boundaries, foundation/W00 prerequisites, and the complete product loop.
   Its pinned SHA-256 is
   `81f0de7ac2a57b0c794467ed0af94714309abb8602d1b0df29ff7602aa88d642`.
3. **V3 Lesson Structure and Learner Flow, version 1.1-draft** (“Spec 03”) owns
   `LessonDefinition`, `LessonRun`, shell and KC states, planner-owned route selection, assistance,
   checkpoints, events, item-family exposure, response semantics, bounded repair, exact
   failed-function reentry, instructional exit, and lesson completion.
4. **[Lesson → Evidence → Mastery Contract](../lesson-evidence-mastery-contract.md)** owns the
   downstream meaning of authored item metadata: `LessonItemBinding` and
   `LessonRuntimeResponseFacts` semantics, declared evidence eligibility versus runtime BKT
   qualification, evidence-mode routing, the two direct BKT grains (`primaryKcId` and
   `reasoningOperation`), lesson KC-rollup semantics, and the prohibition on lesson- or
   client-written mastery. Its names are frozen by the Gate A registry
   (`.superpowers/sdd/field-lock.md`). Spec 04 owns _how_ this metadata is authored and reviewed;
   the contract owns _what it means_ once emitted.
5. This document (“Spec 04”) owns the immutable authoring subjects, authoring-quality workflow,
   presentation rules, detached review evidence, and compile/parity gates.
6. Pinned runbooks, schemas, and implementations MAY be stricter. They MUST NOT weaken items 1–5.

If a subject appears in both Spec 03 and Spec 04, the named owner above governs. In particular,
Spec 04 MUST NOT:

- let an entry check, diagnostic probe, or renderer choose a production instruction route;
- authorize bypass of an ID in `ordered_required_kc_ids`;
- mutate or replay an immutable first attempt as clean;
- replace exact failed-function reentry with a generic restart;
- convert instructional exit or lesson completion into mastery or readiness;
- let any authored field set `independent`, a `pL`, a mastery threshold or status, a decay rate, or
  an evidence status;
- expose protected content outside the server authority; or
- treat 18 minutes as a per-KC or per-lesson budget.

Eighteen minutes remains only a provisional p90 hypothesis for one uninterrupted resumable
**segment**.

### 1.3 Purpose

Spec 03 defines valid lesson runtime behavior. Spec 04 defines how an authoring team produces and
reviews the inputs to that runtime:

```text
canonical shell and ordered required KCs
  → immutable LessonScript subject
  → immutable KcCoverageMatrix subject
  → immutable LessonPresentationPlan subject
  → immutable LessonQualityReport subject
  → detached review receipts and append-only release/status record
  → learner-safe compile and route verification
```

The detached receipts and release/status record are external governance evidence. They are not
additional Spec 04 authoring artifacts.

### 1.4 Current state and claim ceiling

Current repository facts:

- the bootstrap manifest projects 114 shells and 422 KCs from the pinned registry;
- five handcrafted viewer pilots cover 18 KCs;
- a generic draft renderer provides a nonproduction visual-authoring fixture;
- the v7 inventory contains 2,108 schema-valid records with no KC-to-cluster mapping gap; and
- the signed foundation pinset, production schemas, compiler, opaque scorer, browser harness, trust
  root, reviewer credentials, and complete W00 evidence do not yet exist.

Therefore:

- the five pilots are **designated golden candidates**, not golden or approved;
- internal screenshots and local interactions are not canonical lesson-draft completion;
- client-bundled answers in current preview code are not production safe;
- internal review is not learner validation;
- a structural pass is not rights clearance, efficacy, mastery calibration, readiness validity, or
  broad-rollout authorization; and
- no prose caveat may override the machine-readable claim limits in §5.4.

---

## 2. Canonical inputs and fail-closed authoring

### 2.1 Registry and manifest binding

Every subject MUST bind:

- registry artifact ID `MCAT-V3-AUTHORITATIVE-REGISTRY-2026-07-22-01`;
- registry SHA-256 `635c39e9c0ebb28a3892399449aa9b74893aae3264924cd739b92b6e370ba26a`;
- phase-0, canonical, graph, and sequence freeze IDs;
- exact manifest schema/version and manifest byte hash;
- canonical lesson and owning grouping;
- exact ordered member KCs; and
- registry-derived `ordered_required_kc_ids`.

The current bootstrap manifest schema is `mcat-v3-lesson-authoring-manifest-2`; its byte SHA-256 is
`3bbe04ae878fe3936b65bb941ce658f2e48fb104670d7b3c3ad1d243cb99eac9`.

Under the current no-bypass release:

```text
ordered_required_kc_ids = ordered member KC IDs
required_kc_bypass_enabled = false
governing_hold_id = V3-HOLD-110009
hold_release_decision_id = null
```

Every required KC therefore needs a complete authored microcycle and proof row. Concise instruction
changes dose, not required scope.

### 2.2 Per-KC inputs

For each ordered required KC, the approved input set MUST provide:

- competence statement, display label, construct definition, and observable outcome;
- scope in, scope out, exclusions, assumptions, and prohibited overclaims;
- required facts, relationships, procedures, equations, units, and decision points;
- hard predecessors at exact points of use and nonblocking helpful relations;
- representation warrants and accessibility-preserving alternatives;
- confusables, nonexamples, boundaries, and documented misconception hypotheses;
- canonical sequence, host attachments, capstone references, holds, and delivery states;
- source occurrence and source anchor IDs;
- exact repair and reentry relations; and
- approved present-day factual sources and rights decisions.

Authors MAY chunk or restate instruction. They MUST NOT split, merge, clone, rename, renumber, or
rehome a canonical KC.

### 2.3 Source ledger, factual authority, and rights

The source ledger is a hash-bound external input. It MUST record stable source identity, source
kind, title, HTTPS location when applicable, access date, retrieval hash, factual authority,
source ceiling, license/terms, model-processing rights and basis, whether the authoring model
received the source, permitted use, prohibited use, and the rights-review slot.

Registry source anchors identify obligations and provenance. They do not authorize copied wording,
prove present-day factual authority, clear model processing, or license examples, passages, figures,
or items. Human-review-only sources MUST NOT enter an authoring model. Protected questions, keys,
unlicensed expressive text, and excluded source payloads MUST NOT enter the authoring context.

Original prose, figures, tables, passages, examples, and items are required unless a detached rights
receipt for the exact subject hash records explicit reuse permission.

### 2.4 Why v7 validity is not eligibility

Schema validity and KC mapping do not establish that a v7 item:

- measures the required KC operation and activity role;
- belongs to a fresh semantic family;
- has immutable content, mapping, family, stimulus, testlet, and asset versions;
- has a reviewed key/rubric and explanation;
- is original, rights-cleared, accessible, calibrated, or published;
- is eligible for entry, exit, transfer, timed, protected, or other evidence; or
- can be delivered without leaking cueing metadata or protected content.

Every reused item MUST satisfy the immutable binding in §5.1.5. A new ID or cosmetic rewrite never
creates freshness.

### 2.5 Clarification behavior

Missing, contradictory, stale, or ambiguous authority MUST yield a typed blocker with the affected
KC/route/field, conflicting references, one decision owner, fail-closed default, required evidence,
and closure condition. The author MUST NOT invent a prerequisite, misconception model, route,
scope claim, scoring rule, threshold, attachment role, or accessibility equivalence.

---

## 3. Immutable subjects, detached approval, and append-only release

### 3.1 Exactly four authoring artifacts

The only Spec 04 authoring artifact types are:

```text
LESSON_SCRIPT
KC_COVERAGE_MATRIX
LESSON_PRESENTATION_PLAN
LESSON_QUALITY_REPORT
```

Each artifact is an `ArtifactContainer`:

```text
ArtifactContainer {
  subject
  subject_digest
}
```

`subject` is the immutable authored value. `subject_digest` is a deterministic digest of that value.
Neither reviewer approval nor mutable workflow/release status is inside `subject`.

### 3.2 Subject hash

`subject_sha256` MUST be SHA-256 over the exact canonical UTF-8 bytes of the `subject` JSON value,
not over the container and not over a value containing its own hash. The pinned hash profile MUST
identify canonicalization, Unicode handling, number handling, and duplicate-key rejection.

```text
SubjectDigest {
  algorithm: SHA_256
  canonicalization_profile_id
  subject_sha256
}
```

The three fields above are the complete closed `SubjectDigest`. A validator recomputes the digest;
a mismatch is `UNSAFE`.

The immutable `subject` contains authors and derivation inputs when those facts are known before
freeze. It MUST NOT contain:

- `content_sha256`;
- `artifact_status`;
- reviewer approval;
- a reviewed-hash field that points to itself;
- mutable finding disposition;
- release eligibility;
- publication state; or
- mutation of an earlier subject's supersession state.

### 3.3 Detached review receipts

Approval is a separate `ReviewReceiptContainer`, external to the four authoring artifacts:

```text
ReviewReceiptContainer {
  receipt_subject: {
    receipt_id
    receipt_version
    receipt_kind
    trust_profile_ref
    reviewer_identity_ref
    execution_id
    reviewer_role
    reviewed_artifact_type
    reviewed_artifact_id
    reviewed_subject_sha256
    gate_catalog_sha256
    check_ids[]
    result
    evidence_refs[]
    issued_at
  }
  receipt_digest: {
    algorithm: SHA_256
    canonicalization_profile_id
    receipt_subject_sha256
  }
  verification
}
```

`verification` is exactly one closed variant:

```text
DETACHED_SIGNATURE {
  verification_kind: DETACHED_SIGNATURE
  signature_algorithm
  signing_key_id
  signature
  trust_chain_ref
}

CONTROLLER_ATTESTATION {
  verification_kind: CONTROLLER_ATTESTATION
  controller_receipt_id
  controller_receipt_sha256
  trust_profile_ref
}
```

The signature or controller attestation verifies the canonical `receipt_subject` bytes. A receipt
MUST bind one exact subject hash and evidence hashes. Changing any subject byte creates a new hash
and invalidates prior receipts. The `LessonQualityReport` MAY consume receipts for its dependencies;
its own approval receipt is created only after its subject hash exists.
`result` is one of `PASS | FAIL | REVISE | BLOCKED`; `issued_at` is an RFC 3339 UTC timestamp.

### 3.4 External release/status record

Workflow and release state live in a separately hashed, append-only
`ReleaseStatusRecordContainer`:

```text
ReleaseStatusRecordContainer {
  record_subject: {
    release_record_id
    release_record_version
    append_sequence
    previous_record
    artifact_subject_refs[4]
    review_receipt_refs[]
    decision_register_binding
    gate_catalog_binding
    foundation_pinset_binding
    safety_result
    completeness_result
    correction_result
    derived_status
    claim_limits
    revised_subject_refs[]
    issued_at
  }
  record_digest
  verification
}
```

`previous_record` is `{"state":"GENESIS"}` or
`{"state":"PRESENT","record_id":"...","record_sha256":"..."}`.
Each member of `artifact_subject_refs` is a `SubjectDependency` from §4.2. Each
`review_receipt_ref` contains exactly `receipt_id`, `receipt_subject_sha256`, and
`reviewed_subject_sha256`. `decision_register_binding`, `gate_catalog_binding`, and
`foundation_pinset_binding` are `ResolvedBinding | BlockedBinding` values from §4.2.
Each member of `revised_subject_refs` contains exactly `artifact_type`, `artifact_id`,
`prior_subject_sha256`, `replacement_subject_sha256`, and `change_reason`; it never changes prior
bytes.

`record_digest` contains exactly `algorithm=SHA_256`, `canonicalization_profile_id`, and
`record_subject_sha256`. `verification` is one of the two closed variants in §3.3 and signs or
attests that digest.
The release record's `claim_limits` has the exact field set in §5.4.

This record is external governance evidence, not a fifth authoring artifact. It MAY state
`QUARANTINED_DESIGN_CANDIDATE`, `BLOCKED`, `INTERNAL_DRAFT_INTEGRATION`,
`GOLDEN_CANDIDATE_REVIEWED`, or `PRODUCTION_CANDIDATE`. It MUST NOT state a status inconsistent with
the bound quality report, receipts, decision register, W00 pinset, or claim limits.

### 3.5 Acyclic hash graph and lineage

The subject dependency graph is:

```text
LessonScript
  → KcCoverageMatrix binds lesson_script_subject_sha256
  → LessonPresentationPlan binds lesson_script_subject_sha256
                              and kc_coverage_matrix_subject_sha256
  → LessonQualityReport binds all three subject hashes
                        plus external receipt/evidence hashes
  → ReleaseStatusRecord binds all four subject hashes and detached receipts
```

Semantic representation and accessibility-equivalence definitions originate in `LessonScript` or a
hash-bound approved input. The matrix proves them; the presentation plan realizes them. The matrix
MUST NOT depend on the later presentation plan.

Every new subject has a backward lineage pointer. Supersession is recorded only in the new
subject's backward lineage and append-only release records. Prior subject bytes and receipts remain
unchanged and addressable.

---

## 4. Closed canonical wire contract

### 4.1 Closure and nullability

All persisted fields use canonical `snake_case`; enum values use uppercase `SNAKE_CASE`. TypeScript
camelCase is allowed only behind tested bijective serialization.

Every object defined in this specification is closed:

- unknown fields fail;
- duplicate JSON keys fail;
- every named field is required in its variant;
- no field accepts `null`;
- absent optional meaning uses a discriminated `state` variant;
- empty arrays are allowed only where the stated cardinality is zero or more;
- IDs and hashes are nonempty and case-sensitive; and
- every reference resolves in its declared namespace or appears in a typed blocker.

### 4.2 Common subject

Every artifact `subject` has exactly:

```text
ArtifactSubject {
  artifact_type
  artifact_id
  subject_version
  schema_binding
  registry_binding
  decision_register_binding
  authors[]
  input_bindings[]
  dependency_bindings[]
  lineage
  payload
}
```

Closed nested structures:

```text
SchemaBinding {
  schema_id
  schema_version
  schema_sha256
  producer_id
}

DecisionRegisterBinding {
  register_id
  register_version
  register_sha256
  producer_id
}

AuthorRecord {
  identity_ref
  execution_id
  author_role
  contribution
}

InputBinding {
  binding_id
  namespace
  record_id
  record_version
  record_sha256
  schema_id
  schema_version
  schema_sha256
  producer_id
  purpose
}

SubjectDependency {
  artifact_type
  artifact_id
  subject_version
  subject_sha256
}

RegistryBinding {
  registry_artifact_id
  registry_sha256
  phase_0_freeze_id
  canonical_freeze_id
  graph_freeze_id
  sequence_freeze_id
  manifest_schema_version
  manifest_sha256
  lesson_id
  grouping_id
  ordered_kc_ids[]
  ordered_required_kc_ids[]
}

ExternalDigestBinding {
  record_id
  record_version
  record_sha256
  schema_id
  schema_version
  schema_sha256
  producer_id
}

ResolvedBinding {
  binding_state: RESOLVED
  binding: ExternalDigestBinding
}

BlockedBinding {
  binding_state: BLOCKED
  expected_namespace
  blocker_refs[]
}
```

`lineage` is exactly one variant:

```text
InitialLineage {
  lineage_kind: INITIAL
  authoring_execution_id
  derived_from_refs[]
  change_reason
}

RevisionLineage {
  lineage_kind: REVISION
  authoring_execution_id
  revision_of: SubjectDependency
  derived_from_refs[]
  change_reason
}
```

`artifact_id` is stable across revisions; `subject_version` and `subject_sha256` change.

Where an artifact is intentionally incomplete, a field explicitly typed
`ResolvedBinding | BlockedBinding` uses `BlockedBinding`; no other object may substitute a string,
`null`, or invented default for a missing external record.

### 4.3 Reference types and namespaces

A local reference is exactly
`{"reference_kind":"LOCAL","namespace":"...","reference_id":"..."}` and resolves inside the same
subject. An external reference is exactly
`{"reference_kind":"EXTERNAL","input_binding_id":"...","record_fragment_id":"..."}` and resolves
through `input_bindings`.

Allowed namespaces and authoritative producers are:

| Namespace                                                                       | Producer                                      |
| ------------------------------------------------------------------------------- | --------------------------------------------- |
| `REGISTRY_ENTITY`, `REGISTRY_RELATION`, `REGISTRY_HOLD`                         | Pinned registry/manifest generator            |
| `SOURCE_LEDGER`, `SOURCE_CLAIM`, `RIGHTS_INPUT`                                 | Source-ledger controller and rights authority |
| `RUNTIME_POLICY_PACKAGE`                                                        | Lesson-platform policy owner                  |
| `DECISION_REGISTER`                                                             | Spec 04 governance controller                 |
| `GATE_CATALOG`                                                                  | Review-governance controller                  |
| `IDENTITY_TRUST_PROFILE`                                                        | Integration authority                         |
| `ITEM_RECORD`, `ITEM_CONTENT`, `ITEM_MAPPING`, `ITEM_FAMILY`                    | Question authority                            |
| `STIMULUS_RECORD`, `TESTLET_RECORD`, `ITEM_ASSET_MANIFEST`                      | Question/media authority                      |
| `SCORING_AUTHORITY`, `EXPLANATION_AUTHORITY`, `ELIGIBILITY_RECORD`              | Opaque scoring/publication authority          |
| `SCRIPT_OBJECTIVE`, `SCRIPT_SCOPE`, `SCRIPT_SOURCE_CLAIM`                       | `LessonScript` subject                        |
| `SCRIPT_KNOWLEDGE_DEPENDENCY`, `SCRIPT_MISCONCEPTION_FEATURE`                   | `LessonScript` subject                        |
| `SCRIPT_REPRESENTATION`, `SCRIPT_ACCESSIBILITY_EQUIVALENT`                      | `LessonScript` subject                        |
| `SCRIPT_CONTENT_BLOCK`, `SCRIPT_NODE`, `SCRIPT_ACTIVITY`, `SCRIPT_ITEM_BINDING` | `LessonScript` subject                        |
| `MATRIX_ROW`, `MATRIX_PROOF`                                                    | `KcCoverageMatrix` subject                    |
| `PRESENTATION_SCREEN`, `PRESENTATION_ASSERTION`                                 | `LessonPresentationPlan` subject              |
| `REVIEW_EVIDENCE`, `REVIEW_RECEIPT`                                             | Pinned harness or trusted reviewer            |
| `DESIGN_TOKEN_PACKAGE`, `UI_COMPONENT_PACKAGE`, `NAVIGATION_CONTRACT`           | Main-app frontend owner                       |
| `RELEASE_STATUS_RECORD`, `FOUNDATION_PINSET`                                    | Integration controller                        |

No implementation may add a namespace locally. A new namespace requires closure of decision
`OD04-002` and a schema revision.

### 4.4 Canonical enums

```text
instruction_route =
  CONCISE | STANDARD | MISCONCEPTION | PREREQUISITE_SUPPORT

route_applicability =
  APPLICABLE | NOT_APPLICABLE | BLOCKED

authoring_stage =
  ENTRY_BOUNDARY | ORIENTATION | MENTAL_MODEL | EXPERT_MODEL |
  GUIDED_PRACTICE | FADING | SOLO_PRACTICE | CONTRAST_BOUNDS |
  NEAR_USE | CHANGED_TASK | TARGETED_REPAIR | EXACT_REENTRY | RECAP

failed_function =
  NEAR_USE | CHANGED_TASK

gate_check_status =
  PASS | FAIL | REVISE | BLOCKED | NOT_APPLICABLE

aggregate_gate_status =
  PASS | FAIL | REVISE | BLOCKED

safety_result =
  SAFE_NO_PROVEN_FAILURE | UNSAFE

completeness_result =
  COMPLETE | INCOMPLETE

correction_result =
  CLEAN | CORRECTION_REQUIRED

construct_preservation =
  PRESERVED | NOT_PRESERVED | UNRESOLVED
```

`NEAR_EXIT` and `CHANGED_EXIT` are not valid `failed_function` values. If legacy code uses them, a
pinned, bijectively tested adapter MUST map `NEAR_EXIT → NEAR_USE` and
`CHANGED_EXIT → CHANGED_TASK` before canonical persistence.

---

## 5. The four artifact contracts

### 5.1 `LessonScript`

#### 5.1.1 Payload

`LessonScript.payload` contains exactly:

```text
lesson_id
grouping_id
ordered_kc_ids[]
ordered_required_kc_ids[]
throughline
scope_and_non_goals
source_ledger_binding_id
runtime_policy_package_binding_id
shell_contract
objectives[]
scope_records[]
source_claims[]
knowledge_dependencies[]
misconception_features[]
representations[]
accessibility_equivalents[]
content_blocks[]
nodes[]
activities[]
item_bindings[]
question_evidence_plan
kc_scripts[]
transition_definitions[]
attachment_bindings[]
compilation_map
```

`throughline` is learner-facing prose plus an authority trace. `scope_and_non_goals` contains
`scope_ref_ids[]` and `non_goal_ref_ids[]`; both resolve to `scope_records`.
Those two arrays are the complete closed `ScopeAndNonGoals` object.

#### 5.1.2 Upstream semantic records

These records are complete and closed:

```text
ObjectiveRecord {
  objective_id
  kc_id
  competence_ref
  observable_statement
}

ScopeRecord {
  scope_ref_id
  kc_id
  scope_kind: IN_SCOPE | OUT_OF_SCOPE | NON_GOAL | PROHIBITED_OVERCLAIM
  statement
  authority_refs[]
}

SourceClaimRecord {
  source_claim_id
  kc_id
  factual_statement
  source_ledger_refs[]
  rights_input_refs[]
}

KnowledgeDependencyRecord {
  dependency_id
  kc_id
  dependency_kind:
    REQUIRED_KC_KNOWLEDGE | HARD_PREREQUISITE |
    HELPFUL_NONBLOCKING_CONTEXT | REPRESENTATION_LITERACY |
    INCIDENTAL_CONTEXT
  statement
  authority_refs[]
  delivery_rule:
    TAUGHT_IN_THIS_KC | TAUGHT_AT_POINT_OF_USE |
    AUTHORIZED_PRIOR_KC | NONREQUIRED_CONTEXT_ONLY
}

MisconceptionFeatureRecord {
  feature_id
  kc_id
  observable_response_feature
  prohibited_trait_inference
  disambiguation_authority_refs[]
  repair_node_refs[]
}

RepresentationRecord {
  representation_id
  kc_id
  representation_kind
  information_encoded[]
  decisive_feature
  learner_operation
  instructional_warrant
  signaling_constraints[]
  source_claim_refs[]
}

AccessibilityEquivalentRecord {
  accessibility_equivalent_id
  representation_id
  alternative_kind
  alternative_description
  learner_operation
  construct_preservation
  evidence_semantics
  required_reviewer_qualification
  authority_refs[]
}
```

Representation meaning and accessibility equivalence are fixed here, before matrix and presentation
work. The presentation plan may choose an authorized realization; it cannot redefine the construct.

#### 5.1.3 Script graph records

```text
ContentBlock {
  content_block_id
  block_kind:
    PLAIN_TEXT | ORDERED_REASONING | COMPARISON |
    EQUATION | TABLE_DESCRIPTION | FIGURE_DESCRIPTION
  text_lines[]
  source_claim_refs[]
  asset_refs[]
}

ScriptNode {
  node_id
  node_kind:
    ENTRY_CHECK_BOUNDARY | ORIENTATION | EXPLANATION |
    MENTAL_MODEL | EXPERT_THINK_ALOUD | WORKED_EXAMPLE |
    GUIDED_PRACTICE | LIGHT_SUPPORT_PRACTICE |
    SOLO_PRACTICE | CONTRAST_BOUNDARY | NEAR_USE |
    CHANGED_TASK | TARGETED_REPAIR | EXACT_REENTRY |
    RECAP | TRANSITION
  primary_kc_id
  secondary_kc_refs[]
  content_block_refs[]
  representation_refs[]
  activity_refs[]
  checkpoint_ref
  source_claim_refs[]
}

ActivityRecord {
  activity_id
  primary_kc_id
  learner_operation
  assistance_level: A3 | A2 | A1 | A0
  item_binding_refs[]
  feedback_release:
    AFTER_COMMIT | AFTER_GROUP_COMMIT | AFTER_EXIT_DISPOSITION
  omission_rule_ref
  retry_rule_ref
  invalid_item_rule_ref
  authorized_next_node_refs[]
}
```

The runtime policy package supplies the closed schemas and hashes for checkpoints, duration models,
event names/envelopes, analytics, response handling, assistance predicates, exit policy, repair
limits, planner handoff, and protected-content enforcement. It MUST name its producer and subject
hash. Lesson-specific instances remain in `shell_contract` and each `kc_script`.

#### 5.1.4 Route applicability and KC script

Each route has exactly one of:

```text
ApplicableRoute {
  route
  applicability: APPLICABLE
  authority_refs[]
  executable_entry_node_refs[]
}

NotApplicableRoute {
  route
  applicability: NOT_APPLICABLE
  authority_refs[]
  absence_proof_refs[]
}

BlockedRoute {
  route
  applicability: BLOCKED
  authority_refs[]
  blocker_refs[]
}
```

`PREREQUISITE_SUPPORT` may be `APPLICABLE` only when authority refs include an exact registry
`HARD_PREREQUISITE`, point of use, predecessor KC/lesson, and the qualification contract required
by Spec 03. Runtime execution additionally requires a current planner resolution and evidence-policy
qualification. Graph proximity, helpful relations, or an unresolved state are insufficient.

Each `KcScript` contains exactly:

```text
kc_id
canonical_ordinal
primary_microcycle_id
objective_ref
scope_in_refs[]
scope_out_refs[]
source_claim_refs[]
required_knowledge_dependency_refs[]
prerequisite_point_refs[]
entry_boundary_ref
orientation_ref
explanation_node_refs[]
mental_model_refs[]
expert_think_aloud_refs[]
worked_example_refs[]
guided_activity_refs[]
light_support_activity_refs[]
solo_activity_refs[]
contrast_boundary_refs[]
near_use_item_binding_refs[]
changed_task_item_binding_refs[]
misconception_feature_refs[]
repair_node_refs[]
exact_reentry_bindings[]
recap_ref
representation_refs[]
accessibility_equivalent_refs[]
route_applicability[4]
route_stage_coverage[]
segment_ids[]
segment_duration_models[]
microcycle_duration_model
checkpoint_map
planner_handoff_rules
analytics_bindings[]
```

An `ExactReentryBinding` contains `failed_function`, `repair_node_ref`,
`fresh_confirmation_item_binding_ref`, `reentry_checkpoint_ref`, and
`preserved_success_policy_ref`.

`route_stage_coverage` contains one proof for each route. `APPLICABLE` routes list all 13
`authoring_stage` values and resolving refs. `NOT_APPLICABLE` routes contain no executable refs and
bind an absence proof. `BLOCKED` routes contain no executable refs and bind blockers. Validators run
applicable routes only and prove unauthorized routes are absent.

An `ApplicableStageCoverage` contains exactly `route`, `applicability=APPLICABLE`,
`stage_proofs[13]`, `status`, `blocker_refs[]`, and `finding_refs[]`; each script-stage proof
contains exactly `authoring_stage` and `script_refs[]`. A `NotApplicableStageCoverage` contains
exactly `route`, `applicability=NOT_APPLICABLE`, and `absence_proof_refs[]`. A
`BlockedStageCoverage` contains exactly `route`, `applicability=BLOCKED`, and `blocker_refs[]`.

#### 5.1.5 Immutable item binding

Every question or scored task uses an `ImmutableItemBinding` with exactly:

```text
item_binding_id
activity_id
activity_role:
  ENTRY_CHECK | WORKED_EXAMPLE | GUIDED_PRACTICE |
  LIGHT_SUPPORT_PRACTICE | SOLO_PRACTICE |
  NEAR_USE | CHANGED_TASK | REPAIR_CONFIRMATION |
  REHEARSAL_ONLY
primary_kc_id
secondary_mapping_refs[]
item_id
item_version
item_sha256
item_content_version
item_content_sha256
item_mapping_version
item_mapping_sha256
family_id
family_version
family_sha256
stimulus_binding
testlet_binding
learner_projection_schema_ref
prompt_options_projection_sha256
scoring_binding
explanation_authority_ref
asset_manifest_ref
eligibility_record_ref
exposure_policy_ref
first_attempt_policy: IMMUTABLE
assistance_level
feedback_release
omission_rule_ref
retry_rule_ref
invalid_item_rule_ref

--- mastery-seam closure (added in 0.3-candidate; see §5.1.7) ---
lesson_id
question_id
binding_version
candidate_evidence_modes[]
reasoning_operation        (conditional; see §5.1.8)
dok_level                  (optional; 1 | 2 | 3 | 4)
representation_id          (nullable)
representation_family_id   (optional)
changed_dimensions[]
changed_dimension_detail   (optional)
stimulus_lineage_id        (optional)
```

`stimulus_binding` and `testlet_binding` are each
`{"state":"ABSENT"}` or
`{"state":"PRESENT","record_id":"...","record_version":"...","record_sha256":"..."}`.

`scoring_binding` is exactly one:

```text
OpaqueKeyScoring {
  scoring_kind: OPAQUE_KEY
  scoring_authority_id
  scoring_authority_version
  scoring_authority_sha256
  scoring_schema_sha256
}

RubricScoring {
  scoring_kind: RUBRIC
  rubric_id
  rubric_version
  rubric_sha256
  scoring_authority_id
  scoring_authority_version
  scoring_authority_sha256
}
```

Every external item/content/mapping/family/stimulus/testlet/scoring/explanation/asset/eligibility
record MUST appear in `input_bindings`. Any changed byte or version changes the script subject hash
and invalidates dependent subjects and receipts. Bare strings such as `SERVER:answer` are invalid.

`question_evidence_plan` contains exactly:

```text
question_evidence_plan_id
item_binding_refs[]
semantic_family_separation_proof_refs[]
first_attempt_policy_ref
feedback_release_policy_ref
omission_retry_invalid_policy_refs[]
protected_authority_refs[]
review_check_ids[]
status: PASS | FAIL | REVISE | BLOCKED
blocker_refs[]
finding_refs[]
```

Its `review_check_ids` MUST include every applicable `QEV-*` check in §7. The plan is immutable
inside the script subject but separately assigned and reviewed.

`question_evidence_plan` is **aggregate review evidence about the item set**: it proves that families
are separated, first attempts are immutable, feedback release is authorized, and protected
authorities are bound. It is **not** an author-controlled mastery award and confers no capability
claim. A `status: PASS` on the plan means the item set was reviewed and is well formed; it does not
mean any learner is mastered, does not make any binding BKT-eligible, and does not substitute for the
per-response runtime qualification in the
[Lesson → Evidence → Mastery Contract](../lesson-evidence-mastery-contract.md) §5.2. Eligibility is
declared per binding in `candidate_evidence_modes`, never by the plan.

#### 5.1.6 Shell contract

`shell_contract` contains exactly:

```text
shell_duration_model
shell_checkpoint_map
transition_definition_refs[]
extension_binding_refs[]
support_binding_refs[]
capstone_reference_refs[]
revisit_reference_refs[]
event_contract_binding
analytics_contract_binding
accessibility_contract_binding
rights_input_binding_refs[]
planner_handoff_rules_binding
```

Every model/map/contract above is a closed lesson-specific object or an external binding whose
schema, producer, version, and hash appear in `input_bindings`.

The lesson-specific shapes are:

```text
DurationModel {
  duration_model_id
  model_kind: SEGMENT | MICROCYCLE | SHELL
  estimate_state: HYPOTHESIS | OBSERVED
  core_seconds
  branch_seconds
  transition_seconds
  checkpoint_refs[]
  policy_binding_id
}

CheckpointMap {
  checkpoint_map_id
  checkpoint_refs[]
  resume_policy_binding_id
}

PlannerHandoffRules {
  handoff_rules_id
  terminal_state_refs[]
  repair_limit_state_refs[]
  planner_contract_binding_id
}

TransitionDefinition {
  transition_id
  from_node_ref
  to_node_ref
  authorization_ref
  checkpoint_ref
}

AttachmentBinding {
  attachment_id
  attachment_kind: EXTENSION | SUPPORT | CAPSTONE | REVISIT
  delivery_state: HOST_ONLY | REQUIRED | GOVERNANCE_ONLY | NONREQUIRED
  registry_ref
  compile_behavior: ACTIVE_REFERENCE | GOVERNANCE_REFERENCE_ONLY
}

CompilationMapEntry {
  target_field
  producer_path
  policy_binding_ids[]
  result: RESOLVED | BLOCKED
  blocker_refs[]
}
```

`shell_contract`, each KC checkpoint/duration/handoff field, transitions, attachment bindings, and
`compilation_map` use only these records or `ResolvedBinding | BlockedBinding`. An empty
`blocker_refs` array is required for `RESOLVED`; a nonempty array is required for `BLOCKED`.

#### 5.1.7 Author-time metadata closure for the mastery seam

Every `ImmutableItemBinding` MUST carry a complete, reviewed answer to each row below. This is the
full set of author-time metadata the downstream seam is allowed to rely on; the server derives
everything else and infers nothing. Names in the “Seam key” column are frozen by the Gate A registry
(`.superpowers/sdd/field-lock.md`) and are the exact keys the artifact adapter reads.

| Author decision            | Seam key (`snake_case`)          | Requirement              | Meaning and constraint                                                                                                                                                                                                                                                                                                          |
| -------------------------- | -------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Item and version identity  | `question_id`, `binding_version` | MUST                     | `question_id` is the canonical server-scored item ID (legacy fallback `item_binding_id`). `binding_version` is an **opaque non-empty string** used only for version matching and audit; it MUST NOT be parsed, coerced, or hashed into a numeric item version. Normalize legacy `item_version` or the envelope version into it. |
| Owning lesson              | `lesson_id`                      | MUST                     | Routing and audit only. `lesson_id` is **never** a mastery target; lessons have no BKT state.                                                                                                                                                                                                                                   |
| Primary KC                 | `primary_kc_id`                  | MUST                     | Exactly one. This is the only KC-grain mastery target. `secondary_kc_mappings` is coverage only.                                                                                                                                                                                                                                |
| Reasoning operation        | `reasoning_operation`            | Conditional — see §5.1.8 | Exactly one of `IDENTIFY`, `PREDICT`, `EXPLAIN`, `RELATE`, `QUANTIFY`, `DESIGN`, `EVIDENCE`. Never inferred from free text.                                                                                                                                                                                                     |
| Item family                | `semantic_family_id`             | MUST                     | The freshness/diversity unit. MUST equal the binding's hash-bound `family_id`.                                                                                                                                                                                                                                                  |
| Depth of knowledge         | `dok_level`                      | OPTIONAL — see §5.1.8    | `1`, `2`, `3`, or `4`. No default and no inferred value.                                                                                                                                                                                                                                                                        |
| Activity role              | `activity_role`                  | MUST                     | One of the nine roles in §5.1.5. A role never by itself grants an evidence mode.                                                                                                                                                                                                                                                |
| Item-level representation  | `representation_id`              | MUST (nullable)          | Open non-empty string or `null`. `representation_family_id` is an optional external REPFAM reference that is currently unpopulated and MUST NOT be adapter-derived.                                                                                                                                                             |
| Intended changed dimension | `changed_dimensions`             | MUST (may be `[]`)       | Authored canonical array over `domain_context`, `representation`, `passage_or_data`, `required_operation`, `section_application`. `changed_dimension_detail` retains the raw reviewed prose. An empty or partial array is **never** a validation error, and the adapter MUST NOT infer dimensions from prose.                   |
| Protected scoring binding  | `server_scoring_authority_ref`   | MUST (server-only)       | The protected scorer. `server_rationale_authority_ref` is the optional protected rationale reference. Both stay server-side; neither may appear in a learner-safe artifact.                                                                                                                                                     |
| Candidate evidence modes   | `candidate_evidence_modes`       | MUST (non-empty)         | Closed set: `DIAGNOSTIC`, `ENTRY`, `INSTRUCTIONAL`, `INSTRUCTIONAL_EXIT`, `INDEPENDENT`, `TRANSFER`, `DELAYED`, `MIXED`, `PASSAGE`, `TIMED`, `PROTECTED`, `REPAIR_CONFIRMATION`, `REHEARSAL_ONLY`. A **permission set, not an outcome**.                                                                                        |

Where a pre-existing Spec 04 key and a seam key describe the same fact, the correspondence is fixed
and the values MUST agree. The adapter performs the rename; the author writes both sides only where
this table says so.

| Spec 04 `ImmutableItemBinding` key                                  | Seam key                         | Invariant                                                          |
| ------------------------------------------------------------------- | -------------------------------- | ------------------------------------------------------------------ |
| `item_id`                                                           | `question_id`                    | Same item. Legacy fallback is `item_binding_id`.                   |
| `item_version`, `item_sha256`                                       | `binding_version`                | Normalized into one opaque string; the hashes stay for provenance. |
| `family_id`                                                         | `semantic_family_id`             | MUST be equal.                                                     |
| `secondary_mapping_refs[]`                                          | `secondary_kc_mappings`          | Coverage only; never a mastery target.                             |
| `assistance_level`                                                  | `authored_assistance_level`      | MUST be equal. Design intent, not the runtime fact.                |
| `first_attempt_policy: IMMUTABLE`                                   | `first_attempt_immutable: true`  | MUST both hold.                                                    |
| `learner_projection_schema_ref`, `prompt_options_projection_sha256` | `learner_safe_item_ref`          | The learner-safe surface. No key, rationale, or scoring logic.     |
| `scoring_binding`                                                   | `server_scoring_authority_ref`   | The protected scoring authority.                                   |
| `explanation_authority_ref`                                         | `server_rationale_authority_ref` | The protected rationale authority.                                 |
| `stimulus_binding`                                                  | `stimulus_lineage_id`            | Normalize a legacy `stimulus_lineage` string or `lineage_id`.      |

Three closure rules that a validator MUST enforce:

- **No mastery field is authorable.** An `ImmutableItemBinding` MUST NOT contain `independent`, a
  `pL` or any mastery probability, a mastery threshold or status, a decay or half-life value, or an
  evidence status. These have no key; a binding carrying one is rejected, not sanitized.
- **A0 metadata is necessary but NEVER sufficient for independence.** `assistance_level: A0` and
  `authored_assistance_level: 'A0'` state the design intent of the activity. Independence is decided
  at runtime by the server from the observed response — first attempt, `A0` actually in force at
  commit, no content-bearing hint, no reveal, no retry, and valid server scoring. An author can make
  independence _reachable_; an author can never make a response independent.
- **`candidate_evidence_modes` is a ceiling, not a grant.** Declaring `INDEPENDENT` permits BKT
  qualification to be attempted; it does not assert that any response qualified. Omitting it
  guarantees that no response from this binding will ever move `pL`.

#### 5.1.8 When an author MUST stop and label an item

If a binding declares `INDEPENDENT` in `candidate_evidence_modes`, the author MUST stop and label
`reasoning_operation` with exactly one of the seven governed operations, because that value is a
direct mastery-update target and there is no safe way for an adapter, heuristic, or model to guess
which of seven operations an item exercises — a wrong guess silently corrupts a learner-facing skill
estimate. On every other binding (`ENTRY`, `INSTRUCTIONAL`, `INSTRUCTIONAL_EXIT`,
`REPAIR_CONFIRMATION`, `REHEARSAL_ONLY`, `DIAGNOSTIC`) `reasoning_operation` is optional, and leaving
an item unlabeled is correct rather than lazy, because such an item can never reach the mastery
engine. `dok_level` behaves differently: it is OPTIONAL even on a binding declaring `INDEPENDENT`,
because `coldStartB()` in `packages/policies/src/irt.ts` returns a neutral `0` for an undefined DOK,
so an unlabeled item only loses difficulty discrimination until it is calibrated from real attempts.
In short — labeling `reasoning_operation` on an eligible binding is a hard stop that blocks release;
labeling `dok_level` is a quality improvement to make when you can and to defer when you cannot. If
you cannot confidently pick one operation, the correct action is to **not declare `INDEPENDENT`** on
that binding; guessing an operation in order to unlock eligibility is a defect.

**`learner_operation` is not `reasoning_operation`.** The existing `learner_operation` field on
`RepresentationRecord`, `AccessibilityEquivalentRecord`, and `ActivityRecord` is instructional free
text describing what the learner does on this screen (“Translate arrows into signed components before
combining.”). It is an authoring and presentation aid. It is **not** a capability label, it is not
governed by any closed vocabulary, and it MUST NOT be read, parsed, mapped, or inferred into
`reasoning_operation`. The same holds for any `semantic_structure.operation` prose. The governed
seven-operation mastery tag is only ever set deliberately, by name, in `reasoning_operation`.

#### 5.1.9 Worked binding example

One complete, conforming `ImmutableItemBinding` for a solo-practice item that the review team has
approved as independent measurement. Hashes are illustrative fixture values.

```json
{
  "item_binding_id": "V3-LES-329622-KC-271440-SOLO-01",
  "activity_id": "V3-LES-329622-KC-271440-ACT-SOLO-01",
  "activity_role": "SOLO_PRACTICE",
  "primary_kc_id": "V3-KC-271440",
  "secondary_mapping_refs": [],
  "item_id": "V3-ITEM-271440-SOLO-01",
  "item_version": "3",
  "item_sha256": "1111111111111111111111111111111111111111111111111111111111111111",
  "item_content_version": "3",
  "item_content_sha256": "2222222222222222222222222222222222222222222222222222222222222222",
  "item_mapping_version": "2",
  "item_mapping_sha256": "3333333333333333333333333333333333333333333333333333333333333333",
  "family_id": "fam-redox-ledger-solo-01",
  "family_version": "1",
  "family_sha256": "4444444444444444444444444444444444444444444444444444444444444444",
  "stimulus_binding": { "state": "ABSENT" },
  "testlet_binding": { "state": "ABSENT" },
  "learner_projection_schema_ref": "SCHEMA:learner-item-projection-1",
  "prompt_options_projection_sha256": "5555555555555555555555555555555555555555555555555555555555555555",
  "scoring_binding": {
    "scoring_kind": "OPAQUE_KEY",
    "scoring_authority_id": "SCORING:V3-ITEM-271440-SOLO-01",
    "scoring_authority_version": "3",
    "scoring_authority_sha256": "6666666666666666666666666666666666666666666666666666666666666666",
    "scoring_schema_sha256": "7777777777777777777777777777777777777777777777777777777777777777"
  },
  "explanation_authority_ref": "RATIONALE:V3-ITEM-271440-SOLO-01:v3",
  "asset_manifest_ref": "ASSETS:V3-ITEM-271440-SOLO-01:v3",
  "eligibility_record_ref": "ELIGIBILITY:V3-ITEM-271440-SOLO-01:v3",
  "exposure_policy_ref": "EXPOSURE:V3-LES-329622:v1",
  "first_attempt_policy": "IMMUTABLE",
  "assistance_level": "A0",
  "feedback_release": "AFTER_COMMIT",
  "omission_rule_ref": "POLICY:omission-1",
  "retry_rule_ref": "POLICY:retry-1",
  "invalid_item_rule_ref": "POLICY:invalid-item-1",

  "lesson_id": "V3-LES-329622",
  "question_id": "V3-ITEM-271440-SOLO-01",
  "binding_version": "V3-ITEM-271440-SOLO-01@3",
  "candidate_evidence_modes": ["INDEPENDENT"],
  "reasoning_operation": "RELATE",
  "dok_level": 3,
  "representation_id": "REDOX-REP-STRUCTURE-LEDGER",
  "representation_family_id": null,
  "changed_dimensions": [],
  "changed_dimension_detail": null,
  "stimulus_lineage_id": "lineage:fam-redox-ledger-solo-01"
}
```

Why this binding is well formed:

- it declares `INDEPENDENT`, so `reasoning_operation` is present and is exactly one governed value;
- `dok_level` is supplied, which is optional but improves cold-start difficulty;
- `assistance_level` is `A0`, which makes independence _reachable_ and proves nothing on its own —
  the server still requires a first attempt, `A0` in force at commit, no content-bearing hint, no
  reveal, no retry, and valid server scoring;
- `changed_dimensions` is `[]` because this is a near-use solo check, not a transfer item;
- no field states `independent`, a `pL`, a threshold, decay, or an evidence status; and
- the answer key, rationale, and scoring logic appear only behind server-only authority references.

Changing this binding to an instructional check is a one-field edit: set
`"candidate_evidence_modes": ["INSTRUCTIONAL_EXIT"]`, at which point `reasoning_operation` becomes
optional and no response from the item can ever move `pL`.

### 5.2 `KcCoverageMatrix`

The matrix depends only on the exact `LessonScript` subject and registry inputs. Its payload contains
exactly:

```text
lesson_id
lesson_script_dependency
ordered_required_kc_ids[]
rows[]
automated_check_results[]
dependency_closure_proof
matrix_result
```

There is exactly one row per ordered required KC, in canonical order. Each row contains:

```text
kc_id
canonical_ordinal
objective_ref
scope_in_refs[]
scope_out_refs[]
source_claim_refs[]
required_knowledge_dependency_refs[]
prerequisite_point_refs[]
entry_boundary_ref
orientation_ref
explanation_node_refs[]
mental_model_refs[]
expert_think_aloud_refs[]
worked_example_refs[]
guided_activity_refs[]
light_support_activity_refs[]
solo_activity_refs[]
contrast_boundary_refs[]
entry_check_items[]
near_use_items[]
changed_task_items[]
misconception_feature_refs[]
repair_node_refs[]
repair_family_refs[]
repair_confirmation_items[]
exact_reentry_proofs[]
recap_ref
representation_refs[]
accessibility_equivalent_refs[]
route_proofs[4]
compiled_node_evidence_refs[]
dependency_closure_evidence_refs[]
row_result
```

Each member of `near_use_items` and `changed_task_items` contains both `item_binding_id` and
`item_id`, plus family ID/version/hash. An exact-reentry proof uses `failed_function=NEAR_USE` or
`failed_function=CHANGED_TASK`, never an activity-role label.

Each route proof is a closed `ApplicableRouteProof`, `NotApplicableRouteProof`, or
`BlockedRouteProof`:

- `ApplicableRouteProof` contains exactly `route`, `applicability=APPLICABLE`,
  `authority_refs[]`, `stage_proofs[13]`, `exact_reentry_proof_refs[]`,
  `compiled_reachability_evidence_refs[]`, `status`, `blocker_refs[]`, and `finding_refs[]`.
- `NotApplicableRouteProof` contains exactly `route`, `applicability=NOT_APPLICABLE`,
  `authority_refs[]`, `absence_proof_refs[]`, and `status=NOT_APPLICABLE`.
- `BlockedRouteProof` contains exactly `route`, `applicability=BLOCKED`, `authority_refs[]`,
  `blocker_refs[]`, and `status=BLOCKED`.

Supporting closed records are:

```text
StageProof {
  authoring_stage
  script_refs[]
  compiled_evidence_refs[]
}

MatrixItemRef {
  item_binding_id
  item_id
  family_id
  family_version
  family_sha256
}

ExactReentryProof {
  failed_function
  repair_node_ref
  fresh_confirmation_item_binding_ref
  reentry_checkpoint_ref
  preserved_success_policy_ref
}

AutomatedCheckResult {
  check_id
  status
  evidence_refs[]
  blocker_refs[]
  finding_refs[]
}

DependencyClosureProof {
  status: PASS | FAIL | REVISE | BLOCKED
  dependency_ids[]
  evidence_refs[]
  blocker_refs[]
  finding_refs[]
}
```

The dependency-closure proof MUST show that every fact, term, equation, representation operation,
and item demand is one of:

1. taught in the current KC;
2. an authorized prior required KC;
3. a hard prerequisite supplied at its exact point of use;
4. a declared nonblocking reminder that is not scored;
5. an approved contrast/nonexample; or
6. incidental context requiring no outside knowledge.

The validator rejects missing cells, extra KCs, duplicate IDs, family/freshness conflicts,
unresolved refs, script-only claims without compiled nodes, untaught dependencies, and executable
content on a `NOT_APPLICABLE` or `BLOCKED` route.
Spec 03's published coverage `review_status` is a controller projection from detached receipts and
the release/status record; it is not mutable state inside this matrix subject.

### 5.3 `LessonPresentationPlan`

The plan binds the exact script and matrix subjects. Its payload contains exactly:

```text
lesson_id
lesson_script_dependency
kc_coverage_matrix_dependency
design_token_binding_id
ui_component_binding_id
navigation_contract_binding_id
learner_rhythm[]
screens[]
node_to_screen_map[]
representation_realizations[]
progressive_disclosure_rules
learner_reviewer_separation
main_app_parity_assertions[]
responsive_assertions[]
accessibility_assertions[]
browser_evidence_plan
presentation_result
```

Each `ScreenRecord` contains exactly:

```text
screen_id
screen_kind:
  STARTING_CHECK | FOCUS_NOW | EXPLAIN | WORKED_VISUAL |
  GUIDED_PRACTICE | LESS_HELP | ON_YOUR_OWN |
  FINAL_NEAR_CHECK | FINAL_CHANGED_CHECK |
  TARGETED_REPAIR | COMPLETION
script_node_refs[]
primary_job
primary_action
learner_heading
progress_label
important_callout_count
collapsed_detail_refs[]
representation_refs[]
focus_target
keyboard_order[]
responsive_policy_ref
reviewer_projection_refs[]
```

`important_callout_count` is `0` or `1`. `representation_realizations` reference semantic
`RepresentationRecord` and `AccessibilityEquivalentRecord` IDs from the script; they add layout,
interaction, static fallback, and small-screen behavior only.

The remaining nested records are closed:

```text
NodeToScreenMap {
  script_node_ref
  screen_id
}

RepresentationRealization {
  representation_ref
  accessibility_equivalent_ref
  screen_ids[]
  interaction_kind
  static_fallback_ref
  small_screen_policy_ref
}

ProgressiveDisclosureRules {
  optional_details_default: COLLAPSED
  required_instruction_collapsible: false
  important_callout_maximum: 1
  stacked_fading_ladders_allowed: false
}

LearnerReviewerSeparation {
  learner_projection_schema_ref
  reviewer_projection_schema_ref
  protected_field_scan_ref
  client_bundle_scan_ref
}

PresentationAssertion {
  assertion_id
  expected_value
  status: PASS | FAIL | REVISE | BLOCKED
  evidence_refs[]
  blocker_refs[]
  finding_refs[]
}

BrowserEvidencePlan {
  browser_profile_refs[]
  viewport_widths[]
  theme_modes[]
  assistive_technology_profile_refs[]
  required_branch_refs[]
  evidence_refs[]
  status: PASS | FAIL | REVISE | BLOCKED
  blocker_refs[]
}
```

### 5.4 `LessonQualityReport`

The quality report binds all three preceding subject hashes. It consumes external review receipts
for those subjects but contains no approval of its own bytes.

Its payload contains exactly:

```text
lesson_id
lesson_script_dependency
kc_coverage_matrix_dependency
lesson_presentation_plan_dependency
decision_register_binding
gate_catalog_binding
identity_trust_profile_binding
review_receipt_input_refs[]
gate_check_results[]
independence_check_results[]
blocking_records[]
findings[]
safety_result
completeness_result
correction_result
derived_final_status
claim_limits
```

Each `GateCheckResult` contains `check_id`, `applicability`, `status`, exact reviewed subject hashes,
evidence refs, receipt refs, and blocker/finding refs. The check-ID set MUST equal the complete
applicable `QUALITY_REPORT` scope of the catalog in §7; omission is `INCOMPLETE`.

The nested quality records are:

```text
ReviewedSubjectRef {
  artifact_type
  artifact_id
  subject_sha256
}

GateCheckResult {
  check_id
  applicability: APPLICABLE | NOT_APPLICABLE | BLOCKED
  status
  reviewed_subject_refs[]
  evidence_refs[]
  receipt_refs[]
  blocker_refs[]
  finding_refs[]
}

IndependenceCheckResult {
  constraint_id
  status: PASS | FAIL | BLOCKED
  trusted_identity_refs[]
  evidence_refs[]
  blocker_refs[]
}

BlockingRecord {
  blocker_id
  blocking_scope
  missing_evidence
  fail_closed_default
  owner_ref
  closure_criteria[]
}
```

`gate_catalog_binding` and `identity_trust_profile_binding` are each
`ResolvedBinding | BlockedBinding`. `review_receipt_input_refs` resolve through `input_bindings`.
The report and its release/status record MUST include every open decision whose blocking scope
matches the lesson, W00, golden validation, production, or rollout; local evidence cannot omit or
override a global blocker.

Each finding contains:

```text
finding_id
severity: P0 | P1 | P2 | P3
affected_subject_ref
affected_path
evidence_refs[]
required_correction
owner_ref
retest_check_ids[]
```

Finding disposition is external append-only release metadata, not mutable report content.

`claim_limits` contains all fields below and defaults to `false`:

```text
learner_validated
efficacy_established
mastery_calibrated
readiness_validated
rights_cleared_for_release
broad_rollout_authorized
production_compliance_established
canonical_authoring_complete
production_published
```

Only the corresponding separate authority may set a claim to `true` in a later subject and release
record with evidence. Internal review cannot set learner, efficacy, mastery, or readiness claims.
`matrix_result`, `presentation_result`, and `derived_final_status` are immutable computed assertions
about fixed inputs, not mutable workflow state. A changed conclusion requires a new subject hash;
only the external release/status record says what is currently active.

---

## 6. Script workflow and complete KC proof

### 6.1 Identity and throughline

The author begins from the canonical shell, grouping rationale, and ordered required KCs. The
throughline MAY improve learner coherence but MUST preserve KC identity, order, states, attachments,
and exact relations. It connects KCs without merging their objectives or evidence.

### 6.2 Thirteen authoring stages

Every KC on an `APPLICABLE` route MUST resolve all 13 stages:

1. `ENTRY_BOUNDARY`;
2. `ORIENTATION`;
3. `MENTAL_MODEL`;
4. `EXPERT_MODEL`, with both think-aloud and worked-example refs;
5. `GUIDED_PRACTICE`;
6. `FADING`, including lighter support;
7. `SOLO_PRACTICE`;
8. `CONTRAST_BOUNDS`;
9. `NEAR_USE`;
10. `CHANGED_TASK`;
11. `TARGETED_REPAIR`;
12. `EXACT_REENTRY`; and
13. `RECAP`.

This is authoring coverage, not a new runtime state machine. Spec 03 owns state transitions,
assistance predicates, checkpoints, exit policy, and termination.

### 6.3 Explain before consequential questions

Teaching and worked reasoning MUST precede every consequential demand that depends on the new KC.
The only pre-instruction question is an explicitly low-stakes `ENTRY_CHECK` that:

- checks a prerequisite or starting conception;
- cannot independently select or replace the planner route;
- cannot count as exit, mastery, readiness, or completion;
- offers `not sure` when guessing would be uninformative;
- withholds answer-bearing feedback until commitment; and
- permanently contaminates its semantic family for later fresh roles.

An entry check MAY alter nonconsequential support inside the supplied route or emit a future-planning
observation. Diagnostic probes that choose between probe and lesson occur outside the lesson runner.

### 6.4 Depth through structure

When novice clarity is insufficient, authors SHOULD add a smaller conceptual chunk, intermediate
state, cue → principle → operation → check reasoning, worked visual, decisive contrast, or
construct-preserving alternate representation. They SHOULD NOT add uninterrupted prose,
decorative history, repeated definitions, or jargon volume. No word-count threshold proves clarity;
novice walkthrough evidence is required.

### 6.5 Question/evidence plan

The item plan remains part of the script subject but has separate gate checks. It MUST establish
activity role, exact item and family lineage, first-attempt immutability, assistance, feedback
release, omission/retry/reveal/invalid behavior, near versus changed function, answer/rationale
authority, learner projection, assets, eligibility, and exposure.

Near-use and changed-task checks use separate untouched families. Worked, guided, solo, repair,
entry, exit, and downstream roles obey the Spec 03 firewall. Protected answers, rubrics, scoring,
and pre-release explanations remain server-only.

### 6.6 Coverage-question loop

For every required KC, the author and validator ask:

- Where is it oriented, taught, modeled, and worked aloud?
- Where is it practiced with guidance, less help, and no help?
- Where are its decisive contrast and bounds?
- Which exact immutable items perform near-use and changed-task checks?
- Which observable features trigger which repair?
- Which fresh item confirms the exact failed function after repair?
- Which dependencies are taught or authoritatively prior?
- Which representation and accessibility alternative preserve the construct?
- Which routes are applicable, inapplicable, or blocked, and why?
- Does every applicable route cover all 13 stages and terminate?
- Are unauthorized routes absent?
- Do all refs compile and remain reachable?

“Covered in prose” is not evidence. The matrix must point to compiled records.

---

## 7. Gate catalog, receipts, and separation of duties

### 7.1 Authoritative gate catalog

The external `GateCatalog` is a closed, hashed input produced by review governance. Each catalog
entry contains:

```text
check_id
category
check_scope: QUALITY_REPORT | RELEASE_RECORD
applicability_rule
allowed_evidence_types[]
reviewer_qualification_refs[]
minimum_reviewer_count
independence_constraint_ids[]
blocking_severities[]
```

Allowed `evidence_type` values are:

```text
HASH_MANIFEST | JSON_VALIDATOR_REPORT | SOURCE_TRACE |
REVIEWER_ANALYSIS | BLIND_SOLVE_RECEIPT | RIGHTS_LEDGER |
BROWSER_TRACE | ACCESSIBILITY_TRACE | RUNTIME_TRACE |
ANALYTICS_TRACE | PROTECTED_FIELD_SCAN |
SIGNED_CONTROLLER_RECEIPT
```

For this candidate catalog, every listed check has `applicability_rule=ALWAYS_FOR_CANONICAL_LESSON`.
The evidence column below is interpreted as a nonempty combination of:

| Category            | Allowed evidence types                                                                      |
| ------------------- | ------------------------------------------------------------------------------------------- |
| Curriculum          | `HASH_MANIFEST`, `JSON_VALIDATOR_REPORT`, `REVIEWER_ANALYSIS`                               |
| Script              | `JSON_VALIDATOR_REPORT`, `REVIEWER_ANALYSIS`, `RUNTIME_TRACE`                               |
| Question/evidence   | `JSON_VALIDATOR_REPORT`, `BLIND_SOLVE_RECEIPT`, `PROTECTED_FIELD_SCAN`, `REVIEWER_ANALYSIS` |
| Domain              | `REVIEWER_ANALYSIS`, `BLIND_SOLVE_RECEIPT`                                                  |
| Source              | `SOURCE_TRACE`, `REVIEWER_ANALYSIS`                                                         |
| Rights              | `RIGHTS_LEDGER`, `REVIEWER_ANALYSIS`, `SIGNED_CONTROLLER_RECEIPT`                           |
| Presentation        | `BROWSER_TRACE`, `JSON_VALIDATOR_REPORT`, `REVIEWER_ANALYSIS`                               |
| Accessibility       | `ACCESSIBILITY_TRACE`, `BROWSER_TRACE`, `REVIEWER_ANALYSIS`                                 |
| Novice clarity      | `REVIEWER_ANALYSIS`, `BROWSER_TRACE`                                                        |
| Runtime/integration | `RUNTIME_TRACE`, `JSON_VALIDATOR_REPORT`, `PROTECTED_FIELD_SCAN`                            |
| Analytics           | `ANALYTICS_TRACE`, `JSON_VALIDATOR_REPORT`, `REVIEWER_ANALYSIS`                             |
| Trust               | `HASH_MANIFEST`, `SIGNED_CONTROLLER_RECEIPT`, `JSON_VALIDATOR_REPORT`                       |
| Release             | `HASH_MANIFEST`, `SIGNED_CONTROLLER_RECEIPT`, `JSON_VALIDATOR_REPORT`                       |

The candidate complete check-ID catalog is:

| Check ID   | Category            | Required evidence                                                                          | Reviewer/cardinality                                  |
| ---------- | ------------------- | ------------------------------------------------------------------------------------------ | ----------------------------------------------------- |
| `CUR-001`  | Curriculum          | Registry/manifest/freeze pins                                                              | Curriculum binding reviewer, 1                        |
| `CUR-002`  | Curriculum          | Lesson/grouping/KC set and order proof                                                     | Curriculum binding reviewer, 1                        |
| `CUR-003`  | Curriculum          | Graph, sequence, attachment, hold, no-bypass proof                                         | Curriculum binding reviewer, 1                        |
| `CUR-004`  | Curriculum          | Scope and knowledge-dependency closure                                                     | Curriculum binding reviewer, 1                        |
| `SCR-001`  | Script              | All 13 stages for applicable routes                                                        | Instructional design reviewer, 1                      |
| `SCR-002`  | Script              | Explain-before-consequence trace                                                           | Instructional design reviewer, 1                      |
| `SCR-003`  | Script              | Throughline, expert model, fading, bounds                                                  | Instructional design reviewer, 1                      |
| `SCR-004`  | Script              | Route applicability and absence proofs                                                     | Curriculum + runtime reviewers, 1 each                |
| `SCR-005`  | Script              | Duration, checkpoint, handoff bindings                                                     | Runtime reviewer, 1                                   |
| `QEV-001`  | Question/evidence   | Immutable item/version/hash bindings                                                       | Question/evidence reviewer, 1                         |
| `QEV-002`  | Question/evidence   | KC, operation, role, mapping alignment                                                     | Question/evidence reviewer, 1                         |
| `QEV-003`  | Question/evidence   | Family firewall and first-attempt proof                                                    | Question/evidence reviewer, 1                         |
| `QEV-004`  | Question/evidence   | Omission, help, reveal, retry, invalid behavior                                            | Question/evidence reviewer, 1                         |
| `QEV-005`  | Question/evidence   | Server-only scoring/explanation boundary                                                   | Security/scoring reviewer, 1                          |
| `QEV-006`  | Question/evidence   | Mastery-seam metadata closure (§5.1.7) complete on every binding                           | Question/evidence reviewer, 1                         |
| `QEV-007`  | Question/evidence   | `INDEPENDENT` declarations carry `reasoning_operation`; no authored mastery field (§5.1.8) | Question/evidence + evidence-policy reviewers, 1 each |
| `DOM-001`  | Domain              | Facts, equations, terms, bounds                                                            | Qualified domain reviewers, 2                         |
| `DOM-002`  | Domain              | Keys/rubrics and alternative answers                                                       | Qualified domain reviewers, 2                         |
| `DOM-003`  | Domain              | Changed-task construct preservation                                                        | Domain + question reviewers, 1 each                   |
| `SRC-001`  | Source              | Claim-to-ledger factual authority trace                                                    | Source reviewer, 1                                    |
| `RGT-001`  | Rights              | Input rights, originality, similarity, assets                                              | Rights reviewer, 1                                    |
| `DES-001`  | Presentation        | Rhythm, one job/action, disclosure                                                         | Presentation reviewer, 1                              |
| `DES-002`  | Presentation        | Script/UI node parity                                                                      | Presentation + runtime reviewers, 1 each              |
| `DES-003`  | Presentation        | Main-app title/navigation/token parity                                                     | Frontend reviewer, 1                                  |
| `DES-004`  | Presentation        | Learner/reviewer and protected separation                                                  | Presentation + security reviewers, 1 each             |
| `A11Y-001` | Accessibility       | Keyboard, focus, semantics                                                                 | Accessibility reviewer, 1                             |
| `A11Y-002` | Accessibility       | Contrast, zoom, targets, reflow                                                            | Accessibility reviewer, 1                             |
| `A11Y-003` | Accessibility       | Equivalent representations and reduced motion                                              | Accessibility + domain reviewers, 1 each              |
| `A11Y-004` | Accessibility       | Every-branch 375/320 and 2D exception proof                                                | Accessibility reviewer, 1                             |
| `NOV-001`  | Novice clarity      | Focus/changed/next walkthrough                                                             | Novice clarity reviewer, 1                            |
| `NOV-002`  | Novice clarity      | Jargon, reading, directions                                                                | Novice clarity reviewer, 1                            |
| `RUN-001`  | Runtime/integration | Complete `LessonDefinition` mapping                                                        | Runtime reviewer, 1                                   |
| `RUN-002`  | Runtime/integration | Planner resolution and applicable route execution                                          | Runtime reviewer, 1                                   |
| `RUN-003`  | Runtime/integration | Consequential branch simulation                                                            | Runtime reviewer + blind solver, 1 each               |
| `RUN-004`  | Runtime/integration | Reentry, replay, termination, completion                                                   | Runtime reviewer, 1                                   |
| `ANA-001`  | Analytics           | Event and analytics contract completeness                                                  | Analytics reviewer, 1                                 |
| `ANA-002`  | Analytics           | No false evidence/mastery/readiness emission                                               | Analytics + evidence reviewers, 1 each                |
| `TRU-001`  | Trust               | Foundation/W00 pinset and toolchain hashes                                                 | Integration controller, 1                             |
| `TRU-002`  | Trust               | Identity, receipt, signature, and role graph                                               | Trust reviewer, 1                                     |
| `REL-001`  | Release             | Quality-report receipt, four-subject graph, decisions, claims                              | Final approver, 1                                     |

The pinned catalog may add stricter checks only through a governed revision. A validator rejects an
omitted required check. A conditional check uses `NOT_APPLICABLE` only with the catalog's exact
applicability rule and authority evidence; missing applicability evidence is `BLOCKED`.
`REL-001` alone has `check_scope=RELEASE_RECORD`; every other row has
`check_scope=QUALITY_REPORT`. The quality report MUST NOT contain or approve `REL-001`. The release
controller evaluates it only after a detached final-approval receipt for the quality-report subject
exists.

### 7.2 Role sets and explicit disjointness

Let:

- `A` = all subject authors;
- `F` = final approvers;
- `Q` = question, key, rubric, or rationale authors;
- `B` = blind solvers;
- `S` = source selectors;
- `P` = prose/figure/item authors; and
- `R` = rights approvers.

Required set constraints are:

```text
A ∩ F = ∅
Q ∩ B = ∅
(S ∪ P) ∩ R = ∅
B ∩ F = ∅
```

The primary author also MUST be disjoint from every reviewer role that approves that same subject,
unless a pinned role-compatibility matrix expressly permits a nonapproval advisory role. Account,
agent-run, or credential aliases resolve to one trusted identity before set comparison.

### 7.3 Receipt evidence

Every approval receipt includes the trusted identity, execution ID, exact subject hash, evidence
hashes, role, check IDs, result, issue time, gate-catalog hash, trust-profile ref, and either a valid
signature or controller attestation. Required qualifications and cardinality come from the gate
catalog. Self-asserted role names, unsigned JSON, paths, screenshots alone, or hashes without trusted
origin do not satisfy a check.

### 7.4 Deterministic results and failure precedence

Checks use `PASS`, `FAIL`, `REVISE`, `BLOCKED`, or `NOT_APPLICABLE`. Aggregate gates never use
`NOT_APPLICABLE`.

The quality report derives independent axes:

```text
safety_result =
  UNSAFE when any proven P0/P1, protected leak, false authority,
  invalid signature, material factual/key error, or unauthorized route exists;
  otherwise SAFE_NO_PROVEN_FAILURE

completeness_result =
  INCOMPLETE when any required pin, check, receipt, evidence, route decision,
  or dependency is missing; otherwise COMPLETE

correction_result =
  CORRECTION_REQUIRED when any P2 or other reviewable defect remains;
  otherwise CLEAN
```

Final precedence is:

```text
if safety_result = UNSAFE:
  derived_final_status = FAIL
else if completeness_result = INCOMPLETE:
  derived_final_status = BLOCKED
else if correction_result = CORRECTION_REQUIRED:
  derived_final_status = REVISE
else:
  derived_final_status = PASS
```

A proven unsafe failure is never masked by missing evidence.

### 7.5 Adversarial prompts

Reviewers MUST try to find:

- a required KC or stage omitted from an applicable route;
- an unauthorized `PREREQUISITE_SUPPORT` or misconception route;
- an item whose version, family, projection, scoring, asset, or eligibility record can drift;
- a dependency on untaught or out-of-scope content;
- a “changed” item that changes only surface details;
- a hint, explanation, asset, or reviewer view that contaminates a family;
- a repair that returns to the wrong function;
- an inaccessible representation that changes the construct;
- a duplicate title, side rail, debug control, or non-main-app component;
- a receipt that approves a different hash or violates set disjointness; and
- a `BLOCKED` result hiding an already proven P0/P1 failure.

---

## 8. Presentation and learner UI

### 8.1 Standard rhythm

Every applicable learner path makes this rhythm recognizable:

```text
Starting check
  → Focus now
  → Explain
  → Worked visual
  → Guided practice
  → Less help
  → On your own
  → Final near and changed checks
  → targeted repair and exact reentry when needed
  → completion
```

Completion means delivery completion under Spec 03, not mastery.

### 8.2 One primary job and progressive disclosure

Each screen MUST have one primary cognitive job, at most one primary action, at most one important
callout, and a focused centered column unless the construct requires a wider reading/diagram region.
Glossary and optional detail remain collapsed. Required teaching MUST NOT be hidden as optional.
Fading levels MUST NOT be stacked into one worksheet.

The learner should see simple progress labels, not internal assistance codes. Deeper explanation
comes from chunking, worked reasoning, and visual structure, not prose volume.

### 8.3 Learner/reviewer separation

Learner teaching screens MUST NOT show keys, pre-release rationales, internal IDs, hashes, schemas,
run/event/exposure/gate data, governance text, A0–A3 labels, checkpoint jumpers, branch forcing,
reviewer tabs, or debug controls. One preview warning MAY appear in the quarantined preview shell,
not repeatedly in teaching content.

Reviewer, blind-solve, accessibility, and learner routes are distinct derived clients. Key exposure
contaminates the semantic family. Current preview code that ships answer-bearing data in the client
bundle is a quarantined fixture and cannot satisfy production separation.

### 8.4 Main-app parity and focused navigation

The lesson client MUST bind exact hashes for `@mcat/design-tokens`, `@mcat/ui-web`, and the main-app
navigation contract. It MUST use the pinned main-app typography, spacing, controls, focus treatment,
theme behavior, and component semantics.

During a focused lesson:

- exactly one visible primary `<h1>` exists in the main lesson region;
- the app shell, top bar, and lesson component MUST NOT create duplicate H1s;
- no persistent global side rail or bottom navigation competes with the lesson;
- focused navigation is limited to lesson back/close, progress, pause, and the current primary
  action;
- learner debug/reviewer controls count is zero; and
- the primary title remains visible and programmatically associated with the lesson region.

Required browser assertions include:

```text
visible_primary_h1_count = 1
visible_h1_outside_lesson_main_count = 0
visible_competing_side_rail_count = 0
visible_global_bottom_nav_count = 0
visible_learner_debug_control_count = 0
main_app_token_violation_count = 0
unapproved_component_violation_count = 0
```

### 8.5 Subject-specific representations

| Texture                 | Construct-preserving presentation                                                                      |
| ----------------------- | ------------------------------------------------------------------------------------------------------ |
| Biological redox        | Electron/proton ledger aligned to both changing oxygen bonds; unchanged tail de-emphasized but present |
| Geometrical optics      | Ray diagram with normal/foci, physical rays, dashed extensions, and sign/position cues                 |
| Research design         | Participant flow through recruitment, assignment/exposure, measurement, attrition, and bounded claim   |
| Associative learning    | Cue/response/consequence/timing and comparison-condition contingency diagram                           |
| CARS argument structure | Argument map linked to exact anchors in an intact original passage                                     |

Every visual has a script-owned semantic representation record, text/nonvisual alternative,
construct-preservation judgment, and reduced-motion/static fallback. UI choice cannot alter meaning,
omit KCs, leak answers, or invent evidence.

### 8.6 Cognitive load and accessibility

- Signaling directs attention without cueing a scored answer.
- Related words and visuals stay spatially associated.
- Decorative illustration, motion, repeated chrome, and unnecessary jargon are removed.
- New jargon is defined at first necessary use.
- Directions name the learner action, not only the gesture.
- Keyboard order, visible focus, status announcements, semantic controls, contrast, text resize,
  touch targets, reduced motion, tables, charts, SVG, math, and screen-reader alternatives MUST
  satisfy the pinned accessibility profile.
- Text and controls MUST meet WCAG 2.2 AA contrast; focus MUST remain visible and unobscured.
- Primary controls SHOULD use the pinned main-app `--mc-touch` target of 48 CSS px and MUST satisfy
  the pinned WCAG target-size/spacing rules and documented exceptions.
- Tables, charts, SVG, and equations MUST expose names, relationships, reading order, and a
  construct-preserving nonvisual operation; alt text that only names the object is insufficient.
- Word count alone cannot pass reading quality.

### 8.7 Every-branch 375 px and 320 px policy

Every primary screen on every applicable route and consequential repair branch MUST execute at both
375 px and 320 px widths. Page-level horizontal scroll is prohibited.

A deterministic contained pan/zoom exception is allowed only for a construct-essential 2D diagram
or table when:

1. the overflow is confined to a labeled component;
2. the page itself has no horizontal scroll;
3. pan/zoom controls and the primary action remain visible and keyboard operable;
4. focus is never lost or trapped;
5. the text/nonvisual alternative preserves the construct or records different evidence semantics;
6. reduced-motion/static behavior remains available; and
7. accessibility and domain reviewers approve exact evidence semantics.

Ordinary prose, answer choices, forms, progress, and navigation never qualify for the exception.

### 8.8 Browser evidence and novice walkthrough

The exact learner-safe build MUST provide reproducible evidence for desktop, every branch at 375 px
and 320 px, light/dark where supported, keyboard/focus, 200% zoom, reduced motion, screen-reader/text
equivalence, touch targets, contained 2D exceptions, and learner-only versus reviewer screenshots.

At each transition, an unbriefed novice-clarity reviewer must answer:

1. What should I focus on?
2. What changed?
3. What do I do next?

Screenshots alone do not prove interaction or accessibility.

---

## 9. Compile and runtime gate

### 9.1 Field-by-field `LessonDefinition` mapping

The pinned compiler maps immutable subjects and verified external evidence as follows:

| Spec 03 `LessonDefinition` field                | Required producer                                                     |
| ----------------------------------------------- | --------------------------------------------------------------------- |
| `registry_binding`                              | Common subject `registry_binding`                                     |
| `lesson_id`, `grouping_id`                      | Script payload, exact registry match                                  |
| `ordered_kc_ids`, `ordered_required_kc_ids`     | Script payload, matrix equality proof                                 |
| `content_version`                               | Script `subject_version`                                              |
| `reviewed_content_hash`                         | Script `subject_sha256`, only after required detached receipts verify |
| `throughline`, `scope_and_non_goals`            | Script payload                                                        |
| `shell_checkpoint_map`                          | Script `shell_contract`, runtime-policy schema                        |
| `shell_duration_model`                          | Script `shell_contract`, segment-only timing policy                   |
| `kc_microcycles[]`                              | Script `kc_scripts`, matrix proof                                     |
| `transition_definitions[]`                      | Script transition records                                             |
| `extension_bindings[]`, `support_bindings[]`    | Script attachment records                                             |
| `capstone_references[]`, `revisit_references[]` | Script attachment records                                             |
| `event_contract`                                | Script shell/KC instances plus runtime-policy package                 |
| `accessibility_contract`                        | Script semantics plus presentation realization                        |
| `rights_and_approval_record`                    | Verified detached rights receipts and release/status record refs      |

Each `KcMicrocycleDefinition` maps:

| Spec 03 field                                | Required producer                                                      |
| -------------------------------------------- | ---------------------------------------------------------------------- |
| Identity, ordinal, outcome, scope, archetype | Script KC/objective/scope records                                      |
| Expert task model                            | Script mental model, think-aloud, and worked records                   |
| Prerequisite points of use                   | Registry refs and script dependency records                            |
| Route policy                                 | Route applicability plus runtime-policy package                        |
| Representation plan                          | Script representation/equivalence records and presentation realization |
| Direct instruction/worked decision           | Script stage refs                                                      |
| Guided graph/assistance ladder               | Script activities plus runtime-policy predicates                       |
| Contrast/boundary plan                       | Script contrast refs                                                   |
| Near/changed exits                           | Immutable item bindings                                                |
| Immediate repair graph                       | Script repair nodes and runtime repair policy                          |
| Planner handoff rules                        | Script KC rules plus runtime-policy package                            |
| Exact reentry bindings                       | Canonical `NEAR_USE`/`CHANGED_TASK` bindings                           |
| Checkpoint map                               | Script KC checkpoint map                                               |
| Segment/microcycle duration models           | Script KC models                                                       |
| Analytics bindings                           | Script KC bindings plus event/analytics policy                         |

The compiler MUST reject a missing field or unpinned policy package. It cannot synthesize a required
field from UI code.

### 9.2 Learner-safe compile and parity

Compilation consumes the exact script and presentation subjects, validates the matrix, and emits a
Spec 03 `LessonDefinition`, server authority bundle, and cue-safe learner DTO. It MUST:

- preserve all subject and dependency hashes;
- emit every required authorized node on applicable routes;
- reject UI-only teaching, orphan nodes, and unreachable content;
- map every item to one primary KC and role;
- keep keys, scoring, and pre-release explanations server-only;
- reject unknown representation/action kinds;
- reject any binding that fails the §5.1.7 metadata closure, that declares `INDEPENDENT` in
  `candidate_evidence_modes` without a `reasoning_operation`, that uses a value outside a closed
  seam vocabulary, or that contains an authored `independent`, `pL`, mastery threshold or status,
  decay, or evidence-status field; and
- produce deterministic manifests and parity evidence.

Protected-field scanning is defense in depth, not semantic proof.

The compiler MUST NOT supply a default `candidate_evidence_modes`, a default `reasoning_operation`,
or a default `dok_level`. A missing `candidate_evidence_modes` is a compile failure; a missing
`reasoning_operation` on a binding declaring `INDEPENDENT` is a compile failure; a missing
`dok_level` compiles unchanged and is preserved as absent, because `coldStartB(undefined)` is a
neutral `0`.

### 9.3 Planner and route execution

The runner accepts only a planner-owned `PlannerInstructionResolution`. It validates the route under
Spec 03 and may accept it, perform an explicitly authorized downgrade to `STANDARD`, or return to
the planner. It never thresholds a posterior or creates a route.

The integrated gate executes only routes marked `APPLICABLE`, while proving `NOT_APPLICABLE` and
`BLOCKED` routes have no executable branch. `PREREQUISITE_SUPPORT` additionally requires the
runtime qualification described in §5.1.4.

For each applicable route, execute correct work, every authored assistance state, hint, reveal,
retry, omission, invalid-item replacement, near failure, changed failure, every repair, maximum
repair cycle, pause/resume, crash/replay, fresh-family exhaustion, planner handoff, exact reentry,
KC exit, and shell completion.

Every path terminates, pauses at a valid checkpoint, or returns to the planner.

### 9.4 Completion and evidence boundaries

Shell completion uses exact `ordered_required_kc_ids`. Under current policy every listed KC must
emit instructional exit. Entry checks never satisfy exit. Lesson exposure never creates downstream
mastery, readiness, or protected evidence. First attempts and exposure survive retries, invalidity,
pause, crash, retirement, and replay.

Lesson delivery state and mastery are separate axes. Completion, checkpoint, and repair state are
Spec 03 runtime facts; a lesson-grain mastery value is a **derived rollup** of the `pL` of the
lesson's required member KCs, computed on read by policy. Lessons have no mastery state of their own,
and a lesson MUST NOT be a mastery-update target. The rollup rules — arithmetic mean for display,
`mastered` only when every required KC clears the threshold, review-due when any previously practiced
required KC is due, the `0.20` prior contributed by a missing KC state, and fail-closed behaviour on a
missing or empty lesson-to-KC mapping — are normative in the
[Lesson → Evidence → Mastery Contract](../lesson-evidence-mastery-contract.md) §9.

Under the current authored state, every V3 lesson binding normalizes to
`candidate_evidence_modes: ['INSTRUCTIONAL']` or `['INSTRUCTIONAL_EXIT']`. Both route to
instructional evidence with server-derived `independent: false`, so current V3 lessons move no `pL`
at all. That is the intended end state for instructional exits, not an incomplete integration: a
binding becomes mastery-eligible only when an author and reviewer deliberately declare `INDEPENDENT`
and label `reasoning_operation`.

---

## 10. Designated golden candidates, W00, and scale

### 10.1 Five designated candidates

| Candidate                                 | Lesson ID       | Required KCs | Validation texture                                    |
| ----------------------------------------- | --------------- | -----------: | ----------------------------------------------------- |
| Follow electrons through biological redox | `V3-LES-329622` |            1 | Molecular structure plus electron/proton accounting   |
| Predict images with lenses and mirrors    | `V3-LES-443492` |            5 | Ray diagrams, equations, and compound systems         |
| Design studies and judge conclusions      | `V3-LES-765609` |            5 | Participant/design flow, variables, ethics, inference |
| Connect cues, consequences, and behavior  | `V3-LES-225658` |            4 | Construct discrimination and contingency diagrams     |
| Map the structure of an argument          | `V3-LES-386478` |            3 | Intact passages and argument maps                     |

The five cover 18 KCs. Their current code is quarantined, not golden and not a production
`LessonDefinition`.

### 10.2 Pre-W00 exception

Before W00, work is limited to:

1. revising the existing five quarantined viewer pilots for design comparison; and
2. noncanonical renderer fixtures that do not use a canonical artifact ID or claim canonical
   coverage.

These may produce internal visual evidence only. They MUST NOT claim:

- canonical lesson-draft completion;
- Spec 04 conformance;
- trusted review completion;
- production item or route evidence;
- mastery/readiness; or
- eligibility to seed the remaining 109 jobs.

### 10.3 Required foundation and W00 prerequisites

Before any later canonical internal or production authoring wave, the integration controller MUST
verify:

- an externally trusted signed foundation pinset;
- exact schema IDs/versions/hashes for all four subjects, receipts, release records, learner DTO,
  runtime, and item contracts;
- pinned validator, compiler, renderer, browser/accessibility harness, and opaque scoring builds;
- signing keys, production trust root, identity trust profile, and role graph;
- exact route/reentry, checkpoint, event, analytics, duration, accessibility, and protected-content
  policies;
- v7 item-role eligibility and reservation/exposure adapter;
- compiler-derived learner/blind/accessibility clients;
- signed scoring-service deployment/ACL and request/response receipts;
- source ledgers, rights inputs, reviewer assignments, and complete gate catalog; and
- no open global decision whose `blocking_scope` includes W00.

Test fixtures validate validators only. They cannot satisfy W00.

### 10.4 Candidate validation and scale

A designated candidate may become a reviewed golden candidate only after its four subjects,
detached receipts, release/status record, script gate, presentation gate, integrated gate, and W00
toolchain all verify with no open P0/P1/P2. This remains structural status, not efficacy.

The remaining 109 production jobs MUST NOT launch until:

- this standard passes the next audit and is pinned;
- all global decisions blocking W00/scale close with receipts;
- all five candidates pass against the same pinned toolchain; and
- shared defects are fixed and selectively revalidated.

### 10.5 Change control

A changed normative rule creates a new Spec 04 version and decision-register hash. A changed
artifact creates a new subject/version/hash. A changed item, asset, policy, schema, or dependency
invalidates downstream subjects and receipts according to the hash graph. The release controller
appends status and revision records; it never mutates prior subjects or receipts.

Only impacted drafts are regenerated. Impact is determined from typed dependencies, not from file
names or author assertion.

---

## 11. Redox exemplar

This is an illustrative contract example, not a full lesson, scored question, answer key, route
authorization, or approval claim.

### 11.1 Canonical input and boundary

- Lesson `V3-LES-329622`
- Grouping `V3-CL-329622`
- Required KC `V3-KC-271440`
- Competence: relate hydroquinone/ubiquinone structures to biological two-electron redox-center
  behavior
- Source anchors `CP-SA-022` and `CP-SA-023`
- Registry hard prerequisites for this KC: none

```text
Q + 2 H+ + 2 e- -> QH2
```

The learner tracks two changing oxygens and their bonds while the carrier tail remains unchanged.
This is net endpoint accounting, not an elementary mechanism. The author MUST NOT invent
intermediates.

### 11.2 Route applicability

| Route                  | Candidate state  | Authority                                                                  |
| ---------------------- | ---------------- | -------------------------------------------------------------------------- |
| `STANDARD`             | `APPLICABLE`     | Canonical KC plus Spec 03 standard route                                   |
| `CONCISE`              | `BLOCKED`        | Requires the missing pinned routing/runtime-policy package                 |
| `MISCONCEPTION`        | `BLOCKED`        | Requires an approved disambiguation/model package                          |
| `PREREQUISITE_SUPPORT` | `NOT_APPLICABLE` | KC record has no hard predecessor; absence proof binds the registry record |

No prerequisite-support nodes may compile for this KC. If a future registry revision adds a hard
point-of-use predecessor, that is a new authority input and requires new subject hashes.

### 11.3 Coverage and sequence

The standard route coverage row binds:

- entry boundary for low-stakes electron-gain/loss language;
- plain orientation to changing center versus invariant tail;
- a mental model aligning electron/proton accounting with both oxygen positions;
- expert think-aloud and a worked endpoint example;
- guided, lighter-support, and solo ledger use;
- contrast against reversed electron direction, one-oxygen change, oxygen-count shortcut, tail
  change, and mechanism overclaim;
- separate immutable near-use and changed-task item families;
- feature-specific repair; and
- fresh exact reentry to `NEAR_USE` or `CHANGED_TASK`.

The dependency proof must show that every symbol and structural demand is taught or source-bound.

### 11.4 Presentation

The worked visual places endpoint structures and the ledger in one focused region. Matched
noncolor markers identify the same two oxygens. The tail remains visible and labeled unchanged.
The text equivalent states electron/proton direction, both bond changes, unchanged oxygen count,
unchanged tail, and the accounting-not-mechanism boundary.

At 375 px and 320 px, the ordinary redox visual MUST reflow without horizontal scrolling; it does
not qualify for the construct-essential 2D pan/zoom exception.

---

## Appendix A. Author completion checklist

- [ ] Registry, manifest byte hash, freezes, lesson, grouping, and KC order are exact.
- [ ] Work is within the five-candidate/noncanonical pre-W00 exception or W00 is verified.
- [ ] Every ambiguity has a typed blocker; no scope or route was invented.
- [ ] Source ledger and processing-rights inputs are exact.
- [ ] The script subject contains no approval, workflow status, or self-hash.
- [ ] Subject hash excludes the digest and all detached receipts/status.
- [ ] Every required KC has all 13 stages on each applicable route.
- [ ] Every route has `APPLICABLE`, `NOT_APPLICABLE`, or `BLOCKED` plus authority.
- [ ] Prerequisite support has an exact hard edge/point of use or is absent.
- [ ] Explanation and worked reasoning precede consequential questions.
- [ ] Every item has complete immutable versions/hashes, projection, scoring, assets, and eligibility.
- [ ] Every binding satisfies the §5.1.7 mastery-seam metadata closure.
- [ ] Every binding declaring `INDEPENDENT` carries exactly one `reasoning_operation`.
- [ ] No binding authors `independent`, a `pL`, a mastery threshold or status, decay, or an evidence status.
- [ ] Near and changed functions use separate untouched families.
- [ ] Failed functions use `NEAR_USE` or `CHANGED_TASK`.
- [ ] Representations and accessibility equivalence originate upstream in the script.
- [ ] Shell/KC durations, checkpoints, handoff, events, analytics, rights, and accessibility bind.
- [ ] Coverage proves dependency closure and compiled reachability.
- [ ] No protected key or pre-release explanation reaches the learner client.

## Appendix B. Script and question reviewer checklist

- [ ] Exact subject hash recomputes.
- [ ] Complete gate catalog is present; no check ID is omitted.
- [ ] Curriculum identity, scope, relations, attachments, and holds pass.
- [ ] Applicable routes cover all 13 stages; unauthorized routes have no executable nodes.
- [ ] Facts, equations, terms, keys/rubrics, and bounds are correct.
- [ ] Worked reasoning exposes cues, intermediate states, rejected alternatives, and checks.
- [ ] All item/dependency/family/exposure records are immutable and complete.
- [ ] No item depends on untaught or out-of-scope knowledge.
- [ ] Repair is bounded and reenters the exact failed function.
- [ ] Blind solver received no key/rationale and satisfies set disjointness.
- [ ] Source and rights receipts bind the exact subject hash.
- [ ] No internal review is described as learner validation.

## Appendix C. Presentation reviewer checklist

- [ ] Standard rhythm is recognizable.
- [ ] Every screen has one job/action and at most one important callout.
- [ ] Required teaching is not hidden as optional detail.
- [ ] Learner/reviewer clients are separate and learner debug controls are zero.
- [ ] Exactly one visible primary H1 exists; no app-shell/lesson duplicate exists.
- [ ] No global side rail or bottom navigation competes during focused lessons.
- [ ] Pinned main-app tokens, components, theme, and navigation contract are used.
- [ ] Script/UI parity and representation refs are exact.
- [ ] Every applicable branch passes desktop, 375 px, and 320 px.
- [ ] Any 2D overflow is contained, approved, keyboard operable, and construct preserving.
- [ ] Keyboard, focus, contrast, zoom, touch, reduced motion, and screen-reader checks pass.
- [ ] The novice reviewer can state focus, change, and next action.

## Appendix D. Integrated QA checklist

- [ ] Foundation pinset, trust profile, schemas, toolchain, policies, and gate catalog are exact.
- [ ] All four subject hashes and dependency edges recompute.
- [ ] All required detached receipts verify and satisfy cardinality/qualification.
- [ ] Set-disjointness constraints pass on trusted identities.
- [ ] Complete Spec 03 field mapping compiles without invented defaults.
- [ ] Only applicable routes execute; inapplicable/blocked routes are absent.
- [ ] Entry checks never select the route or count as exit.
- [ ] First attempts and exposure survive every retry/interruption.
- [ ] Every repair reenters `NEAR_USE` or `CHANGED_TASK` exactly.
- [ ] Pause/resume, invalid items, family exhaustion, handoff, and termination pass.
- [ ] Shell completion uses `ordered_required_kc_ids`.
- [ ] Safety failure precedence is applied before completeness.
- [ ] Release/status record is append-only and binds all receipts/decisions.
- [ ] Claim limits remain false unless a separate authority proves otherwise.

## Appendix E. Internally coherent blocked fixture

This fixture demonstrates the acyclic subject/detached-status shape. It is intentionally
`BLOCKED`: production schemas, the W00 pinset, complete node/item assets, browser/runtime evidence,
and review receipts are absent. No component claims `PASS` or `REVISE`. All unresolved fixture refs
map to the blockers in E.6.
`FIXTURE-JCS-1` uses RFC 8785 JSON Canonicalization Scheme for these integer/string/boolean
subjects.

**0.3-candidate note.** This fixture was frozen under 0.2-candidate and does not yet carry the
§5.1.7 mastery-seam closure on its item bindings, so it is non-conforming under 0.3-candidate and
adds a further reason for its `BLOCKED` status. It is deliberately left byte-identical here: every
`subject_sha256` in E.1–E.5 is SHA-256 over the RFC 8785 canonical UTF-8 bytes of its own `subject`
value, and the register hash in H.2 is SHA-256 over the RFC 8785 canonical JSON array of the
decision records in listed order. Adding the closure fields by hand would invalidate all of them.
Regeneration is a separate governed task: add the closure fields, then recompute each
`subject_sha256` with the pinned canonicalizer in dependency order (`LessonScript` →
`KcCoverageMatrix` → `LessonPresentationPlan` → `LessonQualityReport` → release/status record),
propagating each new digest into every downstream binding before recomputing the next.

### E.1 `LessonScript`

```json
{
  "subject": {
    "artifact_type": "LESSON_SCRIPT",
    "artifact_id": "V3-LSCR-329622",
    "subject_version": "0.2.0-fixture",
    "schema_binding": {
      "schema_id": "FIXTURE-LESSON-SCRIPT-SCHEMA",
      "schema_version": "0.2.0",
      "schema_sha256": "0000000000000000000000000000000000000000000000000000000000000000",
      "producer_id": "FIXTURE-ONLY"
    },
    "registry_binding": {
      "registry_artifact_id": "MCAT-V3-AUTHORITATIVE-REGISTRY-2026-07-22-01",
      "registry_sha256": "635c39e9c0ebb28a3892399449aa9b74893aae3264924cd739b92b6e370ba26a",
      "phase_0_freeze_id": "MCAT-V3-PHASE0-FRZ-2026-07-22-01",
      "canonical_freeze_id": "MCAT-V3-CANONICAL-FRZ-2026-07-22-01",
      "graph_freeze_id": "MCAT-V3-GRAPH-FRZ-2026-07-22-01",
      "sequence_freeze_id": "MCAT-V3-SEQUENCE-FRZ-2026-07-22-01",
      "manifest_schema_version": "mcat-v3-lesson-authoring-manifest-2",
      "manifest_sha256": "3bbe04ae878fe3936b65bb941ce658f2e48fb104670d7b3c3ad1d243cb99eac9",
      "lesson_id": "V3-LES-329622",
      "grouping_id": "V3-CL-329622",
      "ordered_kc_ids": ["V3-KC-271440"],
      "ordered_required_kc_ids": ["V3-KC-271440"]
    },
    "decision_register_binding": {
      "register_id": "SPEC04-DECISION-REGISTER",
      "register_version": "0.2.0",
      "register_sha256": "bfa92db982c5c3730a8b3e4cbe7f8a44a423794f95c945279548030c78ed2354",
      "producer_id": "SPEC04-GOVERNANCE"
    },
    "authors": [
      {
        "identity_ref": "FIXTURE-AUTHOR-01",
        "execution_id": "FIXTURE-EXEC-01",
        "author_role": "PRIMARY_AUTHOR",
        "contribution": "STRUCTURAL_FIXTURE"
      }
    ],
    "input_bindings": [
      {
        "binding_id": "FIXTURE-SOURCE-LEDGER",
        "namespace": "SOURCE_LEDGER",
        "record_id": "FIXTURE-SOURCE-LEDGER-329622",
        "record_version": "0.1.0",
        "record_sha256": "0101010101010101010101010101010101010101010101010101010101010101",
        "schema_id": "FIXTURE-SOURCE-LEDGER-SCHEMA",
        "schema_version": "0.1.0",
        "schema_sha256": "0202020202020202020202020202020202020202020202020202020202020202",
        "producer_id": "FIXTURE-ONLY",
        "purpose": "STRUCTURE_ONLY"
      },
      {
        "binding_id": "FIXTURE-RUNTIME-POLICY",
        "namespace": "RUNTIME_POLICY_PACKAGE",
        "record_id": "FIXTURE-RUNTIME-POLICY-01",
        "record_version": "0.1.0",
        "record_sha256": "0303030303030303030303030303030303030303030303030303030303030303",
        "schema_id": "FIXTURE-RUNTIME-POLICY-SCHEMA",
        "schema_version": "0.1.0",
        "schema_sha256": "0404040404040404040404040404040404040404040404040404040404040404",
        "producer_id": "FIXTURE-ONLY",
        "purpose": "STRUCTURE_ONLY"
      }
    ],
    "dependency_bindings": [],
    "lineage": {
      "lineage_kind": "INITIAL",
      "authoring_execution_id": "FIXTURE-EXEC-01",
      "derived_from_refs": ["FIXTURE-SOURCE-LEDGER"],
      "change_reason": "AUDIT_BLOCKED_FIXTURE"
    },
    "payload": {
      "lesson_id": "V3-LES-329622",
      "grouping_id": "V3-CL-329622",
      "ordered_kc_ids": ["V3-KC-271440"],
      "ordered_required_kc_ids": ["V3-KC-271440"],
      "throughline": "Track electron direction through a biological redox center.",
      "scope_and_non_goals": {
        "scope_ref_ids": ["REDOX-SCOPE-IN", "REDOX-SCOPE-OUT"],
        "non_goal_ref_ids": ["REDOX-NONGOAL-MECHANISM"]
      },
      "source_ledger_binding_id": "FIXTURE-SOURCE-LEDGER",
      "runtime_policy_package_binding_id": "FIXTURE-RUNTIME-POLICY",
      "shell_contract": {
        "shell_duration_model": {
          "duration_model_id": "REDOX-SHELL-DURATION",
          "model_kind": "SHELL",
          "estimate_state": "HYPOTHESIS",
          "core_seconds": 0,
          "branch_seconds": 0,
          "transition_seconds": 0,
          "checkpoint_refs": [],
          "policy_binding_id": "FIXTURE-RUNTIME-POLICY"
        },
        "shell_checkpoint_map": {
          "checkpoint_map_id": "REDOX-SHELL-CHECKPOINTS",
          "checkpoint_refs": [],
          "resume_policy_binding_id": "FIXTURE-RUNTIME-POLICY"
        },
        "transition_definition_refs": [],
        "extension_binding_refs": [],
        "support_binding_refs": [],
        "capstone_reference_refs": ["V3-CAP-162024"],
        "revisit_reference_refs": [],
        "event_contract_binding": {
          "binding_state": "BLOCKED",
          "expected_namespace": "RUNTIME_POLICY_PACKAGE",
          "blocker_refs": ["BLK-FIX-002"]
        },
        "analytics_contract_binding": {
          "binding_state": "BLOCKED",
          "expected_namespace": "RUNTIME_POLICY_PACKAGE",
          "blocker_refs": ["BLK-FIX-002"]
        },
        "accessibility_contract_binding": {
          "binding_state": "BLOCKED",
          "expected_namespace": "RUNTIME_POLICY_PACKAGE",
          "blocker_refs": ["BLK-FIX-002"]
        },
        "rights_input_binding_refs": ["FIXTURE-SOURCE-LEDGER"],
        "planner_handoff_rules_binding": {
          "binding_state": "BLOCKED",
          "expected_namespace": "RUNTIME_POLICY_PACKAGE",
          "blocker_refs": ["BLK-FIX-002"]
        }
      },
      "objectives": [
        {
          "objective_id": "REDOX-OBJECTIVE-01",
          "kc_id": "V3-KC-271440",
          "competence_ref": "MANIFEST:V3-KC-271440",
          "observable_statement": "Track net electron direction at a biological redox center."
        }
      ],
      "scope_records": [
        {
          "scope_ref_id": "REDOX-SCOPE-IN",
          "kc_id": "V3-KC-271440",
          "scope_kind": "IN_SCOPE",
          "statement": "Net two-electron and two-proton endpoint accounting.",
          "authority_refs": ["MANIFEST:V3-KC-271440"]
        },
        {
          "scope_ref_id": "REDOX-SCOPE-OUT",
          "kc_id": "V3-KC-271440",
          "scope_kind": "OUT_OF_SCOPE",
          "statement": "Unspecified elementary intermediates.",
          "authority_refs": ["MANIFEST:V3-KC-271440"]
        },
        {
          "scope_ref_id": "REDOX-NONGOAL-MECHANISM",
          "kc_id": "V3-KC-271440",
          "scope_kind": "NON_GOAL",
          "statement": "Inferring an elementary mechanism from endpoint accounting.",
          "authority_refs": ["MANIFEST:V3-KC-271440"]
        }
      ],
      "source_claims": [
        {
          "source_claim_id": "REDOX-CLAIM-ACCOUNTING",
          "kc_id": "V3-KC-271440",
          "factual_statement": "Q + 2 H+ + 2 e- -> QH2 is a net endpoint ledger.",
          "source_ledger_refs": ["FIXTURE-SOURCE-LEDGER"],
          "rights_input_refs": ["FIXTURE-SOURCE-LEDGER"]
        }
      ],
      "knowledge_dependencies": [
        {
          "dependency_id": "REDOX-DEP-ELECTRON-LANGUAGE",
          "kc_id": "V3-KC-271440",
          "dependency_kind": "REQUIRED_KC_KNOWLEDGE",
          "statement": "Interpret electron gain and proton accounting.",
          "authority_refs": ["REDOX-CLAIM-ACCOUNTING"],
          "delivery_rule": "TAUGHT_IN_THIS_KC"
        }
      ],
      "misconception_features": [
        {
          "feature_id": "REDOX-FEATURE-DIRECTION",
          "kc_id": "V3-KC-271440",
          "observable_response_feature": "Reverses electron direction.",
          "prohibited_trait_inference": "Does not establish a stable learner misconception.",
          "disambiguation_authority_refs": ["BLK-FIX-003"],
          "repair_node_refs": ["REDOX-REPAIR"]
        }
      ],
      "representations": [
        {
          "representation_id": "REDOX-REP-STRUCTURE-LEDGER",
          "kc_id": "V3-KC-271440",
          "representation_kind": "STRUCTURE_AND_LEDGER",
          "information_encoded": ["TWO_CHANGING_OXYGENS", "UNCHANGED_TAIL", "ELECTRON_DIRECTION"],
          "decisive_feature": "Both marked oxygen bonds change while the tail does not.",
          "learner_operation": "ALIGN_STRUCTURE_CHANGE_WITH_NET_LEDGER",
          "instructional_warrant": "Supports endpoint accounting without mechanism invention.",
          "signaling_constraints": ["NONCOLOR_MARKERS", "TAIL_VISIBLE"],
          "source_claim_refs": ["REDOX-CLAIM-ACCOUNTING"]
        }
      ],
      "accessibility_equivalents": [
        {
          "accessibility_equivalent_id": "REDOX-ALT-STRUCTURED-TEXT",
          "representation_id": "REDOX-REP-STRUCTURE-LEDGER",
          "alternative_kind": "STRUCTURED_TEXT",
          "alternative_description": "Names both changing oxygen bonds, electron direction, and unchanged tail.",
          "learner_operation": "ALIGN_STRUCTURE_CHANGE_WITH_NET_LEDGER",
          "construct_preservation": "UNRESOLVED",
          "evidence_semantics": "BLOCKED_PENDING_REVIEW",
          "required_reviewer_qualification": "ACCESSIBILITY_AND_DOMAIN",
          "authority_refs": ["BLK-FIX-004"]
        }
      ],
      "content_blocks": [],
      "nodes": [],
      "activities": [],
      "item_bindings": [],
      "question_evidence_plan": {
        "question_evidence_plan_id": "REDOX-QEV-PLAN-01",
        "item_binding_refs": [
          "REDOX-BIND-NEAR",
          "REDOX-BIND-CHANGED",
          "REDOX-BIND-REPAIR-NEAR",
          "REDOX-BIND-REPAIR-CHANGED"
        ],
        "semantic_family_separation_proof_refs": [],
        "first_attempt_policy_ref": "FIXTURE-RUNTIME-POLICY",
        "feedback_release_policy_ref": "FIXTURE-RUNTIME-POLICY",
        "omission_retry_invalid_policy_refs": ["FIXTURE-RUNTIME-POLICY"],
        "protected_authority_refs": [],
        "review_check_ids": ["QEV-001", "QEV-002", "QEV-003", "QEV-004", "QEV-005"],
        "status": "BLOCKED",
        "blocker_refs": ["BLK-FIX-003"],
        "finding_refs": []
      },
      "kc_scripts": [
        {
          "kc_id": "V3-KC-271440",
          "canonical_ordinal": 1,
          "primary_microcycle_id": "REDOX-MICROCYCLE-01",
          "objective_ref": "REDOX-OBJECTIVE-01",
          "scope_in_refs": ["REDOX-SCOPE-IN"],
          "scope_out_refs": ["REDOX-SCOPE-OUT", "REDOX-NONGOAL-MECHANISM"],
          "source_claim_refs": ["REDOX-CLAIM-ACCOUNTING"],
          "required_knowledge_dependency_refs": ["REDOX-DEP-ELECTRON-LANGUAGE"],
          "prerequisite_point_refs": [],
          "entry_boundary_ref": "REDOX-ENTRY",
          "orientation_ref": "REDOX-ORIENTATION",
          "explanation_node_refs": ["REDOX-EXPLANATION"],
          "mental_model_refs": ["REDOX-MENTAL-MODEL"],
          "expert_think_aloud_refs": ["REDOX-THINK"],
          "worked_example_refs": ["REDOX-WORKED"],
          "guided_activity_refs": ["REDOX-GUIDED"],
          "light_support_activity_refs": ["REDOX-FADING"],
          "solo_activity_refs": ["REDOX-SOLO"],
          "contrast_boundary_refs": ["REDOX-CONTRAST"],
          "near_use_item_binding_refs": ["REDOX-BIND-NEAR"],
          "changed_task_item_binding_refs": ["REDOX-BIND-CHANGED"],
          "misconception_feature_refs": ["REDOX-FEATURE-DIRECTION"],
          "repair_node_refs": ["REDOX-REPAIR"],
          "exact_reentry_bindings": [
            {
              "failed_function": "NEAR_USE",
              "repair_node_ref": "REDOX-REPAIR",
              "fresh_confirmation_item_binding_ref": "REDOX-BIND-REPAIR-NEAR",
              "reentry_checkpoint_ref": "REDOX-REENTRY-NEAR",
              "preserved_success_policy_ref": "FIXTURE-RUNTIME-POLICY"
            },
            {
              "failed_function": "CHANGED_TASK",
              "repair_node_ref": "REDOX-REPAIR",
              "fresh_confirmation_item_binding_ref": "REDOX-BIND-REPAIR-CHANGED",
              "reentry_checkpoint_ref": "REDOX-REENTRY-CHANGED",
              "preserved_success_policy_ref": "FIXTURE-RUNTIME-POLICY"
            }
          ],
          "recap_ref": "REDOX-RECAP",
          "representation_refs": ["REDOX-REP-STRUCTURE-LEDGER"],
          "accessibility_equivalent_refs": ["REDOX-ALT-STRUCTURED-TEXT"],
          "route_applicability": [
            {
              "route": "STANDARD",
              "applicability": "APPLICABLE",
              "authority_refs": ["SPEC03:5.3"],
              "executable_entry_node_refs": ["REDOX-ENTRY"]
            },
            {
              "route": "CONCISE",
              "applicability": "BLOCKED",
              "authority_refs": ["OD04-010"],
              "blocker_refs": ["BLK-FIX-001"]
            },
            {
              "route": "MISCONCEPTION",
              "applicability": "BLOCKED",
              "authority_refs": ["SPEC03:5.6"],
              "blocker_refs": ["BLK-FIX-003"]
            },
            {
              "route": "PREREQUISITE_SUPPORT",
              "applicability": "NOT_APPLICABLE",
              "authority_refs": ["V3-KC-271440:HARD_PREREQUISITES:EMPTY"],
              "absence_proof_refs": ["MANIFEST:V3-KC-271440"]
            }
          ],
          "route_stage_coverage": [
            {
              "route": "STANDARD",
              "applicability": "APPLICABLE",
              "stage_proofs": [
                { "authoring_stage": "ENTRY_BOUNDARY", "script_refs": ["REDOX-ENTRY"] },
                { "authoring_stage": "ORIENTATION", "script_refs": ["REDOX-ORIENTATION"] },
                { "authoring_stage": "MENTAL_MODEL", "script_refs": ["REDOX-MENTAL-MODEL"] },
                {
                  "authoring_stage": "EXPERT_MODEL",
                  "script_refs": ["REDOX-THINK", "REDOX-WORKED"]
                },
                { "authoring_stage": "GUIDED_PRACTICE", "script_refs": ["REDOX-GUIDED"] },
                { "authoring_stage": "FADING", "script_refs": ["REDOX-FADING"] },
                { "authoring_stage": "SOLO_PRACTICE", "script_refs": ["REDOX-SOLO"] },
                { "authoring_stage": "CONTRAST_BOUNDS", "script_refs": ["REDOX-CONTRAST"] },
                { "authoring_stage": "NEAR_USE", "script_refs": ["REDOX-BIND-NEAR"] },
                { "authoring_stage": "CHANGED_TASK", "script_refs": ["REDOX-BIND-CHANGED"] },
                { "authoring_stage": "TARGETED_REPAIR", "script_refs": ["REDOX-REPAIR"] },
                {
                  "authoring_stage": "EXACT_REENTRY",
                  "script_refs": ["REDOX-REENTRY-NEAR", "REDOX-REENTRY-CHANGED"]
                },
                { "authoring_stage": "RECAP", "script_refs": ["REDOX-RECAP"] }
              ],
              "status": "BLOCKED",
              "blocker_refs": ["BLK-FIX-003"],
              "finding_refs": []
            },
            {
              "route": "CONCISE",
              "applicability": "BLOCKED",
              "blocker_refs": ["BLK-FIX-001"]
            },
            {
              "route": "MISCONCEPTION",
              "applicability": "BLOCKED",
              "blocker_refs": ["BLK-FIX-003"]
            },
            {
              "route": "PREREQUISITE_SUPPORT",
              "applicability": "NOT_APPLICABLE",
              "absence_proof_refs": ["MANIFEST:V3-KC-271440"]
            }
          ],
          "segment_ids": ["REDOX-SEGMENT-01"],
          "segment_duration_models": [
            {
              "duration_model_id": "REDOX-SEGMENT-DURATION",
              "model_kind": "SEGMENT",
              "estimate_state": "HYPOTHESIS",
              "core_seconds": 0,
              "branch_seconds": 0,
              "transition_seconds": 0,
              "checkpoint_refs": [],
              "policy_binding_id": "FIXTURE-RUNTIME-POLICY"
            }
          ],
          "microcycle_duration_model": {
            "duration_model_id": "REDOX-MICROCYCLE-DURATION",
            "model_kind": "MICROCYCLE",
            "estimate_state": "HYPOTHESIS",
            "core_seconds": 0,
            "branch_seconds": 0,
            "transition_seconds": 0,
            "checkpoint_refs": [],
            "policy_binding_id": "FIXTURE-RUNTIME-POLICY"
          },
          "checkpoint_map": {
            "checkpoint_map_id": "REDOX-KC-CHECKPOINTS",
            "checkpoint_refs": [],
            "resume_policy_binding_id": "FIXTURE-RUNTIME-POLICY"
          },
          "planner_handoff_rules": {
            "handoff_rules_id": "REDOX-HANDOFF",
            "terminal_state_refs": [],
            "repair_limit_state_refs": [],
            "planner_contract_binding_id": "FIXTURE-RUNTIME-POLICY"
          },
          "analytics_bindings": ["FIXTURE-RUNTIME-POLICY"]
        }
      ],
      "transition_definitions": [],
      "attachment_bindings": [
        {
          "attachment_id": "V3-CAP-162024",
          "attachment_kind": "CAPSTONE",
          "delivery_state": "REQUIRED",
          "registry_ref": "MANIFEST:V3-CAP-162024",
          "compile_behavior": "ACTIVE_REFERENCE"
        }
      ],
      "compilation_map": [
        {
          "target_field": "LessonDefinition",
          "producer_path": "subject.payload",
          "policy_binding_ids": ["FIXTURE-RUNTIME-POLICY"],
          "result": "BLOCKED",
          "blocker_refs": ["BLK-FIX-002", "BLK-FIX-003"]
        }
      ]
    }
  },
  "subject_digest": {
    "algorithm": "SHA_256",
    "canonicalization_profile_id": "FIXTURE-JCS-1",
    "subject_sha256": "b38b21a1aebdf969d27f3cdaa6728121f63fb3ecacedf8fabd6dacf10c6d381b"
  }
}
```

### E.2 `KcCoverageMatrix`

```json
{
  "subject": {
    "artifact_type": "KC_COVERAGE_MATRIX",
    "artifact_id": "V3-KCOV-329622",
    "subject_version": "0.2.0-fixture",
    "schema_binding": {
      "schema_id": "FIXTURE-KC-COVERAGE-SCHEMA",
      "schema_version": "0.2.0",
      "schema_sha256": "0000000000000000000000000000000000000000000000000000000000000000",
      "producer_id": "FIXTURE-ONLY"
    },
    "registry_binding": {
      "registry_artifact_id": "MCAT-V3-AUTHORITATIVE-REGISTRY-2026-07-22-01",
      "registry_sha256": "635c39e9c0ebb28a3892399449aa9b74893aae3264924cd739b92b6e370ba26a",
      "phase_0_freeze_id": "MCAT-V3-PHASE0-FRZ-2026-07-22-01",
      "canonical_freeze_id": "MCAT-V3-CANONICAL-FRZ-2026-07-22-01",
      "graph_freeze_id": "MCAT-V3-GRAPH-FRZ-2026-07-22-01",
      "sequence_freeze_id": "MCAT-V3-SEQUENCE-FRZ-2026-07-22-01",
      "manifest_schema_version": "mcat-v3-lesson-authoring-manifest-2",
      "manifest_sha256": "3bbe04ae878fe3936b65bb941ce658f2e48fb104670d7b3c3ad1d243cb99eac9",
      "lesson_id": "V3-LES-329622",
      "grouping_id": "V3-CL-329622",
      "ordered_kc_ids": ["V3-KC-271440"],
      "ordered_required_kc_ids": ["V3-KC-271440"]
    },
    "decision_register_binding": {
      "register_id": "SPEC04-DECISION-REGISTER",
      "register_version": "0.2.0",
      "register_sha256": "bfa92db982c5c3730a8b3e4cbe7f8a44a423794f95c945279548030c78ed2354",
      "producer_id": "SPEC04-GOVERNANCE"
    },
    "authors": [
      {
        "identity_ref": "FIXTURE-COMPILER-01",
        "execution_id": "FIXTURE-EXEC-02",
        "author_role": "MATRIX_COMPILER",
        "contribution": "BLOCKED_PROOF_FIXTURE"
      }
    ],
    "input_bindings": [],
    "dependency_bindings": [
      {
        "artifact_type": "LESSON_SCRIPT",
        "artifact_id": "V3-LSCR-329622",
        "subject_version": "0.2.0-fixture",
        "subject_sha256": "b38b21a1aebdf969d27f3cdaa6728121f63fb3ecacedf8fabd6dacf10c6d381b"
      }
    ],
    "lineage": {
      "lineage_kind": "INITIAL",
      "authoring_execution_id": "FIXTURE-EXEC-02",
      "derived_from_refs": ["V3-LSCR-329622"],
      "change_reason": "AUDIT_BLOCKED_FIXTURE"
    },
    "payload": {
      "lesson_id": "V3-LES-329622",
      "lesson_script_dependency": "V3-LSCR-329622",
      "ordered_required_kc_ids": ["V3-KC-271440"],
      "rows": [
        {
          "kc_id": "V3-KC-271440",
          "canonical_ordinal": 1,
          "objective_ref": "REDOX-OBJECTIVE-01",
          "scope_in_refs": ["REDOX-SCOPE-IN"],
          "scope_out_refs": ["REDOX-SCOPE-OUT", "REDOX-NONGOAL-MECHANISM"],
          "source_claim_refs": ["REDOX-CLAIM-ACCOUNTING"],
          "required_knowledge_dependency_refs": ["REDOX-DEP-ELECTRON-LANGUAGE"],
          "prerequisite_point_refs": [],
          "entry_boundary_ref": "REDOX-ENTRY",
          "orientation_ref": "REDOX-ORIENTATION",
          "explanation_node_refs": ["REDOX-EXPLANATION"],
          "mental_model_refs": ["REDOX-MENTAL-MODEL"],
          "expert_think_aloud_refs": ["REDOX-THINK"],
          "worked_example_refs": ["REDOX-WORKED"],
          "guided_activity_refs": ["REDOX-GUIDED"],
          "light_support_activity_refs": ["REDOX-FADING"],
          "solo_activity_refs": ["REDOX-SOLO"],
          "contrast_boundary_refs": ["REDOX-CONTRAST"],
          "entry_check_items": [
            {
              "item_binding_id": "REDOX-BIND-ENTRY",
              "item_id": "REDOX-ITEM-ENTRY",
              "family_id": "REDOX-FAM-ENTRY",
              "family_version": "0.1.0",
              "family_sha256": "0808080808080808080808080808080808080808080808080808080808080808"
            }
          ],
          "near_use_items": [
            {
              "item_binding_id": "REDOX-BIND-NEAR",
              "item_id": "REDOX-ITEM-NEAR",
              "family_id": "REDOX-FAM-NEAR",
              "family_version": "0.1.0",
              "family_sha256": "0505050505050505050505050505050505050505050505050505050505050505"
            }
          ],
          "changed_task_items": [
            {
              "item_binding_id": "REDOX-BIND-CHANGED",
              "item_id": "REDOX-ITEM-CHANGED",
              "family_id": "REDOX-FAM-CHANGED",
              "family_version": "0.1.0",
              "family_sha256": "0606060606060606060606060606060606060606060606060606060606060606"
            }
          ],
          "misconception_feature_refs": ["REDOX-FEATURE-DIRECTION"],
          "repair_node_refs": ["REDOX-REPAIR"],
          "repair_family_refs": ["REDOX-FAM-REPAIR-NEAR", "REDOX-FAM-REPAIR-CHANGED"],
          "repair_confirmation_items": [
            {
              "item_binding_id": "REDOX-BIND-REPAIR-NEAR",
              "item_id": "REDOX-ITEM-REPAIR-NEAR",
              "family_id": "REDOX-FAM-REPAIR-NEAR",
              "family_version": "0.1.0",
              "family_sha256": "0909090909090909090909090909090909090909090909090909090909090909"
            },
            {
              "item_binding_id": "REDOX-BIND-REPAIR-CHANGED",
              "item_id": "REDOX-ITEM-REPAIR-CHANGED",
              "family_id": "REDOX-FAM-REPAIR-CHANGED",
              "family_version": "0.1.0",
              "family_sha256": "1010101010101010101010101010101010101010101010101010101010101010"
            }
          ],
          "exact_reentry_proofs": [
            {
              "failed_function": "NEAR_USE",
              "repair_node_ref": "REDOX-REPAIR",
              "fresh_confirmation_item_binding_ref": "REDOX-BIND-REPAIR-NEAR",
              "reentry_checkpoint_ref": "REDOX-REENTRY-NEAR",
              "preserved_success_policy_ref": "FIXTURE-RUNTIME-POLICY"
            },
            {
              "failed_function": "CHANGED_TASK",
              "repair_node_ref": "REDOX-REPAIR",
              "fresh_confirmation_item_binding_ref": "REDOX-BIND-REPAIR-CHANGED",
              "reentry_checkpoint_ref": "REDOX-REENTRY-CHANGED",
              "preserved_success_policy_ref": "FIXTURE-RUNTIME-POLICY"
            }
          ],
          "recap_ref": "REDOX-RECAP",
          "representation_refs": ["REDOX-REP-STRUCTURE-LEDGER"],
          "accessibility_equivalent_refs": ["REDOX-ALT-STRUCTURED-TEXT"],
          "dependency_closure_evidence_refs": ["BLK-FIX-003"],
          "route_proofs": [
            {
              "route": "STANDARD",
              "applicability": "APPLICABLE",
              "authority_refs": ["SPEC03:5.3"],
              "stage_proofs": [
                {
                  "authoring_stage": "ENTRY_BOUNDARY",
                  "script_refs": ["REDOX-ENTRY"],
                  "compiled_evidence_refs": []
                },
                {
                  "authoring_stage": "ORIENTATION",
                  "script_refs": ["REDOX-ORIENTATION"],
                  "compiled_evidence_refs": []
                },
                {
                  "authoring_stage": "MENTAL_MODEL",
                  "script_refs": ["REDOX-MENTAL-MODEL"],
                  "compiled_evidence_refs": []
                },
                {
                  "authoring_stage": "EXPERT_MODEL",
                  "script_refs": ["REDOX-THINK", "REDOX-WORKED"],
                  "compiled_evidence_refs": []
                },
                {
                  "authoring_stage": "GUIDED_PRACTICE",
                  "script_refs": ["REDOX-GUIDED"],
                  "compiled_evidence_refs": []
                },
                {
                  "authoring_stage": "FADING",
                  "script_refs": ["REDOX-FADING"],
                  "compiled_evidence_refs": []
                },
                {
                  "authoring_stage": "SOLO_PRACTICE",
                  "script_refs": ["REDOX-SOLO"],
                  "compiled_evidence_refs": []
                },
                {
                  "authoring_stage": "CONTRAST_BOUNDS",
                  "script_refs": ["REDOX-CONTRAST"],
                  "compiled_evidence_refs": []
                },
                {
                  "authoring_stage": "NEAR_USE",
                  "script_refs": ["REDOX-BIND-NEAR"],
                  "compiled_evidence_refs": []
                },
                {
                  "authoring_stage": "CHANGED_TASK",
                  "script_refs": ["REDOX-BIND-CHANGED"],
                  "compiled_evidence_refs": []
                },
                {
                  "authoring_stage": "TARGETED_REPAIR",
                  "script_refs": ["REDOX-REPAIR"],
                  "compiled_evidence_refs": []
                },
                {
                  "authoring_stage": "EXACT_REENTRY",
                  "script_refs": ["REDOX-REENTRY-NEAR", "REDOX-REENTRY-CHANGED"],
                  "compiled_evidence_refs": []
                },
                {
                  "authoring_stage": "RECAP",
                  "script_refs": ["REDOX-RECAP"],
                  "compiled_evidence_refs": []
                }
              ],
              "exact_reentry_proof_refs": ["REDOX-REENTRY-NEAR", "REDOX-REENTRY-CHANGED"],
              "compiled_reachability_evidence_refs": [],
              "status": "BLOCKED",
              "blocker_refs": ["BLK-FIX-003"],
              "finding_refs": []
            },
            {
              "route": "CONCISE",
              "applicability": "BLOCKED",
              "authority_refs": ["OD04-010"],
              "blocker_refs": ["BLK-FIX-001"],
              "status": "BLOCKED"
            },
            {
              "route": "MISCONCEPTION",
              "applicability": "BLOCKED",
              "authority_refs": ["SPEC03:5.6"],
              "blocker_refs": ["BLK-FIX-003"],
              "status": "BLOCKED"
            },
            {
              "route": "PREREQUISITE_SUPPORT",
              "applicability": "NOT_APPLICABLE",
              "authority_refs": ["V3-KC-271440:HARD_PREREQUISITES:EMPTY"],
              "absence_proof_refs": ["MANIFEST:V3-KC-271440"],
              "status": "NOT_APPLICABLE"
            }
          ],
          "compiled_node_evidence_refs": [],
          "row_result": "BLOCKED"
        }
      ],
      "automated_check_results": [
        {
          "check_id": "CUR-004",
          "status": "BLOCKED",
          "evidence_refs": [],
          "blocker_refs": ["BLK-FIX-003"],
          "finding_refs": []
        }
      ],
      "dependency_closure_proof": {
        "status": "BLOCKED",
        "dependency_ids": ["REDOX-DEP-ELECTRON-LANGUAGE"],
        "evidence_refs": [],
        "blocker_refs": ["BLK-FIX-003"],
        "finding_refs": []
      },
      "matrix_result": "BLOCKED"
    }
  },
  "subject_digest": {
    "algorithm": "SHA_256",
    "canonicalization_profile_id": "FIXTURE-JCS-1",
    "subject_sha256": "53c2acd643d86e0691b3521f16b8132123873fbf2a9c8a5648d5a136acf1961c"
  }
}
```

### E.3 `LessonPresentationPlan`

```json
{
  "subject": {
    "artifact_type": "LESSON_PRESENTATION_PLAN",
    "artifact_id": "V3-LPPL-329622",
    "subject_version": "0.2.0-fixture",
    "schema_binding": {
      "schema_id": "FIXTURE-PRESENTATION-SCHEMA",
      "schema_version": "0.2.0",
      "schema_sha256": "0000000000000000000000000000000000000000000000000000000000000000",
      "producer_id": "FIXTURE-ONLY"
    },
    "registry_binding": {
      "registry_artifact_id": "MCAT-V3-AUTHORITATIVE-REGISTRY-2026-07-22-01",
      "registry_sha256": "635c39e9c0ebb28a3892399449aa9b74893aae3264924cd739b92b6e370ba26a",
      "phase_0_freeze_id": "MCAT-V3-PHASE0-FRZ-2026-07-22-01",
      "canonical_freeze_id": "MCAT-V3-CANONICAL-FRZ-2026-07-22-01",
      "graph_freeze_id": "MCAT-V3-GRAPH-FRZ-2026-07-22-01",
      "sequence_freeze_id": "MCAT-V3-SEQUENCE-FRZ-2026-07-22-01",
      "manifest_schema_version": "mcat-v3-lesson-authoring-manifest-2",
      "manifest_sha256": "3bbe04ae878fe3936b65bb941ce658f2e48fb104670d7b3c3ad1d243cb99eac9",
      "lesson_id": "V3-LES-329622",
      "grouping_id": "V3-CL-329622",
      "ordered_kc_ids": ["V3-KC-271440"],
      "ordered_required_kc_ids": ["V3-KC-271440"]
    },
    "decision_register_binding": {
      "register_id": "SPEC04-DECISION-REGISTER",
      "register_version": "0.2.0",
      "register_sha256": "bfa92db982c5c3730a8b3e4cbe7f8a44a423794f95c945279548030c78ed2354",
      "producer_id": "SPEC04-GOVERNANCE"
    },
    "authors": [
      {
        "identity_ref": "FIXTURE-DESIGNER-01",
        "execution_id": "FIXTURE-EXEC-03",
        "author_role": "PRESENTATION_AUTHOR",
        "contribution": "BLOCKED_SCREEN_FIXTURE"
      }
    ],
    "input_bindings": [],
    "dependency_bindings": [
      {
        "artifact_type": "LESSON_SCRIPT",
        "artifact_id": "V3-LSCR-329622",
        "subject_version": "0.2.0-fixture",
        "subject_sha256": "b38b21a1aebdf969d27f3cdaa6728121f63fb3ecacedf8fabd6dacf10c6d381b"
      },
      {
        "artifact_type": "KC_COVERAGE_MATRIX",
        "artifact_id": "V3-KCOV-329622",
        "subject_version": "0.2.0-fixture",
        "subject_sha256": "53c2acd643d86e0691b3521f16b8132123873fbf2a9c8a5648d5a136acf1961c"
      }
    ],
    "lineage": {
      "lineage_kind": "INITIAL",
      "authoring_execution_id": "FIXTURE-EXEC-03",
      "derived_from_refs": ["V3-LSCR-329622", "V3-KCOV-329622"],
      "change_reason": "AUDIT_BLOCKED_FIXTURE"
    },
    "payload": {
      "lesson_id": "V3-LES-329622",
      "lesson_script_dependency": "V3-LSCR-329622",
      "kc_coverage_matrix_dependency": "V3-KCOV-329622",
      "design_token_binding_id": "MISSING:DESIGN_TOKEN_PACKAGE",
      "ui_component_binding_id": "MISSING:UI_COMPONENT_PACKAGE",
      "navigation_contract_binding_id": "MISSING:NAVIGATION_CONTRACT",
      "learner_rhythm": [
        "STARTING_CHECK",
        "FOCUS_NOW",
        "EXPLAIN",
        "WORKED_VISUAL",
        "GUIDED_PRACTICE",
        "LESS_HELP",
        "ON_YOUR_OWN",
        "FINAL_NEAR_CHECK",
        "FINAL_CHANGED_CHECK",
        "TARGETED_REPAIR",
        "COMPLETION"
      ],
      "screens": [],
      "node_to_screen_map": [],
      "representation_realizations": [
        {
          "representation_ref": "REDOX-REP-STRUCTURE-LEDGER",
          "accessibility_equivalent_ref": "REDOX-ALT-STRUCTURED-TEXT",
          "screen_ids": [],
          "interaction_kind": "STATIC_FIXTURE",
          "static_fallback_ref": "REDOX-ALT-STRUCTURED-TEXT",
          "small_screen_policy_ref": "BLK-FIX-004"
        }
      ],
      "progressive_disclosure_rules": {
        "optional_details_default": "COLLAPSED",
        "required_instruction_collapsible": false,
        "important_callout_maximum": 1,
        "stacked_fading_ladders_allowed": false
      },
      "learner_reviewer_separation": {
        "learner_projection_schema_ref": "BLK-FIX-001",
        "reviewer_projection_schema_ref": "BLK-FIX-001",
        "protected_field_scan_ref": "BLK-FIX-004",
        "client_bundle_scan_ref": "BLK-FIX-004"
      },
      "main_app_parity_assertions": [
        {
          "assertion_id": "DES-003",
          "expected_value": "FOCUSED_MAIN_APP_PARITY",
          "status": "BLOCKED",
          "evidence_refs": [],
          "blocker_refs": ["BLK-FIX-001", "BLK-FIX-004"],
          "finding_refs": []
        }
      ],
      "responsive_assertions": [
        {
          "assertion_id": "A11Y-004",
          "expected_value": "EVERY_BRANCH_AT_375_AND_320",
          "status": "BLOCKED",
          "evidence_refs": [],
          "blocker_refs": ["BLK-FIX-004"],
          "finding_refs": []
        }
      ],
      "accessibility_assertions": [
        {
          "assertion_id": "A11Y-001",
          "expected_value": "KEYBOARD_AND_FOCUS_PASS",
          "status": "BLOCKED",
          "evidence_refs": [],
          "blocker_refs": ["BLK-FIX-004"],
          "finding_refs": []
        }
      ],
      "browser_evidence_plan": {
        "browser_profile_refs": [],
        "viewport_widths": [375, 320],
        "theme_modes": ["LIGHT", "DARK"],
        "assistive_technology_profile_refs": [],
        "required_branch_refs": [],
        "evidence_refs": [],
        "status": "BLOCKED",
        "blocker_refs": ["BLK-FIX-004"]
      },
      "presentation_result": "BLOCKED"
    }
  },
  "subject_digest": {
    "algorithm": "SHA_256",
    "canonicalization_profile_id": "FIXTURE-JCS-1",
    "subject_sha256": "68f69187209d7a14a04918da023d58aa589ece5bc68c98584ff1460a5e95b95c"
  }
}
```

### E.4 `LessonQualityReport`

```json
{
  "subject": {
    "artifact_type": "LESSON_QUALITY_REPORT",
    "artifact_id": "V3-LQRP-329622",
    "subject_version": "0.2.0-fixture",
    "schema_binding": {
      "schema_id": "FIXTURE-QUALITY-REPORT-SCHEMA",
      "schema_version": "0.2.0",
      "schema_sha256": "0000000000000000000000000000000000000000000000000000000000000000",
      "producer_id": "FIXTURE-ONLY"
    },
    "registry_binding": {
      "registry_artifact_id": "MCAT-V3-AUTHORITATIVE-REGISTRY-2026-07-22-01",
      "registry_sha256": "635c39e9c0ebb28a3892399449aa9b74893aae3264924cd739b92b6e370ba26a",
      "phase_0_freeze_id": "MCAT-V3-PHASE0-FRZ-2026-07-22-01",
      "canonical_freeze_id": "MCAT-V3-CANONICAL-FRZ-2026-07-22-01",
      "graph_freeze_id": "MCAT-V3-GRAPH-FRZ-2026-07-22-01",
      "sequence_freeze_id": "MCAT-V3-SEQUENCE-FRZ-2026-07-22-01",
      "manifest_schema_version": "mcat-v3-lesson-authoring-manifest-2",
      "manifest_sha256": "3bbe04ae878fe3936b65bb941ce658f2e48fb104670d7b3c3ad1d243cb99eac9",
      "lesson_id": "V3-LES-329622",
      "grouping_id": "V3-CL-329622",
      "ordered_kc_ids": ["V3-KC-271440"],
      "ordered_required_kc_ids": ["V3-KC-271440"]
    },
    "decision_register_binding": {
      "register_id": "SPEC04-DECISION-REGISTER",
      "register_version": "0.2.0",
      "register_sha256": "bfa92db982c5c3730a8b3e4cbe7f8a44a423794f95c945279548030c78ed2354",
      "producer_id": "SPEC04-GOVERNANCE"
    },
    "authors": [
      {
        "identity_ref": "FIXTURE-REPORT-COMPILER-01",
        "execution_id": "FIXTURE-EXEC-04",
        "author_role": "QUALITY_REPORT_COMPILER",
        "contribution": "DETERMINISTIC_BLOCKED_AGGREGATION"
      }
    ],
    "input_bindings": [],
    "dependency_bindings": [
      {
        "artifact_type": "LESSON_SCRIPT",
        "artifact_id": "V3-LSCR-329622",
        "subject_version": "0.2.0-fixture",
        "subject_sha256": "b38b21a1aebdf969d27f3cdaa6728121f63fb3ecacedf8fabd6dacf10c6d381b"
      },
      {
        "artifact_type": "KC_COVERAGE_MATRIX",
        "artifact_id": "V3-KCOV-329622",
        "subject_version": "0.2.0-fixture",
        "subject_sha256": "53c2acd643d86e0691b3521f16b8132123873fbf2a9c8a5648d5a136acf1961c"
      },
      {
        "artifact_type": "LESSON_PRESENTATION_PLAN",
        "artifact_id": "V3-LPPL-329622",
        "subject_version": "0.2.0-fixture",
        "subject_sha256": "68f69187209d7a14a04918da023d58aa589ece5bc68c98584ff1460a5e95b95c"
      }
    ],
    "lineage": {
      "lineage_kind": "INITIAL",
      "authoring_execution_id": "FIXTURE-EXEC-04",
      "derived_from_refs": ["V3-LSCR-329622", "V3-KCOV-329622", "V3-LPPL-329622"],
      "change_reason": "AUDIT_BLOCKED_FIXTURE"
    },
    "payload": {
      "lesson_id": "V3-LES-329622",
      "lesson_script_dependency": "V3-LSCR-329622",
      "kc_coverage_matrix_dependency": "V3-KCOV-329622",
      "lesson_presentation_plan_dependency": "V3-LPPL-329622",
      "decision_register_binding": {
        "register_id": "SPEC04-DECISION-REGISTER",
        "register_version": "0.2.0",
        "register_sha256": "bfa92db982c5c3730a8b3e4cbe7f8a44a423794f95c945279548030c78ed2354",
        "producer_id": "SPEC04-GOVERNANCE"
      },
      "gate_catalog_binding": {
        "binding_state": "BLOCKED",
        "expected_namespace": "GATE_CATALOG",
        "blocker_refs": ["BLK-FIX-001"]
      },
      "identity_trust_profile_binding": {
        "binding_state": "BLOCKED",
        "expected_namespace": "IDENTITY_TRUST_PROFILE",
        "blocker_refs": ["BLK-FIX-001"]
      },
      "review_receipt_input_refs": [],
      "gate_check_results": [
        {
          "check_id": "TRU-001",
          "applicability": "APPLICABLE",
          "status": "BLOCKED",
          "reviewed_subject_refs": [],
          "evidence_refs": [],
          "receipt_refs": [],
          "blocker_refs": ["BLK-FIX-001"],
          "finding_refs": []
        },
        {
          "check_id": "CUR-004",
          "applicability": "APPLICABLE",
          "status": "BLOCKED",
          "reviewed_subject_refs": [
            {
              "artifact_type": "LESSON_SCRIPT",
              "artifact_id": "V3-LSCR-329622",
              "subject_sha256": "b38b21a1aebdf969d27f3cdaa6728121f63fb3ecacedf8fabd6dacf10c6d381b"
            },
            {
              "artifact_type": "KC_COVERAGE_MATRIX",
              "artifact_id": "V3-KCOV-329622",
              "subject_sha256": "53c2acd643d86e0691b3521f16b8132123873fbf2a9c8a5648d5a136acf1961c"
            }
          ],
          "evidence_refs": [],
          "receipt_refs": [],
          "blocker_refs": ["BLK-FIX-003"],
          "finding_refs": []
        },
        {
          "check_id": "A11Y-004",
          "applicability": "APPLICABLE",
          "status": "BLOCKED",
          "reviewed_subject_refs": [
            {
              "artifact_type": "LESSON_PRESENTATION_PLAN",
              "artifact_id": "V3-LPPL-329622",
              "subject_sha256": "68f69187209d7a14a04918da023d58aa589ece5bc68c98584ff1460a5e95b95c"
            }
          ],
          "evidence_refs": [],
          "receipt_refs": [],
          "blocker_refs": ["BLK-FIX-004"],
          "finding_refs": []
        }
      ],
      "independence_check_results": [
        {
          "constraint_id": "AUTHOR_FINAL_APPROVER_DISJOINT",
          "status": "BLOCKED",
          "trusted_identity_refs": [],
          "evidence_refs": [],
          "blocker_refs": ["BLK-FIX-004"]
        }
      ],
      "blocking_records": [
        {
          "blocker_id": "BLK-FIX-001",
          "blocking_scope": "W00_AND_TRUST",
          "missing_evidence": "Pinned schemas, gate catalog, identity trust profile, and foundation pinset",
          "fail_closed_default": "QUARANTINED_DESIGN_CANDIDATE_ONLY",
          "owner_ref": "INTEGRATION_AUTHORITY_DRI",
          "closure_criteria": ["Resolve OD04-004 through OD04-008 with signed receipts"]
        },
        {
          "blocker_id": "BLK-FIX-002",
          "blocking_scope": "LESSON_DEFINITION_COMPILE",
          "missing_evidence": "Runtime policy package and complete Spec 03 shell/KC contracts",
          "fail_closed_default": "NO_COMPILE",
          "owner_ref": "LESSON_PLATFORM_DRI",
          "closure_criteria": ["Bind every §9.1 field to a pinned producer"]
        },
        {
          "blocker_id": "BLK-FIX-003",
          "blocking_scope": "SCRIPT_MATRIX_AND_ITEMS",
          "missing_evidence": "Complete nodes, activities, immutable item records, assets, and dependency proof",
          "fail_closed_default": "NO_COVERAGE_PASS",
          "owner_ref": "CONTENT_PLATFORM_DRI",
          "closure_criteria": ["Resolve every script and matrix reference"]
        },
        {
          "blocker_id": "BLK-FIX-004",
          "blocking_scope": "REVIEW_UI_AND_RUNTIME",
          "missing_evidence": "Trusted review receipts, browser evidence, blind solve, and runtime traces",
          "fail_closed_default": "NO_REVIEW_OR_RELEASE",
          "owner_ref": "REVIEW_GOVERNANCE_DRI",
          "closure_criteria": ["Verify complete receipt and evidence sets"]
        }
      ],
      "findings": [],
      "safety_result": "SAFE_NO_PROVEN_FAILURE",
      "completeness_result": "INCOMPLETE",
      "correction_result": "CLEAN",
      "derived_final_status": "BLOCKED",
      "claim_limits": {
        "learner_validated": false,
        "efficacy_established": false,
        "mastery_calibrated": false,
        "readiness_validated": false,
        "rights_cleared_for_release": false,
        "broad_rollout_authorized": false,
        "production_compliance_established": false,
        "canonical_authoring_complete": false,
        "production_published": false
      }
    }
  },
  "subject_digest": {
    "algorithm": "SHA_256",
    "canonicalization_profile_id": "FIXTURE-JCS-1",
    "subject_sha256": "ec5032e23a8cbcdc88fcdaef6345aaf4e4c1edce257714655ed34407c0ec1445"
  }
}
```

### E.5 External blocked release/status record

This external record is not a fifth authoring artifact:

```json
{
  "record_subject": {
    "release_record_id": "FIXTURE-RELEASE-329622-001",
    "release_record_version": "0.1.0",
    "append_sequence": 1,
    "previous_record": { "state": "GENESIS" },
    "artifact_subject_refs": [
      {
        "artifact_type": "LESSON_SCRIPT",
        "artifact_id": "V3-LSCR-329622",
        "subject_version": "0.2.0-fixture",
        "subject_sha256": "b38b21a1aebdf969d27f3cdaa6728121f63fb3ecacedf8fabd6dacf10c6d381b"
      },
      {
        "artifact_type": "KC_COVERAGE_MATRIX",
        "artifact_id": "V3-KCOV-329622",
        "subject_version": "0.2.0-fixture",
        "subject_sha256": "53c2acd643d86e0691b3521f16b8132123873fbf2a9c8a5648d5a136acf1961c"
      },
      {
        "artifact_type": "LESSON_PRESENTATION_PLAN",
        "artifact_id": "V3-LPPL-329622",
        "subject_version": "0.2.0-fixture",
        "subject_sha256": "68f69187209d7a14a04918da023d58aa589ece5bc68c98584ff1460a5e95b95c"
      },
      {
        "artifact_type": "LESSON_QUALITY_REPORT",
        "artifact_id": "V3-LQRP-329622",
        "subject_version": "0.2.0-fixture",
        "subject_sha256": "ec5032e23a8cbcdc88fcdaef6345aaf4e4c1edce257714655ed34407c0ec1445"
      }
    ],
    "review_receipt_refs": [],
    "decision_register_binding": {
      "binding_state": "RESOLVED",
      "binding": {
        "record_id": "SPEC04-DECISION-REGISTER",
        "record_version": "0.2.0",
        "record_sha256": "bfa92db982c5c3730a8b3e4cbe7f8a44a423794f95c945279548030c78ed2354",
        "schema_id": "SPEC04-DECISION-REGISTER-SCHEMA",
        "schema_version": "0.2.0",
        "schema_sha256": "0000000000000000000000000000000000000000000000000000000000000000",
        "producer_id": "SPEC04-GOVERNANCE"
      }
    },
    "gate_catalog_binding": {
      "binding_state": "BLOCKED",
      "expected_namespace": "GATE_CATALOG",
      "blocker_refs": ["BLK-FIX-001"]
    },
    "foundation_pinset_binding": {
      "binding_state": "BLOCKED",
      "expected_namespace": "FOUNDATION_PINSET",
      "blocker_refs": ["BLK-FIX-001"]
    },
    "safety_result": "SAFE_NO_PROVEN_FAILURE",
    "completeness_result": "INCOMPLETE",
    "correction_result": "CLEAN",
    "derived_status": "BLOCKED",
    "claim_limits": {
      "learner_validated": false,
      "efficacy_established": false,
      "mastery_calibrated": false,
      "readiness_validated": false,
      "rights_cleared_for_release": false,
      "broad_rollout_authorized": false,
      "production_compliance_established": false,
      "canonical_authoring_complete": false,
      "production_published": false
    },
    "revised_subject_refs": [],
    "issued_at": "2026-07-23T00:00:00Z"
  },
  "record_digest": {
    "algorithm": "SHA_256",
    "canonicalization_profile_id": "FIXTURE-JCS-1",
    "record_subject_sha256": "f44e5b65221ea374886d3185d3910cf17af3c216baaa1231380ab7c9ac299c5b"
  },
  "verification": {
    "verification_kind": "CONTROLLER_ATTESTATION",
    "controller_receipt_id": "FIXTURE-CONTROLLER-ATTESTATION-01",
    "controller_receipt_sha256": "0707070707070707070707070707070707070707070707070707070707070707",
    "trust_profile_ref": "BLK-FIX-001"
  }
}
```

### E.6 Expected validator outcomes

The fixture validator MUST derive:

- four artifact types and an acyclic `A → B → C → D` subject dependency graph;
- no reviewer embedded in a subject;
- no receipt claiming to approve its own bytes;
- no `content_sha256`, mutable artifact status, or in-place supersession field;
- redox `PREREQUISITE_SUPPORT=NOT_APPLICABLE` with no executable support content;
- matrix, presentation, and quality results all `BLOCKED`;
- no `PASS` coverage, no `REVISE` without a finding, and no reviewer identity without a receipt;
- `SAFE_NO_PROVEN_FAILURE + INCOMPLETE + CLEAN → BLOCKED`;
- all four subject digests, dependency hashes, the decision-register hash, and external record
  digest recompute;
- the external release/status record remains `BLOCKED` and is not counted as an authoring artifact;
- every unresolved fixture ref assigned to `BLK-FIX-001` through `BLK-FIX-004`; and
- production rejection of fixture-only zero schema hashes and absent W00 evidence.

## Appendix F. Allowed and prohibited learner copy

| Allowed                                                     | Prohibited                                    |
| ----------------------------------------------------------- | --------------------------------------------- |
| “Focus on where the electrons go.”                          | “Route: MISCONCEPTION; A2 node 7.”            |
| “Both marked oxygen bonds change; the tail stays the same.” | “KC V3-KC-271440 coverage complete.”          |
| “Check your answer, then you will see feedback.”            | A key or rationale before commitment          |
| “This equation tracks the overall endpoint change.”         | “This proves the elementary mechanism.”       |
| “Let’s revisit electron direction before a fresh check.”    | “Your misconception is electron reversal.”    |
| “You finished this lesson’s required instruction.”          | “You mastered redox and are 520-ready.”       |
| One quarantine label in the preview shell                   | A governance warning on every teaching screen |

Feedback describes the response and next reasoning move. One response does not prove a learner
trait.

## Appendix G. Definition of done

A lesson is done under this candidate only when:

1. the four and only four immutable authoring subjects validate;
2. all subject digests recompute without self-reference;
3. the decision register, gate catalog, identity trust profile, runtime policy package, schemas, and
   W00 foundation are pinned;
4. every required KC has a complete dependency-closed matrix row;
5. every applicable route covers all 13 stages and every unauthorized route is absent;
6. complete Spec 03 `LessonDefinition` fields compile;
7. immutable items, assets, scoring, explanation, eligibility, and exposure records resolve;
8. all required trusted receipts verify and set disjointness/cardinality pass;
9. script, presentation, accessibility, novice, runtime, analytics, source, rights, and domain gates
   pass;
10. `safety_result=SAFE_NO_PROVEN_FAILURE`, `completeness_result=COMPLETE`, and
    `correction_result=CLEAN`;
11. the append-only release/status record binds all four subject hashes, receipts, decisions, and
    W00 pins; and
12. claim limits do not exceed separate evidence.

“Done” does not itself establish efficacy, mastery, readiness, rights clearance, broad rollout, or
publication.

## Appendix H. Open decision register

### H.1 Record contract

Every decision record contains exactly:

```text
decision_id
decision_title
dri
consulted_roles[]
status: OPEN | CLOSED | SUPERSEDED
fail_closed_default
blocking_scope[]
required_evidence[]
closure_criteria[]
decision_receipt
affected_artifacts[]
```

`dri` names exactly one accountable role or identity. `decision_receipt` is
`{"state":"ABSENT","required_receipt_kind":"GOVERNANCE_DECISION"}` or
`{"state":"PRESENT","receipt_id":"...","receipt_sha256":"..."}`. Every quality report and
release/status record binds the exact register hash and MUST include every open decision whose
blocking scope applies.

### H.2 Candidate register

The following JSON Lines are machine-readable decision subjects. All 21 are open; no threshold or
pin is guessed.
The fixture register hash is SHA-256 over the RFC 8785 canonical JSON array of these records in
listed order:
`bfa92db982c5c3730a8b3e4cbe7f8a44a423794f95c945279548030c78ed2354`.

```jsonl
{"decision_id":"OD04-001","decision_title":"Subject hash and append-only release envelope","dri":"SECURITY_PLATFORM_DRI","consulted_roles":["ARCHITECTURE","RELEASE_INTEGRATION"],"status":"OPEN","fail_closed_default":"NO_APPROVAL_OR_RELEASE","blocking_scope":["W00","GOLDEN","PRODUCTION"],"required_evidence":["Canonicalization profile","Receipt and release schemas","Adversarial hash tests"],"closure_criteria":["No self-reference","Append-only supersession verified"],"decision_receipt":{"state":"ABSENT","required_receipt_kind":"GOVERNANCE_DECISION"},"affected_artifacts":["ALL_FOUR","RELEASE_STATUS_RECORD"]}
{"decision_id":"OD04-002","decision_title":"Reference namespace and producer registry","dri":"ARCHITECTURE_DRI","consulted_roles":["CONTENT_PLATFORM","SECURITY"],"status":"OPEN","fail_closed_default":"UNKNOWN_REFERENCE_BLOCKS","blocking_scope":["W00","ALL_ARTIFACTS"],"required_evidence":["Closed namespace schema","Producer authority map"],"closure_criteria":["All refs typed and resolvable"],"decision_receipt":{"state":"ABSENT","required_receipt_kind":"GOVERNANCE_DECISION"},"affected_artifacts":["ALL_FOUR"]}
{"decision_id":"OD04-003","decision_title":"Immutable item and asset contract","dri":"QUESTION_PLATFORM_DRI","consulted_roles":["PSYCHOMETRICS","MEDIA","SECURITY"],"status":"OPEN","fail_closed_default":"NO_ITEM_ELIGIBILITY","blocking_scope":["W00","SCRIPT","INTEGRATED"],"required_evidence":["Item/version schemas","Asset manifest","Opaque scoring contract"],"closure_criteria":["All item bytes and authorities hash-bound"],"decision_receipt":{"state":"ABSENT","required_receipt_kind":"GOVERNANCE_DECISION"},"affected_artifacts":["LESSON_SCRIPT","KC_COVERAGE_MATRIX","LESSON_QUALITY_REPORT"]}
{"decision_id":"OD04-004","decision_title":"Complete gate check catalog","dri":"REVIEW_GOVERNANCE_DRI","consulted_roles":["ALL_REVIEW_DOMAINS"],"status":"OPEN","fail_closed_default":"OMITTED_CHECK_BLOCKS","blocking_scope":["W00","QUALITY","RELEASE"],"required_evidence":["Closed catalog","Applicability rules","Cardinality matrix"],"closure_criteria":["Validator exact-set tests pass"],"decision_receipt":{"state":"ABSENT","required_receipt_kind":"GOVERNANCE_DECISION"},"affected_artifacts":["LESSON_QUALITY_REPORT","RELEASE_STATUS_RECORD"]}
{"decision_id":"OD04-005","decision_title":"Identity trust and role-disjointness profile","dri":"INTEGRATION_AUTHORITY_DRI","consulted_roles":["SECURITY","REVIEW_GOVERNANCE"],"status":"OPEN","fail_closed_default":"NO_TRUSTED_APPROVAL","blocking_scope":["W00","QUALITY","RELEASE"],"required_evidence":["Trust root","Credential schema","Alias-resolution tests"],"closure_criteria":["Set constraints verified on trusted identities"],"decision_receipt":{"state":"ABSENT","required_receipt_kind":"GOVERNANCE_DECISION"},"affected_artifacts":["LESSON_QUALITY_REPORT","RELEASE_STATUS_RECORD"]}
{"decision_id":"OD04-006","decision_title":"Signed W00 foundation pinset","dri":"LESSON_PLATFORM_DRI","consulted_roles":["SECURITY","RELEASE_INTEGRATION"],"status":"OPEN","fail_closed_default":"FIVE_QUARANTINED_CANDIDATES_ONLY","blocking_scope":["W00","LATER_CANONICAL_WAVES"],"required_evidence":["Signed pinset","Build hashes","Trust verification"],"closure_criteria":["v0.3 W00 prerequisites all verified"],"decision_receipt":{"state":"ABSENT","required_receipt_kind":"GOVERNANCE_DECISION"},"affected_artifacts":["ALL_FOUR","RELEASE_STATUS_RECORD"]}
{"decision_id":"OD04-007","decision_title":"Production schemas for four subjects and external receipts","dri":"CONTENT_PLATFORM_DRI","consulted_roles":["ARCHITECTURE","SECURITY"],"status":"OPEN","fail_closed_default":"FIXTURE_ONLY","blocking_scope":["W00","GOLDEN","PRODUCTION"],"required_evidence":["Closed schemas","Hashes","Migration tests"],"closure_criteria":["Unknown-field and nullability tests pass"],"decision_receipt":{"state":"ABSENT","required_receipt_kind":"GOVERNANCE_DECISION"},"affected_artifacts":["ALL_FOUR","RELEASE_STATUS_RECORD"]}
{"decision_id":"OD04-008","decision_title":"Compiler renderer DTO harness and scorer pins","dri":"LESSON_PLATFORM_DRI","consulted_roles":["FRONTEND","ACCESSIBILITY","SECURITY"],"status":"OPEN","fail_closed_default":"NO_INTEGRATED_GATE","blocking_scope":["W00","INTEGRATED","GOLDEN"],"required_evidence":["Build artifacts","Schemas","Signing keys"],"closure_criteria":["Deterministic derivation and execution verified"],"decision_receipt":{"state":"ABSENT","required_receipt_kind":"GOVERNANCE_DECISION"},"affected_artifacts":["LESSON_PRESENTATION_PLAN","LESSON_QUALITY_REPORT","RELEASE_STATUS_RECORD"]}
{"decision_id":"OD04-009","decision_title":"v7 role eligibility and reservation adapter","dri":"QUESTION_PLATFORM_DRI","consulted_roles":["PSYCHOMETRICS","SECURITY"],"status":"OPEN","fail_closed_default":"V7_INVENTORY_ONLY","blocking_scope":["W00","ITEM_USE"],"required_evidence":["Eligibility schema","Reservation transactions","Exposure tests"],"closure_criteria":["Fail-closed selection verified"],"decision_receipt":{"state":"ABSENT","required_receipt_kind":"GOVERNANCE_DECISION"},"affected_artifacts":["LESSON_SCRIPT","LESSON_QUALITY_REPORT"]}
{"decision_id":"OD04-010","decision_title":"Exit scoring and route policy predicates","dri":"EVIDENCE_POLICY_DRI","consulted_roles":["PSYCHOMETRICS","LEARNING_SCIENCE"],"status":"OPEN","fail_closed_default":"STANDARD_ROUTE_ONLY_WHERE_AUTHORIZED","blocking_scope":["ROUTE_APPLICABILITY","EXIT"],"required_evidence":["Policy schema","Pilot predicates","Simulation"],"closure_criteria":["Planner/runner boundary and cut points pinned"],"decision_receipt":{"state":"ABSENT","required_receipt_kind":"GOVERNANCE_DECISION"},"affected_artifacts":["LESSON_SCRIPT","KC_COVERAGE_MATRIX","LESSON_QUALITY_REPORT"]}
{"decision_id":"OD04-011","decision_title":"Fading and bounded repair limits","dri":"LEARNING_SCIENCE_DRI","consulted_roles":["EVIDENCE_POLICY","ANALYTICS"],"status":"OPEN","fail_closed_default":"NO_UNPINNED_LIMIT","blocking_scope":["RUNTIME_POLICY","GOLDEN"],"required_evidence":["Policy version","Termination simulation"],"closure_criteria":["Finite predicates and reentry rules pinned"],"decision_receipt":{"state":"ABSENT","required_receipt_kind":"GOVERNANCE_DECISION"},"affected_artifacts":["LESSON_SCRIPT","LESSON_QUALITY_REPORT"]}
{"decision_id":"OD04-012","decision_title":"Present-day factual authority refresh","dri":"CURRICULUM_GOVERNANCE_DRI","consulted_roles":["DOMAIN_LEADS","SOURCE_REVIEW"],"status":"OPEN","fail_closed_default":"SUPPLIED_2020_CEILING_ONLY","blocking_scope":["CLAIMS_BEYOND_2020"],"required_evidence":["Approved current sources","Scope decision"],"closure_criteria":["Authority ceiling receipt issued"],"decision_receipt":{"state":"ABSENT","required_receipt_kind":"GOVERNANCE_DECISION"},"affected_artifacts":["LESSON_SCRIPT","LESSON_QUALITY_REPORT"]}
{"decision_id":"OD04-013","decision_title":"Per-source processing and reuse rights","dri":"RIGHTS_DRI","consulted_roles":["SOURCE_REVIEW","LEGAL"],"status":"OPEN","fail_closed_default":"SOURCE_NOT_PROVIDED_OR_REUSED","blocking_scope":["AUTHOR_INPUT","PUBLICATION"],"required_evidence":["Terms","Processing basis","Reuse permission"],"closure_criteria":["Source-specific rights receipt"],"decision_receipt":{"state":"ABSENT","required_receipt_kind":"GOVERNANCE_DECISION"},"affected_artifacts":["LESSON_SCRIPT","LESSON_QUALITY_REPORT"]}
{"decision_id":"OD04-014","decision_title":"Desktop browser and viewport support matrix","dri":"FRONTEND_QA_DRI","consulted_roles":["ACCESSIBILITY","PRODUCT"],"status":"OPEN","fail_closed_default":"NO_PRESENTATION_PASS","blocking_scope":["PRESENTATION"],"required_evidence":["Supported browser matrix","Desktop viewport"],"closure_criteria":["Harness profiles pinned"],"decision_receipt":{"state":"ABSENT","required_receipt_kind":"GOVERNANCE_DECISION"},"affected_artifacts":["LESSON_PRESENTATION_PLAN","LESSON_QUALITY_REPORT"]}
{"decision_id":"OD04-015","decision_title":"Browser and screen-reader evidence matrix","dri":"ACCESSIBILITY_DRI","consulted_roles":["FRONTEND_QA"],"status":"OPEN","fail_closed_default":"NO_ACCESSIBILITY_PASS","blocking_scope":["ACCESSIBILITY","GOLDEN"],"required_evidence":["AT/browser combinations","Harness traces"],"closure_criteria":["Required combinations pinned"],"decision_receipt":{"state":"ABSENT","required_receipt_kind":"GOVERNANCE_DECISION"},"affected_artifacts":["LESSON_PRESENTATION_PLAN","LESSON_QUALITY_REPORT"]}
{"decision_id":"OD04-016","decision_title":"Reading complexity acceptance by subject","dri":"INSTRUCTIONAL_DESIGN_DRI","consulted_roles":["ACCESSIBILITY","DOMAIN_LEADS"],"status":"OPEN","fail_closed_default":"NOVICE_WALKTHROUGH_REQUIRED","blocking_scope":["NOVICE_CLARITY"],"required_evidence":["Walkthrough protocol","Subject criteria"],"closure_criteria":["Non-word-count policy pinned"],"decision_receipt":{"state":"ABSENT","required_receipt_kind":"GOVERNANCE_DECISION"},"affected_artifacts":["LESSON_SCRIPT","LESSON_PRESENTATION_PLAN","LESSON_QUALITY_REPORT"]}
{"decision_id":"OD04-017","decision_title":"Construct equivalence per interactive alternative","dri":"ACCESSIBILITY_DRI","consulted_roles":["DOMAIN_REVIEW","PSYCHOMETRICS"],"status":"OPEN","fail_closed_default":"DISTINCT_EVIDENCE_SEMANTICS","blocking_scope":["REPRESENTATION_EQUIVALENCE"],"required_evidence":["Construct analysis","Alternative-route test"],"closure_criteria":["Per-representation receipt issued"],"decision_receipt":{"state":"ABSENT","required_receipt_kind":"GOVERNANCE_DECISION"},"affected_artifacts":["LESSON_SCRIPT","KC_COVERAGE_MATRIX","LESSON_PRESENTATION_PLAN"]}
{"decision_id":"OD04-018","decision_title":"Segment-only 18-minute hypothesis recalibration","dri":"LEARNING_SCIENCE_DRI","consulted_roles":["ANALYTICS","PRODUCT"],"status":"OPEN","fail_closed_default":"SEGMENT_HYPOTHESIS_ONLY","blocking_scope":["TIMING_CLAIMS"],"required_evidence":["Segment timing data","Abandonment analysis"],"closure_criteria":["Prospective policy receipt"],"decision_receipt":{"state":"ABSENT","required_receipt_kind":"GOVERNANCE_DECISION"},"affected_artifacts":["LESSON_SCRIPT","LESSON_QUALITY_REPORT"]}
{"decision_id":"OD04-019","decision_title":"Held-out learner validation and scale thresholds","dri":"PSYCHOMETRICS_DRI","consulted_roles":["LEARNING_SCIENCE","ACCESSIBILITY"],"status":"OPEN","fail_closed_default":"NO_EFFICACY_OR_BROAD_ROLLOUT","blocking_scope":["EFFICACY","BROAD_ROLLOUT"],"required_evidence":["Preregistration","Held-out outcomes","Subgroup analysis"],"closure_criteria":["Independent decision receipt"],"decision_receipt":{"state":"ABSENT","required_receipt_kind":"GOVERNANCE_DECISION"},"affected_artifacts":["LESSON_QUALITY_REPORT","RELEASE_STATUS_RECORD"]}
{"decision_id":"OD04-020","decision_title":"Five-candidate pinset and remaining 109 jobs","dri":"RELEASE_INTEGRATION_DRI","consulted_roles":["ARCHITECTURE","ALL_REVIEW_DOMAINS"],"status":"OPEN","fail_closed_default":"DO_NOT_LAUNCH_109","blocking_scope":["SCALE","LATER_CANONICAL_WAVES"],"required_evidence":["Five complete release records","Shared-defect closure"],"closure_criteria":["One signed scale decision"],"decision_receipt":{"state":"ABSENT","required_receipt_kind":"GOVERNANCE_DECISION"},"affected_artifacts":["ALL_FOUR","RELEASE_STATUS_RECORD"]}
{"decision_id":"OD04-021","decision_title":"Focused lesson main-app navigation contract","dri":"FRONTEND_DRI","consulted_roles":["PRODUCT_DESIGN","ACCESSIBILITY"],"status":"OPEN","fail_closed_default":"NO_MAIN_APP_PARITY_PASS","blocking_scope":["PRESENTATION","GOLDEN"],"required_evidence":["Focused-mode contract","H1/nav/debug browser assertions","Token/component pins"],"closure_criteria":["Main-app parity harness passes"],"decision_receipt":{"state":"ABSENT","required_receipt_kind":"GOVERNANCE_DECISION"},"affected_artifacts":["LESSON_PRESENTATION_PLAN","LESSON_QUALITY_REPORT"]}
```

---

## Candidate conformance statement

An implementation may be called a “Spec 04 internal candidate” only when its four immutable subjects
validate and its limitations are explicit. It may be called conforming only after the next
independent audit, exact decision/gate/W00 pins, complete detached receipts, and append-only release
record verify.

This revision does not approve any candidate. A missing approval yields `BLOCKED`; a proven unsafe
failure yields `FAIL` even when other evidence is missing.
