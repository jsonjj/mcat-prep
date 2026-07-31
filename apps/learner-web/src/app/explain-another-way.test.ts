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

  it('caches separately by source surface for the same question + form', async () => {
    // Practice/Study open with the correct-answer rationale; Mistakes opens the
    // same question + form with the distractor refutation. They must not collide.
    const correctSurface = { rationale: 'Correct: no net force means no acceleration.' };
    const mistakeSurface = { rationale: 'Why B is wrong: it confuses velocity with acceleration.' };
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
      const posted = JSON.parse(init.body as string) as { source: { rationale: string } };
      return jsonResponse(200, { text: `Reworded: ${posted.source.rationale}`, fallback: false });
    });

    const fromCorrect = await requestRewrite({
      questionId: 'q9',
      mode: 'example',
      source: correctSurface,
      endpoint: '/x',
      fetchImpl,
    });
    const fromMistake = await requestRewrite({
      questionId: 'q9',
      mode: 'example',
      source: mistakeSurface,
      endpoint: '/x',
      fetchImpl,
    });

    // Two distinct fetches (no collision), and each reflects its own surface.
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fromCorrect.text).toContain('no net force');
    expect(fromMistake.text).toContain('B is wrong');
    expect(fromMistake.text).not.toEqual(fromCorrect.text);

    // A repeat of the first surface is still served from cache (no third fetch).
    await requestRewrite({
      questionId: 'q9',
      mode: 'example',
      source: correctSurface,
      endpoint: '/x',
      fetchImpl,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('falls back deterministically on a 503 / missing key', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(503, { error: 'ai_not_configured' }));
    const result = await requestRewrite({ questionId: 'q2', mode: 'example', source, endpoint: '/x', fetchImpl });
    expect(result.fallback).toBe(true);
    expect(result.text).toContain(source.rationale);
  });

  it('does NOT cache a transient failure: a later call can still succeed', async () => {
    // A transient error must not pin the fallback for the rest of the session. The
    // first call 503s → fallback; the second call, once the route recovers, must
    // re-request and return the real grounded rewrite rather than a cached fallback.
    const fetchImpl = vi
      .fn<(url: string, init: RequestInit) => Promise<Response>>()
      .mockResolvedValueOnce(jsonResponse(503, { error: 'ai_not_configured' }))
      .mockResolvedValueOnce(jsonResponse(200, { text: 'Put simply: no acceleration.', fallback: false }));

    const first = await requestRewrite({ questionId: 'q5', mode: 'example', source, endpoint: '/x', fetchImpl });
    expect(first.fallback).toBe(true);

    const second = await requestRewrite({ questionId: 'q5', mode: 'example', source, endpoint: '/x', fetchImpl });
    expect(second.fallback).toBe(false);
    expect(second.text).toContain('no acceleration');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
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
