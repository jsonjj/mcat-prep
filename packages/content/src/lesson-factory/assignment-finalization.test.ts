import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import * as lessonFactory from './assignment-partition';

type JsonObject = Record<string, unknown>;

interface AllocationRow {
  readonly lesson_id: string;
  readonly source_section_bucket: string;
  readonly slug: string;
  readonly output_path: string;
  readonly assignment_id: string;
  readonly team_id: 'primary' | 'team-A' | 'team-B';
  readonly lane_id: string;
}

interface AllocationResult {
  readonly allocations: readonly {
    readonly teamId: AllocationRow['team_id'];
    readonly laneId: string;
    readonly assignmentId: string;
    readonly rows: readonly AllocationRow[];
  }[];
  readonly proof: JsonObject & {
    readonly contract_version: string;
    readonly run_id: string;
    readonly deadline_profile_ref: string;
    readonly release_policy_ref: string;
    readonly assignment_schema: JsonObject;
    readonly proof_schema: JsonObject;
    readonly packet_authorities: Record<string, JsonObject>;
  };
  readonly proofBytes: string;
}

interface FinalizationResult {
  readonly assignments: readonly {
    readonly manifest: JsonObject;
    readonly bytes: string;
    readonly rows: readonly AllocationRow[];
  }[];
  readonly files: Readonly<Record<string, string>>;
  readonly outputSetSha256: string;
}

interface DesiredApi {
  createAssignmentAllocation(input: JsonObject): AllocationResult;
  finalizeAssignmentManifests(input: JsonObject): FinalizationResult;
  parseAssignmentPartitionProof(input: JsonObject): {
    readonly proof: JsonObject;
    readonly generationRows: readonly AllocationRow[];
    readonly excludedExistingLessonIds: readonly string[];
  };
  validateAssignmentPartitionProof(
    document: unknown,
    proofSchemaText: string,
    sharedSchemaText: string,
  ): string[];
  validateAssignmentManifest(
    document: unknown,
    assignmentSchemaText: string,
    sharedSchemaText: string,
  ): string[];
}

const api = lessonFactory as unknown as DesiredApi;
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const read = (relativePath: string): string => readFileSync(join(REPO_ROOT, relativePath), 'utf8');
const sha256 = (text: string): string =>
  createHash('sha256').update(Buffer.from(text, 'utf8')).digest('hex');

const MANIFEST_REL = 'curriculum/v3/v3-lesson-authoring-manifest.json';
const ASSIGNMENT_SCHEMA_REL = 'content/lesson-factory/schemas/assignment-manifest.schema.json';
const PROOF_SCHEMA_REL = 'content/lesson-factory/schemas/assignment-partition-proof.schema.json';
const SHARED_SCHEMA_REL = 'content/lesson-factory/schemas/shared-vocabulary.schema.json';
const TASK_PACKET_SCHEMA_REL = 'content/lesson-factory/schemas/task-source-packet.schema.json';
const PROFILE_REL = 'content/lesson-factory/deadline-profile/deadline-profile.json';
const POLICY_REL = 'content/lesson-factory/deadline-profile/release-policy.json';
const SOURCE_USE_RECEIPT_REL =
  'content/lesson-factory/deadline-profile/owner-source-use-receipt.json';

const MANIFEST_TEXT = read(MANIFEST_REL);
const ASSIGNMENT_SCHEMA_TEXT = read(ASSIGNMENT_SCHEMA_REL);
const SHARED_SCHEMA_TEXT = read(SHARED_SCHEMA_REL);
const TASK_PACKET_SCHEMA_TEXT = read(TASK_PACKET_SCHEMA_REL);
const PROFILE_TEXT = read(PROFILE_REL);
const POLICY_TEXT = read(POLICY_REL);
const SOURCE_USE_RECEIPT_TEXT = read(SOURCE_USE_RECEIPT_REL);
const PROOF_SCHEMA_TEXT = existsSync(join(REPO_ROOT, PROOF_SCHEMA_REL))
  ? read(PROOF_SCHEMA_REL)
  : '';
const PROFILE = JSON.parse(PROFILE_TEXT) as JsonObject;

