import { describe, expect, it } from 'vitest';

import {
  createGuestProjection,
  loadDatabaseSecret,
  loadOriginVerificationSecret,
  loadRateLimitPepper,
  parseLearnerApiEnvironment,
} from './lambda';

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
        onboarding: { diagnosticComplete: false, planConfirmed: false },
      },
      updatedAt: now,
    });
  });

  it('validates exact development environment coordinates', () => {
    const environment = parseLearnerApiEnvironment({
      AWS_REGION: 'us-east-1',
      DB_SECRET_ARN:
        'arn:aws:secretsmanager:us-east-1:056956104102:secret:/mcat/dev/database/learner-api-AbCd12',
      RATE_LIMIT_PEPPER_SECRET_ARN:
        'arn:aws:secretsmanager:us-east-1:056956104102:secret:/mcat/dev/rate-limit/pepper-AbCd12',
      ORIGIN_VERIFICATION_SECRET_ARN:
        'arn:aws:secretsmanager:us-east-1:056956104102:secret:/mcat/dev/origin/verification-AbCd12',
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
            username: 'mcat_learner_api',
            password: 'a-secure-40-character-database-password-value',
          }),
        }),
      },
      'arn:aws:secretsmanager:us-east-1:056956104102:secret:/mcat/dev/database/learner-api-AbCd12',
    );

    expect(secret.username).toBe('mcat_learner_api');
    await expect(
      loadDatabaseSecret(
        {
          send: async () => ({
            SecretString: JSON.stringify({
              username: 'mcat_admin',
              password: 'a-secure-40-character-database-password-value',
            }),
          }),
        },
        'arn:aws:secretsmanager:us-east-1:056956104102:secret:/mcat/dev/database/learner-api-AbCd12',
      ),
    ).rejects.toThrow('invalid shape');
    await expect(
      loadDatabaseSecret(
        { send: async () => ({}) },
        'arn:aws:secretsmanager:us-east-1:056956104102:secret:/mcat/dev/database/learner-api-AbCd12',
      ),
    ).rejects.toThrow('did not return a string');
  });

  it('loads a bounded raw rate-limit pepper', async () => {
    const pepper = 'p'.repeat(64);
    await expect(
      loadRateLimitPepper(
        { send: async () => ({ SecretString: pepper }) },
        'arn:aws:secretsmanager:us-east-1:056956104102:secret:/mcat/dev/rate-limit/pepper-AbCd12',
      ),
    ).resolves.toBe(pepper);
    await expect(
      loadRateLimitPepper(
        { send: async () => ({ SecretString: 'short' }) },
        'arn:aws:secretsmanager:us-east-1:056956104102:secret:/mcat/dev/rate-limit/pepper-AbCd12',
      ),
    ).rejects.toThrow('invalid');
  });

  it('loads only an exact 64-character origin-verification secret', async () => {
    const secret = 'o'.repeat(64);
    await expect(
      loadOriginVerificationSecret(
        { send: async () => ({ SecretString: secret }) },
        'arn:aws:secretsmanager:us-east-1:056956104102:secret:/mcat/dev/origin/verification-AbCd12',
      ),
    ).resolves.toBe(secret);
    await expect(
      loadOriginVerificationSecret(
        { send: async () => ({ SecretString: 'o'.repeat(63) }) },
        'arn:aws:secretsmanager:us-east-1:056956104102:secret:/mcat/dev/origin/verification-AbCd12',
      ),
    ).rejects.toThrow('invalid');
  });
});
