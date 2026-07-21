import type { AiMessage } from './port';

/**
 * CARS Duel prompt + guardrail builders. Kept pure and tested so the safety rules
 * (no fabricated facts, no score claims, respectful tone, ends with reflection)
 * are auditable independent of any provider.
 */
export type DuelMode = 'defend' | 'rebut';
export type DuelDifficulty = 'warmup' | 'standard' | 'challenge';

/** Hard caps applied on every turn to bound cost and latency. */
export const MAX_OUTPUT_TOKENS = 320;
export const MAX_ROUNDS = 4;

export const DUEL_MODE_LABELS: Record<DuelMode, string> = {
  defend: 'Defend a thesis (the AI attacks)',
  rebut: 'Rebut the AI’s argument (closest to real CARS)',
};

export const DUEL_DIFFICULTY_LABELS: Record<DuelDifficulty, string> = {
  warmup: 'Warm-up',
  standard: 'Standard',
  challenge: 'Challenge',
};

const MODE_NOTE: Record<DuelMode, string> = {
  defend: 'The student defends a thesis; you argue the opposing side and test their reasoning.',
  rebut:
    "You state and hold a position; the student must critique and rebut it. This mirrors real CARS (evaluating someone else's argument).",
};

const DIFFICULTY_NOTE: Record<DuelDifficulty, string> = {
  warmup:
    'Press gently. Concede reasonable points readily and keep counter-arguments simple and encouraging.',
  standard:
    'Press at a realistic exam level. Concede genuinely strong points; probe weak reasoning with clear counters.',
  challenge:
    'Press hard but fairly. Surface subtle assumptions, scope errors, and unstated premises; rarely concede without strong support.',
};

export function buildCarsSystemPrompt(mode: DuelMode, difficulty: DuelDifficulty, topic: string): string {
  return [
    'You are a principled debate sparring partner inside an MCAT CARS practice tool.',
    "Your job is to sharpen the student's critical analysis and reasoning skills, not to win.",
    'Tone: sharp but respectful. Never mock, demean, insult, or use hostile language.',
    `Debate topic: ${topic}`,
    MODE_NOTE[mode],
    DIFFICULTY_NOTE[difficulty],
    'Rules:',
    '- Debate reasoning and argument structure only. Do NOT assert real-world facts, statistics, citations, or scientific results as settled; if a factual claim matters, frame it hypothetically ("suppose that...").',
    '- Never fabricate sources or data. Never claim to know the student\'s score or predict MCAT performance.',
    '- Keep each turn concise (one short paragraph). Ask at most one pointed question per turn.',
    '- Stay on the given topic and refuse unsafe or disallowed requests.',
  ].join('\n');
}

export function buildReflectionPrompt(): AiMessage {
  return {
    role: 'user',
    content:
      'End the debate now; do not argue further. Give constructive reflection in three short labeled parts: ' +
      '"Strongest point you made:", "Counter you left unanswered:", and "CARS transfer tip:". ' +
      'Be encouraging and specific. Do not declare a winner or loser, and do not mention scores.',
  };
}
