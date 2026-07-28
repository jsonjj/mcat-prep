/**
 * Diagnostic → mastery seeding (mastery-bkt / provisional-v1).
 *
 * The diagnostic never awards mastery; it only seeds initial values. Seeding is
 * ASYMMETRIC and CAPPED so it fails closed: a weak read may lower the prior freely
 * (below the 0.2 default), a strong read may only raise it a little (cap 0.4).
 * See docs/mastery-pipeline.md §4.7.
 *
 * Pure functions only. Turning per-cluster/operation diagnostic reads into these
 * inputs, and mapping clusters → KCs, happens in the diagnostic producer.
 */
import { ATLAS_LESSON_CLUSTER, type MasterySeed } from '@mcat/contracts';
import { PRIOR_PL0 } from './bkt';
import type { DiagnosticResult } from './diagnostic';

/** Lowest a weak read may push a prior. */
export const SEED_PRIOR_FLOOR = 0.05;
/** Highest a strong read may raise a prior. */
export const SEED_PRIOR_CAP = 0.4;
/** CARS ability seed bounds (asymmetric: weak low, strong modest). */
export const SEED_CARS_MIN = -2;
export const SEED_CARS_MAX = 0.5;
const SEED_CARS_SCALE = 4;

export interface DiagnosticRead {
  /** Gap read in [0,1]; higher = more likely to need work. */
  gap: number;
  /** Read confidence in [0,1]; scales how far the prior moves. */
  certainty: number;
}

/**
 * Seed a BKT prior `P(L)_0` from one diagnostic read. `strength = 1 - gap`.
 * strength < 0.5 → lower toward the floor; strength > 0.5 → raise toward the cap;
 * both scaled by certainty. Neutral/low-confidence reads stay at the 0.2 prior.
 */
export function seedPriorFromRead(read: DiagnosticRead): number {
  const strength = 1 - clamp01(read.gap);
  const certainty = clamp01(read.certainty);

  if (strength < 0.5) {
    const weakness = 1 - strength * 2; // (0,1], full weakness at strength 0
    return Math.max(SEED_PRIOR_FLOOR, PRIOR_PL0 - (PRIOR_PL0 - SEED_PRIOR_FLOOR) * weakness * certainty);
  }
  if (strength > 0.5) {
    const strong = strength * 2 - 1; // (0,1], full strength at strength 1
    return Math.min(SEED_PRIOR_CAP, PRIOR_PL0 + (SEED_PRIOR_CAP - PRIOR_PL0) * strong * certainty);
  }
  return PRIOR_PL0;
}

/**
 * Seed a CARS ability `V_0` from one diagnostic read: `clamp(scale*(0.5 - gap))`.
 * Asymmetric — a weak read can drop to -2, a strong read is capped at +0.5.
 */
export function seedCarsAbilityFromRead(read: DiagnosticRead): number {
  const v = SEED_CARS_SCALE * (0.5 - clamp01(read.gap));
  return Math.min(SEED_CARS_MAX, Math.max(SEED_CARS_MIN, v));
}

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));

// --- Distributing a bucket read down to tracked units -----------------------

/** A seeded prior for one unit the mastery system tracks. */
export interface UnitSeed {
  unitId: string;
  /** The bucket read this was derived from, for auditing a surprising prior. */
  bucketId: string;
  prior: number;
  /** Read confidence after attenuation. Retained so callers can filter weak seeds. */
  certainty: number;
}

/**
 * How much a bucket-level read is diluted when applied to each unit beneath it.
 *
 * The diagnostic measures coarse buckets, but mastery is tracked per unit, so
 * every unit under a bucket inherits the same read. That read is much weaker
 * evidence about any one unit than about the bucket: the items were spread
 * across all of them. Certainty is therefore divided by `sqrt(units)`, on the
 * reasoning that precision grows roughly with the square root of item count and
 * each unit is backed by about `items / units` of the evidence.
 *
 * This is a modelling choice, not a measured quantity. It is deliberately the
 * conservative direction — under-crediting a read costs a few extra questions,
 * whereas over-crediting one lets the diagnostic skip content it never examined.
 */
export const attenuateCertainty = (certainty: number, units: number): number =>
  clamp01(certainty) / Math.sqrt(Math.max(1, units));

