# AWS Phase 4B Authoritative Data and API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Lambda-compatible, PostgreSQL-backed authority that accepts idempotent learner commands, persists authoritative events/state, and serves the current synthetic browser journey over `/v1`.

**Architecture:** A transport-neutral authority kernel depends on repository ports. PostgreSQL repositories append accepted events and outbox rows transactionally while maintaining an explicitly versioned JSON projection for the prototype journey. API Gateway adapters derive ownership from opaque guest sessions or verified Cognito claims.

**Tech Stack:** TypeScript 5.7.3, Zod 3.24.1, PostgreSQL/Aurora, `pg` 8.22.0, Vitest 2.1.8, AWS Lambda Node.js 22.

## Global Constraints

- PostgreSQL is authoritative; browser state is never accepted as truth.
- Event UUID, learner/idempotency key, and learner/sequence are unique.
- No handler accepts learner ownership from the request body.
- The synthetic fixture is the only content available in development.
- Accepted event and outbox insertion occur in one transaction.
- Production content and publication remain disabled.

---

### Task 1: Create ordered database migrations and repository ports

**Files:**
- Create: `database/package.json`
- Create: `database/tsconfig.json`
- Create: `database/migrations/0001_authority.sql`
- Create: `database/docker-compose.test.yml`
- Create: `database/src/types.ts`
- Create: `database/src/ports.ts`
- Create: `database/src/migrate.ts`
- Create: `database/src/index.ts`
- Create: `database/src/migrations.test.ts`
- Modify: `vitest.workspace.ts`

**Interfaces:**
- Produces: `AuthorityRepository`, `AuthorityTransaction`, `AcceptedCommand`, `LearnerProjectionRecord`, `OutboxRecord`.
- Produces: `runMigrations(pool, migrationsDir): Promise<void>` using PostgreSQL advisory lock `72004001`.

- [ ] **Step 1: Write failing migration structure tests**

```ts
it('defines immutable event and transactional outbox constraints', () => {
  const sql = readFileSync('database/migrations/0001_authority.sql', 'utf8');
  expect(sql).toContain('unique (event_id)');
  expect(sql).toContain('unique (learner_id, idempotency_key)');
  expect(sql).toContain('unique (learner_id, sequence)');
  expect(sql).toContain('create table outbox');
});
```

- [ ] **Step 2: Verify RED**

Run: `pnpm exec vitest run database/src/migrations.test.ts`

Expected: FAIL because the migration is absent.

- [ ] **Step 3: Implement the migration**

```sql
create table learners (
  learner_id uuid primary key,
  account_state text not null check (account_state in ('guest','linked','recovering')),
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table learner_streams (
  learner_id uuid primary key references learners(learner_id) on delete cascade,
  current_sequence bigint not null default 0,
  projection_version text not null,
  state_json jsonb not null,
  updated_at timestamptz not null
);

create table accepted_events (
  event_id uuid primary key,
  learner_id uuid not null references learners(learner_id) on delete cascade,
  idempotency_key text not null,
  sequence bigint not null,
  accepted_at timestamptz not null,
  event_type text not null,
  content_release text not null,
  policy_versions jsonb not null,
  payload jsonb not null,
  unique (learner_id, idempotency_key),
  unique (learner_id, sequence)
);

create table outbox (
  outbox_id uuid primary key,
  learner_id uuid not null references learners(learner_id) on delete cascade,
  sequence bigint not null,
  topic text not null,
  payload jsonb not null,
  created_at timestamptz not null,
  published_at timestamptz,
  attempts integer not null default 0
);
```

The same migration adds goals, guest sessions, projection metadata, content releases, privacy jobs, and audit tables from the approved design with ownership indexes.

- [ ] **Step 4: Add the deterministic PostgreSQL test harness**

