/**
 * The solver-ablation battery.
 *
 * This is the highest-value part of the harness, and the reasoning behind it is worth
 * stating because it is counterintuitive.
 *
 * A strong model scores at roughly the 99th percentile on this section. That makes it a
 * **bad difficulty estimator** — it has almost no discriminating range left — and an
 * **excellent key verifier**: when a near-ceiling ensemble disagrees with the authored
 * key, the prior should be that the key is wrong, not that the item is hard. The
 * ensemble is therefore used for validity and never for calibration.
 *
 * The ablations exploit the same property in reverse. If a solver can answer with the
 * passage removed, the item is answerable from world knowledge, which is precisely what
 * the section's no-outside-knowledge rule forbids. On a comparable four-option corpus a
 * passage-deleted solver reached 51.5% and an options-only solver 45.3%, against 25%
 * chance — so this failure mode is large, real, and exactly what an LLM generator
 * produces when it writes keys that are true *of the topic* rather than true *of the
 * passage*.
 *
 * Every condition runs under option permutation. This is mandatory, not defensive:
 * selection bias in LLM solvers is severe and driven by the option-ID tokens
 * themselves, an answer-moving attack shifted one model 15 points on a comparable
 * benchmark, and neither debiasing instructions nor chain-of-thought fix it. A
 * single-ordering solver result is not trustworthy.
 *
 * Two operational rules follow from the evidence and are enforced by the types here:
 * the ensemble must be heterogeneous, and the generating model must never be one of its
 * members — a self-preferring judge approves its own output.
 */

import { type AiChat } from '@mcat/ai-gateway';
import { SOLVER_GATES } from '../calibration';
import { CHOICE_LABELS, type ChoiceLabel, type GeneratedPassageSet } from '../schema';
import { type CheckResult } from './report';

/** One member of the ensemble. `id` is recorded so per-model behaviour can be audited. */
export interface NamedSolver {
  readonly id: string;
  readonly chat: AiChat;
}

/** The four ablation conditions plus the truncated-stem probe. */
export type AblationCondition =
  /** Passage, stem, options. Verifies the key. */
  | 'full'
  /** Stem and options only. Detects world-knowledge answerability. */
  | 'passage-blind'
  /** Passage and options, no stem. Detects option-set artifacts. */
  | 'stem-blind'
  /** Options alone. The strictest ablation. */
  | 'options-only'
  /** First two words of the stem plus options. */
  | 'stem-truncated';

export const ABLATION_CONDITIONS: readonly AblationCondition[] = [
  'full',
  'passage-blind',
  'stem-blind',
  'options-only',
  'stem-truncated',
];

export interface SolverBatteryOptions {
  readonly solvers: readonly NamedSolver[];
  /** Cyclic rotations of the option order. 4 covers every position for the key. */
  readonly permutations?: number;
  readonly conditions?: readonly AblationCondition[];
  /** Identifier of the model that generated the content, to enforce independence. */
  readonly generatingModelId?: string;
}

/**
 * The minimum an item needs to be run through the ablations.
 *
 * Deliberately narrower than `GeneratedItem`: calibrating the gates requires measuring
 * *reference* items, which have no rationales, no distractor families, and no evidence
 * quotes. Keeping the solver core on this shape lets the same code measure generated and
 * reference items, which is the point — a baseline measured with different prompts than
 * the live gate would not be a baseline.
 */
export interface SolvableItem {
  readonly id: string;
  readonly stem: string;
  readonly choices: readonly { readonly label: ChoiceLabel; readonly text: string }[];
  /**
   * The reference label. For generated items this is the authored key. For reference
   * items it is either a supplied key or a consensus proxy — see `calibrate` in the CLI,
   * which records which of the two was used.
   */
  readonly correctChoice: ChoiceLabel;
}

export interface AblationMeasurement {
  readonly trials: readonly SolverTrial[];
  readonly byCondition: readonly ConditionSummary[];
}

