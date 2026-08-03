import { Authority } from '@mcat/authority-core';
import {
  AuthorityKernel,
  InMemoryAuthorityRepository,
  toProjectionRecord,
} from '@mcat/authority-kernel';
import { TodaysPathViewSchema, fixedClock } from '@mcat/contracts';
import { describe, expect, it } from 'vitest';

import { createRepositoryLearnerApi, type PassagePort } from './handler';
import {
  DiagnosticBank,
  InMemoryDiagnosticSessions,
  serveDiagnosticBlock,
  serveDiagnosticNext,
} from '@mcat/diagnostic-runner';
import { buildDiagnosticBank } from '@mcat/content';
import type { DiagnosticPort } from './diagnostic-port';
import { createLinkedSessionDouble } from './test-support/linked-session';
import type { ApiGatewayV1Event, ApiGatewayV2Event, RateLimitInput, SafeLogEvent } from './http';
import { allowedMethodsFor, routeFor } from './routes';
import type { AiFetch, AiProxyConfig } from '@mcat/ai-gateway/server';

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

/**
 * Put a harness learner past teach-before-test.
 *
 * The adaptive queue serves only KCs a completed lesson covered, and that gate
 * fails closed on an EMPTY taught set as well as on a miss — a learner who has
 * finished nothing is served nothing, which is the point of it. Production
 * writes the set from `completedLessons` during a plan build; here it goes
 * straight onto the projection, the same `seedProjection` route the
 * protected-step case uses. KC ids come from the bank's own units, so the
 * fixture matches whatever this route will actually serve.
 */
async function teachTheWholeBank(h: ReturnType<typeof harness>): Promise<void> {
  const projection = h.repository.projectionFor(h.principal.learnerId);
  if (projection === null) throw new Error('expected a seeded projection');
  const units = await h.authority.practiceBank.listUnits({ limit: 400 });
  const taught = structuredClone(projection.state) as { taughtKcIds?: string[] };
  taught.taughtKcIds = [...new Set(units.map((u) => u.kcId))];
  h.repository.seedProjection({ ...projection, state: taught as typeof projection.state });
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
    aiConfig?: AiProxyConfig;
    passage?: PassagePort;
    diagnostic?: DiagnosticPort;
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
  const session = createLinkedSessionDouble({
    learnerId: state.learnerId,
    sessionId: crypto.randomUUID(),
    sessionToken: SESSION_TOKEN,
    rotatedSessionToken: ROTATED_SESSION_TOKEN,
    csrfToken: CSRF_TOKEN,
  });
  const principal = session.principal;
  const sessions = session.sessions;
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
    ...(options.aiConfig === undefined ? {} : { aiConfig: options.aiConfig }),
    ...(options.passage === undefined ? {} : { passage: options.passage }),
    ...(options.diagnostic === undefined ? {} : { diagnostic: options.diagnostic }),
  });
  return {
    api,
    authority,
    kernel,
    logs,
    principal,
    rateInputs,
    repository,
    sessionBootstrapCalls: session.bootstrapCalls,
    sessionResolveCalls: session.resolveCalls,
  };
}

function responseBody(response: { body?: string }): unknown {
  return JSON.parse(response.body ?? 'null') as unknown;
}

/**
 * An in-memory diagnostic port over the SYNTHETIC fixture bank, wired into the
 * harness exactly as the deployed Postgres-backed port is. It exercises the same
 * `@mcat/diagnostic-runner` serving core the Lambda uses, so this pins the HTTP
 * block contract (auth, wire shape, one-use block token, resume) without a DB.
 */
function inMemoryDiagnosticPort(): DiagnosticPort {
  const bank = new DiagnosticBank(buildDiagnosticBank());
  const sessions = new InMemoryDiagnosticSessions();
  return {
    next: (learnerId, body) => serveDiagnosticNext(bank, sessions, learnerId, body),
    block: (learnerId, body) => serveDiagnosticBlock(bank, sessions, learnerId, body),
  };
}

interface DiagnosticWireView {
  done: boolean;
  itemsScored: number;
  stageId: string | null;
  stageNumber: number;
  sessionToken: string;
  blockToken: string | null;
  questions: { id: string }[];
  result: { masterySeed: { kcPriors: Record<string, number> } } | null;
}

