import { ARGUMENT_STRUCTURE_SCRIPT } from './argument-structure.script';
import { ASSOCIATIVE_LEARNING_SCRIPT } from './associative-learning.script';
import type { LessonPresentationPreview, LessonScriptPreview } from './contract';
import { OPTICS_V2_SCRIPT } from './optics-v2.script';
import {
  ARGUMENT_STRUCTURE_PRESENTATION,
  ASSOCIATIVE_LEARNING_PRESENTATION,
  OPTICS_V2_PRESENTATION,
  REDOX_V2_PRESENTATION,
  RESEARCH_DESIGN_PRESENTATION,
} from './presentations';
import { REDOX_V2_SCRIPT } from './redox-v2.script';
import { RESEARCH_DESIGN_SCRIPT } from './research-design.script';

export { LessonRenderer } from './LessonRenderer';
export type { LessonPresentationPreview, LessonScriptPreview } from './contract';
export {
  ARGUMENT_STRUCTURE_SCRIPT,
  ASSOCIATIVE_LEARNING_SCRIPT,
  OPTICS_V2_SCRIPT,
  REDOX_V2_SCRIPT,
  RESEARCH_DESIGN_SCRIPT,
};
export {
  ARGUMENT_STRUCTURE_PRESENTATION,
  ASSOCIATIVE_LEARNING_PRESENTATION,
  OPTICS_V2_PRESENTATION,
  REDOX_V2_PRESENTATION,
  RESEARCH_DESIGN_PRESENTATION,
};

export interface AppNativeLessonEntry {
  readonly script: LessonScriptPreview;
  readonly presentation: LessonPresentationPreview;
}

export const APP_NATIVE_LESSONS: readonly AppNativeLessonEntry[] = [
  { script: REDOX_V2_SCRIPT, presentation: REDOX_V2_PRESENTATION },
  { script: OPTICS_V2_SCRIPT, presentation: OPTICS_V2_PRESENTATION },
  { script: RESEARCH_DESIGN_SCRIPT, presentation: RESEARCH_DESIGN_PRESENTATION },
  {
    script: ASSOCIATIVE_LEARNING_SCRIPT,
    presentation: ASSOCIATIVE_LEARNING_PRESENTATION,
  },
  { script: ARGUMENT_STRUCTURE_SCRIPT, presentation: ARGUMENT_STRUCTURE_PRESENTATION },
];

export function getAppNativeLesson(slug: string | null): AppNativeLessonEntry | null {
  if (slug === null) return null;
  return APP_NATIVE_LESSONS.find((entry) => entry.script.slug === slug) ?? null;
}
