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
    it(`${lessonId} is green (R1–R5, R11, R15)`, () => {
      const report = validateLesson(buildInput(lessonId, dirName));
      const failures = report.results.filter((r) => !r.ok).map((r) => `${r.rule}: ${r.detail}`);
      expect(failures, `unexpected failures:\n${failures.join('\n')}`).toEqual([]);
      expect(report.ok).toBe(true);
      // every implemented rule produced at least one result
      for (const rule of ['R1', 'R2', 'R3', 'R4', 'R5', 'R11', 'R15']) {
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
});
