import type { AssistanceLevel } from '@mcat/contracts';
import type { EvidenceOutcome } from './evidence';

/**
 * Deterministic scoring. Correctness is decided only against a server-only key.
 * Independence is a pure function of the assistance context — this is what keeps
 * assisted/revealed/retry work from ever counting as independent evidence.
 */
export interface ScoreInput {
  correctChoiceId: string;
  chosenChoiceId: string | null;
  assistanceLevel: AssistanceLevel;
  contentBearingHint: boolean;
  isDiagnosticRetry: boolean;
  revealed: boolean;
}

export interface ScoredAttempt {
  outcome: EvidenceOutcome;
  independent: boolean;
}

export function scoreAttempt(input: ScoreInput): ScoredAttempt {
  const outcome: EvidenceOutcome =
    input.chosenChoiceId === null
      ? 'omitted'
      : input.chosenChoiceId === input.correctChoiceId
        ? 'correct'
        : 'incorrect';

  const independent =
    input.assistanceLevel === 'A0' &&
    !input.contentBearingHint &&
    !input.isDiagnosticRetry &&
    !input.revealed;

  return { outcome, independent };
}
