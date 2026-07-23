import assert from 'node:assert/strict';
import { lstat, readFile, readdir, realpath } from 'node:fs/promises';
import { extname, isAbsolute, join, relative, resolve, sep } from 'node:path';

import { hashText } from './generate-v3-cloud-authoring-plan.mjs';

const CLOSED_BUNDLE_SCHEMA_VERSION = 'mcat-v3-closed-sanitized-review-bundle-1';
const CLOSED_BUNDLE_SCANNER_ID = 'V3_CLOSED_REVIEW_BUNDLE_SCAN_V1';
const CANDIDATE_MANIFEST_SCHEMA_VERSION = 'mcat-v3-candidate-artifact-manifest-1';
const GATE_REPORT_SCHEMA_VERSION = 'mcat-v3-gate-evidence-report-1';
const ATTEMPT_LOG_SCHEMA_VERSION = 'mcat-v3-blind-solve-attempt-log-1';
const OPAQUE_SERVICE_ATTESTATION_SCHEMA_VERSION = 'mcat-v3-opaque-service-acl-attestation-1';
const WAVE_SIMILARITY_REPORT_SCHEMA_VERSION = 'mcat-v3-wave-similarity-report-1';
const HASH_PATTERN = /^[a-f0-9]{64}$/;

const BUNDLE_FILES = Object.freeze({
  ACCESSIBILITY_ONLY: Object.freeze([
    'accessibility-behavior.json',
    'accessibility-path-simulation.json',
    'bundle-manifest.json',
    'learner-safe-activities.json',
    'learner-safe-views.json',
  ]),
  BLIND_SOLVE: Object.freeze([
    'blind-client-runtime.json',
    'bundle-manifest.json',
    'learner-safe-activities.json',
    'learner-safe-views.json',
  ]),
});

const EXCLUDED_CONTENT_CLASSES = Object.freeze([
  'answer_keys',
  'author_branch_history',
  'diagnostic_mappings',
  'protected_scoring_material',
  'rationales_before_response',
  'server_definitions',
]);

const REQUIRED_BLIND_PATH_IDS = Object.freeze([
  'CORRECT_RESPONSE',
  'HELP_REQUEST',
  'INCORRECT_RESPONSE',
  'INTERRUPTION_AND_RESUME',
  'INVALID_ACTIVITY',
  'MIXED_ROUTE',
  'OMISSION',
  'REPAIR_LIMIT',
  'RETRY',
  'REVEAL',
]);

const REQUIRED_REQUEST_KINDS_BY_BLIND_PATH = Object.freeze({
  CORRECT_RESPONSE: Object.freeze(['SUBMIT_RESPONSE']),
  HELP_REQUEST: Object.freeze(['REQUEST_HELP']),
  INCORRECT_RESPONSE: Object.freeze(['SUBMIT_RESPONSE']),
  INTERRUPTION_AND_RESUME: Object.freeze(['INTERRUPT', 'RESUME']),
  INVALID_ACTIVITY: Object.freeze(['SUBMIT_RESPONSE']),
  MIXED_ROUTE: Object.freeze(['SUBMIT_RESPONSE']),
  OMISSION: Object.freeze(['SUBMIT_RESPONSE']),
  REPAIR_LIMIT: Object.freeze(['SUBMIT_RESPONSE']),
  RETRY: Object.freeze(['SUBMIT_RESPONSE']),
  REVEAL: Object.freeze(['SUBMIT_RESPONSE']),
});

const REQUIRED_GATE_CHECK_IDS = Object.freeze({
  G01_RELEASE_PIN_AND_REFERENCE_LINT: Object.freeze([
    'CANONICAL_REFERENCE_RESOLUTION',
    'PLAN_CONTRACT_AND_REGISTRY_PINS',
  ]),
  G02_CANONICAL_SHELL_AND_KC_OWNERSHIP: Object.freeze([
    'KC_OWNERSHIP_AND_ORDER',
    'LESSON_GROUPING_KC_IDENTITY',
  ]),
  G03_LESSON_CONTRACT_COMPLETENESS: Object.freeze([
    'DETERMINISTIC_RUNTIME_GRAPH',
    'LESSON_CONTRACT_SCHEMA',
  ]),
  G04_ATTACHMENTS_REPAIR_AND_NO_BYPASS: Object.freeze([
    'ATTACHMENT_DELIVERY_STATE',
    'NO_ACCELERATED_BYPASS',
    'REPAIR_AND_EXACT_REENTRY',
  ]),
  G06_INDEPENDENT_CONTENT_PEDAGOGY_AUDIT: Object.freeze(['CONTENT_PEDAGOGY_INDEPENDENT_APPROVAL']),
  G07_INDEPENDENT_BLIND_SOLVE: Object.freeze(['OPAQUE_REAL_RESPONSE_BLIND_SOLVE_APPROVAL']),
  G08_ACCESSIBILITY_TECHNICAL_AUDIT: Object.freeze([
    'ACCESSIBILITY_TECHNICAL_INDEPENDENT_APPROVAL',
  ]),
});

