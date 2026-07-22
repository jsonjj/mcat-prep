# AWS development deployment runbook

## Purpose

Use this runbook to deploy the MCAT Mastery development backend to AWS account
`056956104102` in `us-east-1` with profile `sbsandbox`. The tooling is intentionally
fail-closed: it does not deploy staging or production, accept wildcard stack selectors,
re-synthesize after review, or use static AWS credentials.

Do not deploy while any prerequisite or abort condition below is unresolved.

## Prerequisites

- The Git repository is `github.com/jsonjj/mcat-prep`, is private, and the worktree is clean.
- AWS CLI authentication uses the `sbsandbox` profile. Unset `AWS_ACCESS_KEY_ID`,
  `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN`, `AWS_SECURITY_TOKEN`, and
  `AWS_WEB_IDENTITY_TOKEN_FILE`.
- `aws sts get-caller-identity --profile sbsandbox` returns account `056956104102`.
- The profile region is `us-east-1` and CDK bootstrap parameter
  `/cdk-bootstrap/hnb659fds/version` is at least `32`.
- The CDK app contains exactly these IDs in this dependency order:
  `McatDevFoundation`, `McatDevData`, `McatDevIdentity`, `McatDevApi`, `McatDevAsync`,
  `McatDevPublication`, `McatDevAnalytics`, `McatDevWeb`, and `McatDevOperations`.
- The data stack exports `MigrationFunctionArn`; the API stack exports `LearnerApiUrl`; the
  web stack exports `LearnerArtifactBucketName`, `LearnerDistributionId`,
  `AdminArtifactBucketName`, `AdminDistributionId`, and `LearnerWebUrl`.
- Exact learner and staff HTTPS origins have been approved. Empty, wildcard, localhost,
  HTTP, and placeholder origins are not acceptable deployment values.
- The admin app no longer embeds answer keys or protected rationales and has staff
  authentication. Until then, `publish:web` must fail its built-artifact scan; do not bypass it.

## Abort conditions

Stop without deploying if any command reports a different account, profile, region, repository,
bootstrap version, commit, artifact hash, stack set/order, or CloudFormation output. Also stop on:

- any staging or production stack, including one in a failed or in-progress state;
- an unreviewed CDK diff or a replacement of Aurora, KMS keys, Cognito pools, or retained S3;
- a failed test, type check, build, CDK validation, protected-field scan, or migration attestation;
- an unexpected public database/bucket, NAT gateway, wildcard IAM grant, or browser credential;
- an alarm, non-empty DLQ, failed publication workflow, or budget-control failure;
- protected content, a source map, a reference derivative, or an unknown file in a web build.

## 1. Verify the local and AWS boundary

Run these independently and inspect their output:

```bash
git status --short
git remote get-url origin
gh repo view jsonjj/mcat-prep --json visibility
aws --profile sbsandbox --region us-east-1 sts get-caller-identity
aws --profile sbsandbox configure get region
aws --profile sbsandbox --region us-east-1 ssm get-parameter --name /cdk-bootstrap/hnb659fds/version
aws --profile sbsandbox --region us-east-1 cloudformation list-stacks --output table
pnpm run verify
pnpm run build
```

Expected: clean Git, the private `jsonjj/mcat-prep` repository, account `056956104102`, region
`us-east-1`, bootstrap version `32` or newer, no staging/production stack, and all local checks at
exit code `0`.

## 2. Produce an immutable review packet

Use a directory outside the repository so review artifacts do not dirty Git. The learner and
staff origins are produced by the reviewed CloudFront stack and are not supplied manually.

```bash
export AWS_PROFILE=sbsandbox
export AWS_REGION=us-east-1
export CDK_DEFAULT_ACCOUNT=056956104102
export CDK_DEFAULT_REGION=us-east-1
export MCAT_STAGE=dev
export MCAT_REVIEW_DIRECTORY=/tmp/mcat-dev-review-$(git rev-parse HEAD)
mkdir -p "$MCAT_REVIEW_DIRECTORY"
```

