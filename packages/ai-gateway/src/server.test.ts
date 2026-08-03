import { describe, expect, it, vi } from 'vitest';
import {
  aiConfigFromEnv,
  groundedRewrite,
  proxyChat,
  type AiFetch,
  type AiHttpResponse,
  type RewriteResponseBody,
} from './server';
import { MAX_CHAT_INPUT_CHARS } from './port';

const source = {
  rationale: 'The buffer resists pH change because the weak acid and its conjugate base absorb added H+.',
  choiceRationales: { C: 'C confuses buffering with neutralization.' },
};

function okResponse(content: string): AiHttpResponse {
  return {
    ok: true,
    status: 200,
    json: async () => ({ choices: [{ message: { content } }] }),
    text: async () => content,
  };
}

/** A mock gateway that records the exact request body it was handed. */
function recordingFetch(content: string): { fetchImpl: AiFetch; bodies: string[] } {
  const bodies: string[] = [];
  const fetchImpl: AiFetch = async (_url, init) => {
    bodies.push(init.body);
    return okResponse(content);
  };
  return { fetchImpl, bodies };
}

describe('groundedRewrite (production route)', () => {
  it('is grounded: it sends the model only the source and returns a clean re-wording', async () => {
    const { fetchImpl, bodies } = recordingFetch('Put another way: the buffer soaks up added acid.');
    const result = await groundedRewrite(
      { questionId: 'q-1', mode: 'example', source },
      { apiKey: 'k', fetchImpl },
    );

    expect(result.status).toBe(200);
    expect((result.json as RewriteResponseBody).fallback).toBe(false);
    expect((result.json as RewriteResponseBody).text).toContain('soaks up added acid');

    // The only content facts sent to the gateway come from the source rationale.
    const sent = JSON.parse(bodies[0]!) as { messages: { role: string; content: string }[] };
    const payload = sent.messages.map((m) => m.content).join('\n');
    expect(payload).toContain(source.rationale);
    expect(payload).toContain(source.choiceRationales.C);
    expect(payload.toLowerCase()).toContain('do not add facts');
    // No fact source other than what we passed in leaked into the prompt.
    expect(payload).not.toContain('q-1');
  });

  it('drops a hallucinated number back to the deterministic re-statement', async () => {
    const numericSource = { rationale: 'Doubling the substrate doubles the rate for a first-order step.' };
    const { fetchImpl } = recordingFetch('Doubling substrate raises the rate by 87% per second.');
    const result = await groundedRewrite(
      { questionId: 'q-2', mode: 'example', source: numericSource },
      { apiKey: 'k', fetchImpl },
    );
    const body = result.json as RewriteResponseBody;
    expect(result.status).toBe(200);
    expect(body.fallback).toBe(true);
    // The invented "87" is gone; only the source text survives.
    expect(body.text).not.toContain('87');
    expect(body.text).toContain('Doubling the substrate doubles the rate');
  });

  it('drops a fabricated named entity back to the deterministic re-statement', async () => {
    // The model invents a law/entity the source never mentioned; the route must
    // strip it to the grounded re-statement rather than surface the fabrication.
    const { fetchImpl } = recordingFetch('This is really just the Krebs Cycle in disguise.');
    const result = await groundedRewrite(
      { questionId: 'q-3', mode: 'example', source },
      { apiKey: 'k', fetchImpl },
    );
    const body = result.json as RewriteResponseBody;
    expect(result.status).toBe(200);
    expect(body.fallback).toBe(true);
    expect(body.text).not.toContain('Krebs');
    expect(body.text).toContain(source.rationale);
  });

  it('returns 503 when no key is configured (client falls back)', async () => {
    const result = await groundedRewrite({ questionId: 'q-1', mode: 'example', source }, { apiKey: '' });
    expect(result.status).toBe(503);
  });

  it('maps an upstream failure to 502', async () => {
    const fetchImpl: AiFetch = async () => ({
      ok: false,
      status: 500,
      json: async () => ({}),
      text: async () => 'boom',
    });
    const result = await groundedRewrite(
      // A valid step gate so this reaches the upstream path (steps is gated below).
      { questionId: 'q-1', mode: 'steps', source, gate: { skill: 'QUANTIFY', section: null, dok: null } },
      { apiKey: 'k', fetchImpl },
    );
    expect(result.status).toBe(502);
  });

  it('rejects a malformed body with 400 and never calls the gateway', async () => {
    const fetchImpl = vi.fn<AiFetch>();
    const result = await groundedRewrite({ questionId: 'q-1', mode: 'bogus' }, { apiKey: 'k', fetchImpl });
    expect(result.status).toBe(400);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('enforces the step gate server-side: refuses steps for an ineligible item', async () => {
    const fetchImpl = vi.fn<AiFetch>();
    const result = await groundedRewrite(
      // Low-DOK, non-QUANTIFY, non-C/P: the client hides the button, and the route
      // refuses it too rather than trusting a client that asks for steps anyway.
      { questionId: 'q-1', mode: 'steps', source, gate: { skill: 'IDENTIFY', section: 'bb', dok: 1 } },
      { apiKey: 'k', fetchImpl },
    );
    expect(result.status).toBe(400);
    expect((result.json as { error: string }).error).toBe('steps_not_available');
    // The gate check runs before the model call, so no provider spend is incurred.
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('refuses steps when the gate is omitted, but example needs no gate', async () => {
    const noGate = vi.fn<AiFetch>();
    const steps = await groundedRewrite(
      { questionId: 'q-1', mode: 'steps', source },
      { apiKey: 'k', fetchImpl: noGate },
    );
    expect(steps.status).toBe(400);
    expect(noGate).not.toHaveBeenCalled();

    // Example is always allowed — an omitted gate still reaches the model.
    const { fetchImpl } = recordingFetch('Put another way: the buffer soaks up acid.');
    const example = await groundedRewrite(
      { questionId: 'q-1', mode: 'example', source },
      { apiKey: 'k', fetchImpl },
    );
    expect(example.status).toBe(200);
  });
});

describe('proxyChat (generic route, e.g. CARS Duel)', () => {
  it('returns 503 when unconfigured', async () => {
    expect((await proxyChat({ messages: [] }, {})).status).toBe(503);
  });

  it('proxies a valid message list', async () => {
    const { fetchImpl } = recordingFetch('hello');
    const result = await proxyChat(
      { messages: [{ role: 'user', content: 'hi' }] },
      { apiKey: 'k', fetchImpl },
    );
    expect(result.status).toBe(200);
    expect(result.json).toEqual({ text: 'hello' });
  });

  it('rejects a non-message body', async () => {
    expect((await proxyChat({ messages: 'nope' }, { apiKey: 'k' })).status).toBe(400);
  });

  it('rejects an oversize message list with 400 before the provider is called', async () => {
    let providerCalls = 0;
    const countingFetch: AiFetch = async () => {
      providerCalls += 1;
      return okResponse('nope');
    };
    const result = await proxyChat(
      { messages: [{ role: 'user', content: 'x'.repeat(MAX_CHAT_INPUT_CHARS + 1) }] },
      { apiKey: 'k', fetchImpl: countingFetch },
    );
    expect(result.status).toBe(400);
    expect(providerCalls).toBe(0);
  });

  it('maps a transport failure to 502 (never 500) so the client degrades to offline', async () => {
    const throwingFetch: AiFetch = async () => {
      throw new Error('ECONNREFUSED');
    };
    const result = await proxyChat(
      { messages: [{ role: 'user', content: 'hi' }] },
      { apiKey: 'k', fetchImpl: throwingFetch },
    );
    expect(result.status).toBe(502);
    expect((result.json as { error: string }).error).toBe('proxy_failure');
  });
});

describe('aiConfigFromEnv', () => {
  it('reads provider settings from the environment', () => {
    expect(aiConfigFromEnv({ AI_API_KEY: 'k', AI_MODEL: 'm' })).toEqual({
      apiKey: 'k',
      baseUrl: undefined,
      model: 'm',
    });
  });
});