function allocationInput(): JsonObject {
  return {
    manifestText: MANIFEST_TEXT,
    assignmentSchemaText: ASSIGNMENT_SCHEMA_TEXT,
    proofSchemaText: PROOF_SCHEMA_TEXT,
    sharedVocabularySchemaText: SHARED_SCHEMA_TEXT,
    taskPacketSchemaText: TASK_PACKET_SCHEMA_TEXT,
    deadlineProfileText: PROFILE_TEXT,
    releasePolicyText: POLICY_TEXT,
    ownerSourceUseReceiptText: SOURCE_USE_RECEIPT_TEXT,
    sourceManifestPath: MANIFEST_REL,
    assignmentSchemaPath: ASSIGNMENT_SCHEMA_REL,
    proofSchemaPath: PROOF_SCHEMA_REL,
    sharedVocabularySchemaPath: SHARED_SCHEMA_REL,
    taskPacketSchemaPath: TASK_PACKET_SCHEMA_REL,
    deadlineProfilePath: PROFILE_REL,
    releasePolicyPath: POLICY_REL,
    ownerSourceUseReceiptPath: SOURCE_USE_RECEIPT_REL,
    createdAt: PROFILE.frozen_at,
    deadlineProfileRef: `profile:${PROFILE_REL}#sha256:${sha256(PROFILE_TEXT)}`,
    releasePolicyRef: `policy:${POLICY_REL}#sha256:${sha256(POLICY_TEXT)}`,
    rubricIdentity: PROFILE.rubric_identity,
  };
}

function allocation(): AllocationResult {
  return api.createAssignmentAllocation(allocationInput());
}

function packetRefs(result: AllocationResult): Record<string, string> {
  return Object.fromEntries(
    result.allocations.flatMap((group) =>
      group.rows.map((row) => [
        row.lesson_id,
        `packet:${row.lane_id}/${row.slug}#sha256:${sha256(`packet:${row.lane_id}:${row.lesson_id}`)}`,
      ]),
    ),
  );
}

function finalizationInput(result: AllocationResult, refs: Record<string, string>): JsonObject {
  return {
    allocationProof: result.proof,
    manifestText: MANIFEST_TEXT,
    assignmentSchemaText: ASSIGNMENT_SCHEMA_TEXT,
    proofSchemaText: PROOF_SCHEMA_TEXT,
    sharedVocabularySchemaText: SHARED_SCHEMA_TEXT,
    taskPacketSchemaText: TASK_PACKET_SCHEMA_TEXT,
    deadlineProfileText: PROFILE_TEXT,
    releasePolicyText: POLICY_TEXT,
    ownerSourceUseReceiptText: SOURCE_USE_RECEIPT_TEXT,
    packetRefs: refs,
  };
}

function parserInput(proof: JsonObject): JsonObject {
  const input = allocationInput();
  return {
    allocationProof: proof,
    manifestText: input.manifestText,
    assignmentSchemaText: input.assignmentSchemaText,
    proofSchemaText: input.proofSchemaText,
    sharedVocabularySchemaText: input.sharedVocabularySchemaText,
    taskPacketSchemaText: input.taskPacketSchemaText,
    deadlineProfileText: input.deadlineProfileText,
    releasePolicyText: input.releasePolicyText,
    ownerSourceUseReceiptText: input.ownerSourceUseReceiptText,
  };
}

