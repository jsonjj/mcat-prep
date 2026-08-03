import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { type CommandRunner, type CommandSpec, runChecked } from './command';
import { buildMigrationManifest, verifyMigrationResponse, type MigrationManifest } from './migrate';
import { EXPECTED_ACCOUNT, EXPECTED_REGION } from './preflight';

/**
 * OIDC/CI forward-only migration entrypoint that INVOKES THE IN-VPC MIGRATION
 * LAMBDA (`pnpm --filter @mcat/aws-tools migrate:ci-lambda`).
 *
 * The deployed Aurora cluster lives in isolated subnets reachable only through the
 * RDS Proxy from inside the VPC, so the GitHub runner cannot open a Postgres
 * connection to it. The migration Lambda already runs inside those subnets, so
 * this entrypoint applies migrations by invoking it with the same reviewed
 * apply-forward manifest the human `migrate:dev` path uses — no DATABASE_URL and
 * no direct database reachability from the runner are required.
 *
 * It is the automated-pipeline counterpart to `migrate:dev`:
 *   - `migrate:dev` is the fail-closed, human-reviewed path. It runs a full live
 *     preflight and invokes the Lambda under a named `aws --profile`, and its
 *     command runner strips ambient AWS credentials so it CANNOT run under OIDC.
 *   - This path instead PRESERVES the ambient GitHub OIDC credentials and invokes
 *     the Lambda WITHOUT `--profile`. It performs no local mutation-boundary /
 *     review-manifest gating because the deploy workflow's environment approval and
 *     verify gate own that, and the Lambda independently re-validates the manifest
 *     against its own bundled migrations before applying anything.
 *
 * The migration Lambda's ARN is provided by the workflow (resolved from the
 * `MigrationFunctionArn` output of the mcat-dev-data stack). See
 * docs/runbooks/github-actions-deploy.md.
 */

const MIGRATION_LAMBDA_ARN = new RegExp(
  `^arn:aws:lambda:${EXPECTED_REGION}:${EXPECTED_ACCOUNT}:function:mcat-dev-migration-[a-z0-9-]+$`,
);
const GIT_COMMIT = /^[a-f0-9]{40}$/;

/**
 * Build the `aws lambda invoke` command for the CI/OIDC path.
 *
 * Unlike `migrationInvocationCommand` (the human path) this omits `--profile` so
 * the ambient GitHub OIDC role is used, while still pinning the approved region
 * and requiring an exact development migration Lambda ARN.
 */
export function ciMigrationInvokeCommand(
  functionArn: string,
  requestPath: string,
  responsePath: string,
): CommandSpec {
  if (!MIGRATION_LAMBDA_ARN.test(functionArn)) {
    throw new Error(
      'Expected an exact development migration Lambda ARN in the approved account/region',
    );
  }
  if (!resolve(requestPath).startsWith(resolve(tmpdir()))) {
    throw new Error('Migration request must be a temporary file');
  }
  if (!resolve(responsePath).startsWith(resolve(tmpdir()))) {
    throw new Error('Migration response must be a temporary file');
  }
  return {
    command: 'aws',
    args: [
      '--region',
      EXPECTED_REGION,
      'lambda',
      'invoke',
      '--function-name',
      functionArn,
      '--invocation-type',
      'RequestResponse',
      '--cli-binary-format',
      'raw-in-base64-out',
      '--payload',
      `fileb://${resolve(requestPath)}`,
      resolve(responsePath),
    ],
  };
}

/**
 * Command runner that PRESERVES the ambient AWS credentials (the GitHub OIDC
 * session that `aws-actions/configure-aws-credentials` exports). This is the
 * deliberate opposite of `processCommandRunner`, which strips them so the
 * human-reviewed `migrate:dev` path cannot run under OIDC.
 */
export const ciCommandRunner: CommandRunner = {
  run: async (spec) =>
    new Promise((resolvePromise, reject) => {
      const child = spawn(spec.command, [...spec.args], {
        cwd: spec.cwd,
        env: spec.env === undefined ? { ...process.env } : { ...process.env, ...spec.env },
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stdout = '';
      let stderr = '';
      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', (chunk: string) => {
        stdout += chunk;
      });
      child.stderr.on('data', (chunk: string) => {
        stderr += chunk;
      });
      child.once('error', reject);
      child.once('close', (exitCode) => {
        resolvePromise({ exitCode: exitCode ?? 1, stdout, stderr });
      });
    }),
};

export interface CiLambdaMigrationOptions {
  readonly repositoryRoot: string;
  readonly functionArn: string;
  readonly gitCommit: string;
  readonly runner?: CommandRunner;
}

/**
 * Build the apply-forward manifest, invoke the in-VPC migration Lambda, and verify
 * its signed attestation. Returns the manifest that was confirmed applied.
 */
export async function runCiLambdaMigration(
  options: CiLambdaMigrationOptions,
): Promise<MigrationManifest> {
  if (!GIT_COMMIT.test(options.gitCommit)) {
    throw new Error('A full lowercase Git commit is required');
  }
  const runner = options.runner ?? ciCommandRunner;
  const manifest = await buildMigrationManifest(
    join(options.repositoryRoot, 'database', 'migrations'),
    options.gitCommit,
  );
  const temporaryDirectory = await mkdtemp(join(tmpdir(), 'mcat-migration-ci-'));
  const requestPath = join(temporaryDirectory, 'request.json');
  const responsePath = join(temporaryDirectory, 'response.json');
  try {
    await writeFile(requestPath, JSON.stringify({ operation: 'apply-forward', manifest }), {
      encoding: 'utf8',
      mode: 0o600,
    });
    const invocationOutput = await runChecked(
      runner,
      ciMigrationInvokeCommand(options.functionArn, requestPath, responsePath),
    );
    verifyMigrationResponse(invocationOutput, await readFile(responsePath, 'utf8'), manifest);
    return manifest;
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

const invokedPath = process.argv[1] === undefined ? undefined : resolve(process.argv[1]);
if (invokedPath === fileURLToPath(import.meta.url)) {
  const functionArn = process.env.MCAT_MIGRATION_FUNCTION_ARN?.trim();
  const gitCommit = (process.env.MCAT_MIGRATION_GIT_COMMIT ?? process.env.GITHUB_SHA)?.trim();
  if (functionArn === undefined || functionArn === '') {
    console.error(
      'MCAT_MIGRATION_FUNCTION_ARN is required. Resolve it from the mcat-dev-data stack output ' +
        'MigrationFunctionArn after deploying the data stack. See docs/runbooks/github-actions-deploy.md.',
    );
    process.exit(1);
  }
  if (gitCommit === undefined || gitCommit === '') {
    console.error(
      'MCAT_MIGRATION_GIT_COMMIT (or GITHUB_SHA) with the full 40-character commit is required.',
    );
    process.exit(1);
  }
  const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
  const manifest = await runCiLambdaMigration({ repositoryRoot, functionArn, gitCommit });
  process.stdout.write(
    `Applied forward-only migrations via the in-VPC Lambda: ${manifest.migrations.length} ` +
      `version(s), manifest ${manifest.sha256}.\n`,
  );
}
