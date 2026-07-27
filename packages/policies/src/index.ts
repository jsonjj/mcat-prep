export * from './manifest';
export * from './fsrs';
export * from './assistance';
export * from './diagnostic';
export * from './diagnostic-bayes';
export * from './mastery-policy';
export * from './planner';
export * from './readiness';
export * from './ghost';
// Mastery engine (mastery-bkt / provisional-v1).
export * from './irt';
export * from './bkt';
export * from './forgetting';
export * from './prerequisite';
export * from './mastery-attempt';
export * from './cars';
export * from './mastery-seed';

import { asPolicyVersion } from './manifest';
import { FSRS_MANIFEST } from './fsrs';
import { ASSISTANCE_MANIFEST } from './assistance';
import { DIAGNOSTIC_MANIFEST } from './diagnostic';
import { MASTERY_MANIFEST } from './mastery-policy';
import { MASTERY_BKT_MANIFEST } from './bkt';
import { PLANNER_MANIFEST } from './planner';
import { READINESS_MANIFEST } from './readiness';
import { GHOST_MANIFEST } from './ghost';

/** The active policy set, for recording on every consequential decision/event. */
export const ACTIVE_POLICY_MANIFESTS = [
  DIAGNOSTIC_MANIFEST,
  PLANNER_MANIFEST,
  ASSISTANCE_MANIFEST,
  FSRS_MANIFEST,
  MASTERY_MANIFEST,
  MASTERY_BKT_MANIFEST,
  READINESS_MANIFEST,
  GHOST_MANIFEST,
] as const;

export const activePolicyVersions = () => ACTIVE_POLICY_MANIFESTS.map(asPolicyVersion);
