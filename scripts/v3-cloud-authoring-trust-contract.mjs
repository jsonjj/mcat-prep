import assert from 'node:assert/strict';
import { createHash, createPublicKey, verify as verifySignature } from 'node:crypto';
import { lstat, readFile, readdir, realpath } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';

import Ajv from 'ajv';

const HASH_PATTERN = /^[a-f0-9]{64}$/;
const IDENTITY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:@/+~-]*$/;
const INTEGRATION_PINSET_SCHEMA_VERSION = 'mcat-v3-integration-pinset-2';
const REVIEWER_CREDENTIAL_SCHEMA_VERSION = 'mcat-v3-reviewer-signing-credential-1';
const SIGNATURE_ALGORITHM = 'ED25519';
const BUILD_MANIFEST_SCHEMA_VERSION = 'mcat-v3-pinned-build-manifest-2';
const BUILD_PROVENANCE_SCHEMA_VERSION = 'mcat-v3-signed-build-provenance-1';
const CANDIDATE_SEMANTIC_PROFILE_SCHEMA_VERSION = 'mcat-v3-candidate-semantic-profile-1';
const LEARNER_VIEW_SEMANTIC_PROFILE_SCHEMA_VERSION = 'mcat-v3-learner-view-semantic-profile-1';
const ACTION_TRANSITION_PROFILE_SCHEMA_VERSION = 'mcat-v3-action-transition-profile-1';
const JSON_POINTER_PATTERN = /^(?:\/(?:[^~/]|~[01])*)+$/;

const ARTIFACT_LIMITS = Object.freeze({
  browser_evidence: Object.freeze({
    max_file_bytes: 512 * 1024,
    max_json_collection_entries: 2_000,
    max_json_depth: 24,
    max_json_string_bytes: 128 * 1024,
    max_regular_file_count: 32,
    max_total_bytes: 4 * 1024 * 1024,
  }),
  build: Object.freeze({
    max_file_bytes: 2 * 1024 * 1024,
    max_json_collection_entries: 2_000,
    max_json_depth: 24,
    max_json_string_bytes: 128 * 1024,
    max_regular_file_count: 64,
    max_total_bytes: 16 * 1024 * 1024,
  }),
  candidate: Object.freeze({
    max_file_bytes: 2 * 1024 * 1024,
    max_json_collection_entries: 20_000,
    max_json_depth: 64,
    max_json_string_bytes: 512 * 1024,
    max_regular_file_count: 128,
    max_total_bytes: 32 * 1024 * 1024,
  }),
  receipt_log: Object.freeze({
    max_file_bytes: 512 * 1024,
    max_json_collection_entries: 5_000,
    max_json_depth: 24,
    max_json_string_bytes: 128 * 1024,
    max_regular_file_count: 512,
    max_total_bytes: 32 * 1024 * 1024,
  }),
  report: Object.freeze({
    max_file_bytes: 512 * 1024,
    max_json_collection_entries: 5_000,
    max_json_depth: 32,
    max_json_string_bytes: 128 * 1024,
    max_regular_file_count: 32,
    max_total_bytes: 4 * 1024 * 1024,
  }),
  review_bundle: Object.freeze({
    max_file_bytes: 2 * 1024 * 1024,
    max_json_collection_entries: 20_000,
    max_json_depth: 64,
    max_json_string_bytes: 512 * 1024,
    max_regular_file_count: 16,
    max_total_bytes: 16 * 1024 * 1024,
  }),
  service_deployment: Object.freeze({
    max_file_bytes: 512 * 1024,
    max_json_collection_entries: 2_000,
    max_json_depth: 24,
    max_json_string_bytes: 128 * 1024,
    max_regular_file_count: 8,
    max_total_bytes: 2 * 1024 * 1024,
  }),
  single_file: Object.freeze({
    max_file_bytes: 2 * 1024 * 1024,
    max_json_collection_entries: 10_000,
    max_json_depth: 64,
    max_json_string_bytes: 512 * 1024,
    max_regular_file_count: 1,
    max_total_bytes: 2 * 1024 * 1024,
  }),
});

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function hashBytes(value) {
  return createHash('sha256').update(value).digest('hex');
}

function sortJsonValue(value) {
  if (Array.isArray(value)) return value.map(sortJsonValue);
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => compareText(left, right))
      .map(([key, child]) => [key, sortJsonValue(child)]),
  );
}

function hashCanonicalJson(value) {
  return hashBytes(JSON.stringify(sortJsonValue(value)));
}

function assertPlainObject(value, label) {
  assert(
    value !== null && typeof value === 'object' && !Array.isArray(value),
    `${label} must be an object`,
  );
}

function assertExactKeys(value, allowedKeys, label) {
  assertPlainObject(value, label);
  assert.deepEqual(
    Object.keys(value).sort(compareText),
    [...allowedKeys].sort(compareText),
    `${label} has missing or unknown fields`,
  );
}

function requireString(value, label, pattern = undefined) {
  assert.equal(typeof value, 'string', `${label} must be a string`);
  assert(value.length > 0, `${label} must not be empty`);
  if (pattern) assert.match(value, pattern, `${label} has an invalid format`);
  return value;
}

function requireHash(value, label) {
  return requireString(value, label, HASH_PATTERN);
}

function requireIdentity(identity, label) {
  assertExactKeys(identity, ['person_id', 'run_id'], label);
  requireString(identity.person_id, `${label}.person_id`, IDENTITY_PATTERN);
  requireString(identity.run_id, `${label}.run_id`, IDENTITY_PATTERN);
  return identity;
}

function sameIdentity(left, right) {
  return left.person_id === right.person_id && left.run_id === right.run_id;
}

function identityKey(identity) {
  return `${identity.person_id}\u0000${identity.run_id}`;
}

function resolveJsonPointer(value, pointer, label) {
  requireString(pointer, `${label} JSON pointer`, JSON_POINTER_PATTERN);
  let current = value;
  for (const encodedToken of pointer.slice(1).split('/')) {
    const token = encodedToken.replaceAll('~1', '/').replaceAll('~0', '~');
    assert(
      token !== '__proto__' && token !== 'constructor' && token !== 'prototype',
      `${label} JSON pointer contains a forbidden token`,
    );
    if (Array.isArray(current)) {
      assert.match(token, /^(?:0|[1-9]\d*)$/, `${label} JSON pointer has an invalid array index`);
      const index = Number(token);
      assert(index < current.length, `${label} JSON pointer does not resolve`);
      current = current[index];
    } else {
      assertPlainObject(current, `${label} JSON pointer parent`);
      assert(Object.hasOwn(current, token), `${label} JSON pointer does not resolve`);
      current = current[token];
    }
  }
  return current;
}

