# Periodic scored Practice TEST — production status & enablement

**Date:** Aug 3, 2026 (reflects code as of current commit)
**Status:** **SHIPPED end to end.** The scored practice-test **runner**, the
**summary**, the **scored-result persistence**, and the **server plan slot** are
all live on the deployed learner-API. The runner is served by the Lambda under
`/v1/practice-test/{next,block}` (start/serve blocks, commit + score), the
dashboard reads `GET /v1/practice-test/summary`, and a completed sitting is
persisted to the learner projection by the CSRF-gated
`POST /v1/practice-test/result` (the server re-derives the score from the durable
session — no score is trusted from the client — and records it idempotently by
sitting id). The learner-API Lambda now sets `PRACTICE_TEST_ENABLED=true`, so
`Authority.buildTodaysPath` reserves a `practice_test` slot on the §6 cadence; the
strict plan cannot deadlock (a slot is reserved only when the cadence is due, the
serve boundary re-checks due-ness, and a completed/skipped activity advances the
in-order pointer).

The runner's deployable core now lives in `@mcat/practice-test-runner` (the
diagnostic runner's fixed-form sibling: bank + engine + completion builder),
reused by both the dev/preview Vite plugin and the deployed Lambda so the browser
wire is identical across environments. The in-flight sitting persists in the
`practice_test_sessions` table (migration 0022, mirroring `diagnostic_sessions`);
the runtime role `mcat_learner_api` is granted `select, insert, update` on it (no
DELETE). The SCORED result rides the event-sourced `state_json.practiceTests`
blob via the standard accepted-events/outbox path, so no grant on the 0016/0017
result tables is needed — they remain the legacy Postgres shape, unused by the app.

If this document and the code disagree, the code wins.

---

## Why it is gated (the architecture, verified)

The scored practice test has **two** server surfaces, and neither reaches the
deployed learner PWA today:

1. **The RUNNER** — `practiceTestClient`
   ([`apps/learner-web/src/app/practice-test-client.ts`](../apps/learner-web/src/app/practice-test-client.ts))
   posts to `/api/practice-test/{next,block,review}`. That surface is served
   **only** by the dev/preview Vite plugin
   ([`server/practice-test-api-plugin.ts`](../apps/learner-web/server/practice-test-api-plugin.ts)
   → [`server/practice-test-api.ts`](../apps/learner-web/server/practice-test-api.ts)),
   which drives the engine in
   [`server/practice-test-engine.ts`](../apps/learner-web/server/practice-test-engine.ts)
   - [`server/practice-test-bank.ts`](../apps/learner-web/server/practice-test-bank.ts)
     over `@mcat/policies` (`assemblePracticeTest` / `scorePracticeTest`).
2. **The SUMMARY** — `GET /v1/practice-test/summary`, read by
   `getPracticeTestSummary` in
   [`packages/client-core/src/http.ts`](../packages/client-core/src/http.ts) and
   implemented by `RepositoryLearnerKernel.practiceTestSummary`
   ([`services/lambdas/learner-api/src/workflow.ts`](../services/lambdas/learner-api/src/workflow.ts)).

**Production routing** ([`infra/cdk/lib/web-stack.ts`](../infra/cdk/lib/web-stack.ts)):
the learner app is a static S3/CloudFront SPA. CloudFront routes **only `v1/*`**
to the learner-API Lambda (injecting `x-mcat-origin-verify`); every other path —
including all of `/api/*` — falls through the SPA rewrite to `index.html`.
Therefore:

- The runner's `/api/practice-test/*` calls have **no backend** in prod (a `POST`
  there hits the S3/SPA default behavior, not the Lambda).
- `GET /v1/practice-test/summary` is **not a deployed route**
  ([`services/lambdas/learner-api/src/routes.ts`](../services/lambdas/learner-api/src/routes.ts)
  has no such entry), so the summary resolves to `null` in prod by design (the
  client swallows the `not_found` into `null`).
- Today's Path itself (`/v1/plan/today/{path,build,activity}`) is **also not
  deployed yet**, so a `practice_test` plan slot cannot even surface in prod
  today — but it will once Today's Path ships, which is why the plan gate below is
  server-authoritative.

