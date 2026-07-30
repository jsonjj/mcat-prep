import {
  reconcileManifest,
  ruleR1,
  ruleR2,
  ruleR3,
  ruleR4,
  ruleR5,
  ruleR6,
  ruleR8,
  ruleR9,
  ruleR10,
  ruleR11,
  ruleR12,
  ruleR13,
  ruleR15,
} from './rules';
import type { CatalogReport, LessonReport, LessonValidationInput } from './types';

/**
 * Run the implemented structural rules over one lesson.
 *
 * Implemented: R1 (shape tolerance), R2 (manifest union), R3 (canonicalization
 * label vs reality), R4 (file_sha256 convention), R5 (dependency hash chain),
 * R6 (closed node records), R8 (15 required node kinds), R9 (route coverage),
 * R10 (transition referential integrity), R11 (family isolation + exit
 * coverage), R12 (release honesty), R13 (label vs structure), R15
 * (runtime-servability). R7 (browser evidence) and R14 (ontology id
 * resolution) require extra inputs and land in the closing validator wave.
 */
export function validateLesson(input: LessonValidationInput): LessonReport {
  const recs = reconcileManifest(input.manifest);
  const results = [
    ruleR1(input),
    ruleR2(input, recs),
    ...ruleR3(input, recs),
    ...ruleR4(input, recs),
    ...ruleR5(input),
    ...ruleR6(input),
    ...ruleR8(input),
    ...ruleR9(input),
    ...ruleR10(input),
    ...ruleR11(input),
    ...ruleR12(input),
    ...ruleR13(input),
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
