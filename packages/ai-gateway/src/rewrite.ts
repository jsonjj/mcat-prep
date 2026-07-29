import type { AiMessage } from './port';

/**
 * "Explain it another way" — the grounded, post-answer re-expression feature
 * (master-build-spec WS4 / §5).
 *
 * Everything here is PURE and provider-agnostic so the grounding guarantee is
 * auditable independent of any model:
 *
 *  - The prompt (see {@link buildRewriteMessages}) hands the model ONLY the
 *    already-vetted explanation the learner has already been shown, and forbids
 *    it from inventing any new fact, number, or step.
 *  - {@link fallbackRewrite} re-states that same source deterministically, with
 *    no model in the loop, so the feature still works with no key / on a 503.
 *  - {@link findUngroundedNumbers} / {@link sanitizeRewrite} are the runtime
 *    guardrail: any numeric expression the model introduces that is NOT in the
 *    source drops the whole answer back to the deterministic re-statement, so a
 *    hallucinated quantity can never reach the learner.
 *
 * It is never given an answer key it did not already have: the "source" is the
 * post-reveal rationale/`choiceRationales` the client legitimately holds after
 * the learner has answered (`practice.ts` `PracticeAttemptResult`,
 * `learner-views.ts` `PostRevealResponse`).
 */

/** The two "forms" of re-expression the learner can ask for. */
export type RewriteMode = 'example' | 'steps';

export const REWRITE_MODES: readonly RewriteMode[] = ['example', 'steps'];

export const REWRITE_MODE_LABELS: Record<RewriteMode, string> = {
  example: 'Another way to see it',
  steps: 'Step by step',
};

/**
 * The vetted material the re-expression is allowed to draw on — and nothing
 * else. `rationale` is the correct-answer explanation; `choiceRationales` is the
 * per-option refutation(s) already disclosed. Both are already on the client
 * post-reveal; passing them here does not widen what the learner can see.
 */
export interface GroundedRationale {
  readonly rationale: string;
  readonly choiceRationales?: Readonly<Record<string, string>> | null;
}

/** A request to re-express one question's explanation in one form. */
export interface RewriteRequest {
  /** Cache/audit key only; never fed to the model as a fact. */
  readonly questionId: string;
  readonly mode: RewriteMode;
  readonly source: GroundedRationale;
}

/**
 * The learner-safe fields the "Step by step" action gates on
 * (master-build-spec §11.4). All three are available without exposing anything
 * protected: `skill`/`dok` ride on `PracticeQueueItem`; `section` is on every
 * item. Study surfaces only `section`, so there `skill`/`dok` are null and the
 * gate falls back to section (the amendment's "gate off section").
 */
export interface StepByStepGate {
  readonly skill: string | null;
  readonly section: string | null;
  readonly dok: number | null;
}

/**
 * Whether the "Step by step" action is offered: QUANTIFY items, the Chem/Phys
 * (C/P) section, or anything at DOK ≥ 2 — the places a worked, segmented walk
 * pays off. "Example / another way" is always offered and has no gate.
 */
export function canStepByStep(gate: StepByStepGate): boolean {
  if (gate.skill !== null && gate.skill.toUpperCase() === 'QUANTIFY') return true;
  if (gate.section !== null && gate.section.toLowerCase() === 'cp') return true;
  return gate.dok !== null && gate.dok >= 2;
}

/** Cache key per `(question_id, form)` — the two forms are cached separately. */
export function rewriteCacheKey(questionId: string, mode: RewriteMode): string {
  return `${questionId}::${mode}`;
}

/** Everything the model (or the number-grounding check) is allowed to treat as source. */
export function groundedText(source: GroundedRationale): string {
  const parts = [source.rationale, ...Object.values(source.choiceRationales ?? {})];
  return parts.filter((part) => part.trim().length > 0).join('\n');
}

const MODE_INSTRUCTION: Record<RewriteMode, string> = {
  example:
    'Re-express it as a short, concrete analogy or plain-language restatement that uses only the ideas already in the source.',
  steps:
    'Break the reasoning already in the source into a short numbered list of sequential steps (1., 2., 3., …). Every step must come straight from the source.',
};

/**
 * The system prompt. This is where "GROUNDED ONLY" is enforced at authoring
 * time: the model may re-word the source but may not add to it, and must not
 * re-state the answer key (the learner already saw it).
 */
export function buildRewriteSystemPrompt(mode: RewriteMode): string {
  return [
    'You are a tutor inside an MCAT prep tool. The learner has ALREADY answered this question and ALREADY seen the official explanation.',
    'Your only job is to RE-EXPRESS that same explanation in a different way so it clicks — not to teach anything new.',
    'STRICT GROUNDING RULES:',
    '- Use ONLY the information in the SOURCE EXPLANATION provided. Do NOT add facts, numbers, values, formulas, examples, definitions, or outside knowledge.',
    '- Do NOT introduce any number, quantity, unit, or measurement that is not already written in the source.',
    '- Do NOT re-state, reveal, or change which answer choice is correct — the learner has already seen it.',
    '- If the source does not say enough to make a point, say less rather than inventing.',
    '- Be concise, plain, and encouraging. No preamble and no sign-off — output only the re-expression itself.',
    MODE_INSTRUCTION[mode],
  ].join('\n');
}

