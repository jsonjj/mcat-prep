import { describe, expect, it } from 'vitest';
import type { SkillCluster } from '@mcat/contracts';
import {
  PRACTICE_SELECTION_CONFIG,
  PRACTICE_SELECTION_MANIFEST,
  abilityFromPL,
  allocateSlots,
  bandCenter,
  carsExamWeight,
  carsPriorityScore,
  difficultyBandFor,
  examWeightForCluster,
  orderSpecs,
  practiceSpecId,
  priorityScore,
  selectPracticeQueue,
  selectSpecs,
  type PracticeCarsUnit,
  type PracticeSnapshot,
  type PracticeUnit,
} from './practice-selection';

const unit = (over: Partial<PracticeUnit> & Pick<PracticeUnit, 'kcId'>): PracticeUnit => ({
  skill: 'EXPLAIN',
  cluster: 'BB1',
  plKc: 0.2,
  plSkill: 0.2,
  taught: true,
  prereqMet: true,
  overdueDays: 0,
  neverPractised: false,
  recency: 0,
  ...over,
});

const cars = (over: Partial<PracticeCarsUnit> & Pick<PracticeCarsUnit, 'carsSkill'>): PracticeCarsUnit => ({
  v: 0,
  neverPractised: false,
  recency: 0,
  ...over,
});

const snapshot = (over: Partial<PracticeSnapshot> = {}): PracticeSnapshot => ({
  units: [],
  cars: [],
  repairs: [],
  coveredClusters: new Set<SkillCluster>(),
  ...over,
});

describe('practice-selection manifest', () => {
  it('is provisional-active and registered', () => {
    expect(PRACTICE_SELECTION_MANIFEST.policyId).toBe('practice-selection');
    expect(PRACTICE_SELECTION_MANIFEST.status).toBe('provisional_active');
  });
});

describe('exam weights', () => {
  it('splits each section evenly and stays positive', () => {
    // BB has 4 clusters → 0.25 / 4.
    expect(examWeightForCluster('BB1')).toBeCloseTo(0.25 / 4, 6);
    // CP has R1-3 + CP1-3 = 6 clusters → 0.25 / 6.
    expect(examWeightForCluster('CP1')).toBeCloseTo(0.25 / 6, 6);
    expect(carsExamWeight()).toBeCloseTo(0.25 / 3, 6);
  });
});

describe('priorityScore', () => {
  it('is zero for an ineligible (untaught or prereq-blocked) unit', () => {
    expect(priorityScore(unit({ kcId: 'k', taught: false }), snapshot())).toBe(0);
    expect(priorityScore(unit({ kcId: 'k', prereqMet: false }), snapshot())).toBe(0);
  });

  it('rises as the learner gets weaker', () => {
    const weak = priorityScore(unit({ kcId: 'k', plKc: 0.1, plSkill: 0.1 }), snapshot());
    const strong = priorityScore(unit({ kcId: 'k', plKc: 0.9, plSkill: 0.9 }), snapshot());
    expect(weak).toBeGreaterThan(strong);
  });

  it('adds an explore bonus for a never-practised unit', () => {
    const base = unit({ kcId: 'k', plKc: 0.5, plSkill: 0.5, neverPractised: false });
    const fresh = unit({ kcId: 'k', plKc: 0.5, plSkill: 0.5, neverPractised: true });
    expect(priorityScore(fresh, snapshot())).toBeGreaterThan(priorityScore(base, snapshot()));
  });

  it('adds a coverage bonus only for uncovered clusters', () => {
    const u = unit({ kcId: 'k', cluster: 'BB1' });
    const uncovered = priorityScore(u, snapshot({ coveredClusters: new Set<SkillCluster>() }));
    const covered = priorityScore(u, snapshot({ coveredClusters: new Set<SkillCluster>(['BB1']) }));
    expect(uncovered).toBeGreaterThan(covered);
  });

  it('subtracts a recency penalty', () => {
    const fresh = priorityScore(unit({ kcId: 'k', recency: 0 }), snapshot());
    const recent = priorityScore(unit({ kcId: 'k', recency: 1 }), snapshot());
    expect(recent).toBeLessThan(fresh);
  });

  it('raises priority with overdue urgency', () => {
    const notDue = priorityScore(unit({ kcId: 'k', overdueDays: 0 }), snapshot());
    const overdue = priorityScore(unit({ kcId: 'k', overdueDays: 30 }), snapshot());
    expect(overdue).toBeGreaterThan(notDue);
  });
});

