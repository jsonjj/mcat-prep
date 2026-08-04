import { randomUUID } from 'node:crypto';
import type {
  PracticeTestBlockResponse,
  PracticeTestBlockView,
  PracticeTestResultView,
  PracticeTestServeRefusal,
  PracticeTestServeRefusalReason,
  UtcTimestamp,
} from '@mcat/contracts';
import {
  practiceTestBlueprintFor,
  type DatedUnitObservation,
  type PracticeTestLengthTier,
} from '@mcat/policies';
import {
  DiagnosticSessionError,
  hashToken,
  issuePendingBlock,
  consumePendingBlock,
  newOpaqueToken,
  type SessionRecord,
} from '@mcat/diagnostic-runner';
import {
  bankSupportsPracticeTest,
  buildPracticeTestCompletion,
  recordPracticeTestBlock,
  resolvePracticeTestBank,
  resolvePracticeTestBlock,
  practiceTestBankSourceLine,
  type PracticeTestBank,
  type PracticeTestBlockView as EnginePracticeTestBlockView,
  type PracticeTestCompletionResult,
  type PracticeTestResultView as EnginePracticeTestResultView,
} from '@mcat/practice-test-runner';
import {
  getPracticeTestSession,
  getPracticeTestSessionForUpdate,
  listPracticeTestBankRows,
  upsertPracticeTestSession,
  type PostgresPool,
  type PracticeTestSessionRow,
  type PracticeTestSessionWrite,
} from '@mcat/persistence-postgres';

/**
 * The deployed periodic scored practice-test capability, backed by Postgres.
 *
 * The diagnostic port's fixed-form sibling. Like it, the runner is served through
 * the same session/origin-verify pipeline as every other /v1 route and owns only
 * its own `practice_test_sessions` rows — but a scored test needs two things the
 * diagnostic does not: the DURABLE freshness + cadence GATE (read off the learner
 * projection, passed in as {@link PracticeTestServeContext}), and, at completion,
 * a SCORED result persisted to the projection. This port serves the block-by-block
 * sitting and builds the completion; the separate CSRF-gated result write
 * (`/v1/practice-test/result`) reads {@link loadCompletion} and hands it to the
 * kernel, so the score is always server-authoritative and never trusted from the
 * client.
 *
 * SERVER-ONLY: the bank holds the protected answer key; scoring is server-side and
 * per-item correctness is never echoed back.
 */

const DEFAULT_TTL_MS = 3 * 60 * 60 * 1000;

/** The cadence gate the serve boundary consults before STARTING a new sitting. */
export interface PracticeTestServeGateInput {
  readonly due: boolean;
  readonly reason: string;
  readonly tier: PracticeTestLengthTier;
  readonly nextEligibleDate: string | null;
}

/** The durable freshness the engine assembles + re-measures against. */
export interface PracticeTestFreshnessInput {
  readonly scoredItemIds: readonly string[];
  readonly unitHistory: readonly DatedUnitObservation[];
}

/** What the handler reads off the learner projection and passes to the port. */
export interface PracticeTestServeContext {
  readonly gate: PracticeTestServeGateInput;
  readonly freshness: PracticeTestFreshnessInput;
}

/** `/next` either serves a block, refuses off-cadence (409), or 503s (no bank). */
export type PracticeTestServeResult =
  | { kind: 'block'; payload: PracticeTestBlockResponse }
  | { kind: 'refusal'; refusal: PracticeTestServeRefusal };

export interface PracticeTestPort {
  /** POST /v1/practice-test/next — start (gated) or resume a sitting, serve the block. */
  next(
    learnerId: string,
    body: Record<string, unknown>,
    ctx: PracticeTestServeContext,
  ): Promise<PracticeTestServeResult>;
  /** POST /v1/practice-test/block — commit a block (one-use token), serve the next. */
  block(
    learnerId: string,
    body: Record<string, unknown>,
    freshness: PracticeTestFreshnessInput,
  ): Promise<PracticeTestBlockResponse>;
  /**
   * The SCORED completion of a finished sitting, re-derived server-side from the
   * durable session (never trusted from the client). Null when the session is
   * missing, another learner's, or not yet complete.
   */
  loadCompletion(
    learnerId: string,
    sessionToken: string,
  ): Promise<PracticeTestCompletionResult | null>;
}

