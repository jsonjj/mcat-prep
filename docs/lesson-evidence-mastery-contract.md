# Lesson → Evidence → Mastery Contract

**Status:** Normative seam contract, version 1.2.
**Date:** July 28, 2026.
**Vocabulary authority:** `.superpowers/sdd/field-lock.md` (Gate A), including its Task 2b
three-lesson conformance amendment (decisions D1–D10). Every identifier in this document is taken
verbatim from that registry. Where this document and Gate A disagree, Gate A wins and this document
is defective.
**Implementation:**

- `packages/contracts/src/lesson-observation.ts` — the schemas and the BKT eligibility allowlist.
- `packages/domain/src/lesson-response-adapter.ts` — the single normalization + adaptation seam.
- `packages/domain/src/evidence.ts` — `EvidenceRecord` and the branded server-bounded `occurredAt`.
- `packages/authority-core/src/authority.ts` — `applyQualifiedBktObservation`, the bounded decay
  clock, and the `bkt_observation_applied` audit ledger.
- `packages/policies/src/lesson-rollup.ts` — the derived lesson-grain rollup.

This document describes what those modules do; where it describes something they do not do, that is a
defect in either the document or the module, and §15.6 says how to report it. Do not assume the code
is the correct one of the two.
**Audience:** Anyone integrating a V3 lesson with the evidence system or the BKT mastery engine —
lesson authors, runtime engineers, evidence/policy engineers, and any future coding agent handed
this file as its only brief.

This is the single file a future implementer needs in order to wire a **new** conforming V3 lesson
into evidence and mastery. It is written to be enforceable: requirements use **MUST** / **MUST NOT**
and name exact identifiers. If a rule here cannot be checked mechanically, it is a defect in this
document.

**Read §16 before trusting any rule here as a guarantee.** Some rules below are held by an
architecture test; others are held only by review. §16 says which is which, by name. Do not assume a
rule is enforced because it is written down — this project has already shipped a guard that was
documented in a source comment and a README, believed by everyone, and did not exist.

**Two authoring-facing consequences you will hit immediately** — read §3.3 and §5.2 before writing a
binding. First, the runtime now observes the assistance it actually delivered (emitting `A0`–`A2`), but `AssistanceLevel` has no `UNOBSERVED` member, so unmeasurable cases still emit `A3` by convention. Second, no binding on disk declares a BKT-eligible mode. This second reason is now the **only** reason `pL` does not move, and it is the intended state rather than a bug — §11 explains why, and
§16.3 is how to verify it by hand.

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

| Layer                        | Produced by                             | When                    | Mutability                         | Examples                                                                                                               |
| ---------------------------- | --------------------------------------- | ----------------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| **Author-time metadata**     | Lesson author, under reviewer approval  | Authoring / compile     | Immutable once the artifact is cut | `primaryKcId`, `reasoningOperation`, `candidateEvidenceModes`, `authoredAssistanceAffordances`                         |
| **Runtime facts**            | Lesson runner (client + session server) | During the attempt      | Append-only, never edited          | `attemptIndex`, `assistanceLevel`, `revealUsed`, `response`, `elapsedMs`, `timedAdministration`                        |
| **Server-derived decisions** | Server policy only                      | On accepting a response | Derived, reproducible, audited     | `outcome`, `scoringValid`, `independent`, `EvidenceRecord.kind`, `pL`, `serverItemVersion`, every clock a policy reads |

The rule that follows from this table, stated once and enforced everywhere below:

> **The lesson runner emits FACTS. Server policy decides MEANING.** The runner never decides
> correctness, never decides `independent`, never decides which evidence slots are satisfied, and
> never decides whether BKT moves.

A **time** is a fact when the runner reports it and a decision when a policy reads it, so the two
uses are separate values. `LessonRuntimeResponseFacts.occurredAt` is the runner's claim; every clock
a policy actually reads is bounded by the server first. §7.4 is normative on this and explains why:
a client-supplied timestamp silently owned both the BKT decay clock and the evidence freshness clock
until July 2026.

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

### 2.2 The warrant must be enumerated over every grain a lesson writes

Disjointness is necessary but not sufficient: an authority can be perfectly separated and still be
**wired to nothing**. That is what happened here, and it is the failure mode to watch for whenever a new
grain type appears.

The evidence warrant enumerated only the synthetic skill-graph ids, while lesson evidence is keyed on
`V3-KC-*` skill ids. So **no lesson KC had any warrant at all**: recipe slots, gaps, freshness, and
reason codes were computed for a set of ids the seam never writes. Every test passed, because an absent
warrant is indistinguishable from "no evidence yet" — the failure had no symptom.

The grains a warrant is produced for are now the **union** of three sources: the skill graph, every
`skillId` that has an evidence record, and the required KCs of every practiced lesson. The third source
is what makes an **unstarted** KC still report its gaps, which is the whole point of a warrant — a
planner needs to know what is missing before any evidence exists, not after.

A grain whose cluster resolves nowhere **throws** `UnresolvedWarrantGrainError`, naming the ids, rather
than being filtered or defaulted. Silent omission is precisely what hid this, so the loud failure is the
fix: a thrown error cannot be mistaken for an empty result. That the enumeration still throws is itself
asserted (§16.1), because "filter the bad grain out" is the tempting repair that would restore the
silence.

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
reviewed prose and MUST NOT be a load-bearing discriminator — see §3.10, which is where that rule
turned out to be violated.

A worked example is exposition, not a failed attempt. `adaptLessonResponse` returns
`status: 'not_measurable'` with `observation: null` and `evidence: null`. The frozen
`BKT_QUALIFICATION_REJECTION_CODES` list has no exposition member, so the accompanying rejection code
is `FIRST_ATTEMPT_NOT_IMMUTABLE` — the honest fit, since exposition has no first attempt to preserve
— and the `not_measurable` status carries the real reason. Do not read that code as "the author got
the attempt policy wrong".

### 3.2 Fields common to both variants

| Author key (`snake_case`)                                                 | Internal key (`camelCase`)      | Required            | Semantics and constraints                                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------------- | ------------------------------- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| —                                                                         | `measurementKind`               | yes (adapter)       | `MEASURABLE` or `NON_MEASURABLE`. Adapter-supplied from `activity_role`; never authored, never schema-inferred.                                                                                                                                                              |
| `lesson_id`                                                               | `lessonId`                      | yes (envelope)      | Owning lesson, taken from the artifact envelope. Routing/audit only. **Never** a BKT target.                                                                                                                                                                                 |
| `item_binding_id`                                                         | `itemBindingId`                 | yes                 | `LessonItemId`. Stable identity of this binding.                                                                                                                                                                                                                             |
| `binding_version`                                                         | `bindingVersion`                | **optional** (D5)   | Opaque non-empty string. Audit / version-match value only, never parsed, coerced, or hashed into a numeric item version. The adapter fills it from `binding_version`, then `item_version`, then the envelope `artifact_version`.                                             |
| `primary_kc_id`                                                           | `primaryKcId`                   | yes                 | **The only KC-grain BKT target.** Maps to `EvidenceRecord.skillId`.                                                                                                                                                                                                          |
| `secondary_kc_mappings`                                                   | `secondaryKcMappings`           | defaults to `[]`    | Readonly array. Coverage/reporting only. **Never** a BKT target. Falls back to `secondary_kc_refs`.                                                                                                                                                                          |
| `secondary_kc_refs`                                                       | `secondaryKcRefs`               | optional            | Additional coverage metadata. **Never** a BKT target.                                                                                                                                                                                                                        |
| `activity_role`                                                           | `activityRole`                  | yes                 | `LessonActivityRole` (§3.4). Also the input to `measurementKind`.                                                                                                                                                                                                            |
| `semantic_family_id`                                                      | `semanticFamilyId`              | yes                 | Item family. Maps to `EvidenceRecord.familyId`. A family fills a given recipe slot at most once.                                                                                                                                                                             |
| `stimulus_lineage_id`                                                     | `stimulusLineageId`             | optional            | Maps to `EvidenceRecord.stimulusId`. Normalize legacy `stimulus_lineage` string or `stimulus_lineage.lineage_id`.                                                                                                                                                            |
| `assistance_available` / `assistance_state` / `authored_assistance_level` | `authoredAssistanceAffordances` | yes, non-empty (D2) | Open readonly strings naming help the item **offers** (`A2`, `VISIBLE_EXPLANATION`, `NOT_SURE_ALLOWED`, …). See §3.3. It is **not** an `AssistanceLevel`, it never touches independence, and an `A0`–`A3` value is rewritten on the way in so it cannot be read back as one. |
| `candidate_evidence_modes`                                                | `candidateEvidenceModes`        | **optional** (D3)   | Non-empty readonly `CandidateEvidenceMode[]`. **Absent defaults to `['INSTRUCTIONAL']`**; an explicitly empty array is rejected. A permission set, not an outcome (§3.5).                                                                                                    |
| `reasoning_operation`                                                     | `reasoningOperation`            | conditional (D4)    | `ReasoningOperation`. **Required if and only if any declared mode is not `INSTRUCTIONAL`** (§6). Never inferred from free text.                                                                                                                                              |
| `dok_level`                                                               | `dokLevel`                      | optional            | `DokLevel` — `1`, `2`, `3`, or `4`. Optional even on an eligible binding. No default (§6).                                                                                                                                                                                   |
| `representation_id`                                                       | `representationId`              | optional/nullable   | Open non-empty string or `null`. Item-level representation.                                                                                                                                                                                                                  |
| `representation_family_id`                                                | `representationFamilyId`        | optional/nullable   | External REPFAM reference. Currently unpopulated and MUST NOT be adapter-derived.                                                                                                                                                                                            |
| `changed_dimensions`                                                      | `changedDimensions`             | yes (may be `[]`)   | Authored canonical `ChangeDimension[]`. Maps to `EvidenceRecord.changeDimensions`.                                                                                                                                                                                           |
| `changed_dimension_detail`                                                | `changedDimensionDetail`        | optional            | Raw reviewed prose; an empty string is valid. **Never** a BKT target and never parsed into `changedDimensions`.                                                                                                                                                              |
| `learner_operation`                                                       | `learnerOperation`              | optional            | Instructional free text. **Never** a capability label and never `reasoningOperation` (§6.2).                                                                                                                                                                                 |
| `semantic_structure`                                                      | `semanticStructure`             | optional            | Free-text authoring structure. `semanticStructure.operation` is free text and is **never** `reasoningOperation`.                                                                                                                                                             |
| `learner_safe_item_ref`                                                   | `learnerSafeItemRef`            | yes                 | Either an **opaque ref string** or a **strict inline projection** (§3.6). Never both, never parsed.                                                                                                                                                                          |
| reviewed metadata (D10)                                                   | see §3.7                        | optional            | Sixteen explicitly typed optional fields. No generic passthrough.                                                                                                                                                                                                            |

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