const FORBIDDEN_FIELD_NAMES = new Set([
  'answer',
  'answer_key',
  'answer_keys',
  'correct_answer',
  'correct_option',
  'diagnostic_mapping',
  'diagnostic_mappings',
  'expected',
  'expected_answer',
  'expected_response',
  'key',
  'keys',
  'primary_construct_mapping',
  'rationale',
  'rationales',
  'required_secondary_mappings',
  'scoring_rule',
  'solution',
  'solutions',
]);

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sortedUnique(values) {
  return [...new Set(values)].sort(compareText);
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

function requireString(value, label) {
  assert.equal(typeof value, 'string', `${label} must be a string`);
  assert(value.length > 0, `${label} must not be empty`);
  return value;
}

function requireHash(value, label) {
  requireString(value, label);
  assert.match(value, HASH_PATTERN, `${label} must be a lowercase SHA-256`);
  return value;
}

function assertStringArray(value, label, { allowEmpty = false } = {}) {
  assert(Array.isArray(value), `${label} must be an array`);
  if (!allowEmpty) assert(value.length > 0, `${label} must not be empty`);
  for (const item of value) requireString(item, `${label} item`);
}

function assertNoForbiddenFields(value, path = '$') {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoForbiddenFields(item, `${path}[${index}]`));
    return;
  }
  if (value === null || typeof value !== 'object') return;
  for (const [key, item] of Object.entries(value)) {
    assert(
      !FORBIDDEN_FIELD_NAMES.has(key.toLowerCase()),
      `${path}.${key} is a forbidden protected field`,
    );
    assertNoForbiddenFields(item, `${path}.${key}`);
  }
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

async function listRegularFiles(rootPath, currentPath = rootPath) {
  const stats = await lstat(currentPath);
  assert.equal(stats.isSymbolicLink(), false, `Artifact may not contain symlinks: ${currentPath}`);
  if (stats.isFile()) return [currentPath];
  assert(stats.isDirectory(), `Unsupported artifact node: ${currentPath}`);
  const entries = await readdir(currentPath, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((left, right) => compareText(left.name, right.name))) {
    const path = join(currentPath, entry.name);
    assert.equal(entry.isSymbolicLink(), false, `Artifact may not contain symlinks: ${path}`);
    if (entry.isDirectory()) {
      files.push(...(await listRegularFiles(rootPath, path)));
    } else {
      assert(entry.isFile(), `Unsupported artifact node: ${path}`);
      files.push(path);
    }
  }
  return files;
}

async function readJsonFile(path, label) {
  const bytes = await readFile(path);
  const text = bytes.toString('utf8');
  assert(Buffer.from(text, 'utf8').equals(bytes), `${label} must be UTF-8 JSON`);
  assert.equal(text.includes('\u0000'), false, `${label} contains a NUL byte`);
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error(`${label} is not valid JSON`);
  }
  return { bytes, text, value };
}

function directoryHash(files) {
  return hashText(files.map((file) => `${file.path}\u0000${file.sha256}\n`).join(''));
}

function validatePrompt(prompt, label) {
  assertExactKeys(prompt, ['format', 'text'], label);
  assert.equal(prompt.format, 'PLAIN_TEXT');
  requireString(prompt.text, `${label}.text`);
}

function validateResponse(response, label) {
  assertExactKeys(response, ['mode', 'options'], label);
  assert(
    ['FREE_TEXT', 'MULTI_SELECT', 'NUMERIC', 'SINGLE_SELECT'].includes(response.mode),
    `${label}.mode is invalid`,
  );
  assert(Array.isArray(response.options), `${label}.options must be an array`);
  if (response.mode === 'SINGLE_SELECT' || response.mode === 'MULTI_SELECT') {
    assert(response.options.length >= 2, `${label}.options requires at least two options`);
  } else {
    assert.equal(response.options.length, 0, `${label}.options must be empty for free response`);
  }
  const optionIds = new Set();
  for (const [index, option] of response.options.entries()) {
    const optionLabel = `${label}.options[${index}]`;
    assertExactKeys(option, ['label', 'option_id'], optionLabel);
    requireString(option.option_id, `${optionLabel}.option_id`);
    requireString(option.label, `${optionLabel}.label`);
    assert(!optionIds.has(option.option_id), `${label} duplicates option ${option.option_id}`);
    optionIds.add(option.option_id);
  }
}

function validateLearnerSupport(support, label) {
  assert(Array.isArray(support), `${label} must be an array`);
  for (const [index, item] of support.entries()) {
    const itemLabel = `${label}[${index}]`;
    assertExactKeys(item, ['availability', 'support_id', 'text'], itemLabel);
    assert(
      ['AFTER_ATTEMPT', 'ON_REQUEST'].includes(item.availability),
      `${itemLabel}.availability is invalid`,
    );
    requireString(item.support_id, `${itemLabel}.support_id`);
    requireString(item.text, `${itemLabel}.text`);
  }
}

function validateActivities(value) {
  assertExactKeys(value, ['activities', 'schema_version'], 'learner-safe activities');
  assert.equal(value.schema_version, 'mcat-v3-learner-safe-activities-1');
  assert(Array.isArray(value.activities) && value.activities.length > 0);
  const activityIds = new Set();
  for (const [index, activity] of value.activities.entries()) {
    const label = `learner-safe activities.activities[${index}]`;
    assertExactKeys(
      activity,
      ['activity_id', 'learner_support', 'prompt', 'response', 'view_ids'],
      label,
    );
    requireString(activity.activity_id, `${label}.activity_id`);
    assert(!activityIds.has(activity.activity_id), `Duplicate activity ${activity.activity_id}`);
    activityIds.add(activity.activity_id);
    validatePrompt(activity.prompt, `${label}.prompt`);
    validateResponse(activity.response, `${label}.response`);
    assertStringArray(activity.view_ids, `${label}.view_ids`, { allowEmpty: true });
    validateLearnerSupport(activity.learner_support, `${label}.learner_support`);
  }
}

