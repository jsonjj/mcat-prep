import type { IncomingMessage, ServerResponse } from 'node:http';
import { isPassageChoiceId, passageOfDayService } from './passage-of-day';

/**
 * Passage of the Day HTTP surface for the learner-web dev/preview server.
 *
 * Mirrors the diagnostic API's hardening: same-origin only, JSON only (for the
 * POST), no-store, bounded body. The passage view carries no answer key; scoring
 * is server-side and returned only after the learner commits an answer. It is a
 * dedicated surface (mounted at `/api/passage/*`, like `/api/diagnostic/*`) so it
 * works whether the dev server owns `/v1` in-process or proxies it to a remote
 * authority, and so the formative passage never routes through the authority
 * kernel.
 *
 * Production/preview serving beyond the Vite middleware is out of scope here (the
 * feature would be delivered by an API Gateway route, as the diagnostic is); see
 * the build report.
 */

class RequestBodyError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
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

function writeJson(response: ServerResponse, status: number, payload: unknown): void {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.end(JSON.stringify(payload));
}

async function readJsonBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  if (!isJsonRequest(request)) throw new RequestBodyError('Request body must use application/json.', 415);
  let body = '';
  for await (const chunk of request) {
    body += (chunk as Buffer).toString();
    if (body.length > 16_384) throw new RequestBodyError('Request body is too large.', 413);
  }
  try {
    const parsed = JSON.parse(body || '{}') as unknown;
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new RequestBodyError('Request body must be a JSON object.', 400);
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    if (error instanceof RequestBodyError) throw error;
    throw new RequestBodyError('Request body must be valid JSON.', 400);
  }
}

/**
 * The browser sends its `Date.getTimezoneOffset()` so the server can key the
 * rotation to the learner-local day. Parsed defensively: a missing or malformed
 * value falls back to 0 (UTC) rather than failing the request.
 */
function timezoneOffsetFromUrl(request: IncomingMessage): number {
  try {
    const url = new URL(request.url ?? '/', 'http://localhost');
    const raw = url.searchParams.get('tz');
    if (raw === null) return 0;
    const value = Number.parseInt(raw, 10);
    return Number.isFinite(value) ? value : 0;
  } catch {
    return 0;
  }
}

/** GET /api/passage/today?tz=<offsetMinutes> — the day's learner-safe passage. */
export function handleTodayRequest(request: IncomingMessage, response: ServerResponse): void {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    writeJson(response, 405, { error: 'Use GET for the passage of the day.' });
    return;
  }
  if (!isSameOriginRequest(request)) {
    writeJson(response, 403, { error: 'This passage request was not accepted.' });
    return;
  }
  try {
    const view = passageOfDayService.todayView(new Date(), timezoneOffsetFromUrl(request));
    // `passage: null` is the honest "pool is empty" response; the runner renders
    // an on-brand empty state for it rather than treating it as an error.
    writeJson(response, 200, { passage: view });
  } catch {
    writeJson(response, 500, { error: 'The passage of the day could not be loaded.' });
  }
}

/** POST /api/passage/attempts — score one answer and reveal its explanation. */
export function handleAttemptRequest(request: IncomingMessage, response: ServerResponse): void {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    writeJson(response, 405, { error: 'Use POST to submit a passage answer.' });
    return;
  }
  if (!isSameOriginRequest(request)) {
    writeJson(response, 403, { error: 'This passage request was not accepted.' });
    return;
  }
  void readJsonBody(request)
    .then((body) => {
      const questionId = typeof body.questionId === 'string' ? body.questionId : '';
      if (questionId === '') {
        writeJson(response, 400, { error: 'A questionId is required.' });
        return;
      }
      const rawChoice = body.choiceId;
      if (rawChoice !== null && !isPassageChoiceId(rawChoice)) {
        writeJson(response, 400, { error: 'choiceId must be A, B, C, D, or null.' });
        return;
      }
      const grade = passageOfDayService.grade(questionId, rawChoice);
      if (grade === null) {
        writeJson(response, 404, { error: 'That passage question is not in the pool.' });
        return;
      }
      writeJson(response, 200, { grade });
    })
    .catch((error: unknown) => {
      if (error instanceof RequestBodyError) {
        writeJson(response, error.status, { error: error.message });
        return;
      }
      writeJson(response, 500, { error: 'The passage answer could not be scored.' });
    });
}
