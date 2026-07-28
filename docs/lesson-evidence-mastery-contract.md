# Lesson → Evidence → Mastery Contract

**Status:** Normative seam contract, version 1.1.
**Date:** July 27, 2026.
**Vocabulary authority:** `.superpowers/sdd/field-lock.md` (Gate A), including its Task 2b
three-lesson conformance amendment (decisions D1–D10). Every identifier in this document is taken
verbatim from that registry. Where this document and Gate A disagree, Gate A wins and this document
is defective.
**Implementation:** `packages/contracts/src/lesson-observation.ts` (schemas) and
`packages/domain/src/lesson-response-adapter.ts` (the single normalization + adaptation seam). This
document describes what those modules do; where it describes something they do not do, that is a
defect in one of the two and §15 says how to report it.
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
A, never off a lesson ID. Nothing in `lesson-response-adapter.ts` branches on a lesson id, a KC id,
an id format, an item count, or an item ordering.

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

| Layer                        | Produced by                             | When                    | Mutability                         | Examples                                                                                       |
| ---------------------------- | --------------------------------------- | ----------------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------- |
| **Author-time metadata**     | Lesson author, under reviewer approval  | Authoring / compile     | Immutable once the artifact is cut | `primaryKcId`, `reasoningOperation`, `candidateEvidenceModes`, `authoredAssistanceAffordances` |
| **Runtime facts**            | Lesson runner (client + session server) | During the attempt      | Append-only, never edited          | `attemptIndex`, `assistanceLevel`, `revealUsed`, `response`, `elapsedMs`                       |
| **Server-derived decisions** | Server policy only                      | On accepting a response | Derived, reproducible, audited     | `outcome`, `scoringValid`, `independent`, `EvidenceRecord.kind`, `pL`, `serverItemVersion`     |

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

`LessonItemBinding` / `LessonItemBindingSchema` (`@mcat/contracts`) is the immutable author-side half
of the seam. Author artifacts are `snake_case`; internal TypeScript is `camelCase`;
`normalizeAuthoredLessonBinding` in `packages/domain/src/lesson-response-adapter.ts` is the **only**
place that boundary is crossed. Enum string values are never case-converted.

### 3.1 The binding is a discriminated union (D1)

`LessonItemBindingSchema` is a discriminated union on `measurementKind`, not one shape with
everything nullable. Nullable-everything was rejected because it fails open: a scored item that
forgot its scoring authority would look exactly like exposition that legitimately has none.

| `measurementKind` | What it is                    | Attempt/scoring fields                                                                                       | Downstream                                                                    |
| ----------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| `MEASURABLE`      | A scored attempt              | `questionId`, `activityId`, `firstAttemptImmutable: true`, `serverScoringAuthorityRef` are **required**      | Produces an `AcceptedLessonObservation` and, when scored, an `EvidenceRecord` |
| `NON_MEASURABLE`  | Exposition (a worked example) | Those same fields plus `serverRationaleAuthorityRef` are **structurally forbidden** (`z.never().optional()`) | Produces **nothing**: no observation, no evidence record, no BKT observation  |

`measurementKind` is **explicitly supplied by the adapter**, never inferred by the schema from a
missing or null field. `measurementKindFor` derives it from `activity_role` alone: `WORKED_EXAMPLE`
is `NON_MEASURABLE`, everything else is `MEASURABLE`. An authored `first_attempt_policy` string is
reviewed prose and MUST NOT be a load-bearing discriminator.

A worked example is exposition, not a failed attempt. `adaptLessonResponse` returns
`status: 'not_measurable'` with `observation: null` and `evidence: null`. The frozen
`BKT_QUALIFICATION_REJECTION_CODES` list has no exposition member, so the accompanying rejection code
is `FIRST_ATTEMPT_NOT_IMMUTABLE` — the honest fit, since exposition has no first attempt to preserve
— and the `not_measurable` status carries the real reason. Do not read that code as "the author got
the attempt policy wrong".

### 3.2 Fields common to both variants

