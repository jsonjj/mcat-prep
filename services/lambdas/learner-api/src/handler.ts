import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import type { PracticeBankPort } from '@mcat/authority-core';
import {
  AuthorityKernelError,
  type AuthorityKernel,
  type AuthorityKernelDependencies,
  type Principal,
} from '@mcat/authority-kernel';
import {
  AcceptedCommandResponseSchema,
  AnonymousBootstrapResponseSchema,
  AuthenticatedBootstrapResponseSchema,
  HttpApiErrorSchema,
  PassageAttemptResponseSchema,
  PassageTodayResponseSchema,
  type BuildTodaysPathCommand,
  type Clock,
  type CommandEnvelope,
  type DailyBudgetCommand,
  type HttpErrorCode,
  type NormalizedLessonStartCommand,
  type PassageAttemptRequest,
  type PassageChoiceId,
  type PassageGrade,
  type PassageTodayView,
  type PlanActivityProgressCommand,
  type VectorLessonCommand,
  type VectorLessonStartCommand,
} from '@mcat/contracts';
import type { AuthorityRepository } from '@mcat/database';
import { groundedRewrite, proxyChat, type AiProxyConfig } from '@mcat/ai-gateway/server';

import {
  type ApiGatewayV1Event,
  type ApiGatewayV1Result,
  type ApiGatewayV2Event,
  type ApiGatewayV2Result,
  type LambdaApiGatewayEvent,
  type LambdaApiGatewayResult,
  type RateLimiter,
  type SafeLogEvent,
  type SafeLogger,
  normalizedHeaders,
} from './http';
import {
  ROUTES,
  allowedMethodsFor,
  mistakesRepairLimit,
  normalizedLessonIdFor,
  passageTzFromPath,
  practiceQueueParams,
  practiceQuestionId,
  routeFor,
  type CarsDuelCommandBody,
  type ContinueCommandBody,
  type MasterySeedCommandBody,
  type PracticeAdaptiveAttemptCommandBody,
  type PracticeAttemptCommandBody,
  type RecallCommandBody,
  type RevealCommandBody,
  type RouteDefinition,
} from './routes';
import type { IdentityProvider } from './auth/identity-provider';
import {
  CSRF_COOKIE,
  SESSION_COOKIE,
  parseCookies,
  secureCookie,
  verifyDoubleSubmitCsrf,
  verifyStatelessDoubleSubmitCsrf,
  type GuestSessionService,
  type ResolvedGuestSession,
} from './session';
import { RepositoryLearnerKernel, type NormalizedLessonCommandInput } from './workflow';
import { DiagnosticSessionError } from '@mcat/diagnostic-runner';
import type { DiagnosticPort } from './diagnostic-port';

interface KernelPort {
  handle(input: unknown, principal: Principal): ReturnType<AuthorityKernel['handle']>;
  snapshot(principal: Principal): ReturnType<AuthorityKernel['snapshot']>;
  handleAttempt(
    input: unknown,
    principal: Principal,
  ): ReturnType<RepositoryLearnerKernel['handleAttempt']>;
  handleReveal(
    input: RevealCommandBody,
    principal: Principal,
  ): ReturnType<RepositoryLearnerKernel['handleReveal']>;
  handleContinue(
    input: ContinueCommandBody,
    principal: Principal,
  ): ReturnType<RepositoryLearnerKernel['handleContinue']>;
  handleRecall(
    input: RecallCommandBody,
    principal: Principal,
  ): ReturnType<RepositoryLearnerKernel['handleRecall']>;
  skills(principal: Principal): ReturnType<RepositoryLearnerKernel['skills']>;
  practiceItem(
    questionId: Parameters<RepositoryLearnerKernel['practiceItem']>[0],
    principal: Principal,
  ): ReturnType<RepositoryLearnerKernel['practiceItem']>;
  wrapped(principal: Principal): ReturnType<RepositoryLearnerKernel['wrapped']>;
  masterySkills(principal: Principal): ReturnType<RepositoryLearnerKernel['masterySkills']>;
  masteryLessons(principal: Principal): ReturnType<RepositoryLearnerKernel['masteryLessons']>;
  lessonWarrants(principal: Principal): ReturnType<RepositoryLearnerKernel['lessonWarrants']>;
  carsReadiness(principal: Principal): ReturnType<RepositoryLearnerKernel['carsReadiness']>;
  carsReasoningPatterns(
    principal: Principal,
  ): ReturnType<RepositoryLearnerKernel['carsReasoningPatterns']>;
  goal(principal: Principal): ReturnType<RepositoryLearnerKernel['goal']>;
  getTodaysPath(principal: Principal): ReturnType<RepositoryLearnerKernel['getTodaysPath']>;
  buildTodaysPath(
    input: BuildTodaysPathCommand,
    principal: Principal,
  ): ReturnType<RepositoryLearnerKernel['buildTodaysPath']>;
  recordPlanActivity(
    input: PlanActivityProgressCommand,
    principal: Principal,
  ): ReturnType<RepositoryLearnerKernel['recordPlanActivity']>;
  setDailyBudget(
    input: DailyBudgetCommand,
    principal: Principal,
  ): ReturnType<RepositoryLearnerKernel['setDailyBudget']>;
  handlePractice(
    input: PracticeAttemptCommandBody,
    principal: Principal,
  ): ReturnType<RepositoryLearnerKernel['handlePractice']>;
  getPracticeQueueAdaptive(
    x: number,
    focus: string | null,
    principal: Principal,
  ): ReturnType<RepositoryLearnerKernel['getPracticeQueueAdaptive']>;
  getRepairQueue(
    limit: number,
    principal: Principal,
  ): ReturnType<RepositoryLearnerKernel['getRepairQueue']>;
  handlePracticeAdaptive(
    input: PracticeAdaptiveAttemptCommandBody,
    principal: Principal,
  ): ReturnType<RepositoryLearnerKernel['handlePracticeAdaptive']>;
  handleCarsDuel(
    input: CarsDuelCommandBody,
    principal: Principal,
  ): ReturnType<RepositoryLearnerKernel['handleCarsDuel']>;
  handlePracticeTestCompleted(
    input: ContinueCommandBody,
    principal: Principal,
  ): ReturnType<RepositoryLearnerKernel['handlePracticeTestCompleted']>;
  handlePracticeTestReviewed(
    input: ContinueCommandBody,
    principal: Principal,
  ): ReturnType<RepositoryLearnerKernel['handlePracticeTestReviewed']>;
  handleMasterySeed(
    input: MasterySeedCommandBody,
    principal: Principal,
  ): ReturnType<RepositoryLearnerKernel['handleMasterySeed']>;
  handleReset(
    input: ContinueCommandBody,
    principal: Principal,
  ): ReturnType<RepositoryLearnerKernel['handleReset']>;
  vectorLessonStatus(
    principal: Principal,
  ): ReturnType<RepositoryLearnerKernel['vectorLessonStatus']>;
  vectorLessonRun(principal: Principal): ReturnType<RepositoryLearnerKernel['vectorLessonRun']>;
  handleVectorLessonStart(
    input: VectorLessonStartCommand,
    principal: Principal,
  ): ReturnType<RepositoryLearnerKernel['handleVectorLessonStart']>;
  handleVectorLessonCommand(
    input: VectorLessonCommand,
    principal: Principal,
  ): ReturnType<RepositoryLearnerKernel['handleVectorLessonCommand']>;
  normalizedLessonStatus(
    lessonId: string,
    principal: Principal,
  ): ReturnType<RepositoryLearnerKernel['normalizedLessonStatus']>;
  normalizedLessonRun(
    lessonId: string,
    principal: Principal,
  ): ReturnType<RepositoryLearnerKernel['normalizedLessonRun']>;
  handleNormalizedLessonStart(
    lessonId: string,
    input: { readonly envelope: CommandEnvelope },
    principal: Principal,
  ): ReturnType<RepositoryLearnerKernel['handleNormalizedLessonStart']>;
  handleNormalizedLessonCommand(
    lessonId: string,
    input: NormalizedLessonCommandInput,
    principal: Principal,
  ): ReturnType<RepositoryLearnerKernel['handleNormalizedLessonCommand']>;
}

