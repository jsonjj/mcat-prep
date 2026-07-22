# MCAT Mastery AWS Phase 4 Backend Design

**Status:** Owner-approved for implementation

**Implementation epoch:** 2026-07-22T00:38:34Z

**Baseline commit:** `fea1a53d9a37b846d6f8faf5777ccf8e7323ff69`

**Development environment:** AWS account `056956104102` (`sbsandbox`), `us-east-1`

## Objective

Replace the browser-resident prototype authority with a secure AWS authority while preserving the existing asynchronous `AuthorityPort` seam and deterministic domain/policy behavior. The deployed development environment must support a synthetic learner flow, durable server-side state, idempotent commands, protected-content separation, identity foundations, operational visibility, and safe promotion paths.

Staging and production are defined but must not deploy until separate AWS accounts and deployment roles exist. Development remains synthetic-only.

## Non-negotiable boundaries

- The learner and admin browser bundles never contain production answer keys, rationales, calibration data, or protected content.
- The server derives learner ownership from a verified guest or Cognito principal; a client-supplied learner ID is never authorization.
- Consequential writes append immutable accepted events and an outbox row in one PostgreSQL transaction.
- Replay under the same content and policy versions is deterministic.
- Production content publication remains disabled until human review roles, two-person approval, and reviewed content exist.
- Numeric score prediction, calibrated MD-CAT, live AI/speech, normative Ghost, and production push campaigns remain disabled.
- All resources are private by default, encrypted, tagged, environment-scoped, and deployed in `us-east-1`.
- No native iOS or desktop clients are created.

## Security incident containment

The repository was public at discovery time and tracked two candidate JSONL files containing proposed answer keys and rationales. Before backend code is published:

1. Keep the repository private.
2. Remove the tracked candidate files from the active tree.
3. Expand protected-content scanning to inspect JSONL and reject key/rationale-bearing candidate packages outside explicitly approved server-only content paths.
4. Prevent learner-web from importing server authority, full content packages, or raw candidate files.
5. Record the exposure and prepare an owner-controlled Git history cleanup. History rewriting is separated from ordinary implementation commits because it invalidates coworker clones and requires coordinated force-push handling.

The candidate files are not uploaded into AWS. Development uses only the unmistakably synthetic enzyme fixture.

## Delivery approach

### Wave 1: authoritative synthetic vertical

Wave 1 establishes the smallest production-shaped path that proves the architecture:

- shared Zod HTTP command/view contracts and a platform-neutral HTTP client;
- PostgreSQL schema, migrations, repositories, accepted event stream, idempotency, projections, and outbox;
- Lambda-compatible handler kernel and bounded learner API handlers;
- opaque guest session and learner bootstrap;
- Cognito learner/staff pools and authorizers for linked/staff routes;
- API Gateway REST `/v1` routes;
- Aurora Serverless v2 PostgreSQL through RDS Proxy;
- private versioned S3 buckets and KMS keys for protected content, learner-safe delivery, exports, assets, and analytics;
- SQS FIFO projection processing with DLQ;
- CloudWatch logs, dashboards, alarms, X-Ray sampling, and project budget alarms;
- a deployed health endpoint and one synthetic bootstrap/plan/study/read/progress path;
- learner web configured to use the HTTP adapter in deployed environments while retaining the in-process adapter only for local synthetic tests.

### Wave 2: controlled operations

Wave 2 adds systems whose contracts depend on Wave 1:

- Step Functions content quarantine, validation, dry run, compilation, approval, activation, rollback, and emergency suspension;
- admin content APIs and staff authorization;
- export/deletion job orchestration and deletion ledger;
- allowlisted first-party analytics ingestion to Firehose, S3, Glue, and Athena;
- Web Push subscription storage and disabled delivery infrastructure;
- immutable learner/admin web artifacts delivered through private S3 origins and CloudFront OAC;
- correction/replay and operational runbooks.

QuickSight, Apple/Google federation, live campaigns, research datasets, AI/speech, cross-region disaster recovery, and staging/production deployment remain deferred.

## Repository architecture

New implementation areas:

```text
database/
  migrations/                 ordered SQL migrations
  src/                        typed PostgreSQL repositories and transactions
services/
  authority-kernel/           Lambda-independent commands, views, auth context
  lambdas/
    learner-api/              bootstrap, profile, plan, attempts, recall, progress
    sync-api/                 idempotent ordered sync
    content-admin-api/        staff-only import/publication operations
    workers/                  projections, publication, privacy, analytics, push
infra/cdk/
  bin/                        environment-aware CDK entry point
  config/                     explicit dev/staging/prod account configuration
  lib/                        focused CDK stacks and shared aspects
  test/                       assertions and cdk-nag tests
packages/
  contracts/                  all wire DTOs and event envelopes
  client-core/                platform-neutral HTTP AuthorityPort adapter
  analytics-events/           allowlisted telemetry schemas and filters
generated/
  openapi/                    learner-safe public API contract only
tests/
  integration/               PostgreSQL/API/AWS smoke suites
  security/                  ownership and protected-data negatives
docs/
  adr/                        architecture decisions
  runbooks/                   deploy, rollback, migration, incident operations
```

