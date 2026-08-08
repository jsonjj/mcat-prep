import { parseChatRequest, type AiMessage } from './port';
import { MAX_OUTPUT_TOKENS } from './cars';
import {
  buildRewriteMessages,
  canStepByStep,
  parseRewriteRequest,
  sanitizeRewrite,
  type RewriteMode,
} from './rewrite';

/**
 * Server-side AI route primitives. They hold the provider key server-side and
 * talk to any OpenAI-compatible `/chat/completions` endpoint; the key never
 * reaches the client.
 *
 * `groundedRewrite` is the "Explain it another way" route (WS4). It builds the
 * grounded prompt SERVER-SIDE (so grounding cannot be bypassed by the client),
 * calls the model, and runs the numeric grounding gate before returning — a
 * hallucinated quantity is dropped to the deterministic re-statement here,
 * before it ever leaves the server. A missing key returns 503, which the client
 * treats as its cue to fall back deterministically. In production it is invoked
 * IN-PROCESS by the learner-API (`POST /v1/ai/rewrite`), so it inherits that
 * service's session authorizer, `x-mcat-origin-verify`, rate limiter, and WAF —
 * there is no separate public AI Lambda or Function URL.
 *
 * `proxyChat` is the generic chat proxy behind the CARS Duel opponent. It builds
 * no prompt of its own — the client authors the guarded CARS prompts (see
 * `cars.ts`) — so it forwards a bounded, recent message list to the model. It is
 * served same-origin at `/v1/ai/chat`: in production IN-PROCESS by the
 * learner-API (behind that service's session authorizer, `x-mcat-origin-verify`,
 * per-session rate limiter, and WAF, exactly like grounded rewrite) and locally
 * by the dev-server middleware, so dev and prod share one core. Because it
 * forwards caller-supplied messages it must ONLY be mounted behind that
 * authenticated, rate-limited seam — never as an open, unauthenticated route
 * (which would re-open the arbitrary-message denial-of-wallet vector). It caps
 * both the number of forwarded messages and their combined size (see
 * `parseChatRequest`) so a single authenticated turn cannot inflate provider
 * spend, and a missing key returns 503 — the "opponent offline" signal the
 * client already degrades on.
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

/**
 * Log a thrown transport error (not an HTTP status) with its underlying cause.
 * `fetch` rejections carry the real reason (e.g. `ECONNREFUSED` from a stale
 * `HTTP(S)_PROXY`) on `err.cause`; without this the route only ever emits an
 * opaque `proxy_failure`. Never logs the request body or the API key.
 */
function logTransportError(where: string, err: unknown): void {
  const detail =
    err instanceof Error
      ? { name: err.name, message: err.message, cause: (err as { cause?: unknown }).cause }
      : { value: String(err) };
  console.error(`[ai-gateway] ${where} transport error`, detail);
}

/**
 * Generic chat proxy — the CARS Duel opponent. Served same-origin at
 * `/v1/ai/chat`, in production in-process by the learner-API (behind its session
 * authorizer, `x-mcat-origin-verify`, per-session rate limiter, and WAF) and
 * locally by the dev-server middleware, so dev and prod share one core. The
 * client authors the guarded CARS prompts; this only forwards a bounded, recent
 * message list ({@link parseChatRequest} caps both the count and the combined
 * size, so an oversize turn is rejected with 400 before any provider spend). A
 * malformed body is 400; a missing key is 503 — the "opponent offline" signal
 * the `HttpAiChat` contract already degrades on; a transport failure is 502
 * (never a 500), like {@link groundedRewrite}. Because it forwards
 * caller-supplied messages it must ONLY be mounted behind that authenticated,
 * rate-limited seam.
 */
