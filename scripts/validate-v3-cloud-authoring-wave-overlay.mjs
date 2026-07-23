#!/usr/bin/env node

import assert from 'node:assert/strict';
import { lstat, mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { format } from 'prettier';

import { getAssignmentSlots, hashText } from './generate-v3-cloud-authoring-plan.mjs';
import {
  BUNDLE_FILES,
  CLOSED_BUNDLE_SCANNER_ID,
  CLOSED_BUNDLE_SCHEMA_VERSION,
  EXCLUDED_CONTENT_CLASSES,
  HASH_PATTERN,
  REQUIRED_BLIND_PATH_IDS,
  createClosedReviewBundleManifest,
  validateAndHashCandidateArtifact,
  validateAndHashClosedReviewBundle,
  validateHashedAttemptLog,
  validateHashedGateReport,
  validateHashedOpaqueServiceAttestation,
  validateHashedWaveSimilarityReport,
} from './v3-cloud-authoring-evidence-contract.mjs';

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_PLAN_PATH = 'curriculum/v3/v3-cloud-authoring-jobs.json';
const CHECKED_TEMPLATE_PATH =
  'curriculum/v3/v3-cloud-authoring-wave-assignment-overlay.template.json';
const OVERLAY_SCHEMA_VERSION = 'mcat-v3-cloud-authoring-wave-assignment-overlay-2';
const SOURCE_LEDGER_SCHEMA_VERSION = 'mcat-v3-authoring-source-ledger-1';
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const RFC3339_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/;
const IDENTITY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:@/+~-]*$/;
const ALLOWED_SOURCE_KINDS = new Set([
  'CURRENT_AUTHORITATIVE_OPEN_FACTUAL',
  'INDEPENDENT_EXPERT_FACTUAL_INPUT',
  'LICENSED_FACTUAL_REFERENCE',
  'OFFICIAL_OPEN_FACTUAL_REFERENCE',
]);
const MODEL_RIGHTS_STATUSES = new Set([
  'AUTHORIZED_FOR_MODEL_PROCESSING',
  'HUMAN_REVIEW_ONLY_NOT_MODEL_INPUT',
]);
const INTERNAL_INTEGRATION_GATE_IDS = Object.freeze([
  'G01_RELEASE_PIN_AND_REFERENCE_LINT',
  'G02_CANONICAL_SHELL_AND_KC_OWNERSHIP',
  'G03_LESSON_CONTRACT_COMPLETENESS',
  'G04_ATTACHMENTS_REPAIR_AND_NO_BYPASS',
]);

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sortedUnique(values) {
  return [...new Set(values)].sort(compareText);
}

function sortObjectKeys(value) {
  if (Array.isArray(value)) return value.map(sortObjectKeys);
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort(compareText)
      .map((key) => [key, sortObjectKeys(value[key])]),
  );
}

function requireNonemptyString(value, label, pattern = undefined) {
  assert.equal(typeof value, 'string', `${label} must be a string`);
  assert(value.trim().length > 0, `${label} must not be empty`);
  if (pattern) assert.match(value, pattern, `${label} has an invalid format`);
  return value;
}

function requireIdentity(identity, label) {
  assert(identity && typeof identity === 'object', `${label} is required`);
  requireNonemptyString(identity.person_id, `${label}.person_id`, IDENTITY_PATTERN);
  requireNonemptyString(identity.run_id, `${label}.run_id`, IDENTITY_PATTERN);
  return identity;
}

function sameIdentity(left, right) {
  return left.person_id === right.person_id || left.run_id === right.run_id;
}

function makePlanPins(plan) {
  return {
    freeze_ids: plan.metadata.registry.freeze_ids,
    plan_schema_version: plan.schema_version,
    registry_artifact_id: plan.metadata.registry.artifact_id,
    registry_sha256: plan.metadata.registry.sha256,
    source_manifest_sha256: plan.metadata.source_manifest_sha256,
  };
}

function expectedAssignmentsForWave(plan, wave) {
  const jobById = new Map(plan.jobs.map((job) => [job.job_id, job]));
  return wave.job_ids.flatMap((jobId) => {
    const job = jobById.get(jobId);
    assert(job, `Wave ${wave.wave_id} references missing job ${jobId}`);
    return getAssignmentSlots(job).map((slot) => ({
      job_id: job.job_id,
      lesson_id: job.lesson_id,
      role: slot.role,
      slot_id: slot.slot_id,
      specialty: slot.specialty ?? null,
    }));
  });
}

function createBundleEvidenceTemplate(job, wave, bundleKind, sourcePlanSha256) {
  const recipientSlot =
    bundleKind === 'BLIND_SOLVE'
      ? job.assignments.blind_solver
      : job.assignments.accessibility_technical_auditor;
  return {
    bundle_kind: bundleKind,
    bundle_path: null,
    bundle_sha256: null,
    distribution: {
      author_branch_provided: false,
      channel: 'SANITIZED_ARTIFACT',
      key_bearing_artifacts_provided: false,
      recipient_slot_id: recipientSlot.slot_id,
      ref: null,
    },
    protected_field_scan: {
      bundle_sha256: null,
      passed: null,
      report_sha256: null,
      scanned_file_count: null,
      scanner_id: CLOSED_BUNDLE_SCANNER_ID,
    },
    reviewed_candidate_sha256: null,
    source_plan_sha256: sourcePlanSha256,
    wave_id: wave.wave_id,
  };
}

function createGateEvidenceTemplate({ gateId, job, reviewerSlotId, sourcePlanSha256, wave }) {
  return {
    approved: null,
    candidate_sha256: null,
    gate_id: gateId,
    job_id: job.job_id,
    lesson_id: job.lesson_id,
    report_path: null,
    report_sha256: null,
    reviewed_artifact_sha256: null,
    reviewer_slot_id: reviewerSlotId,
    source_plan_sha256: sourcePlanSha256,
    wave_id: wave.wave_id,
  };
}

