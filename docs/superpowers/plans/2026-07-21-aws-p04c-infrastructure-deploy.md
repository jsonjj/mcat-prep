# AWS Phase 4C Infrastructure and Development Deployment Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Define the complete production-shaped AWS topology in CDK, deploy the development environment to `sbsandbox`, connect the learner application, and prove the authority path with deployed tests and runbooks.

**Architecture:** Focused CDK stacks compose through explicit interfaces and deploy in dependency order. Development uses account `056956104102`, region `us-east-1`, unique `mcat-dev-*` names, no NAT, encrypted private data, Aurora Serverless v2/RDS Proxy, Cognito, API Gateway/Lambda, SQS/outbox, Step Functions, CloudFront, analytics foundations, and operations controls.

**Tech Stack:** AWS CDK CLI 2.1132.0, `aws-cdk-lib` 2.261.0, Constructs 10.7.1, `cdk-nag` 3.0.1, esbuild 0.28.1, Lambda Node.js 22, pnpm 9.15.9.

## Global Constraints

- Deploy only `dev` to account `056956104102` in `us-east-1` through profile `sbsandbox`.
- Staging and production configs are fail-closed and undeployable without distinct account IDs.
- No NAT gateway, public database, public S3 bucket, static AWS key, or browser AWS credential.
- Every resource carries `Application`, `Environment`, `ManagedBy`, `Owner`, and `DataClassification` tags.
- `mcat-dev-monthly` budget is USD 100 with notifications at 50%, 80%, and 100% to `jonathan.thomas@alphaaiengineering.com`.
- QuickSight, live AI/speech, federation, live Web Push campaigns, research datasets, and cross-region DR are not deployed.

---

### Task 1: Scaffold the CDK application with environment guards

**Files:**
- Create: `infra/cdk/package.json`
- Create: `infra/cdk/tsconfig.json`
- Create: `infra/cdk/cdk.json`
- Create: `infra/cdk/bin/mcat.ts`
- Create: `infra/cdk/config/environments.ts`
- Create: `infra/cdk/lib/tags.ts`
- Create: `infra/cdk/test/environment.test.ts`
- Modify: `docs/adr/0002-toolchain-and-monorepo.md`
- Modify: `docs/tooling/skills.lock.md`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Produces: `getEnvironment(stage): EnvironmentConfig`.
- Produces: `applyRequiredTags(scope, classification)`.
- Dev config is exact; staging/production throw `EnvironmentNotProvisionedError` before synthesis.

- [ ] **Step 1: Read/install the official AWS CDK skill and record its resolved source metadata**

Install `aws-cdk` from `https://github.com/aws/agent-toolkit-for-aws`, record resolved commit/checksum/license/security review in `docs/tooling/skills.lock.md`, then read its complete `SKILL.md` and relevant CDK references before editing infrastructure.

- [ ] **Step 2: Write failing environment-guard tests**

```ts
it('pins the development account and region', () => {
  expect(getEnvironment('dev')).toMatchObject({
    account: '056956104102',
    region: 'us-east-1',
    deployable: true,
  });
});

it.each(['staging', 'production'] as const)('fails closed for %s', (stage) => {
  expect(() => getEnvironment(stage)).toThrow('not provisioned');
});
```

- [ ] **Step 3: Verify RED**

Run: `pnpm exec vitest run infra/cdk/test/environment.test.ts`

Expected: FAIL because the environment module is absent.

- [ ] **Step 4: Scaffold pinned CDK packages**

```json
{
  "name": "@mcat/infra-cdk",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "tsc --noEmit",
    "typecheck": "tsc --noEmit",
    "synth": "cdk synth --all",
    "diff:dev": "cdk diff --all --profile sbsandbox",
    "deploy:dev": "cdk deploy --all --profile sbsandbox --require-approval never"
  },
  "dependencies": {
    "aws-cdk-lib": "2.261.0",
    "constructs": "10.7.1"
  },
  "devDependencies": {
    "aws-cdk": "2.1132.0",
    "cdk-nag": "3.0.1",
    "esbuild": "0.28.1",
    "typescript": "5.7.3",
    "vitest": "2.1.8"
  }
}
```

