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

  it('enables only the target card through a server-accepted Start or Continue mutation', () => {
    const source = read(curriculumPath);
    expect(source).toContain("const TARGET_LESSON_ID = 'V3-LES-130923'");
    expect(source).toMatch(/lesson\.id\s*===\s*TARGET_LESSON_ID/);
    expect(source).toMatch(/useVectorLessonStatus/);
    expect(source).toMatch(/useStartVectorLesson/);
    expect(source).toMatch(/startLesson\.mutateAsync/);
    expect(source).toMatch(/navigate\(accepted\.path\)/);
    expect(source).toMatch(/isTarget\s*\?\s*\(?\s*<TargetLessonAction/);
    expect(source).toMatch(/:\s*\(?\s*<UnavailableLessonAction/);
    expect(source).toContain('Coming soon');
    expect(source).toMatch(/function UnavailableLessonAction[\s\S]*?\bdisabled\b/);
  });

  it('registers a dedicated friendly lesson route and target-specific query hooks', () => {
    const router = read(routerPath);
    const queries = read(queriesPath);
    expect(existsSync(lessonPath)).toBe(true);
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