describe('carsPriorityScore', () => {
  it('is higher for a weaker (lower-ability) sub-skill', () => {
    expect(carsPriorityScore(cars({ carsSkill: 'FOC', v: -2 }))).toBeGreaterThan(
      carsPriorityScore(cars({ carsSkill: 'FOC', v: 2 })),
    );
  });
});

describe('difficultyBandFor', () => {
  it('places train easier than probe, and repair easiest', () => {
    const theta = 1;
    const train = bandCenter(difficultyBandFor('train', theta));
    const probe = bandCenter(difficultyBandFor('probe', theta));
    const repair = bandCenter(difficultyBandFor('repair', theta));
    expect(train).toBeLessThan(probe);
    expect(repair).toBeLessThan(train);
  });

  it('follows ability: a stronger learner gets harder bands', () => {
    const weak = bandCenter(difficultyBandFor('train', abilityFromPL(0.2)));
    const strong = bandCenter(difficultyBandFor('train', abilityFromPL(0.9)));
    expect(strong).toBeGreaterThan(weak);
  });

  it('emits a band of the configured width', () => {
    const [lo, hi] = difficultyBandFor('probe', 0);
    expect(hi - lo).toBeCloseTo(2 * PRACTICE_SELECTION_CONFIG.bandWidth, 6);
  });
});

describe('allocateSlots', () => {
  const scienceUnits = Array.from({ length: 20 }, (_, i) =>
    unit({ kcId: `k${i}`, plKc: 0.2, plSkill: 0.2 }),
  );

  it('always sums to X when candidates exist', () => {
    const snap = snapshot({ units: scienceUnits, cars: [cars({ carsSkill: 'FOC', v: -1 })] });
    for (const x of [1, 4, 7, 12, 25]) {
      const a = allocateSlots(snap, x);
      expect(a.train + a.probe + a.repair + a.cars).toBe(x);
    }
  });

  it('allocates no CARS slots when there are no CARS units', () => {
    const a = allocateSlots(snapshot({ units: scienceUnits }), 10);
    expect(a.cars).toBe(0);
    expect(a.train + a.probe + a.repair).toBe(10);
  });

  it('never exceeds the available repairs and caps the repair fraction', () => {
    const snap = snapshot({
      units: scienceUnits,
      repairs: [
        { kcId: 'k0', skill: 'EXPLAIN' },
        { kcId: 'k1', skill: 'EXPLAIN' },
        { kcId: 'k2', skill: 'EXPLAIN' },
        { kcId: 'k3', skill: 'EXPLAIN' },
        { kcId: 'k4', skill: 'EXPLAIN' },
      ],
    });
    const a = allocateSlots(snap, 10);
    expect(a.repair).toBeLessThanOrEqual(5);
    expect(a.repair).toBeLessThanOrEqual(Math.floor(10 * PRACTICE_SELECTION_CONFIG.maxRepairFraction));
  });

  it('gives all slots to CARS when no science is eligible', () => {
    const snap = snapshot({
      units: [unit({ kcId: 'k', taught: false })],
      cars: [cars({ carsSkill: 'RBT', v: -1 })],
    });
    const a = allocateSlots(snap, 6);
    expect(a.cars).toBe(6);
  });
});

