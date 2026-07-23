import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';

import { hashText } from './generate-v3-cloud-authoring-plan.mjs';
import {
  computeSourceLedgerSha256,
  createSanitizedReviewBundleManifest,
  createWaveAssignmentOverlayTemplate,
  scanSanitizedReviewBundle,
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

function clone(value) {
  return structuredClone(value);
}

async function writeSanitizedBundle({ bundleEvidence, bundleKind, evidence, job, repositoryRoot }) {
  const relativePath = `bundles/${job.lesson_id}/${bundleKind.toLowerCase()}`;
  const absolutePath = join(repositoryRoot, relativePath);
  await mkdir(absolutePath, { recursive: true });
  const manifest = createSanitizedReviewBundleManifest({
    bundleKind,
    jobId: job.job_id,
    lessonId: job.lesson_id,
    reviewedCandidateSha256: evidence.rights_and_originality_review.reviewed_candidate_sha256,
    sourcePlanSha256,
    waveId,
  });
  await writeFile(
    join(absolutePath, 'bundle-manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  await writeFile(
    join(absolutePath, 'learner-safe-activities.json'),
    `${JSON.stringify(
      {
        schema_version: 'mcat-v3-learner-safe-activities-1',
        activities: [
          {
            activity_id: `${job.lesson_id}-SAFE-ACTIVITY`,
            options: ['Option A', 'Option B'],
            prompt: 'A learner-safe review prompt.',
          },
        ],
      },
      null,
      2,
    )}\n`,
  );
  await writeFile(
    join(absolutePath, 'deterministic-run-behavior.json'),
    `${JSON.stringify(
      {
        initial_state: 'PROMPT',
        schema_version: 'mcat-v3-deterministic-review-run-behavior-1',
        states: ['PROMPT', 'FEEDBACK', 'COMPLETE'],
        transitions: [
          { event: 'SUBMIT', from: 'PROMPT', to: 'FEEDBACK' },
          { event: 'CONTINUE', from: 'FEEDBACK', to: 'COMPLETE' },
        ],
      },
      null,
      2,
    )}\n`,
  );
  if (bundleKind === 'ACCESSIBILITY_ONLY') {
    await writeFile(
      join(absolutePath, 'accessibility-behavior.json'),
      `${JSON.stringify(
        {
          checks: ['keyboard', 'focus', 'semantics', 'reflow', 'reduced_motion'],
          schema_version: 'mcat-v3-accessibility-review-behavior-1',
        },
        null,
        2,
      )}\n`,
    );
  }
  const scan = await scanSanitizedReviewBundle(absolutePath);
  assert.equal(scan.passed, true);
  bundleEvidence.bundle_path = relative(repositoryRoot, absolutePath);
  bundleEvidence.bundle_sha256 = scan.bundle_sha256;
  bundleEvidence.reviewed_candidate_sha256 =
    evidence.rights_and_originality_review.reviewed_candidate_sha256;
  bundleEvidence.source_plan_sha256 = sourcePlanSha256;
  bundleEvidence.distribution.ref = `sanitized://${waveId}/${job.lesson_id}/${bundleKind}`;
  bundleEvidence.protected_field_scan = {
    bundle_sha256: scan.bundle_sha256,
    passed: true,
    report_sha256: scan.report_sha256,
    scanned_file_count: scan.files.length,
    scanner_id: scan.scanner_id,
  };
  if (bundleKind === 'BLIND_SOLVE') {
    evidence.blind_solve_bundle = bundleEvidence;
  } else {
    evidence.accessibility_review_bundle = bundleEvidence;
  }
}

async function createValidFixture() {
  const repositoryRoot = await mkdtemp(join(tmpdir(), 'v3-wave-overlay-'));
  const overlay = createWaveAssignmentOverlayTemplate(plan, sourcePlanSha256, waveId);
  overlay.materialization_status = 'MATERIALIZED';
  overlay.materialized_at = '2026-07-23T17:00:00Z';
  overlay.overlay_id = 'W00-MATERIALIZED-001';
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

  for (const evidence of overlay.job_evidence) {
    const job = jobById.get(evidence.job_id);
    assert(job);
    const sourceId = `SOURCE-${job.lesson_id}`;
    evidence.source_ledger.entries = [
      {
        access_date: '2026-07-23',
        copied_expressive_prose_allowed: false,
        factual_use_only: true,
        license_or_terms: 'Official open factual source terms, reviewed for this use.',
        model_processing_rights: {
          basis: 'Open terms explicitly reviewed by the assigned rights reviewer.',
          status: 'AUTHORIZED_FOR_MODEL_PROCESSING',
        },
        provided_to_author_model: true,
        retrieved_content_sha256: hashText(`retrieved-${sourceId}`),
        rights_review_slot_id: evidence.source_ledger.rights_reviewer_slot_id,
        source_ceiling: 'Facts current through the recorded access date; no efficacy claims.',
        source_id: sourceId,
        source_kind: 'CURRENT_AUTHORITATIVE_OPEN_FACTUAL',
        title: `Authoritative factual source for ${job.lesson_id}`,
        url: `https://example.org/current-facts/${job.lesson_id}`,
      },
    ];
    evidence.source_ledger.ledger_sha256 = computeSourceLedgerSha256(evidence.source_ledger);
    const reviewedCandidateSha256 = hashText(`reviewed-candidate-${job.job_id}`);
    evidence.rights_and_originality_review = {
      input_rights_approved: true,
      output_rights_and_originality_approved: true,
      review_record_sha256: hashText(`rights-review-${job.job_id}`),
      reviewed_candidate_sha256: reviewedCandidateSha256,
      reviewer_slot_id: job.assignments.input_output_rights_reviewer.slot_id,
      source_ledger_sha256: evidence.source_ledger.ledger_sha256,
      source_output_similarity_report_sha256: hashText(`similarity-report-${job.job_id}`),
    };
    evidence.domain_scientific_review.reviewed_candidate_sha256 = reviewedCandidateSha256;
    evidence.domain_scientific_review.specialty_records =
      job.assignments.domain_scientific_fact_checkers.map((slot) => ({
        approved: true,
        review_record_sha256: hashText(`domain-review-${slot.slot_id}`),
        reviewer_slot_id: slot.slot_id,
        specialty: slot.specialty,
      }));
    if (job.domain_bucket === 'CARS') {
      evidence.selected_original_passage_subject =
        'The history of public-library wayfinding systems';
      const subjectAssignment = overlay.assignments.find(
        (assignment) =>
          assignment.slot_id === job.assignments.cars_passage_subject_fact_checker.slot_id,
      );
      subjectAssignment.selected_passage_subject = evidence.selected_original_passage_subject;
      evidence.domain_scientific_review.cars_passage_subject_record = {
        approved: true,
        review_record_sha256: hashText(`passage-subject-review-${job.job_id}`),
        reviewer_slot_id: job.assignments.cars_passage_subject_fact_checker.slot_id,
        selected_passage_subject: evidence.selected_original_passage_subject,
      };
    }
    await writeSanitizedBundle({
      bundleEvidence: evidence.blind_solve_bundle,
      bundleKind: 'BLIND_SOLVE',
      evidence,
      job,
      repositoryRoot,
    });
    await writeSanitizedBundle({
      bundleEvidence: evidence.accessibility_review_bundle,
      bundleKind: 'ACCESSIBILITY_ONLY',
      evidence,
      job,
      repositoryRoot,
    });
  }
  return { overlay, repositoryRoot };
}

async function validate(overlay, repositoryRoot) {
  return validateWaveAssignmentOverlay(overlay, {
    plan,
    repositoryRoot,
    sourcePlanSha256,
  });
}

async function rejectMutation(mutate, pattern) {
  const fixture = await createValidFixture();
  try {
    const mutated = clone(fixture.overlay);
    mutate(mutated, fixture.repositoryRoot);
    await assert.rejects(validate(mutated, fixture.repositoryRoot), pattern);
  } finally {
    await rm(fixture.repositoryRoot, { force: true, recursive: true });
  }
}

test('checked wave overlay template is deterministic and pins exact plan bytes', async () => {
  const checkedTemplate = JSON.parse(await readFile(checkedTemplatePath, 'utf8'));
  const originalPlan = clone(plan);
  assert.deepEqual(
    checkedTemplate,
    createWaveAssignmentOverlayTemplate(plan, sourcePlanSha256, waveId),
  );
  assert.deepEqual(plan, originalPlan);
  assert.equal(checkedTemplate.source_plan.sha256, sourcePlanSha256);
  assert.equal(checkedTemplate.materialization_status, 'TEMPLATE_UNMATERIALIZED');
});

test('materialized overlay validates assignments, ledgers, and sanitized bundles', async () => {
  const fixture = await createValidFixture();
  try {
    const result = await validate(fixture.overlay, fixture.repositoryRoot);
    assert.equal(result.wave_id, waveId);
    assert.equal(result.job_count, wave.job_count);
  } finally {
    await rm(fixture.repositoryRoot, { force: true, recursive: true });
  }
});

test('overlay cannot mutate plan pins or point at a stale source-plan hash', async () => {
  await rejectMutation((overlay) => {
    overlay.plan_pins.registry_sha256 = '0'.repeat(64);
  }, /may not mutate plan pins/);
  await rejectMutation((overlay) => {
    overlay.source_plan.sha256 = '0'.repeat(64);
  }, /source-plan SHA-256 is stale/);
});

test('source ledger rejects copied prose and unapproved model inputs', async () => {
  await rejectMutation((overlay) => {
    const ledger = overlay.job_evidence[0].source_ledger;
    ledger.entries[0].copied_expressive_prose_allowed = true;
    ledger.ledger_sha256 = computeSourceLedgerSha256(ledger);
  }, /may not permit copied expressive prose/);
  await rejectMutation((overlay) => {
    const ledger = overlay.job_evidence[0].source_ledger;
    ledger.entries[0].model_processing_rights.status = 'HUMAN_REVIEW_ONLY_NOT_MODEL_INPUT';
    ledger.entries[0].provided_to_author_model = true;
    ledger.ledger_sha256 = computeSourceLedgerSha256(ledger);
  }, /cannot be supplied to an author model/);
});

test('validator rejects author reuse and any wave author in a nonauthor slot', async () => {
  await rejectMutation((overlay) => {
    const authors = overlay.assignments.filter((assignment) => assignment.role === 'LESSON_AUTHOR');
    authors[1].assignee_person_id = authors[0].assignee_person_id;
    authors[1].assignee_run_id = authors[0].assignee_run_id;
  }, /author run must own exactly one lesson|author person ID must be unique/);
  await rejectMutation((overlay) => {
    const author = overlay.assignments.find((assignment) => assignment.role === 'LESSON_AUTHOR');
    const auditor = overlay.assignments.find(
      (assignment) => assignment.role === 'INDEPENDENT_CONTENT_PEDAGOGY_AUDITOR',
    );
    auditor.assignee_person_id = author.assignee_person_id;
    auditor.assignee_run_id = author.assignee_run_id;
  }, /Wave author may not fill nonauthor slot/);
});

test('validator enforces declared distinctness and explicit orchestration identities', async () => {
  await rejectMutation((overlay) => {
    const blindSolver = overlay.assignments.find(
      (assignment) => assignment.role === 'INDEPENDENT_BLIND_SOLVER',
    );
    const sameJobFinalApprover = overlay.assignments.find(
      (assignment) =>
        assignment.job_id === blindSolver.job_id &&
        assignment.role === 'FINAL_PUBLICATION_APPROVER',
    );
    sameJobFinalApprover.assignee_person_id = blindSolver.assignee_person_id;
    sameJobFinalApprover.assignee_run_id = blindSolver.assignee_run_id;
  }, /violates distinctness/);
  await rejectMutation((overlay) => {
    overlay.controller_identity.person_id = null;
  }, /controller identity\.person_id must be a string/);
});

test('validator rejects omitted rights, domain, and CARS passage-subject roles', async () => {
  await rejectMutation((overlay) => {
    const index = overlay.assignments.findIndex(
      (assignment) => assignment.role === 'INDEPENDENT_INPUT_OUTPUT_RIGHTS_REVIEWER',
    );
    overlay.assignments.splice(index, 1);
  }, /Every required assignment slot must be materialized exactly once/);
  await rejectMutation((overlay) => {
    const index = overlay.assignments.findIndex(
      (assignment) => assignment.role === 'DOMAIN_SCIENTIFIC_FACT_CHECKER',
    );
    overlay.assignments.splice(index, 1);
  }, /Every required assignment slot must be materialized exactly once/);
  await rejectMutation((overlay) => {
    const index = overlay.assignments.findIndex(
      (assignment) => assignment.role === 'CARS_PASSAGE_SUBJECT_FACT_CHECKER',
    );
    assert(index >= 0);
    overlay.assignments.splice(index, 1);
  }, /Every required assignment slot must be materialized exactly once/);
  await rejectMutation((overlay) => {
    const multiSpecialtyJob = wave.job_ids
      .map((jobId) => jobById.get(jobId))
      .find((job) => job.required_domain_fact_check_specialties.length > 1);
    const specialtyAssignments = overlay.assignments.filter(
      (assignment) =>
        assignment.job_id === multiSpecialtyJob.job_id &&
        assignment.role === 'DOMAIN_SCIENTIFIC_FACT_CHECKER',
    );
    specialtyAssignments[1].slot_id = specialtyAssignments[0].slot_id;
  }, /Duplicate slot/);
});

test('validator rejects protected fields in the blind-solve bundle', async () => {
  const fixture = await createValidFixture();
  try {
    const evidence = fixture.overlay.job_evidence[0];
    const absoluteBundlePath = join(
      fixture.repositoryRoot,
      evidence.blind_solve_bundle.bundle_path,
    );
    await writeFile(
      join(absoluteBundlePath, 'exposed.json'),
      `${JSON.stringify({ answer_key: 'A' })}\n`,
    );
    const scan = await scanSanitizedReviewBundle(absoluteBundlePath);
    assert.equal(scan.passed, false);
    evidence.blind_solve_bundle.bundle_sha256 = scan.bundle_sha256;
    evidence.blind_solve_bundle.protected_field_scan = {
      bundle_sha256: scan.bundle_sha256,
      passed: true,
      report_sha256: scan.report_sha256,
      scanned_file_count: scan.files.length,
      scanner_id: scan.scanner_id,
    };
    await assert.rejects(
      validate(fixture.overlay, fixture.repositoryRoot),
      /protected-field scan failed/,
    );
  } finally {
    await rm(fixture.repositoryRoot, { force: true, recursive: true });
  }
});

test('reviewer reuse across jobs requires one qualified same-role declaration', async () => {
  const fixture = await createValidFixture();
  try {
    const rightsAssignments = fixture.overlay.assignments
      .filter((assignment) => assignment.role === 'INDEPENDENT_INPUT_OUTPUT_RIGHTS_REVIEWER')
      .slice(0, 2);
    rightsAssignments[1].assignee_person_id = rightsAssignments[0].assignee_person_id;
    rightsAssignments[1].assignee_run_id = rightsAssignments[0].assignee_run_id;
    await assert.rejects(
      validate(fixture.overlay, fixture.repositoryRoot),
      /Reviewer reuse .* is not declared/,
    );
    fixture.overlay.reviewer_reuse_declarations = [
      {
        job_ids: rightsAssignments.map((assignment) => assignment.job_id).sort(),
        qualification_evidence_ids: rightsAssignments.flatMap(
          (assignment) => assignment.qualification_evidence_ids,
        ),
        rationale: 'The reviewer is qualified for both jobs and receives only rights evidence.',
        reviewer_person_id: rightsAssignments[0].assignee_person_id,
        role: 'INDEPENDENT_INPUT_OUTPUT_RIGHTS_REVIEWER',
        slot_ids: rightsAssignments.map((assignment) => assignment.slot_id).sort(),
      },
    ];
    assert.equal((await validate(fixture.overlay, fixture.repositoryRoot)).wave_id, waveId);
  } finally {
    await rm(fixture.repositoryRoot, { force: true, recursive: true });
  }
});

test('open P0/P1 block integration and open P2 requires containment metadata', async () => {
  await rejectMutation((overlay) => {
    overlay.findings.push({
      finding_id: 'FINDING-P1',
      job_id: overlay.wave.job_ids[0],
      publication_blocked: true,
      severity: 'P1',
      status: 'OPEN',
      summary: 'A major unresolved correctness defect.',
    });
  }, /open P1 blocks internal integration/);
  await rejectMutation((overlay) => {
    overlay.findings.push({
      finding_id: 'FINDING-P2',
      job_id: overlay.wave.job_ids[0],
      publication_blocked: true,
      severity: 'P2',
      status: 'OPEN',
      summary: 'A bounded moderate defect.',
    });
  }, /containment must be a string/);
});
