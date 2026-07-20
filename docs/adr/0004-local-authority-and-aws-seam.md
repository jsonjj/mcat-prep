# ADR 0004: Local authority now, AWS behind the same seam later

- **Status:** Accepted
- **Date:** 2026-07-20

## Context

Production authority is fixed by the PRD: API Gateway + TypeScript Lambda + Aurora Serverless v2 (via RDS Proxy) + private S3 + Cognito + Step Functions + EventBridge, deployed with CDK to isolated `us-east-1` accounts. That infrastructure is **externally gated** — it requires an AWS organization, accounts, credentials, and an explicit operations `GO` that are not available in this environment.

## Decision

- Define the server authority purely in terms of `@mcat/contracts` DTOs and an `AuthorityPort` interface.
- Implement `services/local-authority`: a small Node HTTP server (and an in-process adapter for tests) that fulfills the authority contract — accepting immutable events idempotently, scoring against server-only content, computing projections via `@mcat/policies`, and returning reconciliation summaries. This lets the full browser vertical work locally with no cloud dependency.
- Persist local authority state to an on-disk JSON/SQLite-style store under a git-ignored path; it is a development substitute, not production data.
- The client (`@mcat/client-core`) talks to an `AuthorityPort`; swapping the local server for AWS is an adapter change, not an application change.
- Infrastructure-as-code (`infra/cdk`) is authored and `synth`-checkable but **not deployed** here. Deployment remains a human-gated Phase 4 step.

## Consequences

- The product is demonstrable and testable end-to-end today.
- No secrets, cloud credentials, or protected content leave the workspace.
- The migration to AWS is well-bounded and does not touch learner-facing code.