- [ ] **Step 5: Implement exact configuration and tags**

```ts
const DEV = {
  stage: 'dev', account: '056956104102', region: 'us-east-1', deployable: true,
  budgetUsd: 100, budgetEmail: 'jonathan.thomas@alphaaiengineering.com',
} as const;
```

The CDK entry point compares `CDK_DEFAULT_ACCOUNT`/`CDK_DEFAULT_REGION` to this config and stops on mismatch.

- [ ] **Step 6: Verify GREEN and empty synthesis**

Run: `pnpm exec vitest run infra/cdk/test/environment.test.ts && pnpm --filter @mcat/infra-cdk typecheck`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add infra/cdk docs/adr/0002-toolchain-and-monorepo.md docs/tooling/skills.lock.md package.json pnpm-lock.yaml
git commit -m "chore(cdk): scaffold guarded development environment"
```

### Task 2: Implement Foundation and Data stacks

**Files:**
- Create: `infra/cdk/lib/foundation-stack.ts`
- Create: `infra/cdk/lib/data-stack.ts`
- Create: `infra/cdk/lib/interfaces.ts`
- Create: `infra/cdk/test/foundation-stack.test.ts`
- Create: `infra/cdk/test/data-stack.test.ts`
- Modify: `infra/cdk/bin/mcat.ts`

**Interfaces:**
- Produces: `FoundationResources { vpc, appKey, auditKey, budgetName }`.
- Produces: `DataResources { cluster, proxy, dbSecret, buckets, projectionQueue, projectionDlq }`.

- [ ] **Step 1: Write failing CDK assertion tests**

```ts
template.resourceCountIs('AWS::EC2::NatGateway', 0);
template.hasResourceProperties('AWS::S3::Bucket', {
  PublicAccessBlockConfiguration: {
    BlockPublicAcls: true,
    BlockPublicPolicy: true,
    IgnorePublicAcls: true,
    RestrictPublicBuckets: true,
  },
});
template.hasResourceProperties('AWS::RDS::DBCluster', {
  Engine: 'aurora-postgresql',
  StorageEncrypted: true,
  ServerlessV2ScalingConfiguration: { MinCapacity: 0.5, MaxCapacity: 2 },
});
template.resourceCountIs('AWS::RDS::DBProxy', 1);
```

- [ ] **Step 2: Verify RED**

Run: `pnpm exec vitest run infra/cdk/test/foundation-stack.test.ts infra/cdk/test/data-stack.test.ts`

Expected: FAIL because the stacks do not exist.

- [ ] **Step 3: Implement Foundation**

Create a two-AZ VPC with isolated and public subnets, zero NAT, S3 gateway endpoint, rotating KMS application/audit keys, a USD 100 budget with 50/80/100 notifications, and required tags/aspects.

- [ ] **Step 4: Implement Data**

Create Aurora PostgreSQL Serverless v2 pinned to engine `17.9`, 0.5–2 ACU dev scaling, encrypted credentials in Secrets Manager, RDS Proxy with TLS required, isolated security groups, seven policy-separated private buckets, FIFO projection queue/DLQ, standard async queues/DLQs, retention/removal policies, and lifecycle rules.

- [ ] **Step 5: Add cdk-nag and explicit suppressions**

Apply `AwsSolutionsChecks`. Every suppression includes a resource-specific reason and applies only to development controls intentionally deferred by the approved design.

- [ ] **Step 6: Verify GREEN**

Run: `pnpm exec vitest run infra/cdk/test/foundation-stack.test.ts infra/cdk/test/data-stack.test.ts && pnpm --filter @mcat/infra-cdk synth`

Expected: PASS; synthesis contains no NAT or public bucket/database.

- [ ] **Step 7: Commit**

```bash
git add infra/cdk
git commit -m "feat(cdk): add encrypted network and data foundations"
```

### Task 3: Implement Identity, API, and Async stacks

**Files:**
- Create: `infra/cdk/lib/identity-stack.ts`
- Create: `infra/cdk/lib/api-stack.ts`
- Create: `infra/cdk/lib/async-stack.ts`
- Create: `infra/cdk/test/identity-stack.test.ts`
- Create: `infra/cdk/test/api-stack.test.ts`
- Create: `infra/cdk/test/async-stack.test.ts`
- Modify: `infra/cdk/bin/mcat.ts`

**Interfaces:**
- Produces: learner/staff user pool IDs and clients.
- Produces: REST API URL, Lambda function names, projection publisher/consumer names.

- [ ] **Step 1: Write failing assertions**

Assert two user pools, deletion protection/retention, staff MFA, no client secret in browser clients, REST API throttling/access logging, Lambda Node 22 runtime, no environment secret values, RDS Proxy grants, FIFO queue event source, DLQ alarms, and log retention.

- [ ] **Step 2: Verify RED**

Run: `pnpm exec vitest run infra/cdk/test/identity-stack.test.ts infra/cdk/test/api-stack.test.ts infra/cdk/test/async-stack.test.ts`

Expected: FAIL because the stacks do not exist.

- [ ] **Step 3: Implement Identity**

Configure the learner pool for email sign-in/passwordless email OTP where supported, secure account recovery, and a public PKCE client. Configure a separate staff pool with required MFA/passkey-ready settings and staff groups. Federation remains absent.

- [ ] **Step 4: Implement API**

Bundle the Phase 4B learner handler with `NodejsFunction`, place DB-connected functions in isolated subnets, grant only the DB secret/KMS/proxy permissions needed, set exact CORS origins, enable execution/access logs with data tracing off, create `/v1` resources, and output the API URL.

- [ ] **Step 5: Implement Async**

Bundle the outbox publisher and projection worker, add scheduled outbox polling, FIFO event source mapping with partial batch failure, DLQ alarms, reserved concurrency, and least-privilege queue/database grants.

- [ ] **Step 6: Verify GREEN**

Run: `pnpm exec vitest run infra/cdk/test/{identity,api,async}-stack.test.ts && pnpm --filter @mcat/infra-cdk synth`

Expected: PASS with no unsuppressed cdk-nag errors.

- [ ] **Step 7: Commit**

```bash
git add infra/cdk
git commit -m "feat(cdk): add identity API and projection stacks"
```

### Task 4: Implement Publication, Analytics, Web, and Operations stacks

**Files:**
- Create: `infra/cdk/lib/publication-stack.ts`
- Create: `infra/cdk/lib/analytics-stack.ts`
- Create: `infra/cdk/lib/web-stack.ts`
- Create: `infra/cdk/lib/operations-stack.ts`
- Create: `infra/cdk/test/publication-stack.test.ts`
- Create: `infra/cdk/test/analytics-stack.test.ts`
- Create: `infra/cdk/test/web-stack.test.ts`
- Create: `infra/cdk/test/operations-stack.test.ts`
- Modify: `infra/cdk/bin/mcat.ts`

**Interfaces:**
- Produces: disabled-by-default content publication state machine.
- Produces: Firehose/S3/Glue/Athena foundations.
- Produces: learner/admin CloudFront distribution URLs and deployment buckets.
- Produces: dashboard and alarms.

- [ ] **Step 1: Write failing stack tests**

Assert Step Functions Standard workflow, quarantine-only input permissions, no automatic publication activation, Firehose encryption, Glue catalog, private CloudFront origins with OAC, SPA error mapping, API/auth cache exclusion, WAF-ready outputs, dashboard widgets, and alarms for every approved signal.

- [ ] **Step 2: Verify RED**

Run: `pnpm exec vitest run infra/cdk/test/{publication,analytics,web,operations}-stack.test.ts`

Expected: FAIL because the stacks do not exist.

- [ ] **Step 3: Implement Publication**

Build a Standard state machine with validate, compile, review-gate, dry-run, and disabled activation branches. Synthetic/test-only input must enter a terminal rejection state. Human approval integration is represented by a callback token and cannot be self-approved by the invoking principal.

- [ ] **Step 4: Implement Analytics**

Create encrypted/batched Firehose delivery, partitioned S3, Glue database/table, Athena workgroup with enforced result location and byte-scan controls. QuickSight is absent.

- [ ] **Step 5: Implement Web**

Create private learner/admin artifact buckets, CloudFront OAC, response security headers, immutable asset caching, no-cache HTML, SPA fallback, and outputs used by the deployment script. API and auth remain separate origins and are not cached.

- [ ] **Step 6: Implement Operations**

Create CloudWatch dashboard and alarms for API 5xx/latency, Lambda errors/throttles, RDS Proxy/cluster capacity, queue age/DLQ, outbox age custom metric, publication failures, CloudFront errors, and budget visibility.

- [ ] **Step 7: Verify GREEN and commit**

Run: `pnpm exec vitest run infra/cdk/test && pnpm --filter @mcat/infra-cdk synth`

Expected: PASS with no unsuppressed cdk-nag errors.

```bash
git add infra/cdk
git commit -m "feat(cdk): add publication analytics web and operations"
```

### Task 5: Add deployment, migration, web publish, and rollback tooling

**Files:**
- Create: `tools/aws/package.json`
- Create: `tools/aws/tsconfig.json`
- Create: `tools/aws/src/preflight.ts`
- Create: `tools/aws/src/deploy.ts`
- Create: `tools/aws/src/migrate.ts`
- Create: `tools/aws/src/publish-web.ts`
- Create: `tools/aws/src/smoke.ts`
- Create: `tools/aws/src/preflight.test.ts`
- Create: `docs/runbooks/aws-dev-deploy.md`
- Create: `docs/runbooks/aws-dev-rollback.md`
- Create: `docs/runbooks/database-migrations.md`
- Modify: `package.json`

**Interfaces:**
- Produces: `pnpm aws:preflight`, `pnpm aws:deploy:dev`, `pnpm aws:migrate:dev`, `pnpm aws:publish:web`, `pnpm aws:smoke`.

- [ ] **Step 1: Write failing preflight tests**

```ts
it('rejects an unexpected account before CDK mutation', async () => {
  await expect(preflight({ account: '000000000000', region: 'us-east-1' })).rejects.toThrow(
    'expected AWS account 056956104102',
  );
});
```

- [ ] **Step 2: Verify RED**

Run: `pnpm exec vitest run tools/aws/src/preflight.test.ts`

Expected: FAIL because preflight is absent.

- [ ] **Step 3: Implement fail-closed orchestration**

Preflight verifies clean Git state, private repository, AWS caller/account/region, CDK bootstrap version, no deployed staging/production stacks, required tests, and a reviewed synth/diff artifact before deployment.

- [ ] **Step 4: Implement immutable web publishing**

Build both apps, compute SHA-256 manifests, sync hashed assets with immutable caching, sync HTML/manifest/service worker with no-cache headers, invalidate only HTML shell paths, and record artifact hashes.

- [ ] **Step 5: Write exact runbooks**

Runbooks contain verified profile/account commands, deployment order, migration lock behavior, smoke tests, rollback commands, snapshot/content protections, alarm checks, and known dev-only limitations.

- [ ] **Step 6: Verify GREEN and commit**

Run: `pnpm exec vitest run tools/aws && pnpm --filter @mcat/aws-tools typecheck`

Expected: PASS.

```bash
git add tools/aws docs/runbooks package.json pnpm-lock.yaml
git commit -m "chore(aws): add guarded deployment and rollback tooling"
```

### Task 6: Deploy and verify development Wave 1

**Files:**
- Create: `tests/integration/aws-dev-smoke.test.ts`
- Create: `tests/security/aws-dev-authz.test.ts`
- Create: `generated/deployments/dev-manifest.json`
- Modify: `docs/implementation-status.md`
- Modify: `docs/known-limitations.md`

**Interfaces:**
- Consumes: deployed stack outputs.
- Produces: immutable dev deployment manifest with stack IDs, artifact hashes, API URL, distribution URLs, migration version, content/policy versions, and verification timestamp; no secrets.

- [ ] **Step 1: Run complete local verification**

Run: `pnpm install --frozen-lockfile && pnpm run verify && pnpm run build && pnpm --filter @mcat/infra-cdk synth`

Expected: all commands exit `0`.

- [ ] **Step 2: Run preflight and save CDK diff**

Run: `AWS_PROFILE=sbsandbox AWS_REGION=us-east-1 pnpm aws:preflight`

Expected: account/region/repository/bootstrap/tests pass and diff contains only `McatDev*` resources.

- [ ] **Step 3: Deploy Foundation, Data, and Identity**

Run: `AWS_PROFILE=sbsandbox AWS_REGION=us-east-1 pnpm --filter @mcat/infra-cdk exec cdk deploy McatDevFoundation McatDevData McatDevIdentity --require-approval never`

Expected: CloudFormation reports `CREATE_COMPLETE` or `UPDATE_COMPLETE` for all three stacks.

- [ ] **Step 4: Apply migrations and deploy API/Async**

Run: `AWS_PROFILE=sbsandbox AWS_REGION=us-east-1 pnpm aws:migrate:dev && pnpm --filter @mcat/infra-cdk exec cdk deploy McatDevApi McatDevAsync --profile sbsandbox --require-approval never`

Expected: the migration command reports schema version `0001_authority` with the committed checksum, then both stacks reach `CREATE_COMPLETE` or `UPDATE_COMPLETE`.

- [ ] **Step 5: Run deployed security/integration tests**

```ts
it('deduplicates repeated commands', async () => {
  const first = await submitAttempt(command);
  const duplicate = await submitAttempt(command);
  expect(duplicate.sequence).toBe(first.sequence);
});

