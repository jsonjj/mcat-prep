import { createHash } from 'node:crypto';
import {
  Authority,
  MasterySeedNotCorroboratedError,
  PracticeAttemptNotAuthorizedError,
  SyntheticPracticeBankPort,
  type LearnerState,
  type PracticeBankPort,
} from '@mcat/authority-core';
import {
  AuthorityKernel,
  AuthorityKernelError,
  applyAuthorityCommand,
  forbidden,
  learnerStateFromProjection,
  streamConflict,
  toJsonObject,
  toProjectionRecord,
  validationError,
  type AuthorityKernelDependencies,
  type Principal,
} from '@mcat/authority-kernel';
import { clusterForLesson } from '@mcat/content';
import {
  AcceptedCommandResponseSchema,
  AttemptCommandSchema,
  CarsReadinessViewSchema,
  CarsReasoningPatternViewSchema,
  GoalViewSchema,
  LessonMasteryViewSchema,
  LessonWarrantViewSchema,
  PracticeAttemptResultSchema,
  PracticeItemViewSchema,
  PracticeQueueViewSchema,
  PracticeResultSchema,
  PracticeTestSummaryViewSchema,
  RepairQueueViewSchema,
  SkillMasteryViewSchema,
  SkillSummarySchema,
  TodaysPathViewSchema,
  VectorLessonRunViewSchema,
  VectorLessonStartResponseSchema,
  VectorLessonStatusViewSchema,
  WrappedViewSchema,
  type BuildTodaysPathInput,
  type CarsReadinessView,
  type CarsReasoningPatternView,
  type Clock,
  type CommandEnvelope,
  type ContentId,
  type GoalView,
  type LessonMasteryView,
  type LessonWarrantView,
  type PracticeAttemptResult,
  type PracticeItemView,
  type PracticeQueueView,
  type PracticeTestSummaryView,
  type RepairQueueView,
  type SkillMasteryView,
  type SkillSummary,
  type TodaysPathView,
  type VectorLessonCommand,
  type VectorLessonStartCommand,
  type WrappedView,
} from '@mcat/contracts';
import type {
  AcceptedCommand,
  AuthorityRepository,
  JsonObject,
  OutboxRecord,
} from '@mcat/database';
import { adaptLessonResponse } from '@mcat/domain';

import type {
  CarsDuelCommandBody,
  ContinueCommandBody,
  MasterySeedCommandBody,
  RecallCommandBody,
  RevealCommandBody,
  PracticeAttemptCommandBody,
  PracticeAdaptiveAttemptCommandBody,
} from './routes';
import {
  syntheticPracticeAuthorizationPolicy,
  type PracticeAuthorizationPolicy,
} from './practice-authorization';
import {
  applyVectorLessonAction,
  createVectorLessonRun,
  invalidateCurrentVectorLessonItem,
  renderVectorLessonRun,
  restoreVectorLessonRun,
  resumeVectorLessonRun,
  type VectorLessonRun,
} from './vector-lesson-runtime';
import { vectorLessonResponseSubmissions } from './vector-lesson-response-source';
import {
  lessonRevisionProvider,
  type LessonRevisionProvider,
  type LoadedLessonRevision,
} from './lesson-content-provider';
import {
  applyNormalizedLessonAction,
  createNormalizedLessonRun,
  normalizedRunRevisionAddress,
  renderNormalizedLessonRun,
  restoreNormalizedLessonRun,
  resumeNormalizedLessonRun,
  type NormalizedLessonAction,
  type NormalizedLessonRun,
} from './normalized-lesson-runtime';
import { normalizedLessonResponseSubmissions } from './normalized-lesson-response-source';
import type { LessonResponseSubmission } from './lesson-response-seam';

/**
 * Re-exported so existing consumers keep one import site. The declaration lives
 * in `./lesson-response-seam` because a second lesson's runtime must be able to
 * produce the shape without importing this lambda's workflow.
 */
export type { LessonBindingResolution, LessonResponseSubmission } from './lesson-response-seam';

interface MutationApplication {
  readonly eventType: string;
  readonly payload: JsonObject;
  readonly result?: JsonObject;
  readonly replacementState?: LearnerState;
}

/** Produces the responses a lesson runtime committed between two run states. */
export type LessonResponseSubmissionSource = (
  before: VectorLessonRun,
  after: VectorLessonRun,
) => readonly LessonResponseSubmission[];

interface WorkflowDependencies {
  readonly repository: AuthorityRepository;
  readonly clock: Clock;
  readonly bank: AuthorityKernelDependencies['bank'];
  readonly practiceAuthorization?: PracticeAuthorizationPolicy;
  /**
   * Override the lesson-runtime submission source. Production uses the vector
   * lesson's. A test injects one to reach states no on-disk artifact can express
   * yet — notably a BKT-eligible response, since all 115 real bindings are
   * instructional-only (lesson-evidence-mastery-contract §11).
   */
  readonly lessonResponseSubmissions?: LessonResponseSubmissionSource;
  /** Exact immutable lesson boundary used by the normalized runtime. */
  readonly lessonRevisionProvider?: LessonRevisionProvider;
  /** Adaptive-practice bank/exposure seam. Falls back to synthetic when absent. */
  readonly practiceBank?: PracticeBankPort;
  /**
   * Whether the periodic scored practice TEST may be reserved into Today's Path.
   * Defaults to `true`. The deployed runtime sets this `false` until the
   * scored-test RUNNER is served by the deployed backend (today it is a
   * dev/preview-only `/api/practice-test/*` surface with no production route), so
   * the strict plan never reserves a slot whose runner would deadlock it.
   */
  readonly practiceTestEnabled?: boolean;
}

type VectorLessonLearnerState = LearnerState & {
  vectorLessonRun?: VectorLessonRun;
};

