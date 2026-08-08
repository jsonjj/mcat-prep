import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  canonicalJson as canonicalAdmissionJson,
  diagnoseTaskSourcePacketV5,
} from '@mcat/content/lesson-factory/admission';

import {
  canonicalPacketJson,
  createTaskSourcePacket,
  createTaskSourcePackets,
  resolvePacketResearchPaths,
  validateTaskSourcePacket,
  verifyPacketArtifact,
  type PacketGeneratorInput,
  type PacketRequest,
  type TaskSourcePacket,
} from './packet-generator';

type JsonObject = Record<string, unknown>;

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const WORKSPACE_ROOT = join(REPO_ROOT, '..');
const RESEARCH_ROOT = join(WORKSPACE_ROOT, 'research');
const MANIFEST_PATH = join(REPO_ROOT, 'curriculum/v3/v3-lesson-authoring-manifest.json');
const CROSSWALK_PATH = join(
  RESEARCH_ROOT,
  'mcat-curriculum-architecture-v3/v3-source-crosswalk.json',
);
const RESEARCH_REGISTRY_PATH = join(
  RESEARCH_ROOT,
  'mcat-curriculum-architecture-v3/skill-integrated-knowledge-graph/work/research-evidence-registry.json',
);
const PACKET_SCHEMA_PATH = join(
  REPO_ROOT,
  'content/lesson-factory/schemas/task-source-packet.schema.json',
);
const SHARED_SCHEMA_PATH = join(
  REPO_ROOT,
  'content/lesson-factory/schemas/shared-vocabulary.schema.json',
);
const PROFILE_PATH = join(
  REPO_ROOT,
  'content/lesson-factory/deadline-profile/deadline-profile.json',
);
const POLICY_PATH = join(REPO_ROOT, 'content/lesson-factory/deadline-profile/release-policy.json');
const SOURCE_USE_RECEIPT_PATH = join(
  REPO_ROOT,
  'content/lesson-factory/deadline-profile/owner-source-use-receipt.json',
);
const PARTITION_PROOF_PATH = join(
  REPO_ROOT,
  'content/lesson-factory/assignments/partition-proof.json',
);
const RUBRIC_PATH = join(REPO_ROOT, 'key-docs/lesson-quality-rubric.md');

const REAL_SOURCE_BYTES = {
  allocationProofText: readFileSync(PARTITION_PROOF_PATH, 'utf8'),
  ownerSourceUseReceiptText: readFileSync(SOURCE_USE_RECEIPT_PATH, 'utf8'),
  curriculumManifestText: readFileSync(MANIFEST_PATH, 'utf8'),
  sourceCrosswalkText: readFileSync(CROSSWALK_PATH, 'utf8'),
  researchRegistryText: readFileSync(RESEARCH_REGISTRY_PATH, 'utf8'),
  taskPacketSchemaText: readFileSync(PACKET_SCHEMA_PATH, 'utf8'),
  sharedVocabularySchemaText: readFileSync(SHARED_SCHEMA_PATH, 'utf8'),
  deadlineProfileText: readFileSync(PROFILE_PATH, 'utf8'),
  releasePolicyText: readFileSync(POLICY_PATH, 'utf8'),
  rubricText: readFileSync(RUBRIC_PATH, 'utf8'),
  paths: {
    assignmentProof: 'content/lesson-factory/assignments/partition-proof.json',
    ownerSourceUseReceipt: 'content/lesson-factory/deadline-profile/owner-source-use-receipt.json',
    curriculumManifest: 'curriculum/v3/v3-lesson-authoring-manifest.json',
    sourceCrosswalk: '../research/mcat-curriculum-architecture-v3/v3-source-crosswalk.json',
    researchRegistry:
      '../research/mcat-curriculum-architecture-v3/skill-integrated-knowledge-graph/work/research-evidence-registry.json',
    taskPacketSchema: 'content/lesson-factory/schemas/task-source-packet.schema.json',
    sharedVocabularySchema: 'content/lesson-factory/schemas/shared-vocabulary.schema.json',
    deadlineProfile: 'content/lesson-factory/deadline-profile/deadline-profile.json',
    releasePolicy: 'content/lesson-factory/deadline-profile/release-policy.json',
    rubric: 'key-docs/lesson-quality-rubric.md',
  },
} as const;

function sha256(text: string): string {
  return createHash('sha256').update(Buffer.from(text, 'utf8')).digest('hex');
}

function pinSources<T extends Omit<PacketGeneratorInput['sources'], 'expectedHashes'>>(
  sources: T,
): T & Pick<PacketGeneratorInput['sources'], 'expectedHashes'> {
  const textKeys = {
    assignmentProof: 'allocationProofText',
    ownerSourceUseReceipt: 'ownerSourceUseReceiptText',
    curriculumManifest: 'curriculumManifestText',
    sourceCrosswalk: 'sourceCrosswalkText',
    researchRegistry: 'researchRegistryText',
    taskPacketSchema: 'taskPacketSchemaText',
    sharedVocabularySchema: 'sharedVocabularySchemaText',
    deadlineProfile: 'deadlineProfileText',
    releasePolicy: 'releasePolicyText',
    rubric: 'rubricText',
  } as const;
  const expectedHashes = Object.fromEntries(
    Object.entries(textKeys).map(([key, textKey]) => {
      const text = sources[textKey as keyof T] as string;
      let contentSha256 = sha256(text);
      try {
        contentSha256 = sha256(canonicalPacketJson(JSON.parse(text)));
      } catch {
        // Markdown and other intentionally non-JSON authoritative inputs hash as exact bytes.
      }
      return [key, { fileSha256: sha256(text), contentSha256 }];
    }),
  ) as PacketGeneratorInput['sources']['expectedHashes'];
  return { ...sources, expectedHashes };
}

const REAL_SOURCES = pinSources(REAL_SOURCE_BYTES);

function request(lessonId: string, overrides: Partial<PacketRequest> = {}): PacketRequest {
  return {
    lessonId,
    requestId: 'lesson-factory-deadline-2026-08-03-request-01',
    ...overrides,
  };
}

function syntheticManifest(): JsonObject {
  return {
    curriculum: {
      capstones: [],
      extensions: [],
      groupings: [
        {
          grouping_id: 'V3-CL-000001',
          lesson_id: 'V3-LES-000001',
          knowledge_textures: ['explanatory'],
          member_kc_ids: ['V3-KC-000001'],
        },
      ],
      kcs: [
        {
          kc_id: 'V3-KC-000001',
          owning_lesson_id: 'V3-LES-000001',
          display_label: 'Bounded synthetic KC',
          statement_of_competence: 'Apply the bounded synthetic relationship.',
          scope_in: ['one bounded relationship'],
          scope_out: ['all unlisted relationships'],
          representations: ['small diagram'],
          direct_source_occurrence_ids: ['V3-SRC-100001'],
          source_anchor_ids: ['CP-SA-001'],
        },
      ],
      lessons: [
        {
          canonical_display_label: 'Bounded synthetic lesson',
          short_display_alias: 'Synthetic Lesson',
          lesson_id: 'V3-LES-000001',
          lesson_type: 'CORE',
          owning_cluster_id: 'V3-CL-000001',
          nested_kc_ids: ['V3-KC-000001'],
          nested_kc_labels: ['Bounded synthetic KC'],
          ordered_required_kc_ids: ['V3-KC-000001'],
          concise_scope: 'Apply one bounded synthetic relationship.',
          scope_exclusions: ['all unlisted relationships'],
          source_anchor_ids: ['CP-SA-001'],
          source_sections: ['B/B'],
          content_categories: ['1A'],
          foundational_concepts: ['FC1'],
          capstone_ids: [],
          extension_ids: [],
          support_artifact_ids: [],
          hard_prerequisite_lesson_ids: [],
          helpful_prerequisite_lesson_ids: [],
          module_ids: ['V3-MOD-000001'],
          phase_ids: ['V3-PHS-000001'],
          pathway_positions: [
            {
              pathway_id: 'V3-PTH-000001',
              position: 1,
              source_relation_ids: ['R14-PL-000001-001'],
            },
          ],
          revisit_positions: [],
          sequence_relation_refs: {
            first_delivery: 'R14-FD-000001',
            internal_order: 'R14-INTERNAL-000001',
            capstone_placements: [],
            remediation_and_reentry: [],
            revisits: [],
            held_nonrequired: [],
          },
          unresolved_holds: [
            'V3-HOLD-110001',
            'V3-HOLD-110003',
            'V3-HOLD-110005',
            'V3-HOLD-110008',
            'V3-HOLD-110009',
          ],
          accelerated_handling: {
            currently_authorized_bypass: false,
          },
        },
      ],
      support_artifacts: [],
      holds: [
        {
          hold_id: 'V3-HOLD-110001',
          issue: 'The supplied authority is not present-day refreshed.',
          status: 'OPEN',
          type: 'AUTHORITY_CURRENCY',
        },
        {
          hold_id: 'V3-HOLD-110003',
          issue: 'The lesson boundary remains learner-unvalidated.',
          status: 'OPEN',
          type: 'LEARNER_VALIDATION',
        },
        {
          hold_id: 'V3-HOLD-110005',
          issue: 'Sequence readiness remains provisional.',
          status: 'OPEN',
          type: 'GRAPH_AND_SEQUENCE_EVIDENCE',
        },
        {
          hold_id: 'V3-HOLD-110008',
          issue: 'Knowledge type remains unratified.',
          status: 'OPEN',
          type: 'KNOWLEDGE_TYPE_RATIFICATION',
        },
        {
          hold_id: 'V3-HOLD-110009',
          issue: 'Adaptive bypass and thresholds remain disabled.',
          status: 'OPEN_FAIL_CLOSED',
          type: 'ADAPTIVE_BYPASS',
        },
      ],
    },
    metadata: {
      authority_boundary: {
        present_day_authority_refreshed: false,
        no_current_endorsement_or_efficacy_claim: true,
      },
    },
    sequence: {
      modules: [
        {
          module_id: 'V3-MOD-000001',
          placement_projection: {
            phase_id: 'V3-PHS-000001',
            source_relation_ids: ['R14-PM-01'],
          },
        },
      ],
      phases: [
        {
          phase_id: 'V3-PHS-000001',
          placement_projection: {
            source_relation_ids: ['R14-PP-000001-1'],
          },
        },
      ],
      pathways: [
        {
          pathway_id: 'V3-PTH-000001',
          currently_authorized_bypass: false,
        },
      ],
      normalized_relations: {
        module_delivery_event_relations: [
          {
            relation_id: 'R14-FD-000001',
            target_lesson_id: 'V3-LES-000001',
            module_id: 'V3-MOD-000001',
            phase_id: 'V3-PHS-000001',
            module_event_order: 1,
            global_delivery_event_ordinal: 2,
            placement_kind: 'LESSON_FIRST_DELIVERY',
            internal_order_relation_id: 'R14-INTERNAL-000001',
          },
        ],
        pathway_lesson_scope_relations: [
          {
            first_delivery_relation_id: 'R14-FD-000001',
            lesson_id: 'V3-LES-000001',
            pathway_id: 'V3-PTH-000001',
            relation_id: 'R14-PL-000001-001',
          },
        ],
        pathway_phase_relations: [
          {
            pathway_id: 'V3-PTH-000001',
            phase_id: 'V3-PHS-000001',
            relation_id: 'R14-PP-000001-1',
          },
        ],
        phase_module_relations: [
          {
            module_id: 'V3-MOD-000001',
            phase_id: 'V3-PHS-000001',
            relation_id: 'R14-PM-01',
          },
        ],
        held_nonrequired_relations: [],
        lesson_internal_order_relations: [
          {
            relation_id: 'R14-INTERNAL-000001',
            lesson_id: 'V3-LES-000001',
            grouping_id: 'V3-CL-000001',
            ordered_entity_ids: ['V3-KC-000001'],
            ordered_nested_kc_ids: ['V3-KC-000001'],
            owned_capstone_ids: [],
            referenced_capstone_ids: [],
          },
        ],
        sirs_math_point_of_use_relations: [],
        helpful_order_decision_relations: [],
      },
    },
  };
}

