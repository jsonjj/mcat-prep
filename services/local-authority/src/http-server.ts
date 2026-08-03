import { randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { fileURLToPath } from 'node:url';
import { Authority } from '@mcat/authority-core';
import {
  AuthorityKernelError,
  InMemoryAuthorityRepository,
  learnerStateFromProjection,
  notFound,
  toProjectionRecord,
  type Principal,
} from '@mcat/authority-kernel';
import {
  AuthenticatedBootstrapResponseSchema,
  BuildTodaysPathCommandSchema,
  DailyBudgetCommandSchema,
  NormalizedLessonCommandSchema,
  NormalizedLessonRunViewSchema,
  NormalizedLessonStartCommandSchema,
  NormalizedLessonStartResponseSchema,
  NormalizedLessonStatusViewSchema,
  PassageAttemptRequestSchema,
  PassageAttemptResponseSchema,
  PassageTodayResponseSchema,
  PlanActivityProgressCommandSchema,
  VectorLessonCommandSchema,
  VectorLessonRunViewSchema,
  VectorLessonStartCommandSchema,
  VectorLessonStartResponseSchema,
  VectorLessonStatusViewSchema,
  systemClock,
} from '@mcat/contracts';
import { orderedKcsForLesson } from '@mcat/content';
import {
  DiagnosticBank,
  DiagnosticSessionError,
  InMemoryDiagnosticSessions,
  serveDiagnosticBlock,
  serveDiagnosticNext,
} from '@mcat/diagnostic-runner';
import { PassageOfDayService } from '@mcat/passage-of-day';
import {
  NORMALIZED_LESSON_ROUTE_SLUGS,
  RepositoryLearnerKernel,
  lessonContentProvider,
  mistakesRepairLimit,
  normalizedLessonIdFor,
  passageTzFromPath,
  practiceQueueParams,
  practiceQuestionId,
  routeFor,
  type CarsDuelCommandBody,
  type ContinueCommandBody,
  type MasterySeedCommandBody,
  type NormalizedLessonCommandInput,
  type PracticeAdaptiveAttemptCommandBody,
  type PracticeAttemptCommandBody,
  type RecallCommandBody,
  type RevealCommandBody,
} from '@mcat/learner-api';
import {
  buildDebugLearnerState,
  isDebugStateOptedIn,
  isDebugStateRequestAllowed,
  DEBUG_LEARNER_STATE_PATH,
} from './debug-state';
// The formative Passage-of-the-Day pool. This offline authority holds no
// database, so it serves the vetted hardcoded pool compiled into
// `content/passage-of-the-day/pool.ts` — the same fallback a fresh clone and the
// dev/preview server already use — through the shared @mcat/passage-of-day
// service the deployed Lambda and the real local stack use, so the daily rotation
// and grading cannot drift across environments.
import { hardcodedPassagePool } from '../../../content/passage-of-the-day/pool';

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 8787;
const MAX_BODY_BYTES = 64 * 1024;
/**
 * L1's id — served by a bespoke (vector) runtime, and the anchor the debug rollup
 * always reports so a rollup is visible before any run. The normalized catalog
 * (L2, L3, and any future template lesson) is served ALONGSIDE it through the
 * slug-parameterized routes below; those lessons surface in the debug view once
 * practiced (via `practicedLessonIds`).
 */
const HARNESS_LESSON_ID = 'V3-LES-130923';

/**
 * Bindable hosts. IP literals only: a NAME is resolved outside this process, so
 * `localhost` makes "binds only to loopback" a claim about `/etc/hosts` rather
 * than about this server.
 */
const BINDABLE_HOSTS: ReadonlySet<string> = new Set(['127.0.0.1', '::1']);

/** Host header names that mean "this loopback server". */
const LOOPBACK_HOST_NAMES: ReadonlySet<string> = new Set(['127.0.0.1', 'localhost', '[::1]']);

/**
 * Whole origins, not a shape. The previous `http://localhost:<any port>` regex
 * paired with `access-control-allow-credentials` let a page served by ANY other
 * process on this machine read learner state. Override when Vite picks a port
 * other than its default.
 */
const ALLOWED_ORIGINS_ENV_VAR = 'LOCAL_AUTHORITY_ALLOWED_ORIGINS';
const DEFAULT_ALLOWED_ORIGINS: readonly string[] = [
  'http://127.0.0.1:5173',
  'http://localhost:5173',
];

/** Comma-separated exact origins from the environment, or the Vite dev pair. */
export function allowedOrigins(
  env: Readonly<Record<string, string | undefined>>,
): ReadonlySet<string> {
  const configured = env[ALLOWED_ORIGINS_ENV_VAR];
  if (typeof configured !== 'string' || configured.trim().length === 0) {
    return new Set(DEFAULT_ALLOWED_ORIGINS);
  }
  return new Set(
    configured
      .split(',')
      .map((origin) => origin.trim())
      .filter((origin) => origin.length > 0),
  );
}

/**
 * Reject a request whose `Host` is not this loopback server.
 *
 * A loopback bind is not a defence against DNS rebinding: a page on
 * `attacker.example.com` whose name has been rebound to `127.0.0.1` reaches
 * this socket, and because that is same-origin to the browser the request
 * carries no `Origin` at all — so the CORS gate never sees it. The `Host`
 * header is the one thing that still names the attacker, which is why every
 * dev server validates it. Allowlist, and the port must be the bound one.
 */
export function isLoopbackHostHeader(host: string | undefined, boundPort: number): boolean {
  if (typeof host !== 'string') return false;
  const match = /^(\[[0-9a-f:]+\]|[^:[\]]+)(?::(\d{1,5}))?$/.exec(host.trim().toLowerCase());
  if (match === null) return false;
  const [, name, port] = match;
  if (name === undefined || !LOOPBACK_HOST_NAMES.has(name)) return false;
  return port === undefined ? boundPort === 80 : Number(port) === boundPort;
}

export interface RunningLocalLessonServer {
  readonly baseUrl: string;
  close(): Promise<void>;
}

/**
 * The delivered-revision field the learner-api runtime pins onto each persisted
 * run. Read STRUCTURALLY on purpose: local-authority owns neither run type, and
 * a debug projection should not import a lesson-runtime internal just to name one
 * string. L1 keeps a single bespoke `vectorLessonRun`; every normalized lesson
 * (L2, L3, and whatever the authoring template yields next) is keyed by id under
 * `normalizedLessonRuns`. Both carry `definitionHash` = the script `content_sha256`
 * the runtime scored against.
 */
interface PersistedLessonRuns {
  readonly vectorLessonRun?: { readonly definitionHash?: unknown };
  readonly normalizedLessonRuns?: Readonly<
    Record<string, { readonly definitionHash?: unknown } | undefined>
  >;
}

/**
 * The `content_sha256` this learner was delivered for `lessonId`, or `null` when
 * no run exists yet. The normalized map is authoritative for every lesson it
 * holds; the bespoke `vectorLessonRun` slot answers only for L1 (its sole
 * occupant), so a normalized L1 would never be shadowed by it.
 */
function deliveredContentSha256For(state: PersistedLessonRuns, lessonId: string): string | null {
  const normalized = state.normalizedLessonRuns?.[lessonId]?.definitionHash;
  if (typeof normalized === 'string') return normalized;
  if (lessonId === HARNESS_LESSON_ID) {
    const vector = state.vectorLessonRun?.definitionHash;
    if (typeof vector === 'string') return vector;
  }
  return null;
}

/**
 * The CURRENT catalog revision of every lesson this harness serves — L1 plus the
 * normalized catalog — resolved once from the same provider seam the runtime pins
 * each run's `definitionHash` from, so a freshly delivered lesson is never falsely
 * reported as superseded.
 */
const CURRENT_CONTENT_SHA256_BY_LESSON: ReadonlyMap<string, string> = new Map(
  [HARNESS_LESSON_ID, ...Object.values(NORMALIZED_LESSON_ROUTE_SLUGS)].map((lessonId) => [
    lessonId,
    lessonContentProvider.getDefinitionHash(lessonId),
  ]),
);

/**
 * The catalog's CURRENT `content_sha256` for `lessonId`, or null when this
 * loopback harness does not serve it. The debug view compares this against the
 * delivered revision to flag a run whose content has since moved on; a `null`
 * here can never manufacture a false stale flag.
 */
function currentContentSha256For(lessonId: string): string | null {
  return CURRENT_CONTENT_SHA256_BY_LESSON.get(lessonId) ?? null;
}

function statusFor(error: AuthorityKernelError): number {
  if (error.code === 'not_found') return 404;
  if (error.code === 'stream_conflict' || error.code === 'content_version_conflict') {
    return 409;
  }
  if (error.code === 'forbidden') return 403;
  if (error.code === 'unavailable') return 503;
  return 400;
}

function corsOrigin(request: IncomingMessage, allowed: ReadonlySet<string>): string | undefined {
  const origin = request.headers.origin;
  return origin !== undefined && allowed.has(origin) ? origin : undefined;
}

function responseHeaders(origin: string | undefined): Record<string, string> {
  return {
    'cache-control': 'no-store',
    'content-type': 'application/json; charset=utf-8',
    'x-content-type-options': 'nosniff',
    ...(origin === undefined
      ? {}
      : {
          'access-control-allow-origin': origin,
          'access-control-allow-credentials': 'true',
          vary: 'Origin',
        }),
  };
}

function sendJson(
  response: ServerResponse,
  statusCode: number,
  value: unknown,
  origin: string | undefined,
): void {
  response.writeHead(statusCode, responseHeaders(origin));
  response.end(JSON.stringify(value));
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.byteLength;
    if (bytes > MAX_BODY_BYTES) throw new Error('Request body is too large.');
    chunks.push(buffer);
  }
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
}