| Author key (`snake_case`)                   | Internal key (`camelCase`)      | Required            | Semantics and constraints                                                                                                                                                                                                        |
| ------------------------------------------- | ------------------------------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| —                                           | `measurementKind`               | yes (adapter)       | `MEASURABLE` or `NON_MEASURABLE`. Adapter-supplied from `activity_role`; never authored, never schema-inferred.                                                                                                                  |
| `lesson_id`                                 | `lessonId`                      | yes (envelope)      | Owning lesson, taken from the artifact envelope. Routing/audit only. **Never** a BKT target.                                                                                                                                     |
| `item_binding_id`                           | `itemBindingId`                 | yes                 | `LessonItemId`. Stable identity of this binding.                                                                                                                                                                                 |
| `binding_version`                           | `bindingVersion`                | **optional** (D5)   | Opaque non-empty string. Audit / version-match value only, never parsed, coerced, or hashed into a numeric item version. The adapter fills it from `binding_version`, then `item_version`, then the envelope `artifact_version`. |
| `primary_kc_id`                             | `primaryKcId`                   | yes                 | **The only KC-grain BKT target.** Maps to `EvidenceRecord.skillId`.                                                                                                                                                              |
| `secondary_kc_mappings`                     | `secondaryKcMappings`           | defaults to `[]`    | Readonly array. Coverage/reporting only. **Never** a BKT target. Falls back to `secondary_kc_refs`.                                                                                                                              |
| `secondary_kc_refs`                         | `secondaryKcRefs`               | optional            | Additional coverage metadata. **Never** a BKT target.                                                                                                                                                                            |
| `activity_role`                             | `activityRole`                  | yes                 | `LessonActivityRole` (§3.4). Also the input to `measurementKind`.                                                                                                                                                                |
| `semantic_family_id`                        | `semanticFamilyId`              | yes                 | Item family. Maps to `EvidenceRecord.familyId`. A family fills a given recipe slot at most once.                                                                                                                                 |
| `stimulus_lineage_id`                       | `stimulusLineageId`             | optional            | Maps to `EvidenceRecord.stimulusId`. Normalize legacy `stimulus_lineage` string or `stimulus_lineage.lineage_id`.                                                                                                                |
| `assistance_available` / `assistance_state` | `authoredAssistanceAffordances` | yes, non-empty (D2) | Open readonly strings naming help the item **offers** (`A2`, `VISIBLE_EXPLANATION`, `NOT_SURE_ALLOWED`, …). See §3.3. It is **not** an `AssistanceLevel` and it never touches independence.                                      |
| `candidate_evidence_modes`                  | `candidateEvidenceModes`        | **optional** (D3)   | Non-empty readonly `CandidateEvidenceMode[]`. **Absent defaults to `['INSTRUCTIONAL']`**; an explicitly empty array is rejected. A permission set, not an outcome (§3.5).                                                        |
| `reasoning_operation`                       | `reasoningOperation`            | conditional (D4)    | `ReasoningOperation`. **Required if and only if any declared mode is not `INSTRUCTIONAL`** (§6). Never inferred from free text.                                                                                                  |
| `dok_level`                                 | `dokLevel`                      | optional            | `DokLevel` — `1`, `2`, `3`, or `4`. Optional even on an eligible binding. No default (§6).                                                                                                                                       |
| `representation_id`                         | `representationId`              | optional/nullable   | Open non-empty string or `null`. Item-level representation.                                                                                                                                                                      |
| `representation_family_id`                  | `representationFamilyId`        | optional/nullable   | External REPFAM reference. Currently unpopulated and MUST NOT be adapter-derived.                                                                                                                                                |
| `changed_dimensions`                        | `changedDimensions`             | yes (may be `[]`)   | Authored canonical `ChangeDimension[]`. Maps to `EvidenceRecord.changeDimensions`.                                                                                                                                               |
| `changed_dimension_detail`                  | `changedDimensionDetail`        | optional            | Raw reviewed prose; an empty string is valid. **Never** a BKT target and never parsed into `changedDimensions`.                                                                                                                  |
| `learner_operation`                         | `learnerOperation`              | optional            | Instructional free text. **Never** a capability label and never `reasoningOperation` (§6.2).                                                                                                                                     |
| `semantic_structure`                        | `semanticStructure`             | optional            | Free-text authoring structure. `semanticStructure.operation` is free text and is **never** `reasoningOperation`.                                                                                                                 |
| `learner_safe_item_ref`                     | `learnerSafeItemRef`            | yes                 | Either an **opaque ref string** or a **strict inline projection** (§3.6). Never both, never parsed.                                                                                                                              |
| reviewed metadata (D10)                     | see §3.7                        | optional            | Sixteen explicitly typed optional fields. No generic passthrough.                                                                                                                                                                |

Fields required **only** on a `MEASURABLE` binding:

| Author key                                                    | Internal key                  | Semantics                                                                                                                                            |
| ------------------------------------------------------------- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `question_id`                                                 | `questionId`                  | `LessonItemId`. The scored item. Legacy fallback is `item_binding_id`. Maps to `EvidenceRecord.questionId`.                                          |
| `activity_id`                                                 | `activityId`                  | The activity this item sits in.                                                                                                                      |
| `first_attempt_immutable` / `first_attempt_policy: IMMUTABLE` | `firstAttemptImmutable`       | Literal `true`. Anything else fails BKT qualification with `FIRST_ATTEMPT_NOT_IMMUTABLE`.                                                            |
| `server_scoring_authority_ref`                                | `serverScoringAuthorityRef`   | Protected scorer reference (server-only). Legacy aliases: `server_only_answer_authority_ref`, `server_answer_authority_ref`, `answer_authority_ref`. |
| `server_rationale_authority_ref`                              | `serverRationaleAuthorityRef` | Optional protected rationale reference (server-only). Legacy alias: `rationale_authority_ref`.                                                       |

**Structurally absent from `LessonItemBinding`.** The schema MUST NOT accept `independent`, `pL`,
any mastery status or threshold, decay, or any evidence status. These are not "ignored if present" —
both variants are `.strict()`, so they have no field to occupy and a binding carrying one is
rejected rather than sanitized. See §10.

### 3.3 Assistance is two separate facts (D2)

Conflating "what help the item offered" with "what help the learner took" is how an assisted attempt
becomes fake independent evidence. They are two fields on two different objects:

| Fact                            | Field                           | Where        | Vocabulary                                          | Bears on independence?                        |
| ------------------------------- | ------------------------------- | ------------ | --------------------------------------------------- | --------------------------------------------- |
| Affordances the item **offers** | `authoredAssistanceAffordances` | The binding  | **Open** set of strings, author-defined             | **No.** Never read by the independence check. |
| Assistance the learner **took** | `assistanceLevel`               | The response | Closed `AssistanceLevel`: `A3` / `A2` / `A1` / `A0` | **Yes.** The only assistance input.           |

`isIndependentAdministration(response)` in the adapter reads `assistanceLevel`,
`contentBearingHintUsed`, `revealUsed`, `isRetry`, and `isDiagnosticRetry`. It deliberately does not
read the binding at all.

A consequence to expect when reading real artifacts: a lesson that authored `assistance_state: "A0"`
normalizes to `authoredAssistanceAffordances: ['A0']`. That string looks like an `AssistanceLevel`
and is not one — it is an affordance label that happens to be spelled the same way. Nothing keys off
it. An author MUST NOT treat writing `A0` there as a claim of independence.

### 3.4 `LessonActivityRole` and the exit function are two different fields

`LessonActivityRole` / `LessonActivityRoleSchema` has exactly nine members:

`ENTRY_CHECK`, `WORKED_EXAMPLE`, `GUIDED_PRACTICE`, `LIGHT_SUPPORT_PRACTICE`, `SOLO_PRACTICE`,
`NEAR_EXIT`, `CHANGED_EXIT`, `REPAIR_CONFIRMATION`, `REHEARSAL_ONLY`.

`NEAR_USE` and `CHANGED_TASK` are **not** members and MUST NOT be written into `activity_role`. They
are values of a **different field**:

