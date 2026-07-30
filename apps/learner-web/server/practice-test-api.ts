import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ReasoningOperation, Section, UtcTimestamp } from '@mcat/contracts';
import {
  estimatePracticeTestScaled,
  practiceTestBlueprintFor,
  type PracticeTestLengthTier,
} from '@mcat/policies';
import { createPracticeTestBank, type PracticeTestBank } from './practice-test-bank';
import {
  DiagnosticSessionError,
  DiagnosticSessionStore,
  type SessionRecord,
} from './diagnostic-session-store';
import {
  bankSupportsPracticeTest,
  recordPracticeTestBlock,
  resolvePracticeTestBlock,
  type PracticeTestBlockView,
} from './practice-test-engine';

/**
 * HTTP surface for the periodic practice test on the learner-web dev/preview
 * server. A near-exact mirror of the diagnostic API — same-origin only, JSON
 * only, no-store, bounded body, one-use block tokens, server-side scoring, no
 * per-item answer oracle — because the two share the session store outright.
 *
 * The one addition is the LEARNER key: a practice test is fresh PER LEARNER, so
 * the "already scored" set is keyed by the learner. The diagnostic is anonymous
 * and keys nothing; here the client id doubles as the learner key on the dev
 * server (production passes an authenticated learner id).
 */

class RequestBodyError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export const practiceTestSessionStore = new DiagnosticSessionStore();

const bankSingleton: PracticeTestBank | null = createPracticeTestBank();

/**
 * The chosen length tier for a live sitting, so every re-serve of the same
 * sitting deals the same blueprint. Keyed by the session record (like the
 * engine's result cache) rather than widening the diagnostic-shared record; a
 * sitting whose tier was lost (server restart mid-test) falls back to `standard`.
 */
const sessionTier = new WeakMap<SessionRecord, PracticeTestLengthTier>();
const tierOf = (record: SessionRecord): PracticeTestLengthTier =>
  sessionTier.get(record) ?? 'standard';

/** The scored-result payload the completion recorder persists (WS5, §6). */
export interface PracticeTestCompletionPayload {
  readonly sittingId: string;
  readonly takenOn: UtcTimestamp;
  readonly tier: PracticeTestLengthTier;
  readonly itemsScored: number;
  readonly correct: number;
  readonly sections: ReadonlyArray<{ section: Section; pctCorrect: number }>;
  readonly scaledScore: number;
  readonly reviewTargets: ReadonlyArray<{ kcId: string; skill?: ReasoningOperation }>;
}

/** What the serve boundary needs to know before it will START a new sitting (WS5, §6). */
export interface PracticeTestServeGate {
  readonly due: boolean;
  readonly reason: string;
  readonly tier: PracticeTestLengthTier;
}

/**
 * The seam that closes the WS5 completion→state loop. A sitting COMPLETES inside
 * the session store (in memory); this reports that fact to the authority so the
 * persisted `LearnerState.practiceTests` reflects it and the §6 cadence can
 * schedule the next test. Injected (not imported) so the flow stays testable and
 * the authority stack is pulled in only where the loop is actually mounted (local
 * dev); a review is a separate signal, mirroring the authority's two commands.
 *
 * `gate` is consulted at the serving boundary before a NEW sitting is created, so
 * a test cannot be started off-cadence (the §6 rules are enforced here too, not
 * only in Today's Path). `recordCompleted` carries the scored result so the
 * summary + repair queue are fed; a resumed sitting is never re-gated.
 */
export interface PracticeTestAuthorityRecorder {
  gate?(): Promise<PracticeTestServeGate> | PracticeTestServeGate;
  recordCompleted(completion?: PracticeTestCompletionPayload): Promise<void> | void;
  recordReviewed(): Promise<void> | void;
}

function trustsProxyHeaders(): boolean {
  return process.env.TRUST_PROXY === '1';
}

function isSameOriginRequest(request: IncomingMessage): boolean {
  if (request.headers['sec-fetch-site'] === 'cross-site') return false;
  const origin = request.headers.origin;
  if (!origin) return true;
  const host = request.headers.host;
  if (!host) return false;
  const forwardedProtocol = request.headers['x-forwarded-proto'];
  const protocol =
    trustsProxyHeaders() && typeof forwardedProtocol === 'string'
      ? forwardedProtocol.split(',')[0]?.trim()
      : (request.socket as { encrypted?: boolean }).encrypted
        ? 'https'
        : 'http';
  return origin === `${protocol}://${host}`;
}

function isJsonRequest(request: IncomingMessage): boolean {
  return (request.headers['content-type'] ?? '').toLowerCase().startsWith('application/json');
}

function clientId(request: IncomingMessage): string {
  const forwardedFor = request.headers['x-forwarded-for'];
  if (trustsProxyHeaders() && typeof forwardedFor === 'string') {
    const first = forwardedFor.split(',')[0]?.trim();
    if (first) return first;
  }
  return request.socket.remoteAddress ?? 'unknown-client';
}

