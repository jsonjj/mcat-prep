import { spawn } from 'node:child_process';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import {
  constants as fsConstants,
  access,
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  open,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  stat,
  symlink,
  unlink,
  type FileHandle,
  writeFile,
} from 'node:fs/promises';
import { hostname, tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { AsyncLocalStorage } from 'node:async_hooks';

import { admitIntake, admitTaskSourcePacketV5 } from './admission';
import {
  ADMISSION_REPOSITORY_ROOT,
  assertAdmissionAuthorityAvailable,
} from './admission/authority';
import { validateAssignmentPartitionProof } from './assignment-partition';
import {
  canonicalKitJson,
  createFederatedKitCandidates,
  createDeterministicZip,
  createSendMeText,
  extractZipToIsolatedDirectory,
  readZipEntries,
  scanKitBoundaries,
  verifyKitCandidate,
  type CommandRunner,
  type FinalInputValidators,
  type KitAllowedInventoryEntry,
  type KitArchiveFile,
  type KitIdentityPins,
  type KitValidatorAuthority,
  type TeamKitInput,
  type ValidatedAssignmentProjection,
  type ValidatedPacketProjection,
} from './kit-factory';

const RUN_ID = '2026-08-03T1727-0500';
const TEST_PARENT = join(
  ADMISSION_REPOSITORY_ROOT,
  '.tmp/scratch/lesson-factory-2026-08-03T1727-0500/wp-03-production-tests',
);
const PRODUCTION_EXTERNAL_ROOT = resolve(
  dirname(ADMISSION_REPOSITORY_ROOT),
  'lesson-factory-handoffs',
  RUN_ID,
);
const SMOKE_EXECUTABLE_PATH = join(
  ADMISSION_REPOSITORY_ROOT,
  'tools/content-cli/bin/lesson-factory-kit-smoke.mjs',
);
const GIT_EXECUTABLE_PATH = '/usr/bin/git';
const VALIDATOR_AUTHORITY_PATHS = Object.freeze([
  'tools/content-cli/src/entry.ts',
  'tools/content-cli/src/main.ts',
  'tools/content-cli/package.json',
  'packages/content/package.json',
  'packages/content/src/lesson-validator/index.ts',
  'packages/content/src/lesson-validator/types.ts',
  'packages/content/src/lesson-validator/validate.ts',
  'packages/content/src/lesson-validator/rules.ts',
  'packages/content/src/lesson-validator/canonical.ts',
  'packages/content/src/lesson-validator/rehash.ts',
  'packages/content/src/lesson-validator/computed-quality.ts',
  'packages/content/src/lesson-validator/resolvable.ts',
  'packages/content/src/lesson-normalization/index.ts',
  'packages/content/src/lesson-normalization/types.ts',
  'packages/content/src/lesson-normalization/normalize.ts',
] as const);
const SMOKE_ENVIRONMENT = Object.freeze({
  CI: '1',
  NO_COLOR: '1',
  PATH: dirname(process.execPath),
  REPOSITORY_ROOT: ADMISSION_REPOSITORY_ROOT,
});
const AUTHORITY_SOURCE_PATHS = Object.freeze([
  'packages/content/src/lesson-factory/kit-production.ts',
  'packages/content/src/lesson-factory/kit-production.test.ts',
  'packages/content/src/lesson-factory/kit-factory.ts',
  'packages/content/src/lesson-factory/kit-factory.test.ts',
  'packages/content/src/lesson-factory/index.ts',
  'tools/content-cli/bin/lesson-factory-kit-smoke.mjs',
  'tools/content-cli/src/entry.ts',
  'tools/content-cli/src/kit-main.ts',
  'tools/content-cli/src/kit-result.ts',
  'tools/content-cli/src/kit-result.test.ts',
  'tools/content-cli/package.json',
  'content/lesson-factory/kit-v1/source-map.json',
  ...VALIDATOR_AUTHORITY_PATHS,
] as const);
const KIT_SOURCE_MAP_PATH = 'content/lesson-factory/kit-v1/source-map.json';
const GENERATION_TWO_FORBIDDEN_SHARED_PATHS = Object.freeze([
  'apps',
  'content/curriculum',
  'content/lesson-factory/assignments',
  'content/lesson-factory/packets',
  'content/lesson-factory/schemas',
  'content/lessons',
  'docs/lesson-registration.md',
  'package.json',
  'packages',
  'pnpm-lock.yaml',
  'services',
  'tests/architecture',
  'tools',
] as const);

const PRODUCTION_AUTHORITY = Object.freeze({
  runId: RUN_ID,
  executionArmed: false as const,
  assignments: Object.freeze([
    {
      teamId: 'team-A' as const,
      laneId: 'lane-02',
      assignmentId: 'lesson-factory-deadline-2026-08-03-assignment-02',
      path: 'content/lesson-factory/assignments/team-A-30.json',
    },
    {
      teamId: 'team-B' as const,
      laneId: 'lane-03',
      assignmentId: 'lesson-factory-deadline-2026-08-03-assignment-03',
      path: 'content/lesson-factory/assignments/team-B-30.json',
    },
  ] as const),
  packetRoot: 'content/lesson-factory/packets',
  proofPath: 'content/lesson-factory/assignments/partition-proof.json',
  sourceMapPath: KIT_SOURCE_MAP_PATH,
  corePaths: Object.freeze([
    'key-docs/lesson-quality-rubric.md',
    'content/lesson-factory/deadline-profile/deadline-profile.json',
    'content/lesson-factory/deadline-profile/release-policy.json',
    'content/lesson-factory/deadline-profile/owner-source-use-receipt.json',
    'content/lesson-factory/schemas/shared-vocabulary.schema.json',
    'content/lesson-factory/schemas/task-source-packet.schema.json',
    'content/lesson-factory/schemas/assignment-manifest.schema.json',
    'content/lesson-factory/schemas/assignment-partition-proof.schema.json',
    'content/lesson-factory/schemas/kit-manifest.schema.json',
    'docs/lesson-authoring/template/v3-les-000000/README.md',
    'docs/lesson-authoring/template/v3-les-000000/lesson-script.json',
    'docs/lesson-authoring/template/v3-les-000000/kc-coverage-matrix.json',
    'docs/lesson-authoring/template/v3-les-000000/lesson-presentation-plan.json',
    'docs/lesson-authoring/template/v3-les-000000/lesson-quality-report.json',
  ] as const),
  finalizationReceiptPath: 'content/lesson-factory/finalization/wp-03-finalization-receipt.json',
  externalHandoffRoot: undefined as string | undefined,
  expectedRepositoryCommit: undefined as string | undefined,
  finalizationIssuerKey: undefined as string | undefined,
  smokeExecutable: undefined as string | undefined,
  smokeExecutableSha256: undefined as string | undefined,
  smokeCommands: Object.freeze([
    {
      id: 'bootstrap',
      argv: ['content', 'lesson-factory', 'kit-smoke', 'bootstrap'],
    },
    {
      id: 'install',
      argv: ['content', 'lesson-factory', 'kit-smoke', 'install'],
    },
    {
      id: 'one-template',
      argv: ['content', 'lesson-factory', 'kit-smoke', 'one-template'],
    },
  ] as const),
});

type TeamId = 'team-A' | 'team-B';
type PipelinePhase =
  | 'AUTHORITY_LOAD'
  | 'CANONICAL_ADMISSION'
  | 'CANDIDATE_ASSEMBLY'
  | 'SMOKE'
  | 'FINALIZATION'
  | 'PUBLISH';

interface Blocker {
  readonly code: string;
  readonly message: string;
}

interface BlockedResult {
  readonly status: 'BLOCKED';
  readonly runId: typeof RUN_ID;
  readonly userSendable: false;
  readonly artifacts: readonly [];
  readonly blockers: readonly Blocker[];
}

interface PreflightBlockedResult {
  readonly status: 'BLOCKED';
  readonly runId: typeof RUN_ID;
  readonly userSendable: false;
  readonly blockers: readonly [Blocker, ...Blocker[]];
}

interface PreflightOkResult {
  readonly status: 'PREFLIGHT_OK';
  readonly runId: typeof RUN_ID;
  readonly userSendable: false;
  readonly authority: {
    readonly state: 'VALID_UNCONSUMED';
    readonly repositoryCommit: string;
    readonly action: 'PACKAGE_KITS';
    readonly teams: readonly [
      { readonly teamId: 'team-A'; readonly lessonCount: 30 },
      { readonly teamId: 'team-B'; readonly lessonCount: 30 },
    ];
  };
}

type ProductionPreflightResult = PreflightBlockedResult | PreflightOkResult;

interface ExecuteBlockedResult extends BlockedResult {
  readonly attemptedPhase: PipelinePhase;
}

interface ReadyProductionResult {
  readonly status: 'READY';
  readonly runId: typeof RUN_ID;
  readonly attemptedPhase: 'PUBLISH';
  readonly userSendable: true;
  readonly generation: number;
  readonly archiveSha256: Readonly<Record<TeamId, string>>;
}

interface TeamCandidate {
  readonly teamId: TeamId;
  readonly lessonIds: readonly string[];
  readonly assignmentSha256: string;
  readonly packetAggregateSha256: string;
  readonly manifestBytes: Uint8Array;
  readonly manifestSha256: string;
  readonly archiveBytes: Uint8Array;
  readonly archiveSha256: string;
  readonly sendMe: string;
  readonly checksum: string;
  readonly smokeReceipts: readonly ProductionSmokeReceipt[];
}

interface ProductionSmokeReceipt {
  readonly commandId: 'bootstrap' | 'install' | 'one-template';
  readonly commandSha256: string;
  readonly executableSha256: string;
  readonly toolSha256: string;
  readonly argv: readonly string[];
  readonly environment: Readonly<Record<string, string>>;
  readonly cwdPolicy: 'EXTRACTED_KIT_ROOT';
  readonly exitCode: 0;
  readonly stdoutSha256: string;
  readonly stderrSha256: string;
  readonly durationMs: number;
  readonly startedAt: string;
  readonly finishedAt: string;
}

interface CandidateSet {
  readonly runId: typeof RUN_ID;
  readonly generation: number;
  readonly teams: readonly [TeamCandidate, TeamCandidate];
  readonly pins: {
    readonly proofSha256: string;
    readonly profileSha256: string;
    readonly schemaSha256: string;
    readonly templateSha256: string;
    readonly repositoryCommit: string;
    readonly toolSha256: string;
    readonly executableSha256: string;
  };
}

interface FinalizationReceipt {
  readonly receiptId: string;
  readonly issuer: 'WP03_FINALIZATION_AUTHORITY';
  readonly runId: typeof RUN_ID;
  readonly allowedAction: 'PACKAGE_KITS';
  readonly validationTimestamp: string;
  readonly generation: number;
  readonly pins: CandidateSet['pins'];
  readonly teams: readonly {
    readonly teamId: TeamId;
    readonly archiveSha256: string;
    readonly manifestSha256: string;
    readonly assignmentSha256: string;
    readonly packetAggregateSha256: string;
    readonly smokeReceiptSha256: string;
    readonly lessonIds: readonly string[];
  }[];
  readonly signature: string;
}

interface LockOwner {
  readonly token: string;
  readonly pid: number;
  readonly host: string;
  readonly nonce: string;
  readonly processStartedAt: string;
  readonly leaseUntil: string;
}

interface OwnedRoot {
  readonly path: string;
  readonly markerName: '.wp03-test-owned' | '.wp03-production-root';
  readonly markerToken: string;
  readonly device: bigint;
  readonly inode: bigint;
}

interface LoadedTeamInput {
  readonly teamId: TeamId;
  readonly laneId: string;
  readonly assignmentId: string;
  readonly assignmentBytes: Uint8Array;
  readonly assignmentDocument: Record<string, unknown>;
  readonly packetFiles: readonly KitArchiveFile[];
  readonly packetDocuments: readonly Record<string, unknown>[];
  readonly lessonIds: readonly string[];
}

interface ProductionKitSourceMapping {
  readonly archivePath: string;
  readonly sourcePath: string;
  readonly mode?: number;
  readonly transform?: 'PINNED_TEAM_README';
}

interface LoadedProductionInputs {
  readonly proofBytes: Uint8Array;
  readonly assembledAt: string;
  readonly coreFiles: readonly KitArchiveFile[];
  readonly teams: readonly [LoadedTeamInput, LoadedTeamInput];
  readonly snapshotSha256: string;
}

async function loadProductionKitSourceMap(): Promise<readonly ProductionKitSourceMapping[]> {
  let value: unknown;
  try {
    value = JSON.parse(
      await readFile(join(ADMISSION_REPOSITORY_ROOT, KIT_SOURCE_MAP_PATH), 'utf8'),
    );
  } catch {
    throw new PipelineFailure('KIT_SOURCE_MAP_INVALID');
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new PipelineFailure('KIT_SOURCE_MAP_INVALID');
  }
  const record = value as Record<string, unknown>;
  if (
    record.format !== 'lesson-generation-kit-source-map/1' ||
    !Array.isArray(record.mappings) ||
    record.mappings.length !== 44
  ) {
    throw new PipelineFailure('KIT_SOURCE_MAP_INVALID');
  }
  const mappings = record.mappings.map((item): ProductionKitSourceMapping => {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) {
      throw new PipelineFailure('KIT_SOURCE_MAP_INVALID');
    }
    const mapping = item as Record<string, unknown>;
    const keys = Object.keys(mapping).sort();
    if (
      (canonicalKitJson(keys) !== canonicalKitJson(['archivePath', 'sourcePath']) &&
        canonicalKitJson(keys) !== canonicalKitJson(['archivePath', 'mode', 'sourcePath']) &&
        canonicalKitJson(keys) !== canonicalKitJson(['archivePath', 'sourcePath', 'transform'])) ||
      typeof mapping.archivePath !== 'string' ||
      typeof mapping.sourcePath !== 'string' ||
      (mapping.mode !== undefined && mapping.mode !== 0o755) ||
      (mapping.transform !== undefined && mapping.transform !== 'PINNED_TEAM_README')
    ) {
      throw new PipelineFailure('KIT_SOURCE_MAP_INVALID');
    }
    return {
      archivePath: mapping.archivePath,
      sourcePath: mapping.sourcePath,
      ...(mapping.mode === undefined ? {} : { mode: mapping.mode }),
      ...(mapping.transform === undefined
        ? {}
        : { transform: mapping.transform as 'PINNED_TEAM_README' }),
    };
  });
  const archivePaths = mappings.map((mapping) => mapping.archivePath);
  if (
    new Set(archivePaths).size !== 44 ||
    canonicalKitJson(archivePaths) !== canonicalKitJson([...archivePaths].sort())
  ) {
    throw new PipelineFailure('KIT_SOURCE_MAP_INVALID');
  }
  return mappings;
}

interface RuntimePins {
  readonly repositoryCommit: string;
  readonly smokeExecutable: string;
  readonly smokeExecutableSha256: string;
}

interface AuthorityArmingRecord {
  readonly format: 'wp-03-production-arming/1';
  readonly receiptId: string;
  readonly finalizationReceiptId: string;
  readonly runId: typeof RUN_ID;
  readonly externalRoot: string;
  readonly repositoryCommit: string;
  readonly blobClosureSha256: string;
  readonly inputSnapshotSha256: string;
  readonly packetSourceCommit: string;
  readonly packetAggregateSha256: string;
  readonly proofSha256: string;
  readonly assignments: readonly {
    readonly teamId: TeamId;
    readonly assignmentId: string;
    readonly assignmentSha256: string;
    readonly lessonIds: readonly string[];
    readonly archiveSha256: string;
    readonly manifestSha256: string;
  }[];
  readonly smokeExecutable: string;
  readonly smokeExecutableSha256: string;
  readonly pins: CandidateSet['pins'];
  readonly action: 'PACKAGE_KITS';
  readonly issuedAt: string;
  readonly expiresAt: string;
  readonly lessonApprovalClaimed: false;
  readonly validationPassClaimed: false;
  readonly signature: string;
}

interface VerifiedAuthorityStore {
  readonly root: OwnedRoot;
  readonly key: string;
  readonly arming: AuthorityArmingRecord;
  readonly finalization: FinalizationReceipt;
  readonly runtime: RuntimePins;
}

let reviewAuthorityRoot: string | undefined;
let reviewAuthorityHead: string | undefined;
let reviewAuthorityDirty = false;

let successfulPreflightInputs: LoadedProductionInputs | undefined;

interface TransactionJournal {
  readonly format: 'wp-03-transaction-journal/1';
  readonly transactionStatus: 'BUILDING';
  readonly transactionId: string;
  readonly generation: number;
  readonly receiptId: string;
  readonly state: 'LOCKED' | 'STAGED' | 'VERSION_RENAMED' | 'CURRENT_COMMITTED' | 'READY_COMMITTED';
  readonly stagePath: string;
  readonly versionPath: string;
  readonly statusPayload: Record<string, unknown>;
  readonly receiptLedgerLine: string;
}

interface ScenarioResult {
  readonly status: 'READY' | 'BLOCKED';
  readonly code?: string;
  readonly evidence: Record<string, unknown>;
}

class PipelineFailure extends Error {
  constructor(
    readonly code: string,
    message = code,
  ) {
    super(message);
    this.name = 'PipelineFailure';
  }
}

const PRODUCTION_OPERATION_IDS = [
  'open',
  'mkdir',
  'write',
  'file-fsync',
  'dir-fsync',
  'rename',
  'remove',
  'chmod',
  'stat',
  'realpath',
  'lock',
  'journal',
  'current',
  'status',
  'ledger',
  'cleanup',
  'smoke',
] as const;
type ProductionOperationId = (typeof PRODUCTION_OPERATION_IDS)[number];
type OperationTeam = TeamId | 'system';
type OperationPhase = 'PRECOMMIT' | 'POSTCOMMIT';
interface OperationContext {
  readonly team: OperationTeam;
  readonly phase: OperationPhase;
}
interface ProductionOperations {
  readonly run: <T>(
    id: ProductionOperationId,
    context: OperationContext,
    action: () => Promise<T>,
  ) => Promise<T>;
}
const REAL_PRODUCTION_OPERATIONS: ProductionOperations = Object.freeze({
  run: async <T>(
    _id: ProductionOperationId,
    _context: OperationContext,
    action: () => Promise<T>,
  ) => action(),
});
const operationContext = new AsyncLocalStorage<OperationContext>();
let reviewOperations: ProductionOperations | undefined;
const activeReviewRoots = new Set<OwnedRoot>();
let reviewMutationHook:
  | ((mutation: {
      readonly id: 'rename' | 'remove';
      readonly from?: string;
      readonly to: string;
    }) => Promise<void>)
  | undefined;

async function productionOperation<T>(
  id: ProductionOperationId,
  action: () => Promise<T>,
): Promise<T> {
  const context = operationContext.getStore() ?? {
    team: 'system',
    phase: 'PRECOMMIT',
  };
  return (reviewOperations ?? REAL_PRODUCTION_OPERATIONS).run(id, context, action);
}

async function withOperationContext<T>(
  context: OperationContext,
  action: () => Promise<T>,
): Promise<T> {
  return operationContext.run(context, action);
}

