import type { AssistanceLevel, LessonResponseOutcome } from '@mcat/contracts';
import type { PolicyManifest } from './manifest';

export const LESSON_RUNTIME_MANIFEST: PolicyManifest = {
  policyId: 'lesson-runtime',
  version: 'v3-foundation-1',
  status: 'provisional_active',
  summary:
    'Deterministic V3 KC routing, performance fading, paired exits, and two-cycle repair cap.',
};

export const LESSON_RUNTIME_LIMITS = {
  minimumConvergentFamilies: 2,
  maximumRepairCycles: 2,
} as const;

const SUPPORT_LADDER: readonly AssistanceLevel[] = ['A3', 'A2', 'A1', 'A0'];

export interface LessonAssistanceInput {
  currentLevel: AssistanceLevel;
  outcome: LessonResponseOutcome;
  assisted: boolean;
  consecutiveUnsupportedSuccesses: number;
  successesToFade: number;
}

export interface LessonAssistanceDecision {
  nextLevel: AssistanceLevel;
  consecutiveUnsupportedSuccesses: number;
  reason: 'fade' | 'hold_assisted' | 'increase_support' | 'hold';
}

/**
 * Only a correct unsupported response can move toward A0. Wrong, not-sure, and
 * assisted responses either hold or increase support.
 */
export function decideLessonAssistance(input: LessonAssistanceInput): LessonAssistanceDecision {
  const index = SUPPORT_LADDER.indexOf(input.currentLevel);
  if (input.outcome !== 'correct') {
    return {
      nextLevel: index > 0 ? SUPPORT_LADDER[index - 1]! : input.currentLevel,
      consecutiveUnsupportedSuccesses: 0,
      reason: index > 0 ? 'increase_support' : 'hold',
    };
  }
  if (input.assisted) {
    return {
      nextLevel: input.currentLevel,
      consecutiveUnsupportedSuccesses: 0,
      reason: 'hold_assisted',
    };
  }

  const successes = input.consecutiveUnsupportedSuccesses + 1;
  if (successes >= input.successesToFade && index < SUPPORT_LADDER.length - 1) {
    return {
      nextLevel: SUPPORT_LADDER[index + 1]!,
      consecutiveUnsupportedSuccesses: 0,
      reason: 'fade',
    };
  }
  return {
    nextLevel: input.currentLevel,
    consecutiveUnsupportedSuccesses: successes,
    reason: 'hold',
  };
}

export function distinctSignalFamilyCount(
  evidence: readonly { signalId: string; familyIds: readonly string[] }[],
  signalIds: readonly string[],
): number {
  const acceptedSignals = new Set(signalIds);
  const families = new Set<string>();
  for (const signal of evidence) {
    if (!acceptedSignals.has(signal.signalId)) continue;
    for (const familyId of signal.familyIds) families.add(familyId);
  }
  return families.size;
}