export async function createLocalLessonHttpServer(
  options: {
    readonly host?: string;
    readonly port?: number;
  } = {},
): Promise<RunningLocalLessonServer> {
  const host = options.host ?? DEFAULT_HOST;
  const port = options.port ?? DEFAULT_PORT;
  if (!BINDABLE_HOSTS.has(host)) {
    throw new Error('Local lesson authority must bind only to a loopback IP literal.');
  }

  const authority = new Authority(undefined, systemClock);
  const learner = authority.createGuest();
  learner.onboarding.diagnosticComplete = true;
  authority.confirmPlan(learner, {
    testDate: null,
    targetScore: null,
    minutesPerWeek: 420,
  });
  const now = systemClock.now();
  const repository = new InMemoryAuthorityRepository([toProjectionRecord(learner, 0, now)]);
  const principal: Principal = {
    kind: 'guest',
    learnerId: learner.learnerId,
    sessionId: randomUUID(),
  };
  const kernel = new RepositoryLearnerKernel({
    repository,
    clock: systemClock,
    bank: authority.bank,
  });
  // Formative Passage of the Day, off the authority kernel — like the feature
  // itself, it writes no mastery and logs no attempt. Built once over the vetted
  // hardcoded pool; the same shared service the deployed Lambda and real local
  // stack use.
  const passageService = new PassageOfDayService(hardcodedPassagePool());
  // Placement DIAGNOSTIC (block/multistage), off the authority kernel like the
  // deployed learner-API. The bank prefers the gitignored local corpus pull and
  // falls back to the synthetic fixture (same seam the dev/preview server uses);
  // sessions live in memory, bound to this harness's single fixed learner. Writes
  // no mastery — the result seeds mastery only through the mastery-seed hook.
  const diagnosticBank = new DiagnosticBank();
  const diagnosticSessions = new InMemoryDiagnosticSessions();
  const csrfToken = `${randomUUID()}${randomUUID()}`;
  // Read once, at startup: neither the opt-in nor the origin allowlist can be
  // widened mid-flight.
  const debugStateOptedIn = isDebugStateOptedIn(process.env);
  const origins = allowedOrigins(process.env);
  // The real port is known only after `listen`, and no request can arrive
  // before that resolves.
  let boundPort = port;

  /**
   * The rest of the app's `/v1` surface — everything the light in-process dev
   * authority serves (Today's Path, Mistakes, Progress, Practice, Diagnostic,
   * hooks, …). Routed through the SAME `services/lambdas/learner-api` route table
   * (`routeFor`) and dispatched to the SAME `RepositoryLearnerKernel` methods the
   * deployed handler calls, so the local full engine and the Lambda cannot drift.
   *
   * Returns the status + JSON payload, or `undefined` when the path is not one
   * this dispatcher owns — bootstrap, the lesson routes, and the debug route are
   * served by their bespoke blocks in the request handler below.
   *
   * A single fixed guest `principal` backs the whole process, exactly like the
   * lesson routes: this is a single-learner dev server, so it does not run the
   * deployed edge's session/CSRF/rate-limit ceremony (the request handler still
   * enforces the loopback Host + CORS-origin guards).
   */
  async function dispatchAppApi(
    method: string,
    path: string,
    body: unknown,
  ): Promise<{ status: number; payload: unknown } | undefined> {
    // ---- Today's Path + daily budget + practice-test summary --------------
    // Dev-parity routes the deployed learner API does not route yet; served here
    // by the same kernel transaction every other command uses.
    if (method === 'GET' && path === '/v1/plan/today/path') {
      return { status: 200, payload: await kernel.getTodaysPath(principal) };
    }
    if (method === 'POST' && path === '/v1/plan/today/build') {
      const command = BuildTodaysPathCommandSchema.parse(body);
      return { status: 200, payload: await kernel.buildTodaysPath(command, principal) };
    }
    if (method === 'POST' && path === '/v1/plan/today/activity') {
      const command = PlanActivityProgressCommandSchema.parse(body);
      return { status: 200, payload: await kernel.recordPlanActivity(command, principal) };
    }
    if (method === 'PUT' && path === '/v1/profile/daily-budget') {
      const command = DailyBudgetCommandSchema.parse(body);
      return { status: 200, payload: await kernel.setDailyBudget(command, principal) };
    }
    if (method === 'GET' && path === '/v1/practice-test/summary') {
      return { status: 200, payload: await kernel.practiceTestSummary(principal) };
    }

    // ---- Passage of the Day (FORMATIVE; off-kernel) -----------------------
    // Served through the SAME shared @mcat/passage-of-day service the deployed
    // Lambda and the real local stack use, so the daily rotation + grading cannot
    // drift. The tz offset rides in the path (the edge rejects query strings); a
    // null passage is the honest "pool is empty" answer the runner renders.
    {
      const tz = passageTzFromPath(path);
      if (method === 'GET' && tz !== null) {
        return {
          status: 200,
          payload: PassageTodayResponseSchema.parse({
            passage: passageService.todayView(new Date(), tz),
          }),
        };
      }
    }
    if (method === 'POST' && path === '/v1/passage/attempts') {
      const parsed = PassageAttemptRequestSchema.safeParse(body);
      if (!parsed.success) {
        return {
          status: 400,
          payload: {
            code: 'validation_error',
            message: 'The request body does not match the route contract.',
            requestId: randomUUID(),
            retryable: false,
          },
        };
      }
      const grade = passageService.grade(parsed.data.questionId, parsed.data.choiceId);
      if (grade === null) {
        return {
          status: 404,
          payload: {
            code: 'not_found',
            message: 'That passage question is not in the pool.',
            requestId: randomUUID(),
            retryable: false,
          },
        };
      }
      return { status: 200, payload: PassageAttemptResponseSchema.parse({ grade }) };
    }

    // ---- the deployed /v1 surface -----------------------------------------
    const route = routeFor(method, path);
    if (route === undefined) return undefined;

    if (route.bodySchema !== undefined) {
      const parsed = route.bodySchema.safeParse(body);
      if (!parsed.success) {
        return {
          status: 400,
          payload: {
            code: 'validation_error',
            message: 'The request body does not match the route contract.',
            requestId: randomUUID(),
            retryable: false,
          },
        };
      }
      switch (route.id) {
        case 'goal':
          return { status: 200, payload: await kernel.handle(parsed.data, principal) };
        case 'attempt':
          return { status: 200, payload: await kernel.handleAttempt(parsed.data, principal) };
        case 'reveal':
          return {
            status: 200,
            payload: await kernel.handleReveal(parsed.data as RevealCommandBody, principal),
          };
        case 'continue':
          return {
            status: 200,
            payload: await kernel.handleContinue(parsed.data as ContinueCommandBody, principal),
          };
        case 'recall':
          return {
            status: 200,
            payload: await kernel.handleRecall(parsed.data as RecallCommandBody, principal),
          };
        case 'practiceAttempt':
          return {
            status: 200,
            payload: await kernel.handlePractice(
              parsed.data as PracticeAttemptCommandBody,
              principal,
            ),
          };
        case 'practiceAdaptiveAttempt':
          return {
            status: 200,
            payload: await kernel.handlePracticeAdaptive(
              parsed.data as PracticeAdaptiveAttemptCommandBody,
              principal,
            ),
          };
        case 'carsDuel':
          return {
            status: 200,
            payload: await kernel.handleCarsDuel(parsed.data as CarsDuelCommandBody, principal),
          };
        case 'diagnosticNext':
        case 'diagnosticBlock':
          // Block diagnostic over the promoted runner (same package the deployed
          // Lambda uses), against an in-memory session store bound to this
          // harness's fixed learner. A DiagnosticSessionError carries its own
          // status (401 expired, 409 replayed block token).
          try {
            const body = parsed.data as Record<string, unknown>;
            const payload =
              route.id === 'diagnosticNext'
                ? await serveDiagnosticNext(
                    diagnosticBank,
                    diagnosticSessions,
                    principal.learnerId,
                    body,
                  )
                : await serveDiagnosticBlock(
                    diagnosticBank,
                    diagnosticSessions,
                    principal.learnerId,
                    body,
                  );
            return { status: 200, payload };
          } catch (error) {
            if (error instanceof DiagnosticSessionError) {
              const code =
                error.status === 401
                  ? 'unauthorized'
                  : error.status === 409
                    ? 'conflict'
                    : error.status === 429
                      ? 'rate_limited'
                      : 'validation_error';
              return {
                status: error.status,
                payload: {
                  code,
                  message: error.message,
                  requestId: randomUUID(),
                  retryable: error.status === 429,
                },
              };
            }
            throw error;
          }
        case 'practiceTestCompleted':
          return {
            status: 200,
            payload: await kernel.handlePracticeTestCompleted(
              parsed.data as ContinueCommandBody,
              principal,
            ),
          };
        case 'practiceTestReviewed':
          return {
            status: 200,
            payload: await kernel.handlePracticeTestReviewed(
              parsed.data as ContinueCommandBody,
              principal,
            ),
          };
        case 'masterySeed':
          return {
            status: 200,
            payload: await kernel.handleMasterySeed(
              parsed.data as MasterySeedCommandBody,
              principal,
            ),
          };
        case 'resetProgress':
          return {
            status: 200,
            payload: await kernel.handleReset(parsed.data as ContinueCommandBody, principal),
          };
        default:
          // Lesson command routes are served by the bespoke blocks; any other
          // body-bearing route is not one this dev server owns.
          return undefined;
      }
    }

    switch (route.id) {
      case 'goalView':
        return { status: 200, payload: await kernel.goal(principal) };
      case 'skills':
        return { status: 200, payload: await kernel.skills(principal) };
      case 'practiceItem': {
        const questionId = practiceQuestionId(path);
        if (questionId === null) return undefined;
        return { status: 200, payload: await kernel.practiceItem(questionId, principal) };
      }
      case 'practiceQueue': {
        const params = practiceQueueParams(path);
        if (params === null) return undefined;
        return {
          status: 200,
          payload: await kernel.getPracticeQueueAdaptive(params.x, params.focus, principal),
        };
      }
      case 'wrapped':
        return { status: 200, payload: await kernel.wrapped(principal) };
      case 'progressSkills':
        return { status: 200, payload: await kernel.masterySkills(principal) };
      case 'progressLessons':
        return { status: 200, payload: await kernel.masteryLessons(principal) };
      case 'progressLessonWarrants':
        return { status: 200, payload: await kernel.lessonWarrants(principal) };
      case 'progressCars':
        return { status: 200, payload: await kernel.carsReadiness(principal) };
      case 'carsReasoningPatterns':
        return { status: 200, payload: await kernel.carsReasoningPatterns(principal) };
      case 'mistakesRepair': {
        const limit = mistakesRepairLimit(path);
        if (limit === null) return undefined;
        return { status: 200, payload: await kernel.getRepairQueue(limit, principal) };
      }
      // Snapshot-backed reads — the exact fields the deployed handler selects.
      case 'today':
      case 'session':
      case 'mastery':
      case 'errors':
      case 'shakyWins':
      case 'errorPatterns': {
        const snapshot = await kernel.snapshot(principal);
        if (route.id === 'today') {
          if (snapshot.today === null) {
            return {
              status: 409,
              payload: {
                code: 'conflict',
                message: 'Complete onboarding before requesting Today.',
                requestId: randomUUID(),
                retryable: false,
              },
            };
          }
          return { status: 200, payload: snapshot.today };
        }
        if (route.id === 'session') return { status: 200, payload: snapshot.session };
        if (route.id === 'mastery') return { status: 200, payload: snapshot.masteryMap };
        if (route.id === 'errors') return { status: 200, payload: snapshot.errorLog };
        if (route.id === 'shakyWins') return { status: 200, payload: snapshot.shakyWins };
        return { status: 200, payload: snapshot.errorPatterns };
      }
      default:
        // Lesson reads, health, ai, and sync are not served here. Passage of the
        // Day IS served, by the dedicated block above (before the deployed-surface
        // route dispatch).
        return undefined;
    }
  }

  const server = createServer(async (request, response) => {
    const origin = corsOrigin(request, origins);
    const method = request.method ?? 'GET';
    const path = new URL(request.url ?? '/', 'http://localhost').pathname;

    // Before routing, so no path — including the debug route — is reachable
    // under a rebound hostname.
    if (!isLoopbackHostHeader(request.headers.host, boundPort)) {
      sendJson(response, 403, { error: 'Host is not allowed.' }, undefined);
      return;
    }
    if (request.headers.origin !== undefined && origin === undefined) {
      sendJson(response, 403, { error: 'Origin is not allowed.' }, undefined);
      return;
    }
    if (method === 'OPTIONS') {
      response.writeHead(204, {
        ...responseHeaders(origin),
        // The full app surface includes PUT (daily budget) and DELETE (reset
        // progress), so the credentialed preflight must advertise them too.
        'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'access-control-allow-headers': 'content-type, authorization, cache-control, x-csrf-token',
        'access-control-max-age': '600',
      });
      response.end();
      return;
    }

    try {
      // Read the request body ONCE up front so every route below (the bespoke
      // lesson handlers and the shared app-API dispatch) shares one parse — the
      // body stream can only be consumed once. A GET has none, so this is `{}`.
      const body = await readJson(request);
      if (method === 'POST' && path === '/v1/bootstrap') {
        const snapshot = await kernel.snapshot(principal);
        sendJson(
          response,
          200,
          AuthenticatedBootstrapResponseSchema.parse({
            authenticated: true,
            learnerId: principal.learnerId,
            // This loopback harness serves one fixed learner and holds no
            // credentials, so it reports the signed-in state the app requires
            // rather than making callers log in to a store that does not exist.
            accountState: 'linked',
            bankStatus: 'loaded',
            contentRelease: snapshot.contentRelease,
            apiVersion: 'v1',
            onboardingComplete: true,
            serverTime: systemClock.now(),
            streamVersion: snapshot.streamVersion,
            csrfToken,
          }),
          origin,
        );
        return;
      }
      if (method === 'POST' && path === '/v1/auth/signout') {
        sendJson(response, 200, { status: 'signed_out' }, origin);
        return;
      }
      if (method === 'POST' && path.startsWith('/v1/auth/')) {
        // The fixed learner is always signed in here, so there is nothing to
        // exchange. Answering 501 keeps a client that reaches for these routes
        // from reading a fabricated success.
        sendJson(
          response,
          501,
          { error: 'This harness serves one fixed learner and has no credential store.' },
          origin,
        );
        return;
      }
      if (method === 'GET' && path === '/v1/lessons/vectors-and-trigonometry/status') {
        sendJson(
          response,
          200,
          VectorLessonStatusViewSchema.parse(await kernel.vectorLessonStatus(principal)),
          origin,
        );
        return;
      }
      if (method === 'POST' && path === '/v1/lessons/vectors-and-trigonometry/start') {
        const command = VectorLessonStartCommandSchema.parse(body);
        sendJson(
          response,
          200,
          VectorLessonStartResponseSchema.parse(
            await kernel.handleVectorLessonStart(command, principal),
          ),
          origin,
        );
        return;
      }
      if (method === 'GET' && path === '/v1/lessons/vectors-and-trigonometry/run') {
        sendJson(
          response,
          200,
          VectorLessonRunViewSchema.parse(await kernel.vectorLessonRun(principal)),
          origin,
        );
        return;
      }
      if (method === 'POST' && path === '/v1/lessons/vectors-and-trigonometry/commands') {
        const command = VectorLessonCommandSchema.parse(body);
        sendJson(response, 200, await kernel.handleVectorLessonCommand(command, principal), origin);
        return;
      }
      // The normalized-engine catalog (L2, L3, and any future template lesson),
      // slug-parameterized EXACTLY as the deployed learner API serves them
      // (services/lambdas/learner-api). `normalizedLessonIdFor` returns null for
      // any unregistered slug — including L1's own — so this never shadows the
      // bespoke vector routes above, and an unknown lesson falls through to 404.
      const normalizedLessonId = normalizedLessonIdFor(path);
      if (normalizedLessonId !== null) {
        if (method === 'GET' && path.endsWith('/status')) {
          sendJson(
            response,
            200,
            NormalizedLessonStatusViewSchema.parse(
              await kernel.normalizedLessonStatus(normalizedLessonId, principal),
            ),
            origin,
          );
          return;
        }
        if (method === 'POST' && path.endsWith('/start')) {
          const command = NormalizedLessonStartCommandSchema.parse(body);
          // The slug is the authority for which lesson runs; a body id naming a
          // different lesson is rejected, exactly as L1's `z.literal` rejects a
          // foreign id on its own route.
          if (command.lessonId !== normalizedLessonId) {
            sendJson(
              response,
              400,
              {
                code: 'validation_error',
                message: 'The lesson identity does not match this route.',
                retryable: false,
              },
              origin,
            );
            return;
          }
          sendJson(
            response,
            200,
            NormalizedLessonStartResponseSchema.parse(
              await kernel.handleNormalizedLessonStart(
                normalizedLessonId,
                { envelope: command.envelope },
                principal,
              ),
            ),
            origin,
          );
          return;
        }
        if (method === 'GET' && path.endsWith('/run')) {
          sendJson(
            response,
            200,
            NormalizedLessonRunViewSchema.parse(
              await kernel.normalizedLessonRun(normalizedLessonId, principal),
            ),
            origin,
          );
          return;
        }
        if (method === 'POST' && path.endsWith('/commands')) {
          const command = NormalizedLessonCommandSchema.parse(body) as NormalizedLessonCommandInput;
          sendJson(
            response,
            200,
            await kernel.handleNormalizedLessonCommand(normalizedLessonId, command, principal),
            origin,
          );
          return;
        }
      }

      // The rest of the app's `/v1` surface (Today's Path, Progress, Mistakes,
      // Practice, Diagnostic, hooks, …), routed through the deployed learner-api
      // route table + kernel. Returns `undefined` only for a path this server
      // does not own, which then falls through to the debug route / 404 below.
      const dispatched = await dispatchAppApi(method, path, body);
      if (dispatched !== undefined) {
        sendJson(response, dispatched.status, dispatched.payload, origin);
        return;
      }

      // LOCAL-ONLY inspection route. Three independent guards, all required: an
      // explicit process opt-in, a loopback peer, and no `Origin` — a web page
      // never reads this, whatever the CORS allowlist says. Any one missing and
      // the route answers exactly as an unknown path does, so nothing about it
      // — not even its existence — is observable without all three.
      if (method === 'GET' && path === DEBUG_LEARNER_STATE_PATH) {
        if (
          isDebugStateRequestAllowed({
            optedIn: debugStateOptedIn,
            remoteAddress: request.socket.remoteAddress,
            originHeader: request.headers.origin,
          })
        ) {
          const projection = await repository.loadProjection(principal.learnerId);
          if (projection === null) throw notFound();
          const state = learnerStateFromProjection(projection);
          const runs = state as unknown as PersistedLessonRuns;
          const lessonIds = new Set([
            HARNESS_LESSON_ID,
            ...(state.mastery?.practicedLessonIds ?? []),
          ]);
          sendJson(
            response,
            200,
            buildDebugLearnerState({
              learnerId: principal.learnerId,
              streamVersion: projection.sequence,
              acceptedEventCount: repository.eventsFor(principal.learnerId).length,
              now: systemClock.now(),
              mastery: state.mastery,
              evidence: state.evidence,
              lessons: [...lessonIds].map((lessonId) => ({
                lessonId,
                requiredKcIds: orderedKcsForLesson(lessonId),
                deliveredContentSha256: deliveredContentSha256For(runs, lessonId),
                currentContentSha256: currentContentSha256For(lessonId),
              })),
            }),
            // Never CORS-shared. Unreachable with an `Origin`, and no response
            // header should suggest otherwise.
            undefined,
          );
          return;
        }
      }
      sendJson(response, 404, { error: 'Route not found.' }, origin);
    } catch (error) {
      // Include `requestId` so the client's `HttpApiErrorSchema` parses the body
      // and surfaces the REAL code (e.g. `stream_conflict`) instead of collapsing
      // every error to a generic `unavailable`.
      if (error instanceof AuthorityKernelError) {
        sendJson(
          response,
          statusFor(error),
          {
            code: error.code,
            message: error.message,
            requestId: randomUUID(),
            retryable: error.retryable,
            ...(error.currentStreamVersion === undefined
              ? {}
              : { currentStreamVersion: error.currentStreamVersion }),
          },
          origin,
        );
        return;
      }
      sendJson(
        response,
        400,
        {
          code: 'validation_error',
          message: error instanceof Error ? error.message : 'The request is invalid.',
          requestId: randomUUID(),
          retryable: false,
        },
        origin,
      );
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      resolve();
    });
  });
  const address = server.address();
  if (address === null || typeof address === 'string') {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    throw new Error('Local lesson authority did not bind a TCP port.');
  }
  boundPort = address.port;
  const baseUrl = `http://${host.includes(':') ? `[${host}]` : host}:${boundPort}`;
  return {
    baseUrl,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      }),
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const running = await createLocalLessonHttpServer({
    port: Number(process.env.LOCAL_AUTHORITY_PORT ?? DEFAULT_PORT),
  });
  process.stdout.write(`Local lesson authority listening at ${running.baseUrl}\n`);
  const close = async (): Promise<void> => {
    await running.close();
    process.exit(0);
  };
  process.once('SIGINT', () => void close());
  process.once('SIGTERM', () => void close());
}
