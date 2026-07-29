import type { ZodIssue } from 'zod';
import {
  LessonItemBindingSchema,
  hasEligibleEvidenceMode,
  type AcceptedLessonObservation,
  type AssistanceLevel,
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
import {
  CONTEXTUAL_ONLY_KINDS,
  boundOccurredAtToServerTime,
  type EvidenceConditions,
  type EvidenceKind,
  type EvidenceOutcome,
  type EvidenceRecord,
} from './evidence';

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
 * - ONE notion of BKT eligibility, and it is the RESOLVED evidence kind. The
 *   evidence record and the qualification gate read the same derived value, so
 *   `P(L)` cannot move on a warrant the evidence system classifies as
 *   contextual-only. A declared mode set is a permission, never a finding.
 * - An authored contradiction is rejected, never resolved by key precedence. Two
 *   authored keys that assert incompatible things about the same item produce a
 *   named `AUTHORED_BINDING_REJECTION_CODES` code, because the alternative is
 *   that one of the two facts disappears without a word.
 * - A runner-reported time can never become a warrant timestamp. Evidence takes
 *   a server-bounded `occurredAt`, enforced by the brand on that field rather
 *   than by remembering to bound it.
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
 * Authored contradictions the normalizer refuses to resolve.
 *
 * Separate from `BKT_QUALIFICATION_REJECTION_CODES`, which judges one runtime
 * response: these judge the authored artifact itself, before any response
 * exists. Each member names a pair of authored facts that cannot both hold, and
 * each one exists because the alternative — letting key precedence pick a winner
 * — deletes the loser in silence. The frozen registry is
 * `.superpowers/sdd/field-lock.md`.
 */
export const AUTHORED_BINDING_REJECTION_CODES = [
  'MULTIPLE_LEARNER_SAFE_ITEM_SOURCES_AUTHORED',
  'CONTRADICTORY_FIRST_ATTEMPT_IMMUTABILITY_AUTHORED',
  'CONTRADICTORY_EVIDENCE_MODE_RESTRICTION_AUTHORED',
  'MULTIPLE_SCORING_AUTHORITY_REFS_AUTHORED',
  'CONTRADICTORY_BINDING_VERSION_AUTHORED',
  'CONTRADICTORY_STIMULUS_LINEAGE_AUTHORED',
] as const;
export type AuthoredBindingRejectionCode = (typeof AUTHORED_BINDING_REJECTION_CODES)[number];

/**
 * Every authoring spelling of the ONE learner-safe item, in `pick` precedence
 * order. D6: the learner-safe item is either an opaque ref or an inline
 * projection, so exactly one of these may be authored. The contradiction guard
 * below and the normalizer both read this list, so the set that is collapsed and
 * the set that is counted cannot drift apart.
 */
const LEARNER_SAFE_ITEM_AUTHOR_KEYS: readonly string[] = [
  'learner_safe_item_ref',
  'learner_safe_projection_ref',
  'learner_safe_projection',
  'learner_safe_prompt_ref',
];

/**
 * The one `first_attempt_policy` spelling that stands in for a missing boolean.
 *
 * §3.1 says the prose MUST NOT be a load-bearing discriminator, and it is right,
 * but most authored bindings on disk carry this string and no boolean at all — so
 * deleting the alias would silently demote every one of them to a mutable first
 * attempt. It is demoted instead of removed: a FALLBACK read only when no
 * boolean was authored, never an override, and the pair that disagrees rejects.
 */
const PROSE_IMMUTABLE = 'IMMUTABLE';

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

/**
 * An `A0`–`A3` string in an authoring affordance field is an assistance *level*
 * the author had in mind, not help the item *offers*. Copying it through
 * verbatim would re-conflate the two facts the contract deliberately separated,
 * and would leave a value sitting in `authoredAssistanceAffordances` that a
 * later reader could parse straight back into an `AssistanceLevel` and mistake
 * for the runtime fact.
 *
 * So it is tagged rather than laundered: the authored value is preserved for
 * audit, the array stays non-empty, and the result can no longer be read as an
 * `AssistanceLevel` by construction. Only `response.assistanceLevel` ever
 * decides independence.
 */
const AUTHORED_ASSISTANCE_LEVEL_TAG = 'AUTHORED_ASSISTANCE_LEVEL_';
const AUTHORED_ASSISTANCE_LEVELS: ReadonlySet<string> = new Set(['A0', 'A1', 'A2', 'A3']);

const tagAuthoredAssistanceLevel = (value: unknown): unknown =>
  typeof value === 'string' && AUTHORED_ASSISTANCE_LEVELS.has(value)
    ? `${AUTHORED_ASSISTANCE_LEVEL_TAG}${value}`
    : value;

const normalizeAssistanceAffordances = (value: unknown): unknown => {
  const entries = Array.isArray(value) ? value : typeof value === 'string' ? [value] : undefined;
  return entries?.map(tagAuthoredAssistanceLevel);
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

/** The lineage id behind either spelling: a bare string, or a lineage object. */
const resolveStimulusLineageId = (value: unknown): unknown => {
  const record = asRecord(value);
  return record === undefined ? value : record.lineage_id;
};

/**
 * Author keys that are alternative SPELLINGS of one normalized fact.
 *
 * Not a list of keys that happen to write the same field — `question_id` and
 * `item_binding_id` do that and are deliberately absent, because
 * `item_binding_id` is a fallback DERIVATION that also survives in its own
 * `itemBindingId` field, so an explicit `question_id` differing from it loses
 * nothing and is normal authoring. These four are different: each group's keys
 * make the same claim, only one value can be true, and the loser used to vanish.
 *
 * `resolve` maps a raw authored value to the FACT it asserts, so agreement is
 * judged on meaning rather than spelling — a legacy `INSTRUCTIONAL_ONLY` label
 * agrees with a canonical `['INSTRUCTIONAL']` and parses.
 *
 * `keys` is in `pick` precedence order AND is what the contradiction guard
 * counts, so the set that is collapsed and the set that is checked cannot drift
 * apart. That drift is how `unrecognizedAuthoredBindingKeys` came to be dead.
 */
interface AuthoredAliasGroup {
  readonly code: AuthoredBindingRejectionCode;
  /** Contract-shaped, so a reader sees the field name Zod would have reported. */
  readonly path: string;
  readonly keys: readonly string[];
  readonly resolve: (value: unknown) => unknown;
  /** What the group asserts, for the rejection message. */
  readonly fact: string;
}

const AUTHORED_ALIAS_GROUPS = {
  /**
   * A RESTRICTION and a PERMISSION competing for one field, which is why the
   * legacy key is first: every value it carries in the corpus normalizes to
   * instructional-only, so if precedence is ever reachable again it degrades
   * rather than escalates. The guard makes the order moot for a disagreement,
   * and that is the point of rejecting rather than clamping — deciding which
   * side is "more restrictive" needs a total order over mode sets that does not
   * exist, while refusing the pair needs no such order.
   */
  candidateEvidenceModes: {
    code: 'CONTRADICTORY_EVIDENCE_MODE_RESTRICTION_AUTHORED',
    path: 'candidateEvidenceModes',
    keys: ['evidence_eligibility', 'candidate_evidence_modes'],
    resolve: (value) => normalizeCandidateEvidenceModes(value),
    fact: 'what this item may serve as',
  },
  /**
   * Four spellings of where the protected answer key lives. A disagreement
   * resolved by precedence points scoring at one of two authorities, and the
   * scored outcome plus `serverItemVersion` both come from whichever won.
   */
  serverScoringAuthorityRef: {
    code: 'MULTIPLE_SCORING_AUTHORITY_REFS_AUTHORED',
    path: 'serverScoringAuthorityRef',
    keys: [
      'server_scoring_authority_ref',
      'server_only_answer_authority_ref',
      'server_answer_authority_ref',
      'answer_authority_ref',
    ],
    resolve: (value) => value,
    fact: 'which scoring authority owns this item',
  },
  /** Two version strings cannot both be the version `response.bindingVersion` must match. */
  bindingVersion: {
    code: 'CONTRADICTORY_BINDING_VERSION_AUTHORED',
    path: 'bindingVersion',
    keys: ['binding_version', 'item_version'],
    resolve: (value) => value,
    fact: "this binding's version",
  },
  /** Compared on the resolved id, so `{ lineage_id: 'X' }` agrees with `'X'`. */
  stimulusLineageId: {
    code: 'CONTRADICTORY_STIMULUS_LINEAGE_AUTHORED',
    path: 'stimulusLineageId',
    keys: ['stimulus_lineage_id', 'stimulus_lineage'],
    resolve: resolveStimulusLineageId,
    fact: 'which stimulus this item reuses',
  },
  // `satisfies` rather than an annotation, so each group is a known property and
  // the normalizer's reads below are not `| undefined` under
  // `noUncheckedIndexedAccess`.
} as const satisfies Readonly<Record<string, AuthoredAliasGroup>>;

/** First authored value in precedence order, from the group's own key list. */
const pickAlias = (raw: AuthoredRecord, group: AuthoredAliasGroup): unknown =>
  pick(raw, ...group.keys);

/**
 * A resolved fact as a comparable string. Arrays of strings compare as SETS —
 * `['A','B']` and `['B','A']` are the same permission set, and rejecting that as
 * a disagreement would refuse sound authoring.
 */
const comparableFact = (resolved: unknown): string =>
  Array.isArray(resolved) && resolved.every((entry) => typeof entry === 'string')
    ? JSON.stringify([...(resolved as readonly string[])].sort())
    : JSON.stringify(resolved);

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
  /**
   * Authored contradictions found in `raw`. Non-empty means `value` is NOT a
   * faithful projection of the artifact — a contradictory key was collapsed away
   * — so it must not be parsed and accepted. Travels with the normalized record
   * so neither entry point into this module can be silent about it.
   */
  readonly rejectionCodes: readonly AuthoredBindingRejectionCode[];
}

interface AuthoredBindingContradiction {
  readonly code: AuthoredBindingRejectionCode;
  /** Contract-shaped, so a reader sees the field name Zod would have reported. */
  readonly path: readonly string[];
  readonly message: string;
}

/**
 * Authored facts that contradict each other.
 *
 * This is adjudicated here rather than by the contract because the normalized
 * record structurally cannot carry the contradiction: `learnerSafeItemRef` is one
 * field, so by the time `LessonItemBindingSchema` sees it the second authored
 * source is already gone and the shape looks perfectly valid.
 */
const authoredBindingContradictions = (
  raw: AuthoredRecord,
): readonly AuthoredBindingContradiction[] => {
  const contradictions: AuthoredBindingContradiction[] = [];

  // `null` is the authored spelling of "not applicable" here as everywhere else
  // in this normalizer, so it is absence rather than a second source.
  const learnerSafeSources = LEARNER_SAFE_ITEM_AUTHOR_KEYS.filter(
    (key) => raw[key] !== undefined && raw[key] !== null,
  );
  if (learnerSafeSources.length > 1) {
    contradictions.push({
      code: 'MULTIPLE_LEARNER_SAFE_ITEM_SOURCES_AUTHORED',
      path: ['learnerSafeItemRef'],
      message: `MULTIPLE_LEARNER_SAFE_ITEM_SOURCES_AUTHORED: one learner-safe item may be authored once, as an opaque ref OR an inline projection; found ${learnerSafeSources.join(', ')}`,
    });
  }

  // The boolean is the fact and the prose is reviewed text, so the prose must
  // never overrule it — least of all toward the permissive answer, which is what
  // `boolean false || prose 'IMMUTABLE'` used to do without a word.
  if (raw.first_attempt_immutable === false && raw.first_attempt_policy === PROSE_IMMUTABLE) {
    contradictions.push({
      code: 'CONTRADICTORY_FIRST_ATTEMPT_IMMUTABILITY_AUTHORED',
      path: ['firstAttemptImmutable'],
      message: `CONTRADICTORY_FIRST_ATTEMPT_IMMUTABILITY_AUTHORED: first_attempt_immutable is false while first_attempt_policy says ${PROSE_IMMUTABLE}; the boolean is the fact and the prose cannot overrule it`,
    });
  }

  // Alternative spellings of one fact that disagree. Judged on the RESOLVED
  // value, so two spellings of the same fact agree and parse; judged as a set,
  // so authoring order cannot change the verdict either way round.
  for (const group of Object.values(AUTHORED_ALIAS_GROUPS)) {
    const authored = group.keys.filter((key) => raw[key] !== undefined && raw[key] !== null);
    const distinct = new Map<string, string>();
    for (const key of authored) {
      distinct.set(comparableFact(group.resolve(raw[key])), key);
    }
    if (distinct.size > 1) {
      contradictions.push({
        code: group.code,
        path: [group.path],
        message: `${group.code}: ${authored.join(', ')} disagree about ${group.fact}; one binding asserts it once, and precedence must not pick a winner (resolved to ${[...distinct.keys()].join(' vs ')})`,
      });
    }
  }

  return contradictions;
};

/** Author keys this normalizer does not map. Empty means full coverage. */
export const unrecognizedAuthoredBindingKeys = (raw: AuthoredRecord): readonly string[] =>
  Object.keys(raw).filter((key) => !RECOGNIZED_AUTHORED_BINDING_KEYS.has(key));

/**
 * Authored contradictions in a raw binding. Empty means none.
 *
 * Order-independent by construction: it counts the authored sources rather than
 * resolving them, so which key appears first in the artifact cannot change the
 * verdict.
 */
export const authoredBindingRejectionCodes = (
  raw: AuthoredRecord,
): readonly AuthoredBindingRejectionCode[] =>
  authoredBindingContradictions(raw).map((contradiction) => contradiction.code);

/** snake_case authored binding → camelCase `LessonItemBinding` input. */
export function normalizeAuthoredLessonBinding(
  envelope: AuthoredLessonEnvelope,
  raw: AuthoredRecord,
): NormalizedAuthoredBinding {
  const measurementKind = measurementKindFor(raw);
  const contradictions = authoredBindingContradictions(raw);
  const value: MutableRecord = { measurementKind, lessonId: envelope.lessonId };

  setIfDefined(value, 'itemBindingId', raw.item_binding_id);
  setIfDefined(
    value,
    'bindingVersion',
    pickAlias(raw, AUTHORED_ALIAS_GROUPS.bindingVersion) ?? envelope.artifactVersion,
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

  setIfDefined(
    value,
    'stimulusLineageId',
    resolveStimulusLineageId(pickAlias(raw, AUTHORED_ALIAS_GROUPS.stimulusLineageId)),
  );

  setIfDefined(
    value,
    'authoredAssistanceAffordances',
    normalizeAssistanceAffordances(
      pick(raw, 'assistance_available', 'assistance_state', 'authored_assistance_level'),
    ),
  );
  setIfDefined(
    value,
    'candidateEvidenceModes',
    normalizeCandidateEvidenceModes(pickAlias(raw, AUTHORED_ALIAS_GROUPS.candidateEvidenceModes)),
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
    normalizeLearnerSafeItemRef(pick(raw, ...LEARNER_SAFE_ITEM_AUTHOR_KEYS)),
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

  // Attempt-bearing fields are passed through REGARDLESS of role, so the
  // contract's `z.never()` guards on the non-measurable variant are reachable.
  // A binding that calls itself a worked example while carrying a scoring
  // authority ref, an activity, or first-attempt semantics is contradictory and
  // must be rejected loudly, not silently reinterpreted as exposition with its
  // scoring material dropped. `null` is the authored spelling of "not
  // applicable" and is treated as absent, not as a contradiction.
  //
  // The one derivation NOT applied to exposition is the legacy
  // `question_id → item_binding_id` fallback: inventing a question id for a
  // worked example and then rejecting on it would make every worked example
  // contradictory. Only an explicitly authored `question_id` carries through.
  //
  // This pair is DELIBERATELY not an `AUTHORED_ALIAS_GROUPS` member, and the
  // difference matters. The other groups are alternative spellings of one fact,
  // where the loser vanishes. Here `item_binding_id` is a fallback derivation
  // that ALSO lands in its own `itemBindingId` field, so when an author supplies
  // both and they differ, both facts survive to the contract and nothing is
  // dropped — a binding id and an item id are simply not required to match.
  // Rejecting that would refuse correct authoring. The precedence is kept, and
  // `questionId` therefore stays on the architecture test's unguarded record.
  setIfDefined(
    value,
    'questionId',
    measurementKind === 'MEASURABLE'
      ? pick(raw, 'question_id', 'item_binding_id')
      : raw.question_id,
  );
  setIfDefined(value, 'activityId', raw.activity_id ?? undefined);
  // The explicit boolean decides whenever it is authored; the prose is consulted
  // only in its absence. Anything else authored in the boolean's place — `false`,
  // or a non-boolean — leaves the field unset, and the contract's
  // `z.literal(true)` then refuses the measurable binding. Fails closed.
  const authoredFirstAttemptImmutable = raw.first_attempt_immutable ?? undefined;
  if (
    authoredFirstAttemptImmutable === undefined
      ? raw.first_attempt_policy === PROSE_IMMUTABLE
      : authoredFirstAttemptImmutable === true
  ) {
    value.firstAttemptImmutable = true;
  }
  setIfDefined(
    value,
    'serverScoringAuthorityRef',
    pickAlias(raw, AUTHORED_ALIAS_GROUPS.serverScoringAuthorityRef) ?? undefined,
  );
  setIfDefined(
    value,
    'serverRationaleAuthorityRef',
    pick(raw, 'server_rationale_authority_ref', 'rationale_authority_ref') ?? undefined,
  );

  return {
    measurementKind,
    value,
    rejectionCodes: contradictions.map((contradiction) => contradiction.code),
  };
}

export type AuthoredLessonBindingParse = {
  /**
   * Author keys the normalizer did not map, on BOTH branches. Non-optional so a
   * caller cannot fail to see it.
   *
   * Deliberately NOT a rejection. An unmapped key is an authoring-pipeline
   * signal, not evidence that the binding is wrong: rejecting would discard a
   * whole item's capability evidence over what is frequently an additive or
   * cosmetic field. A *contradictory* field is different and does reject — see
   * the attempt-bearing passthrough above. What is not acceptable is silence,
   * so the list travels with every parse and the three-lesson conformance test
   * fails the build on any non-empty result.
   */
  readonly unrecognizedKeys: readonly string[];
  /**
   * Authored contradictions, on BOTH branches. Non-optional for the same reason
   * as `unrecognizedKeys`: a caller cannot fail to see it.
   *
   * Unlike `unrecognizedKeys` this IS a rejection — a non-empty list forces
   * `status: 'invalid'` — because a contradiction means one of two authored
   * facts was collapsed away, so the normalized record no longer describes the
   * artifact. It is reported here as well as in `issues` so callers can branch
   * on the frozen code instead of matching issue text.
   */
  readonly rejectionCodes: readonly AuthoredBindingRejectionCode[];
} & (
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
    }
);

/**
 * An authored contradiction, in the shape Zod would have reported it, so a
 * caller reading `issues` sees every reason the binding was refused in one place
 * and does not have to know which layer found which.
 */
const asZodIssue = (contradiction: AuthoredBindingContradiction): ZodIssue => ({
  code: 'custom',
  path: [...contradiction.path],
  message: contradiction.message,
});

/** Normalize then validate an authored binding. Never throws. */
export function parseAuthoredLessonBinding(
  envelope: AuthoredLessonEnvelope,
  raw: AuthoredRecord,
): AuthoredLessonBindingParse {
  const unrecognizedKeys = unrecognizedAuthoredBindingKeys(raw);
  const contradictions = authoredBindingContradictions(raw);
  const normalized = normalizeAuthoredLessonBinding(envelope, raw);
  const parsed = LessonItemBindingSchema.safeParse(normalized.value);

  // A contradiction rejects EVEN IF the collapsed record validates cleanly, and
  // that is the whole point: `normalized.value` carries only the key that won
  // precedence, so a successful parse here means the losing fact disappeared,
  // not that the artifact was sound. Deciding on `parsed.success` alone is how
  // this defect was silent.
  return parsed.success && contradictions.length === 0
    ? {
        status: 'parsed',
        measurementKind: normalized.measurementKind,
        binding: parsed.data,
        unrecognizedKeys,
        rejectionCodes: normalized.rejectionCodes,
      }
    : {
        status: 'invalid',
        measurementKind: normalized.measurementKind,
        issues: [...contradictions.map(asZodIssue), ...(parsed.success ? [] : parsed.error.issues)],
        normalized: normalized.value,
        unrecognizedKeys,
        rejectionCodes: normalized.rejectionCodes,
      };
}

// ---------------------------------------------------------------------------
// Derivations
// ---------------------------------------------------------------------------

/**
 * The five runtime facts independence is decided from.
 *
 * A structural subset of `LessonRuntimeResponseFacts`, so the lesson runtime
 * satisfies it unchanged, and narrow enough that a channel which is not a
 * lesson — adaptive practice — can report the same five facts instead of
 * growing a second copy of the rule. Independence then has exactly one
 * derivation and both channels read it, which is what makes their evidence
 * comparable at all.
 */
export interface AdministrationFacts {
  readonly assistanceLevel: AssistanceLevel;
  readonly contentBearingHintUsed: boolean;
  readonly revealUsed: boolean;
  readonly isRetry: boolean;
  readonly isDiagnosticRetry: boolean;
}

/**
 * Independence is a fact about the administration, never about what the item
 * offered. `authoredAssistanceAffordances` is deliberately not read here.
 */
export const isIndependentAdministration = (response: AdministrationFacts): boolean =>
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
 * Administration conditions, as ACTUALLY administered.
 *
 * A declared `candidateEvidenceMode` says what an item is eligible to serve as.
 * It says nothing about how one attempt was run, so it must never set a
 * warrant-bearing condition. `mixed`, `passage` and `timed` come from the
 * runner; `protected` comes from the server scoring resolution, because every
 * measurable binding carries a `serverScoringAuthorityRef` and its mere presence
 * therefore discriminates nothing. The opaque ref is never parsed to find out.
 */
export interface AdministrationConditions {
  readonly mixed: boolean;
  readonly passage: boolean;
  readonly timed: boolean;
  readonly protected: boolean;
}

const administrationConditions = (
  response: LessonRuntimeResponseFacts,
  protectedScoring: boolean,
): AdministrationConditions => ({
  mixed: response.mixedAdministration,
  passage: response.passageAdministration,
  timed: response.timedAdministration,
  protected: protectedScoring,
});

/**
 * A mode may only classify the evidence if the attempt was actually administered
 * that way. Without this, declaring `TIMED` would mint a `timed` evidence record
 * that fills the timed recipe slot on an untimed attempt — the same
 * author-manufactured warrant as a fabricated condition flag, one field over and
 * more load-bearing, since recipe slots key on `kind`.
 */
const ADMINISTRATION_GATED_MODES: Readonly<
  Partial<Record<CandidateEvidenceMode, keyof AdministrationConditions>>
> = {
  MIXED: 'mixed',
  PASSAGE: 'passage',
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
  response: AdministrationFacts,
  conditions: AdministrationConditions,
): EvidenceKind => {
  if (response.isDiagnosticRetry) return 'diagnostic_retry';
  if (!isIndependentAdministration(response)) return 'instruction';

  for (const mode of CONSERVATIVE_EVIDENCE_MODE_ORDER) {
    if (!modes.includes(mode)) continue;
    const gate = ADMINISTRATION_GATED_MODES[mode];
    if (gate !== undefined && !conditions[gate]) continue;
    return EVIDENCE_KIND_BY_CANDIDATE_MODE[mode];
  }
  // Every declared mode was gated out by the administration facts. Fail closed
  // to contextual-only rather than crediting a condition that did not happen.
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
      /**
       * Server-determined: did the scoring authority score this as a protected,
       * unseen item? Required rather than defaulted, so a warrant-bearing
       * condition is never acquired by omission, and structurally unreachable
       * from an authored binding.
       */
      readonly protectedScoring: boolean;
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
  /**
   * Server acceptance time. Doubles as the ceiling that bounds the runner's
   * reported `occurredAt` into `EvidenceRecord.occurredAt`, so it MUST come from
   * a server clock and never from the client.
   */
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

/**
 * Which frozen code NAMES a refusal the kind gate has already decided.
 *
 * Purely diagnostic. It is only ever reached from inside the gate, both branches
 * refuse, and nothing here can change the verdict — so this is not a second
 * eligibility test. It exists because the two causes send an operator to
 * different places: an artifact that declares no allowlisted mode is an
 * authoring fact, while a binding that declared `PROTECTED` and was simply not
 * administered under protected scoring is a runtime one, and calling the second
 * `INDEPENDENT_EVIDENCE_MODE_NOT_DECLARED` would be a lie in the audit trail.
 */
const contextualOnlyRejectionCode = (
  binding: Pick<LessonItemBinding, 'candidateEvidenceModes'>,
): BktQualificationRejectionCode =>
  hasEligibleEvidenceMode(binding)
    ? 'RESOLVED_EVIDENCE_KIND_CONTEXTUAL_ONLY'
    : 'INDEPENDENT_EVIDENCE_MODE_NOT_DECLARED';

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

  const administration = administrationConditions(
    response,
    scoring.scoringValid && scoring.protectedScoring,
  );
  const conditions: EvidenceConditions = {
    ...administration,
    accommodations: [...(input.accommodations ?? [])],
  };

  /**
   * The ONE thing that decides whether BKT may move.
   *
   * `deriveEvidenceKind` already resolves least-credit-first and drops any mode
   * whose administration condition was not met, so it is the only honest answer
   * to "what did THIS attempt establish?". The evidence record and the BKT gate
   * now read the same value, so they cannot disagree about one attempt.
   *
   * It replaces a `hasEligibleEvidenceMode(binding)` gate here, which asked a
   * different question — "does the DECLARED set intersect the allowlist?" — and
   * so answered yes on attempts the evidence system classified as
   * contextual-only: an ineligible mode winning least-credit alongside an
   * eligible one, and an administration-gated mode whose condition was honestly
   * reported false. P(L) moved on a warrant no recipe slot would accept.
   *
   * Do not reintroduce the declared-set test here, and do not intersect the two.
   * A declaration states what an item is ELIGIBLE TO SERVE AS; it is never a
   * finding about an attempt. One question, one authority.
   */
  const evidenceKind = deriveEvidenceKind(binding.candidateEvidenceModes, response, administration);

  const rejectionCodes: BktQualificationRejectionCode[] = [];

  if (response.bindingVersion !== bindingVersion) rejectionCodes.push('BINDING_VERSION_MISMATCH');
  if (binding.firstAttemptImmutable !== true) rejectionCodes.push('FIRST_ATTEMPT_NOT_IMMUTABLE');

  if (CONTEXTUAL_ONLY_KINDS.has(evidenceKind)) {
    rejectionCodes.push(contextualOnlyRejectionCode(binding));
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

  const evidence: EvidenceRecord | null = scoring.scoringValid
    ? {
        evidenceId: input.identity.evidenceId,
        skillId: binding.primaryKcId,
        cluster: input.cluster,
        // `operation` is the `OperationTag` authoring-analysis axis, a different
        // axis from the mastery `ReasoningOperation`. Lesson evidence omits it.
        //
        // The SAME value the BKT gate above read. Deriving it twice is how the
        // record and the qualification came to disagree.
        kind: evidenceKind,
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
        // NOT `response.occurredAt`. That is a runner-reported runtime fact, and
        // a future-dated one would make this record permanently fresh in every
        // freshness window the planner reads. `acceptedAt` is the server's own
        // acceptance time and is the authoritative ceiling. The field's brand is
        // what makes this structural: the raw claim does not typecheck here.
        occurredAt: boundOccurredAtToServerTime(response.occurredAt, input.acceptedAt),
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
