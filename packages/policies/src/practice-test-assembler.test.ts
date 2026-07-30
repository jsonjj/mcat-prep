import { describe, expect, it } from 'vitest';
import type { CarsSkill, QuestionFormat, ReasoningOperation, Section, SkillCluster } from '@mcat/contracts';
import {
  assemblePracticeTest,
  candidateSkillKey,
  composeForm,
  HALF_LENGTH_BLUEPRINT,
  PracticeTestAssemblyError,
  poolSupportsPracticeTest,
  practiceTestBlueprintFor,
  PRACTICE_TEST_BLUEPRINTS,
  PRACTICE_TEST_TIER_TOTALS,
  scalePracticeTestBlueprint,
  validatePracticeTestForm,
  type PracticeTestBlueprint,
  type PracticeTestCandidate,
  type PracticeTestLengthTier,
} from './practice-test-assembler';

/**
 * A small blueprint the synthetic pool below can satisfy with room to spare, so
 * the assertions are about the assembler's guarantees rather than about a
 * particular corpus.
 */
const BP: PracticeTestBlueprint = {
  totalItems: 24,
  sectionFloors: { cp: 5, cars: 6, bb: 5, ps: 4 },
  skillFloors: { QUANTIFY: 2, EXPLAIN: 1, FOC: 2, RWT: 2, RBT: 1 },
  formatFloors: { passage_mcq: 6, discrete_mcq: 4 },
};

const SCIENCE_SECTIONS: readonly Section[] = ['cp', 'bb', 'ps'];
const CLUSTER_BY_SECTION: Record<Section, SkillCluster> = {
  cp: 'CP1',
  bb: 'BB1',
  ps: 'PS2',
  cars: 'CA1',
};
const OPS: readonly ReasoningOperation[] = ['IDENTIFY', 'QUANTIFY', 'EXPLAIN', 'RELATE', 'EVIDENCE'];
const CARS_SKILLS: readonly CarsSkill[] = ['FOC', 'RWT', 'RBT'];

/**
 * A generous, well-mixed candidate pool: plenty of every section, both formats
 * in the sciences, all three CARS sub-skills, all reasoning operations.
 */
function makePool(): PracticeTestCandidate[] {
  const out: PracticeTestCandidate[] = [];
  let n = 0;
  const push = (c: Omit<PracticeTestCandidate, 'questionId' | 'eligible' | 'familyId' | 'dokLevel'>) => {
    n += 1;
    out.push({
      questionId: `q-${c.section}-${n}`,
      familyId: `fam-${n}`,
      dokLevel: (n % 3) + 1,
      eligible: true,
      ...c,
    });
  };
  for (const section of SCIENCE_SECTIONS) {
    for (let i = 0; i < 12; i += 1) {
      const format: QuestionFormat = i % 2 === 0 ? 'passage_mcq' : 'discrete_mcq';
      push({
        section,
        cluster: CLUSTER_BY_SECTION[section],
        skill: OPS[i % OPS.length]!,
        carsSkill: null,
        format,
      });
    }
  }
  for (let i = 0; i < 18; i += 1) {
    push({
      section: 'cars',
      cluster: i % 2 === 0 ? 'CA1' : 'CA2',
      skill: null,
      carsSkill: CARS_SKILLS[i % CARS_SKILLS.length]!,
      format: 'passage_mcq',
    });
  }
  return out;
}

