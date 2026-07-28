export * from './manifest';
export * from './fsrs';
export * from './assistance';
export * from './diagnostic';
export * from './diagnostic-bayes';
export * from './diagnostic-axis';
export * from './diagnostic-session';
// The bank composition the sweep was run against, so the server that assembles
// forms can assert it still buckets the bank the same way.
export { BANK_PROFILES, type BankDokCounts, type BankProfileAxisId } from './data/bank-profiles.generated';
// Multistage delivery. `diagnostic-simulation` stays off the public surface —
// it is a harness, not a policy — but form assembly and routing ship.
export {
  assembleMstStages,
  // What an `allocation: 'contention'` design needs at each block boundary,
  // alongside `contentionFromResponses`: without both the server cannot
  // assemble the next block.
  contentionSlots,
  cutScoresFor,
  defaultRoutingQuantiles,
  moduleDifficulties,
  MST_140_RECOMMENDED,
  MST_DESIGNS,
  mstStageCount,
  planMstForm,
  routeFromScore,
  type AssembledStage,
  type MstDesign,
  type MstFormPlan,
} from './diagnostic-mst';
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
