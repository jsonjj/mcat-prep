import { describe, expect, it } from 'vitest';

import { loadDatabaseSecret } from './lambda';

describe('worker Lambda cold-start dependencies', () => {
  it('loads and validates the configured Secrets Manager value', async () => {
    const calls: unknown[] = [];
    const secret = await loadDatabaseSecret(
      {
        send: async (command: { readonly input: unknown }) => {
          calls.push(command.input);
          return {
            SecretString: JSON.stringify({
              username: 'mcat_admin',
              password: 'a-secure-40-character-database-password-value',
            }),
          };
        },
      },
      'arn:aws:secretsmanager:us-east-1:056956104102:secret:/mcat/dev/database/admin-AbCd12',
    );

    expect(secret.username).toBe('mcat_admin');
    expect(calls).toEqual([
      {
        SecretId:
          'arn:aws:secretsmanager:us-east-1:056956104102:secret:/mcat/dev/database/admin-AbCd12',
      },
    ]);
  });

  it('fails closed when Secrets Manager returns no string value', async () => {
    await expect(
      loadDatabaseSecret(
        { send: async () => ({}) },
        'arn:aws:secretsmanager:us-east-1:056956104102:secret:/mcat/dev/database/admin-AbCd12',
      ),
    ).rejects.toThrow('did not return a string');
  });
});
