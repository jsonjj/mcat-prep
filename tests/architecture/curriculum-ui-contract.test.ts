import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CURRICULUM_PHASES } from '../../apps/learner-web/src/data/curriculum-v3.generated';
import { describe, expect, it } from 'vitest';

/**
 * Source contract for the browse-only learner Curriculum tab. This is a
 * node-environment architecture test (no DOM): it verifies the screen, route,
 * navigation, and icon exist, that the screen consumes the checked-in generated
 * manifest, and that it carries the exact calm learner language, disabled Start,
 * unified collapsible modules, responsive nav, and accessibility semantics the
 * feature requires — without dictating incidental markup, so it stays resilient
 * to reasonable design choices. These are stable acceptance contracts; they do
 * not replace browser/responsive QA.
 */

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const learnerSrc = join(root, 'apps/learner-web/src');

const CURRICULUM_SCREEN = join(learnerSrc, 'screens/Curriculum.tsx');
const ROUTER = join(learnerSrc, 'app/router.tsx');
const APP_SHELL = join(learnerSrc, 'screens/AppShell.tsx');
const ICONS = join(learnerSrc, 'components/icons.tsx');
const APP_CSS = join(learnerSrc, 'styles/app.css');

/** Never throw on a missing file: a clean empty string yields clean red output. */
const read = (path: string): string => (existsSync(path) ? readFileSync(path, 'utf8') : '');

/** The `mc-curriculum*` styles are one contiguous, labelled block in app.css. */
const curriculumCssBlock = (css: string): string => {
  const start = css.indexOf('/* ---- Curriculum');
  const end = css.indexOf('/* ---- Focus mode ----', start);
  return start >= 0 && end > start ? css.slice(start, end) : '';
};

/** Extract a whole `@media` block (with brace matching) by its prelude text. */
const mediaBlock = (css: string, prelude: string): string => {
  const start = css.indexOf(prelude);
  if (start < 0) return '';
  const open = css.indexOf('{', start);
  if (open < 0) return '';
  let depth = 0;
  for (let i = open; i < css.length; i += 1) {
    if (css[i] === '{') depth += 1;
    else if (css[i] === '}') {
      depth -= 1;
      if (depth === 0) return css.slice(start, i + 1);
    }
  }
  return '';
};

