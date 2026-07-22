import { access, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  DEPLOYMENT_WAVES,
  EXACT_STACK_ORDER,
  planDeploymentCommands,
  validateWavePrerequisite,
  withIsolatedCloudAssembly,
} from './deploy';

describe('development deployment plan', () => {
  it('keeps the reviewed assembly immutable when CDK writes its deployment cache', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'mcat-reviewed-assembly-'));
    const reviewed = join(directory, 'cdk.out');
    await mkdir(reviewed);
    await writeFile(join(reviewed, 'manifest.json'), '{"reviewed":true}');

    let isolated = '';
    await withIsolatedCloudAssembly(reviewed, async (path) => {
      isolated = path;
      expect(path).not.toBe(reviewed);
      await mkdir(join(path, '.cache'));
      await writeFile(join(path, '.cache', 'asset.zip'), 'cdk cache');
      await writeFile(join(path, 'manifest.json'), '{"mutated":true}');
    });

    await expect(readFile(join(reviewed, 'manifest.json'), 'utf8')).resolves.toBe(
      '{"reviewed":true}',
    );
    await expect(access(join(reviewed, '.cache'))).rejects.toThrow();
    await expect(access(isolated)).rejects.toThrow();
  });

  it('deploys only the exact allowlist, serially and in dependency order', () => {
    expect(EXACT_STACK_ORDER).toEqual([
      'McatDevFoundation',
      'McatDevData',
      'McatDevWeb',
      'McatDevApi',
      'McatDevIdentity',
      'McatDevAsync',
      'McatDevPublication',
      'McatDevOperations',
      'McatDevAnalytics',
    ]);
    expect(DEPLOYMENT_WAVES.foundation).toEqual(['McatDevFoundation', 'McatDevData', 'McatDevWeb']);
    expect(DEPLOYMENT_WAVES.authority).toEqual([
      'McatDevApi',
      'McatDevIdentity',
      'McatDevAsync',
      'McatDevPublication',
      'McatDevOperations',
    ]);

    const commands = planDeploymentCommands(EXACT_STACK_ORDER);
    expect(commands).toHaveLength(EXACT_STACK_ORDER.length);
    expect(commands[0]).toMatchObject({
      command: 'pnpm',
      args: expect.arrayContaining([
        'McatDevFoundation',
        '--exclusively',
        '--profile',
        'sbsandbox',
      ]),
    });
    expect(commands.flatMap((command) => command.args).join(' ')).not.toContain('*');
  });

  it('rejects subsets, reordering, duplicates, and extra stacks', () => {
    expect(() => planDeploymentCommands(['McatDevFoundation'])).toThrow('exact stack order');
    expect(() => planDeploymentCommands([...EXACT_STACK_ORDER].reverse())).toThrow(
      'exact stack order',
    );
    expect(() => planDeploymentCommands([...EXACT_STACK_ORDER, 'McatDevSurprise'])).toThrow(
      'exact stack order',
    );
  });

  it('requires migration and smoke attestations before later waves', () => {
    const commit = 'a'.repeat(40);
    expect(() => validateWavePrerequisite('authority', commit)).toThrow('migration attestation');
    expect(() =>
      validateWavePrerequisite('authority', commit, {
        schemaVersion: 1,
        kind: 'migration',
        account: '056956104102',
        region: 'us-east-1',
        gitCommit: commit,
        evidenceSha256: 'b'.repeat(64),
        verifiedAt: '2026-07-21T12:00:00.000Z',
      }),
    ).not.toThrow();
    expect(() => validateWavePrerequisite('edge', commit)).toThrow('smoke attestation');
    expect(() =>
      validateWavePrerequisite('edge', commit, {
        schemaVersion: 1,
        kind: 'smoke',
        account: '056956104102',
        region: 'us-east-1',
        gitCommit: commit,
        evidenceSha256: 'c'.repeat(64),
        verifiedAt: '2026-07-21T12:00:00.000Z',
        checks: ['health'],
      }),
    ).toThrow('required boundary check');
    expect(() =>
      validateWavePrerequisite('edge', commit, {
        schemaVersion: 1,
        kind: 'smoke',
        account: '056956104102',
        region: 'us-east-1',
        gitCommit: commit,
        evidenceSha256: 'c'.repeat(64),
        verifiedAt: '2026-07-21T12:00:00.000Z',
        checks: [
          'health',
          'cors',
          'guest-bootstrap-cookies',
          'goal-idempotency',
          'authorized-reads',
          'protected-negative-boundaries',
        ],
      }),
    ).toThrow('required boundary check');
  });
});
