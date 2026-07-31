import type { LessonPresentationPreview, LessonScriptPreview } from './contract';

// The 14 preview ("app-native") pilot lessons have been RETIRED from the learner
// catalog (Phase 7, p7-retire-previews): the learner-facing catalog is now exactly
// the three real lessons, served by the manifest + normalized runtime. The catalog
// below is intentionally empty, the `/app/lesson/:slug` preview route is gone, and
// nothing schedules or links a preview any more. The remaining files in this
// directory (LessonRenderer + the *.script.ts drafts) are deleted wholesale in the
// next commit (p7-app-native-fate) — this commit only makes previews UNREACHABLE,
// so restoring them requires reverting BOTH commits.
export { LessonRenderer } from './LessonRenderer';
export type { LessonPresentationPreview, LessonScriptPreview } from './contract';

export interface AppNativeLessonEntry {
  readonly script: LessonScriptPreview;
  readonly presentation: LessonPresentationPreview;
}

export const APP_NATIVE_LESSONS: readonly AppNativeLessonEntry[] = [];

export function getAppNativeLesson(slug: string | null): AppNativeLessonEntry | null {
  if (slug === null) return null;
  return APP_NATIVE_LESSONS.find((entry) => entry.script.slug === slug) ?? null;
}