function isWithin(realRoot, realTarget) {
  return realTarget === realRoot || realTarget.startsWith(`${realRoot}${sep}`);
}

async function resolveRealPathInsideRoot(repositoryRoot, repositoryRelativePath, label) {
  requireString(repositoryRelativePath, label);
  assert.equal(isAbsolute(repositoryRelativePath), false, `${label} must be repository-relative`);
  const lexicalRoot = resolve(repositoryRoot);
  const lexicalTarget = resolve(lexicalRoot, repositoryRelativePath);
  assert(isWithin(lexicalRoot, lexicalTarget), `${label} escapes the lexical repository root`);
  const [realRoot, realTarget] = await Promise.all([
    realpath(lexicalRoot),
    realpath(lexicalTarget),
  ]);
  assert(isWithin(realRoot, realTarget), `${label} resolves outside the real repository root`);
  return { realRoot, realTarget };
}

function validateJsonComplexity(value, limits, label) {
  let collectionEntries = 0;
  const visit = (item, depth, path) => {
    assert(depth <= limits.max_json_depth, `${label} exceeds JSON nesting limit at ${path}`);
    if (typeof item === 'string') {
      assert(
        Buffer.byteLength(item, 'utf8') <= limits.max_json_string_bytes,
        `${label} exceeds JSON string limit at ${path}`,
      );
      return;
    }
    if (item === null || typeof item !== 'object') return;
    const values = Array.isArray(item) ? item : Object.values(item);
    collectionEntries += values.length;
    assert(
      collectionEntries <= limits.max_json_collection_entries,
      `${label} exceeds JSON collection-entry limit`,
    );
    values.forEach((child, index) => visit(child, depth + 1, `${path}[${index}]`));
  };
  visit(value, 0, '$');
}

async function readLimitedFile(
  path,
  label,
  limits = ARTIFACT_LIMITS.single_file,
  expectedKind = 'file',
) {
  const stats = await lstat(path);
  assert.equal(stats.isSymbolicLink(), false, `${label} may not be a symlink`);
  assert(stats.isFile(), `${label} must be a regular ${expectedKind}`);
  assert(stats.size <= limits.max_file_bytes, `${label} exceeds per-file byte limit`);
  const bytes = await readFile(path);
  assert.equal(bytes.length, stats.size, `${label} changed while being read`);
  return bytes;
}

function parseLimitedJson(bytes, label, limits = ARTIFACT_LIMITS.single_file) {
  const text = bytes.toString('utf8');
  assert(Buffer.from(text, 'utf8').equals(bytes), `${label} must be UTF-8 JSON`);
  assert.equal(text.includes('\u0000'), false, `${label} contains a NUL byte`);
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error(`${label} is not valid JSON`);
  }
  validateJsonComplexity(value, limits, label);
  return value;
}

async function readLimitedJson(path, label, limits = ARTIFACT_LIMITS.single_file) {
  const bytes = await readLimitedFile(path, label, limits, 'JSON file');
  return { bytes, value: parseLimitedJson(bytes, label, limits) };
}

async function inventoryDirectory(realRoot, currentPath, limits, state) {
  const stats = await lstat(currentPath);
  assert.equal(stats.isSymbolicLink(), false, `Artifact may not contain symlinks: ${currentPath}`);
  if (stats.isFile()) {
    state.file_count += 1;
    state.total_bytes += stats.size;
    assert(
      state.file_count <= limits.max_regular_file_count,
      `Artifact exceeds regular-file count limit`,
    );
    assert(stats.size <= limits.max_file_bytes, `Artifact file exceeds per-file byte limit`);
    assert(state.total_bytes <= limits.max_total_bytes, `Artifact exceeds total byte limit`);
    state.files.push({
      absolute_path: currentPath,
      path: relative(realRoot, currentPath).split(sep).join('/'),
      size: stats.size,
    });
    return;
  }
  assert(stats.isDirectory(), `Unsupported artifact node: ${currentPath}`);
  const entries = await readdir(currentPath, { withFileTypes: true });
  for (const entry of entries.sort((left, right) => compareText(left.name, right.name))) {
    assert.equal(entry.isSymbolicLink(), false, `Artifact may not contain symlinks: ${entry.name}`);
    await inventoryDirectory(realRoot, join(currentPath, entry.name), limits, state);
  }
}

function assertUniqueManifestPaths(fileManifest, label) {
  assert(Array.isArray(fileManifest), `${label} must be an array`);
  const paths = new Set();
  for (const [index, entry] of fileManifest.entries()) {
    assertExactKeys(entry, ['path', 'sha256'], `${label}[${index}]`);
    requireString(entry.path, `${label}[${index}].path`);
    assert.equal(isAbsolute(entry.path), false, `${label}[${index}].path must be relative`);
    assert.equal(entry.path.includes('..'), false, `${label}[${index}].path may not traverse`);
    requireHash(entry.sha256, `${label}[${index}].sha256`);
    assert(!paths.has(entry.path), `${label} contains duplicate path ${entry.path}`);
    paths.add(entry.path);
  }
  assert.deepEqual(
    fileManifest.map((entry) => entry.path),
    [...paths].sort(compareText),
    `${label} must be path-sorted`,
  );
}

function directoryHash(fileManifest) {
  assertUniqueManifestPaths(fileManifest, 'artifact file manifest');
  return hashBytes(fileManifest.map((file) => `${file.path}\u0000${file.sha256}\n`).join(''));
}

async function hashArtifactDirectory({ artifactPath, label, limits, repositoryRoot }) {
  const { realTarget } = await resolveRealPathInsideRoot(repositoryRoot, artifactPath, label);
  const stats = await lstat(realTarget);
  assert(stats.isDirectory(), `${label} must be a directory`);
  const state = { file_count: 0, files: [], total_bytes: 0 };
  await inventoryDirectory(realTarget, realTarget, limits, state);
  assert(state.files.length > 0, `${label} must contain files`);
  const fileManifest = [];
  for (const file of state.files.sort((left, right) => compareText(left.path, right.path))) {
    const bytes = await readLimitedFile(file.absolute_path, `${label}/${file.path}`, limits);
    fileManifest.push({ path: file.path, sha256: hashBytes(bytes) });
  }
  return {
    artifact_sha256: directoryHash(fileManifest),
    file_manifest: fileManifest,
    real_path: realTarget,
    total_bytes: state.total_bytes,
  };
}