/**
 * Turn per-bucket diagnostic reads into per-unit BKT priors.
 *
 * `unitsByBucket` is supplied by the caller because the bucket → unit mapping is
 * curriculum data, not policy. Buckets with no units, and units under a bucket
 * the diagnostic never sampled, are simply absent from the result: no read means
 * the default prior, never a seeded one.
 */
export function seedsFromBucketReads(
  reads: readonly { bucketId: string; gap: number; certainty: number; itemsSeen: number }[],
  unitsByBucket: ReadonlyMap<string, readonly string[]>,
): UnitSeed[] {
  const seeds: UnitSeed[] = [];
  for (const read of reads) {
    if (read.itemsSeen <= 0) continue;
    const units = unitsByBucket.get(read.bucketId) ?? [];
    if (units.length === 0) continue;
    const certainty = attenuateCertainty(read.certainty, units.length);
    const prior = seedPriorFromRead({ gap: read.gap, certainty });
    for (const unitId of units) {
      seeds.push({ unitId, bucketId: read.bucketId, prior, certainty });
    }
  }
  return seeds;
}

/**
 * Lessons grouped by the cluster they belong to, from the atlas.
 *
 * Built once. This is the inverse of the atlas's lesson -> cluster map, and it
 * is the only bucket -> unit mapping the diagnostic currently has: the mastery
 * store keys on lessons, and lessons are what the planner sequences.
 */
let lessonsByClusterCache: ReadonlyMap<string, readonly string[]> | null = null;

export function lessonsByCluster(): ReadonlyMap<string, readonly string[]> {
  if (lessonsByClusterCache !== null) return lessonsByClusterCache;
  const map = new Map<string, string[]>();
  for (const [lessonId, cluster] of Object.entries(ATLAS_LESSON_CLUSTER)) {
    const list = map.get(cluster) ?? [];
    list.push(lessonId);
    map.set(cluster, list);
  }
  for (const list of map.values()) list.sort();
  lessonsByClusterCache = map;
  return map;
}

/**
 * Turn a finished diagnostic into lesson-grain BKT priors.
 *
 * This is the whole diagnostic -> mastery handoff. Note what it does NOT do: it
 * never sets a mastery state, never marks a lesson complete, and cannot raise a
 * prior above `SEED_PRIOR_CAP`. A diagnostic read is an opening guess that
 * moves where a learner starts, and the first few real attempts on a lesson
 * overwhelm it — which is the property that makes an imperfect read safe to act
 * on.
 *
 * Clusters the form could not sample (an empty bucket, or a learner who quit
 * early) yield no seeds at all, leaving those lessons at the default prior.
 *
 * `unitsByBucket` defaults to the atlas's cluster grouping, and is an argument
 * because the buckets are whatever axis the diagnostic ran on — production
 * measures the 10 Foundational Concepts and passes `lessonsByFc()`.
 */
export function lessonSeedsFromDiagnostic(
  result: DiagnosticResult,
  unitsByBucket: ReadonlyMap<string, readonly string[]> = lessonsByCluster(),
): UnitSeed[] {
  return seedsFromBucketReads(
    result.perCluster.map((s) => ({
      bucketId: s.cluster,
      gap: s.gap,
      certainty: s.certainty,
      itemsSeen: s.itemsSeen,
    })),
    unitsByBucket,
  );
}

/**
 * Pack unit seeds into the wire shape the authority consumes.
 *
 * The units are lessons, so only `lessonPriors` is populated: the diagnostic
 * measures content buckets, not the 7 reasoning operations, and CARS is off its
 * axis entirely. Emitting an empty record rather than omitting the field keeps
 * "the diagnostic had nothing to say about this grain" explicit at the boundary.
 */
export function masterySeedFromUnitSeeds(seeds: readonly UnitSeed[]): MasterySeed {
  const lessonPriors: Record<string, number> = {};
  for (const seed of seeds) {
    // A lesson can only belong to one bucket on a partition axis, so a repeat
    // would mean the bucket -> unit map is not one; take the weaker read rather
    // than whichever happened to be last.
    const existing = lessonPriors[seed.unitId];
    lessonPriors[seed.unitId] = existing === undefined ? seed.prior : Math.min(existing, seed.prior);
  }
  return { kcPriors: {}, skillPriors: {}, lessonPriors, carsAbility: {} };
}
