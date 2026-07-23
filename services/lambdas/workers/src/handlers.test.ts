import { describe, expect, it } from 'vitest';

import { createOutboxHandler, createProjectionRuntimeHandler } from './handlers';
import type { ClaimedOutboxStore } from './outbox';

describe('worker Lambda handlers', () => {
  it('publishes a bounded outbox batch and emits only aggregate structured data', async () => {
    const logs: unknown[] = [];
    const store: ClaimedOutboxStore = {
      claimBatch: async () => [],
      markPublished: async () => undefined,
      markFailed: async () => undefined,
      finish: async () => undefined,
    };
    const handler = createOutboxHandler({
      storeFactory: () => store,
      publisher: { publish: async () => [] },
      now: () => '2026-07-21T12:00:00.000Z',
      logger: (event) => logs.push(event),
    });

    expect(await handler()).toEqual({ claimed: 0, published: 0, failed: 0 });
    expect(logs).toEqual([
      {
        event: 'outbox.publish',
        claimed: 0,
        published: 0,
        failed: 0,
      },
    ]);
  });

  it('returns FIFO partial failures and logs counts without message data', async () => {
    const logs: unknown[] = [];
    const handler = createProjectionRuntimeHandler({
      consumerName: 'mastery-v1',
      store: {
        consumeOnce: async (_consumer, _message, apply) => {
          await apply();
          return 'applied';
        },
      },
      apply: async () => {
        throw new Error('projection failed');
      },
      logger: (event) => logs.push(event),
    });
    const messageId = '00000000-0000-4000-8000-000000000001';
    const learnerId = '10000000-0000-4000-8000-000000000001';

    const result = await handler({
      Records: [
        {
          messageId,
          attributes: { MessageGroupId: learnerId },
          body: JSON.stringify({
            messageId,
            learnerId,
            sequence: 1,
            topic: 'learner.command.accepted',
            payload: { eventType: 'goal_updated' },
            createdAt: '2026-07-21T12:00:00.000Z',
          }),
        },
      ],
    });

    expect(result).toEqual({ batchItemFailures: [{ itemIdentifier: messageId }] });
    expect(logs).toEqual([{ event: 'projection.consume', records: 1, failed: 1 }]);
    expect(JSON.stringify(logs)).not.toContain(learnerId);
  });
});
