import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as kitFactory from './kit-factory';
import {
  canonicalKitJson,
  createBuildingReadinessState,
  createSendMeText,
  createFederatedKitCandidates,
  createDeterministicZip,
  extractZipToIsolatedDirectory,
  KitFactoryError,
  readZipEntries,
  runCommandSmoke,
  scanKitBoundaries,
  verifyKitCandidate,
  verifySendMeConsistency,
  type CommandRunner,
  type FinalInputValidators,
  type KitIdentityPins,
  type SmokeCommand,
  type TeamKitInput,
  type ValidatedAssignmentProjection,
  type ValidatedPacketProjection,
} from './kit-factory';

type JsonObject = Record<string, unknown>;

const sha256 = (value: string | Uint8Array): string =>
  createHash('sha256').update(value).digest('hex');

const EXPECTED_PINS: KitIdentityPins = {
  repositoryCommit: 'a'.repeat(40),
  kitSha256: sha256('synthetic kit contract'),
  profileSha256: sha256('synthetic profile'),
  schemaSha256: sha256('synthetic WP-01 v5 schema set'),
  templateSha256: sha256('synthetic canonical template'),
  curriculumSha256: sha256('synthetic curriculum'),
  toolVersions: {
    node: '24.17.0',
    pnpm: '9.15.9',
    wp03KitFactory: '1.0.0',
  },
};

const RUN_ID = '2026-08-03T1727-0500';
const CONTRACT_VERSION = '5.0.0';
const SCHEMA_VERSION = '5.0.0';
const COHORT_GENERATION = 7;

function assignmentIdFor(teamId: 'team-A' | 'team-B'): string {
  return `lesson-factory-deadline-2026-08-03-assignment-${teamId === 'team-A' ? '02' : '03'}`;
}

function assignmentBindingIdFor(teamId: 'team-A' | 'team-B'): string {
  return `binding-${teamId}-generation-${COHORT_GENERATION}`;
}

function syntheticPacketDocument(
  lessonId: string,
  teamId: 'team-A' | 'team-B',
  laneId: string,
): JsonObject {
  return {
    $test_fixture: { synthetic: true, not_for_production: true },
    kind: 'packet',
    projection: {
      runId: RUN_ID,
      lessonId,
      packetId: `packet-${lessonId}`,
      revision: 'r1',
      teamId,
      laneId,
      assignmentId: assignmentIdFor(teamId),
      assignmentBindingId: assignmentBindingIdFor(teamId),
      contractVersion: CONTRACT_VERSION,
      schemaVersion: SCHEMA_VERSION,
      generation: COHORT_GENERATION,
      status: 'READY',
      pins: structuredClone(EXPECTED_PINS),
    },
  };
}

function syntheticValidators(): FinalInputValidators {
  return {
    validateAssignment: ({ document, bytes }) => {
      const envelope = document as JsonObject;
      if (
        (envelope.$test_fixture as JsonObject | undefined)?.synthetic !== true ||
        envelope.kind !== 'assignment'
      ) {
        return { ok: false, errors: ['synthetic assignment schema rejected the document'] };
      }
      return {
        ok: true,
        value: {
          ...(structuredClone(envelope.projection) as unknown as ValidatedAssignmentProjection),
          fileSha256: sha256(bytes),
        },
      };
    },
    validatePacket: (input) => {
      const { document, bytes } = input;
      const envelope = document as JsonObject;
      if (
        (envelope.$test_fixture as JsonObject | undefined)?.synthetic !== true ||
        envelope.kind !== 'packet'
      ) {
        return { ok: false, errors: ['synthetic packet schema rejected the document'] };
      }
      return {
        ok: true,
        value: {
          ...(structuredClone(envelope.projection) as unknown as ValidatedPacketProjection),
          fileSha256: sha256(bytes),
          contentSha256: sha256(canonicalKitJson(document)),
          sourcePacketPath: input.path,
        },
      };
    },
  };
}

