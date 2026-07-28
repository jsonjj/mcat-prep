# Lesson → Evidence → Mastery Contract

**Status:** Normative seam contract, version 1.0.
**Date:** July 27, 2026.
**Vocabulary authority:** `.superpowers/sdd/field-lock.md` (Gate A). Every identifier in this document
is taken verbatim from that registry. Where this document and Gate A disagree, Gate A wins and this
document is defective.
**Audience:** Anyone integrating a V3 lesson with the evidence system or the BKT mastery engine —
lesson authors, runtime engineers, evidence/policy engineers, and any future coding agent handed
this file as its only brief.

This is the single file a future implementer needs in order to wire a **new** conforming V3 lesson
into evidence and mastery. It is written to be enforceable: requirements use **MUST** / **MUST NOT**
and name exact identifiers. If a rule here cannot be checked mechanically, it is a defect in this
document.

---

## 1. Why this seam exists

Two systems used to answer the same question, and disagreed.

- **BKT owns capability estimation.** It answers _"how likely is this learner to succeed on this
  construct right now?"_ It owns `pL`, decay, review-due status, the learner-facing mastery
  percentage, and the `pL >= 0.95` mastery cut (`MASTERY_THRESHOLD` in `@mcat/policies`).
- **The evidence system owns the warrant.** It answers _"what kinds of evidence stand behind that
  estimate, how independent, diverse, and fresh are they, and what is missing?"_ It owns
  `independent`, family diversity (`familyId`), transfer evidence, delayed/retention evidence, the
  `mixed` / `passage` / `timed` / `protected` conditions, freshness, recipe gaps, supporting
  evidence, and audit reasons.

The evidence system MUST NOT independently answer _"is this learner mastered?"_. Two systems
answering one question guarantees contradiction. The evidence ladder remains a first-class **backend
authority over evidence quality and gaps**; it stops being a second learner-facing capability scale.

The seam is reusable by construction: everything below is keyed off the closed vocabularies in Gate
A, never off a lesson ID. There is no lesson-specific branch anywhere in the mastery path.

### 1.1 Scope

**In scope:** author-time item metadata, runtime response facts, server acceptance, evidence-mode
routing, BKT qualification, the two direct BKT grains, lesson KC-rollup semantics, and the
prohibitions that keep authors and clients out of the mastery path.

**Out of scope — this contract does not define, include, or authorize any of these:** capstone
mastery, lesson authoring craft (that is Spec 04), content publication, the lesson-content database
migration, diagnostic seeding, planner implementation, prerequisite-graph activation, and
psychometric calibration.

---

## 2. Three layers and who owns each

Every value in this seam belongs to exactly one of three layers. A value MUST NOT be produced by a
layer that does not own it.

| Layer                        | Produced by                             | When                    | Mutability                                | Examples                                                                                   |
| ---------------------------- | --------------------------------------- | ----------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------ |
| **Author-time metadata**     | Lesson author, under reviewer approval  | Authoring / compile     | Immutable once the binding version is cut | `primaryKcId`, `reasoningOperation`, `candidateEvidenceModes`, `semanticFamilyId`          |
| **Runtime facts**            | Lesson runner (client + session server) | During the attempt      | Append-only, never edited                 | `attemptIndex`, `assistanceLevel`, `revealUsed`, `chosenChoiceId`, `elapsedMs`             |
| **Server-derived decisions** | Server policy only                      | On accepting a response | Derived, reproducible, audited            | `outcome`, `scoringValid`, `independent`, `EvidenceRecord.kind`, `pL`, `serverItemVersion` |

The rule that follows from this table, stated once and enforced everywhere below:

> **The lesson runner emits FACTS. Server policy decides MEANING.** The runner never decides
> correctness, never decides `independent`, never decides which evidence slots are satisfied, and
> never decides whether BKT moves.

### 2.1 Producer / consumer ownership