function syntheticCrosswalk(): JsonObject {
  const receiptHash = sha256('synthetic rights receipt');
  return {
    schema_version: 'synthetic-source-crosswalk-1',
    metadata: {
      authority: {
        source: 'Synthetic authority',
        present_day_authority_refreshed: false,
        no_current_endorsement_or_efficacy_claim: true,
      },
    },
    source_occurrences: [
      {
        source_occurrence_id: 'V3-SRC-100001',
        occurrence_kind: 'AAMC_TEACHABLE_TOPIC',
        source_topic_id: 'SYN-TOP-0001',
        source_id: 'AAMC-2020',
        section: 'Synthetic',
        official_path: ['Synthetic', 'Bounded topic'],
        official_topic: 'Bounded topic',
        printed_pages: [1],
        source_anchor_ids: ['CP-SA-001'],
        source_summary: 'A bounded derived summary.',
        scope_status: 'IN_SCOPE_DIRECT',
        direct_evidence_eligible: true,
        rights_status: 'PERMITTED',
        permitted_use: ['INTERNAL_HUMAN_REVIEW', 'SYNTHETIC_TRANSFORMATION'],
        permission_receipt_refs: [`permission-receipt:src-0001/2026-08-03#sha256:${receiptHash}`],
      },
    ],
    mappings: [
      {
        mapping_id: 'V3-MAP-000001',
        target_id: 'V3-KC-000001',
        target_type: 'KC',
        relation: 'exact',
        mapping_role: 'direct',
        source_occurrence_ids: ['V3-SRC-100001'],
        direct_source_occurrence_ids: ['V3-SRC-100001'],
        source_anchor_ids: ['CP-SA-001'],
        required_scope: 'one bounded relationship',
        required_operation: 'APPLY',
        terminology: 'bounded relationship',
      },
    ],
  };
}

function syntheticResearchRegistry(): JsonObject {
  return {
    schema_version: '1.0.0',
    record_kind: 'RESEARCH_EVIDENCE_REGISTRY',
    registry_id: 'v3-research-evidence-registry',
    metadata: {
      purpose:
        'Design evidence only. It may not validate a KC, lesson, factual claim, efficacy, mastery, or readiness.',
    },
    research_claims: [
      {
        claim_id: 'DESIGN-ONLY-01',
        claim: 'A design-only statement that must not become domain-fact authority.',
      },
    ],
    release_statement:
      'This registry may justify design decisions only and does not validate lesson facts.',
  };
}

function syntheticAllocationProof(
  lessonId = 'V3-LES-000001',
  overrides: JsonObject = {},
  manifestText = JSON.stringify(syntheticManifest()),
  sharedVocabularySchemaText = REAL_SOURCES.sharedVocabularySchemaText,
): JsonObject {
  return {
    contract_id: 'lesson-factory.assignment-partition-proof',
    contract_version: '1.0.0',
    deadline_profile_ref: `profile:content/lesson-factory/deadline-profile/deadline-profile.json#sha256:${sha256(
      REAL_SOURCES.deadlineProfileText,
    )}`,
    release_policy_ref: `policy:content/lesson-factory/deadline-profile/release-policy.json#sha256:${sha256(
      REAL_SOURCES.releasePolicyText,
    )}`,
    rubric_identity: {
      rubric_path: 'key-docs/lesson-quality-rubric.md',
      rubric_sha256: sha256(REAL_SOURCES.rubricText),
    },
    assignment_schema: {
      shared_vocabulary_file_sha256: sha256(sharedVocabularySchemaText),
    },
    source_manifest: {
      path: 'curriculum/v3/v3-lesson-authoring-manifest.json',
      file_sha256: sha256(manifestText),
      content_sha256: sha256(canonicalPacketJson(JSON.parse(manifestText))),
    },
    assignments: [
      {
        assignment_id: 'lesson-factory-deadline-2026-08-03-assignment-09',
        team_id: 'team-A',
        lane_id: 'lane-09',
        rows: [
          {
            lesson_id: lessonId,
            assignment_id: 'lesson-factory-deadline-2026-08-03-assignment-09',
            team_id: 'team-A',
            lane_id: 'lane-09',
            output_path: `.tmp/lesson-factory/lane-09/${lessonId.toLowerCase()}`,
          },
        ],
      },
    ],
    ...overrides,
  };
}

function syntheticSources(
  mutate: {
    manifest?: (value: JsonObject) => void;
    crosswalk?: (value: JsonObject) => void;
    registry?: (value: JsonObject) => void;
  } = {},
): PacketGeneratorInput['sources'] {
  const manifest = syntheticManifest();
  const crosswalk = syntheticCrosswalk();
  const registry = syntheticResearchRegistry();
  mutate.manifest?.(manifest);
  mutate.crosswalk?.(crosswalk);
  mutate.registry?.(registry);
  const manifestText = JSON.stringify(manifest);
  const sourceUseReceiptHash = sha256(REAL_SOURCES.ownerSourceUseReceiptText);
  const sourceUseReceiptRef = `source-use-receipt:content/lesson-factory/deadline-profile/owner-source-use-receipt.json#sha256:${sourceUseReceiptHash}`;
  const sharedVocabulary = JSON.parse(REAL_SOURCES.sharedVocabularySchemaText) as JsonObject;
  const definitions = sharedVocabulary.$defs as JsonObject;
  const frozenReceiptRef = definitions.FrozenSourceUseReceiptRef as JsonObject;
  const frozenReceiptRules = frozenReceiptRef.allOf as JsonObject[];
  frozenReceiptRules[1]!.const = sourceUseReceiptRef;
  const sharedVocabularySchemaText = JSON.stringify(sharedVocabulary);
  return pinSources({
    ...REAL_SOURCES,
    allocationProofText: JSON.stringify(
      syntheticAllocationProof('V3-LES-000001', {}, manifestText, sharedVocabularySchemaText),
    ),
    curriculumManifestText: manifestText,
    sourceCrosswalkText: JSON.stringify(crosswalk),
    researchRegistryText: JSON.stringify(registry),
    sharedVocabularySchemaText,
  });
}

function syntheticInput(
  mutate: Parameters<typeof syntheticSources>[0] = {},
  inputOverrides: Partial<PacketGeneratorInput> = {},
): PacketGeneratorInput {
  return {
    sources: syntheticSources(mutate),
    request: request('V3-LES-000001'),
    ...inputOverrides,
  };
}

describe('canonicalPacketJson', () => {
  it('uses the production admission canonical JSON function', () => {
    expect(canonicalPacketJson).toBe(canonicalAdmissionJson);
  });

  it('serializes object keys deterministically without reordering arrays', () => {
    expect(canonicalPacketJson({ z: [2, 1], a: { y: true, x: null } })).toBe(
      '{"a":{"x":null,"y":true},"z":[2,1]}',
    );
  });
});