function validateTextView(view, label) {
  assertExactKeys(view, ['kind', 'text', 'view_id'], label);
  requireString(view.text, `${label}.text`);
}

function validateEquationView(view, label) {
  assertExactKeys(view, ['expression', 'kind', 'spoken_text', 'view_id'], label);
  requireString(view.expression, `${label}.expression`);
  requireString(view.spoken_text, `${label}.spoken_text`);
}

function validateTableView(view, label) {
  assertExactKeys(view, ['columns', 'kind', 'rows', 'summary', 'view_id'], label);
  assertStringArray(view.columns, `${label}.columns`);
  requireString(view.summary, `${label}.summary`);
  assert(Array.isArray(view.rows) && view.rows.length > 0, `${label}.rows must not be empty`);
  for (const [index, row] of view.rows.entries()) {
    assertStringArray(row, `${label}.rows[${index}]`);
    assert.equal(row.length, view.columns.length, `${label}.rows[${index}] has wrong width`);
  }
}

function validateSeriesView(view, label) {
  assertExactKeys(view, ['kind', 'series', 'view_id', 'x_label', 'y_label'], label);
  requireString(view.x_label, `${label}.x_label`);
  requireString(view.y_label, `${label}.y_label`);
  assert(Array.isArray(view.series) && view.series.length > 0, `${label}.series must not be empty`);
  for (const [seriesIndex, series] of view.series.entries()) {
    const seriesLabel = `${label}.series[${seriesIndex}]`;
    assertExactKeys(series, ['label', 'points', 'series_id'], seriesLabel);
    requireString(series.series_id, `${seriesLabel}.series_id`);
    requireString(series.label, `${seriesLabel}.label`);
    assert(Array.isArray(series.points) && series.points.length > 0);
    for (const [pointIndex, point] of series.points.entries()) {
      const pointLabel = `${seriesLabel}.points[${pointIndex}]`;
      assertExactKeys(point, ['x', 'y'], pointLabel);
      assert.equal(typeof point.x, 'number', `${pointLabel}.x must be numeric`);
      assert.equal(typeof point.y, 'number', `${pointLabel}.y must be numeric`);
      assert(Number.isFinite(point.x) && Number.isFinite(point.y), `${pointLabel} must be finite`);
    }
  }
}

function validateDiagramView(view, label) {
  assertExactKeys(view, ['edges', 'kind', 'nodes', 'summary', 'view_id'], label);
  requireString(view.summary, `${label}.summary`);
  assert(Array.isArray(view.nodes) && view.nodes.length > 0);
  const nodeIds = new Set();
  for (const [index, node] of view.nodes.entries()) {
    const nodeLabel = `${label}.nodes[${index}]`;
    assertExactKeys(node, ['label', 'node_id', 'x', 'y'], nodeLabel);
    requireString(node.node_id, `${nodeLabel}.node_id`);
    requireString(node.label, `${nodeLabel}.label`);
    assert.equal(typeof node.x, 'number');
    assert.equal(typeof node.y, 'number');
    assert(!nodeIds.has(node.node_id), `${label} duplicates node ${node.node_id}`);
    nodeIds.add(node.node_id);
  }
  assert(Array.isArray(view.edges), `${label}.edges must be an array`);
  for (const [index, edge] of view.edges.entries()) {
    const edgeLabel = `${label}.edges[${index}]`;
    assertExactKeys(edge, ['from_node_id', 'label', 'to_node_id'], edgeLabel);
    assert(nodeIds.has(edge.from_node_id), `${edgeLabel}.from_node_id is unknown`);
    assert(nodeIds.has(edge.to_node_id), `${edgeLabel}.to_node_id is unknown`);
    requireString(edge.label, `${edgeLabel}.label`);
  }
}

function validateViews(value) {
  assertExactKeys(value, ['schema_version', 'views'], 'learner-safe views');
  assert.equal(value.schema_version, 'mcat-v3-learner-safe-views-1');
  assert(Array.isArray(value.views), 'learner-safe views.views must be an array');
  const viewIds = new Set();
  for (const [index, view] of value.views.entries()) {
    const label = `learner-safe views.views[${index}]`;
    assertPlainObject(view, label);
    requireString(view.view_id, `${label}.view_id`);
    assert(!viewIds.has(view.view_id), `Duplicate view ${view.view_id}`);
    viewIds.add(view.view_id);
    if (view.kind === 'TEXT') validateTextView(view, label);
    else if (view.kind === 'EQUATION') validateEquationView(view, label);
    else if (view.kind === 'TABLE') validateTableView(view, label);
    else if (view.kind === 'SERIES') validateSeriesView(view, label);
    else if (view.kind === 'DIAGRAM') validateDiagramView(view, label);
    else throw new Error(`${label}.kind is invalid`);
  }
  return viewIds;
}

