import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  MIGRATION_ADVISORY_LOCK_ID,
  buildMigrationManifest,
  migrationInvocationCommand,
} from './migrate';

describe('development migration orchestration', () => {
  it('pins lexical migration checksums and the database advisory lock contract', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'mcat-aws-migrations-'));
    await writeFile(join(directory, '0002_second.sql'), 'select 2;\n');
    await writeFile(join(directory, '0001_first.sql'), 'select 1;\n');
    await writeFile(join(directory, 'README.md'), 'ignored');

    const manifest = await buildMigrationManifest(directory, 'a'.repeat(40));

    expect(manifest.advisoryLockId).toBe(MIGRATION_ADVISORY_LOCK_ID);
    expect(manifest.migrations.map((migration) => migration.version)).toEqual([
      '0001_first.sql',
      '0002_second.sql',
    ]);
    expect(manifest.migrations.every((migration) => /^[a-f0-9]{64}$/.test(migration.sha256))).toBe(
      true,
    );
  });

  it('invokes only the dedicated dev migration Lambda without a shell', () => {
    const requestPath = join(tmpdir(), 'request.json');
    const responsePath = join(tmpdir(), 'response.json');
    const command = migrationInvocationCommand(
      'arn:aws:lambda:us-east-1:056956104102:function:mcat-dev-migration-runner',
      requestPath,
      responsePath,
    );

    expect(command).toEqual({
      command: 'aws',
      args: [
        '--profile',
        'sbsandbox',
        '--region',
        'us-east-1',
        'lambda',
        'invoke',
        '--function-name',
        'arn:aws:lambda:us-east-1:056956104102:function:mcat-dev-migration-runner',
        '--invocation-type',
        'RequestResponse',
        '--cli-binary-format',
        'raw-in-base64-out',
        '--payload',
        `fileb://${requestPath}`,
        responsePath,
      ],
    });
    expect(() =>
      migrationInvocationCommand(
        'arn:aws:lambda:us-east-1:999999999999:function:mcat-dev-migration-runner',
        requestPath,
        responsePath,
      ),
    ).toThrow('migration Lambda ARN');
  });
});
