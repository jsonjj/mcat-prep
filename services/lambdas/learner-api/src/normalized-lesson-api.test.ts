import { Authority } from '@mcat/authority-core';
import { InMemoryAuthorityRepository, toProjectionRecord } from '@mcat/authority-kernel';
import { fixedClock } from '@mcat/contracts';
import { describe, expect, it } from 'vitest';

import { createRepositoryLearnerApi } from './handler';
import type { ApiGatewayV2Event } from './http';
import { createRepoLessonContentProvider, type ServerItemAnswer } from './lesson-content-provider';
import type { EngineResponse } from './normalized-lesson-runtime';
import { createLinkedSessionDouble } from './test-support/linked-session';

/**
 * Server-authoritative HTTP integration for the normalized-engine catalog (L2/L3
 * — Phase 5, wave 5C). L1 keeps its bespoke slug routes (see
 * `vector-lesson-api.test.ts`); these prove that the SHARED, slug-parameterized
 * routes drive both other lessons through the real `createRepositoryLearnerApi`
 * handler + kernel + repository: status → start → run → commands, learner-safe
 * throughout, and — for L3 — all the way to completion with evidence and a moved
 * P(L) on a licensed changed exit. No answer key ever crosses the wire.
 */

const APP_ORIGIN = 'https://learner.example.test';
const NOW = '2026-07-30T18:00:00.000Z';
const SESSION_TOKEN = 's'.repeat(43);
const CSRF_TOKEN = 'c'.repeat(43);
const ORIGIN_VERIFICATION_SECRET = 'o'.repeat(64);
const clock = fixedClock(NOW);

const L2 = 'V3-LES-789208';
const L3 = 'V3-LES-844372';
const L2_SLUG = 'v3-les-789208';
const L3_SLUG = 'v3-les-844372';

const provider = createRepoLessonContentProvider();

/** The correct committed response for a scored item, from the SERVER-ONLY key. */
function correctResponseFor(lessonId: string, itemId: string): EngineResponse {
  const answer: ServerItemAnswer | undefined = provider.getAnswerKey(lessonId).byItemId[itemId];
  if (answer === undefined) throw new Error(`no answer for ${itemId}`);
  if (answer.correctChoiceId !== null) {
    return { kind: 'MULTIPLE_CHOICE', choiceId: answer.correctChoiceId };
  }
  if (answer.structuredAuthority !== undefined) {
    return {
      kind: 'CONSTRUCTED',
      fields: Object.fromEntries(answer.acceptedResponses.map((part, index) => [`f${index}`, part])),
    };
  }
  return { kind: 'SHORT', text: answer.acceptedResponses[0] ?? '' };
}

function request(
  method: string,
  path: string,
  requestBody?: unknown,
  options: { authenticated?: boolean; csrf?: boolean } = {},
): ApiGatewayV2Event {
  const headers: Record<string, string> = {
    'x-mcat-origin-verify': ORIGIN_VERIFICATION_SECRET,
    origin: APP_ORIGIN,
  };
  if (requestBody !== undefined) headers['content-type'] = 'application/json';
  if (options.csrf) headers['x-csrf-token'] = CSRF_TOKEN;
  return {
    version: '2.0',
    rawPath: path,
    headers,
    cookies: options.authenticated
      ? [`__Host-mcat_session=${SESSION_TOKEN}`, `__Host-mcat_csrf=${CSRF_TOKEN}`]
      : [],
    requestContext: {
      requestId: crypto.randomUUID(),
      http: { method, path, sourceIp: '203.0.113.42' },
    },
    body: requestBody === undefined ? undefined : JSON.stringify(requestBody),
    isBase64Encoded: false,
  };
}

function envelope(expectedStreamVersion: number) {
  return {
    eventId: crypto.randomUUID(),
    idempotencyKey: crypto.randomUUID(),
    occurredAt: NOW,
    expectedStreamVersion,
    contentRelease: 'synthetic-2026.07',
    taskInstanceId: crypto.randomUUID(),
  };
}

function body(response: { body?: string }) {
  return JSON.parse(response.body ?? 'null') as Record<string, unknown>;
}

interface PersistedGrain {
  readonly pL: number;
}

interface PersistedLessonState {
  readonly evidence: readonly { readonly kind?: string }[];
  readonly mastery?: {
    readonly kc: Record<string, PersistedGrain | undefined>;
    readonly practicedLessonIds: readonly string[];
  };
  readonly normalizedLessonRuns?: Record<string, { readonly status: string } | undefined>;
}

