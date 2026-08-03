import {
  BootstrapResponseSchema,
  CarsReadinessViewSchema,
  CarsReasoningPatternViewSchema,
  DiagnosticNextSchema,
  ErrorEntryViewSchema,
  GoalViewSchema,
  LessonMasteryViewSchema,
  LessonWarrantViewSchema,
  MasteryMapEntrySchema,
  MasterySeedSchema,
  MistakePatternViewSchema,
  NormalizedLessonStatusViewSchema,
  PracticeAttemptResultSchema,
  PracticeItemViewSchema,
  PracticeQueueViewSchema,
  PracticeResultSchema,
  RepairQueueViewSchema,
  PracticeTestSummaryViewSchema,
  SkillMasteryViewSchema,
  SkillSummarySchema,
  StudyStepViewSchema,
  TodayViewSchema,
  TodaysPathViewSchema,
  VectorLessonStatusViewSchema,
  WrappedViewSchema,
  type BootstrapResponse,
  type BuildTodaysPathInput,
  type Clock,
  type MasterySeed,
  type NormalizedLessonAction,
  type PassageChoiceId,
  type PassageGrade,
  type PassageTodayView,
  type PracticeAttemptCommand,
  type VectorLessonAction,
} from '@mcat/contracts';
import {
  Authority,
  type LearnerState,
  type OpenPracticeTestSitting,
  type PracticeBankPort,
  type PracticeTestCompletion,
  type PracticeTestServeGate,
} from '@mcat/authority-core';
import { loadSyntheticBank } from '@mcat/content';
import type { AuthorityPort, GoalInput, StatePort } from '@mcat/client-core';

/** Synthetic-only in-process authority for local development and deterministic tests. */
export class InProcessAuthorityClient implements AuthorityPort {
  private readonly authority: Authority;
  private readonly store: StatePort<LearnerState>;

  constructor(store: StatePort<LearnerState>, clock?: Clock, practiceBankPort?: PracticeBankPort) {
    this.authority = new Authority(loadSyntheticBank(), clock, practiceBankPort);
    this.store = store;
  }

  private state(): LearnerState {
    const existing = this.store.load();
    if (existing) return existing;
    const created = this.authority.createGuest();
    this.store.save(created);
    return created;
  }

  private mutate<R>(fn: (state: LearnerState) => R): R {
    const state = this.state();
    const result = fn(state);
    this.store.save(state);
    return result;
  }

  private async mutateAsync<R>(fn: (state: LearnerState) => Promise<R>): Promise<R> {
    const state = this.state();
    const result = await fn(state);
    this.store.save(state);
    return result;
  }

  /**
   * Always authenticated. This harness has no credential store and serves a single
   * fixed learner, so there is no signed-out arm to return.
   */
  async bootstrap(): Promise<BootstrapResponse & { authenticated: true }> {
    const response = BootstrapResponseSchema.parse(
      this.mutate((state) => this.authority.bootstrap(state, 'linked')),
    );
    return { ...response, authenticated: true };
  }

  async getDiagnosticNext() {
    return this.mutate((state) => {
      const next = this.authority.diagnosticNext(state);
      const question =
        next.questionId !== undefined
          ? (this.authority.bank.compiled.get(next.questionId)?.safe ?? null)
          : null;
      return DiagnosticNextSchema.parse({ done: next.done, question, progress: next.progress });
    });
  }

  async submitDiagnostic(questionId: string, choiceId: string | null): Promise<void> {
    this.mutate((state) => this.authority.submitDiagnosticAnswer(state, questionId, choiceId));
  }

  async confirmPlan(goal: GoalInput): Promise<void> {
    this.mutate((state) => this.authority.confirmPlan(state, goal));
  }

  async getGoal() {
    return GoalViewSchema.parse(this.mutate((state) => this.authority.getGoal(state)));
  }

  async getToday() {
    return TodayViewSchema.parse(await this.mutateAsync((state) => this.authority.getToday(state)));
  }

  async getTodaysPath() {
    return TodaysPathViewSchema.parse(this.mutate((state) => this.authority.getTodaysPath(state)));
  }

  async buildTodaysPath(input: BuildTodaysPathInput) {
    return TodaysPathViewSchema.parse(
      await this.mutateAsync((state) => this.authority.buildTodaysPath(state, input)),
    );
  }

  async recordPlanActivity(
    activityId: string,
    status: 'in_progress' | 'complete' | 'skipped',
  ): Promise<void> {
    await this.mutateAsync((state) =>
      this.authority.recordPlanActivity(state, activityId, status),
    );
  }

  async setDailyBudget(minutesPerDay: number): Promise<void> {
    this.mutate((state) => this.authority.setDailyBudget(state, minutesPerDay));
  }

