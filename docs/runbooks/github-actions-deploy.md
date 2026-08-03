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
   5. `pnpm --filter @mcat/aws-tools migrate:ci` (forward-only SQL vs `DATABASE_URL`)
   6. `pnpm content:seed` (idempotent questions + passages upsert)
   7. `cdk deploy McatDevWeb McatDevApi` (CDK also deploys their foundation + data deps)
   8. Upload the built SPA to S3 and invalidate the CloudFront shell

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
| `DATABASE_URL` | Postgres URL used by **migrate + seed**, reachable **from the runner**. The Aurora cluster is in isolated subnets behind the RDS Proxy, so this must be a reachable endpoint (e.g. a Session pooler) or the job must run on a self-hosted in-VPC runner. |

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

- **migrate/seed ordering.** The pipeline runs migrate → seed → `cdk deploy` as
  specified; this assumes the data stack/DB already exists and is reachable from the
  runner. `migrate:ci` applies the same ordered SQL in `database/migrations` that the
  migration Lambda uses, but directly over `DATABASE_URL` (the reviewed
  `migrate:dev` Lambda path rejects OIDC credentials and cannot run here).
- **Double verify on `main`.** `AWS backend CI` also runs on push to `main`, so
  verify runs both standalone and inside this pipeline. The checks are idempotent.
- **Admin web** is intentionally not published (matches `publish:web`).
- For rollbacks and failure handling, use [`aws-dev-rollback.md`](./aws-dev-rollback.md).