/**
 * The formative Passage-of-the-Day capability. Kept OFF the authority kernel —
 * like the feature itself, it writes no mastery and logs no attempt — and served
 * by the same shared `@mcat/passage-of-day` service the dev server uses, so the
 * daily rotation and grading cannot drift between dev and prod. Optional: a
 * deployment without it degrades to "no passage today" / "not in the pool".
 */
export interface PassagePort {
  today(tzMinutes: number): Promise<PassageTodayView | null>;
  grade(questionId: string, choiceId: PassageChoiceId | null): Promise<PassageGrade | null>;
}

export interface LearnerApiDependencies {
  readonly kernel: KernelPort;
  readonly sessions: GuestSessionService;
  /**
   * Verifies the Supabase access tokens presented to `/v1/auth/session`. Optional
   * so a deployment can omit it, in which case that route reports 503 rather than
   * silently accepting anyone; every learner route stays closed either way.
   */
  readonly identity?: IdentityProvider;
  /** Identity provider recorded in `linked_identities`. Defaults to `'supabase'`. */
  readonly identityProviderName?: string;
  readonly allowedOrigins: readonly string[];
  readonly originVerificationSecret: string;
  readonly rateLimitPepper: string;
  readonly rateLimiter: RateLimiter;
  readonly logger: SafeLogger;
  readonly nowMs?: () => number;
  readonly maxBodyBytes?: number;
  /**
   * AI provider config for the grounded "Explain it another way" route
   * (`POST /v1/ai/rewrite`). Optional: when absent (or with no `apiKey`), the
   * route returns 503 and the client falls back to the deterministic
   * re-statement. Injectable so tests can stub the transport.
   */
  readonly aiConfig?: AiProxyConfig;
  /** Formative Passage of the Day (see `PassagePort`). Optional. */
  readonly passage?: PassagePort;
  /**
   * Placement DIAGNOSTIC (block/multistage). Off the authority kernel — writes no
   * mastery, owns only its own session rows — like {@link PassagePort}. Optional:
   * a deployment without it answers 503 on the diagnostic routes (every learner
   * route stays closed either way).
   */
  readonly diagnostic?: DiagnosticPort;
}

export interface RepositoryLearnerApiDependencies extends Omit<LearnerApiDependencies, 'kernel'> {
  readonly repository: AuthorityRepository;
  readonly clock: Clock;
  readonly bank: AuthorityKernelDependencies['bank'];
  /** Adaptive-practice bank/exposure seam (Postgres in prod; synthetic fallback). */
  readonly practiceBank?: PracticeBankPort;
  /**
   * Whether the periodic scored practice TEST may be reserved into Today's Path.
   * Defaults to `true`. Production sets this `false` until the scored-test runner
   * is served by the deployed backend (see `docs/practice-test-prod.md`).
   */
  readonly practiceTestEnabled?: boolean;
}

export interface LearnerApi {
  handle(event: ApiGatewayV2Event): Promise<ApiGatewayV2Result>;
  handler(event: ApiGatewayV1Event, context?: unknown): Promise<ApiGatewayV1Result>;
  handler(event: ApiGatewayV2Event, context?: unknown): Promise<ApiGatewayV2Result>;
}

const DEFAULT_MAX_BODY_BYTES = 64 * 1024;
const DEFAULT_IDENTITY_PROVIDER = 'supabase';
/** Long enough to finish a sign-up or reset, short enough not to linger. */
const CREDENTIAL_CSRF_MAX_AGE_SECONDS = 60 * 60;

function newOpaqueToken(): string {
  return randomBytes(32).toString('base64url');
}

/** `Max-Age=0` clears both cookies on sign-out; `secureCookie` only issues live ones. */
function expiredSessionCookies(): readonly string[] {
  return [SESSION_COOKIE, CSRF_COOKIE].map(
    (name) => `${name}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`,
  );
}

function requestId(value: string): string {
  return /^[A-Za-z0-9_-]{1,128}$/.test(value) ? value : randomUUID();
}

