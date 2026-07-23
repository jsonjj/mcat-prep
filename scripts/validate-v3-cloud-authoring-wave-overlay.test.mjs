import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';

import { hashText } from './generate-v3-cloud-authoring-plan.mjs';
import {
  REQUIRED_BLIND_PATH_IDS,
  REQUIRED_GATE_CHECK_IDS,
  directoryHash,
  listRegularFiles,
  validateAndHashClosedReviewBundle,
} from './v3-cloud-authoring-evidence-contract.mjs';
import {
  computeSourceLedgerSha256,
  createSanitizedReviewBundleManifest,
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

function clone(value) {
  return structuredClone(value);
}

async function writeJson(path, value) {
  const text = `${JSON.stringify(value, null, 2)}\n`;
  await mkdir(join(path, '..'), { recursive: true });
  await writeFile(path, text);
  return hashText(text);
}

async function fileManifestFor(rootPath) {
  const files = [];
  for (const absolutePath of await listRegularFiles(rootPath)) {
    const path = relative(rootPath, absolutePath).split(sep).join('/');
    files.push({ path, sha256: hashText(await readFile(absolutePath)) });
  }
  files.sort((left, right) => left.path.localeCompare(right.path));
  return files;
}

async function writeCandidateArtifact({ evidence, job, repositoryRoot }) {
  const artifactPath = `candidates/${job.lesson_id}`;
  const absolutePath = join(repositoryRoot, artifactPath);
  await mkdir(absolutePath, { recursive: true });
  await writeJson(join(absolutePath, 'candidate-manifest.json'), {
    contains_key_bearing_server_definition: true,
    job_id: job.job_id,
    lesson_id: job.lesson_id,
    runtime_contract_version: 'TEST_RUNTIME_V1',
    schema_version: 'mcat-v3-candidate-artifact-manifest-1',
    source_plan_sha256: sourcePlanSha256,
    wave_id: waveId,
  });
  await writeJson(join(absolutePath, 'server-definition.json'), {
    activities: [{ activity_id: `${job.lesson_id}-SAFE-ACTIVITY`, key: 'OPTION-A' }],
    server_only: true,
  });
  const files = await fileManifestFor(absolutePath);
  const candidateSha256 = directoryHash(files);
  evidence.candidate_artifact = {
    artifact_path: artifactPath,
    candidate_sha256: candidateSha256,
    file_manifest: files,
    job_id: job.job_id,
    lesson_id: job.lesson_id,
    source_plan_sha256: sourcePlanSha256,
    wave_id: waveId,
  };
  return { absolutePath, candidateSha256 };
}

function closedActivities(job) {
  return {
    activities: [
      {
        activity_id: `${job.lesson_id}-SAFE-ACTIVITY`,
        learner_support: [
          {
            availability: 'ON_REQUEST',
            support_id: `${job.lesson_id}-SUPPORT`,
            text: 'Review the learner-visible representation.',
          },
        ],
        prompt: {
          format: 'PLAIN_TEXT',
          text: 'Choose the learner response that best matches the presented evidence.',
        },
        response: {
          mode: 'SINGLE_SELECT',
          options: [
            { label: 'Option A', option_id: 'OPTION-A' },
            { label: 'Option B', option_id: 'OPTION-B' },
          ],
        },
        view_ids: [`${job.lesson_id}-VIEW`],
      },
    ],
    schema_version: 'mcat-v3-learner-safe-activities-1',
  };
}

function closedViews(job) {
  return {
    schema_version: 'mcat-v3-learner-safe-views-1',
    views: [
      {
        kind: 'TEXT',
        text: 'Learner-visible stimulus text.',
        view_id: `${job.lesson_id}-VIEW`,
      },
    ],
  };
}

async function writeClosedBundle({
  bundleEvidence,
  bundleKind,
  candidateSha256,
  job,
  repositoryRoot,
}) {
  const bundlePath = `bundles/${job.lesson_id}/${bundleKind.toLowerCase()}`;
  const absolutePath = join(repositoryRoot, bundlePath);
  await mkdir(absolutePath, { recursive: true });
  await writeJson(
    join(absolutePath, 'bundle-manifest.json'),
    createSanitizedReviewBundleManifest({
      bundleKind,
      jobId: job.job_id,
      lessonId: job.lesson_id,
      reviewedCandidateSha256: candidateSha256,
      sourcePlanSha256,
      waveId,
    }),
  );
  await writeJson(join(absolutePath, 'learner-safe-activities.json'), closedActivities(job));
  await writeJson(join(absolutePath, 'learner-safe-views.json'), closedViews(job));
  if (bundleKind === 'BLIND_SOLVE') {
    await writeJson(join(absolutePath, 'blind-client-runtime.json'), {
      client_scoring_authority: false,
      outcome_override_controls: false,
      rationales_before_response: false,
      request_fields: ['activity_id', 'response', 'session_token'],
      response_fields: ['attempt_id', 'learner_feedback', 'learner_outcome', 'next_state'],
      schema_version: 'mcat-v3-opaque-blind-client-runtime-1',
      service_protocol: 'OPAQUE_REAL_RESPONSE_SCORING_V1',
      submit_endpoint_path: '/submit',
    });
  } else {
    await writeJson(join(absolutePath, 'accessibility-behavior.json'), {
      checks: ['keyboard', 'focus', 'semantics', 'reflow', 'reduced_motion'],
      input_modes: ['keyboard', 'screen_reader'],
      schema_version: 'mcat-v3-accessibility-review-behavior-1',
      viewport_profiles: ['320px', '200_percent_zoom'],
    });
    await writeJson(join(absolutePath, 'accessibility-path-simulation.json'), {
      scenarios: [
        {
          learner_outcome: 'CORRECT',
          path_events: ['SUBMIT', 'FEEDBACK', 'CONTINUE'],
          scenario_id: 'A11Y-CORRECT-PATH',
        },
        {
          learner_outcome: 'INCORRECT',
          path_events: ['SUBMIT', 'FEEDBACK', 'RETRY'],
          scenario_id: 'A11Y-INCORRECT-PATH',
        },
      ],
      schema_version: 'mcat-v3-accessibility-path-simulation-1',
    });
  }
  const scan = await validateAndHashClosedReviewBundle({
    bundleKind,
    bundlePath,
    jobId: job.job_id,
    lessonId: job.lesson_id,
    repositoryRoot,
    reviewedCandidateSha256: candidateSha256,
    sourcePlanSha256,
    waveId,
  });
  bundleEvidence.bundle_path = bundlePath;
  bundleEvidence.bundle_sha256 = scan.bundle_sha256;
  bundleEvidence.reviewed_candidate_sha256 = candidateSha256;
  bundleEvidence.distribution.ref = `sanitized://${waveId}/${job.lesson_id}/${bundleKind}`;
  bundleEvidence.protected_field_scan = {
    bundle_sha256: scan.bundle_sha256,
    passed: true,
    report_sha256: scan.report_sha256,
    scanned_file_count: scan.files.length,
    scanner_id: scan.scanner_id,
  };
  return scan;
}

async function materializeGateReport({
  candidateSha256,
  descriptor,
  gateId,
  job,
  repositoryRoot,
  reviewedArtifactSha256,
}) {
  const reportPath = `reports/${job.lesson_id}/${gateId}.json`;
  const reportSha256 = await writeJson(join(repositoryRoot, reportPath), {
    candidate_sha256: candidateSha256,
    checks: REQUIRED_GATE_CHECK_IDS[gateId].map((checkId) => ({
      check_id: checkId,
      status: 'PASS',
    })),
    gate_id: gateId,
    job_id: job.job_id,
    lesson_id: job.lesson_id,
    report_id: `${job.lesson_id}-${gateId}-REPORT`,
    reviewed_artifact_sha256: reviewedArtifactSha256,
    schema_version: 'mcat-v3-gate-evidence-report-1',
    source_plan_sha256: sourcePlanSha256,
    status: 'APPROVED',
    wave_id: waveId,
  });
  descriptor.approved = true;
  descriptor.candidate_sha256 = candidateSha256;
  descriptor.report_path = reportPath;
  descriptor.report_sha256 = reportSha256;
  descriptor.reviewed_artifact_sha256 = reviewedArtifactSha256;
}

function attemptForPath(job, pathId, index) {
  const nonSubmit = {
    HELP_REQUEST: ['REQUEST_HELP', 'HELP_SHOWN'],
    INTERRUPTION_AND_RESUME: ['RESUME', 'RESUMED'],
  };
  const [requestKind, outcome] = nonSubmit[pathId] ?? [
    'SUBMIT_RESPONSE',
    {
      CORRECT_RESPONSE: 'CORRECT',
      INCORRECT_RESPONSE: 'INCORRECT',
      INVALID_ACTIVITY: 'INVALID',
      MIXED_ROUTE: 'INCORRECT',
      OMISSION: 'OMITTED',
      REPAIR_LIMIT: 'REPAIR_LIMIT',
      RETRY: 'RETRY',
      REVEAL: 'REVEALED',
    }[pathId],
  ];
  return {
    activity_id: `${job.lesson_id}-SAFE-ACTIVITY`,
    attempt_id: `${job.lesson_id}-ATTEMPT-${index}`,
    learner_feedback_code: `LEARNER-FEEDBACK-${index}`,
    learner_outcome: outcome,
    path_ids: [pathId],
    request_kind: requestKind,
    submitted_response_sha256:
      requestKind === 'SUBMIT_RESPONSE' ? hashText(`real-response-${job.job_id}-${index}`) : null,
  };
}

async function materializeBlindSolve({
  blindClientScan,
  candidateSha256,
  evidence,
  job,
  overlay,
  repositoryRoot,
}) {
  const review = evidence.blind_solve_review;
  const solverAssignment = overlay.assignments.find(
    (assignment) => assignment.slot_id === job.assignments.blind_solver.slot_id,
  );
  const solverIdentity = {
    person_id: solverAssignment.assignee_person_id,
    run_id: solverAssignment.assignee_run_id,
  };
  const serviceDeploymentArtifactSha256 = hashText(`opaque-service-${job.job_id}`);
  const attempts = REQUIRED_BLIND_PATH_IDS.flatMap((pathId, index) => {
    const attempt = attemptForPath(job, pathId, index);
    if (pathId !== 'INTERRUPTION_AND_RESUME') return [attempt];
    return [
      {
        ...attempt,
        attempt_id: `${attempt.attempt_id}-INTERRUPT`,
        learner_outcome: 'INTERRUPTED',
        request_kind: 'INTERRUPT',
      },
      attempt,
    ];
  });
  const pathCoverage = REQUIRED_BLIND_PATH_IDS.map((pathId) => ({
    attempt_ids: attempts
      .filter((attempt) => attempt.path_ids.includes(pathId))
      .map((attempt) => attempt.attempt_id),
    covered: true,
    path_id: pathId,
  }));
  const attemptLogPath = `blind-evidence/${job.lesson_id}/attempt-log.json`;
  const attemptLogSha256 = await writeJson(join(repositoryRoot, attemptLogPath), {
    attempts,
    candidate_sha256: candidateSha256,
    job_id: job.job_id,
    lesson_id: job.lesson_id,
    path_coverage: pathCoverage,
    safe_client_sha256: blindClientScan.bundle_sha256,
    schema_version: 'mcat-v3-blind-solve-attempt-log-1',
    service_deployment_artifact_sha256: serviceDeploymentArtifactSha256,
    solver_identity: solverIdentity,
    source_plan_sha256: sourcePlanSha256,
    wave_id: waveId,
  });
  const attestationPath = `blind-evidence/${job.lesson_id}/acl-attestation.json`;
  const attestationSha256 = await writeJson(join(repositoryRoot, attestationPath), {
    accepts_real_submitted_responses: true,
    candidate_sha256: candidateSha256,
    ephemeral: true,
    exact_key_bearing_candidate_deployed: true,
    integrator_identity: overlay.wave_integrator_identity,
    job_id: job.job_id,
    lesson_id: job.lesson_id,
    ordinary_learner_authorized_feedback_only: true,
    outcome_override_controls_exposed: false,
    protected_scoring_material_exposed: false,
    rationales_before_response_exposed: false,
    safe_client_sha256: blindClientScan.bundle_sha256,
    schema_version: 'mcat-v3-opaque-service-acl-attestation-1',
    server_definition_exposed: false,
    service_deployment_artifact_sha256: serviceDeploymentArtifactSha256,
    solver_identity: solverIdentity,
    source_branch_exposed: false,
    source_plan_sha256: sourcePlanSha256,
    wave_id: waveId,
  });
  review.approved = true;
  review.attempt_log_path = attemptLogPath;
  review.attempt_log_sha256 = attemptLogSha256;
  review.candidate_sha256 = candidateSha256;
  review.safe_client_sha256 = blindClientScan.bundle_sha256;
  review.solver_recipient_identity = solverIdentity;
  review.opaque_scoring_service = {
    accepts_real_submitted_responses: true,
    acl_branch_isolation_attestation_path: attestationPath,
    acl_branch_isolation_attestation_sha256: attestationSha256,
    deployment_ref: `opaque-service://${waveId}/${job.lesson_id}`,
    ephemeral: true,
    exact_key_bearing_candidate_deployed: true,
    ordinary_learner_authorized_feedback_only: true,
    outcome_override_controls_exposed: false,
    protected_scoring_material_exposed: false,
    rationales_before_response_exposed: false,
    server_definition_exposed: false,
    service_deployment_artifact_sha256: serviceDeploymentArtifactSha256,
    source_branch_exposed: false,
  };
  await materializeGateReport({
    candidateSha256,
    descriptor: review.approval_evidence,
    gateId: 'G07_INDEPENDENT_BLIND_SOLVE',
    job,
    repositoryRoot,
    reviewedArtifactSha256: blindClientScan.bundle_sha256,
  });
}

async function createValidFixture() {
  const repositoryRoot = await mkdtemp(join(tmpdir(), 'v3-wave-overlay-'));
  const overlay = createWaveAssignmentOverlayTemplate(plan, sourcePlanSha256, waveId);
  overlay.materialization_status = 'MATERIALIZED';
  overlay.materialized_at = '2026-07-23T17:00:00Z';
  overlay.overlay_id = 'W00-MATERIALIZED-002';
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

  const candidateBindings = [];
  for (const evidence of overlay.job_evidence) {
    const job = jobById.get(evidence.job_id);
    assert(job);
    const { candidateSha256 } = await writeCandidateArtifact({
      evidence,
      job,
      repositoryRoot,
    });
    candidateBindings.push({ candidate_sha256: candidateSha256, job_id: job.job_id });
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
    Object.assign(evidence.rights_and_originality_review, {
      candidate_sha256: candidateSha256,
      input_rights_approved: true,
      output_rights_and_originality_approved: true,
      review_record_sha256: hashText(`rights-review-${job.job_id}`),
      reviewed_candidate_sha256: candidateSha256,
      source_ledger_sha256: evidence.source_ledger.ledger_sha256,
      source_output_similarity_report_sha256: hashText(`source-similarity-${job.job_id}`),
    });
    evidence.domain_scientific_review.candidate_sha256 = candidateSha256;
    evidence.domain_scientific_review.reviewed_candidate_sha256 = candidateSha256;
    evidence.domain_scientific_review.specialty_records =
      job.assignments.domain_scientific_fact_checkers.map((slot) => ({
        approved: true,
        candidate_sha256: candidateSha256,
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
        candidate_sha256: candidateSha256,
        review_record_sha256: hashText(`passage-subject-review-${job.job_id}`),
        reviewer_slot_id: job.assignments.cars_passage_subject_fact_checker.slot_id,
        selected_passage_subject: evidence.selected_original_passage_subject,
      };
    }
    for (const descriptor of evidence.canonical_runtime_content_gate_reports) {
      await materializeGateReport({
        candidateSha256,
        descriptor,
        gateId: descriptor.gate_id,
        job,
        repositoryRoot,
        reviewedArtifactSha256: candidateSha256,
      });
    }
    await materializeGateReport({
      candidateSha256,
      descriptor: evidence.content_pedagogy_audit,
      gateId: 'G06_INDEPENDENT_CONTENT_PEDAGOGY_AUDIT',
      job,
      repositoryRoot,
      reviewedArtifactSha256: candidateSha256,
    });
    const blindClientScan = await writeClosedBundle({
      bundleEvidence: evidence.blind_solve_bundle,
      bundleKind: 'BLIND_SOLVE',
      candidateSha256,
      job,
      repositoryRoot,
    });
    const accessibilityClientScan = await writeClosedBundle({
      bundleEvidence: evidence.accessibility_review_bundle,
      bundleKind: 'ACCESSIBILITY_ONLY',
      candidateSha256,
      job,
      repositoryRoot,
    });
    await materializeBlindSolve({
      blindClientScan,
      candidateSha256,
      evidence,
      job,
      overlay,
      repositoryRoot,
    });
    await materializeGateReport({
      candidateSha256,
      descriptor: evidence.accessibility_technical_review,
      gateId: 'G08_ACCESSIBILITY_TECHNICAL_AUDIT',
      job,
      repositoryRoot,
      reviewedArtifactSha256: accessibilityClientScan.bundle_sha256,
    });
  }
  overlay.wave_similarity_review.approved = true;
  overlay.wave_similarity_review.candidate_bindings = candidateBindings;
  const similarityReportPath = `reports/${waveId}/G09-similarity.json`;
  overlay.wave_similarity_review.report_path = similarityReportPath;
  overlay.wave_similarity_review.report_sha256 = await writeJson(
    join(repositoryRoot, similarityReportPath),
    {
      candidate_bindings: candidateBindings,
      checks: [
        { check_id: 'CURRENT-WAVE-CROSS-DOMAIN', status: 'PASS' },
        { check_id: 'DECLARED-COMPARISON-WAVES', status: 'PASS' },
        { check_id: 'TEMPLATE-OVERFITTING', status: 'PASS' },
      ],
      comparison_wave_ids: wave.similarity_comparison_wave_ids,
      gate_id: 'G09_CROSS_LESSON_SIMILARITY_AUDIT',
      report_id: `${waveId}-SIMILARITY-REPORT`,
      reviewer_slot_ids: overlay.wave_similarity_review.reviewer_slot_ids,
      schema_version: 'mcat-v3-wave-similarity-report-1',
      source_plan_sha256: sourcePlanSha256,
      status: 'APPROVED',
      wave_id: waveId,
    },
  );
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
    await mutate(mutated, fixture.repositoryRoot);
    await assert.rejects(validate(mutated, fixture.repositoryRoot), pattern);
  } finally {
    await rm(fixture.repositoryRoot, { force: true, recursive: true });
  }
}

function firstEvidence(overlay) {
  return overlay.job_evidence[0];
}

function bundleRoot(overlay, repositoryRoot, kind = 'BLIND_SOLVE') {
  const evidence = firstEvidence(overlay);
  const bundle =
    kind === 'BLIND_SOLVE' ? evidence.blind_solve_bundle : evidence.accessibility_review_bundle;
  return join(repositoryRoot, bundle.bundle_path);
}

async function mutateJson(path, mutate) {
  const value = JSON.parse(await readFile(path, 'utf8'));
  mutate(value);
  await writeJson(path, value);
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

test('materialized overlay validates exact candidate-bound G01-G10 evidence', async () => {
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

test('source access dates must be real and no later than materialization', async () => {
  await rejectMutation((overlay) => {
    const ledger = firstEvidence(overlay).source_ledger;
    ledger.entries[0].access_date = '2026-02-30';
    ledger.ledger_sha256 = computeSourceLedgerSha256(ledger);
  }, /real calendar date/);
  await rejectMutation((overlay) => {
    const ledger = firstEvidence(overlay).source_ledger;
    ledger.entries[0].access_date = '2026-07-24';
    ledger.ledger_sha256 = computeSourceLedgerSha256(ledger);
  }, /may not be later than overlay materialization/);
});

test('source ledger rejects copied prose and unapproved model inputs', async () => {
  await rejectMutation((overlay) => {
    const ledger = firstEvidence(overlay).source_ledger;
    ledger.entries[0].copied_expressive_prose_allowed = true;
    ledger.ledger_sha256 = computeSourceLedgerSha256(ledger);
  }, /may not permit copied expressive prose/);
  await rejectMutation((overlay) => {
    const ledger = firstEvidence(overlay).source_ledger;
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
    const finalApprover = overlay.assignments.find(
      (assignment) =>
        assignment.job_id === blindSolver.job_id &&
        assignment.role === 'FINAL_PUBLICATION_APPROVER',
    );
    finalApprover.assignee_person_id = blindSolver.assignee_person_id;
    finalApprover.assignee_run_id = blindSolver.assignee_run_id;
  }, /violates distinctness/);
  await rejectMutation((overlay) => {
    overlay.controller_identity.person_id = null;
  }, /controller identity\.person_id must be a string/);
});

test('validator rejects omitted rights, domain, and CARS passage-subject roles', async () => {
  for (const role of [
    'INDEPENDENT_INPUT_OUTPUT_RIGHTS_REVIEWER',
    'DOMAIN_SCIENTIFIC_FACT_CHECKER',
    'CARS_PASSAGE_SUBJECT_FACT_CHECKER',
  ]) {
    await rejectMutation((overlay) => {
      const index = overlay.assignments.findIndex((assignment) => assignment.role === role);
      assert(index >= 0);
      overlay.assignments.splice(index, 1);
    }, /Every required assignment slot must be materialized exactly once/);
  }
});

test('closed bundle rejects protected aliases and unknown nested fields', async () => {
  for (const field of ['key', 'solution', 'expected']) {
    await rejectMutation(async (overlay, repositoryRoot) => {
      const path = join(bundleRoot(overlay, repositoryRoot), 'learner-safe-activities.json');
      await mutateJson(path, (value) => {
        value.activities[0][field] = 'OPTION-A';
      });
    }, /forbidden protected field/);
  }
  await rejectMutation(async (overlay, repositoryRoot) => {
    const path = join(bundleRoot(overlay, repositoryRoot), 'learner-safe-activities.json');
    await mutateJson(path, (value) => {
      value.activities[0].prompt.unknown_nested = true;
    });
  }, /missing or unknown fields/);
  await rejectMutation(async (overlay, repositoryRoot) => {
    const path = join(bundleRoot(overlay, repositoryRoot), 'learner-safe-views.json');
    await mutateJson(path, (value) => {
      value.views[0].script = 'alert(1)';
    });
  }, /missing or unknown fields/);
});

test('closed bundle rejects extra TXT and script-bearing SVG files', async () => {
  await rejectMutation(async (overlay, repositoryRoot) => {
    await writeFile(join(bundleRoot(overlay, repositoryRoot), 'notes.txt'), 'extra');
  }, /exact closed file set/);
  await rejectMutation(async (overlay, repositoryRoot) => {
    await writeFile(
      join(bundleRoot(overlay, repositoryRoot), 'visual.svg'),
      '<svg><script>alert(1)</script></svg>',
    );
  }, /exact closed file set/);
});

test('blind bundle rejects reviewer-controlled outcome simulation', async () => {
  await rejectMutation(async (overlay, repositoryRoot) => {
    const path = join(bundleRoot(overlay, repositoryRoot), 'blind-client-runtime.json');
    await mutateJson(path, (value) => {
      value.outcome_override_controls = true;
    });
  }, /true !== false/);
  await rejectMutation(async (overlay, repositoryRoot) => {
    const path = join(bundleRoot(overlay, repositoryRoot), 'blind-client-runtime.json');
    await mutateJson(path, (value) => {
      value.reviewer_outcome_controls = ['simulate_correct_path', 'simulate_incorrect_path'];
    });
  }, /missing or unknown fields/);
});

test('bundle real path may not escape through an in-repository parent symlink', async () => {
  const outsideRoot = await mkdtemp(join(tmpdir(), 'v3-outside-bundle-'));
  try {
    await rejectMutation(async (overlay, repositoryRoot) => {
      const linkPath = join(repositoryRoot, 'escaped-bundle');
      await symlink(outsideRoot, linkPath);
      firstEvidence(overlay).blind_solve_bundle.bundle_path = 'escaped-bundle';
    }, /resolves outside the real repository root/);
  } finally {
    await rm(outsideRoot, { force: true, recursive: true });
  }
});

test('candidate mutation and stale G01-G10 bindings fail closed', async () => {
  await rejectMutation(async (overlay, repositoryRoot) => {
    const evidence = firstEvidence(overlay);
    await writeJson(
      join(repositoryRoot, evidence.candidate_artifact.artifact_path, 'server-definition.json'),
      { changed_after_review: true, key: 'OPTION-B' },
    );
  }, /candidate file manifest is stale/);
  await rejectMutation((overlay) => {
    firstEvidence(overlay).canonical_runtime_content_gate_reports[0].candidate_sha256 = '0'.repeat(
      64,
    );
  }, /Expected values to be strictly equal/);
  await rejectMutation((overlay) => {
    firstEvidence(overlay).canonical_runtime_content_gate_reports.pop();
  }, /Expected values to be strictly equal/);
  await rejectMutation(async (overlay, repositoryRoot) => {
    const descriptor = firstEvidence(overlay).canonical_runtime_content_gate_reports[0];
    const absolutePath = join(repositoryRoot, descriptor.report_path);
    await mutateJson(absolutePath, (value) => {
      value.checks.pop();
    });
    descriptor.report_sha256 = hashText(await readFile(absolutePath));
  }, /missing required checks/);
  await rejectMutation((overlay) => {
    firstEvidence(overlay).rights_and_originality_review.input_rights_approved = false;
  }, /false !== true/);
  await rejectMutation((overlay) => {
    firstEvidence(overlay).content_pedagogy_audit.approved = false;
  }, /false !== true/);
  await rejectMutation((overlay) => {
    firstEvidence(overlay).blind_solve_review.approved = false;
  }, /false !== true/);
  await rejectMutation((overlay) => {
    firstEvidence(overlay).accessibility_technical_review.approved = false;
  }, /false !== true/);
  await rejectMutation((overlay) => {
    firstEvidence(overlay).domain_scientific_review.specialty_records[0].approved = false;
  }, /false !== true/);
  await rejectMutation((overlay) => {
    overlay.wave_similarity_review.approved = false;
  }, /false !== true/);
  await rejectMutation((overlay) => {
    overlay.wave_similarity_review.candidate_bindings.pop();
  }, /Expected values to be strictly deep-equal/);
});

test('opaque blind service binds solver, real attempts, ACL, and coverage', async () => {
  await rejectMutation((overlay) => {
    firstEvidence(overlay).blind_solve_review.solver_recipient_identity.person_id = 'PERSON-WRONG';
  }, /Expected values to be strictly deep-equal/);
  await rejectMutation((overlay) => {
    firstEvidence(
      overlay,
    ).blind_solve_review.opaque_scoring_service.outcome_override_controls_exposed = true;
  }, /true !== false/);
  await rejectMutation((overlay) => {
    firstEvidence(overlay).blind_solve_review.required_path_coverage.pop();
  }, /Expected values to be strictly deep-equal/);
  await rejectMutation(async (overlay, repositoryRoot) => {
    const review = firstEvidence(overlay).blind_solve_review;
    const absolutePath = join(repositoryRoot, review.attempt_log_path);
    await mutateJson(absolutePath, (value) => {
      value.path_coverage.pop();
    });
    review.attempt_log_sha256 = hashText(await readFile(absolutePath));
  }, /Expected values to be strictly deep-equal/);
  await rejectMutation(async (overlay, repositoryRoot) => {
    const review = firstEvidence(overlay).blind_solve_review;
    const absolutePath = join(repositoryRoot, review.attempt_log_path);
    await mutateJson(absolutePath, (value) => {
      for (const attempt of value.attempts) {
        attempt.request_kind = 'REQUEST_HELP';
        attempt.submitted_response_sha256 = null;
      }
    });
    review.attempt_log_sha256 = hashText(await readFile(absolutePath));
  }, /must include real submitted responses/);
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
