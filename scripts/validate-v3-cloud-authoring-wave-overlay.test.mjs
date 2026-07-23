import assert from 'node:assert/strict';
import { generateKeyPairSync, sign as createSignature } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';

import { hashText } from './generate-v3-cloud-authoring-plan.mjs';
import {
  CLOSED_BUNDLE_SCANNER_ID,
  REQUIRED_ACCESSIBILITY_CHECK_IDS,
  REQUIRED_GATE_CHECK_IDS,
  createClosedReviewBundleManifest,
  validateSignedCumulativeCorpusManifest,
} from './v3-cloud-authoring-evidence-contract.mjs';
import {
  ARTIFACT_LIMITS,
  directoryHash,
  hashArtifactDirectory,
  hashBytes,
  publicKeyFingerprint,
} from './v3-cloud-authoring-trust-contract.mjs';
import {
  computeSourceLedgerSha256,
  createWaveAssignmentOverlayTemplate,
  validateWaveAssignmentOverlay,
} from './validate-v3-cloud-authoring-wave-overlay.mjs';

const planPath = 'curriculum/v3/v3-cloud-authoring-jobs.json';
const checkedTemplatePath =
  'curriculum/v3/v3-cloud-authoring-wave-assignment-overlay.template.json';
const planText = await readFile(planPath, 'utf8');
const plan = JSON.parse(planText);
const sourcePlanSha256 = hashText(planText);
const waveId = 'V3-AUTH-W00-PILOT-PORT';
const wave = plan.waves.find((candidate) => candidate.wave_id === waveId);
const jobById = new Map(plan.jobs.map((job) => [job.job_id, job]));

const FOUNDATION_COMMIT = 'FIXTURE_ONLY_HARDENED_FOUNDATION_COMMIT';
const CANDIDATE_SCHEMA_ID = 'FIXTURE_ONLY_LESSON_DEFINITION_SCHEMA_V1';
const LEARNER_DTO_SCHEMA_ID = 'FIXTURE_ONLY_LEARNER_DTO_SCHEMA_V1';
const RUNTIME_CONTRACT_VERSION = 'FIXTURE_ONLY_RUNTIME_CONTRACT_V1';
const REPRESENTATION_KINDS = [
  'ANIMATION',
  'AUDIO',
  'CHART',
  'DIAGRAM',
  'EQUATION',
  'IMAGE',
  'SIMULATION',
  'TABLE',
  'TEXT',
  'VIDEO',
];
const ACTION_KINDS = [
  'CONTINUE',
  'INTERRUPT',
  'REQUEST_HELP',
  'RESUME',
  'RETRY',
  'REVEAL',
  'SUBMIT_RESPONSE',
];
const SIGNING_ROLES = new Set([
  'ACCESSIBILITY_TECHNICAL_AUDITOR',
  'CARS_PASSAGE_SUBJECT_FACT_CHECKER',
  'CROSS_LESSON_SIMILARITY_AUDITOR',
  'DOMAIN_SCIENTIFIC_FACT_CHECKER',
  'INDEPENDENT_BLIND_SOLVER',
  'INDEPENDENT_CONTENT_PEDAGOGY_AUDITOR',
  'INDEPENDENT_INPUT_OUTPUT_RIGHTS_REVIEWER',
  'RELEASE_HASH_INTEGRATOR',
]);

function clone(value) {
  return structuredClone(value);
}

function createSigningKey() {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const publicKeyPem = publicKey.export({ format: 'pem', type: 'spki' });
  return {
    fingerprint: publicKeyFingerprint(publicKeyPem),
    privateKey,
    publicKeyPem,
  };
}

async function writeBytes(path, bytes) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, bytes);
  return hashBytes(bytes);
}

async function writeJson(path, value) {
  const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
  return { bytes, sha256: await writeBytes(path, bytes) };
}

async function writeSignature(path, bytes, privateKey) {
  const signatureText = createSignature(null, bytes, privateKey).toString('base64');
  const signatureBytes = Buffer.from(signatureText);
  return {
    bytes: signatureBytes,
    sha256: await writeBytes(path, signatureBytes),
  };
}

async function writeSignedJson({
  document,
  documentPath,
  key,
  repositoryRoot,
  signaturePath = `${documentPath}.sig`,
}) {
  const written = await writeJson(join(repositoryRoot, documentPath), document);
  const signature = await writeSignature(
    join(repositoryRoot, signaturePath),
    written.bytes,
    key.privateKey,
  );
  return {
    report_path: documentPath,
    report_sha256: written.sha256,
    report_signature_path: signaturePath,
    report_signature_sha256: signature.sha256,
    signer_key_fingerprint: key.fingerprint,
  };
}

async function artifactDescriptor(repositoryRoot, artifactPath, limits) {
  const scan = await hashArtifactDirectory({
    artifactPath,
    label: `fixture artifact ${artifactPath}`,
    limits,
    repositoryRoot,
  });
  return {
    artifact_path: artifactPath,
    artifact_sha256: scan.artifact_sha256,
    file_manifest: scan.file_manifest,
  };
}

function learnerDtoSchema() {
  return {
    $schema: 'http://json-schema.org/draft-07/schema#',
    additionalProperties: false,
    properties: {
      actions: {
        items: {
          additionalProperties: false,
          properties: {
            action_id: { minLength: 1, type: 'string' },
            kind: { enum: ACTION_KINDS },
          },
          required: ['action_id', 'kind'],
          type: 'object',
        },
        minItems: 1,
        type: 'array',
      },
      activities: {
        items: {
          additionalProperties: false,
          properties: {
            activity_id: { minLength: 1, type: 'string' },
            options: {
              items: { type: 'string' },
              minItems: 2,
              type: 'array',
            },
            prompt: { minLength: 1, type: 'string' },
            response_mode: {
              enum: ['FREE_TEXT', 'MULTI_SELECT', 'NUMERIC', 'SINGLE_SELECT'],
            },
          },
          required: ['activity_id', 'options', 'prompt', 'response_mode'],
          type: 'object',
        },
        minItems: 1,
        type: 'array',
      },
      activity_graph: {
        additionalProperties: false,
        properties: {
          edges: {
            items: {
              additionalProperties: false,
              properties: {
                event: { type: 'string' },
                from: { type: 'string' },
                to: { type: 'string' },
              },
              required: ['event', 'from', 'to'],
              type: 'object',
            },
            minItems: 1,
            type: 'array',
          },
          initial_state: { type: 'string' },
          states: {
            items: { type: 'string' },
            minItems: 2,
            type: 'array',
          },
        },
        required: ['edges', 'initial_state', 'states'],
        type: 'object',
      },
      lesson_id: { minLength: 1, type: 'string' },
      representations: {
        items: {
          additionalProperties: false,
          properties: {
            alternative_text: { type: 'string' },
            asset_ids: {
              items: { type: 'string' },
              type: 'array',
            },
            data_text: { type: 'string' },
            kind: { enum: REPRESENTATION_KINDS },
            representation_id: { minLength: 1, type: 'string' },
          },
          required: ['alternative_text', 'asset_ids', 'data_text', 'kind', 'representation_id'],
          type: 'object',
        },
        minItems: 1,
        type: 'array',
      },
      schema_version: { const: LEARNER_DTO_SCHEMA_ID },
    },
    required: [
      'actions',
      'activities',
      'activity_graph',
      'lesson_id',
      'representations',
      'schema_version',
    ],
    type: 'object',
  };
}

function candidateSchema() {
  const dto = clone(learnerDtoSchema());
  delete dto.$schema;
  return {
    $schema: 'http://json-schema.org/draft-07/schema#',
    additionalProperties: false,
    properties: {
      answer_keys: {
        additionalProperties: { type: 'string' },
        minProperties: 1,
        type: 'object',
      },
      learner_safe_dto: dto,
      lesson_id: { minLength: 1, type: 'string' },
      rationales: {
        additionalProperties: { type: 'string' },
        minProperties: 1,
        type: 'object',
      },
      schema_version: { const: CANDIDATE_SCHEMA_ID },
    },
    required: ['answer_keys', 'learner_safe_dto', 'lesson_id', 'rationales', 'schema_version'],
    type: 'object',
  };
}

function learnerDto(job) {
  return {
    actions: ACTION_KINDS.map((kind, index) => ({
      action_id: `${job.lesson_id}-ACTION-${index}`,
      kind,
    })),
    activities: [
      {
        activity_id: `${job.lesson_id}-ACTIVITY`,
        options: ['Option A', 'Option B'],
        prompt: 'Choose the learner response supported by the evidence.',
        response_mode: 'SINGLE_SELECT',
      },
    ],
    activity_graph: {
      edges: [
        { event: 'SUBMIT', from: 'PROMPT', to: 'FEEDBACK' },
        { event: 'CONTINUE', from: 'FEEDBACK', to: 'COMPLETE' },
      ],
      initial_state: 'PROMPT',
      states: ['PROMPT', 'FEEDBACK', 'COMPLETE'],
    },
    lesson_id: job.lesson_id,
    representations: REPRESENTATION_KINDS.map((kind, index) => ({
      alternative_text: `${kind} nonvisual alternative`,
      asset_ids: kind === 'VIDEO' ? [`${job.lesson_id}-VIDEO`] : [],
      data_text: `${kind} structured learner-safe data`,
      kind,
      representation_id: `${job.lesson_id}-REP-${index}`,
    })),
    schema_version: LEARNER_DTO_SCHEMA_ID,
  };
}

function learnerEnvelope(job) {
  return {
    dto_schema_id: LEARNER_DTO_SCHEMA_ID,
    lesson_dto: learnerDto(job),
    media_digests: [
      {
        asset_id: `${job.lesson_id}-VIDEO`,
        captions_sha256: hashText(`captions-${job.job_id}`),
        media_kind: 'VIDEO',
        sha256: hashText(`video-${job.job_id}`),
        transcript_sha256: hashText(`transcript-${job.job_id}`),
      },
    ],
    schema_version: 'mcat-v3-learner-safe-envelope-1',
  };
}

async function writeBuildArtifact({
  buildId,
  buildKind,
  buildVersion = 'FIXTURE-1.0.0',
  key = null,
  path,
  repositoryRoot,
}) {
  await writeJson(join(repositoryRoot, path, 'build-manifest.json'), {
    build_id: buildId,
    build_kind: buildKind,
    build_version: buildVersion,
    foundation_commit_sha: FOUNDATION_COMMIT,
    schema_version: 'mcat-v3-pinned-build-manifest-1',
  });
  if (key) {
    await writeBytes(
      join(repositoryRoot, path, 'report-signing-public-key.pem'),
      Buffer.from(key.publicKeyPem),
    );
  }
  return artifactDescriptor(repositoryRoot, path, ARTIFACT_LIMITS.build);
}

