import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { validateCatalog, validateLesson, type LessonValidationInput } from './index';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const lessonDir = (id: string): string => join(repoRoot, 'content/lessons', id);

function buildInput(lessonId: string, dirName: string): LessonValidationInput {
  const dir = lessonDir(dirName);
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.json') && f !== 'artifact-manifest.json')
    .map((relPath) => {
      const rawBytes = readFileSync(join(dir, relPath), 'utf8');
      return { relPath, rawBytes, json: JSON.parse(rawBytes) as unknown };
    });
  // Browser evidence lives outside the lesson dir; supply it (as `browser-report.json`)
  // when present so R7 can bind it. Only L1 has one today.
  const reportPath = join(repoRoot, 'tests/browser/evidence', dirName, 'browser-report.json');
  if (existsSync(reportPath)) {
    const rawBytes = readFileSync(reportPath, 'utf8');
    files.push({ relPath: 'browser-report.json', rawBytes, json: JSON.parse(rawBytes) as unknown });
  }
  const manifestPath = join(dir, 'artifact-manifest.json');
  const manifest = existsSync(manifestPath) ? (JSON.parse(readFileSync(manifestPath, 'utf8')) as unknown) : null;
  return { lessonId, files, manifest };
}

const LESSONS = [
  ['V3-LES-130923', 'v3-les-130923'],
  ['V3-LES-789208', 'v3-les-789208'],
  ['V3-LES-844372', 'v3-les-844372'],
] as const;

// Deep-clone an input so a negative test can mutate JSON without touching disk.
function clone(input: LessonValidationInput): LessonValidationInput {
  return JSON.parse(JSON.stringify(input)) as LessonValidationInput;
}
function fileJson(input: LessonValidationInput, name: string): Record<string, unknown> {
  const f = input.files.find((x) => x.relPath === name);
  if (!f) throw new Error(`fixture missing ${name}`);
  return f.json as Record<string, unknown>;
}

describe('structural validator — all three real lessons pass every implemented rule', () => {
  for (const [lessonId, dirName] of LESSONS) {
    it(`${lessonId} is green (R1–R15)`, () => {
      const report = validateLesson(buildInput(lessonId, dirName));
      const failures = report.results.filter((r) => !r.ok).map((r) => `${r.rule}: ${r.detail}`);
      expect(failures, `unexpected failures:\n${failures.join('\n')}`).toEqual([]);
      expect(report.ok).toBe(true);
      // every implemented rule produced at least one result (R7/R14 included)
      for (const rule of ['R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7', 'R8', 'R9', 'R10', 'R11', 'R12', 'R13', 'R14', 'R15']) {
        expect(report.results.some((r) => r.rule === rule)).toBe(true);
      }
    });
  }

  it('validateCatalog is green over the whole catalog', () => {
    const report = validateCatalog(LESSONS.map(([id, dir]) => buildInput(id, dir)));
    expect(report.failures.map((f) => `${f.lessonId}/${f.rule}: ${f.detail}`)).toEqual([]);
    expect(report.ok).toBe(true);
    expect(report.lessons.length).toBe(3);
  });

  it('L1 (no manifest) passes with R2/R4 marked N/A, not red-gated', () => {
    const report = validateLesson(buildInput('V3-LES-130923', 'v3-les-130923'));
    expect(report.ok).toBe(true);
    expect(report.results.find((r) => r.rule === 'R2')?.detail).toMatch(/N\/A/);
    expect(report.results.find((r) => r.rule === 'R4')?.detail).toMatch(/N\/A/);
  });

  it('R7 binds real evidence for L1 but is N/A for L2/L3 (no browser evidence)', () => {
    const l1 = validateLesson(buildInput('V3-LES-130923', 'v3-les-130923'));
    expect(l1.results.find((r) => r.rule === 'R7')?.detail).toMatch(/binds 3 artifact hashes/);
    const l2 = validateLesson(buildInput('V3-LES-789208', 'v3-les-789208'));
    expect(l2.results.find((r) => r.rule === 'R7')?.detail).toMatch(/N\/A/);
  });
});

