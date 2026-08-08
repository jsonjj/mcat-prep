import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeSync,
} from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

import {
  admitTaskSourcePacketV5,
  canonicalJson,
  type TaskSourcePacketV5AdmissionRequest,
  type TaskSourcePacketV5AdmissionResult,
} from './admission';
import {
  createTaskSourcePackets,
  resolvePacketResearchPaths,
  type PacketGeneratorSources,
} from './packet-generator';

type JsonObject = Record<string, unknown>;

const PACKET_ROOT = 'content/lesson-factory/packets';
const MANIFEST_NAME = 'packet-set-manifest.json';
const LOCK_NAME = '.packets.publish.lock';
const STAGE_PREFIX = '.packets.stage-';
const PACKET_COUNT = 111;
const REVIEWED_AGGREGATE_SHA256 =
  '6a850801e7d542b2aa6adc8d76ef7999e9725d9ff72fcdcaa81d64547036a4dd';
const RAW_OR_PROTECTED_KEYS = new Set([
  'exact_text',
  'raw_passage_text',
  'question_stem',
  'figure_svg',
  'verbatim_quote',
  'protected_answer',
  'restricted_text',
]);

export const PACKET_RUNTIME_TYPESCRIPT_AUTHORITY_PATHS = Object.freeze(
  [
    'packages/content/src/lesson-factory/admission/authority.ts',
    'packages/content/src/lesson-factory/admission/canonical-json.ts',
    'packages/content/src/lesson-factory/admission/index.ts',
    'packages/content/src/lesson-factory/admission/intake.ts',
    'packages/content/src/lesson-factory/admission/json-schema-subset.ts',
    'packages/content/src/lesson-factory/admission/packet-semantics.ts',
    'packages/content/src/lesson-factory/admission/reference-model.ts',
    'packages/content/src/lesson-factory/packet-generator.ts',
    'packages/content/src/lesson-factory/packet-writer.ts',
    'packages/content/src/lesson-factory/packets.ts',
    'tools/content-cli/src/entry.ts',
    'tools/content-cli/src/packet-main.ts',
  ].sort(),
);

export const PACKET_PROOF_PRODUCER_AUTHORITIES = Object.freeze([
  {
    path: 'packages/content/src/lesson-factory/assignment-partition.ts',
    reason: 'PRODUCES_WP02_ASSIGNMENT_PARTITION_PROOF' as const,
    outputBinding: {
      path: 'content/lesson-factory/assignments/partition-proof.json',
      contractId: 'lesson-factory.assignment-partition-proof',
      contractVersion: '2.0.0',
      allocationHashField: 'allocation_content_sha256',
      generationLessonCount: 111,
      capacities: { primary: 51, 'team-A': 30, 'team-B': 30 },
    },
  },
]);

export const PACKET_DATA_AUTHORITY_PATHS = Object.freeze(
  [
    'content/lesson-factory/assignments/partition-proof.json',
    'content/lesson-factory/deadline-profile/deadline-profile.json',
    'content/lesson-factory/deadline-profile/owner-source-use-receipt.json',
    'content/lesson-factory/deadline-profile/owner-source-use-statement.md',
    'content/lesson-factory/deadline-profile/release-policy.json',
    'content/lesson-factory/schemas/assignment-manifest.schema.json',
    'content/lesson-factory/schemas/assignment-partition-proof.schema.json',
    'content/lesson-factory/schemas/bundle-readiness.schema.json',
    'content/lesson-factory/schemas/candidate-quality-ledger.schema.json',
    'content/lesson-factory/schemas/deadline-profile.schema.json',
    'content/lesson-factory/schemas/import-index.schema.json',
    'content/lesson-factory/schemas/intake-validation.schema.json',
    'content/lesson-factory/schemas/kit-manifest.schema.json',
    'content/lesson-factory/schemas/lesson-handoff.schema.json',
    'content/lesson-factory/schemas/lifecycle-nonclaims.schema.json',
    'content/lesson-factory/schemas/owner-route-policy-receipt.schema.json',
    'content/lesson-factory/schemas/owner-source-use-receipt.schema.json',
    'content/lesson-factory/schemas/release-policy.schema.json',
    'content/lesson-factory/schemas/runner-log-record.schema.json',
    'content/lesson-factory/schemas/shared-vocabulary.schema.json',
    'content/lesson-factory/schemas/task-source-packet.schema.json',
    'content/lesson-factory/schemas/team-handoff.schema.json',
    'curriculum/v3/v3-lesson-authoring-manifest.json',
    'key-docs/lesson-quality-rubric.md',
    'package.json',
    'packages/content/package.json',
    'packages/content/tsconfig.json',
    'pnpm-lock.yaml',
    'pnpm-workspace.yaml',
    'tools/content-cli/package.json',
    'tools/content-cli/tsconfig.json',
    'tsconfig.base.json',
  ].sort(),
);

export const PACKET_SOURCE_AUTHORITY_PATHS = Object.freeze(
  [
    ...PACKET_RUNTIME_TYPESCRIPT_AUTHORITY_PATHS,
    ...PACKET_PROOF_PRODUCER_AUTHORITIES.map((producer) => producer.path),
    ...PACKET_DATA_AUTHORITY_PATHS,
  ].sort(),
);

export type PacketAuthorityCategory =
  | 'RUNTIME_TYPESCRIPT_MODULE'
  | 'NON_RUNTIME_PROOF_PRODUCER'
  | 'DATA_SCHEMA_PROFILE_PROOF_BUILD';

export interface PacketProofOutputBinding {
  readonly path: string;
  readonly contractId: string;
  readonly contractVersion: string;
  readonly allocationContentSha256: string;
  readonly generationLessonCount: number;
  readonly capacities: {
    readonly primary: number;
    readonly 'team-A': number;
    readonly 'team-B': number;
  };
}

export class PacketPublicationRefusal extends Error {
  constructor(
    readonly code: 'SOURCE_TREE_NOT_COMMITTED',
    message: string,
  ) {
    super(message);
    this.name = 'PacketPublicationRefusal';
  }
}

