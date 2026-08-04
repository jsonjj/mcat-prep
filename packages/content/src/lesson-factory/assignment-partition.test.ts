import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { AssignmentPartitionInput } from '@mcat/content/lesson-factory';
import {
  canonicalJson,
  createAssignmentAllocation,
  createAssignmentPartition,
  validateAssignmentPartitionProof,
  validateAssignmentManifest,
} from './assignment-partition';

type JsonObject = Record<string, unknown>;

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const MANIFEST_PATH = join(REPO_ROOT, 'curriculum/v3/v3-lesson-authoring-manifest.json');
const ASSIGNMENT_SCHEMA_PATH = join(
  REPO_ROOT,
  'content/lesson-factory/schemas/assignment-manifest.schema.json',
);
const SHARED_SCHEMA_PATH = join(
  REPO_ROOT,
  'content/lesson-factory/schemas/shared-vocabulary.schema.json',
);
const PROOF_SCHEMA_PATH = join(
  REPO_ROOT,
  'content/lesson-factory/schemas/assignment-partition-proof.schema.json',
);
const PROFILE_PATH = join(
  REPO_ROOT,
  'content/lesson-factory/deadline-profile/deadline-profile.json',
);
const POLICY_PATH = join(REPO_ROOT, 'content/lesson-factory/deadline-profile/release-policy.json');
const ASSIGNMENT_FIXTURE_PATH = join(
  REPO_ROOT,
  'tests/architecture/lesson-factory/fixtures/assignment-manifest.json',
);
const CONTENT_CLI_PATH = join(REPO_ROOT, 'tools/content-cli/src/main.ts');

const MANIFEST_TEXT = readFileSync(MANIFEST_PATH, 'utf8');
const ASSIGNMENT_SCHEMA_TEXT = readFileSync(ASSIGNMENT_SCHEMA_PATH, 'utf8');
const SHARED_SCHEMA_TEXT = readFileSync(SHARED_SCHEMA_PATH, 'utf8');
const PROOF_SCHEMA_TEXT = readFileSync(PROOF_SCHEMA_PATH, 'utf8');
const PROFILE_TEXT = readFileSync(PROFILE_PATH, 'utf8');
const POLICY_TEXT = readFileSync(POLICY_PATH, 'utf8');
const PROFILE = JSON.parse(PROFILE_TEXT) as JsonObject;
const ASSIGNMENT_FIXTURE = (
  JSON.parse(readFileSync(ASSIGNMENT_FIXTURE_PATH, 'utf8')) as {
    instance: JsonObject;
  }
).instance;
const EXISTING_IDS = ['V3-LES-130923', 'V3-LES-789208', 'V3-LES-844372'] as const;
const TEAM_CAPACITIES = { primary: 51, 'team-A': 30, 'team-B': 30 } as const;

function sha256(text: string): string {
  return createHash('sha256').update(Buffer.from(text, 'utf8')).digest('hex');
}

function partitionInput(
  manifestText = MANIFEST_TEXT,
  overrides: Partial<AssignmentPartitionInput> = {},
): AssignmentPartitionInput {
  return {
    manifestText,
    assignmentSchemaText: ASSIGNMENT_SCHEMA_TEXT,
    proofSchemaText: PROOF_SCHEMA_TEXT,
    sharedVocabularySchemaText: SHARED_SCHEMA_TEXT,
    sourceManifestPath: 'curriculum/v3/v3-lesson-authoring-manifest.json',
    assignmentSchemaPath: 'content/lesson-factory/schemas/assignment-manifest.schema.json',
    proofSchemaPath: 'content/lesson-factory/schemas/assignment-partition-proof.schema.json',
    createdAt: PROFILE.frozen_at as string,
    deadlineProfileRef:
      'profile:content/lesson-factory/deadline-profile/deadline-profile.json#sha256:' +
      sha256(PROFILE_TEXT),
    releasePolicyRef:
      'policy:content/lesson-factory/deadline-profile/release-policy.json#sha256:' +
      sha256(POLICY_TEXT),
    rubricIdentity: PROFILE.rubric_identity as AssignmentPartitionInput['rubricIdentity'],
    ...overrides,
  };
}

