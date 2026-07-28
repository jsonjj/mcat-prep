import { Authority } from '@mcat/authority-core';
import { fixedClock, QualifiedBktObservationSchema, UtcTimestampSchema } from '@mcat/contracts';
import { describe, expect, it } from 'vitest';

import { InMemoryAuthorityRepository } from './in-memory-repository';
import { AuthorityKernel } from './kernel';
import { learnerStateFromProjection, toProjectionRecord } from './views';

const NOW = '2026-07-20T12:00:00.000Z';
const clock = fixedClock(NOW);

const newUuid = (): string => crypto.randomUUID();

function attemptCommand(contentRelease: string, expectedStreamVersion = 0) {
  return {
    envelope: {
      eventId: newUuid(),
      idempotencyKey: newUuid(),
      occurredAt: NOW,
      expectedStreamVersion,
      contentRelease,
      taskInstanceId: newUuid(),
    },
    questionId: 'q-enz-indep-competitive',
    choiceId: 'A',
    elapsedMs: 12_000,
    assistanceLevel: 'A0',
    contentBearingHintUsed: false,
    answerChanges: 0,
    confidence: 0.8,
    isDiagnosticRetry: false,
  };
}

function goalCommand(contentRelease: string, expectedStreamVersion = 0) {
  return {
    envelope: {
      eventId: newUuid(),
      idempotencyKey: newUuid(),
      occurredAt: NOW,
      expectedStreamVersion,
      contentRelease,
      taskInstanceId: newUuid(),
    },
    goal: {
      testDate: null,
      targetScore: 515,
      minutesPerWeek: 420,
    },
  };
}

function readyHarness() {
  const referenceAuthority = new Authority(undefined, clock);
  const state = referenceAuthority.createGuest();
  state.onboarding.diagnosticComplete = true;
  referenceAuthority.confirmPlan(state, {
    testDate: null,
    targetScore: 515,
    minutesPerWeek: 420,
  });
  referenceAuthority.startSession(state);
  referenceAuthority.continueStep(state);

  const repository = new InMemoryAuthorityRepository([toProjectionRecord(state, 0, NOW)]);
  const kernel = new AuthorityKernel({
    repository,
    clock,
    bank: referenceAuthority.bank,
  });
  const principal = {
    kind: 'guest' as const,
    learnerId: state.learnerId,
    sessionId: newUuid(),
  };

  return { kernel, principal, referenceAuthority, repository };
}

describe('AuthorityKernel', () => {
  it('returns the original result for duplicate idempotency keys', async () => {
    const { kernel, principal, referenceAuthority, repository } = readyHarness();
    const command = attemptCommand(referenceAuthority.bank.contentRelease);

    const first = await kernel.handle(command, principal);
    const second = await kernel.handle(command, principal);

    expect(second).toEqual(first);
    expect(repository.eventsFor(principal.learnerId)).toHaveLength(1);
    expect(repository.outboxFor(principal.learnerId)).toHaveLength(1);
  });

  it('rejects a stale expected stream version without any logical effect', async () => {
    const { kernel, principal, referenceAuthority, repository } = readyHarness();
    const command = attemptCommand(referenceAuthority.bank.contentRelease, 4);

    await expect(kernel.handle(command, principal)).rejects.toMatchObject({
      code: 'stream_conflict',
      currentStreamVersion: 0,
    });
    expect(repository.eventsFor(principal.learnerId)).toHaveLength(0);
    expect(repository.outboxFor(principal.learnerId)).toHaveLength(0);
  });

  it('cannot read another learner projection', async () => {
    const { kernel, principal, referenceAuthority, repository } = readyHarness();
    const otherState = referenceAuthority.createGuest();
    repository.seedProjection(toProjectionRecord(otherState, 0, NOW));

    await expect(kernel.snapshot(principal, otherState.learnerId)).rejects.toMatchObject({
      code: 'forbidden',
    });
  });

  it('rolls back event, projection, and outbox when a write fails after append', async () => {
    const { kernel, principal, referenceAuthority, repository } = readyHarness();
    const before = repository.projectionFor(principal.learnerId);
    repository.failNextAfterAppendAccepted();

    await expect(
      kernel.handle(attemptCommand(referenceAuthority.bank.contentRelease), principal),
    ).rejects.toThrow('synthetic append failure');

    expect(repository.eventsFor(principal.learnerId)).toHaveLength(0);
    expect(repository.projectionFor(principal.learnerId)).toEqual(before);
    expect(repository.outboxFor(principal.learnerId)).toHaveLength(0);
  });

  it('updates a goal from an ownership-free command and exposes only a safe snapshot', async () => {
    const referenceAuthority = new Authority(undefined, clock);
    const state = referenceAuthority.createGuest();
    const repository = new InMemoryAuthorityRepository([toProjectionRecord(state, 0, NOW)]);
    const kernel = new AuthorityKernel({
      repository,
      clock,
      bank: referenceAuthority.bank,
    });
    const principal = {
      kind: 'guest' as const,
      learnerId: state.learnerId,
      sessionId: newUuid(),
    };

    const accepted = await kernel.handle(
      goalCommand(referenceAuthority.bank.contentRelease),
      principal,
    );
    const snapshot = await kernel.snapshot(principal);

    expect(accepted).toMatchObject({ sequence: 1, streamVersion: 1 });
    expect(snapshot.today).not.toBeNull();
    expect(snapshot.session.kind).toBe('question');
    expect(JSON.stringify(snapshot)).not.toMatch(/correct_choice_id|rationales|sessionHash/i);
  });

  it('rejects client-supplied ownership fields instead of trusting them', async () => {
    const { kernel, principal, referenceAuthority, repository } = readyHarness();
    const command = {
      ...attemptCommand(referenceAuthority.bank.contentRelease),
      learnerId: newUuid(),
    };

    await expect(kernel.handle(command, principal)).rejects.toMatchObject({
      code: 'validation_error',
    });
    expect(repository.eventsFor(principal.learnerId)).toHaveLength(0);
  });

  it('rejects an attempt for anything other than the authoritative current item', async () => {
    const { kernel, principal, referenceAuthority, repository } = readyHarness();
    const command = {
      ...attemptCommand(referenceAuthority.bank.contentRelease),
      questionId: 'q-enz-protected-1',
    };

    await expect(kernel.handle(command, principal)).rejects.toMatchObject({
      code: 'validation_error',
    });
    expect(repository.eventsFor(principal.learnerId)).toHaveLength(0);
  });

  it('keeps protected scoring material out of command results and outbox payloads', async () => {
    const { kernel, principal, referenceAuthority, repository } = readyHarness();

    const result = await kernel.handle(
      attemptCommand(referenceAuthority.bank.contentRelease),
      principal,
    );
    const serialized = JSON.stringify({
      result,
      outbox: repository.outboxFor(principal.learnerId),
    });

    expect(serialized).not.toMatch(/correctChoiceId|correct_choice_id|rationale/i);
  });
});