describe('practice test assembler — blueprint floors', () => {
  it('assembles a form that provably meets every floor', () => {
    const { items, composition } = assemblePracticeTest(makePool(), { blueprint: BP, seed: 's1' });

    // Independent re-validation: the assembler's own gate, asserted from outside.
    expect(validatePracticeTestForm(items, BP)).toEqual([]);
    expect(composition.total).toBe(BP.totalItems);
    for (const [section, floor] of Object.entries(BP.sectionFloors)) {
      expect(composition.bySection[section] ?? 0, `section ${section}`).toBeGreaterThanOrEqual(floor);
    }
    for (const [skill, floor] of Object.entries(BP.skillFloors)) {
      expect(composition.bySkill[skill] ?? 0, `skill ${skill}`).toBeGreaterThanOrEqual(floor);
    }
    for (const [format, floor] of Object.entries(BP.formatFloors)) {
      expect(composition.byFormat[format] ?? 0, `format ${format}`).toBeGreaterThanOrEqual(floor);
    }
  });

  it('INCLUDES CARS even though the diagnostic omits it', () => {
    const { items } = assemblePracticeTest(makePool(), { blueprint: BP, seed: 's1' });
    const cars = items.filter((i) => i.section === 'cars');
    expect(cars.length).toBeGreaterThanOrEqual(BP.sectionFloors.cars);
    // All three CARS sub-skills are represented, not just one.
    const carsSkills = new Set(cars.map((i) => i.carsSkill));
    expect(carsSkills.has('FOC')).toBe(true);
    expect(carsSkills.has('RWT')).toBe(true);
    expect(carsSkills.has('RBT')).toBe(true);
  });

  it('never reuses a previously-scored item (fresh items only)', () => {
    const pool = makePool();
    const first = assemblePracticeTest(pool, { blueprint: BP, seed: 'sitting-1' });
    const firstIds = new Set(first.items.map((i) => i.questionId));

    // Second sitting excludes everything scored on the first.
    const second = assemblePracticeTest(pool, {
      blueprint: BP,
      seed: 'sitting-2',
      excludeIds: firstIds,
    });
    const overlap = second.items.filter((i) => firstIds.has(i.questionId));
    expect(overlap).toEqual([]);
    // And the second form still meets every floor from the fresh remainder.
    expect(validatePracticeTestForm(second.items, BP)).toEqual([]);
  });

  it('produces a deterministic form for a given seed and a different one for another', () => {
    const pool = makePool();
    const a = assemblePracticeTest(pool, { blueprint: BP, seed: 'seed-A' });
    const aAgain = assemblePracticeTest(pool, { blueprint: BP, seed: 'seed-A' });
    const b = assemblePracticeTest(pool, { blueprint: BP, seed: 'seed-B' });
    expect(a.items.map((i) => i.questionId)).toEqual(aAgain.items.map((i) => i.questionId));
    expect(a.items.map((i) => i.questionId)).not.toEqual(b.items.map((i) => i.questionId));
  });

  it('excludes ineligible items from the form', () => {
    const pool = makePool().map((c, i) => (i % 7 === 0 ? { ...c, eligible: false } : c));
    const { items } = assemblePracticeTest(pool, { blueprint: BP, seed: 's' });
    expect(items.every((i) => i.eligible)).toBe(true);
  });
});

describe('practice test assembler — validate before serve', () => {
  it('rejects (throws) when a section floor cannot be met — e.g. a bank with no CARS', () => {
    const noCars = makePool().filter((c) => c.section !== 'cars');
    expect(() => assemblePracticeTest(noCars, { blueprint: BP, seed: 's' })).toThrow(
      PracticeTestAssemblyError,
    );
    try {
      assemblePracticeTest(noCars, { blueprint: BP, seed: 's' });
    } catch (error) {
      const violations = (error as PracticeTestAssemblyError).violations;
      expect(violations.some((v) => v.dimension === 'section' && v.key === 'cars')).toBe(true);
    }
  });

  it('rejects when a skill floor cannot be met', () => {
    // Strip every RBT item; the CARS section floor can still be met via FOC/RWT,
    // but the RBT skill floor cannot.
    const noRbt = makePool().filter((c) => c.carsSkill !== 'RBT');
    expect(() => assemblePracticeTest(noRbt, { blueprint: BP, seed: 's' })).toThrow(
      PracticeTestAssemblyError,
    );
  });

  it('poolSupportsPracticeTest reports feasibility without throwing', () => {
    expect(poolSupportsPracticeTest(makePool(), { blueprint: BP })).toBe(true);
    expect(
      poolSupportsPracticeTest(
        makePool().filter((c) => c.section !== 'cars'),
        { blueprint: BP },
      ),
    ).toBe(false);
  });

  it('validatePracticeTestForm names each unmet floor on a hand-built short form', () => {
    // A form with too few CARS and a missing format.
    const items = makePool()
      .filter((c) => c.section === 'cp')
      .slice(0, 10);
    const violations = validatePracticeTestForm(items, BP);
    expect(violations.some((v) => v.dimension === 'total')).toBe(true);
    expect(violations.some((v) => v.dimension === 'section' && v.key === 'cars')).toBe(true);
  });

  it('the served half-length blueprint sums its section floors below the total (leaves slack)', () => {
    const floorSum = Object.values(HALF_LENGTH_BLUEPRINT.sectionFloors).reduce((s, n) => s + n, 0);
    expect(floorSum).toBeLessThanOrEqual(HALF_LENGTH_BLUEPRINT.totalItems);
    // CARS is a real, non-trivial floor — the defining difference from the diagnostic.
    expect(HALF_LENGTH_BLUEPRINT.sectionFloors.cars).toBeGreaterThan(0);
  });
});