function validateActivityViewReferences(activities, viewIds) {
  for (const activity of activities.activities) {
    for (const viewId of activity.view_ids) {
      assert(viewIds.has(viewId), `${activity.activity_id} references unknown view ${viewId}`);
    }
  }
}

function validateBlindClientRuntime(value) {
  assertExactKeys(
    value,
    [
      'client_scoring_authority',
      'outcome_override_controls',
      'rationales_before_response',
      'request_fields',
      'response_fields',
      'schema_version',
      'service_protocol',
      'submit_endpoint_path',
    ],
    'blind client runtime',
  );
  assert.equal(value.schema_version, 'mcat-v3-opaque-blind-client-runtime-1');
  assert.equal(value.service_protocol, 'OPAQUE_REAL_RESPONSE_SCORING_V1');
  assert.equal(value.submit_endpoint_path, '/submit');
  assert.deepEqual(value.request_fields, ['activity_id', 'response', 'session_token']);
  assert.deepEqual(value.response_fields, [
    'attempt_id',
    'learner_feedback',
    'learner_outcome',
    'next_state',
  ]);
  assert.equal(value.client_scoring_authority, false);
  assert.equal(value.outcome_override_controls, false);
  assert.equal(value.rationales_before_response, false);
  const serialized = JSON.stringify(value);
  assert.equal(
    /simulate_(?:correct|incorrect)_path/i.test(serialized),
    false,
    'Blind clients may not contain reviewer-controlled outcome simulation',
  );
}

function validateAccessibilityBehavior(value) {
  assertExactKeys(
    value,
    ['checks', 'input_modes', 'schema_version', 'viewport_profiles'],
    'accessibility behavior',
  );
  assert.equal(value.schema_version, 'mcat-v3-accessibility-review-behavior-1');
  assertStringArray(value.checks, 'accessibility behavior.checks');
  assertStringArray(value.input_modes, 'accessibility behavior.input_modes');
  assertStringArray(value.viewport_profiles, 'accessibility behavior.viewport_profiles');
}

function validateAccessibilitySimulation(value) {
  assertExactKeys(value, ['scenarios', 'schema_version'], 'accessibility path simulation');
  assert.equal(value.schema_version, 'mcat-v3-accessibility-path-simulation-1');
  assert(Array.isArray(value.scenarios) && value.scenarios.length > 0);
  for (const [index, scenario] of value.scenarios.entries()) {
    const label = `accessibility path simulation.scenarios[${index}]`;
    assertExactKeys(scenario, ['learner_outcome', 'path_events', 'scenario_id'], label);
    requireString(scenario.scenario_id, `${label}.scenario_id`);
    assert(
      ['CORRECT', 'INCORRECT', 'INVALID', 'OMITTED'].includes(scenario.learner_outcome),
      `${label}.learner_outcome is invalid`,
    );
    assertStringArray(scenario.path_events, `${label}.path_events`);
  }
}

function validateBundleManifest(value, expected) {
  assertExactKeys(
    value,
    [
      'accessibility_path_simulation_included',
      'author_branch_included',
      'bundle_kind',
      'excluded_content_classes',
      'included_files',
      'job_id',
      'lesson_id',
      'protected_scoring_material_included',
      'rationales_before_response_included',
      'reviewed_candidate_sha256',
      'schema_version',
      'server_definition_included',
      'source_plan_sha256',
      'wave_id',
    ],
    'bundle manifest',
  );
  assert.equal(value.schema_version, CLOSED_BUNDLE_SCHEMA_VERSION);
  assert.equal(value.bundle_kind, expected.bundleKind);
  assert.equal(value.source_plan_sha256, expected.sourcePlanSha256);
  assert.equal(value.reviewed_candidate_sha256, expected.reviewedCandidateSha256);
  assert.equal(value.wave_id, expected.waveId);
  assert.equal(value.job_id, expected.jobId);
  assert.equal(value.lesson_id, expected.lessonId);
  assert.deepEqual(value.included_files, BUNDLE_FILES[expected.bundleKind]);
  assert.deepEqual(value.excluded_content_classes, EXCLUDED_CONTENT_CLASSES);
  assert.equal(value.author_branch_included, false);
  assert.equal(value.server_definition_included, false);
  assert.equal(value.protected_scoring_material_included, false);
  assert.equal(value.rationales_before_response_included, false);
  assert.equal(
    value.accessibility_path_simulation_included,
    expected.bundleKind === 'ACCESSIBILITY_ONLY',
  );
}

function createClosedReviewBundleManifest({
  bundleKind,
  jobId,
  lessonId,
  reviewedCandidateSha256,
  sourcePlanSha256,
  waveId,
}) {
  assert(Object.hasOwn(BUNDLE_FILES, bundleKind), `Unknown bundle kind ${bundleKind}`);
  requireHash(reviewedCandidateSha256, 'reviewed candidate SHA-256');
  requireHash(sourcePlanSha256, 'source plan SHA-256');
  return {
    accessibility_path_simulation_included: bundleKind === 'ACCESSIBILITY_ONLY',
    author_branch_included: false,
    bundle_kind: bundleKind,
    excluded_content_classes: [...EXCLUDED_CONTENT_CLASSES],
    included_files: [...BUNDLE_FILES[bundleKind]],
    job_id: jobId,
    lesson_id: lessonId,
    protected_scoring_material_included: false,
    rationales_before_response_included: false,
    reviewed_candidate_sha256: reviewedCandidateSha256,
    schema_version: CLOSED_BUNDLE_SCHEMA_VERSION,
    server_definition_included: false,
    source_plan_sha256: sourcePlanSha256,
    wave_id: waveId,
  };
}

