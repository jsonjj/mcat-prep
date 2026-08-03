# Automated GitHub Actions deploy (AWS dev)

## Purpose

`.github/workflows/deploy.yml` is the **automated** release pipeline for the MCAT
Mastery development backend (AWS account `056956104102`, `us-east-1`). It
complements — it does not replace — the fail-closed, human-reviewed manual path in
[`aws-dev-deploy.md`](./aws-dev-deploy.md). Use the manual runbook for
first-provisioning and high-risk / stateful changes; use this pipeline for routine
API + web releases once the account is bootstrapped.

The pipeline authenticates to AWS with **short-lived GitHub OIDC credentials**
(`aws-actions/configure-aws-credentials` assuming a role) — there are **no
long-lived AWS access keys** anywhere in the workflow.

## What it does (in order)

1. **verify** — reuses the exact `AWS backend CI` job (`workflow_call`) as a
   required gate. Deploy only starts after verify + lesson-validate + integration
   tests + build + `cdk synth` succeed.
2. **deploy** — gated by the `aws-dev` GitHub Environment approval, then:
   1. `pnpm install --frozen-lockfile`
   2. Configure AWS credentials via GitHub OIDC (`role-to-assume`)
   3. `pnpm run build` (with `VITE_AUTHORITY_BASE_URL` compiled into the learner SPA)
   4. Guard: scan the learner artifact for protected/server-only material
   5. `cdk deploy McatDevData` — deploy the data plane first so the in-VPC migration
      Lambda is refreshed with the **current** bundled migrations before it is
      invoked (also deploys its foundation dependency)
   6. Resolve the migration Lambda ARN from the `mcat-dev-data` stack output
      `MigrationFunctionArn` (uses the ambient OIDC session, no named profile)
   7. `pnpm --filter @mcat/aws-tools migrate:ci-lambda` — **invoke the in-VPC
      migration Lambda** to apply forward-only migrations. The Lambda runs inside the
      isolated subnets and reaches Aurora via the RDS Proxy, so the runner needs no
      direct database reachability and no `DATABASE_URL` for migrations. The Lambda
      re-validates the reviewed apply-forward manifest against its own bundled SQL
      before applying anything and returns a signed attestation the tool verifies.
   8. `pnpm content:seed` (idempotent questions + passages upsert) — still runs over
      `DATABASE_URL` because it performs content upserts the migration Lambda cannot
      run. This is now the **only** step that needs a runner-reachable database; it is
      **skipped with a warning** when `DATABASE_URL` is unset (migrations still ran).
   9. `cdk deploy McatDevWeb McatDevApi` (data is already current from step 5)
   10. Upload the built SPA to S3 and invalidate the CloudFront shell

## Triggers

- `workflow_dispatch` (manual)
- `push` to `main`

Both go through the `verify` gate **and** the `aws-dev` environment approval.

## What YOU must provide

### 1. Repository / environment **variables** (Settings ▸ Secrets and variables ▸ Actions ▸ Variables)

| Variable | Example | Notes |
| --- | --- | --- |
| `AWS_DEPLOY_ROLE_ARN` | `arn:aws:iam::056956104102:role/mcat-github-deploy` | Output `GithubDeployRoleArn` from the CDK stack below |
| `AWS_ACCOUNT_ID` | `056956104102` | Must match the infra/cdk dev environment |
| `AWS_REGION` | `us-east-1` | Must match the infra/cdk dev environment |
| `VITE_AUTHORITY_BASE_URL` | `https://d2j72l2zhhn7o7.cloudfront.net` | Absolute learner CloudFront origin; compiled into the SPA at build time |
| `MCAT_QUESTION_CORPUS_DIR` | `/path/to/corpus` | Required by `questions:seed` (needs `questions.json` + `protected.json`) |
| `DATABASE_SSL` | `require` | Optional. `require` (default) · `no-verify` · `disable` |

### 2. Repository / environment **secrets**

| Secret | Notes |
| --- | --- |
| `DATABASE_URL` | Postgres URL used by the **seed** step only, reachable **from the runner**. **Migrations no longer use it** — they run inside the VPC via the migration Lambda. The Aurora cluster is in isolated subnets behind the RDS Proxy, so for seed this must be a runner-reachable endpoint (e.g. a Session pooler / RDS Proxy session endpoint) or the job must run on a self-hosted in-VPC runner. If that reachability is not yet wired, leave `DATABASE_URL` unset: the seed step then skips with a warning and everything else (including migrations) still succeeds. Seed content separately via the manual in-VPC path in [`aws-dev-deploy.md`](./aws-dev-deploy.md). |

> The deploy role ARN, account id, and region are **not secret** and are stored as
> variables. Only `DATABASE_URL` (and any DB credentials embedded in it) is a secret.

### 3. GitHub Environment

Create an environment named **`aws-dev`** (Settings ▸ Environments) with **required
reviewers**. This is the approval gate. Its name must match the OIDC subject the
deploy role trusts: `repo:<OWNER>/<REPO>:environment:aws-dev`.

## One-time bootstrap (before the workflow can run)

### a. CDK bootstrap the account/region

```bash
pnpm --filter @mcat/infra-cdk exec cdk bootstrap aws://056956104102/us-east-1
```

This creates the `cdk-hnb659fds-*` roles the pipeline assumes; the OIDC role only
holds `sts:AssumeRole` on those plus the SPA-publish permissions (least privilege).

