import type { DraftLesson } from './contract';
import aminoAcidChargeLesson from './lessons/amino-acid-charge.lesson';

/**
 * Registry boundary for draft content modules.
 *
 * Adding a lesson requires one import and one argument here; the renderer and
 * App routing stay unchanged. The authoring template is intentionally absent.
 */
export function registerDraftLessons<const Lessons extends readonly DraftLesson[]>(
  ...lessons: Lessons
): Lessons {
  const seenSlugs = new Set<string>();
  for (const lesson of lessons) {
    if (seenSlugs.has(lesson.metadata.slug)) {
      throw new Error(`Duplicate draft lesson slug: ${lesson.metadata.slug}`);
    }
    seenSlugs.add(lesson.metadata.slug);
  }
  return lessons;
}

export const DRAFT_LESSONS = registerDraftLessons(aminoAcidChargeLesson);

export function getDraftLesson(slug: string | null): DraftLesson | null {
  if (slug === null) return null;
  return DRAFT_LESSONS.find((lesson) => lesson.metadata.slug === slug) ?? null;
}
