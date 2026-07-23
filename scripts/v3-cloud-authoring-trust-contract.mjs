import assert from 'node:assert/strict';
import { createHash, createPublicKey, verify as verifySignature } from 'node:crypto';
import { lstat, readFile, readdir, realpath } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';

import Ajv from 'ajv';

const HASH_PATTERN = /^[a-f0-9]{64}$/;
const IDENTITY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:@/+~-]*$/;
const INTEGRATION_PINSET_SCHEMA_VERSION = 'mcat-v3-integration-pinset-1';
const REVIEWER_CREDENTIAL_SCHEMA_VERSION = 'mcat-v3-reviewer-signing-credential-1';
const SIGNATURE_ALGORITHM = 'ED25519';

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

function validatePinsetDocument(pinset, expectedMode) {
  assertExactKeys(
    pinset,
    [
      'builds',
      'foundation_commit_sha',
      'issued_at',
      'learner_contract',
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
      'candidate_schema_id',
      'candidate_schema_sha256',
      'candidate_validator_build_id',
      'candidate_validator_build_sha256',
      'candidate_validator_build_version',
      'runtime_contract_version',
    ],
    'integration pinset runtime contract',
  );
  requireString(pinset.runtime_contract.candidate_definition_path, 'candidate definition path');
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
  requireString(pinset.runtime_contract.runtime_contract_version, 'runtime contract version');
  assertExactKeys(
    pinset.learner_contract,
    ['action_kinds', 'dto_schema_id', 'dto_schema_sha256', 'representation_kinds'],
    'integration pinset learner contract',
  );
  requireString(pinset.learner_contract.dto_schema_id, 'learner DTO schema ID');
  requireHash(pinset.learner_contract.dto_schema_sha256, 'learner DTO schema SHA-256');
  for (const key of ['action_kinds', 'representation_kinds']) {
    const values = pinset.learner_contract[key];
    assert(Array.isArray(values) && values.length > 0, `${key} must not be empty`);
    values.forEach((value) => requireString(value, `${key} item`, IDENTITY_PATTERN));
    assert.deepEqual(
      values,
      [...new Set(values)].sort(compareText),
      `${key} must be unique/sorted`,
    );
  }
  assertExactKeys(
    pinset.builds,
    ['review_harness', 'safe_projection_compiler', 'scoring_service'],
    'integration pinset builds',
  );
  for (const [key, build] of Object.entries(pinset.builds)) {
    const fields = ['artifact_sha256', 'build_id', 'build_version'];
    if (key !== 'scoring_service') fields.push('report_signing_key_fingerprint');
    assertExactKeys(build, fields, `${key} build pin`);
    requireHash(build.artifact_sha256, `${key} artifact SHA-256`);
    requireString(build.build_id, `${key} build ID`, IDENTITY_PATTERN);
    requireString(build.build_version, `${key} build version`, IDENTITY_PATTERN);
    if (key !== 'scoring_service') {
      requireHash(build.report_signing_key_fingerprint, `${key} report signing key fingerprint`);
    }
  }
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
    ['build_id', 'build_kind', 'build_version', 'foundation_commit_sha', 'schema_version'],
    `${expected.buildKind} build manifest`,
  );
  assert.equal(value.schema_version, 'mcat-v3-pinned-build-manifest-1');
  assert.equal(value.build_kind, expected.buildKind);
  assert.equal(value.build_id, expected.buildId);
  assert.equal(value.build_version, expected.buildVersion);
  assert.equal(value.foundation_commit_sha, expected.foundationCommitSha);
}

