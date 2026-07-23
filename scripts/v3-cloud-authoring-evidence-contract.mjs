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
  readLimitedFile,
  readLimitedJson,
  readPublicKey,
  requireHash,
  requireIdentity,
  requireString,
  resolveJsonPointer,
  validateArtifactDescriptor,
} from './v3-cloud-authoring-trust-contract.mjs';

const CLOSED_BUNDLE_SCHEMA_VERSION = 'mcat-v3-closed-sanitized-review-bundle-4';
const CLOSED_BUNDLE_SCANNER_ID = 'V3_CLOSED_REVIEW_BUNDLE_SCAN_V4';
const CANDIDATE_MANIFEST_SCHEMA_VERSION = 'mcat-v3-candidate-artifact-manifest-3';
const CANDIDATE_VALIDATOR_EXECUTION_REPORT_SCHEMA_VERSION =
  'mcat-v3-signed-candidate-validator-execution-report-1';
const GATE_REPORT_SCHEMA_VERSION = 'mcat-v3-signed-gate-evidence-report-2';
const SAFE_PROJECTION_REPORT_SCHEMA_VERSION = 'mcat-v3-safe-projection-report-3';
const OPAQUE_SERVICE_ATTESTATION_SCHEMA_VERSION =
  'mcat-v3-signed-opaque-service-deployment-attestation-4';
const SERVICE_DEPLOYMENT_MANIFEST_SCHEMA_VERSION = 'mcat-v3-opaque-service-deployment-manifest-3';
const SERVICE_RECEIPT_SCHEMA_VERSION = 'mcat-v3-service-action-transition-receipt-3';
const SERVICE_RECEIPT_MANIFEST_SCHEMA_VERSION = 'mcat-v3-service-receipt-manifest-3';
const SERVICE_INTEGRATION_REPORT_SCHEMA_VERSION = 'mcat-v3-signed-service-integration-report-2';
const ACCESSIBILITY_EXECUTION_REPORT_SCHEMA_VERSION =
  'mcat-v3-signed-accessibility-execution-report-4';
const NOVICE_UX_REPORT_SCHEMA_VERSION = 'mcat-v3-signed-novice-ux-walkthrough-report-1';
const RIGHTS_REPORT_SCHEMA_VERSION = 'mcat-v3-signed-rights-review-report-1';
const SOURCE_OUTPUT_SIMILARITY_SCHEMA_VERSION = 'mcat-v3-signed-source-output-similarity-report-1';
const DOMAIN_REPORT_SCHEMA_VERSION = 'mcat-v3-signed-domain-review-report-1';
const CUMULATIVE_CORPUS_SCHEMA_VERSION = 'mcat-v3-signed-cumulative-corpus-manifest-1';
const WAVE_SIMILARITY_REPORT_SCHEMA_VERSION = 'mcat-v3-signed-wave-similarity-report-2';

