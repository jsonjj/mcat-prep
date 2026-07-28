import type { ZodIssue } from 'zod';
import {
  LessonItemBindingSchema,
  hasEligibleEvidenceMode,
  type AcceptedLessonObservation,
  type BktQualificationRejectionCode,
  type BktQualificationResult,
  type CandidateEvidenceMode,
  type EventId,
  type IdempotencyKey,
  type LearnerId,
  type LessonItemBinding,
  type LessonItemId,
  type LessonRuntimeResponseFacts,
  type PolicyVersion,
  type SkillCluster,
  type UtcTimestamp,
} from '@mcat/contracts';
import type { EvidenceConditions, EvidenceKind, EvidenceOutcome, EvidenceRecord } from './evidence';

/**
 * The single lesson → mastery seam.
 *
 * Two responsibilities, both pure:
 *
 * 1. `normalizeAuthoredLessonBinding` is the ONLY snake_case → camelCase boundary
 *    for authored lesson artifacts. It is production code precisely so that the
 *    three-lesson conformance test and the runtime path cannot diverge.
 * 2. `adaptLessonResponse` turns one immutable binding plus one set of runtime
 *    response facts into an `AcceptedLessonObservation`, an optional
 *    `EvidenceRecord`, and an optional `QualifiedBktObservation`.
 *
 * Invariants this module exists to hold:
 *
 * - A lesson author can never assert independence, a `P(L)`, a mastery level, or
 *   that BKT should move. Every one of those is derived here from binding
 *   metadata plus runtime facts.
 * - Adding lesson 5, 40, or 114 requires zero code here. Nothing branches on a
 *   lesson id, a KC id, an id format, an item count, or an item ordering.
 * - Ambiguity fails closed: no BKT observation plus a code from the frozen
 *   `BKT_QUALIFICATION_REJECTION_CODES` list.
 * - No I/O, no clock reads, no randomness. Timestamps, ids, the resolved cluster
 *   and the server scoring resolution all arrive as inputs.
 */

// ---------------------------------------------------------------------------
// Authored artifact normalization
// ---------------------------------------------------------------------------

export type MeasurementKind = 'MEASURABLE' | 'NON_MEASURABLE';

type AuthoredRecord = Readonly<Record<string, unknown>>;
type MutableRecord = Record<string, unknown>;

/**
 * Author keys this normalizer understands. An artifact key outside this set is
 * reported rather than silently dropped, so a new authoring key has to be mapped
 * deliberately instead of disappearing on the way to the contract.
 */
export const RECOGNIZED_AUTHORED_BINDING_KEYS: ReadonlySet<string> = new Set([
  'activity_id',
  'activity_role',
  'answer_authority_ref',
  'assistance_available',
  'assistance_state',
  'authored_assistance_level',
  'binding_version',
  'candidate_evidence_modes',
  'changed_dimension',
  'changed_dimension_detail',
  'changed_dimensions',
  'construct_preserving_change',
  'decisive_cue_id',
  'distractor_lineage_id',
  'dok_level',
  'evidence_eligibility',
  'exact_reentry_for',
  'exit_function',
  'feedback_release',
  'feedback_release_point',
  'first_attempt_immutable',
  'first_attempt_policy',
  'freshness_divergence',
  'freshness_policy',
  'freshness_rule',
  'hint_availability',
  'hint_policy',
  'hint_reveal_availability',
  'invalid_item_behavior',
  'invalid_item_policy',
  'item_binding_id',
  'item_version',
  'learner_operation',
  'learner_safe_item_ref',
  'learner_safe_projection',
  'learner_safe_projection_ref',
  'learner_safe_prompt_ref',
  'near_or_changed_function',
  'omission_behavior',
  'omission_policy',
  'primary_kc_id',
  'publication_eligibility',
  'question_id',
  'rationale_authority_ref',
  'reasoning_operation',
  'representation_family_id',
  'representation_id',
  'response_feature_routes',
  'response_mode',
  'retry_behavior',
  'retry_policy',
  'reveal_availability',
  'reveal_behavior',
  'scope_operation_tags',
  'secondary_kc_mappings',
  'secondary_kc_refs',
  'semantic_family_id',
  'semantic_structure',
  'server_answer_authority_ref',
  'server_only_answer_authority_ref',
  'server_rationale_authority_ref',
  'server_scoring_authority_ref',
  'solution_path_lineage_id',
  'stimulus_lineage',
  'stimulus_lineage_id',
]);

