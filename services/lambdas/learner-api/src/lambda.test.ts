import { describe, expect, it } from 'vitest';

import { createGuestProjection, loadDatabaseSecret, parseLearnerApiEnvironment } from './lambda';

describe('learner Lambda runtime composition', () => {
  it('creates the initial synthetic projection for the supplied learner identity', () => {
    const learnerId = '10000000-0000-4000-8000-000000000001';
    const now = '2026-07-21T12:00:00.000Z';

    const projection = createGuestProjection(learnerId, now);

    expect(projection).toMatchObject({
      learnerId,
      sequence: 0,
      projectionVersion: 'synthetic-authority-v1',
      state: {
        learnerId,
        accountState: 'guest',
        onboarding: { diagnosticComplete: true, planConfirmed: false },
      },
      updatedAt: now,
    });
  });

  it('validates exact development environment coordinates', () => {
    const environment = parseLearnerApiEnvironment({
      AWS_REGION: 'us-east-1',
      DB_SECRET_ARN:
        'arn:aws:secretsmanager:us-east-1:056956104102:secret:/mcat/dev/database/admin-AbCd12',
      DB_PROXY_ENDPOINT: 'mcat-dev-proxy.proxy-abc.us-east-1.rds.amazonaws.com',
      DB_NAME: 'mcat',
      LEARNER_WEB_ORIGIN: 'https://d1234567890.cloudfront.net',
    });

    expect(environment).toMatchObject({ region: 'us-east-1', database: 'mcat', port: 5432 });
    expect(() => parseLearnerApiEnvironment({ AWS_REGION: 'us-west-2' })).toThrow(
      'Learner API environment is invalid',
    );
  });

  it('loads only a string database secret', async () => {
    const secret = await loadDatabaseSecret(
      {
        send: async () => ({
          SecretString: JSON.stringify({
            username: 'mcat_admin',
            password: 'a-secure-40-character-database-password-value',
          }),
        }),
      },
      'arn:aws:secretsmanager:us-east-1:056956104102:secret:/mcat/dev/database/admin-AbCd12',
    );

    expect(secret.username).toBe('mcat_admin');
    await expect(
      loadDatabaseSecret(
        { send: async () => ({}) },
        'arn:aws:secretsmanager:us-east-1:056956104102:secret:/mcat/dev/database/admin-AbCd12',
      ),
    ).rejects.toThrow('did not return a string');
  });
});
