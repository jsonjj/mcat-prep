import { Authority } from '@mcat/authority-core';
import { fixedClock } from '@mcat/contracts';
import type {
  AcceptedCommand,
  AuthorityRepository,
  AuthorityTransaction,
  LearnerProjectionRecord,
  OutboxRecord,
} from '@mcat/database';

import { toProjectionRecord } from './views';

const clone = <T>(value: T): T => structuredClone(value);

interface RepositoryState {
  projections: Map<string, LearnerProjectionRecord>;
  accepted: AcceptedCommand[];
  outbox: OutboxRecord[];
  guestSessions: Map<string, string>;
}

function cloneState(state: RepositoryState): RepositoryState {
  return {
    projections: new Map(
      [...state.projections].map(([learnerId, projection]) => [learnerId, clone(projection)]),
    ),
    accepted: clone(state.accepted),
    outbox: clone(state.outbox),
    guestSessions: new Map(state.guestSessions),
  };
}

class InMemoryAuthorityTransaction implements AuthorityTransaction {
  constructor(
    private readonly state: RepositoryState,
    private readonly afterAppendAccepted: () => void,
  ) {}

  async getOrCreateGuest(sessionHash: string, now: string): Promise<LearnerProjectionRecord> {
    const existingLearnerId = this.state.guestSessions.get(sessionHash);
    if (existingLearnerId !== undefined) {
      return this.lockLearner(existingLearnerId);
    }

    const authority = new Authority(undefined, fixedClock(now));
    const projection = toProjectionRecord(authority.createGuest(), 0, now);
    this.state.guestSessions.set(sessionHash, projection.learnerId);
    this.state.projections.set(projection.learnerId, clone(projection));
    return clone(projection);
  }

  async lockLearner(learnerId: string): Promise<LearnerProjectionRecord> {
    const projection = this.state.projections.get(learnerId);
    if (projection === undefined) {
      throw new Error('Learner projection does not exist.');
    }
    return clone(projection);
  }

  async findAcceptedByIdempotency(learnerId: string, key: string): Promise<AcceptedCommand | null> {
    const accepted = this.state.accepted.find(
      (command) => command.learnerId === learnerId && command.idempotencyKey === key,
    );
    return accepted === undefined ? null : clone(accepted);
  }

  async appendAccepted(command: AcceptedCommand): Promise<void> {
    if (
      this.state.accepted.some(
        (existing) =>
          existing.eventId === command.eventId ||
          (existing.learnerId === command.learnerId &&
            (existing.idempotencyKey === command.idempotencyKey ||
              existing.sequence === command.sequence)),
      )
    ) {
      throw new Error('Accepted command uniqueness violation.');
    }
    this.state.accepted.push(clone(command));
    this.afterAppendAccepted();
  }

  async saveProjection(record: LearnerProjectionRecord): Promise<void> {
    if (!this.state.projections.has(record.learnerId)) {
      throw new Error('Learner projection does not exist.');
    }
    this.state.projections.set(record.learnerId, clone(record));
  }

  async appendOutbox(record: OutboxRecord): Promise<void> {
    if (
      this.state.outbox.some(
        (existing) =>
          existing.outboxId === record.outboxId ||
          (existing.learnerId === record.learnerId &&
            existing.sequence === record.sequence &&
            existing.topic === record.topic),
      )
    ) {
      throw new Error('Outbox uniqueness violation.');
    }
    this.state.outbox.push(clone(record));
  }
}

export class InMemoryAuthorityRepository implements AuthorityRepository {
  private state: RepositoryState;
  private transactionTail: Promise<void> = Promise.resolve();
  private failAfterAppendAccepted = false;

  constructor(initialProjections: readonly LearnerProjectionRecord[] = []) {
    this.state = {
      projections: new Map(
        initialProjections.map((projection) => [projection.learnerId, clone(projection)]),
      ),
      accepted: [],
      outbox: [],
      guestSessions: new Map(),
    };
  }

  async transaction<T>(fn: (tx: AuthorityTransaction) => Promise<T>): Promise<T> {
    const previous = this.transactionTail;
    let release: () => void = () => undefined;
    this.transactionTail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;

    try {
      const working = cloneState(this.state);
      const tx = new InMemoryAuthorityTransaction(working, () => {
        if (this.failAfterAppendAccepted) {
          this.failAfterAppendAccepted = false;
          throw new Error('synthetic append failure');
        }
      });
      const result = await fn(tx);
      this.state = working;
      return result;
    } finally {
      release();
    }
  }

  async loadProjection(learnerId: string): Promise<LearnerProjectionRecord | null> {
    const projection = this.state.projections.get(learnerId);
    return projection === undefined ? null : clone(projection);
  }

  seedProjection(record: LearnerProjectionRecord): void {
    this.state.projections.set(record.learnerId, clone(record));
  }

  failNextAfterAppendAccepted(): void {
    this.failAfterAppendAccepted = true;
  }

  eventsFor(learnerId: string): AcceptedCommand[] {
    return clone(this.state.accepted.filter((event) => event.learnerId === learnerId));
  }

  outboxFor(learnerId: string): OutboxRecord[] {
    return clone(this.state.outbox.filter((record) => record.learnerId === learnerId));
  }

  projectionFor(learnerId: string): LearnerProjectionRecord | null {
    const projection = this.state.projections.get(learnerId);
    return projection === undefined ? null : clone(projection);
  }
}