function createWaveAssignmentOverlayTemplate(plan, sourcePlanSha256, waveId) {
  requireNonemptyString(sourcePlanSha256, 'source plan SHA-256', HASH_PATTERN);
  const wave = plan.waves.find((candidate) => candidate.wave_id === waveId);
  assert(wave, `Unknown authoring wave: ${waveId}`);
  const jobById = new Map(plan.jobs.map((job) => [job.job_id, job]));
  const assignments = expectedAssignmentsForWave(plan, wave).map((assignment) => ({
    ...assignment,
    assignee_person_id: null,
    assignee_run_id: null,
    qualification_evidence_ids: [],
    selected_passage_subject: null,
  }));
  const jobEvidence = wave.job_ids.map((jobId) => {
    const job = jobById.get(jobId);
    assert(job);
    return {
      accessibility_review_bundle: createBundleEvidenceTemplate(
        job,
        wave,
        'ACCESSIBILITY_ONLY',
        sourcePlanSha256,
      ),
      accessibility_technical_review: createGateEvidenceTemplate({
        gateId: 'G08_ACCESSIBILITY_TECHNICAL_AUDIT',
        job,
        reviewerSlotId: job.assignments.accessibility_technical_auditor.slot_id,
        sourcePlanSha256,
        wave,
      }),
      blind_solve_review: {
        approval_evidence: createGateEvidenceTemplate({
          gateId: 'G07_INDEPENDENT_BLIND_SOLVE',
          job,
          reviewerSlotId: job.assignments.blind_solver.slot_id,
          sourcePlanSha256,
          wave,
        }),
        approved: null,
        attempt_log_path: null,
        attempt_log_sha256: null,
        candidate_sha256: null,
        job_id: job.job_id,
        lesson_id: job.lesson_id,
        opaque_scoring_service: {
          accepts_real_submitted_responses: true,
          acl_branch_isolation_attestation_path: null,
          acl_branch_isolation_attestation_sha256: null,
          deployment_ref: null,
          ephemeral: true,
          exact_key_bearing_candidate_deployed: true,
          ordinary_learner_authorized_feedback_only: true,
          outcome_override_controls_exposed: false,
          protected_scoring_material_exposed: false,
          rationales_before_response_exposed: false,
          server_definition_exposed: false,
          service_deployment_artifact_sha256: null,
          source_branch_exposed: false,
        },
        required_path_coverage: [...REQUIRED_BLIND_PATH_IDS],
        safe_client_sha256: null,
        solver_recipient_identity: {
          person_id: null,
          run_id: null,
        },
        source_plan_sha256: sourcePlanSha256,
        wave_id: wave.wave_id,
      },
      blind_solve_bundle: createBundleEvidenceTemplate(job, wave, 'BLIND_SOLVE', sourcePlanSha256),
      candidate_artifact: {
        artifact_path: null,
        candidate_sha256: null,
        file_manifest: [],
        job_id: job.job_id,
        lesson_id: job.lesson_id,
        source_plan_sha256: sourcePlanSha256,
        wave_id: wave.wave_id,
      },
      canonical_runtime_content_gate_reports: INTERNAL_INTEGRATION_GATE_IDS.map((gateId) =>
        createGateEvidenceTemplate({
          gateId,
          job,
          reviewerSlotId: job.assignments.release_integrator.slot_id,
          sourcePlanSha256,
          wave,
        }),
      ),
      content_pedagogy_audit: createGateEvidenceTemplate({
        gateId: 'G06_INDEPENDENT_CONTENT_PEDAGOGY_AUDIT',
        job,
        reviewerSlotId: job.assignments.content_pedagogy_auditor.slot_id,
        sourcePlanSha256,
        wave,
      }),
      domain_scientific_review: {
        candidate_sha256: null,
        cars_passage_subject_record:
          job.domain_bucket === 'CARS'
            ? {
                approved: null,
                candidate_sha256: null,
                review_record_sha256: null,
                reviewer_slot_id: job.assignments.cars_passage_subject_fact_checker.slot_id,
                selected_passage_subject: null,
              }
            : null,
        gate_id: 'G10_DOMAIN_FACT_CHECK_AND_SCIENTIFIC_REVIEW',
        job_id: job.job_id,
        lesson_id: job.lesson_id,
        reviewed_candidate_sha256: null,
        source_plan_sha256: sourcePlanSha256,
        specialty_records: job.assignments.domain_scientific_fact_checkers.map((slot) => ({
          approved: null,
          candidate_sha256: null,
          review_record_sha256: null,
          reviewer_slot_id: slot.slot_id,
          specialty: slot.specialty,
        })),
        wave_id: wave.wave_id,
      },
      job_id: job.job_id,
      lesson_id: job.lesson_id,
      pending_publication_gates: [
        { gate_id: 'G11_EXACT_REVIEWED_CONTENT_HASH', status: 'PENDING' },
        { gate_id: 'G12_EFFICACY_AND_PUBLICATION_APPROVAL', status: 'PENDING' },
      ],
      rights_and_originality_review: {
        candidate_sha256: null,
        gate_id: 'G05_CLEAN_ROOM_RIGHTS_AND_ORIGINALITY',
        input_rights_approved: null,
        job_id: job.job_id,
        lesson_id: job.lesson_id,
        output_rights_and_originality_approved: null,
        review_record_sha256: null,
        reviewed_candidate_sha256: null,
        reviewer_slot_id: job.assignments.input_output_rights_reviewer.slot_id,
        source_ledger_sha256: null,
        source_output_similarity_report_sha256: null,
        source_plan_sha256: sourcePlanSha256,
        wave_id: wave.wave_id,
      },
      selected_original_passage_subject: null,
      source_ledger: {
        entries: [
          {
            access_date: null,
            copied_expressive_prose_allowed: false,
            factual_use_only: true,
            license_or_terms: null,
            model_processing_rights: {
              basis: null,
              status: null,
            },
            provided_to_author_model: null,
            retrieved_content_sha256: null,
            rights_review_slot_id: job.assignments.input_output_rights_reviewer.slot_id,
            source_ceiling: null,
            source_id: null,
            source_kind: null,
            title: null,
            url: null,
          },
        ],
        job_id: job.job_id,
        ledger_id: `${wave.wave_id}::SOURCE_LEDGER::${job.lesson_id}`,
        ledger_sha256: null,
        rights_reviewer_slot_id: job.assignments.input_output_rights_reviewer.slot_id,
        schema_version: SOURCE_LEDGER_SCHEMA_VERSION,
      },
    };
  });

  return sortObjectKeys({
    assignments,
    controller_identity: {
      person_id: null,
      run_id: null,
    },
    findings: [],
    job_evidence: jobEvidence,
    materialization_status: 'TEMPLATE_UNMATERIALIZED',
    materialized_at: null,
    overlay_id: null,
    plan_pins: makePlanPins(plan),
    reviewer_reuse_declarations: [],
    schema_version: OVERLAY_SCHEMA_VERSION,
    source_plan: {
      path: SOURCE_PLAN_PATH,
      sha256: sourcePlanSha256,
    },
    validation_target: 'INTERNAL_DRAFT_INTEGRATION',
    wave: {
      job_ids: wave.job_ids,
      lesson_ids: wave.lesson_ids,
      wave_id: wave.wave_id,
      wave_ordinal: wave.wave_ordinal,
    },
    wave_similarity_review: {
      approved: null,
      candidate_bindings: wave.job_ids.map((jobId) => ({
        candidate_sha256: null,
        job_id: jobId,
      })),
      comparison_wave_ids: wave.similarity_comparison_wave_ids,
      gate_id: 'G09_CROSS_LESSON_SIMILARITY_AUDIT',
      report_path: null,
      report_sha256: null,
      reviewer_slot_ids: wave.job_ids.map(
        (jobId) => jobById.get(jobId).assignments.similarity_auditor.slot_id,
      ),
      source_plan_sha256: sourcePlanSha256,
      wave_id: wave.wave_id,
    },
    wave_integrator_identity: {
      person_id: null,
      run_id: null,
    },
  });
}

function sourceLedgerPayload(ledger) {
  return sortObjectKeys({
    entries: ledger.entries,
    job_id: ledger.job_id,
    ledger_id: ledger.ledger_id,
    rights_reviewer_slot_id: ledger.rights_reviewer_slot_id,
    schema_version: ledger.schema_version,
  });
}

function computeSourceLedgerSha256(ledger) {
  return hashText(JSON.stringify(sourceLedgerPayload(ledger)));
}

function createSanitizedReviewBundleManifest({
  bundleKind,
  jobId,
  lessonId,
  reviewedCandidateSha256,
  sourcePlanSha256,
  waveId,
}) {
  return sortObjectKeys(
    createClosedReviewBundleManifest({
      bundleKind,
      jobId,
      lessonId,
      reviewedCandidateSha256,
      sourcePlanSha256,
      waveId,
    }),
  );
}

