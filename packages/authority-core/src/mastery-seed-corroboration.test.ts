import { describe, expect, it } from 'vitest';
import { MasterySeedSchema, fixedClock, type MasterySeed } from '@mcat/contracts';
import { loadSyntheticBank, orderedKcsForLesson } from '@mcat/content';
import {
  FC_AXIS,
  SEED_PRIOR_CAP,
  SEED_PRIOR_FLOOR,
  computeBayesResult,
  kcSeedsFromDiagnostic,
  kcsByFc,
  masterySeedFromUnitSeeds,
  type DiagnosticResponse,
} from '@mcat/policies';
import { Authority } from './authority';
import {
  MasterySeedNotCorroboratedError,
  corroborateMasterySeed,
} from './mastery-seed-corroboration';

const NOW = '2026-07-20T12:00:00.000Z';

/**
 * A diagnostic seed has to look like something a diagnostic produced.
 *
 * The seed is computed where the form runs and reaches the authority through
 * the browser, so the authority receives priors it did not compute about a
 * measurement it did not witness. The ingress clamp bounds how far a prior can
 * move — which is why a fabricated seed cannot mint mastery, and why this is a
 * MINOR finding rather than a major one — but it says nothing about WHICH units
 * get moved, and the planner ranks on exactly that.
 *
 * The real producer's output is the reference, and it is taken from the real
 * producer rather than described: `masterySeedFromUnitSeeds` over
 * `kcSeedsFromDiagnostic` over a real `computeBayesResult`, on the production
 * FC axis and the SHA-pinned registry membership.
 */

const AXIS_KCS = kcsByFc(orderedKcsForLesson);

const concept = (id: string): readonly string[] => {
  const kcs = AXIS_KCS.get(id);
  if (kcs === undefined || kcs.length === 0) throw new Error(`no KCs for ${id}`);
  return kcs;
};

const uniform = (kcIds: readonly string[], prior: number): Record<string, number> =>
  Object.fromEntries(kcIds.map((kcId) => [kcId, prior]));

const seedOf = (kcPriors: Record<string, number>): MasterySeed =>
  MasterySeedSchema.parse({ kcPriors, skillPriors: {}, carsAbility: {} });

/** A full sitting on the production axis, answered with a fixed pattern. */
const sitting = (correct: (n: number) => boolean): DiagnosticResponse[] =>
  FC_AXIS.buckets.flatMap((bucket, bucketIndex) =>
    Array.from({ length: 14 }, (_unused, i) => ({
      cluster: bucket.id,
      correct: correct(bucketIndex * 14 + i),
      dokLevel: 2,
    })),
  ) as DiagnosticResponse[];

const producedSeed = (): MasterySeed =>
  MasterySeedSchema.parse(
    masterySeedFromUnitSeeds(
      kcSeedsFromDiagnostic(
        computeBayesResult(
          sitting((n) => n % 3 !== 0),
          undefined,
          FC_AXIS,
        ),
        AXIS_KCS,
      ),
    ),
  );

