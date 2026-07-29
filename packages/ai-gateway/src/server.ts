import type { AiMessage } from './port';
import { MAX_OUTPUT_TOKENS } from './cars';
import {
  buildRewriteMessages,
  parseRewriteRequest,
  sanitizeRewrite,
  type RewriteMode,
} from './rewrite';

/**
 * The PRODUCTION AI route — the server-side seam the dev-only Vite proxy stood
 * in for (master-build-spec Phase 0: "prod route not built"). It holds the
 * provider key server-side and talks to any OpenAI-compatible
 * `/chat/completions` endpoint; the key never reaches the client.
 *
 * It is deliberately framework-agnostic. The same functions back:
 *  - the dev Vite middleware (`apps/learner-web/server/ai-route.ts`), and
 *  - a deployable handler ({@link handleAiHttpEvent} / {@link handler}) for an
 *    API Gateway route or Lambda Function URL.
 *
 * `groundedRewrite` is the "Explain it another way" route: it builds the
 * grounded prompt SERVER-SIDE (so grounding cannot be bypassed by the client),
 * calls the model, and runs the numeric grounding gate before returning — a
 * hallucinated quantity is dropped to the deterministic re-statement here,
 * before it ever leaves the server. A missing key returns 503, which the client
 * treats as its cue to fall back deterministically.
 *
 * This module is server-only. It is exported from `@mcat/ai-gateway/server`, not
 * the package root, so it is never pulled into the browser bundle.
 */

/** Minimal shape of a `fetch` Response we depend on (injectable for tests). */
export interface AiHttpResponse {
  readonly ok: boolean;
  readonly status: number;
  json(): Promise<unknown>;
  text(): Promise<string>;
}

export type AiFetch = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string },
) => Promise<AiHttpResponse>;

export interface AiProxyConfig {
  readonly apiKey?: string | undefined;
  readonly baseUrl?: string | undefined;
  readonly model?: string | undefined;
  /** Override the transport in tests; defaults to the global `fetch`. */
  readonly fetchImpl?: AiFetch | undefined;
}

/** A route result: an HTTP status plus a JSON-serialisable body. */
export interface AiRouteResult {
  readonly status: number;
  readonly json: unknown;
}

const DEFAULT_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_MODEL = 'gpt-4o-mini';

function resolveFetch(config: AiProxyConfig): AiFetch {
  const impl = config.fetchImpl ?? (globalThis.fetch as unknown as AiFetch | undefined);
  if (impl === undefined) {
    throw new Error('No fetch implementation is available for the AI route.');
  }
  return impl;
}

/**
 * One call to the upstream chat-completions endpoint. `temperature` is
 * intentionally omitted (some gateways reject it as deprecated); the extra
 * TrueFoundry headers mirror the dev proxy so a swap is transparent.
 */
