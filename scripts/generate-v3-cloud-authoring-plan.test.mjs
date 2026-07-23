import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  EXPECTED,
  HELD_GOVERNANCE_ONLY_ENTITY_IDS,
  PROTOTYPE_LESSON_IDS,
  buildAuthoringPlan,
  getAssignmentSlots,
  hashText,
  renderPlan,
  validateAuthoringPlan,
} from './generate-v3-cloud-authoring-plan.mjs';

const sourcePath = 'curriculum/v3/v3-lesson-authoring-manifest.json';
const outputPath = 'curriculum/v3/v3-cloud-authoring-jobs.json';
const sourceText = await readFile(sourcePath, 'utf8');
const sourceManifest = JSON.parse(sourceText);
const checkedOutputText = await readFile(outputPath, 'utf8');
const checkedPlan = JSON.parse(checkedOutputText);

test('checked authoring plan is a deterministic projection of the pinned inputs', async () => {
  const contractText = await readFile(sourceManifest.metadata.canonical_contract.path, 'utf8');
  assert.equal(hashText(contractText), sourceManifest.metadata.canonical_contract.sha256);

  const first = buildAuthoringPlan(sourceManifest, hashText(sourceText));
  const second = buildAuthoringPlan(sourceManifest, hashText(sourceText));
  assert.deepEqual(first, second);
  assert.deepEqual(first, checkedPlan);
  assert.equal(await renderPlan(first), checkedOutputText);
});

test('all 114 lesson shells and all 422 lesson-owned KC microcycles occur exactly once', () => {
  assert.equal(checkedPlan.jobs.length, EXPECTED.counts.lessons);
  assert.equal(new Set(checkedPlan.jobs.map((job) => job.lesson_id)).size, 114);

  const microcycles = checkedPlan.jobs.flatMap((job) =>
    job.knowledge_component_microcycles.map((microcycle) => ({ job, microcycle })),
  );
  assert.equal(microcycles.length, EXPECTED.counts.kcs);
  assert.equal(new Set(microcycles.map(({ microcycle }) => microcycle.kc_id)).size, 422);

  const canonicalKcs = new Map(sourceManifest.curriculum.kcs.map((kc) => [kc.kc_id, kc]));
  for (const { job, microcycle } of microcycles) {
    const canonicalKc = canonicalKcs.get(microcycle.kc_id);
    assert(canonicalKc);
    assert.equal(microcycle.owning_lesson_id, job.lesson_id);
    assert.equal(canonicalKc.owning_lesson_id, job.lesson_id);
    assert.equal(microcycle.statement_of_competence, canonicalKc.statement_of_competence);
  }
});

test('prototype ports are exact and every other lesson is a new clean-room job', () => {
  const prototypeJobs = checkedPlan.jobs.filter((job) => job.job_kind === 'prototype_port');
  assert.deepEqual(
    prototypeJobs.map((job) => job.lesson_id),
    PROTOTYPE_LESSON_IDS,
  );
  assert.equal(prototypeJobs.length, 5);
  assert.equal(checkedPlan.jobs.filter((job) => job.job_kind === 'new_authoring').length, 109);
  assert.deepEqual(checkedPlan.waves[0].lesson_ids, PROTOTYPE_LESSON_IDS);
});

test('all references resolve and held attachments never become required delivery', () => {
  assert.doesNotThrow(() => validateAuthoringPlan(checkedPlan, sourceManifest));

  const attachments = checkedPlan.jobs.flatMap((job) => [
    ...job.attachments.capstones,
    ...job.attachments.extensions,
    ...job.attachments.supports,
  ]);
  for (const entityId of HELD_GOVERNANCE_ONLY_ENTITY_IDS) {
    const matches = attachments.filter((attachment) => attachment.attachment_id === entityId);
    assert(matches.length > 0);
    assert(
      matches.every(
        (attachment) =>
          attachment.delivery_state === 'governance_only' &&
          attachment.authoring_treatment === 'governance_only_reference' &&
          attachment.required_lesson_microcycle === false,
      ),
    );
  }
});