| Field                                                         | Answers                                           | Legal values                                                                    | Vocabulary        |
| ------------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------- | ----------------- |
| `activity_role` → `activityRole`                              | _What kind of activity is this?_                  | The nine `LessonActivityRole` members, including `NEAR_EXIT` and `CHANGED_EXIT` | Closed, governed  |
| `exit_function` / `near_or_changed_function` → `exitFunction` | _What pedagogical function does this exit serve?_ | `NEAR_USE`, `CHANGED_TASK`, or absent                                           | Reviewed metadata |

The second is **derived 1:1 from the first**, and production already does it — see
`packages/content/src/v3-vector-lesson-artifacts.ts:1361-1365`:

```ts
near_or_changed_function:
  safeItem.activity_role === 'NEAR_EXIT'
    ? 'NEAR_USE'
    : safeItem.activity_role === 'CHANGED_EXIT'
      ? 'CHANGED_TASK'
      : null,
```

`services/lambdas/learner-api/src/vector-lesson-runtime.ts:88` types the reentry axis as
`FailedExitFunction = 'NEAR_USE' | 'CHANGED_TASK'` for the same reason: reentry bookkeeping targets
the function, not the role. The on-disk artifacts agree — across all 115 bindings in the three real
lessons, `activity_role` only ever takes the nine governed roles, and `NEAR_USE` / `CHANGED_TASK`
appear only under `near_or_changed_function`, `exit_function`, `failed_function`,
`administration_stage`, and `return_to_failed_function`.

These names are **not interchangeable spellings** and there is no adapter that renames one field to
the other. Writing `NEAR_USE` into `activity_role` is rejected by `LessonActivityRoleSchema`, by the
compile gate, and by conformance.

`activityRole` describes what the activity is _for_. It does **not** by itself grant any evidence
mode, and it never grants BKT eligibility. Its one downstream effect in this seam is `WORKED_EXAMPLE`
→ `measurementKind: 'NON_MEASURABLE'` (§3.1).

### 3.5 `CandidateEvidenceMode` (D3, D4)

`CandidateEvidenceMode` / `CandidateEvidenceModeSchema` has exactly thirteen members:

`DIAGNOSTIC`, `ENTRY`, `INSTRUCTIONAL`, `INSTRUCTIONAL_EXIT`, `INDEPENDENT`, `TRANSFER`, `DELAYED`,
`MIXED`, `PASSAGE`, `TIMED`, `PROTECTED`, `REPAIR_CONFIRMATION`, `REHEARSAL_ONLY`.

Three rules govern the field:

1. **Optional, with a fail-closed default (D3).** No lesson on disk authors it — 0 of 115 bindings —
   so absent is the normal case and MUST default to `['INSTRUCTIONAL']`, the least permissive
   declaration available. An explicitly empty array is rejected: `[]` would be an assertion with no
   content, and `min(1)` forces the author to say something.
2. **Eligibility is any non-`INSTRUCTIONAL` mode (D4).** Not `INDEPENDENT` membership. The earlier
   `INDEPENDENT`-only rule silently let a `TRANSFER`- or `TIMED`-declaring binding through without a
   `reasoningOperation`, which is exactly the unlabeled-item hazard §6 exists to prevent.
3. **It is a permission set, not an outcome.** Declaring a mode does not make a response independent;
   it only makes the BKT path _reachable_ if runtime qualification also passes (§5).

Legacy normalization is fixed and every alias is fail-closed:

| Legacy `evidence_eligibility` value | Normalizes to       |
| ----------------------------------- | ------------------- |
| `INSTRUCTION_TELEMETRY_ONLY`        | `['INSTRUCTIONAL']` |
| `NON_EXIT_INSTRUCTIONAL_ONLY`       | `['INSTRUCTIONAL']` |
| `INSTRUCTIONAL_ONLY`                | `['INSTRUCTIONAL']` |
| `INSTRUCTIONAL_EXIT_ONLY`           | `['INSTRUCTIONAL']` |

`INSTRUCTIONAL_EXIT_ONLY` normalizes to `['INSTRUCTIONAL']`, **not** to `['INSTRUCTIONAL_EXIT']`.
Under D4 an `INSTRUCTIONAL_EXIT` declaration would require a governed `reasoningOperation`, and no
legacy artifact carries one. Mapping those exits to `INSTRUCTIONAL_EXIT` would therefore either fail
every legacy binding or invite a guessed operation label. Instructional-only is the honest,
fail-closed reading.

### 3.6 `learnerSafeItemRef`: opaque ref or inline projection (D6)

`learnerSafeItemRef` is a union. The two arms are handled differently and the difference matters.

- **Opaque ref (a string).** Never parsed, never reformatted, never pattern-matched. Ref formats
  differ per lesson — `V3-LES-789208` authors `learner_safe_prompt_ref`, `V3-LES-844372` authors
  `learner_safe_projection_ref` — and any code that tried to read structure out of them would break
  on the next lesson. Treat it as a bag of bytes you hand to the item service.
- **Inline projection (an object).** The shipped lesson `V3-LES-130923` uses this, via legacy
  `learner_safe_projection`. It is validated by a `.strict()` shape carrying only `prompt?`,
  `choices?` (each `{ id, text }` and nothing else), `representationId?`, and `responseFieldIds?`.
  Strictness is the protection: an inline projection that smuggled `correct_answer`, an answer key,
  scoring logic, or a rationale is **rejected**, not silently accepted and not silently stripped.

The adapter key-maps only the inline arm (`representation_id → representationId`,
`response_field_ids → responseFieldIds`) and deliberately preserves unknown keys so that the strict
shape rejects them. An inline projection MUST NOT be serialized into a synthetic ref string.

### 3.7 Reviewed metadata has explicit homes (D10)

Sixteen reviewed authoring fields are carried as **explicitly typed optional properties**:
`hintPolicy`, `feedbackRelease`, `omissionPolicy`, `retryPolicy`, `invalidItemPolicy`, `exitFunction`,
`freshnessPolicy`, `publicationEligibility`, `solutionPathLineageId`, `decisiveCueId`,
`distractorLineageId`, `responseFeatureRoutes`, `exactReentryFor`, `scopeOperationTags`,
`freshnessDivergence`, and `responseMode`. None is a BKT target and none influences qualification.

