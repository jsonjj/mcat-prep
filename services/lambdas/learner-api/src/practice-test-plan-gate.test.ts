import { Authority } from '@mcat/authority-core';
import {
  InMemoryAuthorityRepository,
  toProjectionRecord,
  type Principal,
} from '@mcat/authority-kernel';
import {
  CommandEnvelopeSchema,
  fixedClock,
  type BuildTodaysPathInput,
  type CandidateLessonInput,
} from '@mcat/contracts';
import { describe, expect, it } from 'vitest';

import { RepositoryLearnerKernel } from './workflow';

/**
 * The deployment capability gate for the periodic scored practice TEST, proven
 * through the REAL `RepositoryLearnerKernel` → `Authority` path the Lambda uses
 * (not just the engine in isolation, which `packages/authority-core` pins).
 *
 * The scored-test RUNNER the client drives (`/api/practice-test/*`) is served
 * only by the dev/preview Vite plugin; the deployed CloudFront/S3 SPA routes only
 * `/v1/*` to this Lambda, so the runner has no production backend yet. Until it
 * ships, `lambda.ts` sets `practiceTestEnabled: false`, and the planner must
 * reserve NO `practice_test` slot — a slot whose runner cannot serve would
 * deadlock the strict guided plan. This asserts BOTH directions on an identical,
 * known-due learner so the gate is what makes the difference, not the fixture.
 */

const NOW = '2026-07-20T12:00:00.000Z';
const clock = fixedClock(NOW);

const EMPTY_LOAD = {
  dueLearning: 0,
  dueReviews: 0,
  newAvailable: 0,
  due: 0,
  estimatedMinutesForDue: 0,
};

const candidateLessons: CandidateLessonInput[] = [
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

const input: BuildTodaysPathInput = { recallLoad: EMPTY_LOAD, candidateLessons, force: false };

/** A guest walked through the diagnostic and unlocked for practice (>= 3 lessons done). */
function onboardedUnlocked(authority: Authority) {
  const state = authority.createGuest();
  let next = authority.diagnosticNext(state);
  while (!next.done) {
    authority.submitDiagnosticAnswer(state, next.questionId!, 'A');
    next = authority.diagnosticNext(state);
  }
  // testDate null → outside any pre-exam blackout, so a freshly-unlocked learner
  // is due for the baseline test (mirrors the authority-core Today's-Path suite).
  authority.confirmPlan(state, { testDate: null, targetScore: 515, minutesPerWeek: 1260 });
  state.completedLessons = ['done-1', 'done-2', 'done-3'];
  return state;
}

function kernelFor(practiceTestEnabled: boolean | undefined) {
  const authority = new Authority(undefined, clock);
  const state = onboardedUnlocked(authority);
  const repository = new InMemoryAuthorityRepository([toProjectionRecord(state, 0, NOW)]);
  const principal: Principal = {
    kind: 'guest',
    learnerId: state.learnerId,
    sessionId: crypto.randomUUID(),
  };
  const kernel = new RepositoryLearnerKernel({
    repository,
    clock,
    bank: authority.bank,
    ...(practiceTestEnabled === undefined ? {} : { practiceTestEnabled }),
  });
  return { kernel, principal };
}

const envelope = () =>
  CommandEnvelopeSchema.parse({
    eventId: crypto.randomUUID(),
    idempotencyKey: crypto.randomUUID(),
    occurredAt: NOW,
    expectedStreamVersion: 0,
    contentRelease: 'synthetic-2026.07',
    taskInstanceId: crypto.randomUUID(),
  });

describe('learner-api — periodic practice-test plan gate', () => {
  it('reserves no practice_test when the deployment disables it (production default)', async () => {
    const { kernel, principal } = kernelFor(false);
    const view = await kernel.buildTodaysPath({ envelope: envelope(), input }, principal);
    expect(view.activities.some((a) => a.kind === 'practice_test')).toBe(false);
    // The rest of the day is unaffected — the plan still schedules real work.
    expect(view.activities.length).toBeGreaterThan(0);
  });

  it('reserves a practice_test when enabled (dev default) — the gate is the difference', async () => {
    const { kernel, principal } = kernelFor(undefined); // omitted → defaults enabled
    const view = await kernel.buildTodaysPath({ envelope: envelope(), input }, principal);
    expect(view.activities.some((a) => a.kind === 'practice_test')).toBe(true);
  });
});
