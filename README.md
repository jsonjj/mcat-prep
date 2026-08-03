# MCAT Mastery

A personalized, evidence-based MCAT learning platform. Browser-first (responsive website + PWA), built to later convert to downloadable iOS and desktop apps from a shared, headless product core.

> **Status:** Early implementation. Learning policies are provisional (`provisional-v1`) and versioned; several capabilities (calibrated adaptive testing, numeric score prediction, "Exam-Ready" claims, normative comparisons, live AI, speech) are intentionally **feature-gated off** until validated. See [`docs/known-limitations.md`](docs/known-limitations.md).

## What this is

MCAT Mastery organizes study around **15 understandable skill clusters** backed by smaller internal skills. It decides what to study next, teaches missing prerequisites, fades assistance, diagnoses _why_ an answer was wrong before revealing it, schedules spaced recall, and requires **changed, delayed, mixed, passage-level, timed, and protected** evidence before treating a skill as current mastery.

The core learner product is **content-independent**: its learning content flows through versioned,
reviewed content contracts rather than app code. The standalone landing Snapshot currently carries a
fixed 12-item pilot form; its answer keys and scoring remain in the isolated server bundle and never
enter the client.

## Repository layout

```
apps/
  landing-web/     Standalone landing + isolated snapshot scorer; no learner runtime or product connection
  learner-web/     Vite + React Router responsive website / PWA (SPA, ssr disabled)
  admin-web/       Browser-based content administration console (desktop-optimized)
packages/
  contracts/       Zod DTOs, event schemas, structured errors, id/time/version envelopes
  domain/          Pure entities, evidence model, reason codes, state machines, invariants
  policies/        Versioned diagnostic / planner / FSRS / assistance / mastery / readiness policies
  content/         Content schema registry, validation, import/normalization, safe/protected compilation
  client-core/     Platform-neutral API client, sync protocol, storage ports
  learner-core/    Headless learner workflows, view models, checkpoint semantics
  platform-web/    Browser adapters: IndexedDB, session, capabilities, service worker
  design-tokens/   Platform-neutral semantic tokens + light/dark themes
  ui-web/          Accessible semantic DOM component library
  scene-core/      Brain-region model, camera bookmarks, quality tiers, simulation data
  scene-web/       (later) WebGL brain + simulation renderer with 2D/list fallbacks
  analytics-events/ Allowlisted telemetry contracts + privacy filters
  ai-speech-contracts/ Provider ports + deterministic fallbacks (providers off by default)
  test-fixtures/   Unmistakably synthetic fixtures (production publication rejects them)
services/
  local-authority/ In-process authority adapter used by tests and local tooling
content/           Curriculum ledger, controlled vocabularies, schemas, templates, question-bank contract
database/          PostgreSQL schema, migrations, seeds (controlled labels only)
tools/             Content CLI, scanners, verification utilities
docs/              ADRs, governance, threat model, privacy, policy catalog, content contracts
tests/             Architecture, contract, and cross-package suites
```

## Prerequisites

- Node `>= 20.11`
- pnpm `9.15.9` (pinned via `packageManager`)

## Getting started

```bash
pnpm install
pnpm run typecheck
pnpm run test
pnpm run build
pnpm run dev                           # learner website + the real learner API (see below)
pnpm run dev:offline                   # every app, no database, no Supabase, no network
pnpm --filter @mcat/landing-web dev   # landing page + Prep Pattern Snapshot
pnpm --filter @mcat/learner-web dev   # learner website
pnpm --filter @mcat/admin-web dev      # admin console
pnpm run dev:lesson                    # learner website + loopback lesson authority
```