async function callCompletions(
  messages: AiMessage[],
  maxOutputTokens: number,
  config: AiProxyConfig,
): Promise<AiHttpResponse> {
  const baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
  const model = config.model ?? DEFAULT_MODEL;
  return resolveFetch(config)(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${config.apiKey ?? ''}`,
      'X-TFY-METADATA': '{}',
      'X-TFY-LOGGING-CONFIG': '{"enabled": true}',
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: Math.min(maxOutputTokens, MAX_OUTPUT_TOKENS),
    }),
  });
}

function extractText(data: unknown): string {
  const choice = (data as { choices?: { message?: { content?: string } }[] } | null)?.choices?.[0];
  return choice?.message?.content ?? '';
}

function isAiMessageArray(value: unknown): value is AiMessage[] {
  return (
    Array.isArray(value) &&
    value.every(
      (entry) =>
        entry !== null &&
        typeof entry === 'object' &&
        typeof (entry as { role?: unknown }).role === 'string' &&
        typeof (entry as { content?: unknown }).content === 'string',
    )
  );
}

/**
 * Generic chat proxy (kept for the CARS Duel, which builds its own guarded
 * prompts client-side). 503 when unconfigured — the contract `HttpAiChat`
 * already understands as "unavailable".
 */
export async function proxyChat(rawBody: unknown, config: AiProxyConfig): Promise<AiRouteResult> {
  if (config.apiKey === undefined || config.apiKey.length === 0) {
    return { status: 503, json: { error: 'ai_not_configured' } };
  }
  const body = (rawBody ?? {}) as { messages?: unknown; maxOutputTokens?: unknown };
  if (!isAiMessageArray(body.messages)) {
    return { status: 400, json: { error: 'invalid_messages' } };
  }
  const messages = body.messages.slice(-20);
  const maxOutputTokens =
    typeof body.maxOutputTokens === 'number' ? body.maxOutputTokens : MAX_OUTPUT_TOKENS;
  try {
    const upstream = await callCompletions(messages, maxOutputTokens, config);
    if (!upstream.ok) {
      let detail = '';
      try {
        detail = (await upstream.text()).slice(0, 300);
      } catch {
        /* unreadable upstream body */
      }
      return { status: 502, json: { error: 'upstream_error', status: upstream.status, detail } };
    }
    return { status: 200, json: { text: extractText(await upstream.json()) } };
  } catch {
    return { status: 500, json: { error: 'proxy_failure' } };
  }
}

/** The response body of a successful grounded rewrite. */
export interface RewriteResponseBody {
  readonly text: string;
  /** True when the deterministic re-statement was substituted (grounding gate or empty output). */
  readonly fallback: boolean;
}

/**
 * The grounded "Explain it another way" route. Grounding is enforced twice: the
 * prompt is authored here from the vetted source only, and the model's answer is
 * passed through {@link sanitizeRewrite}, which swaps in the deterministic
 * re-statement if it introduces any number not in the source.
 */
export async function groundedRewrite(
  rawBody: unknown,
  config: AiProxyConfig,
): Promise<AiRouteResult> {
  const request = parseRewriteRequest(rawBody);
  if (request === null) {
    return { status: 400, json: { error: 'invalid_rewrite_request' } };
  }
  // No key: let the client fall back deterministically (it holds the same source).
  if (config.apiKey === undefined || config.apiKey.length === 0) {
    return { status: 503, json: { error: 'ai_not_configured' } };
  }
  const mode: RewriteMode = request.mode;
  const messages = buildRewriteMessages(mode, request.source);
  try {
    const upstream = await callCompletions(messages, MAX_OUTPUT_TOKENS, config);
    if (!upstream.ok) {
      return { status: 502, json: { error: 'upstream_error', status: upstream.status } };
    }
    const sanitized = sanitizeRewrite(extractText(await upstream.json()), mode, request.source);
    const body: RewriteResponseBody = { text: sanitized.text, fallback: sanitized.fallback };
    return { status: 200, json: body };
  } catch {
    return { status: 502, json: { error: 'proxy_failure' } };
  }
}

/** Read AI provider config from a process-style environment map. */
export function aiConfigFromEnv(env: Readonly<Record<string, string | undefined>>): AiProxyConfig {
  return { apiKey: env.AI_API_KEY, baseUrl: env.AI_BASE_URL, model: env.AI_MODEL };
}

/** Minimal API Gateway v2 / Function URL event shape we consume. */
export interface AiProxyHttpEvent {
  readonly rawPath?: string;
  readonly requestContext?: { readonly http?: { readonly method?: string; readonly path?: string } };
  readonly body?: string | null;
  readonly isBase64Encoded?: boolean;
}

export interface AiProxyHttpResult {
  readonly statusCode: number;
  readonly headers: Record<string, string>;
  readonly body: string;
}

function httpResult(result: AiRouteResult): AiProxyHttpResult {
  return {
    statusCode: result.status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
    body: JSON.stringify(result.json),
  };
}

/**
 * Route a decoded HTTP event to the grounded rewrite (`…/rewrite`) or the
 * generic chat proxy. Config is injected so the same code runs in a Lambda and
 * in tests.
 */
export async function handleAiHttpEvent(
  event: AiProxyHttpEvent,
  config: AiProxyConfig,
): Promise<AiProxyHttpResult> {
  const method = (event.requestContext?.http?.method ?? 'POST').toUpperCase();
  if (method !== 'POST') return httpResult({ status: 405, json: { error: 'method_not_allowed' } });
  const path = event.rawPath ?? event.requestContext?.http?.path ?? '';
  let parsed: unknown;
  try {
    const raw = event.body ?? '';
    const decoded = event.isBase64Encoded === true ? Buffer.from(raw, 'base64').toString('utf8') : raw;
    parsed = JSON.parse(decoded.length > 0 ? decoded : '{}');
  } catch {
    return httpResult({ status: 400, json: { error: 'invalid_json' } });
  }
  const route = path.endsWith('/rewrite') ? groundedRewrite : proxyChat;
  return httpResult(await route(parsed, config));
}

/**
 * Deployable Lambda entry. Point a NodejsFunction at
 * `packages/ai-gateway/src/server.ts` with `handler: 'handler'`, give it
 * `AI_API_KEY` (+ optional `AI_BASE_URL`/`AI_MODEL`), and expose it same-origin
 * (e.g. an API Gateway resource ahead of the greedy `/v1` proxy). Kept VPC-free
 * so it has the public egress the isolated learner-API subnet lacks.
 */
export async function handler(event: AiProxyHttpEvent): Promise<AiProxyHttpResult> {
  return handleAiHttpEvent(event, aiConfigFromEnv(process.env));
}