  async getSession() {
    return StudyStepViewSchema.parse(this.mutate((state) => this.authority.getSession(state)));
  }

  async submitAttempt(
    choiceId: string | null,
    timing?: { elapsedMs: number; answerChanges: number },
  ): Promise<void> {
    await this.mutateAsync((state) => this.authority.submitAttempt(state, choiceId, timing));
  }

  async requestReveal(): Promise<void> {
    this.mutate((state) => this.authority.requestReveal(state));
  }

  async continueStep(): Promise<void> {
    this.mutate((state) => this.authority.continueStep(state));
  }

  async submitRecall(answer: string): Promise<boolean> {
    return this.mutate((state) => this.authority.submitRecall(state, answer));
  }

  async getMasteryMap() {
    return MasteryMapEntrySchema.array().parse(
      this.mutate((state) => this.authority.getMasteryMap(state)),
    );
  }

  async getMasterySkills() {
    return SkillMasteryViewSchema.array().parse(
      this.mutate((state) => this.authority.getMasterySkills(state)),
    );
  }

  async getMasteryLessons() {
    return LessonMasteryViewSchema.array().parse(
      this.mutate((state) => this.authority.getMasteryLessons(state)),
    );
  }

  async getLessonWarrants() {
    return LessonWarrantViewSchema.array().parse(
      this.mutate((state) => this.authority.getLessonWarrants(state)),
    );
  }

  async getCarsReadiness() {
    return CarsReadinessViewSchema.parse(
      this.mutate((state) => this.authority.getCarsReadiness(state)),
    );
  }

  async getErrorLog() {
    return ErrorEntryViewSchema.array().parse(
      await this.mutateAsync((state) => this.authority.getErrorLog(state)),
    );
  }

  async getShakyWins() {
    return ErrorEntryViewSchema.array().parse(
      await this.mutateAsync((state) => this.authority.getShakyWins(state)),
    );
  }

  async getMistakePatterns() {
    return MistakePatternViewSchema.array().parse(
      await this.mutateAsync((state) => this.authority.getMistakePatterns(state)),
    );
  }

  async getCarsReasoningPatterns() {
    return CarsReasoningPatternViewSchema.array().parse(
      await this.mutateAsync((state) => this.authority.getCarsReasoningPatterns(state)),
    );
  }

  async getRepairQueue(limit: number) {
    return RepairQueueViewSchema.parse(
      await this.mutateAsync((state) => this.authority.getRepairQueue(state, limit)),
    );
  }

  async getPracticeItem(questionId: string) {
    const item = this.authority.getPracticeItem(questionId);
    return item === null ? null : PracticeItemViewSchema.parse(item);
  }

  async checkPractice(questionId: string, choiceId: string | null) {
    return PracticeResultSchema.parse(
      this.mutate((state) => this.authority.checkPractice(state, questionId, choiceId)),
    );
  }

  async getPracticeQueue(x: number, focus?: string) {
    return PracticeQueueViewSchema.parse(
      await this.mutateAsync((state) => this.authority.getPracticeQueue(state, x, focus)),
    );
  }

  async submitPracticeAttempt(command: PracticeAttemptCommand) {
    return PracticeAttemptResultSchema.parse(
      await this.mutateAsync((state) => this.authority.submitPracticeAttempt(state, command)),
    );
  }

  /**
   * The Practice-test dashboard summary, now built from the learner's REAL
   * completed sittings once the runner records them (WS5). A learner who has
   * taken none reads `null` — the same "no summary yet" answer the deployed
   * backend gives — and the Practice card keeps its empty/next-due states.
   */
  async getPracticeTestSummary() {
    const view = this.authority.getPracticeTestSummary(this.state());
    return view === null ? null : PracticeTestSummaryViewSchema.parse(view);
  }

  // Passage of the Day is FORMATIVE and off the authority kernel. In local dev it
  // is served by the dev Vite passage plugin (apps/learner-web/server/passage-api.ts)
  // and by the persisted HTTP authority (src/http-server.ts) — never through this
  // synthetic single-learner seam, which carries no curated passage pool. These
  // satisfy the AuthorityPort surface honestly: no passage, and an ungradeable
  // attempt.
  async passageToday(_tz: number): Promise<PassageTodayView | null> {
    return null;
  }

  async passageAttempt(
    _questionId: string,
    _choiceId: PassageChoiceId | null,
  ): Promise<PassageGrade> {
    throw new Error('Passage of the Day is not served by the synthetic in-process authority.');
  }

  async recordCarsDuel(outcome?: Parameters<AuthorityPort['recordCarsDuel']>[0]): Promise<void> {
    await this.mutateAsync((state) => this.authority.recordCarsDuel(state, outcome));
  }

