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
export * from './todays-path';
// Mastery engine (mastery-bkt).
export * from './irt';
export * from './bkt';
export * from './forgetting';
export * from './prerequisite';
export * from './mastery-attempt';
export * from './lesson-rollup';
export * from './cars';
export * from './calibration';
export * from './cars-duel';
export * from './cars-duel-mistakes';
export * from './mastery-seed';
export * from './practice-selection';
export * from './practice-test-assembler';
export * from './practice-test-scorer';
export * from './practice-test-cadence';

import { asPolicyVersion } from './manifest';
import { FSRS_MANIFEST } from './fsrs';
import { ASSISTANCE_MANIFEST } from './assistance';
import { DIAGNOSTIC_MANIFEST } from './diagnostic';
import { EVIDENCE_WARRANT_MANIFEST } from './mastery-policy';
import { MASTERY_BKT_MANIFEST } from './bkt';
import { PLANNER_MANIFEST } from './planner';
import { READINESS_MANIFEST } from './readiness';
import { GHOST_MANIFEST } from './ghost';
import { PRACTICE_SELECTION_MANIFEST } from './practice-selection';
import { TODAYS_PATH_MANIFEST } from './todays-path';
import { PRACTICE_TEST_MANIFEST } from './practice-test-assembler';
import { PRACTICE_TEST_CADENCE_MANIFEST } from './practice-test-cadence';

/**
 * The active policy set, for recording on every consequential decision/event.
 * `mastery-bkt` owns the capability estimate; `evidence-warrant` owns evidence
 * quality, freshness and gaps. They are separate signals.
 */
export const ACTIVE_POLICY_MANIFESTS = [
  DIAGNOSTIC_MANIFEST,
  PLANNER_MANIFEST,
  ASSISTANCE_MANIFEST,
  FSRS_MANIFEST,
  EVIDENCE_WARRANT_MANIFEST,
  MASTERY_BKT_MANIFEST,
  READINESS_MANIFEST,
  GHOST_MANIFEST,
  PRACTICE_SELECTION_MANIFEST,
  TODAYS_PATH_MANIFEST,
  PRACTICE_TEST_MANIFEST,
  PRACTICE_TEST_CADENCE_MANIFEST,
] as const;

export const activePolicyVersions = () => ACTIVE_POLICY_MANIFESTS.map(asPolicyVersion);
