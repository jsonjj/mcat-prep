import { Authority } from '@mcat/authority-core';
import {
  AuthorityKernel,
  InMemoryAuthorityRepository,
  toProjectionRecord,
  type Principal,
} from '@mcat/authority-kernel';
import { fixedClock } from '@mcat/contracts';
import { describe, expect, it } from 'vitest';

import { createRepositoryLearnerApi } from './handler';
import { hashOpaqueToken, type GuestSessionService } from './session';
import type { ApiGatewayV1Event, ApiGatewayV2Event, RateLimitInput, SafeLogEvent } from './http';
import { allowedMethodsFor, routeFor } from './routes';

const APP_ORIGIN = 'https://learner.example.test';
const EVIL_ORIGIN = 'https://evil.example.test';
const NOW = '2026-07-22T12:00:00.000Z';
const SESSION_TOKEN = 's'.repeat(43);
const ROTATED_SESSION_TOKEN = 'r'.repeat(43);
const CSRF_TOKEN = 'c'.repeat(43);
const ORIGIN_VERIFICATION_SECRET = 'o'.repeat(64);
const clock = fixedClock(NOW);

function commandEnvelope(expectedStreamVersion = 0) {
  return {
    eventId: crypto.randomUUID(),
    idempotencyKey: crypto.randomUUID(),
    occurredAt: NOW,
    expectedStreamVersion,
    contentRelease: 'synthetic-2026.07',
    taskInstanceId: crypto.randomUUID(),
  };
}

function goalCommand(expectedStreamVersion = 0) {
  return {
    envelope: commandEnvelope(expectedStreamVersion),
    goal: { testDate: null, targetScore: 515, minutesPerWeek: 420 },
  };
}

function attemptCommand(
  questionId: string,
  choiceId: 'A' | 'B' | 'C' | 'D' | null,
  expectedStreamVersion = 0,
  isDiagnosticRetry = false,
) {
  return {
    envelope: commandEnvelope(expectedStreamVersion),
    questionId,
    choiceId,
    elapsedMs: 1_000,
    assistanceLevel: 'A0',
    contentBearingHintUsed: false,
    answerChanges: 0,
    isDiagnosticRetry,
  };
}