async function validateAndHashClosedReviewBundle({
  bundleKind,
  bundlePath,
  jobId,
  lessonId,
  repositoryRoot,
  reviewedCandidateSha256,
  sourcePlanSha256,
  waveId,
}) {
  assert(Object.hasOwn(BUNDLE_FILES, bundleKind), `Unknown bundle kind ${bundleKind}`);
  const { realTarget } = await resolveRealPathInsideRoot(
    repositoryRoot,
    bundlePath,
    `${jobId} ${bundleKind} bundle path`,
  );
  const stats = await lstat(realTarget);
  assert(stats.isDirectory(), `${jobId} ${bundleKind} bundle must be a directory`);
  const absoluteFiles = await listRegularFiles(realTarget);
  const relativeFiles = absoluteFiles
    .map((path) => relative(realTarget, path).split(sep).join('/'))
    .sort(compareText);
  assert.deepEqual(
    relativeFiles,
    BUNDLE_FILES[bundleKind],
    `${jobId} ${bundleKind} must contain the exact closed file set`,
  );
  assert(
    relativeFiles.every((path) => extname(path) === '.json' && !path.includes('/')),
    `${jobId} ${bundleKind} permits root-level JSON files only`,
  );

  const documents = new Map();
  const files = [];
  for (const relativePath of relativeFiles) {
    const { bytes, value } = await readJsonFile(
      join(realTarget, relativePath),
      `${jobId} ${bundleKind} ${relativePath}`,
    );
    assertNoForbiddenFields(value, relativePath);
    documents.set(relativePath, value);
    files.push({ path: relativePath, sha256: hashText(bytes) });
  }

  const expected = {
    bundleKind,
    jobId,
    lessonId,
    reviewedCandidateSha256,
    sourcePlanSha256,
    waveId,
  };
  validateBundleManifest(documents.get('bundle-manifest.json'), expected);
  const activities = documents.get('learner-safe-activities.json');
  validateActivities(activities);
  const viewIds = validateViews(documents.get('learner-safe-views.json'));
  validateActivityViewReferences(activities, viewIds);
  if (bundleKind === 'BLIND_SOLVE') {
    validateBlindClientRuntime(documents.get('blind-client-runtime.json'));
  } else {
    validateAccessibilityBehavior(documents.get('accessibility-behavior.json'));
    validateAccessibilitySimulation(documents.get('accessibility-path-simulation.json'));
  }

  const bundleSha256 = directoryHash(files);
  const report = {
    bundle_kind: bundleKind,
    bundle_sha256: bundleSha256,
    files,
    scanner_id: CLOSED_BUNDLE_SCANNER_ID,
  };
  return {
    bundle_sha256: bundleSha256,
    files,
    real_path: realTarget,
    report_sha256: hashText(JSON.stringify(report)),
    scanner_id: CLOSED_BUNDLE_SCANNER_ID,
  };
}

function validateCandidateManifest(value, expected) {
  assertExactKeys(
    value,
    [
      'contains_key_bearing_server_definition',
      'job_id',
      'lesson_id',
      'runtime_contract_version',
      'schema_version',
      'source_plan_sha256',
      'wave_id',
    ],
    'candidate manifest',
  );
  assert.equal(value.schema_version, CANDIDATE_MANIFEST_SCHEMA_VERSION);
  assert.equal(value.source_plan_sha256, expected.sourcePlanSha256);
  assert.equal(value.wave_id, expected.waveId);
  assert.equal(value.job_id, expected.jobId);
  assert.equal(value.lesson_id, expected.lessonId);
  assert.equal(value.contains_key_bearing_server_definition, true);
  requireString(value.runtime_contract_version, 'candidate runtime contract version');
}

async function validateAndHashCandidateArtifact({
  artifactPath,
  expectedFileManifest,
  expectedSha256,
  jobId,
  lessonId,
  repositoryRoot,
  sourcePlanSha256,
  waveId,
}) {
  const { realTarget } = await resolveRealPathInsideRoot(
    repositoryRoot,
    artifactPath,
    `${jobId} candidate artifact path`,
  );
  const stats = await lstat(realTarget);
  assert(stats.isDirectory(), `${jobId} candidate artifact must be a directory`);
  const absoluteFiles = await listRegularFiles(realTarget);
  assert(absoluteFiles.length > 1, `${jobId} candidate artifact is incomplete`);
  const files = [];
  for (const absolutePath of absoluteFiles) {
    const relativePath = relative(realTarget, absolutePath).split(sep).join('/');
    const bytes = await readFile(absolutePath);
    files.push({ path: relativePath, sha256: hashText(bytes) });
  }
  files.sort((left, right) => compareText(left.path, right.path));
  assert.deepEqual(files, expectedFileManifest, `${jobId} candidate file manifest is stale`);
  const artifactSha256 = directoryHash(files);
  assert.equal(artifactSha256, expectedSha256, `${jobId} candidate artifact hash is stale`);
  const manifestFile = files.find((file) => file.path === 'candidate-manifest.json');
  assert(manifestFile, `${jobId} candidate artifact lacks candidate-manifest.json`);
  const { value: manifest } = await readJsonFile(
    join(realTarget, 'candidate-manifest.json'),
    `${jobId} candidate manifest`,
  );
  validateCandidateManifest(manifest, {
    jobId,
    lessonId,
    sourcePlanSha256,
    waveId,
  });
  return { artifact_sha256: artifactSha256, files, real_path: realTarget };
}

