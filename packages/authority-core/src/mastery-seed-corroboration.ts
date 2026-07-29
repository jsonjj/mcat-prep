import type { MasterySeed } from '@mcat/contracts';
import { orderedKcsForLesson } from '@mcat/content';
import { kcsByFc } from '@mcat/policies';

/**
 * Is this seed a shape a diagnostic could have produced?
 *
 * The diagnostic service and the authority are separate surfaces: the reads are
 * taken and turned into priors where the form runs, and the resulting payload
 * travels to the authority through the browser. So the authority receives a
 * number it did not compute, about a measurement it did not witness, and the
 * only thing standing behind it was the per-value clamp — which bounds how far
 * a prior can move but says nothing about WHICH units get moved.
 *
 * The consequence is bounded: no seed can mint mastery, because the ingress cap
 * sits far below the BKT threshold and a seed only ever initializes a grain the
 * learner has not practised. What it can do is choose which units a learner
 * starts behind on, and the planner ranks on exactly that.
 *
 * This closes the gap it can close from the receiving side, by refusing any
 * payload the one real producer could not have emitted. The producer is
 * `masterySeedFromUnitSeeds(kcSeedsFromDiagnostic(result, kcsByFc(...)))`
 * (@mcat/policies), and its output has four properties a hand-written payload
 * has to reproduce to get through:
 *
 * 1. KC priors ONLY. The form measures content concepts, so it has nothing to
 *    say about the seven reasoning operations, and CARS is off its axis
 *    entirely — `skillPriors` and `carsAbility` come back empty every time.
 * 2. Every KC belongs to a Foundational Concept on the diagnostic's own axis.
 *    An id that is not on the axis names a unit no read could have covered.
 * 3. A concept is seeded WHOLE. `seedsFromBucketReads` distributes a bucket's
 *    read over every unit beneath it, so a subset of a concept's KCs is not a
 *    weaker read — it is a shape the distribution never produces.
 * 4. A concept's KCs all carry the SAME prior, because they all inherit one
 *    read. Per-KC values are the specific capability the finding named: picking
 *    out the units to push to the floor or the cap.
 *
 * WHAT THIS IS NOT. It is a shape check, not a proof that a diagnostic was
 * taken. A caller who reproduces the shape can still assert a whole-concept
 * read that never happened, within the clamped band. Closing that needs the
 * issuing service and the authority to share a fact — a stored issuance record
 * or a signed payload — and they are separate services today. Refusing what
 * cannot be produced is the part that is available here; it is deliberately
 * fail-closed on everything else, and REFUSES rather than dropping the offending
 * entries, because silently keeping the acceptable half of a payload the server
 * has already decided is dishonest is how a restriction loses to a permission.
 */

export type MasterySeedRefusal =
  | 'SEED_GRAIN_NOT_DIAGNOSTIC_PRODUCED'
  | 'SEED_KC_OUTSIDE_DIAGNOSTIC_AXIS'
  | 'SEED_CONCEPT_PARTIALLY_SEEDED'
  | 'SEED_CONCEPT_PRIORS_NOT_UNIFORM';

export type MasterySeedCorroboration =
  | { readonly status: 'corroborated' }
  | { readonly status: 'refused'; readonly reason: MasterySeedRefusal; readonly detail: string };

/**
 * Concept -> its KC membership, and the reverse, from the SHA-pinned registry.
 *
 * Built once. `kcsByFc` takes its resolver as an argument because @mcat/policies
 * must not import @mcat/content; this module is the composition point that has
 * both, which is also why it is here rather than in either of them.
 */
interface SeedAxis {
  readonly kcsByConcept: ReadonlyMap<string, ReadonlySet<string>>;
  readonly conceptOfKc: ReadonlyMap<string, string>;
}

let axisCache: SeedAxis | null = null;

function seedAxis(): SeedAxis {
  if (axisCache !== null) return axisCache;
  const kcsByConcept = new Map<string, ReadonlySet<string>>();
  const conceptOfKc = new Map<string, string>();
  for (const [concept, kcIds] of kcsByFc(orderedKcsForLesson)) {
    kcsByConcept.set(concept, new Set(kcIds));
    for (const kcId of kcIds) conceptOfKc.set(kcId, concept);
  }
  axisCache = { kcsByConcept, conceptOfKc };
  return axisCache;
}

/**
 * Priors are compared as sent, before the ingress clamp.
 *
 * Comparing clamped values would let two different authored numbers agree once
 * both landed on a bound — `1` and `0.9` both become the cap — so uniformity
 * would be satisfied by a payload that was not uniform.
 */
export function corroborateMasterySeed(seed: MasterySeed): MasterySeedCorroboration {
  const offGrain = [
    ...Object.keys(seed.skillPriors).map((key) => `skillPriors.${key}`),
    ...Object.keys(seed.carsAbility).map((key) => `carsAbility.${key}`),
  ];
  if (offGrain.length > 0) {
    return {
      status: 'refused',
      reason: 'SEED_GRAIN_NOT_DIAGNOSTIC_PRODUCED',
      detail: offGrain.join(', '),
    };
  }

  const { kcsByConcept, conceptOfKc } = seedAxis();
  const byConcept = new Map<string, Map<string, number>>();
  const unknown: string[] = [];
  for (const [kcId, prior] of Object.entries(seed.kcPriors)) {
    const concept = conceptOfKc.get(kcId);
    if (concept === undefined) {
      unknown.push(kcId);
      continue;
    }
    const group = byConcept.get(concept) ?? new Map<string, number>();
    group.set(kcId, prior);
    byConcept.set(concept, group);
  }
  if (unknown.length > 0) {
    return {
      status: 'refused',
      reason: 'SEED_KC_OUTSIDE_DIAGNOSTIC_AXIS',
      detail: unknown.sort().join(', '),
    };
  }

  for (const [concept, group] of byConcept) {
    const membership = kcsByConcept.get(concept)!;
    if (group.size !== membership.size) {
      const missing = [...membership].filter((kcId) => !group.has(kcId)).sort();
      return {
        status: 'refused',
        reason: 'SEED_CONCEPT_PARTIALLY_SEEDED',
        detail: `${concept} is missing ${missing.length} of ${membership.size} KCs (${missing
          .slice(0, 5)
          .join(', ')}${missing.length > 5 ? ', …' : ''})`,
      };
    }
    const priors = new Set(group.values());
    if (priors.size > 1) {
      return {
        status: 'refused',
        reason: 'SEED_CONCEPT_PRIORS_NOT_UNIFORM',
        detail: `${concept} carries ${priors.size} distinct priors`,
      };
    }
  }

  return { status: 'corroborated' };
}
