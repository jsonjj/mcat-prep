import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type {
  ChoiceId,
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
  DiagnosticSessionStore,
  type SessionRecord,
} from '@mcat/diagnostic-runner';
import {
  bankSupportsPracticeTest,
  buildPracticeTestCompletion,
  createPracticeTestBank,
  recordPracticeTestBlock,
  resolvePracticeTestBlock,
  type PracticeTestBank,
  type PracticeTestBlockView,
  type PracticeTestCompletionResult,
  type PracticeTestFinalize,
  type PracticeTestFreshness,
} from '@mcat/practice-test-runner';

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

/**
 * The sitting id minted at START, reused at completion so the persisted sitting
 * (and its abandoned/open bookkeeping, Task 4) carry the SAME id end to end
 * rather than a fresh one generated only at finish. Lost on restart, like the
 * session store itself; a resumed-then-completed sitting keeps one id.
 */
const sessionSittingId = new WeakMap<SessionRecord, string>();
const sittingIdOf = (record: SessionRecord): string => {
  const existing = sessionSittingId.get(record);
  if (existing !== undefined) return existing;
  const id = randomUUID();
  sessionSittingId.set(record, id);
  return id;
};

/**
 * The learner's chosen option per item, accumulated across the sitting's blocks
 * so the completion can carry the picked distractor into the attempt log (Task 2
 * — a Mistakes row shows "you picked B"). Per-record, in-memory for the sitting;
 * lost on restart with the session, which is fine (an interrupted sitting cannot
 * complete anyway).
 */
const sessionAnswers = new WeakMap<SessionRecord, Map<string, ChoiceId | null>>();

/** What the serve boundary needs to know before it will START a new sitting (WS5, §6). */
export interface PracticeTestServeGate {
  readonly due: boolean;
  readonly reason: string;
  readonly tier: PracticeTestLengthTier;
  /** Earliest `YYYY-MM-DD` a test could next be served on a refusal; null when due/uncomputable. */
  readonly nextEligibleDate: string | null;
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
  /**
   * The DURABLE freshness the engine assembles + re-measures against (Task 1):
   * the never-reuse item set and the dated per-unit history, read straight off
   * the persisted learner state. Optional — a recorder that does not provide it
   * (a test stub) degrades to empty freshness (a first, all-fresh sitting).
   */
  loadFreshness?():
    | Promise<{
        scoredItemIds: readonly string[];
        unitHistory: readonly DatedUnitObservation[];
      }>
    | {
        scoredItemIds: readonly string[];
        unitHistory: readonly DatedUnitObservation[];
      };
  /**
   * Mark a sitting STARTED so an incomplete one can be closed and the one-open
   * invariant held (Task 4). Optional; a recorder without it simply does not
   * track abandonment.
   */
  recordStarted?(started: {
    sittingId: string;
    startedAt: UtcTimestamp;
    tier: PracticeTestLengthTier;
  }): Promise<void> | void;
  recordCompleted(completion?: PracticeTestCompletionResult): Promise<void> | void;
  recordReviewed(): Promise<void> | void;
}

/** Read the durable freshness through the recorder, or empty when none is wired. */
async function loadFreshness(
  recorder: PracticeTestAuthorityRecorder | undefined,
): Promise<PracticeTestFreshness> {
  if (recorder?.loadFreshness === undefined) {
    return { scoredIds: new Set<string>(), unitHistory: [] };
  }
  const f = await recorder.loadFreshness();
  return { scoredIds: new Set(f.scoredItemIds), unitHistory: [...f.unitHistory] };
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
  if (!isJsonRequest(request))
    throw new RequestBodyError('Request body must use application/json.', 415);
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
  /**
   * The dev/preview runner persists a completed sitting's scored result inline
   * (its recorder → the in-process authority) on the completing block commit, so
   * a `done` view is already persisted. The client reads this to skip the
   * separate result write it makes against the deployed backend (which does not
   * self-persist). See `apps/learner-web/src/app/practice-test-client.ts`.
   */
  resultPersisted: boolean;
}

