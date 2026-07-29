import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PRIOR_PL0 } from './bkt';
import { FC_LESSON, FC_UNTAGGED_LESSONS } from './data/fc-lessons.generated';
import type { DiagnosticResponse } from './diagnostic';
import { axisIds, FC_AXIS, fcForLesson, lessonsByFc } from './diagnostic-axis';
import { computeBayesResult } from './diagnostic-bayes';
import {
  lessonSeedsFromDiagnostic,
  masterySeedFromUnitSeeds,
  SEED_PRIOR_CAP,
  SEED_PRIOR_FLOOR,
} from './mastery-seed';

/**
 * Pins scripts/generate-fc-lessons.mjs, and the properties the production
 * bucketing rests on: the map is a partition, it covers every axis bucket, and
 * it says the same thing the atlas does.
 */

const V3_LESSONS = 114;
const FC_TAGGED = 98;

describe('lesson -> foundational concept', () => {
  it('maps every FC-tagged lesson exactly once and lists the rest', () => {
    const mapped = Object.keys(FC_LESSON);
    expect(mapped).toHaveLength(FC_TAGGED);
    expect(FC_UNTAGGED_LESSONS).toHaveLength(V3_LESSONS - FC_TAGGED);
    expect(new Set([...mapped, ...FC_UNTAGGED_LESSONS]).size).toBe(V3_LESSONS);
  });

  it('assigns only concepts the axis reports on', () => {
    const ids = new Set(axisIds(FC_AXIS));
    for (const fc of Object.values(FC_LESSON)) expect(ids.has(fc)).toBe(true);
  });

  it('reads an untagged or unknown lesson as off-axis rather than unplaced', () => {
    expect(fcForLesson(FC_UNTAGGED_LESSONS[0]!)).toBeNull();
    expect(fcForLesson('V3-LES-000000')).toBeNull();
    expect(fcForLesson(null)).toBeNull();
  });

  /**
   * The atlas region groups were cut on the same axis and state the same
   * first-listed-FC rule in their own `assignment_rule`. If the two disagree,
   * the diagnostic and the Progress brain are reporting different partitions of
   * the same curriculum.
   */
  it('agrees with the atlas region groups on every lesson', () => {
    const atlas = JSON.parse(
      readFileSync(
        new URL('../../contracts/src/atlas-region-groups.json', import.meta.url),
        'utf8',
      ),
    ) as { regions: { lessons?: { lesson_id: string; fc: string }[] }[] };

    let checked = 0;
    for (const region of atlas.regions) {
      for (const lesson of region.lessons ?? []) {
        const primary = String(lesson.fc ?? '').trim().split(/\s+/)[0];
        if (!primary) continue;
        expect(FC_LESSON[lesson.lesson_id], lesson.lesson_id).toBe(primary);
        checked += 1;
      }
    }
    expect(checked).toBe(FC_TAGGED);
  });
});

describe('lessonsByFc', () => {
  it('populates every bucket of the reporting axis', () => {
    const byFc = lessonsByFc();
    for (const id of axisIds(FC_AXIS)) {
      expect(byFc.get(id)?.length ?? 0, id).toBeGreaterThan(0);
    }
  });

  it('is the inverse of the lesson map, with no lesson in two buckets', () => {
    const all = [...lessonsByFc().values()].flat();
    expect(all).toHaveLength(FC_TAGGED);
    expect(new Set(all).size).toBe(all.length);
    for (const [fc, lessons] of lessonsByFc()) {
      for (const lessonId of lessons) expect(FC_LESSON[lessonId]).toBe(fc);
    }
  });
});

describe('FC diagnostic -> lesson priors', () => {
  /** A sitting over the FC axis, accuracy varying by concept. */
  const sitting = (correctness: (i: number) => boolean): DiagnosticResponse[] =>
    FC_AXIS.buckets.flatMap((bucket, bi) =>
      Array.from({ length: 14 }, (_, i) => ({
        questionId: `${bucket.id}-${i}`,
        cluster: bucket.id as DiagnosticResponse['cluster'],
        section: bucket.section,
        familyId: `${bucket.id}-${i}`,
        correct: correctness(bi + i),
        elapsedMs: 60_000,
        dokLevel: 2,
      })),
    );

  it('seeds only lesson priors, and never above the cap', () => {
    const result = computeBayesResult(sitting((n) => n % 3 !== 0), undefined, FC_AXIS);
    const seed = masterySeedFromUnitSeeds(lessonSeedsFromDiagnostic(result, lessonsByFc()));

    expect(Object.keys(seed.lessonPriors)).toHaveLength(FC_TAGGED);
    for (const prior of Object.values(seed.lessonPriors)) {
      expect(prior).toBeGreaterThanOrEqual(SEED_PRIOR_FLOOR);
      expect(prior).toBeLessThanOrEqual(SEED_PRIOR_CAP);
    }
    // CARS is off this axis entirely, so the diagnostic seeds no ability for it.
    expect(seed.carsAbility).toEqual({});
    expect(seed.kcPriors).toEqual({});
    expect(seed.skillPriors).toEqual({});
  });

  /**
   * The cap has to survive the best possible read, not just a typical one:
   * a flawless sitting is what would push a prior toward mastery if anything
   * could.
   */
  it('holds the cap for a learner who answered everything correctly', () => {
    const result = computeBayesResult(sitting(() => true), undefined, FC_AXIS);
    const seed = masterySeedFromUnitSeeds(lessonSeedsFromDiagnostic(result, lessonsByFc()));
    const priors = Object.values(seed.lessonPriors);

    expect(priors.length).toBeGreaterThan(0);
    expect(Math.max(...priors)).toBeLessThanOrEqual(SEED_PRIOR_CAP);
    // Certainty is attenuated by sqrt(lessons under the concept), so even a
    // perfect read lands nearer the default prior than the cap.
    expect(Math.max(...priors)).toBeGreaterThan(PRIOR_PL0);
  });

  it('seeds nothing from a sitting that never happened', () => {
    const seed = masterySeedFromUnitSeeds(
      lessonSeedsFromDiagnostic(computeBayesResult([], undefined, FC_AXIS), lessonsByFc()),
    );
    expect(seed.lessonPriors).toEqual({});
  });
});