describe('learner projections', () => {
  const LEGACY_KC_STATE = {
    pL: 0.42,
    halfLifeDays: 7,
    lastPracticedAt: NOW,
    lastDueReviewAt: null,
  };
  const LEGACY_OPERATION_STATE = {
    pL: 0.61,
    halfLifeDays: 7,
    lastPracticedAt: NOW,
    lastDueReviewAt: null,
  };

  /** A pre-seam projection: mastery still carried a per-lesson BKT chain. */
  function legacyProjection() {
    const authority = new Authority(undefined, clock);
    const state = authority.createGuest();
    const record = toProjectionRecord(state, 0, NOW);
    const raw = record.state as unknown as Record<string, unknown>;
    raw.mastery = {
      kc: { 'V3-KC-866848': LEGACY_KC_STATE },
      skill: { QUANTIFY: LEGACY_OPERATION_STATE },
      lesson: {
        'V3-LES-130923': {
          pL: 0.99,
          halfLifeDays: 14,
          lastPracticedAt: NOW,
          lastDueReviewAt: null,
        },
      },
      cars: { FOC: 0.3 },
    };
    return record;
  }

  it('round-trips the two BKT grains and the routing lists', () => {
    const authority = new Authority(undefined, clock);
    const state = authority.createGuest();
    const practicedAt = UtcTimestampSchema.parse(NOW);
    state.mastery = {
      kc: {
        'V3-KC-866848': {
          pL: 0.42,
          halfLifeDays: 7,
          lastPracticedAt: practicedAt,
          lastDueReviewAt: null,
        },
      },
      skill: {
        QUANTIFY: {
          pL: 0.61,
          halfLifeDays: 7,
          lastPracticedAt: practicedAt,
          lastDueReviewAt: null,
        },
      },
      cars: { FOC: 0.3 },
      practicedLessonIds: ['V3-LES-130923'],
      appliedObservationIds: ['0f9d5b16-1d0f-4e2a-9f6a-6a3b2f9a41c1'],
    };

    const restored = learnerStateFromProjection(toProjectionRecord(state, 3, NOW));

    expect(restored.mastery).toEqual(state.mastery);
    expect(restored.nextSequence).toBe(3);
  });

  it('loads a legacy projection but drops its per-lesson BKT chain', () => {
    const restored = learnerStateFromProjection(legacyProjection());

    expect(restored.mastery?.lesson).toBeUndefined();
    expect(restored.mastery?.kc).toEqual({ 'V3-KC-866848': LEGACY_KC_STATE });
    expect(restored.mastery?.skill).toEqual({ QUANTIFY: LEGACY_OPERATION_STATE });
    expect(restored.mastery?.cars).toEqual({ FOC: 0.3 });
  });

  it('never reintroduces a lesson chain when a legacy projection is re-saved', () => {
    const authority = new Authority(undefined, clock);
    const restored = learnerStateFromProjection(legacyProjection());

    // The legacy lesson pL was 0.99; the rollup must not resurrect it, and the
    // lesson is not reported at all until its whole membership is available.
    authority.applyQualifiedBktObservation(restored, {
      observation: QualifiedBktObservationSchema.parse({
        observationId: crypto.randomUUID(),
        questionId: 'ALG-GRAPH-ENTRY-01',
        itemBindingId: 'V3-LES-130923-ITEM-01',
        bindingVersion: 'internal-draft-1',
        serverItemVersion: 7,
        primaryKcId: 'V3-KC-866848',
        reasoningOperation: 'QUANTIFY',
        correct: false,
        occurredAt: NOW,
        sequence: 1,
        contentRelease: 'synthetic-2026.07',
        policies: [{ policyId: 'mastery-bkt', version: 'provisional-v1' }],
      }),
      lessonId: 'V3-LES-130923',
    });

    const resaved = learnerStateFromProjection(toProjectionRecord(restored, 1, NOW));
    expect(resaved.mastery?.lesson).toBeUndefined();

    const lesson = authority
      .getMasteryLessons(resaved)
      .find((l) => l.lessonId === 'V3-LES-130923')!;
    expect(lesson.mastered).toBe(false);
    expect(lesson.pL).toBeLessThan(0.99);
  });
});
