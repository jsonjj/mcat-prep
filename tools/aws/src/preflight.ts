import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { processCommandRunner, runChecked, type CommandRunner } from './command';

export const EXPECTED_ACCOUNT = '056956104102';
export const EXPECTED_REGION = 'us-east-1';
export const EXPECTED_PROFILE = 'sbsandbox';
export const MINIMUM_BOOTSTRAP_VERSION = 32;
export const CDK_EXECUTION_ROLE_ARN =
  'arn:aws:iam::056956104102:role/cdk-hnb659fds-cfn-exec-role-056956104102-us-east-1';
export const REQUIRED_ORGANIZATION_ACTIONS = [
  'ec2:CreateVpc',
  'ec2:CreateSecurityGroup',
  'rds:CreateDBCluster',
  'rds:CreateDBInstance',
  'cloudfront:CreateDistribution',
] as const;

export const APPROVED_STACKS = [
  'McatDevFoundation',
  'McatDevData',
  'McatDevWeb',
  'McatDevApi',
  'McatDevIdentity',
  'McatDevAsync',
  'McatDevPublication',
  'McatDevOperations',
  'McatDevAnalytics',
] as const;

const APPROVED_STACK_SET = new Set<string>(APPROVED_STACKS);
const NON_DEV_STACK = /(?:staging|production)|(?:^|[-_])(?:stage|prod)(?:$|[-_])/i;
const MCAT_OWNED_STACK = /^(?:mcat(?:[-_]|$)|Mcat)/;
const SHA256 = /^[a-f0-9]{64}$/;
const GIT_COMMIT = /^[a-f0-9]{40}$/;

export interface PreflightEvidence {
  readonly account: string;
  readonly region: string;
  readonly profile: string;
  readonly bootstrapVersion: number;
  readonly gitClean: boolean;
  readonly repositoryVisibility: 'PRIVATE' | 'PUBLIC' | 'INTERNAL' | string;
  readonly repositoryRemote: string;
  readonly deployedStackNames: readonly string[];
  readonly organizationDeniedActions: readonly string[];
}

export interface ReviewedArtifactFile {
  readonly path: string;
  readonly sha256: string;
}

export interface DeploymentReview {
  readonly schemaVersion: 1;
  readonly stage: 'dev';
  readonly account: string;
  readonly region: string;
  readonly profile: string;
  readonly gitCommit: string;
  readonly stacks: readonly string[];
  readonly synth: ReviewedArtifactFile;
  readonly diff: ReviewedArtifactFile;
  readonly review: {
    readonly approved: boolean;
    readonly reviewer: string;
    readonly reviewedAt: string;
  };
}

export interface ReviewedArtifactActuals {
  readonly gitCommit: string;
  readonly synthSha256: string;
  readonly diffSha256: string;
  readonly diffText?: string;
  readonly cdkStackIds?: readonly string[];
}

export interface LivePreflightOptions {
  readonly repositoryRoot: string;
  readonly reviewManifestPath: string;
  readonly runner?: CommandRunner;
  readonly runVerification?: boolean;
}

export interface PreflightResult {
  readonly evidence: PreflightEvidence;
  readonly review: DeploymentReview;
}

function parseJson(value: string, label: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw new Error(`${label} did not return valid JSON`);
  }
}

