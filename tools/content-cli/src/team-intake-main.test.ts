import { describe, expect, it } from 'vitest';

import { parseTeamIntakeCliArguments } from './team-intake-main';

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
});