function validateSourceAccessDate(value, materializedAt, label) {
  requireNonemptyString(value, label, ISO_DATE_PATTERN);
  const parsed = new Date(`${value}T00:00:00.000Z`);
  assert.equal(Number.isNaN(parsed.valueOf()), false, `${label} must be a real calendar date`);
  assert.equal(parsed.toISOString().slice(0, 10), value, `${label} must be a real calendar date`);
  assert(
    parsed.valueOf() <= materializedAt.valueOf(),
    `${label} may not be later than overlay materialization`,
  );
}

function parseMaterializedAt(value) {
  requireNonemptyString(value, 'materialized_at', RFC3339_PATTERN);
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?Z$/.exec(value);
  assert(match);
  const parsed = new Date(value);
  assert.equal(
    Number.isNaN(parsed.valueOf()),
    false,
    'materialized_at must be a real RFC 3339 instant',
  );
  assert.deepEqual(
    [
      parsed.getUTCFullYear(),
      parsed.getUTCMonth() + 1,
      parsed.getUTCDate(),
      parsed.getUTCHours(),
      parsed.getUTCMinutes(),
      parsed.getUTCSeconds(),
    ],
    match.slice(1, 7).map(Number),
    'materialized_at must be a real RFC 3339 instant',
  );
  return parsed;
}

function validateSourceLedger(ledger, job, assignmentBySlotId, materializedAt) {
  assert.equal(ledger.schema_version, SOURCE_LEDGER_SCHEMA_VERSION);
  assert.equal(ledger.job_id, job.job_id);
  requireNonemptyString(ledger.ledger_id, `${job.job_id} source ledger ID`);
  assert.equal(
    ledger.rights_reviewer_slot_id,
    job.assignments.input_output_rights_reviewer.slot_id,
  );
  assert(assignmentBySlotId.has(ledger.rights_reviewer_slot_id));
  assert(
    Array.isArray(ledger.entries) && ledger.entries.length > 0,
    `${job.job_id} source ledger is empty`,
  );
  const sourceIds = new Set();
  for (const entry of ledger.entries) {
    requireNonemptyString(entry.source_id, `${job.job_id} source ID`, IDENTITY_PATTERN);
    assert(!sourceIds.has(entry.source_id), `${job.job_id} duplicates source ${entry.source_id}`);
    sourceIds.add(entry.source_id);
    assert(
      ALLOWED_SOURCE_KINDS.has(entry.source_kind),
      `${entry.source_id} source kind is invalid`,
    );
    requireNonemptyString(entry.title, `${entry.source_id} title`);
    const url = new URL(requireNonemptyString(entry.url, `${entry.source_id} URL`));
    assert.equal(url.protocol, 'https:', `${entry.source_id} URL must use HTTPS`);
    validateSourceAccessDate(entry.access_date, materializedAt, `${entry.source_id} access date`);
    requireNonemptyString(entry.license_or_terms, `${entry.source_id} license or terms`);
    assert(
      entry.model_processing_rights && typeof entry.model_processing_rights === 'object',
      `${entry.source_id} model-processing rights are required`,
    );
    assert(
      MODEL_RIGHTS_STATUSES.has(entry.model_processing_rights.status),
      `${entry.source_id} model-processing rights status is invalid`,
    );
    requireNonemptyString(
      entry.model_processing_rights.basis,
      `${entry.source_id} model-processing rights basis`,
    );
    assert.equal(typeof entry.provided_to_author_model, 'boolean');
    if (entry.provided_to_author_model) {
      assert.equal(
        entry.model_processing_rights.status,
        'AUTHORIZED_FOR_MODEL_PROCESSING',
        `${entry.source_id} cannot be supplied to an author model`,
      );
    }
    requireNonemptyString(entry.source_ceiling, `${entry.source_id} source ceiling`);
    requireNonemptyString(
      entry.retrieved_content_sha256,
      `${entry.source_id} retrieval SHA-256`,
      HASH_PATTERN,
    );
    assert.equal(entry.factual_use_only, true, `${entry.source_id} must be factual-use-only`);
    assert.equal(
      entry.copied_expressive_prose_allowed,
      false,
      `${entry.source_id} may not permit copied expressive prose`,
    );
    assert.equal(entry.rights_review_slot_id, ledger.rights_reviewer_slot_id);
  }
  requireNonemptyString(ledger.ledger_sha256, `${job.job_id} ledger SHA-256`, HASH_PATTERN);
  assert.equal(
    ledger.ledger_sha256,
    computeSourceLedgerSha256(ledger),
    `${job.job_id} source ledger hash is stale`,
  );
}

function validateRightsAndDomainEvidence(
  evidence,
  job,
  assignmentBySlotId,
  candidateSha256,
  sourcePlanSha256,
  wave,
) {
  const rightsReview = evidence.rights_and_originality_review;
  assert(
    rightsReview && typeof rightsReview === 'object',
    `${job.job_id} lacks rights/originality evidence`,
  );
  assert.equal(rightsReview.gate_id, 'G05_CLEAN_ROOM_RIGHTS_AND_ORIGINALITY');
  assert.equal(rightsReview.source_plan_sha256, sourcePlanSha256);
  assert.equal(rightsReview.wave_id, wave.wave_id);
  assert.equal(rightsReview.job_id, job.job_id);
  assert.equal(rightsReview.lesson_id, job.lesson_id);
  assert.equal(rightsReview.candidate_sha256, candidateSha256);
  assert.equal(rightsReview.reviewer_slot_id, job.assignments.input_output_rights_reviewer.slot_id);
  assert(assignmentBySlotId.has(rightsReview.reviewer_slot_id));
  assert.equal(rightsReview.input_rights_approved, true);
  assert.equal(rightsReview.output_rights_and_originality_approved, true);
  assert.equal(rightsReview.source_ledger_sha256, evidence.source_ledger.ledger_sha256);
  requireNonemptyString(
    rightsReview.reviewed_candidate_sha256,
    `${job.job_id} rights-reviewed candidate SHA-256`,
    HASH_PATTERN,
  );
  assert.equal(rightsReview.reviewed_candidate_sha256, candidateSha256);
  requireNonemptyString(
    rightsReview.source_output_similarity_report_sha256,
    `${job.job_id} source-output similarity report SHA-256`,
    HASH_PATTERN,
  );
  requireNonemptyString(
    rightsReview.review_record_sha256,
    `${job.job_id} rights review record SHA-256`,
    HASH_PATTERN,
  );

  const domainReview = evidence.domain_scientific_review;
  assert(
    domainReview && typeof domainReview === 'object',
    `${job.job_id} lacks domain/scientific evidence`,
  );
  assert.equal(domainReview.gate_id, 'G10_DOMAIN_FACT_CHECK_AND_SCIENTIFIC_REVIEW');
  assert.equal(domainReview.source_plan_sha256, sourcePlanSha256);
  assert.equal(domainReview.wave_id, wave.wave_id);
  assert.equal(domainReview.job_id, job.job_id);
  assert.equal(domainReview.lesson_id, job.lesson_id);
  assert.equal(domainReview.candidate_sha256, candidateSha256);
  assert.equal(
    domainReview.reviewed_candidate_sha256,
    rightsReview.reviewed_candidate_sha256,
    `${job.job_id} rights and domain reviews must bind the same candidate`,
  );
  assert.equal(
    domainReview.specialty_records.length,
    job.assignments.domain_scientific_fact_checkers.length,
  );
  const recordBySlotId = new Map();
  for (const record of domainReview.specialty_records) {
    assert(
      !recordBySlotId.has(record.reviewer_slot_id),
      `${job.job_id} duplicates a specialty review record`,
    );
    recordBySlotId.set(record.reviewer_slot_id, record);
  }
  for (const slot of job.assignments.domain_scientific_fact_checkers) {
    const record = recordBySlotId.get(slot.slot_id);
    assert(record, `${job.job_id} lacks domain review for ${slot.specialty}`);
    assert(assignmentBySlotId.has(slot.slot_id));
    assert.equal(record.specialty, slot.specialty);
    assert.equal(record.candidate_sha256, candidateSha256);
    assert.equal(record.approved, true);
    requireNonemptyString(
      record.review_record_sha256,
      `${job.job_id} ${slot.specialty} review SHA-256`,
      HASH_PATTERN,
    );
  }
  if (job.domain_bucket === 'CARS') {
    const subjectRecord = domainReview.cars_passage_subject_record;
    assert(subjectRecord, `${job.job_id} lacks CARS passage-subject review evidence`);
    assert.equal(
      subjectRecord.reviewer_slot_id,
      job.assignments.cars_passage_subject_fact_checker.slot_id,
    );
    assert(assignmentBySlotId.has(subjectRecord.reviewer_slot_id));
    assert.equal(
      subjectRecord.selected_passage_subject,
      evidence.selected_original_passage_subject,
    );
    assert.equal(subjectRecord.candidate_sha256, candidateSha256);
    assert.equal(subjectRecord.approved, true);
    requireNonemptyString(
      subjectRecord.review_record_sha256,
      `${job.job_id} CARS passage-subject review SHA-256`,
      HASH_PATTERN,
    );
  } else {
    assert.equal(domainReview.cars_passage_subject_record, null);
  }
}

