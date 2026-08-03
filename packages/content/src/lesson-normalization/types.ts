/**
 * Canonical internal lesson model (Real Lesson Catalog, Phase 3).
 *
 * The three real lessons are authored in three genuinely different structural
 * grammars (verified against the vendored artifacts, 2026-07-30):
 *
 *   - L1 V3-LES-130923 ("inline"):   items carry an inline `learner_safe_projection`
 *     object; exit function in `near_or_changed_function` (null = not an exit);
 *     variant encoded in the `activity_id` / `semantic_family_id` suffix
 *     (`-initial` / `-fresh` / `-reentry`, repair `-near-1/-2` / `-changed-1/-2`).
 *   - L2 V3-LES-789208 ("promptref"): items reference `learner_safe_prompt_ref`;
 *     the learner-safe item set is keyed by `learner_token`, so resolution is a
 *     TWO-HOP, server-side join
 *     (`prompt_ref -> protected.prompt_ref -> learner_token -> learner-safe`);
 *     exit function in `near_or_changed_function` (`NOT_EXIT` = not an exit).
 *   - L3 V3-LES-844372 ("projectionref"): items reference
 *     `learner_safe_projection_ref` resolved directly on `prompt_key`, except
 *     `NODE:<id>` refs (WORKED_EXAMPLE) that project from node content; exit
 *     function is the EXPLICIT `exit_function` field; re-entry marked by
 *     `exact_reentry_for`.
 *
 * Every downstream consumer (the Phase 3 validator, the Phase 5 runtime engine,
 * the local-authority harness) reads THIS model, never the raw grammars. The
 * model exposes the structural facts that are unambiguous across all three
 * grammars; the raw `semanticFamilyId` is preserved for full traceability.
 */

export type ActivityRole =
  | 'ENTRY_CHECK'
  | 'WORKED_EXAMPLE'
  | 'GUIDED_PRACTICE'
  | 'LIGHT_SUPPORT_PRACTICE'
  | 'SOLO_PRACTICE'
  | 'NEAR_EXIT'
  | 'CHANGED_EXIT'
  | 'REPAIR_CONFIRMATION';

export const ACTIVITY_ROLES: readonly ActivityRole[] = [
  'ENTRY_CHECK',
  'WORKED_EXAMPLE',
  'GUIDED_PRACTICE',
  'LIGHT_SUPPORT_PRACTICE',
  'SOLO_PRACTICE',
  'NEAR_EXIT',
  'CHANGED_EXIT',
  'REPAIR_CONFIRMATION',
];

/**
 * Normalized exit function. Both source spellings for "this is not an exit item"
 * (`null` in L1/L3, the string `"NOT_EXIT"` in L2) collapse to `NONE`.
 */
export type ExitFunction = 'NEAR_USE' | 'CHANGED_TASK' | 'NONE';

export type LessonGrammar = 'L1_INLINE' | 'L2_PROMPTREF' | 'L3_PROJECTIONREF';

export interface NormalizedChoice {
  /** Stable, unique within the item. Source id for L1 (A/B/…); index string for L2/L3. */
  readonly choiceId: string;
  /** 0-based position; L3's answer key references this via `correct_option_index`. */
  readonly ordinal: number;
  readonly text: string;
}

export interface NormalizedSingleSelectControl {
  readonly kind: 'SINGLE_SELECT';
  readonly choices: readonly NormalizedChoice[];
}

export interface NormalizedShortTextControl {
  readonly kind: 'SHORT_TEXT';
  /** Public input semantics only. Accepted answers remain in the server-only answer key. */
  readonly inputConvention: {
    readonly normalization: 'TRIM_AND_COLLAPSE_WHITESPACE';
    readonly matching: 'AUTHORED_EQUIVALENTS_ONLY';
    readonly caseSensitive: true;
  };
}

export interface NormalizedStructuredField {
  /** Stable authored field id, never derived from a mutable label. */
  readonly fieldId: string;
  readonly label: string;
}

export interface NormalizedStructuredFieldsControl {
  readonly kind: 'STRUCTURED_FIELDS';
  readonly fields: readonly NormalizedStructuredField[];
}

/** Closed learner response-control model. Worked exposition has no response control (`null`). */
export type NormalizedResponseControl =
  | NormalizedSingleSelectControl
  | NormalizedShortTextControl
  | NormalizedStructuredFieldsControl;

export interface NormalizedProjection {
  /** Learner-safe authored content only; source refs and protected authority live outside this projection. */
  readonly prompt: string;
  /** Validated source spelling retained for traceability across the current three grammars. */
  readonly responseType: string;
  readonly responseControl: NormalizedResponseControl | null;
  /** Compatibility view for existing renderers; identical to SINGLE_SELECT.choices, otherwise empty. */
  readonly choices: readonly NormalizedChoice[];
  readonly title?: string | undefined;
  readonly directions?: string | undefined;
  readonly accessibilityAlternative?: string | undefined;
}