/** The user turn: the delimited source block plus the re-expression ask. */
export function buildRewriteMessages(mode: RewriteMode, source: GroundedRationale): AiMessage[] {
  const refutations = Object.entries(source.choiceRationales ?? {})
    .filter(([, text]) => text.trim().length > 0)
    .map(([choice, text]) => `- Why ${choice} is wrong: ${text}`);
  const sourceBlock = [
    source.rationale.trim(),
    ...(refutations.length > 0 ? ['', 'Why other options miss:', ...refutations] : []),
  ].join('\n');
  const ask =
    mode === 'steps'
      ? 'Re-express the explanation above as numbered steps. Add nothing that is not stated above.'
      : 'Re-express the explanation above in a different, simpler way. Add nothing that is not stated above.';
  return [
    { role: 'system', content: buildRewriteSystemPrompt(mode) },
    {
      role: 'user',
      content: `SOURCE EXPLANATION (the only material you may use):\n"""\n${sourceBlock}\n"""\n\n${ask}`,
    },
  ];
}

const SENTENCE_SPLIT = /(?<=[.!?])\s+/;

/**
 * The deterministic fallback: a templated re-statement of the SAME source, with
 * no model involved. Used on a 503 / missing key, and as the safety net when the
 * model's answer fails the grounding check. Grounded by construction — it only
 * ever emits text taken from the source (plus structural list numbering).
 */
export function fallbackRewrite(mode: RewriteMode, source: GroundedRationale): string {
  const rationale = source.rationale.trim();
  if (mode === 'steps') {
    const sentences = rationale
      .split(SENTENCE_SPLIT)
      .map((sentence) => sentence.trim())
      .filter((sentence) => sentence.length > 0);
    const steps = (sentences.length > 0 ? sentences : [rationale]).map(
      (sentence, index) => `${index + 1}. ${sentence}`,
    );
    return `Here is the same explanation broken into steps:\n${steps.join('\n')}`;
  }
  return `Here is the same explanation, put another way:\n${rationale}`;
}

const NUMBER_PATTERN = /-?\d+(?:\.\d+)?/g;
/** Strip structural list numbering ("1.", "2)") and "step 3" so they are not read as facts. */
const LIST_MARKER_PATTERN = /^\s*\d+[.)]\s+/gm;
const STEP_WORD_PATTERN = /\bstep\s+\d+\b/gi;

function numbersIn(text: string): string[] {
  return text.match(NUMBER_PATTERN) ?? [];
}

/**
 * Numeric expressions present in the candidate re-expression that are NOT in the
 * source — i.e. facts the model would be introducing. Structural list numbering
 * is stripped first so a legitimate "1., 2., 3." walk is not mistaken for new
 * quantities. A non-empty result means the candidate is not grounded.
 */
export function findUngroundedNumbers(candidate: string, source: GroundedRationale | string): string[] {
  const sourceNumbers = new Set(
    numbersIn(typeof source === 'string' ? source : groundedText(source)),
  );
  const structural = candidate.replace(LIST_MARKER_PATTERN, '').replace(STEP_WORD_PATTERN, 'step');
  return numbersIn(structural).filter((value) => !sourceNumbers.has(value));
}

export interface SanitizedRewrite {
  readonly text: string;
  /** True when the deterministic fallback was substituted for the model output. */
  readonly fallback: boolean;
}

/**
 * The runtime grounding gate. An empty answer, or one that introduces any
 * number not in the source, is replaced wholesale by {@link fallbackRewrite}.
 * Otherwise the (trimmed) model text is returned as-is.
 */
export function sanitizeRewrite(
  candidate: string,
  mode: RewriteMode,
  source: GroundedRationale,
): SanitizedRewrite {
  const trimmed = candidate.trim();
  if (trimmed.length === 0 || findUngroundedNumbers(trimmed, source).length > 0) {
    return { text: fallbackRewrite(mode, source), fallback: true };
  }
  return { text: trimmed, fallback: false };
}

function isRewriteMode(value: unknown): value is RewriteMode {
  return value === 'example' || value === 'steps';
}

/**
 * Parse an untrusted wire body into a {@link RewriteRequest}, or null. Used by
 * the production route to validate what the client posts before it builds a
 * prompt. Only the shape is checked here; grounding is enforced by the prompt
 * and {@link sanitizeRewrite}.
 */
export function parseRewriteRequest(raw: unknown): RewriteRequest | null {
  if (raw === null || typeof raw !== 'object') return null;
  const body = raw as Record<string, unknown>;
  const { questionId, mode, source } = body;
  if (typeof questionId !== 'string' || questionId.trim().length === 0) return null;
  if (!isRewriteMode(mode)) return null;
  if (source === null || typeof source !== 'object') return null;
  const sourceRecord = source as Record<string, unknown>;
  const rationale = sourceRecord.rationale;
  if (typeof rationale !== 'string' || rationale.trim().length === 0) return null;
  let choiceRationales: Record<string, string> | null = null;
  const rawChoiceRationales = sourceRecord.choiceRationales;
  if (rawChoiceRationales !== undefined && rawChoiceRationales !== null) {
    if (typeof rawChoiceRationales !== 'object' || Array.isArray(rawChoiceRationales)) return null;
    choiceRationales = {};
    for (const [choice, text] of Object.entries(rawChoiceRationales as Record<string, unknown>)) {
      if (typeof text !== 'string') return null;
      choiceRationales[choice] = text;
    }
  }
  return { questionId, mode, source: { rationale, choiceRationales } };
}