async function readJsonBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  if (!isJsonRequest(request)) throw new RequestBodyError('Request body must use application/json.', 415);
  let body = '';
  for await (const chunk of request) {
    body += chunk.toString();
    if (body.length > 65_536) throw new RequestBodyError('Request body is too large.', 413);
  }
  try {
    const parsed = JSON.parse(body || '{}');
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new RequestBodyError('Request body must be a JSON object.', 400);
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    if (error instanceof RequestBodyError) throw error;
    throw new RequestBodyError('Request body must be valid JSON.', 400);
  }
}

function writeJson(response: ServerResponse, status: number, payload: unknown): void {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.end(JSON.stringify(payload));
}

interface BlockResponsePayload extends PracticeTestBlockView {
  sessionToken: string;
  blockToken: string | null;
  /** Stable id of the open block, echoed back on commit (null once done). */
  blockId: string | null;
}

function serveBlock(
  bank: PracticeTestBank,
  record: SessionRecord,
  sessionToken: string,
  learnerId: string,
  now: UtcTimestamp,
): BlockResponsePayload {
  const { view, block } = resolvePracticeTestBlock(bank, record, learnerId, {
    now,
    blueprint: practiceTestBlueprintFor(tierOf(record)),
  });
  const blockToken = block
    ? practiceTestSessionStore.issueBlockToken(record, block.blockId, block.questionIds)
    : null;
  return { sessionToken, blockToken, blockId: block?.blockId ?? null, ...view };
}

/**
 * Turn a completed block payload into the scored-result the recorder persists.
 * Returns undefined when the payload is not a finished sitting (no result), so
 * the caller degrades to a counters-only completion. The per-section %-correct
 * are the dashboard's trend points; the scaled score is the conservative
 * estimate midpoint (the range is re-derived on read).
 */