describe('selectSpecs', () => {
  const scienceUnits = Array.from({ length: 12 }, (_, i) =>
    unit({ kcId: `k${i}`, plKc: 0.1 + i * 0.05, plSkill: 0.2, cluster: 'BB1' }),
  );

  it('returns X specs when enough candidates exist and never reuses a KC', () => {
    const snap = snapshot({ units: scienceUnits, cars: [cars({ carsSkill: 'FOC', v: -1 })] });
    const specs = selectSpecs(snap, 8);
    expect(specs).toHaveLength(8);
    const scienceKcs = specs.filter((s) => s.domain === 'science').map((s) => s.kcId);
    expect(new Set(scienceKcs).size).toBe(scienceKcs.length);
  });

  it('emits a repair spec for a recent miss', () => {
    const snap = snapshot({
      units: scienceUnits,
      repairs: [{ kcId: 'k3', skill: 'EXPLAIN' }],
    });
    const specs = selectSpecs(snap, 6);
    const repair = specs.find((s) => s.purpose === 'repair');
    expect(repair?.kcId).toBe('k3');
    expect(repair?.skill).toBe('EXPLAIN');
  });

  it('tags CARS specs with a sub-skill and the cars domain', () => {
    const snap = snapshot({ units: [], cars: [cars({ carsSkill: 'RWT', v: -1 })] });
    const specs = selectSpecs(snap, 3);
    expect(specs.every((s) => s.domain === 'cars')).toBe(true);
    expect(specs[0]?.carsSkill).toBe('RWT');
  });
});

describe('orderSpecs', () => {
  it('never places the same KC back-to-back when avoidable', () => {
    const specs = selectPracticeQueue(
      snapshot({
        units: Array.from({ length: 6 }, (_, i) => unit({ kcId: `k${i}` })),
      }),
      6,
    );
    for (let i = 1; i < specs.length; i += 1) {
      expect(specs[i]!.kcId).not.toBe(specs[i - 1]!.kcId);
    }
  });

  it('orders a prerequisite KC before its dependent', () => {
    const snap = snapshot({
      units: [
        unit({ kcId: 'base', plKc: 0.2 }),
        unit({ kcId: 'dependent', plKc: 0.2, prereqKcIds: ['base'] }),
      ],
    });
    const specs = orderSpecs(selectSpecs(snap, 2), snap);
    const baseIdx = specs.findIndex((s) => s.kcId === 'base');
    const depIdx = specs.findIndex((s) => s.kcId === 'dependent');
    expect(baseIdx).toBeGreaterThanOrEqual(0);
    expect(depIdx).toBeGreaterThan(baseIdx);
  });

  it('distributes CARS rather than clumping it', () => {
    const snap = snapshot({
      units: Array.from({ length: 4 }, (_, i) => unit({ kcId: `k${i}` })),
      cars: [cars({ carsSkill: 'FOC', v: -2 }), cars({ carsSkill: 'RWT', v: -2 })],
    });
    const specs = selectPracticeQueue(snap, 6);
    const carsPositions = specs
      .map((s, i) => (s.domain === 'cars' ? i : -1))
      .filter((i) => i >= 0);
    // The two CARS specs are not adjacent.
    if (carsPositions.length === 2) {
      expect(Math.abs(carsPositions[0]! - carsPositions[1]!)).toBeGreaterThan(1);
    }
  });
});

describe('practiceSpecId', () => {
  it('is stable and encodes the spec shape', () => {
    expect(
      practiceSpecId({
        domain: 'science',
        purpose: 'train',
        kcId: 'kc-1',
        skill: 'EXPLAIN',
        dok: 2,
        difficultyBand: [0, 1],
      }),
    ).toBe('sci:kc-1:EXPLAIN:d2:train');
    expect(
      practiceSpecId({ domain: 'cars', purpose: 'probe', carsSkill: 'FOC', difficultyBand: [0, 1] }),
    ).toBe('cars:FOC:probe');
  });
});