async function materializeIntegrationTrust(overlay, repositoryRoot) {
  const integrationRoot = createSigningKey();
  const compilerKey = createSigningKey();
  const harnessKey = createSigningKey();
  const candidateSchemaPath = 'integration/candidate-schema.json';
  const learnerSchemaPath = 'integration/learner-dto-schema.json';
  const candidateSchemaWritten = await writeJson(
    join(repositoryRoot, candidateSchemaPath),
    candidateSchema(),
  );
  const learnerSchemaWritten = await writeJson(
    join(repositoryRoot, learnerSchemaPath),
    learnerDtoSchema(),
  );
  const candidateValidatorBuild = await writeBuildArtifact({
    buildId: 'FIXTURE-CANDIDATE-VALIDATOR-BUILD',
    buildKind: 'CANDIDATE_VALIDATOR',
    path: 'integration/candidate-validator',
    repositoryRoot,
  });
  const compilerBuild = await writeBuildArtifact({
    buildId: 'FIXTURE-SAFE-PROJECTION-COMPILER-BUILD',
    buildKind: 'SAFE_PROJECTION_COMPILER',
    key: compilerKey,
    path: 'integration/safe-projection-compiler',
    repositoryRoot,
  });
  const harnessBuild = await writeBuildArtifact({
    buildId: 'FIXTURE-REVIEW-HARNESS-BUILD',
    buildKind: 'REVIEW_HARNESS',
    key: harnessKey,
    path: 'integration/review-harness',
    repositoryRoot,
  });
  const scoringBuild = await writeBuildArtifact({
    buildId: 'FIXTURE-SCORING-SERVICE-BUILD',
    buildKind: 'SCORING_SERVICE',
    path: 'integration/scoring-service',
    repositoryRoot,
  });
  const pinset = {
    builds: {
      review_harness: {
        artifact_sha256: harnessBuild.artifact_sha256,
        build_id: 'FIXTURE-REVIEW-HARNESS-BUILD',
        build_version: 'FIXTURE-1.0.0',
        report_signing_key_fingerprint: harnessKey.fingerprint,
      },
      safe_projection_compiler: {
        artifact_sha256: compilerBuild.artifact_sha256,
        build_id: 'FIXTURE-SAFE-PROJECTION-COMPILER-BUILD',
        build_version: 'FIXTURE-1.0.0',
        report_signing_key_fingerprint: compilerKey.fingerprint,
      },
      scoring_service: {
        artifact_sha256: scoringBuild.artifact_sha256,
        build_id: 'FIXTURE-SCORING-SERVICE-BUILD',
        build_version: 'FIXTURE-1.0.0',
      },
    },
    foundation_commit_sha: FOUNDATION_COMMIT,
    issued_at: '2026-07-23T18:00:00Z',
    learner_contract: {
      action_kinds: ACTION_KINDS,
      dto_schema_id: LEARNER_DTO_SCHEMA_ID,
      dto_schema_sha256: learnerSchemaWritten.sha256,
      representation_kinds: REPRESENTATION_KINDS,
    },
    pinset_id: 'FIXTURE-ONLY-INTEGRATION-PINSET',
    runtime_contract: {
      candidate_definition_path: 'lesson-definition.json',
      candidate_schema_id: CANDIDATE_SCHEMA_ID,
      candidate_schema_sha256: candidateSchemaWritten.sha256,
      candidate_validator_build_id: 'FIXTURE-CANDIDATE-VALIDATOR-BUILD',
      candidate_validator_build_sha256: candidateValidatorBuild.artifact_sha256,
      candidate_validator_build_version: 'FIXTURE-1.0.0',
      runtime_contract_version: RUNTIME_CONTRACT_VERSION,
    },
    schema_version: 'mcat-v3-integration-pinset-1',
    validation_mode: 'FIXTURE_ONLY_NON_PRODUCTION',
  };
  const signedPinset = await writeSignedJson({
    document: pinset,
    documentPath: 'integration/integration-pinset.json',
    key: integrationRoot,
    repositoryRoot,
  });
  const trustRootPath = join(repositoryRoot, 'external-fixture-trust-root.pem');
  await writeBytes(trustRootPath, Buffer.from(integrationRoot.publicKeyPem));
  overlay.integration_readiness.status = 'FIXTURE_ONLY_NON_PRODUCTION';
  overlay.integration_trust = {
    external_trust_root_fingerprint: integrationRoot.fingerprint,
    pinset_path: signedPinset.report_path,
    pinset_sha256: signedPinset.report_sha256,
    pinset_signature_path: signedPinset.report_signature_path,
    pinset_signature_sha256: signedPinset.report_signature_sha256,
    validation_mode: 'FIXTURE_ONLY_NON_PRODUCTION',
  };
  overlay.pinned_integration_artifacts = {
    candidate_schema: {
      path: candidateSchemaPath,
      sha256: candidateSchemaWritten.sha256,
    },
    candidate_validator_build: candidateValidatorBuild,
    learner_dto_schema: {
      path: learnerSchemaPath,
      sha256: learnerSchemaWritten.sha256,
    },
    review_harness_build: harnessBuild,
    safe_projection_compiler_build: compilerBuild,
    scoring_service_build: scoringBuild,
  };
  return {
    compilerKey,
    harnessKey,
    integrationRoot,
    pinset,
    trustRootPath,
  };
}

async function materializeReviewerCredentials(overlay, repositoryRoot, integrationRoot) {
  const keyByIdentity = new Map();
  const credentialByIdentity = new Map();
  const signingAssignments = overlay.assignments.filter((assignment) =>
    SIGNING_ROLES.has(assignment.role),
  );
  for (const assignment of signingAssignments) {
    const identityKey = `${assignment.assignee_person_id}\u0000${assignment.assignee_run_id}`;
    assert(!keyByIdentity.has(identityKey));
    const key = createSigningKey();
    keyByIdentity.set(identityKey, key);
    const base = `credentials/${assignment.assignee_person_id}`;
    const publicKeyPath = `${base}/public-key.pem`;
    const publicKeySha256 = await writeBytes(
      join(repositoryRoot, publicKeyPath),
      Buffer.from(key.publicKeyPem),
    );
    const roles = [assignment.role];
    const signed = await writeSignedJson({
      document: {
        credential_id: `CREDENTIAL-${assignment.assignee_person_id}`,
        person_id: assignment.assignee_person_id,
        public_key_fingerprint: key.fingerprint,
        roles,
        run_id: assignment.assignee_run_id,
        schema_version: 'mcat-v3-reviewer-signing-credential-1',
        source_plan_sha256: sourcePlanSha256,
        status: 'ACTIVE',
        wave_id: waveId,
      },
      documentPath: `${base}/credential.json`,
      key: integrationRoot,
      repositoryRoot,
    });
    const credential = {
      credential_path: signed.report_path,
      credential_sha256: signed.report_sha256,
      credential_signature_path: signed.report_signature_path,
      credential_signature_sha256: signed.report_signature_sha256,
      identity: {
        person_id: assignment.assignee_person_id,
        run_id: assignment.assignee_run_id,
      },
      public_key_fingerprint: key.fingerprint,
      public_key_path: publicKeyPath,
      public_key_sha256: publicKeySha256,
      roles,
    };
    credentialByIdentity.set(identityKey, credential);
  }
  overlay.reviewer_signing_credentials = [...credentialByIdentity.values()];
  return keyByIdentity;
}

function assignmentForSlot(overlay, slotId) {
  const assignment = overlay.assignments.find((candidate) => candidate.slot_id === slotId);
  assert(assignment);
  return assignment;
}

function keyForAssignment(keyByIdentity, assignment) {
  const key = keyByIdentity.get(
    `${assignment.assignee_person_id}\u0000${assignment.assignee_run_id}`,
  );
  assert(key);
  return key;
}

async function materializeGateReport({
  candidateSha256,
  descriptor,
  gateId,
  job,
  keyByIdentity,
  overlay,
  repositoryRoot,
  reviewedArtifactSha256,
  reviewerSlotId,
}) {
  const assignment = assignmentForSlot(overlay, reviewerSlotId);
  const key = keyForAssignment(keyByIdentity, assignment);
  const signed = await writeSignedJson({
    document: {
      candidate_sha256: candidateSha256,
      checks: REQUIRED_GATE_CHECK_IDS[gateId].map((checkId) => ({
        check_id: checkId,
        status: 'PASS',
      })),
      gate_id: gateId,
      job_id: job.job_id,
      lesson_id: job.lesson_id,
      report_author_identity: {
        person_id: assignment.assignee_person_id,
        run_id: assignment.assignee_run_id,
      },
      report_id: `${job.lesson_id}-${gateId}-REPORT`,
      reviewed_artifact_sha256: reviewedArtifactSha256,
      reviewer_slot_id: reviewerSlotId,
      schema_version: 'mcat-v3-signed-gate-evidence-report-2',
      signing_key_fingerprint: key.fingerprint,
      source_plan_sha256: sourcePlanSha256,
      status: 'APPROVED',
      wave_id: waveId,
    },
    documentPath: `reports/${job.lesson_id}/${gateId}.json`,
    key,
    repositoryRoot,
  });
  descriptor.approved = true;
  descriptor.candidate_sha256 = candidateSha256;
  descriptor.reviewed_artifact_sha256 = reviewedArtifactSha256;
  descriptor.report = signed;
}

async function writeCandidate({ evidence, job, pinset, repositoryRoot }) {
  const artifactPath = `candidates/${job.lesson_id}`;
  const dto = learnerDto(job);
  await writeJson(join(repositoryRoot, artifactPath, 'candidate-manifest.json'), {
    candidate_definition_path: pinset.runtime_contract.candidate_definition_path,
    candidate_schema_id: pinset.runtime_contract.candidate_schema_id,
    candidate_schema_sha256: pinset.runtime_contract.candidate_schema_sha256,
    candidate_validator_build_id: pinset.runtime_contract.candidate_validator_build_id,
    candidate_validator_build_sha256: pinset.runtime_contract.candidate_validator_build_sha256,
    candidate_validator_build_version: pinset.runtime_contract.candidate_validator_build_version,
    contains_key_bearing_server_definition: true,
    job_id: job.job_id,
    lesson_id: job.lesson_id,
    runtime_contract_version: pinset.runtime_contract.runtime_contract_version,
    schema_version: 'mcat-v3-candidate-artifact-manifest-2',
    source_plan_sha256: sourcePlanSha256,
    wave_id: waveId,
  });
  await writeJson(join(repositoryRoot, artifactPath, 'lesson-definition.json'), {
    answer_keys: { [`${job.lesson_id}-ACTIVITY`]: 'Option A' },
    learner_safe_dto: dto,
    lesson_id: job.lesson_id,
    rationales: { [`${job.lesson_id}-ACTIVITY`]: 'Server-only rationale.' },
    schema_version: CANDIDATE_SCHEMA_ID,
  });
  const descriptor = await artifactDescriptor(
    repositoryRoot,
    artifactPath,
    ARTIFACT_LIMITS.candidate,
  );
  evidence.candidate_artifact = {
    artifact_path: descriptor.artifact_path,
    candidate_sha256: descriptor.artifact_sha256,
    file_manifest: descriptor.file_manifest,
    job_id: job.job_id,
    lesson_id: job.lesson_id,
    source_plan_sha256: sourcePlanSha256,
    wave_id: waveId,
  };
  return descriptor;
}

