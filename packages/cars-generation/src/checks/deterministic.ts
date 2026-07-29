/**
 * Deterministic item-writing flaw audit.
 *
 * This layer is code rather than an LLM judge for a measured reason: on exactly this
 * task, rule-based detection caught 91% of human-identified flaws against GPT-4's 79%,
 * with less than half the Hamming loss, and GPT-4 over-flagged. Mechanical faults are
 * cheap to detect precisely and expensive to detect probabilistically, so everything
 * that can be decided by counting is decided here, before any model call is spent.
 *
 * Thresholds come from `calibration.ts` and are calibrated against the golden corpus.
 * Where a check would be stricter than real CARS items, it is deliberately loosened —
 * an audit that rejects authentic items is measuring the wrong thing.
 */

import {
  ABSOLUTE_TERMS,
  BATCH_GATES,
  OPTION_LENGTH,
  PASSAGE_SHAPE,
  STEM_SHAPE,
  withinBand,
  type Band,
} from '../calibration';
import { archetypeById, archetypeDiversity } from '../archetypes';
import { countFalsifiable, MAX_FALSIFIABLE_DISTRACTORS, mechanismsAreDistinct } from '../distractors';
import { deriveSkill } from '../blueprint';
import {
  passageWordCount,
  sentencesIn,
  wordsIn,
  type GeneratedItem,
  type GeneratedPassageSet,
} from '../schema';
import { type CheckResult } from './report';

/**
 * Absolute and extreme qualifiers. Counted, not banned: the corpus shows authentic
 * options use them at a mean of 0.13 per option, and some authentic items are built
 * entirely from an absolute-term matrix.
 */
const ABSOLUTE_PATTERN =
  /\b(all|none|never|always|only|every|must|cannot|entirely|completely|totally|invariably|exclusively|solely|no)\b/gi;

const HEDGE_PATTERN =
  /\b(may|might|could|would|often|sometimes|generally|typically|tends?|tended|likely|perhaps|possibly|somewhat|partly|largely|usually|apparently|seems?|seemed|suggests?|suggested|argues?|arguably|relatively)\b/gi;

/** Structural options that are always flaws in a four-option best-answer format. */
const FORBIDDEN_OPTION_PATTERN = /^\s*(all|none|both|neither)\s+of\s+(the\s+)?(above|these)/i;

const STOPWORDS = new Set([
  'a','an','and','are','as','at','be','been','being','but','by','for','from','had','has','have',
  'he','her','his','in','is','it','its','of','on','or','she','that','the','their','them','there',
  'these','they','this','to','was','were','which','who','will','with','would','not','no','more',
  'most','than','then','when','where','what','how','why','can','could','may','might','must','do',
  'does','did','it’s','also','such','some','any','other','into','about','author','passage','most',
]);

