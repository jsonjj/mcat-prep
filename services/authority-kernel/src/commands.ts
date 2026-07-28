import type { Authority, LearnerState } from '@mcat/authority-core';
import {
  AttemptSubmittedSchema,
  LearnerCommandSchema,
  type AttemptCommand,
  type LearnerCommand,
} from '@mcat/contracts';
import type { JsonObject } from '@mcat/database';

import { validationError } from './context';
import { toJsonObject } from './views';

export interface AppliedAuthorityCommand {
  readonly eventType: 'attempt_submitted' | 'goal_updated';
  readonly payload: JsonObject;
}

export function parseAuthorityCommand(input: unknown): LearnerCommand {
  const parsed = LearnerCommandSchema.safeParse(input);
  if (!parsed.success) {
    throw validationError('The command payload is invalid.');
  }
  return parsed.data;
}

async function applyAttempt(
  authority: Authority,
  state: LearnerState,
  command: AttemptCommand,
): Promise<AppliedAuthorityCommand> {
  const current = authority.getSession(state);
  if (current.kind !== 'question' || current.question.id !== command.questionId) {
    throw validationError('The attempt does not match the authoritative current item.');
  }
  if (command.assistanceLevel !== 'A0' || command.contentBearingHintUsed) {
    throw validationError('This synthetic authority accepts only unassisted attempts.');
  }
  if (command.isDiagnosticRetry !== (current.sub === 'retry')) {
    throw validationError('The retry state does not match the authoritative session.');
  }

  const eventCount = state.events.length;
  const evidenceCount = state.evidence.length;
  await authority.submitAttempt(state, command.choiceId);
  if (state.events.length !== eventCount + 1) {
    throw validationError('The attempt is not valid in the current session state.');
  }

  const authoritativeEvent = AttemptSubmittedSchema.parse({
    type: 'attempt_submitted',
    eventId: command.envelope.eventId,
    learnerId: state.learnerId,
    idempotencyKey: command.envelope.idempotencyKey,
    occurredAt: command.envelope.occurredAt,
    contentRelease: command.envelope.contentRelease,
    policies: state.events[eventCount]?.policies ?? [],
    taskInstanceId: command.envelope.taskInstanceId,
    payload: {
      questionId: command.questionId,
      itemVersion: current.question.version,
      chosenChoiceId: command.choiceId,
      elapsedMs: command.elapsedMs,
      assistanceLevel: command.assistanceLevel,
      contentBearingHintUsed: command.contentBearingHintUsed,
      answerChanges: command.answerChanges,
      ...(command.confidence === undefined ? {} : { confidence: command.confidence }),
      isDiagnosticRetry: command.isDiagnosticRetry,
      ...(command.protectedBlockId === undefined
        ? {}
        : { protectedBlockId: command.protectedBlockId }),
    },
  });
  state.events.splice(eventCount, 1, authoritativeEvent);
  state.seenIdempotencyKeys = [
    ...state.seenIdempotencyKeys.slice(0, -1),
    command.envelope.idempotencyKey,
  ];
  for (const evidence of state.evidence.slice(evidenceCount)) {
    evidence.evidenceId = command.envelope.eventId;
  }

  return { eventType: 'attempt_submitted', payload: toJsonObject(command) };
}

export async function applyAuthorityCommand(
  authority: Authority,
  state: LearnerState,
  command: LearnerCommand,
): Promise<AppliedAuthorityCommand> {
  if ('goal' in command) {
    authority.confirmPlan(state, command.goal);
    authority.startSession(state);
    authority.continueStep(state);
    return { eventType: 'goal_updated', payload: toJsonObject(command) };
  }
  return applyAttempt(authority, state, command);
}