function validateGateReportDocument(value, expected) {
  assertExactKeys(
    value,
    [
      'candidate_sha256',
      'checks',
      'gate_id',
      'job_id',
      'lesson_id',
      'report_id',
      'reviewed_artifact_sha256',
      'schema_version',
      'source_plan_sha256',
      'status',
      'wave_id',
    ],
    `${expected.gateId} gate report`,
  );
  assert.equal(value.schema_version, GATE_REPORT_SCHEMA_VERSION);
  assert.equal(value.gate_id, expected.gateId);
  assert.equal(value.source_plan_sha256, expected.sourcePlanSha256);
  assert.equal(value.wave_id, expected.waveId);
  assert.equal(value.job_id, expected.jobId);
  assert.equal(value.lesson_id, expected.lessonId);
  assert.equal(value.candidate_sha256, expected.candidateSha256);
  assert.equal(value.reviewed_artifact_sha256, expected.reviewedArtifactSha256);
  assert.equal(value.status, 'APPROVED');
  requireString(value.report_id, `${expected.gateId} report ID`);
  assert(Array.isArray(value.checks) && value.checks.length > 0);
  for (const [index, check] of value.checks.entries()) {
    assertExactKeys(check, ['check_id', 'status'], `${expected.gateId} checks[${index}]`);
    requireString(check.check_id, `${expected.gateId} check ID`);
    assert.equal(check.status, 'PASS');
  }
  assert.deepEqual(
    value.checks.map((check) => check.check_id).sort(compareText),
    [...REQUIRED_GATE_CHECK_IDS[expected.gateId]],
    `${expected.gateId} report is missing required checks`,
  );
}

async function validateHashedGateReport({
  candidateSha256,
  descriptor,
  gateId,
  jobId,
  lessonId,
  repositoryRoot,
  reviewedArtifactSha256,
  sourcePlanSha256,
  waveId,
}) {
  const { realTarget } = await resolveRealPathInsideRoot(
    repositoryRoot,
    descriptor.report_path,
    `${jobId} ${gateId} report path`,
  );
  const { bytes, value } = await readJsonFile(realTarget, `${jobId} ${gateId} report`);
  assert.equal(
    hashText(bytes),
    descriptor.report_sha256,
    `${jobId} ${gateId} report hash is stale`,
  );
  validateGateReportDocument(value, {
    candidateSha256,
    gateId,
    jobId,
    lessonId,
    reviewedArtifactSha256,
    sourcePlanSha256,
    waveId,
  });
}

