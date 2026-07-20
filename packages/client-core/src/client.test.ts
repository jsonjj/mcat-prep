import { describe, expect, it } from 'vitest';
import { fixedClock } from '@mcat/contracts';
import type { LearnerState } from '@mcat/authority-core';
import { InProcessAuthorityClient } from './in-process';
import type { StatePort } from './port';

function memoryStore<T>(): StatePort<T> {
  let value: T | null = null;
  return {
    load: () => value,
    save: (s) => {
      value = s;
    },
    clear: () => {
      value = null;
    },
  };
}

describe('InProcessAuthorityClient (client seam)', () => {
  it('drives the full vertical through the async port', async () => {
    const client = new InProcessAuthorityClient(
      memoryStore<LearnerState>(),
      fixedClock('2026-07-20T12:00:00.000Z'),
    );

    expect((await client.bootstrap()).onboardingComplete).toBe(false);

    let next = await client.getDiagnosticNext();
    while (!next.done) {
      await client.submitDiagnostic(next.question!.id, 'A');
      next = await client.getDiagnosticNext();
    }
    await client.confirmPlan({ testDate: null, targetScore: 511, minutesPerWeek: 420 });
    expect((await client.bootstrap()).onboardingComplete).toBe(true);

    for (let guard = 0; guard < 40; guard += 1) {
      const step = await client.getSession();
      if (step.kind === 'complete') break;
      if (step.kind === 'lesson' || step.kind === 'simulation') await client.continueStep();
      else if (step.kind === 'recall') await client.submitRecall('increases; unchanged');
      else if (step.kind === 'question') await client.submitAttempt('A');
    }

    expect((await client.getSession()).kind).toBe('complete');
    const mastery = await client.getMasteryMap();
    const enzyme = mastery.find((m) => m.skillId === 'bb1-enzyme-inhibition');
    expect(enzyme).toBeDefined();
  });

  it('persists across client instances via the shared store', async () => {
    const store = memoryStore<LearnerState>();
    const clock = fixedClock('2026-07-20T12:00:00.000Z');
    const a = new InProcessAuthorityClient(store, clock);
    await a.bootstrap();
    let next = await a.getDiagnosticNext();
    while (!next.done) {
      await a.submitDiagnostic(next.question!.id, 'A');
      next = await a.getDiagnosticNext();
    }
    // A fresh client over the same store sees the in-progress onboarding.
    const b = new InProcessAuthorityClient(store, clock);
    const boot = await b.bootstrap();
    expect(boot.accountState).toBe('guest');
  });
});
