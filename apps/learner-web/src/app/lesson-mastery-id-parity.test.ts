import { describe, expect, it, vi } from 'vitest';
import { ATLAS_LESSON_CLUSTER, fixedClock } from '@mcat/contracts';
import { Authority } from '@mcat/authority-core';
import { loadSyntheticBank } from '@mcat/content';
import { APP_NATIVE_LESSONS } from '../app-native';

/**
 * This is a Node-only test file, never reachable from `src/main.tsx`, so it is
 * exempt from the browser-bundle boundary (tests/architecture/browser-boundaries.test.ts,
 * ALLOWED_SERVER_PACKAGE_REFERENCES) to import `@mcat/authority-core` and
 * `@mcat/content` directly. It needs them to resolve `APP_NATIVE_LESSONS`
 * against the real authority rather than a copy of either id list — the
 * whole point is to catch the two drifting apart.
 */
describe('app-native lesson mastery ids', () => {
  it('match the LessonMasteryView keys the authority resolves', () => {
    const appNativeLessonIds = APP_NATIVE_LESSONS.map(({ script }) => script.id);
    const authority = new Authority(loadSyntheticBank(), fixedClock('2026-07-20T12:00:00.000Z'));
    const state = authority.createGuest();

    const masteryLessonIds = authority
      .getMasteryLessons(state, appNativeLessonIds)
      .map(({ lessonId }) => lessonId);

    // `getMasteryLessons` deduplicates and omits unknown ids, so equality catches
    // both duplicate client entries and an app-native/registry drift.
    expect(masteryLessonIds).toEqual(appNativeLessonIds);
  });

  it('sends real clusters, prerequisite edges, and durations through to the authority planner', async () => {
    vi.stubEnv('VITE_AUTHORITY_BASE_URL', 'http://127.0.0.1:8787');
    const { buildCandidateLessons } = await import('./today-queries');
    const candidates = buildCandidateLessons();
    expect(candidates).toHaveLength(APP_NATIVE_LESSONS.length);
    expect(
      candidates.every(
        (candidate) => candidate.cluster === ATLAS_LESSON_CLUSTER[candidate.lessonId],
      ),
    ).toBe(true);

    const researchDesign = candidates.find((candidate) => candidate.lessonId === 'V3-LES-765609');
    expect(researchDesign?.estimatedMinutes).toBe(57);

    // The catalog-resolvable projection of the V3 manifest's hard lesson graph.
    expect(
      candidates.flatMap((candidate) =>
        candidate.prerequisiteLessonIds.map(
          (prerequisiteLessonId) => [prerequisiteLessonId, candidate.lessonId] as const,
        ),
      ),
    ).toEqual([['V3-LES-765609', 'V3-LES-128144']]);

    const dependent = candidates.find((candidate) => candidate.prerequisiteLessonIds.length > 0);
    expect(dependent).toBeDefined();
    if (dependent === undefined) return;

    // The V3 manifest's hard edge Research Design → Warranted Conclusions is
    // retained because both lessons are schedulable app-native candidates.
    expect(dependent.lessonId).toBe('V3-LES-128144');
    expect(dependent.prerequisiteLessonIds).toEqual(['V3-LES-765609']);
    expect(
      dependent.prerequisiteLessonIds.every((lessonId) =>
        candidates.some((candidate) => candidate.lessonId === lessonId),
      ),
    ).toBe(true);

    const authority = new Authority(loadSyntheticBank(), fixedClock('2026-07-20T12:00:00.000Z'));
    const state = authority.createGuest();
    authority.setDailyBudget(state, 360);

    const locked = await authority.buildTodaysPath(state, {
      recallLoad: {
        dueLearning: 0,
        dueReviews: 0,
        newAvailable: 0,
        due: 0,
        estimatedMinutesForDue: 0,
      },
      candidateLessons: candidates,
      force: true,
    });
    expect(locked.activities.some((activity) => activity.lessonId === dependent.lessonId)).toBe(
      false,
    );
    expect(
      locked.activities.find((activity) => activity.lessonId === researchDesign?.lessonId)
        ?.estimatedMinutes,
    ).toBe(57);

    state.completedLessons = [...dependent.prerequisiteLessonIds];
    const unlocked = await authority.buildTodaysPath(state, {
      recallLoad: {
        dueLearning: 0,
        dueReviews: 0,
        newAvailable: 0,
        due: 0,
        estimatedMinutesForDue: 0,
      },
      candidateLessons: candidates,
      force: true,
    });
    expect(unlocked.activities.some((activity) => activity.lessonId === dependent.lessonId)).toBe(
      true,
    );
  });
});