function pseudonymousHash(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex').slice(0, 24);
}

function rateLimitKey(pepper: string, value: string): string {
  return createHmac('sha256', pepper).update(value, 'utf8').digest('hex');
}

/**
 * The caller's IP as API Gateway saw it. Never a client-supplied header such as
 * `x-forwarded-for`, which would let an attacker rotate their own rate-limit key.
 */
function sourceIpOf(event: ApiGatewayV2Event): string {
  const ip = event.requestContext.http.sourceIp;
  return typeof ip === 'string' && ip.length > 0 && ip.length <= 45 ? ip : 'unknown';
}

function containsControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const code = character.charCodeAt(0);
    return code <= 31 || code === 127;
  });
}

function verifyOriginSecret(provided: string | undefined, expected: string): boolean {
  if (provided === undefined) return false;
  const providedBytes = Buffer.from(provided, 'utf8');
  const expectedBytes = Buffer.from(expected, 'utf8');
  return (
    providedBytes.length === expectedBytes.length && timingSafeEqual(providedBytes, expectedBytes)
  );
}

/** Map a diagnostic session error's HTTP status onto the API's error-code vocab. */
function diagnosticErrorCode(status: number): HttpErrorCode {
  switch (status) {
    case 401:
      return 'unauthorized';
    case 409:
      return 'conflict';
    case 429:
      return 'rate_limited';
    default:
      return 'validation_error';
  }
}

function statusForCode(code: string): number {
  switch (code) {
    case 'unauthorized':
      return 401;
    case 'forbidden':
      return 403;
    case 'not_found':
      return 404;
    case 'conflict':
    case 'content_version_conflict':
    case 'stream_conflict':
      return 409;
    case 'rate_limited':
      return 429;
    case 'unavailable':
      return 503;
    default:
      return 400;
  }
}

function responseHeaders(origin: string | undefined, requestIdValue: string) {
  return {
    'cache-control': 'no-store',
    pragma: 'no-cache',
    'content-type': 'application/json; charset=utf-8',
    'x-content-type-options': 'nosniff',
    'strict-transport-security': 'max-age=31536000; includeSubDomains',
    'referrer-policy': 'no-referrer',
    'x-request-id': requestIdValue,
    vary: 'Origin',
    ...(origin === undefined
      ? {}
      : {
          'access-control-allow-origin': origin,
          'access-control-allow-credentials': 'true',
        }),
  } as const;
}

function jsonResponse(
  statusCode: number,
  payload: unknown,
  origin: string | undefined,
  requestIdValue: string,
  options: {
    readonly cookies?: readonly string[];
    readonly extraHeaders?: Record<string, string>;
  } = {},
): ApiGatewayV2Result {
  return {
    statusCode,
    headers: { ...responseHeaders(origin, requestIdValue), ...options.extraHeaders },
    ...(options.cookies === undefined ? {} : { cookies: options.cookies }),
    body: JSON.stringify(payload),
  };
}

function errorResponse(
  code: HttpErrorCode,
  message: string,
  origin: string | undefined,
  requestIdValue: string,
  options: {
    readonly status?: number;
    readonly retryable?: boolean;
    readonly currentStreamVersion?: number;
  } = {},
): ApiGatewayV2Result {
  const payload = HttpApiErrorSchema.parse({
    code,
    message,
    requestId: requestIdValue,
    retryable: options.retryable ?? false,
    ...(options.currentStreamVersion === undefined
      ? {}
      : { currentStreamVersion: options.currentStreamVersion }),
  });
  return jsonResponse(options.status ?? statusForCode(code), payload, origin, requestIdValue);
}

function parseBody(
  event: ApiGatewayV2Event,
  headers: Readonly<Record<string, string>>,
  maxBodyBytes: number,
): { ok: true; value: unknown } | { ok: false; status: 400 | 413 | 415; message: string } {
  const contentType = headers['content-type']?.split(';', 1)[0]?.trim().toLowerCase();
  if (contentType !== 'application/json') {
    return { ok: false, status: 415, message: 'Content-Type must be application/json.' };
  }
  const raw = event.body ?? '';
  let bytes: Buffer;
  try {
    bytes = Buffer.from(raw, event.isBase64Encoded ? 'base64' : 'utf8');
  } catch {
    return { ok: false, status: 400, message: 'The request body is invalid.' };
  }
  if (bytes.byteLength > maxBodyBytes) {
    return { ok: false, status: 413, message: 'The request body is too large.' };
  }
  try {
    return { ok: true, value: JSON.parse(bytes.toString('utf8')) as unknown };
  } catch {
    return { ok: false, status: 400, message: 'The request body is invalid JSON.' };
  }
}

function safeOrigin(origin: string | undefined, allowed: ReadonlySet<string>): string | undefined {
  return origin !== undefined && allowed.has(origin) ? origin : undefined;
}

function outcomeFor(status: number): SafeLogEvent['outcome'] {
  if (status < 400) return 'success';
  if (status === 401 || status === 403 || status === 429) return 'denied';
  if (status < 500) return 'invalid';
  return 'error';
}

function isV2Event(event: LambdaApiGatewayEvent): event is ApiGatewayV2Event {
  return 'version' in event && event.version === '2.0';
}

function v1ToV2Event(event: Exclude<LambdaApiGatewayEvent, ApiGatewayV2Event>): ApiGatewayV2Event {
  const rawQueryString = Object.entries(event.queryStringParameters ?? {})
    .filter((entry): entry is [string, string] => entry[1] !== undefined)
    .map(([name, value]) => `${encodeURIComponent(name)}=${encodeURIComponent(value)}`)
    .join('&');
  return {
    version: '2.0',
    rawPath: event.path,
    rawQueryString,
    headers: event.headers,
    requestContext: {
      requestId: event.requestContext.requestId,
      http: {
        method: event.httpMethod,
        path: event.path,
        sourceIp: event.requestContext.identity.sourceIp,
      },
    },
    body: event.body ?? undefined,
    isBase64Encoded: event.isBase64Encoded ?? false,
  };
}