export interface PacketSourceAuthorityClosure {
  readonly sourceCommitSha: string;
  readonly digestSha256: string;
  readonly files: readonly {
    readonly path: string;
    readonly blobSha: string;
    readonly category: PacketAuthorityCategory;
    readonly reason:
      | 'EVALUATED_BY_PACKET_CLI_RUNTIME'
      | 'PRODUCES_WP02_ASSIGNMENT_PARTITION_PROOF'
      | 'PACKET_DATA_SCHEMA_PROFILE_PROOF_BUILD_AUTHORITY';
    readonly outputBinding?: PacketProofOutputBinding;
  }[];
}

export interface PacketPublicationBatch {
  readonly readyCount: number;
  readonly blockedCount: number;
  readonly files: Readonly<Record<string, string>>;
  readonly outputSetSha256: string;
  readonly artifacts?: Readonly<
    Record<string, { readonly fileSha256: string; readonly contentSha256: string }>
  >;
}

export interface PacketPublicationAuthority {
  readonly expectedLessonIds: readonly string[];
  readonly allocations: Readonly<
    Record<
      string,
      {
        readonly assignmentId: string;
        readonly laneId: string;
        readonly teamId: string;
      }
    >
  >;
  readonly pins: {
    readonly allocationProofFileSha256: string;
    readonly deadlineProfileFileSha256: string;
    readonly taskPacketSchemaFileSha256: string;
    readonly sourceUseReceiptFileSha256: string;
    readonly sourceAuthorityClosure: PacketSourceAuthorityClosure;
  };
  readonly admit: (
    request: TaskSourcePacketV5AdmissionRequest,
  ) => TaskSourcePacketV5AdmissionResult;
}

export type PacketWriterFaultPoint =
  | 'LOCK_ACQUIRED'
  | 'STAGE_CREATED'
  | 'FILE_WRITTEN'
  | 'FILE_FSYNCED'
  | 'READBACK_VALIDATED'
  | 'MANIFEST_WRITTEN'
  | 'STAGE_FSYNCED'
  | 'BEFORE_RENAME'
  | 'AFTER_RENAME';

export interface PacketPublicationSummary {
  readonly status: 'PREFLIGHT_OK' | 'PUBLISHED' | 'ALREADY_PUBLISHED';
  readonly readyCount: number;
  readonly blockedCount: number;
  readonly fileCount: number;
  readonly aggregateSha256: string;
  readonly manifestFileSha256: string;
  readonly destination: typeof PACKET_ROOT;
}

interface ValidatedPacket {
  readonly lessonId: string;
  readonly relativePath: string;
  readonly bytes: string;
  readonly fileSha256: string;
  readonly contentSha256: string;
  readonly laneId: string;
  readonly teamId: string;
  readonly assignmentId: string;
}

interface PacketSetManifest extends JsonObject {
  readonly contract_id: 'lesson-factory.packet-set-manifest';
  readonly contract_version: '1.0.0';
  readonly packet_count: 111;
  readonly aggregate_sha256: string;
  readonly allocation_proof_file_sha256: string;
  readonly deadline_profile_file_sha256: string;
  readonly task_packet_schema_file_sha256: string;
  readonly source_use_receipt_file_sha256: string;
  readonly source_commit_sha: string;
  readonly source_authority_closure: {
    readonly digest_sha256: string;
    readonly files: readonly {
      readonly path: string;
      readonly blob_sha: string;
      readonly category: PacketAuthorityCategory;
      readonly reason:
        | 'EVALUATED_BY_PACKET_CLI_RUNTIME'
        | 'PRODUCES_WP02_ASSIGNMENT_PARTITION_PROOF'
        | 'PACKET_DATA_SCHEMA_PROFILE_PROOF_BUILD_AUTHORITY';
      readonly output_binding?: {
        readonly path: string;
        readonly contract_id: string;
        readonly contract_version: string;
        readonly allocation_content_sha256: string;
        readonly generation_lesson_count: number;
        readonly capacities: PacketProofOutputBinding['capacities'];
      };
    }[];
  };
  readonly packets: readonly {
    readonly lesson_id: string;
    readonly path: string;
    readonly assignment_id: string;
    readonly lane_id: string;
    readonly team_id: string;
    readonly file_sha256: string;
    readonly content_sha256: string;
  }[];
}

function sha256(bytes: string): string {
  return createHash('sha256').update(bytes, 'utf8').digest('hex');
}

function isObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function parseObject(bytes: string, label: string): JsonObject {
  let parsed: unknown;
  try {
    parsed = JSON.parse(bytes);
  } catch {
    throw new Error(`${label} is not valid JSON`);
  }
  if (!isObject(parsed)) throw new Error(`${label} must be a JSON object`);
  return parsed;
}

function assertNoProtectedKeys(value: unknown, path = ''): void {
  if (Array.isArray(value)) {
    value.forEach((child, index) => assertNoProtectedKeys(child, `${path}/${index}`));
    return;
  }
  if (!isObject(value)) return;
  for (const [key, child] of Object.entries(value)) {
    if (RAW_OR_PROTECTED_KEYS.has(key.toLowerCase())) {
      throw new Error(`packet contains prohibited field at ${path}/${key}`);
    }
    assertNoProtectedKeys(child, `${path}/${key}`);
  }
}

function expectedPath(lessonId: string): string {
  return `${PACKET_ROOT}/${lessonId}/task-source-packet.json`;
}

function canonicalCollisionKey(path: string): string {
  return path.normalize('NFC').toLocaleLowerCase('en-US');
}

function assertSafeRelativePath(path: string): void {
  if (
    path === '' ||
    isAbsolute(path) ||
    path.includes('\\') ||
    path.split('/').some((segment) => segment === '' || segment === '.' || segment === '..') ||
    path.normalize('NFC') !== path
  ) {
    throw new Error(`unsafe packet path ${JSON.stringify(path)}`);
  }
}

function assertConfined(root: string, candidate: string): void {
  const rel = relative(resolve(root), resolve(candidate));
  if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new Error(`path escapes publication root: ${candidate}`);
  }
}

