/**
 * Solver-gate calibration against the reference corpus.
 *
 * COPYRIGHT GUARDRAIL — read before editing.
 * This command reads screenshots of copyrighted third-party test material that live
 * OUTSIDE this repository. Item text exists only in memory, only long enough to be sent
 * to the solver ensemble, and is never written to the output, to disk, or to stdout. The
 * artifact is a table of accuracy rates. Any edit that persists a stem, an option, or a
 * passage sentence breaks the guarantee that lets this run at all.
 *
 * WHY THIS EXISTS
 * `packages/cars-generation/src/calibration.ts` ships `SOLVER_GATES` marked provisional
 * because they were invented, not measured. `docs/research/item-generation/00-README.md`
 * establishes that no published artifact threshold transfers to CARS, and that a gate is
 * only meaningful when it reads "worse than a real CARS item". This measures the real
 * items so the thresholds can be derived instead of guessed.
 *
 * THE LABEL PROBLEM — read before trusting the numbers.
 * The screenshots contain no answer key. Without one, accuracy is undefined. Two modes:
 *
 *   --keys <file>   Supplied keys. One `<setKey> <LETTERS>` line per passage set, e.g.
 *                   `p1:1-5 ACBDA`. Trustworthy; use whenever keys are available.
 *
 *   (default)       Consensus proxy. The full-input ensemble's majority pick becomes the
 *                   presumed key. Two consequences that must not be forgotten:
 *                     1. `full` accuracy is inflated toward 1.0 by construction and
 *                        carries no information. It is reported but must not be used.
 *                     2. Items where the ensemble reaches no majority are dropped. Those
 *                        are disproportionately the hard items, which are also the least
 *                        passage-blind-guessable, so the measured leakage rate is biased
 *                        UPWARD and gates derived from it are too permissive.
 *                   The output records which mode ran and the drop count, so a
 *                   downstream reader can see how much to discount it.
 */

import { readFileSync } from 'node:fs';

import type { OcrWord } from '../../cars-corpus-profile/extract.mjs';
import {
  ABLATION_CONDITIONS,
  type AblationCondition,
  type ChoiceLabel,
  type NamedSolver,
  type SolvableItem,
  consensusPick,
  measureAblations,
} from '@mcat/cars-generation';

/** A recovered item, carrying the OCR quality signal used to pick between page readings. */
interface RecoveredItem extends SolvableItem {
  readonly optionWords: number;
}

/** One passage set recovered from the corpus, held in memory only. */
interface ReferenceSet {
  readonly setKey: string;
  readonly passage: string;
  readonly items: RecoveredItem[];
}

export interface CalibrateOptions {
  readonly dirs: readonly string[];
  readonly matches: readonly string[];
  readonly solvers: readonly NamedSolver[];
  readonly keysFile?: string | undefined;
  readonly permutations?: number | undefined;
  readonly maxSets?: number | undefined;
}

const CONDITIONS_TO_MEASURE: readonly AblationCondition[] = ABLATION_CONDITIONS;