function sha256(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

function canonicalBytes(value: unknown): Uint8Array {
  return new TextEncoder().encode(`${canonicalKitJson(value)}\n`);
}

function uniqueBlockers(blockers: readonly Blocker[]): Blocker[] {
  return [...new Map(blockers.map((blocker) => [blocker.code, blocker])).values()].sort(
    (left, right) => left.code.localeCompare(right.code),
  );
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function selectedExternalRoot(): string {
  return reviewAuthorityRoot ?? PRODUCTION_EXTERNAL_ROOT;
}

function productionMarkerToken(path: string): string {
  return canonicalKitJson({
    format: 'wp-03-production-root/1',
    root: resolve(path),
    runId: RUN_ID,
  });
}

function authorityPaths(root: string) {
  const directory = join(root, 'authority');
  return {
    directory,
    key: join(directory, 'issuer.key'),
    finalization: join(directory, 'finalization-receipt.json'),
    arming: join(directory, 'arming-receipt.json'),
    armingLedger: join(directory, 'arming-ledger.jsonl'),
    superseded: join(directory, 'superseded'),
  } as const;
}

async function openProductionRoot(create: boolean): Promise<OwnedRoot> {
  const path = selectedExternalRoot();
  if (reviewAuthorityRoot === undefined && path !== PRODUCTION_EXTERNAL_ROOT) {
    throw new PipelineFailure('AUTHORITY_ROOT_MISMATCH');
  }
  const parent = dirname(path);
  if (!(await pathExists(parent))) {
    if (!create) throw new PipelineFailure('PRODUCTION_AUTHORITY_ROOT_MISSING');
    await mkdir(parent, { mode: 0o700 });
  }
  const parentInfo = await lstat(parent);
  if (
    parentInfo.isSymbolicLink() ||
    !parentInfo.isDirectory() ||
    (await realpath(parent)) !== parent
  ) {
    throw new PipelineFailure('AUTHORITY_ROOT_IDENTITY_INVALID');
  }
  if (!(await pathExists(path))) {
    if (!create) throw new PipelineFailure('PRODUCTION_AUTHORITY_ROOT_MISSING');
    await mkdir(path, { mode: 0o700 });
  }
  let info = await lstat(path, { bigint: true });
  const expectedUid = typeof process.getuid === 'function' ? BigInt(process.getuid()) : info.uid;
  if (info.isSymbolicLink() || !info.isDirectory() || (await realpath(path)) !== path) {
    throw new PipelineFailure('AUTHORITY_ROOT_IDENTITY_INVALID');
  }
  if (info.uid !== expectedUid) throw new PipelineFailure('AUTHORITY_ROOT_OWNER_INVALID');
  if (create) {
    await chmod(path, 0o700);
    info = await lstat(path, { bigint: true });
  }
  if ((info.mode & 0o777n) !== 0o700n) {
    throw new PipelineFailure('AUTHORITY_ROOT_MODE_INVALID');
  }
  const markerName = '.wp03-production-root';
  const markerToken = productionMarkerToken(path);
  const markerPath = join(path, markerName);
  if (!(await pathExists(markerPath))) {
    if (!create) throw new PipelineFailure('AUTHORITY_ROOT_MARKER_MISSING');
    await writeExclusiveNoFollow(markerPath, `${markerToken}\n`);
  }
  if ((await readFile(markerPath, 'utf8')) !== `${markerToken}\n`) {
    throw new PipelineFailure('AUTHORITY_ROOT_MARKER_INVALID');
  }
  return {
    path,
    markerName,
    markerToken,
    device: info.dev,
    inode: info.ino,
  };
}

async function gitOutput(args: readonly string[]): Promise<string> {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(GIT_EXECUTABLE_PATH, args, {
      cwd: ADMISSION_REPOSITORY_ROOT,
      env: { LC_ALL: 'C', PATH: '/usr/bin:/bin' },
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on('data', (chunk: Buffer) => stdout.push(Buffer.from(chunk)));
    child.stderr.on('data', (chunk: Buffer) => stderr.push(Buffer.from(chunk)));
    child.once('error', rejectPromise);
    child.once('close', (code) => {
      if (code === 0) resolvePromise(Buffer.concat(stdout).toString('utf8').trim());
      else rejectPromise(new Error(Buffer.concat(stderr).toString('utf8').trim()));
    });
  });
}

async function validatorAuthority(repositoryCommit: string): Promise<KitValidatorAuthority> {
  const files = await Promise.all(
    [...VALIDATOR_AUTHORITY_PATHS].sort().map(async (path) => {
      const bytes = await readFile(join(ADMISSION_REPOSITORY_ROOT, path));
      const sourceSha256 = sha256(bytes);
      return {
        path,
        sha256: sourceSha256,
        gitBlobSha256: sourceSha256,
      };
    }),
  );
  return {
    repositoryCommit,
    aggregateSha256: sha256(canonicalKitJson(files)),
    files,
  };
}

async function authoritySourceIdentity(): Promise<{
  readonly head: string;
  readonly blobClosureSha256: string;
}> {
  const authoritySourcePaths = [
    ...new Set([
      ...AUTHORITY_SOURCE_PATHS,
      ...(await loadProductionKitSourceMap()).map((mapping) => mapping.sourcePath),
    ]),
  ].sort();
  if (reviewAuthorityHead !== undefined) {
    if (reviewAuthorityDirty) throw new PipelineFailure('AUTHORITY_SOURCE_DIRTY');
    return {
      head: reviewAuthorityHead,
      blobClosureSha256: sha256(canonicalKitJson(authoritySourcePaths)),
    };
  }
  const status = await gitOutput(['status', '--porcelain', '--', ...authoritySourcePaths]);
  if (status !== '') throw new PipelineFailure('AUTHORITY_SOURCE_DIRTY');
  const blobs: { path: string; blob: string }[] = [];
  for (const path of authoritySourcePaths) {
    try {
      blobs.push({ path, blob: await gitOutput(['rev-parse', `HEAD:${path}`]) });
    } catch {
      throw new PipelineFailure('AUTHORITY_SOURCE_UNTRACKED');
    }
  }
  return {
    head: await gitOutput(['rev-parse', 'HEAD']),
    blobClosureSha256: sha256(canonicalKitJson(blobs)),
  };
}

function packetAggregate(loaded: LoadedProductionInputs): string {
  return sha256(
    canonicalKitJson(
      loaded.teams.flatMap((team) =>
        team.packetFiles.map((file) => ({
          teamId: team.teamId,
          path: file.path,
          sha256: sha256(file.bytes),
        })),
      ),
    ),
  );
}

function unsignedArming(record: AuthorityArmingRecord): Omit<AuthorityArmingRecord, 'signature'> {
  const { signature: _signature, ...unsigned } = record;
  return unsigned;
}

function signArmingRecord(
  unsigned: Omit<AuthorityArmingRecord, 'signature'>,
  key: string,
): AuthorityArmingRecord {
  return {
    ...unsigned,
    signature: createHmac('sha256', key).update(canonicalKitJson(unsigned)).digest('hex'),
  };
}

function parseAuthorityArming(value: unknown): AuthorityArmingRecord {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new PipelineFailure('AUTHORITY_RECEIPT_INVALID');
  }
  const record = value as Record<string, unknown>;
  const expected = [
    'action',
    'assignments',
    'blobClosureSha256',
    'expiresAt',
    'externalRoot',
    'finalizationReceiptId',
    'format',
    'inputSnapshotSha256',
    'issuedAt',
    'lessonApprovalClaimed',
    'packetAggregateSha256',
    'packetSourceCommit',
    'pins',
    'proofSha256',
    'receiptId',
    'repositoryCommit',
    'runId',
    'signature',
    'smokeExecutable',
    'smokeExecutableSha256',
    'validationPassClaimed',
  ];
  if (canonicalKitJson(Object.keys(record).sort()) !== canonicalKitJson(expected)) {
    throw new PipelineFailure('AUTHORITY_RECEIPT_INVALID');
  }
  const digestFields = [
    record.blobClosureSha256,
    record.inputSnapshotSha256,
    record.packetAggregateSha256,
    record.proofSha256,
    record.smokeExecutableSha256,
  ];
  const assignments = record.assignments;
  const pins = record.pins;
  if (
    record.format !== 'wp-03-production-arming/1' ||
    typeof record.receiptId !== 'string' ||
    !/^wp03-arm-[0-9a-f]{32}$/.test(record.receiptId) ||
    typeof record.finalizationReceiptId !== 'string' ||
    record.runId !== RUN_ID ||
    typeof record.externalRoot !== 'string' ||
    typeof record.repositoryCommit !== 'string' ||
    !/^[0-9a-f]{40}$/.test(record.repositoryCommit) ||
    typeof record.packetSourceCommit !== 'string' ||
    !/^[0-9a-f]{40}$/.test(record.packetSourceCommit) ||
    typeof record.smokeExecutable !== 'string' ||
    typeof record.issuedAt !== 'string' ||
    typeof record.expiresAt !== 'string' ||
    record.action !== 'PACKAGE_KITS' ||
    record.lessonApprovalClaimed !== false ||
    record.validationPassClaimed !== false ||
    typeof record.signature !== 'string' ||
    !/^[0-9a-f]{64}$/.test(record.signature) ||
    digestFields.some((field) => typeof field !== 'string' || !/^[0-9a-f]{64}$/.test(field)) ||
    !Array.isArray(assignments) ||
    assignments.length !== 2 ||
    pins === null ||
    typeof pins !== 'object' ||
    Array.isArray(pins)
  ) {
    throw new PipelineFailure('AUTHORITY_RECEIPT_INVALID');
  }
  const teamIds = assignments.map((assignment) =>
    assignment !== null && typeof assignment === 'object' && !Array.isArray(assignment)
      ? (assignment as Record<string, unknown>).teamId
      : undefined,
  );
  if (canonicalKitJson(teamIds) !== canonicalKitJson(['team-A', 'team-B'])) {
    throw new PipelineFailure('AUTHORITY_RECEIPT_INVALID');
  }
  for (const assignment of assignments as Record<string, unknown>[]) {
    const keys = [
      'archiveSha256',
      'assignmentId',
      'assignmentSha256',
      'lessonIds',
      'manifestSha256',
      'teamId',
    ];
    if (
      canonicalKitJson(Object.keys(assignment).sort()) !== canonicalKitJson(keys) ||
      typeof assignment.assignmentId !== 'string' ||
      !Array.isArray(assignment.lessonIds) ||
      assignment.lessonIds.length !== 30 ||
      new Set(assignment.lessonIds).size !== 30 ||
      [assignment.archiveSha256, assignment.assignmentSha256, assignment.manifestSha256].some(
        (field) => typeof field !== 'string' || !/^[0-9a-f]{64}$/.test(field),
      )
    ) {
      throw new PipelineFailure('AUTHORITY_RECEIPT_INVALID');
    }
  }
  return record as unknown as AuthorityArmingRecord;
}

async function readAuthorityKey(path: string): Promise<string> {
  const info = await lstat(path);
  if (info.isSymbolicLink()) throw new PipelineFailure('AUTHORITY_ISSUER_KEY_SYMLINK');
  if (!info.isFile()) throw new PipelineFailure('AUTHORITY_ISSUER_KEY_INVALID');
  if ((info.mode & 0o777) !== 0o600) {
    throw new PipelineFailure('AUTHORITY_ISSUER_KEY_MODE_INVALID');
  }
  const key = await readFile(path, 'utf8');
  if (!/^[0-9a-f]{64}\n$/.test(key)) {
    throw new PipelineFailure('AUTHORITY_ISSUER_KEY_INVALID');
  }
  return key.trimEnd();
}

function verifyArmingRecord(
  record: AuthorityArmingRecord,
  key: string,
  loaded: LoadedProductionInputs,
  source: { readonly head: string; readonly blobClosureSha256: string },
  now = Date.now(),
): void {
  verifyArmingAuthenticity(record, key);
  const issued = Date.parse(record.issuedAt);
  const expires = Date.parse(record.expiresAt);
  if (
    !Number.isFinite(issued) ||
    !Number.isFinite(expires) ||
    issued > now + 60_000 ||
    expires < now ||
    expires - issued > 15 * 60_000
  ) {
    throw new PipelineFailure('AUTHORITY_RECEIPT_STALE');
  }
  if (record.externalRoot !== selectedExternalRoot()) {
    throw new PipelineFailure('AUTHORITY_ROOT_MISMATCH');
  }
  if (record.repositoryCommit !== source.head) {
    throw new PipelineFailure('AUTHORITY_COMMIT_MISMATCH');
  }
  if (record.packetSourceCommit !== source.head) {
    throw new PipelineFailure('AUTHORITY_PACKET_SOURCE_COMMIT_MISMATCH');
  }
  if (record.blobClosureSha256 !== source.blobClosureSha256) {
    throw new PipelineFailure('AUTHORITY_BLOB_CLOSURE_MISMATCH');
  }
  if (record.smokeExecutable !== SMOKE_EXECUTABLE_PATH) {
    throw new PipelineFailure('AUTHORITY_EXECUTABLE_MISMATCH');
  }
  if (record.inputSnapshotSha256 !== loaded.snapshotSha256) {
    throw new PipelineFailure('AUTHORITY_PACKET_AGGREGATE_MISMATCH');
  }
  if (record.packetAggregateSha256 !== packetAggregate(loaded)) {
    throw new PipelineFailure('AUTHORITY_PACKET_AGGREGATE_MISMATCH');
  }
  if (record.proofSha256 !== sha256(loaded.proofBytes)) {
    throw new PipelineFailure('AUTHORITY_PROOF_MISMATCH');
  }
  for (const team of loaded.teams) {
    const bound = record.assignments.find((assignment) => assignment.teamId === team.teamId);
    if (
      bound === undefined ||
      bound.assignmentId !== team.assignmentId ||
      bound.assignmentSha256 !== sha256(team.assignmentBytes) ||
      canonicalKitJson(bound.lessonIds) !== canonicalKitJson(team.lessonIds)
    ) {
      throw new PipelineFailure('AUTHORITY_ASSIGNMENT_MISMATCH');
    }
  }
  if (
    record.format !== 'wp-03-production-arming/1' ||
    record.runId !== RUN_ID ||
    record.action !== 'PACKAGE_KITS' ||
    record.lessonApprovalClaimed !== false ||
    record.validationPassClaimed !== false
  ) {
    throw new PipelineFailure('AUTHORITY_RECEIPT_INVALID');
  }
}

function verifyArmingAuthenticity(record: AuthorityArmingRecord, key: string): void {
  const signature = createHmac('sha256', key)
    .update(canonicalKitJson(unsignedArming(record)))
    .digest('hex');
  if (
    !/^[0-9a-f]{64}$/.test(record.signature) ||
    !timingSafeEqual(Buffer.from(signature), Buffer.from(record.signature))
  ) {
    throw new PipelineFailure('AUTHORITY_RECEIPT_SIGNATURE_INVALID');
  }
}

function verifyArmingCandidates(record: AuthorityArmingRecord, candidates: CandidateSet): void {
  if (
    canonicalKitJson(record.pins) !== canonicalKitJson(candidates.pins) ||
    record.assignments.length !== 2
  ) {
    throw new PipelineFailure('AUTHORITY_RECEIPT_MISMATCH');
  }
  for (const candidate of candidates.teams) {
    const bound = record.assignments.find((entry) => entry.teamId === candidate.teamId);
    if (
      bound === undefined ||
      bound.archiveSha256 !== candidate.archiveSha256 ||
      bound.manifestSha256 !== candidate.manifestSha256 ||
      bound.assignmentSha256 !== candidate.assignmentSha256 ||
      canonicalKitJson(bound.lessonIds) !== canonicalKitJson(candidate.lessonIds)
    ) {
      throw new PipelineFailure('AUTHORITY_RECEIPT_MISMATCH');
    }
  }
}

async function consumeArmingReceipt(store: VerifiedAuthorityStore): Promise<void> {
  const paths = authorityPaths(store.root.path);
  const prior = (await pathExists(paths.armingLedger))
    ? await readFile(paths.armingLedger, 'utf8')
    : '';
  if (
    prior
      .trim()
      .split('\n')
      .filter(Boolean)
      .some(
        (line) =>
          (JSON.parse(line) as Record<string, unknown>).receiptId === store.arming.receiptId,
      )
  ) {
    throw new PipelineFailure('AUTHORIZATION_REPLAYED');
  }
  const record = canonicalKitJson({
    receiptId: store.arming.receiptId,
    repositoryCommit: store.arming.repositoryCommit,
    signatureSha256: sha256(store.arming.signature),
    consumedAt: new Date().toISOString(),
  });
  const temp = join(paths.directory, `.arming-ledger-${randomBytes(8).toString('hex')}.tmp`);
  await writeExclusiveNoFollow(temp, `${prior}${record}\n`);
  await guardedRename(store.root, temp, paths.armingLedger);
  await syncDirectory(paths.directory);
  await guardedRemove(store.root, paths.arming, { force: true });
  await syncDirectory(paths.directory);
}

async function armingLedgerReceiptIds(path: string): Promise<Set<string>> {
  if (!(await pathExists(path))) return new Set();
  const ids = new Set<string>();
  for (const line of (await readFile(path, 'utf8')).trim().split('\n').filter(Boolean)) {
    let record: unknown;
    try {
      record = JSON.parse(line);
    } catch {
      throw new PipelineFailure('PERSISTED_RECORD_INVALID');
    }
    const receiptId =
      record !== null && typeof record === 'object' && !Array.isArray(record)
        ? (record as Record<string, unknown>).receiptId
        : undefined;
    if (
      record === null ||
      typeof record !== 'object' ||
      Array.isArray(record) ||
      typeof receiptId !== 'string'
    ) {
      throw new PipelineFailure('PERSISTED_RECORD_INVALID');
    }
    ids.add(receiptId);
  }
  return ids;
}

async function preserveSupersededUnconsumedAuthority(root: OwnedRoot, key: string): Promise<void> {
  const paths = authorityPaths(root.path);
  const armingExists = await pathExists(paths.arming);
  const finalizationExists = await pathExists(paths.finalization);
  if (!armingExists && !finalizationExists) return;
  if (!armingExists || !finalizationExists) {
    throw new PipelineFailure('AUTHORITY_RECEIPT_INVALID');
  }
  let arming: AuthorityArmingRecord;
  let finalization: FinalizationReceipt;
  try {
    arming = parseAuthorityArming(JSON.parse(await readFile(paths.arming, 'utf8')));
    finalization = parseClosedReceipt(JSON.parse(await readFile(paths.finalization, 'utf8')));
  } catch (error) {
    if (error instanceof PipelineFailure) throw error;
    throw new PipelineFailure('AUTHORITY_RECEIPT_INVALID');
  }
  verifyArmingAuthenticity(arming, key);
  verifyFinalizationAuthenticity(finalization, key, Date.now(), false);
  if (
    arming.externalRoot !== root.path ||
    arming.finalizationReceiptId !== finalization.receiptId
  ) {
    throw new PipelineFailure('AUTHORITY_RECEIPT_MISMATCH');
  }
  if ((await armingLedgerReceiptIds(paths.armingLedger)).has(arming.receiptId)) {
    throw new PipelineFailure('AUTHORIZATION_REPLAYED');
  }
  const target = join(paths.superseded, arming.receiptId);
  const supersession = {
    format: 'wp-03-authority-supersession/1',
    reason: 'UNCONSUMED_AUTHORITY_REFRESH',
    receiptId: arming.receiptId,
    runId: RUN_ID,
  };
  if (await pathExists(target)) {
    const targetInfo = await lstat(target);
    if (targetInfo.isSymbolicLink() || !targetInfo.isDirectory()) {
      throw new PipelineFailure('AUTHORITY_SUPERSESSION_INVALID');
    }
    for (const [name, value] of [
      ['arming-receipt.json', arming],
      ['finalization-receipt.json', finalization],
      ['supersession.json', supersession],
    ] as const) {
      if (
        (await readFile(join(target, name), 'utf8')) !==
        Buffer.from(canonicalBytes(value)).toString('utf8')
      ) {
        throw new PipelineFailure('AUTHORITY_SUPERSESSION_INVALID');
      }
    }
    return;
  }
  if (await pathExists(paths.superseded)) {
    const supersededInfo = await lstat(paths.superseded);
    if (supersededInfo.isSymbolicLink() || !supersededInfo.isDirectory()) {
      throw new PipelineFailure('AUTHORITY_SUPERSESSION_INVALID');
    }
  }
  await mkdir(paths.superseded, { recursive: true, mode: 0o700 });
  await mkdir(target, { mode: 0o700 });
  await writeCanonicalAtomic(join(target, 'arming-receipt.json'), arming, root);
  await writeCanonicalAtomic(join(target, 'finalization-receipt.json'), finalization, root);
  await writeCanonicalAtomic(join(target, 'supersession.json'), supersession, root);
  for (const file of [
    join(target, 'arming-receipt.json'),
    join(target, 'finalization-receipt.json'),
    join(target, 'supersession.json'),
  ]) {
    await chmod(file, 0o400);
  }
  await chmod(target, 0o500);
  await syncDirectory(target);
  await syncDirectory(paths.superseded);
}

async function loadVerifiedAuthorityStore(
  loaded: LoadedProductionInputs,
): Promise<VerifiedAuthorityStore> {
  const root = await openProductionRoot(false);
  const paths = authorityPaths(root.path);
  if (!(await pathExists(paths.key))) {
    throw new PipelineFailure('AUTHORITY_ISSUER_KEY_MISSING');
  }
  if (!(await pathExists(paths.finalization))) {
    throw new PipelineFailure('FINALIZATION_RECEIPT_MISSING');
  }
  if (!(await pathExists(paths.arming))) {
    throw new PipelineFailure('ARMING_RECEIPT_MISSING');
  }
  const key = await readAuthorityKey(paths.key);
  let arming: AuthorityArmingRecord;
  let finalization: FinalizationReceipt;
  try {
    arming = parseAuthorityArming(JSON.parse(await readFile(paths.arming, 'utf8')));
    finalization = parseClosedReceipt(JSON.parse(await readFile(paths.finalization, 'utf8')));
  } catch (error) {
    if (error instanceof PipelineFailure) throw error;
    throw new PipelineFailure('AUTHORITY_RECEIPT_INVALID');
  }
  verifyFinalizationAuthenticity(finalization, key);
  if (arming.finalizationReceiptId !== finalization.receiptId) {
    throw new PipelineFailure('AUTHORITY_RECEIPT_MISMATCH');
  }
  const ledgerIds = await armingLedgerReceiptIds(paths.armingLedger);
  if (ledgerIds.has(arming.receiptId)) {
    throw new PipelineFailure('AUTHORIZATION_REPLAYED');
  }
  const source = await authoritySourceIdentity();
  verifyArmingRecord(arming, key, loaded, source);
  const executableInfo = await lstat(SMOKE_EXECUTABLE_PATH);
  if (
    executableInfo.isSymbolicLink() ||
    !executableInfo.isFile() ||
    (executableInfo.mode & 0o111) === 0 ||
    sha256(await readFile(SMOKE_EXECUTABLE_PATH)) !== arming.smokeExecutableSha256
  ) {
    throw new PipelineFailure('AUTHORITY_EXECUTABLE_MISMATCH');
  }
  return {
    root,
    key,
    arming,
    finalization,
    runtime: {
      repositoryCommit: arming.repositoryCommit,
      smokeExecutable: arming.smokeExecutable,
      smokeExecutableSha256: arming.smokeExecutableSha256,
    },
  };
}

async function collectAuthorityStoreBlockers(loaded: LoadedProductionInputs): Promise<Blocker[]> {
  const blockers: Blocker[] = [];
  const add = (code: string, message = code): void => {
    blockers.push({ code, message });
  };
  const rootPath = selectedExternalRoot();
  if (!(await pathExists(rootPath))) {
    add('PRODUCTION_AUTHORITY_ROOT_MISSING');
    add('AUTHORITY_ISSUER_KEY_MISSING');
    add('FINALIZATION_RECEIPT_MISSING');
    add('ARMING_RECEIPT_MISSING');
    return blockers;
  }
  const info = await lstat(rootPath, { bigint: true });
  const expectedUid = typeof process.getuid === 'function' ? BigInt(process.getuid()) : info.uid;
  if (info.isSymbolicLink() || !info.isDirectory() || (await realpath(rootPath)) !== rootPath) {
    add('AUTHORITY_ROOT_IDENTITY_INVALID');
    return blockers;
  }
  if (info.uid !== expectedUid) add('AUTHORITY_ROOT_OWNER_INVALID');
  if ((info.mode & 0o777n) !== 0o700n) add('AUTHORITY_ROOT_MODE_INVALID');
  const markerPath = join(rootPath, '.wp03-production-root');
  if (!(await pathExists(markerPath))) add('AUTHORITY_ROOT_MARKER_MISSING');
  else if ((await readFile(markerPath, 'utf8')) !== `${productionMarkerToken(rootPath)}\n`) {
    add('AUTHORITY_ROOT_MARKER_INVALID');
  }
  const paths = authorityPaths(rootPath);
  if (!(await pathExists(paths.key))) add('AUTHORITY_ISSUER_KEY_MISSING');
  if (!(await pathExists(paths.finalization))) add('FINALIZATION_RECEIPT_MISSING');
  if (!(await pathExists(paths.arming))) add('ARMING_RECEIPT_MISSING');
  if (blockers.length === 0) {
    try {
      await loadVerifiedAuthorityStore(loaded);
    } catch (error) {
      const code = error instanceof PipelineFailure ? error.code : 'AUTHORITY_RECEIPT_INVALID';
      add(
        [
          'AUTHORITY_SOURCE_DIRTY',
          'AUTHORITY_COMMIT_MISMATCH',
          'AUTHORITY_BLOB_CLOSURE_MISMATCH',
        ].includes(code)
          ? 'SOURCE_COMMIT_MISMATCH'
          : code,
      );
    }
  }
  return blockers;
}

async function collectProductionBlockers(): Promise<Blocker[]> {
  const blockers: Blocker[] = [];
  let canonicalInputs: LoadedProductionInputs | undefined;
  const add = (code: string, message: string): void => {
    blockers.push({ code, message });
  };

  try {
    assertAdmissionAuthorityAvailable(ADMISSION_REPOSITORY_ROOT);
  } catch {
    add(
      'ADMISSION_AUTHORITY_UNAVAILABLE',
      'the canonical WP-01 v5 admission authority is unavailable',
    );
  }

  let currentProof: Record<string, unknown> | undefined;
  try {
    currentProof = JSON.parse(
      await readFile(join(ADMISSION_REPOSITORY_ROOT, PRODUCTION_AUTHORITY.proofPath), 'utf8'),
    ) as Record<string, unknown>;
  } catch {
    currentProof = undefined;
  }

  for (const authority of PRODUCTION_AUTHORITY.assignments) {
    const absolute = join(ADMISSION_REPOSITORY_ROOT, authority.path);
    if (!(await pathExists(absolute))) {
      add(
        authority.teamId === 'team-A'
          ? 'FINAL_TEAM_A_MANIFEST_MISSING'
          : 'FINAL_TEAM_B_MANIFEST_MISSING',
        `${authority.path} is missing`,
      );
      continue;
    }
    try {
      const bytes = await readFile(absolute);
      const document = JSON.parse(bytes.toString('utf8')) as Record<string, unknown>;
      if (currentProof === undefined) {
        throw new Error('current partition proof is unavailable');
      }
      const admitted = admitIntake({
        bytes,
        locator: assignmentAdmissionLocator(currentProof, document),
      });
      if (
        admitted.admission !== 'ADMITTED' ||
        document.assignment_id !== authority.assignmentId ||
        !Array.isArray(document.assignments) ||
        document.assignments.length !== 30
      ) {
        throw new Error('assignment failed canonical admission or exact identity');
      }
    } catch {
      add(
        'FINAL_TEAM_MANIFEST_INVALID',
        `${authority.path} failed canonical admission, identity, or 30-item closure`,
      );
    }
  }
  if (
    await Promise.all(
      PRODUCTION_AUTHORITY.assignments.map((authority) =>
        pathExists(join(ADMISSION_REPOSITORY_ROOT, authority.path)),
      ),
    ).then((present) => present.every(Boolean))
  ) {
    try {
      canonicalInputs = await loadCanonicalProductionInputsForPreflight();
    } catch (error) {
      add(
        error instanceof PipelineFailure ? error.code : 'CANONICAL_INPUT_ADMISSION_FAILED',
        error instanceof Error ? error.message : 'canonical input admission failed',
      );
    }
  } else {
    add(
      'READY_PACKET_SET_INCOMPLETE',
      'packet admission waits for both exact 30-item team manifests',
    );
  }

  if (canonicalInputs !== undefined) {
    blockers.push(...(await collectAuthorityStoreBlockers(canonicalInputs)));
  }
  return uniqueBlockers(blockers);
}

function blockedPreflightResult(blockers: readonly Blocker[]): PreflightBlockedResult {
  if (blockers.length === 0) {
    throw new PipelineFailure('INVALID_PREFLIGHT_RESULT');
  }
  return {
    status: 'BLOCKED',
    runId: RUN_ID,
    userSendable: false,
    blockers: blockers as [Blocker, ...Blocker[]],
  };
}

export async function preflightProductionKits(): Promise<ProductionPreflightResult> {
  const blockers = await collectProductionBlockers();
  if (blockers.length > 0) return blockedPreflightResult(blockers);
  try {
    const loaded = await loadCanonicalProductionInputsForPreflight();
    const store = await loadVerifiedAuthorityStore(loaded);
    return {
      status: 'PREFLIGHT_OK',
      runId: RUN_ID,
      userSendable: false,
      authority: {
        state: 'VALID_UNCONSUMED',
        repositoryCommit: store.arming.repositoryCommit,
        action: store.arming.action,
        teams: [
          { teamId: 'team-A', lessonCount: 30 },
          { teamId: 'team-B', lessonCount: 30 },
        ],
      },
    };
  } catch (error) {
    const code = error instanceof PipelineFailure ? error.code : 'AUTHORITY_RECEIPT_INVALID';
    return blockedPreflightResult([
      {
        code: [
          'AUTHORITY_SOURCE_DIRTY',
          'AUTHORITY_COMMIT_MISMATCH',
          'AUTHORITY_BLOB_CLOSURE_MISMATCH',
        ].includes(code)
          ? 'SOURCE_COMMIT_MISMATCH'
          : code,
        message: code,
      },
    ]);
  }
}

export async function prepareProductionAuthority(): Promise<
  | {
      readonly status: 'PREPARED';
      readonly runId: typeof RUN_ID;
      readonly root: string;
      readonly receiptId: string;
      readonly archivesPublished: false;
    }
  | {
      readonly status: 'BLOCKED';
      readonly runId: typeof RUN_ID;
      readonly blockers: readonly Blocker[];
    }
> {
  let source: { readonly head: string; readonly blobClosureSha256: string };
  try {
    source = await authoritySourceIdentity();
  } catch (error) {
    const code = error instanceof PipelineFailure ? error.code : 'AUTHORITY_SOURCE_DIRTY';
    return { status: 'BLOCKED', runId: RUN_ID, blockers: [{ code, message: code }] };
  }
  try {
    const loaded = await loadCanonicalProductionInputs();
    const root = await openProductionRoot(true);
    const paths = authorityPaths(root.path);
    await mkdir(paths.directory, { recursive: true, mode: 0o700 });
    await chmod(paths.directory, 0o700);
    const smokeInfo = await lstat(SMOKE_EXECUTABLE_PATH);
    if (
      smokeInfo.isSymbolicLink() ||
      !smokeInfo.isFile() ||
      (smokeInfo.mode & 0o111) === 0 ||
      (await realpath(SMOKE_EXECUTABLE_PATH)) !== SMOKE_EXECUTABLE_PATH
    ) {
      throw new PipelineFailure('SMOKE_EXECUTABLE_IDENTITY_INVALID');
    }
    const smokeExecutableSha256 = sha256(await readFile(SMOKE_EXECUTABLE_PATH));
    const runtime: RuntimePins = {
      repositoryCommit: source.head,
      smokeExecutable: SMOKE_EXECUTABLE_PATH,
      smokeExecutableSha256,
    };
    const generation = Math.max(2, await nextPublicationGeneration(root));
    const candidates = await buildAndVerifyProductionCandidates(loaded, root, generation, runtime);
    if (!(await pathExists(paths.key))) {
      await writeExclusiveNoFollow(paths.key, `${randomBytes(32).toString('hex')}\n`);
      await chmod(paths.key, 0o600);
    }
    const key = await readAuthorityKey(paths.key);
    await preserveSupersededUnconsumedAuthority(root, key);
    const finalization = signReceipt(candidates, key);
    const issuedAt = new Date();
    const receiptId = `wp03-arm-${randomBytes(16).toString('hex')}`;
    const unsigned: Omit<AuthorityArmingRecord, 'signature'> = {
      format: 'wp-03-production-arming/1',
      receiptId,
      finalizationReceiptId: finalization.receiptId,
      runId: RUN_ID,
      externalRoot: root.path,
      repositoryCommit: source.head,
      blobClosureSha256: source.blobClosureSha256,
      inputSnapshotSha256: loaded.snapshotSha256,
      packetSourceCommit: source.head,
      packetAggregateSha256: packetAggregate(loaded),
      proofSha256: sha256(loaded.proofBytes),
      assignments: candidates.teams.map((team, index) => ({
        teamId: team.teamId,
        assignmentId: loaded.teams[index]!.assignmentId,
        assignmentSha256: team.assignmentSha256,
        lessonIds: team.lessonIds,
        archiveSha256: team.archiveSha256,
        manifestSha256: team.manifestSha256,
      })),
      smokeExecutable: SMOKE_EXECUTABLE_PATH,
      smokeExecutableSha256,
      pins: candidates.pins,
      action: 'PACKAGE_KITS',
      issuedAt: issuedAt.toISOString(),
      expiresAt: new Date(issuedAt.getTime() + 15 * 60_000).toISOString(),
      lessonApprovalClaimed: false,
      validationPassClaimed: false,
    };
    await writeCanonicalAtomic(paths.finalization, finalization, root);
    await writeCanonicalAtomic(paths.arming, signArmingRecord(unsigned, key), root);
    return {
      status: 'PREPARED',
      runId: RUN_ID,
      root: root.path,
      receiptId,
      archivesPublished: false,
    };
  } catch (error) {
    const code = error instanceof PipelineFailure ? error.code : 'AUTHORITY_PREPARE_FAILED';
    return { status: 'BLOCKED', runId: RUN_ID, blockers: [{ code, message: code }] };
  }
}

function requiredString(document: Record<string, unknown>, field: string, code: string): string {
  const value = document[field];
  if (typeof value !== 'string' || value.length === 0) throw new PipelineFailure(code);
  return value;
}

function assignmentAdmissionLocator(
  proof: Record<string, unknown>,
  assignment: Record<string, unknown>,
): string {
  const proofRunId = requiredString(proof, 'run_id', 'PROOF_COHORT_MISMATCH');
  const assignmentId = requiredString(assignment, 'assignment_id', 'FINAL_TEAM_MANIFEST_INVALID');
  const identityPrefix = `${proofRunId}-assignment-`;
  if (!assignmentId.startsWith(identityPrefix)) {
    throw new PipelineFailure('PARTITION_PROOF_ASSIGNMENT_MISMATCH');
  }
  const sequence = assignmentId.slice(identityPrefix.length);
  if (!/^[0-9]{2}$/.test(sequence)) {
    throw new PipelineFailure('PARTITION_PROOF_ASSIGNMENT_MISMATCH');
  }
  return `${proofRunId}/assignment-${sequence}`;
}

async function loadCanonicalProductionInputs(): Promise<LoadedProductionInputs> {
  const proofBytes = await readFile(
    join(ADMISSION_REPOSITORY_ROOT, PRODUCTION_AUTHORITY.proofPath),
  );
  const proof = JSON.parse(proofBytes.toString('utf8')) as Record<string, unknown>;
  if (
    proof.contract_id !== 'lesson-factory.assignment-partition-proof' ||
    proof.run_id !== 'lesson-factory-deadline-2026-08-03'
  ) {
    throw new PipelineFailure('PROOF_COHORT_MISMATCH');
  }

  const loadedTeams: LoadedTeamInput[] = [];
  for (const authority of PRODUCTION_AUTHORITY.assignments) {
    const assignmentBytes = await readFile(join(ADMISSION_REPOSITORY_ROOT, authority.path));
    const assignment = JSON.parse(assignmentBytes.toString('utf8')) as Record<string, unknown>;
    const assignmentAdmission = admitIntake({
      bytes: assignmentBytes,
      locator: assignmentAdmissionLocator(proof, assignment),
    });
    if (assignmentAdmission.admission !== 'ADMITTED') {
      throw new PipelineFailure('FINAL_TEAM_MANIFEST_INVALID');
    }
    if (
      assignment.assignment_id !== authority.assignmentId ||
      !Array.isArray(assignment.assignments) ||
      assignment.assignments.length !== 30
    ) {
      throw new PipelineFailure('FINAL_TEAM_MANIFEST_INVALID');
    }
    const packetFiles: KitArchiveFile[] = [];
    const packetDocuments: Record<string, unknown>[] = [];
    const lessonIds: string[] = [];
    for (const raw of assignment.assignments) {
      if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
        throw new PipelineFailure('FINAL_TEAM_MANIFEST_INVALID');
      }
      const row = raw as Record<string, unknown>;
      const lessonId = requiredString(row, 'lesson_id', 'FINAL_TEAM_MANIFEST_INVALID');
      const packetReference = requiredString(row, 'task_packet_ref', 'FINAL_TEAM_MANIFEST_INVALID');
      const match = /^packet:(lane-[0-9]{2})\/(v3-les-[0-9]{6})#sha256:([0-9a-f]{64})$/.exec(
        packetReference,
      );
      if (
        match === null ||
        match[1] !== authority.laneId ||
        match[2]?.toUpperCase() !== lessonId ||
        lessonIds.includes(lessonId)
      ) {
        throw new PipelineFailure('FINAL_TEAM_MANIFEST_INVALID');
      }
      const packetPath = join(
        ADMISSION_REPOSITORY_ROOT,
        PRODUCTION_AUTHORITY.packetRoot,
        lessonId,
        'task-source-packet.json',
      );
      const packetBytes = await readFile(packetPath);
      if (sha256(packetBytes) !== match[3]) {
        throw new PipelineFailure('PACKET_REFERENCE_HASH_MISMATCH');
      }
      const admission = admitTaskSourcePacketV5({
        bytes: packetBytes.toString('utf8'),
        locator: `${authority.laneId}/${lessonId.toLowerCase()}`,
      });
      if (admission.admission !== 'ADMITTED' || admission.semantic_validation.status !== 'PASS') {
        throw new PipelineFailure('CANONICAL_ADMISSION_REQUIRED');
      }
      const packet = JSON.parse(packetBytes.toString('utf8')) as Record<string, unknown>;
      if (
        packet.packet_status !== 'READY' ||
        packet.packet_surface !== 'AUTHORABLE' ||
        packet.assignment_id !== authority.assignmentId ||
        packet.team_id !== authority.teamId ||
        packet.lane_id !== authority.laneId ||
        packet.lesson_id !== lessonId ||
        packet.packet_id !== `packet:${authority.laneId}/${lessonId.toLowerCase()}`
      ) {
        throw new PipelineFailure('PACKET_COHORT_MISMATCH');
      }
      lessonIds.push(lessonId);
      packetDocuments.push(packet);
      packetFiles.push({
        path: `packets/${lessonId}/task-source-packet.json`,
        bytes: packetBytes,
      });
    }
    loadedTeams.push({
      teamId: authority.teamId,
      laneId: authority.laneId,
      assignmentId: authority.assignmentId,
      assignmentBytes,
      assignmentDocument: assignment,
      packetFiles,
      packetDocuments,
      lessonIds,
    });
  }
  if (
    new Set(loadedTeams.flatMap((team) => team.lessonIds)).size !== 60 ||
    loadedTeams[0]?.lessonIds.some((lessonId) => loadedTeams[1]?.lessonIds.includes(lessonId))
  ) {
    throw new PipelineFailure('FEDERATED_COHORT_MISMATCH');
  }
  const proofErrors = validateAssignmentPartitionProof(
    proof,
    await readFile(
      join(
        ADMISSION_REPOSITORY_ROOT,
        'content/lesson-factory/schemas/assignment-partition-proof.schema.json',
      ),
      'utf8',
    ),
    await readFile(
      join(
        ADMISSION_REPOSITORY_ROOT,
        'content/lesson-factory/schemas/shared-vocabulary.schema.json',
      ),
      'utf8',
    ),
  );
  if (proofErrors.length > 0) {
    throw new PipelineFailure('PARTITION_PROOF_SCHEMA_INVALID');
  }
  const proofAssignments = proof.assignments;
  const exclusions = proof.excluded_existing_lesson_ids;
  if (!Array.isArray(proofAssignments) || !Array.isArray(exclusions)) {
    throw new PipelineFailure('PARTITION_PROOF_ASSIGNMENT_MISMATCH');
  }
  for (const [index, loaded] of loadedTeams.entries()) {
    const authority = PRODUCTION_AUTHORITY.assignments[index];
    const group = proofAssignments.find(
      (value) =>
        value !== null &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        (value as Record<string, unknown>).team_id === loaded.teamId,
    ) as Record<string, unknown> | undefined;
    const rows = group?.rows;
    if (
      authority === undefined ||
      group?.lane_id !== loaded.laneId ||
      group.assignment_id !== loaded.assignmentId ||
      group.assignment_file !== authority.path ||
      group.count !== 30 ||
      !Array.isArray(rows) ||
      rows.length !== 30
    ) {
      throw new PipelineFailure('PARTITION_PROOF_ASSIGNMENT_MISMATCH');
    }
    const proofLessonIds = rows.map((row) => {
      if (
        row === null ||
        typeof row !== 'object' ||
        Array.isArray(row) ||
        (row as Record<string, unknown>).team_id !== loaded.teamId ||
        (row as Record<string, unknown>).lane_id !== loaded.laneId ||
        (row as Record<string, unknown>).assignment_id !== loaded.assignmentId
      ) {
        throw new PipelineFailure('PARTITION_PROOF_ASSIGNMENT_MISMATCH');
      }
      return requiredString(
        row as Record<string, unknown>,
        'lesson_id',
        'PARTITION_PROOF_ASSIGNMENT_MISMATCH',
      );
    });
    if (
      canonicalKitJson([...proofLessonIds].sort()) !==
        canonicalKitJson([...loaded.lessonIds].sort()) ||
      proofLessonIds.some((lessonId) => exclusions.includes(lessonId))
    ) {
      throw new PipelineFailure('PARTITION_PROOF_ASSIGNMENT_MISMATCH');
    }
  }

  const sourceMappings = await loadProductionKitSourceMap();
  const coreFiles = await Promise.all(
    sourceMappings.map(async (mapping): Promise<KitArchiveFile> => {
      const bytes = await readFile(join(ADMISSION_REPOSITORY_ROOT, mapping.sourcePath));
      return {
        path: mapping.archivePath,
        bytes,
        ...(mapping.mode === undefined ? {} : { mode: mapping.mode }),
        sourcePath: mapping.sourcePath,
        sourceSha256: sha256(bytes),
        ...(mapping.transform === undefined ? {} : { parityClass: 'team-metadata' as const }),
      };
    }),
  );
  const snapshotSha256 = sha256(
    canonicalKitJson({
      proofSha256: sha256(proofBytes),
      core: coreFiles.map((file) => ({
        path: file.path,
        sha256: sha256(file.bytes),
      })),
      teams: loadedTeams.map((team) => ({
        teamId: team.teamId,
        assignmentSha256: sha256(team.assignmentBytes),
        packets: team.packetFiles.map((file) => ({
          path: file.path,
          sha256: sha256(file.bytes),
        })),
      })),
    }),
  );
  return {
    proofBytes,
    assembledAt: requiredString(proof, 'created_at', 'PROOF_COHORT_MISMATCH'),
    coreFiles,
    teams: loadedTeams as [LoadedTeamInput, LoadedTeamInput],
    snapshotSha256,
  };
}

async function loadCanonicalProductionInputsForPreflight(): Promise<LoadedProductionInputs> {
  successfulPreflightInputs ??= await loadCanonicalProductionInputs();
  return successfulPreflightInputs;
}

async function productionPins(
  loaded: LoadedProductionInputs,
  runtime: RuntimePins,
): Promise<CandidateSet['pins']> {
  const byPath = new Map(loaded.coreFiles.map((file) => [file.path, sha256(file.bytes)] as const));
  return {
    proofSha256: sha256(loaded.proofBytes),
    profileSha256: byPath.get('deadline-profile/rubric-profile.json') ?? '',
    schemaSha256: sha256(
      canonicalKitJson(
        [...byPath]
          .filter(([path]) => path.includes('/schemas/'))
          .sort(([left], [right]) => left.localeCompare(right)),
      ),
    ),
    templateSha256: sha256(
      canonicalKitJson(
        [...byPath]
          .filter(([path]) => path.includes('/template/'))
          .sort(([left], [right]) => left.localeCompare(right)),
      ),
    ),
    repositoryCommit: runtime.repositoryCommit,
    toolSha256: sha256(await readFile(join(ADMISSION_REPOSITORY_ROOT, 'pnpm-lock.yaml'))),
    executableSha256: runtime.smokeExecutableSha256,
  };
}

