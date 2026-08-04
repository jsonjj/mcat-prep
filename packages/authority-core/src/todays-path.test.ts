import { describe, expect, it } from 'vitest';
import { fixedClock, type CandidateLessonInput, type UtcTimestamp } from '@mcat/contracts';
import { loadSyntheticBank, orderedKcsForLesson } from '@mcat/content';
import { kcsByFc, lessonsByFc, PRIOR_PL0 } from '@mcat/policies';
import { Authority } from './authority';
import { SyntheticPracticeBankPort, type PracticeItemClassification } from './practice';
import type { LearnerState, PracticeTestCompletion } from './types';

const clock = fixedClock('2026-07-20T12:00:00.000Z');

function onboard(auth: Authority): LearnerState {
  const state = auth.createGuest();
  let next = auth.diagnosticNext(state);
  while (!next.done) {
    auth.submitDiagnosticAnswer(state, next.questionId!, 'A');
    next = auth.diagnosticNext(state);
  }
  auth.confirmPlan(state, { testDate: null, targetScore: 515, minutesPerWeek: 1260 });
  return state;
}

const EMPTY_LOAD = {
  dueLearning: 0,
  dueReviews: 0,
  newAvailable: 0,
  due: 0,
  estimatedMinutesForDue: 0,
};
const candidateLessons = [
  {
    lessonId: 'les-a',
    slug: 'a',
    title: 'Lesson A',
    section: 'bb',
    cluster: null,
    kcCount: 4,
    kcIds: ['kc-a1', 'kc-a2'],
    prerequisiteLessonIds: [],
    estimatedMinutes: 20,
  },
  {
    lessonId: 'les-b',
    slug: 'b',
    title: 'Lesson B',
    section: 'cp',
    cluster: null,
    kcCount: 2,
    kcIds: ['kc-b1'],
    prerequisiteLessonIds: [],
    estimatedMinutes: 20,
  },
];

const SEEDED_LESSON_ID = 'V3-LES-789208';
const UNSEEDED_LESSON_ID = 'V3-LES-844372';
const seededLessonKcs = orderedKcsForLesson(SEEDED_LESSON_ID);
const unseededLessonKcs = orderedKcsForLesson(UNSEEDED_LESSON_ID);
if (seededLessonKcs === null || unseededLessonKcs === null) {
  throw new Error('planner regression lessons must have registry membership');
}
const SEEDED_LESSON_KCS = seededLessonKcs;
const UNSEEDED_LESSON_KCS = unseededLessonKcs;

/**
 * A seedable candidate pair: two lessons in two different Foundational Concepts.
 *
 * Discovered from the pinned registry rather than written down, because which
 * lessons are both FC-tagged and have resolvable ordered-KC membership is
 * generated data. `SEEDED_LESSON_ID` and `UNSEEDED_LESSON_ID` above carry no FC
 * tag at all, so no diagnostic seed can reach either of them.
 */
interface SeedableCandidate {
  readonly concept: string;
  readonly lessonId: string;
  readonly candidate: CandidateLessonInput;
}

const conceptPriors = (concept: string, prior: number): Record<string, number> => {
  const kcs = kcsByFc(orderedKcsForLesson).get(concept);
  if (kcs === undefined || kcs.length === 0) throw new Error(`${concept} has no KC membership`);
  return Object.fromEntries(kcs.map((kcId) => [kcId, prior]));
};

function seedableCandidatePair(): readonly [SeedableCandidate, SeedableCandidate] {
  const found: SeedableCandidate[] = [];
  for (const [concept, lessonIds] of [...lessonsByFc()].sort(([a], [b]) => a.localeCompare(b))) {
    const lessonId = [...lessonIds].sort().find((id) => (orderedKcsForLesson(id) ?? []).length > 0);
    if (lessonId === undefined) continue;
    found.push({
      concept,
      lessonId,
      candidate: {
        lessonId,
        slug: `seedable-${concept.toLowerCase()}`,
        title: `Lesson in ${concept}`,
        section: 'bb',
        cluster: null,
        kcCount: 4,
        kcIds: [...orderedKcsForLesson(lessonId)!],
        prerequisiteLessonIds: [],
        estimatedMinutes: 20,
      },
    });
    if (found.length === 2) return [found[0]!, found[1]!];
  }
  throw new Error('the registry must carry two FC-tagged lessons with resolvable KC membership');
}

