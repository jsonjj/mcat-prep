#!/usr/bin/env node

import assert from 'node:assert/strict';
import { lstat, mkdir, readFile, readdir, realpath, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { format } from 'prettier';

import { getAssignmentSlots, hashText } from './generate-v3-cloud-authoring-plan.mjs';

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_PLAN_PATH = 'curriculum/v3/v3-cloud-authoring-jobs.json';
const CHECKED_TEMPLATE_PATH =
  'curriculum/v3/v3-cloud-authoring-wave-assignment-overlay.template.json';
const OVERLAY_SCHEMA_VERSION = 'mcat-v3-cloud-authoring-wave-assignment-overlay-1';
const SOURCE_LEDGER_SCHEMA_VERSION = 'mcat-v3-authoring-source-ledger-1';
const BUNDLE_SCHEMA_VERSION = 'mcat-v3-sanitized-review-bundle-1';
const BUNDLE_SCANNER_ID = 'V3_SANITIZED_REVIEW_BUNDLE_SCAN_V1';
const HASH_PATTERN = /^[a-f0-9]{64}$/;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const RFC3339_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/;
const IDENTITY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:@/+~-]*$/;
const ALLOWED_TEXT_EXTENSIONS = new Set(['.json', '.md', '.svg', '.txt']);
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
const EXCLUDED_BUNDLE_CONTENT_CLASSES = Object.freeze([
  'answer_keys',
  'rationales',
  'diagnostic_mappings',
  'protected_server_files',
  'author_branch_history',
]);
const INCLUDED_CONTENT_CLASSES = Object.freeze({
  ACCESSIBILITY_ONLY: [
    'accessibility_behavior',
    'deterministic_run_behavior',
    'learner_safe_activities',
  ],
  BLIND_SOLVE: ['deterministic_run_behavior', 'learner_safe_activities'],
});
const BUNDLE_CONTENT_FILE_BY_CLASS = Object.freeze({
  accessibility_behavior: 'accessibility-behavior.json',
  deterministic_run_behavior: 'deterministic-run-behavior.json',
  learner_safe_activities: 'learner-safe-activities.json',
});
const FORBIDDEN_JSON_FIELD_NAMES = new Set([
  'answer_key',
  'answer_keys',
  'choice_rationale',
  'choice_rationales',
  'correct_answer',
  'correct_option',
  'correct_response',
  'diagnostic_mapping',
  'diagnostic_mappings',
  'diagnostic_q_matrix',
  'primary_construct_mapping',
  'protected_content',
  'rationale',
  'rationales',
  'required_secondary_mappings',
  'server_definition',
  'server_only',
]);
const FORBIDDEN_BUNDLE_PATH_PATTERN =
  /(?:^|[/_.-])(?:answer[-_]?keys?|diagnostic[-_]?mappings?|protected|rationales?|server)(?:$|[/_.-])/i;
const FORBIDDEN_TEXT_CONTENT_PATTERN =
  /\b(?:answer[ _-]?key|rationales?|correct[ _-]?(?:answer|option|response)|diagnostic[ _-]?mapping|protected[ _-]?content|server[ _-]?(?:definition|only))\b/i;

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
      scanner_id: BUNDLE_SCANNER_ID,
    },
    reviewed_candidate_sha256: null,
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
      blind_solve_bundle: createBundleEvidenceTemplate(job, wave, 'BLIND_SOLVE', sourcePlanSha256),
      domain_scientific_review: {
        cars_passage_subject_record:
          job.domain_bucket === 'CARS'
            ? {
                approved: null,
                review_record_sha256: null,
                reviewer_slot_id: job.assignments.cars_passage_subject_fact_checker.slot_id,
                selected_passage_subject: null,
              }
            : null,
        reviewed_candidate_sha256: null,
        specialty_records: job.assignments.domain_scientific_fact_checkers.map((slot) => ({
          approved: null,
          review_record_sha256: null,
          reviewer_slot_id: slot.slot_id,
          specialty: slot.specialty,
        })),
      },
      job_id: job.job_id,
      lesson_id: job.lesson_id,
      rights_and_originality_review: {
        input_rights_approved: null,
        output_rights_and_originality_approved: null,
        review_record_sha256: null,
        reviewed_candidate_sha256: null,
        reviewer_slot_id: job.assignments.input_output_rights_reviewer.slot_id,
        source_ledger_sha256: null,
        source_output_similarity_report_sha256: null,
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
  assert(Object.hasOwn(INCLUDED_CONTENT_CLASSES, bundleKind), `Unknown bundle kind ${bundleKind}`);
  requireNonemptyString(reviewedCandidateSha256, 'reviewed candidate SHA-256', HASH_PATTERN);
  return sortObjectKeys({
    author_branch_included: false,
    bundle_kind: bundleKind,
    content_files: INCLUDED_CONTENT_CLASSES[bundleKind].map((contentClass) => ({
      content_class: contentClass,
      path: BUNDLE_CONTENT_FILE_BY_CLASS[contentClass],
    })),
    deterministic_run_behavior: {
      reviewer_outcome_controls: [
        'simulate_correct_path',
        'simulate_incorrect_path',
        'simulate_interruption_and_resume',
        'simulate_invalid_activity',
        'simulate_omission',
        'simulate_repair_limit',
      ],
      state_graph_included: true,
    },
    excluded_content_classes: [...EXCLUDED_BUNDLE_CONTENT_CLASSES],
    included_content_classes: [...INCLUDED_CONTENT_CLASSES[bundleKind]],
    job_id: jobId,
    key_bearing_artifacts_included: false,
    learner_safe_only: true,
    lesson_id: lessonId,
    reviewed_candidate_sha256: reviewedCandidateSha256,
    schema_version: BUNDLE_SCHEMA_VERSION,
    source_plan_sha256: sourcePlanSha256,
    wave_id: waveId,
  });
}

