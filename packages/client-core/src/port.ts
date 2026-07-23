import type {
  BootstrapResponse,
  DiagnosticNext,
  ErrorEntryView,
  MasteryMapEntry,
  PracticeItemView,
  PracticeResult,
  ProbableCause,
  LessonActionInput,
  LessonRunId,
  SkillSummary,
  StudyStepView,
  TodayView,
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
  dispatchLessonAction(runId: LessonRunId, action: LessonActionInput): Promise<void>;
  getMasteryMap(): Promise<MasteryMapEntry[]>;
  getErrorLog(): Promise<ErrorEntryView[]>;
  getSkills(): Promise<SkillSummary[]>;
  getPracticeItem(questionId: string): Promise<PracticeItemView | null>;
  checkPractice(questionId: string, choiceId: string | null): Promise<PracticeResult>;
  recordCarsDuel(): Promise<void>;
  getWrapped(): Promise<WrappedView>;
  resetProgress(): Promise<void>;
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
