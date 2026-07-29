import { Authority } from '@mcat/authority-core';
import {
  InMemoryAuthorityRepository,
  toProjectionRecord,
  type Principal,
} from '@mcat/authority-kernel';
import {
  CommandEnvelopeSchema,
  fixedClock,
  LessonItemBindingSchema,
  LessonRuntimeResponseFactsSchema,
  VectorLessonCommandSchema,
  VectorLessonStartCommandSchema,
} from '@mcat/contracts';
import { describe, expect, it } from 'vitest';
import { createRepositoryLearnerApi } from './handler';
import type { ApiGatewayV2Event } from './http';
import { hashOpaqueToken, type GuestSessionService } from './session';
import { VECTOR_LESSON_PROTECTED_ANSWERS } from './vector-lesson-protected';
import { RepositoryLearnerKernel, type LessonResponseSubmission } from './workflow';

const APP_ORIGIN = 'https://learner.example.test';
const NOW = '2026-07-23T18:00:00.000Z';
const SESSION_TOKEN = 's'.repeat(43);
const ROTATED_SESSION_TOKEN = 'r'.repeat(43);
const CSRF_TOKEN = 'c'.repeat(43);
const ORIGIN_VERIFICATION_SECRET = 'o'.repeat(64);
const clock = fixedClock(NOW);

function request(
  method: string,
  path: string,
  body?: unknown,
  options: { authenticated?: boolean; csrf?: boolean } = {},
): ApiGatewayV2Event {
  const headers: Record<string, string> = {
    'x-mcat-origin-verify': ORIGIN_VERIFICATION_SECRET,
    origin: APP_ORIGIN,
  };
  if (body !== undefined) headers['content-type'] = 'application/json';
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
    body: body === undefined ? undefined : JSON.stringify(body),
    isBase64Encoded: false,
  };
}

function envelope(expectedStreamVersion: number, idempotencyKey = crypto.randomUUID()) {
  return {
    eventId: crypto.randomUUID(),
    idempotencyKey,
    occurredAt: NOW,
    expectedStreamVersion,
    contentRelease: 'synthetic-2026.07',
    taskInstanceId: crypto.randomUUID(),
  };
}

function body(response: { body?: string }) {
  return JSON.parse(response.body ?? 'null') as Record<string, unknown>;
}

interface PersistedLessonState {
  readonly evidence: readonly Record<string, unknown>[];
  readonly mastery?: { readonly kc: Record<string, unknown> };
  readonly vectorLessonRun?: { readonly committedResponses: Record<string, unknown> };
}

function learnerState(
  repository: InMemoryAuthorityRepository,
  principal: Principal,
): PersistedLessonState {
  const projection = repository.projectionFor(principal.learnerId);
  if (projection === null) throw new Error('the learner projection is missing');
  return projection.state as unknown as PersistedLessonState;
}

function harness() {
  const authority = new Authority(undefined, clock);
  const state = authority.createGuest();
  state.onboarding.diagnosticComplete = true;
  authority.confirmPlan(state, { testDate: null, targetScore: 515, minutesPerWeek: 420 });
  const repository = new InMemoryAuthorityRepository([toProjectionRecord(state, 0, NOW)]);
  const principal: Principal = {
    kind: 'guest',
    learnerId: state.learnerId,
    sessionId: crypto.randomUUID(),
  };
  const sessions: GuestSessionService = {
    bootstrap: async () => ({
      principal,
      sessionToken: ROTATED_SESSION_TOKEN,
      csrfToken: CSRF_TOKEN,
      maxAgeSeconds: 3600,
    }),
    resolve: async (token) =>
      token === SESSION_TOKEN ? { principal, csrfTokenHash: hashOpaqueToken(CSRF_TOKEN) } : null,
  };
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
  return { authority, makeApi, principal, repository };
}

