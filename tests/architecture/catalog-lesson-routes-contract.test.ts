import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { REGISTERED_LESSONS } from '../../apps/learner-web/src/app/lesson-catalog';
import { DB_BACKED_LESSONS } from '../../apps/learner-web/src/app/registered-lessons.generated';

/**
 * Phase 6 wave 6B contract: the registration manifest is the app's sole servability
 * source. Two lesson populations now coexist:
 *  - the three bespoke PILOTS (L1 vector + two normalized) served from on-disk
 *    content/lessons/* on explicit routes, and
 *  - the DB-BACKED build-a catalog (the 111 canonical lessons) served from Aurora
 *    through ONE dynamic normalized route (no per-lesson routes/components).
 * Both play through L1's shared route shape; a mis-registration still fails CI here.
 */

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const learnerSrc = join(root, 'apps/learner-web/src');
const routerPath = join(learnerSrc, 'app/router.tsx');
const curriculumPath = join(learnerSrc, 'screens/Curriculum.tsx');
const playerPath = join(learnerSrc, 'screens/CatalogLesson.tsx');
const read = (path: string): string => (existsSync(path) ? readFileSync(path, 'utf8') : '');

const PILOT_IDS = ['V3-LES-130923', 'V3-LES-789208', 'V3-LES-844372'];
const DB_BACKED_IDS = new Set(DB_BACKED_LESSONS.map((seed) => seed.lessonId));

describe('Real Lesson Catalog routes + servability contract', () => {
  it('registers the three pilots plus the DB-backed build-a catalog on the canonical route shape', () => {
    const ids = REGISTERED_LESSONS.map((lesson) => lesson.lessonId);
    // The three bespoke pilots remain registered.
    expect(ids).toEqual(expect.arrayContaining(PILOT_IDS));
    // Every DB-backed build-a lesson is registered exactly once.
    for (const seed of DB_BACKED_LESSONS) expect(ids).toContain(seed.lessonId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(REGISTERED_LESSONS.length).toBe(PILOT_IDS.length + DB_BACKED_LESSONS.length);
    for (const lesson of REGISTERED_LESSONS) {
      expect(lesson.routePath).toBe(`/app/lessons/${lesson.slug}`);
    }
  });

  it('router serves the pilots explicitly and the DB-backed catalog via one dynamic route', () => {
    const router = read(routerPath);
    // L1 keeps its bespoke screen; the two normalized pilots keep explicit routes.
    expect(router).toMatch(/lessons\/vectors-and-trigonometry'[\s\S]*?<VectorLesson/);
    expect(router).toMatch(/path:\s*'lessons\/v3-les-789208'/);
    expect(router).toMatch(/path:\s*'lessons\/v3-les-844372'/);
    // The 111 build-a lessons play through ONE dynamic route (no per-lesson routes),
    // resolving the slug to a registered lesson and rendering the shared player.
    expect(router).toMatch(/path:\s*'lessons\/:lessonSlug'/);
    expect(router).toMatch(/<NormalizedCatalogRoute\s*\/>/);
    expect(router).toMatch(/lessonBySlug\(/);
    expect(router).toMatch(/<CatalogLesson\s+lessonId=\{/);
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

  // Registration plumbing: a FILE-BACKED (pilot) registered lesson MUST have real
  // authored content on disk, or it would 404/500 at launch (that Lambda serves the
  // pilots from content/lessons/*). DB-backed build-a lessons are served from Aurora
  // (their content is verified by the importer + provider tests), so they are
  // exempt from the on-disk check.
  it('every FILE-BACKED registered lesson has authored content on disk (no phantom registrations)', () => {
    for (const lesson of REGISTERED_LESSONS) {
      if (DB_BACKED_IDS.has(lesson.lessonId)) continue; // served from Aurora, not disk
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