/** A single solver trial. Retained individually so aggregates can be recomputed. */
export interface SolverTrial {
  readonly itemId: string;
  readonly solverId: string;
  readonly condition: AblationCondition;
  readonly rotation: number;
  /** Which label the solver picked, after un-rotating back to the original order. */
  readonly picked: ChoiceLabel | null;
  readonly correct: boolean;
}

export interface ConditionSummary {
  readonly condition: AblationCondition;
  readonly trials: number;
  readonly accuracy: number;
}

export interface SolverBatteryResult {
  readonly trials: readonly SolverTrial[];
  readonly byCondition: readonly ConditionSummary[];
  readonly results: readonly CheckResult[];
}

/** Rotates options by `n` positions, relabelling A-D in the new order. */
function rotate(
  choices: readonly { label: ChoiceLabel; text: string }[],
  n: number,
): { presented: { label: ChoiceLabel; text: string }[]; originalOf: Map<ChoiceLabel, ChoiceLabel> } {
  const size = choices.length;
  const presented: { label: ChoiceLabel; text: string }[] = [];
  const originalOf = new Map<ChoiceLabel, ChoiceLabel>();
  for (let i = 0; i < size; i += 1) {
    const source = choices[(i + n) % size];
    if (!source) continue;
    const newLabel = CHOICE_LABELS[i];
    if (!newLabel) continue;
    presented.push({ label: newLabel, text: source.text });
    originalOf.set(newLabel, source.label);
  }
  return { presented, originalOf };
}

function renderOptions(choices: readonly { label: ChoiceLabel; text: string }[]): string {
  return choices.map((c) => `${c.label}. ${c.text}`).join('\n');
}

const SOLVER_SYSTEM =
  'You are answering a multiple-choice reading-comprehension question. Reply with exactly one character: A, B, C, or D. No explanation, no punctuation.';

/**
 * Builds the prompt for one condition. Each ablation removes exactly one kind of
 * information, so a score above chance localises where the leak is.
 */
function buildPrompt(
  item: SolvableItem,
  passage: string,
  presented: readonly { label: ChoiceLabel; text: string }[],
  condition: AblationCondition,
): string {
  const options = renderOptions(presented);
  switch (condition) {
    case 'full':
      return `Passage:\n${passage}\n\nQuestion: ${item.stem}\n\n${options}`;
    case 'passage-blind':
      return `Question: ${item.stem}\n\n${options}`;
    case 'stem-blind':
      return `Passage:\n${passage}\n\nSelect the option that is best supported by the passage.\n\n${options}`;
    case 'options-only':
      return `Select the option most likely to be the credited answer.\n\n${options}`;
    case 'stem-truncated': {
      const opening = item.stem.split(/\s+/).slice(0, 2).join(' ');
      return `Question begins: "${opening}..."\n\n${options}`;
    }
  }
}

function parseChoice(text: string): ChoiceLabel | null {
  const match = /\b([ABCD])\b/.exec(text.trim().toUpperCase());
  const label = match?.[1];
  return label === 'A' || label === 'B' || label === 'C' || label === 'D' ? label : null;
}

/**
 * Runs the ablation grid over arbitrary solvable items. This is the shared measurement
 * core: the live gate and the calibration baseline must run identical prompts under
 * identical permutation, or the baseline says nothing about the gate.
 */