/**
 * Legacy evidence-eligibility labels. Every one of them normalizes to
 * instructional-only: none of these artifacts carries the governed
 * `reasoningOperation` that any eligible mode requires, so treating them as
 * anything else would be a default-allow.
 */
const LEGACY_EVIDENCE_MODE_ALIASES: Readonly<Record<string, readonly CandidateEvidenceMode[]>> = {
  INSTRUCTION_TELEMETRY_ONLY: ['INSTRUCTIONAL'],
  NON_EXIT_INSTRUCTIONAL_ONLY: ['INSTRUCTIONAL'],
  INSTRUCTIONAL_ONLY: ['INSTRUCTIONAL'],
  INSTRUCTIONAL_EXIT_ONLY: ['INSTRUCTIONAL'],
};

const LEARNER_SAFE_PROJECTION_KEY_ALIASES: Readonly<Record<string, string>> = {
  representation_id: 'representationId',
  response_field_ids: 'responseFieldIds',
};

const RESPONSE_FEATURE_ROUTE_KEY_ALIASES: Readonly<Record<string, string>> = {
  response_option_index: 'responseOptionIndex',
  response_field_id: 'responseFieldId',
  response_pattern_id: 'responsePatternId',
  response_feature_id: 'responseFeatureId',
  route_kind: 'routeKind',
  repair_feature_id: 'repairFeatureId',
};

const FRESHNESS_DIVERGENCE_KEY_ALIASES: Readonly<Record<string, string>> = {
  changed_from_item_binding_id: 'changedFromItemBindingId',
  stimulus_difference: 'stimulusDifference',
  solution_path_difference: 'solutionPathDifference',
  distractor_difference: 'distractorDifference',
};

const asRecord = (value: unknown): MutableRecord | undefined =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as MutableRecord)
    : undefined;

const pick = (record: AuthoredRecord, ...keys: readonly string[]): unknown => {
  for (const key of keys) {
    if (record[key] !== undefined) return record[key];
  }
  return undefined;
};

const setIfDefined = (target: MutableRecord, key: string, value: unknown): void => {
  if (value !== undefined) target[key] = value;
};

/** Rename known snake_case keys; anything unknown is passed through verbatim so
 * a `.strict()` contract shape rejects it instead of the adapter swallowing it. */
const renameKeys = (value: unknown, aliases: Readonly<Record<string, string>>): unknown => {
  const raw = asRecord(value);
  if (raw === undefined) return value;

  const renamed: MutableRecord = {};
  for (const [key, nested] of Object.entries(raw)) {
    renamed[aliases[key] ?? key] = nested;
  }
  return renamed;
};

const asOpenStringArray = (value: unknown): unknown => {
  if (Array.isArray(value)) return value;
  return typeof value === 'string' ? [value] : undefined;
};

const normalizeCandidateEvidenceModes = (value: unknown): unknown => {
  // Absent or null falls through to the contract default of `['INSTRUCTIONAL']`,
  // which is the least permissive declaration available.
  if (value === undefined || value === null) return undefined;

  const entries: readonly unknown[] = Array.isArray(value) ? value : [value];
  const expanded = entries.flatMap((entry) =>
    typeof entry === 'string' ? [...(LEGACY_EVIDENCE_MODE_ALIASES[entry] ?? [entry])] : [entry],
  );
  return [...new Set(expanded)];
};

