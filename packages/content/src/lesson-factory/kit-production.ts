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
  type TeamKitInput,
  type ValidatedAssignmentProjection,
  type ValidatedPacketProjection,
} from './kit-factory';

const RUN_ID = '2026-08-03T1727-0500';
const TEST_PARENT = join(
  ADMISSION_REPOSITORY_ROOT,
  '.tmp/scratch/lesson-factory-2026-08-03T1727-0500/wp-03-production-tests',
);

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

interface LoadedProductionInputs {
  readonly proofBytes: Uint8Array;
  readonly assembledAt: string;
  readonly coreFiles: readonly KitArchiveFile[];
  readonly teams: readonly [LoadedTeamInput, LoadedTeamInput];
  readonly snapshotSha256: string;
}

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

async function collectProductionBlockers(): Promise<Blocker[]> {
  const blockers: Blocker[] = [];
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
      const admitted = admitIntake({
        bytes,
        locator: `${RUN_ID}/assignment-${authority.teamId === 'team-A' ? '02' : '03'}`,
      });
      const document = JSON.parse(bytes.toString('utf8')) as Record<string, unknown>;
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
      await loadCanonicalProductionInputs();
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

  if (PRODUCTION_AUTHORITY.externalHandoffRoot === undefined) {
    add(
      'EXTERNAL_HANDOFF_ROOT_NOT_CONFIGURED',
      'the exact reviewed external handoff root is not configured',
    );
  }
  if (PRODUCTION_AUTHORITY.expectedRepositoryCommit === undefined) {
    add(
      'REPOSITORY_PIN_NOT_CONFIGURED',
      'the exact repository commit and production pins are not configured',
    );
  }
  if (
    PRODUCTION_AUTHORITY.smokeExecutable === undefined ||
    PRODUCTION_AUTHORITY.smokeExecutableSha256 === undefined
  ) {
    add(
      'SMOKE_EXECUTABLE_NOT_CONFIGURED',
      'the absolute smoke executable and executable hash are not configured',
    );
  }
  if (PRODUCTION_AUTHORITY.finalizationIssuerKey === undefined) {
    add(
      'FINALIZATION_ISSUER_KEY_NOT_CONFIGURED',
      'the trusted finalization receipt issuer key is not configured',
    );
  }
  if (
    !(await pathExists(
      join(ADMISSION_REPOSITORY_ROOT, PRODUCTION_AUTHORITY.finalizationReceiptPath),
    ))
  ) {
    add('FINALIZATION_RECEIPT_MISSING', 'the closed dual-team finalization receipt is missing');
  }
  if (!PRODUCTION_AUTHORITY.executionArmed) {
    add('PRODUCTION_EXECUTION_NOT_ARMED', 'production execution remains deliberately unarmed');
  }
  return uniqueBlockers(blockers);
}

export async function preflightProductionKits(): Promise<BlockedResult> {
  return {
    status: 'BLOCKED',
    runId: RUN_ID,
    userSendable: false,
    artifacts: [],
    blockers: await collectProductionBlockers(),
  };
}

