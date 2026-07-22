import { describe, expect, it } from 'vitest';

import {
  createProjectionHandler,
  type ProjectionConsumerStore,
  type ProjectionMessage,
} from './projection-handler';

class MemoryProjectionStore implements ProjectionConsumerStore {
  readonly consumed = new Set<string>();
  readonly appliedSequences: number[] = [];

  async consumeOnce(
    consumerName: string,
    message: ProjectionMessage,
    apply: () => Promise<void>,
  ): Promise<'applied' | 'duplicate'> {
    const key = `${consumerName}:${message.messageId}`;
    if (this.consumed.has(key)) return 'duplicate';
    await apply();
    this.consumed.add(key);
    this.appliedSequences.push(message.sequence);
    return 'applied';
  }
}

function record(message: ProjectionMessage, messageGroupId = message.learnerId) {
  return {
    messageId: message.messageId,
    body: JSON.stringify(message),
    attributes: { MessageGroupId: messageGroupId },
  };
}

const message: ProjectionMessage = {
  messageId: '00000000-0000-4000-8000-000000000010',
  learnerId: '10000000-0000-4000-8000-000000000010',
  sequence: 1,
  topic: 'learner.command.accepted',
  payload: { eventType: 'goal_updated' },
  createdAt: '2026-07-21T00:00:00.000Z',
};

describe('createProjectionHandler', () => {
  it('acknowledges a duplicate delivery without applying it twice', async () => {
    const store = new MemoryProjectionStore();
    const applied: number[] = [];
    const handler = createProjectionHandler({
      consumerName: 'mastery-v1',
      store,
      apply: async (value) => {
        applied.push(value.sequence);
      },
    });

    expect(await handler({ Records: [record(message)] })).toEqual({ batchItemFailures: [] });
    expect(await handler({ Records: [record(message)] })).toEqual({ batchItemFailures: [] });
    expect(applied).toEqual([1]);
    expect(store.appliedSequences).toEqual([1]);
  });

  it('fails the broken message and later messages from the same FIFO group', async () => {
    const store = new MemoryProjectionStore();
    const second = { ...message, messageId: crypto.randomUUID(), sequence: 2 };
    const other = {
      ...message,
      messageId: crypto.randomUUID(),
      learnerId: crypto.randomUUID(),
      sequence: 1,
    };
    const handler = createProjectionHandler({
      consumerName: 'mastery-v1',
      store,
      apply: async (value) => {
        if (value.messageId === message.messageId) throw new Error('projection failed');
      },
    });

    const result = await handler({ Records: [record(message), record(second), record(other)] });

    expect(result.batchItemFailures).toEqual([
      { itemIdentifier: message.messageId },
      { itemIdentifier: second.messageId },
    ]);
    expect(store.appliedSequences).toEqual([1]);
  });

  it('rejects a body whose learner does not match its FIFO group', async () => {
    const store = new MemoryProjectionStore();
    const handler = createProjectionHandler({
      consumerName: 'mastery-v1',
      store,
      apply: async () => undefined,
    });

    const result = await handler({ Records: [record(message, crypto.randomUUID())] });

    expect(result).toEqual({
      batchItemFailures: [{ itemIdentifier: message.messageId }],
    });
    expect(store.appliedSequences).toEqual([]);
  });
});
