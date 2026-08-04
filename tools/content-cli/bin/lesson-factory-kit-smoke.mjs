#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';

const MODES = new Set(['bootstrap', 'install', 'one-template']);
const GENERATION_TWO_STATIC_PATHS = [
  'AUTHOR-INSTRUCTIONS.md',
  'JUDGE-INSTRUCTIONS.md',
  'README.md',
  'commands/bootstrap.txt',
  'commands/kit-command.mjs',
  'commands/package-handoff.txt',
  'commands/validate-assignment.txt',
  'commands/validate-one.txt',
  'deadline-profile/lifecycle-and-nonclaims.json',
  'deadline-profile/rubric-profile.json',
  'deadline-profile/source-use-receipt.json',
  'deadline-profile/standard-only-release-policy.json',
  'docs/05-LESSON-STRUCTURAL-AUTHORING-SPEC.md',
  'docs/06-LESSON-AUTHORING-WORKFLOW.md',
  'docs/autonomous-lesson-authoring-context.md',
  'docs/lesson-evidence-mastery-contract.md',
  'docs/lesson-quality-author-protocol.md',
  'docs/lesson-quality-rubric.md',
  'handoff/LESSON-HANDOFF-TEMPLATE.json',
  'handoff/TEAM-HANDOFF-TEMPLATE.json',
  'handoff/WAVE-HANDOFF-TEMPLATE.json',
  'judge-docs/lesson-quality-evidence-protocol.md',
  'judge-docs/lesson-quality-judge-protocol.md',
  'schemas/assignment-manifest.schema.json',
  'schemas/assignment-partition-proof.schema.json',
  'schemas/candidate-quality-ledger.schema.json',
  'schemas/deadline-profile.schema.json',
  'schemas/kit-manifest.schema.json',
  'schemas/lesson-bundle.schema.json',
  'schemas/lesson-handoff.schema.json',
  'schemas/lifecycle-nonclaims.schema.json',
  'schemas/owner-source-use-receipt.schema.json',
  'schemas/release-policy.schema.json',
  'schemas/shared-vocabulary.schema.json',
  'schemas/task-source-packet.schema.json',
  'schemas/team-handoff.schema.json',
  'template/v3-les-000000/README.md',
  'template/v3-les-000000/artifact-manifest.json',
  'template/v3-les-000000/kc-coverage-matrix.json',
  'template/v3-les-000000/learner-safe-items.json',
  'template/v3-les-000000/lesson-presentation-plan.json',
  'template/v3-les-000000/lesson-quality-report.json',
  'template/v3-les-000000/lesson-script.json',
  'template/v3-les-000000/protected-items.json',
];
const FORBIDDEN_SHARED_PATHS = [
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
];
const args = process.argv.slice(2);

function fail(code) {
  process.stderr.write(`KIT_SMOKE_FAILED ${code}\n`);
  process.exit(1);
}

