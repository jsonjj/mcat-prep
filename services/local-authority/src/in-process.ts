import {
  BootstrapResponseSchema,
  DiagnosticNextSchema,
  ErrorEntryViewSchema,
  MasteryMapEntrySchema,
  PracticeItemViewSchema,
  PracticeResultSchema,
  SkillSummarySchema,
  StudyStepViewSchema,
  TodayViewSchema,
  WrappedViewSchema,
  type BootstrapResponse,
  type Clock,
  type LessonActionInput,
  type LessonRunId,
  type ProbableCause,
} from '@mcat/contracts';
import { Authority, type LearnerState } from '@mcat/authority-core';
import { loadSyntheticBank } from '@mcat/content';
import type { AuthorityPort, GoalInput, StatePort } from '@mcat/client-core';

/** Synthetic-only in-process authority for local development and deterministic tests. */
export class InProcessAuthorityClient implements AuthorityPort {
  private readonly authority: Authority;
  private readonly store: StatePort<LearnerState>;

  constructor(store: StatePort<LearnerState>, clock?: Clock) {
    this.authority = new Authority(loadSyntheticBank(), clock);
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

  async getToday() {
    return TodayViewSchema.parse(this.mutate((state) => this.authority.getToday(state)));
  }

  async getSession() {
    return StudyStepViewSchema.parse(this.mutate((state) => this.authority.getSession(state)));
  }

  async submitAttempt(choiceId: string | null): Promise<void> {
    this.mutate((state) => this.authority.submitAttempt(state, choiceId));
  }

  async selectCause(cause: ProbableCause): Promise<void> {
    this.mutate((state) => this.authority.selectCause(state, cause));
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

  async dispatchLessonAction(
    _runId: LessonRunId,
    _runVersion: number,
    _action: LessonActionInput,
  ): Promise<void> {
    throw new Error('No V3 lesson definition is loaded in the legacy local fixture.');
  }

  async getMasteryMap() {
    return MasteryMapEntrySchema.array().parse(
      this.mutate((state) => this.authority.getMasteryMap(state)),
    );
  }

  async getErrorLog() {
    return ErrorEntryViewSchema.array().parse(
      this.mutate((state) => this.authority.getErrorLog(state)),
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

  async recordCarsDuel(): Promise<void> {
    this.mutate((state) => this.authority.recordCarsDuel(state));
  }

  async getWrapped() {
    return WrappedViewSchema.parse(this.mutate((state) => this.authority.getWrapped(state)));
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
