import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  AcceptedCommandResponseSchema,
  GuestBootstrapResponseSchema,
  newEventId,
  type HttpErrorCode,
} from '@mcat/contracts';
import { InProcessAuthorityClient } from '@mcat/local-authority';

/**
 * Dev-only learner authority. This runs the real synthetic authority
 * (`@mcat/authority-core` via `@mcat/local-authority`) inside the Node dev
 * server and exposes the `/v1` HTTP surface that `HttpAuthorityClient` expects.
 * Everything server-only — including answer keys — stays here and never enters
 * the browser bundle (this module is reached only through `ssrLoadModule`).
 *
 * It is intentionally a single-process, single-learner store: enough to demo the
 * full onboarding → plan → learn loop locally without standing up Postgres or the
 * API Gateway edge. The concurrency/CSRF ceremony the client performs (stream
 * versions, CSRF token, command envelopes) is accepted but not enforced here.
 *
 * The standalone (Bayesian) diagnostic owns placement in this app and lives behind
 * its own `/api/diagnostic` plugin, so onboarding here unlocks on plan
 * confirmation rather than on the authority's built-in diagnostic.
 */

type StoreArg = ConstructorParameters<typeof InProcessAuthorityClient>[0];

let snapshot: unknown = null;
const store = {
  load: () => snapshot,
  save: (state: unknown) => {
    snapshot = state;
  },
  clear: () => {
    snapshot = null;
  },
} as unknown as StoreArg;

const client = new InProcessAuthorityClient(store);

// One CSRF token per dev process; the client echoes it back but we don't verify.
const csrfToken = `${randomUUID()}${randomUUID()}`.replace(/-/g, '');
let streamVersion = 0;
let sequence = 0;

function planConfirmed(): boolean {
  const state = snapshot as { onboarding?: { planConfirmed?: boolean } } | null;
  return state?.onboarding?.planConfirmed ?? false;
}

function accepted() {
  streamVersion += 1;
  sequence += 1;
  return AcceptedCommandResponseSchema.parse({
    eventId: newEventId(),
    sequence,
    streamVersion,
    acceptedAt: new Date().toISOString(),
  });
}

function sendJson(response: ServerResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload);
  response.statusCode = status;
  response.setHeader('content-type', 'application/json; charset=utf-8');
  response.setHeader('cache-control', 'no-store');
  response.end(body);
}

function sendError(
  response: ServerResponse,
  status: number,
  code: HttpErrorCode,
  message: string,
): void {
  sendJson(response, status, {
    code,
    message,
    requestId: randomUUID(),
    retryable: status >= 500,
  });
}

async function readBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let raw = '';
    request.on('data', (chunk) => (raw += chunk));
    request.on('error', reject);
    request.on('end', () => {
      if (raw.trim() === '') return resolve({});
      try {
        resolve(JSON.parse(raw) as Record<string, unknown>);
      } catch {
        reject(new Error('invalid_json'));
      }
    });
  });
}

/** Path (with the `/v1` prefix intact) stripped of any query string. */
function pathOf(request: IncomingMessage): string {
  // Connect mounts strip the `/v1` prefix from `req.url`; `originalUrl` keeps it.
  const withPrefix = (request as IncomingMessage & { originalUrl?: string }).originalUrl;
  const url = withPrefix ?? request.url ?? '';
  const q = url.indexOf('?');
  return q === -1 ? url : url.slice(0, q);
}

export async function handleAuthorityRequest(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const method = (request.method ?? 'GET').toUpperCase();
  const path = pathOf(request);

  try {
    // ---- bootstrap ----------------------------------------------------------
    if (path === '/v1/bootstrap' && method === 'POST') {
      const base = await client.bootstrap();
      return sendJson(
        response,
        200,
        GuestBootstrapResponseSchema.parse({
          ...base,
          onboardingComplete: planConfirmed(),
          streamVersion,
          csrfToken,
        }),
      );
    }

    // ---- reads --------------------------------------------------------------
    if (method === 'GET') {
      switch (path) {
        case '/v1/plan/today':
          return sendJson(response, 200, await client.getToday());
        case '/v1/learning/session':
          return sendJson(response, 200, await client.getSession());
        case '/v1/progress/mastery':
          return sendJson(response, 200, await client.getMasteryMap());
        case '/v1/errors':
          return sendJson(response, 200, await client.getErrorLog());
        case '/v1/skills':
          return sendJson(response, 200, await client.getSkills());
        case '/v1/hooks/wrapped':
          return sendJson(response, 200, await client.getWrapped());
        case '/v1/diagnostic/next':
          return sendJson(response, 200, await client.getDiagnosticNext());
        // The vector lesson runs on the persisted HTTP authority
        // (services/local-authority), not in-process. Serving its status here
        // lets the curriculum render it as unavailable instead of erroring on a
        // missing route; `run` deliberately reports the same limitation.
        case '/v1/lessons/vectors-and-trigonometry/status':
          return sendJson(response, 200, await client.getVectorLessonStatus());
        case '/v1/lessons/vectors-and-trigonometry/run':
          return sendJson(response, 503, {
            code: 'lesson_requires_http_authority',
            message: 'This lesson requires the persisted HTTP authority.',
            retryable: false,
          });
        default:
          break;
      }
      if (path.startsWith('/v1/practice/items/')) {
        const questionId = decodeURIComponent(path.slice('/v1/practice/items/'.length));
        return sendJson(response, 200, await client.getPracticeItem(questionId));
      }
    }

    // ---- commands -----------------------------------------------------------
    const body = await readBody(request);

    if (path === '/v1/profile/goal' && method === 'PUT') {
      await client.confirmPlan(body.goal as Parameters<typeof client.confirmPlan>[0]);
      return sendJson(response, 200, accepted());
    }
    if (path === '/v1/attempts' && method === 'POST') {
      await client.submitAttempt((body.choiceId ?? null) as string | null);
      return sendJson(response, 200, accepted());
    }
    if (path === '/v1/attempts/cause' && method === 'POST') {
      await client.selectCause(body.cause as Parameters<typeof client.selectCause>[0]);
      return sendJson(response, 200, accepted());
    }
    if (path === '/v1/attempts/reveal' && method === 'POST') {
      await client.requestReveal();
      return sendJson(response, 200, accepted());
    }
    if (path === '/v1/learning/session/continue' && method === 'POST') {
      await client.continueStep();
      return sendJson(response, 200, accepted());
    }
    if (path === '/v1/recall' && method === 'POST') {
      const correct = await client.submitRecall(String(body.answer ?? ''));
      return sendJson(response, 200, { correct });
    }
    if (path === '/v1/practice/attempts' && method === 'POST') {
      const result = await client.checkPractice(
        String(body.questionId ?? ''),
        (body.choiceId ?? null) as string | null,
      );
      return sendJson(response, 200, result);
    }
    if (path.startsWith('/v1/lessons/vectors-and-trigonometry/') && method === 'POST') {
      return sendJson(response, 503, {
        code: 'lesson_requires_http_authority',
        message: 'This lesson requires the persisted HTTP authority.',
        retryable: false,
      });
    }
    if (path === '/v1/hooks/cars-duel' && method === 'POST') {
      await client.recordCarsDuel();
      return sendJson(response, 200, accepted());
    }
    if (path === '/v1/account/progress' && method === 'DELETE') {
      await client.resetProgress();
      return sendJson(response, 200, accepted());
    }

    return sendError(response, 404, 'not_found', `No dev authority route for ${method} ${path}.`);
  } catch (error) {
    sendError(
      response,
      503,
      'unavailable',
      error instanceof Error ? error.message : 'Dev authority failure.',
    );
  }
}
