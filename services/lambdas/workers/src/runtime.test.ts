import { describe, expect, it } from 'vitest';

import {
  AwsSqsFifoPublisher,
  buildDatabaseUrl,
  parseDatabaseSecret,
  parseWorkerEnvironment,
} from './runtime';

describe('worker runtime configuration', () => {
  it('parses only the expected database secret shape and URL-encodes credentials', () => {
    const secret = parseDatabaseSecret(
      JSON.stringify({ username: 'mcat_user', password: 'p@ss:/?#[]word1234' }),
    );

    expect(
      buildDatabaseUrl({
        endpoint: 'mcat-dev-proxy.proxy-abc.us-east-1.rds.amazonaws.com',
        port: 5432,
        database: 'mcat',
        secret,
      }),
    ).toBe(
      'postgresql://mcat_user:p%40ss%3A%2F%3F%23%5B%5Dword1234@mcat-dev-proxy.proxy-abc.us-east-1.rds.amazonaws.com:5432/mcat',
    );
    expect(() =>
      parseDatabaseSecret(JSON.stringify({ username: 'mcat_user', password: 'safe', extra: true })),
    ).toThrow('invalid shape');
  });

  it('maps SQS batch results without exposing message bodies', async () => {
    const inputs: unknown[] = [];
    const client = {
      send: async (command: { readonly input: unknown }) => {
        inputs.push(command.input);
        return {
          Successful: [{ Id: '00000000-0000-4000-8000-000000000001' }],
          Failed: [{ Id: '00000000-0000-4000-8000-000000000002' }],
        };
      },
    };
    const publisher = new AwsSqsFifoPublisher(
      'https://sqs.us-east-1.amazonaws.com/056956104102/mcat-dev-projection.fifo',
      client,
    );

    const result = await publisher.publish([
      {
        body: JSON.stringify({ eventType: 'goal_updated' }),
        deduplicationId: '00000000-0000-4000-8000-000000000001',
        groupId: '10000000-0000-4000-8000-000000000001',
      },
      {
        body: JSON.stringify({ eventType: 'attempt_submitted' }),
        deduplicationId: '00000000-0000-4000-8000-000000000002',
        groupId: '10000000-0000-4000-8000-000000000001',
      },
    ]);

    expect(result).toEqual([
      { id: '00000000-0000-4000-8000-000000000001', ok: true },
      { id: '00000000-0000-4000-8000-000000000002', ok: false },
    ]);
    const input = inputs[0] as {
      readonly QueueUrl: string;
      readonly Entries: readonly Record<string, string>[];
    };
    expect(input.QueueUrl).toBe(
      'https://sqs.us-east-1.amazonaws.com/056956104102/mcat-dev-projection.fifo',
    );
    expect(input.Entries).toHaveLength(2);
    expect(input.Entries[0]).toMatchObject({
      Id: '00000000-0000-4000-8000-000000000001',
      MessageDeduplicationId: '00000000-0000-4000-8000-000000000001',
      MessageGroupId: '10000000-0000-4000-8000-000000000001',
    });
  });

  it('fails closed unless every worker environment coordinate is exact', () => {
    const environment = parseWorkerEnvironment({
      AWS_REGION: 'us-east-1',
      DB_SECRET_ARN:
        'arn:aws:secretsmanager:us-east-1:056956104102:secret:/mcat/dev/database/admin-AbCd12',
      DB_PROXY_ENDPOINT: 'mcat-dev-proxy.proxy-abc.us-east-1.rds.amazonaws.com',
      DB_NAME: 'mcat',
      PROJECTION_QUEUE_URL:
        'https://sqs.us-east-1.amazonaws.com/056956104102/mcat-dev-projection.fifo',
    });

    expect(environment).toMatchObject({ region: 'us-east-1', database: 'mcat', port: 5432 });
    expect(() => parseWorkerEnvironment({ AWS_REGION: 'us-west-2' })).toThrow(
      'Worker environment is invalid',
    );
  });
});