describe('createTaskSourcePacket', () => {
  it('derives assignment identity only from the exact allocation proof row', () => {
    const base = syntheticInput();
    const result = createTaskSourcePacket({
      ...base,
      sources: pinSources({
        ...base.sources,
        allocationProofText: JSON.stringify(
          syntheticAllocationProof(
            'V3-LES-000001',
            {},
            base.sources.curriculumManifestText,
            base.sources.sharedVocabularySchemaText,
          ),
        ),
      }),
      request: {
        ...request('V3-LES-000001'),
        assignmentId: 'caller-controlled-assignment',
        teamId: 'caller-controlled-team',
        laneId: 'lane-77',
        outputDirectory: '.tmp/caller-controlled-output',
      } as PacketRequest,
    });

    expect(result.audit).toMatchObject({
      assignmentId: 'lesson-factory-deadline-2026-08-03-assignment-09',
      teamId: 'team-A',
      laneId: 'lane-09',
      output: {
        outputDirectory: '.tmp/lesson-factory/lane-09/v3-les-000001',
      },
    });
    expect(result.blockReasons.map((reason) => reason.code)).not.toContain(
      'ASSIGNMENT_IDENTITY_MISMATCH',
    );
  });

  it('blocks a lesson absent from the required allocation proof', () => {
    const base = syntheticInput();
    const result = createTaskSourcePacket({
      ...base,
      sources: pinSources({
        ...base.sources,
        allocationProofText: JSON.stringify(
          syntheticAllocationProof(
            'V3-LES-999999',
            {},
            base.sources.curriculumManifestText,
            base.sources.sharedVocabularySchemaText,
          ),
        ),
      }),
    });

    expect(result.status).toBe('BLOCKED');
    expect(result.blockReasons.map((reason) => reason.code)).toContain(
      'ASSIGNMENT_IDENTITY_MISMATCH',
    );
    expect(result.packet).toBeNull();
    expect(result.bytes).toBeNull();
    expect(result.canonicalAdmissionDiagnostic).toBeNull();
    expect(result.quarantineRecord).toBeNull();
    expect(result.quarantineBytes).toBeNull();
    expect(result.quarantineContentSha256).toBeNull();
    expect(result.quarantineFileSha256).toBeNull();
    expect(result.quarantinePath).toBeNull();
    expect(result.scopeClassification).toBe('OUT_OF_SCOPE_EXISTING');
    expect(JSON.stringify(result)).not.toMatch(
      /lane-01|primary|lesson-factory-deadline-2026-08-03-assignment-01/,
    );
  });

  it('uses the module-owned PACKET_SEMANTICS_V1 admission without a caller callback', () => {
    const result = createTaskSourcePacket({
      sources: REAL_SOURCES,
      request: request('V3-LES-151730'),
    });

    expect(result.status).toBe('READY');
    expect(result.blockReasons).toEqual([]);
    expect(result.packet).not.toBeNull();
    expect(result.bytes).not.toBeNull();
    expect(result.quarantineRecord).toBeNull();
    expect(result.quarantineBytes).toBeNull();
  });

  it('retains learner-safe canonical refusal details for failed admission', () => {
    const result = createTaskSourcePacket(syntheticInput());

    expect(result.status).toBe('BLOCKED');
    expect(result.canonicalAdmissionDiagnostic).toMatchObject({
      admission: 'REJECTED',
      stage: 'REFERENCES',
      code: 'REFERENCES_UNRESOLVED',
      validator: 'PACKET_SEMANTICS_V1',
    });
    expect(result.canonicalAdmissionDiagnostic?.paths.length).toBeGreaterThan(0);
    expect(JSON.stringify(result.canonicalAdmissionDiagnostic)).not.toContain('exact_text');
    expect(JSON.stringify(result.canonicalAdmissionDiagnostic)).not.toContain('raw_passage_text');
  });

  it('keeps synthetic preflight diagnostics deterministic but never serializes them', () => {
    const first = createTaskSourcePacket(syntheticInput());
    const second = createTaskSourcePacket(syntheticInput());

    expect(first.status).toBe('BLOCKED');
    expect(first.blockReasons.map((reason) => reason.code)).toContain(
      'WP01_CANONICAL_ADMISSION_FAILED',
    );
    expect(first.audit).toEqual(second.audit);
    expect(first.packet).toBeNull();
    expect(first.bytes).toBeNull();
    expect(first.packetContentSha256).toBeNull();
    expect(first.packetFileSha256).toBeNull();
  });

  it('preserves exact ordered required KCs, labels, competencies, scope, and non-goals', () => {
    const result = createTaskSourcePacket(syntheticInput());

    expect(result.audit.orderedKcs.map((kc) => kc.kcId)).toEqual(['V3-KC-000001']);
    expect(result.audit.orderedKcs[0]).toMatchObject({
      label: 'Bounded synthetic KC',
      competency: 'Apply the bounded synthetic relationship.',
      scopeIn: ['one bounded relationship'],
      scopeOut: ['all unlisted relationships'],
      representations: ['small diagram'],
    });
    expect(result.status).toBe('BLOCKED');
    expect(result.packet).toBeNull();
  });

  it('resolves each required KC to rights-safe source occurrences through an explicit mapping', () => {
    const result = createTaskSourcePacket(syntheticInput());
    const kc = result.audit.orderedKcs[0]!;

    expect(kc.sourceMappings.map((mapping) => mapping.mappingId)).toEqual(['V3-MAP-000001']);
    expect(kc.sourceOccurrences).toHaveLength(1);
    expect(kc.sourceOccurrences[0]).toMatchObject({
      sourceOccurrenceId: 'V3-SRC-100001',
      officialTopic: 'Bounded topic',
      printedPages: [1],
      derivedSummary: 'A bounded derived summary.',
      rightsStatus: 'PERMITTED',
    });
  });

  it('derives rights and projected fields from the exact source-ID receipt entry', () => {
    const result = createTaskSourcePacket(
      syntheticInput({
        crosswalk: (value) => {
          const occurrence = (value.source_occurrences as JsonObject[])[0]!;
          occurrence.source_id = 'BRAINLIFT-CA';
          occurrence.official_topic = 'Must be removed by the source-specific allowlist.';
          occurrence.source_summary = 'Must also be removed by the source-specific allowlist.';
        },
      }),
    );
    const occurrence = result.audit.orderedKcs[0]!.sourceOccurrences[0]!;

    expect(result.status).toBe('BLOCKED');
    expect(result.blockReasons.map((reason) => reason.code)).toContain(
      'WP01_CANONICAL_ADMISSION_FAILED',
    );
    expect(occurrence).toMatchObject({
      sourceId: 'BRAINLIFT-CA',
      sourceClass: 'REPOSITORY',
      officialTopic: null,
      derivedSummary: null,
      rightsStatus: 'PERMITTED',
      permittedUse: [
        'DERIVED_SCOPE_METADATA',
        'ORIGINAL_PROSE_FROM_UNCOPYRIGHTABLE_FACTS',
        'INTERNAL_HUMAN_REVIEW',
      ],
    });
  });

  it('blocks an unbound source ID even when its substring looks permissive', () => {
    const result = createTaskSourcePacket(
      syntheticInput({
        crosswalk: (value) => {
          (value.source_occurrences as JsonObject[])[0]!.source_id = 'BRAINLIFT-AAMC-SPOOF';
        },
      }),
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.blockReasons.map((reason) => reason.code)).toContain('SOURCE_RIGHTS_UNCLEARED');
    expect(result.packet).toBeNull();
    expect(result.bytes).toBeNull();
  });

  it('allowlists derived source fields and strips exact/raw-adjacent extras', () => {
    const result = createTaskSourcePacket({
      sources: REAL_SOURCES,
      request: request('V3-LES-006619'),
    });
    const serialized = JSON.stringify(result.audit.orderedKcs);

    expect(result.audit.sourceSanitization).toMatchObject({
      trustedCanonicalInput: true,
      codes: ['TRUSTED_CANONICAL_RAW_FIELDS_SANITIZED'],
    });
    expect(result.audit.sourceSanitization.sanitizedRawFieldCount).toBeGreaterThan(0);
    expect(serialized).not.toContain('exact_text');
    expect(serialized).not.toContain('extra_private_note');
  });

  it('refuses self-declared canonical provenance even when spoof bytes are rehashed', () => {
    const sentinel = 'SENTINEL REHASHED SELF-DECLARED CANONICAL SPOOF';
    const result = createTaskSourcePacket(
      syntheticInput({
        crosswalk: (value) => {
          value.schema_version = 'mcat-v3-source-crosswalk-public-1';
          (value.metadata as JsonObject).provenance = {
            canonical: true,
            source_path: 'research/mcat-curriculum-architecture-v3/v3-source-crosswalk.json',
          };
          (value.source_occurrences as JsonObject[])[0]!.exact_text = sentinel;
        },
      }),
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.blockReasons.map((reason) => reason.code)).toContain(
      'PROHIBITED_RAW_SOURCE_TEXT',
    );
    expect(result.audit.sourceSanitization.trustedCanonicalInput).toBe(false);
    expect(JSON.stringify(result)).not.toContain(sentinel);
    expect(result.packet).toBeNull();
    expect(result.bytes).toBeNull();
  });

  it('rejects changed canonical crosswalk bytes against the mandatory pins before projection', () => {
    const sentinel = 'SENTINEL UNPINNED CANONICAL CROSSWALK TAMPER';
    const crosswalk = JSON.parse(REAL_SOURCES.sourceCrosswalkText) as JsonObject;
    (crosswalk.source_occurrences as JsonObject[])[0]!.exact_text = sentinel;
    const result = createTaskSourcePacket({
      sources: {
        ...REAL_SOURCES,
        sourceCrosswalkText: JSON.stringify(crosswalk),
      },
      request: request('V3-LES-006619'),
    });

    expect(result.blockReasons.map((reason) => reason.code)).toEqual(['INPUT_HASH_MISMATCH']);
    expect(result.audit.orderedKcs).toEqual([]);
    expect(result.audit.sourceSanitization.trustedCanonicalInput).toBe(false);
    expect(JSON.stringify(result)).not.toContain(sentinel);
    expect(result.packet).toBeNull();
    expect(result.bytes).toBeNull();
  });

  it('fails closed on exact text from a non-canonical source shape without leaking its value', () => {
    const sentinel = 'SENTINEL UNTRUSTED EXACT SOURCE VALUE';
    const result = createTaskSourcePacket(
      syntheticInput({
        crosswalk: (value) => {
          value.schema_version = 'untrusted-crosswalk-shape';
          const occurrence = (value.source_occurrences as JsonObject[])[0]!;
          occurrence.exact_text = sentinel;
        },
      }),
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.blockReasons.map((reason) => reason.code)).toContain(
      'PROHIBITED_RAW_SOURCE_TEXT',
    );
    expect(JSON.stringify(result)).not.toContain(sentinel);
  });

  it.each(['raw_passage_text', 'question_stem', 'figure_svg', 'verbatim_quote'])(
    'fails closed when selected source input contains prohibited %s',
    (field) => {
      const result = createTaskSourcePacket(
        syntheticInput({
          crosswalk: (value) => {
            const occurrence = (value.source_occurrences as JsonObject[])[0]!;
            occurrence[field] = 'prohibited raw material';
          },
        }),
      );

      expect(result.status).toBe('BLOCKED');
      expect(result.blockReasons.map((reason) => reason.code)).toContain(
        'PROHIBITED_RAW_SOURCE_TEXT',
      );
      expect(result.packet).toBeNull();
    },
  );

  it('keeps research registry material design-only and out of domain-fact authority', () => {
    const result = createTaskSourcePacket(syntheticInput());

    expect(result.audit.researchEvidence).toMatchObject({
      registryId: 'v3-research-evidence-registry',
      authority: 'DESIGN_ONLY',
      usedAsDomainFactAuthority: false,
    });
    expect(JSON.stringify(result.audit.orderedKcs)).not.toContain('A design-only statement');
    expect(JSON.stringify(result.packet)).not.toContain('DESIGN-ONLY-01');
  });

  it('keeps contextual holds visible without blanket-blocking the packet', () => {
    const result = createTaskSourcePacket(syntheticInput());
    const byId = Object.fromEntries(result.audit.holds.map((hold) => [hold.holdId, hold]));

    expect(result.status).toBe('BLOCKED');
    expect(result.blockReasons.map((reason) => reason.code)).toEqual([
      'WP01_CANONICAL_ADMISSION_FAILED',
    ]);
    expect(byId['V3-HOLD-110001']?.classification).toBe('CONTEXTUAL_NONBLOCKING');
    expect(byId['V3-HOLD-110003']?.classification).toBe('CONTEXTUAL_NONBLOCKING');
    expect(byId['V3-HOLD-110005']?.classification).toBe('CONTEXTUAL_NONBLOCKING');
    expect(byId['V3-HOLD-110008']?.classification).toBe('CONTEXTUAL_NONBLOCKING');
  });

  it('does not reactivate a closed historical hold as a packet blocker', () => {
    const result = createTaskSourcePacket(
      syntheticInput({
        manifest: (value) => {
          const curriculum = value.curriculum as JsonObject;
          (curriculum.holds as JsonObject[]).push({
            hold_id: 'V3-HOLD-119999',
            affected_entity_ids: ['V3-LES-000001'],
            issue: 'A historical issue that is already closed.',
            status: 'CLOSED_VERIFIED',
            type: 'HISTORICAL_CONTROL',
          });
        },
      }),
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.audit.holds.map((hold) => hold.holdId)).not.toContain('V3-HOLD-119999');
  });

  it('forces adaptive bypass disabled and numeric thresholds null', () => {
    const result = createTaskSourcePacket(syntheticInput());

    expect(result.audit.adaptivePolicy).toEqual({
      bypassAuthorized: false,
      masteryThreshold: null,
      fluencyThreshold: null,
      uncertaintyThreshold: null,
    });
    expect(result.audit.holds.find((hold) => hold.holdId === 'V3-HOLD-110009')).toMatchObject({
      classification: 'CONTEXTUAL_NONBLOCKING',
      safeInterimCode: 'DISABLE_ADAPTIVE_BYPASS_AND_NULL_THRESHOLDS',
    });
  });

  it('treats compatible multiple exact mappings as corroboration', () => {
    const result = createTaskSourcePacket(
      syntheticInput({
        crosswalk: (value) => {
          const mappings = value.mappings as JsonObject[];
          mappings.push({
            ...structuredClone(mappings[0]!),
            mapping_id: 'V3-MAP-000002',
          });
        },
      }),
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.audit.orderedKcs[0]!.sourceSetStatus).toBe('MULTI_SOURCE_CORROBORATED');
    expect(result.blockReasons.map((reason) => reason.code)).not.toContain(
      'SOURCE_MAPPING_CONTRADICTION',
    );
  });

  it('accepts an explicit enabling mapping when it is the KC source lineage', () => {
    const result = createTaskSourcePacket(
      syntheticInput({
        crosswalk: (value) => {
          const mapping = (value.mappings as JsonObject[])[0]!;
          mapping.mapping_role = 'enabling';
        },
      }),
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.audit.orderedKcs[0]!.sourceMappings).toHaveLength(1);
    expect(result.blockReasons.map((reason) => reason.code)).not.toContain(
      'SOURCE_MAPPING_MISSING',
    );
  });

  it('blocks explicit incompatible exact source scope or operation', () => {
    const result = createTaskSourcePacket(
      syntheticInput({
        crosswalk: (value) => {
          const mappings = value.mappings as JsonObject[];
          mappings.push({
            ...structuredClone(mappings[0]!),
            mapping_id: 'V3-MAP-000002',
            required_scope: 'an incompatible scope',
            required_operation: 'CONTRADICT',
          });
        },
      }),
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.blockReasons.map((reason) => reason.code)).toContain(
      'SOURCE_MAPPING_CONTRADICTION',
    );
  });

  it('blocks a required KC with no traceable source mapping', () => {
    const result = createTaskSourcePacket(
      syntheticInput({
        crosswalk: (value) => {
          value.mappings = [];
        },
      }),
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.blockReasons.map((reason) => reason.code)).toContain('SOURCE_MAPPING_MISSING');
  });

  it('preserves exact source-mapping blocker pointers without fabricating quarantine', () => {
    const result = createTaskSourcePacket(
      syntheticInput({
        crosswalk: (value) => {
          value.mappings = [];
        },
      }),
    );
    const diagnosticReason = result.blockReasons.find(
      (reason) => reason.code === 'SOURCE_MAPPING_MISSING',
    );

    expect(diagnosticReason).toMatchObject({
      code: 'SOURCE_MAPPING_MISSING',
      path: '/ordered_kc_records/0/source_mappings',
    });
    expect(diagnosticReason?.path).not.toMatch(/^\/generator\/block_reasons\//);
    expect(result.quarantineRecord).toBeNull();
    expect(result.quarantineBytes).toBeNull();
  });

  it('blocks unknown and duplicate lesson identity with stable codes', () => {
    const unknown = createTaskSourcePacket({
      sources: syntheticSources(),
      request: request('V3-LES-999999'),
    });
    const duplicate = createTaskSourcePacket(
      syntheticInput({
        manifest: (value) => {
          const curriculum = value.curriculum as JsonObject;
          const lessons = curriculum.lessons as JsonObject[];
          lessons.push(structuredClone(lessons[0]!));
        },
      }),
    );

    expect(unknown.blockReasons.map((reason) => reason.code)).toContain('UNKNOWN_LESSON_ID');
    expect(duplicate.blockReasons.map((reason) => reason.code)).toContain('DUPLICATE_LESSON_ID');
  });

  it('returns no packet, bytes, or hashes for blocked rights', () => {
    const result = createTaskSourcePacket(
      syntheticInput({
        crosswalk: (value) => {
          const occurrence = (value.source_occurrences as JsonObject[])[0]!;
          occurrence.source_id = 'PRIVATE-KAPLAN-COMPARISON';
        },
      }),
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.blockReasons.map((reason) => reason.code)).toEqual(
      expect.arrayContaining(['SOURCE_RIGHTS_UNCLEARED']),
    );
    expect(result.packet).toBeNull();
    expect(result.bytes).toBeNull();
    expect(result.packetContentSha256).toBeNull();
    expect(result.packetFileSha256).toBeNull();
  });

  it('requires complete file/content pins before parsing any authoritative input', () => {
    const sources = syntheticSources();
    const unpinned = { ...sources, expectedHashes: undefined };
    unpinned.curriculumManifestText = 'not valid JSON and must not be parsed';
    const result = createTaskSourcePacket({
      sources: unpinned as unknown as PacketGeneratorInput['sources'],
      request: request('V3-LES-000001'),
    });

    expect(result.status).toBe('BLOCKED');
    expect(result.blockReasons.map((reason) => reason.code)).toContain('INPUT_HASH_MISMATCH');
    expect(result.packet).toBeNull();
  });

  it('pins exact input file/content hashes and rejects proof or content tampering', () => {
    const sources = syntheticSources();
    const valid = createTaskSourcePacket({
      sources,
      request: request('V3-LES-000001'),
    });
    const mismatch = createTaskSourcePacket({
      sources: {
        ...sources,
        expectedHashes: {
          ...sources.expectedHashes,
          curriculumManifest: {
            ...sources.expectedHashes.curriculumManifest,
            contentSha256: sha256('different canonical content'),
          },
        },
      },
      request: request('V3-LES-000001'),
    });
    const tamperedProof = createTaskSourcePacket({
      sources: {
        ...sources,
        allocationProofText: `${sources.allocationProofText} `,
      },
      request: request('V3-LES-000001'),
    });

    expect(valid.audit.inputHashes.curriculumManifest).toMatchObject({
      fileSha256: sha256(sources.curriculumManifestText),
      contentSha256: sha256(canonicalPacketJson(JSON.parse(sources.curriculumManifestText))),
    });
    expect(mismatch.blockReasons.map((reason) => reason.code)).toContain('INPUT_HASH_MISMATCH');
    expect(mismatch.packet).toBeNull();
    expect(tamperedProof.blockReasons.map((reason) => reason.code)).toContain(
      'INPUT_HASH_MISMATCH',
    );
    expect(tamperedProof.packet).toBeNull();
  });

  it('pins STANDARD-only release policy and forbids invented item-level DOK labels', () => {
    const result = createTaskSourcePacket(syntheticInput());

    expect(result.audit.releasePolicy).toMatchObject({
      routeScopeCode: 'STANDARD_ONLY',
      applicableRoutes: ['STANDARD'],
    });
    expect(result.audit.dokAuthoring).toEqual({
      itemLevelDokLabelsAuthorized: false,
      requirement:
        'Use the authoritative KC competency, scope, representation, and operation evidence; do not invent item-level DOK labels.',
    });
    expect(result.packet).toBeNull();
  });

  it('blocks a reverse-direction hard prerequisite with a stable code', () => {
    const result = createTaskSourcePacket(
      syntheticInput({
        manifest: (value) => {
          const curriculum = value.curriculum as JsonObject;
          const target = (curriculum.lessons as JsonObject[])[0]!;
          const prerequisite = structuredClone(target);
          prerequisite.lesson_id = 'V3-LES-000002';
          prerequisite.ordered_required_kc_ids = ['V3-KC-000002'];
          prerequisite.nested_kc_ids = ['V3-KC-000002'];
          prerequisite.pathway_positions = [
            {
              pathway_id: 'V3-PTH-000001',
              position: 1,
              source_relation_ids: ['R14-PL-000002-001'],
            },
          ];
          target.pathway_positions = [
            {
              pathway_id: 'V3-PTH-000001',
              position: 2,
              source_relation_ids: ['R14-PL-000001-001'],
            },
          ];
          target.hard_prerequisite_lesson_ids = ['V3-LES-000002'];
          (curriculum.lessons as JsonObject[]).push(prerequisite);
          (curriculum.kcs as JsonObject[]).push({
            ...(curriculum.kcs as JsonObject[])[0]!,
            kc_id: 'V3-KC-000002',
            owning_lesson_id: 'V3-LES-000002',
          });
          value.graph = {
            edges: [
              {
                edge_id: 'V3-EDGE-000001',
                edge_type: 'HARD_PREREQUISITE',
                source_id: 'V3-KC-000001',
                target_id: 'V3-KC-000002',
              },
            ],
          };
        },
      }),
    );

    expect(result.blockReasons.map((reason) => reason.code)).toContain(
      'PREREQUISITE_RELATION_UNRESOLVED',
    );
  });

  it('blocks unresolved helpful prerequisite, delivery, revisit, and pathway relations', () => {
    const result = createTaskSourcePacket(
      syntheticInput({
        manifest: (value) => {
          const curriculum = value.curriculum as JsonObject;
          const target = (curriculum.lessons as JsonObject[])[0]!;
          const helpful = structuredClone(target);
          helpful.lesson_id = 'V3-LES-000002';
          helpful.ordered_required_kc_ids = ['V3-KC-000002'];
          helpful.nested_kc_ids = ['V3-KC-000002'];
          (curriculum.lessons as JsonObject[]).push(helpful);
          (curriculum.kcs as JsonObject[]).push({
            ...(curriculum.kcs as JsonObject[])[0]!,
            kc_id: 'V3-KC-000002',
            owning_lesson_id: 'V3-LES-000002',
          });
          target.helpful_prerequisite_lesson_ids = ['V3-LES-000002'];
          target.pathway_positions = [
            {
              pathway_id: 'V3-PTH-000001',
              source_relation_ids: [],
            },
          ];
          target.sequence_relation_refs = {
            ...(target.sequence_relation_refs as JsonObject),
            first_delivery: 'R14-FD-MISSING',
            revisits: ['R14-RV-MISSING'],
          };
        },
      }),
    );

    expect(result.blockReasons.map((reason) => reason.code)).toEqual(
      expect.arrayContaining([
        'PREREQUISITE_RELATION_UNRESOLVED',
        'REQUIRED_SEQUENCE_RELATION_UNRESOLVED',
      ]),
    );
  });

  it('represents an owning capstone with no local component as lesson-scoped', () => {
    const result = createTaskSourcePacket(
      syntheticInput({
        manifest: (value) => {
          const curriculum = value.curriculum as JsonObject;
          const lesson = (curriculum.lessons as JsonObject[])[0]!;
          lesson.capstone_ids = ['V3-CAP-000001'];
          (curriculum.capstones as JsonObject[]).push({
            capstone_id: 'V3-CAP-000001',
            component_kc_ids: ['V3-KC-999999'],
            owning_lesson_id: 'V3-LES-000001',
            delivery_evidence: {
              source_relation_ids: ['R14-CAP-000001'],
            },
          });
          const normalized = (value.sequence as JsonObject).normalized_relations as JsonObject;
          (normalized.module_delivery_event_relations as JsonObject[]).push({
            relation_id: 'R14-CAP-000001',
            placement_kind: 'CAPSTONE_COORDINATION',
            target_capstone_id: 'V3-CAP-000001',
            owning_lesson_id: 'V3-LES-000001',
          });
        },
      }),
    );

    expect(result.blockReasons.map((reason) => reason.code)).not.toContain(
      'REQUIRED_KC_UNRESOLVED',
    );
    expect(result.audit.attachments[0]).toMatchObject({
      hostScope: { kind: 'LESSON' },
      creditsKcEvidence: false,
    });
  });

  it('preserves every synthetic multi-host capstone KC', () => {
    const result = createTaskSourcePacket(
      syntheticInput({
        manifest: (value) => {
          const curriculum = value.curriculum as JsonObject;
          const lesson = (curriculum.lessons as JsonObject[])[0]!;
          const kcs = curriculum.kcs as JsonObject[];
          kcs.push({
            ...structuredClone(kcs[0]!),
            kc_id: 'V3-KC-000002',
            owning_lesson_id: 'V3-LES-000001',
          });
          lesson.nested_kc_ids = ['V3-KC-000001', 'V3-KC-000002'];
          lesson.nested_kc_labels = ['Bounded synthetic KC', 'Second bounded synthetic KC'];
          lesson.ordered_required_kc_ids = ['V3-KC-000001', 'V3-KC-000002'];
          ((curriculum.groupings as JsonObject[])[0]!.member_kc_ids as string[]).push(
            'V3-KC-000002',
          );
          const normalized = (value.sequence as JsonObject).normalized_relations as JsonObject;
          const internal = (normalized.lesson_internal_order_relations as JsonObject[])[0]!;
          internal.ordered_entity_ids = ['V3-KC-000001', 'V3-KC-000002', 'V3-CAP-945802'];
          internal.ordered_nested_kc_ids = ['V3-KC-000001', 'V3-KC-000002'];
          internal.owned_capstone_ids = ['V3-CAP-945802'];
          lesson.capstone_ids = ['V3-CAP-945802'];
          (curriculum.capstones as JsonObject[]).push({
            capstone_id: 'V3-CAP-945802',
            component_kc_ids: ['V3-KC-000001', 'V3-KC-000002'],
            owning_lesson_id: 'V3-LES-000001',
            delivery_state: 'required',
            delivery_evidence: {
              module_id: 'V3-MOD-000001',
              phase_id: 'V3-PHS-000001',
              placement_relation_id: 'R14-CAP-945802',
              source_relation_ids: ['R14-CAP-945802'],
            },
          });
          (normalized.module_delivery_event_relations as JsonObject[]).push({
            relation_id: 'R14-CAP-945802',
            placement_kind: 'CAPSTONE_COORDINATION',
            target_capstone_id: 'V3-CAP-945802',
            owning_lesson_id: 'V3-LES-000001',
            component_kc_ids: ['V3-KC-000001', 'V3-KC-000002'],
            module_id: 'V3-MOD-000001',
            phase_id: 'V3-PHS-000001',
          });
        },
        crosswalk: (value) => {
          const mappings = value.mappings as JsonObject[];
          mappings.push({
            ...structuredClone(mappings[0]!),
            mapping_id: 'V3-MAP-000002',
            target_id: 'V3-KC-000002',
          });
        },
      }),
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.blockReasons.map((reason) => reason.code)).not.toContain(
      'REQUIRED_KC_UNRESOLVED',
    );
    expect(
      result.audit.attachments.find((attachment) => attachment.id === 'V3-CAP-945802'),
    ).toMatchObject({
      ownerLessonId: 'V3-LES-000001',
      hostScope: { kind: 'MULTI_KC', kcIds: ['V3-KC-000001', 'V3-KC-000002'] },
      declaredHostCoreIds: ['V3-KC-000001', 'V3-KC-000002'],
      hostCoreMembershipStatus: 'RESOLVED',
      creditsKcEvidence: true,
      relationClass: 'CAPSTONE_PLACEMENT',
      relationDirection: 'ATTACHMENT_TO_LESSON',
    });
  });

  it('preserves all three real V3-CAP-945802 host KCs', () => {
    const result = createTaskSourcePacket({
      sources: REAL_SOURCES,
      request: request('V3-LES-006619'),
    });

    expect(result.blockReasons.map((reason) => reason.code)).not.toContain(
      'REQUIRED_KC_UNRESOLVED',
    );
    expect(
      result.audit.attachments.find((attachment) => attachment.id === 'V3-CAP-945802'),
    ).toMatchObject({
      hostScope: {
        kind: 'MULTI_KC',
        kcIds: ['V3-KC-187351', 'V3-KC-010372', 'V3-KC-376473'],
      },
    });
    expect(result.packet).not.toBeNull();
    expect(result.bytes).not.toBeNull();
    expect(result.canonicalAdmissionDiagnostic).toMatchObject({
      admission: 'ADMITTED',
      stage: 'ADMITTED',
      code: 'ADMITTED',
    });
  });

  it('projects a shared capstone on a non-owner lesson as a secondary application', () => {
    const result = createTaskSourcePacket({
      sources: REAL_SOURCES,
      request: request('V3-LES-020428'),
    });
    const attachment = result.audit.attachments.find(
      (row) => row.kind === 'CAPSTONE' && row.ownerLessonId !== result.lessonId,
    );

    expect(attachment).toMatchObject({
      hostScope: {
        kind: 'SECONDARY_APPLICATION',
        primaryLessonId: attachment?.ownerLessonId,
      },
      creditsKcEvidence: false,
      relationDirection: 'LESSON_TO_ATTACHMENT',
    });
    expect(result.status).toBe('READY');
    expect(result.canonicalAdmissionDiagnostic).toMatchObject({
      admission: 'ADMITTED',
      stage: 'ADMITTED',
      code: 'ADMITTED',
    });
  });

  it('reports the old shared-capstone projection as learner-safe semantic diagnostics', () => {
    const result = createTaskSourcePacket({
      sources: REAL_SOURCES,
      request: request('V3-LES-020428'),
    });
    const packet = structuredClone(result.packet) as JsonObject;
    const attachment = (packet.attachments as JsonObject[]).find(
      (row) => row.kind === 'CAPSTONE' && row.owner_lesson_id !== packet.lesson_id,
    )!;
    attachment.host_scope = {
      kind: 'MULTI_KC',
      kc_ids: (attachment.declared_host_core_ids as string[]).filter((kcId) =>
        (packet.ordered_kc_ids as string[]).includes(kcId),
      ),
    };
    attachment.credits_kc_evidence = true;
    attachment.relation_direction = 'ATTACHMENT_TO_LESSON';

    const diagnostic = diagnoseTaskSourcePacketV5({
      bytes: JSON.stringify(packet),
      locator: `${String(packet.lane_id)}/${String(packet.lesson_id).toLowerCase()}`,
    });

    expect(diagnostic).toMatchObject({
      stage: 'SEMANTICS',
      code: 'PACKET_SEMANTICS_INVALID',
      paths: ['/'],
    });
    expect(diagnostic.problems).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/host_scope .* canonical is .*SECONDARY_APPLICATION/),
        expect.stringMatching(/credits_kc_evidence must be false/),
        expect.stringMatching(/relation_direction must be LESSON_TO_ATTACHMENT/),
      ]),
    );
    expect(JSON.stringify(diagnostic)).not.toContain('exact_text');
    expect(JSON.stringify(diagnostic)).not.toContain('raw_passage_text');
  });

  it.each([
    ['V3-LES-191915', 'V3-EXT-647243', ['V3-KC-115894']],
    ['V3-LES-329622', 'V3-EXT-072959', ['V3-KC-922672']],
    ['V3-LES-495267', 'V3-EXT-176907', ['V3-KC-092280', 'V3-KC-102285', 'V3-KC-434142']],
  ])('preserves provisional host lineage for %s / %s', (lessonId, extensionId, declared) => {
    const result = createTaskSourcePacket({
      sources: REAL_SOURCES,
      request: request(lessonId),
    });
    const attachment = result.audit.attachments.find((row) => row.id === extensionId);

    expect(attachment).toMatchObject({
      hostScope: { kind: 'LESSON' },
      declaredHostCoreIds: declared,
      hostCoreMembershipStatus: 'MISMATCH_PROVISIONAL',
      creditsKcEvidence: false,
      correctionRequiredAfterDeadline: true,
    });
    expect(attachment?.lineageNonclaim).toMatch(/credit no knowledge component/i);
  });

  it('rejects an existing capstone relation owned by another attachment and lesson', () => {
    const result = createTaskSourcePacket(
      syntheticInput({
        manifest: (value) => {
          const curriculum = value.curriculum as JsonObject;
          const lesson = (curriculum.lessons as JsonObject[])[0]!;
          lesson.capstone_ids = ['V3-CAP-945802'];
          (curriculum.capstones as JsonObject[]).push({
            capstone_id: 'V3-CAP-945802',
            component_kc_ids: ['V3-KC-000001'],
            owning_lesson_id: 'V3-LES-000001',
            delivery_evidence: {
              source_relation_ids: ['R14-CAP-999999'],
            },
          });
          const normalized = (value.sequence as JsonObject).normalized_relations as JsonObject;
          (normalized.module_delivery_event_relations as JsonObject[]).push({
            relation_id: 'R14-CAP-999999',
            placement_kind: 'CAPSTONE_COORDINATION',
            target_capstone_id: 'V3-CAP-999999',
            owning_lesson_id: 'V3-LES-999999',
          });
        },
      }),
    );

    expect(result.blockReasons.map((reason) => reason.code)).toContain(
      'REQUIRED_SEQUENCE_RELATION_UNRESOLVED',
    );
    expect(result.packet).toBeNull();
    expect(result.bytes).toBeNull();
  });

  it('rejects held/internal-looking prefixes without exact canonical relation records', () => {
    for (const relationId of ['R14-HELD-CAP-SPOOF', 'R14-INTERNAL-SPOOF']) {
      const result = createTaskSourcePacket(
        syntheticInput({
          manifest: (value) => {
            const curriculum = value.curriculum as JsonObject;
            const lesson = (curriculum.lessons as JsonObject[])[0]!;
            lesson.capstone_ids = ['V3-CAP-000001'];
            (curriculum.capstones as JsonObject[]).push({
              capstone_id: 'V3-CAP-000001',
              component_kc_ids: ['V3-KC-000001'],
              owning_lesson_id: 'V3-LES-000001',
              delivery_evidence: { source_relation_ids: [relationId] },
            });
          },
        }),
      );

      expect(result.blockReasons.map((reason) => reason.code)).toContain(
        'REQUIRED_SEQUENCE_RELATION_UNRESOLVED',
      );
      expect(result.packet).toBeNull();
      expect(result.bytes).toBeNull();
    }
  });

  it('resolves exact canonical held and lesson-internal attachment relation records', () => {
    for (const fixture of [
      {
        relationId: 'R14-HELD-CAP-000001',
        collection: 'held_nonrequired_relations',
        relation: {
          relation_id: 'R14-HELD-CAP-000001',
          entity_id: 'V3-CAP-000001',
          entity_type: 'CAPSTONE',
          hold_id: 'V3-HOLD-110002',
          active_sequence_target: false,
          required_delivery: false,
          required_placement: null,
        },
        delivery: {
          hold_id: 'V3-HOLD-110002',
          source_status: 'HELD_NONREQUIRED_OUTSIDE_ACCEPTED_SEQUENCE',
        },
        relationClass: 'HELD_ATTACHMENT',
      },
      {
        relationId: 'R14-INTERNAL-000001',
        collection: 'lesson_internal_order_relations',
        relation: {
          relation_id: 'R14-INTERNAL-000001',
          lesson_id: 'V3-LES-000001',
          grouping_id: 'V3-CL-000001',
          ordered_entity_ids: ['V3-KC-000001', 'V3-CAP-000001'],
          ordered_nested_kc_ids: ['V3-KC-000001'],
          owned_capstone_ids: ['V3-CAP-000001'],
          referenced_capstone_ids: [],
        },
        delivery: {},
        relationClass: 'LESSON_INTERNAL',
      },
    ] as const) {
      const result = createTaskSourcePacket(
        syntheticInput({
          manifest: (value) => {
            const curriculum = value.curriculum as JsonObject;
            const lesson = (curriculum.lessons as JsonObject[])[0]!;
            lesson.capstone_ids = ['V3-CAP-000001'];
            (curriculum.capstones as JsonObject[]).push({
              capstone_id: 'V3-CAP-000001',
              component_kc_ids: ['V3-KC-000001'],
              owning_lesson_id: 'V3-LES-000001',
              delivery_evidence: {
                ...fixture.delivery,
                source_relation_ids: [fixture.relationId],
              },
            });
            const normalized = (value.sequence as JsonObject).normalized_relations as JsonObject;
            normalized[fixture.collection] = [fixture.relation];
          },
        }),
      );

      expect(result.blockReasons.map((reason) => reason.code)).not.toContain(
        'REQUIRED_SEQUENCE_RELATION_UNRESOLVED',
      );
      expect(result.audit.attachments[0]).toMatchObject({
        relationIds: [fixture.relationId],
        relationClass: fixture.relationClass,
      });
    }
  });

  it('resolves the real held and lesson-internal manifest relation fixtures exactly', () => {
    const held = createTaskSourcePacket({
      sources: REAL_SOURCES,
      request: request('V3-LES-078488'),
    });
    const internal = createTaskSourcePacket({
      sources: REAL_SOURCES,
      request: request('V3-LES-006619'),
    });

    expect(
      held.audit.attachments
        .filter((attachment) => ['V3-CAP-537139', 'V3-EXT-703019'].includes(attachment.id))
        .map((attachment) => ({
          id: attachment.id,
          relationClass: attachment.relationClass,
          relationIds: attachment.relationIds,
        })),
    ).toEqual([
      {
        id: 'V3-CAP-537139',
        relationClass: 'HELD_ATTACHMENT',
        relationIds: ['R14-HELD-CAP-537139'],
      },
      {
        id: 'V3-EXT-703019',
        relationClass: 'HELD_ATTACHMENT',
        relationIds: ['R14-HELD-EXT-703019'],
      },
    ]);
    expect(
      internal.blockReasons.filter((reason) =>
        reason.path.endsWith('sequence_relation_refs.internal_order'),
      ),
    ).toEqual([]);
  });

  it('rejects existing phase, module, and pathway relations with unrelated bindings', () => {
    const result = createTaskSourcePacket(
      syntheticInput({
        manifest: (value) => {
          const lesson = ((value.curriculum as JsonObject).lessons as JsonObject[])[0]!;
          const sequence = value.sequence as JsonObject;
          const phase = (sequence.phases as JsonObject[])[0]!;
          const module = (sequence.modules as JsonObject[])[0]!;
          const normalized = sequence.normalized_relations as JsonObject;
          (phase.placement_projection as JsonObject).source_relation_ids = ['R14-PP-999999-1'];
          (module.placement_projection as JsonObject).source_relation_ids = ['R14-PM-99'];
          (lesson.pathway_positions as JsonObject[])[0]!.source_relation_ids = [
            'R14-PL-999999-001',
          ];
          (normalized.pathway_phase_relations as JsonObject[]).push({
            pathway_id: 'V3-PTH-999999',
            phase_id: 'V3-PHS-999999',
            relation_id: 'R14-PP-999999-1',
          });
          (normalized.phase_module_relations as JsonObject[]).push({
            module_id: 'V3-MOD-999999',
            phase_id: 'V3-PHS-999999',
            relation_id: 'R14-PM-99',
          });
          (normalized.pathway_lesson_scope_relations as JsonObject[]).push({
            lesson_id: 'V3-LES-999999',
            pathway_id: 'V3-PTH-999999',
            relation_id: 'R14-PL-999999-001',
          });
        },
      }),
    );

    expect(result.blockReasons.map((reason) => reason.code)).toContain(
      'REQUIRED_SEQUENCE_RELATION_UNRESOLVED',
    );
    expect(result.packet).toBeNull();
    expect(result.bytes).toBeNull();
  });
});