`packages/authority-core` remains a pure synthetic reference engine during migration. Production Lambda handlers call reusable pure domain and policy functions through repository-backed command handlers rather than persisting the prototype's mutable `LearnerState` blob.

## AWS stack graph

```text
McatDevFoundation
  -> McatDevData
  -> McatDevIdentity
  -> McatDevApi
  -> McatDevAsync
  -> McatDevPublication
  -> McatDevAnalytics
  -> McatDevWeb
  -> McatDevOperations
```

### Foundation

- Environment guard verifies account `056956104102`, region `us-east-1`, and `dev` stage.
- Required tags: `Application=mcat-mastery`, `Environment=dev`, `ManagedBy=cdk`, `Owner=jonathan-thomas`, and a stack-specific `DataClassification`.
- KMS keys use rotation and explicit grants.
- A two-AZ VPC uses public subnets only for managed ingress resources and isolated subnets for data/DB Lambdas. No NAT gateway is created.
- S3 gateway endpoint is present; interface endpoints are added only when a deployed private workload requires them.
- A project budget named `mcat-dev-monthly` uses a USD 100 monthly ceiling and notifies `jonathan.thomas@alphaaiengineering.com` at 50%, 80%, and 100% forecast/actual thresholds.

### Data and content

- Aurora PostgreSQL Serverless v2 uses an explicit supported engine version, encrypted storage, managed secret, deletion protection off only in dev, retained snapshots, and a conservative development capacity range.
- RDS Proxy is required for Lambda connection management. It is isolated and TLS-only.
- Buckets are separately encrypted and policy-isolated: source/quarantine, protected compiled content, authorized delivery, exports, public-safe assets, analytics, and access/audit logs.
- Every bucket blocks public access, enforces TLS, enables versioning where stateful, and has explicit lifecycle/retention rules.
- SQS FIFO is used for per-learner ordered projection work. Separate standard queues and DLQs handle analytics, publication support, privacy jobs, and notifications.

### Identity

- The learner user pool supports email OTP and later Apple/Google federation. Linked identities map to an application-owned `learner_id`.
- Guest sessions use a server-issued opaque, rotating, HttpOnly/Secure/SameSite cookie backed by a hashed session record. A Cognito Identity Pool remains an explicit spike and is not allowed to grant browsers AWS data-plane credentials by default.
- The staff user pool is separate and requires strong MFA/passkey capability before staff publication routes are enabled.
- IAM Identity Center remains the operator access path; applications never receive operator credentials.

### API and authority

- API Gateway REST exposes versioned `/v1` learner, sync, privacy, hook, and admin families.
- Exact-origin CORS, throttling, payload limits, structured errors, no-store responses, and WAF-ready integration are mandatory.
- Cookie-authenticated state-changing routes validate Origin/CSRF controls.
- Handlers validate Zod DTOs at ingress and output, derive ownership from auth context, and never log full request bodies.
- Each accepted command transaction validates expected stream/content/policy versions, locks the learner stream, checks event UUID and idempotency key uniqueness, appends the accepted event, updates necessary ordinary relational state, inserts an outbox row, and commits.
- Duplicate requests return the original accepted result. Conflicting replays return stable reason-coded errors.
- Projection workers are idempotent and record last consumed sequence and projection version.

### Publication and protected delivery

- Uploads enter a quarantine bucket through staff-authorized presigned URLs.
- Standard Step Functions coordinates validation, safe/protected compilation, artifact hashing, review verification, dry-run diff, activation, and rollback.
- Publication cannot activate synthetic/test-only content or content lacking hash-bound human attestations and author/reviewer separation.
- The active release pointer changes atomically in PostgreSQL after immutable artifacts are durable.
- Learner delivery handlers receive only task-scoped grants and cannot decrypt source packages or bulk answer material.
- Protected assessment explanations remain unavailable until server review rules allow reveal.

### Analytics, web, and operations

- Analytics schemas are allowlists. Unknown fields are rejected; free text, answer keys, rationales, tokens, and protected identifiers are impossible in accepted payloads.
- Outbox consumers batch compact events to Firehose and encrypted S3 partitions for Glue/Athena.
- Learner/admin builds are immutable artifacts behind CloudFront OAC. Private routes use SPA fallback and `noindex`; API/auth paths are never cached.
- Structured JSON logs contain correlation/request IDs and pseudonymous identifiers only.
- Alarms cover API errors/latency, Lambda throttles, Aurora capacity/proxy borrow latency, outbox age, sequence gaps, projection lag, queue age/DLQ, publication failure, privacy SLA, CloudFront errors, and budget thresholds.
- Application logs retain 90 days; security/admin audit records retain 400 days.

