import { describe, expectTypeOf, it } from 'vitest';

import type { AuthorityRepository, AuthorityTransaction } from './ports';
import type { AcceptedCommand, LearnerProjectionRecord, OutboxRecord } from './types';

describe('authority repository ports', () => {
  it('requires guest bootstrap and learner locking inside a transaction', () => {
    expectTypeOf<AuthorityTransaction['getOrCreateGuest']>().toEqualTypeOf<
      (sessionHash: string, now: string) => Promise<LearnerProjectionRecord>
    >();
    expectTypeOf<AuthorityTransaction['lockLearner']>().toEqualTypeOf<
      (learnerId: string) => Promise<LearnerProjectionRecord>
    >();
  });

  it('exposes idempotent accepted-command and atomic outbox writes', () => {
    expectTypeOf<AuthorityTransaction['findAcceptedByIdempotency']>().toEqualTypeOf<
      (learnerId: string, key: string) => Promise<AcceptedCommand | null>
    >();
    expectTypeOf<AuthorityTransaction['appendAccepted']>().toEqualTypeOf<
      (command: AcceptedCommand) => Promise<void>
    >();
    expectTypeOf<AuthorityTransaction['saveProjection']>().toEqualTypeOf<
      (record: LearnerProjectionRecord) => Promise<void>
    >();
    expectTypeOf<AuthorityTransaction['appendOutbox']>().toEqualTypeOf<
      (record: OutboxRecord) => Promise<void>
    >();
  });

  it('keeps transaction ownership at the repository boundary', () => {
    expectTypeOf<AuthorityRepository['loadProjection']>().toEqualTypeOf<
      (learnerId: string) => Promise<LearnerProjectionRecord | null>
    >();
    expectTypeOf<AuthorityRepository['transaction']>().toMatchTypeOf<
      <T>(fn: (tx: AuthorityTransaction) => Promise<T>) => Promise<T>
    >();
  });
});