function completionFrom(
  payload: BlockResponsePayload,
  tier: PracticeTestLengthTier,
  now: UtcTimestamp,
): PracticeTestCompletionPayload | undefined {
  const result = payload.result;
  if (result === null) return undefined;
  const overallPct = result.itemsScored > 0 ? (result.correct / result.itemsScored) * 100 : 0;
  return {
    sittingId: randomUUID(),
    takenOn: now,
    tier,
    itemsScored: result.itemsScored,
    correct: result.correct,
    sections: result.perSection.map((s) => ({
      section: s.section,
      pctCorrect: Math.round(s.accuracy * 100),
    })),
    scaledScore: estimatePracticeTestScaled(overallPct, result.itemsScored).point,
    reviewTargets: result.reviewTargets.map((t) =>
      t.skill !== undefined ? { kcId: t.kcId, skill: t.skill } : { kcId: t.kcId },
    ),
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

function handleError(response: ServerResponse, error: unknown): void {
  if (error instanceof RequestBodyError || error instanceof DiagnosticSessionError) {
    if (error instanceof DiagnosticSessionError && error.retryAfterSeconds) {
      response.setHeader('Retry-After', String(error.retryAfterSeconds));
    }
    writeJson(response, error.status, { error: error.message });
    return;
  }
  writeJson(response, 500, { error: 'The practice test could not be processed. Please try again.' });
}

function bankOr503(response: ServerResponse, bank: PracticeTestBank | null): bank is PracticeTestBank {
  if (bank === null) {
    writeJson(response, 503, {
      error: 'The practice-test question bank is not available in this environment.',
    });
    return false;
  }
  return true;
}

/**
 * Infeasibility → 503, the analogue of {@link bankOr503} for a bank that EXISTS
 * but is too thin to fill the blueprint from this learner's remaining fresh
 * items. A practice test is validate-before-serve, so `assemblePracticeTest`
 * throws {@link PracticeTestAssemblyError} rather than deal a short form; without
 * this guard that throw surfaces through `handleError` as a generic 500. Checking
 * feasibility BEFORE assembling turns it into the same graceful 503 as a missing
 * bank. A completed sitting serves its done view from the response log without
 * re-assembling, so it never needs (and must not fail) this check.
 */
function servableOr503(
  response: ServerResponse,
  bank: PracticeTestBank,
  record: SessionRecord,
  learnerId: string,
): boolean {
  if (record.completed || bankSupportsPracticeTest(bank, learnerId, practiceTestBlueprintFor(tierOf(record))))
    return true;
  writeJson(response, 503, {
    error: 'The practice-test question bank is not available in this environment.',
  });
  return false;
}

/** POST /api/practice-test/next — start/resume a sitting and serve the current block. */
export function handlePracticeTestNextRequest(
  request: IncomingMessage,
  response: ServerResponse,
  bank: PracticeTestBank | null = bankSingleton,
  recorder?: PracticeTestAuthorityRecorder,
): void {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    writeJson(response, 405, { error: 'Use POST for the practice test.' });
    return;
  }
  if (!isSameOriginRequest(request)) {
    writeJson(response, 403, { error: 'This practice-test request was not accepted.' });
    return;
  }
  if (!bankOr503(response, bank)) return;
  void readJsonBody(request)
    .then(async (body) => {
      const learnerId = clientId(request);
      const now = new Date().toISOString() as UtcTimestamp;
      const token = typeof body.sessionToken === 'string' ? body.sessionToken : null;
      // Resuming an existing sitting is never re-gated (you are mid-test); only
      // STARTING a new one consults the §6 cadence at the serving boundary, so a
      // test cannot be started off-cadence even by calling the API directly.
      if (token === null && recorder?.gate !== undefined) {
        const gate = await recorder.gate();
        if (!gate.due) {
          writeJson(response, 409, {
            error: 'No practice test is due right now.',
            reason: gate.reason,
          });
          return;
        }
        const { record, sessionToken } = practiceTestSessionStore.create(learnerId);
        sessionTier.set(record, gate.tier);
        if (!servableOr503(response, bank, record, learnerId)) return;
        writeJson(response, 200, serveBlock(bank, record, sessionToken, learnerId, now));
        return;
      }
      const { record, sessionToken } = token
        ? { record: practiceTestSessionStore.get(token), sessionToken: token }
        : practiceTestSessionStore.create(learnerId);
      // Validate-before-serve: an infeasible fresh pool is a graceful 503, not a
      // 500 thrown out of the assembler inside `serveBlock`.
      if (!servableOr503(response, bank, record, learnerId)) return;
      writeJson(response, 200, serveBlock(bank, record, sessionToken, learnerId, now));
    })
    .catch((error: unknown) => handleError(response, error));
}

/** POST /api/practice-test/block — commit a whole block (one-use token) and serve the next. */
export function handlePracticeTestBlockRequest(
  request: IncomingMessage,
  response: ServerResponse,
  bank: PracticeTestBank | null = bankSingleton,
  recorder?: PracticeTestAuthorityRecorder,
): void {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    writeJson(response, 405, { error: 'Use POST for the practice test.' });
    return;
  }
  if (!isSameOriginRequest(request)) {
    writeJson(response, 403, { error: 'This practice-test request was not accepted.' });
    return;
  }
  if (!bankOr503(response, bank)) return;
  void readJsonBody(request)
    .then(async (body) => {
      const learnerId = clientId(request);
      const sessionToken = typeof body.sessionToken === 'string' ? body.sessionToken : '';
      const blockToken = typeof body.blockToken === 'string' ? body.blockToken : '';
      const blockId = typeof body.blockId === 'string' ? body.blockId : '';
      const answers = parseAnswers(body.answers);
      const elapsedMs = parseElapsed(body.elapsedMs);

      const record = practiceTestSessionStore.get(sessionToken);
      const now = new Date().toISOString() as UtcTimestamp;
      const questionIds = practiceTestSessionStore.consumeBlockToken(record, blockId, blockToken);
      recordPracticeTestBlock(bank, record, questionIds, answers, elapsedMs);
      // Capture completion BEFORE serving: `serveBlock` (→ resolvePracticeTestBlock)
      // is what flips `record.completed` once the last block is committed.
      const wasCompleted = record.completed;
      // Same validate-before-serve guard as `/next`: serving the next block
      // re-assembles, so an infeasible pool is a 503 rather than a generic 500.
      if (!servableOr503(response, bank, record, learnerId)) return;
      const payload = serveBlock(bank, record, sessionToken, learnerId, now);
      // The sitting just finished on THIS commit → report the SCORED result so
      // the authority persists the sitting (dashboard summary), enqueues its
      // misses into the repair queue, and re-opens the review gate. The block
      // still succeeds even if the best-effort record hiccups.
      if (!wasCompleted && record.completed && recorder !== undefined) {
        try {
          await recorder.recordCompleted(completionFrom(payload, tierOf(record), now));
        } catch {
          // Best-effort: a dev-authority hiccup must not fail a committed block.
        }
      }
      writeJson(response, 200, payload);
    })
    .catch((error: unknown) => handleError(response, error));
}

/**
 * POST /api/practice-test/review — the learner finished reviewing the prior test.
 * Distinct from completion: the §6 cadence blocks the NEXT test until the last
 * one has been reviewed, so this releases that gate through the authority command.
 */
export function handlePracticeTestReviewRequest(
  request: IncomingMessage,
  response: ServerResponse,
  recorder?: PracticeTestAuthorityRecorder,
): void {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    writeJson(response, 405, { error: 'Use POST for the practice test.' });
    return;
  }
  if (!isSameOriginRequest(request)) {
    writeJson(response, 403, { error: 'This practice-test request was not accepted.' });
    return;
  }
  void readJsonBody(request)
    .then(async () => {
      if (recorder !== undefined) await recorder.recordReviewed();
      writeJson(response, 200, { ok: true });
    })
    .catch((error: unknown) => handleError(response, error));
}
