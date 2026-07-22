import type { JsonObject } from '@mcat/database';

export interface ProjectionMessage {
  readonly messageId: string;
  readonly learnerId: string;
  readonly sequence: number;
  readonly topic: 'learner.command.accepted';
  readonly payload: JsonObject;
  readonly createdAt: string;
}

export interface ProjectionConsumerStore {
  consumeOnce(
    consumerName: string,
    message: ProjectionMessage,
    apply: () => Promise<void>,
  ): Promise<'applied' | 'duplicate'>;
}

export interface ProjectionQueueRecord {
  readonly messageId: string;
  readonly body: string;
  readonly attributes?: Readonly<Record<string, string>>;
}

export interface ProjectionQueueEvent {
  readonly Records: readonly ProjectionQueueRecord[];
}

export interface ProjectionBatchResponse {
  readonly batchItemFailures: readonly { readonly itemIdentifier: string }[];
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function parseMessage(record: ProjectionQueueRecord): ProjectionMessage {
  let raw: unknown;
  try {
    raw = JSON.parse(record.body);
  } catch {
    throw new Error('Projection message body is not valid JSON.');
  }
  if (!isObject(raw)) throw new Error('Projection message body must be an object.');

  const { messageId, learnerId, sequence, topic, payload, createdAt } = raw;
  if (typeof messageId !== 'string' || !UUID.test(messageId)) {
    throw new Error('Projection message identifier is invalid.');
  }
  if (typeof learnerId !== 'string' || !UUID.test(learnerId)) {
    throw new Error('Projection learner identifier is invalid.');
  }
  if (record.attributes?.MessageGroupId !== learnerId) {
    throw new Error('Projection learner does not match the FIFO message group.');
  }
  if (!Number.isSafeInteger(sequence) || (sequence as number) < 1) {
    throw new Error('Projection sequence is invalid.');
  }
  if (topic !== 'learner.command.accepted') {
    throw new Error('Projection topic is not supported.');
  }
  if (!isObject(payload)) throw new Error('Projection payload must be an object.');
  if (typeof createdAt !== 'string' || Number.isNaN(Date.parse(createdAt))) {
    throw new Error('Projection creation time is invalid.');
  }

  return {
    messageId,
    learnerId,
    sequence: sequence as number,
    topic,
    payload: payload as JsonObject,
    createdAt,
  };
}

export function createProjectionHandler(options: {
  readonly consumerName: string;
  readonly store: ProjectionConsumerStore;
  readonly apply: (message: ProjectionMessage) => Promise<void>;
}): (event: ProjectionQueueEvent) => Promise<ProjectionBatchResponse> {
  if (options.consumerName.trim() === '') throw new Error('Projection consumer name is required.');

  return async (event) => {
    const failures: { itemIdentifier: string }[] = [];
    const failedGroups = new Set<string>();

    for (const record of event.Records) {
      const groupId = record.attributes?.MessageGroupId;
      if (groupId !== undefined && failedGroups.has(groupId)) {
        failures.push({ itemIdentifier: record.messageId });
        continue;
      }

      try {
        const message = parseMessage(record);
        await options.store.consumeOnce(options.consumerName, message, async () => {
          await options.apply(message);
        });
      } catch {
        if (groupId !== undefined) failedGroups.add(groupId);
        failures.push({ itemIdentifier: record.messageId });
      }
    }

    return { batchItemFailures: failures };
  };
}