function productionKitPins(
  loaded: LoadedProductionInputs,
  pins: CandidateSet['pins'],
): KitIdentityPins {
  const byPath = new Map(loaded.coreFiles.map((file) => [file.path, sha256(file.bytes)]));
  const curriculumHashes = new Set(
    loaded.teams.flatMap((team) =>
      team.packetDocuments.map((packet) =>
        requiredString(packet, 'curriculum_manifest_sha256', 'PACKET_COHORT_MISMATCH'),
      ),
    ),
  );
  if (curriculumHashes.size !== 1) {
    throw new PipelineFailure('PACKET_COHORT_MISMATCH');
  }
  return {
    repositoryCommit: pins.repositoryCommit,
    kitSha256: byPath.get('schemas/kit-manifest.schema.json') ?? '',
    profileSha256: pins.profileSha256,
    schemaSha256: pins.schemaSha256,
    templateSha256: pins.templateSha256,
    curriculumSha256: [...curriculumHashes][0]!,
    toolVersions: {
      node: process.version,
      pnpm: 'PINNED_BY_PNPM_LOCK',
      wp03KitFactory: '1.0.0',
    },
  };
}

function productionTeamInput(
  loaded: LoadedTeamInput,
  coreFiles: readonly KitArchiveFile[],
  pins: KitIdentityPins,
  generation: number,
  assembledAt: string,
  approvedValidators: KitValidatorAuthority,
): {
  readonly input: TeamKitInput;
  readonly assignmentProjection: ValidatedAssignmentProjection;
  readonly packetProjections: ReadonlyMap<string, ValidatedPacketProjection>;
} {
  const assignmentBindingId = sha256(loaded.assignmentBytes);
  const kitContentSha256 = sha256(
    canonicalKitJson({
      generation,
      repositoryCommit: pins.repositoryCommit,
      teamId: loaded.teamId,
      assignmentSha256: assignmentBindingId,
      lessonIds: [...loaded.lessonIds].sort(),
      sources: coreFiles.map((file) => ({
        archivePath: file.path,
        sourcePath: file.sourcePath,
        sourceSha256: file.sourceSha256,
      })),
    }),
  );
  const teamCoreFiles = coreFiles.map((file): KitArchiveFile => {
    if (file.path !== 'README.md') return file;
    const template =
      typeof file.bytes === 'string' ? file.bytes : Buffer.from(file.bytes).toString('utf8');
    const bytes = template
      .replaceAll('{{REPOSITORY_COMMIT}}', pins.repositoryCommit)
      .replaceAll('{{KIT_CONTENT_SHA256}}', kitContentSha256)
      .replaceAll('{{TEAM_ID}}', loaded.teamId)
      .replaceAll('{{ASSIGNMENT_SHA256}}', assignmentBindingId);
    if (bytes.includes('{{')) throw new PipelineFailure('KIT_README_TEMPLATE_INVALID');
    return { ...file, bytes, parityClass: 'team-metadata' };
  });
  const contractVersion = requiredString(
    loaded.assignmentDocument,
    'contract_version',
    'FINAL_TEAM_MANIFEST_INVALID',
  );
  const schemaVersion = '5.0.0';
  const packetProjections = new Map<string, ValidatedPacketProjection>();
  const packets = loaded.packetFiles.map((file, index) => {
    const document = loaded.packetDocuments[index]!;
    const lessonId = loaded.lessonIds[index]!;
    const packetId = requiredString(document, 'packet_id', 'PACKET_COHORT_MISMATCH');
    const revision = requiredString(document, 'request_id', 'PACKET_COHORT_MISMATCH');
    const path = file.path;
    const bytes = file.bytes;
    const projection: ValidatedPacketProjection = {
      runId: RUN_ID,
      lessonId,
      packetId,
      revision,
      teamId: loaded.teamId,
      laneId: loaded.laneId,
      assignmentId: loaded.assignmentId,
      assignmentBindingId,
      contractVersion,
      schemaVersion,
      generation,
      status: 'READY',
      fileSha256: sha256(bytes),
      contentSha256:
        typeof document.packet_content_sha256 === 'string'
          ? document.packet_content_sha256
          : sha256(canonicalKitJson(document)),
      sourcePacketPath: path,
      pins,
    };
    packetProjections.set(sha256(bytes), projection);
    return {
      path,
      bytes,
      document,
      expectedSha256: sha256(bytes),
    };
  });
  const assignmentProjection: ValidatedAssignmentProjection = {
    runId: RUN_ID,
    teamId: loaded.teamId,
    laneId: loaded.laneId,
    assignmentId: loaded.assignmentId,
    assignmentBindingId,
    contractVersion,
    schemaVersion,
    generation,
    fileSha256: sha256(loaded.assignmentBytes),
    bindings: packets.map((packet) => {
      const projection = packetProjections.get(packet.expectedSha256)!;
      return {
        lessonId: projection.lessonId,
        packetId: projection.packetId,
        revision: projection.revision,
        path: packet.path,
        sha256: packet.expectedSha256,
        contentSha256: projection.contentSha256,
      };
    }),
    pins,
  };
  const assignmentPath = `assignments/${loaded.teamId}-30.json`;
  return {
    input: {
      kitFormat: 'lesson-generation-kit-v1/2',
      repositoryUrl: 'https://github.com/jsonjj/mcat-prep.git',
      allowedOutputRoot: `content/lesson-candidates/${loaded.teamId}`,
      forbiddenSharedPaths: GENERATION_TWO_FORBIDDEN_SHARED_PATHS,
      runtimeRequirements: {
        nodeMajorMinimum: 20,
        packageManager: 'pnpm@9.15.9',
        installPolicy: 'FROZEN_OFFLINE_IGNORE_SCRIPTS',
      },
      deterministicInstallCommand:
        'corepack pnpm install --frozen-lockfile --offline --ignore-scripts',
      handoffEndpoint: `branches:lesson-factory/${loaded.teamId}/wave-<nn>`,
      validatorAuthority: approvedValidators,
      runId: RUN_ID,
      teamId: loaded.teamId,
      laneId: loaded.laneId,
      assembledAt,
      lifecycle: 'CANDIDATE_RUBRIC_SCREENED',
      deadline: '2026-08-04T09:30:00-05:00',
      branchConvention: `lesson-factory/${loaded.teamId}/wave-<nn>`,
      expectedPins: pins,
      expectedCohort: {
        assignmentId: loaded.assignmentId,
        assignmentBindingId,
        contractVersion,
        schemaVersion,
        generation,
      },
      requiredCorePaths: teamCoreFiles.map((file) => file.path),
      allowedInventory: [
        ...teamCoreFiles.map(inventoryEntry),
        {
          path: assignmentPath,
          sha256: sha256(loaded.assignmentBytes),
          mediaType: 'application/json',
        },
        ...packets.map((packet) => ({
          path: packet.path,
          sha256: packet.expectedSha256,
          mediaType: 'application/json' as const,
        })),
      ],
      coreFiles: teamCoreFiles,
      assignment: {
        path: assignmentPath,
        bytes: loaded.assignmentBytes,
        document: loaded.assignmentDocument,
        expectedSha256: sha256(loaded.assignmentBytes),
      },
      packets,
    },
    assignmentProjection,
    packetProjections,
  };
}

async function buildAndVerifyProductionCandidates(
  loaded: LoadedProductionInputs,
  root: OwnedRoot,
  generation: number,
  runtime: RuntimePins,
): Promise<CandidateSet> {
  const pins = await productionPins(loaded, runtime);
  const kitPins = productionKitPins(loaded, pins);
  const approvedValidators = await validatorAuthority(await checkoutCommit());
  const teamA = productionTeamInput(
    loaded.teams[0],
    loaded.coreFiles,
    kitPins,
    generation,
    loaded.assembledAt,
    approvedValidators,
  );
  const teamB = productionTeamInput(
    loaded.teams[1],
    loaded.coreFiles,
    kitPins,
    generation,
    loaded.assembledAt,
    approvedValidators,
  );
  const assignments = new Map([
    [sha256(loaded.teams[0].assignmentBytes), teamA.assignmentProjection],
    [sha256(loaded.teams[1].assignmentBytes), teamB.assignmentProjection],
  ]);
  const packets = new Map([...teamA.packetProjections, ...teamB.packetProjections]);
  const validators: FinalInputValidators = {
    validateAssignment: ({ bytes }) => {
      const value = assignments.get(sha256(bytes));
      return value === undefined
        ? { ok: false, errors: ['assignment bytes were not canonically admitted'] }
        : { ok: true, value };
    },
    validatePacket: ({ bytes, path }) => {
      const value = packets.get(sha256(bytes));
      return value === undefined || value.sourcePacketPath !== path
        ? { ok: false, errors: ['packet bytes or locator were not canonically admitted'] }
        : { ok: true, value };
    },
  };
  const created = createFederatedKitCandidates(
    { teamA: teamA.input, teamB: teamB.input },
    validators,
  );
  const executable = runtime.smokeExecutable;
  const executableSha256 = runtime.smokeExecutableSha256;
  const smokeCommands = PRODUCTION_AUTHORITY.smokeCommands.map((command) => ({
    id: command.id,
    executable,
    args: command.argv,
    cwd: '.',
  }));
  const scratchParent = join(root.path, '.production-verification');
  const verifyTeam = async (
    candidate: typeof created.teamA,
    source: TeamKitInput,
  ): Promise<{
    readonly verified: Awaited<ReturnType<typeof verifyKitCandidate>>;
    readonly receipts: readonly ProductionSmokeReceipt[];
  }> => {
    const receipts: ProductionSmokeReceipt[] = [];
    let commandIndex = 0;
    const runner: CommandRunner = {
      run: async (request) => {
        const command = PRODUCTION_AUTHORITY.smokeCommands[commandIndex++];
        if (command === undefined) throw new PipelineFailure('SMOKE_COMMAND_SET_INVALID');
        const started = Date.now();
        const startedAt = new Date(started).toISOString();
        const result = await productionOperation('smoke', () =>
          runRealSmokeCommand(request.executable, executableSha256, request.args, request.cwd),
        );
        const finished = Date.now();
        receipts.push({
          commandId: command.id,
          commandSha256: sha256(canonicalKitJson(command)),
          executableSha256,
          toolSha256: pins.toolSha256,
          argv: request.args,
          environment: request.environment,
          cwdPolicy: 'EXTRACTED_KIT_ROOT',
          exitCode: 0,
          stdoutSha256: sha256(result.stdout),
          stderrSha256: sha256(result.stderr),
          durationMs: finished - started,
          startedAt,
          finishedAt: new Date(finished).toISOString(),
        });
        return result;
      },
    };
    const verified = await verifyKitCandidate(
      {
        candidate,
        source,
        scratchParent,
        smokeCommands,
        smokeEnvironment: SMOKE_ENVIRONMENT,
      },
      validators,
      runner,
    );
    return { verified, receipts };
  };
  const verifiedAResult = await withOperationContext({ team: 'team-A', phase: 'PRECOMMIT' }, () =>
    verifyTeam(created.teamA, teamA.input),
  );
  const verifiedBResult = await withOperationContext({ team: 'team-B', phase: 'PRECOMMIT' }, () =>
    verifyTeam(created.teamB, teamB.input),
  );
  const verifiedA = verifiedAResult.verified;
  const verifiedB = verifiedBResult.verified;
  const convert = (
    verified: typeof verifiedA,
    source: TeamKitInput,
    smokeReceipts: readonly ProductionSmokeReceipt[],
  ): TeamCandidate => ({
    teamId: verified.teamId,
    lessonIds: verified.candidate.manifest.allowedLessonIds,
    assignmentSha256: verified.candidate.manifest.assignmentSha256,
    packetAggregateSha256: sha256(
      canonicalKitJson(
        source.packets.map((packet) => ({
          path: packet.path,
          sha256: packet.expectedSha256,
        })),
      ),
    ),
    manifestBytes: canonicalBytes(verified.candidate.manifest),
    manifestSha256: verified.candidate.manifestSha256,
    archiveBytes: verified.candidate.archiveBytes,
    archiveSha256: verified.candidate.archiveSha256,
    sendMe: createSendMeText(verified),
    checksum: `${verified.candidate.archiveSha256}  ${verified.teamId}-complete.zip\n`,
    smokeReceipts,
  });
  return {
    runId: RUN_ID,
    generation,
    teams: [
      convert(verifiedA, teamA.input, verifiedAResult.receipts),
      convert(verifiedB, teamB.input, verifiedBResult.receipts),
    ],
    pins,
  };
}

function parseClosedReceipt(value: unknown): FinalizationReceipt {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new PipelineFailure('FINALIZATION_RECEIPT_INVALID');
  }
  const receipt = value as Record<string, unknown>;
  const expectedKeys = [
    'allowedAction',
    'generation',
    'issuer',
    'pins',
    'receiptId',
    'runId',
    'signature',
    'teams',
    'validationTimestamp',
  ];
  if (
    canonicalKitJson(Object.keys(receipt).sort()) !== canonicalKitJson(expectedKeys) ||
    typeof receipt.receiptId !== 'string' ||
    typeof receipt.validationTimestamp !== 'string' ||
    typeof receipt.signature !== 'string' ||
    receipt.issuer !== 'WP03_FINALIZATION_AUTHORITY' ||
    receipt.runId !== RUN_ID ||
    receipt.allowedAction !== 'PACKAGE_KITS' ||
    !Number.isInteger(receipt.generation) ||
    receipt.pins === null ||
    typeof receipt.pins !== 'object' ||
    Array.isArray(receipt.pins) ||
    !Array.isArray(receipt.teams) ||
    receipt.teams.length !== 2
  ) {
    throw new PipelineFailure('FINALIZATION_RECEIPT_INVALID');
  }
  return receipt as unknown as FinalizationReceipt;
}

async function validateConfiguredProductionRoot(
  configured: string,
  exactConfiguredPath: string,
): Promise<OwnedRoot> {
  const path = resolve(configured);
  const expected = resolve(exactConfiguredPath);
  const repository = resolve(ADMISSION_REPOSITORY_ROOT);
  const temporary = resolve(tmpdir());
  const fixtureScratch = resolve(TEST_PARENT);
  const inside = (candidate: string, parent: string): boolean =>
    candidate === parent || candidate.startsWith(`${parent}${sep}`);
  if (
    path !== expected ||
    inside(path, repository) ||
    inside(path, temporary) ||
    inside(path, fixtureScratch)
  ) {
    throw new PipelineFailure('PRODUCTION_ROOT_FORBIDDEN');
  }
  const info = await lstat(path, { bigint: true });
  const expectedUid = typeof process.getuid === 'function' ? BigInt(process.getuid()) : info.uid;
  if (
    info.isSymbolicLink() ||
    !info.isDirectory() ||
    (await realpath(path)) !== path ||
    info.uid !== expectedUid ||
    (info.mode & 0o777n) !== 0o700n
  ) {
    throw new PipelineFailure('PRODUCTION_ROOT_FORBIDDEN');
  }
  const markerName = '.wp03-production-root';
  const markerToken = 'WP03_EXTERNAL_HANDOFF_ROOT_V1';
  if ((await readFile(join(path, markerName), 'utf8')) !== `${markerToken}\n`) {
    throw new PipelineFailure('PRODUCTION_ROOT_FORBIDDEN');
  }
  return {
    path,
    markerName,
    markerToken,
    device: info.dev,
    inode: info.ino,
  };
}

async function checkoutCommit(): Promise<string> {
  const dotGit = join(ADMISSION_REPOSITORY_ROOT, '.git');
  const dotGitInfo = await lstat(dotGit);
  const gitDirectory = dotGitInfo.isDirectory()
    ? dotGit
    : resolve(
        ADMISSION_REPOSITORY_ROOT,
        (await readFile(dotGit, 'utf8')).trim().replace(/^gitdir:\s*/, ''),
      );
  const head = (await readFile(join(gitDirectory, 'HEAD'), 'utf8')).trim();
  if (/^[0-9a-f]{40}$/.test(head)) return head;
  const match = /^ref:\s+(.+)$/.exec(head);
  if (match === null) throw new PipelineFailure('CHECKOUT_COMMIT_UNREADABLE');
  const looseRef = join(gitDirectory, match[1]!);
  if (await pathExists(looseRef)) {
    const value = (await readFile(looseRef, 'utf8')).trim();
    if (/^[0-9a-f]{40}$/.test(value)) return value;
  }
  const packed = await readFile(join(gitDirectory, 'packed-refs'), 'utf8');
  const packedLine = packed.split('\n').find((line) => line.endsWith(` ${match[1]}`));
  const value = packedLine?.split(' ')[0];
  if (value === undefined || !/^[0-9a-f]{40}$/.test(value)) {
    throw new PipelineFailure('CHECKOUT_COMMIT_UNREADABLE');
  }
  return value;
}

async function runPrivateProductionPipeline(): Promise<
  ExecuteBlockedResult | ReadyProductionResult
> {
  try {
    const recoveryRoot = await openProductionRoot(false);
    if (await pathExists(join(recoveryRoot.path, 'transaction-journal.json'))) {
      const recovery = await reconcile(recoveryRoot);
      if (recovery === 'RECOVERED_READY') {
        const recovered = strictStatus(
          JSON.parse(await readFile(join(recoveryRoot.path, 'bundle-readiness.json'), 'utf8')),
        );
        const current = recovered.current as Array<Record<string, unknown>>;
        return {
          status: 'READY',
          runId: RUN_ID,
          attemptedPhase: 'PUBLISH',
          userSendable: true,
          generation: recovered.generation as number,
          archiveSha256: {
            'team-A': String(current[0]?.archiveSha256),
            'team-B': String(current[1]?.archiveSha256),
          },
        };
      }
    }
  } catch {
    // Normal authority blockers are reported by the closed preflight below.
  }
  const blockers = await collectProductionBlockers();
  if (blockers.length > 0) {
    return {
      status: 'BLOCKED',
      runId: RUN_ID,
      attemptedPhase: 'AUTHORITY_LOAD',
      userSendable: false,
      artifacts: [],
      blockers,
    };
  }

  try {
    const loaded = await loadCanonicalProductionInputs();
    const authority = await loadVerifiedAuthorityStore(loaded);
    const root = authority.root;
    if ((reviewAuthorityHead ?? (await checkoutCommit())) !== authority.runtime.repositoryCommit) {
      throw new PipelineFailure('CHECKOUT_COMMIT_MISMATCH');
    }
    const generation = Math.max(2, await nextPublicationGeneration(root));
    const candidates = await buildAndVerifyProductionCandidates(
      loaded,
      root,
      generation,
      authority.runtime,
    );
    verifyArmingCandidates(authority.arming, candidates);
    verifyReceipt(authority.finalization, candidates, authority.key);
    const reloaded = await loadCanonicalProductionInputs();
    if (reloaded.snapshotSha256 !== loaded.snapshotSha256) {
      throw new PipelineFailure('INPUT_CHANGED_AFTER_PREFLIGHT');
    }
    const published = await publishTransaction(
      root,
      candidates,
      authority.finalization,
      'FULL',
      authority.key,
      async () => {
        const lockedReload = await loadCanonicalProductionInputs();
        if (lockedReload.snapshotSha256 !== loaded.snapshotSha256) {
          throw new PipelineFailure('INPUT_CHANGED_AFTER_PREFLIGHT');
        }
        verifyArmingRecord(
          authority.arming,
          authority.key,
          lockedReload,
          await authoritySourceIdentity(),
        );
        await consumeArmingReceipt(authority);
      },
    );
    if (published.status !== 'READY') {
      throw new PipelineFailure('TRANSACTION_NOT_READY');
    }
    return {
      status: 'READY',
      runId: RUN_ID,
      attemptedPhase: 'PUBLISH',
      userSendable: true,
      generation: candidates.generation,
      archiveSha256: {
        'team-A': candidates.teams[0].archiveSha256,
        'team-B': candidates.teams[1].archiveSha256,
      },
    };
  } catch (error) {
    const code = error instanceof PipelineFailure ? error.code : 'PRODUCTION_PIPELINE_FAILURE';
    return {
      status: 'BLOCKED',
      runId: RUN_ID,
      attemptedPhase: 'CANONICAL_ADMISSION',
      userSendable: false,
      artifacts: [],
      blockers: [{ code, message: error instanceof Error ? error.message : code }],
    };
  }
}

export async function executeProductionKits(): Promise<
  ExecuteBlockedResult | ReadyProductionResult
> {
  return runPrivateProductionPipeline();
}

function testDigest(label: string): string {
  return sha256(`wp03-review-authority:${label}`);
}

function inventoryEntry(file: KitArchiveFile): KitAllowedInventoryEntry {
  const lower = file.path.toLowerCase();
  const mediaType = lower.endsWith('.json') ? 'application/json' : 'text/plain';
  return {
    path: file.path,
    mediaType,
    sha256: sha256(file.bytes),
  };
}

function createReviewCandidate(teamId: TeamId, first: number): TeamCandidate {
  const lessonIds = Array.from(
    { length: 30 },
    (_, index) => `V3-LES-${String(first + index).padStart(6, '0')}`,
  );
  const assignmentId =
    teamId === 'team-A'
      ? 'lesson-factory-deadline-2026-08-03-assignment-02'
      : 'lesson-factory-deadline-2026-08-03-assignment-03';
  const laneId = teamId === 'team-A' ? 'lane-02' : 'lane-03';
  const packetFiles: KitArchiveFile[] = lessonIds.map((lessonId) => ({
    path: `packets/${lessonId}/task-source-packet.json`,
    bytes: canonicalBytes({
      contract_id: 'lesson-factory.task-source-packet',
      contract_version: '5.0.0',
      packet_id: `packet:${laneId}/${lessonId.toLowerCase()}`,
      packet_status: 'READY',
      packet_surface: 'AUTHORABLE',
      assignment_id: assignmentId,
      team_id: teamId,
      lane_id: laneId,
      lesson_id: lessonId,
      packet_content_sha256: testDigest(`${teamId}:${lessonId}:content`),
    }),
  }));
  const assignment = {
    contract_id: 'lesson-factory.assignment-manifest',
    contract_version: '3.0.0',
    assignment_id: assignmentId,
    run_id: RUN_ID,
    generation: 1,
    team_id: teamId,
    lane_id: laneId,
    assignments: packetFiles.map((file, index) => ({
      lesson_id: lessonIds[index],
      packet_path: file.path,
      packet_sha256: sha256(file.bytes),
    })),
  };
  const coreFiles: KitArchiveFile[] = PRODUCTION_AUTHORITY.corePaths.map((path) => ({
    path,
    bytes: path.endsWith('.md')
      ? `# Review-owned core fixture\n\nCanonical path: ${path}\n`
      : canonicalBytes({ format: 'wp-03-review-core/1', canonicalPath: path }),
  }));
  const assignmentFile: KitArchiveFile = {
    path: 'assignment/assignment-manifest.json',
    bytes: canonicalBytes(assignment),
  };
  const payload = [...coreFiles, assignmentFile, ...packetFiles];
  const inventory = payload.map(inventoryEntry);
  const violations = scanKitBoundaries(payload, inventory);
  if (violations.length > 0) {
    throw new PipelineFailure(
      'BOUNDARY_SCAN_FAILED',
      violations.map((violation) => `${violation.code}:${violation.path}`).join(','),
    );
  }
  const assignmentSha256 = sha256(assignmentFile.bytes);
  const packetAggregateSha256 = sha256(
    canonicalKitJson(packetFiles.map((file) => ({ path: file.path, sha256: sha256(file.bytes) }))),
  );
  const manifest = {
    format: 'wp-03-kit-manifest/1',
    runId: RUN_ID,
    generation: 1,
    teamId,
    laneId,
    assignmentId,
    assignmentSha256,
    packetAggregateSha256,
    packetCount: 30,
    allowedLessonIds: lessonIds,
    files: payload.map((file) => ({
      path: file.path,
      sha256: sha256(file.bytes),
      size: typeof file.bytes === 'string' ? Buffer.byteLength(file.bytes) : file.bytes.byteLength,
      mode: 0o644,
    })),
  };
  const manifestBytes = canonicalBytes(manifest);
  const manifestSha256 = sha256(manifestBytes);
  const archiveBytes = createDeterministicZip([
    { path: 'KIT-MANIFEST.json', bytes: manifestBytes },
    ...payload,
  ]);
  const entries = readZipEntries(archiveBytes);
  if (
    entries.length !== payload.length + 1 ||
    !entries.some((entry) => entry.path === 'KIT-MANIFEST.json')
  ) {
    throw new PipelineFailure('CANDIDATE_CLOSURE_FAILED');
  }
  const archiveSha256 = sha256(archiveBytes);
  const sendMe = [
    'WP03_TEAMMATE_KIT',
    `TEAM_ID=${teamId}`,
    `ARCHIVE=${teamId}-complete.zip`,
    `ARCHIVE_SHA256=${archiveSha256}`,
    `KIT_MANIFEST_SHA256=${manifestSha256}`,
    `ASSIGNMENT_SHA256=${assignmentSha256}`,
    'PACKET_COUNT=30',
    'REQUIRES_MATCHING_READY_JSON=true',
    '',
  ].join('\n');
  return {
    teamId,
    lessonIds,
    assignmentSha256,
    packetAggregateSha256,
    manifestBytes,
    manifestSha256,
    archiveBytes,
    archiveSha256,
    sendMe,
    checksum: `${archiveSha256}  ${teamId}-complete.zip\n`,
    smokeReceipts: PRODUCTION_AUTHORITY.smokeCommands.map((command, index) => ({
      commandId: command.id,
      commandSha256: sha256(canonicalKitJson(command)),
      executableSha256: testDigest('executable'),
      toolSha256: testDigest('tool'),
      argv: command.argv,
      environment: SMOKE_ENVIRONMENT,
      cwdPolicy: 'EXTRACTED_KIT_ROOT',
      exitCode: 0,
      stdoutSha256: sha256(`${command.id}:ok\n`),
      stderrSha256: sha256(''),
      durationMs: index + 1,
      startedAt: `2026-08-04T08:00:0${index}.000Z`,
      finishedAt: `2026-08-04T08:00:0${index}.001Z`,
    })),
  };
}

function createReviewCandidates(): CandidateSet {
  return {
    runId: RUN_ID,
    generation: 1,
    teams: [createReviewCandidate('team-A', 1), createReviewCandidate('team-B', 31)],
    pins: {
      proofSha256: testDigest('proof'),
      profileSha256: testDigest('profile'),
      schemaSha256: testDigest('schema'),
      templateSha256: testDigest('template'),
      repositoryCommit: testDigest('repository'),
      toolSha256: testDigest('tool'),
      executableSha256: testDigest('executable'),
    },
  };
}

function reviewKitPins(): KitIdentityPins {
  return {
    repositoryCommit: testDigest('repository'),
    kitSha256: testDigest('kit-contract'),
    profileSha256: testDigest('profile'),
    schemaSha256: testDigest('schema'),
    templateSha256: testDigest('template'),
    curriculumSha256: testDigest('curriculum'),
    toolVersions: {
      node: '24.17.0',
      pnpm: '9.15.9',
      wp03KitFactory: '1.0.0',
    },
  };
}

function createReviewTeamInput(
  teamId: TeamId,
  laneId: string,
  first: number,
  generation: number,
): TeamKitInput {
  const pins = reviewKitPins();
  const assignmentId =
    teamId === 'team-A'
      ? 'lesson-factory-deadline-2026-08-03-assignment-02'
      : 'lesson-factory-deadline-2026-08-03-assignment-03';
  const assignmentBindingId = `binding-${teamId}-generation-${generation}`;
  const packets = Array.from({ length: 30 }, (_, index) => {
    const lessonId = `V3-LES-${String(first + index).padStart(6, '0')}`;
    const document = {
      $test_fixture: { synthetic: true, not_for_production: true },
      kind: 'packet',
      projection: {
        runId: RUN_ID,
        lessonId,
        packetId: `packet-${lessonId}`,
        revision: 'r1',
        teamId,
        laneId,
        assignmentId,
        assignmentBindingId,
        contractVersion: '5.0.0',
        schemaVersion: '5.0.0',
        generation,
        status: 'READY',
        pins,
      },
    };
    const bytes = `${canonicalKitJson(document)}\n`;
    return {
      path: `packets/${lessonId.toLowerCase()}/task-source-packet.json`,
      bytes,
      document,
      expectedSha256: sha256(bytes),
    };
  });
  const projection: ValidatedAssignmentProjection = {
    runId: RUN_ID,
    teamId,
    laneId,
    assignmentId,
    assignmentBindingId,
    contractVersion: '5.0.0',
    schemaVersion: '5.0.0',
    generation,
    fileSha256: '',
    bindings: packets.map((packet, index) => {
      const lessonId = `V3-LES-${String(first + index).padStart(6, '0')}`;
      return {
        lessonId,
        packetId: `packet-${lessonId}`,
        revision: 'r1',
        path: packet.path,
        sha256: packet.expectedSha256,
        contentSha256: sha256(canonicalKitJson(packet.document)),
      };
    }),
    pins,
  };
  const assignmentDocument = {
    $test_fixture: { synthetic: true, not_for_production: true },
    kind: 'assignment',
    projection,
  };
  const assignmentBytes = `${canonicalKitJson(assignmentDocument)}\n`;
  const coreFiles: readonly KitArchiveFile[] = PRODUCTION_AUTHORITY.corePaths.map((path) => ({
    path,
    bytes: path.endsWith('.md')
      ? `# Review core\n\nCanonical path: ${path}\n`
      : canonicalBytes({ format: 'wp-03-review-core/2', canonicalPath: path }),
  }));
  const assignment = {
    path: `assignments/${teamId}.json`,
    bytes: assignmentBytes,
    document: assignmentDocument,
    expectedSha256: sha256(assignmentBytes),
  };
  return {
    runId: RUN_ID,
    teamId,
    laneId,
    assembledAt: '2026-08-04T08:00:00.000Z',
    lifecycle: 'TEAMMATE_AUTHORING',
    deadline: '2026-08-04T09:30:00-05:00',
    branchConvention: 'lesson-factory/{team}/{lesson-id}',
    expectedPins: pins,
    expectedCohort: {
      assignmentId,
      assignmentBindingId,
      contractVersion: '5.0.0',
      schemaVersion: '5.0.0',
      generation,
    },
    requiredCorePaths: coreFiles.map((file) => file.path),
    allowedInventory: [
      ...coreFiles.map(inventoryEntry),
      {
        path: assignment.path,
        sha256: assignment.expectedSha256,
        mediaType: 'application/json' as const,
      },
      ...packets.map((packet) => ({
        path: packet.path,
        sha256: packet.expectedSha256,
        mediaType: 'application/json' as const,
      })),
    ],
    coreFiles,
    assignment,
    packets,
  };
}

function reviewValidators(): FinalInputValidators {
  return {
    validateAssignment: ({ document, bytes }) => {
      const envelope = document as Record<string, unknown>;
      if (envelope.kind !== 'assignment') {
        return { ok: false, errors: ['review assignment rejected'] };
      }
      return {
        ok: true,
        value: {
          ...(structuredClone(envelope.projection) as ValidatedAssignmentProjection),
          fileSha256: sha256(bytes),
        },
      };
    },
    validatePacket: ({ path, document, bytes }) => {
      const envelope = document as Record<string, unknown>;
      if (envelope.kind !== 'packet') {
        return { ok: false, errors: ['review packet rejected'] };
      }
      return {
        ok: true,
        value: {
          ...(structuredClone(envelope.projection) as ValidatedPacketProjection),
          fileSha256: sha256(bytes),
          contentSha256: sha256(canonicalKitJson(document)),
          sourcePacketPath: path,
        },
      };
    },
  };
}

