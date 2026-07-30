import type {
  AccountState,
  CalibrationBand,
  CarsDuelSelectionView,
  CarsSkill,
  LearnerEvent,
  LearnerId,
  PlanActivityStatus,
  ReasoningOperation,
  Section,
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
import type {
  CarsDuelEngineState,
  GhostView,
  MemoryState,
  PlannedActivity,
  ReviewDebtBand,
} from '@mcat/policies';

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
  /**
   * CARS Duel engine state (WS6): the formative duel history + intensity rating +
   * Defend unlock latch that drive selection. Optional so older projections
   * deserialize; the authority initializes it lazily. The CARS Duel writes NO
   * mastery — this slice only shapes which duel is served next.
   */
  carsDuel?: CarsDuelEngineState;
  /**
   * Periodic half-length practice-test cadence state (WS5, §6). It is the only
   * thing `todaysPathSnapshot` needs to call `decidePracticeTest` — the last
   * completed test's local day, whether that test's review is done, and how many
   * tests are complete — so the periodic test can be scheduled into Today's Path
   * on the §6 cadence (baseline → monthly → biweekly → weekly).
   *
   * It rides the event-sourced `state_json` projection blob exactly like `goal`
   * and `mastery`, so no DB migration/column is needed: recording a completed or
   * reviewed test mutates this slice and the existing projection persists it.
   * Optional so older projections deserialize; the authority initializes it
   * lazily on the first record. Writes NO mastery — a test re-measures capability
   * through WS5's own decay-weighted scorer, never through this slice.
   */
  practiceTests?: {
    /** Last COMPLETED test's learner-local day (`YYYY-MM-DD`), or null if none. */
    lastTestDate: string | null;
    /** Whether the last completed test's review is done (the §6 block-until-reviewed gate). */
    lastTestReviewed: boolean;
    /** How many practice tests the learner has completed (drives the baseline case). */
    testsCompleted: number;
    /**
     * Completed sittings in chronological order (earliest first), the real
     * source for the Practice-test dashboard summary (trends / readiness /
     * estimated range / past tests). Present once at least one test is scored;
     * absent on older projections and on a learner who has taken none. Rides the
     * same event-sourced `state_json` blob as the counters above — no migration
     * needed for the running app — and mirrors `practice_test_sitting` (0016).
     */
    sittings?: PracticeTestSittingRecord[];
  };
  /**
   * CARS reasoning-pattern repairs (WS7): a weak CARS Duel maps its weakest
   * rubric dimension to a CARS sub-skill (FOC/RWT/RBT) and pins a specific real
   * CARS bank item as a spaced retrieval repair surfaced in Mistakes. At most one
   * OPEN repair per sub-skill (a fresh weak duel refreshes the existing one in
   * place), so the list holds at most three entries.
   *
   * FORMATIVE — writes NO mastery, exactly like the CARS Duel that produces it.
   * Resolution (a later correct CARS answer in the same sub-skill) is COMPUTED at
   * read time in `getCarsReasoningPatterns`, mirroring `Authority.resolved`, so
   * this slice stores only the flag, not the outcome. Rides the event-sourced
   * `state_json` projection blob like `practiceTests`/`carsDuel` — no migration.
   * Optional so older projections deserialize.
   */
  carsRepairs?: CarsReasoningRepair[];
}

/**
 * One completed practice-test sitting, as the dashboard summary reads it (WS5,
 * §6). It stores the SCORED result — per-section %-correct, the estimated scaled
 * midpoint, and whether the review is done — never any answer material. The
 * per-section trend points ARE `sections`; there is no separate series. Mirrors
 * `practice_test_sitting` + its section scores in migration 0016.
 */
export interface PracticeTestSittingRecord {
  /** Opaque sitting id (also the summary's `testId`). */
  readonly sittingId: string;
  /** When the sitting was scored (UTC instant). */
  readonly takenOn: UtcTimestamp;
  /** The length tier this sitting was dealt at. */
  readonly tier: 'short' | 'standard' | 'long';
  readonly itemsScored: number;
  readonly correct: number;
  /** Per-section %-correct (0–100) — the trend points. */
  readonly sections: ReadonlyArray<{ section: Section; pctCorrect: number }>;
  /** Conservative estimated scaled-score midpoint (472–528); the range is derived on read. */
  readonly scaledScore: number;
  /** The learner has worked through this sitting's review (releases the §6 gate). */
  reviewed: boolean;
}

/**
 * The scored result of one completed practice test, handed to
 * `Authority.recordPracticeTestResult` to persist a sitting + enqueue its misses
 * (WS5, §6). The server computes it from the answer key (the runner never sees a
 * key); the authority stores the dashboard-facing fields and queues the repairs.
 */
export interface PracticeTestCompletion {
  readonly sittingId: string;
  readonly takenOn: UtcTimestamp;
  readonly tier: 'short' | 'standard' | 'long';
  readonly itemsScored: number;
  readonly correct: number;
  readonly sections: ReadonlyArray<{ section: Section; pctCorrect: number }>;
  /** Conservative estimated scaled-score midpoint (472–528). */
  readonly scaledScore: number;
  /** Science misses as review-queue targets (CARS misses excluded — no per-KC repair). */
  readonly reviewTargets: ReadonlyArray<{ kcId: string; skill?: ReasoningOperation }>;
}

/**
 * One pinned CARS reasoning-pattern repair (WS7). It records only the trigger —
 * which sub-skill, which specific bank item, and the duel hold-rate that flagged
 * it — never any mastery or answer material. Whether it is resolved is derived on
 * read from the learner's later CARS attempts, not stored here.
 */
export interface CarsReasoningRepair {
  /** The AAMC CARS sub-skill the weakest rubric dimension mapped to. */
  readonly skill: CarsSkill;
  /** The specific real CARS bank item selected to target that sub-skill. */
  readonly questionId: string;
  /** The duel rubric hold-rate R ∈ [0,1] that fell below the competence bar. */
  readonly holdRate: number;
  /** When the weak duel flagged this repair (a later correct answer must beat it). */
  readonly createdAt: UtcTimestamp;
}

/** One scheduled activity plus its per-learner run status (persisted). */
export interface TodaysPathActivityState extends PlannedActivity {
  status: PlanActivityStatus;
  /**
   * Mutable override of `PlannedActivity.carsDuel` (which is read-only): the pure
   * engine emits cars_duel activities without a selection, and the authority
   * resolves + assigns it after the build (WS6).
   */
  carsDuel?: CarsDuelSelectionView;
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
  /** WS1 behavioural band; no mastery moved. Mirrors `ErrorEntryViewSchema`. */
  calibration: CalibrationBand;
  /** WS2/WS3: the picked distractor's misconception, post-answer; null otherwise. */
  chosenMisconception: string | null;
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

/**
 * One LESSON's evidence warrant: why its mastery claim is being withheld, as
 * reason codes. The lesson-grain companion to `MasteryMapEntry`, and the reason
 * it is a view of its own rather than fields on `LessonMasteryView` is recorded
 * on `LessonWarrantViewSchema` in @mcat/contracts — a view carrying both a
 * capability estimate and the warrant is what an architecture assertion forbids.
 *
 * No ordinal tier here either, for the same reason `MasteryMapEntry` has none.
 */
export interface LessonWarrantView {
  lessonId: string;
  /** Empty when nothing is being withheld — see `Authority.getLessonWarrants`. */
  reasons: DecisionReason<EvidenceReason>[];
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
