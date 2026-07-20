# ADR 0003: Selective event sourcing, relational projections, server authority

- **Status:** Accepted
- **Date:** 2026-07-20

## Decision

- **Immutable events** for consequential learner actions (attempts, ratings, reveals, plan changes). Each event carries: server sequence, client event UUID, idempotency key, `learner_id`, content release, task instance, policy/model versions, and UTC timestamps.
- **Ordinary relational state** for profiles, consent, goals, content metadata, entitlements, and configuration — not everything is event-sourced.
- **Derived projections** (FSRS state, error patterns, mastery, plans, progress, readiness) are recomputed from accepted events + versioned policy. Each projection stores the last consumed event sequence and its projection version, and can be rebuilt into shadow tables then atomically promoted.
- **Corrections never rewrite attempts.** A content correction appends an evidence *disposition/reclassification* and triggers replay of affected projections.
- **Authority:** the server owns correctness, protected scoring, planning, FSRS, mastery, and sync reconciliation. The client owns presentation, local cache, and an offline queue only.
- **Determinism:** replaying the same accepted events under the same policy versions must reproduce identical derived state (property-tested).

## Local development

`services/local-authority` implements the same contracts in-process/over HTTP so the browser vertical runs end-to-end without AWS. Production swaps the adapter for API Gateway + Lambda + Aurora without changing client contracts. See ADR 0004.