/** The session record the engine drives, widened for the practice-test-only state. */
interface PracticeTestSessionRecord extends SessionRecord {
  tier: PracticeTestLengthTier;
  sittingId: string;
  answers: Record<string, 'A' | 'B' | 'C' | 'D' | null>;
  resultView: EnginePracticeTestResultView | null;
  completion: PracticeTestCompletionResult | null;
}

const REFUSAL_MESSAGE: Readonly<Record<PracticeTestServeRefusalReason, string>> = {
  not_due_recent:
    'Your next practice test is not due yet — keep studying and it will unlock on cadence.',
  blocked_unreviewed: 'Review your last practice test before starting a new one.',
  blackout_before_exam:
    'No practice test in the final days before your exam — rest and light review only.',
  capped_today: 'You have already taken a practice test today. The next one is available tomorrow.',
  not_unlocked: 'Finish a few more lessons to unlock practice tests.',
};

/** The typed 409 body for an out-of-cadence / review-gated / locked start (WS5, §6). */
function refusalFrom(gate: PracticeTestServeGateInput): PracticeTestServeRefusal {
  const reason: PracticeTestServeRefusalReason =
    gate.reason === 'blocked_unreviewed' ||
    gate.reason === 'blackout_before_exam' ||
    gate.reason === 'capped_today' ||
    gate.reason === 'not_unlocked'
      ? gate.reason
      : 'not_due_recent';
  return {
    error: 'practice_test_not_due',
    due: false,
    reason,
    message: REFUSAL_MESSAGE[reason],
    nextEligibleDate: gate.nextEligibleDate,
  };
}

/** Strip the server-only review targets + re-measure before the result crosses the wire. */
function toWireResult(result: EnginePracticeTestResultView): PracticeTestResultView {
  return {
    itemsScored: result.itemsScored,
    correct: result.correct,
    perSection: result.perSection.map((s) => ({
      section: s.section,
      itemsScored: s.itemsScored,
      correct: s.correct,
      accuracy: s.accuracy,
    })),
    perCluster: result.perCluster.map((c) => ({
      cluster: c.cluster,
      itemsScored: c.itemsScored,
      correct: c.correct,
      accuracy: c.accuracy,
    })),
    missedQuestionIds: [...result.missedQuestionIds],
    blueprintMet: result.blueprintMet,
  };
}

function toWireView(
  view: EnginePracticeTestBlockView,
  blockId: string | null,
): PracticeTestBlockView {
  return {
    done: view.done,
    progress: view.progress,
    itemsScored: view.itemsScored,
    totalItems: view.totalItems,
    section: view.section,
    sectionTitle: view.sectionTitle,
    blockId,
    blockNumber: view.blockNumber,
    blockCount: view.blockCount,
    itemsCommitted: view.itemsCommitted,
    questions: view.questions,
    result: view.result === null ? null : toWireResult(view.result),
  };
}

/** A completed sitting's done view, built from the cached result (never re-assembled). */
function doneResponse(
  record: PracticeTestSessionRecord,
  sessionToken: string,
  resultView: EnginePracticeTestResultView,
): PracticeTestBlockResponse {
  return {
    done: true,
    progress: 1,
    itemsScored: record.responses.length,
    totalItems: Math.max(1, record.responses.length),
    section: null,
    sectionTitle: null,
    blockNumber: 0,
    blockCount: new Set(record.responses.map((r) => r.section)).size,
    itemsCommitted: record.responses.length,
    questions: [],
    result: toWireResult(resultView),
    sessionToken,
    blockToken: null,
    blockId: null,
    resultPersisted: false,
  };
}

const freshnessSet = (freshness: PracticeTestFreshnessInput): ReadonlySet<string> =>
  new Set(freshness.scoredItemIds);

const toEngineFreshness = (freshness: PracticeTestFreshnessInput) => ({
  scoredIds: freshnessSet(freshness),
  unitHistory: freshness.unitHistory,
});

/**
 * Serve the current block for a session, minting a one-use block token and — on
 * the commit that COMPLETES the sitting — caching the scored result + completion
 * on the record. Mutates `record`, so the caller must persist it.
 */