/**
 * The DEFAULT blueprint against a pool shaped like the REAL ~2,108-item pull, AS
 * THE SERVER BANK RESOLVES IT. `practice-test-bank.ts` calls
 * `resolveReasoningOperation` with `primary_skill` ONLY (no construct text), so
 * the whole SIRS2 mass collapses to EXPLAIN and QUANTIFY/PREDICT/RELATE never
 * appear; every pulled row has a passage, so all items are `passage_mcq` and
 * there are zero discrete. These are the verified counts the assembler must
 * survive — testing the SHIPPED blueprint, not a bespoke feasible one.
 */
const CORPUS_SCIENCE_OPS: ReadonlyArray<readonly [ReasoningOperation, number]> = [
  ['IDENTIFY', 379], // SIRS1
  ['EXPLAIN', 1248], // SIRS2 → EXPLAIN (no construct text on the pull)
  ['DESIGN', 235], // SIRS3
  ['EVIDENCE', 86], // SIRS4
];
const CORPUS_CARS_SKILLS: ReadonlyArray<readonly [CarsSkill, number]> = [
  ['FOC', 52],
  ['RWT', 64],
  ['RBT', 44],
];

/** A candidate pool shaped exactly like the resolved real corpus (2,108 items). */
function makeCorpusShapedPool(): PracticeTestCandidate[] {
  const out: PracticeTestCandidate[] = [];
  let n = 0;
  // Spread science items round-robin across the three science sections so each
  // clears its section floor while the (global) reasoning-op counts stay the
  // real histogram.
  for (const [op, count] of CORPUS_SCIENCE_OPS) {
    for (let i = 0; i < count; i += 1) {
      const section = SCIENCE_SECTIONS[n % SCIENCE_SECTIONS.length]!;
      n += 1;
      out.push({
        questionId: `sci-${op}-${i}`,
        section,
        cluster: CLUSTER_BY_SECTION[section],
        skill: op,
        carsSkill: null,
        format: 'passage_mcq', // every pulled row carries a passage
        dokLevel: (i % 3) + 1,
        familyId: `fam-sci-${op}-${i}`,
        eligible: true,
      });
    }
  }
  for (const [carsSkill, count] of CORPUS_CARS_SKILLS) {
    for (let i = 0; i < count; i += 1) {
      out.push({
        questionId: `cars-${carsSkill}-${i}`,
        section: 'cars',
        cluster: CLUSTER_BY_SECTION.cars,
        skill: null,
        carsSkill,
        format: 'passage_mcq',
        dokLevel: (i % 3) + 1,
        familyId: `fam-cars-${carsSkill}-${i}`,
        eligible: true,
      });
    }
  }
  return out;
}

/**
 * The pre-fix default blueprint (main @ beae3f5), kept literal so this test
 * documents exactly which floors the real corpus could not supply.
 */
const PRE_FIX_BLUEPRINT: PracticeTestBlueprint = {
  totalItems: 115,
  sectionFloors: { cp: 29, cars: 26, bb: 29, ps: 26 },
  skillFloors: {
    IDENTIFY: 4,
    PREDICT: 3,
    EXPLAIN: 3,
    RELATE: 2,
    QUANTIFY: 4,
    DESIGN: 2,
    EVIDENCE: 3,
    FOC: 6,
    RWT: 8,
    RBT: 8,
  },
  formatFloors: { passage_mcq: 40, discrete_mcq: 20 },
};

describe('practice test assembler — DEFAULT blueprint is feasible against the real corpus', () => {
  it('the corpus-shaped pool has the resolved shape the bug hinged on', () => {
    const pool = makeCorpusShapedPool();
    expect(pool.length).toBe(2108);
    // The operations a primary_skill-only pull cannot resolve are simply absent.
    expect(pool.some((c) => c.skill === 'QUANTIFY')).toBe(false);
    expect(pool.some((c) => c.skill === 'PREDICT')).toBe(false);
    expect(pool.some((c) => c.skill === 'RELATE')).toBe(false);
    // And not a single discrete item — every pull row has a passage.
    expect(pool.some((c) => c.format === 'discrete_mcq')).toBe(false);
  });

  it('poolSupportsPracticeTest is TRUE for the shipped HALF_LENGTH_BLUEPRINT', () => {
    // The regression guard: the exact pool shape the served default blueprint
    // 500'd on must now assemble a blueprint-valid form.
    const pool = makeCorpusShapedPool();
    expect(poolSupportsPracticeTest(pool, { blueprint: HALF_LENGTH_BLUEPRINT })).toBe(true);

    const { items } = assemblePracticeTest(pool, {
      blueprint: HALF_LENGTH_BLUEPRINT,
      seed: 'corpus-shaped',
    });
    expect(validatePracticeTestForm(items, HALF_LENGTH_BLUEPRINT)).toEqual([]);
  });

  it('would have CAUGHT the bug: the pre-fix blueprint is infeasible on the same pool', () => {
    // QUANTIFY/PREDICT/RELATE (0 in the corpus) and discrete_mcq:20 (also 0) are
    // unsatisfiable, so the pre-fix default blueprint cannot be served — this is
    // the 500 the eval saw, reproduced as a feasibility failure.
    const pool = makeCorpusShapedPool();
    expect(poolSupportsPracticeTest(pool, { blueprint: PRE_FIX_BLUEPRINT })).toBe(false);
  });
});

