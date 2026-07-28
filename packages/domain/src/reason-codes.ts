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

/**
 * Evidence-warrant reasons. These audit the QUALITY, CURRENCY and GAPS of a
 * skill's evidence; none of them declares a capability level. The learner-facing
 * mastery claim comes from the BKT estimate in @mcat/policies, not from here.
 *
 * `EVIDENCE_REASON_CODES` in `packages/contracts/src/learner-views.ts` MIRRORS
 * this list member-for-member so `DecisionReasonViewSchema` can validate it at
 * the wire boundary. It cannot import this module — @mcat/domain depends on
 * @mcat/contracts, so the reverse import would be a cycle. Adding a member here
 * without adding it there makes the view reject a code this policy emits;
 * `packages/authority-core/src/authority.test.ts` asserts the two are equal.
 */
export const EVIDENCE_REASONS = [
  'NO_USEFUL_EVIDENCE',
  'PREREQUISITE_BLOCKED',
  'INSTRUCTIONAL_EVIDENCE_ONLY',
  'INDEPENDENT_EVIDENCE_SATISFIED',
  'RETENTION_EVIDENCE_SATISFIED',
  'STRONG_CONDITIONS_EVIDENCE_SATISFIED',
  'EVIDENCE_STALE',
  'FRESH_FAILURE',
  'CORRECTION_INVALIDATED_EVIDENCE',
  'INDEPENDENT_EVIDENCE_GAP',
  'TRANSFER_EVIDENCE_GAP',
  'DELAYED_EVIDENCE_GAP',
  'MIXED_EVIDENCE_GAP',
  'PASSAGE_EVIDENCE_GAP',
  'TIMED_EVIDENCE_GAP',
  'PROTECTED_EVIDENCE_GAP',
  'EVIDENCE_GAP',
] as const;
export type EvidenceReason = (typeof EVIDENCE_REASONS)[number];

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
