import type { AssistanceLevel } from '@mcat/contracts';
import type { AssistanceReason, DecisionReason } from '@mcat/domain';
import type { PolicyManifest } from './manifest';

export const ASSISTANCE_MANIFEST: PolicyManifest = {
  policyId: 'assistance',
  version: 'provisional-v1',
  status: 'provisional_active',
  summary: 'Fade one level after two successes; escalate one level after a failure.',
};

// Most help → least help.
const LADDER: readonly AssistanceLevel[] = ['A3', 'A2', 'A1', 'A0'];

export interface AssistanceInput {
  currentLevel: AssistanceLevel;
  consecutiveSuccessesAtLevel: number;
  lastOutcomeCorrect: boolean;
  /** Successes needed at a level before fading. */
  fadeThreshold?: number;
}

export interface AssistanceDecision {
  nextLevel: AssistanceLevel;
  reason: DecisionReason<AssistanceReason>;
}

export function decideAssistance(input: AssistanceInput): AssistanceDecision {
  const threshold = input.fadeThreshold ?? 2;
  const index = LADDER.indexOf(input.currentLevel);

  if (!input.lastOutcomeCorrect && index > 0) {
    // Escalate toward more help (A0 -> A1 -> A2 -> A3).
    return { nextLevel: LADDER[index - 1]!, reason: { code: 'ESCALATE_AFTER_FAILURE' } };
  }

  if (input.lastOutcomeCorrect && input.consecutiveSuccessesAtLevel >= threshold && index < LADDER.length - 1) {
    // Fade toward less help (A3 -> A2 -> A1 -> A0).
    return { nextLevel: LADDER[index + 1]!, reason: { code: 'FADE_AFTER_SUCCESS' } };
  }

  return { nextLevel: input.currentLevel, reason: { code: 'HOLD_LEVEL' } };
}

/** A0 evidence only counts as independent when produced on a *fresh* item with no content-bearing help. */
export const producesIndependentEvidence = (
  level: AssistanceLevel,
  contentBearingHint: boolean,
): boolean => level === 'A0' && !contentBearingHint;
