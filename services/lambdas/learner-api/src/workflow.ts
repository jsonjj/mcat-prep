import { createHash } from 'node:crypto';
import { Authority, type LearnerState } from '@mcat/authority-core';
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
import {
  AcceptedCommandResponseSchema,
  AttemptCommandSchema,
  DiagnosticNextSchema,
  PracticeItemViewSchema,
  PracticeResultSchema,
  SkillSummarySchema,
  WrappedViewSchema,
  type Clock,
  type CommandEnvelope,
  type ContentId,
  type DiagnosticNext,
  type PracticeItemView,
  type SkillSummary,
  type WrappedView,
} from '@mcat/contracts';
import type {
  AcceptedCommand,
  AuthorityRepository,
  JsonObject,
  OutboxRecord,
} from '@mcat/database';

import type {
  CauseCommandBody,
  ContinueCommandBody,
  RecallCommandBody,
  RevealCommandBody,
  PracticeAttemptCommandBody,
} from './routes';
import {
  syntheticPracticeAuthorizationPolicy,
  type PracticeAuthorizationPolicy,
} from './practice-authorization';

interface MutationApplication {
  readonly eventType: string;
  readonly payload: JsonObject;
  readonly result?: JsonObject;
  readonly replacementState?: LearnerState;
}

interface WorkflowDependencies {
  readonly repository: AuthorityRepository;
  readonly clock: Clock;
  readonly bank: AuthorityKernelDependencies['bank'];
  readonly practiceAuthorization?: PracticeAuthorizationPolicy;
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

function deterministicEvidenceId(eventId: string, index: number): string {
  if (index === 0) return eventId;
  const bytes = createHash('sha256').update(`${eventId}:${index}`, 'utf8').digest().subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
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

  constructor(private readonly dependencies: WorkflowDependencies) {
    this.authorityKernel = new AuthorityKernel(dependencies);
    this.practiceAuthorization =
      dependencies.practiceAuthorization ?? syntheticPracticeAuthorizationPolicy;
  }

  handle(input: unknown, principal: Principal) {
    return this.authorityKernel.handle(input, principal);
  }

  snapshot(principal: Principal) {
    return this.authorityKernel.snapshot(principal);
  }

  async diagnosticNext(principal: Principal): Promise<DiagnosticNext> {
    const state = await this.loadState(principal);
    if (state.onboarding.diagnosticComplete) {
      return DiagnosticNextSchema.parse({ done: true, question: null, progress: 1 });
    }

    const authority = new Authority(this.dependencies.bank, this.dependencies.clock);
    const next = authority.diagnosticNext(state);
    const questionId = next.questionId;
    const question =
      questionId === undefined ? null : (authority.bank.compiled.get(questionId)?.safe ?? null);
    if (!next.done && question === null) {
      throw new AuthorityKernelError({
        code: 'unavailable',
        message: 'The diagnostic item is temporarily unavailable.',
        retryable: true,
      });
    }
    return DiagnosticNextSchema.parse({ done: next.done, question, progress: next.progress });
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
    const authority = new Authority(this.dependencies.bank, this.dependencies.clock);
    return WrappedViewSchema.parse(authority.getWrapped(state));
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

  async handleCause(command: CauseCommandBody, principal: Principal) {
    return AcceptedCommandResponseSchema.parse(
      await this.mutate(command.envelope, principal, (authority, state) => {
        const current = authority.getSession(state);
        if (current.kind !== 'question' || current.sub !== 'cause') {
          throw validationError('A cause may be selected only after an incorrect first attempt.');
        }
        const previousEventCount = state.events.length;
        authority.selectCause(state, command.cause);
        rebindRecordedEvent(state, previousEventCount, command.envelope);
        return { eventType: 'cause_selected', payload: toJsonObject(command) };
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

  async handleCarsDuel(command: ContinueCommandBody, principal: Principal) {
    return AcceptedCommandResponseSchema.parse(
      await this.mutate(command.envelope, principal, (authority, state) => {
        const previousEvidenceCount = state.evidence.length;
        authority.recordCarsDuel(state);
        bindNewEvidence(state, previousEvidenceCount, command.envelope);
        return { eventType: 'cars_duel_recorded', payload: toJsonObject(command) };
      }),
    );
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

  private async mutate(
    envelope: CommandEnvelope,
    principal: Principal,
    apply: (authority: Authority, state: LearnerState) => MutationApplication,
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

      const authority = new Authority(this.dependencies.bank, this.dependencies.clock);
      const state = learnerStateFromProjection(projection);
      const application = apply(authority, state);
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