This is not a theoretical separation. The authored `assistance_state` used to reach the seam **as** the
runtime's `assistanceLevel`, so a string in a lesson script decided independence and moved `pL` from
`0.20` to `0.5717`. The author was writing a mastery claim in one hop. The rule now:

- **Authored `assistance_state` describes what help the design makes AVAILABLE.** It normalizes into
  `authoredAssistanceAffordances`, an open list, and nothing downstream reads it for independence.
- **Independence depends only on what the learner actually TOOK**, observed at commit time. In the
  vector-lesson runtime those observations are `observedSupportRequested` (the learner issued
  `REQUEST_SUPPORT` and the runtime released the cue) and `observedAnswerRevealed` (the open-feedback
  state at commit). A record persisted before those observations existed has no observation and fails
  closed to `true` for both.

An authored `A0`–`A3` value is also **rewritten on the way in**: `assistance_state: "A0"` normalizes to
`authoredAssistanceAffordances: ['AUTHORED_ASSISTANCE_LEVEL_A0']`, not to the bare string `'A0'`. The
authored value is preserved for audit, the array stays non-empty, and the result can no longer be
parsed back into an `AssistanceLevel`. An affordance spelled exactly like the runtime fact is an
invitation to conflate the two again, which is how an assisted attempt became fake independent evidence
the first time. Read an affordance as "this item offers a level-2 scaffold", never as "this response was
unassisted".

#### The consequence you will hit immediately: no binding declares a BKT-eligible mode

The runtime **now observes a graded assistance level**. It measures its own delivery: which support mechanism it actually put on screen. A single `presentedSupportFor` decision drives the rendered screen, the support authorization, and the commit-time observation, so the runtime cannot present help it didn't record or record help it didn't present. Levels: nothing displayed is `A0`, a released cue is `A1`, and a standing scaffold is `A2`.

Because the runtime now measures its own delivery, the fail-closed `A3` behavior is gone for observed responses. `A3` now means only "unobserved": no mechanism in this runtime displays a worked solution path beside a scored item, so no measured administration emits it. However, `AssistanceLevel` has no `UNOBSERVED` member, so on the evidence record a measured `A0` and an unmeasurable case are still not fully distinguishable — `A3` from this runtime means "unobserved" by convention, enforced by test rather than by type. A contracts change to carry that distinction properly has been requested and not yet made.

Concretely, today:

- lesson responses can now establish an independent administration on assistance grounds;
- however, **`pL` still does not move** because all 115 authored bindings normalize to instructional-only and none carries a reasoning operation, so every measurable binding is still ineligible.

The authored `assistance_state` field was **deleted** from the response record rather than left unread. The runtime neither trusts the authored value nor refuses it blanket; it observes its own delivery.

**What the runtime measures to unlock this.** `assistanceLevelTaken` is the single function
where the measurement lands. To return anything but `A3` it needs, per response:

1. whether any scaffold, worked step, or hint was **displayed** — not merely available, and including
   scaffolds shown without being requested;
2. which graded level the displayed help corresponds to, so `A0`–`A3` is a measurement rather than a
   mapping of the authored value; and
3. that both are captured **at or before commit**, since help taken after commit does not contaminate
   the attempt.

These three requirements are now **satisfied** by the `presentedSupportFor` decision.

**The BKT path itself is proven working, so this is safe rather than inert.** An end-to-end
test (`services/lambdas/learner-api/src/second-lesson-mastery-seam.test.ts`) drives `V3-LES-844372`
through the real recording workflow and asserts, for **each** of the seven allowlisted modes in turn,
that a clean first attempt raises `pL` above the `0.20` prior on both grains — the primary KC and the
reasoning operation.

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
2. **Eligibility is an explicit seven-member allowlist, never a negation (D4).** The allowlist is
   `BKT_ELIGIBLE_EVIDENCE_MODES` in `packages/contracts/src/lesson-observation.ts`:
   `INDEPENDENT`, `TRANSFER`, `DELAYED`, `MIXED`, `PASSAGE`, `TIMED`, `PROTECTED`. The other six
   members are ineligible, and so is any mode this list does not name. See the warning below: do not
   restate this rule as "any mode other than `INSTRUCTIONAL`".
3. **It is a permission set, not an outcome.** Declaring a mode does not make a response independent;
   it only makes the BKT path _reachable_ if runtime qualification also passes (§5).

> **Never rewrite eligibility as a negation.** This document previously said "any
> non-`INSTRUCTIONAL` mode", and that wording caused a real defect rather than merely describing one.
> With thirteen members in the enum, negating one of them made twelve eligible — including
> `INSTRUCTIONAL_EXIT`, `DIAGNOSTIC`, `ENTRY`, `REPAIR_CONFIRMATION`, and `REHEARSAL_ONLY`, all five
> of which route to a kind in `CONTEXTUAL_ONLY_KINDS` and can therefore never fill a mastery recipe
> slot (§7.2). A binding declaring one of them alongside a `reasoningOperation` would have moved
> `pL` on evidence the evidence system refuses to count, contradicting the standing decision that a
> lesson exit stays instructional-only and that the diagnostic seeds priors but never mints mastery.
>
> Two properties follow from the allowlist that a denylist cannot give, and both are the point:
>
> - **A future enum member is ineligible by default.** A fourteenth mode added tomorrow gets no BKT
>   access until someone deliberately adds it to the allowlist. Under a denylist it would acquire
>   access silently, at the moment of its own definition, with no diff touching this seam.
> - **An unrecognized mode is ineligible.** There is no negation anywhere in the implementation, so
>   membership is the only question ever asked.
>
> **The allowlist is necessary but was not sufficient.** Narrowing the declared set fixed every
> single-mode case and nothing else: qualification still tested the declared set while the evidence kind
> was resolved separately, so the two could disagree on multi-mode declarations and on gated modes. The
> durable fix was to stop testing the declared set at all and gate on the resolved kind (§5.1). §15.1 is
> the full account, and it is worth reading before you touch either list.

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

### 3.10 Authored contradictions are rejected, never resolved by precedence

`AUTHORED_BINDING_REJECTION_CODES` (`packages/domain/src/lesson-response-adapter.ts`) is a **separate**
frozen list from `BKT_QUALIFICATION_REJECTION_CODES`. The latter judges one runtime response; these
judge **the authored artifact itself**, before any response exists.

Each member names a pair of authored facts that cannot both hold. Each exists because the alternative —
letting key precedence pick a winner — **deletes the loser in silence**, leaving a normalized record
that is no longer a faithful projection of the artifact.