function withVectorLesson(state: LearnerState): VectorLessonLearnerState {
  return state as VectorLessonLearnerState;
}

/**
 * The persisted delivery slot for every NORMALIZED-engine lesson (L2/L3 and
 * future lessons), keyed by lessonId. L1 keeps its own bespoke `vectorLessonRun`
 * slot untouched; the two never collide, so the per-grammar dispatch is a slot
 * choice rather than a rewrite. A `NormalizedLessonRun` is a small plain object,
 * so it serializes onto the learner projection exactly like `vectorLessonRun`.
 */
type NormalizedLessonsLearnerState = LearnerState & {
  normalizedLessonRuns?: Record<string, NormalizedLessonRun>;
};

function withNormalizedLessons(state: LearnerState): NormalizedLessonsLearnerState {
  return state as NormalizedLessonsLearnerState;
}

/** One command for a normalized-engine lesson: an envelope plus an engine action. */
export interface NormalizedLessonCommandInput {
  readonly envelope: CommandEnvelope;
  readonly action: NormalizedLessonAction;
}

function policyVersions(state: LearnerState): Readonly<Record<string, string>> {
  const policies = state.events.at(-1)?.policies ?? [];
  return Object.fromEntries(policies.map(({ policyId, version }) => [policyId, version]));
}

function rebindRecordedEvent(
  state: LearnerState,
  previousEventCount: number,
  envelope: CommandEnvelope,
): void {
  const event = state.events[previousEventCount];
  if (event === undefined || state.events.length !== previousEventCount + 1) {
    throw validationError('The workflow command is not valid in the current learner state.');
  }
  event.eventId = envelope.eventId;
  event.idempotencyKey = envelope.idempotencyKey;
  event.occurredAt = envelope.occurredAt;
  event.taskInstanceId = envelope.taskInstanceId;
  state.seenIdempotencyKeys = [...state.seenIdempotencyKeys.slice(0, -1), envelope.idempotencyKey];
}

