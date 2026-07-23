import assert from 'node:assert/strict';
import { join } from 'node:path';

import {
  ARTIFACT_LIMITS,
  HASH_PATTERN,
  assertExactKeys,
  assertUniqueManifestPaths,
  directoryHash,
  hashArtifactDirectory,
  hashBytes,
  hashCanonicalJson,
  readAndVerifySignedJson,
  readLimitedJson,
  readPublicKey,
  requireHash,
  requireIdentity,
  requireString,
  resolveJsonPointer,
  validateArtifactDescriptor,
} from './v3-cloud-authoring-trust-contract.mjs';

const CLOSED_BUNDLE_SCHEMA_VERSION = 'mcat-v3-closed-sanitized-review-bundle-3';
const CLOSED_BUNDLE_SCANNER_ID = 'V3_CLOSED_REVIEW_BUNDLE_SCAN_V3';
const CANDIDATE_MANIFEST_SCHEMA_VERSION = 'mcat-v3-candidate-artifact-manifest-3';
const CANDIDATE_VALIDATOR_EXECUTION_REPORT_SCHEMA_VERSION =
  'mcat-v3-signed-candidate-validator-execution-report-1';
const GATE_REPORT_SCHEMA_VERSION = 'mcat-v3-signed-gate-evidence-report-2';
const SAFE_PROJECTION_REPORT_SCHEMA_VERSION = 'mcat-v3-safe-projection-report-2';
const OPAQUE_SERVICE_ATTESTATION_SCHEMA_VERSION =
  'mcat-v3-signed-opaque-service-deployment-attestation-3';
const SERVICE_DEPLOYMENT_MANIFEST_SCHEMA_VERSION = 'mcat-v3-opaque-service-deployment-manifest-2';
const SERVICE_RECEIPT_SCHEMA_VERSION = 'mcat-v3-service-action-transition-receipt-2';
const SERVICE_RECEIPT_MANIFEST_SCHEMA_VERSION = 'mcat-v3-service-receipt-manifest-2';
const SERVICE_INTEGRATION_REPORT_SCHEMA_VERSION = 'mcat-v3-signed-service-integration-report-1';
const ACCESSIBILITY_EXECUTION_REPORT_SCHEMA_VERSION =
  'mcat-v3-signed-accessibility-execution-report-2';
const RIGHTS_REPORT_SCHEMA_VERSION = 'mcat-v3-signed-rights-review-report-1';
const SOURCE_OUTPUT_SIMILARITY_SCHEMA_VERSION = 'mcat-v3-signed-source-output-similarity-report-1';
const DOMAIN_REPORT_SCHEMA_VERSION = 'mcat-v3-signed-domain-review-report-1';
const CUMULATIVE_CORPUS_SCHEMA_VERSION = 'mcat-v3-signed-cumulative-corpus-manifest-1';
const WAVE_SIMILARITY_REPORT_SCHEMA_VERSION = 'mcat-v3-signed-wave-similarity-report-2';

const BUNDLE_FILES = Object.freeze({
  ACCESSIBILITY_ONLY: Object.freeze([
    'accessibility-harness-config.json',
    'bundle-manifest.json',
    'learner-safe-envelope.json',
  ]),
  BLIND_SOLVE: Object.freeze([
    'blind-client-runtime.json',
    'bundle-manifest.json',
    'learner-safe-envelope.json',
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
  'ALTERNATE_ROUTE_SELECTION',
  'ASSISTANCE_REVEAL',
  'CORRECT_RESPONSE',
  'FRESH_ACTIVITY_RETRY',
  'INCORRECT_RESPONSE',
  'NOT_SURE_RESPONSE',
  'PAUSE_AND_RESUME',
  'REPAIR_LIMIT_PLANNER_REENTRY',
  'TARGETED_REPAIR_CYCLE',
]);

const REQUIRED_SERVICE_INTEGRATION_CHECK_IDS = Object.freeze([
  'ACTION_SCHEMA_REJECTS_UNSUPPORTED_KIND',
  'INVALID_ACTIVITY_REJECTED_AT_AUTHORITY_BOUNDARY',
  'RECEIPT_TRANSITION_PROFILE_CONFORMANCE',
]);

const REQUIRED_ACCESSIBILITY_CHECK_IDS = Object.freeze([
  'CONTRAST',
  'FOCUS_ORDER',
  'KEYBOARD_ONLY',
  'MEDIA_TRANSCRIPTS_CAPTIONS',
  'NONVISUAL_ALTERNATIVES',
  'REDUCED_MOTION',
  'REFLOW_320PX',
  'SEMANTICS',
  'ZOOM_200_PERCENT',
]);

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
  G07_INDEPENDENT_BLIND_SOLVE: Object.freeze(['SIGNED_SERVICE_RECEIPTS_AND_SEMANTIC_PATHS']),
  G08_ACCESSIBILITY_TECHNICAL_AUDIT: Object.freeze(['SIGNED_BROWSER_ACCESSIBILITY_EXECUTION']),
});