| Code                                                | The contradiction                                                                                                                                                                                                                            |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MULTIPLE_LEARNER_SAFE_ITEM_SOURCES_AUTHORED`       | More than one of `learner_safe_item_ref`, `learner_safe_projection_ref`, `learner_safe_projection`, `learner_safe_prompt_ref` is authored. D6 says the learner-safe item is an opaque ref **or** an inline projection, authored once (§3.6). |
| `CONTRADICTORY_FIRST_ATTEMPT_IMMUTABILITY_AUTHORED` | `first_attempt_immutable: false` alongside `first_attempt_policy: 'IMMUTABLE'`.                                                                                                                                                              |

Two properties of the machinery matter:

- **A contradiction rejects even when the collapsed record validates cleanly.** That is the point:
  a successful parse means the losing fact disappeared, not that the artifact was sound. Deciding on
  schema success alone is how this class of defect stays silent.
- **`rejectionCodes` is non-optional on both branches** of `AuthoredLessonBindingParse`, alongside
  `unrecognizedKeys`, so a caller cannot fail to see it. Callers branch on the frozen code rather than
  matching issue text.

**The first-attempt case is a `.strict()` bypass worth understanding.** §3.1 says the prose MUST NOT be
load-bearing, and it was: `first_attempt_immutable: false || first_attempt_policy: 'IMMUTABLE'` resolved
to `true`, so the prose silently overrode an explicit boolean **toward the permissive answer**. The
authored `false` vanished and the binding became BKT-qualifiable.

The rule now:

1. **The boolean decides whenever it is authored.** `true` sets the field; `false` or a non-boolean
   leaves it unset, and the contract's `z.literal(true)` then refuses the measurable binding. Fails
   closed.
2. **The prose is a fallback consulted only when no boolean is authored** — never an override. `null`
   counts as absent, which is why the 30 of 33 real `V3-LES-844372` bindings that carry only the prose
   still parse. Deleting the alias outright would have silently demoted every one of them to a mutable
   first attempt, which is why it was demoted rather than removed.
3. **The pair that disagrees rejects** with `CONTRADICTORY_FIRST_ATTEMPT_IMMUTABILITY_AUTHORED`.

The contradiction check is **order-independent by construction**: it counts the authored sources rather
than resolving them, so which key appears first in the artifact cannot change the verdict.

---

## 4. `LessonRuntimeResponseFacts` — runtime facts

`LessonRuntimeResponseFacts` / `LessonRuntimeResponseFactsSchema` (`@mcat/contracts`) is what the
lesson runner emits per response. Every field is an observed fact. None is a judgement.

| Field                    | Type / constraint            | Semantics                                                                                                                                                                                               |
| ------------------------ | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `questionId`             | required `LessonItemId`      | The scored item.                                                                                                                                                                                        |
| `itemBindingId`          | required `LessonItemId`      | Links the response to its binding.                                                                                                                                                                      |
| `bindingVersion`         | **required** opaque string   | MUST equal the binding's resolved version; otherwise `BINDING_VERSION_MISMATCH`. Required here even though it is optional on the binding (D5) — the server resolves it before the response is accepted. |
| `attemptIndex`           | positive integer             | `1` is the first attempt. Only `1` can qualify for BKT.                                                                                                                                                 |
| `isRetry`                | boolean                      | Any retry of this item in this session.                                                                                                                                                                 |
| `isDiagnosticRetry`      | boolean                      | Retry after a miss inside a diagnostic flow.                                                                                                                                                            |
| `response`               | discriminated union (§4.1)   | `MULTIPLE_CHOICE` or `CONSTRUCTED`. The response payload is never flattened onto this object.                                                                                                           |
| `omitted`                | boolean                      | Omission is **explicit**, never inferred from a null choice or an empty field.                                                                                                                          |
| `elapsedMs`              | nonnegative integer          | Time on item.                                                                                                                                                                                           |
| `answerChanges`          | nonnegative integer          | Count of answer changes before commit.                                                                                                                                                                  |
| `assistanceLevel`        | `AssistanceLevel`            | The assistance actually taken at commit. The **only** assistance input to independence (§3.3).                                                                                                          |
| `contentBearingHintUsed` | boolean                      | A hint that carried content toward the answer.                                                                                                                                                          |
| `revealUsed`             | boolean                      | The key or rationale was revealed before commit.                                                                                                                                                        |
| `mixedAdministration`    | boolean, **default `false`** | The attempt was administered interleaved with other constructs. See §4.2.                                                                                                                               |
| `passageAdministration`  | boolean, **default `false`** | The attempt was administered against an integrated passage. See §4.2.                                                                                                                                   |
| `timedAdministration`    | boolean, **default `false`** | The attempt was administered under a timer. See §4.2.                                                                                                                                                   |
| `occurredAt`             | timestamp                    | The runner's **claim** about when the attempt occurred. It is a fact, not a clock: no policy reads it raw. See §7.4.                                                                                    |

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

### 4.2 The administration conditions are runner facts, not declarations

`mixedAdministration`, `passageAdministration`, and `timedAdministration` describe how the attempt was
**actually run**. They are warrant-bearing: the evidence system reads them into
`EvidenceRecord.conditions`, and `deriveEvidenceKind` will not classify a response as `mixed`,
`integrated_passage`, or `timed` unless the matching fact is `true` (§7.2).

They are therefore the runner's to report and nobody else's. A `candidateEvidenceModes` declaration
says what an item is _eligible to serve as_; it says nothing about how one attempt was administered,
so it MUST NOT set one of these. The fourth condition, `protected`, is not a runner fact at all: it
arrives on the `ServerScoringResolution` as `protectedScoring`, because every measurable binding
carries a `serverScoringAuthorityRef` and the mere presence of one discriminates nothing. The opaque
ref is never parsed to find out.

Each defaults to `false`, which is the fail-closed direction: **a runner that does not report a
condition has not established it.** A runner MUST NOT report one of these unless it actually
administered the attempt that way.

---

## 5. Two gates: the resolved evidence kind, then runtime qualification

A response moves BKT only when **both** gates pass. They are separate and neither can substitute for
the other. Gate 1 asks whether the evidence this attempt produced could ever fill a mastery recipe
slot; Gate 2 asks whether the attempt was an uncontaminated first look.

```text
LessonItemBinding + LessonRuntimeResponseFacts
        │
        ├─ measurementKind === 'NON_MEASURABLE'  → nothing at all (§3.1)
        │
        ├─ resolve the evidence kind ONCE
        │     evidenceKind = deriveEvidenceKind(modes, response, administrationConditions)
        │
        ├─ Gate 1 — THE RESOLVED KIND COULD FILL A RECIPE SLOT
        │     !CONTEXTUAL_ONLY_KINDS.has(evidenceKind)
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

### 5.1 Gate 1 — the resolved evidence kind (not the declared modes)

> **There is exactly ONE notion of BKT eligibility, and it is the resolved evidence kind.** The
> evidence kind is derived once, before qualification; BKT gates on
> `CONTEXTUAL_ONLY_KINDS.has(resolvedKind)`; and the `EvidenceRecord` reads that same value. Do not
> reintroduce a declared-set test here, and do not intersect the two. **A declaration states what an
> item is ELIGIBLE TO SERVE AS. It is never a finding about an attempt.**

`hasEligibleEvidenceMode(binding)` no longer gates BKT. It survives for exactly two narrower jobs:
the authoring-completeness rule (a binding that declares an allowlisted mode MUST supply a
`reasoningOperation`, because a declaration is a claim the artifact has to be able to back), and
choosing which frozen code _names_ a refusal the kind gate has already decided. It is not a second
eligibility test, and §15.1 records what happened when it was one.

| Requirement                                                    | Rejection code on failure                                                            |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| A binding resolves for the response                            | `BINDING_NOT_FOUND`                                                                  |
| `response.bindingVersion` equals the resolved binding version  | `BINDING_VERSION_MISMATCH`                                                           |
| `binding.firstAttemptImmutable === true`                       | `FIRST_ATTEMPT_NOT_IMMUTABLE`                                                        |
| `!CONTEXTUAL_ONLY_KINDS.has(resolvedKind)`                     | `RESOLVED_EVIDENCE_KIND_CONTEXTUAL_ONLY` or `INDEPENDENT_EVIDENCE_MODE_NOT_DECLARED` |
| `binding.reasoningOperation` present once the kind gate passes | `ELIGIBLE_BINDING_MISSING_REASONING_OPERATION`                                       |

**Which of the two contextual-only codes fires is purely diagnostic.** Both refuse; nothing about the
choice can change the verdict. It exists because the two causes send an operator to different places:

- `INDEPENDENT_EVIDENCE_MODE_NOT_DECLARED` — no allowlisted mode was declared at all. An **authoring**
  fact. The name is historical and frozen; read it as "no eligible evidence mode was declared".
