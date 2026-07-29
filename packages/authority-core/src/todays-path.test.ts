import { describe, expect, it } from 'vitest';
import { fixedClock, type CandidateLessonInput } from '@mcat/contracts';
import { loadSyntheticBank, orderedKcsForLesson } from '@mcat/content';
import { PRIOR_PL0 } from '@mcat/policies';
import { Authority } from './authority';
import { SyntheticPracticeBankPort, type PracticeItemClassification } from './practice';
import type { LearnerState } from './types';

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

  it('uses candidate lesson ids to rank KC priors with no practice routing', async () => {
    const auth = new Authority(loadSyntheticBank(), clock);
    const state = auth.createGuest();
    auth.applyMasterySeed(state, {
      kcPriors: Object.fromEntries(SEEDED_LESSON_KCS.map((kcId) => [kcId, 0.4])),
      skillPriors: {},
      carsAbility: {},
    });

    // Diagnostic KC priors are deliberately not practice: the default lesson read
    // omits them, while the planner must still roll up every supplied candidate.
    expect(state.mastery!.practicedLessonIds).toEqual([]);

    const view = await auth.buildTodaysPath(state, {
      recallLoad: EMPTY_LOAD,
      candidateLessons: plannerRegressionCandidates,
      force: true,
    });

    expect(
      view.activities
        .filter((activity) => activity.kind === 'lesson')
        .map((activity) => activity.lessonId),
    ).toEqual([UNSEEDED_LESSON_ID, SEEDED_LESSON_ID]);
  });

  it('reports a P(L) above the prior for a lesson with recorded practice', async () => {
    const bank = loadSyntheticBank();
    const auth = new Authority(bank, clock, new LessonMappedPracticeBank(bank));
    const state = auth.createGuest();
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