it('prevents cross-learner reads', async () => {
  await expect(readSnapshot(sessionB, learnerA)).rejects.toMatchObject({ status: 403 });
});
```

Run: `AWS_PROFILE=sbsandbox pnpm exec vitest run tests/integration/aws-dev-smoke.test.ts tests/security/aws-dev-authz.test.ts`

Expected: PASS.

- [ ] **Step 6: Deploy Wave 2 stacks and publish web artifacts**

Run: `AWS_PROFILE=sbsandbox AWS_REGION=us-east-1 pnpm --filter @mcat/infra-cdk exec cdk deploy McatDevPublication McatDevAnalytics McatDevWeb McatDevOperations --profile sbsandbox --require-approval never && pnpm aws:publish:web`

Expected: all four stacks complete, publication activation and notification campaign flags remain `false`, and the publish command records learner/admin artifact hashes.

- [ ] **Step 7: Run browser/API/operations smoke checks**

Verify health, guest bootstrap, goal, synthetic attempt, reload persistence, duplicate safety, response `no-store`, CloudFront SPA routing, no protected fields in bundles/caches/log samples, dashboard data, DLQ empty state, and budget existence.

- [ ] **Step 8: Generate the deployment manifest and update honest status docs**

Status must distinguish deployed/verified Wave 1, deployed-disabled Wave 2 foundations, and deferred staging/production/content/validation capabilities.

- [ ] **Step 9: Commit**

```bash
git add tests generated/deployments docs/implementation-status.md docs/known-limitations.md
git commit -m "docs: record verified AWS development deployment"
```

## Phase 4C acceptance

Run:

```bash
pnpm run verify
pnpm run build
pnpm --filter @mcat/infra-cdk synth
AWS_PROFILE=sbsandbox AWS_REGION=us-east-1 pnpm aws:smoke
aws --profile sbsandbox --region us-east-1 cloudformation describe-stacks \
  --query "Stacks[?starts_with(StackName, 'McatDev')].[StackName,StackStatus]" --output table
```

Expected: local verification/build/synth exit `0`, deployed smoke tests pass, and every deployed `McatDev*` stack is complete.