describe('Curriculum tab source contract', () => {
  it('ships a Curriculum screen wired into the route table and navigation', () => {
    expect(existsSync(CURRICULUM_SCREEN)).toBe(true);

    const router = read(ROUTER);
    expect(router).toMatch(/import\s*\{\s*Curriculum\s*\}\s*from\s*'\.\.\/screens\/Curriculum'/);
    // The route element is bound to the Curriculum screen in one place.
    expect(router).toMatch(/\{\s*path:\s*'curriculum',\s*element:\s*<Curriculum\s*\/>\s*,?\s*\}/);

    const shell = read(APP_SHELL);
    // Curriculum joins the shared NAV so both the desktop sidebar and the
    // five-item mobile bottom nav render it, immediately after Home.
    expect(shell).toMatch(/label:\s*'Curriculum'/);
    expect(shell).toMatch(/IconCurriculum/);
    const homeIdx = shell.search(/label:\s*'Home'/);
    const currIdx = shell.search(/label:\s*'Curriculum'/);
    const recallIdx = shell.search(/label:\s*'Recall'/);
    expect(homeIdx).toBeGreaterThanOrEqual(0);
    expect(currIdx).toBeGreaterThan(homeIdx);
    expect(recallIdx).toBeGreaterThan(currIdx);
    // Skills remains a desktop-only secondary link (not part of the shared NAV).
    expect(shell).toMatch(/to="\/app\/skills"/);

    const icons = read(ICONS);
    expect(icons).toMatch(/export const IconCurriculum\b/);
    // Matches the existing 24px currentColor stroke icon convention (base(p)).
    expect(icons).toMatch(/IconCurriculum[\s\S]*?base\(p\)/);
  });

  it('renders from the checked-in generated learner-safe manifest', () => {
    // The exact student-facing phase labels the screen must render, in order.
    expect(CURRICULUM_PHASES.map((phase) => phase.label)).toEqual([
      'Foundations',
      'Core Models',
      'Integrated Reasoning',
      'Transfer and Application',
      'Review and Readiness',
    ]);

    const src = read(CURRICULUM_SCREEN);
    expect(src).toMatch(/from\s*'\.\.\/data\/curriculum-v3\.generated'/);
    expect(src).toMatch(/CURRICULUM_PHASES/);
    // Renders only real navigation fields from the manifest.
    for (const field of ['label', 'title', 'shortTitle', 'position', 'kcs', 'revisitCount']) {
      expect(src).toContain(`.${field}`);
    }
    // Navigation data remains local and learner-safe. The one enabled target may
    // use the shared query/navigation seams, but this screen never performs raw
    // fetches, reads authority configuration, or imports server content.
    expect(src).not.toMatch(/\bfetch\(|VITE_AUTHORITY/);
    expect(src).not.toMatch(/@mcat\/(?:content|authority-core)/);
    expect(src).not.toMatch(/<input\b/);
    expect(src).not.toMatch(/capstone/i);
  });

  it('uses exact, calm, source-backed, non-fabricated learner language', () => {
    const src = read(CURRICULUM_SCREEN);
    expect(src).toMatch(/<h1[^>]*>\s*Curriculum\s*</);
    // One independent disclosure per lesson, exactly labeled.
    expect(src).toContain("What you'll learn (");
    // CARS lane marker, subtle but present.
    expect(src).toContain('CARS · parallel practice');
    // Unauthored lessons: visible, honest, non-clickable.
    expect(src).toContain('Coming soon');
    // Zero-lesson modules explicitly state no new lesson is added.
    expect(src).toMatch(/no new lesson/i);
    // Neutral, source-backed framing for cumulative review / integration.
    expect(src).toMatch(/cumulative review|integration/i);
    // No efficacy, readiness, or mastery claims. Honest target run status is
    // allowed now that exactly one lesson is launchable.
    expect(src).not.toMatch(
      /guarantee|boost your score|score prediction|readiness score|mastered|exam.ready/i,
    );
    // No unsupported "spaced review" claim and no live-authorship implication.
    expect(src).not.toMatch(/spaced review/i);
    expect(src).not.toMatch(/\b(?:written|authoring|authored)\b/i);
  });

  it('implements an accessible five-phase path/stepper with wrapping keyboard support', () => {
    const src = read(CURRICULUM_SCREEN);
    expect(src).toMatch(/role="tablist"/);
    expect(src).toMatch(/role="tab"/);
    expect(src).toMatch(/role="tabpanel"/);
    expect(src).toMatch(/aria-selected/);
    expect(src).toMatch(/aria-controls/);
    // Roving tabindex.
    expect(src).toMatch(/tabIndex/);
    // Arrow/Home/End keyboard model.
    for (const key of ['ArrowRight', 'ArrowLeft', 'Home', 'End']) {
      expect(src).toContain(key);
    }
    // ArrowRight wraps last -> first and ArrowLeft wraps first -> last (modulo).
    expect(src).toMatch(/\+\s*1\)\s*%\s*phaseCount/);
    expect(src).toMatch(/-\s*1\s*\+\s*phaseCount\)\s*%\s*phaseCount/);
    // Home/End remain absolute (first / last), not wrapped.
    expect(src).toMatch(/selectPhase\(0\)/);
    expect(src).toMatch(/selectPhase\(phaseCount - 1\)/);
  });

  it('unifies every module (incl. zero-lesson) into one collapsible pattern', () => {
    const src = read(CURRICULUM_SCREEN);
    // Collapsible disclosure primitives.
    expect(src).toMatch(/aria-expanded/);
    expect(src).toMatch(/aria-controls=\{regionId\}/);
    // The controlled panel is a nameable group (role="group") labelled by its
    // module heading button (headingId): the button↔panel relationship is
    // bidirectional and standards-valid, without adding region landmarks.
    expect(src).toContain('aria-labelledby={headingId}');
    expect(src).toContain('role="group"');
    expect(src).toMatch(/id=\{regionId\}[\s\S]*?role="group"[\s\S]*?aria-labelledby=\{headingId\}/);
    // A single module render path (no static/non-collapsible branch remains).
    expect((src.match(/<section className="mc-curriculum__module/g) ?? []).length).toBe(1);
    expect(src).not.toContain('mc-curriculum__module--static');
    expect(src).not.toContain('mc-curriculum__module-head');
    expect(src).not.toContain('mc-curriculum__checkpoint');
    // Zero-lesson bodies live inside the collapsible region as truthful notes.
    expect(src).toContain('mc-curriculum__region');
    expect(src).toContain('mc-curriculum__note');
    // First module opens by default and stays user-closable across phase switch.
    expect(src).toMatch(/setOpenModuleIds\(new Set\(\[firstModuleId/);
  });

  it('gives each lesson a real name and wires Coming soon to the disabled Start', () => {
    const src = read(CURRICULUM_SCREEN);
    // Exactly one `<details>` render path in the source: the single KC
    // disclosure inside LessonCard (rendered once per lesson at runtime).
    expect((src.match(/<details\b/g) ?? []).length).toBe(1);
    expect(src).toMatch(/<summary\b/);
    // Zero-padded global lesson ordinal (1..114 -> 001..114).
    expect(src).toMatch(/padStart\(\s*3/);
    // Lesson article is programmatically named by a real heading.
    expect(src).toMatch(/<article[^>]*aria-labelledby=\{titleId\}/);
    expect(src).toMatch(/<h4[^>]*id=\{titleId\}/);
    // Coming soon has an id, associated with the disabled Start via describedby,
    // and Start carries a lesson-specific accessible name.
    expect(src).toContain('id={soonId}');
    expect(src).toContain('aria-describedby={soonId}');
    expect(src).toContain('aria-label={`Start ');
    // The disabled attribute belongs to the Start Button itself.
    expect(src).toMatch(/<Button[\s\S]*?\bdisabled\b[\s\S]*?>\s*Start\s*<\/Button>/);
  });

  it('keeps curriculum CSS token-only and responsive without page overflow', () => {
    const css = read(APP_CSS);
    const block = curriculumCssBlock(css);
    expect(block).not.toBe('');

    // Token-driven only: no hardcoded hex colors in the curriculum block.
    expect(block).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    // The phase path scrolls horizontally on narrow screens (no page overflow).
    expect(block).toMatch(/\.mc-curriculum__path\s*\{[^}]*overflow-x:\s*auto/s);
    // 48px touch targets via the shared token.
    expect(block).toContain('var(--mc-touch)');
    // Obsolete static-only styles are gone.
    expect(block).not.toContain('mc-curriculum__module--static');
    expect(block).not.toContain('mc-curriculum__checkpoint');

    // Five-item bottom nav fit RULES for narrow screens. This is a source
    // contract on the responsive rules — a shrinkable grid, min-width:0, trimmed
    // padding, and a label kept at the documented 12px type token — NOT a
    // geometric proof that "Curriculum" fits at any given width (that needs a
    // real browser/device pass).
    expect(css).toContain('repeat(5, minmax(0, 1fr))');
    expect(css).toMatch(/\.mc-tab\s*\{[^}]*min-width:\s*0/s);

    const narrowNav = mediaBlock(css, '@media (max-width: 400px)');
    expect(narrowNav).not.toBe('');
    // The label never drops below the documented 12px token (no sub-token rem/px).
    expect(narrowNav).toMatch(/\.mc-tab__label\s*\{[^}]*font-size:\s*var\(--mc-text-12\)/s);
    expect(narrowNav).not.toMatch(/font-size:\s*[\d.]+(?:rem|px)/);
    // Room is bought with zero horizontal padding, not clipping or ellipsis.
    expect(narrowNav).toMatch(/padding-left:\s*0/);
    expect(narrowNav).not.toMatch(/text-overflow:\s*ellipsis/);
  });
});