describe('supervisor-corrected production hold behavior', () => {
  it.each([
    {
      holdId: 'V3-HOLD-110002',
      sentinel: 'SENTINEL p.89 stem-cell CNS-regeneration wording-specific claim',
    },
    {
      holdId: 'V3-HOLD-110010',
      sentinel: 'SENTINEL p.91 conditional-reinforcement wording-specific claim',
    },
  ])('executes $holdId exclusion before source projection', ({ holdId, sentinel }) => {
    const result = createTaskSourcePacket(
      syntheticInput({
        manifest: (value) => {
          const curriculum = value.curriculum as JsonObject;
          const lesson = (curriculum.lessons as JsonObject[])[0]!;
          (lesson.unresolved_holds as string[]).push(holdId);
          (curriculum.holds as JsonObject[]).push({
            hold_id: holdId,
            issue: 'Synthetic held wording.',
            status: 'OPEN',
            type: holdId === 'V3-HOLD-110002' ? 'PAGE_89_SCOPE' : 'AAMC_PAGE_91_TERMINOLOGY',
          });
        },
        crosswalk: (value) => {
          const occurrences = value.source_occurrences as JsonObject[];
          occurrences.push({
            ...structuredClone(occurrences[0]!),
            source_occurrence_id: 'V3-SRC-100002',
            official_topic: sentinel,
            source_summary: sentinel,
            exact_text: sentinel,
          });
          const mapping = (value.mappings as JsonObject[])[0]!;
          mapping.source_occurrence_ids = ['V3-SRC-100001', 'V3-SRC-100002'];
          mapping.direct_source_occurrence_ids = ['V3-SRC-100001', 'V3-SRC-100002'];
        },
      }),
    );

    expect(result.status).toBe('BLOCKED');
    expect(JSON.stringify(result.audit)).not.toContain(sentinel);
    expect(result.packet).toBeNull();
    expect(result.bytes).toBeNull();
  });

  it('executes 110006 three-KC boundary and aggregate-exclusion invariants', () => {
    const sentinel = 'SENTINEL alternate boundary aggregate diagnostic interpretation';
    const result = createTaskSourcePacket(
      syntheticInput({
        manifest: (value) => {
          const curriculum = value.curriculum as JsonObject;
          const lesson = (curriculum.lessons as JsonObject[])[0]!;
          const kcs = curriculum.kcs as JsonObject[];
          const grouping = (curriculum.groupings as JsonObject[])[0]!;
          for (const suffix of ['000002', '000003']) {
            kcs.push({
              ...structuredClone(kcs[0]!),
              kc_id: `V3-KC-${suffix}`,
              display_label: `Synthetic KC ${suffix}`,
            });
          }
          lesson.nested_kc_ids = ['V3-KC-000001', 'V3-KC-000002', 'V3-KC-000003'];
          lesson.nested_kc_labels = ['Synthetic KC 1', 'Synthetic KC 2', 'Synthetic KC 3'];
          lesson.ordered_required_kc_ids = ['V3-KC-000001', 'V3-KC-000002', 'V3-KC-000003'];
          (lesson.unresolved_holds as string[]).push('V3-HOLD-110006');
          grouping.member_kc_ids = ['V3-KC-000001', 'V3-KC-000002', 'V3-KC-000003'];
          const normalized = (value.sequence as JsonObject).normalized_relations as JsonObject;
          const internal = (normalized.lesson_internal_order_relations as JsonObject[])[0]!;
          internal.ordered_entity_ids = ['V3-KC-000001', 'V3-KC-000002', 'V3-KC-000003'];
          internal.ordered_nested_kc_ids = ['V3-KC-000001', 'V3-KC-000002', 'V3-KC-000003'];
          (curriculum.holds as JsonObject[]).push({
            hold_id: 'V3-HOLD-110006',
            issue: 'Synthetic frozen boundary.',
            status: 'OPEN',
            type: 'DEC_370451_EMPIRICAL_BOUNDARY',
          });
        },
        crosswalk: (value) => {
          const occurrences = value.source_occurrences as JsonObject[];
          occurrences.push({
            ...structuredClone(occurrences[0]!),
            source_occurrence_id: 'V3-SRC-100002',
            official_topic: sentinel,
            source_summary: sentinel,
          });
          const mappings = value.mappings as JsonObject[];
          mappings[0]!.source_occurrence_ids = ['V3-SRC-100001', 'V3-SRC-100002'];
          mappings[0]!.direct_source_occurrence_ids = ['V3-SRC-100001', 'V3-SRC-100002'];
          for (const [index, kcId] of ['V3-KC-000002', 'V3-KC-000003'].entries()) {
            mappings.push({
              ...structuredClone(mappings[0]!),
              mapping_id: `V3-MAP-00000${index + 2}`,
              target_id: kcId,
              source_occurrence_ids: ['V3-SRC-100001'],
              direct_source_occurrence_ids: ['V3-SRC-100001'],
            });
          }
        },
      }),
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.audit.orderedKcs.map((kc) => kc.kcId)).toEqual([
      'V3-KC-000001',
      'V3-KC-000002',
      'V3-KC-000003',
    ]);
    expect(JSON.stringify(result.audit)).not.toContain(sentinel);
    expect(result.bytes).toBeNull();
  });

  it.each([
    ['V3-LES-078488', 'V3-HOLD-110002', 'OMIT_AMBIGUOUS_NONREQUIRED_P89_PHRASE'],
    ['V3-LES-251056', 'V3-HOLD-110006', 'USE_FROZEN_CANONICAL_THREE_KC_BOUNDARY'],
    ['V3-LES-225658', 'V3-HOLD-110010', 'EXCLUDE_DISPUTED_P91_WORDING'],
  ])('applies the safe deadline default for %s', (lessonId, holdId, code) => {
    const result = createTaskSourcePacket({
      sources: REAL_SOURCES,
      request: request(lessonId),
    });
    const hold = result.audit.holds.find((candidate) => candidate.holdId === holdId);

    expect(hold).toMatchObject({
      classification: 'SAFE_INTERIM_DEFAULT',
      safeInterimCode: code,
      blocksAuthoring: false,
    });
    expect(
      result.blockReasons.some(
        (reason) => reason.code === 'REQUIRED_DECISION_UNRESOLVED' && reason.path.includes(holdId),
      ),
    ).toBe(false);
    const factualSources = JSON.stringify(result.audit.orderedKcs);
    if (holdId === 'V3-HOLD-110002') {
      expect(factualSources).not.toMatch(/stem.?cell|CNS.?regeneration/i);
    }
    if (holdId === 'V3-HOLD-110010') {
      expect(factualSources).not.toMatch(/conditional.?reinforcement/i);
    }
  });

  it('keeps CARS 110007 and universal 110008 contextual', () => {
    const result = createTaskSourcePacket({
      sources: REAL_SOURCES,
      request: request('V3-LES-191933'),
    });
    const byId = Object.fromEntries(result.audit.holds.map((hold) => [hold.holdId, hold]));

    expect(result.audit.identity.sourceSections).toContain('CARS');
    expect(byId['V3-HOLD-110007']).toMatchObject({
      classification: 'CONTEXTUAL_NONBLOCKING',
      blocksAuthoring: false,
    });
    expect(byId['V3-HOLD-110008']).toMatchObject({
      classification: 'CONTEXTUAL_NONBLOCKING',
      blocksAuthoring: false,
    });
  });
});

