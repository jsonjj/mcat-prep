import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const learnerSrc = join(root, 'apps/learner-web/src');
const routerPath = join(learnerSrc, 'app/router.tsx');
const accessGatePath = join(learnerSrc, 'app/AppAccessGate.tsx');
const appShellPath = join(learnerSrc, 'screens/AppShell.tsx');
const focusedShellPath = join(learnerSrc, 'screens/FocusedLessonShell.tsx');
const catalogLessonPath = join(learnerSrc, 'screens/CatalogLesson.tsx');
const cssPath = join(learnerSrc, 'styles/app.css');
const read = (path: string): string => (existsSync(path) ? readFileSync(path, 'utf8') : '');

describe('focused lesson shell architecture', () => {
  it('shares auth and mandatory onboarding gates across every app route', () => {
    const gate = read(accessGatePath);
    const router = read(routerPath);

    expect(gate).toMatch(/export function AppAccessGate/);
    expect(gate).toMatch(/<RequireAuth>/);
    expect(gate).toMatch(/useBootstrap/);
    expect(gate).toMatch(
      /authenticated === true[\s\S]*?!bootstrap\.data\.onboardingComplete[\s\S]*?<Navigate to="\/onboarding" replace/,
    );
    expect(gate).toMatch(/<Outlet\s*\/>/);
    expect(router).toMatch(/path:\s*'\/app'[\s\S]*?element:\s*<AppAccessGate\s*\/>/);
  });

  it('keeps ordinary routes in AppShell and lesson routes in its focused sibling', () => {
    const router = read(routerPath);

    expect(router).toMatch(
      /element:\s*<AppShell\s*\/>[\s\S]*?path:\s*'curriculum'[\s\S]*?path:\s*'today'/,
    );
    expect(router).toMatch(
      /element:\s*<FocusedLessonShell\s*\/>[\s\S]*?path:\s*'lessons\/vectors-and-trigonometry'[\s\S]*?path:\s*'lessons\/v3-les-789208'[\s\S]*?path:\s*'lessons\/v3-les-844372'/,
    );
  });

  it('leaves AppShell visual-only while retaining its ordinary app chrome', () => {
    const shell = read(appShellPath);

    expect(shell).not.toMatch(/useBootstrap|Navigate/);
    expect(shell).toContain('mc-sidebar');
    expect(shell).toContain('mc-bottomnav');
    expect(shell).toContain('Account');
    expect(shell).toContain('Today');
    expect(shell).toContain('Practice');
    expect(shell).toContain('Recall');
  });

  it('renders only skip, minimal context, lesson content, and local lesson exits', () => {
    const shell = read(focusedShellPath);

    expect(shell).toMatch(/<SkipLink\s+targetId="focused-lesson-main"/);
    expect(shell).toMatch(/<main\s+id="focused-lesson-main"/);
    expect(shell).toMatch(/<Outlet\s*\/>/);
    expect(shell).not.toMatch(/<div className="mc-brand"[^>]*aria-label/);
    expect(shell).not.toMatch(/NavLink|<nav\b|mc-sidebar|mc-bottomnav/);
    expect(shell).not.toMatch(/\bAccount\b|\bToday\b|\bPractice\b|\bRecall\b/);
  });

  it('uses canonical screen fields and never names protected learner data', () => {
    const player = read(catalogLessonPath);

    expect(player).toMatch(/screen\.contentBlocks\.map/);
    expect(player).toMatch(/screen\.control\.kind/);
    expect(player).not.toMatch(/screen\.choices/);
    expect(player).not.toMatch(/correctChoiceId|answerKey|rationale|protectedRef|sourceId/i);
  });

  it('provides shrink-safe focused layouts at 375px and 320px without bottom-nav clearance', () => {
    const css = read(cssPath);

    expect(css).toMatch(/\.mc-focused-lesson-shell\s*\{[^}]*min-width:\s*0/s);
    expect(css).toMatch(/\.mc-focused-lesson-shell__main\s*\{[^}]*min-width:\s*0/s);
    expect(css).toMatch(/@media \(max-width:\s*375px\)[\s\S]*?mc-focused-lesson-shell/);
    expect(css).toMatch(/@media \(max-width:\s*320px\)[\s\S]*?mc-focused-lesson-shell/);
    expect(css).not.toMatch(/\.mc-focused-lesson-shell__main\s*\{[^}]*calc\(var\(--mc-touch\)/s);
  });
});