## Data model baseline

The first migrations create:

- `learners`, `linked_identities`, `guest_sessions`, `consents`, `goals`;
- `learner_streams`, `accepted_events`, `attempt_results`, `checkpoints`;
- `evidence_dispositions`, `mastery_projections`, `plan_projections`, `review_projections`, `error_projections`;
- `content_releases`, `content_objects`, `delivery_grants`, `publication_runs`, `review_attestations`;
- `outbox`, `inbox_deduplication`, `privacy_jobs`, `push_subscriptions`, `audit_log`.

Critical uniqueness constraints cover event UUID, learner/idempotency key, learner/sequence, immutable content version/hash, and one active release per environment. Ownership predicates and repository methods always include the authenticated learner or staff scope.

## Browser integration

- `client-core` exposes the same asynchronous `AuthorityPort` but implements it with typed HTTP requests.
- The client creates event UUIDs and idempotency keys before queueing a consequential command.
- IndexedDB becomes the versioned offline event/checkpoint queue; localStorage remains limited to non-sensitive theme/UI preferences.
- Access tokens stay in memory. Refresh/session credentials use HttpOnly cookies.
- The service worker changes from broad same-origin runtime caching to an explicit static-shell allowlist and network-only handling for `/v1`, `/auth`, authorized delivery, and authenticated responses.
- Production builds cannot import `authority-core`, full `content`, raw question candidates, or protected compiler entry points.

## Error handling

- Every API error uses a stable code, safe message, request ID, retryability flag, and optional reason code. Internal details remain in protected structured logs.
- Optimistic concurrency conflicts return the current authoritative sequence and a reconciliation action.
- Idempotent duplicates return the prior result without another logical effect.
- SQS failures retry with bounded backoff and land in DLQ with an alarm.
- Publication is fail-closed and atomic. Validation or approval failure cannot change the active release.
- Migration failure stops deployment; destructive contract steps are separate, manual, and absent from the development wave.
- Browser states distinguish offline, queued, syncing, reconciled, conflict, stale content, unauthorized, and service unavailable.

## Test strategy

- Unit/property: policy invariants, safe serialization, event ordering, idempotency, projection replay, analytics allowlists.
- Contract: Zod request/response compatibility, OpenAPI generation, structured errors, prior-client fixtures.
- Repository: PostgreSQL uniqueness, transaction rollback, ownership, sequence locking, migration up/down safety where reversible.
- Handler: auth context, BOLA/IDOR negatives, CSRF/origin, payload limits, arbitrary-question oracle prevention.
- Infrastructure: CDK assertions, `cdk-nag`, account/region guards, encryption, public-access blocks, retention, IAM least privilege, no NAT.
- Integration: deployed health/bootstrap/synthetic flow, duplicate/reordered sync, outbox failure injection, projection replay equality, protected delivery/no-store, Cognito/session revocation.
- Browser: deployed learner app uses HTTP authority, refresh preserves state, no key appears in bundles, caches, network logs, or IndexedDB.
- Operations: migration rehearsal, DLQ/redrive, content dry run/rollback, export/deletion, snapshot restore smoke, budget notification path.

## Deployment and rollback

1. Run local verification and CDK synth.
2. Review `cdk diff`; changes to KMS, identity, database replacement, or retained buckets fail closed for manual review.
3. Deploy Foundation, Data, and Identity.
4. Apply expand migrations through a one-shot migration Lambda/custom resource with advisory locking.
5. Deploy API and Async; run synthetic integration/security suites.
6. Deploy Publication, Analytics, Web, and Operations only after Wave 1 passes.
7. Roll back application Lambdas by immutable version/alias. Roll back content by active release pointer. Roll back schema only through compatible forward fixes; retained snapshots protect destructive incidents.

## Definition of working

The development backend is working when:

- AWS caller, account, region, and CDK deployment identity are recorded;
- all stacks synthesize and deployed stacks are healthy;
- a guest can bootstrap through AWS, persist a goal, submit a synthetic attempt, reload, and retrieve authoritative state;
- duplicate command delivery causes one logical effect;
- a second learner cannot access the first learner's data;
- accepted events replay to identical projections;
- answer keys/rationales are absent from learner artifacts, caches, logs, and ordinary API payloads;
- operational alarms and project budget exist;
- deployment and rollback runbooks reproduce the verified commands;
- the repository is private and the active tree contains no exposed candidate bank.
