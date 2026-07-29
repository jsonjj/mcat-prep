import { describe, expect, it } from 'vitest';
import {
  fixedClock,
  UtcTimestampSchema,
  type CarsSkill,
  type Clock,
  type PracticeQuestion,
} from '@mcat/contracts';
import { loadSyntheticBank } from '@mcat/content';
import { Authority } from './authority';
import {
  SyntheticPracticeBankPort,
  type PracticeBankItem,
  type PracticeItemClassification,
  type PracticeItemQuery,
} from './practice';
import type { LearnerState } from './types';

/**
 * WS7 — a weak CARS Duel becomes a concrete, spaced repair in Mistakes.
 *
 * The synthetic bank reports `carsSkill: null` for every item, so the CARS branch
 * of selection/classification is only reachable through a port that knows a CARS
 * sub-skill. This fixture stands in for the deployed Postgres corpus: it serves a
 * specific real-looking CARS item per sub-skill and classifies answers back to it
 * — exactly what the deployed `PostgresPracticeBankPort` does off `primary_skill`.
 */
const CARS_ITEMS: Readonly<Record<string, CarsSkill>> = {
  'cars-foc-1': 'FOC',
  'cars-rwt-1': 'RWT',
  'cars-rbt-1': 'RBT',
  'cars-rbt-2': 'RBT',
};

const carsQuestion = (id: string): PracticeQuestion => ({
  id,
  section: 'cars',
  cluster: 'CA1',
  passage: 'A short passage the author uses to make a contestable claim.',
  stem: `What does the passage most suggest about ${CARS_ITEMS[id]} reasoning?`,
  choices: [
    { id: 'A', text: 'Option A' },
    { id: 'B', text: 'Option B' },
    { id: 'C', text: 'Option C' },
    { id: 'D', text: 'Option D' },
  ],
});

class CarsRepairBank extends SyntheticPracticeBankPort {
  /** The pinned item id the selector should pick for each sub-skill. */
  static pinnedFor(skill: CarsSkill): string {
    return `cars-${skill.toLowerCase()}-1`;
  }

  override async findItems(
    query: PracticeItemQuery,
    input: { excludeIds: readonly string[]; limit: number },
  ): Promise<PracticeBankItem[]> {
    if (query.domain === 'cars' && query.carsSkill !== undefined) {
      const id = CarsRepairBank.pinnedFor(query.carsSkill);
      if (input.excludeIds.includes(id)) return [];
      return [
        {
          question: carsQuestion(id),
          b: null,
          attempts: 0,
          correct: 0,
          dok: null,
          kcId: null,
          skill: null,
          carsSkill: query.carsSkill,
          cluster: 'CA1',
          domain: 'cars',
        },
      ];
    }
    return super.findItems(query, input);
  }

  override async classify(questionId: string): Promise<PracticeItemClassification | null> {
    const skill = CARS_ITEMS[questionId];
    if (skill !== undefined) {
      return {
        kcId: null,
        skill: null,
        carsSkill: skill,
        cluster: 'CA1',
        domain: 'cars',
        dok: null,
        lessonId: null,
        familyId: null,
      };
    }
    return super.classify(questionId);
  }

  override async getQuestion(questionId: string): Promise<PracticeQuestion | null> {
    if (CARS_ITEMS[questionId] !== undefined) return carsQuestion(questionId);
    return super.getQuestion(questionId);
  }
}

const T0 = '2026-07-27T12:00:00.000Z';
const LATER = '2026-07-27T13:00:00.000Z';
const EARLIER = '2026-07-27T11:00:00.000Z';

// One immutable content bank for the whole file (per-learner state is fresh each
// test; the port's exposure/attempt maps are fresh because the port is `new`).
const BANK = loadSyntheticBank();

function learner(clock: Clock = fixedClock(T0)): { authority: Authority; state: LearnerState } {
  const authority = new Authority(BANK, clock, new CarsRepairBank(BANK));
  return { authority, state: authority.createGuest() };
}

/** Directly log a correct CARS answer — stands in for the served practice attempt. */
const logCorrectCars = (
  authority: Authority,
  state: LearnerState,
  questionId: string,
  occurredAt: string,
) =>
  authority.practiceBank.recordPracticeAttempt(state.learnerId, {
    questionId,
    kcId: null,
    skill: null,
    cluster: 'CA1',
    familyId: null,
    chosenChoiceId: 'A',
    correct: true,
    firstAttempt: true,
    activityType: 'practice',
    occurredAt: UtcTimestampSchema.parse(occurredAt),
  });

const WEAK = { position: 1, argument: 1, application: 0 } as const; // R ≈ 0.16, weakest = application → RBT
const STRONG = { position: 3, argument: 3, application: 3 } as const; // R = 1.0