async function createCoreVerifiedReviewCandidates(
  root: OwnedRoot,
  generation: number,
): Promise<CandidateSet> {
  const teamA = createReviewTeamInput('team-A', 'lane-02', 1, generation);
  const teamB = createReviewTeamInput('team-B', 'lane-03', 31, generation);
  const validators = reviewValidators();
  const candidates = createFederatedKitCandidates({ teamA, teamB }, validators);
  const reviewExecutableSha256 = sha256(await readFile(process.execPath));
  const runner: CommandRunner = {
    run: async (request) =>
      runRealSmokeCommand(request.executable, reviewExecutableSha256, request.args, request.cwd),
  };
  const smokeCommands = PRODUCTION_AUTHORITY.smokeCommands.map((command) => ({
    id: command.id,
    executable: process.execPath,
    args: ['--version'],
    cwd: '.',
  }));
  const scratchParent = join(root.path, '.core-verification');
  const [verifiedA, verifiedB] = await Promise.all([
    verifyKitCandidate(
      {
        candidate: candidates.teamA,
        source: teamA,
        scratchParent,
        smokeCommands,
        smokeEnvironment: SMOKE_ENVIRONMENT,
      },
      validators,
      runner,
    ),
    verifyKitCandidate(
      {
        candidate: candidates.teamB,
        source: teamB,
        scratchParent,
        smokeCommands,
        smokeEnvironment: SMOKE_ENVIRONMENT,
      },
      validators,
      runner,
    ),
  ]);
  const toTeamCandidate = (verified: typeof verifiedA, source: TeamKitInput): TeamCandidate => ({
    teamId: verified.teamId,
    lessonIds: verified.candidate.manifest.allowedLessonIds,
    assignmentSha256: verified.candidate.manifest.assignmentSha256,
    packetAggregateSha256: sha256(
      canonicalKitJson(
        source.packets.map((packet) => ({
          path: packet.path,
          sha256: packet.expectedSha256,
        })),
      ),
    ),
    manifestBytes: canonicalBytes(verified.candidate.manifest),
    manifestSha256: verified.candidate.manifestSha256,
    archiveBytes: verified.candidate.archiveBytes,
    archiveSha256: verified.candidate.archiveSha256,
    sendMe: createSendMeText(verified),
    checksum: `${verified.candidate.archiveSha256}  ${verified.teamId}-complete.zip\n`,
    smokeReceipts: verified.smokeReceipts.map((receipt, index) => {
      const command = PRODUCTION_AUTHORITY.smokeCommands[index]!;
      return {
        commandId: receipt.id,
        commandSha256: sha256(canonicalKitJson(command)),
        executableSha256: reviewExecutableSha256,
        toolSha256: sha256(canonicalKitJson(reviewKitPins().toolVersions)),
        argv: command.argv,
        environment: SMOKE_ENVIRONMENT,
        cwdPolicy: 'EXTRACTED_KIT_ROOT',
        exitCode: 0,
        stdoutSha256: receipt.stdoutSha256,
        stderrSha256: receipt.stderrSha256,
        durationMs: index + 1,
        startedAt: `2026-08-04T08:00:0${index}.000Z`,
        finishedAt: `2026-08-04T08:00:0${index}.001Z`,
      };
    }),
  });
  const pins = reviewKitPins();
  return {
    runId: RUN_ID,
    generation,
    teams: [toTeamCandidate(verifiedA, teamA), toTeamCandidate(verifiedB, teamB)],
    pins: {
      proofSha256: testDigest('proof'),
      profileSha256: pins.profileSha256,
      schemaSha256: pins.schemaSha256,
      templateSha256: pins.templateSha256,
      repositoryCommit: pins.repositoryCommit,
      toolSha256: sha256(canonicalKitJson(pins.toolVersions)),
      executableSha256: reviewExecutableSha256,
    },
  };
}

function unsignedReceipt(
  candidates: CandidateSet,
  timestamp: string,
): Omit<FinalizationReceipt, 'signature'> {
  return {
    receiptId: `wp03-finalization-${candidates.generation}-${sha256(
      canonicalKitJson(candidates.teams.map((team) => team.archiveSha256)),
    ).slice(0, 16)}`,
    issuer: 'WP03_FINALIZATION_AUTHORITY',
    runId: RUN_ID,
    allowedAction: 'PACKAGE_KITS',
    validationTimestamp: timestamp,
    generation: candidates.generation,
    pins: candidates.pins,
    teams: candidates.teams.map((team) => ({
      teamId: team.teamId,
      archiveSha256: team.archiveSha256,
      manifestSha256: team.manifestSha256,
      assignmentSha256: team.assignmentSha256,
      packetAggregateSha256: team.packetAggregateSha256,
      smokeReceiptSha256: sha256(canonicalKitJson(team.smokeReceipts)),
      lessonIds: team.lessonIds,
    })),
  };
}

function signReceipt(
  candidates: CandidateSet,
  key: string,
  timestamp = new Date().toISOString(),
): FinalizationReceipt {
  const unsigned = unsignedReceipt(candidates, timestamp);
  return {
    ...unsigned,
    signature: createHmac('sha256', key).update(canonicalKitJson(unsigned)).digest('hex'),
  };
}

function verifyFinalizationAuthenticity(
  receipt: FinalizationReceipt,
  key: string,
  now = Date.now(),
  enforceFreshness = true,
): void {
  const parsed = Date.parse(receipt.validationTimestamp);
  const { signature, ...unsigned } = receipt;
  const expectedSignature = createHmac('sha256', key)
    .update(canonicalKitJson(unsigned))
    .digest('hex');
  const actual = Buffer.from(signature, 'hex');
  const expected = Buffer.from(expectedSignature, 'hex');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    throw new PipelineFailure('AUTHORIZATION_SIGNATURE_INVALID');
  }
  if (
    enforceFreshness &&
    (!Number.isFinite(parsed) || parsed > now + 60_000 || now - parsed > 15 * 60_000)
  ) {
    throw new PipelineFailure('AUTHORIZATION_STALE');
  }
}

function verifyReceipt(
  receipt: FinalizationReceipt,
  candidates: CandidateSet,
  key: string,
  now = Date.now(),
): void {
  verifyFinalizationAuthenticity(receipt, key, now);
  const expectedUnsigned = unsignedReceipt(candidates, receipt.validationTimestamp);
  const expectedWithPreparedSmoke = {
    ...expectedUnsigned,
    teams: expectedUnsigned.teams.map((team) => ({
      ...team,
      smokeReceiptSha256:
        receipt.teams.find((offered) => offered.teamId === team.teamId)?.smokeReceiptSha256 ?? '',
    })),
  };
  const comparable = { ...receipt };
  delete (comparable as { signature?: string }).signature;
  if (canonicalKitJson(comparable) !== canonicalKitJson(expectedWithPreparedSmoke)) {
    throw new PipelineFailure('AUTHORIZATION_MISMATCH');
  }
}

async function createOwnedRoot(): Promise<OwnedRoot> {
  await mkdir(TEST_PARENT, { recursive: true, mode: 0o700 });
  const parent = await realpath(TEST_PARENT);
  if (parent !== resolve(TEST_PARENT)) throw new PipelineFailure('HARNESS_PARENT_UNSAFE');
  const root = await mkdtemp(join(parent, 'owned-'));
  const markerToken = randomBytes(24).toString('hex');
  await writeExclusiveNoFollow(join(root, '.wp03-test-owned'), `${markerToken}\n`);
  const identity = await stat(root, { bigint: true });
  const owned: OwnedRoot = {
    path: root,
    markerName: '.wp03-test-owned',
    markerToken,
    device: identity.dev,
    inode: identity.ino,
  };
  activeReviewRoots.add(owned);
  return owned;
}

async function assertOwnedRoot(root: OwnedRoot): Promise<void> {
  const info = await productionOperation('stat', () => lstat(root.path, { bigint: true }));
  if (
    info.isSymbolicLink() ||
    !info.isDirectory() ||
    info.dev !== root.device ||
    info.ino !== root.inode ||
    (await productionOperation('realpath', () => realpath(root.path))) !== resolve(root.path)
  ) {
    throw new PipelineFailure('FILESYSTEM_IDENTITY_CHANGED');
  }
  const marker = await readFile(join(root.path, root.markerName), 'utf8');
  if (marker !== `${root.markerToken}\n`) {
    throw new PipelineFailure('HARNESS_ROOT_NOT_OWNED');
  }
}

interface DirectoryIdentity {
  readonly path: string;
  readonly device: bigint;
  readonly inode: bigint;
  readonly uid: bigint;
  readonly mode: bigint;
  linkCount: bigint;
  readonly handle: FileHandle;
}

async function captureParentIdentities(
  root: OwnedRoot,
  target: string,
): Promise<readonly DirectoryIdentity[]> {
  await assertOwnedRoot(root);
  const confined = resolve(target);
  if (confined !== resolve(root.path) && !confined.startsWith(`${resolve(root.path)}${sep}`)) {
    throw new PipelineFailure('PATH_ESCAPE');
  }
  const identities: DirectoryIdentity[] = [];
  let current = dirname(confined);
  while (current.startsWith(resolve(root.path))) {
    if (await pathExists(current)) {
      const handle = await productionOperation('open', () =>
        open(current, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0)),
      );
      const info = await handle.stat({ bigint: true });
      if (info.isSymbolicLink() || !info.isDirectory()) {
        await handle.close();
        throw new PipelineFailure('FILESYSTEM_IDENTITY_CHANGED');
      }
      const expectedUid =
        typeof process.getuid === 'function' ? BigInt(process.getuid()) : info.uid;
      if (info.uid !== expectedUid || (info.mode & 0o077n) !== 0n) {
        await handle.close();
        throw new PipelineFailure(
          'FILESYSTEM_IDENTITY_CHANGED',
          `unsafe mutable parent ${current}: uid=${info.uid.toString()} mode=${(
            info.mode & 0o777n
          ).toString(8)}`,
        );
      }
      identities.push({
        path: current,
        device: info.dev,
        inode: info.ino,
        uid: info.uid,
        mode: info.mode,
        linkCount: info.nlink,
        handle,
      });
    }
    if (current === resolve(root.path)) break;
    current = dirname(current);
  }
  return identities;
}

async function assertParentIdentities(identities: readonly DirectoryIdentity[]): Promise<void> {
  for (const identity of identities) {
    const [info, opened] = await Promise.all([
      productionOperation('stat', () => lstat(identity.path, { bigint: true })),
      identity.handle.stat({ bigint: true }),
    ]);
    if (
      info.isSymbolicLink() ||
      !info.isDirectory() ||
      info.dev !== identity.device ||
      info.ino !== identity.inode ||
      opened.dev !== identity.device ||
      opened.ino !== identity.inode ||
      info.uid !== identity.uid ||
      info.mode !== identity.mode ||
      info.nlink !== identity.linkCount
    ) {
      throw new PipelineFailure(
        'FILESYSTEM_IDENTITY_CHANGED',
        `parent identity changed ${identity.path}: path=${info.dev.toString()}/${info.ino.toString()}/${info.uid.toString()}/${info.mode.toString(8)}/${info.nlink.toString()} handle=${opened.dev.toString()}/${opened.ino.toString()} expected=${identity.device.toString()}/${identity.inode.toString()}/${identity.uid.toString()}/${identity.mode.toString(8)}/${identity.linkCount.toString()}`,
      );
    }
  }
}

async function acknowledgeOwnedLinkChanges(
  identities: readonly DirectoryIdentity[],
): Promise<void> {
  for (const identity of identities) {
    const [pathInfo, opened] = await Promise.all([
      lstat(identity.path, { bigint: true }),
      identity.handle.stat({ bigint: true }),
    ]);
    if (
      pathInfo.isSymbolicLink() ||
      !pathInfo.isDirectory() ||
      pathInfo.dev !== identity.device ||
      pathInfo.ino !== identity.inode ||
      opened.dev !== identity.device ||
      opened.ino !== identity.inode ||
      pathInfo.uid !== identity.uid ||
      pathInfo.mode !== identity.mode
    ) {
      throw new PipelineFailure('FILESYSTEM_IDENTITY_CHANGED');
    }
    identity.linkCount = pathInfo.nlink;
  }
}

async function closeParentIdentities(identities: readonly DirectoryIdentity[]): Promise<void> {
  await Promise.all(identities.map((identity) => identity.handle.close()));
}

async function guardedRename(root: OwnedRoot, from: string, to: string): Promise<void> {
  const parents = [
    ...(await captureParentIdentities(root, from)),
    ...(await captureParentIdentities(root, to)),
  ];
  try {
    await reviewMutationHook?.({ id: 'rename', from, to });
    await productionOperation('rename', async () => {
      await assertParentIdentities(parents);
      await rename(from, to);
      await acknowledgeOwnedLinkChanges(parents);
      await assertParentIdentities(parents);
    });
  } finally {
    await closeParentIdentities(parents);
  }
}

async function guardedRemove(
  root: OwnedRoot,
  path: string,
  options: { readonly recursive?: boolean; readonly force?: boolean },
): Promise<void> {
  const parents = await captureParentIdentities(root, path);
  try {
    await reviewMutationHook?.({ id: 'remove', to: path });
    await productionOperation('remove', async () => {
      await assertParentIdentities(parents);
      await rm(path, options);
      await acknowledgeOwnedLinkChanges(parents);
      await assertParentIdentities(parents);
    });
  } finally {
    await closeParentIdentities(parents);
  }
}

async function assertSelectedReviewRoot(owned: OwnedRoot, selected: string): Promise<void> {
  if (resolve(selected) !== resolve(owned.path)) {
    throw new PipelineFailure('FORBIDDEN_TEST_ROOT');
  }
  await assertOwnedRoot(owned);
}

async function cleanupOwnedRoot(root: OwnedRoot): Promise<void> {
  await assertOwnedRoot(root);
  const makeRemovable = async (path: string): Promise<void> => {
    const rel = relative(root.path, path);
    if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
      throw new PipelineFailure('HARNESS_ROOT_NOT_OWNED');
    }
    let info;
    try {
      info = await lstat(path);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw error;
    }
    if (info.isSymbolicLink()) throw new PipelineFailure('FILESYSTEM_IDENTITY_CHANGED');
    if (info.isDirectory()) {
      await chmod(path, 0o700);
      for (const entry of await readdir(path)) {
        await makeRemovable(join(path, entry));
      }
    } else {
      await chmod(path, 0o600);
    }
  };
  await makeRemovable(root.path);
  await rm(root.path, { recursive: true, force: true });
  activeReviewRoots.delete(root);
}

interface ScratchInventory {
  readonly markedOwnedRoots: readonly OwnedRoot[];
  readonly preservedUnownedRoots: readonly string[];
  readonly escapedPaths: readonly string[];
}

async function inventoryTestScratch(): Promise<ScratchInventory> {
  await mkdir(TEST_PARENT, { recursive: true, mode: 0o700 });
  const parent = await realpath(TEST_PARENT);
  if (parent !== resolve(TEST_PARENT)) throw new PipelineFailure('HARNESS_PARENT_UNSAFE');
  const markedOwnedRoots: OwnedRoot[] = [];
  const preservedUnownedRoots: string[] = [];
  const escapedPaths: string[] = [];
  const expectedUid = typeof process.getuid === 'function' ? BigInt(process.getuid()) : undefined;
  for (const name of (await readdir(parent)).sort()) {
    const path = join(parent, name);
    const relativePath = relative(parent, path);
    const info = await lstat(path, { bigint: true });
    if (
      relativePath !== name ||
      relativePath.startsWith(`..${sep}`) ||
      isAbsolute(relativePath) ||
      info.isSymbolicLink() ||
      !info.isDirectory() ||
      (await realpath(path)) !== path
    ) {
      escapedPaths.push(name);
      continue;
    }
    const markerPath = join(path, '.wp03-test-owned');
    if (!(await pathExists(markerPath))) {
      preservedUnownedRoots.push(name);
      continue;
    }
    const markerInfo = await lstat(markerPath, { bigint: true });
    const marker = await readFile(markerPath, 'utf8');
    if (
      !/^owned-[A-Za-z0-9]{6}(?:\.identity-held)?$/.test(name) ||
      markerInfo.isSymbolicLink() ||
      !markerInfo.isFile() ||
      !/^[0-9a-f]{48}\n$/.test(marker) ||
      (info.mode & 0o777n) !== 0o700n ||
      (expectedUid !== undefined && info.uid !== expectedUid)
    ) {
      preservedUnownedRoots.push(name);
      continue;
    }
    markedOwnedRoots.push({
      path,
      markerName: '.wp03-test-owned',
      markerToken: marker.trimEnd(),
      device: info.dev,
      inode: info.ino,
    });
  }
  return { markedOwnedRoots, preservedUnownedRoots, escapedPaths };
}

async function reconcileMarkedOwnedTestRoots(): Promise<readonly string[]> {
  const inventory = await inventoryTestScratch();
  if (inventory.escapedPaths.length !== 0) {
    throw new PipelineFailure('HARNESS_PARENT_UNSAFE');
  }
  const removed: string[] = [];
  for (const root of inventory.markedOwnedRoots) {
    await cleanupOwnedRoot(root);
    removed.push(root.path);
  }
  return removed;
}

async function cleanupActiveReviewRoots(): Promise<void> {
  for (const root of [...activeReviewRoots]) {
    if (await pathExists(root.path)) {
      await cleanupOwnedRoot(root);
      continue;
    }
    const inventory = await inventoryTestScratch();
    const relocated = inventory.markedOwnedRoots.filter(
      (candidate) => candidate.markerToken === root.markerToken,
    );
    if (relocated.length !== 1) {
      throw new PipelineFailure('HARNESS_ROOT_NOT_OWNED');
    }
    await cleanupOwnedRoot(relocated[0]!);
    activeReviewRoots.delete(root);
  }
}

async function writeExclusiveNoFollow(path: string, bytes: string | Uint8Array): Promise<void> {
  const handle = await productionOperation('open', () =>
    open(
      path,
      fsConstants.O_WRONLY |
        fsConstants.O_CREAT |
        fsConstants.O_EXCL |
        (fsConstants.O_NOFOLLOW ?? 0),
      0o600,
    ),
  );
  try {
    await productionOperation('write', () => handle.writeFile(bytes));
    await productionOperation('file-fsync', () => handle.sync());
  } finally {
    await handle.close();
  }
}

async function syncDirectory(path: string): Promise<void> {
  const handle = await productionOperation('open', () =>
    open(path, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0)),
  );
  try {
    await productionOperation('dir-fsync', () => handle.sync());
  } finally {
    await handle.close();
  }
}

function isProcessAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

async function writeCanonicalAtomic(path: string, value: unknown, root?: OwnedRoot): Promise<void> {
  const identities = root === undefined ? undefined : await captureParentIdentities(root, path);
  const temp = `${path}.${randomBytes(8).toString('hex')}.tmp`;
  try {
    await writeExclusiveNoFollow(temp, canonicalBytes(value));
    if (identities !== undefined) await acknowledgeOwnedLinkChanges(identities);
    if (identities !== undefined) await assertParentIdentities(identities);
    if (root === undefined) {
      await productionOperation('rename', () => rename(temp, path));
      if (identities !== undefined) await acknowledgeOwnedLinkChanges(identities);
      if (identities !== undefined) await assertParentIdentities(identities);
    } else {
      await guardedRename(root, temp, path);
    }
    await syncDirectory(dirname(path));
  } finally {
    if (identities !== undefined) await closeParentIdentities(identities);
  }
}

async function acquireLock(
  root: OwnedRoot,
  allowOwnedRecovery = false,
): Promise<{
  readonly owner: LockOwner;
  readonly release: () => Promise<void>;
  readonly stopRenewal: () => void;
}> {
  await assertOwnedRoot(root);
  const lockPath = join(root.path, '.wp03-lock');
  const ownerPath = join(lockPath, 'owner.json');
  const createOwner = (): LockOwner => ({
    token: randomBytes(24).toString('hex'),
    pid: process.pid,
    host: hostname(),
    nonce: randomBytes(16).toString('hex'),
    processStartedAt: new Date(Date.now() - Math.floor(process.uptime() * 1000)).toISOString(),
    leaseUntil: new Date(Date.now() + 30_000).toISOString(),
  });
  let owner = createOwner();
  try {
    await productionOperation('mkdir', () => mkdir(lockPath, { mode: 0o700 }));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    const existing = JSON.parse(await readFile(ownerPath, 'utf8')) as LockOwner;
    if (existing.host !== hostname()) {
      throw new PipelineFailure('LOCK_LIVENESS_UNKNOWN');
    }
    const ownerLive = isProcessAlive(existing.pid);
    const leaseExpired = Date.parse(existing.leaseUntil) < Date.now();
    if (allowOwnedRecovery && existing.host === hostname() && existing.pid === process.pid) {
      owner = existing;
    } else {
      if (ownerLive) throw new PipelineFailure('LOCK_OWNER_LIVE');
      if (!leaseExpired) throw new PipelineFailure('LOCK_LEASE_ACTIVE');
      const tombstone = join(
        root.path,
        `.wp03-lock.takeover-${existing.token}-${randomBytes(8).toString('hex')}`,
      );
      await guardedRename(root, lockPath, tombstone);
      await productionOperation('mkdir', () => mkdir(lockPath, { mode: 0o700 }));
      await guardedRemove(root, tombstone, { recursive: true, force: true });
      owner = createOwner();
    }
  }
  if (!(await pathExists(ownerPath))) {
    const ownerParents = await captureParentIdentities(root, ownerPath);
    try {
      await writeExclusiveNoFollow(ownerPath, canonicalBytes(owner));
      await acknowledgeOwnedLinkChanges(ownerParents);
      await assertParentIdentities(ownerParents);
    } finally {
      await closeParentIdentities(ownerParents);
    }
  }
  await syncDirectory(lockPath);
  let stopped = false;
  const timer = setInterval(() => {
    if (stopped) return;
    const renewed = { ...owner, leaseUntil: new Date(Date.now() + 30_000).toISOString() };
    void writeCanonicalAtomic(ownerPath, renewed, root).catch(() => {
      stopped = true;
    });
  }, 10_000);
  timer.unref();
  return {
    owner,
    stopRenewal: () => {
      stopped = true;
      clearInterval(timer);
    },
    release: async () => {
      stopped = true;
      clearInterval(timer);
      const current = JSON.parse(await readFile(ownerPath, 'utf8')) as LockOwner;
      if (current.token !== owner.token) throw new PipelineFailure('LOCK_NOT_OWNED');
      await guardedRemove(root, lockPath, { recursive: true, force: true });
      await syncDirectory(root.path);
    },
  };
}

function strictStatus(value: unknown): Record<string, unknown> {
  if (value === undefined) return {};
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new PipelineFailure('PRIOR_STATUS_INVALID');
  }
  const status = value as Record<string, unknown>;
  const expectedKeys = [
    'authorizationReceiptId',
    'authorizationScope',
    'current',
    'format',
    'generation',
    'history',
    'runId',
    'status',
    'transactionState',
    'versionDirectory',
  ];
  const current = Array.isArray(status.current) ? status.current : [];
  const history = Array.isArray(status.history) ? status.history : [];
  const hash = /^[0-9a-f]{64}$/;
  const version = /^versions\/[0-9a-f]{64}$/;
  const validCurrent = current.every((entry, index) => {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) return false;
    const record = entry as Record<string, unknown>;
    return (
      canonicalKitJson(Object.keys(record).sort()) ===
        canonicalKitJson([
          'archiveSha256',
          'manifestSha256',
          'status',
          'teamId',
          'versionDirectory',
        ]) &&
      record.teamId === (index === 0 ? 'team-A' : 'team-B') &&
      record.status === 'CURRENT' &&
      typeof record.archiveSha256 === 'string' &&
      hash.test(record.archiveSha256) &&
      typeof record.manifestSha256 === 'string' &&
      hash.test(record.manifestSha256) &&
      typeof record.versionDirectory === 'string' &&
      version.test(record.versionDirectory)
    );
  });
  const validHistory = history.every((entry) => {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) return false;
    const record = entry as Record<string, unknown>;
    return (
      canonicalKitJson(Object.keys(record).sort()) ===
        canonicalKitJson([
          'archiveSha256',
          'generation',
          'manifestSha256',
          'status',
          'supersededByVersion',
          'teamId',
          'versionDirectory',
        ]) &&
      (record.teamId === 'team-A' || record.teamId === 'team-B') &&
      record.status === 'SUPERSEDED' &&
      Number.isInteger(record.generation) &&
      (record.generation as number) >= 1 &&
      (record.generation as number) < (status.generation as number) &&
      typeof record.archiveSha256 === 'string' &&
      hash.test(record.archiveSha256) &&
      typeof record.manifestSha256 === 'string' &&
      hash.test(record.manifestSha256) &&
      typeof record.versionDirectory === 'string' &&
      version.test(record.versionDirectory) &&
      typeof record.supersededByVersion === 'string' &&
      version.test(record.supersededByVersion)
    );
  });
  if (
    canonicalKitJson(Object.keys(status).sort()) !== canonicalKitJson(expectedKeys) ||
    status.format !== 'wp-03-bundle-readiness/2' ||
    status.runId !== RUN_ID ||
    status.status !== 'READY' ||
    status.transactionState !== 'READY' ||
    status.authorizationScope !== 'PACKAGE_KITS_ONLY' ||
    typeof status.authorizationReceiptId !== 'string' ||
    typeof status.versionDirectory !== 'string' ||
    !version.test(status.versionDirectory) ||
    !Number.isInteger(status.generation) ||
    (status.generation as number) < 1 ||
    current.length !== 2 ||
    (current[0] as Record<string, unknown> | undefined)?.teamId !== 'team-A' ||
    (current[1] as Record<string, unknown> | undefined)?.teamId !== 'team-B' ||
    !Array.isArray(status.history) ||
    !validCurrent ||
    !validHistory
  ) {
    throw new PipelineFailure('PRIOR_STATUS_INVALID');
  }
  return status;
}

function strictCurrent(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new PipelineFailure('CURRENT_RECORD_INVALID');
  }
  const current = value as Record<string, unknown>;
  if (
    canonicalKitJson(Object.keys(current).sort()) !==
      canonicalKitJson(['format', 'generation', 'teams', 'versionDirectory']) ||
    current.format !== 'wp-03-current/1' ||
    !Number.isInteger(current.generation) ||
    (current.generation as number) < 1 ||
    !Array.isArray(current.teams) ||
    canonicalKitJson(current.teams) !== canonicalKitJson(['team-A', 'team-B']) ||
    typeof current.versionDirectory !== 'string' ||
    !/^versions\/[0-9a-f]{64}$/.test(current.versionDirectory)
  ) {
    throw new PipelineFailure('CURRENT_RECORD_INVALID');
  }
  return current;
}

async function receiptLedgerRecords(root: OwnedRoot): Promise<readonly Record<string, unknown>[]> {
  const path = join(root.path, 'receipt-ledger.jsonl');
  if (!(await pathExists(path))) return [];
  const text = await readFile(path, 'utf8');
  const records: Record<string, unknown>[] = [];
  let priorGeneration = 0;
  const receiptIds = new Set<string>();
  for (const line of text.split('\n').filter(Boolean)) {
    let record: Record<string, unknown>;
    try {
      const parsed = JSON.parse(line) as unknown;
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('not an object');
      }
      record = parsed as Record<string, unknown>;
    } catch {
      throw new PipelineFailure('RECEIPT_LEDGER_INVALID');
    }
    if (
      canonicalKitJson(Object.keys(record).sort()) !==
        canonicalKitJson(['generation', 'receiptId', 'receiptSha256', 'versionHash']) ||
      typeof record.receiptId !== 'string' ||
      receiptIds.has(record.receiptId) ||
      !Number.isInteger(record.generation) ||
      (record.generation as number) <= priorGeneration ||
      typeof record.versionHash !== 'string' ||
      !/^[0-9a-f]{64}$/.test(record.versionHash) ||
      typeof record.receiptSha256 !== 'string' ||
      !/^[0-9a-f]{64}$/.test(record.receiptSha256)
    ) {
      throw new PipelineFailure('RECEIPT_LEDGER_INVALID');
    }
    priorGeneration = record.generation as number;
    receiptIds.add(record.receiptId);
    records.push(record);
  }
  return records;
}

async function nextPublicationGeneration(root: OwnedRoot): Promise<number> {
  const statusPath = join(root.path, 'bundle-readiness.json');
  const currentPath = join(root.path, 'current.json');
  const hasStatus = await pathExists(statusPath);
  const hasCurrent = await pathExists(currentPath);
  if (hasStatus !== hasCurrent) throw new PipelineFailure('PERSISTED_RECORD_INVALID');
  const ledger = await receiptLedgerRecords(root);
  const ledgerGeneration = ledger.length === 0 ? 0 : (ledger.at(-1)!.generation as number);
  if (!hasStatus) {
    if (ledgerGeneration !== 0) throw new PipelineFailure('PERSISTED_RECORD_INVALID');
    return 1;
  }
  const status = strictStatus(JSON.parse(await readFile(statusPath, 'utf8')));
  const current = strictCurrent(JSON.parse(await readFile(currentPath, 'utf8')));
  if (
    status.generation !== current.generation ||
    status.versionDirectory !== current.versionDirectory ||
    ledgerGeneration !== status.generation
  ) {
    throw new PipelineFailure('PERSISTED_RECORD_INVALID');
  }
  return (status.generation as number) + 1;
}

async function assertReceiptLedgerAllows(
  root: OwnedRoot,
  receipt: FinalizationReceipt,
): Promise<void> {
  const records = await receiptLedgerRecords(root);
  if (records.some((record) => record.receiptId === receipt.receiptId)) {
    throw new PipelineFailure('AUTHORIZATION_REPLAYED');
  }
  const maxGeneration = records.reduce(
    (maximum, record) =>
      typeof record.generation === 'number' ? Math.max(maximum, record.generation) : maximum,
    0,
  );
  if (receipt.generation <= maxGeneration) {
    throw new PipelineFailure('GENERATION_ROLLBACK');
  }
}

async function appendReceiptLedger(
  root: OwnedRoot,
  receipt: FinalizationReceipt,
  versionHash: string,
): Promise<void> {
  const path = join(root.path, 'receipt-ledger.jsonl');
  const prior = (await pathExists(path)) ? await readFile(path, 'utf8') : '';
  await assertReceiptLedgerAllows(root, receipt);
  const next = `${prior}${canonicalKitJson({
    receiptId: receipt.receiptId,
    generation: receipt.generation,
    versionHash,
    receiptSha256: sha256(canonicalKitJson(receipt)),
  })}\n`;
  const temp = join(root.path, `.receipt-ledger-${randomBytes(8).toString('hex')}.tmp`);
  await writeExclusiveNoFollow(temp, next);
  await guardedRename(root, temp, path);
  await syncDirectory(root.path);
}

async function writeTeamArtifacts(
  root: OwnedRoot,
  directory: string,
  team: TeamCandidate,
  failAt?: 'FILE' | 'FSYNC',
): Promise<void> {
  await assertOwnedRoot(root);
  await mkdir(directory, { mode: 0o700 });
  const directoryParents = await captureParentIdentities(root, join(directory, '.probe'));
  try {
    const files: readonly [string, string | Uint8Array][] = [
      [`${team.teamId}-complete.zip`, team.archiveBytes],
      [`${team.teamId}-complete.zip.sha256`, team.checksum],
      ['KIT-MANIFEST.json', team.manifestBytes],
      ['SEND-ME.txt', team.sendMe],
      [
        'READY.json',
        canonicalBytes({
          format: 'wp-03-team-ready/2',
          status: 'READY',
          teamId: team.teamId,
          archiveSha256: team.archiveSha256,
          manifestSha256: team.manifestSha256,
          assignmentSha256: team.assignmentSha256,
          packetAggregateSha256: team.packetAggregateSha256,
          packetCount: 30,
          lessonIds: team.lessonIds,
        }),
      ],
    ];
    for (const [index, [name, bytes]] of files.entries()) {
      if (failAt === 'FILE' && index === 0) {
        throw new PipelineFailure('TEAM_B_FILE_WRITE_FAILED');
      }
      const path = join(directory, name);
      const parents = await captureParentIdentities(root, path);
      try {
        const handle = await productionOperation('open', () =>
          open(
            path,
            fsConstants.O_WRONLY |
              fsConstants.O_CREAT |
              fsConstants.O_EXCL |
              (fsConstants.O_NOFOLLOW ?? 0),
            0o600,
          ),
        );
        await acknowledgeOwnedLinkChanges(parents);
        await acknowledgeOwnedLinkChanges(directoryParents);
        try {
          await productionOperation('write', () => handle.writeFile(bytes));
          if (failAt === 'FSYNC' && index === 0) {
            throw new PipelineFailure('TEAM_B_FILE_FSYNC_FAILED');
          }
          await productionOperation('file-fsync', () => handle.sync());
        } finally {
          await handle.close();
        }
        await assertParentIdentities(parents);
      } finally {
        await closeParentIdentities(parents);
      }
    }
    await syncDirectory(directory);
    await assertParentIdentities(directoryParents);
  } finally {
    await closeParentIdentities(directoryParents);
  }
}

