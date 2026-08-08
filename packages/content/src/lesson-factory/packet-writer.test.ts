import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

import { canonicalJson } from './admission';
import {
  collectPacketRuntimeModulesForTesting,
  PACKET_DATA_AUTHORITY_PATHS,
  PACKET_PROOF_PRODUCER_AUTHORITIES,
  PACKET_RUNTIME_TYPESCRIPT_AUTHORITY_PATHS,
  PACKET_SOURCE_AUTHORITY_PATHS,
  preflightProductionPacketPublication,
  publishPacketBatchForTesting,
  verifyPacketSourceTreeForTesting,
  verifyPacketRuntimeAuthorityGraphForTesting,
  type PacketPublicationAuthority,
  type PacketPublicationBatch,
  type PacketWriterFaultPoint,
} from './packet-writer';

type JsonObject = Record<string, unknown>;

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const SCRATCH_ROOT = join(
  REPO_ROOT,
  '.tmp/scratch/lesson-factory-2026-08-03T1727-0500/wp-04-writer-tests',
);
const PACKET_ROOT = 'content/lesson-factory/packets';

function sha256(bytes: string): string {
  return createHash('sha256').update(bytes, 'utf8').digest('hex');
}

function git(repositoryRoot: string, args: readonly string[]): string {
  const result = spawnSync('git', args, {
    cwd: repositoryRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'WP04 Writer Test',
      GIT_AUTHOR_EMAIL: 'wp04-writer@example.invalid',
      GIT_COMMITTER_NAME: 'WP04 Writer Test',
      GIT_COMMITTER_EMAIL: 'wp04-writer@example.invalid',
    },
  });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${result.stderr}`);
  }
  return result.stdout.trim();
}

function initializeAuthorityRepository(name: string): string {
  const repositoryRoot = join(SCRATCH_ROOT, `git-${name}`);
  mkdirSync(repositoryRoot, { recursive: true });
  git(repositoryRoot, ['init', '--quiet']);
  for (const path of PACKET_SOURCE_AUTHORITY_PATHS) {
    const absolute = join(repositoryRoot, path);
    mkdirSync(dirname(absolute), { recursive: true });
    writeFileSync(absolute, `committed authority ${path}\n`);
  }
  writeFileSync(
    join(repositoryRoot, 'tools/content-cli/src/packet-main.ts'),
    "import '@mcat/content/lesson-factory/packets';\n",
  );
  writeFileSync(
    join(repositoryRoot, 'packages/content/src/lesson-factory/packets.ts'),
    "export * from './packet-writer';\n",
  );
  writeFileSync(
    join(repositoryRoot, 'packages/content/src/lesson-factory/packet-writer.ts'),
    "import './packet-generator';\nimport './admission';\n",
  );
  writeFileSync(
    join(repositoryRoot, 'packages/content/src/lesson-factory/packet-generator.ts'),
    "import '@mcat/content/lesson-factory/admission';\n",
  );
  writeFileSync(
    join(repositoryRoot, 'packages/content/src/lesson-factory/admission/index.ts'),
    [
      "export * from './authority';",
      "export * from './canonical-json';",
      "export * from './intake';",
      "export * from './json-schema-subset';",
      "export * from './packet-semantics';",
      "export * from './reference-model';",
      '',
    ].join('\n'),
  );
  const assignments = [
    { team_id: 'primary', count: 51, rows: Array.from({ length: 51 }, (_, index) => index) },
    { team_id: 'team-A', count: 30, rows: Array.from({ length: 30 }, (_, index) => index + 51) },
    { team_id: 'team-B', count: 30, rows: Array.from({ length: 30 }, (_, index) => index + 81) },
  ];
  writeFileSync(
    join(repositoryRoot, 'content/lesson-factory/assignments/partition-proof.json'),
    `${JSON.stringify({
      contract_id: 'lesson-factory.assignment-partition-proof',
      contract_version: '2.0.0',
      authoring_scope: { generation_lesson_count: 111 },
      capacities: { primary: 51, 'team-A': 30, 'team-B': 30 },
      assignments,
      allocation_content_sha256: sha256(canonicalJson(assignments)),
    })}\n`,
  );
  git(repositoryRoot, ['add', '--', ...PACKET_SOURCE_AUTHORITY_PATHS]);
  git(repositoryRoot, ['commit', '--quiet', '-m', 'authority closure']);
  return repositoryRoot;
}

function expectSourceTreeRefusal(action: () => unknown): void {
  try {
    action();
    throw new Error('expected SOURCE_TREE_NOT_COMMITTED');
  } catch (error) {
    expect(error).toMatchObject({ code: 'SOURCE_TREE_NOT_COMMITTED' });
  }
}

function syntheticFixture(name: string): {
  repositoryRoot: string;
  batch: PacketPublicationBatch;
  authority: PacketPublicationAuthority;
} {
  const repositoryRoot = join(SCRATCH_ROOT, name);
  mkdirSync(join(repositoryRoot, 'content/lesson-factory'), { recursive: true });
  const files: Record<string, string> = {};
  const artifacts: Record<string, { fileSha256: string; contentSha256: string }> = {};
  const allocations: Record<string, { assignmentId: string; laneId: string; teamId: string }> = {};
  const expectedLessonIds: string[] = [];
  for (let index = 1; index <= 111; index += 1) {
    const suffix = String(index).padStart(6, '0');
    const lessonId = `V3-LES-${suffix}`;
    const laneId = `lane-${String(((index - 1) % 12) + 1).padStart(2, '0')}`;
    const teamId = index <= 51 ? 'primary' : index <= 81 ? 'team-A' : 'team-B';
    const assignmentId = `assignment-${suffix}`;
    const path = `${PACKET_ROOT}/${lessonId}/task-source-packet.json`;
    const packet = {
      contract_id: 'lesson-factory.task-source-packet',
      contract_version: '5.0.0',
      packet_status: 'READY',
      packet_surface: 'AUTHORABLE',
      lesson_id: lessonId,
      lane_id: laneId,
      team_id: teamId,
      assignment_id: assignmentId,
      output_requirements: { authorable_packet_path: path },
      input_hashes: [],
    };
    const bytes = `${JSON.stringify(packet)}\n`;
    files[path] = bytes;
    artifacts[path] = {
      fileSha256: sha256(bytes),
      contentSha256: sha256(canonicalJson(packet)),
    };
    allocations[lessonId] = { assignmentId, laneId, teamId };
    expectedLessonIds.push(lessonId);
  }
  const batch = {
    readyCount: 111,
    blockedCount: 0,
    files,
    outputSetSha256: sha256(canonicalJson(files)),
    artifacts,
  };
  const authority: PacketPublicationAuthority = {
    expectedLessonIds,
    allocations,
    pins: {
      allocationProofFileSha256: '1'.repeat(64),
      deadlineProfileFileSha256: '2'.repeat(64),
      taskPacketSchemaFileSha256: '3'.repeat(64),
      sourceUseReceiptFileSha256: '4'.repeat(64),
      sourceAuthorityClosure: {
        sourceCommitSha: '5'.repeat(40),
        digestSha256: '6'.repeat(64),
        files: [],
      },
    },
    admit: ({ bytes, locator }) => {
      const packet = JSON.parse(bytes) as JsonObject;
      const expectedLocator = `${String(packet.lane_id)}/${String(packet.lesson_id).toLowerCase()}`;
      return {
        admission: locator === expectedLocator ? 'ADMITTED' : 'REJECTED',
        semantic_validation: {
          validator: 'PACKET_SEMANTICS_V1',
          status: locator === expectedLocator ? 'PASS' : 'FAIL',
          error_count: locator === expectedLocator ? 0 : 1,
        },
      };
    },
  };
  return { repositoryRoot, batch, authority };
}

afterEach(() => {
  rmSync(SCRATCH_ROOT, { recursive: true, force: true });
});

describe('packet source commit closure', () => {
  it('exports an isolated packet subpath whose complete runtime graph is allowlisted', () => {
    const packageJson = JSON.parse(
      readFileSync(join(REPO_ROOT, 'packages/content/package.json'), 'utf8'),
    ) as { exports: Record<string, string> };
    const modules = collectPacketRuntimeModulesForTesting({ repositoryRoot: REPO_ROOT });

    expect(packageJson.exports['./lesson-factory/packets']).toBe('./src/lesson-factory/packets.ts');
    expect(modules).toContain('tools/content-cli/src/entry.ts');
    expect(modules).toContain('tools/content-cli/src/packet-main.ts');
    expect(modules).toContain('packages/content/src/lesson-factory/packets.ts');
    expect(modules).toContain('packages/content/src/lesson-factory/packet-writer.ts');
    expect(modules).toContain('packages/content/src/lesson-factory/packet-generator.ts');
    expect(modules.some((path) => /kit-(factory|production)\.ts$/.test(path))).toBe(false);
    expect(modules).toEqual([...PACKET_RUNTIME_TYPESCRIPT_AUTHORITY_PATHS]);
    expect(PACKET_PROOF_PRODUCER_AUTHORITIES).toEqual([
      {
        path: 'packages/content/src/lesson-factory/assignment-partition.ts',
        reason: 'PRODUCES_WP02_ASSIGNMENT_PARTITION_PROOF',
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
    const categoryUnion = [
      ...PACKET_RUNTIME_TYPESCRIPT_AUTHORITY_PATHS,
      ...PACKET_PROOF_PRODUCER_AUTHORITIES.map((producer) => producer.path),
      ...PACKET_DATA_AUTHORITY_PATHS,
    ].sort();
    expect(new Set(categoryUnion).size).toBe(categoryUnion.length);
    expect(categoryUnion).toEqual([...PACKET_SOURCE_AUTHORITY_PATHS]);
  });

  it('fails closure when the packet command gains an unallowlisted transitive import', () => {
    const repositoryRoot = join(SCRATCH_ROOT, 'missing-transitive');
    const entryPath = 'tools/content-cli/src/packet-main.ts';
    mkdirSync(dirname(join(repositoryRoot, entryPath)), { recursive: true });
    writeFileSync(join(repositoryRoot, entryPath), "import './not-allowlisted';\n");
    writeFileSync(
      join(repositoryRoot, 'tools/content-cli/src/not-allowlisted.ts'),
      'export const unexpected = true;\n',
    );

    expectSourceTreeRefusal(() =>
      verifyPacketRuntimeAuthorityGraphForTesting({ repositoryRoot, entryPath }),
    );
  });

  it('does not let unrelated modified kit code contaminate the packet runtime closure', () => {
    const repositoryRoot = initializeAuthorityRepository('unrelated-kit');
    const kitPath = 'packages/content/src/lesson-factory/kit-production.ts';
    mkdirSync(dirname(join(repositoryRoot, kitPath)), { recursive: true });
    writeFileSync(join(repositoryRoot, kitPath), 'export const kit = 1;\n');
    git(repositoryRoot, ['add', '--', kitPath]);
    git(repositoryRoot, ['commit', '--quiet', '-m', 'unrelated kit']);
    writeFileSync(join(repositoryRoot, kitPath), 'this is intentionally invalid kit syntax }\n');

    expect(verifyPacketSourceTreeForTesting({ repositoryRoot }).files).toHaveLength(
      PACKET_SOURCE_AUTHORITY_PATHS.length,
    );
    expect(collectPacketRuntimeModulesForTesting({ repositoryRoot: REPO_ROOT })).not.toContain(
      kitPath,
    );
  });

  it('blocks a modified or removed non-runtime proof producer', () => {
    const modifiedRoot = initializeAuthorityRepository('modified-producer');
    const producerPath = PACKET_PROOF_PRODUCER_AUTHORITIES[0]!.path;
    writeFileSync(join(modifiedRoot, producerPath), 'modified producer\n');
    expectSourceTreeRefusal(() =>
      verifyPacketSourceTreeForTesting({ repositoryRoot: modifiedRoot }),
    );

    const removedRoot = initializeAuthorityRepository('removed-producer');
    rmSync(join(removedRoot, producerPath));
    expectSourceTreeRefusal(() =>
      verifyPacketSourceTreeForTesting({ repositoryRoot: removedRoot }),
    );
  });

  it('binds the committed proof producer to the exact proof version and allocation hash', () => {
    const repositoryRoot = initializeAuthorityRepository('producer-binding');
    const proofPath = PACKET_PROOF_PRODUCER_AUTHORITIES[0]!.outputBinding.path;
    const proof = JSON.parse(readFileSync(join(repositoryRoot, proofPath), 'utf8')) as JsonObject;
    proof.allocation_content_sha256 = '0'.repeat(64);
    writeFileSync(join(repositoryRoot, proofPath), `${JSON.stringify(proof)}\n`);
    git(repositoryRoot, ['add', '--', proofPath]);
    git(repositoryRoot, ['commit', '--quiet', '-m', 'tamper clean proof binding']);

    expectSourceTreeRefusal(() => verifyPacketSourceTreeForTesting({ repositoryRoot }));
  });

  it('accepts an exact committed authority allowlist and records every HEAD blob', () => {
    const repositoryRoot = initializeAuthorityRepository('clean');
    const closure = verifyPacketSourceTreeForTesting({ repositoryRoot });

    expect(closure.sourceCommitSha).toBe(git(repositoryRoot, ['rev-parse', 'HEAD']));
    expect(closure.files.map((file) => file.path)).toEqual([...PACKET_SOURCE_AUTHORITY_PATHS]);
    expect(
      closure.files.find((file) => file.category === 'NON_RUNTIME_PROOF_PRODUCER'),
    ).toMatchObject({
      path: PACKET_PROOF_PRODUCER_AUTHORITIES[0]!.path,
      reason: 'PRODUCES_WP02_ASSIGNMENT_PARTITION_PROOF',
      outputBinding: {
        path: PACKET_PROOF_PRODUCER_AUTHORITIES[0]!.outputBinding.path,
        contractVersion: '2.0.0',
        allocationContentSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      },
    });
    for (const file of closure.files) {
      expect(file.blobSha).toBe(git(repositoryRoot, ['rev-parse', `HEAD:${file.path}`]));
    }
    expect(closure.digestSha256).toBe(
      sha256(canonicalJson({ source_commit_sha: closure.sourceCommitSha, files: closure.files })),
    );
  });

  it.each([
    [
      'unstaged modification',
      (root: string, path: string) => writeFileSync(join(root, path), 'unstaged\n'),
    ],
    [
      'staged modification',
      (root: string, path: string) => {
        writeFileSync(join(root, path), 'staged\n');
        git(root, ['add', '--', path]);
      },
    ],
    ['deleted authority', (root: string, path: string) => rmSync(join(root, path))],
    [
      'untracked authority',
      (root: string, path: string) => {
        git(root, ['rm', '--quiet', '--cached', '--', path]);
        git(root, ['commit', '--quiet', '-m', 'remove authority']);
      },
    ],
    [
      'intent-to-add authority',
      (root: string, path: string) => {
        git(root, ['rm', '--quiet', '--cached', '--', path]);
        git(root, ['commit', '--quiet', '-m', 'remove authority']);
        git(root, ['add', '-N', '--', path]);
      },
    ],
    [
      'assume-unchanged authority',
      (root: string, path: string) => git(root, ['update-index', '--assume-unchanged', '--', path]),
    ],
    [
      'skip-worktree authority',
      (root: string, path: string) => git(root, ['update-index', '--skip-worktree', '--', path]),
    ],
  ])('rejects %s with SOURCE_TREE_NOT_COMMITTED', (name, mutate) => {
    const repositoryRoot = initializeAuthorityRepository(name.replaceAll(' ', '-'));
    const path = PACKET_SOURCE_AUTHORITY_PATHS[0]!;
    mutate(repositoryRoot, path);

    expectSourceTreeRefusal(() => verifyPacketSourceTreeForTesting({ repositoryRoot }));
  });

  it('ignores unrelated untracked scratch outside the authority allowlist', () => {
    const repositoryRoot = initializeAuthorityRepository('unrelated');
    writeFileSync(join(repositoryRoot, 'unrelated-scratch.txt'), 'not authoritative\n');

    expect(verifyPacketSourceTreeForTesting({ repositoryRoot }).files).toHaveLength(
      PACKET_SOURCE_AUTHORITY_PATHS.length,
    );
  });

  it('seals the exact verified commit/blob closure into the packet set manifest', () => {
    const repositoryRoot = initializeAuthorityRepository('manifest');
    const fixture = syntheticFixture('manifest-batch');
    const closure = verifyPacketSourceTreeForTesting({ repositoryRoot });
    mkdirSync(join(repositoryRoot, 'content/lesson-factory'), { recursive: true });
    const result = publishPacketBatchForTesting({
      repositoryRoot,
      batch: fixture.batch,
      authority: {
        ...fixture.authority,
        pins: {
          ...fixture.authority.pins,
          sourceAuthorityClosure: closure,
        },
      },
      publish: true,
    });
    const manifest = JSON.parse(
      readFileSync(join(repositoryRoot, PACKET_ROOT, 'packet-set-manifest.json'), 'utf8'),
    ) as JsonObject;

    expect(result.status).toBe('PUBLISHED');
    expect(manifest.source_commit_sha).toBe(closure.sourceCommitSha);
    expect(manifest.source_authority_closure).toEqual({
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
    });
  });
});

describe('packet writer preflight', () => {
  it('validates an internally generated 111-file batch without publishing', () => {
    const fixture = syntheticFixture('preflight');

    const result = publishPacketBatchForTesting({
      ...fixture,
      publish: false,
    });

    expect(result).toMatchObject({
      status: 'PREFLIGHT_OK',
      readyCount: 111,
      blockedCount: 0,
      fileCount: 111,
      aggregateSha256: fixture.batch.outputSetSha256,
    });
    expect(existsSync(join(fixture.repositoryRoot, PACKET_ROOT))).toBe(false);
  });

  it.each([
    [
      'aggregate drift',
      (batch: PacketPublicationBatch) => ({ ...batch, outputSetSha256: '0'.repeat(64) }),
    ],
    [
      'blocked result',
      (batch: PacketPublicationBatch) => ({ ...batch, readyCount: 110, blockedCount: 1 }),
    ],
    [
      'missing path',
      (batch: PacketPublicationBatch) => {
        const files = { ...batch.files };
        delete files[Object.keys(files)[0]!];
        return { ...batch, files };
      },
    ],
    [
      'extra path',
      (batch: PacketPublicationBatch) => ({
        ...batch,
        files: { ...batch.files, [`${PACKET_ROOT}/unexpected.json`]: '{}\n' },
      }),
    ],
    [
      'file/content hash drift',
      (batch: PacketPublicationBatch) => {
        const [path] = Object.keys(batch.files);
        return {
          ...batch,
          artifacts: {
            ...batch.artifacts,
            [path!]: { fileSha256: '0'.repeat(64), contentSha256: '0'.repeat(64) },
          },
        };
      },
    ],
    [
      'missing file/content hashes',
      (batch: PacketPublicationBatch) => {
        const { artifacts: _artifacts, ...withoutArtifacts } = batch;
        return withoutArtifacts;
      },
    ],
  ])('fails closed on %s', (_name, mutate) => {
    const fixture = syntheticFixture(`reject-${_name.replaceAll(' ', '-')}`);

    expect(() =>
      publishPacketBatchForTesting({
        ...fixture,
        batch: mutate(fixture.batch),
        publish: false,
      }),
    ).toThrow();
    expect(existsSync(join(fixture.repositoryRoot, PACKET_ROOT))).toBe(false);
  });

  it('rejects duplicate case/NFC paths and raw or quarantine packet fields', () => {
    const fixture = syntheticFixture('unsafe-fields');
    const [path, bytes] = Object.entries(fixture.batch.files)[0]!;
    const packet = JSON.parse(bytes) as JsonObject;
    packet.packet_surface = 'QUARANTINE';
    packet.exact_text = 'forbidden';
    const files = {
      ...fixture.batch.files,
      [path]: `${JSON.stringify(packet)}\n`,
      [path.toLowerCase().normalize('NFD')]: bytes,
    };

    expect(() =>
      publishPacketBatchForTesting({
        ...fixture,
        batch: {
          ...fixture.batch,
          files,
          outputSetSha256: sha256(canonicalJson(files)),
        },
        publish: false,
      }),
    ).toThrow();
  });
});

describe('atomic packet publication', () => {
  it('publishes all packets plus one set manifest and returns ALREADY_PUBLISHED on rerun', () => {
    const fixture = syntheticFixture('publish');
    const first = publishPacketBatchForTesting({ ...fixture, publish: true });
    const packetRoot = join(fixture.repositoryRoot, PACKET_ROOT);

    expect(first.status).toBe('PUBLISHED');
    expect(existsSync(packetRoot)).toBe(true);
    expect(readdirSync(packetRoot)).toHaveLength(112);
    const manifest = JSON.parse(
      readFileSync(join(packetRoot, 'packet-set-manifest.json'), 'utf8'),
    ) as JsonObject;
    expect(manifest).toMatchObject({
      contract_id: 'lesson-factory.packet-set-manifest',
      packet_count: 111,
      aggregate_sha256: fixture.batch.outputSetSha256,
    });

    const second = publishPacketBatchForTesting({ ...fixture, publish: true });
    expect(second.status).toBe('ALREADY_PUBLISHED');
  });

  it.each<PacketWriterFaultPoint>([
    'LOCK_ACQUIRED',
    'STAGE_CREATED',
    'FILE_WRITTEN',
    'FILE_FSYNCED',
    'READBACK_VALIDATED',
    'MANIFEST_WRITTEN',
    'STAGE_FSYNCED',
    'BEFORE_RENAME',
  ])('keeps the destination absent and cleans owned state after injected %s failure', (point) => {
    const fixture = syntheticFixture(`fault-${point.toLowerCase()}`);

    expect(() =>
      publishPacketBatchForTesting({
        ...fixture,
        publish: true,
        fault: (observed) => {
          expect(existsSync(join(fixture.repositoryRoot, PACKET_ROOT))).toBe(false);
          if (observed === point) throw new Error(`injected ${point}`);
        },
      }),
    ).toThrow(`injected ${point}`);
    expect(existsSync(join(fixture.repositoryRoot, PACKET_ROOT))).toBe(false);
    expect(
      readdirSync(join(fixture.repositoryRoot, 'content/lesson-factory')).filter((name) =>
        name.startsWith('.packets.'),
      ),
    ).toEqual([]);
  });

  it('keeps the complete set after an injected post-rename failure', () => {
    const fixture = syntheticFixture('fault-after-rename');

    expect(() =>
      publishPacketBatchForTesting({
        ...fixture,
        publish: true,
        fault: (observed) => {
          if (observed === 'AFTER_RENAME') {
            expect(existsSync(join(fixture.repositoryRoot, PACKET_ROOT))).toBe(true);
            throw new Error('injected AFTER_RENAME');
          }
        },
      }),
    ).toThrow('injected AFTER_RENAME');
    expect(readdirSync(join(fixture.repositoryRoot, PACKET_ROOT))).toHaveLength(112);
  });

  it.each<PacketWriterFaultPoint>([
    'LOCK_ACQUIRED',
    'STAGE_CREATED',
    'FILE_WRITTEN',
    'FILE_FSYNCED',
    'READBACK_VALIDATED',
    'MANIFEST_WRITTEN',
    'STAGE_FSYNCED',
    'BEFORE_RENAME',
    'AFTER_RENAME',
  ])('recovers deterministically after process termination at %s', (point) => {
    const fixture = syntheticFixture(`crash-${point.toLowerCase()}`);
    const fixturePath = join(fixture.repositoryRoot, 'fixture.json');
    const childPath = join(fixture.repositoryRoot, 'crash-child.ts');
    writeFileSync(
      fixturePath,
      JSON.stringify({
        repositoryRoot: fixture.repositoryRoot,
        batch: fixture.batch,
        authority: {
          expectedLessonIds: fixture.authority.expectedLessonIds,
          allocations: fixture.authority.allocations,
          pins: fixture.authority.pins,
        },
      }),
    );
    writeFileSync(
      childPath,
      `import { readFileSync } from 'node:fs';