async function validateReviewBundle(
  bundle,
  { bundleKind, job, repositoryRoot, reviewedCandidateSha256, sourcePlanSha256, wave },
) {
  assert.equal(bundle.bundle_kind, bundleKind);
  assert.equal(bundle.reviewed_candidate_sha256, reviewedCandidateSha256);
  assert.equal(bundle.source_plan_sha256, sourcePlanSha256);
  assert.equal(bundle.wave_id, wave.wave_id);
  const expectedRecipientSlotId =
    bundleKind === 'BLIND_SOLVE'
      ? job.assignments.blind_solver.slot_id
      : job.assignments.accessibility_technical_auditor.slot_id;
  assert.equal(bundle.distribution.recipient_slot_id, expectedRecipientSlotId);
  assert(
    bundle.distribution.channel === 'SANITIZED_ARTIFACT' ||
      bundle.distribution.channel === 'DEDICATED_SANITIZED_BRANCH',
    `${job.job_id} ${bundleKind} distribution channel is not sanitized`,
  );
  requireNonemptyString(bundle.distribution.ref, `${job.job_id} ${bundleKind} distribution ref`);
  assert.equal(bundle.distribution.author_branch_provided, false);
  assert.equal(bundle.distribution.key_bearing_artifacts_provided, false);
  const scan = await validateAndHashClosedReviewBundle({
    bundleKind,
    bundlePath: bundle.bundle_path,
    jobId: job.job_id,
    lessonId: job.lesson_id,
    repositoryRoot,
    reviewedCandidateSha256,
    sourcePlanSha256,
    waveId: wave.wave_id,
  });
  requireNonemptyString(bundle.bundle_sha256, `${job.job_id} ${bundleKind} SHA-256`, HASH_PATTERN);
  assert.equal(bundle.bundle_sha256, scan.bundle_sha256);
  assert.equal(bundle.protected_field_scan.scanner_id, CLOSED_BUNDLE_SCANNER_ID);
  assert.equal(bundle.protected_field_scan.passed, true);
  assert.equal(bundle.protected_field_scan.bundle_sha256, scan.bundle_sha256);
  assert.equal(bundle.protected_field_scan.report_sha256, scan.report_sha256);
  assert.equal(bundle.protected_field_scan.scanned_file_count, scan.files.length);
  return scan;
}

function assertGateEvidencePins(
  evidence,
  { candidateSha256, gateId, job, reviewerSlotId, sourcePlanSha256, wave },
) {
  assert.equal(evidence.gate_id, gateId);
  assert.equal(evidence.source_plan_sha256, sourcePlanSha256);
  assert.equal(evidence.wave_id, wave.wave_id);
  assert.equal(evidence.job_id, job.job_id);
  assert.equal(evidence.lesson_id, job.lesson_id);
  assert.equal(evidence.candidate_sha256, candidateSha256);
  assert.equal(evidence.reviewer_slot_id, reviewerSlotId);
  assert.equal(evidence.approved, true);
  requireNonemptyString(evidence.report_path, `${job.job_id} ${gateId} report path`);
  requireNonemptyString(
    evidence.report_sha256,
    `${job.job_id} ${gateId} report SHA-256`,
    HASH_PATTERN,
  );
  requireNonemptyString(
    evidence.reviewed_artifact_sha256,
    `${job.job_id} ${gateId} reviewed artifact SHA-256`,
    HASH_PATTERN,
  );
}

async function validateGateEvidence(
  evidence,
  {
    candidateSha256,
    gateId,
    job,
    repositoryRoot,
    reviewedArtifactSha256,
    reviewerSlotId,
    sourcePlanSha256,
    wave,
  },
) {
  assertGateEvidencePins(evidence, {
    candidateSha256,
    gateId,
    job,
    reviewerSlotId,
    sourcePlanSha256,
    wave,
  });
  assert.equal(evidence.reviewed_artifact_sha256, reviewedArtifactSha256);
  await validateHashedGateReport({
    candidateSha256,
    descriptor: evidence,
    gateId,
    jobId: job.job_id,
    lessonId: job.lesson_id,
    repositoryRoot,
    reviewedArtifactSha256,
    sourcePlanSha256,
    waveId: wave.wave_id,
  });
}

async function validateCandidateArtifactEvidence(
  candidate,
  { job, repositoryRoot, sourcePlanSha256, wave },
) {
  assert.equal(candidate.source_plan_sha256, sourcePlanSha256);
  assert.equal(candidate.wave_id, wave.wave_id);
  assert.equal(candidate.job_id, job.job_id);
  assert.equal(candidate.lesson_id, job.lesson_id);
  requireNonemptyString(candidate.artifact_path, `${job.job_id} candidate artifact path`);
  requireNonemptyString(
    candidate.candidate_sha256,
    `${job.job_id} candidate SHA-256`,
    HASH_PATTERN,
  );
  assert(Array.isArray(candidate.file_manifest) && candidate.file_manifest.length > 1);
  return validateAndHashCandidateArtifact({
    artifactPath: candidate.artifact_path,
    expectedFileManifest: candidate.file_manifest,
    expectedSha256: candidate.candidate_sha256,
    jobId: job.job_id,
    lessonId: job.lesson_id,
    repositoryRoot,
    sourcePlanSha256,
    waveId: wave.wave_id,
  });
}

