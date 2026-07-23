export * from './manifest';
export * from './fsrs';
export * from './assistance';
export * from './diagnostic';
export * from './mastery-policy';
export * from './planner';
export * from './readiness';
export * from './ghost';
export * from './lesson-runtime';

import { asPolicyVersion } from './manifest';
import { FSRS_MANIFEST } from './fsrs';
import { ASSISTANCE_MANIFEST } from './assistance';
import { DIAGNOSTIC_MANIFEST } from './diagnostic';
import { MASTERY_MANIFEST } from './mastery-policy';
import { PLANNER_MANIFEST } from './planner';
import { READINESS_MANIFEST } from './readiness';
import { GHOST_MANIFEST } from './ghost';
import { LESSON_RUNTIME_MANIFEST } from './lesson-runtime';

/** The active policy set, for recording on every consequential decision/event. */
export const ACTIVE_POLICY_MANIFESTS = [
  DIAGNOSTIC_MANIFEST,
  PLANNER_MANIFEST,
  ASSISTANCE_MANIFEST,
  FSRS_MANIFEST,
  MASTERY_MANIFEST,
  READINESS_MANIFEST,
  GHOST_MANIFEST,
  LESSON_RUNTIME_MANIFEST,
] as const;

export const activePolicyVersions = () => ACTIVE_POLICY_MANIFESTS.map(asPolicyVersion);
