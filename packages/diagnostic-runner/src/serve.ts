import type { DiagnosticBank } from './bank';
import { recordBlock, resolveBlock, type DiagnosticBlockView } from './engine';
import {
  consumePendingBlock,
  DiagnosticSessionError,
  hashToken,
  issuePendingBlock,
  newOpaqueToken,
  type SessionRecord,
} from './session-store';

/**
 * The block-diagnostic serving logic shared by every environment that owns a
 * session: the dev/preview server, the local full-engine authority, and the
 * deployed learner-API Lambda. It never changes the WIRE the browser sees — the
 * response is a {@link DiagnosticBlockView} plus the opaque `sessionToken` and
 * one-use `blockToken` — only where the session is stored.
 *
 * The answer key never crosses this boundary: scoring is server-side and no
 * per-item correctness is echoed back.
 */

/** The wire payload for POST /next and POST /block. Identical shape everywhere. */
export interface DiagnosticBlockResponse extends DiagnosticBlockView {
  sessionToken: string;
  blockToken: string | null;
}

function isChoiceId(value: unknown): value is 'A' | 'B' | 'C' | 'D' {
  return value === 'A' || value === 'B' || value === 'C' || value === 'D';
}

/**
 * The submitted block: `questionId -> choiceId | null`, where null is the
 * learner saying "not known". Keys the served block does not contain are
 * ignored — the block the server issued is the one that gets scored — but a
 * value that is neither a choice nor null is a client bug, not a blank, so it
 * is rejected rather than silently read as not-known.
 */
export function parseAnswers(value: unknown): Record<string, string | null> {
  if (value === undefined || value === null) return {};
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new DiagnosticSessionError('Block answers must be a JSON object.', 400);
  }
  const answers: Record<string, string | null> = {};
  for (const [questionId, choice] of Object.entries(value as Record<string, unknown>)) {
    if (choice !== null && !isChoiceId(choice)) {
      throw new DiagnosticSessionError('Block answers contain an unknown choice.', 400);
    }
    answers[questionId] = choice;
  }
  return answers;
}

export function parseElapsed(value: unknown): Record<string, number> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
  const elapsed: Record<string, number> = {};
  for (const [questionId, ms] of Object.entries(value as Record<string, unknown>)) {
    if (typeof ms === 'number' && Number.isFinite(ms) && ms > 0) elapsed[questionId] = ms;
  }
  return elapsed;
}

/**
 * Resolve the current block and, when one is open, mint a one-use block token
 * onto the record. The returned payload is exactly what the browser receives.
 * Mutates `record` (its `pendingBlock`, and `completed`/`result` on the last
 * block), so the caller must persist it.
 */
export function renderBlock(
  bank: DiagnosticBank,
  record: SessionRecord,
  sessionToken: string,
): DiagnosticBlockResponse {
  const { view, block } = resolveBlock(bank, record);
  const blockToken = block ? issuePendingBlock(record, block.stageId, block.questionIds) : null;
  return { sessionToken, blockToken, ...view };
}

/**
 * The session persistence seam. An implementation loads/creates the record,
 * runs the callback (which mutates it), and persists it — atomically for
 * {@link DiagnosticSessionStore.block}, so a one-use block token cannot be
 * replayed by two concurrent commits.
 */
export interface DiagnosticSessionStore {
  /**
   * POST /next: resume the session for `sessionToken` (when supplied) or create
   * a fresh one; run `serve` and persist. Throws {@link DiagnosticSessionError}
   * (401) when a supplied token is missing, expired, or another learner's.
   */
  next(
    learnerId: string,
    sessionToken: string | null,
    serve: (record: SessionRecord, sessionToken: string) => DiagnosticBlockResponse,
  ): Promise<DiagnosticBlockResponse>;
  /**
   * POST /block: hold the session for update, run `apply`, persist atomically.
   * Throws (401) when the session is missing/expired/foreign; `apply` may throw
   * (409 for a replayed/out-of-sync block token) and then nothing is persisted.
   */
  block(
    learnerId: string,
    sessionToken: string,
    apply: (record: SessionRecord, sessionToken: string) => DiagnosticBlockResponse,
  ): Promise<DiagnosticBlockResponse>;
}