### b. Create the GitHub OIDC provider + deploy role (infra/cdk)

The role is defined in `infra/cdk/lib/github-deploy-stack.ts` and synthesized from
its own entrypoint (`infra/cdk/bin/github-deploy.ts`) — **separate** from the
reviewed nine-stack app, so it never widens the deployment allowlist.

```bash
pnpm --filter @mcat/infra-cdk github-deploy:deploy -- \
  -c awsAccountId=056956104102 \
  -c awsRegion=us-east-1 \
  -c githubOwner=jsonjj \
  -c githubRepo=mcat-prep \
  -c permissionsBoundaryArn=arn:aws:iam::056956104102:policy/InternSandboxBoundary
```

Copy the `GithubDeployRoleArn` output into the `AWS_DEPLOY_ROLE_ARN` variable.

Supported CDK context parameters (all names are explicit; nothing is hardcoded):

| `-c` key | Default | Meaning |
| --- | --- | --- |
| `awsAccountId` | — (required; env `CDK_DEFAULT_ACCOUNT`/`AWS_ACCOUNT_ID`) | Target account |
| `awsRegion` | `us-east-1` (env `CDK_DEFAULT_REGION`/`AWS_REGION`) | Target region |
| `githubOwner` | — (required; env `GITHUB_DEPLOY_OWNER`) | Org/user |
| `githubRepo` | — (required; env `GITHUB_DEPLOY_REPO`) | Repository |
| `githubAllowedRefs` | `refs/heads/main` | Comma-separated refs allowed to assume the role |
| `githubDeployEnvironment` | `aws-dev` | Environment subject added to the trust |
| `githubAllowedSubjects` | derived | Full override of trusted OIDC `sub` claims |
| `githubOidcProviderArn` | — (create new) | Reuse an existing provider instead of creating one |
| `deployRoleName` | `mcat-github-deploy` | Physical role name |
| `cdkQualifier` | `hnb659fds` | CDK bootstrap qualifier |
| `permissionsBoundaryArn` | — | Required in the sandbox account |

> If the GitHub OIDC provider already exists in the account, pass
> `-c githubOidcProviderArn=arn:aws:iam::056956104102:oidc-provider/token.actions.githubusercontent.com`
> so CDK imports it instead of trying to create a duplicate.

### c. Create the `aws-dev` GitHub Environment with required reviewers (above).

### d. Provision the database once

Deploy the foundation + data stacks (see [`aws-dev-deploy.md`](./aws-dev-deploy.md))
so the database exists and is reachable **before** the pipeline's migrate/seed
steps run. On a brand-new account those steps have no database to talk to.

## Notes and caveats

- **migrate via the in-VPC Lambda.** The pipeline runs `cdk deploy McatDevData` →
  invoke migration Lambda → seed → `cdk deploy McatDevWeb McatDevApi`. Deploying the
  data stack first guarantees the migration Lambda bundles the current
  `database/migrations` before it is invoked (the Lambda re-validates the reviewed
  manifest against its bundled SQL, so a stale Lambda would reject a newer manifest).
  Because the Lambda executes inside the VPC and reaches Aurora through the RDS Proxy,
  the runner never needs a network path to Aurora for migrations. `migrate:ci-lambda`
  is the OIDC counterpart to the human-only `migrate:dev`: it preserves the ambient
  OIDC session and invokes the Lambda without a named `--profile` (which `migrate:dev`
  requires and which its command runner strips). The older `migrate:ci` (direct SQL
  over `DATABASE_URL`) remains in `@mcat/aws-tools` as a fallback for environments
  that already have a runner-reachable pooler path.
- **seed still needs a reachable DB.** Only `content:seed` connects to Postgres
  directly (it upserts questions + passages, which the migration Lambda does not do).
  Point `DATABASE_URL` at a runner-reachable pooler / RDS Proxy session endpoint, or
  run it from the manual in-VPC path. When `DATABASE_URL` is unset the seed step skips
  with a warning so migrations and the rest of the deploy still complete.
- **Database credential rotation.** The Aurora **administrator** secret rotates
  automatically every 30 days (single-user rotation, wired in
  `infra/cdk/lib/data-stack.ts` via `cluster.addRotationSingleUser`; the AWS-managed
  rotation Lambda runs in the isolated subnets and reaches Secrets Manager through the
  foundation's private interface endpoint, so no internet egress is needed). The two
  least-privilege principal secrets (`mcat_learner_api`, `mcat_workers`) are **not**
  auto-rotated by an independent Lambda because the in-VPC migration Lambda owns their
  role/password lifecycle. Rotate them by updating the secret value and re-invoking the
  migration Lambda (`migrate:ci-lambda` / `migrate:dev`), which re-applies the password
  and re-hardens the role. Backups are retained 7 days and deletion protection is
  intentionally off in the isolated dev account. See the `AwsSolutions-SMG4` and
  `AwsSolutions-RDS10` acknowledgements in `data-stack.ts` for the full rationale.
- **Double verify on `main`.** `AWS backend CI` also runs on push to `main`, so
  verify runs both standalone and inside this pipeline. The checks are idempotent.
- **Admin web** is intentionally not published (matches `publish:web`).
- For rollbacks and failure handling, use [`aws-dev-rollback.md`](./aws-dev-rollback.md).
