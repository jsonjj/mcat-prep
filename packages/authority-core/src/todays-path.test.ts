import { describe, expect, it } from 'vitest';
import { fixedClock } from '@mcat/contracts';
import { loadSyntheticBank } from '@mcat/content';
import { Authority } from './authority';
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
  { lessonId: 'les-a', slug: 'a', title: 'Lesson A', section: 'bb', cluster: null, kcCount: 4, kcIds: ['kc-a1', 'kc-a2'], prerequisiteLessonIds: [], estimatedMinutes: 20 },
  { lessonId: 'les-b', slug: 'b', title: 'Lesson B', section: 'cp', cluster: null, kcCount: 2, kcIds: ['kc-b1'], prerequisiteLessonIds: [], estimatedMinutes: 20 },
];

describe('Authority — Today\u2019s Path (orchestrator; writes no mastery)', () => {
  it('builds and persists a plan and WRITES NO MASTERY', () => {
    const auth = new Authority(loadSyntheticBank(), clock);
    const state = onboard(auth);
    const before = auth.getMasterySkills(state).map((s) => s.pL);

    const view = auth.buildTodaysPath(state, { recallLoad: EMPTY_LOAD, candidateLessons, force: false });
    expect(view.built).toBe(true);
    expect(view.activities.length).toBeGreaterThan(0);
    expect(view.activities.some((a) => a.kind === 'cars_duel')).toBe(true);
    expect(state.plan).toBeDefined();

    // Planning reads mastery but must never move it.
    expect(auth.getMasterySkills(state).map((s) => s.pL)).toEqual(before);
  });

  it('is idempotent per day unless forced', () => {
    const auth = new Authority(loadSyntheticBank(), clock);
    const state = onboard(auth);
    auth.buildTodaysPath(state, { recallLoad: EMPTY_LOAD, candidateLessons, force: false });
    const v1 = state.plan!.version;
    auth.buildTodaysPath(state, { recallLoad: EMPTY_LOAD, candidateLessons, force: false });
    expect(state.plan!.version).toBe(v1);
    auth.buildTodaysPath(state, { recallLoad: EMPTY_LOAD, candidateLessons, force: true });
    expect(state.plan!.version).toBe(v1 + 1);
  });

  it('sizes the day to the chosen preset', () => {
    const auth = new Authority(loadSyntheticBank(), clock);
    const state = onboard(auth);
    auth.setDailyBudget(state, 120);
    const view = auth.buildTodaysPath(state, { recallLoad: EMPTY_LOAD, candidateLessons, force: true });
    expect(view.dailyMinutesPreset).toBe(120);
    expect(view.dailyBudgetMinutes).toBe(120);
    expect(view.plannedMinutes).toBeLessThanOrEqual(120);
  });

  it('injects Recall as the next step when a deck is added after the plan was built', () => {
    const auth = new Authority(loadSyntheticBank(), clock);
    const state = onboard(auth);
    // Built with no cards due → no Recall block.
    const first = auth.buildTodaysPath(state, { recallLoad: EMPTY_LOAD, candidateLessons, force: false });
    expect(first.activities.some((a) => a.kind === 'recall')).toBe(false);

    // Learner adds a deck → cards now due. A plain (non-force) rebuild injects Recall.
    const dueLoad = { dueLearning: 4, dueReviews: 16, newAvailable: 6, due: 20, estimatedMinutesForDue: 7 };
    const after = auth.buildTodaysPath(state, { recallLoad: dueLoad, candidateLessons, force: false });
    const recall = after.activities.find((a) => a.kind === 'recall');
    expect(recall).toBeDefined();
    expect(recall!.count!).toBeGreaterThan(0); // Recall gets a card count to stop at
    // Nothing started yet → Recall is the very first / current activity.
    expect(after.activities[0]!.kind).toBe('recall');
    expect(after.currentActivityId).toBe(recall!.activityId);

    // Idempotent: rebuilding again does not duplicate the Recall block.
    const again = auth.buildTodaysPath(state, { recallLoad: dueLoad, candidateLessons, force: false });
    expect(again.activities.filter((a) => a.kind === 'recall').length).toBe(1);
  });

  it('completes an activity and marks a finished lesson for eligibility', () => {
    const auth = new Authority(loadSyntheticBank(), clock);
    const state = onboard(auth);
    const view = auth.buildTodaysPath(state, { recallLoad: EMPTY_LOAD, candidateLessons, force: false });
    const lesson = view.activities.find((a) => a.kind === 'lesson');
    expect(lesson).toBeDefined();

    auth.recordPlanActivity(state, lesson!.activityId, 'complete');
    const updated = auth.getTodaysPath(state);
    expect(updated.activities.find((a) => a.activityId === lesson!.activityId)!.status).toBe('complete');
    expect(state.completedLessons).toContain(lesson!.lessonId);

    const rebuilt = auth.buildTodaysPath(state, { recallLoad: EMPTY_LOAD, candidateLessons, force: true });
    // A finished lesson is preserved (shown as complete), never re-offered as new work.
    expect(
      rebuilt.activities.some((a) => a.lessonId === lesson!.lessonId && a.status === 'ready'),
    ).toBe(false);
    const rebuiltLesson = rebuilt.activities.find((a) => a.lessonId === lesson!.lessonId);
    if (rebuiltLesson) expect(rebuiltLesson.status).toBe('complete');
  });

  it('keeps finished work and re-plans the rest when the daily budget changes', () => {
    const auth = new Authority(loadSyntheticBank(), clock);
    const state = onboard(auth);
    auth.setDailyBudget(state, 180);
    const v1 = auth.buildTodaysPath(state, { recallLoad: EMPTY_LOAD, candidateLessons, force: true });
    const first = v1.activities.find((a) => a.kind === 'lesson');
    expect(first).toBeDefined();
    auth.recordPlanActivity(state, first!.activityId, 'complete');

    // Bump the daily time — the finished item is kept, and the day is re-planned larger.
    auth.setDailyBudget(state, 300);
    const v2 = auth.buildTodaysPath(state, { recallLoad: EMPTY_LOAD, candidateLessons, force: true });
    expect(v2.dailyBudgetMinutes).toBe(300);
    const keptDone = v2.activities.find((a) => a.activityId === first!.activityId);
    expect(keptDone?.status).toBe('complete');
    expect(v2.plannedMinutes).toBeLessThanOrEqual(300);
  });

  it('clamps the daily budget to the 2–6 hr bounds', () => {
    const auth = new Authority(loadSyntheticBank(), clock);
    const state = onboard(auth);
    auth.setDailyBudget(state, 30); // below 2 hr
    expect(auth.buildTodaysPath(state, { recallLoad: EMPTY_LOAD, candidateLessons, force: true }).dailyBudgetMinutes).toBe(120);
    auth.setDailyBudget(state, 900); // above 6 hr
    expect(auth.buildTodaysPath(state, { recallLoad: EMPTY_LOAD, candidateLessons, force: true }).dailyBudgetMinutes).toBe(360);
    auth.setDailyBudget(state, 330); // 5 h 30 m — allowed
    expect(auth.buildTodaysPath(state, { recallLoad: EMPTY_LOAD, candidateLessons, force: true }).dailyBudgetMinutes).toBe(330);
  });
});
