import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  AcceptedCommandResponseSchema,
  AnonymousBootstrapResponseSchema,
  SessionExchangeRequestSchema,
  AuthenticatedBootstrapResponseSchema,
  MasterySeedSchema,
  newEventId,
  type HttpErrorCode,
} from '@mcat/contracts';
import { InProcessAuthorityClient } from '@mcat/local-authority';
import { practiceBankSourceLine, selectPracticeBankSource } from './practice-bank-source';

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

/**
 * Which corpus backs adaptive Practice here: Postgres when DATABASE_URL is set,
 * else the local corpus pull, else the synthetic fixture (see
 * ./practice-bank-source). Announced once so a starved bank is never mistaken
 * for a selection bug.
 */
const practiceBank = selectPracticeBankSource();
console.warn(practiceBankSourceLine(practiceBank));

// Exported so the practice-test API plugin can close the WS5 completion→state
// loop through the SAME single-process dev authority the `/v1` surface uses:
// recording a completed/reviewed test here updates the very `LearnerState` that
// `POST /v1/plan/today/build` then reads to schedule the periodic test.
export const client = new InProcessAuthorityClient(store, undefined, practiceBank.port);

// One CSRF token per dev process; the client echoes it back but we don't verify.
const csrfToken = `${randomUUID()}${randomUUID()}`.replace(/-/g, '');
let streamVersion = 0;
let sequence = 0;

/**
 * Dev starts signed in so `pnpm dev` still opens straight into the app — lesson
 * authoring should not have to pass a login screen. Set `MCAT_DEV_REQUIRE_AUTH=1`
 * to exercise the real signed-out entry path against this shim.
 *
 * There is no credential check either way. This is a single-process dev store with
 * no user table; it models *whether* a session exists, not who holds it.
 */
const requireAuth = process.env.MCAT_DEV_REQUIRE_AUTH === '1';
let signedIn = !requireAuth;
if (requireAuth) {
  console.warn('[authority] MCAT_DEV_REQUIRE_AUTH=1 — starting signed out.');
}

/**
 * A throwaway stand-in for Supabase, so the local sign-up → confirm → sign-in
 * walk behaves like the deployed one: an unknown address is refused, an
 * unconfirmed account cannot sign in, and a wrong password fails.
 *
 * It is a `Map` in one process, and it holds passwords in plain text. That is
 * deliberate and safe only because nothing here ever leaves the dev machine —
 * the real credential store is Supabase, which this never talks to. It is served
 * under `/v1/dev-auth/*`, a prefix the deployed authority does not implement, so
 * these routes cannot be reached by anything but the Vite dev server.
 */
interface DevAccount {
  password: string;
  confirmed: boolean;
  /** The one-time value carried by the dev "email link". */
  linkToken: string;
}
const accounts = new Map<string, DevAccount>();

/**
 * Shaped like a compact JWS because the exchange route's contract requires three
 * base64url segments. It is not signed and is not verified — the dev authority
 * has no keys — so it is only ever a dev-loop convenience.
 */
