import { execFileSync, spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createHash, createHmac, generateKeyPairSync, sign as signBytes } from 'node:crypto';
import { once } from 'node:events';
import {
  chmodSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  readdirSync,
  renameSync,
  rmSync,
  symlinkSync,
  truncateSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { copyFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { afterAll, afterEach, describe, expect, it } from 'vitest';

import {
  TEAM_RETURN_STAGING_RELATIVE_ROOT,
  intakeTeamReturn,
  loadTeamReturnAcceptanceArtifact,
  validateTeamReturnCandidateMechanically,
  type CentralMechanicalValidation,
  type TeamReturnCheckoutEvidence,
  type TeamReturnIntakeDependencies,
  type TeamReturnIntakeRequest,
} from './team-return-intake';
import {
  MAX_ACCEPTANCE_AGGREGATE_BYTES,
  MAX_ACCEPTANCE_ARCHIVE_BYTES,
  MAX_ACCEPTANCE_MARKERS,
} from './team-return-acceptance-artifact';
import { planLessonRehash } from '../lesson-validator/rehash';

const REPOSITORY_ROOT = resolve(import.meta.dirname, '..', '..', '..', '..');
let approvedCandidateTemplate: string | null = null;

function approvedCandidateTemplateRoot(): string {
  if (approvedCandidateTemplate !== null) return approvedCandidateTemplate;
  const checkout = join(FIXTURE_ROOT, 'approved-team-b-template');
  execFileSync(
    '/usr/bin/git',
    [
      'clone',
      join(
        REPOSITORY_ROOT,
        '.tmp/scratch/lesson-factory-2026-08-03T1727-0500/wp-08/team-B-wave-02-package/team-B-wave-02.bundle',
      ),
      checkout,
    ],
    { stdio: 'ignore' },
  );
  execFileSync(
    '/usr/bin/git',
    ['-C', checkout, 'checkout', '60f6e45f564c3c5ab100f896f2bf11bca83e8a98'],
    {
      stdio: 'ignore',
    },
  );
  approvedCandidateTemplate = join(checkout, 'content/lesson-candidates/team-B/V3-LES-619870');
  return approvedCandidateTemplate;
}
const requireFromTest = createRequire(import.meta.url);
const LIVE_AUTHORITY_ROOT = resolve(
  REPOSITORY_ROOT,
  '..',
  'lesson-factory-handoffs',
  '2026-08-03T1727-0500',
);
const FIXTURE_ROOT = join(
  REPOSITORY_ROOT,
  '.tmp/scratch/lesson-factory-2026-08-03T1727-0500/wp-08/tests',
);
const PINNED_COMMIT = '1'.repeat(40);
const HEAD_COMMIT = '2'.repeat(40);
const SHA = /^[0-9a-f]{64}$/;
const AUTHORITY_KEY = 'wp-08-test-finalization-key';
const RUN_ID = '2026-08-03T1727-0500';
const KIT_TOOL_VERSIONS = {
  node: 'v24.17.0',
  pnpm: 'PINNED_BY_PNPM_LOCK',
  wp03KitFactory: '1.0.0',
} as const;
const LOCKFILE_BYTES = 'lockfileVersion: test-fixture\n';
const SCHEMA_SOURCE_PATH = 'content/lesson-factory/schemas/test.schema.json';
const TEMPLATE_SOURCE_PATH = 'docs/lesson-authoring/template/v3-les-000000/test.json';
const SCHEMA_BYTES = `${canonical({ fixture: 'schema' })}\n`;
const TEMPLATE_BYTES = `${canonical({ fixture: 'template' })}\n`;
const SCHEMA_IDENTITIES = [['schemas/test.schema.json', sha256(SCHEMA_BYTES)]] as const;
const TEMPLATE_IDENTITIES = [['template/v3-les-000000/test.json', sha256(TEMPLATE_BYTES)]] as const;
const VALIDATOR_FILE_SHA256 = sha256('pinned-validator');
const VALIDATOR_FILES = [
  {
    gitBlobSha256: VALIDATOR_FILE_SHA256,
    path: 'validator.ts',
    sha256: VALIDATOR_FILE_SHA256,
  },
] as const;
const VALIDATOR_AGGREGATE = sha256(canonical(VALIDATOR_FILES));
const AUTHORITY_PINS = {
  executableSha256: 'a'.repeat(64),
  profileSha256: 'b'.repeat(64),
  proofSha256: 'c'.repeat(64),
  repositoryCommit: PINNED_COMMIT,
  schemaSha256: sha256(canonical(SCHEMA_IDENTITIES)),
  templateSha256: sha256(canonical(TEMPLATE_IDENTITIES)),
  toolSha256: sha256(LOCKFILE_BYTES),
} as const;
const NONCLAIMS = {
  humanApproved: false,
  officialRubricPass: false,
  publicationApproved: false,
} as const;
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

type Team = 'team-A' | 'team-B';
type LessonStatus = 'COMPLETE' | 'BLOCKED' | 'FAILED';

interface FixtureOptions {
  readonly team?: Team;
  readonly lessonCount?: number;
  readonly finalTeam?: boolean;
  readonly statuses?: readonly LessonStatus[];
  readonly contentVariant?: string;
  readonly protectedLeak?: boolean;
  readonly identityCollision?: boolean;
  readonly realGit?: boolean;
  readonly legacyIdentityAliases?: boolean;
  readonly mechanicalFailures?: readonly (
    | 'STRUCTURAL'
    | 'COMPUTED_QUALITY'
    | 'NORMALIZATION'
    | 'PROTECTED_BOUNDARY'
  )[];
  readonly authorityGeneration?: number;
  readonly invalidToolVersions?: boolean;
}

interface Fixture {
  readonly root: string;
  readonly centralRoot: string;
  readonly authorityRoot: string;
  readonly checkoutRoot: string;
  readonly candidateRoot: string;
  readonly team: Team;
  readonly lessonIds: readonly string[];
  readonly pinnedCommit: string;
  readonly wavePath: string;
  readonly teamPath: string;
  readonly kitManifestPath: string;
  readonly evidence: TeamReturnCheckoutEvidence;
  readonly request: TeamReturnIntakeRequest;
  readonly dependencies: TeamReturnIntakeDependencies;
}

let fixtureOrdinal = 0;
const fixtureRoots = new Set<string>();

function canonical(value: unknown): string {
  if (
    value === null ||
    typeof value === 'boolean' ||
    typeof value === 'number' ||
    typeof value === 'string'
  ) {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (typeof value !== 'object') throw new Error('fixture value is not canonical JSON');
  return `{${Object.entries(value)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`)
    .join(',')}}`;
}

function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${canonical(value)}\n`);
}

function makeWritable(path: string): void {
  if (!existsSync(path)) return;
  const info = lstatSync(path);
  if (info.isSymbolicLink()) return;
  if (!info.isDirectory()) {
    chmodSync(path, 0o600);
    return;
  }
  chmodSync(path, 0o700);
  for (const name of readdirSync(path)) makeWritable(join(path, name));
}

function makeImmutable(path: string): void {
  if (!existsSync(path)) return;
  const info = lstatSync(path);
  if (info.isDirectory()) {
    for (const name of readdirSync(path)) makeImmutable(join(path, name));
    chmodSync(path, 0o500);
  } else {
    chmodSync(path, 0o400);
  }
}

function removeFixtureRoot(root: string): void {
  makeWritable(root);
  rmSync(root, { force: true, recursive: true });
}

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
}

function git(root: string, args: readonly string[]): string {
  return execFileSync('/usr/bin/git', ['-C', root, ...args], {
    encoding: 'utf8',
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function gitWithInput(root: string, args: readonly string[], input: string): string {
  return execFileSync('/usr/bin/git', ['-C', root, ...args], {
    encoding: 'utf8',
    input,
    shell: false,
    stdio: ['pipe', 'pipe', 'pipe'],
  }).trim();
}

function commitAll(root: string, message: string): string {
  git(root, ['add', '--all']);
  git(root, [
    '-c',
    'user.name=WP08 Test',
    '-c',
    'user.email=wp08-test@example.invalid',
    'commit',
    '-m',
    message,
  ]);
  return git(root, ['rev-parse', 'HEAD']);
}

function fileIdentity(
  path: string,
  relativePath: string,
): {
  readonly path: string;
  readonly sha256: string;
  readonly size: number;
} {
  const bytes = readFileSync(path);
  return { path: relativePath, sha256: sha256(bytes), size: bytes.length };
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

function deterministicZip(
  files: readonly { readonly path: string; readonly bytes: Buffer }[],
): Buffer {
  const local: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const file of [...files].sort((left, right) => left.path.localeCompare(right.path))) {
    const name = Buffer.from(file.path);
    const checksum = crc32(file.bytes);
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0x0800, 6);
    localHeader.writeUInt32LE(checksum, 14);
    localHeader.writeUInt32LE(file.bytes.length, 18);
    localHeader.writeUInt32LE(file.bytes.length, 22);
    localHeader.writeUInt16LE(name.length, 26);
    local.push(localHeader, name, file.bytes);
    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(0x0314, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0x0800, 8);
    centralHeader.writeUInt32LE(checksum, 16);
    centralHeader.writeUInt32LE(file.bytes.length, 20);
    centralHeader.writeUInt32LE(file.bytes.length, 24);
    centralHeader.writeUInt16LE(name.length, 28);
    centralHeader.writeUInt32LE((0o100644 << 16) >>> 0, 38);
    centralHeader.writeUInt32LE(offset, 42);
    central.push(centralHeader, name);
    offset += localHeader.length + name.length + file.bytes.length;
  }
  const centralBytes = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralBytes.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, centralBytes, end]);
}

function zipSignatureOffsets(archive: Buffer, signature: number): number[] {
  const offsets: number[] = [];
  for (let offset = 0; offset <= archive.length - 4; offset += 1) {
    if (archive.readUInt32LE(offset) === signature) offsets.push(offset);
  }
  return offsets;
}

function recursiveFiles(root: string): string[] {
  const files: string[] = [];
  const walk = (directory: string): void => {
    for (const name of readdirSync(directory).sort()) {
      const absolute = join(directory, name);
      if (lstatSync(absolute).isDirectory()) walk(absolute);
      else files.push(relative(root, absolute).split('/').join('/'));
    }
  };
  walk(root);
  return files;
}

function signedArchiveRequest(
  fixture: Fixture,
  options: {
    readonly extraFiles?: readonly { readonly path: string; readonly bytes: Buffer }[];
    readonly includeAncestryProof?: boolean;
    readonly signedChangedPaths?: readonly string[];
    readonly signedHeadCommit?: string;
    readonly trustedKey?: 'MATCHING' | 'MISSING' | 'OTHER';
    readonly mutateArchive?: (archive: Buffer) => Buffer;
  } = {},
): TeamReturnIntakeRequest {
  const archiveFiles = recursiveFiles(fixture.candidateRoot).map((path) => ({
    bytes: readFileSync(join(fixture.candidateRoot, path)),
    path: `content/lesson-candidates/${fixture.team}/${path}`,
  }));
  const encodedArchive = deterministicZip([...archiveFiles, ...(options.extraFiles ?? [])]);
  const archive = options.mutateArchive?.(Buffer.from(encodedArchive)) ?? encodedArchive;
  const archivePath = join(fixture.root, 'return.zip');
  const attestationPath = join(fixture.root, 'return-attestation.json');
  writeFileSync(archivePath, archive);
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  if (options.trustedKey !== 'MISSING') {
    const trustedPublicKey =
      options.trustedKey === 'OTHER' ? generateKeyPairSync('ed25519').publicKey : publicKey;
    const trustedPath = join(
      fixture.authorityRoot,
      `authority/trusted-team-signers/${fixture.team}.ed25519.pub`,
    );
    mkdirSync(dirname(trustedPath), { recursive: true });
    writeFileSync(trustedPath, trustedPublicKey.export({ format: 'pem', type: 'spki' }));
  }
  const unsigned = {
    algorithm: 'ed25519',
    archiveSha256: sha256(archive),
    branch: fixture.evidence.branch,
    changedPaths: options.signedChangedPaths ?? fixture.evidence.changedPaths,
    format: 'lesson-generation-signed-wave-archive/1',
    headCommit: options.signedHeadCommit ?? fixture.evidence.headCommit,
    pinnedCommit: fixture.pinnedCommit,
    ...(options.includeAncestryProof === false ? {} : { pinnedAncestor: true }),
    teamId: fixture.team,
  };
  writeJson(attestationPath, {
    ...unsigned,
    signature: signBytes(null, Buffer.from(canonical(unsigned)), privateKey).toString('base64'),
  });
  return {
    ...fixture.request,
    source: {
      archivePath,
      attestationPath,
      kind: 'SIGNED_ARCHIVE',
    },
  };
}

function lessonIds(team: Team): string[] {
  const start = team === 'team-A' ? 100_001 : 200_001;
  return Array.from({ length: 30 }, (_, index) => `V3-LES-${start + index}`);
}

function packetBytes(team: Team, lessonId: string, assignmentId: string): string {
  return `${canonical({
    projection: {
      assignment_id: assignmentId,
      lesson_id: lessonId,
      team_id: team,
    },
  })}\n`;
}

function assignmentFor(team: Team, ids: readonly string[]): Record<string, unknown> {
  const lane = team === 'team-A' ? 'lane-02' : 'lane-03';
  const assignmentId =
    team === 'team-A'
      ? 'lesson-factory-deadline-2026-08-03-assignment-02'
      : 'lesson-factory-deadline-2026-08-03-assignment-03';
  return {
    assignments: ids.map((lessonId) => ({
      lane_id: lane,
      lesson_id: lessonId,
      max_revision_cycles: 3,
      output_directory: `.tmp/lesson-factory/${lane}/${lessonId.toLowerCase()}`,
      required_human_review_roles: ['INDEPENDENT_BLIND_SOLVER'],
      task_packet_ref: `packet:${lane}/${lessonId.toLowerCase()}#sha256:${sha256(
        packetBytes(team, lessonId, assignmentId),
      )}`,
    })),
    assignment_id: assignmentId,
    contract_id: 'lesson-factory.assignment-manifest',
    contract_version: '3.0.0',
    created_at: '2026-08-03T23:05:00Z',
    deadline_profile_ref: `profile:deadline-profile.json#sha256:${AUTHORITY_PINS.profileSha256}`,
    nonclaims: {
      efficacy_established: false,
      human_approved: false,
      learner_validated: false,
      mastery_calibrated: false,
      official_rubric_pass: false,
      production_published: false,
      publication_safe: false,
      readiness_validated: false,
      release_approved: false,
    },
    release_policy_ref: `policy:release-policy.json#sha256:${'7'.repeat(64)}`,
    rubric_identity: {
      rubric_path: 'key-docs/lesson-quality-rubric.md',
      rubric_sha256: '8'.repeat(64),
      rubric_version: '0.9.1',
    },
  };
}

function makeAuthority(
  centralRoot: string,
  authorityRoot: string,
  pinnedCommit = PINNED_COMMIT,
  legacyIdentityAliases = false,
  authorityGeneration = 3,
  invalidToolVersions = false,
): Readonly<
  Record<Team, { readonly assignment: Record<string, unknown>; readonly manifest: string }>
> {
  const legacyAlias = sha256(canonical([]));
  const authorityPins = {
    ...AUTHORITY_PINS,
    repositoryCommit: pinnedCommit,
    ...(legacyIdentityAliases ? { schemaSha256: legacyAlias, templateSha256: legacyAlias } : {}),
  };
  mkdirSync(join(authorityRoot, 'authority'), { recursive: true });
  writeFileSync(join(authorityRoot, 'authority/issuer.key'), AUTHORITY_KEY);
  writeFileSync(join(centralRoot, 'validator.ts'), 'pinned-validator');
  writeFileSync(join(centralRoot, 'pnpm-lock.yaml'), LOCKFILE_BYTES);
  mkdirSync(dirname(join(centralRoot, SCHEMA_SOURCE_PATH)), { recursive: true });
  mkdirSync(dirname(join(centralRoot, TEMPLATE_SOURCE_PATH)), { recursive: true });
  writeFileSync(join(centralRoot, SCHEMA_SOURCE_PATH), SCHEMA_BYTES);
  writeFileSync(join(centralRoot, TEMPLATE_SOURCE_PATH), TEMPLATE_BYTES);
  const coreFiles = [
    {
      kind: 'core',
      mode: 0o644,
      path: SCHEMA_IDENTITIES[0][0],
      sha256: SCHEMA_IDENTITIES[0][1],
      size: Buffer.byteLength(SCHEMA_BYTES),
      sourcePath: SCHEMA_SOURCE_PATH,
      sourceSha256: SCHEMA_IDENTITIES[0][1],
    },
    {
      kind: 'core',
      mode: 0o644,
      path: TEMPLATE_IDENTITIES[0][0],
      sha256: TEMPLATE_IDENTITIES[0][1],
      size: Buffer.byteLength(TEMPLATE_BYTES),
      sourcePath: TEMPLATE_SOURCE_PATH,
      sourceSha256: TEMPLATE_IDENTITIES[0][1],
    },
  ] as const;

  const teams = {} as Record<
    Team,
    {
      assignment: Record<string, unknown>;
      manifest: string;
      manifestSha256: string;
      archiveSha256: string;
      packetAggregateSha256: string;
    }
  >;

  for (const team of ['team-A', 'team-B'] as const) {
    const ids = lessonIds(team);
    const assignment = assignmentFor(team, ids);
    const assignmentPath = join(centralRoot, `content/lesson-factory/assignments/${team}-30.json`);
    writeJson(assignmentPath, assignment);
    const assignmentBytes = readFileSync(assignmentPath);
    const files: Array<Record<string, unknown>> = [
      {
        kind: 'assignment',
        mode: 0o644,
        path: `assignments/${team}-30.json`,
        sha256: sha256(assignmentBytes),
        size: assignmentBytes.length,
      },
      ...coreFiles,
    ];
    const packetHashes: string[] = [];
    for (const row of assignment.assignments as Array<Record<string, unknown>>) {
      const lessonId = String(row.lesson_id);
      const bytes = packetBytes(team, lessonId, String(assignment.assignment_id));
      const packetPath = join(
        centralRoot,
        `content/lesson-factory/packets/${lessonId}/task-source-packet.json`,
      );
      mkdirSync(dirname(packetPath), { recursive: true });
      writeFileSync(packetPath, bytes);
      const digest = sha256(bytes);
      packetHashes.push(digest);
      files.push({
        kind: 'packet',
        mode: 0o644,
        path: `packets/${lessonId}/task-source-packet.json`,
        sha256: digest,
        size: Buffer.byteLength(bytes),
      });
    }
    files.sort((left, right) => String(left.path).localeCompare(String(right.path)));
    const manifest = {
      allowedLessonIds: ids,
      allowedOutputRoot: `content/lesson-candidates/${team}`,
      allowedPaths: files.map((file) => file.path),
      assignmentId: assignment.assignment_id,
      assignmentSha256: sha256(assignmentBytes),
      branchConvention: `lesson-factory/${team}/wave-<nn>`,
      coreFiles,
      files,
      filesSha256: sha256(canonical(files)),
      forbiddenSharedPaths: [
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
      ],
      format: 'lesson-generation-kit-v1/2',
      generation: 2,
      laneId: team === 'team-A' ? 'lane-02' : 'lane-03',
      lifecycle: 'CANDIDATE_RUBRIC_SCREENED',
      nonclaims: NONCLAIMS,
      packetCount: 30,
      pins: {
        curriculumSha256: '6'.repeat(64),
        kitSha256: '5'.repeat(64),
        profileSha256: authorityPins.profileSha256,
        repositoryCommit: pinnedCommit,
        schemaSha256: authorityPins.schemaSha256,
        templateSha256: authorityPins.templateSha256,
        toolVersions: invalidToolVersions
          ? { ...KIT_TOOL_VERSIONS, node: 'not-a-semver' }
          : KIT_TOOL_VERSIONS,
      },
      repositoryCommit: pinnedCommit,
      repositoryUrl: 'https://github.com/jsonjj/mcat-prep.git',
      runId: RUN_ID,
      schemaVersion: '5.0.0',
      teamId: team,
      validatorAuthority: {
        aggregateSha256: VALIDATOR_AGGREGATE,
        files: VALIDATOR_FILES,
        repositoryCommit: pinnedCommit,
      },
    };
    const teamRoot = join(authorityRoot, `versions/v${authorityGeneration}`, team);
    const manifestPath = join(teamRoot, 'KIT-MANIFEST.json');
    writeJson(manifestPath, manifest);
    const manifestSha256 = sha256(readFileSync(manifestPath));
    const archiveSha256 = sha256(`${team}:generation-3-kit`);
    const packetAggregateSha256 = sha256(canonical(packetHashes));
    writeJson(join(teamRoot, 'READY.json'), {
      archiveSha256,
      assignmentSha256: sha256(assignmentBytes),
      format: 'wp-03-team-ready/2',
      lessonIds: ids,
      manifestSha256,
      packetAggregateSha256,
      packetCount: 30,
      status: 'READY',
      teamId: team,
    });
    writeFileSync(
      join(teamRoot, 'SEND-ME.txt'),
      [
        'WP03_TEAMMATE_KIT',
        `TEAM_ID=${team}`,
        `ARCHIVE=${team}-complete.zip`,
        `ARCHIVE_SHA256=${archiveSha256}`,
        `KIT_MANIFEST_SHA256=${manifestSha256}`,
        `REPOSITORY_COMMIT=${pinnedCommit}`,
        `ASSIGNMENT_SHA256=${sha256(assignmentBytes)}`,
        'PACKET_COUNT=30',
        'REQUIRES_MATCHING_READY_JSON=true',
        '',
      ].join('\n'),
    );
    writeFileSync(
      join(teamRoot, `${team}-complete.zip.sha256`),
      `${archiveSha256}  ${team}-complete.zip\n`,
    );
    teams[team] = {
      archiveSha256,
      assignment,
      manifest: manifestPath,
      manifestSha256,
      packetAggregateSha256,
    };
  }

  const unsigned = {
    allowedAction: 'PACKAGE_KITS',
    generation: authorityGeneration,
    issuer: 'WP03_FINALIZATION_AUTHORITY',
    pins: authorityPins,
    receiptId: `wp03-finalization-${authorityGeneration}-${'3'.repeat(16)}`,
    runId: RUN_ID,
    teams: (['team-A', 'team-B'] as const).map((team) => {
      const ids = lessonIds(team);
      const assignmentPath = join(
        centralRoot,
        `content/lesson-factory/assignments/${team}-30.json`,
      );
      return {
        archiveSha256: teams[team].archiveSha256,
        assignmentSha256: sha256(readFileSync(assignmentPath)),
        lessonIds: ids,
        manifestSha256: teams[team].manifestSha256,
        packetAggregateSha256: teams[team].packetAggregateSha256,
        smokeReceiptSha256: '4'.repeat(64),
        teamId: team,
      };
    }),
    validationTimestamp: '2026-08-04T10:54:22.910Z',
  };
  writeJson(join(authorityRoot, 'authority/finalization-receipt.json'), {
    ...unsigned,
    signature: createHmac('sha256', AUTHORITY_KEY).update(canonical(unsigned)).digest('hex'),
  });
  writeJson(join(authorityRoot, 'current.json'), {
    format: 'wp-03-current/1',
    generation: authorityGeneration,
    teams: ['team-A', 'team-B'],
    versionDirectory: `versions/v${authorityGeneration}`,
  });
  return {
    'team-A': { assignment: teams['team-A'].assignment, manifest: teams['team-A'].manifest },
    'team-B': { assignment: teams['team-B'].assignment, manifest: teams['team-B'].manifest },
  };
}

