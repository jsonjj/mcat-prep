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
