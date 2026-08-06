import { execFileSync, spawnSync } from 'node:child_process';
import { createHash, createHmac, timingSafeEqual, verify as verifySignature } from 'node:crypto';
import {
  chmodSync,
  closeSync,
  constants as fsConstants,
  fchmodSync,
  existsSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  opendirSync,
  readFileSync,
  readlinkSync,
  readSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  writeSync,
  writeFileSync,
} from 'node:fs';
import { copyFile as nodeCopyFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { inflateRawSync } from 'node:zlib';

import { compileCanonicalLesson } from '../lesson-normalization';
import {
  buildResolvableIds,
  computeQuality,
  planLessonRehash,
  validateLesson,
  type LessonValidationInput,
  type RehashFile,
} from '../lesson-validator';
import {
  ACCEPTANCE_RELATIVE_ROOT,
  MAX_ACCEPTANCE_AGGREGATE_BYTES,
  MAX_ACCEPTANCE_CHAIN_DEPTH,
  MAX_ACCEPTANCE_MARKERS,
  acceptanceObjectRelativePath,
  createAcceptanceMarker,
  inspectAcceptanceMarker,
  openAcceptanceStore,
  readImmutableObject,
  writeImmutableObject,
  type AcceptanceMarkerIdentity,
  type AcceptanceObjectIdentity,
  type AcceptancePublicationBoundary,
} from './team-return-acceptance-artifact';
import { deriveKitIdentityAggregate } from './kit-identity-aggregate';

export const TEAM_RETURN_STAGING_RELATIVE_ROOT =
  '.tmp/scratch/lesson-factory-2026-08-03T1727-0500/wp-08/staging';

const ARCHIVE_WORK_RELATIVE_ROOT =
  '.tmp/scratch/lesson-factory-2026-08-03T1727-0500/wp-08/archive-work';
const MAX_ARCHIVE_BYTES = 16 * 1024 * 1024;
const MAX_ATTESTATION_BYTES = 64 * 1024;
const MAX_ARCHIVE_ENTRIES = 1024;
const MAX_CHECKOUT_SNAPSHOT_ENTRIES = 1024;
const MAX_CHECKOUT_SNAPSHOT_PATH_BYTES = 128 * 1024;
const MAX_CHECKOUT_SNAPSHOT_SINGLE_PATH_BYTES = 1024;
const MAX_ARCHIVE_ENTRY_COMPRESSED_BYTES = 8 * 1024 * 1024;
const MAX_ARCHIVE_ENTRY_EXPANDED_BYTES = 16 * 1024 * 1024;
const MAX_ARCHIVE_TOTAL_EXPANDED_BYTES = 128 * 1024 * 1024;
const MAX_ARCHIVE_COMPRESSION_RATIO = 200;
const GIT_EXECUTABLE = '/usr/bin/git';
const TEAM_IDS = ['team-A', 'team-B'] as const;
const LEGACY_GENERATION_THREE_COHORT = Object.freeze({
  finalizationReceiptSha256: '9a4007c9e574e8c82912acf66e6b7ff95ef00c0457f25ae46b7c7982d13fd5c4',
  manifests: Object.freeze({
    'team-A': '70ceb98228bb3642d6fd7416f4f405701a9be1975a138bc7c20ad474cbd01f64',
    'team-B': 'ee139977ebba7a0bd32952200b4366e16c09be2ebe43e6a4f9a48faab7967c3b',
  }),
});
const DIGEST = /^[0-9a-f]{64}$/;
const COMMIT = /^[0-9a-f]{40}$/;
const LESSON_ID = /^V3-LES-[0-9]{6}$/;
const WAVE_NAME = /^WAVE-([0-9]{2})-HANDOFF\.json$/;
const NONCLAIM_KEYS = ['humanApproved', 'officialRubricPass', 'publicationApproved'] as const;
const LESSON_FILES = [
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
] as const;
const HASHED_LESSON_FILES = LESSON_FILES.filter(
  (path) => path !== 'LESSON-HANDOFF.json' && path !== 'artifact-manifest.json',
);
const PRIMARY_FILES = [
  'lesson-script.json',
  'kc-coverage-matrix.json',
  'lesson-presentation-plan.json',
  'lesson-quality-report.json',
] as const;
const HANDOFF_ARTIFACT_FILES = [
  'artifact-manifest.json',
  'candidate-quality-ledger.json',
  'kc-coverage-matrix.json',
  'learner-safe-items.json',
  'lesson-presentation-plan.json',
  'lesson-quality-report.json',
  'lesson-script.json',
  'protected-items.json',
  'source-claim-ledger.json',
] as const;
const PUBLIC_SCAN_FILES = [
  'learner-safe-items.json',
  'source-claim-ledger.json',
  'candidate-quality-ledger.json',
  'validation/lesson-validate.json',
  'validation/computed-quality.json',
  'validation/normalization-smoke.json',
] as const;
const PROTECTED_KEYS = new Set([
  'answerkey',
  'correctanswer',
  'correctchoiceid',
  'correctoptionindex',
  'rationale',
  'scoringrule',
]);

type JsonRecord = Record<string, unknown>;
type TeamId = (typeof TEAM_IDS)[number];
type LessonStatus = 'COMPLETE' | 'BLOCKED' | 'FAILED';

export type TeamReturnIntakeCode =
  | 'ANCESTRY_INVALID'
  | 'ARCHIVE_INVALID'
  | 'ARCHIVE_RESOURCE_LIMIT_EXCEEDED'
  | 'ARCHIVE_SIGNATURE_INVALID'
  | 'ASSIGNMENT_HASH_MISMATCH'
  | 'ASSIGNMENT_INVALID'
  | 'ATOMIC_COPY_FAILED'
  | 'AUTHORITY_CURRENT_INVALID'
  | 'BRANCH_INVALID'
  | 'BRANCH_TEAM_MISMATCH'
  | 'CENTRAL_VALIDATOR_PIN_MISMATCH'
  | 'EVIDENCE_STALE'
  | 'FINALIZATION_RECEIPT_INVALID'
  | 'FINALIZATION_SIGNATURE_INVALID'
  | 'FALSE_COMPLETE'
  | 'HANDOFF_INVALID'
  | 'HONESTY_MISMATCH'
  | 'INTERNAL_INTAKE_ERROR'
  | 'JUDGE_AUTHOR_IDENTITY_COLLISION'
  | 'JUDGE_EVIDENCE_INVALID'
  | 'KIT_AUTHORITY_INVALID'
  | 'KIT_MANIFEST_HASH_MISMATCH'
  | 'LESSON_LAYOUT_INVALID'
  | 'LESSON_NOT_ASSIGNED'
  | 'OFFICIAL_CLAIM_FORBIDDEN'
  | 'PACKET_PIN_MISMATCH'
  | 'PROTECTED_BOUNDARY_LEAK'
  | 'READY_MISMATCH'
  | 'REPOSITORY_DIRTY'
  | 'ROW_DUPLICATE'
  | 'ROW_HANDOFF_HASH_MISMATCH'
  | 'ROW_MISSING'
  | 'ROW_ORDER_INVALID'
  | 'ROW_ROOT_HASH_MISMATCH'
  | 'SEND_ME_MISMATCH'
  | 'SHARED_PATH_CHANGED'
  | 'SOURCE_AMBIGUOUS'
  | 'SOURCE_BYTES_CHANGED'
  | 'SOURCE_SNAPSHOT_INVALID'
  | 'SOURCE_REPOSITORY_DRIFT'
  | 'SOURCE_RESOURCE_LIMIT_EXCEEDED'
  | 'STAGING_MISMATCH'
  | 'SUPERSESSION_AUTHORITY_INVALID'
  | 'SUPERSESSION_NON_MONOTONIC'
  | 'SUPERSESSION_PRIOR_INVALID'
  | 'SUPERSESSION_TRANSACTION_FAILED'
  | 'TEAM_HANDOFF_INVALID'
  | 'TRUSTED_SIGNER_INVALID'
  | 'TRUSTED_SIGNER_MISSING'
  | 'VALIDATION_RECEIPT_INVALID'
  | 'WAVE_HANDOFF_INVALID'
  | 'WAVE_HANDOFF_MISSING';

export interface TeamReturnCheckoutEvidence {
  readonly branch: string;
  readonly changedPaths: readonly string[];
  readonly clean: boolean;
  readonly headCommit: string;
  readonly pinnedAncestor: boolean;
}

export interface CentralMechanicalValidation {
  readonly structural: 'PASS' | 'FAIL';
  readonly computedQuality: 'PASS' | 'FAIL';
  readonly normalization: 'PASS' | 'FAIL';
  readonly protectedBoundary: 'PASS' | 'FAIL';
  readonly validatorEvidenceSha256: string;
}

export interface TeamReturnIntakeDependencies {
  readonly inspectCheckout?: (
    checkoutRoot: string,
    pinnedCommit: string,
  ) => Promise<TeamReturnCheckoutEvidence> | TeamReturnCheckoutEvidence;
  readonly mechanicalValidate?: (
    lessonRoot: string,
    lessonId: string,
    centralRepositoryRoot: string,
  ) => Promise<CentralMechanicalValidation> | CentralMechanicalValidation;
  readonly copyFile?: (source: string, destination: string) => Promise<void>;
  readonly chmodPath?: (path: string, mode: number) => void;
  readonly onBeforeSupersessionPublish?: (destination: string) => void;
  readonly onBeforeAcceptanceObjectValidation?: (
    kind: 'archive' | 'manifest' | 'receipt',
    path: string,
  ) => void;
  readonly onSupersessionBoundary?: (boundary: TeamReturnSupersessionBoundary) => void;
}

export type TeamReturnSource =
  | { readonly kind: 'CHECKOUT'; readonly root: string }
  | {
      readonly kind: 'SIGNED_ARCHIVE';
      readonly archivePath: string;
      readonly attestationPath: string;
    };

export type TeamReturnSupersessionBoundary = AcceptancePublicationBoundary;

export interface TeamReturnSupersessionRequest {
  readonly action: 'SUPERSEDE_FINAL_TEAM';
  readonly expectedPriorSourceBatchSha256: string;
  readonly expectedPriorStagingIdentitySha256: string;
}

export interface TeamReturnIntakeRequest {
  readonly authorityRoot: string;
  readonly centralRepositoryRoot: string;
  readonly mode?: 'DRY_RUN' | 'ACCEPT';
  readonly source: TeamReturnSource;
  readonly supersession?: TeamReturnSupersessionRequest;
}

export interface TeamReturnException {
  readonly code: TeamReturnIntakeCode;
  readonly scope: 'AUTHORITY' | 'SOURCE' | 'WAVE' | 'TEAM' | 'LESSON' | 'COPY';
  readonly subjectSha256: string;
}

export interface TeamReturnIntakeRow {
  readonly code: 'ACCEPTED_COMPLETE' | 'RECORDED_BLOCKED' | 'RECORDED_FAILED';
  readonly lessonHandoffSha256: string;
  readonly lessonId: string;
  readonly rootSha256: string;
  readonly rowSha256: string;
  readonly status: LessonStatus;
}

interface TeamReturnSupersessionSide {
  readonly copyIdentitySha256: string;
  readonly receiptSha256?: string;
  readonly rootSha256: string;
  readonly rowSha256: string;
  readonly sourceIdentitySha256: string;
  readonly sourceBatchSha256: string;
  readonly stagingIdentitySha256: string;
  readonly treeSha256: string;
}

export interface TeamReturnSupersessionBinding {
  readonly action: 'SUPERSEDE_FINAL_TEAM';
  readonly acceptanceMarkerRelativePath: string;
  readonly generationId: string;
  readonly newlyCompleteLessonIds: readonly string[];
  readonly prior: TeamReturnSupersessionSide & { readonly receiptSha256: string };
  readonly replacement: TeamReturnSupersessionSide;
  readonly supersessionId: string;
  readonly unchangedCompleteLessonIds: readonly string[];
}

export interface TeamReturnAcceptanceHandle {
  readonly archiveSha256: string;
  readonly generationId: string;
  readonly manifestSha256: string;
  readonly marker?: AcceptanceMarkerIdentity;
  readonly markerRelativePath: string;
  readonly objects?: {
    readonly archive: AcceptanceObjectIdentity;
    readonly manifest: AcceptanceObjectIdentity;
    readonly receipt: AcceptanceObjectIdentity;
  };
  readonly receiptSha256: string;
  readonly sourceCommit: string;
  readonly sourceTreeSha256: string;
}

export interface TeamReturnIntakeResult {
  readonly format: 'lesson-generation-team-return-intake/1';
  readonly mode: 'DRY_RUN' | 'ACCEPT';
  readonly decision: 'ACCEPTED' | 'REJECTED';
  readonly teamId: TeamId | null;
  readonly assignmentIdSha256: string;
  readonly authority: {
    readonly finalizationReceiptSha256: string;
    readonly generation: number | null;
    readonly kitManifestSha256: string;
    readonly pinnedCommit: string;
    readonly readySha256: string;
    readonly sendMeSha256: string;
  };
  readonly source: {
    readonly branch: string;
    readonly headCommit: string;
    readonly kind: TeamReturnSource['kind'];
    readonly sourceSha256: string;
  };
  readonly scope: {
    readonly id: string;
    readonly kind: 'WAVE' | 'FINAL_TEAM' | 'UNKNOWN';
    readonly rowCount: number;
  };
  readonly rows: readonly TeamReturnIntakeRow[];
  readonly aggregates: {
    readonly rootSha256: string;
    readonly rowSha256: string;
    readonly sourceBatchSha256: string;
  };
  readonly exceptions: readonly TeamReturnException[];
  readonly copy: {
    readonly disposition:
      | 'NOT_REQUESTED'
      | 'STAGED_NEW'
      | 'PRESENT_IDENTICAL'
      | 'SUPERSESSION_READY'
      | 'SUPERSESSION_COMMITTED'
      | 'REFUSED_MISMATCH'
      | 'FAILED'
      | 'VALIDATION_REJECTED';
    readonly stagedCompleteCount: number;
    readonly acceptance?: TeamReturnAcceptanceHandle;
    readonly stagingIdentitySha256: string;
  };
  readonly supersession?: TeamReturnSupersessionBinding;
  readonly receiptSha256: string;
}

interface FinalizationTeam {
  readonly teamId: TeamId;
  readonly archiveSha256: string;
  readonly assignmentSha256: string;
  readonly lessonIds: readonly string[];
  readonly manifestSha256: string;
  readonly packetAggregateSha256: string;
}

interface FinalizationAuthority {
  readonly generation: number;
  readonly pins: JsonRecord & { readonly repositoryCommit: string };
  readonly receipt: JsonRecord;
  readonly receiptSha256: string;
  readonly teams: readonly FinalizationTeam[];
  readonly versionDirectory: string;
}

interface TeamAuthority {
  readonly assignment: JsonRecord;
  readonly assignmentId: string;
  readonly assignmentRows: readonly JsonRecord[];
  readonly kit: JsonRecord;
  readonly kitSha256: string;
  readonly readySha256: string;
  readonly sendMeSha256: string;
  readonly team: FinalizationTeam;
  readonly toolSha256: string;
}

interface MaterializedSource {
  readonly candidateRoot: string;
  readonly checkoutRoot?: string;
  readonly checkoutEvidence: TeamReturnCheckoutEvidence;
  readonly cleanup?: () => void;
  readonly kind: TeamReturnSource['kind'];
  readonly ledger: readonly SourceIdentity[];
  readonly changedPathIdentities: readonly ChangedPathIdentity[];
  readonly teamHint?: TeamId;
}

interface SourceIdentity {
  readonly path: string;
  readonly sha256: string;
  readonly size: number;
}

interface ChangedPathIdentity extends SourceIdentity {
  readonly gitBlobSha1: string;
  readonly gitMode: '100644' | '100755';
}

interface GitTreeFileIdentity extends ChangedPathIdentity {
  readonly gitType: 'blob';
}

interface OfferedRow {
  readonly lessonHandoffSha256: string;
  readonly lessonId: string;
  readonly rootSha256: string;
  readonly status: LessonStatus;
}

function canonical(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (typeof value !== 'object') throw new Error('NON_CANONICAL_JSON');
  return `{${Object.entries(value)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`)
    .join(',')}}`;
}

function digest(bytes: string | Buffer | Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function record(value: unknown): JsonRecord | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function readJson(path: string): JsonRecord | null {
  try {
    return record(JSON.parse(readFileSync(path, 'utf8')));
  } catch {
    return null;
  }
}

function hasExactKeys(value: JsonRecord, keys: readonly string[]): boolean {
  return canonical(Object.keys(value).sort()) === canonical([...keys].sort());
}

function safeRelative(path: unknown): path is string {
  return (
    typeof path === 'string' &&
    path.length > 0 &&
    !isAbsolute(path) &&
    !path.includes('\\') &&
    !path.split('/').includes('..')
  );
}

function canonicalCheckoutSnapshotPaths(paths: readonly string[]): boolean {
  const collisionKeys = new Set<string>();
  for (const path of paths) {
    const segments = path.split('/');
    const collisionKey = path.normalize('NFC').toUpperCase().toLowerCase().normalize('NFC');
    if (
      !safeRelative(path) ||
      path !== path.normalize('NFC') ||
      Buffer.from(path, 'utf8').toString('utf8') !== path ||
      path.startsWith('/') ||
      path.endsWith('/') ||
      /^[A-Za-z]:/.test(path) ||
      Array.from(path).some((character) => {
        const codePoint = character.codePointAt(0) ?? 0;
        return codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f);
      }) ||
      /[<>:"|?*]/.test(path) ||
      segments.some((segment) => {
        const deviceName = (segment.split('.')[0] ?? '').toUpperCase();
        return (
          segment === '' ||
          segment === '.' ||
          segment === '..' ||
          /[. ]$/.test(segment) ||
          /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/.test(deviceName)
        );
      }) ||
      collisionKeys.has(collisionKey)
    ) {
      return false;
    }
    collisionKeys.add(collisionKey);
  }
  return true;
}

function confined(root: string, path: string): string {
  if (!safeRelative(path)) throw new Error('UNSAFE_PATH');
  const base = resolve(root);
  const target = resolve(base, path);
  if (!target.startsWith(`${base}${sep}`)) throw new Error('PATH_ESCAPE');
  return target;
}

function regularFile(path: string): boolean {
  try {
    const info = lstatSync(path);
    return info.isFile() && !info.isSymbolicLink();
  } catch {
    return false;
  }
}

function directory(path: string): boolean {
  try {
    const info = lstatSync(path);
    return info.isDirectory() && !info.isSymbolicLink();
  } catch {
    return false;
  }
}

function lstatExists(path: string): boolean {
  try {
    lstatSync(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

function validNonclaims(value: unknown): boolean {
  const claims = record(value);
  return (
    claims !== null &&
    hasExactKeys(claims, NONCLAIM_KEYS) &&
    claims.humanApproved === false &&
    claims.officialRubricPass === false &&
    claims.publicationApproved === false
  );
}

function validToolVersions(value: unknown): boolean {
  const versions = record(value);
  return (
    versions !== null &&
    hasExactKeys(versions, ['node', 'pnpm', 'wp03KitFactory']) &&
    typeof versions.node === 'string' &&
    /^v[0-9]+\.[0-9]+\.[0-9]+$/.test(versions.node) &&
    versions.pnpm === 'PINNED_BY_PNPM_LOCK' &&
    versions.wp03KitFactory === '1.0.0'
  );
}

function isExactLegacyGenerationThreeCohort(finalization: FinalizationAuthority): boolean {
  return (
    finalization.generation === 3 &&
    finalization.receiptSha256 === LEGACY_GENERATION_THREE_COHORT.finalizationReceiptSha256 &&
    TEAM_IDS.every(
      (teamId) =>
        finalization.teams.find((team) => team.teamId === teamId)?.manifestSha256 ===
        LEGACY_GENERATION_THREE_COHORT.manifests[teamId],
    )
  );
}

function verifyManifestIdentitySets(
  kit: JsonRecord,
  centralRoot: string,
  finalization: FinalizationAuthority,
): boolean {
  const coreFiles = Array.isArray(kit.coreFiles) ? kit.coreFiles.map(record) : [];
  const allFiles = Array.isArray(kit.files) ? kit.files.map(record) : [];
  if (coreFiles.some((file) => file === null) || allFiles.some((file) => file === null)) {
    return false;
  }
  const identities = (files: readonly (JsonRecord | null)[]) =>
    files.map(
      (file) =>
        [typeof file?.path === 'string' ? file.path : '', String(file?.sha256 ?? '')] as const,
    );
  try {
    for (const kind of ['SCHEMA', 'TEMPLATE'] as const) {
      const core = deriveKitIdentityAggregate(identities(coreFiles), kind);
      const complete = deriveKitIdentityAggregate(identities(allFiles), kind);
      if (canonical(core.identities) !== canonical(complete.identities)) return false;
      const pin = record(kit.pins)?.[kind === 'SCHEMA' ? 'schemaSha256' : 'templateSha256'];
      if (!isExactLegacyGenerationThreeCohort(finalization) && pin !== core.sha256) return false;
      for (const [path, sha256] of core.identities) {
        const source = coreFiles.find((file) => file?.path === path);
        const completeFile = allFiles.find((file) => file?.path === path);
        if (
          source === undefined ||
          source === null ||
          completeFile === undefined ||
          completeFile === null ||
          !safeRelative(source.sourcePath) ||
          source.sourceSha256 !== sha256 ||
          completeFile.sha256 !== sha256 ||
          completeFile.size !== source.size ||
          completeFile.mode !== source.mode ||
          completeFile.sourcePath !== source.sourcePath ||
          completeFile.sourceSha256 !== source.sourceSha256
        ) {
          return false;
        }
        const centralPath = join(centralRoot, source.sourcePath);
        if (
          !regularFile(centralPath) ||
          digest(readFileSync(centralPath)) !== source.sourceSha256
        ) {
          return false;
        }
      }
    }
  } catch {
    return false;
  }
  return true;
}

function listFiles(root: string): string[] {
  const files: string[] = [];
  const walk = (directoryPath: string): void => {
    for (const entry of readdirSync(directoryPath, { withFileTypes: true })) {
      const absolute = join(directoryPath, entry.name);
      const relativePath = relative(root, absolute).split(sep).join('/');
      const info = lstatSync(absolute);
      if (info.isSymbolicLink()) throw new Error('SYMLINK');
      if (info.isDirectory()) walk(absolute);
      else if (info.isFile()) files.push(relativePath);
      else throw new Error('UNSAFE_NODE');
    }
  };
  walk(root);
  return files.sort();
}

function inventory(
  root: string,
  paths: readonly string[],
): Array<{
  readonly path: string;
  readonly sha256: string;
  readonly size: number;
}> {
  return paths.map((path) => {
    const bytes = readFileSync(confined(root, path));
    return { path, sha256: digest(bytes), size: bytes.length };
  });
}

function exception(
  code: TeamReturnIntakeCode,
  scope: TeamReturnException['scope'],
  subject: unknown,
): TeamReturnException {
  return { code, scope, subjectSha256: digest(canonical(subject)) };
}

function addException(
  exceptions: TeamReturnException[],
  code: TeamReturnIntakeCode,
  scope: TeamReturnException['scope'],
  subject: unknown,
): void {
  const offered = exception(code, scope, subject);
  if (
    !exceptions.some(
      (existing) =>
        existing.code === offered.code &&
        existing.scope === offered.scope &&
        existing.subjectSha256 === offered.subjectSha256,
    )
  ) {
    exceptions.push(offered);
  }
}

function constantResult(
  partial: Omit<TeamReturnIntakeResult, 'receiptSha256'>,
): TeamReturnIntakeResult {
  return { ...partial, receiptSha256: intakeReceiptIdentity(partial) };
}

function intakeReceiptIdentity(value: JsonRecord): string {
  const copy = record(value.copy);
  if (copy === null || copy.acceptance === undefined) return digest(canonical(value));
  const { acceptance: _acceptance, ...logicalCopy } = copy;
  return digest(canonical({ ...value, copy: logicalCopy }));
}

function gitOutput(root: string, args: readonly string[]): string {
  return execFileSync(GIT_EXECUTABLE, ['-C', root, ...args], {
    encoding: 'utf8',
    shell: false,
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
}

function gitBytes(root: string, args: readonly string[], maximumBytes: number): Buffer {
  return execFileSync(GIT_EXECUTABLE, ['-C', root, ...args], {
    encoding: 'buffer',
    maxBuffer: maximumBytes,
    shell: false,
    stdio: ['ignore', 'pipe', 'ignore'],
  });
}

function snapshotHeadCheckout(
  checkoutRoot: string,
  centralRoot: string,
  evidence: TeamReturnCheckoutEvidence,
): MaterializedSource {
  const workParent = join(centralRoot, ARCHIVE_WORK_RELATIVE_ROOT);
  mkdirSync(workParent, { recursive: true, mode: 0o700 });
  const work = mkdtempSync(join(workParent, 'checkout-'));
  const workInfo = lstatSync(work);
  const identity = { device: workInfo.dev, inode: workInfo.ino };
  try {
    const ledger: SourceIdentity[] = [];
    const changedPathIdentities: ChangedPathIdentity[] = [];
    let totalBytes = 0;
    for (const path of [...evidence.changedPaths].sort()) {
      if (!safeRelative(path)) throw new Error('CHECKOUT_SNAPSHOT_PATH_INVALID');
      const treeRecord = gitBytes(
        checkoutRoot,
        ['ls-tree', '-z', evidence.headCommit, '--', path],
        16 * 1024,
      ).toString('utf8');
      const records = treeRecord.split('\0').filter((record) => record.length > 0);
      if (records.length !== 1) throw new Error('CHECKOUT_HEAD_PATH_MISSING');
      const match = /^(100644|100755) blob ([0-9a-f]{40})\t(.+)$/.exec(records[0] as string);
      if (match === null || match[3] !== path) throw new Error('CHECKOUT_HEAD_BLOB_INVALID');
      const bytes = gitBytes(
        checkoutRoot,
        ['cat-file', 'blob', match[2] as string],
        MAX_ARCHIVE_ENTRY_EXPANDED_BYTES,
      );
      totalBytes += bytes.length;
      if (
        bytes.length > MAX_ARCHIVE_ENTRY_EXPANDED_BYTES ||
        totalBytes > MAX_ARCHIVE_TOTAL_EXPANDED_BYTES
      ) {
        throw new ArchiveResourceLimitError('CHECKOUT_SNAPSHOT_SIZE_LIMIT');
      }
      const target = confined(work, path);
      mkdirSync(dirname(target), { recursive: true, mode: 0o700 });
      writeFileSync(target, bytes, { flag: 'wx', mode: 0o600 });
      ledger.push({ path, sha256: digest(bytes), size: bytes.length });
      changedPathIdentities.push({
        gitBlobSha1: match[2] as string,
        gitMode: match[1] as '100644' | '100755',
        path,
        sha256: digest(bytes),
        size: bytes.length,
      });
    }
    hardenIncomingTree(work, chmodSync);
    return {
      candidateRoot: work,
      checkoutEvidence: evidence,
      checkoutRoot,
      cleanup: () => cleanupOwnedIncoming(work, identity),
      kind: 'CHECKOUT',
      ledger,
      changedPathIdentities,
    };
  } catch (error) {
    cleanupOwnedIncoming(work, identity);
    throw error;
  }
}

function reviewedWaveTreeIdentities(
  gitRoot: string,
  candidateRoot: string | undefined,
  commit: string,
  teamId: TeamId,
): readonly GitTreeFileIdentity[] {
  const prefix = `content/lesson-candidates/${teamId}/waves/`;
  const records = gitBytes(
    gitRoot,
    ['ls-tree', '-r', '-t', '-z', commit, '--', prefix],
    MAX_CHECKOUT_SNAPSHOT_PATH_BYTES + MAX_CHECKOUT_SNAPSHOT_ENTRIES * 96,
  )
    .toString('utf8')
    .split('\0')
    .filter(Boolean);
  if (records.length === 0 || records.length > MAX_CHECKOUT_SNAPSHOT_ENTRIES) {
    throw new Error('SUPERSESSION_WAVE_TREE_CLOSURE_INVALID');
  }
  const trustedContainerTrees = new Set<string>();
  let container = '';
  for (const component of prefix.slice(0, -1).split('/')) {
    container = container === '' ? component : `${container}/${component}`;
    trustedContainerTrees.add(container);
  }
  const leafRecords = records.filter((treeRecord) => {
    const match = /^([0-9]{6}) ([a-z]+) ([0-9a-f]{40})\t(.+)$/.exec(treeRecord);
    return !(
      match !== null &&
      match[1] === '040000' &&
      match[2] === 'tree' &&
      trustedContainerTrees.has(match[4] as string)
    );
  });
  if (leafRecords.length === 0) throw new Error('SUPERSESSION_WAVE_TREE_CLOSURE_INVALID');
  const identities = leafRecords.map((treeRecord): GitTreeFileIdentity => {
    const match = /^([0-9]{6}) ([a-z]+) ([0-9a-f]{40})\t(.+)$/.exec(treeRecord);
    if (
      match === null ||
      !['100644', '100755'].includes(match[1] as string) ||
      match[2] !== 'blob' ||
      !safeRelative(match[4] as string) ||
      !(match[4] as string).startsWith(prefix) ||
      !/^content\/lesson-candidates\/team-[AB]\/waves\/[^/]+\.json$/.test(match[4] as string)
    ) {
      throw new Error('SUPERSESSION_WAVE_TREE_ENTRY_INVALID');
    }
    const path = match[4] as string;
    const bytes = gitBytes(
      gitRoot,
      ['cat-file', 'blob', match[3] as string],
      MAX_ARCHIVE_ENTRY_EXPANDED_BYTES,
    );
    if (candidateRoot !== undefined) {
      const snapshotBytes = readFileSync(confined(candidateRoot, path));
      if (!bytes.equals(snapshotBytes)) {
        throw new Error('SUPERSESSION_WAVE_TREE_SNAPSHOT_MISMATCH');
      }
    }
    return {
      gitBlobSha1: match[3] as string,
      gitMode: match[1] as '100644' | '100755',
      gitType: 'blob',
      path,
      sha256: digest(bytes),
      size: bytes.byteLength,
    };
  });
  if (
    new Set(identities.map((identity) => identity.path)).size !== identities.length ||
    canonical(identities.map((identity) => identity.path)) !==
      canonical(identities.map((identity) => identity.path).sort())
  ) {
    throw new Error('SUPERSESSION_WAVE_TREE_ORDER_INVALID');
  }
  return identities;
}

function reviewedSupersessionSource(
  materialized: MaterializedSource,
  priorCommit: string,
  teamId: TeamId,
  promotedLessonIds: readonly string[],
): {
  readonly evidence: TeamReturnCheckoutEvidence;
  readonly identities: readonly ChangedPathIdentity[];
  readonly waveTreeIdentities: readonly GitTreeFileIdentity[];
} {
  if (materialized.checkoutRoot === undefined || !COMMIT.test(priorCommit)) {
    throw new Error('SUPERSESSION_SOURCE_PROOF_UNAVAILABLE');
  }
  const headCommit = materialized.checkoutEvidence.headCommit;
  const waveTreeIdentities = reviewedWaveTreeIdentities(
    materialized.checkoutRoot,
    materialized.candidateRoot,
    headCommit,
    teamId,
  );
  if (
    gitOutput(materialized.checkoutRoot, [
      'merge-base',
      '--is-ancestor',
      priorCommit,
      headCommit,
    ]) !== ''
  ) {
    throw new Error('SUPERSESSION_SOURCE_ANCESTRY_INVALID');
  }
  const changedPaths = gitBytes(
    materialized.checkoutRoot,
    ['diff', '--name-only', '-z', priorCommit, headCommit, '--'],
    MAX_CHECKOUT_SNAPSHOT_PATH_BYTES,
  )
    .toString('utf8')
    .split('\0')
    .filter(Boolean);
  if (
    changedPaths.length === 0 ||
    changedPaths.length > MAX_CHECKOUT_SNAPSHOT_ENTRIES ||
    new Set(changedPaths).size !== changedPaths.length ||
    canonical(changedPaths) !== canonical([...changedPaths].sort())
  ) {
    throw new Error('SUPERSESSION_SOURCE_CLOSURE_INVALID');
  }
  const prefix = `content/lesson-candidates/${teamId}/`;
  const promoted = new Set(promotedLessonIds);
  const observedPromoted = new Set<string>();
  let hasTeamHandoff = false;
  let hasWaveHandoff = false;
  const identities = changedPaths.map((path): ChangedPathIdentity => {
    if (!safeRelative(path) || !path.startsWith(prefix)) {
      throw new Error('SUPERSESSION_SOURCE_PATH_INVALID');
    }
    const relativePath = path.slice(prefix.length);
    const lessonMatch = /^(V3-LES-[0-9]{6})\//.exec(relativePath);
    if (lessonMatch !== null) {
      const lessonId = lessonMatch[1] as string;
      if (!promoted.has(lessonId)) throw new Error('SUPERSESSION_SOURCE_LESSON_INVALID');
      observedPromoted.add(lessonId);
    } else if (relativePath === 'TEAM-HANDOFF.json') {
      hasTeamHandoff = true;
    } else if (/^waves\/[^/]+\.json$/.test(relativePath)) {
      hasWaveHandoff = true;
    } else {
      throw new Error('SUPERSESSION_SOURCE_CONTRACT_PATH_INVALID');
    }
    const treeRecord = gitBytes(
      materialized.checkoutRoot as string,
      ['ls-tree', '-z', headCommit, '--', path],
      16 * 1024,
    ).toString('utf8');
    const records = treeRecord.split('\0').filter(Boolean);
    const match = /^(100644|100755) blob ([0-9a-f]{40})\t(.+)$/.exec(records[0] ?? '');
    if (records.length !== 1 || match === null || match[3] !== path) {
      throw new Error('SUPERSESSION_SOURCE_BLOB_INVALID');
    }
    const bytes = gitBytes(
      materialized.checkoutRoot as string,
      ['cat-file', 'blob', match[2] as string],
      MAX_ARCHIVE_ENTRY_EXPANDED_BYTES,
    );
    const snapshotBytes = readFileSync(confined(materialized.candidateRoot, path));
    if (!bytes.equals(snapshotBytes)) throw new Error('SUPERSESSION_SOURCE_SNAPSHOT_MISMATCH');
    return {
      gitBlobSha1: match[2] as string,
      gitMode: match[1] as '100644' | '100755',
      path,
      sha256: digest(bytes),
      size: bytes.byteLength,
    };
  });
  if (
    !hasTeamHandoff ||
    !hasWaveHandoff ||
    canonical([...observedPromoted].sort()) !== canonical([...promoted].sort())
  ) {
    throw new Error('SUPERSESSION_SOURCE_REQUIRED_CLOSURE_MISSING');
  }
  return {
    evidence: { ...materialized.checkoutEvidence, changedPaths },
    identities,
    waveTreeIdentities,
  };
}

function inspectCheckout(checkoutRoot: string, pinnedCommit: string): TeamReturnCheckoutEvidence {
  const root = realpathSync(checkoutRoot);
  const headCommit = gitOutput(root, ['rev-parse', 'HEAD']);
  const branch = gitOutput(root, ['symbolic-ref', '--short', 'HEAD']);
  const ancestor = spawnSync(
    GIT_EXECUTABLE,
    ['-C', root, 'merge-base', '--is-ancestor', pinnedCommit, headCommit],
    { shell: false, stdio: 'ignore' },
  );
  return {
    branch,
    changedPaths: gitOutput(root, [
      'diff',
      '--name-only',
      '--diff-filter=ACDMRTUXB',
      `${pinnedCommit}..${headCommit}`,
    ])
      .split('\n')
      .filter((path) => path.length > 0)
      .sort(),
    clean: gitOutput(root, ['status', '--porcelain']) === '',
    headCommit,
    pinnedAncestor: ancestor.status === 0,
  };
}

function inspectSignedCommitRange(
  repositoryRoot: string,
  pinnedCommit: string,
  headCommit: string,
): readonly string[] | null {
  const root = realpathSync(repositoryRoot);
  for (const commit of [pinnedCommit, headCommit]) {
    const exists = spawnSync(GIT_EXECUTABLE, ['-C', root, 'cat-file', '-e', `${commit}^{commit}`], {
      shell: false,
      stdio: 'ignore',
    });
    if (exists.status !== 0) return null;
  }
  const ancestor = spawnSync(
    GIT_EXECUTABLE,
    ['-C', root, 'merge-base', '--is-ancestor', pinnedCommit, headCommit],
    { shell: false, stdio: 'ignore' },
  );
  if (ancestor.status !== 0) return null;
  return gitOutput(root, [
    'diff',
    '--name-only',
    '--diff-filter=ACDMRTUXB',
    `${pinnedCommit}..${headCommit}`,
  ])
    .split('\n')
    .filter((path) => path.length > 0)
    .sort();
}

function verifyAuthorityRoot(
  authorityRoot: string,
  exceptions: TeamReturnException[],
): FinalizationAuthority | null {
  const currentPath = join(authorityRoot, 'current.json');
  const finalizationPath = join(authorityRoot, 'authority/finalization-receipt.json');
  const keyPath = join(authorityRoot, 'authority/issuer.key');
  const current = readJson(currentPath);
  if (
    current === null ||
    current.format !== 'wp-03-current/1' ||
    !Number.isInteger(current.generation) ||
    (current.generation as number) < 3 ||
    !safeRelative(current.versionDirectory) ||
    canonical(current.teams) !== canonical(TEAM_IDS)
  ) {
    addException(exceptions, 'AUTHORITY_CURRENT_INVALID', 'AUTHORITY', {
      currentSha256: regularFile(currentPath) ? digest(readFileSync(currentPath)) : null,
    });
    return null;
  }
  const receipt = readJson(finalizationPath);
  if (
    receipt === null ||
    receipt.issuer !== 'WP03_FINALIZATION_AUTHORITY' ||
    receipt.allowedAction !== 'PACKAGE_KITS' ||
    receipt.generation !== current.generation ||
    typeof receipt.receiptId !== 'string' ||
    !new RegExp(`^wp03-finalization-${String(current.generation)}-[0-9a-f]{16}$`).test(
      receipt.receiptId,
    ) ||
    typeof receipt.runId !== 'string' ||
    !Array.isArray(receipt.teams) ||
    receipt.teams.length !== 2 ||
    record(receipt.pins) === null ||
    !COMMIT.test(String((receipt.pins as JsonRecord).repositoryCommit ?? '')) ||
    typeof receipt.signature !== 'string' ||
    !DIGEST.test(receipt.signature)
  ) {
    addException(exceptions, 'FINALIZATION_RECEIPT_INVALID', 'AUTHORITY', {
      receiptSha256: regularFile(finalizationPath) ? digest(readFileSync(finalizationPath)) : null,
    });
    return null;
  }
  if (!regularFile(keyPath)) {
    addException(exceptions, 'FINALIZATION_SIGNATURE_INVALID', 'AUTHORITY', {
      key: 'MISSING',
    });
    return null;
  }
  const { signature, ...unsigned } = receipt;
  const expected = createHmac('sha256', readFileSync(keyPath, 'utf8').trim())
    .update(canonical(unsigned))
    .digest('hex');
  const actualBytes = Buffer.from(signature, 'hex');
  const expectedBytes = Buffer.from(expected, 'hex');
  if (actualBytes.length !== expectedBytes.length || !timingSafeEqual(actualBytes, expectedBytes)) {
    addException(exceptions, 'FINALIZATION_SIGNATURE_INVALID', 'AUTHORITY', {
      receiptId: receipt.receiptId,
    });
    return null;
  }
  const teams: FinalizationTeam[] = [];
  for (const teamId of TEAM_IDS) {
    const team = (receipt.teams as unknown[]).map(record).find((item) => item?.teamId === teamId);
    if (
      team === undefined ||
      team === null ||
      typeof team.archiveSha256 !== 'string' ||
      !DIGEST.test(team.archiveSha256) ||
      typeof team.assignmentSha256 !== 'string' ||
      !DIGEST.test(team.assignmentSha256) ||
      typeof team.manifestSha256 !== 'string' ||
      !DIGEST.test(team.manifestSha256) ||
      typeof team.packetAggregateSha256 !== 'string' ||
      !DIGEST.test(team.packetAggregateSha256) ||
      !Array.isArray(team.lessonIds) ||
      team.lessonIds.length !== 30 ||
      new Set(team.lessonIds).size !== 30 ||
      !team.lessonIds.every((lessonId) => typeof lessonId === 'string' && LESSON_ID.test(lessonId))
    ) {
      addException(exceptions, 'FINALIZATION_RECEIPT_INVALID', 'AUTHORITY', { teamId });
      return null;
    }
    teams.push({
      archiveSha256: team.archiveSha256,
      assignmentSha256: team.assignmentSha256,
      lessonIds: team.lessonIds as string[],
      manifestSha256: team.manifestSha256,
      packetAggregateSha256: team.packetAggregateSha256,
      teamId,
    });
  }
  return {
    generation: current.generation as number,
    pins: receipt.pins as JsonRecord & { repositoryCommit: string },
    receipt,
    receiptSha256: digest(readFileSync(finalizationPath)),
    teams,
    versionDirectory: current.versionDirectory,
  };
}

function parseSendMe(text: string): Readonly<Record<string, string>> | null {
  const lines = text.split('\n');
  if (lines.at(-1) === '') lines.pop();
  if (lines[0] !== 'WP03_TEAMMATE_KIT' || lines.length !== 9) return null;
  const values: Record<string, string> = {};
  for (const line of lines.slice(1)) {
    const separator = line.indexOf('=');
    if (separator <= 0) return null;
    const key = line.slice(0, separator);
    if (values[key] !== undefined) return null;
    values[key] = line.slice(separator + 1);
  }
  return values;
}

function verifyTeamAuthority(
  authorityRoot: string,
  centralRoot: string,
  finalization: FinalizationAuthority,
  teamId: TeamId,
  exceptions: TeamReturnException[],
): TeamAuthority | null {
  const team = finalization.teams.find((candidate) => candidate.teamId === teamId);
  if (team === undefined) {
    addException(exceptions, 'KIT_AUTHORITY_INVALID', 'AUTHORITY', { teamId });
    return null;
  }
  const root = confined(authorityRoot, `${finalization.versionDirectory}/${teamId}`);
  const manifestPath = join(root, 'KIT-MANIFEST.json');
  const readyPath = join(root, 'READY.json');
  const sendPath = join(root, 'SEND-ME.txt');
  const sidecarPath = join(root, `${teamId}-complete.zip.sha256`);
  if (!regularFile(manifestPath) || digest(readFileSync(manifestPath)) !== team.manifestSha256) {
    addException(exceptions, 'KIT_MANIFEST_HASH_MISMATCH', 'AUTHORITY', { teamId });
  }
  const kit = readJson(manifestPath);
  const ready = readJson(readyPath);
  const send = regularFile(sendPath) ? parseSendMe(readFileSync(sendPath, 'utf8')) : null;
  if (kit === null) {
    addException(exceptions, 'KIT_AUTHORITY_INVALID', 'AUTHORITY', { teamId, file: 'KIT' });
    return null;
  }
  const readyMatches =
    ready !== null &&
    ready.format === 'wp-03-team-ready/2' &&
    ready.status === 'READY' &&
    ready.teamId === teamId &&
    ready.archiveSha256 === team.archiveSha256 &&
    ready.assignmentSha256 === team.assignmentSha256 &&
    ready.manifestSha256 === team.manifestSha256 &&
    ready.packetAggregateSha256 === team.packetAggregateSha256 &&
    ready.packetCount === 30 &&
    canonical(ready.lessonIds) === canonical(team.lessonIds);
  if (!readyMatches) addException(exceptions, 'READY_MISMATCH', 'AUTHORITY', { teamId });
  const sendMatches =
    send !== null &&
    send.TEAM_ID === teamId &&
    send.ARCHIVE === `${teamId}-complete.zip` &&
    send.ARCHIVE_SHA256 === team.archiveSha256 &&
    send.KIT_MANIFEST_SHA256 === team.manifestSha256 &&
    send.REPOSITORY_COMMIT === finalization.pins.repositoryCommit &&
    send.ASSIGNMENT_SHA256 === team.assignmentSha256 &&
    send.PACKET_COUNT === '30' &&
    send.REQUIRES_MATCHING_READY_JSON === 'true' &&
    regularFile(sidecarPath) &&
    readFileSync(sidecarPath, 'utf8') === `${team.archiveSha256}  ${teamId}-complete.zip\n`;
  if (!sendMatches) addException(exceptions, 'SEND_ME_MISMATCH', 'AUTHORITY', { teamId });

  const assignmentPath = join(centralRoot, `content/lesson-factory/assignments/${teamId}-30.json`);
  const assignment = readJson(assignmentPath);
  if (
    assignment === null ||
    !regularFile(assignmentPath) ||
    digest(readFileSync(assignmentPath)) !== team.assignmentSha256
  ) {
    addException(exceptions, 'ASSIGNMENT_HASH_MISMATCH', 'AUTHORITY', { teamId });
    return null;
  }
  const assignmentRows = Array.isArray(assignment.assignments)
    ? assignment.assignments.map(record)
    : [];
  const assignmentIds = assignmentRows.map((row) => row?.lesson_id);
  if (
    assignment.contract_id !== 'lesson-factory.assignment-manifest' ||
    assignment.contract_version !== '3.0.0' ||
    typeof assignment.assignment_id !== 'string' ||
    assignmentRows.some((row) => row === null) ||
    assignmentRows.length !== 30 ||
    canonical(assignmentIds) !== canonical(team.lessonIds)
  ) {
    addException(exceptions, 'ASSIGNMENT_INVALID', 'AUTHORITY', { teamId });
    return null;
  }
  const kitPins = record(kit.pins);
  const validatorAuthority = record(kit.validatorAuthority);
  const kitFiles = Array.isArray(kit.files) ? kit.files.map(record) : [];
  const filePaths = kitFiles.map((file) => file?.path);
  const lockfilePath = join(centralRoot, 'pnpm-lock.yaml');
  const manifestIdentitySetsValid = verifyManifestIdentitySets(kit, centralRoot, finalization);
  const overlappingPinsValid =
    kitPins !== null &&
    kitPins.repositoryCommit === finalization.pins.repositoryCommit &&
    kitPins.profileSha256 === finalization.pins.profileSha256 &&
    kitPins.schemaSha256 === finalization.pins.schemaSha256 &&
    kitPins.templateSha256 === finalization.pins.templateSha256 &&
    validToolVersions(kitPins.toolVersions) &&
    regularFile(lockfilePath) &&
    digest(readFileSync(lockfilePath)) === finalization.pins.toolSha256 &&
    manifestIdentitySetsValid;
  const kitIdentityValid =
    kit.format === 'lesson-generation-kit-v1/2' &&
    kit.teamId === teamId &&
    kit.runId === finalization.receipt.runId &&
    kit.repositoryCommit === finalization.pins.repositoryCommit &&
    kit.assignmentId === assignment.assignment_id &&
    kit.assignmentSha256 === team.assignmentSha256 &&
    kit.packetCount === 30 &&
    kit.allowedOutputRoot === `content/lesson-candidates/${teamId}` &&
    kit.branchConvention === `lesson-factory/${teamId}/wave-<nn>` &&
    canonical(kit.allowedLessonIds) === canonical(team.lessonIds) &&
    Array.isArray(kitFiles) &&
    kitFiles.every((file) => file !== null) &&
    kit.filesSha256 === digest(canonical(kit.files)) &&
    canonical(kit.allowedPaths) === canonical(filePaths) &&
    overlappingPinsValid &&
    validatorAuthority !== null &&
    validatorAuthority.repositoryCommit === finalization.pins.repositoryCommit &&
    Array.isArray(validatorAuthority.files) &&
    validatorAuthority.files.length > 0 &&
    validatorAuthority.aggregateSha256 === digest(canonical(validatorAuthority.files));
  if (!kitIdentityValid) {
    addException(exceptions, 'KIT_AUTHORITY_INVALID', 'AUTHORITY', { teamId });
  }
  const assignmentKitEntry = kitFiles.find(
    (file) => file?.path === `assignments/${teamId}-30.json`,
  );
  if (
    assignmentKitEntry === undefined ||
    assignmentKitEntry?.sha256 !== team.assignmentSha256 ||
    assignmentKitEntry.size !== readFileSync(assignmentPath).length
  ) {
    addException(exceptions, 'ASSIGNMENT_HASH_MISMATCH', 'AUTHORITY', {
      teamId,
      source: 'KIT',
    });
  }
  for (const row of assignmentRows as JsonRecord[]) {
    const lessonId = String(row.lesson_id);
    const packetPath = join(
      centralRoot,
      `content/lesson-factory/packets/${lessonId}/task-source-packet.json`,
    );
    const packetEntry = kitFiles.find(
      (file) => file?.path === `packets/${lessonId}/task-source-packet.json`,
    );
    const refDigest =
      typeof row.task_packet_ref === 'string'
        ? row.task_packet_ref.match(/#sha256:([0-9a-f]{64})$/)?.[1]
        : undefined;
    if (
      !regularFile(packetPath) ||
      packetEntry === undefined ||
      refDigest === undefined ||
      digest(readFileSync(packetPath)) !== refDigest ||
      packetEntry?.sha256 !== refDigest
    ) {
      addException(exceptions, 'PACKET_PIN_MISMATCH', 'AUTHORITY', { lessonId });
    }
  }
  for (const item of (validatorAuthority?.files as unknown[] | undefined) ?? []) {
    const file = record(item);
    if (
      file === null ||
      !safeRelative(file.path) ||
      typeof file.sha256 !== 'string' ||
      !regularFile(join(centralRoot, file.path)) ||
      digest(readFileSync(join(centralRoot, file.path))) !== file.sha256
    ) {
      addException(exceptions, 'CENTRAL_VALIDATOR_PIN_MISMATCH', 'AUTHORITY', {
        pathSha256: digest(canonical(file?.path ?? null)),
      });
    }
  }
  return {
    assignment,
    assignmentId: assignment.assignment_id as string,
    assignmentRows: assignmentRows as JsonRecord[],
    kit,
    kitSha256: regularFile(manifestPath) ? digest(readFileSync(manifestPath)) : '',
    readySha256: regularFile(readyPath) ? digest(readFileSync(readyPath)) : '',
    sendMeSha256: regularFile(sendPath) ? digest(readFileSync(sendPath)) : '',
    team,
    toolSha256: String(finalization.pins.toolSha256),
  };
}

function crc32(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

class ArchiveResourceLimitError extends Error {}

async function readBoundedRegularFile(path: string, maximumBytes: number): Promise<Buffer> {
  if (
    typeof fsConstants.O_NOFOLLOW !== 'number' ||
    fsConstants.O_NOFOLLOW === 0 ||
    !Number.isSafeInteger(maximumBytes) ||
    maximumBytes < 0
  ) {
    throw new Error('BOUNDED_FILE_PLATFORM_UNSAFE');
  }
  let descriptor: number | null = null;
  try {
    descriptor = openSync(path, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
    await Promise.resolve();
    const before = fstatSync(descriptor);
    if (!before.isFile()) throw new Error('BOUNDED_FILE_NOT_REGULAR');
    if (!Number.isSafeInteger(before.size) || before.size < 0 || before.size > maximumBytes) {
      throw new ArchiveResourceLimitError('BOUNDED_FILE_SIZE_LIMIT');
    }
    const bytes = Buffer.allocUnsafe(before.size);
    let offset = 0;
    while (offset < bytes.length) {
      const count = readSync(descriptor, bytes, offset, bytes.length - offset, offset);
      if (count === 0) throw new Error('BOUNDED_FILE_TRUNCATED');
      offset += count;
    }
    const growthProbe = Buffer.allocUnsafe(1);
    if (readSync(descriptor, growthProbe, 0, 1, before.size) !== 0) {
      throw new ArchiveResourceLimitError('BOUNDED_FILE_GREW');
    }
    const after = fstatSync(descriptor);
    if (after.size > maximumBytes) throw new ArchiveResourceLimitError('BOUNDED_FILE_SIZE_LIMIT');
    if (
      after.dev !== before.dev ||
      after.ino !== before.ino ||
      after.size !== before.size ||
      after.mtimeMs !== before.mtimeMs ||
      after.ctimeMs !== before.ctimeMs
    ) {
      throw new Error('BOUNDED_FILE_IDENTITY_CHANGED');
    }
    return bytes;
  } finally {
    if (descriptor !== null) closeSync(descriptor);
  }
}

function extractZipSafely(archive: Buffer, destination: string): void {
  if (archive.length < 22) throw new Error('ZIP_EOCD_MISSING');
  let eocd = -1;
  for (
    let offset = Math.max(0, archive.length - 65_557);
    offset <= archive.length - 22;
    offset += 1
  ) {
    if (archive.readUInt32LE(offset) === 0x06054b50) eocd = offset;
  }
  if (eocd < 0) throw new Error('ZIP_EOCD_MISSING');
  const commentLength = archive.readUInt16LE(eocd + 20);
  if (eocd + 22 + commentLength !== archive.length) throw new Error('ZIP_EOCD_BOUNDS_INVALID');
  const diskNumber = archive.readUInt16LE(eocd + 4);
  const centralDisk = archive.readUInt16LE(eocd + 6);
  const diskCount = archive.readUInt16LE(eocd + 8);
  const count = archive.readUInt16LE(eocd + 10);
  const centralSize = archive.readUInt32LE(eocd + 12);
  const centralOffset = archive.readUInt32LE(eocd + 16);
  if (count > MAX_ARCHIVE_ENTRIES) {
    throw new ArchiveResourceLimitError('ZIP_ENTRY_COUNT_LIMIT');
  }
  if (
    diskNumber !== 0 ||
    centralDisk !== 0 ||
    diskCount !== count ||
    centralOffset + centralSize !== eocd
  ) {
    throw new Error('ZIP_CENTRAL_BOUNDS_INVALID');
  }
  const centralEnd = centralOffset + centralSize;
  let cursor = centralOffset;
  const names = new Set<string>();
  let totalExpandedSize = 0;
  const entries: Array<{
    readonly compressedSize: number;
    readonly dataOffset: number;
    readonly expectedCrc: number;
    readonly method: number;
    readonly name: string;
    readonly uncompressedSize: number;
  }> = [];
  for (let index = 0; index < count; index += 1) {
    if (cursor + 46 > centralEnd) throw new Error('ZIP_CENTRAL_BOUNDS_INVALID');
    if (archive.readUInt32LE(cursor) !== 0x02014b50) throw new Error('ZIP_CENTRAL_INVALID');
    const flags = archive.readUInt16LE(cursor + 8);
    const method = archive.readUInt16LE(cursor + 10);
    const expectedCrc = archive.readUInt32LE(cursor + 16);
    const compressedSize = archive.readUInt32LE(cursor + 20);
    const uncompressedSize = archive.readUInt32LE(cursor + 24);
    const nameLength = archive.readUInt16LE(cursor + 28);
    const extraLength = archive.readUInt16LE(cursor + 30);
    const commentLength = archive.readUInt16LE(cursor + 32);
    const externalMode = archive.readUInt32LE(cursor + 38) >>> 16;
    const localOffset = archive.readUInt32LE(cursor + 42);
    const centralEntryEnd = cursor + 46 + nameLength + extraLength + commentLength;
    if (centralEntryEnd > centralEnd) throw new Error('ZIP_CENTRAL_BOUNDS_INVALID');
    const name = archive.subarray(cursor + 46, cursor + 46 + nameLength).toString('utf8');
    if (
      flags & 1 ||
      ![0, 8].includes(method) ||
      !safeRelative(name) ||
      name.endsWith('/') ||
      names.has(name) ||
      (externalMode & 0o170000) === 0o120000
    ) {
      throw new Error('ZIP_ENTRY_UNSAFE');
    }
    if (
      compressedSize > MAX_ARCHIVE_ENTRY_COMPRESSED_BYTES ||
      uncompressedSize > MAX_ARCHIVE_ENTRY_EXPANDED_BYTES ||
      (uncompressedSize > 0 &&
        (compressedSize === 0 || uncompressedSize / compressedSize > MAX_ARCHIVE_COMPRESSION_RATIO))
    ) {
      throw new ArchiveResourceLimitError('ZIP_ENTRY_SIZE_LIMIT');
    }
    totalExpandedSize += uncompressedSize;
    if (totalExpandedSize > MAX_ARCHIVE_TOTAL_EXPANDED_BYTES) {
      throw new ArchiveResourceLimitError('ZIP_TOTAL_SIZE_LIMIT');
    }
    names.add(name);
    if (localOffset + 30 > centralOffset) throw new Error('ZIP_LOCAL_BOUNDS_INVALID');
    if (archive.readUInt32LE(localOffset) !== 0x04034b50) throw new Error('ZIP_LOCAL_INVALID');
    const localFlags = archive.readUInt16LE(localOffset + 6);
    const localMethod = archive.readUInt16LE(localOffset + 8);
    const localNameLength = archive.readUInt16LE(localOffset + 26);
    const localExtraLength = archive.readUInt16LE(localOffset + 28);
    const localNameEnd = localOffset + 30 + localNameLength;
    const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
    const dataEnd = dataOffset + compressedSize;
    if (
      localNameEnd > centralOffset ||
      dataOffset > centralOffset ||
      dataEnd > centralOffset ||
      localFlags !== flags ||
      localMethod !== method ||
      archive.subarray(localOffset + 30, localNameEnd).toString('utf8') !== name
    ) {
      throw new Error('ZIP_LOCAL_BOUNDS_INVALID');
    }
    entries.push({ compressedSize, dataOffset, expectedCrc, method, name, uncompressedSize });
    cursor = centralEntryEnd;
  }
  if (cursor !== centralEnd) throw new Error('ZIP_CENTRAL_SIZE_INVALID');
  for (const entry of entries) {
    const compressed = archive.subarray(entry.dataOffset, entry.dataOffset + entry.compressedSize);
    const bytes =
      entry.method === 0
        ? Buffer.from(compressed)
        : inflateRawSync(compressed, { maxOutputLength: entry.uncompressedSize });
    if (bytes.length !== entry.uncompressedSize || crc32(bytes) !== entry.expectedCrc) {
      throw new Error('ZIP_ENTRY_HASH_INVALID');
    }
    const target = confined(destination, entry.name);
    mkdirSync(dirname(target), { recursive: true, mode: 0o700 });
    writeFileSync(target, bytes, { mode: 0o600, flag: 'wx' });
  }
}

async function materializeArchive(
  source: Extract<TeamReturnSource, { kind: 'SIGNED_ARCHIVE' }>,
  authorityRoot: string,
  centralRoot: string,
  pinnedCommit: string,
  exceptions: TeamReturnException[],
): Promise<MaterializedSource | null> {
  let ownedWork: { readonly identity: OwnedIncomingIdentity; readonly path: string } | null = null;
  try {
    const archive = await readBoundedRegularFile(source.archivePath, MAX_ARCHIVE_BYTES);
    const attestationBytes = await readBoundedRegularFile(
      source.attestationPath,
      MAX_ATTESTATION_BYTES,
    );
    const attestation = record(JSON.parse(attestationBytes.toString('utf8')) as unknown);
    if (attestation === null || typeof attestation.signature !== 'string') {
      throw new Error('ATTESTATION_INVALID');
    }
    const { signature, ...unsigned } = attestation;
    const validShape =
      attestation.format === 'lesson-generation-signed-wave-archive/1' &&
      attestation.algorithm === 'ed25519' &&
      attestation.archiveSha256 === digest(archive) &&
      attestation.pinnedCommit === pinnedCommit &&
      attestation.pinnedAncestor === true &&
      typeof attestation.branch === 'string' &&
      typeof attestation.headCommit === 'string' &&
      COMMIT.test(attestation.headCommit) &&
      TEAM_IDS.includes(attestation.teamId as TeamId) &&
      Array.isArray(attestation.changedPaths) &&
      attestation.changedPaths.every((path) => typeof path === 'string');
    if (!validShape) {
      addException(exceptions, 'ARCHIVE_SIGNATURE_INVALID', 'SOURCE', {
        archiveSha256: digest(archive),
      });
      return null;
    }
    const teamId = attestation.teamId as TeamId;
    const authorityDirectory = join(authorityRoot, 'authority');
    const trustedSignerStore = join(authorityDirectory, 'trusted-team-signers');
    const trustedKeyPath = join(trustedSignerStore, `${teamId}.ed25519.pub`);
    if (!existsSync(trustedSignerStore)) {
      addException(exceptions, 'TRUSTED_SIGNER_MISSING', 'SOURCE', { teamId });
      return null;
    }
    if (
      !directory(authorityRoot) ||
      !directory(authorityDirectory) ||
      !directory(trustedSignerStore)
    ) {
      addException(exceptions, 'TRUSTED_SIGNER_INVALID', 'SOURCE', { teamId });
      return null;
    }
    if (!existsSync(trustedKeyPath)) {
      addException(exceptions, 'TRUSTED_SIGNER_MISSING', 'SOURCE', { teamId });
      return null;
    }
    if (!regularFile(trustedKeyPath)) {
      addException(exceptions, 'TRUSTED_SIGNER_INVALID', 'SOURCE', { teamId });
      return null;
    }
    let signatureValid = false;
    try {
      signatureValid = verifySignature(
        null,
        Buffer.from(canonical(unsigned)),
        readFileSync(trustedKeyPath),
        Buffer.from(signature, 'base64'),
      );
    } catch {
      addException(exceptions, 'TRUSTED_SIGNER_INVALID', 'SOURCE', { teamId });
      return null;
    }
    if (!signatureValid) {
      addException(exceptions, 'ARCHIVE_SIGNATURE_INVALID', 'SOURCE', {
        archiveSha256: digest(archive),
      });
      return null;
    }
    const derivedChangedPaths = inspectSignedCommitRange(
      centralRoot,
      pinnedCommit,
      attestation.headCommit as string,
    );
    const signedChangedPaths = [...(attestation.changedPaths as string[])].sort();
    if (
      derivedChangedPaths === null ||
      new Set(signedChangedPaths).size !== signedChangedPaths.length ||
      canonical(derivedChangedPaths) !== canonical(signedChangedPaths)
    ) {
      addException(exceptions, 'ANCESTRY_INVALID', 'SOURCE', {
        headCommit: attestation.headCommit,
      });
      return null;
    }
    const workParent = join(centralRoot, ARCHIVE_WORK_RELATIVE_ROOT);
    mkdirSync(workParent, { recursive: true, mode: 0o700 });
    const work = mkdtempSync(join(workParent, 'offered-'));
    const workInfo = lstatSync(work);
    ownedWork = {
      identity: { device: workInfo.dev, inode: workInfo.ino },
      path: work,
    };
    extractZipSafely(archive, work);
    const nested = join(work, `content/lesson-candidates/${teamId}`);
    if (directory(nested)) {
      const teamPrefix = `content/lesson-candidates/${teamId}/`;
      const outsideTeamRoot = listFiles(work).filter((path) => !path.startsWith(teamPrefix));
      if (outsideTeamRoot.length > 0) {
        cleanupOwnedIncoming(ownedWork.path, ownedWork.identity);
        ownedWork = null;
        addException(exceptions, 'ARCHIVE_INVALID', 'SOURCE', {
          outsideTeamRootSha256: digest(canonical(outsideTeamRoot)),
        });
        return null;
      }
    }
    const privateCandidateRoot = directory(nested) ? nested : work;
    const ledger = inventory(privateCandidateRoot, listFiles(privateCandidateRoot));
    hardenIncomingTree(work, chmodSync);
    return {
      candidateRoot: privateCandidateRoot,
      checkoutEvidence: {
        branch: attestation.branch as string,
        changedPaths: derivedChangedPaths,
        clean: true,
        headCommit: attestation.headCommit as string,
        pinnedAncestor: true,
      },
      cleanup: () => cleanupOwnedIncoming(work, ownedWork?.identity ?? null),
      kind: 'SIGNED_ARCHIVE',
      ledger,
      changedPathIdentities: [],
      teamHint: teamId,
    };
  } catch (error) {
    if (ownedWork !== null) cleanupOwnedIncoming(ownedWork.path, ownedWork.identity);
    addException(
      exceptions,
      error instanceof ArchiveResourceLimitError
        ? 'ARCHIVE_RESOURCE_LIMIT_EXCEEDED'
        : 'ARCHIVE_INVALID',
      'SOURCE',
      {
        error: error instanceof Error ? error.message : String(error),
      },
    );
    return null;
  }
}

async function materializeSource(
  request: TeamReturnIntakeRequest,
  pinnedCommit: string,
  dependencies: TeamReturnIntakeDependencies,
  exceptions: TeamReturnException[],
): Promise<MaterializedSource | null> {
  if (request.source.kind === 'SIGNED_ARCHIVE') {
    return materializeArchive(
      request.source,
      request.authorityRoot,
      request.centralRepositoryRoot,
      pinnedCommit,
      exceptions,
    );
  }
  try {
    const root = realpathSync(request.source.root);
    const evidence = await (dependencies.inspectCheckout ?? inspectCheckout)(root, pinnedCommit);
    if (!canonicalCheckoutSnapshotPaths(evidence.changedPaths)) {
      addException(exceptions, 'SOURCE_SNAPSHOT_INVALID', 'SOURCE', {
        changedPathClosureSha256: digest(canonical([...evidence.changedPaths].sort())),
      });
      return null;
    }
    const pathByteLengths = evidence.changedPaths.map((path) => Buffer.byteLength(path, 'utf8'));
    const resourceLimit =
      evidence.changedPaths.length > MAX_CHECKOUT_SNAPSHOT_ENTRIES
        ? 'ENTRY_COUNT'
        : pathByteLengths.some((size) => size > MAX_CHECKOUT_SNAPSHOT_SINGLE_PATH_BYTES)
          ? 'SINGLE_PATH_BYTES'
          : pathByteLengths.reduce((total, size) => total + size, 0) >
              MAX_CHECKOUT_SNAPSHOT_PATH_BYTES
            ? 'TOTAL_PATH_BYTES'
            : null;
    if (resourceLimit !== null) {
      addException(exceptions, 'SOURCE_RESOURCE_LIMIT_EXCEEDED', 'SOURCE', {
        resourceLimit,
      });
      return null;
    }
    if (
      evidence.changedPaths.some(
        (path) =>
          !TEAM_IDS.some((teamId) => path.startsWith(`content/lesson-candidates/${teamId}/`)),
      )
    ) {
      addException(exceptions, 'SHARED_PATH_CHANGED', 'SOURCE', {
        changedPathClosureSha256: digest(canonical([...evidence.changedPaths].sort())),
      });
      return null;
    }
    return snapshotHeadCheckout(root, request.centralRepositoryRoot, evidence);
  } catch (error) {
    addException(exceptions, 'SOURCE_SNAPSHOT_INVALID', 'SOURCE', {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

function deriveCandidateRoot(
  materialized: MaterializedSource,
  exceptions: TeamReturnException[],
): { readonly candidateRoot: string; readonly teamId: TeamId } | null {
  if (materialized.teamHint !== undefined) {
    return { candidateRoot: materialized.candidateRoot, teamId: materialized.teamHint };
  }
  const candidates = TEAM_IDS.flatMap((teamId) => {
    const root = join(materialized.candidateRoot, `content/lesson-candidates/${teamId}`);
    return directory(root) ? [{ candidateRoot: root, teamId }] : [];
  });
  if (candidates.length !== 1) {
    addException(exceptions, 'SOURCE_AMBIGUOUS', 'SOURCE', {
      candidateCount: candidates.length,
    });
    return null;
  }
  return candidates[0] ?? null;
}

function validateRepositoryEvidence(
  evidence: TeamReturnCheckoutEvidence,
  teamId: TeamId,
  allowedLessonIds: ReadonlySet<string>,
  exceptions: TeamReturnException[],
): string | null {
  const branchMatch = /^lesson-factory\/(team-[AB])\/wave-([0-9]{2})$/.exec(evidence.branch);
  if (branchMatch === null) {
    addException(exceptions, 'BRANCH_INVALID', 'SOURCE', { branch: evidence.branch });
    return null;
  }
  if (branchMatch[1] !== teamId) {
    addException(exceptions, 'BRANCH_TEAM_MISMATCH', 'SOURCE', {
      branchTeam: branchMatch[1],
      derivedTeam: teamId,
    });
  }
  if (!COMMIT.test(evidence.headCommit) || !evidence.pinnedAncestor) {
    addException(exceptions, 'ANCESTRY_INVALID', 'SOURCE', {
      headCommit: evidence.headCommit,
    });
  }
  if (!evidence.clean) {
    addException(exceptions, 'REPOSITORY_DIRTY', 'SOURCE', { headCommit: evidence.headCommit });
  }
  const prefix = `content/lesson-candidates/${teamId}/`;
  for (const path of evidence.changedPaths) {
    const relativePath = path.startsWith(prefix) ? path.slice(prefix.length) : '';
    const first = relativePath.split('/')[0] ?? '';
    const candidatePath = allowedLessonIds.has(first) && relativePath.length > first.length + 1;
    const wavePath = /^waves\/WAVE-[0-9]{2}-HANDOFF\.json$/.test(relativePath);
    const teamPath = relativePath === 'TEAM-HANDOFF.json';
    if (!candidatePath && !wavePath && !teamPath) {
      addException(exceptions, 'SHARED_PATH_CHANGED', 'SOURCE', { path });
    }
  }
  return `WAVE-${branchMatch[2]}`;
}

function parseRows(
  value: unknown,
  scope: 'WAVE' | 'TEAM',
  exceptions: TeamReturnException[],
): OfferedRow[] {
  if (!Array.isArray(value)) {
    addException(
      exceptions,
      scope === 'WAVE' ? 'WAVE_HANDOFF_INVALID' : 'TEAM_HANDOFF_INVALID',
      scope,
      { rows: 'NOT_ARRAY' },
    );
    return [];
  }
  const rows: OfferedRow[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const row = record(item);
    if (
      row === null ||
      !hasExactKeys(row, ['lessonHandoffSha256', 'lessonId', 'rootSha256', 'status']) ||
      typeof row.lessonId !== 'string' ||
      !LESSON_ID.test(row.lessonId) ||
      typeof row.lessonHandoffSha256 !== 'string' ||
      !DIGEST.test(row.lessonHandoffSha256) ||
      typeof row.rootSha256 !== 'string' ||
      !DIGEST.test(row.rootSha256) ||
      !['COMPLETE', 'BLOCKED', 'FAILED'].includes(String(row.status))
    ) {
      addException(
        exceptions,
        scope === 'WAVE' ? 'WAVE_HANDOFF_INVALID' : 'TEAM_HANDOFF_INVALID',
        scope,
        { rowSha256: digest(canonical(item)) },
      );
      continue;
    }
    if (seen.has(row.lessonId)) {
      addException(exceptions, 'ROW_DUPLICATE', scope, { lessonId: row.lessonId });
    }
    seen.add(row.lessonId);
    rows.push({
      lessonHandoffSha256: row.lessonHandoffSha256,
      lessonId: row.lessonId,
      rootSha256: row.rootSha256,
      status: row.status as LessonStatus,
    });
  }
  return rows;
}

function validateManifestHeader(
  manifest: JsonRecord,
  kind: 'WAVE' | 'TEAM',
  teamAuthority: TeamAuthority,
  teamId: TeamId,
  exceptions: TeamReturnException[],
): boolean {
  const valid =
    manifest.format ===
      (kind === 'WAVE' ? 'lesson-generation-wave-handoff/1' : 'lesson-generation-team-handoff/1') &&
    manifest.assignmentId === teamAuthority.assignmentId &&
    manifest.repositoryCommit === teamAuthority.kit.repositoryCommit &&
    manifest.teamId === teamId &&
    validNonclaims(manifest.nonclaims);
  if (!valid) {
    addException(
      exceptions,
      kind === 'WAVE' ? 'WAVE_HANDOFF_INVALID' : 'TEAM_HANDOFF_INVALID',
      kind,
      { manifestSha256: digest(canonical(manifest)) },
    );
  }
  return valid;
}

function validateDeclaredAggregates(
  manifest: JsonRecord,
  rows: readonly OfferedRow[],
  kind: 'WAVE' | 'TEAM',
  exceptions: TeamReturnException[],
): void {
  const expected = {
    rowAggregateSha256: digest(canonical(rows)),
    rootAggregateSha256: digest(
      canonical(rows.map((row) => ({ lessonId: row.lessonId, rootSha256: row.rootSha256 }))),
    ),
    handoffAggregateSha256: digest(
      canonical(
        rows.map((row) => ({
          lessonHandoffSha256: row.lessonHandoffSha256,
          lessonId: row.lessonId,
        })),
      ),
    ),
  };
  for (const [field, digestValue] of Object.entries(expected)) {
    if (manifest[field] !== undefined && manifest[field] !== digestValue) {
      addException(
        exceptions,
        kind === 'WAVE' ? 'WAVE_HANDOFF_INVALID' : 'TEAM_HANDOFF_INVALID',
        kind,
        { field, offered: manifest[field] },
      );
    }
  }
  if (manifest.statusCounts !== undefined) {
    const statusCounts = {
      BLOCKED: rows.filter((row) => row.status === 'BLOCKED').length,
      COMPLETE: rows.filter((row) => row.status === 'COMPLETE').length,
      FAILED: rows.filter((row) => row.status === 'FAILED').length,
    };
    if (canonical(manifest.statusCounts) !== canonical(statusCounts)) {
      addException(
        exceptions,
        kind === 'WAVE' ? 'WAVE_HANDOFF_INVALID' : 'TEAM_HANDOFF_INVALID',
        kind,
        { field: 'statusCounts', offered: manifest.statusCounts },
      );
    }
  }
}

function resolveOfferedRows(
  candidateRoot: string,
  activeWaveId: string | null,
  teamAuthority: TeamAuthority,
  teamId: TeamId,
  exceptions: TeamReturnException[],
): {
  readonly kind: 'WAVE' | 'FINAL_TEAM';
  readonly id: string;
  readonly rows: readonly OfferedRow[];
  readonly manifestHashes: readonly string[];
} | null {
  const wavesRoot = join(candidateRoot, 'waves');
  if (!directory(wavesRoot)) {
    addException(exceptions, 'WAVE_HANDOFF_MISSING', 'WAVE', { teamId });
    return null;
  }
  const waveNames = readdirSync(wavesRoot)
    .filter((name) => WAVE_NAME.test(name))
    .sort();
  if (waveNames.length === 0) {
    addException(exceptions, 'WAVE_HANDOFF_MISSING', 'WAVE', { teamId });
    return null;
  }
  const manifests: Array<{
    name: string;
    value: JsonRecord;
    rows: OfferedRow[];
    sha256: string;
  }> = [];
  for (const name of waveNames) {
    const path = join(wavesRoot, name);
    const value = readJson(path);
    if (value === null) {
      addException(exceptions, 'WAVE_HANDOFF_INVALID', 'WAVE', { name });
      continue;
    }
    const expectedWaveId = name.replace('-HANDOFF.json', '');
    validateManifestHeader(value, 'WAVE', teamAuthority, teamId, exceptions);
    if (value.waveId !== expectedWaveId || !Array.isArray(value.rows) || value.rows.length === 0) {
      addException(exceptions, 'WAVE_HANDOFF_INVALID', 'WAVE', { name });
    }
    const rows = parseRows(value.rows, 'WAVE', exceptions);
    validateDeclaredAggregates(value, rows, 'WAVE', exceptions);
    manifests.push({
      name,
      rows,
      sha256: digest(readFileSync(path)),
      value,
    });
  }
  if (
    activeWaveId === null ||
    !manifests.some((manifest) => manifest.value.waveId === activeWaveId)
  ) {
    addException(exceptions, 'WAVE_HANDOFF_MISSING', 'WAVE', { activeWaveId });
  }
  const teamPath = join(candidateRoot, 'TEAM-HANDOFF.json');
  const teamManifest = regularFile(teamPath) ? readJson(teamPath) : null;
  if (teamManifest === null) {
    if (waveNames.length !== 1) {
      addException(exceptions, 'WAVE_HANDOFF_INVALID', 'WAVE', {
        reason: 'PARTIAL_REQUIRES_ONE_CLOSED_WAVE',
      });
    }
    const active = manifests.find((manifest) => manifest.value.waveId === activeWaveId);
    return active === undefined
      ? null
      : {
          id: activeWaveId ?? 'UNKNOWN',
          kind: 'WAVE',
          manifestHashes: [active.sha256],
          rows: active.rows,
        };
  }
  validateManifestHeader(teamManifest, 'TEAM', teamAuthority, teamId, exceptions);
  const teamRows = parseRows(teamManifest.rows, 'TEAM', exceptions);
  validateDeclaredAggregates(teamManifest, teamRows, 'TEAM', exceptions);
  if (teamManifest.expectedRowCount !== 30 || teamRows.length !== 30) {
    addException(exceptions, 'TEAM_HANDOFF_INVALID', 'TEAM', {
      expected: 30,
      actual: teamRows.length,
    });
  }
  const waveRows = manifests.flatMap((manifest) => manifest.rows);
  const waveIds = waveRows.map((row) => row.lessonId);
  if (new Set(waveIds).size !== waveIds.length || canonical(waveRows) !== canonical(teamRows)) {
    addException(exceptions, 'TEAM_HANDOFF_INVALID', 'TEAM', {
      reason: 'WAVE_TEAM_CLOSURE',
    });
  }
  return {
    id: 'TEAM',
    kind: 'FINAL_TEAM',
    manifestHashes: [
      ...manifests.map((manifest) => manifest.sha256),
      digest(readFileSync(teamPath)),
    ],
    rows: teamRows,
  };
}

function protectedFindings(value: unknown, findings: string[], path = '$'): void {
  if (value === null || typeof value !== 'object') {
    if (
      typeof value === 'string' &&
      /(?:protected-items\.json|(?:answer|rationale|scoring)[_-](?:authority[_-]?)?ref)/i.test(
        value,
      )
    ) {
      findings.push(`${path}:PROTECTED_VALUE`);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((child, index) => protectedFindings(child, findings, `${path}[${index}]`));
    return;
  }
  for (const [key, child] of Object.entries(value as JsonRecord)) {
    const normalized = key.toLowerCase().replaceAll(/[^a-z0-9]/g, '');
    if (PROTECTED_KEYS.has(normalized)) findings.push(`${path}:${key}`);
    protectedFindings(child, findings, `${path}.${key}`);
  }
}

function officialClaimFound(value: unknown): boolean {
  if (value === null || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.some(officialClaimFound);
  return Object.entries(value as JsonRecord).some(([key, child]) => {
    const normalized = key.toLowerCase().replaceAll(/[^a-z0-9]/g, '');
    return (
      (['humanapproved', 'officialrubricpass', 'publicationapproved'].includes(normalized) &&
        child === true) ||
      officialClaimFound(child)
    );
  });
}

function refsCurrent(candidateRoot: string, refs: unknown): boolean {
  if (!Array.isArray(refs) || refs.length === 0) return false;
  const seen = new Set<string>();
  return refs.every((item) => {
    const ref = record(item);
    if (
      ref === null ||
      !hasExactKeys(ref, ['path', 'sha256']) ||
      !safeRelative(ref.path) ||
      typeof ref.sha256 !== 'string' ||
      !DIGEST.test(ref.sha256) ||
      seen.has(ref.path)
    ) {
      return false;
    }
    seen.add(ref.path);
    const path = confined(candidateRoot, ref.path);
    return regularFile(path) && digest(readFileSync(path)) === ref.sha256;
  });
}

function identityMatches(
  candidateRoot: string,
  identities: unknown,
  paths: readonly string[],
): boolean {
  if (!Array.isArray(identities) || identities.length !== paths.length) return false;
  const offered = new Map<string, JsonRecord>();
  for (const item of identities) {
    const value = record(item);
    if (value === null || typeof value.path !== 'string' || offered.has(value.path)) return false;
    offered.set(value.path, value);
  }
  return paths.every((path) => {
    const value = offered.get(path);
    if (value === undefined || !regularFile(join(candidateRoot, path))) return false;
    const bytes = readFileSync(join(candidateRoot, path));
    const offeredHash = value.sha256 ?? value.file_sha256;
    return (
      offeredHash === digest(bytes) && (value.size === undefined || value.size === bytes.length)
    );
  });
}

function validateLessonEvidence(
  candidateRoot: string,
  offered: OfferedRow,
  teamAuthority: TeamAuthority,
  teamId: TeamId,
  exceptions: TeamReturnException[],
): {
  readonly handoff: JsonRecord | null;
  readonly row: TeamReturnIntakeRow;
  readonly receiptPass: boolean;
  readonly reviewPass: boolean;
} {
  const lessonId = offered.lessonId;
  let layoutValid = true;
  try {
    layoutValid = canonical(listFiles(candidateRoot)) === canonical(LESSON_FILES);
  } catch {
    layoutValid = false;
  }
  if (!layoutValid) {
    addException(exceptions, 'LESSON_LAYOUT_INVALID', 'LESSON', { lessonId });
  }
  const handoffPath = join(candidateRoot, 'LESSON-HANDOFF.json');
  const manifestPath = join(candidateRoot, 'artifact-manifest.json');
  const handoff = readJson(handoffPath);
  const manifest = readJson(manifestPath);
  const actualHandoffSha256 = regularFile(handoffPath) ? digest(readFileSync(handoffPath)) : '';
  const actualRootSha256 = regularFile(manifestPath) ? digest(readFileSync(manifestPath)) : '';
  if (offered.lessonHandoffSha256 !== actualHandoffSha256) {
    addException(exceptions, 'ROW_HANDOFF_HASH_MISMATCH', 'LESSON', { lessonId });
  }
  if (offered.rootSha256 !== actualRootSha256) {
    addException(exceptions, 'ROW_ROOT_HASH_MISMATCH', 'LESSON', { lessonId });
  }
  const assignmentRow = teamAuthority.assignmentRows.find((row) => row.lesson_id === lessonId);
  const packetPath = join(candidateRoot, 'inputs/task-source-packet.json');
  const packetDigest = regularFile(packetPath) ? digest(readFileSync(packetPath)) : '';
  const assignmentPacketDigest =
    typeof assignmentRow?.task_packet_ref === 'string'
      ? assignmentRow.task_packet_ref.match(/#sha256:([0-9a-f]{64})$/)?.[1]
      : undefined;
  const packet = readJson(packetPath);
  const packetIdentity = record(packet?.projection) ?? packet;
  if (
    assignmentPacketDigest === undefined ||
    packetDigest !== assignmentPacketDigest ||
    packetIdentity === null ||
    (packetIdentity.lesson_id ?? packetIdentity.lessonId) !== lessonId ||
    (packetIdentity.assignment_id ?? packetIdentity.assignmentId) !== teamAuthority.assignmentId ||
    (packetIdentity.team_id ?? packetIdentity.teamId) !== teamId
  ) {
    addException(exceptions, 'PACKET_PIN_MISMATCH', 'LESSON', { lessonId });
  }

  const pins = record(teamAuthority.kit.pins);
  const toolVersions = record(handoff?.toolAndSchemaVersions);
  const handoffValid =
    handoff !== null &&
    hasExactKeys(handoff, [
      'artifactHashes',
      'artifactManifestSha256',
      'assignmentId',
      'authorSelfAuditRef',
      'computedQualityRef',
      'format',
      'judgePreScreenRef',
      'lessonId',
      'lifecycle',
      'nonclaims',
      'packetSha256',
      'repositoryCommit',
      'requestedStatus',
      'status',
      'toolAndSchemaVersions',
      'unresolvedBlockerCodes',
      'validationRefs',
    ]) &&
    handoff.format === 'lesson-generation-lesson-handoff/2' &&
    handoff.lessonId === lessonId &&
    handoff.assignmentId === teamAuthority.assignmentId &&
    handoff.repositoryCommit === teamAuthority.kit.repositoryCommit &&
    handoff.packetSha256 === packetDigest &&
    handoff.artifactManifestSha256 === actualRootSha256 &&
    handoff.status === offered.status &&
    ['COMPLETE', 'BLOCKED', 'FAILED'].includes(String(handoff.requestedStatus)) &&
    Array.isArray(handoff.unresolvedBlockerCodes) &&
    handoff.unresolvedBlockerCodes.every(
      (code) => typeof code === 'string' && /^[A-Z][A-Z0-9_]{2,63}$/.test(code),
    ) &&
    validNonclaims(handoff.nonclaims) &&
    toolVersions !== null &&
    hasExactKeys(toolVersions, ['kit', 'schemaSetSha256', 'toolSha256']) &&
    toolVersions.kit === 'lesson-generation-kit-v1/generation-2' &&
    toolVersions.schemaSetSha256 === pins?.schemaSha256 &&
    toolVersions.toolSha256 === teamAuthority.toolSha256;
  if (!handoffValid) addException(exceptions, 'HANDOFF_INVALID', 'LESSON', { lessonId });
  const artifactHashes = record(handoff?.artifactHashes);
  if (
    artifactHashes === null ||
    !HANDOFF_ARTIFACT_FILES.every(
      (path) =>
        regularFile(join(candidateRoot, path)) &&
        artifactHashes[path] === digest(readFileSync(join(candidateRoot, path))),
    ) ||
    Object.keys(artifactHashes).length !== HANDOFF_ARTIFACT_FILES.length
  ) {
    addException(exceptions, 'EVIDENCE_STALE', 'LESSON', {
      lessonId,
      surface: 'ARTIFACT_HASHES',
    });
  }
  const closure = record(manifest?.kit_validation_contract);
  if (
    manifest === null ||
    closure === null ||
    closure.format !== 'lesson-generation-artifact-closure/2' ||
    closure.lessonId !== lessonId ||
    canonical(closure.selfExcluded) !==
      canonical(['artifact-manifest.json', 'LESSON-HANDOFF.json']) ||
    !identityMatches(candidateRoot, manifest.kit_validation_artifacts, HASHED_LESSON_FILES) ||
    !identityMatches(candidateRoot, manifest.evidence_artifacts, [
      'inputs/task-source-packet.json',
      'validation/lesson-validate.json',
      'validation/computed-quality.json',
      'validation/normalization-smoke.json',
      'validation/protected-scan.json',
      'reviews/author-self-audit.json',
      'reviews/judge-pre-screen.json',
    ]) ||
    record(manifest.lesson_binding)?.lesson_id !== lessonId
  ) {
    addException(exceptions, 'EVIDENCE_STALE', 'LESSON', {
      lessonId,
      surface: 'MANIFEST_CLOSURE',
    });
  }
  if (!identityMatches(candidateRoot, manifest?.primary_artifacts, PRIMARY_FILES)) {
    addException(exceptions, 'EVIDENCE_STALE', 'LESSON', {
      lessonId,
      surface: 'PRIMARY_ARTIFACTS',
    });
  }

  const author = readJson(join(candidateRoot, 'reviews/author-self-audit.json'));
  const judge = readJson(join(candidateRoot, 'reviews/judge-pre-screen.json'));
  const primaryIdentity = inventory(candidateRoot, PRIMARY_FILES);
  const findingCodesValid = (value: unknown): value is readonly string[] =>
    Array.isArray(value) &&
    value.every((code) => typeof code === 'string' && /^[A-Z][A-Z0-9_]{2,63}$/.test(code));
  const authorValid =
    author !== null &&
    hasExactKeys(author, [
      'authorRunId',
      'evidenceRefs',
      'findingCodes',
      'format',
      'lessonId',
      'nonclaims',
      'revisionCycle',
      'status',
    ]) &&
    author.format === 'lesson-generation-author-self-audit/2' &&
    author.lessonId === lessonId &&
    typeof author.authorRunId === 'string' &&
    author.authorRunId.length > 0 &&
    Number.isInteger(author.revisionCycle) &&
    (author.revisionCycle as number) >= 0 &&
    (author.revisionCycle as number) <= 2 &&
    ['PASS', 'BLOCKED', 'FAILED'].includes(String(author.status)) &&
    findingCodesValid(author.findingCodes) &&
    validNonclaims(author.nonclaims) &&
    refsCurrent(candidateRoot, author.evidenceRefs);
  if (!authorValid) {
    addException(exceptions, 'EVIDENCE_STALE', 'LESSON', {
      lessonId,
      surface: 'AUTHOR',
    });
  }
  const expectedRubric = pins?.profileSha256;
  const identityCollision =
    author !== null &&
    judge !== null &&
    typeof author.authorRunId === 'string' &&
    judge.reviewerRunId === author.authorRunId;
  const judgeValid =
    judge !== null &&
    hasExactKeys(judge, [
      'authorVerdictReceived',
      'evidenceRefs',
      'findingCodes',
      'format',
      'lessonId',
      'nonclaims',
      'reviewedPrimaryArtifacts',
      'reviewerRole',
      'reviewerRunId',
      'rubricProfileSha256',
      'status',
    ]) &&
    judge.format === 'lesson-generation-judge-pre-screen/2' &&
    judge.lessonId === lessonId &&
    judge.reviewerRole === 'INDEPENDENT_JUDGE' &&
    typeof judge.reviewerRunId === 'string' &&
    judge.reviewerRunId.length > 0 &&
    authorValid &&
    !identityCollision &&
    judge.authorVerdictReceived === false &&
    ['SCREENED', 'BLOCKED', 'FAILED'].includes(String(judge.status)) &&
    findingCodesValid(judge.findingCodes) &&
    validNonclaims(judge.nonclaims) &&
    judge.rubricProfileSha256 === expectedRubric &&
    refsCurrent(candidateRoot, judge.evidenceRefs) &&
    canonical(judge.reviewedPrimaryArtifacts) === canonical(primaryIdentity);
  if (!judgeValid) {
    addException(exceptions, 'JUDGE_EVIDENCE_INVALID', 'LESSON', { lessonId });
  }
  if (identityCollision) {
    addException(exceptions, 'JUDGE_AUTHOR_IDENTITY_COLLISION', 'LESSON', { lessonId });
  }
  const reviewBlockers: string[] = [];
  if (!authorValid) {
    reviewBlockers.push(
      author === null ? 'AUTHOR_SELF_AUDIT_REQUIRED' : 'AUTHOR_SELF_AUDIT_INVALID',
    );
  } else if (author.status !== 'PASS') {
    reviewBlockers.push(`AUTHOR_SELF_AUDIT_${String(author.status)}`);
  }
  if (!judgeValid) {
    reviewBlockers.push(judge === null ? 'JUDGE_PRE_SCREEN_REQUIRED' : 'JUDGE_PRE_SCREEN_INVALID');
  } else if (judge.status !== 'SCREENED' || (judge.findingCodes as unknown[]).length > 0) {
    reviewBlockers.push(`JUDGE_PRE_SCREEN_${String(judge.status)}`);
  }

  const validation = readJson(join(candidateRoot, 'validation/lesson-validate.json'));
  const quality = readJson(join(candidateRoot, 'validation/computed-quality.json'));
  const normalization = readJson(join(candidateRoot, 'validation/normalization-smoke.json'));
  const protectedReceipt = readJson(join(candidateRoot, 'validation/protected-scan.json'));
  const validatorAuthority = record(teamAuthority.kit.validatorAuthority);
  const validatorFiles = Array.isArray(validatorAuthority?.files)
    ? (validatorAuthority.files as unknown[])
    : [];
  const cliMain =
    validatorFiles
      .map(record)
      .find((file) => typeof file?.path === 'string' && file.path.endsWith('/main.ts')) ??
    record(validatorFiles[0]);
  const validationCommand = record(validation?.command);
  const offeredValidationResults = validation?.results;
  const validationResultsPresent = Array.isArray(offeredValidationResults);
  const validationResults: Array<JsonRecord | null> = validationResultsPresent
    ? offeredValidationResults.map(record)
    : [];
  const structuralPass =
    validation?.status === 'PASS' &&
    validationResults.length > 0 &&
    validationResults.every((result) => result?.ok === true);
  const offeredQualityChecks = quality?.checks;
  const qualityChecksPresent = Array.isArray(offeredQualityChecks);
  const qualityChecks: Array<JsonRecord | null> = qualityChecksPresent
    ? offeredQualityChecks.map(record)
    : [];
  const qualityPass =
    quality !== null &&
    ['N/A', 'SCREENED'].includes(String(quality.status)) &&
    qualityChecks.every((check) => check?.status !== 'fail');
  const normalizationInputs = {
    learnerSafeItems: digest(readFileSync(join(candidateRoot, 'learner-safe-items.json'))),
    presentationPlan: digest(readFileSync(join(candidateRoot, 'lesson-presentation-plan.json'))),
    protectedItems: digest(readFileSync(join(candidateRoot, 'protected-items.json'))),
    script: digest(readFileSync(join(candidateRoot, 'lesson-script.json'))),
  };
  const normalizationPass = normalization?.status === 'PASS' && normalization.ok === true;
  const freshProtectedFindings: string[] = [];
  for (const path of [
    'learner-safe-items.json',
    'source-claim-ledger.json',
    'candidate-quality-ledger.json',
  ]) {
    const value = readJson(join(candidateRoot, path));
    if (value !== null) protectedFindings(value, freshProtectedFindings, path);
  }
  const protectedPass =
    protectedReceipt?.status === 'PASS' &&
    freshProtectedFindings.length === 0 &&
    Array.isArray(protectedReceipt.findings) &&
    protectedReceipt.findings.length === 0;
  const mechanicalPass = structuralPass && qualityPass && normalizationPass;
  const receiptIntegrity =
    validation !== null &&
    validation.format === 'lesson-generation-validation/2' &&
    validation.lessonId === lessonId &&
    ['PASS', 'FAILED'].includes(String(validation.status)) &&
    (validation.status === 'FAILED') ===
      (!validationResultsPresent || validationResults.some((result) => result?.ok !== true)) &&
    validationCommand !== null &&
    validationCommand.exitCode === (mechanicalPass ? 0 : 1) &&
    validationCommand.cliMainSha256 === cliMain?.sha256 &&
    validationCommand.validatorAggregateSha256 === validatorAuthority?.aggregateSha256 &&
    canonical(validationCommand.validatorFiles) === canonical(validatorFiles) &&
    canonical(validation.primaryArtifacts) === canonical(primaryIdentity) &&
    validationResults.every((result) => result !== null) &&
    new Set(validationResults.map((result) => result?.rule)).size === 15 &&
    quality !== null &&
    quality.format === 'lesson-generation-computed-quality/2' &&
    quality.lessonId === lessonId &&
    ['N/A', 'SCREENED', 'FAILED'].includes(String(quality.status)) &&
    (quality.status === 'FAILED') ===
      (!qualityChecksPresent || qualityChecks.some((check) => check?.status === 'fail')) &&
    qualityChecks.every((check) => check !== null) &&
    quality.officialRubricPassClaimed === false &&
    quality.sourceArtifactSha256 ===
      digest(readFileSync(join(candidateRoot, 'lesson-script.json'))) &&
    normalization !== null &&
    normalization.format === 'lesson-generation-normalization/2' &&
    normalization.lessonId === lessonId &&
    ['PASS', 'FAILED'].includes(String(normalization.status)) &&
    (normalization.status === 'PASS') === (normalization.ok === true) &&
    normalization.officialRubricPassClaimed === false &&
    canonical(normalization.inputArtifactSha256) === canonical(normalizationInputs) &&
    (!normalizationPass ||
      canonical(normalization.artifactSha256) === canonical(normalizationInputs)) &&
    protectedReceipt !== null &&
    protectedReceipt.format === 'lesson-generation-protected-scan/2' &&
    protectedReceipt.lessonId === lessonId &&
    ['PASS', 'FAILED'].includes(String(protectedReceipt.status)) &&
    Array.isArray(protectedReceipt.findings) &&
    record(protectedReceipt.protectedArtifact)?.sha256 === normalizationInputs.protectedItems;
  const receiptPass =
    receiptIntegrity && structuralPass && qualityPass && normalizationPass && protectedPass;
  if (!receiptIntegrity) {
    addException(exceptions, 'VALIDATION_RECEIPT_INVALID', 'LESSON', { lessonId });
  }

  const protectedLeaks: string[] = [];
  for (const path of PUBLIC_SCAN_FILES) {
    const value = readJson(join(candidateRoot, path));
    if (value !== null) protectedFindings(value, protectedLeaks, path);
  }
  if (protectedLeaks.length > 0) {
    addException(exceptions, 'PROTECTED_BOUNDARY_LEAK', 'LESSON', {
      lessonId,
      findingSha256: digest(canonical(protectedLeaks.sort())),
    });
  }
  for (const path of LESSON_FILES.filter((path) => path !== 'protected-items.json')) {
    const value = readJson(join(candidateRoot, path));
    if (value !== null && officialClaimFound(value)) {
      addException(exceptions, 'OFFICIAL_CLAIM_FORBIDDEN', 'LESSON', { lessonId, path });
    }
  }
  const reviewPass = reviewBlockers.length === 0;
  const derivedBlockerCodes = [
    ...(!structuralPass ? ['STRUCTURAL_VALIDATION_FAILED'] : []),
    ...(!qualityPass ? ['COMPUTED_QUALITY_FAILED'] : []),
    ...(!normalizationPass ? ['NORMALIZATION_FAILED'] : []),
    ...(!protectedPass ? ['PROTECTED_BOUNDARY_FAILED'] : []),
    ...reviewBlockers,
  ];
  const expectedBlockerCodes = [...new Set(derivedBlockerCodes)].sort();
  const blockerCodes = Array.isArray(handoff?.unresolvedBlockerCodes)
    ? handoff.unresolvedBlockerCodes
    : [];
  const requestedStatus = handoff?.requestedStatus;
  const derivedFinalStatus: LessonStatus =
    expectedBlockerCodes.length === 0 && requestedStatus === 'COMPLETE'
      ? 'COMPLETE'
      : requestedStatus === 'FAILED'
        ? 'FAILED'
        : 'BLOCKED';
  if (
    offered.status !== derivedFinalStatus ||
    (offered.status === 'COMPLETE'
      ? handoff?.requestedStatus !== 'COMPLETE' ||
        handoff?.lifecycle !== 'CANDIDATE_RUBRIC_SCREENED' ||
        expectedBlockerCodes.length !== 0 ||
        canonical(blockerCodes) !== canonical(expectedBlockerCodes) ||
        !receiptIntegrity
      : handoff?.lifecycle !== 'CANDIDATE_VALIDATION_BLOCKED' ||
        expectedBlockerCodes.length === 0 ||
        canonical(blockerCodes) !== canonical(expectedBlockerCodes))
  ) {
    addException(exceptions, 'HONESTY_MISMATCH', 'LESSON', { lessonId, status: offered.status });
  }
  const rowCore = {
    lessonHandoffSha256: actualHandoffSha256,
    lessonId,
    rootSha256: actualRootSha256,
    status: offered.status,
  };
  return {
    handoff,
    receiptPass,
    reviewPass,
    row: {
      ...rowCore,
      code:
        offered.status === 'COMPLETE'
          ? 'ACCEPTED_COMPLETE'
          : offered.status === 'BLOCKED'
            ? 'RECORDED_BLOCKED'
            : 'RECORDED_FAILED',
      rowSha256: digest(canonical(rowCore)),
    },
  };
}

export function validateTeamReturnCandidateMechanically(
  lessonRoot: string,
  lessonId: string,
  centralRoot: string,
): CentralMechanicalValidation {
  try {
    const readRootFiles = (): RehashFile[] =>
      readdirSync(lessonRoot)
        .filter(
          (path) =>
            path.endsWith('.json') &&
            path !== 'artifact-manifest.json' &&
            path !== 'LESSON-HANDOFF.json',
        )
        .sort()
        .map((relPath) => ({
          rawText: readFileSync(join(lessonRoot, relPath), 'utf8'),
          relPath,
        }));
    const manifest = JSON.parse(
      readFileSync(join(lessonRoot, 'artifact-manifest.json'), 'utf8'),
    ) as unknown;
    const files: LessonValidationInput['files'] = readRootFiles().map((file) => ({
      json: JSON.parse(file.rawText) as unknown,
      rawBytes: file.rawText,
      relPath: file.relPath,
    }));
    const curriculumPath = join(centralRoot, 'curriculum/v3/v3-lesson-authoring-manifest.json');
    const resolvableIds = regularFile(curriculumPath)
      ? buildResolvableIds(JSON.parse(readFileSync(curriculumPath, 'utf8')) as unknown)
      : null;
    const structuralReport = validateLesson({
      browserEvidence: null,
      files,
      lessonId,
      manifest,
      resolvableIds,
    });
    const script = JSON.parse(
      readFileSync(join(lessonRoot, 'lesson-script.json'), 'utf8'),
    ) as unknown;
    const quality = computeQuality(lessonId, script);
    const compilation = compileCanonicalLesson({
      learnerSafeItems: JSON.parse(
        readFileSync(join(lessonRoot, 'learner-safe-items.json'), 'utf8'),
      ) as unknown,
      presentationPlan: JSON.parse(
        readFileSync(join(lessonRoot, 'lesson-presentation-plan.json'), 'utf8'),
      ) as unknown,
      protectedItems: JSON.parse(
        readFileSync(join(lessonRoot, 'protected-items.json'), 'utf8'),
      ) as unknown,
      script,
    });
    const rehash = planLessonRehash(
      readRootFiles(),
      readFileSync(join(lessonRoot, 'artifact-manifest.json'), 'utf8'),
    );
    const findings: string[] = [];
    for (const path of PUBLIC_SCAN_FILES) {
      const value = readJson(join(lessonRoot, path));
      if (value !== null) protectedFindings(value, findings, path);
    }
    const result = {
      computedQuality: quality.ok ? ('PASS' as const) : ('FAIL' as const),
      normalization:
        compilation.lesson.items.length > 0 && !rehash.changed
          ? ('PASS' as const)
          : ('FAIL' as const),
      protectedBoundary: findings.length === 0 ? ('PASS' as const) : ('FAIL' as const),
      structural: structuralReport.ok ? ('PASS' as const) : ('FAIL' as const),
    };
    return {
      ...result,
      validatorEvidenceSha256: digest(
        canonical({
          result,
          structural: structuralReport.results.map((item) => ({
            ok: item.ok,
            rule: item.rule,
          })),
        }),
      ),
    };
  } catch (error) {
    return {
      computedQuality: 'FAIL',
      normalization: 'FAIL',
      protectedBoundary: 'FAIL',
      structural: 'FAIL',
      validatorEvidenceSha256: digest(error instanceof Error ? error.message : String(error)),
    };
  }
}

function compareStaged(
  finalRoot: string,
  expected: readonly { readonly path: string; readonly sha256: string; readonly size: number }[],
  expectedReceipt?: TeamReturnIntakeResult,
  requireReadOnly = false,
): boolean {
  const lessonsRoot = join(finalRoot, 'lessons');
  if (!directory(lessonsRoot)) return false;
  const rootEntries = readdirSync(finalRoot).sort();
  const expectedRootEntries =
    expectedReceipt === undefined ? ['lessons'] : ['INTAKE-RECEIPT.json', 'lessons'].sort();
  if (canonical(rootEntries) !== canonical(expectedRootEntries)) return false;
  if (
    expectedReceipt !== undefined &&
    (!regularFile(join(finalRoot, 'INTAKE-RECEIPT.json')) ||
      readFileSync(join(finalRoot, 'INTAKE-RECEIPT.json'), 'utf8') !==
        `${canonical(expectedReceipt)}\n`)
  ) {
    return false;
  }
  let files: string[];
  try {
    files = listFiles(lessonsRoot);
  } catch {
    return false;
  }
  if (canonical(files) !== canonical(expected.map((file) => file.path).sort())) return false;
  const contentsMatch = expected.every((file) => {
    const path = join(lessonsRoot, file.path);
    if (!regularFile(path)) return false;
    const bytes = readFileSync(path);
    return bytes.length === file.size && digest(bytes) === file.sha256;
  });
  if (!contentsMatch || !requireReadOnly) return contentsMatch;
  const modesValid = (root: string): boolean => {
    const rootInfo = lstatSync(root);
    if (rootInfo.isSymbolicLink() || !rootInfo.isDirectory() || (rootInfo.mode & 0o777) !== 0o500) {
      return false;
    }
    for (const entry of readdirSync(root, { withFileTypes: true })) {
      const path = join(root, entry.name);
      const info = lstatSync(path);
      if (info.isSymbolicLink()) return false;
      if (info.isDirectory()) {
        if (!modesValid(path)) return false;
      } else if (!info.isFile() || info.nlink !== 1 || (info.mode & 0o777) !== 0o400) {
        return false;
      }
    }
    return true;
  };
  return modesValid(finalRoot);
}

interface VerifiedStagedState {
  readonly completeLessonIds: readonly string[];
  readonly inventory: readonly {
    readonly path: string;
    readonly sha256: string;
    readonly size: number;
  }[];
  readonly receipt: TeamReturnIntakeResult;
  readonly treeSha256: string;
}

function lessonTreeIdentity(
  files: readonly { readonly path: string; readonly sha256: string; readonly size: number }[],
): string {
  const directories = new Set<string>(['.']);
  for (const file of files) {
    let parent = dirname(file.path).split(sep).join('/');
    while (parent !== '.' && parent !== '') {
      directories.add(parent);
      parent = dirname(parent).split(sep).join('/');
    }
  }
  return digest(
    canonical([
      ...[...directories].sort().map((path) => ({ kind: 'DIRECTORY', mode: 0o500, path })),
      ...files.map((file) => ({ ...file, kind: 'FILE', mode: 0o400 })),
    ]),
  );
}

function readOnlyModesValid(root: string): boolean {
  const info = lstatSync(root);
  if (info.isSymbolicLink() || !info.isDirectory() || (info.mode & 0o777) !== 0o500) {
    return false;
  }
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    const child = lstatSync(path);
    if (child.isSymbolicLink()) return false;
    if (child.isDirectory()) {
      if (!readOnlyModesValid(path)) return false;
    } else if (!child.isFile() || child.nlink !== 1 || (child.mode & 0o777) !== 0o400) {
      return false;
    }
  }
  return true;
}

function validReceiptSelfIdentity(receipt: JsonRecord): boolean {
  if (typeof receipt.receiptSha256 !== 'string' || !DIGEST.test(receipt.receiptSha256)) {
    return false;
  }
  const { receiptSha256: _receiptSha256, ...unsigned } = receipt;
  return intakeReceiptIdentity(unsigned) === receipt.receiptSha256;
}

function verifyStagedState(finalRoot: string): VerifiedStagedState | null {
  try {
    if (!directory(finalRoot) || !readOnlyModesValid(finalRoot)) return null;
    const rootEntries = readdirSync(finalRoot).sort();
    const expectedRootEntries = ['INTAKE-RECEIPT.json', 'lessons'].sort();
    if (canonical(rootEntries) !== canonical(expectedRootEntries)) return null;
    const receiptRecord = readJson(join(finalRoot, 'INTAKE-RECEIPT.json'));
    if (
      receiptRecord === null ||
      !validReceiptSelfIdentity(receiptRecord) ||
      !hasExactKeys(receiptRecord, [
        'aggregates',
        'assignmentIdSha256',
        'authority',
        'copy',
        'decision',
        'exceptions',
        'format',
        'mode',
        'receiptSha256',
        'rows',
        'scope',
        'source',
        ...(receiptRecord.supersession === undefined ? [] : ['supersession']),
        'teamId',
      ]) ||
      receiptRecord.format !== 'lesson-generation-team-return-intake/1' ||
      receiptRecord.mode !== 'ACCEPT' ||
      receiptRecord.decision !== 'ACCEPTED' ||
      !TEAM_IDS.includes(receiptRecord.teamId as TeamId) ||
      typeof receiptRecord.assignmentIdSha256 !== 'string' ||
      !DIGEST.test(receiptRecord.assignmentIdSha256) ||
      !Array.isArray(receiptRecord.exceptions) ||
      receiptRecord.exceptions.length !== 0
    ) {
      return null;
    }
    const scope = record(receiptRecord.scope);
    const aggregates = record(receiptRecord.aggregates);
    const copy = record(receiptRecord.copy);
    const authority = record(receiptRecord.authority);
    const source = record(receiptRecord.source);
    if (
      scope === null ||
      !hasExactKeys(scope, ['id', 'kind', 'rowCount']) ||
      typeof scope.id !== 'string' ||
      !['WAVE', 'FINAL_TEAM'].includes(String(scope.kind)) ||
      !Number.isInteger(scope.rowCount) ||
      aggregates === null ||
      !hasExactKeys(aggregates, ['rootSha256', 'rowSha256', 'sourceBatchSha256']) ||
      !DIGEST.test(String(aggregates.rootSha256)) ||
      !DIGEST.test(String(aggregates.rowSha256)) ||
      !DIGEST.test(String(aggregates.sourceBatchSha256)) ||
      copy === null ||
      !hasExactKeys(copy, ['disposition', 'stagedCompleteCount', 'stagingIdentitySha256']) ||
      copy.disposition !== 'STAGED_NEW' ||
      !Number.isInteger(copy.stagedCompleteCount) ||
      !DIGEST.test(String(copy.stagingIdentitySha256)) ||
      authority === null ||
      !hasExactKeys(authority, [
        'finalizationReceiptSha256',
        'generation',
        'kitManifestSha256',
        'pinnedCommit',
        'readySha256',
        'sendMeSha256',
      ]) ||
      !DIGEST.test(String(authority.finalizationReceiptSha256)) ||
      !Number.isInteger(authority.generation) ||
      !DIGEST.test(String(authority.kitManifestSha256)) ||
      !COMMIT.test(String(authority.pinnedCommit)) ||
      !DIGEST.test(String(authority.readySha256)) ||
      !DIGEST.test(String(authority.sendMeSha256)) ||
      source === null ||
      !hasExactKeys(source, ['branch', 'headCommit', 'kind', 'sourceSha256']) ||
      typeof source.branch !== 'string' ||
      source.branch.length === 0 ||
      !COMMIT.test(String(source.headCommit)) ||
      !['CHECKOUT', 'SIGNED_ARCHIVE'].includes(String(source.kind)) ||
      !DIGEST.test(String(source.sourceSha256)) ||
      !Array.isArray(receiptRecord.rows)
    ) {
      return null;
    }
    const rows: TeamReturnIntakeRow[] = [];
    for (const rawRow of receiptRecord.rows) {
      const row = record(rawRow);
      if (
        row === null ||
        !hasExactKeys(row, [
          'code',
          'lessonHandoffSha256',
          'lessonId',
          'rootSha256',
          'rowSha256',
          'status',
        ]) ||
        typeof row.lessonId !== 'string' ||
        !LESSON_ID.test(row.lessonId) ||
        !['COMPLETE', 'BLOCKED', 'FAILED'].includes(String(row.status)) ||
        !DIGEST.test(String(row.lessonHandoffSha256)) ||
        !DIGEST.test(String(row.rootSha256)) ||
        !DIGEST.test(String(row.rowSha256))
      ) {
        return null;
      }
      const rowCore = {
        lessonHandoffSha256: row.lessonHandoffSha256,
        lessonId: row.lessonId,
        rootSha256: row.rootSha256,
        status: row.status,
      };
      const expectedCode =
        row.status === 'COMPLETE'
          ? 'ACCEPTED_COMPLETE'
          : row.status === 'BLOCKED'
            ? 'RECORDED_BLOCKED'
            : 'RECORDED_FAILED';
      if (row.code !== expectedCode || row.rowSha256 !== digest(canonical(rowCore))) return null;
      rows.push(row as unknown as TeamReturnIntakeRow);
    }
    if (
      rows.length !== scope.rowCount ||
      copy.stagedCompleteCount !== rows.filter((row) => row.status === 'COMPLETE').length ||
      new Set(rows.map((row) => row.lessonId)).size !== rows.length
    ) {
      return null;
    }
    const rowCores = rows.map(({ code: _code, rowSha256: _rowSha256, ...row }) => row);
    const rootCores = rows.map((row) => ({
      lessonId: row.lessonId,
      rootSha256: row.rootSha256,
    }));
    if (
      aggregates.rowSha256 !== digest(canonical(rowCores)) ||
      aggregates.rootSha256 !== digest(canonical(rootCores))
    ) {
      return null;
    }
    const completeLessonIds = rows
      .filter((row) => row.status === 'COMPLETE')
      .map((row) => row.lessonId);
    const lessonsRoot = join(finalRoot, 'lessons');
    if (!directory(lessonsRoot)) return null;
    const expectedFiles = completeLessonIds
      .flatMap((lessonId) => LESSON_FILES.map((path) => `${lessonId}/${path}`))
      .sort();
    if (canonical(listFiles(lessonsRoot)) !== canonical(expectedFiles)) return null;
    const stagedInventory = inventory(lessonsRoot, expectedFiles);
    if (aggregates.sourceBatchSha256 !== digest(canonical(stagedInventory))) return null;
    const expectedStagingIdentity = digest(
      canonical({
        scopeId: scope.id,
        sourceBatchSha256: aggregates.sourceBatchSha256,
        teamId: receiptRecord.teamId,
      }),
    );
    if (copy.stagingIdentitySha256 !== expectedStagingIdentity) return null;
    if (receiptRecord.supersession !== undefined) return null;
    return {
      completeLessonIds,
      inventory: stagedInventory,
      receipt: receiptRecord as unknown as TeamReturnIntakeResult,
      treeSha256: lessonTreeIdentity(stagedInventory),
    };
  } catch {
    return null;
  }
}

function stagedStateMatchesReplacement(
  staged: VerifiedStagedState,
  result: TeamReturnIntakeResult,
  expected: readonly { readonly path: string; readonly sha256: string; readonly size: number }[],
): boolean {
  return (
    canonical(staged.inventory) === canonical(expected) &&
    staged.receipt.receiptSha256 === result.receiptSha256 &&
    canonical(staged.receipt) === canonical(result)
  );
}

function supersessionPriorSide(state: VerifiedStagedState): TeamReturnSupersessionBinding['prior'] {
  return {
    copyIdentitySha256: digest(canonical(state.receipt.copy)),
    receiptSha256: state.receipt.receiptSha256,
    rootSha256: state.receipt.aggregates.rootSha256,
    rowSha256: state.receipt.aggregates.rowSha256,
    sourceIdentitySha256: digest(canonical(state.receipt.source)),
    sourceBatchSha256: state.receipt.aggregates.sourceBatchSha256,
    stagingIdentitySha256: state.receipt.copy.stagingIdentitySha256,
    treeSha256: state.treeSha256,
  };
}

function supersessionReplacementSide(
  state: VerifiedStagedState,
): TeamReturnSupersessionBinding['replacement'] {
  const { acceptance: _acceptance, ...logicalCopy } = state.receipt.copy;
  return {
    copyIdentitySha256: digest(canonical(logicalCopy)),
    rootSha256: state.receipt.aggregates.rootSha256,
    rowSha256: state.receipt.aggregates.rowSha256,
    sourceIdentitySha256: digest(canonical(state.receipt.source)),
    sourceBatchSha256: state.receipt.aggregates.sourceBatchSha256,
    stagingIdentitySha256: state.receipt.copy.stagingIdentitySha256,
    treeSha256: state.treeSha256,
  };
}

interface AcceptanceArchiveEntry {
  readonly bytesBase64: string;
  readonly mode: 256;
  readonly path: string;
  readonly sha256: string;
  readonly size: number;
}

interface AcceptanceArtifacts {
  readonly archiveBytes: Buffer;
  readonly handle: Omit<TeamReturnAcceptanceHandle, 'marker'>;
  readonly manifestBytes: Buffer;
  readonly receiptBytes: Buffer;
}

interface AcceptanceObjectDescriptor {
  readonly mode: 256;
  readonly relativePath: string;
  readonly sha256: string;
  readonly size: number;
}

interface AcceptanceArchiveDescriptor extends AcceptanceObjectDescriptor {
  readonly format: 'lesson-generation-team-acceptance-archive/1';
}

interface AcceptanceSourceProof extends TeamReturnCheckoutEvidence {
  readonly changedPathAggregateSha256: string;
  readonly changedPathIdentities: readonly ChangedPathIdentity[];
  readonly priorCommit: string;
  readonly waveTreeAggregateSha256: string;
  readonly waveTreeIdentities: readonly GitTreeFileIdentity[];
}

interface AcceptanceCandidateRootClosure {
  readonly entryCount: number;
  readonly inventorySha256: string;
  readonly pathSha256: string;
}

interface PromotedAdmission {
  readonly lessonId: string;
  readonly mechanical: CentralMechanicalValidation;
  readonly rowSha256: string;
}

function makePromotedAdmissions(
  result: TeamReturnIntakeResult,
  binding: TeamReturnSupersessionBinding,
  candidateRoot: string,
  teamAuthority: TeamAuthority,
  mechanicalAdmissions: ReadonlyMap<string, CentralMechanicalValidation>,
  centralRoot: string,
): readonly PromotedAdmission[] {
  return binding.newlyCompleteLessonIds.map((lessonId) => {
    const row = result.rows.find((candidate) => candidate.lessonId === lessonId);
    if (row === undefined) throw new Error('PROMOTED_ADMISSION_ROW_MISSING');
    const exceptions: TeamReturnException[] = [];
    const validated = validateLessonEvidence(
      join(candidateRoot, lessonId),
      row,
      teamAuthority,
      result.teamId as TeamId,
      exceptions,
    );
    const mechanical = mechanicalAdmissions.get(lessonId);
    const freshMechanical = validateTeamReturnCandidateMechanically(
      join(candidateRoot, lessonId),
      lessonId,
      centralRoot,
    );
    if (
      mechanical === undefined ||
      canonical(mechanical) !== canonical(freshMechanical) ||
      exceptions.length !== 0 ||
      canonical(validated.row) !== canonical(row) ||
      mechanical.structural !== 'PASS' ||
      mechanical.computedQuality !== 'PASS' ||
      mechanical.normalization !== 'PASS' ||
      mechanical.protectedBoundary !== 'PASS' ||
      !DIGEST.test(mechanical.validatorEvidenceSha256)
    ) {
      throw new Error('PROMOTED_ADMISSION_INVALID');
    }
    return { lessonId, mechanical, rowSha256: row.rowSha256 };
  });
}

function acceptanceArchive(
  candidateRoot: string,
  expected: readonly { readonly path: string; readonly sha256: string; readonly size: number }[],
): { readonly bytes: Buffer; readonly closure: AcceptanceCandidateRootClosure } {
  const lessonEntries: AcceptanceArchiveEntry[] = [...expected].map((file) => {
    const bytes = readFileSync(join(candidateRoot, file.path));
    if (bytes.byteLength !== file.size || digest(bytes) !== file.sha256) {
      throw new Error('SOURCE_BYTES_CHANGED');
    }
    return {
      bytesBase64: bytes.toString('base64'),
      mode: 0o400,
      path: `lessons/${file.path}`,
      sha256: file.sha256,
      size: file.size,
    };
  });
  const expectedLessonPaths = new Set(expected.map((file) => file.path));
  const candidatePaths = listFiles(candidateRoot);
  const controlPaths = candidatePaths.filter((path) => !expectedLessonPaths.has(path));
  if (
    canonical(candidatePaths.filter((path) => expectedLessonPaths.has(path))) !==
      canonical([...expectedLessonPaths].sort()) ||
    !controlPaths.includes('TEAM-HANDOFF.json') ||
    controlPaths.filter((path) => /^waves\/[^/]+\.json$/.test(path)).length === 0 ||
    controlPaths.some((path) => path !== 'TEAM-HANDOFF.json' && !/^waves\/[^/]+\.json$/.test(path))
  ) {
    throw new Error('CANDIDATE_ROOT_CLOSURE_INVALID');
  }
  const controlEntries: AcceptanceArchiveEntry[] = controlPaths.map((path) => {
    const bytes = readFileSync(join(candidateRoot, path));
    return {
      bytesBase64: bytes.toString('base64'),
      mode: 0o400,
      path,
      sha256: digest(bytes),
      size: bytes.byteLength,
    };
  });
  const entries = [...lessonEntries, ...controlEntries].sort((left, right) =>
    left.path < right.path ? -1 : left.path > right.path ? 1 : 0,
  );
  const closureInventory = entries.map(({ bytesBase64: _bytesBase64, ...entry }) => ({
    ...entry,
    kind: 'FILE' as const,
  }));
  return {
    bytes: Buffer.from(
      `${canonical({ entries, format: 'lesson-generation-team-acceptance-archive/1' })}\n`,
    ),
    closure: {
      entryCount: entries.length,
      inventorySha256: digest(canonical(closureInventory)),
      pathSha256: digest(canonical(entries.map((entry) => entry.path))),
    },
  };
}

function acceptanceReceiptRecord(
  result: TeamReturnIntakeResult,
  binding: TeamReturnSupersessionBinding,
  archive: AcceptanceArchiveDescriptor,
): JsonRecord {
  return {
    action: binding.action,
    archive,
    format: 'lesson-generation-team-acceptance-receipt/1',
    generationId: binding.generationId,
    intakeReceiptSha256: result.receiptSha256,
    predecessorReceiptSha256: binding.prior.receiptSha256,
    supersession: binding,
  };
}

function acceptanceManifestRecord(
  result: TeamReturnIntakeResult,
  binding: TeamReturnSupersessionBinding,
  archive: AcceptanceArchiveDescriptor,
  acceptanceReceipt: AcceptanceObjectDescriptor,
  sourceProof: AcceptanceSourceProof,
  candidateRootClosure: AcceptanceCandidateRootClosure,
  admissionAuthority: TeamAuthority,
  promotedAdmissions: readonly PromotedAdmission[],
): JsonRecord {
  const { receiptSha256: _receiptSha256, ...base } = result;
  const dryRunProjection = constantResult({
    ...base,
    copy: {
      disposition: 'SUPERSESSION_READY',
      stagedCompleteCount: 0,
      stagingIdentitySha256: result.copy.stagingIdentitySha256,
    },
    mode: 'DRY_RUN',
  });
  return {
    action: binding.action,
    admissionAuthority,
    acceptanceReceipt,
    archive,
    candidateRootClosure,
    format: 'lesson-generation-team-acceptance-manifest/1',
    generationId: binding.generationId,
    intake: result,
    nonclaims: {
      humanApproved: false,
      officialRubricPass: false,
      publicationApproved: false,
    },
    package: {
      assignmentIdSha256: result.assignmentIdSha256,
      authority: result.authority,
      source: result.source,
      sourceBatchSha256: result.aggregates.sourceBatchSha256,
      stagingIdentitySha256: result.copy.stagingIdentitySha256,
    },
    predecessor: binding.prior,
    promotedAdmissions,
    sourceProof,
    statusCounts: {
      BLOCKED: result.rows.filter((row) => row.status === 'BLOCKED').length,
      COMPLETE: result.rows.filter((row) => row.status === 'COMPLETE').length,
      FAILED: result.rows.filter((row) => row.status === 'FAILED').length,
    },
    supersession: binding,
    validation: {
      acceptedIntakeReceiptSha256: result.receiptSha256,
      dryRunIntakeReceiptSha256: dryRunProjection.receiptSha256,
    },
  };
}

function makeAcceptanceArtifacts(
  result: TeamReturnIntakeResult,
  binding: TeamReturnSupersessionBinding,
  candidateRoot: string,
  expected: readonly { readonly path: string; readonly sha256: string; readonly size: number }[],
  sourceProof: TeamReturnCheckoutEvidence,
  changedPathIdentities: readonly ChangedPathIdentity[],
  waveTreeIdentities: readonly GitTreeFileIdentity[],
  priorCommit: string,
  centralRoot: string,
  teamAuthority: TeamAuthority,
  mechanicalAdmissions: ReadonlyMap<string, CentralMechanicalValidation>,
): AcceptanceArtifacts {
  const closedSourceProof: AcceptanceSourceProof = {
    ...sourceProof,
    changedPathAggregateSha256: digest(canonical(changedPathIdentities)),
    changedPathIdentities,
    priorCommit,
    waveTreeAggregateSha256: digest(canonical(waveTreeIdentities)),
    waveTreeIdentities,
  };
  const promotedAdmissions = makePromotedAdmissions(
    result,
    binding,
    candidateRoot,
    teamAuthority,
    mechanicalAdmissions,
    centralRoot,
  );
  const acceptanceArchiveResult = acceptanceArchive(candidateRoot, expected);
  const archiveBytes = acceptanceArchiveResult.bytes;
  const archiveSha256 = digest(archiveBytes);
  const archive = {
    format: 'lesson-generation-team-acceptance-archive/1' as const,
    mode: 0o400 as const,
    relativePath: acceptanceObjectRelativePath('archive', archiveSha256),
    sha256: archiveSha256,
    size: archiveBytes.byteLength,
  };
  const receiptBytes = Buffer.from(
    `${canonical(acceptanceReceiptRecord(result, binding, archive))}\n`,
  );
  const receiptSha256 = digest(receiptBytes);
  const acceptanceReceipt = {
    mode: 0o400 as const,
    relativePath: acceptanceObjectRelativePath('receipt', receiptSha256),
    sha256: receiptSha256,
    size: receiptBytes.byteLength,
  };
  const manifestBytes = Buffer.from(
    `${canonical(
      acceptanceManifestRecord(
        result,
        binding,
        archive,
        acceptanceReceipt,
        closedSourceProof,
        acceptanceArchiveResult.closure,
        teamAuthority,
        promotedAdmissions,
      ),
    )}\n`,
  );
  const manifestSha256 = digest(manifestBytes);
  return {
    archiveBytes,
    handle: {
      archiveSha256,
      generationId: binding.generationId,
      manifestSha256,
      markerRelativePath: binding.acceptanceMarkerRelativePath,
      receiptSha256,
      sourceCommit: result.source.headCommit,
      sourceTreeSha256: binding.replacement.treeSha256,
    },
    manifestBytes,
    receiptBytes,
  };
}

interface ParsedAcceptanceArchive {
  readonly candidateInventory: readonly {
    readonly kind: 'FILE';
    readonly mode: 256;
    readonly path: string;
    readonly sha256: string;
    readonly size: number;
  }[];
  readonly files: ReadonlyMap<string, Buffer>;
  readonly inventory: readonly {
    readonly path: string;
    readonly sha256: string;
    readonly size: number;
  }[];
  readonly treeSha256: string;
}

function parseAcceptanceArchive(bytes: Buffer): ParsedAcceptanceArchive | null {
  if (bytes.byteLength > MAX_ARCHIVE_TOTAL_EXPANDED_BYTES) return null;
  let parsed: JsonRecord | null;
  try {
    parsed = record(JSON.parse(bytes.toString('utf8')));
  } catch {
    return null;
  }
  if (
    parsed === null ||
    !hasExactKeys(parsed, ['entries', 'format']) ||
    parsed.format !== 'lesson-generation-team-acceptance-archive/1' ||
    !Array.isArray(parsed.entries) ||
    parsed.entries.length < 30 * LESSON_FILES.length + 2
  ) {
    return null;
  }
  const inventory: { path: string; sha256: string; size: number }[] = [];
  const files = new Map<string, Buffer>();
  const candidateInventory: Array<{
    kind: 'FILE';
    mode: 256;
    path: string;
    sha256: string;
    size: number;
  }> = [];
  let expandedBytes = 0;
  for (const raw of parsed.entries) {
    const entry = record(raw);
    const entryPath = String(entry?.path);
    if (
      entry === null ||
      !hasExactKeys(entry, ['bytesBase64', 'mode', 'path', 'sha256', 'size']) ||
      entry.mode !== 0o400 ||
      typeof entry?.path !== 'string' ||
      !(
        /^lessons\/V3-LES-[0-9]{6}\/.+/.test(entryPath) ||
        entryPath === 'TEAM-HANDOFF.json' ||
        /^waves\/[^/]+\.json$/.test(entryPath)
      ) ||
      entryPath.includes('..') ||
      entryPath.includes('\\') ||
      (/^lessons\//.test(entryPath) &&
        !LESSON_FILES.some((path) => entryPath.endsWith(`/${path}`))) ||
      typeof entry.bytesBase64 !== 'string' ||
      !DIGEST.test(String(entry.sha256)) ||
      !Number.isSafeInteger(entry.size) ||
      Number(entry.size) < 0
    ) {
      return null;
    }
    const data = Buffer.from(entry.bytesBase64, 'base64');
    expandedBytes += data.byteLength;
    if (
      expandedBytes > MAX_ARCHIVE_TOTAL_EXPANDED_BYTES ||
      data.byteLength > MAX_ARCHIVE_ENTRY_EXPANDED_BYTES ||
      data.toString('base64') !== entry.bytesBase64 ||
      data.byteLength !== entry.size ||
      digest(data) !== entry.sha256
    ) {
      return null;
    }
    candidateInventory.push({
      kind: 'FILE',
      mode: 0o400,
      path: entryPath,
      sha256: String(entry.sha256),
      size: Number(entry.size),
    });
    if (entryPath.startsWith('lessons/')) {
      inventory.push({
        path: entryPath.slice('lessons/'.length),
        sha256: String(entry.sha256),
        size: Number(entry.size),
      });
      files.set(entryPath.slice('lessons/'.length), data);
    } else {
      files.set(entryPath, data);
    }
  }
  if (
    canonical(inventory.map((entry) => entry.path)) !==
      canonical([...inventory.map((entry) => entry.path)].sort()) ||
    new Set(inventory.map((entry) => entry.path)).size !== inventory.length ||
    canonical(candidateInventory.map((entry) => entry.path)) !==
      canonical([...candidateInventory.map((entry) => entry.path)].sort()) ||
    new Set(candidateInventory.map((entry) => entry.path)).size !== candidateInventory.length
  ) {
    return null;
  }
  return { candidateInventory, files, inventory, treeSha256: lessonTreeIdentity(inventory) };
}

function parseAcceptanceObjectDescriptor(
  value: unknown,
  kind: 'archive' | 'receipt',
): (AcceptanceObjectDescriptor & { readonly format?: string }) | null {
  const descriptor = record(value);
  const keys =
    kind === 'archive'
      ? ['format', 'mode', 'relativePath', 'sha256', 'size']
      : ['mode', 'relativePath', 'sha256', 'size'];
  if (
    descriptor === null ||
    !hasExactKeys(descriptor, keys) ||
    (kind === 'archive' && descriptor.format !== 'lesson-generation-team-acceptance-archive/1') ||
    descriptor.mode !== 0o400 ||
    !DIGEST.test(String(descriptor.sha256)) ||
    descriptor.relativePath !== acceptanceObjectRelativePath(kind, String(descriptor.sha256)) ||
    !Number.isSafeInteger(descriptor.size) ||
    Number(descriptor.size) < 0
  ) {
    return null;
  }
  return descriptor as unknown as AcceptanceObjectDescriptor & { readonly format?: string };
}

function acceptanceIntakeSchemaValid(
  receipt: TeamReturnIntakeResult,
  binding: TeamReturnSupersessionBinding,
  archive: ParsedAcceptanceArchive,
): boolean {
  const value = receipt as unknown as JsonRecord;
  if (
    !hasExactKeys(value, [
      'aggregates',
      'assignmentIdSha256',
      'authority',
      'copy',
      'decision',
      'exceptions',
      'format',
      'mode',
      'receiptSha256',
      'rows',
      'scope',
      'source',
      'supersession',
      'teamId',
    ]) ||
    receipt.format !== 'lesson-generation-team-return-intake/1' ||
    receipt.mode !== 'ACCEPT' ||
    receipt.decision !== 'ACCEPTED' ||
    receipt.teamId === null ||
    !TEAM_IDS.includes(receipt.teamId) ||
    !DIGEST.test(receipt.assignmentIdSha256) ||
    receipt.exceptions.length !== 0 ||
    !hasExactKeys(receipt.authority as unknown as JsonRecord, [
      'finalizationReceiptSha256',
      'generation',
      'kitManifestSha256',
      'pinnedCommit',
      'readySha256',
      'sendMeSha256',
    ]) ||
    !Number.isInteger(receipt.authority.generation) ||
    !DIGEST.test(receipt.authority.finalizationReceiptSha256) ||
    !DIGEST.test(receipt.authority.kitManifestSha256) ||
    !COMMIT.test(receipt.authority.pinnedCommit) ||
    !DIGEST.test(receipt.authority.readySha256) ||
    !DIGEST.test(receipt.authority.sendMeSha256) ||
    !hasExactKeys(receipt.source as unknown as JsonRecord, [
      'branch',
      'headCommit',
      'kind',
      'sourceSha256',
    ]) ||
    !new RegExp(`^lesson-factory/${receipt.teamId}/wave-[0-9]{2}$`).test(receipt.source.branch) ||
    !COMMIT.test(receipt.source.headCommit) ||
    !['CHECKOUT', 'SIGNED_ARCHIVE'].includes(receipt.source.kind) ||
    !DIGEST.test(receipt.source.sourceSha256) ||
    !hasExactKeys(receipt.scope as unknown as JsonRecord, ['id', 'kind', 'rowCount']) ||
    receipt.scope.id !== 'TEAM' ||
    receipt.scope.kind !== 'FINAL_TEAM' ||
    receipt.scope.rowCount !== 30 ||
    !hasExactKeys(receipt.aggregates as unknown as JsonRecord, [
      'rootSha256',
      'rowSha256',
      'sourceBatchSha256',
    ]) ||
    !DIGEST.test(receipt.aggregates.rootSha256) ||
    !DIGEST.test(receipt.aggregates.rowSha256) ||
    !DIGEST.test(receipt.aggregates.sourceBatchSha256) ||
    !hasExactKeys(receipt.copy as unknown as JsonRecord, [
      'disposition',
      'stagedCompleteCount',
      'stagingIdentitySha256',
    ]) ||
    receipt.copy.disposition !== 'SUPERSESSION_COMMITTED' ||
    receipt.copy.stagedCompleteCount !== 30 ||
    !DIGEST.test(receipt.copy.stagingIdentitySha256) ||
    canonical(receipt.supersession) !== canonical(binding) ||
    receipt.rows.length !== 30
  ) {
    return false;
  }
  const lessonIds = new Set<string>();
  for (const row of receipt.rows) {
    if (
      !hasExactKeys(row as unknown as JsonRecord, [
        'code',
        'lessonHandoffSha256',
        'lessonId',
        'rootSha256',
        'rowSha256',
        'status',
      ]) ||
      row.code !== 'ACCEPTED_COMPLETE' ||
      row.status !== 'COMPLETE' ||
      !LESSON_ID.test(row.lessonId) ||
      lessonIds.has(row.lessonId) ||
      !DIGEST.test(row.lessonHandoffSha256) ||
      !DIGEST.test(row.rootSha256) ||
      !DIGEST.test(row.rowSha256)
    ) {
      return false;
    }
    lessonIds.add(row.lessonId);
    const rowCore = {
      lessonHandoffSha256: row.lessonHandoffSha256,
      lessonId: row.lessonId,
      rootSha256: row.rootSha256,
      status: row.status,
    };
    const handoffBytes = archive.files.get(`${row.lessonId}/LESSON-HANDOFF.json`);
    const manifestBytes = archive.files.get(`${row.lessonId}/artifact-manifest.json`);
    if (
      handoffBytes === undefined ||
      manifestBytes === undefined ||
      digest(handoffBytes) !== row.lessonHandoffSha256 ||
      digest(manifestBytes) !== row.rootSha256 ||
      digest(canonical(rowCore)) !== row.rowSha256
    ) {
      return false;
    }
    let handoff: JsonRecord | null;
    let artifactManifest: JsonRecord | null;
    try {
      handoff = record(JSON.parse(handoffBytes.toString('utf8')));
      artifactManifest = record(JSON.parse(manifestBytes.toString('utf8')));
    } catch {
      return false;
    }
    if (
      handoff === null ||
      artifactManifest === null ||
      !hasExactKeys(handoff, [
        'artifactHashes',
        'artifactManifestSha256',
        'assignmentId',
        'authorSelfAuditRef',
        'computedQualityRef',
        'format',
        'judgePreScreenRef',
        'lessonId',
        'lifecycle',
        'nonclaims',
        'packetSha256',
        'repositoryCommit',
        'requestedStatus',
        'status',
        'toolAndSchemaVersions',
        'unresolvedBlockerCodes',
        'validationRefs',
      ]) ||
      handoff.format !== 'lesson-generation-lesson-handoff/2' ||
      handoff.lessonId !== row.lessonId ||
      handoff.repositoryCommit !== receipt.authority.pinnedCommit ||
      handoff.artifactManifestSha256 !== row.rootSha256 ||
      handoff.status !== 'COMPLETE' ||
      handoff.requestedStatus !== 'COMPLETE' ||
      handoff.lifecycle !== 'CANDIDATE_RUBRIC_SCREENED' ||
      canonical(handoff.unresolvedBlockerCodes) !== canonical([]) ||
      !validNonclaims(handoff.nonclaims)
    ) {
      return false;
    }
    for (const path of LESSON_FILES.filter((path) => path !== 'protected-items.json')) {
      const bytes = archive.files.get(`${row.lessonId}/${path}`);
      if (bytes === undefined) return false;
      try {
        const parsed = JSON.parse(bytes.toString('utf8')) as unknown;
        if (officialClaimFound(parsed)) return false;
      } catch {
        return false;
      }
    }
  }
  const rowCores = receipt.rows.map(({ code: _code, rowSha256: _rowSha256, ...row }) => row);
  const rootCores = receipt.rows.map((row) => ({
    lessonId: row.lessonId,
    rootSha256: row.rootSha256,
  }));
  return (
    digest(canonical(rowCores)) === receipt.aggregates.rowSha256 &&
    digest(canonical(rootCores)) === receipt.aggregates.rootSha256 &&
    digest(canonical(archive.inventory)) === receipt.aggregates.sourceBatchSha256 &&
    receipt.copy.stagingIdentitySha256 ===
      digest(
        canonical({
          scopeId: receipt.scope.id,
          sourceBatchSha256: receipt.aggregates.sourceBatchSha256,
          teamId: receipt.teamId,
        }),
      )
  );
}

function promotedAdmissionsValid(
  receipt: TeamReturnIntakeResult,
  binding: TeamReturnSupersessionBinding,
  archive: ParsedAcceptanceArchive,
  authority: TeamAuthority,
  value: unknown,
  centralRoot: string,
): boolean {
  if (!Array.isArray(value) || value.length !== binding.newlyCompleteLessonIds.length) return false;
  const admissions = new Map<string, PromotedAdmission>();
  for (const raw of value) {
    const admission = record(raw);
    const mechanical = record(admission?.mechanical);
    if (
      admission === null ||
      mechanical === null ||
      !hasExactKeys(admission, ['lessonId', 'mechanical', 'rowSha256']) ||
      !hasExactKeys(mechanical, [
        'computedQuality',
        'normalization',
        'protectedBoundary',
        'structural',
        'validatorEvidenceSha256',
      ]) ||
      typeof admission.lessonId !== 'string' ||
      admissions.has(admission.lessonId) ||
      !DIGEST.test(String(admission.rowSha256)) ||
      mechanical.structural !== 'PASS' ||
      mechanical.computedQuality !== 'PASS' ||
      mechanical.normalization !== 'PASS' ||
      mechanical.protectedBoundary !== 'PASS' ||
      !DIGEST.test(String(mechanical.validatorEvidenceSha256))
    ) {
      return false;
    }
    admissions.set(admission.lessonId, admission as unknown as PromotedAdmission);
  }
  const work = mkdtempSync(join(tmpdir(), 'mcat-promoted-admission-'));
  try {
    for (const entry of archive.candidateInventory) {
      const sourceKey = entry.path.startsWith('lessons/')
        ? entry.path.slice('lessons/'.length)
        : entry.path;
      const bytes = archive.files.get(sourceKey);
      if (bytes === undefined) return false;
      const destination = confined(
        work,
        entry.path.startsWith('lessons/') ? entry.path.slice('lessons/'.length) : entry.path,
      );
      mkdirSync(dirname(destination), { recursive: true, mode: 0o700 });
      writeFileSync(destination, bytes, { flag: 'wx', mode: 0o600 });
    }
    const waveFiles = archive.candidateInventory
      .map((entry) => entry.path)
      .filter((path) => /^waves\/[^/]+-HANDOFF\.json$/.test(path));
    if (waveFiles.length !== 1) return false;
    const handoffExceptions: TeamReturnException[] = [];
    const offered = resolveOfferedRows(
      work,
      basename(waveFiles[0] as string, '-HANDOFF.json'),
      authority,
      receipt.teamId as TeamId,
      handoffExceptions,
    );
    const receiptRows = receipt.rows.map(({ code: _code, rowSha256: _rowSha256, ...row }) => row);
    if (
      offered === null ||
      offered.kind !== 'FINAL_TEAM' ||
      offered.id !== 'TEAM' ||
      handoffExceptions.length !== 0 ||
      canonical(offered.rows) !== canonical(receiptRows)
    ) {
      return false;
    }
    for (const lessonId of binding.newlyCompleteLessonIds) {
      const admission = admissions.get(lessonId);
      const row = receipt.rows.find((candidate) => candidate.lessonId === lessonId);
      if (admission === undefined || row === undefined || admission.rowSha256 !== row.rowSha256) {
        return false;
      }
      const lessonRoot = join(work, lessonId);
      const exceptions: TeamReturnException[] = [];
      const validated = validateLessonEvidence(
        lessonRoot,
        row,
        authority,
        receipt.teamId as TeamId,
        exceptions,
      );
      const freshMechanical = validateTeamReturnCandidateMechanically(
        lessonRoot,
        lessonId,
        centralRoot,
      );
      if (
        exceptions.length !== 0 ||
        canonical(validated.row) !== canonical(row) ||
        canonical(freshMechanical) !== canonical(admission.mechanical) ||
        freshMechanical.structural !== 'PASS' ||
        freshMechanical.computedQuality !== 'PASS' ||
        freshMechanical.normalization !== 'PASS' ||
        freshMechanical.protectedBoundary !== 'PASS'
      ) {
        return false;
      }
    }
    return admissions.size === binding.newlyCompleteLessonIds.length;
  } finally {
    rmSync(work, { force: true, recursive: true });
  }
}

function sourceProofArchiveIdentityValid(
  value: JsonRecord,
  archive: ParsedAcceptanceArchive,
  teamId: string,
): boolean {
  if (!Array.isArray(value.changedPathIdentities)) return false;
  const prefix = `content/lesson-candidates/${teamId}/`;
  const archived = new Set<string>();
  for (const raw of value.changedPathIdentities) {
    const identity = record(raw);
    if (
      identity === null ||
      typeof identity.path !== 'string' ||
      !identity.path.startsWith(prefix)
    ) {
      return false;
    }
    const relativePath = identity.path.slice(prefix.length);
    const bytes = archive.files.get(relativePath);
    if (
      bytes === undefined ||
      identity.sha256 !== digest(bytes) ||
      identity.size !== bytes.byteLength ||
      identity.gitMode !== '100644' ||
      identity.gitBlobSha1 !==
        createHash('sha1').update(`blob ${bytes.byteLength}\0`).update(bytes).digest('hex')
    ) {
      return false;
    }
    archived.add(relativePath);
  }
  return archived.size === value.changedPathIdentities.length;
}

function sourceProofGitClosureValid(
  sourceProof: JsonRecord,
  centralRoot: string,
  teamId: TeamId,
  promotedLessonIds: readonly string[],
): boolean {
  try {
    const priorCommit = String(sourceProof.priorCommit);
    const headCommit = String(sourceProof.headCommit);
    if (!COMMIT.test(priorCommit) || !COMMIT.test(headCommit)) return false;
    const ancestry = spawnSync(
      GIT_EXECUTABLE,
      ['-C', centralRoot, 'merge-base', '--is-ancestor', priorCommit, headCommit],
      { shell: false, stdio: 'ignore' },
    );
    if (ancestry.status !== 0) return false;
    const paths = gitOutput(centralRoot, ['diff', '--name-only', priorCommit, headCommit, '--'])
      .split('\n')
      .filter(Boolean)
      .sort();
    if (canonical(paths) !== canonical(sourceProof.changedPaths)) return false;
    const trustedWaveTree = reviewedWaveTreeIdentities(centralRoot, undefined, headCommit, teamId);
    if (
      canonical(trustedWaveTree) !== canonical(sourceProof.waveTreeIdentities) ||
      digest(canonical(trustedWaveTree)) !== sourceProof.waveTreeAggregateSha256
    ) {
      return false;
    }
    const identities = sourceProof.changedPathIdentities as unknown[];
    if (!Array.isArray(identities) || identities.length !== paths.length) return false;
    const prefix = `content/lesson-candidates/${teamId}/`;
    const promoted = new Set(promotedLessonIds);
    const observed = new Set<string>();
    let teamHandoff = false;
    let waveHandoff = false;
    for (const [index, path] of paths.entries()) {
      const relativePath = path.startsWith(prefix) ? path.slice(prefix.length) : '';
      const lesson = /^(V3-LES-[0-9]{6})\//.exec(relativePath)?.[1];
      if (lesson !== undefined) {
        if (!promoted.has(lesson)) return false;
        observed.add(lesson);
      } else if (relativePath === 'TEAM-HANDOFF.json') {
        teamHandoff = true;
      } else if (/^waves\/[^/]+\.json$/.test(relativePath)) {
        waveHandoff = true;
      } else {
        return false;
      }
      const tree = gitOutput(centralRoot, ['ls-tree', headCommit, '--', path]);
      const match = /^(100644|100755) blob ([0-9a-f]{40})\t(.+)$/.exec(tree);
      const identity = record(identities[index]);
      if (match === null || match[3] !== path || identity === null) return false;
      const bytes = gitBytes(
        centralRoot,
        ['cat-file', 'blob', match[2] as string],
        MAX_ARCHIVE_ENTRY_EXPANDED_BYTES,
      );
      if (
        canonical(identity) !==
        canonical({
          gitBlobSha1: match[2],
          gitMode: match[1],
          path,
          sha256: digest(bytes),
          size: bytes.byteLength,
        })
      ) {
        return false;
      }
    }
    return (
      teamHandoff &&
      waveHandoff &&
      canonical([...observed].sort()) === canonical([...promoted].sort())
    );
  } catch {
    return false;
  }
}

function sourceProofWaveArchiveValid(
  sourceProof: JsonRecord,
  archive: ParsedAcceptanceArchive,
  teamId: TeamId,
): boolean {
  if (!Array.isArray(sourceProof.waveTreeIdentities)) return false;
  const prefix = `content/lesson-candidates/${teamId}/`;
  const expected = (sourceProof.waveTreeIdentities as unknown[]).map((raw) => {
    const identity = record(raw);
    if (
      identity === null ||
      typeof identity.path !== 'string' ||
      !identity.path.startsWith(`${prefix}waves/`)
    ) {
      return null;
    }
    return {
      kind: 'FILE',
      mode: 0o400,
      path: identity.path.slice(prefix.length),
      sha256: identity.sha256,
      size: identity.size,
    };
  });
  if (expected.some((identity) => identity === null)) return false;
  const archivedWaves = archive.candidateInventory.filter((identity) =>
    identity.path.startsWith('waves/'),
  );
  return canonical(expected) === canonical(archivedWaves);
}

interface LoadedAcceptanceState {
  readonly archive: ParsedAcceptanceArchive;
  readonly binding: TeamReturnSupersessionBinding;
  readonly objects: {
    readonly archive: AcceptanceObjectIdentity;
    readonly manifest: AcceptanceObjectIdentity;
    readonly receipt: AcceptanceObjectIdentity;
  };
  readonly state: VerifiedStagedState;
  readonly sourceProof: AcceptanceSourceProof;
}

function centralRootFromTeamRoot(teamRoot: string): string {
  let root = teamRoot;
  for (let index = 0; index < TEAM_RETURN_STAGING_RELATIVE_ROOT.split('/').length + 1; index += 1) {
    root = dirname(root);
  }
  return root;
}

function loadAcceptanceState(
  teamRoot: string,
  manifestSha256: string,
  expectedObjects?: TeamReturnAcceptanceHandle['objects'],
  trustedAuthority?: {
    readonly centralRoot: string;
    readonly gitRoot?: string;
    readonly teamAuthority: TeamAuthority;
  },
): LoadedAcceptanceState | null {
  try {
    const manifestObject = readImmutableObject(
      teamRoot,
      'manifest',
      manifestSha256,
      digest,
      expectedObjects?.manifest,
    );
    const manifestBytes = manifestObject.bytes;
    let manifest: JsonRecord | null;
    try {
      manifest = record(JSON.parse(manifestBytes.toString('utf8')));
    } catch {
      return null;
    }
    if (
      manifest === null ||
      !hasExactKeys(manifest, [
        'acceptanceReceipt',
        'admissionAuthority',
        'action',
        'archive',
        'candidateRootClosure',
        'format',
        'generationId',
        'intake',
        'nonclaims',
        'package',
        'predecessor',
        'promotedAdmissions',
        'sourceProof',
        'statusCounts',
        'supersession',
        'validation',
      ]) ||
      manifest.format !== 'lesson-generation-team-acceptance-manifest/1'
    ) {
      return null;
    }
    const intake = record(manifest.intake);
    const archive = record(manifest.archive);
    const candidateRootClosure = record(manifest.candidateRootClosure);
    const sourceProof = record(manifest.sourceProof);
    const intakeSource = record(intake?.source);
    const admissionAuthority = record(manifest.admissionAuthority);
    const archiveDescriptor = parseAcceptanceObjectDescriptor(archive, 'archive');
    const receiptDescriptor = parseAcceptanceObjectDescriptor(
      manifest.acceptanceReceipt,
      'receipt',
    );
    if (
      intake === null ||
      intakeSource === null ||
      admissionAuthority === null ||
      candidateRootClosure === null ||
      !hasExactKeys(candidateRootClosure, ['entryCount', 'inventorySha256', 'pathSha256']) ||
      !Number.isSafeInteger(candidateRootClosure.entryCount) ||
      Number(candidateRootClosure.entryCount) < 30 * LESSON_FILES.length + 2 ||
      !DIGEST.test(String(candidateRootClosure.inventorySha256)) ||
      !DIGEST.test(String(candidateRootClosure.pathSha256)) ||
      !hasExactKeys(admissionAuthority, [
        'assignment',
        'assignmentId',
        'assignmentRows',
        'kit',
        'kitSha256',
        'readySha256',
        'sendMeSha256',
        'team',
        'toolSha256',
      ]) ||
      typeof admissionAuthority.assignmentId !== 'string' ||
      digest(admissionAuthority.assignmentId) !== intake.assignmentIdSha256 ||
      !Array.isArray(admissionAuthority.assignmentRows) ||
      record(admissionAuthority.assignment) === null ||
      record(admissionAuthority.kit) === null ||
      record(admissionAuthority.team) === null ||
      admissionAuthority.kitSha256 !== record(intake.authority)?.kitManifestSha256 ||
      admissionAuthority.readySha256 !== record(intake.authority)?.readySha256 ||
      admissionAuthority.sendMeSha256 !== record(intake.authority)?.sendMeSha256 ||
      !DIGEST.test(String(admissionAuthority.toolSha256)) ||
      !validReceiptSelfIdentity(intake) ||
      sourceProof === null ||
      !hasExactKeys(sourceProof, [
        'branch',
        'changedPathAggregateSha256',
        'changedPathIdentities',
        'changedPaths',
        'clean',
        'headCommit',
        'pinnedAncestor',
        'priorCommit',
        'waveTreeAggregateSha256',
        'waveTreeIdentities',
      ]) ||
      typeof sourceProof.branch !== 'string' ||
      sourceProof.branch !== intakeSource.branch ||
      !Array.isArray(sourceProof.changedPaths) ||
      !Array.isArray(sourceProof.changedPathIdentities) ||
      sourceProof.changedPaths.length > MAX_CHECKOUT_SNAPSHOT_ENTRIES ||
      sourceProof.changedPaths.some((path) => typeof path !== 'string') ||
      sourceProof.changedPaths.some(
        (path) =>
          typeof path !== 'string' ||
          !safeRelative(path) ||
          path.normalize('NFC') !== path ||
          !/^[A-Za-z0-9._/-]+$/.test(path) ||
          Buffer.byteLength(path, 'utf8') > MAX_CHECKOUT_SNAPSHOT_SINGLE_PATH_BYTES,
      ) ||
      new Set(sourceProof.changedPaths as string[]).size !== sourceProof.changedPaths.length ||
      (sourceProof.changedPaths as string[]).reduce(
        (total, path) => total + Buffer.byteLength(path, 'utf8'),
        0,
      ) > MAX_CHECKOUT_SNAPSHOT_PATH_BYTES ||
      canonical(sourceProof.changedPaths) !==
        canonical([...(sourceProof.changedPaths as string[])].sort()) ||
      sourceProof.changedPathIdentities.length !== sourceProof.changedPaths.length ||
      (sourceProof.changedPathIdentities as unknown[]).some((raw, index) => {
        const identity = record(raw);
        return (
          identity === null ||
          !hasExactKeys(identity, ['gitBlobSha1', 'gitMode', 'path', 'sha256', 'size']) ||
          identity.path !== (sourceProof.changedPaths as string[])[index] ||
          !/^[0-9a-f]{40}$/.test(String(identity.gitBlobSha1)) ||
          !['100644', '100755'].includes(String(identity.gitMode)) ||
          !DIGEST.test(String(identity.sha256)) ||
          !Number.isSafeInteger(identity.size) ||
          Number(identity.size) < 0
        );
      }) ||
      sourceProof.changedPathAggregateSha256 !==
        digest(canonical(sourceProof.changedPathIdentities)) ||
      !Array.isArray(sourceProof.waveTreeIdentities) ||
      sourceProof.waveTreeIdentities.length === 0 ||
      sourceProof.waveTreeIdentities.length > MAX_CHECKOUT_SNAPSHOT_ENTRIES ||
      (sourceProof.waveTreeIdentities as unknown[]).some((raw) => {
        const identity = record(raw);
        return (
          identity === null ||
          !hasExactKeys(identity, [
            'gitBlobSha1',
            'gitMode',
            'gitType',
            'path',
            'sha256',
            'size',
          ]) ||
          !/^[0-9a-f]{40}$/.test(String(identity.gitBlobSha1)) ||
          !['100644', '100755'].includes(String(identity.gitMode)) ||
          identity.gitType !== 'blob' ||
          typeof identity.path !== 'string' ||
          !/^content\/lesson-candidates\/team-[AB]\/waves\/[^/]+\.json$/.test(identity.path) ||
          !DIGEST.test(String(identity.sha256)) ||
          !Number.isSafeInteger(identity.size) ||
          Number(identity.size) < 0
        );
      }) ||
      new Set(
        (sourceProof.waveTreeIdentities as Array<{ readonly path: string }>).map(
          (identity) => identity.path,
        ),
      ).size !== sourceProof.waveTreeIdentities.length ||
      canonical(
        (sourceProof.waveTreeIdentities as Array<{ readonly path: string }>).map(
          (identity) => identity.path,
        ),
      ) !==
        canonical(
          (sourceProof.waveTreeIdentities as Array<{ readonly path: string }>)
            .map((identity) => identity.path)
            .sort(),
        ) ||
      sourceProof.waveTreeAggregateSha256 !== digest(canonical(sourceProof.waveTreeIdentities)) ||
      sourceProof.clean !== true ||
      sourceProof.headCommit !== intakeSource.headCommit ||
      sourceProof.pinnedAncestor !== true ||
      !COMMIT.test(String(sourceProof.priorCommit)) ||
      !validNonclaims(manifest.nonclaims) ||
      canonical(manifest.statusCounts) !== canonical({ BLOCKED: 0, COMPLETE: 30, FAILED: 0 }) ||
      archiveDescriptor === null ||
      receiptDescriptor === null ||
      archiveDescriptor.size + receiptDescriptor.size + manifestBytes.byteLength >
        MAX_ACCEPTANCE_AGGREGATE_BYTES
    ) {
      return null;
    }
    const receipt = intake as unknown as TeamReturnIntakeResult;
    const binding = parseAcceptanceSupersessionBinding(
      manifest.supersession,
      receipt.teamId as TeamId,
    );
    const archiveObject = readImmutableObject(
      teamRoot,
      'archive',
      archiveDescriptor.sha256,
      digest,
      expectedObjects?.archive,
    );
    const receiptObject = readImmutableObject(
      teamRoot,
      'receipt',
      receiptDescriptor.sha256,
      digest,
      expectedObjects?.receipt,
    );
    if (
      binding === null ||
      archiveObject.identity.size !== archiveDescriptor.size ||
      receiptObject.identity.size !== receiptDescriptor.size
    ) {
      return null;
    }
    const archiveBytes = archiveObject.bytes;
    const receiptBytes = receiptObject.bytes;
    const parsedArchive = parseAcceptanceArchive(archiveBytes);
    if (parsedArchive === null) {
      return null;
    }
    const expectedPaths = receipt.rows
      .filter((row) => row.status === 'COMPLETE')
      .flatMap((row) => LESSON_FILES.map((path) => `${row.lessonId}/${path}`))
      .sort();
    const rowCores = receipt.rows.map(({ code: _code, rowSha256: _rowSha256, ...row }) => row);
    const rootCores = receipt.rows.map((row) => ({
      lessonId: row.lessonId,
      rootSha256: row.rootSha256,
    }));
    const expectedReceipt = Buffer.from(
      `${canonical(
        acceptanceReceiptRecord(receipt, binding, archiveDescriptor as AcceptanceArchiveDescriptor),
      )}\n`,
    );
    const expectedManifest = Buffer.from(
      `${canonical(
        acceptanceManifestRecord(
          receipt,
          binding,
          archiveDescriptor as AcceptanceArchiveDescriptor,
          receiptDescriptor,
          sourceProof as unknown as AcceptanceSourceProof,
          candidateRootClosure as unknown as AcceptanceCandidateRootClosure,
          admissionAuthority as unknown as TeamAuthority,
          manifest.promotedAdmissions as readonly PromotedAdmission[],
        ),
      )}\n`,
    );
    const intakeSchemaValid = acceptanceIntakeSchemaValid(receipt, binding, parsedArchive);
    const admissionsValid = promotedAdmissionsValid(
      receipt,
      binding,
      parsedArchive,
      admissionAuthority as unknown as TeamAuthority,
      manifest.promotedAdmissions,
      trustedAuthority?.centralRoot ?? centralRootFromTeamRoot(teamRoot),
    );
    if (
      canonical(receiptBytes) !== canonical(expectedReceipt) ||
      digest(expectedReceipt) !== receiptDescriptor.sha256 ||
      canonical(manifestBytes) !== canonical(expectedManifest) ||
      receipt.mode !== 'ACCEPT' ||
      receipt.decision !== 'ACCEPTED' ||
      receipt.copy.disposition !== 'SUPERSESSION_COMMITTED' ||
      receipt.scope.kind !== 'FINAL_TEAM' ||
      receipt.scope.id !== 'TEAM' ||
      receipt.scope.rowCount !== 30 ||
      receipt.rows.length !== 30 ||
      receipt.rows.some((row) => row.status !== 'COMPLETE') ||
      !intakeSchemaValid ||
      !admissionsValid ||
      (trustedAuthority !== undefined &&
        canonical(admissionAuthority) !== canonical(trustedAuthority.teamAuthority)) ||
      receipt.teamId === null ||
      !sourceProofArchiveIdentityValid(sourceProof, parsedArchive, receipt.teamId) ||
      !sourceProofWaveArchiveValid(sourceProof, parsedArchive, receipt.teamId) ||
      !sourceProofGitClosureValid(
        sourceProof,
        trustedAuthority?.gitRoot ??
          trustedAuthority?.centralRoot ??
          centralRootFromTeamRoot(teamRoot),
        receipt.teamId,
        binding.newlyCompleteLessonIds,
      ) ||
      candidateRootClosure.entryCount !== parsedArchive.candidateInventory.length ||
      candidateRootClosure.inventorySha256 !==
        digest(canonical(parsedArchive.candidateInventory)) ||
      candidateRootClosure.pathSha256 !==
        digest(canonical(parsedArchive.candidateInventory.map((entry) => entry.path))) ||
      canonical(parsedArchive.inventory.map((entry) => entry.path)) !== canonical(expectedPaths) ||
      digest(canonical(parsedArchive.inventory)) !== receipt.aggregates.sourceBatchSha256 ||
      digest(canonical(rowCores)) !== receipt.aggregates.rowSha256 ||
      digest(canonical(rootCores)) !== receipt.aggregates.rootSha256 ||
      parsedArchive.treeSha256 !== binding.replacement.treeSha256 ||
      receipt.aggregates.rootSha256 !== binding.replacement.rootSha256 ||
      receipt.aggregates.rowSha256 !== binding.replacement.rowSha256 ||
      receipt.aggregates.sourceBatchSha256 !== binding.replacement.sourceBatchSha256 ||
      receipt.copy.stagingIdentitySha256 !== binding.replacement.stagingIdentitySha256 ||
      digest(canonical(receipt.source)) !== binding.replacement.sourceIdentitySha256 ||
      digest(canonical(receipt.copy)) !== binding.replacement.copyIdentitySha256
    ) {
      return null;
    }
    return {
      archive: parsedArchive,
      binding,
      objects: {
        archive: archiveObject.identity,
        manifest: manifestObject.identity,
        receipt: receiptObject.identity,
      },
      state: {
        completeLessonIds: receipt.rows
          .filter((row) => row.status === 'COMPLETE')
          .map((row) => row.lessonId),
        inventory: parsedArchive.inventory,
        receipt,
        treeSha256: parsedArchive.treeSha256,
      },
      sourceProof: sourceProof as unknown as AcceptanceSourceProof,
    };
  } catch {
    return null;
  }
}

function acceptanceTransitionValid(
  predecessor: VerifiedStagedState,
  successor: LoadedAcceptanceState,
): boolean {
  const priorRows = new Map(predecessor.receipt.rows.map((row) => [row.lessonId, row]));
  const replacementRows = new Map(successor.state.receipt.rows.map((row) => [row.lessonId, row]));
  if (
    predecessor.receipt.teamId !== successor.state.receipt.teamId ||
    predecessor.receipt.assignmentIdSha256 !== successor.state.receipt.assignmentIdSha256 ||
    canonical(predecessor.receipt.authority) !== canonical(successor.state.receipt.authority) ||
    predecessor.receipt.source.kind !== successor.state.receipt.source.kind ||
    canonical(predecessor.receipt.rows.map((row) => row.lessonId)) !==
      canonical(successor.state.receipt.rows.map((row) => row.lessonId)) ||
    canonical(successor.binding.prior) !== canonical(supersessionPriorSide(predecessor)) ||
    canonical(successor.binding.replacement) !==
      canonical(supersessionReplacementSide(successor.state))
  ) {
    return false;
  }
  const unchanged: string[] = [];
  const promoted: string[] = [];
  const predecessorInventory = new Map(predecessor.inventory.map((entry) => [entry.path, entry]));
  const replacementInventory = new Map(
    successor.state.inventory.map((entry) => [entry.path, entry]),
  );
  for (const priorRow of predecessor.receipt.rows) {
    const replacement = replacementRows.get(priorRow.lessonId);
    if (replacement === undefined || priorRows.get(priorRow.lessonId) !== priorRow) return false;
    if (priorRow.status === 'COMPLETE') {
      if (canonical(priorRow) !== canonical(replacement)) return false;
      for (const path of LESSON_FILES) {
        const key = `${priorRow.lessonId}/${path}`;
        if (
          canonical(predecessorInventory.get(key) ?? null) !==
          canonical(replacementInventory.get(key) ?? null)
        ) {
          return false;
        }
      }
      unchanged.push(priorRow.lessonId);
    } else {
      if (!['BLOCKED', 'FAILED'].includes(priorRow.status) || replacement.status !== 'COMPLETE') {
        return false;
      }
      promoted.push(priorRow.lessonId);
    }
  }
  return (
    canonical(unchanged) === canonical(successor.binding.unchangedCompleteLessonIds) &&
    canonical(promoted) === canonical(successor.binding.newlyCompleteLessonIds) &&
    unchanged.length + promoted.length === 30
  );
}

export function readBoundedAcceptanceMarkerNames(
  commitsRoot: string,
  onEntry?: (name: string) => void,
): readonly string[] | null {
  const directory = opendirSync(commitsRoot);
  const names: string[] = [];
  try {
    while (true) {
      const entry = directory.readSync();
      if (entry === null) break;
      onEntry?.(entry.name);
      if (names.length >= MAX_ACCEPTANCE_MARKERS) return null;
      if (!DIGEST.test(entry.name) || !entry.isSymbolicLink()) return null;
      names.push(entry.name);
    }
  } finally {
    directory.closeSync();
  }
  return names.sort();
}

function validatedSupersessionChain(
  finalRoot: string,
  trustedAuthority?: {
    readonly centralRoot: string;
    readonly gitRoot?: string;
    readonly teamAuthority: TeamAuthority;
  },
): readonly VerifiedStagedState[] | null {
  const acceptedRoot = verifyStagedState(finalRoot);
  if (acceptedRoot === null) return null;
  const teamRoot = dirname(finalRoot);
  const commitsRoot = join(teamRoot, ACCEPTANCE_RELATIVE_ROOT, 'commits');
  if (!existsSync(commitsRoot)) return [acceptedRoot];
  const commitsInfo = lstatSync(commitsRoot);
  if (
    commitsInfo.isSymbolicLink() ||
    !commitsInfo.isDirectory() ||
    (commitsInfo.mode & 0o777) !== 0o700
  ) {
    return null;
  }
  const markerNames = readBoundedAcceptanceMarkerNames(commitsRoot);
  if (markerNames === null) return null;
  const publications: Array<
    LoadedAcceptanceState & {
      markerName: string;
    }
  > = [];
  for (const markerName of markerNames) {
    if (!DIGEST.test(markerName)) return null;
    const markerPath = join(commitsRoot, markerName);
    const markerInfo = lstatSync(markerPath);
    if (!markerInfo.isSymbolicLink()) return null;
    const target = readlinkSync(markerPath);
    if (!DIGEST.test(target)) return null;
    const loaded = loadAcceptanceState(teamRoot, target, undefined, trustedAuthority);
    if (
      loaded === null ||
      markerName !== loaded.binding.supersessionId ||
      loaded.binding.acceptanceMarkerRelativePath !==
        `${ACCEPTANCE_RELATIVE_ROOT}/commits/${markerName}`
    ) {
      return null;
    }
    publications.push({ ...loaded, markerName });
  }
  const states: VerifiedStagedState[] = [acceptedRoot];
  const consumed = new Set<string>();
  let predecessor = acceptedRoot;
  while (true) {
    const successors = publications.filter(
      (candidate) =>
        canonical(candidate.binding.prior) === canonical(supersessionPriorSide(predecessor)),
    );
    if (successors.length === 0) break;
    if (successors.length !== 1) return null;
    const successor = successors[0] as (typeof publications)[number];
    if (
      consumed.has(successor.markerName) ||
      states.length >= MAX_ACCEPTANCE_CHAIN_DEPTH ||
      successor.sourceProof.priorCommit !== predecessor.receipt.source.headCommit ||
      !acceptanceTransitionValid(predecessor, successor) ||
      canonical(successor.binding.replacement) !==
        canonical(supersessionReplacementSide(successor.state))
    ) {
      return null;
    }
    consumed.add(successor.markerName);
    states.push(successor.state);
    predecessor = successor.state;
  }
  return consumed.size === publications.length ? states : null;
}

export interface TeamReturnAcceptanceLoadResult {
  readonly extractedRoot: string;
  readonly handle: TeamReturnAcceptanceHandle & {
    readonly marker: AcceptanceMarkerIdentity;
    readonly objects: NonNullable<TeamReturnAcceptanceHandle['objects']>;
  };
  readonly intakeReceipt: TeamReturnIntakeResult;
}

export function loadTeamReturnAcceptanceArtifact(input: {
  readonly authorityRoot: string;
  readonly centralRepositoryRoot: string;
  readonly reviewedCheckoutRoot: string;
  readonly handle: TeamReturnAcceptanceHandle;
  readonly scopeId: 'TEAM';
  readonly teamId: TeamId;
}): TeamReturnAcceptanceLoadResult {
  if (
    input.scopeId !== 'TEAM' ||
    !TEAM_IDS.includes(input.teamId) ||
    input.handle.marker === undefined ||
    input.handle.objects === undefined
  ) {
    throw new Error('ACCEPTANCE_HANDLE_INVALID');
  }
  const centralRoot = realpathSync(input.centralRepositoryRoot);
  const authorityExceptions: TeamReturnException[] = [];
  const finalization = verifyAuthorityRoot(realpathSync(input.authorityRoot), authorityExceptions);
  const teamAuthority =
    finalization === null
      ? null
      : verifyTeamAuthority(
          realpathSync(input.authorityRoot),
          centralRoot,
          finalization,
          input.teamId,
          authorityExceptions,
        );
  if (teamAuthority === null || authorityExceptions.length !== 0) {
    throw new Error('ACCEPTANCE_AUTHORITY_INVALID');
  }
  const trustedAuthority = {
    centralRoot,
    gitRoot: realpathSync(input.reviewedCheckoutRoot),
    teamAuthority,
  };
  const finalRoot = join(
    centralRoot,
    TEAM_RETURN_STAGING_RELATIVE_ROOT,
    input.teamId,
    input.scopeId,
  );
  const teamRoot = dirname(finalRoot);
  const marker = inspectAcceptanceMarker(
    teamRoot,
    input.handle.markerRelativePath,
    input.handle.manifestSha256,
  );
  if (
    marker === null ||
    canonical(marker) !== canonical(input.handle.marker) ||
    input.handle.markerRelativePath !==
      `${ACCEPTANCE_RELATIVE_ROOT}/commits/${input.handle.markerRelativePath.split('/').at(-1)}`
  ) {
    throw new Error('ACCEPTANCE_MARKER_INVALID');
  }
  const loaded = loadAcceptanceState(
    teamRoot,
    input.handle.manifestSha256,
    input.handle.objects,
    trustedAuthority,
  );
  const chain = validatedSupersessionChain(finalRoot, trustedAuthority);
  if (
    loaded === null ||
    chain === null ||
    chain.at(-1)?.receipt.receiptSha256 !== loaded.state.receipt.receiptSha256 ||
    loaded.binding.acceptanceMarkerRelativePath !== input.handle.markerRelativePath ||
    loaded.binding.generationId !== input.handle.generationId ||
    loaded.binding.replacement.treeSha256 !== input.handle.sourceTreeSha256 ||
    loaded.state.receipt.source.headCommit !== input.handle.sourceCommit ||
    loaded.state.receipt.source.headCommit !==
      gitOutput(trustedAuthority.gitRoot, ['rev-parse', 'HEAD'])
  ) {
    throw new Error('ACCEPTANCE_CHAIN_INVALID');
  }
  const extractedRoot = mkdtempSync(join(tmpdir(), 'mcat-team-acceptance-'));
  const extractedInfo = lstatSync(extractedRoot);
  const extractedIdentity = { device: extractedInfo.dev, inode: extractedInfo.ino };
  try {
    mkdirSync(join(extractedRoot, 'lessons'), { mode: 0o700 });
    for (const [relativePath, bytes] of [...loaded.archive.files.entries()].sort(
      ([left], [right]) => left.localeCompare(right),
    )) {
      const destination = confined(
        extractedRoot,
        relativePath === 'TEAM-HANDOFF.json' || /^waves\/[^/]+\.json$/.test(relativePath)
          ? relativePath
          : `lessons/${relativePath}`,
      );
      mkdirSync(dirname(destination), { recursive: true, mode: 0o700 });
      const descriptor = openSync(
        destination,
        fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_NOFOLLOW,
        0o600,
      );
      try {
        let offset = 0;
        while (offset < bytes.byteLength) {
          offset += writeSync(descriptor, bytes, offset, bytes.byteLength - offset);
        }
        fchmodSync(descriptor, 0o400);
        fsyncSync(descriptor);
      } finally {
        closeSync(descriptor);
      }
    }
    const directories = collectDirectories(extractedRoot).sort(
      (left, right) => right.length - left.length,
    );
    for (const path of directories) {
      chmodSync(path, 0o500);
      const descriptor = openSync(
        path,
        fsConstants.O_RDONLY | fsConstants.O_DIRECTORY | fsConstants.O_NOFOLLOW,
      );
      try {
        fsyncSync(descriptor);
      } finally {
        closeSync(descriptor);
      }
    }
    const extractedInventory = inventory(
      join(extractedRoot, 'lessons'),
      listFiles(join(extractedRoot, 'lessons')),
    );
    const extractedCandidateInventory = inventory(extractedRoot, listFiles(extractedRoot)).map(
      (entry) => ({
        ...entry,
        kind: 'FILE',
        mode: lstatSync(confined(extractedRoot, entry.path)).mode & 0o777,
      }),
    );
    if (
      canonical(extractedInventory) !== canonical(loaded.archive.inventory) ||
      canonical(extractedCandidateInventory) !== canonical(loaded.archive.candidateInventory) ||
      !readOnlyModesValid(extractedRoot)
    ) {
      throw new Error('ACCEPTANCE_EXTRACTION_INVALID');
    }
    return {
      extractedRoot,
      handle: input.handle as TeamReturnAcceptanceLoadResult['handle'],
      intakeReceipt: loaded.state.receipt,
    };
  } catch (error) {
    cleanupOwnedIncoming(extractedRoot, extractedIdentity);
    throw error;
  }
}

function findSupersessionPredecessor(
  finalRoot: string,
  request: TeamReturnSupersessionRequest,
  trustedAuthority?: {
    readonly centralRoot: string;
    readonly gitRoot?: string;
    readonly teamAuthority: TeamAuthority;
  },
): VerifiedStagedState | null {
  const chain = validatedSupersessionChain(finalRoot, trustedAuthority);
  if (chain === null) return null;
  const matching = chain.filter(
    (candidate) =>
      candidate.receipt.aggregates.sourceBatchSha256 === request.expectedPriorSourceBatchSha256 &&
      candidate.receipt.copy.stagingIdentitySha256 === request.expectedPriorStagingIdentitySha256,
  );
  if (matching.length !== 1) return null;
  const candidate = matching[0] as VerifiedStagedState;
  return chain.indexOf(candidate) >= chain.length - 2 ? candidate : null;
}

function makeSupersessionBinding(input: {
  readonly finalRoot: string;
  readonly request: TeamReturnSupersessionRequest;
  readonly result: TeamReturnIntakeResult;
  readonly expected: readonly {
    readonly path: string;
    readonly sha256: string;
    readonly size: number;
  }[];
  readonly exceptions: TeamReturnException[];
  readonly centralRoot: string;
  readonly gitRoot: string;
  readonly teamAuthority: TeamAuthority;
}): TeamReturnSupersessionBinding | null {
  if (
    input.request.action !== 'SUPERSEDE_FINAL_TEAM' ||
    !DIGEST.test(input.request.expectedPriorSourceBatchSha256) ||
    !DIGEST.test(input.request.expectedPriorStagingIdentitySha256) ||
    input.result.scope.kind !== 'FINAL_TEAM' ||
    input.result.scope.id !== 'TEAM' ||
    input.result.scope.rowCount !== 30 ||
    input.result.teamId === null
  ) {
    addException(input.exceptions, 'SUPERSESSION_AUTHORITY_INVALID', 'COPY', {
      reason: 'REQUEST_OR_SCOPE_INVALID',
    });
    return null;
  }
  const trustedAuthority = {
    centralRoot: input.centralRoot,
    gitRoot: input.gitRoot,
    teamAuthority: input.teamAuthority,
  };
  const prior = findSupersessionPredecessor(input.finalRoot, input.request, trustedAuthority);
  if (prior === null) {
    const acceptedRoot = verifyStagedState(input.finalRoot);
    const chain =
      acceptedRoot === null ? null : validatedSupersessionChain(input.finalRoot, trustedAuthority);
    const expectedMatchesAcceptedRoot =
      acceptedRoot !== null &&
      acceptedRoot.receipt.aggregates.sourceBatchSha256 ===
        input.request.expectedPriorSourceBatchSha256 &&
      acceptedRoot.receipt.copy.stagingIdentitySha256 ===
        input.request.expectedPriorStagingIdentitySha256;
    addException(
      input.exceptions,
      chain === null || expectedMatchesAcceptedRoot
        ? 'SUPERSESSION_PRIOR_INVALID'
        : 'SUPERSESSION_AUTHORITY_INVALID',
      'COPY',
      {
        scopeId: input.result.scope.id,
        teamId: input.result.teamId,
      },
    );
    return null;
  }
  if (
    prior.receipt.teamId !== input.result.teamId ||
    prior.receipt.scope.kind !== 'FINAL_TEAM' ||
    prior.receipt.scope.id !== 'TEAM' ||
    prior.receipt.scope.rowCount !== 30 ||
    prior.receipt.aggregates.sourceBatchSha256 !== input.request.expectedPriorSourceBatchSha256 ||
    prior.receipt.copy.stagingIdentitySha256 !== input.request.expectedPriorStagingIdentitySha256 ||
    prior.receipt.assignmentIdSha256 !== input.result.assignmentIdSha256 ||
    canonical(prior.receipt.authority) !== canonical(input.result.authority)
  ) {
    addException(input.exceptions, 'SUPERSESSION_AUTHORITY_INVALID', 'COPY', {
      expectedPriorSourceBatchSha256: input.request.expectedPriorSourceBatchSha256,
      expectedPriorStagingIdentitySha256: input.request.expectedPriorStagingIdentitySha256,
    });
    return null;
  }
  if (
    prior.receipt.aggregates.sourceBatchSha256 === input.result.aggregates.sourceBatchSha256 ||
    prior.receipt.copy.stagingIdentitySha256 === input.result.copy.stagingIdentitySha256
  ) {
    addException(input.exceptions, 'SUPERSESSION_AUTHORITY_INVALID', 'COPY', {
      reason: 'SAME_BATCH',
    });
    return null;
  }
  const priorRows = new Map(prior.receipt.rows.map((row) => [row.lessonId, row]));
  const replacementRows = new Map(input.result.rows.map((row) => [row.lessonId, row]));
  if (
    canonical(prior.receipt.rows.map((row) => row.lessonId)) !==
    canonical(input.result.rows.map((row) => row.lessonId))
  ) {
    addException(input.exceptions, 'SUPERSESSION_NON_MONOTONIC', 'COPY', {
      reason: 'ROW_CLOSURE_CHANGED',
    });
    return null;
  }
  const replacementInventory = new Map(input.expected.map((file) => [file.path, file]));
  const priorInventory = new Map(prior.inventory.map((file) => [file.path, file]));
  const unchangedCompleteLessonIds: string[] = [];
  const newlyCompleteLessonIds: string[] = [];
  for (const priorRow of prior.receipt.rows) {
    const replacementRow = replacementRows.get(priorRow.lessonId);
    if (replacementRow === undefined) {
      addException(input.exceptions, 'SUPERSESSION_NON_MONOTONIC', 'COPY', {
        lessonId: priorRow.lessonId,
        reason: 'ROW_REMOVED',
      });
      return null;
    }
    if (priorRow.status === 'COMPLETE') {
      if (replacementRow.status !== 'COMPLETE') {
        addException(input.exceptions, 'SUPERSESSION_NON_MONOTONIC', 'COPY', {
          lessonId: priorRow.lessonId,
          reason: 'COMPLETE_DOWNGRADED',
        });
        return null;
      }
      for (const path of LESSON_FILES) {
        const key = `${priorRow.lessonId}/${path}`;
        if (
          canonical(priorInventory.get(key) ?? null) !==
          canonical(replacementInventory.get(key) ?? null)
        ) {
          addException(input.exceptions, 'SUPERSESSION_NON_MONOTONIC', 'COPY', {
            lessonId: priorRow.lessonId,
            reason: 'COMPLETE_TREE_CHANGED',
          });
          return null;
        }
      }
      unchangedCompleteLessonIds.push(priorRow.lessonId);
      continue;
    }
    if (replacementRow.status !== priorRow.status && replacementRow.status !== 'COMPLETE') {
      addException(input.exceptions, 'SUPERSESSION_NON_MONOTONIC', 'COPY', {
        lessonId: priorRow.lessonId,
        reason: 'NONCOMPLETE_STATUS_CHANGED',
      });
      return null;
    }
    if (replacementRow.status === 'COMPLETE') {
      newlyCompleteLessonIds.push(priorRow.lessonId);
    } else if (canonical(replacementRow) !== canonical(priorRow)) {
      addException(input.exceptions, 'SUPERSESSION_NON_MONOTONIC', 'COPY', {
        lessonId: priorRow.lessonId,
        reason: 'NONCOMPLETE_IDENTITY_CHANGED',
      });
      return null;
    }
  }
  if (priorRows.size !== replacementRows.size) {
    addException(input.exceptions, 'SUPERSESSION_NON_MONOTONIC', 'COPY', {
      reason: 'NO_MONOTONIC_ADDITION',
    });
    return null;
  }
  const priorSide = {
    copyIdentitySha256: digest(canonical(prior.receipt.copy)),
    receiptSha256: prior.receipt.receiptSha256,
    rootSha256: prior.receipt.aggregates.rootSha256,
    rowSha256: prior.receipt.aggregates.rowSha256,
    sourceIdentitySha256: digest(canonical(prior.receipt.source)),
    sourceBatchSha256: prior.receipt.aggregates.sourceBatchSha256,
    stagingIdentitySha256: prior.receipt.copy.stagingIdentitySha256,
    treeSha256: prior.treeSha256,
  };
  const replacementCopy = {
    disposition: 'SUPERSESSION_COMMITTED' as const,
    stagedCompleteCount: input.result.rows.filter((row) => row.status === 'COMPLETE').length,
    stagingIdentitySha256: input.result.copy.stagingIdentitySha256,
  };
  const replacementSide = {
    copyIdentitySha256: digest(canonical(replacementCopy)),
    rootSha256: input.result.aggregates.rootSha256,
    rowSha256: input.result.aggregates.rowSha256,
    sourceIdentitySha256: digest(canonical(input.result.source)),
    sourceBatchSha256: input.result.aggregates.sourceBatchSha256,
    stagingIdentitySha256: input.result.copy.stagingIdentitySha256,
    treeSha256: lessonTreeIdentity(input.expected),
  };
  const supersessionId = digest(
    canonical({
      action: input.request.action,
      prior: priorSide,
      scope: 'FINAL_TEAM',
      teamId: input.result.teamId,
    }),
  );
  const acceptanceMarkerRelativePath = `${ACCEPTANCE_RELATIVE_ROOT}/commits/${supersessionId}`;
  const generationCore = {
    action: input.request.action,
    acceptanceMarkerRelativePath,
    newlyCompleteLessonIds,
    prior: priorSide,
    replacement: replacementSide,
    supersessionId,
    teamId: input.result.teamId,
    unchangedCompleteLessonIds,
  };
  const generationId = digest(canonical(generationCore));
  return {
    acceptanceMarkerRelativePath,
    action: 'SUPERSEDE_FINAL_TEAM',
    generationId,
    newlyCompleteLessonIds,
    prior: priorSide,
    replacement: replacementSide,
    supersessionId,
    unchangedCompleteLessonIds,
  };
}

interface OwnedIncomingIdentity {
  readonly device: number;
  readonly inode: number;
}

function collectDirectories(root: string): string[] {
  const directories = [root];
  const walk = (directoryPath: string): void => {
    for (const entry of readdirSync(directoryPath, { withFileTypes: true })) {
      const path = join(directoryPath, entry.name);
      const info = lstatSync(path);
      if (info.isSymbolicLink()) throw new Error('INCOMING_SYMLINK');
      if (info.isDirectory()) {
        directories.push(path);
        walk(path);
      } else if (!info.isFile()) {
        throw new Error('INCOMING_NODE_INVALID');
      }
    }
  };
  walk(root);
  return directories;
}

function hardenIncomingTree(root: string, chmodPath: (path: string, mode: number) => void): void {
  const files = listFiles(root).map((path) => join(root, path));
  const directories = collectDirectories(root);
  for (const path of files) chmodPath(path, 0o400);
  for (const path of directories.sort((left, right) => right.length - left.length)) {
    chmodPath(path, 0o500);
  }
}

function cleanupOwnedIncoming(root: string, identity: OwnedIncomingIdentity | null): void {
  if (identity === null || !existsSync(root)) return;
  const current = lstatSync(root);
  if (
    current.isSymbolicLink() ||
    !current.isDirectory() ||
    current.dev !== identity.device ||
    current.ino !== identity.inode
  ) {
    return;
  }
  const makeWritable = (path: string): void => {
    const info = lstatSync(path);
    if (info.isSymbolicLink()) return;
    if (!info.isDirectory()) {
      chmodSync(path, 0o600);
      return;
    }
    chmodSync(path, 0o700);
    for (const name of readdirSync(path)) makeWritable(join(path, name));
  };
  makeWritable(root);
  rmSync(root, { force: true, recursive: true });
}

function makePartialResult(input: {
  readonly mode: 'DRY_RUN' | 'ACCEPT';
  readonly decision: 'ACCEPTED' | 'REJECTED';
  readonly teamId: TeamId | null;
  readonly assignmentId: string;
  readonly finalization: FinalizationAuthority | null;
  readonly teamAuthority: TeamAuthority | null;
  readonly materialized: MaterializedSource | null;
  readonly sourceKind: TeamReturnSource['kind'];
  readonly scope: TeamReturnIntakeResult['scope'];
  readonly rows: readonly TeamReturnIntakeRow[];
  readonly aggregates: TeamReturnIntakeResult['aggregates'];
  readonly exceptions: readonly TeamReturnException[];
  readonly copy: TeamReturnIntakeResult['copy'];
}): TeamReturnIntakeResult {
  return constantResult({
    aggregates: input.aggregates,
    assignmentIdSha256:
      input.assignmentId === '' ? digest(canonical(null)) : digest(input.assignmentId),
    authority: {
      finalizationReceiptSha256: input.finalization?.receiptSha256 ?? '',
      generation: input.finalization?.generation ?? null,
      kitManifestSha256: input.teamAuthority?.kitSha256 ?? '',
      pinnedCommit: input.finalization?.pins.repositoryCommit ?? '',
      readySha256: input.teamAuthority?.readySha256 ?? '',
      sendMeSha256: input.teamAuthority?.sendMeSha256 ?? '',
    },
    copy: input.copy,
    decision: input.decision,
    exceptions: [...input.exceptions].sort((left, right) =>
      canonical(left).localeCompare(canonical(right)),
    ),
    format: 'lesson-generation-team-return-intake/1',
    mode: input.mode,
    rows: input.rows,
    scope: input.scope,
    source: {
      branch: input.materialized?.checkoutEvidence.branch ?? '',
      headCommit: input.materialized?.checkoutEvidence.headCommit ?? '',
      kind: input.materialized?.kind ?? input.sourceKind,
      sourceSha256: digest(
        canonical({
          branch: input.materialized?.checkoutEvidence.branch ?? null,
          changedPaths: input.materialized?.checkoutEvidence.changedPaths ?? [],
          headCommit: input.materialized?.checkoutEvidence.headCommit ?? null,
        }),
      ),
    },
    teamId: input.teamId,
  });
}

function reviseResult(
  result: TeamReturnIntakeResult,
  decision: TeamReturnIntakeResult['decision'],
  copy: TeamReturnIntakeResult['copy'],
  exceptions: readonly TeamReturnException[],
): TeamReturnIntakeResult {
  const { receiptSha256: _receiptSha256, ...base } = result;
  return constantResult({
    ...base,
    copy,
    decision,
    exceptions: [...exceptions].sort((left, right) =>
      canonical(left).localeCompare(canonical(right)),
    ),
  });
}

function bindSupersessionResult(
  result: TeamReturnIntakeResult,
  supersession: TeamReturnSupersessionBinding,
  candidateRoot: string,
  expected: readonly { readonly path: string; readonly sha256: string; readonly size: number }[],
  sourceProof: TeamReturnCheckoutEvidence,
  changedPathIdentities: readonly ChangedPathIdentity[],
  waveTreeIdentities: readonly GitTreeFileIdentity[],
  priorCommit: string,
  centralRoot: string,
  teamAuthority: TeamAuthority,
  mechanicalAdmissions: ReadonlyMap<string, CentralMechanicalValidation>,
): TeamReturnIntakeResult {
  const { receiptSha256: _receiptSha256, ...base } = result;
  const publication = constantResult({
    ...base,
    mode: 'ACCEPT',
    copy: {
      ...base.copy,
      disposition: 'SUPERSESSION_COMMITTED',
      stagedCompleteCount: result.rows.filter((row) => row.status === 'COMPLETE').length,
    },
    supersession,
  });
  const artifacts = makeAcceptanceArtifacts(
    publication,
    supersession,
    candidateRoot,
    expected,
    sourceProof,
    changedPathIdentities,
    waveTreeIdentities,
    priorCommit,
    centralRoot,
    teamAuthority,
    mechanicalAdmissions,
  );
  const selected =
    result.mode === 'ACCEPT'
      ? publication
      : constantResult({
          ...base,
          copy: {
            ...base.copy,
            disposition: 'SUPERSESSION_READY',
            stagedCompleteCount: 0,
          },
          supersession,
        });
  const { receiptSha256: _selectedReceiptSha256, ...selectedBase } = selected;
  return constantResult({
    ...selectedBase,
    copy: {
      ...selected.copy,
      acceptance: artifacts.handle,
    },
  });
}

function makeEmptyAggregates(): TeamReturnIntakeResult['aggregates'] {
  const empty = digest(canonical([]));
  return { rootSha256: empty, rowSha256: empty, sourceBatchSha256: empty };
}

function parseAcceptanceSupersessionBinding(
  value: unknown,
  teamId: TeamId,
): TeamReturnSupersessionBinding | null {
  const binding = record(value);
  if (
    binding === null ||
    !hasExactKeys(binding, [
      'acceptanceMarkerRelativePath',
      'action',
      'generationId',
      'newlyCompleteLessonIds',
      'prior',
      'replacement',
      'supersessionId',
      'unchangedCompleteLessonIds',
    ]) ||
    binding.action !== 'SUPERSEDE_FINAL_TEAM' ||
    !Array.isArray(binding.newlyCompleteLessonIds) ||
    !Array.isArray(binding.unchangedCompleteLessonIds) ||
    !DIGEST.test(String(binding.generationId)) ||
    !DIGEST.test(String(binding.supersessionId))
  ) {
    return null;
  }
  const prior = record(binding.prior);
  const replacement = record(binding.replacement);
  const sideKeys = [
    'copyIdentitySha256',
    'rootSha256',
    'rowSha256',
    'sourceBatchSha256',
    'sourceIdentitySha256',
    'stagingIdentitySha256',
    'treeSha256',
  ];
  if (
    prior === null ||
    replacement === null ||
    !hasExactKeys(prior, [...sideKeys, 'receiptSha256']) ||
    !hasExactKeys(replacement, sideKeys) ||
    [...sideKeys, 'receiptSha256'].some((key) => !DIGEST.test(String(prior[key]))) ||
    sideKeys.some((key) => !DIGEST.test(String(replacement[key]))) ||
    binding.acceptanceMarkerRelativePath !==
      `${ACCEPTANCE_RELATIVE_ROOT}/commits/${String(binding.supersessionId)}` ||
    [...binding.newlyCompleteLessonIds, ...binding.unchangedCompleteLessonIds].some(
      (lessonId) => typeof lessonId !== 'string' || !LESSON_ID.test(lessonId),
    )
  ) {
    return null;
  }
  const expectedSupersessionId = digest(
    canonical({
      action: binding.action,
      prior,
      scope: 'FINAL_TEAM',
      teamId,
    }),
  );
  const generationCore = {
    action: binding.action,
    acceptanceMarkerRelativePath: binding.acceptanceMarkerRelativePath,
    newlyCompleteLessonIds: binding.newlyCompleteLessonIds,
    prior,
    replacement,
    supersessionId: binding.supersessionId,
    teamId,
    unchangedCompleteLessonIds: binding.unchangedCompleteLessonIds,
  };
  return expectedSupersessionId === binding.supersessionId &&
    digest(canonical(generationCore)) === binding.generationId
    ? (binding as unknown as TeamReturnSupersessionBinding)
    : null;
}

async function commitAcceptanceArtifact(input: {
  readonly candidateRoot: string;
  readonly exceptions: TeamReturnException[];
  readonly expected: readonly {
    readonly path: string;
    readonly sha256: string;
    readonly size: number;
  }[];
  readonly finalRoot: string;
  readonly onBeforeAcceptanceObjectValidation?: TeamReturnIntakeDependencies['onBeforeAcceptanceObjectValidation'];
  readonly onBeforeSupersessionPublish?: (destination: string) => void;
  readonly onSupersessionBoundary?: (boundary: TeamReturnSupersessionBoundary) => void;
  readonly reinspectCheckout?: () => Promise<TeamReturnCheckoutEvidence>;
  readonly result: TeamReturnIntakeResult;
  readonly scopeId: string;
  readonly stagingIdentitySha256: string;
  readonly supersession: TeamReturnSupersessionBinding;
  readonly teamId: TeamId;
  readonly validatedCheckoutEvidence: TeamReturnCheckoutEvidence;
  readonly acceptanceSourceProof: TeamReturnCheckoutEvidence;
  readonly acceptanceChangedPathIdentities: readonly ChangedPathIdentity[];
  readonly acceptanceWaveTreeIdentities: readonly GitTreeFileIdentity[];
  readonly acceptancePriorCommit: string;
  readonly centralRoot: string;
  readonly reviewedGitRoot: string;
  readonly teamAuthority: TeamAuthority;
  readonly mechanicalAdmissions: ReadonlyMap<string, CentralMechanicalValidation>;
}): Promise<TeamReturnIntakeResult> {
  const teamRoot = dirname(input.finalRoot);
  const handle = input.result.copy.acceptance;
  if (handle === undefined) throw new Error('ACCEPTANCE_HANDLE_MISSING');
  const trustedAuthority = {
    centralRoot: input.centralRoot,
    gitRoot: input.reviewedGitRoot,
    teamAuthority: input.teamAuthority,
  };
  const replay = (): TeamReturnIntakeResult | null => {
    const marker = inspectAcceptanceMarker(
      teamRoot,
      handle.markerRelativePath,
      handle.manifestSha256,
    );
    if (marker === null) return null;
    const loaded = loadAcceptanceState(
      teamRoot,
      handle.manifestSha256,
      undefined,
      trustedAuthority,
    );
    const chain = validatedSupersessionChain(input.finalRoot, trustedAuthority);
    const terminal = chain?.at(-1);
    if (
      loaded === null ||
      terminal === undefined ||
      terminal.receipt.receiptSha256 !== loaded.state.receipt.receiptSha256 ||
      canonical(loaded.binding) !== canonical(input.supersession) ||
      canonical(loaded.state.inventory) !== canonical(input.expected) ||
      loaded.state.receipt.receiptSha256 !== input.result.receiptSha256
    ) {
      addException(input.exceptions, 'STAGING_MISMATCH', 'COPY', {
        markerRelativePath: handle.markerRelativePath,
        reason: 'ACCEPTANCE_MARKER_CONFLICT',
      });
      return reviseResult(
        input.result,
        'REJECTED',
        {
          disposition: 'REFUSED_MISMATCH',
          stagedCompleteCount: 0,
          acceptance: handle,
          stagingIdentitySha256: input.stagingIdentitySha256,
        },
        input.exceptions,
      );
    }
    return reviseResult(
      input.result,
      'ACCEPTED',
      {
        acceptance: { ...handle, marker, objects: loaded.objects },
        disposition: 'PRESENT_IDENTICAL',
        stagedCompleteCount: input.result.rows.filter((row) => row.status === 'COMPLETE').length,
        stagingIdentitySha256: input.stagingIdentitySha256,
      },
      input.exceptions,
    );
  };
  const existing = replay();
  if (existing !== null) return existing;
  try {
    const artifacts = makeAcceptanceArtifacts(
      reviseResult(
        input.result,
        'ACCEPTED',
        {
          disposition: 'SUPERSESSION_COMMITTED',
          stagedCompleteCount: input.result.rows.filter((row) => row.status === 'COMPLETE').length,
          stagingIdentitySha256: input.stagingIdentitySha256,
        },
        [],
      ),
      input.supersession,
      input.candidateRoot,
      input.expected,
      input.acceptanceSourceProof,
      input.acceptanceChangedPathIdentities,
      input.acceptanceWaveTreeIdentities,
      input.acceptancePriorCommit,
      input.centralRoot,
      input.teamAuthority,
      input.mechanicalAdmissions,
    );
    if (
      artifacts.handle.archiveSha256 !== handle.archiveSha256 ||
      artifacts.handle.manifestSha256 !== handle.manifestSha256 ||
      artifacts.handle.receiptSha256 !== handle.receiptSha256
    ) {
      throw new Error('ACCEPTANCE_PROJECTION_CHANGED');
    }
    if (input.reinspectCheckout !== undefined) {
      const currentEvidence = await input.reinspectCheckout();
      if (canonical(currentEvidence) !== canonical(input.validatedCheckoutEvidence)) {
        throw new Error('SOURCE_REPOSITORY_DRIFT');
      }
    }
    const store = openAcceptanceStore(teamRoot);
    const archiveIdentity = writeImmutableObject(
      store,
      teamRoot,
      'archive',
      artifacts.archiveBytes,
      handle.archiveSha256,
      digest,
      input.onSupersessionBoundary,
      input.onBeforeAcceptanceObjectValidation,
    );
    const receiptIdentity = writeImmutableObject(
      store,
      teamRoot,
      'receipt',
      artifacts.receiptBytes,
      handle.receiptSha256,
      digest,
      input.onSupersessionBoundary,
      input.onBeforeAcceptanceObjectValidation,
    );
    const manifestIdentity = writeImmutableObject(
      store,
      teamRoot,
      'manifest',
      artifacts.manifestBytes,
      handle.manifestSha256,
      digest,
      input.onSupersessionBoundary,
      input.onBeforeAcceptanceObjectValidation,
    );
    const objects = {
      archive: archiveIdentity,
      manifest: manifestIdentity,
      receipt: receiptIdentity,
    };
    if (loadAcceptanceState(teamRoot, handle.manifestSha256, objects, trustedAuthority) === null) {
      throw new Error('ACCEPTANCE_OBJECT_SET_INVALID');
    }
    let marker: AcceptanceMarkerIdentity;
    try {
      const markerPath = join(teamRoot, handle.markerRelativePath);
      input.onBeforeSupersessionPublish?.(markerPath);
      marker = createAcceptanceMarker(
        store,
        teamRoot,
        handle.markerRelativePath,
        handle.manifestSha256,
        input.onSupersessionBoundary,
      );
    } catch (error) {
      const raced = replay();
      if (raced !== null) return raced;
      throw error;
    }
    const publishedChain = validatedSupersessionChain(input.finalRoot, trustedAuthority);
    if (
      publishedChain === null ||
      publishedChain.at(-1)?.receipt.receiptSha256 !== input.result.receiptSha256
    ) {
      throw new Error('ACCEPTANCE_PUBLICATION_INVALID');
    }
    return reviseResult(
      input.result,
      'ACCEPTED',
      {
        acceptance: { ...handle, marker, objects },
        disposition: 'SUPERSESSION_COMMITTED',
        stagedCompleteCount: input.result.rows.filter((row) => row.status === 'COMPLETE').length,
        stagingIdentitySha256: input.stagingIdentitySha256,
      },
      input.exceptions,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === 'SOURCE_REPOSITORY_DRIFT') {
      addException(input.exceptions, 'SOURCE_REPOSITORY_DRIFT', 'COPY', {
        scopeId: input.scopeId,
        teamId: input.teamId,
      });
    }
    addException(input.exceptions, 'SUPERSESSION_TRANSACTION_FAILED', 'COPY', {
      error: message,
      markerRelativePath: handle.markerRelativePath,
    });
    return reviseResult(
      input.result,
      'REJECTED',
      {
        acceptance: handle,
        disposition: 'FAILED',
        stagedCompleteCount: 0,
        stagingIdentitySha256: input.stagingIdentitySha256,
      },
      input.exceptions,
    );
  }
}

async function stageAcceptedBatch(input: {
  readonly centralRoot: string;
  readonly candidateRoot: string;
  readonly expected: readonly {
    readonly path: string;
    readonly sha256: string;
    readonly size: number;
  }[];
  readonly teamId: TeamId;
  readonly scopeId: string;
  readonly rows: readonly TeamReturnIntakeRow[];
  readonly result: TeamReturnIntakeResult;
  readonly copyFile: (source: string, destination: string) => Promise<void>;
  readonly chmodPath?: (path: string, mode: number) => void;
  readonly exceptions: TeamReturnException[];
  readonly reinspectCheckout?: () => Promise<TeamReturnCheckoutEvidence>;
  readonly validatedCheckoutEvidence: TeamReturnCheckoutEvidence;
  readonly supersession?: TeamReturnSupersessionBinding;
  readonly supersessionRequest?: TeamReturnSupersessionRequest;
  readonly acceptanceSourceProof: TeamReturnCheckoutEvidence;
  readonly acceptanceChangedPathIdentities: readonly ChangedPathIdentity[];
  readonly acceptanceWaveTreeIdentities: readonly GitTreeFileIdentity[];
  readonly acceptancePriorCommit: string;
  readonly reviewedGitRoot: string;
  readonly teamAuthority: TeamAuthority;
  readonly mechanicalAdmissions: ReadonlyMap<string, CentralMechanicalValidation>;
  readonly onBeforeAcceptanceObjectValidation?: TeamReturnIntakeDependencies['onBeforeAcceptanceObjectValidation'];
  readonly onBeforeSupersessionPublish?: (destination: string) => void;
  readonly onSupersessionBoundary?: (boundary: TeamReturnSupersessionBoundary) => void;
}): Promise<TeamReturnIntakeResult> {
  const expected = input.expected;
  const stagingRoot = join(input.centralRoot, TEAM_RETURN_STAGING_RELATIVE_ROOT);
  const finalRoot = join(stagingRoot, input.teamId, input.scopeId);
  const stagingIdentitySha256 = digest(
    canonical({
      scopeId: input.scopeId,
      sourceBatchSha256: digest(canonical(expected)),
      teamId: input.teamId,
    }),
  );
  if (existsSync(finalRoot)) {
    const staged = verifyStagedState(finalRoot);
    const exactCompletedReplay = false;
    if (
      staged !== null &&
      (stagedStateMatchesReplacement(staged, input.result, expected) || exactCompletedReplay) &&
      (!existsSync(join(dirname(finalRoot), ACCEPTANCE_RELATIVE_ROOT, 'commits')) ||
        input.supersessionRequest !== undefined)
    ) {
      if (
        !exactCompletedReplay &&
        input.supersessionRequest !== undefined &&
        input.supersessionRequest.expectedPriorSourceBatchSha256 ===
          staged.receipt.aggregates.sourceBatchSha256 &&
        input.supersessionRequest.expectedPriorStagingIdentitySha256 ===
          staged.receipt.copy.stagingIdentitySha256
      ) {
        addException(input.exceptions, 'SUPERSESSION_AUTHORITY_INVALID', 'COPY', {
          reason: 'SAME_BATCH',
        });
        return reviseResult(
          input.result,
          'REJECTED',
          {
            disposition: 'REFUSED_MISMATCH',
            stagedCompleteCount: 0,
            stagingIdentitySha256,
          },
          input.exceptions,
        );
      }
      return reviseResult(
        input.result,
        'ACCEPTED',
        {
          disposition: 'PRESENT_IDENTICAL',
          stagedCompleteCount: input.rows.filter((row) => row.status === 'COMPLETE').length,
          stagingIdentitySha256,
        },
        input.exceptions,
      );
    }
    if (input.supersession === undefined) {
      addException(input.exceptions, 'STAGING_MISMATCH', 'COPY', {
        scopeId: input.scopeId,
        teamId: input.teamId,
      });
      return reviseResult(
        input.result,
        'REJECTED',
        {
          disposition: 'REFUSED_MISMATCH',
          stagedCompleteCount: 0,
          stagingIdentitySha256,
        },
        input.exceptions,
      );
    }
    return await commitAcceptanceArtifact({
      ...input,
      finalRoot,
      stagingIdentitySha256,
      supersession: input.supersession,
    });
  }
  mkdirSync(dirname(finalRoot), { recursive: true, mode: 0o700 });
  const temporary = join(
    dirname(finalRoot),
    `.${basename(finalRoot)}.incoming-${process.pid}-${Date.now()}`,
  );
  let incomingIdentity: OwnedIncomingIdentity | null = null;
  try {
    mkdirSync(temporary, { mode: 0o700 });
    const temporaryInfo = lstatSync(temporary);
    incomingIdentity = { device: temporaryInfo.dev, inode: temporaryInfo.ino };
    mkdirSync(join(temporary, 'lessons'), { mode: 0o700 });
    for (const file of expected) {
      const source = join(input.candidateRoot, file.path);
      const destination = join(temporary, 'lessons', file.path);
      mkdirSync(dirname(destination), { recursive: true, mode: 0o700 });
      await input.copyFile(source, destination);
    }
    if (!compareStaged(temporary, expected)) throw new Error('COPY_VERIFICATION_FAILED');
    if (input.reinspectCheckout !== undefined) {
      let currentEvidence: TeamReturnCheckoutEvidence;
      try {
        currentEvidence = await input.reinspectCheckout();
      } catch {
        throw new Error('SOURCE_REPOSITORY_DRIFT');
      }
      if (canonical(currentEvidence) !== canonical(input.validatedCheckoutEvidence)) {
        throw new Error('SOURCE_REPOSITORY_DRIFT');
      }
    }
    writeFileSync(join(temporary, 'INTAKE-RECEIPT.json'), `${canonical(input.result)}\n`, {
      mode: 0o400,
      flag: 'wx',
    });
    hardenIncomingTree(temporary, input.chmodPath ?? chmodSync);
    if (!compareStaged(temporary, expected, input.result, true)) {
      throw new Error('HARDENING_VERIFICATION_FAILED');
    }
    renameSync(temporary, finalRoot);
    return input.result;
  } catch (error) {
    cleanupOwnedIncoming(temporary, incomingIdentity);
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage === 'COPY_VERIFICATION_FAILED') {
      addException(input.exceptions, 'SOURCE_BYTES_CHANGED', 'COPY', {
        scopeId: input.scopeId,
        teamId: input.teamId,
      });
    }
    if (errorMessage === 'SOURCE_REPOSITORY_DRIFT') {
      addException(input.exceptions, 'SOURCE_REPOSITORY_DRIFT', 'COPY', {
        scopeId: input.scopeId,
        teamId: input.teamId,
      });
    }
    addException(input.exceptions, 'ATOMIC_COPY_FAILED', 'COPY', {
      error: errorMessage,
      scopeId: input.scopeId,
      teamId: input.teamId,
    });
    return reviseResult(
      input.result,
      'REJECTED',
      {
        disposition: 'FAILED',
        stagedCompleteCount: 0,
        stagingIdentitySha256,
      },
      input.exceptions,
    );
  }
}

export async function intakeTeamReturn(
  request: TeamReturnIntakeRequest,
  dependencies: TeamReturnIntakeDependencies = {},
): Promise<TeamReturnIntakeResult> {
  const exceptions: TeamReturnException[] = [];
  const mode = request.mode ?? 'DRY_RUN';
  let finalization: FinalizationAuthority | null = null;
  let materialized: MaterializedSource | null = null;
  let teamAuthority: TeamAuthority | null = null;
  let derived: { readonly candidateRoot: string; readonly teamId: TeamId } | null = null;
  let scope: TeamReturnIntakeResult['scope'] = { id: 'UNKNOWN', kind: 'UNKNOWN', rowCount: 0 };
  const rows: TeamReturnIntakeRow[] = [];
  const mechanicalAdmissions = new Map<string, CentralMechanicalValidation>();
  let assignmentId = '';
  let aggregates = makeEmptyAggregates();
  try {
    const centralRoot = resolve(request.centralRepositoryRoot);
    const authorityRoot = resolve(request.authorityRoot);
    finalization = verifyAuthorityRoot(authorityRoot, exceptions);
    if (finalization === null) {
      return makePartialResult({
        aggregates,
        assignmentId,
        copy: {
          disposition: 'VALIDATION_REJECTED',
          stagedCompleteCount: 0,
          stagingIdentitySha256: digest(canonical(null)),
        },
        decision: 'REJECTED',
        exceptions,
        finalization,
        materialized,
        mode,
        rows,
        scope,
        sourceKind: request.source.kind,
        teamAuthority,
        teamId: null,
      });
    }
    materialized = await materializeSource(
      { ...request, authorityRoot, centralRepositoryRoot: centralRoot },
      finalization.pins.repositoryCommit,
      dependencies,
      exceptions,
    );
    if (materialized === null) throw new Error('SOURCE_NOT_MATERIALIZED');
    derived = deriveCandidateRoot(materialized, exceptions);
    if (derived === null) throw new Error('TEAM_NOT_DERIVED');
    const candidatePrefix = relative(materialized.candidateRoot, derived.candidateRoot)
      .split(sep)
      .join('/');
    const candidateLedger = materialized.ledger
      .filter((file) => candidatePrefix === '' || file.path.startsWith(`${candidatePrefix}/`))
      .map((file) => ({
        ...file,
        path: candidatePrefix === '' ? file.path : file.path.slice(candidatePrefix.length + 1),
      }));
    teamAuthority = verifyTeamAuthority(
      authorityRoot,
      centralRoot,
      finalization,
      derived.teamId,
      exceptions,
    );
    if (teamAuthority === null) throw new Error('TEAM_AUTHORITY_NOT_AVAILABLE');
    assignmentId = teamAuthority.assignmentId;
    const assignmentOrder = new Map(
      teamAuthority.team.lessonIds.map((lessonId, index) => [lessonId, index]),
    );
    const activeWaveId = validateRepositoryEvidence(
      materialized.checkoutEvidence,
      derived.teamId,
      new Set(teamAuthority.team.lessonIds),
      exceptions,
    );
    const offered = resolveOfferedRows(
      derived.candidateRoot,
      activeWaveId,
      teamAuthority,
      derived.teamId,
      exceptions,
    );
    if (offered === null) throw new Error('HANDOFF_NOT_AVAILABLE');
    scope = {
      id: offered.id,
      kind: offered.kind,
      rowCount: offered.rows.length,
    };
    const derivedTeamId = derived.teamId;
    const sourcePaths = listFiles(derived.candidateRoot).map(
      (path) => `content/lesson-candidates/${derivedTeamId}/${path}`,
    );
    if (
      canonical(sourcePaths.sort()) !==
      canonical([...materialized.checkoutEvidence.changedPaths].sort())
    ) {
      addException(
        exceptions,
        materialized.kind === 'SIGNED_ARCHIVE' ? 'ARCHIVE_INVALID' : 'SHARED_PATH_CHANGED',
        'SOURCE',
        {
          changedPathClosureSha256: digest(
            canonical([...materialized.checkoutEvidence.changedPaths].sort()),
          ),
          sourcePathClosureSha256: digest(canonical(sourcePaths)),
        },
      );
    }
    const rootEntries = readdirSync(derived.candidateRoot, { withFileTypes: true });
    const allowedRootEntries = new Set([
      ...offered.rows.map((row) => row.lessonId),
      'waves',
      ...(offered.kind === 'FINAL_TEAM' ? ['TEAM-HANDOFF.json'] : []),
    ]);
    if (
      rootEntries.some(
        (entry) =>
          entry.isSymbolicLink() ||
          !allowedRootEntries.has(entry.name) ||
          (entry.name === 'waves'
            ? !entry.isDirectory()
            : entry.name === 'TEAM-HANDOFF.json'
              ? !entry.isFile()
              : !entry.isDirectory()),
      )
    ) {
      addException(
        exceptions,
        materialized.kind === 'SIGNED_ARCHIVE' ? 'ARCHIVE_INVALID' : 'WAVE_HANDOFF_INVALID',
        'SOURCE',
        {
          rootEntryClosureSha256: digest(canonical(rootEntries.map((entry) => entry.name).sort())),
        },
      );
    }
    const candidateDirectories = readdirSync(derived.candidateRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name !== 'waves')
      .map((entry) => entry.name)
      .sort();
    const offeredIds = offered.rows.map((row) => row.lessonId);
    const duplicateIds = offeredIds.filter(
      (lessonId, index) => offeredIds.indexOf(lessonId) !== index,
    );
    for (const lessonId of duplicateIds) {
      addException(exceptions, 'ROW_DUPLICATE', offered.kind === 'WAVE' ? 'WAVE' : 'TEAM', {
        lessonId,
      });
    }
    for (const lessonId of offeredIds) {
      if (!assignmentOrder.has(lessonId)) {
        addException(exceptions, 'LESSON_NOT_ASSIGNED', 'LESSON', { lessonId });
      }
    }
    const offeredSet = new Set(offeredIds);
    const candidateSet = new Set(candidateDirectories);
    for (const lessonId of candidateDirectories) {
      if (!offeredSet.has(lessonId))
        addException(exceptions, 'ROW_MISSING', 'LESSON', { lessonId });
      if (!assignmentOrder.has(lessonId)) {
        addException(exceptions, 'LESSON_NOT_ASSIGNED', 'LESSON', { lessonId });
      }
    }
    for (const lessonId of offeredSet) {
      if (!candidateSet.has(lessonId))
        addException(exceptions, 'ROW_MISSING', 'LESSON', { lessonId });
    }
    const order = offeredIds.map(
      (lessonId) => assignmentOrder.get(lessonId) ?? Number.MAX_SAFE_INTEGER,
    );
    if (order.some((ordinal, index) => index > 0 && ordinal <= (order[index - 1] ?? -1))) {
      addException(exceptions, 'ROW_ORDER_INVALID', offered.kind === 'WAVE' ? 'WAVE' : 'TEAM', {
        offeredIds,
      });
    }
    if (
      offered.kind === 'FINAL_TEAM' &&
      canonical(offeredIds) !== canonical(teamAuthority.team.lessonIds)
    ) {
      addException(exceptions, 'TEAM_HANDOFF_INVALID', 'TEAM', {
        reason: 'ASSIGNMENT_CLOSURE',
      });
    }
    for (const offeredRow of offered.rows) {
      if (!assignmentOrder.has(offeredRow.lessonId)) continue;
      const lessonRoot = join(derived.candidateRoot, offeredRow.lessonId);
      if (!directory(lessonRoot)) continue;
      const validated = validateLessonEvidence(
        lessonRoot,
        offeredRow,
        teamAuthority,
        derived.teamId,
        exceptions,
      );
      rows.push(validated.row);
      if (offeredRow.status === 'COMPLETE') {
        const mechanical = await (
          dependencies.mechanicalValidate ?? validateTeamReturnCandidateMechanically
        )(lessonRoot, offeredRow.lessonId, centralRoot);
        mechanicalAdmissions.set(offeredRow.lessonId, mechanical);
        if (
          mechanical.structural !== 'PASS' ||
          mechanical.computedQuality !== 'PASS' ||
          mechanical.normalization !== 'PASS' ||
          mechanical.protectedBoundary !== 'PASS' ||
          !DIGEST.test(mechanical.validatorEvidenceSha256)
        ) {
          addException(exceptions, 'FALSE_COMPLETE', 'LESSON', {
            lessonId: offeredRow.lessonId,
            validatorEvidenceSha256: mechanical.validatorEvidenceSha256,
          });
        }
      }
    }
    const rowCores = rows.map(({ code: _code, rowSha256: _rowSha256, ...row }) => row);
    const rootCores = rows.map((row) => ({ lessonId: row.lessonId, rootSha256: row.rootSha256 }));
    const candidateLedgerByPath = new Map(candidateLedger.map((file) => [file.path, file]));
    const sourceInventory = rows
      .filter((row) => row.status === 'COMPLETE')
      .flatMap((row) =>
        LESSON_FILES.map((path) => {
          const ledgerPath = `${row.lessonId}/${path}`;
          const identity = candidateLedgerByPath.get(ledgerPath);
          if (identity !== undefined) return identity;
          addException(exceptions, 'SOURCE_SNAPSHOT_INVALID', 'SOURCE', {
            ledgerPathSha256: digest(ledgerPath),
          });
          return { path: ledgerPath, sha256: '', size: -1 };
        }),
      )
      .sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0));
    aggregates = {
      rootSha256: digest(canonical(rootCores)),
      rowSha256: digest(canonical(rowCores)),
      sourceBatchSha256: digest(canonical(sourceInventory)),
    };
    if (exceptions.length > 0) {
      if (request.supersession !== undefined) {
        const provisional = makePartialResult({
          aggregates,
          assignmentId,
          copy: {
            disposition: 'VALIDATION_REJECTED',
            stagedCompleteCount: 0,
            stagingIdentitySha256: digest(canonical({ scopeId: scope.id, teamId: derived.teamId })),
          },
          decision: 'REJECTED',
          exceptions,
          finalization,
          materialized,
          mode,
          rows,
          scope,
          sourceKind: request.source.kind,
          teamAuthority,
          teamId: derived.teamId,
        });
        makeSupersessionBinding({
          centralRoot,
          exceptions,
          expected: sourceInventory,
          finalRoot: join(centralRoot, TEAM_RETURN_STAGING_RELATIVE_ROOT, derived.teamId, scope.id),
          request: request.supersession,
          result: provisional,
          gitRoot: materialized.checkoutRoot as string,
          teamAuthority,
        });
      }
      return makePartialResult({
        aggregates,
        assignmentId,
        copy: {
          disposition: 'VALIDATION_REJECTED',
          stagedCompleteCount: 0,
          stagingIdentitySha256: digest(canonical({ scopeId: scope.id, teamId: derived.teamId })),
        },
        decision: 'REJECTED',
        exceptions,
        finalization,
        materialized,
        mode,
        rows,
        scope,
        sourceKind: request.source.kind,
        teamAuthority,
        teamId: derived.teamId,
      });
    }
    let accepted = makePartialResult({
      aggregates,
      assignmentId,
      copy: {
        disposition: mode === 'ACCEPT' ? 'STAGED_NEW' : 'NOT_REQUESTED',
        stagedCompleteCount:
          mode === 'ACCEPT' ? rows.filter((row) => row.status === 'COMPLETE').length : 0,
        stagingIdentitySha256: digest(
          canonical({
            scopeId: scope.id,
            sourceBatchSha256: aggregates.sourceBatchSha256,
            teamId: derived.teamId,
          }),
        ),
      },
      decision: 'ACCEPTED',
      exceptions,
      finalization,
      materialized,
      mode,
      rows,
      scope,
      sourceKind: request.source.kind,
      teamAuthority,
      teamId: derived.teamId,
    });
    let supersession: TeamReturnSupersessionBinding | undefined;
    let acceptanceSourceProof = materialized.checkoutEvidence;
    let acceptanceChangedPathIdentities = materialized.changedPathIdentities;
    let acceptanceWaveTreeIdentities: readonly GitTreeFileIdentity[] = [];
    let acceptancePriorCommit = materialized.checkoutEvidence.headCommit;
    if (request.supersession !== undefined) {
      const finalRoot = join(
        centralRoot,
        TEAM_RETURN_STAGING_RELATIVE_ROOT,
        derived.teamId,
        scope.id,
      );
      supersession =
        makeSupersessionBinding({
          centralRoot,
          exceptions,
          expected: sourceInventory,
          finalRoot,
          request: request.supersession,
          result: accepted,
          gitRoot: materialized.checkoutRoot as string,
          teamAuthority,
        }) ?? undefined;
      if (supersession === undefined) {
        return reviseResult(
          accepted,
          'REJECTED',
          {
            disposition: 'REFUSED_MISMATCH',
            stagedCompleteCount: 0,
            stagingIdentitySha256: accepted.copy.stagingIdentitySha256,
          },
          exceptions,
        );
      }
      if (supersession !== undefined) {
        const predecessor = findSupersessionPredecessor(finalRoot, request.supersession, {
          centralRoot,
          gitRoot: materialized.checkoutRoot as string,
          teamAuthority,
        });
        if (predecessor === null) throw new Error('SUPERSESSION_PREDECESSOR_UNAVAILABLE');
        const reviewedSource = reviewedSupersessionSource(
          materialized,
          predecessor.receipt.source.headCommit,
          derived.teamId,
          supersession.newlyCompleteLessonIds,
        );
        acceptanceSourceProof = reviewedSource.evidence;
        acceptanceChangedPathIdentities = [...reviewedSource.identities];
        acceptanceWaveTreeIdentities = reviewedSource.waveTreeIdentities;
        acceptancePriorCommit = predecessor.receipt.source.headCommit;
        accepted = bindSupersessionResult(
          accepted,
          supersession,
          derived.candidateRoot,
          sourceInventory,
          reviewedSource.evidence,
          reviewedSource.identities,
          reviewedSource.waveTreeIdentities,
          predecessor.receipt.source.headCommit,
          centralRoot,
          teamAuthority,
          mechanicalAdmissions,
        );
        if (mode === 'DRY_RUN') {
          const teamRoot = dirname(finalRoot);
          const handle = accepted.copy.acceptance;
          if (handle === undefined) throw new Error('ACCEPTANCE_HANDLE_MISSING');
          const markerPath = join(teamRoot, handle.markerRelativePath);
          if (existsSync(markerPath) || lstatExists(markerPath)) {
            const marker = inspectAcceptanceMarker(
              teamRoot,
              handle.markerRelativePath,
              handle.manifestSha256,
            );
            const stagedGeneration =
              marker === null
                ? null
                : loadAcceptanceState(teamRoot, handle.manifestSha256, undefined, {
                    centralRoot,
                    gitRoot: materialized.checkoutRoot as string,
                    teamAuthority,
                  });
            const chain = validatedSupersessionChain(finalRoot, {
              centralRoot,
              gitRoot: materialized.checkoutRoot as string,
              teamAuthority,
            });
            if (
              stagedGeneration === null ||
              chain === null ||
              chain.at(-1)?.receipt.receiptSha256 !==
                stagedGeneration.state.receipt.receiptSha256 ||
              stagedGeneration.state.receipt.receiptSha256 !== accepted.receiptSha256 ||
              canonical(stagedGeneration.state.inventory) !== canonical(sourceInventory)
            ) {
              addException(exceptions, 'STAGING_MISMATCH', 'COPY', {
                markerRelativePath: handle.markerRelativePath,
                reason: 'ACCEPTANCE_MARKER_CONFLICT',
              });
              return reviseResult(
                accepted,
                'REJECTED',
                {
                  acceptance: handle,
                  disposition: 'REFUSED_MISMATCH',
                  stagedCompleteCount: 0,
                  stagingIdentitySha256: accepted.copy.stagingIdentitySha256,
                },
                exceptions,
              );
            }
            accepted = reviseResult(
              accepted,
              'ACCEPTED',
              {
                acceptance: {
                  ...handle,
                  ...(marker === null || stagedGeneration === null
                    ? {}
                    : { marker, objects: stagedGeneration.objects }),
                },
                disposition: 'PRESENT_IDENTICAL',
                stagedCompleteCount: rows.filter((row) => row.status === 'COMPLETE').length,
                stagingIdentitySha256: accepted.copy.stagingIdentitySha256,
              },
              exceptions,
            );
          }
        }
      }
    }
    if (mode === 'DRY_RUN') return accepted;
    const validatedMaterialized = materialized;
    const validatedFinalization = finalization;
    return await stageAcceptedBatch({
      candidateRoot: derived.candidateRoot,
      centralRoot,
      copyFile: dependencies.copyFile ?? nodeCopyFile,
      ...(dependencies.chmodPath === undefined ? {} : { chmodPath: dependencies.chmodPath }),
      expected: sourceInventory,
      exceptions,
      ...(validatedMaterialized.kind === 'CHECKOUT' &&
      validatedMaterialized.checkoutRoot !== undefined
        ? {
            reinspectCheckout: async () =>
              await (dependencies.inspectCheckout ?? inspectCheckout)(
                validatedMaterialized.checkoutRoot as string,
                validatedFinalization.pins.repositoryCommit,
              ),
          }
        : {}),
      result: accepted,
      rows,
      scopeId: scope.id,
      ...(supersession === undefined ? {} : { supersession }),
      ...(request.supersession === undefined ? {} : { supersessionRequest: request.supersession }),
      ...(dependencies.onSupersessionBoundary === undefined
        ? {}
        : { onSupersessionBoundary: dependencies.onSupersessionBoundary }),
      ...(dependencies.onBeforeSupersessionPublish === undefined
        ? {}
        : { onBeforeSupersessionPublish: dependencies.onBeforeSupersessionPublish }),
      ...(dependencies.onBeforeAcceptanceObjectValidation === undefined
        ? {}
        : {
            onBeforeAcceptanceObjectValidation: dependencies.onBeforeAcceptanceObjectValidation,
          }),
      teamId: derived.teamId,
      validatedCheckoutEvidence: validatedMaterialized.checkoutEvidence,
      acceptanceSourceProof,
      acceptanceChangedPathIdentities,
      acceptanceWaveTreeIdentities,
      acceptancePriorCommit,
      reviewedGitRoot: validatedMaterialized.checkoutRoot as string,
      teamAuthority,
      mechanicalAdmissions,
    });
  } catch (error) {
    if (
      ![
        'SOURCE_NOT_MATERIALIZED',
        'TEAM_NOT_DERIVED',
        'TEAM_AUTHORITY_NOT_AVAILABLE',
        'HANDOFF_NOT_AVAILABLE',
      ].includes(error instanceof Error ? error.message : '')
    ) {
      addException(exceptions, 'INTERNAL_INTAKE_ERROR', 'SOURCE', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return makePartialResult({
      aggregates,
      assignmentId,
      copy: {
        disposition: 'VALIDATION_REJECTED',
        stagedCompleteCount: 0,
        stagingIdentitySha256: digest(
          canonical({ scopeId: scope.id, teamId: derived?.teamId ?? null }),
        ),
      },
      decision: 'REJECTED',
      exceptions,
      finalization,
      materialized,
      mode,
      rows,
      scope,
      sourceKind: request.source.kind,
      teamAuthority,
      teamId: derived?.teamId ?? null,
    });
  } finally {
    materialized?.cleanup?.();
  }
}
