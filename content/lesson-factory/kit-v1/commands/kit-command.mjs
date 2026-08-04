#!/usr/bin/env node

import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { lstat, mkdir, readFile, readdir, realpath, rename, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const KIT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const GIT_EXECUTABLE = '/usr/bin/git';
const MODES = new Set(['bootstrap', 'validate-one', 'validate-assignment', 'package-handoff']);
const LESSON_ROOT_FILES = [
  'lesson-script.json',
  'kc-coverage-matrix.json',
  'lesson-presentation-plan.json',
  'lesson-quality-report.json',
  'learner-safe-items.json',
  'protected-items.json',
  'source-claim-ledger.json',
  'artifact-manifest.json',
  'candidate-quality-ledger.json',
  'LESSON-HANDOFF.json',
];
const LESSON_EVIDENCE_FILES = [
  'inputs/task-source-packet.json',
  'validation/lesson-validate.json',
  'validation/computed-quality.json',
  'validation/normalization-smoke.json',
  'validation/protected-scan.json',
  'reviews/author-self-audit.json',
  'reviews/judge-pre-screen.json',
];
const REQUIRED_LESSON_FILES = [...LESSON_ROOT_FILES, ...LESSON_EVIDENCE_FILES].sort();
const MECHANICAL_RECEIPTS = [
  'validation/lesson-validate.json',
  'validation/computed-quality.json',
  'validation/normalization-smoke.json',
  'validation/protected-scan.json',
];
const PRIMARY_ARTIFACTS = [
  'lesson-script.json',
  'kc-coverage-matrix.json',
  'lesson-presentation-plan.json',
  'lesson-quality-report.json',
];
const VALIDATE_ONE_INPUTS = [...LESSON_ROOT_FILES, 'inputs/task-source-packet.json'].sort();
const HASHED_LESSON_FILES = REQUIRED_LESSON_FILES.filter(
  (path) => path !== 'artifact-manifest.json' && path !== 'LESSON-HANDOFF.json',
);
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

function fail(code) {
  process.stderr.write(`KIT_COMMAND_FAILED ${code}\n`);
  process.exit(1);
}

function canonical(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (typeof value !== 'object') fail('NON_CANONICAL_JSON');
  return `{${Object.entries(value)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
    .join(',')}}`;
}

function digest(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function confined(root, path) {
  if (
    typeof path !== 'string' ||
    path.length === 0 ||
    isAbsolute(path) ||
    path.includes('\\') ||
    path.split('/').includes('..')
  ) {
    fail('UNSAFE_PATH');
  }
  const target = resolve(root, path);
  if (!target.startsWith(`${resolve(root)}${sep}`)) fail('PATH_ESCAPE');
  return target;
}

async function readJson(path, code = 'JSON_INVALID') {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    fail(code);
  }
}

async function writeCanonical(path, value) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.tmp-${process.pid}`;
  await writeFile(temporary, `${canonical(value)}\n`, { mode: 0o600 });
  await rename(temporary, path);
}

function git(repositoryRoot, args) {
  try {
    return execFileSync(GIT_EXECUTABLE, ['-C', repositoryRoot, ...args], {
      encoding: 'utf8',
      shell: false,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    fail('REPOSITORY_STATE_INVALID');
  }
}

async function loadContext(repositoryRoot) {
  const manifestPath = join(KIT_ROOT, 'KIT-MANIFEST.json');
  const manifestBytes = await readFile(manifestPath).catch(() => fail('MANIFEST_MISSING'));
  const manifest = await readJson(manifestPath, 'MANIFEST_INVALID');
  const fixtureMode =
    (await readJson(join(resolve(repositoryRoot), 'package.json'))).name ===
    'wp03-generation-two-command-fixture';
  if (
    `${canonical(manifest)}\n` !== manifestBytes.toString('utf8') ||
    manifest.format !== 'lesson-generation-kit-v1/2' ||
    manifest.repositoryUrl !== 'https://github.com/jsonjj/mcat-prep.git' ||
    manifest.lifecycle !== 'CANDIDATE_RUBRIC_SCREENED' ||
    manifest.allowedOutputRoot !== `content/lesson-candidates/${manifest.teamId}` ||
    manifest.branchConvention !== `lesson-factory/${manifest.teamId}/wave-<nn>` ||
    manifest.handoffEndpoint !== `branches:${manifest.branchConvention}` ||
    manifest.deterministicInstallCommand !==
      'corepack pnpm install --frozen-lockfile --offline --ignore-scripts' ||
    manifest.runtimeRequirements?.nodeMajorMinimum !== 20 ||
    manifest.runtimeRequirements?.packageManager !== 'pnpm@9.15.9' ||
    manifest.runtimeRequirements?.installPolicy !== 'FROZEN_OFFLINE_IGNORE_SCRIPTS' ||
    (!fixtureMode &&
      manifest.validatorAuthority?.repositoryCommit !== manifest.pins.repositoryCommit) ||
    !Array.isArray(manifest.validatorAuthority?.files) ||
    manifest.validatorAuthority.files.length === 0 ||
    manifest.validatorAuthority.aggregateSha256 !==
      digest(Buffer.from(canonical(manifest.validatorAuthority.files))) ||
    canonical(manifest.forbiddenSharedPaths) !== canonical(FORBIDDEN_SHARED_PATHS) ||
    !Array.isArray(manifest.files) ||
    manifest.filesSha256 !== digest(Buffer.from(canonical(manifest.files))) ||
    !Array.isArray(manifest.allowedLessonIds) ||
    manifest.allowedLessonIds.length !== 30 ||
    new Set(manifest.allowedLessonIds).size !== 30
  ) {
    fail('MANIFEST_AUTHORITY_INVALID');
  }
  const allowedPaths = manifest.files.map((file) => file.path);
  if (
    canonical(manifest.allowedPaths) !== canonical(allowedPaths) ||
    canonical([...allowedPaths].sort()) !== canonical(allowedPaths)
  ) {
    fail('MANIFEST_CLOSURE_INVALID');
  }
  for (const file of manifest.files) {
    const path = confined(KIT_ROOT, file.path);
    const info = await lstat(path).catch(() => fail('KIT_FILE_MISSING'));
    if (!info.isFile() || info.isSymbolicLink() || (info.mode & 0o777) !== file.mode) {
      fail('KIT_FILE_IDENTITY_INVALID');
    }
    const bytes = await readFile(path);
    if (bytes.length !== file.size || digest(bytes) !== file.sha256) {
      fail('KIT_FILE_HASH_INVALID');
    }
  }
  const repository = resolve(repositoryRoot);
  const outputRoot = confined(repository, manifest.allowedOutputRoot);
  return { fixtureMode, manifest, repository, outputRoot };
}

async function verifyValidatorAuthority(context) {
  const validatorRoot = resolve(
    await realpath(join(context.repository, 'tools/content-cli')),
    '..',
    '..',
  );
  const authority = context.manifest.validatorAuthority;
  if (git(validatorRoot, ['rev-parse', 'HEAD']) !== authority.repositoryCommit) {
    fail('VALIDATOR_COMMIT_MISMATCH');
  }
  for (const file of authority.files) {
    const bytes = await readFile(confined(validatorRoot, file.path)).catch(() =>
      fail('VALIDATOR_SOURCE_MISSING'),
    );
    if (digest(bytes) !== file.sha256) fail('VALIDATOR_SOURCE_HASH_MISMATCH');
    if (!context.fixtureMode) {
      if (git(validatorRoot, ['status', '--porcelain', '--', file.path]) !== '') {
        fail('VALIDATOR_SOURCE_DIRTY');
      }
      let committed;
      try {
        committed = execFileSync(
          GIT_EXECUTABLE,
          ['-C', validatorRoot, 'show', `HEAD:${file.path}`],
          {
            encoding: 'buffer',
            shell: false,
            stdio: ['ignore', 'pipe', 'ignore'],
          },
        );
      } catch {
        fail('VALIDATOR_SOURCE_UNTRACKED');
      }
      if (digest(committed) !== file.gitBlobSha256 || file.gitBlobSha256 !== file.sha256) {
        fail('VALIDATOR_COMMITTED_BLOB_MISMATCH');
      }
    }
  }
  return authority;
}

function verifyRepository(context, performInstall = false) {
  const { manifest, repository } = context;
  if (git(repository, ['rev-parse', 'HEAD']) !== manifest.pins.repositoryCommit) {
    fail('REPOSITORY_COMMIT_MISMATCH');
  }
  if (git(repository, ['remote', 'get-url', 'origin']) !== manifest.repositoryUrl) {
    fail('REPOSITORY_URL_MISMATCH');
  }
  const packageManager = execFileSync(
    process.execPath,
    [
      '-e',
      'process.stdout.write(require(process.argv[1]).packageManager)',
      join(repository, 'package.json'),
    ],
    {
      encoding: 'utf8',
      shell: false,
    },
  );
  if (packageManager !== manifest.runtimeRequirements.packageManager) {
    fail('PACKAGE_MANAGER_MISMATCH');
  }
  const nodeMajor = Number(process.versions.node.split('.')[0]);
  if (nodeMajor < manifest.runtimeRequirements.nodeMajorMinimum) {
    fail('NODE_RUNTIME_UNSUPPORTED');
  }
  const forbiddenStatus = git(repository, [
    'status',
    '--porcelain',
    '--',
    ...manifest.forbiddenSharedPaths,
  ]);
  if (forbiddenStatus !== '') fail('FORBIDDEN_SHARED_PATH_DIRTY');
  try {
    execFileSync(process.execPath, ['--check', join(KIT_ROOT, 'commands/kit-command.mjs')], {
      shell: false,
      stdio: 'ignore',
    });
  } catch {
    fail('BOOTSTRAP_HELPER_INVALID');
  }
  if (performInstall) {
    const corepack = join(dirname(process.execPath), 'corepack');
    try {
      execFileSync(
        corepack,
        ['pnpm', 'install', '--frozen-lockfile', '--offline', '--ignore-scripts'],
        {
          cwd: repository,
          env: { ...process.env, COREPACK_ENABLE_DOWNLOAD_PROMPT: '0' },
          shell: false,
          stdio: 'ignore',
        },
      );
    } catch {
      fail('FROZEN_INSTALL_FAILED');
    }
    if (git(repository, ['status', '--porcelain', '--', 'package.json', 'pnpm-lock.yaml']) !== '') {
      fail('FROZEN_INSTALL_MUTATED_PINS');
    }
  }
}

async function requireRegularFiles(root, paths) {
  for (const path of paths) {
    const absolute = confined(root, path);
    const info = await lstat(absolute).catch(() => fail('REQUIRED_ARTIFACT_MISSING'));
    if (!info.isFile() || info.isSymbolicLink()) fail('REQUIRED_ARTIFACT_INVALID');
  }
}

async function verifyCandidatePath(context, offered) {
  if (typeof offered !== 'string' || offered.length === 0) fail('LESSON_DIRECTORY_REQUIRED');
  const candidate = resolve(context.repository, offered);
  const outputReal = await realpath(context.outputRoot).catch(() => fail('OUTPUT_ROOT_MISSING'));
  const candidateReal = await realpath(candidate).catch(() => fail('LESSON_DIRECTORY_MISSING'));
  if (!candidateReal.startsWith(`${outputReal}${sep}`)) fail('LESSON_PATH_FORBIDDEN');
  const lessonId = relative(outputReal, candidateReal);
  if (lessonId.includes(sep) || !context.manifest.allowedLessonIds.includes(lessonId)) {
    fail('LESSON_ID_NOT_ASSIGNED');
  }
  await requireRegularFiles(candidateReal, VALIDATE_ONE_INPUTS);
  return { candidate: candidateReal, lessonId };
}

function packetIdentity(packet) {
  return packet.projection ?? packet;
}

function exactKeys(record, expected) {
  return (
    record !== null &&
    typeof record === 'object' &&
    !Array.isArray(record) &&
    canonical(Object.keys(record).sort()) === canonical([...expected].sort())
  );
}

async function existingJson(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    return null;
  }
}

async function hashes(candidate, paths) {
  const values = [];
  for (const path of paths) {
    const bytes = await readFile(confined(candidate, path));
    values.push({ path, sha256: digest(bytes), size: bytes.length });
  }
  return values;
}

function runCandidateValidator(context, candidate) {
  const cliPath = join(context.repository, 'tools/content-cli/src/entry.ts');
  const cliMainPath = join(context.repository, 'tools/content-cli/src/main.ts');
  const tsxCliPath = join(context.repository, 'tools/content-cli/node_modules/tsx/dist/cli.mjs');
  const argv = [tsxCliPath, cliPath, 'candidate-validate', candidate, '--json'];
  const started = Date.now();
  const result = spawnSync(process.execPath, argv, {
    cwd: context.repository,
    encoding: 'utf8',
    env: process.env,
    maxBuffer: 1024 * 1024,
    shell: false,
    timeout: 30_000,
  });
  const stdout = result.stdout ?? '';
  const stderr = result.stderr ?? '';
  let report = null;
  try {
    report = JSON.parse(stdout.trim());
  } catch {
    report = null;
  }
  return {
    command: {
      argv: [
        'node',
        'tools/content-cli/node_modules/tsx/dist/cli.mjs',
        'tools/content-cli/src/entry.ts',
        'candidate-validate',
        '<candidate>',
        '--json',
      ],
      cliEntryPath: 'tools/content-cli/src/entry.ts',
      cliEntrySha256: digest(readFileSyncSafe(cliPath)),
      cliMainPath: 'tools/content-cli/src/main.ts',
      cliMainSha256: digest(readFileSyncSafe(cliMainPath)),
      durationMs: Date.now() - started,
      executableSha256: digest(readFileSyncSafe(process.execPath)),
      exitCode: result.status ?? 1,
      signal: result.signal,
      stderrSha256: digest(Buffer.from(stderr)),
      stdoutSha256: digest(Buffer.from(stdout)),
      tsxCliSha256: digest(readFileSyncSafe(tsxCliPath)),
      toolVersion: 'candidate-validate/1',
      validatorAggregateSha256: context.manifest.validatorAuthority.aggregateSha256,
      validatorFiles: context.manifest.validatorAuthority.files,
    },
    report,
    stdout,
    stderr,
  };
}

function readFileSyncSafe(path) {
  try {
    return readFileSync(path);
  } catch {
    fail('PINNED_TOOL_MISSING');
  }
}

function protectedFindings(value, path, findings) {
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
    value.forEach((entry, index) => protectedFindings(entry, `${path}[${index}]`, findings));
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (
      [
        'answerkey',
        'correctanswer',
        'correctchoiceid',
        'correctoptionindex',
        'rationale',
        'scoringrule',
      ].includes(normalized)
    ) {
      findings.push(`${path}:${key}`);
    }
    protectedFindings(child, `${path}.${key}`, findings);
  }
}

async function protectedScan(candidate, commandRun, lessonId) {
  const publicPaths = [
    'learner-safe-items.json',
    'source-claim-ledger.json',
    'candidate-quality-ledger.json',
    ...MECHANICAL_RECEIPTS.slice(0, 3),
  ];
  const findings = [];
  for (const path of publicPaths) {
    protectedFindings(await readJson(join(candidate, path)), path, findings);
  }
  for (const [name, output] of [
    ['stdout', commandRun.stdout],
    ['stderr', commandRun.stderr],
  ]) {
    if (
      /"(?:answer_key|correct_answer|correct_choice_id|correct_option_index|rationale|scoring_rule)"\s*:/i.test(
        output,
      )
    ) {
      findings.push(`command-${name}:PROTECTED_LOG_TOKEN`);
    }
  }
  const protectedBytes = await readFile(join(candidate, 'protected-items.json'));
  const receipt = {
    findings: [...new Set(findings)].sort(),
    format: 'lesson-generation-protected-scan/2',
    lessonId,
    logHashes: {
      stderrSha256: commandRun.command.stderrSha256,
      stdoutSha256: commandRun.command.stdoutSha256,
    },
    protectedArtifact: {
      path: 'protected-items.json',
      sha256: digest(protectedBytes),
      size: protectedBytes.length,
    },
    scannedPathCount: publicPaths.length,
    scannedPaths: publicPaths,
    status: findings.length === 0 ? 'PASS' : 'FAILED',
  };
  await writeCanonical(join(candidate, 'validation/protected-scan.json'), receipt);
  return receipt;
}

async function evidenceRefsValid(candidate, refs) {
  if (!Array.isArray(refs) || refs.length === 0) return false;
  const paths = new Set();
  for (const ref of refs) {
    if (!exactKeys(ref, ['path', 'sha256']) || paths.has(ref.path)) return false;
    paths.add(ref.path);
    try {
      const bytes = await readFile(confined(candidate, ref.path));
      if (digest(bytes) !== ref.sha256) return false;
    } catch {
      return false;
    }
  }
  return true;
}

function validNonclaims(value) {
  return (
    exactKeys(value, ['humanApproved', 'officialRubricPass', 'publicationApproved']) &&
    value.humanApproved === false &&
    value.officialRubricPass === false &&
    value.publicationApproved === false
  );
}

async function reviewBlockers(context, candidate, lessonId, primaryHashes) {
  const blockers = [];
  const audit = await existingJson(join(candidate, 'reviews/author-self-audit.json'));
  const auditKeys = [
    'authorRunId',
    'evidenceRefs',
    'findingCodes',
    'format',
    'lessonId',
    'nonclaims',
    'revisionCycle',
    'status',
  ];
  const auditValid =
    exactKeys(audit, auditKeys) &&
    audit.format === 'lesson-generation-author-self-audit/2' &&
    audit.lessonId === lessonId &&
    typeof audit.authorRunId === 'string' &&
    audit.authorRunId.length > 0 &&
    Number.isInteger(audit.revisionCycle) &&
    audit.revisionCycle >= 0 &&
    audit.revisionCycle <= 2 &&
    Array.isArray(audit.findingCodes) &&
    audit.findingCodes.every((code) => /^[A-Z][A-Z0-9_]{2,63}$/.test(code)) &&
    ['PASS', 'BLOCKED', 'FAILED'].includes(audit.status) &&
    validNonclaims(audit.nonclaims) &&
    (await evidenceRefsValid(candidate, audit.evidenceRefs));
  if (!auditValid)
    blockers.push(audit === null ? 'AUTHOR_SELF_AUDIT_REQUIRED' : 'AUTHOR_SELF_AUDIT_INVALID');
  else if (audit.status !== 'PASS') blockers.push(`AUTHOR_SELF_AUDIT_${audit.status}`);

  const judge = await existingJson(join(candidate, 'reviews/judge-pre-screen.json'));
  const judgeKeys = [
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
  ];
  const rubricSha256 = digest(
    await readFile(join(KIT_ROOT, 'deadline-profile/rubric-profile.json')),
  );
  const judgeValid =
    exactKeys(judge, judgeKeys) &&
    judge.format === 'lesson-generation-judge-pre-screen/2' &&
    judge.lessonId === lessonId &&
    judge.reviewerRole === 'INDEPENDENT_JUDGE' &&
    typeof judge.reviewerRunId === 'string' &&
    judge.reviewerRunId.length > 0 &&
    auditValid &&
    judge.reviewerRunId !== audit.authorRunId &&
    judge.authorVerdictReceived === false &&
    canonical(judge.reviewedPrimaryArtifacts) === canonical(primaryHashes) &&
    judge.rubricProfileSha256 === rubricSha256 &&
    Array.isArray(judge.findingCodes) &&
    judge.findingCodes.every((code) => /^[A-Z][A-Z0-9_]{2,63}$/.test(code)) &&
    ['SCREENED', 'BLOCKED', 'FAILED'].includes(judge.status) &&
    validNonclaims(judge.nonclaims) &&
    (await evidenceRefsValid(candidate, judge.evidenceRefs));
  if (!judgeValid)
    blockers.push(judge === null ? 'JUDGE_PRE_SCREEN_REQUIRED' : 'JUDGE_PRE_SCREEN_INVALID');
  else if (judge.status !== 'SCREENED' || judge.findingCodes.length > 0)
    blockers.push(`JUDGE_PRE_SCREEN_${judge.status}`);
  return { audit, auditValid, blockers, judge, judgeValid };
}

async function writeArtifactManifest(candidate, lessonId) {
  const prior = await readJson(join(candidate, 'artifact-manifest.json'));
  const existingPaths = [];
  for (const path of HASHED_LESSON_FILES) {
    try {
      const info = await lstat(join(candidate, path));
      if (info.isFile() && !info.isSymbolicLink()) existingPaths.push(path);
    } catch {
      // Optional judge evidence is absent during the first mechanical stage.
    }
  }
  const kitValidationArtifacts = await hashes(candidate, existingPaths.sort());
  const value = {
    ...prior,
    kit_validation_artifacts: kitValidationArtifacts,
    kit_validation_contract: {
      format: 'lesson-generation-artifact-closure/2',
      lessonId,
      selfExcluded: ['artifact-manifest.json', 'LESSON-HANDOFF.json'],
    },
  };
  const manifestPath = join(candidate, 'artifact-manifest.json');
  const temporary = `${manifestPath}.tmp-${process.pid}`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await rename(temporary, manifestPath);
  return digest(await readFile(join(candidate, 'artifact-manifest.json')));
}

async function updateHandoff(context, candidate, lessonId, blockers, artifactManifestSha256) {
  const handoff = await readJson(join(candidate, 'LESSON-HANDOFF.json'));
  const requestedStatus = handoff.requestedStatus;
  const finalStatus =
    blockers.length === 0 && requestedStatus === 'COMPLETE'
      ? 'COMPLETE'
      : requestedStatus === 'FAILED'
        ? 'FAILED'
        : 'BLOCKED';
  await writeCanonical(join(candidate, 'LESSON-HANDOFF.json'), {
    ...handoff,
    artifactManifestSha256,
    assignmentId: context.manifest.assignmentId,
    format: 'lesson-generation-lesson-handoff/2',
    lessonId,
    lifecycle:
      finalStatus === 'COMPLETE' ? 'CANDIDATE_RUBRIC_SCREENED' : 'CANDIDATE_VALIDATION_BLOCKED',
    nonclaims: {
      humanApproved: false,
      officialRubricPass: false,
      publicationApproved: false,
    },
    packetSha256: digest(await readFile(join(candidate, 'inputs/task-source-packet.json'))),
    repositoryCommit: context.manifest.pins.repositoryCommit,
    status: finalStatus,
    unresolvedBlockerCodes: [...new Set(blockers)].sort(),
  });
  return finalStatus;
}

async function validateOne(context, offered) {
  verifyRepository(context);
  const { candidate, lessonId } = await verifyCandidatePath(context, offered);
  const packet = packetIdentity(
    await readJson(join(candidate, 'inputs/task-source-packet.json'), 'PACKET_INVALID'),
  );
  if (
    (packet.lesson_id ?? packet.lessonId) !== lessonId ||
    (packet.assignment_id ?? packet.assignmentId) !== context.manifest.assignmentId ||
    (packet.team_id ?? packet.teamId) !== context.manifest.teamId
  ) {
    fail('PACKET_IDENTITY_MISMATCH');
  }
  const commandRun = runCandidateValidator(context, candidate);
  const report = commandRun.report;
  const structuralOk =
    report?.structural?.ok === true &&
    Array.isArray(report.structural.results) &&
    new Set(report.structural.results.map((result) => result.rule)).size === 15;
  const primaryHashes = await hashes(candidate, PRIMARY_ARTIFACTS);
  await writeCanonical(join(candidate, 'validation/lesson-validate.json'), {
    command: commandRun.command,
    format: 'lesson-generation-validation/2',
    lessonId,
    primaryArtifacts: primaryHashes,
    rehash: report?.rehash ?? {
      changed: false,
      primaryContentSha: [],
      verifyNoOp: false,
    },
    results: report?.structural?.results ?? [],
    ruleSet: 'R1-R15',
    status: structuralOk ? 'PASS' : 'FAILED',
  });
  const quality = report?.computedQuality;
  await writeCanonical(join(candidate, 'validation/computed-quality.json'), {
    checks: Array.isArray(quality?.checks) ? quality.checks : [],
    format: 'lesson-generation-computed-quality/2',
    lessonId,
    officialRubricPassClaimed: false,
    sourceArtifactSha256: primaryHashes.find((file) => file.path === 'lesson-script.json').sha256,
    structuralMetrics: {
      failedRuleResultCount: Array.isArray(report?.structural?.results)
        ? report.structural.results.filter((result) => result.ok !== true).length
        : 0,
      normalizedItemCount: report?.normalization?.itemCount ?? null,
      passedRuleResultCount: Array.isArray(report?.structural?.results)
        ? report.structural.results.filter((result) => result.ok === true).length
        : 0,
      repairBindingCount: report?.normalization?.repairBindingCount ?? null,
      reentryItemCount: report?.normalization?.reentryItemCount ?? null,
      totalRuleResultCount: Array.isArray(report?.structural?.results)
        ? report.structural.results.length
        : 0,
    },
    status:
      quality?.ok !== true
        ? 'FAILED'
        : quality.checks.every((check) => check.status === 'na')
          ? 'N/A'
          : 'SCREENED',
  });
  const normalization = report?.normalization;
  const normalizationInputHashes = {
    learnerSafeItems: digest(await readFile(join(candidate, 'learner-safe-items.json'))),
    presentationPlan: digest(await readFile(join(candidate, 'lesson-presentation-plan.json'))),
    protectedItems: digest(await readFile(join(candidate, 'protected-items.json'))),
    script: digest(await readFile(join(candidate, 'lesson-script.json'))),
  };
  await writeCanonical(join(candidate, 'validation/normalization-smoke.json'), {
    ...(normalization ?? { code: 'NORMALIZATION_FAILED', ok: false }),
    command: commandRun.command,
    format: 'lesson-generation-normalization/2',
    lessonId,
    inputArtifactSha256: normalizationInputHashes,
    officialRubricPassClaimed: false,
    status: normalization?.ok === true ? 'PASS' : 'FAILED',
  });
  const protectedReceipt = await protectedScan(candidate, commandRun, lessonId);
  const blockers = [];
  if (commandRun.command.exitCode !== 0 || !structuralOk)
    blockers.push('STRUCTURAL_VALIDATION_FAILED');
  if (quality?.ok !== true) blockers.push('COMPUTED_QUALITY_FAILED');
  if (normalization?.ok !== true) blockers.push('NORMALIZATION_FAILED');
  if (protectedReceipt.status !== 'PASS') blockers.push('PROTECTED_BOUNDARY_FAILED');
  const reviews = await reviewBlockers(context, candidate, lessonId, primaryHashes);
  blockers.push(...reviews.blockers);
  const artifactManifestSha256 = await writeArtifactManifest(candidate, lessonId);
  const finalStatus = await updateHandoff(
    context,
    candidate,
    lessonId,
    blockers,
    artifactManifestSha256,
  );
  if (blockers.length > 0 || finalStatus !== 'COMPLETE') fail(blockers[0] ?? 'LESSON_NOT_COMPLETE');
  await verifyOne(context, candidate, lessonId);
}

async function verifyOne(context, candidate, lessonId, rerunRealValidators = false) {
  await requireRegularFiles(candidate, REQUIRED_LESSON_FILES);
  const manifest = await readJson(join(candidate, 'artifact-manifest.json'));
  const handoff = await readJson(join(candidate, 'LESSON-HANDOFF.json'));
  const handoffKeys = [
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
  ];
  if (
    !Array.isArray(manifest.kit_validation_artifacts) ||
    !exactKeys(handoff, handoffKeys) ||
    handoff.format !== 'lesson-generation-lesson-handoff/2' ||
    handoff.lessonId !== lessonId ||
    handoff.assignmentId !== context.manifest.assignmentId ||
    handoff.artifactManifestSha256 !==
      digest(await readFile(join(candidate, 'artifact-manifest.json'))) ||
    handoff.packetSha256 !==
      digest(await readFile(join(candidate, 'inputs/task-source-packet.json'))) ||
    handoff.repositoryCommit !== context.manifest.pins.repositoryCommit ||
    !['COMPLETE', 'BLOCKED', 'FAILED'].includes(handoff.status) ||
    !Array.isArray(handoff.unresolvedBlockerCodes) ||
    (handoff.status === 'COMPLETE' && handoff.unresolvedBlockerCodes.length !== 0) ||
    (handoff.status !== 'COMPLETE' && handoff.unresolvedBlockerCodes.length === 0) ||
    !validNonclaims(handoff.nonclaims)
  ) {
    fail('LESSON_HANDOFF_INVALID');
  }
  for (const file of manifest.kit_validation_artifacts) {
    const bytes = await readFile(confined(candidate, file.path)).catch(() =>
      fail('ARTIFACT_MANIFEST_INVALID'),
    );
    if (digest(bytes) !== file.sha256 || bytes.length !== file.size) {
      fail('ARTIFACT_MANIFEST_INVALID');
    }
  }
  const validation = await readJson(join(candidate, 'validation/lesson-validate.json'));
  const quality = await readJson(join(candidate, 'validation/computed-quality.json'));
  const normalization = await readJson(join(candidate, 'validation/normalization-smoke.json'));
  const protectedReceipt = await readJson(join(candidate, 'validation/protected-scan.json'));
  const primaryHashes = await hashes(candidate, PRIMARY_ARTIFACTS);
  const reviews = await reviewBlockers(context, candidate, lessonId, primaryHashes);
  const expectedCliMainSha256 = digest(
    await readFile(join(context.repository, 'tools/content-cli/src/main.ts')),
  );
  const currentNormalizationArtifacts = {
    learnerSafeItems: digest(await readFile(join(candidate, 'learner-safe-items.json'))),
    presentationPlan: digest(await readFile(join(candidate, 'lesson-presentation-plan.json'))),
    protectedItems: digest(await readFile(join(candidate, 'protected-items.json'))),
    script: digest(await readFile(join(candidate, 'lesson-script.json'))),
  };
  const freshProtectedFindings = [];
  for (const path of [
    'learner-safe-items.json',
    'source-claim-ledger.json',
    'candidate-quality-ledger.json',
  ]) {
    protectedFindings(await readJson(join(candidate, path)), path, freshProtectedFindings);
  }
  const rerun = rerunRealValidators ? runCandidateValidator(context, candidate) : null;
  const structuralPass =
    validation.status === 'PASS' &&
    Array.isArray(validation.results) &&
    validation.results.length > 0 &&
    validation.results.every((result) => result.ok === true);
  const qualityPass =
    ['N/A', 'SCREENED'].includes(quality.status) &&
    Array.isArray(quality.checks) &&
    quality.checks.every((check) => check.status !== 'fail');
  const normalizationPass = normalization.status === 'PASS' && normalization.ok === true;
  const protectedPass =
    protectedReceipt.status === 'PASS' &&
    freshProtectedFindings.length === 0 &&
    protectedReceipt.findings?.length === 0;
  const actualBlockers = [
    ...(!structuralPass ? ['STRUCTURAL_VALIDATION_FAILED'] : []),
    ...(!qualityPass ? ['COMPUTED_QUALITY_FAILED'] : []),
    ...(!normalizationPass ? ['NORMALIZATION_FAILED'] : []),
    ...(!protectedPass ? ['PROTECTED_BOUNDARY_FAILED'] : []),
    ...reviews.blockers,
  ];
  const expectedBlockers = [...new Set(actualBlockers)].sort();
  const mechanicalPass = structuralPass && qualityPass && normalizationPass;
  const rerunMatches =
    rerun === null ||
    (rerun.report?.structural?.ok === structuralPass &&
      rerun.report?.computedQuality?.ok === qualityPass &&
      rerun.report?.normalization?.ok === normalizationPass &&
      rerun.command.exitCode === (mechanicalPass ? 0 : 1));
  const handoffConsistent =
    handoff.status === 'COMPLETE'
      ? expectedBlockers.length === 0 &&
        handoff.lifecycle === 'CANDIDATE_RUBRIC_SCREENED' &&
        handoff.requestedStatus === 'COMPLETE'
      : expectedBlockers.length > 0 &&
        handoff.lifecycle === 'CANDIDATE_VALIDATION_BLOCKED' &&
        canonical(handoff.unresolvedBlockerCodes) === canonical(expectedBlockers);
  if (
    !['PASS', 'FAILED'].includes(validation.status) ||
    (validation.status === 'FAILED') !==
      (!Array.isArray(validation.results) ||
        validation.results.some((result) => result.ok !== true)) ||
    canonical(validation.primaryArtifacts) !== canonical(primaryHashes) ||
    validation.command?.exitCode !== (mechanicalPass ? 0 : 1) ||
    validation.command?.cliMainSha256 !== expectedCliMainSha256 ||
    validation.command?.validatorAggregateSha256 !==
      context.manifest.validatorAuthority.aggregateSha256 ||
    canonical(validation.command?.validatorFiles) !==
      canonical(context.manifest.validatorAuthority.files) ||
    !Array.isArray(validation.results) ||
    new Set(validation.results.map((result) => result.rule)).size !== 15 ||
    !['N/A', 'SCREENED', 'FAILED'].includes(quality.status) ||
    (quality.status === 'FAILED') !==
      (!Array.isArray(quality.checks) || quality.checks.some((check) => check.status === 'fail')) ||
    quality.sourceArtifactSha256 !==
      primaryHashes.find((file) => file.path === 'lesson-script.json').sha256 ||
    !['PASS', 'FAILED'].includes(normalization.status) ||
    (normalization.status === 'PASS') !== (normalization.ok === true) ||
    canonical(normalization.inputArtifactSha256) !== canonical(currentNormalizationArtifacts) ||
    (normalizationPass &&
      canonical(normalization.artifactSha256) !== canonical(currentNormalizationArtifacts)) ||
    !['PASS', 'FAILED'].includes(protectedReceipt.status) ||
    protectedReceipt.protectedArtifact?.sha256 !== currentNormalizationArtifacts.protectedItems ||
    !rerunMatches ||
    !handoffConsistent
  ) {
    fail('LESSON_RECEIPT_INVALID');
  }
  return handoff;
}

async function lessonRows(context, rerunRealValidators = false) {
  const entries = await readdir(context.outputRoot, { withFileTypes: true }).catch(() =>
    fail('OUTPUT_ROOT_MISSING'),
  );
  const lessonDirectories = entries
    .filter((entry) => entry.isDirectory() && entry.name !== 'waves')
    .map((entry) => entry.name)
    .sort();
  if (canonical(lessonDirectories) !== canonical([...context.manifest.allowedLessonIds].sort())) {
    fail('ASSIGNMENT_DIRECTORY_CLOSURE_FAILED');
  }
  const allowedRootEntries = new Set(['TEAM-HANDOFF.json', 'waves', ...lessonDirectories]);
  if (entries.some((entry) => !allowedRootEntries.has(entry.name))) {
    fail('OUTPUT_ROOT_EXTRA_PATH');
  }
  const rows = [];
  for (const lessonId of lessonDirectories) {
    const directory = join(context.outputRoot, lessonId);
    const handoff = await verifyOne(context, directory, lessonId, rerunRealValidators);
    rows.push({
      lessonHandoffSha256: digest(await readFile(join(directory, 'LESSON-HANDOFF.json'))),
      lessonId,
      rootSha256: handoff.artifactManifestSha256,
      status: handoff.status,
    });
  }
  return rows;
}

function closedHandoff(context, rows, waveId) {
  return {
    assignmentId: context.manifest.assignmentId,
    format:
      waveId === undefined
        ? 'lesson-generation-team-handoff/1'
        : 'lesson-generation-wave-handoff/1',
    nonclaims: {
      humanApproved: false,
      officialRubricPass: false,
      publicationApproved: false,
    },
    repositoryCommit: context.manifest.pins.repositoryCommit,
    rows,
    teamId: context.manifest.teamId,
    ...(waveId === undefined ? { expectedRowCount: 30 } : { waveId }),
  };
}

async function verifyAssignment(context, rerunRealValidators = true) {
  verifyRepository(context);
  const rows = await lessonRows(context, rerunRealValidators);
  const team = await readJson(
    join(context.outputRoot, 'TEAM-HANDOFF.json'),
    'TEAM_HANDOFF_MISSING',
  );
  if (
    canonical(team) !== canonical(closedHandoff(context, rows)) ||
    team.rows.length !== 30 ||
    new Set(team.rows.map((row) => row.lessonId)).size !== 30
  ) {
    fail('TEAM_HANDOFF_INVALID');
  }
  const waveDirectory = join(context.outputRoot, 'waves');
  const waveNames = (await readdir(waveDirectory).catch(() => fail('WAVE_HANDOFF_MISSING'))).filter(
    (name) => /^WAVE-[0-9]{2}-HANDOFF\.json$/.test(name),
  );
  if (waveNames.length === 0) fail('WAVE_HANDOFF_MISSING');
  const covered = new Set();
  for (const name of waveNames.sort()) {
    const wave = await readJson(join(waveDirectory, name));
    if (
      wave.format !== 'lesson-generation-wave-handoff/1' ||
      wave.teamId !== context.manifest.teamId ||
      wave.assignmentId !== context.manifest.assignmentId ||
      !Array.isArray(wave.rows) ||
      wave.rows.length === 0
    ) {
      fail('WAVE_HANDOFF_INVALID');
    }
    for (const row of wave.rows) {
      if (
        covered.has(row.lessonId) ||
        !rows.some((expected) => canonical(expected) === canonical(row))
      ) {
        fail('WAVE_HANDOFF_INVALID');
      }
      covered.add(row.lessonId);
    }
  }
  if (covered.size !== 30) fail('WAVE_HANDOFF_INCOMPLETE');
  return rows;
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function deterministicZip(files) {
  const local = [];
  const central = [];
  let offset = 0;
  for (const file of [...files].sort((left, right) => left.path.localeCompare(right.path))) {
    const name = Buffer.from(file.path, 'utf8');
    const bytes = Buffer.from(file.bytes);
    const checksum = crc32(bytes);
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0x0800, 6);
    localHeader.writeUInt32LE(checksum, 14);
    localHeader.writeUInt32LE(bytes.length, 18);
    localHeader.writeUInt32LE(bytes.length, 22);
    localHeader.writeUInt16LE(name.length, 26);
    local.push(localHeader, name, bytes);
    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(0x0314, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0x0800, 8);
    centralHeader.writeUInt32LE(checksum, 16);
    centralHeader.writeUInt32LE(bytes.length, 20);
    centralHeader.writeUInt32LE(bytes.length, 24);
    centralHeader.writeUInt16LE(name.length, 28);
    centralHeader.writeUInt32LE((0o100644 << 16) >>> 0, 38);
    centralHeader.writeUInt32LE(offset, 42);
    central.push(centralHeader, name);
    offset += localHeader.length + name.length + bytes.length;
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

async function packageHandoff(context) {
  verifyRepository(context);
  const rows = await lessonRows(context, true);
  const wave = closedHandoff(context, rows, 'WAVE-01');
  await writeCanonical(join(context.outputRoot, 'waves/WAVE-01-HANDOFF.json'), wave);
  await writeCanonical(join(context.outputRoot, 'TEAM-HANDOFF.json'), closedHandoff(context, rows));
  await verifyAssignment(context, false);
  const files = [];
  for (const row of rows) {
    const root = join(context.outputRoot, row.lessonId);
    for (const path of REQUIRED_LESSON_FILES) {
      files.push({
        path: `${row.lessonId}/${path}`,
        bytes: await readFile(join(root, path)),
      });
    }
  }
  files.push({
    path: 'TEAM-HANDOFF.json',
    bytes: await readFile(join(context.outputRoot, 'TEAM-HANDOFF.json')),
  });
  files.push({
    path: 'waves/WAVE-01-HANDOFF.json',
    bytes: await readFile(join(context.outputRoot, 'waves/WAVE-01-HANDOFF.json')),
  });
  const archive = deterministicZip(files);
  const archivePath = join(context.outputRoot, 'waves/WAVE-01-HANDOFF.zip');
  await writeFile(archivePath, archive, { mode: 0o600 });
  await writeFile(`${archivePath}.sha256`, `${digest(archive)}  WAVE-01-HANDOFF.zip\n`, {
    mode: 0o600,
  });
  await writeCanonical(join(context.outputRoot, 'waves/WAVE-01-SEND.json'), {
    archive: 'WAVE-01-HANDOFF.zip',
    archiveSha256: digest(archive),
    branch: `lesson-factory/${context.manifest.teamId}/wave-01`,
    format: 'lesson-generation-wave-send/1',
    repositoryCommit: context.manifest.pins.repositoryCommit,
    teamId: context.manifest.teamId,
  });
}

const args = process.argv.slice(2);
const mode = args[0];
if (!MODES.has(mode)) fail('UNSUPPORTED_ARGUMENTS');
const repositoryFlag = args.indexOf('--repository-root');
if (repositoryFlag === -1 || repositoryFlag + 1 >= args.length) fail('REPOSITORY_ROOT_REQUIRED');
const repositoryRoot = args[repositoryFlag + 1];
const positional = args.slice(1, repositoryFlag);
const trailing = args.slice(repositoryFlag + 2);
if (trailing.length !== 0) fail('UNSUPPORTED_ARGUMENTS');
const context = await loadContext(repositoryRoot);
await verifyValidatorAuthority(context);

if (mode === 'bootstrap') {
  if (positional.length !== 0) fail('UNSUPPORTED_ARGUMENTS');
  verifyRepository(context, true);
} else if (mode === 'validate-one') {
  if (positional.length !== 1) fail('LESSON_DIRECTORY_REQUIRED');
  await validateOne(context, positional[0]);
} else if (mode === 'validate-assignment') {
  if (positional.length !== 0) fail('UNSUPPORTED_ARGUMENTS');
  await verifyAssignment(context);
} else {
  if (positional.length !== 0) fail('UNSUPPORTED_ARGUMENTS');
  await packageHandoff(context);
}

process.stdout.write(
  mode === 'bootstrap'
    ? 'KIT_COMMAND_OK bootstrap FROZEN_INSTALL_OK\n'
    : `KIT_COMMAND_OK ${mode}\n`,
);