function clonedManifest(): JsonObject {
  return structuredClone(JSON.parse(MANIFEST_TEXT) as JsonObject);
}

function lessonsOf(manifest: JsonObject): JsonObject[] {
  return (manifest.curriculum as JsonObject).lessons as JsonObject[];
}

function idsFromPartition(result: ReturnType<typeof createAssignmentPartition>): string[] {
  return result.assignments.flatMap((assignment) => assignment.rows.map((row) => row.lesson_id));
}

describe('production assignment-schema subset', () => {
  it('accepts the final WP-01 allOf/not contract control', () => {
    expect(
      validateAssignmentManifest(
        structuredClone(ASSIGNMENT_FIXTURE),
        ASSIGNMENT_SCHEMA_TEXT,
        SHARED_SCHEMA_TEXT,
      ),
    ).toEqual([]);
  });

  it('enforces not by rejecting an all-zero packet digest', () => {
    const document = structuredClone(ASSIGNMENT_FIXTURE);
    const rows = document.assignments as JsonObject[];
    rows[0]!.task_packet_ref = 'packet:lane-01/v3-les-000101#sha256:' + '0'.repeat(64);

    expect(
      validateAssignmentManifest(document, ASSIGNMENT_SCHEMA_TEXT, SHARED_SCHEMA_TEXT).join('\n'),
    ).toMatch(/forbidden `not` schema/);
  });
});