const plannerRegressionCandidates: CandidateLessonInput[] = [
  {
    lessonId: SEEDED_LESSON_ID,
    slug: 'a-seeded',
    title: 'Seeded lesson',
    section: 'bb',
    cluster: null,
    kcCount: 4,
    kcIds: [...SEEDED_LESSON_KCS],
    prerequisiteLessonIds: [],
    estimatedMinutes: 20,
  },
  {
    lessonId: UNSEEDED_LESSON_ID,
    slug: 'z-unseeded',
    title: 'Unseeded lesson',
    section: 'bb',
    cluster: null,
    kcCount: 4,
    kcIds: [...UNSEEDED_LESSON_KCS],
    prerequisiteLessonIds: [],
    estimatedMinutes: 20,
  },
];

class LessonMappedPracticeBank extends SyntheticPracticeBankPort {
  override async classify(questionId: string): Promise<PracticeItemClassification | null> {
    const base = await super.classify(questionId);
    return base === null
      ? null
      : {
          ...base,
          domain: 'science',
          kcId: SEEDED_LESSON_KCS[0]!,
          skill: 'IDENTIFY',
          lessonId: SEEDED_LESSON_ID,
        };
  }
}

describe('Authority — Today\u2019s Path (orchestrator; writes no mastery)', () => {
  it('builds and persists a plan and WRITES NO MASTERY', async () => {
    const auth = new Authority(loadSyntheticBank(), clock);
    const state = onboard(auth);
    const before = auth.getMasterySkills(state).map((s) => s.pL);

    const view = await auth.buildTodaysPath(state, {
      recallLoad: EMPTY_LOAD,
      candidateLessons,
      force: false,
    });
    expect(view.built).toBe(true);
    expect(view.activities.length).toBeGreaterThan(0);
    expect(view.activities.some((a) => a.kind === 'cars_duel')).toBe(true);
    expect(state.plan).toBeDefined();

    // Planning reads mastery but must never move it.
    expect(auth.getMasterySkills(state).map((s) => s.pL)).toEqual(before);
  });

  it('is idempotent per day unless forced', async () => {
    const auth = new Authority(loadSyntheticBank(), clock);
    const state = onboard(auth);
    await auth.buildTodaysPath(state, { recallLoad: EMPTY_LOAD, candidateLessons, force: false });
    const v1 = state.plan!.version;
    await auth.buildTodaysPath(state, { recallLoad: EMPTY_LOAD, candidateLessons, force: false });
    expect(state.plan!.version).toBe(v1);
    await auth.buildTodaysPath(state, { recallLoad: EMPTY_LOAD, candidateLessons, force: true });
    expect(state.plan!.version).toBe(v1 + 1);
  });

  it('sizes the day to the chosen preset', async () => {
    const auth = new Authority(loadSyntheticBank(), clock);
    const state = onboard(auth);
    auth.setDailyBudget(state, 120);
    const view = await auth.buildTodaysPath(state, {
      recallLoad: EMPTY_LOAD,
      candidateLessons,
      force: true,
    });
    expect(view.dailyMinutesPreset).toBe(120);
    expect(view.dailyBudgetMinutes).toBe(120);
    expect(view.plannedMinutes).toBeLessThanOrEqual(120);
  });

  it('passes a candidate lesson’s real duration through to the scheduler', async () => {
    const auth = new Authority(loadSyntheticBank(), clock);
    const state = onboard(auth);
    auth.setDailyBudget(state, 120);

    const view = await auth.buildTodaysPath(state, {
      recallLoad: EMPTY_LOAD,
      candidateLessons: [{ ...candidateLessons[0]!, estimatedMinutes: 57 }],
      force: true,
    });

    expect(view.activities.find((activity) => activity.kind === 'lesson')?.estimatedMinutes).toBe(
      57,
    );
  });

  it('injects Recall as the next step when a deck is added after the plan was built', async () => {
    const auth = new Authority(loadSyntheticBank(), clock);
    const state = onboard(auth);
    // Built with no cards due → no Recall block.
    const first = await auth.buildTodaysPath(state, {
      recallLoad: EMPTY_LOAD,
      candidateLessons,
      force: false,
    });
    expect(first.activities.some((a) => a.kind === 'recall')).toBe(false);

    // Learner adds a deck → cards now due. A plain (non-force) rebuild injects Recall.
    const dueLoad = {
      dueLearning: 4,
      dueReviews: 16,
      newAvailable: 6,
      due: 20,
      estimatedMinutesForDue: 7,
    };
    const after = await auth.buildTodaysPath(state, {
      recallLoad: dueLoad,
      candidateLessons,
      force: false,
    });
    const recall = after.activities.find((a) => a.kind === 'recall');
    expect(recall).toBeDefined();
    expect(recall!.count!).toBeGreaterThan(0); // Recall gets a card count to stop at
    // Nothing started yet → Recall is the very first / current activity.
    expect(after.activities[0]!.kind).toBe('recall');
    expect(after.currentActivityId).toBe(recall!.activityId);

    // Idempotent: rebuilding again does not duplicate the Recall block.
    const again = await auth.buildTodaysPath(state, {
      recallLoad: dueLoad,
      candidateLessons,
      force: false,
    });
    expect(again.activities.filter((a) => a.kind === 'recall').length).toBe(1);
  });

  it('injects Recall for a freshly added deck of NEW cards (none due yet)', async () => {
    const auth = new Authority(loadSyntheticBank(), clock);
    const state = onboard(auth);
    const first = await auth.buildTodaysPath(state, {
      recallLoad: EMPTY_LOAD,
      candidateLessons,
      force: false,
    });
    expect(first.activities.some((a) => a.kind === 'recall')).toBe(false);

    // Import a deck that is entirely NEW (nothing "due" yet). Recall must still
    // appear so the new cards surface on Today's Path immediately.
    const newOnly = {
      dueLearning: 0,
      dueReviews: 0,
      newAvailable: 8,
      due: 0,
      estimatedMinutesForDue: 0,
    };
    const after = await auth.buildTodaysPath(state, {
      recallLoad: newOnly,
      candidateLessons,
      force: false,
    });
    const recall = after.activities.find((a) => a.kind === 'recall');
    expect(recall).toBeDefined();
    expect(recall!.count!).toBeGreaterThan(0);
    expect(recall!.count!).toBeLessThanOrEqual(8); // never more than are available
    expect(after.activities[0]!.kind).toBe('recall');
  });

  it('grows an unstarted Recall block when more cards are added mid-day', async () => {
    const auth = new Authority(loadSyntheticBank(), clock);
    const state = onboard(auth);
    await auth.buildTodaysPath(state, { recallLoad: EMPTY_LOAD, candidateLessons, force: false });
    const small = {
      dueLearning: 0,
      dueReviews: 0,
      newAvailable: 6,
      due: 0,
      estimatedMinutesForDue: 0,
    };
    const afterSmall = await auth.buildTodaysPath(state, {
      recallLoad: small,
      candidateLessons,
      force: false,
    });
    const smallCount = afterSmall.activities.find((a) => a.kind === 'recall')!.count!;
    expect(smallCount).toBeLessThanOrEqual(6);

    // A bigger deck is added while Recall is still unstarted → the count grows to
    // cover it (still exactly one block, never duplicated).
    const big = {
      dueLearning: 0,
      dueReviews: 0,
      newAvailable: 40,
      due: 0,
      estimatedMinutesForDue: 0,
    };
    const afterBig = await auth.buildTodaysPath(state, {
      recallLoad: big,
      candidateLessons,
      force: false,
    });
    const recalls = afterBig.activities.filter((a) => a.kind === 'recall');
    expect(recalls.length).toBe(1);
    expect(recalls[0]!.count!).toBeGreaterThan(smallCount);
  });

  it('leaves a Recall block the learner already finished today untouched', async () => {
    const auth = new Authority(loadSyntheticBank(), clock);
    const state = onboard(auth);
    await auth.buildTodaysPath(state, { recallLoad: EMPTY_LOAD, candidateLessons, force: false });
    const deck = {
      dueLearning: 0,
      dueReviews: 0,
      newAvailable: 6,
      due: 0,
      estimatedMinutesForDue: 0,
    };
    const after = await auth.buildTodaysPath(state, {
      recallLoad: deck,
      candidateLessons,
      force: false,
    });
    const recall = after.activities.find((a) => a.kind === 'recall')!;
    const finishedCount = recall.count!;
    await auth.recordPlanActivity(state, recall.activityId, 'complete');

    // Adding more cards after finishing recall does NOT re-open or resize it — the
    // day's recall is done (new cards wait for tomorrow / a direct Recall session).
    const more = {
      dueLearning: 0,
      dueReviews: 0,
      newAvailable: 40,
      due: 0,
      estimatedMinutesForDue: 0,
    };
    const later = await auth.buildTodaysPath(state, {
      recallLoad: more,
      candidateLessons,
      force: false,
    });
    const recalls = later.activities.filter((a) => a.kind === 'recall');
    expect(recalls.length).toBe(1);
    expect(recalls[0]!.status).toBe('complete');
    expect(recalls[0]!.count!).toBe(finishedCount);
  });

  it('completes an activity and marks a finished lesson for eligibility', async () => {
    const auth = new Authority(loadSyntheticBank(), clock);
    const state = onboard(auth);
    const view = await auth.buildTodaysPath(state, {
      recallLoad: EMPTY_LOAD,
      candidateLessons,
      force: false,
    });
    const lesson = view.activities.find((a) => a.kind === 'lesson');
    expect(lesson).toBeDefined();

    await auth.recordPlanActivity(state, lesson!.activityId, 'complete');
    const updated = auth.getTodaysPath(state);
    expect(updated.activities.find((a) => a.activityId === lesson!.activityId)!.status).toBe(
      'complete',
    );
    expect(state.completedLessons).toContain(lesson!.lessonId);

    const rebuilt = await auth.buildTodaysPath(state, {
      recallLoad: EMPTY_LOAD,
      candidateLessons,
      force: true,
    });
    // A finished lesson is preserved (shown as complete), never re-offered as new work.
    expect(
      rebuilt.activities.some((a) => a.lessonId === lesson!.lessonId && a.status === 'ready'),
    ).toBe(false);
    const rebuiltLesson = rebuilt.activities.find((a) => a.lessonId === lesson!.lessonId);
    if (rebuiltLesson) expect(rebuiltLesson.status).toBe('complete');
  });

  it('keeps finished work and re-plans the rest when the daily budget changes', async () => {
    const auth = new Authority(loadSyntheticBank(), clock);
    const state = onboard(auth);
    auth.setDailyBudget(state, 180);
    const v1 = await auth.buildTodaysPath(state, {
      recallLoad: EMPTY_LOAD,
      candidateLessons,
      force: true,
    });
    const first = v1.activities.find((a) => a.kind === 'lesson');
    expect(first).toBeDefined();
    await auth.recordPlanActivity(state, first!.activityId, 'complete');

    // Bump the daily time — the finished item is kept, and the day is re-planned larger.
    auth.setDailyBudget(state, 300);
    const v2 = await auth.buildTodaysPath(state, {
      recallLoad: EMPTY_LOAD,
      candidateLessons,
      force: true,
    });
    expect(v2.dailyBudgetMinutes).toBe(300);
    const keptDone = v2.activities.find((a) => a.activityId === first!.activityId);
    expect(keptDone?.status).toBe('complete');
    expect(v2.plannedMinutes).toBeLessThanOrEqual(300);
  });

  it('clamps the daily budget to the 2–6 hr bounds', async () => {
    const auth = new Authority(loadSyntheticBank(), clock);
    const state = onboard(auth);
    auth.setDailyBudget(state, 30); // below 2 hr
    expect(
      (await auth.buildTodaysPath(state, { recallLoad: EMPTY_LOAD, candidateLessons, force: true }))
        .dailyBudgetMinutes,
    ).toBe(120);
    auth.setDailyBudget(state, 900); // above 6 hr
    expect(
      (await auth.buildTodaysPath(state, { recallLoad: EMPTY_LOAD, candidateLessons, force: true }))
        .dailyBudgetMinutes,
    ).toBe(360);
    auth.setDailyBudget(state, 330); // 5 h 30 m — allowed
    expect(
      (await auth.buildTodaysPath(state, { recallLoad: EMPTY_LOAD, candidateLessons, force: true }))
        .dailyBudgetMinutes,
    ).toBe(330);
  });

  /**
   * The candidates here are FC-tagged lessons rather than the two the rest of
   * this file uses, because the seed has to be one the door accepts.
   * `applyMasterySeed` refuses any payload the diagnostic producer could not have
   * emitted, and the producer distributes a CONCEPT's read over every KC beneath
   * it — so the seed names a whole Foundational Concept, and the lesson whose
   * priors move is one inside it. The unseeded lesson is drawn from a DIFFERENT
   * concept, so seeding one leaves the other genuinely at the default prior.
   *
   * `kcCount` is held equal across the pair on purpose: it feeds the planner's
   * unlock term with a 2× swing against mastery's 1.25×, so an unequal pair would
   * let KC count decide the order and the seed would prove nothing.
   */
  it('uses candidate lesson ids to rank KC priors with no practice routing', async () => {
    const auth = new Authority(loadSyntheticBank(), clock);
    const state = auth.createGuest();
    const [seeded, unseeded] = seedableCandidatePair();

    auth.applyMasterySeed(state, {
      kcPriors: conceptPriors(seeded.concept, 0.4),
      skillPriors: {},
      carsAbility: {},
    });

    // Diagnostic KC priors are deliberately not practice: the default lesson read
    // omits them, while the planner must still roll up every supplied candidate.
    expect(state.mastery!.practicedLessonIds).toEqual([]);
    // The seed reached the seeded lesson's KCs and nothing else, so the ranking
    // below is about the priors rather than about which lessons exist.
    expect(auth.getMasteryLessons(state, [seeded.lessonId])[0]!.pL).toBeCloseTo(0.4, 12);
    expect(auth.getMasteryLessons(state, [unseeded.lessonId])[0]!.pL).toBeCloseTo(PRIOR_PL0, 12);

    const view = await auth.buildTodaysPath(state, {
      recallLoad: EMPTY_LOAD,
      candidateLessons: [seeded.candidate, unseeded.candidate],
      force: true,
    });

    expect(
      view.activities
        .filter((activity) => activity.kind === 'lesson')
        .map((activity) => activity.lessonId),
    ).toEqual([unseeded.lessonId, seeded.lessonId]);
  });

  /**
   * The end-to-end shape of the defect this replaces: finishing an instructional
   * lesson wrote `completedLessons`, the snapshot OR'd that into `mastered`, and
   * the engine drops mastered lessons — so a learner who understood nothing
   * never saw the material again. Measured before the fix: rollup
   * `mastered: false`, `pL: 0.2`, evidence count 0, planned lesson activities
   * `[]`.
   *
   * Both halves are asserted, because either alone is satisfiable by the wrong
   * fix: deleting the exclusion makes it reachable AND re-offers it as new work,
   * and keeping the exclusion keeps it off new work AND unreachable.
   */
  it('keeps a completed-but-unmastered lesson reachable, and not as new work', async () => {
    const auth = new Authority(loadSyntheticBank(), clock);
    const state = onboard(auth);
    const today = await auth.buildTodaysPath(state, {
      recallLoad: EMPTY_LOAD,
      candidateLessons: plannerRegressionCandidates,
      force: true,
    });
    const seeded = today.activities.find((a) => a.lessonId === SEEDED_LESSON_ID);
    expect(seeded).toBeDefined();
    await auth.recordPlanActivity(state, seeded!.activityId, 'complete');
    expect(state.completedLessons).toContain(SEEDED_LESSON_ID);

    // Nothing about the learner's capability changed: the lesson is delivered
    // and the mastery claim is withheld, with no evidence behind it at all.
    const rollup = auth.getMasteryLessons(state, [SEEDED_LESSON_ID])[0]!;
    expect(rollup.mastered).toBe(false);
    expect(rollup.pL).toBe(PRIOR_PL0);
    // Scoped to this lesson's own grains: onboarding leaves placement evidence
    // on the synthetic enzyme skills, and none of it is about this material.
    expect(
      state.evidence.filter((e) => SEEDED_LESSON_KCS.includes(e.skillId)),
      'the lesson must carry no warrant at all for this to be the measured case',
    ).toHaveLength(0);

    // Same day: still finished, never re-offered while the learner is standing
    // in front of the plan they just completed it from.
    const sameDay = await auth.buildTodaysPath(state, {
      recallLoad: EMPTY_LOAD,
      candidateLessons: plannerRegressionCandidates,
      force: true,
    });
    expect(
      sameDay.activities.find((a) => a.lessonId === SEEDED_LESSON_ID)?.status,
      'a lesson finished today must not reappear as ready work today',
    ).toBe('complete');

    // A later day: reachable again, and labelled as a revisit rather than as
    // new teaching.
    const tomorrow = new Authority(loadSyntheticBank(), fixedClock('2026-07-21T12:00:00.000Z'));
    const nextDay = await tomorrow.buildTodaysPath(state, {
      recallLoad: EMPTY_LOAD,
      candidateLessons: plannerRegressionCandidates,
      force: true,
    });
    const offered = nextDay.activities.filter((a) => a.lessonId === SEEDED_LESSON_ID);
    expect(
      offered,
      'a delivered, unmastered lesson was silently dropped from planning',
    ).toHaveLength(1);
    expect(offered[0]!.status).toBe('ready');
    expect(offered[0]!.priorityReason).toBe('TAUGHT_NOT_MASTERED');

    // The lesson that was never delivered is still the one offered as new.
    expect(
      nextDay.activities.find((a) => a.lessonId === UNSEEDED_LESSON_ID)?.priorityReason,
    ).not.toBe('TAUGHT_NOT_MASTERED');
  });

  it('reports a P(L) above the prior for a lesson with recorded practice', async () => {
    const bank = loadSyntheticBank();
    const auth = new Authority(bank, clock, new LessonMappedPracticeBank(bank));
    const state = auth.createGuest();
    // Teach-before-test: the queue serves only KCs a completed lesson covered,
    // and fails closed on an empty taught set, so a learner with practice to
    // record has one. Read off the bank's own units.
    const units = await auth.practiceBank.listUnits({ limit: 400 });
    state.taughtKcIds = [...new Set(units.map((u) => u.kcId))];
    const item = (await auth.getPracticeQueue(state, 5)).items.find(
      (candidate) => candidate.domain === 'science',
    );
    if (item === undefined) throw new Error('expected a science practice item');
    const answer = await auth.practiceBank.getAnswer(item.question.id);
    if (answer === null) throw new Error('expected the practice item answer');

    await auth.submitPracticeAttempt(state, {
      questionId: item.question.id,
      specId: item.specId,
      chosenChoiceId: answer.correctChoiceId,
    });

    const [mastery] = auth.getMasteryLessons(state, [SEEDED_LESSON_ID]);
    expect(state.mastery!.practicedLessonIds).toEqual([SEEDED_LESSON_ID]);
    expect(mastery?.pL).toBeGreaterThan(PRIOR_PL0);
  });
});