const diagnosticView = (response: { body?: string }): DiagnosticWireView =>
  responseBody(response) as DiagnosticWireView;

describe('Passage of the Day route (formative, off the kernel)', () => {
  let receivedTz: number | undefined;
  const passage: PassagePort = {
    today: async (tzMinutes) => {
      receivedTz = tzMinutes;
      return {
        id: 'potd-x',
        title: 'X',
        discipline: 'Aesthetics',
        body: ['para'],
        questions: [
          {
            id: 'potd-x-q1',
            stem: 'stem?',
            choices: [
              { id: 'A', text: 'a' },
              { id: 'B', text: 'b' },
              { id: 'C', text: 'c' },
              { id: 'D', text: 'd' },
            ],
          },
        ],
        dayIndex: 0,
        poolSize: 1,
        localDate: '2026-07-22',
      };
    },
    grade: async (questionId, choiceId) =>
      questionId === 'potd-x-q1'
        ? {
            correct: choiceId === 'A',
            correctChoiceId: 'A',
            rationale: 'because a',
            choiceRationale: choiceId !== null && choiceId !== 'A' ? 'why it misses' : null,
          }
        : null,
  };
  const authed = { origin: APP_ORIGIN, authenticated: true } as const;

  it('serves today\u2019s learner-safe passage, passing the path tz through', async () => {
    const { api } = harness({ passage });
    const response = await api.handle(request('GET', '/v1/passage/today/300', undefined, authed));
    expect(response.statusCode).toBe(200);
    expect(responseBody(response)).toMatchObject({ passage: { id: 'potd-x', dayIndex: 0 } });
    expect(receivedTz).toBe(300);
    // Learner-safe: no key or rationale on the served view.
    expect(JSON.stringify(responseBody(response))).not.toMatch(/correctChoiceId|rationale/i);
  });

  it('requires a session', async () => {
    const { api } = harness({ passage });
    const response = await api.handle(request('GET', '/v1/passage/today/300'));
    expect(response.statusCode).toBe(401);
  });

  it('404s a malformed tz path', async () => {
    const { api } = harness({ passage });
    const response = await api.handle(
      request('GET', '/v1/passage/today/notanumber', undefined, authed),
    );
    expect(response.statusCode).toBe(404);
  });

  it('scores an answer and reveals its explanation', async () => {
    const { api } = harness({ passage });
    const response = await api.handle(
      request('POST', '/v1/passage/attempts', { questionId: 'potd-x-q1', choiceId: 'B' }, authed),
    );
    expect(response.statusCode).toBe(200);
    expect(responseBody(response)).toEqual({
      grade: {
        correct: false,
        correctChoiceId: 'A',
        rationale: 'because a',
        choiceRationale: 'why it misses',
      },
    });
  });

  it('404s an unknown passage question', async () => {
    const { api } = harness({ passage });
    const response = await api.handle(
      request('POST', '/v1/passage/attempts', { questionId: 'nope', choiceId: 'A' }, authed),
    );
    expect(response.statusCode).toBe(404);
  });

  it('degrades to no-passage when no source is configured', async () => {
    const { api } = harness();
    const response = await api.handle(request('GET', '/v1/passage/today/0', undefined, authed));
    expect(response.statusCode).toBe(200);
    expect(responseBody(response)).toEqual({ passage: null });
  });
});

/**
 * Today's Path route parity. These routes existed on the offline authority and
 * the kernel but were NEVER registered on the deployed Lambda, so `pnpm dev`
 * (services/local-learner-api wraps this handler) and prod returned 404 and the
 * Today page fell back to "Couldn't build today's path". This pins the four
 * routes end-to-end through the deployed handler + the real kernel transaction.
 */