export async function proxyChat(rawBody: unknown, config: AiProxyConfig): Promise<AiRouteResult> {
  // Validate + size-cap the SHAPE FIRST (like groundedRewrite), so a malformed or
  // oversize body is refused before the key check and before any provider spend.
  const request = parseChatRequest(rawBody);
  if (request === null) {
    return { status: 400, json: { error: 'invalid_messages' } };
  }
  // No key: the "opponent offline" signal the client already degrades on.
  if (config.apiKey === undefined || config.apiKey.length === 0) {
    return { status: 503, json: { error: 'ai_not_configured' } };
  }
  const maxOutputTokens = request.maxOutputTokens ?? MAX_OUTPUT_TOKENS;
  try {
    const upstream = await callCompletions(request.messages, maxOutputTokens, config);
    if (!upstream.ok) {
      let detail = '';
      try {
        detail = (await upstream.text()).slice(0, 500);
      } catch {
        /* unreadable upstream body */
      }
      // Log the provider's failure body SERVER-SIDE ONLY. It can name the budget,
      // the model, and the account email tied to the key — internal details that
      // must never reach the learner's browser — so the client is handed the status
      // alone (mirrors groundedRewrite). The client already degrades to "opponent
      // offline" on any 5xx.
      console.error('[ai-gateway] proxyChat upstream error', { status: upstream.status, detail });
      return { status: 502, json: { error: 'upstream_error', status: upstream.status } };
    }
    return { status: 200, json: { text: extractText(await upstream.json()) } };
  } catch (err) {
    // The transport threw (DNS, TLS, a dead HTTP(S)_PROXY -> ECONNREFUSED, etc.),
    // not an HTTP status. Map it to 502 like groundedRewrite (never a 500, which
    // would read as a server bug): the client shows the opponent as offline. The
    // key is never part of the error.
    logTransportError('proxyChat', err);
    return { status: 502, json: { error: 'proxy_failure' } };
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
  const mode: RewriteMode = request.mode;
  // Enforce the "Step by step" gate SERVER-SIDE, not only by the client hiding the
  // button: a worked, segmented walk is offered only where it pays off (QUANTIFY /
  // C-P / DOK >= 2). A client that requests `steps` for an ineligible item — or omits
  // the gate entirely — is refused here rather than trusted. `example` has no gate.
  if (
    mode === 'steps' &&
    !canStepByStep(request.gate ?? { skill: null, section: null, dok: null })
  ) {
    return { status: 400, json: { error: 'steps_not_available' } };
  }
  // No key: let the client fall back deterministically (it holds the same source).
  if (config.apiKey === undefined || config.apiKey.length === 0) {
    return { status: 503, json: { error: 'ai_not_configured' } };
  }
  const messages = buildRewriteMessages(mode, request.source);
  try {
    const upstream = await callCompletions(messages, MAX_OUTPUT_TOKENS, config);
    if (!upstream.ok) {
      let detail = '';
      try {
        detail = (await upstream.text()).slice(0, 500);
      } catch {
        /* unreadable upstream body */
      }
      // Same containment as proxyChat: the provider body stays in server logs; the
      // client only learns the status (and falls back to the deterministic re-statement).
      console.error('[ai-gateway] groundedRewrite upstream error', {
        status: upstream.status,
        detail,
      });
      return { status: 502, json: { error: 'upstream_error', status: upstream.status } };
    }
    const sanitized = sanitizeRewrite(extractText(await upstream.json()), mode, request.source);
    const body: RewriteResponseBody = { text: sanitized.text, fallback: sanitized.fallback };
    return { status: 200, json: body };
  } catch (err) {
    logTransportError('groundedRewrite', err);
    return { status: 502, json: { error: 'proxy_failure' } };
  }
}

/** Read AI provider config from a process-style environment map. */
export function aiConfigFromEnv(env: Readonly<Record<string, string | undefined>>): AiProxyConfig {
  return { apiKey: env.AI_API_KEY, baseUrl: env.AI_BASE_URL, model: env.AI_MODEL };
}

// NOTE: There is intentionally no deployable HTTP-event adapter / Lambda entry
// here, and no standalone public AI Function URL. Both AI routes are served
// IN-PROCESS by the learner-API (see services/lambdas/learner-api) behind its
// session authorizer, `x-mcat-origin-verify`, per-session rate limiter, and WAF:
// grounded rewrite at `POST /v1/ai/rewrite` (-> groundedRewrite) and the CARS
// Duel opponent at `POST /v1/ai/chat` (-> proxyChat). Mounting `proxyChat` as a
// standalone unauthenticated route would re-open the arbitrary-message
// denial-of-wallet vector, so it exists ONLY behind that authenticated seam (and
// the matching dev middleware). The dev server mirrors the same two routes.
