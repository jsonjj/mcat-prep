import { AiUnavailableError, type AiChat, type AiChatRequest, type AiChatResult } from './port';
import { MAX_OUTPUT_TOKENS } from './cars';

export interface HttpAiChatOptions {
  /** Same-origin proxy endpoint that holds the provider key server-side. */
  endpoint: string;
}

/**
 * Talks to a same-origin proxy (dev middleware now, API Gateway later). The proxy
 * owns the provider key; this client never sees it. 404/503 map to a clean
 * "unavailable" signal so the UI can degrade gracefully.
 */
export class HttpAiChat implements AiChat {
  constructor(private readonly opts: HttpAiChatOptions) {}

  async chat(req: AiChatRequest): Promise<AiChatResult> {
    let res: Response;
    try {
      res = await fetch(this.opts.endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          messages: req.messages,
          maxOutputTokens: Math.min(req.maxOutputTokens ?? MAX_OUTPUT_TOKENS, MAX_OUTPUT_TOKENS),
          temperature: req.temperature ?? 0.7,
        }),
      });
    } catch {
      throw new AiUnavailableError('Could not reach the AI service');
    }
    if (res.status === 404 || res.status === 503) {
      throw new AiUnavailableError();
    }
    if (!res.ok) {
      throw new Error(`AI request failed (${res.status})`);
    }
    const data = (await res.json()) as { text?: string };
    return { text: data.text ?? '' };
  }
}
