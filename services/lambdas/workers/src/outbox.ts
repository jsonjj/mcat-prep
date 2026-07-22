import type { JsonObject, OutboxRecord } from '@mcat/database';

export interface ClaimedOutboxStore {
  claimBatch(limit: number): Promise<readonly OutboxRecord[]>;
  markPublished(ids: readonly string[], publishedAt: string): Promise<void>;
  markFailed(ids: readonly string[]): Promise<void>;
  finish(commit: boolean): Promise<void>;
}

export interface FifoMessage {
  readonly body: string;
  readonly deduplicationId: string;
  readonly groupId: string;
}

export interface PublishOutcome {
  readonly id: string;
  readonly ok: boolean;
}

export interface FifoPublisher {
  publish(messages: readonly FifoMessage[]): Promise<readonly PublishOutcome[]>;
}

export interface OutboxPublicationResult {
  readonly claimed: number;
  readonly published: number;
  readonly failed: number;
}

interface ProjectionMessageBody {
  readonly messageId: string;
  readonly learnerId: string;
  readonly sequence: number;
  readonly topic: string;
  readonly payload: JsonObject;
  readonly createdAt: string;
}

const SQS_BATCH_LIMIT = 10;

function toMessage(record: OutboxRecord): FifoMessage {
  const body: ProjectionMessageBody = {
    messageId: record.outboxId,
    learnerId: record.learnerId,
    sequence: record.sequence,
    topic: record.topic,
    payload: record.payload,
    createdAt: record.createdAt,
  };
  return {
    body: JSON.stringify(body),
    deduplicationId: record.outboxId,
    groupId: record.learnerId,
  };
}

function chunks<T>(values: readonly T[], size: number): readonly (readonly T[])[] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

export async function publishOutboxBatch(options: {
  readonly store: ClaimedOutboxStore;
  readonly publisher: FifoPublisher;
  readonly now: () => string;
  readonly limit: number;
}): Promise<OutboxPublicationResult> {
  if (!Number.isSafeInteger(options.limit) || options.limit < 1 || options.limit > 100) {
    throw new RangeError('Outbox claim limit must be an integer between 1 and 100.');
  }

  let commit = false;
  try {
    const records = await options.store.claimBatch(options.limit);
    if (records.length === 0) {
      commit = true;
      return { claimed: 0, published: 0, failed: 0 };
    }

    const published: string[] = [];
    const failed: string[] = [];
    for (const batch of chunks(records, SQS_BATCH_LIMIT)) {
      const messages = batch.map(toMessage);
      try {
        const outcomes = await options.publisher.publish(messages);
        const byId = new Map(outcomes.map((outcome) => [outcome.id, outcome.ok]));
        for (const record of batch) {
          if (byId.get(record.outboxId) === true) published.push(record.outboxId);
          else failed.push(record.outboxId);
        }
      } catch {
        failed.push(...batch.map((record) => record.outboxId));
      }
    }

    if (published.length > 0) await options.store.markPublished(published, options.now());
    if (failed.length > 0) await options.store.markFailed(failed);
    commit = true;
    return { claimed: records.length, published: published.length, failed: failed.length };
  } finally {
    await options.store.finish(commit);
  }
}