function validateAttemptLogDocument(value, expected) {
  assertExactKeys(
    value,
    [
      'attempts',
      'candidate_sha256',
      'job_id',
      'lesson_id',
      'path_coverage',
      'safe_client_sha256',
      'schema_version',
      'service_deployment_artifact_sha256',
      'solver_identity',
      'source_plan_sha256',
      'wave_id',
    ],
    'blind-solve attempt log',
  );
  assert.equal(value.schema_version, ATTEMPT_LOG_SCHEMA_VERSION);
  assert.equal(value.source_plan_sha256, expected.sourcePlanSha256);
  assert.equal(value.wave_id, expected.waveId);
  assert.equal(value.job_id, expected.jobId);
  assert.equal(value.lesson_id, expected.lessonId);
  assert.equal(value.candidate_sha256, expected.candidateSha256);
  assert.equal(value.safe_client_sha256, expected.safeClientSha256);
  assert.equal(value.service_deployment_artifact_sha256, expected.serviceDeploymentArtifactSha256);
  assert.deepEqual(value.solver_identity, expected.solverIdentity);
  assert(Array.isArray(value.attempts) && value.attempts.length > 0);
  const attemptIds = new Set();
  const attemptsById = new Map();
  const coveredByAttempts = new Set();
  let realResponseSubmissionCount = 0;
  for (const [index, attempt] of value.attempts.entries()) {
    const label = `blind-solve attempt log.attempts[${index}]`;
    assertExactKeys(
      attempt,
      [
        'activity_id',
        'attempt_id',
        'learner_feedback_code',
        'learner_outcome',
        'path_ids',
        'request_kind',
        'submitted_response_sha256',
      ],
      label,
    );
    requireString(attempt.activity_id, `${label}.activity_id`);
    requireString(attempt.attempt_id, `${label}.attempt_id`);
    assert(!attemptIds.has(attempt.attempt_id), `Duplicate attempt ${attempt.attempt_id}`);
    attemptIds.add(attempt.attempt_id);
    assert(
      ['INTERRUPT', 'REQUEST_HELP', 'RESUME', 'SUBMIT_RESPONSE'].includes(attempt.request_kind),
      `${label}.request_kind is invalid`,
    );
    if (attempt.request_kind === 'SUBMIT_RESPONSE') {
      requireHash(attempt.submitted_response_sha256, `${label}.submitted_response_sha256`);
      realResponseSubmissionCount += 1;
    } else {
      assert.equal(attempt.submitted_response_sha256, null);
    }
    assert(
      [
        'CORRECT',
        'HELP_SHOWN',
        'INCORRECT',
        'INTERRUPTED',
        'INVALID',
        'OMITTED',
        'REPAIR_LIMIT',
        'RESUMED',
        'RETRY',
        'REVEALED',
      ].includes(attempt.learner_outcome),
      `${label}.learner_outcome is invalid`,
    );
    requireString(attempt.learner_feedback_code, `${label}.learner_feedback_code`);
    assertStringArray(attempt.path_ids, `${label}.path_ids`);
    for (const pathId of attempt.path_ids) {
      assert(REQUIRED_BLIND_PATH_IDS.includes(pathId), `${label} contains unknown path ${pathId}`);
      coveredByAttempts.add(pathId);
    }
    attemptsById.set(attempt.attempt_id, attempt);
  }
  assert(realResponseSubmissionCount > 0, 'Blind solve must include real submitted responses');
  assert(Array.isArray(value.path_coverage));
  const coverageByPathId = new Map();
  for (const [index, coverage] of value.path_coverage.entries()) {
    const label = `blind-solve attempt log.path_coverage[${index}]`;
    assertExactKeys(coverage, ['attempt_ids', 'covered', 'path_id'], label);
    requireString(coverage.path_id, `${label}.path_id`);
    assert(!coverageByPathId.has(coverage.path_id), `Duplicate coverage ${coverage.path_id}`);
    assert.equal(coverage.covered, true);
    assertStringArray(coverage.attempt_ids, `${label}.attempt_ids`);
    assert(
      coverage.attempt_ids.every((attemptId) => attemptIds.has(attemptId)),
      `${label} references an unknown attempt`,
    );
    assert(
      coverage.attempt_ids.every((attemptId) =>
        attemptsById.get(attemptId).path_ids.includes(coverage.path_id),
      ),
      `${label} cites an attempt that does not carry its path`,
    );
    assert(coveredByAttempts.has(coverage.path_id), `${label} lacks attempt path evidence`);
    coverageByPathId.set(coverage.path_id, coverage);
  }
  assert.deepEqual([...coverageByPathId.keys()].sort(compareText), [...REQUIRED_BLIND_PATH_IDS]);
  for (const [pathId, requiredRequestKinds] of Object.entries(
    REQUIRED_REQUEST_KINDS_BY_BLIND_PATH,
  )) {
    const pathAttempts = [...attemptsById.values()].filter((attempt) =>
      attempt.path_ids.includes(pathId),
    );
    for (const requestKind of requiredRequestKinds) {
      assert(
        pathAttempts.some((attempt) => attempt.request_kind === requestKind),
        `${pathId} lacks required ${requestKind} evidence`,
      );
    }
  }
}

async function validateHashedAttemptLog({
  attemptLogPath,
  attemptLogSha256,
  candidateSha256,
  jobId,
  lessonId,
  repositoryRoot,
  safeClientSha256,
  serviceDeploymentArtifactSha256,
  solverIdentity,
  sourcePlanSha256,
  waveId,
}) {
  const { realTarget } = await resolveRealPathInsideRoot(
    repositoryRoot,
    attemptLogPath,
    `${jobId} blind-solve attempt log path`,
  );
  const { bytes, value } = await readJsonFile(realTarget, `${jobId} blind-solve attempt log`);
  assert.equal(hashText(bytes), attemptLogSha256, `${jobId} attempt log hash is stale`);
  assertNoForbiddenFields(value, 'blind-solve attempt log');
  validateAttemptLogDocument(value, {
    candidateSha256,
    jobId,
    lessonId,
    safeClientSha256,
    serviceDeploymentArtifactSha256,
    solverIdentity,
    sourcePlanSha256,
    waveId,
  });
}

function validateOpaqueServiceAttestationDocument(value, expected) {
  assertExactKeys(
    value,
    [
      'accepts_real_submitted_responses',
      'candidate_sha256',
      'ephemeral',
      'exact_key_bearing_candidate_deployed',
      'integrator_identity',
      'job_id',
      'lesson_id',
      'ordinary_learner_authorized_feedback_only',
      'outcome_override_controls_exposed',
      'protected_scoring_material_exposed',
      'rationales_before_response_exposed',
      'safe_client_sha256',
      'schema_version',
      'server_definition_exposed',
      'service_deployment_artifact_sha256',
      'solver_identity',
      'source_branch_exposed',
      'source_plan_sha256',
      'wave_id',
    ],
    'opaque service ACL attestation',
  );
  assert.equal(value.schema_version, OPAQUE_SERVICE_ATTESTATION_SCHEMA_VERSION);
  assert.equal(value.source_plan_sha256, expected.sourcePlanSha256);
  assert.equal(value.wave_id, expected.waveId);
  assert.equal(value.job_id, expected.jobId);
  assert.equal(value.lesson_id, expected.lessonId);
  assert.equal(value.candidate_sha256, expected.candidateSha256);
  assert.equal(value.safe_client_sha256, expected.safeClientSha256);
  assert.equal(value.service_deployment_artifact_sha256, expected.serviceDeploymentArtifactSha256);
  assert.deepEqual(value.solver_identity, expected.solverIdentity);
  assert.deepEqual(value.integrator_identity, expected.integratorIdentity);
  assert.equal(value.ephemeral, true);
  assert.equal(value.exact_key_bearing_candidate_deployed, true);
  assert.equal(value.accepts_real_submitted_responses, true);
  assert.equal(value.ordinary_learner_authorized_feedback_only, true);
  assert.equal(value.source_branch_exposed, false);
  assert.equal(value.server_definition_exposed, false);
  assert.equal(value.protected_scoring_material_exposed, false);
  assert.equal(value.rationales_before_response_exposed, false);
  assert.equal(value.outcome_override_controls_exposed, false);
}