describe('worked production packet V3-LES-006619', () => {
  it('builds the exact cross-section authoring audit and passes production admission', () => {
    const result = createTaskSourcePacket({
      sources: REAL_SOURCES,
      request: request('V3-LES-006619'),
    });

    expect(result.audit.identity).toMatchObject({
      canonicalTitle: 'Coordinate endocrine and cellular signaling',
      shortAlias: 'Endocrine Signaling',
      lessonType: 'CORE',
      groupingId: 'V3-CL-006619',
      sourceSections: ['Bio/Biochem', 'Chem/Phys'],
    });
    expect(result.audit.orderedKcs.map((kc) => kc.kcId)).toEqual([
      'V3-KC-187351',
      'V3-KC-010372',
      'V3-KC-376473',
    ]);
    expect(result.audit.orderedKcs.every((kc) => kc.sourceOccurrences.length > 0)).toBe(true);
    expect(result.audit.prerequisites.hard).toMatchObject([
      {
        lessonId: 'V3-LES-474771',
        sourceKcIds: ['V3-KC-446820', 'V3-KC-937306'],
      },
    ]);
    expect(result.audit.prerequisites.hard[0]!.relationIds.length).toBeGreaterThan(0);
    expect(result.blockReasons.map((reason) => reason.code)).not.toContain(
      'PREREQUISITE_RELATION_UNRESOLVED',
    );
    expect(JSON.stringify(result.audit.orderedKcs)).not.toContain('exact_text');
    expect(result.status).toBe('READY');
    expect(result.blockReasons).toEqual([]);
    expect(result.blockReasons.map((reason) => reason.code)).not.toContain(
      'WP01_SCHEMA_CANONICAL_ID_INCOMPATIBLE',
    );
    expect(result.packet).not.toBeNull();
  });

  it('resolves prerequisite graph relations against this lesson’s explicit entity set', () => {
    const result = createTaskSourcePacket({
      sources: REAL_SOURCES,
      request: request('V3-LES-095827'),
    });

    expect(result.audit.prerequisites.hard.map((entry) => entry.lessonId)).toEqual([
      'V3-LES-191933',
      'V3-LES-556584',
    ]);
    expect(result.audit.prerequisites.hard.every((entry) => entry.relationIds.length > 0)).toBe(
      true,
    );
    expect(result.blockReasons.map((reason) => reason.code)).not.toContain(
      'PREREQUISITE_RELATION_UNRESOLVED',
    );
  });

  it('treats real shared-SIRS multi-exact mappings as corroboration', () => {
    const result = createTaskSourcePacket({
      sources: REAL_SOURCES,
      request: request('V3-LES-128144'),
    });

    expect(result.audit.identity.sourceSections).toEqual(['B/B', 'C/P', 'P/S']);
    expect(
      result.audit.orderedKcs.some((kc) => kc.sourceSetStatus === 'MULTI_SOURCE_CORROBORATED'),
    ).toBe(true);
    expect(result.blockReasons.map((reason) => reason.code)).not.toContain(
      'SOURCE_MAPPING_CONTRADICTION',
    );
  });
});

