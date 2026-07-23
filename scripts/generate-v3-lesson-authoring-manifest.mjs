#!/usr/bin/env node

import { createHash, randomBytes } from 'node:crypto';
import { lstat, mkdir, open, readFile, realpath, rename, stat, unlink } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { format } from 'prettier';

const GENERATOR_PATH = 'scripts/generate-v3-lesson-authoring-manifest.mjs';
const CONTRACT_PATH = 'docs/design/mcat-complete-learning-flow.md';

const EXPECTED = {
  registryArtifactId: 'MCAT-V3-AUTHORITATIVE-REGISTRY-2026-07-22-01',
  registrySha256: '635c39e9c0ebb28a3892399449aa9b74893aae3264924cd739b92b6e370ba26a',
  contractSha256: 'e56590830462987e2cc9ec8d523a702e75c903613020addb81da6edbcad3286b',
  freezeIds: {
    phase0: 'MCAT-V3-PHASE0-FRZ-2026-07-22-01',
    canonical: 'MCAT-V3-CANONICAL-FRZ-2026-07-22-01',
    graph: 'MCAT-V3-GRAPH-FRZ-2026-07-22-01',
    sequence: 'MCAT-V3-SEQUENCE-FRZ-2026-07-22-01',
  },
  phase1GateId: 'MCAT-V3-PHASE1-GATE-2026-07-22-01',
  counts: {
    lessons: 114,
    kcs: 422,
    groupings: 114,
    extensions: 53,
    capstones: 43,
    supports: 11,
    sourceOccurrences: 272,
    sourceAnchors: 110,
    multiTopicSourceAnchors: 36,
    sourceMappings: 1604,
    adoptionDecisions: 1699,
    governanceDecisions: 9,
    holds: 14,
    openHolds: 11,
    closedHolds: 3,
    edges: 634,
    hardEdges: 143,
    phases: 5,
    modules: 40,
    pathways: 7,
    firstDeliveryRelations: 114,
    requiredCapstonePlacements: 42,
    revisitRelations: 114,
    exactRepairRelations: 504,
  },
  heldNonrequiredEntityIds: ['V3-CAP-537139', 'V3-EXT-703019'],
  attachmentDeliveryCounts: {
    extensions: { host_only: 52, governance_only: 1 },
    capstones: { required: 42, governance_only: 1 },
    supports: { host_only: 11 },
    total: { required: 42, nonrequired: 0, host_only: 63, governance_only: 2 },
  },
  sourceAnchorLabelCounts: {
    direct_aamc_source_anchor_heading: 104,
    single_official_topic: 0,
    inclusive_official_topics: 0,
    printed_pages_and_anchor_id: 6,
    anchor_id: 0,
  },
  sourceAnchorRegression: {
    sourceAnchorId: 'BB-SA-0017',
    label: 'Content Category 1A',
    labelSource: 'direct_aamc_source_anchor_heading',
    associatedTopicCount: 5,
  },
};

const SOURCE_FILE_DEFINITIONS = [
  {
    key: 'completion',
    path: 'completion-manifest.json',
    role: 'package_completion_and_hash_ledger',
    schemaVersion: 'mcat-v3-completion-manifest-1',
    sha256: 'fa476ee4d532884ba648e74dbb71384bbc300d6fe36f00d69643cefa12976314',
  },
  {
    key: 'registry',
    path: 'work/v3-authoritative-registry.json',
    role: 'authoritative_registry',
    schemaVersion: 'mcat-v3-authoritative-registry-1',
    sha256: EXPECTED.registrySha256,
  },
  {
    key: 'frozenSchema',
    path: 'work/v3-frozen-schema.json',
    role: 'frozen_schema_and_id_policy',
    schemaVersion: 'mcat-v3-frozen-schema-1',
    sha256: 'ad7e9b9c697dc691e40b1289a4db8fdc7ca9aceccb7ed6e3cea0aa34f33dc693',
  },
  {
    key: 'validation',
    path: 'work/validation-results.json',
    role: 'deterministic_publication_validation',
    schemaVersion: 'mcat-v3-deterministic-validation-1',
    sha256: '49d10f6ba46e8ede0f5ac523f0c2975e678f21737ff8c74114355fd2c9e1f32d',
  },
  {
    key: 'kcs',
    path: 'v3-canonical-kcs.json',
    role: 'normalized_kc_view',
    schemaVersion: 'mcat-v3-kcs-public-1',
    sha256: '31d304a7f6ea51ac4847ede01824bb14cd8b98ed7a6bc61bb05617d53f9860fd',
  },
  {
    key: 'lessons',
    path: 'v3-learner-facing-lessons.json',
    role: 'normalized_lesson_view',
    schemaVersion: 'mcat-v3-lessons-public-1',
    sha256: '1ab18b78f830602401d5673d941346a5d6b31befcee774866a839300df62916d',
  },
  {
    key: 'groupings',
    path: 'v3-clusters-and-groupings.json',
    role: 'normalized_grouping_view',
    schemaVersion: 'mcat-v3-groupings-public-1',
    sha256: '4a1024aa72a2f847007ef70d196e94ec51edcf04479517bf0dde316d0a16e5cc',
  },
  {
    key: 'attachments',
    path: 'v3-extensions-capstones-support.json',
    role: 'normalized_attachment_view',
    schemaVersion: 'mcat-v3-attached-architecture-public-1',
    sha256: '23bbea9e358c4aa0ff255964d203c0081b4ff3ba28e4e123eed0cfc0b7a54831',
  },
  {
    key: 'sourceCrosswalk',
    path: 'v3-source-crosswalk.json',
    role: 'source_reference_and_mapping_view',
    schemaVersion: 'mcat-v3-source-crosswalk-public-1',
    sha256: 'a87fd1634a5a9e9dd522293ef98db10b783971f02e0bdfbf558b276cc0b9cea3',
  },
  {
    key: 'adoption',
    path: 'v3-adoption-decisions.json',
    role: 'adoption_and_governance_view',
    schemaVersion: 'mcat-v3-adoption-public-1',
    sha256: '52d9ac0f3b336af6a6b15f5b8944d715edb4c1217db6637948a38030c847b60f',
  },
  {
    key: 'graph',
    path: 'v3-prerequisite-graph.json',
    role: 'normalized_graph_view',
    schemaVersion: 'mcat-v3-prerequisite-graph-public-1',
    sha256: 'fe0fffdd16bd10d3f7c046951cbe642add8ef2639f5b3f68a3224d9648f59e10',
  },
  {
    key: 'sequence',
    path: 'v3-teaching-sequences.json',
    role: 'normalized_sequence_truth',
    schemaVersion: 'mcat-v3-teaching-sequences-public-1',
    sha256: 'b2bbd9f8a14cbff1250013e8d717eb1c8195ccbf6335e605c64f1469a94246aa',
  },
];

const DELIVERY_STATES = Object.freeze({
  REQUIRED: 'required',
  NONREQUIRED: 'nonrequired',
  HOST_ONLY: 'host_only',
  GOVERNANCE_ONLY: 'governance_only',
});

const LESSON_ACCELERATED_POLICY =
  'Conditional future review only; no instruction bypass is authorized.';
const LESSON_REMEDIATION_POLICY =
  'Exact failed-target repair with null exit-evidence threshold and exact reentry; efficacy unvalidated.';
const SOURCE_ANCHOR_LABEL_MAX_LENGTH = 160;

const SOURCE_RECORD_POLICIES = {
  kc: {
    include: [
      'kc_id',
      'display_label',
      'statement_of_competence',
      'success_condition_placeholder',
      'scope_in',
      'scope_out',
      'owning_lesson_id',
      'identity_role',
      'representations',
      'transfer_expectation',
      'source_topic_ids',
      'aamc_pages',
      'source_anchor_ids',
      'hard_prerequisite_ids',
      'helpful_prerequisite_ids',
      'successor_ids',
      'extension_ids',
      'capstone_ids',
      'remediation_placeholder',
      'evidence_status',
      'confidence',
      'learner_validation_status',
      'v1_mapping_ids',
      'v2_mapping_ids',
      'adoption_decision_id',
    ],
    omit: [],
    derive: [],
  },
  lesson: {
    include: [
      'lesson_id',
      'canonical_display_label',
      'short_display_alias',
      'lesson_type',
      'concise_scope',
      'scope_exclusions',
      'owning_cluster_id',
      'nested_kc_ids',
      'nested_kc_labels',
      'support_artifact_ids',
      'extension_ids',
      'capstone_ids',
      'source_sections',
      'foundational_concepts',
      'content_categories',
      'aamc_pages',
      'source_anchor_ids',
      'hard_prerequisite_lesson_ids',
      'helpful_prerequisite_lesson_ids',
      'direct_successor_lesson_ids',
      'grouping_rationale',
      'granularity_rationale',
      'phase_ids',
      'module_ids',
      'pathway_positions',
      'revisit_positions',
      'review_status',
      'unresolved_holds',
      'v1_contribution',
      'v2_contribution',
      'v3_decision_rationale',
    ],
    omit: [],
    derive: ['accelerated_handling', 'remediation_handling'],
  },
  grouping: {
    include: [
      'grouping_id',
      'lesson_id',
      'member_kc_ids',
      'member_capstone_ids',
      'teaching_order',
      'throughline',
      'natural_practice_family',
      'knowledge_textures',
      'grouping_rationale',
      'granularity_rationale',
      'source_anchor_ids',
      'source_topic_ids',
      'aamc_pages',
      'exception_codes',
      'owner_role',
      'reviewer_role',
      'sme_reviewer_role',
      'review_status',
      'learner_validation_status',
      'v2_cluster_ids',
      'v2_cluster_candidate_ids',
      'adoption_decision_ids',
      'direct_source_occurrence_ids',
    ],
    omit: ['source_stage_review_status'],
    derive: [],
  },
  generatedGrouping: {
    include: [
      'grouping_id',
      'lesson_id',
      'member_kc_ids',
      'member_capstone_ids',
      'teaching_order',
      'throughline',
      'natural_practice_family',
      'knowledge_textures',
      'grouping_rationale',
      'granularity_rationale',
      'source_anchor_ids',
      'source_topic_ids',
      'aamc_pages',
      'exception_codes',
      'owner_role',
      'reviewer_role',
      'sme_reviewer_role',
      'review_status',
      'learner_validation_status',
      'v2_cluster_ids',
      'v2_cluster_candidate_ids',
      'adoption_decision_ids',
      'view_type',
      'canonical_mastery_state',
      'owns_evidence_state',
      'owns_remediation_state',
      'direct_source_occurrence_ids',
    ],
    omit: [],
    derive: [],
  },
  extension: {
    include: [
      'extension_id',
      'type',
      'host_lesson_ids',
      'host_core_ids',
      'performance_delta',
      'preserved_invariant',
      'bounds',
      'source_topic_ids',
      'source_anchor_ids',
      'aamc_pages',
      'scope_status',
      'rationale',
      'lineage',
      'adoption_decision_id',
      'learner_validation_status',
      'review_status',
      'adapter_owner',
      'context_pages',
      'required_delivery',
      'hold_ids',
      'owning_lesson_id',
      'secondary_application_lesson_ids',
      'host_capstone_ids',
      'direct_source_occurrence_ids',
      'recovery_note',
    ],
    omit: ['source_stage_review_status'],
    derive: [],
  },
  capstone: {
    include: [
      'capstone_id',
      'display_label',
      'owning_lesson_id',
      'component_kc_ids',
      'supporting_capstone_ids',
      'coordination_demand',
      'irreducibility_rationale',
      'placement_rule',
      'placement_status',
      'source_topic_ids',
      'aamc_pages',
      'source_anchor_ids',
      'v2_source_kc_ids',
      'v2_capstone_candidate_ids',
      'adoption_decision_id',
      'merged_source_decision_ids',
      'learner_validation_status',
      'review_status',
      'adapter_owner',
      'hold_ids',
      'context_pages',
      'direct_source_occurrence_ids',
      'placement_freeze_id',
      'scope_status',
      'required_delivery',
      'merge_rationale',
    ],
    omit: ['source_stage_review_status', 'source_stage_placement_status'],
    derive: [],
  },
  support: {
    include: [
      'support_id',
      'artifact_type',
      'host_lesson_id',
      'secondary_display_host_ids',
      'purpose',
      'scope',
      'routing_effect',
      'source_lineage',
      'not_a_standalone_lesson',
      'adoption_decision_id',
      'learner_validation_status',
      'review_status',
    ],
    omit: ['source_stage_review_status'],
    derive: [],
  },
  sourceOccurrence: {
    include: [
      'source_occurrence_id',
      'occurrence_kind',
      'source_topic_id',
      'source_id',
      'section',
      'foundational_concept',
      'content_category',
      'official_topic',
      'printed_pages',
      'source_anchor_ids',
      'source_anchor_id',
      'scope_status',
      'direct_evidence_eligible',
      'authority_role',
      'scope_action',
      'learner_validation_status',
    ],
    omit: [
      'correction_rule',
      'editorial_paraphrase_not_direct_quote',
      'evidence_strength',
      'exact_text',
      'locator_end',
      'locator_kind',
      'locator_start',
      'official_path',
      'physical_pdf_pages',
      'source_document_citations',
      'source_summary',
    ],
    derive: ['official_path'],
  },
  adoptionDecision: {
    include: [
      'decision_id',
      'source_architecture',
      'source_object_type',
      'source_object_id',
      'source_object_label',
      'disposition',
      'v3_target_ids',
      'canonical_owner_id',
      'display_alias',
      'review_status',
    ],
    omit: [
      'decision',
      'learner_evidence_required',
      'owner_role',
      'rationale',
      'remaining_uncertainty',
      'reviewer_role',
      'sme_evidence_required',
      'source_evidence',
      'source_preservation',
      'source_stage_review_status',
      'what_v1_contributes',
      'what_v2_provides',
    ],
    derive: [],
  },
  governanceDecision: {
    include: [
      'decision_id',
      'source_decision_id',
      'decision_type',
      'cluster_id',
      'lesson_id',
      'component_kc_ids',
      'extracted_capstone_id',
      'generated_grouping_id',
      'independent_nonoverlap_math_ids',
      'category_narratives_preserved',
      'source_topic_ids',
      'source_anchor_ids',
      'aamc_pages',
      'target_ids',
      'source_ids',
      'decision',
      'owner_role',
      'reviewer_role',
      'reviewer_roles',
      'learner_validation_status',
      'review_status',
      'role_11_adjudication',
      'rules',
    ],
    omit: [
      'candidate_aggregate_dispositions',
      'candidate_component_dispositions',
      'canonical_aggregate_dispositions',
      'canonical_component_dispositions',
      'learner_evidence_required',
      'rationale',
      'remaining_uncertainty',
      'sme_evidence_required',
      'source_evidence',
    ],
    derive: [],
  },
  hold: {
    include: [
      'hold_id',
      'canonical_uncertainty_key',
      'type',
      'status',
      'issue',
      'affected_entity_ids',
      'affected_source_ids',
      'affected_scope_selectors',
      'owner_role',
      'reviewer_roles',
      'learner_evidence_required',
      'release_condition',
      'source_hold_ids',
      'source_hold_record_count',
    ],
    omit: [],
    derive: [],
  },
  edge: {
    include: [
      'edge_id',
      'edge_type',
      'source_id',
      'source_type',
      'target_id',
      'target_type',
      'directionality',
      'native_direction',
      'generic_direction',
      'readiness_effect',
      'instruction_order_effect',
      'blocks_readiness',
      'point_of_use_warrants',
      'mechanisms_or_warrants',
      'required_representation',
      'repair_reentry',
      'classification_review',
      'canonicalization',
      'confidence',
      'risk',
      'review_status',
      'learner_validation_status',
      'required_delivery_status',
      'generic_projection_generated_only',
      'generic_relation',
      'readiness_inference_forbidden',
      'human_validation_status',
    ],
    omit: ['source_label', 'target_label', 'governance_review', 'source_stage_review_status'],
    derive: ['provenance'],
  },
  edgeProvenance: {
    include: [
      'v2_active_edge_ids',
      'v2_candidate_edge_ids',
      'adapter_recommendation_refs',
      'final_capstone_declaration_id',
      'governance_decision_ids',
      'role13_finding_ids',
      'source_pair_lineage_preserved',
    ],
    omit: ['canonical_registry_path', 'parent_correction_brief_path', 'v2_graph_path'],
    derive: [],
  },
  phase: {
    include: [
      'phase_id',
      'title',
      'phase_function',
      'purpose',
      'entry_policy',
      'exit_policy',
      'interleaving_rationale',
      'source_v2_phase_id',
      'placement_truth_collection',
      'learner_validation_status',
      'placement_projection',
    ],
    omit: [],
    derive: [],
  },
  module: {
    include: [
      'module_id',
      'title',
      'purpose',
      'delivery_mode',
      'entry_considerations',
      'ordered_lesson_ids_view_ref',
      'revisit_record_refs',
      'cars_schedule_link_id',
      'sirs_math_point_of_use_relation_ids',
      'cognitive_load_review_ref',
      'source_v2_module_id',
      'source_v2_title',
      'architecture_change_from_v2',
      'placement_truth_collection',
      'learner_validation_status',
      'placement_projection',
    ],
    omit: [],
    derive: [],
  },
  pathway: {
    include: [
      'pathway_id',
      'pathway_type',
      'title',
      'entry_condition',
      'exit_policy',
      'source_v2_pathway_id',
      'currently_authorized_bypass',
      'placement_truth_collection',
      'learner_validation_status',
    ],
    omit: [],
    derive: [],
  },
  extensionPlacement: {
    include: [
      'extension_id',
      'owning_lesson_id',
      'host_first_delivery_relation_id',
      'phase_id',
      'module_id',
      'delivery_status',
      'does_not_create_lesson',
      'required_delivery',
      'generated_view',
      'not_independent_truth',
      'source_relation_ids',
    ],
    omit: [],
    derive: [],
  },
  supportPlacement: {
    include: [
      'support_id',
      'host_lesson_id',
      'host_first_delivery_relation_id',
      'not_a_standalone_lesson',
      'routing_effect',
      'generated_view',
      'not_independent_truth',
      'source_relation_ids',
    ],
    omit: [],
    derive: [],
  },
  graphPolicy: {
    include: [
      'only_hard_prerequisite_blocks_readiness',
      'hard_scope',
      'root_count_is_not_an_optimization_target',
      'sequence_order_not_used_as_prerequisite_evidence',
      'v1_hard_labels_not_imported',
      'native_integration_truth',
      'generic_integration_view',
      'generic_readiness_inference_forbidden',
      'numeric_mastery_or_fluency_thresholds',
      'repair_and_reentry',
    ],
    omit: [],
    derive: [],
  },
  edgeCodebookEntry: {
    include: [
      'directionality',
      'native_direction',
      'generic_direction',
      'readiness_effect',
      'instruction_order_effect',
    ],
    omit: [],
    derive: [],
  },
  sequencePolicy: {
    include: [
      'ordering_priority',
      'only_hard_prerequisite_blocks_readiness',
      'placement_truth_owner',
      'generated_lesson_positions_are_views',
      'modules_phases_pathways_have_no_mastery_state',
      'aamc_weighting_is_quota_or_topology',
    ],
    omit: [],
    derive: [],
  },
  authorityBoundary: {
    include: [
      'source',
      'sha256',
      'present_day_authority_refreshed',
      'required_beyond_ceiling_content_allowed',
      'no_current_endorsement_or_efficacy_claim',
      'learner_validation_status',
      'page_89_stem_cell_cns_regeneration',
    ],
    omit: [],
    derive: [],
  },
};

