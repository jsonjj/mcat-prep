import { createHash } from 'node:crypto';
import { chmod, mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve, sep } from 'node:path';

function canonicalJsonValue(value: unknown, ancestors: Set<object>): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('NON_JSON_VALUE: number must be finite');
    return JSON.stringify(value);
  }
  if (typeof value !== 'object') {
    throw new Error(`NON_JSON_VALUE: unsupported ${typeof value}`);
  }
  if (ancestors.has(value)) throw new Error('NON_JSON_VALUE: cyclic object');
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      for (let index = 0; index < value.length; index += 1) {
        if (!(index in value)) throw new Error('NON_JSON_VALUE: sparse arrays are unsupported');
      }
      return `[${Array.from(value, (item) => canonicalJsonValue(item, ancestors)).join(',')}]`;
    }
    const prototype = Object.getPrototypeOf(value) as unknown;
    if (prototype !== Object.prototype && prototype !== null) {
      throw new Error('NON_JSON_VALUE: object must have a plain prototype');
    }
    if (Object.getOwnPropertySymbols(value).length > 0) {
      throw new Error('NON_JSON_VALUE: symbol keys are unsupported');
    }
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJsonValue(record[key], ancestors)}`)
      .join(',')}}`;
  } finally {
    ancestors.delete(value);
  }
}

export function canonicalKitJson(value: unknown): string {
  return canonicalJsonValue(value, new Set<object>());
}

export interface KitArchiveFile {
  readonly path: string;
  readonly bytes: string | Uint8Array;
  readonly mode?: number;
  readonly sourcePath?: string;
  readonly sourceSha256?: string;
  readonly parityClass?: 'core' | 'team-metadata';
}

export interface KitZipEntry {
  readonly path: string;
  readonly bytes: Uint8Array;
  readonly mode: number;
  readonly modifiedAt: string;
  readonly compressionMethod: 'STORE';
}

export interface IsolatedZipExtraction {
  readonly directory: string;
  readonly entries: readonly KitZipEntry[];
}

export type SmokeCommandId = 'bootstrap' | 'install' | 'one-template';

export interface SmokeCommand {
  readonly id: SmokeCommandId;
  readonly executable: string;
  readonly args: readonly string[];
  readonly cwd: string;
}

export interface CommandRunnerRequest {
  readonly executable: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly environment: Readonly<Record<string, string>>;
  readonly shell: false;
  readonly timeoutMs: number;
  readonly maxStdoutBytes: number;
  readonly maxStderrBytes: number;
}

export interface CommandRunnerResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly timedOut?: boolean;
}

export interface CommandRunner {
  readonly run: (request: CommandRunnerRequest) => Promise<CommandRunnerResult>;
}

export interface CommandSmokeReceipt {
  readonly id: SmokeCommandId;
  readonly status: 'TOOLING_TEST_PASS';
  readonly stdoutSha256: string;
  readonly stderrSha256: string;
}

export type KitBoundaryCode =
  | 'INVENTORY_MISMATCH'
  | 'INVENTORY_LIMIT'
  | 'UNSUPPORTED_MEDIA_TYPE'
  | 'UNSUPPORTED_BINARY_PAYLOAD'
  | 'TEXT_ENCODING_INVALID'
  | 'TEXT_ENCODING_AMBIGUOUS'
  | 'TEXT_DECODE_LIMIT'
  | 'STRUCTURED_TEXT_INVALID'
  | 'NESTED_ARCHIVE'
  | 'ENV_FILE'
  | 'SECRET_MATERIAL'
  | 'PRIVATE_SOURCE'
  | 'KAPLAN_MATERIAL'
  | 'PROTECTED_CORPUS'
  | 'ANSWER_KEY'
  | 'AUTHOR_JUDGE_BOUNDARY';

export interface KitBoundaryViolation {
  readonly code: KitBoundaryCode;
  readonly path: string;
  readonly message: string;
}

export type KitMediaType =
  | 'text/plain'
  | 'application/json'
  | 'application/yaml'
  | 'text/x-env'
  | 'application/octet-stream'
  | 'application/zip';

export interface KitAllowedInventoryEntry {
  readonly path: string;
  readonly sha256: string;
  readonly mediaType: KitMediaType;
  readonly allowNestedArchive?: boolean;
}

export interface KitResourceLimits {
  readonly maxArchiveBytes: number;
  readonly maxEntries: number;
  readonly maxEntryCompressedBytes: number;
  readonly maxEntryUncompressedBytes: number;
  readonly maxTotalUncompressedBytes: number;
  readonly maxCompressionRatio: number;
  readonly maxPathBytes: number;
  readonly maxPathDepth: number;
  readonly maxManifestBytes: number;
  readonly maxInventoryEntries: number;
  readonly maxTextDecodeBytes: number;
  readonly smokeTimeoutMs: number;
  readonly maxStdoutBytes: number;
  readonly maxStderrBytes: number;
  readonly maxArgCount: number;
  readonly maxArgBytes: number;
  readonly maxTotalArgBytes: number;
}

export const KIT_FACTORY_RESOURCE_LIMITS: KitResourceLimits = Object.freeze({
  maxArchiveBytes: 128 * 1024 * 1024,
  maxEntries: 512,
  maxEntryCompressedBytes: 32 * 1024 * 1024,
  maxEntryUncompressedBytes: 32 * 1024 * 1024,
  maxTotalUncompressedBytes: 128 * 1024 * 1024,
  maxCompressionRatio: 100,
  maxPathBytes: 512,
  maxPathDepth: 16,
  maxManifestBytes: 2 * 1024 * 1024,
  maxInventoryEntries: 512,
  maxTextDecodeBytes: 8 * 1024 * 1024,
  smokeTimeoutMs: 30_000,
  maxStdoutBytes: 1024 * 1024,
  maxStderrBytes: 1024 * 1024,
  maxArgCount: 64,
  maxArgBytes: 4096,
  maxTotalArgBytes: 16 * 1024,
});

export type KitTeamId = 'team-A' | 'team-B';
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
]);

export interface KitIdentityPins {
  readonly repositoryCommit: string;
  readonly kitSha256: string;
  readonly profileSha256: string;
  readonly schemaSha256: string;
  readonly templateSha256: string;
  readonly curriculumSha256: string;
  readonly toolVersions: Readonly<Record<string, string>>;
}

export interface ValidatedPacketBinding {
  readonly lessonId: string;
  readonly packetId: string;
  readonly revision: string;
  readonly path: string;
  readonly sha256: string;
  readonly contentSha256: string;
}

export interface ValidatedAssignmentProjection {
  readonly runId: string;
  readonly teamId: KitTeamId;
  readonly laneId: string;
  readonly assignmentId: string;
  readonly assignmentBindingId: string;
  readonly contractVersion: string;
  readonly schemaVersion: string;
  readonly generation: number;
  readonly fileSha256: string;
  readonly bindings: readonly ValidatedPacketBinding[];
  readonly pins: KitIdentityPins;
}

export interface ValidatedPacketProjection {
  readonly runId: string;
  readonly lessonId: string;
  readonly packetId: string;
  readonly revision: string;
  readonly teamId: KitTeamId;
  readonly laneId: string;
  readonly assignmentId: string;
  readonly assignmentBindingId: string;
  readonly contractVersion: string;
  readonly schemaVersion: string;
  readonly generation: number;
  readonly status: 'READY' | 'BLOCKED';
  readonly pins: KitIdentityPins;
  readonly fileSha256: string;
  readonly contentSha256: string;
  readonly sourcePacketPath: string;
}

export interface KitCohortIdentity {
  readonly assignmentId: string;
  readonly assignmentBindingId: string;
  readonly contractVersion: string;
  readonly schemaVersion: string;
  readonly generation: number;
}

export type FinalValidationResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly errors: readonly string[] };

export interface KitDocumentInput extends KitArchiveFile {
  readonly document: unknown;
  readonly expectedSha256: string;
}

export interface FinalInputValidators {
  readonly validateAssignment: (input: {
    readonly path: string;
    readonly bytes: Uint8Array;
    readonly document: unknown;
  }) => FinalValidationResult<ValidatedAssignmentProjection>;
  readonly validatePacket: (input: {
    readonly path: string;
    readonly bytes: Uint8Array;
    readonly document: unknown;
  }) => FinalValidationResult<ValidatedPacketProjection>;
}

export interface TeamKitInput {
  readonly kitFormat?: 'lesson-generation-kit-v1/2';
  readonly repositoryUrl?: string;
  readonly allowedOutputRoot?: string;
  readonly forbiddenSharedPaths?: readonly string[];
  readonly runtimeRequirements?: {
    readonly nodeMajorMinimum: number;
    readonly packageManager: string;
    readonly installPolicy: 'FROZEN_OFFLINE_IGNORE_SCRIPTS';
  };
  readonly deterministicInstallCommand?: string;
  readonly handoffEndpoint?: string;
  readonly validatorAuthority?: KitValidatorAuthority;
  readonly runId: string;
  readonly teamId: KitTeamId;
  readonly laneId: string;
  readonly assembledAt: string;
  readonly lifecycle: string;
  readonly deadline: string;
  readonly branchConvention: string;
  readonly expectedPins: KitIdentityPins;
  readonly expectedCohort: KitCohortIdentity;
  readonly requiredCorePaths: readonly string[];
  readonly allowedInventory: readonly KitAllowedInventoryEntry[];
  readonly coreFiles: readonly KitArchiveFile[];
  readonly assignment: KitDocumentInput;
  readonly packets: readonly KitDocumentInput[];
}

export type KitFactoryBlockCode =
  | 'CORE_FILE_PARITY_MISMATCH'
  | 'ASSIGNMENT_SCHEMA_REJECTED'
  | 'PACKET_SCHEMA_REJECTED';

export interface KitFactoryBlocker {
  readonly code: KitFactoryBlockCode | string;
  readonly path: string;
  readonly message: string;
}

export class KitFactoryError extends Error {
  readonly blockers: readonly KitFactoryBlocker[];

  constructor(blockers: readonly KitFactoryBlocker[]) {
    super(
      blockers.map((blocker) => `${blocker.code}:${blocker.path}: ${blocker.message}`).join('; '),
    );
    this.name = 'KitFactoryError';
    this.blockers = blockers;
  }
}

export interface KitManifestFile {
  readonly path: string;
  readonly sha256: string;
  readonly size: number;
  readonly mode: number;
  readonly kind: 'core' | 'team-metadata' | 'assignment' | 'packet';
  readonly sourcePath?: string;
  readonly sourceSha256?: string;
}

export interface KitSourceMapping {
  readonly archivePath: string;
  readonly archiveSha256: string;
  readonly sourcePath: string;
  readonly sourceSha256: string;
}

export interface KitManifest {
  readonly format: 'wp-03-kit-manifest/1' | 'lesson-generation-kit-v1/2';
  readonly runId: string;
  readonly teamId: KitTeamId;
  readonly laneId: string;
  readonly assignmentId: string;
  readonly assignmentBindingId: string;
  readonly contractVersion: string;
  readonly schemaVersion: string;
  readonly generation: number;
  readonly assembledAt: string;
  readonly lifecycle: string;
  readonly deadline: string;
  readonly branchConvention: string;
  readonly repositoryUrl?: string;
  readonly repositoryCommit?: string;
  readonly allowedOutputRoot?: string;
  readonly forbiddenSharedPaths?: readonly string[];
  readonly runtimeRequirements?: TeamKitInput['runtimeRequirements'];
  readonly deterministicInstallCommand?: string;
  readonly handoffEndpoint?: string;
  readonly validatorAuthority?: KitValidatorAuthority;
  readonly pins: KitIdentityPins;
  readonly assignmentSha256: string;
  readonly inventorySha256: string;
  readonly filesSha256?: string;
  readonly allowedLessonIds: readonly string[];
  readonly allowedPaths: readonly string[];
  readonly packetCount: 30;
  readonly coreFiles: readonly KitManifestFile[];
  readonly files: readonly KitManifestFile[];
  readonly sourceMappings?: readonly KitSourceMapping[];
  readonly readOrder?: readonly string[];
  readonly nonclaims?: {
    readonly officialRubricPass: false;
    readonly humanApproved: false;
    readonly publicationApproved: false;
  };
  readonly manifestHashRule: 'KIT-MANIFEST.json is self-excluded; READY.json pins its SHA-256';
}

export interface KitValidatorAuthorityFile {
  readonly path: string;
  readonly sha256: string;
  readonly gitBlobSha256: string;
}

export interface KitValidatorAuthority {
  readonly repositoryCommit: string;
  readonly aggregateSha256: string;
  readonly files: readonly KitValidatorAuthorityFile[];
}

export interface KitCandidate {
  readonly kind: 'KIT_CANDIDATE';
  readonly teamId: KitTeamId;
  readonly userSendable: false;
  readonly manifest: KitManifest;
  readonly manifestBytes: string;
  readonly manifestSha256: string;
  readonly archiveBytes: Uint8Array;
  readonly archiveSha256: string;
}