function scanJsonFields(value, path, violations) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => scanJsonFields(item, `${path}[${index}]`, violations));
    return;
  }
  if (value === null || typeof value !== 'object') return;
  for (const [key, item] of Object.entries(value)) {
    if (FORBIDDEN_JSON_FIELD_NAMES.has(key.toLowerCase())) {
      violations.push(`${path}.${key}: forbidden protected field`);
    }
    scanJsonFields(item, `${path}.${key}`, violations);
  }
}

async function listBundleFiles(rootPath, currentPath = rootPath) {
  const rootStats = await lstat(currentPath);
  assert(!rootStats.isSymbolicLink(), `Sanitized bundle may not contain symlinks: ${currentPath}`);
  if (rootStats.isFile()) return [currentPath];
  assert(rootStats.isDirectory(), `Unsupported sanitized bundle entry: ${currentPath}`);
  const entries = await readdir(currentPath, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((left, right) => compareText(left.name, right.name))) {
    const absolutePath = join(currentPath, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error(`Sanitized bundle may not contain symlinks: ${absolutePath}`);
    }
    if (entry.isDirectory()) {
      files.push(...(await listBundleFiles(rootPath, absolutePath)));
    } else if (entry.isFile()) {
      files.push(absolutePath);
    } else {
      throw new Error(`Unsupported sanitized bundle entry: ${absolutePath}`);
    }
  }
  return files;
}

async function scanSanitizedReviewBundle(bundleRootPath) {
  const absoluteRoot = resolve(bundleRootPath);
  const stats = await lstat(absoluteRoot);
  assert(
    stats.isDirectory() && !stats.isSymbolicLink(),
    'Sanitized bundle root must be a directory',
  );
  const absoluteFiles = await listBundleFiles(absoluteRoot);
  assert(absoluteFiles.length > 0, 'Sanitized bundle must contain files');
  const violations = [];
  const files = [];
  const jsonDocuments = new Map();
  let bundleManifest = null;

  for (const absoluteFile of absoluteFiles) {
    const relativePath = relative(absoluteRoot, absoluteFile).split(sep).join('/');
    if (FORBIDDEN_BUNDLE_PATH_PATTERN.test(relativePath)) {
      violations.push(`${relativePath}: forbidden protected/server path`);
    }
    const extension = extname(relativePath).toLowerCase();
    if (!ALLOWED_TEXT_EXTENSIONS.has(extension)) {
      violations.push(`${relativePath}: non-text or unsupported extension`);
      continue;
    }
    const contents = await readFile(absoluteFile);
    const text = contents.toString('utf8');
    if (!Buffer.from(text, 'utf8').equals(contents) || text.includes('\u0000')) {
      violations.push(`${relativePath}: bundle files must be UTF-8 text`);
      continue;
    }
    files.push({ path: relativePath, sha256: hashText(contents) });
    if (extension === '.json') {
      try {
        const value = JSON.parse(text);
        scanJsonFields(value, relativePath, violations);
        jsonDocuments.set(relativePath, value);
        if (relativePath === 'bundle-manifest.json') bundleManifest = value;
        if (relativePath !== 'bundle-manifest.json' && FORBIDDEN_TEXT_CONTENT_PATTERN.test(text)) {
          violations.push(`${relativePath}: forbidden protected-content marker`);
        }
      } catch {
        violations.push(`${relativePath}: invalid JSON`);
      }
    } else if (FORBIDDEN_TEXT_CONTENT_PATTERN.test(text)) {
      violations.push(`${relativePath}: forbidden protected-content marker`);
    }
  }

  files.sort((left, right) => compareText(left.path, right.path));
  const bundleSha256 = hashText(files.map((file) => `${file.path}\u0000${file.sha256}\n`).join(''));
  const report = sortObjectKeys({
    bundle_sha256: bundleSha256,
    files,
    scanner_id: BUNDLE_SCANNER_ID,
    violations: [...violations].sort(compareText),
  });
  return {
    bundle_manifest: bundleManifest,
    bundle_sha256: bundleSha256,
    files,
    json_documents: jsonDocuments,
    passed: violations.length === 0,
    report_sha256: hashText(JSON.stringify(report)),
    scanner_id: BUNDLE_SCANNER_ID,
    violations: report.violations,
  };
}