describe('V3-LES-130923 server-authoritative HTTP integration', () => {
  it('starts, persists, resumes, and commands only the target lesson', async () => {
    const { makeApi, principal, repository } = harness();
    const api = makeApi();

    const statusBefore = await api.handle(
      request('GET', '/v1/lessons/vectors-and-trigonometry/status', undefined, {
        authenticated: true,
      }),
    );
    expect(statusBefore.statusCode).toBe(200);
    expect(body(statusBefore)).toEqual({
      availability: 'AVAILABLE',
      runState: 'NOT_STARTED',
      actionLabel: 'Start',
    });

    const startCommand = {
      envelope: envelope(0),
      lessonId: 'V3-LES-130923',
    };
    const started = await api.handle(
      request('POST', '/v1/lessons/vectors-and-trigonometry/start', startCommand, {
        authenticated: true,
        csrf: true,
      }),
    );
    expect(started.statusCode).toBe(200);
    expect(body(started)).toMatchObject({
      disposition: 'STARTED',
      path: '/app/lessons/vectors-and-trigonometry',
      streamVersion: 1,
    });

    const firstRun = await api.handle(
      request('GET', '/v1/lessons/vectors-and-trigonometry/run', undefined, {
        authenticated: true,
      }),
    );
    expect(firstRun.statusCode).toBe(200);
    expect(body(firstRun)).toMatchObject({
      lessonTitle: 'Vectors and Trigonometry',
      state: 'IN_PROGRESS',
      screen: { kind: 'QUESTION' },
    });
    expect(JSON.stringify(body(firstRun))).not.toMatch(
      /correctChoiceId|correct_choice_id|answerKey|rationales|STANDARD|"A[0-3]"/,
    );

    const duplicate = await api.handle(
      request('POST', '/v1/lessons/vectors-and-trigonometry/start', startCommand, {
        authenticated: true,
        csrf: true,
      }),
    );
    expect(body(duplicate)).toEqual(body(started));
    expect(repository.eventsFor(principal.learnerId)).toHaveLength(1);

    const firstView = body(firstRun);
    const runId = firstView.runId as string;
    const screen = firstView.screen as { screenToken: string };
    const command = {
      envelope: envelope(1),
      runId,
      screenToken: screen.screenToken,
      action: { type: 'SUBMIT_RESPONSE', choiceId: 'A' },
    };
    const accepted = await api.handle(
      request('POST', '/v1/lessons/vectors-and-trigonometry/commands', command, {
        authenticated: true,
        csrf: true,
      }),
    );
    expect(accepted.statusCode).toBe(200);
    expect(body(accepted)).toMatchObject({ streamVersion: 2 });
    const duplicateCommand = await api.handle(
      request('POST', '/v1/lessons/vectors-and-trigonometry/commands', command, {
        authenticated: true,
        csrf: true,
      }),
    );
    expect(body(duplicateCommand)).toEqual(body(accepted));
    expect(repository.eventsFor(principal.learnerId)).toHaveLength(2);

    const stale = await api.handle(
      request(
        'POST',
        '/v1/lessons/vectors-and-trigonometry/commands',
        { ...command, envelope: envelope(2) },
        { authenticated: true, csrf: true },
      ),
    );
    expect(stale.statusCode).toBe(400);
    expect(body(stale)).toMatchObject({
      code: 'validation_error',
      retryable: false,
    });

    const refreshedApi = makeApi();
    const restored = await refreshedApi.handle(
      request('GET', '/v1/lessons/vectors-and-trigonometry/run', undefined, {
        authenticated: true,
      }),
    );
    expect(body(restored)).toMatchObject({
      runId,
      screen: { kind: 'FEEDBACK' },
    });
    expect(JSON.stringify(body(restored))).not.toMatch(/correctChoiceId|correct_choice_id/);
  });

  it('turns one committed response into one evidence record and no P(L) movement', async () => {
    const { makeApi, principal, repository } = harness();
    const api = makeApi();

    await api.handle(
      request(
        'POST',
        '/v1/lessons/vectors-and-trigonometry/start',
        { envelope: envelope(0), lessonId: 'V3-LES-130923' },
        { authenticated: true, csrf: true },
      ),
    );
    const view = body(
      await api.handle(
        request('GET', '/v1/lessons/vectors-and-trigonometry/run', undefined, {
          authenticated: true,
        }),
      ),
    ) as { runId: string; screen: { screenToken: string } };

    const submit = {
      envelope: envelope(1),
      runId: view.runId,
      screenToken: view.screen.screenToken,
      action: { type: 'SUBMIT_RESPONSE', choiceId: 'A' },
    };
    const accepted = await api.handle(
      request('POST', '/v1/lessons/vectors-and-trigonometry/commands', submit, {
        authenticated: true,
        csrf: true,
      }),
    );
    expect(accepted.statusCode).toBe(200);

    const state = learnerState(repository, principal);
    expect(state.evidence).toHaveLength(1);
    expect(state.evidence[0]).toMatchObject({
      skillId: 'V3-KC-866848',
      cluster: 'R1',
      kind: 'instruction',
      // The entry check's screen carries no scaffold and offers no cue, and the
      // runtime observed that it displayed neither, so this really was an
      // independent administration. The level comes from the delivery ledger the
      // runtime wrote at commitment, never from the item's authored byte — that
      // byte no longer reaches the response record at all.
      independent: true,
      assistanceLevel: 'A0',
      questionId: 'vtr-vec-entry-check-1',
      itemVersion: 1,
      valid: true,
    });
    // Zero qualified observations means the engine was never touched at all.
    expect(state.mastery).toBeUndefined();

    const events = repository.eventsFor(principal.learnerId);
    expect(events).toHaveLength(2);
    expect(events[1]?.payload.lessonResponse).toMatchObject({
      status: 'adapted',
      evidenceId: events[1]?.eventId,
      evidenceKind: 'instruction',
      bkt: 'not_qualified',
      // One reason left, not two. The assistance fail-close is gone; what still
      // holds P(L) still is the authored declaration, which is what the queued
      // Phase 7 relabelling addresses — and could not have addressed while every
      // response also collected ASSISTANCE_NOT_A0.
      rejectionCodes: ['INDEPENDENT_EVIDENCE_MODE_NOT_DECLARED'],
      // The level, and that the runtime MEASURED it rather than fail-closing.
      assistance: { level: 'A0', observed: true },
      // The binding-load diagnostics ride on every accepted response, so an
      // unmapped author key or a withheld binding can never be silent.
      binding: { resolution: 'parsed', unrecognizedKeys: [] },
    });
    expect(JSON.stringify(events)).not.toMatch(
      /correctChoiceId|correct_choice_id|server-only:|answerKey|rationale/i,
    );

    // A replay of the same command resolves to the stored result and must not
    // append a second event or a second evidence record.
    const replay = await api.handle(
      request('POST', '/v1/lessons/vectors-and-trigonometry/commands', submit, {
        authenticated: true,
        csrf: true,
      }),
    );
    expect(body(replay)).toEqual(body(accepted));
    expect(repository.eventsFor(principal.learnerId)).toHaveLength(2);
    expect(learnerState(repository, principal).evidence).toHaveLength(1);
  });

  it('leaves no partial state when persistence fails after the response is adapted', async () => {
    const { makeApi, principal, repository } = harness();
    const api = makeApi();

    await api.handle(
      request(
        'POST',
        '/v1/lessons/vectors-and-trigonometry/start',
        { envelope: envelope(0), lessonId: 'V3-LES-130923' },
        { authenticated: true, csrf: true },
      ),
    );
    const view = body(
      await api.handle(
        request('GET', '/v1/lessons/vectors-and-trigonometry/run', undefined, {
          authenticated: true,
        }),
      ),
    ) as { runId: string; screen: { screenToken: string } };
    const before = repository.projectionFor(principal.learnerId);

    repository.failNextAfterAppendAccepted();
    let failed = false;
    try {
      const response = await api.handle(
        request(
          'POST',
          '/v1/lessons/vectors-and-trigonometry/commands',
          {
            envelope: envelope(1),
            runId: view.runId,
            screenToken: view.screen.screenToken,
            action: { type: 'SUBMIT_RESPONSE', choiceId: 'A' },
          },
          { authenticated: true, csrf: true },
        ),
      );
      failed = response.statusCode >= 500;
    } catch {
      failed = true;
    }

    expect(failed).toBe(true);
    expect(repository.eventsFor(principal.learnerId)).toHaveLength(1);
    expect(repository.projectionFor(principal.learnerId)).toEqual(before);
    expect(learnerState(repository, principal).evidence).toEqual([]);
  });

  it('rejects another lesson identity and leaves it unavailable', async () => {
    const { makeApi } = harness();
    const response = await makeApi().handle(
      request(
        'POST',
        '/v1/lessons/vectors-and-trigonometry/start',
        { envelope: envelope(0), lessonId: 'V3-LES-789208' },
        { authenticated: true, csrf: true },
      ),
    );
    expect(response.statusCode).toBe(400);
  });

  it('persists trusted internal invalidation and an untouched replacement family', async () => {
    const { authority, makeApi, principal, repository } = harness();
    const api = makeApi();
    let streamVersion = 0;
    const started = await api.handle(
      request(
        'POST',
        '/v1/lessons/vectors-and-trigonometry/start',
        { envelope: envelope(streamVersion), lessonId: 'V3-LES-130923' },
        { authenticated: true, csrf: true },
      ),
    );
    streamVersion = body(started).streamVersion as number;

    for (let guard = 0; guard < 80; guard += 1) {
      const projection = await repository.loadProjection(principal.learnerId);
      const lessonRun = projection?.state.vectorLessonRun as
        | { currentItemId: string | null; runId: string }
        | undefined;
      if (lessonRun?.currentItemId === 'vtr-vec-near-exit-initial') break;
      const current = body(
        await api.handle(
          request('GET', '/v1/lessons/vectors-and-trigonometry/run', undefined, {
            authenticated: true,
          }),
        ),
      ) as {
        runId: string;
        screen: { kind: string; screenToken: string };
      };
      const action =
        current.screen.kind === 'QUESTION'
          ? {
              type: 'SUBMIT_RESPONSE',
              choiceId:
                VECTOR_LESSON_PROTECTED_ANSWERS[lessonRun?.currentItemId ?? '']?.correctChoiceId,
            }
          : { type: 'CONTINUE' };
      const accepted = await api.handle(
        request(
          'POST',
          '/v1/lessons/vectors-and-trigonometry/commands',
          {
            envelope: envelope(streamVersion),
            runId: current.runId,
            screenToken: current.screen.screenToken,
            action,
          },
          { authenticated: true, csrf: true },
        ),
      );
      streamVersion = body(accepted).streamVersion as number;
    }

    const kernel = new RepositoryLearnerKernel({
      repository,
      clock,
      bank: authority.bank,
    });
    await kernel.handleVectorLessonInvalidation(
      CommandEnvelopeSchema.parse(envelope(streamVersion)),
      principal,
    );
    const projection = await repository.loadProjection(principal.learnerId);
    expect(projection?.state.vectorLessonRun).toMatchObject({
      currentItemId: 'vtr-vec-near-exit-reentry',
      status: 'IN_PROGRESS',
    });
  });

  it('persists a full three-KC delivery through the real HTTP kernel to neutral completion', async () => {
    const { makeApi, principal, repository } = harness();
    let api = makeApi();
    let streamVersion = 0;
    const started = await api.handle(
      request(
        'POST',
        '/v1/lessons/vectors-and-trigonometry/start',
        { envelope: envelope(streamVersion), lessonId: 'V3-LES-130923' },
        { authenticated: true, csrf: true },
      ),
    );
    streamVersion = body(started).streamVersion as number;

    for (let guard = 0; guard < 300; guard += 1) {
      const response = await api.handle(
        request('GET', '/v1/lessons/vectors-and-trigonometry/run', undefined, {
          authenticated: true,
        }),
      );
      const view = body(response) as {
        state: string;
        runId: string;
        screen: { kind: string; screenToken: string };
      };
      if (view.state === 'DELIVERY_COMPLETE') break;

      const projection = await repository.loadProjection(principal.learnerId);
      const lessonRun = projection?.state.vectorLessonRun as
        | { currentItemId: string | null }
        | undefined;
      const action =
        view.screen.kind === 'QUESTION'
          ? {
              type: 'SUBMIT_RESPONSE',
              choiceId:
                VECTOR_LESSON_PROTECTED_ANSWERS[lessonRun?.currentItemId ?? '']?.correctChoiceId,
            }
          : { type: 'CONTINUE' };
      expect(
        action.type === 'CONTINUE' ||
          (action.type === 'SUBMIT_RESPONSE' && action.choiceId !== undefined),
      ).toBe(true);
      const commandResponse = await api.handle(
        request(
          'POST',
          '/v1/lessons/vectors-and-trigonometry/commands',
          {
            envelope: envelope(streamVersion),
            runId: view.runId,
            screenToken: view.screen.screenToken,
            action,
          },
          { authenticated: true, csrf: true },
        ),
      );
      expect(commandResponse.statusCode).toBe(200);
      streamVersion = body(commandResponse).streamVersion as number;
      if (guard % 9 === 0) api = makeApi();
    }

    const completed = await api.handle(
      request('GET', '/v1/lessons/vectors-and-trigonometry/run', undefined, {
        authenticated: true,
      }),
    );
    expect(body(completed)).toMatchObject({
      state: 'DELIVERY_COMPLETE',
      screen: {
        kind: 'COMPLETION',
        heading: 'You finished this lesson’s required instruction.',
        body: [],
      },
    });
    const projection = await repository.loadProjection(principal.learnerId);
    expect(projection?.state.vectorLessonRun).toMatchObject({
      exitedKcIds: ['V3-KC-866848', 'V3-KC-700208', 'V3-KC-159529'],
      status: 'DELIVERY_COMPLETE',
    });
    expect(JSON.stringify(projection?.state.vectorLessonRun)).not.toMatch(/"mastery"|"readiness"/i);

    // One committed response, one evidence record, across the whole delivery —
    // and all 42 bindings are instructional-only, so nothing reaches BKT.
    const persisted = learnerState(repository, principal);
    const committed = Object.keys(persisted.vectorLessonRun?.committedResponses ?? {});
    expect(committed.length).toBeGreaterThan(0);
    expect(persisted.evidence).toHaveLength(committed.length);
    expect(new Set(persisted.evidence.map((record) => record.evidenceId)).size).toBe(
      committed.length,
    );
    expect(new Set(persisted.evidence.map((record) => record.kind))).toEqual(
      new Set(['instruction']),
    );
    expect(persisted.mastery).toBeUndefined();

    const reopened = await api.handle(
      request(
        'POST',
        '/v1/lessons/vectors-and-trigonometry/start',
        { envelope: envelope(streamVersion), lessonId: 'V3-LES-130923' },
        { authenticated: true, csrf: true },
      ),
    );
    expect(body(reopened)).toMatchObject({
      disposition: 'ALREADY_COMPLETE',
      path: '/app/lessons/vectors-and-trigonometry',
    });
    const finalStatus = await api.handle(
      request('GET', '/v1/lessons/vectors-and-trigonometry/status', undefined, {
        authenticated: true,
      }),
    );
    expect(body(finalStatus)).toEqual({
      availability: 'AVAILABLE',
      runState: 'DELIVERY_COMPLETE',
      actionLabel: 'Continue',
    });
  });
});

