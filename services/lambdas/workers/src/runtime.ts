import { SendMessageBatchCommand } from '@aws-sdk/client-sqs';

import type { FifoMessage, FifoPublisher, PublishOutcome } from './outbox';

export interface DatabaseSecret {
  readonly username: string;
  readonly password: string;
}

export interface WorkerEnvironment {
  readonly region: 'us-east-1';
  readonly secretArn: string;
  readonly endpoint: string;
  readonly port: 5432;
  readonly database: string;
  readonly projectionQueueUrl: string;
}

export function parseWorkerEnvironment(
  environment: Readonly<Record<string, string | undefined>>,
): WorkerEnvironment {
  const region = environment.AWS_REGION;
  const secretArn = environment.DB_SECRET_ARN;
  const endpoint = environment.DB_PROXY_ENDPOINT;
  const database = environment.DB_NAME;
  const projectionQueueUrl = environment.PROJECTION_QUEUE_URL;
  if (
    region !== 'us-east-1' ||
    secretArn === undefined ||
    !/^arn:aws:secretsmanager:us-east-1:056956104102:secret:\/mcat\/dev\/database\/admin-[A-Za-z0-9]+$/.test(
      secretArn,
    ) ||
    endpoint === undefined ||
    !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.rds\.amazonaws\.com$/i.test(endpoint) ||
    database === undefined ||
    !/^[A-Za-z_][A-Za-z0-9_]{0,62}$/.test(database) ||
    projectionQueueUrl === undefined ||
    !validQueueUrl(projectionQueueUrl)
  ) {
    throw new Error('Worker environment is invalid.');
  }
  return {
    region,
    secretArn,
    endpoint,
    port: 5432,
    database,
    projectionQueueUrl,
  };
}

export function parseDatabaseSecret(secretString: string): DatabaseSecret {
  let value: unknown;
  try {
    value = JSON.parse(secretString);
  } catch {
    throw new Error('Database secret has an invalid shape.');
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Database secret has an invalid shape.');
  }
  const record = value as Record<string, unknown>;
  if (
    Object.keys(record).sort().join(',') !== 'password,username' ||
    typeof record.username !== 'string' ||
    !/^[A-Za-z_][A-Za-z0-9_]{0,62}$/.test(record.username) ||
    typeof record.password !== 'string' ||
    record.password.length < 16 ||
    record.password.length > 1024
  ) {
    throw new Error('Database secret has an invalid shape.');
  }
  return { username: record.username, password: record.password };
}

export function buildDatabaseUrl(options: {
  readonly endpoint: string;
  readonly port: number;
  readonly database: string;
  readonly secret: DatabaseSecret;
}): string {
  if (
    !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.rds\.amazonaws\.com$/i.test(options.endpoint) ||
    !Number.isSafeInteger(options.port) ||
    options.port < 1 ||
    options.port > 65_535 ||
    !/^[A-Za-z_][A-Za-z0-9_]{0,62}$/.test(options.database)
  ) {
    throw new Error('Database endpoint configuration is invalid.');
  }
  const username = encodeURIComponent(options.secret.username);
  const password = encodeURIComponent(options.secret.password);
  return `postgresql://${username}:${password}@${options.endpoint}:${options.port}/${options.database}`;
}

export interface SqsCommandClient {
  send(command: SendMessageBatchCommand): Promise<{
    readonly Successful?: readonly { readonly Id?: string }[];
    readonly Failed?: readonly { readonly Id?: string }[];
  }>;
}

function validQueueUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return (
      parsed.protocol === 'https:' &&
      /^sqs\.[a-z0-9-]+\.amazonaws\.com$/.test(parsed.hostname) &&
      parsed.search === '' &&
      parsed.hash === '' &&
      parsed.pathname.endsWith('.fifo')
    );
  } catch {
    return false;
  }
}

export class AwsSqsFifoPublisher implements FifoPublisher {
  constructor(
    private readonly queueUrl: string,
    private readonly client: SqsCommandClient,
  ) {
    if (!validQueueUrl(queueUrl)) throw new Error('Projection queue URL is invalid.');
  }

  async publish(messages: readonly FifoMessage[]): Promise<readonly PublishOutcome[]> {
    if (messages.length < 1 || messages.length > 10) {
      throw new Error('SQS batches must contain between 1 and 10 messages.');
    }
    for (const message of messages) {
      if (
        !/^[A-Za-z0-9_-]{1,80}$/.test(message.deduplicationId) ||
        message.groupId.length < 1 ||
        message.groupId.length > 128 ||
        Buffer.byteLength(message.body, 'utf8') > 256 * 1024
      ) {
        throw new Error('Projection message is invalid.');
      }
    }

    const output = await this.client.send(
      new SendMessageBatchCommand({
        QueueUrl: this.queueUrl,
        Entries: messages.map((message) => ({
          Id: message.deduplicationId,
          MessageBody: message.body,
          MessageDeduplicationId: message.deduplicationId,
          MessageGroupId: message.groupId,
        })),
      }),
    );
    const succeeded = new Set((output.Successful ?? []).flatMap((entry) => entry.Id ?? []));
    const failed = new Set((output.Failed ?? []).flatMap((entry) => entry.Id ?? []));
    return messages.map((message) => ({
      id: message.deduplicationId,
      ok: succeeded.has(message.deduplicationId) && !failed.has(message.deduplicationId),
    }));
  }
}