`pnpm dev` needs a Supabase project and a `.env.local`
([runbook](./docs/runbooks/local-real-stack.md)); `pnpm dev:offline` needs nothing. See
[Running it locally](#running-it-locally).

The deployed AWS-backed learner website is
<https://d2j72l2zhhn7o7.cloudfront.net>. The development authority intentionally accepts browser
traffic only through that CloudFront origin. For local Lesson 1 work, `pnpm run dev:lesson` starts
the learner app and a loopback-only, in-memory HTTP authority at `127.0.0.1:8787`; protected
answers remain in the Node process. Local run state survives browser refreshes while the process is
running, but intentionally resets when the local authority restarts.

> **First-time local setup:** `pnpm install`; create both env files —
> `cp .env.example .env.local` (its `DATABASE_URL` is the one value a teammate has to send you) and
> `cp apps/learner-web/.env.example apps/learner-web/.env.local`; then `pnpm db:migrate` and
> `pnpm dev`, and accept the self-signed certificate once at <https://localhost:5173>. For a run
> with no database and no Supabase, follow the offline note in `apps/learner-web/.env.example` and
> use `pnpm dev:offline`. The learner-web template sets `VITE_AUTHORITY_BASE_URL=/`, which routes
> API calls through a **dev-only Vite proxy** (see `apps/learner-web/vite.config.ts`) that forwards
> `/v1` to the authority server-side — so the browser stays same-origin and local dev is **not**
> blocked by CORS. Both `.env.local` files are gitignored; never commit them. (Production builds set
> an absolute `VITE_AUTHORITY_BASE_URL`; the dev-only relative behavior is compiled out of a
> production build.)

## Accounts and sign-in

An account is required. `/` is a public homepage and `/signin`, `/signup`, `/check-email`,
`/forgot-password`, and `/auth/callback` are the only other routes a signed-out visitor can reach;
everything else sits behind a route guard, and the authority refuses learner routes without a
linked session.

**Supabase Auth is the credential store only.** It never sees learner data — that stays in Aurora.
The browser authenticates against Supabase directly (email/password or Google) and posts the
resulting access token to `POST /v1/auth/session`, which verifies it and issues the same opaque
`__Host-mcat_session` cookie the app has always used. The Supabase token is used once and dropped;
what persists in the browser is an `HttpOnly` cookie that script cannot read.

Verification is **offline**. The Lambda's subnets have no egress, so it cannot fetch Supabase's
JWKS at runtime; the public signing keys are pinned into a Secrets Manager value at deploy time and
checked locally (ES256, `iss`/`aud`/`exp` enforced, HS256 refused). That means **a Supabase key
rotation needs `pnpm supabase:sync-jwks <project-ref>`**, not just a redeploy. Supabase rotates in
stages and previously-used keys keep verifying existing tokens, so there is a wide window — but it
is a manual step. An unsynced deployment fails closed: nobody can sign in, and every other route
keeps working.

`POST /v1/bootstrap` returns `{ authenticated: false }` for a signed-out visitor — it does not
create a learner — plus a CSRF token good only for `/v1/auth/session`.

### Running it locally

`pnpm dev` runs the **real stack**: the deployed learner API (`services/local-learner-api`, the same
`createRepositoryLearnerApi` the Lambda composes) on `127.0.0.1:8790` against a real Supabase
Postgres, with Vite proxying `/v1` to it and serving the app over **HTTPS** at
`https://localhost:5173`. Sign-in is real and progress survives a restart. Nothing is relaxed for
local use — TLS is what lets the API keep its HTTPS-only origin check and `__Host-`/`Secure`
cookies, and the proxy supplies the `x-mcat-origin-verify` header CloudFront adds in production. It
needs a Supabase project, a `.env.local`, and one `pnpm db:migrate`:
[docs/runbooks/local-real-stack.md](./docs/runbooks/local-real-stack.md). The database holds auth
and learner state only — questions come from the local corpus pull, so answer keys stay off the
hosted project.

`pnpm dev:offline` needs none of that. It serves `/v1` in-process with in-memory storage and an
**in-memory dev stand-in** for auth, so the app runs fully offline. Instead of sending mail, sign-up
and password reset put their "email link" in a per-address dev mailbox: the _Check your email_
screen offers it as a clickable link, and it is printed to the dev server terminal too. The Google
button is hidden because it cannot work. The stand-in still refuses unknown addresses, wrong
passwords, and unconfirmed accounts, so the signed-out path is worth walking. Offline dev also
starts **signed in** so lesson authoring needs no login; set `MCAT_DEV_REQUIRE_AUTH=1` to start
signed out and drive the real entry path.

The landing Snapshot keeps answer keys in its server bundle. For a production-like run, use
`pnpm --filter @mcat/landing-web build` followed by
`pnpm --filter @mcat/landing-web start`; serving `apps/landing-web/dist` alone will not provide
scoring or beta-update capture. Optional beta-update emails are appended to
`BETA_LEAD_STORE_PATH` (default: `.data/beta-leads.jsonl`) with explicit consent and no Snapshot
answers or client identifier. A real deployment must point that variable at a private persistent
volume with restricted access, retention, deletion, and backup controls; a stateless filesystem
will lose leads. The JSONL lead sink and one-use Snapshot attempt store are suitable only for a
single-process pilot. A public, multi-instance deployment must replace them with a transactional
lead service and a shared durable rate-limit/attempt store.

## Database (local)

The data layer reads its Postgres connection from the environment (`DATABASE_URL`, `DATABASE_SSL`) via `@mcat/persistence-postgres` `createDatabasePoolFromEnv` — nothing is hardcoded. To configure it locally:

1. `cp .env.example .env.local` and fill in your connection string (local Postgres, Supabase, or Aurora). **`.env.local` is gitignored — never commit it.**
2. `pnpm dev` and `pnpm db:migrate` read repo-root `.env.local` themselves (`services/local-learner-api/src/env-file.ts`). Other Node tooling does not, so point Node's native env-file loader at the same file (Node ≥ 20.6; no `dotenv` dependency), e.g. `node --env-file=.env.local <script>`.

`DATABASE_SSL`: `require` (verify cert, default) · `no-verify` (managed Postgres such as Supabase) · `disable` (local only).

**Full guide:** [`docs/database.md`](docs/database.md) — how to **add / edit / read** questions, the `questions` vs `question_protected` tables, the `@mcat/persistence-postgres` read seam, migrations, and a commands cheat-sheet. See also [`docs/question-storage-plan.md`](docs/question-storage-plan.md) (design + integration boundary).

## Deployment

Two paths deploy the AWS development backend:

- **Automated (CI/CD):** `.github/workflows/deploy.yml` runs on `workflow_dispatch`
  and push to `main`. It reuses the verify-only `AWS backend CI` as a required gate,
  waits for a GitHub Environment (`aws-dev`) approval, authenticates with **GitHub
  OIDC** (no long-lived AWS keys), then builds the SPA, migrates, seeds
  (`pnpm content:seed`), `cdk deploy`s the API + web stacks, and publishes the SPA to
  S3 + invalidates CloudFront. The OIDC deploy role lives in
  `infra/cdk/lib/github-deploy-stack.ts` (its own entrypoint `bin/github-deploy.ts`,
  separate from the reviewed nine-stack app).
  - **You must provide** repository/environment **variables** `AWS_DEPLOY_ROLE_ARN`,
    `AWS_ACCOUNT_ID`, `AWS_REGION`, `VITE_AUTHORITY_BASE_URL`, `MCAT_QUESTION_CORPUS_DIR`
    (and optional `DATABASE_SSL`); the **secret** `DATABASE_URL`; an `aws-dev`
    environment with required reviewers; and a one-time bootstrap
    (`cdk bootstrap`, create the OIDC provider + deploy role, provision the DB).
  - **Full setup:** [`docs/runbooks/github-actions-deploy.md`](docs/runbooks/github-actions-deploy.md).
- **Manual (fail-closed, human-reviewed):** the wave-based, attested path in
  [`docs/runbooks/aws-dev-deploy.md`](docs/runbooks/aws-dev-deploy.md). Use it for
  first-provisioning and stateful/high-risk changes.

## Authority boundaries (non-negotiable)

- The server (AWS for deployed development; the in-process `services/local-authority` adapter for tests/tooling) is authoritative for correctness, protected scoring, planning, FSRS, mastery, and synchronization.
- The client is authoritative for presentation, interaction state, local cache, and an offline event queue — never for correctness, answer keys, mastery, or protected scoring.
- Answer keys, rationales, and protected assessment payloads never enter client bundles, prerendered HTML, caches, analytics, or ordinary logs.

See [`docs/governance/authority-boundaries.md`](docs/governance/authority-boundaries.md).

## Copyright guardrail

The reference PDFs in `../research/` are for abstract design analysis only. Their questions, passages, datasets, figures, choices, keys, and explanations must never be copied, paraphrased, transcribed, embedded, or committed. See [`docs/content/question-format-guide.md`](docs/content/question-format-guide.md).
