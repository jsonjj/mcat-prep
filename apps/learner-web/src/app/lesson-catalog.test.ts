import { describe, expect, it } from 'vitest';

import {
  assertValidLessonRegistry,
  isRegisteredLessonId,
  lessonById,
  lessonBySlug,
  LessonRegistryError,
  REGISTERED_LESSONS,
  type RegisteredLesson,
} from './lesson-catalog';
import { DB_BACKED_LESSONS } from './registered-lessons.generated';

/**
 * The registration manifest is the app's SOLE servability source, so its boot
 * guard is a safety-critical seam: it must accept exactly the real catalog and
 * reject anything internally incoherent or inconsistent with the checked-in
 * curriculum / cluster atlas. A mis-registration must crash the app at load, never
 * surface later as a broken lesson.
 */

/** A valid base entry (a real registered lesson) each negative case perturbs into one specific defect. */
const VALID_BASE: RegisteredLesson = {
  lessonId: 'V3-LES-789208',
  slug: 'v3-les-789208',
  runtime: 'normalized',
  title: 'Quantitative Measurement and Scaling',
  section: null,
  cluster: 'R1',
  estimatedMinutes: 15,
  kcIds: ['V3-KC-399019', 'V3-KC-799492', 'V3-KC-919842', 'V3-KC-981438'],
  prerequisiteLessonIds: [],
  routePath: '/app/lessons/v3-les-789208',
};

const withEntry = (override: Partial<RegisteredLesson>): RegisteredLesson => ({
  ...VALID_BASE,
  ...override,
});

describe('the registration manifest', () => {
  it('registers the three pilots plus the DB-backed build-a catalog on their real runtimes', () => {
    // The three pilots lead the manifest on their bespoke runtimes (L1 vector; L2/L3
    // normalized), followed by the DB-backed build-a catalog.
    expect(REGISTERED_LESSONS.slice(0, 3).map((lesson) => lesson.lessonId)).toEqual([
      'V3-LES-130923',
      'V3-LES-789208',
      'V3-LES-844372',
    ]);
    expect(REGISTERED_LESSONS.slice(0, 3).map((lesson) => lesson.runtime)).toEqual([
      'vector',
      'normalized',
      'normalized',
    ]);
    // Every DB-backed build-a lesson is registered exactly once on the normalized runtime.
    for (const seed of DB_BACKED_LESSONS) {
      const entry = REGISTERED_LESSONS.find((lesson) => lesson.lessonId === seed.lessonId);
      expect(entry?.runtime).toBe('normalized');
    }
    const ids = REGISTERED_LESSONS.map((lesson) => lesson.lessonId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(REGISTERED_LESSONS.length).toBe(3 + DB_BACKED_LESSONS.length);
    // Every route is the one canonical `/app/lessons/<slug>` shape.
    for (const lesson of REGISTERED_LESSONS) {
      expect(lesson.routePath).toBe(`/app/lessons/${lesson.slug}`);
    }
  });

  it('accepts the real registry (the same check runs at module load)', () => {
    expect(() => assertValidLessonRegistry(REGISTERED_LESSONS)).not.toThrow();
  });

  it('resolves servable lessons by id and slug, and rejects unknown ones', () => {
    expect(lessonById('V3-LES-130923')?.slug).toBe('vectors-and-trigonometry');
    expect(lessonBySlug('v3-les-844372')?.lessonId).toBe('V3-LES-844372');
    expect(isRegisteredLessonId('V3-LES-789208')).toBe(true);

    // A well-formed id that no pilot or build-a lesson uses is not servable.
    expect(lessonById('V3-LES-999999')).toBeUndefined();
    expect(lessonBySlug('biological-redox')).toBeUndefined();
    expect(isRegisteredLessonId('V3-LES-999999')).toBe(false);
  });

  describe('the boot guard rejects', () => {
    it('an empty registry', () => {
      expect(() => assertValidLessonRegistry([])).toThrow(LessonRegistryError);
    });

    it('a malformed lesson id', () => {
      expect(() => assertValidLessonRegistry([withEntry({ lessonId: 'redox-lesson' })])).toThrow(
        /is not a V3-LES/,
      );
    });

    it('a lesson absent from the curriculum manifest', () => {
      // A well-formed id that simply is not part of the checked-in curriculum.
      expect(() =>
        assertValidLessonRegistry([
          withEntry({
            lessonId: 'V3-LES-000000',
            slug: 'v3-les-000000',
            routePath: '/app/lessons/v3-les-000000',
          }),
        ]),
      ).toThrow(/absent from the curriculum/);
    });

    it('a title that does not match the curriculum short title', () => {
      expect(() =>
        assertValidLessonRegistry([withEntry({ title: 'Scientific Notation' })]),
      ).toThrow(/title/);
    });

    it('kcIds that do not match the curriculum ordered KCs', () => {
      // Right KCs, wrong order — must still fail (order is meaningful).
      expect(() =>
        assertValidLessonRegistry([
          withEntry({ kcIds: ['V3-KC-799492', 'V3-KC-399019', 'V3-KC-919842', 'V3-KC-981438'] }),
        ]),
      ).toThrow(/kcIds/);
      // Missing a KC.
      expect(() => assertValidLessonRegistry([withEntry({ kcIds: ['V3-KC-399019'] })])).toThrow(
        /kcIds/,
      );
    });

    it('a cluster that disagrees with the atlas', () => {
      expect(() => assertValidLessonRegistry([withEntry({ cluster: 'BB1' })])).toThrow(/cluster/);
    });

    it('a route that is not derived from the slug', () => {
      expect(() =>
        assertValidLessonRegistry([withEntry({ routePath: '/app/lesson/v3-les-789208' })]),
      ).toThrow(/route/);
    });

    it('an implausible estimated duration', () => {
      expect(() => assertValidLessonRegistry([withEntry({ estimatedMinutes: 0 })])).toThrow(
        /estimatedMinutes/,
      );
      expect(() => assertValidLessonRegistry([withEntry({ estimatedMinutes: 600 })])).toThrow(
        /estimatedMinutes/,
      );
      expect(() => assertValidLessonRegistry([withEntry({ estimatedMinutes: 12.5 })])).toThrow(
        /estimatedMinutes/,
      );
    });

    it('a duplicate id, slug, or route across entries', () => {
      const l1 = REGISTERED_LESSONS[0]!;
      expect(() => assertValidLessonRegistry([l1, l1])).toThrow(/duplicate/);
    });

    it('a prerequisite that is not itself registered', () => {
      expect(() =>
        assertValidLessonRegistry([withEntry({ prerequisiteLessonIds: ['V3-LES-765609'] })]),
      ).toThrow(/prerequisite/);
    });

    it('a lesson that lists itself as a prerequisite', () => {
      expect(() =>
        assertValidLessonRegistry([withEntry({ prerequisiteLessonIds: [VALID_BASE.lessonId] })]),
      ).toThrow(/prerequisite/);
    });
  });
});