const normalizeLearnerSafeItemRef = (value: unknown): unknown => {
  const raw = asRecord(value);
  // A ref is opaque: never parsed, never reformatted. Only an inline projection
  // is key-mapped, and its unknown keys survive so answer-bearing material is
  // rejected by the strict projection shape rather than quietly accepted.
  if (raw === undefined) return value;

  const projection = asRecord(renameKeys(raw, LEARNER_SAFE_PROJECTION_KEY_ALIASES)) ?? {};
  if (Array.isArray(projection.choices)) {
    projection.choices = projection.choices.map((choice) => {
      const rawChoice = asRecord(choice);
      return rawChoice === undefined ? choice : { ...rawChoice };
    });
  }
  return projection;
};

const normalizeResponseFeatureRoutes = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map((route) => renameKeys(route, RESPONSE_FEATURE_ROUTE_KEY_ALIASES))
    : value;

/**
 * A worked example is exposition, not an attempt. The role alone decides this:
 * an authored first-attempt policy string is reviewed prose and must not be a
 * load-bearing discriminator.
 */
const measurementKindFor = (raw: AuthoredRecord): MeasurementKind =>
  raw.activity_role === 'WORKED_EXAMPLE' ? 'NON_MEASURABLE' : 'MEASURABLE';

export interface AuthoredLessonEnvelope {
  readonly lessonId: string;
  /** Lesson envelope `artifact_version`; the fallback when a binding omits its own version. */
  readonly artifactVersion?: string | undefined;
}

export interface NormalizedAuthoredBinding {
  readonly measurementKind: MeasurementKind;
  /** Contract-shaped but unvalidated; feed it to `LessonItemBindingSchema`. */
  readonly value: MutableRecord;
}

/** Author keys this normalizer does not map. Empty means full coverage. */
export const unrecognizedAuthoredBindingKeys = (raw: AuthoredRecord): readonly string[] =>
  Object.keys(raw).filter((key) => !RECOGNIZED_AUTHORED_BINDING_KEYS.has(key));