- `RESOLVED_EVIDENCE_KIND_CONTEXTUAL_ONLY` — the permission was real, but this attempt did not exercise
  it. A **runtime** fact. Typically an administration-gated mode (`MIXED`, `PASSAGE`, `TIMED`,
  `PROTECTED`) whose condition the runner honestly reported as false, or an ineligible mode winning
  least-credit alongside an eligible one. Calling this case
  `INDEPENDENT_EVIDENCE_MODE_NOT_DECLARED` would be a lie in the audit trail.

`ELIGIBLE_BINDING_MISSING_REASONING_OPERATION` is enforced twice, deliberately: as a schema
`superRefine` on `LessonItemBindingSchema` (so an eligible-but-unlabeled binding cannot even be
constructed) and again at adaptation time.

Gate 1 is deliberately conservative: an absent declaration defaults to `['INSTRUCTIONAL']`, resolves to
`instruction`, and is a rejection — never a default-allow. Because the gate reads the resolved kind, a
declaration the administration did not support fails closed the same way.

### 5.2 Gate 2 — runtime qualification (per response)

| Requirement                                                             | Rejection code on failure   |
| ----------------------------------------------------------------------- | --------------------------- |
| `scoring.scoringValid === true`                                         | `SERVER_SCORING_INVALID`    |
| `response.attemptIndex === 1`                                           | `NOT_FIRST_ATTEMPT`         |
| `response.assistanceLevel === 'A0'`                                     | `ASSISTANCE_NOT_A0`         |
| `response.contentBearingHintUsed === false`                             | `CONTENT_BEARING_HINT_USED` |
| `response.revealUsed === false`                                         | `REVEAL_USED`               |
| `response.isRetry === false` and `response.isDiagnosticRetry === false` | `RETRY_USED`                |

Only `response.assistanceLevel` is consulted, and it is the level the learner **took**, not the level
the design offered. `authoredAssistanceAffordances` is **never** read here (§3.3): an item may advertise
`A0` and still be answered at `A2`, and it is the `A2` that counts.

**Today this gate passes for clean lesson responses.** The runtime now observes a graded assistance
level, so `ASSISTANCE_NOT_A0` no longer fires on every response (§3.3). If you are
wondering why a clean-looking attempt did not move `pL`, it is because no binding declares a BKT-eligible mode, and that is intended.

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

**The rule, in one paragraph.** If a binding declares **any** `candidateEvidenceModes` member from
the seven-member BKT allowlist (§3.5), the author MUST stop and label `reasoning_operation` with
exactly one of the seven members of `ReasoningOperation` — `IDENTIFY`, `PREDICT`, `EXPLAIN`, `RELATE`,
`QUANTIFY`, `DESIGN`, `EVIDENCE` — because that value is a direct BKT update target and there is no
safe way for any adapter, heuristic, or model to guess which of seven operations an item actually
exercises; a wrong guess silently corrupts a learner-facing skill estimate. If the binding declares
nothing (the `['INSTRUCTIONAL']` default) or declares only ineligible modes, `reasoning_operation` is
optional and an unlabeled item is fine, because such an item can never reach BKT. `dok_level` is
different: it is
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
Routing is a pure function of `candidateEvidenceModes` plus the server-derived
`AdministrationConditions`; `deriveEvidenceKind(modes, response, conditions)` in the adapter is the
implementation. Note the third argument: a declaration alone cannot decide the kind.

Classification runs in four steps, in this order:

1. `response.isDiagnosticRetry` → `diagnostic_retry`, regardless of declared mode.
2. Not an independent administration → `instruction`, regardless of declared mode. **Assisted
   administration outranks any declaration an author made.**
3. Otherwise, **least-credit-first**: walk the conservative mode order and take the first declared
   mode, **skipping any mode whose administration condition was not met**. A binding declaring
   several modes is classified by the one that earns the _least_ mastery credit, so a broad
   permission set can never upgrade a record's evidence quality.
4. If every declared mode was skipped that way, **fail closed to `instruction`** rather than
   crediting a condition that did not happen.

| Declared `CandidateEvidenceMode` | `EvidenceRecord.kind` on a clean administration | Requires an administration fact | Fills a mastery recipe slot? | Gate 1 eligible? |
| -------------------------------- | ----------------------------------------------- | ------------------------------- | ---------------------------- | ---------------- |
| `INSTRUCTIONAL`                  | `instruction`                                   | —                               | no (contextual only)         | **no**           |
| `INSTRUCTIONAL_EXIT`             | `instruction`                                   | —                               | no (contextual only)         | **no**           |
| `REHEARSAL_ONLY`                 | `instruction`                                   | —                               | no (contextual only)         | **no**           |
| `REPAIR_CONFIRMATION`            | `instruction`                                   | —                               | no (contextual only)         | **no**           |
| `DIAGNOSTIC`                     | `placement`                                     | —                               | no (contextual only)         | **no**           |
| `ENTRY`                          | `placement`                                     | —                               | no (contextual only)         | **no**           |
| `INDEPENDENT`                    | `independent`                                   | —                               | yes                          | yes              |
| `TRANSFER`                       | `transfer`                                      | —                               | yes                          | yes              |
| `DELAYED`                        | `delayed`                                       | —                               | yes                          | yes              |
| `MIXED`                          | `mixed`                                         | `mixedAdministration`           | yes                          | yes              |
| `PASSAGE`                        | `integrated_passage`                            | `passageAdministration`         | yes                          | yes              |
| `TIMED`                          | `timed`                                         | `timedAdministration`           | yes                          | yes              |
| `PROTECTED`                      | `protected`                                     | `protectedScoring` (scoring)    | yes                          | yes              |

The rows are listed in the conservative order the adapter walks. "Fills a mastery recipe slot"
reflects `CONTEXTUAL_ONLY_KINDS` in `packages/domain/src/evidence.ts`.

**Read the last two columns as one column.** They agree on every row because they are now the same
test: Gate 1 gates on the resolved kind, so "can fill a recipe slot" and "moves `pL`" cannot come
apart. The "Gate 1 eligible?" column is retained only because the phrase appears throughout this
document; it is not an independent property, and the table above states it per **mode** only for the
single-mode, condition-met case. For a multi-mode declaration or an unmet condition, resolve the kind
first and read eligibility off that — never off the declaration. The biconditional is asserted
exhaustively (§16.1).

**Four modes are administration-gated.** `MIXED`, `PASSAGE`, `TIMED`, and `PROTECTED` classify the
record only when the corresponding condition is actually true; otherwise the mode is skipped and a
lesser one is used. Without this, declaring `TIMED` would mint a `timed` record — which fills the
timed recipe slot — on an untimed attempt. That is author-manufactured warrant, and it is more
load-bearing than a fabricated condition flag would be, because recipe slots key on `kind`. So a
binding declaring all four modes, answered cleanly but with no condition reported, is
`kind: 'instruction'` with all four `conditions` false.

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

| `EvidenceRecord` field                   | Source                                                                                                                                                                                                              |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `skillId`                                | `binding.primaryKcId`                                                                                                                                                                                               |
| `cluster`                                | **Caller-resolved (D9)** — the caller passes it in, resolved via `LESSON_TO_CLUSTER`.                                                                                                                               |
| `operation`                              | **Omitted** for lesson-sourced evidence (§6.1).                                                                                                                                                                     |
| `kind`                                   | `deriveEvidenceKind(binding.candidateEvidenceModes, response, administrationConditions)`                                                                                                                            |
| `independent`                            | `isIndependentAdministration(response)`                                                                                                                                                                             |
| `assistanceLevel`                        | `response.assistanceLevel`                                                                                                                                                                                          |
| `contentBearingHint`                     | `response.contentBearingHintUsed`                                                                                                                                                                                   |
| `questionId`                             | `binding.questionId` (a `LessonItemId`)                                                                                                                                                                             |
| `itemVersion`                            | the resolved `serverItemVersion`                                                                                                                                                                                    |
| `familyId`                               | `binding.semanticFamilyId`                                                                                                                                                                                          |
| `stimulusId`                             | `binding.stimulusLineageId`, omitted when absent                                                                                                                                                                    |
| `changeDimensions`                       | `binding.changedDimensions`                                                                                                                                                                                         |
| `delayHours`                             | caller-supplied, omitted when absent                                                                                                                                                                                |
| `conditions`                             | `mixed` / `passage` / `timed` from the **runner's administration facts** (§4.2), `protected` from the scoring resolution's `protectedScoring`, `accommodations` caller-supplied. **Never from the declared modes.** |
| `outcome`                                | the accepted `outcome`                                                                                                                                                                                              |
| `occurredAt`                             | `boundOccurredAtToServerTime(response.occurredAt, acceptedAt)` — **never** the raw claim (§7.4)                                                                                                                     |
| `sequence`, `contentRelease`, `policies` | provenance inputs                                                                                                                                                                                                   |

