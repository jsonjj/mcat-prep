import type {
  BootstrapView,
  BuildTodaysPathInput,
  CarsDuelOutcomeInput,
  CarsReadinessView,
  CarsReasoningPatternView,
  DiagnosticNext,
  ErrorEntryView,
  GoalView,
  LessonMasteryView,
  LessonWarrantView,
  MasteryMapEntry,
  MasterySeed,
  MistakePatternView,
  NormalizedLessonAction,
  NormalizedLessonRunView,
  NormalizedLessonStartResponse,
  NormalizedLessonStatusView,
  PassageChoiceId,
  PassageGrade,
  PassageTodayView,
  PracticeAttemptCommand,
  PracticeAttemptResult,
  PracticeItemView,
  PracticeQueueView,
  PracticeResult,
  PracticeTestSummaryView,
  RepairQueueView,
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

/**
 * The session-exchange half of the authority, kept separate from
 * {@link AuthorityPort} because it is the only part a signed-out visitor can call
 * — and because harnesses that serve a fixed learner have nothing to exchange and
 * should not have to stub it.
 *
 * There is no sign-up, confirmation, or password-reset method here. Those are
 * Supabase's, and the UI calls Supabase directly for them; this port begins once
 * the visitor holds a Supabase access token.
 */
export interface AuthPort {
  /**
   * Trade a verified Supabase access token for a session. Resolves once the
   * session cookies are set; no tokens reach the caller.
   */
  exchangeSession(accessToken: string): Promise<void>;
  signOut(): Promise<void>;
}

export interface AuthorityPort {
  /**
   * Returns a discriminated envelope: a signed-out caller gets
   * `{ authenticated: false }` and no learner fields, because bootstrap no longer
   * creates a learner.
   */
  bootstrap(): Promise<BootstrapView>;
  getDiagnosticNext(): Promise<DiagnosticNext>;
  submitDiagnostic(questionId: string, choiceId: string | null): Promise<void>;
  confirmPlan(goal: GoalInput): Promise<void>;
  /** Read-only goal projection so the Account/Profile editor can prefill (WS8). */
  getGoal(): Promise<GoalView>;
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
  /** Mistakes tab: correct-but-shaky wins worth another rep (WS3), same view shape. */
  getShakyWins(): Promise<ErrorEntryView[]>;
  /** Mistakes tab, Surface A: recurring misses grouped at KC / cluster grain. */
  getMistakePatterns(): Promise<MistakePatternView[]>;
  /** Mistakes tab, Surface C (WS7): CARS reasoning-pattern repairs from weak duels. */
  getCarsReasoningPatterns(): Promise<CarsReasoningPatternView[]>;
  /**
   * The guided repair queue for the Review-Mistakes runner: a prioritized,
   * servability-filtered, capped subset of the four Mistakes buckets. `limit` is
   * the per-day cap the engine sized the slot to.
   */
  getRepairQueue(limit: number): Promise<RepairQueueView>;
  getSkills(): Promise<SkillSummary[]>;
  getPracticeItem(questionId: string): Promise<PracticeItemView | null>;
  checkPractice(questionId: string, choiceId: string | null): Promise<PracticeResult>;
  /** Adaptive Practice: an ordered queue of up to `x` fresh test-out items. */
  getPracticeQueue(x: number, focus?: string): Promise<PracticeQueueView>;
  /** Adaptive Practice: score one answer (a first, unassisted attempt moves mastery). */
  submitPracticeAttempt(command: PracticeAttemptCommand): Promise<PracticeAttemptResult>;
  /**
   * Practice-TEST dashboard summary (the amber card on Practice). Resolves to
   * `null` when no summary is available — the scored-test engine is deferred, so
   * the deployed backend does not serve this route yet, and the card falls back
   * to its existing "coming soon" states. `null` is also the honest response once
   * the engine ships but the learner has taken no test. A served-but-malformed
   * payload still throws, so DTO drift fails loudly rather than silently emptying.
   */
  getPracticeTestSummary(): Promise<PracticeTestSummaryView | null>;
  /**
   * Passage of the Day (FORMATIVE): the day's learner-safe passage for the
   * learner-local day, keyed by the browser's `Date.getTimezoneOffset()` (minutes).
   * Resolves to `null` when the pool is empty (or no passage source is configured),
   * which the runner renders as its on-brand "no passage today" state. Reads only —
   * never routes through the authority kernel and writes no mastery.
   */
  passageToday(tz: number): Promise<PassageTodayView | null>;
  /**
   * Passage of the Day (FORMATIVE): score one answer and reveal its explanation
   * (correct choice + rationale). Server-side scoring only — the view carries no
   * answer key. It is session-gated but NOT state-changing (no CSRF write gate),
   * and writes no mastery. Rejects with an `unauthorized`/`not_found` `ApiClientError`
   * when the session is missing or the question is not in the pool.
   */
  passageAttempt(questionId: string, choiceId: PassageChoiceId | null): Promise<PassageGrade>;
  /**
   * Record a CARS Duel. The optional rubric feeds a low-weight CARS ability nudge;
   * the optional {mode, topicId, intensity} let the formative engine update its
   * selection history, intensity rating, and Defend unlock (WS6). Never mastery.
   */
  recordCarsDuel(outcome?: CarsDuelOutcomeInput): Promise<void>;
  /**
   * Record that a periodic half-length practice test (WS5) was COMPLETED. Stamps
   * the last-test day, increments the count, and re-opens the review gate so the
   * §6 cadence blocks the next test until it is reviewed. Never mastery.
   */
  recordPracticeTestCompleted(): Promise<void>;
  /**
   * Record that the last completed practice test's review is done (WS5), releasing
   * the block-until-reviewed gate so the cadence can schedule the next one.
   */
  recordPracticeTestReviewed(): Promise<void>;
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
  /**
   * The shared normalized-engine catalog (L2/L3 today, any Phase-9 authoring-template
   * lesson tomorrow). Every method is slug-routed — the route slug is the authority for
   * WHICH lesson runs — so one client surface serves the entire non-L1 catalog. L1 keeps
   * its bespoke four methods above (owner decision: per-grammar dispatch).
   */
  getNormalizedLessonStatus(slug: string): Promise<NormalizedLessonStatusView>;
  startNormalizedLesson(slug: string, lessonId: string): Promise<NormalizedLessonStartResponse>;
  getNormalizedLessonRun(slug: string): Promise<NormalizedLessonRunView>;
  submitNormalizedLessonAction(slug: string, action: NormalizedLessonAction): Promise<void>;
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
