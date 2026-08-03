import { describe, expect, it } from 'vitest';
import { AcceptedCommandResponseSchema, GoalCommandSchema } from '@mcat/contracts';
import { ApiClientError, HttpAuthorityClient, MemorySession, isUnauthenticatedError } from './http';

const bootstrapResponse = {
  authenticated: true,
  learnerId: '11111111-1111-4111-8111-111111111111',
  accountState: 'linked',
  bankStatus: 'loaded',
  contentRelease: 'synthetic-2026.07',
  apiVersion: 'v1',
  onboardingComplete: false,
  serverTime: '2026-07-22T00:00:00.000Z',
  streamVersion: 7,
  csrfToken: 'csrf-token-with-at-least-32-characters',
};

const anonymousBootstrapResponse = {
  authenticated: false,
  apiVersion: 'v1',
  serverTime: '2026-07-22T00:00:00.000Z',
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
    expect(result.authenticated).toBe(true);
    if (!result.authenticated) throw new Error('expected an authenticated bootstrap');
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

describe('signed-out client behaviour', () => {
  it('reports a signed-out bootstrap without learner fields', async () => {
    const client = new HttpAuthorityClient({
      baseUrl: 'https://api.example.test',
      fetch: async () => Response.json(anonymousBootstrapResponse),
    });

    const result = await client.bootstrap();

    expect(result.authenticated).toBe(false);
    expect(result).not.toHaveProperty('learnerId');
  });

  it('keeps the signed-out CSRF token so a credential call is same-site', async () => {
    const session = new MemorySession();
    const client = new HttpAuthorityClient({
      baseUrl: 'https://api.example.test',
      session,
      fetch: async () => Response.json(anonymousBootstrapResponse),
    });

    await client.bootstrap();

    expect(session.getCsrfToken()).toBe(anonymousBootstrapResponse.csrfToken);
  });

  it('fails a learner read as unauthenticated rather than calling the route', async () => {
    const paths: string[] = [];
    const client = new HttpAuthorityClient({
      baseUrl: 'https://api.example.test',
      fetch: async (url) => {
        paths.push(new URL(String(url)).pathname);
        return Response.json(anonymousBootstrapResponse);
      },
    });

    await expect(client.getToday()).rejects.toMatchObject({
      name: 'ApiClientError',
      code: 'unauthorized',
    });
    expect(paths).toEqual(['/v1/bootstrap']);
  });

  it('classifies both server and client unauthenticated failures the same way', async () => {
    const client = new HttpAuthorityClient({
      baseUrl: 'https://api.example.test',
      fetch: async () => Response.json(anonymousBootstrapResponse),
    });

    const clientSide = await client.getToday().catch((error: unknown) => error);
    const serverSide = ApiClientError.from({
      code: 'unauthorized',
      message: 'A valid learner session is required.',
      requestId: 'request-9',
      retryable: false,
    });

    expect(isUnauthenticatedError(clientSide)).toBe(true);
    expect(isUnauthenticatedError(serverSide)).toBe(true);
    expect(isUnauthenticatedError(new Error('network'))).toBe(false);
  });

  it('bootstraps for a CSRF token before the first exchange attempt', async () => {
    const paths: string[] = [];
    const client = new HttpAuthorityClient({
      baseUrl: 'https://api.example.test',
      fetch: async (url) => {
        const path = new URL(String(url)).pathname;
        paths.push(path);
        return path === '/v1/bootstrap'
          ? Response.json(anonymousBootstrapResponse)
          : Response.json({ status: 'signed_in', csrfToken: bootstrapResponse.csrfToken });
      },
    });

    await client.exchangeSession('header.payload.signature');

    expect(paths).toEqual(['/v1/bootstrap', '/v1/auth/session']);
  });

  it('sends the Supabase token in the body, never in the URL', async () => {
    const urls: string[] = [];
    const client = new HttpAuthorityClient({
      baseUrl: 'https://api.example.test',
      session: signedOutSessionWithToken(),
      fetch: async (url) => {
        urls.push(String(url));
        return Response.json({ status: 'signed_in', csrfToken: bootstrapResponse.csrfToken });
      },
    });

    await client.exchangeSession('header.payload.signature');

    expect(urls).toEqual(['https://api.example.test/v1/auth/session']);
    // A token in a URL would land in access logs, proxy logs, and Referer headers.
    expect(urls.join()).not.toContain('header.payload.signature');
  });

  it('drops the local session on sign-out even when the server call fails', async () => {
    const session = signedOutSessionWithToken();
    const client = new HttpAuthorityClient({
      baseUrl: 'https://api.example.test',
      session,
      fetch: async () =>
        Response.json(
          {
            code: 'unavailable',
            message: 'nope',
            requestId: 'request-1',
            retryable: true,
          },
          { status: 503 },
        ),
    });

    await expect(client.signOut()).rejects.toMatchObject({ name: 'ApiClientError' });

    expect(session.getCsrfToken()).toBeNull();
  });
});

describe('passage of the day (formative)', () => {
  const passageView = {
    id: 'p1',
    title: 'A short read',
    discipline: 'Aesthetics',
    body: ['Paragraph one.'],
    questions: [
      {
        id: 'p1-q1',
        stem: 'What follows?',
        choices: [
          { id: 'A', text: 'a' },
          { id: 'B', text: 'b' },
          { id: 'C', text: 'c' },
          { id: 'D', text: 'd' },
        ],
      },
    ],
    dayIndex: 0,
    poolSize: 12,
    localDate: '2026-08-03',
  };
  const grade = {
    correct: false,
    correctChoiceId: 'B',
    rationale: 'Because B.',
    choiceRationale: 'A over-reads the passage.',
  };

  it('reads the day’s passage from a path-encoded tz, with credentials', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const client = new HttpAuthorityClient({
      baseUrl: 'https://api.example.test',
      fetch: async (url, init) => {
        calls.push({ url: String(url), init: init ?? {} });
        return String(url).endsWith('/v1/bootstrap')
          ? Response.json(bootstrapResponse)
          : Response.json({ passage: passageView });
      },
    });

    const passage = await client.passageToday(-300);

    // The tz rides in the PATH — never a query string the authority edge rejects.
    const today = calls.find((call) => call.url.includes('/v1/passage/today'));
    expect(new URL(today?.url ?? '').pathname).toBe('/v1/passage/today/-300');
    expect(today?.init.credentials).toBe('include');
    expect(passage?.id).toBe('p1');
  });

  it('treats an empty pool as a served null passage', async () => {
    const client = new HttpAuthorityClient({
      baseUrl: 'https://api.example.test',
      fetch: async (url) =>
        String(url).endsWith('/v1/bootstrap')
          ? Response.json(bootstrapResponse)
          : Response.json({ passage: null }),
    });

    expect(await client.passageToday(0)).toBeNull();
  });

  it('scores an answer via a session-gated POST and unwraps the grade', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const client = new HttpAuthorityClient({
      baseUrl: 'https://api.example.test',
      fetch: async (url, init) => {
        calls.push({ url: String(url), init: init ?? {} });
        return String(url).endsWith('/v1/bootstrap')
          ? Response.json(bootstrapResponse)
          : Response.json({ grade });
      },
    });

    const result = await client.passageAttempt('p1-q1', 'A');

    const attempt = calls.find((call) => call.url.endsWith('/v1/passage/attempts'));
    expect(attempt?.init.method).toBe('POST');
    expect(attempt?.init.credentials).toBe('include');
    expect(JSON.parse(String(attempt?.init.body))).toEqual({ questionId: 'p1-q1', choiceId: 'A' });
    expect(result).toEqual(grade);
  });
});

function signedOutSessionWithToken(): MemorySession {
  const session = new MemorySession();
  session.setCsrfToken(anonymousBootstrapResponse.csrfToken);
  return session;
}