describe("Today's Path routes (deployed learner-API parity)", () => {
  const read = { origin: APP_ORIGIN, authenticated: true } as const;
  const write = { origin: APP_ORIGIN, authenticated: true, csrf: CSRF_TOKEN } as const;
  const buildInput = {
    recallLoad: { dueLearning: 0, dueReviews: 0, newAvailable: 0, due: 0, estimatedMinutesForDue: 0 },
    candidateLessons: [],
    force: false,
  };

  it('registers the four routes with the contract method+path, auth, and stateChanging', () => {
    expect(routeFor('GET', '/v1/plan/today/path')?.id).toBe('todaysPath');
    expect(routeFor('GET', '/v1/plan/today/path')?.stateChanging).toBe(false);
    expect(routeFor('POST', '/v1/plan/today/build')?.id).toBe('todaysPathBuild');
    expect(routeFor('POST', '/v1/plan/today/build')?.stateChanging).toBe(true);
    expect(routeFor('POST', '/v1/plan/today/activity')?.id).toBe('todaysPathActivity');
    expect(routeFor('POST', '/v1/plan/today/activity')?.stateChanging).toBe(true);
    expect(routeFor('PUT', '/v1/profile/daily-budget')?.id).toBe('dailyBudget');
    expect(routeFor('PUT', '/v1/profile/daily-budget')?.stateChanging).toBe(true);
    for (const route of [
      routeFor('GET', '/v1/plan/today/path'),
      routeFor('POST', '/v1/plan/today/build'),
      routeFor('POST', '/v1/plan/today/activity'),
      routeFor('PUT', '/v1/profile/daily-budget'),
    ]) {
      expect(route?.auth).toBe('session');
    }
  });

  it('serves a valid TodaysPathView (not 404) for an authenticated learner, unbuilt by default', async () => {
    const { api } = harness();
    const response = await api.handle(request('GET', '/v1/plan/today/path', undefined, read));

    expect(response.statusCode).toBe(200);
    const view = TodaysPathViewSchema.parse(responseBody(response));
    expect(view.built).toBe(false);
  });

  it('requires a session for the plan projection', async () => {
    const { api } = harness();
    const response = await api.handle(request('GET', '/v1/plan/today/path', undefined, { origin: APP_ORIGIN }));
    expect(response.statusCode).toBe(401);
  });

  it('builds the plan, advances an activity, and sets the daily budget end-to-end', async () => {
    const { api, principal, repository } = harness();

    const built = await api.handle(
      request('POST', '/v1/plan/today/build', { envelope: commandEnvelope(0), input: buildInput }, write),
    );
    expect(built.statusCode).toBe(200);
    const view = TodaysPathViewSchema.parse(responseBody(built));
    expect(view.built).toBe(true);

    // A real activityId when the freshly built plan has one; a synthetic id
    // otherwise (the engine no-ops an unknown id but still acks the command).
    const activityId = view.activities[0]?.activityId ?? 'no-such-activity';
    const activity = await api.handle(
      request(
        'POST',
        '/v1/plan/today/activity',
        { envelope: commandEnvelope(1), activityId, status: 'in_progress' },
        write,
      ),
    );
    expect(activity.statusCode).toBe(200);
    expect(responseBody(activity)).toMatchObject({ streamVersion: 2, sequence: 2 });

    const budget = await api.handle(
      request(
        'PUT',
        '/v1/profile/daily-budget',
        { envelope: commandEnvelope(2), minutesPerDay: 180 },
        write,
      ),
    );
    expect(budget.statusCode).toBe(200);
    expect(responseBody(budget)).toMatchObject({ streamVersion: 3 });

    // Each of the three writes appended exactly one accepted event to the stream.
    expect(repository.eventsFor(principal.learnerId)).toHaveLength(3);
  });

  it('persists the daily budget, reflected in the (unbuilt) plan projection', async () => {
    const { api, principal, repository } = harness();

    const budget = await api.handle(
      request(
        'PUT',
        '/v1/profile/daily-budget',
        { envelope: commandEnvelope(0), minutesPerDay: 180 },
        write,
      ),
    );
    expect(budget.statusCode).toBe(200);
    expect(responseBody(budget)).toMatchObject({ streamVersion: 1 });
    expect(repository.eventsFor(principal.learnerId)).toHaveLength(1);

    // Read before any build: the view reports the goal preset the budget just set
    // (a built plan snapshots its own preset at build time, so this is the read
    // where the change is observable straight from the goal).
    const view = await api.handle(request('GET', '/v1/plan/today/path', undefined, read));
    expect(TodaysPathViewSchema.parse(responseBody(view))).toMatchObject({
      built: false,
      dailyMinutesPreset: 180,
    });
  });

  it('idempotently returns the first build result for a duplicate command', async () => {
    const { api, principal, repository } = harness();
    const event = request(
      'POST',
      '/v1/plan/today/build',
      { envelope: commandEnvelope(0), input: buildInput },
      write,
    );

    const first = await api.handle(event);
    const second = await api.handle(event);

    expect(first.statusCode).toBe(200);
    expect(responseBody(second)).toEqual(responseBody(first));
    expect(repository.eventsFor(principal.learnerId)).toHaveLength(1);
  });

  it('CSRF-gates the plan writes (build, activity, daily budget)', async () => {
    const cases: readonly [string, string, unknown][] = [
      ['POST', '/v1/plan/today/build', { envelope: commandEnvelope(0), input: buildInput }],
      [
        'POST',
        '/v1/plan/today/activity',
        { envelope: commandEnvelope(0), activityId: 'a', status: 'complete' },
      ],
      ['PUT', '/v1/profile/daily-budget', { envelope: commandEnvelope(0), minutesPerDay: 240 }],
    ];
    for (const [method, path, body] of cases) {
      const { api, principal, repository } = harness();
      const response = await api.handle(request(method, path, body, read));
      expect(response.statusCode).toBe(403);
      expect(repository.eventsFor(principal.learnerId)).toHaveLength(0);
    }
  });
});

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

  it('creates no learner and issues no session for a signed-out bootstrap', async () => {
    const { api, logs, sessionBootstrapCalls } = harness();

    const response = await api.handle(
      request('POST', '/v1/bootstrap', undefined, { origin: APP_ORIGIN }),
    );

    expect(response.statusCode).toBe(200);
    expect(response.headers?.['cache-control']).toBe('no-store');
    expect(response.headers?.['access-control-allow-origin']).toBe(APP_ORIGIN);
    // Only the CSRF cookie the signed-out /v1/auth/* routes need. No session
    // cookie, because there is no session and no learner behind it.
    expect(response.cookies).toHaveLength(1);
    expect(response.cookies?.[0]).toMatch(
      /^__Host-mcat_csrf=.+; Path=\/; Max-Age=3600; HttpOnly; Secure; SameSite=Lax$/,
    );
    expect(responseBody(response)).toMatchObject({ authenticated: false, apiVersion: 'v1' });
    expect(responseBody(response)).not.toHaveProperty('learnerId');
    expect(sessionBootstrapCalls()).toBe(0);
    expect(logs.at(-1)).toMatchObject({ principalKind: 'anonymous' });
    expect(logs.at(-1)).not.toHaveProperty('learnerHash');
  });

  it('rotates both cookies and reports the learner on a signed-in bootstrap', async () => {
    const { api, logs, principal } = harness();

    const response = await api.handle(
      request('POST', '/v1/bootstrap', undefined, { origin: APP_ORIGIN, authenticated: true }),
    );

    expect(response.statusCode).toBe(200);
    expect(response.cookies?.[0]).toMatch(
      /^__Host-mcat_session=.+; Path=\/; Max-Age=3600; HttpOnly; Secure; SameSite=Lax$/,
    );
    expect(response.cookies?.[1]).toMatch(
      /^__Host-mcat_csrf=.+; Path=\/; Max-Age=3600; HttpOnly; Secure; SameSite=Lax$/,
    );
    expect(responseBody(response)).toMatchObject({
      authenticated: true,
      learnerId: principal.learnerId,
      accountState: 'linked',
      csrfToken: CSRF_TOKEN,
      streamVersion: 0,
    });
    expect(logs.at(-1)).toMatchObject({
      principalKind: 'linked',
      learnerHash: expect.stringMatching(/^[0-9a-f]{24}$/),
    });
  });

  it('reports a linked learner as linked and erases a legacy guest state stamped on the projection', async () => {
    const { api, principal, repository } = harness();
    const stored = repository.projectionFor(principal.learnerId);
    if (stored === null) throw new Error('expected a seeded projection');
    // Every learner created before migration 0020 looks like this: the learners
    // row says `linked`, the projection blob it was seeded with says `guest`.
    repository.seedProjection({
      ...stored,
      state: { ...stored.state, accountState: 'guest' },
    });

    const bootstrap = await api.handle(
      request('POST', '/v1/bootstrap', undefined, { origin: APP_ORIGIN, authenticated: true }),
    );
    const accepted = await api.handle(
      request('PUT', '/v1/profile/goal', goalCommand(), {
        origin: APP_ORIGIN,
        authenticated: true,
        csrf: CSRF_TOKEN,
      }),
    );

    expect(responseBody(bootstrap)).toMatchObject({ accountState: 'linked' });
    expect(accepted.statusCode).toBe(200);
    // The next write must not carry the stale key back out of the blob it loaded.
    expect(repository.projectionFor(principal.learnerId)?.state).not.toHaveProperty('accountState');
  });

  it('adapts REST API Gateway v1 events and emits multi-value Set-Cookie headers', async () => {
    const { api } = harness();
    const event: ApiGatewayV1Event = {
      httpMethod: 'POST',
      path: '/v1/bootstrap',
      headers: {
        origin: APP_ORIGIN,
        'x-mcat-origin-verify': ORIGIN_VERIFICATION_SECRET,
        cookie: `__Host-mcat_session=${SESSION_TOKEN}; __Host-mcat_csrf=${CSRF_TOKEN}`,
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

  // The placement diagnostic is now the BLOCK/multistage form, served off the
  // kernel (like Passage of the Day) over its own persisted session — the legacy
  // single-question `GET /v1/diagnostic/next` + attempt-based submit is gone.
  // These pin the new `POST /v1/diagnostic/{next,block}` contract against an
  // in-memory port over the synthetic fixture bank.
  it('serves and drives the block diagnostic to a completed, leak-free result', async () => {
    const { api } = harness({ diagnostic: inMemoryDiagnosticPort() });
    const authed = { origin: APP_ORIGIN, authenticated: true } as const;

    const started = await api.handle(request('POST', '/v1/diagnostic/next', {}, authed));
    expect(started.statusCode).toBe(200);
    let view = diagnosticView(started);
    expect(view.done).toBe(false);
    expect(view.stageNumber).toBe(1);
    expect(view.questions.length).toBeGreaterThan(0);
    expect(typeof view.sessionToken).toBe('string');
    expect(typeof view.blockToken).toBe('string');
    // Learner-safe wire only: no answer key, no per-item correctness, no session
    // internals beyond the opaque tokens.
    expect(JSON.stringify(view)).not.toMatch(
      /correct_answer|explanations|correctChoiceId|"correct"|tokenHash|clientId/i,
    );

    const servedBlocks: string[][] = [];
    for (let guard = 0; guard < 20 && !view.done; guard += 1) {
      servedBlocks.push(view.questions.map((q) => q.id));
      const answers = Object.fromEntries(view.questions.map((q) => [q.id, 'A']));
      const committed = await api.handle(
        request(
          'POST',
          '/v1/diagnostic/block',
          {
            sessionToken: view.sessionToken,
            blockToken: view.blockToken,
            stageId: view.stageId,
            answers,
          },
          authed,
        ),
      );
      expect(committed.statusCode).toBe(200);
      view = diagnosticView(committed);
    }

    expect(view.done).toBe(true);
    expect(view.questions).toEqual([]);
    expect(view.result).not.toBeNull();
    // Every served item was scored, and no item was served twice across stages.
    const allServed = servedBlocks.flat();
    expect(view.itemsScored).toBe(allServed.length);
    expect(new Set(allServed).size).toBe(allServed.length);
    // The one point at which the diagnostic touches mastery is the seed it emits.
    expect(Object.keys(view.result!.masterySeed.kcPriors).length).toBeGreaterThan(0);
    expect(JSON.stringify(view.result)).not.toMatch(/correct_answer|explanations|"correct"/i);
  });

  it('re-serves an open block on resume and refuses a replayed block token', async () => {
    const { api } = harness({ diagnostic: inMemoryDiagnosticPort() });
    const authed = { origin: APP_ORIGIN, authenticated: true } as const;

    const first = diagnosticView(await api.handle(request('POST', '/v1/diagnostic/next', {}, authed)));

    // A refresh mid-block: the stage is derived from the response log, so the same
    // items come back — only the one-use block token is reissued.
    const resumed = diagnosticView(
      await api.handle(
        request('POST', '/v1/diagnostic/next', { sessionToken: first.sessionToken }, authed),
      ),
    );
    expect(resumed.stageId).toBe(first.stageId);
    expect(resumed.questions.map((q) => q.id)).toEqual(first.questions.map((q) => q.id));
    expect(resumed.blockToken).not.toBe(first.blockToken);

    const answers = Object.fromEntries(resumed.questions.map((q) => [q.id, 'A']));
    const commit = (blockToken: string | null) =>
      api.handle(
        request(
          'POST',
          '/v1/diagnostic/block',
          { sessionToken: resumed.sessionToken, blockToken, stageId: resumed.stageId, answers },
          authed,
        ),
      );

    const committed = await commit(resumed.blockToken);
    expect(committed.statusCode).toBe(200);
    expect(diagnosticView(committed).stageId).not.toBe(first.stageId);

    // Replaying the committed block's token is refused (409) — a committed block
    // cannot be re-submitted.
    const replay = await commit(resumed.blockToken);
    expect(replay.statusCode).toBe(409);
  });

  it('answers 503 for the diagnostic when no diagnostic backend is configured', async () => {
    const { api } = harness();
    const authed = { origin: APP_ORIGIN, authenticated: true } as const;
    const response = await api.handle(request('POST', '/v1/diagnostic/next', {}, authed));
    expect(response.statusCode).toBe(503);
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
    const h = harness();
    const { api, principal, repository } = h;
    await teachTheWholeBank(h);
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
    const projection = repository.projectionFor(principal.learnerId)?.state as {
      mastery?: unknown;
    };
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
    const h = harness();
    const { api } = h;
    await teachTheWholeBank(h);
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

  /**
   * The seed route used to pass `command.seed` straight to the authority, with
   * the body check validating shape only. A caller could therefore name KC ids
   * of their choosing at the floor or the cap and change planner priority with
   * no diagnostic taken. It could never mint mastery — the ingress clamp holds
   * whatever arrives — which is what kept this bounded.
   *
   * The body below is well-formed under `MasterySeedSchema` and every value is
   * a legal probability. It is refused because no diagnostic could have
   * produced it.
   */
  it('refuses a mastery seed no diagnostic could have produced', async () => {
    const { api, principal, repository } = harness();
    const write = { origin: APP_ORIGIN, authenticated: true, csrf: CSRF_TOKEN } as const;

    const denied = await api.handle(
      request(
        'POST',
        '/v1/hooks/mastery-seed',
        {
          envelope: commandEnvelope(0),
          seed: {
            kcPriors: { 'V3-KC-000000': 0.05, 'kc-i-just-made-up': 0.4 },
            skillPriors: {},
            carsAbility: {},
          },
        },
        write,
      ),
    );

    expect(denied.statusCode).toBe(400);
    expect(repository.eventsFor(principal.learnerId)).toHaveLength(0);
    const projection = repository.projectionFor(principal.learnerId)?.state as {
      mastery?: { kc?: Record<string, unknown> };
    };
    expect(projection.mastery?.kc ?? {}).toEqual({});
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
        onboarding: { diagnosticComplete: false, planConfirmed: false },
        events: [],
        evidence: [],
      },
    });
    // A reset rebuilds the projection from `createGuest()`. That is precisely the
    // write that used to stamp `accountState: 'guest'` onto a linked learner.
    expect(repository.projectionFor(principal.learnerId)?.state).not.toHaveProperty('accountState');
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
      principalKind: 'linked',
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

describe('WS4 grounded rewrite route (POST /v1/ai/rewrite)', () => {
  const source = { rationale: 'The net force is zero, so the acceleration is zero.' };

  /** A stub provider that returns a clean, number-free (grounded) re-wording. */
  const groundedFetch: AiFetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      choices: [
        { message: { content: 'Put another way: with no net force there is no acceleration.' } },
      ],
    }),
    text: async () => 'ok',
  });

  function rewriteBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return { questionId: 'q-enz-passage-1', mode: 'example', source, ...overrides };
  }

  it('is registered as a session POST that does not mutate state', () => {
    const route = routeFor('POST', '/v1/ai/rewrite');
    expect(route?.id).toBe('aiRewrite');
    expect(route?.auth).toBe('session');
    expect(route?.stateChanging).toBe(false);
    expect(allowedMethodsFor('/v1/ai/rewrite')).toEqual(['POST']);
  });

  it('requires a session (401 for an anonymous caller)', async () => {
    const { api } = harness({ aiConfig: { apiKey: 'k', fetchImpl: groundedFetch } });
    const response = await api.handle(
      request('POST', '/v1/ai/rewrite', rewriteBody(), { origin: APP_ORIGIN }),
    );
    expect(response.statusCode).toBe(401);
  });

  it('refuses a cross-origin authenticated caller (403)', async () => {
    const { api } = harness({ aiConfig: { apiKey: 'k', fetchImpl: groundedFetch } });
    const response = await api.handle(
      request('POST', '/v1/ai/rewrite', rewriteBody(), {
        origin: EVIL_ORIGIN,
        authenticated: true,
      }),
    );
    expect(response.statusCode).toBe(403);
  });

  it('serves a grounded rewrite to an authenticated learner (no CSRF required)', async () => {
    const { api } = harness({ aiConfig: { apiKey: 'k', fetchImpl: groundedFetch } });
    const response = await api.handle(
      request('POST', '/v1/ai/rewrite', rewriteBody(), {
        origin: APP_ORIGIN,
        authenticated: true,
      }),
    );
    expect(response.statusCode).toBe(200);
    expect(response.headers?.['cache-control']).toBe('no-store');
    const body = responseBody(response) as { text: string; fallback: boolean };
    expect(body.fallback).toBe(false);
    expect(body.text).toContain('no acceleration');
    expect(JSON.stringify(body)).not.toMatch(/correct_choice_id|rationales/i);
  });

  it('is throttled by the per-session rate limiter like other authenticated routes', async () => {
    const { api, rateInputs } = harness({
      allowRate: false,
      aiConfig: { apiKey: 'k', fetchImpl: groundedFetch },
    });
    const response = await api.handle(
      request('POST', '/v1/ai/rewrite', rewriteBody(), {
        origin: APP_ORIGIN,
        authenticated: true,
      }),
    );
    expect(response.statusCode).toBe(429);
    expect(rateInputs).toHaveLength(1);
    expect(rateInputs[0]?.route).toBe('/v1/ai/rewrite');
  });

  it('returns 503 (client falls back) when no AI key is configured', async () => {
    const { api } = harness();
    const response = await api.handle(
      request('POST', '/v1/ai/rewrite', rewriteBody(), {
        origin: APP_ORIGIN,
        authenticated: true,
      }),
    );
    expect(response.statusCode).toBe(503);
  });

  it('rejects a malformed rewrite body with 400', async () => {
    const { api } = harness({ aiConfig: { apiKey: 'k', fetchImpl: groundedFetch } });
    const response = await api.handle(
      request('POST', '/v1/ai/rewrite', rewriteBody({ mode: 'nope' }), {
        origin: APP_ORIGIN,
        authenticated: true,
      }),
    );
    expect(response.statusCode).toBe(400);
  });

  it('rejects an oversize source with 400 before the provider is called', async () => {
    let providerCalls = 0;
    const countingFetch: AiFetch = async () => {
      providerCalls += 1;
      return { ok: true, status: 200, json: async () => ({ choices: [] }), text: async () => '' };
    };
    const { api } = harness({ aiConfig: { apiKey: 'k', fetchImpl: countingFetch } });
    const response = await api.handle(
      request('POST', '/v1/ai/rewrite', rewriteBody({ source: { rationale: 'x'.repeat(9_000) } }), {
        origin: APP_ORIGIN,
        authenticated: true,
      }),
    );
    expect(response.statusCode).toBe(400);
    expect(providerCalls).toBe(0);
  });
});

