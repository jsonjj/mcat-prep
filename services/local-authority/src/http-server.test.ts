import {
  VectorLessonRunViewSchema,
  VectorLessonStartResponseSchema,
  VectorLessonStatusViewSchema,
  newEventId,
  newIdempotencyKey,
  newTaskInstanceId,
} from '@mcat/contracts';
import { afterEach, describe, expect, it } from 'vitest';
import { createLocalLessonHttpServer, type RunningLocalLessonServer } from './http-server';

const running: RunningLocalLessonServer[] = [];

afterEach(async () => {
  await Promise.all(running.splice(0).map((server) => server.close()));
});

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