function assertExistingPathHasNoSymlink(root: string, target: string): void {
  assertConfined(root, target);
  const rel = relative(root, target);
  let cursor = root;
  if (lstatSync(cursor).isSymbolicLink()) throw new Error(`symlink root is forbidden: ${cursor}`);
  for (const segment of rel.split(sep).filter(Boolean)) {
    cursor = join(cursor, segment);
    if (!existsSync(cursor)) break;
    if (lstatSync(cursor).isSymbolicLink()) throw new Error(`symlink is forbidden: ${cursor}`);
  }
}

function writeExclusive(
  path: string,
  bytes: string,
  afterWrite?: () => void,
  afterFsync?: () => void,
): void {
  const fd = openSync(path, 'wx', 0o600);
  try {
    writeSync(fd, bytes, undefined, 'utf8');
    afterWrite?.();
    fsyncSync(fd);
    afterFsync?.();
  } finally {
    closeSync(fd);
  }
}

function fsyncDirectory(path: string): void {
  const fd = openSync(path, 'r');
  try {
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

function mkdirPrivateChain(root: string, target: string): void {
  assertConfined(root, target);
  const rel = relative(root, target);
  let cursor = root;
  for (const segment of rel.split(sep).filter(Boolean)) {
    cursor = join(cursor, segment);
    if (existsSync(cursor)) {
      if (lstatSync(cursor).isSymbolicLink() || !statSync(cursor).isDirectory()) {
        throw new Error(`unsafe staging directory ${cursor}`);
      }
    } else {
      mkdirSync(cursor, { mode: 0o700 });
    }
  }
}

function processIsAlive(pid: number): boolean {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

function acquireLock(parent: string, token: string, now: number): string {
  const lockRoot = join(parent, LOCK_NAME);
  const attempt = (): boolean => {
    try {
      mkdirSync(lockRoot, { mode: 0o700 });
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      return false;
    }
  };
  if (!attempt()) {
    assertExistingPathHasNoSymlink(parent, lockRoot);
    const ownerPath = join(lockRoot, 'owner.json');
    const owner = parseObject(readFileSync(ownerPath, 'utf8'), 'packet publication lock owner');
    const pid = Number(owner.pid);
    const expired = Number(owner.lease_expires_at_ms) < now;
    if (!expired || processIsAlive(pid)) {
      throw new Error('packet publication lock is held by a live or unexpired owner');
    }
    const staleToken = String(owner.token ?? '');
    if (!/^[A-Za-z0-9-]{1,128}$/.test(staleToken)) {
      throw new Error('stale packet publication lock has an invalid owner token');
    }
    rmSync(lockRoot, { recursive: true });
    const staleStage = join(parent, `${STAGE_PREFIX}${staleToken}`);
    assertConfined(parent, staleStage);
    if (existsSync(staleStage)) {
      assertExistingPathHasNoSymlink(parent, staleStage);
      rmSync(staleStage, { recursive: true });
    }
    if (!attempt()) throw new Error('packet publication lock recovery lost a concurrent race');
  }
  writeExclusive(
    join(lockRoot, 'owner.json'),
    `${canonicalJson({
      token,
      pid: process.pid,
      lease_expires_at_ms: now + 5 * 60_000,
    })}\n`,
  );
  fsyncDirectory(lockRoot);
  fsyncDirectory(parent);
  return lockRoot;
}

function releaseOwnedLock(lockRoot: string, token: string): void {
  if (!existsSync(lockRoot)) return;
  const owner = parseObject(
    readFileSync(join(lockRoot, 'owner.json'), 'utf8'),
    'packet publication lock owner',
  );
  if (owner.token !== token)
    throw new Error('refusing to release a packet lock owned by another token');
  const parent = dirname(lockRoot);
  rmSync(lockRoot, { recursive: true });
  fsyncDirectory(parent);
}

function validateBatch(
  batch: PacketPublicationBatch,
  authority: PacketPublicationAuthority,
): { readonly packets: readonly ValidatedPacket[]; readonly aggregateSha256: string } {
  if (batch.readyCount !== PACKET_COUNT || batch.blockedCount !== 0) {
    throw new Error(
      `packet publication requires exactly ${PACKET_COUNT} READY and 0 BLOCKED; received ${batch.readyCount}/${batch.blockedCount}`,
    );
  }
  const expectedIds = [...authority.expectedLessonIds];
  if (expectedIds.length !== PACKET_COUNT || new Set(expectedIds).size !== PACKET_COUNT) {
    throw new Error('packet publication authority must identify exactly 111 unique lessons');
  }
  const expectedPaths = new Set(expectedIds.map(expectedPath));
  const entries = Object.entries(batch.files);
  const artifacts = batch.artifacts;
  if (
    artifacts === undefined ||
    Object.keys(artifacts).length !== PACKET_COUNT ||
    [...expectedPaths].some((path) => artifacts[path] === undefined)
  ) {
    throw new Error('packet batch must provide exact file/content hashes for all 111 paths');
  }
  if (
    entries.length !== PACKET_COUNT ||
    entries.some(([path]) => !expectedPaths.has(path)) ||
    [...expectedPaths].some((path) => !(path in batch.files))
  ) {
    throw new Error('packet batch paths do not equal the exact expected 111-path set');
  }
  const collisions = new Set<string>();
  const packets = entries.map(([relativePath, bytes]) => {
    assertSafeRelativePath(relativePath);
    const collisionKey = canonicalCollisionKey(relativePath);
    if (collisions.has(collisionKey))
      throw new Error(`duplicate/case/NFC packet path ${relativePath}`);
    collisions.add(collisionKey);
    const packet = parseObject(bytes, relativePath);
    assertNoProtectedKeys(packet);
    const lessonId = String(packet.lesson_id ?? '');
    const laneId = String(packet.lane_id ?? '');
    const teamId = String(packet.team_id ?? '');
    const assignmentId = String(packet.assignment_id ?? '');
    const allocation = authority.allocations[lessonId];
    if (
      relativePath !== expectedPath(lessonId) ||
      allocation === undefined ||
      allocation.laneId !== laneId ||
      allocation.teamId !== teamId ||
      allocation.assignmentId !== assignmentId
    ) {
      throw new Error(`packet path/lesson/allocation identity mismatch at ${relativePath}`);
    }
    if (packet.packet_status !== 'READY' || packet.packet_surface !== 'AUTHORABLE') {
      throw new Error(`${relativePath} is not a READY AUTHORABLE packet`);
    }
    const output = isObject(packet.output_requirements) ? packet.output_requirements : {};
    if (output.authorable_packet_path !== relativePath) {
      throw new Error(`${relativePath} does not bind its canonical authorable path`);
    }
    const locator = `${laneId}/${lessonId.toLowerCase()}` as `${string}/${string}`;
    const admission = authority.admit({ bytes, locator });
    if (
      admission.admission !== 'ADMITTED' ||
      admission.semantic_validation.validator !== 'PACKET_SEMANTICS_V1' ||
      admission.semantic_validation.status !== 'PASS' ||
      admission.semantic_validation.error_count !== 0
    ) {
      throw new Error(`canonical admission rejected ${relativePath}`);
    }
    const fileSha256 = sha256(bytes);
    const contentSha256 = sha256(canonicalJson(packet));
    const expectedArtifact = artifacts[relativePath]!;
    if (
      expectedArtifact.fileSha256 !== fileSha256 ||
      expectedArtifact.contentSha256 !== contentSha256
    ) {
      throw new Error(`packet file/content hash mismatch at ${relativePath}`);
    }
    return {
      lessonId,
      relativePath,
      bytes,
      fileSha256,
      contentSha256,
      laneId,
      teamId,
      assignmentId,
    };
  });
  const aggregateSha256 = sha256(canonicalJson(batch.files));
  if (aggregateSha256 !== batch.outputSetSha256) {
    throw new Error(
      `packet aggregate drift: batch declares ${batch.outputSetSha256}, recomputed ${aggregateSha256}`,
    );
  }
  return {
    packets: packets.sort((left, right) => left.relativePath.localeCompare(right.relativePath)),
    aggregateSha256,
  };
}

function buildManifest(
  packets: readonly ValidatedPacket[],
  aggregateSha256: string,
  authority: PacketPublicationAuthority,
): PacketSetManifest {
  const closure = authority.pins.sourceAuthorityClosure;
  return {
    contract_id: 'lesson-factory.packet-set-manifest',
    contract_version: '1.0.0',
    packet_count: PACKET_COUNT,
    aggregate_sha256: aggregateSha256,
    allocation_proof_file_sha256: authority.pins.allocationProofFileSha256,
    deadline_profile_file_sha256: authority.pins.deadlineProfileFileSha256,
    task_packet_schema_file_sha256: authority.pins.taskPacketSchemaFileSha256,
    source_use_receipt_file_sha256: authority.pins.sourceUseReceiptFileSha256,
    source_commit_sha: closure.sourceCommitSha,
    source_authority_closure: {
      digest_sha256: closure.digestSha256,
      files: closure.files.map((file) => ({
        path: file.path,
        blob_sha: file.blobSha,
        category: file.category,
        reason: file.reason,
        ...(file.outputBinding === undefined
          ? {}
          : {
              output_binding: {
                path: file.outputBinding.path,
                contract_id: file.outputBinding.contractId,
                contract_version: file.outputBinding.contractVersion,
                allocation_content_sha256: file.outputBinding.allocationContentSha256,
                generation_lesson_count: file.outputBinding.generationLessonCount,
                capacities: file.outputBinding.capacities,
              },
            }),
      })),
    },
    packets: packets.map((packet) => ({
      lesson_id: packet.lessonId,
      path: packet.relativePath,
      assignment_id: packet.assignmentId,
      lane_id: packet.laneId,
      team_id: packet.teamId,
      file_sha256: packet.fileSha256,
      content_sha256: packet.contentSha256,
    })),
  };
}

function listFilesStrict(root: string): string[] {
  const files: string[] = [];
  const visit = (directory: string): void => {
    assertExistingPathHasNoSymlink(root, directory);
    for (const entry of readdirSync(directory).sort()) {
      const path = join(directory, entry);
      const stat = lstatSync(path);
      if (stat.isSymbolicLink()) throw new Error(`published packet set contains symlink ${path}`);
      if (stat.isDirectory()) visit(path);
      else if (stat.isFile()) files.push(relative(root, path).split(sep).join('/'));
      else throw new Error(`published packet set contains unrecognized entry ${path}`);
    }
  };
  visit(root);
  return files;
}

function validateExistingPublication(
  destination: string,
  batch: PacketPublicationBatch,
  authority: PacketPublicationAuthority,
  expectedManifestBytes: string,
): void {
  if (lstatSync(destination).isSymbolicLink() || !statSync(destination).isDirectory()) {
    throw new Error('existing packet destination is not a confined directory');
  }
  const expectedFiles = new Set([
    MANIFEST_NAME,
    ...Object.keys(batch.files).map((path) => path.slice(`${PACKET_ROOT}/`.length)),
  ]);
  const actualFiles = listFilesStrict(destination);
  if (
    actualFiles.length !== expectedFiles.size ||
    actualFiles.some((path) => !expectedFiles.has(path))
  ) {
    throw new Error('existing packet destination is partial or contains unrecognized files');
  }
  const manifestBytes = readFileSync(join(destination, MANIFEST_NAME), 'utf8');
  if (manifestBytes !== expectedManifestBytes)
    throw new Error('existing packet set manifest mismatch');
  for (const [relativePath, bytes] of Object.entries(batch.files)) {
    const local = relativePath.slice(`${PACKET_ROOT}/`.length);
    const diskBytes = readFileSync(join(destination, local), 'utf8');
    if (diskBytes !== bytes) throw new Error(`existing packet bytes mismatch at ${relativePath}`);
  }
  validateBatch(batch, authority);
}

function summary(
  status: PacketPublicationSummary['status'],
  batch: PacketPublicationBatch,
  manifestBytes: string,
): PacketPublicationSummary {
  return {
    status,
    readyCount: batch.readyCount,
    blockedCount: batch.blockedCount,
    fileCount: Object.keys(batch.files).length,
    aggregateSha256: batch.outputSetSha256,
    manifestFileSha256: sha256(manifestBytes),
    destination: PACKET_ROOT,
  };
}

export function publishPacketBatchForTesting(input: {
  readonly repositoryRoot: string;
  readonly batch: PacketPublicationBatch;
  readonly authority: PacketPublicationAuthority;
  readonly publish: boolean;
  readonly fault?: (point: PacketWriterFaultPoint) => void;
  readonly now?: () => number;
  readonly ownerToken?: string;
}): PacketPublicationSummary {
  const repositoryRoot = realpathSync(input.repositoryRoot);
  const parent = join(repositoryRoot, 'content/lesson-factory');
  const destination = join(repositoryRoot, PACKET_ROOT);
  assertExistingPathHasNoSymlink(repositoryRoot, parent);
  const validated = validateBatch(input.batch, input.authority);
  const manifest = buildManifest(validated.packets, validated.aggregateSha256, input.authority);
  const manifestBytes = `${canonicalJson(manifest)}\n`;
  if (!input.publish) return summary('PREFLIGHT_OK', input.batch, manifestBytes);
  const token = input.ownerToken ?? randomUUID();
  const now = input.now?.() ?? Date.now();
  let lockRoot: string | null = null;
  let stageRoot: string | null = null;
  let renamed = false;
  try {
    lockRoot = acquireLock(parent, token, now);
    input.fault?.('LOCK_ACQUIRED');
    if (existsSync(destination)) {
      validateExistingPublication(destination, input.batch, input.authority, manifestBytes);
      return summary('ALREADY_PUBLISHED', input.batch, manifestBytes);
    }
    stageRoot = join(parent, `${STAGE_PREFIX}${token}`);
    mkdirSync(stageRoot, { mode: 0o700 });
    if (statSync(parent).dev !== statSync(stageRoot).dev) {
      throw new Error('packet staging and destination parent are not on the same filesystem');
    }
    input.fault?.('STAGE_CREATED');
    for (const packet of validated.packets) {
      const local = packet.relativePath.slice(`${PACKET_ROOT}/`.length);
      const path = join(stageRoot, local);
      assertConfined(stageRoot, path);
      mkdirPrivateChain(stageRoot, dirname(path));
      writeExclusive(
        path,
        packet.bytes,
        () => input.fault?.('FILE_WRITTEN'),
        () => input.fault?.('FILE_FSYNCED'),
      );
      const readback = readFileSync(path, 'utf8');
      if (sha256(readback) !== packet.fileSha256) {
        throw new Error(`packet staging readback hash mismatch at ${packet.relativePath}`);
      }
      const admission = input.authority.admit({
        bytes: readback,
        locator: `${packet.laneId}/${packet.lessonId.toLowerCase()}`,
      });
      if (
        admission.admission !== 'ADMITTED' ||
        admission.semantic_validation.status !== 'PASS' ||
        admission.semantic_validation.error_count !== 0
      ) {
        throw new Error(`packet staging readback admission failed at ${packet.relativePath}`);
      }
      input.fault?.('READBACK_VALIDATED');
    }
    writeExclusive(join(stageRoot, MANIFEST_NAME), manifestBytes);
    input.fault?.('MANIFEST_WRITTEN');
    const manifestReadback = readFileSync(join(stageRoot, MANIFEST_NAME), 'utf8');
    if (sha256(manifestReadback) !== sha256(manifestBytes)) {
      throw new Error('packet set manifest readback hash mismatch');
    }
    for (const entry of readdirSync(stageRoot)) {
      const child = join(stageRoot, entry);
      if (lstatSync(child).isDirectory()) fsyncDirectory(child);
    }
    fsyncDirectory(stageRoot);
    input.fault?.('STAGE_FSYNCED');
    input.fault?.('BEFORE_RENAME');
    renameSync(stageRoot, destination);
    renamed = true;
    stageRoot = null;
    fsyncDirectory(parent);
    input.fault?.('AFTER_RENAME');
    return summary('PUBLISHED', input.batch, manifestBytes);
  } finally {
    if (!renamed && stageRoot !== null && existsSync(stageRoot)) {
      rmSync(stageRoot, { recursive: true });
      fsyncDirectory(parent);
    }
    if (lockRoot !== null) releaseOwnedLock(lockRoot, token);
  }
}

function fileAndContentHashes(text: string): { fileSha256: string; contentSha256: string } {
  let canonical = text;
  try {
    canonical = canonicalJson(JSON.parse(text));
  } catch {
    // Non-JSON authorities, including the rubric, use exact UTF-8 bytes for both pins.
  }
  return { fileSha256: sha256(text), contentSha256: sha256(canonical) };
}

function sourceTreeRefusal(): never {
  throw new PacketPublicationRefusal(
    'SOURCE_TREE_NOT_COMMITTED',
    'packet source authority files are not an exact committed HEAD closure',
  );
}

const PACKET_CLI_DISPATCHER_PATH = 'tools/content-cli/src/entry.ts';
const PACKET_CLI_ENTRY_PATH = 'tools/content-cli/src/packet-main.ts';

function staticModuleSpecifiers(source: string): string[] {
  const specifiers: string[] = [];
  const pattern =
    /(?:^|\n)\s*(?:import\s+(?!type\b)[\s\S]*?(?:\sfrom\s+)?|export\s+(?!type\b)(?:\*|{)[\s\S]*?\sfrom\s+)['"]([^'"]+)['"]\s*;?/g;
  for (const match of source.matchAll(pattern)) {
    if (match[1] !== undefined) specifiers.push(match[1]);
  }
  return specifiers;
}

function resolveRuntimeModule(
  repositoryRoot: string,
  importingPath: string,
  specifier: string,
): string | null {
  const packageModules: Readonly<Record<string, string>> = {
    '@mcat/content/lesson-factory/admission':
      'packages/content/src/lesson-factory/admission/index.ts',
    '@mcat/content/lesson-factory/packets': 'packages/content/src/lesson-factory/packets.ts',
  };
  const packageModule = packageModules[specifier];
  if (packageModule !== undefined) return packageModule;
  if (!specifier.startsWith('.')) return null;

  const importingAbsolute = join(repositoryRoot, importingPath);
  const base = resolve(dirname(importingAbsolute), specifier);
  const candidates = specifier.endsWith('.ts')
    ? [base]
    : specifier.endsWith('.js')
      ? [`${base.slice(0, -3)}.ts`]
      : [`${base}.ts`, join(base, 'index.ts')];
  const resolved = candidates.find((candidate) => existsSync(candidate));
  if (resolved === undefined) sourceTreeRefusal();
  const relativePath = relative(repositoryRoot, resolved).split(sep).join('/');
  if (relativePath.startsWith('../') || isAbsolute(relativePath)) sourceTreeRefusal();
  return relativePath;
}

export function collectPacketRuntimeModulesForTesting(input: {
  readonly repositoryRoot: string;
  readonly entryPath?: string;
}): string[] {
  const repositoryRoot = realpathSync(input.repositoryRoot);
  const pending =
    input.entryPath === undefined
      ? [PACKET_CLI_DISPATCHER_PATH, PACKET_CLI_ENTRY_PATH]
      : [input.entryPath];
  const visited = new Set<string>();
  while (pending.length > 0) {
    const modulePath = pending.pop()!;
    if (visited.has(modulePath)) continue;
    const absolute = join(repositoryRoot, modulePath);
    if (!existsSync(absolute)) sourceTreeRefusal();
    visited.add(modulePath);
    for (const specifier of staticModuleSpecifiers(readFileSync(absolute, 'utf8'))) {
      const dependency = resolveRuntimeModule(repositoryRoot, modulePath, specifier);
      if (dependency !== null && !visited.has(dependency)) pending.push(dependency);
    }
  }
  return [...visited].sort();
}

export function verifyPacketRuntimeAuthorityGraphForTesting(input: {
  readonly repositoryRoot: string;
  readonly entryPath?: string;
}): string[] {
  const categoryUnion = [
    ...PACKET_RUNTIME_TYPESCRIPT_AUTHORITY_PATHS,
    ...PACKET_PROOF_PRODUCER_AUTHORITIES.map((producer) => producer.path),
    ...PACKET_DATA_AUTHORITY_PATHS,
  ].sort();
  if (
    new Set(categoryUnion).size !== categoryUnion.length ||
    canonicalJson(categoryUnion) !== canonicalJson(PACKET_SOURCE_AUTHORITY_PATHS) ||
    PACKET_RUNTIME_TYPESCRIPT_AUTHORITY_PATHS.some((path) => !path.endsWith('.ts')) ||
    PACKET_PROOF_PRODUCER_AUTHORITIES.some((producer) => !producer.path.endsWith('.ts')) ||
    PACKET_DATA_AUTHORITY_PATHS.some((path) => path.endsWith('.ts'))
  ) {
    sourceTreeRefusal();
  }
  const modules = collectPacketRuntimeModulesForTesting(input);
  if (
    modules.some(
      (path) =>
        !PACKET_SOURCE_AUTHORITY_PATHS.includes(path) ||
        /\/kit-(?:factory|production)\.ts$/.test(path),
    )
  ) {
    sourceTreeRefusal();
  }
  if (canonicalJson(modules) !== canonicalJson(PACKET_RUNTIME_TYPESCRIPT_AUTHORITY_PATHS)) {
    sourceTreeRefusal();
  }
  return modules;
}

function verifyProofProducerOutputBinding(repositoryRoot: string): PacketProofOutputBinding {
  const producer = PACKET_PROOF_PRODUCER_AUTHORITIES[0]!;
  let proof: JsonObject;
  try {
    proof = parseObject(
      readFileSync(join(repositoryRoot, producer.outputBinding.path), 'utf8'),
      'assignment partition proof',
    );
  } catch {
    return sourceTreeRefusal();
  }
  const scope = proof.authoring_scope;
  const capacities = proof.capacities;
  const assignments = proof.assignments;
  if (
    proof.contract_id !== producer.outputBinding.contractId ||
    proof.contract_version !== producer.outputBinding.contractVersion ||
    !isObject(scope) ||
    scope.generation_lesson_count !== producer.outputBinding.generationLessonCount ||
    !isObject(capacities) ||
    capacities.primary !== producer.outputBinding.capacities.primary ||
    capacities['team-A'] !== producer.outputBinding.capacities['team-A'] ||
    capacities['team-B'] !== producer.outputBinding.capacities['team-B'] ||
    !Array.isArray(assignments)
  ) {
    sourceTreeRefusal();
  }
  const expectedTeams = Object.entries(producer.outputBinding.capacities);
  if (
    assignments.length !== expectedTeams.length ||
    assignments.some((assignment, index) => {
      if (!isObject(assignment)) return true;
      const [teamId, capacity] = expectedTeams[index]!;
      return (
        assignment.team_id !== teamId ||
        assignment.count !== capacity ||
        !Array.isArray(assignment.rows) ||
        assignment.rows.length !== capacity
      );
    })
  ) {
    sourceTreeRefusal();
  }
  const allocationContentSha256 = sha256(canonicalJson(assignments));
  if (proof[producer.outputBinding.allocationHashField] !== allocationContentSha256) {
    sourceTreeRefusal();
  }
  return {
    path: producer.outputBinding.path,
    contractId: producer.outputBinding.contractId,
    contractVersion: producer.outputBinding.contractVersion,
    allocationContentSha256,
    generationLessonCount: producer.outputBinding.generationLessonCount,
    capacities: producer.outputBinding.capacities,
  };
}

function gitOutput(repositoryRoot: string, args: readonly string[], input?: string): string {
  const result = spawnSync('git', ['-C', repositoryRoot, ...args], {
    encoding: 'utf8',
    env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' },
    maxBuffer: 4 * 1024 * 1024,
    input,
  });
  if (result.status !== 0 || result.signal !== null) sourceTreeRefusal();
  return result.stdout.trim();
}

function resolveGitCommit(repositoryRoot: string): string {
  const gitPath = join(repositoryRoot, '.git');
  const gitRoot = lstatSync(gitPath).isFile()
    ? resolve(
        repositoryRoot,
        readFileSync(gitPath, 'utf8')
          .trim()
          .replace(/^gitdir:\s*/, ''),
      )
    : gitPath;
  const head = readFileSync(join(gitRoot, 'HEAD'), 'utf8').trim();
  if (/^[0-9a-f]{40}$/.test(head)) return head;
  if (!head.startsWith('ref: ')) throw new Error('cannot resolve repository commit pin');
  const ref = head.slice(5);
  const loose = join(gitRoot, ref);
  if (existsSync(loose)) return readFileSync(loose, 'utf8').trim();
  const packed = readFileSync(join(gitRoot, 'packed-refs'), 'utf8')
    .split('\n')
    .find((line) => line.endsWith(` ${ref}`))
    ?.split(' ')[0];
  if (packed === undefined) throw new Error(`cannot resolve repository commit ref ${ref}`);
  return packed;
}

export function verifyPacketSourceTreeForTesting(input: {
  readonly repositoryRoot: string;
}): PacketSourceAuthorityClosure {
  const repositoryRoot = realpathSync(input.repositoryRoot);
  verifyPacketRuntimeAuthorityGraphForTesting({ repositoryRoot });
  let topLevel: string;
  let sourceCommitSha: string;
  try {
    topLevel = realpathSync(gitOutput(repositoryRoot, ['rev-parse', '--show-toplevel']));
    sourceCommitSha = gitOutput(repositoryRoot, ['rev-parse', '--verify', 'HEAD^{commit}']);
  } catch (error) {
    if (error instanceof PacketPublicationRefusal) throw error;
    return sourceTreeRefusal();
  }
  if (
    topLevel !== repositoryRoot ||
    !/^[0-9a-f]{40,64}$/.test(sourceCommitSha) ||
    resolveGitCommit(repositoryRoot) !== sourceCommitSha
  ) {
    sourceTreeRefusal();
  }

  const paths = [...PACKET_SOURCE_AUTHORITY_PATHS];
  const status = gitOutput(repositoryRoot, [
    'status',
    '--porcelain=v1',
    '--untracked-files=all',
    '--',
    ...paths,
  ]);
  if (status !== '') sourceTreeRefusal();
  const trackedFlags = new Map(
    gitOutput(repositoryRoot, ['ls-files', '-v', '--', ...paths])
      .split('\n')
      .filter(Boolean)
      .map((line) => [line.slice(2), line.slice(0, 1)]),
  );
  const indexRows = new Map(
    gitOutput(repositoryRoot, ['ls-files', '--stage', '--', ...paths])
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const match = /^([0-9]{6}) ([0-9a-f]{40,64}) 0\t(.+)$/.exec(line);
        if (match === null) sourceTreeRefusal();
        return [match[3]!, match[2]!] as const;
      }),
  );
  const treeRows = new Map(
    gitOutput(repositoryRoot, ['ls-tree', '-r', 'HEAD', '--', ...paths])
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const match = /^([0-9]{6}) blob ([0-9a-f]{40,64})\t(.+)$/.exec(line);
        if (match === null) sourceTreeRefusal();
        return [match[3]!, match[2]!] as const;
      }),
  );
  const workingRows = gitOutput(
    repositoryRoot,
    ['hash-object', '--no-filters', '--stdin-paths'],
    `${paths.join('\n')}\n`,
  ).split('\n');
  if (
    trackedFlags.size !== paths.length ||
    indexRows.size !== paths.length ||
    treeRows.size !== paths.length ||
    workingRows.length !== paths.length
  ) {
    sourceTreeRefusal();
  }

  const proofOutputBinding = verifyProofProducerOutputBinding(repositoryRoot);
  const files = paths.map((path, index) => {
    const workingBlobSha = workingRows[index];
    const treeBlobSha = treeRows.get(path);
    if (
      treeBlobSha === undefined ||
      trackedFlags.get(path) !== 'H' ||
      workingBlobSha !== treeBlobSha ||
      indexRows.get(path) !== treeBlobSha ||
      !existsSync(join(repositoryRoot, path))
    ) {
      sourceTreeRefusal();
    }
    if (PACKET_RUNTIME_TYPESCRIPT_AUTHORITY_PATHS.includes(path)) {
      return {
        path,
        blobSha: treeBlobSha,
        category: 'RUNTIME_TYPESCRIPT_MODULE' as const,
        reason: 'EVALUATED_BY_PACKET_CLI_RUNTIME' as const,
      };
    }
    if (PACKET_PROOF_PRODUCER_AUTHORITIES.some((producer) => producer.path === path)) {
      return {
        path,
        blobSha: treeBlobSha,
        category: 'NON_RUNTIME_PROOF_PRODUCER' as const,
        reason: 'PRODUCES_WP02_ASSIGNMENT_PARTITION_PROOF' as const,
        outputBinding: proofOutputBinding,
      };
    }
    if (PACKET_DATA_AUTHORITY_PATHS.includes(path)) {
      return {
        path,
        blobSha: treeBlobSha,
        category: 'DATA_SCHEMA_PROFILE_PROOF_BUILD' as const,
        reason: 'PACKET_DATA_SCHEMA_PROFILE_PROOF_BUILD_AUTHORITY' as const,
      };
    }
    return sourceTreeRefusal();
  });

  const finalHead = gitOutput(repositoryRoot, ['rev-parse', '--verify', 'HEAD^{commit}']);
  if (finalHead !== sourceCommitSha || resolveGitCommit(repositoryRoot) !== sourceCommitSha) {
    sourceTreeRefusal();
  }
  return {
    sourceCommitSha,
    files,
    digestSha256: sha256(canonicalJson({ source_commit_sha: sourceCommitSha, files })),
  };
}