/** snake_case authored binding → camelCase `LessonItemBinding` input. */
export function normalizeAuthoredLessonBinding(
  envelope: AuthoredLessonEnvelope,
  raw: AuthoredRecord,
): NormalizedAuthoredBinding {
  const measurementKind = measurementKindFor(raw);
  const value: MutableRecord = { measurementKind, lessonId: envelope.lessonId };

  setIfDefined(value, 'itemBindingId', raw.item_binding_id);
  setIfDefined(
    value,
    'bindingVersion',
    pick(raw, 'binding_version', 'item_version') ?? envelope.artifactVersion,
  );
  setIfDefined(value, 'primaryKcId', raw.primary_kc_id);
  setIfDefined(
    value,
    'secondaryKcMappings',
    pick(raw, 'secondary_kc_mappings', 'secondary_kc_refs') ?? [],
  );
  setIfDefined(value, 'secondaryKcRefs', raw.secondary_kc_refs);
  setIfDefined(value, 'activityRole', raw.activity_role);
  setIfDefined(value, 'semanticFamilyId', raw.semantic_family_id);

  const lineage = pick(raw, 'stimulus_lineage_id', 'stimulus_lineage');
  const lineageRecord = asRecord(lineage);
  setIfDefined(
    value,
    'stimulusLineageId',
    lineageRecord === undefined ? lineage : lineageRecord.lineage_id,
  );

  setIfDefined(
    value,
    'authoredAssistanceAffordances',
    asOpenStringArray(
      pick(raw, 'assistance_available', 'assistance_state', 'authored_assistance_level'),
    ),
  );
  setIfDefined(
    value,
    'candidateEvidenceModes',
    normalizeCandidateEvidenceModes(pick(raw, 'candidate_evidence_modes', 'evidence_eligibility')),
  );
  setIfDefined(value, 'reasoningOperation', raw.reasoning_operation);
  setIfDefined(value, 'dokLevel', raw.dok_level);
  setIfDefined(value, 'representationId', raw.representation_id);
  setIfDefined(value, 'representationFamilyId', raw.representation_family_id);

  // Canonical dimensions are authored or absent. Prose is never parsed into them.
  setIfDefined(value, 'changedDimensions', raw.changed_dimensions ?? []);
  const changedDimensionDetail =
    pick(raw, 'changed_dimension_detail', 'changed_dimension') ??
    asRecord(raw.construct_preserving_change)?.changed_dimension;
  setIfDefined(
    value,
    'changedDimensionDetail',
    changedDimensionDetail === null ? undefined : changedDimensionDetail,
  );

  setIfDefined(value, 'learnerOperation', raw.learner_operation);
  setIfDefined(value, 'semanticStructure', raw.semantic_structure);
  setIfDefined(
    value,
    'learnerSafeItemRef',
    normalizeLearnerSafeItemRef(
      pick(
        raw,
        'learner_safe_item_ref',
        'learner_safe_projection_ref',
        'learner_safe_projection',
        'learner_safe_prompt_ref',
      ),
    ),
  );

  setIfDefined(
    value,
    'hintPolicy',
    pick(
      raw,
      'hint_policy',
      'hint_availability',
      'hint_reveal_availability',
      'reveal_availability',
    ),
  );
  setIfDefined(value, 'feedbackRelease', pick(raw, 'feedback_release', 'feedback_release_point'));
  setIfDefined(value, 'omissionPolicy', pick(raw, 'omission_policy', 'omission_behavior'));
  setIfDefined(value, 'retryPolicy', pick(raw, 'retry_policy', 'retry_behavior'));
  setIfDefined(
    value,
    'invalidItemPolicy',
    pick(raw, 'invalid_item_policy', 'invalid_item_behavior'),
  );
  setIfDefined(value, 'exitFunction', pick(raw, 'exit_function', 'near_or_changed_function'));
  setIfDefined(value, 'freshnessPolicy', pick(raw, 'freshness_policy', 'freshness_rule'));
  setIfDefined(value, 'publicationEligibility', raw.publication_eligibility);
  setIfDefined(value, 'solutionPathLineageId', raw.solution_path_lineage_id);
  setIfDefined(value, 'decisiveCueId', raw.decisive_cue_id);
  setIfDefined(value, 'distractorLineageId', raw.distractor_lineage_id);
  setIfDefined(
    value,
    'responseFeatureRoutes',
    normalizeResponseFeatureRoutes(raw.response_feature_routes),
  );
  setIfDefined(value, 'exactReentryFor', raw.exact_reentry_for);
  setIfDefined(value, 'scopeOperationTags', raw.scope_operation_tags);
  setIfDefined(
    value,
    'freshnessDivergence',
    renameKeys(raw.freshness_divergence, FRESHNESS_DIVERGENCE_KEY_ALIASES),
  );
  setIfDefined(value, 'responseMode', raw.response_mode);

  if (measurementKind === 'MEASURABLE') {
    setIfDefined(value, 'questionId', pick(raw, 'question_id', 'item_binding_id'));
    setIfDefined(value, 'activityId', raw.activity_id);
    if (raw.first_attempt_immutable === true || raw.first_attempt_policy === 'IMMUTABLE') {
      value.firstAttemptImmutable = true;
    }
    setIfDefined(
      value,
      'serverScoringAuthorityRef',
      pick(
        raw,
        'server_scoring_authority_ref',
        'server_only_answer_authority_ref',
        'server_answer_authority_ref',
        'answer_authority_ref',
      ) ?? undefined,
    );
    setIfDefined(
      value,
      'serverRationaleAuthorityRef',
      pick(raw, 'server_rationale_authority_ref', 'rationale_authority_ref') ?? undefined,
    );
  }

  return { measurementKind, value };
}

export type AuthoredLessonBindingParse =
  | {
      readonly status: 'parsed';
      readonly measurementKind: MeasurementKind;
      readonly binding: LessonItemBinding;
    }
  | {
      readonly status: 'invalid';
      readonly measurementKind: MeasurementKind;
      readonly issues: readonly ZodIssue[];
      readonly normalized: MutableRecord;
    };