describe('the seed the real diagnostic produces is corroborated', () => {
  it('accepts a seed built by the production chain end to end', () => {
    const seed = producedSeed();
    expect(Object.keys(seed.kcPriors).length).toBeGreaterThan(0);
    expect(corroborateMasterySeed(seed)).toEqual({ status: 'corroborated' });
  });

  /**
   * The acceptance above is only meaningful if the producer's shape is the
   * demanding one. Measured rather than assumed: every KC it emits sits on the
   * axis, every concept it touches is seeded whole, and each concept's KCs all
   * carry one prior.
   */
  it('emits whole concepts at one prior each, which is what the check requires', () => {
    const seed = producedSeed();
    const byConcept = new Map<string, string[]>();
    for (const kcId of Object.keys(seed.kcPriors)) {
      const owner = [...AXIS_KCS.entries()].find(([, kcs]) => kcs.includes(kcId))?.[0];
      expect(owner, `${kcId} is not on the diagnostic axis`).toBeDefined();
      byConcept.set(owner!, [...(byConcept.get(owner!) ?? []), kcId]);
    }
    expect(byConcept.size).toBeGreaterThan(1);
    for (const [id, kcIds] of byConcept) {
      expect(kcIds.length).toBe(concept(id).length);
      expect(new Set(kcIds.map((kcId) => seed.kcPriors[kcId])).size).toBe(1);
    }
  });

  /** An unsampled concept simply gets no seed, and a partial SITTING is fine. */
  it('accepts a seed covering only the concepts the form actually reached', () => {
    const seed = seedOf({
      ...uniform(concept('FC10'), 0.17),
      ...uniform(concept('FC2'), 0.23),
    });
    expect(corroborateMasterySeed(seed)).toEqual({ status: 'corroborated' });
  });

  it('accepts an empty seed as the no-op it is', () => {
    expect(corroborateMasterySeed(seedOf({}))).toEqual({ status: 'corroborated' });
  });
});

describe('a fabricated seed is refused', () => {
  /**
   * The finding's headline capability: name any KC ids and push them to the
   * floor or the cap with no diagnostic taken.
   */
  it('refuses KC ids that are not on the diagnostic axis', () => {
    const result = corroborateMasterySeed(
      seedOf({ 'V3-KC-000000': SEED_PRIOR_FLOOR, 'kc-i-just-made-up': SEED_PRIOR_CAP }),
    );
    expect(result.status).toBe('refused');
    expect(result).toMatchObject({ reason: 'SEED_KC_OUTSIDE_DIAGNOSTIC_AXIS' });
  });

  /**
   * Real ids, cherry-picked. The read a concept produces reaches every KC
   * beneath it, so a handful of them is not a weaker measurement — it is a
   * shape the distribution cannot make.
   */
  it('refuses a subset of a real concept, however plausible the ids', () => {
    const kcs = concept('FC4');
    expect(kcs.length).toBeGreaterThan(3);
    const result = corroborateMasterySeed(seedOf(uniform(kcs.slice(0, 3), SEED_PRIOR_FLOOR)));

    expect(result.status).toBe('refused');
    expect(result).toMatchObject({ reason: 'SEED_CONCEPT_PARTIALLY_SEEDED' });
  });

  /**
   * The precise attack the finding describes, in its most careful form: a whole
   * concept, real ids, but the units the caller wants prioritized pushed to the
   * floor and the rest left at the cap.
   */
  it('refuses per-KC priors inside one concept', () => {
    const kcs = concept('FC2');
    const rigged = Object.fromEntries(
      kcs.map((kcId, index) => [kcId, index < 3 ? SEED_PRIOR_FLOOR : SEED_PRIOR_CAP]),
    );
    const result = corroborateMasterySeed(seedOf(rigged));

    expect(result.status).toBe('refused');
    expect(result).toMatchObject({ reason: 'SEED_CONCEPT_PRIORS_NOT_UNIFORM' });
  });

  /**
   * Compared BEFORE the ingress clamp. `1` and `0.9` both land on the cap, so a
   * check that ran after clamping would call this payload uniform.
   */
  it('refuses values that would only look uniform once clamped', () => {
    const kcs = concept('FC10');
    const rigged = Object.fromEntries(
      kcs.map((kcId, index) => [kcId, index === 0 ? 1 : SEED_PRIOR_CAP]),
    );
    const result = corroborateMasterySeed(seedOf(rigged));

    expect(result.status).toBe('refused');
    expect(result).toMatchObject({ reason: 'SEED_CONCEPT_PRIORS_NOT_UNIFORM' });
  });

  /**
   * The two grains the form has no read for at all. It measures content
   * concepts, and CARS is off its axis, so the producer returns both empty
   * every time — which makes any value here a claim with no source.
   */
  it('refuses reasoning-operation and CARS priors, which no diagnostic produces', () => {
    expect(
      corroborateMasterySeed(
        MasterySeedSchema.parse({
          kcPriors: {},
          skillPriors: { IDENTIFY: SEED_PRIOR_CAP },
          carsAbility: {},
        }),
      ),
    ).toMatchObject({ reason: 'SEED_GRAIN_NOT_DIAGNOSTIC_PRODUCED' });

    expect(
      corroborateMasterySeed(
        MasterySeedSchema.parse({ kcPriors: {}, skillPriors: {}, carsAbility: { FOC: 1.5 } }),
      ),
    ).toMatchObject({ reason: 'SEED_GRAIN_NOT_DIAGNOSTIC_PRODUCED' });
  });

  /**
   * Refused whole, not filtered down to the part that passes. Dropping the bad
   * entries would let a payload the server has already judged dishonest still
   * move the planner with whatever survived the filter.
   */
  it('refuses the whole payload rather than keeping the acceptable half', () => {
    const result = corroborateMasterySeed(
      seedOf({ ...uniform(concept('FC10'), 0.17), 'kc-i-just-made-up': SEED_PRIOR_CAP }),
    );
    expect(result.status).toBe('refused');
  });
});