function assertArtifactIsolation(candidateRealPath, safeClientRealPath, label) {
  assert.notEqual(
    candidateRealPath,
    safeClientRealPath,
    `${label} may not be the candidate artifact`,
  );
  assert(
    !safeClientRealPath.startsWith(`${candidateRealPath}${sep}`) &&
      !candidateRealPath.startsWith(`${safeClientRealPath}${sep}`),
    `${label} and candidate artifact must be isolated directories`,
  );
}

async function validateBlindSolveReview(
  review,
  {
    assignmentBySlotId,
    candidateScan,
    job,
    repositoryRoot,
    safeClientScan,
    sourcePlanSha256,
    wave,
    waveIntegratorIdentity,
  },
) {
  const candidateSha256 = candidateScan.artifact_sha256;
  assert.equal(review.source_plan_sha256, sourcePlanSha256);
  assert.equal(review.wave_id, wave.wave_id);
  assert.equal(review.job_id, job.job_id);
  assert.equal(review.lesson_id, job.lesson_id);
  assert.equal(review.candidate_sha256, candidateSha256);
  assert.equal(review.safe_client_sha256, safeClientScan.bundle_sha256);
  assert.equal(review.approved, true);
  assert.deepEqual(review.required_path_coverage, [...REQUIRED_BLIND_PATH_IDS]);
  const solverAssignment = assignmentBySlotId.get(job.assignments.blind_solver.slot_id);
  assert(solverAssignment);
  const solverIdentity = {
    person_id: solverAssignment.assignee_person_id,
    run_id: solverAssignment.assignee_run_id,
  };
  assert.deepEqual(review.solver_recipient_identity, solverIdentity);

  const service = review.opaque_scoring_service;
  requireNonemptyString(service.deployment_ref, `${job.job_id} opaque service deployment ref`);
  requireNonemptyString(
    service.service_deployment_artifact_sha256,
    `${job.job_id} opaque service deployment artifact SHA-256`,
    HASH_PATTERN,
  );
  assert.equal(service.ephemeral, true);
  assert.equal(service.exact_key_bearing_candidate_deployed, true);
  assert.equal(service.accepts_real_submitted_responses, true);
  assert.equal(service.ordinary_learner_authorized_feedback_only, true);
  assert.equal(service.source_branch_exposed, false);
  assert.equal(service.server_definition_exposed, false);
  assert.equal(service.protected_scoring_material_exposed, false);
  assert.equal(service.rationales_before_response_exposed, false);
  assert.equal(service.outcome_override_controls_exposed, false);
  requireNonemptyString(
    service.acl_branch_isolation_attestation_path,
    `${job.job_id} opaque service ACL attestation path`,
  );
  requireNonemptyString(
    service.acl_branch_isolation_attestation_sha256,
    `${job.job_id} opaque service ACL attestation SHA-256`,
    HASH_PATTERN,
  );
  await validateHashedOpaqueServiceAttestation({
    attestationPath: service.acl_branch_isolation_attestation_path,
    attestationSha256: service.acl_branch_isolation_attestation_sha256,
    candidateSha256,
    integratorIdentity: waveIntegratorIdentity,
    jobId: job.job_id,
    lessonId: job.lesson_id,
    repositoryRoot,
    safeClientSha256: safeClientScan.bundle_sha256,
    serviceDeploymentArtifactSha256: service.service_deployment_artifact_sha256,
    solverIdentity,
    sourcePlanSha256,
    waveId: wave.wave_id,
  });
  requireNonemptyString(review.attempt_log_path, `${job.job_id} blind attempt log path`);
  requireNonemptyString(
    review.attempt_log_sha256,
    `${job.job_id} blind attempt log SHA-256`,
    HASH_PATTERN,
  );
  await validateHashedAttemptLog({
    attemptLogPath: review.attempt_log_path,
    attemptLogSha256: review.attempt_log_sha256,
    candidateSha256,
    jobId: job.job_id,
    lessonId: job.lesson_id,
    repositoryRoot,
    safeClientSha256: safeClientScan.bundle_sha256,
    serviceDeploymentArtifactSha256: service.service_deployment_artifact_sha256,
    solverIdentity,
    sourcePlanSha256,
    waveId: wave.wave_id,
  });
  await validateGateEvidence(review.approval_evidence, {
    candidateSha256,
    gateId: 'G07_INDEPENDENT_BLIND_SOLVE',
    job,
    repositoryRoot,
    reviewedArtifactSha256: safeClientScan.bundle_sha256,
    reviewerSlotId: job.assignments.blind_solver.slot_id,
    sourcePlanSha256,
    wave,
  });
  assertArtifactIsolation(
    candidateScan.real_path,
    safeClientScan.real_path,
    `${job.job_id} blind safe client`,
  );
}

function validatePendingPublicationGates(value, job) {
  assert.deepEqual(
    value,
    [
      { gate_id: 'G11_EXACT_REVIEWED_CONTENT_HASH', status: 'PENDING' },
      { gate_id: 'G12_EFFICACY_AND_PUBLICATION_APPROVAL', status: 'PENDING' },
    ],
    `${job.job_id} G11/G12 must remain explicitly pending for internal integration`,
  );
}

async function validateWaveSimilarityReview(
  review,
  { candidateShaByJobId, jobById, repositoryRoot, sourcePlanSha256, wave },
) {
  assert.equal(review.gate_id, 'G09_CROSS_LESSON_SIMILARITY_AUDIT');
  assert.equal(review.source_plan_sha256, sourcePlanSha256);
  assert.equal(review.wave_id, wave.wave_id);
  assert.equal(review.approved, true);
  const candidateBindings = wave.job_ids.map((jobId) => ({
    candidate_sha256: candidateShaByJobId.get(jobId),
    job_id: jobId,
  }));
  const reviewerSlotIds = wave.job_ids.map(
    (jobId) => jobById.get(jobId).assignments.similarity_auditor.slot_id,
  );
  assert.deepEqual(review.candidate_bindings, candidateBindings);
  assert.deepEqual(review.comparison_wave_ids, wave.similarity_comparison_wave_ids);
  assert.deepEqual(review.reviewer_slot_ids, reviewerSlotIds);
  requireNonemptyString(review.report_path, `${wave.wave_id} similarity report path`);
  requireNonemptyString(
    review.report_sha256,
    `${wave.wave_id} similarity report SHA-256`,
    HASH_PATTERN,
  );
  await validateHashedWaveSimilarityReport({
    candidateBindings,
    comparisonWaveIds: wave.similarity_comparison_wave_ids,
    reportPath: review.report_path,
    reportSha256: review.report_sha256,
    repositoryRoot,
    reviewerSlotIds,
    sourcePlanSha256,
    waveId: wave.wave_id,
  });
}

function assignmentIdentity(assignment) {
  return {
    person_id: assignment.assignee_person_id,
    run_id: assignment.assignee_run_id,
  };
}