| Artifact                     | Sole producer                        | Consumers                                              | Never touched by                |
| ---------------------------- | ------------------------------------ | ------------------------------------------------------ | ------------------------------- |
| `LessonItemBinding`          | Lesson authoring + compile (Spec 04) | Server acceptance, evidence routing, BKT qualification | Runtime, client, BKT engine     |
| `LessonRuntimeResponseFacts` | Lesson runner                        | Server acceptance                                      | Author, BKT engine              |
| `AcceptedLessonObservation`  | Server acceptance (server-only)      | Evidence routing, BKT qualification                    | Author, client                  |
| `EvidenceRecord`             | Evidence system (server-only)        | Evidence recipes, gap analysis, audit                  | Author, client, BKT engine      |
| `QualifiedBktObservation`    | BKT qualification (server-only)      | BKT engine only                                        | Author, client, evidence system |
| `pL` and every derived view  | `@mcat/policies` BKT engine          | Learner-facing progress surfaces                       | Author, client, evidence system |

Note the two disjoint terminal consumers: an `EvidenceRecord` never carries a capability estimate,
and a `QualifiedBktObservation` never carries an evidence rank or status. That disjointness is the
whole point of the seam and is restated as an invariant in §11.

---

## 3. `LessonItemBinding` — author-time metadata

`LessonItemBinding` / `LessonItemBindingSchema` (`@mcat/contracts`, new) is the immutable
author-side half of the seam. Author artifacts are `snake_case`; internal TypeScript is `camelCase`;
the artifact adapter is the only place that boundary is crossed. Enum string values are never
case-converted.