import { publishPacketBatchForTesting } from ${JSON.stringify(
        join(dirname(fileURLToPath(import.meta.url)), 'packet-writer.ts'),
      )};
const fixture = JSON.parse(readFileSync(process.argv[2], 'utf8'));
fixture.authority.admit = ({ bytes, locator }) => {
  const packet = JSON.parse(bytes);
  const expected = packet.lane_id + '/' + packet.lesson_id.toLowerCase();
  const pass = locator === expected;
  return {
    admission: pass ? 'ADMITTED' : 'REJECTED',
    semantic_validation: {
      validator: 'PACKET_SEMANTICS_V1',
      status: pass ? 'PASS' : 'FAIL',
      error_count: pass ? 0 : 1,
    },
  };
};
publishPacketBatchForTesting({
  ...fixture,
  publish: true,
  ownerToken: 'crash-owner',
  now: () => 0,
  fault: (observed) => {
    if (observed === process.argv[3]) process.kill(process.pid, 'SIGKILL');
  },
});
`,
    );

    const child = spawnSync(
      join(REPO_ROOT, 'tools/content-cli/node_modules/.bin/tsx'),
      [childPath, fixturePath, point],
      { cwd: REPO_ROOT },
    );
    expect(
      child.signal === 'SIGKILL' || child.status === 137,
      `${child.stderr.toString()}\nstatus=${String(child.status)} signal=${String(child.signal)}`,
    ).toBe(true);
    const destination = join(fixture.repositoryRoot, PACKET_ROOT);
    if (point === 'AFTER_RENAME') {
      expect(readdirSync(destination)).toHaveLength(112);
    } else {
      expect(existsSync(destination)).toBe(false);
    }

    const recovered = publishPacketBatchForTesting({
      ...fixture,
      publish: true,
      now: () => 300_001,
      ownerToken: 'recovery-owner',
    });
    expect(recovered.status).toBe(point === 'AFTER_RENAME' ? 'ALREADY_PUBLISHED' : 'PUBLISHED');
    expect(
      readdirSync(join(fixture.repositoryRoot, 'content/lesson-factory')).filter((name) =>
        name.startsWith('.packets.'),
      ),
    ).toEqual([]);
  });

  it.each(['byte mismatch', 'missing file', 'extra file', 'manifest tamper', 'symlink'])(
    'never replaces an existing publication with %s',
    (mode) => {
      const fixture = syntheticFixture(`existing-${mode.replaceAll(' ', '-')}`);
      publishPacketBatchForTesting({ ...fixture, publish: true });
      const root = join(fixture.repositoryRoot, PACKET_ROOT);
      const firstLesson = fixture.authority.expectedLessonIds[0]!;
      const firstFile = join(root, firstLesson, 'task-source-packet.json');
      if (mode === 'byte mismatch') writeFileSync(firstFile, '{}\n');
      if (mode === 'missing file') rmSync(firstFile);
      if (mode === 'extra file') writeFileSync(join(root, 'extra.json'), '{}\n');
      if (mode === 'manifest tamper') {
        writeFileSync(join(root, 'packet-set-manifest.json'), '{}\n');
      }
      if (mode === 'symlink') {
        rmSync(firstFile);
        symlinkSync(join(root, 'packet-set-manifest.json'), firstFile);
      }

      expect(() => publishPacketBatchForTesting({ ...fixture, publish: true })).toThrow();
      expect(lstatSync(root).isDirectory()).toBe(true);
    },
  );

  it('rejects a live concurrent lock and recovers only an expired dead-owner lock', () => {
    const fixture = syntheticFixture('lock');
    const lockRoot = join(fixture.repositoryRoot, 'content/lesson-factory/.packets.publish.lock');
    mkdirSync(lockRoot);
    writeFileSync(
      join(lockRoot, 'owner.json'),
      JSON.stringify({
        token: 'other-owner',
        pid: process.pid,
        lease_expires_at_ms: Date.now() + 60_000,
      }),
    );
    expect(() => publishPacketBatchForTesting({ ...fixture, publish: true })).toThrow(/lock/i);
    rmSync(lockRoot, { recursive: true });
    mkdirSync(lockRoot);
    writeFileSync(
      join(lockRoot, 'owner.json'),
      JSON.stringify({
        token: 'dead-owner',
        pid: 2_147_483_647,
        lease_expires_at_ms: Date.now() - 1,
      }),
    );

    expect(publishPacketBatchForTesting({ ...fixture, publish: true }).status).toBe('PUBLISHED');
  });
});

describe('production packet publication integration', () => {
  it('publishes only narrow packet functions without kit or canonicalJson exports', () => {
    const indexSource = readFileSync(
      join(REPO_ROOT, 'packages/content/src/lesson-factory/packets.ts'),
      'utf8',
    );

    expect(indexSource).toContain('preflightProductionPacketPublication');
    expect(indexSource).toContain('publishProductionPacketPublication');
    expect(indexSource).not.toMatch(/export\s+\*\s+from/);
    expect(indexSource).not.toMatch(/\bcanonicalJson\b/);
    expect(indexSource).not.toMatch(/\bkit-(?:factory|production)\b/);
  });

  it('blocks the current real preflight until the authority closure is committed', () => {
    expectSourceTreeRefusal(() =>
      preflightProductionPacketPublication({ repositoryRoot: REPO_ROOT }),
    );
    expect(existsSync(join(REPO_ROOT, PACKET_ROOT))).toBe(false);
  });

  it('rejects arbitrary packet writer flags at the CLI boundary', () => {
    const cli = spawnSync(
      join(REPO_ROOT, 'tools/content-cli/node_modules/.bin/tsx'),
      [
        join(REPO_ROOT, 'tools/content-cli/src/entry.ts'),
        '--',
        'lesson-factory',
        'packets',
        'emit',
        '--root',
        '/tmp/not-allowed',
      ],
      { cwd: REPO_ROOT, encoding: 'utf8' },
    );

    expect(cli.status).not.toBe(0);
    expect(`${cli.stdout}${cli.stderr}`).toMatch(/unsupported|usage/i);
  });

  it.each([
    [
      'start -- lesson-factory packets emit',
      'entry.ts',
      ['--', 'lesson-factory', 'packets', 'emit'],
    ],
    [
      'packets -- lesson-factory packets emit',
      'packet-main.ts',
      ['--', 'lesson-factory', 'packets', 'emit'],
    ],
  ])(
    'reports SOURCE_TREE_NOT_COMMITTED safely for `%s`',
    (_label, entry, args) => {
      const destination = join(REPO_ROOT, PACKET_ROOT);
      expect(existsSync(destination)).toBe(false);
      const cli = spawnSync(
        join(REPO_ROOT, 'tools/content-cli/node_modules/.bin/tsx'),
        [join(REPO_ROOT, 'tools/content-cli/src', entry), ...args],
        { cwd: REPO_ROOT, encoding: 'utf8', timeout: 120_000 },
      );

      expect(cli.status).not.toBe(0);
      const output = JSON.parse(cli.stderr.trim()) as JsonObject;
      expect(output).toMatchObject({
        status: 'ERROR',
        code: 'SOURCE_TREE_NOT_COMMITTED',
      });
      expect(JSON.stringify(output)).not.toMatch(/packet content|exact_text|raw_passage_text/i);
      expect(existsSync(destination)).toBe(false);
    },
    120_000,
  );

  it.each([
    ['entry.ts', ['--', '--', 'lesson-factory', 'packets', 'emit']],
    ['entry.ts', ['--', 'lesson-factory', '--', 'packets', 'emit']],
    ['packet-main.ts', ['lesson-factory', 'packets', '--', 'emit']],
  ])('fails closed on unsupported separator placement through %s', (entry, args) => {
    const cli = spawnSync(
      join(REPO_ROOT, 'tools/content-cli/node_modules/.bin/tsx'),
      [join(REPO_ROOT, 'tools/content-cli/src', entry), ...args],
      { cwd: REPO_ROOT, encoding: 'utf8' },
    );

    expect(cli.status).toBe(2);
    expect(JSON.parse(cli.stderr.trim())).toMatchObject({
      status: 'ERROR',
      code: 'UNSUPPORTED_ARGUMENTS',
    });
    expect(existsSync(join(REPO_ROOT, PACKET_ROOT))).toBe(false);
  });
});