describe('schema and hash verification', () => {
  it('withholds locally valid synthetic diagnostics from production serialization', () => {
    const result = createTaskSourcePacket(syntheticInput());

    expect(result.status).toBe('BLOCKED');
    expect(result.blockReasons.map((reason) => reason.code)).toContain(
      'WP01_CANONICAL_ADMISSION_FAILED',
    );
    expect(result.packet).toBeNull();
    expect(result.bytes).toBeNull();
  });

  it('reports the production authority rejection as non-authoritative local diagnostics', () => {
    const result = createTaskSourcePacket(syntheticInput());

    expect(result.audit.orderedKcs).toHaveLength(1);
    expect(result.blockReasons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'WP01_CANONICAL_ADMISSION_FAILED',
          path: 'canonical_admission',
        }),
      ]),
    );
  });

  it('refuses schema drift and packet hash mismatch', () => {
    const input = syntheticInput();
    const schema = JSON.parse(input.sources.taskPacketSchemaText) as JsonObject;
    (schema.required as unknown[]).push('new_required_pin');
    (schema.properties as JsonObject).new_required_pin = {
      type: 'string',
      minLength: 1,
    };
    const schemaDrift = createTaskSourcePacket({
      ...input,
      sources: pinSources({
        ...input.sources,
        taskPacketSchemaText: JSON.stringify(schema),
      }),
    });

    expect(schemaDrift.blockReasons.map((reason) => reason.code)).toContain(
      'WP01_SCHEMA_VALIDATION_FAILED',
    );
    expect(schemaDrift.status).toBe('BLOCKED');
    expect(schemaDrift.packet).toBeNull();
    expect(schemaDrift.bytes).toBeNull();
    expect(schemaDrift.packetContentSha256).toBeNull();
    expect(schemaDrift.packetFileSha256).toBeNull();
    const packet = {
      ordered_kc_ids: [],
      source_documents: [],
      applicable_routes: [],
    } as TaskSourcePacket;
    const bytes = `${JSON.stringify(packet)}\n`;
    expect(() =>
      verifyPacketArtifact({
        packet,
        bytes: `${bytes} `,
        expectedContentSha256: sha256(canonicalPacketJson(packet)),
        expectedFileSha256: sha256(bytes),
      }),
    ).toThrow(/PACKET_HASH_MISMATCH/);
  });

  it('does not serialize synthetic quarantine that production admission cannot verify', () => {
    const input = syntheticInput({
      crosswalk: (value) => {
        value.mappings = [];
      },
    });
    const blocked = createTaskSourcePacket(input);

    expect(blocked.packet).toBeNull();
    expect(blocked.bytes).toBeNull();
    expect(blocked.packetContentSha256).toBeNull();
    expect(blocked.packetFileSha256).toBeNull();
    expect(blocked.quarantineRecord).toBeNull();
    expect(blocked.quarantineBytes).toBeNull();
    expect(blocked.quarantineContentSha256).toBeNull();
    expect(blocked.quarantineFileSha256).toBeNull();
    expect(blocked.quarantinePath).toBeNull();
    expect(blocked.blockReasons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'SOURCE_MAPPING_MISSING',
          path: '/ordered_kc_records/0/source_mappings',
        }),
      ]),
    );
  });
});

