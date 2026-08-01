import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { contentSha256, fileSha256, planLessonRehash, type RehashFile } from './index';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const lessonDir = (id: string): string => join(repoRoot, 'content/lessons', id);

const LESSONS = [
  ['V3-LES-130923', 'v3-les-130923'], // L1 — no manifest (four-file envelope)
  ['V3-LES-789208', 'v3-les-789208'], // L2 — manifest with `file` keys + single-object companions
  ['V3-LES-844372', 'v3-les-844372'], // L3 — manifest with `path` keys + companion_artifacts[]
] as const;

/** Read every artifact file for a lesson, splitting the manifest out (as the CLI wrapper does). */
function readLesson(dirName: string): { files: RehashFile[]; manifestText: string | null } {
  const dir = lessonDir(dirName);
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.json') && f !== 'artifact-manifest.json')
    .map((relPath) => ({ relPath, rawText: readFileSync(join(dir, relPath), 'utf8') }));
  const manifestPath = join(dir, 'artifact-manifest.json');
  const manifestText = existsSync(manifestPath) ? readFileSync(manifestPath, 'utf8') : null;
  return { files, manifestText };
}

const parse = (t: string): Record<string, unknown> => JSON.parse(t) as Record<string, unknown>;
const depBindings = (t: string): Record<string, unknown> =>
  (parse(t).dependency_bindings as Record<string, unknown> | undefined) ?? {};

describe('planLessonRehash — idempotent on every vendored lesson (tool reproduces the pinned chain)', () => {
  for (const [lessonId, dirName] of LESSONS) {
    it(`${lessonId}: rehashing the as-vendored lesson changes nothing`, () => {
      const { files, manifestText } = readLesson(dirName);
      const plan = planLessonRehash(files, manifestText);
      expect(
        plan.writes.map((w) => w.relPath),
        `unexpected rewrites for ${lessonId} — the vendored hash chain is already self-consistent`,
      ).toEqual([]);
      expect(plan.changed).toBe(false);
      // and the tool's recomputed content_sha256 equals what the file already embeds
      for (const c of plan.primaryContentSha) expect(c.newContentSha256).toBe(c.oldContentSha256);
    });
  }
});

describe('planLessonRehash — cascade after an authored edit (L3, the licensing target)', () => {
  it('propagates a lesson-script change through downstream refs, manifest, file_sha256 — preserving lineage', () => {
    const { files, manifestText } = readLesson('v3-les-844372');
    expect(manifestText).not.toBeNull();

    const scriptFile = files.find((f) => f.relPath === 'lesson-script.json');
    if (!scriptFile) throw new Error('fixture missing lesson-script.json');
    const originalScript = parse(scriptFile.rawText);
    const originalScriptSha = originalScript.content_sha256 as string;
    const coverageFile = files.find((f) => f.relPath === 'kc-coverage-matrix.json');
    if (!coverageFile) throw new Error('fixture missing kc-coverage-matrix.json');
    const lineageSupersedes = // historical hash that MUST survive the rehash untouched
      (((parse(coverageFile.rawText).lineage as Record<string, unknown>).supersedes as Record<string, unknown>)
        .content_sha256 as string);

    // Simulate an authored edit (e.g. exit licensing) that changes the script's canonical content.
    const mutated = { ...originalScript, __rehash_test_marker: 'licensing-edit' };
    const mutatedFiles = files.map((f) =>
      f.relPath === 'lesson-script.json' ? { ...f, rawText: JSON.stringify(mutated, null, 2) + '\n' } : f,
    );

    const plan = planLessonRehash(mutatedFiles, manifestText);
    expect(plan.changed).toBe(true);
    const written = new Map(plan.writes.map((w) => [w.relPath, w.newText] as const));
    // all four primaries + the manifest are rewritten
    for (const rel of [
      'lesson-script.json',
      'kc-coverage-matrix.json',
      'lesson-presentation-plan.json',
      'lesson-quality-report.json',
      'artifact-manifest.json',
    ]) {
      expect(written.has(rel), `expected a rewrite for ${rel}`).toBe(true);
    }

    // 1) script now self-consistent and different from before
    const newScriptText = written.get('lesson-script.json')!;
    const newScriptSha = parse(newScriptText).content_sha256 as string;
    expect(newScriptSha).not.toBe(originalScriptSha);
    expect(contentSha256(parse(newScriptText))).toBe(newScriptSha);

    // 2) every downstream ref (BOTH dependency_bindings and payload) points at the new script sha
    for (const rel of ['kc-coverage-matrix.json', 'lesson-presentation-plan.json', 'lesson-quality-report.json']) {
      const t = written.get(rel)!;
      expect(depBindings(t).lesson_script_sha256, `${rel} dependency_bindings`).toBe(newScriptSha);
      const payload = parse(t).payload as Record<string, unknown> | undefined;
      if (payload && 'lesson_script_sha256' in payload) {
        expect(payload.lesson_script_sha256, `${rel} payload mirror`).toBe(newScriptSha);
      }
      expect(contentSha256(parse(t))).toBe(parse(t).content_sha256); // self-consistent
    }

    // 3) lineage.supersedes.content_sha256 is a DIFFERENT historical hash — must be untouched
    const newCoverage = written.get('kc-coverage-matrix.json')!;
    expect(((parse(newCoverage).lineage as Record<string, unknown>).supersedes as Record<string, unknown>).content_sha256).toBe(
      lineageSupersedes,
    );
    expect(newCoverage).toContain(lineageSupersedes);

    // 4) manifest primary record refreshed to the new content + file sha
    const manifest = parse(written.get('artifact-manifest.json')!);
    const scriptRec = (manifest.primary_artifacts as Record<string, unknown>[]).find((r) => r.path === 'lesson-script.json')!;
    expect(scriptRec.content_sha256).toBe(newScriptSha);
    expect(scriptRec.file_sha256).toBe(fileSha256(newScriptText));

    // 5) applying the plan makes the lesson self-consistent → a second rehash is a no-op
    const applied = mutatedFiles.map((f) => (written.has(f.relPath) ? { ...f, rawText: written.get(f.relPath)! } : f));
    const second = planLessonRehash(applied, written.get('artifact-manifest.json')!);
    expect(second.changed, 'rehash must be idempotent once applied').toBe(false);
  });
});
