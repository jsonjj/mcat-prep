import type { IncomingMessage, ServerResponse } from 'node:http';
import type { UtcTimestamp } from '@mcat/contracts';
import { createPracticeTestBank, type PracticeTestBank } from './practice-test-bank';
import {
  DiagnosticSessionError,
  DiagnosticSessionStore,
  type SessionRecord,
} from './diagnostic-session-store';
import {
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
}

function serveBlock(
  bank: PracticeTestBank,
  record: SessionRecord,
  sessionToken: string,
  learnerId: string,
): BlockResponsePayload {
  const { view, block } = resolvePracticeTestBlock(bank, record, learnerId, {
    now: new Date().toISOString() as UtcTimestamp,
  });
  const blockToken = block
    ? practiceTestSessionStore.issueBlockToken(record, block.blockId, block.questionIds)
    : null;
  return { sessionToken, blockToken, ...view };
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

/** POST /api/practice-test/next — start/resume a sitting and serve the current block. */
export function handlePracticeTestNextRequest(
  request: IncomingMessage,
  response: ServerResponse,
  bank: PracticeTestBank | null = bankSingleton,
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
    .then((body) => {
      const learnerId = clientId(request);
      const token = typeof body.sessionToken === 'string' ? body.sessionToken : null;
      const { record, sessionToken } = token
        ? { record: practiceTestSessionStore.get(token), sessionToken: token }
        : practiceTestSessionStore.create(learnerId);
      writeJson(response, 200, serveBlock(bank, record, sessionToken, learnerId));
    })
    .catch((error: unknown) => handleError(response, error));
}

/** POST /api/practice-test/block — commit a whole block (one-use token) and serve the next. */
export function handlePracticeTestBlockRequest(
  request: IncomingMessage,
  response: ServerResponse,
  bank: PracticeTestBank | null = bankSingleton,
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
    .then((body) => {
      const learnerId = clientId(request);
      const sessionToken = typeof body.sessionToken === 'string' ? body.sessionToken : '';
      const blockToken = typeof body.blockToken === 'string' ? body.blockToken : '';
      const blockId = typeof body.blockId === 'string' ? body.blockId : '';
      const answers = parseAnswers(body.answers);
      const elapsedMs = parseElapsed(body.elapsedMs);

      const record = practiceTestSessionStore.get(sessionToken);
      const questionIds = practiceTestSessionStore.consumeBlockToken(record, blockId, blockToken);
      recordPracticeTestBlock(bank, record, questionIds, answers, elapsedMs);
      writeJson(response, 200, serveBlock(bank, record, sessionToken, learnerId));
    })
    .catch((error: unknown) => handleError(response, error));
}