function request(
  method: string,
  path: string,
  body?: unknown,
  options: {
    origin?: string;
    authenticated?: boolean;
    csrf?: string;
    contentType?: string;
    requestId?: string;
    originVerification?: string | null;
  } = {},
): ApiGatewayV2Event {
  const headers: Record<string, string> = {};
  const originVerification =
    options.originVerification === undefined
      ? ORIGIN_VERIFICATION_SECRET
      : options.originVerification;
  if (originVerification !== null) headers['x-mcat-origin-verify'] = originVerification;
  if (options.origin !== undefined) headers.origin = options.origin;
  if (body !== undefined) headers['content-type'] = options.contentType ?? 'application/json';
  if (options.csrf !== undefined) headers['x-csrf-token'] = options.csrf;
  return {
    version: '2.0',
    rawPath: path,
    headers,
    cookies: options.authenticated
      ? [`__Host-mcat_session=${SESSION_TOKEN}`, `__Host-mcat_csrf=${CSRF_TOKEN}`]
      : [],
    requestContext: {
      requestId: options.requestId ?? 'request-123',
      http: { method, path, sourceIp: '203.0.113.42' },
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    isBase64Encoded: false,
  };
}

function harness(
  options: {
    allowRate?: boolean;
    rateDecisions?: readonly boolean[];
    rateLimitPepper?: string;
    maxBodyBytes?: number;
    state?: 'diagnostic' | 'lesson' | 'question' | 'recall';
  } = {},
) {
  const authority = new Authority(undefined, clock);
  const state = authority.createGuest();
  if (options.state !== 'diagnostic') {
    state.onboarding.diagnosticComplete = true;
    authority.confirmPlan(state, { testDate: null, targetScore: 515, minutesPerWeek: 420 });
    authority.startSession(state);
    if (options.state !== 'lesson') authority.continueStep(state);
    if (options.state === 'recall' && state.session !== null) state.session.pathIndex = 8;
  }

  const repository = new InMemoryAuthorityRepository([toProjectionRecord(state, 0, NOW)]);
  const kernel = new AuthorityKernel({ repository, clock, bank: authority.bank });
  const principal: Principal = {
    kind: 'guest',
    learnerId: state.learnerId,
    sessionId: crypto.randomUUID(),
  };
  let sessionBootstrapCalls = 0;
  let sessionResolveCalls = 0;
  const sessions: GuestSessionService = {
    bootstrap: async () => {
      sessionBootstrapCalls += 1;
      return {
        principal,
        sessionToken: ROTATED_SESSION_TOKEN,
        csrfToken: CSRF_TOKEN,
        maxAgeSeconds: 3600,
      };
    },
    resolve: async (token) => {
      sessionResolveCalls += 1;
      return token === SESSION_TOKEN
        ? { principal, csrfTokenHash: hashOpaqueToken(CSRF_TOKEN) }
        : null;
    },
  };
  const logs: SafeLogEvent[] = [];
  const rateInputs: RateLimitInput[] = [];
  const api = createRepositoryLearnerApi({
    repository,
    clock,
    bank: authority.bank,
    sessions,
    allowedOrigins: [APP_ORIGIN],
    originVerificationSecret: ORIGIN_VERIFICATION_SECRET,
    rateLimitPepper: options.rateLimitPepper ?? 'p'.repeat(32),
    rateLimiter: {
      allow: async (input) => {
        rateInputs.push(input);
        return options.rateDecisions?.[rateInputs.length - 1] ?? options.allowRate ?? true;
      },
    },
    logger: { info: (event) => logs.push(event) },
    nowMs: () => Date.parse(NOW),
    ...(options.maxBodyBytes === undefined ? {} : { maxBodyBytes: options.maxBodyBytes }),
  });
  return {
    api,
    authority,
    kernel,
    logs,
    principal,
    rateInputs,
    repository,
    sessionBootstrapCalls: () => sessionBootstrapCalls,
    sessionResolveCalls: () => sessionResolveCalls,
  };
}

function responseBody(response: { body?: string }): unknown {
  return JSON.parse(response.body ?? 'null') as unknown;
}

describe('learner Lambda API security boundary', () => {
  it('matches only valid dynamic practice-item paths and extracts the content id', () => {
    expect(routeFor('GET', '/v1/practice/items/q-enz-passage-1')?.id).toBe('practiceItem');
    expect(allowedMethodsFor('/v1/practice/items/q-enz-passage-1')).toEqual(['GET']);
    expect(routeFor('GET', '/v1/practice/items/not%2Fsafe')).toBeUndefined();
    expect(routeFor('GET', '/v1/practice/items/q-enz-passage-1/extra')).toBeUndefined();
  });

  it.each([
    ['absent', null],
    ['incorrect', 'x'.repeat(64)],
  ])(
    'rejects %s origin verification before bootstrap, session, or rate-limit storage work',
    async (_label, originVerification) => {
      const { api, rateInputs, sessionBootstrapCalls, sessionResolveCalls } = harness();

      const response = await api.handle(
        request('POST', '/v1/bootstrap', undefined, {
          origin: APP_ORIGIN,
          originVerification,
        }),
      );

      expect(response.statusCode).toBe(403);
      expect(response.headers?.['access-control-allow-origin']).toBeUndefined();
      expect(responseBody(response)).toMatchObject({ code: 'forbidden' });
      expect(sessionBootstrapCalls()).toBe(0);
      expect(sessionResolveCalls()).toBe(0);
      expect(rateInputs).toHaveLength(0);
    },
  );

  it('requires origin verification on public health and preflight requests', async () => {
    const { api } = harness();

    const health = await api.handle(
      request('GET', '/v1/health', undefined, { originVerification: null }),
    );
    const preflight = await api.handle(
      request('OPTIONS', '/v1/attempts', undefined, {
        origin: APP_ORIGIN,
        originVerification: null,
      }),
    );

    expect(health.statusCode).toBe(403);
    expect(preflight.statusCode).toBe(403);
    expect(preflight.headers?.['access-control-allow-origin']).toBeUndefined();
  });

  it('sets secure rotated guest cookies and no-store on bootstrap', async () => {
    const { api, logs, principal } = harness();

    const response = await api.handle(
      request('POST', '/v1/bootstrap', undefined, { origin: APP_ORIGIN }),
    );

    expect(response.statusCode).toBe(200);
    expect(response.headers?.['cache-control']).toBe('no-store');
    expect(response.headers?.['access-control-allow-origin']).toBe(APP_ORIGIN);
    expect(response.cookies?.[0]).toMatch(
      /^__Host-mcat_session=.+; Path=\/; Max-Age=3600; HttpOnly; Secure; SameSite=Lax$/,
    );
    expect(response.cookies?.[1]).toMatch(
      /^__Host-mcat_csrf=.+; Path=\/; Max-Age=3600; HttpOnly; Secure; SameSite=Lax$/,
    );
    expect(responseBody(response)).toMatchObject({
      learnerId: principal.learnerId,
      csrfToken: CSRF_TOKEN,
      streamVersion: 0,
    });
    expect(logs.at(-1)).toMatchObject({
      principalKind: 'guest',
      learnerHash: expect.stringMatching(/^[0-9a-f]{24}$/),
    });
  });

  it('adapts REST API Gateway v1 events and emits multi-value Set-Cookie headers', async () => {
    const { api } = harness();
    const event: ApiGatewayV1Event = {
      httpMethod: 'POST',
      path: '/v1/bootstrap',
      headers: {
        origin: APP_ORIGIN,
        'x-mcat-origin-verify': ORIGIN_VERIFICATION_SECRET,
      },
      requestContext: {
        requestId: 'rest-request-123',
        identity: { sourceIp: '203.0.113.42' },
      },
      body: null,
      isBase64Encoded: false,
    };

    const response = await api.handler(event);

    expect(response.statusCode).toBe(200);
    expect(response.multiValueHeaders?.['set-cookie']).toHaveLength(2);
  });

  it('rejects client-supplied learner ownership without invoking a logical effect', async () => {
    const { api, principal, repository } = harness();
    const body = { ...goalCommand(), learnerId: crypto.randomUUID() };

    const response = await api.handle(
      request('PUT', '/v1/profile/goal', body, {
        origin: APP_ORIGIN,
        authenticated: true,
        csrf: CSRF_TOKEN,
      }),
    );

    expect(response.statusCode).toBe(400);
    expect(repository.eventsFor(principal.learnerId)).toHaveLength(0);
  });

  it.each([
    ['missing origin', undefined, CSRF_TOKEN],
    ['foreign origin', EVIL_ORIGIN, CSRF_TOKEN],
    ['missing CSRF', APP_ORIGIN, undefined],
    ['wrong CSRF', APP_ORIGIN, 'x'.repeat(43)],
  ])('rejects %s on cookie-authenticated writes', async (_name, origin, csrf) => {
    const { api, principal, repository } = harness();

    const response = await api.handle(
      request('PUT', '/v1/profile/goal', goalCommand(), {
        ...(origin === undefined ? {} : { origin }),
        authenticated: true,
        ...(csrf === undefined ? {} : { csrf }),
      }),
    );

    expect(response.statusCode).toBe(403);
    expect(repository.eventsFor(principal.learnerId)).toHaveLength(0);
  });

  it('returns the original command result for a duplicate idempotency key', async () => {
    const { api, principal, repository } = harness();
    const command = goalCommand();
    const event = request('PUT', '/v1/profile/goal', command, {
      origin: APP_ORIGIN,
      authenticated: true,
      csrf: CSRF_TOKEN,
    });

    const first = await api.handle(event);
    const second = await api.handle(event);

    expect(responseBody(second)).toEqual(responseBody(first));
    expect(repository.eventsFor(principal.learnerId)).toHaveLength(1);
  });

  it('serves only the authenticated learner snapshot projections', async () => {
    const { api } = harness();
    const authenticated = { origin: APP_ORIGIN, authenticated: true } as const;

    const [today, session, mastery, errors] = await Promise.all([
      api.handle(request('GET', '/v1/plan/today', undefined, authenticated)),
      api.handle(request('GET', '/v1/learning/session', undefined, authenticated)),
      api.handle(request('GET', '/v1/progress/mastery', undefined, authenticated)),
      api.handle(request('GET', '/v1/errors', undefined, authenticated)),
    ]);

    expect(today.statusCode).toBe(200);
    expect(session.statusCode).toBe(200);
    expect(Array.isArray(responseBody(mastery))).toBe(true);
    expect(Array.isArray(responseBody(errors))).toBe(true);
    expect(JSON.stringify({ today, session, mastery, errors })).not.toMatch(
      /correct_choice_id|option_rationales|rationales|sessionToken/i,
    );
  });

  it('completes the synthetic diagnostic through the authenticated HTTP contract', async () => {
    const { api, principal, repository } = harness({ state: 'diagnostic' });
    const authenticated = { origin: APP_ORIGIN, authenticated: true } as const;

    const next = await api.handle(request('GET', '/v1/diagnostic/next', undefined, authenticated));
    const nextBody = responseBody(next) as {
      done: boolean;
      progress: number;
      question: { id: string } | null;
    };

    expect(next.statusCode).toBe(200);
    expect(nextBody).toMatchObject({ done: false, progress: 0 });
    expect(nextBody.question?.id).toBe('q-enz-basics-1');
    expect(JSON.stringify(nextBody)).not.toMatch(/correct_choice_id|rationales|correctChoiceId/i);

    const diagnosticCommand = attemptCommand('q-enz-basics-1', 'A');
    const answer = await api.handle(
      request('POST', '/v1/attempts', diagnosticCommand, {
        ...authenticated,
        csrf: CSRF_TOKEN,
      }),
    );
    const completed = await api.handle(
      request('GET', '/v1/diagnostic/next', undefined, authenticated),
    );

    expect(answer.statusCode).toBe(200);
    expect(responseBody(completed)).toEqual({ done: true, question: null, progress: 1 });
    expect(repository.eventsFor(principal.learnerId)).toHaveLength(1);
    expect(repository.projectionFor(principal.learnerId)?.state).toMatchObject({
      onboarding: { diagnosticComplete: true, planConfirmed: false },
      evidence: [{ evidenceId: diagnosticCommand.envelope.eventId }],
    });
  });

  /**
   * Was 'persists cause, retry, reveal, and continue…'. The cause command and its
   * route no longer exist: a miss is corrected immediately rather than interrogated
   * first (§2.2–§2.3). The retry it used to precede is unchanged in kind and
   * count — it just happens after the correction now — so the event count and the
   * retry's position in the stream are the same as before.
   */
  it('persists reveal, retry, and continue transitions with idempotent commands', async () => {
    const { api, principal, repository } = harness({ state: 'question' });
    const write = { origin: APP_ORIGIN, authenticated: true, csrf: CSRF_TOKEN } as const;

    const wrong = await api.handle(
      request('POST', '/v1/attempts', attemptCommand('q-enz-indep-competitive', 'B'), write),
    );
    expect(wrong.statusCode).toBe(200);

    // The correction arrives with no intervening step, and it refutes the option
    // this learner actually picked.
    const revealed = await api.handle(
      request('GET', '/v1/learning/session', undefined, {
        origin: APP_ORIGIN,
        authenticated: true,
      }),
    );
    expect(responseBody(revealed)).toMatchObject({
      kind: 'question',
      sub: 'reveal',
      reveal: { correctChoiceId: 'A', chosenChoiceId: 'B' },
    });

    // Leaving the reveal spends the one unassisted retry instead of advancing.
    const continueCommand = { envelope: commandEnvelope(1) };
    const toRetry = await api.handle(
      request('POST', '/v1/learning/session/continue', continueCommand, write),
    );
    const duplicateContinue = await api.handle(
      request('POST', '/v1/learning/session/continue', continueCommand, write),
    );
    expect(toRetry.statusCode).toBe(200);
    expect(responseBody(duplicateContinue)).toEqual(responseBody(toRetry));

    const atRetry = await api.handle(
      request('GET', '/v1/learning/session', undefined, {
        origin: APP_ORIGIN,
        authenticated: true,
      }),
    );
    expect(responseBody(atRetry)).toMatchObject({
      kind: 'question',
      sub: 'retry',
      question: { id: 'q-enz-indep-competitive' },
    });

    const retry = await api.handle(
      request(
        'POST',
        '/v1/attempts',
        // The current browser client sends false for every attempt. The server
        // must derive retry eligibility from authoritative session state.
        attemptCommand('q-enz-indep-competitive', 'A', 2, false),
        write,
      ),
    );
    expect(retry.statusCode).toBe(200);

    // The retry advances on its own: the correction it used to lead to has already
    // been shown, so there is no second reveal and no extra continue.
    const next = await api.handle(
      request('GET', '/v1/learning/session', undefined, {
        origin: APP_ORIGIN,
        authenticated: true,
      }),
    );
    expect(responseBody(next)).toMatchObject({
      kind: 'question',
      sub: 'answering',
      question: { id: 'q-enz-indep-noncompetitive' },
    });

    // Three commands where the cause step needed four: attempt, continue, retry.
    const events = repository.eventsFor(principal.learnerId);
    expect(events).toHaveLength(3);
    expect(events[2]?.payload).toMatchObject({ isDiagnosticRetry: true });
    expect(JSON.stringify(events)).not.toMatch(/cause/i);
  });

  it('supports Reveal Now without exposing protected-form answers', async () => {
    const normal = harness({ state: 'question' });
    const write = { origin: APP_ORIGIN, authenticated: true, csrf: CSRF_TOKEN } as const;
    const revealCommand = { envelope: commandEnvelope(), revealNow: true };

    const reveal = await normal.api.handle(
      request('POST', '/v1/attempts/reveal', revealCommand, write),
    );
    const step = await normal.api.handle(
      request('GET', '/v1/learning/session', undefined, {
        origin: APP_ORIGIN,
        authenticated: true,
      }),
    );

    expect(reveal.statusCode).toBe(200);
    expect(responseBody(step)).toMatchObject({
      kind: 'question',
      sub: 'reveal',
      reveal: { correctChoiceId: 'A' },
    });

    const protectedHarness = harness({ state: 'question' });
    const projection = protectedHarness.repository.projectionFor(
      protectedHarness.principal.learnerId,
    );
    expect(projection).not.toBeNull();
    if (projection !== null) {
      const protectedState = structuredClone(projection.state) as {
        session: { pathIndex: number };
      };
      protectedState.session.pathIndex = 7;
      protectedHarness.repository.seedProjection({ ...projection, state: protectedState });
    }
    const denied = await protectedHarness.api.handle(
      request('POST', '/v1/attempts/reveal', revealCommand, write),
    );
    expect(denied.statusCode).toBe(400);
    expect(JSON.stringify(responseBody(denied))).not.toMatch(/correctChoiceId|rationale/i);
  });

  it('submits recall, returns only correctness, and advances to completion', async () => {
    const { api, principal, repository } = harness({ state: 'recall' });
    const response = await api.handle(
      request(
        'POST',
        '/v1/recall',
        { envelope: commandEnvelope(), answer: 'increases; unchanged' },
        { origin: APP_ORIGIN, authenticated: true, csrf: CSRF_TOKEN },
      ),
    );
    const session = await api.handle(
      request('GET', '/v1/learning/session', undefined, {
        origin: APP_ORIGIN,
        authenticated: true,
      }),
    );

    expect(response.statusCode).toBe(200);
    expect(responseBody(response)).toEqual({ correct: true });
    expect(responseBody(session)).toMatchObject({ kind: 'complete' });
    expect(repository.eventsFor(principal.learnerId)).toHaveLength(1);
  });

  it('serves learner-safe skills and dynamic practice items', async () => {
    const { api } = harness();
    const authenticated = { origin: APP_ORIGIN, authenticated: true } as const;

    const skills = await api.handle(request('GET', '/v1/skills', undefined, authenticated));
    const item = await api.handle(
      request('GET', '/v1/practice/items/q-enz-passage-1', undefined, authenticated),
    );
    const missing = await api.handle(
      request('GET', '/v1/practice/items/not-in-bank', undefined, authenticated),
    );

    expect(skills.statusCode).toBe(200);
    expect(responseBody(skills)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ skillId: 'bb1-enzyme-inhibition', cluster: 'BB1' }),
      ]),
    );
    expect(responseBody(item)).toMatchObject({
      question: { id: 'q-enz-passage-1' },
    });
    expect(responseBody(missing)).toBeNull();
    expect(JSON.stringify({ skills, item, missing })).not.toMatch(
      /correct_choice_id|correctChoiceId|rationales/i,
    );
  });

  it('authorizes practice feedback only after an idempotent persisted attempt', async () => {
    const { api, principal, repository } = harness();
    const command = {
      envelope: commandEnvelope(),
      questionId: 'q-enz-passage-1',
      choiceId: 'A',
    };
    const write = { origin: APP_ORIGIN, authenticated: true, csrf: CSRF_TOKEN } as const;

    const first = await api.handle(request('POST', '/v1/practice/attempts', command, write));
    const duplicate = await api.handle(request('POST', '/v1/practice/attempts', command, write));

    expect(first.statusCode).toBe(200);
    expect(responseBody(first)).toMatchObject({
      correct: expect.any(Boolean),
      correctChoiceId: expect.stringMatching(/^[A-D]$/),
      rationale: expect.any(String),
    });
    expect(responseBody(duplicate)).toEqual(responseBody(first));
    expect(repository.eventsFor(principal.learnerId)).toHaveLength(1);
    expect(repository.projectionFor(principal.learnerId)?.state).toMatchObject({
      evidence: expect.arrayContaining([
        expect.objectContaining({ evidenceId: command.envelope.eventId }),
      ]),
    });

    const denied = await harness().api.handle(
      request('POST', '/v1/practice/attempts', command, {
        origin: APP_ORIGIN,
        authenticated: true,
      }),
    );
    expect(denied.statusCode).toBe(403);
    expect(JSON.stringify(responseBody(denied))).not.toMatch(/correctChoiceId|rationale/i);
  });

  it('categorically denies protected and unassigned items through practice endpoints', async () => {
    const { api, principal, repository } = harness();
    const authenticated = { origin: APP_ORIGIN, authenticated: true } as const;
    const write = { ...authenticated, csrf: CSRF_TOKEN } as const;
    const command = {
      envelope: commandEnvelope(),
      questionId: 'q-enz-protected-1',
      choiceId: 'A',
    };

    const fetched = await api.handle(
      request('GET', '/v1/practice/items/q-enz-protected-1', undefined, authenticated),
    );
    const submitted = await api.handle(request('POST', '/v1/practice/attempts', command, write));

    expect(fetched.statusCode).toBe(200);
    expect(responseBody(fetched)).toBeNull();
    expect(submitted.statusCode).toBe(403);
    expect(
      JSON.stringify({ fetched: responseBody(fetched), submitted: responseBody(submitted) }),
    ).not.toMatch(/correctChoiceId|correct_choice_id|rationale/i);
    expect(repository.eventsFor(principal.learnerId)).toHaveLength(0);
  });

  it('serves an adaptive practice queue and scores an adaptive attempt (synthetic fallback)', async () => {
    const { api, principal, repository } = harness();
    const read = { origin: APP_ORIGIN, authenticated: true } as const;
    const write = { origin: APP_ORIGIN, authenticated: true, csrf: CSRF_TOKEN } as const;

    const queued = await api.handle(request('GET', '/v1/practice/queue/3', undefined, read));
    expect(queued.statusCode).toBe(200);
    const queue = responseBody(queued) as {
      requested: number;
      items: Array<{ specId: string; question: { id: string; choices: unknown[] } }>;
    };
    expect(queue.requested).toBe(3);
    expect(queue.items.length).toBeGreaterThan(0);
    expect(queue.items[0]!.question.choices).toHaveLength(4);
    expect(JSON.stringify(queue)).not.toMatch(/correct_choice_id|correctChoiceId|rationale/i);

    const first = queue.items[0]!;
    // No `firstAttempt` key: the field is gone from the practice command
    // contract entirely (packages/contracts/src/practice.ts), and this real
    // route accepting a body without it is the proof the removal did not
    // break a live submission.
    const body = {
      envelope: commandEnvelope(0),
      questionId: first.question.id,
      specId: first.specId,
      chosenChoiceId: 'A',
    };
    const scored = await api.handle(request('POST', '/v1/practice/attempts/adaptive', body, write));
    const duplicate = await api.handle(
      request('POST', '/v1/practice/attempts/adaptive', body, write),
    );

    expect(scored.statusCode).toBe(200);
    expect(responseBody(scored)).toMatchObject({
      correct: expect.any(Boolean),
      correctChoiceId: expect.stringMatching(/^[A-D]$/),
      rationale: expect.any(String),
    });
    // Idempotent: a replay returns the same result and appends no new event.
    expect(responseBody(duplicate)).toEqual(responseBody(scored));
    expect(repository.eventsFor(principal.learnerId)).toHaveLength(1);
    const projection = repository.projectionFor(principal.learnerId)?.state as { mastery?: unknown };
    expect(projection.mastery).toBeDefined();
  });

  /**
   * The same refusal the single-item route gives an unassigned question, on the
   * adaptive route, for the reason the adaptive route needed one: `specId` used
   * to be parsed here and then read by nobody, so a body naming any corpus item
   * with an invented spec was scored without the queue ever being asked. The
   * body below is well-formed and correctly authenticated — the only thing wrong
   * with it is that the server never served this learner this item.
   */
  it('refuses an adaptive practice attempt the queue never issued', async () => {
    const { api, principal, repository } = harness();
    const write = { origin: APP_ORIGIN, authenticated: true, csrf: CSRF_TOKEN } as const;

    const denied = await api.handle(
      request(
        'POST',
        '/v1/practice/attempts/adaptive',
        {
          envelope: commandEnvelope(0),
          questionId: 'q-enz-indep-competitive',
          specId: 'sci:bb1-enzyme-inhibition:EXPLAIN:train',
          chosenChoiceId: 'A',
        },
        write,
      ),
    );

    expect(denied.statusCode).toBe(403);
    // The transaction aborted, so the refusal left no accepted event and no
    // mastery behind it.
    expect(repository.eventsFor(principal.learnerId)).toHaveLength(0);
    const projection = repository.projectionFor(principal.learnerId)?.state as {
      mastery?: unknown;
      evidence?: unknown[];
    };
    expect(projection.mastery).toBeUndefined();
    expect(projection.evidence).toEqual([]);
  });

  it('rejects an adaptive practice attempt without CSRF', async () => {
    const { api } = harness();
    const body = {
      envelope: commandEnvelope(0),
      questionId: 'q-enz-indep-competitive',
      specId: 'sci:bb1-enzyme-inhibition:EXPLAIN:train',
      chosenChoiceId: 'A',
    };
    const denied = await api.handle(
      request('POST', '/v1/practice/attempts/adaptive', body, {
        origin: APP_ORIGIN,
        authenticated: true,
      }),
    );
    expect(denied.statusCode).toBe(403);
  });

  /**
   * The named "done" condition for the contract removal: a real body missing
   * `firstAttempt` is accepted, and a body that still sends the retired key is
   * rejected as an unknown field rather than silently ignored — the exact-key
   * body check in `routes.ts` no longer lists it on either side.
   */
  it('accepts an adaptive practice attempt with no firstAttempt key, and rejects one that still sends it', async () => {
    const { api } = harness();
    const read = { origin: APP_ORIGIN, authenticated: true } as const;
    const write = { origin: APP_ORIGIN, authenticated: true, csrf: CSRF_TOKEN } as const;

    const queued = await api.handle(request('GET', '/v1/practice/queue/2', undefined, read));
    const queue = responseBody(queued) as {
      items: Array<{ specId: string; question: { id: string } }>;
    };
    const item = queue.items[0]!;

    const withoutField = await api.handle(
      request(
        'POST',
        '/v1/practice/attempts/adaptive',
        {
          envelope: commandEnvelope(0),
          questionId: item.question.id,
          specId: item.specId,
          chosenChoiceId: 'A',
        },
        write,
      ),
    );
    expect(withoutField.statusCode).toBe(200);
    expect(responseBody(withoutField)).toMatchObject({ correct: expect.any(Boolean) });

    const withField = await api.handle(
      request(
        'POST',
        '/v1/practice/attempts/adaptive',
        {
          envelope: commandEnvelope(1),
          questionId: item.question.id,
          specId: item.specId,
          chosenChoiceId: 'A',
          firstAttempt: true,
        },
        write,
      ),
    );
    expect(withField.statusCode).toBe(400);
  });

  it('persists deterministic non-mastery CARS evidence and serves Wrapped', async () => {
    const { api, principal, repository } = harness();
    const command = { envelope: commandEnvelope() };
    const write = { origin: APP_ORIGIN, authenticated: true, csrf: CSRF_TOKEN } as const;

    const first = await api.handle(request('POST', '/v1/hooks/cars-duel', command, write));
    const duplicate = await api.handle(request('POST', '/v1/hooks/cars-duel', command, write));
    const wrapped = await api.handle(
      request('GET', '/v1/hooks/wrapped', undefined, {
        origin: APP_ORIGIN,
        authenticated: true,
      }),
    );

    expect(first.statusCode).toBe(200);
    expect(responseBody(duplicate)).toEqual(responseBody(first));
    // Three touched grains: the prerequisite-blocked enzyme skill, plus `cars-ca1`
    // and `cars-ca2`, which the duel writes evidence to. The two CARS grains only
    // started counting once the warrant was enumerated over grains that hold
    // evidence rather than over the bank's two synthetic skill-graph ids.
    expect(responseBody(wrapped)).toMatchObject({ skillsTouched: 3, protectedPassed: 0 });
    const state = repository.projectionFor(principal.learnerId)?.state as
      | { evidence?: Array<{ evidenceId?: string; kind?: string }> }
      | undefined;
    expect(state?.evidence).toHaveLength(2);
    expect(state?.evidence?.map((entry) => entry.evidenceId)).toEqual([
      command.envelope.eventId,
      expect.stringMatching(/^[0-9a-f-]{36}$/),
    ]);
    expect(new Set(state?.evidence?.map((entry) => entry.evidenceId)).size).toBe(2);
    expect(state?.evidence?.every((entry) => entry.kind === 'placement')).toBe(true);
  });

  it('resets only the projection while preserving immutable accepted history and outbox', async () => {
    const { api, principal, repository } = harness();
    const write = { origin: APP_ORIGIN, authenticated: true, csrf: CSRF_TOKEN } as const;
    const practice = {
      envelope: commandEnvelope(),
      questionId: 'q-enz-passage-1',
      choiceId: 'A',
    };
    await api.handle(request('POST', '/v1/practice/attempts', practice, write));
    const resetCommand = { envelope: commandEnvelope(1) };

    const reset = await api.handle(request('DELETE', '/v1/account/progress', resetCommand, write));
    const duplicate = await api.handle(
      request('DELETE', '/v1/account/progress', resetCommand, write),
    );

    expect(reset.statusCode).toBe(200);
    expect(responseBody(duplicate)).toEqual(responseBody(reset));
    expect(repository.eventsFor(principal.learnerId)).toHaveLength(2);
    expect(repository.outboxFor(principal.learnerId)).toHaveLength(2);
    expect(repository.projectionFor(principal.learnerId)).toMatchObject({
      learnerId: principal.learnerId,
      sequence: 2,
      state: {
        learnerId: principal.learnerId,
        accountState: 'guest',
        onboarding: { diagnosticComplete: false, planConfirmed: false },
        events: [],
        evidence: [],
      },
    });
  });

  it.each([
    ['POST', '/v1/attempts', { envelope: commandEnvelope(), questionId: 'q1', choiceId: 'A' }],
    ['POST', '/v1/attempts/reveal', { envelope: commandEnvelope(), revealNow: true }],
    ['POST', '/v1/learning/session/continue', { envelope: commandEnvelope() }],
    ['POST', '/v1/recall', { envelope: commandEnvelope(), answer: 'answer' }],
    [
      'POST',
      '/v1/practice/attempts',
      { envelope: commandEnvelope(), questionId: 'q-enz-passage-1', choiceId: 'A' },
    ],
    ['POST', '/v1/hooks/cars-duel', { envelope: commandEnvelope() }],
    ['DELETE', '/v1/account/progress', { envelope: commandEnvelope() }],
  ])('requires a session and CSRF token for workflow write %s %s', async (method, path, body) => {
    const { api, principal, repository } = harness();
    const response = await api.handle(
      request(method, path, body, { origin: APP_ORIGIN, authenticated: true }),
    );

    expect(response.statusCode).toBe(403);
    expect(repository.eventsFor(principal.learnerId)).toHaveLength(0);
  });

  it('no longer routes the cause command at all', async () => {
    const { api, principal, repository } = harness({ state: 'question' });
    const response = await api.handle(
      request(
        'POST',
        '/v1/attempts/cause',
        { envelope: commandEnvelope(), cause: 'knew_but_misapplied' },
        { origin: APP_ORIGIN, authenticated: true, csrf: CSRF_TOKEN },
      ),
    );

    // 404, not 403: the route is gone rather than merely guarded, so an older
    // client cannot record a cause even with a valid session and token.
    expect(response.statusCode).toBe(404);
    expect(repository.eventsFor(principal.learnerId)).toHaveLength(0);
  });

  it('enforces content type and body size before parsing', async () => {
    const { api } = harness({ maxBodyBytes: 256 });
    const oversized = { padding: 'x'.repeat(512) };
    const common = { origin: APP_ORIGIN, authenticated: true, csrf: CSRF_TOKEN } as const;

    const wrongType = await api.handle(
      request('PUT', '/v1/profile/goal', goalCommand(), {
        ...common,
        contentType: 'text/plain',
      }),
    );
    const tooLarge = await api.handle(request('PUT', '/v1/profile/goal', oversized, common));

    expect(wrongType.statusCode).toBe(415);
    expect(tooLarge.statusCode).toBe(413);
  });

  it('returns exact preflight CORS and rejects rate-limited requests', async () => {
    const allowed = harness().api;
    const limited = harness({ allowRate: false }).api;

    const preflight = await allowed.handle(
      request('OPTIONS', '/v1/attempts', undefined, { origin: APP_ORIGIN }),
    );
    const throttled = await limited.handle(
      request('GET', '/v1/plan/today', undefined, {
        origin: APP_ORIGIN,
        authenticated: true,
      }),
    );

    expect(preflight).toMatchObject({ statusCode: 204 });
    expect(preflight.headers?.['access-control-allow-origin']).toBe(APP_ORIGIN);
    expect(preflight.headers?.['access-control-allow-credentials']).toBe('true');
    expect(preflight.headers?.['access-control-allow-methods']).toBe(
      'DELETE, GET, POST, PUT, OPTIONS',
    );
    expect(throttled.statusCode).toBe(429);
  });

  it('does not invoke the session limiter without a valid session', async () => {
    const { api, rateInputs, sessionResolveCalls } = harness({ allowRate: false });

    const response = await api.handle(
      request('GET', '/v1/plan/today', undefined, {
        origin: APP_ORIGIN,
      }),
    );

    expect(response.statusCode).toBe(401);
    expect(sessionResolveCalls()).toBe(0);
    expect(rateInputs).toHaveLength(0);
  });

  it('does not application-throttle public traffic by a shared gateway source IP', async () => {
    const publicHarness = harness({ allowRate: false });
    const bootstrapHarness = harness({ allowRate: false });
    const sessionHarness = harness({ allowRate: false });

    const health = await publicHarness.api.handle(request('GET', '/v1/health'));
    const bootstrap = await bootstrapHarness.api.handle(
      request('POST', '/v1/bootstrap', undefined, { origin: APP_ORIGIN }),
    );
    const session = await sessionHarness.api.handle(
      request('GET', '/v1/plan/today', undefined, {
        origin: APP_ORIGIN,
        authenticated: true,
      }),
    );

    expect(health.statusCode).toBe(200);
    expect(bootstrap.statusCode).toBe(200);
    expect(publicHarness.rateInputs).toHaveLength(0);
    expect(bootstrapHarness.rateInputs).toHaveLength(0);
    expect(session.statusCode).toBe(429);
    expect(sessionHarness.sessionResolveCalls()).toBe(1);
    expect(sessionHarness.rateInputs).toHaveLength(1);
  });

  it('applies a separate per-session throttle after successful session resolution', async () => {
    const { api, rateInputs, sessionResolveCalls } = harness({ allowRate: false });

    const response = await api.handle(
      request('GET', '/v1/plan/today', undefined, {
        origin: APP_ORIGIN,
        authenticated: true,
      }),
    );

    expect(response.statusCode).toBe(429);
    expect(sessionResolveCalls()).toBe(1);
    expect(rateInputs).toHaveLength(1);
  });

  it('does not double-count anonymous or bootstrap routes', async () => {
    const healthHarness = harness();
    const bootstrapHarness = harness();

    const health = await healthHarness.api.handle(request('GET', '/v1/health'));
    const bootstrap = await bootstrapHarness.api.handle(
      request('POST', '/v1/bootstrap', undefined, { origin: APP_ORIGIN }),
    );

    expect(health.statusCode).toBe(200);
    expect(bootstrap.statusCode).toBe(200);
    expect(healthHarness.rateInputs).toHaveLength(0);
    expect(bootstrapHarness.rateInputs).toHaveLength(0);
  });

  it('keys session throttles with a deployment secret', async () => {
    const first = harness({ rateLimitPepper: 'a'.repeat(32) });
    const second = harness({ rateLimitPepper: 'b'.repeat(32) });
    const authenticated = { origin: APP_ORIGIN, authenticated: true } as const;

    await first.api.handle(request('GET', '/v1/plan/today', undefined, authenticated));
    await second.api.handle(request('GET', '/v1/plan/today', undefined, authenticated));

    expect(first.rateInputs[0]?.key).toMatch(/^[a-f0-9]{64}$/);
    expect(first.rateInputs[0]?.key).not.toBe(second.rateInputs[0]?.key);
  });

  it('logs allowlisted metadata without request secrets or protected material', async () => {
    const { api, logs } = harness();
    const sentinel = 'SENTINEL_FREE_TEXT_AND_CHOICE';

    await api.handle(
      request(
        'POST',
        '/v1/attempts',
        { ...goalCommand(), choiceId: sentinel, freeText: sentinel },
        { origin: APP_ORIGIN, authenticated: true, csrf: CSRF_TOKEN },
      ),
    );

    const serialized = JSON.stringify(logs);
    expect(serialized).not.toContain(sentinel);
    expect(serialized).not.toContain(SESSION_TOKEN);
    expect(serialized).not.toContain(CSRF_TOKEN);
    expect(serialized).not.toMatch(/cookie|authorization|correct_choice|rationale/i);
    expect(logs.at(-1)).toMatchObject({
      requestId: 'request-123',
      route: '/v1/attempts',
      method: 'POST',
      status: 400,
      principalKind: 'guest',
    });
  });

  it('returns safe request-correlated errors for missing sessions and unknown routes', async () => {
    const { api } = harness();

    const unauthorized = await api.handle(
      request('GET', '/v1/plan/today', undefined, { origin: APP_ORIGIN }),
    );
    const missing = await api.handle(request('GET', '/v1/not-a-route'));

    expect(unauthorized.statusCode).toBe(401);
    expect(responseBody(unauthorized)).toMatchObject({
      code: 'unauthorized',
      requestId: 'request-123',
    });
    expect(missing.statusCode).toBe(404);
    expect(JSON.stringify({ unauthorized, missing })).not.toMatch(/stack|postgres|sql|secret/i);
  });
});
