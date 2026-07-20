# MCAT Mastery

A personalized, evidence-based MCAT learning platform. Browser-first (responsive website + PWA), built to later convert to downloadable iOS and desktop apps from a shared, headless product core.

> **Status:** Early implementation. Learning policies are provisional (`provisional-v1`) and versioned; several capabilities (calibrated adaptive testing, numeric score prediction, "Exam-Ready" claims, normative comparisons, live AI, speech) are intentionally **feature-gated off** until validated. See [`docs/known-limitations.md`](docs/known-limitations.md).

## What this is

MCAT Mastery organizes study around **15 understandable skill clusters** backed by smaller internal skills. It decides what to study next, teaches missing prerequisites, fades assistance, diagnoses *why* an answer was wrong before revealing it, schedules spaced recall, and requires **changed, delayed, mixed, passage-level, timed, and protected** evidence before treating a skill as current mastery.

The product is **content-independent**: no learner question, passage, choice, explanation, or answer key is hard-coded. All learning content flows through versioned, reviewed content contracts.

## Repository layout

```
apps/
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
  local-authority/ Local dev server implementing the API authority (stands in for AWS Lambdas)
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
pnpm --filter @mcat/learner-web dev   # learner website
pnpm --filter @mcat/admin-web dev      # admin console
```

## Authority boundaries (non-negotiable)

- The server (AWS in production; `services/local-authority` in local dev) is authoritative for correctness, protected scoring, planning, FSRS, mastery, and synchronization.
- The client is authoritative for presentation, interaction state, local cache, and an offline event queue — never for correctness, answer keys, mastery, or protected scoring.
- Answer keys, rationales, and protected assessment payloads never enter client bundles, prerendered HTML, caches, analytics, or ordinary logs.

See [`docs/governance/authority-boundaries.md`](docs/governance/authority-boundaries.md).

## Copyright guardrail

The reference PDFs in `../research/` are for abstract design analysis only. Their questions, passages, datasets, figures, choices, keys, and explanations must never be copied, paraphrased, transcribed, embedded, or committed. See [`docs/content/question-format-guide.md`](docs/content/question-format-guide.md).
