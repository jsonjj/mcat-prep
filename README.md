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
pnpm --filter @mcat/landing-web dev   # landing page + Prep Pattern Snapshot
pnpm --filter @mcat/learner-web dev   # learner website
pnpm --filter @mcat/admin-web dev      # admin console
```

The deployed AWS-backed learner website is
<https://d2j72l2zhhn7o7.cloudfront.net>. The development authority intentionally accepts browser
traffic only through that CloudFront origin. The Vite learner command requires a compatible
`VITE_AUTHORITY_BASE_URL`; the repository does not currently ship a standalone local HTTP
authority server.

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

1. `cp .env.example .env` and fill in your connection string (local Postgres, Supabase, or Aurora). **`.env` is gitignored — never commit it.**
2. Run Node entrypoints/tooling with Node's native env-file loader (Node ≥ 20.6; no `dotenv` dependency), e.g. `node --env-file=.env <script>`.

`DATABASE_SSL`: `require` (verify cert, default) · `no-verify` (managed Postgres such as Supabase) · `disable` (local only). The v7 question-bank read seam and the current integration boundary are documented in [`docs/question-storage-plan.md`](docs/question-storage-plan.md).

## Authority boundaries (non-negotiable)

- The server (AWS for deployed development; the in-process `services/local-authority` adapter for tests/tooling) is authoritative for correctness, protected scoring, planning, FSRS, mastery, and synchronization.
- The client is authoritative for presentation, interaction state, local cache, and an offline event queue — never for correctness, answer keys, mastery, or protected scoring.
- Answer keys, rationales, and protected assessment payloads never enter client bundles, prerendered HTML, caches, analytics, or ordinary logs.

See [`docs/governance/authority-boundaries.md`](docs/governance/authority-boundaries.md).

## Copyright guardrail

The reference PDFs in `../research/` are for abstract design analysis only. Their questions, passages, datasets, figures, choices, keys, and explanations must never be copied, paraphrased, transcribed, embedded, or committed. See [`docs/content/question-format-guide.md`](docs/content/question-format-guide.md).