function resolveRepositoryRelativePath(repositoryRoot, value, label) {
  requireNonemptyString(value, label);
  assert.equal(isAbsolute(value), false, `${label} must be repository-relative`);
  const absoluteRoot = resolve(repositoryRoot);
  const absolutePath = resolve(absoluteRoot, value);
  assert(
    absolutePath === absoluteRoot || absolutePath.startsWith(`${absoluteRoot}${sep}`),
    `${label} escapes the repository root`,
  );
  return absolutePath;
}

function validateSourceLedger(ledger, job, assignmentBySlotId) {
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
    requireNonemptyString(entry.access_date, `${entry.source_id} access date`, ISO_DATE_PATTERN);
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

function validateRightsAndDomainEvidence(evidence, job, assignmentBySlotId) {
  const rightsReview = evidence.rights_and_originality_review;
  assert(
    rightsReview && typeof rightsReview === 'object',
    `${job.job_id} lacks rights/originality evidence`,
  );
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

function validateBundleManifest(manifest, scan, expected) {
  assert(manifest, `${expected.job.job_id} ${expected.bundleKind} lacks bundle-manifest.json`);
  assert.equal(manifest.schema_version, BUNDLE_SCHEMA_VERSION);
  assert.equal(manifest.bundle_kind, expected.bundleKind);
  assert.equal(manifest.source_plan_sha256, expected.sourcePlanSha256);
  assert.equal(manifest.wave_id, expected.wave.wave_id);
  assert.equal(manifest.job_id, expected.job.job_id);
  assert.equal(manifest.lesson_id, expected.job.lesson_id);
  assert.equal(manifest.reviewed_candidate_sha256, expected.reviewedCandidateSha256);
  assert.equal(manifest.author_branch_included, false);
  assert.equal(manifest.key_bearing_artifacts_included, false);
  assert.equal(manifest.learner_safe_only, true);
  assert.equal(manifest.deterministic_run_behavior?.state_graph_included, true);
  assert.deepEqual(
    [...manifest.included_content_classes].sort(compareText),
    [...INCLUDED_CONTENT_CLASSES[expected.bundleKind]].sort(compareText),
  );
  assert.deepEqual(
    [...manifest.excluded_content_classes].sort(compareText),
    [...EXCLUDED_BUNDLE_CONTENT_CLASSES].sort(compareText),
  );
  const expectedContentFiles = INCLUDED_CONTENT_CLASSES[expected.bundleKind]
    .map((contentClass) => ({
      content_class: contentClass,
      path: BUNDLE_CONTENT_FILE_BY_CLASS[contentClass],
    }))
    .sort((left, right) => compareText(left.content_class, right.content_class));
  assert.deepEqual(
    [...manifest.content_files].sort((left, right) =>
      compareText(left.content_class, right.content_class),
    ),
    expectedContentFiles,
  );
  const scannedPaths = new Set(scan.files.map((file) => file.path));
  for (const contentFile of expectedContentFiles) {
    assert(
      scannedPaths.has(contentFile.path),
      `${expected.job.job_id} ${expected.bundleKind} lacks ${contentFile.path}`,
    );
  }
  const activities = scan.json_documents.get(BUNDLE_CONTENT_FILE_BY_CLASS.learner_safe_activities);
  assert.equal(activities?.schema_version, 'mcat-v3-learner-safe-activities-1');
  assert(
    Array.isArray(activities.activities) && activities.activities.length > 0,
    `${expected.job.job_id} ${expected.bundleKind} lacks learner-safe activities`,
  );
  const runBehavior = scan.json_documents.get(
    BUNDLE_CONTENT_FILE_BY_CLASS.deterministic_run_behavior,
  );
  assert.equal(runBehavior?.schema_version, 'mcat-v3-deterministic-review-run-behavior-1');
  assert.equal(typeof runBehavior.initial_state, 'string');
  assert(Array.isArray(runBehavior.states) && runBehavior.states.length > 0);
  assert(Array.isArray(runBehavior.transitions) && runBehavior.transitions.length > 0);
  if (expected.bundleKind === 'ACCESSIBILITY_ONLY') {
    const accessibility = scan.json_documents.get(
      BUNDLE_CONTENT_FILE_BY_CLASS.accessibility_behavior,
    );
    assert.equal(accessibility?.schema_version, 'mcat-v3-accessibility-review-behavior-1');
    assert(
      Array.isArray(accessibility.checks) && accessibility.checks.length > 0,
      `${expected.job.job_id} accessibility bundle lacks review checks`,
    );
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
  const bundlePath = resolveRepositoryRelativePath(
    repositoryRoot,
    bundle.bundle_path,
    `${job.job_id} ${bundleKind} bundle path`,
  );
  const scan = await scanSanitizedReviewBundle(bundlePath);
  assert(
    scan.passed,
    `${job.job_id} ${bundleKind} protected-field scan failed: ${scan.violations.join('; ')}`,
  );
  validateBundleManifest(scan.bundle_manifest, scan, {
    bundleKind,
    job,
    reviewedCandidateSha256,
    sourcePlanSha256,
    wave,
  });
  requireNonemptyString(bundle.bundle_sha256, `${job.job_id} ${bundleKind} SHA-256`, HASH_PATTERN);
  assert.equal(bundle.bundle_sha256, scan.bundle_sha256);
  assert.equal(bundle.protected_field_scan.scanner_id, BUNDLE_SCANNER_ID);
  assert.equal(bundle.protected_field_scan.passed, true);
  assert.equal(bundle.protected_field_scan.bundle_sha256, scan.bundle_sha256);
  assert.equal(bundle.protected_field_scan.report_sha256, scan.report_sha256);
  assert.equal(bundle.protected_field_scan.scanned_file_count, scan.files.length);
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
  requireNonemptyString(overlay.materialized_at, 'materialized_at', RFC3339_PATTERN);
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
  for (const jobId of wave.job_ids) {
    const job = jobById.get(jobId);
    const evidence = evidenceByJobId.get(jobId);
    assert(job && evidence);
    assert.equal(evidence.lesson_id, job.lesson_id);
    validateSourceLedger(evidence.source_ledger, job, assignmentBySlotId);
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
    validateRightsAndDomainEvidence(evidence, job, assignmentBySlotId);
    await validateReviewBundle(evidence.blind_solve_bundle, {
      bundleKind: 'BLIND_SOLVE',
      job,
      repositoryRoot,
      reviewedCandidateSha256: evidence.rights_and_originality_review.reviewed_candidate_sha256,
      sourcePlanSha256,
      wave,
    });
    await validateReviewBundle(evidence.accessibility_review_bundle, {
      bundleKind: 'ACCESSIBILITY_ONLY',
      job,
      repositoryRoot,
      reviewedCandidateSha256: evidence.rights_and_originality_review.reviewed_candidate_sha256,
      sourcePlanSha256,
      wave,
    });
  }
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
  BUNDLE_SCANNER_ID,
  CHECKED_TEMPLATE_PATH,
  EXCLUDED_BUNDLE_CONTENT_CLASSES,
  INCLUDED_CONTENT_CLASSES,
  OVERLAY_SCHEMA_VERSION,
  SOURCE_PLAN_PATH,
  computeSourceLedgerSha256,
  createSanitizedReviewBundleManifest,
  createWaveAssignmentOverlayTemplate,
  loadCheckedPlan,
  renderJson,
  scanSanitizedReviewBundle,
  validateWaveAssignmentOverlay,
};
