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
 *  - {@link sanitizeRewrite} is the runtime guardrail. It drops the whole answer
 *    back to the deterministic re-statement whenever the model output is NOT
 *    grounded in the source, on three conservative signals:
 *      1. {@link findUngroundedNumbers} — any numeric expression not in the source
 *         (a hallucinated quantity can never reach the learner);
 *      2. {@link findUngroundedNamedEntities} — INVENTED SPECIFICS: acronyms and
 *         multi-word proper-noun / named-entity phrases (incl. ones in quotes)
 *         that name a person / place / law / term the source never mentioned;
 *      3. a light, steps-only vocabulary floor ({@link groundingOverlap}) that
 *         catches a "step by step" answer that has drifted off the source.
 *    All three are deliberately tuned to fire only on CLEAR fabrication, never on
 *    ordinary synonyms, rephrasing, or analogies — the whole point of the feature
 *    is to re-word, so a valid paraphrase must pass untouched.
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
  /**
   * The learner-safe "Step by step" gate. Carried so the route can enforce the gate
   * SERVER-SIDE (not just via the client hiding the button): a `steps` rewrite is
   * only produced where a worked walk pays off. Null when the client sent none.
   */
  readonly gate: StepByStepGate | null;
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

/**
 * A tiny, dependency-free string hash (FNV-1a, 32-bit) used ONLY to
 * disambiguate cache keys — it is not security-sensitive and deliberately uses
 * no `node:crypto`, so `rewriteCacheKey` stays safe to call from the browser
 * bundle. Returned as fixed-width lowercase hex.
 */
