#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { format } from 'prettier';

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_PATH = 'curriculum/v3/v3-lesson-authoring-manifest.json';
const OUTPUT_PATH = 'curriculum/v3/v3-cloud-authoring-jobs.json';
const GENERATOR_PATH = 'scripts/generate-v3-cloud-authoring-plan.mjs';

const EXPECTED = Object.freeze({
  sourceSchemaVersion: 'mcat-v3-lesson-authoring-manifest-2',
  registryArtifactId: 'MCAT-V3-AUTHORITATIVE-REGISTRY-2026-07-22-01',
  registrySha256: '635c39e9c0ebb28a3892399449aa9b74893aae3264924cd739b92b6e370ba26a',
  contractSha256: 'e56590830462987e2cc9ec8d523a702e75c903613020addb81da6edbcad3286b',
  counts: {
    lessons: 114,
    kcs: 422,
    groupings: 114,
  },
});

const PROTOTYPE_LESSON_IDS = Object.freeze([
  'V3-LES-329622',
  'V3-LES-765609',
  'V3-LES-443492',
  'V3-LES-225658',
  'V3-LES-386478',
]);

const HELD_GOVERNANCE_ONLY_ENTITY_IDS = Object.freeze(['V3-CAP-537139', 'V3-EXT-703019']);

const DOMAIN_BUCKET_ORDER = Object.freeze([
  'BIO_BIOCHEM',
  'CHEM_PHYS',
  'PSYCH_SOC',
  'CARS',
  'CROSS_CUTTING_SIRS',
  'BIO_CHEM_SHARED',
]);

const PRODUCTION_MIN_AUTHORS = 8;
const PRODUCTION_MAX_AUTHORS = 12;

const REQUIRED_ACCEPTANCE_GATE_IDS = Object.freeze([
  'G01_RELEASE_PIN_AND_REFERENCE_LINT',
  'G02_CANONICAL_SHELL_AND_KC_OWNERSHIP',
  'G03_LESSON_CONTRACT_COMPLETENESS',
  'G04_ATTACHMENTS_REPAIR_AND_NO_BYPASS',
  'G05_CLEAN_ROOM_RIGHTS_AND_ORIGINALITY',
  'G06_INDEPENDENT_CONTENT_PEDAGOGY_AUDIT',
  'G07_INDEPENDENT_BLIND_SOLVE',
  'G08_ACCESSIBILITY_TECHNICAL_AUDIT',
  'G09_CROSS_LESSON_SIMILARITY_AUDIT',
  'G10_DOMAIN_FACT_CHECK_AND_SCIENTIFIC_REVIEW',
  'G11_EXACT_REVIEWED_CONTENT_HASH',
  'G12_EFFICACY_AND_PUBLICATION_APPROVAL',
]);

const ACCEPTANCE_GATE_CATALOG = Object.freeze([
  {
    gate_id: 'G01_RELEASE_PIN_AND_REFERENCE_LINT',
    stage: 'preflight',
    blocks_internal_draft_integration: true,
    blocks_publication: true,
    required_evidence: [
      'Registry artifact, registry SHA-256, freeze IDs, contract SHA-256, and source-manifest SHA-256 match the job.',
      'Every canonical entity and normalized relation reference resolves without editing generated curriculum truth.',
    ],
  },
  {
    gate_id: 'G02_CANONICAL_SHELL_AND_KC_OWNERSHIP',
    stage: 'author',
    blocks_internal_draft_integration: true,
    blocks_publication: true,
    required_evidence: [
      'The exact lesson ID, grouping ID, ordered KC IDs, and KC statements are unchanged.',
      'Every listed KC has exactly one lesson-owned primary microcycle; no new, merged, split, or rehomed KC exists.',
    ],
  },
  {
    gate_id: 'G03_LESSON_CONTRACT_COMPLETENESS',
    stage: 'author',
    blocks_internal_draft_integration: true,
    blocks_publication: true,
    required_evidence: [
      'The immutable LessonDefinition shell and every KC microcycle satisfy the contract in design specification sections 12 and 31.',
      'AJV shape validation is supplementary: an exact pinset-bound production validator implementation signs a candidate-byte- and schema/runtime/build-bound successful execution report that includes all cross-field refinements.',
      'Activity graphs terminate, bounded repairs reenter exactly, checkpoints resume, and instructional and downstream families remain isolated.',
    ],
  },
  {
    gate_id: 'G04_ATTACHMENTS_REPAIR_AND_NO_BYPASS',
    stage: 'author',
    blocks_internal_draft_integration: true,
    blocks_publication: true,
    required_evidence: [
      'Host-only extensions and supports remain host-bound and nonmastery; capstones remain separate activity references.',
      'Governance-only records create no active content, task, evidence, or denominator entry.',
      'All required KC delivery remains present and accelerated bypass remains disabled.',
    ],
  },
  {
    gate_id: 'G05_CLEAN_ROOM_RIGHTS_AND_ORIGINALITY',
    stage: 'rights_review',
    blocks_internal_draft_integration: true,
    blocks_publication: true,
    required_assignment_roles: ['INDEPENDENT_INPUT_OUTPUT_RIGHTS_REVIEWER'],
    required_evidence: [
      'An independent rights reviewer approves a source ledger recording URLs, access dates, licenses or terms, model-processing rights, and source ceilings before authoring.',
      'All model inputs exclude protected items, answer keys, copied expressive prose, and unauthorized prototype material.',
      'Figures, tables, passages, examples, and items are original or explicitly licensed; closed G05 and source-output reports are reread, hash-checked, assigned-reviewer-identity-bound, and signature-verified.',
    ],
  },
  {
    gate_id: 'G06_INDEPENDENT_CONTENT_PEDAGOGY_AUDIT',
    stage: 'independent_content_pedagogy_audit',
    blocks_internal_draft_integration: true,
    blocks_publication: true,
    required_evidence: [
      'A nonauthor independently verifies factual accuracy, scope, expert task models, objective-activity alignment, assistance fading, feedback, and repair design.',
      'Consequential expert disagreements are reconciled and documented.',
    ],
  },
  {
    gate_id: 'G07_INDEPENDENT_BLIND_SOLVE',
    stage: 'blind_solve',
    blocks_internal_draft_integration: true,
    blocks_publication: true,
    required_evidence: [
      'A solver distinct from the author and final approver answers real learner-safe activities through a closed safe client connected to an ephemeral opaque integrator-controlled scoring service.',
      'The service deploys the exact candidate hash server-side, accepts submitted responses, returns ordinary learner-authorized feedback, and exposes no source branch, server definition, protected scoring material, pre-response rationales, or outcome overrides.',
      'Every supported learner action has an ordered detached-signature-verified service receipt; path coverage is derived from the signed foundation action/transition profile and before/after semantic states rather than trusted labels or invented request kinds.',
      'Invalid-activity and unsupported-action rejection are signed technical service-integration checks, not fabricated ordinary learner actions.',
      'The service deployment is recomputed from a closed manifest, its receipt key is bound by an externally signed deployment/ACL attestation, and unsigned/self-asserted logs cannot satisfy G07.',
    ],
  },
  {
    gate_id: 'G08_ACCESSIBILITY_TECHNICAL_AUDIT',
    stage: 'accessibility_technical_audit',
    blocks_internal_draft_integration: true,
    blocks_publication: true,
    required_evidence: [
      'The reviewer receives a closed accessibility-only client with the same protected-material and branch exclusions as blind solve.',
      'A pinset-bound standard browser harness signs execution evidence; static accessibility assertions or path strings cannot satisfy G08.',
      'Keyboard, focus, semantics, contrast, 320px reflow, 200% zoom, reduced-motion, nonvisual representation, transcript/caption, and accommodation behavior pass.',
      'Accessible alternatives preserve the intended construct and activity-graph behavior.',
    ],
  },
  {
    gate_id: 'G09_CROSS_LESSON_SIMILARITY_AUDIT',
    stage: 'cross_lesson_similarity_audit',
    blocks_internal_draft_integration: true,
    blocks_publication: true,
    required_evidence: [
      'The candidate is compared with its wave and a signed cumulative manifest covering every previously integrated wave for copied language, repeated scenarios, answer-pattern leakage, and template overfitting.',
      'Any intentional reuse is bounded, justified, and does not collapse distinct KC identities or item families.',
    ],
  },
  {
    gate_id: 'G10_DOMAIN_FACT_CHECK_AND_SCIENTIFIC_REVIEW',
    stage: 'domain_review',
    blocks_internal_draft_integration: true,
    blocks_publication: true,
    conditional_required_assignment_roles: [
      {
        condition: 'job.domain_bucket == CARS',
        role: 'CARS_PASSAGE_SUBJECT_FACT_CHECKER',
      },
    ],
    required_assignment_roles: ['DOMAIN_SCIENTIFIC_FACT_CHECKER'],
    required_evidence: [
      'One explicit independent fact-check assignment exists for every required job specialty; each closed report is reread, hash-checked, identity/slot/specialty-bound, and detached-signature-verified.',
      'After a CARS passage subject is selected, an additional checker distinct from the author and CARS reasoning editor signs a subject- and candidate-bound closed report.',
      'Present-day authority limitations and unresolved holds are not converted into current endorsement or efficacy claims.',
    ],
  },
  {
    gate_id: 'G11_EXACT_REVIEWED_CONTENT_HASH',
    stage: 'release_candidate',
    blocks_internal_draft_integration: false,
    blocks_publication: true,
    required_evidence: [
      'All approvals bind to one immutable reviewed-content hash after the final approved change.',
      'A post-hash mutation invalidates approvals and restarts affected gates.',
    ],
  },
  {
    gate_id: 'G12_EFFICACY_AND_PUBLICATION_APPROVAL',
    stage: 'publication',
    blocks_internal_draft_integration: false,
    blocks_publication: true,
    required_evidence: [
      'Rights, scientific, accessibility, blind-solve, similarity, exact-hash, and final-approver records are complete.',
      'The preregistered learning-loop efficacy and subgroup gates in design specification section 33.4 pass.',
      'Until this gate passes, every generated asset remains an internal draft and is not a production LessonDefinition.',
    ],
  },
]);

const WORKFLOW_STAGES = Object.freeze([
  {
    order: 1,
    stage: 'source_ledger_and_input_rights_review',
    assignment_key: 'input_output_rights_reviewer',
    output: 'approved_source_ledger_and_input_rights_record',
  },
  {
    order: 2,
    stage: 'author',
    assignment_key: 'author',
    output: 'one_lesson_internal_draft_candidate',
  },
  {
    order: 3,
    stage: 'independent_content_pedagogy_audit',
    assignment_key: 'content_pedagogy_auditor',
    output: 'resolved_audit_record',
  },
  {
    order: 4,
    stage: 'domain_scientific_fact_check',
    assignment_collection_key: 'domain_scientific_fact_checkers',
    output: 'specialty_fact_check_records',
  },
  {
    order: 5,
    stage: 'cars_passage_subject_fact_check',
    assignment_key: 'cars_passage_subject_fact_checker',
    conditional: 'required_for_cars_after_original_passage_subject_selection',
    output: 'cars_passage_subject_fact_check_record',
  },
  {
    order: 6,
    stage: 'output_rights_and_originality_review',
    assignment_key: 'input_output_rights_reviewer',
    output: 'output_rights_and_originality_record',
  },
  {
    order: 7,
    stage: 'candidate_artifact_freeze_and_g01_g06_evidence',
    assignment_key: 'release_integrator',
    output:
      'candidate_file_manifest_signed_production_validator_execution_and_assigned_reviewer_gate_reports',
  },
  {
    order: 8,
    stage: 'closed_clients_and_opaque_blind_service_deployment',
    assignment_key: 'release_integrator',
    output:
      'compiler_signed_closed_clients_recomputed_service_deployment_and_authority_signed_acl_attestation',
  },
  {
    order: 9,
    stage: 'blind_solve',
    assignment_key: 'blind_solver',
    output:
      'service_signed_foundation_profile_actions_semantic_transition_coverage_technical_checks_and_approval',
  },
  {
    order: 10,
    stage: 'accessibility_technical_audit',
    assignment_key: 'accessibility_technical_auditor',
    output: 'harness_signed_browser_evidence_and_assigned_auditor_signed_approval',
  },
  {
    order: 11,
    stage: 'cross_lesson_similarity_audit',
    assignment_key: 'similarity_auditor',
    output: 'complete_cumulative_corpus_manifest_and_multi_reviewer_signed_similarity_report',
  },
  {
    order: 12,
    stage: 'reviewed_hash',
    assignment_key: 'release_integrator',
    output: 'immutable_reviewed_content_hash',
  },
  {
    order: 13,
    stage: 'publication_gate',
    assignment_key: 'final_approver',
    output: 'publication_decision',
  },
]);