async function validateArtifactDescriptor(
  descriptor,
  { label, limits, repositoryRoot, requiredFiles = undefined },
) {
  assertExactKeys(descriptor, ['artifact_path', 'artifact_sha256', 'file_manifest'], label);
  requireString(descriptor.artifact_path, `${label}.artifact_path`);
  requireHash(descriptor.artifact_sha256, `${label}.artifact_sha256`);
  assertUniqueManifestPaths(descriptor.file_manifest, `${label}.file_manifest`);
  const scan = await hashArtifactDirectory({
    artifactPath: descriptor.artifact_path,
    label,
    limits,
    repositoryRoot,
  });
  assert.deepEqual(scan.file_manifest, descriptor.file_manifest, `${label} file manifest is stale`);
  assert.equal(scan.artifact_sha256, descriptor.artifact_sha256, `${label} hash is stale`);
  if (requiredFiles) {
    assert.deepEqual(
      scan.file_manifest.map((file) => file.path),
      [...requiredFiles].sort(compareText),
      `${label} must contain the exact closed file set`,
    );
  }
  return scan;
}

function publicKeyFingerprint(publicKeyPem) {
  const key = createPublicKey(publicKeyPem);
  assert.equal(key.asymmetricKeyType, 'ed25519', 'Signing public key must be Ed25519');
  return hashBytes(key.export({ format: 'der', type: 'spki' }));
}

async function readPublicKey(path, label, limits = ARTIFACT_LIMITS.single_file) {
  const bytes = await readLimitedFile(path, label, {
    ...limits,
    max_file_bytes: Math.min(limits.max_file_bytes, 32 * 1024),
  });
  const pem = bytes.toString('utf8');
  const fingerprint = publicKeyFingerprint(pem);
  return { bytes, fingerprint, pem };
}

function parseDetachedSignature(bytes, label) {
  const text = bytes.toString('ascii').trim();
  assert.match(text, /^[A-Za-z0-9+/]+={0,2}$/, `${label} must be canonical base64`);
  const signature = Buffer.from(text, 'base64');
  assert.equal(signature.toString('base64'), text, `${label} must be canonical base64`);
  assert.equal(signature.length, 64, `${label} must be an Ed25519 signature`);
  return signature;
}

function verifyBytesSignature(bytes, signatureBytes, publicKeyPem, label) {
  assert(
    verifySignature(null, bytes, publicKeyPem, signatureBytes),
    `${label} detached signature is invalid`,
  );
}

async function readAndVerifySignedJson({
  documentPath,
  documentSha256,
  label,
  limits = ARTIFACT_LIMITS.report,
  publicKeyPem,
  repositoryRoot,
  signaturePath,
  signatureSha256,
}) {
  const [documentResolved, signatureResolved] = await Promise.all([
    resolveRealPathInsideRoot(repositoryRoot, documentPath, `${label} path`),
    resolveRealPathInsideRoot(repositoryRoot, signaturePath, `${label} signature path`),
  ]);
  const [documentBytes, signatureBytesFile] = await Promise.all([
    readLimitedFile(documentResolved.realTarget, label, limits, 'JSON file'),
    readLimitedFile(
      signatureResolved.realTarget,
      `${label} detached signature`,
      {
        ...ARTIFACT_LIMITS.single_file,
        max_file_bytes: 16 * 1024,
      },
      'signature file',
    ),
  ]);
  assert.equal(hashBytes(documentBytes), documentSha256, `${label} hash is stale`);
  assert.equal(hashBytes(signatureBytesFile), signatureSha256, `${label} signature hash is stale`);
  verifyBytesSignature(
    documentBytes,
    parseDetachedSignature(signatureBytesFile, `${label} signature`),
    publicKeyPem,
    label,
  );
  return {
    bytes: documentBytes,
    signature_bytes: signatureBytesFile,
    value: parseLimitedJson(documentBytes, label, limits),
  };
}

function validateSortedUniqueStrings(values, label, pattern = IDENTITY_PATTERN) {
  assert(Array.isArray(values) && values.length > 0, `${label} must not be empty`);
  values.forEach((value, index) => requireString(value, `${label}[${index}]`, pattern));
  assert.deepEqual(
    values,
    [...new Set(values)].sort(compareText),
    `${label} must be unique/sorted`,
  );
}

function validateCandidateSemanticProfile(profile) {
  assertExactKeys(
    profile,
    [
      'definition_schema_version_pointer',
      'expected_definition_schema_version',
      'lesson_id_pointer',
      'schema_version',
      'validator_required_check_ids',
    ],
    'candidate semantic profile',
  );
  assert.equal(profile.schema_version, CANDIDATE_SEMANTIC_PROFILE_SCHEMA_VERSION);
  requireString(
    profile.definition_schema_version_pointer,
    'candidate definition schema-version pointer',
    JSON_POINTER_PATTERN,
  );
  requireString(
    profile.expected_definition_schema_version,
    'candidate expected definition schema version',
  );
  requireString(profile.lesson_id_pointer, 'candidate lesson-ID pointer', JSON_POINTER_PATTERN);
  validateSortedUniqueStrings(
    profile.validator_required_check_ids,
    'candidate validator required check IDs',
  );
}

function validateStateConstraint(constraint, label) {
  assertExactKeys(
    constraint,
    ['assistance_revealed', 'planner_reentry_required', 'repair_cycle', 'status'],
    label,
  );
  for (const key of ['assistance_revealed', 'planner_reentry_required']) {
    assert(
      constraint[key] === null || typeof constraint[key] === 'boolean',
      `${label}.${key} must be null or boolean`,
    );
  }
  assert(
    constraint.repair_cycle === null ||
      (Number.isInteger(constraint.repair_cycle) && constraint.repair_cycle >= 0),
    `${label}.repair_cycle must be null or a nonnegative integer`,
  );
  assert(
    constraint.status === null || typeof constraint.status === 'string',
    `${label}.status must be null or a string`,
  );
}

