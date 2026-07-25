import type { IncomingMessage, ServerResponse } from 'node:http';
import { diagnosticBank, type DiagnosticBank } from './diagnostic-bank';
import {
  DiagnosticSessionError,
  DiagnosticSessionStore,
  type SessionRecord,
} from './diagnostic-session-store';
import { recordAnswer, resolveNext, type DiagnosticNextView } from './diagnostic-engine';

/**
 * Diagnostic HTTP surface for the learner-web dev/preview server. Mirrors the
 * landing snapshot API hardening: same-origin only, JSON only, no-store, bounded
 * body. The answer key never appears in any response; scoring is server-side and
 * per-item correctness is never echoed back (no answer oracle).
 */

class RequestBodyError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export const diagnosticSessionStore = new DiagnosticSessionStore();

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
    if (body.length > 16_384) throw new RequestBodyError('Request body is too large.', 413);
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

interface NextResponsePayload extends DiagnosticNextView {
  sessionToken: string;
  itemToken: string | null;
}

function serveNext(
  bank: DiagnosticBank,
  record: SessionRecord,
  sessionToken: string,
): NextResponsePayload {
  const { view, servedQuestionId } = resolveNext(bank, record);
  const itemToken = servedQuestionId
    ? diagnosticSessionStore.issueItemToken(record, servedQuestionId)
    : null;
  return { sessionToken, itemToken, ...view };
}

function isChoiceId(value: unknown): value is 'A' | 'B' | 'C' | 'D' {
  return value === 'A' || value === 'B' || value === 'C' || value === 'D';
}

function handleError(response: ServerResponse, error: unknown): void {
  if (error instanceof RequestBodyError || error instanceof DiagnosticSessionError) {
    if (error instanceof DiagnosticSessionError && error.retryAfterSeconds) {
      response.setHeader('Retry-After', String(error.retryAfterSeconds));
    }
    writeJson(response, error.status, { error: error.message });
    return;
  }
  writeJson(response, 500, { error: 'The diagnostic could not be processed. Please try again.' });
}

/** POST /api/diagnostic/next — start/resume a session and serve the current item. */
export function handleNextRequest(
  request: IncomingMessage,
  response: ServerResponse,
  bank: DiagnosticBank = diagnosticBank,
): void {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    writeJson(response, 405, { error: 'Use POST for the diagnostic.' });
    return;
  }
  if (!isSameOriginRequest(request)) {
    writeJson(response, 403, { error: 'This diagnostic request was not accepted.' });
    return;
  }
  void readJsonBody(request)
    .then((body) => {
      const token = typeof body.sessionToken === 'string' ? body.sessionToken : null;
      const { record, sessionToken } = token
        ? { record: diagnosticSessionStore.get(token), sessionToken: token }
        : diagnosticSessionStore.create(clientId(request));
      writeJson(response, 200, serveNext(bank, record, sessionToken));
    })
    .catch((error: unknown) => handleError(response, error));
}

/** POST /api/diagnostic/answer — score one item (one-use token) and serve the next. */
export function handleAnswerRequest(
  request: IncomingMessage,
  response: ServerResponse,
  bank: DiagnosticBank = diagnosticBank,
): void {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    writeJson(response, 405, { error: 'Use POST for the diagnostic.' });
    return;
  }
  if (!isSameOriginRequest(request)) {
    writeJson(response, 403, { error: 'This diagnostic request was not accepted.' });
    return;
  }
  void readJsonBody(request)
    .then((body) => {
      const sessionToken = typeof body.sessionToken === 'string' ? body.sessionToken : '';
      const questionId = typeof body.questionId === 'string' ? body.questionId : '';
      const itemToken = typeof body.itemToken === 'string' ? body.itemToken : '';
      const choiceId = isChoiceId(body.choiceId) ? body.choiceId : null;
      const elapsedMs = typeof body.elapsedMs === 'number' ? body.elapsedMs : 0;

      const record = diagnosticSessionStore.get(sessionToken);
      if (!bank.has(questionId)) {
        throw new DiagnosticSessionError('Unknown diagnostic item.', 400);
      }
      // One-use item token: consuming it prevents replaying this served item.
      diagnosticSessionStore.consumeItemToken(record, questionId, itemToken);
      recordAnswer(bank, record, questionId, choiceId, elapsedMs);
      writeJson(response, 200, serveNext(bank, record, sessionToken));
    })
    .catch((error: unknown) => handleError(response, error));
}