const SEVERITY_TAXONOMY = Object.freeze([
  {
    severity: 'P0',
    definition:
      'Critical integrity or safety failure: plan-pin/canonical-scope corruption, protected-content or key exposure, unauthorized rights use, held-scope activation, bypass activation, or a defect requiring immediate containment.',
    blocks_internal_draft_integration: true,
    blocks_publication: true,
    required_disposition:
      'Stop the wave, contain exposure, invalidate affected artifacts/evidence, and resolve before revalidation.',
  },
  {
    severity: 'P1',
    definition:
      'Major correctness or process failure: material factual/key error, missing required independent role, invalid KC/activity alignment, broken deterministic path, inaccessible essential path, or failed G01-G10 evidence.',
    blocks_internal_draft_integration: true,
    blocks_publication: true,
    required_disposition: 'Resolve and rerun every affected review stage before integration.',
  },
  {
    severity: 'P2',
    definition:
      'Moderate bounded defect that does not invalidate a G01-G10 requirement or expose learners, but requires correction before publication.',
    blocks_internal_draft_integration: false,
    blocks_publication: true,
    required_disposition:
      'Internal-draft integration requires documented containment, owner, due date, and publication block; resolve before G12.',
  },
  {
    severity: 'P3',
    definition:
      'Minor editorial or maintainability defect with no material correctness, rights, accessibility, evidence, or execution effect.',
    blocks_internal_draft_integration: false,
    blocks_publication: false,
    required_disposition:
      'Track with an owner; fix opportunistically or before the next ordinary revision.',
  },
]);

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sortedUnique(values) {
  return [...new Set(values)].sort(compareText);
}

function hashText(value) {
  return createHash('sha256').update(value).digest('hex');
}

function collectExactReferenceStrings(value, pattern, result = new Set()) {
  if (typeof value === 'string') {
    if (pattern.test(value)) result.add(value);
    return result;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectExactReferenceStrings(item, pattern, result);
    return result;
  }
  if (value !== null && typeof value === 'object') {
    for (const item of Object.values(value)) {
      collectExactReferenceStrings(item, pattern, result);
    }
  }
  return result;
}

function collectArrayValuesForKey(value, targetKey, result = []) {
  if (Array.isArray(value)) {
    for (const item of value) collectArrayValuesForKey(item, targetKey, result);
    return result;
  }
  if (value === null || typeof value !== 'object') return result;
  for (const [key, item] of Object.entries(value)) {
    if (key === targetKey) {
      assert(Array.isArray(item), `${targetKey} must be an array`);
      result.push(...item);
    }
    collectArrayValuesForKey(item, targetKey, result);
  }
  return result;
}

function indexBy(records, key, label) {
  const result = new Map();
  for (const record of records) {
    const id = record[key];
    assert.equal(typeof id, 'string', `${label} record is missing ${key}`);
    assert(!result.has(id), `Duplicate ${label} ID: ${id}`);
    result.set(id, record);
  }
  return result;
}

function assertExactArray(actual, expected, label) {
  assert.deepEqual(actual, expected, `${label} differs from its canonical ordered value`);
}

function deriveDomainBucket(sourceSections) {
  const sections = new Set(sourceSections);
  if (sections.size === 1 && sections.has('CARS')) return 'CARS';
  if (sections.size === 3 && sections.has('B/B') && sections.has('C/P') && sections.has('P/S')) {
    return 'CROSS_CUTTING_SIRS';
  }
  if (sections.size === 2 && sections.has('Bio/Biochem') && sections.has('Chem/Phys')) {
    return 'BIO_CHEM_SHARED';
  }
  if (sections.size === 1 && sections.has('Bio/Biochem')) return 'BIO_BIOCHEM';
  if (sections.size === 1 && sections.has('Chem/Phys')) return 'CHEM_PHYS';
  if (sections.size === 1 && sections.has('Psych/Soc')) return 'PSYCH_SOC';
  throw new Error(`Unsupported source-section combination: ${sourceSections.join('|')}`);
}

function deriveFactCheckSpecialties(sourceSections) {
  const specialties = [];
  const sections = new Set(sourceSections);
  if (sections.has('B/B') || sections.has('Bio/Biochem')) {
    specialties.push('BIO_BIOCHEM_SUBJECT_MATTER_EXPERT');
  }
  if (sections.has('C/P') || sections.has('Chem/Phys')) {
    specialties.push('CHEM_PHYS_SUBJECT_MATTER_EXPERT');
  }
  if (sections.has('P/S') || sections.has('Psych/Soc')) {
    specialties.push('PSYCH_SOC_SUBJECT_MATTER_EXPERT');
  }
  if (sections.has('CARS')) {
    specialties.push('CARS_PASSAGE_REASONING_EDITOR');
  }
  if (deriveDomainBucket(sourceSections) === 'CROSS_CUTTING_SIRS') {
    specialties.push('SCIENTIFIC_INQUIRY_AND_RESEARCH_METHODS_EXPERT');
  }
  return sortedUnique(specialties);
}

function collectNormalizedRelations(normalizedRelations) {
  const collections = Object.entries(normalizedRelations)
    .filter(([, value]) => Array.isArray(value))
    .sort(([left], [right]) => compareText(left, right));
  const relationById = new Map();
  for (const [collection, relations] of collections) {
    for (const relation of relations) {
      if (typeof relation.relation_id !== 'string') continue;
      assert(
        !relationById.has(relation.relation_id),
        `Duplicate relation ID: ${relation.relation_id}`,
      );
      relationById.set(relation.relation_id, { collection, relation });
    }
  }
  return relationById;
}

function getCanonicalIndexes(sourceManifest) {
  const { curriculum, graph, sequence } = sourceManifest;
  const normalized = sequence.normalized_relations;
  const relationById = collectNormalizedRelations(normalized);
  const lessonById = indexBy(curriculum.lessons, 'lesson_id', 'lesson');
  const kcById = indexBy(curriculum.kcs, 'kc_id', 'KC');
  const groupingById = indexBy(curriculum.groupings, 'grouping_id', 'grouping');
  const groupingByLessonId = indexBy(curriculum.groupings, 'lesson_id', 'lesson grouping');
  const extensionById = indexBy(curriculum.extensions, 'extension_id', 'extension');
  const capstoneById = indexBy(curriculum.capstones, 'capstone_id', 'capstone');
  const supportById = indexBy(curriculum.support_artifacts, 'support_id', 'support');
  const edgeById = indexBy(graph.edges, 'edge_id', 'edge');
  const phaseById = indexBy(sequence.phases, 'phase_id', 'phase');
  const moduleById = indexBy(sequence.modules, 'module_id', 'module');
  const pathwayById = indexBy(sequence.pathways, 'pathway_id', 'pathway');

  const firstDeliveries = normalized.module_delivery_event_relations.filter(
    (relation) => relation.placement_kind === 'LESSON_FIRST_DELIVERY',
  );
  const firstDeliveryByLessonId = indexBy(
    firstDeliveries,
    'target_lesson_id',
    'lesson first-delivery',
  );
  const internalOrderByLessonId = indexBy(
    normalized.lesson_internal_order_relations,
    'lesson_id',
    'lesson internal-order',
  );
  const revisitByLessonId = indexBy(
    normalized.module_revisit_relations,
    'target_lesson_id',
    'lesson revisit',
  );

  const entityOwnerLessonId = new Map();
  for (const kc of curriculum.kcs) entityOwnerLessonId.set(kc.kc_id, kc.owning_lesson_id);
  for (const capstone of curriculum.capstones) {
    entityOwnerLessonId.set(capstone.capstone_id, capstone.owning_lesson_id);
  }

  return {
    capstoneById,
    edgeById,
    entityOwnerLessonId,
    extensionById,
    firstDeliveryByLessonId,
    groupingById,
    groupingByLessonId,
    internalOrderByLessonId,
    kcById,
    lessonById,
    moduleById,
    pathwayById,
    phaseById,
    relationById,
    revisitByLessonId,
    supportById,
  };
}

function validateSourceManifest(sourceManifest) {
  assert.equal(sourceManifest.schema_version, EXPECTED.sourceSchemaVersion);
  assert.equal(sourceManifest.metadata.registry.artifact_id, EXPECTED.registryArtifactId);
  assert.equal(sourceManifest.metadata.registry.sha256, EXPECTED.registrySha256);
  assert.equal(sourceManifest.metadata.canonical_contract.sha256, EXPECTED.contractSha256);
  assert.equal(sourceManifest.curriculum.lessons.length, EXPECTED.counts.lessons);
  assert.equal(sourceManifest.curriculum.kcs.length, EXPECTED.counts.kcs);
  assert.equal(sourceManifest.curriculum.groupings.length, EXPECTED.counts.groupings);
  assert.equal(sourceManifest.metadata.counts.lessons, EXPECTED.counts.lessons);
  assert.equal(sourceManifest.metadata.counts.kcs, EXPECTED.counts.kcs);
  assert.equal(sourceManifest.metadata.counts.groupings, EXPECTED.counts.groupings);
  assert.deepEqual(
    sourceManifest.metadata.held_nonrequired_entity_ids,
    HELD_GOVERNANCE_ONLY_ENTITY_IDS,
  );

  const indexes = getCanonicalIndexes(sourceManifest);
  assert.equal(indexes.firstDeliveryByLessonId.size, EXPECTED.counts.lessons);
  assert.equal(indexes.internalOrderByLessonId.size, EXPECTED.counts.lessons);
  assert.equal(indexes.revisitByLessonId.size, EXPECTED.counts.lessons);

  for (const prototypeLessonId of PROTOTYPE_LESSON_IDS) {
    assert(
      indexes.lessonById.has(prototypeLessonId),
      `Missing prototype shell ${prototypeLessonId}`,
    );
  }

  for (const lesson of sourceManifest.curriculum.lessons) {
    assert.equal(lesson.lesson_type, 'CORE');
    assert.equal(lesson.accelerated_handling.currently_authorized_bypass, false);
    assert.equal(lesson.accelerated_handling.fail_closed, true);
    const grouping = indexes.groupingByLessonId.get(lesson.lesson_id);
    const internalOrder = indexes.internalOrderByLessonId.get(lesson.lesson_id);
    assert(grouping, `Missing grouping for ${lesson.lesson_id}`);
    assert(internalOrder, `Missing internal order for ${lesson.lesson_id}`);
    assert.equal(grouping.grouping_id, lesson.owning_cluster_id);
    assertExactArray(
      internalOrder.ordered_nested_kc_ids,
      lesson.nested_kc_ids,
      `${lesson.lesson_id} nested KC order`,
    );
    assertExactArray(
      grouping.member_kc_ids,
      lesson.nested_kc_ids,
      `${lesson.lesson_id} grouping KC order`,
    );
  }

  for (const relation of sourceManifest.sequence.normalized_relations
    .accelerated_candidate_relations) {
    assert.equal(relation.currently_authorized_bypass, false);
    assert.equal(relation.fail_closed, true);
    assert.equal(relation.scope_retained, true);
  }

  for (const entityId of HELD_GOVERNANCE_ONLY_ENTITY_IDS) {
    const attachment = indexes.extensionById.get(entityId) ?? indexes.capstoneById.get(entityId);
    assert(attachment, `Missing held attachment ${entityId}`);
    assert.equal(attachment.delivery_state, 'governance_only');
  }
  return indexes;
}

