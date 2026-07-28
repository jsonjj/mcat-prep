import type {
  AccountState,
  CarsSkill,
  LearnerEvent,
  LearnerId,
  MasteryState,
  PlanActivityStatus,
  ReasoningOperation,
  UtcTimestamp,
} from '@mcat/contracts';
import type { EvidenceRecord, MasterySkillState, Task } from '@mcat/domain';
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
   * BKT/IRT mastery engine state (mastery-bkt / provisional-v1). Optional so older
   * persisted projections deserialize; initialized lazily. In the deployed
   * learner-api path mastery lives in dedicated Postgres tables instead.
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

/** Per-learner mastery engine state. `P(L)` values are as-of `lastPracticedAt`. */
export interface MasteryEngineState {
  /** Per-KC P(L) (stored, never displayed; used for selection). */
  kc: Record<string, MemoryState>;
  /** Per-reasoning-operation P(L) (the 7 displayed skills). */
  skill: Partial<Record<ReasoningOperation, MemoryState>>;
  /** Per-lesson P(L) (drives the Progress brain). */
  lesson: Record<string, MemoryState>;
  /** Per-CARS-sub-skill IRT ability V. */
  cars: Partial<Record<CarsSkill, number>>;
}

export interface DiagnosticSessionState {
  itemsScored: number;
  seenQuestionIds: string[];
  correctCount: number;
  complete: boolean;
}

export type StudyPhase = 'independent' | 'guided' | 'transfer' | 'passage' | 'protected';
export type QuestionSubState = 'answering' | 'cause' | 'retry' | 'reveal';

export interface StudySessionState {
  skillId: string;
  pathIndex: number;
  sub: QuestionSubState;
  /** Tracks the current item's first-attempt data for Diagnose-Before-Reveal. */
  currentFirstChoiceId: string | null;
  revealed: boolean;
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
}

export interface SessionSummary {
  skillId: string;
  masteryState: MasteryState;
  refreshNeeded: boolean;
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

export interface MasteryMapEntry extends MasterySkillState {
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
