import type { Authority, LearnerState } from '@mcat/authority-core';
import { LearnerSnapshotSchema, type LearnerSnapshot, type UtcTimestamp } from '@mcat/contracts';
import type { JsonObject, LearnerProjectionRecord } from '@mcat/database';

import { AuthorityKernelError, forbidden } from './context';

export const SYNTHETIC_PROJECTION_VERSION = 'synthetic-authority-v1';

function toJsonObject(value: unknown): JsonObject {
  const serialized = JSON.stringify(value);
  if (serialized === undefined) {
    throw new AuthorityKernelError({
      code: 'unavailable',
      message: 'The authoritative state could not be serialized.',
      retryable: true,
    });
  }
  const parsed: unknown = JSON.parse(serialized);
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new AuthorityKernelError({
      code: 'unavailable',
      message: 'The authoritative state has an invalid shape.',
      retryable: true,
    });
  }
  return parsed as JsonObject;
}

export function toProjectionRecord(
  state: LearnerState,
  sequence: number,
  updatedAt: string,
): LearnerProjectionRecord {
  const projectionState = structuredClone(state);
  projectionState.nextSequence = sequence;
  return {
    learnerId: state.learnerId,
    sequence,
    projectionVersion: SYNTHETIC_PROJECTION_VERSION,
    state: toJsonObject(projectionState),
    updatedAt,
  };
}

/**
 * Drop the legacy per-lesson BKT chain from a persisted projection.
 *
 * Lessons stopped having BKT state when the seam split capability from warrant
 * (docs/lesson-evidence-mastery-contract.md §8.2): a lesson readout is rolled up
 * from its required member KCs on read. Projections written before that still
 * carry `mastery.lesson`, and they MUST keep loading — but the map is stale the
 * moment it is read, so it is discarded here rather than left where a later
 * reader could mistake it for authoritative. Everything else in `mastery`
 * (`kc`, `skill`, `cars`, and the routing/idempotency lists) round-trips
 * untouched.
 */
function dropLegacyLessonBkt(state: LearnerState): void {
  // Truthiness, not `=== undefined`: a legacy projection may hold `mastery: null`,
  // and a load path that throws on it is not tolerating legacy state.
  if (!state.mastery) return;
  delete state.mastery.lesson;
}

/**
 * Drop the legacy `accountState` copy from a persisted projection.
 *
 * The projection used to carry an account state seeded from `createGuest()`, and
 * nothing ever rewrote it — every learner created through the linked sign-in path
 * still had `"guest"` written next to their progress while `learners.account_state`
 * said `linked`. The field is gone from `LearnerState` (see its doc comment), but
 * blobs written before migration 0020 still hold it, and a load that left it in
 * place would write it straight back out on the next `toProjectionRecord`. Erasing
 * it on the way in is what makes the migration stick.
 */
function dropLegacyAccountState(state: LearnerState): void {
  delete (state as { accountState?: unknown }).accountState;
}

export function learnerStateFromProjection(record: LearnerProjectionRecord): LearnerState {
  const state = structuredClone(record.state) as unknown as LearnerState;
  if (state.learnerId !== record.learnerId) {
    throw forbidden();
  }
  state.nextSequence = record.sequence;
  dropLegacyLessonBkt(state);
  dropLegacyAccountState(state);
  return state;
}

export async function buildLearnerSnapshot(
  authority: Authority,
  state: LearnerState,
  streamVersion: number,
): Promise<LearnerSnapshot> {
  const viewState = structuredClone(state);
  const [today, errorLog, shakyWins, errorPatterns] = await Promise.all([
    viewState.onboarding.planConfirmed ? authority.getToday(viewState) : Promise.resolve(null),
    authority.getErrorLog(viewState),
    authority.getShakyWins(viewState),
    authority.getMistakePatterns(viewState),
  ]);
  return LearnerSnapshotSchema.parse({
    streamVersion,
    contentRelease: authority.bank.contentRelease,
    today,
    session: authority.getSession(viewState),
    masteryMap: authority.getMasteryMap(viewState),
    errorLog,
    errorPatterns,
    shakyWins,
  });
}

export function asUtcTimestamp(value: string): UtcTimestamp {
  return value as UtcTimestamp;
}

export { toJsonObject };
