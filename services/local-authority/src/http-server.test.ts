import { readFileSync } from 'node:fs';
import { request as httpRequest } from 'node:http';
import { assertNoProtectedFields } from '@mcat/content';
import {
  VectorLessonRunViewSchema,
  VectorLessonStartResponseSchema,
  VectorLessonStatusViewSchema,
  newEventId,
  newIdempotencyKey,
  newTaskInstanceId,
} from '@mcat/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEBUG_LEARNER_STATE_PATH,
  DEBUG_STATE_OPT_IN_ENV_VAR,
  type DebugLearnerStateView,
} from './debug-state';
import {
  allowedOrigins,
  createLocalLessonHttpServer,
  isLoopbackHostHeader,
  type RunningLocalLessonServer,
} from './http-server';

const running: RunningLocalLessonServer[] = [];
const LOCAL_HEADERS = { origin: 'http://127.0.0.1:5173' };

afterEach(async () => {
  await Promise.all(running.splice(0).map((server) => server.close()));
  vi.unstubAllEnvs();
});

/** `fetch` silently drops a caller-set `Host`, so spoofing it needs a raw socket. */
function rawGet(
  port: number,
  path: string,
  headers: Record<string, string>,
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      { host: '127.0.0.1', port, path, method: 'GET', headers, setHost: false },
      (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk: string) => (body += chunk));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
      },
    );
    req.on('error', reject);
    req.end();
  });
}

/** Drive the harness far enough to have accepted commands and a lesson in play. */
async function runOneLessonQuestion(server: RunningLocalLessonServer): Promise<void> {
  const bootstrap = (await (
    await fetch(`${server.baseUrl}/v1/bootstrap`, { method: 'POST', headers: LOCAL_HEADERS })
  ).json()) as { streamVersion: number; contentRelease: string };

  const envelope = {
    eventId: newEventId(),
    idempotencyKey: newIdempotencyKey(),
    occurredAt: new Date().toISOString(),
    expectedStreamVersion: bootstrap.streamVersion,
    contentRelease: bootstrap.contentRelease,
    taskInstanceId: newTaskInstanceId(),
  };
  const started = VectorLessonStartResponseSchema.parse(
    await (
      await fetch(`${server.baseUrl}/v1/lessons/vectors-and-trigonometry/start`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...LOCAL_HEADERS },
        body: JSON.stringify({ envelope, lessonId: 'V3-LES-130923' }),
      })
    ).json(),
  );
  const view = VectorLessonRunViewSchema.parse(
    await (
      await fetch(`${server.baseUrl}/v1/lessons/vectors-and-trigonometry/run`, {
        headers: LOCAL_HEADERS,
      })
    ).json(),
  );
  const submitted = await fetch(`${server.baseUrl}/v1/lessons/vectors-and-trigonometry/commands`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...LOCAL_HEADERS },
    body: JSON.stringify({
      envelope: {
        ...envelope,
        eventId: newEventId(),
        idempotencyKey: newIdempotencyKey(),
        expectedStreamVersion: started.streamVersion,
      },
      runId: view.runId,
      screenToken: view.screen.screenToken,
      action: { type: 'SUBMIT_RESPONSE', choiceId: 'A' },
    }),
  });
  expect(submitted.status).toBe(200);
}