describe('practice test assembler — variable-length blueprint family', () => {
  const TIERS: readonly PracticeTestLengthTier[] = ['short', 'standard', 'long'];

  it('the long tier is byte-identical to the shipped HALF_LENGTH_BLUEPRINT', () => {
    expect(PRACTICE_TEST_BLUEPRINTS.long).toEqual(HALF_LENGTH_BLUEPRINT);
    expect(practiceTestBlueprintFor('long')).toBe(HALF_LENGTH_BLUEPRINT);
  });

  it('each tier hits its target length, with floors summing below it (balance slack)', () => {
    for (const tier of TIERS) {
      const bp = PRACTICE_TEST_BLUEPRINTS[tier];
      expect(bp.totalItems).toBe(PRACTICE_TEST_TIER_TOTALS[tier]);
      const floorSum = Object.values(bp.sectionFloors).reduce((s, n) => s + n, 0);
      expect(floorSum, `${tier} section floors`).toBeLessThanOrEqual(bp.totalItems);
      // CARS is a real, non-trivial floor at every tier — the defining property.
      expect(bp.sectionFloors.cars, `${tier} cars floor`).toBeGreaterThan(0);
    }
  });

  it('scales floors down monotonically as the form shrinks', () => {
    expect(PRACTICE_TEST_BLUEPRINTS.short.totalItems).toBeLessThan(
      PRACTICE_TEST_BLUEPRINTS.standard.totalItems,
    );
    expect(PRACTICE_TEST_BLUEPRINTS.standard.totalItems).toBeLessThan(
      PRACTICE_TEST_BLUEPRINTS.long.totalItems,
    );
    expect(PRACTICE_TEST_BLUEPRINTS.short.sectionFloors.cp).toBeLessThanOrEqual(
      PRACTICE_TEST_BLUEPRINTS.standard.sectionFloors.cp,
    );
  });

  it('every tier is feasible against the real corpus-shaped pool, CARS included', () => {
    const pool = makeCorpusShapedPool();
    for (const tier of TIERS) {
      const bp = PRACTICE_TEST_BLUEPRINTS[tier];
      expect(poolSupportsPracticeTest(pool, { blueprint: bp }), `${tier} feasible`).toBe(true);
      const { items } = assemblePracticeTest(pool, { blueprint: bp, seed: `corpus-${tier}` });
      expect(validatePracticeTestForm(items, bp), `${tier} valid`).toEqual([]);
      expect(items.length).toBe(bp.totalItems);
      expect(items.filter((c) => c.section === 'cars').length).toBeGreaterThanOrEqual(
        bp.sectionFloors.cars,
      );
    }
  });

  it('scalePracticeTestBlueprint keeps a CARS floor even on the shortest forms', () => {
    const tiny = scalePracticeTestBlueprint(12);
    expect(tiny.totalItems).toBe(12);
    expect(tiny.sectionFloors.cars).toBeGreaterThanOrEqual(1);
  });
});

describe('practice test assembler — composition helpers', () => {
  it('candidateSkillKey uses cars sub-skill for CARS and reasoning op otherwise', () => {
    const cars = makePool().find((c) => c.section === 'cars')!;
    const science = makePool().find((c) => c.section === 'cp')!;
    expect(candidateSkillKey(cars)).toBe(cars.carsSkill);
    expect(candidateSkillKey(science)).toBe(science.skill);
  });

  it('composeForm counts every floored dimension', () => {
    const comp = composeForm(makePool().slice(0, 5));
    expect(comp.total).toBe(5);
    expect(Object.values(comp.bySection).reduce((s, n) => s + n, 0)).toBe(5);
  });
});