const BUNDLE_FILES = Object.freeze({
  ACCESSIBILITY_ONLY: Object.freeze([
    'accessibility-harness-config.json',
    'bundle-manifest.json',
    'learner-experience.json',
  ]),
  BLIND_SOLVE: Object.freeze([
    'blind-client-runtime.json',
    'bundle-manifest.json',
    'learner-experience.json',
  ]),
  NOVICE_WALKTHROUGH: Object.freeze([
    'bundle-manifest.json',
    'learner-experience.json',
    'novice-walkthrough-config.json',
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
  'FIGURE_TITLE_DESCRIPTION',
  'FOCUS_ORDER',
  'KEYBOARD_ONLY',
  'LEARNER_REVIEW_ARTIFACT_SEPARATION',
  'MEDIA_TRANSCRIPTS_CAPTIONS',
  'NONVISUAL_ALTERNATIVES',
  'NO_COLOR_ONLY_PROGRESS',
  'PRIMARY_ACTION_NO_WIDE_SCROLL',
  'REDUCED_MOTION',
  'REFLOW_320PX',
  'REFLOW_375PX',
  'SEMANTICS',
  'TOUCH_TARGETS_44PX',
  'ZOOM_200_PERCENT',
]);

const REQUIRED_NOVICE_UX_CHECK_IDS = Object.freeze([
  'DESKTOP_AND_375PX_BROWSER_EVIDENCE',
  'FOCUS_NOW_UNDERSTOOD',
  'NO_COMPETING_OR_STACKED_UI',
  'ONE_PRIMARY_OBJECTIVE_AND_ACTION',
  'WHAT_CHANGED_UNDERSTOOD',
  'WHAT_TO_DO_NEXT_UNDERSTOOD',
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

const LEARNER_FORBIDDEN_FIELD_NAMES = new Set([
  ...FORBIDDEN_FIELD_NAMES,
  'assistance_level',
  'checkpoint_jump',
  'checkpoint_jump_control',
  'definition_version',
  'event',
  'event_id',
  'event_log',
  'event_types',
  'events',
  'exposure',
  'exposure_count',
  'exposure_id',
  'exposure_telemetry',
  'gate',
  'gate_status',
  'governance',
  'governance_prose',
  'policy_sha256',
  'policy_hash',
  'registry_sha256',
  'registry_hash',
  'review_controls',
  'reviewer_controls',
  'run',
  'run_id',
  'runid',
  'run_version',
  'runversion',
  'schema_id',
  'schemaid',
  'schema_version',
  'schemaversion',
  'telemetry',
  'view_schema_id',
]);
const LEARNER_FORBIDDEN_STRING_PATTERNS = Object.freeze([
  /\b[a-f0-9]{64}\b/i,
  /\bA[012]\b/i,
  /\b(?:jump|skip)\s+(?:to\s+)?checkpoint\b/i,
  /\bgovernance\b/i,
  /\b(?:registry|policy)\s+(?:hash|sha-?256)\b/i,
  /\breviewer control\b/i,
  /\b(?:run|schema)\s+id\b/i,
  /\bsimulation warning\b/i,
]);
const NORMALIZED_LEARNER_FORBIDDEN_FIELD_NAMES = new Set(
  [...LEARNER_FORBIDDEN_FIELD_NAMES].map((key) => key.replaceAll(/[^a-z0-9]/g, '')),
);

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

function assertNoLearnerControlPlaneLeakage(value, path = '$') {
  if (typeof value === 'string') {
    for (const pattern of LEARNER_FORBIDDEN_STRING_PATTERNS) {
      assert.equal(pattern.test(value), false, `${path} contains learner-facing control prose`);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoLearnerControlPlaneLeakage(item, `${path}[${index}]`));
    return;
  }
  if (value === null || typeof value !== 'object') return;
  for (const [key, item] of Object.entries(value)) {
    const normalizedKey = key.toLowerCase().replaceAll(/[^a-z0-9]/g, '');
    assert(
      !NORMALIZED_LEARNER_FORBIDDEN_FIELD_NAMES.has(normalizedKey) &&
        !normalizedKey.endsWith('hash') &&
        !normalizedKey.endsWith('sha256'),
      `${path}.${key} is forbidden in learner-facing payloads`,
    );
    assertNoLearnerControlPlaneLeakage(item, `${path}.${key}`);
  }
}

function assertIdentityEqual(actual, expected, label) {
  requireIdentity(actual, label);
  assert.deepEqual(actual, expected, `${label} does not match assigned identity`);
}

function createClosedReviewBundleManifest({
  bundleKind,
  canonicalWireContract,
  compilerBuild,
  learnerExperienceContract,
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
    learner_experience_schema_id: learnerExperienceContract.schema_id,
    learner_experience_schema_sha256: learnerExperienceContract.schema_sha256,
    learner_payload_files: ['learner-experience.json'],
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
    supported_action_kinds: [...canonicalWireContract.transition_profile.action_kinds],
    supported_representation_kinds: [...learnerViewContract.representation_kinds],
    transition_profile_id: canonicalWireContract.transition_profile.profile_id,
    wire_schema_id: canonicalWireContract.schema_id,
    wire_schema_sha256: canonicalWireContract.schema_sha256,
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
      'learner_experience_schema_id',
      'learner_experience_schema_sha256',
      'learner_payload_files',
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
      'wire_schema_id',
      'wire_schema_sha256',
    ],
    'bundle manifest',
  );
  const canonical = createClosedReviewBundleManifest(expected);
  assert.deepEqual(value, canonical, 'Bundle manifest does not match signed integration pins');
}

function validateCollapsedDisclosure(value, label) {
  if (value === null) return;
  assertExactKeys(value, ['collapsed', 'label'], label);
  assert.equal(value.collapsed, true, `${label} must be collapsed by default`);
  requireString(value.label, `${label}.label`);
}

function validateLearnerQuestionGroup(group, expectedStage, label) {
  assertExactKeys(
    group,
    [
      'activity_ref',
      'consequential',
      'counts_as_instructional_exit',
      'family_ref',
      'feedback_policy',
      'low_stakes',
      'question_count',
    ],
    label,
  );
  requireString(group.activity_ref, `${label}.activity_ref`);
  requireString(group.family_ref, `${label}.family_ref`);
  assert.equal(group.question_count, 1, `${label} must contain exactly one question`);
  if (expectedStage === 'ENTRY_CHECK') {
    assert.equal(group.low_stakes, true);
    assert.equal(group.consequential, false);
    assert.equal(group.counts_as_instructional_exit, false);
    assert(
      ['NONE', 'DELAYED_NONCONTAMINATING'].includes(group.feedback_policy),
      `${label} entry feedback could contaminate later families`,
    );
  } else {
    assert.equal(group.low_stakes, false);
    assert.equal(group.consequential, true);
    assert.equal(
      group.counts_as_instructional_exit,
      expectedStage === 'DUAL_EXIT_NEAR' || expectedStage === 'DUAL_EXIT_TRANSFER',
    );
    requireString(group.feedback_policy, `${label}.feedback_policy`);
  }
}

function validateLearnerModel(model, label) {
  assertExactKeys(
    model,
    [
      'accessible_equivalent',
      'description',
      'figure_title',
      'redox_accounting',
      'reduced_motion_fallback',
      'static_fallback',
      'visual_kind',
    ],
    label,
  );
  requireString(model.accessible_equivalent, `${label}.accessible_equivalent`);
  requireString(model.description, `${label}.description`);
  requireString(model.figure_title, `${label}.figure_title`);
  requireString(model.visual_kind, `${label}.visual_kind`);
  assert.equal(model.reduced_motion_fallback, true);
  assert.equal(model.static_fallback, true);
}

function validateRedoxExemplar(model, label) {
  assert.equal(model.visual_kind, 'REDOX_ACCOUNTING_DIAGRAM');
  assertExactKeys(
    model.redox_accounting,
    ['accounting_equation', 'animation_claim', 'highlighted_changes', 'unchanged_tail_treatment'],
    `${label}.redox_accounting`,
  );
  assert.equal(model.redox_accounting.accounting_equation, 'Q + 2 H+ + 2 e- -> QH2');
  assert.equal(
    model.redox_accounting.animation_claim,
    'ACCOUNTING_NOT_ASSERTED_ELEMENTARY_MECHANISM',
  );
  assert.deepEqual(model.redox_accounting.highlighted_changes, [
    'CHANGING_OXYGEN_1_AND_BOND',
    'CHANGING_OXYGEN_2_AND_BOND',
  ]);
  assert.equal(model.redox_accounting.unchanged_tail_treatment, 'GRAYED');
}

function validateLearnerExperience(
  experience,
  { constructBindings, learnerExperienceContract, lessonId },
  learnerExperienceValidator,
) {
  assertNoLearnerControlPlaneLeakage(experience, 'learner-experience.json');
  assert(
    learnerExperienceValidator(experience),
    `Learner experience fails pinned projection schema: ${JSON.stringify(
      learnerExperienceValidator.errors,
    )}`,
  );
  assertExactKeys(experience, ['constructs', 'lesson_title'], 'learner experience');
  requireString(experience.lesson_title, 'learner experience lesson title');
  assert(Array.isArray(experience.constructs) && experience.constructs.length > 0);
  assert.deepEqual(
    experience.constructs.map((construct) => construct.construct_ref),
    constructBindings.map((binding) => binding.construct_ref),
    'Learner constructs do not match the compiler-signed candidate projection',
  );
  const activityIds = new Set();
  for (const [constructIndex, construct] of experience.constructs.entries()) {
    const label = `learner construct[${constructIndex}]`;
    assertExactKeys(construct, ['construct_ref', 'screens'], label);
    requireString(construct.construct_ref, `${label}.construct_ref`);
    assert(Array.isArray(construct.screens));
    const hasEntryCheck = construct.screens[0]?.stage === 'ENTRY_CHECK';
    const instructionalScreens = hasEntryCheck ? construct.screens.slice(1) : construct.screens;
    assert.deepEqual(
      instructionalScreens.map((screen) => screen.stage),
      learnerExperienceContract.required_stage_order,
      `${label} must follow orientation -> model -> worked -> guided -> less help -> solo -> dual exit`,
    );
    const familyRefs = new Set();
    for (const [screenIndex, screen] of construct.screens.entries()) {
      const screenLabel = `${label}.screens[${screenIndex}]`;
      assertExactKeys(
        screen,
        [
          'explanation',
          'fading_ladder_visible',
          'focus_now',
          'glossary',
          'model',
          'optional_details',
          'primary_action',
          'primary_objective',
          'question_group',
          'screen_ref',
          'sidebars',
          'stage',
        ],
        screenLabel,
      );
      requireString(screen.screen_ref, `${screenLabel}.screen_ref`);
      requireString(screen.focus_now, `${screenLabel}.focus_now`);
      assert(
        [...screen.focus_now].length <= learnerExperienceContract.focus_now_max_characters,
        `${screenLabel}.focus_now exceeds the signed short-cue limit`,
      );
      requireString(screen.primary_objective, `${screenLabel}.primary_objective`);
      assertExactKeys(screen.primary_action, ['kind', 'label'], `${screenLabel}.primary_action`);
      requireString(screen.primary_action.kind, `${screenLabel}.primary_action.kind`);
      requireString(screen.primary_action.label, `${screenLabel}.primary_action.label`);
      assert.equal(screen.fading_ladder_visible, false);
      assert.deepEqual(screen.sidebars, [], `${screenLabel} may not have competing sidebars`);
      validateCollapsedDisclosure(screen.optional_details, `${screenLabel}.optional_details`);
      validateCollapsedDisclosure(screen.glossary, `${screenLabel}.glossary`);
      if (screen.explanation !== null) {
        requireString(screen.explanation, `${screenLabel}.explanation`);
      }
      if (screen.model !== null) validateLearnerModel(screen.model, `${screenLabel}.model`);
      if (screen.question_group !== null) {
        validateLearnerQuestionGroup(
          screen.question_group,
          screen.stage,
          `${screenLabel}.question`,
        );
        assert(
          !activityIds.has(screen.question_group.activity_ref),
          `Duplicate learner activity ${screen.question_group.activity_ref}`,
        );
        activityIds.add(screen.question_group.activity_ref);
        familyRefs.add(screen.question_group.family_ref);
      }
    }
    if (hasEntryCheck) {
      assert.equal(construct.screens[0].stage, 'ENTRY_CHECK');
      assert(construct.screens[0].question_group !== null);
    }
    for (const stage of ['ORIENTATION', 'MODEL', 'WORKED_EXAMPLE']) {
      const screen = instructionalScreens.find((candidate) => candidate.stage === stage);
      assert(screen);
      if (stage === 'ORIENTATION') requireString(screen.explanation, `${label} orientation`);
      if (stage === 'MODEL') assert(screen.model, `${label} model screen lacks a model/visual`);
      if (stage === 'WORKED_EXAMPLE') {
        requireString(screen.explanation, `${label} worked explanation`);
        assert(screen.model, `${label} worked example lacks a model/visual`);
      }
    }
    for (const stage of [
      'GUIDED_PRACTICE',
      'LESS_HELP_PRACTICE',
      'SOLO_PRACTICE',
      'DUAL_EXIT_NEAR',
      'DUAL_EXIT_TRANSFER',
    ]) {
      assert(
        instructionalScreens.find((screen) => screen.stage === stage)?.question_group,
        `${label} ${stage} lacks one consequential question group`,
      );
    }
    const exitFamilies = instructionalScreens
      .filter((screen) => screen.stage.startsWith('DUAL_EXIT_'))
      .map((screen) => screen.question_group.family_ref);
    assert.equal(new Set(exitFamilies).size, 2, `${label} dual exits must use distinct families`);
    const practiceFamilies = instructionalScreens
      .filter((screen) => screen.question_group !== null)
      .map((screen) => screen.question_group.family_ref);
    assert.equal(
      new Set(practiceFamilies).size,
      practiceFamilies.length,
      `${label} consequential practice families must remain isolated`,
    );
    if (hasEntryCheck) {
      assert(
        !practiceFamilies.includes(construct.screens[0].question_group.family_ref),
        `${label} entry-check family contaminates consequential practice`,
      );
    }
    assert(familyRefs.size >= 5, `${label} practice families are not sufficiently isolated`);
  }
  if (lessonId === 'V3-LES-329622') {
    const redoxBinding = constructBindings.find((binding) => binding.kc_id === 'V3-KC-271440');
    assert(redoxBinding, 'Redox pilot lacks its compiler-signed construct binding');
    const redoxConstruct = experience.constructs.find(
      (construct) => construct.construct_ref === redoxBinding.construct_ref,
    );
    const redoxModel = redoxConstruct?.screens.find((screen) => screen.stage === 'MODEL')?.model;
    assert(redoxModel, 'Redox pilot lacks its required model');
    validateRedoxExemplar(redoxModel, 'redox model');
  }
  assert(activityIds.size > 0, 'Learner experience has no practice activities');
  return activityIds;
}

function validateBlindClientRuntime(value, expected) {
  assertExactKeys(
    value,
    ['client_mode', 'learner_action_kinds', 'response_fields', 'submit_endpoint_path'],
    'blind client runtime',
  );
  assertNoLearnerControlPlaneLeakage(value, 'blind-client-runtime.json');
  assert.equal(value.client_mode, 'OPAQUE_SCORING_NO_LOCAL_AUTHORITY');
  assert.equal(value.submit_endpoint_path, '/submit');
  assert.deepEqual(
    value.learner_action_kinds,
    expected.canonicalWireContract.transition_profile.action_kinds,
  );
  assert.deepEqual(value.response_fields, ['learner_feedback', 'next_learner_experience']);
  assert.equal(expected.bundleKind, 'BLIND_SOLVE');
}

function validateAccessibilityHarnessConfig(value, expected) {
  assertExactKeys(
    value,
    [
      'browser_execution_required',
      'learner_experience_schema_id',
      'learner_action_schema_id',
      'learner_view_schema_id',
      'minimum_touch_target_px',
      'required_check_ids',
      'required_viewport_widths_px',
      'review_harness_build_id',
      'review_harness_build_sha256',
      'review_harness_build_version',
      'schema_version',
      'transition_profile_id',
      'supported_representation_kinds',
    ],
    'accessibility harness config',
  );
  assert.equal(value.schema_version, 'mcat-v3-accessibility-harness-config-3');
  assert.equal(value.browser_execution_required, true);
  assert.equal(value.learner_experience_schema_id, expected.learnerExperienceContract.schema_id);
  assert.equal(value.learner_action_schema_id, expected.learnerViewContract.action_schema_id);
  assert.equal(value.learner_view_schema_id, expected.learnerViewContract.view_schema_id);
  assert.equal(value.review_harness_build_id, expected.reviewHarnessBuild.build_id);
  assert.equal(value.review_harness_build_sha256, expected.reviewHarnessBuild.artifact_sha256);
  assert.equal(value.review_harness_build_version, expected.reviewHarnessBuild.build_version);
  assert.deepEqual(value.required_check_ids, [...REQUIRED_ACCESSIBILITY_CHECK_IDS]);
  assert.deepEqual(value.required_viewport_widths_px, [320, 375, 1440]);
  assert.equal(value.minimum_touch_target_px, 44);
  assert.equal(
    value.transition_profile_id,
    expected.canonicalWireContract.transition_profile.profile_id,
  );
  assert.deepEqual(
    value.supported_representation_kinds,
    expected.learnerViewContract.representation_kinds,
  );
}

function validateNoviceWalkthroughConfig(value, expected) {
  assertExactKeys(
    value,
    [
      'internal_walkthrough_not_learner_validation',
      'required_questions',
      'required_viewport_widths_px',
      'schema_version',
    ],
    'novice walkthrough config',
  );
  assert.equal(value.schema_version, 'mcat-v3-novice-walkthrough-config-1');
  assert.equal(value.internal_walkthrough_not_learner_validation, true);
  assert.deepEqual(value.required_viewport_widths_px, [375, 1440]);
  assert.deepEqual(value.required_questions, [
    'WHAT_CHANGED',
    'WHAT_DO_I_DO_NEXT',
    'WHAT_SHOULD_I_FOCUS_ON',
  ]);
  assert.equal(expected.bundleKind, 'NOVICE_WALKTHROUGH');
}

async function validateAndHashClosedReviewBundle({
  bundleKind,
  bundlePath,
  canonicalWireContract,
  compilerBuild,
  jobId,
  learnerExperienceContract,
  learnerExperienceValidator,
  learnerViewContract,
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
  assert(Object.hasOwn(BUNDLE_FILES, bundleKind), `Unknown bundle kind ${bundleKind}`);
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
    canonicalWireContract,
    compilerBuild,
    jobId,
    learnerExperienceContract,
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
  const activityIds = validateLearnerExperience(
    documents.get('learner-experience.json'),
    {
      constructBindings: projectionReport.construct_bindings,
      learnerExperienceContract,
      lessonId,
    },
    learnerExperienceValidator,
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
  } else if (bundleKind === 'ACCESSIBILITY_ONLY') {
    validateAccessibilityHarnessConfig(
      documents.get('accessibility-harness-config.json'),
      expected,
    );
  } else {
    validateNoviceWalkthroughConfig(documents.get('novice-walkthrough-config.json'), expected);
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
      'construct_bindings',
      'job_id',
      'learner_experience_schema_id',
      'learner_experience_schema_sha256',
      'learner_view_schema_id',
      'learner_view_schema_sha256',
      'lesson_id',
      'media_digests',
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
      'wire_schema_id',
      'wire_schema_sha256',
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
  assert.equal(value.learner_experience_schema_id, expected.learnerExperienceContract.schema_id);
  assert.equal(
    value.learner_experience_schema_sha256,
    expected.learnerExperienceContract.schema_sha256,
  );
  assert.equal(value.wire_schema_id, expected.canonicalWireContract.schema_id);
  assert.equal(value.wire_schema_sha256, expected.canonicalWireContract.schema_sha256);
  assert.equal(
    value.transition_profile_id,
    expected.canonicalWireContract.transition_profile.profile_id,
  );
  assert.equal(value.compiler_build_id, expected.compilerBuild.build_id);
  assert.equal(value.compiler_build_sha256, expected.compilerBuild.artifact_sha256);
  assert.equal(value.compiler_build_version, expected.compilerBuild.build_version);
  assert.equal(value.compiler_signing_key_fingerprint, expected.compilerSigningKeyFingerprint);
  assert.equal(value.review_harness_build_sha256, expected.reviewHarnessBuild.artifact_sha256);
  assert.equal(value.review_harness_build_version, expected.reviewHarnessBuild.build_version);
  assert.equal(value.status, 'DERIVED_BY_PINNED_COMPILER');
  requireString(value.report_id, 'safe-projection report ID');
  assert(Array.isArray(value.media_digests), 'media_digests must be an array');
  value.media_digests.forEach((digest, index) => {
    assertExactKeys(digest, ['asset_ref', 'sha256'], `media digest[${index}]`);
    requireString(digest.asset_ref, `media digest[${index}].asset_ref`);
    requireHash(digest.sha256, `media digest[${index}].sha256`);
  });
  assert.deepEqual(
    value.media_digests.map((digest) => digest.asset_ref),
    [...new Set(value.media_digests.map((digest) => digest.asset_ref))].sort(compareText),
    'Media digests must be unique and asset-reference sorted',
  );
  assert(Array.isArray(value.construct_bindings), 'construct_bindings must be an array');
  assert.equal(value.construct_bindings.length, expected.orderedKcIds.length);
  for (const [index, binding] of value.construct_bindings.entries()) {
    assertExactKeys(binding, ['construct_ref', 'kc_id'], `construct binding[${index}]`);
    requireString(binding.construct_ref, `construct binding[${index}].construct_ref`);
    assert.equal(binding.kc_id, expected.orderedKcIds[index]);
  }
  assert.equal(
    new Set(value.construct_bindings.map((binding) => binding.construct_ref)).size,
    value.construct_bindings.length,
    'Construct bindings duplicate a learner-safe construct reference',
  );
  assert(Array.isArray(value.outputs) && value.outputs.length === 3);
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
  assert.deepEqual(outputKinds.sort(compareText), [
    'ACCESSIBILITY_ONLY',
    'BLIND_SOLVE',
    'NOVICE_WALKTHROUGH',
  ]);
}

async function validateSafeProjectionEvidence({
  candidateFileManifest,
  candidateSha256,
  candidateValidatorExecutionReportSha256,
  canonicalWireContract,
  compilerBuild,
  evidence,
  jobId,
  learnerExperienceContract,
  learnerViewContract,
  lessonId,
  orderedKcIds,
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
    canonicalWireContract,
    jobId,
    learnerExperienceContract,
    learnerViewContract,
    lessonId,
    orderedKcIds,
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
      'wire_schema_id',
      'wire_schema_sha256',
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
  assert.equal(value.wire_schema_id, expected.canonicalWireContract.schema_id);
  assert.equal(value.wire_schema_sha256, expected.canonicalWireContract.schema_sha256);
  assert.equal(
    value.transition_profile_id,
    expected.canonicalWireContract.transition_profile.profile_id,
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
  canonicalWireContract,
  descriptor,
  jobId,
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
    canonicalWireContract,
    jobId,
    lessonId,
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
      'wire_schema_id',
      'wire_schema_sha256',
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
  assert.equal(value.wire_schema_id, expected.canonicalWireContract.schema_id);
  assert.equal(value.wire_schema_sha256, expected.canonicalWireContract.schema_sha256);
  assert.equal(
    value.transition_profile_id,
    expected.canonicalWireContract.transition_profile.profile_id,
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
  canonicalWireContract,
  deployment,
  descriptor,
  integrationTrustRootPem,
  integratorIdentity,
  jobId,
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
    canonicalWireContract,
    deployment,
    integratorIdentity,
    jobId,
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
      'wire_schema_id',
      'wire_schema_sha256',
    ],
    'service receipt manifest',
  );
  assert.equal(value.schema_version, SERVICE_RECEIPT_MANIFEST_SCHEMA_VERSION);
  assert.equal(value.wire_schema_id, expected.canonicalWireContract.schema_id);
  assert.equal(value.wire_schema_sha256, expected.canonicalWireContract.schema_sha256);
  assert.equal(
    value.transition_profile_id,
    expected.canonicalWireContract.transition_profile.profile_id,
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
      [
        'canonical_receipt_sha256',
        'receipt_path',
        'receipt_sha256',
        'sequence',
        'signature_path',
        'signature_sha256',
      ],
      label,
    );
    assert.equal(entry.sequence, index + 1, `${label}.sequence must be contiguous`);
    requireString(entry.receipt_path, `${label}.receipt_path`);
    requireHash(entry.receipt_sha256, `${label}.receipt_sha256`);
    requireHash(entry.canonical_receipt_sha256, `${label}.canonical_receipt_sha256`);
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
  canonicalWireContract,
  canonicalWireValidator,
  deployment,
  descriptor,
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
    canonicalWireContract,
    deployment,
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
      transitionProfile: canonicalWireContract.transition_profile,
    });
    assert(
      canonicalWireValidator(signed.value),
      `Service receipt fails canonical wire schema: ${JSON.stringify(
        canonicalWireValidator.errors,
      )}`,
    );
    assert.equal(
      hashCanonicalJson(signed.value),
      entry.canonical_receipt_sha256,
      'Service receipt canonical-byte hash is stale',
    );
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
      canonicalWireContract.transition_profile,
    ),
    session_id: manifest.session_id,
  };
}

function validateServiceIntegrationReportDocument(value, expected) {
  assertExactKeys(
    value,
    [
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
      'wire_schema_id',
      'wire_schema_sha256',
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
  assert.equal(value.wire_schema_id, expected.canonicalWireContract.schema_id);
  assert.equal(value.wire_schema_sha256, expected.canonicalWireContract.schema_sha256);
  assert.equal(
    value.transition_profile_id,
    expected.canonicalWireContract.transition_profile.profile_id,
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
    expected.canonicalWireContract.transition_profile.technical_service_check_ids,
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
  canonicalWireContract,
  deployment,
  descriptor,
  jobId,
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
    canonicalWireContract,
    deployment,
    jobId,
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

async function validateLearnerRegressionArtifact({ descriptor, repositoryRoot }) {
  const requiredFiles = [
    'desktop-1440.png',
    'learner-regression-trace.json',
    'mobile-320.png',
    'mobile-375.png',
  ];
  const scan = await validateArtifactDescriptor(descriptor, {
    label: 'learner-only mobile/desktop regression artifact',
    limits: ARTIFACT_LIMITS.browser_evidence,
    repositoryRoot,
    requiredFiles,
  });
  const [desktop, mobile320, mobile375, traceFile] = await Promise.all([
    readLimitedFile(
      join(scan.real_path, 'desktop-1440.png'),
      'learner-only desktop regression screenshot',
      ARTIFACT_LIMITS.browser_evidence,
    ),
    readLimitedFile(
      join(scan.real_path, 'mobile-320.png'),
      'learner-only 320px regression screenshot',
      ARTIFACT_LIMITS.browser_evidence,
    ),
    readLimitedFile(
      join(scan.real_path, 'mobile-375.png'),
      'learner-only 375px regression screenshot',
      ARTIFACT_LIMITS.browser_evidence,
    ),
    readLimitedJson(
      join(scan.real_path, 'learner-regression-trace.json'),
      'learner-only mobile/desktop regression trace',
      ARTIFACT_LIMITS.browser_evidence,
    ),
  ]);
  const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  for (const screenshot of [desktop, mobile320, mobile375]) {
    assert(screenshot.subarray(0, pngSignature.length).equals(pngSignature));
  }
  const trace = traceFile.value;
  assertExactKeys(
    trace,
    ['learner_only_capture', 'reviewer_controls_rendered', 'schema_version', 'viewports'],
    'learner regression trace',
  );
  assert.equal(trace.schema_version, 'mcat-v3-learner-mobile-desktop-regression-trace-1');
  assert.equal(trace.learner_only_capture, true);
  assert.equal(trace.reviewer_controls_rendered, false);
  assert(Array.isArray(trace.viewports) && trace.viewports.length === 3);
  assert.deepEqual(
    trace.viewports.map((viewport) => viewport.width_px),
    [320, 375, 1440],
  );
  for (const [index, viewport] of trace.viewports.entries()) {
    const label = `learner regression viewport[${index}]`;
    assertExactKeys(
      viewport,
      [
        'color_only_progress',
        'figure_title_description_pass',
        'focus_order_pass',
        'height_px',
        'mandatory_wide_scroll',
        'minimum_touch_target_px',
        'primary_action_visible',
        'primary_visual_visible',
        'width_px',
      ],
      label,
    );
    assert(Number.isInteger(viewport.height_px) && viewport.height_px > 0);
    assert.equal(viewport.mandatory_wide_scroll, false, `${label} requires wide scroll`);
    assert.equal(viewport.minimum_touch_target_px >= 44, true, `${label} has small touch targets`);
    assert.equal(viewport.focus_order_pass, true, `${label} has invalid focus order`);
    assert.equal(
      viewport.figure_title_description_pass,
      true,
      `${label} lacks a figure title/description`,
    );
    assert.equal(viewport.color_only_progress, false, `${label} uses color-only progress`);
    assert.equal(viewport.primary_action_visible, true, `${label} hides the primary action`);
    assert.equal(viewport.primary_visual_visible, true, `${label} hides the primary visual`);
  }
  return scan;
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
      'internal_dto_artifacts_are_not_canonical_wire',
      'job_id',
      'learner_action_schema_id',
      'learner_experience_schema_id',
      'learner_regression_artifact_sha256',
      'learner_view_schema_id',
      'lesson_id',
      'media_digests',
      'reviewer_identity',
      'reviewer_slot_id',
      'reviewer_evidence_separate_from_learner_artifact',
      'safe_client_sha256',
      'schema_version',
      'source_plan_sha256',
      'status',
      'supported_action_kinds',
      'supported_representation_kinds',
      'transition_profile_id',
      'wave_id',
      'wire_schema_id',
      'wire_schema_sha256',
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
  assert.equal(value.learner_experience_schema_id, expected.learnerExperienceContract.schema_id);
  assert.equal(
    value.learner_regression_artifact_sha256,
    expected.learnerRegression.artifact_sha256,
  );
  assert.equal(value.wire_schema_id, expected.canonicalWireContract.schema_id);
  assert.equal(value.wire_schema_sha256, expected.canonicalWireContract.schema_sha256);
  assert.equal(value.internal_dto_artifacts_are_not_canonical_wire, true);
  assert.equal(value.reviewer_evidence_separate_from_learner_artifact, true);
  assert.equal(
    value.transition_profile_id,
    expected.canonicalWireContract.transition_profile.profile_id,
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
    expected.canonicalWireContract.transition_profile.action_kinds,
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
  canonicalWireContract,
  descriptor,
  harnessBuild,
  jobId,
  learnerExperienceContract,
  learnerRegressionArtifactDescriptor,
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
  const [browserEvidence, learnerRegression] = await Promise.all([
    validateBrowserAccessibilityEvidenceArtifact({
      descriptor: browserEvidenceDescriptor,
      repositoryRoot,
    }),
    validateLearnerRegressionArtifact({
      descriptor: learnerRegressionArtifactDescriptor,
      repositoryRoot,
    }),
  ]);
  assert.notEqual(
    browserEvidence.real_path,
    learnerRegression.real_path,
    `${jobId} learner regression and reviewer evidence must be separate artifacts`,
  );
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
    canonicalWireContract,
    harnessBuild,
    jobId,
    learnerExperienceContract,
    learnerRegression,
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

async function validateNoviceWalkthroughArtifact({ descriptor, repositoryRoot }) {
  const requiredFiles = ['desktop-1440.png', 'mobile-375.png', 'walkthrough-trace.json'];
  const scan = await validateArtifactDescriptor(descriptor, {
    label: 'novice walkthrough browser artifact',
    limits: ARTIFACT_LIMITS.browser_evidence,
    repositoryRoot,
    requiredFiles,
  });
  const [desktop, mobile, traceFile] = await Promise.all([
    readLimitedFile(
      join(scan.real_path, 'desktop-1440.png'),
      'novice desktop screenshot',
      ARTIFACT_LIMITS.browser_evidence,
    ),
    readLimitedFile(
      join(scan.real_path, 'mobile-375.png'),
      'novice mobile screenshot',
      ARTIFACT_LIMITS.browser_evidence,
    ),
    readLimitedJson(
      join(scan.real_path, 'walkthrough-trace.json'),
      'novice walkthrough trace',
      ARTIFACT_LIMITS.browser_evidence,
    ),
  ]);
  const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  assert(desktop.subarray(0, pngSignature.length).equals(pngSignature));
  assert(mobile.subarray(0, pngSignature.length).equals(pngSignature));
  const trace = traceFile.value;
  assertExactKeys(
    trace,
    ['learner_questions', 'schema_version', 'screen_audit', 'viewports'],
    'novice walkthrough trace',
  );
  assert.equal(trace.schema_version, 'mcat-v3-novice-walkthrough-browser-trace-1');
  assert.deepEqual(trace.learner_questions, [
    { answered_without_reviewer_help: true, question_id: 'WHAT_CHANGED' },
    { answered_without_reviewer_help: true, question_id: 'WHAT_DO_I_DO_NEXT' },
    { answered_without_reviewer_help: true, question_id: 'WHAT_SHOULD_I_FOCUS_ON' },
  ]);
  assert.deepEqual(trace.screen_audit, {
    competing_sidebars_present: false,
    focus_now_cue_present: true,
    multiple_question_groups_present: false,
    one_primary_action: true,
    one_primary_objective: true,
    optional_details_collapsed: true,
    stacked_fading_ladder_present: false,
  });
  assert(Array.isArray(trace.viewports) && trace.viewports.length === 2);
  assert.deepEqual(
    trace.viewports.map((viewport) => viewport.width_px),
    [375, 1440],
  );
  for (const [index, viewport] of trace.viewports.entries()) {
    assertExactKeys(
      viewport,
      [
        'color_only_progress',
        'figure_title_description_pass',
        'focus_order_pass',
        'height_px',
        'mandatory_wide_scroll',
        'minimum_touch_target_px',
        'primary_action_visible',
        'primary_visual_visible',
        'width_px',
      ],
      `novice viewport[${index}]`,
    );
    assert(Number.isInteger(viewport.height_px) && viewport.height_px > 0);
    assert.equal(viewport.mandatory_wide_scroll, false);
    assert.equal(viewport.primary_action_visible, true);
    assert.equal(viewport.primary_visual_visible, true);
    assert.equal(viewport.focus_order_pass, true);
    assert.equal(viewport.figure_title_description_pass, true);
    assert.equal(viewport.color_only_progress, false);
    assert(viewport.minimum_touch_target_px >= 44);
  }
  return { ...scan, trace };
}

function validateNoviceUxReportDocument(value, expected) {
  assertExactKeys(
    value,
    [
      'candidate_sha256',
      'checks',
      'internal_walkthrough_not_learner_validation',
      'job_id',
      'lesson_id',
      'report_author_identity',
      'report_id',
      'reviewer_slot_id',
      'safe_client_sha256',
      'schema_version',
      'signing_key_fingerprint',
      'source_plan_sha256',
      'status',
      'walkthrough_artifact_sha256',
      'wave_id',
    ],
    'novice UX walkthrough report',
  );
  assert.equal(value.schema_version, NOVICE_UX_REPORT_SCHEMA_VERSION);
  for (const key of [
    'candidate_sha256',
    'job_id',
    'lesson_id',
    'reviewer_slot_id',
    'safe_client_sha256',
    'source_plan_sha256',
    'walkthrough_artifact_sha256',
    'wave_id',
  ]) {
    assert.equal(value[key], expected[key]);
  }
  assert.deepEqual(value.report_author_identity, expected.report_author_identity);
  assert.equal(value.signing_key_fingerprint, expected.signing_key_fingerprint);
  assert.equal(value.internal_walkthrough_not_learner_validation, true);
  assert.equal(value.status, 'APPROVED_INTERNAL_USABILITY_WALKTHROUGH');
  requireString(value.report_id, 'novice UX report ID');
  assert(Array.isArray(value.checks));
  value.checks.forEach((check, index) => {
    assertExactKeys(check, ['check_id', 'status'], `novice UX check[${index}]`);
    assert.equal(check.status, 'PASS');
  });
  assert.deepEqual(
    value.checks.map((check) => check.check_id),
    [...REQUIRED_NOVICE_UX_CHECK_IDS],
  );
}

async function validateSignedNoviceUxReport({
  assignment,
  candidateSha256,
  credential,
  descriptor,
  jobId,
  lessonId,
  repositoryRoot,
  safeClientSha256,
  sourcePlanSha256,
  walkthroughArtifactDescriptor,
  waveId,
}) {
  const walkthroughArtifact = await validateNoviceWalkthroughArtifact({
    descriptor: walkthroughArtifactDescriptor,
    repositoryRoot,
  });
  const signed = await readAssignedSignedReport({
    assignment,
    credential,
    descriptor,
    label: `${jobId} novice learner-UX walkthrough report`,
    repositoryRoot,
  });
  validateNoviceUxReportDocument(signed.value, {
    candidate_sha256: candidateSha256,
    job_id: jobId,
    lesson_id: lessonId,
    report_author_identity: {
      person_id: assignment.assignee_person_id,
      run_id: assignment.assignee_run_id,
    },
    reviewer_slot_id: assignment.slot_id,
    safe_client_sha256: safeClientSha256,
    signing_key_fingerprint: credential.public_key.fingerprint,
    source_plan_sha256: sourcePlanSha256,
    walkthrough_artifact_sha256: walkthroughArtifact.artifact_sha256,
    wave_id: waveId,
  });
  return { report: signed.value, walkthrough_artifact: walkthroughArtifact };
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
  NOVICE_UX_REPORT_SCHEMA_VERSION,
  OPAQUE_SERVICE_ATTESTATION_SCHEMA_VERSION,
  REQUIRED_ACCESSIBILITY_CHECK_IDS,
  REQUIRED_BLIND_PATH_IDS,
  REQUIRED_GATE_CHECK_IDS,
  REQUIRED_NOVICE_UX_CHECK_IDS,
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
  validateLearnerExperience,
  validateAndHashCandidateArtifact,
  validateAndHashClosedReviewBundle,
  validateMultiSignedWaveSimilarityReport,
  validateSafeProjectionEvidence,
  validateSignedAccessibilityExecutionReport,
  validateSignedCandidateValidatorExecution,
  validateSignedCumulativeCorpusManifest,
  validateSignedDomainReport,
  validateSignedGateReport,
  validateSignedNoviceUxReport,
  validateSignedOpaqueServiceAttestation,
  validateSignedRightsEvidence,
  validateSignedServiceIntegrationReport,
  validateSignedServiceReceiptArtifact,
  validateServiceDeploymentArtifact,
};