Synthesize all nine exact stacks into the review directory:

```bash
pnpm --filter @mcat/infra-cdk exec cdk synth McatDevFoundation McatDevData McatDevWeb McatDevIdentity McatDevApi McatDevAsync McatDevPublication McatDevAnalytics McatDevOperations --strict --output "$MCAT_REVIEW_DIRECTORY/cdk.out"
```

Create a no-change-set diff from that assembly and preserve its exact bytes:

```bash
pnpm --filter @mcat/infra-cdk exec cdk diff McatDevFoundation McatDevData McatDevWeb McatDevIdentity McatDevApi McatDevAsync McatDevPublication McatDevAnalytics McatDevOperations --app "$MCAT_REVIEW_DIRECTORY/cdk.out" --change-set=false --no-color > "$MCAT_REVIEW_DIRECTORY/diff.txt"
```

Generate the draft. This hashes every file in `cdk.out`, not only `manifest.json`:

```bash
export MCAT_REVIEW_SYNTH_PATH="$MCAT_REVIEW_DIRECTORY/cdk.out"
export MCAT_REVIEW_DIFF_PATH="$MCAT_REVIEW_DIRECTORY/diff.txt"
export MCAT_DEPLOY_REVIEW_MANIFEST="$MCAT_REVIEW_DIRECTORY/review.json"
pnpm --filter @mcat/aws-tools review:dev
```

An authorized reviewer must inspect the complete diff and assembly, then set `review.approved` to
`true`, replace `PENDING` with their identity, and set `reviewedAt` to the review time. The review
file contains no credentials. Any subsequent Git, synth, diff, or review-file change invalidates
preflight.

## 3. Run fail-closed preflight

```bash
pnpm --filter @mcat/aws-tools preflight
```

Preflight rechecks clean Git, repository privacy, exact AWS identity/region, bootstrap version,
every non-deleted CloudFormation stack, local verification/build, all nine CDK assembly IDs,
review approval, current commit, and the canonical assembly/diff hashes.

## 4. Deploy the foundation wave

```bash
export MCAT_DEPLOY_WAVE=foundation
pnpm --filter @mcat/aws-tools deploy:dev
```

This deploys only `McatDevFoundation`, `McatDevData`, `McatDevWeb`, then `McatDevIdentity`, each with
`--exclusively` from the reviewed assembly. Confirm every physical stack is complete and inspect
CloudWatch, CloudTrail, budget, KMS, S3 public-access blocks, Aurora/RDS Proxy, and Cognito before
continuing.

## 5. Apply forward-only database migrations

Follow [database-migrations.md](./database-migrations.md). The migration command resolves the
dedicated function ARN only from `mcat-dev-data`, invokes it synchronously, and requires an exact
checksum/lock attestation.

```bash
export MCAT_MIGRATION_ATTESTATION_PATH="$MCAT_REVIEW_DIRECTORY/migration-attestation.json"
pnpm --filter @mcat/aws-tools migrate:dev
```

## 6. Deploy and smoke the authority wave

```bash
export MCAT_DEPLOY_WAVE=authority
export MCAT_MIGRATION_ATTESTATION_PATH="$MCAT_REVIEW_DIRECTORY/migration-attestation.json"
pnpm --filter @mcat/aws-tools deploy:dev
export MCAT_SMOKE_ATTESTATION_PATH="$MCAT_REVIEW_DIRECTORY/authority-smoke-attestation.json"
pnpm --filter @mcat/aws-tools smoke
```

The wave deploys only `McatDevApi` and `McatDevAsync`. The smoke client resolves the exact
CloudFront learner origin and API URL from stack outputs and
checks health, CORS, two secure `__Host-` cookies, CSRF, idempotent goal replay, authenticated
reads, unauthenticated/CSRF/ownership negatives, and protected-field absence.

## 7. Deploy the edge and operations wave

