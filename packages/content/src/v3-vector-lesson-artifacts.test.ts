import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  TARGET_LESSON_ID,
  TARGET_ORDERED_KC_IDS,
  buildVectorLessonArtifacts,
  validateVectorLessonArtifacts,
} from './v3-vector-lesson-artifacts';

const EXPECTED_KCS = ['V3-KC-866848', 'V3-KC-700208', 'V3-KC-159529'] as const;
const REQUIRED_NODE_KINDS = [
  'ENTRY_CHECK_BOUNDARY',
  'ORIENTATION',
  'EXPLANATION',
  'MENTAL_MODEL',
  'EXPERT_THINK_ALOUD',
  'WORKED_EXAMPLE',
  'GUIDED_PRACTICE',
  'LIGHT_SUPPORT_PRACTICE',
  'SOLO_PRACTICE',
  'CONTRAST_BOUNDARY',
  'NEAR_EXIT',
  'CHANGED_EXIT',
  'TARGETED_REPAIR',
  'EXACT_REENTRY',
  'RECAP',
] as const;
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

describe('V3-LES-130923 Spec 04 artifact package', () => {
  it('binds exactly the target lesson and canonical KC order', () => {
    expect(TARGET_LESSON_ID).toBe('V3-LES-130923');
    expect(TARGET_ORDERED_KC_IDS).toEqual(EXPECTED_KCS);

    const artifacts = buildVectorLessonArtifacts();
    for (const artifact of Object.values(artifacts)) {
      expect(artifact.registry_binding.lesson_id).toBe(TARGET_LESSON_ID);
      expect(artifact.registry_binding.grouping_id).toBe('V3-CL-130923');
      expect(artifact.registry_binding.ordered_kc_ids).toEqual(EXPECTED_KCS);
      expect(artifact.registry_binding.ordered_required_kc_ids).toEqual(EXPECTED_KCS);
    }
  });

  it('validates closed artifacts, deterministic hashes, and dependency hashes', () => {
    const artifacts = buildVectorLessonArtifacts();
    expect(validateVectorLessonArtifacts(artifacts)).toEqual([]);

    expect(artifacts.coverage.dependency_bindings).toEqual({
      lesson_script_id: artifacts.script.artifact_id,
      lesson_script_sha256: artifacts.script.content_sha256,
    });
    expect(artifacts.presentation.dependency_bindings).toEqual({
      lesson_script_id: artifacts.script.artifact_id,
      lesson_script_sha256: artifacts.script.content_sha256,
      kc_coverage_matrix_id: artifacts.coverage.artifact_id,
      kc_coverage_matrix_sha256: artifacts.coverage.content_sha256,
    });
    expect(artifacts.quality.dependency_bindings).toEqual({
      lesson_script_id: artifacts.script.artifact_id,
      lesson_script_sha256: artifacts.script.content_sha256,
      kc_coverage_matrix_id: artifacts.coverage.artifact_id,
      kc_coverage_matrix_sha256: artifacts.coverage.content_sha256,
      lesson_presentation_plan_id: artifacts.presentation.artifact_id,
      lesson_presentation_plan_sha256: artifacts.presentation.content_sha256,
    });
  });

  it('proves every required instructional element for every KC and route', () => {
    const { script, coverage } = buildVectorLessonArtifacts();

    for (const kcId of EXPECTED_KCS) {
      const nodes = script.payload.nodes.filter((node) => node.primary_kc_id === kcId);
      expect(new Set(nodes.map((node) => node.node_kind))).toEqual(new Set(REQUIRED_NODE_KINDS));

      const row = coverage.payload.rows.find((candidate) => candidate.kc_id === kcId);
      expect(row).toBeDefined();
      expect(row?.row_status).toBe('BLOCKED');
      for (const route of ['concise', 'standard', 'misconception'] as const) {
        expect(row?.route_coverage[route].coverage_status).toBe('PASS');
        expect(row?.route_coverage[route].exit_ids).toHaveLength(2);
        expect(row?.route_coverage[route].repair_ids.length).toBeGreaterThan(0);
      }
      expect(row?.route_coverage.prerequisite_support).toMatchObject({
        coverage_status: 'BLOCKED',
        reason: 'NO_CANONICAL_HARD_PREDECESSOR_SCHEMA_NA_STATUS_UNAVAILABLE',
      });
    }
    expect(coverage.payload.matrix_status).toBe('BLOCKED');
  });

  it('authorizes entry, exit-failure, and repair transitions to their exact functions', () => {
    const { script } = buildVectorLessonArtifacts();
    for (const [slug, itemSlug] of [
      ['vectors', 'vec'],
      ['trig', 'trig'],
      ['direction', 'dir'],
    ] as const) {
      const entry = script.payload.activities.find((activity) =>
        activity.item_binding_ids.some(
          (itemId) => itemId.startsWith(`vtr-${itemSlug}-`) && itemId.endsWith('entry-check-1'),
        ),
      );
      expect(entry?.authorized_next_node_ids).toContain(`vtr-${slug}-node-orientation`);

      const near = script.payload.activities.find((activity) =>
        activity.item_binding_ids.some(
          (itemId) => itemId.startsWith(`vtr-${itemSlug}-`) && itemId.endsWith('near-exit-initial'),
        ),
      );
      expect(near?.authorized_next_node_ids).toEqual(
        expect.arrayContaining([`vtr-${slug}-node-changed-exit`, `vtr-${slug}-node-repair-near`]),
      );

      const changedRepair = script.payload.activities.find((activity) =>
        activity.item_binding_ids.some(
          (itemId) =>
            itemId.startsWith(`vtr-${itemSlug}-`) &&
            itemId.endsWith('repair-confirmation-changed-1'),
        ),
      );
      expect(changedRepair?.authorized_next_node_ids).toContain(`vtr-${slug}-node-reentry-changed`);
    }
  });

  it('keeps semantic families isolated by KC and authored role', () => {
    const { script } = buildVectorLessonArtifacts();
    const bindings = script.payload.question_evidence_plan;
    const familyIds = bindings.map((binding) => binding.semantic_family_id);
    const lineageIds = bindings.map((binding) => binding.stimulus_lineage.lineage_id);

    expect(new Set(familyIds).size).toBe(familyIds.length);
    expect(new Set(lineageIds).size).toBe(lineageIds.length);
    expect(bindings.every((binding) => binding.stimulus_lineage.rationale_lineage_isolated)).toBe(
      true,
    );
    for (const kcId of EXPECTED_KCS) {
      const kcBindings = bindings.filter((binding) => binding.primary_kc_id === kcId);
      const near = kcBindings.filter((binding) => binding.activity_role === 'NEAR_EXIT');
      const changed = kcBindings.filter((binding) => binding.activity_role === 'CHANGED_EXIT');
      expect(near.length).toBeGreaterThanOrEqual(2);
      expect(changed.length).toBeGreaterThanOrEqual(2);
      expect(near.every((binding) => binding.assistance_state === 'A0')).toBe(true);
      expect(changed.every((binding) => binding.assistance_state === 'A0')).toBe(true);
      expect(near.some((binding) => changed.includes(binding))).toBe(false);
    }
  });

  it('records the canonical exclusions and blocked external gates without overclaiming', () => {
    const { script, quality } = buildVectorLessonArtifacts();
    expect(script.payload.scope_and_non_goals.exclusions).toEqual(
      expect.arrayContaining(['vector dot products', 'vector cross products', 'calculus']),
    );
    expect(quality.payload.final_gate_status).toBe('BLOCKED');
    expect(quality.payload.release_eligibility).toBe('INTERNAL_DRAFT_ONLY');
    expect(quality.payload.claim_limits).toEqual({
      learner_validated: false,
      efficacy_established: false,
      mastery_calibrated: false,
      readiness_validated: false,
      production_published: false,
    });
  });

  it('binds each KC to its exact BB and CP remediation/re-entry relations', () => {
    const serialized = JSON.stringify(buildVectorLessonArtifacts().script.payload.kc_scripts);
    for (const relationId of [
      'R14-REM-BB-129',
      'R14-REM-CP-156',
      'R14-REM-BB-109',
      'R14-REM-CP-129',
      'R14-REM-BB-042',
      'R14-REM-CP-046',
    ]) {
      expect(serialized).toContain(relationId);
    }
  });

  it('traces the bounded Lorentz-force application to its extension source anchor', () => {
    const { script } = buildVectorLessonArtifacts();
    const direction = script.payload.kc_scripts.find((kc) => kc.kc_id === 'V3-KC-159529');
    expect(direction?.source_claim_refs).toContain('CP-SA-015');
    expect(script.payload.attachment_bindings).toContainEqual({
      attachment_id: 'V3-EXT-351964',
      attachment_type: 'EXTENSION',
      host_kc_id: 'V3-KC-159529',
      handling: 'BOUNDED_APPLICATION_NO_SEPARATE_CREDIT',
    });
  });

  it('keeps the four checked-in JSON artifacts object-equivalent to the deterministic build', () => {
    const artifacts = buildVectorLessonArtifacts();
    const directory = join(repoRoot, 'content', 'lessons', 'v3-les-130923');
    for (const [filename, artifact] of [
      ['lesson-script.json', artifacts.script],
      ['kc-coverage-matrix.json', artifacts.coverage],
      ['lesson-presentation-plan.json', artifacts.presentation],
      ['lesson-quality-report.json', artifacts.quality],
    ] as const) {
      expect(JSON.parse(readFileSync(join(directory, filename), 'utf8'))).toEqual(artifact);
    }
  });

  it('binds browser evidence to the exact script, matrix, and presentation hashes', () => {
    const artifacts = buildVectorLessonArtifacts();
    const reportPath = join(
      repoRoot,
      'tests',
      'browser',
      'evidence',
      'v3-les-130923',
      'browser-report.json',
    );
    const reportText = readFileSync(reportPath, 'utf8');
    const report = JSON.parse(reportText) as {
      artifact_hashes: {
        lesson_script: string;
        kc_coverage_matrix: string;
        lesson_presentation_plan: string;
      };
    };
    expect(report.artifact_hashes).toEqual({
      lesson_script: artifacts.script.content_sha256,
      kc_coverage_matrix: artifacts.coverage.content_sha256,
      lesson_presentation_plan: artifacts.presentation.content_sha256,
    });
    const reportHash = createHash('sha256').update(reportText).digest('hex');
    expect(JSON.stringify(artifacts.quality.payload.evidence_refs)).toContain(reportHash);
  });

  it('rejects unknown fields inside nested script records', () => {
    const artifacts = structuredClone(buildVectorLessonArtifacts());
    (
      artifacts.script.payload.nodes[0] as (typeof artifacts.script.payload.nodes)[number] & {
        unexpected_field?: boolean;
      }
    ).unexpected_field = true;

    expect(validateVectorLessonArtifacts(artifacts)).toContain(
      `${artifacts.script.payload.nodes[0]?.node_id}: node record is not closed`,
    );
  });
});