| Author key (`snake_case`)        | Internal key (`camelCase`)    | Required               | Semantics and constraints                                                                                                                                                                                   |
| -------------------------------- | ----------------------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lesson_id`                      | `lessonId`                    | yes                    | Owning lesson. Routing/audit only. It is **never** a BKT target.                                                                                                                                            |
| `item_binding_id`                | `itemBindingId`               | yes                    | Stable identity of this binding.                                                                                                                                                                            |
| `question_id`                    | `questionId`                  | yes                    | Canonical server-scored item ID. Legacy fallback is `item_binding_id`.                                                                                                                                      |
| `binding_version`                | `bindingVersion`              | yes                    | Opaque non-empty string. Audit / version-match value only. It MUST NOT be parsed, coerced, or hashed into a numeric item version. Normalize legacy `item_version` or the artifact envelope version into it. |
| `activity_id`                    | `activityId`                  | yes                    | The activity this item sits in.                                                                                                                                                                             |
| `primary_kc_id`                  | `primaryKcId`                 | yes                    | **The only KC-grain BKT target.** Maps to `EvidenceRecord.skillId`.                                                                                                                                         |
| `secondary_kc_mappings`          | `secondaryKcMappings`         | yes (may be empty)     | Readonly array. Coverage/reporting only. **Never** a BKT target.                                                                                                                                            |
| `activity_role`                  | `activityRole`                | yes                    | `LessonActivityRole` (§3.1).                                                                                                                                                                                |
| `semantic_family_id`             | `semanticFamilyId`            | yes                    | Item family. Maps to `EvidenceRecord.familyId`. A family fills a given recipe slot at most once.                                                                                                            |
| `stimulus_lineage_id`            | `stimulusLineageId`           | optional               | Canonical lineage key. Normalize legacy `stimulus_lineage` string or `stimulus_lineage.lineage_id`.                                                                                                         |
| `first_attempt_immutable`        | `firstAttemptImmutable`       | yes                    | Literal `true`. Any other value fails BKT qualification with `FIRST_ATTEMPT_NOT_IMMUTABLE`.                                                                                                                 |
| `authored_assistance_level`      | `authoredAssistanceLevel`     | yes                    | `AssistanceLevel` (`A3` / `A2` / `A1` / `A0`). Design intent. It is **not** the runtime fact and never proves independence. Normalize legacy `assistance_state`.                                            |
| `candidate_evidence_modes`       | `candidateEvidenceModes`      | yes                    | Readonly `CandidateEvidenceMode[]` (§3.2). The immutable permission set. Normalize legacy `evidence_eligibility`.                                                                                           |
| `reasoning_operation`            | `reasoningOperation`          | conditional            | `ReasoningOperation`. **Required if and only if `candidateEvidenceModes` includes `INDEPENDENT`** (§6). Never inferred from free text.                                                                      |
| `dok_level`                      | `dokLevel`                    | optional               | `DokLevel` — `1`, `2`, `3`, or `4`. Optional even on an `INDEPENDENT` binding. No default (§6).                                                                                                             |
| `representation_id`              | `representationId`            | optional/nullable      | Open non-empty string or `null`. Item-level representation.                                                                                                                                                 |
| `representation_family_id`       | `representationFamilyId`      | optional               | External REPFAM reference. Currently unpopulated and MUST NOT be adapter-derived.                                                                                                                           |
| `changed_dimensions`             | `changedDimensions`           | yes (may be `[]`)      | Authored canonical `ChangeDimension[]`. Maps to `EvidenceRecord.changeDimensions`.                                                                                                                          |
| `changed_dimension_detail`       | `changedDimensionDetail`      | optional               | Raw reviewed prose. Retained for review. **Never** a BKT target and never parsed into `changedDimensions`.                                                                                                  |
| `learner_operation`              | `learnerOperation`            | optional               | Instructional free text. **Never** a capability label and never `reasoningOperation` (§6.2).                                                                                                                |
| `semantic_structure`             | `semanticStructure`           | optional               | Free-text authoring structure. `semanticStructure.operation` is free text and is **never** `reasoningOperation`.                                                                                            |
| `learner_safe_item_ref`          | `learnerSafeItemRef`          | yes                    | Learner-safe reference only. Normalize legacy learner-safe projection/ref keys.                                                                                                                             |
| `server_scoring_authority_ref`   | `serverScoringAuthorityRef`   | yes (server-only)      | Protected scorer reference. Never leaves the server.                                                                                                                                                        |
| `server_rationale_authority_ref` | `serverRationaleAuthorityRef` | optional (server-only) | Protected rationale reference. Never leaves the server.                                                                                                                                                     |

**Structurally absent from `LessonItemBinding`.** The schema MUST NOT accept `independent`, `pL`,
any mastery status or threshold, decay, or any evidence status. These are not "ignored if present" —
they have no field to occupy. See §9.

### 3.1 `LessonActivityRole`

`LessonActivityRole` / `LessonActivityRoleSchema` has exactly nine members:

`ENTRY_CHECK`, `WORKED_EXAMPLE`, `GUIDED_PRACTICE`, `LIGHT_SUPPORT_PRACTICE`, `SOLO_PRACTICE`,
`NEAR_EXIT`, `CHANGED_EXIT`, `REPAIR_CONFIRMATION`, `REHEARSAL_ONLY`.

The role describes what the activity is _for_. It does **not** by itself grant any evidence mode and
it never grants BKT eligibility. Spec 04 §4.4 defines the pinned bijective adapter
`NEAR_EXIT → NEAR_USE` and `CHANGED_EXIT → CHANGED_TASK` for the `failed_function` axis; that
adapter is about reentry bookkeeping and has no effect on this seam.

### 3.2 `CandidateEvidenceMode`

`CandidateEvidenceMode` / `CandidateEvidenceModeSchema` has exactly thirteen members:

`DIAGNOSTIC`, `ENTRY`, `INSTRUCTIONAL`, `INSTRUCTIONAL_EXIT`, `INDEPENDENT`, `TRANSFER`, `DELAYED`,
`MIXED`, `PASSAGE`, `TIMED`, `PROTECTED`, `REPAIR_CONFIRMATION`, `REHEARSAL_ONLY`.

`candidateEvidenceModes` is a **permission set, not an outcome**. Declaring `INDEPENDENT` does not
make a response independent; it only makes independence _reachable_ if runtime qualification also
passes (§5). Legacy normalization is fixed: `INSTRUCTION_TELEMETRY_ONLY`,
`NON_EXIT_INSTRUCTIONAL_ONLY`, and `INSTRUCTIONAL_ONLY` all become
`candidateEvidenceModes: ['INSTRUCTIONAL']`; `INSTRUCTIONAL_EXIT_ONLY` becomes
`candidateEvidenceModes: ['INSTRUCTIONAL_EXIT']`.

### 3.3 `ChangeDimension` handling

`changedDimensions` is authored canonical `ChangeDimension[]` — `domain_context`, `representation`,
`passage_or_data`, `required_operation`, `section_application` — and MAY be `[]`.
`changedDimensionDetail` always retains the raw reviewed prose. Compound or unmapped prose permits
an empty or partial `changedDimensions` array and is **never** a validation error. The adapter MUST
NOT infer canonical dimensions from prose; new bindings author `changedDimensions` directly. The
shipped domain enum MUST NOT be widened with `unknown_variable`, `direction_of_inference`, or
`surface_to_structure_translation`; raw prose already preserves that detail.

---

## 4. `LessonRuntimeResponseFacts` — runtime facts

`LessonRuntimeResponseFacts` / `LessonRuntimeResponseFactsSchema` (`@mcat/contracts`, new) is what
the lesson runner emits per response. Every field is an observed fact. None is a judgement.

| Field                    | Type / constraint      | Semantics                                                                                 |
| ------------------------ | ---------------------- | ----------------------------------------------------------------------------------------- |
| `questionId`             | required               | Must resolve to the same item as the binding.                                             |
| `itemBindingId`          | required               | Links the response to its binding.                                                        |
| `bindingVersion`         | required opaque string | MUST equal the resolved binding's `bindingVersion`; otherwise `BINDING_VERSION_MISMATCH`. |
| `attemptIndex`           | positive integer       | `1` is the first attempt. Only `1` can qualify for BKT.                                   |
| `isRetry`                | boolean                | Any retry of this item in this session.                                                   |
| `isDiagnosticRetry`      | boolean                | Retry after a miss inside a diagnostic flow.                                              |
| `chosenChoiceId`         | `string \| null`       | `null` only together with `omitted: true`.                                                |
| `omitted`                | boolean                | Omission is explicit, never inferred from a null choice alone.                            |
| `elapsedMs`              | nonnegative number     | Time on item.                                                                             |
| `answerChanges`          | nonnegative integer    | Count of answer changes before commit.                                                    |
| `assistanceLevel`        | `AssistanceLevel`      | The assistance actually in force at commit — **not** `authoredAssistanceLevel`.           |
| `contentBearingHintUsed` | boolean                | A hint that carried content toward the answer.                                            |
| `revealUsed`             | boolean                | The key or rationale was revealed before commit.                                          |
| `occurredAt`             | timestamp              | Runtime occurrence time.                                                                  |

The runner MUST NOT emit `correct`, `independent`, an evidence kind, a `pL`, or any mastery
statement. There is no field for any of them.

---

## 5. Two gates: declared eligibility, then runtime qualification

A response moves BKT only when **both** gates pass. They are separate, evaluated in order, and
neither can substitute for the other.

```text
LessonItemBinding + LessonRuntimeResponseFacts
        │
        ├─ Gate 1 — DECLARED ELIGIBILITY (immutable, author-time)
        │     hasIndependentEvidenceMode(binding)
        │     binding.firstAttemptImmutable === true
        │     binding.reasoningOperation present
        │
        ├─ (server acceptance) → AcceptedLessonObservation → EvidenceRecord   ← always, if scored
        │
        └─ Gate 2 — RUNTIME QUALIFICATION (per response)
              attemptIndex === 1, no retry, assistanceLevel === 'A0',
              no content-bearing hint, no reveal, scoringValid === true
                      │
                      └─ QualifiedBktObservation → BKT engine                 ← only if BOTH pass