function validateTransitionProfile(profile) {
  assertExactKeys(
    profile,
    [
      'action_contracts',
      'action_kinds',
      'event_kinds',
      'path_contracts',
      'profile_id',
      'response_outcomes',
      'schema_version',
      'semantic_statuses',
      'technical_service_check_ids',
    ],
    'action/transition profile',
  );
  assert.equal(profile.schema_version, ACTION_TRANSITION_PROFILE_SCHEMA_VERSION);
  requireString(profile.profile_id, 'action/transition profile ID', IDENTITY_PATTERN);
  validateSortedUniqueStrings(profile.action_kinds, 'learner action kinds');
  validateSortedUniqueStrings(profile.event_kinds, 'runtime event kinds');
  validateSortedUniqueStrings(profile.response_outcomes, 'runtime response outcomes');
  validateSortedUniqueStrings(profile.semantic_statuses, 'learner semantic statuses');
  validateSortedUniqueStrings(profile.technical_service_check_ids, 'technical service check IDs');
  assert(Array.isArray(profile.action_contracts));
  assert.equal(
    profile.action_contracts.length,
    profile.action_kinds.length,
    'Action contracts must cover every signed action kind exactly once',
  );
  const actionContractByKind = new Map();
  for (const [index, contract] of profile.action_contracts.entries()) {
    const label = `action contract[${index}]`;
    assertExactKeys(
      contract,
      [
        'action_kind',
        'activity_binding',
        'allowed_response_outcomes',
        'required_event_kinds',
        'response_hash',
      ],
      label,
    );
    assert(profile.action_kinds.includes(contract.action_kind), `${label} has an unknown action`);
    assert(
      ['NONE', 'OPTIONAL', 'REQUIRED'].includes(contract.activity_binding),
      `${label} has an invalid activity binding`,
    );
    assert(
      contract.response_hash === 'NULL' || contract.response_hash === 'REQUIRED',
      `${label} has an invalid response-hash rule`,
    );
    assert(Array.isArray(contract.allowed_response_outcomes));
    assert.deepEqual(
      contract.allowed_response_outcomes,
      [...new Set(contract.allowed_response_outcomes)].sort(compareText),
      `${label} response outcomes must be unique/sorted`,
    );
    contract.allowed_response_outcomes.forEach((outcome) =>
      assert(profile.response_outcomes.includes(outcome), `${label} has an unknown outcome`),
    );
    assert(Array.isArray(contract.required_event_kinds));
    assert.deepEqual(
      contract.required_event_kinds,
      [...new Set(contract.required_event_kinds)].sort(compareText),
      `${label} event kinds must be unique/sorted`,
    );
    contract.required_event_kinds.forEach((eventKind) =>
      assert(profile.event_kinds.includes(eventKind), `${label} has an unknown event kind`),
    );
    assert(!actionContractByKind.has(contract.action_kind), `Duplicate ${contract.action_kind}`);
    actionContractByKind.set(contract.action_kind, contract);
  }
  assert.deepEqual(
    profile.action_contracts.map((contract) => contract.action_kind),
    profile.action_kinds,
    'Action contracts must follow signed action-kind order',
  );
  assert(Array.isArray(profile.path_contracts) && profile.path_contracts.length > 0);
  const pathIds = [];
  for (const [pathIndex, path] of profile.path_contracts.entries()) {
    const pathLabel = `semantic path contract[${pathIndex}]`;
    assertExactKeys(path, ['path_id', 'steps'], pathLabel);
    requireString(path.path_id, `${pathLabel}.path_id`, IDENTITY_PATTERN);
    assert(Array.isArray(path.steps) && path.steps.length > 0, `${pathLabel} needs steps`);
    pathIds.push(path.path_id);
    for (const [stepIndex, step] of path.steps.entries()) {
      const stepLabel = `${pathLabel}.steps[${stepIndex}]`;
      assertExactKeys(
        step,
        [
          'action_kind',
          'after',
          'before',
          'relation_to_previous',
          'required_event_kinds',
          'response_outcome',
          'state_transition',
        ],
        stepLabel,
      );
      const actionContract = actionContractByKind.get(step.action_kind);
      assert(actionContract, `${stepLabel} uses an unsupported learner action`);
      assert(
        step.response_outcome === null ||
          actionContract.allowed_response_outcomes.includes(step.response_outcome),
        `${stepLabel} has an outcome not allowed for its learner action`,
      );
      assert(Array.isArray(step.required_event_kinds));
      assert.deepEqual(
        step.required_event_kinds,
        [...new Set(step.required_event_kinds)].sort(compareText),
        `${stepLabel} event kinds must be unique/sorted`,
      );
      step.required_event_kinds.forEach((eventKind) =>
        assert(profile.event_kinds.includes(eventKind), `${stepLabel} has an unknown event kind`),
      );
      validateStateConstraint(step.before, `${stepLabel}.before`);
      validateStateConstraint(step.after, `${stepLabel}.after`);
      for (const relationKey of ['relation_to_previous', 'state_transition']) {
        const relation = step[relationKey];
        assertExactKeys(
          relation,
          ['activity', 'family', 'repair_cycle', 'representations', 'route'],
          `${stepLabel}.${relationKey}`,
        );
        for (const key of ['activity', 'family', 'representations', 'route']) {
          assert(
            ['ANY', 'DIFFERENT', 'SAME'].includes(relation[key]),
            `${stepLabel}.${relationKey}.${key} has an invalid relation`,
          );
        }
        assert(
          ['ANY', 'INCREASE', 'SAME'].includes(relation.repair_cycle),
          `${stepLabel}.${relationKey}.repair_cycle has an invalid relation`,
        );
      }
      if (stepIndex === 0) {
        assert(
          Object.values(step.relation_to_previous).every((relation) => relation === 'ANY'),
          `${stepLabel} cannot constrain a nonexistent previous step`,
        );
      }
    }
  }
  assert.deepEqual(
    pathIds,
    [...new Set(pathIds)].sort(compareText),
    'Path IDs must be unique/sorted',
  );
}

function validateLearnerViewSemanticProfile(profile) {
  assertExactKeys(
    profile,
    [
      'activity_id_pointer',
      'activity_pointer',
      'available_actions_pointer',
      'expected_view_schema_version',
      'lesson_id_pointer',
      'media_profile',
      'representation_kind_pointer',
      'representations_pointer',
      'schema_version',
      'view_schema_version_pointer',
    ],
    'learner-view semantic profile',
  );
  assert.equal(profile.schema_version, LEARNER_VIEW_SEMANTIC_PROFILE_SCHEMA_VERSION);
  for (const key of [
    'activity_id_pointer',
    'activity_pointer',
    'available_actions_pointer',
    'lesson_id_pointer',
    'representation_kind_pointer',
    'representations_pointer',
    'view_schema_version_pointer',
  ]) {
    requireString(profile[key], `learner-view ${key}`, JSON_POINTER_PATTERN);
  }
  requireString(profile.expected_view_schema_version, 'expected learner-view schema version');
  assertExactKeys(
    profile.media_profile,
    [
      'asset_ref_pointer',
      'audio_captions_required',
      'audio_kind',
      'captions_ref_pointer',
      'transcript_pointer',
      'video_captions_required',
      'video_kind',
    ],
    'learner-view media profile',
  );
  for (const key of ['asset_ref_pointer', 'captions_ref_pointer', 'transcript_pointer']) {
    requireString(profile.media_profile[key], `media ${key}`, JSON_POINTER_PATTERN);
  }
  requireString(profile.media_profile.audio_kind, 'audio representation kind', IDENTITY_PATTERN);
  requireString(profile.media_profile.video_kind, 'video representation kind', IDENTITY_PATTERN);
  assert.notEqual(profile.media_profile.audio_kind, profile.media_profile.video_kind);
  assert.equal(typeof profile.media_profile.audio_captions_required, 'boolean');
  assert.equal(typeof profile.media_profile.video_captions_required, 'boolean');
}

