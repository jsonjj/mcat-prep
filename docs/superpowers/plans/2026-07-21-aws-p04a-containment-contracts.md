# AWS Phase 4A Containment and Contracts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the exposed candidate bank, make protected-data leaks mechanically impossible in browser artifacts, and freeze typed HTTP contracts before backend consumers are built.

**Architecture:** Browser packages depend only on Zod wire contracts and an asynchronous HTTP client. The synthetic in-process authority moves out of browser dependency graphs. Security scanners fail closed on answer-bearing JSONL and learner build artifacts.

**Tech Stack:** TypeScript 5.7.3, Zod 3.24.1, Vitest 2.1.8, Vite 6, React Query, Node 22+.

## Global Constraints

- Repository visibility stays private.
- Raw candidate JSONL files and reference-derived content are never uploaded to AWS or included in learner/admin artifacts.
- Production browser builds cannot import `@mcat/authority-core`, full `@mcat/content`, or raw candidate files.
- All new behavior follows red-green-refactor TDD.
- Baseline commit is `fea1a53d9a37b846d6f8faf5777ccf8e7323ff69`; implementation branch is `codex/integration-p04-aws`.

---

### Task 1: Contain answer-bearing repository artifacts

**Files:**
- Create: `tools/scanners/protected-field-scan.test.ts`
- Modify: `tools/scanners/protected-field-scan.mjs`
- Modify: `.gitignore`
- Delete: `question-bank/cars-passed-candidates.jsonl`
- Delete: `question-bank/other-passed-candidates.jsonl`
- Create: `docs/security/incidents/2026-07-21-public-candidate-content.md`

**Interfaces:**
- Produces: `scanTrackedFiles(files: string[], readText: (file: string) => string): string[]`
- Produces: a CLI exit code of `1` whenever a tracked JSONL contains `proposed_key`, `correct_choice_id`, `option_rationales`, or protected rationale fields outside an explicit server-only fixture allowlist.

- [ ] **Step 1: Write failing scanner tests**

```ts
import { describe, expect, it } from 'vitest';
import { scanTrackedFiles } from './protected-field-scan.mjs';

describe('protected content scanner', () => {
  it('rejects answer-bearing candidate JSONL', () => {
    const problems = scanTrackedFiles(['question-bank/candidate.jsonl'], () =>
      JSON.stringify({ proposed_key: 'A', option_rationales: { A: 'answer' } }),
    );
    expect(problems).toEqual(
      expect.arrayContaining([expect.stringContaining('question-bank/candidate.jsonl')]),
    );
  });

  it('allows learner-safe JSONL without protected fields', () => {
    expect(
      scanTrackedFiles(['generated/public/items.jsonl'], () => JSON.stringify({ stem: 'synthetic' })),
    ).toEqual([]);
  });
});
```

- [ ] **Step 2: Verify the test fails for the missing export**

Run: `pnpm exec vitest run tools/scanners/protected-field-scan.test.ts`

Expected: FAIL because `scanTrackedFiles` is not exported.

- [ ] **Step 3: Extract the pure scanner and add JSONL/field rules**

```js
export const PROTECTED_FIELD_PATTERN =
  /"(?:proposed_key|correct_choice_id|option_rationales|rationale_correct|rationales)"\s*:/;

export function scanTrackedFiles(files, readText) {
  const problems = [];
  for (const file of files) {
    if (/\.pdf$/i.test(file) || /(^|\/)research-derivatives\//i.test(file)) {
      problems.push(`Forbidden tracked file: ${file}`);
      continue;
    }
    if (/\.(?:json|jsonl|ts|tsx|js|mjs|md|html)$/i.test(file)) {
      const content = readText(file);
      if (PROTECTED_FIELD_PATTERN.test(content) && /^(?:question-bank|apps\/learner-web|generated\/public)\//.test(file)) {
        problems.push(`Protected fields found in forbidden path: ${file}`);
      }
    }
  }
  return problems;
}
```

- [ ] **Step 4: Delete active-tree candidate files and ignore the candidate drop directory**

Use `apply_patch` to delete both tracked JSONL files and add `/question-bank/*.jsonl` to `.gitignore`.

- [ ] **Step 5: Record the incident without copying protected content**

The incident record contains repository visibility timeline, affected paths, containment actions, scanner gap, history-cleanup requirement, and an explicit statement that no source wording or answer material is reproduced.

- [ ] **Step 6: Verify scanner and repository state**

Run: `pnpm exec vitest run tools/scanners/protected-field-scan.test.ts && pnpm run scan:protected && git ls-files 'question-bank/*.jsonl'`

Expected: tests PASS, scanner reports OK, and `git ls-files` prints nothing.

- [ ] **Step 7: Commit**

```bash
git add .gitignore tools/scanners docs/security/incidents question-bank
git commit -m "security: contain answer-bearing candidate artifacts"
```

