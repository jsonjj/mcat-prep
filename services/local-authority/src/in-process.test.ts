import { describe, expect, it } from 'vitest';
import { fixedClock } from '@mcat/contracts';
import type { LearnerState } from '@mcat/authority-core';
import type { StatePort } from '@mcat/client-core';
import { InProcessAuthorityClient } from './in-process';

function memoryStore<T>(): StatePort<T> {
  let value: T | null = null;
  return {
    load: () => value,
    save: (state) => {
      value = state;
    },
    clear: () => {
      value = null;
    },
  };
}

describe('InProcessAuthorityClient (synthetic local seam)', () => {
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
    const enzyme = mastery.find((entry) => entry.skillId === 'bb1-enzyme-inhibition');
    expect(enzyme).toBeDefined();
  });

  /**
   * The second caller of `applyMasterySeed`, and the reason the diagnostic-seed
   * corroboration had to move off the lambda route.
   *
   * This client reaches the same authority method with a payload that has crossed
   * no HTTP route at all, so while the check lived as a pre-check in
   * `services/lambdas/learner-api/src/workflow.ts` it applied here not at all: a
   * fabricated seed named arbitrary KC ids and moved planner priority. Nothing
   * about this client changed to fix that; the check moved to the door both
   * callers pass through.
   */
  it('refuses a fabricated diagnostic seed, with no route in front of it', async () => {
    const store = memoryStore<LearnerState>();
    const client = new InProcessAuthorityClient(store, fixedClock('2026-07-20T12:00:00.000Z'));
    await client.bootstrap();

    await expect(
      client.applyMasterySeed({
        kcPriors: { 'V3-KC-000000': 0.05, 'kc-i-just-made-up': 0.4 },
        skillPriors: {},
        carsAbility: {},
      }),
    ).rejects.toThrow(/SEED_KC_OUTSIDE_DIAGNOSTIC_AXIS/);

    expect(store.load()?.mastery?.kc ?? {}).toEqual({});
  });

  it('persists across client instances via the shared store', async () => {
    const store = memoryStore<LearnerState>();
    const clock = fixedClock('2026-07-20T12:00:00.000Z');
    const first = new InProcessAuthorityClient(store, clock);
    await first.bootstrap();
    let next = await first.getDiagnosticNext();
    while (!next.done) {
      await first.submitDiagnostic(next.question!.id, 'A');
      next = await first.getDiagnosticNext();
    }

    const second = new InProcessAuthorityClient(store, clock);
    expect((await second.bootstrap()).accountState).toBe('guest');
  });
});
