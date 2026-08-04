#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { resolve, sep } from 'node:path';

const MODES = new Set(['bootstrap', 'install', 'one-template']);
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
const manifestPath = resolve(root, 'KIT-MANIFEST.json');
const manifestBytes = await readFile(manifestPath).catch(() => fail('MANIFEST_MISSING'));
const manifest = await readJson(manifestPath, 'MANIFEST_INVALID');

if (
  canonical(manifest) + '\n' !== manifestBytes.toString('utf8') ||
  manifest.format !== 'wp-03-kit-manifest/1' ||
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
}

if (mode === 'one-template') {
  const template = manifest.files.find(
    (file) =>
      file.kind === 'core' &&
      file.path.startsWith('docs/lesson-authoring/template/') &&
      file.path.endsWith('.json'),
  );
  if (template === undefined) fail('TEMPLATE_MISSING');
  await readJson(confined(root, template.path), 'TEMPLATE_INVALID');
  await readJson(confined(root, packets[0].path), 'PACKET_INVALID');
}

process.stdout.write(`KIT_SMOKE_OK ${mode}\n`);