function serveBlock(
  bank: PracticeTestBank,
  record: SessionRecord,
  sessionToken: string,
  freshness: PracticeTestFreshness,
  now: UtcTimestamp,
): { payload: BlockResponsePayload; finalize: PracticeTestFinalize | undefined } {
  const { view, block, finalize } = resolvePracticeTestBlock(bank, record, freshness, {
    now,
    blueprint: practiceTestBlueprintFor(tierOf(record)),
  });
  const blockToken = block
    ? practiceTestSessionStore.issueBlockToken(record, block.blockId, block.questionIds)
    : null;
  return {
    payload: {
      sessionToken,
      blockToken,
      blockId: block?.blockId ?? null,
      // The dev runner persists the scored result on the completing commit, so a
      // done view is already persisted; the client then skips its own write.
      resultPersisted: view.done,
      ...view,
    },
    finalize,
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
  writeJson(response, 500, {
    error: 'The practice test could not be processed. Please try again.',
  });
}

function bankOr503(
  response: ServerResponse,
  bank: PracticeTestBank | null,
): bank is PracticeTestBank {
  if (bank === null) {
    writeJson(response, 503, {
      error: 'The practice-test question bank is not available in this environment.',
    });
    return false;
  }
  return true;
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

/**
 * The typed 409 body for an out-of-cadence / review-gated / locked start (WS5,
 * §6, Task 3). The serve gate's reason narrows to a {@link
 * PracticeTestServeRefusalReason}; anything unexpected degrades to
 * `not_due_recent` so the body always matches {@link PracticeTestServeRefusal}
 * and the client can render it without guessing.
 */
function refusalFrom(gate: PracticeTestServeGate): PracticeTestServeRefusal {
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
  excludeIds: ReadonlySet<string>,
): boolean {
  if (
    record.completed ||
    bankSupportsPracticeTest(bank, excludeIds, practiceTestBlueprintFor(tierOf(record)))
  )
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
      const freshness = await loadFreshness(recorder);
      // Resuming an existing sitting is never re-gated (you are mid-test); only
      // STARTING a new one consults the §6 cadence at the serving boundary, so a
      // test cannot be started off-cadence even by calling the API directly. A
      // refusal is a typed, named body the client can render (Task 3).
      if (token === null && recorder?.gate !== undefined) {
        const gate = await recorder.gate();
        if (!gate.due) {
          writeJson(response, 409, refusalFrom(gate));
          return;
        }
        const { record, sessionToken } = practiceTestSessionStore.create(learnerId);
        sessionTier.set(record, gate.tier);
        if (!servableOr503(response, bank, record, freshness.scoredIds)) return;
        // Mark the sitting STARTED so an abandoned one is closed + the one-open
        // invariant holds (Task 4). Best-effort: a hiccup must not fail the serve.
        try {
          await recorder.recordStarted?.({
            sittingId: sittingIdOf(record),
            startedAt: now,
            tier: gate.tier,
          });
        } catch {
          // A dev-authority hiccup must not block a due sitting from starting.
        }
        writeJson(response, 200, serveBlock(bank, record, sessionToken, freshness, now).payload);
        return;
      }
      const { record, sessionToken } = token
        ? { record: practiceTestSessionStore.get(token), sessionToken: token }
        : practiceTestSessionStore.create(learnerId);
      // Validate-before-serve: an infeasible fresh pool is a graceful 503, not a
      // 500 thrown out of the assembler inside `serveBlock`.
      if (!servableOr503(response, bank, record, freshness.scoredIds)) return;
      writeJson(response, 200, serveBlock(bank, record, sessionToken, freshness, now).payload);
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
      const sessionToken = typeof body.sessionToken === 'string' ? body.sessionToken : '';
      const blockToken = typeof body.blockToken === 'string' ? body.blockToken : '';
      const blockId = typeof body.blockId === 'string' ? body.blockId : '';
      const answers = parseAnswers(body.answers);
      const elapsedMs = parseElapsed(body.elapsedMs);

      const record = practiceTestSessionStore.get(sessionToken);
      const now = new Date().toISOString() as UtcTimestamp;
      const freshness = await loadFreshness(recorder);
      const questionIds = practiceTestSessionStore.consumeBlockToken(record, blockId, blockToken);
      recordPracticeTestBlock(bank, record, questionIds, answers, elapsedMs);
      // Accumulate the picked options across the sitting's blocks so the
      // completion can carry the chosen distractor into the attempt log (Task 2).
      const picked = sessionAnswers.get(record) ?? new Map<string, ChoiceId | null>();
      for (const id of questionIds) picked.set(id, (answers[id] ?? null) as ChoiceId | null);
      sessionAnswers.set(record, picked);
      // Capture completion BEFORE serving: `serveBlock` (→ resolvePracticeTestBlock)
      // is what flips `record.completed` once the last block is committed.
      const wasCompleted = record.completed;
      // Same validate-before-serve guard as `/next`: serving the next block
      // re-assembles, so an infeasible pool is a 503 rather than a generic 500.
      if (!servableOr503(response, bank, record, freshness.scoredIds)) return;
      const { payload, finalize } = serveBlock(bank, record, sessionToken, freshness, now);
      // The sitting just finished on THIS commit → report the SCORED result so
      // the authority persists the sitting (dashboard summary) + the durable
      // freshness (Task 1), enqueues its misses into the Mistakes/repair queue
      // (Task 2), closes the open sitting (Task 4), and re-opens the review gate.
      // The block still succeeds even if the best-effort record hiccups.
      if (
        !wasCompleted &&
        record.completed &&
        recorder !== undefined &&
        finalize !== undefined &&
        payload.result !== null
      ) {
        try {
          await recorder.recordCompleted(
            buildPracticeTestCompletion(bank, record, payload.result, finalize, {
              picked: sessionAnswers.get(record) ?? new Map<string, ChoiceId | null>(),
              sittingId: sittingIdOf(record),
              tier: tierOf(record),
              now,
            }),
          );
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
