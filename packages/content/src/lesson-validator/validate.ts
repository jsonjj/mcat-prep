import { reconcileManifest, ruleR1, ruleR2, ruleR3, ruleR4, ruleR5, ruleR11, ruleR15 } from './rules';
import type { CatalogReport, LessonReport, LessonValidationInput } from './types';

/**
 * Run the implemented structural rules over one lesson.
 *
 * Implemented in this wave: R1 (shape tolerance), R2 (manifest union), R3
 * (canonicalization label vs reality), R4 (file_sha256 convention), R5
 * (dependency hash chain), R11 (family isolation + exit coverage), R15
 * (runtime-servability). R6–R10, R12–R14 land in the next validator wave.
 */
export function validateLesson(input: LessonValidationInput): LessonReport {
  const recs = reconcileManifest(input.manifest);
  const results = [
    ruleR1(input),
    ruleR2(input, recs),
    ...ruleR3(input, recs),
    ...ruleR4(input, recs),
    ...ruleR5(input),
    ...ruleR11(input),
    ...ruleR15(input),
  ];
  return { lessonId: input.lessonId, ok: results.every((r) => r.ok), results };
}

/** Data-driven gate over the whole catalog: green only if every lesson is green. */
export function validateCatalog(inputs: readonly LessonValidationInput[]): CatalogReport {
  const lessons = inputs.map(validateLesson);
  const failures = lessons.flatMap((l) => l.results.filter((r) => !r.ok));
  return { ok: failures.length === 0, lessons, failures };
}