```yaml
services:
  postgres:
    image: postgres:17-alpine
    environment:
      POSTGRES_USER: mcat_test
      POSTGRES_PASSWORD: mcat_test
      POSTGRES_DB: mcat_test
    ports:
      - "55432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U mcat_test -d mcat_test"]
      interval: 2s
      timeout: 2s
      retries: 20
```

- [ ] **Step 5: Define repository ports**

```ts
export interface AuthorityTransaction {
  getOrCreateGuest(sessionHash: string, now: string): Promise<LearnerProjectionRecord>;
  lockLearner(learnerId: string): Promise<LearnerProjectionRecord>;
  findAcceptedByIdempotency(learnerId: string, key: string): Promise<AcceptedCommand | null>;
  appendAccepted(command: AcceptedCommand): Promise<void>;
  saveProjection(record: LearnerProjectionRecord): Promise<void>;
  appendOutbox(record: OutboxRecord): Promise<void>;
}

export interface AuthorityRepository {
  transaction<T>(fn: (tx: AuthorityTransaction) => Promise<T>): Promise<T>;
  loadProjection(learnerId: string): Promise<LearnerProjectionRecord | null>;
}
```

- [ ] **Step 6: Implement advisory-locked migration runner**

Read migration filenames lexically, hash contents, record applied versions, reject checksum drift, and execute each unapplied file in a transaction while holding the advisory lock.

- [ ] **Step 7: Verify GREEN**

Run: `pnpm exec vitest run database && pnpm --filter @mcat/database typecheck`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add database vitest.workspace.ts pnpm-workspace.yaml pnpm-lock.yaml
git commit -m "feat(database): add authoritative event and outbox schema"
```

### Task 2: Implement in-memory repositories and the authority command kernel

**Files:**
- Create: `services/authority-kernel/package.json`
- Create: `services/authority-kernel/tsconfig.json`
- Create: `services/authority-kernel/src/context.ts`
- Create: `services/authority-kernel/src/commands.ts`
- Create: `services/authority-kernel/src/views.ts`
- Create: `services/authority-kernel/src/in-memory-repository.ts`
- Create: `services/authority-kernel/src/kernel.ts`
- Create: `services/authority-kernel/src/kernel.test.ts`
- Create: `services/authority-kernel/src/index.ts`

**Interfaces:**
- Produces: `AuthorityKernel({ repository, clock, bank }): handle(command, principal)`.
- `Principal` is `{ kind: 'guest' | 'linked'; learnerId: string; sessionId: string }` and is never constructed from request JSON.

- [ ] **Step 1: Write failing idempotency and ownership tests**

```ts
it('returns the original result for duplicate idempotency keys', async () => {
  const first = await kernel.handle(attemptCommand, principalA);
  const second = await kernel.handle(attemptCommand, principalA);
  expect(second).toEqual(first);
  expect(repository.eventsFor(principalA.learnerId)).toHaveLength(1);
  expect(repository.outboxFor(principalA.learnerId)).toHaveLength(1);
});

it('cannot read another learner projection', async () => {
  await expect(kernel.snapshot(principalA, principalB.learnerId)).rejects.toMatchObject({
    code: 'forbidden',
  });
});
```

- [ ] **Step 2: Verify RED**

Run: `pnpm exec vitest run services/authority-kernel/src/kernel.test.ts`

Expected: FAIL because the kernel is absent.

- [ ] **Step 3: Implement command transaction flow**

```ts
return repository.transaction(async (tx) => {
  const projection = await tx.lockLearner(principal.learnerId);
  const duplicate = await tx.findAcceptedByIdempotency(principal.learnerId, envelope.idempotencyKey);
  if (duplicate) return duplicate.result;
  if (projection.sequence !== envelope.expectedStreamVersion) throw streamConflict(projection.sequence);
  const result = applyCommand(projection.state, command, bank, clock);
  const sequence = projection.sequence + 1;
  await tx.appendAccepted(toAccepted(command, principal.learnerId, sequence, result, clock));
  await tx.saveProjection(toProjection(projection, result.state, sequence));
  await tx.appendOutbox(toOutbox(principal.learnerId, sequence, result));
  return result.response;
});
```

- [ ] **Step 4: Reuse deterministic domain/policy functions**

Use `@mcat/authority-core` only inside the server kernel to operate on the synthetic fixture. Wrap prototype state as a versioned projection and store accepted command metadata separately. Do not export full state or protected bank objects through wire responses.

- [ ] **Step 5: Verify transaction rollback**

Add an in-memory repository failure injection after `appendAccepted`; assert the event, projection, and outbox all remain unchanged after rejection.

- [ ] **Step 6: Verify GREEN**

Run: `pnpm exec vitest run services/authority-kernel && pnpm --filter @mcat/authority-kernel typecheck`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add services/authority-kernel pnpm-lock.yaml
git commit -m "feat(authority): add transactional command kernel"
```