`cluster` is caller-resolved because `@mcat/domain` MUST NOT import `@mcat/content`; the seam stays
free of a content dependency and of any lesson-specific table. The author never writes `conditions`,
and neither does a declaration: an earlier version of this table said the conditions came from the
declared modes, which would have let an author mint the warrant that a mixed, passage, timed, or
protected administration is supposed to prove. `EvidenceRecord` MUST NOT gain a capability-estimate
field.

### 7.4 The server-bounded clock (normative)

`LessonRuntimeResponseFacts.occurredAt` is a runtime fact: the runner's **claim** about when the
attempt happened (§2). Until July 2026 that claim was used directly as two different policy clocks,
and both were exploitable. This section is normative because the failure is not hypothetical:

- 120 observations stamped `2999-01-01` produced **permanent mastery** — decay never elapsed, so the
  estimate never came down.
- One **correct**, backdated observation dropped a mastered KC from `1.0` to `9.7e-11`, because lazy
  decay was applied across the invented gap before the update landed.

A forward-dated claim buys mastery and a backdated one destroys it. Either way the client is writing
a mastery claim, which §10 prohibits. The rule that follows:

> **A runner-reported time MAY be recorded verbatim for audit. It MUST NOT be read as a clock by any
> policy.** Every clock a policy reads is server-bounded first.

Four places implement that rule, and one place deliberately does not.

**1. BKT — the decay clock is bounded and monotonic.** `boundDecayClock` in
`packages/authority-core/src/authority.ts` computes:

```text
ceiling     = min(reportedAt, serverNow)
serverFloor = serverNow - BKT_OBSERVATION_PAST_SKEW_TOLERANCE_MS
floor       = grainFloor === null ? serverFloor
                                  : max(min(grainFloor, serverNow), serverFloor)
appliedAt   = max(floor, ceiling)
```

The clamp is **three-sided**:

- **Ceiling.** The Authority's own clock, so an observation can never be ahead of the server.
- **Grain floor.** The newest `lastPracticedAt` among **the grains this observation actually writes**,
  so no grain's clock can rewind. Prerequisite grains are reinforced on a correct answer only, so on a
  miss they are excluded from the floor — counting an untouched grain would drag the clock forward for
  no reason. The grain floor is itself capped at `serverNow`: a stored future timestamp is invalid on
  its face, so it must not become a permanent floor. That cap is also what makes state poisoned before
  the clamp existed heal on its next write.
- **Server floor.** `serverNow - BKT_OBSERVATION_PAST_SKEW_TOLERANCE_MS`.

The server floor exists because the grain floor is `null` on a grain's **first** write, and without a
third bound the clamp degenerated exactly there: an arbitrarily backdated claim became the decay
baseline, measured at `currentPL = 5.4e-104`, and `pL` came out **arrival-order dependent** — 0.1497
against 0.8624 for identical evidence, a 5.8x spread from transport order alone. A monotonic floor
cannot help on a first write, because there is no history to be monotonic against.

The past tolerance **equals** the future tolerance (both `300_000`). Symmetry is asserted: an asymmetric
window would treat the same unverifiable claim one way early and another way late, reopening the
order-dependence on the wider side.

A too-old claim is **clamped, not refused** — the opposite of the future direction, and deliberately so.
A delayed submission is ordinary, and refusing it would discard real evidence; whereas a future-dated
claim has no honest explanation past the skew window. The clamp errs generously (a long-delayed
submission gets a recent decay baseline), which is the right way to be wrong here: elapsed time is
unverifiable, the server prefers its own clock, and the **warrant** timestamp is bounded separately
against `acceptedAt` and keeps the honest time, so freshness, delay, and retention are unaffected. Only
the memory baseline moves, and `pL` still requires real correct answers to rise — the clamp cannot
manufacture evidence.

**Order-dependence is bounded, not eliminated, and that distinction is the invariant.** While a reported
time is honoured at all, some order-dependence remains, bounded by the decay across the skew window
(~0.03% at the initial seven-day half-life). Measured residual after the fix: **9.163e-5**, asserted
under `1e-3`. Asserting equality would promise something the design deliberately does not; asserting a
bound is the real contract. The window's width is therefore load-bearing — a day-wide window would leave
a spread a learner could see — and it is asserted to be at most an hour.

A claim more than `BKT_OBSERVATION_FUTURE_SKEW_TOLERANCE_MS` (`300_000`, five minutes — the Kerberos
and JWT `nbf`/`exp` allowance) ahead of the server clock is **refused** with
`OBSERVATION_TIMESTAMP_IN_FUTURE`, not silently clamped. Clamping alone would accept the bad claim and
leave no signal. Five minutes is generous enough for an unsynchronised session server and far too
small to buy any decay advantage: at the initial seven-day half-life it is a ~0.03% difference.

**2. Audit — the raw claim survives the correction.** Each application appends a
`bkt_observation_applied` ledger event carrying `reportedOccurredAt` (the verbatim claim),
`appliedOccurredAt` (the clock actually written, `null` if nothing was applied), `clockAdjustment`,
`outOfOrder`, and `observationSequence`. The clamp therefore never destroys the only evidence that a
client misreported.

`clockAdjustment` says **which bound decided**: `none` if the claim was used verbatim,
`held_at_last_practiced` if a grain's own history won, and `bounded_to_server_clock` if the server clock
decided either end — the future ceiling or the past window.

**3. Ordering — `sequence` is detection, not enforcement.** The Authority keeps a high-water mark of
the highest applied `sequence`. An out-of-order arrival sets `outOfOrder: true` and **is still
applied**. This is deliberate: delayed and reordered delivery is normal, and refusing a legitimately
earlier observation would silently discard real evidence. The clamp is what keeps the resulting state
sane, since a late arrival can no longer rewind a grain's clock.

**4. Evidence — the bound is structural, via a branded type.** `EvidenceRecord.occurredAt` is a
`ServerBoundedTimestamp`, a brand whose only producer is `boundOccurredAtToServerTime(reportedAt,
serverCeiling)`. The seam's ceiling is the server's `acceptedAt`. Because the field's type is narrower
than `UtcTimestamp`, the adapter **cannot** assign `response.occurredAt` to it — the mistake is a type
error rather than a code-review question. Bounding here is a ceiling only, with no floor: an
`EvidenceRecord` is an immutable append rather than a running estimate, so nothing can be rewound, and
an earlier-than-expected time merely ages the record out sooner, which is the safe direction.

The brand is compile-time only, so `EvidenceRecordSchema.parse` on a plain object still accepts a raw
string. That path belongs to callers that stamp their own server clock directly
(`Authority.appendEvidence`) and are bounded by construction.

Freshness reads that field, and **a negative age means untrustworthy, not new.** `daysBetween` is
signed, so a future-dated record would otherwise clear every freshness window forever — the freshest
evidence on file would be the one with the most broken timestamp. Flooring the age at zero is the
wrong repair, because age `0` reads as maximally fresh. So a negative age yields `isFresh: false`. It
still counts toward the **achieved-ever** tier, which is not time-derived, and the resulting mismatch
surfaces as `EVIDENCE_STALE`.

**Ordering of the two authorities.** BKT application runs **before** evidence is written, so an
observation refused with `OBSERVATION_TIMESTAMP_IN_FUTURE` leaves **no evidence record at all**. Do
not confuse this with failing to qualify: a response that merely fails Gate 1 or Gate 2 — an
instructional-only binding, say — still records evidence (§7.2). Refusal at the application step is a
rejection of the whole claim, including its timestamp, so there is nothing trustworthy left to record.

**Accepted with no action: `lastDueReviewAt` stays uncapped.** It is audit-only; no policy reads it,
so an implausible value cannot move a learner-facing number. It is listed here so a future reader does
not mistake the omission for an oversight. If a policy ever starts reading it, it MUST be bounded
first.

---

## 8. BKT routing and the two grains

### 8.1 `QualifiedBktObservation`

`QualifiedBktObservation` / `QualifiedBktObservationSchema` (server-only) is the only input the BKT
engine accepts from a lesson: `observationId`, `questionId`, `itemBindingId`, `bindingVersion`,
`serverItemVersion` (the resolved positive integer), `primaryKcId`, `reasoningOperation`, `correct`,
optional `dokLevel`, `occurredAt`, `sequence`, `contentRelease`, `policies`.

`correct` is server-derived from the accepted `outcome`: `correct` maps to `true`, and both
`incorrect` and `omitted` map to `false`. An omission is a qualifying, scored outcome — see §5.2.

