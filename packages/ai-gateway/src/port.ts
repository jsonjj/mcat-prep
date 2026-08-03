/**
 * Provider-agnostic chat port. Concrete transports (an HTTP proxy in dev, an API
 * Gateway route in production) implement `AiChat`. The key never lives client-side.
 */
export type AiRole = 'system' | 'user' | 'assistant';

export interface AiMessage {
  role: AiRole;
  content: string;
}

export interface AiChatRequest {
  messages: AiMessage[];
  maxOutputTokens?: number;
  temperature?: number;
}

export interface AiChatResult {
  text: string;
}

export interface AiChat {
  chat(req: AiChatRequest): Promise<AiChatResult>;
}

/** Thrown when the AI backend is not configured/available (e.g., no key in dev, no backend in prod). */
export class AiUnavailableError extends Error {
  constructor(message = 'AI is not configured') {
    super(message);
    this.name = 'AiUnavailableError';
  }
}

/** Only the most recent turns matter for a duel, so older messages are dropped. */
export const MAX_CHAT_MESSAGES = 20;

/**
 * Upper bound on the combined characters of the (already count-capped) message
 * list a single chat turn may forward to the paid model. The CARS Duel client
 * builds its own bounded prompts (a system prompt plus a few short turns, capped
 * at `MAX_ROUNDS`), so a few tens of thousands of characters is ample. Capping it
 * here bounds the prompt the server will build — an oversize turn is rejected
 * outright rather than forwarded — which closes a cheap way to inflate provider
 * spend on the authenticated `/v1/ai/chat` route, mirroring the rewrite route's
 * `MAX_REWRITE_SOURCE_CHARS`.
 */
export const MAX_CHAT_INPUT_CHARS = 24_000;

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
 * A validated chat turn: the recent, size-capped messages plus an optional output
 * cap. Distinct from {@link AiChatRequest} (the client-facing request, which also
 * carries `temperature`): this is the server-parsed shape the proxy forwards,
 * paralleling the rewrite route's `RewriteRequest`.
 */
export interface ChatRequest {
  readonly messages: AiMessage[];
  readonly maxOutputTokens?: number;
}

/**
 * Parse an untrusted wire body into a {@link ChatRequest}, or null. Used by BOTH
 * the production route (as the body schema) and the {@link AiChat} proxy so dev
 * and prod validate identically. Only the message list's shape and size are
 * checked here: it keeps the most recent {@link MAX_CHAT_MESSAGES} messages and
 * rejects a body whose combined content exceeds {@link MAX_CHAT_INPUT_CHARS}
 * (before any provider spend). Unknown fields (e.g. `temperature`) are ignored.
 * An empty message array is intentionally allowed (the key check decides it).
 */
export function parseChatRequest(raw: unknown): ChatRequest | null {
  if (raw === null || typeof raw !== 'object') return null;
  const body = raw as { messages?: unknown; maxOutputTokens?: unknown };
  if (!isAiMessageArray(body.messages)) return null;
  const messages = body.messages.slice(-MAX_CHAT_MESSAGES);
  const totalChars = messages.reduce((sum, message) => sum + message.content.length, 0);
  if (totalChars > MAX_CHAT_INPUT_CHARS) return null;
  const maxOutputTokens =
    typeof body.maxOutputTokens === 'number' && Number.isFinite(body.maxOutputTokens)
      ? body.maxOutputTokens
      : undefined;
  return maxOutputTokens === undefined ? { messages } : { messages, maxOutputTokens };
}