describe('research checkout resolution', () => {
  it('prefers MCAT_RESEARCH_DIR and falls back to the workspace sibling', () => {
    const customRoot = '/custom/research';
    const customPaths = new Set([
      join(customRoot, 'mcat-curriculum-architecture-v3/v3-source-crosswalk.json'),
      join(
        customRoot,
        'mcat-curriculum-architecture-v3/skill-integrated-knowledge-graph/work/research-evidence-registry.json',
      ),
    ]);
    const siblingRoot = '/workspace/research';
    const siblingPaths = new Set([
      join(siblingRoot, 'mcat-curriculum-architecture-v3/v3-source-crosswalk.json'),
      join(
        siblingRoot,
        'mcat-curriculum-architecture-v3/skill-integrated-knowledge-graph/work/research-evidence-registry.json',
      ),
    ]);

    expect(
      resolvePacketResearchPaths({
        repositoryRoot: '/workspace/mcat-prep',
        envResearchDir: customRoot,
        pathExists: (path) => customPaths.has(path),
        readText: () => '{}',
      }).researchRoot,
    ).toBe(customRoot);
    expect(
      resolvePacketResearchPaths({
        repositoryRoot: '/workspace/mcat-prep',
        pathExists: (path) => siblingPaths.has(path),
        readText: () => '{}',
      }).researchRoot,
    ).toBe(siblingRoot);
  });

  it('names both required missing sibling files and attempted roots', () => {
    expect(() =>
      resolvePacketResearchPaths({
        repositoryRoot: '/workspace/mcat-prep',
        envResearchDir: '/missing/custom',
        pathExists: () => false,
      }),
    ).toThrow(
      /required sibling research.*v3-source-crosswalk\.json.*research-evidence-registry\.json.*\/missing\/custom.*\/workspace\/research/is,
    );
  });

  it('rejects sibling research files that exist but are unreadable or empty', () => {
    expect(() =>
      resolvePacketResearchPaths({
        repositoryRoot: '/workspace/mcat-prep',
        pathExists: () => true,
        readText: (path) => {
          if (path.endsWith('v3-source-crosswalk.json')) return '   ';
          throw new Error('permission denied');
        },
      }),
    ).toThrow(/required sibling research file.*readable and non-empty.*v3-source-crosswalk/is);
  });
});

describe('createTaskSourcePackets', () => {
  it('rejects duplicate request identity and reports exact READY/BLOCKED counts', () => {
    const batch = createTaskSourcePackets({
      sources: syntheticSources(),
      requests: [
        request('V3-LES-000001'),
        request('V3-LES-000001', {
          requestId: 'lesson-factory-deadline-2026-08-03-request-02',
        }),
      ],
    });

    expect(batch.readyCount).toBe(0);
    expect(batch.blockedCount).toBe(2);
    expect(
      batch.results.flatMap((result) => result.blockReasons.map((reason) => reason.code)),
    ).toContain('DUPLICATE_ASSIGNMENT_IDENTITY');
    expect(batch.files).toEqual({});
  });

  it('emits no authorable file set when any required request is blocked', () => {
    const batch = createTaskSourcePackets({
      sources: syntheticSources(),
      requests: [request('V3-LES-000001'), request('V3-LES-999999')],
    });

    expect(batch.results.map((result) => result.status)).toEqual(['BLOCKED', 'BLOCKED']);
    expect(batch.readyCount).toBe(0);
    expect(batch.blockedCount).toBe(2);
    expect(batch.files).toEqual({});
    expect(batch.outputSetSha256).toBe(sha256(canonicalPacketJson({})));
  });
});

