import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import type { PracticeBankPort } from '@mcat/authority-core';
import {
  AuthorityKernelError,
  type AuthorityKernel,
  type AuthorityKernelDependencies,
  type Principal,
} from '@mcat/authority-kernel';
import {
  AcceptedCommandResponseSchema,
  GuestBootstrapResponseSchema,
  HttpApiErrorSchema,
  type Clock,
  type HttpErrorCode,
  type VectorLessonCommand,
  type VectorLessonStartCommand,
} from '@mcat/contracts';
import type { AuthorityRepository } from '@mcat/database';
import { groundedRewrite, type AiProxyConfig } from '@mcat/ai-gateway/server';

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
import {
  CSRF_COOKIE,
  SESSION_COOKIE,
  parseCookies,
  secureCookie,
  verifyDoubleSubmitCsrf,
  type GuestSessionService,
  type ResolvedGuestSession,
} from './session';
import { RepositoryLearnerKernel } from './workflow';

interface KernelPort {
  handle(input: unknown, principal: Principal): ReturnType<AuthorityKernel['handle']>;
  snapshot(principal: Principal): ReturnType<AuthorityKernel['snapshot']>;
  diagnosticNext(principal: Principal): ReturnType<RepositoryLearnerKernel['diagnosticNext']>;
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
}

export interface LearnerApiDependencies {
  readonly kernel: KernelPort;
  readonly sessions: GuestSessionService;
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
}

export interface RepositoryLearnerApiDependencies extends Omit<LearnerApiDependencies, 'kernel'> {
  readonly repository: AuthorityRepository;
  readonly clock: Clock;
  readonly bank: AuthorityKernelDependencies['bank'];
  /** Adaptive-practice bank/exposure seam (Postgres in prod; synthetic fallback). */
  readonly practiceBank?: PracticeBankPort;
}

export interface LearnerApi {
  handle(event: ApiGatewayV2Event): Promise<ApiGatewayV2Result>;
  handler(event: ApiGatewayV1Event, context?: unknown): Promise<ApiGatewayV1Result>;
  handler(event: ApiGatewayV2Event, context?: unknown): Promise<ApiGatewayV2Result>;
}

const DEFAULT_MAX_BODY_BYTES = 64 * 1024;

function requestId(value: string): string {
  return /^[A-Za-z0-9_-]{1,128}$/.test(value) ? value : randomUUID();
}

function pseudonymousHash(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex').slice(0, 24);
}

function rateLimitKey(pepper: string, value: string): string {
  return createHmac('sha256', pepper).update(value, 'utf8').digest('hex');
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
        if (resolved === null) {
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

      if (
        principal !== undefined &&
        !(await dependencies.rateLimiter.allow({
          key: rateLimitKey(dependencies.rateLimitPepper, `session:${principal.sessionId}`),
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
      const bootstrapped = await dependencies.sessions.bootstrap(cookies[SESSION_COOKIE] ?? null);
      principal = bootstrapped.principal;
      setPrincipal(principal);
      const snapshot = await dependencies.kernel.snapshot(principal);
      const payload = GuestBootstrapResponseSchema.parse({
        learnerId: principal.learnerId,
        accountState: principal.kind,
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
        case 'aiRewrite': {
          // Grounded rewrite is authored server-side from the posted vetted
          // source only; ai-gateway enforces the numeric grounding gate before
          // returning. No key configured -> 503 -> client falls back.
          const rewrite = await groundedRewrite(parsed.data, dependencies.aiConfig ?? {});
          return jsonResponse(rewrite.status, rewrite.json, origin, requestIdValue);
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

    if (route.id === 'diagnosticNext') {
      return jsonResponse(
        200,
        route.responseSchema?.parse(await dependencies.kernel.diagnosticNext(principal)),
        origin,
        requestIdValue,
      );
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
  const { repository, clock, bank, practiceBank, ...apiDependencies } = dependencies;
  return createLearnerApi({
    ...apiDependencies,
    kernel: new RepositoryLearnerKernel({
      repository,
      clock,
      bank,
      ...(practiceBank !== undefined ? { practiceBank } : {}),
    }),
  });
}

export const SUPPORTED_LEARNER_ROUTES = ROUTES;