`occurredAt` here is still the runner's **unbounded claim**, unlike `EvidenceRecord.occurredAt`. That
is intentional and is not an inconsistency: this object is a request to the BKT engine, not a stored
warrant, and the Authority is the thing that owns the decay clock. It bounds the claim at application
time and records both values (§7.4). The asymmetry is worth knowing before you read the two
`occurredAt` fields side by side and assume one of them is wrong.

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

| Output           | Rule                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Displayed value  | **Arithmetic mean** of the current (lazily decayed) `pL` of every required member KC.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `mastered`       | `true` only when **every** required member KC satisfies **both** halves of the claim: `isMastered(pL)` (`pL >= 0.95`) **and** a sufficient evidence warrant (`evidenceSufficient`: an `independent`-tier-or-better warrant on that KC, per `MASTERY_WARRANT_MIN_TIER` in `packages/policies/src/lesson-rollup.ts`, added by `669fbcf`). One KC below the cut, or one KC with `pL >= 0.95` but no sufficient warrant, blocks it — a KC can sit at `pL = 1` and still be unmastered. See `key-docs/roadmap-todo.md` for why the lesson channel alone cannot supply that warrant today. |
| Review-due       | `true` when **any** previously practiced required KC is due (its decayed `pL` has fallen below `REVIEW_LINE = 0.90`). A KC that has never been practiced is not due.                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Missing KC state | A required KC with no state contributes the `PRIOR_PL0 = 0.20` prior to the mean **and** blocks `mastered`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Missing mapping  | A missing or empty lesson-to-KC mapping **FAILS CLOSED**: emit no lesson-grain value at all. It MUST NOT be reported as `0`, as mastered, or as an empty-set vacuous truth.                                                                                                                                                                                                                                                                                                                                                                                                          |

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

### 9.1 `reviewDue` and `refreshNeeded` are different questions from different authorities

These two used to publish under **one field name**, `refreshNeeded`, across four view types. That is the
seam's founding error in miniature: one name for two authorities' answers, so a planner reading both
would have collapsed them without noticing.

| Field           | Question                                | Authority        | Published on                                                         |
| --------------- | --------------------------------------- | ---------------- | -------------------------------------------------------------------- |
| `reviewDue`     | _Is the memory due?_ — BKT decay        | BKT capability   | `SkillMasteryView`, `LessonMasteryView`, the lesson rollup, KC views |
| `refreshNeeded` | _Is the warrant stale or contradicted?_ | Evidence warrant | `MasteryMapEntry`, `SessionSummary`                                  |

`reviewDue` is true when a grain was at or above `REVIEW_LINE` when last practiced and has decayed below
it since — so a never-practiced grain is **not** due, only a previously-built one. `refreshNeeded` is a
property of the evidence on file: it is true when the warrant has aged out of its freshness window or a
fresh failure contradicts it, and it can be true while `pL` is high, or false while `pL` is low.

**There is deliberately no alias.** A consumer must name the question it is asking. **The planner MUST
consume them separately**: they are inputs to different decisions — `reviewDue` schedules a review of a
memory, `refreshNeeded` schedules the acquisition of missing or stale _warrant_ — and a single "needs
attention" boolean built from either one silently answers the other question wrongly.

One learner-facing item remains open and is owner-facing, not a code defect: `Skills.tsx` renders "Needs
refresh" from `reviewDue`, while `Study.tsx` and `SkillDetail.tsx` render the same words from
`refreshNeeded`. The fields are correctly distinct; the **copy** has not been re-adjudicated (§15.5).

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

> **Update — `e579779` (2026-07-29).** The "no lesson on disk moves `pL` at all" / "0 of 115"
> framing below, and §3.5 rule 1's "No lesson on disk authors it — 0 of 115 bindings," describe the
> state _before_ this commit. `V3-LES-130923` now authors `candidate_evidence_modes: ['TRANSFER']`
> (plus a `reasoningOperation`) on its 6 `CHANGED_EXIT` terminal checks, and
> `EXPECTED_QUALIFIED_BKT_OBSERVATIONS` in `tests/architecture/v3-lesson-binding-conformance.test.ts`
> now expects `6`, not `0`, for that lesson. `V3-LES-789208` and `V3-LES-844372` are unchanged, so
> "0 of 115" is accurate for 109 of 115 bindings rather than all 115. See `key-docs/roadmap-todo.md`
> for why those two remain unlicensed — they live outside any `.git` and cannot be edited from this
> checkout — and for a related mislabeling finding on `V3-LES-844372`.

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

**There is now only one reason `pL` does not move.** (Previously there were two independent reasons, but the runtime assistance fail-close was resolved.)

1. **Gate 1, author-time.** No binding declares an allowlisted evidence mode, so
   `INDEPENDENT_EVIDENCE_MODE_NOT_DECLARED` fires. Resolved only by an author and reviewer
   deliberately declaring an eligible mode and labeling `reasoningOperation`.
2. **Gate 2, runtime.** The runtime now observes a graded assistance level, so `ASSISTANCE_NOT_A0` no longer fires on every response (§3.3). The runtime measures help actually taken, satisfying this gate for clean responses.

That defence in depth is the intended state. It is also why "the lesson integration does not work" is
the wrong reading: the BKT path is exercised end to end for all seven eligible modes on
`V3-LES-844372`, and the debug endpoint in §16 is how you confirm that by hand.

This is the intended, correct end state, not an incomplete integration. These items were authored as
instructional checks; nobody has reviewed and approved them as measurement, and none carries a
`reasoningOperation`. Manufacturing eligibility after the fact — by defaulting to a non-instructional
mode, inferring an operation from `learnerOperation`, or treating `NEAR_EXIT` as implying
independence — would fabricate capability evidence. These lessons produce genuine instructional
evidence today, and a binding becomes BKT-eligible only when an author and reviewer deliberately
declare a mode from the seven-member allowlist (§3.5) and label `reasoningOperation`.

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
and the server scoring resolution all arrive as inputs — including the `acceptedAt` ceiling that bounds
`EvidenceRecord.occurredAt`, which is why §7.4's bounding does not compromise purity here.

The BKT **application** step is the one place that genuinely reads a clock: `boundDecayClock` consults
the Authority's own clock to bound and floor the reported time (§7.4). Replay at that layer is
therefore reproducible only against a fixed Authority clock, which is how the tests drive it. This is a
property of the decay clock rather than a leak in the seam: a clamp against the server's notion of
"now" cannot be expressed as a pure function of the observation alone.

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
2. `unrecognizedAuthoredBindingKeys` returns empty for every binding, and `rejectionCodes` is empty —
   no binding authors a contradiction from `AUTHORED_BINDING_REJECTION_CODES` (§3.10).
3. Every `MEASURABLE` binding has `firstAttemptImmutable: true`, a `questionId`, an `activityId`, and
   a `serverScoringAuthorityRef`; every `NON_MEASURABLE` binding has none of them.
4. Every binding declaring a mode from the seven-member BKT allowlist (§3.5) carries a
   `reasoningOperation`.
5. No binding contains `independent`, `pL`, a mastery threshold or status, decay, an evidence status,
   or any answer-bearing material.
6. `activity_role` uses only the nine `LessonActivityRole` members; `NEAR_USE` / `CHANGED_TASK`
   appear only under the exit-function field (§3.4).
7. The runner emits `LessonRuntimeResponseFacts` only, with the correct `response` union arm and no
   derived judgement. It reports `mixedAdministration`, `passageAdministration`, and
   `timedAdministration` from how the attempt was actually administered, and reports the assistance
   level the learner actually took — or fails closed if it cannot observe one (§3.3, §4.2).
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
- `packages/domain/src/evidence.ts` — `EvidenceRecord`, `CONTEXTUAL_ONLY_KINDS`, and the branded
  `ServerBoundedTimestamp` (§7.4).
- `packages/authority-core/src/authority.ts` — `applyQualifiedBktObservation`, `boundDecayClock`, and
  the `bkt_observation_applied` ledger event (§7.4).
- `packages/policies/src/lesson-rollup.ts` — the derived lesson-grain rollup (§9).
- `services/local-authority/src/debug-state.ts` — the loopback-only hand-verification view (§16).
- `tests/architecture/v3-lesson-binding-conformance.test.ts` — runs every real artifact through the
  production entry points.
- `tests/architecture/lesson-mastery-integration.test.ts` — the seam invariants; §16 maps each rule to
  its assertion.
- `services/lambdas/learner-api/src/second-lesson-mastery-seam.test.ts` — the end-to-end proof that an
  eligible binding moves `pL` (§3.3, §11).
- `docs/design/04-V3-LESSON-AUTHORING-QUALITY-AND-UI.md` — Spec 04: lesson structure, KC order,
  nodes/screens, activity roles, item bindings, assistance design, repair/reentry, presentation,
  checkpoints, and authoring/review gates. Spec 04 owns _how the metadata gets authored and
  reviewed_; this contract owns _what the metadata means downstream_.
