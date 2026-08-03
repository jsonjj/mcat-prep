import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  DiagnosticBank,
  DiagnosticSessionError,
  DiagnosticSessionStore,
  parseAnswers,
  parseElapsed,
  recordBlock,
  renderBlock,
} from '@mcat/diagnostic-runner';

/**
 * Diagnostic HTTP surface for the learner-web dev/preview server. Mirrors the
 * landing snapshot API hardening: same-origin only, JSON only, no-store, bounded
 * body. The answer key never appears in any response; scoring is server-side and
 * per-item correctness is never echoed back (no answer oracle).
 *
 * This is the DEV seam for the same `/v1/diagnostic/*` block contract the deployed
 * learner-API serves in production. The bank, engine, and session integrity all
 * come from the shared `@mcat/diagnostic-runner` package, so dev and prod cannot
 * drift; the only difference is storage (in-memory here, Postgres in the Lambda)
 * and the unauthenticated same-origin posture (there is no learner session in the
 * dev/preview server — the deployed route is session-gated instead).
 */

class RequestBodyError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** Process-wide singleton bank for the dev/preview server (prefers the local pull). */
const diagnosticBank = new DiagnosticBank();
export const diagnosticSessionStore = new DiagnosticSessionStore();

// Stated once at boot. The exclusion is intended, but an axis change that
// silently shrinks the deliverable pool is exactly the failure this accounting
// exists to catch, so it is announced rather than left to be discovered.
console.warn(
  `[diagnostic] bank scope: ${diagnosticBank.scope.inScope} of ${diagnosticBank.scope.eligible} eligible items ` +
    `are on the reporting axis; ${diagnosticBank.scope.outOfScope} excluded (no foundational concept) — ` +
    Object.entries(diagnosticBank.scope.outOfScopeByCluster)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([cluster, n]) => `${cluster}:${n}`)
      .join(' '),
);

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

/** POST /v1/diagnostic/next — start/resume a session and serve the current block. */
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
      writeJson(response, 200, renderBlock(bank, record, sessionToken));
    })
    .catch((error: unknown) => handleError(response, error));
}

/** POST /v1/diagnostic/block — commit a whole block (one-use token) and serve the next. */
export function handleBlockRequest(
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
      const blockToken = typeof body.blockToken === 'string' ? body.blockToken : '';
      const stageId = typeof body.stageId === 'string' ? body.stageId : '';
      const answers = parseAnswers(body.answers);
      const elapsedMs = parseElapsed(body.elapsedMs);

      const record = diagnosticSessionStore.get(sessionToken);
      // One-use block token: consuming it prevents replaying a committed block,
      // and hands back the item list the block was actually served with.
      const questionIds = diagnosticSessionStore.consumeBlockToken(record, stageId, blockToken);
      recordBlock(bank, record, questionIds, answers, elapsedMs);
      writeJson(response, 200, renderBlock(bank, record, sessionToken));
    })
    .catch((error: unknown) => handleError(response, error));
}