/**
 * WHERE the check runs, which is the half a pure-function test cannot cover.
 *
 * The corroboration first landed as a pre-check at the lambda seed route. That
 * left it bypassable by every other caller of `applyMasterySeed`, and there is
 * a second real one: the in-process dev authority (`services/local-authority`)
 * calls the same method with a payload that has crossed no route at all. A guard
 * at one entry point is a property of that call site's discipline; a guard at the
 * write path is a property of the write path.
 *
 * So these drive the AUTHORITY, not the function. Every assertion below fails if
 * the check is moved back out in front of a route.
 */
describe('the check runs at the single door', () => {
  const authority = (): Authority => new Authority(loadSyntheticBank(), fixedClock(NOW));

  it('refuses a fabricated payload at applyMasterySeed, writing no grain at all', () => {
    const auth = authority();
    const state = auth.createGuest();
    const fabricated = seedOf({
      'V3-KC-000000': SEED_PRIOR_FLOOR,
      'kc-i-just-made-up': SEED_PRIOR_CAP,
    });

    expect(() => auth.applyMasterySeed(state, fabricated)).toThrow(MasterySeedNotCorroboratedError);

    // Nothing partial survived: not the mastery block, not a single grain. A
    // refusal that still initialized the KCs it recognized would be the same
    // defect with fewer entries.
    expect(state.mastery?.kc ?? {}).toEqual({});
    expect(state.mastery?.skill ?? {}).toEqual({});
  });

  it('names the refusal rather than reporting a generic failure', () => {
    const auth = authority();
    const error = (() => {
      try {
        auth.applyMasterySeed(
          auth.createGuest(),
          MasterySeedSchema.parse({
            kcPriors: {},
            skillPriors: { IDENTIFY: SEED_PRIOR_CAP },
            carsAbility: {},
          }),
        );
        return null;
      } catch (thrown: unknown) {
        return thrown;
      }
    })();

    expect(error).toBeInstanceOf(MasterySeedNotCorroboratedError);
    expect((error as MasterySeedNotCorroboratedError).reason).toBe(
      'SEED_GRAIN_NOT_DIAGNOSTIC_PRODUCED',
    );
  });

  /**
   * The other half of the "done" condition. A door that also refuses the real
   * producer is not a fix, so the production chain is driven through the same
   * method and its priors are read back off the state.
   */
  it('applies the seed the real producer emits, through the same door', () => {
    const auth = authority();
    const state = auth.createGuest();
    const seed = producedSeed();

    auth.applyMasterySeed(state, seed);

    const seededKcIds = Object.keys(seed.kcPriors);
    expect(seededKcIds.length).toBeGreaterThan(0);
    expect(Object.keys(state.mastery!.kc).sort()).toEqual([...seededKcIds].sort());
  });
});