function objectValue(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be a JSON object`);
  }
  return value as Record<string, unknown>;
}

function stringValue(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) throw new Error(`${label} is required`);
  return value;
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export function validatePreflightEvidence(evidence: PreflightEvidence): PreflightEvidence {
  if (evidence.account !== EXPECTED_ACCOUNT) {
    throw new Error(`Preflight rejected: expected AWS account ${EXPECTED_ACCOUNT}`);
  }
  if (evidence.region !== EXPECTED_REGION) {
    throw new Error(`Preflight rejected: expected AWS region ${EXPECTED_REGION}`);
  }
  if (evidence.profile !== EXPECTED_PROFILE) {
    throw new Error(`Preflight rejected: expected AWS profile ${EXPECTED_PROFILE}`);
  }
  if (!Number.isInteger(evidence.bootstrapVersion) || evidence.bootstrapVersion < 32) {
    throw new Error(
      `Preflight rejected: CDK bootstrap version must be at least ${MINIMUM_BOOTSTRAP_VERSION}`,
    );
  }
  if (!evidence.gitClean) throw new Error('Preflight rejected: Git worktree must be clean');
  if (evidence.repositoryVisibility !== 'PRIVATE') {
    throw new Error('Preflight rejected: GitHub repository must be private');
  }
  if (evidence.organizationDeniedActions.length > 0) {
    throw new Error(
      `Preflight rejected: organization policy denies required AWS mutations (${evidence.organizationDeniedActions.join(', ')})`,
    );
  }
  if (
    !['https://github.com/jsonjj/mcat-prep.git', 'git@github.com:jsonjj/mcat-prep.git'].includes(
      evidence.repositoryRemote,
    )
  ) {
    throw new Error('Preflight rejected: origin must be github.com/jsonjj/mcat-prep');
  }
  const unsafeStack = evidence.deployedStackNames.find(
    (stack) => MCAT_OWNED_STACK.test(stack) && NON_DEV_STACK.test(stack),
  );
  if (unsafeStack !== undefined) {
    throw new Error(`Preflight rejected: staging/production stack is present (${unsafeStack})`);
  }
  return evidence;
}

export function findOrganizationDeniedActions(value: unknown): string[] {
  const root = objectValue(value, 'IAM organization-policy simulation');
  const results = Array.isArray(root.EvaluationResults) ? root.EvaluationResults : [];
  const organizationAllowed = new Set<string>();
  for (const [index, result] of results.entries()) {
    const record = objectValue(result, `IAM simulation result ${index}`);
    const action = typeof record.EvalActionName === 'string' ? record.EvalActionName : undefined;
    const detail =
      typeof record.OrganizationsDecisionDetail === 'object' &&
      record.OrganizationsDecisionDetail !== null &&
      !Array.isArray(record.OrganizationsDecisionDetail)
        ? (record.OrganizationsDecisionDetail as Record<string, unknown>)
        : undefined;
    if (action !== undefined && detail?.AllowedByOrganizations === true) {
      organizationAllowed.add(action);
    }
  }
  return REQUIRED_ORGANIZATION_ACTIONS.filter((action) => !organizationAllowed.has(action));
}

function parseDeploymentReview(value: unknown): DeploymentReview {
  const root = objectValue(value, 'deployment review');
  const synth = objectValue(root.synth, 'deployment review synth');
  const diff = objectValue(root.diff, 'deployment review diff');
  const review = objectValue(root.review, 'deployment review approval');
  if (root.schemaVersion !== 1 || root.stage !== 'dev') {
    throw new Error('Deployment review must use schema version 1 for dev');
  }
  if (!Array.isArray(root.stacks) || !root.stacks.every((stack) => typeof stack === 'string')) {
    throw new Error('Deployment review stacks must be an array of stack IDs');
  }
  return {
    schemaVersion: 1,
    stage: 'dev',
    account: stringValue(root.account, 'deployment review account'),
    region: stringValue(root.region, 'deployment review region'),
    profile: stringValue(root.profile, 'deployment review profile'),
    gitCommit: stringValue(root.gitCommit, 'deployment review Git commit'),
    stacks: root.stacks,
    synth: {
      path: stringValue(synth.path, 'synth path'),
      sha256: stringValue(synth.sha256, 'synth SHA-256'),
    },
    diff: {
      path: stringValue(diff.path, 'diff path'),
      sha256: stringValue(diff.sha256, 'diff SHA-256'),
    },
    review: {
      approved: review.approved === true,
      reviewer: stringValue(review.reviewer, 'reviewer'),
      reviewedAt: stringValue(review.reviewedAt, 'reviewedAt'),
    },
  };
}

export function verifyReviewedArtifact(
  review: DeploymentReview,
  actual: ReviewedArtifactActuals,
): DeploymentReview {
  if (
    review.account !== EXPECTED_ACCOUNT ||
    review.region !== EXPECTED_REGION ||
    review.profile !== EXPECTED_PROFILE
  ) {
    throw new Error('Deployment review targets unexpected AWS coordinates');
  }
  if (!GIT_COMMIT.test(review.gitCommit) || review.gitCommit !== actual.gitCommit) {
    throw new Error('Deployment review Git commit is stale or invalid');
  }
  if (!review.review.approved) throw new Error('Deployment review requires explicit approval');
  if (Number.isNaN(Date.parse(review.review.reviewedAt))) {
    throw new Error('Deployment review timestamp is invalid');
  }
  for (const stack of review.stacks) {
    if (!APPROVED_STACK_SET.has(stack))
      throw new Error(`Deployment review includes unapproved stack ${stack}`);
  }
  const uniqueStacks = new Set(review.stacks);
  if (uniqueStacks.size !== review.stacks.length)
    throw new Error('Deployment review repeats a stack');
  const positions = review.stacks.map((stack) =>
    APPROVED_STACKS.indexOf(stack as (typeof APPROVED_STACKS)[number]),
  );
  if (positions.some((position, index) => index > 0 && position <= (positions[index - 1] ?? -1))) {
    throw new Error('Deployment review stacks are not in approved dependency order');
  }
  if (!SHA256.test(review.synth.sha256) || review.synth.sha256 !== actual.synthSha256) {
    throw new Error('Reviewed synth SHA-256 does not match current bytes');
  }
  if (!SHA256.test(review.diff.sha256) || review.diff.sha256 !== actual.diffSha256) {
    throw new Error('Reviewed diff SHA-256 does not match current bytes');
  }
  if (actual.diffText !== undefined && actual.diffText.trim().length === 0) {
    throw new Error('Reviewed diff must not be empty');
  }
  if (
    actual.cdkStackIds !== undefined &&
    (actual.cdkStackIds.length !== APPROVED_STACKS.length ||
      actual.cdkStackIds.some((stack, index) => stack !== APPROVED_STACKS[index]))
  ) {
    throw new Error('Reviewed CDK assembly does not contain the exact development stack allowlist');
  }
  if (
    actual.diffText !== undefined &&
    /(?:AWS::KMS::Key|AWS::RDS::DBCluster|AWS::Cognito::UserPool|AWS::S3::Bucket)[\s\S]{0,300}(?:replace|replacement)/i.test(
      actual.diffText,
    )
  ) {
    throw new Error('Reviewed diff contains a stateful resource replacement');
  }
  return review;
}

export function assertNoRawAwsCredentials(
  environment: Readonly<Record<string, string | undefined>>,
): void {
  const present = [
    'AWS_ACCESS_KEY_ID',
    'AWS_SECRET_ACCESS_KEY',
    'AWS_SESSION_TOKEN',
    'AWS_SECURITY_TOKEN',
    'AWS_WEB_IDENTITY_TOKEN_FILE',
  ].filter((name) => (environment[name]?.length ?? 0) > 0);
  if (present.length > 0) {
    throw new Error(
      `Preflight rejected: raw AWS credential environment is set (${present.join(', ')})`,
    );
  }
}

export interface MutationBoundaryEvidence {
  readonly gitStatus: string;
  readonly gitCommit: string;
  readonly account: string;
}

export function validateMutationBoundary(
  evidence: MutationBoundaryEvidence,
  expectedCommit: string,
): void {
  if (evidence.gitStatus.trim().length > 0) {
    throw new Error('Mutation boundary rejected: worktree changed after review');
  }
  if (evidence.gitCommit !== expectedCommit) {
    throw new Error('Mutation boundary rejected: Git commit changed after review');
  }
  if (evidence.account !== EXPECTED_ACCOUNT) {
    throw new Error('Mutation boundary rejected: AWS account changed after review');
  }
}

export async function assertMutationBoundary(
  runner: CommandRunner,
  repositoryRoot: string,
  expectedCommit: string,
): Promise<void> {
  assertNoRawAwsCredentials(process.env);
  const [gitStatus, gitCommit, callerJson] = await Promise.all([
    runChecked(runner, {
      command: 'git',
      args: ['status', '--porcelain=v1', '--untracked-files=normal'],
      cwd: repositoryRoot,
    }),
    runChecked(runner, { command: 'git', args: ['rev-parse', 'HEAD'], cwd: repositoryRoot }),
    runChecked(runner, {
      command: 'aws',
      args: [
        '--profile',
        EXPECTED_PROFILE,
        '--region',
        EXPECTED_REGION,
        'sts',
        'get-caller-identity',
        '--output',
        'json',
      ],
      cwd: repositoryRoot,
    }),
  ]);
  const caller = objectValue(parseJson(callerJson, 'AWS caller identity'), 'AWS caller identity');
  validateMutationBoundary(
    {
      gitStatus,
      gitCommit: gitCommit.trim(),
      account: stringValue(caller.Account, 'AWS caller account'),
    },
    expectedCommit,
  );
}

async function artifactFiles(root: string, current = root): Promise<string[]> {
  const entries = await readdir(current, { withFileTypes: true });
  const paths: string[] = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const path = join(current, entry.name);
    if (entry.isSymbolicLink())
      throw new Error(`Reviewed artifact may not contain symlinks: ${path}`);
    if (entry.isDirectory()) paths.push(...(await artifactFiles(root, path)));
    else if (entry.isFile()) paths.push(relative(root, path).split(sep).join('/'));
  }
  return paths;
}

async function hashReviewedArtifact(path: string): Promise<string> {
  const stat = await lstat(path);
  if (stat.isSymbolicLink()) throw new Error('Reviewed artifact may not be a symlink');
  if (stat.isFile()) return sha256(await readFile(path));
  if (!stat.isDirectory()) throw new Error('Reviewed synth artifact must be a file or directory');
  const files = await artifactFiles(path);
  const hashes = await Promise.all(
    files.map(async (file) => `${file}\0${sha256(await readFile(join(path, file)))}`),
  );
  return sha256(Buffer.from(hashes.join('\n'), 'utf8'));
}

export async function assertReviewedArtifactUnchanged(
  path: string,
  expectedSha256: string,
): Promise<void> {
  if (!SHA256.test(expectedSha256) || (await hashReviewedArtifact(path)) !== expectedSha256) {
    throw new Error('Reviewed CDK assembly changed after review');
  }
}

async function cdkStackIds(synthPath: string): Promise<readonly string[]> {
  const stat = await lstat(synthPath);
  const manifestPath = stat.isDirectory() ? join(synthPath, 'manifest.json') : synthPath;
  const manifest = objectValue(
    parseJson(await readFile(manifestPath, 'utf8'), 'CDK assembly manifest'),
    'CDK assembly manifest',
  );
  const artifacts = objectValue(manifest.artifacts, 'CDK assembly artifacts');
  return Object.entries(artifacts).flatMap(([id, value]) => {
    const artifact = objectValue(value, `CDK artifact ${id}`);
    return artifact.type === 'aws:cloudformation:stack' ? [id] : [];
  });
}

export async function createDeploymentReviewDraft(options: {
  readonly synthPath: string;
  readonly diffPath: string;
  readonly gitCommit: string;
}): Promise<DeploymentReview> {
  const synthPath = resolve(options.synthPath);
  const diffPath = resolve(options.diffPath);
  const [synthSha256, diffBytes, stackIds] = await Promise.all([
    hashReviewedArtifact(synthPath),
    readFile(diffPath),
    cdkStackIds(synthPath),
  ]);
  if (
    stackIds.length !== APPROVED_STACKS.length ||
    stackIds.some((stack, index) => stack !== APPROVED_STACKS[index])
  ) {
    throw new Error('CDK assembly does not contain the exact development stack allowlist');
  }
  if (diffBytes.toString('utf8').trim().length === 0) {
    throw new Error('Reviewed diff must not be empty');
  }
  if (!GIT_COMMIT.test(options.gitCommit))
    throw new Error('A full lowercase Git commit is required');
  return {
    schemaVersion: 1,
    stage: 'dev',
    account: EXPECTED_ACCOUNT,
    region: EXPECTED_REGION,
    profile: EXPECTED_PROFILE,
    gitCommit: options.gitCommit,
    stacks: stackIds,
    synth: { path: synthPath, sha256: synthSha256 },
    diff: { path: diffPath, sha256: sha256(diffBytes) },
    review: {
      approved: false,
      reviewer: 'PENDING',
      reviewedAt: new Date().toISOString(),
    },
  };
}

async function collectLiveEvidence(
  repositoryRoot: string,
  runner: CommandRunner,
): Promise<{ readonly evidence: PreflightEvidence; readonly gitCommit: string }> {
  const base = { cwd: repositoryRoot } as const;
  const gitStatus = await runChecked(runner, {
    ...base,
    command: 'git',
    args: ['status', '--porcelain=v1', '--untracked-files=normal'],
  });
  const repositoryRemote = (
    await runChecked(runner, { ...base, command: 'git', args: ['remote', 'get-url', 'origin'] })
  ).trim();
  const visibility = (
    await runChecked(runner, {
      ...base,
      command: 'gh',
      args: ['repo', 'view', 'jsonjj/mcat-prep', '--json', 'visibility', '--jq', '.visibility'],
    })
  ).trim();
  const caller = objectValue(
    parseJson(
      await runChecked(runner, {
        ...base,
        command: 'aws',
        args: [
          '--profile',
          EXPECTED_PROFILE,
          '--region',
          EXPECTED_REGION,
          'sts',
          'get-caller-identity',
          '--output',
          'json',
        ],
      }),
      'AWS caller identity',
    ),
    'AWS caller identity',
  );
  const configuredRegion = (
    await runChecked(runner, {
      ...base,
      command: 'aws',
      args: ['--profile', EXPECTED_PROFILE, 'configure', 'get', 'region'],
    })
  ).trim();
  const bootstrap = objectValue(
    parseJson(
      await runChecked(runner, {
        ...base,
        command: 'aws',
        args: [
          '--profile',
          EXPECTED_PROFILE,
          '--region',
          EXPECTED_REGION,
          'ssm',
          'get-parameter',
          '--name',
          '/cdk-bootstrap/hnb659fds/version',
          '--output',
          'json',
        ],
      }),
      'CDK bootstrap lookup',
    ),
    'CDK bootstrap lookup',
  );
  const parameter = objectValue(bootstrap.Parameter, 'CDK bootstrap parameter');
  const organizationSimulation = parseJson(
    await runChecked(runner, {
      ...base,
      command: 'aws',
      args: [
        '--profile',
        EXPECTED_PROFILE,
        '--region',
        EXPECTED_REGION,
        'iam',
        'simulate-principal-policy',
        '--policy-source-arn',
        CDK_EXECUTION_ROLE_ARN,
        '--action-names',
        ...REQUIRED_ORGANIZATION_ACTIONS,
        '--output',
        'json',
      ],
    }),
    'IAM organization-policy simulation',
  );
  const stackResult = objectValue(
    parseJson(
      await runChecked(runner, {
        ...base,
        command: 'aws',
        args: [
          '--profile',
          EXPECTED_PROFILE,
          '--region',
          EXPECTED_REGION,
          'cloudformation',
          'list-stacks',
          '--output',
          'json',
        ],
      }),
      'CloudFormation stack lookup',
    ),
    'CloudFormation stack lookup',
  );
  const summaries = Array.isArray(stackResult.StackSummaries) ? stackResult.StackSummaries : [];
  const deployedStackNames = summaries.flatMap((summary, index) => {
    const record = objectValue(summary, `stack summary ${index}`);
    return record.StackStatus === 'DELETE_COMPLETE'
      ? []
      : [stringValue(record.StackName, `stack summary ${index} name`)];
  });
  const gitCommit = (
    await runChecked(runner, { ...base, command: 'git', args: ['rev-parse', 'HEAD'] })
  ).trim();

  return {
    evidence: {
      account: stringValue(caller.Account, 'AWS caller account'),
      region: configuredRegion,
      profile: EXPECTED_PROFILE,
      bootstrapVersion: Number(stringValue(parameter.Value, 'CDK bootstrap version')),
      gitClean: gitStatus.trim().length === 0,
      repositoryVisibility: visibility,
      repositoryRemote,
      deployedStackNames,
      organizationDeniedActions: findOrganizationDeniedActions(organizationSimulation),
    },
    gitCommit,
  };
}

export async function runLivePreflight(options: LivePreflightOptions): Promise<PreflightResult> {
  assertNoRawAwsCredentials(process.env);
  const runner = options.runner ?? processCommandRunner;
  const live = await collectLiveEvidence(options.repositoryRoot, runner);
  validatePreflightEvidence(live.evidence);

  if (options.runVerification !== false) {
    await runChecked(runner, {
      command: 'pnpm',
      args: ['run', 'verify'],
      cwd: options.repositoryRoot,
    });
    await runChecked(runner, {
      command: 'pnpm',
      args: ['run', 'build'],
      cwd: options.repositoryRoot,
    });
  }

  const reviewPath = resolve(options.reviewManifestPath);
  const reviewDirectory = dirname(reviewPath);
  const review = parseDeploymentReview(
    parseJson(await readFile(reviewPath, 'utf8'), 'deployment review'),
  );
  const resolveArtifact = (path: string) => (isAbsolute(path) ? path : join(reviewDirectory, path));
  const synthPath = resolveArtifact(review.synth.path);
  const diffPath = resolveArtifact(review.diff.path);
  const [synthSha256, diffBytes, stackIds] = await Promise.all([
    hashReviewedArtifact(synthPath),
    readFile(diffPath),
    cdkStackIds(synthPath),
  ]);
  verifyReviewedArtifact(review, {
    gitCommit: live.gitCommit,
    synthSha256,
    diffSha256: sha256(diffBytes),
    diffText: diffBytes.toString('utf8'),
    cdkStackIds: stackIds,
  });
  return { evidence: live.evidence, review };
}

const invokedPath = process.argv[1] === undefined ? undefined : resolve(process.argv[1]);
if (invokedPath === fileURLToPath(import.meta.url)) {
  const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
  if (process.argv[2] === 'prepare-review') {
    const synthPath = process.env.MCAT_REVIEW_SYNTH_PATH;
    const diffPath = process.env.MCAT_REVIEW_DIFF_PATH;
    const outputPath = process.env.MCAT_DEPLOY_REVIEW_MANIFEST;
    if (synthPath === undefined || diffPath === undefined || outputPath === undefined) {
      throw new Error(
        'MCAT_REVIEW_SYNTH_PATH, MCAT_REVIEW_DIFF_PATH, and MCAT_DEPLOY_REVIEW_MANIFEST are required',
      );
    }
    const gitCommit = (
      await runChecked(processCommandRunner, {
        command: 'git',
        args: ['rev-parse', 'HEAD'],
        cwd: repositoryRoot,
      })
    ).trim();
    const draft = await createDeploymentReviewDraft({ synthPath, diffPath, gitCommit });
    const destination = resolve(outputPath);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, `${JSON.stringify(draft, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600,
      flag: 'wx',
    });
    process.stdout.write(`Wrote unapproved deployment review draft to ${destination}.\n`);
    process.exit(0);
  }
  const reviewManifestPath = process.env.MCAT_DEPLOY_REVIEW_MANIFEST;
  if (reviewManifestPath === undefined || reviewManifestPath.length === 0) {
    throw new Error('MCAT_DEPLOY_REVIEW_MANIFEST is required');
  }
  const result = await runLivePreflight({ repositoryRoot, reviewManifestPath });
  process.stdout.write(
    `AWS preflight passed for ${result.evidence.account}/${result.evidence.region}; reviewed ${result.review.stacks.length} stack(s).\n`,
  );
}