There is **no generic passthrough**, and adding one would be a security regression, not a
convenience. `.strict()` on the binding is what keeps protected scoring material out of an object
that server code treats as safe to snapshot into an observation; a `Record<string, unknown>` escape
hatch would let an authored `correct_answer` ride along unnoticed.

Two structured members are worth naming:

- `responseFeatureRoutes` — strict route records with `responseFeatureId` and `routeKind` required,
  plus optional `responseOptionIndex`, `responseFieldId`, `responsePatternId`, and `repairFeatureId`.
  `responsePatternId` lives inside the route record because conformance found it nested in
  constructed-response routing, not floating at the binding level.
- `freshnessDivergence` — a strict object of reviewed prose: `changedFromItemBindingId?`,
  `stimulusDifference?`, `solutionPathDifference?`, `distractorDifference?`.

An author key the adapter does not map is **reported, not dropped**:
`RECOGNIZED_AUTHORED_BINDING_KEYS` enumerates every understood key and
`unrecognizedAuthoredBindingKeys(raw)` returns the rest, which conformance fails on. A new authoring
key therefore has to be mapped deliberately instead of disappearing on the way to the contract.

### 3.8 `ChangeDimension` handling

`changedDimensions` is authored canonical `ChangeDimension[]` — `domain_context`, `representation`,
`passage_or_data`, `required_operation`, `section_application` — and MAY be `[]`.
`changedDimensionDetail` always retains the raw reviewed prose. Compound or unmapped prose permits
an empty or partial `changedDimensions` array and is **never** a validation error. The adapter MUST
NOT infer canonical dimensions from prose; new bindings author `changedDimensions` directly. The
shipped domain enum MUST NOT be widened with `unknown_variable`, `direction_of_inference`, or
`surface_to_structure_translation`; raw prose already preserves that detail.

### 3.9 Lesson item IDs are opaque (D8)

`itemBindingId`, `questionId`, and the evidence-facing `questionId` / `stimulusId` use
`LessonItemId` / `LessonItemIdSchema` — a branded `z.string().min(1)` with no format rule.

Branded `ContentId` was **deliberately left unchanged**. Its regex
(`^[a-z0-9]+(?:-[a-z0-9]+)*$`, lowercase alphanumeric with single hyphens) is correct for global
question-bank IDs, and widening it to fit lesson artifacts would have weakened validation for the
entire bank. Measured against the real artifacts, that regex rejects **33 of 33** question IDs on
`V3-LES-844372` (`ALG-GRAPH-ENTRY-01` — uppercase) and **16 of 40** on `V3-LES-789208`
(`prompt-qms-units-repairNear` — camelCase segments). Lesson-authored IDs therefore stay isolated in
their own opaque brand rather than global IDs being loosened to accommodate them.

---

## 4. `LessonRuntimeResponseFacts` — runtime facts

`LessonRuntimeResponseFacts` / `LessonRuntimeResponseFactsSchema` (`@mcat/contracts`) is what the
lesson runner emits per response. Every field is an observed fact. None is a judgement.

| Field                    | Type / constraint          | Semantics                                                                                                                                                                                               |
| ------------------------ | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `questionId`             | required `LessonItemId`    | The scored item.                                                                                                                                                                                        |
| `itemBindingId`          | required `LessonItemId`    | Links the response to its binding.                                                                                                                                                                      |
| `bindingVersion`         | **required** opaque string | MUST equal the binding's resolved version; otherwise `BINDING_VERSION_MISMATCH`. Required here even though it is optional on the binding (D5) — the server resolves it before the response is accepted. |
| `attemptIndex`           | positive integer           | `1` is the first attempt. Only `1` can qualify for BKT.                                                                                                                                                 |
| `isRetry`                | boolean                    | Any retry of this item in this session.                                                                                                                                                                 |
| `isDiagnosticRetry`      | boolean                    | Retry after a miss inside a diagnostic flow.                                                                                                                                                            |
| `response`               | discriminated union (§4.1) | `MULTIPLE_CHOICE` or `CONSTRUCTED`. The response payload is never flattened onto this object.                                                                                                           |
| `omitted`                | boolean                    | Omission is **explicit**, never inferred from a null choice or an empty field.                                                                                                                          |
| `elapsedMs`              | nonnegative integer        | Time on item.                                                                                                                                                                                           |
| `answerChanges`          | nonnegative integer        | Count of answer changes before commit.                                                                                                                                                                  |
| `assistanceLevel`        | `AssistanceLevel`          | The assistance actually taken at commit. The **only** assistance input to independence (§3.3).                                                                                                          |
| `contentBearingHintUsed` | boolean                    | A hint that carried content toward the answer.                                                                                                                                                          |
| `revealUsed`             | boolean                    | The key or rationale was revealed before commit.                                                                                                                                                        |
| `occurredAt`             | timestamp                  | Runtime occurrence time.                                                                                                                                                                                |

The runner MUST NOT emit `correct`, `independent`, an evidence kind, a `pL`, or any mastery
statement. The schema is `.strict()`; there is no field for any of them.

### 4.1 Responses are not MCQ-only (D7)

`response` is a discriminated union on `kind`:

| `kind`            | Payload                                           | Notes                                                                                                                                                                                                       |
| ----------------- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MULTIPLE_CHOICE` | `chosenChoiceId: string \| null`                  | `null` means no choice was selected; pair it with `omitted: true`.                                                                                                                                          |
| `CONSTRUCTED`     | `fields: Record<responseFieldId, string \| null>` | **Multi-field.** Keys are the author-defined `response_field_id` values, matching `learnerSafeItemRef.responseFieldIds` and `responseFeatureRoutes[].responseFieldId`. A `null` value is an unfilled field. |

A constructed response is not a single value and MUST NOT be collapsed into one. Nothing in this
seam scores it — `serverScoringAuthorityRef` does — so no consumer here needs to interpret the field
values; they travel as facts.

---

## 5. Two gates: declared eligibility, then runtime qualification

A response moves BKT only when **both** gates pass. They are separate and neither can substitute for
the other.

```text
LessonItemBinding + LessonRuntimeResponseFacts
        │
        ├─ measurementKind === 'NON_MEASURABLE'  → nothing at all (§3.1)
        │
        ├─ Gate 1 — DECLARED ELIGIBILITY (immutable, author-time)
        │     hasEligibleEvidenceMode(binding)      // ANY mode !== 'INSTRUCTIONAL'
        │     binding.firstAttemptImmutable === true
        │     binding.reasoningOperation present
        │
        ├─ (server acceptance) → AcceptedLessonObservation → EvidenceRecord   ← whenever scoring is valid
        │
        └─ Gate 2 — RUNTIME QUALIFICATION (per response)
              attemptIndex === 1, no retry, assistanceLevel === 'A0',
              no content-bearing hint, no reveal, scoringValid === true
                      │
                      └─ QualifiedBktObservation → BKT engine                 ← only if BOTH pass
