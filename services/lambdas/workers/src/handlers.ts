import {
  publishOutboxBatch,
  type ClaimedOutboxStore,
  type FifoPublisher,
  type OutboxPublicationResult,
} from './outbox';
import {
  createProjectionHandler,
  type ProjectionBatchResponse,
  type ProjectionConsumerStore,
  type ProjectionMessage,
  type ProjectionQueueEvent,
} from './projection-handler';

export type WorkerLogEvent =
  | {
      readonly event: 'outbox.publish';
      readonly claimed: number;
      readonly published: number;
      readonly failed: number;
    }
  | {
      readonly event: 'projection.consume';
      readonly records: number;
      readonly failed: number;
    };

export type WorkerLogger = (event: WorkerLogEvent) => void;

export function createOutboxHandler(options: {
  readonly storeFactory: () => ClaimedOutboxStore;
  readonly publisher: FifoPublisher;
  readonly now: () => string;
  readonly logger: WorkerLogger;
  readonly limit?: number;
}): () => Promise<OutboxPublicationResult> {
  return async () => {
    const result = await publishOutboxBatch({
      store: options.storeFactory(),
      publisher: options.publisher,
      now: options.now,
      limit: options.limit ?? 25,
    });
    options.logger({ event: 'outbox.publish', ...result });
    return result;
  };
}

export function createProjectionRuntimeHandler(options: {
  readonly consumerName: string;
  readonly store: ProjectionConsumerStore;
  readonly apply: (message: ProjectionMessage) => Promise<void>;
  readonly logger: WorkerLogger;
}): (event: ProjectionQueueEvent) => Promise<ProjectionBatchResponse> {
  const handler = createProjectionHandler({
    consumerName: options.consumerName,
    store: options.store,
    apply: options.apply,
  });
  return async (event) => {
    const response = await handler(event);
    options.logger({
      event: 'projection.consume',
      records: event.Records.length,
      failed: response.batchItemFailures.length,
    });
    return response;
  };
}
