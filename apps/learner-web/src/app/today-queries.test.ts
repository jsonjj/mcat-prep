import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { LessonMasteryView } from '@mcat/contracts';
import { REGISTERED_LESSONS } from './lesson-catalog';
// Type-only import — erased at runtime, so it does NOT boot ./authority.
import type { CatalogCompletion } from './today-queries';

type MasteryRow = Pick<LessonMasteryView, 'lessonId' | 'mastered'>;

/** A minimal mastery row — the completion join only reads id + the warranted claim. */
const mastery = (lessonId: string, mastered: boolean): MasteryRow => ({ lessonId, mastered });

const ALL_IDS = REGISTERED_LESSONS.map((lesson) => lesson.lessonId);

// `catalogCompletion` is pure, but it lives in today-queries.ts, whose ./authority
// import requires VITE_AUTHORITY_BASE_URL at module load. Stub it and defer the
// import (same pattern as lesson-mastery-id-parity.test.ts) so the pure test runs.
let catalogCompletion: (
  masteryLessons: readonly MasteryRow[],
  registered?: readonly { readonly lessonId: string }[],
) => CatalogCompletion;
beforeAll(async () => {
  vi.stubEnv('VITE_AUTHORITY_BASE_URL', 'http://127.0.0.1:8787');
  ({ catalogCompletion } = await import('./today-queries'));
});

describe('catalogCompletion — the honest Today’s Path empty state', () => {
  it('reports the whole catalog complete once every registered lesson is mastered', () => {
    const learner = ALL_IDS.map((id) => mastery(id, true));
    const state = catalogCompletion(learner);
    expect(state.total).toBe(REGISTERED_LESSONS.length);
    expect(state.complete).toBe(REGISTERED_LESSONS.length);
    expect(state.allComplete).toBe(true);
  });

  it('is NOT complete while any registered lesson is unmastered', () => {
    // Every lesson finished except the last — the planner still has work to offer,
    // so the catalog-complete banner must not fire.
    const learner = ALL_IDS.map((id, index) => mastery(id, index < ALL_IDS.length - 1));
    const state = catalogCompletion(learner);
    expect(state.complete).toBe(REGISTERED_LESSONS.length - 1);
    expect(state.allComplete).toBe(false);
  });

  it('is NOT complete for a fresh learner with no mastery yet', () => {
    const state = catalogCompletion([]);
    expect(state.complete).toBe(0);
    expect(state.allComplete).toBe(false);
  });

  it('counts only registered lessons — a mastered non-catalog lesson never completes it', () => {
    // All three real lessons still unmastered, plus a mastered preview id that is
    // NOT in the manifest. Completion is manifest-scoped, so this stays incomplete.
    const learner = [...ALL_IDS.map((id) => mastery(id, false)), mastery('V3-LES-765609', true)];
    const state = catalogCompletion(learner);
    expect(state.complete).toBe(0);
    expect(state.allComplete).toBe(false);
  });

  it('requires ALL registered lessons present in the mastery read, not just some', () => {
    // Only the first lesson is reported (and mastered); the rest are absent. A
    // missing lesson is not a mastered lesson, so the catalog is not complete.
    const state = catalogCompletion([mastery(ALL_IDS[0]!, true)]);
    expect(state.complete).toBe(1);
    expect(state.allComplete).toBe(false);
  });

  it('never claims completion for an empty catalog', () => {
    const state = catalogCompletion([mastery('V3-LES-130923', true)], []);
    expect(state.total).toBe(0);
    expect(state.allComplete).toBe(false);
  });
});