function validateLearnerViewContract(contract) {
  assertExactKeys(
    contract,
    [
      'action_schema_id',
      'action_schema_sha256',
      'representation_kinds',
      'semantic_profile',
      'transition_profile',
      'view_schema_id',
      'view_schema_sha256',
    ],
    'integration pinset learner-view contract',
  );
  requireString(contract.action_schema_id, 'learner action schema ID');
  requireHash(contract.action_schema_sha256, 'learner action schema SHA-256');
  requireString(contract.view_schema_id, 'learner view schema ID');
  requireHash(contract.view_schema_sha256, 'learner view schema SHA-256');
  validateSortedUniqueStrings(contract.representation_kinds, 'learner representation kinds');
  validateLearnerViewSemanticProfile(contract.semantic_profile);
  validateTransitionProfile(contract.transition_profile);
  assert(
    contract.representation_kinds.includes(contract.semantic_profile.media_profile.audio_kind),
    'Learner representation kinds omit the signed audio kind',
  );
  assert(
    contract.representation_kinds.includes(contract.semantic_profile.media_profile.video_kind),
    'Learner representation kinds omit the signed video kind',
  );
}

function validateBuildPin(build, label, signingKeyRequired) {
  const fields = ['artifact_sha256', 'build_id', 'build_version'];
  if (signingKeyRequired) fields.push('report_signing_key_fingerprint');
  assertExactKeys(build, fields, label);
  requireHash(build.artifact_sha256, `${label} artifact SHA-256`);
  requireString(build.build_id, `${label} build ID`, IDENTITY_PATTERN);
  requireString(build.build_version, `${label} build version`, IDENTITY_PATTERN);
  if (signingKeyRequired) {
    requireHash(build.report_signing_key_fingerprint, `${label} report signing key fingerprint`);
  }
}

function validatePinsetDocument(pinset, expectedMode) {
  assertExactKeys(
    pinset,
    [
      'builds',
      'foundation_commit_sha',
      'issued_at',
      'learner_view_contract',
      'pinset_id',
      'runtime_contract',
      'schema_version',
      'validation_mode',
    ],
    'integration pinset',
  );
  assert.equal(pinset.schema_version, INTEGRATION_PINSET_SCHEMA_VERSION);
  assert.equal(pinset.validation_mode, expectedMode);
  requireString(pinset.pinset_id, 'integration pinset ID', IDENTITY_PATTERN);
  requireString(pinset.issued_at, 'integration pinset issued_at');
  requireString(pinset.foundation_commit_sha, 'foundation commit SHA');
  if (expectedMode === 'PRODUCTION') {
    assert.match(
      pinset.foundation_commit_sha,
      /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/,
      'Production foundation commit must be an exact Git SHA',
    );
    assert.equal(
      JSON.stringify(pinset).includes('FIXTURE_ONLY'),
      false,
      'Production pinsets may not contain fixture-only subjects',
    );
  } else {
    assert.match(
      pinset.foundation_commit_sha,
      /^FIXTURE_ONLY_/,
      'Fixture pinsets must be visibly non-production',
    );
  }
  assertExactKeys(
    pinset.runtime_contract,
    [
      'candidate_definition_path',
      'candidate_format',
      'candidate_schema_id',
      'candidate_schema_sha256',
      'candidate_semantic_profile',
      'candidate_validator_build_id',
      'candidate_validator_build_sha256',
      'candidate_validator_build_version',
      'candidate_validator_report_signing_key_fingerprint',
      'runtime_contract_version',
    ],
    'integration pinset runtime contract',
  );
  requireString(pinset.runtime_contract.candidate_definition_path, 'candidate definition path');
  assert.equal(pinset.runtime_contract.candidate_format, 'JSON');
  requireString(pinset.runtime_contract.candidate_schema_id, 'candidate schema ID');
  requireHash(pinset.runtime_contract.candidate_schema_sha256, 'candidate schema SHA-256');
  requireHash(
    pinset.runtime_contract.candidate_validator_build_sha256,
    'candidate validator build SHA-256',
  );
  requireString(
    pinset.runtime_contract.candidate_validator_build_id,
    'candidate validator build ID',
    IDENTITY_PATTERN,
  );
  requireString(
    pinset.runtime_contract.candidate_validator_build_version,
    'candidate validator build version',
    IDENTITY_PATTERN,
  );
  requireHash(
    pinset.runtime_contract.candidate_validator_report_signing_key_fingerprint,
    'candidate validator report signing key fingerprint',
  );
  requireString(pinset.runtime_contract.runtime_contract_version, 'runtime contract version');
  validateCandidateSemanticProfile(pinset.runtime_contract.candidate_semantic_profile);
  validateLearnerViewContract(pinset.learner_view_contract);
  assertExactKeys(
    pinset.builds,
    ['review_harness', 'safe_projection_compiler', 'scoring_service'],
    'integration pinset builds',
  );
  validateBuildPin(pinset.builds.review_harness, 'review harness build pin', true);
  validateBuildPin(
    pinset.builds.safe_projection_compiler,
    'safe-projection compiler build pin',
    true,
  );
  validateBuildPin(pinset.builds.scoring_service, 'scoring service build pin', false);
}