/** Word count consistent with the profiler, used only to reject partial renders. */
function wordCount(text: string): number {
  const m = text.match(/[A-Za-z0-9][A-Za-z0-9'’-]*/g);
  return m ? m.length : 0;
}

function parseKeysFile(path: string): Map<string, ChoiceLabel[]> {
  const keys = new Map<string, ChoiceLabel[]>();
  for (const raw of readFileSync(path, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const [setKey, letterField] = line.split(/\s+/);
    if (!setKey || !letterField) continue;
    const letters = letterField
      .toUpperCase()
      .split('')
      .filter((c): c is ChoiceLabel => c === 'A' || c === 'B' || c === 'C' || c === 'D');
    if (letters.length > 0) keys.set(setKey, letters);
  }
  return keys;
}

/**
 * Recovers passage sets from screenshots. Each page shows one item beside its passage,
 * so pages are grouped by set identity and the best-OCR passage reading represents it.
 */
async function recoverSets(
  dirs: readonly string[],
  matches: readonly string[],
): Promise<{
  sets: ReferenceSet[];
  pagesRead: number;
  pagesUnusable: number;
  rendersWithIncompleteOptions: number;
}> {
  const extract = await import('../../cars-corpus-profile/extract.mjs');

  const files = dirs.flatMap((dir) => extract.findImages(dir, matches));
  if (files.length === 0) throw new Error('no PNGs matched the given --dir/--match combination');

  const byKey = new Map<
    string,
    { passage: string; passageWords: number; items: Map<string, RecoveredItem> }
  >();
  /**
   * The set header scrolls out of view on many pages, so a page showing an item often
   * carries no set identity of its own. Pages within a recording are in capture order, so
   * the last header seen in that recording still identifies the set. Requiring the header
   * on the item's own page discards most of the corpus.
   */
  const lastSetKeyByScope = new Map<string, string>();
  let pagesRead = 0;
  let pagesUnusable = 0;
  /**
   * Item renders whose option list came back short. This is the corpus's binding
   * constraint, so it is counted and reported rather than silently skipped: the
   * screenshots are a scrolling viewport, and on most frames the fourth option is below
   * the fold and simply not present to be read.
   */
  let rendersWithIncompleteOptions = 0;

  for (const file of files) {
    let words: OcrWord[];
    try {
      words = extract.ocrWords(file);
    } catch {
      pagesUnusable += 1;
      continue;
    }
    if (words.length === 0) {
      pagesUnusable += 1;
      continue;
    }
    pagesRead += 1;

    const pageWidth = Math.max(...words.map((w) => w.left + w.width));
    const { left, right } = extract.splitPanes(words, pageWidth);
    const passage = extract.extractPassage(left);
    const item = extract.extractItem(right);

    // A set is only unique within a recording: distinct forms both number from 1.
    const scope = file.slice(0, file.lastIndexOf('/'));
    if (passage?.setKey) lastSetKeyByScope.set(scope, passage.setKey);
    const setKey = passage?.setKey ?? lastSetKeyByScope.get(scope);
    if (!setKey) {
      pagesUnusable += 1;
      continue;
    }
    const key = `${scope}|${setKey}`;

    let entry = byKey.get(key);
    if (!entry) {
      entry = { passage: '', passageWords: 0, items: new Map() };
      byKey.set(key, entry);
    }

    // The passage pane re-renders for every item in the set, partially when scrolled.
    // The fullest reading represents the passage; partial renders are simply not better.
    if (passage) {
      const prose = passage.proseLines.map((l) => l.text).join(' ');
      const proseWords = wordCount(prose);
      if (proseWords > entry.passageWords) {
        entry.passage = prose;
        entry.passageWords = proseWords;
      }
    }

    // Only fully recovered four-option items can be solved; a truncated option set
    // would make the ensemble choose among the wrong candidates.
    const complete = item.options.length === 4 && item.options.every((o) => o.text.length > 0);
    if (item.stem && !complete) rendersWithIncompleteOptions += 1;
    if (item.stem && complete) {
      // The stem is the item's identity here: page filenames do not carry item numbers
      // reliably, and the same item re-renders across scroll states.
      const id = item.stem.slice(0, 60);
      const existing = entry.items.get(id);
      // Prefer the reading that recovered more option text: OCR quality varies by page.
      const optionWords = item.options.reduce((n, o) => n + wordCount(o.text), 0);
      if (!existing || optionWords > existing.optionWords) {
        entry.items.set(id, {
          id,
          stem: item.stem,
          choices: item.options.map((o) => ({ label: o.label as ChoiceLabel, text: o.text })),
          correctChoice: 'A', // placeholder; replaced by supplied or proxy label below
          optionWords,
        });
      }
    }
  }

  const sets: ReferenceSet[] = [];
  for (const [key, entry] of byKey) {
    // A set needs both a usable passage and at least one fully recovered item: the
    // ablations compare performance with and without the passage, so a set missing
    // either side cannot contribute a comparison.
    if (entry.items.size === 0 || entry.passageWords < 120) continue;
    sets.push({ setKey: key, passage: entry.passage, items: [...entry.items.values()] });
  }
  return { sets, pagesRead, pagesUnusable, rendersWithIncompleteOptions };
}

export interface CalibrationReport {
  readonly generatedAt: string;
  readonly labelSource: 'supplied-keys' | 'consensus-proxy';
  readonly caveats: readonly string[];
  readonly corpus: {
    readonly pagesRead: number;
    readonly pagesUnusable: number;
    readonly setsRecovered: number;
    readonly itemsRecovered: number;
    readonly itemsLabelled: number;
    readonly itemsDroppedNoConsensus: number;
    readonly rendersWithIncompleteOptions: number;
  };
  readonly solvers: readonly string[];
  readonly permutations: number;
  readonly byCondition: readonly {
    readonly condition: AblationCondition;
    readonly trials: number;
    readonly accuracy: number;
  }[];
  readonly recommendedGates: Record<string, number | null>;
}

export async function calibrateSolverGates(
  options: CalibrateOptions,
): Promise<CalibrationReport> {
  const permutations = options.permutations ?? 4;
  const { sets, pagesRead, pagesUnusable, rendersWithIncompleteOptions } = await recoverSets(
    options.dirs,
    options.matches,
  );
  const selected = options.maxSets ? sets.slice(0, options.maxSets) : sets;

  const suppliedKeys = options.keysFile ? parseKeysFile(options.keysFile) : null;
  const labelSource = suppliedKeys ? 'supplied-keys' : 'consensus-proxy';

  let itemsRecovered = 0;
  let itemsLabelled = 0;
  let itemsDropped = 0;
  const allTrials: Awaited<ReturnType<typeof measureAblations>>['trials'][number][] = [];

  for (const set of selected) {
    itemsRecovered += set.items.length;

    let labelled: SolvableItem[];
    if (suppliedKeys) {
      // Supplied keys are positional within a set; item order here is page order.
      const shortKey = set.setKey.slice(set.setKey.indexOf('|') + 1);
      const letters = suppliedKeys.get(shortKey);
      if (!letters) {
        itemsDropped += set.items.length;
        continue;
      }
      labelled = set.items.flatMap((item, idx) => {
        const label = letters[idx];
        return label ? [{ ...item, correctChoice: label }] : [];
      });
      itemsDropped += set.items.length - labelled.length;
    } else {
      // Derive proxy labels from a full-input pass, then measure the ablations against
      // them. The full pass must run alone so its consensus is not contaminated.
      const probe = await measureAblations(set.passage, set.items, {
        solvers: options.solvers,
        permutations,
        conditions: ['full'],
      });
      labelled = [];
      for (const item of set.items) {
        const consensus = consensusPick(probe.trials, item.id, 'full', 0.6);
        if (consensus) labelled.push({ ...item, correctChoice: consensus.label });
        else itemsDropped += 1;
      }
    }

    if (labelled.length === 0) continue;
    itemsLabelled += labelled.length;

    const measured = await measureAblations(set.passage, labelled, {
      solvers: options.solvers,
      permutations,
      conditions: CONDITIONS_TO_MEASURE,
    });
    allTrials.push(...measured.trials);
  }

  const byCondition = CONDITIONS_TO_MEASURE.map((condition) => {
    const relevant = allTrials.filter((t) => t.condition === condition);
    const correct = relevant.filter((t) => t.correct).length;
    return {
      condition,
      trials: relevant.length,
      accuracy: relevant.length === 0 ? 0 : round(correct / relevant.length),
    };
  });

  const accuracyOf = (condition: AblationCondition): number | null => {
    const found = byCondition.find((c) => c.condition === condition);
    return found && found.trials > 0 ? found.accuracy : null;
  };

  const caveats: string[] = [];
  if (!suppliedKeys) {
    caveats.push(
      'Labels are the full-input ensemble consensus, not real answer keys. `full` accuracy is inflated by construction and must not be used as a gate.',
    );
    caveats.push(
      'Items without ensemble consensus were dropped. Those skew hard, and hard items are the least passage-blind-guessable, so the measured leakage rates are biased upward and any gate derived from them is too permissive.',
    );
  }
  if (itemsLabelled < 30) {
    caveats.push(
      `Only ${itemsLabelled} items were labelled. Treat every rate here as directional; a stable baseline needs substantially more.`,
    );
  }
  if (rendersWithIncompleteOptions > itemsRecovered) {
    caveats.push(
      `${rendersWithIncompleteOptions} item renders were discarded for having fewer than four readable options, against ${itemsRecovered} kept. The screenshots are a scrolling viewport, so on most frames the fourth option sits below the fold. This, not the missing answer key, is what caps the sample: re-capturing each item with all four options in frame would raise the ceiling far more than supplying keys for what is here.`,
    );
  }

  return {
    generatedAt: new Date().toISOString(),
    labelSource,
    caveats,
    corpus: {
      pagesRead,
      pagesUnusable,
      setsRecovered: selected.length,
      itemsRecovered,
      itemsLabelled,
      itemsDroppedNoConsensus: itemsDropped,
      rendersWithIncompleteOptions,
    },
    solvers: options.solvers.map((s) => s.id),
    permutations,
    byCondition,
    // The gate should read "worse than a real CARS item", so each recommendation sits a
    // margin above the measured reference rate rather than at it.
    recommendedGates: {
      passageBlindMax: margin(accuracyOf('passage-blind')),
      optionsOnlyMax: margin(accuracyOf('options-only')),
      stemBlindMax: margin(accuracyOf('stem-blind')),
    },
  };
}

/**
 * Adds headroom above a measured reference rate. The margin is deliberately generous:
 * with a corpus this small the sampling error on each rate is large, and a gate that
 * rejects authentic-quality items is more costly here than one that admits a weak item,
 * because the deterministic checks and human review still sit downstream.
 */
function margin(measured: number | null): number | null {
  if (measured === null) return null;
  return round(Math.min(0.95, measured + 0.1));
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}
