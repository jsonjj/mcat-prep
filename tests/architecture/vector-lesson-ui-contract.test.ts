import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CURRICULUM_PHASES,
  type CurriculumLesson,
} from '../../apps/learner-web/src/data/curriculum-v3.generated';
import { describe, expect, it } from 'vitest';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const learnerSrc = join(root, 'apps/learner-web/src');
const curriculumPath = join(learnerSrc, 'screens/Curriculum.tsx');
const lessonPath = join(learnerSrc, 'screens/VectorLesson.tsx');
const routerPath = join(learnerSrc, 'app/router.tsx');
const queriesPath = join(learnerSrc, 'app/queries.ts');
const cssPath = join(learnerSrc, 'styles/app.css');
const read = (path: string) => (existsSync(path) ? readFileSync(path, 'utf8') : '');

describe('V3-LES-130923 one-lesson UI integration', () => {
  it('identifies exactly the first canonical lesson and its ordered KCs', () => {
    const lessons: CurriculumLesson[] = [];
    for (const phase of CURRICULUM_PHASES) {
      for (const module of phase.modules) lessons.push(...module.lessons);
    }
    const target = lessons.find((lesson) => lesson.id === 'V3-LES-130923');
    expect(target).toMatchObject({
      position: 1,
      shortTitle: 'Vectors and Trigonometry',
    });
    expect(target?.kcs.map((kc) => kc.id)).toEqual([
      'V3-KC-866848',
      'V3-KC-700208',
      'V3-KC-159529',
    ]);
  });

  it('drives playability from the registration manifest, keeping L1 on its bespoke vector seam', () => {
    const source = read(curriculumPath);
    // Servability is the manifest's call, not a hard-coded target id or a read of
    // the preview list — the couplings Phase 6 replaced.
    expect(source).not.toContain('const TARGET_LESSON_ID');
    expect(source).not.toMatch(/APP_NATIVE_LESSONS|PLAYABLE_SLUG_BY_LESSON_ID/);
    expect(source).toMatch(/lessonById\(lesson\.id\)/);
    // Three-way dispatch: unregistered → disabled; the vector-runtime lesson (L1) →
    // its bespoke Start/Continue seam; a normalized-runtime lesson (L2/L3) → the
    // shared catalog-player launch.
    expect(source).toMatch(/registered === undefined\s*\?\s*\(?\s*<UnavailableLessonAction/);
    expect(source).toMatch(/registered\.runtime === 'vector'\s*\?\s*\(?\s*<TargetLessonAction/);
    expect(source).toMatch(/:\s*\(?\s*<CatalogLessonAction/);
    // L1's server-accepted Start/Continue mutation seam is preserved verbatim.
    expect(source).toMatch(/useVectorLessonStatus/);
    expect(source).toMatch(/useStartVectorLesson/);
    expect(source).toMatch(/startLesson\.mutateAsync/);
    expect(source).toMatch(/navigate\(accepted\.path\)/);
    // Unregistered lessons stay visible but honestly disabled.
    expect(source).toContain('Coming soon');
    expect(source).toMatch(/function UnavailableLessonAction[\s\S]*?\bdisabled\b/);
  });

  it('registers dedicated lesson routes and per-grammar query hooks', () => {
    const router = read(routerPath);
    const queries = read(queriesPath);
    expect(existsSync(lessonPath)).toBe(true);
    // L1 keeps its bespoke route + vector hooks.
    expect(router).toMatch(/import\s*\{\s*VectorLesson\s*\}/);
    expect(router).toMatch(
      /path:\s*'lessons\/vectors-and-trigonometry'[\s\S]*?<VectorLesson\s*\/>/,
    );
    for (const hook of [
      'useVectorLessonStatus',
      'useStartVectorLesson',
      'useVectorLessonRun',
      'useSubmitVectorLessonAction',
    ]) {
      expect(queries).toContain(`function ${hook}`);
    }
    // L2/L3 register real routes of the SAME shape, played by the shared
    // CatalogLesson through slug-scoped normalized hooks.
    expect(router).toMatch(/import\s*\{\s*CatalogLesson\s*\}/);
    expect(router).toMatch(
      /path:\s*'lessons\/v3-les-789208'[\s\S]*?<CatalogLesson\s+lessonId="V3-LES-789208"/,
    );
    expect(router).toMatch(
      /path:\s*'lessons\/v3-les-844372'[\s\S]*?<CatalogLesson\s+lessonId="V3-LES-844372"/,
    );
    for (const hook of [
      'useNormalizedLessonStatus',
      'useStartNormalizedLesson',
      'useNormalizedLessonRun',
      'useSubmitNormalizedLessonAction',
    ]) {
      expect(queries).toContain(`function ${hook}`);
    }
  });

  it('renders one cognitive job and action with semantic questions and predictable focus', () => {
    const source = read(lessonPath);
    expect(source).toContain('INTERNAL_DRAFT_ONLY');
    expect(source).toMatch(/useRef<HTMLElement/);
    expect(source).toMatch(/\.focus\(\)/);
    expect(source).toMatch(/<fieldset/);
    expect(source).toMatch(/<legend/);
    expect(source).toMatch(/role="status"|aria-live="polite"/);
    expect(source).toContain("document.title = 'Vectors and Trigonometry | MCAT Mastery'");
    expect(source).toContain('aria-busy={submit.isPending}');
    expect(source).toMatch(/submit\.isError[\s\S]*?refetchLesson/);
    expect(source).toContain('could not confirm whether that action was saved');
    expect(source).toMatch(/<figure/);
    expect(source).toMatch(/<figcaption/);
    expect(source).toContain('You finished this lesson’s required instruction.');
    expect(source).not.toMatch(/STANDARD|CONCISE|MISCONCEPTION|PREREQUISITE_SUPPORT/);
    expect(source).not.toMatch(/>A[0-3]</);
    expect(source).not.toMatch(/V3-(?:KC|LES)-/);
    expect(source).not.toMatch(/mastered|exam.ready|readiness/i);
  });

  it('adds target-scoped responsive, focus, theme, and reduced-motion styles', () => {
    const css = read(cssPath);
    expect(css).toContain('/* ---- Vector lesson ---- */');
    expect(css).toMatch(/\.mc-vector-lesson[\s\S]*?max-width/);
    expect(css).toMatch(/\.mc-vector-lesson[\s\S]*?overflow-wrap:\s*anywhere/);
    expect(css).toMatch(/@media \(max-width:\s*375px\)[\s\S]*?mc-vector-lesson/);
    expect(css).toMatch(/@media \(max-width:\s*320px\)[\s\S]*?mc-vector-lesson/);
    expect(css).toMatch(/@media \(prefers-reduced-motion:\s*reduce\)/);
    expect(css).toMatch(/\.mc-vector-choice:focus-within/);
    expect(css).toMatch(/\.mc-vector-choice\s*\{[^}]*border:\s*1px solid var\(--mc-ink-muted\)/s);
  });
});