function compactEdge(edge, indexes) {
  return {
    blocks_readiness: edge.blocks_readiness,
    edge_id: edge.edge_id,
    edge_type: edge.edge_type,
    point_of_use_warrants: edge.point_of_use_warrants,
    readiness_effect: edge.readiness_effect,
    repair_reentry: edge.repair_reentry,
    required_representation: edge.required_representation,
    risk: edge.risk,
    source_id: edge.source_id,
    source_lesson_id: indexes.entityOwnerLessonId.get(edge.source_id) ?? null,
    source_type: edge.source_type,
    target_id: edge.target_id,
    target_lesson_id: indexes.entityOwnerLessonId.get(edge.target_id) ?? null,
    target_type: edge.target_type,
  };
}

function attachmentTreatment(deliveryState, attachmentType) {
  if (deliveryState === 'governance_only') return 'governance_only_reference';
  if (deliveryState === 'host_only') return 'host_bound_nonmastery_context';
  if (deliveryState === 'required' && attachmentType === 'capstone') {
    return 'separate_activity_definition_reference';
  }
  if (deliveryState === 'nonrequired') return 'nonrequired_reference';
  throw new Error(`Unsupported attachment state ${deliveryState} for ${attachmentType}`);
}

function heldRelationIdsFor(entityId, normalizedRelations) {
  return normalizedRelations.held_nonrequired_relations
    .filter((relation) => relation.entity_id === entityId)
    .map((relation) => relation.relation_id)
    .sort(compareText);
}

function compactExtension(extension, normalizedRelations) {
  return {
    attachment_id: extension.extension_id,
    attachment_type: 'extension',
    authoring_treatment: attachmentTreatment(extension.delivery_state, 'extension'),
    delivery_relation_ids: sortedUnique([
      ...(extension.delivery_evidence?.source_relation_ids ?? []),
      ...(extension.delivery_evidence?.host_first_delivery_relation_id
        ? [extension.delivery_evidence.host_first_delivery_relation_id]
        : []),
    ]),
    delivery_state: extension.delivery_state,
    held_relation_ids: heldRelationIdsFor(extension.extension_id, normalizedRelations),
    host_capstone_ids: extension.host_capstone_ids,
    host_core_ids: extension.host_core_ids,
    host_lesson_ids: extension.host_lesson_ids,
    owning_lesson_id: extension.owning_lesson_id,
    performance_delta: extension.performance_delta,
    preserved_invariant: extension.preserved_invariant,
    required_lesson_microcycle: false,
    source_anchor_ids: extension.source_anchor_ids,
  };
}

function compactCapstone(capstone, normalizedRelations, lessonId) {
  return {
    attachment_id: capstone.capstone_id,
    attachment_type: 'capstone',
    authoring_treatment: attachmentTreatment(capstone.delivery_state, 'capstone'),
    binding_role: capstone.owning_lesson_id === lessonId ? 'owning_lesson' : 'referenced_lesson',
    component_kc_ids: capstone.component_kc_ids,
    delivery_relation_ids: sortedUnique([
      ...(capstone.delivery_evidence?.source_relation_ids ?? []),
      ...(capstone.delivery_evidence?.placement_relation_id
        ? [capstone.delivery_evidence.placement_relation_id]
        : []),
    ]),
    delivery_state: capstone.delivery_state,
    held_relation_ids: heldRelationIdsFor(capstone.capstone_id, normalizedRelations),
    hold_ids: capstone.hold_ids,
    owning_lesson_id: capstone.owning_lesson_id,
    placement_rule: capstone.placement_rule,
    required_lesson_microcycle: false,
    source_anchor_ids: capstone.source_anchor_ids,
  };
}

function compactSupport(support) {
  return {
    attachment_id: support.support_id,
    attachment_type: 'support',
    authoring_treatment: attachmentTreatment(support.delivery_state, 'support'),
    delivery_relation_ids: sortedUnique([
      ...(support.delivery_evidence?.source_relation_ids ?? []),
      ...(support.delivery_evidence?.host_first_delivery_relation_id
        ? [support.delivery_evidence.host_first_delivery_relation_id]
        : []),
    ]),
    delivery_state: support.delivery_state,
    host_lesson_id: support.host_lesson_id,
    not_a_standalone_lesson: support.not_a_standalone_lesson,
    purpose: support.purpose,
    required_lesson_microcycle: false,
    routing_effect: support.routing_effect,
  };
}

function compactRepairRelation(reference) {
  const { collection, relation } = reference;
  return {
    collection,
    exact_reentry: relation.exact_reentry,
    exit_evidence_placeholder: relation.exit_evidence_placeholder,
    external_prerequisite_closure: relation.external_prerequisite_closure,
    failed_target_id: relation.failed_target_id,
    failed_target_type: relation.failed_target_type,
    pathway_id: relation.pathway_id,
    relation_id: relation.relation_id,
    repair_action_placeholder: relation.repair_action_placeholder,
  };
}

function makeAssignmentSlots(jobId, requiredSpecialties, domainBucket) {
  const roleNames = {
    accessibility_technical_auditor: 'ACCESSIBILITY_TECHNICAL_AUDITOR',
    author: 'LESSON_AUTHOR',
    blind_solver: 'INDEPENDENT_BLIND_SOLVER',
    content_pedagogy_auditor: 'INDEPENDENT_CONTENT_PEDAGOGY_AUDITOR',
    final_approver: 'FINAL_PUBLICATION_APPROVER',
    input_output_rights_reviewer: 'INDEPENDENT_INPUT_OUTPUT_RIGHTS_REVIEWER',
    release_integrator: 'RELEASE_HASH_INTEGRATOR',
    similarity_auditor: 'CROSS_LESSON_SIMILARITY_AUDITOR',
  };
  const slotIds = Object.fromEntries(
    Object.entries(roleNames).map(([key, role]) => [
      key,
      key === 'author' ? `${jobId}::AUTHOR` : `${jobId}::${role}`,
    ]),
  );
  const mustDifferByKey = {
    accessibility_technical_auditor: ['author'],
    author: [],
    blind_solver: ['author', 'final_approver'],
    content_pedagogy_auditor: ['author'],
    final_approver: ['author', 'blind_solver'],
    input_output_rights_reviewer: ['author'],
    release_integrator: ['author'],
    similarity_auditor: ['author'],
  };
  const coreSlots = Object.fromEntries(
    Object.entries(roleNames).map(([key, role]) => {
      return [
        key,
        {
          must_be_distinct_from_slot_ids: mustDifferByKey[key].map((otherKey) => slotIds[otherKey]),
          role,
          slot_id: slotIds[key],
        },
      ];
    }),
  );
  const carsReasoningSlotId = `${jobId}::DOMAIN_SCIENTIFIC_FACT_CHECKER::CARS_PASSAGE_REASONING_EDITOR`;
  const carsPassageSubjectSlotId = `${jobId}::CARS_PASSAGE_SUBJECT_FACT_CHECKER`;
  const domainScientificFactCheckers = requiredSpecialties.map((specialty) => ({
    must_be_distinct_from_slot_ids: [
      slotIds.author,
      ...(specialty === 'CARS_PASSAGE_REASONING_EDITOR' ? [carsPassageSubjectSlotId] : []),
    ],
    role: 'DOMAIN_SCIENTIFIC_FACT_CHECKER',
    slot_id: `${jobId}::DOMAIN_SCIENTIFIC_FACT_CHECKER::${specialty}`,
    specialty,
  }));
  const carsPassageSubjectFactChecker =
    domainBucket === 'CARS'
      ? {
          must_be_distinct_from_slot_ids: [slotIds.author, carsReasoningSlotId],
          role: 'CARS_PASSAGE_SUBJECT_FACT_CHECKER',
          slot_id: carsPassageSubjectSlotId,
          specialty: 'SELECT_AFTER_ORIGINAL_PASSAGE_SUBJECT',
        }
      : null;

  return {
    ...coreSlots,
    cars_passage_subject_fact_checker: carsPassageSubjectFactChecker,
    domain_scientific_fact_checkers: domainScientificFactCheckers,
  };
}

function getAssignmentSlots(job) {
  const slots = [];
  for (const [key, value] of Object.entries(job.assignments)) {
    if (key === 'domain_scientific_fact_checkers') {
      assert(Array.isArray(value), `${job.job_id} domain fact-check slots must be an array`);
      slots.push(...value);
      continue;
    }
    if (key === 'cars_passage_subject_fact_checker' && value === null) continue;
    assert(value && typeof value === 'object', `${job.job_id} assignment ${key} is invalid`);
    slots.push(value);
  }
  return slots.sort((left, right) => compareText(left.slot_id, right.slot_id));
}

function complexityEstimate({
  activeAttachmentCount,
  grouping,
  hardPointOfUseCount,
  kcs,
  sourceSections,
  uniqueRepresentations,
}) {
  const points =
    kcs.length * 4 +
    uniqueRepresentations.length +
    grouping.knowledge_textures.length +
    activeAttachmentCount * 2 +
    hardPointOfUseCount * 2 +
    Math.max(0, sourceSections.length - 1) * 2;
  const level =
    points <= 14 ? 'LOW' : points <= 24 ? 'MODERATE' : points <= 34 ? 'HIGH' : 'VERY_HIGH';
  return {
    level,
    points,
    scoring_version: 'STRUCTURAL_COMPLEXITY_V1',
    structural_factors: {
      active_attachment_count: activeAttachmentCount,
      hard_point_of_use_count: hardPointOfUseCount,
      kc_microcycle_count: kcs.length,
      knowledge_texture_count: grouping.knowledge_textures.length,
      source_section_code_count: sourceSections.length,
      unique_representation_count: uniqueRepresentations.length,
    },
  };
}

function riskEstimate({ attachments, domainBucket, lesson, neighborhoodEdges, sourceSections }) {
  const graphRiskCounts = { high: 0, low: 0, medium: 0 };
  for (const edge of neighborhoodEdges) {
    const level = edge.risk?.level;
    if (level in graphRiskCounts) graphRiskCounts[level] += 1;
  }
  const governanceOnlyCount = attachments.filter(
    (attachment) => attachment.delivery_state === 'governance_only',
  ).length;
  const points =
    2 +
    graphRiskCounts.high * 3 +
    graphRiskCounts.medium * 2 +
    graphRiskCounts.low +
    governanceOnlyCount * 4 +
    Math.min(3, lesson.unresolved_holds.length) +
    Math.max(0, sourceSections.length - 1) * 2 +
    (domainBucket === 'CARS' ? 2 : 0);
  const level =
    points <= 8 ? 'LOW' : points <= 16 ? 'MODERATE' : points <= 26 ? 'HIGH' : 'VERY_HIGH';
  return {
    level,
    points,
    risk_factors: {
      authority_refresh_pending: true,
      cars_original_passage_rights_risk: domainBucket === 'CARS',
      governance_only_attachment_count: governanceOnlyCount,
      graph_edge_risk_counts: graphRiskCounts,
      learner_validation_pending: true,
      unresolved_hold_count: lesson.unresolved_holds.length,
    },
    scoring_version: 'AUTHORING_RISK_V1',
  };
}

