# Database migration runbook

## Purpose

Apply committed PostgreSQL migrations to the private development Aurora cluster through the
dedicated migration Lambda. Local machines never connect directly to Aurora or RDS Proxy.

Schema rollback is forward-fix only. Never run a destructive down migration, manually delete a
row from `authority_schema_migrations`, or edit an already-applied SQL file.

## Safety model

- Migration files are `database/migrations/NNNN_name.sql` and run in lexical order.
- The tool hashes the exact bytes of every migration and the complete manifest.
- The runner acquires PostgreSQL advisory lock `72004001` for the migration session.
- `authority_schema_migrations` records the filename, SHA-256 checksum, and application time.
- A matching applied checksum is a no-op; checksum drift is a hard failure.
- Each unapplied migration runs in its own transaction. A failure rolls back that migration and
  releases the advisory lock.
- The Lambda must attest the lock ID, manifest hash, and every migration version/checksum. The
  local command rejects a missing or mismatched attestation.
- The function ARN is accepted only when it is a development migration function in account
  `056956104102`, region `us-east-1`, and is resolved from `mcat-dev-data` output
  `MigrationFunctionArn`.

## Prerequisites

- The reviewed deployment manifest and clean Git preflight from
  [aws-dev-deploy.md](./aws-dev-deploy.md) pass.
- `McatDevFoundation`, `McatDevData`, and the storage-only `McatDevWeb` are complete. Identity is
  intentionally deployed after this migration attestation as part of the authority wave.
- The data stack's one-shot migration Lambda runs in the private VPC, reaches only the TLS RDS
  Proxy, reads the database secret through an approved endpoint, and imports the committed
  `@mcat/database` migration engine.
- Aurora is available and its backup retention/PITR configuration is verified directly. If
  `McatDevOperations` already exists during an update, its database alarms must also be healthy;
  alarms are not a prerequisite for the first deployment because Operations follows migration.
- The exact migration diff has application and PostgreSQL review. Destructive DDL, long table
  rewrites, and locks over the interactive one-second budget require a separate approved plan.

## Pre-migration review

```bash
git status --short
git diff -- database/migrations database/src/migrate.ts
pnpm exec vitest run database/src/migrations.test.ts
pnpm --filter @mcat/database typecheck
aws --profile sbsandbox --region us-east-1 cloudformation describe-stacks --stack-name mcat-dev-data --output table
```

Confirm the diff is additive/compatible with the currently supported website and service-worker
versions. Use expand/migrate/contract sequencing; do not remove an old column or constraint while
deployed code still depends on it.

## Apply

With `MCAT_DEPLOY_REVIEW_MANIFEST` still pointing to the approved review:

```bash
export MCAT_MIGRATION_ATTESTATION_PATH="$MCAT_REVIEW_DIRECTORY/migration-attestation.json"
pnpm --filter @mcat/aws-tools migrate:dev
```

Expected output reports the migration count and manifest SHA-256 and writes the new attestation
file without overwriting any earlier evidence. Exit code `0` means both the AWS invocation and the
database runner's attestation matched. It does not merely mean Lambda accepted the request. The
authority deployment wave refuses to run without this commit-bound attestation.

## Post-migration verification

1. Confirm the migration Lambda invocation has no function error, timeout, or throttle.
2. Confirm Aurora and RDS Proxy are available. If `McatDevOperations` already exists, also confirm
   its connection/error/capacity alarms remain healthy.
3. If the authority/operations stacks already exist, confirm the outbox/projection queues and DLQs
   did not accumulate unexpected work.
4. Deploy the authority wave and run the API smoke suite.
5. Record the Git commit, manifest hash, exact version/checksum list, invocation request ID, and
   timestamp in the non-secret deployment evidence.

## Failure handling

### Lock wait or timeout

Stop. Do not kill an unknown PostgreSQL backend. Identify the lock holder through approved
operations access, determine whether another migration is active, and retry only after the owner
confirms it is safe.

### Checksum drift

Stop. Restore the committed bytes of the already-applied migration. Put the intended change in a
new higher-numbered migration. Never update the recorded checksum to force acceptance.

### SQL transaction failure

The failing migration is rolled back automatically. Inspect the Lambda's allowlisted logs, fix the
cause in a new commit, regenerate/re-review the full CDK and migration evidence, and retry. Do not
continue to later migrations manually.

### Lambda or network failure

Do not open Aurora publicly or tunnel around the private boundary. Fix the migration Lambda,
endpoint, security-group, secret, or RDS Proxy path in CDK, review the diff, and redeploy the
foundation wave.

### Migration succeeded but application failed

Do not run a down migration. Roll application stacks back to the last schema-compatible reviewed
assembly, or ship a reviewed forward compatibility migration. Use PITR only for a declared data
integrity incident under the rollback runbook; restoring a database without replaying newer
accepted learner events can lose acknowledged work.

## Prohibited operations

- `DROP DATABASE`, ad hoc `psql` from a laptop, public security-group ingress, or disabling TLS;
- editing/deleting applied files or `authority_schema_migrations` rows;
- destructive down/rollback SQL;
- restoring a snapshot over the live cluster without incident authorization and event-loss review;
- deploying a migration from an unreviewed commit or a mismatched account/region/profile.