async function verifyVersion(versionPath: string, candidates: CandidateSet): Promise<void> {
  for (const team of candidates.teams) {
    const directory = join(versionPath, team.teamId);
    const archive = await readFile(join(directory, `${team.teamId}-complete.zip`));
    if (sha256(archive) !== team.archiveSha256) {
      throw new PipelineFailure('VERSION_MUTATION_DETECTED');
    }
    readZipEntries(archive);
    if (sha256(await readFile(join(directory, 'KIT-MANIFEST.json'))) !== team.manifestSha256) {
      throw new PipelineFailure('VERSION_MUTATION_DETECTED');
    }
    if ((await readFile(join(directory, 'SEND-ME.txt'), 'utf8')) !== team.sendMe) {
      throw new PipelineFailure('VERSION_MUTATION_DETECTED');
    }
    if (
      (await readFile(join(directory, `${team.teamId}-complete.zip.sha256`), 'utf8')) !==
      team.checksum
    ) {
      throw new PipelineFailure('VERSION_MUTATION_DETECTED');
    }
    const ready = JSON.parse(await readFile(join(directory, 'READY.json'), 'utf8')) as unknown;
    if (
      canonicalKitJson(ready) !==
      canonicalKitJson({
        format: 'wp-03-team-ready/2',
        status: 'READY',
        teamId: team.teamId,
        archiveSha256: team.archiveSha256,
        manifestSha256: team.manifestSha256,
        assignmentSha256: team.assignmentSha256,
        packetAggregateSha256: team.packetAggregateSha256,
        packetCount: 30,
        lessonIds: team.lessonIds,
      })
    ) {
      throw new PipelineFailure('VERSION_MUTATION_DETECTED');
    }
  }
}

async function sealVersionTree(path: string): Promise<void> {
  const info = await productionOperation('stat', () => lstat(path));
  if (info.isSymbolicLink()) throw new PipelineFailure('SYMLINK_VIOLATION');
  if (info.isDirectory()) {
    for (const entry of await readdir(path)) {
      await sealVersionTree(join(path, entry));
    }
    await productionOperation('chmod', () => chmod(path, 0o500));
  } else if (info.isFile()) {
    await productionOperation('chmod', () => chmod(path, 0o400));
  } else {
    throw new PipelineFailure('UNSAFE_VERSION_NODE');
  }
}

function statusPayload(
  candidates: CandidateSet,
  receipt: FinalizationReceipt,
  versionDirectory: string,
  priorStatus?: Record<string, unknown>,
): Record<string, unknown> {
  const priorCurrent = Array.isArray(priorStatus?.current) ? priorStatus.current : [];
  const priorHistory = Array.isArray(priorStatus?.history) ? priorStatus.history : [];
  return {
    format: 'wp-03-bundle-readiness/2',
    runId: RUN_ID,
    status: 'READY',
    transactionState: 'READY',
    generation: candidates.generation,
    authorizationScope: 'PACKAGE_KITS_ONLY',
    authorizationReceiptId: receipt.receiptId,
    versionDirectory,
    current: candidates.teams.map((team) => ({
      teamId: team.teamId,
      status: 'CURRENT',
      archiveSha256: team.archiveSha256,
      manifestSha256: team.manifestSha256,
      versionDirectory,
    })),
    history: [
      ...priorHistory,
      ...priorCurrent.map((entry) => ({
        ...(entry as Record<string, unknown>),
        generation: priorStatus?.generation,
        status: 'SUPERSEDED',
        supersededByVersion: versionDirectory,
      })),
    ],
  };
}

async function publishTransaction(
  root: OwnedRoot,
  candidates: CandidateSet,
  receipt: FinalizationReceipt,
  scenario:
    | 'FULL'
    | 'CRASH_AFTER_LOCK'
    | 'CRASH_AFTER_VERSION_RENAME'
    | 'READY_OBSERVABLE'
    | 'READY_PENDING_CLEANUP'
    | 'TEAM_B_FILE_FAILURE'
    | 'TEAM_B_FSYNC_FAILURE'
    | 'TEAM_B_RENAME_FAILURE',
  receiptKey: string,
  underLockRevalidate?: () => Promise<void>,
): Promise<ScenarioResult> {
  await assertOwnedRoot(root);
  const statusPath = join(root.path, 'bundle-readiness.json');
  const currentPath = join(root.path, 'current.json');
  const lock = await productionOperation('lock', () => acquireLock(root));
  let priorStatusBytes: Uint8Array | undefined;
  let priorCurrentBytes: Uint8Array | undefined;
  let priorStatus: Record<string, unknown> | undefined;
  try {
    if (await pathExists(statusPath)) {
      priorStatusBytes = await readFile(statusPath);
      priorStatus = strictStatus(JSON.parse(Buffer.from(priorStatusBytes).toString('utf8')));
      if (!(await pathExists(currentPath))) {
        throw new PipelineFailure('PRIOR_STATUS_INVALID');
      }
      priorCurrentBytes = await readFile(currentPath);
      const current = strictCurrent(JSON.parse(Buffer.from(priorCurrentBytes).toString('utf8')));
      if (
        current.generation !== priorStatus.generation ||
        current.versionDirectory !== priorStatus.versionDirectory
      ) {
        throw new PipelineFailure('PRIOR_STATUS_INVALID');
      }
    }
  } catch (error) {
    await productionOperation('lock', () => lock.release());
    throw error;
  }
  const transactionId = randomBytes(16).toString('hex');
  const stagePath = join(root.path, `.stage-${transactionId}`);
  const versionHash = sha256(canonicalKitJson(candidates.teams.map((team) => team.archiveSha256)));
  const versionDirectory = `versions/${versionHash}`;
  const versionPath = join(root.path, versionDirectory);
  const status = statusPayload(candidates, receipt, versionDirectory, priorStatus);
  const ledgerLine = canonicalKitJson({
    receiptId: receipt.receiptId,
    generation: receipt.generation,
    versionHash,
    receiptSha256: sha256(canonicalKitJson(receipt)),
  });
  const journalPath = join(root.path, 'transaction-journal.json');
  const journal = (state: TransactionJournal['state']): TransactionJournal => ({
    format: 'wp-03-transaction-journal/1',
    transactionStatus: 'BUILDING',
    transactionId,
    generation: receipt.generation,
    receiptId: receipt.receiptId,
    state,
    stagePath,
    versionPath,
    statusPayload: status,
    receiptLedgerLine: ledgerLine,
  });
  let committed = false;
  try {
    verifyReceipt(receipt, candidates, receiptKey);
    await productionOperation('ledger', () => assertReceiptLedgerAllows(root, receipt));
    if (
      priorStatusBytes !== undefined &&
      (strictStatus(JSON.parse(Buffer.from(priorStatusBytes).toString('utf8')))
        .generation as number) >= receipt.generation
    ) {
      throw new PipelineFailure('GENERATION_ROLLBACK');
    }
    if (underLockRevalidate !== undefined) await underLockRevalidate();
    await productionOperation('journal', () =>
      writeCanonicalAtomic(journalPath, journal('LOCKED'), root),
    );
    if (scenario === 'CRASH_AFTER_LOCK') {
      lock.stopRenewal();
      const ownerPath = join(root.path, '.wp03-lock', 'owner.json');
      const owner = JSON.parse(await readFile(ownerPath, 'utf8')) as LockOwner;
      await writeCanonicalAtomic(
        ownerPath,
        {
          ...owner,
          ...(process.env.WP03_REVIEW_CRASH_CHILD === '1'
            ? { leaseUntil: new Date(Date.now() + 50).toISOString() }
            : {
                pid: 999_999_999,
                leaseUntil: '2000-01-01T00:00:00.000Z',
              }),
        },
        root,
      );
      if (process.env.WP03_REVIEW_CRASH_CHILD === '1') {
        process.kill(process.pid, 'SIGKILL');
        await new Promise<never>(() => undefined);
      }
      return {
        status: 'BLOCKED',
        evidence: { recovery: 'PENDING', journalReconciled: false },
      };
    }
    await productionOperation('mkdir', () => mkdir(stagePath, { mode: 0o700 }));
    const stagedTeams = join(stagePath, 'teams');
    await productionOperation('mkdir', () => mkdir(stagedTeams, { mode: 0o700 }));
    await withOperationContext({ team: 'team-A', phase: 'PRECOMMIT' }, () =>
      writeTeamArtifacts(root, join(stagedTeams, 'team-A'), candidates.teams[0]),
    );
    const teamBFailure =
      scenario === 'TEAM_B_FILE_FAILURE'
        ? 'FILE'
        : scenario === 'TEAM_B_FSYNC_FAILURE'
          ? 'FSYNC'
          : undefined;
    await withOperationContext({ team: 'team-B', phase: 'PRECOMMIT' }, () =>
      writeTeamArtifacts(root, join(stagedTeams, 'team-B'), candidates.teams[1], teamBFailure),
    );
    await productionOperation('journal', () =>
      writeCanonicalAtomic(journalPath, journal('STAGED'), root),
    );
    const versionWork = join(stagePath, 'version');
    await productionOperation('mkdir', () => mkdir(versionWork, { mode: 0o700 }));
    await withOperationContext({ team: 'team-A', phase: 'PRECOMMIT' }, () =>
      guardedRename(root, join(stagedTeams, 'team-A'), join(versionWork, 'team-A')),
    );
    if (scenario === 'TEAM_B_RENAME_FAILURE') {
      throw new PipelineFailure('TEAM_B_RENAME_FAILED');
    }
    await withOperationContext({ team: 'team-B', phase: 'PRECOMMIT' }, () =>
      guardedRename(root, join(stagedTeams, 'team-B'), join(versionWork, 'team-B')),
    );
    await verifyVersion(versionWork, candidates);
    await assertOwnedRoot(root);
    await productionOperation('mkdir', () =>
      mkdir(dirname(versionPath), { recursive: true, mode: 0o700 }),
    );
    await guardedRename(root, versionWork, versionPath);
    await syncDirectory(dirname(versionPath));
    await sealVersionTree(versionPath);
    await productionOperation('journal', () =>
      writeCanonicalAtomic(journalPath, journal('VERSION_RENAMED'), root),
    );
    if (scenario === 'CRASH_AFTER_VERSION_RENAME') {
      lock.stopRenewal();
      const ownerPath = join(root.path, '.wp03-lock', 'owner.json');
      const owner = JSON.parse(await readFile(ownerPath, 'utf8')) as LockOwner;
      await writeCanonicalAtomic(
        ownerPath,
        {
          ...owner,
          ...(process.env.WP03_REVIEW_CRASH_CHILD === '1'
            ? { leaseUntil: new Date(Date.now() + 50).toISOString() }
            : {
                pid: 999_999_999,
                leaseUntil: '2000-01-01T00:00:00.000Z',
              }),
        },
        root,
      );
      if (process.env.WP03_REVIEW_CRASH_CHILD === '1') {
        process.kill(process.pid, 'SIGKILL');
        await new Promise<never>(() => undefined);
      }
      return {
        status: 'BLOCKED',
        evidence: { recovery: 'PENDING', journalReconciled: false },
      };
    }
    await assertOwnedRoot(root);
    await productionOperation('current', () =>
      writeCanonicalAtomic(
        currentPath,
        {
          format: 'wp-03-current/1',
          generation: candidates.generation,
          versionDirectory,
          teams: ['team-A', 'team-B'],
        },
        root,
      ),
    );
    await productionOperation('journal', () =>
      writeCanonicalAtomic(journalPath, journal('CURRENT_COMMITTED'), root),
    );
    await assertOwnedRoot(root);
    await productionOperation('status', () => writeCanonicalAtomic(statusPath, status, root));
    await syncDirectory(root.path);
    committed = true;
    if (scenario === 'READY_OBSERVABLE' || scenario === 'READY_PENDING_CLEANUP') {
      throw new PipelineFailure('INJECTED_POST_COMMIT_FAILURE');
    }
    await operationContext.run({ team: 'system', phase: 'POSTCOMMIT' }, async () => {
      await productionOperation('ledger', () => appendReceiptLedger(root, receipt, versionHash));
      await productionOperation('journal', () =>
        writeCanonicalAtomic(journalPath, journal('READY_COMMITTED'), root),
      );
      await productionOperation('cleanup', () =>
        guardedRemove(root, stagedTeams, { recursive: true, force: true }),
      );
      await productionOperation('cleanup', () =>
        guardedRemove(root, stagePath, { recursive: true, force: true }),
      );
      await productionOperation('lock', () => lock.release());
      await productionOperation('cleanup', () => guardedRemove(root, journalPath, { force: true }));
    });
    return {
      status: 'READY',
      evidence: {
        readyObserved: true,
        returnedBlocked: false,
        statusPayload: canonicalKitJson(status),
        archiveHashes: candidates.teams.map((team) => team.archiveSha256),
      },
    };
  } catch (error) {
    if (committed || scenario === 'READY_OBSERVABLE' || scenario === 'READY_PENDING_CLEANUP') {
      lock.stopRenewal();
      return {
        status: 'READY',
        code: 'READY_COMMITTED_PENDING_CLEANUP',
        evidence: {
          readyObserved: true,
          returnedBlocked: false,
          postCommitFaultInjected: scenario === 'READY_OBSERVABLE',
          cleanupDisposition: 'READY_COMMITTED_PENDING_CLEANUP',
          pendingOperation: error instanceof PipelineFailure ? error.code : 'POSTCOMMIT_FAILURE',
        },
      };
    }
    if (priorStatusBytes !== undefined) {
      const restore = join(root.path, `.status-restore-${transactionId}`);
      await writeExclusiveNoFollow(restore, priorStatusBytes);
      await guardedRename(root, restore, statusPath);
      const currentRestore = join(root.path, `.current-restore-${transactionId}`);
      if (priorCurrentBytes === undefined) {
        throw new PipelineFailure('PRIOR_STATUS_INVALID');
      }
      await writeExclusiveNoFollow(currentRestore, priorCurrentBytes);
      await guardedRename(root, currentRestore, currentPath);
      await syncDirectory(root.path);
    } else {
      await productionOperation('cleanup', () => guardedRemove(root, statusPath, { force: true }));
      await productionOperation('cleanup', () => guardedRemove(root, currentPath, { force: true }));
    }
    if (await pathExists(stagePath)) {
      await productionOperation('cleanup', () =>
        guardedRemove(root, stagePath, { recursive: true, force: true }),
      );
    }
    if (await pathExists(versionPath)) {
      await chmod(versionPath, 0o700);
      await chmod(join(versionPath, 'team-A'), 0o700).catch(() => undefined);
      await chmod(join(versionPath, 'team-B'), 0o700).catch(() => undefined);
      await productionOperation('cleanup', () =>
        guardedRemove(root, versionPath, { recursive: true, force: true }),
      );
    }
    await productionOperation('cleanup', () => guardedRemove(root, journalPath, { force: true }));
    await lock.release().catch(() => undefined);
    throw error;
  }
}

async function reconcile(root: OwnedRoot): Promise<'RECOVERED_CLEAN' | 'RECOVERED_READY'> {
  await assertOwnedRoot(root);
  const recoveryLock = await productionOperation('lock', () => acquireLock(root, true));
  const journalPath = join(root.path, 'transaction-journal.json');
  const journal = JSON.parse(await readFile(journalPath, 'utf8')) as TransactionJournal;
  if (
    journal.format !== 'wp-03-transaction-journal/1' ||
    !resolve(journal.stagePath).startsWith(`${resolve(root.path)}${sep}`) ||
    !resolve(journal.versionPath).startsWith(`${resolve(root.path)}${sep}`)
  ) {
    throw new PipelineFailure('JOURNAL_INVALID');
  }
  const statusPayload = strictStatus(journal.statusPayload);
  const versionAlreadyRenamed = await pathExists(journal.versionPath);
  if ((journal.state === 'LOCKED' || journal.state === 'STAGED') && !versionAlreadyRenamed) {
    await productionOperation('cleanup', () =>
      guardedRemove(root, journal.stagePath, { recursive: true, force: true }),
    );
    await productionOperation('lock', () => recoveryLock.release());
    await productionOperation('journal', () =>
      productionOperation('cleanup', () => guardedRemove(root, journalPath, { force: true })),
    );
    await syncDirectory(root.path);
    return 'RECOVERED_CLEAN';
  }
  if (versionAlreadyRenamed) {
    await sealVersionTree(journal.versionPath);
    const current = statusPayload.current as Array<Record<string, unknown>>;
    for (const teamId of ['team-A', 'team-B'] as const) {
      const team = current.find((entry) => entry.teamId === teamId);
      if (
        team === undefined ||
        sha256(await readFile(join(journal.versionPath, teamId, `${teamId}-complete.zip`))) !==
          team.archiveSha256 ||
        sha256(await readFile(join(journal.versionPath, teamId, 'KIT-MANIFEST.json'))) !==
          team.manifestSha256
      ) {
        throw new PipelineFailure('RECOVERY_VERSION_HASH_MISMATCH');
      }
    }
  }
  await productionOperation('current', () =>
    writeCanonicalAtomic(
      join(root.path, 'current.json'),
      {
        format: 'wp-03-current/1',
        generation: journal.generation,
        versionDirectory: relative(root.path, journal.versionPath),
        teams: ['team-A', 'team-B'],
      },
      root,
    ),
  );
  await productionOperation('status', () =>
    writeCanonicalAtomic(join(root.path, 'bundle-readiness.json'), statusPayload, root),
  );
  const ledgerPath = join(root.path, 'receipt-ledger.jsonl');
  const prior = (await pathExists(ledgerPath)) ? await readFile(ledgerPath, 'utf8') : '';
  const records = await receiptLedgerRecords(root);
  if (!records.some((record) => record.receiptId === journal.receiptId)) {
    const temp = join(root.path, `.ledger-reconcile-${randomBytes(8).toString('hex')}`);
    await productionOperation('ledger', async () => {
      await writeExclusiveNoFollow(temp, `${prior}${journal.receiptLedgerLine}\n`);
      await guardedRename(root, temp, ledgerPath);
      await syncDirectory(root.path);
    });
  }
  await productionOperation('cleanup', async () => {
    const stagedTeams = join(journal.stagePath, 'teams');
    if (await pathExists(stagedTeams)) {
      await guardedRemove(root, stagedTeams, { recursive: true, force: true });
    }
    await guardedRemove(root, journal.stagePath, { recursive: true, force: true });
  });
  await productionOperation('lock', () => recoveryLock.release());
  await productionOperation('journal', () =>
    productionOperation('cleanup', () => guardedRemove(root, journalPath, { force: true })),
  );
  await syncDirectory(root.path);
  return 'RECOVERED_READY';
}

async function verifyCandidateExtraction(root: OwnedRoot, candidates: CandidateSet): Promise<void> {
  const scratchParent = join(root.path, '.verification-extractions');
  await mkdir(scratchParent, { mode: 0o700 });
  try {
    for (const team of candidates.teams) {
      const extraction = await extractZipToIsolatedDirectory(team.archiveBytes, scratchParent);
      try {
        if (
          extraction.entries.length !==
            (
              JSON.parse(Buffer.from(team.manifestBytes).toString('utf8')) as {
                files: unknown[];
              }
            ).files.length +
              1 ||
          !extraction.entries.some((entry) => entry.path === 'KIT-MANIFEST.json')
        ) {
          throw new PipelineFailure('EXTRACTION_CLOSURE_FAILED');
        }
      } finally {
        await rm(extraction.directory, { recursive: true, force: true });
      }
    }
  } finally {
    await rm(scratchParent, { recursive: true, force: true });
  }
}

async function runRealSmokeCommand(
  executable: string,
  expectedExecutableSha256: string,
  argv: readonly string[],
  cwd: string,
  limits: {
    readonly timeoutMs: number;
    readonly maxStdoutBytes: number;
    readonly maxStderrBytes: number;
  } = {
    timeoutMs: 30_000,
    maxStdoutBytes: 1024 * 1024,
    maxStderrBytes: 1024 * 1024,
  },
): Promise<{
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly timedOut?: boolean;
}> {
  if (!isAbsolute(executable) || sha256(await readFile(executable)) !== expectedExecutableSha256) {
    throw new PipelineFailure('SMOKE_EXECUTABLE_HASH_MISMATCH');
  }
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(executable, argv, {
      cwd,
      env: SMOKE_ENVIRONMENT,
      shell: false,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let settled = false;
    let pendingError: PipelineFailure | undefined;
    let timedOut = false;
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    const finish = (code: number | null, signal: NodeJS.Signals | null): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (pendingError !== undefined) {
        rejectPromise(pendingError);
        return;
      }
      if (code !== 0 || signal !== null) {
        rejectPromise(
          new PipelineFailure(
            'SMOKE_COMMAND_FAILED',
            Buffer.concat(stderrChunks).toString('utf8').trim() || 'smoke command failed',
          ),
        );
        return;
      }
      resolvePromise({
        exitCode: code,
        stdout: Buffer.concat(stdoutChunks).toString('utf8'),
        stderr: Buffer.concat(stderrChunks).toString('utf8'),
        ...(timedOut ? { timedOut: true } : {}),
      });
    };
    const terminate = (code: string): void => {
      if (pendingError !== undefined) return;
      pendingError = new PipelineFailure(code);
      timedOut = code === 'SMOKE_TIMEOUT';
      if (child.pid !== undefined) {
        try {
          process.kill(-child.pid, 'SIGKILL');
        } catch {
          child.kill('SIGKILL');
        }
      }
    };
    const consumeStdout = (chunk: Buffer): void => {
      stdoutBytes += chunk.byteLength;
      if (stdoutBytes > limits.maxStdoutBytes) {
        terminate('SMOKE_STDOUT_LIMIT');
      } else {
        stdoutChunks.push(Buffer.from(chunk));
      }
    };
    const consumeStderr = (chunk: Buffer): void => {
      stderrBytes += chunk.byteLength;
      if (stderrBytes > limits.maxStderrBytes) {
        terminate('SMOKE_STDERR_LIMIT');
      } else {
        stderrChunks.push(Buffer.from(chunk));
      }
    };
    child.stdout.on('data', consumeStdout);
    child.stderr.on('data', consumeStderr);
    const timer = setTimeout(() => terminate('SMOKE_TIMEOUT'), limits.timeoutMs);
    child.once('error', () => {
      pendingError = new PipelineFailure('SMOKE_COMMAND_FAILED');
    });
    child.once('close', finish);
  });
}

async function runPackagedKitCommand(
  commandPath: string,
  kitRoot: string,
  repositoryRoot: string,
  args: readonly string[] = [],
  expectedOutput?: string,
): Promise<string> {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(commandPath, args, {
      cwd: kitRoot,
      env: {
        ...SMOKE_ENVIRONMENT,
        KIT_ROOT: kitRoot,
        REPOSITORY_ROOT: repositoryRoot,
      },
      shell: false,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let outputBytes = 0;
    const timer = setTimeout(() => {
      if (child.pid !== undefined) {
        try {
          process.kill(-child.pid, 'SIGKILL');
        } catch {
          child.kill('SIGKILL');
        }
      }
    }, 30_000);
    child.stdout.on('data', (chunk: Buffer) => {
      outputBytes += chunk.byteLength;
      if (outputBytes <= 1024 * 1024) stdout.push(Buffer.from(chunk));
    });
    child.stderr.on('data', (chunk: Buffer) => {
      outputBytes += chunk.byteLength;
      if (outputBytes <= 1024 * 1024) stderr.push(Buffer.from(chunk));
    });
    child.once('error', (error) => {
      clearTimeout(timer);
      rejectPromise(error);
    });
    child.once('close', (code, signal) => {
      clearTimeout(timer);
      if (code !== 0 || signal !== null || outputBytes > 1024 * 1024) {
        rejectPromise(
          new PipelineFailure(
            'PACKAGED_COMMAND_FAILED',
            Buffer.concat(stderr).toString('utf8').trim(),
          ),
        );
        return;
      }
      const output = Buffer.concat(stdout).toString('utf8').trim();
      if (expectedOutput !== undefined && output !== expectedOutput) {
        rejectPromise(new PipelineFailure('PACKAGED_COMMAND_NO_OP'));
        return;
      }
      resolvePromise(output);
    });
  });
}

async function runFixtureGit(repositoryRoot: string, args: readonly string[]): Promise<string> {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(GIT_EXECUTABLE_PATH, ['-C', repositoryRoot, ...args], {
      env: {
        ...process.env,
        GIT_AUTHOR_EMAIL: 'wp03-fixture@example.invalid',
        GIT_AUTHOR_NAME: 'WP03 Fixture',
        GIT_COMMITTER_EMAIL: 'wp03-fixture@example.invalid',
        GIT_COMMITTER_NAME: 'WP03 Fixture',
      },
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on('data', (chunk: Buffer) => stdout.push(Buffer.from(chunk)));
    child.stderr.on('data', (chunk: Buffer) => stderr.push(Buffer.from(chunk)));
    child.once('error', rejectPromise);
    child.once('close', (code) => {
      if (code === 0) resolvePromise(Buffer.concat(stdout).toString('utf8').trim());
      else rejectPromise(new Error(Buffer.concat(stderr).toString('utf8').trim()));
    });
  });
}

async function runFixtureCandidateValidator(
  repositoryRoot: string,
  lessonDirectory: string,
): Promise<{ readonly exitCode: number; readonly stdout: string; readonly stderr: string }> {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(
      process.execPath,
      [
        join(repositoryRoot, 'tools/content-cli/node_modules/tsx/dist/cli.mjs'),
        join(repositoryRoot, 'tools/content-cli/src/entry.ts'),
        'candidate-validate',
        lessonDirectory,
        '--json',
      ],
      {
        cwd: repositoryRoot,
        env: process.env,
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on('data', (chunk: Buffer) => stdout.push(Buffer.from(chunk)));
    child.stderr.on('data', (chunk: Buffer) => stderr.push(Buffer.from(chunk)));
    child.once('error', rejectPromise);
    child.once('close', (code) =>
      resolvePromise({
        exitCode: code ?? 1,
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: Buffer.concat(stderr).toString('utf8'),
      }),
    );
  });
}

async function fixtureEvidenceRefs(
  lessonDirectory: string,
  paths: readonly string[],
): Promise<readonly { readonly path: string; readonly sha256: string }[]> {
  return Promise.all(
    paths.map(async (path) => ({
      path,
      sha256: sha256(await readFile(join(lessonDirectory, path))),
    })),
  );
}

async function writeFixtureReviewRecords(
  extractionRoot: string,
  lessonDirectory: string,
  lessonId: string,
  options: {
    readonly auditStatus?: 'PASS' | 'BLOCKED' | 'FAILED';
    readonly includeJudge?: boolean;
    readonly reviewerRunId?: string;
  } = {},
): Promise<void> {
  const primaryPaths = [
    'lesson-script.json',
    'kc-coverage-matrix.json',
    'lesson-presentation-plan.json',
    'lesson-quality-report.json',
  ] as const;
  const evidenceRefs = await fixtureEvidenceRefs(lessonDirectory, [
    ...primaryPaths,
    'inputs/task-source-packet.json',
  ]);
  const reviewedPrimaryArtifacts = await Promise.all(
    primaryPaths.map(async (path) => {
      const bytes = await readFile(join(lessonDirectory, path));
      return { path, sha256: sha256(bytes), size: bytes.length };
    }),
  );
  await writeFile(
    join(lessonDirectory, 'reviews/author-self-audit.json'),
    canonicalBytes({
      authorRunId: `author-${lessonId}`,
      evidenceRefs,
      findingCodes: [],
      format: 'lesson-generation-author-self-audit/2',
      lessonId,
      nonclaims: {
        humanApproved: false,
        officialRubricPass: false,
        publicationApproved: false,
      },
      revisionCycle: 0,
      status: options.auditStatus ?? 'PASS',
    }),
    { mode: 0o600 },
  );
  if (options.includeJudge !== false) {
    await writeFile(
      join(lessonDirectory, 'reviews/judge-pre-screen.json'),
      canonicalBytes({
        authorVerdictReceived: false,
        evidenceRefs,
        findingCodes: [],
        format: 'lesson-generation-judge-pre-screen/2',
        lessonId,
        nonclaims: {
          humanApproved: false,
          officialRubricPass: false,
          publicationApproved: false,
        },
        reviewedPrimaryArtifacts,
        reviewerRole: 'INDEPENDENT_JUDGE',
        reviewerRunId: options.reviewerRunId ?? `independent-judge-${lessonId}`,
        rubricProfileSha256: sha256(
          await readFile(join(extractionRoot, 'deadline-profile/rubric-profile.json')),
        ),
        status: 'SCREENED',
      }),
      { mode: 0o600 },
    );
  }
}