function harness() {
  const authority = new Authority(undefined, clock);
  const state = authority.createGuest();
  state.onboarding.diagnosticComplete = true;
  authority.confirmPlan(state, { testDate: null, targetScore: 515, minutesPerWeek: 420 });
  const repository = new InMemoryAuthorityRepository([toProjectionRecord(state, 0, NOW)]);
  const { principal, sessions } = createLinkedSessionDouble({
    learnerId: state.learnerId,
    sessionId: crypto.randomUUID(),
    sessionToken: SESSION_TOKEN,
    csrfToken: CSRF_TOKEN,
  });
  const makeApi = () =>
    createRepositoryLearnerApi({
      repository,
      clock,
      bank: authority.bank,
      sessions,
      allowedOrigins: [APP_ORIGIN],
      originVerificationSecret: ORIGIN_VERIFICATION_SECRET,
      rateLimitPepper: 'p'.repeat(32),
      rateLimiter: { allow: async () => true },
      logger: { info: () => undefined },
      nowMs: () => Date.parse(NOW),
    });
  const learnerState = (): PersistedLessonState => {
    const projection = repository.projectionFor(principal.learnerId);
    if (projection === null) throw new Error('the learner projection is missing');
    return projection.state as unknown as PersistedLessonState;
  };
  return { makeApi, principal, repository, learnerState };
}

const ANSWER_LEAK =
  /correctChoiceId|correct_choice_id|correct_option_index|answerKey|accepted_responses|response_authority|rationale/i;

