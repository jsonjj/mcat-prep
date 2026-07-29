import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MasterySeedSchema } from '@mcat/contracts';
import { PRIOR_PL0 } from './bkt';
import { FC_LESSON, FC_UNTAGGED_LESSONS } from './data/fc-lessons.generated';
import type { DiagnosticResponse } from './diagnostic';
import { axisIds, FC_AXIS, fcForLesson, kcsByFc, lessonsByFc } from './diagnostic-axis';
import { computeBayesResult } from './diagnostic-bayes';
import {
  kcSeedsFromDiagnostic,
  lessonSeedsFromDiagnostic,
  masterySeedFromUnitSeeds,
  MasterySeedGrainError,
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

/**
 * The diagnostic hands off at KC grain, because that is the grain the mastery
 * engine stores. It used to emit `lessonPriors` into a schema with no such key and
 * an authority that ignored it, which made the whole handoff a silent no-op.
 *
 * The ordered lesson -> KC membership lives in @mcat/content, which this package
 * must not import, so the resolver is stubbed here and the real membership is
 * exercised in `packages/authority-core/src/authority.test.ts`. What is asserted
 * here is the distribution and the bounds, which are this package's business.
 */
describe('FC diagnostic -> KC priors', () => {
  const KCS_PER_LESSON = 2;
  /** One lesson deliberately has no resolvable membership. */
  const UNMAPPED_LESSON = [...lessonsByFc().values()].flat()[0]!;
  const stubKcsForLesson = (lessonId: string): readonly string[] | null =>
    lessonId === UNMAPPED_LESSON
      ? null
      : Array.from({ length: KCS_PER_LESSON }, (_, i) => `${lessonId}-KC${i + 1}`);

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

  const seedFrom = (responses: DiagnosticResponse[]) =>
    masterySeedFromUnitSeeds(
      kcSeedsFromDiagnostic(
        computeBayesResult(responses, undefined, FC_AXIS),
        kcsByFc(stubKcsForLesson),
      ),
    );

  it('produces a payload the authority will accept', () => {
    // The whole handoff used to fail here and nowhere else: the producer emitted
    // only `lessonPriors`, so nothing it sent had a destination. Parsing the REAL
    // emitter output through the real schema is what makes that unrepeatable.
    const seed = seedFrom(sitting((n) => n % 3 !== 0));
    expect(() => MasterySeedSchema.parse(seed)).not.toThrow();
    expect(Object.keys(MasterySeedSchema.parse(seed).kcPriors).length).toBeGreaterThan(0);
  });

  it('seeds only KC priors, and never above the cap', () => {
    const seed = seedFrom(sitting((n) => n % 3 !== 0));

    // Every FC-tagged lesson's KCs, minus the one whose membership does not
    // resolve: an unidentifiable KC is left at the default prior, never guessed at.
    expect(Object.keys(seed.kcPriors)).toHaveLength((FC_TAGGED - 1) * KCS_PER_LESSON);
    for (const prior of Object.values(seed.kcPriors)) {
      expect(prior).toBeGreaterThanOrEqual(SEED_PRIOR_FLOOR);
      expect(prior).toBeLessThanOrEqual(SEED_PRIOR_CAP);
    }
    // CARS is off this axis entirely, and the diagnostic measures content buckets
    // rather than the 7 reasoning operations.
    expect(seed.carsAbility).toEqual({});
    expect(seed.skillPriors).toEqual({});
    // The removed key must not come back through the packer.
    expect(seed).not.toHaveProperty('lessonPriors');
  });

  it('distributes a concept read uniformly over the KCs beneath it', () => {
    const seeds = kcSeedsFromDiagnostic(
      computeBayesResult(
        sitting((n) => n % 3 !== 0),
        undefined,
        FC_AXIS,
      ),
      kcsByFc(stubKcsForLesson),
    );
    const byBucket = new Map<string, number[]>();
    for (const seed of seeds) {
      expect(seed.grain).toBe('kc');
      byBucket.set(seed.bucketId, [...(byBucket.get(seed.bucketId) ?? []), seed.prior]);
    }
    expect(byBucket.size).toBe(FC_AXIS.buckets.length);
    for (const [bucketId, priors] of byBucket) {
      expect(new Set(priors).size, bucketId).toBe(1);
    }
    // Concepts were read differently, so uniformity within a bucket is not
    // uniformity everywhere — which would pass vacuously.
    expect(new Set([...byBucket.values()].map((priors) => priors[0]!)).size).toBeGreaterThan(1);
  });

  /**
   * The cap has to survive the best possible read, not just a typical one: a
   * flawless sitting is what would push a prior toward mastery if anything could.
   */
  it('holds the cap for a learner who answered everything correctly', () => {
    const priors = Object.values(seedFrom(sitting(() => true)).kcPriors);

    expect(priors.length).toBeGreaterThan(0);
    expect(Math.max(...priors)).toBeLessThanOrEqual(SEED_PRIOR_CAP);
    // Certainty is attenuated by sqrt(KCs under the concept), so even a perfect
    // read lands nearer the default prior than the cap.
    expect(Math.max(...priors)).toBeGreaterThan(PRIOR_PL0);
  });

  it('trusts a concept read less at KC grain than at lesson grain', () => {
    // The same read spread over more units is weaker evidence about any one of
    // them. Under-crediting costs a few extra questions; over-crediting skips
    // content the diagnostic never examined.
    const result = computeBayesResult(
      sitting(() => true),
      undefined,
      FC_AXIS,
    );
    const strongest = (seeds: readonly { prior: number }[]) =>
      Math.max(...seeds.map((s) => s.prior));

    expect(strongest(kcSeedsFromDiagnostic(result, kcsByFc(stubKcsForLesson)))).toBeLessThan(
      strongest(lessonSeedsFromDiagnostic(result, lessonsByFc())),
    );
  });

  it('seeds nothing from a sitting that never happened', () => {
    expect(seedFrom([]).kcPriors).toEqual({});
  });

  it('refuses to pack a lesson-grain seed', () => {
    // A cast is all it would take, and the result would be KC state stored under
    // lesson ids: present, plausible, and matching nothing.
    const lessonSeeds = lessonSeedsFromDiagnostic(
      computeBayesResult(
        sitting(() => true),
        undefined,
        FC_AXIS,
      ),
      lessonsByFc(),
    );
    expect(lessonSeeds.length).toBeGreaterThan(0);
    expect(() =>
      masterySeedFromUnitSeeds(
        lessonSeeds as unknown as Parameters<typeof masterySeedFromUnitSeeds>[0],
      ),
    ).toThrow(MasterySeedGrainError);
  });
});