- `docs/mastery-pipeline.md` — the BKT/IRT engine, its formulas and constants.
- `docs/governance/authority-boundaries.md` — the actor permission table this seam sits inside.
- `docs/content/question-format-guide.md` — the eight generic authoring-analysis tags versus the
  seven-operation mastery axis.

---

## 15. Open questions, resolved tensions, and how to report a defect

### 15.1 Resolved — `pL` moving on evidence no recipe would accept

**Read this even though it is closed.** It is the longest-lived defect in this seam, it re-opened once
after being declared closed, and the shape of the fix is the rule that keeps it shut.

**The tension, as first recorded.** D4 read as "every non-`INSTRUCTIONAL` mode is eligible" made twelve
of thirteen modes eligible, five of which — `DIAGNOSTIC`, `ENTRY`, `INSTRUCTIONAL_EXIT`,
`REPAIR_CONFIRMATION`, `REHEARSAL_ONLY` — route to kinds in `CONTEXTUAL_ONLY_KINDS`. A binding
declaring one of them with a `reasoningOperation` would move `pL` on evidence that can never fill a
recipe slot.

**Why the allowlist alone did not close it.** Narrowing the declared set to seven modes (§3.5) fixed
every single-mode case, and an earlier revision of this document declared the tension closed on that
basis. It was not. BKT qualification still consulted the **declared** mode set, while the evidence kind
was resolved **separately** with administration gating — and the qualification call site never consulted
the resolved kind. Two derivations of one fact, free to disagree:

- **42 of 78** unordered two-mode declarations qualified for BKT while resolving to a contextual-only
  kind, **with every administration condition true** — so the gate was not the cause. An ineligible mode
  won least-credit, and the declared-set test never noticed.
- **All four** administration-gated modes (`MIXED`, `PASSAGE`, `TIMED`, `PROTECTED`) qualified when the
  runner **honestly reported the condition false**. Declaring `TIMED` was enough; being timed was not
  required.

It ramped a grain to `pL = 0.99999`, `mastered: true`, with the lesson rollup mastered, on **0 of 40
mastery-eligible records and all 7 recipe slots open**. That is verbatim the state this section had
declared impossible.

**How it is closed now — one derivation, not two agreeing ones.** The kind is resolved once before
qualification; BKT gates on `CONTEXTUAL_ONLY_KINDS.has(resolvedKind)`; the evidence record reads the
same value; and `hasEligibleEvidenceMode` no longer gates (§5.1). The frozen code
`RESOLVED_EVIDENCE_KIND_CONTEXTUAL_ONLY` names the runtime cause. Re-measured against the real kernel:
42 → **0**, 4 → **0**, and the accounting closes exactly — of the 78 unordered two-mode declarations, 21
qualify, 42 are refused as contextual-only, and 15 as mode-not-declared.

**What holds it shut.** `tests/architecture/lesson-mastery-integration.test.ts`, describe block _"BKT
qualification and the evidence kind cannot disagree"_, asserts the biconditional
`qualified ⟺ !CONTEXTUAL_ONLY_KINDS.has(evidence.kind)` across **2,704** cases — every one- and
two-mode declaration (169) under every administration setting (16) — plus that both outcomes actually
occur, that every case produced an evidence record so nothing is compared against nothing, that the
resolution is order-independent, and that `deriveEvidenceKind` appears **exactly once** in the adapter,
so there is no second copy to keep in sync.

**The transferable lesson.** The first fix made the two derivations agree on the cases anyone had
enumerated. The durable fix deleted one of them. If you find yourself reconciling two computations of
the same fact, the reconciliation is the defect.

### 15.2 Resolved — §3.3's blanket prohibition was replaced by runtime observation

**Resolved.** The question of whether to narrow the prohibition on reading the authored assistance value was answered in a way neither option anticipated.

Instead of either trusting the authored value (narrowing) or refusing it blanket (against narrowing), the runtime was changed to observe its own delivery: which support mechanism it actually put on screen. A single `presentedSupportFor` decision now drives the rendered screen, the support authorization, and the commit-time observation, so the runtime cannot present help it didn't record or record help it didn't present.

The authored `assistanceState` field was **deleted** from the response record rather than left unread. This third path was available because the runtime could be made to measure its own behavior, closing the three-site re-derivation that this section named as an unenforced invariant.

### 15.3 Open — the ordinal tier is still recoverable from the published reason codes (for the owner)

Removing `base` from the published views (§4.1 of `docs/mastery-pipeline.md`) removed the **rank** from
the wire. It did not remove the **information**.

The three `*_SATISFIED` reason codes map one-to-one onto the top tiers, so a consumer can reconstruct the
ordinal **losslessly** from `reasons` and then threshold it — which is exactly the behaviour the removal
was meant to prevent. The candidate fix is to coarsen the codes so the reconstruction is lossy: publish
that a warrant is satisfied without publishing which tier satisfied it.