describe('final WP-02 allocation contract', () => {
  it('exposes separate allocation and finalization APIs', () => {
    expect(typeof api.createAssignmentAllocation).toBe('function');
    expect(typeof api.finalizeAssignmentManifests).toBe('function');
    expect(typeof api.parseAssignmentPartitionProof).toBe('function');
    expect(typeof api.validateAssignmentPartitionProof).toBe('function');
  });

  it('pins packet-v5 authorities, current refs, run ID, and canonical assignment IDs', () => {
    expect(PROOF_SCHEMA_TEXT).not.toBe('');
    const result = allocation();
    const proof = result.proof;

    expect(result.proof.contract_version).toBe('2.0.0');
    expect(result.proof.assignment_schema.contract_version).toBe('3.0.0');
    expect(result.proof.proof_schema.contract_version).toBe('2.0.0');
    expect(proof.run_id).toBe(PROFILE.profile_id);
    expect(result.proof.deadline_profile_ref).toBe(
      `profile:${PROFILE_REL}#sha256:${sha256(PROFILE_TEXT)}`,
    );
    expect(result.proof.release_policy_ref).toBe(
      `policy:${POLICY_REL}#sha256:${sha256(POLICY_TEXT)}`,
    );
    expect(proof.packet_authorities).toMatchObject({
      shared_vocabulary_schema: {
        path: SHARED_SCHEMA_REL,
        contract_version: '5.0.0',
        file_sha256: sha256(SHARED_SCHEMA_TEXT),
      },
      task_packet_schema: {
        path: TASK_PACKET_SCHEMA_REL,
        contract_version: '5.0.0',
        file_sha256: sha256(TASK_PACKET_SCHEMA_TEXT),
      },
      deadline_profile: {
        path: PROFILE_REL,
        contract_version: '7.0.0',
        file_sha256: sha256(PROFILE_TEXT),
      },
      owner_source_use_receipt: {
        path: SOURCE_USE_RECEIPT_REL,
        contract_version: '2.0.0',
        file_sha256: sha256(SOURCE_USE_RECEIPT_TEXT),
      },
    });
    expect(result.allocations.map((group) => group.assignmentId)).toEqual([
      'lesson-factory-deadline-2026-08-03-assignment-01',
      'lesson-factory-deadline-2026-08-03-assignment-02',
      'lesson-factory-deadline-2026-08-03-assignment-03',
    ]);
  });

  it('emits a closed proof that validates against its pinned schema', () => {
    const result = allocation();
    expect(
      api.validateAssignmentPartitionProof(result.proof, PROOF_SCHEMA_TEXT, SHARED_SCHEMA_TEXT),
    ).toEqual([]);

    const open = structuredClone(result.proof);
    open.unexpected = true;
    expect(
      api.validateAssignmentPartitionProof(open, PROOF_SCHEMA_TEXT, SHARED_SCHEMA_TEXT).join('\n'),
    ).toMatch(/additional property "unexpected" is not allowed/);
  });

  it('parses exactly 111 generation rows plus the closed existing-three exclusion scope', () => {
    const result = allocation();
    const parsed = api.parseAssignmentPartitionProof(parserInput(result.proof));
    const manifest = JSON.parse(MANIFEST_TEXT) as {
      curriculum: { lessons: Array<{ lesson_id: string }> };
    };
    const generationIds = parsed.generationRows.map((row) => row.lesson_id);

    expect(parsed.excludedExistingLessonIds).toEqual([
      'V3-LES-130923',
      'V3-LES-789208',
      'V3-LES-844372',
    ]);
    expect(generationIds).toHaveLength(111);
    expect(new Set(generationIds).size).toBe(111);
    expect(generationIds.filter((id) => parsed.excludedExistingLessonIds.includes(id))).toEqual([]);
    expect([...generationIds, ...parsed.excludedExistingLessonIds].sort()).toEqual(
      manifest.curriculum.lessons.map((row) => row.lesson_id).sort(),
    );
  });

  it('rejects stale v5 pins, scope drift, duplicate rows, and altered lane membership', () => {
    const current = allocation().proof;
    const mutations: Array<[string, (proof: JsonObject) => void]> = [
      [
        'stale profile',
        (proof) => {
          (((proof.packet_authorities as JsonObject).deadline_profile as JsonObject)
            .file_sha256 as string) = '1'.repeat(64);
        },
      ],
      [
        'stale task packet schema',
        (proof) => {
          (((proof.packet_authorities as JsonObject).task_packet_schema as JsonObject)
            .file_sha256 as string) = '2'.repeat(64);
        },
      ],
      [
        'stale shared vocabulary schema',
        (proof) => {
          (((proof.packet_authorities as JsonObject).shared_vocabulary_schema as JsonObject)
            .file_sha256 as string) = '4'.repeat(64);
        },
      ],
      [
        'stale owner receipt',
        (proof) => {
          (((proof.packet_authorities as JsonObject).owner_source_use_receipt as JsonObject)
            .file_sha256 as string) = '3'.repeat(64);
        },
      ],
      [
        'exclusion drift',
        (proof) => {
          (proof.excluded_existing_lesson_ids as string[])[0] = 'V3-LES-000000';
        },
      ],
      [
        'duplicate generation row',
        (proof) => {
          const groups = proof.assignments as Array<{ rows: JsonObject[] }>;
          groups[0]!.rows.push(structuredClone(groups[0]!.rows[0]!));
        },
      ],
      [
        'missing generation row',
        (proof) => {
          const groups = proof.assignments as Array<{ rows: JsonObject[] }>;
          groups[0]!.rows.pop();
        },
      ],
      [
        'extra noncanonical row',
        (proof) => {
          const groups = proof.assignments as Array<{ rows: JsonObject[] }>;
          const row = structuredClone(groups[0]!.rows[0]!);
          row.lesson_id = 'V3-LES-999999';
          row.slug = 'v3-les-999999';
          row.output_path = '.tmp/lesson-factory/lane-01/v3-les-999999';
          groups[0]!.rows.push(row);
        },
      ],
      [
        'declared count drift',
        (proof) => {
          const groups = proof.assignments as Array<{ count: number }>;
          groups[0]!.count = 50;
        },
      ],
      [
        'row/exclusion overlap',
        (proof) => {
          const groups = proof.assignments as Array<{ rows: JsonObject[] }>;
          groups[0]!.rows[0]!.lesson_id = 'V3-LES-130923';
          groups[0]!.rows[0]!.slug = 'v3-les-130923';
          groups[0]!.rows[0]!.output_path = '.tmp/lesson-factory/lane-01/v3-les-130923';
        },
      ],
      [
        'altered lane membership',
        (proof) => {
          const groups = proof.assignments as Array<{
            assignment_id: string;
            team_id: string;
            lane_id: string;
            rows: JsonObject[];
          }>;
          const left = groups[0]!.rows[0]!;
          const right = groups[1]!.rows[0]!;
          [left.lesson_id, right.lesson_id] = [right.lesson_id, left.lesson_id];
          [left.display_label, right.display_label] = [right.display_label, left.display_label];
          [left.source_section_bucket, right.source_section_bucket] = [
            right.source_section_bucket,
            left.source_section_bucket,
          ];
          for (const [row, group] of [
            [left, groups[0]!],
            [right, groups[1]!],
          ] as const) {
            row.slug = String(row.lesson_id).toLowerCase();
            row.output_path = `.tmp/lesson-factory/${group.lane_id}/${row.slug}`;
            row.assignment_id = group.assignment_id;
            row.team_id = group.team_id;
            row.lane_id = group.lane_id;
          }
        },
      ],
    ];

    for (const [name, mutate] of mutations) {
      const proof = structuredClone(current);
      mutate(proof);
      expect(() => api.parseAssignmentPartitionProof(parserInput(proof)), name).toThrow();
    }
  });
});