const FORBIDDEN_FIELD_NAMES = new Set([
  'alternate_solution',
  'alternate_solutions',
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

function assertIdentityEqual(actual, expected, label) {
  requireIdentity(actual, label);
  assert.deepEqual(actual, expected, `${label} does not match assigned identity`);
}

function createClosedReviewBundleManifest({
  bundleKind,
  compilerBuild,
  learnerViewContract,
  lessonId,
  jobId,
  projectionReportSha256,
  reviewedCandidateSha256,
  reviewHarnessBuild,
  runtimeContract,
  sourcePlanSha256,
  waveId,
}) {
  assert(Object.hasOwn(BUNDLE_FILES, bundleKind), `Unknown bundle kind ${bundleKind}`);
  return {
    action_schema_id: learnerViewContract.action_schema_id,
    action_schema_sha256: learnerViewContract.action_schema_sha256,
    author_branch_included: false,
    bundle_kind: bundleKind,
    candidate_schema_id: runtimeContract.candidate_schema_id,
    candidate_schema_sha256: runtimeContract.candidate_schema_sha256,
    compiler_build_id: compilerBuild.build_id,
    compiler_build_sha256: compilerBuild.artifact_sha256,
    compiler_build_version: compilerBuild.build_version,
    excluded_content_classes: [...EXCLUDED_CONTENT_CLASSES],
    included_files: [...BUNDLE_FILES[bundleKind]],
    job_id: jobId,
    learner_view_schema_id: learnerViewContract.view_schema_id,
    learner_view_schema_sha256: learnerViewContract.view_schema_sha256,
    lesson_id: lessonId,
    projection_report_sha256: projectionReportSha256,
    protected_scoring_material_included: false,
    rationales_before_response_included: false,
    review_harness_build_id: reviewHarnessBuild.build_id,
    review_harness_build_sha256: reviewHarnessBuild.artifact_sha256,
    review_harness_build_version: reviewHarnessBuild.build_version,
    reviewed_candidate_sha256: reviewedCandidateSha256,
    runtime_contract_version: runtimeContract.runtime_contract_version,
    schema_version: CLOSED_BUNDLE_SCHEMA_VERSION,
    server_definition_included: false,
    source_plan_sha256: sourcePlanSha256,
    supported_action_kinds: [...learnerViewContract.transition_profile.action_kinds],
    supported_representation_kinds: [...learnerViewContract.representation_kinds],
    transition_profile_id: learnerViewContract.transition_profile.profile_id,
    wave_id: waveId,
  };
}

function validateBundleManifest(value, expected) {
  assertExactKeys(
    value,
    [
      'action_schema_id',
      'action_schema_sha256',
      'author_branch_included',
      'bundle_kind',
      'candidate_schema_id',
      'candidate_schema_sha256',
      'compiler_build_id',
      'compiler_build_sha256',
      'compiler_build_version',
      'excluded_content_classes',
      'included_files',
      'job_id',
      'learner_view_schema_id',
      'learner_view_schema_sha256',
      'lesson_id',
      'projection_report_sha256',
      'protected_scoring_material_included',
      'rationales_before_response_included',
      'review_harness_build_id',
      'review_harness_build_sha256',
      'review_harness_build_version',
      'reviewed_candidate_sha256',
      'runtime_contract_version',
      'schema_version',
      'server_definition_included',
      'source_plan_sha256',
      'supported_action_kinds',
      'supported_representation_kinds',
      'transition_profile_id',
      'wave_id',
    ],
    'bundle manifest',
  );
  const canonical = createClosedReviewBundleManifest(expected);
  assert.deepEqual(value, canonical, 'Bundle manifest does not match signed integration pins');
}

function validateLearnerSafeEnvelope(envelope, expected, learnerViewValidator) {
  assertExactKeys(
    envelope,
    ['lesson_step_views', 'media_digests', 'schema_version', 'view_schema_id'],
    'learner-safe envelope',
  );
  assert.equal(envelope.schema_version, 'mcat-v3-learner-safe-view-envelope-2');
  assert.equal(envelope.view_schema_id, expected.learnerViewContract.view_schema_id);
  assert(
    Array.isArray(envelope.lesson_step_views) && envelope.lesson_step_views.length > 0,
    'Learner-safe envelope must contain individual lesson step views',
  );
  const profile = expected.learnerViewContract.semantic_profile;
  const transitionProfile = expected.learnerViewContract.transition_profile;
  const activityIds = new Set();
  const referencedMedia = new Map();
  for (const [viewIndex, view] of envelope.lesson_step_views.entries()) {
    assert(
      learnerViewValidator(view),
      `Learner step view fails pinned schema: ${JSON.stringify(learnerViewValidator.errors)}`,
    );
    assert.equal(
      resolveJsonPointer(view, profile.view_schema_version_pointer, `learner view[${viewIndex}]`),
      profile.expected_view_schema_version,
      'Learner view schemaVersion does not match the signed semantic profile',
    );
    assert.equal(
      resolveJsonPointer(view, profile.lesson_id_pointer, `learner view[${viewIndex}]`),
      expected.lessonId,
      'Learner view lessonId does not match the job lesson',
    );
    const availableActions = resolveJsonPointer(
      view,
      profile.available_actions_pointer,
      `learner view[${viewIndex}]`,
    );
    assert(Array.isArray(availableActions), 'Learner view available actions must be an array');
    for (const actionKind of availableActions) {
      assert(
        transitionProfile.action_kinds.includes(actionKind),
        `Learner view exposes unsupported action ${actionKind}`,
      );
    }
    const activity = resolveJsonPointer(
      view,
      profile.activity_pointer,
      `learner view[${viewIndex}]`,
    );
    if (activity === null) continue;
    const activityId = resolveJsonPointer(
      activity,
      profile.activity_id_pointer,
      `learner view[${viewIndex}] activity`,
    );
    requireString(activityId, `learner view[${viewIndex}] activity ID`);
    assert(!activityIds.has(activityId), `Duplicate learner-safe activity ${activityId}`);
    activityIds.add(activityId);
    const representations = resolveJsonPointer(
      activity,
      profile.representations_pointer,
      `learner view[${viewIndex}] activity`,
    );
    assert(Array.isArray(representations), 'Learner activity representations must be an array');
    for (const [representationIndex, representation] of representations.entries()) {
      const label = `learner view[${viewIndex}] representation[${representationIndex}]`;
      const kind = resolveJsonPointer(representation, profile.representation_kind_pointer, label);
      assert(
        expected.learnerViewContract.representation_kinds.includes(kind),
        `${label} uses unsupported representation kind ${kind}`,
      );
      const mediaProfile = profile.media_profile;
      if (kind !== mediaProfile.audio_kind && kind !== mediaProfile.video_kind) continue;
      const assetRef = resolveJsonPointer(representation, mediaProfile.asset_ref_pointer, label);
      const transcript = resolveJsonPointer(representation, mediaProfile.transcript_pointer, label);
      const captionsRef = resolveJsonPointer(
        representation,
        mediaProfile.captions_ref_pointer,
        label,
      );
      requireString(assetRef, `${label} asset reference`);
      assert(Array.isArray(transcript) && transcript.length > 0, `${label} needs a transcript`);
      transcript.forEach((line, lineIndex) =>
        requireString(line, `${label} transcript[${lineIndex}]`),
      );
      const captionsRequired =
        kind === mediaProfile.audio_kind
          ? mediaProfile.audio_captions_required
          : mediaProfile.video_captions_required;
      if (captionsRequired) requireString(captionsRef, `${label} captions reference`);
      else assert(captionsRef === null || typeof captionsRef === 'string');
      const mediaRecord = {
        captions_present: captionsRef !== null,
        kind,
        transcript_sha256: hashCanonicalJson(transcript),
      };
      if (referencedMedia.has(assetRef)) {
        assert.deepEqual(
          referencedMedia.get(assetRef),
          mediaRecord,
          `${assetRef} has inconsistent learner-safe media semantics`,
        );
      } else {
        referencedMedia.set(assetRef, mediaRecord);
      }
    }
  }
  assert(activityIds.size > 0, 'Learner-safe envelope has no active activity view');
  assert(Array.isArray(envelope.media_digests), 'media_digests must be an array');
  assert.equal(
    envelope.media_digests.length,
    referencedMedia.size,
    'Media digests must exactly cover learner-view media references',
  );
  const mediaRefs = new Set();
  for (const [index, media] of envelope.media_digests.entries()) {
    const label = `media_digests[${index}]`;
    assertExactKeys(
      media,
      ['asset_ref', 'captions_sha256', 'media_kind', 'media_sha256', 'transcript_sha256'],
      label,
    );
    requireString(media.asset_ref, `${label}.asset_ref`);
    requireString(media.media_kind, `${label}.media_kind`);
    requireHash(media.media_sha256, `${label}.media_sha256`);
    requireHash(media.transcript_sha256, `${label}.transcript_sha256`);
    assert(!mediaRefs.has(media.asset_ref), `Duplicate media digest ${media.asset_ref}`);
    mediaRefs.add(media.asset_ref);
    const referenced = referencedMedia.get(media.asset_ref);
    assert(referenced, `${label} does not correspond to learner-view media`);
    assert.equal(media.media_kind, referenced.kind);
    assert.equal(media.transcript_sha256, referenced.transcript_sha256);
    if (referenced.captions_present) {
      requireHash(media.captions_sha256, `${label}.captions_sha256`);
    } else {
      assert.equal(media.captions_sha256, null);
    }
  }
  assert.deepEqual(
    envelope.media_digests.map((media) => media.asset_ref),
    [...mediaRefs].sort(compareText),
    'Media digests must be asset-reference sorted',
  );
  return activityIds;
}

function validateBlindClientRuntime(value, expected) {
  assertExactKeys(
    value,
    [
      'action_schema_id',
      'action_schema_sha256',
      'client_scoring_authority',
      'outcome_override_controls',
      'rationales_before_response',
      'request_action_kinds',
      'response_fields',
      'schema_version',
      'service_protocol_profile_id',
      'submit_endpoint_path',
      'view_schema_id',
    ],
    'blind client runtime',
  );
  assert.equal(value.schema_version, 'mcat-v3-opaque-blind-client-runtime-3');
  assert.equal(value.action_schema_id, expected.learnerViewContract.action_schema_id);
  assert.equal(value.action_schema_sha256, expected.learnerViewContract.action_schema_sha256);
  assert.equal(value.view_schema_id, expected.learnerViewContract.view_schema_id);
  assert.equal(
    value.service_protocol_profile_id,
    expected.learnerViewContract.transition_profile.profile_id,
  );
  assert.equal(value.submit_endpoint_path, '/submit');
  assert.deepEqual(
    value.request_action_kinds,
    expected.learnerViewContract.transition_profile.action_kinds,
  );
  assert.deepEqual(value.response_fields, [
    'learner_feedback',
    'learner_step_view',
    'service_receipt',
  ]);
  assert.equal(value.client_scoring_authority, false);
  assert.equal(value.outcome_override_controls, false);
  assert.equal(value.rationales_before_response, false);
  assert.equal(expected.bundleKind, 'BLIND_SOLVE');
}

function validateAccessibilityHarnessConfig(value, expected) {
  assertExactKeys(
    value,
    [
      'browser_execution_required',
      'learner_action_schema_id',
      'learner_view_schema_id',
      'required_check_ids',
      'review_harness_build_id',
      'review_harness_build_sha256',
      'review_harness_build_version',
      'schema_version',
      'transition_profile_id',
      'supported_representation_kinds',
    ],
    'accessibility harness config',
  );
  assert.equal(value.schema_version, 'mcat-v3-accessibility-harness-config-2');
  assert.equal(value.browser_execution_required, true);
  assert.equal(value.learner_action_schema_id, expected.learnerViewContract.action_schema_id);
  assert.equal(value.learner_view_schema_id, expected.learnerViewContract.view_schema_id);
  assert.equal(value.review_harness_build_id, expected.reviewHarnessBuild.build_id);
  assert.equal(value.review_harness_build_sha256, expected.reviewHarnessBuild.artifact_sha256);
  assert.equal(value.review_harness_build_version, expected.reviewHarnessBuild.build_version);
  assert.deepEqual(value.required_check_ids, [...REQUIRED_ACCESSIBILITY_CHECK_IDS]);
  assert.equal(
    value.transition_profile_id,
    expected.learnerViewContract.transition_profile.profile_id,
  );
  assert.deepEqual(
    value.supported_representation_kinds,
    expected.learnerViewContract.representation_kinds,
  );
}

async function validateAndHashClosedReviewBundle({
  bundleKind,
  bundlePath,
  compilerBuild,
  jobId,
  learnerViewContract,
  learnerViewValidator,
  lessonId,
  projectionReport,
  projectionReportSha256,
  repositoryRoot,
  reviewedCandidateSha256,
  reviewHarnessBuild,
  runtimeContract,
  sourcePlanSha256,
  waveId,
}) {
  const descriptor = {
    artifact_path: bundlePath,
    artifact_sha256: '0'.repeat(64),
    file_manifest: [],
  };
  const scan = await hashArtifactDirectory({
    artifactPath: bundlePath,
    label: `${jobId} ${bundleKind} closed bundle`,
    limits: ARTIFACT_LIMITS.review_bundle,
    repositoryRoot,
  });
  descriptor.artifact_sha256 = scan.artifact_sha256;
  descriptor.file_manifest = scan.file_manifest;
  assert.deepEqual(
    scan.file_manifest.map((file) => file.path),
    BUNDLE_FILES[bundleKind],
    `${jobId} ${bundleKind} must contain the exact closed file set`,
  );
  const documents = new Map();
  for (const file of scan.file_manifest) {
    const { value } = await readLimitedJson(
      join(scan.real_path, file.path),
      `${jobId} ${bundleKind} ${file.path}`,
      ARTIFACT_LIMITS.review_bundle,
    );
    assertNoForbiddenFields(value, file.path);
    documents.set(file.path, value);
  }
  const expected = {
    bundleKind,
    compilerBuild,
    jobId,
    learnerViewContract,
    lessonId,
    projectionReportSha256,
    reviewedCandidateSha256,
    reviewHarnessBuild,
    runtimeContract,
    sourcePlanSha256,
    waveId,
  };
  validateBundleManifest(documents.get('bundle-manifest.json'), expected);
  const activityIds = validateLearnerSafeEnvelope(
    documents.get('learner-safe-envelope.json'),
    { learnerViewContract, lessonId },
    learnerViewValidator,
  );
  const output = projectionReport.outputs.find((item) => item.bundle_kind === bundleKind);
  assert(output, `Signed compiler report lacks ${bundleKind} output`);
  const compilerOutputManifest = scan.file_manifest.filter(
    (file) => file.path !== 'bundle-manifest.json',
  );
  assert.deepEqual(
    compilerOutputManifest,
    output.output_file_manifest,
    `${jobId} ${bundleKind} is not the signed compiler output`,
  );
  assert.equal(
    directoryHash(compilerOutputManifest),
    output.output_artifact_sha256,
    `${jobId} ${bundleKind} compiler-output hash mismatch`,
  );
  if (bundleKind === 'BLIND_SOLVE') {
    validateBlindClientRuntime(documents.get('blind-client-runtime.json'), expected);
  } else {
    validateAccessibilityHarnessConfig(
      documents.get('accessibility-harness-config.json'),
      expected,
    );
  }
  const report = {
    bundle_kind: bundleKind,
    bundle_sha256: scan.artifact_sha256,
    files: scan.file_manifest,
    scanner_id: CLOSED_BUNDLE_SCANNER_ID,
  };
  return {
    activity_ids: activityIds,
    bundle_sha256: scan.artifact_sha256,
    documents,
    files: scan.file_manifest,
    real_path: scan.real_path,
    report_sha256: hashBytes(JSON.stringify(report)),
    scanner_id: CLOSED_BUNDLE_SCANNER_ID,
  };
}

function validateCandidateManifest(value, expected) {
  assertExactKeys(
    value,
    [
      'candidate_definition_path',
      'candidate_format',
      'candidate_schema_id',
      'candidate_schema_sha256',
      'candidate_semantic_profile_sha256',
      'candidate_validator_build_id',
      'candidate_validator_build_sha256',
      'candidate_validator_build_version',
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
  assert.equal(value.candidate_format, expected.runtimeContract.candidate_format);
  assert.equal(value.runtime_contract_version, expected.runtimeContract.runtime_contract_version);
  assert.equal(value.candidate_schema_id, expected.runtimeContract.candidate_schema_id);
  assert.equal(value.candidate_schema_sha256, expected.runtimeContract.candidate_schema_sha256);
  assert.equal(
    value.candidate_semantic_profile_sha256,
    hashCanonicalJson(expected.runtimeContract.candidate_semantic_profile),
  );
  assert.equal(
    value.candidate_validator_build_id,
    expected.runtimeContract.candidate_validator_build_id,
  );
  assert.equal(
    value.candidate_validator_build_sha256,
    expected.runtimeContract.candidate_validator_build_sha256,
  );
  assert.equal(
    value.candidate_validator_build_version,
    expected.runtimeContract.candidate_validator_build_version,
  );
  assert.equal(value.candidate_definition_path, expected.runtimeContract.candidate_definition_path);
}

async function validateAndHashCandidateArtifact({
  artifactDescriptor,
  candidateValidator,
  jobId,
  lessonId,
  repositoryRoot,
  runtimeContract,
  sourcePlanSha256,
  waveId,
}) {
  const scan = await validateArtifactDescriptor(artifactDescriptor, {
    label: `${jobId} candidate artifact`,
    limits: ARTIFACT_LIMITS.candidate,
    repositoryRoot,
  });
  const candidateManifestEntry = scan.file_manifest.find(
    (file) => file.path === 'candidate-manifest.json',
  );
  assert(candidateManifestEntry, `${jobId} candidate lacks candidate-manifest.json`);
  const definitionEntry = scan.file_manifest.find(
    (file) => file.path === runtimeContract.candidate_definition_path,
  );
  assert(
    definitionEntry,
    `${jobId} candidate lacks exact key-bearing definition ${runtimeContract.candidate_definition_path}`,
  );
  const [{ value: manifest }, { value: definition }] = await Promise.all([
    readLimitedJson(
      join(scan.real_path, 'candidate-manifest.json'),
      `${jobId} candidate manifest`,
      ARTIFACT_LIMITS.candidate,
    ),
    readLimitedJson(
      join(scan.real_path, runtimeContract.candidate_definition_path),
      `${jobId} key-bearing candidate definition`,
      ARTIFACT_LIMITS.candidate,
    ),
  ]);
  validateCandidateManifest(manifest, {
    jobId,
    lessonId,
    runtimeContract,
    sourcePlanSha256,
    waveId,
  });
  assert(
    candidateValidator(definition),
    `${jobId} candidate fails the supplementary pinned JSON Schema: ${JSON.stringify(candidateValidator.errors)}`,
  );
  const semanticProfile = runtimeContract.candidate_semantic_profile;
  assert.equal(
    resolveJsonPointer(
      definition,
      semanticProfile.definition_schema_version_pointer,
      `${jobId} candidate`,
    ),
    semanticProfile.expected_definition_schema_version,
    `${jobId} candidate schemaVersion does not match the signed semantic profile`,
  );
  assert.equal(
    resolveJsonPointer(definition, semanticProfile.lesson_id_pointer, `${jobId} candidate`),
    lessonId,
    `${jobId} candidate lesson identity does not match the signed semantic profile`,
  );
  return {
    artifact_sha256: scan.artifact_sha256,
    definition,
    definition_sha256: definitionEntry.sha256,
    files: scan.file_manifest,
    real_path: scan.real_path,
  };
}

function validateCandidateValidatorExecutionReportDocument(value, expected) {
  assertExactKeys(
    value,
    [
      'ajv_supplementary_status',
      'candidate_definition_path',
      'candidate_definition_sha256',
      'candidate_file_manifest',
      'candidate_format',
      'candidate_schema_id',
      'candidate_schema_sha256',
      'candidate_sha256',
      'checks',
      'foundation_commit_sha',
      'issue_count',
      'job_id',
      'lesson_id',
      'report_id',
      'runtime_contract_version',
      'schema_version',
      'signing_key_fingerprint',
      'source_plan_sha256',
      'status',
      'validator_build_id',
      'validator_build_sha256',
      'validator_build_version',
      'wave_id',
    ],
    'candidate production-validator execution report',
  );
  assert.equal(value.schema_version, CANDIDATE_VALIDATOR_EXECUTION_REPORT_SCHEMA_VERSION);
  assert.equal(value.source_plan_sha256, expected.sourcePlanSha256);
  assert.equal(value.wave_id, expected.waveId);
  assert.equal(value.job_id, expected.jobId);
  assert.equal(value.lesson_id, expected.lessonId);
  assert.equal(
    value.candidate_sha256,
    expected.candidateScan.artifact_sha256,
    'Candidate validator report is stale for the candidate artifact',
  );
  assert.deepEqual(
    value.candidate_file_manifest,
    expected.candidateScan.files,
    'Candidate validator report file manifest is stale',
  );
  assert.equal(
    value.candidate_definition_sha256,
    expected.candidateScan.definition_sha256,
    'Candidate validator report is stale for the definition bytes',
  );
  assert.equal(value.candidate_definition_path, expected.runtimeContract.candidate_definition_path);
  assert.equal(value.candidate_format, expected.runtimeContract.candidate_format);
  assert.equal(value.candidate_schema_id, expected.runtimeContract.candidate_schema_id);
  assert.equal(value.candidate_schema_sha256, expected.runtimeContract.candidate_schema_sha256);
  assert.equal(value.runtime_contract_version, expected.runtimeContract.runtime_contract_version);
  assert.equal(value.foundation_commit_sha, expected.foundationCommitSha);
  assert.equal(value.validator_build_id, expected.candidateValidatorBuild.manifest.build_id);
  assert.equal(
    value.validator_build_version,
    expected.candidateValidatorBuild.manifest.build_version,
  );
  assert.equal(value.validator_build_sha256, expected.candidateValidatorBuild.artifact_sha256);
  assert.equal(
    value.signing_key_fingerprint,
    expected.candidateValidatorBuild.signing_key.fingerprint,
  );
  assert.equal(value.ajv_supplementary_status, 'PASS');
  assert.equal(value.status, 'VALIDATED_BY_PINNED_PRODUCTION_VALIDATOR');
  assert.equal(value.issue_count, 0);
  requireString(value.report_id, 'candidate validator execution report ID');
  assert(Array.isArray(value.checks));
  for (const [index, check] of value.checks.entries()) {
    assertExactKeys(check, ['check_id', 'status'], `candidate validator check[${index}]`);
    assert.equal(check.status, 'PASS');
  }
  assert.deepEqual(
    value.checks.map((check) => check.check_id),
    expected.runtimeContract.candidate_semantic_profile.validator_required_check_ids,
    'Candidate validator report is missing signed-profile production checks',
  );
}

async function validateSignedCandidateValidatorExecution({
  candidateScan,
  candidateValidatorBuild,
  descriptor,
  foundationCommitSha,
  jobId,
  lessonId,
  repositoryRoot,
  runtimeContract,
  sourcePlanSha256,
  waveId,
}) {
  validateSignedDescriptor(descriptor, `${jobId} candidate validator execution descriptor`);
  assert.equal(descriptor.signer_key_fingerprint, candidateValidatorBuild.signing_key.fingerprint);
  const signed = await readAndVerifySignedJson({
    documentPath: descriptor.report_path,
    documentSha256: descriptor.report_sha256,
    label: `${jobId} pinned production-validator execution report`,
    publicKeyPem: candidateValidatorBuild.signing_key.pem,
    repositoryRoot,
    signaturePath: descriptor.report_signature_path,
    signatureSha256: descriptor.report_signature_sha256,
  });
  validateCandidateValidatorExecutionReportDocument(signed.value, {
    candidateScan,
    candidateValidatorBuild,
    foundationCommitSha,
    jobId,
    lessonId,
    runtimeContract,
    sourcePlanSha256,
    waveId,
  });
  return signed.value;
}

function validateSafeProjectionReportDocument(value, expected) {
  assertExactKeys(
    value,
    [
      'action_schema_id',
      'action_schema_sha256',
      'candidate_file_manifest',
      'candidate_sha256',
      'candidate_schema_id',
      'candidate_validator_execution_report_sha256',
      'compiler_build_id',
      'compiler_build_sha256',
      'compiler_build_version',
      'compiler_signing_key_fingerprint',
      'job_id',
      'learner_view_schema_id',
      'learner_view_schema_sha256',
      'lesson_id',
      'outputs',
      'report_id',
      'review_harness_build_sha256',
      'review_harness_build_version',
      'runtime_contract_version',
      'schema_version',
      'source_plan_sha256',
      'status',
      'transition_profile_id',
      'wave_id',
    ],
    'safe-projection compiler report',
  );
  assert.equal(value.schema_version, SAFE_PROJECTION_REPORT_SCHEMA_VERSION);
  assert.equal(value.source_plan_sha256, expected.sourcePlanSha256);
  assert.equal(value.wave_id, expected.waveId);
  assert.equal(value.job_id, expected.jobId);
  assert.equal(value.lesson_id, expected.lessonId);
  assert.equal(value.candidate_sha256, expected.candidateSha256);
  assert.deepEqual(value.candidate_file_manifest, expected.candidateFileManifest);
  assert.equal(value.candidate_schema_id, expected.runtimeContract.candidate_schema_id);
  assert.equal(
    value.candidate_validator_execution_report_sha256,
    expected.candidateValidatorExecutionReportSha256,
  );
  assert.equal(value.runtime_contract_version, expected.runtimeContract.runtime_contract_version);
  assert.equal(value.action_schema_id, expected.learnerViewContract.action_schema_id);
  assert.equal(value.action_schema_sha256, expected.learnerViewContract.action_schema_sha256);
  assert.equal(value.learner_view_schema_id, expected.learnerViewContract.view_schema_id);
  assert.equal(value.learner_view_schema_sha256, expected.learnerViewContract.view_schema_sha256);
  assert.equal(
    value.transition_profile_id,
    expected.learnerViewContract.transition_profile.profile_id,
  );
  assert.equal(value.compiler_build_id, expected.compilerBuild.build_id);
  assert.equal(value.compiler_build_sha256, expected.compilerBuild.artifact_sha256);
  assert.equal(value.compiler_build_version, expected.compilerBuild.build_version);
  assert.equal(value.compiler_signing_key_fingerprint, expected.compilerSigningKeyFingerprint);
  assert.equal(value.review_harness_build_sha256, expected.reviewHarnessBuild.artifact_sha256);
  assert.equal(value.review_harness_build_version, expected.reviewHarnessBuild.build_version);
  assert.equal(value.status, 'DERIVED_BY_PINNED_COMPILER');
  requireString(value.report_id, 'safe-projection report ID');
  assert(Array.isArray(value.outputs) && value.outputs.length === 2);
  const outputKinds = [];
  for (const [index, output] of value.outputs.entries()) {
    const label = `safe-projection outputs[${index}]`;
    assertExactKeys(
      output,
      ['bundle_kind', 'output_artifact_sha256', 'output_file_manifest'],
      label,
    );
    assert(Object.hasOwn(BUNDLE_FILES, output.bundle_kind), `${label} has unknown bundle kind`);
    requireHash(output.output_artifact_sha256, `${label}.output_artifact_sha256`);
    assertUniqueManifestPaths(output.output_file_manifest, `${label}.output_file_manifest`);
    assert.equal(
      output.output_artifact_sha256,
      directoryHash(output.output_file_manifest),
      `${label} output hash is stale`,
    );
    outputKinds.push(output.bundle_kind);
  }
  assert.deepEqual(outputKinds.sort(compareText), ['ACCESSIBILITY_ONLY', 'BLIND_SOLVE']);
}

async function validateSafeProjectionEvidence({
  candidateFileManifest,
  candidateSha256,
  candidateValidatorExecutionReportSha256,
  compilerBuild,
  evidence,
  jobId,
  learnerViewContract,
  lessonId,
  repositoryRoot,
  reviewHarnessBuild,
  runtimeContract,
  sourcePlanSha256,
  waveId,
}) {
  assertExactKeys(
    evidence,
    [
      'compiler_signing_key_fingerprint',
      'report_path',
      'report_sha256',
      'report_signature_path',
      'report_signature_sha256',
    ],
    `${jobId} safe-projection evidence`,
  );
  assert.equal(evidence.compiler_signing_key_fingerprint, compilerBuild.signing_key.fingerprint);
  const signed = await readAndVerifySignedJson({
    documentPath: evidence.report_path,
    documentSha256: evidence.report_sha256,
    label: `${jobId} safe-projection compiler report`,
    publicKeyPem: compilerBuild.signing_key.pem,
    repositoryRoot,
    signaturePath: evidence.report_signature_path,
    signatureSha256: evidence.report_signature_sha256,
  });
  validateSafeProjectionReportDocument(signed.value, {
    candidateFileManifest,
    candidateSha256,
    candidateValidatorExecutionReportSha256,
    compilerBuild: {
      artifact_sha256: compilerBuild.artifact_sha256,
      build_id: compilerBuild.manifest.build_id,
      build_version: compilerBuild.manifest.build_version,
    },
    compilerSigningKeyFingerprint: compilerBuild.signing_key.fingerprint,
    jobId,
    learnerViewContract,
    lessonId,
    reviewHarnessBuild: {
      artifact_sha256: reviewHarnessBuild.artifact_sha256,
      build_id: reviewHarnessBuild.manifest.build_id,
      build_version: reviewHarnessBuild.manifest.build_version,
    },
    runtimeContract,
    sourcePlanSha256,
    waveId,
  });
  return signed.value;
}

function validateSignedDescriptor(descriptor, label) {
  assertExactKeys(
    descriptor,
    [
      'report_path',
      'report_sha256',
      'report_signature_path',
      'report_signature_sha256',
      'signer_key_fingerprint',
    ],
    label,
  );
  requireString(descriptor.report_path, `${label}.report_path`);
  requireHash(descriptor.report_sha256, `${label}.report_sha256`);
  requireString(descriptor.report_signature_path, `${label}.report_signature_path`);
  requireHash(descriptor.report_signature_sha256, `${label}.report_signature_sha256`);
  requireHash(descriptor.signer_key_fingerprint, `${label}.signer_key_fingerprint`);
}

async function readAssignedSignedReport({
  assignment,
  credential,
  descriptor,
  label,
  repositoryRoot,
}) {
  validateSignedDescriptor(descriptor, label);
  assert.equal(descriptor.signer_key_fingerprint, credential.public_key.fingerprint);
  const expectedIdentity = {
    person_id: assignment.assignee_person_id,
    run_id: assignment.assignee_run_id,
  };
  assertIdentityEqual(
    {
      person_id: credential.value.person_id,
      run_id: credential.value.run_id,
    },
    expectedIdentity,
    `${label} credential identity`,
  );
  return readAndVerifySignedJson({
    documentPath: descriptor.report_path,
    documentSha256: descriptor.report_sha256,
    label,
    publicKeyPem: credential.public_key.pem,
    repositoryRoot,
    signaturePath: descriptor.report_signature_path,
    signatureSha256: descriptor.report_signature_sha256,
  });
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
      'report_author_identity',
      'report_id',
      'reviewed_artifact_sha256',
      'reviewer_slot_id',
      'schema_version',
      'signing_key_fingerprint',
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
  assert.equal(value.reviewer_slot_id, expected.reviewerSlotId);
  assert.deepEqual(value.report_author_identity, expected.reportAuthorIdentity);
  assert.equal(value.signing_key_fingerprint, expected.signingKeyFingerprint);
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

async function validateSignedGateReport({
  assignment,
  candidateSha256,
  credential,
  descriptor,
  gateId,
  jobId,
  lessonId,
  repositoryRoot,
  reviewedArtifactSha256,
  reviewerSlotId,
  sourcePlanSha256,
  waveId,
}) {
  const signed = await readAssignedSignedReport({
    assignment,
    credential,
    descriptor,
    label: `${jobId} ${gateId} report`,
    repositoryRoot,
  });
  validateGateReportDocument(signed.value, {
    candidateSha256,
    gateId,
    jobId,
    lessonId,
    reportAuthorIdentity: {
      person_id: assignment.assignee_person_id,
      run_id: assignment.assignee_run_id,
    },
    reviewedArtifactSha256,
    reviewerSlotId,
    signingKeyFingerprint: credential.public_key.fingerprint,
    sourcePlanSha256,
    waveId,
  });
}

function validateServiceDeploymentManifest(value, expected) {
  assertExactKeys(
    value,
    [
      'action_schema_id',
      'action_schema_sha256',
      'candidate_sha256',
      'candidate_validator_execution_report_sha256',
      'deployment_id',
      'ephemeral',
      'initial_state_sha256',
      'job_id',
      'lesson_id',
      'receipt_signing_key_fingerprint',
      'safe_client_sha256',
      'schema_version',
      'scoring_service_build_id',
      'scoring_service_build_sha256',
      'scoring_service_build_version',
      'source_plan_sha256',
      'transition_profile_id',
      'wave_id',
    ],
    'service deployment manifest',
  );
  assert.equal(value.schema_version, SERVICE_DEPLOYMENT_MANIFEST_SCHEMA_VERSION);
  assert.equal(value.source_plan_sha256, expected.sourcePlanSha256);
  assert.equal(value.wave_id, expected.waveId);
  assert.equal(value.job_id, expected.jobId);
  assert.equal(value.lesson_id, expected.lessonId);
  assert.equal(value.candidate_sha256, expected.candidateSha256);
  assert.equal(
    value.candidate_validator_execution_report_sha256,
    expected.candidateValidatorExecutionReportSha256,
  );
  assert.equal(value.safe_client_sha256, expected.safeClientSha256);
  assert.equal(value.action_schema_id, expected.learnerViewContract.action_schema_id);
  assert.equal(value.action_schema_sha256, expected.learnerViewContract.action_schema_sha256);
  assert.equal(
    value.transition_profile_id,
    expected.learnerViewContract.transition_profile.profile_id,
  );
  assert.equal(value.scoring_service_build_id, expected.scoringBuild.build_id);
  assert.equal(value.scoring_service_build_sha256, expected.scoringBuild.artifact_sha256);
  assert.equal(value.scoring_service_build_version, expected.scoringBuild.build_version);
  assert.equal(value.receipt_signing_key_fingerprint, expected.receiptKeyFingerprint);
  assert.equal(value.ephemeral, true);
  requireString(value.deployment_id, 'service deployment ID');
  requireHash(value.initial_state_sha256, 'service initial state SHA-256');
}

async function validateServiceDeploymentArtifact({
  candidateSha256,
  candidateValidatorExecutionReportSha256,
  descriptor,
  jobId,
  learnerViewContract,
  lessonId,
  repositoryRoot,
  safeClientSha256,
  scoringBuild,
  sourcePlanSha256,
  waveId,
}) {
  const scan = await validateArtifactDescriptor(descriptor, {
    label: `${jobId} service deployment artifact`,
    limits: ARTIFACT_LIMITS.service_deployment,
    repositoryRoot,
    requiredFiles: ['deployment-manifest.json', 'receipt-signing-public-key.pem'],
  });
  const [manifestFile, receiptKey] = await Promise.all([
    readLimitedJson(
      join(scan.real_path, 'deployment-manifest.json'),
      `${jobId} service deployment manifest`,
      ARTIFACT_LIMITS.service_deployment,
    ),
    readPublicKey(
      join(scan.real_path, 'receipt-signing-public-key.pem'),
      `${jobId} service receipt signing key`,
      ARTIFACT_LIMITS.service_deployment,
    ),
  ]);
  validateServiceDeploymentManifest(manifestFile.value, {
    candidateSha256,
    candidateValidatorExecutionReportSha256,
    jobId,
    lessonId,
    learnerViewContract,
    receiptKeyFingerprint: receiptKey.fingerprint,
    safeClientSha256,
    scoringBuild,
    sourcePlanSha256,
    waveId,
  });
  return { ...scan, manifest: manifestFile.value, receipt_signing_key: receiptKey };
}

function validateOpaqueServiceAttestationDocument(value, expected) {
  assertExactKeys(
    value,
    [
      'accepts_real_submitted_responses',
      'action_schema_id',
      'action_schema_sha256',
      'candidate_sha256',
      'candidate_validator_execution_report_sha256',
      'deployment_id',
      'ephemeral',
      'exact_key_bearing_candidate_deployed',
      'integrator_identity',
      'job_id',
      'lesson_id',
      'ordinary_learner_authorized_feedback_only',
      'outcome_override_controls_exposed',
      'protected_scoring_material_exposed',
      'rationales_before_response_exposed',
      'receipt_signing_key_fingerprint',
      'safe_client_sha256',
      'schema_version',
      'server_definition_exposed',
      'service_deployment_artifact_sha256',
      'solver_identity',
      'source_branch_exposed',
      'source_plan_sha256',
      'transition_profile_id',
      'wave_id',
    ],
    'opaque service deployment/ACL attestation',
  );
  assert.equal(value.schema_version, OPAQUE_SERVICE_ATTESTATION_SCHEMA_VERSION);
  assert.equal(value.source_plan_sha256, expected.sourcePlanSha256);
  assert.equal(value.wave_id, expected.waveId);
  assert.equal(value.job_id, expected.jobId);
  assert.equal(value.lesson_id, expected.lessonId);
  assert.equal(value.candidate_sha256, expected.candidateSha256);
  assert.equal(
    value.candidate_validator_execution_report_sha256,
    expected.candidateValidatorExecutionReportSha256,
  );
  assert.equal(value.action_schema_id, expected.learnerViewContract.action_schema_id);
  assert.equal(value.action_schema_sha256, expected.learnerViewContract.action_schema_sha256);
  assert.equal(
    value.transition_profile_id,
    expected.learnerViewContract.transition_profile.profile_id,
  );
  assert.equal(value.safe_client_sha256, expected.safeClientSha256);
  assert.equal(value.deployment_id, expected.deployment.manifest.deployment_id);
  assert.equal(value.service_deployment_artifact_sha256, expected.deployment.artifact_sha256);
  assert.equal(
    value.receipt_signing_key_fingerprint,
    expected.deployment.receipt_signing_key.fingerprint,
  );
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

async function validateSignedOpaqueServiceAttestation({
  candidateSha256,
  candidateValidatorExecutionReportSha256,
  deployment,
  descriptor,
  integrationTrustRootPem,
  integratorIdentity,
  jobId,
  learnerViewContract,
  lessonId,
  repositoryRoot,
  safeClientSha256,
  solverIdentity,
  sourcePlanSha256,
  waveId,
}) {
  assertExactKeys(
    descriptor,
    [
      'attestation_path',
      'attestation_sha256',
      'attestation_signature_path',
      'attestation_signature_sha256',
    ],
    `${jobId} service attestation descriptor`,
  );
  const signed = await readAndVerifySignedJson({
    documentPath: descriptor.attestation_path,
    documentSha256: descriptor.attestation_sha256,
    label: `${jobId} service deployment/ACL attestation`,
    publicKeyPem: integrationTrustRootPem,
    repositoryRoot,
    signaturePath: descriptor.attestation_signature_path,
    signatureSha256: descriptor.attestation_signature_sha256,
  });
  validateOpaqueServiceAttestationDocument(signed.value, {
    candidateSha256,
    candidateValidatorExecutionReportSha256,
    deployment,
    integratorIdentity,
    jobId,
    learnerViewContract,
    lessonId,
    safeClientSha256,
    solverIdentity,
    sourcePlanSha256,
    waveId,
  });
}

function validateSemanticState(value, expected, label) {
  assertExactKeys(
    value,
    [
      'activity_family_sha256',
      'activity_id',
      'activity_representation_sha256s',
      'assistance_level',
      'assistance_revealed',
      'available_action_kinds',
      'planner_reentry_required',
      'repair_cycle',
      'route_sha256',
      'state_sha256',
      'state_version',
      'status',
    ],
    label,
  );
  if (value.activity_id === null) {
    assert.equal(value.activity_family_sha256, null);
    assert.deepEqual(value.activity_representation_sha256s, []);
  } else {
    requireString(value.activity_id, `${label}.activity_id`);
    assert(expected.activityIds.has(value.activity_id), `${label} references unknown activity`);
    requireHash(value.activity_family_sha256, `${label}.activity_family_sha256`);
    assert(
      Array.isArray(value.activity_representation_sha256s) &&
        value.activity_representation_sha256s.length > 0,
      `${label} needs representation fingerprints`,
    );
    value.activity_representation_sha256s.forEach((hash) =>
      requireHash(hash, `${label} representation SHA-256`),
    );
    assert.deepEqual(
      value.activity_representation_sha256s,
      [...new Set(value.activity_representation_sha256s)].sort(compareText),
      `${label} representation fingerprints must be unique/sorted`,
    );
  }
  assert(
    value.assistance_level === null || typeof value.assistance_level === 'string',
    `${label}.assistance_level must be null or a string`,
  );
  assert.equal(typeof value.assistance_revealed, 'boolean');
  assert(Array.isArray(value.available_action_kinds));
  assert.deepEqual(
    value.available_action_kinds,
    [...new Set(value.available_action_kinds)].sort(compareText),
    `${label} available actions must be unique/sorted`,
  );
  value.available_action_kinds.forEach((actionKind) =>
    assert(
      expected.transitionProfile.action_kinds.includes(actionKind),
      `${label} contains unsupported action ${actionKind}`,
    ),
  );
  assert.equal(typeof value.planner_reentry_required, 'boolean');
  assert(Number.isInteger(value.repair_cycle) && value.repair_cycle >= 0);
  if (value.route_sha256 !== null) requireHash(value.route_sha256, `${label}.route_sha256`);
  assert(
    expected.transitionProfile.semantic_statuses.includes(value.status),
    `${label} has unsupported status ${value.status}`,
  );
  requireHash(value.state_sha256, `${label}.state_sha256`);
  assert(Number.isInteger(value.state_version) && value.state_version >= 0);
  const { state_sha256: stateSha256, ...payload } = value;
  assert.equal(stateSha256, hashCanonicalJson(payload), `${label} semantic-state hash is stale`);
}

function validateReceiptDocument(value, expected) {
  assertExactKeys(
    value,
    [
      'action_kind',
      'activity_id',
      'after_state',
      'attempt_id',
      'before_state',
      'candidate_sha256',
      'deployment_id',
      'event_trace_sha256',
      'event_types',
      'learner_feedback_sha256',
      'receipt_signing_key_fingerprint',
      'request_id',
      'response_outcome',
      'safe_client_sha256',
      'schema_version',
      'sequence',
      'service_deployment_artifact_sha256',
      'service_timestamp',
      'session_id',
      'submitted_response_sha256',
      'transition_profile_id',
    ],
    `service receipt ${expected.sequence}`,
  );
  assert.equal(value.schema_version, SERVICE_RECEIPT_SCHEMA_VERSION);
  assert.equal(value.sequence, expected.sequence);
  assert.equal(value.session_id, expected.sessionId);
  assert.equal(value.candidate_sha256, expected.candidateSha256);
  assert.equal(value.safe_client_sha256, expected.safeClientSha256);
  assert.equal(value.deployment_id, expected.deployment.manifest.deployment_id);
  assert.equal(value.service_deployment_artifact_sha256, expected.deployment.artifact_sha256);
  assert.equal(value.transition_profile_id, expected.transitionProfile.profile_id);
  assert.equal(
    value.receipt_signing_key_fingerprint,
    expected.deployment.receipt_signing_key.fingerprint,
  );
  requireString(value.attempt_id, 'service receipt attempt ID');
  requireString(value.request_id, 'service receipt request ID');
  requireString(value.service_timestamp, 'service receipt timestamp');
  assert.match(
    value.service_timestamp,
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
    'Service receipt timestamp must be canonical RFC 3339 UTC',
  );
  const timestamp = Date.parse(value.service_timestamp);
  assert.equal(Number.isNaN(timestamp), false, 'Service receipt timestamp is invalid');
  assert.equal(new Date(timestamp).toISOString(), value.service_timestamp);
  const actionContract = expected.transitionProfile.action_contracts.find(
    (contract) => contract.action_kind === value.action_kind,
  );
  assert(actionContract, `Unsupported learner action kind ${value.action_kind}`);
  validateSemanticState(
    value.before_state,
    expected,
    `service receipt ${expected.sequence} before`,
  );
  validateSemanticState(value.after_state, expected, `service receipt ${expected.sequence} after`);
  assert(
    value.before_state.available_action_kinds.includes(value.action_kind),
    `Learner action ${value.action_kind} was not available in the signed before-state`,
  );
  if (actionContract.activity_binding === 'REQUIRED') {
    requireString(value.activity_id, 'service receipt activity ID');
    assert.equal(value.activity_id, value.before_state.activity_id);
  } else if (actionContract.activity_binding === 'OPTIONAL') {
    if (value.activity_id !== null) {
      requireString(value.activity_id, 'service receipt activity ID');
      assert.equal(value.activity_id, value.before_state.activity_id);
    }
  } else {
    assert.equal(value.activity_id, null);
  }
  if (actionContract.response_hash === 'REQUIRED') {
    requireHash(value.submitted_response_sha256, 'submitted response SHA-256');
    assert(
      actionContract.allowed_response_outcomes.includes(value.response_outcome),
      `${value.action_kind} cannot produce ${value.response_outcome}`,
    );
  } else {
    assert.equal(value.submitted_response_sha256, null);
    assert.equal(value.response_outcome, null);
  }
  assert(Array.isArray(value.event_types) && value.event_types.length > 0);
  assert.equal(
    new Set(value.event_types).size,
    value.event_types.length,
    'Service receipt event types may not repeat',
  );
  value.event_types.forEach((eventType) =>
    assert(
      expected.transitionProfile.event_kinds.includes(eventType),
      `Service receipt has unsupported runtime event ${eventType}`,
    ),
  );
  actionContract.required_event_kinds.forEach((eventType) =>
    assert(value.event_types.includes(eventType), `${value.action_kind} lacks ${eventType}`),
  );
  requireHash(value.event_trace_sha256, 'service event-trace SHA-256');
  assert.equal(
    value.event_trace_sha256,
    hashCanonicalJson(value.event_types),
    'Service event-trace hash is stale',
  );
  requireHash(value.learner_feedback_sha256, 'learner feedback SHA-256');
  assert.notEqual(
    value.before_state.state_sha256,
    value.after_state.state_sha256,
    'Service receipt must attest a state transition',
  );
  assert(
    value.after_state.state_version > value.before_state.state_version,
    'Service receipt state version must increase',
  );
  return timestamp;
}

function stateMatchesConstraint(state, constraint) {
  return (
    (constraint.assistance_revealed === null ||
      state.assistance_revealed === constraint.assistance_revealed) &&
    (constraint.planner_reentry_required === null ||
      state.planner_reentry_required === constraint.planner_reentry_required) &&
    (constraint.repair_cycle === null || state.repair_cycle === constraint.repair_cycle) &&
    (constraint.status === null || state.status === constraint.status)
  );
}

function valuesMatchRelation(current, previous, relation) {
  if (relation === 'ANY') return true;
  const same = JSON.stringify(current) === JSON.stringify(previous);
  return relation === 'SAME' ? same : !same;
}

function statesMatchRelations(current, previous, relation) {
  return (
    valuesMatchRelation(current.activity_id, previous.activity_id, relation.activity) &&
    valuesMatchRelation(
      current.activity_family_sha256,
      previous.activity_family_sha256,
      relation.family,
    ) &&
    valuesMatchRelation(
      current.activity_representation_sha256s,
      previous.activity_representation_sha256s,
      relation.representations,
    ) &&
    valuesMatchRelation(current.route_sha256, previous.route_sha256, relation.route) &&
    (relation.repair_cycle === 'ANY' ||
      (relation.repair_cycle === 'SAME' && current.repair_cycle === previous.repair_cycle) ||
      (relation.repair_cycle === 'INCREASE' && current.repair_cycle > previous.repair_cycle))
  );
}

function receiptMatchesPathStep(receipt, step, previousReceipt) {
  if (receipt.action_kind !== step.action_kind) return false;
  if (receipt.response_outcome !== step.response_outcome) return false;
  if (!step.required_event_kinds.every((eventType) => receipt.event_types.includes(eventType))) {
    return false;
  }
  if (!stateMatchesConstraint(receipt.before_state, step.before)) return false;
  if (!stateMatchesConstraint(receipt.after_state, step.after)) return false;
  if (!statesMatchRelations(receipt.after_state, receipt.before_state, step.state_transition)) {
    return false;
  }
  return (
    previousReceipt === null ||
    statesMatchRelations(
      receipt.before_state,
      previousReceipt.before_state,
      step.relation_to_previous,
    )
  );
}

function findOrderedProfileTrace(
  receipts,
  steps,
  stepIndex = 0,
  receiptIndex = 0,
  previous = null,
) {
  if (stepIndex === steps.length) return true;
  for (let index = receiptIndex; index < receipts.length; index += 1) {
    if (
      receiptMatchesPathStep(receipts[index], steps[stepIndex], previous) &&
      findOrderedProfileTrace(receipts, steps, stepIndex + 1, index + 1, receipts[index])
    ) {
      return true;
    }
  }
  return false;
}

function validateSemanticPathCoverage(receipts, transitionProfile) {
  const pathIds = transitionProfile.path_contracts.map((path) => path.path_id);
  assert.deepEqual(
    pathIds,
    [...REQUIRED_BLIND_PATH_IDS],
    'Signed action/transition profile does not cover every required blind semantic goal',
  );
  for (const path of transitionProfile.path_contracts) {
    assert(
      findOrderedProfileTrace(receipts, path.steps),
      `${path.path_id} lacks a signed-profile-valid ordered receipt trace`,
    );
  }
  return pathIds;
}

function validateReceiptManifest(value, expected) {
  assertExactKeys(
    value,
    [
      'action_schema_id',
      'candidate_sha256',
      'deployment_id',
      'entries',
      'receipt_count',
      'receipt_signing_key_fingerprint',
      'safe_client_sha256',
      'schema_version',
      'service_deployment_artifact_sha256',
      'session_closed',
      'session_id',
      'transition_profile_id',
    ],
    'service receipt manifest',
  );
  assert.equal(value.schema_version, SERVICE_RECEIPT_MANIFEST_SCHEMA_VERSION);
  assert.equal(value.action_schema_id, expected.learnerViewContract.action_schema_id);
  assert.equal(
    value.transition_profile_id,
    expected.learnerViewContract.transition_profile.profile_id,
  );
  assert.equal(value.candidate_sha256, expected.candidateSha256);
  assert.equal(value.safe_client_sha256, expected.safeClientSha256);
  assert.equal(value.deployment_id, expected.deployment.manifest.deployment_id);
  assert.equal(value.service_deployment_artifact_sha256, expected.deployment.artifact_sha256);
  assert.equal(
    value.receipt_signing_key_fingerprint,
    expected.deployment.receipt_signing_key.fingerprint,
  );
  requireString(value.session_id, 'service receipt session ID');
  assert(Array.isArray(value.entries) && value.entries.length > 0);
  assert.equal(value.receipt_count, value.entries.length);
  assert.equal(value.session_closed, true);
  const paths = new Set();
  for (const [index, entry] of value.entries.entries()) {
    const label = `service receipt manifest.entries[${index}]`;
    assertExactKeys(
      entry,
      ['receipt_path', 'receipt_sha256', 'sequence', 'signature_path', 'signature_sha256'],
      label,
    );
    assert.equal(entry.sequence, index + 1, `${label}.sequence must be contiguous`);
    requireString(entry.receipt_path, `${label}.receipt_path`);
    requireHash(entry.receipt_sha256, `${label}.receipt_sha256`);
    requireString(entry.signature_path, `${label}.signature_path`);
    requireHash(entry.signature_sha256, `${label}.signature_sha256`);
    for (const path of [entry.receipt_path, entry.signature_path]) {
      assert(!paths.has(path), `Receipt manifest duplicates ${path}`);
      paths.add(path);
    }
  }
}

async function validateSignedServiceReceiptArtifact({
  activityIds,
  candidateSha256,
  deployment,
  descriptor,
  learnerViewContract,
  repositoryRoot,
  safeClientSha256,
}) {
  const scan = await validateArtifactDescriptor(descriptor, {
    label: 'signed service receipt artifact',
    limits: ARTIFACT_LIMITS.receipt_log,
    repositoryRoot,
  });
  const manifestEntry = scan.file_manifest.find((file) => file.path === 'receipt-manifest.json');
  assert(manifestEntry, 'Signed service receipt artifact lacks receipt-manifest.json');
  const manifestSignatureEntry = scan.file_manifest.find(
    (file) => file.path === 'receipt-manifest.sig',
  );
  assert(manifestSignatureEntry, 'Signed service receipt artifact lacks receipt-manifest.sig');
  const { value: manifest } = await readAndVerifySignedJson({
    documentPath: `${descriptor.artifact_path}/receipt-manifest.json`,
    documentSha256: manifestEntry.sha256,
    label: 'service receipt manifest',
    limits: ARTIFACT_LIMITS.receipt_log,
    publicKeyPem: deployment.receipt_signing_key.pem,
    repositoryRoot,
    signaturePath: `${descriptor.artifact_path}/receipt-manifest.sig`,
    signatureSha256: manifestSignatureEntry.sha256,
  });
  validateReceiptManifest(manifest, {
    candidateSha256,
    deployment,
    learnerViewContract,
    safeClientSha256,
  });
  const expectedPaths = new Set(['receipt-manifest.json', 'receipt-manifest.sig']);
  manifest.entries.forEach((entry) => {
    expectedPaths.add(entry.receipt_path);
    expectedPaths.add(entry.signature_path);
  });
  assert.deepEqual(
    scan.file_manifest.map((file) => file.path),
    [...expectedPaths].sort(compareText),
    'Receipt artifact contains missing or extra files',
  );
  const receipts = [];
  const requestIds = new Set();
  let previousTimestamp = -Infinity;
  let previousState = null;
  for (const entry of manifest.entries) {
    const signed = await readAndVerifySignedJson({
      documentPath: `${descriptor.artifact_path}/${entry.receipt_path}`,
      documentSha256: entry.receipt_sha256,
      label: `service receipt ${entry.sequence}`,
      limits: ARTIFACT_LIMITS.receipt_log,
      publicKeyPem: deployment.receipt_signing_key.pem,
      repositoryRoot,
      signaturePath: `${descriptor.artifact_path}/${entry.signature_path}`,
      signatureSha256: entry.signature_sha256,
    });
    const timestamp = validateReceiptDocument(signed.value, {
      activityIds,
      candidateSha256,
      deployment,
      safeClientSha256,
      sequence: entry.sequence,
      sessionId: manifest.session_id,
      transitionProfile: learnerViewContract.transition_profile,
    });
    assert(timestamp > previousTimestamp, 'Service receipt timestamps must be strictly increasing');
    if (previousState === null) {
      assert.equal(
        signed.value.before_state.state_sha256,
        deployment.manifest.initial_state_sha256,
        'First service receipt does not begin at the deployed initial state',
      );
    } else {
      assert.deepEqual(
        signed.value.before_state,
        previousState,
        'Service receipt semantic-state chain is broken',
      );
    }
    assert(!requestIds.has(signed.value.request_id), 'Service receipt request IDs must be unique');
    requestIds.add(signed.value.request_id);
    previousTimestamp = timestamp;
    previousState = signed.value.after_state;
    receipts.push(signed.value);
  }
  return {
    artifact_sha256: scan.artifact_sha256,
    receipts,
    required_path_coverage: validateSemanticPathCoverage(
      receipts,
      learnerViewContract.transition_profile,
    ),
    session_id: manifest.session_id,
  };
}

function validateServiceIntegrationReportDocument(value, expected) {
  assertExactKeys(
    value,
    [
      'action_schema_id',
      'action_schema_sha256',
      'candidate_sha256',
      'checks',
      'deployment_id',
      'job_id',
      'lesson_id',
      'report_id',
      'safe_client_sha256',
      'schema_version',
      'scoring_service_build_id',
      'scoring_service_build_sha256',
      'scoring_service_build_version',
      'signing_key_fingerprint',
      'source_plan_sha256',
      'status',
      'transition_profile_id',
      'wave_id',
    ],
    'service integration execution report',
  );
  assert.equal(value.schema_version, SERVICE_INTEGRATION_REPORT_SCHEMA_VERSION);
  assert.equal(value.source_plan_sha256, expected.sourcePlanSha256);
  assert.equal(value.wave_id, expected.waveId);
  assert.equal(value.job_id, expected.jobId);
  assert.equal(value.lesson_id, expected.lessonId);
  assert.equal(value.candidate_sha256, expected.candidateSha256);
  assert.equal(value.safe_client_sha256, expected.safeClientSha256);
  assert.equal(value.deployment_id, expected.deployment.manifest.deployment_id);
  assert.equal(value.action_schema_id, expected.learnerViewContract.action_schema_id);
  assert.equal(value.action_schema_sha256, expected.learnerViewContract.action_schema_sha256);
  assert.equal(
    value.transition_profile_id,
    expected.learnerViewContract.transition_profile.profile_id,
  );
  assert.equal(
    value.scoring_service_build_id,
    expected.deployment.manifest.scoring_service_build_id,
  );
  assert.equal(
    value.scoring_service_build_version,
    expected.deployment.manifest.scoring_service_build_version,
  );
  assert.equal(
    value.scoring_service_build_sha256,
    expected.deployment.manifest.scoring_service_build_sha256,
  );
  assert.equal(value.signing_key_fingerprint, expected.deployment.receipt_signing_key.fingerprint);
  assert.equal(value.status, 'EXECUTED_AND_PASSED');
  requireString(value.report_id, 'service integration report ID');
  assert(Array.isArray(value.checks));
  for (const [index, check] of value.checks.entries()) {
    assertExactKeys(check, ['check_id', 'status'], `service integration check[${index}]`);
    assert.equal(check.status, 'PASS');
  }
  assert.deepEqual(
    value.checks.map((check) => check.check_id),
    expected.learnerViewContract.transition_profile.technical_service_check_ids,
    'Service integration report is missing signed-profile technical checks',
  );
  assert.deepEqual(
    value.checks.map((check) => check.check_id),
    [...REQUIRED_SERVICE_INTEGRATION_CHECK_IDS],
    'Invalid-activity and unsupported-action checks belong to the technical service gate',
  );
}

async function validateSignedServiceIntegrationReport({
  candidateSha256,
  deployment,
  descriptor,
  jobId,
  learnerViewContract,
  lessonId,
  repositoryRoot,
  safeClientSha256,
  sourcePlanSha256,
  waveId,
}) {
  validateSignedDescriptor(descriptor, `${jobId} service integration report descriptor`);
  assert.equal(descriptor.signer_key_fingerprint, deployment.receipt_signing_key.fingerprint);
  const signed = await readAndVerifySignedJson({
    documentPath: descriptor.report_path,
    documentSha256: descriptor.report_sha256,
    label: `${jobId} signed service integration execution report`,
    publicKeyPem: deployment.receipt_signing_key.pem,
    repositoryRoot,
    signaturePath: descriptor.report_signature_path,
    signatureSha256: descriptor.report_signature_sha256,
  });
  validateServiceIntegrationReportDocument(signed.value, {
    candidateSha256,
    deployment,
    jobId,
    learnerViewContract,
    lessonId,
    safeClientSha256,
    sourcePlanSha256,
    waveId,
  });
  return signed.value;
}

async function validateBrowserAccessibilityEvidenceArtifact({ descriptor, repositoryRoot }) {
  const requiredFiles = REQUIRED_ACCESSIBILITY_CHECK_IDS.map(
    (checkId) => `checks/${checkId}.json`,
  ).sort(compareText);
  const scan = await validateArtifactDescriptor(descriptor, {
    label: 'browser accessibility evidence artifact',
    limits: ARTIFACT_LIMITS.browser_evidence,
    repositoryRoot,
    requiredFiles,
  });
  const checks = new Map();
  for (const file of scan.file_manifest) {
    const { value } = await readLimitedJson(
      join(scan.real_path, file.path),
      `browser accessibility evidence ${file.path}`,
      ARTIFACT_LIMITS.browser_evidence,
    );
    assertExactKeys(
      value,
      ['check_id', 'observed_value', 'required_value', 'schema_version', 'status'],
      `browser accessibility evidence ${file.path}`,
    );
    assert.equal(value.schema_version, 'mcat-v3-browser-accessibility-check-evidence-1');
    assert.equal(file.path, `checks/${value.check_id}.json`);
    assert(REQUIRED_ACCESSIBILITY_CHECK_IDS.includes(value.check_id));
    assert.equal(value.status, 'PASS');
    requireString(value.observed_value, `${value.check_id} observed value`);
    requireString(value.required_value, `${value.check_id} required value`);
    checks.set(value.check_id, { ...value, sha256: file.sha256 });
  }
  return { ...scan, checks };
}

function validateAccessibilityExecutionReportDocument(value, expected) {
  assertExactKeys(
    value,
    [
      'browser_build_sha256',
      'browser_evidence_artifact_sha256',
      'candidate_sha256',
      'checks',
      'harness_build_id',
      'harness_build_sha256',
      'harness_build_version',
      'harness_signing_key_fingerprint',
      'job_id',
      'learner_action_schema_id',
      'learner_view_schema_id',
      'lesson_id',
      'media_digests',
      'reviewer_identity',
      'reviewer_slot_id',
      'safe_client_sha256',
      'schema_version',
      'source_plan_sha256',
      'status',
      'supported_action_kinds',
      'supported_representation_kinds',
      'transition_profile_id',
      'wave_id',
    ],
    'accessibility execution report',
  );
  assert.equal(value.schema_version, ACCESSIBILITY_EXECUTION_REPORT_SCHEMA_VERSION);
  assert.equal(value.source_plan_sha256, expected.sourcePlanSha256);
  assert.equal(value.wave_id, expected.waveId);
  assert.equal(value.job_id, expected.jobId);
  assert.equal(value.lesson_id, expected.lessonId);
  assert.equal(value.candidate_sha256, expected.candidateSha256);
  assert.equal(value.safe_client_sha256, expected.safeClientSha256);
  assert.equal(value.learner_action_schema_id, expected.learnerViewContract.action_schema_id);
  assert.equal(value.learner_view_schema_id, expected.learnerViewContract.view_schema_id);
  assert.equal(
    value.transition_profile_id,
    expected.learnerViewContract.transition_profile.profile_id,
  );
  assert.equal(value.harness_build_id, expected.harnessBuild.manifest.build_id);
  assert.equal(value.harness_build_sha256, expected.harnessBuild.artifact_sha256);
  assert.equal(value.harness_build_version, expected.harnessBuild.manifest.build_version);
  assert.equal(
    value.harness_signing_key_fingerprint,
    expected.harnessBuild.signing_key.fingerprint,
  );
  assert.deepEqual(value.reviewer_identity, expected.reviewerIdentity);
  assert.equal(value.reviewer_slot_id, expected.reviewerSlotId);
  assert.deepEqual(
    value.supported_action_kinds,
    expected.learnerViewContract.transition_profile.action_kinds,
  );
  assert.deepEqual(
    value.supported_representation_kinds,
    expected.learnerViewContract.representation_kinds,
  );
  assert.deepEqual(value.media_digests, expected.mediaDigests);
  requireHash(value.browser_build_sha256, 'accessibility browser build SHA-256');
  assert.equal(value.browser_evidence_artifact_sha256, expected.browserEvidence.artifact_sha256);
  assert.equal(value.status, 'EXECUTED_AND_PASSED');
  assert(Array.isArray(value.checks));
  for (const [index, check] of value.checks.entries()) {
    const label = `accessibility checks[${index}]`;
    assertExactKeys(
      check,
      ['check_id', 'evidence_sha256', 'observed_value', 'required_value', 'status'],
      label,
    );
    requireHash(check.evidence_sha256, `${label}.evidence_sha256`);
    requireString(check.observed_value, `${label}.observed_value`);
    requireString(check.required_value, `${label}.required_value`);
    assert.equal(check.status, 'PASS');
    const browserEvidence = expected.browserEvidence.checks.get(check.check_id);
    assert(browserEvidence, `${label} lacks browser evidence file`);
    assert.equal(check.evidence_sha256, browserEvidence.sha256);
    assert.equal(check.observed_value, browserEvidence.observed_value);
    assert.equal(check.required_value, browserEvidence.required_value);
  }
  assert.deepEqual(value.checks.map((check) => check.check_id).sort(compareText), [
    ...REQUIRED_ACCESSIBILITY_CHECK_IDS,
  ]);
}

async function validateSignedAccessibilityExecutionReport({
  browserEvidenceDescriptor,
  candidateSha256,
  descriptor,
  harnessBuild,
  jobId,
  learnerViewContract,
  lessonId,
  mediaDigests,
  repositoryRoot,
  reviewerIdentity,
  reviewerSlotId,
  safeClientSha256,
  sourcePlanSha256,
  waveId,
}) {
  const browserEvidence = await validateBrowserAccessibilityEvidenceArtifact({
    descriptor: browserEvidenceDescriptor,
    repositoryRoot,
  });
  validateSignedDescriptor(descriptor, `${jobId} accessibility execution descriptor`);
  assert.equal(descriptor.signer_key_fingerprint, harnessBuild.signing_key.fingerprint);
  const signed = await readAndVerifySignedJson({
    documentPath: descriptor.report_path,
    documentSha256: descriptor.report_sha256,
    label: `${jobId} signed browser/accessibility execution report`,
    publicKeyPem: harnessBuild.signing_key.pem,
    repositoryRoot,
    signaturePath: descriptor.report_signature_path,
    signatureSha256: descriptor.report_signature_sha256,
  });
  validateAccessibilityExecutionReportDocument(signed.value, {
    browserEvidence,
    candidateSha256,
    harnessBuild,
    jobId,
    learnerViewContract,
    lessonId,
    mediaDigests,
    reviewerIdentity,
    reviewerSlotId,
    safeClientSha256,
    sourcePlanSha256,
    waveId,
  });
  return signed.value;
}

function validateSourceOutputSimilarityDocument(value, expected) {
  assertExactKeys(
    value,
    [
      'candidate_sha256',
      'checks',
      'job_id',
      'lesson_id',
      'report_author_identity',
      'report_id',
      'reviewer_slot_id',
      'schema_version',
      'signing_key_fingerprint',
      'source_ledger_sha256',
      'source_plan_sha256',
      'status',
      'wave_id',
    ],
    'source-output similarity report',
  );
  assert.equal(value.schema_version, SOURCE_OUTPUT_SIMILARITY_SCHEMA_VERSION);
  for (const key of [
    'candidate_sha256',
    'job_id',
    'lesson_id',
    'reviewer_slot_id',
    'source_ledger_sha256',
    'source_plan_sha256',
    'wave_id',
  ]) {
    assert.equal(value[key], expected[key]);
  }
  assert.deepEqual(value.report_author_identity, expected.report_author_identity);
  assert.equal(value.signing_key_fingerprint, expected.signing_key_fingerprint);
  assert.equal(value.status, 'PASS');
  requireString(value.report_id, 'source-output similarity report ID');
  assert(Array.isArray(value.checks) && value.checks.length > 0);
  value.checks.forEach((check, index) => {
    assertExactKeys(check, ['check_id', 'status'], `source similarity checks[${index}]`);
    assert.equal(check.status, 'PASS');
  });
  assert.deepEqual(
    value.checks.map((check) => check.check_id).sort(compareText),
    [
      'NO_EXPRESSIVE_SOURCE_COPYING',
      'SOURCE_LEDGER_CEILINGS_OBSERVED',
      'SOURCE_OUTPUT_SIMILARITY_WITHIN_POLICY',
    ],
    'Source-output similarity report is missing required checks',
  );
}

function validateRightsReportDocument(value, expected) {
  assertExactKeys(
    value,
    [
      'candidate_sha256',
      'gate_id',
      'input_rights_approved',
      'job_id',
      'lesson_id',
      'output_rights_and_originality_approved',
      'report_author_identity',
      'report_id',
      'reviewer_slot_id',
      'schema_version',
      'signing_key_fingerprint',
      'source_ledger_sha256',
      'source_output_similarity_report_sha256',
      'source_plan_sha256',
      'status',
      'wave_id',
    ],
    'rights review report',
  );
  assert.equal(value.schema_version, RIGHTS_REPORT_SCHEMA_VERSION);
  assert.equal(value.gate_id, 'G05_CLEAN_ROOM_RIGHTS_AND_ORIGINALITY');
  for (const key of [
    'candidate_sha256',
    'job_id',
    'lesson_id',
    'reviewer_slot_id',
    'source_ledger_sha256',
    'source_output_similarity_report_sha256',
    'source_plan_sha256',
    'wave_id',
  ]) {
    assert.equal(value[key], expected[key]);
  }
  assert.deepEqual(value.report_author_identity, expected.report_author_identity);
  assert.equal(value.signing_key_fingerprint, expected.signing_key_fingerprint);
  assert.equal(value.input_rights_approved, true);
  assert.equal(value.output_rights_and_originality_approved, true);
  assert.equal(value.status, 'APPROVED');
  requireString(value.report_id, 'rights review report ID');
}

async function validateSignedRightsEvidence({
  assignment,
  candidateSha256,
  credential,
  evidence,
  jobId,
  lessonId,
  repositoryRoot,
  reviewerSlotId,
  sourceLedgerSha256,
  sourcePlanSha256,
  waveId,
}) {
  assertExactKeys(
    evidence,
    ['rights_report', 'source_output_similarity_report'],
    `${jobId} G05 evidence`,
  );
  const authorIdentity = {
    person_id: assignment.assignee_person_id,
    run_id: assignment.assignee_run_id,
  };
  const similaritySigned = await readAssignedSignedReport({
    assignment,
    credential,
    descriptor: evidence.source_output_similarity_report,
    label: `${jobId} source-output similarity report`,
    repositoryRoot,
  });
  validateSourceOutputSimilarityDocument(similaritySigned.value, {
    candidate_sha256: candidateSha256,
    job_id: jobId,
    lesson_id: lessonId,
    report_author_identity: authorIdentity,
    reviewer_slot_id: reviewerSlotId,
    signing_key_fingerprint: credential.public_key.fingerprint,
    source_ledger_sha256: sourceLedgerSha256,
    source_plan_sha256: sourcePlanSha256,
    wave_id: waveId,
  });
  const rightsSigned = await readAssignedSignedReport({
    assignment,
    credential,
    descriptor: evidence.rights_report,
    label: `${jobId} rights review report`,
    repositoryRoot,
  });
  validateRightsReportDocument(rightsSigned.value, {
    candidate_sha256: candidateSha256,
    job_id: jobId,
    lesson_id: lessonId,
    report_author_identity: authorIdentity,
    reviewer_slot_id: reviewerSlotId,
    signing_key_fingerprint: credential.public_key.fingerprint,
    source_ledger_sha256: sourceLedgerSha256,
    source_output_similarity_report_sha256: evidence.source_output_similarity_report.report_sha256,
    source_plan_sha256: sourcePlanSha256,
    wave_id: waveId,
  });
}

function validateDomainReportDocument(value, expected) {
  assertExactKeys(
    value,
    [
      'candidate_sha256',
      'checks',
      'gate_id',
      'job_id',
      'lesson_id',
      'report_author_identity',
      'report_id',
      'reviewer_slot_id',
      'schema_version',
      'selected_passage_subject',
      'signing_key_fingerprint',
      'source_ledger_sha256',
      'source_plan_sha256',
      'specialty',
      'status',
      'wave_id',
    ],
    'domain/scientific report',
  );
  assert.equal(value.schema_version, DOMAIN_REPORT_SCHEMA_VERSION);
  assert.equal(value.gate_id, 'G10_DOMAIN_FACT_CHECK_AND_SCIENTIFIC_REVIEW');
  for (const key of [
    'candidate_sha256',
    'job_id',
    'lesson_id',
    'reviewer_slot_id',
    'selected_passage_subject',
    'source_ledger_sha256',
    'source_plan_sha256',
    'specialty',
    'wave_id',
  ]) {
    assert.equal(value[key], expected[key]);
  }
  assert.deepEqual(value.report_author_identity, expected.report_author_identity);
  assert.equal(value.signing_key_fingerprint, expected.signing_key_fingerprint);
  assert.equal(value.status, 'APPROVED');
  requireString(value.report_id, 'domain review report ID');
  assert(Array.isArray(value.checks) && value.checks.length > 0);
  value.checks.forEach((check, index) => {
    assertExactKeys(check, ['check_id', 'status'], `domain checks[${index}]`);
    assert.equal(check.status, 'PASS');
  });
  assert.deepEqual(
    value.checks.map((check) => check.check_id).sort(compareText),
    [
      expected.specialty === 'CARS_PASSAGE_SUBJECT_FACT_CHECK'
        ? 'PASSAGE_SUBJECT_FACTS_AND_CEILING'
        : 'DOMAIN_FACTS_SCOPE_ASSUMPTIONS_AND_BOUNDARIES',
    ],
    'Domain report is missing required checks',
  );
}

async function validateSignedDomainReport({
  assignment,
  candidateSha256,
  credential,
  descriptor,
  jobId,
  lessonId,
  repositoryRoot,
  reviewerSlotId,
  selectedPassageSubject,
  sourceLedgerSha256,
  sourcePlanSha256,
  specialty,
  waveId,
}) {
  const signed = await readAssignedSignedReport({
    assignment,
    credential,
    descriptor,
    label: `${jobId} ${specialty} domain review`,
    repositoryRoot,
  });
  validateDomainReportDocument(signed.value, {
    candidate_sha256: candidateSha256,
    job_id: jobId,
    lesson_id: lessonId,
    report_author_identity: {
      person_id: assignment.assignee_person_id,
      run_id: assignment.assignee_run_id,
    },
    reviewer_slot_id: reviewerSlotId,
    selected_passage_subject: selectedPassageSubject,
    signing_key_fingerprint: credential.public_key.fingerprint,
    source_ledger_sha256: sourceLedgerSha256,
    source_plan_sha256: sourcePlanSha256,
    specialty,
    wave_id: waveId,
  });
}

function validateCumulativeCorpusDocument(value, expected) {
  assertExactKeys(
    value,
    [
      'candidate_bindings',
      'included_wave_ids',
      'manifest_id',
      'schema_version',
      'source_plan_sha256',
      'status',
    ],
    'cumulative prior-corpus manifest',
  );
  assert.equal(value.schema_version, CUMULATIVE_CORPUS_SCHEMA_VERSION);
  assert.equal(value.source_plan_sha256, expected.sourcePlanSha256);
  assert.deepEqual(value.included_wave_ids, expected.priorWaveIds);
  requireString(value.manifest_id, 'cumulative corpus manifest ID');
  assert.equal(value.status, 'INTEGRATED_AND_PINNED');
  assert(Array.isArray(value.candidate_bindings));
  assert.equal(
    value.candidate_bindings.length,
    expected.priorJobs.length,
    'Prior corpus must bind every historical job',
  );
  const expectedJobById = new Map(expected.priorJobs.map((job) => [job.job_id, job]));
  const lessonIds = new Set();
  for (const [index, binding] of value.candidate_bindings.entries()) {
    assertExactKeys(
      binding,
      ['candidate_sha256', 'job_id', 'lesson_id', 'wave_id'],
      `prior corpus binding[${index}]`,
    );
    const expectedJob = expectedJobById.get(binding.job_id);
    assert(expectedJob, `Prior corpus contains unknown job ${binding.job_id}`);
    assert.equal(binding.lesson_id, expectedJob.lesson_id);
    assert.equal(binding.wave_id, expectedJob.wave_id);
    requireHash(binding.candidate_sha256, `prior corpus binding[${index}].candidate_sha256`);
    assert(!lessonIds.has(binding.lesson_id), `Prior corpus duplicates ${binding.lesson_id}`);
    lessonIds.add(binding.lesson_id);
  }
  assert.deepEqual(
    new Set(value.candidate_bindings.map((binding) => binding.job_id)),
    new Set(expected.priorJobs.map((job) => job.job_id)),
    'Prior corpus omits historical jobs',
  );
  assert.deepEqual(
    value.candidate_bindings.map(({ job_id, lesson_id, wave_id }) => ({
      job_id,
      lesson_id,
      wave_id,
    })),
    expected.priorJobs,
    'Prior corpus bindings must follow deterministic historical wave/job order',
  );
}

async function validateSignedCumulativeCorpusManifest({
  descriptor,
  integrationTrustRootPem,
  priorJobs,
  priorWaveIds,
  repositoryRoot,
  sourcePlanSha256,
}) {
  assertExactKeys(
    descriptor,
    ['manifest_path', 'manifest_sha256', 'manifest_signature_path', 'manifest_signature_sha256'],
    'cumulative corpus descriptor',
  );
  const signed = await readAndVerifySignedJson({
    documentPath: descriptor.manifest_path,
    documentSha256: descriptor.manifest_sha256,
    label: 'signed cumulative prior-corpus manifest',
    publicKeyPem: integrationTrustRootPem,
    repositoryRoot,
    signaturePath: descriptor.manifest_signature_path,
    signatureSha256: descriptor.manifest_signature_sha256,
  });
  validateCumulativeCorpusDocument(signed.value, {
    priorJobs,
    priorWaveIds,
    sourcePlanSha256,
  });
  return signed.value;
}

function validateWaveSimilarityReportDocument(value, expected) {
  assertExactKeys(
    value,
    [
      'candidate_bindings',
      'checks',
      'comparison_wave_ids',
      'gate_id',
      'prior_corpus_manifest_sha256',
      'report_id',
      'reviewers',
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
  assert.equal(value.prior_corpus_manifest_sha256, expected.priorCorpusManifestSha256);
  assert.deepEqual(value.reviewers, expected.reviewers);
  assert.equal(value.status, 'APPROVED');
  requireString(value.report_id, 'wave similarity report ID');
  assert(Array.isArray(value.checks) && value.checks.length > 0);
  value.checks.forEach((check, index) => {
    assertExactKeys(check, ['check_id', 'status'], `wave similarity checks[${index}]`);
    assert.equal(check.status, 'PASS');
  });
  assert.deepEqual(value.checks.map((check) => check.check_id).sort(compareText), [
    'COMPLETE_PRIOR_CORPUS',
    'CURRENT_WAVE_CROSS_DOMAIN',
    'TEMPLATE_OVERFITTING',
  ]);
}

async function validateMultiSignedWaveSimilarityReport({
  candidateBindings,
  comparisonWaveIds,
  credentialsBySlotId,
  descriptor,
  priorCorpusManifestSha256,
  repositoryRoot,
  reviewerAssignments,
  sourcePlanSha256,
  waveId,
}) {
  assertExactKeys(
    descriptor,
    ['report_path', 'report_sha256', 'signatures'],
    'wave similarity evidence',
  );
  assert(Array.isArray(descriptor.signatures));
  assert.equal(descriptor.signatures.length, reviewerAssignments.length);
  let reportValue = null;
  let reportBytes = null;
  for (const [index, assignment] of reviewerAssignments.entries()) {
    const signature = descriptor.signatures[index];
    assertExactKeys(
      signature,
      ['reviewer_slot_id', 'signature_path', 'signature_sha256', 'signer_key_fingerprint'],
      `wave similarity signature[${index}]`,
    );
    assert.equal(signature.reviewer_slot_id, assignment.slot_id);
    const credential = credentialsBySlotId.get(assignment.slot_id);
    assert(credential);
    assert.equal(signature.signer_key_fingerprint, credential.public_key.fingerprint);
    const signed = await readAndVerifySignedJson({
      documentPath: descriptor.report_path,
      documentSha256: descriptor.report_sha256,
      label: `wave similarity report signature ${assignment.slot_id}`,
      publicKeyPem: credential.public_key.pem,
      repositoryRoot,
      signaturePath: signature.signature_path,
      signatureSha256: signature.signature_sha256,
    });
    if (reportValue === null) {
      reportValue = signed.value;
      reportBytes = signed.bytes;
    } else {
      assert(reportBytes.equals(signed.bytes));
    }
  }
  const reviewers = reviewerAssignments.map((assignment) => ({
    identity: {
      person_id: assignment.assignee_person_id,
      run_id: assignment.assignee_run_id,
    },
    reviewer_slot_id: assignment.slot_id,
    signing_key_fingerprint: credentialsBySlotId.get(assignment.slot_id).public_key.fingerprint,
  }));
  validateWaveSimilarityReportDocument(reportValue, {
    candidateBindings,
    comparisonWaveIds,
    priorCorpusManifestSha256,
    reviewers,
    sourcePlanSha256,
    waveId,
  });
}

export {
  ACCESSIBILITY_EXECUTION_REPORT_SCHEMA_VERSION,
  BUNDLE_FILES,
  CANDIDATE_MANIFEST_SCHEMA_VERSION,
  CANDIDATE_VALIDATOR_EXECUTION_REPORT_SCHEMA_VERSION,
  CLOSED_BUNDLE_SCANNER_ID,
  CLOSED_BUNDLE_SCHEMA_VERSION,
  CUMULATIVE_CORPUS_SCHEMA_VERSION,
  DOMAIN_REPORT_SCHEMA_VERSION,
  EXCLUDED_CONTENT_CLASSES,
  GATE_REPORT_SCHEMA_VERSION,
  HASH_PATTERN,
  OPAQUE_SERVICE_ATTESTATION_SCHEMA_VERSION,
  REQUIRED_ACCESSIBILITY_CHECK_IDS,
  REQUIRED_BLIND_PATH_IDS,
  REQUIRED_GATE_CHECK_IDS,
  REQUIRED_SERVICE_INTEGRATION_CHECK_IDS,
  RIGHTS_REPORT_SCHEMA_VERSION,
  SAFE_PROJECTION_REPORT_SCHEMA_VERSION,
  SERVICE_DEPLOYMENT_MANIFEST_SCHEMA_VERSION,
  SERVICE_INTEGRATION_REPORT_SCHEMA_VERSION,
  SERVICE_RECEIPT_MANIFEST_SCHEMA_VERSION,
  SERVICE_RECEIPT_SCHEMA_VERSION,
  SOURCE_OUTPUT_SIMILARITY_SCHEMA_VERSION,
  WAVE_SIMILARITY_REPORT_SCHEMA_VERSION,
  createClosedReviewBundleManifest,
  validateAndHashCandidateArtifact,
  validateAndHashClosedReviewBundle,
  validateMultiSignedWaveSimilarityReport,
  validateSafeProjectionEvidence,
  validateSignedAccessibilityExecutionReport,
  validateSignedCandidateValidatorExecution,
  validateSignedCumulativeCorpusManifest,
  validateSignedDomainReport,
  validateSignedGateReport,
  validateSignedOpaqueServiceAttestation,
  validateSignedRightsEvidence,
  validateSignedServiceIntegrationReport,
  validateSignedServiceReceiptArtifact,
  validateServiceDeploymentArtifact,
};