/**
 * WS5 (§6): the periodic half-length practice test is scheduled into Today's Path
 * on the cadence decided by `decidePracticeTest`. These pin the AUTHORITY seam —
 * that the snapshot reads `state.practiceTests` + `goal.testDate` and feeds the
 * policy, and that a completion/review moves that state — while the cadence rules
 * themselves are exercised in policies' `practice-test-cadence.test.ts`.
 *
 * The scheduler is gated on practice being UNLOCKED (teach-before-test), so these
 * mark three lessons complete before building; a fresh learner (every test in the
 * block above) never sees a test, which is why those stay green.
 */
describe("Authority — periodic practice test in Today\u2019s Path (WS5)", () => {
  /** Unlock practice (>= 3 completed lessons) so the cadence is consulted at all. */
  const unlockPractice = (state: LearnerState): void => {
    state.completedLessons = ['done-1', 'done-2', 'done-3'];
  };
  const build = (auth: Authority, state: LearnerState) =>
    auth.buildTodaysPath(state, { recallLoad: EMPTY_LOAD, candidateLessons, force: true });
  const hasTest = (activities: { kind: string }[]): boolean =>
    activities.some((a) => a.kind === 'practice_test');

  it('does not surface a test until practice is unlocked', async () => {
    const auth = new Authority(loadSyntheticBank(), clock);
    const state = onboard(auth); // zero completed lessons → practice locked
    expect(hasTest((await build(auth, state)).activities)).toBe(false);
  });

  it('schedules the baseline test once unlocked, sized to its length tier, writing no mastery', async () => {
    const auth = new Authority(loadSyntheticBank(), clock);
    const state = onboard(auth);
    unlockPractice(state);
    const before = auth.getMasterySkills(state).map((s) => s.pL);

    const test = (await build(auth, state)).activities.find((a) => a.kind === 'practice_test');
    expect(test).toBeDefined();
    // Variable length by stage: reserved at one of the tier durations (short 40 /
    // standard 90 / long 180), never zero — the exact tier depends on the stage
    // blend, which the cadence policy owns and pins in its own suite.
    expect([40, 90, 180]).toContain(test!.estimatedMinutes);
    // A test day still reads mastery but must never move it (the guardrail).
    expect(auth.getMasterySkills(state).map((s) => s.pL)).toEqual(before);
  });

  it('reserves no test when the practice-test capability is disabled, even when due+unlocked', async () => {
    const auth = new Authority(loadSyntheticBank(), clock);
    const state = onboard(auth);
    unlockPractice(state);

    // Baseline (default options) IS due for a freshly-unlocked learner…
    expect(hasTest((await build(auth, state)).activities)).toBe(true);

    // …but with the deployment capability OFF, the planner reserves none — the
    // gate the deployed learner-API uses until the scored-test runner ships, so a
    // dead-runner slot can never deadlock the strict plan. Other activities are
    // unaffected: the day still schedules the rest of its work.
    const gated = await auth.buildTodaysPath(
      state,
      { recallLoad: EMPTY_LOAD, candidateLessons, force: true },
      { practiceTestEnabled: false },
    );
    expect(hasTest(gated.activities)).toBe(false);
    expect(gated.activities.length).toBeGreaterThan(0);

    // Explicitly enabling it restores the reservation (same as the default).
    const enabled = await auth.buildTodaysPath(
      state,
      { recallLoad: EMPTY_LOAD, candidateLessons, force: true },
      { practiceTestEnabled: true },
    );
    expect(hasTest(enabled.activities)).toBe(true);
  });

  it('does not surface a test inside the pre-exam blackout window', async () => {
    const auth = new Authority(loadSyntheticBank(), clock); // today = 2026-07-20
    const state = onboard(auth);
    unlockPractice(state);
    // Exam three days out → inside the ~5-day blackout.
    auth.confirmPlan(state, { testDate: '2026-07-23', targetScore: 515, minutesPerWeek: 1260 });
    expect(hasTest((await build(auth, state)).activities)).toBe(false);
  });

  it('does not surface a test within the one-per-week cap of a recent sitting', async () => {
    const auth = new Authority(loadSyntheticBank(), clock); // today = 2026-07-20
    const state = onboard(auth);
    unlockPractice(state);
    // A sitting two days ago, already reviewed → capped, not blocked.
    state.practiceTests = { lastTestDate: '2026-07-18', lastTestReviewed: true, testsCompleted: 2 };
    expect(hasTest((await build(auth, state)).activities)).toBe(false);
  });

  it('blocks the next test until the prior one is reviewed, then releases it', async () => {
    const auth = new Authority(loadSyntheticBank(), clock);
    const state = onboard(auth);
    unlockPractice(state);
    // A long-past sitting whose cadence is otherwise due, but still unreviewed.
    state.practiceTests = { lastTestDate: '2026-06-01', lastTestReviewed: false, testsCompleted: 1 };
    expect(hasTest((await build(auth, state)).activities)).toBe(false);

    // Reviewing it releases the gate; the cadence is now due.
    state.practiceTests.lastTestReviewed = true;
    expect(hasTest((await build(auth, state)).activities)).toBe(true);
  });

  it('records a completed then reviewed test into LearnerState (and it round-trips)', () => {
    const auth = new Authority(loadSyntheticBank(), clock);
    const state = onboard(auth);
    expect(state.practiceTests).toBeUndefined();

    auth.recordPracticeTestCompleted(state);
    expect(state.practiceTests).toEqual({
      lastTestDate: '2026-07-20', // learner-local today (4 AM rollover)
      lastTestReviewed: false, // completion re-opens the review gate
      testsCompleted: 1,
    });

    auth.recordPracticeTestReviewed(state);
    expect(state.practiceTests!.lastTestReviewed).toBe(true);

    // A second completion bumps the count and re-opens the gate again.
    auth.recordPracticeTestCompleted(state);
    expect(state.practiceTests).toEqual({
      lastTestDate: '2026-07-20',
      lastTestReviewed: false,
      testsCompleted: 2,
    });

    // Rides the event-sourced state_json blob: a plain JSON round-trip (what the
    // projection persistence does) preserves it, so no migration is needed.
    const roundTripped = JSON.parse(JSON.stringify(state)) as LearnerState;
    expect(roundTripped.practiceTests).toEqual(state.practiceTests);
  });

  it('closes the loop: a completed+reviewed test then re-gates the next by cadence', async () => {
    const auth = new Authority(loadSyntheticBank(), clock);
    const state = onboard(auth);
    unlockPractice(state);

    // Baseline is due for a freshly-unlocked learner.
    expect(hasTest((await build(auth, state)).activities)).toBe(true);

    // Complete it (today) → within the weekly cap, so the next is not due…
    auth.recordPracticeTestCompleted(state);
    expect(hasTest((await build(auth, state)).activities)).toBe(false);
    expect(state.practiceTests).toEqual({
      lastTestDate: '2026-07-20',
      lastTestReviewed: false,
      testsCompleted: 1,
    });

    // …and even once a month passes, an UNREVIEWED prior still blocks it.
    const later = new Authority(loadSyntheticBank(), fixedClock('2026-08-25T12:00:00.000Z'));
    expect(hasTest((await later.buildTodaysPath(state, {
      recallLoad: EMPTY_LOAD,
      candidateLessons,
      force: true,
    })).activities)).toBe(false);

    // Reviewing it releases the gate and the monthly cadence surfaces the next.
    auth.recordPracticeTestReviewed(state);
    expect(hasTest((await later.buildTodaysPath(state, {
      recallLoad: EMPTY_LOAD,
      candidateLessons,
      force: true,
    })).activities)).toBe(true);
  });
});