function buildBaseJob(sourceManifest, lesson, indexes) {
  const normalized = sourceManifest.sequence.normalized_relations;
  const grouping = indexes.groupingByLessonId.get(lesson.lesson_id);
  const internalOrder = indexes.internalOrderByLessonId.get(lesson.lesson_id);
  const firstDelivery = indexes.firstDeliveryByLessonId.get(lesson.lesson_id);
  const revisit = indexes.revisitByLessonId.get(lesson.lesson_id);
  assert(grouping && internalOrder && firstDelivery && revisit);

  const orderedKcs = internalOrder.ordered_nested_kc_ids.map((kcId, index) => {
    const kc = indexes.kcById.get(kcId);
    assert(kc, `Missing KC ${kcId} for ${lesson.lesson_id}`);
    assert.equal(kc.owning_lesson_id, lesson.lesson_id);
    return {
      aamc_pages: kc.aamc_pages,
      display_label: kc.display_label,
      hard_prerequisite_ids: kc.hard_prerequisite_ids,
      helpful_prerequisite_ids: kc.helpful_prerequisite_ids,
      kc_id: kc.kc_id,
      microcycle_ordinal: index + 1,
      owning_lesson_id: kc.owning_lesson_id,
      representations: kc.representations,
      scope_in: kc.scope_in,
      scope_out: kc.scope_out,
      source_anchor_ids: kc.source_anchor_ids,
      statement_of_competence: kc.statement_of_competence,
      transfer_expectation: kc.transfer_expectation,
    };
  });

  const ownedCapstoneIds = sourceManifest.curriculum.capstones
    .filter((capstone) => capstone.owning_lesson_id === lesson.lesson_id)
    .map((capstone) => capstone.capstone_id);
  const pointOfUseEntityIds = new Set([...lesson.nested_kc_ids, ...ownedCapstoneIds]);
  const nestedKcIds = new Set(lesson.nested_kc_ids);

  const incomingPrerequisiteEdges = sourceManifest.graph.edges
    .filter(
      (edge) =>
        pointOfUseEntityIds.has(edge.target_id) &&
        (edge.edge_type === 'HARD_PREREQUISITE' || edge.edge_type === 'HELPFUL_PREREQUISITE'),
    )
    .sort((left, right) => compareText(left.edge_id, right.edge_id));
  const hardEdges = incomingPrerequisiteEdges.filter(
    (edge) => edge.edge_type === 'HARD_PREREQUISITE',
  );
  const helpfulEdges = incomingPrerequisiteEdges.filter(
    (edge) => edge.edge_type === 'HELPFUL_PREREQUISITE',
  );

  const blockingHardEdges = hardEdges.filter((edge) => {
    const sourceLessonId = indexes.entityOwnerLessonId.get(edge.source_id);
    return (
      nestedKcIds.has(edge.target_id) &&
      sourceLessonId !== undefined &&
      sourceLessonId !== lesson.lesson_id
    );
  });
  const blockingDependencyLessonIds = sortedUnique(
    blockingHardEdges.map((edge) => indexes.entityOwnerLessonId.get(edge.source_id)),
  );

  const directExtensions = lesson.extension_ids.map((extensionId) => {
    const extension = indexes.extensionById.get(extensionId);
    assert(extension, `Missing extension ${extensionId} for ${lesson.lesson_id}`);
    return compactExtension(extension, normalized);
  });
  const directCapstones = lesson.capstone_ids.map((capstoneId) => {
    const capstone = indexes.capstoneById.get(capstoneId);
    assert(capstone, `Missing capstone ${capstoneId} for ${lesson.lesson_id}`);
    return compactCapstone(capstone, normalized, lesson.lesson_id);
  });
  const directSupports = lesson.support_artifact_ids.map((supportId) => {
    const support = indexes.supportById.get(supportId);
    assert(support, `Missing support ${supportId} for ${lesson.lesson_id}`);
    return compactSupport(support);
  });
  const attachments = [...directExtensions, ...directCapstones, ...directSupports].sort(
    (left, right) => compareText(left.attachment_id, right.attachment_id),
  );

  const repairRelations = lesson.sequence_relation_refs.remediation_and_reentry
    .map((relationId) => {
      const reference = indexes.relationById.get(relationId);
      assert(reference, `Missing repair relation ${relationId} for ${lesson.lesson_id}`);
      assert(
        reference.collection === 'domain_remediation_relations' ||
          reference.collection === 'cars_repair_relations',
        `${relationId} is not an exact remediation relation`,
      );
      return compactRepairRelation(reference);
    })
    .sort((left, right) => compareText(left.relation_id, right.relation_id));

  const repairSupportIds = sortedUnique(
    repairRelations
      .map(
        (relation) => relation.external_prerequisite_closure?.conditional_below_ceiling_support_id,
      )
      .filter(Boolean),
  );
  const referencedRepairSupports = repairSupportIds.map((supportId) => {
    const support = indexes.supportById.get(supportId);
    assert(support, `Missing repair support ${supportId} for ${lesson.lesson_id}`);
    return compactSupport(support);
  });

  const sirsMathRelations = normalized.sirs_math_point_of_use_relations
    .filter((relation) => relation.target_lesson_id === lesson.lesson_id)
    .sort((left, right) => compareText(left.relation_id, right.relation_id));
  const helpfulOrderRelations = normalized.helpful_order_decision_relations
    .filter(
      (relation) =>
        relation.target_lesson_id === lesson.lesson_id ||
        relation.source_lesson_id === lesson.lesson_id,
    )
    .sort((left, right) => compareText(left.relation_id, right.relation_id));
  const pathwayRelations = normalized.pathway_lesson_scope_relations
    .filter((relation) => relation.lesson_id === lesson.lesson_id)
    .sort((left, right) => compareText(left.relation_id, right.relation_id));
  const phaseModuleRelation = normalized.phase_module_relations.find(
    (relation) =>
      relation.phase_id === firstDelivery.phase_id &&
      relation.module_id === firstDelivery.module_id,
  );
  assert(phaseModuleRelation, `Missing phase-module relation for ${lesson.lesson_id}`);

  const phase = indexes.phaseById.get(firstDelivery.phase_id);
  const module = indexes.moduleById.get(firstDelivery.module_id);
  assert(phase && module);

  const pathways = pathwayRelations.map((relation) => {
    const pathway = indexes.pathwayById.get(relation.pathway_id);
    assert(pathway, `Missing pathway ${relation.pathway_id}`);
    return {
      currently_authorized_bypass: pathway.currently_authorized_bypass,
      first_delivery_relation_id: relation.first_delivery_relation_id,
      pathway_id: pathway.pathway_id,
      pathway_type: pathway.pathway_type,
      relation_id: relation.relation_id,
      title: pathway.title,
    };
  });
  assert(pathways.length > 0, `No pathway relation for ${lesson.lesson_id}`);
  assert(
    pathways.some((pathway) => pathway.pathway_type === 'COMPREHENSIVE'),
    `${lesson.lesson_id} lacks the comprehensive pathway`,
  );

  const neighborhoodEdges = sourceManifest.graph.edges.filter(
    (edge) => pointOfUseEntityIds.has(edge.source_id) || pointOfUseEntityIds.has(edge.target_id),
  );
  const uniqueRepresentations = sortedUnique(orderedKcs.flatMap((kc) => kc.representations));
  const domainBucket = deriveDomainBucket(lesson.source_sections);
  const jobId = `V3-AUTHORING-JOB::${lesson.lesson_id}`;
  const isPrototype = PROTOTYPE_LESSON_IDS.includes(lesson.lesson_id);
  const requiredFactCheckSpecialties = deriveFactCheckSpecialties(lesson.source_sections);

  const complexity = complexityEstimate({
    activeAttachmentCount: attachments.filter(
      (attachment) => attachment.delivery_state !== 'governance_only',
    ).length,
    grouping,
    hardPointOfUseCount: hardEdges.length,
    kcs: orderedKcs,
    sourceSections: lesson.source_sections,
    uniqueRepresentations,
  });
  const risk = riskEstimate({
    attachments,
    domainBucket,
    lesson,
    neighborhoodEdges,
    sourceSections: lesson.source_sections,
  });

  return {
    acceptance: {
      gate_evidence_status: 'NOT_EVALUATED',
      production_publication_eligible: false,
      required_gate_ids: [...REQUIRED_ACCEPTANCE_GATE_IDS],
    },
    accelerated_bypass_authorized: false,
    assignments: makeAssignmentSlots(jobId, requiredFactCheckSpecialties, domainBucket),
    attachments: {
      capstones: directCapstones,
      extensions: directExtensions,
      supports: directSupports,
    },
    authoring_dependencies: {
      blocking_hard_point_of_use: blockingDependencyLessonIds.map((dependencyLessonId) => ({
        dependency_job_id: `V3-AUTHORING-JOB::${dependencyLessonId}`,
        dependency_lesson_id: dependencyLessonId,
        edge_ids: blockingHardEdges
          .filter((edge) => indexes.entityOwnerLessonId.get(edge.source_id) === dependencyLessonId)
          .map((edge) => edge.edge_id)
          .sort(compareText),
        target_first_delivery_relation_id: firstDelivery.relation_id,
      })),
      scheduling_rule:
        'Only cross-lesson HARD_PREREQUISITE edges into nested KCs block authoring-wave eligibility. Canonical first-delivery relation fields provide placement and deterministic tie-breaking; array adjacency and nonblocking relations create no prerequisite.',
    },
    authoring_mode: isPrototype ? 'PILOT_PROTOTYPE_PORT' : 'NEW_CLEAN_ROOM_AUTHORING',
    canonical_scope: {
      aamc_pages: lesson.aamc_pages,
      concise_scope: lesson.concise_scope,
      content_categories: lesson.content_categories,
      foundational_concepts: lesson.foundational_concepts,
      scope_exclusions: lesson.scope_exclusions,
      source_anchor_ids: lesson.source_anchor_ids,
    },
    complexity,
    domain_bucket: domainBucket,
    grouping: {
      grouping_id: grouping.grouping_id,
      knowledge_textures: grouping.knowledge_textures,
      natural_practice_family: grouping.natural_practice_family,
      throughline: grouping.throughline,
    },
    interaction_and_representation_needs: {
      active_representation_required_when_constitutive: true,
      allowed_kc_archetypes: [
        'conceptual_causal',
        'quantitative_procedural',
        'spatial_structural',
        'experimental_data',
        'taxonomy_factual',
        'behavioral_social_theory',
        'cars_reasoning',
      ],
      archetype_selection_required_per_kc: true,
      keyboard_and_nonvisual_equivalence_required: true,
      meaningful_learner_response_required_per_kc: true,
      representation_inventory: orderedKcs.map((kc) => ({
        kc_id: kc.kc_id,
        representations: kc.representations,
      })),
      unique_canonical_representation_needs: uniqueRepresentations,
    },
    job_id: jobId,
    job_kind: isPrototype ? 'prototype_port' : 'new_authoring',
    knowledge_component_microcycles: orderedKcs,
    lesson_contract_id: 'V3_LESSON_DEFINITION_CONTRACT_0_2',
    lesson_id: lesson.lesson_id,
    lesson_label: lesson.canonical_display_label,
    point_of_use_support_and_repair: {
      exact_remediation_relations: repairRelations,
      helpful_order_relations: helpfulOrderRelations,
      repair_support_artifacts: referencedRepairSupports,
      sirs_math_relations: sirsMathRelations,
    },
    prerequisites: {
      hard: hardEdges.map((edge) => compactEdge(edge, indexes)),
      helpful: helpfulEdges.map((edge) => compactEdge(edge, indexes)),
    },
    prototype_port: isPrototype
      ? {
          approved_internal_prototype_id: lesson.lesson_id,
          artifact_location: null,
          prototype_reviewed_hash: null,
          production_definition_status: 'NOT_A_PRODUCTION_DEFINITION',
          port_rule:
            'Rebind and independently review against this job; do not inherit prototype publication status, hashes, rights, or efficacy.',
        }
      : null,
    required_domain_fact_check_specialties: requiredFactCheckSpecialties,
    risk,
    sequence: {
      first_delivery: {
        global_delivery_event_ordinal: firstDelivery.global_delivery_event_ordinal,
        lane: firstDelivery.lane,
        lesson_first_delivery_ordinal: firstDelivery.lesson_first_delivery_ordinal,
        module_event_order: firstDelivery.module_event_order,
        module_id: firstDelivery.module_id,
        phase_id: firstDelivery.phase_id,
        relation_id: firstDelivery.relation_id,
      },
      internal_order_relation_id: internalOrder.relation_id,
      module: {
        module_id: module.module_id,
        phase_module_relation_id: phaseModuleRelation.relation_id,
        title: module.title,
      },
      pathways,
      phase: {
        phase_function: phase.phase_function,
        phase_id: phase.phase_id,
        title: phase.title,
      },
      revisit: {
        module_id: revisit.module_id,
        module_revisit_order: revisit.module_revisit_order,
        phase_id: revisit.phase_id,
        relation_id: revisit.relation_id,
        upgrade_types: revisit.upgrade_types,
      },
    },
    source_and_clean_room: {
      allowed_shared_inputs: [
        SOURCE_PATH,
        'curriculum/v3/README.md',
        sourceManifest.metadata.canonical_contract.path,
        'this_job_record_only',
      ],
      other_lesson_drafts_allowed: false,
      separately_ledgered_current_authoritative_open_factual_sources_allowed: true,
      protected_items_or_answer_keys_allowed: false,
      prototype_input_allowed: isPrototype,
      source_ledger_required: true,
      source_prose_copying_allowed: false,
    },
    source_sections: lesson.source_sections,
    unresolved_hold_ids: lesson.unresolved_holds,
  };
}

