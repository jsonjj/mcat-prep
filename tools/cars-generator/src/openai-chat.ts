/**
 * Direct provider client for CLI use.
 *
 * The `HttpAiChat` transport in `@mcat/ai-gateway` deliberately talks to a same-origin
 * proxy so a browser never holds a provider key. A CLI has no such constraint — it runs
 * on the operator's machine and reads the key from the environment — so it needs its own
 * adapter against the same `AiChat` port. Everything downstream is transport-agnostic.
 *
 * Works with any OpenAI-compatible `/chat/completions` endpoint, matching the
 * convention already used by the dev middleware.
 */

import { AiUnavailableError, type AiChat, type AiChatRequest, type AiChatResult } from '@mcat/ai-gateway';

export interface OpenAiChatOptions {
  readonly apiKey: string;
  readonly baseUrl: string;
  readonly model: string;
}

export class OpenAiChat implements AiChat {
  constructor(private readonly opts: OpenAiChatOptions) {
    if (!opts.apiKey) throw new AiUnavailableError('AI_API_KEY is not set');
  }

  get model(): string {
    return this.opts.model;
  }

  async chat(req: AiChatRequest): Promise<AiChatResult> {
    const response = await fetch(`${this.opts.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.opts.apiKey}`,
      },
      body: JSON.stringify({
        model: this.opts.model,
        messages: req.messages,
        temperature: req.temperature ?? 0.7,
        max_completion_tokens: req.maxOutputTokens ?? 2000,
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`${this.opts.model} request failed (${response.status}): ${detail.slice(0, 400)}`);
    }

    const body = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    return { text: body.choices?.[0]?.message?.content ?? '' };
  }
}