async function writeCompilerOutputs(job, repositoryRoot, pinset) {
  const envelope = learnerEnvelope(job);
  const paths = {
    ACCESSIBILITY_ONLY: `bundles/${job.lesson_id}/accessibility_only`,
    BLIND_SOLVE: `bundles/${job.lesson_id}/blind_solve`,
  };
  await writeJson(join(repositoryRoot, paths.BLIND_SOLVE, 'learner-safe-envelope.json'), envelope);
  await writeJson(join(repositoryRoot, paths.BLIND_SOLVE, 'blind-client-runtime.json'), {
    client_scoring_authority: false,
    outcome_override_controls: false,
    rationales_before_response: false,
    request_kinds: [
      'INTERRUPT',
      'OMIT_RESPONSE',
      'REPAIR_STEP',
      'REQUEST_HELP',
      'RESUME',
      'RETRY',
      'REVEAL',
      'SUBMIT_INVALID_ACTIVITY',
      'SUBMIT_RESPONSE',
    ],
    response_fields: ['learner_feedback', 'learner_outcome', 'next_state', 'service_receipt'],
    schema_version: 'mcat-v3-opaque-blind-client-runtime-2',
    service_protocol: 'SIGNED_OPAQUE_REAL_RESPONSE_SCORING_V1',
    submit_endpoint_path: '/submit',
  });
  await writeJson(
    join(repositoryRoot, paths.ACCESSIBILITY_ONLY, 'learner-safe-envelope.json'),
    envelope,
  );
  await writeJson(
    join(repositoryRoot, paths.ACCESSIBILITY_ONLY, 'accessibility-harness-config.json'),
    {
      browser_execution_required: true,
      learner_dto_schema_id: pinset.learner_contract.dto_schema_id,
      required_check_ids: REQUIRED_ACCESSIBILITY_CHECK_IDS,
      review_harness_build_id: pinset.builds.review_harness.build_id,
      review_harness_build_sha256: pinset.builds.review_harness.artifact_sha256,
      review_harness_build_version: pinset.builds.review_harness.build_version,
      schema_version: 'mcat-v3-accessibility-harness-config-1',
      supported_action_kinds: pinset.learner_contract.action_kinds,
      supported_representation_kinds: pinset.learner_contract.representation_kinds,
    },
  );
  const outputs = [];
  for (const bundleKind of ['ACCESSIBILITY_ONLY', 'BLIND_SOLVE']) {
    const scan = await hashArtifactDirectory({
      artifactPath: paths[bundleKind],
      label: `${bundleKind} compiler output`,
      limits: ARTIFACT_LIMITS.review_bundle,
      repositoryRoot,
    });
    outputs.push({
      bundle_kind: bundleKind,
      output_artifact_sha256: directoryHash(scan.file_manifest),
      output_file_manifest: scan.file_manifest,
    });
  }
  return { envelope, outputs, paths };
}

async function materializeProjectionAndBundles({
  candidate,
  compilerKey,
  evidence,
  job,
  pinset,
  repositoryRoot,
}) {
  const outputs = await writeCompilerOutputs(job, repositoryRoot, pinset);
  const projectionSigned = await writeSignedJson({
    document: {
      candidate_file_manifest: candidate.file_manifest,
      candidate_sha256: candidate.artifact_sha256,
      candidate_schema_id: pinset.runtime_contract.candidate_schema_id,
      compiler_build_id: pinset.builds.safe_projection_compiler.build_id,
      compiler_build_sha256: pinset.builds.safe_projection_compiler.artifact_sha256,
      compiler_build_version: pinset.builds.safe_projection_compiler.build_version,
      compiler_signing_key_fingerprint: compilerKey.fingerprint,
      job_id: job.job_id,
      learner_dto_schema_id: pinset.learner_contract.dto_schema_id,
      lesson_id: job.lesson_id,
      outputs: outputs.outputs,
      report_id: `${job.lesson_id}-SAFE-PROJECTION`,
      review_harness_build_sha256: pinset.builds.review_harness.artifact_sha256,
      review_harness_build_version: pinset.builds.review_harness.build_version,
      runtime_contract_version: pinset.runtime_contract.runtime_contract_version,
      schema_version: 'mcat-v3-safe-projection-report-1',
      source_plan_sha256: sourcePlanSha256,
      status: 'DERIVED_BY_PINNED_COMPILER',
      wave_id: waveId,
    },
    documentPath: `projection/${job.lesson_id}/report.json`,
    key: compilerKey,
    repositoryRoot,
  });
  evidence.safe_projection_evidence = {
    compiler_signing_key_fingerprint: compilerKey.fingerprint,
    report_path: projectionSigned.report_path,
    report_sha256: projectionSigned.report_sha256,
    report_signature_path: projectionSigned.report_signature_path,
    report_signature_sha256: projectionSigned.report_signature_sha256,
  };
  for (const bundleKind of ['BLIND_SOLVE', 'ACCESSIBILITY_ONLY']) {
    const bundlePath = outputs.paths[bundleKind];
    await writeJson(
      join(repositoryRoot, bundlePath, 'bundle-manifest.json'),
      createClosedReviewBundleManifest({
        bundleKind,
        compilerBuild: pinset.builds.safe_projection_compiler,
        jobId: job.job_id,
        learnerContract: pinset.learner_contract,
        lessonId: job.lesson_id,
        projectionReportSha256: projectionSigned.report_sha256,
        reviewedCandidateSha256: candidate.artifact_sha256,
        reviewHarnessBuild: pinset.builds.review_harness,
        runtimeContract: pinset.runtime_contract,
        sourcePlanSha256,
        waveId,
      }),
    );
    const scan = await hashArtifactDirectory({
      artifactPath: bundlePath,
      label: `${bundleKind} bundle`,
      limits: ARTIFACT_LIMITS.review_bundle,
      repositoryRoot,
    });
    const bundleEvidence =
      bundleKind === 'BLIND_SOLVE'
        ? evidence.blind_solve_bundle
        : evidence.accessibility_review_bundle;
    bundleEvidence.bundle_path = bundlePath;
    bundleEvidence.bundle_sha256 = scan.artifact_sha256;
    bundleEvidence.distribution.ref = `fixture://${waveId}/${job.lesson_id}/${bundleKind}`;
    bundleEvidence.reviewed_candidate_sha256 = candidate.artifact_sha256;
    bundleEvidence.protected_field_scan = {
      bundle_sha256: scan.artifact_sha256,
      passed: true,
      report_sha256: hashBytes(
        JSON.stringify({
          bundle_kind: bundleKind,
          bundle_sha256: scan.artifact_sha256,
          files: scan.file_manifest,
          scanner_id: CLOSED_BUNDLE_SCANNER_ID,
        }),
      ),
      scanned_file_count: scan.file_manifest.length,
      scanner_id: CLOSED_BUNDLE_SCANNER_ID,
    };
  }
  return outputs;
}

async function materializeRightsAndDomain({
  candidateSha256,
  evidence,
  job,
  keyByIdentity,
  overlay,
  repositoryRoot,
}) {
  const rightsAssignment = assignmentForSlot(
    overlay,
    job.assignments.input_output_rights_reviewer.slot_id,
  );
  const rightsKey = keyForAssignment(keyByIdentity, rightsAssignment);
  const authorIdentity = {
    person_id: rightsAssignment.assignee_person_id,
    run_id: rightsAssignment.assignee_run_id,
  };
  const similaritySigned = await writeSignedJson({
    document: {
      candidate_sha256: candidateSha256,
      checks: [
        { check_id: 'NO_EXPRESSIVE_SOURCE_COPYING', status: 'PASS' },
        { check_id: 'SOURCE_LEDGER_CEILINGS_OBSERVED', status: 'PASS' },
        { check_id: 'SOURCE_OUTPUT_SIMILARITY_WITHIN_POLICY', status: 'PASS' },
      ],
      job_id: job.job_id,
      lesson_id: job.lesson_id,
      report_author_identity: authorIdentity,
      report_id: `${job.lesson_id}-SOURCE-OUTPUT-SIMILARITY`,
      reviewer_slot_id: rightsAssignment.slot_id,
      schema_version: 'mcat-v3-signed-source-output-similarity-report-1',
      signing_key_fingerprint: rightsKey.fingerprint,
      source_ledger_sha256: evidence.source_ledger.ledger_sha256,
      source_plan_sha256: sourcePlanSha256,
      status: 'PASS',
      wave_id: waveId,
    },
    documentPath: `reports/${job.lesson_id}/G05-source-similarity.json`,
    key: rightsKey,
    repositoryRoot,
  });
  const rightsSigned = await writeSignedJson({
    document: {
      candidate_sha256: candidateSha256,
      gate_id: 'G05_CLEAN_ROOM_RIGHTS_AND_ORIGINALITY',
      input_rights_approved: true,
      job_id: job.job_id,
      lesson_id: job.lesson_id,
      output_rights_and_originality_approved: true,
      report_author_identity: authorIdentity,
      report_id: `${job.lesson_id}-G05-RIGHTS`,
      reviewer_slot_id: rightsAssignment.slot_id,
      schema_version: 'mcat-v3-signed-rights-review-report-1',
      signing_key_fingerprint: rightsKey.fingerprint,
      source_ledger_sha256: evidence.source_ledger.ledger_sha256,
      source_output_similarity_report_sha256: similaritySigned.report_sha256,
      source_plan_sha256: sourcePlanSha256,
      status: 'APPROVED',
      wave_id: waveId,
    },
    documentPath: `reports/${job.lesson_id}/G05-rights.json`,
    key: rightsKey,
    repositoryRoot,
  });
  evidence.rights_and_originality_review.candidate_sha256 = candidateSha256;
  evidence.rights_and_originality_review.signed_evidence = {
    rights_report: rightsSigned,
    source_output_similarity_report: similaritySigned,
  };

  evidence.domain_scientific_review.candidate_sha256 = candidateSha256;
  evidence.domain_scientific_review.reviewed_candidate_sha256 = candidateSha256;
  for (const record of evidence.domain_scientific_review.specialty_records) {
    const assignment = assignmentForSlot(overlay, record.reviewer_slot_id);
    const key = keyForAssignment(keyByIdentity, assignment);
    record.report = await writeSignedJson({
      document: {
        candidate_sha256: candidateSha256,
        checks: [
          {
            check_id: 'DOMAIN_FACTS_SCOPE_ASSUMPTIONS_AND_BOUNDARIES',
            status: 'PASS',
          },
        ],
        gate_id: 'G10_DOMAIN_FACT_CHECK_AND_SCIENTIFIC_REVIEW',
        job_id: job.job_id,
        lesson_id: job.lesson_id,
        report_author_identity: {
          person_id: assignment.assignee_person_id,
          run_id: assignment.assignee_run_id,
        },
        report_id: `${job.lesson_id}-${record.specialty}-G10`,
        reviewer_slot_id: assignment.slot_id,
        schema_version: 'mcat-v3-signed-domain-review-report-1',
        selected_passage_subject: null,
        signing_key_fingerprint: key.fingerprint,
        source_ledger_sha256: evidence.source_ledger.ledger_sha256,
        source_plan_sha256: sourcePlanSha256,
        specialty: record.specialty,
        status: 'APPROVED',
        wave_id: waveId,
      },
      documentPath: `reports/${job.lesson_id}/G10-${record.specialty}.json`,
      key,
      repositoryRoot,
    });
  }
  if (job.domain_bucket === 'CARS') {
    const record = evidence.domain_scientific_review.cars_passage_subject_record;
    const assignment = assignmentForSlot(overlay, record.reviewer_slot_id);
    const key = keyForAssignment(keyByIdentity, assignment);
    record.selected_passage_subject = evidence.selected_original_passage_subject;
    record.report = await writeSignedJson({
      document: {
        candidate_sha256: candidateSha256,
        checks: [{ check_id: 'PASSAGE_SUBJECT_FACTS_AND_CEILING', status: 'PASS' }],
        gate_id: 'G10_DOMAIN_FACT_CHECK_AND_SCIENTIFIC_REVIEW',
        job_id: job.job_id,
        lesson_id: job.lesson_id,
        report_author_identity: {
          person_id: assignment.assignee_person_id,
          run_id: assignment.assignee_run_id,
        },
        report_id: `${job.lesson_id}-CARS-SUBJECT-G10`,
        reviewer_slot_id: assignment.slot_id,
        schema_version: 'mcat-v3-signed-domain-review-report-1',
        selected_passage_subject: evidence.selected_original_passage_subject,
        signing_key_fingerprint: key.fingerprint,
        source_ledger_sha256: evidence.source_ledger.ledger_sha256,
        source_plan_sha256: sourcePlanSha256,
        specialty: record.specialty,
        status: 'APPROVED',
        wave_id: waveId,
      },
      documentPath: `reports/${job.lesson_id}/G10-CARS-SUBJECT.json`,
      key,
      repositoryRoot,
    });
  }
}