async function validatePinnedIntegrationArtifacts({ descriptors, pinset, repositoryRoot }) {
  assertExactKeys(
    descriptors,
    [
      'candidate_schema',
      'candidate_validator_build',
      'learner_dto_schema',
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
  const learnerSchemaPath = await resolveRealPathInsideRoot(
    repositoryRoot,
    descriptors.learner_dto_schema.path,
    'learner DTO schema path',
  );
  for (const [descriptor, expectedHash, label] of [
    [
      descriptors.candidate_schema,
      pinset.runtime_contract.candidate_schema_sha256,
      'candidate schema',
    ],
    [
      descriptors.learner_dto_schema,
      pinset.learner_contract.dto_schema_sha256,
      'learner DTO schema',
    ],
  ]) {
    assertExactKeys(descriptor, ['path', 'sha256'], `${label} descriptor`);
    requireHash(descriptor.sha256, `${label} descriptor SHA-256`);
    const resolved =
      label === 'candidate schema' ? candidateSchemaPath.realTarget : learnerSchemaPath.realTarget;
    const bytes = await readLimitedFile(resolved, label, ARTIFACT_LIMITS.single_file);
    assert.equal(hashBytes(bytes), descriptor.sha256, `${label} hash is stale`);
    assert.equal(descriptor.sha256, expectedHash, `${label} does not match signed pinset`);
  }
  const [candidateSchemaJson, learnerSchemaJson] = await Promise.all([
    readLimitedJson(
      candidateSchemaPath.realTarget,
      'candidate schema',
      ARTIFACT_LIMITS.single_file,
    ),
    readLimitedJson(
      learnerSchemaPath.realTarget,
      'learner DTO schema',
      ARTIFACT_LIMITS.single_file,
    ),
  ]);
  const foundationCommitSha = pinset.foundation_commit_sha;
  const candidateValidator = await validateArtifactDescriptor(
    descriptors.candidate_validator_build,
    {
      label: 'candidate validator build artifact',
      limits: ARTIFACT_LIMITS.build,
      repositoryRoot,
      requiredFiles: ['build-manifest.json'],
    },
  );
  assert.equal(
    candidateValidator.artifact_sha256,
    pinset.runtime_contract.candidate_validator_build_sha256,
  );
  const { value: candidateValidatorManifest } = await readLimitedJson(
    join(candidateValidator.real_path, 'build-manifest.json'),
    'candidate validator build manifest',
    ARTIFACT_LIMITS.build,
  );
  validateBuildManifest(candidateValidatorManifest, {
    buildId: pinset.runtime_contract.candidate_validator_build_id,
    buildKind: 'CANDIDATE_VALIDATOR',
    buildVersion: pinset.runtime_contract.candidate_validator_build_version,
    foundationCommitSha,
  });
  const validatePinnedBuild = async (descriptor, pin, buildKind) => {
    const scan = await validateArtifactDescriptor(descriptor, {
      label: `${buildKind} build artifact`,
      limits: ARTIFACT_LIMITS.build,
      repositoryRoot,
      requiredFiles:
        buildKind === 'SCORING_SERVICE'
          ? ['build-manifest.json']
          : ['build-manifest.json', 'report-signing-public-key.pem'],
    });
    assert.equal(scan.artifact_sha256, pin.artifact_sha256);
    const { value: manifest } = await readLimitedJson(
      join(scan.real_path, 'build-manifest.json'),
      `${buildKind} build manifest`,
      ARTIFACT_LIMITS.build,
    );
    validateBuildManifest(manifest, {
      buildId: pin.build_id,
      buildKind,
      buildVersion: pin.build_version,
      foundationCommitSha,
    });
    let signingKey = null;
    if (pin.report_signing_key_fingerprint) {
      signingKey = await readPublicKey(
        join(scan.real_path, 'report-signing-public-key.pem'),
        `${buildKind} report signing public key`,
        ARTIFACT_LIMITS.build,
      );
      assert.equal(signingKey.fingerprint, pin.report_signing_key_fingerprint);
    }
    return { ...scan, manifest, signing_key: signingKey };
  };
  const [compiler, harness, scoring] = await Promise.all([
    validatePinnedBuild(
      descriptors.safe_projection_compiler_build,
      pinset.builds.safe_projection_compiler,
      'SAFE_PROJECTION_COMPILER',
    ),
    validatePinnedBuild(
      descriptors.review_harness_build,
      pinset.builds.review_harness,
      'REVIEW_HARNESS',
    ),
    validatePinnedBuild(
      descriptors.scoring_service_build,
      pinset.builds.scoring_service,
      'SCORING_SERVICE',
    ),
  ]);
  const ajv = new Ajv({ allErrors: true, strict: true });
  let candidateValidatorFunction;
  let learnerDtoValidatorFunction;
  try {
    candidateValidatorFunction = ajv.compile(candidateSchemaJson.value);
    learnerDtoValidatorFunction = ajv.compile(learnerSchemaJson.value);
  } catch (error) {
    throw new Error(`Pinned foundation JSON schema is invalid: ${error.message}`);
  }
  return {
    candidate_schema: candidateSchemaJson.value,
    candidate_validator: candidateValidator,
    candidate_validator_function: candidateValidatorFunction,
    compiler,
    harness,
    learner_dto_schema: learnerSchemaJson.value,
    learner_dto_validator_function: learnerDtoValidatorFunction,
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
  ARTIFACT_LIMITS,
  HASH_PATTERN,
  INTEGRATION_PINSET_SCHEMA_VERSION,
  REVIEWER_CREDENTIAL_SCHEMA_VERSION,
  SIGNATURE_ALGORITHM,
  assertExactKeys,
  assertPlainObject,
  assertUniqueManifestPaths,
  credentialForAssignment,
  directoryHash,
  hashArtifactDirectory,
  hashBytes,
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
  sameIdentity,
  validateArtifactDescriptor,
  validateJsonComplexity,
  validatePinnedIntegrationArtifacts,
  validateReviewerCredentials,
  verifyBytesSignature,
};
