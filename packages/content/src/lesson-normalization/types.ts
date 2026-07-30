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

export interface NormalizedProjection {
  /** The raw ref that produced this projection (`prompt_ref` / `projection_ref` / `"[inline]"`). */
  readonly sourceRef: string;
  readonly prompt: string;
  readonly responseType: string;
  readonly choices: readonly NormalizedChoice[];
  readonly title?: string | undefined;
  readonly directions?: string | undefined;
  readonly accessibilityAlternative?: string | undefined;
}

export interface NormalizedItem {
  /** Stable, unique within the lesson: the source `item_binding_id` (present on every item, all grammars). */
  readonly itemId: string;
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

export interface NormalizedKc {
  readonly kcId: string;
  /** 1-based position within `orderedKcIds`. */
  readonly canonicalOrdinal: number;
  readonly items: readonly NormalizedItem[];
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

/** Thrown when a lesson cannot be normalized (unresolvable ref, unknown role, missing field). */
export class LessonNormalizationError extends Error {
  constructor(
    message: string,
    readonly detail: {
      lessonId?: string | undefined;
      itemId?: string | undefined;
      ref?: string | undefined;
    },
  ) {
    super(message);
    this.name = 'LessonNormalizationError';
  }
}