### Task 3: Implement PostgreSQL repositories

**Files:**
- Create: `database/src/postgres.ts`
- Create: `database/src/postgres-repository.ts`
- Create: `database/src/postgres-repository.integration.test.ts`
- Modify: `database/src/index.ts`
- Modify: `database/package.json`

**Interfaces:**
- Consumes: repository ports from Task 1.
- Produces: `createPgPool(config)`, `PostgresAuthorityRepository`.

- [ ] **Step 1: Write failing integration tests with an ephemeral PostgreSQL URL**

```ts
it.runIf(process.env.TEST_DATABASE_URL)('serializes concurrent learner commands', async () => {
  const results = await Promise.allSettled([
    repository.transaction((tx) => append(tx, commandA)),
    repository.transaction((tx) => append(tx, commandB)),
  ]);
  expect(results.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
  expect(await sequences()).toEqual([1]);
});
```

- [ ] **Step 2: Verify RED**

Run: `docker compose -f database/docker-compose.test.yml up -d --wait && TEST_DATABASE_URL=postgres://mcat_test:mcat_test@127.0.0.1:55432/mcat_test pnpm exec vitest run database/src/postgres-repository.integration.test.ts`

Expected: FAIL because `PostgresAuthorityRepository` does not exist.

- [ ] **Step 3: Implement parameterized PostgreSQL operations**

Use `select ... for update` on `learner_streams`, explicit `begin/commit/rollback`, JSON parameters, and no string-interpolated SQL values. Set `statement_timeout`, `lock_timeout`, `application_name`, TLS validation, and maximum pool size from validated configuration.

- [ ] **Step 4: Implement idempotent guest creation**

Guest session tokens are random 256-bit values. Only a SHA-256 hash is stored. Creation/upsert and learner projection initialization happen in one transaction.

- [ ] **Step 5: Verify GREEN**

Run: `TEST_DATABASE_URL=postgres://mcat_test:mcat_test@127.0.0.1:55432/mcat_test pnpm exec vitest run database && pnpm --filter @mcat/database typecheck && docker compose -f database/docker-compose.test.yml down -v`

Expected: PASS with the duplicate/concurrency/rollback cases green.

- [ ] **Step 6: Commit**

```bash
git add database pnpm-lock.yaml
git commit -m "feat(database): implement PostgreSQL authority repositories"
```

### Task 4: Build Lambda-compatible HTTP handlers

**Files:**
- Create: `services/lambdas/learner-api/package.json`
- Create: `services/lambdas/learner-api/tsconfig.json`
- Create: `services/lambdas/learner-api/src/http.ts`
- Create: `services/lambdas/learner-api/src/session.ts`
- Create: `services/lambdas/learner-api/src/routes.ts`
- Create: `services/lambdas/learner-api/src/handler.ts`
- Create: `services/lambdas/learner-api/src/handler.test.ts`
- Create: `services/lambdas/learner-api/src/index.ts`