export interface FederatedKitCandidates {
  readonly teamA: KitCandidate;
  readonly teamB: KitCandidate;
}

export interface KitVerificationChecks {
  readonly cleanExtraction: 'PASS';
  readonly archiveHash: 'PASS';
  readonly manifestClosure: 'PASS';
  readonly assignmentSchema: 'PASS';
  readonly packetSchema: 'PASS';
  readonly packetMembership: 'PASS';
  readonly boundaryScan: 'PASS';
  readonly bootstrapSmoke: 'PASS';
  readonly installSmoke: 'PASS';
  readonly oneTemplateSmoke: 'PASS';
}

export interface VerifiedKitCandidate {
  readonly kind: 'VERIFIED_KIT_CANDIDATE';
  readonly teamId: KitTeamId;
  readonly userSendable: false;
  readonly candidate: KitCandidate;
  readonly checks: KitVerificationChecks;
  readonly smokeReceipts: readonly CommandSmokeReceipt[];
}

export interface ModeledCurrentBundle {
  readonly teamId: KitTeamId;
  readonly status: 'MODELED_CURRENT';
  readonly archiveSha256: string;
  readonly manifestSha256: string;
  readonly assembledAt: string;
}

export interface ModeledSupersededBundle {
  readonly teamId: KitTeamId;
  readonly status: 'MODELED_SUPERSEDED';
  readonly archiveSha256: string;
  readonly manifestSha256: string;
  readonly assembledAt: string;
  readonly supersededByArchiveSha256: string;
  readonly supersededInGeneration: number;
}

export interface FederatedReadinessState {
  readonly format: 'wp-03-in-memory-supersession-model/1';
  readonly authority: 'IN_MEMORY_MODEL_ONLY';
  readonly runId: string;
  readonly status: 'MODELING';
  readonly generation: number;
  readonly userSendable: false;
  readonly current: readonly ModeledCurrentBundle[];
  readonly history: readonly ModeledSupersededBundle[];
}

export interface ProductionAuthorizationBinding {
  readonly runId: string;
  readonly teams: readonly {
    readonly teamId: KitTeamId;
    readonly archiveSha256: string;
    readonly manifestSha256: string;
    readonly assignmentSha256: string;
    readonly repositoryCommit: string;
    readonly schemaSha256: string;
    readonly profileSha256: string;
    readonly templateSha256: string;
    readonly kitSha256: string;
    readonly curriculumSha256: string;
    readonly toolVersionsSha256: string;
  }[];
}

export interface ProductionWriterAdapter {
  readonly acquireLock: () => Promise<void>;
  readonly stageWrite: () => Promise<void>;
  readonly fsyncStagedState: () => Promise<void>;
  readonly atomicRename: () => Promise<void>;
  readonly rollback: () => Promise<void>;
  readonly publishSingleReady: () => Promise<void>;
}

const ZIP_LOCAL_FILE_HEADER = 0x04034b50;
const ZIP_CENTRAL_DIRECTORY_HEADER = 0x02014b50;
const ZIP_END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const ZIP_UTF8_FLAG = 0x0800;
const ZIP_STORE_METHOD = 0;
const ZIP_DOS_TIME = 0;
const ZIP_DOS_DATE = 0x0021;
const ZIP_VERSION = 20;
const ZIP_UNIX_VERSION = 0x0314;

const CRC32_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = (value & 1) === 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

function crc32(bytes: Uint8Array): number {
  let value = 0xffffffff;
  for (const byte of bytes) {
    value = (CRC32_TABLE[(value ^ byte) & 0xff] ?? 0) ^ (value >>> 8);
  }
  return (value ^ 0xffffffff) >>> 0;
}

function archiveBytes(value: string | Uint8Array): Buffer {
  return typeof value === 'string' ? Buffer.from(value, 'utf8') : Buffer.from(value);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sha256Hex(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

function boundedResourceLimits(overrides: Partial<KitResourceLimits> = {}): KitResourceLimits {
  const result = { ...KIT_FACTORY_RESOURCE_LIMITS };
  for (const [name, configured] of Object.entries(overrides) as [
    keyof KitResourceLimits,
    number,
  ][]) {
    if (!Number.isFinite(configured) || configured <= 0) {
      throw new Error(`INVALID_RESOURCE_LIMIT: ${name}`);
    }
    result[name] = Math.min(result[name], configured);
  }
  return result;
}

function strictUtf8(bytes: Uint8Array): { readonly text: string } | { readonly error: string } {
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes);
  } catch {
    return { error: 'TEXT_ENCODING_INVALID' };
  }
  if (
    text.includes('\uFFFD') ||
    text.startsWith('\uFEFF') ||
    !Buffer.from(text, 'utf8').equals(Buffer.from(bytes))
  ) {
    return { error: 'TEXT_ENCODING_AMBIGUOUS' };
  }
  return { text };
}

function boundaryCodesForKey(key: string): KitBoundaryCode[] {
  const normalized = key
    .normalize('NFC')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
  const codes = new Set<KitBoundaryCode>();
  if (
    /^(?:password|passwd|secret|secrets|secretkey|secretmaterial|clientsecret|token|authtoken|accesstoken|refreshtoken|apitoken|apikey|privatekey|credentials?)$/.test(
      normalized,
    )
  ) {
    codes.add('SECRET_MATERIAL');
  }
  if (
    /^(?:answer|answers|answerkey|correctanswer|correctanswers|expectedlabel|expectedlabels)$/.test(
      normalized,
    )
  ) {
    codes.add('ANSWER_KEY');
  }
  if (/supervisor|judge|expectedlabel/.test(normalized)) {
    codes.add('AUTHOR_JUDGE_BOUNDARY');
  }
  if (/private|privatenotes|privatecorpus|credentials?/.test(normalized)) {
    codes.add('PRIVATE_SOURCE');
  }
  if (/protected|protectedcorpus/.test(normalized)) {
    codes.add('PROTECTED_CORPUS');
  }
  if (/kaplan/.test(normalized)) {
    codes.add('KAPLAN_MATERIAL');
    codes.add('PRIVATE_SOURCE');
  }
  return [...codes];
}

function boundaryCodesForStructuredValue(key: string, value: unknown): KitBoundaryCode[] {
  const normalizedKey = key
    .normalize('NFC')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
  if (!/(?:path|source|content|notes|corpus|credential|label|answer)/.test(normalizedKey)) {
    return [];
  }
  const strings: string[] = [];
  const collect = (candidate: unknown): void => {
    if (typeof candidate === 'string') {
      strings.push(candidate);
    } else if (Array.isArray(candidate)) {
      for (const item of candidate) collect(item);
    }
  };
  collect(value);
  const codes = new Set<KitBoundaryCode>();
  for (const text of strings) {
    const normalized = text
      .normalize('NFC')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ');
    if (/\bprivate\b|\bprivatecorpus\b/.test(normalized)) codes.add('PRIVATE_SOURCE');
    if (/\bprotected\b|\bprotectedcorpus\b/.test(normalized)) codes.add('PROTECTED_CORPUS');
    if (/\bsupervisor\b/.test(normalized)) codes.add('AUTHOR_JUDGE_BOUNDARY');
    if (/\bkaplan\b/.test(normalized)) {
      codes.add('KAPLAN_MATERIAL');
      codes.add('PRIVATE_SOURCE');
    }
    if (/\b(?:answer key|correct answer|expected label)\b/.test(normalized)) {
      codes.add('ANSWER_KEY');
    }
  }
  return [...codes];
}

const MODULE_POLICY_VOCABULARY_HASHES = new Map([
  [
    'content/lesson-factory/deadline-profile/deadline-profile.json',
    '681d2864fbf22bfa3f947e4e21f846fe8ee5913ff91e82f56c95708cd344562c',
  ],
  [
    'content/lesson-factory/deadline-profile/owner-source-use-receipt.json',
    '04a2ac3b1e1eb8030f1b4f53db4d8ee5b74eee824c0c30318c30e780a6a98c68',
  ],
  [
    'content/lesson-factory/schemas/shared-vocabulary.schema.json',
    '279c33afcae9ef3dd3388169c2424fe3891dee0116ba32823130602bee1a9968',
  ],
  [
    'docs/lesson-authoring/template/v3-les-000000/lesson-script.json',
    'cfa1f44a8da22af45ba8af8d7f898ba176a21a1cb0259bf98a9b0ca5142d8011',
  ],
  ['JUDGE-INSTRUCTIONS.md', '49c742fa53ad22266ca9622ca6c40c09d25d79c4ea89030ea3c2f1934b91b2ae'],
  ['AUTHOR-INSTRUCTIONS.md', '1579bfd378cf2603b7842c348e24fc32f92a8330eacbb78853458d2e23ab1827'],
  [
    'deadline-profile/rubric-profile.json',
    '681d2864fbf22bfa3f947e4e21f846fe8ee5913ff91e82f56c95708cd344562c',
  ],
  [
    'deadline-profile/source-use-receipt.json',
    '04a2ac3b1e1eb8030f1b4f53db4d8ee5b74eee824c0c30318c30e780a6a98c68',
  ],
  [
    'handoff/LESSON-HANDOFF-TEMPLATE.json',
    'd66a54a45eb22cd5c8c84734b84466e9ea14e7d2ff4e2354e8f6ba1884fcd982',
  ],
  [
    'judge-docs/lesson-quality-evidence-protocol.md',
    '0834b559c1ff2b0321a60119e731c457929032ab843c65a004ebf8d3d87a80b7',
  ],
  [
    'judge-docs/lesson-quality-judge-protocol.md',
    'ec2233d5d47ecd452469ec7f9c96de32b73726bed504aedb1852ca7c73707f12',
  ],
  [
    'schemas/deadline-profile.schema.json',
    'ddbd6b89644d6de950704b3b41a0c6e4c6718fda03f153238bc62de5bd6a656f',
  ],
  [
    'schemas/lesson-bundle.schema.json',
    '564ee727259205284784d0bea9fe84f9000f98a9d0004ccf9459ea1a6fba5935',
  ],
  [
    'schemas/lesson-handoff.schema.json',
    'b854196296554e21980f8916c7de2aa9f0511c673dcf4f1792f0498322f81a86',
  ],
  [
    'schemas/shared-vocabulary.schema.json',
    '279c33afcae9ef3dd3388169c2424fe3891dee0116ba32823130602bee1a9968',
  ],
  [
    'template/v3-les-000000/artifact-manifest.json',
    '2b6441889dc5e4b4c9b38ef6865d87c37c4f0d92867a5df71159c3dfd2d9c0b2',
  ],
  [
    'template/v3-les-000000/lesson-script.json',
    'cfa1f44a8da22af45ba8af8d7f898ba176a21a1cb0259bf98a9b0ca5142d8011',
  ],
  [
    'template/v3-les-000000/protected-items.json',
    '9b3f8c4f230501b391a99b21335568eea4bbcfe3e2302f07819bee03f8f4d952',
  ],
  ['commands/kit-command.mjs', 'e8d8729e92eda450ace98e786840664e7675c4bbea82a12b5c348dafefa6d734'],
]);

function structuredBoundaryKeys(value: unknown, result: Set<KitBoundaryCode>): void {
  if (Array.isArray(value)) {
    for (const item of value) structuredBoundaryKeys(item, result);
    return;
  }
  if (value === null || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    for (const code of boundaryCodesForKey(key)) result.add(code);
    for (const code of boundaryCodesForStructuredValue(key, child)) result.add(code);
    structuredBoundaryKeys(child, result);
  }
}

function hasArchiveMagic(bytes: Uint8Array): boolean {
  return (
    (bytes[0] === 0x50 &&
      bytes[1] === 0x4b &&
      ((bytes[2] === 0x03 && bytes[3] === 0x04) ||
        (bytes[2] === 0x05 && bytes[3] === 0x06) ||
        (bytes[2] === 0x07 && bytes[3] === 0x08))) ||
    (bytes[0] === 0x1f && bytes[1] === 0x8b)
  );
}

function authoritativeMediaType(path: string): KitMediaType | undefined {
  const normalized = path.normalize('NFC').toLowerCase();
  const basename = normalized.split('/').at(-1) ?? '';
  if (
    basename === '.npmrc' ||
    basename === '.env' ||
    basename === '.envrc' ||
    basename.startsWith('.env.') ||
    basename.endsWith('.env')
  ) {
    return 'text/x-env';
  }
  if (
    normalized.endsWith('.json') ||
    basename === 'package.json' ||
    basename === 'kit-manifest.json' ||
    basename === 'ready.json'
  ) {
    return 'application/json';
  }
  if (normalized.endsWith('.yaml') || normalized.endsWith('.yml')) {
    return 'application/yaml';
  }
  if (
    normalized.endsWith('.md') ||
    normalized.endsWith('.txt') ||
    normalized.endsWith('.log') ||
    normalized.endsWith('.sha256') ||
    /^readme(?:\.|$)/.test(basename)
  ) {
    return 'text/plain';
  }
  return undefined;
}