function deterministicUuid(seed: string): string {
  const bytes = createHash('sha256').update(seed, 'utf8').digest().subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function deterministicEvidenceId(eventId: string, index: number): string {
  return index === 0 ? eventId : deterministicUuid(`${eventId}:${index}`);
}

/**
 * The observation id for one accepted lesson response.
 *
 * Derived from the accepted event rather than generated, because it is the key
 * BKT deduplicates on (lesson-evidence-mastery-contract §12): a response
 * re-derived from the same event must resolve to the same observation and move
 * nothing the second time.
 */
function lessonObservationId(eventId: string): string {
  return deterministicUuid(`${eventId}:lesson-observation`);
}

function bindNewEvidence(
  state: LearnerState,
  previousEvidenceCount: number,
  envelope: CommandEnvelope,
): void {
  const added = state.evidence.slice(previousEvidenceCount);
  if (added.length === 0) {
    throw validationError('The workflow command did not produce the required evidence.');
  }
  for (const [index, evidence] of added.entries()) {
    evidence.evidenceId = deterministicEvidenceId(envelope.eventId, index);
  }
}

export class RepositoryLearnerKernel {
  private readonly authorityKernel: AuthorityKernel;
  private readonly practiceAuthorization: PracticeAuthorizationPolicy;
  /**
   * ONE practice bank for the lifetime of this kernel, including the synthetic
   * fallback.
   *
   * `Authority` builds its own fallback port when none is injected, and this
   * class builds a fresh `Authority` per request — so with no `DATABASE_URL`
   * every request used to get its own empty per-learner bookkeeping. That was
   * survivable while the only casualties were exposure counts and the repair
   * queue (a warm instance simply looked like a cold one). It is not survivable
   * now: `getPracticeQueue` records the attempt grant that
   * `submitPracticeAttempt` checks for, and those are two different requests.
   * Hoisting the fallback here is what makes serve-then-answer one
   * conversation rather than two.
   */
  private readonly practiceBank: PracticeBankPort;

  constructor(private readonly dependencies: WorkflowDependencies) {
    this.authorityKernel = new AuthorityKernel(dependencies);
    this.practiceAuthorization =
      dependencies.practiceAuthorization ?? syntheticPracticeAuthorizationPolicy;
    this.practiceBank =
      dependencies.practiceBank ?? new SyntheticPracticeBankPort(dependencies.bank);
  }

  handle(input: unknown, principal: Principal) {
    return this.authorityKernel.handle(input, principal);
  }

  snapshot(principal: Principal) {
    return this.authorityKernel.snapshot(principal);
  }

  async skills(principal: Principal): Promise<readonly SkillSummary[]> {
    await this.loadState(principal);
    return SkillSummarySchema.array().parse(
      this.dependencies.bank.skillGraph.skills.map(({ skillId, cluster, title, objective }) => ({
        skillId,
        cluster,
        title,
        objective,
      })),
    );
  }

  async practiceItem(
    questionId: ContentId,
    principal: Principal,
  ): Promise<PracticeItemView | null> {
    await this.loadState(principal);
    if (!this.practiceAuthorization.permits(principal, questionId)) return null;
    const authority = new Authority(this.dependencies.bank, this.dependencies.clock);
    const item = authority.getPracticeItem(questionId);
    return item === null ? null : PracticeItemViewSchema.parse(item);
  }

  async wrapped(principal: Principal): Promise<WrappedView> {
    const state = await this.loadState(principal);
    return WrappedViewSchema.parse(await this.authority().getWrapped(state));
  }

  async masterySkills(principal: Principal): Promise<readonly SkillMasteryView[]> {
    const state = await this.loadState(principal);
    const authority = new Authority(this.dependencies.bank, this.dependencies.clock);
    return SkillMasteryViewSchema.array().parse(authority.getMasterySkills(state));
  }

  async masteryLessons(principal: Principal): Promise<readonly LessonMasteryView[]> {
    const state = await this.loadState(principal);
    const authority = new Authority(this.dependencies.bank, this.dependencies.clock);
    return LessonMasteryViewSchema.array().parse(authority.getMasteryLessons(state));
  }

  async lessonWarrants(principal: Principal): Promise<readonly LessonWarrantView[]> {
    const state = await this.loadState(principal);
    const authority = new Authority(this.dependencies.bank, this.dependencies.clock);
    return LessonWarrantViewSchema.array().parse(authority.getLessonWarrants(state));
  }

  async carsReadiness(principal: Principal): Promise<CarsReadinessView> {
    const state = await this.loadState(principal);
    const authority = new Authority(this.dependencies.bank, this.dependencies.clock);
    return CarsReadinessViewSchema.parse(authority.getCarsReadiness(state));
  }

  /**
   * Mistakes Surface C (WS7): CARS reasoning-pattern repairs from weak duels.
   * Uses the bank-backed authority (`this.authority()`) because the read hydrates
   * the pinned passage and classifies later CARS answers to compute resolution.
   */
  async carsReasoningPatterns(principal: Principal): Promise<readonly CarsReasoningPatternView[]> {
    const state = await this.loadState(principal);
    return CarsReasoningPatternViewSchema.array().parse(
      await this.authority().getCarsReasoningPatterns(state),
    );
  }

  /**
   * The guided repair queue for the Review-Mistakes runner: a prioritized,
   * servability-filtered, capped subset of the four Mistakes buckets. Uses the
   * bank-backed authority because it hydrates the buckets' content and reads back
   * the CARS corpus for resolution. A read — moves no mastery.
   */
  async getRepairQueue(limit: number, principal: Principal): Promise<RepairQueueView> {
    const state = await this.loadState(principal);
    return RepairQueueViewSchema.parse(await this.authority().getRepairQueue(state, limit));
  }

  /** Read-only goal projection for the Account/Profile editor prefill (WS8). */
  async goal(principal: Principal): Promise<GoalView> {
    const state = await this.loadState(principal);
    const authority = new Authority(this.dependencies.bank, this.dependencies.clock);
    return GoalViewSchema.parse(authority.getGoal(state));
  }

  // -------------------------------------------------------------------------
  // Today's Path + daily budget + practice-test summary.
  //
  // The daily-plan engine lives on the core `Authority`, so these delegate to
  // it through the SAME `mutate`/`loadState` transaction, idempotency, and
  // projection persistence every other command uses — no bespoke store. The
  // deployed learner API routes Today's Path + daily budget (see `ROUTES` /
  // `handler.ts`), so `pnpm dev` (services/local-learner-api) and prod serve the
  // same methods the local full-engine HTTP server (services/local-authority)
  // already dispatched to. `practiceTestSummary` remains dev-only until the
  // scored-test runner ships a production route.
  // -------------------------------------------------------------------------

  /** Read the current day's plan (built:false when none exists for today yet). */
  async getTodaysPath(principal: Principal): Promise<TodaysPathView> {
    const state = await this.loadState(principal);
    return TodaysPathViewSchema.parse(this.authority().getTodaysPath(state));
  }

  /** Build (and persist) today's plan from the client-fed recall load + candidates. */
  async buildTodaysPath(
    command: { readonly envelope: CommandEnvelope; readonly input: BuildTodaysPathInput },
    principal: Principal,
  ): Promise<TodaysPathView> {
    const view = await this.mutate(command.envelope, principal, async (authority, state) => {
      const built = await authority.buildTodaysPath(state, command.input, {
        // Server-authoritative capability gate (defaults on). The deployed API
        // sets this off until the scored-test runner is wired into prod.
        practiceTestEnabled: this.dependencies.practiceTestEnabled ?? true,
      });
      return {
        eventType: 'todays_path_built',
        payload: toJsonObject({ envelope: command.envelope, input: command.input }),
        result: toJsonObject(TodaysPathViewSchema.parse(built)),
      };
    });
    return TodaysPathViewSchema.parse(view);
  }

  /** Advance the guided runner: mark one activity in_progress / complete / skipped. */
  async recordPlanActivity(
    command: {
      readonly envelope: CommandEnvelope;
      readonly activityId: string;
      readonly status: 'in_progress' | 'complete' | 'skipped';
    },
    principal: Principal,
  ) {
    return AcceptedCommandResponseSchema.parse(
      await this.mutate(command.envelope, principal, async (authority, state) => {
        await authority.recordPlanActivity(state, command.activityId, command.status);
        return { eventType: 'plan_activity_recorded', payload: toJsonObject(command) };
      }),
    );
  }

  /** Set the daily time-budget preset (2–6 hr, in minutes; clamped by the engine). */
  async setDailyBudget(
    command: { readonly envelope: CommandEnvelope; readonly minutesPerDay: number },
    principal: Principal,
  ) {
    return AcceptedCommandResponseSchema.parse(
      await this.mutate(command.envelope, principal, (authority, state) => {
        authority.setDailyBudget(state, command.minutesPerDay);
        return { eventType: 'daily_budget_set', payload: toJsonObject(command) };
      }),
    );
  }

  /** Practice-TEST dashboard summary; null until the learner completes a sitting. */
  async practiceTestSummary(principal: Principal): Promise<PracticeTestSummaryView | null> {
    const state = await this.loadState(principal);
    const view = this.authority().getPracticeTestSummary(state);
    return view === null ? null : PracticeTestSummaryViewSchema.parse(view);
  }

  async vectorLessonStatus(principal: Principal) {
    const state = withVectorLesson(await this.loadState(principal));
    const run =
      state.vectorLessonRun === undefined
        ? undefined
        : restoreVectorLessonRun(state.vectorLessonRun);
    return VectorLessonStatusViewSchema.parse({
      availability: 'AVAILABLE',
      runState: run?.paused ? 'PAUSED' : (run?.status ?? 'NOT_STARTED'),
      actionLabel: run === undefined ? 'Start' : run.status === 'BLOCKED' ? null : 'Continue',
    });
  }

  async vectorLessonRun(principal: Principal) {
    const state = withVectorLesson(await this.loadState(principal));
    if (state.vectorLessonRun === undefined) {
      throw validationError('Start this lesson before requesting its current screen.');
    }
    return VectorLessonRunViewSchema.parse(
      renderVectorLessonRun(restoreVectorLessonRun(state.vectorLessonRun)),
    );
  }

  async handleVectorLessonStart(command: VectorLessonStartCommand, principal: Principal) {
    return VectorLessonStartResponseSchema.parse(
      await this.mutate(command.envelope, principal, (_authority, baseState) => {
        const state = withVectorLesson(baseState);
        const existing =
          state.vectorLessonRun === undefined
            ? undefined
            : restoreVectorLessonRun(state.vectorLessonRun);
        const disposition =
          existing === undefined
            ? 'STARTED'
            : existing.status === 'DELIVERY_COMPLETE'
              ? 'ALREADY_COMPLETE'
              : 'RESUMED';
        state.vectorLessonRun =
          existing === undefined
            ? createVectorLessonRun({ now: command.envelope.occurredAt })
            : existing.status === 'DELIVERY_COMPLETE'
              ? existing
              : resumeVectorLessonRun(existing, command.envelope.occurredAt);
        return {
          eventType:
            disposition === 'STARTED'
              ? 'lesson_shell_started'
              : disposition === 'RESUMED'
                ? 'lesson_shell_resumed'
                : 'lesson_delivery_already_complete',
          payload: toJsonObject(command),
          result: toJsonObject(
            VectorLessonStartResponseSchema.parse({
              runId: state.vectorLessonRun.runId,
              disposition,
              path: '/app/lessons/vectors-and-trigonometry',
              streamVersion: baseState.nextSequence + 1,
            }),
          ),
        };
      }),
    );
  }

  async handleVectorLessonCommand(command: VectorLessonCommand, principal: Principal) {
    return AcceptedCommandResponseSchema.parse(
      await this.mutate(command.envelope, principal, (authority, baseState) => {
        const state = withVectorLesson(baseState);
        if (state.vectorLessonRun === undefined) {
          throw validationError('Start this lesson before sending a lesson command.');
        }
        const previousRun = restoreVectorLessonRun(state.vectorLessonRun);
        try {
          state.vectorLessonRun = applyVectorLessonAction(
            previousRun,
            command,
            command.envelope.occurredAt,
          );
        } catch (error) {
          if (error instanceof AuthorityKernelError) throw error;
          throw validationError(
            error instanceof Error
              ? error.message
              : 'The lesson command does not match the authoritative checkpoint.',
          );
        }
        const lessonResponse = this.recordLessonResponse(
          authority,
          baseState,
          command.envelope,
          (this.dependencies.lessonResponseSubmissions ?? vectorLessonResponseSubmissions)(
            previousRun,
            state.vectorLessonRun,
          ),
        );
        return {
          eventType: 'lesson_command_accepted',
          payload: toJsonObject({
            ...command,
            ...(lessonResponse === null ? {} : { lessonResponse }),
          }),
        };
      }),
    );
  }

  // -------------------------------------------------------------------------
  // Normalized-engine lesson transport (L2/L3, and future lessons).
  //
  // Deliberately PARALLEL to the vector-lesson methods above rather than a
  // rewrite of them: L1's bespoke machine keeps its own slot and handlers
  // (owner decision — per-grammar dispatch), and these serve every other
  // catalog lesson off the shared `NormalizedLesson` engine + the SAME generic
  // `recordLessonResponse`. The HTTP layer maps each lesson's route to the
  // right family; nothing here decides correctness, evidence kind, or P(L).
  // -------------------------------------------------------------------------

  private normalizedLessonProvider(): LessonRevisionProvider {
    return this.dependencies.lessonRevisionProvider ?? lessonRevisionProvider;
  }

  private async exactNormalizedLessonRevision(
    value: unknown,
    expectedLessonId: string,
  ): Promise<LoadedLessonRevision> {
    const address = normalizedRunRevisionAddress(value);
    if (address.lessonId !== expectedLessonId) {
      throw validationError('The persisted run does not match the requested lesson.');
    }
    return this.normalizedLessonProvider().loadExactRevision(
      address.lessonId,
      address.definitionHash,
    );
  }

  async normalizedLessonStatus(lessonId: string, principal: Principal) {
    const state = withNormalizedLessons(await this.loadState(principal));
    const persisted = state.normalizedLessonRuns?.[lessonId];
    const run =
      persisted === undefined
        ? undefined
        : restoreNormalizedLessonRun(
            persisted,
            await this.exactNormalizedLessonRevision(persisted, lessonId),
          );
    return {
      availability: 'AVAILABLE' as const,
      runState: run?.paused ? 'PAUSED' : (run?.status ?? 'NOT_STARTED'),
      actionLabel: run === undefined ? 'Start' : run.status === 'BLOCKED' ? null : 'Continue',
    };
  }

  async normalizedLessonRun(lessonId: string, principal: Principal) {
    const state = withNormalizedLessons(await this.loadState(principal));
    const persisted = state.normalizedLessonRuns?.[lessonId];
    if (persisted === undefined) {
      throw validationError('Start this lesson before requesting its current screen.');
    }
    const revision = await this.exactNormalizedLessonRevision(persisted, lessonId);
    return renderNormalizedLessonRun(restoreNormalizedLessonRun(persisted, revision), revision);
  }

  async handleNormalizedLessonStart(
    lessonId: string,
    command: { readonly envelope: CommandEnvelope },
    principal: Principal,
  ) {
    return this.mutate(command.envelope, principal, async (_authority, baseState) => {
      const state = withNormalizedLessons(baseState);
      const runs = (state.normalizedLessonRuns ??= {});
      const persisted = runs[lessonId];
      const revision =
        persisted === undefined
          ? await this.normalizedLessonProvider().loadActiveRevision({ lessonId })
          : await this.exactNormalizedLessonRevision(persisted, lessonId);
      const existing =
        persisted === undefined ? undefined : restoreNormalizedLessonRun(persisted, revision);
      const disposition =
        existing === undefined
          ? 'STARTED'
          : existing.status === 'DELIVERY_COMPLETE'
            ? 'ALREADY_COMPLETE'
            : 'RESUMED';
      runs[lessonId] =
        existing === undefined
          ? createNormalizedLessonRun({
              revision,
              now: command.envelope.occurredAt,
            })
          : existing.status === 'DELIVERY_COMPLETE'
            ? existing
            : resumeNormalizedLessonRun(existing, command.envelope.occurredAt);
      return {
        eventType:
          disposition === 'STARTED'
            ? 'lesson_shell_started'
            : disposition === 'RESUMED'
              ? 'lesson_shell_resumed'
              : 'lesson_delivery_already_complete',
        payload: toJsonObject({ envelope: command.envelope, lessonId }),
        result: toJsonObject({
          runId: runs[lessonId].runId,
          disposition,
          streamVersion: baseState.nextSequence + 1,
        }),
      };
    });
  }

  async handleNormalizedLessonCommand(
    lessonId: string,
    command: NormalizedLessonCommandInput,
    principal: Principal,
  ) {
    return this.mutate(command.envelope, principal, async (authority, baseState) => {
      const state = withNormalizedLessons(baseState);
      const runs = state.normalizedLessonRuns;
      const persisted = runs?.[lessonId];
      if (runs === undefined || persisted === undefined) {
        throw validationError('Start this lesson before sending a lesson command.');
      }
      const revision = await this.exactNormalizedLessonRevision(persisted, lessonId);
      const previousRun = restoreNormalizedLessonRun(persisted, revision);
      let nextRun: NormalizedLessonRun;
      try {
        nextRun = applyNormalizedLessonAction(
          previousRun,
          command.action,
          command.envelope.occurredAt,
          revision,
        );
      } catch (error) {
        if (error instanceof AuthorityKernelError) throw error;
        throw validationError(
          error instanceof Error
            ? error.message
            : 'The lesson command does not match the authoritative checkpoint.',
        );
      }
      runs[lessonId] = nextRun;
      const lessonResponse = this.recordLessonResponse(
        authority,
        baseState,
        command.envelope,
        normalizedLessonResponseSubmissions(previousRun, nextRun, revision),
      );
      return {
        eventType: 'lesson_command_accepted',
        payload: toJsonObject({
          envelope: command.envelope,
          lessonId,
          action: command.action,
          ...(lessonResponse === null ? {} : { lessonResponse }),
        }),
      };
    });
  }

  /**
   * Record one lesson response: normalize, route to evidence, qualify for BKT.
   *
   * Deliberately generic. It reads `submission.lessonId` and nothing else about
   * which lesson ran, so a second lesson reuses it by supplying the same shape.
   * Every judgement is made downstream of here by `adaptLessonResponse` and the
   * authority; this method decides nothing about correctness, independence,
   * evidence kind, or whether `pL` moves.
   *
   * Atomicity: the caller runs inside one repository transaction, and both
   * writes land on the same in-memory `state` that transaction persists. A
   * throw anywhere below aborts the transaction with nothing written — no
   * event, no evidence, no BKT movement.
   */
  private recordLessonResponse(
    authority: Authority,
    state: LearnerState,
    envelope: CommandEnvelope,
    submissions: readonly LessonResponseSubmission[],
  ): JsonObject | null {
    const submission = submissions[0];
    if (submission === undefined) return null;
    if (submissions.length > 1) {
      // One accepted command is one event, so it may carry at most one
      // response. More than one would make the event/evidence grain ambiguous.
      throw validationError('A lesson command may commit at most one response.');
    }

    const cluster = clusterForLesson(submission.lessonId);
    if (cluster === null) {
      // `EvidenceRecord.cluster` is caller-resolved and required. Refusing the
      // command is the fail-closed answer: recording the response without its
      // cluster would silently drop the evidence instead.
      throw new AuthorityKernelError({
        code: 'unavailable',
        message: 'This lesson has no resolved cluster, so its response cannot be recorded.',
      });
    }

    const evidenceId = deterministicEvidenceId(envelope.eventId, 0);
    const adaptation = adaptLessonResponse({
      binding: submission.binding,
      response: submission.response,
      scoring: submission.scoring,
      identity: {
        observationId: lessonObservationId(envelope.eventId),
        eventId: envelope.eventId,
        learnerId: state.learnerId,
        idempotencyKey: envelope.idempotencyKey,
        evidenceId,
      },
      cluster,
      envelopeBindingVersion: submission.envelopeBindingVersion,
      acceptedAt: this.dependencies.clock.now(),
      sequence: state.nextSequence + 1,
      contentRelease: this.dependencies.bank.contentRelease,
      policies: state.events.at(-1)?.policies ?? [],
      ...(submission.lessonAttribution === undefined
        ? {}
        : { lessonAttribution: submission.lessonAttribution }),
    });

    // BKT FIRST, then evidence. The authority re-parses the observation through
    // its strict schema and deduplicates on `observationId`, so this is the
    // second idempotency guard and the only path by which a lesson can reach
    // `pL`.
    const applied =
      adaptation.qualification.status === 'qualified'
        ? authority.applyQualifiedBktObservation(state, {
            observation: adaptation.qualification.observation,
            lessonId: submission.lessonId,
          })
        : null;

    // A REFUSED application means the server rejected the observation's own
    // premises — today, a timestamp it will not accept. Evidence and BKT then
    // refuse together: keeping the record would leave a warrant behind for a
    // response the server just declined, and warrant signals are exactly the
    // time-derived ones. This is NOT the same as `qualification` merely not
    // qualifying: an instructional-only binding produces no BKT observation and
    // its evidence is still recorded, which is the whole point of §7.2.
    const refusedByAuthority = applied?.status === 'rejected';

    // Two guards already stand ahead of the append: `mutate` returns the stored
    // result for a seen idempotency key without re-applying, and the repository
    // rejects a reused event id. This last one makes the append itself
    // idempotent on the id derived from the event, so "one event, one evidence
    // record" holds by construction rather than by those two staying correct.
    if (
      adaptation.evidence !== null &&
      !refusedByAuthority &&
      !state.evidence.some((record) => record.evidenceId === evidenceId)
    ) {
      state.evidence.push(adaptation.evidence);
    }

    // Ids and codes only. The accepted observation itself is server-only and
    // snapshots the binding, including its protected scoring reference, so it
    // is never written into an event payload.
    //
    // `binding` carries the load diagnostics on EVERY accepted response, empty
    // list included. §3.7 requires an unmapped author key to be reported rather
    // than dropped, and a binding that stopped validating must be tellable
    // apart from an id that never existed — otherwise "this item silently
    // produces no evidence" has no signal anywhere in production.
    return toJsonObject({
      status: adaptation.status,
      binding: {
        resolution: submission.bindingResolution.status,
        unrecognizedKeys: [...submission.bindingResolution.unrecognizedKeys],
      },
      // The level AND whether the runtime measured it. `EvidenceRecord` carries
      // only the level, and `AssistanceLevel` has no `UNOBSERVED` member, so
      // "we saw no help taken" and "we could not tell" are indistinguishable
      // there. Recording the pair here keeps them distinguishable somewhere
      // durable until the contract can carry the fact itself.
      assistance: {
        level: submission.response.assistanceLevel,
        observed: submission.assistanceObserved,
        requested: submission.runtimeObservation?.assistanceRequested ?? null,
        taken: submission.runtimeObservation?.assistanceTaken ?? null,
      },
      firstAttempt: submission.runtimeObservation?.firstAttempt ?? null,
      observationId: adaptation.observation?.observationId ?? null,
      evidenceId: adaptation.evidence === null || refusedByAuthority ? null : evidenceId,
      evidenceKind: refusedByAuthority ? null : (adaptation.evidence?.kind ?? null),
      bkt: applied?.status ?? 'not_qualified',
      rejectionCodes:
        adaptation.qualification.status === 'rejected'
          ? [...adaptation.qualification.rejectionCodes]
          : [],
    });
  }

  async handleVectorLessonInvalidation(envelope: CommandEnvelope, principal: Principal) {
    return AcceptedCommandResponseSchema.parse(
      await this.mutate(envelope, principal, (_authority, baseState) => {
        const state = withVectorLesson(baseState);
        if (state.vectorLessonRun === undefined) {
          throw validationError('Start this lesson before invalidating a lesson item.');
        }
        state.vectorLessonRun = invalidateCurrentVectorLessonItem(
          restoreVectorLessonRun(state.vectorLessonRun),
          envelope.occurredAt,
        );
        return {
          eventType: 'lesson_item_invalidated',
          payload: toJsonObject({
            envelope,
            lessonId: state.vectorLessonRun.lessonId,
            runId: state.vectorLessonRun.runId,
          }),
        };
      }),
    );
  }

  async handleAttempt(input: unknown, principal: Principal) {
    const command = AttemptCommandSchema.parse(input);
    return AcceptedCommandResponseSchema.parse(
      await this.mutate(command.envelope, principal, (authority, state) => {
        if (state.onboarding.diagnosticComplete) {
          const current = authority.getSession(state);
          const normalizedCommand = {
            ...command,
            isDiagnosticRetry: current.kind === 'question' && current.sub === 'retry',
          };
          return applyAuthorityCommand(authority, state, normalizedCommand);
        }

        const next = authority.diagnosticNext(state);
        if (
          next.done ||
          next.questionId !== command.questionId ||
          command.assistanceLevel !== 'A0' ||
          command.contentBearingHintUsed ||
          command.isDiagnosticRetry
        ) {
          throw validationError('The attempt does not match the authoritative diagnostic item.');
        }
        const previousEventCount = state.events.length;
        const previousEvidenceCount = state.evidence.length;
        authority.submitDiagnosticAnswer(state, command.questionId, command.choiceId);
        authority.diagnosticNext(state);
        rebindRecordedEvent(state, previousEventCount, command.envelope);
        for (const evidence of state.evidence.slice(previousEvidenceCount)) {
          evidence.evidenceId = command.envelope.eventId;
        }
        return {
          eventType: 'diagnostic_attempt_submitted',
          payload: toJsonObject(command),
        };
      }),
    );
  }

  async handleReveal(command: RevealCommandBody, principal: Principal) {
    return AcceptedCommandResponseSchema.parse(
      await this.mutate(command.envelope, principal, (authority, state) => {
        const current = authority.getSession(state);
        if (
          current.kind !== 'question' ||
          current.phase === 'protected' ||
          current.sub === 'reveal'
        ) {
          throw validationError('Reveal is not available for the current learner step.');
        }
        const previousEventCount = state.events.length;
        authority.requestReveal(state);
        rebindRecordedEvent(state, previousEventCount, command.envelope);
        return { eventType: 'reveal_requested', payload: toJsonObject(command) };
      }),
    );
  }

  async handleContinue(command: ContinueCommandBody, principal: Principal) {
    return AcceptedCommandResponseSchema.parse(
      await this.mutate(command.envelope, principal, (authority, state) => {
        const current = authority.getSession(state);
        const allowed =
          current.kind === 'lesson' ||
          current.kind === 'simulation' ||
          (current.kind === 'question' && current.sub === 'reveal');
        if (!allowed) {
          throw validationError('Continue is not available for the current learner step.');
        }
        authority.continueStep(state);
        return { eventType: 'learning_step_continued', payload: toJsonObject(command) };
      }),
    );
  }

  async handleRecall(command: RecallCommandBody, principal: Principal) {
    return this.mutate(command.envelope, principal, (authority, state) => {
      const current = authority.getSession(state);
      if (current.kind !== 'recall') {
        throw validationError('Recall is not available for the current learner step.');
      }
      const previousEventCount = state.events.length;
      const correct = authority.submitRecall(state, command.answer);
      rebindRecordedEvent(state, previousEventCount, command.envelope);
      return {
        eventType: 'recall_submitted',
        payload: toJsonObject(command),
        result: toJsonObject({ correct }),
      };
    });
  }

  async handlePractice(command: PracticeAttemptCommandBody, principal: Principal) {
    if (!this.practiceAuthorization.permits(principal, command.questionId)) throw forbidden();
    return PracticeResultSchema.parse(
      await this.mutate(command.envelope, principal, (authority, state) => {
        if (authority.getPracticeItem(command.questionId) === null) {
          throw validationError('The requested practice item is not available.');
        }
        const previousEventCount = state.events.length;
        const previousEvidenceCount = state.evidence.length;
        const result = authority.checkPractice(state, command.questionId, command.choiceId);
        rebindRecordedEvent(state, previousEventCount, command.envelope);
        bindNewEvidence(state, previousEvidenceCount, command.envelope);
        return {
          eventType: 'practice_attempt_submitted',
          payload: toJsonObject(command),
          result: toJsonObject(PracticeResultSchema.parse(result)),
        };
      }),
    );
  }

  async handleCarsDuel(command: CarsDuelCommandBody, principal: Principal) {
    const { envelope, ...outcome } = command;
    return AcceptedCommandResponseSchema.parse(
      await this.mutate(envelope, principal, async (authority, state) => {
        const previousEvidenceCount = state.evidence.length;
        // Formative only: records the ability nudge + duel-selection history (WS6)
        // and, on a weak duel, pins a CARS reasoning-pattern repair (WS7) — never
        // mastery. The rubric + which selection was played ride in `outcome`. Async
        // since WS7 (the repair selects a real CARS bank item); still no mastery.
        await authority.recordCarsDuel(state, outcome);
        bindNewEvidence(state, previousEvidenceCount, envelope);
        return { eventType: 'cars_duel_recorded', payload: toJsonObject(command) };
      }),
    );
  }

  /**
   * WS5 (§6): record a completed periodic practice test. Formative like the CARS
   * Duel — it moves only the cadence slice (`state.practiceTests`), never mastery
   * — so no evidence is bound. The re-measure lives in WS5's own scorer.
   */
  async handlePracticeTestCompleted(command: ContinueCommandBody, principal: Principal) {
    return AcceptedCommandResponseSchema.parse(
      await this.mutate(command.envelope, principal, (authority, state) => {
        authority.recordPracticeTestCompleted(state);
        return { eventType: 'practice_test_completed', payload: toJsonObject(command) };
      }),
    );
  }

  /** WS5 (§6): record that the last completed test's review is done (releases the gate). */
  async handlePracticeTestReviewed(command: ContinueCommandBody, principal: Principal) {
    return AcceptedCommandResponseSchema.parse(
      await this.mutate(command.envelope, principal, (authority, state) => {
        authority.recordPracticeTestReviewed(state);
        return { eventType: 'practice_test_reviewed', payload: toJsonObject(command) };
      }),
    );
  }

  /**
   * Apply the diagnostic's opening priors. No evidence is bound: a seed is not
   * an attempt, and nothing here can move a unit the learner has practised.
   *
   * The payload is corroborated inside the authority before it is applied.
   * `MasterySeedSchema` validates SHAPE — that the values are probabilities and
   * the keys are non-empty strings — and the authority re-clamps every value,
   * which is why a fabricated seed cannot mint mastery. Neither of those says
   * anything about WHICH units a seed is entitled to move, and the planner ranks
   * on exactly that: a caller could name arbitrary KC ids at the floor or the
   * cap with no diagnostic taken at all.
   *
   * `applyMasterySeed` refuses any payload the one real producer could not have
   * emitted, and it does so INSIDE the authority rather than here. This route
   * used to hold the check itself, which left the in-process dev authority — the
   * other real caller of the same method — with no check at all. All this route
   * owns now is the status code. See `corroborateMasterySeed` for what the
   * refusal does and does not establish: it is a shape check, not proof that a
   * diagnostic was taken, and closing the remainder needs the issuing service
   * and the authority to share a fact.
   *
   * The refusal is a 400 rather than a silent drop of the offending entries:
   * keeping the acceptable half of a payload the server has already decided is
   * dishonest is how a restriction loses to a permission. The reason names which
   * of the four producer properties failed and stays server-side.
   */
  async handleMasterySeed(command: MasterySeedCommandBody, principal: Principal) {
    try {
      return AcceptedCommandResponseSchema.parse(
        await this.mutate(command.envelope, principal, (authority, state) => {
          authority.applyMasterySeed(state, command.seed);
          return { eventType: 'mastery_seed_applied', payload: toJsonObject(command) };
        }),
      );
    } catch (error) {
      if (error instanceof MasterySeedNotCorroboratedError) {
        throw validationError(
          `The diagnostic seed is not one this server could have produced (${error.reason}).`,
        );
      }
      throw error;
    }
  }

  async handleReset(command: ContinueCommandBody, principal: Principal) {
    return AcceptedCommandResponseSchema.parse(
      await this.mutate(command.envelope, principal, (authority, state) => {
        const fresh = authority.createGuest();
        fresh.learnerId = state.learnerId;
        return {
          eventType: 'learner_progress_reset',
          payload: toJsonObject(command),
          replacementState: fresh,
        };
      }),
    );
  }

  private async loadState(principal: Principal): Promise<LearnerState> {
    const projection = await this.dependencies.repository.loadProjection(principal.learnerId);
    if (projection === null) {
      throw new AuthorityKernelError({
        code: 'not_found',
        message: 'The learner resource was not found.',
      });
    }
    if (projection.learnerId !== principal.learnerId) throw forbidden();
    return learnerStateFromProjection(projection);
  }

  private authority(): Authority {
    return new Authority(this.dependencies.bank, this.dependencies.clock, this.practiceBank);
  }

  /**
   * Read-only adaptive practice queue (no event; not idempotency-gated).
   */
  async getPracticeQueueAdaptive(
    x: number,
    focus: string | null,
    principal: Principal,
  ): Promise<PracticeQueueView> {
    const state = await this.loadState(principal);
    const view = await this.authority().getPracticeQueue(
      state,
      x,
      focus === null ? undefined : focus,
    );
    return PracticeQueueViewSchema.parse(view);
  }

  /**
   * Score one adaptive-practice answer. A first, unassisted attempt moves the
   * P(L) mastery signal (persisted in the projection) and records exposure +
   * repair through the injected bank port; retries are learning-only.
   *
   * The authorization check is NOT here, deliberately. `handlePractice` above
   * gates its own route with `practiceAuthorization.permits`, and copying that
   * shape here — a second check, at a second door, over a different notion of
   * "may answer" — is exactly how the two would drift: a third caller of
   * `submitPracticeAttempt` (the dev in-process authority is already one) would
   * arrive gated by neither. So the adaptive gate lives on the write itself,
   * where every caller meets it, and this method's only job is to give the
   * refusal the transport shape the other practice route already uses.
   */
  async handlePracticeAdaptive(
    body: PracticeAdaptiveAttemptCommandBody,
    principal: Principal,
  ): Promise<PracticeAttemptResult> {
    try {
      return PracticeAttemptResultSchema.parse(
        await this.mutate(body.envelope, principal, async (authority, state) => {
          const result = await authority.submitPracticeAttempt(state, body.command);
          return {
            eventType: 'practice_adaptive_attempt_submitted',
            payload: toJsonObject({ envelope: body.envelope, ...body.command }),
            result: toJsonObject(PracticeAttemptResultSchema.parse(result)),
          };
        }),
      );
    } catch (error) {
      // The refusal reason names which of the four bindings failed and stays
      // server-side; the learner-facing answer is the same one an unassigned
      // question gets from `handlePractice`, so probing this route cannot tell
      // "no such item" apart from "not served to you".
      if (error instanceof PracticeAttemptNotAuthorizedError) throw forbidden();
      throw error;
    }
  }

  private async mutate(
    envelope: CommandEnvelope,
    principal: Principal,
    apply: (
      authority: Authority,
      state: LearnerState,
    ) => MutationApplication | Promise<MutationApplication>,
  ): Promise<JsonObject> {
    return this.dependencies.repository.transaction(async (transaction) => {
      const projection = await transaction.lockLearner(principal.learnerId);
      if (projection.learnerId !== principal.learnerId) throw forbidden();
      const duplicate = await transaction.findAcceptedByIdempotency(
        principal.learnerId,
        envelope.idempotencyKey,
      );
      if (duplicate !== null) return duplicate.result;
      if (projection.sequence !== envelope.expectedStreamVersion) {
        throw streamConflict(projection.sequence);
      }
      if (envelope.contentRelease !== this.dependencies.bank.contentRelease) {
        throw new AuthorityKernelError({
          code: 'content_version_conflict',
          message: 'The content release is no longer current.',
        });
      }

      const authority = this.authority();
      const state = learnerStateFromProjection(projection);
      const application = await apply(authority, state);
      const persistedState = application.replacementState ?? state;
      const sequence = projection.sequence + 1;
      const acceptedAt = this.dependencies.clock.now();
      persistedState.nextSequence = sequence;
      const result =
        application.result ??
        toJsonObject(
          AcceptedCommandResponseSchema.parse({
            eventId: envelope.eventId,
            sequence,
            streamVersion: sequence,
            acceptedAt,
          }),
        );
      const versions = policyVersions(
        application.replacementState === undefined ? persistedState : state,
      );
      const accepted: AcceptedCommand = {
        eventId: envelope.eventId,
        learnerId: principal.learnerId,
        idempotencyKey: envelope.idempotencyKey,
        sequence,
        acceptedAt,
        eventType: application.eventType,
        contentRelease: this.dependencies.bank.contentRelease,
        policyVersions: versions,
        payload: application.payload,
        result,
      };
      const outbox: OutboxRecord = {
        outboxId: envelope.eventId,
        learnerId: principal.learnerId,
        sequence,
        topic: 'learner.command.accepted',
        payload: toJsonObject({
          eventId: envelope.eventId,
          eventType: application.eventType,
          contentRelease: this.dependencies.bank.contentRelease,
          policyVersions: versions,
        }),
        createdAt: acceptedAt,
        publishedAt: null,
        attempts: 0,
      };

      await transaction.appendAccepted(accepted);
      await transaction.saveProjection(toProjectionRecord(persistedState, sequence, acceptedAt));
      await transaction.appendOutbox(outbox);
      return result;
    });
  }
}