async function loadAndVerifyIntegrationPinset(
  integrationTrust,
  { allowFixtureTrust = false, externalTrustRootPublicKeyPath, repositoryRoot },
) {
  assertExactKeys(
    integrationTrust,
    [
      'external_trust_root_fingerprint',
      'pinset_path',
      'pinset_sha256',
      'pinset_signature_path',
      'pinset_signature_sha256',
      'validation_mode',
    ],
    'integration trust',
  );
  assert(
    integrationTrust.validation_mode === 'PRODUCTION' ||
      integrationTrust.validation_mode === 'FIXTURE_ONLY_NON_PRODUCTION',
    'Unknown integration validation mode',
  );
  if (integrationTrust.validation_mode !== 'PRODUCTION') {
    assert(
      allowFixtureTrust,
      'Fixture-only cryptographic evidence may not satisfy production validation',
    );
  }
  requireString(externalTrustRootPublicKeyPath, 'external integration trust-root public key path');
  const trustRoot = await readPublicKey(
    resolve(externalTrustRootPublicKeyPath),
    'external integration trust-root public key',
  );
  assert.equal(
    integrationTrust.external_trust_root_fingerprint,
    trustRoot.fingerprint,
    'Overlay integration trust-root fingerprint does not match the externally supplied key',
  );
  const signed = await readAndVerifySignedJson({
    documentPath: integrationTrust.pinset_path,
    documentSha256: integrationTrust.pinset_sha256,
    label: 'integration pinset',
    publicKeyPem: trustRoot.pem,
    repositoryRoot,
    signaturePath: integrationTrust.pinset_signature_path,
    signatureSha256: integrationTrust.pinset_signature_sha256,
  });
  validatePinsetDocument(signed.value, integrationTrust.validation_mode);
  return {
    pinset: signed.value,
    pinset_sha256: integrationTrust.pinset_sha256,
    trust_root: trustRoot,
  };
}

function validateBuildManifest(value, expected) {
  assertExactKeys(
    value,
    [
      'build_id',
      'build_kind',
      'build_version',
      'foundation_commit_sha',
      'provenance',
      'report_signing_public_key_path',
      'schema_version',
      'subject',
    ],
    `${expected.buildKind} build manifest`,
  );
  assert.equal(value.schema_version, BUILD_MANIFEST_SCHEMA_VERSION);
  assert.equal(value.build_kind, expected.buildKind);
  assert.equal(value.build_id, expected.buildId);
  assert.equal(value.build_version, expected.buildVersion);
  assert.equal(value.foundation_commit_sha, expected.foundationCommitSha);
  assertExactKeys(
    value.subject,
    ['entrypoint_path', 'file_manifest', 'format', 'sha256'],
    `${expected.buildKind} implementation subject`,
  );
  assert.equal(value.subject.format, 'CLOSED_FILE_TREE');
  requireString(value.subject.entrypoint_path, `${expected.buildKind} subject entrypoint`);
  assert(
    value.subject.entrypoint_path.startsWith('subject/'),
    `${expected.buildKind} subject entrypoint must be under subject/`,
  );
  assertUniqueManifestPaths(
    value.subject.file_manifest,
    `${expected.buildKind} subject file manifest`,
  );
  assert(value.subject.file_manifest.length > 0, `${expected.buildKind} subject may not be empty`);
  for (const file of value.subject.file_manifest) {
    assert(
      file.path.startsWith('subject/'),
      `${expected.buildKind} implementation files must be under subject/`,
    );
  }
  assert(
    value.subject.file_manifest.some((file) => file.path === value.subject.entrypoint_path),
    `${expected.buildKind} subject entrypoint is not in its file manifest`,
  );
  requireHash(value.subject.sha256, `${expected.buildKind} subject SHA-256`);
  assert.equal(
    value.subject.sha256,
    directoryHash(value.subject.file_manifest),
    `${expected.buildKind} implementation subject hash is stale`,
  );
  assertExactKeys(
    value.provenance,
    ['path', 'sha256', 'signature_path', 'signature_sha256', 'signer_key_fingerprint'],
    `${expected.buildKind} provenance descriptor`,
  );
  requireString(value.provenance.path, `${expected.buildKind} provenance path`);
  requireHash(value.provenance.sha256, `${expected.buildKind} provenance SHA-256`);
  requireString(value.provenance.signature_path, `${expected.buildKind} provenance signature path`);
  requireHash(
    value.provenance.signature_sha256,
    `${expected.buildKind} provenance signature SHA-256`,
  );
  assert.equal(
    value.provenance.signer_key_fingerprint,
    expected.provenanceSignerFingerprint,
    `${expected.buildKind} provenance signer is not the external integration authority`,
  );
  if (expected.reportSigningKeyRequired) {
    assert.equal(
      value.report_signing_public_key_path,
      'report-signing-public-key.pem',
      `${expected.buildKind} must include its report-signing public key`,
    );
  } else {
    assert.equal(value.report_signing_public_key_path, null);
  }
}

function validateBuildProvenanceDocument(value, expected) {
  assertExactKeys(
    value,
    [
      'build_id',
      'build_kind',
      'build_version',
      'foundation_commit_sha',
      'generated_at',
      'schema_version',
      'status',
      'subject',
    ],
    `${expected.buildKind} signed build provenance`,
  );
  assert.equal(value.schema_version, BUILD_PROVENANCE_SCHEMA_VERSION);
  assert.equal(value.build_kind, expected.buildKind);
  assert.equal(value.build_id, expected.buildId);
  assert.equal(value.build_version, expected.buildVersion);
  assert.equal(value.foundation_commit_sha, expected.foundationCommitSha);
  requireString(value.generated_at, `${expected.buildKind} provenance generated_at`);
  assert.equal(value.status, 'VERIFIED_IMMUTABLE_IMPLEMENTATION_SUBJECT');
  assert.deepEqual(
    value.subject,
    expected.subject,
    `${expected.buildKind} provenance does not bind the implementation subject`,
  );
}