function validReceiptSteps() {
  return [
    ['SUBMIT_RESPONSE', 'CORRECT', 'CORRECT'],
    ['SUBMIT_RESPONSE', 'INCORRECT', 'INCORRECT'],
    ['OMIT_RESPONSE', 'OMITTED', 'OMISSION'],
    ['REQUEST_HELP', 'HELP_SHOWN', 'HELP'],
    ['SUBMIT_RESPONSE', 'INCORRECT', 'RETRY'],
    ['RETRY', 'RETRY_READY', 'RETRY'],
    ['SUBMIT_RESPONSE', 'CORRECT', 'RETRY'],
    ['SUBMIT_RESPONSE', 'INCORRECT', 'REVEAL'],
    ['REVEAL', 'REVEALED', 'REVEAL'],
    ['INTERRUPT', 'INTERRUPTED', 'INTERRUPTION'],
    ['RESUME', 'RESUMED', 'INTERRUPTION'],
    ['SUBMIT_INVALID_ACTIVITY', 'INVALID_ACTIVITY_REJECTED', 'INVALID'],
    ['SUBMIT_RESPONSE', 'INCORRECT', 'MIXED'],
    ['REQUEST_HELP', 'HELP_SHOWN', 'MIXED'],
    ['SUBMIT_RESPONSE', 'CORRECT', 'MIXED'],
    ['REPAIR_STEP', 'REPAIR_CONTINUE', 'REPAIR'],
    ['REPAIR_STEP', 'REPAIR_CONTINUE', 'REPAIR'],
    ['REPAIR_STEP', 'REPAIR_LIMIT', 'REPAIR'],
  ];
}

async function materializeBlindService({
  candidateSha256,
  evidence,
  integrationRoot,
  job,
  keyByIdentity,
  overlay,
  pinset,
  repositoryRoot,
}) {
  const receiptKey = createSigningKey();
  const servicePath = `service/${job.lesson_id}/deployment`;
  const deploymentId = `FIXTURE-DEPLOYMENT-${job.lesson_id}`;
  const initialState = hashText(`${job.job_id}-STATE-INITIAL`);
  await writeJson(join(repositoryRoot, servicePath, 'deployment-manifest.json'), {
    candidate_sha256: candidateSha256,
    deployment_id: deploymentId,
    ephemeral: true,
    initial_state_sha256: initialState,
    job_id: job.job_id,
    lesson_id: job.lesson_id,
    receipt_signing_key_fingerprint: receiptKey.fingerprint,
    safe_client_sha256: evidence.blind_solve_bundle.bundle_sha256,
    schema_version: 'mcat-v3-opaque-service-deployment-manifest-1',
    scoring_service_build_id: pinset.builds.scoring_service.build_id,
    scoring_service_build_sha256: pinset.builds.scoring_service.artifact_sha256,
    scoring_service_build_version: pinset.builds.scoring_service.build_version,
    source_plan_sha256: sourcePlanSha256,
    wave_id: waveId,
  });
  await writeBytes(
    join(repositoryRoot, servicePath, 'receipt-signing-public-key.pem'),
    Buffer.from(receiptKey.publicKeyPem),
  );
  const deployment = await artifactDescriptor(
    repositoryRoot,
    servicePath,
    ARTIFACT_LIMITS.service_deployment,
  );
  const solverAssignment = assignmentForSlot(overlay, job.assignments.blind_solver.slot_id);
  const solverIdentity = {
    person_id: solverAssignment.assignee_person_id,
    run_id: solverAssignment.assignee_run_id,
  };
  const attestationSigned = await writeSignedJson({
    document: {
      accepts_real_submitted_responses: true,
      candidate_sha256: candidateSha256,
      deployment_id: deploymentId,
      ephemeral: true,
      exact_key_bearing_candidate_deployed: true,
      integrator_identity: overlay.wave_integrator_identity,
      job_id: job.job_id,
      lesson_id: job.lesson_id,
      ordinary_learner_authorized_feedback_only: true,
      outcome_override_controls_exposed: false,
      protected_scoring_material_exposed: false,
      rationales_before_response_exposed: false,
      receipt_signing_key_fingerprint: receiptKey.fingerprint,
      safe_client_sha256: evidence.blind_solve_bundle.bundle_sha256,
      schema_version: 'mcat-v3-signed-opaque-service-deployment-attestation-2',
      server_definition_exposed: false,
      service_deployment_artifact_sha256: deployment.artifact_sha256,
      solver_identity: solverIdentity,
      source_branch_exposed: false,
      source_plan_sha256: sourcePlanSha256,
      wave_id: waveId,
    },
    documentPath: `service/${job.lesson_id}/deployment-attestation.json`,
    key: integrationRoot,
    repositoryRoot,
  });
  const receiptPath = `service/${job.lesson_id}/receipts`;
  const entries = [];
  let priorState = initialState;
  const activityId = `${job.lesson_id}-ACTIVITY`;
  const steps = validReceiptSteps();
  for (const [index, [requestKind, learnerOutcome, attemptGroup]] of steps.entries()) {
    const sequence = index + 1;
    const nextState = hashText(`${job.job_id}-STATE-${sequence}`);
    const responseKinds = new Set(['REPAIR_STEP', 'SUBMIT_INVALID_ACTIVITY', 'SUBMIT_RESPONSE']);
    const receipt = {
      activity_id: activityId,
      attempt_id: `${job.lesson_id}-ATTEMPT-${attemptGroup}`,
      candidate_sha256: candidateSha256,
      deployment_id: deploymentId,
      learner_feedback_sha256: hashText(`${job.job_id}-FEEDBACK-${sequence}`),
      learner_outcome: learnerOutcome,
      next_state_sha256: nextState,
      prior_state_sha256: priorState,
      receipt_signing_key_fingerprint: receiptKey.fingerprint,
      request_id: `${job.lesson_id}-REQUEST-${sequence}`,
      request_kind: requestKind,
      safe_client_sha256: evidence.blind_solve_bundle.bundle_sha256,
      schema_version: 'mcat-v3-service-request-response-receipt-1',
      sequence,
      service_deployment_artifact_sha256: deployment.artifact_sha256,
      service_timestamp: new Date(Date.UTC(2026, 6, 23, 18, 0, sequence)).toISOString(),
      session_id: `${job.lesson_id}-SESSION`,
      submitted_response_sha256: responseKinds.has(requestKind)
        ? hashText(`${job.job_id}-RESPONSE-${sequence}`)
        : null,
    };
    const documentPath = `receipts/${String(sequence).padStart(4, '0')}.json`;
    const signaturePath = `receipts/${String(sequence).padStart(4, '0')}.sig`;
    const written = await writeJson(join(repositoryRoot, receiptPath, documentPath), receipt);
    const signature = await writeSignature(
      join(repositoryRoot, receiptPath, signaturePath),
      written.bytes,
      receiptKey.privateKey,
    );
    entries.push({
      receipt_path: documentPath,
      receipt_sha256: written.sha256,
      sequence,
      signature_path: signaturePath,
      signature_sha256: signature.sha256,
    });
    priorState = nextState;
  }
  const manifest = {
    candidate_sha256: candidateSha256,
    deployment_id: deploymentId,
    entries,
    receipt_count: entries.length,
    receipt_signing_key_fingerprint: receiptKey.fingerprint,
    safe_client_sha256: evidence.blind_solve_bundle.bundle_sha256,
    schema_version: 'mcat-v3-service-receipt-manifest-1',
    service_deployment_artifact_sha256: deployment.artifact_sha256,
    session_closed: true,
    session_id: `${job.lesson_id}-SESSION`,
  };
  const manifestWritten = await writeJson(
    join(repositoryRoot, receiptPath, 'receipt-manifest.json'),
    manifest,
  );
  await writeSignature(
    join(repositoryRoot, receiptPath, 'receipt-manifest.sig'),
    manifestWritten.bytes,
    receiptKey.privateKey,
  );
  const receiptArtifact = await artifactDescriptor(
    repositoryRoot,
    receiptPath,
    ARTIFACT_LIMITS.receipt_log,
  );
  evidence.blind_solve_review.approved = true;
  evidence.blind_solve_review.candidate_sha256 = candidateSha256;
  evidence.blind_solve_review.safe_client_sha256 = evidence.blind_solve_bundle.bundle_sha256;
  evidence.blind_solve_review.service_deployment_artifact = deployment;
  evidence.blind_solve_review.deployment_attestation = {
    attestation_path: attestationSigned.report_path,
    attestation_sha256: attestationSigned.report_sha256,
    attestation_signature_path: attestationSigned.report_signature_path,
    attestation_signature_sha256: attestationSigned.report_signature_sha256,
  };
  evidence.blind_solve_review.receipt_artifact = receiptArtifact;
  evidence.blind_solve_review.solver_recipient_identity = solverIdentity;
  await materializeGateReport({
    candidateSha256,
    descriptor: evidence.blind_solve_review.approval_evidence,
    gateId: 'G07_INDEPENDENT_BLIND_SOLVE',
    job,
    keyByIdentity,
    overlay,
    repositoryRoot,
    reviewedArtifactSha256: receiptArtifact.artifact_sha256,
    reviewerSlotId: job.assignments.blind_solver.slot_id,
  });
  return { receiptKey };
}