function productionInput(repositoryRoot: string): {
  readonly batch: PacketPublicationBatch;
  readonly authority: PacketPublicationAuthority;
} {
  const sourceAuthorityClosure = verifyPacketSourceTreeForTesting({ repositoryRoot });
  const research = resolvePacketResearchPaths({
    repositoryRoot,
    ...(process.env.MCAT_RESEARCH_DIR === undefined
      ? {}
      : { envResearchDir: process.env.MCAT_RESEARCH_DIR }),
  });
  const paths = {
    assignmentProof: 'content/lesson-factory/assignments/partition-proof.json',
    ownerSourceUseReceipt: 'content/lesson-factory/deadline-profile/owner-source-use-receipt.json',
    curriculumManifest: 'curriculum/v3/v3-lesson-authoring-manifest.json',
    sourceCrosswalk: relative(repositoryRoot, research.sourceCrosswalkPath).split(sep).join('/'),
    researchRegistry: relative(repositoryRoot, research.researchRegistryPath).split(sep).join('/'),
    taskPacketSchema: 'content/lesson-factory/schemas/task-source-packet.schema.json',
    sharedVocabularySchema: 'content/lesson-factory/schemas/shared-vocabulary.schema.json',
    deadlineProfile: 'content/lesson-factory/deadline-profile/deadline-profile.json',
    releasePolicy: 'content/lesson-factory/deadline-profile/release-policy.json',
    rubric: 'key-docs/lesson-quality-rubric.md',
  } as const;
  const texts = {
    allocationProofText: readFileSync(join(repositoryRoot, paths.assignmentProof), 'utf8'),
    ownerSourceUseReceiptText: readFileSync(
      join(repositoryRoot, paths.ownerSourceUseReceipt),
      'utf8',
    ),
    curriculumManifestText: readFileSync(join(repositoryRoot, paths.curriculumManifest), 'utf8'),
    sourceCrosswalkText: readFileSync(research.sourceCrosswalkPath, 'utf8'),
    researchRegistryText: readFileSync(research.researchRegistryPath, 'utf8'),
    taskPacketSchemaText: readFileSync(join(repositoryRoot, paths.taskPacketSchema), 'utf8'),
    sharedVocabularySchemaText: readFileSync(
      join(repositoryRoot, paths.sharedVocabularySchema),
      'utf8',
    ),
    deadlineProfileText: readFileSync(join(repositoryRoot, paths.deadlineProfile), 'utf8'),
    releasePolicyText: readFileSync(join(repositoryRoot, paths.releasePolicy), 'utf8'),
    rubricText: readFileSync(join(repositoryRoot, paths.rubric), 'utf8'),
  };
  const textKeys = {
    assignmentProof: 'allocationProofText',
    ownerSourceUseReceipt: 'ownerSourceUseReceiptText',
    curriculumManifest: 'curriculumManifestText',
    sourceCrosswalk: 'sourceCrosswalkText',
    researchRegistry: 'researchRegistryText',
    taskPacketSchema: 'taskPacketSchemaText',
    sharedVocabularySchema: 'sharedVocabularySchemaText',
    deadlineProfile: 'deadlineProfileText',
    releasePolicy: 'releasePolicyText',
    rubric: 'rubricText',
  } as const;
  const expectedHashes = Object.fromEntries(
    Object.entries(textKeys).map(([key, textKey]) => [
      key,
      fileAndContentHashes(texts[textKey as keyof typeof texts]),
    ]),
  ) as PacketGeneratorSources['expectedHashes'];
  const sources: PacketGeneratorSources = { ...texts, paths, expectedHashes };
  const proof = parseObject(texts.allocationProofText, 'allocation proof');
  const allocations: Record<string, { assignmentId: string; laneId: string; teamId: string }> = {};
  for (const assignment of Array.isArray(proof.assignments) ? proof.assignments : []) {
    if (!isObject(assignment)) continue;
    for (const row of Array.isArray(assignment.rows) ? assignment.rows : []) {
      if (!isObject(row)) continue;
      allocations[String(row.lesson_id)] = {
        assignmentId: String(row.assignment_id),
        laneId: String(row.lane_id),
        teamId: String(row.team_id),
      };
    }
  }
  const expectedLessonIds = Object.keys(allocations);
  const generated = createTaskSourcePackets({
    sources,
    requests: expectedLessonIds.map((lessonId) => ({
      lessonId,
      requestId: 'lesson-factory-deadline-2026-08-03-request-01',
    })),
  });
  const artifacts = Object.fromEntries(
    generated.results.map((result) => [
      result.outputPath,
      {
        fileSha256: String(result.packetFileSha256),
        contentSha256: String(result.packetContentSha256),
      },
    ]),
  );
  return {
    batch: {
      readyCount: generated.readyCount,
      blockedCount: generated.blockedCount,
      files: generated.files,
      outputSetSha256: generated.outputSetSha256,
      artifacts,
    },
    authority: {
      expectedLessonIds,
      allocations,
      pins: {
        allocationProofFileSha256: expectedHashes.assignmentProof.fileSha256,
        deadlineProfileFileSha256: expectedHashes.deadlineProfile.fileSha256,
        taskPacketSchemaFileSha256: expectedHashes.taskPacketSchema.fileSha256,
        sourceUseReceiptFileSha256: expectedHashes.ownerSourceUseReceipt.fileSha256,
        sourceAuthorityClosure,
      },
      admit: admitTaskSourcePacketV5,
    },
  };
}

function runProductionPacketPublication(input: {
  readonly repositoryRoot: string;
  readonly publish: boolean;
}): PacketPublicationSummary {
  const production = productionInput(realpathSync(input.repositoryRoot));
  const recomputed = sha256(canonicalJson(production.batch.files));
  if (recomputed !== production.batch.outputSetSha256 || recomputed !== REVIEWED_AGGREGATE_SHA256) {
    throw new Error(
      `reviewed packet aggregate mismatch: recomputed ${recomputed}, expected ${REVIEWED_AGGREGATE_SHA256}`,
    );
  }
  return publishPacketBatchForTesting({
    repositoryRoot: input.repositoryRoot,
    ...production,
    publish: input.publish,
  });
}

export function preflightProductionPacketPublication(input: {
  readonly repositoryRoot: string;
}): PacketPublicationSummary {
  return runProductionPacketPublication({ ...input, publish: false });
}

export function publishProductionPacketPublication(input: {
  readonly repositoryRoot: string;
}): PacketPublicationSummary {
  return runProductionPacketPublication({ ...input, publish: true });
}
