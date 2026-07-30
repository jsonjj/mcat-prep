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

export interface LessonValidationInput {
  readonly lessonId: string;
  readonly files: readonly ArtifactFile[];
  /** Parsed `artifact-manifest.json`, or `null` for the L1 four-file envelope. */
  readonly manifest: unknown | null;
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