function validateAssignments(overlay, plan, wave) {
  const expectedAssignments = expectedAssignmentsForWave(plan, wave);
  assert.equal(
    overlay.assignments.length,
    expectedAssignments.length,
    'Every required assignment slot must be materialized exactly once',
  );
  const expectedBySlotId = new Map(
    expectedAssignments.map((assignment) => [assignment.slot_id, assignment]),
  );
  const assignmentBySlotId = new Map();
  for (const assignment of overlay.assignments) {
    requireNonemptyString(assignment.slot_id, 'assignment slot ID');
    assert(!assignmentBySlotId.has(assignment.slot_id), `Duplicate slot ${assignment.slot_id}`);
    const expected = expectedBySlotId.get(assignment.slot_id);
    assert(expected, `Unknown assignment slot ${assignment.slot_id}`);
    assert.equal(assignment.job_id, expected.job_id);
    assert.equal(assignment.lesson_id, expected.lesson_id);
    assert.equal(assignment.role, expected.role);
    assert.equal(assignment.specialty, expected.specialty);
    requireNonemptyString(
      assignment.assignee_person_id,
      `${assignment.slot_id} person ID`,
      IDENTITY_PATTERN,
    );
    requireNonemptyString(
      assignment.assignee_run_id,
      `${assignment.slot_id} run ID`,
      IDENTITY_PATTERN,
    );
    assert(
      Array.isArray(assignment.qualification_evidence_ids),
      `${assignment.slot_id} qualification evidence must be an array`,
    );
    assert.equal(
      new Set(assignment.qualification_evidence_ids).size,
      assignment.qualification_evidence_ids.length,
      `${assignment.slot_id} duplicates qualification evidence`,
    );
    for (const qualificationId of assignment.qualification_evidence_ids) {
      requireNonemptyString(
        qualificationId,
        `${assignment.slot_id} qualification evidence ID`,
        IDENTITY_PATTERN,
      );
    }
    if (assignment.role !== 'LESSON_AUTHOR') {
      assert(
        assignment.qualification_evidence_ids.length > 0,
        `${assignment.slot_id} lacks qualification evidence`,
      );
    }
    assignmentBySlotId.set(assignment.slot_id, assignment);
  }
  assert.deepEqual(new Set(assignmentBySlotId.keys()), new Set(expectedBySlotId.keys()));

  const jobById = new Map(plan.jobs.map((job) => [job.job_id, job]));
  const authorAssignments = overlay.assignments.filter(
    (assignment) => assignment.role === 'LESSON_AUTHOR',
  );
  assert.equal(authorAssignments.length, wave.job_ids.length);
  assert.equal(
    new Set(authorAssignments.map((assignment) => assignment.job_id)).size,
    wave.job_ids.length,
  );
  assert.equal(
    new Set(authorAssignments.map((assignment) => assignment.assignee_run_id)).size,
    authorAssignments.length,
    'Every author run must own exactly one lesson in the wave',
  );
  assert.equal(
    new Set(authorAssignments.map((assignment) => assignment.assignee_person_id)).size,
    authorAssignments.length,
    'Every author person ID must be unique in the wave',
  );
  const authorPersonIds = new Set(
    authorAssignments.map((assignment) => assignment.assignee_person_id),
  );
  const authorRunIds = new Set(authorAssignments.map((assignment) => assignment.assignee_run_id));
  for (const assignment of overlay.assignments) {
    if (assignment.role === 'LESSON_AUTHOR') continue;
    assert(
      !authorPersonIds.has(assignment.assignee_person_id) &&
        !authorRunIds.has(assignment.assignee_run_id),
      `Wave author may not fill nonauthor slot ${assignment.slot_id}`,
    );
  }

  for (const jobId of wave.job_ids) {
    const job = jobById.get(jobId);
    assert(job);
    for (const slot of getAssignmentSlots(job)) {
      const assignment = assignmentBySlotId.get(slot.slot_id);
      assert(assignment, `Required slot ${slot.slot_id} is not materialized`);
      for (const distinctSlotId of slot.must_be_distinct_from_slot_ids) {
        const distinctAssignment = assignmentBySlotId.get(distinctSlotId);
        assert(distinctAssignment, `Distinctness target ${distinctSlotId} is not materialized`);
        assert(
          !sameIdentity(assignmentIdentity(assignment), assignmentIdentity(distinctAssignment)),
          `${assignment.slot_id} violates distinctness from ${distinctSlotId}`,
        );
      }
    }
    const specialtyAssignments = job.assignments.domain_scientific_fact_checkers.map((slot) =>
      assignmentBySlotId.get(slot.slot_id),
    );
    assert.equal(specialtyAssignments.length, job.required_domain_fact_check_specialties.length);
    assert.deepEqual(
      specialtyAssignments.map((assignment) => assignment.specialty).sort(compareText),
      [...job.required_domain_fact_check_specialties].sort(compareText),
    );
  }

  const runOwnerById = new Map();
  for (const assignment of overlay.assignments) {
    const priorPerson = runOwnerById.get(assignment.assignee_run_id);
    if (priorPerson !== undefined) {
      assert.equal(
        priorPerson,
        assignment.assignee_person_id,
        `Run ${assignment.assignee_run_id} is assigned to multiple people`,
      );
    }
    runOwnerById.set(assignment.assignee_run_id, assignment.assignee_person_id);
  }

  validateReviewerReuseDeclarations(overlay, authorPersonIds);
  return assignmentBySlotId;
}

function validateReviewerReuseDeclarations(overlay, authorPersonIds) {
  const nonauthorByPersonId = new Map();
  for (const assignment of overlay.assignments) {
    if (assignment.role === 'LESSON_AUTHOR') continue;
    const assignments = nonauthorByPersonId.get(assignment.assignee_person_id) ?? [];
    assignments.push(assignment);
    nonauthorByPersonId.set(assignment.assignee_person_id, assignments);
  }
  const requiredReuseGroups = [...nonauthorByPersonId.entries()].filter(
    ([, assignments]) => assignments.length > 1,
  );
  const declarationsByPersonId = new Map();
  for (const declaration of overlay.reviewer_reuse_declarations) {
    requireNonemptyString(declaration.reviewer_person_id, 'reuse reviewer person ID');
    assert(
      !declarationsByPersonId.has(declaration.reviewer_person_id),
      `Duplicate reuse declaration for ${declaration.reviewer_person_id}`,
    );
    declarationsByPersonId.set(declaration.reviewer_person_id, declaration);
  }
  for (const [personId, assignments] of requiredReuseGroups) {
    assert(!authorPersonIds.has(personId));
    const jobIds = sortedUnique(assignments.map((assignment) => assignment.job_id));
    assert.equal(
      jobIds.length,
      assignments.length,
      `${personId} may cover multiple jobs, not multiple slots in one job`,
    );
    const roles = sortedUnique(assignments.map((assignment) => assignment.role));
    assert.equal(roles.length, 1, `${personId} may not reuse identity across different roles`);
    const declaration = declarationsByPersonId.get(personId);
    assert(declaration, `Reviewer reuse by ${personId} is not declared`);
    assert.equal(declaration.role, roles[0]);
    assert.deepEqual([...declaration.job_ids].sort(compareText), jobIds);
    assert.deepEqual(
      [...declaration.slot_ids].sort(compareText),
      assignments.map((assignment) => assignment.slot_id).sort(compareText),
    );
    assert(
      Array.isArray(declaration.qualification_evidence_ids) &&
        declaration.qualification_evidence_ids.length > 0,
      `${personId} reuse declaration lacks qualification evidence`,
    );
    for (const qualificationId of declaration.qualification_evidence_ids) {
      requireNonemptyString(
        qualificationId,
        `${personId} reuse qualification evidence ID`,
        IDENTITY_PATTERN,
      );
    }
    const assignmentQualificationIds = sortedUnique(
      assignments.flatMap((assignment) => assignment.qualification_evidence_ids),
    );
    assert(
      assignmentQualificationIds.every((qualificationId) =>
        declaration.qualification_evidence_ids.includes(qualificationId),
      ),
      `${personId} reuse declaration does not cover assignment qualifications`,
    );
    requireNonemptyString(declaration.rationale, `${personId} reuse rationale`);
  }
  assert.deepEqual(
    new Set(declarationsByPersonId.keys()),
    new Set(requiredReuseGroups.map(([personId]) => personId)),
    'Reuse declarations must correspond exactly to reused nonauthor reviewers',
  );
}