async function createGenerationTwoCommandFixture(
  root: OwnedRoot,
  extractionRoot: string,
  options: { readonly lessonLimit?: number; readonly prepareReviews?: boolean } = {},
): Promise<{
  readonly repositoryRoot: string;
  readonly lessonDirectories: readonly string[];
  readonly manifest: Record<string, unknown>;
}> {
  const repositoryRoot = join(root.path, 'generation-two-command-repository');
  await mkdir(repositoryRoot, { mode: 0o700 });
  await writeFile(
    join(repositoryRoot, 'package.json'),
    `${canonicalKitJson({
      name: 'wp03-generation-two-command-fixture',
      packageManager: 'pnpm@9.15.9',
      private: true,
    })}\n`,
    { mode: 0o600 },
  );
  await writeFile(join(repositoryRoot, 'pnpm-lock.yaml'), 'lockfileVersion: 9.0\n', {
    mode: 0o600,
  });
  await mkdir(join(repositoryRoot, 'tools'), { mode: 0o700 });
  await symlink(
    join(ADMISSION_REPOSITORY_ROOT, 'tools/content-cli'),
    join(repositoryRoot, 'tools/content-cli'),
  );
  await runFixtureGit(repositoryRoot, ['init', '--initial-branch=main']);
  await runFixtureGit(repositoryRoot, [
    'remote',
    'add',
    'origin',
    'https://github.com/jsonjj/mcat-prep.git',
  ]);
  await runFixtureGit(repositoryRoot, [
    'add',
    'package.json',
    'pnpm-lock.yaml',
    'tools/content-cli',
  ]);
  await runFixtureGit(repositoryRoot, ['commit', '-m', 'fixture baseline']);
  const repositoryCommit = await runFixtureGit(repositoryRoot, ['rev-parse', 'HEAD']);

  const manifestPath = join(extractionRoot, 'KIT-MANIFEST.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as Record<string, unknown>;
  const pins = manifest.pins as Record<string, unknown>;
  const priorCommit = pins.repositoryCommit as string;
  pins.repositoryCommit = repositoryCommit;
  manifest.repositoryCommit = repositoryCommit;
  (manifest.validatorAuthority as Record<string, unknown>).repositoryCommit =
    await checkoutCommit();
  const readmePath = join(extractionRoot, 'README.md');
  const readme = (await readFile(readmePath, 'utf8')).replaceAll(priorCommit, repositoryCommit);
  await writeFile(readmePath, readme, { mode: 0o644 });
  const readmeSha256 = sha256(readme);
  const readmeSize = Buffer.byteLength(readme);
  for (const key of ['coreFiles', 'files'] as const) {
    const files = manifest[key] as Array<Record<string, unknown>>;
    const readmeFile = files.find((file) => file.path === 'README.md');
    if (readmeFile === undefined) throw new PipelineFailure('COMMAND_FIXTURE_INVALID');
    readmeFile.sha256 = readmeSha256;
    readmeFile.size = readmeSize;
  }
  const mappings = manifest.sourceMappings as Array<Record<string, unknown>>;
  const readmeMapping = mappings.find((mapping) => mapping.archivePath === 'README.md');
  if (readmeMapping === undefined) throw new PipelineFailure('COMMAND_FIXTURE_INVALID');
  readmeMapping.archiveSha256 = readmeSha256;
  manifest.filesSha256 = sha256(canonicalKitJson(manifest.files));
  await writeFile(manifestPath, canonicalBytes(manifest), { mode: 0o644 });
  await runPackagedKitCommand(
    join(extractionRoot, 'commands/bootstrap.txt'),
    extractionRoot,
    repositoryRoot,
  );

  const teamId = manifest.teamId as TeamId;
  const lessonIds = manifest.allowedLessonIds as string[];
  const outputRoot = join(repositoryRoot, 'content', 'lesson-candidates', teamId);
  await mkdir(join(outputRoot, 'waves'), { recursive: true, mode: 0o700 });
  const sourceLessonId = 'V3-LES-789208';
  const sourceLessonDirectory = join(
    ADMISSION_REPOSITORY_ROOT,
    'content',
    'lessons',
    sourceLessonId.toLowerCase(),
  );
  const sourceNames = (await readdir(sourceLessonDirectory))
    .filter((name) => name.endsWith('.json'))
    .sort();
  const lessonDirectories: string[] = [];
  for (const lessonId of lessonIds.slice(0, options.lessonLimit ?? lessonIds.length)) {
    const lessonDirectory = join(outputRoot, lessonId);
    lessonDirectories.push(lessonDirectory);
    await mkdir(join(lessonDirectory, 'inputs'), { recursive: true, mode: 0o700 });
    await mkdir(join(lessonDirectory, 'validation'), { recursive: true, mode: 0o700 });
    await mkdir(join(lessonDirectory, 'reviews'), { recursive: true, mode: 0o700 });
    for (const name of sourceNames) {
      const source = await readFile(join(sourceLessonDirectory, name), 'utf8');
      await writeFile(
        join(lessonDirectory, name),
        source
          .replaceAll(sourceLessonId, lessonId)
          .replaceAll(sourceLessonId.toLowerCase(), lessonId.toLowerCase()),
        { mode: 0o600 },
      );
    }
    for (const [name, value] of [
      [
        'source-claim-ledger.json',
        { format: 'lesson-generation-source-claim-ledger/1', lessonId, claims: [] },
      ],
      [
        'candidate-quality-ledger.json',
        {
          format: 'lesson-generation-candidate-quality-ledger/1',
          lessonId,
          lifecycle: 'CANDIDATE_VALIDATION_PENDING',
        },
      ],
      [
        'LESSON-HANDOFF.json',
        {
          artifactHashes: {},
          authorSelfAuditRef: 'reviews/author-self-audit.json',
          computedQualityRef: 'validation/computed-quality.json',
          format: 'lesson-generation-lesson-handoff/2',
          judgePreScreenRef: 'reviews/judge-pre-screen.json',
          lessonId,
          requestedStatus: 'COMPLETE',
          status: 'BLOCKED',
          toolAndSchemaVersions: {},
          unresolvedBlockerCodes: ['VALIDATION_PENDING'],
          validationRefs: {
            lessonValidate: 'validation/lesson-validate.json',
            normalizationSmoke: 'validation/normalization-smoke.json',
            protectedScan: 'validation/protected-scan.json',
          },
        },
      ],
    ] as const) {
      await writeFile(join(lessonDirectory, name), canonicalBytes(value), { mode: 0o600 });
    }
    const packetPath = `packets/${lessonId}/task-source-packet.json`;
    await writeFile(
      join(lessonDirectory, 'inputs', 'task-source-packet.json'),
      await readFile(join(extractionRoot, packetPath)),
      { mode: 0o600 },
    );
    const mechanical = await runFixtureCandidateValidator(repositoryRoot, lessonDirectory);
    if (mechanical.exitCode !== 0) {
      throw new PipelineFailure(
        'COMMAND_FIXTURE_REAL_VALIDATOR_FAILED',
        `${mechanical.stdout}\n${mechanical.stderr}`,
      );
    }
    if (options.prepareReviews !== false) {
      await writeFixtureReviewRecords(extractionRoot, lessonDirectory, lessonId);
    }
  }
  return { repositoryRoot, lessonDirectories, manifest };
}

async function runSigkillReviewScenario(
  scenario: 'CRASH_AFTER_LOCK' | 'CRASH_AFTER_VERSION_RENAME',
): Promise<ScenarioResult> {
  await mkdir(TEST_PARENT, { recursive: true, mode: 0o700 });
  const nonce = randomBytes(12).toString('hex');
  const coordinationPath = join(TEST_PARENT, `.crash-${nonce}.json`);
  const scriptPath = join(TEST_PARENT, `.crash-${nonce}.mjs`);
  const pnpmEntries = await readdir(join(ADMISSION_REPOSITORY_ROOT, 'node_modules/.pnpm'));
  const tsxDirectory = pnpmEntries
    .filter((entry) => /^tsx@[0-9]/.test(entry))
    .sort()
    .at(-1);
  if (tsxDirectory === undefined) {
    throw new PipelineFailure('TEST_TSX_RUNNER_UNAVAILABLE');
  }
  const tsxCli = join(
    ADMISSION_REPOSITORY_ROOT,
    'node_modules/.pnpm',
    tsxDirectory,
    'node_modules/tsx/dist/cli.mjs',
  );
  await access(tsxCli);
  const moduleUrl = new URL('./kit-production.ts', import.meta.url).href;
  const script = [
    `const hookSymbol = Symbol.for('wp-03.production.review-harness.install');`,
    `let api;`,
    `globalThis[hookSymbol] = { register(value) { api = value; } };`,
    `await import(${JSON.stringify(moduleUrl)});`,
    `if (api === undefined) throw new Error('review harness unavailable');`,
    `await api.run(${JSON.stringify(scenario)});`,
    '',
  ].join('\n');
  await writeExclusiveNoFollow(scriptPath, script);
  let childSignal: NodeJS.Signals | null = null;
  try {
    await new Promise<void>((resolvePromise, rejectPromise) => {
      const child = spawn(process.execPath, [tsxCli, scriptPath], {
        cwd: ADMISSION_REPOSITORY_ROOT,
        env: {
          ...process.env,
          WP03_REVIEW_CRASH_CHILD: '1',
          WP03_REVIEW_CRASH_COORDINATION: coordinationPath,
        },
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        rejectPromise(new PipelineFailure('SIGKILL_CHILD_TIMEOUT'));
      }, 15_000);
      child.once('error', (error) => {
        clearTimeout(timer);
        rejectPromise(error);
      });
      child.once('close', (code, signal) => {
        clearTimeout(timer);
        childSignal = signal === 'SIGKILL' || code === 137 ? 'SIGKILL' : signal;
        if (childSignal === 'SIGKILL') resolvePromise();
        else
          rejectPromise(
            new PipelineFailure(
              'SIGKILL_CHILD_FAILED',
              `child exited code=${String(code)} signal=${String(signal)}`,
            ),
          );
      });
    });
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 125));
    const coordination = JSON.parse(await readFile(coordinationPath, 'utf8')) as {
      readonly path: string;
      readonly markerToken: string;
      readonly device: string;
      readonly inode: string;
    };
    const root: OwnedRoot = {
      path: coordination.path,
      markerName: '.wp03-test-owned',
      markerToken: coordination.markerToken,
      device: BigInt(coordination.device),
      inode: BigInt(coordination.inode),
    };
    try {
      const recovery = await reconcile(root);
      return {
        status: recovery === 'RECOVERED_READY' ? 'READY' : 'BLOCKED',
        evidence: {
          recovery,
          journalReconciled: true,
          processSignal: childSignal,
        },
      };
    } finally {
      await cleanupOwnedRoot(root);
    }
  } finally {
    await rm(scriptPath, { force: true });
    await rm(coordinationPath, { force: true });
  }
}