### Task 2: Freeze learner-safe HTTP contracts

**Files:**
- Create: `packages/contracts/src/learner-views.ts`
- Create: `packages/contracts/src/commands.ts`
- Create: `packages/contracts/src/http.ts`
- Create: `packages/contracts/src/http.test.ts`
- Modify: `packages/contracts/src/index.ts`
- Modify: `packages/contracts/src/api.ts`

**Interfaces:**
- Produces: `CommandEnvelopeSchema`, `GuestBootstrapResponseSchema`, `GoalCommandSchema`, `AttemptCommandSchema`, `LearnerSnapshotSchema`, `HttpApiErrorSchema`.
- `CommandEnvelope` contains `eventId`, `idempotencyKey`, `occurredAt`, `expectedStreamVersion`, `contentRelease`, and `taskInstanceId`.

- [ ] **Step 1: Write failing contract tests**

```ts
it('requires client-generated idempotency and event identity', () => {
  const parsed = CommandEnvelopeSchema.safeParse({
    eventId: crypto.randomUUID(),
    occurredAt: '2026-07-22T00:00:00.000Z',
  });
  expect(parsed.success).toBe(false);
});

it('never accepts learner ownership in a command envelope', () => {
  expect(CommandEnvelopeSchema.keyof().options).not.toContain('learnerId');
});
```

- [ ] **Step 2: Verify RED**

Run: `pnpm exec vitest run packages/contracts/src/http.test.ts`

Expected: FAIL because the new schemas do not exist.

- [ ] **Step 3: Implement the command envelope**

```ts
export const CommandEnvelopeSchema = z.object({
  eventId: EventIdSchema,
  idempotencyKey: IdempotencyKeySchema,
  occurredAt: UtcTimestampSchema,
  expectedStreamVersion: z.number().int().nonnegative(),
  contentRelease: z.string().min(1),
  taskInstanceId: TaskInstanceIdSchema,
}).strict();
```

- [ ] **Step 4: Define learner-safe question and view schemas in contracts**

Move wire-visible question, stimulus, Today, study-step, mastery, error-log, skill, wrapped, and practice result shapes into `learner-views.ts`. Every schema is `.strict()` and omits answer keys except the explicitly authorized post-reveal response.

- [ ] **Step 5: Define endpoint schemas**

```ts
export const HTTP_API = {
  bootstrap: { method: 'POST', path: '/v1/bootstrap', response: GuestBootstrapResponseSchema },
  goal: { method: 'PUT', path: '/v1/profile/goal', body: GoalCommandSchema },
  today: { method: 'GET', path: '/v1/plan/today', response: TodayViewSchema },
  session: { method: 'GET', path: '/v1/learning/session', response: StudyStepViewSchema },
  attempt: { method: 'POST', path: '/v1/attempts', body: AttemptCommandSchema },
  sync: { method: 'POST', path: '/v1/sync', body: SyncSubmitRequestSchema },
} as const;
```

- [ ] **Step 6: Verify GREEN and compatibility**

Run: `pnpm exec vitest run packages/contracts/src/contracts.test.ts packages/contracts/src/http.test.ts && pnpm --filter @mcat/contracts typecheck`

Expected: PASS with zero failures.

- [ ] **Step 7: Commit**

```bash
git add packages/contracts
git commit -m "feat(contracts): freeze AWS v1 learner API"
```

### Task 3: Build the platform-neutral HTTP authority client

**Files:**
- Create: `packages/client-core/src/http.ts`
- Create: `packages/client-core/src/http.test.ts`
- Modify: `packages/client-core/src/port.ts`
- Modify: `packages/client-core/src/index.ts`
- Modify: `packages/client-core/package.json`
- Move: `packages/client-core/src/in-process.ts` to `services/local-authority/src/in-process.ts`
- Move: `packages/client-core/src/client.test.ts` to `services/local-authority/src/in-process.test.ts`

**Interfaces:**
- Produces: `HttpAuthorityClient({ baseUrl, fetch, session })` implementing `AuthorityPort`.
- Produces: `SessionPort` with memory-only access token and CSRF token accessors.
- Removes runtime dependencies from `client-core` to `authority-core`, `domain`, and full `content`.

- [ ] **Step 1: Write failing HTTP client tests**

```ts
it('sends credentials and validates the response contract', async () => {
  const calls: RequestInit[] = [];
  const client = new HttpAuthorityClient({
    baseUrl: 'https://api.example.test',
    fetch: async (_url, init) => {
      calls.push(init ?? {});
      return Response.json(validBootstrap);
    },
  });
  await client.bootstrap();
  expect(calls[0]?.credentials).toBe('include');
});

it('maps structured API errors without exposing response bodies', async () => {
  const client = new HttpAuthorityClient({
    baseUrl: 'https://api.example.test',
    fetch: async () => Response.json(validApiError, { status: 409 }),
  });
  await expect(client.bootstrap()).rejects.toMatchObject({ code: 'stream_conflict' });
});
```