This is not obviously right, which is why it is a question. Coarsening costs the learner-facing surfaces
some of their specificity ("your independent evidence is satisfied" is more useful than "your warrant is
satisfied"), and it costs the planner nothing only because the planner reads the private
`Authority.skillWarrants` and keeps the tier legitimately. The owner decides whether the published
specificity is worth the recoverable ordinal.

### 15.4 Owed — a governed rename: `LessonMasteryView.pL` → `meanMemberPL`

`LessonMasteryView.pL` is an **arithmetic mean of member KC `pL` values**, not a probability of anything
(§9). The name invites the one operation §9 forbids: comparing it against `MASTERY_THRESHOLD` to decide
`mastered`. `meanMemberPL` says what it is.

This is a Gate A exported-symbol change, so it needs a governed revision rather than a rename in passing.
Until it lands, §9's prohibition is the only thing standing between the field's name and the defect.

### 15.5 Owner ratification — the "Needs refresh" copy, now split

"Needs refresh" was rendered from `reviewDue` (BKT decay) on the Progress skill rail and from
`refreshNeeded` (warrant staleness) on `Study.tsx` and `SkillDetail.tsx`. The **fields** were already
distinct (§9.1); the shared **wording** predated the split, so the learner saw one phrase for two
authorities.

As of 2026-07-29 the strings are distinct: the BKT side reads **"Review due"** (`REVIEW_DUE_LABEL` in
`apps/learner-web/src/screens/Progress.tsx`, its only site, including the list item's `aria-label`) and
the warrant side reads **"Evidence needs refreshing"** (`EVIDENCE_REFRESH_LABEL`, exported from
`apps/learner-web/src/components/evidence-language.ts`, which both warrant surfaces read so they cannot
re-converge one screen at a time). The capability string is deliberately not kept in the evidence
module: warrant copy and capability copy sharing a home is how they converged.

**The exact wording is still the owner's.** What is settled is that the two authorities may not share a
phrase; which words each gets is a product-voice call awaiting ratification. No architecture assertion
holds this — see §16.2.

### 15.6 How to report a doc-vs-code divergence

If this document describes something the implementation does not do, **one of the two is defective and
neither may be assumed correct.** Do not edit the document to match the code by reflex: the prose
sometimes encodes a decision the code has quietly broken, which is how the fail-open eligibility
denylist and the client-owned decay clock were both found. Report the divergence with the module, the
section, and which one you believe is wrong, and let the owner decide.

---

## 16. What is actually enforced, and what is not

**Do not read a rule in this document as a guarantee.** This project has already shipped a guard that
was documented in a source comment **and** a README, believed by everyone, and did not exist. This
section is the register that keeps that from recurring. It records the state at the date in the header
and MUST be updated when coverage changes.

### 16.1 Enforced by an architecture assertion

Held by `tests/architecture/lesson-mastery-integration.test.ts` unless noted. Each of these was listed
as uncovered in an earlier revision of this document and is now covered; the names are given so a
future reader can verify rather than trust.

| Rule                                                                              | Section     | Assertion                                                                                                                                                                                                                                 |
| --------------------------------------------------------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`qualified ⟺ !CONTEXTUAL_ONLY_KINDS.has(kind)`, over 2,704 exhaustive cases**   | §5.1, §15.1 | describe _"BKT qualification and the evidence kind cannot disagree"_ — every one- and two-mode declaration (169) × every administration setting (16), plus coverage, both-outcomes-occur, and evidence-exists-for-every-case calibrations |
| **`deriveEvidenceKind` appears exactly once in the adapter**                      | §5.1, §15.1 | "derives the evidence kind exactly once, so there is nothing to keep in sync"                                                                                                                                                             |
| **The declared allowlist stays strictly weaker than the resolved-kind gate**      | §5.1        | "keeps the declared allowlist strictly weaker than the resolved-kind gate"                                                                                                                                                                |
| **Only the two frozen codes may name a contextual-only refusal**                  | §5.1        | "names every contextual-only refusal with a frozen code and nothing else"                                                                                                                                                                 |
| **The kind resolves independently of the order the author wrote the modes**       | §7.2        | "resolves the evidence kind independently of the order the author wrote the modes"                                                                                                                                                        |
| **The warrant covers every grain a lesson writes, unstarted KCs included**        | §2.2        | describe _"the evidence warrant covers every grain a lesson writes"_                                                                                                                                                                      |
| **An unresolvable warrant grain throws rather than being omitted**                | §2.2        | "throws a named error for an unresolvable grain rather than omitting it"                                                                                                                                                                  |
| **`pL` is order-independent within the skew window**                              | §7.4        | "keeps P(L) within the skew window of itself whichever order observations arrive in"                                                                                                                                                      |
| **The decay clock is bounded symmetrically, and narrowly**                        | §7.4        | "bounds the decay clock symmetrically, and narrowly"                                                                                                                                                                                      |
| **No view type both claims capability and reports the warrant**                   | §9.1, §10   | "no view type both claims capability and reports the warrant"                                                                                                                                                                             |
| **No evidence ladder anywhere in `@mcat/contracts`, exported or not**             | §9.1, §10   | `tests/architecture/contracts-ladder-ban.test.ts` — the package, not a file list: exported enums, exported member lists, every file's source text, the banned symbol names, plus a non-vacuity calibration                                |
| **No field name means capability on one view and warrant on another**             | §9.1        | "no field name means capability on one view and warrant on another"                                                                                                                                                                       |
| BKT eligibility is an allowlist; an unrecognized or future mode is ineligible     | §3.5, §5.1  | "keeps BKT eligibility an allowlist, so a future evidence mode is ineligible by default"                                                                                                                                                  |
| A declared mode never mints an administration condition the runner did not report | §4.2, §7.2  | "never lets a declared mode mint an administration condition the runner did not report"; also "never credits a condition the administration facts did not establish"                                                                      |
| Authored assistance affordances never decide independence or qualification        | §3.3        | "never lets authored assistance affordances decide independence or qualification"                                                                                                                                                         |
| The runner-reported time is server-bounded before it becomes warrant              | §7.4        | "bounds the runner-reported time by the server clock before it becomes warrant"                                                                                                                                                           |
| Omission qualifies; it is a scored outcome, not a scoring failure                 | §5.2        | "treats an omission as a scored outcome rather than a scoring failure"                                                                                                                                                                    |
| Every rejection code is collected, not short-circuited                            | §5.3        | "collects every reason a response did not move P(L) instead of short-circuiting"                                                                                                                                                          |
| `@mcat/domain` never reaches into `@mcat/content` for lesson data                 | §7.3        | "the generic seam never reaches into content for lesson data"                                                                                                                                                                             |
| Only the Authority may move `pL`; the lesson runtime cannot                       | §10         | "only the authority may move P(L)" (four assertions)                                                                                                                                                                                      |
| No lesson-specific identifier in the generic adapter, router, or engine           | §13         | "the lesson seam is generic (no lesson is a special case)"                                                                                                                                                                                |
| Protected material stays out of evidence and BKT observations                     | §10         | "protected and server-owned material stays out of learner-facing records"                                                                                                                                                                 |
| The runner has no field for a judgement it may not make                           | §4          | "gives the lesson runner no field for a judgement it is not allowed to make"                                                                                                                                                              |
| Evidence warrant and BKT capability outputs stay disjoint                         | §2.1, §10   | describe _"evidence warrant and BKT capability outputs stay disjoint"_ — now at the level of published **view types**, not only evidence records                                                                                          |
| Delivery completion cannot be read as a BKT observation                           | §9          | "lesson delivery and capability are separate axes"                                                                                                                                                                                        |
| Secondary KC mappings never become a BKT target                                   | §8.2        | "secondary KC mappings never become a BKT target"                                                                                                                                                                                         |
| Every real artifact conforms                                                      | §13         | `tests/architecture/v3-lesson-binding-conformance.test.ts`                                                                                                                                                                                |
| An eligible binding moves `pL` end to end, for all seven modes                    | §3.3, §11   | `services/lambdas/learner-api/src/second-lesson-mastery-seam.test.ts`                                                                                                                                                                     |

### 16.2 Held only by review — treat as unenforced

- **Learner-facing copy (§15.5).** Nothing asserts that the capability badge and the warrant badge
  read differently. A guard would have to know which authority a string belongs to, and a string is
  the one thing a type cannot carry. `EVIDENCE_REFRESH_LABEL` limits the blast radius — both warrant
  surfaces read it, so they cannot diverge from each other — but a future screen wording BKT decay as
  "needs refresh" again would pass every check in this repo.
- **Field-by-field `EvidenceRecord` mapping (§7.3).** Individual rows beyond the ones named above are
  checked by review and by unit tests of the adapter, not by an invariant that would survive a
  refactor.
- **The authored-contradiction codes (§3.10).** `MULTIPLE_LEARNER_SAFE_ITEM_SOURCES_AUTHORED` and
  `CONTRADICTORY_FIRST_ATTEMPT_IMMUTABILITY_AUTHORED` are covered by unit tests in
  `packages/domain/src/lesson-response-adapter.test.ts` — including that the prose-only bindings on
  `V3-LES-844372` still parse — but **no architecture assertion** holds them. In particular nothing
  asserts the general property that an authored key set is never resolved by precedence, so a **third**
  contradiction pair added later would not be caught by an existing guard. That is the same gap shape
  the resolved-kind defect (§15.1) exploited, and it is the one I would close next.
- **The rollup rules (§9).** `rollUpLessonMastery` is unit-tested, but nothing asserts that every
  learner-facing lesson-grain surface routes through it rather than reading a stored value.
- **Idempotency and replay (§12).** Asserted for the paths the tests drive; not a property held across
  every future call site.
- **§13's normative acceptance criterion** ("a second conforming lesson requires zero policy changes")
  is demonstrated by the second-lesson test for one lesson. It is evidence, not a proof for all
  lessons.
- **Author and reviewer gates (Spec 04).** Procedural. They depend on people following
  `docs/design/04-V3-LESSON-AUTHORING-QUALITY-AND-UI.md`.

### 16.3 The supported hand-verification path

`GET /v1/debug/learner-state` in `services/local-authority` is how the owner confirms the
lesson-to-mastery connection by hand. It returns KC `P(L)` (stored and lazily decayed), each of the
seven reasoning operations' `P(L)`, the derived lesson rollup with its rejection codes when
unavailable, the evidence records, the accepted event count, and the applied-observation count and
sequence high-water mark.

It is a pure projection — no I/O, no clock read, no `process.env` access — and its evidence view is an
explicit field **allowlist**, so a field added to `EvidenceRecord` tomorrow cannot leak through it.
Assume anything it returns ends up in a log.

Three independent guards gate it, and all three must pass: the operator opted in for this process
(`MCAT_LOCAL_DEBUG_STATE` set to `1` or `true`, an allowlist rather than a truthiness check), the peer
is loopback (an exact address allowlist, not a range test), and the request carries **no** `Origin`
header at all. The last is deliberately not a CORS decision: CORS asks a browser not to expose a
response it already received, whereas this refuses to produce one, so a future-widened origin allowlist
cannot become an exfiltration path for internal mastery state. It is a command-line tool.

**The invariant: the deployed lambda never serves this route.** It is asserted in
`tests/architecture/lesson-mastery-integration.test.ts`, under the describe block _"the local debug
route never reaches the deployed lambda"_, by four independent bans — so no single edit re-opens the
route:

1. the lambda manifest declares no dependency on `@mcat/local-authority`, under any dependency field;
2. no lambda source imports that package or any `debug-state` module, by bare or relative specifier;
3. the lambda's real route table registers no path matching `/debug/`; and
4. no lambda source so much as names `DEBUG_LEARNER_STATE_PATH` — even unrouted, a handler branch on
   that path is one wiring change away from serving it.

A fifth assertion in the same block keeps `services/local-authority/src/index.ts` from re-exporting
`./debug-state` or `./http-server`, since apps depend on that index. The bans import `ROUTES` and
`DEBUG_LEARNER_STATE_PATH` from production code and a companion assertion checks that both are
non-trivial, so a ban cannot pass by comparing nothing against nothing.

> **Read the assertions, do not restate their existence.** This paragraph describes _the invariant and
> where it is enforced_, deliberately, and not the state of any comment or README. The same sentence
> about this guard has now been wrong in three different ways: it claimed a test that did not exist, was
> corrected to say one was owed, and then went stale when the test landed. A doc that tracks another
> file's wording will always drift one edit behind it. If you need to know the current coverage, the
> describe block above is the answer and this document is not.