async function materializeAccessibility({
  candidateSha256,
  evidence,
  harnessKey,
  job,
  keyByIdentity,
  overlay,
  pinset,
  repositoryRoot,
}) {
  const browserPath = `accessibility/${job.lesson_id}/browser-evidence`;
  const checks = [];
  for (const checkId of REQUIRED_ACCESSIBILITY_CHECK_IDS) {
    const written = await writeJson(
      join(repositoryRoot, browserPath, 'checks', `${checkId}.json`),
      {
        check_id: checkId,
        observed_value: `${checkId}-observed-pass`,
        required_value: `${checkId}-required-pass`,
        schema_version: 'mcat-v3-browser-accessibility-check-evidence-1',
        status: 'PASS',
      },
    );
    checks.push({
      check_id: checkId,
      evidence_sha256: written.sha256,
      observed_value: `${checkId}-observed-pass`,
      required_value: `${checkId}-required-pass`,
      status: 'PASS',
    });
  }
  const browserEvidence = await artifactDescriptor(
    repositoryRoot,
    browserPath,
    ARTIFACT_LIMITS.browser_evidence,
  );
  const assignment = assignmentForSlot(
    overlay,
    job.assignments.accessibility_technical_auditor.slot_id,
  );
  const executionSigned = await writeSignedJson({
    document: {
      browser_build_sha256: hashText('FIXTURE-BROWSER-BUILD'),
      browser_evidence_artifact_sha256: browserEvidence.artifact_sha256,
      candidate_sha256: candidateSha256,
      checks,
      harness_build_id: pinset.builds.review_harness.build_id,
      harness_build_sha256: pinset.builds.review_harness.artifact_sha256,
      harness_build_version: pinset.builds.review_harness.build_version,
      harness_signing_key_fingerprint: harnessKey.fingerprint,
      job_id: job.job_id,
      learner_dto_schema_id: pinset.learner_contract.dto_schema_id,
      lesson_id: job.lesson_id,
      media_digests: learnerEnvelope(job).media_digests,
      reviewer_identity: {
        person_id: assignment.assignee_person_id,
        run_id: assignment.assignee_run_id,
      },
      reviewer_slot_id: assignment.slot_id,
      safe_client_sha256: evidence.accessibility_review_bundle.bundle_sha256,
      schema_version: 'mcat-v3-signed-accessibility-execution-report-1',
      source_plan_sha256: sourcePlanSha256,
      status: 'EXECUTED_AND_PASSED',
      supported_action_kinds: pinset.learner_contract.action_kinds,
      supported_representation_kinds: pinset.learner_contract.representation_kinds,
      wave_id: waveId,
    },
    documentPath: `accessibility/${job.lesson_id}/execution-report.json`,
    key: harnessKey,
    repositoryRoot,
  });
  evidence.accessibility_execution_evidence = {
    browser_evidence_artifact: browserEvidence,
    execution_report: executionSigned,
  };
  await materializeGateReport({
    candidateSha256,
    descriptor: evidence.accessibility_technical_review,
    gateId: 'G08_ACCESSIBILITY_TECHNICAL_AUDIT',
    job,
    keyByIdentity,
    overlay,
    repositoryRoot,
    reviewedArtifactSha256: executionSigned.report_sha256,
    reviewerSlotId: assignment.slot_id,
  });
}

async function materializeSimilarity({
  candidateBindings,
  integrationRoot,
  keyByIdentity,
  overlay,
  repositoryRoot,
}) {
  const corpusSigned = await writeSignedJson({
    document: {
      candidate_bindings: [],
      included_wave_ids: [],
      manifest_id: `${waveId}-PRIOR-CORPUS`,
      schema_version: 'mcat-v3-signed-cumulative-corpus-manifest-1',
      source_plan_sha256: sourcePlanSha256,
      status: 'INTEGRATED_AND_PINNED',
    },
    documentPath: `similarity/${waveId}/prior-corpus.json`,
    key: integrationRoot,
    repositoryRoot,
  });
  overlay.wave_similarity_review.approved = true;
  overlay.wave_similarity_review.candidate_bindings = candidateBindings;
  overlay.wave_similarity_review.prior_corpus_manifest = {
    manifest_path: corpusSigned.report_path,
    manifest_sha256: corpusSigned.report_sha256,
    manifest_signature_path: corpusSigned.report_signature_path,
    manifest_signature_sha256: corpusSigned.report_signature_sha256,
  };
  const reviewerAssignments = overlay.wave_similarity_review.reviewer_slot_ids.map((slotId) =>
    assignmentForSlot(overlay, slotId),
  );
  const reviewers = reviewerAssignments.map((assignment) => {
    const key = keyForAssignment(keyByIdentity, assignment);
    return {
      identity: {
        person_id: assignment.assignee_person_id,
        run_id: assignment.assignee_run_id,
      },
      reviewer_slot_id: assignment.slot_id,
      signing_key_fingerprint: key.fingerprint,
    };
  });
  const reportPath = `similarity/${waveId}/report.json`;
  const report = {
    candidate_bindings: candidateBindings,
    checks: [
      { check_id: 'COMPLETE_PRIOR_CORPUS', status: 'PASS' },
      { check_id: 'CURRENT_WAVE_CROSS_DOMAIN', status: 'PASS' },
      { check_id: 'TEMPLATE_OVERFITTING', status: 'PASS' },
    ],
    comparison_wave_ids: wave.similarity_comparison_wave_ids,
    gate_id: 'G09_CROSS_LESSON_SIMILARITY_AUDIT',
    prior_corpus_manifest_sha256: corpusSigned.report_sha256,
    report_id: `${waveId}-SIMILARITY-REPORT`,
    reviewers,
    schema_version: 'mcat-v3-signed-wave-similarity-report-2',
    source_plan_sha256: sourcePlanSha256,
    status: 'APPROVED',
    wave_id: waveId,
  };
  const reportWritten = await writeJson(join(repositoryRoot, reportPath), report);
  const signatures = [];
  for (const assignment of reviewerAssignments) {
    const key = keyForAssignment(keyByIdentity, assignment);
    const signaturePath = `similarity/${waveId}/signatures/${assignment.slot_id.replaceAll(':', '_')}.sig`;
    const signature = await writeSignature(
      join(repositoryRoot, signaturePath),
      reportWritten.bytes,
      key.privateKey,
    );
    signatures.push({
      reviewer_slot_id: assignment.slot_id,
      signature_path: signaturePath,
      signature_sha256: signature.sha256,
      signer_key_fingerprint: key.fingerprint,
    });
  }
  overlay.wave_similarity_review.report = {
    report_path: reportPath,
    report_sha256: reportWritten.sha256,
    signatures,
  };
}

async function createValidFixture() {
  const repositoryRoot = await mkdtemp(join(tmpdir(), 'v3-signed-overlay-'));
  const overlay = createWaveAssignmentOverlayTemplate(plan, sourcePlanSha256, waveId);
  overlay.materialization_status = 'MATERIALIZED';
  overlay.materialized_at = '2026-07-23T19:00:00Z';
  overlay.overlay_id = 'W00-FIXTURE-CRYPTOGRAPHIC-001';
  overlay.controller_identity = {
    person_id: 'PERSON-CONTROLLER',
    run_id: 'RUN-CONTROLLER',
  };
  overlay.wave_integrator_identity = {
    person_id: 'PERSON-WAVE-INTEGRATOR',
    run_id: 'RUN-WAVE-INTEGRATOR',
  };
  overlay.assignments.forEach((assignment, index) => {
    assignment.assignee_person_id = `PERSON-SLOT-${index}`;
    assignment.assignee_run_id = `RUN-SLOT-${index}`;
    assignment.qualification_evidence_ids =
      assignment.role === 'LESSON_AUTHOR' ? [] : [`QUAL-SLOT-${index}`];
  });
  const integration = await materializeIntegrationTrust(overlay, repositoryRoot);
  const keyByIdentity = await materializeReviewerCredentials(
    overlay,
    repositoryRoot,
    integration.integrationRoot,
  );
  const candidateBindings = [];
  const receiptKeyByJobId = new Map();
  for (const evidence of overlay.job_evidence) {
    const job = jobById.get(evidence.job_id);
    assert(job);
    const sourceId = `SOURCE-${job.lesson_id}`;
    evidence.source_ledger.entries = [
      {
        access_date: '2026-07-23',
        copied_expressive_prose_allowed: false,
        factual_use_only: true,
        license_or_terms: 'Fixture-only open factual terms.',
        model_processing_rights: {
          basis: 'Fixture-only authorized source.',
          status: 'AUTHORIZED_FOR_MODEL_PROCESSING',
        },
        provided_to_author_model: true,
        retrieved_content_sha256: hashText(`retrieved-${sourceId}`),
        rights_review_slot_id: evidence.source_ledger.rights_reviewer_slot_id,
        source_ceiling: 'Fixture facts only.',
        source_id: sourceId,
        source_kind: 'CURRENT_AUTHORITATIVE_OPEN_FACTUAL',
        title: `Fixture source ${job.lesson_id}`,
        url: `https://example.org/${job.lesson_id}`,
      },
    ];
    evidence.source_ledger.ledger_sha256 = computeSourceLedgerSha256(evidence.source_ledger);
    if (job.domain_bucket === 'CARS') {
      evidence.selected_original_passage_subject = 'Fixture history of public-library wayfinding';
      assignmentForSlot(
        overlay,
        job.assignments.cars_passage_subject_fact_checker.slot_id,
      ).selected_passage_subject = evidence.selected_original_passage_subject;
    }
    const candidate = await writeCandidate({
      evidence,
      job,
      pinset: integration.pinset,
      repositoryRoot,
    });
    candidateBindings.push({
      candidate_sha256: candidate.artifact_sha256,
      job_id: job.job_id,
    });
    await materializeRightsAndDomain({
      candidateSha256: candidate.artifact_sha256,
      evidence,
      job,
      keyByIdentity,
      overlay,
      repositoryRoot,
    });
    for (const descriptor of evidence.canonical_runtime_content_gate_reports) {
      await materializeGateReport({
        candidateSha256: candidate.artifact_sha256,
        descriptor,
        gateId: descriptor.gate_id,
        job,
        keyByIdentity,
        overlay,
        repositoryRoot,
        reviewedArtifactSha256: candidate.artifact_sha256,
        reviewerSlotId: descriptor.reviewer_slot_id,
      });
    }
    await materializeGateReport({
      candidateSha256: candidate.artifact_sha256,
      descriptor: evidence.content_pedagogy_audit,
      gateId: 'G06_INDEPENDENT_CONTENT_PEDAGOGY_AUDIT',
      job,
      keyByIdentity,
      overlay,
      repositoryRoot,
      reviewedArtifactSha256: candidate.artifact_sha256,
      reviewerSlotId: evidence.content_pedagogy_audit.reviewer_slot_id,
    });
    await materializeProjectionAndBundles({
      candidate,
      compilerKey: integration.compilerKey,
      evidence,
      job,
      pinset: integration.pinset,
      repositoryRoot,
    });
    const blind = await materializeBlindService({
      candidateSha256: candidate.artifact_sha256,
      evidence,
      integrationRoot: integration.integrationRoot,
      job,
      keyByIdentity,
      overlay,
      pinset: integration.pinset,
      repositoryRoot,
    });
    receiptKeyByJobId.set(job.job_id, blind.receiptKey);
    await materializeAccessibility({
      candidateSha256: candidate.artifact_sha256,
      evidence,
      harnessKey: integration.harnessKey,
      job,
      keyByIdentity,
      overlay,
      pinset: integration.pinset,
      repositoryRoot,
    });
  }
  await materializeSimilarity({
    candidateBindings,
    integrationRoot: integration.integrationRoot,
    keyByIdentity,
    overlay,
    repositoryRoot,
  });
  return {
    ...integration,
    keyByIdentity,
    overlay,
    receiptKeyByJobId,
    repositoryRoot,
  };
}

