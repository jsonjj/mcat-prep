import type {
  BootstrapResponse,
  CarsReadinessView,
  DiagnosticNext,
  ErrorEntryView,
  LessonMasteryView,
  MasteryMapEntry,
  PracticeItemView,
  PracticeResult,
  ProbableCause,
  SkillMasteryView,
  SkillSummary,
  StudyStepView,
  TodayView,
  VectorLessonAction,
  VectorLessonRunView,
  VectorLessonStartResponse,
  VectorLessonStatusView,
  WrappedView,
} from '@mcat/contracts';

export type { DiagnosticNext, SkillSummary } from '@mcat/contracts';

/**
 * Goal input stays unbranded for existing form callers; the asynchronous HTTP
 * authority validates it at the wire boundary.
 */
export interface GoalInput {
  testDate: string | null;
  targetScore: number | null;
  minutesPerWeek: number;
}

export interface AuthorityPort {
  bootstrap(): Promise<BootstrapResponse>;
  getDiagnosticNext(): Promise<DiagnosticNext>;
  submitDiagnostic(questionId: string, choiceId: string | null): Promise<void>;
  confirmPlan(goal: GoalInput): Promise<void>;
  getToday(): Promise<TodayView>;
  getSession(): Promise<StudyStepView>;
  submitAttempt(choiceId: string | null): Promise<void>;
  selectCause(cause: ProbableCause): Promise<void>;
  requestReveal(): Promise<void>;
  continueStep(): Promise<void>;
  submitRecall(answer: string): Promise<boolean>;
  getMasteryMap(): Promise<MasteryMapEntry[]>;
  /** BKT mastery: the 7 reasoning-skill readouts (Skills page). */
  getMasterySkills(): Promise<SkillMasteryView[]>;
  /** BKT mastery: per-lesson P(L) (drives the Progress brain). */
  getMasteryLessons(): Promise<LessonMasteryView[]>;
  /** CARS IRT readiness (gauge + 3 sub-skill bars). */
  getCarsReadiness(): Promise<CarsReadinessView>;
  getErrorLog(): Promise<ErrorEntryView[]>;
  getSkills(): Promise<SkillSummary[]>;
  getPracticeItem(questionId: string): Promise<PracticeItemView | null>;
  checkPractice(questionId: string, choiceId: string | null): Promise<PracticeResult>;
  recordCarsDuel(): Promise<void>;
  getWrapped(): Promise<WrappedView>;
  resetProgress(): Promise<void>;
  getVectorLessonStatus(): Promise<VectorLessonStatusView>;
  startVectorLesson(): Promise<VectorLessonStartResponse>;
  getVectorLessonRun(): Promise<VectorLessonRunView>;
  submitVectorLessonAction(
    runId: string,
    screenToken: string,
    action: VectorLessonAction,
  ): Promise<void>;
}

/** Persistence boundary provided by the platform (browser IndexedDB/localStorage, etc.). */
export interface StatePort<T> {
  load(): T | null;
  save(state: T): void;
  clear(): void;
}

/** Session values must be backed by memory-only platform storage. */
export interface SessionPort {
  getAccessToken(): string | null;
  setAccessToken(token: string | null): void;
  getCsrfToken(): string | null;
  setCsrfToken(token: string | null): void;
  clear(): void;
}
