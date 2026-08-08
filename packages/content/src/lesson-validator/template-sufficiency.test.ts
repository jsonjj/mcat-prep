import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LessonItemBindingSchema } from '@mcat/contracts';
import { normalizeAuthoredLessonBinding } from '@mcat/domain';
import { describe, expect, it } from 'vitest';

import * as lessonNormalization from '../lesson-normalization';
import { buildResolvableIds, validateLesson, type LessonValidationInput } from './index';

/**
 * Spec-sufficiency guard for the Real Lesson Catalog authoring workflow (Phase 9).
 *
 * The authoring deliverables are three coupled things that must never drift apart:
 *   1. the structural authoring SPEC        (docs/design/05-…-SPEC.md),
 *   2. the author RUNBOOK                    (docs/design/06-…-WORKFLOW.md),
 *   3. a real, minimal TEMPLATE lesson       (docs/lesson-authoring/template/v3-les-000000/).
 *
 * "Sufficient" means: an author who copies the template and follows the spec/runbook
 * gets a lesson the merge gate accepts. This test proves that end-to-end by running the
 * SAME validator the CI gate runs (R1–R15) over the committed template, with the real
 * in-repo curriculum catalog supplied — so R14 resolves the template's KC as a genuine
 * curriculum entity, exactly as it would for a real lesson. It also pins the template
 * OUTSIDE content/lessons/ (so it is never swept into the served catalog corpus) and
 * pins the docs to the validator's ACTUAL enforced rule set (add an R16 and this test
 * fails until the template + spec + runbook are updated to cover it).
 */

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const TEMPLATE_REL = 'docs/lesson-authoring/template/v3-les-000000';
const templateDir = join(repoRoot, TEMPLATE_REL);
const SPEC_REL = 'docs/design/05-LESSON-STRUCTURAL-AUTHORING-SPEC.md';
const RUNBOOK_REL = 'docs/design/06-LESSON-AUTHORING-WORKFLOW.md';

// The real in-repo curriculum catalog R14 resolves against (indexes.kc_by_id etc.) — the
// identical source the content-cli merge gate uses, so this test can't pass on a laxer catalog.
const RESOLVABLE_IDS = buildResolvableIds(
  JSON.parse(
    readFileSync(join(repoRoot, 'curriculum/v3/v3-lesson-authoring-manifest.json'), 'utf8'),
  ) as unknown,
);

// Build the validator input for a lesson directory EXACTLY as tools/content-cli does:
// every *.json except the manifest becomes a file record; the manifest (absent for the
// L1-style template) is null; browser evidence is supplied only if present (absent → R7 N/A).
function buildInput(lessonId: string, dir: string): LessonValidationInput {
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.json') && f !== 'artifact-manifest.json')
    .map((relPath) => {
      const rawBytes = readFileSync(join(dir, relPath), 'utf8');
      return { relPath, rawBytes, json: JSON.parse(rawBytes) as unknown };
    });
  const manifestPath = join(dir, 'artifact-manifest.json');
  const manifest = existsSync(manifestPath)
    ? (JSON.parse(readFileSync(manifestPath, 'utf8')) as unknown)
    : null;
  return { lessonId, files, manifest, resolvableIds: RESOLVABLE_IDS, browserEvidence: null };
}

function readTemplateArtifacts(): lessonNormalization.RawLessonArtifacts {
  const read = (file: string): unknown =>
    JSON.parse(readFileSync(join(templateDir, file), 'utf8')) as unknown;
  return {
    script: read('lesson-script.json'),
    learnerSafeItems: read('learner-safe-items.json'),
    protectedItems: existsSync(join(templateDir, 'protected-items.json'))
      ? read('protected-items.json')
      : undefined,
    presentationPlan: read('lesson-presentation-plan.json'),
  };
}

const CANONICAL_RULE_IDS = [
  'R1',
  'R2',
  'R3',
  'R4',
  'R5',
  'R6',
  'R7',
  'R8',
  'R9',
  'R10',
  'R11',
  'R12',
  'R13',
  'R14',
  'R15',
] as const;