/** Normalize then validate an authored binding. Never throws. */
export function parseAuthoredLessonBinding(
  envelope: AuthoredLessonEnvelope,
  raw: AuthoredRecord,
): AuthoredLessonBindingParse {
  const normalized = normalizeAuthoredLessonBinding(envelope, raw);
  const parsed = LessonItemBindingSchema.safeParse(normalized.value);
  return parsed.success
    ? { status: 'parsed', measurementKind: normalized.measurementKind, binding: parsed.data }
    : {
        status: 'invalid',
        measurementKind: normalized.measurementKind,
        issues: parsed.error.issues,
        normalized: normalized.value,
      };
}

// ---------------------------------------------------------------------------
// Derivations
// ---------------------------------------------------------------------------

/**
 * Independence is a fact about the administration, never about what the item
 * offered. `authoredAssistanceAffordances` is deliberately not read here.
 */
export const isIndependentAdministration = (response: LessonRuntimeResponseFacts): boolean =>
  response.assistanceLevel === 'A0' &&
  !response.contentBearingHintUsed &&
  !response.revealUsed &&
  !response.isRetry &&
  !response.isDiagnosticRetry;

const EVIDENCE_KIND_BY_CANDIDATE_MODE: Readonly<Record<CandidateEvidenceMode, EvidenceKind>> = {
  INSTRUCTIONAL: 'instruction',
  INSTRUCTIONAL_EXIT: 'instruction',
  REHEARSAL_ONLY: 'instruction',
  REPAIR_CONFIRMATION: 'instruction',
  DIAGNOSTIC: 'placement',
  ENTRY: 'placement',
  INDEPENDENT: 'independent',
  TRANSFER: 'transfer',
  DELAYED: 'delayed',
  MIXED: 'mixed',
  PASSAGE: 'integrated_passage',
  TIMED: 'timed',
  PROTECTED: 'protected',
};

/**
 * Least-credit-first. A binding declaring several modes is classified by the one
 * that earns the least mastery credit, so a broad permission set can never
 * upgrade a record's evidence quality.
 */
const CONSERVATIVE_EVIDENCE_MODE_ORDER: readonly CandidateEvidenceMode[] = [
  'INSTRUCTIONAL',
  'INSTRUCTIONAL_EXIT',
  'REHEARSAL_ONLY',
  'REPAIR_CONFIRMATION',
  'DIAGNOSTIC',
  'ENTRY',
  'INDEPENDENT',
  'TRANSFER',
  'DELAYED',
  'MIXED',
  'PASSAGE',
  'TIMED',
  'PROTECTED',
];

/** Evidence classification: assisted administration outranks any declared mode. */
export const deriveEvidenceKind = (
  modes: readonly CandidateEvidenceMode[],
  response: LessonRuntimeResponseFacts,
): EvidenceKind => {
  if (response.isDiagnosticRetry) return 'diagnostic_retry';
  if (!isIndependentAdministration(response)) return 'instruction';

  for (const mode of CONSERVATIVE_EVIDENCE_MODE_ORDER) {
    if (modes.includes(mode)) return EVIDENCE_KIND_BY_CANDIDATE_MODE[mode];
  }
  return 'instruction';
};

// ---------------------------------------------------------------------------
// Response adaptation
// ---------------------------------------------------------------------------

/**
 * `SERVER_ITEM_VERSION_RESOLUTION`: the caller resolves a positive integer
 * `serverItemVersion` and the scored outcome from `serverScoringAuthorityRef`.
 * The opaque `bindingVersion` string is never parsed, coerced, or hashed.
 */
export type ServerScoringResolution =
  | {
      readonly scoringValid: true;
      readonly serverItemVersion: number;
      readonly outcome: EvidenceOutcome;
    }
  | { readonly scoringValid: false };