export async function measureAblations(
  passage: string,
  items: readonly SolvableItem[],
  options: {
    readonly solvers: readonly NamedSolver[];
    readonly permutations?: number;
    readonly conditions?: readonly AblationCondition[];
  },
): Promise<AblationMeasurement> {
  const permutations = options.permutations ?? 4;
  const conditions = options.conditions ?? ABLATION_CONDITIONS;
  const trials: SolverTrial[] = [];

  for (const item of items) {
    for (const condition of conditions) {
      for (let rotation = 0; rotation < permutations; rotation += 1) {
        const { presented, originalOf } = rotate(item.choices, rotation);
        const prompt = buildPrompt(item, passage, presented, condition);
        for (const solver of options.solvers) {
          let picked: ChoiceLabel | null = null;
          try {
            const response = await solver.chat.chat({
              messages: [
                { role: 'system', content: SOLVER_SYSTEM },
                { role: 'user', content: prompt },
              ],
              temperature: 0,
              maxOutputTokens: 4,
            });
            const presentedLabel = parseChoice(response.text);
            picked = presentedLabel ? (originalOf.get(presentedLabel) ?? null) : null;
          } catch {
            picked = null;
          }
          trials.push({
            itemId: item.id,
            solverId: solver.id,
            condition,
            rotation,
            picked,
            correct: picked === item.correctChoice,
          });
        }
      }
    }
  }

  return { trials, byCondition: summarizeConditions(trials, conditions) };
}

function summarizeConditions(
  trials: readonly SolverTrial[],
  conditions: readonly AblationCondition[],
): ConditionSummary[] {
  return conditions.map((condition) => {
    const relevant = trials.filter((t) => t.condition === condition);
    const correct = relevant.filter((t) => t.correct).length;
    return {
      condition,
      trials: relevant.length,
      accuracy: relevant.length === 0 ? 0 : correct / relevant.length,
    };
  });
}

/**
 * Majority pick across all solvers and rotations for one item under one condition.
 *
 * Used to derive a proxy reference label when no answer key is available. Returns null
 * when no option reaches `minShare`, which matters: an item on which the ensemble has no
 * consensus carries no usable label and must be excluded rather than guessed at.
 */
export function consensusPick(
  trials: readonly SolverTrial[],
  itemId: string,
  condition: AblationCondition,
  minShare = 0.5,
): { label: ChoiceLabel; share: number } | null {
  const relevant = trials.filter(
    (t) => t.itemId === itemId && t.condition === condition && t.picked !== null,
  );
  if (relevant.length === 0) return null;
  const counts = new Map<ChoiceLabel, number>();
  for (const trial of relevant) {
    if (trial.picked) counts.set(trial.picked, (counts.get(trial.picked) ?? 0) + 1);
  }
  let best: ChoiceLabel | null = null;
  let bestCount = 0;
  for (const [label, count] of counts) {
    if (count > bestCount) {
      best = label;
      bestCount = count;
    }
  }
  if (!best) return null;
  const share = bestCount / relevant.length;
  return share >= minShare ? { label: best, share } : null;
}

export async function runSolverBattery(
  set: GeneratedPassageSet,
  options: SolverBatteryOptions,
): Promise<SolverBatteryResult> {
  const { solvers, generatingModelId } = options;
  if (solvers.length === 0) {
    return {
      trials: [],
      byCondition: [],
      results: [
        {
          id: 'solver-ensemble-present',
          severity: 'review',
          passed: false,
          detail: 'no solvers supplied, so key verification and leakage checks did not run',
        },
      ],
    };
  }

  const independence: CheckResult[] = [];
  if (generatingModelId && solvers.some((s) => s.id === generatingModelId)) {
    // Enforced rather than advised: self-preference bias is well attested, and an
    // ensemble containing the generator will approve its own defects.
    independence.push({
      id: 'solver-independence',
      severity: 'reject',
      passed: false,
      detail: `the generating model ${generatingModelId} is also acting as a solver`,
    });
  }

  const conditions = options.conditions ?? ABLATION_CONDITIONS;
  const { trials, byCondition } = await measureAblations(
    set.passage.paragraphs.join('\n\n'),
    set.items,
    {
      solvers,
      ...(options.permutations === undefined ? {} : { permutations: options.permutations }),
      conditions,
    },
  );

  return {
    trials,
    byCondition,
    results: [...independence, ...gateConditions(byCondition), ...perItemKeyChecks(set, trials)],
  };
}