function shortSourceHash(text: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * Cache key per `(question_id, form, source-surface)`. The source surface is
 * folded in as a short hash of {@link groundedText} so the SAME question and
 * form re-expressed from DIFFERENT vetted material cache separately: Practice /
 * Study pass the correct-answer rationale, while Mistakes passes the distractor
 * refutation. Keying on `(question_id, form)` alone let whichever surface ran
 * first serve its re-expression to the other — a Mistakes card could show a
 * re-wording of the correct-answer rationale instead of the refutation.
 */
export function rewriteCacheKey(
  questionId: string,
  mode: RewriteMode,
  source: GroundedRationale,
): string {
  return `${questionId}::${mode}::${shortSourceHash(groundedText(source))}`;
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

/**
 * High-frequency English words that may legitimately appear Capitalized at a
 * sentence start or inside a stock discourse phrase ("In Summary", "On The Other
 * Hand", "Step One"). They are treated as NON-significant so those phrases are
 * never mistaken for a named entity. This is intentionally a stop-list of common
 * words, NOT a dictionary: any word NOT here (Chatelier, Krebs, Newton, ATP, …)
 * stays "significant" and, if absent from the source, marks an invented specific.
 * Erring toward a larger stop-list keeps the guard conservative (it misses more
 * rather than over-rejecting a valid paraphrase).
 */
const COMMON_WORDS = new Set<string>([
  // determiners / pronouns
  'a','an','the','this','that','these','those','it','its','we','our','you','your','they','their',
  'them','he','she','his','her','him','me','my','us','who','whom','whose','what','which','one','ones',
  'some','any','all','both','each','every','few','many','more','most','less','least','several','such',
  'same','other','another','no','none','nor',
  // auxiliaries / very common verbs
  'is','are','was','were','be','been','being','am','has','have','had','do','does','did','doing','done',
  'will','would','shall','should','can','could','may','might','must','not','need','needs','let','lets','get',
  'gets','got','make','makes','made','use','uses','used','put','puts','see','sees','seen','look','looks',
  'take','takes','taken','give','gives','given','keep','keeps','kept','come','comes','came','go','goes',
  'went','gone','know','knows','think','thinks','thought','mean','means','meant','show','shows','shown',
  'find','finds','found','say','says','said','tell','tells','told','begin','begins','start','starts',
  'remember','imagine','consider','suppose','recall','notice','note','notes','picture',
  // conjunctions / prepositions
  'and','or','but','so','yet','for','if','then','than','as','at','by','in','on','of','to','up','off',
  'out','over','under','into','onto','from','with','within','without','about','above','below','between',
  'among','through','during','before','after','since','until','while','because','though','although',
  'unless','whether','upon','per',
  // discourse adverbs / connectives
  'now','here','there','where','when','why','how','thus','hence','however','therefore','moreover','also',
  'instead','overall','similarly','likewise','meanwhile','furthermore','otherwise','additionally',
  'essentially','basically','ultimately','specifically','importantly','notably','interestingly','finally',
  'again','still','just','only','even','too','very','much','well','back','once','always','never','often',
  'sometimes','usually','really','simply','simple','rather','quite','almost','nearly','perhaps','maybe',
  'indeed','likely','away','line','bottom',
  // common nouns in stock phrases
  'example','summary','fact','instance','case','contrast','addition','conclusion','short','general',
  'particular','practice','essence','turn','reality','effect','detail','details','way','ways','world',
  'time','times','point','points','idea','ideas','step','steps','part','parts','side','sides','thing',
  'things','result','results','hand','end','word','words','order','sense','sort','kind','type','terms',
  'reason','reasons','question','answer','choice','option','rule','rules',
  // number / ordinal words
  'one','two','three','four','five','six','seven','eight','nine','ten','first','second','third','fourth',
  'fifth','next','last','final',
  // common adjectives
  'great','good','bad','big','small','high','low','best','worst','better','worse','different','important',
  'key','main','true','false','right','wrong','correct','incorrect','real','whole','full','half','new',
  'old','long','easy','hard','clear','common','similar','opposite',
]);

/** Escape a token for safe embedding in a `RegExp`. */
function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Whether `token` appears in the source as its own word (case-insensitive). */
function sourceHasToken(sourceText: string, token: string): boolean {
  return new RegExp(`\\b${escapeRegExp(token)}\\b`, 'i').test(sourceText);
}

// An ACRONYM: 2+ chars, all uppercase letters/digits, leading letter (ATP, DNA,
// NADH, CO2). Roman numerals (II, III, IV) and common words shouted in caps
// ("NOT", "ONLY") are excluded below so neither is mistaken for a named token.
const ACRONYM_PATTERN = /\b[A-Z][A-Z0-9]+\b/g;
const ROMAN_NUMERAL_PATTERN = /^[IVXLCDM]+$/;

function acronymsIn(text: string): string[] {
  return (text.match(ACRONYM_PATTERN) ?? []).filter(
    (token) => !ROMAN_NUMERAL_PATTERN.test(token) && !COMMON_WORDS.has(token.toLowerCase()),
  );
}

// A capitalized MULTI-WORD run — the shape of a named entity ("Le Chatelier",
// "Krebs Cycle", "Newton's Law", "New York"). Requires 2+ capitalized words
// (so a lone sentence-initial capital is never enough); allows an internal
// possessive ('s) or hyphen so "Boyle's Law" / "Le-Chatelier" still match.
const CAP_RUN_PATTERN = /\b[A-Z][a-z]+(?:['’]s)?(?:[\s-]+[A-Z][a-z]+(?:['’]s)?)+\b/g;

/** The "significant" (length ≥ 3, non-common) words inside a capitalized run. */
function significantWords(phrase: string): string[] {
  return (phrase.toLowerCase().match(/[a-z]+/g) ?? []).filter(
    (word) => word.length >= 3 && !COMMON_WORDS.has(word),
  );
}

/**
 * INVENTED SPECIFICS the model introduced that are NOT in the source — the
 * qualitative counterpart to {@link findUngroundedNumbers}. Two conservative
 * token classes are checked, both case-insensitively against the source so any
 * entity/acronym the source itself used always passes:
 *
 *  - Acronyms (ATP, DNA, NADH) absent from the source.
 *  - Capitalized multi-word proper-noun / named-entity phrases (Le Chatelier,
 *    Krebs Cycle, Newton's Law) that contain a "significant" word the source
 *    never mentioned. Single capitalized words are ignored (indistinguishable
 *    from an ordinary sentence-initial capital), and phrases made only of common
 *    words ("In Summary", "Step One") are ignored.
 *
 * Quotes are deliberately NOT stripped first, so a fabricated term dressed up in
 * quotes ("Le Chatelier's principle") is caught by the same scan, while a plain
 * lowercase analogy in quotes ("a seesaw") is left alone. A non-empty result
 * means the candidate is planting a new, checkable claim and is not grounded.
 */
export function findUngroundedNamedEntities(
  candidate: string,
  source: GroundedRationale | string,
): string[] {
  const sourceText = typeof source === 'string' ? source : groundedText(source);
  const ungroundedAcronyms = acronymsIn(candidate).filter(
    (token) => !sourceHasToken(sourceText, token),
  );
  const ungroundedPhrases = (candidate.match(CAP_RUN_PATTERN) ?? []).filter((phrase) =>
    significantWords(phrase).some((word) => !sourceHasToken(sourceText, word)),
  );
  return [...ungroundedAcronyms, ...ungroundedPhrases];
}

// Secondary "did the rewrite stay on the source?" guard. Meaningful tokens are
// lowercase content words (length ≥ 4, not common), so function words and short
// tokens don't dilute the measure.
const MEANINGFUL_TOKEN_PATTERN = /[a-z]+/g;

function meaningfulTokens(text: string): Set<string> {
  const tokens = new Set<string>();
  for (const word of text.toLowerCase().match(MEANINGFUL_TOKEN_PATTERN) ?? []) {
    if (word.length >= 4 && !COMMON_WORDS.has(word)) tokens.add(word);
  }
  return tokens;
}

/**
 * Fraction of the candidate's meaningful tokens that also occur in the source —
 * i.e. how much of the rewrite is built from the source's own vocabulary.
 * Returns 1 for an empty candidate (nothing to judge; the other guards decide).
 */
export function groundingOverlap(candidate: string, source: GroundedRationale | string): number {
  const sourceTokens = meaningfulTokens(typeof source === 'string' ? source : groundedText(source));
  const candidateTokens = meaningfulTokens(candidate);
  if (candidateTokens.size === 0) return 1;
  let shared = 0;
  for (const token of candidateTokens) if (sourceTokens.has(token)) shared += 1;
  return shared / candidateTokens.size;
}

/**
 * The steps-only vocabulary floor. "Step by step" must break down the reasoning
 * "straight from the source", so a low share of source vocabulary means it has
 * drifted off (or refused). The floor is LOW and gated on both texts having
 * enough meaningful tokens, so faithful (even synonym-leaning) steps pass; it is
 * NOT applied to "example" mode, whose analogies legitimately reinvent wording.
 */
export const STEPS_MIN_GROUNDING_OVERLAP = 0.2;
const MIN_SOURCE_TOKENS_FOR_FLOOR = 8;
const MIN_CANDIDATE_TOKENS_FOR_FLOOR = 6;

function isBelowGroundingFloor(candidate: string, source: GroundedRationale): boolean {
  const sourceTokens = meaningfulTokens(groundedText(source));
  const candidateTokens = meaningfulTokens(candidate);
  if (
    sourceTokens.size < MIN_SOURCE_TOKENS_FOR_FLOOR ||
    candidateTokens.size < MIN_CANDIDATE_TOKENS_FOR_FLOOR
  ) {
    return false;
  }
  return groundingOverlap(candidate, source) < STEPS_MIN_GROUNDING_OVERLAP;
}

export interface SanitizedRewrite {
  readonly text: string;
  /** True when the deterministic fallback was substituted for the model output. */
  readonly fallback: boolean;
}

/**
 * The runtime grounding gate. The (trimmed) model text is returned as-is only
 * when it is grounded in the source; otherwise it is replaced wholesale by
 * {@link fallbackRewrite}. It falls back when the candidate is empty, introduces
 * a number not in the source ({@link findUngroundedNumbers}), introduces an
 * invented named entity / acronym ({@link findUngroundedNamedEntities}), or — in
 * "steps" mode only — has drifted below the source-vocabulary floor
 * ({@link isBelowGroundingFloor}). Every check is tuned to pass ordinary
 * synonyms, rephrasing, and analogies and to fire only on clear fabrication.
 */
export function sanitizeRewrite(
  candidate: string,
  mode: RewriteMode,
  source: GroundedRationale,
): SanitizedRewrite {
  const trimmed = candidate.trim();
  const ungrounded =
    trimmed.length === 0 ||
    findUngroundedNumbers(trimmed, source).length > 0 ||
    findUngroundedNamedEntities(trimmed, source).length > 0 ||
    (mode === 'steps' && isBelowGroundingFloor(trimmed, source));
  if (ungrounded) {
    return { text: fallbackRewrite(mode, source), fallback: true };
  }
  return { text: trimmed, fallback: false };
}

function isRewriteMode(value: unknown): value is RewriteMode {
  return value === 'example' || value === 'steps';
}

/**
 * Upper bound on the client-supplied `source` (rationale + all refutations,
 * combined). The source is already-vetted post-reveal material the client
 * legitimately holds, not free-form input, so a few thousand characters is
 * ample. Capping it here bounds the prompt the server will build — an oversize
 * body is rejected outright rather than forwarded to the paid model — which
 * closes a cheap way to inflate provider spend on the authenticated route.
 */
export const MAX_REWRITE_SOURCE_CHARS = 8_000;

function totalSourceChars(rationale: string, choiceRationales: Record<string, string> | null): number {
  let total = rationale.length;
  for (const text of Object.values(choiceRationales ?? {})) total += text.length;
  return total;
}

/**
 * Parse an untrusted wire body into a {@link RewriteRequest}, or null. Used by
 * the production route to validate what the client posts before it builds a
 * prompt. Only the shape and size are checked here; grounding is enforced by the
 * prompt and {@link sanitizeRewrite}. A `source` larger than
 * {@link MAX_REWRITE_SOURCE_CHARS} is rejected.
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
  if (totalSourceChars(rationale, choiceRationales) > MAX_REWRITE_SOURCE_CHARS) return null;
  const gate = parseGate(body.gate);
  if (gate === INVALID_GATE) return null;
  return { questionId, mode, source: { rationale, choiceRationales }, gate };
}

/** Sentinel distinguishing "malformed gate" (reject) from "no gate" (null, allowed). */
const INVALID_GATE = Symbol('invalid-gate');

/** Parse an optional, learner-safe gate. Absent → null; wrong shape → INVALID_GATE. */
function parseGate(raw: unknown): StepByStepGate | null | typeof INVALID_GATE {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== 'object' || Array.isArray(raw)) return INVALID_GATE;
  const g = raw as Record<string, unknown>;
  const skill = g.skill === undefined || g.skill === null ? null : g.skill;
  const section = g.section === undefined || g.section === null ? null : g.section;
  const dok = g.dok === undefined || g.dok === null ? null : g.dok;
  if (skill !== null && typeof skill !== 'string') return INVALID_GATE;
  if (section !== null && typeof section !== 'string') return INVALID_GATE;
  if (dok !== null && typeof dok !== 'number') return INVALID_GATE;
  return { skill, section, dok };
}