describe('CARS Duel opponent route (POST /v1/ai/chat)', () => {
  /** A stub provider that returns a duel opponent reply. */
  const chatFetch: AiFetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      choices: [{ message: { content: 'I hold that anonymity weakens the argument. Your move.' } }],
    }),
    text: async () => 'ok',
  });

  function chatBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return { messages: [{ role: 'user', content: 'Begin the debate.' }], ...overrides };
  }

  it('is registered as a session POST that does not mutate state, exactly like rewrite', () => {
    const route = routeFor('POST', '/v1/ai/chat');
    expect(route?.id).toBe('aiChat');
    expect(route?.auth).toBe('session');
    expect(route?.stateChanging).toBe(false);
    expect(allowedMethodsFor('/v1/ai/chat')).toEqual(['POST']);
  });

  it('requires a session (401 for an anonymous caller)', async () => {
    const { api } = harness({ aiConfig: { apiKey: 'k', fetchImpl: chatFetch } });
    const response = await api.handle(
      request('POST', '/v1/ai/chat', chatBody(), { origin: APP_ORIGIN }),
    );
    expect(response.statusCode).toBe(401);
  });

  it('refuses a cross-origin authenticated caller (403)', async () => {
    const { api } = harness({ aiConfig: { apiKey: 'k', fetchImpl: chatFetch } });
    const response = await api.handle(
      request('POST', '/v1/ai/chat', chatBody(), {
        origin: EVIL_ORIGIN,
        authenticated: true,
      }),
    );
    expect(response.statusCode).toBe(403);
  });

  it('serves an opponent reply to an authenticated learner (no CSRF required)', async () => {
    const { api } = harness({ aiConfig: { apiKey: 'k', fetchImpl: chatFetch } });
    const response = await api.handle(
      request('POST', '/v1/ai/chat', chatBody(), {
        origin: APP_ORIGIN,
        authenticated: true,
      }),
    );
    expect(response.statusCode).toBe(200);
    expect(response.headers?.['cache-control']).toBe('no-store');
    expect(responseBody(response)).toEqual({
      text: 'I hold that anonymity weakens the argument. Your move.',
    });
  });

  it('is throttled by the per-session rate limiter like other authenticated routes', async () => {
    const { api, rateInputs } = harness({
      allowRate: false,
      aiConfig: { apiKey: 'k', fetchImpl: chatFetch },
    });
    const response = await api.handle(
      request('POST', '/v1/ai/chat', chatBody(), {
        origin: APP_ORIGIN,
        authenticated: true,
      }),
    );
    expect(response.statusCode).toBe(429);
    expect(rateInputs).toHaveLength(1);
    expect(rateInputs[0]?.route).toBe('/v1/ai/chat');
  });

  it('returns 503 (client shows the opponent offline) when no AI key is configured', async () => {
    const { api } = harness();
    const response = await api.handle(
      request('POST', '/v1/ai/chat', chatBody(), {
        origin: APP_ORIGIN,
        authenticated: true,
      }),
    );
    expect(response.statusCode).toBe(503);
  });

  it('rejects a malformed chat body with 400', async () => {
    const { api } = harness({ aiConfig: { apiKey: 'k', fetchImpl: chatFetch } });
    const response = await api.handle(
      request('POST', '/v1/ai/chat', chatBody({ messages: 'nope' }), {
        origin: APP_ORIGIN,
        authenticated: true,
      }),
    );
    expect(response.statusCode).toBe(400);
  });

  it('rejects an oversize message list with 400 before the provider is called', async () => {
    let providerCalls = 0;
    const countingFetch: AiFetch = async () => {
      providerCalls += 1;
      return { ok: true, status: 200, json: async () => ({ choices: [] }), text: async () => '' };
    };
    const { api } = harness({ aiConfig: { apiKey: 'k', fetchImpl: countingFetch } });
    const response = await api.handle(
      request(
        'POST',
        '/v1/ai/chat',
        chatBody({ messages: [{ role: 'user', content: 'x'.repeat(25_000) }] }),
        { origin: APP_ORIGIN, authenticated: true },
      ),
    );
    expect(response.statusCode).toBe(400);
    expect(providerCalls).toBe(0);
  });
});