const RELATION_FIELD_POLICIES = {
  phase_module_relations: [
    'relation_id',
    'phase_id',
    'module_id',
    'phase_module_order',
    'lane',
    'lane_order',
    'concurrency_semantics',
    'source_v2_phase_id',
    'source_v2_module_id',
  ],
  module_delivery_event_relations: [
    'relation_id',
    'placement_kind',
    'phase_id',
    'module_id',
    'module_event_order',
    'global_delivery_event_ordinal',
    'lane',
    'source_v2_baseline_module_id',
    'moved_from_v2_backbone_module',
    'learner_validation_status',
    'lesson_first_delivery_ordinal',
    'target_lesson_id',
    'internal_order_relation_id',
    'v2_cluster_lineage',
    'first_delivery_once',
    'capstone_placement_ordinal',
    'target_capstone_id',
    'owning_lesson_id',
    'component_kc_ids',
    'supporting_capstone_ids',
    'placement_rule',
    'first_assuming_task_boundary',
    'v2_capstone_lineage',
    'first_placement_once',
  ],
  lesson_internal_order_relations: [
    'relation_id',
    'lesson_id',
    'grouping_id',
    'ordered_entity_ids',
    'ordered_nested_kc_ids',
    'owned_capstone_ids',
    'referenced_capstone_ids',
    'source_proposed_order_changed',
    'change_reason',
    'learner_validation_status',
    'topological_order_change',
    'held_scope_exclusion',
    'held_nonrequired_entity_ids',
  ],
  module_revisit_relations: [
    'relation_id',
    'target_lesson_id',
    'first_delivery_relation_id',
    'phase_id',
    'module_id',
    'module_revisit_order',
    'target_entity_ids',
    'upgrade_types',
    'upgrade_description',
    'representation_upgrade',
    'scaffold_fading',
    'plain_duplicate_delivery',
    'learner_validation_status',
  ],
  pathway_phase_relations: [
    'relation_id',
    'pathway_id',
    'phase_id',
    'pathway_phase_order',
    'conditional_overlay',
  ],
  pathway_module_relations: [
    'relation_id',
    'pathway_id',
    'module_id',
    'pathway_module_order',
    'participation',
  ],
  pathway_lesson_scope_relations: [
    'relation_id',
    'pathway_id',
    'lesson_id',
    'scope_order_view_basis',
    'first_delivery_relation_id',
    'does_not_clone_lesson',
  ],
  sirs_math_point_of_use_relations: [
    'relation_id',
    'source_lesson_id',
    'target_lesson_id',
    'target_phase_id',
    'target_module_id',
    'target_first_delivery_relation_id',
    'graph_projection_key',
    'underlying_edge_ids',
    'relation_type',
    'blocking_only_if_hard',
    'authenticity_basis',
    'cartesian_expansion',
    'learner_validation_status',
  ],
  domain_remediation_relations: [
    'relation_id',
    'pathway_id',
    'pathway_type',
    'domain_code',
    'failed_target_id',
    'failed_target_type',
    'repair_action_placeholder',
    'source_repair_type_lineage',
    'source_required_representation_lineage',
    'external_prerequisite_closure',
    'exit_evidence_placeholder',
    'exact_reentry',
    'unresolved_hard_gap_defers_only_recorded_dependent_point',
    'source_v2_cluster_ids',
    'source_v2_failed_target_ids',
    'prepared_learner_policy',
    'learner_validation_status',
  ],
  cars_repair_relations: [
    'relation_id',
    'pathway_id',
    'failed_target_id',
    'failed_target_type',
    'repair_action_placeholder',
    'external_prerequisite_closure',
    'exit_evidence_placeholder',
    'exact_reentry',
    'forbidden_shortcuts',
    'source_v2_cluster_ids',
    'source_v2_failed_target_ids',
    'learner_validation_status',
  ],
  held_nonrequired_relations: [
    'relation_id',
    'entity_id',
    'entity_type',
    'hold_id',
    'required_delivery',
    'required_placement',
    'active_sequence_target',
  ],
  accelerated_candidate_relations: [
    'rule_id',
    'source_v2_rule_key',
    'source_v2_module_id',
    'v3_module_id',
    'candidate_target_ids',
    'candidate_target_lesson_ids',
    'currently_authorized_bypass',
    'fail_closed',
    'assessment_item_set_placeholder',
    'mastery_threshold_placeholder',
    'recency_policy_placeholder',
    'uncertainty_rule_placeholder',
    'failure_action',
    'scope_retained',
    'learner_validation_status',
    'relation_id',
  ],
  cars_weekly_schedule_relations: [
    'phase_id',
    'module_id',
    'weekly_contacts',
    'rolling_window',
    'rolling_skill_emphasis_percent',
    'rolling_passage_domain_balance_percent',
    'concurrency_rule',
    'contact_duration_placeholder',
    'efficacy_claim',
    'learner_validation_status',
    'relation_id',
  ],
  helpful_order_decision_relations: [
    'projection_key',
    'source_lesson_id',
    'target_lesson_id',
    'decision',
    'rationale',
    'blocks_readiness',
    'relation_id',
    'realization_references',
  ],
};

const ALLOWED_NESTED_SOURCE_FIELDS = new Set([
  'accepted_freeze_id',
  'adapter_recommendation_refs',
  'all_incoming_hard_sources_must_be_ready',
  'authored_task_id',
  'authorized_source_forms',
  'beneficiary_revisit_relation_id',
  'capstone_id',
  'capstone_placement_relation_id',
  'cars_relation_ids',
  'checkpoint',
  'component_kc_ids',
  'component_representation_pool',
  'conditional_below_ceiling_support_id',
  'corrected_sides',
  'criterion',
  'currently_authorized_bypass',
  'decision_id',
  'demand_only_side',
  'direction',
  'directness_status',
  'domain_relation_ids',
  'edge_id',
  'endpoint_grain_recomputed',
  'entity_id',
  'entity_ids',
  'entity_type',
  'exit_evidence_placeholder',
  'fail_closed',
  'false_blocking_risk',
  'final_capstone_declaration_id',
  'final_endpoint_pair',
  'finding_id',
  'first_delivery_relation_id',
  'foundations_of_comprehension',
  'generated_view',
  'governance_decision_ids',
  'held_relation_id',
  'hold_id',
  'host_first_delivery_relation_id',
  'human_validation_status',
  'humanities',
  'id_derivation',
  'ids',
  'incoming_hard_edges',
  'independent_role_12_review',
  'lane',
  'learner_validation_status',
  'lesson_id',
  'level',
  'merged_lineage',
  'mitigation',
  'mode',
  'module_event_order',
  'module_id',
  'module_revisit_order',
  'nested_entity_order',
  'new_authored_representation',
  'not_independent_truth',
  'numeric_level_or_threshold',
  'ordinal_view',
  'outcome',
  'outside_subject_knowledge_forbidden',
  'outside_this_route_target_set',
  'owner_role',
  'pathway_id',
  'phase_id',
  'placement_relation_id',
  'point_of_use_necessity_pass',
  'policy',
  'position',
  'preserved_v2_task_edge_ids',
  'rationale',
  'reason',
  'reasoning_beyond_text',
  'reasoning_within_text',
  'reentry_rule',
  'reentry_target_id',
  'relation_id',
  'repair_action_placeholder',
  'repair_target_id',
  'representation_agnostic',
  'representation_agnostic_rationale',
  'representation_review_rationale',
  'required',
  'required_delivery',
  'required_placement',
  'residual_representation_grounding',
  'review_rationale',
  'reviewed_extension_candidate_ids',
  'reviewer_roles',
  'revisit_module_id',
  'role13_finding_ids',
  'scope_hold_risk',
  'social_sciences',
  'source_capstone_grounding',
  'source_classifications_considered_as_candidates',
  'source_edge_lineage_count',
  'source_first_delivery_relation_id',
  'source_id',
  'source_pair_lineage_preserved',
  'source_relation_ids',
  'source_representations',
  'source_status',
  'state',
  'status',
  'support_is_conditional_and_noncredit',
  'supporting_capstone_ids',
  'target_capstone_grounding',
  'target_id',
  'target_point_of_use_representations',
  'target_type',
  'topic_neutral_and_noncredit',
  'v1_label_used_as_truth',
  'v2_active_edge_ids',
  'v2_candidate_edge_ids',
  'v2_extension_id',
]);

const OMITTED_NESTED_SOURCE_FIELDS = new Set(['owner_stage', 'source_stage_status']);
const SENSITIVE_FIELD_NAMES = new Set([
  'answer',
  'answer_explanation',
  'answer_key',
  'answers',
  'assessment_item',
  'assessment_items',
  'authored_content',
  'copyright_text',
  'correct_answer',
  'correct_option',
  'correct_response',
  'distractor',
  'distractors',
  'exact_text',
  'explanation',
  'item',
  'items',
  'item_stem',
  'lesson_content',
  'passage',
  'passage_content',
  'passage_text',
  'prompt',
  'prompt_text',
  'protected_content',
  'protected_question',
  'question',
  'question_stem',
  'questions',
  'rubric',
  'solution',
  'solution_text',
  'source_text',
  'source_summary',
  'stem',
  'textbook_prose',
  'verbatim_text',
  'worked_example',
]);

function fail(message) {
  throw new Error(`V3 authoring manifest validation failed: ${message}`);
}

function assert(condition, message) {
  if (!condition) {
    fail(message);
  }
}

function assertEqual(actual, expected, label) {
  if (!isDeepStrictEqual(actual, expected)) {
    fail(`${label} mismatch`);
  }
}

function assertCount(records, expected, label) {
  assert(Array.isArray(records), `${label} must be an array`);
  assert(records.length === expected, `${label} count ${records.length}; expected ${expected}`);
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function uniqueIndex(records, idField, label) {
  const index = new Map();
  records.forEach((record, position) => {
    const id = record[idField];
    assert(typeof id === 'string' && id.length > 0, `${label}[${position}] lacks ${idField}`);
    assert(!index.has(id), `duplicate ${label} ID ${id}`);
    index.set(id, record);
  });
  return index;
}

function arrayIndex(records, idField) {
  return Object.fromEntries(records.map((record, position) => [record[idField], position]));
}

function pushMapList(map, key, value) {
  const values = map.get(key) ?? [];
  values.push(value);
  map.set(key, values);
}

function assertIdOrder(authoritativeRecords, generatedRecords, idField, label) {
  assertEqual(
    generatedRecords.map((record) => record[idField]),
    authoritativeRecords.map((record) => record[idField]),
    `${label} ID order`,
  );
}

function assertRequiredFields(record, requiredFields, label) {
  for (const field of requiredFields) {
    assert(Object.hasOwn(record, field), `${label} lacks required field ${field}`);
  }
}

function sortObjectKeys(value) {
  if (Array.isArray(value)) {
    return value.map(sortObjectKeys);
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, sortObjectKeys(value[key])]),
    );
  }
  return value;
}