async function validateFixture(fixture, overlay = fixture.overlay) {
  return validateWaveAssignmentOverlay(overlay, {
    allowFixtureTrust: true,
    externalTrustRootPublicKeyPath: fixture.trustRootPath,
    plan,
    repositoryRoot: fixture.repositoryRoot,
    sourcePlanSha256,
  });
}

async function withFixture(callback) {
  const fixture = await createValidFixture();
  try {
    return await callback(fixture);
  } finally {
    await rm(fixture.repositoryRoot, { force: true, recursive: true });
  }
}

async function rejectMutation(mutate, pattern) {
  return withFixture(async (fixture) => {
    await mutate(fixture.overlay, fixture);
    await assert.rejects(validateFixture(fixture), pattern);
  });
}

function firstEvidence(overlay) {
  return overlay.job_evidence[0];
}

async function mutateSignedReport(descriptor, fixture, key, mutate) {
  const document = JSON.parse(
    await readFile(join(fixture.repositoryRoot, descriptor.report_path), 'utf8'),
  );
  mutate(document);
  const written = await writeJson(join(fixture.repositoryRoot, descriptor.report_path), document);
  const signature = await writeSignature(
    join(fixture.repositoryRoot, descriptor.report_signature_path),
    written.bytes,
    key.privateKey,
  );
  descriptor.report_sha256 = written.sha256;
  descriptor.report_signature_sha256 = signature.sha256;
}

