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
// App-native lesson wave 2 (curriculum-wired candidates).
import { EQUILIBRIUM_SHIFTS_PRESENTATION, EQUILIBRIUM_SHIFTS_SCRIPT } from './equilibrium-shifts.script';
import { ENERGY_CONSERVATION_PRESENTATION, ENERGY_CONSERVATION_SCRIPT } from './energy-conservation.script';
import { GRAPHS_SLOPES_PRESENTATION, GRAPHS_SLOPES_SCRIPT } from './graphs-slopes.script';
import { MOLECULAR_GEOMETRY_PRESENTATION, MOLECULAR_GEOMETRY_SCRIPT } from './molecular-geometry.script';
import { PERIODIC_TRENDS_PRESENTATION, PERIODIC_TRENDS_SCRIPT } from './periodic-trends.script';
import { REASON_WITH_MODELS_PRESENTATION, REASON_WITH_MODELS_SCRIPT } from './reason-with-models.script';
import { SCIENTIFIC_NOTATION_PRESENTATION, SCIENTIFIC_NOTATION_SCRIPT } from './scientific-notation.script';
import { STOICHIOMETRY_PRESENTATION, STOICHIOMETRY_SCRIPT } from './stoichiometry.script';
import { WARRANTED_CONCLUSIONS_PRESENTATION, WARRANTED_CONCLUSIONS_SCRIPT } from './warranted-conclusions.script';

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
  // Wave 2 — data-driven candidates authored from the V3 registry (real lesson ids + KCs).
  // V3-LES-130923 is intentionally absent: it is delivered by the
  // server-authoritative lesson runtime instead.
  { script: SCIENTIFIC_NOTATION_SCRIPT, presentation: SCIENTIFIC_NOTATION_PRESENTATION },
  { script: GRAPHS_SLOPES_SCRIPT, presentation: GRAPHS_SLOPES_PRESENTATION },
  { script: REASON_WITH_MODELS_SCRIPT, presentation: REASON_WITH_MODELS_PRESENTATION },
  { script: WARRANTED_CONCLUSIONS_SCRIPT, presentation: WARRANTED_CONCLUSIONS_PRESENTATION },
  { script: PERIODIC_TRENDS_SCRIPT, presentation: PERIODIC_TRENDS_PRESENTATION },
  { script: MOLECULAR_GEOMETRY_SCRIPT, presentation: MOLECULAR_GEOMETRY_PRESENTATION },
  { script: STOICHIOMETRY_SCRIPT, presentation: STOICHIOMETRY_PRESENTATION },
  { script: EQUILIBRIUM_SHIFTS_SCRIPT, presentation: EQUILIBRIUM_SHIFTS_PRESENTATION },
  { script: ENERGY_CONSERVATION_SCRIPT, presentation: ENERGY_CONSERVATION_PRESENTATION },
];

export function getAppNativeLesson(slug: string | null): AppNativeLessonEntry | null {
  if (slug === null) return null;
  return APP_NATIVE_LESSONS.find((entry) => entry.script.slug === slug) ?? null;
}