- [ ] **Step 2: Verify RED**

Run: `pnpm exec vitest run packages/client-core/src/http.test.ts`

Expected: FAIL because `HttpAuthorityClient` does not exist.

- [ ] **Step 3: Implement validated fetch**

```ts
async function request<T>(path: string, schema: z.ZodType<T>, init?: RequestInit): Promise<T> {
  const response = await fetchImpl(`${baseUrl}${path}`, {
    ...init,
    credentials: 'include',
    headers: { 'content-type': 'application/json', ...init?.headers },
  });
  const json: unknown = await response.json();
  if (!response.ok) throw ApiClientError.from(HttpApiErrorSchema.parse(json));
  return schema.parse(json);
}
```

- [ ] **Step 4: Move the synthetic adapter out of browser client-core**

Create `services/local-authority/package.json` depending on `authority-core`, `content`, `contracts`, and `client-core`; client-core keeps only `@mcat/contracts` and Zod-compatible types.

- [ ] **Step 5: Add architecture tests**

Assert that `apps/learner-web` and `packages/client-core` do not depend on `@mcat/authority-core` or full `@mcat/content`, and that browser source cannot import server-only packages.

- [ ] **Step 6: Verify GREEN**

Run: `pnpm exec vitest run packages/client-core tests/architecture services/local-authority && pnpm --filter @mcat/client-core typecheck`

Expected: PASS and client-core dependency inspection contains only `@mcat/contracts`.

- [ ] **Step 7: Commit**

```bash
git add packages/client-core services/local-authority tests/architecture pnpm-workspace.yaml pnpm-lock.yaml
git commit -m "feat(client): add validated HTTP authority adapter"
```

### Task 4: Make browser caching and authority selection safe

**Files:**
- Modify: `apps/learner-web/src/app/authority.ts`
- Modify: `apps/learner-web/package.json`
- Modify: `apps/learner-web/.env.example`
- Modify: `apps/learner-web/public/sw.js`
- Delete: `apps/learner-web/src/screens/QuestionPreview.tsx`
- Modify: `apps/learner-web/src/app/router.tsx`
- Modify: `apps/learner-web/src/screens/Profile.tsx`
- Create: `tests/architecture/browser-boundaries.test.ts`

**Interfaces:**
- Consumes: `HttpAuthorityClient` and `VITE_AUTHORITY_BASE_URL`.
- Produces: a service worker static-shell allowlist; all `/v1`, `/auth`, and authenticated responses are network-only.

- [ ] **Step 1: Write failing browser-boundary tests**

```ts
it('learner-web has no server-authority dependency', () => {
  const dependencies = Object.keys(deps('apps/learner-web'));
  expect(dependencies).not.toContain('@mcat/authority-core');
  expect(dependencies).not.toContain('@mcat/content');
});

it('service worker never caches API or auth routes', () => {
  const source = readFileSync('apps/learner-web/public/sw.js', 'utf8');
  expect(source).toContain("url.pathname.startsWith('/v1')");
  expect(source).toContain("url.pathname.startsWith('/auth')");
  expect(source).toContain('return fetch(req)');
});
```

- [ ] **Step 2: Verify RED**

Run: `pnpm exec vitest run tests/architecture/browser-boundaries.test.ts`

Expected: FAIL because learner-web still depends on server packages and exposes preview.

- [ ] **Step 3: Wire HTTP authority**

```ts
const baseUrl = import.meta.env.VITE_AUTHORITY_BASE_URL;
if (!baseUrl) throw new Error('VITE_AUTHORITY_BASE_URL is required');
export const authority: AuthorityPort = new HttpAuthorityClient({ baseUrl });
```

- [ ] **Step 4: Replace broad runtime caching**

Only hashed static assets, the manifest, and the offline shell are cacheable. `/v1`, `/auth`, cookies, and responses with `Cache-Control: no-store` bypass Cache Storage.

- [ ] **Step 5: Remove the dev question-preview route and UI link**

Protected content review moves to the separately authenticated admin service in Phase 4C.

- [ ] **Step 6: Verify GREEN and learner build scan**

Run: `pnpm exec vitest run tests/architecture && pnpm --filter @mcat/learner-web build && pnpm run scan:protected`

Expected: PASS; `rg -n "correct_choice_id|option_rationales|@mcat/authority-core" apps/learner-web/dist` returns no matches.

- [ ] **Step 7: Commit**

```bash
git add apps/learner-web tests/architecture pnpm-lock.yaml
git commit -m "security(web): enforce HTTP-only authority boundary"
```

## Phase 4A acceptance

Run:

```bash
pnpm run lint
pnpm run typecheck
pnpm run test
pnpm run build
pnpm run scan:protected
git ls-files 'question-bank/*.jsonl'
```

Expected: all commands exit `0`; final command prints nothing.