function canonical(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (typeof value !== 'object') fail('NON_CANONICAL_JSON');
  const entries = Object.entries(value).sort(([left], [right]) => left.localeCompare(right));
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`;
}

function digest(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function run(executable, argv, options = {}) {
  const result = spawnSync(executable, argv, {
    cwd: options.cwd,
    encoding: 'utf8',
    env: options.env ?? process.env,
    maxBuffer: 1024 * 1024,
    shell: false,
    timeout: 60_000,
  });
  return {
    code: result.status ?? 1,
    stderr: result.stderr ?? '',
    stdout: result.stdout ?? '',
  };
}

function confined(root, relativePath) {
  if (
    typeof relativePath !== 'string' ||
    relativePath.length === 0 ||
    relativePath.includes('\\') ||
    relativePath.startsWith('/') ||
    relativePath.split('/').includes('..')
  ) {
    fail('UNSAFE_PATH');
  }
  const path = resolve(root, relativePath);
  if (!path.startsWith(`${root}${sep}`)) fail('PATH_ESCAPE');
  return path;
}

async function readJson(path, code) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    fail(code);
  }
}

if (
  args.length !== 4 ||
  args[0] !== 'content' ||
  args[1] !== 'lesson-factory' ||
  args[2] !== 'kit-smoke' ||
  !MODES.has(args[3])
) {
  fail('UNSUPPORTED_ARGUMENTS');
}

const mode = args[3];
const root = resolve(process.cwd());
const repositoryRoot = resolve(process.env.REPOSITORY_ROOT ?? '');
const manifestPath = resolve(root, 'KIT-MANIFEST.json');
const manifestBytes = await readFile(manifestPath).catch(() => fail('MANIFEST_MISSING'));
const manifest = await readJson(manifestPath, 'MANIFEST_INVALID');

if (
  canonical(manifest) + '\n' !== manifestBytes.toString('utf8') ||
  !['wp-03-kit-manifest/1', 'lesson-generation-kit-v1/2'].includes(manifest.format) ||
  !['team-A', 'team-B'].includes(manifest.teamId) ||
  typeof manifest.assignmentId !== 'string' ||
  !Array.isArray(manifest.allowedLessonIds) ||
  new Set(manifest.allowedLessonIds).size !== 30 ||
  manifest.packetCount !== 30 ||
  !Array.isArray(manifest.files) ||
  !Array.isArray(manifest.allowedPaths) ||
  canonical(manifest.allowedPaths) !== canonical(manifest.files.map((file) => file.path))
) {
  fail('MANIFEST_INVALID');
}

const packets = manifest.files.filter((file) => file.kind === 'packet');
const assignments = manifest.files.filter((file) => file.kind === 'assignment');
if (packets.length !== 30 || assignments.length !== 1) fail('MANIFEST_CLOSURE');

const generationTwo = manifest.format === 'lesson-generation-kit-v1/2';
if (generationTwo) {
  const observedStatic = manifest.files
    .filter((file) => ['core', 'team-metadata'].includes(file.kind))
    .map((file) => file.path)
    .sort();
  if (
    manifest.generation !== 2 ||
    manifest.files.length !== 75 ||
    manifest.allowedPaths.length !== 75 ||
    canonical(observedStatic) !== canonical(GENERATION_TWO_STATIC_PATHS) ||
    !Array.isArray(manifest.sourceMappings) ||
    manifest.sourceMappings.length !== 44 ||
    !Array.isArray(manifest.readOrder) ||
    manifest.readOrder.length !== 10 ||
    manifest.nonclaims?.officialRubricPass !== false ||
    manifest.nonclaims?.humanApproved !== false ||
    manifest.nonclaims?.publicationApproved !== false
  ) {
    fail('GENERATION_TWO_INVENTORY_INVALID');
  }
  if (
    manifest.repositoryUrl !== 'https://github.com/jsonjj/mcat-prep.git' ||
    manifest.repositoryCommit !== manifest.pins.repositoryCommit ||
    manifest.allowedOutputRoot !== `content/lesson-candidates/${manifest.teamId}` ||
    manifest.branchConvention !== `lesson-factory/${manifest.teamId}/wave-<nn>` ||
    manifest.handoffEndpoint !== `branches:${manifest.branchConvention}` ||
    manifest.lifecycle !== 'CANDIDATE_RUBRIC_SCREENED' ||
    manifest.runtimeRequirements?.nodeMajorMinimum !== 20 ||
    manifest.runtimeRequirements?.packageManager !== 'pnpm@9.15.9' ||
    manifest.runtimeRequirements?.installPolicy !== 'FROZEN_OFFLINE_IGNORE_SCRIPTS' ||
    manifest.filesSha256 !== digest(Buffer.from(canonical(manifest.files))) ||
    manifest.deterministicInstallCommand !==
      'corepack pnpm install --frozen-lockfile --offline --ignore-scripts' ||
    !Array.isArray(manifest.validatorAuthority?.files) ||
    manifest.validatorAuthority.files.length === 0 ||
    manifest.validatorAuthority.aggregateSha256 !==
      digest(Buffer.from(canonical(manifest.validatorAuthority.files))) ||
    canonical(manifest.forbiddenSharedPaths) !== canonical(FORBIDDEN_SHARED_PATHS)
  ) {
    fail('GENERATION_TWO_AUTHORITY_INVALID');
  }
  const byPath = new Map(manifest.files.map((file) => [file.path, file]));
  for (const mapping of manifest.sourceMappings) {
    const file = byPath.get(mapping.archivePath);
    if (
      file === undefined ||
      mapping.archiveSha256 !== file.sha256 ||
      mapping.sourcePath !== file.sourcePath ||
      mapping.sourceSha256 !== file.sourceSha256 ||
      !/^[0-9a-f]{64}$/.test(mapping.sourceSha256)
    ) {
      fail('SOURCE_MAPPING_INVALID');
    }
  }
  for (const validator of manifest.validatorAuthority.files) {
    const bytes = await readFile(confined(repositoryRoot, validator.path)).catch(() =>
      fail('VALIDATOR_SOURCE_MISSING'),
    );
    if (digest(bytes) !== validator.sha256 || validator.gitBlobSha256 !== validator.sha256) {
      fail('VALIDATOR_SOURCE_HASH_MISMATCH');
    }
  }
}

if (generationTwo && mode === 'bootstrap') {
  const git = run('/usr/bin/git', ['-C', repositoryRoot, 'rev-parse', 'HEAD']);
  const helperCheck = run(process.execPath, [
    '--check',
    confined(root, 'commands/kit-command.mjs'),
  ]);
  if (
    git.code !== 0 ||
    git.stdout.trim() !== manifest.validatorAuthority.repositoryCommit ||
    helperCheck.code !== 0
  ) {
    fail('BOOTSTRAP_OPERATION_FAILED');
  }
}

for (const file of manifest.files) {
  const path = confined(root, file.path);
  const info = await stat(path).catch(() => fail('FILE_MISSING'));
  if (!info.isFile()) fail('NON_REGULAR_FILE');
  const bytes = await readFile(path);
  if (
    !/^[0-9a-f]{64}$/.test(file.sha256) ||
    digest(bytes) !== file.sha256 ||
    bytes.length !== file.size
  ) {
    fail('FILE_HASH_MISMATCH');
  }
  if (file.path.endsWith('.json')) await readJson(path, 'JSON_INVALID');
  if (generationTwo && file.path.startsWith('commands/') && (info.mode & 0o777) !== 0o755) {
    fail('COMMAND_MODE_INVALID');
  }
}

const assignment = await readJson(confined(root, assignments[0].path), 'ASSIGNMENT_INVALID');
const assignmentIdentity = assignment.projection ?? assignment;
if (
  (assignmentIdentity.assignment_id ?? assignmentIdentity.assignmentId) !== manifest.assignmentId ||
  !(
    (Array.isArray(assignment.assignments) && assignment.assignments.length === 30) ||
    (Array.isArray(assignmentIdentity.bindings) && assignmentIdentity.bindings.length === 30)
  )
) {
  fail('ASSIGNMENT_INVALID');
}

for (const packetFile of packets) {
  const packet = await readJson(confined(root, packetFile.path), 'PACKET_INVALID');
  const packetIdentity = packet.projection ?? packet;
  if (
    (packetIdentity.assignment_id ?? packetIdentity.assignmentId) !== manifest.assignmentId ||
    (packetIdentity.team_id ?? packetIdentity.teamId) !== manifest.teamId ||
    (packetIdentity.lane_id ?? packetIdentity.laneId) !== manifest.laneId ||
    !manifest.allowedLessonIds.includes(packetIdentity.lesson_id ?? packetIdentity.lessonId)
  ) {
    fail('PACKET_INVALID');
  }
}

if (mode === 'install') {
  const forbidden = manifest.files.some(
    (file) =>
      file.path === 'package.json' ||
      file.path.startsWith('node_modules/') ||
      /(?:^|\/)(?:package-lock|pnpm-lock|yarn\.lock)/.test(file.path),
  );
  if (forbidden) fail('INSTALL_STATE_NOT_SELF_CONTAINED');
  if (generationTwo) {
    const corepack = join(dirname(process.execPath), 'corepack');
    const install = run(
      corepack,
      ['pnpm', 'install', '--frozen-lockfile', '--offline', '--ignore-scripts'],
      {
        cwd: repositoryRoot,
        env: { ...process.env, CI: '1', COREPACK_ENABLE_DOWNLOAD_PROMPT: '0' },
      },
    );
    if (install.code !== 0) fail('FROZEN_INSTALL_FAILED');
  }
}

if (mode === 'one-template') {
  const templatePath = generationTwo
    ? 'template/v3-les-000000/lesson-script.json'
    : manifest.files.find(
        (file) =>
          file.kind === 'core' &&
          file.path.startsWith('docs/lesson-authoring/template/') &&
          file.path.endsWith('.json'),
      )?.path;
  if (templatePath === undefined) fail('TEMPLATE_MISSING');
  const template = await readJson(confined(root, templatePath), 'TEMPLATE_INVALID');
  if (generationTwo && (template === null || typeof template !== 'object')) {
    fail('TEMPLATE_INVALID');
  }
  await readJson(confined(root, packets[0].path), 'PACKET_INVALID');
  if (generationTwo) {
    const temporaryRoot = await mkdtemp(join(tmpdir(), 'wp03-kit-smoke-'));
    try {
      const lessonId = 'V3-LES-789208';
      const candidate = join(temporaryRoot, lessonId);
      await mkdir(candidate, { mode: 0o700 });
      const source = join(repositoryRoot, 'content/lessons/v3-les-789208');
      for (const name of (await readdir(source)).filter((entry) => entry.endsWith('.json'))) {
        await writeFile(join(candidate, name), await readFile(join(source, name)), {
          mode: 0o600,
        });
      }
      const tsxCli = join(repositoryRoot, 'tools/content-cli/node_modules/tsx/dist/cli.mjs');
      const cli = join(repositoryRoot, 'tools/content-cli/src/entry.ts');
      const valid = run(
        process.execPath,
        [tsxCli, cli, 'candidate-validate', candidate, '--json'],
        { cwd: repositoryRoot },
      );
      let validReport;
      try {
        validReport = JSON.parse(valid.stdout.trim());
      } catch {
        fail('SEMANTIC_VALIDATION_OUTPUT_INVALID');
      }
      if (
        valid.code !== 0 ||
        validReport?.structural?.ok !== true ||
        validReport?.computedQuality?.ok !== true ||
        validReport?.normalization?.ok !== true
      ) {
        fail('SEMANTIC_TEMPLATE_VALIDATION_FAILED');
      }
      const learnerPath = join(candidate, 'learner-safe-items.json');
      await writeFile(learnerPath, `${canonical({ malformedProjection: true })}\n`, {
        mode: 0o600,
      });
      const invalid = run(
        process.execPath,
        [tsxCli, cli, 'candidate-validate', candidate, '--json'],
        { cwd: repositoryRoot },
      );
      if (invalid.code === 0) fail('SEMANTIC_FAILURE_NOT_REJECTED');
      const helper = confined(root, 'commands/kit-command.mjs');
      for (const command of ['validate-assignment', 'package-handoff']) {
        const controlled = run(
          process.execPath,
          [helper, command, '--repository-root', repositoryRoot],
          {
            cwd: root,
            env: {
              ...process.env,
              KIT_ROOT: root,
              REPOSITORY_ROOT: repositoryRoot,
            },
          },
        );
        if (controlled.code === 0) fail('CONTROLLED_HANDOFF_FAILURE_NOT_REJECTED');
      }
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  }
}

if (generationTwo) {
  const teamHandoff = await readJson(
    confined(root, 'handoff/TEAM-HANDOFF-TEMPLATE.json'),
    'HANDOFF_TEMPLATE_INVALID',
  );
  const lessonHandoff = await readJson(
    confined(root, 'handoff/LESSON-HANDOFF-TEMPLATE.json'),
    'HANDOFF_TEMPLATE_INVALID',
  );
  const waveHandoff = await readJson(
    confined(root, 'handoff/WAVE-HANDOFF-TEMPLATE.json'),
    'HANDOFF_TEMPLATE_INVALID',
  );
  if (
    teamHandoff.format !== 'lesson-generation-team-handoff/1' ||
    teamHandoff.expectedRowCount !== 30 ||
    !Array.isArray(teamHandoff.rows) ||
    teamHandoff.rows.length !== 30 ||
    lessonHandoff.format !== 'lesson-generation-lesson-handoff/2' ||
    lessonHandoff.requestedStatus !== 'COMPLETE' ||
    lessonHandoff.status !== 'BLOCKED' ||
    lessonHandoff.lifecycle !== 'CANDIDATE_VALIDATION_BLOCKED' ||
    canonical(lessonHandoff.unresolvedBlockerCodes) !== canonical(['VALIDATION_PENDING']) ||
    waveHandoff.format !== 'lesson-generation-wave-handoff/1'
  ) {
    fail('HANDOFF_TEMPLATE_INVALID');
  }
  const commands = new Map();
  for (const path of [
    'commands/bootstrap.txt',
    'commands/package-handoff.txt',
    'commands/validate-assignment.txt',
    'commands/validate-one.txt',
  ]) {
    commands.set(path, await readFile(confined(root, path), 'utf8'));
  }
  if (
    !commands.get('commands/bootstrap.txt').includes('kit-command.mjs" bootstrap ') ||
    !commands.get('commands/validate-one.txt').includes('kit-command.mjs" validate-one ') ||
    !commands
      .get('commands/validate-assignment.txt')
      .includes('kit-command.mjs" validate-assignment ') ||
    !commands.get('commands/package-handoff.txt').includes('kit-command.mjs" package-handoff ')
  ) {
    fail('COMMAND_SPEC_INVALID');
  }
  const readme = await readFile(confined(root, 'README.md'), 'utf8');
  if (
    !readme.includes(`Repository commit: \`${manifest.pins.repositoryCommit}\``) ||
    !readme.includes(`Team: \`${manifest.teamId}\``) ||
    readme.includes('{{')
  ) {
    fail('README_PIN_INVALID');
  }
}

process.stdout.write(`KIT_SMOKE_OK ${mode}\n`);
