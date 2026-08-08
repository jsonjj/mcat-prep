import {
  AcceptedCommandResponseSchema,
  NormalizedLessonCommandSchema,
  NormalizedLessonStartCommandSchema,
} from '@mcat/contracts';
import { describe, expect, it } from 'vitest';
import { HttpAuthorityClient } from './http';

/**
 * Client parity for the shared normalized-engine catalog (L2/L3 and any future
 * template lesson). It proves the four slug-routed methods hit exactly
 * `/v1/lessons/<slug>/{status,start,run,commands}`, thread the concurrency
 * envelope like every other command, and reject any run view that carries a
 * protected answer field — the wire contract's `.strict()` shapes are the client's
 * last line of defence against an answer leak.
 */

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

const L2 = 'V3-LES-789208';
const L2_SLUG = 'v3-les-789208';
const runId = '10000000-0000-4000-8000-000000000010';

const runView = {
  runId,
  lessonId: L2,
  status: 'IN_PROGRESS',
  paused: false,
  kcId: 'V3-KC-399019',
  kcOrdinal: 1,
  totalKcs: 4,
  screen: {
    kind: 'QUESTION',
    itemId: 'v3-les-789208-item-1',
    kcId: 'V3-KC-399019',
    heading: 'Scaling check',
    contentBlocks: ['Decode the scale, then commit one response.'],
    prompt: 'Express 0.0042 in scientific notation.',
    control: {
      kind: 'SINGLE_SELECT',
      choices: [
        { choiceId: 'A', text: '4.2 × 10⁻³' },
        { choiceId: 'B', text: '42 × 10⁻⁴' },
        { choiceId: 'C', text: '4.2 × 10³' },
        { choiceId: 'D', text: '0.42 × 10⁻²' },
      ],
    },
    choices: [
      { choiceId: 'A', text: '4.2 × 10⁻³' },
      { choiceId: 'B', text: '42 × 10⁻⁴' },
      { choiceId: 'C', text: '4.2 × 10³' },
      { choiceId: 'D', text: '0.42 × 10⁻²' },
    ],
  },
};

describe('HttpAuthorityClient normalized-catalog slug routing', () => {
  it('routes status/start/run/commands on the lesson slug and threads the envelope', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const client = new HttpAuthorityClient({
      baseUrl: 'https://api.example.test',
      fetch: async (url, init) => {
        const request = { url: String(url), init: init ?? {} };
        calls.push(request);
        if (request.url.endsWith('/v1/bootstrap')) return Response.json(bootstrap);
        if (request.url.endsWith(`/v1/lessons/${L2_SLUG}/status`)) {
          return Response.json({
            availability: 'AVAILABLE',
            runState: 'NOT_STARTED',
            actionLabel: 'Start',
          });
        }
        if (request.url.endsWith(`/v1/lessons/${L2_SLUG}/start`)) {
          const command = NormalizedLessonStartCommandSchema.parse(
            JSON.parse(String(request.init.body)),
          );
          return Response.json({
            runId,
            disposition: 'STARTED',
            streamVersion: command.envelope.expectedStreamVersion + 1,
          });
        }
        if (request.url.endsWith(`/v1/lessons/${L2_SLUG}/run`)) return Response.json(runView);
        const command = NormalizedLessonCommandSchema.parse(JSON.parse(String(request.init.body)));
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
    expect(await client.getNormalizedLessonStatus(L2_SLUG)).toMatchObject({ actionLabel: 'Start' });
    expect(await client.startNormalizedLesson(L2_SLUG, L2)).toMatchObject({
      disposition: 'STARTED',
    });
    expect((await client.getNormalizedLessonRun(L2_SLUG)).screen.kind).toBe('QUESTION');
    await client.submitNormalizedLessonAction(L2_SLUG, {
      type: 'SUBMIT_RESPONSE',
      response: { kind: 'MULTIPLE_CHOICE', choiceId: 'A' },
    });

    // Every endpoint was addressed under the lesson's OWN slug.
    for (const segment of ['status', 'start', 'run', 'commands']) {
      expect(calls.some((call) => call.url.endsWith(`/v1/lessons/${L2_SLUG}/${segment}`))).toBe(
        true,
      );
    }
    // The start body carries the id and the pre-start stream version; the command
    // that follows advances on the accepted stream — same envelope discipline the
    // vector lesson keeps.
    const startCommand = NormalizedLessonStartCommandSchema.parse(
      JSON.parse(String(calls.find((call) => call.url.endsWith('/start'))?.init.body)),
    );
    expect(startCommand.lessonId).toBe(L2);
    expect(startCommand.envelope.expectedStreamVersion).toBe(7);
    const actionCommand = NormalizedLessonCommandSchema.parse(
      JSON.parse(String(calls.at(-1)?.init.body)),
    );
    expect(actionCommand.envelope.expectedStreamVersion).toBe(8);
    expect(actionCommand).not.toHaveProperty('runId');
  });

  it('resyncs and retries the lesson start once on a stream_conflict (launch race)', async () => {
    const startBodies: string[] = [];
    const client = new HttpAuthorityClient({
      baseUrl: 'https://api.example.test',
      fetch: async (url, init) => {
        const u = String(url);
        if (u.endsWith('/v1/bootstrap')) return Response.json(bootstrap);
        if (u.endsWith(`/v1/lessons/${L2_SLUG}/start`)) {
          startBodies.push(String(init?.body));
          // First attempt loses the optimistic-concurrency check (a concurrent command
          // advanced the stream), reported with the CURRENT version.
          if (startBodies.length === 1) {
            return new Response(
              JSON.stringify({
                code: 'stream_conflict',
                message: 'The learner stream changed.',
                requestId: 'req-conflict',
                retryable: false,
                currentStreamVersion: 42,
              }),
              { status: 409, headers: { 'content-type': 'application/json' } },
            );
          }
          const command = NormalizedLessonStartCommandSchema.parse(JSON.parse(String(init?.body)));
          return Response.json({
            runId,
            disposition: 'STARTED',
            streamVersion: command.envelope.expectedStreamVersion + 1,
          });
        }
        throw new Error(`unexpected fetch ${u}`);
      },
    });

    await client.bootstrap();
    expect(await client.startNormalizedLesson(L2_SLUG, L2)).toMatchObject({
      disposition: 'STARTED',
    });
    // Retried exactly once: the conflicted command did not apply, so re-issuing is safe.
    expect(startBodies).toHaveLength(2);
    const first = NormalizedLessonStartCommandSchema.parse(JSON.parse(startBodies[0]!));
    const retry = NormalizedLessonStartCommandSchema.parse(JSON.parse(startBodies[1]!));
    // Retry rebuilt the envelope: adopts the server's current version + a fresh event id.
    expect(first.envelope.expectedStreamVersion).toBe(7);
    expect(retry.envelope.expectedStreamVersion).toBe(42);
    expect(retry.envelope.eventId).not.toBe(first.envelope.eventId);
  });

  it('rejects a run view that leaks a protected answer field', async () => {
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
    await expect(client.getNormalizedLessonRun(L2_SLUG)).rejects.toMatchObject({
      name: 'ZodError',
    });
  });
});
