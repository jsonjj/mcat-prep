import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

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
  JSON.parse(readFileSync(join(repoRoot, 'curriculum/v3/v3-lesson-authoring-manifest.json'), 'utf8')) as unknown,
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
  const manifest = existsSync(manifestPath) ? (JSON.parse(readFileSync(manifestPath, 'utf8')) as unknown) : null;
  return { lessonId, files, manifest, resolvableIds: RESOLVABLE_IDS, browserEvidence: null };
}

const CANONICAL_RULE_IDS = [
  'R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7', 'R8', 'R9', 'R10', 'R11', 'R12', 'R13', 'R14', 'R15',
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
      expect(report.results.some((r) => r.rule === rule), `no ${rule} result produced`).toBe(true);
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
    expect(report.results.some((r) => r.rule === 'R15' && r.ok && /full micro-cycle present/.test(r.detail))).toBe(true);
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
});
