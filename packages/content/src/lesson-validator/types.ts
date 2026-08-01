/**
 * Structural lesson validator (Real Lesson Catalog, Phase 3). Merge gate that
 * absorbs the L1 generator's structural guarantees so the generator can be
 * deleted (Phase 7). Rules are DATA-DRIVEN over all three lessons — adding a
 * lesson needs no new rule code.
 *
 * The rule logic is pure (operates on already-read inputs, no file IO — matching
 * the package convention). A thin fs/CLI wrapper (`tools/`) feeds it and is wired
 * into CI in Phase 4.
 */

/** One artifact file, read once by the caller (bytes + parsed JSON). */
export interface ArtifactFile {
  readonly relPath: string;
  readonly rawBytes: string;
  readonly json: unknown;
}

/**
 * The frozen knowledge-graph id catalogs an id-resolution rule (R14) checks
 * against. Built by the caller from `curriculum/v3/v3-lesson-authoring-manifest.json`
 * (`indexes.kc_by_id` etc.) so the rule logic stays pure. `null` ⇒ R14 is N/A.
 */
export interface ResolvableIds {
  readonly kcIds: ReadonlySet<string>;
  readonly sourceAnchorIds: ReadonlySet<string>;
  readonly relationIds: ReadonlySet<string>;
}

/**
 * Browser-evidence inputs for R7, read by the caller from
 * `tests/browser/evidence/<id>/browser-report.json`. `null`/absent ⇒ R7 is N/A
 * (only L1 ships browser evidence today).
 */
export interface BrowserEvidence {
  /** Verbatim bytes of `browser-report.json` (for the `sha256(reportText)` binding). */
  readonly reportRawText: string;
  readonly reportJson: unknown;
}

export interface LessonValidationInput {
  readonly lessonId: string;
  readonly files: readonly ArtifactFile[];
  /** Parsed `artifact-manifest.json`, or `null` for the L1 four-file envelope. */
  readonly manifest: unknown | null;
  /** Frozen id catalogs for R14; `null`/absent ⇒ R14 N/A. */
  readonly resolvableIds?: ResolvableIds | null;
  /** Browser evidence for R7; `null`/absent ⇒ R7 N/A. */
  readonly browserEvidence?: BrowserEvidence | null;
}

export interface RuleResult {
  /** Rule id, e.g. "R3". */
  readonly rule: string;
  readonly lessonId: string;
  readonly ok: boolean;
  readonly detail: string;
}

export interface LessonReport {
  readonly lessonId: string;
  readonly ok: boolean;
  readonly results: readonly RuleResult[];
}

export interface CatalogReport {
  readonly ok: boolean;
  readonly lessons: readonly LessonReport[];
  /** Flat list of only the failing results, for a concise CI message. */
  readonly failures: readonly RuleResult[];
}

/** A manifest artifact record after L2/L3 union reconciliation (R2). */
export interface ManifestRecord {
  readonly relPath: string;
  readonly artifactType: string | null;
  readonly contentSha256: string | null;
  readonly fileSha256: string | null;
}

export const PRIMARY_ARTIFACT_FILES = [
  'lesson-script.json',
  'kc-coverage-matrix.json',
  'lesson-presentation-plan.json',
  'lesson-quality-report.json',
] as const;

/**
 * The 15 instructional node kinds every KC must exhibit (R8). Verbatim from the
 * L1 generator test's `REQUIRED_NODE_KINDS`; a lesson may add extra kinds (L3
 * authors a `TRANSITION` kind), so R8 is a SUPERSET check, not set-equality.
 */
export const REQUIRED_NODE_KINDS = [
  'ENTRY_CHECK_BOUNDARY',
  'ORIENTATION',
  'EXPLANATION',
  'MENTAL_MODEL',
  'EXPERT_THINK_ALOUD',
  'WORKED_EXAMPLE',
  'GUIDED_PRACTICE',
  'LIGHT_SUPPORT_PRACTICE',
  'SOLO_PRACTICE',
  'CONTRAST_BOUNDARY',
  'NEAR_EXIT',
  'CHANGED_EXIT',
  'TARGETED_REPAIR',
  'EXACT_REENTRY',
  'RECAP',
] as const;

/**
 * Closed-record schemas for R6. Every `payload.nodes[]` and `payload.kc_scripts[]`
 * record across all three real lessons carries EXACTLY these key sets (verified:
 * one distinct key-set over all 173 node records and all 10 kc_script records).
 * R6 fails a record that introduces any key outside its set — the data-driven
 * replacement for the generator's `validate…()` closed-record check (G11).
 */
export const NODE_ALLOWED_KEYS: ReadonlySet<string> = new Set([
  'activity_ids',
  'checkpoint_ref',
  'learner_content_blocks',
  'node_id',
  'node_kind',
  'primary_kc_id',
  'representation_ids',
  'route_eligibility',
  'secondary_kc_refs',
  'source_claim_refs',
]);

export const KC_SCRIPT_ALLOWED_KEYS: ReadonlySet<string> = new Set([
  'accessibility_equivalent_ids',
  'canonical_ordinal',
  'changed_exit_binding',
  'contrast_boundary_node_ids',
  'entry_check_boundary_id',
  'exact_reentry_bindings',
  'expert_think_aloud_node_ids',
  'explanation_node_ids',
  'guided_activity_ids',
  'kc_id',
  'light_support_activity_ids',
  'mental_model_node_ids',
  'misconception_feature_ids',
  'near_exit_binding',
  'objective_ref',
  'orientation_node_id',
  'prerequisite_point_refs',
  'recap_node_id',
  'repair_bindings',
  'representation_ids',
  'route_node_coverage',
  'scope_in_refs',
  'scope_out_refs',
  'solo_activity_ids',
  'source_claim_refs',
  'worked_example_node_ids',
]);

/** The three learner-facing route lanes every KC coverage row must cover (R9). */
export const REQUIRED_ROUTES = ['concise', 'standard', 'misconception'] as const;