async function mutateSignedReceiptTrace(fixture, evidence, mutate) {
  const review = evidence.blind_solve_review;
  const key = fixture.receiptKeyByJobId.get(evidence.job_id);
  const root = join(fixture.repositoryRoot, review.receipt_artifact.artifact_path);
  const manifestPath = join(root, 'receipt-manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const receipts = [];
  for (const entry of manifest.entries) {
    receipts.push(JSON.parse(await readFile(join(root, entry.receipt_path), 'utf8')));
  }
  mutate(receipts);
  for (const [index, entry] of manifest.entries.entries()) {
    const written = await writeJson(join(root, entry.receipt_path), receipts[index]);
    const signature = await writeSignature(
      join(root, entry.signature_path),
      written.bytes,
      key.privateKey,
    );
    entry.receipt_sha256 = written.sha256;
    entry.signature_sha256 = signature.sha256;
  }
  const manifestWritten = await writeJson(manifestPath, manifest);
  await writeSignature(join(root, 'receipt-manifest.sig'), manifestWritten.bytes, key.privateKey);
  review.receipt_artifact = await artifactDescriptor(
    fixture.repositoryRoot,
    review.receipt_artifact.artifact_path,
    ARTIFACT_LIMITS.receipt_log,
  );
}

test('checked template is deterministic and explicitly blocks missing foundation integration', async () => {
  const checked = JSON.parse(await readFile(checkedTemplatePath, 'utf8'));
  assert.deepEqual(checked, createWaveAssignmentOverlayTemplate(plan, sourcePlanSha256, waveId));
  assert.equal(checked.integration_readiness.status, 'BLOCKED_PENDING_SIGNED_FOUNDATION_PINSET');
  assert.equal(checked.integration_trust.pinset_path, null);
});

test('all waves compare current work against the complete historical corpus', () => {
  for (const [index, candidateWave] of plan.waves.entries()) {
    assert.deepEqual(
      candidateWave.similarity_comparison_wave_ids,
      plan.waves.slice(0, index + 1).map((item) => item.wave_id),
    );
  }
  assert.deepEqual(plan.waves[2].similarity_comparison_wave_ids, [
    'V3-AUTH-W00-PILOT-PORT',
    'V3-AUTH-W01',
    'V3-AUTH-W02',
  ]);
});

test('fixture-only cryptographic integration validates complete G01-G10 evidence', async () => {
  await withFixture(async (fixture) => {
    const result = await validateFixture(fixture);
    assert.equal(result.wave_id, waveId);
    assert.equal(result.job_count, 5);
  });
});

test('production validation rejects absent external trust and fixture evidence by default', async () => {
  await withFixture(async (fixture) => {
    await assert.rejects(
      validateWaveAssignmentOverlay(fixture.overlay, {
        plan,
        repositoryRoot: fixture.repositoryRoot,
        sourcePlanSha256,
      }),
      /external integration trust-root public key path|Fixture-only cryptographic evidence/,
    );
  });
});

test('fabricated service receipts and unsigned ACL changes fail signature verification', async () => {
  await rejectMutation(async (overlay, fixture) => {
    const review = firstEvidence(overlay).blind_solve_review;
    const manifestPath = join(
      fixture.repositoryRoot,
      review.receipt_artifact.artifact_path,
      'receipt-manifest.json',
    );
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    const receiptPath = join(
      fixture.repositoryRoot,
      review.receipt_artifact.artifact_path,
      manifest.entries[0].receipt_path,
    );
    const receipt = JSON.parse(await readFile(receiptPath, 'utf8'));
    receipt.learner_outcome = 'INCORRECT';
    await writeJson(receiptPath, receipt);
    review.receipt_artifact = await artifactDescriptor(
      fixture.repositoryRoot,
      review.receipt_artifact.artifact_path,
      ARTIFACT_LIMITS.receipt_log,
    );
  }, /hash is stale|detached signature is invalid/);
  await rejectMutation(async (overlay, fixture) => {
    const descriptor = firstEvidence(overlay).blind_solve_review.deployment_attestation;
    const path = join(fixture.repositoryRoot, descriptor.attestation_path);
    const value = JSON.parse(await readFile(path, 'utf8'));
    value.source_branch_exposed = true;
    const written = await writeJson(path, value);
    descriptor.attestation_sha256 = written.sha256;
  }, /detached signature is invalid/);
});

test('validly signed receipts still fail semantic request/outcome and path predicates', async () => {
  await rejectMutation(async (overlay, fixture) => {
    const evidence = firstEvidence(overlay);
    const review = evidence.blind_solve_review;
    const key = fixture.receiptKeyByJobId.get(evidence.job_id);
    const root = join(fixture.repositoryRoot, review.receipt_artifact.artifact_path);
    const manifestPath = join(root, 'receipt-manifest.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    for (const entry of manifest.entries) {
      const receiptPath = join(root, entry.receipt_path);
      const receipt = JSON.parse(await readFile(receiptPath, 'utf8'));
      if (receipt.learner_outcome === 'CORRECT') {
        receipt.learner_outcome = 'INCORRECT';
        const written = await writeJson(receiptPath, receipt);
        const signature = await writeSignature(
          join(root, entry.signature_path),
          written.bytes,
          key.privateKey,
        );
        entry.receipt_sha256 = written.sha256;
        entry.signature_sha256 = signature.sha256;
      }
    }
    const manifestWritten = await writeJson(manifestPath, manifest);
    await writeSignature(join(root, 'receipt-manifest.sig'), manifestWritten.bytes, key.privateKey);
    review.receipt_artifact = await artifactDescriptor(
      fixture.repositoryRoot,
      review.receipt_artifact.artifact_path,
      ARTIFACT_LIMITS.receipt_log,
    );
  }, /CORRECT_RESPONSE lacks a protocol-valid ordered receipt trace/);
});

for (const { expected, mutate, name } of [
  {
    expected: /INVALID_ACTIVITY lacks a protocol-valid ordered receipt trace/,
    mutate(receipts) {
      const receipt = receipts.find((item) => item.request_kind === 'SUBMIT_INVALID_ACTIVITY');
      receipt.request_kind = 'SUBMIT_RESPONSE';
      receipt.learner_outcome = 'CORRECT';
    },
    name: 'invalid-item path requires an invalid-activity rejection',
  },
  {
    expected: /RETRY lacks a protocol-valid ordered receipt trace/,
    mutate(receipts) {
      const receipt = receipts.find((item) => item.request_kind === 'RETRY');
      receipt.request_kind = 'REQUEST_HELP';
      receipt.learner_outcome = 'HELP_SHOWN';
    },
    name: 'retry path requires an actual retry request and later submission',
  },
  {
    expected: /REVEAL lacks a protocol-valid ordered receipt trace/,
    mutate(receipts) {
      const receipt = receipts.find((item) => item.request_kind === 'REVEAL');
      receipt.request_kind = 'REQUEST_HELP';
      receipt.learner_outcome = 'HELP_SHOWN';
    },
    name: 'reveal path requires a reveal request after an incorrect response',
  },
  {
    expected: /INTERRUPTION_AND_RESUME lacks a protocol-valid ordered receipt trace/,
    mutate(receipts) {
      const interrupt = receipts.find((item) => item.request_kind === 'INTERRUPT');
      const resume = receipts.find((item) => item.request_kind === 'RESUME');
      interrupt.request_kind = 'RESUME';
      interrupt.learner_outcome = 'RESUMED';
      resume.request_kind = 'INTERRUPT';
      resume.learner_outcome = 'INTERRUPTED';
    },
    name: 'resume may not precede interruption',
  },
  {
    expected: /REPAIR_LIMIT lacks a protocol-valid ordered receipt trace/,
    mutate(receipts) {
      const repairContinues = receipts.filter((item) => item.learner_outcome === 'REPAIR_CONTINUE');
      for (const receipt of repairContinues) {
        receipt.request_kind = 'SUBMIT_RESPONSE';
        receipt.learner_outcome = 'INCORRECT';
      }
    },
    name: 'repair-limit path requires multiple ordered repair cycles',
  },
]) {
  test(name, async () => {
    await rejectMutation(async (overlay, fixture) => {
      await mutateSignedReceiptTrace(fixture, firstEvidence(overlay), mutate);
    }, expected);
  });
}

test('unrelated learner-safe output cannot claim candidate derivation', async () => {
  await rejectMutation(async (overlay, fixture) => {
    const bundle = firstEvidence(overlay).blind_solve_bundle;
    const path = join(fixture.repositoryRoot, bundle.bundle_path, 'learner-safe-envelope.json');
    const envelope = JSON.parse(await readFile(path, 'utf8'));
    envelope.lesson_dto.activities[0].prompt = 'Unrelated hand-authored prompt.';
    await writeJson(path, envelope);
  }, /is not the signed compiler output/);
});

test('closed bundles reject protected aliases, unknown DTO fields, and extra files', async () => {
  await rejectMutation(async (overlay, fixture) => {
    const bundle = firstEvidence(overlay).blind_solve_bundle;
    const path = join(fixture.repositoryRoot, bundle.bundle_path, 'learner-safe-envelope.json');
    const envelope = JSON.parse(await readFile(path, 'utf8'));
    envelope.lesson_dto.activities[0].key = 'Option A';
    await writeJson(path, envelope);
  }, /forbidden protected field/);
  await rejectMutation(async (overlay, fixture) => {
    const bundle = firstEvidence(overlay).blind_solve_bundle;
    const path = join(fixture.repositoryRoot, bundle.bundle_path, 'learner-safe-envelope.json');
    const envelope = JSON.parse(await readFile(path, 'utf8'));
    envelope.lesson_dto.representations[0].script = 'alert(1)';
    await writeJson(path, envelope);
  }, /fails pinned schema/);
  await rejectMutation(async (overlay, fixture) => {
    const bundle = firstEvidence(overlay).blind_solve_bundle;
    await writeBytes(
      join(fixture.repositoryRoot, bundle.bundle_path, 'notes.txt'),
      Buffer.from('unexpected'),
    );
  }, /exact closed file set/);
});

test('static accessibility claims cannot replace signed harness execution', async () => {
  await rejectMutation(async (overlay, fixture) => {
    const descriptor = firstEvidence(overlay).accessibility_execution_evidence.execution_report;
    const path = join(fixture.repositoryRoot, descriptor.report_path);
    const value = JSON.parse(await readFile(path, 'utf8'));
    value.status = 'SELF_ASSERTED_PASS';
    const written = await writeJson(path, value);
    descriptor.report_sha256 = written.sha256;
  }, /detached signature is invalid/);
});

test('G05 and G10 reject stale, misbound, and unknown signed report fields', async () => {
  await rejectMutation(async (overlay) => {
    const descriptor =
      firstEvidence(overlay).rights_and_originality_review.signed_evidence.rights_report;
    descriptor.report_sha256 = '0'.repeat(64);
  }, /hash is stale/);
  await rejectMutation(async (overlay) => {
    const descriptor =
      firstEvidence(overlay).rights_and_originality_review.signed_evidence.rights_report;
    descriptor.report_path = 'reports/missing-G05-rights.json';
  }, /ENOENT|no such file/);
  await rejectMutation(async (overlay, fixture) => {
    const evidence = firstEvidence(overlay);
    const record = evidence.domain_scientific_review.specialty_records[0];
    const assignment = assignmentForSlot(overlay, record.reviewer_slot_id);
    await mutateSignedReport(
      record.report,
      fixture,
      keyForAssignment(fixture.keyByIdentity, assignment),
      (report) => {
        report.candidate_sha256 = '0'.repeat(64);
      },
    );
  }, /Expected values to be strictly equal/);
  await rejectMutation(async (overlay, fixture) => {
    const evidence = firstEvidence(overlay);
    const descriptor =
      evidence.rights_and_originality_review.signed_evidence.source_output_similarity_report;
    const assignment = assignmentForSlot(
      overlay,
      evidence.rights_and_originality_review.reviewer_slot_id,
    );
    await mutateSignedReport(
      descriptor,
      fixture,
      keyForAssignment(fixture.keyByIdentity, assignment),
      (report) => {
        report.unknown_field = true;
      },
    );
  }, /missing or unknown fields/);
});

test('candidate runtime pins and pinned LessonDefinition schema are exact', async () => {
  await rejectMutation(async (overlay, fixture) => {
    const evidence = firstEvidence(overlay);
    const path = join(
      fixture.repositoryRoot,
      evidence.candidate_artifact.artifact_path,
      'candidate-manifest.json',
    );
    const manifest = JSON.parse(await readFile(path, 'utf8'));
    manifest.runtime_contract_version = 'ARBITRARY-RUNTIME';
    await writeJson(path, manifest);
    const refreshed = await artifactDescriptor(
      fixture.repositoryRoot,
      evidence.candidate_artifact.artifact_path,
      ARTIFACT_LIMITS.candidate,
    );
    evidence.candidate_artifact.candidate_sha256 = refreshed.artifact_sha256;
    evidence.candidate_artifact.file_manifest = refreshed.file_manifest;
  }, /Expected values to be strictly equal/);
  await rejectMutation(async (overlay, fixture) => {
    const evidence = firstEvidence(overlay);
    const path = join(
      fixture.repositoryRoot,
      evidence.candidate_artifact.artifact_path,
      'lesson-definition.json',
    );
    const definition = JSON.parse(await readFile(path, 'utf8'));
    delete definition.answer_keys;
    await writeJson(path, definition);
    const refreshed = await artifactDescriptor(
      fixture.repositoryRoot,
      evidence.candidate_artifact.artifact_path,
      ARTIFACT_LIMITS.candidate,
    );
    evidence.candidate_artifact.candidate_sha256 = refreshed.artifact_sha256;
    evidence.candidate_artifact.file_manifest = refreshed.file_manifest;
  }, /not a valid pinned LessonDefinition/);
});

test('stale service deployment artifacts fail closed', async () => {
  await rejectMutation(async (overlay, fixture) => {
    const descriptor = firstEvidence(overlay).blind_solve_review.service_deployment_artifact;
    const path = join(fixture.repositoryRoot, descriptor.artifact_path, 'deployment-manifest.json');
    const manifest = JSON.parse(await readFile(path, 'utf8'));
    manifest.scoring_service_build_sha256 = '0'.repeat(64);
    await writeJson(path, manifest);
    Object.assign(
      descriptor,
      await artifactDescriptor(
        fixture.repositoryRoot,
        descriptor.artifact_path,
        ARTIFACT_LIMITS.service_deployment,
      ),
    );
  }, /Expected values to be strictly equal/);
});

test('report author identity and credential signatures bind assigned reviewers', async () => {
  await rejectMutation(async (overlay, fixture) => {
    const evidence = firstEvidence(overlay);
    const descriptor = evidence.content_pedagogy_audit.report;
    const assignment = assignmentForSlot(overlay, evidence.content_pedagogy_audit.reviewer_slot_id);
    await mutateSignedReport(
      descriptor,
      fixture,
      keyForAssignment(fixture.keyByIdentity, assignment),
      (report) => {
        report.report_author_identity.person_id = 'PERSON-FORGED';
      },
    );
  }, /does not match assigned identity|Expected values to be strictly deep-equal/);
});

test('cumulative corpus manifests cannot omit an earlier wave', async () => {
  const repositoryRoot = await mkdtemp(join(tmpdir(), 'v3-corpus-signature-'));
  try {
    const rootKey = createSigningKey();
    const signed = await writeSignedJson({
      document: {
        candidate_bindings: [
          {
            candidate_sha256: hashText('candidate-w01'),
            job_id: 'JOB-W01',
            lesson_id: 'LESSON-W01',
            wave_id: 'V3-AUTH-W01',
          },
        ],
        included_wave_ids: ['V3-AUTH-W01'],
        manifest_id: 'BAD-CORPUS',
        schema_version: 'mcat-v3-signed-cumulative-corpus-manifest-1',
        source_plan_sha256: sourcePlanSha256,
        status: 'INTEGRATED_AND_PINNED',
      },
      documentPath: 'corpus.json',
      key: rootKey,
      repositoryRoot,
    });
    await assert.rejects(
      validateSignedCumulativeCorpusManifest({
        descriptor: {
          manifest_path: signed.report_path,
          manifest_sha256: signed.report_sha256,
          manifest_signature_path: signed.report_signature_path,
          manifest_signature_sha256: signed.report_signature_sha256,
        },
        integrationTrustRootPem: rootKey.publicKeyPem,
        priorJobs: [
          { job_id: 'JOB-W00', lesson_id: 'LESSON-W00', wave_id: 'V3-AUTH-W00-PILOT-PORT' },
          { job_id: 'JOB-W01', lesson_id: 'LESSON-W01', wave_id: 'V3-AUTH-W01' },
        ],
        priorWaveIds: ['V3-AUTH-W00-PILOT-PORT', 'V3-AUTH-W01'],
        repositoryRoot,
        sourcePlanSha256,
      }),
      /Expected values to be strictly deep-equal|bind every historical job/,
    );
  } finally {
    await rm(repositoryRoot, { force: true, recursive: true });
  }
});

test('artifact resource limits and duplicate manifests fail before unbounded reads', async () => {
  await rejectMutation(async (overlay, fixture) => {
    const evidence = firstEvidence(overlay);
    await writeBytes(
      join(fixture.repositoryRoot, evidence.candidate_artifact.artifact_path, 'oversized.bin'),
      Buffer.alloc(ARTIFACT_LIMITS.candidate.max_file_bytes + 1),
    );
  }, /exceeds per-file byte limit/);
  await rejectMutation(async (overlay) => {
    const evidence = firstEvidence(overlay);
    evidence.candidate_artifact.file_manifest.push(
      clone(evidence.candidate_artifact.file_manifest[0]),
    );
  }, /duplicate path|path-sorted/);
  await rejectMutation(async (overlay, fixture) => {
    const evidence = firstEvidence(overlay);
    const review = evidence.blind_solve_review;
    const root = join(fixture.repositoryRoot, review.receipt_artifact.artifact_path);
    const manifestPath = join(root, 'receipt-manifest.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    manifest.entries.push(clone(manifest.entries[0]));
    manifest.receipt_count = manifest.entries.length;
    const key = fixture.receiptKeyByJobId.get(evidence.job_id);
    const written = await writeJson(manifestPath, manifest);
    await writeSignature(join(root, 'receipt-manifest.sig'), written.bytes, key.privateKey);
    review.receipt_artifact = await artifactDescriptor(
      fixture.repositoryRoot,
      review.receipt_artifact.artifact_path,
      ARTIFACT_LIMITS.receipt_log,
    );
  }, /sequence must be contiguous|duplicates/);
  await rejectMutation(async (overlay, fixture) => {
    const evidence = firstEvidence(overlay);
    const descriptor = evidence.rights_and_originality_review.signed_evidence.rights_report;
    const assignment = assignmentForSlot(
      overlay,
      evidence.rights_and_originality_review.reviewer_slot_id,
    );
    const key = keyForAssignment(fixture.keyByIdentity, assignment);
    const oversized = {
      padding: 'x'.repeat(ARTIFACT_LIMITS.report.max_file_bytes + 1),
    };
    const bytes = Buffer.from(JSON.stringify(oversized));
    descriptor.report_sha256 = await writeBytes(
      join(fixture.repositoryRoot, descriptor.report_path),
      bytes,
    );
    const signature = await writeSignature(
      join(fixture.repositoryRoot, descriptor.report_signature_path),
      bytes,
      key.privateKey,
    );
    descriptor.report_signature_sha256 = signature.sha256;
  }, /exceeds per-file byte limit/);
  await rejectMutation(async (overlay, fixture) => {
    const evidence = firstEvidence(overlay);
    const descriptor = evidence.rights_and_originality_review.signed_evidence.rights_report;
    const assignment = assignmentForSlot(
      overlay,
      evidence.rights_and_originality_review.reviewer_slot_id,
    );
    await mutateSignedReport(
      descriptor,
      fixture,
      keyForAssignment(fixture.keyByIdentity, assignment),
      (report) => {
        let nested = {};
        report.excessive_nesting = nested;
        for (let index = 0; index < ARTIFACT_LIMITS.report.max_json_depth + 2; index += 1) {
          nested.child = {};
          nested = nested.child;
        }
      },
    );
  }, /exceeds JSON nesting limit/);
  const boundedRoot = await mkdtemp(join(tmpdir(), 'v3-resource-bounds-'));
  try {
    await writeBytes(join(boundedRoot, 'artifact', 'a.txt'), Buffer.from('123456'));
    await writeBytes(join(boundedRoot, 'artifact', 'b.txt'), Buffer.from('123456'));
    const baseLimits = {
      max_file_bytes: 10,
      max_json_collection_entries: 10,
      max_json_depth: 4,
      max_json_string_bytes: 10,
      max_regular_file_count: 10,
      max_total_bytes: 10,
    };
    await assert.rejects(
      hashArtifactDirectory({
        artifactPath: 'artifact',
        label: 'total-byte-limited fixture',
        limits: baseLimits,
        repositoryRoot: boundedRoot,
      }),
      /exceeds total byte limit/,
    );
    await assert.rejects(
      hashArtifactDirectory({
        artifactPath: 'artifact',
        label: 'file-count-limited fixture',
        limits: {
          ...baseLimits,
          max_regular_file_count: 1,
          max_total_bytes: 100,
        },
        repositoryRoot: boundedRoot,
      }),
      /exceeds regular-file count limit/,
    );
  } finally {
    await rm(boundedRoot, { force: true, recursive: true });
  }
});

test('stale pins, omitted mandatory roles/evidence, source dates, and findings remain blocked', async () => {
  await rejectMutation(async (overlay) => {
    overlay.source_plan.sha256 = '0'.repeat(64);
  }, /source-plan SHA-256 is stale/);
  await rejectMutation(async (overlay) => {
    const authors = overlay.assignments.filter((assignment) => assignment.role === 'LESSON_AUTHOR');
    authors[1].assignee_person_id = authors[0].assignee_person_id;
    authors[1].assignee_run_id = authors[0].assignee_run_id;
  }, /Every author run must own exactly one lesson|Author person IDs must be unique/);
  await rejectMutation(async (overlay) => {
    firstEvidence(overlay).rights_and_originality_review.signed_evidence = null;
  }, /must be an object|Cannot read properties/);
  await rejectMutation(async (overlay) => {
    const carsEvidence = overlay.job_evidence.find(
      (evidence) => jobById.get(evidence.job_id).domain_bucket === 'CARS',
    );
    carsEvidence.domain_scientific_review.cars_passage_subject_record = null;
  }, /lacks CARS passage-subject review evidence/);
  await rejectMutation(async (overlay) => {
    firstEvidence(overlay).source_ledger.entries[0].access_date = '2026-07-24';
    firstEvidence(overlay).source_ledger.ledger_sha256 = computeSourceLedgerSha256(
      firstEvidence(overlay).source_ledger,
    );
  }, /may not be later than overlay materialization/);
  await rejectMutation(async (overlay) => {
    firstEvidence(overlay).source_ledger.entries[0].access_date = '2026-02-30';
    firstEvidence(overlay).source_ledger.ledger_sha256 = computeSourceLedgerSha256(
      firstEvidence(overlay).source_ledger,
    );
  }, /must be a real calendar date/);
  await rejectMutation(async (overlay) => {
    const entry = firstEvidence(overlay).source_ledger.entries[0];
    entry.copied_expressive_prose_allowed = true;
    firstEvidence(overlay).source_ledger.ledger_sha256 = computeSourceLedgerSha256(
      firstEvidence(overlay).source_ledger,
    );
  }, /may not permit copied expressive prose/);
  await rejectMutation(async (overlay) => {
    const entry = firstEvidence(overlay).source_ledger.entries[0];
    entry.model_processing_rights.status = 'HUMAN_REVIEW_ONLY_NOT_MODEL_INPUT';
    entry.provided_to_author_model = true;
    firstEvidence(overlay).source_ledger.ledger_sha256 = computeSourceLedgerSha256(
      firstEvidence(overlay).source_ledger,
    );
  }, /cannot be supplied to an author model/);
  await rejectMutation(async (overlay) => {
    overlay.findings.push({
      containment: null,
      due_date: null,
      finding_id: 'FINDING-P1',
      job_id: null,
      owner_person_id: null,
      publication_blocked: true,
      severity: 'P1',
      status: 'OPEN',
      summary: 'Unresolved integrity finding.',
    });
  }, /open P1 blocks internal integration/);
  await rejectMutation(async (overlay) => {
    overlay.findings.push({
      containment: null,
      due_date: null,
      finding_id: 'FINDING-P2',
      job_id: null,
      owner_person_id: null,
      publication_blocked: false,
      severity: 'P2',
      status: 'OPEN',
      summary: 'Bounded defect without containment metadata.',
    });
  }, /containment must be a string/);
});

test('a contained open P2 remains an internal-only publication block', async () => {
  await withFixture(async (fixture) => {
    fixture.overlay.findings.push({
      containment: 'Isolated from all publication candidates.',
      due_date: '2026-08-01',
      finding_id: 'FINDING-CONTAINED-P2',
      job_id: fixture.overlay.wave.job_ids[0],
      owner_person_id: 'PERSON-P2-OWNER',
      publication_blocked: true,
      severity: 'P2',
      status: 'OPEN',
      summary: 'Bounded internal-draft defect.',
    });
    const result = await validateFixture(fixture);
    assert.equal(result.open_p2_count, 1);
  });
});

test('qualified same-role reviewer reuse remains explicit and signature-bound', async () => {
  await withFixture(async (fixture) => {
    const assignments = fixture.overlay.assignments.filter(
      (assignment) => assignment.role === 'INDEPENDENT_CONTENT_PEDAGOGY_AUDITOR',
    );
    const [first, second] = assignments;
    const secondOriginalIdentity = {
      person_id: second.assignee_person_id,
      run_id: second.assignee_run_id,
    };
    second.assignee_person_id = first.assignee_person_id;
    second.assignee_run_id = first.assignee_run_id;
    fixture.overlay.reviewer_signing_credentials =
      fixture.overlay.reviewer_signing_credentials.filter(
        (credential) =>
          credential.identity.person_id !== secondOriginalIdentity.person_id ||
          credential.identity.run_id !== secondOriginalIdentity.run_id,
      );
    const secondEvidence = fixture.overlay.job_evidence.find(
      (evidence) => evidence.job_id === second.job_id,
    );
    const firstKey = keyForAssignment(fixture.keyByIdentity, first);
    secondEvidence.content_pedagogy_audit.report.signer_key_fingerprint = firstKey.fingerprint;
    await mutateSignedReport(
      secondEvidence.content_pedagogy_audit.report,
      fixture,
      firstKey,
      (report) => {
        report.report_author_identity = {
          person_id: first.assignee_person_id,
          run_id: first.assignee_run_id,
        };
        report.signing_key_fingerprint = firstKey.fingerprint;
      },
    );
    fixture.overlay.reviewer_reuse_declarations = [
      {
        job_ids: [first.job_id, second.job_id],
        qualification_evidence_ids: [
          ...new Set([...first.qualification_evidence_ids, ...second.qualification_evidence_ids]),
        ],
        rationale: 'Fixture-only qualified reuse for one independent role.',
        reviewer_person_id: first.assignee_person_id,
        role: first.role,
        slot_ids: [first.slot_id, second.slot_id],
      },
    ];
    await validateFixture(fixture);
  });
});

test('symlink escape, author/auditor reuse, and G11/G12 controls remain fail closed', async () => {
  const outside = await mkdtemp(join(tmpdir(), 'v3-outside-'));
  try {
    await rejectMutation(async (overlay, fixture) => {
      await symlink(outside, join(fixture.repositoryRoot, 'escape'));
      firstEvidence(overlay).blind_solve_bundle.bundle_path = 'escape';
    }, /resolves outside the real repository root/);
  } finally {
    await rm(outside, { force: true, recursive: true });
  }
  await rejectMutation(async (overlay) => {
    const author = overlay.assignments.find((assignment) => assignment.role === 'LESSON_AUTHOR');
    const auditor = overlay.assignments.find(
      (assignment) => assignment.role === 'INDEPENDENT_CONTENT_PEDAGOGY_AUDITOR',
    );
    auditor.assignee_person_id = author.assignee_person_id;
    auditor.assignee_run_id = author.assignee_run_id;
  }, /Wave author may not fill nonauthor slot/);
  await rejectMutation(async (overlay) => {
    firstEvidence(overlay).pending_publication_gates[0].status = 'APPROVED';
  }, /must remain explicitly pending/);
});