function projectNestedValue(value, context) {
  if (Array.isArray(value)) {
    return value.map((entry, position) => projectNestedValue(entry, `${context}[${position}]`));
  }
  if (value !== null && typeof value === 'object') {
    const projected = {};
    for (const [field, child] of Object.entries(value)) {
      if (OMITTED_NESTED_SOURCE_FIELDS.has(field)) {
        continue;
      }
      assert(
        ALLOWED_NESTED_SOURCE_FIELDS.has(field),
        `${context} contains unallowlisted nested field ${field}`,
      );
      projected[field] = projectNestedValue(child, `${context}.${field}`);
    }
    return projected;
  }
  assert(
    value === null ||
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean',
    `${context} contains a non-JSON value`,
  );
  return value;
}

function projectSourceRecord(record, policyName, label) {
  const policy = SOURCE_RECORD_POLICIES[policyName];
  assert(policy !== undefined, `unknown source-record policy ${policyName}`);
  const knownFields = new Set([...policy.include, ...policy.omit, ...policy.derive]);
  const unknownFields = Object.keys(record).filter((field) => !knownFields.has(field));
  assert(
    unknownFields.length === 0,
    `${label} contains unallowlisted field(s): ${unknownFields.join(', ')}`,
  );

  const projected = {};
  for (const field of policy.include) {
    if (Object.hasOwn(record, field)) {
      projected[field] = projectNestedValue(record[field], `${label}.${field}`);
    }
  }
  return projected;
}

function projectRelationCollections(relations) {
  const projected = {
    truth_owner: relations.truth_owner,
    normalization_rule: relations.normalization_rule,
  };
  assertEqual(
    Object.entries(relations)
      .filter(([, value]) => !Array.isArray(value))
      .map(([name]) => name)
      .sort(),
    ['normalization_rule', 'truth_owner'],
    'normalized relation scalar-field allowlist',
  );
  assert(relations.truth_owner === true, 'normalized sequence truth-owner marker');
  assert(
    typeof relations.normalization_rule === 'string' && relations.normalization_rule.length > 0,
    'normalized sequence normalization rule',
  );

  const expectedCollections = Object.keys(RELATION_FIELD_POLICIES).sort();
  const actualCollections = Object.entries(relations)
    .filter(([, value]) => Array.isArray(value))
    .map(([name]) => name)
    .sort();
  assertEqual(actualCollections, expectedCollections, 'normalized relation collection allowlist');

  for (const collection of expectedCollections) {
    const policyName = `relation:${collection}`;
    SOURCE_RECORD_POLICIES[policyName] = {
      include: RELATION_FIELD_POLICIES[collection],
      omit: [],
      derive: [],
    };
    projected[collection] = relations[collection].map((record, position) =>
      projectSourceRecord(record, policyName, `${collection}[${position}]`),
    );
    delete SOURCE_RECORD_POLICIES[policyName];
  }
  return projected;
}

function sourceProjectionMetadata() {
  const omittedFieldsByRecordType = {};
  const derivedFieldsByRecordType = {};
  for (const [recordType, policy] of Object.entries(SOURCE_RECORD_POLICIES)) {
    if (policy.omit.length > 0) {
      omittedFieldsByRecordType[recordType] = [...policy.omit].sort();
    }
    if (policy.derive.length > 0) {
      derivedFieldsByRecordType[recordType] = [...policy.derive].sort();
    }
  }
  omittedFieldsByRecordType.nested_records = [...OMITTED_NESTED_SOURCE_FIELDS].sort();
  return {
    unknown_fields: 'fail_closed',
    nested_unknown_fields: 'fail_closed',
    omitted_fields_by_record_type: omittedFieldsByRecordType,
    derived_fields_by_record_type: derivedFieldsByRecordType,
  };
}