test('accelerated bypass is disabled in every source relation and authoring job', () => {
  assert(
    sourceManifest.sequence.normalized_relations.accelerated_candidate_relations.every(
      (relation) =>
        relation.currently_authorized_bypass === false &&
        relation.fail_closed === true &&
        relation.scope_retained === true,
    ),
  );
  assert(checkedPlan.jobs.every((job) => job.accelerated_bypass_authorized === false));
  assert.equal(checkedPlan.orchestration_policy.production_publication_default, false);
});

test('every job assigns independent audits distinct from its author slot', () => {
  for (const job of checkedPlan.jobs) {
    const authorSlotId = job.assignments.author.slot_id;
    const assignmentSlots = getAssignmentSlots(job);
    for (const assignment of assignmentSlots) {
      assert.equal(Object.hasOwn(assignment, 'assignee_agent_run_id'), false);
      if (assignment.slot_id === authorSlotId) continue;
      assert.notEqual(assignment.slot_id, authorSlotId);
      assert(assignment.must_be_distinct_from_slot_ids.includes(authorSlotId));
    }
    assert.equal(
      job.assignments.input_output_rights_reviewer.role,
      'INDEPENDENT_INPUT_OUTPUT_RIGHTS_REVIEWER',
    );
    assert.deepEqual(
      job.assignments.domain_scientific_fact_checkers
        .map((assignment) => assignment.specialty)
        .sort(),
      [...job.required_domain_fact_check_specialties].sort(),
    );
    if (job.domain_bucket === 'CARS') {
      const subjectReviewer = job.assignments.cars_passage_subject_fact_checker;
      const reasoningEditor = job.assignments.domain_scientific_fact_checkers.find(
        (assignment) => assignment.specialty === 'CARS_PASSAGE_REASONING_EDITOR',
      );
      assert(subjectReviewer);
      assert(reasoningEditor);
      assert(subjectReviewer.must_be_distinct_from_slot_ids.includes(reasoningEditor.slot_id));
    } else {
      assert.equal(job.assignments.cars_passage_subject_fact_checker, null);
    }
    assert(
      job.assignments.blind_solver.must_be_distinct_from_slot_ids.includes(
        job.assignments.final_approver.slot_id,
      ),
    );
    assert(
      job.assignments.final_approver.must_be_distinct_from_slot_ids.includes(
        job.assignments.blind_solver.slot_id,
      ),
    );
  }
});

test('production waves stay reviewable, mixed-domain, and dependency ordered', () => {
  const waveOrdinalByLessonId = new Map(
    checkedPlan.waves.flatMap((wave) =>
      wave.lesson_ids.map((lessonId) => [lessonId, wave.wave_ordinal]),
    ),
  );

  for (const wave of checkedPlan.waves.slice(1)) {
    assert(wave.job_count >= 8 && wave.job_count <= 12);
    assert(Object.keys(wave.domain_counts).length >= 3);
    assert.equal(wave.checkpoint.production_publication_at_checkpoint, false);
  }
  for (const job of checkedPlan.jobs) {
    for (const dependency of job.authoring_dependencies.blocking_hard_point_of_use) {
      assert(
        waveOrdinalByLessonId.get(dependency.dependency_lesson_id) <
          waveOrdinalByLessonId.get(job.lesson_id),
      );
    }
  }
});

test('W00 is blocked on exact signed foundation pins and similarity history is cumulative', () => {
  assert(
    checkedPlan.unresolved_constraints.some(
      (constraint) => constraint.constraint_id === 'UC05_HARDENED_FOUNDATION_INTEGRATION_PINS',
    ),
  );
  for (const [index, wave] of checkedPlan.waves.entries()) {
    assert(
      wave.checkpoint.entry_requires.includes(
        'externally_trusted_signed_hardened_foundation_pinset_and_artifacts_are_materialized',
      ),
    );
    assert.deepEqual(
      wave.similarity_comparison_wave_ids,
      checkedPlan.waves.slice(0, index + 1).map((candidate) => candidate.wave_id),
    );
  }
});
