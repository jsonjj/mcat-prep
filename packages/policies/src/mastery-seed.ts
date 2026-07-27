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
import { PRIOR_PL0 } from './bkt';

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
