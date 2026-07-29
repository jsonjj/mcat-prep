import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearRewriteCache, requestRewrite } from './explain-another-way';

const source = { rationale: 'The net force is zero, so the acceleration is zero.' };

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

afterEach(() => clearRewriteCache());

describe('requestRewrite', () => {
  it('caches per (question_id, form): a repeat call makes no second request', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(200, { text: 'Put simply: no net force means no acceleration.', fallback: false }),
    );
    const first = await requestRewrite({ questionId: 'q1', mode: 'example', source, endpoint: '/x', fetchImpl });
    const second = await requestRewrite({ questionId: 'q1', mode: 'example', source, endpoint: '/x', fetchImpl });

    expect(second).toEqual(first);
    expect(first.fallback).toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    // A different form for the same question is a separate cache entry.
    await requestRewrite({ questionId: 'q1', mode: 'steps', source, endpoint: '/x', fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('falls back deterministically on a 503 / missing key', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(503, { error: 'ai_not_configured' }));
    const result = await requestRewrite({ questionId: 'q2', mode: 'example', source, endpoint: '/x', fetchImpl });
    expect(result.fallback).toBe(true);
    expect(result.text).toContain(source.rationale);
  });

  it('falls back when the route is unreachable (network error / prod SPA HTML)', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('network');
    });
    const result = await requestRewrite({ questionId: 'q3', mode: 'steps', source, endpoint: '/x', fetchImpl });
    expect(result.fallback).toBe(true);
    expect(result.text).toMatch(/^1\. /m);
  });

  it('re-grounds server output client-side, dropping an ungrounded number', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(200, { text: 'No net force, so the acceleration is 9.8 m/s^2.', fallback: false }),
    );
    const result = await requestRewrite({ questionId: 'q4', mode: 'example', source, endpoint: '/x', fetchImpl });
    expect(result.fallback).toBe(true);
    expect(result.text).not.toContain('9.8');
  });
});
