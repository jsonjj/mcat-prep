import type { IncomingMessage, ServerResponse } from 'node:http';
import { getPassageOfDayService, isPassageChoiceId } from './passage-of-day';

/**
 * Passage of the Day HTTP surface for the learner-web dev server — the OFFLINE
 * FALLBACK behind `server/passage-api-plugin.ts`, mounted at the REAL
 * `/v1/passage/*` routes the browser now calls in every mode.
 *
 * Mirrors the diagnostic API's hardening: same-origin only, JSON only (for the
 * POST), no-store, bounded body. The passage view carries no answer key; scoring
 * is server-side and returned only after the learner commits an answer, and the
 * formative passage never routes through the authority kernel.
 *
 * In production and the proxy dev modes these routes are served by the deployed
 * learner-API Lambda / the local learner API instead (see
 * services/lambdas/learner-api and services/local-learner-api); this middleware
 * only answers when the fully in-process dev authority owns `/v1`.
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
 * rotation to the learner-local day. It rides in the request PATH
 * (`/v1/passage/today/{tz}`), matching the deployed route. The plugin mounts this
 * handler at `/v1/passage/today`, so Connect strips that prefix from `request.url`;
 * `originalUrl` keeps the full path. Parsed defensively: a missing/malformed value
 * falls back to 0 (UTC) rather than failing the request.
 */
function timezoneOffsetFromPath(request: IncomingMessage): number {
  const full =
    (request as IncomingMessage & { originalUrl?: string }).originalUrl ?? request.url ?? '';
  const path = full.split('?', 1)[0] ?? '';
  const match = /(-?\d{1,4})\/?$/.exec(path);
  if (match === null) return 0;
  const value = Number.parseInt(match[1]!, 10);
  return Number.isFinite(value) && Math.abs(value) <= 1440 ? value : 0;
}

/** GET /v1/passage/today/<offsetMinutes> — the day's learner-safe passage. */
export async function handleTodayRequest(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
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
    const service = await getPassageOfDayService();
    const view = service.todayView(new Date(), timezoneOffsetFromPath(request));
    // `passage: null` is the honest "pool is empty" response; the runner renders
    // an on-brand empty state for it rather than treating it as an error.
    writeJson(response, 200, { passage: view });
  } catch {
    writeJson(response, 500, { error: 'The passage of the day could not be loaded.' });
  }
}

/** POST /v1/passage/attempts — score one answer and reveal its explanation. */
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
    .then(async (body) => {
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
      const service = await getPassageOfDayService();
      const grade = service.grade(questionId, rawChoice);
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
