import {
  AcceptedCommandResponseSchema,
  VectorLessonCommandSchema,
  VectorLessonStartCommandSchema,
} from '@mcat/contracts';
import { describe, expect, it } from 'vitest';
import { HttpAuthorityClient } from './http';

const bootstrap = {
  authenticated: true,
  learnerId: '11111111-1111-4111-8111-111111111111',
  accountState: 'linked',
  bankStatus: 'loaded',
  contentRelease: 'synthetic-2026.07',
  apiVersion: 'v1',
  onboardingComplete: true,
  serverTime: '2026-07-23T18:00:00.000Z',
  streamVersion: 7,
  csrfToken: 'csrf-token-with-at-least-32-characters',
};

const runId = '10000000-0000-4000-8000-000000000010';
const runView = {
  lessonTitle: 'Vectors and Trigonometry',
  runId,
  state: 'IN_PROGRESS',
  progress: {
    currentPart: 1,
    totalParts: 3,
    currentPartLabel: 'Resolve and combine vectors',
    stageLabel: 'Starting check',
  },
  screen: {
    kind: 'QUESTION',
    screenToken: 'screen-opaque-1',
    heading: 'Starting check',
    prompt: 'An arrow points east. What sign represents east?',
    choices: [
      { id: 'A', text: 'Positive' },
      { id: 'B', text: 'Negative' },
      { id: 'C', text: 'Zero' },
      { id: 'D', text: 'Not sure yet' },
    ],
    primaryActionLabel: 'Record my starting point',
    supportActionLabel: null,
    support: null,
    visual: null,
  },
};

describe('HttpAuthorityClient V3-LES-130923 contract parity', () => {
  it('gets status, starts after server acceptance, restores the run, and sends strict commands', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const client = new HttpAuthorityClient({
      baseUrl: 'https://api.example.test',
      fetch: async (url, init) => {
        const request = { url: String(url), init: init ?? {} };
        calls.push(request);
        if (request.url.endsWith('/v1/bootstrap')) return Response.json(bootstrap);
        if (request.url.endsWith('/status')) {
          return Response.json({
            availability: 'AVAILABLE',
            runState: 'NOT_STARTED',
            actionLabel: 'Start',
          });
        }
        if (request.url.endsWith('/start')) {
          const command = VectorLessonStartCommandSchema.parse(
            JSON.parse(String(request.init.body)),
          );
          return Response.json({
            runId,
            disposition: 'STARTED',
            path: '/app/lessons/vectors-and-trigonometry',
            streamVersion: command.envelope.expectedStreamVersion + 1,
          });
        }
        if (request.url.endsWith('/run')) return Response.json(runView);
        const command = VectorLessonCommandSchema.parse(JSON.parse(String(request.init.body)));
        return Response.json(
          AcceptedCommandResponseSchema.parse({
            eventId: command.envelope.eventId,
            sequence: 9,
            streamVersion: 9,
            acceptedAt: '2026-07-23T18:00:01.000Z',
          }),
        );
      },
    });

    await client.bootstrap();
    expect(await client.getVectorLessonStatus()).toMatchObject({ actionLabel: 'Start' });
    expect(await client.startVectorLesson()).toMatchObject({
      disposition: 'STARTED',
      path: '/app/lessons/vectors-and-trigonometry',
    });
    expect((await client.getVectorLessonRun()).screen.kind).toBe('QUESTION');
    await client.submitVectorLessonAction(runId, runView.screen.screenToken, {
      type: 'SUBMIT_RESPONSE',
      choiceId: 'A',
    });

    const startCommand = VectorLessonStartCommandSchema.parse(
      JSON.parse(String(calls.find((call) => call.url.endsWith('/start'))?.init.body)),
    );
    expect(startCommand.envelope.expectedStreamVersion).toBe(7);
    const actionCommand = VectorLessonCommandSchema.parse(
      JSON.parse(String(calls.at(-1)?.init.body)),
    );
    expect(actionCommand.envelope.expectedStreamVersion).toBe(8);
    expect(actionCommand).not.toHaveProperty('route');
    expect(actionCommand).not.toHaveProperty('assistanceLevel');
  });

  it('rejects a learner run response containing a protected answer field', async () => {
    const client = new HttpAuthorityClient({
      baseUrl: 'https://api.example.test',
      fetch: async (url) => {
        if (String(url).endsWith('/v1/bootstrap')) return Response.json(bootstrap);
        return Response.json({
          ...runView,
          screen: { ...runView.screen, correctChoiceId: 'A' },
        });
      },
    });

    await client.bootstrap();
    await expect(client.getVectorLessonRun()).rejects.toMatchObject({ name: 'ZodError' });
  });
});
