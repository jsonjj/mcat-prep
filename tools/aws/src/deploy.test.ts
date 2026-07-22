import { describe, expect, it } from 'vitest';

import {
  DEPLOYMENT_WAVES,
  EXACT_STACK_ORDER,
  planDeploymentCommands,
  validateWavePrerequisite,
} from './deploy';

describe('development deployment plan', () => {
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