function serveBlock(
  bank: PracticeTestBank,
  record: PracticeTestSessionRecord,
  sessionToken: string,
  freshness: PracticeTestFreshnessInput,
  now: UtcTimestamp,
): PracticeTestBlockResponse {
  // A finished sitting serves its done view from the cached result — never by
  // re-assembling (a re-measure over freshness that now includes this sitting
  // would double-count it, and the shrunken fresh pool could be infeasible).
  if (record.completed && record.resultView !== null) {
    return doneResponse(record, sessionToken, record.resultView);
  }

  const { view, block, finalize } = resolvePracticeTestBlock(
    bank,
    record,
    toEngineFreshness(freshness),
    { now, blueprint: practiceTestBlueprintFor(record.tier) },
  );
  const blockToken = block ? issuePendingBlock(record, block.blockId, block.questionIds) : null;

  // The sitting just finished on this call → cache the scored result (for a
  // byte-stable re-serve) and build the completion the durable result write reads.
  if (finalize !== undefined && view.result !== null) {
    record.resultView = view.result;
    record.completion = buildPracticeTestCompletion(bank, record, view.result, finalize, {
      picked: new Map(Object.entries(record.answers)),
      sittingId: record.sittingId,
      tier: record.tier,
      now,
    });
  }

  return {
    ...toWireView(view, block?.blockId ?? null),
    sessionToken,
    blockToken,
    resultPersisted: false,
  };
}

/** Whether the bank can still deal a blueprint-valid form from the fresh pool. */
function servable(
  bank: PracticeTestBank,
  record: PracticeTestSessionRecord,
  freshness: PracticeTestFreshnessInput,
): boolean {
  return (
    record.completed ||
    bankSupportsPracticeTest(bank, freshnessSet(freshness), practiceTestBlueprintFor(record.tier))
  );
}

/**
 * Build the Postgres-backed practice-test port. The bank is resolved lazily and
 * memoized per warm container (postgres → local pull), exactly like the
 * diagnostic port; a null bank (no DB, no pull) answers 503, since a scored test
 * has no synthetic fixture the way onboarding's diagnostic does.
 */