describe('local lesson HTTP authority', () => {
  it('starts and scores V3-LES-130923 through the real server runtime', async () => {
    const server = await createLocalLessonHttpServer({ port: 0 });
    running.push(server);

    const bootstrapResponse = await fetch(`${server.baseUrl}/v1/bootstrap`, {
      method: 'POST',
      headers: { origin: 'http://127.0.0.1:5173' },
    });
    expect(bootstrapResponse.status).toBe(200);
    const bootstrap = (await bootstrapResponse.json()) as {
      streamVersion: number;
      contentRelease: string;
      onboardingComplete: boolean;
    };
    expect(bootstrap.onboardingComplete).toBe(true);

    const status = VectorLessonStatusViewSchema.parse(
      await (
        await fetch(`${server.baseUrl}/v1/lessons/vectors-and-trigonometry/status`, {
          headers: { origin: 'http://127.0.0.1:5173' },
        })
      ).json(),
    );
    expect(status).toEqual({
      availability: 'AVAILABLE',
      runState: 'NOT_STARTED',
      actionLabel: 'Start',
    });

    const envelope = {
      eventId: newEventId(),
      idempotencyKey: newIdempotencyKey(),
      occurredAt: new Date().toISOString(),
      expectedStreamVersion: bootstrap.streamVersion,
      contentRelease: bootstrap.contentRelease,
      taskInstanceId: newTaskInstanceId(),
    };
    const started = VectorLessonStartResponseSchema.parse(
      await (
        await fetch(`${server.baseUrl}/v1/lessons/vectors-and-trigonometry/start`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            origin: 'http://127.0.0.1:5173',
          },
          body: JSON.stringify({ envelope, lessonId: 'V3-LES-130923' }),
        })
      ).json(),
    );
    expect(started.disposition).toBe('STARTED');

    const view = VectorLessonRunViewSchema.parse(
      await (
        await fetch(`${server.baseUrl}/v1/lessons/vectors-and-trigonometry/run`, {
          headers: { origin: 'http://127.0.0.1:5173' },
        })
      ).json(),
    );
    expect(view.screen.kind).toBe('QUESTION');

    const commandResponse = await fetch(
      `${server.baseUrl}/v1/lessons/vectors-and-trigonometry/commands`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: 'http://127.0.0.1:5173',
        },
        body: JSON.stringify({
          envelope: {
            ...envelope,
            eventId: newEventId(),
            idempotencyKey: newIdempotencyKey(),
            expectedStreamVersion: started.streamVersion,
          },
          runId: view.runId,
          screenToken: view.screen.screenToken,
          action: { type: 'SUBMIT_RESPONSE', choiceId: 'A' },
        }),
      },
    );
    expect(commandResponse.status).toBe(200);

    const feedback = VectorLessonRunViewSchema.parse(
      await (
        await fetch(`${server.baseUrl}/v1/lessons/vectors-and-trigonometry/run`, {
          headers: { origin: 'http://127.0.0.1:5173' },
        })
      ).json(),
    );
    expect(feedback.screen.kind).toBe('FEEDBACK');
    expect(JSON.stringify(feedback)).not.toMatch(/correctChoiceId|correct_choice_id/);
  });
});