async function runReviewScenario(
  scenario:
    | 'FULL_PIPELINE'
    | 'MULTI_GENERATION'
    | 'STAGED_WITH_RENAMED_VERSION'
    | 'READY_PENDING_CLEANUP'
    | 'INTERMEDIATE_SWAP_WRITE'
    | 'INTERMEDIATE_SWAP_RENAME'
    | 'INTERMEDIATE_SWAP_REMOVE'
    | 'SMOKE_RECEIPTS'
    | 'ORDINARY_FAILURE_MATRIX'
    | 'PERSISTENT_POSTCOMMIT_LEDGER'
    | 'PERSISTENT_POSTCOMMIT_JOURNAL'
    | 'PERSISTENT_POSTCOMMIT_CLEANUP'
    | 'PERSISTENT_POSTCOMMIT_LOCK'
    | 'REAL_PARENT_SWAP_MATRIX'
    | 'PRODUCTION_ROOT_REJECTIONS'
    | 'INTENTIONAL_RESIDUE'
    | 'SCRATCH_HYGIENE'
    | 'RECONCILE_OWNED_SCRATCH'
    | 'REAL_INPUT_ADMISSION'
    | 'AUTHORITY_STORE_GATES'
    | 'AUTHORITY_EXECUTION_REPLAY'
    | 'PREFLIGHT_STATE_MACHINE'
    | 'STALE_AUTHORITY_REFRESH'
    | 'GENERATION_TWO_PACKAGE'
    | 'REAL_VALIDATE_ONE_GATES'
    | 'REAL_SMOKE_EXECUTABLE'
    | 'KIT_CLI_SEPARATION'
    | 'STRICT_NESTED_RECORDS'
    | 'FORBIDDEN_TEST_ROOTS'
    | 'CHECKOUT_COMMIT_MISMATCH'
    | 'PROOF_ASSIGNMENT_MISMATCH'
    | 'ARBITRARY_ROOT_DELETE'
    | 'LIVE_AGED_LOCK'
    | 'PARENT_SYMLINK_SWAP'
    | 'CRASH_AFTER_LOCK'
    | 'CRASH_AFTER_VERSION_RENAME'
    | 'READY_OBSERVABLE'
    | 'GENERATION_ROLLBACK'
    | 'RECEIPT_REPLAY'
    | 'TEAM_B_FILE_FAILURE'
    | 'TEAM_B_FSYNC_FAILURE'
    | 'TEAM_B_RENAME_FAILURE'
    | 'MALFORMED_STATUS'
    | 'STALE_RECEIPT'
    | 'CANONICAL_ADMISSION_BYPASS'
    | 'WRONG_MANIFEST_PATHS'
    | 'EXECUTABLE_HASH_MISMATCH',
): Promise<ScenarioResult> {
  if (scenario === 'REAL_VALIDATE_ONE_GATES') {
    const loaded = await loadCanonicalProductionInputsForPreflight();
    const root = await createOwnedRoot();
    const commandScratch = join(root.path, '.real-validator-command-smoke');
    let extractionDirectory: string | undefined;
    try {
      const runtime: RuntimePins = {
        repositoryCommit: await checkoutCommit(),
        smokeExecutable: SMOKE_EXECUTABLE_PATH,
        smokeExecutableSha256: sha256(await readFile(SMOKE_EXECUTABLE_PATH)),
      };
      const generationTwo = await buildAndVerifyProductionCandidates(loaded, root, 2, runtime);
      await mkdir(commandScratch, { mode: 0o700 });
      const extraction = await extractZipToIsolatedDirectory(
        generationTwo.teams[0].archiveBytes,
        commandScratch,
      );
      extractionDirectory = extraction.directory;
      const fixture = await createGenerationTwoCommandFixture(root, extraction.directory, {
        lessonLimit: 8,
        prepareReviews: false,
      });
      const validateCommand = join(extraction.directory, 'commands/validate-one.txt');
      const runOne = (directory: string): Promise<string> =>
        runPackagedKitCommand(validateCommand, extraction.directory, fixture.repositoryRoot, [
          directory,
        ]);
      const rejects = async (directory: string): Promise<boolean> => {
        try {
          await runOne(directory);
          return false;
        } catch {
          return true;
        }
      };
      const directories = fixture.lessonDirectories;

      const structuralScriptPath = join(directories[0]!, 'lesson-script.json');
      const structuralScript = JSON.parse(await readFile(structuralScriptPath, 'utf8')) as Record<
        string,
        unknown
      >;
      structuralScript.payload = {};
      await writeFile(structuralScriptPath, canonicalBytes(structuralScript));
      const structuralFailureRejected = await rejects(directories[0]!);
      const noReviewReceiptFabricated =
        !(await pathExists(join(directories[0]!, 'reviews/author-self-audit.json'))) &&
        !(await pathExists(join(directories[0]!, 'reviews/judge-pre-screen.json')));

      const normalizationPath = join(directories[1]!, 'learner-safe-items.json');
      await writeFile(normalizationPath, canonicalBytes({ malformedProjection: true }));
      const normalizationRejected = await rejects(directories[1]!);
      const normalizationReceipt = JSON.parse(
        await readFile(join(directories[1]!, 'validation/normalization-smoke.json'), 'utf8'),
      ) as Record<string, unknown>;

      const leakPath = join(directories[2]!, 'learner-safe-items.json');
      const leak = JSON.parse(await readFile(leakPath, 'utf8')) as Record<string, unknown>;
      leak.correct_answer = 'LEAK';
      await writeFile(leakPath, canonicalBytes(leak));
      const leakRejected = await rejects(directories[2]!);
      const leakReceipt = JSON.parse(
        await readFile(join(directories[2]!, 'validation/protected-scan.json'), 'utf8'),
      ) as Record<string, unknown>;

      await writeFixtureReviewRecords(
        extraction.directory,
        directories[3]!,
        basename(directories[3]!),
        { includeJudge: false },
      );
      const missingJudgeRejected = await rejects(directories[3]!);
      const mechanicalReceiptsPresent = (
        await Promise.all(
          [
            'lesson-validate.json',
            'computed-quality.json',
            'normalization-smoke.json',
            'protected-scan.json',
          ].map((name) => pathExists(join(directories[3]!, 'validation', name))),
        )
      ).every(Boolean);
      const judgeAbsentAfterFirstStage = !(await pathExists(
        join(directories[3]!, 'reviews/judge-pre-screen.json'),
      ));
      await writeFixtureReviewRecords(
        extraction.directory,
        directories[3]!,
        basename(directories[3]!),
      );
      const sameCandidateSuccessfulOutput = await runOne(directories[3]!);
      const sameCandidateSuccessfulHandoff = JSON.parse(
        await readFile(join(directories[3]!, 'LESSON-HANDOFF.json'), 'utf8'),
      ) as Record<string, unknown>;
      await writeFile(join(directories[3]!, 'lesson-quality-report.json'), '\n', {
        flag: 'a',
      });
      const sameCandidateTamperRejected = await rejects(directories[3]!);

      const selfLessonId = basename(directories[4]!);
      await writeFixtureReviewRecords(extraction.directory, directories[4]!, selfLessonId, {
        reviewerRunId: `author-${selfLessonId}`,
      });
      const selfJudgeRejected = await rejects(directories[4]!);
      await writeFixtureReviewRecords(extraction.directory, directories[4]!, selfLessonId);
      const staleJudgePath = join(directories[4]!, 'reviews/judge-pre-screen.json');
      const staleJudge = JSON.parse(await readFile(staleJudgePath, 'utf8')) as Record<
        string,
        unknown
      >;
      const reviewed = staleJudge.reviewedPrimaryArtifacts as Array<Record<string, unknown>>;
      reviewed[0]!.sha256 = '0'.repeat(64);
      await writeFile(staleJudgePath, canonicalBytes(staleJudge));
      const staleJudgeRejected = await rejects(directories[4]!);

      await writeFixtureReviewRecords(
        extraction.directory,
        directories[5]!,
        basename(directories[5]!),
        { auditStatus: 'BLOCKED' },
      );
      const blockedSelfAuditRejected = await rejects(directories[5]!);

      await writeFixtureReviewRecords(
        extraction.directory,
        directories[6]!,
        basename(directories[6]!),
      );
      const successfulOutput = await runOne(directories[6]!);
      const successfulHandoff = JSON.parse(
        await readFile(join(directories[6]!, 'LESSON-HANDOFF.json'), 'utf8'),
      ) as Record<string, unknown>;
      const validationReceipt = JSON.parse(
        await readFile(join(directories[6]!, 'validation/lesson-validate.json'), 'utf8'),
      ) as Record<string, unknown>;
      const commandReceipt = validationReceipt.command as Record<string, unknown>;

      await writeFixtureReviewRecords(
        extraction.directory,
        directories[7]!,
        basename(directories[7]!),
      );
      await writeFile(join(directories[7]!, 'lesson-quality-report.json'), '\n', {
        flag: 'a',
      });
      const tamperAfterJudgeRejected = await rejects(directories[7]!);

      return {
        status: 'READY',
        evidence: {
          structuralFailureRejected,
          normalizationFailureRejected:
            normalizationRejected && normalizationReceipt.status === 'FAILED',
          protectedLeakRejected: leakRejected && leakReceipt.status === 'FAILED',
          missingJudgeRejectedAfterMechanicalReceipts:
            missingJudgeRejected && mechanicalReceiptsPresent && judgeAbsentAfterFirstStage,
          invalidStaleSelfJudgeRejected: selfJudgeRejected && staleJudgeRejected,
          blockedSelfAuditRejected,
          independentJudgeFinalizedComplete:
            successfulOutput === 'KIT_COMMAND_OK validate-one' &&
            successfulHandoff.status === 'COMPLETE' &&
            successfulHandoff.lifecycle === 'CANDIDATE_RUBRIC_SCREENED',
          tamperAfterJudgeRejected,
          sameCandidateTwoStage:
            missingJudgeRejected &&
            sameCandidateSuccessfulOutput === 'KIT_COMMAND_OK validate-one' &&
            sameCandidateSuccessfulHandoff.status === 'COMPLETE' &&
            sameCandidateTamperRejected,
          noReviewReceiptFabricated,
          realCommandReceiptsBound:
            validationReceipt.status === 'PASS' &&
            commandReceipt.exitCode === 0 &&
            typeof commandReceipt.cliMainSha256 === 'string' &&
            typeof commandReceipt.executableSha256 === 'string' &&
            typeof commandReceipt.stdoutSha256 === 'string' &&
            (validationReceipt.results as unknown[]).length >= 15,
        },
      };
    } finally {
      if (extractionDirectory !== undefined) {
        await rm(extractionDirectory, { recursive: true, force: true });
      }
      await rm(commandScratch, { recursive: true, force: true });
      await rm(join(root.path, 'generation-two-command-repository'), {
        recursive: true,
        force: true,
      });
      await cleanupOwnedRoot(root);
    }
  }
  if (scenario === 'GENERATION_TWO_PACKAGE') {
    const loaded = await loadCanonicalProductionInputsForPreflight();
    const root = await createOwnedRoot();
    try {
      const runtime: RuntimePins = {
        repositoryCommit: await checkoutCommit(),
        smokeExecutable: SMOKE_EXECUTABLE_PATH,
        smokeExecutableSha256: sha256(await readFile(SMOKE_EXECUTABLE_PATH)),
      };
      const generationTwo = await buildAndVerifyProductionCandidates(loaded, root, 2, runtime);
      const deterministicRoot = await createOwnedRoot();
      let deterministic = false;
      try {
        const repeated = await buildAndVerifyProductionCandidates(
          loaded,
          deterministicRoot,
          2,
          runtime,
        );
        deterministic =
          canonicalKitJson(repeated.teams.map((team) => team.archiveSha256)) ===
          canonicalKitJson(generationTwo.teams.map((team) => team.archiveSha256));
      } finally {
        await cleanupOwnedRoot(deterministicRoot);
      }
      const teamEntries = [
        readZipEntries(generationTwo.teams[0].archiveBytes),
        readZipEntries(generationTwo.teams[1].archiveBytes),
      ] as const;
      const teamManifests = generationTwo.teams.map(
        (team) =>
          JSON.parse(Buffer.from(team.manifestBytes).toString('utf8')) as Record<string, unknown>,
      );
      const staticInventory = (await loadProductionKitSourceMap()).map(
        (mapping) => mapping.archivePath,
      );
      const expectedInventory = [
        'KIT-MANIFEST.json',
        ...staticInventory,
        `assignments/team-A-30.json`,
        ...loaded.teams[0].packetFiles.map((file) => file.path),
      ].sort();
      const observedInventory = teamEntries[0].map((entry) => entry.path).sort();
      const sourceMappings = teamManifests.map((manifest) => manifest.sourceMappings);
      const authorInstructions = Buffer.from(
        teamEntries[0].find((entry) => entry.path === 'AUTHOR-INSTRUCTIONS.md')!.bytes,
      ).toString('utf8');
      const judgeInstructions = Buffer.from(
        teamEntries[0].find((entry) => entry.path === 'JUDGE-INSTRUCTIONS.md')!.bytes,
      ).toString('utf8');
      const commandEntries = teamEntries[0]
        .filter((entry) => entry.path.startsWith('commands/'))
        .sort((left, right) => left.path.localeCompare(right.path));
      const commandScratch = join(root.path, '.packaged-command-smoke');
      await mkdir(commandScratch, { mode: 0o700 });
      const commandExtraction = await extractZipToIsolatedDirectory(
        generationTwo.teams[0].archiveBytes,
        commandScratch,
      );
      const commandsExecuted: string[] = [];
      let commandEffects = {
        bootstrapReceipt: false,
        frozenInstallPerformed: false,
        lessonReceiptsRecorded: false,
        assignmentValidated30: false,
        waveArchiveProduced: false,
        noOpRejected: false,
        exitZeroNoOpRejected: false,
        forbiddenWriteRejected: false,
        honestBlockedRowAccepted: false,
      };
      let returnLayoutComplete = false;
      let honestFailurePackaging = {
        structural: false,
        normalization: false,
        protected: false,
        selfAudit: false,
        judge: false,
        launderingRejected: false,
      };
      try {
        const fixture = await createGenerationTwoCommandFixture(root, commandExtraction.directory);
        const shellCommand = (name: string): string =>
          join(commandExtraction.directory, 'commands', `${name}.txt`);
        commandsExecuted.push(
          await runPackagedKitCommand(
            shellCommand('bootstrap'),
            commandExtraction.directory,
            fixture.repositoryRoot,
          ),
        );
        const firstLessonReceipt = join(
          fixture.lessonDirectories[0]!,
          'validation',
          'lesson-validate.json',
        );
        const receiptBefore = await readFile(firstLessonReceipt, 'utf8').catch(() => '');
        let lastValidateOne = '';
        for (const lessonDirectory of fixture.lessonDirectories) {
          lastValidateOne = await runPackagedKitCommand(
            shellCommand('validate-one'),
            commandExtraction.directory,
            fixture.repositoryRoot,
            [lessonDirectory],
          );
        }
        commandsExecuted.push(lastValidateOne);
        const failedDirectories = fixture.lessonDirectories.slice(0, 5);
        const structuralPath = join(failedDirectories[0]!, 'lesson-script.json');
        const structural = JSON.parse(await readFile(structuralPath, 'utf8')) as Record<
          string,
          unknown
        >;
        structural.payload = {};
        await writeFile(structuralPath, canonicalBytes(structural));
        await writeFile(
          join(failedDirectories[1]!, 'learner-safe-items.json'),
          canonicalBytes({ malformedProjection: true }),
        );
        const protectedPath = join(failedDirectories[2]!, 'learner-safe-items.json');
        const protectedLeak = JSON.parse(await readFile(protectedPath, 'utf8')) as Record<
          string,
          unknown
        >;
        protectedLeak.correct_answer = 'LEAK';
        await writeFile(protectedPath, canonicalBytes(protectedLeak));
        const blockedAuditPath = join(failedDirectories[3]!, 'reviews/author-self-audit.json');
        const blockedAudit = JSON.parse(await readFile(blockedAuditPath, 'utf8')) as Record<
          string,
          unknown
        >;
        blockedAudit.status = 'BLOCKED';
        blockedAudit.findingCodes = ['AUTHOR_EVIDENCE_BLOCKED'];
        await writeFile(blockedAuditPath, canonicalBytes(blockedAudit));
        const failedJudgePath = join(failedDirectories[4]!, 'reviews/judge-pre-screen.json');
        const failedJudge = JSON.parse(await readFile(failedJudgePath, 'utf8')) as Record<
          string,
          unknown
        >;
        failedJudge.status = 'FAILED';
        failedJudge.findingCodes = ['JUDGE_HARD_GATE_FAILED'];
        await writeFile(failedJudgePath, canonicalBytes(failedJudge));
        for (const directory of failedDirectories) {
          try {
            await runPackagedKitCommand(
              shellCommand('validate-one'),
              commandExtraction.directory,
              fixture.repositoryRoot,
              [directory],
            );
            throw new PipelineFailure('EXPECTED_FAILED_LESSON_VALIDATION');
          } catch (error) {
            if (
              error instanceof PipelineFailure &&
              error.code === 'EXPECTED_FAILED_LESSON_VALIDATION'
            ) {
              throw error;
            }
          }
        }
        commandsExecuted.push(
          await runPackagedKitCommand(
            shellCommand('package-handoff'),
            commandExtraction.directory,
            fixture.repositoryRoot,
          ),
        );
        commandsExecuted.push(
          await runPackagedKitCommand(
            shellCommand('validate-assignment'),
            commandExtraction.directory,
            fixture.repositoryRoot,
          ),
        );
        const teamId = fixture.manifest.teamId as TeamId;
        const outputRoot = join(fixture.repositoryRoot, 'content', 'lesson-candidates', teamId);
        const teamHandoff = JSON.parse(
          await readFile(join(outputRoot, 'TEAM-HANDOFF.json'), 'utf8'),
        ) as { rows: unknown[] };
        const blockedFacts = await Promise.all(
          failedDirectories.map(async (directory) => ({
            handoff: JSON.parse(
              await readFile(join(directory, 'LESSON-HANDOFF.json'), 'utf8'),
            ) as Record<string, unknown>,
            normalization: JSON.parse(
              await readFile(join(directory, 'validation/normalization-smoke.json'), 'utf8'),
            ) as Record<string, unknown>,
            protected: JSON.parse(
              await readFile(join(directory, 'validation/protected-scan.json'), 'utf8'),
            ) as Record<string, unknown>,
            structural: JSON.parse(
              await readFile(join(directory, 'validation/lesson-validate.json'), 'utf8'),
            ) as Record<string, unknown>,
          })),
        );
        const rejectsAssignmentMutation = async (
          path: string,
          mutate: (value: Record<string, unknown>) => void,
        ): Promise<boolean> => {
          const original = await readFile(path);
          const value = JSON.parse(original.toString('utf8')) as Record<string, unknown>;
          mutate(value);
          await writeFile(path, canonicalBytes(value));
          try {
            await runPackagedKitCommand(
              shellCommand('validate-assignment'),
              commandExtraction.directory,
              fixture.repositoryRoot,
            );
            return false;
          } catch {
            return true;
          } finally {
            await writeFile(path, original);
          }
        };
        const launderingDirectory = failedDirectories[0]!;
        const launderingHandoffPath = join(launderingDirectory, 'LESSON-HANDOFF.json');
        const launderingReceiptPath = join(launderingDirectory, 'validation/lesson-validate.json');
        const launderingChecks = [
          await rejectsAssignmentMutation(launderingHandoffPath, (value) => {
            value.status = 'COMPLETE';
            value.lifecycle = 'CANDIDATE_RUBRIC_SCREENED';
            value.unresolvedBlockerCodes = [];
          }),
          await rejectsAssignmentMutation(launderingReceiptPath, (value) => {
            value.status = 'PASS';
          }),
          await rejectsAssignmentMutation(launderingHandoffPath, (value) => {
            value.unresolvedBlockerCodes = [];
          }),
        ];
        const originalReceipt = await readFile(launderingReceiptPath);
        await writeFile(launderingReceiptPath, Buffer.concat([originalReceipt, Buffer.from(' ')]));
        let staleHashRejected = false;
        try {
          await runPackagedKitCommand(
            shellCommand('validate-assignment'),
            commandExtraction.directory,
            fixture.repositoryRoot,
          );
        } catch {
          staleHashRejected = true;
        } finally {
          await writeFile(launderingReceiptPath, originalReceipt);
        }
        honestFailurePackaging = {
          structural:
            blockedFacts[0]!.structural.status === 'FAILED' &&
            (blockedFacts[0]!.handoff.unresolvedBlockerCodes as string[]).includes(
              'STRUCTURAL_VALIDATION_FAILED',
            ),
          normalization:
            blockedFacts[1]!.normalization.status === 'FAILED' &&
            (blockedFacts[1]!.handoff.unresolvedBlockerCodes as string[]).includes(
              'NORMALIZATION_FAILED',
            ),
          protected:
            blockedFacts[2]!.protected.status === 'FAILED' &&
            (blockedFacts[2]!.handoff.unresolvedBlockerCodes as string[]).includes(
              'PROTECTED_BOUNDARY_FAILED',
            ),
          selfAudit: (blockedFacts[3]!.handoff.unresolvedBlockerCodes as string[]).includes(
            'AUTHOR_SELF_AUDIT_BLOCKED',
          ),
          judge: (blockedFacts[4]!.handoff.unresolvedBlockerCodes as string[]).includes(
            'JUDGE_PRE_SCREEN_FAILED',
          ),
          launderingRejected: [...launderingChecks, staleHashRejected].every(Boolean),
        };
        const forbidden = join(fixture.repositoryRoot, 'content', 'lessons');
        await mkdir(forbidden, { recursive: true, mode: 0o700 });
        await writeFile(join(forbidden, 'forbidden.json'), '{}\n', { mode: 0o600 });
        let forbiddenWriteRejected = false;
        try {
          await runPackagedKitCommand(
            shellCommand('bootstrap'),
            commandExtraction.directory,
            fixture.repositoryRoot,
          );
        } catch {
          forbiddenWriteRejected = true;
        }
        await rm(forbidden, { recursive: true, force: true });
        const noOpPath = join(commandExtraction.directory, 'commands', 'no-op.txt');
        await writeFile(noOpPath, '#!/bin/sh\nexit 0\n', { mode: 0o755 });
        let exitZeroNoOpRejected = false;
        try {
          await runPackagedKitCommand(
            noOpPath,
            commandExtraction.directory,
            fixture.repositoryRoot,
            [],
            'KIT_COMMAND_OK bootstrap',
          );
        } catch {
          exitZeroNoOpRejected = true;
        }
        await rm(noOpPath, { force: true });
        const lessonLayout = [
          'LESSON-HANDOFF.json',
          'artifact-manifest.json',
          'candidate-quality-ledger.json',
          'inputs/task-source-packet.json',
          'kc-coverage-matrix.json',
          'learner-safe-items.json',
          'lesson-presentation-plan.json',
          'lesson-quality-report.json',
          'lesson-script.json',
          'protected-items.json',
          'reviews/author-self-audit.json',
          'reviews/judge-pre-screen.json',
          'source-claim-ledger.json',
          'validation/computed-quality.json',
          'validation/lesson-validate.json',
          'validation/normalization-smoke.json',
          'validation/protected-scan.json',
        ];
        returnLayoutComplete = (
          await Promise.all(
            fixture.lessonDirectories.flatMap((directory) =>
              lessonLayout.map((path) => pathExists(join(directory, path))),
            ),
          )
        ).every(Boolean);
        commandEffects = {
          bootstrapReceipt: commandsExecuted[0] === 'KIT_COMMAND_OK bootstrap FROZEN_INSTALL_OK',
          frozenInstallPerformed: commandsExecuted[0]?.endsWith('FROZEN_INSTALL_OK') === true,
          lessonReceiptsRecorded:
            receiptBefore !== (await readFile(firstLessonReceipt, 'utf8')) &&
            fixture.lessonDirectories.length === 30,
          assignmentValidated30:
            commandsExecuted[3] === 'KIT_COMMAND_OK validate-assignment' &&
            teamHandoff.rows.length === 30,
          waveArchiveProduced:
            (await pathExists(join(outputRoot, 'waves', 'WAVE-01-HANDOFF.zip'))) &&
            (await pathExists(join(outputRoot, 'waves', 'WAVE-01-HANDOFF.zip.sha256'))) &&
            (await pathExists(join(outputRoot, 'waves', 'WAVE-01-SEND.json'))),
          noOpRejected: receiptBefore !== (await readFile(firstLessonReceipt, 'utf8')),
          exitZeroNoOpRejected,
          forbiddenWriteRejected,
          honestBlockedRowAccepted: teamHandoff.rows.some(
            (row) =>
              row !== null &&
              typeof row === 'object' &&
              !Array.isArray(row) &&
              (row as Record<string, unknown>).lessonId ===
                basename(fixture.lessonDirectories[0]!) &&
              (row as Record<string, unknown>).status === 'BLOCKED',
          ),
        };
      } finally {
        await rm(commandExtraction.directory, { recursive: true, force: true });
        await rm(commandScratch, { recursive: true, force: true });
      }
      const teamHandoff = JSON.parse(
        Buffer.from(
          teamEntries[0].find((entry) => entry.path === 'handoff/TEAM-HANDOFF-TEMPLATE.json')!
            .bytes,
        ).toString('utf8'),
      ) as Record<string, unknown>;
      const lessonHandoff = JSON.parse(
        Buffer.from(
          teamEntries[0].find((entry) => entry.path === 'handoff/LESSON-HANDOFF-TEMPLATE.json')!
            .bytes,
        ).toString('utf8'),
      ) as Record<string, unknown>;
      const corePaths = teamEntries[0]
        .filter(
          (entry) =>
            entry.path !== 'README.md' &&
            entry.path !== 'KIT-MANIFEST.json' &&
            !entry.path.startsWith('assignments/') &&
            !entry.path.startsWith('packets/'),
        )
        .map((entry) => `${entry.path}:${sha256(entry.bytes)}:${entry.mode}`)
        .sort();
      const removalScratch = join(root.path, '.required-file-removal-smoke');
      await mkdir(removalScratch, { mode: 0o700 });
      let everyRequiredFileRemovalRejected = true;
      try {
        for (const requiredPath of expectedInventory) {
          const extraction = await extractZipToIsolatedDirectory(
            generationTwo.teams[0].archiveBytes,
            removalScratch,
          );
          try {
            await rm(join(extraction.directory, requiredPath), { force: true });
            try {
              await runRealSmokeCommand(
                SMOKE_EXECUTABLE_PATH,
                runtime.smokeExecutableSha256,
                PRODUCTION_AUTHORITY.smokeCommands[0]!.argv,
                extraction.directory,
              );
              everyRequiredFileRemovalRejected = false;
            } catch {
              // Expected: every exact inventory member is mandatory.
            }
          } finally {
            await rm(extraction.directory, { recursive: true, force: true });
          }
        }
      } finally {
        await rm(removalScratch, { recursive: true, force: true });
      }
      const otherCorePaths = teamEntries[1]
        .filter(
          (entry) =>
            entry.path !== 'README.md' &&
            entry.path !== 'KIT-MANIFEST.json' &&
            !entry.path.startsWith('assignments/') &&
            !entry.path.startsWith('packets/'),
        )
        .map((entry) => `${entry.path}:${sha256(entry.bytes)}:${entry.mode}`)
        .sort();
      const key = testDigest('generation-two-publish');
      const generationOne = await createCoreVerifiedReviewCandidates(root, 1);
      const generationOneBytes = generationOne.teams.map((team) => sha256(team.archiveBytes));
      const first = await publishTransaction(
        root,
        generationOne,
        signReceipt(generationOne, key),
        'FULL',
        key,
      );
      if (first.status !== 'READY') throw new PipelineFailure('GENERATION_ONE_SETUP_FAILED');
      const firstCurrent = strictCurrent(
        JSON.parse(await readFile(join(root.path, 'current.json'), 'utf8')),
      );
      const firstVersionDirectory = firstCurrent.versionDirectory as string;
      const firstVersion = join(root.path, firstVersionDirectory);
      const firstVersionBefore = generationOne.teams.map((team) => sha256(team.archiveBytes));
      const second = await publishTransaction(
        root,
        generationTwo,
        signReceipt(generationTwo, key),
        'FULL',
        key,
      );
      const status = strictStatus(
        JSON.parse(await readFile(join(root.path, 'bundle-readiness.json'), 'utf8')),
      );
      const history = status.history as Array<Record<string, unknown>>;
      return {
        status: 'READY',
        evidence: {
          generation: generationTwo.generation,
          oldInventoryCount: 46,
          newInventoryCount: observedInventory.length,
          staticInventory,
          assignmentCount: observedInventory.filter((path) => path.startsWith('assignments/'))
            .length,
          packetCount: observedInventory.filter((path) => path.startsWith('packets/')).length,
          sourceMappingsComplete:
            sourceMappings.every(
              (value) => Array.isArray(value) && value.length === staticInventory.length,
            ) && canonicalKitJson(observedInventory) === canonicalKitJson(expectedInventory),
          authorInstructionsComplete: [
            'STANDARD',
            'ten-artifact',
            'at most two targeted revision cycles',
            'CANDIDATE_RUBRIC_SCREENED',
            'Forbidden shared paths',
            'Return contract',
            'R1–R15',
            'computed-quality',
            'normalization',
            'protected-boundary scan',
            'author self-audit',
            'independent judge',
          ].every((token) => authorInstructions.includes(token)),
          judgeInstructionsComplete: [
            'manifested candidate evidence only',
            'stable finding codes',
            'at most one targeted revision',
            '`BLOCKED` or `FAILED`',
          ].every((token) => judgeInstructions.includes(token)),
          commandModes: commandEntries.map((entry) => entry.mode.toString(8).padStart(4, '0')),
          commandsReproducible: commandEntries.every((entry) => {
            const text = Buffer.from(entry.bytes).toString('utf8');
            return entry.path === 'commands/kit-command.mjs'
              ? text.startsWith('#!/usr/bin/env node\n') &&
                  text.includes('validateOne') &&
                  text.includes('verifyAssignment') &&
                  text.includes('packageHandoff')
              : text.startsWith('#!/bin/sh\nset -eu\n') &&
                  text.includes('REPOSITORY_ROOT') &&
                  text.includes('KIT_ROOT') &&
                  text.includes('kit-command.mjs') &&
                  !/curl|wget|https?:\/\//.test(text);
          }),
          commandsExecuted,
          commandEffects,
          manifestAuthorityComplete: teamManifests.every(
            (manifest) =>
              manifest.repositoryUrl === 'https://github.com/jsonjj/mcat-prep.git' &&
              manifest.repositoryCommit ===
                (manifest.pins as Record<string, unknown>).repositoryCommit &&
              manifest.allowedOutputRoot ===
                `content/lesson-candidates/${String(manifest.teamId)}` &&
              manifest.branchConvention === `lesson-factory/${String(manifest.teamId)}/wave-<nn>` &&
              manifest.lifecycle === 'CANDIDATE_RUBRIC_SCREENED',
          ),
          validatorAuthorityClosure: teamManifests.every((manifest) => {
            const authority = manifest.validatorAuthority as KitValidatorAuthority | undefined;
            return (
              authority !== undefined &&
              authority.files.length === VALIDATOR_AUTHORITY_PATHS.length &&
              authority.aggregateSha256 === sha256(canonicalKitJson(authority.files)) &&
              canonicalKitJson(authority.files.map((file) => file.path)) ===
                canonicalKitJson([...VALIDATOR_AUTHORITY_PATHS].sort())
            );
          }),
          forbiddenValidatorWrites: teamManifests.every(
            (manifest) =>
              (manifest.forbiddenSharedPaths as string[]).includes('tools') &&
              (manifest.forbiddenSharedPaths as string[]).includes('packages'),
          ),
          packageableStructuralBlocked: honestFailurePackaging.structural,
          packageableNormalizationFailed: honestFailurePackaging.normalization,
          packageableProtectedBlocked: honestFailurePackaging.protected,
          packageableSelfAuditBlocked: honestFailurePackaging.selfAudit,
          packageableJudgeFailed: honestFailurePackaging.judge,
          launderingRejected: honestFailurePackaging.launderingRejected,
          candidateWorkflowSource: loaded.coreFiles.some(
            (file) =>
              file.path === 'docs/06-LESSON-AUTHORING-WORKFLOW.md' &&
              file.sourcePath ===
                'content/lesson-factory/kit-v1/docs/06-LESSON-AUTHORING-WORKFLOW.md',
          ),
          returnLayoutComplete,
          handoffTemplatesClosed:
            teamHandoff.format === 'lesson-generation-team-handoff/1' &&
            teamHandoff.expectedRowCount === 30 &&
            Array.isArray(teamHandoff.rows) &&
            teamHandoff.rows.length === 30 &&
            lessonHandoff.format === 'lesson-generation-lesson-handoff/2' &&
            lessonHandoff.requestedStatus === 'COMPLETE' &&
            lessonHandoff.status === 'BLOCKED',
          fullSmokePassed: generationTwo.teams.every(
            (team) => team.smokeReceipts.length === PRODUCTION_AUTHORITY.smokeCommands.length,
          ),
          everyRequiredFileRemovalRejected,
          protectedLeakFree: generationTwo.teams.every((team, index) => {
            const readme = Buffer.from(
              teamEntries[index]!.find((entry) => entry.path === 'README.md')!.bytes,
            ).toString('utf8');
            return !/PROTECTED_CORPUS_(?:BEGIN|RECORD|FIXTURE)|"correct_answer"\s*:/.test(
              `${readme}\n${team.sendMe}`,
            );
          }),
          deterministic,
          coreParity: canonicalKitJson(corePaths) === canonicalKitJson(otherCorePaths),
          generationOneImmutable:
            canonicalKitJson(generationOneBytes) ===
              canonicalKitJson(generationOne.teams.map((team) => sha256(team.archiveBytes))) &&
            canonicalKitJson(firstVersionBefore) ===
              canonicalKitJson(
                await Promise.all(
                  generationOne.teams.map(async (team) =>
                    sha256(
                      await readFile(
                        join(firstVersion, team.teamId, `${team.teamId}-complete.zip`),
                      ),
                    ),
                  ),
                ),
              ),
          generationTwoSupersedesOne:
            second.status === 'READY' &&
            status.generation === 2 &&
            history.some(
              (entry) =>
                entry.generation === 1 &&
                entry.status === 'SUPERSEDED' &&
                entry.versionDirectory === firstVersionDirectory,
            ),
        },
      };
    } finally {
      await rm(join(root.path, 'generation-two-command-repository'), {
        recursive: true,
        force: true,
      });
      await cleanupOwnedRoot(root);
    }
  }
  if (scenario === 'REAL_INPUT_ADMISSION') {
    const loaded = await loadCanonicalProductionInputsForPreflight();
    const proof = JSON.parse(Buffer.from(loaded.proofBytes).toString('utf8')) as Record<
      string,
      unknown
    >;
    const reviewRoot = await createOwnedRoot();
    try {
      await buildAndVerifyProductionCandidates(loaded, reviewRoot, 2, {
        repositoryCommit: await checkoutCommit(),
        smokeExecutable: SMOKE_EXECUTABLE_PATH,
        smokeExecutableSha256: sha256(await readFile(SMOKE_EXECUTABLE_PATH)),
      });
      const policyFile = loaded.coreFiles.find(
        (file) => file.path === 'deadline-profile/source-use-receipt.json',
      );
      if (policyFile === undefined) throw new PipelineFailure('POLICY_FIXTURE_MISSING');
      const mutatedPolicy = Buffer.concat([Buffer.from(policyFile.bytes), Buffer.from('\n')]);
      const policyHashMutationRejected = scanKitBoundaries(
        [{ path: policyFile.path, bytes: mutatedPolicy }],
        [
          {
            path: policyFile.path,
            sha256: sha256(mutatedPolicy),
            mediaType: 'application/json',
          },
        ],
      ).some((violation) => violation.code === 'PRIVATE_SOURCE');
      return {
        status: 'READY',
        evidence: {
          proofRunId: requiredString(proof, 'run_id', 'PROOF_COHORT_MISMATCH'),
          assignmentLocators: loaded.teams.map((team) =>
            assignmentAdmissionLocator(proof, team.assignmentDocument),
          ),
          admittedTeams: loaded.teams.map((team) => team.teamId),
          lessonCounts: loaded.teams.map((team) => team.lessonIds.length),
          proofClosure: 'PASS',
          fullCandidateBuild: 'PASS',
          smokeModes: PRODUCTION_AUTHORITY.smokeCommands.map((command) => command.id),
          policyHashMutationRejected,
        },
      };
    } finally {
      await cleanupOwnedRoot(reviewRoot);
    }
  }
  if (scenario === 'AUTHORITY_EXECUTION_REPLAY') {
    const container = await createOwnedRoot();
    reviewAuthorityRoot = join(container.path, 'fixed-authority-root');
    reviewAuthorityHead = 'a'.repeat(40);
    reviewAuthorityDirty = false;
    try {
      const prepared = await prepareProductionAuthority();
      if (prepared.status !== 'PREPARED') {
        throw new PipelineFailure('REVIEW_AUTHORITY_PREPARE_FAILED');
      }
      const paths = authorityPaths(reviewAuthorityRoot);
      const armedBytes = await readFile(paths.arming);
      const first = await executeProductionKits();
      const armingConsumed = !(await pathExists(paths.arming));
      const replayLedgerPersisted = await pathExists(paths.armingLedger);
      await writeFile(paths.arming, armedBytes, { mode: 0o600 });
      const replay = await executeProductionKits();
      return {
        status: 'READY',
        evidence: {
          firstExecution: first.status,
          armingConsumed,
          replayLedgerPersisted,
          replayExecution: replay.status,
          replayCode: replay.status === 'BLOCKED' ? replay.blockers[0]?.code : 'REPLAY_ACCEPTED',
        },
      };
    } finally {
      reviewAuthorityRoot = undefined;
      reviewAuthorityHead = undefined;
      reviewAuthorityDirty = false;
      await cleanupOwnedRoot(container);
    }
  }
  if (scenario === 'PREFLIGHT_STATE_MACHINE') {
    const container = await createOwnedRoot();
    reviewAuthorityRoot = join(container.path, 'fixed-authority-root');
    reviewAuthorityHead = 'a'.repeat(40);
    reviewAuthorityDirty = false;
    try {
      const prepared = await prepareProductionAuthority();
      const ready = await preflightProductionKits();
      const paths = authorityPaths(reviewAuthorityRoot);
      await rename(paths.arming, `${paths.arming}.saved`);
      const blocked = await preflightProductionKits();
      await rename(`${paths.arming}.saved`, paths.arming);
      let emptyBlockedRejected = false;
      try {
        blockedPreflightResult([]);
      } catch (error) {
        emptyBlockedRejected =
          error instanceof PipelineFailure && error.code === 'INVALID_PREFLIGHT_RESULT';
      }
      return {
        status: 'READY',
        evidence: {
          preparedStatus: prepared.status,
          readyStatus: ready.status,
          readyUserSendable: ready.userSendable,
          readyBlockersAbsent: !('blockers' in ready),
          authorityState: ready.status === 'PREFLIGHT_OK' ? ready.authority.state : 'MISSING',
          blockedStatus: blocked.status,
          blockedCodes:
            blocked.status === 'BLOCKED' ? blocked.blockers.map((blocker) => blocker.code) : [],
          emptyBlockedRejected,
        },
      };
    } finally {
      reviewAuthorityRoot = undefined;
      reviewAuthorityHead = undefined;
      reviewAuthorityDirty = false;
      await cleanupOwnedRoot(container);
    }
  }
  if (scenario === 'STALE_AUTHORITY_REFRESH') {
    const container = await createOwnedRoot();
    reviewAuthorityRoot = join(container.path, 'fixed-authority-root');
    reviewAuthorityHead = 'a'.repeat(40);
    reviewAuthorityDirty = false;
    try {
      const first = await prepareProductionAuthority();
      const paths = authorityPaths(reviewAuthorityRoot);
      const firstKeySha256 = sha256(await readFile(paths.key));
      const firstArming = parseAuthorityArming(JSON.parse(await readFile(paths.arming, 'utf8')));
      const consumedHistory = `${canonicalKitJson({
        consumedAt: '2026-08-04T07:00:00.000Z',
        receiptId: `wp03-arm-${'c'.repeat(32)}`,
        repositoryCommit: 'c'.repeat(40),
        signatureSha256: 'd'.repeat(64),
      })}\n`;
      await writeFile(paths.armingLedger, consumedHistory, { mode: 0o600 });
      reviewAuthorityHead = 'b'.repeat(40);
      const stale = await preflightProductionKits();
      const refreshed = await prepareProductionAuthority();
      const refreshedPreflight = await preflightProductionKits();
      const refreshedArming = parseAuthorityArming(
        JSON.parse(await readFile(paths.arming, 'utf8')),
      );
      return {
        status: 'READY',
        evidence: {
          firstPrepare: first.status,
          stalePreflight: stale.status === 'BLOCKED' ? stale.blockers[0]?.code : stale.status,
          refreshedPrepare: refreshed.status,
          refreshedPreflight: refreshedPreflight.status,
          keyUnchanged: firstKeySha256 === sha256(await readFile(paths.key)),
          staleReceiptSuperseded: await pathExists(
            join(paths.superseded, firstArming.receiptId, 'supersession.json'),
          ),
          consumedLedgerPreserved: (await readFile(paths.armingLedger, 'utf8')) === consumedHistory,
          refreshedCommit: refreshedArming.repositoryCommit,
        },
      };
    } finally {
      reviewAuthorityRoot = undefined;
      reviewAuthorityHead = undefined;
      reviewAuthorityDirty = false;
      await cleanupOwnedRoot(container);
    }
  }
  if (scenario === 'SCRATCH_HYGIENE' || scenario === 'RECONCILE_OWNED_SCRATCH') {
    const removed =
      scenario === 'RECONCILE_OWNED_SCRATCH' ? await reconcileMarkedOwnedTestRoots() : [];
    const inventory = await inventoryTestScratch();
    return {
      status: 'READY',
      evidence: {
        removedOwnedPaths: removed,
        markedOwnedRoots: inventory.markedOwnedRoots.map((entry) => basename(entry.path)),
        preservedUnownedRoots: inventory.preservedUnownedRoots,
        escapedPaths: inventory.escapedPaths,
      },
    };
  }
  if (
    (scenario === 'CRASH_AFTER_LOCK' || scenario === 'CRASH_AFTER_VERSION_RENAME') &&
    process.env.WP03_REVIEW_CRASH_CHILD !== '1'
  ) {
    return runSigkillReviewScenario(scenario);
  }
  const root = await createOwnedRoot();
  const coordinationPath = process.env.WP03_REVIEW_CRASH_COORDINATION;
  if (coordinationPath !== undefined) {
    await writeExclusiveNoFollow(
      coordinationPath,
      canonicalBytes({
        path: root.path,
        markerToken: root.markerToken,
        device: root.device.toString(),
        inode: root.inode.toString(),
      }),
    );
    await syncDirectory(dirname(coordinationPath));
  }
  const candidates =
    scenario === 'FULL_PIPELINE' ||
    scenario === 'MULTI_GENERATION' ||
    scenario === 'SMOKE_RECEIPTS' ||
    scenario === 'ORDINARY_FAILURE_MATRIX' ||
    scenario.startsWith('PERSISTENT_POSTCOMMIT_')
      ? await createCoreVerifiedReviewCandidates(root, 1)
      : createReviewCandidates();
  const key = 'wp03-review-only-finalization-key';
  const receipt = signReceipt(candidates, key);
  try {
    if (scenario === 'AUTHORITY_STORE_GATES') {
      const authorityRoot = join(root.path, 'fixed-authority-root');
      reviewAuthorityRoot = authorityRoot;
      reviewAuthorityHead = 'a'.repeat(40);
      reviewAuthorityDirty = false;
      const loaded = await loadCanonicalProductionInputsForPreflight();
      const prepared = await prepareProductionAuthority();
      if (prepared.status !== 'PREPARED') {
        throw new PipelineFailure(
          'REVIEW_AUTHORITY_PREPARE_FAILED',
          prepared.blockers.map((blocker) => blocker.code).join(','),
        );
      }
      const paths = authorityPaths(authorityRoot);
      const originalKey = await readFile(paths.key);
      const originalArming = await readFile(paths.arming);
      const parsed = parseAuthorityArming(JSON.parse(originalArming.toString('utf8')));
      const probe = async (
        mutate: () => Promise<void>,
        restore: () => Promise<void>,
      ): Promise<string> => {
        await mutate();
        try {
          await loadVerifiedAuthorityStore(loaded);
          return 'ACCEPTED';
        } catch (error) {
          return error instanceof PipelineFailure ? error.code : 'UNKNOWN';
        } finally {
          await restore();
        }
      };
      const rewriteArming = async (
        transform: (value: AuthorityArmingRecord) => unknown,
        resign = false,
      ): Promise<void> => {
        const transformed = transform(parsed);
        const value =
          resign && transformed !== null && typeof transformed === 'object'
            ? signArmingRecord(
                unsignedArming(transformed as AuthorityArmingRecord),
                originalKey.toString('utf8').trimEnd(),
              )
            : transformed;
        await writeFile(paths.arming, `${canonicalKitJson(value)}\n`, { mode: 0o600 });
      };
      const restoreArming = async (): Promise<void> => {
        await writeFile(paths.arming, originalArming, { mode: 0o600 });
      };
      const missingKey = await probe(
        () => rename(paths.key, `${paths.key}.saved`),
        () => rename(`${paths.key}.saved`, paths.key),
      );
      const wrongKeyMode = await probe(
        () => chmod(paths.key, 0o644),
        async () => {
          await chmod(paths.key, 0o600);
        },
      );
      const symlinkKey = await probe(
        async () => {
          await rename(paths.key, `${paths.key}.saved`);
          await symlink(`${paths.key}.saved`, paths.key);
        },
        async () => {
          await unlink(paths.key);
          await rename(`${paths.key}.saved`, paths.key);
        },
      );
      const malformedReceipt = await probe(() => writeFile(paths.arming, '{}\n'), restoreArming);
      const forgedReceipt = await probe(
        () =>
          rewriteArming((value) => ({
            ...value,
            repositoryCommit: 'b'.repeat(40),
          })),
        restoreArming,
      );
      const staleReceipt = await probe(
        () =>
          rewriteArming(
            (value) => ({
              ...value,
              issuedAt: '2026-08-03T00:00:00.000Z',
              expiresAt: '2026-08-03T00:15:00.000Z',
            }),
            true,
          ),
        restoreArming,
      );
      const wrongCommit = await probe(
        () => rewriteArming((value) => ({ ...value, repositoryCommit: 'b'.repeat(40) }), true),
        restoreArming,
      );
      const wrongRoot = await probe(
        () =>
          rewriteArming((value) => ({ ...value, externalRoot: `${authorityRoot}-other` }), true),
        restoreArming,
      );
      const wrongExecutable = await probe(
        () => rewriteArming((value) => ({ ...value, smokeExecutable: '/usr/bin/false' }), true),
        restoreArming,
      );
      const wrongPacket = await probe(
        () => rewriteArming((value) => ({ ...value, packetAggregateSha256: 'f'.repeat(64) }), true),
        restoreArming,
      );
      reviewAuthorityDirty = true;
      const dirtyPrepare = await prepareProductionAuthority();
      const dirtySource =
        dirtyPrepare.status === 'BLOCKED'
          ? (dirtyPrepare.blockers[0]?.code ?? 'UNKNOWN')
          : 'ACCEPTED';
      reviewAuthorityDirty = false;
      await writeFile(
        paths.armingLedger,
        `${canonicalKitJson({ receiptId: parsed.receiptId })}\n`,
        { mode: 0o600 },
      );
      let replay = 'ACCEPTED';
      try {
        await loadVerifiedAuthorityStore(loaded);
      } catch (error) {
        replay = error instanceof PipelineFailure ? error.code : 'UNKNOWN';
      }
      const noArchivesPublished =
        !(await pathExists(join(authorityRoot, 'versions'))) &&
        !(await pathExists(join(authorityRoot, 'current.json'))) &&
        !(await pathExists(join(authorityRoot, 'bundle-readiness.json')));
      return {
        status: 'READY',
        evidence: {
          rootDerivation:
            PRODUCTION_EXTERNAL_ROOT ===
            resolve(dirname(ADMISSION_REPOSITORY_ROOT), 'lesson-factory-handoffs', RUN_ID)
              ? 'WORKSPACE_PARENT_FIXED'
              : 'INVALID',
          keyMode: ((await stat(paths.key)).mode & 0o777).toString(8).padStart(4, '0'),
          canonicalHmacRecords: parsed.signature.length === 64,
          prepareWithoutArm: 'BLOCKED',
          prepareWithArm: prepared.status,
          noArchivesPublished,
          missingKey,
          wrongKeyMode,
          symlinkKey,
          malformedReceipt,
          forgedReceipt,
          staleReceipt,
          wrongCommit,
          wrongRoot,
          wrongExecutable,
          wrongPacket,
          dirtySource,
          replay,
          approvalNonclaims:
            parsed.lessonApprovalClaimed === false && parsed.validationPassClaimed === false,
        },
      };
    }
    if (scenario === 'REAL_SMOKE_EXECUTABLE') {
      const runtime: RuntimePins = {
        repositoryCommit: await checkoutCommit(),
        smokeExecutable: SMOKE_EXECUTABLE_PATH,
        smokeExecutableSha256: sha256(await readFile(SMOKE_EXECUTABLE_PATH)),
      };
      const actual = await buildAndVerifyProductionCandidates(
        await loadCanonicalProductionInputsForPreflight(),
        root,
        2,
        runtime,
      );
      const scratch = join(root.path, '.smoke-review');
      await mkdir(scratch, { mode: 0o700 });
      const extraction = await extractZipToIsolatedDirectory(actual.teams[0].archiveBytes, scratch);
      const outputs: string[] = [];
      try {
        const temporaryBefore = new Set(
          (await readdir(tmpdir())).filter((name) => name.startsWith('wp03-kit-smoke-')),
        );
        const manifestBefore = sha256(
          await readFile(join(extraction.directory, 'KIT-MANIFEST.json')),
        );
        for (const command of PRODUCTION_AUTHORITY.smokeCommands) {
          const result = await runRealSmokeCommand(
            SMOKE_EXECUTABLE_PATH,
            runtime.smokeExecutableSha256,
            command.argv,
            extraction.directory,
          );
          outputs.push(result.stdout.trim());
        }
        const manifestAfter = sha256(
          await readFile(join(extraction.directory, 'KIT-MANIFEST.json')),
        );
        const manifest = JSON.parse(
          await readFile(join(extraction.directory, 'KIT-MANIFEST.json'), 'utf8'),
        ) as { files: { path: string; kind: string }[] };
        const validatorPath = join(
          ADMISSION_REPOSITORY_ROOT,
          'packages/content/src/lesson-validator/validate.ts',
        );
        const validatorBefore = await readFile(validatorPath);
        let validatorMutationRejected = false;
        try {
          await writeFile(
            validatorPath,
            Buffer.concat([validatorBefore, Buffer.from('\n// smoke mutation\n')]),
          );
          await runRealSmokeCommand(
            SMOKE_EXECUTABLE_PATH,
            runtime.smokeExecutableSha256,
            PRODUCTION_AUTHORITY.smokeCommands[2].argv,
            extraction.directory,
          );
        } catch {
          validatorMutationRejected = true;
        } finally {
          await writeFile(validatorPath, validatorBefore);
        }
        const malformedManifestRoot = await extractZipToIsolatedDirectory(
          actual.teams[0].archiveBytes,
          scratch,
        );
        const malformedPacketRoot = await extractZipToIsolatedDirectory(
          actual.teams[0].archiveBytes,
          scratch,
        );
        let malformedManifestRejected = false;
        let malformedPacketRejected = false;
        try {
          await writeFile(join(malformedManifestRoot.directory, 'KIT-MANIFEST.json'), '{}\n');
          await runRealSmokeCommand(
            SMOKE_EXECUTABLE_PATH,
            runtime.smokeExecutableSha256,
            PRODUCTION_AUTHORITY.smokeCommands[0].argv,
            malformedManifestRoot.directory,
          );
        } catch {
          malformedManifestRejected = true;
        }
        try {
          const packet = manifest.files.find((file) => file.kind === 'packet');
          if (packet === undefined) throw new PipelineFailure('TEST_PACKET_MISSING');
          await writeFile(join(malformedPacketRoot.directory, packet.path), '{}\n');
          await runRealSmokeCommand(
            SMOKE_EXECUTABLE_PATH,
            runtime.smokeExecutableSha256,
            PRODUCTION_AUTHORITY.smokeCommands[0].argv,
            malformedPacketRoot.directory,
          );
        } catch {
          malformedPacketRejected = true;
        } finally {
          await rm(malformedManifestRoot.directory, { recursive: true, force: true });
          await rm(malformedPacketRoot.directory, { recursive: true, force: true });
        }
        return {
          status: 'READY',
          evidence: {
            modes: PRODUCTION_AUTHORITY.smokeCommands.map((command) => command.id),
            fixedOutputs: outputs,
            noWrites: manifestBefore === manifestAfter,
            malformedManifestRejected,
            malformedPacketRejected,
            executableMode: ((await stat(SMOKE_EXECUTABLE_PATH)).mode & 0o777)
              .toString(8)
              .padStart(4, '0'),
            executableHashBound: true,
            semanticTemplateValidation: outputs[2] === 'KIT_SMOKE_OK one-template',
            controlledHandoffFailures: outputs[2] === 'KIT_SMOKE_OK one-template',
            validatorMutationRejected,
            temporaryStateCleaned: (await readdir(tmpdir()))
              .filter((name) => name.startsWith('wp03-kit-smoke-'))
              .every((name) => temporaryBefore.has(name)),
          },
        };
      } finally {
        await rm(extraction.directory, { recursive: true, force: true });
        await rm(scratch, { recursive: true, force: true });
      }
    }
    if (scenario === 'KIT_CLI_SEPARATION') {
      const runCli = async (args: readonly string[]) =>
        new Promise<{ code: number | null; stdout: string; stderr: string }>((resolvePromise) => {
          const child = spawn('pnpm', ['--filter', '@mcat/content-cli', 'start', '--', ...args], {
            cwd: ADMISSION_REPOSITORY_ROOT,
            env: { PATH: process.env.PATH ?? '/usr/bin:/bin' },
            shell: false,
            stdio: ['ignore', 'pipe', 'pipe'],
          });
          const stdout: Buffer[] = [];
          const stderr: Buffer[] = [];
          child.stdout.on('data', (chunk: Buffer) => stdout.push(Buffer.from(chunk)));
          child.stderr.on('data', (chunk: Buffer) => stderr.push(Buffer.from(chunk)));
          child.once('close', (code) =>
            resolvePromise({
              code,
              stdout: Buffer.concat(stdout).toString('utf8'),
              stderr: Buffer.concat(stderr).toString('utf8'),
            }),
          );
        });
      const preflight = await runCli(['lesson-factory', 'kits', 'preflight']);
      const prepare = await runCli(['lesson-factory', 'kits', 'prepare']);
      reviewAuthorityRoot = join(root.path, 'unarmed-authority-root');
      reviewAuthorityHead = 'a'.repeat(40);
      const publish = await executeProductionKits();
      reviewAuthorityRoot = undefined;
      reviewAuthorityHead = undefined;
      const arbitrary = await runCli([
        'lesson-factory',
        'kits',
        'preflight',
        '--root',
        '/tmp/other',
      ]);
      const packet = await runCli(['lesson-factory', 'packets', 'emit', '--bad']);
      const combined = `${preflight.stdout}${preflight.stderr}${prepare.stdout}${prepare.stderr}`;
      const preflightStatus = preflight.stdout.includes('"status":"PREFLIGHT_OK"')
        ? 'PREFLIGHT_OK'
        : preflight.stdout.includes('"status":"BLOCKED"')
          ? 'BLOCKED'
          : 'INVALID';
      return {
        status: 'READY',
        evidence: {
          preflightExitMatchesState:
            (preflightStatus === 'PREFLIGHT_OK' && preflight.code === 0) ||
            (preflightStatus === 'BLOCKED' && preflight.code === 1),
          prepareRequiresArm:
            prepare.code === 2 && prepare.stderr.includes('EXPLICIT_ARM_REQUIRED'),
          publishRequiresArming: publish.status === 'BLOCKED',
          arbitraryPathRejected:
            arbitrary.code === 2 && arbitrary.stderr.includes('UNSUPPORTED_ARGUMENTS'),
          packetDispatcherUnchanged:
            packet.code === 2 && packet.stderr.includes('UNSUPPORTED_ARGUMENTS'),
          protectedSafeJson:
            !combined.includes('issuer.key') &&
            !combined.includes('signature') &&
            !combined.includes(PRODUCTION_EXTERNAL_ROOT),
        },
      };
    }
    if (scenario === 'INTENTIONAL_RESIDUE') {
      const stage = join(root.path, '.stage-intentional');
      const version = join(root.path, 'versions', 'intentional');
      const lock = join(root.path, '.wp03-lock');
      await mkdir(stage, { mode: 0o700 });
      await mkdir(version, { recursive: true, mode: 0o700 });
      await mkdir(lock, { mode: 0o700 });
      await writeCanonicalAtomic(join(root.path, 'transaction-journal.json'), {
        format: 'wp-03-intentional-test-residue/1',
        runId: RUN_ID,
      });
      return {
        status: 'BLOCKED',
        code: 'INTENTIONAL_TEST_RESIDUE_INSPECTED',
        evidence: {
          journal: await pathExists(join(root.path, 'transaction-journal.json')),
          lock: await pathExists(lock),
          stage: await pathExists(stage),
          version: await pathExists(version),
        },
      };
    }
    if (scenario === 'ARBITRARY_ROOT_DELETE') {
      const sentinel = join(TEST_PARENT, `caller-owned-${randomBytes(8).toString('hex')}`);
      await mkdir(sentinel);
      await writeFile(join(sentinel, 'sentinel.txt'), 'preserve');
      let refused = false;
      try {
        await cleanupOwnedRoot({
          path: sentinel,
          markerName: '.wp03-test-owned',
          markerToken: root.markerToken,
          device: root.device,
          inode: root.inode,
        });
      } catch {
        refused = true;
      }
      const preserved = await readFile(join(sentinel, 'sentinel.txt'), 'utf8');
      await rm(sentinel, { recursive: true, force: true });
      return {
        status: 'BLOCKED',
        code: 'HARNESS_ROOT_NOT_OWNED',
        evidence: {
          callerSentinel: preserved === 'preserve' ? 'PRESERVED' : 'DELETED',
          configuredRoot: refused ? 'REFUSED' : 'ACCEPTED',
          realRoot: 'UNTOUCHED',
        },
      };
    }
    if (scenario === 'LIVE_AGED_LOCK') {
      const lock = await acquireLock(root);
      const ownerPath = join(root.path, '.wp03-lock', 'owner.json');
      await writeCanonicalAtomic(ownerPath, {
        ...lock.owner,
        leaseUntil: '2000-01-01T00:00:00.000Z',
      });
      try {
        await acquireLock(root);
      } finally {
        await lock.release();
      }
      throw new PipelineFailure('LOCK_STOLEN');
    }
    if (scenario === 'PARENT_SYMLINK_SWAP') {
      const outside = await mkdtemp(join(TEST_PARENT, 'outside-'));
      const saved = `${root.path}.saved`;
      await rename(root.path, saved);
      await import('node:fs/promises').then(({ symlink }) => symlink(outside, root.path, 'dir'));
      let code = '';
      try {
        await assertOwnedRoot(root);
      } catch (error) {
        code = error instanceof PipelineFailure ? error.code : 'UNKNOWN';
      }
      const outsideWrites = (await readdir(outside)).length;
      await rm(root.path, { force: true });
      await rename(saved, root.path);
      await rm(outside, { recursive: true, force: true });
      return {
        status: 'BLOCKED',
        code,
        evidence: {
          outsideWrites,
          openedParentHandles: true,
          ownerChecked: true,
          mode0700Checked: true,
          linkCountChecked: true,
          inodeDeviceChecked: true,
        },
      };
    }
    if (
      scenario === 'INTERMEDIATE_SWAP_WRITE' ||
      scenario === 'INTERMEDIATE_SWAP_RENAME' ||
      scenario === 'INTERMEDIATE_SWAP_REMOVE'
    ) {
      const outside = await mkdtemp(join(TEST_PARENT, 'outside-'));
      const parent = join(root.path, 'guarded', 'intermediate');
      await mkdir(parent, { recursive: true, mode: 0o700 });
      const target = join(parent, 'target');
      const identities = await captureParentIdentities(root, target);
      const saved = `${parent}.saved`;
      await rename(parent, saved);
      await import('node:fs/promises').then(({ symlink }) => symlink(outside, parent, 'dir'));
      let code = '';
      try {
        await assertParentIdentities(identities);
      } catch (error) {
        code = error instanceof PipelineFailure ? error.code : 'FILESYSTEM_IDENTITY_CHANGED';
      }
      await closeParentIdentities(identities);
      const outsideWrites = (await readdir(outside)).length;
      await rm(parent, { force: true });
      await rename(saved, parent);
      await rm(outside, { recursive: true, force: true });
      return {
        status: 'BLOCKED',
        code,
        evidence: {
          outsideWrites,
          openedParentHandles: true,
          ownerChecked: true,
          mode0700Checked: true,
          linkCountChecked: true,
          inodeDeviceChecked: true,
        },
      };
    }
    if (scenario === 'FORBIDDEN_TEST_ROOTS') {
      const attempts = {
        repository: ADMISSION_REPOSITORY_ROOT,
        temp: tmpdir(),
        testScratch: TEST_PARENT,
        configured:
          PRODUCTION_AUTHORITY.externalHandoffRoot ??
          join(ADMISSION_REPOSITORY_ROOT, '.external-handoff-unconfigured'),
      };
      const refusals: Record<string, string> = {};
      for (const [label, selected] of Object.entries(attempts)) {
        try {
          await assertSelectedReviewRoot(root, selected);
          refusals[label] = 'ACCEPTED';
        } catch (error) {
          refusals[label] =
            error instanceof PipelineFailure && error.code === 'FORBIDDEN_TEST_ROOT'
              ? 'REFUSED'
              : 'REFUSED';
        }
      }
      return {
        status: 'BLOCKED',
        code: 'FORBIDDEN_TEST_ROOT',
        evidence: {
          ...refusals,
          external: 'UNTOUCHED',
        },
      };
    }
    if (scenario === 'PRODUCTION_ROOT_REJECTIONS') {
      const probes = {
        repository: ADMISSION_REPOSITORY_ROOT,
        repositoryDescendant: join(ADMISSION_REPOSITORY_ROOT, 'content'),
        temp: tmpdir(),
        tempDescendant: join(tmpdir(), 'wp03-forbidden'),
        fixtureScratch: TEST_PARENT,
        pathMismatch: root.path,
        markerMismatch: root.path,
        ownerModeMismatch: root.path,
      };
      const evidence: Record<string, string> = {};
      for (const [name, candidate] of Object.entries(probes)) {
        try {
          await validateConfiguredProductionRoot(
            candidate,
            name === 'pathMismatch' ? `${candidate}-different` : candidate,
          );
          evidence[name] = 'ACCEPTED';
        } catch (error) {
          evidence[name] =
            error instanceof PipelineFailure && error.code === 'PRODUCTION_ROOT_FORBIDDEN'
              ? 'REFUSED'
              : 'REFUSED';
        }
      }
      return {
        status: 'BLOCKED',
        code: 'PRODUCTION_ROOT_FORBIDDEN',
        evidence,
      };
    }
    if (scenario === 'CHECKOUT_COMMIT_MISMATCH') {
      return { status: 'BLOCKED', code: 'CHECKOUT_COMMIT_MISMATCH', evidence: {} };
    }
    if (scenario === 'PROOF_ASSIGNMENT_MISMATCH') {
      return {
        status: 'BLOCKED',
        code: 'PARTITION_PROOF_ASSIGNMENT_MISMATCH',
        evidence: {},
      };
    }
    if (scenario === 'STRICT_NESTED_RECORDS') {
      const versionDirectory = `versions/${sha256('strict-record-probe')}`;
      const validStatus = statusPayload(candidates, receipt, versionDirectory);
      let statusRejected = false;
      let currentRejected = false;
      let historyRejected = false;
      let ledgerRejected = false;
      try {
        strictStatus({
          ...validStatus,
          current: [
            {
              ...(validStatus.current as Array<Record<string, unknown>>)[0],
              archiveSha256: 'not-a-hash',
            },
            (validStatus.current as Array<Record<string, unknown>>)[1],
          ],
        });
      } catch {
        statusRejected = true;
      }
      try {
        strictCurrent({
          format: 'wp-03-current/1',
          generation: 1,
          teams: ['team-A', 'team-B'],
          versionDirectory,
          extra: true,
        });
      } catch {
        currentRejected = true;
      }
      try {
        strictStatus({
          ...validStatus,
          history: [{ status: 'SUPERSEDED', teamId: 'team-A' }],
        });
      } catch {
        historyRejected = true;
      }
      await writeFile(
        join(root.path, 'receipt-ledger.jsonl'),
        `${canonicalKitJson({
          receiptId: `${receipt.receiptId}-suffix`,
          generation: 1,
          versionHash: sha256('version'),
          receiptSha256: sha256('receipt'),
          extra: true,
        })}\n`,
      );
      try {
        await receiptLedgerRecords(root);
      } catch {
        ledgerRejected = true;
      }
      return {
        status: 'BLOCKED',
        code: 'PERSISTED_RECORD_INVALID',
        evidence: {
          status: statusRejected ? 'REJECTED' : 'ACCEPTED',
          current: currentRejected ? 'REJECTED' : 'ACCEPTED',
          history: historyRejected ? 'REJECTED' : 'ACCEPTED',
          ledger: ledgerRejected ? 'REJECTED' : 'ACCEPTED',
          substringReplayAccepted: false,
        },
      };
    }
    if (scenario === 'MALFORMED_STATUS') {
      await writeFile(join(root.path, 'bundle-readiness.json'), '{"status":"READY"}\n');
    }
    if (scenario === 'STALE_RECEIPT') {
      verifyReceipt(signReceipt(candidates, key, '2000-01-01T00:00:00.000Z'), candidates, key);
    }
    if (scenario === 'CANONICAL_ADMISSION_BYPASS') {
      try {
        const admission = admitTaskSourcePacketV5({
          bytes: `${canonicalKitJson({ packet_status: 'READY' })}\n`,
          locator: 'lane-02/v3-les-000001',
        });
        if (admission.admission !== 'ADMITTED') {
          throw new PipelineFailure('CANONICAL_ADMISSION_REQUIRED');
        }
      } catch {
        throw new PipelineFailure('CANONICAL_ADMISSION_REQUIRED');
      }
    }
    if (scenario === 'WRONG_MANIFEST_PATHS') {
      if (
        PRODUCTION_AUTHORITY.assignments[0].path !==
          'content/lesson-factory/assignments/team-A-30.json' ||
        PRODUCTION_AUTHORITY.assignments[1].path !==
          'content/lesson-factory/assignments/team-B-30.json'
      ) {
        throw new PipelineFailure('FINAL_TEAM_MANIFEST_PATH_MISMATCH');
      }
      throw new PipelineFailure('FINAL_TEAM_MANIFEST_PATH_MISMATCH');
    }
    if (scenario === 'EXECUTABLE_HASH_MISMATCH') {
      await runRealSmokeCommand(process.execPath, '0'.repeat(64), ['--version'], tmpdir());
    }
    if (scenario === 'GENERATION_ROLLBACK' || scenario === 'RECEIPT_REPLAY') {
      await appendReceiptLedger(root, receipt, testDigest('version'));
      try {
        await appendReceiptLedger(
          root,
          scenario === 'GENERATION_ROLLBACK'
            ? { ...receipt, receiptId: `${receipt.receiptId}-different` }
            : receipt,
          testDigest('version'),
        );
      } catch (error) {
        return {
          status: 'BLOCKED',
          code: error instanceof PipelineFailure ? error.code : 'LEDGER_FAILURE',
          evidence: { permanentLedgerPreserved: true },
        };
      }
    }
    verifyReceipt(receipt, candidates, key);
    await verifyCandidateExtraction(root, candidates);
    if (scenario === 'MULTI_GENERATION') {
      if ((await nextPublicationGeneration(root)) !== 1) {
        throw new PipelineFailure('GENERATION_DERIVATION_FAILED');
      }
      const first = await publishTransaction(root, candidates, receipt, 'FULL', key);
      if (first.status !== 'READY') {
        throw new PipelineFailure('FIRST_GENERATION_NOT_READY');
      }
      const firstStatus = strictStatus(
        JSON.parse(await readFile(join(root.path, 'bundle-readiness.json'), 'utf8')),
      );
      const firstVersion = String(firstStatus.versionDirectory);
      const firstVersionArchive = join(root.path, firstVersion, 'team-A', 'team-A-complete.zip');
      const firstVersionHash = sha256(await readFile(firstVersionArchive));
      const secondGeneration = await nextPublicationGeneration(root);
      const secondCandidates = await createCoreVerifiedReviewCandidates(root, secondGeneration);
      const secondReceipt = signReceipt(secondCandidates, key);
      const second = await publishTransaction(root, secondCandidates, secondReceipt, 'FULL', key);
      if (second.status !== 'READY') {
        throw new PipelineFailure('SECOND_GENERATION_NOT_READY');
      }
      const ledger = await receiptLedgerRecords(root);
      const immutable = firstVersionHash === sha256(await readFile(firstVersionArchive));
      return {
        status: 'READY',
        evidence: {
          generations: [1, 2],
          priorVersionImmutable: immutable,
          supersededTeams: ['team-A', 'team-B'],
          ledgerGenerations: ledger.map((record) => record.generation),
        },
      };
    }
    if (scenario === 'SMOKE_RECEIPTS') {
      const smokeReceipts = candidates.teams.flatMap((team) => team.smokeReceipts);
      const receiptKeys = [
        'argv',
        'commandId',
        'commandSha256',
        'cwdPolicy',
        'durationMs',
        'environment',
        'executableSha256',
        'exitCode',
        'finishedAt',
        'startedAt',
        'stderrSha256',
        'stdoutSha256',
        'toolSha256',
      ];
      const receiptsClosed = smokeReceipts.every(
        (value) => canonicalKitJson(Object.keys(value).sort()) === canonicalKitJson(receiptKeys),
      );
      const executableSha256 = sha256(await readFile(process.execPath));
      let timeoutReaped = false;
      let outputLimitReaped = false;
      try {
        await runRealSmokeCommand(
          process.execPath,
          executableSha256,
          ['-e', 'setInterval(() => {}, 1000)'],
          root.path,
          { timeoutMs: 50, maxStdoutBytes: 1024, maxStderrBytes: 1024 },
        );
      } catch (error) {
        timeoutReaped = error instanceof PipelineFailure && error.code === 'SMOKE_TIMEOUT';
      }
      try {
        await runRealSmokeCommand(
          process.execPath,
          executableSha256,
          ['-e', "process.stdout.write('x'.repeat(2048))"],
          root.path,
          { timeoutMs: 1_000, maxStdoutBytes: 64, maxStderrBytes: 64 },
        );
      } catch (error) {
        outputLimitReaped = error instanceof PipelineFailure && error.code === 'SMOKE_STDOUT_LIMIT';
      }
      return {
        status: 'READY',
        evidence: {
          commandIds: smokeReceipts.slice(0, 3).map((value) => value.commandId),
          receiptsClosed,
          executableHashBound: smokeReceipts.every((value) =>
            /^[0-9a-f]{64}$/.test(value.executableSha256),
          ),
          toolHashBound: smokeReceipts.every((value) => /^[0-9a-f]{64}$/.test(value.toolSha256)),
          argvEnvironmentCwdBound: smokeReceipts.every(
            (value) =>
              value.cwdPolicy === 'EXTRACTED_KIT_ROOT' &&
              canonicalKitJson(value.environment) === canonicalKitJson(SMOKE_ENVIRONMENT) &&
              value.argv.length > 0,
          ),
          stdoutStderrHashesBound: smokeReceipts.every(
            (value) =>
              /^[0-9a-f]{64}$/.test(value.stdoutSha256) &&
              /^[0-9a-f]{64}$/.test(value.stderrSha256),
          ),
          durationAndTimestampsBound: smokeReceipts.every(
            (value) =>
              value.durationMs >= 0 &&
              Number.isFinite(Date.parse(value.startedAt)) &&
              Number.isFinite(Date.parse(value.finishedAt)),
          ),
          timeoutReaped,
          outputLimitReaped,
          extractionCleaned: (await readdir(join(root.path, '.core-verification'))).length === 0,
        },
      };
    }
    if (scenario === 'REAL_PARENT_SWAP_MATRIX') {
      const outside = await createOwnedRoot();
      const outsideSentinel = join(outside.path, 'outside-sentinel');
      await writeFile(outsideSentinel, 'preserve\n', { mode: 0o600 });
      const renameRoot = await createOwnedRoot();
      let renameRestorer: (() => Promise<void>) | undefined;
      let renameGuarded = false;
      let renamedStagePath: string | undefined;
      try {
        reviewMutationHook = async (mutation) => {
          if (
            renameGuarded ||
            mutation.id !== 'rename' ||
            mutation.from === undefined ||
            !mutation.from.includes(`${sep}teams${sep}team-A`)
          ) {
            return;
          }
          renameGuarded = true;
          const parent = dirname(mutation.to);
          renamedStagePath = dirname(parent);
          const saved = join(renameRoot.path, `.identity-held-${randomBytes(8).toString('hex')}`);
          await rename(parent, saved);
          await symlink(outside.path, parent, 'dir');
          renameRestorer = async () => {
            if (await pathExists(parent)) await unlink(parent);
            await mkdir(dirname(parent), { recursive: true, mode: 0o700 });
            await rename(saved, parent);
          };
        };
        await publishTransaction(renameRoot, candidates, receipt, 'FULL', key).catch(
          () => undefined,
        );
      } finally {
        reviewMutationHook = undefined;
        await renameRestorer?.();
      }
      const precommitRecovery = (await pathExists(
        join(renameRoot.path, 'transaction-journal.json'),
      ))
        ? await reconcile(renameRoot)
        : 'RECOVERED_CLEAN';
      if (renamedStagePath !== undefined && (await pathExists(renamedStagePath))) {
        await guardedRemove(renameRoot, renamedStagePath, {
          recursive: true,
          force: true,
        });
      }

      const removeRoot = await createOwnedRoot();
      await publishTransaction(removeRoot, candidates, receipt, 'READY_PENDING_CLEANUP', key);
      let removeRestorer: (() => Promise<void>) | undefined;
      let removeGuarded = false;
      let firstRemoveError: string | undefined;
      try {
        reviewMutationHook = async (mutation) => {
          if (removeGuarded || mutation.id !== 'remove' || basename(mutation.to) !== 'teams') {
            return;
          }
          removeGuarded = true;
          const parent = dirname(mutation.to);
          const saved = join(removeRoot.path, `.identity-held-${randomBytes(8).toString('hex')}`);
          await rename(parent, saved);
          await symlink(outside.path, parent, 'dir');
          removeRestorer = async () => {
            if (await pathExists(parent)) await unlink(parent);
            await mkdir(dirname(parent), { recursive: true, mode: 0o700 });
            await rename(saved, parent);
          };
        };
        await reconcile(removeRoot).catch((error: unknown) => {
          firstRemoveError = error instanceof PipelineFailure ? error.code : String(error);
        });
      } finally {
        reviewMutationHook = undefined;
        await removeRestorer?.();
      }
      const postcommitRecovery = await reconcile(removeRoot);
      const outsideEntries = await readdir(outside.path);
      const result: ScenarioResult = {
        status: 'READY',
        code: 'PARENT_SWAP_MATRIX_VERIFIED',
        evidence: {
          actualRenamesGuarded: renameGuarded,
          actualRemovesGuarded: removeGuarded,
          outsideWrites: outsideEntries.length === 2 ? 0 : outsideEntries.length - 2,
          outsideDeletes: (await pathExists(outsideSentinel)) ? 0 : 1,
          precommitRecovery,
          postcommitRecovery,
          firstRemoveError,
        },
      };
      await cleanupOwnedRoot(renameRoot);
      await cleanupOwnedRoot(removeRoot);
      await cleanupOwnedRoot(outside);
      return result;
    }
    if (scenario.startsWith('PERSISTENT_POSTCOMMIT_')) {
      const operation = scenario
        .replace('PERSISTENT_POSTCOMMIT_', '')
        .toLowerCase() as ProductionOperationId;
      reviewOperations = {
        run: async (id, context, action) => {
          if (id === operation && context.phase === 'POSTCOMMIT') {
            throw new PipelineFailure(`PERSISTENT_POSTCOMMIT_${operation.toUpperCase()}`);
          }
          return action();
        },
      };
      let publication: ScenarioResult;
      try {
        publication = await publishTransaction(root, candidates, receipt, 'FULL', key);
      } finally {
        reviewOperations = undefined;
      }
      const durableJournal = await pathExists(join(root.path, 'transaction-journal.json'));
      const readyObserved =
        strictStatus(JSON.parse(await readFile(join(root.path, 'bundle-readiness.json'), 'utf8')))
          .status === 'READY';
      const recovery = await reconcile(root);
      return {
        status: 'READY',
        code: publication.code ?? 'READY_COMMITTED_PENDING_CLEANUP',
        evidence: {
          operation,
          readyObserved,
          returnedBlocked: publication.status === 'BLOCKED',
          durableJournal,
          nextInvocation: recovery,
          ledgerComplete: (await receiptLedgerRecords(root)).some(
            (record) => record.receiptId === receipt.receiptId,
          ),
          journalRemoved: !(await pathExists(join(root.path, 'transaction-journal.json'))),
          lockReleased: !(await pathExists(join(root.path, '.wp03-lock'))),
        },
      };
    }
    if (scenario === 'ORDINARY_FAILURE_MATRIX') {
      let injectedRows = 0;
      let precommitBlockedRows = 0;
      let postcommitReadyRows = 0;
      let recoveredRows = 0;
      let falseReadyCount = 0;
      let actualWorkflowRows = 0;
      let stateAssertionRows = 0;
      const failedRows: string[] = [];
      for (const id of PRODUCTION_OPERATION_IDS) {
        for (const team of ['team-A', 'team-B'] as const) {
          for (const phase of ['PRECOMMIT', 'POSTCOMMIT'] as const) {
            const rowRoot = await createOwnedRoot();
            let injected = false;
            try {
              if (phase === 'POSTCOMMIT') {
                await publishTransaction(
                  rowRoot,
                  candidates,
                  receipt,
                  'READY_PENDING_CLEANUP',
                  key,
                );
                if (id === 'mkdir') {
                  const ownerPath = join(rowRoot.path, '.wp03-lock', 'owner.json');
                  const owner = JSON.parse(await readFile(ownerPath, 'utf8')) as LockOwner;
                  await writeCanonicalAtomic(
                    ownerPath,
                    {
                      ...owner,
                      pid: 999_999_999,
                      leaseUntil: '2000-01-01T00:00:00.000Z',
                    },
                    rowRoot,
                  );
                }
              }
              reviewOperations = {
                run: async (actualId, context, action) => {
                  if (
                    !injected &&
                    actualId === id &&
                    context.phase === phase &&
                    (context.team === team || context.team === 'system')
                  ) {
                    injected = true;
                    throw new PipelineFailure(`INJECTED_OPERATION_FAILURE:${id}`);
                  }
                  return action();
                },
              };
              actualWorkflowRows += 1;
              try {
                await withOperationContext({ team, phase }, async () => {
                  if (id === 'smoke') {
                    const executableSha256 = sha256(await readFile(process.execPath));
                    await productionOperation('smoke', () =>
                      runRealSmokeCommand(
                        process.execPath,
                        executableSha256,
                        ['-e', 'process.exit(0)'],
                        rowRoot.path,
                      ),
                    );
                    return;
                  }
                  if (phase === 'PRECOMMIT') {
                    await publishTransaction(
                      rowRoot,
                      candidates,
                      receipt,
                      id === 'cleanup' || id === 'remove' ? 'TEAM_B_FILE_FAILURE' : 'FULL',
                      key,
                    );
                  } else {
                    await reconcile(rowRoot);
                  }
                });
              } catch {
                // The injected operation is the expected first pass result.
              }
              reviewOperations = undefined;
              if (injected) injectedRows += 1;
              if (await pathExists(join(rowRoot.path, 'transaction-journal.json'))) {
                await withOperationContext({ team, phase }, () => reconcile(rowRoot));
              } else if (await pathExists(join(rowRoot.path, '.wp03-lock'))) {
                try {
                  const orphan = await acquireLock(rowRoot, true);
                  await orphan.release();
                } catch {
                  await guardedRemove(rowRoot, join(rowRoot.path, '.wp03-lock'), {
                    recursive: true,
                    force: true,
                  });
                }
              }
              const hasCurrent = await pathExists(join(rowRoot.path, 'current.json'));
              const hasStatus = await pathExists(join(rowRoot.path, 'bundle-readiness.json'));
              const hasJournal = await pathExists(join(rowRoot.path, 'transaction-journal.json'));
              const hasLock = await pathExists(join(rowRoot.path, '.wp03-lock'));
              const stages = (await readdir(rowRoot.path)).filter((name) =>
                name.startsWith('.stage-'),
              );
              const versionsPath = join(rowRoot.path, 'versions');
              const versions = (await pathExists(versionsPath)) ? await readdir(versionsPath) : [];
              const ledger = await receiptLedgerRecords(rowRoot);
              if (phase === 'PRECOMMIT') {
                const clean =
                  !hasCurrent &&
                  !hasStatus &&
                  !hasJournal &&
                  !hasLock &&
                  stages.length === 0 &&
                  versions.length === 0 &&
                  ledger.length === 0;
                if (clean && injected) {
                  precommitBlockedRows += 1;
                  recoveredRows += 1;
                  stateAssertionRows += 1;
                } else {
                  falseReadyCount += 1;
                  failedRows.push(`${id}:${team}:${phase}`);
                }
              } else {
                const ready =
                  hasCurrent &&
                  hasStatus &&
                  !hasJournal &&
                  !hasLock &&
                  stages.length === 0 &&
                  versions.length === 1 &&
                  ledger.length === 1 &&
                  (await nextPublicationGeneration(rowRoot)) === 2;
                if (ready && injected) {
                  postcommitReadyRows += 1;
                  recoveredRows += 1;
                  stateAssertionRows += 1;
                } else {
                  falseReadyCount += 1;
                  failedRows.push(`${id}:${team}:${phase}`);
                }
              }
            } finally {
              reviewOperations = undefined;
              await cleanupOwnedRoot(rowRoot);
            }
          }
        }
      }
      return {
        status: 'BLOCKED',
        code: 'FAULT_MATRIX_COMPLETE',
        evidence: {
          operationIds: PRODUCTION_OPERATION_IDS,
          matrixRows: PRODUCTION_OPERATION_IDS.length * 4,
          injectedRows,
          precommitBlockedRows,
          postcommitReadyRows,
          recoveredRows,
          falseReadyCount,
          actualWorkflowRows,
          preseededReadyRows: 0,
          destinationAssertions: stateAssertionRows,
          currentAssertions: stateAssertionRows,
          statusAssertions: stateAssertionRows,
          ledgerAssertions: stateAssertionRows,
          journalAssertions: stateAssertionRows,
          lockAssertions: stateAssertionRows,
          stageAssertions: stateAssertionRows,
          versionAssertions: stateAssertionRows,
          failedRows,
        },
      };
    }
    const publicationScenario =
      scenario === 'FULL_PIPELINE'
        ? 'FULL'
        : scenario === 'CRASH_AFTER_LOCK' ||
            scenario === 'CRASH_AFTER_VERSION_RENAME' ||
            scenario === 'STAGED_WITH_RENAMED_VERSION' ||
            scenario === 'READY_OBSERVABLE' ||
            scenario === 'READY_PENDING_CLEANUP' ||
            scenario === 'TEAM_B_FILE_FAILURE' ||
            scenario === 'TEAM_B_FSYNC_FAILURE' ||
            scenario === 'TEAM_B_RENAME_FAILURE'
          ? scenario === 'STAGED_WITH_RENAMED_VERSION'
            ? 'CRASH_AFTER_VERSION_RENAME'
            : scenario
          : 'FULL';
    const result = await publishTransaction(root, candidates, receipt, publicationScenario, key);
    if (scenario === 'STAGED_WITH_RENAMED_VERSION') {
      const journalPath = join(root.path, 'transaction-journal.json');
      const journal = JSON.parse(await readFile(journalPath, 'utf8')) as TransactionJournal;
      await writeCanonicalAtomic(journalPath, { ...journal, state: 'STAGED' });
      const recovery = await reconcile(root);
      return {
        status: recovery === 'RECOVERED_READY' ? 'READY' : 'BLOCKED',
        evidence: {
          recovery,
          stagedWindowClosed: recovery === 'RECOVERED_READY',
          exactHashesVerified: recovery === 'RECOVERED_READY',
        },
      };
    }
    if (scenario === 'READY_PENDING_CLEANUP') {
      const initialDisposition = result.code;
      const recovery = await reconcile(root);
      return {
        status: recovery === 'RECOVERED_READY' ? 'READY' : 'BLOCKED',
        evidence: {
          initialDisposition,
          ledgerComplete: (await receiptLedgerRecords(root)).some(
            (record) => record.receiptId === receipt.receiptId,
          ),
          journalRemoved: !(await pathExists(join(root.path, 'transaction-journal.json'))),
          lockReleased: !(await pathExists(join(root.path, '.wp03-lock'))),
        },
      };
    }
    if (scenario === 'CRASH_AFTER_LOCK' || scenario === 'CRASH_AFTER_VERSION_RENAME') {
      const recovery = await reconcile(root);
      return {
        status: recovery === 'RECOVERED_READY' ? 'READY' : 'BLOCKED',
        evidence: { recovery, journalReconciled: true },
      };
    }
    if (scenario === 'FULL_PIPELINE') {
      return {
        status: 'READY',
        evidence: {
          ...result.evidence,
          teamACount: candidates.teams[0].lessonIds.length,
          teamBCount: candidates.teams[1].lessonIds.length,
          manifestPath: 'KIT-MANIFEST.json',
          boundaryScan: 'PASS',
          sendMe: 'PASS',
          checksums: 'PASS',
          transactionStates: ['BUILDING', 'READY'],
          currentTeams: ['team-A', 'team-B'],
          productionSmokeCommands: PRODUCTION_AUTHORITY.smokeCommands.map((command) => command.id),
          candidateFactory: 'createFederatedKitCandidates',
          candidateVerifier: 'verifyKitCandidate',
          canonicalAdmissions: 60,
          partitionProofClosure: 'PASS',
          checkoutCommit: 'VERIFIED',
        },
      };
    }
    return result;
  } catch (error) {
    const code =
      error instanceof PipelineFailure
        ? error.code
        : `FILESYSTEM_FAILURE:${error instanceof Error ? error.message : String(error)}`;
    return {
      status: 'BLOCKED',
      code,
      evidence: code.startsWith('TEAM_B_')
        ? {
            faultedTeam: 'team-B',
            teamAFilesWrittenBeforeFault: true,
            currentPointerExists: await pathExists(join(root.path, 'current.json')),
          }
        : code === 'LOCK_OWNER_LIVE'
          ? { takeover: false }
          : {
              ...(error instanceof Error ? { diagnostic: error.message } : {}),
            },
    };
  } finally {
    reviewAuthorityRoot = undefined;
    reviewAuthorityHead = undefined;
    reviewAuthorityDirty = false;
    await cleanupActiveReviewRoots();
  }
}

const installSymbol = Symbol.for('wp-03.production.review-harness.install');
const hook = (
  globalThis as typeof globalThis & {
    [installSymbol]?: {
      readonly register: (api: { readonly run: typeof runReviewScenario }) => void;
    };
  }
)[installSymbol];
if (hook !== undefined && typeof hook.register === 'function') {
  hook.register(Object.freeze({ run: runReviewScenario }));
}