describe('all 111 explicit production packet requests', () => {
  it('admits every production candidate through the module-owned canonical admission', () => {
    const manifest = JSON.parse(REAL_SOURCES.curriculumManifestText) as JsonObject;
    const curriculum = manifest.curriculum as JsonObject;
    const allocationProof = JSON.parse(readFileSync(PARTITION_PROOF_PATH, 'utf8')) as JsonObject;
    const excluded = new Set(['V3-LES-130923', 'V3-LES-789208', 'V3-LES-844372']);
    const lessonIds = (curriculum.lessons as JsonObject[])
      .map((row) => String(row.lesson_id))
      .filter((lessonId) => !excluded.has(lessonId));
    const assignmentRows = (
      allocationProof.assignments as Array<{
        rows: Array<{
          lesson_id: string;
          output_path: string;
        }>;
      }>
    ).flatMap((assignment) => assignment.rows);
    const started = performance.now();
    const batch = createTaskSourcePackets({
      sources: REAL_SOURCES,
      requests: assignmentRows.map((row) => request(row.lesson_id)),
    });
    const secondBatch = createTaskSourcePackets({
      sources: REAL_SOURCES,
      requests: assignmentRows.map((row) => request(row.lesson_id)),
    });
    const elapsedMs = Math.round((performance.now() - started) * 100) / 100;
    const reasonCounts: Record<string, number> = {};
    const reasonLessonIds: Record<string, string[]> = {};
    for (const result of batch.results) {
      for (const reason of result.blockReasons) {
        reasonCounts[reason.code] = (reasonCounts[reason.code] ?? 0) + 1;
        const ids = reasonLessonIds[reason.code] ?? [];
        if (!ids.includes(result.lessonId)) ids.push(result.lessonId);
        reasonLessonIds[reason.code] = ids;
      }
    }
    const summary = {
      lessonCount: lessonIds.length,
      readyCount: batch.readyCount,
      blockedCount: batch.blockedCount,
      fileCount: Object.keys(batch.files).length,
      assignmentCounts: Object.fromEntries(
        (
          allocationProof.assignments as Array<{
            team_id: string;
            count: number;
          }>
        ).map((assignment) => [assignment.team_id, assignment.count]),
      ),
      elapsedMs,
      outputSetSha256: batch.outputSetSha256,
      readyIds: batch.results
        .filter((result) => result.status === 'READY')
        .map((result) => result.lessonId),
      reasonCounts,
      reasonPacketCounts: Object.fromEntries(
        Object.entries(reasonLessonIds).map(([code, ids]) => [code, ids.length]),
      ),
      nonUniversalReasonLessonIds: Object.fromEntries(
        Object.entries(reasonLessonIds).filter(([, ids]) => ids.length < 111),
      ),
      inputHashes: batch.results[0]?.audit.inputHashes,
    };

    console.log(`WP04_ALL_PACKET_SUMMARY ${JSON.stringify(summary)}`);
    expect(
      batch.results.flatMap((result) => result.canonicalAdmissionDiagnostic?.problems ?? []),
    ).toEqual([]);
    const attachmentHostLessonIds = [
      'V3-LES-006619',
      'V3-LES-020428',
      'V3-LES-034099',
      'V3-LES-041222',
      'V3-LES-067950',
      'V3-LES-078488',
      'V3-LES-083939',
      'V3-LES-094421',
      'V3-LES-095827',
      'V3-LES-128144',
      'V3-LES-134007',
      'V3-LES-149941',
      'V3-LES-151730',
      'V3-LES-156118',
      'V3-LES-163162',
      'V3-LES-191915',
      'V3-LES-191933',
      'V3-LES-207028',
      'V3-LES-217547',
      'V3-LES-222431',
      'V3-LES-225658',
      'V3-LES-252091',
      'V3-LES-253783',
      'V3-LES-258629',
      'V3-LES-264096',
      'V3-LES-269427',
      'V3-LES-282413',
      'V3-LES-315313',
      'V3-LES-320512',
      'V3-LES-323416',
      'V3-LES-329622',
      'V3-LES-338400',
      'V3-LES-349092',
      'V3-LES-385880',
      'V3-LES-386478',
      'V3-LES-403395',
      'V3-LES-404423',
      'V3-LES-443492',
      'V3-LES-473390',
      'V3-LES-485905',
      'V3-LES-489818',
      'V3-LES-495267',
      'V3-LES-505131',
      'V3-LES-515867',
      'V3-LES-522245',
      'V3-LES-540203',
      'V3-LES-548488',
      'V3-LES-556584',
      'V3-LES-560768',
      'V3-LES-563427',
      'V3-LES-567976',
      'V3-LES-603825',
      'V3-LES-615860',
      'V3-LES-631100',
      'V3-LES-631070',
      'V3-LES-684434',
      'V3-LES-697045',
      'V3-LES-704363',
      'V3-LES-712077',
      'V3-LES-715826',
      'V3-LES-765609',
      'V3-LES-771227',
      'V3-LES-772297',
      'V3-LES-773665',
      'V3-LES-774232',
      'V3-LES-774377',
      'V3-LES-788522',
      'V3-LES-801639',
      'V3-LES-804390',
      'V3-LES-811780',
      'V3-LES-817478',
      'V3-LES-825706',
      'V3-LES-839816',
      'V3-LES-865559',
      'V3-LES-915978',
      'V3-LES-930899',
      'V3-LES-949725',
      'V3-LES-953302',
      'V3-LES-990746',
    ].sort();
    const attachmentRelationLessonIds = ['V3-LES-006619', 'V3-LES-078488', 'V3-LES-915978'];
    expect(lessonIds).toHaveLength(111);
    expect(assignmentRows.map((row) => row.lesson_id).sort()).toEqual(lessonIds.sort());
    expect(summary.assignmentCounts).toEqual({ primary: 51, 'team-A': 30, 'team-B': 30 });
    expect(batch.readyCount).toBe(111);
    expect(batch.blockedCount).toBe(0);
    expect(Object.keys(batch.files)).toHaveLength(111);
    expect(secondBatch.outputSetSha256).toBe(batch.outputSetSha256);
    expect(secondBatch.results).toEqual(batch.results);
    expect(reasonCounts).toEqual({});
    expect(summary.reasonPacketCounts).toEqual({});
    expect(summary.nonUniversalReasonLessonIds).toEqual({});
    expect(attachmentHostLessonIds).toHaveLength(79);
    expect(attachmentRelationLessonIds).toHaveLength(3);
    for (const result of batch.results) {
      expect(result.packet).not.toBeNull();
      expect(result.bytes).not.toBeNull();
      expect(result.packetContentSha256).not.toBeNull();
      expect(result.packetFileSha256).not.toBeNull();
      expect(result.quarantineRecord).toBeNull();
      expect(result.quarantineBytes).toBeNull();
      expect(result.quarantineContentSha256).toBeNull();
      expect(result.quarantineFileSha256).toBeNull();
      expect(result.quarantinePath).toBeNull();
      expect(result.scopeClassification).toBe('IN_SCOPE');
      expect(result.blockReasons).toEqual([]);
      expect(result.canonicalAdmissionDiagnostic).toMatchObject({
        admission: 'ADMITTED',
        validator: 'PACKET_SEMANTICS_V1',
        status: 'PASS',
        errorCount: 0,
        stage: 'ADMITTED',
        code: 'ADMITTED',
        paths: [],
        problems: [],
      });
    }
    const serializedResults = JSON.stringify(batch.results);
    expect(serializedResults).not.toContain('SENTINEL');
    expect(serializedResults).not.toContain('exact_text');
    expect(serializedResults).not.toContain('raw_passage_text');
    for (const result of batch.results.filter((candidate) => candidate.status === 'READY')) {
      expect(
        validateTaskSourcePacket(
          result.packet,
          REAL_SOURCES.taskPacketSchemaText,
          REAL_SOURCES.sharedVocabularySchemaText,
        ),
      ).toEqual([]);
    }
  }, 120_000);
});

describe('all 114 canonical packet requests', () => {
  it('classifies proof-absent existing lessons without fabricating packet identities', () => {
    const manifest = JSON.parse(REAL_SOURCES.curriculumManifestText) as JsonObject;
    const lessonIds = ((manifest.curriculum as JsonObject).lessons as JsonObject[]).map((row) =>
      String(row.lesson_id),
    );
    const batch = createTaskSourcePackets({
      sources: REAL_SOURCES,
      requests: lessonIds.map((lessonId) => request(lessonId)),
    });
    const reasonCounts: Record<string, number> = {};
    const reasonLessons = new Map<string, Set<string>>();
    for (const result of batch.results) {
      for (const reason of result.blockReasons) {
        reasonCounts[reason.code] = (reasonCounts[reason.code] ?? 0) + 1;
        const lessons = reasonLessons.get(reason.code) ?? new Set<string>();
        lessons.add(result.lessonId);
        reasonLessons.set(reason.code, lessons);
      }
    }

    console.log(
      `WP04_ALL_114_SUMMARY ${JSON.stringify({
        readyCount: batch.readyCount,
        blockedCount: batch.blockedCount,
        reasonCounts,
        reasonLessonCounts: Object.fromEntries(
          [...reasonLessons].map(([code, lessons]) => [code, lessons.size]),
        ),
      })}`,
    );
    expect(lessonIds).toHaveLength(114);
    expect(batch.readyCount).toBe(111);
    expect(batch.blockedCount).toBe(3);
    expect(batch.files).toEqual({});
    expect(reasonCounts).toEqual({
      ASSIGNMENT_IDENTITY_MISMATCH: 3,
    });
    expect(
      Object.fromEntries([...reasonLessons].map(([code, lessons]) => [code, lessons.size])),
    ).toEqual({
      ASSIGNMENT_IDENTITY_MISMATCH: 3,
    });
    expect(
      batch.results
        .filter(
          (result) =>
            result.blockReasons.filter((reason) => reason.code === 'ASSIGNMENT_IDENTITY_MISMATCH')
              .length === 1,
        )
        .map((result) => result.lessonId)
        .sort(),
    ).toEqual(['V3-LES-130923', 'V3-LES-789208', 'V3-LES-844372']);
    expect(
      batch.results
        .filter((result) => result.status === 'READY')
        .every(
          (result) =>
            result.packet !== null &&
            result.bytes !== null &&
            result.packetContentSha256 !== null &&
            result.packetFileSha256 !== null &&
            result.canonicalAdmissionDiagnostic?.admission === 'ADMITTED' &&
            result.canonicalAdmissionDiagnostic.status === 'PASS',
        ),
    ).toBe(true);
    expect(
      batch.results
        .filter((result) => result.status === 'BLOCKED')
        .every(
          (result) =>
            result.packet === null &&
            result.bytes === null &&
            result.packetContentSha256 === null &&
            result.packetFileSha256 === null &&
            result.quarantineRecord === null &&
            result.quarantineBytes === null &&
            result.quarantineContentSha256 === null &&
            result.quarantineFileSha256 === null &&
            result.quarantinePath === null,
        ),
    ).toBe(true);
    expect(
      batch.results
        .filter((result) => result.scopeClassification === 'OUT_OF_SCOPE_EXISTING')
        .map((result) => result.lessonId)
        .sort(),
    ).toEqual(['V3-LES-130923', 'V3-LES-789208', 'V3-LES-844372']);
    expect(
      batch.results
        .filter((result) => result.scopeClassification === 'OUT_OF_SCOPE_EXISTING')
        .every((result) => result.blockReasons.length === 1),
    ).toBe(true);
  }, 120_000);
});