describe('local debug learner-state route', () => {
  it('does not exist without the explicit opt-in, even on loopback', async () => {
    vi.stubEnv(DEBUG_STATE_OPT_IN_ENV_VAR, undefined);
    const server = await createLocalLessonHttpServer({ port: 0 });
    running.push(server);

    const denied = await fetch(`${server.baseUrl}${DEBUG_LEARNER_STATE_PATH}`);
    const unknown = await fetch(`${server.baseUrl}/v1/definitely-not-a-route`);

    // Indistinguishable from an unknown path: the route leaks nothing, not even
    // that it could exist.
    expect(denied.status).toBe(404);
    expect(await denied.json()).toEqual({ error: 'Route not found.' });
    expect(unknown.status).toBe(denied.status);
  });

  it('is still refused when the opt-in is set but the value is not allowlisted', async () => {
    vi.stubEnv(DEBUG_STATE_OPT_IN_ENV_VAR, 'yes');
    const server = await createLocalLessonHttpServer({ port: 0 });
    running.push(server);

    const denied = await fetch(`${server.baseUrl}${DEBUG_LEARNER_STATE_PATH}`);
    expect(denied.status).toBe(404);
  });

  it('refuses a browser even from an allowlisted dev origin', async () => {
    vi.stubEnv(DEBUG_STATE_OPT_IN_ENV_VAR, '1');
    const server = await createLocalLessonHttpServer({ port: 0 });
    running.push(server);

    // The dev app's own origin passes the CORS gate, so this reaches routing —
    // and is refused there, because the payload is never produced for a page.
    const denied = await fetch(`${server.baseUrl}${DEBUG_LEARNER_STATE_PATH}`, {
      headers: LOCAL_HEADERS,
    });
    const unknown = await fetch(`${server.baseUrl}/v1/definitely-not-a-route`, {
      headers: LOCAL_HEADERS,
    });
    expect(denied.status).toBe(404);
    expect(await denied.json()).toEqual({ error: 'Route not found.' });
    expect(unknown.status).toBe(denied.status);

    // A page on any other local port does not even get that far.
    const rogue = await fetch(`${server.baseUrl}${DEBUG_LEARNER_STATE_PATH}`, {
      headers: { origin: 'http://localhost:31337' },
    });
    expect(rogue.status).toBe(403);
    expect(await rogue.json()).toEqual({ error: 'Origin is not allowed.' });
    expect(rogue.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('serves mastery, rollup and evidence state to a loopback caller that opted in', async () => {
    vi.stubEnv(DEBUG_STATE_OPT_IN_ENV_VAR, '1');
    const server = await createLocalLessonHttpServer({ port: 0 });
    running.push(server);
    await runOneLessonQuestion(server);

    const response = await fetch(`${server.baseUrl}${DEBUG_LEARNER_STATE_PATH}`);
    expect(response.status).toBe(200);
    // Never CORS-shared, so no page can read it whatever it claims to be.
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
    expect(response.headers.get('access-control-allow-credentials')).toBeNull();
    expect(response.headers.get('cache-control')).toBe('no-store');
    const view = (await response.json()) as DebugLearnerStateView;

    expect(view.schema).toBe('debug-learner-state/v1');
    expect(view.learnerId).toMatch(/\S/);
    expect(view.masteryThreshold).toBe(0.95);
    // Every accepted command advances the stream by exactly one.
    expect(view.acceptedEventCount).toBeGreaterThanOrEqual(2);
    expect(view.acceptedEventCount).toBe(view.streamVersion);
    expect(view.reasoningOperations).toHaveLength(7);
    expect(Array.isArray(view.knowledgeComponents)).toBe(true);
    expect(Array.isArray(view.evidence)).toBe(true);

    // The harness lesson is always reported, whether or not it has moved yet,
    // and it rolls up over its whole registry membership.
    const lesson = view.lessons.find((entry) => entry.lessonId === 'V3-LES-130923');
    expect(lesson?.status).toBe('available');
    if (lesson === undefined || lesson.status !== 'available') throw new Error('unreachable');
    expect(lesson.requiredKcCount).toBe(3);
    expect(lesson.members).toHaveLength(3);
    expect(lesson.members.every((member) => member.pL > 0)).toBe(true);
  });

  it('surfaces the delivered content revision the runtime pinned, null before a run', async () => {
    vi.stubEnv(DEBUG_STATE_OPT_IN_ENV_VAR, '1');
    const server = await createLocalLessonHttpServer({ port: 0 });
    running.push(server);

    // Before any run the harness lesson is still reported, but it carries no
    // revision: "never delivered" must not read as "delivered revision 000…0".
    const before = (await (
      await fetch(`${server.baseUrl}${DEBUG_LEARNER_STATE_PATH}`)
    ).json()) as DebugLearnerStateView;
    const beforeLesson = before.lessons.find((entry) => entry.lessonId === 'V3-LES-130923');
    expect(beforeLesson?.deliveredContentSha256).toBeNull();
    // No delivery yet, so nothing can be superseded.
    expect(beforeLesson?.revisionSuperseded).toBe(false);

    // After delivery the endpoint returns the EXACT content_sha256 the runtime
    // pinned onto the run and scored against — the attribution key for the
    // evidence that same run just wrote.
    await runOneLessonQuestion(server);
    const after = (await (
      await fetch(`${server.baseUrl}${DEBUG_LEARNER_STATE_PATH}`)
    ).json()) as DebugLearnerStateView;
    const afterLesson = after.lessons.find((entry) => entry.lessonId === 'V3-LES-130923');
    const expectedSha = (
      JSON.parse(
        readFileSync(
          new URL('../../../content/lessons/v3-les-130923/lesson-script.json', import.meta.url),
          'utf8',
        ),
      ) as { content_sha256: string }
    ).content_sha256;
    expect(afterLesson?.deliveredContentSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(afterLesson?.deliveredContentSha256).toBe(expectedSha);
    // The harness serves the current revision, so a fresh delivery is never
    // stale: current resolves to the same hash and the flag stays down.
    expect(afterLesson?.currentContentSha256).toBe(expectedSha);
    expect(afterLesson?.revisionSuperseded).toBe(false);
  });

  it('returns no protected material', async () => {
    vi.stubEnv(DEBUG_STATE_OPT_IN_ENV_VAR, '1');
    const server = await createLocalLessonHttpServer({ port: 0 });
    running.push(server);
    await runOneLessonQuestion(server);

    const body = await (await fetch(`${server.baseUrl}${DEBUG_LEARNER_STATE_PATH}`)).text();
    expect(() => assertNoProtectedFields(JSON.parse(body))).not.toThrow();
    expect(body).not.toMatch(
      /correctChoiceId|correct_choice_id|correct_answer|rationale|authority_ref|authorityRef|PROTECTED_ITEMS|choices|stem/i,
    );
  });
});

describe('transport guards', () => {
  it('binds only to a loopback IP literal', async () => {
    for (const host of ['0.0.0.0', '::', 'localhost', 'example.com']) {
      await expect(createLocalLessonHttpServer({ host, port: 0 })).rejects.toThrow(
        /must bind only to a loopback IP literal/,
      );
    }
    const server = await createLocalLessonHttpServer({ host: '127.0.0.1', port: 0 });
    running.push(server);
    expect(server.baseUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
  });

  it('refuses a rebound hostname on every route', async () => {
    vi.stubEnv(DEBUG_STATE_OPT_IN_ENV_VAR, '1');
    const server = await createLocalLessonHttpServer({ port: 0 });
    running.push(server);
    const port = Number(new URL(server.baseUrl).port);

    // A loopback bind does not stop DNS rebinding: the page resolves
    // attacker.example.com to 127.0.0.1, and because that is same-origin to the
    // browser the GET carries no `Origin` for the CORS gate to catch. `Host` is
    // the only header left that still names the attacker. `fetch` refuses to
    // set it, so this goes over a raw socket.
    for (const host of ['attacker.example.com', `127.0.0.1:${port + 1}`, `evil.test:${port}`]) {
      const spoofed = await rawGet(port, DEBUG_LEARNER_STATE_PATH, { host });
      expect(spoofed.status, host).toBe(403);
      expect(spoofed.body, host).toBe('{"error":"Host is not allowed."}');
    }
    // Not debug-specific: the lesson routes are behind the same check.
    const lesson = await rawGet(port, '/v1/lessons/vectors-and-trigonometry/status', {
      host: 'attacker.example.com',
    });
    expect(lesson.status).toBe(403);

    for (const host of [`127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`]) {
      expect((await rawGet(port, DEBUG_LEARNER_STATE_PATH, { host })).status, host).toBe(200);
    }
  });

  it('accepts only whole allowlisted origins', () => {
    expect([...allowedOrigins({})]).toEqual(['http://127.0.0.1:5173', 'http://localhost:5173']);
    expect([...allowedOrigins({ LOCAL_AUTHORITY_ALLOWED_ORIGINS: '  ' })]).toEqual([
      'http://127.0.0.1:5173',
      'http://localhost:5173',
    ]);
    expect([
      ...allowedOrigins({
        LOCAL_AUTHORITY_ALLOWED_ORIGINS: 'http://127.0.0.1:5174, http://localhost:5174',
      }),
    ]).toEqual(['http://127.0.0.1:5174', 'http://localhost:5174']);
  });

  it('matches the Host header against the bound port, not a shape', () => {
    expect(isLoopbackHostHeader('127.0.0.1:8787', 8787)).toBe(true);
    expect(isLoopbackHostHeader('LocalHost:8787', 8787)).toBe(true);
    expect(isLoopbackHostHeader('[::1]:8787', 8787)).toBe(true);
    expect(isLoopbackHostHeader('127.0.0.1', 80)).toBe(true);

    expect(isLoopbackHostHeader(undefined, 8787)).toBe(false);
    expect(isLoopbackHostHeader('', 8787)).toBe(false);
    expect(isLoopbackHostHeader('127.0.0.1', 8787)).toBe(false);
    expect(isLoopbackHostHeader('127.0.0.1:8788', 8787)).toBe(false);
    expect(isLoopbackHostHeader('127.0.0.2:8787', 8787)).toBe(false);
    expect(isLoopbackHostHeader('attacker.example.com:8787', 8787)).toBe(false);
    expect(isLoopbackHostHeader('localhost.attacker.example.com:8787', 8787)).toBe(false);
    expect(isLoopbackHostHeader('127.0.0.1:8787.attacker.com', 8787)).toBe(false);
  });
});