function devAccessToken(email: string): string {
  const part = (value: unknown): string => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${part({ alg: 'none' })}.${part({ sub: `dev-${email}` })}.${part('unsigned')}`;
}

const linkToken = (): string => randomUUID().replace(/-/g, '');

/**
 * The stand-in for an inbox, readable over `GET /v1/dev-auth/last-link?email=`
 * so the confirm screen can offer the link instead of sending a developer to
 * read the server's console.
 *
 * Keyed by address for the same reason a real inbox is: a link sent to one
 * person must not turn up in front of another. An unaddressed "most recent
 * link" slot would hand the previous account's link to whoever asked next —
 * requesting a reset for an address with no account would offer someone else's.
 *
 * This does let the offline screen show that an address is registered, which
 * the HTTP responses below are careful never to reveal. That asymmetry is the
 * point: a real inbox reveals exactly the same thing to exactly the same
 * person, and none of it is reachable outside the dev server.
 */
const mailbox = new Map<string, { kind: string; path: string }>();

function emailLink(
  kind: 'Confirm your account' | 'Reset your password',
  to: string,
  token: string,
): void {
  const suffix = kind === 'Reset your password' ? '&type=recovery' : '';
  // Path only. Vite picks whatever port is free, and this module is not told
  // which, so printing an absolute URL would send developers to a dead port
  // whenever 5173 was already taken.
  const path = `/auth/callback?dev_token=${token}${suffix}`;
  mailbox.set(to, { kind, path });
  console.warn(`[authority] ${kind} — open on this dev server:`);
  console.warn(`[authority]   ${path}`);
}

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
      if (!signedIn) {
        return sendJson(
          response,
          200,
          AnonymousBootstrapResponseSchema.parse({
            authenticated: false,
            apiVersion: 'v1',
            serverTime: new Date().toISOString(),
            csrfToken,
          }),
        );
      }
      const base = await client.bootstrap();
      return sendJson(
        response,
        200,
        AuthenticatedBootstrapResponseSchema.parse({
          ...base,
          authenticated: true,
          accountState: 'linked',
          onboardingComplete: planConfirmed(),
          streamVersion,
          csrfToken,
        }),
      );
    }

    // ---- session exchange ---------------------------------------------------
    if (path.startsWith('/v1/auth/') && method === 'POST') {
      if (path === '/v1/auth/signout') {
        signedIn = false;
        return sendJson(response, 200, { status: 'signed_out' });
      }
      if (path === '/v1/auth/session') {
        const parsed = SessionExchangeRequestSchema.safeParse(await readBody(request));
        if (!parsed.success) {
          return sendError(response, 400, 'validation_error', 'Malformed access token.');
        }
        // The deployed route verifies the token's signature here. This one cannot
        // and does not pretend to: it models the *exchange*, not the trust
        // decision, which is why it lives only in the dev server.
        signedIn = true;
        return sendJson(response, 200, { status: 'signed_in', csrfToken });
      }
      return sendError(response, 404, 'not_found', 'Unknown authority route.');
    }

    // ---- the local Supabase stand-in ----------------------------------------
    if (path === '/v1/dev-auth/last-link' && method === 'GET') {
      const query = new URLSearchParams((request.url ?? '').split('?')[1] ?? '');
      const to = (query.get('email') ?? '').trim().toLowerCase();
      return sendJson(response, 200, { link: mailbox.get(to) ?? null });
    }

    if (path.startsWith('/v1/dev-auth/') && method === 'POST') {
      const body = await readBody(request);
      const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
      const password = typeof body.password === 'string' ? body.password : '';

      switch (path) {
        case '/v1/dev-auth/signup': {
          if (!email.includes('@') || password.length < 8) {
            return sendError(
              response,
              400,
              'validation_error',
              'Enter a valid email and a password of at least 8 characters.',
            );
          }
          // Registering an address twice is answered exactly like a fresh
          // sign-up, and never overwrites the stored password, matching
          // Supabase's refusal to confirm whether an address is taken.
          //
          // An account still awaiting confirmation does get a fresh link, which
          // is Supabase's resend behaviour and the reason someone would submit
          // the form twice. A confirmed one gets nothing.
          const existing = accounts.get(email);
          if (existing === undefined) {
            const token = linkToken();
            accounts.set(email, { password, confirmed: false, linkToken: token });
            emailLink('Confirm your account', email, token);
          } else if (!existing.confirmed) {
            existing.linkToken = linkToken();
            emailLink('Confirm your account', email, existing.linkToken);
          }
          return sendJson(response, 200, { status: 'confirmation_required' });
        }
        case '/v1/dev-auth/signin': {
          const account = accounts.get(email);
          if (account === undefined || account.password !== password) {
            return sendError(response, 400, 'validation_error', 'Invalid login credentials.');
          }
          if (!account.confirmed) {
            return sendError(response, 400, 'validation_error', 'Email not confirmed.');
          }
          return sendJson(response, 200, { accessToken: devAccessToken(email) });
        }
        case '/v1/dev-auth/reset-request': {
          // Answered identically for an unknown address, so recovery cannot be
          // used to enumerate accounts; only a real one gets a link.
          const account = accounts.get(email);
          if (account !== undefined) {
            account.linkToken = linkToken();
            emailLink('Reset your password', email, account.linkToken);
          }
          return sendJson(response, 200, { status: 'requested' });
        }
        case '/v1/dev-auth/confirm-link': {
          // Following the confirmation link is what marks the account usable, so
          // a later password sign-in is not refused as unconfirmed.
          const token = typeof body.token === 'string' ? body.token : '';
          const entry = [...accounts.entries()].find(
            ([, account]) => token !== '' && account.linkToken === token,
          );
          if (entry === undefined) {
            return sendError(response, 400, 'validation_error', 'That link is not valid.');
          }
          const [ownerEmail, account] = entry;
          account.confirmed = true;
          account.linkToken = linkToken();
          // Spent, so the screen stops offering a link that would now be refused.
          mailbox.delete(ownerEmail);
          return sendJson(response, 200, { accessToken: devAccessToken(ownerEmail) });
        }
        case '/v1/dev-auth/reset-confirm': {
          const token = typeof body.token === 'string' ? body.token : '';
          const entry = [...accounts.entries()].find(
            ([, account]) => token !== '' && account.linkToken === token,
          );
          if (entry === undefined || password.length < 8) {
            return sendError(response, 400, 'validation_error', 'That reset link is not valid.');
          }
          const [ownerEmail, account] = entry;
          account.password = password;
          // Following a link proves control of the inbox, which is what
          // confirmation was asking for in the first place.
          account.confirmed = true;
          account.linkToken = linkToken();
          mailbox.delete(ownerEmail);
          return sendJson(response, 200, { accessToken: devAccessToken(ownerEmail) });
        }
        default:
          return sendError(response, 404, 'not_found', 'Unknown authority route.');
      }
    }

    if (!signedIn) {
      return sendError(response, 401, 'unauthorized', 'A valid learner session is required.');
    }

    // ---- reads --------------------------------------------------------------
    if (method === 'GET') {
      switch (path) {
        case '/v1/plan/today':
          return sendJson(response, 200, await client.getToday());
        case '/v1/plan/today/path':
          return sendJson(response, 200, await client.getTodaysPath());
        case '/v1/learning/session':
          return sendJson(response, 200, await client.getSession());
        case '/v1/progress/mastery':
          return sendJson(response, 200, await client.getMasteryMap());
        case '/v1/progress/skills':
          return sendJson(response, 200, await client.getMasterySkills());
        case '/v1/progress/lessons':
          return sendJson(response, 200, await client.getMasteryLessons());
        case '/v1/progress/lesson-warrants':
          return sendJson(response, 200, await client.getLessonWarrants());
        case '/v1/progress/cars':
          return sendJson(response, 200, await client.getCarsReadiness());
        case '/v1/errors':
          return sendJson(response, 200, await client.getErrorLog());
        case '/v1/errors/shaky-wins':
          return sendJson(response, 200, await client.getShakyWins());
        case '/v1/errors/patterns':
          return sendJson(response, 200, await client.getMistakePatterns());
        case '/v1/errors/cars-reasoning':
          return sendJson(response, 200, await client.getCarsReasoningPatterns());
        case '/v1/skills':
          return sendJson(response, 200, await client.getSkills());
        // Practice-test dashboard summary, now served from REAL sittings (WS5).
        // Null until the learner has completed one, which the client's graceful
        // path already renders as the card's empty/next-due state.
        case '/v1/practice-test/summary':
          return sendJson(response, 200, await client.getPracticeTestSummary());
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
      const queueMatch = /^\/v1\/practice\/queue\/(\d{1,2})(?:\/([a-z0-9-]{1,32}))?$/.exec(path);
      if (queueMatch) {
        const x = Number.parseInt(queueMatch[1]!, 10);
        const focus = queueMatch[2];
        return sendJson(response, 200, await client.getPracticeQueue(x, focus));
      }
      const repairMatch = /^\/v1\/mistakes\/repair\/(\d{1,2})$/.exec(path);
      if (repairMatch) {
        const limit = Number.parseInt(repairMatch[1]!, 10);
        return sendJson(response, 200, await client.getRepairQueue(limit));
      }
      // Normalized-engine catalog (L2/L3 and any future template lesson). The
      // synthetic dev authority does not persist lesson runs, so — exactly like L1
      // above — status renders the lesson as unavailable and `run` reports the same
      // limitation, letting the Curriculum surface it without erroring on a missing
      // route. Real delivery is served by the persisted HTTP authority.
      const normalizedStatus = /^\/v1\/lessons\/(v3-les-\d{6})\/status$/.exec(path);
      if (normalizedStatus) {
        return sendJson(
          response,
          200,
          await client.getNormalizedLessonStatus(normalizedStatus[1]!),
        );
      }
      if (/^\/v1\/lessons\/v3-les-\d{6}\/run$/.test(path)) {
        return sendJson(response, 503, {
          code: 'lesson_requires_http_authority',
          message: 'This lesson requires the persisted HTTP authority.',
          retryable: false,
        });
      }
    }

    // ---- commands -----------------------------------------------------------
    const body = await readBody(request);

    if (path === '/v1/profile/goal' && method === 'PUT') {
      await client.confirmPlan(body.goal as Parameters<typeof client.confirmPlan>[0]);
      return sendJson(response, 200, accepted());
    }
    if (path === '/v1/plan/today/build' && method === 'POST') {
      const view = await client.buildTodaysPath(
        body.input as Parameters<typeof client.buildTodaysPath>[0],
      );
      return sendJson(response, 200, view);
    }
    if (path === '/v1/plan/today/activity' && method === 'POST') {
      await client.recordPlanActivity(
        String(body.activityId ?? ''),
        body.status as 'in_progress' | 'complete' | 'skipped',
      );
      return sendJson(response, 200, accepted());
    }
    if (path === '/v1/profile/daily-budget' && method === 'PUT') {
      await client.setDailyBudget(Number(body.minutesPerDay));
      return sendJson(response, 200, accepted());
    }
    if (path === '/v1/attempts' && method === 'POST') {
      // Diagnose-before-reveal timing (WS0). Forward it ONLY when the client actually
      // captured it; a missing value must stay "not captured" (logged NULL), never
      // coerced to a real `0` that would pollute the per-item median RT the WS1
      // calibrator bands speed against. Mirrors the adaptive-practice wire below.
      const hasTiming =
        typeof body.elapsedMs === 'number' && typeof body.answerChanges === 'number';
      await client.submitAttempt(
        (body.choiceId ?? null) as string | null,
        hasTiming
          ? { elapsedMs: Number(body.elapsedMs), answerChanges: Number(body.answerChanges) }
          : undefined,
      );
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
    // Normalized-catalog commands (start / commands) share L1's dev limitation.
    if (/^\/v1\/lessons\/v3-les-\d{6}\/(?:start|commands)$/.test(path) && method === 'POST') {
      return sendJson(response, 503, {
        code: 'lesson_requires_http_authority',
        message: 'This lesson requires the persisted HTTP authority.',
        retryable: false,
      });
    }

    if (path === '/v1/practice/attempts/adaptive' && method === 'POST') {
      const result = await client.submitPracticeAttempt({
        questionId: String(body.questionId ?? ''),
        specId: String(body.specId ?? ''),
        chosenChoiceId: (body.chosenChoiceId ?? null) as 'A' | 'B' | 'C' | 'D' | null,
        // Diagnose-before-reveal timing (WS0); omitted when the UI sent none.
        ...(typeof body.elapsedMs === 'number' ? { elapsedMs: body.elapsedMs } : {}),
        ...(typeof body.answerChanges === 'number' ? { answerChanges: body.answerChanges } : {}),
      });
      return sendJson(response, 200, result);
    }
    if (path === '/v1/hooks/cars-duel' && method === 'POST') {
      await client.recordCarsDuel(body.rubric as Parameters<typeof client.recordCarsDuel>[0]);
      return sendJson(response, 200, accepted());
    }
    if (path === '/v1/hooks/practice-test/completed' && method === 'POST') {
      await client.recordPracticeTestCompleted();
      return sendJson(response, 200, accepted());
    }
    if (path === '/v1/hooks/practice-test/reviewed' && method === 'POST') {
      await client.recordPracticeTestReviewed();
      return sendJson(response, 200, accepted());
    }
    if (path === '/v1/hooks/mastery-seed' && method === 'POST') {
      await client.applyMasterySeed(MasterySeedSchema.parse(body.seed));
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
