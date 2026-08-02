import { randomUUID } from 'node:crypto';
import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from 'node:http';

import type { ApiGatewayV2Event, ApiGatewayV2Result } from '@mcat/learner-api';

/**
 * Node's HTTP server spoken as API Gateway v2.
 *
 * The handler is written against the payload API Gateway sends, and it stays
 * that way: translating here is what lets the local process run the SAME
 * `createRepositoryLearnerApi` the Lambda runs, with no local-only branch inside
 * it. The translation is small but has three details that are easy to get wrong,
 * and all three are covered by `node-event.test.ts`:
 *
 *  - Cookies arrive in `event.cookies`, NOT in a `cookie` header. `parseCookies`
 *    reads both and discards any name it sees twice, so sending them in both
 *    places would silently delete the session cookie.
 *  - `rawQueryString` is passed through untouched. The handler rejects any
 *    non-empty query string, and that rejection is the point — hiding it here
 *    would make local dev accept requests the deployed API refuses.
 *  - A response's cookies are a LIST, and each one needs its own `Set-Cookie`
 *    header. Joining them yields a single malformed cookie.
 */

/**
 * Bounded before the body is buffered. The handler enforces its own 64 KiB limit
 * on the decoded bytes; this only stops an oversized upload from being read into
 * memory first.
 */
export const MAX_REQUEST_BYTES = 256 * 1024;

export interface NodeRequestParts {
  readonly method: string | undefined;
  readonly url: string | undefined;
  readonly headers: IncomingHttpHeaders;
  readonly remoteAddress: string | undefined;
  readonly body: Buffer;
  /** Injectable so tests can assert on it; a real request gets a fresh id. */
  readonly requestId?: string;
}

/**
 * IPv4 arriving on a dual-stack socket is written `::ffff:127.0.0.1`. The
 * deployed API sees a plain address, and this value keys rate limiting, so
 * normalize rather than meter two spellings of one caller separately.
 */
function sourceIpOf(remoteAddress: string | undefined): string {
  if (remoteAddress === undefined || remoteAddress === '') return 'unknown';
  return remoteAddress.replace(/^::ffff:/, '');
}

function normalizeHeaders(headers: IncomingHttpHeaders): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers)) {
    if (value === undefined) continue;
    // Node lowercases incoming header names already; the join mirrors how a
    // gateway folds a repeated header into one field value.
    if (name.toLowerCase() === 'cookie') continue;
    result[name.toLowerCase()] = Array.isArray(value) ? value.join(', ') : value;
  }
  return result;
}

/** Node folds repeated `Cookie` headers into one value, so this sees a string. */
function cookiesOf(headers: IncomingHttpHeaders): readonly string[] {
  return (headers.cookie ?? '')
    .split(';')
    .map((pair) => pair.trim())
    .filter((pair) => pair !== '');
}

export function toApiGatewayEvent(parts: NodeRequestParts): ApiGatewayV2Event {
  const url = parts.url ?? '/';
  const queryAt = url.indexOf('?');
  // Undecoded, exactly as `rawPath` arrives from API Gateway. Every route
  // pattern is plain lowercase/digits/hyphens, so there is nothing to decode.
  const rawPath = queryAt === -1 ? url : url.slice(0, queryAt);
  const rawQueryString = queryAt === -1 ? '' : url.slice(queryAt + 1);
  const method = (parts.method ?? 'GET').toUpperCase();

  const utf8 = parts.body.toString('utf8');
  // API Gateway base64-encodes a body that is not valid UTF-8. Round-tripping is
  // the honest test for that, and it keeps the ordinary JSON case a plain string.
  const isBase64Encoded = !Buffer.from(utf8, 'utf8').equals(parts.body);

  return {
    version: '2.0',
    rawPath,
    rawQueryString,
    headers: normalizeHeaders(parts.headers),
    cookies: cookiesOf(parts.headers),
    requestContext: {
      requestId: parts.requestId ?? randomUUID(),
      http: { method, path: rawPath, sourceIp: sourceIpOf(parts.remoteAddress) },
    },
    ...(parts.body.byteLength === 0
      ? {}
      : {
          body: isBase64Encoded ? parts.body.toString('base64') : utf8,
          isBase64Encoded,
        }),
  };
}

export function writeApiGatewayResult(response: ServerResponse, result: ApiGatewayV2Result): void {
  const headers: Record<string, string | readonly string[]> = { ...result.headers };
  if (result.cookies !== undefined && result.cookies.length > 0) {
    headers['set-cookie'] = [...result.cookies];
  }
  response.writeHead(result.statusCode, headers as Record<string, string | string[]>);
  response.end(result.body ?? '');
}

/** Buffer the request body, or reject once it passes `MAX_REQUEST_BYTES`. */
export async function readRequestBody(
  request: IncomingMessage,
  maxBytes: number = MAX_REQUEST_BYTES,
): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string);
    bytes += buffer.byteLength;
    if (bytes > maxBytes) throw new RequestTooLargeError();
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

export class RequestTooLargeError extends Error {
  constructor() {
    super('The request body is too large.');
    this.name = 'RequestTooLargeError';
  }
}
