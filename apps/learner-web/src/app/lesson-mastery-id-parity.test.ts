import { describe, expect, it } from 'vitest';
import { fixedClock } from '@mcat/contracts';
import { Authority } from '@mcat/authority-core';
import { loadSyntheticBank } from '@mcat/content';
import { APP_NATIVE_LESSONS } from '../app-native';

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
