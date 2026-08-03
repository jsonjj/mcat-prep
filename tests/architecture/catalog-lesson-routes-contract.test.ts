import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { REGISTERED_LESSONS } from '../../apps/learner-web/src/app/lesson-catalog';

/**
 * Phase 6 wave 6B contract: the registration manifest is the app's sole
 * servability source, and every registered lesson has a real playable route of
 * L1's shape. This is the "route test + three-entry render" evidence the plan
 * requires — pinned against the manifest itself, so it can never drift from what
 * the app actually serves.
 */

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const learnerSrc = join(root, 'apps/learner-web/src');
const routerPath = join(learnerSrc, 'app/router.tsx');
const curriculumPath = join(learnerSrc, 'screens/Curriculum.tsx');
const playerPath = join(learnerSrc, 'screens/CatalogLesson.tsx');
const read = (path: string): string => (existsSync(path) ? readFileSync(path, 'utf8') : '');

describe('Real Lesson Catalog routes + servability contract', () => {
  it('registers exactly the three real lessons, each on the one canonical route shape', () => {
    expect(REGISTERED_LESSONS.map((lesson) => lesson.lessonId)).toEqual([
      'V3-LES-130923',
      'V3-LES-789208',
      'V3-LES-844372',
    ]);
    for (const lesson of REGISTERED_LESSONS) {
      expect(lesson.routePath).toBe(`/app/lessons/${lesson.slug}`);
    }
  });

  it('router serves a real route for every registered lesson, matching runtime to renderer', () => {
    const router = read(routerPath);
    for (const lesson of REGISTERED_LESSONS) {
      expect(router).toMatch(new RegExp(`path:\\s*'lessons/${lesson.slug}'`));
    }
    // L1 keeps its bespoke screen; every normalized lesson plays through the shared
    // CatalogLesson on its own id.
    expect(router).toMatch(/lessons\/vectors-and-trigonometry'[\s\S]*?<VectorLesson/);
    for (const lesson of REGISTERED_LESSONS.filter((entry) => entry.runtime === 'normalized')) {
      expect(router).toMatch(
        new RegExp(`<CatalogLesson\\s+lessonId="${lesson.lessonId}"`),
      );
    }
  });

  it('the shared catalog player is server-authoritative and ships no answer key', () => {
    expect(existsSync(playerPath)).toBe(true);
    const player = read(playerPath);
    // It reads the slug-scoped run/submit seam — never a raw fetch or authority config.
    expect(player).toMatch(/useNormalizedLessonRun/);
    expect(player).toMatch(/useSubmitNormalizedLessonAction/);
    expect(player).not.toMatch(/\bfetch\(|VITE_AUTHORITY/);
    // No answer-key vocabulary ever reaches the learner player.
    expect(player).not.toMatch(/correctChoiceId|answerKey|accepted_responses|response_authority/i);
  });

  it('Curriculum drives launchability from the manifest and navigates to manifest routes', () => {
    const source = read(curriculumPath);
    expect(source).toMatch(/lessonById\(lesson\.id\)/);
    // The normalized launch goes to the manifest's own route, never a preview slug.
    expect(source).toMatch(/navigate\(registered\.routePath\)/);
    expect(source).not.toMatch(/\/app\/lesson\//);
  });

  // Registration plumbing (for lessons authored as they land): a registered lesson
  // MUST have real authored content on disk, or it would 404/500 the moment a
  // learner launches it in prod (the Lambda serves lessons from content/lessons/*,
  // keyed by the lower-cased lesson id). This catches a "phantom" registration —
  // an entry added to the manifest before its content artifacts exist — at CI time
  // rather than at runtime. See docs/lesson-registration.md for the full steps.
  it('every registered lesson has authored content on disk (no phantom registrations)', () => {
    for (const lesson of REGISTERED_LESSONS) {
      const scriptPath = join(
        root,
        'content/lessons',
        lesson.lessonId.toLowerCase(),
        'lesson-script.json',
      );
      expect(
        existsSync(scriptPath),
        `${lesson.lessonId} is registered but its content is missing at ${scriptPath} — add the lesson artifacts under content/lessons/${lesson.lessonId.toLowerCase()}/ (see docs/lesson-registration.md)`,
      ).toBe(true);
    }
  });
});