function jobComparator(left, right, unlockCounts) {
  const unlockDifference =
    (unlockCounts.get(right.lesson_id) ?? 0) - (unlockCounts.get(left.lesson_id) ?? 0);
  if (unlockDifference !== 0) return unlockDifference;
  const ordinalDifference =
    left.sequence.first_delivery.lesson_first_delivery_ordinal -
    right.sequence.first_delivery.lesson_first_delivery_ordinal;
  if (ordinalDifference !== 0) return ordinalDifference;
  return compareText(left.job_id, right.job_id);
}

function selectDomainBalancedBatch(readyJobs, allRemainingJobs, targetSize, waveOrdinal) {
  assert(readyJobs.length >= targetSize, 'Insufficient dependency-ready jobs for target wave size');
  const unlockCounts = new Map();
  for (const job of allRemainingJobs) {
    for (const dependency of job.authoring_dependencies.blocking_hard_point_of_use) {
      unlockCounts.set(
        dependency.dependency_lesson_id,
        (unlockCounts.get(dependency.dependency_lesson_id) ?? 0) + 1,
      );
    }
  }

  const availableByBucket = new Map(
    DOMAIN_BUCKET_ORDER.map((bucket) => [
      bucket,
      readyJobs
        .filter((job) => job.domain_bucket === bucket)
        .sort((left, right) => jobComparator(left, right, unlockCounts)),
    ]),
  );
  const remainingCounts = new Map(
    DOMAIN_BUCKET_ORDER.map((bucket) => [
      bucket,
      allRemainingJobs.filter((job) => job.domain_bucket === bucket).length,
    ]),
  );
  const selectedCounts = new Map(DOMAIN_BUCKET_ORDER.map((bucket) => [bucket, 0]));
  const selected = [];
  const rotatedDomainOrder = [
    ...DOMAIN_BUCKET_ORDER.slice(waveOrdinal % DOMAIN_BUCKET_ORDER.length),
    ...DOMAIN_BUCKET_ORDER.slice(0, waveOrdinal % DOMAIN_BUCKET_ORDER.length),
  ];

  while (selected.length < targetSize) {
    const candidates = rotatedDomainOrder.filter(
      (bucket) => (availableByBucket.get(bucket)?.length ?? 0) > 0,
    );
    assert(candidates.length > 0, 'No dependency-ready domain candidate remains');
    candidates.sort((left, right) => {
      const leftRemaining = remainingCounts.get(left) ?? 0;
      const rightRemaining = remainingCounts.get(right) ?? 0;
      const leftSelected = selectedCounts.get(left) ?? 0;
      const rightSelected = selectedCounts.get(right) ?? 0;
      const leftRatio = (leftSelected + 1) / Math.max(leftRemaining, 1);
      const rightRatio = (rightSelected + 1) / Math.max(rightRemaining, 1);
      if (leftRatio !== rightRatio) return leftRatio - rightRatio;
      return rotatedDomainOrder.indexOf(left) - rotatedDomainOrder.indexOf(right);
    });
    const chosenBucket = candidates[0];
    const chosenJob = availableByBucket.get(chosenBucket).shift();
    selected.push(chosenJob);
    selectedCounts.set(chosenBucket, (selectedCounts.get(chosenBucket) ?? 0) + 1);
  }

  return selected;
}

function summarizeCounts(values) {
  const counts = {};
  for (const value of values) counts[value] = (counts[value] ?? 0) + 1;
  return Object.fromEntries(
    Object.entries(counts).sort(([left], [right]) => compareText(left, right)),
  );
}

