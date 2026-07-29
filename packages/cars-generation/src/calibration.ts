/**
 * Gate thresholds calibrated against the golden corpus.
 *
 * Why this file exists rather than inline constants: the item-generation literature is
 * unambiguous that **no published threshold for any item-quality check transfers to
 * CARS**. Published numbers describe how exploitable existing corpora are; none is a
 * validated pass/fail line. Every gate must therefore be set so the rule reads "worse
 * than a real CARS item" rather than an invented number.
 *
 * Source of the bands: `docs/research/cars-item-design/corpus-structural-profile.json`,
 * produced by `tools/cars-corpus-profile/profile-corpus.mjs` over 106 screenshots of
 * two official practice forms. That tool emits only aggregate structural measurements;
 * no source text enters this repository.
 *
 * MEASUREMENT CAVEATS, which bound how hard these gates should bite:
 *  - Option geometry rests on the 19 items where all four options were cleanly
 *    recovered by OCR. That is a thin sample, so gates are set at the observed
 *    extreme with margin rather than at a percentile.
 *  - Passage word counts are OCR-inflated (measured median 613 against an official
 *    500-600), so the official range is the authoring target and the measured range
 *    only widens the tolerance.
 */

/** A closed interval used as an acceptance band. */
export interface Band {
  readonly min: number;
  readonly max: number;
}

export function withinBand(value: number, band: Band): boolean {
  return value >= band.min && value <= band.max;
}

/**
 * The single most important calibration result in this file.
 *
 * Real CARS options are markedly uneven in length: the ratio of longest to shortest
 * option has a median of 1.85, a 90th percentile of 3.3, and a measured maximum of
 * 6.33. A naive "options must be similar length" gate — the kind an engineer would
 * reach for after reading that the longest-option cue is exploitable — would reject
 * the majority of authentic items.
 *
 * The defensible gate is not on raw spread but on the *key* being the longest option,
 * because that is the direction of the exploitable cue. Spread itself is allowed up to
 * the observed corpus maximum.
 */
export const OPTION_LENGTH = {
  /** Longest / shortest option, in words. Corpus: median 1.85, p90 3.31, max 6.33. */
  spreadRatioMax: 6.5,
  /** Longest / mean option, in words. Corpus: median 1.33, p90 1.62, max 1.9. */
  maxOverMeanMax: 2.0,
  /** Mean option length in words. Corpus: median 13.5, range 7-36.75. */
  meanWords: { min: 4, max: 40 } as Band,
  /** Shortest option in words. Corpus: min 3. Guards against a stub option. */
  minWords: 2,
  /**
   * How much longer the key may be than the mean distractor before it is flagged.
   * The always-pick-the-longest heuristic is worth roughly +4 to +10 points over
   * chance on comparable four-option corpora, so this is the cue that matters. Set as
   * a ratio because absolute word gaps are meaningless at short option lengths.
   */
  keyOverDistractorMeanMax: 1.6,
} as const;

/**
 * Passage shape. The official 500-600 word range is the authoring target; the band
 * below is the *acceptance* range, widened to absorb the measurement noise documented
 * above and to avoid rejecting a passage for being 12 words long.
 */
export const PASSAGE_SHAPE = {
  words: { min: 480, max: 660 } as Band,
  /** Corpus: median 7.5-9 by indentation, range 4-12. */
  paragraphs: { min: 4, max: 12 } as Band,
  /** Corpus: median 24, range 15-38. */
  sentences: { min: 14, max: 40 } as Band,
  /** Corpus: median 24.6, range 18.2-42.3. Mean sentence length in words. */
  meanSentenceWords: { min: 16, max: 44 } as Band,
  /**
   * Corpus: median 65, p90 102, max 131. CARS prose genuinely contains very long
   * sentences, so this is a loose ceiling that only catches runaway generation.
   */
  maxSentenceWords: 140,
  /**
   * Hedged/qualified language as a share of words. Corpus: median 0.007, max 0.023.
   * A floor matters more than a ceiling: hedging is what makes intensity-error
   * distractors possible, so a passage with no hedging cannot support the
   * `too-extreme` family.
   */
  hedgeRate: { min: 0.002, max: 0.03 } as Band,
} as const;

/** Stem shape. Corpus: median 19 words, p25 14, p75 26, p90 38, max 108. */
export const STEM_SHAPE = {
  words: { min: 5, max: 60 } as Band,
} as const;

/**
 * Absolute and extreme qualifiers in options.
 *
 * Item-writing guidance treats absolutes as a flaw signal, and a generator will
 * over-produce them. But real CARS options use them: the corpus measures a mean of
 * 0.13 absolute terms per option, with items reaching 0.75. Several authentic items
 * are built entirely out of an absolute-term matrix over two attributes.
 *
 * So the gate is not "no absolutes" — that would be stricter than the source material
 * and would forbid a legitimate construction. It flags only when absolutes cluster
 * beyond anything observed.
 */
