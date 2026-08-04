import { execFileSync } from 'node:child_process';
import { createHash, createHmac, generateKeyPairSync, sign as signBytes } from 'node:crypto';
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  symlinkSync,
  truncateSync,
  writeFileSync,
} from 'node:fs';
import { copyFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import {
  TEAM_RETURN_STAGING_RELATIVE_ROOT,
  intakeTeamReturn,
  validateTeamReturnCandidateMechanically,
  type CentralMechanicalValidation,
  type TeamReturnCheckoutEvidence,
  type TeamReturnIntakeDependencies,
  type TeamReturnIntakeRequest,
} from './team-return-intake';

const REPOSITORY_ROOT = resolve(import.meta.dirname, '..', '..', '..', '..');
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
  if (!info.isDirectory()) {
    chmodSync(path, 0o600);
    return;
  }
  chmodSync(path, 0o700);
  for (const name of readdirSync(path)) makeWritable(join(path, name));
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
  options: Pick<FixtureOptions, 'identityCollision' | 'mechanicalFailures' | 'protectedLeak'>,
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
    payload: { ordered_kc_ids: [`V3-KC-${lessonId.slice(-6)}`] },
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
  writeJson(join(root, 'artifact-manifest.json'), {
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
  });

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

describe('deterministic Team A/B return intake', () => {
  afterAll(() => {
    makeWritable(FIXTURE_ROOT);
    rmSync(FIXTURE_ROOT, { force: true, recursive: true });
  });

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
});
