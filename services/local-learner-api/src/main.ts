import { createServer } from 'node:http';

import { aiConfigFromEnv } from '@mcat/ai-gateway/server';
import { Authority } from '@mcat/authority-core';
import { systemClock } from '@mcat/contracts';
import { createFilePracticeBankPort } from '@mcat/corpus-pull';
import {
  SupabaseIdentityProvider,
  createGuestProjection,
  createRepositoryLearnerApi,
  fetchSupabaseJwks,
  parseSupabaseConfig,
  type LearnerApi,
  type PassagePort,
  type SafeLogger,
} from '@mcat/learner-api';
import { PassageOfDayService } from '@mcat/passage-of-day';
import {
  PostgresAuthorityRepository,
  PostgresFixedWindowRateLimiter,
  PostgresGuestSessionService,
  createPgPool,
} from '@mcat/persistence-postgres';

import { hardcodedPassagePool } from '../../../content/passage-of-the-day/pool';
import { ensureGeneratedSecrets } from './env-file';
import { parseLocalEnvironment } from './environment';
import {
  RequestTooLargeError,
  readRequestBody,
  toApiGatewayEvent,
  writeApiGatewayResult,
} from './node-event';

/**
 * The deployed learner API, running on this machine.
 *
 * Everything security-relevant is the deployed article, unchanged: the same
 * `createRepositoryLearnerApi`, the same Supabase token verification, the same
 * `__Host-` cookies with `Secure`, the same origin-verification header, the same
 * HTTPS-only origin allowlist. That last one is why Vite serves the app over TLS
 * locally — the origin really is `https://localhost:5173`, so no rule has to be
 * relaxed to accept it.
 *
 * Two things are deliberately NOT the deployed article:
 *
 *  - Configuration is plain environment variables, not Secrets Manager. This
 *    process has no AWS credentials and needs none.
 *  - Question content comes from the local corpus pull and the hardcoded passage
 *    pool, never from the database. The database behind a local run is a hosted
 *    Supabase project, and `question_protected` holds answer keys; the learner
 *    tables have no foreign key to `questions`, so the split costs nothing.
 */

const say = (line: string): void => {
  process.stdout.write(`${line}\n`);
};

const logger: SafeLogger = {
  info: (event) => {
    process.stdout.write(`${JSON.stringify(event)}\n`);
  },
};

/**
 * Formative Passage of the Day over the vetted pool compiled into
 * `content/passage-of-the-day/pool.ts`. The deployed runtime reads the
 * `passages` table instead; here that table would be content in a database that
 * is meant to hold none, and the hardcoded pool is the same fallback a fresh
 * clone already uses.
 */
function createPassagePort(): PassagePort {
  const service = new PassageOfDayService(hardcodedPassagePool());
  return {
    today: async (tzMinutes) => service.todayView(new Date(), tzMinutes),
    grade: async (questionId, choiceId) => service.grade(questionId, choiceId),
  };
}

