import { describe, expect, it } from 'vitest';

import { renderPreflightResult } from './kit-result';

describe('kit CLI preflight result gate', () => {
  it('exits zero only for a closed PREFLIGHT_OK result', () => {
    expect(
      renderPreflightResult({
        status: 'PREFLIGHT_OK',
        runId: '2026-08-03T1727-0500',
        userSendable: false,
        authority: {
          state: 'VALID_UNCONSUMED',
          repositoryCommit: 'a'.repeat(40),
          action: 'PACKAGE_KITS',
          teams: [
            { teamId: 'team-A', lessonCount: 30 },
            { teamId: 'team-B', lessonCount: 30 },
          ],
        },
      }),
    ).toEqual({
      exitCode: 0,
      summary: {
        status: 'PREFLIGHT_OK',
        runId: '2026-08-03T1727-0500',
        userSendable: false,
        authority: {
          state: 'VALID_UNCONSUMED',
          repositoryCommit: 'a'.repeat(40),
          action: 'PACKAGE_KITS',
          teams: [
            { teamId: 'team-A', lessonCount: 30 },
            { teamId: 'team-B', lessonCount: 30 },
          ],
        },
      },
    });
  });

  it('prints safe blockers and exits nonzero for BLOCKED', () => {
    expect(
      renderPreflightResult({
        status: 'BLOCKED',
        runId: '2026-08-03T1727-0500',
        userSendable: false,
        blockers: [{ code: 'SOURCE_COMMIT_MISMATCH', message: '/private/path omitted' }],
      }),
    ).toEqual({
      exitCode: 1,
      summary: {
        status: 'BLOCKED',
        runId: '2026-08-03T1727-0500',
        userSendable: false,
        blockers: [{ code: 'SOURCE_COMMIT_MISMATCH' }],
      },
    });
  });

  it('rejects the impossible BLOCKED plus empty blockers state', () => {
    expect(() =>
      renderPreflightResult({
        status: 'BLOCKED',
        runId: '2026-08-03T1727-0500',
        userSendable: false,
        blockers: [],
      }),
    ).toThrow(/INVALID_PREFLIGHT_RESULT/);
  });
});