describe('Phase 9 spec-sufficiency: the authoring template is a gate-passing lesson', () => {
  const report = validateLesson(buildInput('V3-LES-000000', templateDir));

  it('passes every structural rule the merge gate enforces (R1–R15, zero failures)', () => {
    const failures = report.results.filter((r) => !r.ok).map((r) => `${r.rule}: ${r.detail}`);
    expect(failures, `template must be gate-clean but failed:\n${failures.join('\n')}`).toEqual([]);
    expect(report.ok).toBe(true);
    // Every implemented rule produced at least one result — the template exercises the
    // WHOLE contract, not a passing subset.
    for (const rule of CANONICAL_RULE_IDS) {
      expect(
        report.results.some((r) => r.rule === rule),
        `no ${rule} result produced`,
      ).toBe(true);
    }
  });

  it('exercises R14 as a REAL curriculum resolution, not a trivial N/A', () => {
    // The template must use a genuine curriculum KC. With the catalog supplied, R14 reports
    // "resolve in the curriculum catalog"; a placeholder KC or a missing catalog would N/A
    // or fail here — either way this pin would catch a template that only *looks* valid.
    const r14 = report.results.filter((r) => r.rule === 'R14');
    expect(r14.every((r) => r.ok)).toBe(true);
    expect(r14.some((r) => /resolve in the curriculum catalog/.test(r.detail))).toBe(true);
    expect(r14.some((r) => /N\/A/.test(r.detail))).toBe(false);
  });

  it('lives OUTSIDE content/lessons/ so it never enters the served catalog corpus', () => {
    // The corpus pin (115 bindings) and the R14 gate sweep content/lessons/ only. A template
    // there would corrupt those counts; assert its committed location is the docs tree.
    expect(TEMPLATE_REL.startsWith('docs/lesson-authoring/')).toBe(true);
    expect(TEMPLATE_REL.includes('content/lessons')).toBe(false);
    expect(existsSync(join(templateDir, 'lesson-script.json'))).toBe(true);
    expect(existsSync(join(templateDir, 'README.md'))).toBe(true);
  });

  it('is a genuinely minimal single-KC lesson (the smallest complete authoring unit)', () => {
    // R8 (all-required-node-kinds) emits one result per KC; a minimal template has exactly one.
    const r8 = report.results.filter((r) => r.rule === 'R8');
    expect(r8.length).toBe(1);
    expect(r8[0]?.ok).toBe(true);
    // …and that single KC is proven runtime-servable (full micro-cycle present) by R15.
    expect(
      report.results.some(
        (r) => r.rule === 'R15' && r.ok && /full micro-cycle present/.test(r.detail),
      ),
    ).toBe(true);
  });

  it('the spec and runbook document every rule id the validator actually enforces (drift guard)', () => {
    // Derive the enforced set from the validator OUTPUT, not a hardcoded list: if a rule is
    // added/removed, this set changes and forces the docs (and template) to be updated in lockstep.
    const enforcedRules = [...new Set(report.results.map((r) => r.rule))].sort(
      (a, b) => Number(a.slice(1)) - Number(b.slice(1)),
    );
    expect(enforcedRules).toEqual([...CANONICAL_RULE_IDS]);

    const spec = readFileSync(join(repoRoot, SPEC_REL), 'utf8');
    const runbook = readFileSync(join(repoRoot, RUNBOOK_REL), 'utf8');
    for (const rule of enforcedRules) {
      const token = new RegExp(String.raw`\b${rule}\b`);
      expect(token.test(spec), `${SPEC_REL} does not document ${rule}`).toBe(true);
      expect(token.test(runbook), `${RUNBOOK_REL} does not document ${rule}`).toBe(true);
    }
  });

  it('is a canonical compilation fixture with a total protected key and learner-safe delivery model', () => {
    const compiled = lessonNormalization.compileCanonicalLesson(readTemplateArtifacts());
    const scored = compiled.lesson.items.filter((item) => item.scored);
    const entryAnswer = compiled.answerKey.byItemId['TPL-GRAPH-ENTRY'];
    expect(compiled.lesson.lessonId).toBe('V3-LES-000000');
    expect(compiled.lesson.definitionHash).toMatch(/^[0-9a-f]{64}$/);
    expect(scored).toHaveLength(10);
    expect(Object.keys(compiled.answerKey.byItemId)).toHaveLength(scored.length);
    expect(Object.keys(compiled.answerKey.byItemId).sort()).toEqual(
      scored.map((item) => item.itemId).sort(),
    );
    expect(JSON.stringify(compiled.lesson.items.map((item) => item.projection))).not.toMatch(
      /accepted_responses|answer_authority|correct_response|correct_option|rationale|scoring_authority/i,
    );
    expect(entryAnswer?.rationale).toContain('PRIVATE');
    expect(entryAnswer?.learnerSafePostCommitmentFeedback).toBe(
      'Each equal display step multiplies the labelled value by ten.',
    );
  });

  it('ships one complete presentation sequence and both runnable repair/re-entry branches', () => {
    const normalize = lessonNormalization.normalizeLesson(readTemplateArtifacts());
    const kc = normalize.kcs[0];
    expect(kc?.deliverySteps?.map((step) => step.stage) ?? []).toEqual([
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
      'TARGETED_REPAIR',
      'EXACT_REENTRY',
      'RECAP',
    ]);
    expect(kc?.cleanBaselineItemIds).toHaveLength(7);
    expect(kc?.branchBindings.map((binding) => binding.failedFunction)).toEqual([
      'NEAR_USE',
      'CHANGED_TASK',
    ]);
    expect(
      kc?.branchBindings.every(
        (binding) => binding.repairItemIds.length > 0 && binding.reentryItemId.length > 0,
      ),
    ).toBe(true);
  });

  it('passes every QEP record through the real mastery binding seam', () => {
    const script = JSON.parse(readFileSync(join(templateDir, 'lesson-script.json'), 'utf8')) as {
      artifact_version: string;
      payload: {
        lesson_id: string;
        question_evidence_plan: Array<Record<string, unknown>>;
      };
    };
    const protectedItems = JSON.parse(
      readFileSync(join(templateDir, 'protected-items.json'), 'utf8'),
    ) as {
      records: Array<{ answer_record_id: string }>;
    };
    const protectedIds = new Set(protectedItems.records.map((record) => record.answer_record_id));

    expect(script.payload.question_evidence_plan).toHaveLength(11);
    for (const authored of script.payload.question_evidence_plan) {
      const itemId = String(authored.item_binding_id);
      const normalized = normalizeAuthoredLessonBinding(
        {
          lessonId: script.payload.lesson_id,
          artifactVersion: script.artifact_version,
        },
        authored,
      );
      expect(normalized.rejectionCodes, itemId).toEqual([]);
      const parsed = LessonItemBindingSchema.safeParse(normalized.value);
      expect(parsed.success, itemId).toBe(true);
      if (!parsed.success) continue;

      if (authored.activity_role === 'WORKED_EXAMPLE') {
        expect(parsed.data.measurementKind, itemId).toBe('NON_MEASURABLE');
        expect(authored).toMatchObject({
          activity_id: null,
          answer_authority_ref: null,
          rationale_authority_ref: null,
          first_attempt_immutable: null,
        });
      } else {
        expect(parsed.data.measurementKind, itemId).toBe('MEASURABLE');
        expect(authored.first_attempt_immutable, itemId).toBe(true);
        expect(Array.isArray(authored.assistance_available), itemId).toBe(true);
        expect(protectedIds.has(itemId), itemId).toBe(true);
        expect(authored.answer_authority_ref, itemId).toBe(`protected-items.json#${itemId}`);
        expect(authored.rationale_authority_ref, itemId).toBe(`protected-items.json#${itemId}`);
      }
    }
  });

  it('authors the complete focus and responsive presentation surface for every screen', () => {
    const script = JSON.parse(readFileSync(join(templateDir, 'lesson-script.json'), 'utf8')) as {
      payload: {
        nodes: Array<{ node_id: string; activity_ids: string[]; representation_ids: string[] }>;
      };
    };
    const presentation = JSON.parse(
      readFileSync(join(templateDir, 'lesson-presentation-plan.json'), 'utf8'),
    ) as {
      payload: {
        screens: Array<Record<string, unknown> & { script_node_ids: string[] }>;
      };
    };
    const nodes = new Map(script.payload.nodes.map((node) => [node.node_id, node]));

    expect(presentation.payload.screens).toHaveLength(17);
    for (const screen of presentation.payload.screens) {
      const node = nodes.get(screen.script_node_ids[0] ?? '');
      expect(node, String(screen.screen_id)).toBeDefined();
      const responseBearing = (node?.activity_ids.length ?? 0) > 0;
      expect(screen.important_callout_count, String(screen.screen_id)).toBe(0);
      expect(screen.collapsed_detail_ids, String(screen.screen_id)).toEqual([]);
      expect(screen.reviewer_only_refs, String(screen.screen_id)).toEqual([]);
      expect(screen.representation_ids, String(screen.screen_id)).toEqual(
        node?.representation_ids ?? [],
      );
      expect(screen.responsive_behavior, String(screen.screen_id)).toBe(
        'SINGLE_COLUMN_REFLOW_320PX_NO_PRIMARY_HORIZONTAL_SCROLL_200_PERCENT_ZOOM',
      );
      expect(screen.focus_target, String(screen.screen_id)).toBe(
        responseBearing
          ? 'SCREEN_HEADING_THEN_RESPONSE_CONTROL_THEN_FEEDBACK_REGION_AFTER_COMMITMENT'
          : 'SCREEN_HEADING',
      );
      expect(screen.keyboard_order, String(screen.screen_id)).toEqual(
        responseBearing
          ? [
              'HEADING',
              'PROMPT_OR_CONTENT',
              'RESPONSE_CONTROL',
              'PRIMARY_ACTION',
              'FEEDBACK_AFTER_COMMITMENT',
            ]
          : ['HEADING', 'CONTENT', 'PRIMARY_ACTION'],
      );
    }
  });

  it('has an exact one-KC manifest/hash chain and no stale source-lesson content', () => {
    const manifestPath = join(templateDir, 'artifact-manifest.json');
    expect(existsSync(manifestPath)).toBe(true);
    if (!existsSync(manifestPath)) return;
    const manifestText = readFileSync(manifestPath, 'utf8');
    const manifest = JSON.parse(manifestText) as {
      lesson_binding?: { lesson_id?: string; ordered_kc_ids?: string[] };
      primary_artifacts?: unknown[];
      companion_artifacts?: unknown[];
    };
    expect(manifest.lesson_binding).toEqual({
      lesson_id: 'V3-LES-000000',
      grouping_id: 'V3-CL-000000',
      ordered_kc_ids: ['V3-KC-452593'],
    });
    expect(manifest.primary_artifacts).toHaveLength(4);
    expect(manifest.companion_artifacts).toHaveLength(2);

    const fixtureText = readdirSync(templateDir)
      .filter((file) => file.endsWith('.json'))
      .map((file) => readFileSync(join(templateDir, file), 'utf8'))
      .join('\n');
    expect(fixtureText).not.toMatch(/V3-KC-008681|V3-KC-238607|844372/);
  });

  it('reports candidate quality honestly without production, mastery, or efficacy claims', () => {
    const quality = JSON.parse(
      readFileSync(join(templateDir, 'lesson-quality-report.json'), 'utf8'),
    ) as {
      payload?: {
        final_gate_status?: string;
        release_eligibility?: string;
        claim_limits?: Record<string, unknown>;
      };
    };
    expect(quality.payload?.final_gate_status).toBe('BLOCKED');
    expect(quality.payload?.release_eligibility).toBe('INTERNAL_DRAFT_ONLY');
    expect(
      Object.values(quality.payload?.claim_limits ?? {}).every((claim) => claim === false),
    ).toBe(true);
  });
});
