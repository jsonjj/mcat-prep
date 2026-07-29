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
  PracticeAttemptResultSchema,
  PracticeItemViewSchema,
  PracticeQueueViewSchema,
  PracticeResultSchema,
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
  type PracticeAttemptCommand,
  type VectorLessonAction,
} from '@mcat/contracts';
import { Authority, type LearnerState, type PracticeBankPort } from '@mcat/authority-core';
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

  async bootstrap(): Promise<BootstrapResponse> {
    return BootstrapResponseSchema.parse(this.mutate((state) => this.authority.bootstrap(state)));
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

  async recordCarsDuel(outcome?: Parameters<AuthorityPort['recordCarsDuel']>[0]): Promise<void> {
    await this.mutateAsync((state) => this.authority.recordCarsDuel(state, outcome));
  }

  async recordPracticeTestCompleted(): Promise<void> {
    this.mutate((state) => this.authority.recordPracticeTestCompleted(state));
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