describe('final WP-02 manifest finalization', () => {
  it('refuses finalization when any packet reference is missing', () => {
    const result = allocation();
    const refs = packetRefs(result);
    delete refs[result.allocations[0]!.rows[0]!.lesson_id];

    expect(() => api.finalizeAssignmentManifests(finalizationInput(result, refs))).toThrow(
      /missing packet reference/,
    );
  });

  it('refuses finalization when any packet digest is a placeholder', () => {
    const result = allocation();
    const refs = packetRefs(result);
    const row = result.allocations[0]!.rows[0]!;
    refs[row.lesson_id] = `packet:${row.lane_id}/${row.slug}#sha256:${'0'.repeat(64)}`;

    expect(() => api.finalizeAssignmentManifests(finalizationInput(result, refs))).toThrow(
      /packet reference.*schema validation failed/s,
    );
  });

  it('is byte-identical with a synthetic complete packet map and emits valid manifests', () => {
    const result = allocation();
    const refs = packetRefs(result);
    const first = api.finalizeAssignmentManifests(finalizationInput(result, refs));
    const second = api.finalizeAssignmentManifests(finalizationInput(result, refs));

    expect(second.files).toEqual(first.files);
    expect(second.outputSetSha256).toBe(first.outputSetSha256);
    expect(first.assignments.map((artifact) => artifact.rows.length)).toEqual([51, 30, 30]);
    for (const artifact of first.assignments) {
      expect(
        api.validateAssignmentManifest(
          artifact.manifest,
          ASSIGNMENT_SCHEMA_TEXT,
          SHARED_SCHEMA_TEXT,
        ),
      ).toEqual([]);
      expect(artifact.bytes).not.toContain('0'.repeat(64));
    }
  });
});
