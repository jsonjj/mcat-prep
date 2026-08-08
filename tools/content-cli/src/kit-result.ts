interface SafeBlocker {
  readonly code: string;
}

interface SafeAuthoritySummary {
  readonly state: 'VALID_UNCONSUMED';
  readonly repositoryCommit: string;
  readonly action: 'PACKAGE_KITS';
  readonly teams: readonly [
    { readonly teamId: 'team-A'; readonly lessonCount: 30 },
    { readonly teamId: 'team-B'; readonly lessonCount: 30 },
  ];
}

export type SafePreflightSummary =
  | {
      readonly status: 'PREFLIGHT_OK';
      readonly runId: string;
      readonly userSendable: false;
      readonly authority: SafeAuthoritySummary;
    }
  | {
      readonly status: 'BLOCKED';
      readonly runId: string;
      readonly userSendable: false;
      readonly blockers: readonly [SafeBlocker, ...SafeBlocker[]];
    };

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
}

function invalid(): never {
  throw new Error('INVALID_PREFLIGHT_RESULT');
}

export function renderPreflightResult(value: unknown): {
  readonly exitCode: 0 | 1;
  readonly summary: SafePreflightSummary;
} {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) invalid();
  const result = value as Record<string, unknown>;
  if (
    typeof result.runId !== 'string' ||
    result.runId.length === 0 ||
    result.userSendable !== false
  ) {
    invalid();
  }
  if (result.status === 'PREFLIGHT_OK') {
    if (!exactKeys(result, ['authority', 'runId', 'status', 'userSendable'])) invalid();
    const authority = result.authority;
    if (authority === null || typeof authority !== 'object' || Array.isArray(authority)) invalid();
    const record = authority as Record<string, unknown>;
    if (
      !exactKeys(record, ['action', 'repositoryCommit', 'state', 'teams']) ||
      record.state !== 'VALID_UNCONSUMED' ||
      record.action !== 'PACKAGE_KITS' ||
      typeof record.repositoryCommit !== 'string' ||
      !/^[0-9a-f]{40}$/.test(record.repositoryCommit) ||
      !Array.isArray(record.teams) ||
      record.teams.length !== 2
    ) {
      invalid();
    }
    const teams = record.teams.map((team) => {
      if (team === null || typeof team !== 'object' || Array.isArray(team)) invalid();
      const item = team as Record<string, unknown>;
      if (
        !exactKeys(item, ['lessonCount', 'teamId']) ||
        !['team-A', 'team-B'].includes(String(item.teamId)) ||
        item.lessonCount !== 30
      ) {
        invalid();
      }
      return { teamId: item.teamId, lessonCount: 30 };
    });
    if (teams[0]?.teamId !== 'team-A' || teams[1]?.teamId !== 'team-B') invalid();
    return {
      exitCode: 0,
      summary: {
        status: 'PREFLIGHT_OK',
        runId: result.runId,
        userSendable: false,
        authority: {
          state: 'VALID_UNCONSUMED',
          repositoryCommit: record.repositoryCommit,
          action: 'PACKAGE_KITS',
          teams: [
            { teamId: 'team-A', lessonCount: 30 },
            { teamId: 'team-B', lessonCount: 30 },
          ],
        },
      },
    };
  }
  if (result.status === 'BLOCKED') {
    if (!exactKeys(result, ['blockers', 'runId', 'status', 'userSendable'])) invalid();
    if (!Array.isArray(result.blockers) || result.blockers.length === 0) invalid();
    const blockers = result.blockers.map((blocker) => {
      if (blocker === null || typeof blocker !== 'object' || Array.isArray(blocker)) invalid();
      const record = blocker as Record<string, unknown>;
      if (
        !exactKeys(record, ['code', 'message']) ||
        typeof record.code !== 'string' ||
        record.code.length === 0 ||
        typeof record.message !== 'string'
      ) {
        invalid();
      }
      return { code: record.code };
    }) as [SafeBlocker, ...SafeBlocker[]];
    return {
      exitCode: 1,
      summary: {
        status: 'BLOCKED',
        runId: result.runId,
        userSendable: false,
        blockers,
      },
    };
  }
  return invalid();
}