async function createRuntime(): Promise<{ api: LearnerApi; port: number; origin: string }> {
  // Normally a no-op: `pnpm dev` has already done this so that Vite, which reads
  // its configuration once, sees the same secret. Repeated here so that starting
  // this process on its own still works.
  const generated = ensureGeneratedSecrets();
  if (generated.length > 0) {
    say(
      `[local-api] wrote ${generated.map((secret) => secret.name).join(' and ')} to .env.local. ` +
        'Restart Vite so its proxy picks them up.',
    );
  }

  const environment = parseLocalEnvironment();

  // The deployed API pins this key set at deploy time because its subnets have no
  // egress. This process does have egress, so it fetches — and then runs the
  // result through the very same parser the pinned secret goes through, so a
  // key set that would be refused in production is refused here too.
  const jwks = await fetchSupabaseJwks(environment.supabaseProjectUrl);
  const supabaseConfig = parseSupabaseConfig(
    JSON.stringify({ projectUrl: environment.supabaseProjectUrl, jwks }),
  );

  const pool = createPgPool({
    connectionString: environment.database.connectionString,
    ...(environment.database.tls === false
      ? { tls: false as const }
      : { tls: environment.database.tls }),
    applicationName: 'mcat-local-learner-api',
    maxConnections: 4,
    // Supabase's free tier idles the database, so the first connection after a
    // pause can take several seconds. The deployed 5s budget assumes a warm RDS
    // Proxy next door and would turn that cold start into a boot failure.
    connectionTimeoutMs: 30_000,
    // A connection to the hosted pooler costs ~500ms to open (TCP, TLS, and
    // SCRAM to us-west-2) plus one more round trip for the session GUCs. The
    // 30s default discards them faster than a developer clicks, so a pause for
    // a code change means the next page load re-handshakes all four — measured
    // at ~640ms added to every request in that first burst. The deployed API
    // keeps the default: Lambda concurrency there is elastic and idle
    // connections are a shared resource, whereas this process is one developer's
    // and holding four open is exactly what the pooler is for.
    idleTimeoutMs: 300_000,
  });

  const authority = new Authority(undefined, systemClock);
  const practiceBank = createFilePracticeBankPort();
  say(
    practiceBank === null
      ? '[local-api] practice bank: synthetic fixture — no corpus pull at ' +
          'content/question-bank/.local/db-pull, so Practice runs on the 7-question enzyme bank.'
      : `[local-api] practice bank: local corpus pull — ${practiceBank.stats.items} items, ` +
          `${practiceBank.stats.practisableUnits} practisable units (exposure/repair are in-memory).`,
  );

  const api = createRepositoryLearnerApi({
    repository: new PostgresAuthorityRepository(pool, {
      newGuestProjection: createGuestProjection,
    }),
    clock: systemClock,
    bank: authority.bank,
    ...(practiceBank === null ? {} : { practiceBank }),
    sessions: new PostgresGuestSessionService(pool, createGuestProjection),
    identity: new SupabaseIdentityProvider(supabaseConfig),
    rateLimiter: new PostgresFixedWindowRateLimiter(pool),
    rateLimitPepper: environment.rateLimitPepper,
    originVerificationSecret: environment.originVerificationSecret,
    allowedOrigins: [environment.learnerWebOrigin],
    logger,
    aiConfig: aiConfigFromEnv(process.env),
    passage: createPassagePort(),
  });

  return { api, port: environment.port, origin: environment.learnerWebOrigin };
}

const { api, port, origin } = await createRuntime();

const server = createServer((request, response) => {
  void (async () => {
    try {
      const body = await readRequestBody(request);
      const result = await api.handle(
        toApiGatewayEvent({
          method: request.method,
          url: request.url,
          headers: request.headers,
          remoteAddress: request.socket.remoteAddress,
          body,
        }),
      );
      writeApiGatewayResult(response, result);
    } catch (error) {
      // Only transport-level failures reach here; the handler answers its own
      // errors. Keep the shape the client already understands.
      const tooLarge = error instanceof RequestTooLargeError;
      response.writeHead(tooLarge ? 413 : 500, {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
      });
      response.end(
        JSON.stringify({
          code: tooLarge ? 'validation_error' : 'unavailable',
          message: tooLarge ? 'The request body is too large.' : 'The local learner API failed.',
          retryable: !tooLarge,
        }),
      );
    }
  })();
});

// Loopback only. This process holds a real database connection and a real
// Supabase issuer; nothing on the network should be able to reach it.
await new Promise<void>((resolve, reject) => {
  server.once('error', reject);
  server.listen(port, '127.0.0.1', () => {
    server.off('error', reject);
    resolve();
  });
});

say(`[local-api] listening on http://127.0.0.1:${port} for ${origin}`);

const close = async (): Promise<void> => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  process.exit(0);
};
process.once('SIGINT', () => void close());
process.once('SIGTERM', () => void close());