async function validateHashedOpaqueServiceAttestation({
  attestationPath,
  attestationSha256,
  candidateSha256,
  integratorIdentity,
  jobId,
  lessonId,
  repositoryRoot,
  safeClientSha256,
  serviceDeploymentArtifactSha256,
  solverIdentity,
  sourcePlanSha256,
  waveId,
}) {
  const { realTarget } = await resolveRealPathInsideRoot(
    repositoryRoot,
    attestationPath,
    `${jobId} opaque service ACL attestation path`,
  );
  const { bytes, value } = await readJsonFile(
    realTarget,
    `${jobId} opaque service ACL attestation`,
  );
  assert.equal(
    hashText(bytes),
    attestationSha256,
    `${jobId} opaque service ACL attestation hash is stale`,
  );
  validateOpaqueServiceAttestationDocument(value, {
    candidateSha256,
    integratorIdentity,
    jobId,
    lessonId,
    safeClientSha256,
    serviceDeploymentArtifactSha256,
    solverIdentity,
    sourcePlanSha256,
    waveId,
  });
}

function validateWaveSimilarityReportDocument(value, expected) {
  assertExactKeys(
    value,
    [
      'candidate_bindings',
      'checks',
      'comparison_wave_ids',
      'gate_id',
      'report_id',
      'reviewer_slot_ids',
      'schema_version',
      'source_plan_sha256',
      'status',
      'wave_id',
    ],
    'wave similarity report',
  );
  assert.equal(value.schema_version, WAVE_SIMILARITY_REPORT_SCHEMA_VERSION);
  assert.equal(value.gate_id, 'G09_CROSS_LESSON_SIMILARITY_AUDIT');
  assert.equal(value.source_plan_sha256, expected.sourcePlanSha256);
  assert.equal(value.wave_id, expected.waveId);
  assert.deepEqual(value.comparison_wave_ids, expected.comparisonWaveIds);
  assert.deepEqual(value.candidate_bindings, expected.candidateBindings);
  assert.deepEqual(value.reviewer_slot_ids, expected.reviewerSlotIds);
  assert.equal(value.status, 'APPROVED');
  requireString(value.report_id, 'wave similarity report ID');
  assert(Array.isArray(value.checks) && value.checks.length > 0);
  for (const [index, check] of value.checks.entries()) {
    assertExactKeys(check, ['check_id', 'status'], `wave similarity checks[${index}]`);
    requireString(check.check_id, `wave similarity checks[${index}].check_id`);
    assert.equal(check.status, 'PASS');
  }
  assert.deepEqual(
    value.checks.map((check) => check.check_id).sort(compareText),
    ['CURRENT-WAVE-CROSS-DOMAIN', 'DECLARED-COMPARISON-WAVES', 'TEMPLATE-OVERFITTING'],
    'Wave similarity report is missing required checks',
  );
}

async function validateHashedWaveSimilarityReport({
  candidateBindings,
  comparisonWaveIds,
  reportPath,
  reportSha256,
  repositoryRoot,
  reviewerSlotIds,
  sourcePlanSha256,
  waveId,
}) {
  const { realTarget } = await resolveRealPathInsideRoot(
    repositoryRoot,
    reportPath,
    `${waveId} similarity report path`,
  );
  const { bytes, value } = await readJsonFile(realTarget, `${waveId} similarity report`);
  assert.equal(hashText(bytes), reportSha256, `${waveId} similarity report hash is stale`);
  validateWaveSimilarityReportDocument(value, {
    candidateBindings,
    comparisonWaveIds,
    reviewerSlotIds,
    sourcePlanSha256,
    waveId,
  });
}

export {
  ATTEMPT_LOG_SCHEMA_VERSION,
  BUNDLE_FILES,
  CANDIDATE_MANIFEST_SCHEMA_VERSION,
  CLOSED_BUNDLE_SCANNER_ID,
  CLOSED_BUNDLE_SCHEMA_VERSION,
  EXCLUDED_CONTENT_CLASSES,
  GATE_REPORT_SCHEMA_VERSION,
  HASH_PATTERN,
  OPAQUE_SERVICE_ATTESTATION_SCHEMA_VERSION,
  REQUIRED_BLIND_PATH_IDS,
  REQUIRED_GATE_CHECK_IDS,
  WAVE_SIMILARITY_REPORT_SCHEMA_VERSION,
  assertExactKeys,
  createClosedReviewBundleManifest,
  directoryHash,
  listRegularFiles,
  requireHash,
  requireString,
  resolveRealPathInsideRoot,
  sortedUnique,
  validateAndHashCandidateArtifact,
  validateAndHashClosedReviewBundle,
  validateHashedAttemptLog,
  validateHashedGateReport,
  validateHashedOpaqueServiceAttestation,
  validateHashedWaveSimilarityReport,
};
