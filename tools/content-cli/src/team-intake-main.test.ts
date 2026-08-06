import { describe, expect, it } from 'vitest';

import { parseTeamIntakeCliArguments, teamIntakeUsage } from './team-intake-main';

describe('team intake CLI arguments', () => {
  it('defaults to dry-run, requires explicit accept, and exposes no authority overrides', () => {
    expect(parseTeamIntakeCliArguments(['--checkout-root', '/fixed/team-wave'])).toEqual({
      help: false,
      mode: 'DRY_RUN',
      source: { kind: 'CHECKOUT', root: '/fixed/team-wave' },
    });
    expect(
      parseTeamIntakeCliArguments(['--checkout-root', '/fixed/team-wave', '--accept']),
    ).toMatchObject({ mode: 'ACCEPT' });
    expect(() =>
      parseTeamIntakeCliArguments([
        '--checkout-root',
        '/fixed/team-wave',
        '--destination',
        '/arbitrary',
      ]),
    ).toThrow(/UNSUPPORTED_ARGUMENT/);
    expect(() =>
      parseTeamIntakeCliArguments(['--checkout-root', '/fixed/team-wave', '--team', 'team-A']),
    ).toThrow(/UNSUPPORTED_ARGUMENT/);
  });

  it('accepts only archive and attestation paths and rejects caller-selected signer keys', () => {
    expect(
      parseTeamIntakeCliArguments([
        '--archive',
        '/returns/team-A.zip',
        '--attestation',
        '/returns/team-A.json',
      ]),
    ).toEqual({
      help: false,
      mode: 'DRY_RUN',
      source: {
        archivePath: '/returns/team-A.zip',
        attestationPath: '/returns/team-A.json',
        kind: 'SIGNED_ARCHIVE',
      },
    });
    expect(() =>
      parseTeamIntakeCliArguments([
        '--archive',
        '/returns/team-A.zip',
        '--attestation',
        '/returns/team-A.json',
        '--public-key',
        '/arbitrary/key.pem',
      ]),
    ).toThrow(/UNSUPPORTED_ARGUMENT/);
  });

  it('parses only the complete receipt-bound FINAL_TEAM supersession mode', () => {
    expect(
      parseTeamIntakeCliArguments([
        '--checkout-root',
        '/fixed/team-wave',
        '--supersede-final-team',
        '--expected-prior-source-batch',
        '1'.repeat(64),
        '--expected-prior-staging-identity',
        '2'.repeat(64),
      ]),
    ).toEqual({
      help: false,
      mode: 'DRY_RUN',
      source: { kind: 'CHECKOUT', root: '/fixed/team-wave' },
      supersession: {
        action: 'SUPERSEDE_FINAL_TEAM',
        expectedPriorSourceBatchSha256: '1'.repeat(64),
        expectedPriorStagingIdentitySha256: '2'.repeat(64),
      },
    });
  });

  it.each([
    ['--supersede-final-team'],
    ['--expected-prior-source-batch', '1'.repeat(64)],
    ['--expected-prior-staging-identity', '2'.repeat(64)],
    ['--supersede-final-team', '--expected-prior-source-batch', '1'.repeat(64)],
  ])('rejects partial supersession arguments: %j', (...supersessionArguments) => {
    expect(() =>
      parseTeamIntakeCliArguments([
        '--checkout-root',
        '/fixed/team-wave',
        ...supersessionArguments,
      ]),
    ).toThrow(/SUPERSESSION_ARGUMENTS_INCOMPLETE/);
  });

  it('rejects malformed identities and all caller-selected transaction paths', () => {
    expect(() =>
      parseTeamIntakeCliArguments([
        '--checkout-root',
        '/fixed/team-wave',
        '--supersede-final-team',
        '--expected-prior-source-batch',
        'not-a-digest',
        '--expected-prior-staging-identity',
        '2'.repeat(64),
      ]),
    ).toThrow(/SUPERSESSION_IDENTITY_INVALID/);
    for (const [flag, value] of [
      ['--prior-receipt', '/caller/receipt.json'],
      ['--supersession-journal', '/caller/journal.json'],
      ['--history-root', '/caller/history'],
      ['--lock-path', '/caller/lock'],
      ['--generation-path', '/caller/generation'],
      ['--successor-path', '/caller/successor'],
    ] as const) {
      expect(() =>
        parseTeamIntakeCliArguments(['--checkout-root', '/fixed/team-wave', flag, value]),
      ).toThrow(/UNSUPPORTED_ARGUMENT/);
    }
  });

  it('documents explicit supersession authority without exposing control paths', () => {
    const help = teamIntakeUsage();
    expect(help).toContain('--supersede-final-team');
    expect(help).toContain('--expected-prior-source-batch');
    expect(help).toContain('--expected-prior-staging-identity');
    expect(help).toContain('content-addressed acceptance artifact');
    expect(help).toContain('atomic immutable symlink marker');
    expect(help).not.toContain('--history-root');
    expect(help).not.toContain('--prior-receipt');
    expect(help).not.toContain('--supersession-journal');
    expect(help).not.toContain('--generation-path');
  });
});
