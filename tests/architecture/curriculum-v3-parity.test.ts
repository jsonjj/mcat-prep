import {
  CURRICULUM_PHASES,
  CURRICULUM_STATS,
  type CurriculumKc,
  type CurriculumLesson,
  type CurriculumModule,
  type CurriculumPhase,
} from '../../apps/learner-web/src/data/curriculum-v3.generated';
import { describe, expect, it } from 'vitest';

const FORBIDDEN_DATA_KEY =
  /question|passage|answer|capstone|extension|support|source.?occurrence|mapping|lineage|hold/i;

function generatedObjectKeys(value: unknown, keys = new Set<string>()): Set<string> {
  if (!value || typeof value !== 'object') return keys;

  for (const [key, nestedValue] of Object.entries(value)) {
    keys.add(key);
    generatedObjectKeys(nestedValue, keys);
  }

  return keys;
}

describe('V3 learner curriculum materialization', () => {
  it('ships the complete learner-safe curriculum navigation manifest', () => {
    const phases: readonly CurriculumPhase[] = CURRICULUM_PHASES;
    const modules: readonly CurriculumModule[] = phases.flatMap((phase) => phase.modules);
    const lessons: readonly CurriculumLesson[] = modules.flatMap((module) => module.lessons);
    const kcs: readonly CurriculumKc[] = lessons.flatMap((lesson) => lesson.kcs);

    expect(CURRICULUM_PHASES).toHaveLength(5);
    expect(CURRICULUM_STATS).toMatchObject({
      phases: 5,
      modules: 40,
      firstDeliveryLessons: 114,
      kcOccurrences: 422,
      uniqueKcs: 422,
      revisits: 114,
    });

    expect(modules).toHaveLength(40);
    expect(lessons).toHaveLength(114);
    expect(new Set(lessons.map((lesson) => lesson.id)).size).toBe(114);
    expect(lessons.map((lesson) => lesson.position).sort((a, b) => a - b)).toEqual(
      Array.from({ length: 114 }, (_, index) => index + 1),
    );
    expect(
      lessons.every((lesson) => Number.isInteger(lesson.position) && lesson.position > 0),
    ).toBe(true);
    expect(kcs).toHaveLength(422);
    expect(new Set(kcs.map((kc) => kc.id)).size).toBe(422);
    expect(lessons.every((lesson) => lesson.kcs.length >= 1 && lesson.kcs.length <= 5)).toBe(true);

    expect(CURRICULUM_PHASES.map((phase) => phase.label)).toEqual([
      'Foundations',
      'Core Models',
      'Integrated Reasoning',
      'Transfer and Application',
      'Review and Readiness',
    ]);
    expect(CURRICULUM_PHASES.map((phase) => phase.firstDeliveryLessonCount)).toEqual([
      27, 30, 32, 25, 0,
    ]);

    const cars = modules.filter((module) => module.lane === 'CARS_PARALLEL');
    expect(cars.flatMap((module) => module.lessons)).toHaveLength(9);
    expect(cars.flatMap((module) => module.lessons).flatMap((lesson) => lesson.kcs)).toHaveLength(
      33,
    );

    const phaseFive = CURRICULUM_PHASES.at(-1);
    expect(phaseFive?.modules).toHaveLength(5);
    expect(phaseFive?.modules.every((module) => module.lessons.length === 0)).toBe(true);
    expect(phaseFive?.modules.reduce((total, module) => total + module.revisitCount, 0)).toBe(114);

    const phaseFiveModuleIds: ReadonlySet<string> = new Set(
      phaseFive?.modules.map((module) => module.id),
    );
    const integrationOnlyModules = modules.filter(
      (module) => !phaseFiveModuleIds.has(module.id) && module.lessons.length === 0,
    );
    expect(integrationOnlyModules.map((module) => module.id)).toEqual([
      'V3-MOD-439026',
      'V3-MOD-547803',
    ]);
    for (const module of integrationOnlyModules) {
      expect(module.deliveryMode).toBe('first_delivery');
      expect(module.revisitCount).toBe(0);
    }

    const orderedLessons = [...lessons].sort((a, b) => a.position - b.position);
    expect(orderedLessons[0]?.id).toBe('V3-LES-130923');
    expect(orderedLessons[0]?.shortTitle).toBe('Vectors and Trigonometry');
    expect(orderedLessons.at(-1)?.id).toBe('V3-LES-095827');

    for (const phase of CURRICULUM_PHASES) {
      expect(phase.id).not.toBe('');
      expect(phase.label).not.toBe('');
      expect(phase.title).not.toBe('');
      expect(Number.isInteger(phase.order) && phase.order > 0).toBe(true);
      for (const module of phase.modules) {
        expect(module.id).not.toBe('');
        expect(module.title).not.toBe('');
        expect(Number.isInteger(module.order) && module.order > 0).toBe(true);
        expect(module.lane).not.toBe('');
        expect(module.deliveryMode).not.toBe('');
        for (const lesson of module.lessons) {
          expect(lesson.id).not.toBe('');
          expect(lesson.shortTitle).not.toBe('');
          expect(lesson.canonicalTitle).not.toBe('');
          for (const kc of lesson.kcs) {
            expect(kc.id).not.toBe('');
            expect(kc.label).not.toBe('');
            expect(Number.isInteger(kc.order) && kc.order > 0).toBe(true);
          }
          expect(lesson.kcs.map((kc) => kc.order)).toEqual(
            Array.from({ length: lesson.kcs.length }, (_, index) => index + 1),
          );
        }
      }
    }

    for (const key of generatedObjectKeys({ CURRICULUM_PHASES, CURRICULUM_STATS })) {
      expect(key).not.toMatch(FORBIDDEN_DATA_KEY);
    }
  });
});
