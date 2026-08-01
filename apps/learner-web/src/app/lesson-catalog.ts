import { ATLAS_LESSON_CLUSTER, type SkillCluster } from '@mcat/contracts';

import { CURRICULUM_PHASES, type CurriculumLesson } from '../data/curriculum-v3.generated';

/**
 * The Real Lesson Catalog registration manifest (Phase 6, wave 6A).
 *
 * ONE explicit list of the lessons the learner app may actually serve, replacing
 * the implicit couplings the app grew: `APP_NATIVE_LESSONS` (14 preview scripts)
 * being read as a servability source, and `Curriculum.tsx`'s single hard-coded
 * `TARGET_LESSON_ID`. Today's Path candidates (`today-queries.ts`), the Curriculum
 * play affordances (`Curriculum.tsx`), and the router all read THIS manifest, so a
 * lesson is servable in exactly one place.
 *
 * The manifest is deliberately browser-safe: it imports only `@mcat/contracts`
 * (pure) and the checked-in generated curriculum, never `@mcat/content` (which is
 * node-only). The full R1–R15 artifact validation is the server/CI merge gate
 * (`lesson-validate`, Phase 4); the boot guard here is the browser-side half — it
 * cross-checks every registered entry against the two browser-safe sources of
 * truth (the generated curriculum and the cluster atlas) and THROWS on the first
 * inconsistency, so a mis-registered lesson crashes the app at load rather than
 * silently serving broken or mislabelled content.
 *
 * Deferred (roadmap): the "manual editorial review" gate leg the retired plan
 * imagined is intentionally NOT modelled here — registration gates on structural
 * validation only (decision D10). A future editorial-signoff field can extend
 * `RegisteredLesson` without changing its readers.
 */

/** Which delivery machine plays a lesson. L1 keeps its bespoke vector runtime; every other catalog lesson runs on the shared normalized engine (per-grammar dispatch, Phase 5). */
export type LessonRuntimeKind = 'vector' | 'normalized';

/** Provisional MCAT-section bucket used only for planner exam-weight hints; `null` for cross-cutting foundational skills. */
export type LessonSection = 'cars' | 'bb' | 'cp' | 'ps';

export interface RegisteredLesson {
  /** Canonical lesson id (`V3-LES-######`). The identity the authority scores against. */
  readonly lessonId: string;
  /**
   * Route + API slug. For L1 this is its friendly topic slug (`vectors-and-trigonometry`);
   * for normalized lessons it is the lower-cased id (`v3-les-789208`), matching the
   * server's `NORMALIZED_LESSON_ROUTE_SLUGS` registry. The candidate sent to the
   * planner carries this slug, and navigation resolves it back to `routePath`.
   */
  readonly slug: string;
  readonly runtime: LessonRuntimeKind;
  /** Learner-facing title. Pinned to the curriculum's `shortTitle` by the boot guard. */
  readonly title: string;
  readonly section: LessonSection | null;
  /** Skill cluster. Pinned to `ATLAS_LESSON_CLUSTER` by the boot guard. */
  readonly cluster: SkillCluster;
  /**
   * Authoring estimate of lesson length. The lesson artifacts do NOT yet carry a
   * duration field (confirmed against `content/lessons/*`; the Phase-3
   * computed-quality check reports it N/A), so this is an explicit product estimate
   * — roadmap: thread a real duration once artifacts expose one.
   */
  readonly estimatedMinutes: number;
  /** Ordered required KCs. Pinned to the curriculum's ordered KC list by the boot guard. */
  readonly kcIds: readonly string[];
  /** Hard prerequisites, each of which MUST be another registered lesson (closed set). */
  readonly prerequisiteLessonIds: readonly string[];
  /** Full in-app route that plays the lesson. Always `/app/lessons/<slug>`. */
  readonly routePath: string;
}

export class LessonRegistryError extends Error {
  constructor(message: string) {
    super(`lesson registry invalid: ${message}`);
    this.name = 'LessonRegistryError';
  }
}

const LESSON_ID_PATTERN = /^V3-LES-\d{6}$/;
const MAX_PLAUSIBLE_MINUTES = 120;

/** Every checked-in curriculum lesson, indexed by id — the browser-safe catalog the guard cross-checks against. */
const CURRICULUM_LESSON_BY_ID: ReadonlyMap<string, CurriculumLesson> = (() => {
  const index = new Map<string, CurriculumLesson>();
  for (const phase of CURRICULUM_PHASES) {
    for (const module of phase.modules) {
      for (const lesson of module.lessons) index.set(lesson.id, lesson);
    }
  }
  return index;
})();

/**
 * Reject any registry that is not internally coherent and consistent with the two
 * browser-safe sources of truth. Every branch throws `LessonRegistryError`, so the
 * module-load call below turns a mis-registration into an immediate boot failure.
 */