async function validatePinnedBuildArtifact({
  buildKind,
  descriptor,
  integrationTrustRoot,
  pin,
  repositoryRoot,
  reportSigningKeyRequired,
}) {
  const scan = await validateArtifactDescriptor(descriptor, {
    label: `${buildKind} build artifact`,
    limits: ARTIFACT_LIMITS.build,
    repositoryRoot,
  });
  assert.equal(scan.artifact_sha256, pin.artifact_sha256);
  const manifestEntry = scan.file_manifest.find((file) => file.path === 'build-manifest.json');
  assert(manifestEntry, `${buildKind} build lacks build-manifest.json`);
  const { value: manifest } = await readLimitedJson(
    join(scan.real_path, 'build-manifest.json'),
    `${buildKind} build manifest`,
    ARTIFACT_LIMITS.build,
  );
  validateBuildManifest(manifest, {
    buildId: pin.build_id,
    buildKind,
    buildVersion: pin.build_version,
    foundationCommitSha: pin.foundation_commit_sha,
    provenanceSignerFingerprint: integrationTrustRoot.fingerprint,
    reportSigningKeyRequired,
  });
  const subjectEntries = scan.file_manifest.filter((file) => file.path.startsWith('subject/'));
  assert.deepEqual(
    subjectEntries,
    manifest.subject.file_manifest,
    `${buildKind} implementation subject file manifest is stale`,
  );
  const expectedPaths = [
    'build-manifest.json',
    manifest.provenance.path,
    manifest.provenance.signature_path,
    ...manifest.subject.file_manifest.map((file) => file.path),
  ];
  if (manifest.report_signing_public_key_path !== null) {
    expectedPaths.push(manifest.report_signing_public_key_path);
  }
  assert.deepEqual(
    scan.file_manifest.map((file) => file.path),
    expectedPaths.sort(compareText),
    `${buildKind} build must contain exactly its closed implementation subject and provenance`,
  );
  const signedProvenance = await readAndVerifySignedJson({
    documentPath: `${descriptor.artifact_path}/${manifest.provenance.path}`,
    documentSha256: manifest.provenance.sha256,
    label: `${buildKind} build provenance`,
    limits: ARTIFACT_LIMITS.build,
    publicKeyPem: integrationTrustRoot.pem,
    repositoryRoot,
    signaturePath: `${descriptor.artifact_path}/${manifest.provenance.signature_path}`,
    signatureSha256: manifest.provenance.signature_sha256,
  });
  validateBuildProvenanceDocument(signedProvenance.value, {
    buildId: pin.build_id,
    buildKind,
    buildVersion: pin.build_version,
    foundationCommitSha: pin.foundation_commit_sha,
    subject: manifest.subject,
  });
  let signingKey = null;
  if (reportSigningKeyRequired) {
    signingKey = await readPublicKey(
      join(scan.real_path, manifest.report_signing_public_key_path),
      `${buildKind} report signing public key`,
      ARTIFACT_LIMITS.build,
    );
    assert.equal(signingKey.fingerprint, pin.report_signing_key_fingerprint);
  }
  return { ...scan, manifest, provenance: signedProvenance.value, signing_key: signingKey };
}

async function validatePinnedIntegrationArtifacts({
  descriptors,
  integrationTrustRoot,
  pinset,
  repositoryRoot,
}) {
  assertExactKeys(
    descriptors,
    [
      'candidate_schema',
      'candidate_validator_build',
      'learner_action_schema',
      'learner_view_schema',
      'review_harness_build',
      'safe_projection_compiler_build',
      'scoring_service_build',
    ],
    'pinned integration artifacts',
  );
  const candidateSchemaPath = await resolveRealPathInsideRoot(
    repositoryRoot,
    descriptors.candidate_schema.path,
    'candidate schema path',
  );
  const learnerActionSchemaPath = await resolveRealPathInsideRoot(
    repositoryRoot,
    descriptors.learner_action_schema.path,
    'learner action schema path',
  );
  const learnerViewSchemaPath = await resolveRealPathInsideRoot(
    repositoryRoot,
    descriptors.learner_view_schema.path,
    'learner view schema path',
  );
  for (const [descriptor, expectedHash, label] of [
    [
      descriptors.candidate_schema,
      pinset.runtime_contract.candidate_schema_sha256,
      'candidate schema',
    ],
    [
      descriptors.learner_action_schema,
      pinset.learner_view_contract.action_schema_sha256,
      'learner action schema',
    ],
    [
      descriptors.learner_view_schema,
      pinset.learner_view_contract.view_schema_sha256,
      'learner view schema',
    ],
  ]) {
    assertExactKeys(descriptor, ['path', 'sha256'], `${label} descriptor`);
    requireHash(descriptor.sha256, `${label} descriptor SHA-256`);
    const resolved =
      label === 'candidate schema'
        ? candidateSchemaPath.realTarget
        : label === 'learner action schema'
          ? learnerActionSchemaPath.realTarget
          : learnerViewSchemaPath.realTarget;
    const bytes = await readLimitedFile(resolved, label, ARTIFACT_LIMITS.single_file);
    assert.equal(hashBytes(bytes), descriptor.sha256, `${label} hash is stale`);
    assert.equal(descriptor.sha256, expectedHash, `${label} does not match signed pinset`);
  }
  const [candidateSchemaJson, learnerActionSchemaJson, learnerViewSchemaJson] = await Promise.all([
    readLimitedJson(
      candidateSchemaPath.realTarget,
      'candidate schema',
      ARTIFACT_LIMITS.single_file,
    ),
    readLimitedJson(
      learnerActionSchemaPath.realTarget,
      'learner action schema',
      ARTIFACT_LIMITS.single_file,
    ),
    readLimitedJson(
      learnerViewSchemaPath.realTarget,
      'learner view schema',
      ARTIFACT_LIMITS.single_file,
    ),
  ]);
  const commonPin = { foundation_commit_sha: pinset.foundation_commit_sha };
  const [candidateValidator, compiler, harness, scoring] = await Promise.all([
    validatePinnedBuildArtifact({
      buildKind: 'CANDIDATE_VALIDATOR',
      descriptor: descriptors.candidate_validator_build,
      integrationTrustRoot,
      pin: {
        ...commonPin,
        artifact_sha256: pinset.runtime_contract.candidate_validator_build_sha256,
        build_id: pinset.runtime_contract.candidate_validator_build_id,
        build_version: pinset.runtime_contract.candidate_validator_build_version,
        report_signing_key_fingerprint:
          pinset.runtime_contract.candidate_validator_report_signing_key_fingerprint,
      },
      repositoryRoot,
      reportSigningKeyRequired: true,
    }),
    validatePinnedBuildArtifact({
      buildKind: 'SAFE_PROJECTION_COMPILER',
      descriptor: descriptors.safe_projection_compiler_build,
      integrationTrustRoot,
      pin: { ...commonPin, ...pinset.builds.safe_projection_compiler },
      repositoryRoot,
      reportSigningKeyRequired: true,
    }),
    validatePinnedBuildArtifact({
      buildKind: 'REVIEW_HARNESS',
      descriptor: descriptors.review_harness_build,
      integrationTrustRoot,
      pin: { ...commonPin, ...pinset.builds.review_harness },
      repositoryRoot,
      reportSigningKeyRequired: true,
    }),
    validatePinnedBuildArtifact({
      buildKind: 'SCORING_SERVICE',
      descriptor: descriptors.scoring_service_build,
      integrationTrustRoot,
      pin: { ...commonPin, ...pinset.builds.scoring_service },
      repositoryRoot,
      reportSigningKeyRequired: false,
    }),
  ]);
  const ajv = new Ajv({ allErrors: true, strict: true });
  let candidateValidatorFunction;
  let learnerActionValidatorFunction;
  let learnerViewValidatorFunction;
  try {
    candidateValidatorFunction = ajv.compile(candidateSchemaJson.value);
    learnerActionValidatorFunction = ajv.compile(learnerActionSchemaJson.value);
    learnerViewValidatorFunction = ajv.compile(learnerViewSchemaJson.value);
  } catch (error) {
    throw new Error(`Pinned foundation JSON schema is invalid: ${error.message}`);
  }
  return {
    candidate_schema: candidateSchemaJson.value,
    candidate_validator: candidateValidator,
    candidate_validator_function: candidateValidatorFunction,
    compiler,
    harness,
    learner_action_schema: learnerActionSchemaJson.value,
    learner_action_validator_function: learnerActionValidatorFunction,
    learner_view_schema: learnerViewSchemaJson.value,
    learner_view_validator_function: learnerViewValidatorFunction,
    scoring,
  };
}