describe('normalized-engine catalog: server-authoritative HTTP integration', () => {
  it('routes Lesson 3 status → start → run → commands and never leaks an answer', async () => {
    const { makeApi } = harness();
    const api = makeApi();

    const statusBefore = await api.handle(
      request('GET', `/v1/lessons/${L3_SLUG}/status`, undefined, { authenticated: true }),
    );
    expect(statusBefore.statusCode).toBe(200);
    expect(body(statusBefore)).toEqual({
      availability: 'AVAILABLE',
      runState: 'NOT_STARTED',
      actionLabel: 'Start',
    });

    const started = await api.handle(
      request(
        'POST',
        `/v1/lessons/${L3_SLUG}/start`,
        { envelope: envelope(0), lessonId: L3 },
        { authenticated: true, csrf: true },
      ),
    );
    expect(started.statusCode).toBe(200);
    expect(body(started)).toMatchObject({ disposition: 'STARTED', streamVersion: 1 });

    const firstRun = await api.handle(
      request('GET', `/v1/lessons/${L3_SLUG}/run`, undefined, { authenticated: true }),
    );
    expect(firstRun.statusCode).toBe(200);
    const firstView = body(firstRun);
    expect(firstView).toMatchObject({ lessonId: L3, status: 'IN_PROGRESS' });
    expect(JSON.stringify(firstView)).not.toMatch(ANSWER_LEAK);

    // A duplicate start resumes the SAME run rather than forking a second.
    const resumed = await api.handle(
      request(
        'POST',
        `/v1/lessons/${L3_SLUG}/start`,
        { envelope: envelope(1), lessonId: L3 },
        { authenticated: true, csrf: true },
      ),
    );
    expect(body(resumed)).toMatchObject({
      disposition: 'RESUMED',
      runId: firstView.runId as string,
    });

    // Advance one screen through the commands route.
    const screen = firstView.screen as { kind: string; itemId?: string };
    const action =
      screen.kind === 'QUESTION'
        ? { type: 'SUBMIT_RESPONSE', response: correctResponseFor(L3, screen.itemId!) }
        : { type: 'CONTINUE' };
    const accepted = await api.handle(
      request(
        'POST',
        `/v1/lessons/${L3_SLUG}/commands`,
        { envelope: envelope(2), action },
        { authenticated: true, csrf: true },
      ),
    );
    expect(accepted.statusCode).toBe(200);
    expect(body(accepted)).toMatchObject({ streamVersion: 3 });
    expect(JSON.stringify(body(accepted))).not.toMatch(ANSWER_LEAK);
  });

  it('drives Lesson 3 to completion through HTTP: evidence written, P(L) moves on a licensed exit', async () => {
    const { makeApi, principal, repository, learnerState } = harness();
    let api = makeApi();

    let streamVersion = body(
      await api.handle(
        request(
          'POST',
          `/v1/lessons/${L3_SLUG}/start`,
          { envelope: envelope(0), lessonId: L3 },
          { authenticated: true, csrf: true },
        ),
      ),
    ).streamVersion as number;

    for (let guard = 0; guard < 400; guard += 1) {
      const runResponse = await api.handle(
        request('GET', `/v1/lessons/${L3_SLUG}/run`, undefined, { authenticated: true }),
      );
      const view = body(runResponse) as {
        status: string;
        screen: { kind: string; itemId?: string };
      };
      // Learner-safety holds on every screen of the whole delivery.
      expect(JSON.stringify(view)).not.toMatch(ANSWER_LEAK);
      if (view.screen.kind === 'COMPLETE' || view.screen.kind === 'BLOCKED') break;

      const action =
        view.screen.kind === 'QUESTION'
          ? { type: 'SUBMIT_RESPONSE', response: correctResponseFor(L3, view.screen.itemId!) }
          : { type: 'CONTINUE' };
      const commandResponse = await api.handle(
        request(
          'POST',
          `/v1/lessons/${L3_SLUG}/commands`,
          { envelope: envelope(streamVersion), action },
          { authenticated: true, csrf: true },
        ),
      );
      expect(commandResponse.statusCode).toBe(200);
      streamVersion = body(commandResponse).streamVersion as number;
      // Refresh the handler periodically to prove the run survives restore.
      if (guard % 7 === 0) api = makeApi();
    }

    const completed = await api.handle(
      request('GET', `/v1/lessons/${L3_SLUG}/run`, undefined, { authenticated: true }),
    );
    expect(body(completed)).toMatchObject({
      status: 'DELIVERY_COMPLETE',
      screen: { kind: 'COMPLETE' },
    });

    const persisted = learnerState();
    expect(persisted.normalizedLessonRuns?.[L3]?.status).toBe('DELIVERY_COMPLETE');
    // One evidence record per committed response, at least one a transfer warrant
    // from a licensed changed exit.
    expect(persisted.evidence.length).toBeGreaterThan(0);
    expect(persisted.evidence.some((record) => record.kind === 'transfer')).toBe(true);
    // P(L) moved on the GRAPH changed-exit KC through the real HTTP kernel, and
    // the lesson is on the audited-practice list.
    expect(persisted.mastery?.kc['V3-KC-452593']?.pL ?? 0).toBeGreaterThan(0.2);
    expect(persisted.mastery?.practicedLessonIds).toContain(L3);

    // Reopening a completed lesson reports ALREADY_COMPLETE, not a fresh start.
    const reopened = await api.handle(
      request(
        'POST',
        `/v1/lessons/${L3_SLUG}/start`,
        { envelope: envelope(streamVersion), lessonId: L3 },
        { authenticated: true, csrf: true },
      ),
    );
    expect(body(reopened)).toMatchObject({ disposition: 'ALREADY_COMPLETE' });
    expect(repository.projectionFor(principal.learnerId)).not.toBeNull();
  });

  it('routes Lesson 2 on its own slug and keeps it independent of Lesson 3', async () => {
    const { makeApi } = harness();
    const api = makeApi();

    const started = await api.handle(
      request(
        'POST',
        `/v1/lessons/${L2_SLUG}/start`,
        { envelope: envelope(0), lessonId: L2 },
        { authenticated: true, csrf: true },
      ),
    );
    expect(started.statusCode).toBe(200);
    expect(body(started)).toMatchObject({ disposition: 'STARTED' });

    const run = await api.handle(
      request('GET', `/v1/lessons/${L2_SLUG}/run`, undefined, { authenticated: true }),
    );
    expect(body(run)).toMatchObject({ lessonId: L2, status: 'IN_PROGRESS' });
    expect(JSON.stringify(body(run))).not.toMatch(ANSWER_LEAK);

    // Lesson 3 was never started for this learner, so its status is independent.
    const l3Status = await api.handle(
      request('GET', `/v1/lessons/${L3_SLUG}/status`, undefined, { authenticated: true }),
    );
    expect(body(l3Status)).toMatchObject({ runState: 'NOT_STARTED' });
  });

  it('rejects a start whose body id does not match the route slug', async () => {
    const { makeApi } = harness();
    const denied = await makeApi().handle(
      request(
        'POST',
        `/v1/lessons/${L2_SLUG}/start`,
        { envelope: envelope(0), lessonId: L3 },
        { authenticated: true, csrf: true },
      ),
    );
    expect(denied.statusCode).toBe(400);
  });

  it('404s an unregistered lesson slug (the closed catalog is the only authority)', async () => {
    const { makeApi } = harness();
    const missing = await makeApi().handle(
      request('GET', '/v1/lessons/v3-les-999999/status', undefined, { authenticated: true }),
    );
    expect(missing.statusCode).toBe(404);
  });

  it('requires a session on the normalized-lesson routes', async () => {
    const { makeApi } = harness();
    const anonymous = await makeApi().handle(
      request('GET', `/v1/lessons/${L3_SLUG}/status`, undefined, { authenticated: false }),
    );
    expect(anonymous.statusCode).toBe(401);
  });
});
