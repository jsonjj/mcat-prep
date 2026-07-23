import { describe, expect, it } from 'vitest';
import { AcceptedCommandResponseSchema, GoalCommandSchema } from '@mcat/contracts';
import { ApiClientError, HttpAuthorityClient, MemorySession } from './http';

const bootstrapResponse = {
  learnerId: '11111111-1111-4111-8111-111111111111',
  accountState: 'guest',
  bankStatus: 'loaded',
  contentRelease: 'synthetic-2026.07',
  apiVersion: 'v1',
  onboardingComplete: false,
  serverTime: '2026-07-22T00:00:00.000Z',
  streamVersion: 7,
  csrfToken: 'csrf-token-with-at-least-32-characters',
};

const apiError = {
  code: 'stream_conflict',
  message: 'The learner stream changed.',
  requestId: 'request-123',
  retryable: false,
  currentStreamVersion: 8,
};

describe('HttpAuthorityClient', () => {
  it('sends credentials and validates the bootstrap response contract', async () => {
    const calls: RequestInit[] = [];
    const client = new HttpAuthorityClient({
      baseUrl: 'https://api.example.test/',
      fetch: async (_url, init) => {
        calls.push(init ?? {});
        return Response.json(bootstrapResponse);
      },
    });

    const result = await client.bootstrap();

    expect(calls[0]?.credentials).toBe('include');
    expect(result).not.toHaveProperty('csrfToken');
    expect(result).not.toHaveProperty('streamVersion');
    expect(result.learnerId).toBe(bootstrapResponse.learnerId);
  });

  it('maps structured API errors without exposing response bodies', async () => {
    const client = new HttpAuthorityClient({
      baseUrl: 'https://api.example.test',
      fetch: async () => Response.json(apiError, { status: 409 }),
    });

    await expect(client.bootstrap()).rejects.toMatchObject({
      name: 'ApiClientError',
      code: 'stream_conflict',
      requestId: 'request-123',
      currentStreamVersion: 8,
    });
  });

  it('replaces malformed error bodies with a safe structured client error', async () => {
    const secretBody = { secretAnswer: 'do-not-expose-this-value' };
    const client = new HttpAuthorityClient({
      baseUrl: 'https://api.example.test',
      fetch: async () => Response.json(secretBody, { status: 500 }),
    });

    const error = await client.bootstrap().catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiClientError);
    expect(error).toMatchObject({ code: 'unavailable', retryable: true });
    expect(String(error)).not.toContain(secretBody.secretAnswer);
    expect(error).not.toHaveProperty('body');
    expect(error).not.toHaveProperty('response');
  });

  it('keeps tokens in memory and sends authorization and CSRF headers', async () => {
    const session = new MemorySession();
    session.setAccessToken('short-lived-access-token');
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const client = new HttpAuthorityClient({
      baseUrl: 'https://api.example.test',
      session,
      fetch: async (url, init) => {
        const request = { url: String(url), init: init ?? {} };
        calls.push(request);
        if (request.url.endsWith('/v1/bootstrap')) return Response.json(bootstrapResponse);

        const command = GoalCommandSchema.parse(JSON.parse(String(request.init.body)));
        return Response.json(
          AcceptedCommandResponseSchema.parse({
            eventId: command.envelope.eventId,
            sequence: 8,
            streamVersion: 8,
            acceptedAt: '2026-07-22T00:00:01.000Z',
          }),
        );
      },
    });

    await client.bootstrap();
    await client.confirmPlan({ testDate: null, targetScore: 511, minutesPerWeek: 420 });

    const bootstrapHeaders = new Headers(calls[0]?.init.headers);
    const goalHeaders = new Headers(calls[1]?.init.headers);
    expect(bootstrapHeaders.get('authorization')).toBe('Bearer short-lived-access-token');
    expect(goalHeaders.get('x-csrf-token')).toBe(bootstrapResponse.csrfToken);
    expect(goalHeaders.get('content-type')).toBe('application/json');
    expect(session.getCsrfToken()).toBe(bootstrapResponse.csrfToken);

    const command = JSON.parse(String(calls[1]?.init.body)) as Record<string, unknown>;
    expect(command).not.toHaveProperty('learnerId');
    expect(command.envelope).toMatchObject({
      expectedStreamVersion: 7,
      contentRelease: bootstrapResponse.contentRelease,
    });
  });

  it('rejects a successful response that violates its strict wire schema', async () => {
    const client = new HttpAuthorityClient({
      baseUrl: 'https://api.example.test',
      fetch: async () => Response.json({ ...bootstrapResponse, protectedKey: 'A' }),
    });

    await expect(client.bootstrap()).rejects.toMatchObject({ name: 'ZodError' });
  });
});
