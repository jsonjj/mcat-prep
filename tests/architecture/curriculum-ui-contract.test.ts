import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CURRICULUM_PHASES } from '../../apps/learner-web/src/data/curriculum-v3.generated';
import { describe, expect, it } from 'vitest';

/**
 * Source contract for the learner Curriculum tab, now a ZOOMABLE, self-similar
 * DRILL-DOWN (Path → Phase → Module → Lesson → KC). This is a node-environment
 * architecture test (no DOM): it verifies the screen, route, navigation, and
 * icon exist, that the screen consumes the checked-in generated manifest, and
 * that it carries the exact calm learner language, honest disabled Start,
 * URL-driven drill state, accessible breadcrumb navigation, a responsive
 * child-card grid, and warrant-derived KC status — without dictating incidental
 * markup, so it stays resilient to reasonable design choices.
 *
 * The SEMANTIC invariants are unchanged from the previous browse-only design and
 * are preserved verbatim (never claim mastery from a display mean, never
 * fabricate 0% for un-practiced items, honest server-authoritative launch, calm
 * source-backed language). Only the STRUCTURAL assertions moved: the phase
 * tablist/stepper and the single-collapsible-module pattern were replaced by the
 * breadcrumb drill-down and the card grid, so their DOM/class assertions were
 * rewritten to the new structure. These are stable acceptance contracts; they
 * do not replace browser/responsive QA.
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
    // Skills was merged into Progress — it is no longer a top-level nav link.
    expect(shell).not.toMatch(/to="\/app\/skills"/);

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
    // Navigation data remains local and learner-safe. The launchable targets may
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
    // allowed now that lessons carry a launchable seam.
    expect(src).not.toMatch(
      /guarantee|boost your score|score prediction|readiness score|mastered|exam.ready/i,
    );
    // No unsupported "spaced review" claim and no live-authorship implication.
    expect(src).not.toMatch(/spaced review/i);
    expect(src).not.toMatch(/\b(?:written|authoring|authored)\b/i);
  });

  it('implements an accessible breadcrumb drill-down driven by shareable URL params', () => {
    const src = read(CURRICULUM_SCREEN);
    // Drill state lives in the URL so a view is shareable + back-button friendly.
    expect(src).toMatch(/useSearchParams/);
    for (const param of ['phase', 'module', 'lesson']) {
      expect(src).toContain(`searchParams.get('${param}')`);
    }
    // The breadcrumb is a nav landmark with a marked current node, and a
    // "Zoom out" affordance walks one level back up.
    expect(src).toContain('aria-label="Breadcrumb"');
    expect(src).toContain('aria-current="page"');
    expect(src).toContain('Zoom out');
    // The `?lesson=` deep-link (Practice → Curriculum) still resolves through the
    // reverse index to that lesson, so it never dead-ends.
    expect(src).toMatch(/LESSON_LOCATION/);
    // Zooming moves focus to the new node's heading; the heading is
    // programmatically focusable (roving-free managed focus).
    expect(src).toMatch(/tabIndex=\{-1\}/);
    expect(src).toMatch(/\.focus\(\)/);
    // The retired phase tablist/stepper is gone.
    expect(src).not.toContain('role="tablist"');
    expect(src).not.toContain('role="tab"');
  });

  it('renders a self-similar child-card grid, heat-strips, and warrant-derived KC status', () => {
    const src = read(CURRICULUM_SCREEN);
    // A responsive grid of child cards is the repeating unit at every level.
    expect(src).toContain('mc-curriculum__grid');
    expect(src).toContain('mc-curriculum__card');
    // Each card previews the level below it with a mini heat-strip.
    expect(src).toContain('mc-curriculum__heat');
    // The deepest level shows QUALITATIVE, warrant-derived KC status — never a
    // per-KC number — with its provenance stated plainly.
    expect(src).toContain('Due for review');
    expect(src).toContain('Per-skill status comes from your practice evidence.');
    // Freshness comes from the evidence warrant; capability stays a separate
    // display mean, so the two signals are never conflated.
    expect(src).toMatch(/useMasteryMap/);
    expect(src).toMatch(/refreshNeeded/);
    // Zero-lesson modules render as distinct dashed review cards (no Start),
    // stated as truthful notes rather than a launchable lesson.
    expect(src).toContain('mc-curriculum__card--review');
    expect(src).toContain('mc-curriculum__note');
    // The retired single-collapsible-module pattern is gone.
    expect(src).not.toContain('mc-curriculum__module--static');
    expect(src).not.toContain('mc-curriculum__checkpoint');
  });

  it('never fabricates 0% and rolls capability up as an evidenced mean only', () => {
    const src = read(CURRICULUM_SCREEN);
    // The per-node ring is the MEAN of evidenced lessons' `pL`; a node with no
    // evidenced lesson returns null (a neutral "Not started" ring), never 0.
    expect(src).toMatch(/lessonMeanPct/);
    expect(src).toMatch(/return scored > 0 \? Math\.round\(\(sum \/ scored\) \* 100\) : null/);
    // Phase and module rollups reuse that same evidenced-mean helper.
    expect(src).toMatch(/phaseAverageMasteryPct/);
    expect(src).toMatch(/moduleAverageMasteryPct/);
    // The display mean (`pL`) is never compared to a threshold in this screen.
    expect(src).not.toMatch(/pL\s*[<>]=?/);
    expect(src).toContain('Not started');
  });

  it('gives each lesson a real name and wires Coming soon to the disabled Start', () => {
    const src = read(CURRICULUM_SCREEN);
    // Exactly one `<details>` render path in the source: the single KC
    // disclosure inside the lesson card (rendered once per lesson at runtime).
    expect((src.match(/<details\b/g) ?? []).length).toBe(1);
    expect(src).toMatch(/<summary\b/);
    // Zero-padded global lesson ordinal (1..114 -> 001..114).
    expect(src).toMatch(/padStart\(\s*3/);
    // A card is programmatically named by a real heading.
    expect(src).toMatch(/<article[^>]*aria-labelledby=\{titleId\}/);
    expect(src).toMatch(/<h3[^>]*id=\{titleId\}/);
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
    // The child grid is two-up and shrink-safe (min-width:0 via minmax), and
    // collapses to a single column on mobile — no page overflow.
    expect(block).toContain('repeat(2, minmax(0, 1fr))');
    expect(block).toMatch(
      /@media \(max-width: 720px\)[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\)/,
    );
    // 48px touch targets via the shared token (Zoom out, lens toggle).
    expect(block).toContain('var(--mc-touch)');
    // Obsolete stepper / static-only styles are gone.
    expect(block).not.toContain('mc-curriculum__step');
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