/** POST /next: start or resume, then serve the current block. */
export async function serveDiagnosticNext(
  bank: DiagnosticBank,
  store: DiagnosticSessionStore,
  learnerId: string,
  body: Record<string, unknown>,
): Promise<DiagnosticBlockResponse> {
  const token = typeof body.sessionToken === 'string' ? body.sessionToken : null;
  return store.next(learnerId, token, (record, sessionToken) =>
    renderBlock(bank, record, sessionToken),
  );
}

/** POST /block: commit a whole block (one-use token) and serve the next. */
export async function serveDiagnosticBlock(
  bank: DiagnosticBank,
  store: DiagnosticSessionStore,
  learnerId: string,
  body: Record<string, unknown>,
): Promise<DiagnosticBlockResponse> {
  const sessionToken = typeof body.sessionToken === 'string' ? body.sessionToken : '';
  const blockToken = typeof body.blockToken === 'string' ? body.blockToken : '';
  const stageId = typeof body.stageId === 'string' ? body.stageId : '';
  const answers = parseAnswers(body.answers);
  const elapsedMs = parseElapsed(body.elapsedMs);
  return store.block(learnerId, sessionToken, (record, token) => {
    // One-use block token: consuming it prevents replaying a committed block,
    // and hands back the item list the block was actually served with.
    const questionIds = consumePendingBlock(record, stageId, blockToken);
    recordBlock(bank, record, questionIds, answers, elapsedMs);
    return renderBlock(bank, record, token);
  });
}

interface InMemoryOptions {
  ttlMs?: number;
  now?: () => number;
  randomToken?: () => string;
}

/**
 * In-memory session store keyed by learner + opaque token, for the local
 * full-engine authority and tests. Preserves the one-use-block-token +
 * TTL + learner-binding semantics of the deployed store without a database.
 */
export class InMemoryDiagnosticSessions implements DiagnosticSessionStore {
  private readonly sessions = new Map<string, SessionRecord>();
  private readonly ttlMs: number;
  private readonly now: () => number;
  private readonly mint: () => string;

  constructor(options: InMemoryOptions = {}) {
    this.ttlMs = options.ttlMs ?? 3 * 60 * 60 * 1000;
    this.now = options.now ?? Date.now;
    this.mint = options.randomToken ?? newOpaqueToken;
  }

  private sweep(now: number): void {
    for (const [hash, record] of this.sessions) {
      if (record.expiresAt <= now) this.sessions.delete(hash);
    }
  }

  private load(learnerId: string, sessionToken: string): SessionRecord | null {
    if (!sessionToken || sessionToken.length > 128) return null;
    const record = this.sessions.get(hashToken(sessionToken));
    if (!record || record.expiresAt <= this.now()) return null;
    if (record.learnerId !== undefined && record.learnerId !== learnerId) return null;
    return record;
  }

  async next(
    learnerId: string,
    sessionToken: string | null,
    serve: (record: SessionRecord, sessionToken: string) => DiagnosticBlockResponse,
  ): Promise<DiagnosticBlockResponse> {
    const now = this.now();
    this.sweep(now);
    if (sessionToken !== null) {
      const existing = this.load(learnerId, sessionToken);
      if (existing === null) {
        throw new DiagnosticSessionError('This diagnostic session has expired.', 401);
      }
      return serve(existing, sessionToken);
    }
    const token = this.mint();
    const record: SessionRecord = {
      clientId: learnerId,
      learnerId,
      seed: this.mint(),
      createdAt: now,
      expiresAt: now + this.ttlMs,
      responses: [],
      pendingBlock: null,
      completed: false,
      result: null,
    };
    this.sessions.set(hashToken(token), record);
    return serve(record, token);
  }

  async block(
    learnerId: string,
    sessionToken: string,
    apply: (record: SessionRecord, sessionToken: string) => DiagnosticBlockResponse,
  ): Promise<DiagnosticBlockResponse> {
    this.sweep(this.now());
    const record = this.load(learnerId, sessionToken);
    if (record === null) {
      throw new DiagnosticSessionError('This diagnostic session has expired.', 401);
    }
    // The stored record IS the mutated object, so running `apply` persists it.
    return apply(record, sessionToken);
  }
}