export const ABSOLUTE_TERMS = {
  /** Corpus mean 0.132 per option, observed max 0.75. */
  perOptionMax: 1.0,
  /**
   * Absolutes appearing in the key while absent from every distractor is a cue, not a
   * style issue: it tells a test-wise examinee which option was written first.
   */
  flagKeyOnlyAbsolutes: true,
} as const;

/**
 * Solver-ablation gates.
 *
 * Unlike every other band in this file, these are NOT calibrated. They are invented
 * numbers, and the honest reading of any result they produce is "the item cleared a
 * threshold somebody guessed", not "the item is no leakier than a real CARS item".
 *
 * The chance rate is 0.25 on four options. The published ablation results on a
 * comparable four-option corpus are sobering: passage-deleted solvers reached 51.5%
 * and options-only reached 45.3%. Those describe how leaky an existing dataset was,
 * not how leaky an item may be, so they cannot be borrowed as thresholds either.
 *
 * WHY THEY ARE STILL UNCALIBRATED
 * `pnpm cars:calibrate` exists to fix this: it measures the same ablations against the
 * reference corpus and retains only accuracy rates, the identical posture that produced
 * the calibrated bands above. Running it against the two CARS recordings establishes that
 * the corpus cannot support the measurement:
 *
 *   106 pages → 5 sets → 10 distinct items with all four options readable,
 *   against 64 item renders discarded for showing fewer than four.
 *
 * The screenshots are a scrolling viewport, so the fourth option is below the fold on
 * most frames. Ten items cannot pin a rate to better than roughly ±15 points, which is
 * wider than the gap between chance and the thresholds below.
 *
 * So the blocker is the capture, not the answer key and not the provider budget.
 * Re-capturing items with all four options in frame is what unblocks this; supplying keys
 * for the ten items already recovered would not. Until then these stay provisional, and
 * a `review` verdict traceable to them means less than one from any other gate here.
 */
export const SOLVER_GATES = {
  chanceRate: 0.25,
  /**
   * Passage-blind accuracy above this is treated as evidence the item is answerable
   * without reading, which is the direct operationalisation of the no-outside-
   * knowledge rule. Set deliberately close to chance because this is the failure mode
   * an LLM generator is most prone to.
   */
  passageBlindMax: 0.4,
  /** Options-only accuracy: the strictest ablation, catching option-set artifacts. */
  optionsOnlyMax: 0.4,
  /** Stem-blind (passage + options, no question) accuracy. */
  stemBlindMax: 0.5,
  /**
   * Full-input ensemble agreement with the authored key. Disagreement is evidence the
   * key is wrong, not that the item is hard: a solver ensemble that near-ceilings on
   * this construct has almost no difficulty-discriminating range, which makes it a
   * poor difficulty estimator and an excellent key verifier.
   */
  fullInputAgreementMin: 0.8,
  /** Provisional. Revise once the ensemble has been calibrated on any scored set. */
  provisional: true,
} as const;

/**
 * Originality gates against the golden corpus and any source text.
 *
 * No source defines how dissimilar a generated passage must be from a source corpus to
 * be defensibly original; the memorization literature's thresholds measure extraction
 * rather than originality. The n-gram length below follows the field-standard 50-token
 * containment protocol, scaled to words.
 *
 * Known and unfixable limitation: n-gram and embedding methods cannot see non-literal
 * copying of event structure or argument shape, which runs 2.3-5.9% in the literature
 * and resists the mitigations that reduce literal copying. The residual risk is
 * addressed structurally — by generating from abstract blueprints rather than from
 * source text — not by this check.
 */
export const ORIGINALITY = {
  /** Any shared n-gram of this length is treated as copying. */
  ngramWords: 8,
  /** Shingled Jaccard similarity ceiling against any single corpus document. */
  jaccardMax: 0.12,
  /** Shingle size for the Jaccard estimate, in words. */
  shingleWords: 5,
} as const;

/**
 * Batch-level distribution gates. Answer-position balance has no direct evidence of
 * examinee exploitation, but it is essential for the solver checks: an answer-moving
 * attack moved one model 15 points on a comparable benchmark, so an unbalanced key
 * distribution corrupts the harness itself. It is free, so it is enforced regardless.
 */
export const BATCH_GATES = {
  /** Max share of items in a set that may share the same key position. */
  keyPositionShareMax: 0.5,
  /** Minimum normalised archetype entropy across a set. */
  archetypeDiversityMin: 0.6,
} as const;
