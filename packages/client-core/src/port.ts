import type { BootstrapResponse, ProbableCause } from '@mcat/contracts';
import type { LearnerSafeQuestion } from '@mcat/content';
import type {
  ErrorEntryView,
  MasteryMapEntry,
  StudyStepView,
  TodayView,
} from '@mcat/authority-core';

/**
 * The client's view of server authority. In production this is an HTTP adapter to
 * API Gateway; locally it is the in-process adapter over @mcat/authority-core.
 * Everything is async so swapping adapters never changes callers.
 */
export interface DiagnosticNext {
  done: boolean;
  question: LearnerSafeQuestion | null;
  progress: number;
}

export interface SkillSummary {
  skillId: string;
  cluster: string;
  title: string;
  objective: string;
}

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
  getErrorLog(): Promise<ErrorEntryView[]>;
  getSkills(): Promise<SkillSummary[]>;
  resetProgress(): Promise<void>;
}

/** Persistence boundary provided by the platform (browser IndexedDB/localStorage, etc.). */
export interface StatePort<T> {
  load(): T | null;
  save(state: T): void;
  clear(): void;
}