```bash
export MCAT_DEPLOY_WAVE=edge
export MCAT_SMOKE_ATTESTATION_PATH="$MCAT_REVIEW_DIRECTORY/authority-smoke-attestation.json"
pnpm --filter @mcat/aws-tools deploy:dev
export MCAT_SMOKE_ATTESTATION_PATH="$MCAT_REVIEW_DIRECTORY/edge-smoke-attestation.json"
pnpm --filter @mcat/aws-tools smoke
```

This deploys, in order, `McatDevPublication`, `McatDevAnalytics`, and
`McatDevOperations`. The second smoke resolves both API and learner origins from exact stack
outputs.

Confirm publication activation, notification campaigns, live AI/speech, federation, QuickSight,
and research datasets remain disabled.

## 8. Publish immutable web artifacts

Choose a deployment-manifest path outside public build directories. The integration coordinator
may instead provide the parent-owned `generated/deployments` destination.

```bash
export MCAT_WEB_PUBLISH_MANIFEST=/tmp/mcat-dev-web-publish.json
pnpm --filter @mcat/aws-tools publish:web
```

The command resolves bucket/distribution/API coordinates only from `mcat-dev-web` and
`mcat-dev-api`, reruns the protected scan, injects the normalized API stage root into the learner
build, scans the learner tree, computes a SHA-256 manifest, uploads fingerprinted assets with
one-year immutable caching, uploads shells with no-cache, and invalidates only shell paths. It
never uses `s3 sync --delete`.

The admin build is deliberately excluded until its synthetic authority dependency and
answer-bearing material are removed. There is no override that publishes it in this phase.

## 9. Record evidence

Record, without secrets:

- commit and reviewed assembly/diff hashes;
- stack IDs, physical names, IDs, statuses, and output URLs;
- migration manifest hash and applied/already-applied versions;
- learner artifact hash and CloudFront invalidation ID;
- test/smoke exit codes, alarm/DLQ/budget state, reviewer, and timestamps.

Do not claim development deployment complete until the integration tests, security tests, smoke,
dashboard data, empty DLQs, and budget existence are verified. Staging and production remain
unprovisioned.

Run the executable operations checks below. The first query must show only complete `mcat-dev-*`
stacks, the second must return an empty list, and the budget must exist with limit USD 100:

```bash
aws --profile sbsandbox --region us-east-1 cloudformation describe-stacks --query "Stacks[?starts_with(StackName, 'mcat-dev-')].[StackName,StackStatus]" --output table
aws --profile sbsandbox --region us-east-1 cloudwatch describe-alarms --alarm-name-prefix mcat-dev --state-value ALARM --query "MetricAlarms[].{Name:AlarmName,Reason:StateReason}" --output table
aws --profile sbsandbox --region us-east-1 budgets describe-budget --account-id 056956104102 --budget-name mcat-dev-monthly --query "Budget.{Name:BudgetName,Limit:BudgetLimit,Actual:CalculatedSpend.ActualSpend,Forecast:CalculatedSpend.ForecastedSpend}" --output table
aws --profile sbsandbox --region us-east-1 sqs list-queues --queue-name-prefix mcat-dev --output table
```

For every DLQ URL returned by the operations stack, run the following and require both visible and
in-flight counts to be `0`:

```bash
aws --profile sbsandbox --region us-east-1 sqs get-queue-attributes --queue-url EXACT_DLQ_URL_FROM_STACK_OUTPUT --attribute-names ApproximateNumberOfMessages ApproximateNumberOfMessagesNotVisible --output table
```

## Known development-only limitations

- No staging or production deployment is authorized by these tools.
- QuickSight, live AI/speech, federation, live push campaigns, research datasets, and cross-region
  disaster recovery are intentionally absent.
- Database rollback is forward-fix only; see the migration runbook.
- Web publication is deliberately unavailable while the admin bundle contains protected content.

For any failed deployment or verification step, use [aws-dev-rollback.md](./aws-dev-rollback.md).
