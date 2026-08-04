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
    readonly deadline_profile_ref: string;
    readonly release_policy_ref: string;
    readonly assignment_schema: JsonObject;
    readonly proof_schema: JsonObject;
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
const PROFILE_REL = 'content/lesson-factory/deadline-profile/deadline-profile.json';
const POLICY_REL = 'content/lesson-factory/deadline-profile/release-policy.json';

const MANIFEST_TEXT = read(MANIFEST_REL);
const ASSIGNMENT_SCHEMA_TEXT = read(ASSIGNMENT_SCHEMA_REL);
const SHARED_SCHEMA_TEXT = read(SHARED_SCHEMA_REL);
const PROFILE_TEXT = read(PROFILE_REL);
const POLICY_TEXT = read(POLICY_REL);
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
    sourceManifestPath: MANIFEST_REL,
    assignmentSchemaPath: ASSIGNMENT_SCHEMA_REL,
    proofSchemaPath: PROOF_SCHEMA_REL,
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
    assignmentSchemaText: ASSIGNMENT_SCHEMA_TEXT,
    proofSchemaText: PROOF_SCHEMA_TEXT,
    sharedVocabularySchemaText: SHARED_SCHEMA_TEXT,
    packetRefs: refs,
  };
}

describe('final WP-02 allocation contract', () => {
  it('exposes separate allocation and finalization APIs', () => {
    expect(typeof api.createAssignmentAllocation).toBe('function');
    expect(typeof api.finalizeAssignmentManifests).toBe('function');
    expect(typeof api.validateAssignmentPartitionProof).toBe('function');
  });

  it('pins final schema versions, current refs, and canonical assignment IDs', () => {
    expect(PROOF_SCHEMA_TEXT).not.toBe('');
    const result = allocation();

    expect(result.proof.contract_version).toBe('1.0.0');
    expect(result.proof.assignment_schema.contract_version).toBe('3.0.0');
    expect(result.proof.proof_schema.contract_version).toBe('1.0.0');
    expect(result.proof.deadline_profile_ref).toBe(
      `profile:${PROFILE_REL}#sha256:${sha256(PROFILE_TEXT)}`,
    );
    expect(result.proof.release_policy_ref).toBe(
      `policy:${POLICY_REL}#sha256:${sha256(POLICY_TEXT)}`,
    );
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
