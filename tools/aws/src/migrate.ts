import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { processCommandRunner, runChecked, type CommandRunner, type CommandSpec } from './command';
import { readStackOutputs } from './outputs';
import {
  EXPECTED_ACCOUNT,
  EXPECTED_PROFILE,
  EXPECTED_REGION,
  assertMutationBoundary,
  runLivePreflight,
} from './preflight';

export const MIGRATION_ADVISORY_LOCK_ID = 72_004_001;
const MIGRATION_FILE = /^\d+_[a-z0-9][a-z0-9_-]*\.sql$/i;
const MIGRATION_LAMBDA_ARN = new RegExp(
  `^arn:aws:lambda:${EXPECTED_REGION}:${EXPECTED_ACCOUNT}:function:mcat-dev-migration-[a-z0-9-]+$`,
);

export interface MigrationManifestEntry {
  readonly version: string;
  readonly sha256: string;
  readonly bytes: number;
}

export interface MigrationManifest {
  readonly schemaVersion: 1;
  readonly stage: 'dev';
  readonly account: typeof EXPECTED_ACCOUNT;
  readonly region: typeof EXPECTED_REGION;
  readonly gitCommit: string;
  readonly advisoryLockId: typeof MIGRATION_ADVISORY_LOCK_ID;
  readonly migrations: readonly MigrationManifestEntry[];
  readonly sha256: string;
}

function digest(bytes: Uint8Array | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export async function buildMigrationManifest(
  migrationsDirectory: string,
  gitCommit: string,
): Promise<MigrationManifest> {
  if (!/^[a-f0-9]{40}$/.test(gitCommit)) throw new Error('A full lowercase Git commit is required');
  const entries = (await readdir(migrationsDirectory, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && MIGRATION_FILE.test(entry.name))
    .map((entry) => entry.name)
    .sort();
  if (entries.length === 0) throw new Error('No ordered SQL migrations were found');
  const migrations = await Promise.all(
    entries.map(async (version) => {
      const bytes = await readFile(join(migrationsDirectory, version));
      return { version, sha256: digest(bytes), bytes: bytes.byteLength };
    }),
  );
  const manifestBody = JSON.stringify({
    schemaVersion: 1,
    stage: 'dev',
    account: EXPECTED_ACCOUNT,
    region: EXPECTED_REGION,
    gitCommit,
    advisoryLockId: MIGRATION_ADVISORY_LOCK_ID,
    migrations,
  });
  return {
    schemaVersion: 1,
    stage: 'dev',
    account: EXPECTED_ACCOUNT,
    region: EXPECTED_REGION,
    gitCommit,
    advisoryLockId: MIGRATION_ADVISORY_LOCK_ID,
    migrations,
    sha256: digest(manifestBody),
  };
}

export function migrationInvocationCommand(
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
      '--profile',
      EXPECTED_PROFILE,
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

export function verifyMigrationResponse(
  invocationOutput: string,
  payloadOutput: string,
  manifest: MigrationManifest,
): void {
  const invocation = JSON.parse(invocationOutput) as {
    StatusCode?: unknown;
    FunctionError?: unknown;
  };
  if (invocation.StatusCode !== 200 || invocation.FunctionError !== undefined) {
    throw new Error('Migration Lambda invocation did not complete successfully');
  }
  const payload = JSON.parse(payloadOutput) as {
    ok?: unknown;
    advisoryLockId?: unknown;
    manifestSha256?: unknown;
    migrations?: unknown;
  };
  if (
    payload.ok !== true ||
    payload.advisoryLockId !== MIGRATION_ADVISORY_LOCK_ID ||
    payload.manifestSha256 !== manifest.sha256 ||
    !Array.isArray(payload.migrations) ||
    payload.migrations.length !== manifest.migrations.length
  ) {
    throw new Error('Migration Lambda returned an invalid or mismatched attestation');
  }
  const actual = new Map(
    payload.migrations.map((entry, index) => {
      if (typeof entry !== 'object' || entry === null) {
        throw new Error(`Migration attestation entry ${index} is invalid`);
      }
      const record = entry as Record<string, unknown>;
      if (record.status !== 'applied' && record.status !== 'already_applied') {
        throw new Error(`Migration attestation entry ${index} has an invalid status`);
      }
      return [record.version, record.sha256] as const;
    }),
  );
  for (const migration of manifest.migrations) {
    if (actual.get(migration.version) !== migration.sha256) {
      throw new Error(`Migration attestation mismatch for ${migration.version}`);
    }
  }
}

export async function migrateDevelopment(options: {
  readonly repositoryRoot: string;
  readonly reviewManifestPath: string;
  readonly functionArn: string;
  readonly runner?: CommandRunner;
}): Promise<MigrationManifest> {
  const runner = options.runner ?? processCommandRunner;
  const preflight = await runLivePreflight({
    repositoryRoot: options.repositoryRoot,
    reviewManifestPath: options.reviewManifestPath,
    runner,
  });
  const manifest = await buildMigrationManifest(
    join(options.repositoryRoot, 'database', 'migrations'),
    preflight.review.gitCommit,
  );
  const temporaryDirectory = await mkdtemp(join(tmpdir(), 'mcat-migration-'));
  const requestPath = join(temporaryDirectory, 'request.json');
  const responsePath = join(temporaryDirectory, 'response.json');
  try {
    await assertMutationBoundary(runner, options.repositoryRoot, preflight.review.gitCommit);
    const confirmedManifest = await buildMigrationManifest(
      join(options.repositoryRoot, 'database', 'migrations'),
      preflight.review.gitCommit,
    );
    if (confirmedManifest.sha256 !== manifest.sha256) {
      throw new Error('Migration files changed after preflight');
    }
    await writeFile(requestPath, JSON.stringify({ operation: 'apply-forward', manifest }), {
      encoding: 'utf8',
      mode: 0o600,
    });
    const invocationOutput = await runChecked(
      runner,
      migrationInvocationCommand(options.functionArn, requestPath, responsePath),
    );
    verifyMigrationResponse(invocationOutput, await readFile(responsePath, 'utf8'), manifest);
    return manifest;
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

const invokedPath = process.argv[1] === undefined ? undefined : resolve(process.argv[1]);
if (invokedPath === fileURLToPath(import.meta.url)) {
  const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
  const reviewManifestPath = process.env.MCAT_DEPLOY_REVIEW_MANIFEST;
  const attestationPath = process.env.MCAT_MIGRATION_ATTESTATION_PATH;
  if (reviewManifestPath === undefined || attestationPath === undefined) {
    throw new Error('MCAT_DEPLOY_REVIEW_MANIFEST and MCAT_MIGRATION_ATTESTATION_PATH are required');
  }
  const outputs = await readStackOutputs(processCommandRunner, 'mcat-dev-data', [
    'MigrationFunctionArn',
  ]);
  const functionArn = outputs.MigrationFunctionArn ?? '';
  const manifest = await migrateDevelopment({
    repositoryRoot,
    reviewManifestPath,
    functionArn,
  });
  const destination = resolve(attestationPath);
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(
    destination,
    `${JSON.stringify(
      {
        schemaVersion: 1,
        kind: 'migration',
        account: EXPECTED_ACCOUNT,
        region: EXPECTED_REGION,
        gitCommit: manifest.gitCommit,
        evidenceSha256: manifest.sha256,
        verifiedAt: new Date().toISOString(),
      },
      null,
      2,
    )}\n`,
    { encoding: 'utf8', mode: 0o600, flag: 'wx' },
  );
  process.stdout.write(
    `Migration attested: ${manifest.migrations.length} version(s), manifest ${manifest.sha256}.\n`,
  );
}
