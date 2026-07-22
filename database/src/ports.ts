import type { AcceptedCommand, LearnerProjectionRecord, OutboxRecord } from './types';

export interface AuthorityTransaction {
  getOrCreateGuest(sessionHash: string, now: string): Promise<LearnerProjectionRecord>;
  lockLearner(learnerId: string): Promise<LearnerProjectionRecord>;
  findAcceptedByIdempotency(learnerId: string, key: string): Promise<AcceptedCommand | null>;
  appendAccepted(command: AcceptedCommand): Promise<void>;
  saveProjection(record: LearnerProjectionRecord): Promise<void>;
  appendOutbox(record: OutboxRecord): Promise<void>;
}

export interface AuthorityRepository {
  transaction<T>(fn: (tx: AuthorityTransaction) => Promise<T>): Promise<T>;
  loadProjection(learnerId: string): Promise<LearnerProjectionRecord | null>;
}
