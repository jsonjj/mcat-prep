import type { OutboxRecord } from '@mcat/database';
import { describe, expect, it } from 'vitest';

import { publishOutboxBatch, type ClaimedOutboxStore, type FifoPublisher } from './outbox';

const records: OutboxRecord[] = [
  {
    outboxId: '00000000-0000-4000-8000-000000000001',
    learnerId: '10000000-0000-4000-8000-000000000001',
    sequence: 1,
    topic: 'learner.command.accepted',
    payload: { eventType: 'goal_updated' },
    createdAt: '2026-07-21T00:00:00.000Z',
    publishedAt: null,
    attempts: 0,
  },
  {
    outboxId: '00000000-0000-4000-8000-000000000002',
    learnerId: '20000000-0000-4000-8000-000000000002',
    sequence: 3,
    topic: 'learner.command.accepted',
    payload: { eventType: 'attempt_submitted' },
    createdAt: '2026-07-21T00:00:01.000Z',
    publishedAt: null,
    attempts: 0,
  },
];

class MemoryOutboxStore implements ClaimedOutboxStore {
  readonly published: string[] = [];
  readonly failed: string[] = [];
  readonly finishes: boolean[] = [];

  async claimBatch(): Promise<readonly OutboxRecord[]> {
    return records;
  }

  async markPublished(ids: readonly string[]): Promise<void> {
    this.published.push(...ids);
  }

  async markFailed(ids: readonly string[]): Promise<void> {
    this.failed.push(...ids);
  }

  async finish(commit: boolean): Promise<void> {
    this.finishes.push(commit);
  }
}

describe('publishOutboxBatch', () => {
  it('publishes learner-ordered messages and marks only successful rows', async () => {
    const store = new MemoryOutboxStore();
    const messages: Array<{
      readonly body: string;
      readonly deduplicationId: string;
      readonly groupId: string;
    }> = [];
    const publisher: FifoPublisher = {
      publish: async (batch) => {
        messages.push(...batch);
        return [
          { id: batch[0]!.deduplicationId, ok: true },
          { id: batch[1]!.deduplicationId, ok: false },
        ];
      },
    };

    const result = await publishOutboxBatch({
      store,
      publisher,
      now: () => '2026-07-21T00:00:02.000Z',
      limit: 10,
    });

    expect(messages).toMatchObject([
      {
        deduplicationId: records[0]!.outboxId,
        groupId: records[0]!.learnerId,
      },
      {
        deduplicationId: records[1]!.outboxId,
        groupId: records[1]!.learnerId,
      },
    ]);
    expect(JSON.parse(messages[0]!.body)).toMatchObject({
      messageId: records[0]!.outboxId,
      learnerId: records[0]!.learnerId,
      sequence: 1,
    });
    expect(store.published).toEqual([records[0]!.outboxId]);
    expect(store.failed).toEqual([records[1]!.outboxId]);
    expect(store.finishes).toEqual([true]);
    expect(result).toEqual({ claimed: 2, published: 1, failed: 1 });
  });

  it('does not call the publisher for an empty claim', async () => {
    const store: ClaimedOutboxStore = {
      claimBatch: async () => [],
      markPublished: async () => undefined,
      markFailed: async () => undefined,
      finish: async (commit) => {
        expect(commit).toBe(true);
      },
    };
    let publishCalls = 0;

    const result = await publishOutboxBatch({
      store,
      publisher: {
        publish: async () => {
          publishCalls += 1;
          return [];
        },
      },
      now: () => '2026-07-21T00:00:02.000Z',
      limit: 10,
    });

    expect(publishCalls).toBe(0);
    expect(result).toEqual({ claimed: 0, published: 0, failed: 0 });
  });

  it('rolls back the claim when recording publication state fails', async () => {
    const finishes: boolean[] = [];
    const store: ClaimedOutboxStore = {
      claimBatch: async () => records,
      markPublished: async () => {
        throw new Error('database write failed');
      },
      markFailed: async () => undefined,
      finish: async (commit) => {
        finishes.push(commit);
      },
    };

    await expect(
      publishOutboxBatch({
        store,
        publisher: {
          publish: async (batch) =>
            batch.map(({ deduplicationId }) => ({ id: deduplicationId, ok: true })),
        },
        now: () => '2026-07-21T00:00:02.000Z',
        limit: 10,
      }),
    ).rejects.toThrow('database write failed');
    expect(finishes).toEqual([false]);
  });
});
