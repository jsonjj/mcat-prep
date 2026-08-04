import { execFileSync, spawnSync } from 'node:child_process';
import { createHash, createHmac, timingSafeEqual, verify as verifySignature } from 'node:crypto';
import {
  chmodSync,
  closeSync,
  constants as fsConstants,
  existsSync,
  fstatSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { copyFile as nodeCopyFile } from 'node:fs/promises';
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
}

export type TeamReturnSource =
  | { readonly kind: 'CHECKOUT'; readonly root: string }
  | {
      readonly kind: 'SIGNED_ARCHIVE';
      readonly archivePath: string;
      readonly attestationPath: string;
    };

export interface TeamReturnIntakeRequest {
  readonly authorityRoot: string;
  readonly centralRepositoryRoot: string;
  readonly mode?: 'DRY_RUN' | 'ACCEPT';
  readonly source: TeamReturnSource;
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
      | 'REFUSED_MISMATCH'
      | 'FAILED'
      | 'VALIDATION_REJECTED';
    readonly stagedCompleteCount: number;
    readonly stagingIdentitySha256: string;
  };
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
  readonly teamHint?: TeamId;
}

interface SourceIdentity {
  readonly path: string;
  readonly sha256: string;
  readonly size: number;
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
  return { ...partial, receiptSha256: digest(canonical(partial)) };
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
    }
    hardenIncomingTree(work, chmodSync);
    return {
      candidateRoot: work,
      checkoutEvidence: evidence,
      checkoutRoot,
      cleanup: () => cleanupOwnedIncoming(work, identity),
      kind: 'CHECKOUT',
      ledger,
    };
  } catch (error) {
    cleanupOwnedIncoming(work, identity);
    throw error;
  }
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
      } else if (!info.isFile() || (info.mode & 0o777) !== 0o400) {
        return false;
      }
    }
    return true;
  };
  return modesValid(finalRoot);
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

function makeEmptyAggregates(): TeamReturnIntakeResult['aggregates'] {
  const empty = digest(canonical([]));
  return { rootSha256: empty, rowSha256: empty, sourceBatchSha256: empty };
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
  readonly chmodPath: (path: string, mode: number) => void;
  readonly exceptions: TeamReturnException[];
  readonly reinspectCheckout?: () => Promise<TeamReturnCheckoutEvidence>;
  readonly validatedCheckoutEvidence: TeamReturnCheckoutEvidence;
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
    if (!compareStaged(finalRoot, expected, input.result, true)) {
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
    hardenIncomingTree(temporary, input.chmodPath);
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
    const accepted = makePartialResult({
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
    if (mode === 'DRY_RUN') return accepted;
    const validatedMaterialized = materialized;
    const validatedFinalization = finalization;
    return await stageAcceptedBatch({
      candidateRoot: derived.candidateRoot,
      centralRoot,
      copyFile: dependencies.copyFile ?? nodeCopyFile,
      chmodPath: dependencies.chmodPath ?? chmodSync,
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
      teamId: derived.teamId,
      validatedCheckoutEvidence: validatedMaterialized.checkoutEvidence,
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
