import type {
  BootstrapResponse,
  BuildTodaysPathInput,
  CarsDuelRubric,
  CarsReadinessView,
  DiagnosticNext,
  ErrorEntryView,
  LessonMasteryView,
  LessonWarrantView,
  MasteryMapEntry,
  MasterySeed,
  MistakePatternView,
  PracticeAttemptCommand,
  PracticeAttemptResult,
  PracticeItemView,
  PracticeQueueView,
  PracticeResult,
  SkillMasteryView,
  SkillSummary,
  StudyStepView,
  TodayView,
  TodaysPathView,
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

/**
 * Diagnose-before-reveal timing captured by a question UI (WS0): deliberation
 * time from item presentation to submit, and how many times the selection
 * changed before committing. Behavioural proxies for confidence; never mastery.
 */
export interface AttemptTiming {
  elapsedMs: number;
  answerChanges: number;
}

export interface AuthorityPort {
  bootstrap(): Promise<BootstrapResponse>;
  getDiagnosticNext(): Promise<DiagnosticNext>;
  submitDiagnostic(questionId: string, choiceId: string | null): Promise<void>;
  confirmPlan(goal: GoalInput): Promise<void>;
  getToday(): Promise<TodayView>;
  /** Today's Path: read the current day's plan (built:false when none exists yet). */
  getTodaysPath(): Promise<TodaysPathView>;
  /** Today's Path: build/persist today's plan from a client-fed recall load + candidate lessons. */
  buildTodaysPath(input: BuildTodaysPathInput): Promise<TodaysPathView>;
  /** Today's Path: advance the guided runner (mark an activity in_progress / complete / skipped). */
  recordPlanActivity(
    activityId: string,
    status: 'in_progress' | 'complete' | 'skipped',
  ): Promise<void>;
  /** Today's Path: set the daily time-budget preset (a 2–6 hr preset, in minutes). */
  setDailyBudget(minutesPerDay: number): Promise<void>;
  getSession(): Promise<StudyStepView>;
  /**
   * Score a Study answer. `timing` is the diagnose-before-reveal capture (WS0):
   * deliberation time to submit and how many times the selection changed first.
   * Optional so non-UI callers still compile; absent is logged as "not captured".
   */
  submitAttempt(choiceId: string | null, timing?: AttemptTiming): Promise<void>;
  requestReveal(): Promise<void>;
  continueStep(): Promise<void>;
  submitRecall(answer: string): Promise<boolean>;
  getMasteryMap(): Promise<MasteryMapEntry[]>;
  /** BKT mastery: the 7 reasoning-skill readouts (Skills page). */
  getMasterySkills(): Promise<SkillMasteryView[]>;
  /** BKT mastery: per-lesson P(L) (drives the Progress brain). */
  getMasteryLessons(): Promise<LessonMasteryView[]>;
  /**
   * The evidence WARRANT per lesson: why a mastery claim is withheld. A separate
   * call from `getMasteryLessons` because one view may not publish both a
   * capability estimate and the warrant — see `LessonWarrantViewSchema`.
   */
  getLessonWarrants(): Promise<LessonWarrantView[]>;
  /** CARS IRT readiness (gauge + 3 sub-skill bars). */
  getCarsReadiness(): Promise<CarsReadinessView>;
  /** Mistakes tab, Surface B: question misses (practice and study) with their content. */
  getErrorLog(): Promise<ErrorEntryView[]>;
  /** Mistakes tab, Surface A: recurring misses grouped at KC / cluster grain. */
  getMistakePatterns(): Promise<MistakePatternView[]>;
  getSkills(): Promise<SkillSummary[]>;
  getPracticeItem(questionId: string): Promise<PracticeItemView | null>;
  checkPractice(questionId: string, choiceId: string | null): Promise<PracticeResult>;
  /** Adaptive Practice: an ordered queue of up to `x` fresh test-out items. */
  getPracticeQueue(x: number, focus?: string): Promise<PracticeQueueView>;
  /** Adaptive Practice: score one answer (a first, unassisted attempt moves mastery). */
  submitPracticeAttempt(command: PracticeAttemptCommand): Promise<PracticeAttemptResult>;
  /** Record a CARS Duel; an optional rubric feeds a low-weight CARS ability nudge. */
  recordCarsDuel(rubric?: CarsDuelRubric): Promise<void>;
  /**
   * Hand a finished diagnostic's opening priors to the mastery engine. Seeds
   * only ever initialize units the learner has not practised, and are capped far
   * below the mastery threshold — see `applyMasterySeed`.
   */
  applyMasterySeed(seed: MasterySeed): Promise<void>;
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
