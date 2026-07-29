#!/usr/bin/env node
/**
 * CARS golden-corpus structural profiler.
 *
 * COPYRIGHT GUARDRAIL — read before editing.
 * This tool reads screenshots of copyrighted third-party test material that live
 * OUTSIDE this repository and are never copied into it. It emits *only* aggregate
 * structural measurements: counts, lengths, ratios, and category tallies. No stem,
 * choice, passage sentence, or any other span of source text is written to the
 * output, to disk, or to stdout. The OCR text exists only in memory for the
 * duration of one image and is discarded.
 *
 * Why this exists: `docs/research/item-generation/00-README.md` establishes that no
 * published threshold for any item-quality check transfers to CARS, and that every
 * gate must therefore be calibrated so the rule reads "worse than a real CARS item"
 * rather than an invented number. This produces those calibration bands.
 *
 * Usage:
 *   node tools/cars-corpus-profile/profile-corpus.mjs \
 *     --dir "/path/to/screenshots" [--dir ...] \
 *     [--match <substring>] [--out profile.json]
 *
 * `--dir` is searched recursively for PNGs. `--match` keeps only paths containing
 * the substring, which is the practical way to target directories whose names
 * contain characters awkward to quote in a shell.
 *
 * Requires the `tesseract` binary on PATH.
 */

import { writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import {
  MIN_CONFIDENCE,
  extractItem,
  extractPassage,
  findImages,
  ocrWords,
  splitPanes,
} from './extract.mjs';

/**
 * Stem-opener archetype buckets. Classification emits only the bucket name, never
 * the matched text. Ordering matters: the first match wins, so more specific
 * patterns precede general ones.
 *
 * Buckets follow the 10-archetype operational layer in
 * `docs/research/cars-item-design/03-item-archetypes.md`.
 */
const STEM_BUCKETS = [
  ['new_information_effect', /\b(if true|were true|suppose|if the author learned|new (?:information|evidence)|which .{0,40}\b(?:strengthen|weaken|undermine|support|challenge)\b)/i],
  ['least_disruption', /\bleast\b.{0,40}\b(?:change|disrupt|affect|consistent)/i],
  ['analogy_application', /\b(most (?:analogous|similar)|best exemplifies|would be an example|applied to|apply .{0,30}\bto\b)/i],
  ['author_purpose_function', /\b(in order to|most likely (?:in order )?to|why does the author|purpose of|function of|mentions?\b.{0,40}\bto\b)/i],
  ['author_attitude_tone', /\b(attitude|tone|would probably (?:agree|disagree)|author'?s? (?:view|opinion|stance)|most likely (?:believes?|holds))/i],
  ['meaning_in_context', /\b(as used in|by\b.{0,25}\bthe author (?:most likely )?means|in context|refers to|the (?:word|phrase|term)\b)/i],
  ['central_thesis', /\b(main (?:idea|point|thesis)|central (?:thesis|idea|argument|point)|primary purpose|best summari[sz]es|passage as a whole)/i],
  ['inference_implication', /\b(implies|suggests|it can be inferred|one would (?:most reasonably )?(?:assume|conclude)|most reasonably (?:assume|conclude)|reasonable to (?:assume|conclude))/i],
  ['assumption', /\b(assum(?:es|ption)|takes for granted|presupposes)/i],
  ['explicit_retrieval', /\b(according to the passage|the passage states|the author (?:claims|states|notes|says)|based on the passage)/i],
];

/**
 * Absolute / extreme qualifiers. Item-writing guidance treats these as a flaw
 * signal, but real CARS options demonstrably use them, so the point of counting
 * is to avoid writing a gate stricter than the source material.
 */
const ABSOLUTE_TERMS =
  /\b(all|none|never|always|only|every|must|cannot|entirely|completely|no|totally|invariably|exclusively|solely)\b/gi;

const NEGATION_TERMS = /\b(not|never|no|neither|nor|without|un\w+|non\w+)\b/gi;

const HEDGE_TERMS =
  /\b(may|might|could|would|often|sometimes|generally|typically|tends?|likely|perhaps|possibly|somewhat|partly|largely|most(?:ly)?|usually|apparently|seems?|suggests?)\b/gi;

function parseArgs(argv) {
  const dirs = [];
  const matches = [];
  let out = null;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--dir' && argv[i + 1]) {
      dirs.push(argv[i + 1]);
      i += 1;
    } else if (argv[i] === '--match' && argv[i + 1]) {
      matches.push(argv[i + 1]);
      i += 1;
    } else if (argv[i] === '--out' && argv[i + 1]) {
      out = argv[i + 1];
      i += 1;
    }
  }
  if (dirs.length === 0) {
    throw new Error('at least one --dir is required');
  }
  return { dirs, matches, out };
}

function wordCount(text) {
  const m = text.match(/[A-Za-z0-9][A-Za-z0-9'’-]*/g);
  return m ? m.length : 0;
}

function countMatches(text, re) {
  const m = text.match(re);
  return m ? m.length : 0;
}

function classifyStem(stem) {
  for (const [bucket, re] of STEM_BUCKETS) {
    if (re.test(stem)) return bucket;
  }
  return 'unclassified';
}

/** Measures the passage pane: length, paragraph structure, sentence rhythm. */
function measurePassage(leftLines) {
  const extracted = extractPassage(leftLines);
  if (!extracted) return null;
  const { setKey, itemsInSet, hasAttribution, proseLines } = extracted;

  const prose = proseLines.map((l) => l.text).join(' ');
  const words = wordCount(prose);
  if (words < 120) return null; // partial render or scroll state; not a full passage

  // Paragraph count via first-line indentation: the modal left margin is the body
  // margin, and indented lines start paragraphs.
  const lefts = proseLines.map((l) => l.left).sort((a, b) => a - b);
  const bodyMargin = lefts[Math.floor(lefts.length * 0.5)];
  const indentThreshold = bodyMargin + Math.max(8, bodyMargin * 0.02);
  const indentedParagraphs = proseLines.filter((l) => l.left > indentThreshold).length;
  const structuralParagraphs = new Set(proseLines.map((l) => `${l.block}:${l.par}`)).size;

  const sentences = prose
    .split(/(?<=[.!?])\s+(?=[A-Z“"])/)
    .map((s) => wordCount(s))
    .filter((n) => n >= 3);

  return {
    words,
    itemsInSet,
    setKey,
    hasAttribution,
    paragraphsByIndent: indentedParagraphs,
    paragraphsByBlock: structuralParagraphs,
    sentenceCount: sentences.length,
    meanSentenceWords: sentences.length ? sum(sentences) / sentences.length : null,
    maxSentenceWords: sentences.length ? Math.max(...sentences) : null,
    hedgeRate: words ? countMatches(prose, HEDGE_TERMS) / words : null,
    negationRate: words ? countMatches(prose, NEGATION_TERMS) / words : null,
  };
}

function sum(xs) {
  return xs.reduce((a, b) => a + b, 0);
}

function quantile(sorted, q) {
  if (sorted.length === 0) return null;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

function describe(values) {
  const xs = values.filter((v) => typeof v === 'number' && Number.isFinite(v)).sort((a, b) => a - b);
  if (xs.length === 0) return { n: 0 };
  return {
    n: xs.length,
    min: round(xs[0]),
    p10: round(quantile(xs, 0.1)),
    p25: round(quantile(xs, 0.25)),
    median: round(quantile(xs, 0.5)),
    p75: round(quantile(xs, 0.75)),
    p90: round(quantile(xs, 0.9)),
    max: round(xs[xs.length - 1]),
    mean: round(sum(xs) / xs.length),
  };
}

function round(n) {
  return n === null ? null : Math.round(n * 1000) / 1000;
}

function tally(values) {
  const counts = {};
  for (const v of values) counts[v] = (counts[v] ?? 0) + 1;
  return Object.fromEntries(Object.entries(counts).sort((a, b) => b[1] - a[1]));
}

function main() {
  const { dirs, matches, out } = parseArgs(process.argv.slice(2));

  const passages = [];
  const items = [];
  let pagesRead = 0;
  let pagesSkipped = 0;

  // The containing directory scopes passage identity: two different test forms both
  // number their passages from 1, so "Passage 1" is only unique within a recording.
  const files = dirs.flatMap((dir) => findImages(dir, matches));
  if (files.length === 0) {
    throw new Error('no PNGs matched the given --dir/--match combination');
  }

  {
    for (const file of files) {
      let words;
      try {
        words = ocrWords(file);
      } catch {
        pagesSkipped += 1;
        continue;
      }
      if (words.length === 0) {
        pagesSkipped += 1;
        continue;
      }
      pagesRead += 1;

      const pageWidth = Math.max(...words.map((w) => w.left + w.width));
      const { left, right } = splitPanes(words, pageWidth);

      const passage = measurePassage(left);
      if (passage) passages.push({ ...passage, scope: dirname(file) });

      const { stem, options } = extractItem(right);
      if (stem && options.length >= 2) {
        const optionWords = options.map((o) => wordCount(o.text)).filter((n) => n > 0);
        if (optionWords.length === options.length) {
          const maxOpt = Math.max(...optionWords);
          const minOpt = Math.min(...optionWords);
          const meanOpt = sum(optionWords) / optionWords.length;
          const optionText = options.map((o) => o.text).join(' ');
          items.push({
            stemWords: wordCount(stem),
            archetype: classifyStem(stem),
            optionCount: options.length,
            optionWordsMin: minOpt,
            optionWordsMax: maxOpt,
            optionWordsMean: meanOpt,
            // Calibrates the longest-option-cue gate: how uneven are real options?
            optionSpreadRatio: minOpt > 0 ? maxOpt / minOpt : null,
            optionMaxOverMean: meanOpt > 0 ? maxOpt / meanOpt : null,
            stemEndsWithColon: /:\s*$/.test(stem),
            stemHasParagraphRef: /\bparagraph\s+\d+|\(paragraph/i.test(stem),
            stemHasNegation: /\b(not|except|least)\b/i.test(stem),
            absolutesPerOption: countMatches(optionText, ABSOLUTE_TERMS) / options.length,
            hedgesPerOption: countMatches(optionText, HEDGE_TERMS) / options.length,
          });
        }
      }
    }
  }

  // Every item in a set re-renders the same passage pane, so measurements collapse by
  // set identity. The best-OCR reading (most words recovered) represents the passage.
  const bySet = new Map();
  for (const p of passages) {
    const key = p.setKey ? `${p.scope}|${p.setKey}` : null;
    if (!key) continue;
    const existing = bySet.get(key);
    if (!existing || p.words > existing.words) bySet.set(key, p);
  }
  const uniquePassages = [...bySet.values()];
  const complete = items.filter((i) => i.optionCount === 4);

  const profile = {
    generatedAt: new Date().toISOString(),
    provenance: {
      note: 'Aggregate structural measurements only. No source text is reproduced. See the header of tools/cars-corpus-profile/profile-corpus.mjs.',
      directoriesProfiled: dirs.length,
      pagesDiscovered: files.length,
      pagesRead,
      pagesSkipped,
      ocrEngine: 'tesseract',
      minConfidence: MIN_CONFIDENCE,
    },
    passages: {
      distinctPassagesDetected: uniquePassages.length,
      words: describe(uniquePassages.map((p) => p.words)),
      paragraphsByIndent: describe(uniquePassages.map((p) => p.paragraphsByIndent)),
      paragraphsByBlock: describe(uniquePassages.map((p) => p.paragraphsByBlock)),
      sentenceCount: describe(uniquePassages.map((p) => p.sentenceCount)),
      meanSentenceWords: describe(uniquePassages.map((p) => p.meanSentenceWords)),
      maxSentenceWords: describe(uniquePassages.map((p) => p.maxSentenceWords)),
      hedgeRate: describe(uniquePassages.map((p) => p.hedgeRate)),
      negationRate: describe(uniquePassages.map((p) => p.negationRate)),
      attributionPresentRate: round(
        uniquePassages.filter((p) => p.hasAttribution).length / Math.max(1, uniquePassages.length),
      ),
      itemsPerSet: tally(
        uniquePassages.map((p) => p.itemsInSet).filter((n) => typeof n === 'number' && n > 0),
      ),
    },
    items: {
      // Stem-level measures survive partial option recovery, so they use every item.
      itemsMeasured: items.length,
      stemWords: describe(items.map((i) => i.stemWords)),
      stemEndsWithColonRate: round(
        items.filter((i) => i.stemEndsWithColon).length / Math.max(1, items.length),
      ),
      stemHasParagraphRefRate: round(
        items.filter((i) => i.stemHasParagraphRef).length / Math.max(1, items.length),
      ),
      stemHasNegationRate: round(
        items.filter((i) => i.stemHasNegation).length / Math.max(1, items.length),
      ),
      archetypeMix: tally(items.map((i) => i.archetype)),
      optionRecovery: tally(items.map((i) => i.optionCount)),
    },
    /**
     * Option geometry is only meaningful when all four options were recovered; a
     * truncated option set would understate spread. These are the bands that
     * calibrate the choice-length and absolute-term gates.
     */
    optionGeometry: {
      itemsWithFourOptions: complete.length,
      optionWordsMin: describe(complete.map((i) => i.optionWordsMin)),
      optionWordsMax: describe(complete.map((i) => i.optionWordsMax)),
      optionWordsMean: describe(complete.map((i) => i.optionWordsMean)),
      optionSpreadRatio: describe(complete.map((i) => i.optionSpreadRatio)),
      optionMaxOverMean: describe(complete.map((i) => i.optionMaxOverMean)),
      absolutesPerOption: describe(complete.map((i) => i.absolutesPerOption)),
      hedgesPerOption: describe(complete.map((i) => i.hedgesPerOption)),
    },
  };

  const json = `${JSON.stringify(profile, null, 2)}\n`;
  if (out) {
    writeFileSync(out, json);
    process.stdout.write(`wrote ${out}\n`);
  } else {
    process.stdout.write(json);
  }
}

main();