function makeCandidate(
  root: string,
  team: Team,
  assignment: Record<string, unknown>,
  lessonId: string,
  status: LessonStatus,
  options: Pick<
    FixtureOptions,
    'contentVariant' | 'identityCollision' | 'mechanicalFailures' | 'protectedLeak'
  >,
  pinnedCommit = PINNED_COMMIT,
): {
  readonly lessonHandoffSha256: string;
  readonly lessonId: string;
  readonly rootSha256: string;
  readonly status: LessonStatus;
} {
  mkdirSync(root, { recursive: true });
  const assignmentRow = (assignment.assignments as Array<Record<string, unknown>>).find(
    (row) => row.lesson_id === lessonId,
  );
  if (assignmentRow === undefined) throw new Error(`missing fixture assignment for ${lessonId}`);
  const packet = packetBytes(team, lessonId, String(assignment.assignment_id));
  mkdirSync(join(root, 'inputs'), { recursive: true });
  writeFileSync(join(root, 'inputs/task-source-packet.json'), packet);

  writeJson(join(root, 'lesson-script.json'), {
    lesson_id: lessonId,
    payload: {
      ordered_kc_ids: [`V3-KC-${lessonId.slice(-6)}`],
      ...(options.contentVariant === undefined ? {} : { fixture_variant: options.contentVariant }),
    },
  });
  writeJson(join(root, 'kc-coverage-matrix.json'), { lesson_id: lessonId });
  writeJson(join(root, 'lesson-presentation-plan.json'), { lesson_id: lessonId });
  writeJson(join(root, 'lesson-quality-report.json'), { lesson_id: lessonId });
  writeJson(join(root, 'learner-safe-items.json'), {
    lesson_id: lessonId,
    ...(options.protectedLeak === true ? { correct_answer: 'LEAK' } : {}),
  });
  writeJson(join(root, 'protected-items.json'), {
    access_policy: 'SERVER_ONLY',
    correct_answer: 'A',
    lesson_id: lessonId,
  });
  writeJson(join(root, 'source-claim-ledger.json'), { lesson_id: lessonId, source_codes: [] });
  writeJson(join(root, 'candidate-quality-ledger.json'), {
    lesson_id: lessonId,
    nonclaims: NONCLAIMS,
    official_quality_result: {
      approval_withheld: true,
      evaluation_available: false,
    },
  });
  let productionManifestTemplate: Record<string, unknown> | null = null;
  if (options.contentVariant === 'production-mechanical') {
    const approvedTeamRoot = dirname(approvedCandidateTemplateRoot());
    const productionRoot = join(approvedTeamRoot, lessonId);
    const templateLessonId = lstatSync(productionRoot).isDirectory() ? lessonId : 'V3-LES-619870';
    const selectedProductionRoot =
      templateLessonId === lessonId ? productionRoot : approvedCandidateTemplateRoot();
    const replaceLessonId = (value: unknown): unknown => {
      if (typeof value === 'string') {
        return value
          .replaceAll(templateLessonId, lessonId)
          .replaceAll(templateLessonId.slice(-6), lessonId.slice(-6));
      }
      if (Array.isArray(value)) return value.map(replaceLessonId);
      if (value !== null && typeof value === 'object') {
        return Object.fromEntries(
          Object.entries(value as Record<string, unknown>).map(([key, nested]) => [
            key,
            replaceLessonId(nested),
          ]),
        );
      }
      return value;
    };
    for (const path of [...PRIMARY_FILES, 'learner-safe-items.json', 'protected-items.json']) {
      writeJson(
        join(root, path),
        replaceLessonId(JSON.parse(readFileSync(join(selectedProductionRoot, path), 'utf8'))),
      );
    }
    productionManifestTemplate = replaceLessonId(
      JSON.parse(readFileSync(join(selectedProductionRoot, 'artifact-manifest.json'), 'utf8')),
    ) as Record<string, unknown>;
    const initialPlan = planLessonRehash(
      readdirSync(root)
        .filter((path) => path.endsWith('.json'))
        .map((relPath) => ({ rawText: readFileSync(join(root, relPath), 'utf8'), relPath })),
      `${JSON.stringify(productionManifestTemplate, null, 2)}\n`,
    );
    for (const write of initialPlan.writes) {
      if (write.relPath !== 'artifact-manifest.json') {
        writeFileSync(join(root, write.relPath), write.newText);
      }
    }
  }

  const primary = PRIMARY_FILES.map((path) => fileIdentity(join(root, path), path));
  const normalizationInputs = {
    learnerSafeItems: sha256(readFileSync(join(root, 'learner-safe-items.json'))),
    presentationPlan: sha256(readFileSync(join(root, 'lesson-presentation-plan.json'))),
    protectedItems: sha256(readFileSync(join(root, 'protected-items.json'))),
    script: sha256(readFileSync(join(root, 'lesson-script.json'))),
  };
  const mechanicalFailures = new Set(options.mechanicalFailures ?? []);
  const structuralFailure = mechanicalFailures.has('STRUCTURAL');
  const computedQualityFailure = mechanicalFailures.has('COMPUTED_QUALITY');
  const normalizationFailure = mechanicalFailures.has('NORMALIZATION');
  const protectedBoundaryFailure = mechanicalFailures.has('PROTECTED_BOUNDARY');
  writeJson(join(root, 'validation/lesson-validate.json'), {
    command: {
      cliMainSha256: VALIDATOR_FILES[0].sha256,
      exitCode: structuralFailure || computedQualityFailure || normalizationFailure ? 1 : 0,
      validatorAggregateSha256: VALIDATOR_AGGREGATE,
      validatorFiles: VALIDATOR_FILES,
    },
    format: 'lesson-generation-validation/2',
    lessonId,
    primaryArtifacts: primary,
    results: Array.from({ length: 15 }, (_, index) => ({
      detailSha256: sha256(`R${index + 1}`),
      lessonId,
      ok: !(structuralFailure && index === 0),
      rule: `R${index + 1}`,
    })),
    ruleSet: 'R1-R15',
    status: structuralFailure ? 'FAILED' : 'PASS',
  });
  writeJson(join(root, 'validation/computed-quality.json'), {
    checks: computedQualityFailure ? [{ code: 'FIXTURE_QUALITY', status: 'fail' }] : [],
    format: 'lesson-generation-computed-quality/2',
    lessonId,
    officialRubricPassClaimed: false,
    sourceArtifactSha256: sha256(readFileSync(join(root, 'lesson-script.json'))),
    status: computedQualityFailure ? 'FAILED' : 'N/A',
  });
  writeJson(join(root, 'validation/normalization-smoke.json'), {
    ...(normalizationFailure ? {} : { artifactSha256: normalizationInputs }),
    format: 'lesson-generation-normalization/2',
    inputArtifactSha256: normalizationInputs,
    lessonId,
    officialRubricPassClaimed: false,
    ok: !normalizationFailure,
    status: normalizationFailure ? 'FAILED' : 'PASS',
  });
  writeJson(join(root, 'validation/protected-scan.json'), {
    findings: protectedBoundaryFailure ? ['learner-safe-items.json:correctAnswer'] : [],
    format: 'lesson-generation-protected-scan/2',
    lessonId,
    protectedArtifact: fileIdentity(join(root, 'protected-items.json'), 'protected-items.json'),
    status: protectedBoundaryFailure ? 'FAILED' : 'PASS',
  });

  const evidenceBeforeReviews = [
    ...PRIMARY_FILES,
    'learner-safe-items.json',
    'protected-items.json',
    'source-claim-ledger.json',
    'candidate-quality-ledger.json',
    'inputs/task-source-packet.json',
    'validation/lesson-validate.json',
    'validation/computed-quality.json',
    'validation/normalization-smoke.json',
    'validation/protected-scan.json',
  ].map((path) => ({
    path,
    sha256: sha256(readFileSync(join(root, path))),
  }));
  const authorRunId = `author-${lessonId}-cycle-2`;
  const reviewFindingCodes = status === 'COMPLETE' ? [] : [`AUTHOR_${status}_EVIDENCE`];
  writeJson(join(root, 'reviews/author-self-audit.json'), {
    authorRunId,
    evidenceRefs: evidenceBeforeReviews,
    findingCodes: reviewFindingCodes,
    format: 'lesson-generation-author-self-audit/2',
    lessonId,
    nonclaims: NONCLAIMS,
    revisionCycle: 2,
    status: status === 'COMPLETE' ? 'PASS' : status,
  });
  writeJson(join(root, 'reviews/judge-pre-screen.json'), {
    authorVerdictReceived: false,
    evidenceRefs: [
      ...evidenceBeforeReviews,
      {
        path: 'reviews/author-self-audit.json',
        sha256: sha256(readFileSync(join(root, 'reviews/author-self-audit.json'))),
      },
    ],
    findingCodes: reviewFindingCodes,
    format: 'lesson-generation-judge-pre-screen/2',
    lessonId,
    nonclaims: NONCLAIMS,
    reviewedPrimaryArtifacts: primary,
    reviewerRole: 'INDEPENDENT_JUDGE',
    reviewerRunId:
      options.identityCollision === true ? authorRunId : `judge-${lessonId}-independent`,
    rubricProfileSha256: AUTHORITY_PINS.profileSha256,
    status: status === 'COMPLETE' ? 'SCREENED' : status,
  });

  const validationArtifacts = HASHED_LESSON_FILES.map((path) =>
    fileIdentity(join(root, path), path),
  );
  const evidenceArtifacts = [
    'inputs/task-source-packet.json',
    'validation/lesson-validate.json',
    'validation/computed-quality.json',
    'validation/normalization-smoke.json',
    'validation/protected-scan.json',
    'reviews/author-self-audit.json',
    'reviews/judge-pre-screen.json',
  ].map((path) => ({
    artifact_type: path.toUpperCase().replaceAll(/[^A-Z0-9]+/g, '_'),
    ...fileIdentity(join(root, path), path),
  }));
  const generatedManifest = {
    artifact_type: 'LESSON_ARTIFACT_MANIFEST',
    companion_artifacts: [
      'learner-safe-items.json',
      'protected-items.json',
      'source-claim-ledger.json',
      'candidate-quality-ledger.json',
    ].map((path) => fileIdentity(join(root, path), path)),
    evidence_artifacts: evidenceArtifacts,
    kit_validation_artifacts: validationArtifacts,
    kit_validation_contract: {
      format: 'lesson-generation-artifact-closure/2',
      lessonId,
      selfExcluded: ['artifact-manifest.json', 'LESSON-HANDOFF.json'],
    },
    lesson_binding: {
      lesson_id: lessonId,
      ordered_kc_ids: [`V3-KC-${lessonId.slice(-6)}`],
    },
    primary_artifacts: primary.map((file) => ({
      artifact_type: file.path,
      file_sha256: file.sha256,
      path: file.path,
    })),
    publication_status: 'INTERNAL_DRAFT_ONLY',
  };
  if (productionManifestTemplate === null) {
    writeJson(join(root, 'artifact-manifest.json'), generatedManifest);
  } else {
    const refreshRecords = (value: unknown): unknown =>
      Array.isArray(value)
        ? value.map((raw) => {
            const record = raw as Record<string, unknown>;
            const path =
              typeof record.path === 'string'
                ? record.path
                : typeof record.file === 'string'
                  ? record.file
                  : null;
            if (path === null || !existsSync(join(root, path))) return record;
            const bytes = readFileSync(join(root, path));
            return {
              ...record,
              ...('file_sha256' in record ? { file_sha256: sha256(bytes) } : {}),
              ...('sha256' in record ? { sha256: sha256(bytes) } : {}),
              ...('size' in record ? { size: bytes.byteLength } : {}),
            };
          })
        : value;
    const manifest = {
      ...productionManifestTemplate,
      companion_artifacts: refreshRecords(productionManifestTemplate.companion_artifacts),
      evidence_artifacts: refreshRecords(productionManifestTemplate.evidence_artifacts),
      kit_validation_artifacts: refreshRecords(productionManifestTemplate.kit_validation_artifacts),
      lesson_binding: {
        ...(productionManifestTemplate.lesson_binding as Record<string, unknown>),
        lesson_id: lessonId,
      },
      primary_artifacts: (
        productionManifestTemplate.primary_artifacts as Array<Record<string, unknown>>
      ).map((record) => {
        const path = String(record.path);
        return { ...record, file_sha256: sha256(readFileSync(join(root, path))) };
      }),
      publication_status: 'INTERNAL_DRAFT_ONLY',
    };
    const plan = planLessonRehash(
      readdirSync(root)
        .filter((path) => path.endsWith('.json'))
        .map((relPath) => ({ rawText: readFileSync(join(root, relPath), 'utf8'), relPath })),
      `${JSON.stringify(manifest, null, 2)}\n`,
    );
    for (const write of plan.writes) {
      writeFileSync(join(root, write.relPath), write.newText);
    }
    if (!existsSync(join(root, 'artifact-manifest.json'))) {
      writeFileSync(join(root, 'artifact-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    }
  }

  const artifactHashes = Object.fromEntries(
    [
      'artifact-manifest.json',
      'candidate-quality-ledger.json',
      'kc-coverage-matrix.json',
      'learner-safe-items.json',
      'lesson-presentation-plan.json',
      'lesson-quality-report.json',
      'lesson-script.json',
      'protected-items.json',
      'source-claim-ledger.json',
    ].map((path) => [path, sha256(readFileSync(join(root, path)))]),
  );
  const blockers =
    status === 'COMPLETE'
      ? []
      : [
          ...(structuralFailure ? ['STRUCTURAL_VALIDATION_FAILED'] : []),
          ...(computedQualityFailure ? ['COMPUTED_QUALITY_FAILED'] : []),
          ...(normalizationFailure ? ['NORMALIZATION_FAILED'] : []),
          ...(protectedBoundaryFailure ? ['PROTECTED_BOUNDARY_FAILED'] : []),
          `AUTHOR_SELF_AUDIT_${status}`,
          `JUDGE_PRE_SCREEN_${status}`,
        ].sort();
  writeJson(join(root, 'LESSON-HANDOFF.json'), {
    artifactHashes,
    artifactManifestSha256: artifactHashes['artifact-manifest.json'],
    assignmentId: assignment.assignment_id,
    authorSelfAuditRef: 'reviews/author-self-audit.json',
    computedQualityRef: 'validation/computed-quality.json',
    format: 'lesson-generation-lesson-handoff/2',
    judgePreScreenRef: 'reviews/judge-pre-screen.json',
    lessonId,
    lifecycle: status === 'COMPLETE' ? 'CANDIDATE_RUBRIC_SCREENED' : 'CANDIDATE_VALIDATION_BLOCKED',
    nonclaims: NONCLAIMS,
    packetSha256: sha256(packet),
    repositoryCommit: pinnedCommit,
    requestedStatus: status === 'COMPLETE' ? 'COMPLETE' : status,
    status,
    toolAndSchemaVersions: {
      kit: 'lesson-generation-kit-v1/generation-2',
      schemaSetSha256: AUTHORITY_PINS.schemaSha256,
      toolSha256: AUTHORITY_PINS.toolSha256,
    },
    unresolvedBlockerCodes: blockers,
    validationRefs: {
      lessonValidate: 'validation/lesson-validate.json',
      normalizationSmoke: 'validation/normalization-smoke.json',
      protectedScan: 'validation/protected-scan.json',
    },
  });
  return {
    lessonHandoffSha256: sha256(readFileSync(join(root, 'LESSON-HANDOFF.json'))),
    lessonId,
    rootSha256: sha256(readFileSync(join(root, 'artifact-manifest.json'))),
    status,
  };
}

const mechanicalPass: CentralMechanicalValidation = {
  computedQuality: 'PASS',
  normalization: 'PASS',
  protectedBoundary: 'PASS',
  structural: 'PASS',
  validatorEvidenceSha256: sha256('central-validator-pass'),
};

function makeFixture(options: FixtureOptions = {}): Fixture {
  fixtureOrdinal += 1;
  const root = join(FIXTURE_ROOT, `case-${String(fixtureOrdinal).padStart(3, '0')}`);
  fixtureRoots.add(root);
  makeWritable(root);
  rmSync(root, { force: true, recursive: true });
  const team = options.team ?? 'team-A';
  const checkoutRoot = join(root, options.realGit === true ? 'repository' : 'checkout');
  const centralRoot = options.realGit === true ? checkoutRoot : join(root, 'central');
  const authorityRoot = join(root, 'authority');
  mkdirSync(centralRoot, { recursive: true });
  mkdirSync(checkoutRoot, { recursive: true });
  let pinnedCommit = PINNED_COMMIT;
  let authority = makeAuthority(
    centralRoot,
    authorityRoot,
    pinnedCommit,
    options.legacyIdentityAliases === true,
    options.authorityGeneration ?? 3,
    options.invalidToolVersions === true,
  );
  git(checkoutRoot, ['init', '--initial-branch=main']);
  writeFileSync(join(checkoutRoot, '.gitignore'), '.tmp/\n');
  pinnedCommit = commitAll(checkoutRoot, 'pinned central authority');
  authority = makeAuthority(
    centralRoot,
    authorityRoot,
    pinnedCommit,
    options.legacyIdentityAliases === true,
    options.authorityGeneration ?? 3,
    options.invalidToolVersions === true,
  );
  git(checkoutRoot, ['checkout', '-b', `lesson-factory/${team}/wave-01`]);
  const count = options.finalTeam === true ? 30 : (options.lessonCount ?? 2);
  const ids = lessonIds(team).slice(0, count);
  const assignment = authority[team].assignment;
  const statuses = ids.map(
    (_lessonId, index) => options.statuses?.[index] ?? ('COMPLETE' as const),
  );
  const candidateRoot = join(checkoutRoot, `content/lesson-candidates/${team}`);
  const rows = ids.map((lessonId, index) =>
    makeCandidate(
      join(candidateRoot, lessonId),
      team,
      assignment,
      lessonId,
      statuses[index] ?? 'COMPLETE',
      options,
      pinnedCommit,
    ),
  );
  const wavePath = join(candidateRoot, 'waves/WAVE-01-HANDOFF.json');
  writeJson(wavePath, {
    assignmentId: assignment.assignment_id,
    format: 'lesson-generation-wave-handoff/1',
    nonclaims: NONCLAIMS,
    repositoryCommit: pinnedCommit,
    rows,
    teamId: team,
    waveId: 'WAVE-01',
  });
  const teamPath = join(candidateRoot, 'TEAM-HANDOFF.json');
  if (options.finalTeam === true) {
    writeJson(teamPath, {
      assignmentId: assignment.assignment_id,
      expectedRowCount: 30,
      format: 'lesson-generation-team-handoff/1',
      nonclaims: NONCLAIMS,
      repositoryCommit: pinnedCommit,
      rows,
      teamId: team,
    });
  }
  const headCommit = commitAll(checkoutRoot, 'complete teammate wave');
  const evidence: TeamReturnCheckoutEvidence = {
    branch: git(checkoutRoot, ['symbolic-ref', '--short', 'HEAD']),
    changedPaths: git(checkoutRoot, ['diff', '--name-only', `${pinnedCommit}..${headCommit}`])
      .split('\n')
      .filter((path) => path.length > 0)
      .sort(),
    clean: git(checkoutRoot, ['status', '--porcelain']) === '',
    headCommit,
    pinnedAncestor: true,
  };
  const dependencies: TeamReturnIntakeDependencies = {
    ...(options.realGit === true ? {} : { inspectCheckout: async () => evidence }),
    mechanicalValidate: async () => mechanicalPass,
  };
  return {
    authorityRoot,
    candidateRoot,
    centralRoot,
    checkoutRoot,
    dependencies,
    evidence,
    kitManifestPath: authority[team].manifest,
    lessonIds: ids,
    pinnedCommit,
    request: {
      authorityRoot,
      centralRepositoryRoot: centralRoot,
      mode: 'DRY_RUN',
      source: { kind: 'CHECKOUT', root: checkoutRoot },
    },
    root,
    team,
    teamPath,
    wavePath,
  };
}

function codes(result: Awaited<ReturnType<typeof intakeTeamReturn>>): string[] {
  return result.exceptions.map((exception) => exception.code);
}

function commitFixtureMutation(fixture: Fixture, message: string): void {
  const headCommit = commitAll(fixture.checkoutRoot, message);
  Object.assign(fixture.evidence, {
    changedPaths: git(fixture.checkoutRoot, [
      'diff',
      '--name-only',
      `${fixture.pinnedCommit}..${headCommit}`,
    ])
      .split('\n')
      .filter((path) => path.length > 0)
      .sort(),
    clean: true,
    headCommit,
    pinnedAncestor: true,
  });
}

function rewriteLessonHandoff(
  fixture: Fixture,
  mutate: (handoff: Record<string, unknown>) => void,
): void {
  const lessonId = fixture.lessonIds[0] as string;
  const handoffPath = join(fixture.candidateRoot, lessonId, 'LESSON-HANDOFF.json');
  const handoff = readJson(handoffPath);
  mutate(handoff);
  writeJson(handoffPath, handoff);
  const wave = readJson(fixture.wavePath);
  const row = (wave.rows as Array<Record<string, unknown>>).find(
    (candidate) => candidate.lessonId === lessonId,
  );
  if (row === undefined) throw new Error('fixture wave row missing');
  row.lessonHandoffSha256 = sha256(readFileSync(handoffPath));
  row.status = handoff.status;
  writeJson(fixture.wavePath, wave);
  commitFixtureMutation(fixture, 'rewrite lesson handoff fixture');
}

function rewriteFinalTeamLessons(
  fixture: Fixture,
  replacements: readonly {
    readonly index: number;
    readonly status: LessonStatus;
    readonly contentVariant?: string;
  }[],
): void {
  const assignment = readJson(
    join(fixture.centralRoot, `content/lesson-factory/assignments/${fixture.team}-30.json`),
  );
  const wave = readJson(fixture.wavePath);
  const team = readJson(fixture.teamPath);
  const waveRows = wave.rows as Array<Record<string, unknown>>;
  const teamRows = team.rows as Array<Record<string, unknown>>;
  if (replacements.some((replacement) => replacement.contentVariant === 'production-mechanical')) {
    const destination = join(
      fixture.centralRoot,
      'curriculum/v3/v3-lesson-authoring-manifest.json',
    );
    mkdirSync(dirname(destination), { recursive: true });
    cpSync(join(REPOSITORY_ROOT, 'curriculum/v3/v3-lesson-authoring-manifest.json'), destination);
  }
  for (const replacement of replacements) {
    const lessonId = fixture.lessonIds[replacement.index];
    if (lessonId === undefined) throw new Error('fixture replacement lesson missing');
    const row = makeCandidate(
      join(fixture.candidateRoot, lessonId),
      fixture.team,
      assignment,
      lessonId,
      replacement.status,
      {
        ...(replacement.contentVariant === undefined
          ? {}
          : { contentVariant: replacement.contentVariant }),
        identityCollision: false,
        mechanicalFailures: [],
        protectedLeak: false,
      },
      fixture.pinnedCommit,
    );
    waveRows[replacement.index] = row;
    teamRows[replacement.index] = row;
  }
  writeJson(fixture.wavePath, wave);
  writeJson(fixture.teamPath, team);
  commitFixtureMutation(fixture, 'rewrite final team lesson outcomes');
}

function stagedRoot(fixture: Fixture): string {
  return join(
    fixture.centralRoot,
    TEAM_RETURN_STAGING_RELATIVE_ROOT,
    fixture.team,
    fixture.request.source.kind === 'CHECKOUT' && existsSync(fixture.teamPath) ? 'TEAM' : 'WAVE-01',
  );
}

function filesystemIdentity(root: string): string {
  const entries: Array<Record<string, unknown>> = [];
  const walk = (path: string): void => {
    const info = lstatSync(path);
    const relativePath = relative(root, path).split('/').join('/');
    entries.push({
      kind: info.isDirectory() ? 'DIRECTORY' : 'FILE',
      mode: info.mode & 0o777,
      path: relativePath === '' ? '.' : relativePath,
      ...(info.isFile()
        ? {
            sha256: sha256(readFileSync(path)),
            size: info.size,
          }
        : {}),
    });
    if (info.isDirectory()) {
      for (const name of readdirSync(path).sort()) walk(join(path, name));
    }
  };
  walk(root);
  return sha256(canonical(entries));
}

function supersessionAuthority(prior: Awaited<ReturnType<typeof intakeTeamReturn>>) {
  return {
    action: 'SUPERSEDE_FINAL_TEAM' as const,
    expectedPriorSourceBatchSha256: prior.aggregates.sourceBatchSha256,
    expectedPriorStagingIdentitySha256: prior.copy.stagingIdentitySha256,
  };
}

type ForgeryKind =
  | 'ALTERNATE_PRIOR_RANGE'
  | 'EXTRA_SCHEMA'
  | 'EXTRA_ARCHIVE_FILE'
  | 'AUTHORITY_NESTED_EXTRA'
  | 'FORGED_MECHANICAL_PASS'
  | 'HANDOFF_NONCLAIM'
  | 'MALFORMED_MANIFEST'
  | 'OMIT_CONTROL_HANDOFFS'
  | 'PRIOR_RECEIPT_MISMATCH'
  | 'PROMOTED_CHECKER'
  | 'PROVENANCE'
  | 'ROW_ORDER'
  | 'SETS'
  | 'SOURCE_BLOB_IDENTITY'
  | 'SOURCE_EXTRA'
  | 'SOURCE_PATH_TRAVERSAL'
  | 'SOURCE_SHORTENED'
  | 'WAVE_BLOB'
  | 'WAVE_EXTRA'
  | 'WAVE_MODE'
  | 'WAVE_NONREGULAR_CLAIM'
  | 'WAVE_OMITTED'
  | 'WRONG_ASSIGNMENT_AUTHORITY'
  | 'WRONG_KIT_AUTHORITY'
  | 'WRONG_TOOL_AUTHORITY';

function acceptanceObjectPath(
  finalRoot: string,
  kind: 'archive' | 'manifest' | 'receipt',
  expectedSha256: string,
): string {
  const root = join(dirname(finalRoot), 'TEAM.acceptance-v1', 'objects', kind);
  const path = readdirSync(root)
    .map((name) => join(root, name))
    .find((candidate) => sha256(readFileSync(candidate)) === expectedSha256);
  if (path === undefined) throw new Error(`${kind} object missing`);
  return path;
}

function archiveTreeSha256(
  inventoryEntries: readonly {
    readonly path: string;
    readonly sha256: string;
    readonly size: number;
  }[],
): string {
  const directories = new Set<string>();
  for (const entry of inventoryEntries) {
    let parent = dirname(entry.path).split('/').join('/');
    while (parent !== '.' && parent !== '') {
      directories.add(parent);
      parent = dirname(parent).split('/').join('/');
    }
  }
  return sha256(
    canonical([
      ...[...directories].sort().map((path) => ({ kind: 'DIRECTORY', mode: 0o500, path })),
      ...inventoryEntries.map((entry) => ({ ...entry, kind: 'FILE', mode: 0o400 })),
    ]),
  );
}

function writeForgedObject(
  finalRoot: string,
  kind: 'archive' | 'manifest' | 'receipt',
  bytes: Buffer,
): string {
  const objectSha256 = sha256(bytes);
  const root = join(dirname(finalRoot), 'TEAM.acceptance-v1', 'objects', kind);
  const path = join(root, `${objectSha256}.object`);
  const indexPath = join(root, `${objectSha256}.index`);
  if (existsSync(indexPath)) return objectSha256;
  if (!existsSync(path)) writeFileSync(path, bytes, { flag: 'wx', mode: 0o400 });
  writeFileSync(indexPath, `${objectSha256}.object\n`, { flag: 'wx', mode: 0o400 });
  return objectSha256;
}

function forgedObjectIdentity(
  finalRoot: string,
  kind: 'archive' | 'manifest' | 'receipt',
  objectSha256: string,
) {
  const root = join(dirname(finalRoot), 'TEAM.acceptance-v1', 'objects', kind);
  const name = readFileSync(join(root, `${objectSha256}.index`), 'utf8').trim();
  const relativePath = `TEAM.acceptance-v1/objects/${kind}/${name}`;
  const info = lstatSync(join(dirname(finalRoot), relativePath));
  return {
    device: info.dev,
    inode: info.ino,
    mode: 0o400 as const,
    nlink: 1 as const,
    relativePath,
    size: info.size,
  };
}

function forgeAcceptanceHandle(
  finalRoot: string,
  accepted: Awaited<ReturnType<typeof intakeTeamReturn>>,
  kind: ForgeryKind,
  options: {
    readonly alternatePriorCommit?: string;
  } = {},
): NonNullable<(typeof accepted)['copy']['acceptance']> {
  const original = accepted.copy.acceptance;
  if (original === undefined) throw new Error('acceptance handle missing');
  const manifest = JSON.parse(
    readFileSync(acceptanceObjectPath(finalRoot, 'manifest', original.manifestSha256), 'utf8'),
  ) as Record<string, unknown>;
  const archive = JSON.parse(
    readFileSync(acceptanceObjectPath(finalRoot, 'archive', original.archiveSha256), 'utf8'),
  ) as {
    entries: Array<Record<string, unknown>>;
    format: string;
  };
  const intake = structuredClone(manifest.intake) as Record<string, unknown>;
  const supersession = structuredClone(manifest.supersession) as Record<string, unknown>;

  if (kind === 'ALTERNATE_PRIOR_RANGE') {
    if (options.alternatePriorCommit === undefined) throw new Error('alternate prior missing');
    const sourceProof = manifest.sourceProof as Record<string, unknown>;
    sourceProof.priorCommit = options.alternatePriorCommit;
  }
  if (kind === 'PRIOR_RECEIPT_MISMATCH') {
    const sourceProof = manifest.sourceProof as Record<string, unknown>;
    sourceProof.priorCommit = sourceProof.headCommit;
  }
  if (kind === 'EXTRA_SCHEMA') intake.unreviewedModule = { accepted: true };
  if (kind === 'PROVENANCE') {
    const source = intake.source as Record<string, unknown>;
    source.sourceSha256 = 'f'.repeat(64);
  }
  if (kind === 'SOURCE_PATH_TRAVERSAL') {
    const sourceProof = manifest.sourceProof as Record<string, unknown>;
    const changedPaths = [...(sourceProof.changedPaths as string[])];
    changedPaths[0] = '../attacker-alias';
    sourceProof.changedPaths = changedPaths.sort();
    const source = intake.source as Record<string, unknown>;
    source.sourceSha256 = sha256(
      canonical({
        branch: sourceProof.branch,
        changedPaths: sourceProof.changedPaths,
        headCommit: sourceProof.headCommit,
      }),
    );
  }
  if (kind === 'SOURCE_BLOB_IDENTITY') {
    const sourceProof = manifest.sourceProof as Record<string, unknown>;
    const identities = sourceProof.changedPathIdentities as Array<Record<string, unknown>>;
    const identity = identities.find((candidate) => String(candidate.path).includes('/V3-LES-'));
    if (identity === undefined) throw new Error('lesson source identity missing');
    identity.gitBlobSha1 = 'f'.repeat(40);
    identity.sha256 = 'f'.repeat(64);
    sourceProof.changedPathAggregateSha256 = sha256(canonical(identities));
  }
  if (kind === 'SOURCE_SHORTENED' || kind === 'SOURCE_EXTRA') {
    const sourceProof = manifest.sourceProof as Record<string, unknown>;
    const identities = structuredClone(sourceProof.changedPathIdentities) as Array<
      Record<string, unknown>
    >;
    if (kind === 'SOURCE_SHORTENED') {
      const index = identities.findIndex((identity) =>
        String(identity.path).endsWith('/TEAM-HANDOFF.json'),
      );
      identities.splice(index >= 0 ? index : identities.length - 1, 1);
    } else {
      identities.push({
        gitBlobSha1: 'f'.repeat(40),
        gitMode: '100644',
        path: 'content/lesson-candidates/team-B/waves/UNREVIEWED.json',
        sha256: 'f'.repeat(64),
        size: 1,
      });
    }
    identities.sort((left, right) => String(left.path).localeCompare(String(right.path)));
    sourceProof.changedPathIdentities = identities;
    sourceProof.changedPaths = identities.map((identity) => identity.path);
    sourceProof.changedPathAggregateSha256 = sha256(canonical(identities));
    const source = intake.source as Record<string, unknown>;
    source.sourceSha256 = sha256(
      canonical({
        branch: sourceProof.branch,
        changedPaths: sourceProof.changedPaths,
        headCommit: sourceProof.headCommit,
      }),
    );
  }
  if (kind === 'AUTHORITY_NESTED_EXTRA') {
    const admissionAuthority = manifest.admissionAuthority as Record<string, unknown>;
    const kit = admissionAuthority.kit as Record<string, unknown>;
    kit.unreviewedAuthority = true;
  }
  if (kind === 'FORGED_MECHANICAL_PASS') {
    const promotedAdmissions = manifest.promotedAdmissions as Array<Record<string, unknown>>;
    const mechanical = promotedAdmissions[0]?.mechanical as Record<string, unknown>;
    mechanical.validatorEvidenceSha256 = 'f'.repeat(64);
  }
  if (
    kind === 'WRONG_ASSIGNMENT_AUTHORITY' ||
    kind === 'WRONG_KIT_AUTHORITY' ||
    kind === 'WRONG_TOOL_AUTHORITY'
  ) {
    const admissionAuthority = manifest.admissionAuthority as Record<string, unknown>;
    if (kind === 'WRONG_ASSIGNMENT_AUTHORITY') {
      admissionAuthority.assignmentId = 'forged-reviewed-assignment';
    } else if (kind === 'WRONG_KIT_AUTHORITY') {
      admissionAuthority.kitSha256 = 'f'.repeat(64);
    } else {
      admissionAuthority.toolSha256 = 'f'.repeat(64);
    }
  }
  if (kind === 'ROW_ORDER') {
    (intake.rows as unknown[]).reverse();
  }
  if (kind === 'SETS') {
    const unchanged = supersession.unchangedCompleteLessonIds as string[];
    supersession.unchangedCompleteLessonIds = unchanged.slice(1);
    supersession.newlyCompleteLessonIds = [
      ...(supersession.newlyCompleteLessonIds as string[]),
      unchanged[0],
    ];
  }
  if (kind === 'HANDOFF_NONCLAIM') {
    const entry = archive.entries.find((candidate) =>
      String(candidate.path).endsWith('/LESSON-HANDOFF.json'),
    );
    if (entry === undefined) throw new Error('handoff archive entry missing');
    const handoff = JSON.parse(
      Buffer.from(String(entry.bytesBase64), 'base64').toString('utf8'),
    ) as Record<string, unknown>;
    handoff.nonclaims = {
      humanApproved: true,
      officialRubricPass: false,
      publicationApproved: false,
    };
    const bytes = Buffer.from(`${canonical(handoff)}\n`);
    entry.bytesBase64 = bytes.toString('base64');
    entry.sha256 = sha256(bytes);
    entry.size = bytes.byteLength;
  }
  if (kind === 'MALFORMED_MANIFEST' || kind === 'PROMOTED_CHECKER') {
    const promotedId = (supersession.newlyCompleteLessonIds as string[])[0] as string;
    const rows = intake.rows as Array<Record<string, unknown>>;
    const row = rows.find((candidate) => candidate.lessonId === promotedId);
    const handoffEntry = archive.entries.find(
      (candidate) => candidate.path === `lessons/${promotedId}/LESSON-HANDOFF.json`,
    );
    const manifestEntry = archive.entries.find(
      (candidate) => candidate.path === `lessons/${promotedId}/artifact-manifest.json`,
    );
    if (row === undefined || handoffEntry === undefined || manifestEntry === undefined) {
      throw new Error('promoted lesson archive closure missing');
    }
    const handoff = JSON.parse(
      Buffer.from(String(handoffEntry.bytesBase64), 'base64').toString('utf8'),
    ) as Record<string, unknown>;
    if (kind === 'MALFORMED_MANIFEST') {
      const bytes = Buffer.from('{}\n');
      manifestEntry.bytesBase64 = bytes.toString('base64');
      manifestEntry.sha256 = sha256(bytes);
      manifestEntry.size = bytes.byteLength;
    } else {
      const checkerPath = `lessons/${promotedId}/validation/lesson-validate.json`;
      const checkerEntry = archive.entries.find((candidate) => candidate.path === checkerPath);
      if (checkerEntry === undefined) throw new Error('promoted checker missing');
      const checkerBytes = Buffer.from('{}\n');
      checkerEntry.bytesBase64 = checkerBytes.toString('base64');
      checkerEntry.sha256 = sha256(checkerBytes);
      checkerEntry.size = checkerBytes.byteLength;
      const artifactManifest = JSON.parse(
        Buffer.from(String(manifestEntry.bytesBase64), 'base64').toString('utf8'),
      ) as Record<string, unknown>;
      for (const key of ['kit_validation_artifacts', 'evidence_artifacts']) {
        const identities = artifactManifest[key];
        if (!Array.isArray(identities)) continue;
        for (const identity of identities as Array<Record<string, unknown>>) {
          if (identity.path !== 'validation/lesson-validate.json') continue;
          if ('sha256' in identity) identity.sha256 = checkerEntry.sha256;
          if ('file_sha256' in identity) identity.file_sha256 = checkerEntry.sha256;
          if ('size' in identity) identity.size = checkerEntry.size;
        }
      }
      const manifestBytes = Buffer.from(`${canonical(artifactManifest)}\n`);
      manifestEntry.bytesBase64 = manifestBytes.toString('base64');
      manifestEntry.sha256 = sha256(manifestBytes);
      manifestEntry.size = manifestBytes.byteLength;
      const artifactHashes = handoff.artifactHashes as Record<string, unknown>;
      artifactHashes['validation/lesson-validate.json'] = checkerEntry.sha256;
    }
    handoff.artifactManifestSha256 = manifestEntry.sha256;
    const handoffBytes = Buffer.from(`${canonical(handoff)}\n`);
    handoffEntry.bytesBase64 = handoffBytes.toString('base64');
    handoffEntry.sha256 = sha256(handoffBytes);
    handoffEntry.size = handoffBytes.byteLength;
    row.lessonHandoffSha256 = handoffEntry.sha256;
    row.rootSha256 = manifestEntry.sha256;
  }
  if (kind === 'EXTRA_ARCHIVE_FILE') {
    const bytes = Buffer.from('{}\n');
    archive.entries.push({
      bytesBase64: bytes.toString('base64'),
      mode: 0o400,
      path: 'waves/UNREVIEWED-HANDOFF.json',
      sha256: sha256(bytes),
      size: bytes.byteLength,
    });
    archive.entries.sort((left, right) => String(left.path).localeCompare(String(right.path)));
  }
  if (kind === 'WAVE_EXTRA') {
    const bytes = Buffer.from('{"unreviewed":true}\n');
    archive.entries.push({
      bytesBase64: bytes.toString('base64'),
      mode: 0o400,
      path: 'waves/EXTRA-HANDOFF.json',
      sha256: sha256(bytes),
      size: bytes.byteLength,
    });
    archive.entries.sort((left, right) => String(left.path).localeCompare(String(right.path)));
  }
  if (kind === 'WAVE_OMITTED') {
    const index = archive.entries.findIndex((entry) => String(entry.path).startsWith('waves/'));
    if (index < 0) throw new Error('trusted wave missing');
    archive.entries.splice(index, 1);
  }
  if (kind === 'WAVE_MODE' || kind === 'WAVE_BLOB' || kind === 'WAVE_NONREGULAR_CLAIM') {
    const sourceProof = manifest.sourceProof as Record<string, unknown>;
    const waves = sourceProof.waveTreeIdentities as Array<Record<string, unknown>>;
    const wave = waves[0];
    if (wave === undefined) throw new Error('wave tree proof missing');
    if (kind === 'WAVE_MODE') wave.gitMode = wave.gitMode === '100644' ? '100755' : '100644';
    if (kind === 'WAVE_BLOB') {
      wave.gitBlobSha1 = 'f'.repeat(40);
      wave.sha256 = 'f'.repeat(64);
    }
    if (kind === 'WAVE_NONREGULAR_CLAIM') {
      wave.gitMode = '120000';
      wave.gitType = 'blob';
    }
    sourceProof.waveTreeAggregateSha256 = sha256(canonical(waves));
  }
  if (kind === 'OMIT_CONTROL_HANDOFFS') {
    archive.entries = archive.entries.filter(
      (entry) => entry.path !== 'TEAM-HANDOFF.json' && !String(entry.path).startsWith('waves/'),
    );
  }
  const candidateInventory = archive.entries.map((entry) => ({
    kind: 'FILE',
    mode: 0o400,
    path: entry.path,
    sha256: entry.sha256,
    size: entry.size,
  }));
  manifest.candidateRootClosure = {
    entryCount: candidateInventory.length,
    inventorySha256: sha256(canonical(candidateInventory)),
    pathSha256: sha256(canonical(candidateInventory.map((entry) => entry.path))),
  };

  const archiveBytes = Buffer.from(`${canonical(archive)}\n`);
  const archiveSha256 = writeForgedObject(finalRoot, 'archive', archiveBytes);
  const archiveDescriptor = {
    format: 'lesson-generation-team-acceptance-archive/1',
    mode: 0o400,
    relativePath: `TEAM.acceptance-v1/objects/archive/${archiveSha256}.index`,
    sha256: archiveSha256,
    size: archiveBytes.byteLength,
  };
  const inventoryEntries = archive.entries
    .filter((entry) => String(entry.path).startsWith('lessons/'))
    .map((entry) => ({
      path: String(entry.path).slice('lessons/'.length),
      sha256: String(entry.sha256),
      size: Number(entry.size),
    }));
  const aggregates = intake.aggregates as Record<string, unknown>;
  const rows = intake.rows as Array<Record<string, unknown>>;
  for (const row of rows) {
    const { code: _code, rowSha256: _rowSha256, ...core } = row;
    row.rowSha256 = sha256(canonical(core));
  }
  aggregates.sourceBatchSha256 = sha256(canonical(inventoryEntries));
  aggregates.rowSha256 = sha256(
    canonical(rows.map(({ code: _code, rowSha256: _rowSha256, ...row }) => row)),
  );
  aggregates.rootSha256 = sha256(
    canonical(rows.map((row) => ({ lessonId: row.lessonId, rootSha256: row.rootSha256 }))),
  );
  const copy = intake.copy as Record<string, unknown>;
  copy.stagingIdentitySha256 = sha256(
    canonical({
      scopeId: (intake.scope as Record<string, unknown>).id,
      sourceBatchSha256: aggregates.sourceBatchSha256,
      teamId: intake.teamId,
    }),
  );
  const replacement = supersession.replacement as Record<string, unknown>;
  replacement.copyIdentitySha256 = sha256(canonical(copy));
  replacement.rootSha256 = aggregates.rootSha256;
  replacement.rowSha256 = aggregates.rowSha256;
  replacement.sourceBatchSha256 = aggregates.sourceBatchSha256;
  replacement.sourceIdentitySha256 = sha256(canonical(intake.source));
  replacement.stagingIdentitySha256 = copy.stagingIdentitySha256;
  replacement.treeSha256 = archiveTreeSha256(inventoryEntries);
  const generationCore = {
    acceptanceMarkerRelativePath: supersession.acceptanceMarkerRelativePath,
    action: supersession.action,
    newlyCompleteLessonIds: supersession.newlyCompleteLessonIds,
    prior: supersession.prior,
    replacement,
    supersessionId: supersession.supersessionId,
    teamId: intake.teamId,
    unchangedCompleteLessonIds: supersession.unchangedCompleteLessonIds,
  };
  supersession.generationId = sha256(canonical(generationCore));
  intake.supersession = supersession;
  const { receiptSha256: _receiptSha256, ...unsignedIntake } = intake;
  intake.receiptSha256 = sha256(canonical(unsignedIntake));

  const receipt = {
    action: supersession.action,
    archive: archiveDescriptor,
    format: 'lesson-generation-team-acceptance-receipt/1',
    generationId: supersession.generationId,
    intakeReceiptSha256: intake.receiptSha256,
    predecessorReceiptSha256: (supersession.prior as Record<string, unknown>).receiptSha256,
    supersession,
  };
  const receiptBytes = Buffer.from(`${canonical(receipt)}\n`);
  const receiptSha256 = writeForgedObject(finalRoot, 'receipt', receiptBytes);
  const receiptDescriptor = {
    mode: 0o400,
    relativePath: `TEAM.acceptance-v1/objects/receipt/${receiptSha256}.index`,
    sha256: receiptSha256,
    size: receiptBytes.byteLength,
  };
  const { receiptSha256: _dryReceipt, ...dryBase } = intake;
  const dryUnsigned = {
    ...dryBase,
    copy: {
      disposition: 'SUPERSESSION_READY',
      stagedCompleteCount: 0,
      stagingIdentitySha256: copy.stagingIdentitySha256,
    },
    mode: 'DRY_RUN',
  };
  const forgedManifest = {
    ...manifest,
    acceptanceReceipt: receiptDescriptor,
    archive: archiveDescriptor,
    generationId: supersession.generationId,
    intake,
    package: {
      assignmentIdSha256: intake.assignmentIdSha256,
      authority: intake.authority,
      source: intake.source,
      sourceBatchSha256: aggregates.sourceBatchSha256,
      stagingIdentitySha256: copy.stagingIdentitySha256,
    },
    predecessor: supersession.prior,
    supersession,
    validation: {
      acceptedIntakeReceiptSha256: intake.receiptSha256,
      dryRunIntakeReceiptSha256: sha256(canonical(dryUnsigned)),
    },
  };
  const manifestBytes = Buffer.from(`${canonical(forgedManifest)}\n`);
  const manifestSha256 = writeForgedObject(finalRoot, 'manifest', manifestBytes);
  const markerPath = join(dirname(finalRoot), original.markerRelativePath);
  unlinkSync(markerPath);
  symlinkSync(manifestSha256, markerPath);
  const markerInfo = lstatSync(markerPath);
  return {
    archiveSha256,
    generationId: String(supersession.generationId),
    manifestSha256,
    marker: {
      device: markerInfo.dev,
      inode: markerInfo.ino,
      mode: markerInfo.mode & 0o777,
      target: manifestSha256,
    },
    markerRelativePath: original.markerRelativePath,
    objects: {
      archive: forgedObjectIdentity(finalRoot, 'archive', archiveSha256),
      manifest: forgedObjectIdentity(finalRoot, 'manifest', manifestSha256),
      receipt: forgedObjectIdentity(finalRoot, 'receipt', receiptSha256),
    },
    receiptSha256,
    sourceCommit: String((intake.source as Record<string, unknown>).headCommit),
    sourceTreeSha256: String(replacement.treeSha256),
  };
}

async function prepareFinalTeamSupersession(
  options: {
    readonly changePriorComplete?: boolean;
    readonly downgradePriorComplete?: boolean;
    readonly team?: Team;
  } = {},
) {
  if ((options.team ?? 'team-B') !== 'team-B') {
    const fixture = makeFixture({
      finalTeam: true,
      statuses: Array.from({ length: 30 }, (_, index) =>
        index < 23 ? ('COMPLETE' as const) : ('BLOCKED' as const),
      ),
      ...(options.team === undefined ? {} : { team: options.team }),
    });
    const prior = await intakeTeamReturn(
      { ...fixture.request, mode: 'ACCEPT' },
      fixture.dependencies,
    );
    rewriteFinalTeamLessons(
      fixture,
      Array.from({ length: 7 }, (_, offset) => ({
        index: 23 + offset,
        status: 'COMPLETE' as const,
      })),
    );
    return {
      authority: supersessionAuthority(prior),
      finalRoot: stagedRoot(fixture),
      fixture,
      prior,
    };
  }
  fixtureOrdinal += 1;
  const root = join(
    FIXTURE_ROOT,
    `production-${process.pid}-${String(fixtureOrdinal).padStart(3, '0')}`,
  );
  fixtureRoots.add(root);
  rmSync(root, { force: true, recursive: true });
  mkdirSync(root, { recursive: true });
  const checkoutRoot = join(root, 'checkout');
  execFileSync(
    '/usr/bin/git',
    [
      'clone',
      join(
        REPOSITORY_ROOT,
        '.tmp/scratch/lesson-factory-2026-08-03T1727-0500/wp-08/team-B-wave-02-package/team-B-wave-02.bundle',
      ),
      checkoutRoot,
    ],
    { stdio: 'ignore' },
  );
  git(checkoutRoot, [
    'checkout',
    '-B',
    'lesson-factory/team-B/wave-01',
    '60f6e45f564c3c5ab100f896f2bf11bca83e8a98',
  ]);
  const centralRoot = join(root, 'central');
  cpSync(checkoutRoot, centralRoot, { recursive: true });
  cpSync(
    join(REPOSITORY_ROOT, 'content/lesson-factory/assignments/team-B-30.json'),
    join(centralRoot, 'content/lesson-factory/assignments/team-B-30.json'),
  );
  cpSync(
    join(REPOSITORY_ROOT, 'content/lesson-factory/packets'),
    join(centralRoot, 'content/lesson-factory/packets'),
    { recursive: true },
  );
  const finalRoot = join(centralRoot, TEAM_RETURN_STAGING_RELATIVE_ROOT, 'team-B', 'TEAM');
  mkdirSync(dirname(finalRoot), { recursive: true });
  cpSync(join(REPOSITORY_ROOT, TEAM_RETURN_STAGING_RELATIVE_ROOT, 'team-B', 'TEAM'), finalRoot, {
    recursive: true,
  });
  makeImmutable(finalRoot);
  const prior = JSON.parse(readFileSync(join(finalRoot, 'INTAKE-RECEIPT.json'), 'utf8')) as Awaited<
    ReturnType<typeof intakeTeamReturn>
  >;
  const pinnedCommit = '5fd019fa9fb16bb4ab29885f50a12934483180e3';
  const headCommit = git(checkoutRoot, ['rev-parse', 'HEAD']);
  const evidence: TeamReturnCheckoutEvidence = {
    branch: git(checkoutRoot, ['symbolic-ref', '--short', 'HEAD']),
    changedPaths: git(checkoutRoot, ['diff', '--name-only', `${pinnedCommit}..${headCommit}`])
      .split('\n')
      .filter(Boolean)
      .sort(),
    clean: true,
    headCommit,
    pinnedAncestor: true,
  };
  const candidateRoot = join(checkoutRoot, 'content/lesson-candidates/team-B');
  const fixture: Fixture = {
    authorityRoot: LIVE_AUTHORITY_ROOT,
    candidateRoot,
    centralRoot,
    checkoutRoot,
    dependencies: {},
    evidence,
    kitManifestPath: '',
    lessonIds: prior.rows.map((row) => row.lessonId),
    pinnedCommit,
    request: {
      authorityRoot: LIVE_AUTHORITY_ROOT,
      centralRepositoryRoot: centralRoot,
      mode: 'DRY_RUN',
      source: { kind: 'CHECKOUT', root: checkoutRoot },
    },
    root,
    team: 'team-B',
    teamPath: join(candidateRoot, 'TEAM-HANDOFF.json'),
    wavePath: join(candidateRoot, 'waves/WAVE-01-HANDOFF.json'),
  };
  if (options.changePriorComplete === true) {
    const path = join(candidateRoot, prior.rows[0]?.lessonId ?? '', 'lesson-script.json');
    const value = readJson(path);
    value.reviewForgery = true;
    writeJson(path, value);
    commitFixtureMutation(fixture, 'change prior accepted lesson');
  }
  if (options.downgradePriorComplete === true) {
    rewriteFinalTeamLessons(fixture, [{ index: 0, status: 'BLOCKED' }]);
  }
  return {
    authority: supersessionAuthority(prior),
    finalRoot: stagedRoot(fixture),
    fixture,
    prior,
  };
}

function installEquivalentAlternatePrior(fixture: Fixture, actualPriorCommit: string): string {
  const priorTree = git(fixture.checkoutRoot, ['rev-parse', `${actualPriorCommit}^{tree}`]);
  const alternatePrior = git(fixture.checkoutRoot, [
    '-c',
    'user.name=WP08 Test',
    '-c',
    'user.email=wp08-test@example.invalid',
    'commit-tree',
    priorTree,
    '-p',
    actualPriorCommit,
    '-m',
    'equivalent alternate predecessor',
  ]);
  const approvedHead = git(fixture.checkoutRoot, ['rev-parse', 'HEAD']);
  const approvedTree = git(fixture.checkoutRoot, ['rev-parse', `${approvedHead}^{tree}`]);
  const mergeHead = git(fixture.checkoutRoot, [
    '-c',
    'user.name=WP08 Test',
    '-c',
    'user.email=wp08-test@example.invalid',
    'commit-tree',
    approvedTree,
    '-p',
    approvedHead,
    '-p',
    alternatePrior,
    '-m',
    'approved package with alternate ancestor',
  ]);
  git(fixture.checkoutRoot, ['reset', '--hard', mergeHead]);
  return alternatePrior;
}

function installEquivalentReplacementHead(fixture: Fixture): string {
  const approvedHead = git(fixture.checkoutRoot, ['rev-parse', 'HEAD']);
  const approvedTree = git(fixture.checkoutRoot, ['rev-parse', `${approvedHead}^{tree}`]);
  const replacementHead = git(fixture.checkoutRoot, [
    '-c',
    'user.name=WP08 Test',
    '-c',
    'user.email=wp08-test@example.invalid',
    'commit-tree',
    approvedTree,
    '-p',
    approvedHead,
    '-m',
    'unapproved equivalent replacement head',
  ]);
  git(fixture.checkoutRoot, ['reset', '--hard', replacementHead]);
  return replacementHead;
}

function replaceTreeChild(
  root: string,
  treeish: string,
  childName: string,
  replacementTreeSha1: string,
): string {
  const entries = git(root, ['ls-tree', treeish]).split('\n').filter(Boolean);
  const index = entries.findIndex((entry) => entry.endsWith(`\t${childName}`));
  if (index < 0) throw new Error(`tree child missing: ${childName}`);
  entries[index] = `040000 tree ${replacementTreeSha1}\t${childName}`;
  return gitWithInput(root, ['mktree'], `${entries.join('\n')}\n`);
}

function installNonregularWaveTreeHead(
  fixture: Fixture,
  variant: 'EMPTY_TREE' | 'NESTED_TREE' | 'SUBMODULE',
): { readonly marker: string; readonly replacementCommit: string } {
  const root = fixture.checkoutRoot;
  const approvedHead = git(root, ['rev-parse', 'HEAD']);
  const wavesTree = git(root, [
    'rev-parse',
    `${approvedHead}:content/lesson-candidates/team-B/waves`,
  ]);
  const waveEntries = git(root, ['ls-tree', wavesTree]).split('\n').filter(Boolean);
  let marker: string;
  if (variant === 'SUBMODULE') {
    marker = 'SUBMODULE-REVIEWED';
    waveEntries.push(`160000 commit ${approvedHead}\t${marker}`);
  } else {
    marker = variant === 'EMPTY_TREE' ? 'EMPTY-REVIEWED' : 'NESTED-REVIEWED';
    const insertedTree =
      variant === 'EMPTY_TREE'
        ? gitWithInput(root, ['mktree'], '')
        : gitWithInput(
            root,
            ['mktree'],
            `100644 blob ${git(root, [
              'rev-parse',
              `${approvedHead}:content/lesson-candidates/team-B/waves/WAVE-01-HANDOFF.json`,
            ])}\tNESTED.json\n`,
          );
    waveEntries.push(`040000 tree ${insertedTree}\t${marker}`);
  }
  waveEntries.sort((left, right) =>
    left.slice(left.indexOf('\t') + 1).localeCompare(right.slice(right.indexOf('\t') + 1)),
  );
  const replacementWaves = gitWithInput(root, ['mktree'], `${waveEntries.join('\n')}\n`);
  const teamTree = replaceTreeChild(
    root,
    `${approvedHead}:content/lesson-candidates/team-B`,
    'waves',
    replacementWaves,
  );
  const candidatesTree = replaceTreeChild(
    root,
    `${approvedHead}:content/lesson-candidates`,
    'team-B',
    teamTree,
  );
  const contentTree = replaceTreeChild(
    root,
    `${approvedHead}:content`,
    'lesson-candidates',
    candidatesTree,
  );
  const rootTree = replaceTreeChild(root, `${approvedHead}^{tree}`, 'content', contentTree);
  const replacementHead = git(root, [
    '-c',
    'user.name=WP08 Test',
    '-c',
    'user.email=wp08-test@example.invalid',
    'commit-tree',
    rootTree,
    '-p',
    approvedHead,
    '-m',
    `add ${variant.toLowerCase()} reviewed wave entry`,
  ]);
  git(root, ['reset', '--hard', replacementHead]);
  return { marker, replacementCommit: replacementHead };
}

async function spawnPausedAcceptancePublication(
  prepared: Awaited<ReturnType<typeof prepareFinalTeamSupersession>>,
  boundary: string,
): Promise<ChildProcessWithoutNullStreams> {
  const moduleUrl = pathToFileURL(join(import.meta.dirname, 'team-return-intake.ts')).href;
  const script = `
    import { writeFileSync } from 'node:fs';
    import { intakeTeamReturn } from ${JSON.stringify(moduleUrl)};
    const request = JSON.parse(process.env.WP08_REQUEST);
    const evidence = JSON.parse(process.env.WP08_EVIDENCE);
    const boundary = process.env.WP08_BOUNDARY;
    const result = await intakeTeamReturn(request, {
      inspectCheckout: async () => evidence,
      onSupersessionBoundary: (value) => {
        if (value !== boundary) return;
        writeFileSync(1, \`WP08_BOUNDARY:\${value}\\n\`);
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0);
      },
    });
    writeFileSync(1, \`WP08_RESULT:\${JSON.stringify(result)}\\n\`);
  `;
  const child = spawn(
    process.execPath,
    ['--import', requireFromTest.resolve('tsx'), '--input-type=module', '--eval', script],
    {
      cwd: REPOSITORY_ROOT,
      env: {
        ...process.env,
        WP08_BOUNDARY: boundary,
        WP08_EVIDENCE: JSON.stringify(prepared.fixture.evidence),
        WP08_MECHANICAL: JSON.stringify(mechanicalPass),
        WP08_REQUEST: JSON.stringify({
          ...prepared.fixture.request,
          mode: 'ACCEPT',
          supersession: prepared.authority,
        }),
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    },
  );
  await new Promise<void>((resolveReady, rejectReady) => {
    let output = '';
    let errorOutput = '';
    let settled = false;
    child.stdout.on('data', (chunk: Buffer) => {
      output += chunk.toString('utf8');
      if (!settled && output.includes(`WP08_BOUNDARY:${boundary}\n`)) {
        settled = true;
        resolveReady();
      }
    });
    child.stderr.on('data', (chunk: Buffer) => {
      errorOutput += chunk.toString('utf8');
    });
    child.once('exit', (code, signal) => {
      if (settled) return;
      settled = true;
      rejectReady(
        new Error(
          `acceptance child exited before ${boundary}: ${String(code)}/${String(signal)} ${errorOutput} ${output}`,
        ),
      );
    });
  });
  return child;
}

async function killPausedAcceptanceChild(child: ChildProcessWithoutNullStreams): Promise<void> {
  child.kill('SIGKILL');
  await once(child, 'exit');
}

function expectImmutableTreeModes(root: string): void {
  const visit = (path: string): void => {
    const info = lstatSync(path);
    expect(info.mode & 0o777, path).toBe(info.isDirectory() ? 0o500 : 0o400);
    if (info.isDirectory()) {
      for (const name of readdirSync(path)) visit(join(path, name));
    }
  };
  visit(root);
}

describe('deterministic Team A/B return intake', () => {
  afterEach(() => {
    for (const root of fixtureRoots) {
      removeFixtureRoot(root);
      fixtureRoots.delete(root);
    }
  }, 120_000);

  afterAll(() => {
    makeWritable(FIXTURE_ROOT);
    rmSync(FIXTURE_ROOT, { force: true, recursive: true });
  }, 120_000);

  it('admits the live generation-3 lockfile tool pin without KIT_AUTHORITY_INVALID', async () => {
    const checkoutRoot = join(FIXTURE_ROOT, 'live-authority-probe');
    rmSync(checkoutRoot, { force: true, recursive: true });
    mkdirSync(join(checkoutRoot, 'content/lesson-candidates/team-A'), { recursive: true });

    const result = await intakeTeamReturn(
      {
        authorityRoot: LIVE_AUTHORITY_ROOT,
        centralRepositoryRoot: REPOSITORY_ROOT,
        source: { kind: 'CHECKOUT', root: checkoutRoot },
      },
      {
        inspectCheckout: async () => ({
          branch: 'lesson-factory/team-A/wave-01',
          changedPaths: [],
          clean: true,
          headCommit: HEAD_COMMIT,
          pinnedAncestor: true,
        }),
      },
    );

    const finalization = readJson(join(LIVE_AUTHORITY_ROOT, 'authority/finalization-receipt.json'));
    const liveToolSha256 = (finalization.pins as Record<string, unknown>).toolSha256;
    expect(sha256(readFileSync(join(REPOSITORY_ROOT, 'pnpm-lock.yaml')))).toBe(liveToolSha256);
    expect(liveToolSha256).toBe('c86aadae5734de469361d77ee99e7b6ab9630e6d9e319f721132e63248dfa8af');
    expect(result.authority.generation).toBe(3);
    expect(codes(result)).not.toContain('KIT_AUTHORITY_INVALID');
    expect(codes(result)).toContain('SOURCE_AMBIGUOUS');
  });

  it('rejects empty schema/template aggregate aliases outside the exact live legacy cohort', async () => {
    const fixture = makeFixture({ legacyIdentityAliases: true });

    const result = await intakeTeamReturn(fixture.request, fixture.dependencies);

    expect(codes(result)).toContain('KIT_AUTHORITY_INVALID');
  });

  it('requires and accepts corrected nonempty identity aggregates for future authorities', async () => {
    const fixture = makeFixture({ authorityGeneration: 4 });

    const result = await intakeTeamReturn(fixture.request, fixture.dependencies);

    expect(result.decision, JSON.stringify(result.exceptions)).toBe('ACCEPTED');
    expect(result.authority.generation).toBe(4);
  });

  it('validates pinned tool-version metadata separately from the raw lockfile hash', async () => {
    const fixture = makeFixture({ invalidToolVersions: true });

    const result = await intakeTeamReturn(fixture.request, fixture.dependencies);

    expect(codes(result)).toContain('KIT_AUTHORITY_INVALID');
  });

  it('derives the team from generation-3 authority and rejects a wrong team branch', async () => {
    const fixture = makeFixture();
    const result = await intakeTeamReturn(fixture.request, {
      ...fixture.dependencies,
      inspectCheckout: async () => ({
        ...fixture.evidence,
        branch: 'lesson-factory/team-B/wave-01',
      }),
    });

    expect(result.decision).toBe('REJECTED');
    expect(codes(result)).toContain('BRANCH_TEAM_MISMATCH');
  });

  it('rejects a substituted lesson outside the manifested assignment', async () => {
    const fixture = makeFixture();
    const wave = readJson(fixture.wavePath);
    const rows = wave.rows as Array<Record<string, unknown>>;
    rows[0] = { ...rows[0], lessonId: lessonIds('team-B')[0] };
    writeJson(fixture.wavePath, wave);
    commitFixtureMutation(fixture, 'substitute lesson row');

    const result = await intakeTeamReturn(fixture.request, fixture.dependencies);

    expect(result.decision).toBe('REJECTED');
    expect(codes(result)).toContain('LESSON_NOT_ASSIGNED');
  });

  it('rejects any changed path outside assigned candidates and WAVE/TEAM handoffs', async () => {
    const fixture = makeFixture();
    const result = await intakeTeamReturn(fixture.request, {
      ...fixture.dependencies,
      inspectCheckout: async () => ({
        ...fixture.evidence,
        changedPaths: [...fixture.evidence.changedPaths, 'packages/content/src/index.ts'],
      }),
    });

    expect(codes(result)).toContain('SHARED_PATH_CHANGED');
  });

  it.each([
    [
      'entry count',
      Array.from(
        { length: 1025 },
        (_, index) =>
          `content/lesson-candidates/team-A/V3-LES-100001/high-count-${String(index)}.json`,
      ),
    ],
    [
      'total UTF-8 path bytes',
      Array.from(
        { length: 700 },
        (_, index) =>
          `content/lesson-candidates/team-A/V3-LES-100001/${'x'.repeat(160)}-${String(index)}.json`,
      ),
    ],
  ] as const)(
    'rejects checkout snapshot %s before per-path Git work',
    async (_case, changedPaths) => {
      const fixture = makeFixture({ lessonCount: 1 });
      const workParent = join(
        fixture.centralRoot,
        '.tmp/scratch/lesson-factory-2026-08-03T1727-0500/wp-08/archive-work',
      );

      const result = await intakeTeamReturn(fixture.request, {
        ...fixture.dependencies,
        inspectCheckout: async () => ({
          ...fixture.evidence,
          changedPaths,
        }),
      });

      expect(codes(result)).toContain('SOURCE_RESOURCE_LIMIT_EXCEEDED');
      expect(codes(result)).not.toContain('SOURCE_SNAPSHOT_INVALID');
      expect(existsSync(workParent) ? readdirSync(workParent) : []).toEqual([]);
    },
  );

  it('rejects a checkout whose head is not descended from the generation-3 pin', async () => {
    const fixture = makeFixture();
    const result = await intakeTeamReturn(fixture.request, {
      ...fixture.dependencies,
      inspectCheckout: async () => ({ ...fixture.evidence, pinnedAncestor: false }),
    });

    expect(codes(result)).toContain('ANCESTRY_INVALID');
  });

  it('inspects a real clean Git checkout and derives its commit range without injection', async () => {
    const fixture = makeFixture({ realGit: true });

    const result = await intakeTeamReturn(fixture.request, {
      mechanicalValidate: async () => mechanicalPass,
    });

    expect(result.decision, JSON.stringify(result.exceptions)).toBe('ACCEPTED');
    expect(result.source.headCommit).toBe(fixture.evidence.headCommit);
    expect(result.source.branch).toBe('lesson-factory/team-A/wave-01');
  });

  it('rejects a stale KIT repository pin with its exact code', async () => {
    const staleKit = makeFixture();
    const manifest = readJson(staleKit.kitManifestPath);
    manifest.repositoryCommit = '0'.repeat(40);
    writeJson(staleKit.kitManifestPath, manifest);

    expect(codes(await intakeTeamReturn(staleKit.request, staleKit.dependencies))).toContain(
      'KIT_MANIFEST_HASH_MISMATCH',
    );
  });

  it('rejects a stale packet hash with its exact code', async () => {
    const stalePacket = makeFixture();
    writeFileSync(
      join(
        stalePacket.candidateRoot,
        stalePacket.lessonIds[0] as string,
        'inputs/task-source-packet.json',
      ),
      'tampered packet',
    );
    commitFixtureMutation(stalePacket, 'tamper packet');
    expect(codes(await intakeTeamReturn(stalePacket.request, stalePacket.dependencies))).toContain(
      'PACKET_PIN_MISMATCH',
    );
  });

  it('rejects a stale row-root hash with its exact code', async () => {
    const staleRoot = makeFixture();
    const wave = readJson(staleRoot.wavePath);
    const rows = wave.rows as Array<Record<string, unknown>>;
    rows[0] = { ...rows[0], rootSha256: '0'.repeat(64) };
    writeJson(staleRoot.wavePath, wave);
    commitFixtureMutation(staleRoot, 'tamper row root');
    expect(codes(await intakeTeamReturn(staleRoot.request, staleRoot.dependencies))).toContain(
      'ROW_ROOT_HASH_MISMATCH',
    );
  });

  it('requires the lesson handoff to bind the raw lockfile tool authority', async () => {
    const fixture = makeFixture({ lessonCount: 1 });
    rewriteLessonHandoff(fixture, (handoff) => {
      delete (handoff.toolAndSchemaVersions as Record<string, unknown>).toolSha256;
    });

    const result = await intakeTeamReturn(fixture.request, fixture.dependencies);

    expect(codes(result)).toContain('HANDOFF_INVALID');
  });

  it('rejects missing and duplicate wave rows', async () => {
    const missing = makeFixture();
    const missingWave = readJson(missing.wavePath);
    (missingWave.rows as unknown[]).pop();
    writeJson(missing.wavePath, missingWave);
    commitFixtureMutation(missing, 'remove wave row');
    expect(codes(await intakeTeamReturn(missing.request, missing.dependencies))).toContain(
      'ROW_MISSING',
    );

    const duplicate = makeFixture();
    const duplicateWave = readJson(duplicate.wavePath);
    const rows = duplicateWave.rows as Array<Record<string, unknown>>;
    rows.push({ ...(rows[0] as Record<string, unknown>) });
    writeJson(duplicate.wavePath, duplicateWave);
    commitFixtureMutation(duplicate, 'duplicate wave row');
    expect(codes(await intakeTeamReturn(duplicate.request, duplicate.dependencies))).toContain(
      'ROW_DUPLICATE',
    );
  });

  it('rejects a stale declared row aggregate instead of trusting manifest summaries', async () => {
    const fixture = makeFixture();
    const wave = readJson(fixture.wavePath);
    wave.rowAggregateSha256 = '0'.repeat(64);
    writeJson(fixture.wavePath, wave);
    commitFixtureMutation(fixture, 'tamper row aggregate');

    const result = await intakeTeamReturn(fixture.request, fixture.dependencies);

    expect(codes(result)).toContain('WAVE_HANDOFF_INVALID');
  });

  it('accepts a signed fallback archive but rejects signed files outside its team root', async () => {
    const valid = makeFixture({ realGit: true });
    const validResult = await intakeTeamReturn(signedArchiveRequest(valid), {
      mechanicalValidate: async () => mechanicalPass,
    });
    expect(validResult.decision).toBe('ACCEPTED');
    expect(validResult.source.kind).toBe('SIGNED_ARCHIVE');

    const extra = makeFixture({ realGit: true });
    const extraResult = await intakeTeamReturn(
      signedArchiveRequest(extra, {
        extraFiles: [{ bytes: Buffer.from('shared'), path: 'shared.txt' }],
      }),
      { mechanicalValidate: async () => mechanicalPass },
    );
    expect(codes(extraResult)).toContain('ARCHIVE_INVALID');

    const noAncestry = makeFixture({ realGit: true });
    const noAncestryResult = await intakeTeamReturn(
      signedArchiveRequest(noAncestry, { includeAncestryProof: false }),
      {
        mechanicalValidate: async () => mechanicalPass,
      },
    );
    expect(codes(noAncestryResult)).toContain('ARCHIVE_SIGNATURE_INVALID');
  });

  it('rejects an archive signed by an arbitrary key instead of the fixed team signer', async () => {
    const fixture = makeFixture({ realGit: true });

    const result = await intakeTeamReturn(signedArchiveRequest(fixture, { trustedKey: 'OTHER' }), {
      mechanicalValidate: async () => mechanicalPass,
    });

    expect(result.decision).toBe('REJECTED');
    expect(codes(result)).toContain('ARCHIVE_SIGNATURE_INVALID');
  });

  it('fails closed with a precise code when the fixed team signer is missing', async () => {
    const fixture = makeFixture({ realGit: true });

    const result = await intakeTeamReturn(
      signedArchiveRequest(fixture, { trustedKey: 'MISSING' }),
      { mechanicalValidate: async () => mechanicalPass },
    );

    expect(codes(result)).toContain('TRUSTED_SIGNER_MISSING');
    expect(result.source.kind).toBe('SIGNED_ARCHIVE');
  });

  it('rejects a trusted signer store reached through an overridden symlink path', async () => {
    const fixture = makeFixture({ realGit: true });
    const request = signedArchiveRequest(fixture);
    const trustedStore = join(fixture.authorityRoot, 'authority/trusted-team-signers');
    const relocatedStore = join(fixture.root, 'relocated-trusted-signers');
    renameSync(trustedStore, relocatedStore);
    symlinkSync(relocatedStore, trustedStore, 'dir');

    const result = await intakeTeamReturn(request, {
      mechanicalValidate: async () => mechanicalPass,
    });

    expect(codes(result)).toContain('TRUSTED_SIGNER_INVALID');
  });

  it('rejects signed ancestry and changed-path claims not proved by real Git objects', async () => {
    const forgedHead = makeFixture({ realGit: true });
    const forgedHeadResult = await intakeTeamReturn(
      signedArchiveRequest(forgedHead, { signedHeadCommit: HEAD_COMMIT }),
      { mechanicalValidate: async () => mechanicalPass },
    );
    expect(codes(forgedHeadResult)).toContain('ANCESTRY_INVALID');

    const forgedPaths = makeFixture({ realGit: true });
    const forgedPathsResult = await intakeTeamReturn(
      signedArchiveRequest(forgedPaths, {
        signedChangedPaths: forgedPaths.evidence.changedPaths.slice(1),
      }),
      { mechanicalValidate: async () => mechanicalPass },
    );
    expect(codes(forgedPathsResult)).toContain('ANCESTRY_INVALID');
  });

  it.each([
    [
      'entry count',
      (archive: Buffer) => {
        const eocd = zipSignatureOffsets(archive, 0x06054b50).at(-1) ?? -1;
        archive.writeUInt16LE(0xffff, eocd + 8);
        archive.writeUInt16LE(0xffff, eocd + 10);
        return archive;
      },
    ],
    [
      'individual expanded size',
      (archive: Buffer) => {
        const central = zipSignatureOffsets(archive, 0x02014b50)[0] ?? -1;
        archive.writeUInt32LE(0xffffffff, central + 24);
        return archive;
      },
    ],
    [
      'compression ratio',
      (archive: Buffer) => {
        const central = zipSignatureOffsets(archive, 0x02014b50)[0] ?? -1;
        archive.writeUInt32LE(1, central + 20);
        archive.writeUInt32LE(10_000, central + 24);
        return archive;
      },
    ],
  ] as const)(
    'rejects archive %s limits from headers before extraction',
    async (_case, mutateArchive) => {
      const fixture = makeFixture({ realGit: true });

      const result = await intakeTeamReturn(signedArchiveRequest(fixture, { mutateArchive }), {
        mechanicalValidate: async () => mechanicalPass,
      });

      expect(codes(result)).toContain('ARCHIVE_RESOURCE_LIMIT_EXCEEDED');
    },
  );

  it('rejects archive byte size from stat before reading the payload', async () => {
    const fixture = makeFixture({ realGit: true });
    const request = signedArchiveRequest(fixture);
    if (request.source.kind !== 'SIGNED_ARCHIVE') throw new Error('fixture source kind');
    truncateSync(request.source.archivePath, 16 * 1024 * 1024 + 1);

    const result = await intakeTeamReturn(request, {
      mechanicalValidate: async () => mechanicalPass,
    });

    expect(codes(result)).toContain('ARCHIVE_RESOURCE_LIMIT_EXCEEDED');
  });

  it('descriptor-binds an archive through path replacement and growth without allocation', async () => {
    const fixture = makeFixture({ lessonCount: 1, realGit: true });
    const request = signedArchiveRequest(fixture);
    if (request.source.kind !== 'SIGNED_ARCHIVE') throw new Error('fixture source kind');
    const movedArchive = join(fixture.root, 'moved-return.zip');

    const pending = intakeTeamReturn(request, {
      mechanicalValidate: async () => mechanicalPass,
    });
    renameSync(request.source.archivePath, movedArchive);
    writeFileSync(request.source.archivePath, 'replacement');
    truncateSync(movedArchive, 16 * 1024 * 1024 + 1);
    const result = await pending;

    expect(codes(result)).toContain('ARCHIVE_RESOURCE_LIMIT_EXCEEDED');
  });

  it('bounds oversized attestation bytes before signer lookup', async () => {
    const fixture = makeFixture({ lessonCount: 1, realGit: true });
    const request = signedArchiveRequest(fixture, { trustedKey: 'MISSING' });
    if (request.source.kind !== 'SIGNED_ARCHIVE') throw new Error('fixture source kind');
    writeFileSync(request.source.attestationPath, ' '.repeat(64 * 1024 + 1), { flag: 'a' });

    const result = await intakeTeamReturn(request, {
      mechanicalValidate: async () => mechanicalPass,
    });

    expect(codes(result)).toContain('ARCHIVE_RESOURCE_LIMIT_EXCEEDED');
    expect(codes(result)).not.toContain('TRUSTED_SIGNER_MISSING');
  });

  it('rejects a symlinked attestation before signer lookup', async () => {
    const fixture = makeFixture({ lessonCount: 1, realGit: true });
    const request = signedArchiveRequest(fixture, { trustedKey: 'MISSING' });
    if (request.source.kind !== 'SIGNED_ARCHIVE') throw new Error('fixture source kind');
    const movedAttestation = join(fixture.root, 'moved-attestation.json');
    renameSync(request.source.attestationPath, movedAttestation);
    symlinkSync(movedAttestation, request.source.attestationPath);

    const result = await intakeTeamReturn(request, {
      mechanicalValidate: async () => mechanicalPass,
    });

    expect(codes(result)).toContain('ARCHIVE_INVALID');
    expect(codes(result)).not.toContain('TRUSTED_SIGNER_MISSING');
  });

  it('detects attestation growth while descriptor-bound intake is in flight', async () => {
    const fixture = makeFixture({ lessonCount: 1, realGit: true });
    const request = signedArchiveRequest(fixture);
    if (request.source.kind !== 'SIGNED_ARCHIVE') throw new Error('fixture source kind');

    const pending = intakeTeamReturn(request, {
      mechanicalValidate: async () => mechanicalPass,
    });
    truncateSync(request.source.attestationPath, 64 * 1024 + 1);
    const result = await pending;

    expect(codes(result)).toContain('ARCHIVE_RESOURCE_LIMIT_EXCEEDED');
  });

  it('removes exact owned archive work after a malformed late entry', async () => {
    const fixture = makeFixture({ realGit: true });
    const request = signedArchiveRequest(fixture, {
      mutateArchive: (archive) => {
        const centralEntries = zipSignatureOffsets(archive, 0x02014b50);
        const lastCentral = centralEntries.at(-1) ?? -1;
        archive.writeUInt32LE(0, lastCentral + 16);
        return archive;
      },
    });

    const result = await intakeTeamReturn(request, {
      mechanicalValidate: async () => mechanicalPass,
    });

    expect(codes(result)).toContain('ARCHIVE_INVALID');
    const workParent = join(
      fixture.centralRoot,
      '.tmp/scratch/lesson-factory-2026-08-03T1727-0500/wp-08/archive-work',
    );
    expect(existsSync(workParent) ? readdirSync(workParent) : []).toEqual([]);
  });

  it('rejects protected answer leakage on a public surface', async () => {
    const fixture = makeFixture({ protectedLeak: true });
    const result = await intakeTeamReturn(fixture.request, fixture.dependencies);

    expect(codes(result)).toContain('PROTECTED_BOUNDARY_LEAK');
    expect(JSON.stringify(result)).not.toContain('"correct_answer":"LEAK"');
  });

  it('rejects an author/judge identity collision even with current hashes', async () => {
    const fixture = makeFixture({ identityCollision: true });
    const result = await intakeTeamReturn(fixture.request, fixture.dependencies);

    expect(codes(result)).toContain('JUDGE_AUTHOR_IDENTITY_COLLISION');
  });

  it('rejects a false COMPLETE after a fresh central validator failure', async () => {
    const fixture = makeFixture();
    const result = await intakeTeamReturn(fixture.request, {
      ...fixture.dependencies,
      mechanicalValidate: async () => ({
        ...mechanicalPass,
        structural: 'FAIL',
        validatorEvidenceSha256: sha256('fresh central failure'),
      }),
    });

    expect(codes(result)).toContain('FALSE_COMPLETE');
  });

  it('runs the real central mechanical validator against a committed production lesson', () => {
    const lessonId = 'V3-LES-789208';

    const result = validateTeamReturnCandidateMechanically(
      join(REPOSITORY_ROOT, 'content/lessons/v3-les-789208'),
      lessonId,
      REPOSITORY_ROOT,
    );

    expect(result).toMatchObject({
      computedQuality: 'PASS',
      normalization: 'PASS',
      protectedBoundary: 'PASS',
      structural: 'PASS',
    });
    expect(result.validatorEvidenceSha256).toMatch(SHA);
  });

  it('leaves no partial batch when copying faults after validation', async () => {
    const fixture = makeFixture();
    let copies = 0;
    const result = await intakeTeamReturn(
      { ...fixture.request, mode: 'ACCEPT' },
      {
        ...fixture.dependencies,
        copyFile: async (source, destination) => {
          copies += 1;
          if (copies === 2) throw new Error('injected copy fault');
          await copyFile(source, destination);
        },
      },
    );

    const finalRoot = join(
      fixture.centralRoot,
      TEAM_RETURN_STAGING_RELATIVE_ROOT,
      fixture.team,
      'WAVE-01',
    );
    expect(codes(result)).toContain('ATOMIC_COPY_FAILED');
    expect(existsSync(finalRoot)).toBe(false);
  });

  it('ignores mutable checkout bytes changed after private snapshot capture', async () => {
    const fixture = makeFixture({ lessonCount: 1 });
    const lessonId = fixture.lessonIds[0] as string;
    const scriptPath = join(fixture.candidateRoot, lessonId, 'lesson-script.json');
    const originalScript = readFileSync(scriptPath);
    const finalRoot = join(
      fixture.centralRoot,
      TEAM_RETURN_STAGING_RELATIVE_ROOT,
      fixture.team,
      'WAVE-01',
    );
    let mutated = false;

    const result = await intakeTeamReturn(
      { ...fixture.request, mode: 'ACCEPT' },
      {
        ...fixture.dependencies,
        mechanicalValidate: async () => {
          if (!mutated) {
            mutated = true;
            writeFileSync(scriptPath, `${canonical({ drift: true })}\n`);
          }
          return mechanicalPass;
        },
      },
    );

    expect(result.decision, JSON.stringify(result.exceptions)).toBe('ACCEPTED');
    expect(sha256(readFileSync(join(finalRoot, 'lessons', lessonId, 'lesson-script.json')))).toBe(
      sha256(originalScript),
    );
  });

  it('validates and stages from a private snapshot after mutable review-path drift', async () => {
    const fixture = makeFixture({ lessonCount: 1, realGit: true });
    const lessonId = fixture.lessonIds[0] as string;
    const reviewPath = join(fixture.candidateRoot, lessonId, 'reviews/author-self-audit.json');
    const originalReview = readFileSync(reviewPath);
    const finalRoot = join(
      fixture.centralRoot,
      TEAM_RETURN_STAGING_RELATIVE_ROOT,
      fixture.team,
      'WAVE-01',
    );

    const result = await intakeTeamReturn(
      { ...fixture.request, mode: 'ACCEPT' },
      {
        inspectCheckout: async () => fixture.evidence,
        mechanicalValidate: async () => {
          writeFileSync(reviewPath, `${originalReview.toString('utf8')}\n`);
          return mechanicalPass;
        },
      },
    );

    expect(result.decision, JSON.stringify(result.exceptions)).toBe('ACCEPTED');
    expect(
      sha256(readFileSync(join(finalRoot, 'lessons', lessonId, 'reviews/author-self-audit.json'))),
    ).toBe(sha256(originalReview));
  });

  it('stages committed HEAD identities through a clean-endpoint change-copy-restore race', async () => {
    const fixture = makeFixture({ lessonCount: 1, realGit: true });
    const lessonId = fixture.lessonIds[0] as string;
    const handoffPath = join(fixture.candidateRoot, lessonId, 'LESSON-HANDOFF.json');
    const originalHandoff = readFileSync(handoffPath);
    const originalWave = readFileSync(fixture.wavePath);
    const clean = await intakeTeamReturn(fixture.request, fixture.dependencies);
    writeFileSync(handoffPath, `${originalHandoff.toString('utf8')}\n`);
    const wave = readJson(fixture.wavePath);
    const rows = wave.rows as Array<Record<string, unknown>>;
    rows[0] = {
      ...rows[0],
      lessonHandoffSha256: sha256(readFileSync(handoffPath)),
    };
    writeJson(fixture.wavePath, wave);
    let restored = false;

    const result = await intakeTeamReturn(
      { ...fixture.request, mode: 'ACCEPT' },
      {
        copyFile: async (source, destination) => {
          await copyFile(source, destination);
          if (!restored) {
            restored = true;
            writeFileSync(handoffPath, originalHandoff);
            writeFileSync(fixture.wavePath, originalWave);
          }
        },
        inspectCheckout: async () => fixture.evidence,
        mechanicalValidate: async () => mechanicalPass,
      },
    );
    const finalRoot = join(
      fixture.centralRoot,
      TEAM_RETURN_STAGING_RELATIVE_ROOT,
      fixture.team,
      'WAVE-01',
    );
    const stagedInventory = LESSON_FILES.map((path) =>
      fileIdentity(join(finalRoot, 'lessons', lessonId, path), `${lessonId}/${path}`),
    ).sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0));

    expect(result.decision, JSON.stringify(result.exceptions)).toBe('ACCEPTED');
    expect(result.aggregates.sourceBatchSha256).toBe(clean.aggregates.sourceBatchSha256);
    expect(result.aggregates.sourceBatchSha256).toBe(sha256(canonical(stagedInventory)));
    expect(sha256(readFileSync(join(finalRoot, 'lessons', lessonId, 'LESSON-HANDOFF.json')))).toBe(
      sha256(originalHandoff),
    );
    expect(git(fixture.checkoutRoot, ['status', '--porcelain'])).toBe('');
  });

  it('keeps DRY_RUN bound when a later validator mutates the checkout', async () => {
    const fixture = makeFixture({ lessonCount: 2 });
    let validations = 0;

    const result = await intakeTeamReturn(fixture.request, {
      ...fixture.dependencies,
      mechanicalValidate: async () => {
        validations += 1;
        if (validations === 2) {
          writeFileSync(
            join(fixture.candidateRoot, fixture.lessonIds[0] as string, 'lesson-script.json'),
            `${canonical({ lateDrift: true })}\n`,
          );
        }
        return mechanicalPass;
      },
    });

    expect(result.decision, JSON.stringify(result.exceptions)).toBe('ACCEPTED');
  });

  it('rejects checkout Git drift introduced while copying before atomic rename', async () => {
    const fixture = makeFixture({ lessonCount: 1, realGit: true });
    const finalRoot = join(
      fixture.centralRoot,
      TEAM_RETURN_STAGING_RELATIVE_ROOT,
      fixture.team,
      'WAVE-01',
    );
    let drifted = false;

    const result = await intakeTeamReturn(
      { ...fixture.request, mode: 'ACCEPT' },
      {
        ...fixture.dependencies,
        copyFile: async (source, destination) => {
          await copyFile(source, destination);
          if (!drifted) {
            drifted = true;
            writeFileSync(fixture.wavePath, `${readFileSync(fixture.wavePath, 'utf8')}\n`);
            commitAll(fixture.checkoutRoot, 'drift checkout during intake copy');
          }
        },
      },
    );

    expect(codes(result)).toContain('SOURCE_REPOSITORY_DRIFT');
    expect(existsSync(finalRoot)).toBe(false);
  });

  it('hardens the incoming tree before rename and leaves no owned residue on failure', async () => {
    const fixture = makeFixture();
    const finalRoot = join(
      fixture.centralRoot,
      TEAM_RETURN_STAGING_RELATIVE_ROOT,
      fixture.team,
      'WAVE-01',
    );
    let hardeningCalls = 0;

    const result = await intakeTeamReturn(
      { ...fixture.request, mode: 'ACCEPT' },
      {
        ...fixture.dependencies,
        chmodPath: (path, mode) => {
          hardeningCalls += 1;
          if (hardeningCalls === 2) throw new Error('injected hardening fault');
          chmodSync(path, mode);
        },
      },
    );

    expect(hardeningCalls).toBeGreaterThan(0);
    expect(codes(result)).toContain('ATOMIC_COPY_FAILED');
    expect(existsSync(finalRoot)).toBe(false);
    const teamStage = dirname(finalRoot);
    expect(
      existsSync(teamStage)
        ? readdirSync(teamStage).filter((name) => name.includes('.incoming-'))
        : [],
    ).toEqual([]);
  });

  it('accepts identical replay idempotently and refuses staged tampering', async () => {
    const fixture = makeFixture();
    const accepting = { ...fixture.request, mode: 'ACCEPT' } as const;
    const first = await intakeTeamReturn(accepting, fixture.dependencies);
    const second = await intakeTeamReturn(accepting, fixture.dependencies);

    expect(first.decision, JSON.stringify(first.exceptions)).toBe('ACCEPTED');
    expect(second.decision).toBe('ACCEPTED');
    expect(first.copy.disposition).toBe('STAGED_NEW');
    expect(second.copy.disposition).toBe('PRESENT_IDENTICAL');

    const stagedScript = join(
      fixture.centralRoot,
      TEAM_RETURN_STAGING_RELATIVE_ROOT,
      fixture.team,
      'WAVE-01/lessons',
      fixture.lessonIds[0] as string,
      'lesson-script.json',
    );
    chmodSync(stagedScript, 0o644);
    writeFileSync(stagedScript, '{"tampered":true}\n');
    const tampered = await intakeTeamReturn(accepting, fixture.dependencies);
    expect(codes(tampered)).toContain('STAGING_MISMATCH');
    expect(readFileSync(stagedScript, 'utf8')).toBe('{"tampered":true}\n');
  });

  it('refuses replay when only the staged intake receipt was tampered', async () => {
    const fixture = makeFixture();
    const accepting = { ...fixture.request, mode: 'ACCEPT' } as const;
    expect((await intakeTeamReturn(accepting, fixture.dependencies)).decision).toBe('ACCEPTED');
    const receiptPath = join(
      fixture.centralRoot,
      TEAM_RETURN_STAGING_RELATIVE_ROOT,
      fixture.team,
      'WAVE-01/INTAKE-RECEIPT.json',
    );
    chmodSync(receiptPath, 0o600);
    writeFileSync(receiptPath, '{}\n');

    const replay = await intakeTeamReturn(accepting, fixture.dependencies);

    expect(codes(replay)).toContain('STAGING_MISMATCH');
  });

  it('refuses replay when staged content has only permission-mode tampering', async () => {
    const fixture = makeFixture();
    const accepting = { ...fixture.request, mode: 'ACCEPT' } as const;
    expect((await intakeTeamReturn(accepting, fixture.dependencies)).decision).toBe('ACCEPTED');
    const stagedScript = join(
      fixture.centralRoot,
      TEAM_RETURN_STAGING_RELATIVE_ROOT,
      fixture.team,
      'WAVE-01/lessons',
      fixture.lessonIds[0] as string,
      'lesson-script.json',
    );
    const original = readFileSync(stagedScript);
    chmodSync(stagedScript, 0o600);

    const replay = await intakeTeamReturn(accepting, fixture.dependencies);

    expect(codes(replay)).toContain('STAGING_MISMATCH');
    expect(readFileSync(stagedScript)).toEqual(original);
  });

  it('refuses replay when a staged directory alone becomes writable', async () => {
    const fixture = makeFixture();
    const accepting = { ...fixture.request, mode: 'ACCEPT' } as const;
    expect((await intakeTeamReturn(accepting, fixture.dependencies)).decision).toBe('ACCEPTED');
    const stagedLesson = join(
      fixture.centralRoot,
      TEAM_RETURN_STAGING_RELATIVE_ROOT,
      fixture.team,
      'WAVE-01/lessons',
      fixture.lessonIds[0] as string,
    );
    chmodSync(stagedLesson, 0o700);

    const replay = await intakeTeamReturn(accepting, fixture.dependencies);

    expect(codes(replay)).toContain('STAGING_MISMATCH');
  });

  it('accepts a closed partial wave with an honest failure and copies COMPLETE only', async () => {
    const fixture = makeFixture({ statuses: ['COMPLETE', 'FAILED'] });
    const dryRun = await intakeTeamReturn(fixture.request, fixture.dependencies);

    expect(dryRun.decision).toBe('ACCEPTED');
    expect(dryRun.scope.kind).toBe('WAVE');
    expect(dryRun.rows.map((row) => row.code)).toEqual(['ACCEPTED_COMPLETE', 'RECORDED_FAILED']);
    expect(dryRun.copy.disposition).toBe('NOT_REQUESTED');
    expect(dryRun.receiptSha256).toMatch(SHA);
  });

  it('records structurally valid FAILED mechanical receipts without calling them invalid', async () => {
    const fixture = makeFixture({
      lessonCount: 1,
      mechanicalFailures: ['STRUCTURAL'],
      statuses: ['FAILED'],
    });

    const result = await intakeTeamReturn(fixture.request, fixture.dependencies);

    expect(codes(result)).not.toContain('VALIDATION_RECEIPT_INVALID');
    expect(result.decision, JSON.stringify(result.exceptions)).toBe('ACCEPTED');
    expect(result.rows[0]).toMatchObject({ code: 'RECORDED_FAILED', status: 'FAILED' });
  });

  it.each([
    ['COMPUTED_QUALITY', 'COMPUTED_QUALITY_FAILED'],
    ['NORMALIZATION', 'NORMALIZATION_FAILED'],
    ['PROTECTED_BOUNDARY', 'PROTECTED_BOUNDARY_FAILED'],
  ] as const)(
    'records an honest %s mechanical failure with exact blockers',
    async (failure, code) => {
      const fixture = makeFixture({
        lessonCount: 1,
        mechanicalFailures: [failure],
        statuses: ['BLOCKED'],
      });

      const result = await intakeTeamReturn(fixture.request, fixture.dependencies);

      expect(result.decision, JSON.stringify(result.exceptions)).toBe('ACCEPTED');
      const handoff = readJson(
        join(fixture.candidateRoot, fixture.lessonIds[0] as string, 'LESSON-HANDOFF.json'),
      );
      expect(handoff.unresolvedBlockerCodes).toContain(code);
    },
  );

  it('rejects laundering failed receipts into COMPLETE with an empty blocker list', async () => {
    const fixture = makeFixture({
      lessonCount: 1,
      mechanicalFailures: ['STRUCTURAL'],
      statuses: ['FAILED'],
    });
    rewriteLessonHandoff(fixture, (handoff) => {
      handoff.lifecycle = 'CANDIDATE_RUBRIC_SCREENED';
      handoff.requestedStatus = 'COMPLETE';
      handoff.status = 'COMPLETE';
      handoff.unresolvedBlockerCodes = [];
    });

    const result = await intakeTeamReturn(fixture.request, fixture.dependencies);

    expect(codes(result)).toContain('HONESTY_MISMATCH');
    expect(codes(result)).not.toContain('VALIDATION_RECEIPT_INVALID');
  });

  it('rejects a non-COMPLETE handoff whose blocker codes do not exactly match evidence', async () => {
    const fixture = makeFixture({
      lessonCount: 1,
      mechanicalFailures: ['STRUCTURAL'],
      statuses: ['BLOCKED'],
    });
    rewriteLessonHandoff(fixture, (handoff) => {
      handoff.unresolvedBlockerCodes = [
        ...(handoff.unresolvedBlockerCodes as string[]),
        'UNSUPPORTED_EXTRA_BLOCKER',
      ].sort();
    });

    const result = await intakeTeamReturn(fixture.request, fixture.dependencies);

    expect(codes(result)).toContain('HONESTY_MISMATCH');
  });

  it.each([
    ['FAILED', 'BLOCKED'],
    ['BLOCKED', 'FAILED'],
  ] as const)(
    'rejects %s status laundering through requestedStatus %s',
    async (status, requestedStatus) => {
      const fixture = makeFixture({
        lessonCount: 1,
        mechanicalFailures: ['STRUCTURAL'],
        statuses: [status],
      });
      rewriteLessonHandoff(fixture, (handoff) => {
        handoff.requestedStatus = requestedStatus;
      });

      const result = await intakeTeamReturn(fixture.request, fixture.dependencies);

      expect(codes(result)).toContain('HONESTY_MISMATCH');
    },
  );

  it('accepts a final team only when all 30 assigned outcomes are closed', async () => {
    const fixture = makeFixture({
      finalTeam: true,
      statuses: Array.from({ length: 30 }, (_, index) =>
        index === 29 ? ('BLOCKED' as const) : ('COMPLETE' as const),
      ),
    });
    const result = await intakeTeamReturn(fixture.request, fixture.dependencies);

    expect(result.decision).toBe('ACCEPTED');
    expect(result.scope).toMatchObject({ kind: 'FINAL_TEAM', rowCount: 30 });
    expect(result.aggregates.rowSha256).toMatch(SHA);
    expect(result.aggregates.rootSha256).toMatch(SHA);
    expect(result.exceptions).toEqual([]);
  }, 30_000);

  it('commits a content-addressed Team B acceptance marker without changing TEAM', async () => {
    const { authority, finalRoot, fixture, prior } = await prepareFinalTeamSupersession();
    const oldIdentity = filesystemIdentity(finalRoot);
    for (const lessonId of [
      'V3-LES-619870',
      'V3-LES-631070',
      'V3-LES-710436',
      'V3-LES-726940',
      'V3-LES-765609',
      'V3-LES-773665',
      'V3-LES-865559',
    ]) {
      expect(
        validateTeamReturnCandidateMechanically(
          join(fixture.candidateRoot, lessonId),
          lessonId,
          fixture.centralRoot,
        ),
      ).toMatchObject({
        computedQuality: 'PASS',
        normalization: 'PASS',
        protectedBoundary: 'PASS',
        structural: 'PASS',
        validatorEvidenceSha256: expect.stringMatching(SHA),
      });
    }
    const beforeProjection = filesystemIdentity(dirname(finalRoot));
    const projected = await intakeTeamReturn(
      { ...fixture.request, supersession: authority },
      fixture.dependencies,
    );

    expect(projected.decision, JSON.stringify(projected.exceptions)).toBe('ACCEPTED');
    expect(projected.copy.disposition).toBe('SUPERSESSION_READY');
    expect(projected.copy.acceptance).toMatchObject({
      archiveSha256: expect.stringMatching(SHA),
      generationId: expect.stringMatching(SHA),
      manifestSha256: expect.stringMatching(SHA),
      markerRelativePath: expect.stringMatching(/^TEAM\.acceptance-v1\/commits\/[0-9a-f]{64}$/),
      receiptSha256: expect.stringMatching(SHA),
      sourceCommit: fixture.evidence.headCommit,
      sourceTreeSha256: expect.stringMatching(SHA),
    });
    expect(projected.copy.acceptance?.marker).toBeUndefined();
    expect(filesystemIdentity(dirname(finalRoot))).toBe(beforeProjection);

    const accepted = await intakeTeamReturn(
      { ...fixture.request, mode: 'ACCEPT', supersession: authority },
      fixture.dependencies,
    );
    expect(accepted.decision, JSON.stringify(accepted.exceptions)).toBe('ACCEPTED');
    expect(accepted.copy.disposition).toBe('SUPERSESSION_COMMITTED');
    expect(accepted.copy.acceptance).toMatchObject({
      archiveSha256: projected.copy.acceptance?.archiveSha256,
      generationId: projected.copy.acceptance?.generationId,
      manifestSha256: projected.copy.acceptance?.manifestSha256,
      markerRelativePath: projected.copy.acceptance?.markerRelativePath,
      receiptSha256: projected.copy.acceptance?.receiptSha256,
      marker: {
        device: expect.any(Number),
        inode: expect.any(Number),
        mode: expect.any(Number),
        target: projected.copy.acceptance?.manifestSha256,
      },
      objects: {
        archive: {
          mode: 0o400,
          nlink: 1,
          relativePath: expect.stringMatching(
            /^TEAM\.acceptance-v1\/objects\/archive\/[0-9a-f]{64}\.object$/,
          ),
        },
        manifest: {
          mode: 0o400,
          nlink: 1,
          relativePath: expect.stringMatching(
            /^TEAM\.acceptance-v1\/objects\/manifest\/[0-9a-f]{64}\.object$/,
          ),
        },
        receipt: {
          mode: 0o400,
          nlink: 1,
          relativePath: expect.stringMatching(
            /^TEAM\.acceptance-v1\/objects\/receipt\/[0-9a-f]{64}\.object$/,
          ),
        },
      },
    });
    expect(filesystemIdentity(finalRoot)).toBe(oldIdentity);
    expectImmutableTreeModes(finalRoot);
    expect(recursiveFiles(join(finalRoot, 'lessons'))).toHaveLength(23 * LESSON_FILES.length);
    expect(existsSync(join(dirname(finalRoot), 'TEAM.supersessions'))).toBe(false);

    const acceptance = accepted.copy.acceptance;
    if (acceptance === undefined) throw new Error('acceptance handle missing');
    const markerPath = join(dirname(finalRoot), acceptance.markerRelativePath);
    expect(lstatSync(markerPath).isSymbolicLink()).toBe(true);
    expect(readlinkSync(markerPath)).toBe(acceptance.manifestSha256);
    for (const [kind, objectSha256] of [
      ['archive', acceptance.archiveSha256],
      ['manifest', acceptance.manifestSha256],
      ['receipt', acceptance.receiptSha256],
    ] as const) {
      const indexPath = join(
        dirname(finalRoot),
        'TEAM.acceptance-v1',
        'objects',
        kind,
        `${objectSha256}.index`,
      );
      const indexInfo = lstatSync(indexPath);
      expect(indexInfo.isFile()).toBe(true);
      expect(indexInfo.mode & 0o777).toBe(0o400);
      expect(readFileSync(indexPath, 'utf8')).toMatch(/^[0-9a-f]{64}\.object\n$/);
    }
    const manifestRoot = join(dirname(finalRoot), 'TEAM.acceptance-v1', 'objects', 'manifest');
    const manifestPath = readdirSync(manifestRoot)
      .map((name) => join(manifestRoot, name))
      .find((path) => sha256(readFileSync(path)) === acceptance.manifestSha256);
    if (manifestPath === undefined) throw new Error('manifest object missing');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, unknown>;
    expect(Object.keys(manifest).sort()).toEqual([
      'acceptanceReceipt',
      'action',
      'admissionAuthority',
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
    ]);
    expect(manifest.nonclaims).toEqual({
      humanApproved: false,
      officialRubricPass: false,
      publicationApproved: false,
    });
    expect(manifest.statusCounts).toEqual({ BLOCKED: 0, COMPLETE: 30, FAILED: 0 });
    expect(manifest.promotedAdmissions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          lessonId: expect.stringMatching(/^V3-LES-[0-9]{6}$/),
          mechanical: {
            computedQuality: 'PASS',
            normalization: 'PASS',
            protectedBoundary: 'PASS',
            structural: 'PASS',
            validatorEvidenceSha256: expect.stringMatching(SHA),
          },
          rowSha256: expect.stringMatching(SHA),
        }),
      ]),
    );
    expect(manifest.promotedAdmissions).toHaveLength(7);
    const sourceProof = manifest.sourceProof as {
      changedPathIdentities: Array<{ path: string }>;
      changedPaths: string[];
      priorCommit: string;
      waveTreeAggregateSha256: string;
      waveTreeIdentities: Array<{
        gitBlobSha1: string;
        gitMode: string;
        gitType: string;
        path: string;
        sha256: string;
        size: number;
      }>;
    };
    const reviewedChangedPaths = git(fixture.checkoutRoot, [
      'diff',
      '--name-only',
      String(prior.source.headCommit),
      String(accepted.source.headCommit),
      '--',
    ])
      .split('\n')
      .filter(Boolean)
      .sort();
    expect(sourceProof.changedPaths).toEqual(reviewedChangedPaths);
    expect(sourceProof.changedPathIdentities.map((identity) => identity.path)).toEqual(
      reviewedChangedPaths,
    );
    expect(sourceProof.priorCommit).toBe(prior.source.headCommit);
    const reviewedWavePaths = git(fixture.checkoutRoot, [
      'ls-tree',
      '-r',
      '--name-only',
      String(accepted.source.headCommit),
      '--',
      'content/lesson-candidates/team-B/waves/',
    ])
      .split('\n')
      .filter(Boolean)
      .sort();
    expect(sourceProof.waveTreeIdentities.map((identity) => identity.path)).toEqual(
      reviewedWavePaths,
    );
    expect(sourceProof.waveTreeIdentities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          gitBlobSha1: expect.stringMatching(/^[0-9a-f]{40}$/),
          gitMode: expect.stringMatching(/^100(644|755)$/),
          gitType: 'blob',
          path: expect.stringMatching(/^content\/lesson-candidates\/team-B\/waves\/[^/]+\.json$/),
          sha256: expect.stringMatching(SHA),
        }),
      ]),
    );
    expect(sourceProof.waveTreeAggregateSha256).toMatch(SHA);
    expect(reviewedChangedPaths).toContain('content/lesson-candidates/team-B/TEAM-HANDOFF.json');
    expect(reviewedChangedPaths.some((path) => path.includes('/team-B/waves/'))).toBe(true);
    expect(
      new Set(
        reviewedChangedPaths
          .map((path) => /^content\/lesson-candidates\/team-B\/(V3-LES-[0-9]{6})\//.exec(path)?.[1])
          .filter(Boolean),
      ).size,
    ).toBe(7);
    const archive = JSON.parse(
      readFileSync(acceptanceObjectPath(finalRoot, 'archive', acceptance.archiveSha256), 'utf8'),
    ) as { entries: Array<{ path: string }> };
    const archivePaths = archive.entries.map((entry) => entry.path);
    expect(archivePaths).toContain('TEAM-HANDOFF.json');
    expect(archivePaths.some((path) => path.startsWith('waves/'))).toBe(true);
    expect(archivePaths.filter((path) => path.startsWith('lessons/'))).toHaveLength(
      30 * LESSON_FILES.length,
    );
    expect(manifest.candidateRootClosure).toEqual({
      entryCount: archivePaths.length,
      inventorySha256: expect.stringMatching(SHA),
      pathSha256: expect.stringMatching(SHA),
    });
    expect(manifest.sourceProof).toMatchObject({
      changedPathAggregateSha256: expect.stringMatching(SHA),
      changedPathIdentities: expect.arrayContaining([
        expect.objectContaining({
          gitBlobSha1: expect.stringMatching(/^[0-9a-f]{40}$/),
          gitMode: expect.stringMatching(/^100(644|755)$/),
          path: expect.stringMatching(/^content\/lesson-candidates\/team-B\//),
          sha256: expect.stringMatching(SHA),
        }),
      ]),
    });
    expect(canonical(manifest)).not.toContain('publicationRuntime');
    expect(canonical(manifest)).not.toContain('/usr/bin/python3');
    expect(manifest).toMatchObject({
      generationId: acceptance.generationId,
      package: {
        assignmentIdSha256: accepted.assignmentIdSha256,
        source: accepted.source,
        sourceBatchSha256: accepted.aggregates.sourceBatchSha256,
        stagingIdentitySha256: accepted.copy.stagingIdentitySha256,
      },
      validation: {
        acceptedIntakeReceiptSha256: accepted.receiptSha256,
        dryRunIntakeReceiptSha256: expect.stringMatching(SHA),
      },
    });

    const replay = await intakeTeamReturn(
      { ...fixture.request, mode: 'ACCEPT', supersession: authority },
      fixture.dependencies,
    );
    expect(replay.decision, JSON.stringify(replay.exceptions)).toBe('ACCEPTED');
    expect(replay.copy.disposition).toBe('PRESENT_IDENTICAL');
    expect(replay.copy.acceptance?.manifestSha256).toBe(acceptance.manifestSha256);
    expect(filesystemIdentity(finalRoot)).toBe(oldIdentity);
  }, 240_000);

  it('rejects a self-consistent alternate ancestor instead of the staged predecessor commit', async () => {
    const { authority, finalRoot, fixture, prior } = await prepareFinalTeamSupersession();
    const oldIdentity = filesystemIdentity(finalRoot);
    const alternatePrior = installEquivalentAlternatePrior(
      fixture,
      String(prior.source.headCommit),
    );
    const replacementHead = git(fixture.checkoutRoot, ['rev-parse', 'HEAD']);
    expect(alternatePrior).not.toBe(prior.source.headCommit);
    expect(
      git(fixture.checkoutRoot, [
        'diff',
        '--name-only',
        String(prior.source.headCommit),
        replacementHead,
        '--',
      ]),
    ).toBe(
      git(fixture.checkoutRoot, ['diff', '--name-only', alternatePrior, replacementHead, '--']),
    );
    const accepted = await intakeTeamReturn(
      { ...fixture.request, mode: 'ACCEPT', supersession: authority },
      fixture.dependencies,
    );
    expect(accepted.decision, JSON.stringify(accepted.exceptions)).toBe('ACCEPTED');
    const forgedHandle = forgeAcceptanceHandle(finalRoot, accepted, 'ALTERNATE_PRIOR_RANGE', {
      alternatePriorCommit: alternatePrior,
    });

    expect(() =>
      loadTeamReturnAcceptanceArtifact({
        authorityRoot: fixture.request.authorityRoot,
        centralRepositoryRoot: fixture.request.centralRepositoryRoot,
        reviewedCheckoutRoot: fixture.checkoutRoot,
        handle: forgedHandle,
        scopeId: 'TEAM',
        teamId: 'team-B',
      }),
    ).toThrow();
    expect(filesystemIdentity(finalRoot)).toBe(oldIdentity);
  }, 240_000);

  it('rejects an artifact whose replacement commit is not the reviewed package HEAD', async () => {
    const { authority, finalRoot, fixture } = await prepareFinalTeamSupersession();
    const oldIdentity = filesystemIdentity(finalRoot);
    const accepted = await intakeTeamReturn(
      { ...fixture.request, mode: 'ACCEPT', supersession: authority },
      fixture.dependencies,
    );
    expect(accepted.decision, JSON.stringify(accepted.exceptions)).toBe('ACCEPTED');
    const replacementHead = installEquivalentReplacementHead(fixture);
    expect(replacementHead).not.toBe(accepted.source.headCommit);
    const handle = accepted.copy.acceptance;
    if (handle === undefined) throw new Error('acceptance handle missing');

    expect(() =>
      loadTeamReturnAcceptanceArtifact({
        authorityRoot: fixture.request.authorityRoot,
        centralRepositoryRoot: fixture.request.centralRepositoryRoot,
        reviewedCheckoutRoot: fixture.checkoutRoot,
        handle,
        scopeId: 'TEAM',
        teamId: 'team-B',
      }),
    ).toThrow();
    expect(filesystemIdentity(finalRoot)).toBe(oldIdentity);
  }, 240_000);

  it.each([
    { label: 'an empty tree', variant: 'EMPTY_TREE' },
    { label: 'a nested nonempty tree', variant: 'NESTED_TREE' },
    { label: 'a submodule', variant: 'SUBMODULE' },
  ] as const)(
    'rejects $label entry below the trusted WAVE prefix',
    async ({ variant }) => {
      const { authority, finalRoot, fixture, prior } = await prepareFinalTeamSupersession();
      const oldIdentity = filesystemIdentity(finalRoot);
      const originalReplacementCommit = git(fixture.checkoutRoot, ['rev-parse', 'HEAD']);
      const { marker, replacementCommit } = installNonregularWaveTreeHead(fixture, variant);
      if (variant === 'EMPTY_TREE') {
        expect(
          git(fixture.checkoutRoot, [
            'diff',
            '--name-only',
            String(prior.source.headCommit),
            replacementCommit,
            '--',
          ]),
        ).toBe(
          git(fixture.checkoutRoot, [
            'diff',
            '--name-only',
            String(prior.source.headCommit),
            originalReplacementCommit,
            '--',
          ]),
        );
      }
      expect(
        git(fixture.checkoutRoot, [
          'ls-tree',
          '-r',
          '-t',
          replacementCommit,
          '--',
          'content/lesson-candidates/team-B/waves/',
        ]),
      ).toContain(`waves/${marker}`);
      if (variant === 'EMPTY_TREE') {
        expect(
          git(fixture.checkoutRoot, [
            'ls-tree',
            '-r',
            replacementCommit,
            '--',
            'content/lesson-candidates/team-B/waves/',
          ]),
        ).not.toContain(`waves/${marker}`);
      }
      const result = await intakeTeamReturn(
        { ...fixture.request, mode: 'ACCEPT', supersession: authority },
        fixture.dependencies,
      );

      expect(result.decision).toBe('REJECTED');
      expect(filesystemIdentity(finalRoot)).toBe(oldIdentity);
    },
    240_000,
  );

  it('rejects a nonregular WAVE entry in the trusted replacement Git tree', async () => {
    const { authority, finalRoot, fixture } = await prepareFinalTeamSupersession();
    const oldIdentity = filesystemIdentity(finalRoot);
    unlinkSync(fixture.wavePath);
    symlinkSync('../TEAM-HANDOFF.json', fixture.wavePath);
    commitFixtureMutation(fixture, 'replace trusted wave with symlink');

    const result = await intakeTeamReturn(
      { ...fixture.request, mode: 'ACCEPT', supersession: authority },
      fixture.dependencies,
    );

    expect(result.decision).toBe('REJECTED');
    expect(filesystemIdentity(finalRoot)).toBe(oldIdentity);
  }, 240_000);

  it.each([
    'EXTRA_SCHEMA',
    'EXTRA_ARCHIVE_FILE',
    'AUTHORITY_NESTED_EXTRA',
    'FORGED_MECHANICAL_PASS',
    'HANDOFF_NONCLAIM',
    'MALFORMED_MANIFEST',
    'OMIT_CONTROL_HANDOFFS',
    'PRIOR_RECEIPT_MISMATCH',
    'PROMOTED_CHECKER',
    'PROVENANCE',
    'ROW_ORDER',
    'SETS',
    'SOURCE_BLOB_IDENTITY',
    'SOURCE_EXTRA',
    'SOURCE_PATH_TRAVERSAL',
    'SOURCE_SHORTENED',
    'WAVE_BLOB',
    'WAVE_EXTRA',
    'WAVE_MODE',
    'WAVE_NONREGULAR_CLAIM',
    'WAVE_OMITTED',
    'WRONG_ASSIGNMENT_AUTHORITY',
    'WRONG_KIT_AUTHORITY',
    'WRONG_TOOL_AUTHORITY',
  ] as const)(
    'rejects a fully rehashed acceptance artifact with forged %s semantics',
    async (forgeryKind) => {
      const { authority, finalRoot, fixture } = await prepareFinalTeamSupersession();
      const oldIdentity = filesystemIdentity(finalRoot);
      const accepted = await intakeTeamReturn(
        { ...fixture.request, mode: 'ACCEPT', supersession: authority },
        fixture.dependencies,
      );
      const forgedHandle = forgeAcceptanceHandle(finalRoot, accepted, forgeryKind);

      expect(() =>
        loadTeamReturnAcceptanceArtifact({
          authorityRoot: fixture.request.authorityRoot,
          centralRepositoryRoot: fixture.request.centralRepositoryRoot,
          reviewedCheckoutRoot: fixture.checkoutRoot,
          handle: forgedHandle,
          scopeId: 'TEAM',
          teamId: 'team-B',
        }),
      ).toThrow();
      expect(filesystemIdentity(finalRoot)).toBe(oldIdentity);
    },
    240_000,
  );

  it('rejects pathname substitution while validating a newly written object handle', async () => {
    const { authority, finalRoot, fixture } = await prepareFinalTeamSupersession();
    const oldIdentity = filesystemIdentity(finalRoot);
    let substituted = false;
    const result = await intakeTeamReturn(
      { ...fixture.request, mode: 'ACCEPT', supersession: authority },
      {
        ...fixture.dependencies,
        onBeforeAcceptanceObjectValidation: (kind: string, path: string) => {
          if (substituted || kind !== 'archive') return;
          substituted = true;
          renameSync(path, `${path}.moved`);
          writeFileSync(path, 'attacker replacement\n', { mode: 0o400 });
        },
      } as TeamReturnIntakeDependencies & {
        onBeforeAcceptanceObjectValidation: (kind: string, path: string) => void;
      },
    );

    expect(substituted).toBe(true);
    expect(result.decision).toBe('REJECTED');
    expect(filesystemIdentity(finalRoot)).toBe(oldIdentity);
  }, 240_000);

  it.each(['FILE', 'DIRECTORY', 'SYMLINK'] as const)(
    'preserves and refuses an occupied acceptance marker %s',
    async (kind) => {
      const { authority, finalRoot, fixture } = await prepareFinalTeamSupersession();
      const oldIdentity = filesystemIdentity(finalRoot);
      const projected = await intakeTeamReturn(
        { ...fixture.request, supersession: authority },
        fixture.dependencies,
      );
      const markerRelativePath = projected.copy.acceptance?.markerRelativePath;
      if (markerRelativePath === undefined) throw new Error('projected marker missing');
      const markerPath = join(dirname(finalRoot), markerRelativePath);
      mkdirSync(dirname(markerPath), { recursive: true, mode: 0o700 });
      if (kind === 'FILE') writeFileSync(markerPath, 'occupied\n');
      else if (kind === 'DIRECTORY') mkdirSync(markerPath);
      else symlinkSync('0'.repeat(64), markerPath);
      const before = lstatSync(markerPath);

      const result = await intakeTeamReturn(
        { ...fixture.request, mode: 'ACCEPT', supersession: authority },
        fixture.dependencies,
      );

      expect(result.decision).toBe('REJECTED');
      expect(lstatSync(markerPath).ino).toBe(before.ino);
      expect(filesystemIdentity(finalRoot)).toBe(oldIdentity);
    },
    180_000,
  );

  it('allows one identical concurrent marker winner and rejects a conflicting fork', async () => {
    const prepared = await prepareFinalTeamSupersession();
    const oldIdentity = filesystemIdentity(prepared.finalRoot);
    const [first, second] = await Promise.all([
      intakeTeamReturn(
        {
          ...prepared.fixture.request,
          mode: 'ACCEPT',
          supersession: prepared.authority,
        },
        prepared.fixture.dependencies,
      ),
      intakeTeamReturn(
        {
          ...prepared.fixture.request,
          mode: 'ACCEPT',
          supersession: prepared.authority,
        },
        prepared.fixture.dependencies,
      ),
    ]);
    expect(first.decision).toBe('ACCEPTED');
    expect(second.decision).toBe('ACCEPTED');
    expect(first.copy.acceptance?.manifestSha256).toBe(second.copy.acceptance?.manifestSha256);
    expect(filesystemIdentity(prepared.finalRoot)).toBe(oldIdentity);

    const conflictRoot = join(prepared.fixture.root, 'checkout-conflict');
    cpSync(prepared.fixture.checkoutRoot, conflictRoot, { recursive: true });
    const conflicting: Fixture = {
      ...prepared.fixture,
      candidateRoot: join(
        conflictRoot,
        relative(prepared.fixture.checkoutRoot, prepared.fixture.candidateRoot),
      ),
      checkoutRoot: conflictRoot,
      request: {
        ...prepared.fixture.request,
        source: { kind: 'CHECKOUT', root: conflictRoot },
      },
    };
    rewriteFinalTeamLessons(conflicting, [
      { contentVariant: 'conflicting-promoted-content', index: 29, status: 'COMPLETE' },
    ]);
    const conflict = await intakeTeamReturn(
      { ...conflicting.request, mode: 'ACCEPT', supersession: prepared.authority },
      conflicting.dependencies,
    );
    expect(conflict.decision).toBe('REJECTED');
    expect(filesystemIdentity(prepared.finalRoot)).toBe(oldIdentity);
    expect(
      readdirSync(join(dirname(prepared.finalRoot), 'TEAM.acceptance-v1', 'commits')),
    ).toHaveLength(1);
  }, 300_000);

  it.each(['archive', 'manifest', 'receipt'] as const)(
    'rejects replay when a content-addressed %s object drifts',
    async (kind) => {
      const { authority, finalRoot, fixture } = await prepareFinalTeamSupersession();
      const oldIdentity = filesystemIdentity(finalRoot);
      const accepted = await intakeTeamReturn(
        { ...fixture.request, mode: 'ACCEPT', supersession: authority },
        fixture.dependencies,
      );
      const expectedSha256 =
        kind === 'archive'
          ? accepted.copy.acceptance?.archiveSha256
          : kind === 'manifest'
            ? accepted.copy.acceptance?.manifestSha256
            : accepted.copy.acceptance?.receiptSha256;
      if (expectedSha256 === undefined) throw new Error(`${kind} hash missing`);
      const objectRoot = join(dirname(finalRoot), 'TEAM.acceptance-v1', 'objects', kind);
      const objectPath = readdirSync(objectRoot)
        .map((name) => join(objectRoot, name))
        .find((path) => sha256(readFileSync(path)) === expectedSha256);
      if (objectPath === undefined) throw new Error(`${kind} object missing`);
      chmodSync(objectPath, 0o600);
      writeFileSync(objectPath, 'tampered\n');
      chmodSync(objectPath, 0o400);

      const replay = await intakeTeamReturn(
        { ...fixture.request, mode: 'ACCEPT', supersession: authority },
        fixture.dependencies,
      );
      expect(replay.decision).toBe('REJECTED');
      expect(filesystemIdentity(finalRoot)).toBe(oldIdentity);
    },
    240_000,
  );

  it.each(['OVERSIZED', 'SPARSE'] as const)(
    'rejects a referenced %s archive before allocating its declared bytes',
    async (variant) => {
      const { authority, finalRoot, fixture } = await prepareFinalTeamSupersession();
      const oldIdentity = filesystemIdentity(finalRoot);
      const accepted = await intakeTeamReturn(
        { ...fixture.request, mode: 'ACCEPT', supersession: authority },
        fixture.dependencies,
      );
      const acceptance = accepted.copy.acceptance;
      if (acceptance?.objects === undefined) throw new Error('acceptance objects missing');
      const archivePath = join(dirname(finalRoot), acceptance.objects.archive.relativePath);
      chmodSync(archivePath, 0o600);
      truncateSync(
        archivePath,
        variant === 'OVERSIZED'
          ? MAX_ACCEPTANCE_ARCHIVE_BYTES + 1
          : MAX_ACCEPTANCE_ARCHIVE_BYTES - 1,
      );
      chmodSync(archivePath, 0o400);

      expect(() =>
        loadTeamReturnAcceptanceArtifact({
          authorityRoot: fixture.request.authorityRoot,
          centralRepositoryRoot: fixture.request.centralRepositoryRoot,
          reviewedCheckoutRoot: fixture.checkoutRoot,
          handle: acceptance,
          scopeId: 'TEAM',
          teamId: 'team-B',
        }),
      ).toThrow();
      expect(filesystemIdentity(finalRoot)).toBe(oldIdentity);
    },
    240_000,
  );

  it('ignores unreferenced crash objects without scanning their bytes', async () => {
    const { authority, finalRoot, fixture } = await prepareFinalTeamSupersession();
    const oldIdentity = filesystemIdentity(finalRoot);
    const accepted = await intakeTeamReturn(
      { ...fixture.request, mode: 'ACCEPT', supersession: authority },
      fixture.dependencies,
    );
    const acceptance = accepted.copy.acceptance;
    if (acceptance === undefined) throw new Error('acceptance handle missing');
    const archiveRoot = join(dirname(finalRoot), 'TEAM.acceptance-v1', 'objects', 'archive');
    for (let index = 0; index < 64; index += 1) {
      const path = join(archiveRoot, `${String(index).padStart(64, '0')}.object`);
      writeFileSync(path, 'orphan\n', { mode: 0o400 });
    }

    const loaded = loadTeamReturnAcceptanceArtifact({
      authorityRoot: fixture.request.authorityRoot,
      centralRepositoryRoot: fixture.request.centralRepositoryRoot,
      reviewedCheckoutRoot: fixture.checkoutRoot,
      handle: acceptance,
      scopeId: 'TEAM',
      teamId: 'team-B',
    });
    expect(loaded.intakeReceipt.receiptSha256).toBe(accepted.receiptSha256);
    expect(filesystemIdentity(finalRoot)).toBe(oldIdentity);
    removeFixtureRoot(loaded.extractedRoot);
  }, 240_000);

  it('rejects manifest-declared object sizes above the aggregate byte bound', async () => {
    const { authority, finalRoot, fixture } = await prepareFinalTeamSupersession();
    const oldIdentity = filesystemIdentity(finalRoot);
    const accepted = await intakeTeamReturn(
      { ...fixture.request, mode: 'ACCEPT', supersession: authority },
      fixture.dependencies,
    );
    const acceptance = accepted.copy.acceptance;
    if (acceptance?.objects === undefined) throw new Error('acceptance objects missing');
    const manifest = JSON.parse(
      readFileSync(join(dirname(finalRoot), acceptance.objects.manifest.relativePath), 'utf8'),
    ) as Record<string, unknown>;
    const archive = manifest.archive as Record<string, unknown>;
    archive.size = MAX_ACCEPTANCE_AGGREGATE_BYTES;
    const bytes = Buffer.from(`${canonical(manifest)}\n`);
    const manifestSha256 = writeForgedObject(finalRoot, 'manifest', bytes);
    const markerPath = join(dirname(finalRoot), acceptance.markerRelativePath);
    unlinkSync(markerPath);
    symlinkSync(manifestSha256, markerPath);
    const markerInfo = lstatSync(markerPath);
    const forgedHandle = {
      ...acceptance,
      manifestSha256,
      marker: {
        device: markerInfo.dev,
        inode: markerInfo.ino,
        mode: markerInfo.mode & 0o777,
        target: manifestSha256,
      },
      objects: {
        ...acceptance.objects,
        manifest: forgedObjectIdentity(finalRoot, 'manifest', manifestSha256),
      },
    };

    expect(() =>
      loadTeamReturnAcceptanceArtifact({
        authorityRoot: fixture.request.authorityRoot,
        centralRepositoryRoot: fixture.request.centralRepositoryRoot,
        reviewedCheckoutRoot: fixture.checkoutRoot,
        handle: forgedHandle,
        scopeId: 'TEAM',
        teamId: 'team-B',
      }),
    ).toThrow();
    expect(filesystemIdentity(finalRoot)).toBe(oldIdentity);
  }, 240_000);

  it('rejects an acceptance store above the closed marker bound', async () => {
    const { authority, finalRoot, fixture } = await prepareFinalTeamSupersession();
    const oldIdentity = filesystemIdentity(finalRoot);
    const accepted = await intakeTeamReturn(
      { ...fixture.request, mode: 'ACCEPT', supersession: authority },
      fixture.dependencies,
    );
    const acceptance = accepted.copy.acceptance;
    if (acceptance === undefined) throw new Error('acceptance handle missing');
    const commitsRoot = join(dirname(finalRoot), 'TEAM.acceptance-v1', 'commits');
    for (let index = 0; index < MAX_ACCEPTANCE_MARKERS; index += 1) {
      const name = sha256(`bounded-marker-${index}`);
      symlinkSync(acceptance.manifestSha256, join(commitsRoot, name));
    }

    expect(() =>
      loadTeamReturnAcceptanceArtifact({
        authorityRoot: fixture.request.authorityRoot,
        centralRepositoryRoot: fixture.request.centralRepositoryRoot,
        reviewedCheckoutRoot: fixture.checkoutRoot,
        handle: acceptance,
        scopeId: 'TEAM',
        teamId: 'team-B',
      }),
    ).toThrow();
    expect(filesystemIdentity(finalRoot)).toBe(oldIdentity);
  }, 240_000);

  it('streams marker enumeration and stops after MAX plus one entries', async () => {
    const root = join(FIXTURE_ROOT, 'bounded-marker-stream');
    rmSync(root, { force: true, recursive: true });
    mkdirSync(root, { recursive: true, mode: 0o700 });
    try {
      for (let index = 0; index < 4096; index += 1) {
        symlinkSync('0'.repeat(64), join(root, sha256(`stream-marker-${index}`)));
      }
      const module = (await import('./team-return-intake')) as unknown as {
        readBoundedAcceptanceMarkerNames?: (
          root: string,
          onEntry?: (name: string) => void,
        ) => readonly string[] | null;
      };
      expect(module.readBoundedAcceptanceMarkerNames).toBeTypeOf('function');
      let visited = 0;
      const names = module.readBoundedAcceptanceMarkerNames?.(root, () => {
        visited += 1;
      });
      expect(names).toBeNull();
      expect(visited).toBe(MAX_ACCEPTANCE_MARKERS + 1);
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it('treats a parent-alias marker as non-authoritative and leaves TEAM untouched', async () => {
    const { authority, finalRoot, fixture } = await prepareFinalTeamSupersession();
    const oldIdentity = filesystemIdentity(finalRoot);
    let replaced = false;
    const result = await intakeTeamReturn(
      { ...fixture.request, mode: 'ACCEPT', supersession: authority },
      {
        ...fixture.dependencies,
        onBeforeSupersessionPublish: (markerPath) => {
          if (replaced) return;
          replaced = true;
          const storeRoot = join(dirname(finalRoot), 'TEAM.acceptance-v1');
          renameSync(storeRoot, `${storeRoot}.trusted-orphan`);
          mkdirSync(dirname(markerPath), { recursive: true, mode: 0o700 });
        },
      },
    );

    expect(replaced).toBe(true);
    expect(result.decision).toBe('REJECTED');
    expect(filesystemIdentity(finalRoot)).toBe(oldIdentity);
    expectImmutableTreeModes(finalRoot);
  }, 240_000);

  it.each([
    'ARCHIVE_OBJECT_WRITE',
    'ARCHIVE_OBJECT_FSYNC',
    'ARCHIVE_OBJECT_INDEX_CREATE',
    'ARCHIVE_OBJECT_INDEX_FSYNC',
    'RECEIPT_OBJECT_WRITE',
    'RECEIPT_OBJECT_FSYNC',
    'RECEIPT_OBJECT_INDEX_CREATE',
    'RECEIPT_OBJECT_INDEX_FSYNC',
    'MANIFEST_OBJECT_WRITE',
    'MANIFEST_OBJECT_FSYNC',
    'MANIFEST_OBJECT_INDEX_CREATE',
    'MANIFEST_OBJECT_INDEX_FSYNC',
    'PRE_MARKER_CREATE',
    'POST_MARKER_CREATE',
    'MARKER_PARENT_FSYNC',
  ] as const)(
    'recovers after SIGKILL at acceptance boundary %s without changing TEAM',
    async (boundary) => {
      const prepared = await prepareFinalTeamSupersession();
      const oldIdentity = filesystemIdentity(prepared.finalRoot);
      const child = await spawnPausedAcceptancePublication(prepared, boundary);
      await killPausedAcceptanceChild(child);

      expect(filesystemIdentity(prepared.finalRoot)).toBe(oldIdentity);
      const recovered = await intakeTeamReturn(
        {
          ...prepared.fixture.request,
          mode: 'ACCEPT',
          supersession: prepared.authority,
        },
        prepared.fixture.dependencies,
      );
      expect(recovered.decision, JSON.stringify(recovered.exceptions)).toBe('ACCEPTED');
      expect(['SUPERSESSION_COMMITTED', 'PRESENT_IDENTICAL']).toContain(recovered.copy.disposition);
      const acceptance = recovered.copy.acceptance;
      if (acceptance === undefined) throw new Error('recovered acceptance missing');
      const markerPath = join(dirname(prepared.finalRoot), acceptance.markerRelativePath);
      expect(lstatSync(markerPath).isSymbolicLink()).toBe(true);
      expect(readlinkSync(markerPath)).toBe(acceptance.manifestSha256);
      expect(filesystemIdentity(prepared.finalRoot)).toBe(oldIdentity);
      expectImmutableTreeModes(prepared.finalRoot);
    },
    300_000,
  );

  it('requires the fixed marker handle and safely extracts all 30 accepted lessons', async () => {
    const { authority, finalRoot, fixture } = await prepareFinalTeamSupersession();
    const oldIdentity = filesystemIdentity(finalRoot);
    const accepted = await intakeTeamReturn(
      { ...fixture.request, mode: 'ACCEPT', supersession: authority },
      fixture.dependencies,
    );
    if (accepted.copy.acceptance === undefined) throw new Error('acceptance handle missing');
    const loaded = loadTeamReturnAcceptanceArtifact({
      authorityRoot: fixture.request.authorityRoot,
      centralRepositoryRoot: fixture.request.centralRepositoryRoot,
      reviewedCheckoutRoot: fixture.checkoutRoot,
      handle: accepted.copy.acceptance,
      scopeId: 'TEAM',
      teamId: 'team-B',
    });
    fixtureRoots.add(loaded.extractedRoot);
    expect(recursiveFiles(join(loaded.extractedRoot, 'lessons'))).toHaveLength(
      30 * LESSON_FILES.length,
    );
    expectImmutableTreeModes(loaded.extractedRoot);
    expect(filesystemIdentity(finalRoot)).toBe(oldIdentity);

    const aliasedHandle = {
      ...accepted.copy.acceptance,
      markerRelativePath: `TEAM.acceptance-v1/aliases/${accepted.copy.acceptance?.generationId}`,
    };
    expect(() =>
      loadTeamReturnAcceptanceArtifact({
        authorityRoot: fixture.request.authorityRoot,
        centralRepositoryRoot: fixture.request.centralRepositoryRoot,
        reviewedCheckoutRoot: fixture.checkoutRoot,
        handle: aliasedHandle as NonNullable<typeof accepted.copy.acceptance>,
        scopeId: 'TEAM',
        teamId: 'team-B',
      }),
    ).toThrow();
  }, 240_000);

  it('rejects FINAL_TEAM supersession for wrong prior identities and same-batch abuse', async () => {
    const sameBatch = makeFixture({
      finalTeam: true,
      statuses: Array.from({ length: 30 }, (_, index) =>
        index < 23 ? ('COMPLETE' as const) : ('BLOCKED' as const),
      ),
      team: 'team-B',
    });
    const prior = await intakeTeamReturn(
      { ...sameBatch.request, mode: 'ACCEPT' },
      sameBatch.dependencies,
    );
    const sameBatchResult = await intakeTeamReturn(
      {
        ...sameBatch.request,
        mode: 'ACCEPT',
        supersession: supersessionAuthority(prior),
      },
      sameBatch.dependencies,
    );
    expect(sameBatchResult.decision).toBe('REJECTED');
    expect(codes(sameBatchResult)).toContain('SUPERSESSION_AUTHORITY_INVALID');

    rewriteFinalTeamLessons(
      sameBatch,
      Array.from({ length: 7 }, (_, offset) => ({
        index: 23 + offset,
        status: 'COMPLETE' as const,
      })),
    );
    for (const supersession of [
      {
        ...supersessionAuthority(prior),
        expectedPriorSourceBatchSha256: '0'.repeat(64),
      },
      {
        ...supersessionAuthority(prior),
        expectedPriorStagingIdentitySha256: '0'.repeat(64),
      },
    ]) {
      const result = await intakeTeamReturn(
        { ...sameBatch.request, supersession },
        sameBatch.dependencies,
      );
      expect(result.decision).toBe('REJECTED');
      expect(codes(result)).toContain('SUPERSESSION_AUTHORITY_INVALID');
    }
  }, 120_000);

  it('rejects supersession authority for WAVE scope even when its digests are well formed', async () => {
    const fixture = makeFixture({ lessonCount: 2, team: 'team-B' });
    const result = await intakeTeamReturn(
      {
        ...fixture.request,
        supersession: {
          action: 'SUPERSEDE_FINAL_TEAM',
          expectedPriorSourceBatchSha256: '1'.repeat(64),
          expectedPriorStagingIdentitySha256: '2'.repeat(64),
        },
      },
      fixture.dependencies,
    );

    expect(result.decision).toBe('REJECTED');
    expect(codes(result)).toContain('SUPERSESSION_AUTHORITY_INVALID');
    expect(result.copy.disposition).not.toBe('SUPERSESSION_READY');
  });

  it('recomputes the prior receipt, full tree, and modes before projecting supersession', async () => {
    const { authority, finalRoot, fixture } = await prepareFinalTeamSupersession();
    const receiptPath = join(finalRoot, 'INTAKE-RECEIPT.json');
    const receiptBytes = readFileSync(receiptPath);
    chmodSync(receiptPath, 0o600);
    writeFileSync(receiptPath, '{}\n');
    chmodSync(receiptPath, 0o400);

    const forgedReceipt = await intakeTeamReturn(
      { ...fixture.request, supersession: authority },
      fixture.dependencies,
    );
    expect(forgedReceipt.decision).toBe('REJECTED');
    expect(codes(forgedReceipt)).toContain('SUPERSESSION_PRIOR_INVALID');

    chmodSync(receiptPath, 0o600);
    writeFileSync(receiptPath, receiptBytes);
    chmodSync(receiptPath, 0o400);
    const stagedScript = join(
      finalRoot,
      'lessons',
      fixture.lessonIds[0] as string,
      'lesson-script.json',
    );
    const scriptBytes = readFileSync(stagedScript);
    chmodSync(stagedScript, 0o600);
    writeFileSync(stagedScript, '{"tampered":true}\n');
    chmodSync(stagedScript, 0o400);

    const tamperedTree = await intakeTeamReturn(
      { ...fixture.request, supersession: authority },
      fixture.dependencies,
    );
    expect(tamperedTree.decision).toBe('REJECTED');
    expect(codes(tamperedTree)).toContain('SUPERSESSION_PRIOR_INVALID');

    chmodSync(stagedScript, 0o600);
    writeFileSync(stagedScript, scriptBytes);
    chmodSync(stagedScript, 0o400);
    chmodSync(join(finalRoot, 'lessons', fixture.lessonIds[0] as string), 0o700);
    const driftedMode = await intakeTeamReturn(
      { ...fixture.request, supersession: authority },
      fixture.dependencies,
    );
    expect(driftedMode.decision).toBe('REJECTED');
    expect(codes(driftedMode)).toContain('SUPERSESSION_PRIOR_INVALID');
  }, 120_000);

  it('rejects a changed previously COMPLETE lesson even when the replacement validates', async () => {
    const { authority, finalRoot, fixture, prior } = await prepareFinalTeamSupersession({
      changePriorComplete: true,
    });
    const priorIdentity = filesystemIdentity(finalRoot);

    const result = await intakeTeamReturn(
      { ...fixture.request, supersession: authority },
      fixture.dependencies,
    );

    expect(result.decision).toBe('REJECTED');
    expect(codes(result)).toContain('SUPERSESSION_NON_MONOTONIC');
    expect(filesystemIdentity(finalRoot)).toBe(priorIdentity);
    expect(readJson(join(finalRoot, 'INTAKE-RECEIPT.json')).receiptSha256).toBe(
      prior.receiptSha256,
    );
  }, 120_000);

  it('rejects removal or downgrade of a previously COMPLETE row', async () => {
    const { authority, finalRoot, fixture, prior } = await prepareFinalTeamSupersession({
      downgradePriorComplete: true,
    });

    const result = await intakeTeamReturn(
      { ...fixture.request, supersession: authority },
      fixture.dependencies,
    );

    expect(result.decision).toBe('REJECTED');
    expect(codes(result)).toContain('SUPERSESSION_NON_MONOTONIC');
    expect(recursiveFiles(join(finalRoot, 'lessons'))).toHaveLength(23 * LESSON_FILES.length);
    expect(readJson(join(finalRoot, 'INTAKE-RECEIPT.json')).receiptSha256).toBe(
      prior.receiptSha256,
    );
  }, 120_000);
});