function validateFindings(findings, wave) {
  assert(Array.isArray(findings), 'findings must be an array');
  const findingIds = new Set();
  const waveJobIds = new Set(wave.job_ids);
  for (const finding of findings) {
    requireNonemptyString(finding.finding_id, 'finding ID');
    assert(!findingIds.has(finding.finding_id), `Duplicate finding ${finding.finding_id}`);
    findingIds.add(finding.finding_id);
    assert(['P0', 'P1', 'P2', 'P3'].includes(finding.severity));
    assert(['OPEN', 'RESOLVED'].includes(finding.status));
    if (finding.job_id !== null) assert(waveJobIds.has(finding.job_id));
    requireNonemptyString(finding.summary, `${finding.finding_id} summary`);
    if (finding.status === 'OPEN' && (finding.severity === 'P0' || finding.severity === 'P1')) {
      throw new Error(
        `${finding.finding_id}: open ${finding.severity} blocks internal integration`,
      );
    }
    if (finding.status === 'OPEN' && finding.severity === 'P2') {
      requireNonemptyString(finding.containment, `${finding.finding_id} containment`);
      requireNonemptyString(
        finding.owner_person_id,
        `${finding.finding_id} owner`,
        IDENTITY_PATTERN,
      );
      requireNonemptyString(finding.due_date, `${finding.finding_id} due date`, ISO_DATE_PATTERN);
      assert.equal(finding.publication_blocked, true);
    }
  }
}

async function validateWaveAssignmentOverlay(
  overlay,
  { plan, repositoryRoot = REPOSITORY_ROOT, sourcePlanSha256 },
) {
  assert.equal(overlay.schema_version, OVERLAY_SCHEMA_VERSION);
  assert.equal(overlay.materialization_status, 'MATERIALIZED');
  requireNonemptyString(overlay.overlay_id, 'overlay ID', IDENTITY_PATTERN);
  const materializedAt = parseMaterializedAt(overlay.materialized_at);
  assert.equal(overlay.validation_target, 'INTERNAL_DRAFT_INTEGRATION');
  assert.equal(overlay.source_plan.path, SOURCE_PLAN_PATH);
  requireNonemptyString(overlay.source_plan.sha256, 'overlay source-plan SHA-256', HASH_PATTERN);
  assert.equal(
    overlay.source_plan.sha256,
    sourcePlanSha256,
    'Overlay source-plan SHA-256 is stale',
  );
  assert.deepEqual(overlay.plan_pins, makePlanPins(plan), 'Overlay may not mutate plan pins');

  const wave = plan.waves.find((candidate) => candidate.wave_id === overlay.wave.wave_id);
  assert(wave, `Overlay references unknown wave ${overlay.wave.wave_id}`);
  assert.equal(overlay.wave.wave_ordinal, wave.wave_ordinal);
  assert.deepEqual(overlay.wave.job_ids, wave.job_ids);
  assert.deepEqual(overlay.wave.lesson_ids, wave.lesson_ids);

  const controllerIdentity = requireIdentity(overlay.controller_identity, 'controller identity');
  const integratorIdentity = requireIdentity(
    overlay.wave_integrator_identity,
    'wave integrator identity',
  );
  assert(
    !sameIdentity(controllerIdentity, integratorIdentity),
    'Controller and integrator must differ',
  );
  const assignmentBySlotId = validateAssignments(overlay, plan, wave);
  for (const assignment of overlay.assignments) {
    const identity = assignmentIdentity(assignment);
    assert(
      !sameIdentity(controllerIdentity, identity),
      'Controller may not fill a wave assignment',
    );
    assert(
      !sameIdentity(integratorIdentity, identity),
      'Wave integrator may not fill a job assignment',
    );
  }

  const evidenceByJobId = new Map();
  for (const evidence of overlay.job_evidence) {
    assert(!evidenceByJobId.has(evidence.job_id), `Duplicate evidence for ${evidence.job_id}`);
    evidenceByJobId.set(evidence.job_id, evidence);
  }
  assert.deepEqual(new Set(evidenceByJobId.keys()), new Set(wave.job_ids));
  const jobById = new Map(plan.jobs.map((job) => [job.job_id, job]));
  const candidateShaByJobId = new Map();
  for (const jobId of wave.job_ids) {
    const job = jobById.get(jobId);
    const evidence = evidenceByJobId.get(jobId);
    assert(job && evidence);
    assert.equal(evidence.lesson_id, job.lesson_id);
    validateSourceLedger(evidence.source_ledger, job, assignmentBySlotId, materializedAt);
    const candidateScan = await validateCandidateArtifactEvidence(evidence.candidate_artifact, {
      job,
      repositoryRoot,
      sourcePlanSha256,
      wave,
    });
    const candidateSha256 = candidateScan.artifact_sha256;
    candidateShaByJobId.set(job.job_id, candidateSha256);
    if (job.domain_bucket === 'CARS') {
      requireNonemptyString(
        evidence.selected_original_passage_subject,
        `${job.job_id} original passage subject`,
      );
      const subjectAssignment = assignmentBySlotId.get(
        job.assignments.cars_passage_subject_fact_checker.slot_id,
      );
      assert.equal(
        subjectAssignment.selected_passage_subject,
        evidence.selected_original_passage_subject,
      );
    } else {
      assert.equal(evidence.selected_original_passage_subject, null);
    }
    validateRightsAndDomainEvidence(
      evidence,
      job,
      assignmentBySlotId,
      candidateSha256,
      sourcePlanSha256,
      wave,
    );
    assert.equal(
      evidence.canonical_runtime_content_gate_reports.length,
      INTERNAL_INTEGRATION_GATE_IDS.length,
    );
    assert.deepEqual(
      evidence.canonical_runtime_content_gate_reports.map((record) => record.gate_id),
      [...INTERNAL_INTEGRATION_GATE_IDS],
    );
    for (const gateId of INTERNAL_INTEGRATION_GATE_IDS) {
      const gateEvidence = evidence.canonical_runtime_content_gate_reports.find(
        (record) => record.gate_id === gateId,
      );
      await validateGateEvidence(gateEvidence, {
        candidateSha256,
        gateId,
        job,
        repositoryRoot,
        reviewedArtifactSha256: candidateSha256,
        reviewerSlotId: job.assignments.release_integrator.slot_id,
        sourcePlanSha256,
        wave,
      });
    }
    await validateGateEvidence(evidence.content_pedagogy_audit, {
      candidateSha256,
      gateId: 'G06_INDEPENDENT_CONTENT_PEDAGOGY_AUDIT',
      job,
      repositoryRoot,
      reviewedArtifactSha256: candidateSha256,
      reviewerSlotId: job.assignments.content_pedagogy_auditor.slot_id,
      sourcePlanSha256,
      wave,
    });
    const blindClientScan = await validateReviewBundle(evidence.blind_solve_bundle, {
      bundleKind: 'BLIND_SOLVE',
      job,
      repositoryRoot,
      reviewedCandidateSha256: candidateSha256,
      sourcePlanSha256,
      wave,
    });
    const accessibilityClientScan = await validateReviewBundle(
      evidence.accessibility_review_bundle,
      {
        bundleKind: 'ACCESSIBILITY_ONLY',
        job,
        repositoryRoot,
        reviewedCandidateSha256: candidateSha256,
        sourcePlanSha256,
        wave,
      },
    );
    await validateBlindSolveReview(evidence.blind_solve_review, {
      assignmentBySlotId,
      candidateScan,
      job,
      repositoryRoot,
      safeClientScan: blindClientScan,
      sourcePlanSha256,
      wave,
      waveIntegratorIdentity: integratorIdentity,
    });
    await validateGateEvidence(evidence.accessibility_technical_review, {
      candidateSha256,
      gateId: 'G08_ACCESSIBILITY_TECHNICAL_AUDIT',
      job,
      repositoryRoot,
      reviewedArtifactSha256: accessibilityClientScan.bundle_sha256,
      reviewerSlotId: job.assignments.accessibility_technical_auditor.slot_id,
      sourcePlanSha256,
      wave,
    });
    assertArtifactIsolation(
      candidateScan.real_path,
      accessibilityClientScan.real_path,
      `${job.job_id} accessibility safe client`,
    );
    assert.notEqual(
      blindClientScan.real_path,
      accessibilityClientScan.real_path,
      `${job.job_id} blind and accessibility clients must be separate artifacts`,
    );
    validatePendingPublicationGates(evidence.pending_publication_gates, job);
  }
  await validateWaveSimilarityReview(overlay.wave_similarity_review, {
    candidateShaByJobId,
    jobById,
    repositoryRoot,
    sourcePlanSha256,
    wave,
  });
  validateFindings(overlay.findings, wave);
  return {
    assignment_count: overlay.assignments.length,
    job_count: wave.job_count,
    open_p2_count: overlay.findings.filter(
      (finding) => finding.status === 'OPEN' && finding.severity === 'P2',
    ).length,
    wave_id: wave.wave_id,
  };
}

