import type { BootstrapResponse, Clock, ProbableCause } from '@mcat/contracts';
import { Authority, type LearnerState } from '@mcat/authority-core';
import { loadSyntheticBank } from '@mcat/content';
import type {
  AuthorityPort,
  DiagnosticNext,
  GoalInput,
  SkillSummary,
  StatePort,
} from './port';

/**
 * In-process authority adapter. Runs the real engine locally against a persisted
 * LearnerState. NOTE: in production the engine runs server-side only; this adapter
 * is the local/offline stand-in described in ADR 0004.
 */
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
    return this.mutate((s) => this.authority.bootstrap(s));
  }

  async getDiagnosticNext(): Promise<DiagnosticNext> {
    return this.mutate((s) => {
      const next = this.authority.diagnosticNext(s);
      const question =
        next.questionId !== undefined
          ? (this.authority.bank.compiled.get(next.questionId)?.safe ?? null)
          : null;
      return { done: next.done, question, progress: next.progress };
    });
  }

  async submitDiagnostic(questionId: string, choiceId: string | null): Promise<void> {
    this.mutate((s) => this.authority.submitDiagnosticAnswer(s, questionId, choiceId));
  }

  async confirmPlan(goal: GoalInput): Promise<void> {
    this.mutate((s) => this.authority.confirmPlan(s, goal));
  }

  async getToday() {
    return this.mutate((s) => this.authority.getToday(s));
  }

  async getSession() {
    return this.mutate((s) => this.authority.getSession(s));
  }

  async submitAttempt(choiceId: string | null): Promise<void> {
    this.mutate((s) => this.authority.submitAttempt(s, choiceId));
  }

  async selectCause(cause: ProbableCause): Promise<void> {
    this.mutate((s) => this.authority.selectCause(s, cause));
  }

  async requestReveal(): Promise<void> {
    this.mutate((s) => this.authority.requestReveal(s));
  }

  async continueStep(): Promise<void> {
    this.mutate((s) => this.authority.continueStep(s));
  }

  async submitRecall(answer: string): Promise<boolean> {
    return this.mutate((s) => this.authority.submitRecall(s, answer));
  }

  async getMasteryMap() {
    return this.mutate((s) => this.authority.getMasteryMap(s));
  }

  async getErrorLog() {
    return this.mutate((s) => this.authority.getErrorLog(s));
  }

  async getSkills(): Promise<SkillSummary[]> {
    return this.authority.bank.skillGraph.skills.map((sk) => ({
      skillId: sk.skillId,
      cluster: sk.cluster,
      title: sk.title,
      objective: sk.objective,
    }));
  }

  async resetProgress(): Promise<void> {
    this.store.clear();
  }
}
