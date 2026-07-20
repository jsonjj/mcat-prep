/**
 * Human-auditable reason codes. Every consequential decision (why this task,
 * why this state) records one or more of these so the UI can explain "Why this
 * now?" and "What changed?" without exposing algorithm internals.
 */
export const PLANNER_REASONS = [
  'UNFINISHED_CHECKPOINT',
  'PREREQUISITE_BLOCKER',
  'FAILED_REPAIR',
  'FRESHNESS_RISK',
  'OVERDUE_REVIEW',
  'UNRESOLVED_ERROR',
  'PASSAGE_GAP',
  'TIMED_GAP',
  'PROTECTED_GAP',
  'COVERAGE_GAP',
  'CARS_CONTACT',
  'NEW_LEARNING',
  'OPTIONAL_DEPTH',
  'CAPACITY_CONSTRAINT',
] as const;
export type PlannerReason = (typeof PLANNER_REASONS)[number];

export const MASTERY_REASONS = [
  'NO_USEFUL_EVIDENCE',
  'PREREQUISITE_BLOCKED',
  'DEPENDS_ON_INSTRUCTION',
  'INDEPENDENT_ACHIEVED',
  'TRANSFER_ACHIEVED',
  'RETAINED_ACHIEVED',
  'STRONG_ACHIEVED',
  'EVIDENCE_STALE',
  'FRESH_FAILURE',
  'CORRECTION_INVALIDATED_EVIDENCE',
] as const;
export type MasteryReason = (typeof MASTERY_REASONS)[number];

export const ASSISTANCE_REASONS = [
  'FADE_AFTER_SUCCESS',
  'ESCALATE_AFTER_FAILURE',
  'START_INDEPENDENT_FROM_PLACEMENT',
  'HOLD_LEVEL',
] as const;
export type AssistanceReason = (typeof ASSISTANCE_REASONS)[number];

export interface DecisionReason<T extends string = string> {
  readonly code: T;
  readonly detail?: string;
}
