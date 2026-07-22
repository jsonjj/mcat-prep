import { createHash } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { SnapshotAttemptError, SnapshotAttemptStore } from './snapshot-attempt-store';
import { SnapshotInputError, scoreSnapshot } from './snapshot-score';

export class RequestBodyError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export const snapshotAttemptStore = new SnapshotAttemptStore();

export async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const contentType = request.headers['content-type'] ?? '';
  if (!contentType.toLowerCase().startsWith('application/json')) {
    throw new RequestBodyError('Request body must use application/json.', 415);
  }

  let body = '';
  for await (const chunk of request) {
    body += chunk.toString();
    if (body.length > 16_384) {
      throw new RequestBodyError('Request body is too large.', 413);
    }
  }

  try {
    return JSON.parse(body);
  } catch {
    throw new RequestBodyError('Request body must be valid JSON.', 400);
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function canonicalSubmission(responses: unknown): string {
  if (!Array.isArray(responses)) return JSON.stringify(responses);
  return JSON.stringify(
    [...responses].sort((left, right) => {
      const leftId = isObject(left) && typeof left.questionId === 'string' ? left.questionId : '';
      const rightId =
        isObject(right) && typeof right.questionId === 'string' ? right.questionId : '';
      return leftId.localeCompare(rightId);
    }),
  );
}

function trustsProxyHeaders(): boolean {
  return process.env.TRUST_PROXY === '1';
}

export function isSameOriginRequest(request: IncomingMessage): boolean {
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

export function isJsonRequest(request: IncomingMessage): boolean {
  const contentType = request.headers['content-type'] ?? '';
  return contentType.toLowerCase().startsWith('application/json');
}

export function clientId(request: IncomingMessage): string {
  const forwardedFor = request.headers['x-forwarded-for'];
  if (trustsProxyHeaders() && typeof forwardedFor === 'string') {
    const firstAddress = forwardedFor.split(',')[0]?.trim();
    if (firstAddress) return firstAddress;
  }
  return request.socket.remoteAddress ?? 'unknown-client';
}

export function writeJson(response: ServerResponse, status: number, payload: unknown) {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.end(JSON.stringify(payload));
}

function writeMethodNotAllowed(response: ServerResponse, message: string) {
  response.setHeader('Allow', 'POST');
  writeJson(response, 405, { error: message });
}

export function handleAttemptRequest(
  request: IncomingMessage,
  response: ServerResponse,
  store: SnapshotAttemptStore = snapshotAttemptStore,
) {
  if (request.method !== 'POST') {
    writeMethodNotAllowed(response, 'Use POST to begin a snapshot attempt.');
    return;
  }
  if (!isSameOriginRequest(request) || !isJsonRequest(request)) {
    writeJson(response, 403, { error: 'This snapshot request was not accepted.' });
    return;
  }

  try {
    writeJson(response, 201, store.issue(clientId(request)));
  } catch (error) {
    if (error instanceof SnapshotAttemptError) {
      if (error.retryAfterSeconds) {
        response.setHeader('Retry-After', String(error.retryAfterSeconds));
      }
      writeJson(response, error.status, { error: error.message });
      return;
    }
    writeJson(response, 500, {
      error: 'A snapshot attempt could not be started. Please try again.',
    });
  }
}

export function handleScoreRequest(
  request: IncomingMessage,
  response: ServerResponse,
  store: SnapshotAttemptStore = snapshotAttemptStore,
) {
  if (request.method !== 'POST') {
    writeMethodNotAllowed(response, 'Use POST to generate a snapshot report.');
    return;
  }
  if (!isSameOriginRequest(request)) {
    writeJson(response, 403, { error: 'This snapshot request was not accepted.' });
    return;
  }

  void readJsonBody(request)
    .then((body) => {
      if (!isObject(body) || typeof body.attemptToken !== 'string') {
        throw new SnapshotInputError('A valid snapshot attempt is required.');
      }

      const scoredReport = scoreSnapshot({ responses: body.responses });
      const submissionHash = createHash('sha256')
        .update(canonicalSubmission(body.responses))
        .digest('hex');
      const report = store.complete(body.attemptToken, submissionHash, scoredReport);
      writeJson(response, 200, report);
    })
    .catch((error: unknown) => {
      if (error instanceof RequestBodyError) {
        writeJson(response, error.status, { error: error.message });
        return;
      }
      if (error instanceof SnapshotAttemptError) {
        writeJson(response, error.status, { error: error.message });
        return;
      }
      if (error instanceof SnapshotInputError) {
        writeJson(response, 400, { error: error.message });
        return;
      }
      writeJson(response, 500, {
        error: 'The snapshot report could not be generated. Please try again.',
      });
    });
}
