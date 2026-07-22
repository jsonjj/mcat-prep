import { Authority } from '@mcat/authority-core';
import { fixedClock } from '@mcat/contracts';
import { describe, expect, it } from 'vitest';

import { InMemoryAuthorityRepository } from './in-memory-repository';
import { AuthorityKernel } from './kernel';
import { toProjectionRecord } from './views';

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