async function renderJson(value) {
  return format(JSON.stringify(sortObjectKeys(value)), {
    parser: 'json',
    printWidth: 100,
    tabWidth: 2,
  });
}

async function assertSeparateOverlayOutputPath(outputPath, sourcePlanPath) {
  const outputParent = dirname(outputPath);
  await mkdir(outputParent, { recursive: true });
  const [realOutputParent, realSourcePlanPath, sourcePlanStats] = await Promise.all([
    realpath(outputParent),
    realpath(sourcePlanPath),
    lstat(sourcePlanPath),
  ]);
  const resolvedOutputPath = join(realOutputParent, basename(outputPath));
  assert.notEqual(
    resolvedOutputPath,
    realSourcePlanPath,
    'Wave overlay generation may never overwrite the immutable source plan',
  );
  try {
    const outputStats = await lstat(outputPath);
    assert.equal(outputStats.isSymbolicLink(), false, 'Overlay output may not be a symbolic link');
    assert(
      outputStats.dev !== sourcePlanStats.dev || outputStats.ino !== sourcePlanStats.ino,
      'Overlay output may not be a hard link to the immutable source plan',
    );
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

async function loadCheckedPlan() {
  const absolutePath = resolve(REPOSITORY_ROOT, SOURCE_PLAN_PATH);
  const text = await readFile(absolutePath, 'utf8');
  return {
    absolute_path: absolutePath,
    plan: JSON.parse(text),
    sha256: hashText(text),
    text,
  };
}

function parseArguments(argv) {
  const [command, ...rest] = argv;
  if (command === 'template' || command === 'check-template') {
    assert.equal(rest.length, 2, `Usage: ${command} <wave-id> <overlay-path>`);
    return { command, outputPath: rest[1], waveId: rest[0] };
  }
  if (command === 'validate') {
    assert.equal(rest.length, 1, 'Usage: validate <overlay-path>');
    return { command, overlayPath: rest[0] };
  }
  throw new Error(
    'Usage: validate-v3-cloud-authoring-wave-overlay.mjs <template|check-template|validate> ...',
  );
}

async function main() {
  const args = parseArguments(process.argv.slice(2));
  const checkedPlan = await loadCheckedPlan();
  if (args.command === 'template' || args.command === 'check-template') {
    const template = createWaveAssignmentOverlayTemplate(
      checkedPlan.plan,
      checkedPlan.sha256,
      args.waveId,
    );
    const rendered = await renderJson(template);
    const absoluteOutputPath = resolve(REPOSITORY_ROOT, args.outputPath);
    assert.notEqual(
      absoluteOutputPath,
      checkedPlan.absolute_path,
      'Wave overlay generation may never overwrite the immutable source plan',
    );
    await assertSeparateOverlayOutputPath(absoluteOutputPath, checkedPlan.absolute_path);
    if (args.command === 'check-template') {
      assert.equal(
        await readFile(absoluteOutputPath, 'utf8'),
        rendered,
        `${args.outputPath} is stale`,
      );
      process.stdout.write(
        `Validated immutable overlay template for ${args.waveId} against ${checkedPlan.sha256}.\n`,
      );
      return;
    }
    await writeFile(absoluteOutputPath, rendered, 'utf8');
    process.stdout.write(
      `Wrote separate overlay template ${args.outputPath} for ${args.waveId}; source plan unchanged.\n`,
    );
    return;
  }

  const absoluteOverlayPath = resolve(REPOSITORY_ROOT, args.overlayPath);
  assert.notEqual(
    absoluteOverlayPath,
    checkedPlan.absolute_path,
    'The immutable source plan is not an assignment overlay',
  );
  const overlayText = await readFile(absoluteOverlayPath, 'utf8');
  const overlay = JSON.parse(overlayText);
  const result = await validateWaveAssignmentOverlay(overlay, {
    plan: checkedPlan.plan,
    repositoryRoot: REPOSITORY_ROOT,
    sourcePlanSha256: checkedPlan.sha256,
  });
  process.stdout.write(
    `Validated ${result.wave_id}: ${result.job_count} jobs, ${result.assignment_count} materialized slots, ${result.open_p2_count} open P2; overlay SHA-256 ${hashText(overlayText)}.\n`,
  );
}

const isMain =
  process.argv[1] !== undefined && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (isMain) {
  main().catch((error) => {
    process.stderr.write(`${error.stack ?? error.message}\n`);
    process.exitCode = 1;
  });
}

export {
  BUNDLE_FILES,
  CHECKED_TEMPLATE_PATH,
  CLOSED_BUNDLE_SCANNER_ID,
  CLOSED_BUNDLE_SCHEMA_VERSION,
  EXCLUDED_CONTENT_CLASSES,
  OVERLAY_SCHEMA_VERSION,
  REQUIRED_BLIND_PATH_IDS,
  SOURCE_PLAN_PATH,
  computeSourceLedgerSha256,
  createSanitizedReviewBundleManifest,
  createWaveAssignmentOverlayTemplate,
  loadCheckedPlan,
  renderJson,
  validateAndHashClosedReviewBundle as scanSanitizedReviewBundle,
  validateWaveAssignmentOverlay,
};
