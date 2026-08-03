import { describe, expect, it } from 'vitest';
import type { Queryable } from './mastery-repository';
import {
  deleteExpiredDiagnosticSessions,
  getDiagnosticSession,
  getDiagnosticSessionForUpdate,
  hasDiagnosticSessions,
  upsertDiagnosticSession,
  type DiagnosticSessionWrite,
} from './diagnostic-sessions-repository';

interface Captured {
  sql: string;
  params: readonly unknown[] | undefined;
}

function fakeQueryable(
  rows: Record<string, unknown>[] = [],
  { present = true }: { present?: boolean } = {},
): { q: Queryable; calls: Captured[] } {
  const calls: Captured[] = [];
  const q: Queryable = {
    async query<R extends Record<string, unknown>>(sql: string, params?: readonly unknown[]) {
      calls.push({ sql, params });
      if (sql.includes('information_schema.tables')) {
        return { rows: [{ present }] as unknown as R[] };
      }
      return { rows: rows as unknown as R[] };
    },
  };
  return { q, calls };
}

const write = (overrides: Partial<DiagnosticSessionWrite> = {}): DiagnosticSessionWrite => ({
  tokenHash: 'hash-1',
  learnerId: 'learner-1',
  seed: 'seed-1',
  responses: [{ questionId: 'q-1', correct: true, seq: 0 }],
  pendingBlock: { stageId: 'stage-0', questionIds: ['q-1'], tokenHash: 'bt-1' },
  completed: false,
  result: null,
  createdAt: new Date('2026-07-22T12:00:00.000Z'),
  expiresAt: new Date('2026-07-22T15:00:00.000Z'),
  ...overrides,
});

describe('hasDiagnosticSessions', () => {
  it('reports table presence (migration 0021 applied)', async () => {
    expect(await hasDiagnosticSessions(fakeQueryable([], { present: true }).q)).toBe(true);
    expect(await hasDiagnosticSessions(fakeQueryable([], { present: false }).q)).toBe(false);
  });
});

describe('getDiagnosticSession / getDiagnosticSessionForUpdate', () => {
  it('reads a live session by token hash, excluding expired rows', async () => {
    const row = { token_hash: 'hash-1', learner_id: 'learner-1' };
    const { q, calls } = fakeQueryable([row]);
    expect(await getDiagnosticSession(q, 'hash-1')).toEqual(row);
    expect(calls[0]!.sql).toContain('from diagnostic_sessions');
    expect(calls[0]!.sql).toContain('expires_at > now()');
    expect(calls[0]!.sql).not.toContain('for update');
    expect(calls[0]!.params).toEqual(['hash-1']);
  });

  it('returns null when no live session matches', async () => {
    const { q } = fakeQueryable([]);
    expect(await getDiagnosticSession(q, 'missing')).toBeNull();
  });

  it('locks the row FOR UPDATE (the one-use-block-token concurrency guard)', async () => {
    const { q, calls } = fakeQueryable([{ token_hash: 'hash-1' }]);
    await getDiagnosticSessionForUpdate(q, 'hash-1');
    expect(calls[0]!.sql).toContain('for update');
    expect(calls[0]!.sql).toContain('expires_at > now()');
  });
});

describe('upsertDiagnosticSession', () => {
  it('inserts-or-updates with JSONB-serialized state and instant timestamps', async () => {
    const { q, calls } = fakeQueryable();
    await upsertDiagnosticSession(q, write());
    expect(calls).toHaveLength(1);
    const [insert] = calls;
    expect(insert!.sql).toContain('insert into diagnostic_sessions');
    expect(insert!.sql).toContain('on conflict (token_hash) do update set');
    const params = insert!.params!;
    expect(params[0]).toBe('hash-1'); // token_hash
    expect(params[1]).toBe('learner-1'); // learner_id
    expect(params[2]).toBe('seed-1'); // seed
    // responses + pending_block serialized to JSON; result null passthrough.
    expect(params[3]).toBe(JSON.stringify([{ questionId: 'q-1', correct: true, seq: 0 }]));
    expect(params[4]).toBe(
      JSON.stringify({ stageId: 'stage-0', questionIds: ['q-1'], tokenHash: 'bt-1' }),
    );
    expect(params[5]).toBe(false); // completed
    expect(params[6]).toBeNull(); // result
    expect(params[7]).toBeInstanceOf(Date); // created_at
    expect(params[8]).toBeInstanceOf(Date); // expires_at
  });

  it('serializes a completed result and a null pending block', async () => {
    const { q, calls } = fakeQueryable();
    await upsertDiagnosticSession(
      q,
      write({ pendingBlock: null, completed: true, result: { confidenceLabel: 'High' } }),
    );
    const params = calls[0]!.params!;
    expect(params[4]).toBeNull(); // pending_block cleared once the form is done
    expect(params[5]).toBe(true);
    expect(params[6]).toBe(JSON.stringify({ confidenceLabel: 'High' }));
  });
});

describe('deleteExpiredDiagnosticSessions', () => {
  it('returns the number of reclaimed rows', async () => {
    const { q, calls } = fakeQueryable([{ n: 3 }]);
    expect(await deleteExpiredDiagnosticSessions(q)).toBe(3);
    expect(calls[0]!.sql).toContain('delete from diagnostic_sessions');
    expect(calls[0]!.sql).toContain('expires_at <= now()');
  });
});