**Interfaces:**
- Produces: API Gateway proxy `handler(event, context)`.
- Routes: `GET /v1/health`, `POST /v1/bootstrap`, `PUT /v1/profile/goal`, `GET /v1/plan/today`, `GET /v1/learning/session`, `POST /v1/attempts`, `POST /v1/sync`, and the remaining read/command routes needed by `AuthorityPort`.

- [ ] **Step 1: Write failing handler security tests**

```ts
it('sets a secure guest cookie and no-store on bootstrap', async () => {
  const response = await app.handle(request('POST', '/v1/bootstrap'));
  expect(response.statusCode).toBe(200);
  expect(response.headers['cache-control']).toBe('no-store');
  expect(response.cookies?.[0]).toMatch(/HttpOnly; Secure; SameSite=Lax/);
});

it('rejects a foreign learner identifier supplied in JSON', async () => {
  const response = await app.handle(request('POST', '/v1/sync', { learnerId: learnerB }));
  expect(response.statusCode).toBe(400);
});
```

- [ ] **Step 2: Verify RED**

Run: `pnpm exec vitest run services/lambdas/learner-api/src/handler.test.ts`

Expected: FAIL because the handler is absent.

- [ ] **Step 3: Implement the router and safe response envelope**

Validate method/path/body/cookies/origin, resolve the principal through a dependency-injected session service, call the kernel, validate output, and return only safe structured errors with a request ID.

- [ ] **Step 4: Implement guest-session rotation and CSRF/origin checks**

State-changing cookie routes require an allowed `Origin` and double-submit CSRF token. Session values are never logged.

- [ ] **Step 5: Add structured logging redaction**

Logs include request ID, route, status, latency, principal kind, and a one-way learner hash. They exclude cookies, authorization, bodies, choices, free text, answer material, and full events.

- [ ] **Step 6: Verify GREEN**

Run: `pnpm exec vitest run services/lambdas/learner-api && pnpm --filter @mcat/learner-api typecheck`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add services/lambdas/learner-api pnpm-lock.yaml
git commit -m "feat(api): expose secure v1 learner authority"
```

### Task 5: Build the projection outbox worker

**Files:**
- Create: `services/lambdas/workers/package.json`
- Create: `services/lambdas/workers/tsconfig.json`
- Create: `services/lambdas/workers/src/outbox.ts`
- Create: `services/lambdas/workers/src/projection-handler.ts`
- Create: `services/lambdas/workers/src/projection-handler.test.ts`
- Create: `services/lambdas/workers/src/index.ts`

**Interfaces:**
- Produces: scheduled outbox publisher and SQS FIFO projection consumer.
- Guarantees duplicate-safe consumption by `(consumer, learner_id, sequence)`.

- [ ] **Step 1: Write failing duplicate-delivery tests**

```ts
it('acknowledges a duplicate sequence without reapplying it', async () => {
  await handler(sqsEvent(message));
  await handler(sqsEvent(message));
  expect(repository.appliedSequences('mastery', learnerId)).toEqual([1]);
});
```

- [ ] **Step 2: Verify RED**

Run: `pnpm exec vitest run services/lambdas/workers/src/projection-handler.test.ts`

Expected: FAIL because the worker is absent.

- [ ] **Step 3: Implement bounded outbox publication and inbox deduplication**

Claim unpublished rows with `for update skip locked`, publish per-learner FIFO messages, mark published after successful SQS response, and store consumer sequence before acknowledging projection work.

- [ ] **Step 4: Verify GREEN**

Run: `pnpm exec vitest run services/lambdas/workers && pnpm --filter @mcat/workers typecheck`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add services/lambdas/workers pnpm-lock.yaml
git commit -m "feat(workers): add idempotent projection pipeline"
```

## Phase 4B acceptance

Run:

```bash
pnpm run lint
pnpm run typecheck
pnpm run test
pnpm run scan:protected
```

Expected: all commands exit `0`, including idempotency, rollback, ownership, and protected-response tests.