function contentWords(text: string): Set<string> {
  const words = text.toLowerCase().match(/[a-z][a-z'’-]*/g) ?? [];
  return new Set(words.filter((w) => w.length > 2 && !STOPWORDS.has(w)));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let shared = 0;
  for (const x of a) if (b.has(x)) shared += 1;
  const union = a.size + b.size - shared;
  return union === 0 ? 0 : shared / union;
}

function countMatches(text: string, pattern: RegExp): number {
  return text.match(pattern)?.length ?? 0;
}

function mean(values: readonly number[]): number {
  return values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;
}

function ok(
  id: string,
  severity: CheckResult['severity'],
  passed: boolean,
  detail: string,
  extra: { score?: number; threshold?: number; itemId?: string } = {},
): CheckResult {
  return {
    id,
    severity,
    passed,
    detail,
    ...(extra.score === undefined ? {} : { score: extra.score }),
    ...(extra.threshold === undefined ? {} : { threshold: extra.threshold }),
    ...(extra.itemId === undefined ? {} : { itemId: extra.itemId }),
  };
}

function bandCheck(
  id: string,
  severity: CheckResult['severity'],
  value: number,
  band: Band,
  label: string,
  itemId?: string,
): CheckResult {
  return ok(id, severity, withinBand(value, band), `${label}: ${round(value)} (band ${band.min}-${band.max})`, {
    score: value,
    ...(itemId === undefined ? {} : { itemId }),
  });
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/** Per-item mechanical audit. */
export function auditItem(item: GeneratedItem, passageText: string): CheckResult[] {
  const results: CheckResult[] = [];
  const id = item.id;
  const optionWords = item.choices.map((c) => wordsIn(c.text));
  const keyIndex = item.choices.findIndex((c) => c.label === item.correctChoice);
  const key = item.choices[keyIndex];

  results.push(
    ok('option-count', 'reject', item.choices.length === 4, `${item.choices.length} options`, {
      score: item.choices.length,
      threshold: 4,
      itemId: id,
    }),
  );

  results.push(
    ok('key-present', 'reject', key !== undefined, key ? 'key resolves to an option' : 'key label matches no option', {
      itemId: id,
    }),
  );
  if (!key) return results;

  // --- Option length geometry ---------------------------------------------------
  const maxWords = Math.max(...optionWords);
  const minWords = Math.min(...optionWords);
  const meanWords = mean(optionWords);
  const spread = minWords > 0 ? maxWords / minWords : Number.POSITIVE_INFINITY;

  results.push(
    ok('option-spread', 'reject', spread <= OPTION_LENGTH.spreadRatioMax,
      `longest/shortest option = ${round(spread)}`,
      { score: spread, threshold: OPTION_LENGTH.spreadRatioMax, itemId: id }),
  );
  results.push(
    ok('option-max-over-mean', 'reject', maxWords / meanWords <= OPTION_LENGTH.maxOverMeanMax,
      `longest/mean option = ${round(maxWords / meanWords)}`,
      { score: maxWords / meanWords, threshold: OPTION_LENGTH.maxOverMeanMax, itemId: id }),
  );
  results.push(
    ok('option-min-words', 'reject', minWords >= OPTION_LENGTH.minWords,
      `shortest option = ${minWords} words`,
      { score: minWords, threshold: OPTION_LENGTH.minWords, itemId: id }),
  );
  results.push(bandCheck('option-mean-words', 'reject', meanWords, OPTION_LENGTH.meanWords, 'mean option length', id));

  /**
   * The longest-option cue. This is the one length check that targets an exploitable
   * pattern rather than a style preference: always picking the longest option beats
   * chance by several points on comparable four-option corpora, so what matters is not
   * whether options differ in length but whether the *key* is systematically longest.
   */
  const distractorWords = optionWords.filter((_, i) => i !== keyIndex);
  const keyRatio = mean(distractorWords) > 0 ? wordsIn(key.text) / mean(distractorWords) : 1;
  results.push(
    ok('key-length-cue', 'reject', keyRatio <= OPTION_LENGTH.keyOverDistractorMeanMax,
      `key is ${round(keyRatio)}x the mean distractor length`,
      { score: keyRatio, threshold: OPTION_LENGTH.keyOverDistractorMeanMax, itemId: id }),
  );

  // --- Structural flaws --------------------------------------------------------
  const forbidden = item.choices.filter((c) => FORBIDDEN_OPTION_PATTERN.test(c.text));
  results.push(
    ok('no-complex-options', 'reject', forbidden.length === 0,
      forbidden.length === 0 ? 'no all/none-of-the-above options' : `complex options: ${forbidden.map((c) => c.label).join(', ')}`,
      { itemId: id }),
  );

  const texts = item.choices.map((c) => c.text.trim().toLowerCase());
  results.push(
    ok('options-distinct', 'reject', new Set(texts).size === texts.length, 'options are textually distinct', {
      itemId: id,
    }),
  );

  /**
   * Convergence cluing: when options overlap heavily, the one sharing most content with
   * the others reads as correct regardless of the passage. Flagged for revision rather
   * than rejected, because near-paraphrase pairs are sometimes a deliberate and
   * legitimate construction in this format.
   */
  const wordSets = item.choices.map((c) => contentWords(c.text));
  let maxPairOverlap = 0;
  for (let i = 0; i < wordSets.length; i += 1) {
    for (let j = i + 1; j < wordSets.length; j += 1) {
      maxPairOverlap = Math.max(maxPairOverlap, jaccard(wordSets[i] as Set<string>, wordSets[j] as Set<string>));
    }
  }
  results.push(
    ok('option-convergence', 'review', maxPairOverlap <= 0.7,
      `highest option-pair content overlap = ${round(maxPairOverlap)}`,
      { score: maxPairOverlap, threshold: 0.7, itemId: id }),
  );

  // --- Absolute-term audit -----------------------------------------------------
  const absolutesPerOption = mean(item.choices.map((c) => countMatches(c.text, ABSOLUTE_PATTERN)));
  results.push(
    ok('absolute-terms', 'review', absolutesPerOption <= ABSOLUTE_TERMS.perOptionMax,
      `${round(absolutesPerOption)} absolute terms per option`,
      { score: absolutesPerOption, threshold: ABSOLUTE_TERMS.perOptionMax, itemId: id }),
  );

  if (ABSOLUTE_TERMS.flagKeyOnlyAbsolutes) {
    const keyAbsolutes = countMatches(key.text, ABSOLUTE_PATTERN);
    const distractorAbsolutes = item.choices
      .filter((_, i) => i !== keyIndex)
      .reduce((total, c) => total + countMatches(c.text, ABSOLUTE_PATTERN), 0);
    // The reverse pattern — hedged key, absolute distractors — is the intended design,
    // so only absolutes concentrated in the key are a cue.
    results.push(
      ok('key-only-absolutes', 'review', !(keyAbsolutes > 0 && distractorAbsolutes === 0),
        `key contains ${keyAbsolutes} absolute term(s), distractors ${distractorAbsolutes}`,
        { itemId: id }),
    );
  }

  // --- Stem shape --------------------------------------------------------------
  results.push(bandCheck('stem-words', 'reject', wordsIn(item.stem), STEM_SHAPE.words, 'stem length', id));

  /**
   * Lexical-cue leakage. Items whose key shares conspicuously more vocabulary with the
   * stem than the distractors do are solvable by keyword matching; on a comparable
   * corpus such items formed an easy subset where baselines scored 76.7% against 30.0%
   * on the remainder.
   */
  const stemWords = contentWords(item.stem);
  const overlaps = item.choices.map((c) => jaccard(stemWords, contentWords(c.text)));
  const keyOverlap = overlaps[keyIndex] ?? 0;
  const distractorOverlap = mean(overlaps.filter((_, i) => i !== keyIndex));
  const leakage = keyOverlap - distractorOverlap;
  results.push(
    ok('stem-key-lexical-leak', 'review', leakage <= 0.2,
      `key-stem overlap exceeds mean distractor overlap by ${round(leakage)}`,
      { score: leakage, threshold: 0.2, itemId: id }),
  );

  // --- Distractor design -------------------------------------------------------
  const families = item.rationales
    .filter((r) => r.label !== item.correctChoice)
    .map((r) => r.family)
    .filter((f): f is string => f !== undefined);

  results.push(
    ok('distractor-families-tagged', 'reject', families.length === 3,
      `${families.length}/3 distractors carry a family tag`,
      { itemId: id }),
  );

  if (families.length === 3) {
    results.push(
      ok('distractor-mechanisms-distinct', 'review', mechanismsAreDistinct(families),
        `distractor mechanisms: ${families.join(', ')}`,
        { itemId: id }),
    );
    /**
     * An option set whose distractors are all explicitly falsifiable from the passage
     * can be solved by elimination alone, which shifts the item toward general
     * test-wiseness and away from reading comprehension. This is a construct-validity
     * check, not a difficulty check.
     */
    const falsifiable = countFalsifiable(families);
    results.push(
      ok('falsifiable-distractor-cap', 'review', falsifiable <= MAX_FALSIFIABLE_DISTRACTORS,
        `${falsifiable}/3 distractors are explicitly falsifiable from the passage`,
        { score: falsifiable, threshold: MAX_FALSIFIABLE_DISTRACTORS, itemId: id }),
    );
  }

  // --- Rationales and evidence -------------------------------------------------
  const labelled = new Set(item.rationales.map((r) => r.label));
  results.push(
    ok('rationale-per-choice', 'reject', labelled.size === 4,
      `${labelled.size}/4 choices carry a rationale`,
      { itemId: id }),
  );

  const normalizedPassage = normalize(passageText);
  const missingQuotes = item.evidenceQuotes.filter((q) => !normalizedPassage.includes(normalize(q)));
  results.push(
    ok('evidence-quotes-verbatim', 'reject', missingQuotes.length === 0,
      missingQuotes.length === 0
        ? `all ${item.evidenceQuotes.length} evidence quotes found in the passage`
        : `${missingQuotes.length} evidence quote(s) do not appear in the passage`,
      { itemId: id }),
  );

  // --- Skill tag consistency ---------------------------------------------------
  const archetype = archetypeById(item.archetype);
  results.push(
    ok('archetype-known', 'reject', archetype !== undefined, `archetype ${item.archetype}`, { itemId: id }),
  );
  if (archetype) {
    /**
     * The declared skill must match the scope of the archetype. The full derivation
     * needs the item model's evidence paragraphs; the archetype's scope is the part
     * checkable from the generated artefact alone.
     */
    const expected = deriveSkill({
      archetype: item.archetype,
      evidenceParagraphs: archetype.scope === 'immediate' ? [0] : [0, 2],
      ...(archetype.scope === 'beyond' ? { stemSuppliedInformation: 'supplied' } : {}),
    });
    results.push(
      ok('skill-tag-matches-scope', 'review', item.skill === expected,
        `declared ${item.skill}, archetype scope implies ${expected}`,
        { itemId: id }),
    );
  }

  return results;
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[“”"']/g, '')
    .replace(/[\u2010-\u2015]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Passage-level shape audit. */
export function auditPassage(set: GeneratedPassageSet): CheckResult[] {
  const results: CheckResult[] = [];
  const text = set.passage.paragraphs.join(' ');
  const words = passageWordCount(set.passage);
  const sentences = sentencesIn(text);
  const sentenceLengths = sentences.map((s) => wordsIn(s));

  results.push(bandCheck('passage-words', 'reject', words, PASSAGE_SHAPE.words, 'passage length'));
  results.push(
    bandCheck('passage-paragraphs', 'reject', set.passage.paragraphs.length, PASSAGE_SHAPE.paragraphs, 'paragraph count'),
  );
  results.push(bandCheck('passage-sentences', 'review', sentences.length, PASSAGE_SHAPE.sentences, 'sentence count'));
  results.push(
    bandCheck('passage-mean-sentence', 'review', mean(sentenceLengths), PASSAGE_SHAPE.meanSentenceWords, 'mean sentence length'),
  );

  const longest = sentenceLengths.length > 0 ? Math.max(...sentenceLengths) : 0;
  results.push(
    ok('passage-max-sentence', 'review', longest <= PASSAGE_SHAPE.maxSentenceWords,
      `longest sentence = ${longest} words`,
      { score: longest, threshold: PASSAGE_SHAPE.maxSentenceWords }),
  );

  /**
   * Hedge rate has a floor for a structural reason rather than a stylistic one: a
   * passage that asserts everything flatly cannot support intensity-error distractors,
   * so the `too-extreme` family has nothing to overstate.
   */
  const hedgeRate = words > 0 ? countMatches(text, HEDGE_PATTERN) / words : 0;
  results.push(bandCheck('passage-hedge-rate', 'review', hedgeRate, PASSAGE_SHAPE.hedgeRate, 'hedged-language rate'));

  return results;
}

/** Set-level distribution audit. */
export function auditSet(set: GeneratedPassageSet): CheckResult[] {
  const results: CheckResult[] = [];

  /**
   * Key-position balance is enforced because it protects the *harness*, not because
   * examinees are known to exploit it. Solver checks are severely position-biased — an
   * answer-moving attack moved one model 15 points on a comparable benchmark — so an
   * unbalanced key distribution corrupts every ablation measurement downstream. It is
   * free to enforce, so it is enforced.
   */
  const positions = set.items.map((i) => i.correctChoice);
  const counts = new Map<string, number>();
  for (const p of positions) counts.set(p, (counts.get(p) ?? 0) + 1);
  const topShare = Math.max(...counts.values()) / positions.length;
  results.push(
    ok('key-position-balance', 'review', topShare <= BATCH_GATES.keyPositionShareMax,
      `most common key position holds ${round(topShare * 100)}% of items`,
      { score: topShare, threshold: BATCH_GATES.keyPositionShareMax }),
  );

  const diversity = archetypeDiversity(set.items.map((i) => i.archetype));
  results.push(
    ok('archetype-diversity', 'review',
      set.items.length < 3 || diversity >= BATCH_GATES.archetypeDiversityMin,
      `normalised archetype entropy = ${round(diversity)} over ${new Set(set.items.map((i) => i.archetype)).size} archetypes`,
      { score: diversity, threshold: BATCH_GATES.archetypeDiversityMin }),
  );

  /**
   * Skill mix is reported, never gated at the set level: the official 30/30/40
   * weighting is a property of the 53-item form, and no 5-7 item set can satisfy it.
   */
  const mix = { FOC: 0, RWT: 0, RBT: 0 };
  for (const item of set.items) mix[item.skill] += 1;
  results.push(
    ok('skill-mix', 'info', true, `FOC ${mix.FOC} / RWT ${mix.RWT} / RBT ${mix.RBT}`),
  );

  return results;
}

/** Runs the whole deterministic layer. */
export function runDeterministicChecks(set: GeneratedPassageSet): CheckResult[] {
  const passageText = set.passage.paragraphs.join('\n\n');
  return [
    ...auditPassage(set),
    ...auditSet(set),
    ...set.items.flatMap((item) => auditItem(item, passageText)),
  ];
}
