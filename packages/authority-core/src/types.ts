import type {
  AccountState,
  CarsSkill,
  LearnerEvent,
  LearnerId,
  PlanActivityStatus,
  ReasoningOperation,
  UtcTimestamp,
} from '@mcat/contracts';
import type {
  DecisionReason,
  EvidenceKind,
  EvidenceReason,
  EvidenceRecord,
  Task,
} from '@mcat/domain';
import type { LearnerSafeQuestion } from '@mcat/content';
import type { GhostView, MemoryState, PlannedActivity, ReviewDebtBand } from '@mcat/policies';

export type { GhostView, GhostState } from '@mcat/policies';

/** Authoritative per-learner state. Events are append-only; evidence is a derived cache. */
export interface LearnerState {
  learnerId: LearnerId;
  accountState: AccountState;
  createdAt: UtcTimestamp;
  onboarding: { diagnosticComplete: boolean; planConfirmed: boolean };
  goal: {
    testDate: string | null;
    targetScore: number | null;
    minutesPerWeek: number;
    /** Today's Path daily time budget (a 2–6 hr preset, in minutes). */
    dailyMinutesPreset?: number;
  } | null;
  nextSequence: number;
  seenIdempotencyKeys: string[];
  events: LearnerEvent[];
  evidence: EvidenceRecord[];
  diagnostic: DiagnosticSessionState | null;
  session: StudySessionState | null;
  /**
   * BKT/IRT mastery engine state (mastery-bkt). Optional so older persisted
   * projections deserialize; initialized lazily. In the deployed learner-api
   * path mastery lives in dedicated Postgres tables instead.
   */
  mastery?: MasteryEngineState;
  /** Today's Path — the persisted daily plan + per-activity progress (optional; per-day). */
  plan?: TodaysPathState;
  /** Lessons marked complete when finished from a Today's Path run (lightweight completion). */
  completedLessons?: string[];
  /** Learner timezone (Date.getTimezoneOffset(), UTC−local minutes) for the local day boundary. */
  timezoneOffsetMinutes?: number;
  /**
   * Watermark: misses that occurred at or before this instant have already been
   * walked through in a Review Mistakes session, so they no longer schedule
   * another one. They stay on the Mistakes tab until a fresh-item re-attempt
   * resolves them — being read is not evidence of repair.
   */
  mistakesReviewedThrough?: UtcTimestamp;
  /** KC ids the learner has been taught (union of completed lessons' KCs) — per-KC teach-before-test. */
  taughtKcIds?: string[];
}

/** One scheduled activity plus its per-learner run status (persisted). */
export interface TodaysPathActivityState extends PlannedActivity {
  status: PlanActivityStatus;
}

/** The persisted daily plan for one learner-day. Today's Path writes no mastery. */
export interface TodaysPathState {
  planDate: string; // YYYY-MM-DD (learner local, 4 AM rollover)
  dailyMinutesPreset: number;
  dailyBudgetMinutes: number;
  plannedMinutes: number;
  freeStudyMinutes: number;
  reviewSharePct: number;
  reviewDebtBand: ReviewDebtBand;
  version: number;
  generatedAt: UtcTimestamp;
  currentActivityId: string | null;
  activities: TodaysPathActivityState[];
  /** How many mistakes sessions have been added to this day's plan (cap 2–3). */
  mistakesSessions: number;
}

/**
 * Per-learner mastery engine state. `P(L)` values are as-of `lastPracticedAt`.
 *
 * Exactly TWO grains hold a directly observed `P(L)`: the primary KC (`kc`) and
 * the primary reasoning operation (`skill`). A lesson has none — its readout is
 * rolled up from its required member KCs on read. See
 * docs/lesson-evidence-mastery-contract.md §8.2 and §9.
 */
export interface MasteryEngineState {
  /** Per-KC P(L) (stored, never displayed; used for selection and lesson rollup). */
  kc: Record<string, MemoryState>;
  /** Per-reasoning-operation P(L) (the 7 displayed skills). */
  skill: Partial<Record<ReasoningOperation, MemoryState>>;
  /** Per-CARS-sub-skill IRT ability V. */
  cars: Partial<Record<CarsSkill, number>>;
  /**
   * Lessons this learner has practiced, for ROUTING only: they are the default
   * set of lessons `getMasteryLessons` rolls up. A lesson id never reaches BKT
   * and never contributes to any `P(L)`.
   */
  practicedLessonIds: string[];
  /**
   * `QualifiedBktObservation.observationId`s already applied. Re-delivering the
   * same accepted response MUST NOT move `P(L)` twice
   * (lesson-evidence-mastery-contract §12).
   */
  appliedObservationIds: string[];
  /**
   * The highest `QualifiedBktObservation.sequence` applied so far, or `null`
   * before the first one. An arrival at or below it is applied but flagged
   * out-of-order, which is how replay ordering is made detectable (§12) without
   * discarding a legitimately delayed observation.
   *
   * A projection written before this field existed deserializes without it;
   * `ensureMastery` backfills it to `null`, the same way it backfills the two
   * lists above, so it is always present once the engine has touched the state.
   */
  highestAppliedObservationSequence: number | null;
  /**
   * @deprecated Legacy per-lesson BKT chain. Lessons have no BKT state under the
   * lesson → evidence → mastery seam, so this is NEVER written. It is declared
   * only so projections persisted before the seam still deserialize; the kernel
   * drops it on read (`learnerStateFromProjection`).
   *
   * Both halves of that are ENFORCED, not merely documented — a documented guard
   * is not a guard. `tests/architecture/mastery-write-path.test.ts` fails on any
   * assignment to a lesson-keyed mastery grain, on the `?? {}` fallback that would
   * silently freeze the planner's mastery signal, and on the drop-on-read losing
   * its wiring; `authority.test.ts` ("no write path stores a lesson grain") checks
   * every write path leaves it absent, and `kernel.test.ts` owns the legacy-load
   * behaviour. Read a lesson through `Authority.getLessonRollups` instead.
   */
  lesson?: Record<string, MemoryState>;
}