describe('a refused BKT application leaves no evidence behind', () => {
  /**
   * A BKT-eligible, future-dated response. No on-disk artifact can express this
   * yet — all 115 real bindings are instructional-only (§11) — so the submission
   * source is injected rather than driven through the vector lesson runtime.
   */
  function poisonedSubmission(): LessonResponseSubmission {
    return {
      lessonId: 'V3-LES-130923',
      envelopeBindingVersion: 'internal-draft-1',
      binding: LessonItemBindingSchema.parse({
        measurementKind: 'MEASURABLE',
        lessonId: 'V3-LES-130923',
        itemBindingId: 'refusal-probe-binding',
        bindingVersion: 'internal-draft-1',
        primaryKcId: 'V3-KC-866848',
        secondaryKcMappings: [],
        activityRole: 'SOLO_PRACTICE',
        semanticFamilyId: 'fam-refusal-probe',
        authoredAssistanceAffordances: ['NONE'],
        candidateEvidenceModes: ['INDEPENDENT'],
        reasoningOperation: 'QUANTIFY',
        representationId: null,
        changedDimensions: [],
        learnerSafeItemRef: 'refusal-probe-ref',
        questionId: 'refusal-probe-question',
        activityId: 'refusal-probe-activity',
        firstAttemptImmutable: true,
        serverScoringAuthorityRef: 'server-only://refusal-probe',
      }),
      bindingResolution: { status: 'parsed', unrecognizedKeys: [] },
      assistanceObserved: true,
      response: LessonRuntimeResponseFactsSchema.parse({
        questionId: 'refusal-probe-question',
        itemBindingId: 'refusal-probe-binding',
        bindingVersion: 'internal-draft-1',
        attemptIndex: 1,
        isRetry: false,
        isDiagnosticRetry: false,
        response: { kind: 'MULTIPLE_CHOICE', chosenChoiceId: 'A' },
        omitted: false,
        elapsedMs: 30_000,
        answerChanges: 0,
        assistanceLevel: 'A0',
        contentBearingHintUsed: false,
        revealUsed: false,
        mixedAdministration: false,
        passageAdministration: false,
        timedAdministration: false,
        occurredAt: '2999-01-01T00:00:00.000Z',
      }),
      scoring: {
        scoringValid: true,
        serverItemVersion: 1,
        outcome: 'correct',
        protectedScoring: false,
      },
    };
  }

  it('refuses the evidence record and the P(L) update together', async () => {
    const { authority, principal, repository } = harness();
    const kernel = new RepositoryLearnerKernel({
      repository,
      clock,
      bank: authority.bank,
      lessonResponseSubmissions: () => [poisonedSubmission()],
    });

    await kernel.handleVectorLessonStart(
      VectorLessonStartCommandSchema.parse({ envelope: envelope(0), lessonId: 'V3-LES-130923' }),
      principal,
    );
    const run = (await kernel.vectorLessonRun(principal)) as {
      runId: string;
      screen: { screenToken: string };
    };

    const accepted = await kernel.handleVectorLessonCommand(
      VectorLessonCommandSchema.parse({
        envelope: envelope(1),
        runId: run.runId,
        screenToken: run.screen.screenToken,
        action: { type: 'SUBMIT_RESPONSE', choiceId: 'A' },
      }),
      principal,
    );

    expect(accepted).toBeDefined();

    const persisted = learnerState(repository, principal) as PersistedLessonState & {
      readonly events: readonly { type: string; payload: Record<string, unknown> }[];
    };

    // Before the fix the evidence record landed first and survived the refusal,
    // leaving a permanently-fresh warrant for a response the server declined.
    expect(persisted.evidence).toEqual([]);
    // And no P(L) moved either — both authorities refused, not one.
    expect(persisted.mastery?.kc ?? {}).toEqual({});

    // The refusal itself is still on the ledger, with the runner's raw claim.
    const refusals = persisted.events.filter((e) => e.type === 'bkt_observation_applied');
    expect(refusals).toHaveLength(1);
    expect(refusals[0]!.payload).toMatchObject({
      reportedOccurredAt: '2999-01-01T00:00:00.000Z',
      appliedOccurredAt: null,
      rejectionCodes: ['OBSERVATION_TIMESTAMP_IN_FUTURE'],
    });
  });
});