  async recordPracticeTestCompleted(): Promise<void> {
    this.mutate((state) => this.authority.recordPracticeTestCompleted(state));
  }

  /**
   * Record a completed test's SCORED RESULT (WS5): persist the sitting for the
   * dashboard summary + enqueue its misses into the repair queue. Called by the
   * dev practice-test API's completion recorder — not part of `AuthorityPort`,
   * because the server computes the result from the answer key (the browser
   * never sees one), so it is a dev-server-only seam like the recorder itself.
   */
  async recordPracticeTestResult(completion: PracticeTestCompletion): Promise<void> {
    await this.mutateAsync((state) => this.authority.recordPracticeTestResult(state, completion));
  }

  /**
   * The serve-boundary gate the dev practice-test API consults before STARTING a
   * sitting: whether a test is due right now, the length tier to deal it at, and
   * the next-eligible day for a typed refusal (WS5, §6). Not part of
   * `AuthorityPort` — the practice-test flow is a dev-only server seam (the
   * browser never sees the answer key), like the recorder.
   */
  practiceTestServeGate(): PracticeTestServeGate {
    return this.authority.practiceTestServeGate(this.state());
  }

  /**
   * The DURABLE freshness the dev practice-test engine assembles + re-measures
   * against — the never-reuse item set and the dated per-unit history, read off
   * the persisted learner state so they survive a restart (WS5, §6, Task 1).
   * Read-only; a dev-only seam like the gate/recorder.
   */
  practiceTestFreshness(): ReturnType<Authority['practiceTestFreshness']> {
    return this.authority.practiceTestFreshness(this.state());
  }

  /**
   * Mark a sitting STARTED so an abandoned one is closed and the one-open
   * invariant holds (WS5, §6, Task 4). A dev-only seam like the recorder.
   */
  async recordPracticeTestStarted(started: OpenPracticeTestSitting): Promise<void> {
    this.mutate((state) => this.authority.recordPracticeTestStarted(state, started));
  }

  async recordPracticeTestReviewed(): Promise<void> {
    this.mutate((state) => this.authority.recordPracticeTestReviewed(state));
  }

  async applyMasterySeed(seed: MasterySeed): Promise<void> {
    const parsed = MasterySeedSchema.parse(seed);
    this.mutate((state) => this.authority.applyMasterySeed(state, parsed));
  }

  async getWrapped() {
    return WrappedViewSchema.parse(
      await this.mutateAsync((state) => this.authority.getWrapped(state)),
    );
  }

  async getVectorLessonStatus() {
    return VectorLessonStatusViewSchema.parse({
      availability: 'UNAVAILABLE',
      runState: 'NOT_STARTED',
      actionLabel: null,
    });
  }

  async startVectorLesson(): Promise<never> {
    throw new Error('The target lesson requires the persisted HTTP authority.');
  }

  async getVectorLessonRun(): Promise<never> {
    throw new Error('The target lesson requires the persisted HTTP authority.');
  }

  async submitVectorLessonAction(
    _runId: string,
    _screenToken: string,
    _action: VectorLessonAction,
  ): Promise<never> {
    throw new Error('The target lesson requires the persisted HTTP authority.');
  }

  // Normalized-engine catalog (L2/L3, …): the synthetic in-process authority does
  // not persist lesson runs, so — exactly like L1 above — status reports UNAVAILABLE
  // and the run/command paths defer to the persisted HTTP authority. The Curriculum
  // reads only the status here, so each catalog lesson renders as present-but-not-yet
  // -runnable in local dev rather than erroring on a missing route.
  async getNormalizedLessonStatus(_slug: string) {
    return NormalizedLessonStatusViewSchema.parse({
      availability: 'UNAVAILABLE',
      runState: 'NOT_STARTED',
      actionLabel: null,
    });
  }

  async startNormalizedLesson(_slug: string, _lessonId: string): Promise<never> {
    throw new Error('This lesson requires the persisted HTTP authority.');
  }

  async getNormalizedLessonRun(_slug: string): Promise<never> {
    throw new Error('This lesson requires the persisted HTTP authority.');
  }

  async submitNormalizedLessonAction(
    _slug: string,
    _action: NormalizedLessonAction,
  ): Promise<never> {
    throw new Error('This lesson requires the persisted HTTP authority.');
  }

  async getSkills() {
    return SkillSummarySchema.array().parse(
      this.authority.bank.skillGraph.skills.map((skill) => ({
        skillId: skill.skillId,
        cluster: skill.cluster,
        title: skill.title,
        objective: skill.objective,
      })),
    );
  }

  async resetProgress(): Promise<void> {
    this.store.clear();
  }
}
