import {
  reconcileManifest,
  ruleR1,
  ruleR2,
  ruleR3,
  ruleR4,
  ruleR5,
  ruleR6,
  ruleR7,
  ruleR8,
  ruleR9,
  ruleR10,
  ruleR11,
  ruleR12,
  ruleR13,
  ruleR14,
  ruleR15,
} from './rules';
import type { CatalogReport, LessonReport, LessonValidationInput } from './types';

/**
 * Run the full structural rule set (R1–R15) over one lesson. Every rule is
 * data-driven and shape-tolerant: rules that need an input a given lesson does
 * not carry (a manifest for R2/R4, browser evidence for R7) return N/A rather
 * than red-gating. R14 is the in-repo KC-referential-integrity form (see rules.ts
 * for why global-ontology resolution is a separate out-of-repo check).
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
    ...ruleR7(input),
    ...ruleR8(input),
    ...ruleR9(input),
    ...ruleR10(input),
    ...ruleR11(input),
    ...ruleR12(input),
    ...ruleR13(input),
    ...ruleR14(input),
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