function v2ToV1Result(response: ApiGatewayV2Result): ApiGatewayV1Result {
  const { cookies, ...rest } = response;
  return {
    ...rest,
    ...(cookies === undefined ? {} : { multiValueHeaders: { 'set-cookie': cookies } }),
  };
}

export function createLearnerApi(dependencies: LearnerApiDependencies): LearnerApi {
  const allowedOrigins = new Set(
    dependencies.allowedOrigins.map((origin) => {
      const parsed = new URL(origin);
      if (parsed.origin !== origin || parsed.protocol !== 'https:') {
        throw new Error('Allowed origins must be exact HTTPS origins.');
      }
      return origin;
    }),
  );
  if (allowedOrigins.size === 0) throw new Error('At least one allowed origin is required.');
  if (!/^[A-Za-z0-9_-]{64}$/.test(dependencies.originVerificationSecret)) {
    throw new Error('Origin-verification secret must be an exact generated value.');
  }
  if (
    dependencies.rateLimitPepper.length < 32 ||
    dependencies.rateLimitPepper.length > 128 ||
    containsControlCharacter(dependencies.rateLimitPepper)
  ) {
    throw new Error('Rate-limit pepper must be a bounded secret value.');
  }
  const nowMs = dependencies.nowMs ?? Date.now;
  const maxBodyBytes = dependencies.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;

  async function handle(event: ApiGatewayV2Event): Promise<ApiGatewayV2Result> {
    const startedAt = nowMs();
    const headers = normalizedHeaders(event.headers);
    const method = event.requestContext.http.method.toUpperCase();
    const path = event.rawPath;
    const requestIdValue = requestId(event.requestContext.requestId);
    const requestOrigin = headers.origin;
    const allowedOrigin = safeOrigin(requestOrigin, allowedOrigins);
    let routeLabel = '<unmatched>';
    let principal: Principal | undefined;
    let response: ApiGatewayV2Result | undefined;

    try {
      if (
        !verifyOriginSecret(headers['x-mcat-origin-verify'], dependencies.originVerificationSecret)
      ) {
        response = errorResponse(
          'forbidden',
          'Request verification failed.',
          undefined,
          requestIdValue,
        );
        return response;
      }

      if (event.rawQueryString !== undefined && event.rawQueryString !== '') {
        response = errorResponse(
          'validation_error',
          'Query parameters are not accepted on this route.',
          allowedOrigin,
          requestIdValue,
        );
        return response;
      }

      if (method === 'OPTIONS') {
        if (allowedOrigin === undefined) {
          response = errorResponse(
            'forbidden',
            'Origin is not allowed.',
            undefined,
            requestIdValue,
          );
          return response;
        }
        const methods = allowedMethodsFor(path);
        if (methods.length === 0) {
          response = errorResponse('not_found', 'Route not found.', allowedOrigin, requestIdValue);
          return response;
        }
        response = {
          statusCode: 204,
          headers: {
            ...responseHeaders(allowedOrigin, requestIdValue),
            'access-control-allow-methods': 'DELETE, GET, POST, PUT, OPTIONS',
            'access-control-allow-headers': 'content-type, authorization, x-csrf-token',
            'access-control-max-age': '600',
          },
        };
        return response;
      }

      const route = routeFor(method, path);
      if (route === undefined) {
        const allowedMethods = allowedMethodsFor(path);
        response = errorResponse(
          allowedMethods.length === 0 ? 'not_found' : 'validation_error',
          allowedMethods.length === 0 ? 'Route not found.' : 'Method not allowed.',
          allowedOrigin,
          requestIdValue,
          {
            status: allowedMethods.length === 0 ? 404 : 405,
            ...(allowedMethods.length === 0 ? {} : { retryable: false }),
          },
        );
        return response;
      }
      routeLabel = route.path;

      if (route.auth !== 'public' && requestOrigin !== undefined && allowedOrigin === undefined) {
        response = errorResponse('forbidden', 'Origin is not allowed.', undefined, requestIdValue);
        return response;
      }
      if (route.stateChanging && allowedOrigin === undefined) {
        response = errorResponse('forbidden', 'Origin is required.', undefined, requestIdValue);
        return response;
      }

      const cookies = parseCookies(event.cookies, headers.cookie);
      let resolved: ResolvedGuestSession | null = null;
      if (route.auth === 'session') {
        const token = cookies[SESSION_COOKIE];
        resolved = token === undefined ? null : await dependencies.sessions.resolve(token);
        // A session that resolves to anything other than a linked account is not
        // an account. Guest sessions are no longer issued, but an old cookie from
        // before login was required could still resolve, and it must not pass.
        if (resolved === null || resolved.principal.kind !== 'linked') {
          response = errorResponse(
            'unauthorized',
            'A valid learner session is required.',
            allowedOrigin,
            requestIdValue,
          );
          return response;
        }
        principal = resolved.principal;
      }

      // Credential routes have no session to meter, so they are metered by source
      // IP instead. Without this, sign-in would be the one unmetered state-changing
      // route in the API and the obvious place to mount a password-guessing attack.
      const rateLimitSubject =
        principal !== undefined
          ? `session:${principal.sessionId}`
          : route.auth === 'credential'
            ? `ip:${sourceIpOf(event)}`
            : null;
      if (
        rateLimitSubject !== null &&
        !(await dependencies.rateLimiter.allow({
          key: rateLimitKey(dependencies.rateLimitPepper, rateLimitSubject),
          route: route.path,
          method,
        }))
      ) {
        response = errorResponse(
          'rate_limited',
          'Too many requests. Try again later.',
          allowedOrigin,
          requestIdValue,
          { status: 429, retryable: true },
        );
        return response;
      }

      if (route.stateChanging && route.auth === 'session') {
        if (
          resolved === null ||
          !verifyDoubleSubmitCsrf(
            headers['x-csrf-token'],
            cookies[CSRF_COOKIE],
            resolved.csrfTokenHash,
          )
        ) {
          response = errorResponse(
            'forbidden',
            'CSRF validation failed.',
            allowedOrigin,
            requestIdValue,
          );
          return response;
        }
      }

      if (route.auth === 'credential') {
        if (!verifyStatelessDoubleSubmitCsrf(headers['x-csrf-token'], cookies[CSRF_COOKIE])) {
          response = errorResponse(
            'forbidden',
            'CSRF validation failed.',
            allowedOrigin,
            requestIdValue,
          );
          return response;
        }
      }

      response = await dispatch(
        route,
        event,
        headers,
        cookies,
        principal,
        (resolvedPrincipal) => {
          principal = resolvedPrincipal;
        },
        allowedOrigin,
        requestIdValue,
      );
      return response;
    } catch (error) {
      if (error instanceof AuthorityKernelError) {
        response = errorResponse(error.code, error.message, allowedOrigin, requestIdValue, {
          retryable: error.retryable,
          ...(error.currentStreamVersion === undefined
            ? {}
            : { currentStreamVersion: error.currentStreamVersion }),
        });
      } else {
        response = errorResponse(
          'unavailable',
          'The learner service is temporarily unavailable.',
          allowedOrigin,
          requestIdValue,
          { status: 503, retryable: true },
        );
      }
      return response;
    } finally {
      const status = response?.statusCode ?? 503;
      dependencies.logger.info({
        requestId: requestIdValue,
        route: routeLabel,
        method: /^(DELETE|GET|POST|PUT|OPTIONS)$/.test(method) ? method : 'UNKNOWN',
        status,
        latencyMs: Math.max(0, nowMs() - startedAt),
        principalKind: principal?.kind ?? 'anonymous',
        ...(principal === undefined ? {} : { learnerHash: pseudonymousHash(principal.learnerId) }),
        outcome: outcomeFor(status),
      });
    }
  }

  function anonymousBootstrap(
    origin: string | undefined,
    requestIdValue: string,
  ): ApiGatewayV2Result {
    const csrfToken = newOpaqueToken();
    const payload = AnonymousBootstrapResponseSchema.parse({
      authenticated: false,
      apiVersion: 'v1',
      serverTime: new Date(nowMs()).toISOString(),
      csrfToken,
    });
    return jsonResponse(200, payload, origin, requestIdValue, {
      cookies: [secureCookie(CSRF_COOKIE, csrfToken, CREDENTIAL_CSRF_MAX_AGE_SECONDS)],
    });
  }

  async function authenticatedBootstrap(
    bootstrapped: Awaited<ReturnType<GuestSessionService['bootstrap']>>,
    origin: string | undefined,
    requestIdValue: string,
  ): Promise<ApiGatewayV2Result> {
    const snapshot = await dependencies.kernel.snapshot(bootstrapped.principal);
    const payload = AuthenticatedBootstrapResponseSchema.parse({
      authenticated: true,
      learnerId: bootstrapped.principal.learnerId,
      accountState: bootstrapped.principal.kind,
      bankStatus: 'loaded',
      contentRelease: snapshot.contentRelease,
      apiVersion: 'v1',
      onboardingComplete: snapshot.today !== null && snapshot.session.kind !== 'locked',
      serverTime: new Date(nowMs()).toISOString(),
      streamVersion: snapshot.streamVersion,
      csrfToken: bootstrapped.csrfToken,
    });
    return jsonResponse(200, payload, origin, requestIdValue, {
      cookies: [
        secureCookie(SESSION_COOKIE, bootstrapped.sessionToken, bootstrapped.maxAgeSeconds),
        secureCookie(CSRF_COOKIE, bootstrapped.csrfToken, bootstrapped.maxAgeSeconds),
      ],
    });
  }

  /**
   * The signed-out session exchange.
   *
   * Trades a Supabase access token for one of our sessions. Credentials never
   * reach this API, so there is nothing here that could distinguish a registered
   * address from an unregistered one — the enumeration surface that the previous
   * sign-up and reset routes had to defend against is simply gone.
   */
  async function authRoute(
    route: RouteDefinition,
    event: ApiGatewayV2Event,
    origin: string | undefined,
    requestIdValue: string,
  ): Promise<ApiGatewayV2Result> {
    const identity = dependencies.identity;
    if (identity === undefined) {
      return errorResponse(
        'unavailable',
        'Accounts are temporarily unavailable.',
        origin,
        requestIdValue,
        { status: 503, retryable: true },
      );
    }
    const headers = normalizedHeaders(event.headers);
    const parsedBody = parseBody(event, headers, maxBodyBytes);
    if (!parsedBody.ok) {
      return errorResponse('validation_error', parsedBody.message, origin, requestIdValue, {
        status: parsedBody.status,
      });
    }
    const parsed = route.bodySchema?.safeParse(parsedBody.value);
    if (parsed === undefined || !parsed.success) {
      return errorResponse(
        'validation_error',
        'The request body does not match the route contract.',
        origin,
        requestIdValue,
      );
    }

    switch (route.id) {
      case 'authSessionExchange': {
        const { accessToken } = parsed.data as { accessToken: string };
        const result = await identity.verify(accessToken);
        if (result.status !== 'verified') {
          return errorResponse(
            'unauthorized',
            'That sign-in has expired. Sign in again.',
            origin,
            requestIdValue,
          );
        }

        // Find-or-create, keyed on the provider subject. A learner who signs in
        // on a second device, or who signed up with a password and later uses
        // Google on the same verified address, resolves to the same row because
        // Supabase hands back the same `sub`.
        const session = await dependencies.sessions.signIn(
          dependencies.identityProviderName ?? DEFAULT_IDENTITY_PROVIDER,
          result.identity.subject,
        );
        return jsonResponse(
          200,
          { status: 'signed_in', csrfToken: session.csrfToken },
          origin,
          requestIdValue,
          {
            cookies: [
              secureCookie(SESSION_COOKIE, session.sessionToken, session.maxAgeSeconds),
              secureCookie(CSRF_COOKIE, session.csrfToken, session.maxAgeSeconds),
            ],
          },
        );
      }
      default:
        return errorResponse('not_found', 'Route not found.', origin, requestIdValue, {
          status: 404,
        });
    }
  }

  async function dispatch(
    route: RouteDefinition,
    event: ApiGatewayV2Event,
    headers: Readonly<Record<string, string>>,
    cookies: Readonly<Record<string, string>>,
    principal: Principal | undefined,
    setPrincipal: (principal: Principal) => void,
    origin: string | undefined,
    requestIdValue: string,
  ): Promise<ApiGatewayV2Result> {
    if (route.id === 'health') {
      return jsonResponse(200, { status: 'ok' }, origin, requestIdValue);
    }
    if (route.id === 'bootstrap') {
      // Bootstrap no longer mints a learner. It reports whether the caller already
      // holds a linked session and, when they do not, hands back only the CSRF
      // token the signed-out credential routes need.
      const existingToken = cookies[SESSION_COOKIE];
      const existing =
        existingToken === undefined ? null : await dependencies.sessions.resolve(existingToken);
      if (existing === null || existing.principal.kind !== 'linked') {
        return anonymousBootstrap(origin, requestIdValue);
      }

      const bootstrapped = await dependencies.sessions.bootstrap(existingToken ?? null);
      // The session could have expired between resolving it and rotating it, in
      // which case the service falls back to a fresh guest. That is not an account,
      // so report the caller as signed out rather than handing back a guest cookie.
      if (bootstrapped.principal.kind !== 'linked') {
        return anonymousBootstrap(origin, requestIdValue);
      }
      principal = bootstrapped.principal;
      setPrincipal(principal);
      return authenticatedBootstrap(bootstrapped, origin, requestIdValue);
    }
    if (route.auth === 'credential') {
      return authRoute(route, event, origin, requestIdValue);
    }
    if (route.id === 'authSignOut') {
      const token = cookies[SESSION_COOKIE];
      if (token !== undefined) await dependencies.sessions.revoke(token);
      return jsonResponse(200, { status: 'signed_out' }, origin, requestIdValue, {
        cookies: expiredSessionCookies(),
      });
    }
    if (principal === undefined) {
      return errorResponse(
        'unauthorized',
        'A valid learner session is required.',
        origin,
        requestIdValue,
      );
    }
    if (route.bodySchema !== undefined) {
      const parsedBody = parseBody(event, headers, maxBodyBytes);
      if (!parsedBody.ok) {
        return errorResponse('validation_error', parsedBody.message, origin, requestIdValue, {
          status: parsedBody.status,
        });
      }
      const parsed = route.bodySchema.safeParse(parsedBody.value);
      if (!parsed.success) {
        return errorResponse(
          'validation_error',
          'The request body does not match the route contract.',
          origin,
          requestIdValue,
        );
      }
      switch (route.id) {
        case 'attempt':
          return jsonResponse(
            200,
            AcceptedCommandResponseSchema.parse(
              await dependencies.kernel.handleAttempt(parsed.data, principal),
            ),
            origin,
            requestIdValue,
          );
        case 'reveal':
          return jsonResponse(
            200,
            await dependencies.kernel.handleReveal(parsed.data as RevealCommandBody, principal),
            origin,
            requestIdValue,
          );
        case 'continue':
          return jsonResponse(
            200,
            await dependencies.kernel.handleContinue(parsed.data as ContinueCommandBody, principal),
            origin,
            requestIdValue,
          );
        case 'recall':
          return jsonResponse(
            200,
            await dependencies.kernel.handleRecall(parsed.data as RecallCommandBody, principal),
            origin,
            requestIdValue,
          );
        case 'practiceAttempt':
          return jsonResponse(
            200,
            await dependencies.kernel.handlePractice(
              parsed.data as PracticeAttemptCommandBody,
              principal,
            ),
            origin,
            requestIdValue,
          );
        case 'practiceAdaptiveAttempt':
          return jsonResponse(
            200,
            route.responseSchema?.parse(
              await dependencies.kernel.handlePracticeAdaptive(
                parsed.data as PracticeAdaptiveAttemptCommandBody,
                principal,
              ),
            ),
            origin,
            requestIdValue,
          );
        case 'carsDuel':
          return jsonResponse(
            200,
            await dependencies.kernel.handleCarsDuel(parsed.data as CarsDuelCommandBody, principal),
            origin,
            requestIdValue,
          );
        case 'todaysPathBuild':
          // Persists the day's plan through the kernel transaction, then returns
          // the built view (not an AcceptedCommandResponse) — like the adaptive
          // practice attempt.
          return jsonResponse(
            200,
            route.responseSchema?.parse(
              await dependencies.kernel.buildTodaysPath(
                parsed.data as BuildTodaysPathCommand,
                principal,
              ),
            ),
            origin,
            requestIdValue,
          );
        case 'todaysPathActivity':
          return jsonResponse(
            200,
            AcceptedCommandResponseSchema.parse(
              await dependencies.kernel.recordPlanActivity(
                parsed.data as PlanActivityProgressCommand,
                principal,
              ),
            ),
            origin,
            requestIdValue,
          );
        case 'dailyBudget':
          return jsonResponse(
            200,
            AcceptedCommandResponseSchema.parse(
              await dependencies.kernel.setDailyBudget(
                parsed.data as DailyBudgetCommand,
                principal,
              ),
            ),
            origin,
            requestIdValue,
          );
        case 'diagnosticNext':
        case 'diagnosticBlock': {
          // Off-kernel like passageAttempt: serves the block diagnostic over its
          // own persisted session (no mastery). A DiagnosticSessionError carries
          // its own HTTP status (401 expired/foreign, 409 replayed block token);
          // anything else propagates to the outer 503 handler.
          if (dependencies.diagnostic === undefined) {
            return errorResponse(
              'unavailable',
              'The diagnostic is temporarily unavailable.',
              origin,
              requestIdValue,
              { status: 503, retryable: true },
            );
          }
          try {
            const body = parsed.data as Record<string, unknown>;
            const payload =
              route.id === 'diagnosticNext'
                ? await dependencies.diagnostic.next(principal.learnerId, body)
                : await dependencies.diagnostic.block(principal.learnerId, body);
            return jsonResponse(200, route.responseSchema?.parse(payload), origin, requestIdValue);
          } catch (error) {
            if (error instanceof DiagnosticSessionError) {
              return errorResponse(
                diagnosticErrorCode(error.status),
                error.message,
                origin,
                requestIdValue,
                { status: error.status, retryable: error.status === 429 },
              );
            }
            throw error;
          }
        }
        case 'passageAttempt': {
          // FORMATIVE: scores one answer and reveals its explanation; writes no
          // mastery, appends no event. Returns 404 for an unknown question id (or
          // when no passage source is configured), exactly like the dev API.
          const attempt = parsed.data as PassageAttemptRequest;
          const grade =
            (await dependencies.passage?.grade(attempt.questionId, attempt.choiceId)) ?? null;
          if (grade === null) {
            return errorResponse(
              'not_found',
              'That passage question is not in the pool.',
              origin,
              requestIdValue,
            );
          }
          return jsonResponse(
            200,
            PassageAttemptResponseSchema.parse({ grade }),
            origin,
            requestIdValue,
          );
        }
        case 'aiRewrite': {
          // Grounded rewrite is authored server-side from the posted vetted
          // source only; ai-gateway enforces the numeric grounding gate before
          // returning. No key configured -> 503 -> client falls back.
          const rewrite = await groundedRewrite(parsed.data, dependencies.aiConfig ?? {});
          return jsonResponse(rewrite.status, rewrite.json, origin, requestIdValue);
        }
        case 'aiChat': {
          // CARS Duel opponent. The client builds its own guarded CARS prompts;
          // this route holds the provider key server-side (the SAME aiConfig as
          // rewrite) and runs behind the same auth as every /v1 route. The parser
          // already capped message count + combined size. No key configured -> 503
          // -> the client shows the opponent offline (and a plan-launched duel
          // still completes so the guided plan can't deadlock). A transport
          // failure is 502, never a 500.
          const chat = await proxyChat(parsed.data, dependencies.aiConfig ?? {});
          return jsonResponse(chat.status, chat.json, origin, requestIdValue);
        }
        case 'practiceTestCompleted':
          return jsonResponse(
            200,
            await dependencies.kernel.handlePracticeTestCompleted(
              parsed.data as ContinueCommandBody,
              principal,
            ),
            origin,
            requestIdValue,
          );
        case 'practiceTestReviewed':
          return jsonResponse(
            200,
            await dependencies.kernel.handlePracticeTestReviewed(
              parsed.data as ContinueCommandBody,
              principal,
            ),
            origin,
            requestIdValue,
          );
        case 'masterySeed':
          return jsonResponse(
            200,
            await dependencies.kernel.handleMasterySeed(
              parsed.data as MasterySeedCommandBody,
              principal,
            ),
            origin,
            requestIdValue,
          );
        case 'resetProgress':
          return jsonResponse(
            200,
            await dependencies.kernel.handleReset(parsed.data as ContinueCommandBody, principal),
            origin,
            requestIdValue,
          );
        case 'vectorLessonStart':
          return jsonResponse(
            200,
            route.responseSchema?.parse(
              await dependencies.kernel.handleVectorLessonStart(
                parsed.data as VectorLessonStartCommand,
                principal,
              ),
            ),
            origin,
            requestIdValue,
          );
        case 'vectorLessonCommand':
          return jsonResponse(
            200,
            AcceptedCommandResponseSchema.parse(
              await dependencies.kernel.handleVectorLessonCommand(
                parsed.data as VectorLessonCommand,
                principal,
              ),
            ),
            origin,
            requestIdValue,
          );
        case 'normalizedLessonStart': {
          const lessonId = normalizedLessonIdFor(event.rawPath);
          const command = parsed.data as NormalizedLessonStartCommand;
          // The slug is the authority for which lesson runs; a body id that names
          // a different lesson is rejected, exactly as L1's `z.literal` rejects a
          // foreign id on its own route.
          if (lessonId === null || command.lessonId !== lessonId) {
            return errorResponse(
              'validation_error',
              'The lesson identity does not match this route.',
              origin,
              requestIdValue,
            );
          }
          return jsonResponse(
            200,
            route.responseSchema?.parse(
              await dependencies.kernel.handleNormalizedLessonStart(
                lessonId,
                { envelope: command.envelope },
                principal,
              ),
            ),
            origin,
            requestIdValue,
          );
        }
        case 'normalizedLessonCommand': {
          const lessonId = normalizedLessonIdFor(event.rawPath);
          if (lessonId === null) {
            return errorResponse('not_found', 'Route not found.', origin, requestIdValue);
          }
          return jsonResponse(
            200,
            AcceptedCommandResponseSchema.parse(
              await dependencies.kernel.handleNormalizedLessonCommand(
                lessonId,
                parsed.data as NormalizedLessonCommandInput,
                principal,
              ),
            ),
            origin,
            requestIdValue,
          );
        }
        default:
          return jsonResponse(
            200,
            AcceptedCommandResponseSchema.parse(
              await dependencies.kernel.handle(parsed.data, principal),
            ),
            origin,
            requestIdValue,
          );
      }
    }

    if (route.id === 'skills') {
      return jsonResponse(
        200,
        route.responseSchema?.parse(await dependencies.kernel.skills(principal)),
        origin,
        requestIdValue,
      );
    }

    if (route.id === 'practiceItem') {
      const questionId = practiceQuestionId(event.rawPath);
      if (questionId === null) {
        return errorResponse('not_found', 'Route not found.', origin, requestIdValue);
      }
      return jsonResponse(
        200,
        route.responseSchema?.parse(await dependencies.kernel.practiceItem(questionId, principal)),
        origin,
        requestIdValue,
      );
    }

    if (route.id === 'passageToday') {
      // FORMATIVE, learner-safe view. The tz offset rides in the path; a `null`
      // passage is the honest "pool is empty / no source configured" answer.
      const tz = passageTzFromPath(event.rawPath);
      if (tz === null) {
        return errorResponse('not_found', 'Route not found.', origin, requestIdValue);
      }
      const passage = (await dependencies.passage?.today(tz)) ?? null;
      return jsonResponse(
        200,
        PassageTodayResponseSchema.parse({ passage }),
        origin,
        requestIdValue,
      );
    }

    if (route.id === 'practiceQueue') {
      const params = practiceQueueParams(event.rawPath);
      if (params === null) {
        return errorResponse('not_found', 'Route not found.', origin, requestIdValue);
      }
      return jsonResponse(
        200,
        route.responseSchema?.parse(
          await dependencies.kernel.getPracticeQueueAdaptive(params.x, params.focus, principal),
        ),
        origin,
        requestIdValue,
      );
    }

    if (route.id === 'wrapped') {
      return jsonResponse(
        200,
        route.responseSchema?.parse(await dependencies.kernel.wrapped(principal)),
        origin,
        requestIdValue,
      );
    }

    if (route.id === 'progressSkills') {
      return jsonResponse(
        200,
        route.responseSchema?.parse(await dependencies.kernel.masterySkills(principal)),
        origin,
        requestIdValue,
      );
    }

    if (route.id === 'progressLessons') {
      return jsonResponse(
        200,
        route.responseSchema?.parse(await dependencies.kernel.masteryLessons(principal)),
        origin,
        requestIdValue,
      );
    }

    if (route.id === 'progressLessonWarrants') {
      return jsonResponse(
        200,
        route.responseSchema?.parse(await dependencies.kernel.lessonWarrants(principal)),
        origin,
        requestIdValue,
      );
    }

    if (route.id === 'progressCars') {
      return jsonResponse(
        200,
        route.responseSchema?.parse(await dependencies.kernel.carsReadiness(principal)),
        origin,
        requestIdValue,
      );
    }

    if (route.id === 'carsReasoningPatterns') {
      return jsonResponse(
        200,
        route.responseSchema?.parse(await dependencies.kernel.carsReasoningPatterns(principal)),
        origin,
        requestIdValue,
      );
    }

    if (route.id === 'mistakesRepair') {
      const limit = mistakesRepairLimit(event.rawPath);
      if (limit === null) {
        return errorResponse('not_found', 'Route not found.', origin, requestIdValue);
      }
      return jsonResponse(
        200,
        route.responseSchema?.parse(await dependencies.kernel.getRepairQueue(limit, principal)),
        origin,
        requestIdValue,
      );
    }

    if (route.id === 'goalView') {
      return jsonResponse(
        200,
        route.responseSchema?.parse(await dependencies.kernel.goal(principal)),
        origin,
        requestIdValue,
      );
    }

    if (route.id === 'todaysPath') {
      // Read-only plan projection: `built: false` (never a 404 or an onboarding
      // conflict) when no plan exists for the current day yet.
      return jsonResponse(
        200,
        route.responseSchema?.parse(await dependencies.kernel.getTodaysPath(principal)),
        origin,
        requestIdValue,
      );
    }

    if (route.id === 'vectorLessonStatus') {
      return jsonResponse(
        200,
        route.responseSchema?.parse(await dependencies.kernel.vectorLessonStatus(principal)),
        origin,
        requestIdValue,
      );
    }

    if (route.id === 'vectorLessonRun') {
      return jsonResponse(
        200,
        route.responseSchema?.parse(await dependencies.kernel.vectorLessonRun(principal)),
        origin,
        requestIdValue,
      );
    }

    if (route.id === 'normalizedLessonStatus') {
      const lessonId = normalizedLessonIdFor(event.rawPath);
      if (lessonId === null) {
        return errorResponse('not_found', 'Route not found.', origin, requestIdValue);
      }
      return jsonResponse(
        200,
        route.responseSchema?.parse(
          await dependencies.kernel.normalizedLessonStatus(lessonId, principal),
        ),
        origin,
        requestIdValue,
      );
    }

    if (route.id === 'normalizedLessonRun') {
      const lessonId = normalizedLessonIdFor(event.rawPath);
      if (lessonId === null) {
        return errorResponse('not_found', 'Route not found.', origin, requestIdValue);
      }
      return jsonResponse(
        200,
        route.responseSchema?.parse(
          await dependencies.kernel.normalizedLessonRun(lessonId, principal),
        ),
        origin,
        requestIdValue,
      );
    }

    const snapshot = await dependencies.kernel.snapshot(principal);
    let selected: unknown;
    switch (route.id) {
      case 'today':
        if (snapshot.today === null) {
          return errorResponse(
            'conflict',
            'Complete onboarding before requesting Today.',
            origin,
            requestIdValue,
          );
        }
        selected = snapshot.today;
        break;
      case 'session':
        selected = snapshot.session;
        break;
      case 'mastery':
        selected = snapshot.masteryMap;
        break;
      case 'errors':
        selected = snapshot.errorLog;
        break;
      case 'shakyWins':
        selected = snapshot.shakyWins;
        break;
      case 'errorPatterns':
        selected = snapshot.errorPatterns;
        break;
      default:
        return errorResponse('not_found', 'Route not found.', origin, requestIdValue);
    }
    return jsonResponse(200, route.responseSchema?.parse(selected), origin, requestIdValue);
  }

  async function handler(event: ApiGatewayV1Event, _context?: unknown): Promise<ApiGatewayV1Result>;
  async function handler(event: ApiGatewayV2Event, _context?: unknown): Promise<ApiGatewayV2Result>;
  async function handler(
    event: LambdaApiGatewayEvent,
    _context?: unknown,
  ): Promise<LambdaApiGatewayResult> {
    if (isV2Event(event)) return handle(event);
    return v2ToV1Result(await handle(v1ToV2Event(event)));
  }
  return { handle, handler };
}

export function createRepositoryLearnerApi(
  dependencies: RepositoryLearnerApiDependencies,
): LearnerApi {
  const { repository, clock, bank, practiceBank, practiceTestEnabled, ...apiDependencies } =
    dependencies;
  return createLearnerApi({
    ...apiDependencies,
    kernel: new RepositoryLearnerKernel({
      repository,
      clock,
      bank,
      ...(practiceBank !== undefined ? { practiceBank } : {}),
      ...(practiceTestEnabled !== undefined ? { practiceTestEnabled } : {}),
    }),
  });
}

export const SUPPORTED_LEARNER_ROUTES = ROUTES;
