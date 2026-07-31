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
  GuestBootstrapResponseSchema,
  VectorLessonCommandSchema,
  VectorLessonRunViewSchema,
  VectorLessonStartCommandSchema,
  VectorLessonStartResponseSchema,
  VectorLessonStatusViewSchema,
  systemClock,
} from '@mcat/contracts';
import { orderedKcsForLesson } from '@mcat/content';
import { RepositoryLearnerKernel, lessonContentProvider } from '@mcat/learner-api';
import {
  buildDebugLearnerState,
  isDebugStateOptedIn,
  isDebugStateRequestAllowed,
  DEBUG_LEARNER_STATE_PATH,
} from './debug-state';

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 8787;
const MAX_BODY_BYTES = 64 * 1024;
/** The one lesson this harness serves; always reported so a rollup is visible before it starts. */
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
 * L1's CURRENT catalog revision, resolved once from the same artifact builder the
 * runtime pins its `definitionHash` from — so a freshly delivered L1 is never
 * falsely reported as superseded.
 */
const VECTOR_LESSON_CURRENT_SHA256 = lessonContentProvider.getDefinitionHash(HARNESS_LESSON_ID);

/**
 * The catalog's CURRENT `content_sha256` for `lessonId`, or null when this
 * loopback harness cannot resolve it. The debug view compares this against the
 * delivered revision to flag a run whose content has since moved on; a `null`
 * here can never manufacture a false stale flag. This harness only ever delivers
 * L1, so only L1 needs a real answer today — a normalized lesson that somehow
 * appears is reported honestly as "current unknown" rather than guessed.
 */
function currentContentSha256For(lessonId: string): string | null {
  return lessonId === HARNESS_LESSON_ID ? VECTOR_LESSON_CURRENT_SHA256 : null;
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
  const csrfToken = `${randomUUID()}${randomUUID()}`;
  // Read once, at startup: neither the opt-in nor the origin allowlist can be
  // widened mid-flight.
  const debugStateOptedIn = isDebugStateOptedIn(process.env);
  const origins = allowedOrigins(process.env);
  // The real port is known only after `listen`, and no request can arrive
  // before that resolves.
  let boundPort = port;

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
        'access-control-allow-methods': 'GET, POST, OPTIONS',
        'access-control-allow-headers': 'content-type, authorization, cache-control, x-csrf-token',
        'access-control-max-age': '600',
      });
      response.end();
      return;
    }

    try {
      if (method === 'POST' && path === '/v1/bootstrap') {
        const snapshot = await kernel.snapshot(principal);
        sendJson(
          response,
          200,
          GuestBootstrapResponseSchema.parse({
            learnerId: principal.learnerId,
            accountState: 'guest',
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
        const command = VectorLessonStartCommandSchema.parse(await readJson(request));
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
        const command = VectorLessonCommandSchema.parse(await readJson(request));
        sendJson(response, 200, await kernel.handleVectorLessonCommand(command, principal), origin);
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
      if (error instanceof AuthorityKernelError) {
        sendJson(
          response,
          statusFor(error),
          {
            code: error.code,
            message: error.message,
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