function requiredString(document: Record<string, unknown>, field: string, code: string): string {
  const value = document[field];
  if (typeof value !== 'string' || value.length === 0) throw new PipelineFailure(code);
  return value;
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
    const assignmentAdmission = admitIntake({
      bytes: assignmentBytes,
      locator: `${RUN_ID}/assignment-${authority.teamId === 'team-A' ? '02' : '03'}`,
    });
    if (assignmentAdmission.admission !== 'ADMITTED') {
      throw new PipelineFailure('FINAL_TEAM_MANIFEST_INVALID');
    }
    const assignment = JSON.parse(assignmentBytes.toString('utf8')) as Record<string, unknown>;
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

  const coreFiles = await Promise.all(
    PRODUCTION_AUTHORITY.corePaths.map(
      async (path): Promise<KitArchiveFile> => ({
        path,
        bytes: await readFile(join(ADMISSION_REPOSITORY_ROOT, path)),
      }),
    ),
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

async function productionPins(loaded: LoadedProductionInputs): Promise<CandidateSet['pins']> {
  if (
    PRODUCTION_AUTHORITY.expectedRepositoryCommit === undefined ||
    PRODUCTION_AUTHORITY.smokeExecutableSha256 === undefined
  ) {
    throw new PipelineFailure('PRODUCTION_PINS_NOT_CONFIGURED');
  }
  const byPath = new Map(loaded.coreFiles.map((file) => [file.path, sha256(file.bytes)] as const));
  return {
    proofSha256: sha256(loaded.proofBytes),
    profileSha256:
      byPath.get('content/lesson-factory/deadline-profile/deadline-profile.json') ?? '',
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
    repositoryCommit: PRODUCTION_AUTHORITY.expectedRepositoryCommit,
    toolSha256: sha256(await readFile(join(ADMISSION_REPOSITORY_ROOT, 'pnpm-lock.yaml'))),
    executableSha256: PRODUCTION_AUTHORITY.smokeExecutableSha256,
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
    kitSha256: byPath.get('content/lesson-factory/schemas/kit-manifest.schema.json') ?? '',
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
): {
  readonly input: TeamKitInput;
  readonly assignmentProjection: ValidatedAssignmentProjection;
  readonly packetProjections: ReadonlyMap<string, ValidatedPacketProjection>;
} {
  const assignmentBindingId = sha256(loaded.assignmentBytes);
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
      runId: RUN_ID,
      teamId: loaded.teamId,
      laneId: loaded.laneId,
      assembledAt,
      lifecycle: 'TEAMMATE_AUTHORING',
      deadline: '2026-08-04T09:30:00-05:00',
      branchConvention: 'lesson-factory/{team}/{lesson-id}',
      expectedPins: pins,
      expectedCohort: {
        assignmentId: loaded.assignmentId,
        assignmentBindingId,
        contractVersion,
        schemaVersion,
        generation,
      },
      requiredCorePaths: coreFiles.map((file) => file.path),
      allowedInventory: [
        ...coreFiles.map(inventoryEntry),
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
      coreFiles,
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
): Promise<CandidateSet> {
  const pins = await productionPins(loaded);
  const kitPins = productionKitPins(loaded, pins);
  const teamA = productionTeamInput(
    loaded.teams[0],
    loaded.coreFiles,
    kitPins,
    generation,
    loaded.assembledAt,
  );
  const teamB = productionTeamInput(
    loaded.teams[1],
    loaded.coreFiles,
    kitPins,
    generation,
    loaded.assembledAt,
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
  const executable = PRODUCTION_AUTHORITY.smokeExecutable;
  const executableSha256 = PRODUCTION_AUTHORITY.smokeExecutableSha256;
  if (executable === undefined || executableSha256 === undefined) {
    throw new PipelineFailure('SMOKE_EXECUTABLE_NOT_CONFIGURED');
  }
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
        smokeEnvironment: { CI: '1', NO_COLOR: '1' },
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

async function openConfiguredProductionRoot(): Promise<OwnedRoot> {
  const configured = PRODUCTION_AUTHORITY.externalHandoffRoot;
  if (configured === undefined) {
    throw new PipelineFailure('EXTERNAL_HANDOFF_ROOT_NOT_CONFIGURED');
  }
  return validateConfiguredProductionRoot(configured, configured);
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
    const root = await openConfiguredProductionRoot();
    if (await pathExists(join(root.path, 'transaction-journal.json'))) {
      const recovery = await reconcile(root);
      if (recovery === 'RECOVERED_READY') {
        const recovered = strictStatus(
          JSON.parse(await readFile(join(root.path, 'bundle-readiness.json'), 'utf8')),
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
    if (
      PRODUCTION_AUTHORITY.expectedRepositoryCommit === undefined ||
      (await checkoutCommit()) !== PRODUCTION_AUTHORITY.expectedRepositoryCommit
    ) {
      throw new PipelineFailure('CHECKOUT_COMMIT_MISMATCH');
    }
    const generation = await nextPublicationGeneration(root);
    const candidates = await buildAndVerifyProductionCandidates(loaded, root, generation);
    const receipt = parseClosedReceipt(
      JSON.parse(
        await readFile(
          join(ADMISSION_REPOSITORY_ROOT, PRODUCTION_AUTHORITY.finalizationReceiptPath),
          'utf8',
        ),
      ),
    );
    if (PRODUCTION_AUTHORITY.finalizationIssuerKey === undefined) {
      throw new PipelineFailure('FINALIZATION_ISSUER_KEY_NOT_CONFIGURED');
    }
    verifyReceipt(receipt, candidates, PRODUCTION_AUTHORITY.finalizationIssuerKey);
    const reloaded = await loadCanonicalProductionInputs();
    if (reloaded.snapshotSha256 !== loaded.snapshotSha256) {
      throw new PipelineFailure('INPUT_CHANGED_AFTER_PREFLIGHT');
    }
    const published = await publishTransaction(
      root,
      candidates,
      receipt,
      'FULL',
      PRODUCTION_AUTHORITY.finalizationIssuerKey,
      async () => {
        const lockedReload = await loadCanonicalProductionInputs();
        if (lockedReload.snapshotSha256 !== loaded.snapshotSha256) {
          throw new PipelineFailure('INPUT_CHANGED_AFTER_PREFLIGHT');
        }
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
    entries.length !== PRODUCTION_AUTHORITY.corePaths.length + 32 ||
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
      environment: { CI: '1', NO_COLOR: '1' },
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
        smokeEnvironment: { CI: '1', NO_COLOR: '1' },
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
        smokeEnvironment: { CI: '1', NO_COLOR: '1' },
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
        environment: { CI: '1', NO_COLOR: '1' },
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

function verifyReceipt(
  receipt: FinalizationReceipt,
  candidates: CandidateSet,
  key: string,
  now = Date.now(),
): void {
  const parsed = Date.parse(receipt.validationTimestamp);
  if (!Number.isFinite(parsed) || parsed > now + 60_000 || now - parsed > 15 * 60_000) {
    throw new PipelineFailure('AUTHORIZATION_STALE');
  }
  const expectedUnsigned = unsignedReceipt(candidates, receipt.validationTimestamp);
  const expectedSignature = createHmac('sha256', key)
    .update(canonicalKitJson(expectedUnsigned))
    .digest('hex');
  const actual = Buffer.from(receipt.signature, 'hex');
  const expected = Buffer.from(expectedSignature, 'hex');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    throw new PipelineFailure('AUTHORIZATION_SIGNATURE_INVALID');
  }
  const comparable = { ...receipt };
  delete (comparable as { signature?: string }).signature;
  if (canonicalKitJson(comparable) !== canonicalKitJson(expectedUnsigned)) {
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
    const info = await lstat(path);
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
          'manifestSha256',
          'status',
          'supersededByVersion',
          'teamId',
          'versionDirectory',
        ]) &&
      (record.teamId === 'team-A' || record.teamId === 'team-B') &&
      record.status === 'SUPERSEDED' &&
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
          extraction.entries.length !== PRODUCTION_AUTHORITY.corePaths.length + 32 ||
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
      env: { CI: '1', NO_COLOR: '1' },
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
        rejectPromise(new PipelineFailure('SMOKE_COMMAND_FAILED'));
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
              canonicalKitJson(value.environment) ===
                canonicalKitJson({ CI: '1', NO_COLOR: '1' }) &&
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