function accuracyOf(summaries: readonly ConditionSummary[], condition: AblationCondition): number | null {
  const found = summaries.find((s) => s.condition === condition);
  return found && found.trials > 0 ? found.accuracy : null;
}

function gateConditions(summaries: readonly ConditionSummary[]): CheckResult[] {
  const results: CheckResult[] = [];

  const full = accuracyOf(summaries, 'full');
  if (full !== null) {
    results.push({
      id: 'solver-key-agreement',
      severity: 'review',
      passed: full >= SOLVER_GATES.fullInputAgreementMin,
      detail: `ensemble agreed with the authored key on ${(full * 100).toFixed(1)}% of full-input trials`,
      score: full,
      threshold: SOLVER_GATES.fullInputAgreementMin,
    });
  }

  const gates: readonly [AblationCondition, number, string][] = [
    ['passage-blind', SOLVER_GATES.passageBlindMax, 'answerable without the passage'],
    ['options-only', SOLVER_GATES.optionsOnlyMax, 'answerable from the option set alone'],
    ['stem-blind', SOLVER_GATES.stemBlindMax, 'answerable without the question'],
    ['stem-truncated', SOLVER_GATES.passageBlindMax, 'answerable from a two-word stem fragment'],
  ];

  for (const [condition, threshold, description] of gates) {
    const accuracy = accuracyOf(summaries, condition);
    if (accuracy === null) continue;
    results.push({
      id: `solver-${condition}`,
      severity: 'review',
      passed: accuracy <= threshold,
      detail: `${(accuracy * 100).toFixed(1)}% accuracy with information withheld (chance ${(SOLVER_GATES.chanceRate * 100).toFixed(0)}%) — ${description}`,
      score: accuracy,
      threshold,
    });
  }

  return results;
}

/**
 * Per-item key verification. Aggregate accuracy hides the case that matters most: one
 * item on which the whole ensemble disagrees with the key. That item is very likely
 * mis-keyed and must reach a human regardless of how the batch scored.
 */
function perItemKeyChecks(
  set: GeneratedPassageSet,
  trials: readonly SolverTrial[],
): CheckResult[] {
  return set.items.map((item) => {
    const relevant = trials.filter((t) => t.itemId === item.id && t.condition === 'full');
    if (relevant.length === 0) {
      return {
        id: 'solver-item-key-agreement',
        severity: 'info',
        passed: true,
        detail: 'no full-input trials recorded',
        itemId: item.id,
      };
    }
    const agreement = relevant.filter((t) => t.correct).length / relevant.length;
    return {
      id: 'solver-item-key-agreement',
      severity: 'review',
      passed: agreement >= SOLVER_GATES.fullInputAgreementMin,
      detail: `ensemble picked the authored key on ${(agreement * 100).toFixed(1)}% of trials`,
      score: agreement,
      threshold: SOLVER_GATES.fullInputAgreementMin,
      itemId: item.id,
    };
  });
}

/**
 * Distribution of a solver's picks across positions, ignoring correctness. Reported as
 * an instrument diagnostic rather than an item property: a solver that answers "C" most
 * of the time regardless of content is not measuring the item, and its ablation numbers
 * should be discounted.
 */
export function solverPositionBias(trials: readonly SolverTrial[], solverId: string): number {
  const relevant = trials.filter((t) => t.solverId === solverId && t.picked !== null);
  if (relevant.length === 0) return 0;
  const counts = new Map<ChoiceLabel, number>();
  for (const trial of relevant) {
    if (trial.picked) counts.set(trial.picked, (counts.get(trial.picked) ?? 0) + 1);
  }
  const maxShare = Math.max(...counts.values()) / relevant.length;
  // 0 when picks are uniform across four positions, 1 when entirely concentrated.
  return (maxShare - 0.25) / 0.75;
}
