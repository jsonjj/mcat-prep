import { Authority } from '@mcat/authority-core';
import { toProjectionRecord } from '@mcat/authority-kernel';
import { fixedClock, type LearnerId } from '@mcat/contracts';
import type { LearnerProjectionRecord } from '@mcat/database';

/**
 * The starting projection a brand-new learner row is created with.
 *
 * Kept out of `lambda.ts` because that module reaches for Secrets Manager at
 * import time: every other composition of this API — the local run against a
 * real Postgres, the integration suites — needs the same seed state and none of
 * them needs the AWS SDK.
 */
export function createGuestProjection(learnerId: string, now: string): LearnerProjectionRecord {
  const authority = new Authority(undefined, fixedClock(now));
  const state = authority.createGuest();
  state.learnerId = learnerId as LearnerId;
  return toProjectionRecord(state, 0, now);
}
