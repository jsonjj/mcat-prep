import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  EXPECTED,
  HELD_GOVERNANCE_ONLY_ENTITY_IDS,
  PROTOTYPE_LESSON_IDS,
  RECONCILED_FLOW_CONTRACT,
  SHOWCASE_ALLOWED_CLAIMS,
  SHOWCASE_DEFERRED_GATES,
  SHOWCASE_LANE_ID,
  SHOWCASE_PROHIBITED_CLAIMS,
  TEACH_SHOW_ASK_STAGES,
  VISUAL_TRIGGER_ARCHETYPES,
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
  assert(
    checkedPlan.unresolved_constraints.some(
      (constraint) => constraint.constraint_id === 'UC06_RECONCILED_FLOW_CONTRACT_V0_3',
    ),
  );
  assert.notEqual(
    sourceManifest.metadata.canonical_contract.sha256,
    RECONCILED_FLOW_CONTRACT.sha256,
  );
  for (const [index, wave] of checkedPlan.waves.entries()) {
    assert(
      wave.checkpoint.entry_requires.includes(
        'externally_trusted_signed_hardened_foundation_pinset_and_artifacts_are_materialized',
      ),
    );
    assert(
      wave.checkpoint.entry_requires.includes(
        'exact_reconciled_flow_contract_v0_3_bytes_match_required_sha256',
      ),
    );
    assert.deepEqual(
      wave.similarity_comparison_wave_ids,
      checkedPlan.waves.slice(0, index + 1).map((candidate) => candidate.wave_id),
    );
  }
});

test('jobs pin teach-show-ask, mobile cognition, routes, and construct-preserving visuals', () => {
  for (const job of checkedPlan.jobs) {
    assert.deepEqual(
      job.ordered_required_kc_ids,
      job.knowledge_component_microcycles.map((kc) => kc.kc_id),
    );
    assert.deepEqual(job.route_and_timing_contract, {
      core_path_p90_hypothesis_minutes: 18,
      exact_failed_function_reentry_required: true,
      hypothesis_scope: 'RESUMABLE_SEGMENT_ONLY_NOT_WHOLE_LESSON_OR_KC',
      planner_owned_routes: true,
    });
    assert.equal(
      job.learner_experience_requirements.cognitive_load_validation.focus_now_max_characters,
      120,
    );
    assert.deepEqual(
      job.learner_experience_requirements.mobile_primary_visual_and_action.viewport_widths_px,
      [320, 375],
    );
    for (const kc of job.knowledge_component_microcycles) {
      assert.deepEqual(kc.learner_experience.required_screen_sequence, TEACH_SHOW_ASK_STAGES);
      assert.equal(kc.learner_experience.entry_check_policy.counts_as_instructional_exit, false);
      assert.equal(kc.learner_experience.entry_check_policy.consequential, false);
      assert.deepEqual(kc.visual_requirement.trigger_archetypes, VISUAL_TRIGGER_ARCHETYPES);
      assert.equal(kc.visual_requirement.accessible_equivalent_required, true);
      assert.equal(kc.visual_requirement.reduced_motion_or_static_fallback_required, true);
    }
  }
  const redox = checkedPlan.jobs
    .flatMap((job) => job.knowledge_component_microcycles)
    .find((kc) => kc.kc_id === 'V3-KC-271440');
  assert.deepEqual(redox.visual_requirement.redox_acceptance_exemplar, {
    accounting_equation: 'Q + 2 H+ + 2 e- -> QH2',
    animation_claim: 'ACCOUNTING_NOT_ASSERTED_ELEMENTARY_MECHANISM',
    highlighted_changes: ['CHANGING_OXYGEN_1_AND_BOND', 'CHANGING_OXYGEN_2_AND_BOND'],
    unchanged_tail_treatment: 'GRAYED',
  });
});

test('novice review, showcase isolation, and reconciled v0.3 pin remain explicit', () => {
  assert.deepEqual(checkedPlan.metadata.reconciled_flow_contract, RECONCILED_FLOW_CONTRACT);
  assert.equal(
    checkedPlan.metadata.reconciled_flow_contract.sha256,
    '81f0de7ac2a57b0c794467ed0af94714309abb8602d1b0df29ff7602aa88d642',
  );
  assert.equal(checkedPlan.showcase_lane.lane_id, SHOWCASE_LANE_ID);
  assert.deepEqual(checkedPlan.showcase_lane.allowed_claims, SHOWCASE_ALLOWED_CLAIMS);
  assert.deepEqual(checkedPlan.showcase_lane.deferred_gates, SHOWCASE_DEFERRED_GATES);
  assert.deepEqual(checkedPlan.showcase_lane.prohibited_claims, SHOWCASE_PROHIBITED_CLAIMS);
  assert.equal(checkedPlan.showcase_lane.does_not_satisfy_w00_or_any_production_gate, true);
  assert.equal(checkedPlan.showcase_lane.public_deployment_allowed, false);
  assert.equal(checkedPlan.showcase_lane.critical_path[0].depends_on_phase_ids.length, 0);
  assert.match(checkedPlan.showcase_lane.critical_path[0].parallel_work, /concurrently/);
  for (const job of checkedPlan.jobs) {
    const novice = job.assignments.novice_learner_ux_reviewer;
    assert.equal(novice.role, 'NOVICE_LEARNER_UX_REVIEWER');
    for (const distinct of [
      job.assignments.blind_solver,
      job.assignments.accessibility_technical_auditor,
      ...job.assignments.domain_scientific_fact_checkers,
    ]) {
      assert(novice.must_be_distinct_from_slot_ids.includes(distinct.slot_id));
    }
  }
});