function syntheticTeam(
  teamId: 'team-A' | 'team-B',
  laneId: string,
  firstLessonNumber: number,
): TeamKitInput {
  const packets = Array.from({ length: 30 }, (_, index) => {
    const lessonId = `V3-LES-${String(firstLessonNumber + index).padStart(6, '0')}`;
    const document = syntheticPacketDocument(lessonId, teamId, laneId);
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
    assignmentId: assignmentIdFor(teamId),
    assignmentBindingId: assignmentBindingIdFor(teamId),
    contractVersion: CONTRACT_VERSION,
    schemaVersion: SCHEMA_VERSION,
    generation: COHORT_GENERATION,
    fileSha256: '',
    bindings: packets.map((packet, index) => ({
      lessonId: `V3-LES-${String(firstLessonNumber + index).padStart(6, '0')}`,
      packetId: `packet-V3-LES-${String(firstLessonNumber + index).padStart(6, '0')}`,
      revision: 'r1',
      path: packet.path,
      sha256: packet.expectedSha256,
      contentSha256: sha256(canonicalKitJson(packet.document)),
    })),
    pins: structuredClone(EXPECTED_PINS),
  };
  const assignmentDocument = {
    $test_fixture: { synthetic: true, not_for_production: true },
    kind: 'assignment',
    projection,
  };
  const assignmentBytes = `${canonicalKitJson(assignmentDocument)}\n`;
  const coreFiles = [
    { path: 'core/README.md', bytes: 'Synthetic teammate instructions.\n' },
    { path: 'core/template/template.json', bytes: '{"synthetic":true}\n' },
  ] as const;
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
    expectedPins: structuredClone(EXPECTED_PINS),
    expectedCohort: {
      assignmentId: assignmentIdFor(teamId),
      assignmentBindingId: assignmentBindingIdFor(teamId),
      contractVersion: CONTRACT_VERSION,
      schemaVersion: SCHEMA_VERSION,
      generation: COHORT_GENERATION,
    },
    requiredCorePaths: ['core/README.md', 'core/template/template.json'],
    allowedInventory: [
      {
        path: coreFiles[0].path,
        sha256: sha256(coreFiles[0].bytes),
        mediaType: 'text/plain',
      },
      {
        path: coreFiles[1].path,
        sha256: sha256(coreFiles[1].bytes),
        mediaType: 'application/json',
      },
      {
        path: assignment.path,
        sha256: assignment.expectedSha256,
        mediaType: 'application/json',
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

function rewritePacketProjection(
  team: TeamKitInput,
  packetIndex: number,
  mutate: (projection: JsonObject) => void,
): TeamKitInput {
  const original = team.packets[packetIndex]!;
  const document = structuredClone(original.document) as JsonObject;
  mutate(document.projection as JsonObject);
  const bytes = `${canonicalKitJson(document)}\n`;
  const packet = {
    ...original,
    document,
    bytes,
    expectedSha256: sha256(bytes),
  };
  const packets = team.packets.map((candidate, index) =>
    index === packetIndex ? packet : candidate,
  );
  const assignmentDocument = structuredClone(team.assignment.document) as JsonObject;
  const assignmentProjection =
    assignmentDocument.projection as unknown as ValidatedAssignmentProjection;
  const bindings = assignmentProjection.bindings.map((binding) =>
    binding.path === original.path
      ? {
          ...binding,
          sha256: packet.expectedSha256,
          contentSha256: sha256(canonicalKitJson(packet.document)),
        }
      : binding,
  );
  (assignmentDocument.projection as JsonObject).bindings = bindings;
  const assignmentBytes = `${canonicalKitJson(assignmentDocument)}\n`;
  return {
    ...team,
    assignment: {
      ...team.assignment,
      document: assignmentDocument,
      bytes: assignmentBytes,
      expectedSha256: sha256(assignmentBytes),
    },
    packets,
    allowedInventory: team.allowedInventory.map((entry) => {
      if (entry.path === packet.path) {
        return { ...entry, sha256: packet.expectedSha256 };
      }
      if (entry.path === team.assignment.path) {
        return { ...entry, sha256: sha256(assignmentBytes) };
      }
      return entry;
    }),
  };
}

function rewriteIdentityPins(team: TeamKitInput, pins: KitIdentityPins): TeamKitInput {
  const packets = team.packets.map((packet) => {
    const document = structuredClone(packet.document) as JsonObject;
    (document.projection as JsonObject).pins = structuredClone(pins);
    const bytes = `${canonicalKitJson(document)}\n`;
    return { ...packet, document, bytes, expectedSha256: sha256(bytes) };
  });
  const packetHashByPath = new Map(
    packets.map((packet) => [packet.path, packet.expectedSha256] as const),
  );
  const assignmentDocument = structuredClone(team.assignment.document) as JsonObject;
  const projection = assignmentDocument.projection as JsonObject;
  projection.pins = structuredClone(pins);
  projection.bindings = (
    projection.bindings as unknown as ValidatedAssignmentProjection['bindings']
  ).map((binding) => ({
    ...binding,
    sha256: packetHashByPath.get(binding.path) ?? binding.sha256,
    contentSha256:
      packets.find((packet) => packet.path === binding.path) === undefined
        ? binding.contentSha256
        : sha256(
            canonicalKitJson(packets.find((packet) => packet.path === binding.path)!.document),
          ),
  }));
  const assignmentBytes = `${canonicalKitJson(assignmentDocument)}\n`;
  return {
    ...team,
    expectedPins: structuredClone(pins),
    packets,
    allowedInventory: team.allowedInventory.map((entry) => {
      const packet = packets.find((candidate) => candidate.path === entry.path);
      if (packet !== undefined) return { ...entry, sha256: packet.expectedSha256 };
      if (entry.path === team.assignment.path) {
        return { ...entry, sha256: sha256(assignmentBytes) };
      }
      return entry;
    }),
    assignment: {
      ...team.assignment,
      document: assignmentDocument,
      bytes: assignmentBytes,
      expectedSha256: sha256(assignmentBytes),
    },
  };
}

function rewriteCoherentAssignmentId(team: TeamKitInput, assignmentId: string): TeamKitInput {
  const packets = team.packets.map((packet) => {
    const document = structuredClone(packet.document) as JsonObject;
    (document.projection as JsonObject).assignmentId = assignmentId;
    const bytes = `${canonicalKitJson(document)}\n`;
    return { ...packet, document, bytes, expectedSha256: sha256(bytes) };
  });
  const packetByPath = new Map(packets.map((packet) => [packet.path, packet] as const));
  const assignmentDocument = structuredClone(team.assignment.document) as JsonObject;
  const projection = assignmentDocument.projection as JsonObject;
  projection.assignmentId = assignmentId;
  projection.bindings = (
    projection.bindings as unknown as ValidatedAssignmentProjection['bindings']
  ).map((binding) => {
    const packet = packetByPath.get(binding.path)!;
    return {
      ...binding,
      sha256: packet.expectedSha256,
      contentSha256: sha256(canonicalKitJson(packet.document)),
    };
  });
  const assignmentBytes = `${canonicalKitJson(assignmentDocument)}\n`;
  const assignment = {
    ...team.assignment,
    document: assignmentDocument,
    bytes: assignmentBytes,
    expectedSha256: sha256(assignmentBytes),
  };
  return {
    ...team,
    packets,
    assignment,
    allowedInventory: team.allowedInventory.map((entry) => {
      const packet = packetByPath.get(entry.path);
      if (packet !== undefined) return { ...entry, sha256: packet.expectedSha256 };
      if (entry.path === assignment.path) return { ...entry, sha256: assignment.expectedSha256 };
      return entry;
    }),
  };
}

function fakeSourceBytes(byteLength: number, onCopyAccess: () => void): Uint8Array {
  return new Proxy(
    { byteLength },
    {
      get(target, property) {
        if (property === 'byteLength') return target.byteLength;
        onCopyAccess();
        if (property === 'length') return target.byteLength;
        return undefined;
      },
    },
  ) as unknown as Uint8Array;
}

function expectKitError(operation: () => unknown, code: string): KitFactoryError {
  let observed: unknown;
  try {
    operation();
  } catch (error) {
    observed = error;
  }
  expect(observed).toBeInstanceOf(KitFactoryError);
  const factoryError = observed as KitFactoryError;
  expect(factoryError.blockers.map((blocker) => blocker.code)).toContain(code);
  return factoryError;
}

const SMOKE_COMMANDS: readonly SmokeCommand[] = [
  {
    id: 'bootstrap',
    executable: '/usr/local/bin/pnpm',
    args: ['run', 'bootstrap'],
    cwd: '.',
  },
  {
    id: 'install',
    executable: '/usr/local/bin/pnpm',
    args: ['install', '--frozen-lockfile'],
    cwd: '.',
  },
  {
    id: 'one-template',
    executable: '/usr/local/bin/pnpm',
    args: ['run', 'one-template', '--', '$(touch must-remain-an-argument)'],
    cwd: 'core/template',
  },
];

interface ReviewInventoryEntry {
  readonly path: string;
  readonly sha256: string;
  readonly mediaType:
    | 'text/plain'
    | 'application/json'
    | 'application/yaml'
    | 'text/x-env'
    | 'application/octet-stream'
    | 'application/zip';
  readonly allowNestedArchive?: boolean;
}

function reviewInventory(
  files: readonly { readonly path: string; readonly bytes: string | Uint8Array }[],
  mediaType: ReviewInventoryEntry['mediaType'] = 'text/plain',
  allowNestedArchive = false,
): ReviewInventoryEntry[] {
  return files.map((file) => ({
    path: file.path,
    sha256: sha256(file.bytes),
    mediaType,
    ...(allowNestedArchive ? { allowNestedArchive: true } : {}),
  }));
}

function centralHeaderOffsets(archive: Buffer): number[] {
  const signature = Buffer.from([0x50, 0x4b, 0x01, 0x02]);
  const offsets: number[] = [];
  let from = 0;
  while (from < archive.length) {
    const offset = archive.indexOf(signature, from);
    if (offset < 0) break;
    offsets.push(offset);
    from = offset + signature.length;
  }
  return offsets;
}

describe('canonicalKitJson', () => {
  it('sorts object keys recursively while preserving array order', () => {
    expect(canonicalKitJson({ z: [2, 1], a: { y: true, x: null } })).toBe(
      '{"a":{"x":null,"y":true},"z":[2,1]}',
    );
  });

  it.each([undefined, Number.NaN, Number.POSITIVE_INFINITY, { invalid: undefined }, new Date(0)])(
    'rejects non-JSON value %s instead of silently changing it',
    (value) => {
      expect(() => canonicalKitJson(value)).toThrow(/NON_JSON_VALUE/);
    },
  );
});

describe('deterministic ZIP format', () => {
  it('emits byte-identical archives independent of input order', () => {
    const files = [
      { path: 'z-last.txt', bytes: 'last', mode: 0o755 },
      { path: 'a-first.txt', bytes: 'first', mode: 0o644 },
    ] as const;

    const first = createDeterministicZip(files);
    const second = createDeterministicZip([...files].reverse());

    expect(Buffer.from(second).equals(Buffer.from(first))).toBe(true);
  });

  it('fixes entry order, timestamps, compression, and UNIX permissions', () => {
    const archive = createDeterministicZip([
      { path: 'z-last.txt', bytes: 'last', mode: 0o755 },
      { path: 'a-first.txt', bytes: 'first' },
    ]);

    expect(
      readZipEntries(archive).map(({ path, mode, modifiedAt, compressionMethod }) => ({
        path,
        mode,
        modifiedAt,
        compressionMethod,
      })),
    ).toEqual([
      {
        path: 'a-first.txt',
        mode: 0o644,
        modifiedAt: '1980-01-01T00:00:00.000Z',
        compressionMethod: 'STORE',
      },
      {
        path: 'z-last.txt',
        mode: 0o755,
        modifiedAt: '1980-01-01T00:00:00.000Z',
        compressionMethod: 'STORE',
      },
    ]);
  });

  it.each(['../escape.txt', '/absolute.txt', 'C:\\absolute.txt'])(
    'rejects unsafe archive path %s',
    (path) => {
      expect(() => readZipEntries(createDeterministicZip([{ path, bytes: 'unsafe' }]))).toThrow(
        /UNSAFE_ARCHIVE_PATH/,
      );
    },
  );

  it('rejects a ZIP entry marked as a symbolic link', () => {
    const archive = Buffer.from(
      createDeterministicZip([{ path: 'safe.txt', bytes: 'link-target' }]),
    );
    const centralOffset = archive.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    archive.writeUInt32LE(((0o120777 << 16) >>> 0) as number, centralOffset + 38);

    expect(() => readZipEntries(archive)).toThrow(/SYMLINK_ENTRY/);
  });

  it('rejects duplicate archive paths instead of emitting ambiguous entries', () => {
    expect(() =>
      createDeterministicZip([
        { path: 'same.txt', bytes: 'first' },
        { path: 'same.txt', bytes: 'second' },
      ]),
    ).toThrow(/DUPLICATE_ARCHIVE_PATH/);
  });
});

describe('isolated ZIP extraction', () => {
  it('extracts into a fresh clean directory without touching sibling contents', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'wp03-extraction-test-'));
    try {
      const sentinelPath = join(parent, 'preexisting.txt');
      await writeFile(sentinelPath, 'keep');
      const archive = createDeterministicZip([
        { path: 'nested/file.txt', bytes: 'payload', mode: 0o644 },
      ]);

      const first = await extractZipToIsolatedDirectory(archive, parent);
      const second = await extractZipToIsolatedDirectory(archive, parent);

      expect(first.directory).not.toBe(second.directory);
      expect(first.directory.startsWith(`${parent}/`)).toBe(true);
      expect(await readFile(join(first.directory, 'nested/file.txt'), 'utf8')).toBe('payload');
      expect((await stat(join(first.directory, 'nested/file.txt'))).mode & 0o777).toBe(0o644);
      expect(await readFile(sentinelPath, 'utf8')).toBe('keep');
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });
});

describe('command smoke dependency injection', () => {
  it('passes argv without a shell and with only explicit environment values', async () => {
    const calls: Parameters<CommandRunner['run']>[0][] = [];
    const runner: CommandRunner = {
      run: (request) => {
        calls.push(request);
        return Promise.resolve({ exitCode: 0, stdout: 'ok', stderr: '' });
      },
    };

    const receipts = await runCommandSmoke(
      {
        extractionRoot: '/tmp/synthetic-extraction',
        commands: SMOKE_COMMANDS,
        environment: { CI: '1', NO_COLOR: '1' },
      },
      runner,
    );

    expect(receipts.map((receipt) => receipt.id)).toEqual(['bootstrap', 'install', 'one-template']);
    expect(receipts.every((receipt) => receipt.status === 'TOOLING_TEST_PASS')).toBe(true);
    expect(calls[2]?.args.at(-1)).toBe('$(touch must-remain-an-argument)');
    expect(calls.every((call) => call.shell === false)).toBe(true);
    expect(calls.every((call) => call.environment.PATH === undefined)).toBe(true);
    expect(calls.every((call) => call.environment.CI === '1')).toBe(true);
  });

  it('rejects cwd escape and an incomplete smoke command set before invoking the runner', async () => {
    let callCount = 0;
    const runner: CommandRunner = {
      run: () => {
        callCount += 1;
        return Promise.resolve({ exitCode: 0, stdout: '', stderr: '' });
      },
    };

    await expect(
      runCommandSmoke(
        {
          extractionRoot: '/tmp/synthetic-extraction',
          commands: SMOKE_COMMANDS.map((command, index) =>
            index === 0 ? { ...command, cwd: '../escape' } : command,
          ),
          environment: {},
        },
        runner,
      ),
    ).rejects.toThrow(/UNSAFE_SMOKE_CWD/);
    await expect(
      runCommandSmoke(
        {
          extractionRoot: '/tmp/synthetic-extraction',
          commands: SMOKE_COMMANDS.slice(0, 2),
          environment: {},
        },
        runner,
      ),
    ).rejects.toThrow(/COMMAND_SET_MISMATCH/);
    expect(callCount).toBe(0);
  });

  it('rejects nonzero commands and protected material in command logs', async () => {
    const failedRunner: CommandRunner = {
      run: () => Promise.resolve({ exitCode: 7, stdout: '', stderr: 'failed' }),
    };
    await expect(
      runCommandSmoke(
        {
          extractionRoot: '/tmp/synthetic-extraction',
          commands: SMOKE_COMMANDS,
          environment: {},
        },
        failedRunner,
      ),
    ).rejects.toThrow(/COMMAND_SMOKE_FAILED/);

    const leakingRunner: CommandRunner = {
      run: () =>
        Promise.resolve({
          exitCode: 0,
          stdout: 'PROTECTED_CORPUS_BEGIN raw fixture',
          stderr: '',
        }),
    };
    await expect(
      runCommandSmoke(
        {
          extractionRoot: '/tmp/synthetic-extraction',
          commands: SMOKE_COMMANDS,
          environment: {},
        },
        leakingRunner,
      ),
    ).rejects.toThrow(/COMMAND_LOG_BOUNDARY_FAILED/);
  });
});

describe('kit boundary scanning', () => {
  it.each([
    ['config/.env.local', 'SAFE=0', 'ENV_FILE'],
    ['docs/credentials.txt', '-----BEGIN PRIVATE KEY-----', 'SECRET_MATERIAL'],
    ['private/notes.txt', 'internal notes', 'PRIVATE_SOURCE'],
    ['sources/kaplan-questions.json', '{}', 'KAPLAN_MATERIAL'],
    ['protected/corpus.json', '{}', 'PROTECTED_CORPUS'],
    ['packets/lesson/answer-key.json', '{"answer":"B"}', 'ANSWER_KEY'],
    ['judge/expected-labels.json', '[]', 'AUTHOR_JUDGE_BOUNDARY'],
    ['logs/bootstrap.log', 'PROTECTED_CORPUS_BEGIN raw fixture', 'PROTECTED_CORPUS'],
  ])('rejects %s at the %s boundary', (path, bytes, expectedCode) => {
    const files = [{ path, bytes }];
    const mediaType = path.endsWith('.json') ? 'application/json' : 'text/plain';
    expect(
      scanKitBoundaries(files, reviewInventory(files, mediaType)).map(
        (violation) => violation.code,
      ),
    ).toContain(expectedCode);
  });

  it('allows policy prose that names forbidden categories without embedding material', () => {
    const files = [
      {
        path: 'docs/source-boundary-policy.md',
        bytes: 'Do not package private Kaplan material, protected corpora, or answer-key files.',
      },
    ];
    expect(scanKitBoundaries(files, reviewInventory(files))).toEqual([]);
  });
});

describe('federated kit candidate assembly', () => {
  it('assembles exact disjoint 30/30 membership with deterministic manifests', () => {
    const input = {
      teamA: syntheticTeam('team-A', 'lane-02', 1),
      teamB: syntheticTeam('team-B', 'lane-03', 31),
    };

    const first = createFederatedKitCandidates(input, syntheticValidators());
    const second = createFederatedKitCandidates(input, syntheticValidators());

    expect(first.teamA.manifest.allowedLessonIds).toHaveLength(30);
    expect(first.teamB.manifest.allowedLessonIds).toHaveLength(30);
    expect(
      first.teamA.manifest.allowedLessonIds.filter((lessonId) =>
        first.teamB.manifest.allowedLessonIds.includes(lessonId),
      ),
    ).toEqual([]);
    expect(first.teamA.manifestBytes).toBe(second.teamA.manifestBytes);
    expect(
      Buffer.from(first.teamA.archiveBytes).equals(Buffer.from(second.teamA.archiveBytes)),
    ).toBe(true);
    expect(first.teamA.userSendable).toBe(false);
    expect(first.teamB.userSendable).toBe(false);
  });

  it('requires byte-identical core files for both teams', () => {
    const teamA = syntheticTeam('team-A', 'lane-02', 1);
    const originalB = syntheticTeam('team-B', 'lane-03', 31);
    const teamB = {
      ...originalB,
      coreFiles: originalB.coreFiles.map((file, index) =>
        index === 0 ? { ...file, bytes: 'different bytes' } : file,
      ),
    };

    expectKitError(
      () => createFederatedKitCandidates({ teamA, teamB }, syntheticValidators()),
      'CORE_FILE_PARITY_MISMATCH',
    );
  });

  it('requires the execution-supplied exact core inventory', () => {
    const originalA = syntheticTeam('team-A', 'lane-02', 1);
    const originalB = syntheticTeam('team-B', 'lane-03', 31);
    const teamA = { ...originalA, coreFiles: originalA.coreFiles.slice(0, 1) };
    const teamB = { ...originalB, coreFiles: originalB.coreFiles.slice(0, 1) };

    expectKitError(
      () => createFederatedKitCandidates({ teamA, teamB }, syntheticValidators()),
      'CORE_FILE_SET_MISMATCH',
    );
  });

  it('rejects a packet whose validated team identity is wrong', () => {
    const teamA = rewritePacketProjection(
      syntheticTeam('team-A', 'lane-02', 1),
      0,
      (projection) => {
        projection.teamId = 'team-B';
      },
    );

    expectKitError(
      () =>
        createFederatedKitCandidates(
          { teamA, teamB: syntheticTeam('team-B', 'lane-03', 31) },
          syntheticValidators(),
        ),
      'WRONG_TEAM_PACKET',
    );
  });

  it('rejects duplicate packets even when the array still has 30 entries', () => {
    const original = syntheticTeam('team-A', 'lane-02', 1);
    const teamA = {
      ...original,
      packets: [...original.packets.slice(0, -1), original.packets[0]!],
    };

    expectKitError(
      () =>
        createFederatedKitCandidates(
          { teamA, teamB: syntheticTeam('team-B', 'lane-03', 31) },
          syntheticValidators(),
        ),
      'DUPLICATE_PACKET',
    );
  });

  it('rejects a partial lane with a missing packet', () => {
    const original = syntheticTeam('team-A', 'lane-02', 1);
    const teamA = { ...original, packets: original.packets.slice(0, -1) };

    expectKitError(
      () =>
        createFederatedKitCandidates(
          { teamA, teamB: syntheticTeam('team-B', 'lane-03', 31) },
          syntheticValidators(),
        ),
      'PACKET_COUNT_MISMATCH',
    );
  });

  it('rejects an unassigned packet without substituting it for the missing lesson', () => {
    const teamA = rewritePacketProjection(
      syntheticTeam('team-A', 'lane-02', 1),
      0,
      (projection) => {
        projection.lessonId = 'V3-LES-999999';
      },
    );

    const error = expectKitError(
      () =>
        createFederatedKitCandidates(
          { teamA, teamB: syntheticTeam('team-B', 'lane-03', 31) },
          syntheticValidators(),
        ),
      'UNASSIGNED_PACKET',
    );
    expect(error.blockers.map((blocker) => blocker.code)).toContain('MISSING_PACKET');
  });

  it('rejects a schema-valid packet whose final status is BLOCKED', () => {
    const teamA = rewritePacketProjection(
      syntheticTeam('team-A', 'lane-02', 1),
      0,
      (projection) => {
        projection.status = 'BLOCKED';
      },
    );

    expectKitError(
      () =>
        createFederatedKitCandidates(
          { teamA, teamB: syntheticTeam('team-B', 'lane-03', 31) },
          syntheticValidators(),
        ),
      'PACKET_NOT_READY',
    );
  });

  it('rejects lesson membership shared across team A and team B', () => {
    expectKitError(
      () =>
        createFederatedKitCandidates(
          {
            teamA: syntheticTeam('team-A', 'lane-02', 1),
            teamB: syntheticTeam('team-B', 'lane-03', 1),
          },
          syntheticValidators(),
        ),
      'CROSS_TEAM_PACKET_OVERLAP',
    );
  });

  it('rejects assignment and packet byte hashes that do not close', () => {
    const originalAssignment = syntheticTeam('team-A', 'lane-02', 1);
    const changedAssignment = {
      ...originalAssignment,
      assignment: {
        ...originalAssignment.assignment,
        bytes: `${String(originalAssignment.assignment.bytes)} `,
      },
    };
    expectKitError(
      () =>
        createFederatedKitCandidates(
          {
            teamA: changedAssignment,
            teamB: syntheticTeam('team-B', 'lane-03', 31),
          },
          syntheticValidators(),
        ),
      'ASSIGNMENT_HASH_MISMATCH',
    );

    const originalPacket = syntheticTeam('team-A', 'lane-02', 1);
    const changedPacket = {
      ...originalPacket,
      packets: originalPacket.packets.map((packet, index) =>
        index === 0 ? { ...packet, bytes: `${String(packet.bytes)} ` } : packet,
      ),
    };
    expectKitError(
      () =>
        createFederatedKitCandidates(
          { teamA: changedPacket, teamB: syntheticTeam('team-B', 'lane-03', 31) },
          syntheticValidators(),
        ),
      'PACKET_HASH_MISMATCH',
    );
  });

  it.each([
    ['repositoryCommit', 'REPOSITORY_COMMIT_MISMATCH'],
    ['kitSha256', 'KIT_HASH_MISMATCH'],
    ['profileSha256', 'PROFILE_HASH_MISMATCH'],
    ['schemaSha256', 'SCHEMA_HASH_MISMATCH'],
    ['templateSha256', 'TEMPLATE_HASH_MISMATCH'],
    ['curriculumSha256', 'CURRICULUM_HASH_MISMATCH'],
  ] as const)('rejects packet %s drift', (field, expectedCode) => {
    const teamA = rewritePacketProjection(
      syntheticTeam('team-A', 'lane-02', 1),
      0,
      (projection) => {
        const pins = projection.pins as JsonObject;
        pins[field] = field === 'repositoryCommit' ? 'b'.repeat(40) : sha256(`wrong ${field}`);
      },
    );

    expectKitError(
      () =>
        createFederatedKitCandidates(
          { teamA, teamB: syntheticTeam('team-B', 'lane-03', 31) },
          syntheticValidators(),
        ),
      expectedCode,
    );
  });

  it('rejects tool-version drift as an exact set mismatch', () => {
    const teamA = rewritePacketProjection(
      syntheticTeam('team-A', 'lane-02', 1),
      0,
      (projection) => {
        const pins = projection.pins as JsonObject;
        (pins.toolVersions as JsonObject).node = 'different';
      },
    );

    expectKitError(
      () =>
        createFederatedKitCandidates(
          { teamA, teamB: syntheticTeam('team-B', 'lane-03', 31) },
          syntheticValidators(),
        ),
      'TOOL_VERSION_MISMATCH',
    );
  });

  it('rejects all-zero identity placeholders even when every input agrees on them', () => {
    const placeholderPins: KitIdentityPins = {
      ...EXPECTED_PINS,
      schemaSha256: '0'.repeat(64),
    };
    const teamA = rewriteIdentityPins(syntheticTeam('team-A', 'lane-02', 1), placeholderPins);
    const teamB = rewriteIdentityPins(syntheticTeam('team-B', 'lane-03', 31), placeholderPins);

    expectKitError(
      () => createFederatedKitCandidates({ teamA, teamB }, syntheticValidators()),
      'INVALID_IDENTITY_PIN',
    );
  });

  it('fails closed when the supplied final packet validator throws', () => {
    const validators = syntheticValidators();
    expectKitError(
      () =>
        createFederatedKitCandidates(
          {
            teamA: syntheticTeam('team-A', 'lane-02', 1),
            teamB: syntheticTeam('team-B', 'lane-03', 31),
          },
          {
            ...validators,
            validatePacket: () => {
              throw new Error('validator unavailable');
            },
          },
        ),
      'PACKET_VALIDATOR_FAILURE',
    );
  });

  it('rejects a packet refused by the supplied final schema validator', () => {
    const validators = syntheticValidators();
    expectKitError(
      () =>
        createFederatedKitCandidates(
          {
            teamA: syntheticTeam('team-A', 'lane-02', 1),
            teamB: syntheticTeam('team-B', 'lane-03', 31),
          },
          {
            ...validators,
            validatePacket: () => ({ ok: false, errors: ['v5 schema mismatch'] }),
          },
        ),
      'PACKET_SCHEMA_REJECTED',
    );
  });

  it('validates the exact packet bytes instead of trusting an out-of-band document', () => {
    const original = syntheticTeam('team-A', 'lane-02', 1);
    const originalPacket = original.packets[0]!;
    const packetBytes = '{}\n';
    const packetSha256 = sha256(packetBytes);
    const packets = original.packets.map((packet, index) =>
      index === 0 ? { ...packet, bytes: packetBytes, expectedSha256: packetSha256 } : packet,
    );
    const assignmentDocument = structuredClone(original.assignment.document) as JsonObject;
    const assignmentProjection = assignmentDocument.projection as JsonObject;
    assignmentProjection.bindings = (
      assignmentProjection.bindings as unknown as ValidatedAssignmentProjection['bindings']
    ).map((binding) =>
      binding.path === originalPacket.path ? { ...binding, sha256: packetSha256 } : binding,
    );
    const assignmentBytes = `${canonicalKitJson(assignmentDocument)}\n`;
    const teamA = {
      ...original,
      packets,
      assignment: {
        ...original.assignment,
        document: assignmentDocument,
        bytes: assignmentBytes,
        expectedSha256: sha256(assignmentBytes),
      },
    };

    expectKitError(
      () =>
        createFederatedKitCandidates(
          { teamA, teamB: syntheticTeam('team-B', 'lane-03', 31) },
          syntheticValidators(),
        ),
      'PACKET_SCHEMA_REJECTED',
    );
  });

  it('refuses candidate assembly when any packaged file crosses a boundary', () => {
    const teamA = syntheticTeam('team-A', 'lane-02', 1);
    const teamB = syntheticTeam('team-B', 'lane-03', 31);
    const forbidden = { path: 'config/.env.production', bytes: 'DATABASE_URL=secret' };
    const contaminatedA = {
      ...teamA,
      requiredCorePaths: [...teamA.requiredCorePaths, forbidden.path],
      coreFiles: [...teamA.coreFiles, forbidden],
    };
    const contaminatedB = {
      ...teamB,
      requiredCorePaths: [...teamB.requiredCorePaths, forbidden.path],
      coreFiles: [...teamB.coreFiles, forbidden],
    };

    expectKitError(
      () =>
        createFederatedKitCandidates(
          { teamA: contaminatedA, teamB: contaminatedB },
          syntheticValidators(),
        ),
      'BOUNDARY_SCAN_FAILED',
    );
  });
});

describe('candidate verification gates', () => {
  it('revalidates extracted assignment and packets before returning a non-sendable verification', async () => {
    const scratchParent = await mkdtemp(join(tmpdir(), 'wp03-verification-test-'));
    try {
      const baseValidators = syntheticValidators();
      let assignmentValidations = 0;
      let packetValidations = 0;
      const validators: FinalInputValidators = {
        validateAssignment: (input) => {
          assignmentValidations += 1;
          return baseValidators.validateAssignment(input);
        },
        validatePacket: (input) => {
          packetValidations += 1;
          return baseValidators.validatePacket(input);
        },
      };
      const teamA = syntheticTeam('team-A', 'lane-02', 1);
      const teamB = syntheticTeam('team-B', 'lane-03', 31);
      const candidates = createFederatedKitCandidates({ teamA, teamB }, validators);
      const runner: CommandRunner = {
        run: () => Promise.resolve({ exitCode: 0, stdout: 'ok', stderr: '' }),
      };

      const verified = await verifyKitCandidate(
        {
          candidate: candidates.teamA,
          source: teamA,
          scratchParent,
          smokeCommands: SMOKE_COMMANDS,
          smokeEnvironment: { CI: '1' },
        },
        validators,
        runner,
      );

      expect(verified.kind).toBe('VERIFIED_KIT_CANDIDATE');
      expect(verified.userSendable).toBe(false);
      expect(Object.values(verified.checks).every((status) => status === 'PASS')).toBe(true);
      expect(assignmentValidations).toBe(3);
      expect(packetValidations).toBe(90);
    } finally {
      await rm(scratchParent, { recursive: true, force: true });
    }
  });

  it('rejects archive checksum drift before extraction can authorize anything', async () => {
    const scratchParent = await mkdtemp(join(tmpdir(), 'wp03-hash-test-'));
    try {
      const teamA = syntheticTeam('team-A', 'lane-02', 1);
      const candidates = createFederatedKitCandidates(
        { teamA, teamB: syntheticTeam('team-B', 'lane-03', 31) },
        syntheticValidators(),
      );
      const archiveBytes = Uint8Array.from(candidates.teamA.archiveBytes);
      archiveBytes[0] = (archiveBytes[0] ?? 0) ^ 0xff;

      await expect(
        verifyKitCandidate(
          {
            candidate: { ...candidates.teamA, archiveBytes },
            source: teamA,
            scratchParent,
            smokeCommands: SMOKE_COMMANDS,
            smokeEnvironment: {},
          },
          syntheticValidators(),
          { run: () => Promise.resolve({ exitCode: 0, stdout: '', stderr: '' }) },
        ),
      ).rejects.toThrow(/ARCHIVE_HASH_MISMATCH/);
    } finally {
      await rm(scratchParent, { recursive: true, force: true });
    }
  });

  it('rejects an archive whose extracted bytes do not close against its manifest', async () => {
    const scratchParent = await mkdtemp(join(tmpdir(), 'wp03-manifest-test-'));
    try {
      const teamA = syntheticTeam('team-A', 'lane-02', 1);
      const candidates = createFederatedKitCandidates(
        { teamA, teamB: syntheticTeam('team-B', 'lane-03', 31) },
        syntheticValidators(),
      );
      const changedEntries = readZipEntries(candidates.teamA.archiveBytes).map((entry) => ({
        path: entry.path,
        bytes: entry.path === 'core/README.md' ? 'tampered' : entry.bytes,
        mode: entry.mode,
      }));
      const archiveBytes = createDeterministicZip(changedEntries);

      await expect(
        verifyKitCandidate(
          {
            candidate: {
              ...candidates.teamA,
              archiveBytes,
              archiveSha256: sha256(archiveBytes),
            },
            source: teamA,
            scratchParent,
            smokeCommands: SMOKE_COMMANDS,
            smokeEnvironment: {},
          },
          syntheticValidators(),
          { run: () => Promise.resolve({ exitCode: 0, stdout: '', stderr: '' }) },
        ),
      ).rejects.toThrow(/MANIFEST_CLOSURE_FAILED/);
    } finally {
      await rm(scratchParent, { recursive: true, force: true });
    }
  });
});

describe('SEND-ME consistency', () => {
  it('pins the exact verified archive and rejects any field drift', async () => {
    const scratchParent = await mkdtemp(join(tmpdir(), 'wp03-send-me-test-'));
    try {
      const teamA = syntheticTeam('team-A', 'lane-02', 1);
      const candidate = createFederatedKitCandidates(
        { teamA, teamB: syntheticTeam('team-B', 'lane-03', 31) },
        syntheticValidators(),
      ).teamA;
      const verified = await verifyKitCandidate(
        {
          candidate,
          source: teamA,
          scratchParent,
          smokeCommands: SMOKE_COMMANDS,
          smokeEnvironment: {},
        },
        syntheticValidators(),
        { run: () => Promise.resolve({ exitCode: 0, stdout: '', stderr: '' }) },
      );

      const sendMe = createSendMeText(verified);
      expect(() => verifySendMeConsistency(sendMe, verified)).not.toThrow();
      expect(sendMe).toContain(`ARCHIVE_SHA256=${candidate.archiveSha256}`);
      expect(sendMe).toContain(`KIT_MANIFEST_SHA256=${candidate.manifestSha256}`);
      expect(() =>
        verifySendMeConsistency(
          sendMe.replace(candidate.archiveSha256, sha256('different archive')),
          verified,
        ),
      ).toThrow(/SEND_ME_MISMATCH/);
    } finally {
      await rm(scratchParent, { recursive: true, force: true });
    }
  });
});

describe('federated production block and supersession model', () => {
  it('stops before validation because production adapters are module-owned and absent', () => {
    expect(kitFactory.getProductionExecutionStatus()).toMatchObject({
      status: 'BLOCKED',
      toolingStatus: 'TOOLING_REVIEW_READY_BLOCKED_ON_REAL_INPUTS',
      userSendable: false,
      artifacts: [],
      blockerCodes: ['PRODUCTION_ADAPTER_NOT_CONFIGURED', 'PRODUCTION_INTEGRATION_UNARMED'],
    });
  });

  it('cleans both teams and exposes no partial bundle when second-team tooling verification fails', async () => {
    const scratchParent = await mkdtemp(join(tmpdir(), 'wp03-no-partial-test-'));
    try {
      const teamA = syntheticTeam('team-A', 'lane-02', 1);
      const teamB = syntheticTeam('team-B', 'lane-03', 31);
      const candidates = createFederatedKitCandidates({ teamA, teamB }, syntheticValidators());
      let calls = 0;
      const runner: CommandRunner = {
        run: () => {
          calls += 1;
          return Promise.resolve({
            exitCode: calls === 4 ? 9 : 0,
            stdout: '',
            stderr: '',
          });
        },
      };
      const first = await verifyKitCandidate(
        {
          candidate: candidates.teamA,
          source: teamA,
          scratchParent,
          smokeCommands: SMOKE_COMMANDS,
          smokeEnvironment: {},
        },
        syntheticValidators(),
        runner,
      );
      expect(first.userSendable).toBe(false);
      await expect(
        verifyKitCandidate(
          {
            candidate: candidates.teamB,
            source: teamB,
            scratchParent,
            smokeCommands: SMOKE_COMMANDS,
            smokeEnvironment: {},
          },
          syntheticValidators(),
          runner,
        ),
      ).rejects.toThrow(/COMMAND_SMOKE_FAILED/);
      expect(await readdir(scratchParent)).toEqual([]);
      expect(kitFactory.getProductionExecutionStatus().artifacts).toEqual([]);
    } finally {
      await rm(scratchParent, { recursive: true, force: true });
    }
  });

  it('models two-team supersession without claiming external atomicity or sendability', () => {
    const validators = syntheticValidators();
    const firstCandidates = createFederatedKitCandidates(
      {
        teamA: syntheticTeam('team-A', 'lane-02', 1),
        teamB: syntheticTeam('team-B', 'lane-03', 31),
      },
      validators,
    );
    const first = kitFactory.modelFederatedSupersession(createBuildingReadinessState(RUN_ID), [
      firstCandidates.teamA,
      firstCandidates.teamB,
    ]);
    const secondCandidates = createFederatedKitCandidates(
      {
        teamA: { ...syntheticTeam('team-A', 'lane-02', 1), assembledAt: 'later-A' },
        teamB: { ...syntheticTeam('team-B', 'lane-03', 31), assembledAt: 'later-B' },
      },
      validators,
    );
    const second = kitFactory.modelFederatedSupersession(first, [
      secondCandidates.teamA,
      secondCandidates.teamB,
    ]);

    expect(second).toMatchObject({
      authority: 'IN_MEMORY_MODEL_ONLY',
      status: 'MODELING',
      userSendable: false,
      generation: 2,
    });
    expect(second.history).toHaveLength(2);
    expect(second.history.every((record) => record.status === 'MODELED_SUPERSEDED')).toBe(true);
  });
});

describe('WP-03 review corrections', () => {
  it('keeps production authority module-owned and permanently blocked until adapters exist', () => {
    const api = kitFactory as unknown as {
      executeFederatedKitFactory?: unknown;
      getProductionExecutionStatus?: () => {
        status: string;
        userSendable: boolean;
        blockerCodes: readonly string[];
        requiredEvidenceFields: readonly string[];
      };
    };

    expect(api.executeFederatedKitFactory).toBeUndefined();
    expect(typeof api.getProductionExecutionStatus).toBe('function');
    expect(api.getProductionExecutionStatus).toHaveLength(0);
    const status = api.getProductionExecutionStatus!();
    expect(status).toMatchObject({
      status: 'BLOCKED',
      userSendable: false,
    });
    expect(status.blockerCodes).toEqual(
      expect.arrayContaining([
        'PRODUCTION_ADAPTER_NOT_CONFIGURED',
        'PRODUCTION_INTEGRATION_UNARMED',
      ]),
    );
    expect(status.requiredEvidenceFields).toEqual(
      expect.arrayContaining([
        'runId',
        'archiveSha256',
        'manifestSha256',
        'assignmentSha256',
        'repositoryCommit',
        'schemaSha256',
        'profileSha256',
        'templateSha256',
        'toolVersionsSha256',
      ]),
    );
  });

  it('rejects invalid UTF-8 and replacement characters in declared text', () => {
    const scan = scanKitBoundaries as unknown as (
      files: readonly { path: string; bytes: string | Uint8Array }[],
      inventory: readonly ReviewInventoryEntry[],
    ) => readonly { code: string }[];
    const invalidUtf8 = [{ path: 'docs/input.txt', bytes: Uint8Array.from([0xc3, 0x28]) }];
    const ambiguous = [{ path: 'docs/input.txt', bytes: 'before\uFFFDafter' }];

    expect(scan(invalidUtf8, reviewInventory(invalidUtf8)).map((item) => item.code)).toContain(
      'TEXT_ENCODING_INVALID',
    );
    expect(scan(ambiguous, reviewInventory(ambiguous)).map((item) => item.code)).toContain(
      'TEXT_ENCODING_AMBIGUOUS',
    );
  });

  it.each([
    ['application/json', '{"outer":{"password":"secret"}}', 'SECRET_MATERIAL'],
    ['application/json', '{"outer":{"client_secret":"secret"}}', 'SECRET_MATERIAL'],
    ['application/json', '{"outer":{"authToken":"secret"}}', 'SECRET_MATERIAL'],
    ['application/yaml', 'outer:\n  token: secret\n', 'SECRET_MATERIAL'],
    ['text/x-env', 'PASSWORD=secret\n', 'SECRET_MATERIAL'],
    ['application/json', '{"outer":{"expected_labels":["A"]}}', 'ANSWER_KEY'],
    ['application/json', '{"outer":{"answers":["A"]}}', 'ANSWER_KEY'],
    ['application/json', '{"outer":{"supervisor_notes":"hidden"}}', 'AUTHOR_JUDGE_BOUNDARY'],
    ['application/json', '{"outer":{"private_notes":"hidden"}}', 'PRIVATE_SOURCE'],
    ['application/json', '{"outer":{"kaplan_private_corpus":"hidden"}}', 'KAPLAN_MATERIAL'],
  ] as const)(
    'recursively rejects %s structured boundary bypasses',
    (mediaType, bytes, expectedCode) => {
      const files = [
        { path: `payload.${mediaType === 'application/json' ? 'json' : 'txt'}`, bytes },
      ];
      const violations = (
        scanKitBoundaries as unknown as (
          scannedFiles: typeof files,
          inventory: readonly ReviewInventoryEntry[],
        ) => readonly { code: string }[]
      )(files, reviewInventory(files, mediaType));
      expect(violations.map((item) => item.code)).toContain(expectedCode);
    },
  );

  it('rejects closed-inventory drift, private paths, and nested archives', () => {
    const scan = scanKitBoundaries as unknown as (
      files: readonly { path: string; bytes: string | Uint8Array }[],
      inventory: readonly ReviewInventoryEntry[],
    ) => readonly { code: string }[];
    const privateFile = [{ path: 'notes/private-notes.md', bytes: 'hidden' }];
    const nestedArchive = [
      {
        path: 'attachments/data.bin',
        bytes: Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 0x00]),
      },
    ];
    const driftedInventory = reviewInventory(privateFile).map((entry) => ({
      ...entry,
      sha256: sha256('different'),
    }));

    expect(scan(privateFile, driftedInventory).map((item) => item.code)).toEqual(
      expect.arrayContaining(['INVENTORY_MISMATCH', 'PRIVATE_SOURCE']),
    );
    expect(
      scan(nestedArchive, reviewInventory(nestedArchive, 'application/octet-stream')).map(
        (item) => item.code,
      ),
    ).toContain('NESTED_ARCHIVE');
  });

  it('rejects caller-only binary and nested-archive allowlisting', () => {
    const binary = [{ path: 'assets/pinned.bin', bytes: Uint8Array.from([0xff, 0x00, 0x01]) }];
    expect(
      scanKitBoundaries(binary, reviewInventory(binary, 'application/octet-stream')).map(
        (violation) => violation.code,
      ),
    ).toEqual(expect.arrayContaining(['INVENTORY_MISMATCH', 'UNSUPPORTED_BINARY_PAYLOAD']));
    const nested = [
      {
        path: 'assets/pinned.zip',
        bytes: Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 0x00]),
      },
    ];
    expect(
      scanKitBoundaries(nested, reviewInventory(nested, 'application/zip', true)).map(
        (violation) => violation.code,
      ),
    ).toEqual(expect.arrayContaining(['INVENTORY_MISMATCH', 'NESTED_ARCHIVE']));
  });

  it('rejects Unicode/case collisions, Windows names, and trailing dot or space paths', () => {
    expect(() =>
      createDeterministicZip([
        { path: 'A.txt', bytes: 'a' },
        { path: 'a.txt', bytes: 'b' },
      ]),
    ).toThrow(/ARCHIVE_PATH_COLLISION/);
    expect(() =>
      createDeterministicZip([
        { path: '\u00e9.txt', bytes: 'a' },
        { path: 'e\u0301.txt', bytes: 'b' },
      ]),
    ).toThrow(/NON_NFC_ARCHIVE_PATH/);
    expect(() =>
      createDeterministicZip([
        { path: 'stra\u00dfe.txt', bytes: 'a' },
        { path: 'STRASSE.txt', bytes: 'b' },
      ]),
    ).toThrow(/ARCHIVE_PATH_COLLISION/);
    expect(() => createDeterministicZip([{ path: 'CON.txt', bytes: 'x' }])).toThrow(
      /WINDOWS_RESERVED_PATH/,
    );
    expect(() => createDeterministicZip([{ path: 'trailing. ', bytes: 'x' }])).toThrow(
      /WINDOWS_UNSAFE_PATH/,
    );
  });

  it('enforces local/central ZIP parity, unique offsets, flags, and regular-file modes', () => {
    const parity = Buffer.from(createDeterministicZip([{ path: 'safe.txt', bytes: 'x' }]));
    parity[30] = 'X'.charCodeAt(0);
    expect(() => readZipEntries(parity)).toThrow(/LOCAL_CENTRAL_HEADER_MISMATCH/);
    const versionParity = Buffer.from(createDeterministicZip([{ path: 'safe.txt', bytes: 'x' }]));
    versionParity.writeUInt16LE(19, 4);
    expect(() => readZipEntries(versionParity)).toThrow(/LOCAL_CENTRAL_HEADER_MISMATCH/);

    for (const flag of [0x0001, 0x0008]) {
      const flagged = Buffer.from(createDeterministicZip([{ path: 'safe.txt', bytes: 'x' }]));
      const central = centralHeaderOffsets(flagged)[0]!;
      flagged.writeUInt16LE(0x0800 | flag, 6);
      flagged.writeUInt16LE(0x0800 | flag, central + 8);
      expect(() => readZipEntries(flagged)).toThrow(/UNSUPPORTED_ZIP_FLAGS/);
    }

    for (const mode of [0o040755, 0o060644, 0o100777]) {
      const typed = Buffer.from(createDeterministicZip([{ path: 'safe.txt', bytes: 'x' }]));
      const central = centralHeaderOffsets(typed)[0]!;
      typed.writeUInt32LE(((mode << 16) >>> 0) as number, central + 38);
      expect(() => readZipEntries(typed)).toThrow(/UNSAFE_ARCHIVE_MODE/);
    }

    const duplicateOffset = Buffer.from(
      createDeterministicZip([
        { path: 'a.txt', bytes: 'same' },
        { path: 'b.txt', bytes: 'same' },
      ]),
    );
    const [, secondCentral] = centralHeaderOffsets(duplicateOffset);
    duplicateOffset.writeUInt32LE(0, secondCentral! + 42);
    expect(() => readZipEntries(duplicateOffset)).toThrow(/DUPLICATE_LOCAL_OFFSET/);
  });

  it('rejects non-round-tripping UTF-8 names from hostile ZIP metadata', () => {
    const archive = Buffer.from(createDeterministicZip([{ path: '\u00e9.txt', bytes: 'x' }]));
    const central = centralHeaderOffsets(archive)[0]!;
    archive[31] = 0x28;
    archive[central + 47] = 0x28;

    expect(() => readZipEntries(archive)).toThrow(/INVALID_UTF8_PATH/);
  });

  it('applies resource limits before archive parsing or oversized entry allocation', () => {
    const readWithLimits = readZipEntries as unknown as (
      bytes: Uint8Array,
      limits: {
        maxArchiveBytes?: number;
        maxEntries?: number;
        maxEntryCompressedBytes?: number;
        maxEntryUncompressedBytes?: number;
        maxTotalUncompressedBytes?: number;
        maxCompressionRatio?: number;
        maxPathBytes?: number;
        maxPathDepth?: number;
      },
    ) => unknown;
    const archive = createDeterministicZip([{ path: 'safe.txt', bytes: 'x' }]);
    expect(() => readWithLimits(archive, { maxArchiveBytes: 8 })).toThrow(/ARCHIVE_SIZE_LIMIT/);

    const bomb = Buffer.from(archive);
    const central = centralHeaderOffsets(bomb)[0]!;
    bomb.writeUInt32LE(0x7fffffff, 22);
    bomb.writeUInt32LE(0x7fffffff, central + 24);
    expect(() => readWithLimits(bomb, { maxEntryUncompressedBytes: 1024 })).toThrow(
      /ENTRY_UNCOMPRESSED_LIMIT/,
    );

    const countBomb = Buffer.from(archive);
    const endOffset = countBomb.length - 22;
    countBomb.writeUInt16LE(2, endOffset + 8);
    countBomb.writeUInt16LE(2, endOffset + 10);
    expect(() => readWithLimits(countBomb, { maxEntries: 1 })).toThrow(/ENTRY_COUNT_LIMIT/);

    const compressedBomb = Buffer.from(archive);
    const compressedCentral = centralHeaderOffsets(compressedBomb)[0]!;
    compressedBomb.writeUInt32LE(1024, compressedCentral + 20);
    expect(() => readWithLimits(compressedBomb, { maxEntryCompressedBytes: 16 })).toThrow(
      /ENTRY_COMPRESSED_LIMIT/,
    );

    const ratioBomb = Buffer.from(archive);
    const ratioCentral = centralHeaderOffsets(ratioBomb)[0]!;
    ratioBomb.writeUInt32LE(100, ratioCentral + 24);
    expect(() => readWithLimits(ratioBomb, { maxCompressionRatio: 10 })).toThrow(
      /COMPRESSION_RATIO_LIMIT/,
    );

    const totalArchive = createDeterministicZip([
      { path: 'a.txt', bytes: '1234' },
      { path: 'b.txt', bytes: '5678' },
    ]);
    expect(() => readWithLimits(totalArchive, { maxTotalUncompressedBytes: 7 })).toThrow(
      /TOTAL_UNCOMPRESSED_LIMIT/,
    );
    expect(() => readWithLimits(archive, { maxPathBytes: 3 })).toThrow(/PATH_BYTE_LIMIT/);
    const deepArchive = createDeterministicZip([{ path: 'a/b.txt', bytes: 'x' }]);
    expect(() => readWithLimits(deepArchive, { maxPathDepth: 1 })).toThrow(/PATH_DEPTH_LIMIT/);
  });

  it('bounds smoke timeout and output before scanning logs', async () => {
    const smokeWithLimits = runCommandSmoke as unknown as (
      input: {
        extractionRoot: string;
        commands: readonly SmokeCommand[];
        environment: Readonly<Record<string, string>>;
      },
      runner: CommandRunner,
      limits: { timeoutMs?: number; maxStdoutBytes?: number; maxStderrBytes?: number },
    ) => Promise<unknown>;
    await expect(
      smokeWithLimits(
        {
          extractionRoot: '/tmp/synthetic-extraction',
          commands: SMOKE_COMMANDS,
          environment: {},
        },
        {
          run: () =>
            Promise.resolve({ exitCode: 0, stdout: '', stderr: '', timedOut: true } as never),
        },
        { timeoutMs: 5 },
      ),
    ).rejects.toThrow(/SMOKE_TIMEOUT/);
    await expect(
      smokeWithLimits(
        {
          extractionRoot: '/tmp/synthetic-extraction',
          commands: SMOKE_COMMANDS,
          environment: {},
        },
        { run: () => new Promise(() => undefined) },
        { timeoutMs: 5 },
      ),
    ).rejects.toThrow(/SMOKE_TIMEOUT/);
    await expect(
      smokeWithLimits(
        {
          extractionRoot: '/tmp/synthetic-extraction',
          commands: SMOKE_COMMANDS,
          environment: {},
        },
        {
          run: () => Promise.resolve({ exitCode: 0, stdout: 'oversized', stderr: '' }),
        },
        { maxStdoutBytes: 4 },
      ),
    ).rejects.toThrow(/SMOKE_OUTPUT_LIMIT/);
  });

  it('rejects PATH/NODE_OPTIONS injection and requires absolute executables', async () => {
    const runner: CommandRunner = {
      run: () => Promise.resolve({ exitCode: 0, stdout: '', stderr: '' }),
    };
    await expect(
      runCommandSmoke(
        {
          extractionRoot: '/tmp/synthetic-extraction',
          commands: SMOKE_COMMANDS,
          environment: { PATH: '/attacker', NODE_OPTIONS: '--require evil' },
        },
        runner,
      ),
    ).rejects.toThrow(/UNSAFE_SMOKE_ENVIRONMENT|UNPINNED_SMOKE_EXECUTABLE/);
  });

  it('cleans verification extraction on success, manifest failure, and smoke failure', async () => {
    const scratchParent = await mkdtemp(join(tmpdir(), 'wp03-cleanup-review-'));
    try {
      const teamA = syntheticTeam('team-A', 'lane-02', 1);
      const candidate = createFederatedKitCandidates(
        { teamA, teamB: syntheticTeam('team-B', 'lane-03', 31) },
        syntheticValidators(),
      ).teamA;
      const baseInput = {
        candidate,
        source: teamA,
        scratchParent,
        smokeCommands: SMOKE_COMMANDS,
        smokeEnvironment: {},
      };
      await verifyKitCandidate(baseInput, syntheticValidators(), {
        run: () => Promise.resolve({ exitCode: 0, stdout: '', stderr: '' }),
      });
      expect(await readdir(scratchParent)).toEqual([]);

      const changedEntries = readZipEntries(candidate.archiveBytes).map((entry) => ({
        path: entry.path,
        bytes: entry.path === 'core/README.md' ? 'tampered' : entry.bytes,
        mode: entry.mode,
      }));
      const archiveBytes = createDeterministicZip(changedEntries);
      await expect(
        verifyKitCandidate(
          {
            ...baseInput,
            candidate: { ...candidate, archiveBytes, archiveSha256: sha256(archiveBytes) },
          },
          syntheticValidators(),
          { run: () => Promise.resolve({ exitCode: 0, stdout: '', stderr: '' }) },
        ),
      ).rejects.toThrow(/MANIFEST_CLOSURE_FAILED/);
      expect(await readdir(scratchParent)).toEqual([]);

      await expect(
        verifyKitCandidate(baseInput, syntheticValidators(), {
          run: () => Promise.resolve({ exitCode: 9, stdout: '', stderr: '' }),
        }),
      ).rejects.toThrow(/COMMAND_SMOKE_FAILED/);
      expect(await readdir(scratchParent)).toEqual([]);
    } finally {
      await rm(scratchParent, { recursive: true, force: true });
    }
  });

  it('rejects stale packet cohort projections and binds team slots', () => {
    const stale = rewritePacketProjection(
      syntheticTeam('team-A', 'lane-02', 1),
      0,
      (projection) => {
        projection.runId = 'stale-run';
      },
    );
    expectKitError(
      () =>
        createFederatedKitCandidates(
          { teamA: stale, teamB: syntheticTeam('team-B', 'lane-03', 31) },
          syntheticValidators(),
        ),
      'COHORT_FRESHNESS_MISMATCH',
    );
    expectKitError(
      () =>
        createFederatedKitCandidates(
          {
            teamA: syntheticTeam('team-B', 'lane-03', 31),
            teamB: syntheticTeam('team-A', 'lane-02', 1),
          },
          syntheticValidators(),
        ),
      'FEDERATED_TEAM_SLOT_MISMATCH',
    );
  });

  it.each([
    ['runId', 'stale-run'],
    ['assignmentId', 'stale-assignment'],
    ['assignmentBindingId', 'stale-binding'],
    ['contractVersion', '4.0.0'],
    ['schemaVersion', '4.0.0'],
    ['generation', 6],
    ['packetId', 'stale-packet'],
    ['revision', 'stale-revision'],
  ] as const)('rejects stale packet cohort field %s', (field, value) => {
    const stale = rewritePacketProjection(
      syntheticTeam('team-A', 'lane-02', 1),
      0,
      (projection) => {
        projection[field] = value;
      },
    );
    expectKitError(
      () =>
        createFederatedKitCandidates(
          { teamA: stale, teamB: syntheticTeam('team-B', 'lane-03', 31) },
          syntheticValidators(),
        ),
      'COHORT_FRESHNESS_MISMATCH',
    );
  });

  it('rejects validator-projected stale content hashes and source packet paths', () => {
    for (const staleField of ['contentSha256', 'sourcePacketPath'] as const) {
      const base = syntheticValidators();
      const validators: FinalInputValidators = {
        ...base,
        validatePacket: (input) => {
          const result = base.validatePacket(input);
          if (!result.ok) return result;
          return {
            ok: true,
            value: {
              ...result.value,
              [staleField]:
                staleField === 'contentSha256' ? sha256('stale-content') : 'stale/path.json',
            },
          };
        },
      };
      expectKitError(
        () =>
          createFederatedKitCandidates(
            {
              teamA: syntheticTeam('team-A', 'lane-02', 1),
              teamB: syntheticTeam('team-B', 'lane-03', 31),
            },
            validators,
          ),
        'COHORT_FRESHNESS_MISMATCH',
      );
    }
  });

  it('rejects a coherent but stale assignment projection', () => {
    const original = syntheticTeam('team-A', 'lane-02', 1);
    const document = structuredClone(original.assignment.document) as JsonObject;
    (document.projection as JsonObject).contractVersion = '4.0.0';
    const bytes = `${canonicalKitJson(document)}\n`;
    const teamA: TeamKitInput = {
      ...original,
      assignment: {
        ...original.assignment,
        document,
        bytes,
        expectedSha256: sha256(bytes),
      },
      allowedInventory: original.allowedInventory.map((entry) =>
        entry.path === original.assignment.path ? { ...entry, sha256: sha256(bytes) } : entry,
      ),
    };
    expectKitError(
      () =>
        createFederatedKitCandidates(
          { teamA, teamB: syntheticTeam('team-B', 'lane-03', 31) },
          syntheticValidators(),
        ),
      'COHORT_FRESHNESS_MISMATCH',
    );
  });

  it('rejects cross-team run, schema generation, and identity-pin drift', () => {
    const originalB = syntheticTeam('team-B', 'lane-03', 31);
    expectKitError(
      () =>
        createFederatedKitCandidates(
          {
            teamA: syntheticTeam('team-A', 'lane-02', 1),
            teamB: { ...originalB, runId: 'stale-run' },
          },
          syntheticValidators(),
        ),
      'FEDERATED_COHORT_MISMATCH',
    );
    expectKitError(
      () =>
        createFederatedKitCandidates(
          {
            teamA: syntheticTeam('team-A', 'lane-02', 1),
            teamB: {
              ...originalB,
              expectedCohort: { ...originalB.expectedCohort, generation: 6 },
            },
          },
          syntheticValidators(),
        ),
      'FEDERATED_COHORT_MISMATCH',
    );
    expectKitError(
      () =>
        createFederatedKitCandidates(
          {
            teamA: syntheticTeam('team-A', 'lane-02', 1),
            teamB: {
              ...originalB,
              expectedPins: {
                ...originalB.expectedPins,
                profileSha256: sha256('stale-profile'),
              },
            },
          },
          syntheticValidators(),
        ),
      'FEDERATED_COHORT_MISMATCH',
    );
  });

  it('rejects sparse arrays in canonical JSON', () => {
    const sparse = new Array<unknown>(2);
    sparse[1] = 'present';
    expect(() => canonicalKitJson(sparse)).toThrow(/NON_JSON_VALUE.*sparse/i);
  });

  it('labels supersession as in-memory only and blocks the production writer', () => {
    const state = createBuildingReadinessState('2026-08-03T1727-0500') as unknown as {
      authority: string;
      userSendable: boolean;
    };
    const writerStatus = (
      kitFactory as unknown as {
        getProductionWriterStatus?: () => {
          status: string;
          blockerCode: string;
          requiredMechanisms: readonly string[];
        };
      }
    ).getProductionWriterStatus?.();

    expect(state).toMatchObject({
      authority: 'IN_MEMORY_MODEL_ONLY',
      userSendable: false,
    });
    expect(writerStatus).toMatchObject({
      status: 'BLOCKED',
      blockerCode: 'PRODUCTION_INTEGRATION_UNARMED',
    });
    expect(writerStatus?.requiredMechanisms).toEqual(
      expect.arrayContaining([
        'LOCK',
        'STAGED_WRITE',
        'FSYNC',
        'ATOMIC_RENAME',
        'ROLLBACK',
        'SINGLE_READY',
      ]),
    );
  });
});

