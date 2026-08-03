import { AiUnavailableError, type AiChat, type AiChatRequest, type AiChatResult } from './port';
import { MAX_OUTPUT_TOKENS } from './cars';

export interface HttpAiChatOptions {
  /** Same-origin proxy endpoint that holds the provider key server-side. */
  endpoint: string;
}

/**
 * Talks to a same-origin route that owns the provider key (the learner-API
 * `/v1/ai/chat` in prod; the Vite dev middleware locally) — this client never
 * sees the key. 404/503 map to a clean "unavailable" signal so the UI can degrade
 * gracefully (CARS Duel shows the opponent as offline). Messages are kept
 * environment-neutral since they surface to the learner in both dev and prod.
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
      throw new AiUnavailableError('Could not reach the AI opponent');
    }
    if (res.status === 503) {
      throw new AiUnavailableError('The AI opponent is not configured');
    }
    if (res.status === 404) {
      throw new AiUnavailableError('The AI opponent endpoint was not found');
    }
    if (!res.ok) {
      let detail = '';
      try {
        const body = (await res.json()) as { error?: string; status?: number; detail?: string };
        if (body?.error) {
          detail = ` — ${body.error}${body.status ? ` (${body.status})` : ''}${body.detail ? `: ${body.detail}` : ''}`;
        }
      } catch {
        /* non-JSON error body */
      }
      throw new Error(`Gateway request failed (${res.status})${detail}`);
    }
    const data = (await res.json()) as { text?: string };
    return { text: data.text ?? '' };
  }
}