export interface LessonResponseIdentity {
  readonly observationId: string;
  readonly eventId: EventId;
  readonly learnerId: LearnerId;
  readonly idempotencyKey: IdempotencyKey;
  readonly evidenceId: string;
}

export interface LessonResponseAdapterInput {
  /** Absent when no immutable binding resolves for the response. */
  readonly binding: LessonItemBinding | null | undefined;
  readonly response: LessonRuntimeResponseFacts;
  readonly scoring: ServerScoringResolution;
  readonly identity: LessonResponseIdentity;
  /** Caller-resolved lesson → cluster routing; `@mcat/domain` must not import `@mcat/content`. */
  readonly cluster: SkillCluster;
  /** Lesson envelope `artifact_version`, used when the binding omits `bindingVersion`. */
  readonly envelopeBindingVersion: string;
  readonly acceptedAt: UtcTimestamp;
  readonly sequence: number;
  readonly contentRelease: string;
  readonly policies: readonly PolicyVersion[];
  readonly accommodations?: readonly string[];
  readonly delayHours?: number;
}

export interface LessonResponseAdaptation {
  /**
   * `binding_unresolved` and `not_measurable` produce no observation, no
   * evidence, and no BKT observation.
   */
  readonly status: 'adapted' | 'not_measurable' | 'binding_unresolved';
  readonly observation: AcceptedLessonObservation | null;
  readonly evidence: EvidenceRecord | null;
  readonly qualification: BktQualificationResult;
}

const rejected = (
  rejectionCodes: readonly BktQualificationRejectionCode[],
): BktQualificationResult => ({ status: 'rejected', rejectionCodes });

