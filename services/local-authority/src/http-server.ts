import { randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { fileURLToPath } from 'node:url';
import { Authority } from '@mcat/authority-core';
import {
  AuthorityKernelError,
  InMemoryAuthorityRepository,
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
import { RepositoryLearnerKernel } from '@mcat/learner-api';

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 8787;
const MAX_BODY_BYTES = 64 * 1024;
const LOCAL_ORIGIN = /^http:\/\/(?:127\.0\.0\.1|localhost):\d+$/;

export interface RunningLocalLessonServer {
  readonly baseUrl: string;
  close(): Promise<void>;
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

function corsOrigin(request: IncomingMessage): string | undefined {
  const origin = request.headers.origin;
  return origin !== undefined && LOCAL_ORIGIN.test(origin) ? origin : undefined;
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
  if (host !== '127.0.0.1' && host !== 'localhost') {
    throw new Error('Local lesson authority must bind only to loopback.');
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

  const server = createServer(async (request, response) => {
    const origin = corsOrigin(request);
    const method = request.method ?? 'GET';
    const path = new URL(request.url ?? '/', 'http://localhost').pathname;

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
  const baseUrl = `http://${host}:${address.port}`;
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