const MODULE_BINARY_ALLOWLIST: readonly KitAllowedInventoryEntry[] = Object.freeze([]);

function isModuleAllowedBinary(
  path: string,
  mediaType: KitMediaType | undefined,
  sha256: string,
): boolean {
  return MODULE_BINARY_ALLOWLIST.some(
    (entry) => entry.path === path && entry.mediaType === mediaType && entry.sha256 === sha256,
  );
}

export function scanKitBoundaries(
  files: readonly KitArchiveFile[],
  inventory: readonly KitAllowedInventoryEntry[],
): KitBoundaryViolation[] {
  const violations: KitBoundaryViolation[] = [];
  const add = (code: KitBoundaryCode, path: string, message: string): void => {
    if (!violations.some((violation) => violation.code === code && violation.path === path)) {
      violations.push({ code, path, message });
    }
  };

  if (inventory.length > KIT_FACTORY_RESOURCE_LIMITS.maxInventoryEntries) {
    add('INVENTORY_LIMIT', '<inventory>', 'closed inventory exceeds its entry limit');
  }
  const inventoryByPath = new Map<string, KitAllowedInventoryEntry[]>();
  for (const entry of inventory) {
    const matches = inventoryByPath.get(entry.path) ?? [];
    matches.push(entry);
    inventoryByPath.set(entry.path, matches);
  }

  for (const file of files) {
    const bytes = archiveBytes(file.bytes);
    const pathMediaType = authoritativeMediaType(file.path);
    let effectiveMediaType = pathMediaType;
    let decodedForScan: { readonly text: string } | { readonly error: string } | undefined;
    if (pathMediaType !== undefined) {
      if (bytes.length > KIT_FACTORY_RESOURCE_LIMITS.maxTextDecodeBytes) {
        add('TEXT_DECODE_LIMIT', file.path, 'authoritative text exceeds its decode limit');
      } else {
        decodedForScan = strictUtf8(bytes);
      }
    } else if (bytes.length <= KIT_FACTORY_RESOURCE_LIMITS.maxTextDecodeBytes) {
      const detected = strictUtf8(bytes);
      if ('text' in detected) {
        effectiveMediaType = 'text/plain';
        decodedForScan = detected;
      }
    }
    const inventoryMatches = inventoryByPath.get(file.path) ?? [];
    const inventoryEntry = inventoryMatches.length === 1 ? inventoryMatches[0] : undefined;
    const actualSha256 = sha256Hex(bytes);
    const moduleAuthorizedPolicyDocument =
      MODULE_POLICY_VOCABULARY_HASHES.get(file.path) === actualSha256;
    const moduleAllowedBinary = isModuleAllowedBinary(
      file.path,
      inventoryEntry?.mediaType,
      actualSha256,
    );
    if (
      inventoryEntry === undefined ||
      inventoryEntry.sha256 !== actualSha256 ||
      !/^[a-f0-9]{64}$/.test(inventoryEntry.sha256) ||
      (effectiveMediaType !== undefined && inventoryEntry.mediaType !== effectiveMediaType) ||
      (effectiveMediaType === undefined && !moduleAllowedBinary)
    ) {
      add(
        'INVENTORY_MISMATCH',
        file.path,
        'path, media type, and exact SHA-256 must resolve once in the closed inventory',
      );
    }
    const normalizedPath = file.path.toLowerCase();
    const segments = normalizedPath.split('/');
    const boundarySegments = moduleAuthorizedPolicyDocument ? [] : segments;

    if (pathMediaType === 'text/x-env') {
      add('ENV_FILE', file.path, 'environment files are not permitted in teammate kits');
    }
    for (const segment of boundarySegments) {
      const token = segment.replace(/\.[^.]*$/, '');
      for (const code of boundaryCodesForKey(token)) {
        add(code, file.path, 'normalized path token crosses a protected boundary');
      }
    }
    if (
      boundarySegments.some(
        (segment) =>
          segment === 'private' ||
          segment === 'credentials' ||
          segment === 'secrets' ||
          segment.startsWith('private-') ||
          segment.includes('private-note'),
      )
    ) {
      add('PRIVATE_SOURCE', file.path, 'private-source paths are outside the author boundary');
    }
    if (boundarySegments.some((segment) => segment.includes('kaplan'))) {
      add('KAPLAN_MATERIAL', file.path, 'Kaplan-derived paths are not permitted');
    }
    if (
      boundarySegments.some(
        (segment) =>
          segment === 'protected' ||
          segment.startsWith('protected-') ||
          segment.includes('protected-corpus'),
      )
    ) {
      add('PROTECTED_CORPUS', file.path, 'protected-corpus paths are not permitted');
    }
    if (
      !moduleAuthorizedPolicyDocument &&
      /answer[-_ ]?key|correct[-_ ]?answers?/.test(normalizedPath)
    ) {
      add('ANSWER_KEY', file.path, 'answer-key paths are outside the author boundary');
    }
    if (
      boundarySegments.some(
        (segment) =>
          segment === 'judge' ||
          segment === 'judges' ||
          segment === 'supervisor' ||
          segment.startsWith('expected-label') ||
          segment.includes('supervisor') ||
          segment.includes('expected-label'),
      )
    ) {
      add(
        'AUTHOR_JUDGE_BOUNDARY',
        file.path,
        'judge, supervisor, and expected-label files are not author inputs',
      );
    }

    if (hasArchiveMagic(bytes) && !moduleAllowedBinary) {
      add('NESTED_ARCHIVE', file.path, 'nested archives require an exact path/hash allowlist');
    }

    if (effectiveMediaType === undefined && !moduleAllowedBinary) {
      add(
        'UNSUPPORTED_BINARY_PAYLOAD',
        file.path,
        'binary payload is absent from the module-owned path/media/hash allowlist',
      );
    }
    const mediaType = effectiveMediaType;
    const isText =
      mediaType === 'text/plain' ||
      mediaType === 'application/json' ||
      mediaType === 'application/yaml' ||
      mediaType === 'text/x-env';
    if (
      mediaType !== undefined &&
      !isText &&
      mediaType !== 'application/octet-stream' &&
      mediaType !== 'application/zip'
    ) {
      add('UNSUPPORTED_MEDIA_TYPE', file.path, 'media type is not supported');
    }
    if (!isText) continue;
    if (bytes.length > KIT_FACTORY_RESOURCE_LIMITS.maxTextDecodeBytes) continue;
    const decoded = decodedForScan ?? strictUtf8(bytes);
    if ('error' in decoded) {
      add(
        decoded.error as 'TEXT_ENCODING_INVALID' | 'TEXT_ENCODING_AMBIGUOUS',
        file.path,
        'declared text must be strict round-tripping UTF-8 without BOM or replacement characters',
      );
      continue;
    }
    const text = decoded.text;
    const policyVocabularyDocument = moduleAuthorizedPolicyDocument;
    if (
      /-----BEGIN (?:[A-Z0-9]+ )?PRIVATE KEY-----/.test(text) ||
      /\bAKIA[0-9A-Z]{16}\b/.test(text) ||
      /(?:^|\n)\s*["']?(?:AWS_SECRET_ACCESS_KEY|DATABASE_URL|PRIVATE_KEY|API_TOKEN|PASSWORD|CLIENT_SECRET|TOKEN|_?AUTH_TOKEN)["']?\s*[:=]/i.test(
        text,
      )
    ) {
      add('SECRET_MATERIAL', file.path, 'secret-like material is not permitted');
    }
    if (
      (!policyVocabularyDocument && /PROTECTED_CORPUS_(?:BEGIN|RECORD|FIXTURE)/i.test(text)) ||
      (!policyVocabularyDocument && /["'](?:protected|is_protected)["']\s*:\s*true/i.test(text))
    ) {
      add('PROTECTED_CORPUS', file.path, 'protected-corpus material is not permitted');
    }
    if (
      (!policyVocabularyDocument &&
        /["']source_class["']\s*:\s*["']PRIVATE_COMPARISON["']/i.test(text)) ||
      (!policyVocabularyDocument &&
        /KAPLAN_(?:PRIVATE|PROPRIETARY|CORPUS|QUESTION|PASSAGE)/i.test(text))
    ) {
      add('PRIVATE_SOURCE', file.path, 'private-source material is not permitted');
    }
    if (/KAPLAN_(?:PRIVATE|PROPRIETARY|CORPUS|QUESTION|PASSAGE)/i.test(text)) {
      add('KAPLAN_MATERIAL', file.path, 'Kaplan-derived material is not permitted');
    }
    if (
      /(?:^|[,{]\s*)["']?(?:answer_key|correct_answer|expected_label|expected_labels)["']?\s*:\s*(?!"?(?:false|null)"?\s*[,}])/im.test(
        text,
      )
    ) {
      add('ANSWER_KEY', file.path, 'answer-key or expected-label data is not permitted');
    }
    const structuredCodes = new Set<KitBoundaryCode>();
    const trimmedText = text.trimStart();
    if (
      mediaType === 'application/json' ||
      trimmedText.startsWith('{') ||
      trimmedText.startsWith('[')
    ) {
      try {
        if (!policyVocabularyDocument) {
          structuredBoundaryKeys(JSON.parse(text), structuredCodes);
        }
      } catch {
        if (mediaType === 'application/json') {
          add('STRUCTURED_TEXT_INVALID', file.path, 'declared JSON must parse exactly');
        }
      }
    }
    const keyPattern = /^\s*["']?([A-Za-z0-9_.-]+)["']?\s*[:=]\s*(.*)$/gm;
    if (!policyVocabularyDocument) {
      for (const match of text.matchAll(keyPattern)) {
        const key = match[1] ?? '';
        for (const code of boundaryCodesForKey(key)) structuredCodes.add(code);
        for (const code of boundaryCodesForStructuredValue(key, match[2] ?? '')) {
          structuredCodes.add(code);
        }
      }
    }
    for (const code of structuredCodes) {
      add(code, file.path, 'structured content crosses a protected author boundary');
    }
  }

  for (const path of inventoryByPath.keys()) {
    if (!files.some((file) => file.path === path)) {
      add('INVENTORY_MISMATCH', path, 'closed inventory contains a path not present in the kit');
    }
  }

  return violations.sort(
    (left, right) => compareText(left.path, right.path) || compareText(left.code, right.code),
  );
}

export function createDeterministicZip(files: readonly KitArchiveFile[]): Uint8Array {
  const limits = KIT_FACTORY_RESOURCE_LIMITS;
  if (files.length > limits.maxEntries) {
    throw new Error('ENTRY_COUNT_LIMIT: archive inventory is too large');
  }
  const seenPaths = new Set<string>();
  const seenCollisionKeys = new Set<string>();
  let totalBytes = 0;
  for (const file of files) {
    assertSafeArchivePath(file.path);
    assertArchivePathResourceLimits(file.path, limits);
    assertSafeArchiveMode(file.mode ?? 0o644, file.path);
    if (seenPaths.has(file.path)) {
      throw new Error(`DUPLICATE_ARCHIVE_PATH: refused ${JSON.stringify(file.path)}`);
    }
    const collisionKey = archivePathCollisionKey(file.path);
    if (seenCollisionKeys.has(collisionKey)) {
      throw new Error(`ARCHIVE_PATH_COLLISION: refused ${JSON.stringify(file.path)}`);
    }
    seenPaths.add(file.path);
    seenCollisionKeys.add(collisionKey);
    const size = archiveBytes(file.bytes).length;
    if (
      size > limits.maxEntryCompressedBytes ||
      size > limits.maxEntryUncompressedBytes ||
      totalBytes + size > limits.maxTotalUncompressedBytes
    ) {
      throw new Error(`ENTRY_SIZE_LIMIT: refused ${JSON.stringify(file.path)}`);
    }
    totalBytes += size;
  }
  const ordered = files
    .map((file) => ({
      path: file.path,
      name: Buffer.from(file.path, 'utf8'),
      bytes: archiveBytes(file.bytes),
      mode: file.mode ?? 0o644,
    }))
    .sort((left, right) => compareText(left.path, right.path));
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let localOffset = 0;

  for (const file of ordered) {
    const checksum = crc32(file.bytes);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(ZIP_LOCAL_FILE_HEADER, 0);
    local.writeUInt16LE(ZIP_VERSION, 4);
    local.writeUInt16LE(ZIP_UTF8_FLAG, 6);
    local.writeUInt16LE(ZIP_STORE_METHOD, 8);
    local.writeUInt16LE(ZIP_DOS_TIME, 10);
    local.writeUInt16LE(ZIP_DOS_DATE, 12);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(file.bytes.length, 18);
    local.writeUInt32LE(file.bytes.length, 22);
    local.writeUInt16LE(file.name.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, file.name, file.bytes);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(ZIP_CENTRAL_DIRECTORY_HEADER, 0);
    central.writeUInt16LE(ZIP_UNIX_VERSION, 4);
    central.writeUInt16LE(ZIP_VERSION, 6);
    central.writeUInt16LE(ZIP_UTF8_FLAG, 8);
    central.writeUInt16LE(ZIP_STORE_METHOD, 10);
    central.writeUInt16LE(ZIP_DOS_TIME, 12);
    central.writeUInt16LE(ZIP_DOS_DATE, 14);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(file.bytes.length, 20);
    central.writeUInt32LE(file.bytes.length, 24);
    central.writeUInt16LE(file.name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(((0o100000 | file.mode) << 16) >>> 0, 38);
    central.writeUInt32LE(localOffset, 42);
    centralParts.push(central, file.name);

    localOffset += local.length + file.name.length + file.bytes.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(ZIP_END_OF_CENTRAL_DIRECTORY, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(ordered.length, 8);
  end.writeUInt16LE(ordered.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(localOffset, 16);
  end.writeUInt16LE(0, 20);
  const archive = Buffer.concat([...localParts, centralDirectory, end]);
  if (archive.length > limits.maxArchiveBytes) {
    throw new Error('ARCHIVE_SIZE_LIMIT: deterministic archive exceeds its byte limit');
  }
  return archive;
}

function endOfCentralDirectoryOffset(archive: Buffer): number {
  const earliest = Math.max(0, archive.length - 65_557);
  for (let offset = archive.length - 22; offset >= earliest; offset -= 1) {
    if (archive.readUInt32LE(offset) === ZIP_END_OF_CENTRAL_DIRECTORY) return offset;
  }
  throw new Error('INVALID_ZIP: end-of-central-directory record is missing');
}

function dosTimestamp(date: number, time: number): string {
  const year = 1980 + ((date >>> 9) & 0x7f);
  const month = (date >>> 5) & 0x0f;
  const day = date & 0x1f;
  const hour = (time >>> 11) & 0x1f;
  const minute = (time >>> 5) & 0x3f;
  const second = (time & 0x1f) * 2;
  return new Date(Date.UTC(year, month - 1, day, hour, minute, second)).toISOString();
}

function assertSafeArchivePath(path: string): void {
  const segments = path.split('/');
  if (path !== path.normalize('NFC')) {
    throw new Error(`NON_NFC_ARCHIVE_PATH: refused ${JSON.stringify(path)}`);
  }
  if (
    Array.from(path).some((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f);
    })
  ) {
    throw new Error(`ARCHIVE_PATH_CONTROL_CHARACTER: refused ${JSON.stringify(path)}`);
  }
  const encoded = Buffer.from(path, 'utf8');
  let roundTrip: string;
  try {
    roundTrip = new TextDecoder('utf-8', { fatal: true }).decode(encoded);
  } catch {
    throw new Error(`INVALID_UTF8_PATH: refused ${JSON.stringify(path)}`);
  }
  if (
    path === '' ||
    roundTrip !== path ||
    path.includes('\0') ||
    path.includes('\\') ||
    path.startsWith('/') ||
    /^[A-Za-z]:/.test(path) ||
    segments.some((segment) => segment === '' || segment === '.' || segment === '..')
  ) {
    throw new Error(`UNSAFE_ARCHIVE_PATH: refused ${JSON.stringify(path)}`);
  }
  if (/[<>:"|?*]/.test(path)) {
    throw new Error(`WINDOWS_INVALID_PATH: refused ${JSON.stringify(path)}`);
  }
  for (const segment of segments) {
    if (/[. ]$/.test(segment)) {
      throw new Error(`WINDOWS_UNSAFE_PATH: refused ${JSON.stringify(path)}`);
    }
    const deviceName = (segment.split('.')[0] ?? '').toUpperCase();
    if (/^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/.test(deviceName)) {
      throw new Error(`WINDOWS_RESERVED_PATH: refused ${JSON.stringify(path)}`);
    }
  }
}

function archivePathCollisionKey(path: string): string {
  return path.normalize('NFC').toUpperCase().toLowerCase().normalize('NFC');
}

function assertArchivePathResourceLimits(path: string, limits: KitResourceLimits): void {
  if (Buffer.byteLength(path, 'utf8') > limits.maxPathBytes) {
    throw new Error(`PATH_BYTE_LIMIT: refused ${JSON.stringify(path)}`);
  }
  if (path.split('/').length > limits.maxPathDepth) {
    throw new Error(`PATH_DEPTH_LIMIT: refused ${JSON.stringify(path)}`);
  }
}

function assertSafeArchiveMode(mode: number, path: string): void {
  if (!Number.isInteger(mode) || (mode !== 0o644 && mode !== 0o755)) {
    throw new Error(`UNSAFE_ARCHIVE_MODE: refused ${JSON.stringify(path)}`);
  }
}

function decodeZipPath(bytes: Uint8Array): string {
  let path: string;
  try {
    path = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new Error('INVALID_UTF8_PATH: ZIP path is not strict UTF-8');
  }
  if (!Buffer.from(path, 'utf8').equals(Buffer.from(bytes))) {
    throw new Error('INVALID_UTF8_PATH: ZIP path does not round-trip');
  }
  return path;
}

export function readZipEntries(
  value: Uint8Array,
  limitOverrides: Partial<KitResourceLimits> = {},
): KitZipEntry[] {
  const limits = boundedResourceLimits(limitOverrides);
  if (value.byteLength > limits.maxArchiveBytes) {
    throw new Error('ARCHIVE_SIZE_LIMIT: archive exceeds its byte limit');
  }
  const archive = Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  if (archive.length < 22) throw new Error('INVALID_ZIP: archive is too short');
  const endOffset = endOfCentralDirectoryOffset(archive);
  const diskNumber = archive.readUInt16LE(endOffset + 4);
  const centralDisk = archive.readUInt16LE(endOffset + 6);
  const diskEntryCount = archive.readUInt16LE(endOffset + 8);
  const entryCount = archive.readUInt16LE(endOffset + 10);
  const centralSize = archive.readUInt32LE(endOffset + 12);
  const centralOffset = archive.readUInt32LE(endOffset + 16);
  const endCommentLength = archive.readUInt16LE(endOffset + 20);
  if (endOffset + 22 + endCommentLength !== archive.length) {
    throw new Error('TRAILING_ZIP_BYTES: EOCD does not terminate the archive');
  }
  if (
    diskNumber !== 0 ||
    centralDisk !== 0 ||
    diskEntryCount !== entryCount ||
    endCommentLength !== 0 ||
    centralOffset + centralSize !== endOffset
  ) {
    throw new Error('INVALID_ZIP: unsupported split archive or central-directory layout');
  }
  if (entryCount > limits.maxEntries) {
    throw new Error('ENTRY_COUNT_LIMIT: archive contains too many entries');
  }
  const entries: KitZipEntry[] = [];
  const collisionKeys = new Set<string>();
  const localOffsets = new Set<number>();
  let totalUncompressed = 0;
  let offset = centralOffset;

  for (let index = 0; index < entryCount; index += 1) {
    if (offset + 46 > endOffset || archive.readUInt32LE(offset) !== ZIP_CENTRAL_DIRECTORY_HEADER) {
      throw new Error('INVALID_ZIP: central-directory entry is malformed');
    }
    const madeBy = archive.readUInt16LE(offset + 4);
    const versionNeeded = archive.readUInt16LE(offset + 6);
    const flags = archive.readUInt16LE(offset + 8);
    const method = archive.readUInt16LE(offset + 10);
    const time = archive.readUInt16LE(offset + 12);
    const date = archive.readUInt16LE(offset + 14);
    const expectedCrc = archive.readUInt32LE(offset + 16);
    const compressedSize = archive.readUInt32LE(offset + 20);
    const uncompressedSize = archive.readUInt32LE(offset + 24);
    const nameLength = archive.readUInt16LE(offset + 28);
    const extraLength = archive.readUInt16LE(offset + 30);
    const commentLength = archive.readUInt16LE(offset + 32);
    const diskStart = archive.readUInt16LE(offset + 34);
    const internalAttributes = archive.readUInt16LE(offset + 36);
    const externalAttributes = archive.readUInt32LE(offset + 38);
    const localHeaderOffset = archive.readUInt32LE(offset + 42);
    const nameStart = offset + 46;
    const nextOffset = nameStart + nameLength + extraLength + commentLength;
    if (nextOffset > endOffset || extraLength !== 0 || commentLength !== 0) {
      throw new Error('INVALID_ZIP: extra fields and entry comments are unsupported');
    }
    if (
      madeBy !== ZIP_UNIX_VERSION ||
      versionNeeded !== ZIP_VERSION ||
      time !== ZIP_DOS_TIME ||
      date !== ZIP_DOS_DATE ||
      diskStart !== 0 ||
      internalAttributes !== 0
    ) {
      throw new Error('INVALID_ZIP: unsupported ZIP origin or attributes');
    }
    if (flags !== ZIP_UTF8_FLAG) {
      throw new Error('UNSUPPORTED_ZIP_FLAGS: encrypted/data-descriptor flags are forbidden');
    }
    if (method !== ZIP_STORE_METHOD) {
      throw new Error('INVALID_ZIP: only STORE entries are supported');
    }
    if (compressedSize > limits.maxEntryCompressedBytes) {
      throw new Error('ENTRY_COMPRESSED_LIMIT: entry exceeds its compressed-byte limit');
    }
    if (uncompressedSize > limits.maxEntryUncompressedBytes) {
      throw new Error('ENTRY_UNCOMPRESSED_LIMIT: entry exceeds its uncompressed-byte limit');
    }
    totalUncompressed += uncompressedSize;
    if (totalUncompressed > limits.maxTotalUncompressedBytes) {
      throw new Error('TOTAL_UNCOMPRESSED_LIMIT: archive expands beyond its total-byte limit');
    }
    const ratio =
      compressedSize === 0
        ? uncompressedSize === 0
          ? 1
          : Number.POSITIVE_INFINITY
        : uncompressedSize / compressedSize;
    if (ratio > limits.maxCompressionRatio) {
      throw new Error('COMPRESSION_RATIO_LIMIT: entry declares an unsafe compression ratio');
    }

    const nameBytes = archive.subarray(nameStart, nameStart + nameLength);
    const path = decodeZipPath(nameBytes);
    assertSafeArchivePath(path);
    assertArchivePathResourceLimits(path, limits);
    const collisionKey = archivePathCollisionKey(path);
    if (collisionKeys.has(collisionKey)) {
      throw new Error(`ARCHIVE_PATH_COLLISION: refused ${JSON.stringify(path)}`);
    }
    collisionKeys.add(collisionKey);

    const unixMode = (externalAttributes >>> 16) & 0xffff;
    if ((unixMode & 0o170000) === 0o120000) {
      throw new Error(`SYMLINK_ENTRY: refused ${JSON.stringify(path)}`);
    }
    if ((unixMode & 0o170000) !== 0o100000) {
      throw new Error(`UNSAFE_ARCHIVE_MODE: non-regular entry ${JSON.stringify(path)}`);
    }
    const permissions = unixMode & 0o7777;
    assertSafeArchiveMode(permissions, path);
    if (localOffsets.has(localHeaderOffset)) {
      throw new Error('DUPLICATE_LOCAL_OFFSET: multiple entries share local file data');
    }
    localOffsets.add(localHeaderOffset);
    if (
      localHeaderOffset + 30 > centralOffset ||
      archive.readUInt32LE(localHeaderOffset) !== ZIP_LOCAL_FILE_HEADER
    ) {
      throw new Error('INVALID_ZIP: local file header is malformed');
    }
    const localVersionNeeded = archive.readUInt16LE(localHeaderOffset + 4);
    const localFlags = archive.readUInt16LE(localHeaderOffset + 6);
    const localMethod = archive.readUInt16LE(localHeaderOffset + 8);
    const localTime = archive.readUInt16LE(localHeaderOffset + 10);
    const localDate = archive.readUInt16LE(localHeaderOffset + 12);
    const localCrc = archive.readUInt32LE(localHeaderOffset + 14);
    const localCompressedSize = archive.readUInt32LE(localHeaderOffset + 18);
    const localUncompressedSize = archive.readUInt32LE(localHeaderOffset + 22);
    const localNameLength = archive.readUInt16LE(localHeaderOffset + 26);
    const localExtraLength = archive.readUInt16LE(localHeaderOffset + 28);
    const localNameStart = localHeaderOffset + 30;
    const localNameEnd = localNameStart + localNameLength;
    if (
      localExtraLength !== 0 ||
      localNameEnd > centralOffset ||
      localVersionNeeded !== versionNeeded ||
      localFlags !== flags ||
      localMethod !== method ||
      localTime !== time ||
      localDate !== date ||
      localCrc !== expectedCrc ||
      localCompressedSize !== compressedSize ||
      localUncompressedSize !== uncompressedSize ||
      localNameLength !== nameLength ||
      !archive.subarray(localNameStart, localNameEnd).equals(nameBytes)
    ) {
      throw new Error(`LOCAL_CENTRAL_HEADER_MISMATCH: metadata differs for ${path}`);
    }
    const dataStart = localNameEnd;
    const dataEnd = dataStart + compressedSize;
    if (dataEnd > centralOffset) {
      throw new Error(`INVALID_ZIP: entry data overlaps metadata for ${path}`);
    }
    const bytes = archive.subarray(dataStart, dataEnd);
    if (bytes.length !== uncompressedSize || crc32(bytes) !== expectedCrc) {
      throw new Error(`INVALID_ZIP: integrity check failed for ${path}`);
    }
    entries.push({
      path,
      bytes: Uint8Array.from(bytes),
      mode: permissions,
      modifiedAt: dosTimestamp(date, time),
      compressionMethod: 'STORE',
    });
    offset = nextOffset;
  }
  if (offset !== endOffset) {
    throw new Error('INVALID_ZIP: central-directory size does not match parsed entries');
  }
  return entries;
}

async function extractZipToIsolatedDirectoryWithRealpath(
  value: Uint8Array,
  scratchParent: string,
  realpathDirectory: (path: string) => Promise<string>,
): Promise<IsolatedZipExtraction> {
  const entries = readZipEntries(value);
  await mkdir(scratchParent, { recursive: true, mode: 0o700 });
  const requestedParent = resolve(scratchParent);
  const parent = await realpath(requestedParent);
  const directory = await mkdtemp(join(requestedParent, 'wp-03-kit-extract-'));
  let completed = false;
  try {
    const physicalDirectory = await realpathDirectory(directory);
    if (!physicalDirectory.startsWith(`${parent}${sep}`)) {
      throw new Error('UNSAFE_EXTRACTION_ROOT: isolated directory escaped the scratch parent');
    }
    for (const entry of entries) {
      const target = resolve(directory, ...entry.path.split('/'));
      if (!target.startsWith(`${directory}${sep}`)) {
        throw new Error(`UNSAFE_ARCHIVE_PATH: refused ${JSON.stringify(entry.path)}`);
      }
      await mkdir(dirname(target), { recursive: true, mode: 0o700 });
      await writeFile(target, entry.bytes, { flag: 'wx', mode: entry.mode });
      await chmod(target, entry.mode);
    }
    completed = true;
    return { directory, entries };
  } finally {
    if (!completed) {
      await rm(directory, { recursive: true, force: true });
    }
  }
}

export async function extractZipToIsolatedDirectory(
  value: Uint8Array,
  scratchParent: string,
): Promise<IsolatedZipExtraction> {
  return extractZipToIsolatedDirectoryWithRealpath(value, scratchParent, realpath);
}

export async function extractZipToIsolatedDirectoryForToolingTest(
  value: Uint8Array,
  scratchParent: string,
  dependencies: {
    readonly realpathDirectory: (path: string) => Promise<string>;
  },
): Promise<IsolatedZipExtraction> {
  return extractZipToIsolatedDirectoryWithRealpath(
    value,
    scratchParent,
    dependencies.realpathDirectory,
  );
}

export async function runCommandSmoke(
  input: {
    readonly extractionRoot: string;
    readonly commands: readonly SmokeCommand[];
    readonly environment: Readonly<Record<string, string>>;
  },
  runner: CommandRunner,
  limitOverrides: {
    readonly timeoutMs?: number;
    readonly maxStdoutBytes?: number;
    readonly maxStderrBytes?: number;
  } = {},
): Promise<CommandSmokeReceipt[]> {
  const limits = boundedResourceLimits({
    ...(limitOverrides.timeoutMs === undefined ? {} : { smokeTimeoutMs: limitOverrides.timeoutMs }),
    ...(limitOverrides.maxStdoutBytes === undefined
      ? {}
      : { maxStdoutBytes: limitOverrides.maxStdoutBytes }),
    ...(limitOverrides.maxStderrBytes === undefined
      ? {}
      : { maxStderrBytes: limitOverrides.maxStderrBytes }),
  });
  const requiredIds: readonly SmokeCommandId[] = ['bootstrap', 'install', 'one-template'];
  if (
    input.commands.length !== requiredIds.length ||
    input.commands.some((command, index) => command.id !== requiredIds[index])
  ) {
    throw new Error('COMMAND_SET_MISMATCH: bootstrap, install, and one-template are required');
  }
  const root = resolve(input.extractionRoot);
  const prepared = input.commands.map((command) => {
    if (
      !isAbsolute(command.executable) ||
      command.executable.includes('\0') ||
      /[\r\n]/.test(command.executable)
    ) {
      throw new Error(`UNPINNED_SMOKE_EXECUTABLE: refused ${command.id}`);
    }
    const totalArgBytes = command.args.reduce(
      (total, argument) => total + Buffer.byteLength(argument, 'utf8'),
      0,
    );
    if (
      command.args.length > limits.maxArgCount ||
      totalArgBytes > limits.maxTotalArgBytes ||
      command.args.some(
        (argument) =>
          argument.includes('\0') ||
          /[\r\n]/.test(argument) ||
          Buffer.byteLength(argument, 'utf8') > limits.maxArgBytes,
      )
    ) {
      throw new Error(`UNSAFE_SMOKE_ARGUMENT: refused ${command.id}`);
    }
    const cwdSegments = command.cwd === '.' ? [] : command.cwd.split('/');
    if (
      command.cwd.includes('\\') ||
      command.cwd.startsWith('/') ||
      /^[A-Za-z]:/.test(command.cwd) ||
      cwdSegments.some((segment) => segment === '' || segment === '.' || segment === '..')
    ) {
      throw new Error(`UNSAFE_SMOKE_CWD: refused ${command.id}`);
    }
    const cwd = resolve(root, ...cwdSegments);
    if (cwd !== root && !cwd.startsWith(`${root}${sep}`)) {
      throw new Error(`UNSAFE_SMOKE_CWD: refused ${command.id}`);
    }
    return { command, cwd };
  });
  const environment: Record<string, string> = {};
  for (const [name, value] of Object.entries(input.environment)) {
    if (
      !['CI', 'NO_COLOR', 'PATH', 'REPOSITORY_ROOT'].includes(name) ||
      value.includes('\0') ||
      /[\r\n]/.test(value) ||
      Buffer.byteLength(value, 'utf8') > 256 ||
      (name === 'PATH' &&
        value.split(':').some((entry) => entry.length === 0 || !isAbsolute(entry))) ||
      (name === 'REPOSITORY_ROOT' && !isAbsolute(value))
    ) {
      throw new Error(`UNSAFE_SMOKE_ENVIRONMENT: refused ${JSON.stringify(name)}`);
    }
    environment[name] = value;
  }

  const receipts: CommandSmokeReceipt[] = [];
  for (const { command, cwd } of prepared) {
    let result: CommandRunnerResult;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      result = await Promise.race([
        runner.run({
          executable: command.executable,
          args: [...command.args],
          cwd,
          environment: Object.freeze({ ...environment }),
          shell: false,
          timeoutMs: limits.smokeTimeoutMs,
          maxStdoutBytes: limits.maxStdoutBytes,
          maxStderrBytes: limits.maxStderrBytes,
        }),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(
            () => reject(new Error(`SMOKE_TIMEOUT: ${command.id}`)),
            limits.smokeTimeoutMs,
          );
        }),
      ]);
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('SMOKE_TIMEOUT:')) throw error;
      throw new Error(`COMMAND_SMOKE_RUNNER_FAILURE: ${command.id} runner threw`);
    } finally {
      if (timeout !== undefined) clearTimeout(timeout);
    }
    if (result.timedOut === true) {
      throw new Error(`SMOKE_TIMEOUT: ${command.id} exceeded its execution deadline`);
    }
    if (!Number.isInteger(result.exitCode) || result.exitCode !== 0) {
      throw new Error(`COMMAND_SMOKE_FAILED: ${command.id} exited nonzero`);
    }
    if (
      Buffer.byteLength(result.stdout, 'utf8') > limits.maxStdoutBytes ||
      Buffer.byteLength(result.stderr, 'utf8') > limits.maxStderrBytes
    ) {
      throw new Error(`SMOKE_OUTPUT_LIMIT: ${command.id} produced oversized output`);
    }
    const logFiles = [
      { path: `logs/${command.id}.stdout.log`, bytes: result.stdout },
      { path: `logs/${command.id}.stderr.log`, bytes: result.stderr },
    ];
    const logViolations = scanKitBoundaries(
      logFiles,
      logFiles.map((file) => ({
        path: file.path,
        sha256: sha256Hex(file.bytes),
        mediaType: 'text/plain',
      })),
    );
    if (logViolations.length > 0) {
      throw new Error(
        `COMMAND_LOG_BOUNDARY_FAILED: ${command.id} produced ${logViolations.length} violation(s)`,
      );
    }
    receipts.push({
      id: command.id,
      status: 'TOOLING_TEST_PASS',
      stdoutSha256: sha256Hex(result.stdout),
      stderrSha256: sha256Hex(result.stderr),
    });
  }
  return receipts;
}

function sourceByteLength(value: string | Uint8Array): number {
  const length = typeof value === 'string' ? Buffer.byteLength(value, 'utf8') : value.byteLength;
  if (!Number.isSafeInteger(length) || length < 0) {
    throw new KitFactoryError([
      {
        code: 'SOURCE_FILE_SIZE_LIMIT',
        path: 'source',
        message: 'source byte length is invalid',
      },
    ]);
  }
  return length;
}

function normalizeAllowedInventory(
  inventory: readonly KitAllowedInventoryEntry[],
): readonly KitAllowedInventoryEntry[] {
  if (inventory.length > KIT_FACTORY_RESOURCE_LIMITS.maxInventoryEntries) {
    throw new KitFactoryError([
      {
        code: 'INVENTORY_LIMIT',
        path: 'allowedInventory',
        message: 'closed inventory exceeds its entry limit',
      },
    ]);
  }
  let estimatedBytes = 2;
  const keys = new Set<string>();
  const normalized = inventory.map((entry) => {
    estimatedBytes +=
      Buffer.byteLength(entry.path, 'utf8') +
      Buffer.byteLength(entry.sha256, 'utf8') +
      Buffer.byteLength(entry.mediaType, 'utf8') +
      128;
    try {
      assertSafeArchivePath(entry.path);
      assertArchivePathResourceLimits(entry.path, KIT_FACTORY_RESOURCE_LIMITS);
    } catch {
      throw new KitFactoryError([
        {
          code: 'INVENTORY_INVALID',
          path: entry.path,
          message: 'inventory path is not canonical, portable, or within resource limits',
        },
      ]);
    }
    if (
      !/^[a-f0-9]{64}$/.test(entry.sha256) ||
      ![
        'text/plain',
        'application/json',
        'application/yaml',
        'text/x-env',
        'application/octet-stream',
        'application/zip',
      ].includes(entry.mediaType)
    ) {
      throw new KitFactoryError([
        {
          code: 'INVENTORY_INVALID',
          path: entry.path,
          message: 'inventory media type or SHA-256 is invalid',
        },
      ]);
    }
    const key = archivePathCollisionKey(entry.path);
    if (keys.has(key)) {
      throw new KitFactoryError([
        {
          code: 'INVENTORY_DUPLICATE_KEY',
          path: entry.path,
          message: 'inventory contains a duplicate canonical path key',
        },
      ]);
    }
    keys.add(key);
    return {
      path: entry.path.normalize('NFC'),
      mediaType: entry.mediaType,
      sha256: entry.sha256,
    };
  });
  if (estimatedBytes > KIT_FACTORY_RESOURCE_LIMITS.maxManifestBytes) {
    throw new KitFactoryError([
      {
        code: 'INVENTORY_LIMIT',
        path: 'allowedInventory',
        message: 'closed inventory exceeds its serialized-byte limit',
      },
    ]);
  }
  return normalized.sort(
    (left, right) =>
      compareText(archivePathCollisionKey(left.path), archivePathCollisionKey(right.path)) ||
      compareText(left.mediaType, right.mediaType) ||
      compareText(left.sha256, right.sha256),
  );
}

function preflightTeamKitSource(input: TeamKitInput): readonly KitAllowedInventoryEntry[] {
  const inventory = normalizeAllowedInventory(input.allowedInventory);
  const files = [...input.coreFiles, input.assignment, ...input.packets];
  if (files.length > KIT_FACTORY_RESOURCE_LIMITS.maxEntries - 1) {
    throw new KitFactoryError([
      {
        code: 'SOURCE_ENTRY_COUNT_LIMIT',
        path: 'source',
        message: 'source file count leaves no bounded manifest slot',
      },
    ]);
  }
  let totalBytes = 0;
  const measured: { readonly file: KitArchiveFile; readonly length: number }[] = [];
  for (const file of files) {
    const pathBytes = Buffer.byteLength(file.path, 'utf8');
    if (
      pathBytes > KIT_FACTORY_RESOURCE_LIMITS.maxPathBytes ||
      file.path.split('/').length > KIT_FACTORY_RESOURCE_LIMITS.maxPathDepth
    ) {
      throw new KitFactoryError([
        {
          code: 'SOURCE_PATH_LIMIT',
          path: file.path,
          message: 'source path exceeds its byte or depth limit',
        },
      ]);
    }
    const length = sourceByteLength(file.bytes);
    measured.push({ file, length });
    if (length > KIT_FACTORY_RESOURCE_LIMITS.maxEntryUncompressedBytes) {
      throw new KitFactoryError([
        {
          code: 'SOURCE_FILE_SIZE_LIMIT',
          path: file.path,
          message: 'source file exceeds its per-file byte limit',
        },
      ]);
    }
    totalBytes += length;
    if (
      !Number.isSafeInteger(totalBytes) ||
      totalBytes > KIT_FACTORY_RESOURCE_LIMITS.maxTotalUncompressedBytes
    ) {
      throw new KitFactoryError([
        {
          code: 'SOURCE_TOTAL_SIZE_LIMIT',
          path: 'source',
          message: 'source files exceed their total byte limit',
        },
      ]);
    }
  }
  const inventoryByPath = new Map(inventory.map((entry) => [entry.path, entry] as const));
  for (const { file, length } of measured) {
    const inventoryEntry = inventoryByPath.get(file.path);
    const mediaType = authoritativeMediaType(file.path);
    const inventoryClaimsText =
      inventoryEntry?.mediaType === 'text/plain' ||
      inventoryEntry?.mediaType === 'application/json' ||
      inventoryEntry?.mediaType === 'application/yaml' ||
      inventoryEntry?.mediaType === 'text/x-env';
    if (
      (mediaType !== undefined || inventoryClaimsText) &&
      length > KIT_FACTORY_RESOURCE_LIMITS.maxTextDecodeBytes
    ) {
      throw new KitFactoryError([
        {
          code: 'SOURCE_TEXT_DECODE_LIMIT',
          path: file.path,
          message: 'authoritative text exceeds its decode-byte limit',
        },
      ]);
    }
    if (
      mediaType === undefined &&
      !inventoryClaimsText &&
      length > KIT_FACTORY_RESOURCE_LIMITS.maxTextDecodeBytes &&
      !isModuleAllowedBinary(file.path, inventoryEntry?.mediaType, inventoryEntry?.sha256 ?? '')
    ) {
      throw new KitFactoryError([
        {
          code: 'SOURCE_UNSUPPORTED_BINARY',
          path: file.path,
          message: 'large unknown payload is not module-allowlisted binary',
        },
      ]);
    }
  }
  return inventory;
}

function coreFingerprint(files: readonly KitArchiveFile[]): string {
  return canonicalKitJson(
    files
      .map((file) => ({
        path: file.path,
        mode: file.mode ?? 0o644,
        sha256: sha256Hex(archiveBytes(file.bytes)),
      }))
      .sort((left, right) => compareText(left.path, right.path)),
  );
}

function exactJsonDocument(
  bytes: Uint8Array,
  code: 'ASSIGNMENT_SCHEMA_REJECTED' | 'PACKET_SCHEMA_REJECTED',
  path: string,
): unknown {
  try {
    return JSON.parse(Buffer.from(bytes).toString('utf8'));
  } catch {
    throw new KitFactoryError([
      {
        code,
        path,
        message: 'exact input bytes are not a JSON document',
      },
    ]);
  }
}

function validateAssignmentInput(
  input: TeamKitInput,
  validators: FinalInputValidators,
): ValidatedAssignmentProjection {
  const bytes = archiveBytes(input.assignment.bytes);
  let result: FinalValidationResult<ValidatedAssignmentProjection>;
  try {
    result = validators.validateAssignment({
      path: input.assignment.path,
      bytes,
      document: exactJsonDocument(bytes, 'ASSIGNMENT_SCHEMA_REJECTED', input.assignment.path),
    });
  } catch {
    throw new KitFactoryError([
      {
        code: 'ASSIGNMENT_VALIDATOR_FAILURE',
        path: input.assignment.path,
        message: 'final assignment validator threw or was unavailable',
      },
    ]);
  }
  if (!result.ok) {
    throw new KitFactoryError([
      {
        code: 'ASSIGNMENT_SCHEMA_REJECTED',
        path: input.assignment.path,
        message: `final assignment validator rejected the input (${result.errors.length} error(s))`,
      },
    ]);
  }
  return result.value;
}

function validatePacketInputs(
  input: TeamKitInput,
  validators: FinalInputValidators,
): ValidatedPacketProjection[] {
  return input.packets.map((packet) => {
    const bytes = archiveBytes(packet.bytes);
    let result: FinalValidationResult<ValidatedPacketProjection>;
    try {
      result = validators.validatePacket({
        path: packet.path,
        bytes,
        document: exactJsonDocument(bytes, 'PACKET_SCHEMA_REJECTED', packet.path),
      });
    } catch {
      throw new KitFactoryError([
        {
          code: 'PACKET_VALIDATOR_FAILURE',
          path: packet.path,
          message: 'final packet validator threw or was unavailable',
        },
      ]);
    }
    if (!result.ok) {
      throw new KitFactoryError([
        {
          code: 'PACKET_SCHEMA_REJECTED',
          path: packet.path,
          message: `final packet validator rejected the input (${result.errors.length} error(s))`,
        },
      ]);
    }
    return result.value;
  });
}

function manifestFile(file: KitArchiveFile, kind: KitManifestFile['kind']): KitManifestFile {
  const bytes = archiveBytes(file.bytes);
  return {
    path: file.path,
    sha256: sha256Hex(bytes),
    size: bytes.length,
    mode: file.mode ?? 0o644,
    kind,
    ...(file.sourcePath === undefined ? {} : { sourcePath: file.sourcePath }),
    ...(file.sourceSha256 === undefined ? {} : { sourceSha256: file.sourceSha256 }),
  };
}

function membershipBlockers(
  input: TeamKitInput,
  assignment: ValidatedAssignmentProjection,
  packets: readonly ValidatedPacketProjection[],
): KitFactoryBlocker[] {
  const blockers: KitFactoryBlocker[] = [];
  const add = (code: string, path: string, message: string): void => {
    if (!blockers.some((blocker) => blocker.code === code && blocker.path === path)) {
      blockers.push({ code, path, message });
    }
  };
  if (assignment.teamId !== input.teamId || assignment.laneId !== input.laneId) {
    add(
      'ASSIGNMENT_IDENTITY_MISMATCH',
      input.assignment.path,
      'validated assignment team or lane does not match the requested kit',
    );
  }
  if (assignment.bindings.length !== 30) {
    add(
      'ASSIGNMENT_COUNT_MISMATCH',
      input.assignment.path,
      `validated assignment requires exactly 30 bindings; received ${assignment.bindings.length}`,
    );
  }
  if (packets.length !== 30) {
    add(
      'PACKET_COUNT_MISMATCH',
      'packets',
      `team ${input.teamId} requires exactly 30 packets; received ${packets.length}`,
    );
  }

  const bindingCounts = new Map<string, number>();
  for (const binding of assignment.bindings) {
    bindingCounts.set(binding.lessonId, (bindingCounts.get(binding.lessonId) ?? 0) + 1);
  }
  for (const [lessonId, count] of bindingCounts) {
    if (count > 1) {
      add(
        'DUPLICATE_ASSIGNMENT_LESSON',
        input.assignment.path,
        `assignment contains duplicate lesson ID ${lessonId}`,
      );
    }
  }

  const packetCounts = new Map<string, number>();
  packets.forEach((packet, index) => {
    packetCounts.set(packet.lessonId, (packetCounts.get(packet.lessonId) ?? 0) + 1);
    const path = input.packets[index]?.path ?? `packets[${index}]`;
    if (packet.teamId !== input.teamId) {
      add('WRONG_TEAM_PACKET', path, `packet ${packet.lessonId} belongs to ${packet.teamId}`);
    }
    if (packet.laneId !== input.laneId) {
      add('WRONG_LANE_PACKET', path, `packet ${packet.lessonId} belongs to ${packet.laneId}`);
    }
    if (packet.status !== 'READY') {
      add('PACKET_NOT_READY', path, `packet ${packet.lessonId} is ${packet.status}`);
    }
  });
  for (const [lessonId, count] of packetCounts) {
    if (count > 1) {
      add('DUPLICATE_PACKET', 'packets', `packet ${lessonId} appears ${count} times`);
    }
    if (!bindingCounts.has(lessonId)) {
      add('UNASSIGNED_PACKET', 'packets', `packet ${lessonId} is not assigned to ${input.teamId}`);
    }
  }
  for (const lessonId of bindingCounts.keys()) {
    if (!packetCounts.has(lessonId)) {
      add('MISSING_PACKET', 'packets', `assigned packet ${lessonId} is missing`);
    }
  }
  return blockers;
}

function cohortFreshnessBlockers(
  input: TeamKitInput,
  assignment: ValidatedAssignmentProjection,
  packets: readonly ValidatedPacketProjection[],
): KitFactoryBlocker[] {
  const blockers: KitFactoryBlocker[] = [];
  const add = (path: string, detail: string): void => {
    blockers.push({
      code: 'COHORT_FRESHNESS_MISMATCH',
      path,
      message: detail,
    });
  };
  if (
    assignment.runId !== input.runId ||
    assignment.assignmentId !== input.expectedCohort.assignmentId ||
    assignment.assignmentBindingId !== input.expectedCohort.assignmentBindingId ||
    assignment.contractVersion !== input.expectedCohort.contractVersion ||
    assignment.schemaVersion !== input.expectedCohort.schemaVersion ||
    assignment.generation !== input.expectedCohort.generation
  ) {
    add(input.assignment.path, 'assignment run/ID/binding/contract/schema/generation is stale');
  }
  const bindingByLesson = new Map(
    assignment.bindings.map((binding) => [binding.lessonId, binding] as const),
  );
  packets.forEach((packet, index) => {
    const source = input.packets[index];
    const binding = bindingByLesson.get(packet.lessonId);
    const path = source?.path ?? `packets[${index}]`;
    if (
      packet.runId !== input.runId ||
      packet.assignmentId !== input.expectedCohort.assignmentId ||
      packet.assignmentId !== assignment.assignmentId ||
      packet.assignmentBindingId !== assignment.assignmentBindingId ||
      packet.contractVersion !== assignment.contractVersion ||
      packet.schemaVersion !== assignment.schemaVersion ||
      packet.generation !== assignment.generation ||
      packet.sourcePacketPath !== path ||
      binding === undefined ||
      packet.packetId !== binding.packetId ||
      packet.revision !== binding.revision ||
      packet.contentSha256 !== binding.contentSha256
    ) {
      add(path, `packet ${packet.lessonId} does not belong to the exact validated cohort`);
    }
  });
  return blockers;
}

const PIN_BLOCK_CODES = {
  repositoryCommit: 'REPOSITORY_COMMIT_MISMATCH',
  kitSha256: 'KIT_HASH_MISMATCH',
  profileSha256: 'PROFILE_HASH_MISMATCH',
  schemaSha256: 'SCHEMA_HASH_MISMATCH',
  templateSha256: 'TEMPLATE_HASH_MISMATCH',
  curriculumSha256: 'CURRICULUM_HASH_MISMATCH',
} as const;

function identityPinBlockers(
  expected: KitIdentityPins,
  observed: KitIdentityPins,
  path: string,
): KitFactoryBlocker[] {
  const blockers: KitFactoryBlocker[] = [];
  for (const field of Object.keys(PIN_BLOCK_CODES) as (keyof typeof PIN_BLOCK_CODES)[]) {
    if (observed[field] !== expected[field]) {
      blockers.push({
        code: PIN_BLOCK_CODES[field],
        path,
        message: `${field} does not match the exact kit input pin`,
      });
    }
  }
  if (canonicalKitJson(observed.toolVersions) !== canonicalKitJson(expected.toolVersions)) {
    blockers.push({
      code: 'TOOL_VERSION_MISMATCH',
      path,
      message: 'tool version names or values do not match the exact kit input pins',
    });
  }
  return blockers;
}

function invalidIdentityPinBlockers(pins: KitIdentityPins, path: string): KitFactoryBlocker[] {
  const digestFields: readonly (keyof Pick<
    KitIdentityPins,
    'kitSha256' | 'profileSha256' | 'schemaSha256' | 'templateSha256' | 'curriculumSha256'
  >)[] = ['kitSha256', 'profileSha256', 'schemaSha256', 'templateSha256', 'curriculumSha256'];
  const invalidDigest = digestFields.some(
    (field) => !/^[a-f0-9]{64}$/.test(pins[field]) || pins[field] === '0'.repeat(64),
  );
  const invalidCommit =
    !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(pins.repositoryCommit) ||
    /^0+$/.test(pins.repositoryCommit);
  const toolEntries = Object.entries(pins.toolVersions);
  const invalidTools =
    toolEntries.length === 0 ||
    toolEntries.some(
      ([name, version]) =>
        !/^[A-Za-z0-9][A-Za-z0-9._+-]*$/.test(name) ||
        version.trim() === '' ||
        /[\0\r\n]/.test(version),
    );
  return invalidDigest || invalidCommit || invalidTools
    ? [
        {
          code: 'INVALID_IDENTITY_PIN',
          path,
          message: 'commit, digest, or tool-version pins are malformed or placeholders',
        },
      ]
    : [];
}

function hashAndPinBlockers(
  input: TeamKitInput,
  assignment: ValidatedAssignmentProjection,
  packets: readonly ValidatedPacketProjection[],
): KitFactoryBlocker[] {
  const blockers = [
    ...invalidIdentityPinBlockers(input.expectedPins, 'expectedPins'),
    ...identityPinBlockers(input.expectedPins, assignment.pins, input.assignment.path),
  ];
  const assignmentHash = sha256Hex(archiveBytes(input.assignment.bytes));
  if (
    assignmentHash !== input.assignment.expectedSha256 ||
    assignmentHash !== assignment.fileSha256
  ) {
    blockers.push({
      code: 'ASSIGNMENT_HASH_MISMATCH',
      path: input.assignment.path,
      message: 'assignment bytes do not match their required SHA-256 pin',
    });
  }
  const bindings = new Map(
    assignment.bindings.map((binding) => [binding.lessonId, binding] as const),
  );
  packets.forEach((packet, index) => {
    const source = input.packets[index];
    if (source === undefined) return;
    const actual = sha256Hex(archiveBytes(source.bytes));
    const binding = bindings.get(packet.lessonId);
    if (
      actual !== source.expectedSha256 ||
      actual !== packet.fileSha256 ||
      binding === undefined ||
      actual !== binding.sha256 ||
      source.path !== binding.path
    ) {
      blockers.push({
        code: 'PACKET_HASH_MISMATCH',
        path: source.path,
        message: `packet ${packet.lessonId} bytes, path, validator hash, and assignment pin do not close`,
      });
    }
    blockers.push(...identityPinBlockers(input.expectedPins, packet.pins, source.path));
  });
  return blockers;
}

function createKitCandidate(input: TeamKitInput, validators: FinalInputValidators): KitCandidate {
  const allowedInventory = normalizeAllowedInventory(input.allowedInventory);
  const estimatedInventoryBytes = allowedInventory.reduce(
    (total, entry) =>
      total +
      Buffer.byteLength(entry.path, 'utf8') +
      Buffer.byteLength(entry.sha256, 'utf8') +
      Buffer.byteLength(entry.mediaType, 'utf8') +
      128,
    2,
  );
  if (
    allowedInventory.length > KIT_FACTORY_RESOURCE_LIMITS.maxInventoryEntries ||
    estimatedInventoryBytes > KIT_FACTORY_RESOURCE_LIMITS.maxManifestBytes
  ) {
    throw new KitFactoryError([
      {
        code: 'INVENTORY_LIMIT',
        path: 'allowedInventory',
        message: 'closed inventory exceeds its count or serialized-byte limit',
      },
    ]);
  }
  const requiredCorePaths = [...input.requiredCorePaths].sort(compareText);
  const observedCorePaths = input.coreFiles.map((file) => file.path).sort(compareText);
  if (
    requiredCorePaths.length === 0 ||
    new Set(requiredCorePaths).size !== requiredCorePaths.length ||
    new Set(observedCorePaths).size !== observedCorePaths.length ||
    canonicalKitJson(requiredCorePaths) !== canonicalKitJson(observedCorePaths)
  ) {
    throw new KitFactoryError([
      {
        code: 'CORE_FILE_SET_MISMATCH',
        path: 'core',
        message: 'core files do not exactly match the execution-supplied required inventory',
      },
    ]);
  }
  const boundaryViolations = scanKitBoundaries(
    [...input.coreFiles, input.assignment, ...input.packets],
    allowedInventory,
  );
  const assignment = validateAssignmentInput(input, validators);
  const packets = validatePacketInputs(input, validators);
  const blockers = membershipBlockers(input, assignment, packets);
  blockers.push(...cohortFreshnessBlockers(input, assignment, packets));
  blockers.push(...hashAndPinBlockers(input, assignment, packets));
  blockers.push(
    ...boundaryViolations.map((violation) => ({
      code: 'BOUNDARY_SCAN_FAILED',
      path: violation.path,
      message: `${violation.code}: ${violation.message}`,
    })),
  );
  if (blockers.length > 0) throw new KitFactoryError(blockers);
  const coreFiles = input.coreFiles
    .map((file) =>
      manifestFile(file, file.parityClass === 'team-metadata' ? 'team-metadata' : 'core'),
    )
    .sort((left, right) => compareText(left.path, right.path));
  const files = [
    ...coreFiles,
    manifestFile(input.assignment, 'assignment'),
    ...input.packets.map((file) => manifestFile(file, 'packet')),
  ].sort((left, right) => compareText(left.path, right.path));
  const generationTwo = input.kitFormat === 'lesson-generation-kit-v1/2';
  if (
    generationTwo &&
    (input.repositoryUrl !== 'https://github.com/jsonjj/mcat-prep.git' ||
      input.allowedOutputRoot !== `content/lesson-candidates/${input.teamId}` ||
      input.branchConvention !== `lesson-factory/${input.teamId}/wave-<nn>` ||
      input.handoffEndpoint !== `branches:lesson-factory/${input.teamId}/wave-<nn>` ||
      input.lifecycle !== 'CANDIDATE_RUBRIC_SCREENED' ||
      input.deterministicInstallCommand !==
        'corepack pnpm install --frozen-lockfile --offline --ignore-scripts' ||
      input.runtimeRequirements?.nodeMajorMinimum !== 20 ||
      input.runtimeRequirements.packageManager !== 'pnpm@9.15.9' ||
      input.runtimeRequirements.installPolicy !== 'FROZEN_OFFLINE_IGNORE_SCRIPTS' ||
      input.validatorAuthority === undefined ||
      !/^[0-9a-f]{64}$/.test(input.validatorAuthority.aggregateSha256) ||
      input.validatorAuthority.files.length === 0 ||
      input.validatorAuthority.files.some(
        (file) =>
          !/^[a-zA-Z0-9._/-]+$/.test(file.path) ||
          !/^[0-9a-f]{64}$/.test(file.sha256) ||
          !/^[0-9a-f]{64}$/.test(file.gitBlobSha256),
      ) ||
      canonicalKitJson(input.validatorAuthority.files.map((file) => file.path)) !==
        canonicalKitJson(
          input.validatorAuthority.files.map((file) => file.path).toSorted(compareText),
        ) ||
      input.validatorAuthority.aggregateSha256 !==
        sha256Hex(canonicalKitJson(input.validatorAuthority.files)) ||
      !Array.isArray(input.forbiddenSharedPaths) ||
      canonicalKitJson(input.forbiddenSharedPaths) !==
        canonicalKitJson(GENERATION_TWO_FORBIDDEN_SHARED_PATHS))
  ) {
    throw new KitFactoryError([
      {
        code: 'GENERATION_TWO_AUTHORITY_INVALID',
        path: 'KIT-MANIFEST.json',
        message: 'generation-2 authority fields are incomplete or permit team substitution',
      },
    ]);
  }
  const manifest: KitManifest = {
    format: generationTwo ? 'lesson-generation-kit-v1/2' : 'wp-03-kit-manifest/1',
    runId: input.runId,
    teamId: input.teamId,
    laneId: input.laneId,
    assignmentId: assignment.assignmentId,
    assignmentBindingId: assignment.assignmentBindingId,
    contractVersion: assignment.contractVersion,
    schemaVersion: assignment.schemaVersion,
    generation: assignment.generation,
    assembledAt: input.assembledAt,
    lifecycle: input.lifecycle,
    deadline: input.deadline,
    branchConvention: input.branchConvention,
    ...(generationTwo
      ? {
          repositoryUrl: input.repositoryUrl,
          repositoryCommit: input.expectedPins.repositoryCommit,
          allowedOutputRoot: input.allowedOutputRoot,
          forbiddenSharedPaths: input.forbiddenSharedPaths,
          runtimeRequirements: input.runtimeRequirements,
          deterministicInstallCommand: input.deterministicInstallCommand,
          handoffEndpoint: input.handoffEndpoint,
          validatorAuthority: structuredClone(input.validatorAuthority),
        }
      : {}),
    pins: structuredClone(input.expectedPins),
    assignmentSha256: sha256Hex(archiveBytes(input.assignment.bytes)),
    inventorySha256: sha256Hex(canonicalKitJson(allowedInventory)),
    ...(generationTwo ? { filesSha256: sha256Hex(canonicalKitJson(files)) } : {}),
    allowedLessonIds: packets.map((packet) => packet.lessonId).sort(compareText),
    allowedPaths: files.map((file) => file.path),
    packetCount: 30,
    coreFiles,
    files,
    ...(generationTwo
      ? {
          sourceMappings: coreFiles.map((file) => {
            if (file.sourcePath === undefined || file.sourceSha256 === undefined) {
              throw new KitFactoryError([
                {
                  code: 'SOURCE_MAPPING_MISSING',
                  path: file.path,
                  message: 'generation-2 core files require pinned source and archive identities',
                },
              ]);
            }
            return {
              archivePath: file.path,
              archiveSha256: file.sha256,
              sourcePath: file.sourcePath,
              sourceSha256: file.sourceSha256,
            };
          }),
          readOrder: [
            'AUTHOR-INSTRUCTIONS.md',
            'docs/autonomous-lesson-authoring-context.md',
            'docs/05-LESSON-STRUCTURAL-AUTHORING-SPEC.md',
            'docs/06-LESSON-AUTHORING-WORKFLOW.md',
            'docs/lesson-evidence-mastery-contract.md',
            'docs/lesson-quality-author-protocol.md',
            'deadline-profile/rubric-profile.json',
            'docs/lesson-quality-rubric.md',
            'template/v3-les-000000/',
            `packets/<one-assigned-lesson-id>/task-source-packet.json`,
          ],
          nonclaims: {
            officialRubricPass: false,
            humanApproved: false,
            publicationApproved: false,
          },
        }
      : {}),
    manifestHashRule: 'KIT-MANIFEST.json is self-excluded; READY.json pins its SHA-256',
  };
  const manifestBytes = `${canonicalKitJson(manifest)}\n`;
  if (Buffer.byteLength(manifestBytes, 'utf8') > KIT_FACTORY_RESOURCE_LIMITS.maxManifestBytes) {
    throw new KitFactoryError([
      {
        code: 'MANIFEST_SIZE_LIMIT',
        path: 'KIT-MANIFEST.json',
        message: 'manifest exceeds its serialized-byte limit',
      },
    ]);
  }
  const archive = createDeterministicZip([
    ...input.coreFiles,
    input.assignment,
    ...input.packets,
    { path: 'KIT-MANIFEST.json', bytes: manifestBytes, mode: 0o644 },
  ]);
  return {
    kind: 'KIT_CANDIDATE',
    teamId: input.teamId,
    userSendable: false,
    manifest,
    manifestBytes,
    manifestSha256: sha256Hex(manifestBytes),
    archiveBytes: archive,
    archiveSha256: sha256Hex(archive),
  };
}

export function createFederatedKitCandidates(
  input: {
    readonly teamA: TeamKitInput;
    readonly teamB: TeamKitInput;
  },
  validators: FinalInputValidators,
): FederatedKitCandidates {
  if (input.teamA.teamId !== 'team-A' || input.teamB.teamId !== 'team-B') {
    throw new KitFactoryError([
      {
        code: 'FEDERATED_TEAM_SLOT_MISMATCH',
        path: 'teams',
        message: 'teamA must bind team-A and teamB must bind team-B',
      },
    ]);
  }
  if (
    input.teamA.runId !== input.teamB.runId ||
    input.teamA.expectedCohort.contractVersion !== input.teamB.expectedCohort.contractVersion ||
    input.teamA.expectedCohort.schemaVersion !== input.teamB.expectedCohort.schemaVersion ||
    input.teamA.expectedCohort.generation !== input.teamB.expectedCohort.generation ||
    canonicalKitJson(input.teamA.expectedPins) !== canonicalKitJson(input.teamB.expectedPins)
  ) {
    throw new KitFactoryError([
      {
        code: 'FEDERATED_COHORT_MISMATCH',
        path: 'teams',
        message:
          'both slots must share the exact run, contract/schema generation, and identity pins',
      },
    ]);
  }
  const teamAInput: TeamKitInput = {
    ...input.teamA,
    allowedInventory: preflightTeamKitSource(input.teamA),
  };
  const teamBInput: TeamKitInput = {
    ...input.teamB,
    allowedInventory: preflightTeamKitSource(input.teamB),
  };
  if (
    coreFingerprint(teamAInput.coreFiles.filter((file) => file.parityClass !== 'team-metadata')) !==
    coreFingerprint(teamBInput.coreFiles.filter((file) => file.parityClass !== 'team-metadata'))
  ) {
    throw new KitFactoryError([
      {
        code: 'CORE_FILE_PARITY_MISMATCH',
        path: 'core',
        message: 'team-A and team-B core file paths, bytes, or permissions differ',
      },
    ]);
  }
  const teamA = createKitCandidate(teamAInput, validators);
  const teamB = createKitCandidate(teamBInput, validators);
  const overlaps = teamA.manifest.allowedLessonIds.filter((lessonId) =>
    teamB.manifest.allowedLessonIds.includes(lessonId),
  );
  if (overlaps.length > 0) {
    throw new KitFactoryError([
      {
        code: 'CROSS_TEAM_PACKET_OVERLAP',
        path: 'packets',
        message: `team-A and team-B share ${overlaps.length} lesson ID(s)`,
      },
    ]);
  }
  return { teamA, teamB };
}

function extractedEntryMap(entries: readonly KitZipEntry[]): Map<string, KitZipEntry> {
  const map = new Map<string, KitZipEntry>();
  for (const entry of entries) {
    if (map.has(entry.path)) {
      throw new Error(`MANIFEST_CLOSURE_FAILED: duplicate extracted path ${entry.path}`);
    }
    map.set(entry.path, entry);
  }
  return map;
}

function verifyManifestClosure(
  candidate: KitCandidate,
  entries: readonly KitZipEntry[],
): Map<string, KitZipEntry> {
  const byPath = extractedEntryMap(entries);
  const expectedPaths = [
    ...candidate.manifest.files.map((file) => file.path),
    'KIT-MANIFEST.json',
  ].sort(compareText);
  const observedPaths = entries.map((entry) => entry.path);
  if (canonicalKitJson(observedPaths) !== canonicalKitJson(expectedPaths)) {
    throw new Error('MANIFEST_CLOSURE_FAILED: archive paths do not exactly match the manifest');
  }
  if (
    canonicalKitJson(candidate.manifest.allowedPaths) !==
    canonicalKitJson(candidate.manifest.files.map((file) => file.path))
  ) {
    throw new Error('MANIFEST_CLOSURE_FAILED: manifest allowed paths are not closed');
  }
  for (const file of candidate.manifest.files) {
    const entry = byPath.get(file.path);
    if (
      entry === undefined ||
      entry.bytes.length !== file.size ||
      entry.mode !== file.mode ||
      sha256Hex(entry.bytes) !== file.sha256
    ) {
      throw new Error(`MANIFEST_CLOSURE_FAILED: file pin mismatch for ${file.path}`);
    }
  }
  const manifestEntry = byPath.get('KIT-MANIFEST.json');
  if (
    manifestEntry === undefined ||
    Buffer.from(manifestEntry.bytes).toString('utf8') !== candidate.manifestBytes ||
    sha256Hex(manifestEntry.bytes) !== candidate.manifestSha256
  ) {
    throw new Error('MANIFEST_CLOSURE_FAILED: KIT-MANIFEST.json bytes or hash differ');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(manifestEntry.bytes).toString('utf8'));
  } catch {
    throw new Error('MANIFEST_CLOSURE_FAILED: KIT-MANIFEST.json is not valid JSON');
  }
  if (
    `${canonicalKitJson(parsed)}\n` !== candidate.manifestBytes ||
    canonicalKitJson(parsed) !== canonicalKitJson(candidate.manifest)
  ) {
    throw new Error('MANIFEST_CLOSURE_FAILED: KIT-MANIFEST.json is not canonical');
  }
  return byPath;
}

function parseExtractedDocument(entry: KitZipEntry, label: string): unknown {
  try {
    return JSON.parse(Buffer.from(entry.bytes).toString('utf8'));
  } catch {
    throw new Error(`${label}_SCHEMA_REJECTED: extracted document is not valid JSON`);
  }
}

export async function verifyKitCandidate(
  input: {
    readonly candidate: KitCandidate;
    readonly source: TeamKitInput;
    readonly scratchParent: string;
    readonly smokeCommands: readonly SmokeCommand[];
    readonly smokeEnvironment: Readonly<Record<string, string>>;
  },
  validators: FinalInputValidators,
  runner: CommandRunner,
): Promise<VerifiedKitCandidate> {
  if (sha256Hex(input.candidate.archiveBytes) !== input.candidate.archiveSha256) {
    throw new Error('ARCHIVE_HASH_MISMATCH: candidate archive bytes changed after assembly');
  }
  const extraction = await extractZipToIsolatedDirectory(
    input.candidate.archiveBytes,
    input.scratchParent,
  );
  try {
    const byPath = verifyManifestClosure(input.candidate, extraction.entries);
    const requiredEntry = (path: string): KitZipEntry => {
      const entry = byPath.get(path);
      if (entry === undefined) {
        throw new Error(`MANIFEST_CLOSURE_FAILED: extracted path is missing: ${path}`);
      }
      return entry;
    };
    const reconstructed: TeamKitInput = {
      ...input.source,
      coreFiles: input.source.coreFiles.map((file) => {
        const entry = requiredEntry(file.path);
        return { ...file, path: entry.path, bytes: entry.bytes, mode: entry.mode };
      }),
      assignment: {
        ...input.source.assignment,
        bytes: requiredEntry(input.source.assignment.path).bytes,
        document: parseExtractedDocument(requiredEntry(input.source.assignment.path), 'ASSIGNMENT'),
      },
      packets: input.source.packets.map((packet) => {
        const entry = requiredEntry(packet.path);
        return {
          ...packet,
          bytes: entry.bytes,
          document: parseExtractedDocument(entry, 'PACKET'),
        };
      }),
    };
    const rebuilt = createKitCandidate(reconstructed, validators);
    if (
      rebuilt.manifestBytes !== input.candidate.manifestBytes ||
      rebuilt.archiveSha256 !== input.candidate.archiveSha256
    ) {
      throw new Error(
        'MANIFEST_CLOSURE_FAILED: extracted candidate does not rebuild byte-identically',
      );
    }
    const smokeReceipts = await runCommandSmoke(
      {
        extractionRoot: extraction.directory,
        commands: input.smokeCommands,
        environment: input.smokeEnvironment,
      },
      runner,
    );
    return {
      kind: 'VERIFIED_KIT_CANDIDATE',
      teamId: input.candidate.teamId,
      userSendable: false,
      candidate: input.candidate,
      checks: {
        cleanExtraction: 'PASS',
        archiveHash: 'PASS',
        manifestClosure: 'PASS',
        assignmentSchema: 'PASS',
        packetSchema: 'PASS',
        packetMembership: 'PASS',
        boundaryScan: 'PASS',
        bootstrapSmoke: 'PASS',
        installSmoke: 'PASS',
        oneTemplateSmoke: 'PASS',
      },
      smokeReceipts,
    };
  } finally {
    await rm(extraction.directory, { recursive: true, force: true });
  }
}

export function createSendMeText(verified: VerifiedKitCandidate): string {
  const { candidate } = verified;
  return [
    'WP03_TEAMMATE_KIT',
    `TEAM_ID=${candidate.teamId}`,
    `ARCHIVE=${candidate.teamId}-complete.zip`,
    `ARCHIVE_SHA256=${candidate.archiveSha256}`,
    `KIT_MANIFEST_SHA256=${candidate.manifestSha256}`,
    `REPOSITORY_COMMIT=${candidate.manifest.pins.repositoryCommit}`,
    `ASSIGNMENT_SHA256=${candidate.manifest.assignmentSha256}`,
    `PACKET_COUNT=${candidate.manifest.packetCount}`,
    'REQUIRES_MATCHING_READY_JSON=true',
    '',
  ].join('\n');
}

export function verifySendMeConsistency(text: string, verified: VerifiedKitCandidate): void {
  if (text !== createSendMeText(verified)) {
    throw new Error('SEND_ME_MISMATCH: teammate instructions do not match the verified candidate');
  }
}

export function createBuildingReadinessState(runId: string): FederatedReadinessState {
  return {
    format: 'wp-03-in-memory-supersession-model/1',
    authority: 'IN_MEMORY_MODEL_ONLY',
    runId,
    status: 'MODELING',
    generation: 0,
    userSendable: false,
    current: [],
    history: [],
  };
}

export function modelFederatedSupersession(
  previous: FederatedReadinessState,
  replacements: readonly [KitCandidate, KitCandidate],
): FederatedReadinessState {
  const ordered = [...replacements].sort((left, right) => compareText(left.teamId, right.teamId));
  if (ordered[0]?.teamId !== 'team-A' || ordered[1]?.teamId !== 'team-B') {
    throw new Error('NO_PARTIAL_BUNDLE_MODEL: supersession requires team-A and team-B');
  }
  const generation = previous.generation + 1;
  const replacementHashByTeam = new Map(
    ordered.map((candidate) => [candidate.teamId, candidate.archiveSha256] as const),
  );
  const superseded = previous.current.map(
    (current): ModeledSupersededBundle => ({
      ...current,
      status: 'MODELED_SUPERSEDED',
      supersededByArchiveSha256: replacementHashByTeam.get(current.teamId) ?? '',
      supersededInGeneration: generation,
    }),
  );
  const current = ordered.map(
    (candidate): ModeledCurrentBundle => ({
      teamId: candidate.teamId,
      status: 'MODELED_CURRENT',
      archiveSha256: candidate.archiveSha256,
      manifestSha256: candidate.manifestSha256,
      assembledAt: candidate.manifest.assembledAt,
    }),
  );
  return {
    format: 'wp-03-in-memory-supersession-model/1',
    authority: 'IN_MEMORY_MODEL_ONLY',
    runId: previous.runId,
    status: 'MODELING',
    generation,
    userSendable: false,
    current,
    history: [...previous.history, ...superseded],
  };
}

const MODULE_OWNED_COMMAND_DEFINITIONS = Object.freeze([
  { id: 'bootstrap', argvTemplate: ['run', 'bootstrap'], cwd: '.' },
  { id: 'install', argvTemplate: ['install', '--frozen-lockfile'], cwd: '.' },
  {
    id: 'one-template',
    argvTemplate: ['run', 'one-template', '--', '<reviewed-template-id>'],
    cwd: 'core/template',
  },
] as const);

const REQUIRED_AUTHORIZATION_EVIDENCE_FIELDS = Object.freeze([
  'runId',
  'archiveSha256',
  'manifestSha256',
  'assignmentSha256',
  'repositoryCommit',
  'schemaSha256',
  'profileSha256',
  'templateSha256',
  'kitSha256',
  'curriculumSha256',
  'toolVersionsSha256',
] as const);

export function getProductionWriterStatus(): {
  readonly status: 'BLOCKED';
  readonly blockerCode: 'PRODUCTION_INTEGRATION_UNARMED';
  readonly requiredMechanisms: readonly [
    'LOCK',
    'STAGED_WRITE',
    'FSYNC',
    'ATOMIC_RENAME',
    'ROLLBACK',
    'SINGLE_READY',
  ];
} {
  return {
    status: 'BLOCKED',
    blockerCode: 'PRODUCTION_INTEGRATION_UNARMED',
    requiredMechanisms: [
      'LOCK',
      'STAGED_WRITE',
      'FSYNC',
      'ATOMIC_RENAME',
      'ROLLBACK',
      'SINGLE_READY',
    ],
  };
}

export function getProductionExecutionStatus(): {
  readonly status: 'BLOCKED';
  readonly toolingStatus: 'TOOLING_REVIEW_READY_BLOCKED_ON_REAL_INPUTS';
  readonly userSendable: false;
  readonly artifacts: readonly [];
  readonly blockerCodes: readonly [
    'PRODUCTION_ADAPTER_NOT_CONFIGURED',
    'PRODUCTION_INTEGRATION_UNARMED',
  ];
  readonly moduleOwnedCommandIds: readonly SmokeCommandId[];
  readonly requiredEvidenceFields: readonly string[];
} {
  return {
    status: 'BLOCKED',
    toolingStatus: 'TOOLING_REVIEW_READY_BLOCKED_ON_REAL_INPUTS',
    userSendable: false,
    artifacts: [],
    blockerCodes: ['PRODUCTION_ADAPTER_NOT_CONFIGURED', 'PRODUCTION_INTEGRATION_UNARMED'],
    moduleOwnedCommandIds: MODULE_OWNED_COMMAND_DEFINITIONS.map((definition) => definition.id),
    requiredEvidenceFields: REQUIRED_AUTHORIZATION_EVIDENCE_FIELDS,
  };
}