export function adaptLessonResponse(input: LessonResponseAdapterInput): LessonResponseAdaptation {
  const { binding, response, scoring } = input;

  if (binding === null || binding === undefined) {
    return {
      status: 'binding_unresolved',
      observation: null,
      evidence: null,
      qualification: rejected(['BINDING_NOT_FOUND']),
    };
  }

  if (binding.measurementKind !== 'MEASURABLE') {
    // Exposition. The frozen code list has no exposition member, and a worked
    // example has no first attempt to preserve, so that is the honest fit; the
    // `not_measurable` status carries the real reason.
    return {
      status: 'not_measurable',
      observation: null,
      evidence: null,
      qualification: rejected(['FIRST_ATTEMPT_NOT_IMMUTABLE']),
    };
  }

  const bindingVersion = binding.bindingVersion ?? input.envelopeBindingVersion;
  if (bindingVersion.length === 0) {
    return {
      status: 'binding_unresolved',
      observation: null,
      evidence: null,
      qualification: rejected(['BINDING_NOT_FOUND']),
    };
  }

  // A failed scoring resolution cannot assert correctness, so it fails closed to
  // `omitted` rather than guessing.
  const outcome: EvidenceOutcome = scoring.scoringValid ? scoring.outcome : 'omitted';

  const observation: AcceptedLessonObservation = {
    observationId: input.identity.observationId,
    eventId: input.identity.eventId,
    learnerId: input.identity.learnerId,
    idempotencyKey: input.identity.idempotencyKey,
    binding,
    response,
    bindingVersion,
    ...(scoring.scoringValid ? { serverItemVersion: scoring.serverItemVersion } : {}),
    outcome,
    scoringValid: scoring.scoringValid,
    acceptedAt: input.acceptedAt,
    sequence: input.sequence,
    contentRelease: input.contentRelease,
    policies: [...input.policies],
  };

  const rejectionCodes: BktQualificationRejectionCode[] = [];

  if (response.bindingVersion !== bindingVersion) rejectionCodes.push('BINDING_VERSION_MISMATCH');
  if (binding.firstAttemptImmutable !== true) rejectionCodes.push('FIRST_ATTEMPT_NOT_IMMUTABLE');

  if (!hasEligibleEvidenceMode(binding)) {
    rejectionCodes.push('INDEPENDENT_EVIDENCE_MODE_NOT_DECLARED');
  } else if (binding.reasoningOperation === undefined) {
    rejectionCodes.push('ELIGIBLE_BINDING_MISSING_REASONING_OPERATION');
  }

  // Exactly one meaning: no `serverItemVersion` mapping resolved from
  // `serverScoringAuthorityRef`. It is the only condition that suppresses the
  // evidence record as well as the BKT observation.
  //
  // An omission is NOT this. `omitted` is a scored outcome that becomes
  // `correct: false`; a clean independent first attempt that produced no answer
  // is real capability evidence, and excluding it would put survivorship bias
  // straight into P(L).
  if (!scoring.scoringValid) rejectionCodes.push('SERVER_SCORING_INVALID');

  if (response.attemptIndex !== 1) rejectionCodes.push('NOT_FIRST_ATTEMPT');
  if (response.assistanceLevel !== 'A0') rejectionCodes.push('ASSISTANCE_NOT_A0');
  if (response.contentBearingHintUsed) rejectionCodes.push('CONTENT_BEARING_HINT_USED');
  if (response.revealUsed) rejectionCodes.push('REVEAL_USED');
  if (response.isRetry || response.isDiagnosticRetry) rejectionCodes.push('RETRY_USED');

  const conditions: EvidenceConditions = {
    mixed: binding.candidateEvidenceModes.includes('MIXED'),
    passage: binding.candidateEvidenceModes.includes('PASSAGE'),
    timed: binding.candidateEvidenceModes.includes('TIMED'),
    protected: binding.candidateEvidenceModes.includes('PROTECTED'),
    accommodations: [...(input.accommodations ?? [])],
  };

  const evidence: EvidenceRecord | null = scoring.scoringValid
    ? {
        evidenceId: input.identity.evidenceId,
        skillId: binding.primaryKcId,
        cluster: input.cluster,
        // `operation` is the `OperationTag` authoring-analysis axis, a different
        // axis from the mastery `ReasoningOperation`. Lesson evidence omits it.
        kind: deriveEvidenceKind(binding.candidateEvidenceModes, response),
        independent: isIndependentAdministration(response),
        assistanceLevel: response.assistanceLevel,
        contentBearingHint: response.contentBearingHintUsed,
        questionId: binding.questionId,
        itemVersion: scoring.serverItemVersion,
        familyId: binding.semanticFamilyId,
        ...(binding.stimulusLineageId === undefined
          ? {}
          : { stimulusId: binding.stimulusLineageId as LessonItemId }),
        changeDimensions: [...binding.changedDimensions],
        ...(input.delayHours === undefined ? {} : { delayHours: input.delayHours }),
        conditions,
        outcome,
        valid: true,
        occurredAt: response.occurredAt,
        sequence: input.sequence,
        contentRelease: input.contentRelease,
        policies: [...input.policies],
      }
    : null;

  if (rejectionCodes.length > 0 || !scoring.scoringValid) {
    return { status: 'adapted', observation, evidence, qualification: rejected(rejectionCodes) };
  }

  /* c8 ignore next 3 -- unreachable: an empty code list guarantees both. */
  if (binding.reasoningOperation === undefined) {
    return { status: 'adapted', observation, evidence, qualification: rejected(rejectionCodes) };
  }

  return {
    status: 'adapted',
    observation,
    evidence,
    qualification: {
      status: 'qualified',
      observation: {
        observationId: input.identity.observationId,
        questionId: binding.questionId,
        itemBindingId: binding.itemBindingId,
        bindingVersion,
        serverItemVersion: scoring.serverItemVersion,
        primaryKcId: binding.primaryKcId,
        reasoningOperation: binding.reasoningOperation,
        correct: outcome === 'correct',
        ...(binding.dokLevel === undefined ? {} : { dokLevel: binding.dokLevel }),
        occurredAt: response.occurredAt,
        sequence: input.sequence,
        contentRelease: input.contentRelease,
        policies: [...input.policies],
      },
    },
  };
}