describe('structural validator — each rule actually catches its defect', () => {
  it('R3 fails when a content_sha256 is corrupted', () => {
    const input = clone(buildInput('V3-LES-789208', 'v3-les-789208'));
    fileJson(input, 'lesson-script.json').content_sha256 = 'deadbeef'.repeat(8);
    const report = validateLesson(input);
    expect(report.ok).toBe(false);
    expect(report.results.some((r) => r.rule === 'R3' && !r.ok)).toBe(true);
  });

  it('R5 fails when a dependency binding is broken', () => {
    const input = clone(buildInput('V3-LES-844372', 'v3-les-844372'));
    const coverage = fileJson(input, 'kc-coverage-matrix.json');
    (coverage.dependency_bindings as Record<string, unknown>).lesson_script_sha256 = 'f'.repeat(64);
    const report = validateLesson(input);
    expect(report.results.some((r) => r.rule === 'R5' && !r.ok)).toBe(true);
  });

  it('R4 fails when a manifest file_sha256 disagrees with the bytes', () => {
    const input = clone(buildInput('V3-LES-789208', 'v3-les-789208'));
    const manifest = input.manifest as { primary_artifacts: Array<{ file_sha256: string }> };
    manifest.primary_artifacts[0]!.file_sha256 = '0'.repeat(64);
    const report = validateLesson(input);
    expect(report.results.some((r) => r.rule === 'R4' && !r.ok)).toBe(true);
  });

  it('R11 and R15 fail when a KC loses its exit items', () => {
    const input = clone(buildInput('V3-LES-789208', 'v3-les-789208'));
    const script = fileJson(input, 'lesson-script.json');
    const payload = script.payload as { question_evidence_plan: Array<{ activity_role: string }> };
    payload.question_evidence_plan = payload.question_evidence_plan.filter((it) => it.activity_role !== 'NEAR_EXIT');
    const report = validateLesson(input);
    expect(report.results.some((r) => r.rule === 'R15' && !r.ok)).toBe(true);
    expect(report.results.some((r) => r.rule === 'R11' && !r.ok)).toBe(true);
  });

  it('R6 fails when a node record carries an unknown field', () => {
    const input = clone(buildInput('V3-LES-130923', 'v3-les-130923'));
    const payload = fileJson(input, 'lesson-script.json').payload as { nodes: Array<Record<string, unknown>> };
    payload.nodes[0]!.unexpected_field = true;
    const report = validateLesson(input);
    expect(report.results.some((r) => r.rule === 'R6' && !r.ok)).toBe(true);
  });

  it('R8 fails when a KC is missing a required node kind', () => {
    const input = clone(buildInput('V3-LES-130923', 'v3-les-130923'));
    const payload = fileJson(input, 'lesson-script.json').payload as { nodes: Array<{ node_kind: string }> };
    const recap = payload.nodes.find((n) => n.node_kind === 'RECAP');
    if (!recap) throw new Error('fixture missing a RECAP node');
    recap.node_kind = 'EXPLANATION'; // remove the only RECAP → KC now lacks it
    const report = validateLesson(input);
    expect(report.results.some((r) => r.rule === 'R8' && !r.ok)).toBe(true);
  });

  it('R9 fails when a content route loses an exit id', () => {
    const input = clone(buildInput('V3-LES-130923', 'v3-les-130923'));
    const payload = fileJson(input, 'kc-coverage-matrix.json').payload as {
      rows: Array<{ route_coverage: { concise: { exit_ids: string[] } } }>;
    };
    payload.rows[0]!.route_coverage.concise.exit_ids = [payload.rows[0]!.route_coverage.concise.exit_ids[0]!];
    const report = validateLesson(input);
    expect(report.results.some((r) => r.rule === 'R9' && !r.ok)).toBe(true);
  });

  it('R10 fails when a transition targets a non-existent node', () => {
    const input = clone(buildInput('V3-LES-130923', 'v3-les-130923'));
    const payload = fileJson(input, 'lesson-script.json').payload as {
      activities: Array<{ authorized_next_node_ids?: string[] }>;
    };
    const act = payload.activities.find((a) => (a.authorized_next_node_ids?.length ?? 0) > 0);
    if (!act?.authorized_next_node_ids) throw new Error('fixture missing an activity with transitions');
    act.authorized_next_node_ids[0] = 'vtr-does-not-exist-node';
    const report = validateLesson(input);
    expect(report.results.some((r) => r.rule === 'R10' && !r.ok)).toBe(true);
  });

  it('R12 fails when a draft overclaims release readiness', () => {
    const input = clone(buildInput('V3-LES-130923', 'v3-les-130923'));
    const payload = fileJson(input, 'lesson-quality-report.json').payload as {
      claim_limits: Record<string, boolean>;
    };
    payload.claim_limits.mastery_calibrated = true; // the "we're calibrated" lie
    const report = validateLesson(input);
    expect(report.results.some((r) => r.rule === 'R12' && !r.ok)).toBe(true);
  });

  it('R13 fails when an item labels itself an exit it does not exercise', () => {
    const input = clone(buildInput('V3-LES-130923', 'v3-les-130923'));
    const payload = fileJson(input, 'lesson-script.json').payload as {
      question_evidence_plan: Array<{ activity_role: string; near_or_changed_function?: string | null; exit_function?: string }>;
    };
    // Flip a NEAR_EXIT item's function to CHANGED_TASK: the label now lies about its structure.
    const near = payload.question_evidence_plan.find((it) => it.activity_role === 'NEAR_EXIT');
    if (!near) throw new Error('fixture missing a NEAR_EXIT item');
    near.near_or_changed_function = 'CHANGED_TASK';
    near.exit_function = 'CHANGED_TASK';
    const report = validateLesson(input);
    expect(report.results.some((r) => r.rule === 'R13' && !r.ok)).toBe(true);
  });

  it('R7 fails when browser evidence hashes drift from the artifacts', () => {
    const input = clone(buildInput('V3-LES-130923', 'v3-les-130923'));
    const report = input.files.find((f) => f.relPath === 'browser-report.json');
    if (!report) throw new Error('fixture missing browser-report.json');
    (report.json as { artifact_hashes: Record<string, string> }).artifact_hashes.lesson_script = '0'.repeat(64);
    const result = validateLesson(input);
    expect(result.results.some((r) => r.rule === 'R7' && !r.ok)).toBe(true);
  });

  it('R14 fails when an item references a KC outside ordered_kc_ids', () => {
    const input = clone(buildInput('V3-LES-844372', 'v3-les-844372'));
    const payload = fileJson(input, 'lesson-script.json').payload as {
      nodes: Array<{ primary_kc_id: string }>;
    };
    payload.nodes[0]!.primary_kc_id = 'V3-KC-000000'; // undeclared KC
    const result = validateLesson(input);
    expect(result.results.some((r) => r.rule === 'R14' && !r.ok)).toBe(true);
  });
});