export interface NormalizedItem {
  /** Stable, unique within the lesson: the source `item_binding_id` (present on every item, all grammars). */
  readonly itemId: string;
  /** Internal authored ref used to resolve the learner projection; never copied into `projection`. */
  readonly sourceRef: string;
  /** The delivery `activity_id`; `null` for L3 WORKED_EXAMPLE items, which carry only a binding id. */
  readonly activityId: string | null;
  readonly primaryKcId: string;
  readonly activityRole: ActivityRole;
  /** Exit function this item exercises (exit items only; otherwise NONE). */
  readonly exitFunction: ExitFunction;
  /** For REPAIR_CONFIRMATION items: the exit function being repaired, if determinable. */
  readonly repairsFunction: ExitFunction | null;
  /** A re-entry item (repaired path re-run): L1 `-reentry`, L3 `exact_reentry_for`. */
  readonly isReentry: boolean;
  readonly semanticFamilyId: string;
  /** Whether the item is scored (WORKED_EXAMPLE items are not). */
  readonly scored: boolean;
  readonly projection: NormalizedProjection;
}

export interface NormalizedDeliveryStep {
  /** Stable authored screen id when a presentation plan exists, otherwise the source node id. */
  readonly stepId: string;
  /** 1-based position in this KC's authored delivery order. */
  readonly canonicalOrdinal: number;
  readonly primaryKcId: string;
  /** Authoritative presentation kind, falling back to the source node kind. */
  readonly stage: string;
  /** Authored presentation heading; never inferred from titles or prose. */
  readonly heading: string | null;
  readonly nodeIds: readonly string[];
  /** Learner-safe script-node prose in node and block source order. */
  readonly contentBlocks: readonly string[];
  /** QEP item identities reached through node → activity → item bindings. */
  readonly itemIds: readonly string[];
  /** True for targeted repair and exact-re-entry delivery that must not enter the clean baseline. */
  readonly branchOnly: boolean;
}

export type BranchExitFunction = Exclude<ExitFunction, 'NONE'>;

export interface NormalizedBranchBinding {
  readonly failedFunction: BranchExitFunction;
  readonly repairNodeIds: readonly string[];
  readonly repairItemIds: readonly string[];
  readonly reentryNodeId: string;
  readonly reentryItemId: string;
  readonly successNextNodeId: string | null;
  readonly plannerHandoffNodeId: string | null;
}

export interface NormalizedKc {
  readonly kcId: string;
  /** 1-based position within `orderedKcIds`. */
  readonly canonicalOrdinal: number;
  readonly items: readonly NormalizedItem[];
  readonly deliverySteps: readonly NormalizedDeliveryStep[];
  /** Delivery steps available on an unbranched first pass. */
  readonly cleanBaselineSteps: readonly NormalizedDeliveryStep[];
  /** QEP source-order item ids available on that clean first pass. */
  readonly cleanBaselineItemIds: readonly string[];
  readonly branchBindings: readonly NormalizedBranchBinding[];
}

export interface NormalizedLesson {
  readonly lessonId: string;
  readonly groupingId: string;
  readonly grammar: LessonGrammar;
  readonly orderedKcIds: readonly string[];
  /** `content_sha256` of the lesson script (read from the file, not recomputed here). */
  readonly definitionHash: string;
  readonly kcs: readonly NormalizedKc[];
  /** All items flattened, in source (`question_evidence_plan`) order. */
  readonly items: readonly NormalizedItem[];
}

/** SERVER-ONLY answer authority. Never place this object in a learner DTO. */
export interface CanonicalServerItemAnswer {
  readonly itemId: string;
  readonly primaryKcId: string;
  readonly responseType: string;
  readonly correctChoiceId: string | null;
  readonly acceptedResponses: readonly string[];
  readonly rationale: string | null;
  readonly structuredAuthority?: Readonly<Record<string, unknown>>;
}

/** SERVER-ONLY total key for every scored item in a canonical (non-L1) lesson. */
export interface CanonicalServerAnswerKey {
  readonly lessonId: string;
  readonly definitionHash: string;
  readonly byItemId: Readonly<Record<string, CanonicalServerItemAnswer>>;
}

/** Split compilation result: learner-safe normalized model plus separately protected authority. */
export interface CanonicalLessonCompilation {
  readonly lesson: NormalizedLesson;
  readonly answerKey: CanonicalServerAnswerKey;
}

/** Thrown when a lesson cannot be normalized (unresolvable ref, unknown role, missing field). */
export class LessonNormalizationError extends Error {
  constructor(
    message: string,
    readonly detail: {
      lessonId?: string | undefined;
      itemId?: string | undefined;
      ref?: string | undefined;
      stepId?: string | undefined;
    },
  ) {
    super(message);
    this.name = 'LessonNormalizationError';
  }
}
