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

export function learnerStateFromProjection(record: LearnerProjectionRecord): LearnerState {
  const state = structuredClone(record.state) as unknown as LearnerState;
  if (state.learnerId !== record.learnerId) {
    throw forbidden();
  }
  state.nextSequence = record.sequence;
  return state;
}

export async function buildLearnerSnapshot(
  authority: Authority,
  state: LearnerState,
  streamVersion: number,
): Promise<LearnerSnapshot> {
  const viewState = structuredClone(state);
  const [today, errorLog, errorPatterns] = await Promise.all([
    viewState.onboarding.planConfirmed ? authority.getToday(viewState) : Promise.resolve(null),
    authority.getErrorLog(viewState),
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
  });
}

export function asUtcTimestamp(value: string): UtcTimestamp {
  return value as UtcTimestamp;
}

export { toJsonObject };
