import { describe, expect, it } from 'vitest';
import { fixedClock } from '@mcat/contracts';
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
});