describe('WP-03 remaining review corrections', () => {
  it.each([
    [
      '.npmrc',
      '_authToken=secret\n',
      'application/octet-stream',
      ['INVENTORY_MISMATCH', 'ENV_FILE', 'SECRET_MATERIAL'],
    ],
    ['notes/review.txt', '{"private_notes":"hidden"}', 'text/plain', ['PRIVATE_SOURCE']],
    ['docs/setup.md', 'password: secret\n', 'text/plain', ['SECRET_MATERIAL']],
    ['logs/run.log', '_authToken = secret\n', 'text/plain', ['SECRET_MATERIAL']],
    [
      'payload.bin',
      '{"_authToken":"secret"}',
      'application/octet-stream',
      ['INVENTORY_MISMATCH', 'SECRET_MATERIAL'],
    ],
    [
      'config.json',
      '{"password":"secret"}',
      'application/octet-stream',
      ['INVENTORY_MISMATCH', 'SECRET_MATERIAL'],
    ],
    ['notes/source.txt', '{"source_path":"private/notes"}', 'text/plain', ['PRIVATE_SOURCE']],
    [
      'config/control.yml',
      'content: Kaplan private corpus\n',
      'application/yaml',
      ['KAPLAN_MATERIAL', 'PRIVATE_SOURCE'],
    ],
  ] as const)(
    'uses module-owned media authority for %s',
    (path, bytes, mediaType, expectedCodes) => {
      const files = [{ path, bytes }];
      const violations = scanKitBoundaries(
        files,
        reviewInventory(files, mediaType as ReviewInventoryEntry['mediaType']),
      );
      expect(violations.map((violation) => violation.code)).toEqual(
        expect.arrayContaining([...expectedCodes]),
      );
    },
  );

  it.each([
    ['e\u0301.txt', 'NON_NFC_ARCHIVE_PATH'],
    ['line\nbreak.txt', 'ARCHIVE_PATH_CONTROL_CHARACTER'],
    ['c1\u0085control.txt', 'ARCHIVE_PATH_CONTROL_CHARACTER'],
    ['bad<name.txt', 'WINDOWS_INVALID_PATH'],
    ['bad>name.txt', 'WINDOWS_INVALID_PATH'],
    ['bad:name.txt', 'WINDOWS_INVALID_PATH'],
    ['bad"name.txt', 'WINDOWS_INVALID_PATH'],
    ['bad|name.txt', 'WINDOWS_INVALID_PATH'],
    ['bad?name.txt', 'WINDOWS_INVALID_PATH'],
    ['bad*name.txt', 'WINDOWS_INVALID_PATH'],
    ['file.txt:stream', 'WINDOWS_INVALID_PATH'],
  ])('rejects non-portable archive path %s', (path, expectedCode) => {
    expect(() => createDeterministicZip([{ path, bytes: 'x' }])).toThrow(expectedCode);
  });

  it('rejects trailing bytes and concatenated ZIP archives', () => {
    const archive = createDeterministicZip([{ path: 'safe.txt', bytes: 'x' }]);
    expect(() => readZipEntries(Buffer.concat([archive, Buffer.from('trailing')]))).toThrow(
      /TRAILING_ZIP_BYTES/,
    );
    expect(() => readZipEntries(Buffer.concat([archive, archive]))).toThrow(
      /TRAILING_ZIP_BYTES|INVALID_ZIP/,
    );
  });

  it('preflights oversized source bytes before copying or scanning', () => {
    const limits = kitFactory.KIT_FACTORY_RESOURCE_LIMITS;
    let copyAccesses = 0;
    const bomb = fakeSourceBytes(limits.maxEntryUncompressedBytes + 1, () => {
      copyAccesses += 1;
    });
    const originalA = syntheticTeam('team-A', 'lane-02', 1);
    const originalB = syntheticTeam('team-B', 'lane-03', 31);
    const teamA = {
      ...originalA,
      coreFiles: originalA.coreFiles.map((file, index) =>
        index === 0 ? { ...file, bytes: bomb } : file,
      ),
    };
    const teamB = {
      ...originalB,
      coreFiles: originalB.coreFiles.map((file, index) =>
        index === 0 ? { ...file, bytes: bomb } : file,
      ),
    };

    expectKitError(
      () => createFederatedKitCandidates({ teamA, teamB }, syntheticValidators()),
      'SOURCE_FILE_SIZE_LIMIT',
    );
    expect(copyAccesses).toBe(0);
  });

  it('preflights source count, total bytes, paths, inventory, and text decode limits', () => {
    const limits =
      kitFactory.KIT_FACTORY_RESOURCE_LIMITS as typeof kitFactory.KIT_FACTORY_RESOURCE_LIMITS & {
        readonly maxTextDecodeBytes?: number;
      };
    const originals = {
      teamA: syntheticTeam('team-A', 'lane-02', 1),
      teamB: syntheticTeam('team-B', 'lane-03', 31),
    };

    let countCopies = 0;
    const countBomb = fakeSourceBytes(1, () => {
      countCopies += 1;
    });
    const tooMany = Array.from({ length: limits.maxEntries + 1 }, (_, index) => ({
      path: `core/count-${index}.txt`,
      bytes: index === 0 ? countBomb : 'x',
    }));
    expectKitError(
      () =>
        createFederatedKitCandidates(
          {
            teamA: { ...originals.teamA, coreFiles: tooMany },
            teamB: { ...originals.teamB, coreFiles: tooMany },
          },
          syntheticValidators(),
        ),
      'SOURCE_ENTRY_COUNT_LIMIT',
    );
    expect(countCopies).toBe(0);

    let totalCopies = 0;
    const totalPartSize = Math.floor(limits.maxTotalUncompressedBytes / 5) + 1;
    const totalBomb = Array.from({ length: 5 }, (_, index) => ({
      path: `core/total-${index}.bin`,
      bytes: fakeSourceBytes(totalPartSize, () => {
        totalCopies += 1;
      }),
    }));
    expectKitError(
      () =>
        createFederatedKitCandidates(
          {
            teamA: { ...originals.teamA, coreFiles: totalBomb },
            teamB: { ...originals.teamB, coreFiles: totalBomb },
          },
          syntheticValidators(),
        ),
      'SOURCE_TOTAL_SIZE_LIMIT',
    );
    expect(totalCopies).toBe(0);

    const longPath = `core/${'a'.repeat(limits.maxPathBytes)}.txt`;
    expectKitError(
      () =>
        createFederatedKitCandidates(
          {
            teamA: {
              ...originals.teamA,
              requiredCorePaths: [longPath],
              coreFiles: [{ path: longPath, bytes: 'x' }],
            },
            teamB: {
              ...originals.teamB,
              requiredCorePaths: [longPath],
              coreFiles: [{ path: longPath, bytes: 'x' }],
            },
          },
          syntheticValidators(),
        ),
      'SOURCE_PATH_LIMIT',
    );

    let inventoryCopies = 0;
    const inventoryBomb = fakeSourceBytes(1, () => {
      inventoryCopies += 1;
    });
    const oversizedInventory = Array.from(
      { length: limits.maxInventoryEntries + 1 },
      (_, index) => ({
        path: `assets/inventory-${index}.bin`,
        sha256: sha256(`inventory-${index}`),
        mediaType: 'application/octet-stream' as const,
      }),
    );
    expectKitError(
      () =>
        createFederatedKitCandidates(
          {
            teamA: {
              ...originals.teamA,
              coreFiles: [{ path: 'core/bomb.bin', bytes: inventoryBomb }],
              allowedInventory: oversizedInventory,
            },
            teamB: {
              ...originals.teamB,
              coreFiles: [{ path: 'core/bomb.bin', bytes: inventoryBomb }],
              allowedInventory: oversizedInventory,
            },
          },
          syntheticValidators(),
        ),
      'INVENTORY_LIMIT',
    );
    expect(inventoryCopies).toBe(0);

    const textLimit = limits.maxTextDecodeBytes ?? 8 * 1024 * 1024;
    let textCopies = 0;
    const textBomb = fakeSourceBytes(textLimit + 1, () => {
      textCopies += 1;
    });
    expectKitError(
      () =>
        createFederatedKitCandidates(
          {
            teamA: {
              ...originals.teamA,
              coreFiles: [{ path: 'core/large.md', bytes: textBomb }],
            },
            teamB: {
              ...originals.teamB,
              coreFiles: [{ path: 'core/large.md', bytes: textBomb }],
            },
          },
          syntheticValidators(),
        ),
      'SOURCE_TEXT_DECODE_LIMIT',
    );
    expect(textCopies).toBe(0);
  });

  it('rejects a coherent stale assignment ID across assignment and packets', () => {
    const teamA = rewriteCoherentAssignmentId(
      syntheticTeam('team-A', 'lane-02', 1),
      'stale-assignment-id',
    );
    expectKitError(
      () =>
        createFederatedKitCandidates(
          { teamA, teamB: syntheticTeam('team-B', 'lane-03', 31) },
          syntheticValidators(),
        ),
      'COHORT_FRESHNESS_MISMATCH',
    );
  });

  it('canonicalizes inventory order before hashing and archive construction', () => {
    const baseline = {
      teamA: syntheticTeam('team-A', 'lane-02', 1),
      teamB: syntheticTeam('team-B', 'lane-03', 31),
    };
    const reordered = {
      teamA: {
        ...baseline.teamA,
        allowedInventory: [...baseline.teamA.allowedInventory].reverse(),
      },
      teamB: {
        ...baseline.teamB,
        allowedInventory: [...baseline.teamB.allowedInventory].reverse(),
      },
    };
    const first = createFederatedKitCandidates(baseline, syntheticValidators());
    const second = createFederatedKitCandidates(reordered, syntheticValidators());

    expect(second.teamA.manifestBytes).toBe(first.teamA.manifestBytes);
    expect(
      Buffer.from(second.teamA.archiveBytes).equals(Buffer.from(first.teamA.archiveBytes)),
    ).toBe(true);
  });

  it('rejects duplicate canonical inventory keys', () => {
    const originalA = syntheticTeam('team-A', 'lane-02', 1);
    const originalB = syntheticTeam('team-B', 'lane-03', 31);
    const duplicateA = {
      ...originalA,
      allowedInventory: [...originalA.allowedInventory, originalA.allowedInventory[0]!],
    };
    const duplicateB = {
      ...originalB,
      allowedInventory: [...originalB.allowedInventory, originalB.allowedInventory[0]!],
    };
    expectKitError(
      () =>
        createFederatedKitCandidates(
          { teamA: duplicateA, teamB: duplicateB },
          syntheticValidators(),
        ),
      'INVENTORY_DUPLICATE_KEY',
    );
  });

  it('removes mkdtemp output when directory realpath fails', async () => {
    const api = kitFactory as unknown as {
      extractZipToIsolatedDirectoryForToolingTest?: (
        value: Uint8Array,
        scratchParent: string,
        dependencies: {
          readonly realpathDirectory: (path: string) => Promise<string>;
        },
      ) => Promise<unknown>;
    };
    expect(typeof api.extractZipToIsolatedDirectoryForToolingTest).toBe('function');
    const parent = await mkdtemp(join(tmpdir(), 'wp03-realpath-cleanup-test-'));
    try {
      const archive = createDeterministicZip([{ path: 'safe.txt', bytes: 'x' }]);
      await expect(
        api.extractZipToIsolatedDirectoryForToolingTest!(archive, parent, {
          realpathDirectory: () => Promise.reject(new Error('injected realpath failure')),
        }),
      ).rejects.toThrow(/injected realpath failure/);
      expect(await readdir(parent)).toEqual([]);
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });
});

describe('WP-03 final boundary scanner gap', () => {
  it.each([
    ['docs/secrets.txt', 'text/plain', 'SECRET_MATERIAL'],
    ['docs/secret.txt', 'text/plain', 'SECRET_MATERIAL'],
    ['config/.envrc', 'text/x-env', 'ENV_FILE'],
    ['config/app.env', 'text/x-env', 'ENV_FILE'],
  ] as const)('rejects exact-inventory boundary path %s', (path, mediaType, expectedCode) => {
    const files = [{ path, bytes: 'ordinary documentation\n' }];
    const violations = scanKitBoundaries(files, reviewInventory(files, mediaType));
    expect(violations.map((violation) => violation.code)).toContain(expectedCode);
  });

  it.each(['docs/secretary.txt', 'config/app.environment'])(
    'does not broaden exact token matching to %s',
    (path) => {
      const files = [{ path, bytes: 'ordinary documentation\n' }];
      expect(scanKitBoundaries(files, reviewInventory(files))).toEqual([]);
    },
  );
});