export interface DiagnosticSessionState {
  itemsScored: number;
  seenQuestionIds: string[];
  correctCount: number;
  complete: boolean;
}

export type StudyPhase = 'independent' | 'guided' | 'transfer' | 'passage' | 'protected';
/** No `cause` step — see `QuestionSubStateSchema` in @mcat/contracts. */
export type QuestionSubState = 'answering' | 'retry' | 'reveal';

export interface StudySessionState {
  skillId: string;
  pathIndex: number;
  sub: QuestionSubState;
  /** The current item's first-attempt pick, so the reveal can refute that option. */
  currentFirstChoiceId: string | null;
  revealed: boolean;
  /**
   * A missed first attempt still owes the learner their one unassisted retry;
   * leaving the reveal spends it. Optional so projections written before the
   * reveal-then-retry reordering deserialize (absent reads as false).
   */
  retryPending?: boolean;
}

/** A learner-safe view of the current study step (no keys/rationales unless revealed). */
export type StudyStepView =
  | { kind: 'lesson'; lessonId: string; title: string; blocks: LessonBlockView[]; skillId: string }
  | {
      kind: 'question';
      phase: StudyPhase;
      sub: QuestionSubState;
      question: LearnerSafeQuestion;
      stimulus: StimulusView | null;
      hint: HintView | null;
      /** Present only after a reveal (post-retry or Reveal Now). */
      reveal: RevealView | null;
      skillId: string;
    }
  | { kind: 'simulation'; specId: string; skillId: string }
  | { kind: 'recall'; promptId: string; prompt: string; format: string; skillId: string }
  | { kind: 'complete'; skillId: string; summary: SessionSummary }
  | { kind: 'locked'; reason: string };

export interface LessonBlockView {
  kind: string;
  heading: string;
  body: string[];
}

export interface StimulusView {
  id: string;
  body: string[];
}

export interface HintView {
  level: string;
  text: string;
  contentBearing: boolean;
}

export interface RevealView {
  correctChoiceId: string;
  correctRationale: string;
  choiceRationales: Record<string, string>;
  /** The first-attempt pick, so the reveal refutes the option actually chosen. */
  chosenChoiceId: 'A' | 'B' | 'C' | 'D' | null;
}

export interface SessionSummary {
  skillId: string;
  /** WARRANT staleness, not BKT decay. The capability question is `reviewDue`. */
  refreshNeeded: boolean;
  /** The warrant as reason codes. Never an ordinal tier — see `MasteryMapEntry`. */
  reasons: DecisionReason<EvidenceReason>[];
  evidenceCounts: Record<string, number>;
}

/**
 * One practice miss with the content needed to act on it. Mirrors
 * `ErrorEntryViewSchema` in @mcat/contracts. There is deliberately no cause
 * field — see docs/design/error-handling-design.md §2.3.
 */
export interface ErrorEntryView {
  questionId: string;
  kcId: string | null;
  skillId: string | null;
  cluster: string | null;
  familyId: string | null;
  occurredAt: UtcTimestamp;
  stem: string;
  chosenChoiceId: 'A' | 'B' | 'C' | 'D' | null;
  chosenChoiceText: string;
  correctChoiceId: 'A' | 'B' | 'C' | 'D';
  correctChoiceText: string;
  choiceRationale: string | null;
  resolved: boolean;
  focus: string | null;
}

export interface TodayView {
  capacityLabel: string;
  continueTaskId: string | null;
  tasks: Task[];
  reviewSharePct: number;
  /** 1-based study day since the account was created. */
  dayNumber: number;
  /** Total days until the test date, if scheduled; otherwise null (rolling plan). */
  totalDays: number | null;
  /** Small home-screen status counts. */
  reviewsDue: number;
  repairsOpen: number;
  /** Supportive self-pacing companion state (never peer comparison, never blocks). */
  ghost: GhostView;
}

/**
 * One skill's EVIDENCE WARRANT, plus its presentation labels. This is a view of
 * `SkillEvidenceState` — what the evidence covers and what is missing — not a
 * capability estimate; the learner-facing capability number is
 * `SkillMasteryView.pL` from the BKT engine.
 *
 * It publishes NO ordinal tier. The evidence-quality rank stays inside the
 * authority (see `Authority.skillWarrants`), where comparing tiers is a planner
 * concern; `reasons` is what reaches the learner.
 */
export interface MasteryMapEntry {
  skillId: string;
  /**
   * The WARRANT is stale or contradicted by a fresh failure. Not BKT decay: that
   * is `SkillMasteryView.reviewDue`, which the two shared this name with until the
   * split made them distinguishable to a planner reading both.
   */
  refreshNeeded: boolean;
  supportingEvidenceIds: string[];
  freshestByKind: Partial<Record<EvidenceKind, UtcTimestamp>>;
  reasons: DecisionReason<EvidenceReason>[];
  policyVersion: string;
  cluster: string;
  title: string;
}

export interface PracticeItemView {
  question: LearnerSafeQuestion;
  stimulus: StimulusView | null;
}

export interface PracticeResult {
  correct: boolean;
  correctChoiceId: string;
  rationale: string;
  choiceRationale: string | null;
}

export interface WrappedView {
  dayNumber: number;
  skillsTouched: number;
  skillsGlowing: number;
  evidenceCounts: Record<string, number>;
  repairsCompleted: number;
  protectedPassed: number;
}