```

### 5.1 Gate 1 — declared eligibility (immutable)

Evaluated against the binding alone. Use the exported predicate `hasEligibleEvidenceMode(binding)`;
do not re-implement the membership test.

**Eligibility is ANY declared mode other than `INSTRUCTIONAL` (D4)**, not `INDEPENDENT` membership.
A binding declaring `TRANSFER`, `TIMED`, `DELAYED`, `MIXED`, `PASSAGE`, or `PROTECTED` is eligible
and therefore MUST carry a `reasoningOperation`.

| Requirement                                                                    | Rejection code on failure                      |
| ------------------------------------------------------------------------------ | ---------------------------------------------- |
| A binding resolves for the response                                            | `BINDING_NOT_FOUND`                            |
| `response.bindingVersion` equals the resolved binding version                  | `BINDING_VERSION_MISMATCH`                     |
| `binding.firstAttemptImmutable === true`                                       | `FIRST_ATTEMPT_NOT_IMMUTABLE`                  |
| `hasEligibleEvidenceMode(binding)` — some declared mode is not `INSTRUCTIONAL` | `INDEPENDENT_EVIDENCE_MODE_NOT_DECLARED`       |
| `binding.reasoningOperation` present when the binding is eligible              | `ELIGIBLE_BINDING_MISSING_REASONING_OPERATION` |

The rejection code is still spelled `INDEPENDENT_EVIDENCE_MODE_NOT_DECLARED` even though the rule is
now broader than `INDEPENDENT`. The code list is frozen; the name is historical. Read it as "no
eligible evidence mode was declared".

`ELIGIBLE_BINDING_MISSING_REASONING_OPERATION` is enforced twice, deliberately: as a schema
`superRefine` on `LessonItemBindingSchema` (so an eligible-but-unlabeled binding cannot even be
constructed) and again at adaptation time.

Gate 1 is deliberately conservative: an absent declaration defaults to `['INSTRUCTIONAL']` and is a
rejection, never a default-allow.

### 5.2 Gate 2 — runtime qualification (per response)

| Requirement                                                             | Rejection code on failure   |
| ----------------------------------------------------------------------- | --------------------------- |
| `scoring.scoringValid === true`                                         | `SERVER_SCORING_INVALID`    |
| `response.attemptIndex === 1`                                           | `NOT_FIRST_ATTEMPT`         |
| `response.assistanceLevel === 'A0'`                                     | `ASSISTANCE_NOT_A0`         |
| `response.contentBearingHintUsed === false`                             | `CONTENT_BEARING_HINT_USED` |
| `response.revealUsed === false`                                         | `REVEAL_USED`               |
| `response.isRetry === false` and `response.isDiagnosticRetry === false` | `RETRY_USED`                |

Only `response.assistanceLevel` is consulted. `authoredAssistanceAffordances` is **never** read here
(§3.3): an item may advertise `A0` and still be answered at `A2`, and it is the `A2` that counts.

**Omission qualifies; it is not a rejection.** An omitted answer is a scored outcome, not a scoring
failure. If `scoringValid` is `true` and the outcome is `omitted`, the response still produces an
`EvidenceRecord` and — if everything above passes — still produces a `QualifiedBktObservation` with
`correct: false`. A learner who sat a clean independent first attempt and produced no answer has
given real capability evidence, and dropping it would put survivorship bias straight into `pL`.
There is no `OMITTED` rejection code and there MUST NOT be one.

`SERVER_SCORING_INVALID` has exactly one meaning: **no `serverItemVersion` mapping resolved from
`serverScoringAuthorityRef`.** It is the only condition that suppresses the `EvidenceRecord` as well
as the BKT observation. When scoring resolution fails, the accepted observation's `outcome` fails
closed to `omitted` rather than guessing correctness, and no evidence is written.

### 5.3 Result shape

`BktQualificationResult` / `BktQualificationResultSchema` is a discriminated union on `status`:

- `status: 'qualified'` → `observation: QualifiedBktObservation`
- `status: 'rejected'` → `rejectionCodes: readonly BktQualificationRejectionCode[]`

Qualification MUST collect **all** applicable codes from `BKT_QUALIFICATION_REJECTION_CODES` rather
than short-circuiting on the first, so the audit trail explains every reason a response did not move
`pL`. Use `isBktQualificationAccepted(result)` to test the union; do not compare `status` strings by
hand. Every rejection MUST be recorded; silent drops are prohibited.

`adaptLessonResponse` returns the qualification alongside a `status` of `adapted`,
`not_measurable`, or `binding_unresolved`. The latter two carry no observation and no evidence.

---

## 6. Conditional metadata: when an author must stop and label an item

**The rule, in one paragraph.** If a binding declares **any** `candidateEvidenceModes` member other
than `INSTRUCTIONAL`, the author MUST stop and label `reasoning_operation` with exactly one of the
seven members of `ReasoningOperation` — `IDENTIFY`, `PREDICT`, `EXPLAIN`, `RELATE`, `QUANTIFY`,
`DESIGN`, `EVIDENCE` — because that value is a direct BKT update target and there is no safe way for
any adapter, heuristic, or model to guess which of seven operations an item actually exercises; a
wrong guess silently corrupts a learner-facing skill estimate. If the binding declares nothing (the
`['INSTRUCTIONAL']` default) or declares only `INSTRUCTIONAL`, `reasoning_operation` is optional and
an unlabeled item is fine, because such an item can never reach BKT. `dok_level` is different: it is
**optional even on an eligible binding**, because `coldStartB()` in `packages/policies/src/irt.ts`
returns a neutral `0` for an undefined DOK, so an unlabeled item merely loses difficulty
discrimination until it is calibrated from real attempts. So: labeling `reasoning_operation` on an
eligible binding is a hard stop; labeling `dok_level` is a quality improvement you should make when
you can and may defer when you cannot.

If an author cannot confidently choose one `ReasoningOperation`, the correct action is to **declare
no eligible mode** on that binding and let it default to instructional. Guessing the operation to
unlock eligibility is a defect.

`DokLevel` in V3 is the closed set `1` / `2` / `3` / `4`. The legacy v7 `dok_level` in
`packages/content/src/schema.ts` remains unbounded; `coldStartB(undefined) === 0` and inputs `>= 5`
map to `1.4`.

### 6.1 The seven-operation axis is not the eight authoring tags

`ReasoningOperation` (7 members, `packages/contracts/src/vocab.ts`) is the mastery axis.
`OperationTag` (8 members `K` / `Q` / `E` / `D` / `P` / `A` / `I` / `T`, same file) is the generic
authoring-analysis vocabulary carried by `EvidenceRecord.operation`. They are different vocabularies
with a confusingly similar name.

`EvidenceRecord.operation` is now **optional**, and lesson-sourced evidence **omits it** (D9). It is
the authoring-analysis axis, not the mastery axis, so there is nothing correct to put there: a
`ReasoningOperation` MUST NOT be written into it, and the adapter therefore leaves it absent rather
than inventing a tag. `scopeOperationTags` on the binding is likewise open authoring-analysis prose
and is never coerced into either vocabulary.

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

Three constraints the schema enforces:

- `binding` accepts a **measurable** binding only. Exposition cannot create an accepted response
  observation (§3.1).
- `bindingVersion` is **required** here even though it is optional on the binding. The adapter
  resolves `binding.bindingVersion ?? envelopeBindingVersion` before constructing the observation; an
  empty result is `BINDING_NOT_FOUND`, not a blank version.
- `serverItemVersion` is required when `scoringValid` is `true` and forbidden when it is `false`.
  There is no third state.

`SERVER_ITEM_VERSION_RESOLUTION` is normative: the caller resolves the positive integer
`serverItemVersion` and the scored outcome from `serverScoringAuthorityRef` for the pair
(`questionId`, `bindingVersion`) and passes them in as a `ServerScoringResolution`. Never parse,
coerce, or hash `bindingVersion` into it. If no mapping exists, the server MUST set
`scoringValid: false`, emit `SERVER_SCORING_INVALID`, and produce **no** `EvidenceRecord` and **no**
BKT output.

`scoringValid` is a server-only scoring-validity fact. It MUST NOT be renamed to, aliased with, or
stored as `EvidenceRecord.valid`, which means something else (the content was not retired or
corrected).

### 7.2 Evidence-mode routing

Evidence is produced for every lesson response with valid scoring, independent of BKT eligibility.
Routing is a pure function of `candidateEvidenceModes` plus server-derived runtime conditions;
`deriveEvidenceKind` in the adapter is the implementation.

Classification runs in three steps, in this order:

1. `response.isDiagnosticRetry` → `diagnostic_retry`, regardless of declared mode.
2. Not an independent administration → `instruction`, regardless of declared mode. **Assisted
   administration outranks any declaration an author made.**
3. Otherwise, **least-credit-first**: walk the conservative mode order and take the first declared
   mode. A binding declaring several modes is classified by the one that earns the _least_ mastery
   credit, so a broad permission set can never upgrade a record's evidence quality.

| Declared `CandidateEvidenceMode` | `EvidenceRecord.kind` on a clean administration | Fills a mastery recipe slot? | Gate 1 eligible? |
| -------------------------------- | ----------------------------------------------- | ---------------------------- | ---------------- |
| `INSTRUCTIONAL`                  | `instruction`                                   | no (contextual only)         | **no**           |
| `INSTRUCTIONAL_EXIT`             | `instruction`                                   | no (contextual only)         | yes              |
| `REHEARSAL_ONLY`                 | `instruction`                                   | no (contextual only)         | yes              |
| `REPAIR_CONFIRMATION`            | `instruction`                                   | no (contextual only)         | yes              |
| `DIAGNOSTIC`                     | `placement`                                     | no (contextual only)         | yes              |
| `ENTRY`                          | `placement`                                     | no (contextual only)         | yes              |
| `INDEPENDENT`                    | `independent`                                   | yes                          | yes              |
| `TRANSFER`                       | `transfer`                                      | yes                          | yes              |
| `DELAYED`                        | `delayed`                                       | yes                          | yes              |
| `MIXED`                          | `mixed`                                         | yes                          | yes              |
| `PASSAGE`                        | `integrated_passage`                            | yes                          | yes              |
| `TIMED`                          | `timed`                                         | yes                          | yes              |
| `PROTECTED`                      | `protected`                                     | yes                          | yes              |

The rows are listed in the conservative order the adapter walks. "Fills a mastery recipe slot"
reflects `CONTEXTUAL_ONLY_KINDS` in `packages/domain/src/evidence.ts`.

**`independent` is a fact about the administration, not about the declared mode.** It is
`isIndependentAdministration(response)` and nothing else, so a binding declaring only `INSTRUCTIONAL`
that a learner answered cleanly at `A0` produces `kind: 'instruction'` with `independent: true`. That
combination is correct and harmless: the record documents a clean administration, while its
contextual-only `kind` keeps it out of every mastery recipe and its instructional-only declaration
keeps it out of BKT.

Note also that evidence independence and BKT qualification are **not** the same test.
`isIndependentAdministration` does not consider `attemptIndex`, while Gate 2 does. A clean but
non-first attempt can therefore be `independent: true` evidence and still be rejected for BKT with
`NOT_FIRST_ATTEMPT`. That is intended: the evidence system records administration quality, the BKT
gate additionally requires an uncontaminated first look.

### 7.3 Field mapping into `EvidenceRecord`

| `EvidenceRecord` field                                 | Source                                                                                                |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| `skillId`                                              | `binding.primaryKcId`                                                                                 |
| `cluster`                                              | **Caller-resolved (D9)** — the caller passes it in, resolved via `LESSON_TO_CLUSTER`.                 |
| `operation`                                            | **Omitted** for lesson-sourced evidence (§6.1).                                                       |
| `kind`                                                 | `deriveEvidenceKind(binding.candidateEvidenceModes, response)`                                        |
| `independent`                                          | `isIndependentAdministration(response)`                                                               |
| `assistanceLevel`                                      | `response.assistanceLevel`                                                                            |
| `contentBearingHint`                                   | `response.contentBearingHintUsed`                                                                     |
| `questionId`                                           | `binding.questionId` (a `LessonItemId`)                                                               |
| `itemVersion`                                          | the resolved `serverItemVersion`                                                                      |
| `familyId`                                             | `binding.semanticFamilyId`                                                                            |
| `stimulusId`                                           | `binding.stimulusLineageId`, omitted when absent                                                      |
| `changeDimensions`                                     | `binding.changedDimensions`                                                                           |
| `delayHours`                                           | caller-supplied, omitted when absent                                                                  |
| `conditions`                                           | `mixed` / `passage` / `timed` / `protected` from the declared modes; `accommodations` caller-supplied |
| `outcome`                                              | the accepted `outcome`                                                                                |
| `occurredAt`, `sequence`, `contentRelease`, `policies` | runtime and provenance inputs                                                                         |

`cluster` is caller-resolved because `@mcat/domain` MUST NOT import `@mcat/content`; the seam stays
free of a content dependency and of any lesson-specific table. The author never writes `conditions`.
`EvidenceRecord` MUST NOT gain a capability-estimate field.

---

## 8. BKT routing and the two grains

### 8.1 `QualifiedBktObservation`

`QualifiedBktObservation` / `QualifiedBktObservationSchema` (server-only) is the only input the BKT
engine accepts from a lesson: `observationId`, `questionId`, `itemBindingId`, `bindingVersion`,
`serverItemVersion` (the resolved positive integer), `primaryKcId`, `reasoningOperation`, `correct`,
optional `dokLevel`, `occurredAt`, `sequence`, `contentRelease`, `policies`.

`correct` is server-derived from the accepted `outcome`: `correct` maps to `true`, and both
`incorrect` and `omitted` map to `false`. An omission is a qualifying, scored outcome — see §5.2.

`QualifiedBktObservation` has **no** `lessonId`, `pL`, `mastered`, `masteryThreshold`,
`evidenceStatus`, `kind`, or `independent` field, and MUST NOT gain one.

### 8.2 Exactly two direct grains

A qualified response updates exactly two BKT states:

1. the **primary KC**, keyed by `primaryKcId`; and
2. the **primary reasoning operation**, keyed by `reasoningOperation`.

`secondaryKcMappings` and `secondaryKcRefs` MUST NOT be BKT targets. `lessonId` MUST NOT be a BKT
target. **Lessons do not have their own BKT state under this seam.**

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
- an evidence status, evidence rank, evidence kind, or "this counts as mastery" assertion;
- an answer key, correct choice, scoring logic, or pre-release rationale, inline or in a projection.

None of these have a field in `LessonItemBinding`, and both variants plus the inline learner-safe
projection are `.strict()`. Enforcement is structural, not advisory, and there is no generic
passthrough that could carry them (§3.7).

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

Three lesson artifacts exist on disk, contributing 115 bindings in total:

| Lesson          | Bindings | Learner-safe arm                     | Authors `candidate_evidence_modes`? | Authors a binding version? |
| --------------- | -------: | ------------------------------------ | ----------------------------------- | -------------------------- |
| `V3-LES-130923` |       42 | inline `learner_safe_projection`     | no                                  | no — envelope version used |
| `V3-LES-789208` |       40 | opaque `learner_safe_prompt_ref`     | no                                  | no — envelope version used |
| `V3-LES-844372` |       33 | opaque `learner_safe_projection_ref` | no                                  | no — envelope version used |

None of the three authors `candidate_evidence_modes`, so every binding takes the `['INSTRUCTIONAL']`
default, and the two lessons carrying legacy `evidence_eligibility` labels normalize to
`['INSTRUCTIONAL']` as well (§3.5).

Therefore **no lesson on disk moves `pL` at all**. Every scored response is routed to a
contextual-only `EvidenceRecord` and every BKT qualification is rejected with
`INDEPENDENT_EVIDENCE_MODE_NOT_DECLARED`. The conformance test asserts exactly this: for each lesson,
every binding parses, every measurable binding yields an evidence record, and the qualified-BKT count
is `0`.

This is the intended, correct end state, not an incomplete integration. These items were authored as
instructional checks; nobody has reviewed and approved them as measurement, and none carries a
`reasoningOperation`. Manufacturing eligibility after the fact — by defaulting to a non-instructional
mode, inferring an operation from `learnerOperation`, or treating `NEAR_EXIT` as implying
independence — would fabricate capability evidence. These lessons produce genuine instructional
evidence today, and a binding becomes BKT-eligible only when an author and reviewer deliberately
declare a non-`INSTRUCTIONAL` mode and label `reasoningOperation`.

---

## 12. Versioning, idempotency, replay, and protected scoring

**Versioning.** `bindingVersion` is an opaque non-empty string and the sole version-match value
between a response and its binding. It is optional on the binding and required on the response and
the accepted observation; the adapter resolves `binding.bindingVersion ?? envelopeBindingVersion`
(D5). A mismatch is `BINDING_VERSION_MISMATCH` and produces no BKT update. `serverItemVersion` is a
separate, server-resolved positive integer used for `EvidenceRecord.itemVersion`; the two MUST NOT be
conflated or derived from each other. Changing any authored binding byte requires a new version;
bindings are never edited in place.

**Idempotency.** `AcceptedLessonObservation.idempotencyKey` is authoritative. Re-delivering the same
response MUST resolve to the same `observationId` and MUST NOT produce a second `EvidenceRecord` or a
second BKT update. Downstream systems key off `observationId`, never off a retry of the transport.

**Replay.** Replaying the same accepted observations, in `sequence` order, under the same
`contentRelease` and `policies`, MUST reproduce identical `EvidenceRecord`s, identical qualification
results, and identical `pL`. Normalization, qualification, and evidence routing are pure functions of
their inputs: no I/O, no clock reads, no randomness. Timestamps, identifiers, the resolved cluster,
and the server scoring resolution all arrive as inputs.

**Protected scoring.** Scoring happens only behind `serverScoringAuthorityRef`. `scoringValid` is
that authority's verdict. There is no client-side, author-side, or fallback scoring path: no
resolvable scoring authority means `scoringValid: false`, `SERVER_SCORING_INVALID`, an `outcome` that
fails closed to `omitted`, and no evidence or BKT output at all.

---

## 13. Normative acceptance criterion

> **A second conforming V3 lesson MUST require zero changes to mastery policy.**

Concretely, integrating another lesson MUST require **no** edits to: `@mcat/policies` BKT, IRT,
forgetting, or prerequisite modules; `packages/domain/src/lesson-response-adapter.ts`; the
qualification rules in §5; the evidence-mode routing in §7.2; the rollup rules in §9; or any schema
listed in Gate A's exported-symbols table. The only new artifacts permitted are the lesson's own
content and its binding values.

If integrating a new lesson requires a policy change, one of these is true and MUST be fixed rather
than worked around:

- the lesson is using a vocabulary member that does not exist and should be added by governed
  revision of the closed enum, not by a lesson-specific branch;
- the lesson uses an author key the adapter does not recognize, which
  `unrecognizedAuthoredBindingKeys` will report — map it deliberately in
  `RECOGNIZED_AUTHORED_BINDING_KEYS`, never add a generic passthrough;
- the adapter is being asked to infer something it MUST NOT infer (§3.4, §3.6, §3.8, §6.2); or
- someone is trying to give a lesson its own mastery semantics, which §8.2 and §9 forbid.

**Conformance checklist for a new lesson integration.** All of the following MUST hold:

1. Every binding parses through `parseAuthoredLessonBinding` against `LessonItemBindingSchema`.
2. `unrecognizedAuthoredBindingKeys` returns empty for every binding.
3. Every `MEASURABLE` binding has `firstAttemptImmutable: true`, a `questionId`, an `activityId`, and
   a `serverScoringAuthorityRef`; every `NON_MEASURABLE` binding has none of them.
4. Every binding declaring a non-`INSTRUCTIONAL` mode carries a `reasoningOperation`.
5. No binding contains `independent`, `pL`, a mastery threshold or status, decay, an evidence status,
   or any answer-bearing material.
6. `activity_role` uses only the nine `LessonActivityRole` members; `NEAR_USE` / `CHANGED_TASK`
   appear only under the exit-function field (§3.4).
7. The runner emits `LessonRuntimeResponseFacts` only, with the correct `response` union arm and no
   derived judgement.
8. Every scored response resolves a `serverItemVersion` through `serverScoringAuthorityRef`, or is
   rejected with `SERVER_SCORING_INVALID`.
9. The caller resolves a `cluster` for the lesson via `LESSON_TO_CLUSTER`.
10. The lesson-to-required-KC mapping is present and non-empty, or the lesson-grain value fails
    closed.
11. No new lesson-specific code exists in `@mcat/policies`, `@mcat/domain`, or the evidence router.
12. Replaying the lesson's accepted observations reproduces identical evidence and identical `pL`.

---

## 14. Related documents

- `.superpowers/sdd/field-lock.md` — Gate A naming registry, including the Task 2b D1–D10
  amendment. Authoritative over this file.
- `packages/contracts/src/lesson-observation.ts`, `packages/domain/src/lesson-response-adapter.ts` —
  the implementation this document describes.
- `tests/architecture/v3-lesson-binding-conformance.test.ts` — runs every real artifact through the
  production entry points.
- `docs/design/04-V3-LESSON-AUTHORING-QUALITY-AND-UI.md` — Spec 04: lesson structure, KC order,
  nodes/screens, activity roles, item bindings, assistance design, repair/reentry, presentation,
  checkpoints, and authoring/review gates. Spec 04 owns _how the metadata gets authored and
  reviewed_; this contract owns _what the metadata means downstream_.
- `docs/mastery-pipeline.md` — the BKT/IRT engine, its formulas and constants.
- `docs/governance/authority-boundaries.md` — the actor permission table this seam sits inside.
- `docs/content/question-format-guide.md` — the eight generic authoring-analysis tags versus the
  seven-operation mastery axis.

---

## 15. Open tension to resolve (not a licence to guess)

D4 makes **every** non-`INSTRUCTIONAL` mode eligible, and `hasEligibleEvidenceMode` implements that
literally. Five of those modes — `DIAGNOSTIC`, `ENTRY`, `INSTRUCTIONAL_EXIT`, `REPAIR_CONFIRMATION`,
`REHEARSAL_ONLY` — route to evidence kinds that `CONTEXTUAL_ONLY_KINDS` says can never fill a mastery
recipe slot (§7.2). A future binding that declared one of them **and** supplied a `reasoningOperation`
would therefore produce contextual-only evidence while still moving `pL`, which contradicts Gate A's
"`INSTRUCTIONAL_EXIT` → evidence only; BKT qualification rejects" row and the standing rule that the
diagnostic seeds priors but never mints mastery.

Nothing on disk hits this today: all 115 bindings normalize to `['INSTRUCTIONAL']` and no artifact
carries a `reasoningOperation`. Until it is resolved by governed decision, authors MUST NOT declare
`DIAGNOSTIC`, `ENTRY`, `INSTRUCTIONAL_EXIT`, `REPAIR_CONFIRMATION`, or `REHEARSAL_ONLY` together with
a `reasoningOperation`, and no code may add a workaround branch for these modes.