/**
 * WS5 (§6): a completed test's SCORED RESULT persists as a sitting, feeds the
 * Practice-test dashboard summary from REAL data, and enqueues its science
 * misses into the repair/Mistakes queue — all without minting mastery.
 */
describe('Authority — practice-test results → dashboard summary + repair queue (WS5)', () => {
  const completion = (over: Partial<PracticeTestCompletion> = {}): PracticeTestCompletion => ({
    sittingId: 'sit-1',
    takenOn: '2026-07-20T15:00:00.000Z' as UtcTimestamp,
    tier: 'standard',
    itemsScored: 59,
    correct: 35,
    sections: [
      { section: 'cp', pctCorrect: 60 },
      { section: 'cars', pctCorrect: 55 },
      { section: 'bb', pctCorrect: 62 },
      { section: 'ps', pctCorrect: 58 },
    ],
    scaledScore: 500,
    // kc-a1 appears twice (must dedup); a CARS miss carries no KC and is already
    // excluded upstream by the scorer, so none is passed here.
    reviewTargets: [
      { kcId: 'kc-a1', skill: 'IDENTIFY' },
      { kcId: 'kc-a1' },
      { kcId: 'kc-b1' },
    ],
    ...over,
  });

  it('serves null until a test is scored, then a real summary from the sitting', async () => {
    const auth = new Authority(loadSyntheticBank(), clock);
    const state = onboard(auth);
    expect(auth.getPracticeTestSummary(state)).toBeNull();

    await auth.recordPracticeTestResult(state, completion());
    const summary = auth.getPracticeTestSummary(state)!;
    expect(summary).not.toBeNull();
    expect(summary.pastTests).toHaveLength(1);
    expect(summary.pastTests[0]!.label).toBe('Baseline');
    expect(summary.pastTests[0]!.phase).toBe('baseline');
    expect(summary.pastTests[0]!.sections).toHaveLength(4);
    // Honest RANGE, never a single number.
    expect(summary.estimatedScore.low).toBeLessThanOrEqual(summary.estimatedScore.high);
    // A second sitting appends chronologically and is labelled a checkpoint.
    await auth.recordPracticeTestResult(state, completion({ sittingId: 'sit-2', tier: 'long' }));
    const next = auth.getPracticeTestSummary(state)!;
    expect(next.pastTests).toHaveLength(2);
    expect(next.pastTests[1]!.label).toBe('Checkpoint 2');
    expect(next.pastTests[1]!.phase).toBe('full_length');
  });

  it('enqueues each missed KC once into the repair queue (dedup)', async () => {
    const bank = new SyntheticPracticeBankPort(loadSyntheticBank());
    const auth = new Authority(loadSyntheticBank(), clock, bank);
    const state = onboard(auth);
    await auth.recordPracticeTestResult(state, completion());
    const repairs = await bank.recentMisses(state.learnerId, { limit: 10 });
    expect(repairs.map((r) => r.kcId).sort()).toEqual(['kc-a1', 'kc-b1']);
  });

  it('re-opens the review gate on completion; reviewing marks the sitting reviewed', async () => {
    const auth = new Authority(loadSyntheticBank(), clock);
    const state = onboard(auth);
    await auth.recordPracticeTestResult(state, completion());
    expect(state.practiceTests!.lastTestReviewed).toBe(false);
    expect(state.practiceTests!.sittings![0]!.reviewed).toBe(false);

    auth.recordPracticeTestReviewed(state);
    expect(state.practiceTests!.lastTestReviewed).toBe(true);
    expect(state.practiceTests!.sittings![0]!.reviewed).toBe(true);
    expect(auth.getPracticeTestSummary(state)!.pastTests[0]!.reviewed).toBe(true);
  });

  it('writes no mastery when recording a result (the guardrail)', async () => {
    const auth = new Authority(loadSyntheticBank(), clock);
    const state = onboard(auth);
    const before = auth.getMasterySkills(state).map((s) => s.pL);
    await auth.recordPracticeTestResult(state, completion());
    expect(auth.getMasterySkills(state).map((s) => s.pL)).toEqual(before);
  });
});