export function assertValidLessonRegistry(lessons: readonly RegisteredLesson[]): void {
  if (lessons.length === 0) {
    throw new LessonRegistryError('at least one lesson must be servable');
  }

  const seenIds = new Set<string>();
  const seenSlugs = new Set<string>();
  const seenRoutes = new Set<string>();

  for (const lesson of lessons) {
    if (!LESSON_ID_PATTERN.test(lesson.lessonId)) {
      throw new LessonRegistryError(`"${lesson.lessonId}" is not a V3-LES-###### id`);
    }
    if (seenIds.has(lesson.lessonId)) {
      throw new LessonRegistryError(`duplicate lesson id ${lesson.lessonId}`);
    }
    seenIds.add(lesson.lessonId);

    if (seenSlugs.has(lesson.slug)) {
      throw new LessonRegistryError(`duplicate slug "${lesson.slug}" (${lesson.lessonId})`);
    }
    seenSlugs.add(lesson.slug);

    if (seenRoutes.has(lesson.routePath)) {
      throw new LessonRegistryError(`duplicate route "${lesson.routePath}" (${lesson.lessonId})`);
    }
    seenRoutes.add(lesson.routePath);

    // The route is a pure function of the slug — one shape for the whole catalog,
    // so a new lesson can never invent a bespoke path the router doesn't expect.
    if (lesson.routePath !== `/app/lessons/${lesson.slug}`) {
      throw new LessonRegistryError(
        `${lesson.lessonId} route "${lesson.routePath}" must be "/app/lessons/${lesson.slug}"`,
      );
    }

    const curriculum = CURRICULUM_LESSON_BY_ID.get(lesson.lessonId);
    if (curriculum === undefined) {
      throw new LessonRegistryError(`${lesson.lessonId} is absent from the curriculum manifest`);
    }
    if (lesson.title !== curriculum.shortTitle) {
      throw new LessonRegistryError(
        `${lesson.lessonId} title "${lesson.title}" != curriculum "${curriculum.shortTitle}"`,
      );
    }

    const curriculumKcIds = curriculum.kcs.map((kc) => kc.id);
    const kcMatches =
      lesson.kcIds.length === curriculumKcIds.length &&
      lesson.kcIds.every((kcId, index) => kcId === curriculumKcIds[index]);
    if (!kcMatches) {
      throw new LessonRegistryError(
        `${lesson.lessonId} kcIds [${lesson.kcIds.join(', ')}] != curriculum [${curriculumKcIds.join(', ')}]`,
      );
    }

    const atlasCluster = ATLAS_LESSON_CLUSTER[lesson.lessonId];
    if (lesson.cluster !== atlasCluster) {
      throw new LessonRegistryError(
        `${lesson.lessonId} cluster "${lesson.cluster}" != atlas "${atlasCluster ?? 'absent'}"`,
      );
    }

    if (
      !Number.isInteger(lesson.estimatedMinutes) ||
      lesson.estimatedMinutes <= 0 ||
      lesson.estimatedMinutes > MAX_PLAUSIBLE_MINUTES
    ) {
      throw new LessonRegistryError(
        `${lesson.lessonId} estimatedMinutes ${lesson.estimatedMinutes} is not a plausible 1..${MAX_PLAUSIBLE_MINUTES} minute count`,
      );
    }
  }

  // Prerequisites are validated last, once every registered id is known, so the
  // closed-set check sees the whole registry regardless of declaration order.
  for (const lesson of lessons) {
    for (const prerequisite of lesson.prerequisiteLessonIds) {
      if (prerequisite === lesson.lessonId) {
        throw new LessonRegistryError(`${lesson.lessonId} lists itself as a prerequisite`);
      }
      if (!seenIds.has(prerequisite)) {
        throw new LessonRegistryError(
          `${lesson.lessonId} prerequisite ${prerequisite} is not a registered lesson`,
        );
      }
    }
  }
}

/**
 * The catalog. Exactly the three real lessons the project makes learner-facing —
 * L1 on its bespoke vector runtime, L2/L3 on the shared normalized engine.
 */
export const REGISTERED_LESSONS: readonly RegisteredLesson[] = [
  {
    lessonId: 'V3-LES-130923',
    slug: 'vectors-and-trigonometry',
    runtime: 'vector',
    title: 'Vectors and Trigonometry',
    section: null,
    cluster: 'R1',
    estimatedMinutes: 12,
    kcIds: ['V3-KC-866848', 'V3-KC-700208', 'V3-KC-159529'],
    prerequisiteLessonIds: [],
    routePath: '/app/lessons/vectors-and-trigonometry',
  },
  {
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
  },
  {
    lessonId: 'V3-LES-844372',
    slug: 'v3-les-844372',
    runtime: 'normalized',
    title: 'Algebra and Graphs',
    section: null,
    cluster: 'R1',
    estimatedMinutes: 12,
    kcIds: ['V3-KC-452593', 'V3-KC-008681', 'V3-KC-238607'],
    prerequisiteLessonIds: [],
    routePath: '/app/lessons/v3-les-844372',
  },
];

// Boot guard: run the structural check at module load so an invalid registration
// fails the whole app immediately, rather than surfacing as a broken lesson later.
assertValidLessonRegistry(REGISTERED_LESSONS);

const REGISTERED_LESSON_BY_ID: ReadonlyMap<string, RegisteredLesson> = new Map(
  REGISTERED_LESSONS.map((lesson) => [lesson.lessonId, lesson]),
);
const REGISTERED_LESSON_BY_SLUG: ReadonlyMap<string, RegisteredLesson> = new Map(
  REGISTERED_LESSONS.map((lesson) => [lesson.slug, lesson]),
);

/** The registered lesson with this id, or `undefined` if the id is not servable. */
export const lessonById = (lessonId: string): RegisteredLesson | undefined =>
  REGISTERED_LESSON_BY_ID.get(lessonId);

/** The registered lesson served under this slug, or `undefined` if the slug is not servable. */
export const lessonBySlug = (slug: string): RegisteredLesson | undefined =>
  REGISTERED_LESSON_BY_SLUG.get(slug);

/** Whether a lesson id is registered (and therefore servable). */
export const isRegisteredLessonId = (lessonId: string): boolean =>
  REGISTERED_LESSON_BY_ID.has(lessonId);