```

### 5.1 Gate 1 — declared eligibility (immutable)

Evaluated against the binding alone. Use the exported predicate
`hasIndependentEvidenceMode(binding)`; do not re-implement the membership test.

| Requirement                                                            | Rejection code on failure                      |
| ---------------------------------------------------------------------- | ---------------------------------------------- |
| A binding resolves for the response                                    | `BINDING_NOT_FOUND`                            |
| `response.bindingVersion === binding.bindingVersion`                   | `BINDING_VERSION_MISMATCH`                     |
| `binding.firstAttemptImmutable === true`                               | `FIRST_ATTEMPT_NOT_IMMUTABLE`                  |
| `binding.candidateEvidenceModes` includes `INDEPENDENT`                | `INDEPENDENT_EVIDENCE_MODE_NOT_DECLARED`       |
| `binding.reasoningOperation` is present when `INDEPENDENT` is declared | `ELIGIBLE_BINDING_MISSING_REASONING_OPERATION` |

Gate 1 is deliberately conservative: an absent or unrecognized declaration is a rejection, never a
default-allow.

### 5.2 Gate 2 — runtime qualification (per response)

| Requirement                                                             | Rejection code on failure   |
| ----------------------------------------------------------------------- | --------------------------- |
| `accepted.scoringValid === true`                                        | `SERVER_SCORING_INVALID`    |
| `response.attemptIndex === 1`                                           | `NOT_FIRST_ATTEMPT`         |
| `response.assistanceLevel === 'A0'`                                     | `ASSISTANCE_NOT_A0`         |
| `response.contentBearingHintUsed === false`                             | `CONTENT_BEARING_HINT_USED` |
| `response.revealUsed === false`                                         | `REVEAL_USED`               |
| `response.isRetry === false` and `response.isDiagnosticRetry === false` | `RETRY_USED`                |

`A0` metadata on the binding is **necessary but never sufficient**. `authoredAssistanceLevel: 'A0'`
is a design statement; only `response.assistanceLevel === 'A0'` at commit, together with every other
row above, is evidence of independent work.

### 5.3 Result shape

`BktQualificationResult` / `BktQualificationResultSchema` is a discriminated union on `status`:

- `status: 'qualified'` → `observation: QualifiedBktObservation`
- `status: 'rejected'` → `rejectionCodes: readonly BktQualificationRejectionCode[]`

Qualification MUST collect **all** applicable codes from `BKT_QUALIFICATION_REJECTION_CODES` rather
than short-circuiting on the first, so the audit trail explains every reason a response did not move
`pL`. Use `isBktQualificationAccepted(result)` to test the union; do not compare `status` strings by
hand. Every rejection MUST be recorded; silent drops are prohibited.

---

## 6. Conditional metadata: when an author must stop and label an item

**The rule, in one paragraph.** If a binding declares `INDEPENDENT` in `candidateEvidenceModes`, the
author MUST stop and label `reasoning_operation` with exactly one of the seven members of
`ReasoningOperation` — `IDENTIFY`, `PREDICT`, `EXPLAIN`, `RELATE`, `QUANTIFY`, `DESIGN`, `EVIDENCE` —
because that value is a direct BKT update target and there is no safe way for any adapter, heuristic,
or model to guess which of seven operations an item actually exercises; a wrong guess silently
corrupts a learner-facing skill estimate. On every other binding — instructional, entry, exit,
rehearsal, repair — `reasoning_operation` is optional, and an unlabeled item is fine because it can
never reach BKT. `dok_level` is different: it is **optional even on an `INDEPENDENT` binding**,
because `coldStartB()` in `packages/policies/src/irt.ts` returns a neutral `0` for an undefined DOK,
so an unlabeled item merely loses difficulty discrimination until the item is calibrated from real
attempts. So: labeling `reasoning_operation` on an eligible binding is a hard stop; labeling
`dok_level` is a quality improvement you should make when you can and may defer when you cannot.

If an author cannot confidently choose one `ReasoningOperation`, the correct action is to **not
declare `INDEPENDENT`** on that binding. Guessing the operation to unlock eligibility is a defect.

`DokLevel` in V3 is the closed set `1` / `2` / `3` / `4`. The legacy v7 `dok_level` in
`packages/content/src/schema.ts` remains unbounded; `coldStartB(undefined) === 0` and inputs `>= 5`
map to `1.4`.

### 6.1 The seven-operation axis is not the eight authoring tags

`ReasoningOperation` (7 members, `packages/contracts/src/vocab.ts`) is the mastery axis.
`OperationTag` (8 members `K` / `Q` / `E` / `D` / `P` / `A` / `I` / `T`, same file) is the generic
authoring-analysis vocabulary and is what `EvidenceRecord.operation` holds. They are different
vocabularies with a confusingly similar name. `EvidenceRecord.operation` MUST remain `OperationTag`
and MUST NOT be populated from `reasoningOperation`.

### 6.2 `learnerOperation` is not a capability label

`learnerOperation` and `semanticStructure.operation` are instructional free text: they tell a learner
or reviewer what to _do_ on this screen. They MUST NOT be read, parsed, mapped, or inferred into
`reasoningOperation`, and they never influence eligibility, evidence mode, or BKT.

---

## 7. Server acceptance and evidence-mode routing

### 7.1 `AcceptedLessonObservation`

`AcceptedLessonObservation` / `AcceptedLessonObservationSchema` (server-only) is the authoritative
record of one accepted lesson response: `observationId`, `eventId`, `learnerId`, `idempotencyKey`,
the `binding` snapshot, the `response` snapshot, `bindingVersion`, optional `serverItemVersion`, the
server-decided `outcome` (`correct` / `incorrect` / `omitted`), `scoringValid`, `acceptedAt`,
`sequence`, `contentRelease`, and `policies`.

`SERVER_ITEM_VERSION_RESOLUTION` is normative: resolve the positive integer `serverItemVersion` from
`serverScoringAuthorityRef` for the pair (`questionId`, `bindingVersion`). Never parse, coerce, or
hash `bindingVersion` into it. If no mapping exists, the server MUST set `scoringValid: false`, emit
`SERVER_SCORING_INVALID`, and produce **no** `EvidenceRecord` and **no** BKT output.

`scoringValid` is a server-only scoring-validity fact. It MUST NOT be renamed to, aliased with, or
stored as `EvidenceRecord.valid`, which means something else (the content was not retired or
corrected).

### 7.2 Evidence-mode routing

Evidence is produced for every scored lesson response, independent of BKT eligibility. Routing is a
pure function of `candidateEvidenceModes` plus server-derived runtime conditions.

| Declared `CandidateEvidenceMode` | `EvidenceRecord.kind` | `independent` (server-derived) | Can reach BKT?          |
| -------------------------------- | --------------------- | ------------------------------ | ----------------------- |
| `DIAGNOSTIC`                     | `placement`           | `false`                        | no                      |
| `ENTRY`                          | `instruction`         | `false`                        | no                      |
| `INSTRUCTIONAL`                  | `instruction`         | `false`                        | no                      |
| `INSTRUCTIONAL_EXIT`             | `instruction`         | `false`                        | **no**                  |
| `INDEPENDENT`                    | `independent`         | only if Gate 2 passes          | yes                     |
| `TRANSFER`                       | `transfer`            | only if Gate 2 passes          | yes, with `INDEPENDENT` |
| `DELAYED`                        | `delayed`             | only if Gate 2 passes          | yes, with `INDEPENDENT` |
| `MIXED`                          | `mixed`               | only if Gate 2 passes          | yes, with `INDEPENDENT` |
| `PASSAGE`                        | `integrated_passage`  | only if Gate 2 passes          | yes, with `INDEPENDENT` |
| `TIMED`                          | `timed`               | only if Gate 2 passes          | yes, with `INDEPENDENT` |
| `PROTECTED`                      | `protected`           | only if Gate 2 passes          | yes, with `INDEPENDENT` |
| `REPAIR_CONFIRMATION`            | `instruction`         | `false`                        | no                      |
| `REHEARSAL_ONLY`                 | `instruction`         | `false`                        | no                      |

`INSTRUCTIONAL_EXIT` produces `EvidenceRecord.kind: 'instruction'` with server-derived
`independent: false`. This is the row that governs the current V3 lessons (§10).

Field mapping into the existing `EvidenceRecord`: `primaryKcId → skillId`,
`semanticFamilyId → familyId`, `serverItemVersion → itemVersion`, `changedDimensions →
changeDimensions`, accepted `outcome → outcome`. The `conditions` object (`mixed`, `passage`,
`timed`, `protected`, `accommodations`) is server-derived from the declared modes and the runtime
session; the author never writes it. `EvidenceRecord` MUST NOT gain a capability-estimate field.

---

## 8. BKT routing and the two grains

### 8.1 `QualifiedBktObservation`

`QualifiedBktObservation` / `QualifiedBktObservationSchema` (server-only) is the only input the BKT
engine accepts from a lesson: `observationId`, `questionId`, `itemBindingId`, `bindingVersion`,
`serverItemVersion` (the resolved positive integer), `primaryKcId`, `reasoningOperation`, `correct`,
optional `dokLevel`, `occurredAt`, `sequence`, `contentRelease`, `policies`.

`correct` is server-derived from the accepted `outcome`; an `omitted` outcome becomes `correct:
false`.

`QualifiedBktObservation` has **no** `lessonId`, `pL`, `mastered`, `masteryThreshold`,
`evidenceStatus`, `kind`, or `independent` field, and MUST NOT gain one.

### 8.2 Exactly two direct grains

A qualified response updates exactly two BKT states:

1. the **primary KC**, keyed by `primaryKcId`; and
2. the **primary reasoning operation**, keyed by `reasoningOperation`.

`secondaryKcMappings` MUST NOT be a BKT target. `lessonId` MUST NOT be a BKT target. **Lessons do
not have their own BKT state under this seam.**

---

## 9. Lesson mastery is a rollup

A lesson-grain number is **derived on read** from the `pL` of the lesson's required member KCs. The
seam writes no lesson BKT state and Gate A locks no new exported symbol for the rollup; if a
lesson-grain value is rendered through the existing `LessonMasteryView` DTO, that DTO's fields MUST
be populated by the rules below rather than by a lesson BKT chain.

| Output           | Rule                                                                                                                                                                        |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Displayed value  | **Arithmetic mean** of the current (lazily decayed) `pL` of every required member KC.                                                                                       |
| `mastered`       | `true` only when **every** required member KC satisfies `isMastered(pL)`, i.e. `pL >= 0.95`. One KC below the cut blocks it.                                                |
| Review-due       | `true` when **any** previously practiced required KC is due (its decayed `pL` has fallen below `REVIEW_LINE = 0.90`). A KC that has never been practiced is not due.        |
| Missing KC state | A required KC with no state contributes the `PRIOR_PL0 = 0.20` prior to the mean **and** blocks `mastered`.                                                                 |
| Missing mapping  | A missing or empty lesson-to-KC mapping **FAILS CLOSED**: emit no lesson-grain value at all. It MUST NOT be reported as `0`, as mastered, or as an empty-set vacuous truth. |

Three consequences worth stating explicitly, because they are the ones implementers get wrong:

- The mean is a **display** value. It is not a probability of lesson mastery and MUST NOT be
  compared against `MASTERY_THRESHOLD` to decide `mastered`.
- A lesson can show a high mean and still be `mastered: false`. That is correct behaviour.
- Lesson delivery, checkpoint, and repair state (Spec 03 `LessonRun` progress, instructional exit,
  completion) is a **separate axis** from mastery. Completing a lesson MUST NOT set, raise, or imply
  mastery, and a mastered rollup MUST NOT mark a lesson delivered.

The legacy `MasteryUnitStates.lesson` chain in `packages/policies/src/mastery-attempt.ts` and the
legacy direct-BKT reading of `LessonMasteryView.pL` are **excluded from this seam** and MUST NOT be
the source of a V3 lesson-grain value.

---

## 10. Prohibitions

These are the hard walls. A change that breaches one is a defect regardless of how convenient it is.

**A lesson author MUST NOT be able to write, anywhere in a lesson script or binding:**

- `independent` (or any synonym for it);
- a `pL` or any probability of mastery;
- a mastery threshold, mastery status, or `mastered` flag;
- a decay rate, half-life, or review-due status;
- an evidence status, evidence rank, evidence kind, or "this counts as mastery" assertion.

None of these have a field in `LessonItemBinding`. Enforcement is structural (schema closure), not
advisory.

**The client MUST NOT** decide correctness, compute or write mastery, set `independent`, or emit any
evidence status. The client presents; it may optimistically acknowledge; it never adjudicates.

**Protected-shape rules.** The learner-safe surface carries `learnerSafeItemRef` and nothing else
that could leak the key: no `correctChoiceId`, `correctAnswer`, `answerKey`, `scoringLogic`,
`protectedRationale`, `rationales`, or `explanations`. `serverScoringAuthorityRef`,
`serverRationaleAuthorityRef`, `AcceptedLessonObservation`, `EvidenceRecord`, and
`QualifiedBktObservation` are server-only.

**Cross-system rules.** The evidence system MUST NOT emit a capability estimate. The BKT system MUST
NOT read an evidence rank or status. Only policy owns `pL`.

---

## 11. The current V3 lessons move no `pL` — and that is correct

The shipped V3 vector lesson `V3-LES-130923` (`packages/content/src/v3-vector-lesson-artifacts.ts`)
declares its near-use and changed-task exits as instructional exits. Under legacy normalization those
become `candidateEvidenceModes: ['INSTRUCTIONAL_EXIT']`, and every non-exit item becomes
`candidateEvidenceModes: ['INSTRUCTIONAL']`.

Therefore, after this seam ships, **`V3-LES-130923` moves no `pL` at all**. Every response it
produces is routed to `EvidenceRecord.kind: 'instruction'` with `independent: false`, and every BKT
qualification attempt is rejected with `INDEPENDENT_EVIDENCE_MODE_NOT_DECLARED`.

This is the intended, correct end state, not an incomplete integration. The current lesson's exits
were authored as instructional checks; nobody has reviewed and approved them as independent
measurement, and no `reasoningOperation` was assigned to them. Manufacturing eligibility for them
after the fact — by defaulting a mode, inferring an operation from `learnerOperation`, or treating
`NEAR_EXIT` as implying independence — would fabricate capability evidence. The lesson produces
genuine instructional evidence today, and it becomes BKT-eligible only when an author and reviewer
deliberately add `INDEPENDENT` to `candidateEvidenceModes` and label `reasoningOperation`.

---

## 12. Versioning, idempotency, replay, and protected scoring

**Versioning.** `bindingVersion` is an opaque non-empty string and the sole version-match value
between a response and its binding. A mismatch is `BINDING_VERSION_MISMATCH` and produces no
evidence and no BKT update. `serverItemVersion` is a separate, server-resolved positive integer used
for `EvidenceRecord.itemVersion`; the two MUST NOT be conflated or derived from each other. Changing
any authored binding byte requires a new `bindingVersion`; bindings are never edited in place.

**Idempotency.** `AcceptedLessonObservation.idempotencyKey` is authoritative. Re-delivering the same
response MUST resolve to the same `observationId` and MUST NOT produce a second `EvidenceRecord` or a
second BKT update. Downstream systems key off `observationId`, never off a retry of the transport.

**Replay.** Replaying the same accepted observations, in `sequence` order, under the same
`contentRelease` and `policies`, MUST reproduce identical `EvidenceRecord`s, identical qualification
results, and identical `pL`. Qualification and evidence routing are therefore pure functions of the
accepted observation — they MUST NOT read wall-clock time, mutable configuration, or any state
outside the observation and the pinned policy versions.

**Protected scoring.** Scoring happens only behind `serverScoringAuthorityRef`. `scoringValid` is
that authority's verdict. There is no client-side, author-side, or fallback scoring path: no
resolvable scoring authority means `scoringValid: false`, `SERVER_SCORING_INVALID`, and no
downstream output at all.

---

## 13. Normative acceptance criterion

> **A second conforming V3 lesson MUST require zero changes to mastery policy.**

Concretely, integrating lesson number two MUST require **no** edits to: `@mcat/policies` BKT, IRT,
forgetting, or prerequisite modules; the qualification rules in §5; the evidence-mode routing table
in §7.2; the rollup rules in §9; or any schema listed in Gate A's exported-symbols table. The only
new artifacts permitted are the lesson's own content and its `LessonItemBinding` values.

If integrating a new lesson requires a policy change, one of these is true and MUST be fixed rather
than worked around:

- the lesson is using a vocabulary member that does not exist and should be added by governed
  revision of the closed enum, not by a lesson-specific branch;
- the adapter is being asked to infer something it MUST NOT infer (§3.3, §6.2); or
- someone is trying to give a lesson its own mastery semantics, which §8.2 and §9 forbid.

**Conformance checklist for a new lesson integration.** All of the following MUST hold:

1. Every scored item has a `LessonItemBinding` that validates against `LessonItemBindingSchema`.
2. `firstAttemptImmutable` is literally `true` on every binding.
3. Every binding declaring `INDEPENDENT` also carries a `reasoningOperation`.
4. No binding contains `independent`, `pL`, a mastery threshold or status, decay, or an evidence
   status.
5. The runner emits `LessonRuntimeResponseFacts` only, with no derived judgement.
6. Every scored response resolves a `serverItemVersion` through `serverScoringAuthorityRef`, or is
   rejected with `SERVER_SCORING_INVALID`.
7. The lesson-to-required-KC mapping is present and non-empty, or the lesson-grain value fails closed.
8. No new lesson-specific code exists in `@mcat/policies` or in the evidence router.
9. Replaying the lesson's accepted observations reproduces identical evidence and identical `pL`.

---

## 14. Related documents

- `.superpowers/sdd/field-lock.md` — Gate A naming registry. Authoritative over this file.
- `docs/design/04-V3-LESSON-AUTHORING-QUALITY-AND-UI.md` — Spec 04: lesson structure, KC order,
  nodes/screens, activity roles, item bindings, assistance design, repair/reentry, presentation,
  checkpoints, and authoring/review gates. Spec 04 owns _how the metadata gets authored and
  reviewed_; this contract owns _what the metadata means downstream_.
- `docs/mastery-pipeline.md` — the BKT/IRT engine, its formulas and constants.
- `docs/governance/authority-boundaries.md` — the actor permission table this seam sits inside.
- `docs/content/question-format-guide.md` — the eight generic authoring-analysis tags versus the
  seven-operation mastery axis.
