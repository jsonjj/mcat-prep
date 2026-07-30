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

  it('feeds Today’s Path from the registration manifest — clusters, KCs, durations threaded', async () => {
    vi.stubEnv('VITE_AUTHORITY_BASE_URL', 'http://127.0.0.1:8787');
    const { buildCandidateLessons } = await import('./today-queries');
    const { REGISTERED_LESSONS } = await import('./lesson-catalog');
    const candidates = buildCandidateLessons();

    // The candidates ARE the registered catalog — exactly, and in manifest order.
    // Nothing from the preview list leaks into the planner.
    expect(candidates.map((candidate) => candidate.lessonId)).toEqual(
      REGISTERED_LESSONS.map((lesson) => lesson.lessonId),
    );
    // Every planner-scored field is threaded straight from the manifest (which the
    // boot guard already reconciled against the curriculum + cluster atlas), so the
    // cluster also agrees with the atlas of record.
    for (const candidate of candidates) {
      const lesson = REGISTERED_LESSONS.find((entry) => entry.lessonId === candidate.lessonId)!;
      expect(candidate.cluster).toBe(lesson.cluster);
      expect(candidate.cluster).toBe(ATLAS_LESSON_CLUSTER[candidate.lessonId]);
      expect(candidate.section).toBe(lesson.section);
      expect(candidate.kcIds).toEqual([...lesson.kcIds]);
      expect(candidate.kcCount).toBe(lesson.kcIds.length);
      expect(candidate.estimatedMinutes).toBe(lesson.estimatedMinutes);
      expect(candidate.prerequisiteLessonIds).toEqual([...lesson.prerequisiteLessonIds]);
    }

    // The authority planner consumes exactly these candidates: every lesson it
    // schedules is a registered lesson, and it does schedule from the catalog.
    const authority = new Authority(loadSyntheticBank(), fixedClock('2026-07-20T12:00:00.000Z'));
    const state = authority.createGuest();
    authority.setDailyBudget(state, 360);

    const built = await authority.buildTodaysPath(state, {
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
    const registeredIds = new Set(REGISTERED_LESSONS.map((lesson) => lesson.lessonId));
    const scheduledLessonIds = built.activities
      .filter((activity) => activity.kind === 'lesson')
      .map((activity) => activity.lessonId);
    expect(scheduledLessonIds.length).toBeGreaterThan(0);
    expect(scheduledLessonIds.every((lessonId) => registeredIds.has(lessonId ?? ''))).toBe(true);
  });
});
