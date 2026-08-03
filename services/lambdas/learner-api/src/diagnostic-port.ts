import {
  DiagnosticBank,
  DiagnosticSessionError,
  diagnosticBankSourceLine,
  diagnosticItemsFromRows,
  hashToken,
  newOpaqueToken,
  resolveDiagnosticBankItems,
  serveDiagnosticBlock,
  serveDiagnosticNext,
  type DiagnosticBlockResponse,
  type DiagnosticSessionStorePort,
  type SessionRecord,
} from '@mcat/diagnostic-runner';
import {
  getDiagnosticSession,
  getDiagnosticSessionForUpdate,
  listDiagnosticBankRows,
  upsertDiagnosticSession,
  type DiagnosticSessionRow,
  type PostgresPool,
} from '@mcat/persistence-postgres';

/**
 * The deployed placement-diagnostic capability, backed by Postgres.
 *
 * Kept OFF the authority kernel — like Passage of the Day, the diagnostic writes
 * no mastery and logs no attempt; it owns only its own `diagnostic_sessions`
 * rows. The bank is built once per warm container from the question bank
 * (`production_candidate` / `published`) through the SAME `diagnosticItemsFromRows`
 * mapping the local pull uses; sessions persist through the shared
 * `@mcat/diagnostic-runner` serving core, so the browser wire is identical to dev.
 *
 * SERVER-ONLY: the bank holds the protected answer key; scoring is server-side
 * and per-item correctness is never echoed back.
 */
export interface DiagnosticPort {
  /** POST /v1/diagnostic/next — start/resume a session, serve the current block. */
  next(learnerId: string, body: Record<string, unknown>): Promise<DiagnosticBlockResponse>;
  /** POST /v1/diagnostic/block — commit a block (one-use token), serve the next. */
  block(learnerId: string, body: Record<string, unknown>): Promise<DiagnosticBlockResponse>;
}

const DEFAULT_TTL_MS = 3 * 60 * 60 * 1000;

/**
 * A `diagnostic_sessions`-backed session store with the same one-use-block-token
 * + TTL + learner-binding semantics as the in-memory store. `/block` runs inside
 * a `SELECT … FOR UPDATE` transaction so a committed block cannot be replayed by
 * a concurrent request.
 */
class PostgresDiagnosticSessions implements DiagnosticSessionStorePort {
  constructor(
    private readonly pool: PostgresPool,
    private readonly ttlMs: number = DEFAULT_TTL_MS,
    private readonly now: () => number = Date.now,
  ) {}

  private toRecord(row: DiagnosticSessionRow): SessionRecord {
    return {
      clientId: row.learner_id,
      learnerId: row.learner_id,
      seed: row.seed,
      createdAt: row.created_at.getTime(),
      expiresAt: row.expires_at.getTime(),
      responses: (row.responses as SessionRecord['responses'] | null) ?? [],
      pendingBlock: (row.pending_block as SessionRecord['pendingBlock']) ?? null,
      completed: row.completed,
      result: (row.result as SessionRecord['result']) ?? null,
    };
  }

  private write(tokenHash: string, record: SessionRecord) {
    return {
      tokenHash,
      learnerId: record.learnerId ?? record.clientId,
      seed: record.seed,
      responses: record.responses,
      pendingBlock: record.pendingBlock,
      completed: record.completed,
      result: record.result,
      createdAt: new Date(record.createdAt),
      expiresAt: new Date(record.expiresAt),
    };
  }

  async next(
    learnerId: string,
    sessionToken: string | null,
    serve: (record: SessionRecord, sessionToken: string) => DiagnosticBlockResponse,
  ): Promise<DiagnosticBlockResponse> {
    if (sessionToken !== null) {
      const tokenHash = hashToken(sessionToken);
      const row = await getDiagnosticSession(this.pool, tokenHash);
      if (row === null || row.learner_id !== learnerId) {
        throw new DiagnosticSessionError('This diagnostic session has expired.', 401);
      }
      const record = this.toRecord(row);
      const payload = serve(record, sessionToken);
      await upsertDiagnosticSession(this.pool, this.write(tokenHash, record));
      return payload;
    }

    const token = newOpaqueToken();
    const now = this.now();
    const record: SessionRecord = {
      clientId: learnerId,
      learnerId,
      seed: newOpaqueToken(),
      createdAt: now,
      expiresAt: now + this.ttlMs,
      responses: [],
      pendingBlock: null,
      completed: false,
      result: null,
    };
    const payload = serve(record, token);
    await upsertDiagnosticSession(this.pool, this.write(hashToken(token), record));
    return payload;
  }

  async block(
    learnerId: string,
    sessionToken: string,
    apply: (record: SessionRecord, sessionToken: string) => DiagnosticBlockResponse,
  ): Promise<DiagnosticBlockResponse> {
    const tokenHash = hashToken(sessionToken);
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      const row = await getDiagnosticSessionForUpdate(client, tokenHash);
      if (row === null || row.learner_id !== learnerId) {
        await client.query('rollback');
        throw new DiagnosticSessionError('This diagnostic session has expired.', 401);
      }
      const record = this.toRecord(row);
      // May throw (e.g. a replayed/out-of-sync block token → 409); the rollback
      // in `catch` then discards everything, so nothing is committed on refusal.
      const payload = apply(record, sessionToken);
      await upsertDiagnosticSession(client, this.write(tokenHash, record));
      await client.query('commit');
      return payload;
    } catch (error) {
      try {
        await client.query('rollback');
      } catch {
        /* the connection is being discarded; the original error is what matters */
      }
      throw error;
    } finally {
      client.release();
    }
  }
}

/**
 * Build the Postgres-backed diagnostic port. The bank is resolved lazily and
 * memoized per warm container (postgres → fixture fallback so onboarding never
 * dead-ends on an unseeded/unreadable bank), exactly like the passage service.
 */
export function createPostgresDiagnosticPort(pool: PostgresPool): DiagnosticPort {
  let bankPromise: Promise<DiagnosticBank> | undefined;
  const bank = (): Promise<DiagnosticBank> => {
    if (bankPromise === undefined) {
      bankPromise = (async () => {
        const resolved = await resolveDiagnosticBankItems({
          loadFromPostgres: async () => diagnosticItemsFromRows(await listDiagnosticBankRows(pool)),
        });
        process.stdout.write(`${diagnosticBankSourceLine(resolved)}\n`);
        return new DiagnosticBank(resolved.items);
      })().catch((error: unknown) => {
        bankPromise = undefined;
        throw error;
      });
    }
    return bankPromise;
  };

  const sessions = new PostgresDiagnosticSessions(pool);
  return {
    next: async (learnerId, body) => serveDiagnosticNext(await bank(), sessions, learnerId, body),
    block: async (learnerId, body) => serveDiagnosticBlock(await bank(), sessions, learnerId, body),
  };
}
