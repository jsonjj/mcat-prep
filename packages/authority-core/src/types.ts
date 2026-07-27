import type {
  AccountState,
  CarsSkill,
  LearnerEvent,
  LearnerId,
  MasteryState,
  ReasoningOperation,
  UtcTimestamp,
} from '@mcat/contracts';
import type { EvidenceRecord, MasterySkillState, Task } from '@mcat/domain';
import type { LearnerSafeQuestion } from '@mcat/content';
import type { GhostView, MemoryState } from '@mcat/policies';

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

export interface ErrorEntryView {
  questionId: string;
  skillId: string;
  occurredAt: UtcTimestamp;
  chosenChoiceId: string | null;
  cause: string | null;
  repaired: boolean;
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