describe('WS7 — a weak CARS Duel enqueues a CARS reasoning-pattern repair', () => {
  it('pins a real CARS item of the mapped sub-skill (weakest dimension → RBT)', async () => {
    const { authority, state } = learner();
    await authority.recordCarsDuel(state, { rubric: WEAK });

    expect(state.carsRepairs).toHaveLength(1);
    const repair = state.carsRepairs![0]!;
    expect(repair.skill).toBe('RBT');
    expect(repair.questionId).toBe('cars-rbt-1');
    // The classified sub-skill of the pinned item is the mapped sub-skill.
    expect((await authority.practiceBank.classify(repair.questionId))?.carsSkill).toBe('RBT');
    expect(repair.holdRate).toBeGreaterThanOrEqual(0);
    expect(repair.holdRate).toBeLessThan(0.75);
  });

  it('does not enqueue a repair for a competent duel (at/above the bar)', async () => {
    const { authority, state } = learner();
    await authority.recordCarsDuel(state, { rubric: STRONG });
    expect(state.carsRepairs ?? []).toEqual([]);
  });

  it('keeps at most one open repair per sub-skill, refreshing it in place', async () => {
    const { authority, state } = learner();
    await authority.recordCarsDuel(state, { rubric: { application: 0 } }); // RBT
    await authority.recordCarsDuel(state, { rubric: { application: 1 } }); // RBT again
    const rbt = (state.carsRepairs ?? []).filter((r) => r.skill === 'RBT');
    expect(rbt).toHaveLength(1);
  });

  it('tracks distinct sub-skills separately', async () => {
    const { authority, state } = learner();
    await authority.recordCarsDuel(state, { rubric: { position: 0, argument: 1, application: 1 } }); // FOC
    await authority.recordCarsDuel(state, { rubric: { position: 1, argument: 0, application: 1 } }); // RWT
    expect(new Set((state.carsRepairs ?? []).map((r) => r.skill))).toEqual(new Set(['FOC', 'RWT']));
  });

  it('writes NO BKT mastery on the repair path (formative, like the duel itself)', async () => {
    const { authority, state } = learner();
    await authority.recordCarsDuel(state, { rubric: WEAK });

    // A repair was created…
    expect(state.carsRepairs).toHaveLength(1);
    // …but no capability grain moved: no KC and no reasoning-operation BKT.
    expect(state.mastery?.kc ?? {}).toEqual({});
    expect(state.mastery?.skill ?? {}).toEqual({});
    expect(authority.getMasterySkills(state).some((s) => s.atCapabilityCut)).toBe(false);
    // The formative CARS ability V nudge (K=0.08) is the only capability signal.
    expect(Object.keys(state.mastery?.cars ?? {}).length).toBeGreaterThan(0);
  });
});

describe('WS7 — the repair surfaces in Mistakes and resolves on a later correct CARS item', () => {
  it('surfaces the pinned passage, the sub-skill, and the flag reason', async () => {
    const { authority, state } = learner();
    await authority.recordCarsDuel(state, { rubric: WEAK });

    const patterns = await authority.getCarsReasoningPatterns(state);
    expect(patterns).toHaveLength(1);
    const p = patterns[0]!;
    expect(p.skill).toBe('RBT');
    expect(p.title).toBe('Reasoning Beyond the Text');
    expect(p.questionId).toBe('cars-rbt-1');
    expect(p.passageStem).toContain('RBT');
    expect(p.focus).toBe('cars-rbt');
    expect(p.holdRatePct).toBeGreaterThanOrEqual(0);
    expect(p.holdRatePct).toBeLessThan(75);
    expect(p.resolved).toBe(false);
  });

  it('resolves when a LATER correct CARS answer lands in the same sub-skill', async () => {
    const { authority, state } = learner();
    await authority.recordCarsDuel(state, { rubric: WEAK }); // RBT repair at T0
    expect((await authority.getCarsReasoningPatterns(state))[0]!.resolved).toBe(false);

    // A different RBT item, answered correctly, after the duel.
    await logCorrectCars(authority, state, 'cars-rbt-2', LATER);
    expect((await authority.getCarsReasoningPatterns(state))[0]!.resolved).toBe(true);
  });

  it('also resolves when the offered passage itself is answered correctly', async () => {
    const { authority, state } = learner();
    await authority.recordCarsDuel(state, { rubric: WEAK });
    await logCorrectCars(authority, state, 'cars-rbt-1', LATER);
    expect((await authority.getCarsReasoningPatterns(state))[0]!.resolved).toBe(true);
  });

  it('is NOT resolved by a correct answer in a different sub-skill', async () => {
    const { authority, state } = learner();
    await authority.recordCarsDuel(state, { rubric: WEAK }); // RBT
    await logCorrectCars(authority, state, 'cars-foc-1', LATER); // FOC, not RBT
    expect((await authority.getCarsReasoningPatterns(state))[0]!.resolved).toBe(false);
  });

  it('is NOT resolved by a same-skill correct answer that predates the flag', async () => {
    const { authority, state } = learner();
    // A correct RBT answer BEFORE the duel must not pre-clear the repair.
    await logCorrectCars(authority, state, 'cars-rbt-2', EARLIER);
    await authority.recordCarsDuel(state, { rubric: WEAK }); // RBT at T0 > EARLIER
    expect((await authority.getCarsReasoningPatterns(state))[0]!.resolved).toBe(false);
  });

  it('reads no CARS reasoning patterns when none were flagged, and moves no mastery', async () => {
    const { authority, state } = learner();
    const before = JSON.stringify(state.mastery ?? {});
    expect(await authority.getCarsReasoningPatterns(state)).toEqual([]);
    expect(JSON.stringify(state.mastery ?? {})).toBe(before);
  });
});