describe('createAssignmentPartition', () => {
  it('produces the exact 51/30/30 cardinalities', () => {
    const result = createAssignmentPartition(partitionInput());

    expect(
      Object.fromEntries(
        result.assignments.map((assignment) => [assignment.teamId, assignment.rows.length]),
      ),
    ).toEqual(TEAM_CAPACITIES);
  });

  it('keeps all three assignment sets pairwise disjoint', () => {
    const result = createAssignmentPartition(partitionInput());
    const sets = result.assignments.map(
      (assignment) => new Set(assignment.rows.map((row) => row.lesson_id)),
    );

    for (let left = 0; left < sets.length; left += 1) {
      for (let right = left + 1; right < sets.length; right += 1) {
        expect([...sets[left]!].filter((id) => sets[right]!.has(id))).toEqual([]);
      }
    }
  });

  it('covers exactly the canonical 111 remaining lessons and excludes the existing three', () => {
    const result = createAssignmentPartition(partitionInput());
    const manifest = JSON.parse(MANIFEST_TEXT) as JsonObject;
    const expected = lessonsOf(manifest)
      .map((row) => String(row.lesson_id))
      .filter((id) => !EXISTING_IDS.includes(id as (typeof EXISTING_IDS)[number]))
      .sort();

    expect(idsFromPartition(result).sort()).toEqual(expected);
    expect(idsFromPartition(result)).toHaveLength(111);
    expect(idsFromPartition(result).filter((id) => EXISTING_IDS.includes(id as never))).toEqual([]);
  });

  it('reads only curriculum.lessons rather than nested lesson_id occurrences', () => {
    const result = createAssignmentPartition(partitionInput());

    expect(idsFromPartition(result)).toHaveLength(111);
    expect(idsFromPartition(result)).not.toContain('V3-LES-000000');
  });

  it('fails closed when the canonical manifest row count drifts from 114', () => {
    const missing = clonedManifest();
    lessonsOf(missing).pop();
    expect(() => createAssignmentPartition(partitionInput(JSON.stringify(missing)))).toThrow(
      /exactly 114 canonical lesson rows/,
    );

    const extra = clonedManifest();
    lessonsOf(extra).push({
      ...lessonsOf(extra)[0],
      lesson_id: 'V3-LES-999999',
    });
    expect(() => createAssignmentPartition(partitionInput(JSON.stringify(extra)))).toThrow(
      /exactly 114 canonical lesson rows/,
    );
  });

  it('fails closed when one of the existing lesson IDs is unknown', () => {
    const manifest = clonedManifest();
    const existing = lessonsOf(manifest).find((row) => row.lesson_id === EXISTING_IDS[0]);
    expect(existing).toBeDefined();
    existing!.lesson_id = 'V3-LES-999999';

    expect(() => createAssignmentPartition(partitionInput(JSON.stringify(manifest)))).toThrow(
      /existing lesson ID V3-LES-130923 is not canonical/,
    );
  });

  it.each([
    {
      name: 'missing lesson ID',
      mutate: (rows: JsonObject[]) => {
        rows[0]!.lesson_id = '';
      },
      message: /non-empty lesson_id/,
    },
    {
      name: 'duplicate lesson ID',
      mutate: (rows: JsonObject[]) => {
        rows[1]!.lesson_id = rows[0]!.lesson_id;
      },
      message: /duplicate lesson_id/,
    },
    {
      name: 'missing display label',
      mutate: (rows: JsonObject[]) => {
        rows[0]!.canonical_display_label = ' ';
      },
      message: /non-empty canonical_display_label/,
    },
    {
      name: 'empty source sections',
      mutate: (rows: JsonObject[]) => {
        rows[0]!.source_sections = [];
      },
      message: /non-empty source_sections/,
    },
  ])('rejects $name', ({ mutate, message }) => {
    const manifest = clonedManifest();
    mutate(lessonsOf(manifest));

    expect(() => createAssignmentPartition(partitionInput(JSON.stringify(manifest)))).toThrow(
      message,
    );
  });

  it('pins unique canonical ID-based slugs and output paths', () => {
    const result = createAssignmentPartition(partitionInput());
    const rows = result.assignments.flatMap((assignment) => assignment.rows);

    expect(rows.every((row) => row.slug === row.lesson_id.toLowerCase())).toBe(true);
    expect(new Set(rows.map((row) => row.slug)).size).toBe(111);
    expect(new Set(rows.map((row) => row.output_path)).size).toBe(111);
    expect(rows.every((row) => row.output_path.endsWith(`/${row.slug}`))).toBe(true);
  });

  it('is byte-identical over repeated runs with identical input bytes', () => {
    const first = createAssignmentPartition(partitionInput());
    const second = createAssignmentPartition(partitionInput());

    expect(second.files).toEqual(first.files);
    expect(second.outputSetSha256).toBe(first.outputSetSha256);
  });

  it('emits short proof string arrays in the repository formatting style', () => {
    const result = createAssignmentPartition(partitionInput());

    expect(result.proofBytes).toContain(
      '"excluded_existing_lesson_ids": ["V3-LES-130923", "V3-LES-789208", "V3-LES-844372"]',
    );
    expect(result.proofBytes).toContain('"tie_breakers": ["bucket", "lesson_id", "team order"]');
  });

  it('keeps every subject/team allocation within one achievable integer of its quota', () => {
    const result = createAssignmentPartition(partitionInput());
    const allRows = result.assignments.flatMap((assignment) => assignment.rows);
    const bucketSizes = new Map<string, number>();
    for (const row of allRows) {
      bucketSizes.set(
        row.source_section_bucket,
        (bucketSizes.get(row.source_section_bucket) ?? 0) + 1,
      );
    }

    for (const assignment of result.assignments) {
      for (const [bucket, bucketSize] of bucketSizes) {
        const actual = assignment.rows.filter((row) => row.source_section_bucket === bucket).length;
        const ideal = (bucketSize * TEAM_CAPACITIES[assignment.teamId]) / 111;
        expect(Math.abs(actual - ideal)).toBeLessThanOrEqual(1);
      }
    }
  });

  it('reconciles capacity drift generically without relying on a subject name', () => {
    const manifest = clonedManifest();
    const rows = lessonsOf(manifest);
    const remaining = rows.filter(
      (row) => !EXISTING_IDS.includes(String(row.lesson_id) as (typeof EXISTING_IDS)[number]),
    );
    const counts = new Map<string, number>();
    for (const row of remaining) {
      const bucket = [...(row.source_sections as string[])].sort().join('+');
      counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
    }
    const namesBySize = new Map<number, string>([
      [6, 'Alpha'],
      [9, 'Beta'],
      [4, 'Gamma'],
      [26, 'Kappa'],
      [36, 'Omega'],
      [30, 'Sigma'],
    ]);
    for (const row of rows) {
      const bucket = [...(row.source_sections as string[])].sort().join('+');
      const renamed = namesBySize.get(counts.get(bucket) ?? -1);
      if (renamed !== undefined) row.source_sections = [renamed];
    }

    const result = createAssignmentPartition(partitionInput(JSON.stringify(manifest)));
    const alphaCounts = Object.fromEntries(
      result.assignments.map((assignment) => [
        assignment.teamId,
        assignment.rows.filter((row) => row.source_section_bucket === 'Alpha').length,
      ]),
    );

    expect(alphaCounts).toEqual({ primary: 3, 'team-A': 1, 'team-B': 2 });
    expect(
      Object.fromEntries(
        result.assignments.map((assignment) => [assignment.teamId, assignment.rows.length]),
      ),
    ).toEqual(TEAM_CAPACITIES);
  });

  it('validates the emitted allocation proof against its closed schema', () => {
    const result = createAssignmentPartition(partitionInput());

    expect(
      validateAssignmentPartitionProof(result.proof, PROOF_SCHEMA_TEXT, SHARED_SCHEMA_TEXT),
    ).toEqual([]);
  });

  it('fails if the pinned WP-01 assignment contract version changes', () => {
    const schema = JSON.parse(ASSIGNMENT_SCHEMA_TEXT) as JsonObject;
    schema.x_contract_version = '4.0.0';

    expect(() =>
      createAssignmentPartition(
        partitionInput(MANIFEST_TEXT, {
          assignmentSchemaText: JSON.stringify(schema),
        }),
      ),
    ).toThrow(/x_contract_version must be 3\.0\.0/);
  });

  it('records canonical content hashes and exact file-byte hashes', () => {
    const result = createAssignmentPartition(partitionInput());
    const parsedManifest = JSON.parse(MANIFEST_TEXT) as unknown;

    expect(result.proof.source_manifest.content_sha256).toBe(sha256(canonicalJson(parsedManifest)));
    expect(result.proof.source_manifest.file_sha256).toBe(sha256(MANIFEST_TEXT));
    expect(result.allocationContentSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(result.outputSetSha256).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('lesson-factory package boundary', () => {
  it('resolves the assignment API and public types through the content package subpath', async () => {
    const publicSubpath = '@mcat/content/lesson-factory';
    const api = await import(/* @vite-ignore */ publicSubpath);
    const input: AssignmentPartitionInput = partitionInput();

    expect(typeof api.createAssignmentPartition).toBe('function');
    expect(typeof api.createAssignmentAllocation).toBe('function');
    expect(typeof api.finalizeAssignmentManifests).toBe('function');
    expect(input.manifestText).toBe(MANIFEST_TEXT);
    expect(api.canonicalJson).toBe(canonicalJson);
    expect(api.createAssignmentAllocation).toBe(createAssignmentAllocation);
    expect(api.validateAssignmentManifest).toBe(validateAssignmentManifest);
    expect(api.EXISTING_LESSON_IDS).toEqual(EXISTING_IDS);
  });

  it('keeps content-cli on the public subpath instead of deep-importing package source', () => {
    const source = readFileSync(CONTENT_CLI_PATH, 'utf8');

    expect(source).toContain("from '@mcat/content/lesson-factory';");
    expect(source).toContain('finalizeAssignmentManifests');
    expect(source).toContain("case 'assignment-finalize':");
    expect(source).not.toMatch(/packages\/content\/src/);
  });
});
