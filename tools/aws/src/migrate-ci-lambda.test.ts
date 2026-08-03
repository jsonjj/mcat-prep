import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { CommandRunner } from './command';
import { MIGRATION_ADVISORY_LOCK_ID, buildMigrationManifest } from './migrate';
import { ciMigrationInvokeCommand, runCiLambdaMigration } from './migrate-ci-lambda';

const FUNCTION_ARN = 'arn:aws:lambda:us-east-1:056956104102:function:mcat-dev-migration-runner';
const GIT_COMMIT = 'a'.repeat(40);

describe('ciMigrationInvokeCommand', () => {
  it('invokes the dev migration Lambda with ambient credentials and no profile', () => {
    const requestPath = join(tmpdir(), 'request.json');
    const responsePath = join(tmpdir(), 'response.json');
    const command = ciMigrationInvokeCommand(FUNCTION_ARN, requestPath, responsePath);

    expect(command).toEqual({
      command: 'aws',
      args: [
        '--region',
        'us-east-1',
        'lambda',
        'invoke',
        '--function-name',
        FUNCTION_ARN,
        '--invocation-type',
        'RequestResponse',
        '--cli-binary-format',
        'raw-in-base64-out',
        '--payload',
        `fileb://${requestPath}`,
        responsePath,
      ],
    });
    // The CI/OIDC path must never pin a named profile; that would break the
    // ambient GitHub OIDC session the deploy workflow relies on.
    expect(command.args).not.toContain('--profile');
  });

  it('rejects a Lambda ARN outside the approved account or region', () => {
    const requestPath = join(tmpdir(), 'request.json');
    const responsePath = join(tmpdir(), 'response.json');
    expect(() =>
      ciMigrationInvokeCommand(
        'arn:aws:lambda:us-east-1:999999999999:function:mcat-dev-migration-runner',
        requestPath,
        responsePath,
      ),
    ).toThrow('migration Lambda ARN');
    expect(() => ciMigrationInvokeCommand(FUNCTION_ARN, '/etc/passwd', responsePath)).toThrow(
      'temporary file',
    );
  });
});

describe('runCiLambdaMigration', () => {
  async function createRepositoryWithMigrations(): Promise<string> {
    const repositoryRoot = await mkdtemp(join(tmpdir(), 'mcat-ci-lambda-'));
    const migrations = join(repositoryRoot, 'database', 'migrations');
    await mkdir(migrations, { recursive: true });
    await writeFile(join(migrations, '0001_first.sql'), 'select 1;\n');
    await writeFile(join(migrations, '0002_second.sql'), 'select 2;\n');
    return repositoryRoot;
  }

  it('invokes the Lambda and returns the manifest when the attestation matches', async () => {
    const repositoryRoot = await createRepositoryWithMigrations();
    const expected = await buildMigrationManifest(
      join(repositoryRoot, 'database', 'migrations'),
      GIT_COMMIT,
    );
    const invocations: string[] = [];
    const runner: CommandRunner = {
      run: async (spec) => {
        invocations.push(spec.args.join(' '));
        const responsePath = spec.args[spec.args.length - 1]!;
        await writeFile(
          responsePath,
          JSON.stringify({
            ok: true,
            advisoryLockId: MIGRATION_ADVISORY_LOCK_ID,
            manifestSha256: expected.sha256,
            migrationCount: expected.migrations.length,
            appliedCount: expected.migrations.length,
            alreadyAppliedCount: 0,
            migrations: expected.migrations.map((migration) => ({
              version: migration.version,
              sha256: migration.sha256,
              status: 'applied' as const,
            })),
          }),
        );
        return { exitCode: 0, stdout: JSON.stringify({ StatusCode: 200 }), stderr: '' };
      },
    };

    const manifest = await runCiLambdaMigration({
      repositoryRoot,
      functionArn: FUNCTION_ARN,
      gitCommit: GIT_COMMIT,
      runner,
    });

    expect(manifest.sha256).toBe(expected.sha256);
    expect(invocations).toHaveLength(1);
    expect(invocations[0]).toContain('lambda invoke');
    expect(invocations[0]).not.toContain('--profile');
  });

  it('throws when the Lambda attestation does not match the manifest', async () => {
    const repositoryRoot = await createRepositoryWithMigrations();
    const runner: CommandRunner = {
      run: async (spec) => {
        const responsePath = spec.args[spec.args.length - 1]!;
        await writeFile(
          responsePath,
          JSON.stringify({
            ok: true,
            advisoryLockId: MIGRATION_ADVISORY_LOCK_ID,
            manifestSha256: 'f'.repeat(64),
            migrations: [],
          }),
        );
        return { exitCode: 0, stdout: JSON.stringify({ StatusCode: 200 }), stderr: '' };
      },
    };

    await expect(
      runCiLambdaMigration({
        repositoryRoot,
        functionArn: FUNCTION_ARN,
        gitCommit: GIT_COMMIT,
        runner,
      }),
    ).rejects.toThrow();
  });

  it('rejects a git commit that is not a full lowercase SHA', async () => {
    const repositoryRoot = await createRepositoryWithMigrations();
    let called = false;
    const runner: CommandRunner = {
      run: async () => {
        called = true;
        return { exitCode: 0, stdout: '{}', stderr: '' };
      },
    };

    await expect(
      runCiLambdaMigration({
        repositoryRoot,
        functionArn: FUNCTION_ARN,
        gitCommit: 'not-a-sha',
        runner,
      }),
    ).rejects.toThrow('Git commit');
    expect(called).toBe(false);
  });
});