export function createPostgresPracticeTestPort(
  pool: PostgresPool,
  now: () => number = Date.now,
): PracticeTestPort {
  let bankPromise: Promise<PracticeTestBank | null> | undefined;
  const loadBank = (): Promise<PracticeTestBank | null> => {
    if (bankPromise === undefined) {
      bankPromise = (async () => {
        const resolved = await resolvePracticeTestBank({
          loadFromPostgres: async () => listPracticeTestBankRows(pool),
        });
        process.stdout.write(`${practiceTestBankSourceLine(resolved)}\n`);
        return resolved.bank;
      })().catch((error: unknown) => {
        bankPromise = undefined;
        throw error;
      });
    }
    return bankPromise;
  };

  const bankOr503 = async (): Promise<PracticeTestBank> => {
    const bank = await loadBank();
    if (bank === null) {
      throw new DiagnosticSessionError('The practice-test question bank is not available.', 503);
    }
    return bank;
  };

  const toRecord = (row: PracticeTestSessionRow): PracticeTestSessionRecord => ({
    clientId: row.learner_id,
    learnerId: row.learner_id,
    seed: row.form_seed,
    createdAt: row.created_at.getTime(),
    expiresAt: row.expires_at.getTime(),
    responses: (row.responses as SessionRecord['responses'] | null) ?? [],
    pendingBlock: (row.pending_block as SessionRecord['pendingBlock']) ?? null,
    completed: row.completed,
    result: null,
    tier: row.length_tier as PracticeTestLengthTier,
    sittingId: row.sitting_id,
    answers: (row.answers as PracticeTestSessionRecord['answers'] | null) ?? {},
    resultView: (row.result_view as EnginePracticeTestResultView | null) ?? null,
    completion: (row.completion as PracticeTestCompletionResult | null) ?? null,
  });

  const write = (
    tokenHash: string,
    record: PracticeTestSessionRecord,
  ): PracticeTestSessionWrite => ({
    tokenHash,
    learnerId: record.learnerId ?? record.clientId,
    sittingId: record.sittingId,
    formSeed: record.seed,
    lengthTier: record.tier,
    responses: record.responses,
    answers: record.answers,
    pendingBlock: record.pendingBlock,
    completed: record.completed,
    resultView: record.resultView,
    completion: record.completion,
    createdAt: new Date(record.createdAt),
    expiresAt: new Date(record.expiresAt),
  });

  return {
    async next(learnerId, body, ctx) {
      const bank = await bankOr503();
      const nowMs = now();
      const nowIso = new Date(nowMs).toISOString() as UtcTimestamp;
      const token = typeof body.sessionToken === 'string' ? body.sessionToken : null;

      // Resume: never re-gated (you are mid-test); load, serve, persist.
      if (token !== null) {
        const tokenHash = hashToken(token);
        const row = await getPracticeTestSession(pool, tokenHash);
        if (row === null || row.learner_id !== learnerId) {
          throw new DiagnosticSessionError('This practice-test session has expired.', 401);
        }
        const record = toRecord(row);
        if (!servable(bank, record, ctx.freshness)) {
          throw new DiagnosticSessionError(
            'The practice-test question bank is not available.',
            503,
          );
        }
        const payload = serveBlock(bank, record, token, ctx.freshness, nowIso);
        await upsertPracticeTestSession(pool, write(tokenHash, record));
        return { kind: 'block', payload };
      }

      // Start: the §6 cadence is enforced at the serving boundary, so a test
      // cannot be started off-cadence even by calling the API directly.
      if (!ctx.gate.due) {
        return { kind: 'refusal', refusal: refusalFrom(ctx.gate) };
      }
      const sessionToken = newOpaqueToken();
      const record: PracticeTestSessionRecord = {
        clientId: learnerId,
        learnerId,
        seed: newOpaqueToken(),
        createdAt: nowMs,
        expiresAt: nowMs + DEFAULT_TTL_MS,
        responses: [],
        pendingBlock: null,
        completed: false,
        result: null,
        tier: ctx.gate.tier,
        sittingId: randomUUID(),
        answers: {},
        resultView: null,
        completion: null,
      };
      if (!servable(bank, record, ctx.freshness)) {
        throw new DiagnosticSessionError('The practice-test question bank is not available.', 503);
      }
      const payload = serveBlock(bank, record, sessionToken, ctx.freshness, nowIso);
      await upsertPracticeTestSession(pool, write(hashToken(sessionToken), record));
      return { kind: 'block', payload };
    },

    async block(learnerId, body, freshness) {
      const bank = await bankOr503();
      const nowIso = new Date(now()).toISOString() as UtcTimestamp;
      const sessionToken = typeof body.sessionToken === 'string' ? body.sessionToken : '';
      const blockToken = typeof body.blockToken === 'string' ? body.blockToken : '';
      const blockId = typeof body.blockId === 'string' ? body.blockId : '';
      const answers = parseAnswers(body.answers);
      const elapsedMs = parseElapsed(body.elapsedMs);
      const tokenHash = hashToken(sessionToken);

      const client = await pool.connect();
      try {
        await client.query('begin');
        const row = await getPracticeTestSessionForUpdate(client, tokenHash);
        if (row === null || row.learner_id !== learnerId) {
          await client.query('rollback');
          throw new DiagnosticSessionError('This practice-test session has expired.', 401);
        }
        const record = toRecord(row);
        // May throw (replayed/out-of-sync block token → 409); the rollback below
        // discards everything, so nothing is committed on refusal.
        const questionIds = consumePendingBlock(record, blockId, blockToken);
        recordPracticeTestBlock(bank, record, questionIds, answers, elapsedMs);
        for (const id of questionIds) {
          record.answers[id] = (answers[id] ?? null) as 'A' | 'B' | 'C' | 'D' | null;
        }
        if (!servable(bank, record, freshness)) {
          await client.query('rollback');
          throw new DiagnosticSessionError(
            'The practice-test question bank is not available.',
            503,
          );
        }
        const payload = serveBlock(bank, record, sessionToken, freshness, nowIso);
        await upsertPracticeTestSession(client, write(tokenHash, record));
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
    },

    async loadCompletion(learnerId, sessionToken) {
      const row = await getPracticeTestSession(pool, hashToken(sessionToken));
      if (row === null || row.learner_id !== learnerId) return null;
      if (!row.completed || row.completion === null) return null;
      return row.completion as PracticeTestCompletionResult;
    },
  };
}

function isChoiceId(value: unknown): value is 'A' | 'B' | 'C' | 'D' {
  return value === 'A' || value === 'B' || value === 'C' || value === 'D';
}

function parseAnswers(value: unknown): Record<string, string | null> {
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

function parseElapsed(value: unknown): Record<string, number> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
  const elapsed: Record<string, number> = {};
  for (const [questionId, ms] of Object.entries(value as Record<string, unknown>)) {
    if (typeof ms === 'number' && Number.isFinite(ms) && ms > 0) elapsed[questionId] = ms;
  }
  return elapsed;
}