function validateReviewerCredentialDocument(document, expected) {
  assertExactKeys(
    document,
    [
      'credential_id',
      'person_id',
      'public_key_fingerprint',
      'roles',
      'run_id',
      'schema_version',
      'source_plan_sha256',
      'status',
      'wave_id',
    ],
    'reviewer signing credential',
  );
  assert.equal(document.schema_version, REVIEWER_CREDENTIAL_SCHEMA_VERSION);
  requireString(document.credential_id, 'reviewer credential ID', IDENTITY_PATTERN);
  assert.equal(document.source_plan_sha256, expected.sourcePlanSha256);
  assert.equal(document.wave_id, expected.waveId);
  assert.equal(document.person_id, expected.identity.person_id);
  assert.equal(document.run_id, expected.identity.run_id);
  assert.equal(document.public_key_fingerprint, expected.publicKeyFingerprint);
  assert.deepEqual(document.roles, expected.roles);
  assert.equal(document.status, 'ACTIVE');
}

async function validateReviewerCredentials({
  credentials,
  integrationTrustRootPem,
  repositoryRoot,
  sourcePlanSha256,
  waveId,
}) {
  assert(Array.isArray(credentials) && credentials.length > 0);
  const byIdentity = new Map();
  const credentialIds = new Set();
  const publicKeyFingerprints = new Set();
  for (const [index, credential] of credentials.entries()) {
    const label = `reviewer credential[${index}]`;
    assertExactKeys(
      credential,
      [
        'credential_path',
        'credential_sha256',
        'credential_signature_path',
        'credential_signature_sha256',
        'identity',
        'public_key_fingerprint',
        'public_key_path',
        'public_key_sha256',
        'roles',
      ],
      label,
    );
    const identity = requireIdentity(credential.identity, `${label}.identity`);
    assert(Array.isArray(credential.roles) && credential.roles.length > 0);
    credential.roles.forEach((role) => requireString(role, `${label}.role`, IDENTITY_PATTERN));
    assert.deepEqual(
      credential.roles,
      [...new Set(credential.roles)].sort(compareText),
      `${label}.roles must be unique/sorted`,
    );
    const publicKeyResolved = await resolveRealPathInsideRoot(
      repositoryRoot,
      credential.public_key_path,
      `${label}.public_key_path`,
    );
    const publicKey = await readPublicKey(publicKeyResolved.realTarget, `${label} public key`);
    assert.equal(hashBytes(publicKey.bytes), credential.public_key_sha256);
    assert.equal(publicKey.fingerprint, credential.public_key_fingerprint);
    assert(
      !publicKeyFingerprints.has(publicKey.fingerprint),
      `Reviewer signing key ${publicKey.fingerprint} is assigned to multiple identities`,
    );
    publicKeyFingerprints.add(publicKey.fingerprint);
    const signed = await readAndVerifySignedJson({
      documentPath: credential.credential_path,
      documentSha256: credential.credential_sha256,
      label,
      publicKeyPem: integrationTrustRootPem,
      repositoryRoot,
      signaturePath: credential.credential_signature_path,
      signatureSha256: credential.credential_signature_sha256,
    });
    validateReviewerCredentialDocument(signed.value, {
      identity,
      publicKeyFingerprint: publicKey.fingerprint,
      roles: credential.roles,
      sourcePlanSha256,
      waveId,
    });
    assert(
      !credentialIds.has(signed.value.credential_id),
      `Duplicate reviewer credential ID ${signed.value.credential_id}`,
    );
    credentialIds.add(signed.value.credential_id);
    const key = identityKey(identity);
    assert(!byIdentity.has(key), `Duplicate reviewer credential for ${identity.person_id}`);
    byIdentity.set(key, { ...credential, public_key: publicKey, value: signed.value });
  }
  return byIdentity;
}

function credentialForAssignment(credentialsByIdentity, assignment, expectedRole) {
  const identity = {
    person_id: assignment.assignee_person_id,
    run_id: assignment.assignee_run_id,
  };
  const credential = credentialsByIdentity.get(identityKey(identity));
  assert(credential, `Missing signed reviewer credential for ${identity.person_id}`);
  assert(
    credential.roles.includes(expectedRole),
    `${identity.person_id} credential does not authorize ${expectedRole}`,
  );
  return { credential, identity };
}

export {
  ACTION_TRANSITION_PROFILE_SCHEMA_VERSION,
  ARTIFACT_LIMITS,
  BUILD_MANIFEST_SCHEMA_VERSION,
  BUILD_PROVENANCE_SCHEMA_VERSION,
  CANDIDATE_SEMANTIC_PROFILE_SCHEMA_VERSION,
  HASH_PATTERN,
  INTEGRATION_PINSET_SCHEMA_VERSION,
  LEARNER_VIEW_SEMANTIC_PROFILE_SCHEMA_VERSION,
  REVIEWER_CREDENTIAL_SCHEMA_VERSION,
  SIGNATURE_ALGORITHM,
  assertExactKeys,
  assertPlainObject,
  assertUniqueManifestPaths,
  credentialForAssignment,
  directoryHash,
  hashArtifactDirectory,
  hashBytes,
  hashCanonicalJson,
  identityKey,
  loadAndVerifyIntegrationPinset,
  parseLimitedJson,
  publicKeyFingerprint,
  readAndVerifySignedJson,
  readLimitedFile,
  readLimitedJson,
  readPublicKey,
  requireHash,
  requireIdentity,
  requireString,
  resolveRealPathInsideRoot,
  resolveJsonPointer,
  sameIdentity,
  validateArtifactDescriptor,
  validateJsonComplexity,
  validatePinnedBuildArtifact,
  validatePinnedIntegrationArtifacts,
  validateReviewerCredentials,
  verifyBytesSignature,
};