Fully wiring the runner into the deployed Lambda could not land green in one pass
because it needs, at minimum: a same-origin route change off `/api/*` **plus**
CloudFront/infra changes; porting the stateful session-store + one-use block-token
engine into a horizontally-scaled Lambda (durable session storage — the in-memory
`DiagnosticSessionStore` + `WeakMap`s do not survive across invocations); a
Postgres-backed practice-test bank with protected key material; and reconciling
the runner's bare-`fetch` (no cookie/CSRF) with the Lambda's session + CSRF +
origin-verify gate. Several of those touch `infra/cdk`, which this change must not.

## What the gate does

- **Server (authoritative, no deadlock).** `Authority.buildTodaysPath` takes a
  `BuildTodaysPathOptions.practiceTestEnabled` flag (default **true**). When
  `false`, the planner reserves **no** `practice_test` activity — identical to
  "not due" / "not unlocked", a path the engine already handles — so the strict
  guided plan can never deadlock on a slot whose runner cannot serve. The flag is
  threaded `lambda.ts` → `handler.ts` → `workflow.ts` → `authority-core`, and the
  **deployed Lambda sets it off** via `PRACTICE_TEST_ENABLED` (default `false`).
  Dev (in-process authority + `services/local-authority`) passes nothing → stays
  enabled.
- **Client (presentation + safety).**
  [`apps/learner-web/src/app/capabilities.ts`](../apps/learner-web/src/app/capabilities.ts)
  exports `PRACTICE_TEST_ENABLED` (default `import.meta.env.DEV`; override with
  `VITE_PRACTICE_TEST_ENABLED`). When off: the Practice-test dashboard card is
  hidden (`PracticeHome`, single-column layout), the `/app/practice/test` route
  redirects to the Practice hub, `usePracticeTestSummary` is disabled (no prod
  404), and `useLaunchPlanActivity` **skips** any `practice_test` slot left in a
  plan built before the gate (advancing the plan rather than launching a dead
  runner).

## What remained to enable it — now DONE

> All six steps below are SHIPPED (see the status header). They are kept as the
> record of what the enablement entailed; the current code is the source of truth.

1. **Give the runner a production backend on `/v1/*`.** Either (a) add
   `/v1/practice-test/{next,block,review}` routes to
   `services/lambdas/learner-api` and repoint `practice-test-client.ts`’s `BASE`
   to `/v1/practice-test` so CloudFront routes it to the Lambda, or (b) add a
   CloudFront `/api/*` behavior to the API origin (**infra**). (a) is preferred
   and matches the deployed same-origin model, but requires the auth reconciliation
   in step 3.
2. **Make the runner stateless / durable.** The dev engine keeps per-sitting state
   in memory (session store + `WeakMap`s for tier/sittingId/answers/result). A
   Lambda is ephemeral and multi-instance, so `/next` and `/block` must share
   durable state — persist the sitting (session token → seed, tier, responses)
   in Postgres/Dynamo, or encode it in a signed, self-describing token.
3. **Reconcile auth.** `/v1` session routes require the session cookie +
   (for writes) CSRF + `x-mcat-origin-verify`. Either serve the practice-test
   routes as `auth: 'public'` with the existing same-origin + one-use-block-token
   model, or make `practiceTestClient` send credentials + CSRF like
   `HttpAuthorityClient`.
4. **Provide the bank in prod.** Build a `PracticeTestBank` from the Postgres
   corpus (protected answer key server-side only), mirroring
   `server/practice-test-bank.ts`.
5. **Route the summary + persist scored results.** Add `GET /v1/practice-test/summary`
   to `routes.ts`/`handler.ts` (kernel method already exists), and a route to
   persist a completed sitting's SCORED result (`recordPracticeTestResult`) so the
   summary is non-empty — the completion hooks that exist today
   (`/v1/hooks/practice-test/{completed,reviewed}`) are counters-only.
6. **Deploy Today's Path** (`/v1/plan/today/{path,build,activity}`) so the
   `practice_test` slot can be scheduled, then flip `PRACTICE_TEST_ENABLED=true`
   (both the Lambda env and the learner-web build) to re-enable end to end.

## Enabling in dev / preview

Dev is on by default. To force the flag either way:

- Client: `VITE_PRACTICE_TEST_ENABLED=true|false` for the learner-web build.
- Server plan slot: `PRACTICE_TEST_ENABLED=true` for the learner-API Lambda.