function stripAllowedWebUrls(value) {
  return value
    .replace(/\bhttps?:\/\/[^\s<>"'`]+/giu, '')
    .replace(
      /(^|[\s("'`])\/\/(?:[A-Za-z0-9-]+\.)+[A-Za-z]{2,}(?::\d+)?(?:\/[^\s<>"'`]*)?/giu,
      '$1',
    );
}

function containsAbsoluteMachinePath(value) {
  if (/\bfile:(?:\/\/)?/iu.test(value)) {
    return true;
  }

  const withoutWebUrls = stripAllowedWebUrls(value);
  const windowsOrUncPath = /(?:^|[\s"'`()[\]{}=,:;])(?:[A-Za-z]:[\\/]|\\\\[^\\\s]+\\[^\\\s]+)/u;
  const expandedHomePath =
    /(?:^|[\s"'`()[\]{}=,:;])(?:~(?:[A-Za-z0-9._-]+)?|\$(?:HOME|PWD|USERPROFILE|WORKSPACE)|\$\{(?:HOME|PWD|USERPROFILE|WORKSPACE)\}|%USERPROFILE%)[\\/][^\s]+/iu;
  const posixNetworkPath = /(?:^|[\s"'`()[\]{}=,:;])\/\/[^/\s"'`<>]+\/[^/\s"'`<>]+/u;
  const posixAbsolutePath =
    /(?:^|[\s"'`()[\]{}=,:;])\/(?!\/)(?:[^\s/"'`()[\]{}<>]+)(?:\/[^\s/"'`()[\]{}<>]+)*/u;

  return (
    windowsOrUncPath.test(withoutWebUrls) ||
    expandedHomePath.test(withoutWebUrls) ||
    posixNetworkPath.test(withoutWebUrls) ||
    posixAbsolutePath.test(withoutWebUrls)
  );
}

function assertManifestSafe(value, context = '$', key = null) {
  if (Array.isArray(value)) {
    value.forEach((entry, position) => assertManifestSafe(entry, `${context}[${position}]`, key));
    return;
  }
  if (value !== null && typeof value === 'object') {
    for (const [field, child] of Object.entries(value)) {
      assert(!SENSITIVE_FIELD_NAMES.has(field.toLowerCase()), `${context}.${field} is sensitive`);
      assert(
        !field.startsWith('source_stage_'),
        `${context}.${field} is a stale pre-completion source-stage field`,
      );
      assertManifestSafe(child, `${context}.${field}`, field);
    }
    return;
  }
  assert(
    value === null ||
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean',
    `${context} contains a non-JSON value`,
  );
  if (typeof value !== 'string') {
    return;
  }

  assert(
    !containsAbsoluteMachinePath(value),
    `${context} contains a local or absolute machine path`,
  );
  if (key === 'path' || key?.endsWith('_path')) {
    assert(!value.startsWith('/') && !/^[A-Za-z]:[\\/]/.test(value), `${context} is absolute`);
    assert(!value.split(/[\\/]/).includes('..'), `${context} traverses outside its logical root`);
  }
}

function normalizedPathForComparison(path) {
  return process.platform === 'darwin' || process.platform === 'win32'
    ? path.toLocaleLowerCase('en-US')
    : path;
}

async function existingPathIdentity(path, label) {
  let pathLstat;
  try {
    pathLstat = await lstat(path);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null;
    }
    fail(`cannot inspect ${label} ${path}: ${error.message}`);
  }

  let resolvedPath;
  let pathStat;
  try {
    resolvedPath = await realpath(path);
    pathStat = await stat(path);
  } catch (error) {
    fail(`${label} ${path} is an unreadable or broken alias: ${error.message}`);
  }
  return { lstat: pathLstat, path: resolvedPath, stat: pathStat };
}

async function assertSafeOutputTarget(outputPath, protectedPaths) {
  const outputParent = await realpath(dirname(outputPath));
  const canonicalCandidate = join(outputParent, basename(outputPath));
  const candidateComparison = normalizedPathForComparison(canonicalCandidate);
  const outputIdentity = await existingPathIdentity(outputPath, 'output path');
  if (outputIdentity !== null) {
    assert(outputIdentity.stat.isFile(), `output path ${outputPath} is not a regular file`);
  }

  for (const protectedPath of protectedPaths) {
    const protectedIdentity = await existingPathIdentity(protectedPath, 'protected source');
    assert(protectedIdentity !== null, `protected source disappeared: ${protectedPath}`);
    const protectedComparison = normalizedPathForComparison(protectedIdentity.path);
    assert(
      candidateComparison !== protectedComparison,
      `output path aliases protected source ${protectedPath}`,
    );
    if (outputIdentity !== null) {
      assert(
        !(
          outputIdentity.stat.dev === protectedIdentity.stat.dev &&
          outputIdentity.stat.ino === protectedIdentity.stat.ino
        ),
        `output inode aliases protected source ${protectedPath}`,
      );
      assert(
        normalizedPathForComparison(outputIdentity.path) !== protectedComparison,
        `output real path aliases protected source ${protectedPath}`,
      );
    }
  }
}

async function writeFileAtomically(outputPath, output, protectedPaths) {
  await mkdir(dirname(outputPath), { recursive: true });
  await assertSafeOutputTarget(outputPath, protectedPaths);

  const temporaryPath = join(
    dirname(outputPath),
    `.${basename(outputPath)}.${process.pid}.${randomBytes(8).toString('hex')}.tmp`,
  );
  let handle;
  try {
    handle = await open(temporaryPath, 'wx', 0o666);
    await handle.writeFile(output, 'utf8');
    await handle.sync();
    await handle.close();
    handle = undefined;
    await assertSafeOutputTarget(outputPath, protectedPaths);
    await rename(temporaryPath, outputPath);
  } finally {
    if (handle !== undefined) {
      await handle.close().catch(() => {});
    }
    await unlink(temporaryPath).catch((error) => {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    });
  }
}

async function loadJsonFile(sourceDirectory, definition) {
  const absolutePath = resolve(sourceDirectory, definition.path);
  let buffer;
  try {
    buffer = await readFile(absolutePath);
  } catch (error) {
    fail(`cannot read required source ${definition.path}: ${error.message}`);
  }

  const actualSha256 = sha256(buffer);
  assert(
    actualSha256 === definition.sha256,
    `${definition.path} SHA-256 ${actualSha256}; expected ${definition.sha256}`,
  );

  let data;
  try {
    data = JSON.parse(buffer.toString('utf8'));
  } catch (error) {
    fail(`cannot parse required source ${definition.path}: ${error.message}`);
  }
  assert(
    data.schema_version === definition.schemaVersion,
    `${definition.path} schema ${String(data.schema_version)}; expected ${definition.schemaVersion}`,
  );

  return { absolutePath, actualSha256, data, definition };
}

function validateSourcePackage(sources, contractText, contractHash) {
  const completion = sources.completion.data;
  const registry = sources.registry.data;
  const frozenSchema = sources.frozenSchema.data;
  const validation = sources.validation.data;

  assert(completion.status === 'complete', 'completion manifest is not complete');
  assertEqual(completion.blockers, [], 'completion blockers');
  assert(
    completion.registry.sha256 === EXPECTED.registrySha256,
    'completion manifest registry hash label',
  );
  assert(
    sources.registry.actualSha256 === completion.registry.sha256,
    'recomputed registry hash versus completion manifest',
  );

  for (const source of Object.values(sources)) {
    const expectedArtifactHash = completion.artifact_hashes?.[source.definition.path];
    if (expectedArtifactHash !== undefined) {
      assert(
        expectedArtifactHash === source.actualSha256,
        `completion artifact hash for ${source.definition.path}`,
      );
    }
  }
  assert(
    completion.validation.sha256 === sources.validation.actualSha256,
    'completion validation-results hash',
  );

  assert(registry.artifact_id === EXPECTED.registryArtifactId, 'registry artifact ID');
  assert(registry.freeze_id === EXPECTED.freezeIds.phase0, 'registry phase-0 freeze ID');
  assert(registry.phase1_gate_id === EXPECTED.phase1GateId, 'registry phase-1 gate ID');
  assert(
    registry.canonical_freeze?.freeze_id === EXPECTED.freezeIds.canonical,
    'canonical freeze ID',
  );
  assert(registry.graph_freeze?.freeze_id === EXPECTED.freezeIds.graph, 'graph freeze ID');
  assert(registry.sequence_freeze?.freeze_id === EXPECTED.freezeIds.sequence, 'sequence freeze ID');
  assert(frozenSchema.freeze_id === EXPECTED.freezeIds.phase0, 'frozen-schema freeze ID');
  assert(
    frozenSchema.authoritative_registry_path === 'work/v3-authoritative-registry.json',
    'frozen-schema registry path must be package-relative',
  );

  assert(contractHash === EXPECTED.contractSha256, `canonical contract SHA-256 ${contractHash}`);
  assert(
    contractText.includes(`Registry SHA-256: \`${EXPECTED.registrySha256}\``),
    'canonical contract does not pin the expected registry hash',
  );
  assert(
    contractText.includes('**Status:** Design specification, version 0.2'),
    'canonical contract version marker',
  );
  assert(
    contractText.includes('The registry is the single source of curriculum truth.'),
    'canonical contract authority marker',
  );

  assert(validation.status === 'complete', 'deterministic validation is not complete');
  assert(validation.failed_count === 0, 'deterministic validation contains failures');
  assert(validation.passed_count === validation.check_count, 'validation pass/check counts');
  assert(validation.check_count === 63, 'expected 63 authoritative validation checks');
  assert(validation.protected_inputs_unchanged === true, 'protected inputs changed');
  assert(validation.learner_validation_status === 'unvalidated', 'learner validation status');

  const generatedDocuments = [
    sources.kcs.data,
    sources.lessons.data,
    sources.groupings.data,
    sources.attachments.data,
    sources.sourceCrosswalk.data,
    sources.adoption.data,
    sources.graph.data,
    sources.sequence.data,
  ];
  for (const document of generatedDocuments) {
    assert(
      document.metadata?.generated_view === true,
      `${document.schema_version} generated-view marker`,
    );
    assert(
      document.metadata?.not_independent_truth === true,
      `${document.schema_version} independent-truth marker`,
    );
    assert(
      document.metadata?.registry_artifact_id === EXPECTED.registryArtifactId,
      `${document.schema_version} registry artifact ID`,
    );
    assert(
      document.metadata?.registry_sha256 === EXPECTED.registrySha256,
      `${document.schema_version} registry SHA-256`,
    );
    assertEqual(
      document.metadata?.freeze_ids,
      EXPECTED.freezeIds,
      `${document.schema_version} freeze IDs`,
    );
    assert(
      document.metadata?.learner_validation_status === 'unvalidated',
      `${document.schema_version} learner validation`,
    );
  }
}

function validateRegistryProjectionParity(sources) {
  const registry = sources.registry.data;
  const kcs = sources.kcs.data.kcs;
  const lessons = sources.lessons.data.lessons;
  const groupings = sources.groupings.data.groupings;
  const attachments = sources.attachments.data;
  const sourceCrosswalk = sources.sourceCrosswalk.data;
  const adoption = sources.adoption.data;
  const graph = sources.graph.data;
  const sequence = sources.sequence.data;

  assertIdOrder(registry.kcs, kcs, 'kc_id', 'KC projection');
  assertIdOrder(registry.lessons, lessons, 'lesson_id', 'lesson projection');
  assertIdOrder(registry.groupings, groupings, 'grouping_id', 'grouping projection');
  assertIdOrder(
    registry.extensions,
    attachments.extensions,
    'extension_id',
    'extension projection',
  );
  assertIdOrder(registry.capstones, attachments.capstones, 'capstone_id', 'capstone projection');
  assertIdOrder(
    registry.supports,
    attachments.support_artifacts,
    'support_id',
    'support projection',
  );
  assertIdOrder(
    registry.source_occurrences,
    sourceCrosswalk.source_occurrences,
    'source_occurrence_id',
    'source occurrence projection',
  );
  assertIdOrder(
    registry.source_mappings,
    sourceCrosswalk.mappings,
    'mapping_id',
    'source mapping projection',
  );
  assertIdOrder(
    registry.adoption_decisions,
    adoption.adoption_decisions,
    'decision_id',
    'adoption decision projection',
  );
  assertIdOrder(
    registry.governance_decisions,
    adoption.governance_decisions,
    'decision_id',
    'governance decision projection',
  );

  assertEqual(groupings, registry.groupings, 'grouping projection content');
  assertEqual(attachments.extensions, registry.extensions, 'extension projection content');
  assertEqual(attachments.capstones, registry.capstones, 'capstone projection content');
  assertEqual(attachments.support_artifacts, registry.supports, 'support projection content');
  assertEqual(
    sourceCrosswalk.source_occurrences,
    registry.source_occurrences,
    'source occurrence content',
  );
  assertEqual(sourceCrosswalk.mappings, registry.source_mappings, 'source mapping content');
  assertEqual(
    adoption.adoption_decisions,
    registry.adoption_decisions,
    'adoption decision content',
  );
  assertEqual(
    adoption.governance_decisions,
    registry.governance_decisions,
    'governance decision content',
  );
  assertEqual(graph.graph_policy, registry.graph.graph_policy, 'graph policy projection');
  assertEqual(graph.edge_codebook, registry.graph.edge_codebook, 'edge codebook projection');
  const registryEdges = Object.values(registry.graph.authoritative_edges.edges_by_type).flat();
  const registryEdgeIndex = uniqueIndex(registryEdges, 'edge_id', 'registry graph edge');
  assertIdOrder(
    [...registryEdges].sort((left, right) => left.edge_id.localeCompare(right.edge_id)),
    graph.edges,
    'edge_id',
    'graph edge projection',
  );
  for (const edge of graph.edges) {
    assertEqual(edge, registryEdgeIndex.get(edge.edge_id), `${edge.edge_id} graph edge projection`);
  }
  assertEqual(sequence.phases, registry.sequence.phases, 'phase projection');
  assertEqual(sequence.modules, registry.sequence.modules, 'module projection');
  assertEqual(sequence.pathways, registry.sequence.pathways, 'pathway projection');
  assertEqual(
    sequence.normalized_sequence_relations,
    registry.sequence.normalized_sequence_relations,
    'normalized sequence relation projection',
  );
  assertEqual(
    sequence.generated_views.extension_placement_views,
    registry.sequence.generated_views.extension_placement_views,
    'extension placement projection',
  );
  assertEqual(
    sequence.generated_views.support_placement_views,
    registry.sequence.generated_views.support_placement_views,
    'support placement projection',
  );

  const registryKcs = uniqueIndex(registry.kcs, 'kc_id', 'registry KC');
  for (const kc of kcs) {
    const registryKc = registryKcs.get(kc.kc_id);
    for (const [field, value] of Object.entries(kc)) {
      if (
        field === 'hard_prerequisite_ids' ||
        field === 'helpful_prerequisite_ids' ||
        field === 'successor_ids'
      ) {
        assertEqual(value, registryKc[field].ids, `${kc.kc_id}.${field}`);
      } else {
        assertEqual(value, registryKc[field], `${kc.kc_id}.${field}`);
      }
    }
  }

  const registryLessons = uniqueIndex(registry.lessons, 'lesson_id', 'registry lesson');
  const directLessonFields = [
    'lesson_id',
    'canonical_display_label',
    'short_display_alias',
    'lesson_type',
    'concise_scope',
    'scope_exclusions',
    'owning_cluster_id',
    'nested_kc_ids',
    'nested_kc_labels',
    'support_artifact_ids',
    'extension_ids',
    'capstone_ids',
    'source_sections',
    'foundational_concepts',
    'content_categories',
    'aamc_pages',
    'source_anchor_ids',
    'grouping_rationale',
    'granularity_rationale',
    'review_status',
    'unresolved_holds',
    'v1_contribution',
    'v2_contribution',
    'v3_decision_rationale',
  ];
  for (const lesson of lessons) {
    const registryLesson = registryLessons.get(lesson.lesson_id);
    for (const field of directLessonFields) {
      assertEqual(lesson[field], registryLesson[field], `${lesson.lesson_id}.${field}`);
    }
    assertEqual(
      lesson.hard_prerequisite_lesson_ids,
      registryLesson.hard_prerequisite_lesson_ids.ids,
      `${lesson.lesson_id}.hard_prerequisite_lesson_ids`,
    );
    assertEqual(
      lesson.helpful_prerequisite_lesson_ids,
      registryLesson.helpful_prerequisite_lesson_ids.ids,
      `${lesson.lesson_id}.helpful_prerequisite_lesson_ids`,
    );
    assertEqual(
      lesson.direct_successor_lesson_ids,
      registryLesson.direct_successor_lesson_ids.ids,
      `${lesson.lesson_id}.direct_successor_lesson_ids`,
    );
    assertEqual(lesson.phase_ids, registryLesson.phase_ids.ids, `${lesson.lesson_id}.phase_ids`);
    assertEqual(lesson.module_ids, registryLesson.module_ids.ids, `${lesson.lesson_id}.module_ids`);
    assertEqual(
      lesson.pathway_positions,
      registryLesson.pathway_positions.records,
      `${lesson.lesson_id}.pathway_positions`,
    );
    assertEqual(
      lesson.revisit_positions,
      registryLesson.revisit_positions.records,
      `${lesson.lesson_id}.revisit_positions`,
    );
    assert(
      lesson.accelerated_handling.currently_authorized_bypass ===
        registryLesson.accelerated_handling.currently_authorized_bypass,
      `${lesson.lesson_id} accelerated bypass projection`,
    );
    assert(
      lesson.accelerated_handling.fail_closed === registryLesson.accelerated_handling.fail_closed,
      `${lesson.lesson_id} accelerated fail-closed projection`,
    );
  }
}

function validateArchitecture(sources) {
  const registry = sources.registry.data;
  const frozenSchema = sources.frozenSchema.data;
  const validation = sources.validation.data;
  const kcs = sources.kcs.data.kcs;
  const lessons = sources.lessons.data.lessons;
  const groupings = sources.groupings.data.groupings;
  const { extensions, capstones, support_artifacts: supports } = sources.attachments.data;
  const { source_occurrences: sourceOccurrences, mappings: sourceMappings } =
    sources.sourceCrosswalk.data;
  const { adoption_decisions: adoptionDecisions, governance_decisions: governanceDecisions } =
    sources.adoption.data;
  const graph = sources.graph.data;
  const sequence = sources.sequence.data;
  const relations = sequence.normalized_sequence_relations;
  const holds = registry.holds;
  const generatedGroupingViews = registry.generated_grouping_views;

  assertCount(lessons, EXPECTED.counts.lessons, 'lessons');
  assertCount(kcs, EXPECTED.counts.kcs, 'KCs');
  assertCount(groupings, EXPECTED.counts.groupings, 'groupings');
  assertCount(generatedGroupingViews, 1, 'generated noncanonical grouping views');
  assertCount(extensions, EXPECTED.counts.extensions, 'extensions');
  assertCount(capstones, EXPECTED.counts.capstones, 'capstones');
  assertCount(supports, EXPECTED.counts.supports, 'supports');
  assertCount(sourceOccurrences, EXPECTED.counts.sourceOccurrences, 'source occurrences');
  assertCount(sourceMappings, EXPECTED.counts.sourceMappings, 'source mappings');
  assertCount(adoptionDecisions, EXPECTED.counts.adoptionDecisions, 'adoption decisions');
  assertCount(governanceDecisions, EXPECTED.counts.governanceDecisions, 'governance decisions');
  assertCount(holds, EXPECTED.counts.holds, 'holds');
  assertCount(graph.edges, EXPECTED.counts.edges, 'graph edges');
  assertCount(sequence.phases, EXPECTED.counts.phases, 'phases');
  assertCount(sequence.modules, EXPECTED.counts.modules, 'modules');
  assertCount(sequence.pathways, EXPECTED.counts.pathways, 'pathways');

  const hardEdgeCount = graph.edges.filter((edge) => edge.edge_type === 'HARD_PREREQUISITE').length;
  assert(hardEdgeCount === EXPECTED.counts.hardEdges, `hard edge count ${hardEdgeCount}`);

  const expectedCountSources = [
    sources.completion.data.counts,
    validation.counts,
    {
      kcs: registry.counts.entities.kcs,
      lessons: registry.counts.entities.lessons,
      groupings: registry.counts.entities.groupings,
      extensions: registry.counts.entities.extensions,
      capstones: registry.counts.entities.capstones,
      supports: registry.counts.entities.supports,
      source_occurrences: registry.counts.entities.source_occurrences,
      source_mappings: registry.counts.entities.atomic_source_mappings,
      adoption_decisions: registry.counts.decisions.adoption_decisions,
      governance_decisions: registry.counts.decisions.governance_decisions,
      holds: registry.counts.entities.holds,
      open_holds: registry.counts.entities.open_holds,
      closed_holds: registry.counts.entities.closed_holds,
    },
  ];
  const expectedPairs = {
    kcs: EXPECTED.counts.kcs,
    lessons: EXPECTED.counts.lessons,
    groupings: EXPECTED.counts.groupings,
    extensions: EXPECTED.counts.extensions,
    capstones: EXPECTED.counts.capstones,
    supports: EXPECTED.counts.supports,
  };
  for (const countSource of expectedCountSources) {
    for (const [field, expected] of Object.entries(expectedPairs)) {
      assert(countSource[field] === expected, `${field} count ledger mismatch`);
    }
  }

  const lessonIndex = uniqueIndex(lessons, 'lesson_id', 'lesson');
  const kcIndex = uniqueIndex(kcs, 'kc_id', 'KC');
  const groupingIndex = uniqueIndex(groupings, 'grouping_id', 'grouping');
  const generatedGroupingIndex = uniqueIndex(
    generatedGroupingViews,
    'grouping_id',
    'generated grouping view',
  );
  const extensionIndex = uniqueIndex(extensions, 'extension_id', 'extension');
  const capstoneIndex = uniqueIndex(capstones, 'capstone_id', 'capstone');
  const supportIndex = uniqueIndex(supports, 'support_id', 'support');
  const holdIndex = uniqueIndex(holds, 'hold_id', 'hold');
  const edgeIndex = uniqueIndex(graph.edges, 'edge_id', 'edge');
  const adoptionIndex = uniqueIndex(adoptionDecisions, 'decision_id', 'adoption decision');
  uniqueIndex(governanceDecisions, 'decision_id', 'governance decision');
  const sourceOccurrenceIndex = uniqueIndex(
    sourceOccurrences,
    'source_occurrence_id',
    'source occurrence',
  );
  uniqueIndex(sourceMappings, 'mapping_id', 'source mapping');
  const phaseIndex = uniqueIndex(sequence.phases, 'phase_id', 'phase');
  const moduleIndex = uniqueIndex(sequence.modules, 'module_id', 'module');
  const pathwayIndex = uniqueIndex(sequence.pathways, 'pathway_id', 'pathway');

  for (const lesson of lessons) {
    assertRequiredFields(lesson, frozenSchema.lesson_fields, lesson.lesson_id);
    assert(lesson.lesson_type === 'CORE', `${lesson.lesson_id} is not CORE`);
    assert(
      lesson.nested_kc_ids.length >= 1 && lesson.nested_kc_ids.length <= 5,
      `${lesson.lesson_id} must contain one to five KCs`,
    );
    assert(
      lesson.nested_kc_ids.length === lesson.nested_kc_labels.length,
      `${lesson.lesson_id} nested KC ID/label cardinality`,
    );
    assert(groupingIndex.has(lesson.owning_cluster_id), `${lesson.lesson_id} owning grouping`);
    lesson.nested_kc_ids.forEach((kcId, position) => {
      const kc = kcIndex.get(kcId);
      assert(kc !== undefined, `${lesson.lesson_id} nested KC ${kcId}`);
      assert(kc.owning_lesson_id === lesson.lesson_id, `${kcId} owning lesson`);
      assert(
        kc.display_label === lesson.nested_kc_labels[position],
        `${lesson.lesson_id} nested KC label at ${position}`,
      );
    });
    for (const prerequisiteId of [
      ...lesson.hard_prerequisite_lesson_ids,
      ...lesson.helpful_prerequisite_lesson_ids,
      ...lesson.direct_successor_lesson_ids,
    ]) {
      assert(
        lessonIndex.has(prerequisiteId),
        `${lesson.lesson_id} lesson graph reference ${prerequisiteId}`,
      );
    }
    for (const phaseId of lesson.phase_ids) {
      assert(phaseIndex.has(phaseId), `${lesson.lesson_id} phase ${phaseId}`);
    }
    for (const moduleId of lesson.module_ids) {
      assert(moduleIndex.has(moduleId), `${lesson.lesson_id} module ${moduleId}`);
    }
    for (const position of lesson.pathway_positions) {
      assert(
        pathwayIndex.has(position.pathway_id),
        `${lesson.lesson_id} pathway ${position.pathway_id}`,
      );
      assert(
        Number.isInteger(position.position) && position.position > 0,
        `${lesson.lesson_id} pathway position`,
      );
    }
    for (const holdId of lesson.unresolved_holds) {
      assert(holdIndex.has(holdId), `${lesson.lesson_id} unresolved hold ${holdId}`);
    }
    for (const extensionId of lesson.extension_ids) {
      assert(extensionIndex.has(extensionId), `${lesson.lesson_id} extension ${extensionId}`);
    }
    for (const capstoneId of lesson.capstone_ids) {
      assert(capstoneIndex.has(capstoneId), `${lesson.lesson_id} capstone ${capstoneId}`);
    }
    for (const supportId of lesson.support_artifact_ids) {
      assert(supportIndex.has(supportId), `${lesson.lesson_id} support ${supportId}`);
    }
    assert(
      lesson.accelerated_handling.currently_authorized_bypass === false,
      `${lesson.lesson_id} bypass`,
    );
    assert(lesson.accelerated_handling.fail_closed === true, `${lesson.lesson_id} fail closed`);
    assert(
      lesson.review_status.includes('LEARNER_UNVALIDATED'),
      `${lesson.lesson_id} review/validation status`,
    );
  }

  const nestedKcIds = lessons.flatMap((lesson) => lesson.nested_kc_ids);
  assert(
    new Set(nestedKcIds).size === EXPECTED.counts.kcs && nestedKcIds.length === EXPECTED.counts.kcs,
    'nested KC ownership/order does not cover every KC exactly once',
  );

  const sourceTopicIds = new Set(
    sourceOccurrences.map((occurrence) => occurrence.source_topic_id).filter(Boolean),
  );
  const sourceAnchorIds = new Set(
    sourceOccurrences.flatMap((occurrence) => [
      ...(occurrence.source_anchor_ids ?? []),
      ...(occurrence.source_anchor_id ? [occurrence.source_anchor_id] : []),
    ]),
  );

  for (const kc of kcs) {
    assertRequiredFields(kc, frozenSchema.kc_fields, kc.kc_id);
    assert(lessonIndex.has(kc.owning_lesson_id), `${kc.kc_id} owning lesson`);
    assert(kc.identity_role === 'canonical_core', `${kc.kc_id} canonical identity role`);
    assert(kc.learner_validation_status === 'unvalidated', `${kc.kc_id} learner validation`);
    assert(adoptionIndex.has(kc.adoption_decision_id), `${kc.kc_id} adoption decision`);
    for (const targetId of [
      ...kc.hard_prerequisite_ids,
      ...kc.helpful_prerequisite_ids,
      ...kc.successor_ids,
    ]) {
      assert(
        kcIndex.has(targetId) || capstoneIndex.has(targetId),
        `${kc.kc_id} graph target ${targetId}`,
      );
    }
    for (const extensionId of kc.extension_ids) {
      assert(extensionIndex.has(extensionId), `${kc.kc_id} extension ${extensionId}`);
    }
    for (const capstoneId of kc.capstone_ids) {
      assert(capstoneIndex.has(capstoneId), `${kc.kc_id} capstone ${capstoneId}`);
    }
    for (const sourceTopicId of kc.source_topic_ids) {
      assert(sourceTopicIds.has(sourceTopicId), `${kc.kc_id} source topic ${sourceTopicId}`);
    }
    for (const sourceAnchorId of kc.source_anchor_ids) {
      assert(sourceAnchorIds.has(sourceAnchorId), `${kc.kc_id} source anchor ${sourceAnchorId}`);
    }
  }

  for (const grouping of groupings) {
    const lesson = lessonIndex.get(grouping.lesson_id);
    assert(lesson !== undefined, `${grouping.grouping_id} lesson`);
    assert(
      lesson.owning_cluster_id === grouping.grouping_id,
      `${grouping.grouping_id} lesson owner`,
    );
    assertEqual(grouping.member_kc_ids, lesson.nested_kc_ids, `${grouping.grouping_id} KC order`);
    const teachingKcOrder = grouping.teaching_order.entity_ids.filter((id) => kcIndex.has(id));
    assertEqual(teachingKcOrder, lesson.nested_kc_ids, `${grouping.grouping_id} teaching KC order`);
    for (const capstoneId of grouping.member_capstone_ids) {
      assert(capstoneIndex.has(capstoneId), `${grouping.grouping_id} capstone ${capstoneId}`);
    }
    for (const decisionId of grouping.adoption_decision_ids) {
      assert(
        adoptionIndex.has(decisionId),
        `${grouping.grouping_id} adoption decision ${decisionId}`,
      );
    }
  }

  for (const grouping of generatedGroupingViews) {
    assert(grouping.lesson_id === null, `${grouping.grouping_id} must not own a lesson`);
    assert(
      grouping.view_type === 'GENERATED_DIAGNOSTIC_GROUPING_VIEW',
      `${grouping.grouping_id} view type`,
    );
    assert(grouping.canonical_mastery_state === false, `${grouping.grouping_id} mastery state`);
    assert(grouping.owns_evidence_state === false, `${grouping.grouping_id} evidence state`);
    assert(grouping.owns_remediation_state === false, `${grouping.grouping_id} remediation state`);
    for (const kcId of grouping.member_kc_ids) {
      assert(kcIndex.has(kcId), `${grouping.grouping_id} member ${kcId}`);
    }
    for (const decisionId of grouping.adoption_decision_ids) {
      assert(
        adoptionIndex.has(decisionId),
        `${grouping.grouping_id} adoption decision ${decisionId}`,
      );
    }
  }

  for (const extension of extensions) {
    assert(adoptionIndex.has(extension.adoption_decision_id), `${extension.extension_id} adoption`);
    assert(lessonIndex.has(extension.owning_lesson_id), `${extension.extension_id} owner`);
    for (const lessonId of [
      ...extension.host_lesson_ids,
      ...extension.secondary_application_lesson_ids,
    ]) {
      assert(lessonIndex.has(lessonId), `${extension.extension_id} host lesson ${lessonId}`);
    }
    for (const kcId of extension.host_core_ids) {
      assert(kcIndex.has(kcId), `${extension.extension_id} host KC ${kcId}`);
    }
    for (const capstoneId of extension.host_capstone_ids) {
      assert(
        capstoneIndex.has(capstoneId),
        `${extension.extension_id} host capstone ${capstoneId}`,
      );
    }
    for (const holdId of extension.hold_ids ?? []) {
      assert(holdIndex.has(holdId), `${extension.extension_id} hold ${holdId}`);
    }
    for (const occurrenceId of extension.direct_source_occurrence_ids) {
      assert(
        sourceOccurrenceIndex.has(occurrenceId),
        `${extension.extension_id} occurrence ${occurrenceId}`,
      );
    }
    assert(
      extension.learner_validation_status === 'unvalidated',
      `${extension.extension_id} validation`,
    );
  }

  for (const capstone of capstones) {
    assert(adoptionIndex.has(capstone.adoption_decision_id), `${capstone.capstone_id} adoption`);
    assert(lessonIndex.has(capstone.owning_lesson_id), `${capstone.capstone_id} owner`);
    for (const kcId of capstone.component_kc_ids) {
      assert(kcIndex.has(kcId), `${capstone.capstone_id} component ${kcId}`);
    }
    for (const supportingCapstoneId of capstone.supporting_capstone_ids) {
      assert(
        capstoneIndex.has(supportingCapstoneId),
        `${capstone.capstone_id} support ${supportingCapstoneId}`,
      );
    }
    for (const holdId of capstone.hold_ids) {
      assert(holdIndex.has(holdId), `${capstone.capstone_id} hold ${holdId}`);
    }
    for (const occurrenceId of capstone.direct_source_occurrence_ids) {
      assert(
        sourceOccurrenceIndex.has(occurrenceId),
        `${capstone.capstone_id} occurrence ${occurrenceId}`,
      );
    }
    assert(
      capstone.learner_validation_status === 'unvalidated',
      `${capstone.capstone_id} validation`,
    );
  }

  for (const support of supports) {
    assert(adoptionIndex.has(support.adoption_decision_id), `${support.support_id} adoption`);
    assert(lessonIndex.has(support.host_lesson_id), `${support.support_id} host lesson`);
    for (const lessonId of support.secondary_display_host_ids) {
      assert(lessonIndex.has(lessonId), `${support.support_id} secondary host ${lessonId}`);
    }
    assert(support.not_a_standalone_lesson === true, `${support.support_id} standalone marker`);
    assert(support.learner_validation_status === 'unvalidated', `${support.support_id} validation`);
  }

  for (const mapping of sourceMappings) {
    if (mapping.target_id.startsWith('V3-')) {
      assert(
        kcIndex.has(mapping.target_id) ||
          lessonIndex.has(mapping.target_id) ||
          groupingIndex.has(mapping.target_id) ||
          generatedGroupingIndex.has(mapping.target_id) ||
          extensionIndex.has(mapping.target_id) ||
          capstoneIndex.has(mapping.target_id) ||
          supportIndex.has(mapping.target_id),
        `${mapping.mapping_id} target ${mapping.target_id}`,
      );
    }
    for (const occurrenceId of [
      ...mapping.source_occurrence_ids,
      ...mapping.direct_source_occurrence_ids,
    ]) {
      assert(
        sourceOccurrenceIndex.has(occurrenceId),
        `${mapping.mapping_id} occurrence ${occurrenceId}`,
      );
    }
  }

  const openHolds = holds.filter((hold) => hold.status.startsWith('OPEN'));
  const closedHolds = holds.filter((hold) => hold.status.startsWith('CLOSED'));
  assertCount(openHolds, EXPECTED.counts.openHolds, 'open holds');
  assertCount(closedHolds, EXPECTED.counts.closedHolds, 'closed holds');

  const graphNodeIndex = uniqueIndex(graph.nodes, 'id', 'graph node');
  assert(
    graphNodeIndex.size === EXPECTED.counts.kcs + EXPECTED.counts.capstones,
    'graph node cardinality',
  );
  for (const kcId of kcIndex.keys()) {
    assert(graphNodeIndex.has(kcId), `graph node for ${kcId}`);
  }
  for (const capstoneId of capstoneIndex.keys()) {
    assert(graphNodeIndex.has(capstoneId), `graph node for ${capstoneId}`);
  }
  for (const edge of graph.edges) {
    assert(graphNodeIndex.has(edge.source_id), `${edge.edge_id} source ${edge.source_id}`);
    assert(graphNodeIndex.has(edge.target_id), `${edge.edge_id} target ${edge.target_id}`);
    assert(
      graphNodeIndex.get(edge.source_id).type === edge.source_type,
      `${edge.edge_id} source type`,
    );
    assert(
      graphNodeIndex.get(edge.target_id).type === edge.target_type,
      `${edge.edge_id} target type`,
    );
    if (edge.repair_reentry?.repair_target_id) {
      assert(
        graphNodeIndex.has(edge.repair_reentry.repair_target_id),
        `${edge.edge_id} repair target`,
      );
    }
    if (edge.repair_reentry?.reentry_target_id) {
      assert(
        graphNodeIndex.has(edge.repair_reentry.reentry_target_id),
        `${edge.edge_id} reentry target`,
      );
    }
    assert(edge.review_status.includes('ACCEPTED_GRAPH_FREEZE'), `${edge.edge_id} review status`);
    assert(edge.learner_validation_status === 'unvalidated', `${edge.edge_id} validation status`);
  }

  const relationCollections = Object.entries(relations).filter(([, value]) => Array.isArray(value));
  const relationIndex = new Map();
  for (const [collection, records] of relationCollections) {
    records.forEach((record, position) => {
      assert(
        typeof record.relation_id === 'string',
        `${collection}[${position}] lacks relation_id`,
      );
      assert(!relationIndex.has(record.relation_id), `duplicate relation ID ${record.relation_id}`);
      relationIndex.set(record.relation_id, { collection, record });
    });
  }

  const knownV3Ids = new Map([
    ['KC', new Set(kcIndex.keys())],
    ['LES', new Set(lessonIndex.keys())],
    ['CL', new Set(groupingIndex.keys())],
    ['EXT', new Set(extensionIndex.keys())],
    ['CAP', new Set(capstoneIndex.keys())],
    ['SUP', new Set(supportIndex.keys())],
    ['EDG', new Set(edgeIndex.keys())],
    ['PHS', new Set(phaseIndex.keys())],
    ['MOD', new Set(moduleIndex.keys())],
    ['PTH', new Set(pathwayIndex.keys())],
    ['HOLD', new Set(holdIndex.keys())],
  ]);

  function validateSequenceValue(value, key, context) {
    if (Array.isArray(value)) {
      value.forEach((entry, position) =>
        validateSequenceValue(entry, key, `${context}[${position}]`),
      );
      return;
    }
    if (value !== null && typeof value === 'object') {
      for (const [childKey, childValue] of Object.entries(value)) {
        validateSequenceValue(childValue, childKey, `${context}.${childKey}`);
      }
      return;
    }
    if (typeof value !== 'string') {
      return;
    }
    const v3Match = /^V3-(KC|LES|CL|EXT|CAP|SUP|EDG|PHS|MOD|PTH|HOLD)-/.exec(value);
    if (v3Match) {
      assert(knownV3Ids.get(v3Match[1]).has(value), `${context} unresolved V3 ID ${value}`);
    }
    if (
      value.startsWith('R14-') &&
      (key === 'relation_id' || key.endsWith('_relation_id') || key.endsWith('_relation_ids'))
    ) {
      assert(relationIndex.has(value), `${context} unresolved sequence relation ${value}`);
    }
  }
  validateSequenceValue(
    relations,
    'normalized_sequence_relations',
    'normalized_sequence_relations',
  );

  const deliveryEvents = relations.module_delivery_event_relations;
  const firstDeliveries = deliveryEvents.filter(
    (relation) => relation.placement_kind === 'LESSON_FIRST_DELIVERY',
  );
  const capstonePlacements = deliveryEvents.filter(
    (relation) => relation.placement_kind === 'CAPSTONE_COORDINATION',
  );
  assertCount(firstDeliveries, EXPECTED.counts.firstDeliveryRelations, 'first-delivery relations');
  assertCount(
    capstonePlacements,
    EXPECTED.counts.requiredCapstonePlacements,
    'required capstone placements',
  );
  assertCount(
    relations.lesson_internal_order_relations,
    EXPECTED.counts.lessons,
    'lesson internal-order relations',
  );
  assertCount(
    relations.module_revisit_relations,
    EXPECTED.counts.revisitRelations,
    'revisit relations',
  );
  assert(
    relations.domain_remediation_relations.length + relations.cars_repair_relations.length ===
      EXPECTED.counts.exactRepairRelations,
    'exact repair/reentry relation count',
  );

  const firstDeliveryByLesson = new Map();
  for (const relation of firstDeliveries) {
    assert(
      !firstDeliveryByLesson.has(relation.target_lesson_id),
      `${relation.target_lesson_id} first delivery`,
    );
    firstDeliveryByLesson.set(relation.target_lesson_id, relation);
    assert(relation.first_delivery_once === true, `${relation.relation_id} first-delivery marker`);
  }
  assert(firstDeliveryByLesson.size === lessonIndex.size, 'one first delivery per lesson');

  const internalByLesson = new Map();
  for (const relation of relations.lesson_internal_order_relations) {
    assert(!internalByLesson.has(relation.lesson_id), `${relation.lesson_id} internal order`);
    internalByLesson.set(relation.lesson_id, relation);
    assertEqual(
      relation.ordered_nested_kc_ids,
      lessonIndex.get(relation.lesson_id).nested_kc_ids,
      `${relation.lesson_id} internal KC order`,
    );
  }
  assert(internalByLesson.size === lessonIndex.size, 'one internal-order relation per lesson');
  for (const [lessonId, relation] of firstDeliveryByLesson) {
    assert(phaseIndex.has(relation.phase_id), `${relation.relation_id} phase`);
    assert(moduleIndex.has(relation.module_id), `${relation.relation_id} module`);
    assert(
      relation.internal_order_relation_id === internalByLesson.get(lessonId).relation_id,
      `${relation.relation_id} internal-order reference`,
    );
  }

  const heldEntityIds = new Set(EXPECTED.heldNonrequiredEntityIds);
  const capstonePlacementById = new Map();
  for (const relation of capstonePlacements) {
    const capstone = capstoneIndex.get(relation.target_capstone_id);
    assert(capstone !== undefined, `${relation.relation_id} capstone`);
    assert(
      !heldEntityIds.has(capstone.capstone_id),
      `${relation.relation_id} cannot place a held capstone`,
    );
    assert(
      !capstonePlacementById.has(capstone.capstone_id),
      `${capstone.capstone_id} duplicate required placement`,
    );
    capstonePlacementById.set(capstone.capstone_id, relation);
    assert(
      relation.owning_lesson_id === capstone.owning_lesson_id,
      `${relation.relation_id} owning lesson`,
    );
    assertEqual(
      relation.component_kc_ids,
      capstone.component_kc_ids,
      `${relation.relation_id} components`,
    );
    assertEqual(
      relation.supporting_capstone_ids,
      capstone.supporting_capstone_ids,
      `${relation.relation_id} supporting capstones`,
    );
    assert(
      relation.placement_rule === capstone.placement_rule,
      `${relation.relation_id} placement rule`,
    );
    assert(
      capstone.placement_status === 'ACCEPTED_SEQUENCE_FREEZE_ROLE15_REQUIRED_PLACEMENT',
      `${capstone.capstone_id} placement status`,
    );
    assert(
      capstone.placement_freeze_id === EXPECTED.freezeIds.sequence,
      `${capstone.capstone_id} placement freeze`,
    );
    assert(relation.first_placement_once === true, `${relation.relation_id} placement-once marker`);
    assert(phaseIndex.has(relation.phase_id), `${relation.relation_id} phase`);
    assert(moduleIndex.has(relation.module_id), `${relation.relation_id} module`);
  }
  const nonheldCapstoneIds = capstones
    .filter((capstone) => !heldEntityIds.has(capstone.capstone_id))
    .map((capstone) => capstone.capstone_id)
    .sort();
  assertEqual(
    [...capstonePlacementById.keys()].sort(),
    nonheldCapstoneIds,
    'required capstone placement one-to-one coverage',
  );

  const revisitByLesson = new Map();
  for (const relation of relations.module_revisit_relations) {
    assert(!revisitByLesson.has(relation.target_lesson_id), `${relation.target_lesson_id} revisit`);
    revisitByLesson.set(relation.target_lesson_id, relation);
    assert(
      relation.first_delivery_relation_id ===
        firstDeliveryByLesson.get(relation.target_lesson_id).relation_id,
      `${relation.relation_id} first-delivery reference`,
    );
    assert(
      relation.plain_duplicate_delivery === false,
      `${relation.relation_id} duplicate revisit`,
    );
  }
  assert(revisitByLesson.size === lessonIndex.size, 'one upgraded revisit per lesson');

  const remediationProjectionByLesson = new Map(
    lessons.map((lesson) => [
      lesson.lesson_id,
      {
        domain_relation_ids: [],
        cars_relation_ids: [],
        policy: LESSON_REMEDIATION_POLICY,
      },
    ]),
  );
  for (const [collection, repairRelations, projectionField] of [
    ['domain remediation', relations.domain_remediation_relations, 'domain_relation_ids'],
    ['CARS repair', relations.cars_repair_relations, 'cars_relation_ids'],
  ]) {
    for (const relation of repairRelations) {
      const failedKc = kcIndex.get(relation.failed_target_id);
      const failedCapstone = capstoneIndex.get(relation.failed_target_id);
      assert(
        (failedKc === undefined) !== (failedCapstone === undefined),
        `${relation.relation_id} exact failed-target identity`,
      );
      const expectedFailedType = failedKc === undefined ? 'CAPSTONE' : 'KC';
      const expectedReentryType =
        failedKc === undefined ? 'CAPSTONE_COORDINATION_EVENT' : 'NESTED_KC_IN_LESSON';
      const owningLessonId = (failedKc ?? failedCapstone).owning_lesson_id;

      assert(
        relation.failed_target_type === expectedFailedType,
        `${relation.relation_id} failed target type`,
      );
      assert(
        relation.exact_reentry.target_type === expectedReentryType,
        `${relation.relation_id} exact reentry target type`,
      );
      assert(
        relation.failed_target_id === relation.exact_reentry.target_id,
        `${relation.relation_id} exact reentry target`,
      );
      assert(
        relation.exact_reentry.lesson_id === owningLessonId,
        `${relation.relation_id} exact reentry owning lesson`,
      );
      assert(
        lessonIndex.has(relation.exact_reentry.lesson_id),
        `${relation.relation_id} exact reentry lesson`,
      );
      assert(
        phaseIndex.has(relation.exact_reentry.phase_id),
        `${relation.relation_id} exact reentry phase`,
      );
      assert(
        moduleIndex.has(relation.exact_reentry.module_id),
        `${relation.relation_id} exact reentry module`,
      );
      assert(pathwayIndex.has(relation.pathway_id), `${relation.relation_id} pathway`);
      if (collection === 'domain remediation') {
        assert(
          pathwayIndex.get(relation.pathway_id).pathway_type === relation.pathway_type,
          `${relation.relation_id} pathway type`,
        );
      } else {
        assert(
          pathwayIndex.get(relation.pathway_id).pathway_type === 'CARS_PARALLEL',
          `${relation.relation_id} CARS pathway type`,
        );
      }

      if (failedKc !== undefined) {
        const firstDelivery = firstDeliveryByLesson.get(owningLessonId);
        const internalOrder = internalByLesson.get(owningLessonId);
        const nestedPosition = internalOrder.ordered_nested_kc_ids.indexOf(failedKc.kc_id);
        assert(nestedPosition >= 0, `${relation.relation_id} nested KC membership`);
        assert(
          relation.exact_reentry.first_delivery_relation_id === firstDelivery.relation_id,
          `${relation.relation_id} first-delivery relation`,
        );
        assert(
          relation.exact_reentry.phase_id === firstDelivery.phase_id &&
            relation.exact_reentry.module_id === firstDelivery.module_id &&
            relation.exact_reentry.module_event_order === firstDelivery.module_event_order,
          `${relation.relation_id} first-delivery coordinates`,
        );
        assert(
          relation.exact_reentry.nested_entity_order === nestedPosition + 1,
          `${relation.relation_id} nested KC position`,
        );
      } else {
        const placement = capstonePlacementById.get(failedCapstone.capstone_id);
        assert(placement !== undefined, `${relation.relation_id} required capstone placement`);
        assert(
          relation.exact_reentry.capstone_placement_relation_id === placement.relation_id,
          `${relation.relation_id} capstone placement relation`,
        );
        assert(
          relation.exact_reentry.phase_id === placement.phase_id &&
            relation.exact_reentry.module_id === placement.module_id &&
            relation.exact_reentry.module_event_order === placement.module_event_order,
          `${relation.relation_id} capstone placement coordinates`,
        );
      }

      remediationProjectionByLesson.get(owningLessonId)[projectionField].push(relation.relation_id);
    }
  }
  for (const lesson of lessons) {
    assert(
      lesson.remediation_handling.policy === LESSON_REMEDIATION_POLICY,
      `${lesson.lesson_id} remediation policy projection`,
    );
    assertEqual(
      lesson.remediation_handling.domain_relation_ids,
      remediationProjectionByLesson.get(lesson.lesson_id).domain_relation_ids,
      `${lesson.lesson_id} domain remediation projection`,
    );
    assertEqual(
      lesson.remediation_handling.cars_relation_ids,
      remediationProjectionByLesson.get(lesson.lesson_id).cars_relation_ids,
      `${lesson.lesson_id} CARS remediation projection`,
    );
  }

  assertCount(relations.accelerated_candidate_relations, 35, 'accelerated candidate relations');
  const acceleratedRelationIdsByLesson = new Map(lessons.map((lesson) => [lesson.lesson_id, []]));
  for (const relation of relations.accelerated_candidate_relations) {
    assert(
      relation.currently_authorized_bypass ===
        frozenSchema.accelerated_policy.currently_authorized_bypass,
      `${relation.relation_id} bypass`,
    );
    assert(
      relation.fail_closed === frozenSchema.accelerated_policy.fail_closed,
      `${relation.relation_id} fail closed`,
    );
    assert(relation.scope_retained === true, `${relation.relation_id} scope retained`);
    assert(moduleIndex.has(relation.v3_module_id), `${relation.relation_id} module`);
    const candidateLessonIds = new Set(relation.candidate_target_lesson_ids);
    for (const lessonId of candidateLessonIds) {
      assert(lessonIndex.has(lessonId), `${relation.relation_id} candidate lesson ${lessonId}`);
      acceleratedRelationIdsByLesson.get(lessonId).push(relation.relation_id);
    }
    for (const targetId of relation.candidate_target_ids) {
      const target = kcIndex.get(targetId) ?? capstoneIndex.get(targetId);
      assert(target !== undefined, `${relation.relation_id} accelerated target ${targetId}`);
      assert(
        candidateLessonIds.has(target.owning_lesson_id),
        `${relation.relation_id} accelerated target owner`,
      );
    }
  }
  const acceleratedProjectionByLesson = new Map();
  for (const lesson of lessons) {
    const candidateRelationIds = acceleratedRelationIdsByLesson.get(lesson.lesson_id);
    assert(candidateRelationIds.length > 0, `${lesson.lesson_id} accelerated relation coverage`);
    assert(
      lesson.accelerated_handling.currently_authorized_bypass ===
        frozenSchema.accelerated_policy.currently_authorized_bypass,
      `${lesson.lesson_id} accelerated bypass projection`,
    );
    assert(
      lesson.accelerated_handling.fail_closed === frozenSchema.accelerated_policy.fail_closed,
      `${lesson.lesson_id} accelerated fail-closed projection`,
    );
    assert(
      lesson.accelerated_handling.policy === LESSON_ACCELERATED_POLICY,
      `${lesson.lesson_id} accelerated policy projection`,
    );
    acceleratedProjectionByLesson.set(lesson.lesson_id, {
      currently_authorized_bypass: frozenSchema.accelerated_policy.currently_authorized_bypass,
      fail_closed: frozenSchema.accelerated_policy.fail_closed,
      future_activation_requires_calibrated_assessment:
        frozenSchema.accelerated_policy.future_activation_requires_calibrated_assessment,
      policy: LESSON_ACCELERATED_POLICY,
      candidate_relation_ids: candidateRelationIds,
    });
  }

  assertCount(relations.held_nonrequired_relations, 2, 'held nonrequired relations');
  assertEqual(
    relations.held_nonrequired_relations.map((relation) => relation.entity_id).sort(),
    [...EXPECTED.heldNonrequiredEntityIds].sort(),
    'held nonrequired entity IDs',
  );
  for (const relation of relations.held_nonrequired_relations) {
    assert(relation.required_delivery === false, `${relation.entity_id} required delivery`);
    assert(relation.active_sequence_target === false, `${relation.entity_id} active sequence`);
    assert(holdIndex.has(relation.hold_id), `${relation.entity_id} hold`);
  }
  const heldRelationByEntity = uniqueIndex(
    relations.held_nonrequired_relations,
    'entity_id',
    'held nonrequired relation',
  );

  const attachmentDeliveryById = new Map();
  const extensionPlacementViews = sequence.generated_views.extension_placement_views;
  assertCount(extensionPlacementViews, EXPECTED.counts.extensions, 'extension placement views');
  const extensionPlacementViewById = uniqueIndex(
    extensionPlacementViews,
    'extension_id',
    'extension placement view',
  );
  const activeExtensionStatuses = new Set(['IN_SCOPE_AT_HOST', 'CONTEXT_METADATA_AT_HOST']);
  for (const extension of extensions) {
    const view = extensionPlacementViewById.get(extension.extension_id);
    assert(view !== undefined, `${extension.extension_id} placement view`);
    projectSourceRecord(view, 'extensionPlacement', `${extension.extension_id} placement view`);
    assert(
      view.owning_lesson_id === extension.owning_lesson_id,
      `${extension.extension_id} placement owner`,
    );
    assert(view.does_not_create_lesson === true, `${extension.extension_id} lesson identity`);
    assert(
      view.generated_view === true && view.not_independent_truth === true,
      `${extension.extension_id} generated placement semantics`,
    );
    const heldRelation = heldRelationByEntity.get(extension.extension_id);
    if (heldRelation !== undefined) {
      assert(
        view.delivery_status === 'HELD_NONREQUIRED_NO_REQUIRED_PLACEMENT',
        `${extension.extension_id} held delivery status`,
      );
      assert(view.required_delivery === false, `${extension.extension_id} required delivery`);
      assert(
        view.host_first_delivery_relation_id === null &&
          view.phase_id === null &&
          view.module_id === null,
        `${extension.extension_id} held placement coordinates`,
      );
      assertEqual(
        view.source_relation_ids,
        [heldRelation.relation_id],
        `${extension.extension_id} held source relation`,
      );
      attachmentDeliveryById.set(extension.extension_id, {
        state: DELIVERY_STATES.GOVERNANCE_ONLY,
        source_status: view.delivery_status,
        source_relation_ids: [...view.source_relation_ids],
        hold_id: heldRelation.hold_id,
      });
    } else {
      assert(
        activeExtensionStatuses.has(view.delivery_status),
        `${extension.extension_id} active delivery status`,
      );
      const firstDelivery = firstDeliveryByLesson.get(extension.owning_lesson_id);
      assert(
        view.host_first_delivery_relation_id === firstDelivery.relation_id,
        `${extension.extension_id} host first delivery`,
      );
      assert(
        view.phase_id === firstDelivery.phase_id && view.module_id === firstDelivery.module_id,
        `${extension.extension_id} host coordinates`,
      );
      assert(
        view.source_relation_ids.includes(firstDelivery.relation_id),
        `${extension.extension_id} source relation`,
      );
      attachmentDeliveryById.set(extension.extension_id, {
        state: DELIVERY_STATES.HOST_ONLY,
        source_status: view.delivery_status,
        host_first_delivery_relation_id: view.host_first_delivery_relation_id,
        phase_id: view.phase_id,
        module_id: view.module_id,
        source_relation_ids: [...view.source_relation_ids],
      });
    }
  }

  const supportPlacementViews = sequence.generated_views.support_placement_views;
  assertCount(supportPlacementViews, EXPECTED.counts.supports, 'support placement views');
  const supportPlacementViewById = uniqueIndex(
    supportPlacementViews,
    'support_id',
    'support placement view',
  );
  for (const support of supports) {
    const view = supportPlacementViewById.get(support.support_id);
    assert(view !== undefined, `${support.support_id} placement view`);
    projectSourceRecord(view, 'supportPlacement', `${support.support_id} placement view`);
    assert(view.host_lesson_id === support.host_lesson_id, `${support.support_id} host`);
    assert(
      view.not_a_standalone_lesson === true &&
        view.generated_view === true &&
        view.not_independent_truth === true,
      `${support.support_id} host-only semantics`,
    );
    const firstDelivery = firstDeliveryByLesson.get(support.host_lesson_id);
    assert(
      view.host_first_delivery_relation_id === firstDelivery.relation_id,
      `${support.support_id} host first delivery`,
    );
    assert(
      view.source_relation_ids.includes(firstDelivery.relation_id),
      `${support.support_id} source relation`,
    );
    attachmentDeliveryById.set(support.support_id, {
      state: DELIVERY_STATES.HOST_ONLY,
      host_first_delivery_relation_id: view.host_first_delivery_relation_id,
      source_relation_ids: [...view.source_relation_ids],
    });
  }

  for (const capstone of capstones) {
    const heldRelation = heldRelationByEntity.get(capstone.capstone_id);
    if (heldRelation !== undefined) {
      assert(capstone.required_delivery === false, `${capstone.capstone_id} required delivery`);
      assert(
        capstone.placement_status === 'HELD_NONREQUIRED_OUTSIDE_ACCEPTED_SEQUENCE',
        `${capstone.capstone_id} held placement status`,
      );
      assert(
        !capstonePlacementById.has(capstone.capstone_id),
        `${capstone.capstone_id} held placement exclusion`,
      );
      attachmentDeliveryById.set(capstone.capstone_id, {
        state: DELIVERY_STATES.GOVERNANCE_ONLY,
        source_status: capstone.placement_status,
        source_relation_ids: [heldRelation.relation_id],
        hold_id: heldRelation.hold_id,
      });
    } else {
      const placement = capstonePlacementById.get(capstone.capstone_id);
      assert(placement !== undefined, `${capstone.capstone_id} required placement`);
      attachmentDeliveryById.set(capstone.capstone_id, {
        state: DELIVERY_STATES.REQUIRED,
        source_status: capstone.placement_status,
        placement_relation_id: placement.relation_id,
        phase_id: placement.phase_id,
        module_id: placement.module_id,
        module_event_order: placement.module_event_order,
        source_relation_ids: [placement.relation_id],
      });
    }
  }

  assert(
    attachmentDeliveryById.size === extensions.length + capstones.length + supports.length,
    'attachment delivery-state coverage',
  );
  const deliveryCountsByType = {
    extensions: {},
    capstones: {},
    supports: {},
    total: Object.fromEntries(Object.values(DELIVERY_STATES).map((state) => [state, 0])),
  };
  for (const [records, type] of [
    [extensions, 'extensions'],
    [capstones, 'capstones'],
    [supports, 'supports'],
  ]) {
    for (const record of records) {
      const id = record.extension_id ?? record.capstone_id ?? record.support_id;
      const state = attachmentDeliveryById.get(id)?.state;
      assert(Object.values(DELIVERY_STATES).includes(state), `${id} delivery state`);
      deliveryCountsByType[type][state] = (deliveryCountsByType[type][state] ?? 0) + 1;
      deliveryCountsByType.total[state] += 1;
    }
  }
  assertEqual(
    deliveryCountsByType.extensions,
    EXPECTED.attachmentDeliveryCounts.extensions,
    'extension delivery-state counts',
  );
  assertEqual(
    deliveryCountsByType.capstones,
    EXPECTED.attachmentDeliveryCounts.capstones,
    'capstone delivery-state counts',
  );
  assertEqual(
    deliveryCountsByType.supports,
    EXPECTED.attachmentDeliveryCounts.supports,
    'support delivery-state counts',
  );
  assertEqual(
    deliveryCountsByType.total,
    EXPECTED.attachmentDeliveryCounts.total,
    'total delivery-state counts',
  );

  return {
    indexes: {
      adoptionIndex,
      capstoneIndex,
      edgeIndex,
      extensionIndex,
      generatedGroupingIndex,
      groupingIndex,
      holdIndex,
      kcIndex,
      lessonIndex,
      moduleIndex,
      pathwayIndex,
      phaseIndex,
      relationIndex,
      sourceOccurrenceIndex,
      supportIndex,
    },
    acceleratedProjectionByLesson,
    attachmentDeliveryById,
    deliveryCountsByType,
    firstDeliveryByLesson,
    capstonePlacementById,
    internalByLesson,
    remediationProjectionByLesson,
    relationCollections,
  };
}

function makeCompactSourceOccurrence(occurrence) {
  return projectSourceRecord(
    occurrence,
    'sourceOccurrence',
    `source occurrence ${occurrence.source_occurrence_id}`,
  );
}

function makeCompactAdoptionDecision(decision) {
  return projectSourceRecord(
    decision,
    'adoptionDecision',
    `adoption decision ${decision.decision_id}`,
  );
}

function makeAuthoringEdge(edge) {
  const compactProvenance = edge.provenance
    ? projectSourceRecord(edge.provenance, 'edgeProvenance', `${edge.edge_id} provenance`)
    : undefined;
  const authoringEdge = projectSourceRecord(edge, 'edge', `edge ${edge.edge_id}`);
  if (compactProvenance !== undefined) {
    authoringEdge.provenance_lineage = compactProvenance;
  }
  return authoringEdge;
}

function formatPageRanges(pages) {
  const ranges = [];
  for (const page of pages) {
    const previous = ranges.at(-1);
    if (previous !== undefined && page === previous.end + 1) {
      previous.end = page;
    } else {
      ranges.push({ start: page, end: page });
    }
  }
  return ranges
    .map((range) => (range.start === range.end ? `${range.start}` : `${range.start}–${range.end}`))
    .join(', ');
}

function isSafeAnchorLabelCandidate(value) {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value === value.trim() &&
    value.length <= SOURCE_ANCHOR_LABEL_MAX_LENGTH &&
    !/[\r\n]/u.test(value) &&
    !containsAbsoluteMachinePath(value) &&
    !/^https?:\/\//iu.test(value)
  );
}

function chooseSourceAnchorLabel(anchor) {
  const directAnchorHeadings = [...anchor.directAnchorHeadings].sort();
  assert(
    directAnchorHeadings.length <= 1,
    `${anchor.sourceAnchorId} has multiple direct AAMC source-anchor headings`,
  );
  if (directAnchorHeadings.length === 1) {
    return {
      label: directAnchorHeadings[0],
      labelSource: 'direct_aamc_source_anchor_heading',
    };
  }

  const officialTopics = [...anchor.officialTopics].sort();
  if (officialTopics.length === 1) {
    return { label: officialTopics[0], labelSource: 'single_official_topic' };
  }
  if (officialTopics.length > 1) {
    const inclusiveLabel = officialTopics.join('; ');
    if (isSafeAnchorLabelCandidate(inclusiveLabel)) {
      return {
        label: inclusiveLabel,
        labelSource: 'inclusive_official_topics',
      };
    }
  }

  const pages = [...anchor.printedPages].sort((left, right) => left - right);
  if (pages.length > 0) {
    const pagePrefix = pages.length === 1 ? 'Page' : 'Pages';
    return {
      label: `${pagePrefix} ${formatPageRanges(pages)} — ${anchor.sourceAnchorId}`,
      labelSource: 'printed_pages_and_anchor_id',
    };
  }

  return {
    label: `Source anchor ${anchor.sourceAnchorId}`,
    labelSource: 'anchor_id',
  };
}

function buildSourceAnchorReferences(sourceOccurrences) {
  const anchors = new Map();
  for (const occurrence of sourceOccurrences) {
    assert(
      occurrence.official_topic === undefined ||
        occurrence.official_topic === null ||
        typeof occurrence.official_topic === 'string',
      `${occurrence.source_occurrence_id} official topic type`,
    );
    assert(
      Array.isArray(occurrence.official_path),
      `${occurrence.source_occurrence_id} official path must be an array`,
    );
    for (const [position, component] of occurrence.official_path.entries()) {
      assert(
        typeof component === 'string',
        `${occurrence.source_occurrence_id} official path component ${position}`,
      );
    }
    assert(
      Array.isArray(occurrence.printed_pages),
      `${occurrence.source_occurrence_id} printed pages must be an array`,
    );

    const anchorIds = new Set([
      ...(occurrence.source_anchor_ids ?? []),
      ...(occurrence.source_anchor_id ? [occurrence.source_anchor_id] : []),
    ]);
    for (const anchorId of anchorIds) {
      const anchor = anchors.get(anchorId) ?? {
        sourceAnchorId: anchorId,
        officialTopics: new Set(),
        directAnchorHeadings: new Set(),
        sections: new Set(),
        sourceOccurrenceIds: new Set(),
        sourceTopicIds: new Set(),
        printedPages: new Set(),
      };
      const officialTopic = occurrence.official_topic?.trim();
      if (officialTopic && occurrence.occurrence_kind === 'AAMC_TEACHABLE_TOPIC') {
        assert(
          isSafeAnchorLabelCandidate(officialTopic),
          `${anchorId} official topic is not a safe anchor label`,
        );
        anchor.officialTopics.add(officialTopic);
      }
      if (occurrence.occurrence_kind === 'AAMC_SOURCE_ANCHOR') {
        const directAnchorHeading = [...occurrence.official_path]
          .reverse()
          .find((component) => component.trim().length > 0)
          ?.trim();
        if (directAnchorHeading) {
          assert(
            isSafeAnchorLabelCandidate(directAnchorHeading),
            `${anchorId} direct AAMC source-anchor heading is unsafe`,
          );
          anchor.directAnchorHeadings.add(directAnchorHeading);
        }
      }
      if (typeof occurrence.section === 'string' && occurrence.section.length > 0) {
        anchor.sections.add(occurrence.section);
      }
      anchor.sourceOccurrenceIds.add(occurrence.source_occurrence_id);
      if (occurrence.source_topic_id) {
        anchor.sourceTopicIds.add(occurrence.source_topic_id);
      }
      for (const page of occurrence.printed_pages) {
        assert(
          Number.isInteger(page) && page > 0,
          `${occurrence.source_occurrence_id} printed page ${String(page)}`,
        );
        anchor.printedPages.add(page);
      }
      anchors.set(anchorId, anchor);
    }
  }
  const references = [...anchors.values()]
    .sort((left, right) => left.sourceAnchorId.localeCompare(right.sourceAnchorId))
    .map((anchor) => {
      const { label, labelSource } = chooseSourceAnchorLabel(anchor);
      assert(
        isSafeAnchorLabelCandidate(label),
        `${anchor.sourceAnchorId} lacks a safe human-readable label`,
      );
      return {
        source_anchor_id: anchor.sourceAnchorId,
        label,
        label_source: labelSource,
        associated_topic_count: anchor.officialTopics.size,
        sections: [...anchor.sections].sort(),
        source_occurrence_ids: [...anchor.sourceOccurrenceIds].sort(),
        source_topic_ids: [...anchor.sourceTopicIds].sort(),
        printed_pages: [...anchor.printedPages].sort((left, right) => left - right),
      };
    });
  assert(
    references.every((anchor) => typeof anchor.label === 'string' && anchor.label.length > 0),
    'every source anchor must have a label',
  );
  return references;
}

function buildManifest(sources, contractHash, validationState) {
  const registry = sources.registry.data;
  const completion = sources.completion.data;
  const frozenSchema = sources.frozenSchema.data;
  const kcs = sources.kcs.data.kcs;
  const lessons = sources.lessons.data.lessons;
  const groupings = sources.groupings.data.groupings;
  const { extensions, capstones, support_artifacts: supports } = sources.attachments.data;
  const sourceOccurrences = sources.sourceCrosswalk.data.source_occurrences;
  const adoptionDecisions = sources.adoption.data.adoption_decisions;
  const governanceDecisions = sources.adoption.data.governance_decisions;
  const graph = sources.graph.data;
  const sequence = sources.sequence.data;
  const relations = sequence.normalized_sequence_relations;
  const generatedGroupingViews = registry.generated_grouping_views;

  const registryKcIndex = uniqueIndex(registry.kcs, 'kc_id', 'registry KC');
  const normalizedKcs = kcs.map((kc) => {
    const registryKc = registryKcIndex.get(kc.kc_id);
    const projected = projectSourceRecord(kc, 'kc', `KC ${kc.kc_id}`);
    projected.canonical_source_kc_ids = projectNestedValue(
      registryKc.canonical_source_kc_ids,
      `${kc.kc_id}.canonical_source_kc_ids`,
    );
    projected.direct_source_occurrence_ids = projectNestedValue(
      registryKc.direct_source_occurrence_ids,
      `${kc.kc_id}.direct_source_occurrence_ids`,
    );
    return projected;
  });

  const capstonePlacementByLesson = new Map();
  for (const relation of validationState.capstonePlacementById.values()) {
    pushMapList(capstonePlacementByLesson, relation.owning_lesson_id, relation.relation_id);
  }
  const revisitsByLesson = new Map();
  for (const relation of relations.module_revisit_relations) {
    pushMapList(revisitsByLesson, relation.target_lesson_id, relation.relation_id);
  }
  const heldByLesson = new Map();
  for (const relation of relations.held_nonrequired_relations) {
    const entity =
      validationState.indexes.extensionIndex.get(relation.entity_id) ??
      validationState.indexes.capstoneIndex.get(relation.entity_id);
    pushMapList(heldByLesson, entity.owning_lesson_id, relation.relation_id);
  }

  const normalizedLessons = lessons.map((lesson) => {
    const projected = projectSourceRecord(lesson, 'lesson', `lesson ${lesson.lesson_id}`);
    const remediation = validationState.remediationProjectionByLesson.get(lesson.lesson_id);
    const accelerated = validationState.acceleratedProjectionByLesson.get(lesson.lesson_id);
    projected.learner_validation_status = sources.lessons.data.metadata.learner_validation_status;
    projected.remediation_handling = {
      domain_relation_ids: [...remediation.domain_relation_ids],
      cars_relation_ids: [...remediation.cars_relation_ids],
      policy: remediation.policy,
    };
    projected.accelerated_handling = {
      currently_authorized_bypass: accelerated.currently_authorized_bypass,
      fail_closed: accelerated.fail_closed,
      future_activation_requires_calibrated_assessment:
        accelerated.future_activation_requires_calibrated_assessment,
      policy: accelerated.policy,
      candidate_relation_ids: [...accelerated.candidate_relation_ids],
    };
    projected.sequence_relation_refs = {
      first_delivery: validationState.firstDeliveryByLesson.get(lesson.lesson_id).relation_id,
      internal_order: validationState.internalByLesson.get(lesson.lesson_id).relation_id,
      capstone_placements: capstonePlacementByLesson.get(lesson.lesson_id) ?? [],
      revisits: revisitsByLesson.get(lesson.lesson_id) ?? [],
      remediation_and_reentry: [
        ...remediation.domain_relation_ids,
        ...remediation.cars_relation_ids,
      ],
      held_nonrequired: heldByLesson.get(lesson.lesson_id) ?? [],
    };
    return projected;
  });

  const normalizedGroupings = groupings.map((grouping) =>
    projectSourceRecord(grouping, 'grouping', `grouping ${grouping.grouping_id}`),
  );
  const normalizedGeneratedGroupingViews = generatedGroupingViews.map((grouping) =>
    projectSourceRecord(
      grouping,
      'generatedGrouping',
      `generated grouping ${grouping.grouping_id}`,
    ),
  );
  const normalizedExtensions = extensions.map((extension) => {
    const projected = projectSourceRecord(
      extension,
      'extension',
      `extension ${extension.extension_id}`,
    );
    const delivery = validationState.attachmentDeliveryById.get(extension.extension_id);
    projected.delivery_state = delivery.state;
    projected.delivery_evidence = projectNestedValue(
      delivery,
      `${extension.extension_id}.delivery_evidence`,
    );
    delete projected.delivery_evidence.state;
    return projected;
  });
  const normalizedCapstones = capstones.map((capstone) => {
    const projected = projectSourceRecord(capstone, 'capstone', `capstone ${capstone.capstone_id}`);
    const delivery = validationState.attachmentDeliveryById.get(capstone.capstone_id);
    projected.delivery_state = delivery.state;
    projected.delivery_evidence = projectNestedValue(
      delivery,
      `${capstone.capstone_id}.delivery_evidence`,
    );
    delete projected.delivery_evidence.state;
    return projected;
  });
  const normalizedSupports = supports.map((support) => {
    const projected = projectSourceRecord(support, 'support', `support ${support.support_id}`);
    const delivery = validationState.attachmentDeliveryById.get(support.support_id);
    projected.delivery_state = delivery.state;
    projected.delivery_evidence = projectNestedValue(
      delivery,
      `${support.support_id}.delivery_evidence`,
    );
    delete projected.delivery_evidence.state;
    return projected;
  });

  const referencedAdoptionIds = new Set();
  for (const kc of normalizedKcs) {
    referencedAdoptionIds.add(kc.adoption_decision_id);
  }
  for (const grouping of normalizedGroupings) {
    grouping.adoption_decision_ids.forEach((id) => referencedAdoptionIds.add(id));
  }
  for (const grouping of normalizedGeneratedGroupingViews) {
    grouping.adoption_decision_ids.forEach((id) => referencedAdoptionIds.add(id));
  }
  for (const artifact of [...normalizedExtensions, ...normalizedCapstones, ...normalizedSupports]) {
    referencedAdoptionIds.add(artifact.adoption_decision_id);
    for (const id of artifact.merged_source_decision_ids ?? []) {
      referencedAdoptionIds.add(id);
    }
  }
  const compactAdoptionDecisions = adoptionDecisions
    .filter((decision) => referencedAdoptionIds.has(decision.decision_id))
    .map(makeCompactAdoptionDecision);
  assert(
    compactAdoptionDecisions.length === referencedAdoptionIds.size,
    'referenced compact adoption decision coverage',
  );

  const compactSourceOccurrences = sourceOccurrences.map(makeCompactSourceOccurrence);
  const sourceAnchorReferences = buildSourceAnchorReferences(sourceOccurrences);
  assertCount(sourceAnchorReferences, EXPECTED.counts.sourceAnchors, 'source anchors');
  uniqueIndex(sourceAnchorReferences, 'source_anchor_id', 'source anchor');
  const sourceAnchorLabelCounts = Object.fromEntries(
    Object.keys(EXPECTED.sourceAnchorLabelCounts).map((source) => [source, 0]),
  );
  for (const anchor of sourceAnchorReferences) {
    assert(
      Object.hasOwn(sourceAnchorLabelCounts, anchor.label_source),
      `${anchor.source_anchor_id} unknown label source ${anchor.label_source}`,
    );
    assert(
      isSafeAnchorLabelCandidate(anchor.label),
      `${anchor.source_anchor_id} invalid emitted label`,
    );
    sourceAnchorLabelCounts[anchor.label_source] += 1;
  }
  assertEqual(
    sourceAnchorLabelCounts,
    EXPECTED.sourceAnchorLabelCounts,
    'source anchor label-source counts',
  );
  const multiTopicSourceAnchors = sourceAnchorReferences.filter(
    (anchor) => anchor.associated_topic_count > 1,
  );
  assertCount(
    multiTopicSourceAnchors,
    EXPECTED.counts.multiTopicSourceAnchors,
    'multi-topic source anchors',
  );
  for (const anchor of multiTopicSourceAnchors) {
    assert(
      anchor.label_source === 'direct_aamc_source_anchor_heading',
      `${anchor.source_anchor_id} multi-topic breadth must use its direct anchor heading`,
    );
  }
  const sourceAnchorRegression = sourceAnchorReferences.find(
    (anchor) => anchor.source_anchor_id === EXPECTED.sourceAnchorRegression.sourceAnchorId,
  );
  assert(sourceAnchorRegression !== undefined, 'BB-SA-0017 source-anchor regression record');
  assertEqual(
    {
      label: sourceAnchorRegression.label,
      labelSource: sourceAnchorRegression.label_source,
      associatedTopicCount: sourceAnchorRegression.associated_topic_count,
    },
    {
      label: EXPECTED.sourceAnchorRegression.label,
      labelSource: EXPECTED.sourceAnchorRegression.labelSource,
      associatedTopicCount: EXPECTED.sourceAnchorRegression.associatedTopicCount,
    },
    'BB-SA-0017 breadth-preserving label regression',
  );
  const authoringEdges = graph.edges.map(makeAuthoringEdge);
  const normalizedHolds = registry.holds.map((hold) =>
    projectSourceRecord(hold, 'hold', `hold ${hold.hold_id}`),
  );
  const normalizedGovernanceDecisions = governanceDecisions.map((decision) =>
    projectSourceRecord(
      decision,
      'governanceDecision',
      `governance decision ${decision.decision_id}`,
    ),
  );
  const openHolds = normalizedHolds.filter((hold) => hold.status.startsWith('OPEN'));
  const closedHolds = normalizedHolds.filter((hold) => hold.status.startsWith('CLOSED'));
  const normalizedPhases = sequence.phases.map((phase) =>
    projectSourceRecord(phase, 'phase', `phase ${phase.phase_id}`),
  );
  const normalizedModules = sequence.modules.map((module) =>
    projectSourceRecord(module, 'module', `module ${module.module_id}`),
  );
  const normalizedPathways = sequence.pathways.map((pathway) =>
    projectSourceRecord(pathway, 'pathway', `pathway ${pathway.pathway_id}`),
  );
  const normalizedRelations = projectRelationCollections(relations);
  const graphPolicy = projectSourceRecord(graph.graph_policy, 'graphPolicy', 'graph policy');
  const sequencePolicy = projectSourceRecord(
    sequence.sequence_policy,
    'sequencePolicy',
    'sequence policy',
  );
  const authorityBoundary = projectSourceRecord(
    registry.authority_boundary,
    'authorityBoundary',
    'authority boundary',
  );
  const expectedEdgeTypes = Object.keys(frozenSchema.edge_types);
  assertEqual(Object.keys(graph.edge_codebook), expectedEdgeTypes, 'edge codebook type allowlist');
  const edgeCodebook = Object.fromEntries(
    expectedEdgeTypes.map((edgeType) => [
      edgeType,
      projectSourceRecord(
        graph.edge_codebook[edgeType],
        'edgeCodebookEntry',
        `edge codebook ${edgeType}`,
      ),
    ]),
  );

  const relationLookup = {};
  for (const [collection, records] of Object.entries(normalizedRelations).filter(([, value]) =>
    Array.isArray(value),
  )) {
    records.forEach((record, position) => {
      relationLookup[record.relation_id] = { collection, index: position };
    });
  }

  const attachmentLookup = {};
  normalizedExtensions.forEach((record, index) => {
    attachmentLookup[record.extension_id] = { collection: 'extensions', index };
  });
  normalizedCapstones.forEach((record, index) => {
    attachmentLookup[record.capstone_id] = { collection: 'capstones', index };
  });
  normalizedSupports.forEach((record, index) => {
    attachmentLookup[record.support_id] = { collection: 'support_artifacts', index };
  });

  const sourceFiles = [
    {
      path: CONTRACT_PATH,
      role: 'canonical_runtime_and_authoring_contract',
      schema_version: 'design-specification-0.2',
      sha256: contractHash,
    },
    ...SOURCE_FILE_DEFINITIONS.map((definition) => ({
      path: `curriculum-architecture-v3/${definition.path}`,
      role: definition.role,
      schema_version: definition.schemaVersion,
      sha256: sources[definition.key].actualSha256,
    })),
  ];

  const relationCounts = Object.fromEntries(
    Object.entries(normalizedRelations)
      .filter(([, value]) => Array.isArray(value))
      .map(([collection, records]) => [collection, records.length]),
  );

  return {
    schema_version: 'mcat-v3-lesson-authoring-manifest-2',
    metadata: {
      purpose: 'architecture_metadata_only',
      generated_by: GENERATOR_PATH,
      deterministic: true,
      canonical_contract: {
        path: CONTRACT_PATH,
        version: '0.2',
        sha256: contractHash,
      },
      registry: {
        artifact_id: registry.artifact_id,
        schema_version: registry.schema_version,
        sha256: sources.registry.actualSha256,
        freeze_ids: EXPECTED.freezeIds,
        phase1_gate_id: registry.phase1_gate_id,
      },
      package_completion: {
        schema_version: completion.schema_version,
        status: completion.status,
        reason: completion.reason,
        blockers: [...completion.blockers],
        validation: {
          checks: completion.validation.checks,
          passed: completion.validation.passed,
          failed: completion.validation.failed,
          sha256: completion.validation.sha256,
        },
        protected_inputs_unchanged: completion.protected_input_verification.unchanged,
        learner_validation_status: completion.learner_validation_status,
      },
      authority_boundary: authorityBoundary,
      counts: {
        lessons: normalizedLessons.length,
        kcs: normalizedKcs.length,
        groupings: normalizedGroupings.length,
        generated_noncanonical_grouping_views: normalizedGeneratedGroupingViews.length,
        extensions: normalizedExtensions.length,
        capstones: normalizedCapstones.length,
        supports: normalizedSupports.length,
        attachment_delivery_states: validationState.deliveryCountsByType,
        source_occurrences: sourceOccurrences.length,
        source_anchors: sourceAnchorReferences.length,
        multi_topic_source_anchors: multiTopicSourceAnchors.length,
        source_anchor_label_sources: sourceAnchorLabelCounts,
        source_mappings_validated_not_embedded: sources.sourceCrosswalk.data.mappings.length,
        adoption_decisions_validated: adoptionDecisions.length,
        referenced_adoption_decisions_embedded: compactAdoptionDecisions.length,
        governance_decisions: normalizedGovernanceDecisions.length,
        holds: normalizedHolds.length,
        open_holds: openHolds.length,
        closed_holds: closedHolds.length,
        edges: authoringEdges.length,
        hard_edges: authoringEdges.filter((edge) => edge.edge_type === 'HARD_PREREQUISITE').length,
        phases: normalizedPhases.length,
        modules: normalizedModules.length,
        pathways: normalizedPathways.length,
        normalized_sequence_relations: relationCounts,
      },
      attachment_delivery_state_enum: Object.values(DELIVERY_STATES),
      held_nonrequired_entity_ids: EXPECTED.heldNonrequiredEntityIds,
      source_projection_policy: sourceProjectionMetadata(),
      stale_source_stage_values: {
        status: 'omitted',
        reason:
          'Final package completion state above supersedes pre-completion source_stage_* and publication workflow labels.',
      },
      exclusions: [
        'protected questions and answer keys',
        'source exact text and textbook prose',
        'finished lesson prose, worked examples, activities, and assessment items',
        'rubrics, calibrated mastery thresholds, and efficacy claims',
        'atomic source-mapping payloads; counts and stable references are validated instead',
        'stale author-machine paths and historical workflow-only provenance paths',
        'pre-completion source_stage_* and publication workflow labels; final completion state is exported instead',
      ],
      source_files: sourceFiles,
    },
    curriculum: {
      lessons: normalizedLessons,
      kcs: normalizedKcs,
      groupings: normalizedGroupings,
      generated_noncanonical_grouping_views: normalizedGeneratedGroupingViews,
      extensions: normalizedExtensions,
      capstones: normalizedCapstones,
      support_artifacts: normalizedSupports,
    },
    graph: {
      policy: graphPolicy,
      edge_codebook: edgeCodebook,
      edges: authoringEdges,
    },
    sequence: {
      policy: sequencePolicy,
      phases: normalizedPhases,
      modules: normalizedModules,
      pathways: normalizedPathways,
      normalized_relations: normalizedRelations,
    },
    governance: {
      holds: normalizedHolds,
      open_hold_ids: openHolds.map((hold) => hold.hold_id),
      closed_hold_ids: closedHolds.map((hold) => hold.hold_id),
      referenced_adoption_decisions: compactAdoptionDecisions,
      governance_decisions: normalizedGovernanceDecisions,
    },
    source_references: {
      occurrences: compactSourceOccurrences,
      anchors: sourceAnchorReferences,
      anchor_label_policy: {
        precedence: [
          'direct_aamc_source_anchor_heading',
          'single_official_topic',
          'inclusive_official_topics',
          'printed_pages_and_anchor_id',
          'anchor_id',
        ],
        max_length: SOURCE_ANCHOR_LABEL_MAX_LENGTH,
        multi_topic_rule:
          'Never select one topic from a multi-topic anchor; use its direct heading, an inclusive label, or page/ID fallback.',
        safe_nonexpressive_single_line: true,
      },
      omitted_occurrence_fields: [...SOURCE_RECORD_POLICIES.sourceOccurrence.omit].sort(),
    },
    indexes: {
      lesson_by_id: arrayIndex(normalizedLessons, 'lesson_id'),
      kc_by_id: arrayIndex(normalizedKcs, 'kc_id'),
      grouping_by_id: arrayIndex(normalizedGroupings, 'grouping_id'),
      generated_grouping_view_by_id: arrayIndex(normalizedGeneratedGroupingViews, 'grouping_id'),
      attachment_by_id: attachmentLookup,
      edge_by_id: arrayIndex(authoringEdges, 'edge_id'),
      sequence_relation_by_id: relationLookup,
      hold_by_id: arrayIndex(normalizedHolds, 'hold_id'),
      adoption_decision_by_id: arrayIndex(compactAdoptionDecisions, 'decision_id'),
      source_occurrence_by_id: arrayIndex(compactSourceOccurrences, 'source_occurrence_id'),
      source_anchor_by_id: arrayIndex(sourceAnchorReferences, 'source_anchor_id'),
    },
  };
}

function parseArguments(argv) {
  if (argv.includes('--help') || argv.includes('-h')) {
    process.stdout.write(
      `Usage: node ${GENERATOR_PATH} <source-package-directory> <output-path>\n`,
    );
    return null;
  }
  assert(argv.length === 2, 'expected a source package directory and an output path');
  return {
    sourceDirectory: resolve(argv[0]),
    outputPath: resolve(argv[1]),
  };
}

async function main() {
  const args = parseArguments(process.argv.slice(2));
  if (args === null) {
    return;
  }

  const scriptAbsolutePath = fileURLToPath(import.meta.url);
  const scriptDirectory = dirname(scriptAbsolutePath);
  const repositoryRoot = resolve(scriptDirectory, '..');
  const contractAbsolutePath = resolve(repositoryRoot, CONTRACT_PATH);

  let contractBuffer;
  try {
    contractBuffer = await readFile(contractAbsolutePath);
  } catch (error) {
    fail(`cannot read canonical contract ${CONTRACT_PATH}: ${error.message}`);
  }
  const contractHash = sha256(contractBuffer);
  const contractText = contractBuffer.toString('utf8');

  const loadedSources = await Promise.all(
    SOURCE_FILE_DEFINITIONS.map((definition) => loadJsonFile(args.sourceDirectory, definition)),
  );
  const sources = Object.fromEntries(
    loadedSources.map((source) => [source.definition.key, source]),
  );

  validateSourcePackage(sources, contractText, contractHash);
  validateRegistryProjectionParity(sources);
  const validationState = validateArchitecture(sources);
  const manifest = buildManifest(sources, contractHash, validationState);
  assertManifestSafe(manifest);
  const output = await format(JSON.stringify(sortObjectKeys(manifest)), {
    parser: 'json',
    printWidth: 100,
    tabWidth: 2,
  });

  const protectedPaths = [
    scriptAbsolutePath,
    contractAbsolutePath,
    ...loadedSources.map((source) => source.absolutePath),
  ];
  await writeFileAtomically(args.outputPath, output, protectedPaths);

  process.stdout.write(
    [
      `Wrote ${args.outputPath}`,
      `Registry SHA-256: ${EXPECTED.registrySha256}`,
      `Validated: ${EXPECTED.counts.lessons} lessons, ${EXPECTED.counts.kcs} KCs, ${EXPECTED.counts.edges} edges, ${EXPECTED.counts.exactRepairRelations} repair/reentry relations`,
      `Attachment delivery: ${EXPECTED.attachmentDeliveryCounts.extensions.host_only} active extensions, ${EXPECTED.attachmentDeliveryCounts.capstones.required} required capstones, ${EXPECTED.attachmentDeliveryCounts.supports.host_only} host-only supports, ${EXPECTED.attachmentDeliveryCounts.total.governance_only} governance-only held records`,
      `Bytes: ${Buffer.byteLength(output)}`,
    ].join('\n') + '\n',
  );
}

const isDirectExecution =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isDirectExecution) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}

export {
  assertManifestSafe,
  assertSafeOutputTarget,
  buildSourceAnchorReferences,
  projectSourceRecord,
  writeFileAtomically,
};