function buildWaves(baseJobs) {
  const jobByLessonId = new Map(baseJobs.map((job) => [job.lesson_id, job]));
  const pilotJobs = PROTOTYPE_LESSON_IDS.map((lessonId) => {
    const job = jobByLessonId.get(lessonId);
    assert(job, `Missing pilot job ${lessonId}`);
    return job;
  });
  const assignedWaveByLessonId = new Map(
    pilotJobs.map((job) => [job.lesson_id, 'V3-AUTH-W00-PILOT-PORT']),
  );
  const remaining = new Map(
    baseJobs
      .filter((job) => !PROTOTYPE_LESSON_IDS.includes(job.lesson_id))
      .map((job) => [job.lesson_id, job]),
  );
  const productionWaveCount = Math.ceil(remaining.size / PRODUCTION_MAX_AUTHORS);
  assert(
    remaining.size / productionWaveCount >= PRODUCTION_MIN_AUTHORS,
    'Production waves would be smaller than the quality-preserving minimum',
  );

  const waveJobGroups = [
    {
      jobs: pilotJobs,
      wave_id: 'V3-AUTH-W00-PILOT-PORT',
      wave_kind: 'prototype_port_pilot',
      wave_ordinal: 0,
    },
  ];

  for (let waveOrdinal = 1; waveOrdinal <= productionWaveCount; waveOrdinal += 1) {
    const wavesLeft = productionWaveCount - waveOrdinal + 1;
    const targetSize = Math.ceil(remaining.size / wavesLeft);
    const remainingJobs = [...remaining.values()];
    const readyJobs = remainingJobs.filter((job) =>
      job.authoring_dependencies.blocking_hard_point_of_use.every((dependency) =>
        assignedWaveByLessonId.has(dependency.dependency_lesson_id),
      ),
    );
    const jobs = selectDomainBalancedBatch(readyJobs, remainingJobs, targetSize, waveOrdinal);
    const waveId = `V3-AUTH-W${String(waveOrdinal).padStart(2, '0')}`;
    for (const job of jobs) {
      assignedWaveByLessonId.set(job.lesson_id, waveId);
      remaining.delete(job.lesson_id);
    }
    waveJobGroups.push({
      jobs,
      wave_id: waveId,
      wave_kind: 'new_clean_room_authoring',
      wave_ordinal: waveOrdinal,
    });
  }
  assert.equal(remaining.size, 0);

  const waves = waveJobGroups.map((group, index) => {
    const dependencyWaveIds = sortedUnique(
      group.jobs.flatMap((job) =>
        job.authoring_dependencies.blocking_hard_point_of_use
          .map((dependency) => assignedWaveByLessonId.get(dependency.dependency_lesson_id))
          .filter((waveId) => waveId && waveId !== group.wave_id),
      ),
    );
    return {
      author_concurrency_limit: group.jobs.length,
      checkpoint: {
        blocking_severities_for_internal_draft_integration: ['P0', 'P1'],
        blocking_severities_for_publication: ['P0', 'P1', 'P2'],
        entry_requires: [
          'source_plan_check_passes',
          'all_required_prior_wave_checkpoints_merged',
          'separate_wave_assignment_overlay_validates_against_exact_source_plan_sha256',
          'externally_trusted_signed_hardened_foundation_pinset_and_artifacts_are_materialized',
        ],
        exit_requires: [
          'materialized_overlay_verifies_external_trust_pins_signed_receipts_and_complete_candidate_bound_g01_g10_evidence',
          'no_open_p0_or_p1_findings',
          'every_open_p2_has_containment_owner_due_date_and_publication_block',
          'opaque_real_response_blind_solve_and_acl_attempt_path_evidence_complete',
          'wave_similarity_report_binds_every_current_candidate_and_declared_comparison_wave',
          'deterministic_plan_and_repository_checks_pass',
          'reviewed_drafts_integrated_at_one_wave_checkpoint',
        ],
        production_publication_at_checkpoint: false,
      },
      complexity_counts: summarizeCounts(group.jobs.map((job) => job.complexity.level)),
      domain_counts: summarizeCounts(group.jobs.map((job) => job.domain_bucket)),
      independent_audit_concurrency_limit: PRODUCTION_MAX_AUTHORS,
      job_count: group.jobs.length,
      job_ids: group.jobs.map((job) => job.job_id),
      kc_microcycle_count: group.jobs.reduce(
        (count, job) => count + job.knowledge_component_microcycles.length,
        0,
      ),
      lesson_ids: group.jobs.map((job) => job.lesson_id),
      required_prior_wave_ids: dependencyWaveIds,
      similarity_comparison_wave_ids: waveJobGroups
        .slice(0, index + 1)
        .map((waveGroup) => waveGroup.wave_id),
      wave_id: group.wave_id,
      wave_kind: group.wave_kind,
      wave_ordinal: group.wave_ordinal,
    };
  });

  return { assignedWaveByLessonId, waves };
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

function buildAuthoringPlan(sourceManifest, sourceManifestSha256) {
  const indexes = validateSourceManifest(sourceManifest);
  assert.match(sourceManifestSha256, /^[a-f0-9]{64}$/);

  const baseJobs = sourceManifest.curriculum.lessons.map((lesson) =>
    buildBaseJob(sourceManifest, lesson, indexes),
  );
  const { assignedWaveByLessonId, waves } = buildWaves(baseJobs);
  const waveById = new Map(waves.map((wave) => [wave.wave_id, wave]));
  const jobs = baseJobs
    .map((job) => {
      const waveId = assignedWaveByLessonId.get(job.lesson_id);
      const wave = waveById.get(waveId);
      assert(wave);
      return {
        ...job,
        cross_lesson_similarity_audit: {
          comparison_wave_ids: wave.similarity_comparison_wave_ids,
          required: true,
          scope:
            'Compare against every candidate in this wave and the cryptographically pinned complete previously integrated corpus, across domains as well as within the job domain.',
        },
        wave_assignment: {
          wave_id: wave.wave_id,
          wave_job_ordinal: wave.lesson_ids.indexOf(job.lesson_id) + 1,
          wave_ordinal: wave.wave_ordinal,
        },
      };
    })
    .sort((left, right) => {
      const waveDifference = left.wave_assignment.wave_ordinal - right.wave_assignment.wave_ordinal;
      if (waveDifference !== 0) return waveDifference;
      return left.wave_assignment.wave_job_ordinal - right.wave_assignment.wave_job_ordinal;
    });

  const plan = {
    acceptance_gate_catalog: ACCEPTANCE_GATE_CATALOG,
    jobs,
    lesson_contract: {
      contract_id: 'V3_LESSON_DEFINITION_CONTRACT_0_2',
      forbidden_outputs: [
        'lesson_level_mastery_or_diagnostic_state',
        'new_or_changed_curriculum_identity',
        'capstone_result_inferred_from_component_kcs',
        'required_delivery_from_host_only_governance_only_or_nonrequired_attachments',
        'accelerated_bypass',
        'unreviewed_answer_keys_in_client_or_general_author_context',
        'efficacy_readiness_or_score_claims',
      ],
      required_input_contract: [
        'pinned_registry_artifact_sha_and_freeze_ids',
        'exact_lesson_grouping_and_ordered_kc_records',
        'authoritative_graph_neighborhood_and_point_of_use_warrants',
        'normalized_first_delivery_revisit_remediation_and_reentry_relations',
        'typed_attachments_delivery_states_and_holds',
        'per_kc_knowledge_in_use_authoring_inputs',
        'isolated_instructional_and_downstream_evidence_families',
        'provenance_rights_accessibility_and_review_contract',
      ],
      required_output_contract: [
        'immutable_lesson_shell_manifest_and_checkpoint_map',
        'one_primary_ordered_microcycle_manifest_per_kc',
        'deterministic_per_kc_activity_graph',
        'per_kc_feedback_bounded_repair_and_exact_reentry',
        'isolated_kc_exit_and_downstream_evidence_family_bindings',
        'typed_attachment_and_separate_activity_references',
        'resumable_shell_and_kc_checkpoints',
        'explicit_transitions_fallbacks_and_termination',
        'authority_bounded_keys_rationales_family_and_exposure_metadata',
        'event_schemas_accessibility_behavior_and_exact_reviewed_hash',
      ],
      source_contract_path: sourceManifest.metadata.canonical_contract.path,
      source_contract_sha256: sourceManifest.metadata.canonical_contract.sha256,
    },
    metadata: {
      authoring_job_counts: {
        new_clean_room_authoring: jobs.filter((job) => job.job_kind === 'new_authoring').length,
        prototype_ports: jobs.filter((job) => job.job_kind === 'prototype_port').length,
        total: jobs.length,
      },
      canonical_counts: {
        groupings: sourceManifest.curriculum.groupings.length,
        kc_microcycles: sourceManifest.curriculum.kcs.length,
        lessons: sourceManifest.curriculum.lessons.length,
      },
      deterministic: true,
      generated_by: GENERATOR_PATH,
      generation_timestamp: null,
      prototype_lesson_ids: [...PROTOTYPE_LESSON_IDS],
      registry: sourceManifest.metadata.registry,
      source_manifest_path: SOURCE_PATH,
      source_manifest_sha256: sourceManifestSha256,
      source_manifest_schema_version: sourceManifest.schema_version,
    },
    orchestration_policy: {
      actual_maximum_concurrent_authors: Math.max(
        ...waves.map((wave) => wave.author_concurrency_limit),
      ),
      assignment_materialization:
        'Never modify this generated plan. Generate a separate wave overlay, materialize all person/run identities and evidence there, and validate it against the SHA-256 of the exact checked plan bytes.',
      assignment_overlay: {
        generated_plan_mutation_forbidden: true,
        schema_version: 'mcat-v3-cloud-authoring-wave-assignment-overlay-4',
        stale_source_plan_hash_behavior: 'FAIL_CLOSED',
        template_path: 'curriculum/v3/v3-cloud-authoring-wave-assignment-overlay.template.json',
        validator_path: 'scripts/validate-v3-cloud-authoring-wave-overlay.mjs',
      },
      artifact_resource_limits: {
        enforcement:
          'Resolve real paths, inventory regular files, and enforce file-count/per-file/total-byte limits before whole-file reads; then enforce JSON nesting, collection-entry, and UTF-8 string limits before schema validation.',
        profiles: {
          browser_evidence: {
            max_file_bytes: 524288,
            max_json_collection_entries: 2000,
            max_json_depth: 24,
            max_json_string_bytes: 131072,
            max_regular_file_count: 32,
            max_total_bytes: 4194304,
          },
          build: {
            max_file_bytes: 2097152,
            max_json_collection_entries: 2000,
            max_json_depth: 24,
            max_json_string_bytes: 131072,
            max_regular_file_count: 64,
            max_total_bytes: 16777216,
          },
          candidate: {
            max_file_bytes: 2097152,
            max_json_collection_entries: 20000,
            max_json_depth: 64,
            max_json_string_bytes: 524288,
            max_regular_file_count: 128,
            max_total_bytes: 33554432,
          },
          receipt_log: {
            max_file_bytes: 524288,
            max_json_collection_entries: 5000,
            max_json_depth: 24,
            max_json_string_bytes: 131072,
            max_regular_file_count: 512,
            max_total_bytes: 33554432,
          },
          report: {
            max_file_bytes: 524288,
            max_json_collection_entries: 5000,
            max_json_depth: 32,
            max_json_string_bytes: 131072,
            max_regular_file_count: 32,
            max_total_bytes: 4194304,
          },
          review_bundle: {
            max_file_bytes: 2097152,
            max_json_collection_entries: 20000,
            max_json_depth: 64,
            max_json_string_bytes: 524288,
            max_regular_file_count: 16,
            max_total_bytes: 16777216,
          },
          service_deployment: {
            max_file_bytes: 524288,
            max_json_collection_entries: 2000,
            max_json_depth: 24,
            max_json_string_bytes: 131072,
            max_regular_file_count: 8,
            max_total_bytes: 2097152,
          },
        },
      },
      authoring_unit: 'one_lesson_per_author_agent',
      clean_room:
        'New-authoring agents receive only shared allowlisted architecture/contract inputs and their own job record. Pilot agents additionally receive only their matching approved prototype after rights clearance.',
      foundation_integration_contract: {
        current_status: 'BLOCKED_PENDING_SIGNED_HARDENED_FOUNDATION_PINSET',
        no_temporary_production_hashes: true,
        required_external_trust:
          'Production overlay validation requires an integration-authority public key supplied outside the overlay.',
        required_signed_pinset_fields: [
          'exact_hardened_foundation_commit_sha',
          'runtime_contract_version',
          'lesson_definition_schema_id_sha256_json_format_and_signed_identity_pointers',
          'exact_key_bearing_candidate_definition_path_and_expected_schema_version',
          'candidate_validator_build_id_version_immutable_subject_provenance_and_report_key',
          'candidate_validator_signed_execution_report_profile_including_cross_field_refinements',
          'lesson_step_view_and_lesson_action_input_schema_ids_and_sha256s',
          'learner_view_camel_case_identity_media_and_nullable_activity_semantic_profile',
          'foundation_action_event_state_and_path_transition_profile',
          'safe_projection_compiler_immutable_subject_provenance_and_report_key',
          'review_harness_immutable_subject_provenance_and_report_key',
          'scoring_service_immutable_subject_provenance_and_artifact_sha256',
        ],
        pinned_build_requirement:
          'Every build pin resolves to a bounded closed immutable implementation file tree with an entrypoint and integration-authority-signed provenance; manifest-only directories fail validation.',
        wave_entry_behavior: 'W00_AND_ALL_LATER_WAVES_FAIL_CLOSED',
      },
      first_delivery_policy:
        'Use normalized relation IDs and their explicit fields. First-delivery ordinal is a deterministic ready-job tie-break, not a prerequisite inferred from array proximity.',
      hard_dependency_policy:
        'A prior authoring wave is required only for a cross-lesson HARD_PREREQUISITE whose target is a nested KC point of use. Hard capstone requirements remain recorded but do not manufacture shell-first-delivery order.',
      pilot_policy:
        'The five exact approved prototypes form one structure-and-port pilot. They remain internal drafts and confer no production publication status.',
      production_author_batch_range: {
        maximum: PRODUCTION_MAX_AUTHORS,
        minimum: PRODUCTION_MIN_AUTHORS,
        rationale:
          'Eight to twelve authors preserve independent audit, blind-solve, accessibility, similarity, and integration capacity while retaining enough cross-domain variety to detect template overfitting; one hundred simultaneous authors would outrun those review bottlenecks.',
      },
      production_publication_default: false,
    },
    review_bundle_contract: {
      allowed_bundle_kinds: ['BLIND_SOLVE', 'ACCESSIBILITY_ONLY'],
      author_branch_access_prohibited: true,
      blind_solve_execution:
        'The solver submits real responses through the closed client to an ephemeral opaque integrator-controlled service that deploys the exact key-bearing candidate server-side and exposes no outcome overrides or protected authority.',
      bundle_manifest_schema_version: 'mcat-v3-closed-sanitized-review-bundle-3',
      bundle_sha256_required: true,
      closed_schema_unknown_field_behavior: 'REJECT',
      excluded_content_classes: [
        'answer_keys',
        'rationales_before_response',
        'diagnostic_mappings',
        'protected_scoring_material',
        'server_definitions',
        'author_branch_history',
      ],
      exact_allowed_file_sets: {
        ACCESSIBILITY_ONLY: [
          'accessibility-harness-config.json',
          'bundle-manifest.json',
          'learner-safe-envelope.json',
        ],
        BLIND_SOLVE: [
          'blind-client-runtime.json',
          'bundle-manifest.json',
          'learner-safe-envelope.json',
        ],
      },
      key_bearing_artifact_access_prohibited: true,
      protected_field_scan_report_sha256_required: true,
      reviewed_candidate_sha256_required: true,
      derivation_requirement:
        'Every learner-safe view envelope must match a detached-signature-verified report from the exact compiler implementation in the externally trusted integration pinset and validate as individual pinned LessonStepView-shaped records, not a custom lesson DTO catalog.',
      reviewer_outcome_simulation_policy:
        'Self-asserted path labels or reviewer-controlled outcomes are never accepted as blind-solve or accessibility evidence.',
      scanner_id: 'V3_CLOSED_REVIEW_BUNDLE_SCAN_V3',
      structured_json_only_v1: true,
    },
    internal_integration_evidence_contract: {
      candidate_artifact_hash_recomputed_from_exact_file_manifest: true,
      candidate_validation_contract:
        'The candidate uses signed JSON pointers for schemaVersion and lesson id, passes supplementary pinned JSON Schema validation, and has a detached-signature-verified execution report from the exact production validator implementation bound to candidate bytes, complete file manifest, foundation commit, runtime/schema pins, and required cross-field checks.',
      candidate_bound_gate_ids: REQUIRED_ACCEPTANCE_GATE_IDS.slice(0, 10),
      g11_g12_status_for_internal_drafts: 'EXPLICITLY_PENDING',
      opaque_blind_service_evidence: [
        'exact_candidate_sha256',
        'closed_safe_client_sha256',
        'recomputed_closed_service_deployment_artifact_sha256',
        'externally_signed_acl_branch_isolation_attestation',
        'pinned_per_deployment_receipt_signing_key',
        'solver_person_and_run_ids',
        'detached_signature_verified_supported_learner_action_transition_receipts',
        'signed_foundation_profile_derived_before_after_semantic_path_coverage',
        'signed_technical_invalid_activity_and_unsupported_action_rejection_report',
        'signed_blind_solve_approval',
      ],
      production_trust_requirement:
        'The validator requires an external integration trust-root public key; overlay-supplied keys alone are not trusted.',
      report_authenticity:
        'Consequential G01-G10 reports require externally credentialed assigned-reviewer identities and detached signatures; build-issued reports require signed pinset-bound keys.',
      rights_and_domain_report_contract:
        'Every G05 rights/source-similarity and G10 specialty/CARS-subject record has a repository-relative path, closed unknown-field-rejecting schema, recomputed byte hash, exact ledger/candidate/slot/person/run/specialty/subject pins, and detached signature.',
      safe_projection_and_accessibility_contract:
        'Compiler-signed exact output manifests derive individual camelCase learner views under signed semantic pointers; the profile distinguishes schema artifact IDs from payload schemaVersion, preserves nullable activity and audio/video caption semantics, and requires harness-signed closed browser evidence plus assigned-auditor approval for G08.',
      stale_or_missing_evidence_behavior: 'FAIL_CLOSED',
      wave_similarity_scope:
        'current_wave_plus_integration_authority_signed_complete_previously_integrated_corpus',
    },
    severity_taxonomy: SEVERITY_TAXONOMY,
    source_ledger_contract: {
      copied_expressive_prose_allowed: false,
      required_entry_fields: [
        'source_id',
        'source_kind',
        'title',
        'url',
        'access_date',
        'license_or_terms',
        'model_processing_rights',
        'source_ceiling',
        'retrieved_content_sha256',
        'provided_to_author_model',
        'factual_use_only',
        'copied_expressive_prose_allowed',
        'rights_review_slot_id',
      ],
      schema_version: 'mcat-v3-authoring-source-ledger-1',
      statement:
        'Separately recorded current authoritative/open factual sources may be used when URL, access date, license or terms, model-processing rights, source ceiling, and exact retrieval hash are reviewed; copied expressive prose remains forbidden.',
      temporal_rule:
        'Access dates must be real calendar dates no later than overlay materialization time.',
    },
    publication_policy: {
      default_status: 'INTERNAL_DRAFT',
      production_definition_only_after: [
        'rights_and_originality_clearance',
        'independent_domain_and_scientific_review',
        'independent_content_and_pedagogy_audit',
        'blind_solve',
        'accessibility_and_technical_audit',
        'cross_lesson_similarity_audit',
        'approvals_bound_to_exact_reviewed_content_hash',
        'preregistered_efficacy_and_subgroup_gates',
        'final_publication_approval',
      ],
      statement:
        'Generated content is an internal draft until rights, scientific review, reviewed hashes (integrity identifiers, not proof by themselves), signed/verifiable evidence, and efficacy gates pass.',
    },
    schema_version: 'mcat-v3-cloud-authoring-orchestration-5',
    unresolved_constraints: [
      {
        constraint_id: 'UC01_PROTOTYPE_ARTIFACTS',
        effect:
          'The five internal prototype artifact locations, immutable hashes, processing-rights records, and prior review evidence were not supplied; pilot jobs cannot launch until supplied and verified.',
      },
      {
        constraint_id: 'UC02_CURRENT_AUTHORITY',
        effect:
          'The architecture is complete only to the supplied 2020 AAMC ceiling; present-day authority refresh remains pending.',
      },
      {
        constraint_id: 'UC03_ASSIGNMENTS',
        effect:
          'Actual controller, integrator, author, rights reviewer, domain fact-checker, auditor, blind-solver, and approver person/run IDs are intentionally absent from this immutable plan and must be materialized in a separately validated wave overlay.',
      },
      {
        constraint_id: 'UC04_EMPIRICAL_GATES',
        effect:
          'Learner validation, calibrated evidence recipes, exact efficacy thresholds, and broad-publication evidence do not yet exist; no wave checkpoint can waive them.',
      },
      {
        constraint_id: 'UC05_HARDENED_FOUNDATION_INTEGRATION_PINS',
        effect:
          'W00 and every later wave are blocked until the final hardened foundation commit supplies exact LessonDefinition, LessonStepView, LessonActionInput, action/event/transition semantic profiles, an executable production candidate validator with signed execution reports, and immutable implementation subjects plus signed provenance for the validator, safe-projection compiler, browser/accessibility harness, and scoring service. The external integration trust root and signed pinset must bind all of them; this authoring branch does not fabricate those production assets.',
      },
    ],
    waves,
    workflow: WORKFLOW_STAGES,
  };

  validateAuthoringPlan(plan, sourceManifest);
  return sortObjectKeys(plan);
}

function validateAuthoringPlan(plan, sourceManifest) {
  const indexes = validateSourceManifest(sourceManifest);
  assert.equal(plan.schema_version, 'mcat-v3-cloud-authoring-orchestration-5');
  assert.equal(plan.jobs.length, EXPECTED.counts.lessons);

  const canonicalReferencePattern =
    /^(?:V3-(?:CAP|CL|DEC|EDG|EXT|HOLD|KC|LES|MOD|PHS|PTH|SRC|SUP)-[A-Z0-9-]+|R14-[A-Z0-9-]+)$/;
  const sourceCanonicalReferences = collectExactReferenceStrings(
    sourceManifest,
    canonicalReferencePattern,
  );
  const planCanonicalReferences = collectExactReferenceStrings(plan, canonicalReferencePattern);
  for (const reference of planCanonicalReferences) {
    assert(
      sourceCanonicalReferences.has(reference),
      `Generated plan reference does not resolve in the source manifest: ${reference}`,
    );
  }
  const sourceAnchorIds = new Set(
    sourceManifest.source_references.anchors.map((anchor) => anchor.source_anchor_id),
  );
  for (const sourceAnchorId of collectArrayValuesForKey(plan, 'source_anchor_ids')) {
    assert(
      sourceAnchorIds.has(sourceAnchorId),
      `Generated source-anchor reference does not resolve: ${sourceAnchorId}`,
    );
  }

  const jobIds = plan.jobs.map((job) => job.job_id);
  const lessonIds = plan.jobs.map((job) => job.lesson_id);
  assert.equal(new Set(jobIds).size, EXPECTED.counts.lessons);
  assert.equal(new Set(lessonIds).size, EXPECTED.counts.lessons);
  assert.deepEqual(new Set(lessonIds), new Set(indexes.lessonById.keys()));

  const prototypeJobs = plan.jobs.filter((job) => job.job_kind === 'prototype_port');
  assertExactArray(
    prototypeJobs.map((job) => job.lesson_id),
    PROTOTYPE_LESSON_IDS,
    'prototype lesson IDs',
  );
  assert.equal(plan.jobs.filter((job) => job.job_kind === 'new_authoring').length, 109);

  const allKcMicrocycles = plan.jobs.flatMap((job) =>
    job.knowledge_component_microcycles.map((kc) => ({ job, kc })),
  );
  assert.equal(allKcMicrocycles.length, EXPECTED.counts.kcs);
  assert.equal(new Set(allKcMicrocycles.map(({ kc }) => kc.kc_id)).size, EXPECTED.counts.kcs);
  assert.deepEqual(
    new Set(allKcMicrocycles.map(({ kc }) => kc.kc_id)),
    new Set(indexes.kcById.keys()),
  );

  const acceptanceGateIds = new Set(plan.acceptance_gate_catalog.map((gate) => gate.gate_id));
  assert.deepEqual(acceptanceGateIds, new Set(REQUIRED_ACCEPTANCE_GATE_IDS));
  const gateById = new Map(plan.acceptance_gate_catalog.map((gate) => [gate.gate_id, gate]));
  assert.deepEqual(
    gateById.get('G05_CLEAN_ROOM_RIGHTS_AND_ORIGINALITY').required_assignment_roles,
    ['INDEPENDENT_INPUT_OUTPUT_RIGHTS_REVIEWER'],
  );
  assert.deepEqual(
    gateById.get('G10_DOMAIN_FACT_CHECK_AND_SCIENTIFIC_REVIEW').required_assignment_roles,
    ['DOMAIN_SCIENTIFIC_FACT_CHECKER'],
  );
  assert.equal(
    gateById.get('G10_DOMAIN_FACT_CHECK_AND_SCIENTIFIC_REVIEW')
      .conditional_required_assignment_roles[0].role,
    'CARS_PASSAGE_SUBJECT_FACT_CHECKER',
  );
  const workflowStages = new Set(plan.workflow.map((stage) => stage.stage));
  for (const requiredStage of [
    'source_ledger_and_input_rights_review',
    'domain_scientific_fact_check',
    'cars_passage_subject_fact_check',
    'output_rights_and_originality_review',
    'candidate_artifact_freeze_and_g01_g06_evidence',
    'closed_clients_and_opaque_blind_service_deployment',
  ]) {
    assert(workflowStages.has(requiredStage), `Missing required workflow stage ${requiredStage}`);
  }

  for (const { job, kc } of allKcMicrocycles) {
    const canonicalKc = indexes.kcById.get(kc.kc_id);
    assert(canonicalKc);
    assert.equal(kc.owning_lesson_id, job.lesson_id);
    assert.equal(canonicalKc.owning_lesson_id, job.lesson_id);
    assert.equal(kc.statement_of_competence, canonicalKc.statement_of_competence);
  }

  for (const job of plan.jobs) {
    const canonicalLesson = indexes.lessonById.get(job.lesson_id);
    const canonicalGrouping = indexes.groupingByLessonId.get(job.lesson_id);
    assert(canonicalLesson && canonicalGrouping);
    assert.equal(job.grouping.grouping_id, canonicalGrouping.grouping_id);
    assertExactArray(
      job.knowledge_component_microcycles.map((kc) => kc.kc_id),
      indexes.internalOrderByLessonId.get(job.lesson_id).ordered_nested_kc_ids,
      `${job.lesson_id} job microcycle order`,
    );
    assert.equal(job.accelerated_bypass_authorized, false);
    assert.equal(job.acceptance.production_publication_eligible, false);
    assert.deepEqual(new Set(job.acceptance.required_gate_ids), acceptanceGateIds);

    assert(indexes.phaseById.has(job.sequence.phase.phase_id));
    assert(indexes.moduleById.has(job.sequence.module.module_id));
    assert(indexes.relationById.has(job.sequence.first_delivery.relation_id));
    assert(indexes.relationById.has(job.sequence.internal_order_relation_id));
    assert(indexes.relationById.has(job.sequence.revisit.relation_id));
    assert(indexes.relationById.has(job.sequence.module.phase_module_relation_id));
    for (const pathway of job.sequence.pathways) {
      assert(indexes.pathwayById.has(pathway.pathway_id));
      assert(indexes.relationById.has(pathway.relation_id));
      assert.equal(pathway.currently_authorized_bypass, false);
    }

    for (const edge of [...job.prerequisites.hard, ...job.prerequisites.helpful]) {
      assert(indexes.edgeById.has(edge.edge_id));
      assert(indexes.entityOwnerLessonId.has(edge.target_id));
      if (edge.source_lesson_id !== null) {
        assert(indexes.lessonById.has(edge.source_lesson_id));
      }
    }
    for (const dependency of job.authoring_dependencies.blocking_hard_point_of_use) {
      assert(indexes.lessonById.has(dependency.dependency_lesson_id));
      for (const edgeId of dependency.edge_ids) {
        const edge = indexes.edgeById.get(edgeId);
        assert(edge);
        assert.equal(edge.edge_type, 'HARD_PREREQUISITE');
        assert(canonicalLesson.nested_kc_ids.includes(edge.target_id));
      }
    }

    for (const relation of job.point_of_use_support_and_repair.exact_remediation_relations) {
      assert(indexes.relationById.has(relation.relation_id));
      assert.equal(relation.exit_evidence_placeholder, null);
      assert(relation.exact_reentry);
    }
    for (const relation of job.point_of_use_support_and_repair.helpful_order_relations) {
      assert(indexes.relationById.has(relation.relation_id));
      assert.equal(relation.blocks_readiness, false);
    }
    for (const relation of job.point_of_use_support_and_repair.sirs_math_relations) {
      assert(indexes.relationById.has(relation.relation_id));
      assert.equal(relation.target_lesson_id, job.lesson_id);
    }
    for (const support of job.point_of_use_support_and_repair.repair_support_artifacts) {
      assert(indexes.supportById.has(support.attachment_id));
      assert.equal(support.delivery_state, 'host_only');
      assert.equal(support.required_lesson_microcycle, false);
    }

    const allAttachments = [
      ...job.attachments.extensions,
      ...job.attachments.capstones,
      ...job.attachments.supports,
    ];
    for (const attachment of allAttachments) {
      assert.equal(attachment.required_lesson_microcycle, false);
      const canonicalAttachment =
        indexes.extensionById.get(attachment.attachment_id) ??
        indexes.capstoneById.get(attachment.attachment_id) ??
        indexes.supportById.get(attachment.attachment_id);
      assert(canonicalAttachment);
      assert.equal(attachment.delivery_state, canonicalAttachment.delivery_state);
      for (const relationId of attachment.delivery_relation_ids) {
        assert(indexes.relationById.has(relationId));
      }
      if (attachment.delivery_state === 'governance_only') {
        assert.equal(attachment.authoring_treatment, 'governance_only_reference');
      }
      if (attachment.delivery_state === 'host_only') {
        assert.equal(attachment.authoring_treatment, 'host_bound_nonmastery_context');
      }
    }

    const assignmentSlots = getAssignmentSlots(job);
    assert.equal(new Set(assignmentSlots.map((slot) => slot.slot_id)).size, assignmentSlots.length);
    const authorSlotId = job.assignments.author.slot_id;
    for (const slot of assignmentSlots) {
      assert.equal(
        Object.hasOwn(slot, 'assignee_agent_run_id'),
        false,
        `${slot.slot_id} must define a role slot only; identities belong in the wave overlay`,
      );
      if (slot.slot_id === authorSlotId) continue;
      assert.notEqual(slot.slot_id, authorSlotId);
      assert(slot.must_be_distinct_from_slot_ids.includes(authorSlotId));
    }
    assert.equal(
      job.assignments.input_output_rights_reviewer.role,
      'INDEPENDENT_INPUT_OUTPUT_RIGHTS_REVIEWER',
    );
    const requiredSpecialties = job.required_domain_fact_check_specialties;
    assert.equal(new Set(requiredSpecialties).size, requiredSpecialties.length);
    assert.equal(
      job.assignments.domain_scientific_fact_checkers.length,
      requiredSpecialties.length,
    );
    assert.deepEqual(
      job.assignments.domain_scientific_fact_checkers
        .map((slot) => slot.specialty)
        .sort(compareText),
      [...requiredSpecialties].sort(compareText),
    );
    assert(
      job.assignments.domain_scientific_fact_checkers.every(
        (slot) => slot.role === 'DOMAIN_SCIENTIFIC_FACT_CHECKER',
      ),
    );
    if (job.domain_bucket === 'CARS') {
      const subjectSlot = job.assignments.cars_passage_subject_fact_checker;
      const reasoningSlot = job.assignments.domain_scientific_fact_checkers.find(
        (slot) => slot.specialty === 'CARS_PASSAGE_REASONING_EDITOR',
      );
      assert(subjectSlot);
      assert(reasoningSlot);
      assert.equal(subjectSlot.role, 'CARS_PASSAGE_SUBJECT_FACT_CHECKER');
      assert(subjectSlot.must_be_distinct_from_slot_ids.includes(reasoningSlot.slot_id));
      assert(reasoningSlot.must_be_distinct_from_slot_ids.includes(subjectSlot.slot_id));
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

  for (const heldEntityId of HELD_GOVERNANCE_ONLY_ENTITY_IDS) {
    const occurrences = plan.jobs
      .flatMap((job) => [
        ...job.attachments.extensions,
        ...job.attachments.capstones,
        ...job.attachments.supports,
      ])
      .filter((attachment) => attachment.attachment_id === heldEntityId);
    assert(occurrences.length > 0, `Held entity ${heldEntityId} is absent from its job`);
    assert(
      occurrences.every(
        (attachment) =>
          attachment.delivery_state === 'governance_only' &&
          attachment.authoring_treatment === 'governance_only_reference' &&
          attachment.required_lesson_microcycle === false,
      ),
    );
  }

  const waveJobIds = plan.waves.flatMap((wave) => wave.job_ids);
  assert.equal(waveJobIds.length, EXPECTED.counts.lessons);
  assert.equal(new Set(waveJobIds).size, EXPECTED.counts.lessons);
  assert.deepEqual(new Set(waveJobIds), new Set(jobIds));
  const pilotWave = plan.waves[0];
  assert.equal(pilotWave.wave_id, 'V3-AUTH-W00-PILOT-PORT');
  assertExactArray(pilotWave.lesson_ids, PROTOTYPE_LESSON_IDS, 'pilot wave lessons');
  assert.equal(pilotWave.job_count, PROTOTYPE_LESSON_IDS.length);
  for (const [index, wave] of plan.waves.entries()) {
    assertExactArray(
      wave.similarity_comparison_wave_ids,
      plan.waves.slice(0, index + 1).map((candidate) => candidate.wave_id),
      `${wave.wave_id} cumulative similarity waves`,
    );
  }

  const waveOrdinalByLessonId = new Map(
    plan.waves.flatMap((wave) => wave.lesson_ids.map((lessonId) => [lessonId, wave.wave_ordinal])),
  );
  for (const wave of plan.waves.slice(1)) {
    assert(wave.job_count >= PRODUCTION_MIN_AUTHORS);
    assert(wave.job_count <= PRODUCTION_MAX_AUTHORS);
    assert.equal(wave.author_concurrency_limit, wave.job_count);
    assert(
      Object.keys(wave.domain_counts).length >= 3,
      `${wave.wave_id} lacks cross-domain template-overfitting coverage`,
    );
  }
  for (const job of plan.jobs) {
    const jobWaveOrdinal = waveOrdinalByLessonId.get(job.lesson_id);
    for (const dependency of job.authoring_dependencies.blocking_hard_point_of_use) {
      const dependencyWaveOrdinal = waveOrdinalByLessonId.get(dependency.dependency_lesson_id);
      assert(
        dependencyWaveOrdinal < jobWaveOrdinal,
        `${job.lesson_id} is not after hard dependency ${dependency.dependency_lesson_id}`,
      );
    }
  }

  assert.equal(plan.orchestration_policy.production_publication_default, false);
  assert.equal(
    plan.orchestration_policy.foundation_integration_contract.current_status,
    'BLOCKED_PENDING_SIGNED_HARDENED_FOUNDATION_PINSET',
  );
  assert.equal(
    plan.orchestration_policy.artifact_resource_limits.profiles.candidate.max_regular_file_count,
    128,
  );
  assert.equal(
    plan.orchestration_policy.artifact_resource_limits.profiles.report.max_file_bytes,
    524288,
  );
  assert.equal(
    plan.orchestration_policy.assignment_overlay.schema_version,
    'mcat-v3-cloud-authoring-wave-assignment-overlay-4',
  );
  assert.equal(
    plan.review_bundle_contract.bundle_manifest_schema_version,
    'mcat-v3-closed-sanitized-review-bundle-3',
  );
  assert.equal(
    plan.orchestration_policy.assignment_overlay.generated_plan_mutation_forbidden,
    true,
  );
  assert.equal(
    plan.orchestration_policy.assignment_overlay.stale_source_plan_hash_behavior,
    'FAIL_CLOSED',
  );
  assert.deepEqual(
    plan.severity_taxonomy.map((entry) => entry.severity),
    ['P0', 'P1', 'P2', 'P3'],
  );
  assert.equal(
    plan.publication_policy.statement,
    'Generated content is an internal draft until rights, scientific review, reviewed hashes (integrity identifiers, not proof by themselves), signed/verifiable evidence, and efficacy gates pass.',
  );
  return true;
}

async function renderPlan(plan) {
  return format(JSON.stringify(plan), {
    parser: 'json',
    printWidth: 100,
    tabWidth: 2,
  });
}

function parseArguments(argv) {
  const unknown = argv.filter((argument) => argument !== '--check');
  if (unknown.length > 0) {
    throw new Error(`Unknown argument(s): ${unknown.join(', ')}. Only --check is supported.`);
  }
  return { check: argv.includes('--check') };
}

async function main() {
  const args = parseArguments(process.argv.slice(2));
  const sourceAbsolutePath = resolve(REPOSITORY_ROOT, SOURCE_PATH);
  const outputAbsolutePath = resolve(REPOSITORY_ROOT, OUTPUT_PATH);
  const sourceText = await readFile(sourceAbsolutePath, 'utf8');
  const sourceManifest = JSON.parse(sourceText);
  const contractAbsolutePath = resolve(
    REPOSITORY_ROOT,
    sourceManifest.metadata.canonical_contract.path,
  );
  const contractText = await readFile(contractAbsolutePath, 'utf8');
  assert.equal(
    hashText(contractText),
    sourceManifest.metadata.canonical_contract.sha256,
    'Canonical authoring contract hash does not match the source-manifest pin',
  );

  const plan = buildAuthoringPlan(sourceManifest, hashText(sourceText));
  const rendered = await renderPlan(plan);
  if (args.check) {
    const checkedOutput = await readFile(outputAbsolutePath, 'utf8');
    assert.equal(
      checkedOutput,
      rendered,
      `${OUTPUT_PATH} is stale; regenerate it with node ${GENERATOR_PATH}`,
    );
    process.stdout.write(
      `Validated ${plan.jobs.length} jobs, ${plan.waves.length} waves, and ${EXPECTED.counts.kcs} KC microcycles.\n`,
    );
    return;
  }

  await mkdir(dirname(outputAbsolutePath), { recursive: true });
  await writeFile(outputAbsolutePath, rendered, 'utf8');
  process.stdout.write(
    `Wrote ${OUTPUT_PATH}: ${plan.jobs.length} jobs in ${plan.waves.length} waves.\n`,
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
  EXPECTED,
  HELD_GOVERNANCE_ONLY_ENTITY_IDS,
  PROTOTYPE_LESSON_IDS,
  REQUIRED_ACCEPTANCE_GATE_IDS,
  SEVERITY_TAXONOMY,
  buildAuthoringPlan,
  getAssignmentSlots,
  hashText,
  renderPlan,
  validateAuthoringPlan,
  validateSourceManifest,
};
