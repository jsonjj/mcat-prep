import type {
  ChoiceId,
  SignalState,
  SnapshotReport,
  SnapshotResponse,
  SnapshotSignal,
} from '../src/diagnostic/types';

type ErrorFamily =
  | 'REVERSAL'
  | 'FEATURE_SWAP'
  | 'OMISSION'
  | 'OVERREACH'
  | 'CATEGORY'
  | 'MODEL_SELECTION'
  | 'OPERATION'
  | 'REFERENCE_POINT'
  | 'ARITHMETIC'
  | 'DESIGN'
  | 'SEQUENCE';

type PairId = 'ARG-Q' | 'REP-P' | 'QUANT-M' | 'CAUSE' | 'DESIGN' | 'REP-DYN';
type PairState = 'P' | 'M' | 'F';

interface ItemRule {
  sourceCandidateId: string;
  key: ChoiceId;
  pairId: PairId;
  errors: Partial<Record<ChoiceId, ErrorFamily>>;
}

interface PairCopy {
  label: string;
  positive: string;
  mixed: string;
  friction: string;
  drill: string;
}

interface PairOutcome {
  pairId: PairId;
  state: PairState;
  correctCount: number;
  errorFamilies: ErrorFamily[];
}

export class SnapshotInputError extends Error {}

export const SNAPSHOT_ITEM_IDS = [
  'snapshot-q01',
  'snapshot-q02',
  'snapshot-q03',
  'snapshot-q04',
  'snapshot-q05',
  'snapshot-q06',
  'snapshot-q07',
  'snapshot-q08',
  'snapshot-q09',
  'snapshot-q10',
  'snapshot-q11',
  'snapshot-q12',
] as const;

const itemRules: Record<(typeof SNAPSHOT_ITEM_IDS)[number], ItemRule> = {
  'snapshot-q01': {
    sourceCandidateId: 'fast-cars-ca1-museum-label-function',
    key: 'B',
    pairId: 'ARG-Q',
    errors: { A: 'OVERREACH', C: 'CATEGORY', D: 'OVERREACH' },
  },
  'snapshot-q02': {
    sourceCandidateId: 'fast-5each-biochem-r2-inhibitor-lineweaver',
    key: 'C',
    pairId: 'REP-P',
    errors: { A: 'FEATURE_SWAP', B: 'REVERSAL', D: 'FEATURE_SWAP' },
  },
  'snapshot-q03': {
    sourceCandidateId: 'fast-5each-genchem-r2-reaction-coordinate-ea',
    key: 'A',
    pairId: 'QUANT-M',
    errors: { B: 'REFERENCE_POINT', C: 'REFERENCE_POINT', D: 'REFERENCE_POINT' },
  },
  'snapshot-q04': {
    sourceCandidateId: 'fast-5each-biochem-bb1-histidine-ph',
    key: 'C',
    pairId: 'CAUSE',
    errors: { A: 'REVERSAL', B: 'REVERSAL', D: 'OMISSION' },
  },
  'snapshot-q05': {
    sourceCandidateId: 'fast-5each-biochem-r3-rescue-wildtype',
    key: 'D',
    pairId: 'DESIGN',
    errors: { A: 'DESIGN', B: 'DESIGN', C: 'DESIGN' },
  },
  'snapshot-q06': {
    sourceCandidateId: 'fast-5each-biochem-r2-phospho-western',
    key: 'A',
    pairId: 'REP-DYN',
    errors: { B: 'CATEGORY', C: 'FEATURE_SWAP', D: 'OVERREACH' },
  },
  'snapshot-q07': {
    sourceCandidateId: 'fast-cars-ca2-archive-search-policy',
    key: 'C',
    pairId: 'ARG-Q',
    errors: { A: 'OMISSION', B: 'CATEGORY', D: 'CATEGORY' },
  },
  'snapshot-q08': {
    sourceCandidateId: 'fast-5each-biology-r2-antagonist-dose-response',
    key: 'A',
    pairId: 'REP-P',
    errors: { B: 'FEATURE_SWAP', C: 'REVERSAL', D: 'OVERREACH' },
  },
  'snapshot-q09': {
    sourceCandidateId: 'fast-5each-physics-r1-density-buoyancy',
    key: 'B',
    pairId: 'QUANT-M',
    errors: { A: 'OPERATION', C: 'MODEL_SELECTION', D: 'MODEL_SELECTION' },
  },
  'snapshot-q10': {
    sourceCandidateId: 'fast-5each-biology-bb3-baroreceptor-reflex',
    key: 'D',
    pairId: 'CAUSE',
    errors: { A: 'REVERSAL', B: 'REVERSAL', C: 'CATEGORY' },
  },
  'snapshot-q11': {
    sourceCandidateId: 'fast-5each-genchem-r3-initial-rates',
    key: 'B',
    pairId: 'DESIGN',
    errors: { A: 'FEATURE_SWAP', C: 'OMISSION', D: 'OMISSION' },
  },
  'snapshot-q12': {
    sourceCandidateId: 'fast-5each-biochem-r2-pulse-chase-secretion',
    key: 'D',
    pairId: 'REP-DYN',
    errors: { A: 'CATEGORY', B: 'OVERREACH', C: 'SEQUENCE' },
  },
};

const pairOrder: PairId[] = ['ARG-Q', 'REP-P', 'QUANT-M', 'CAUSE', 'DESIGN', 'REP-DYN'];

const pairCopy: Record<PairId, PairCopy> = {
  'ARG-Q': {
    label: 'Qualified argument reasoning',
    positive:
      'Both selected answers preserved the passage’s qualified position—once for an analogy’s function and once for a policy application. That is a limited result from these two questions, not a broad CARS conclusion.',
    mixed:
      'One qualified-argument response matched the keyed interpretation and one did not, so this pair remains mixed.',
    friction:
      'Neither selected answer matched the keyed interpretation in this pair. One useful drill is to state the author’s “not X, not Y, but Z” position before evaluating the choices.',
    drill:
      'State the author’s “not X, not Y, but Z” position before evaluating the answer choices.',
  },
  'REP-P': {
    label: 'Curve and parameter mapping',
    positive:
      'Both selected answers matched the keyed relationship across a transformed plot and a multi-curve comparison. This is a limited result from two questions.',
    mixed:
      'One curve-mapping response matched the keyed relationship and one did not, so this pair remains mixed.',
    friction:
      'Neither selected answer matched the keyed relationship in this pair. Before naming a mechanism, identify each axis, each curve, and any feature that stays unchanged.',
    drill:
      'Before naming a mechanism, identify each axis, each curve, and any feature that stays unchanged.',
  },
  'QUANT-M': {
    label: 'Multi-step quantitative setup',
    positive:
      'Both selected answers matched the keyed result—one local energy barrier and one two-force balance. This is a limited result from two questions.',
    mixed:
      'One quantitative response matched the keyed result and one did not, so this pair cannot separate model choice, reference-point selection, and execution.',
    friction:
      'Neither selected answer matched the keyed result in this pair. Draw the local comparison or force diagram, then make a one-line estimate before calculating.',
    drill:
      'Draw the local comparison or force diagram, then make a one-line estimate before calculating.',
  },
  CAUSE: {
    label: 'Causal direction',
    positive:
      'Both selected answers matched the keyed causal direction, once at a molecular scale and once in a physiological perturbation. This is a limited result from two questions.',
    mixed:
      'One causal-direction response matched the key and one did not, so this pair remains mixed.',
    friction:
      'Neither selected answer matched the keyed causal direction in this pair. A useful drill is to write perturbation → immediate effect → downstream response before checking the choices.',
    drill:
      'Write perturbation → immediate effect → downstream response before checking the choices.',
  },
  DESIGN: {
    label: 'Controls and variable isolation',
    positive:
      'Both selected procedures matched the keyed way to isolate the stated alternative or controlled comparison. This is a limited result from two questions.',
    mixed:
      'One experimental-reasoning response matched the key and one did not, so this pair remains mixed.',
    friction:
      'Neither selected answer matched the key in this pair. Before choosing, name the alternative explanation or the single variable the comparison must isolate.',
    drill: 'Name the alternative explanation or the single variable the comparison must isolate.',
  },
  'REP-DYN': {
    label: 'Assay and time-course evidence',
    positive:
      'Both selected answers matched the keyed interpretation—one from a controlled assay and one from a two-condition time course. This is a limited result from two questions.',
    mixed:
      'One assay or time-course response matched the keyed interpretation and one did not, so this pair remains mixed.',
    friction:
      'Neither selected answer matched the keyed interpretation in this pair. Separate what was measured, what stayed constant, and what changed between conditions or over time.',
    drill:
      'Separate what was measured, what stayed constant, and what changed between conditions or over time.',
  },
};

const familyCopy: Record<ErrorFamily, string> = {
  REVERSAL: 'reversed the direction of a relationship',
  FEATURE_SWAP: 'swapped which feature changed and which stayed constant',
  OMISSION: 'left out a required variable, control, or condition',
  OVERREACH: 'claimed a mechanism more specific than the evidence supports',
  CATEGORY: 'treated the prompt as measuring a different quantity or process',
  MODEL_SELECTION: 'used a relationship that did not match the quantity asked for',
  OPERATION: 'combined the given quantities with an unsupported operation',
  REFERENCE_POINT: 'used the wrong local comparison or reference point',
  ARITHMETIC: 'lost a scale factor or power of ten',
  DESIGN: 'selected a procedure that did not isolate the stated alternative',
  SEQUENCE: 'placed an event in a sequence the data did not support',
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isChoiceId(value: unknown): value is ChoiceId {
  return value === 'A' || value === 'B' || value === 'C' || value === 'D';
}

function parseResponses(input: unknown): SnapshotResponse[] {
  if (!isObject(input) || !Array.isArray(input.responses)) {
    throw new SnapshotInputError('A complete set of snapshot responses is required.');
  }
  if (input.responses.length !== SNAPSHOT_ITEM_IDS.length) {
    throw new SnapshotInputError('Complete all 12 questions before generating the report.');
  }

  const seen = new Set<string>();
  const responses: SnapshotResponse[] = [];

  for (const response of input.responses) {
    if (!isObject(response)) {
      throw new SnapshotInputError('Each response must identify one question and one choice.');
    }
    const questionId = response.questionId;
    const choiceId = response.choiceId;
    if (
      typeof questionId !== 'string' ||
      !SNAPSHOT_ITEM_IDS.includes(questionId as (typeof SNAPSHOT_ITEM_IDS)[number]) ||
      !isChoiceId(choiceId)
    ) {
      throw new SnapshotInputError('A response contains an unknown question or choice.');
    }
    if (seen.has(questionId)) {
      throw new SnapshotInputError('Each question may be answered only once.');
    }
    seen.add(questionId);
    responses.push({ questionId, choiceId });
  }

  for (const questionId of SNAPSHOT_ITEM_IDS) {
    if (!seen.has(questionId)) {
      throw new SnapshotInputError('Complete all 12 questions before generating the report.');
    }
  }

  return responses;
}

function scorePairs(responses: SnapshotResponse[]): Record<PairId, PairOutcome> {
  const responseMap = new Map(
    responses.map((response) => [response.questionId, response.choiceId]),
  );

  return Object.fromEntries(
    pairOrder.map((pairId) => {
      const pairItems = SNAPSHOT_ITEM_IDS.filter((id) => itemRules[id].pairId === pairId);
      const errorFamilies: ErrorFamily[] = [];
      let correctCount = 0;

      for (const itemId of pairItems) {
        const selected = responseMap.get(itemId);
        const rule = itemRules[itemId];
        if (selected === rule.key) {
          correctCount += 1;
        } else if (selected) {
          const family = rule.errors[selected];
          if (family) errorFamilies.push(family);
        }
      }

      const state: PairState = correctCount === 2 ? 'P' : correctCount === 1 ? 'M' : 'F';
      return [pairId, { pairId, state, correctCount, errorFamilies }];
    }),
  ) as Record<PairId, PairOutcome>;
}

function recurringFamilyAcrossSubpairs(
  first: PairOutcome,
  second: PairOutcome,
): ErrorFamily | undefined {
  const counts = new Map<ErrorFamily, number>();
  for (const family of [...first.errorFamilies, ...second.errorFamilies]) {
    counts.set(family, (counts.get(family) ?? 0) + 1);
  }

  return [...counts.entries()]
    .filter(
      ([family, count]) =>
        count >= 3 && first.errorFamilies.includes(family) && second.errorFamilies.includes(family),
    )
    .sort((a, b) => b[1] - a[1])[0]?.[0];
}

function buildPattern(pairs: Record<PairId, PairOutcome>): SnapshotReport['repeatedPattern'] {
  const parameterPair = pairs['REP-P'];
  const dynamicPair = pairs['REP-DYN'];
  const combinedCorrect = parameterPair.correctCount + dynamicPair.correctCount;
  const states = `${parameterPair.state}+${dynamicPair.state}`;

  if (states === 'P+P') {
    return {
      kind: 'positive',
      title: 'A repeated signal in the four-item data check',
      body: 'All four selected answers matched the keyed relationship across both data subpairs. That is a provisional repeated signal within this narrow set—not evidence of broad data-analysis mastery.',
    };
  }

  const recurringFamily = recurringFamilyAcrossSubpairs(parameterPair, dynamicPair);
  if (recurringFamily) {
    return {
      kind: 'friction',
      title: 'A repeated answer feature worth retesting',
      body: `${4 - combinedCorrect} of the four data responses did not match the key, and at least three selected choices across both subpairs ${familyCopy[recurringFamily]}. This describes what the choices had in common, not why they were selected.`,
    };
  }

  if (states === 'P+M' || states === 'M+P') {
    return {
      kind: 'none',
      title: 'Three matches, but not one complete repeated signal',
      body: 'Three of four selected answers matched the key, but one data subpair was mixed. Keep the positive evidence and retest the mixed pair before naming a stable pattern.',
    };
  }

  if (states === 'P+F' || states === 'F+P') {
    return {
      kind: 'none',
      title: 'The two data subpairs pointed in different directions',
      body: 'One data subpair had two keyed matches and the other had none, so this snapshot does not support one repeated data-answer pattern.',
    };
  }

  if (states === 'M+M') {
    return {
      kind: 'none',
      title: 'No repeated pattern was clear enough to name',
      body: 'Each data subpair had one keyed match and one nonmatch. The selected answers did not provide enough replication to name one pattern.',
    };
  }

  if (states === 'F+F') {
    return {
      kind: 'none',
      title: 'No keyed matches in the four-item data check—but no single repeated feature',
      body: 'None of the four selected answers matched the key, but the non-keyed choices did not repeat one answer feature strongly enough across both subpairs. The report keeps both drill areas visible instead of inventing one cause.',
    };
  }

  return {
    kind: 'none',
    title: 'No repeated pattern was clear enough to name',
    body: 'One data subpair was mixed and the other had no keyed matches, but the non-keyed choices did not repeat one answer feature strongly enough across both subpairs.',
  };
}

function signalState(state: PairState): SignalState {
  if (state === 'P') return 'limited-positive';
  if (state === 'M') return 'mixed';
  return 'drill-target';
}

function selectionDetail(outcome: PairOutcome): string {
  const firstFamily = outcome.errorFamilies[0];
  if (!firstFamily) return '';
  const secondFamily = outcome.errorFamilies[1];
  if (!secondFamily) {
    return ` The non-keyed choice ${familyCopy[firstFamily]}. That describes the answer feature, not why it was selected.`;
  }
  if (firstFamily === secondFamily) {
    return ` Both non-keyed choices ${familyCopy[firstFamily]}. That is a paired answer pattern, not a diagnosis of its cause.`;
  }
  return ' The two non-keyed choices reflected different answer features, so this pair does not identify one recurring issue.';
}

function buildSignal(outcome: PairOutcome): SnapshotSignal {
  const copy = pairCopy[outcome.pairId];
  const state = signalState(outcome.state);
  const title =
    state === 'limited-positive'
      ? 'Limited positive signal'
      : state === 'mixed'
        ? 'Mixed in this snapshot'
        : 'A drill worth testing';
  const baseBody =
    outcome.state === 'P' ? copy.positive : outcome.state === 'M' ? copy.mixed : copy.friction;

  return {
    id: outcome.pairId,
    label: copy.label,
    state,
    title,
    body: `${baseBody}${selectionDetail(outcome)}`,
  };
}

function buildNextDrill(
  pattern: SnapshotReport['repeatedPattern'],
  pairs: Record<PairId, PairOutcome>,
): SnapshotReport['nextDrill'] {
  if (pattern.kind === 'friction') {
    return {
      title: 'Make the evidence structure explicit',
      body: 'Try three representation questions. Before answering, write down each axis or condition, what changed, what stayed constant, and the strongest conclusion the evidence supports.',
    };
  }

  const frictionPairs = pairOrder.filter((pairId) => pairs[pairId].state === 'F');
  if (frictionPairs.length > 1) {
    const labels = frictionPairs.map((pairId) => pairCopy[pairId].label.toLowerCase()).join(', ');
    return {
      title: 'Choose one of several tied retest areas',
      body: `Several pairs had no keyed matches: ${labels}. Pick the one that felt least certain and try three more questions of that type; the Snapshot does not rank these tied options.`,
    };
  }
  const frictionPair = frictionPairs[0];
  if (frictionPair) {
    return {
      title: `Retest ${pairCopy[frictionPair].label.toLowerCase()}`,
      body: `Try three more questions of this type. ${pairCopy[frictionPair].drill}`,
    };
  }

  const mixedPairs = pairOrder.filter((pairId) => pairs[pairId].state === 'M');
  if (mixedPairs.length > 1) {
    const labels = mixedPairs.map((pairId) => pairCopy[pairId].label.toLowerCase()).join(', ');
    return {
      title: 'Gather one more round of evidence',
      body: `Several pairs were mixed: ${labels}. Choose the one that felt least certain and try three more questions of that type; this short set does not rank the tied options.`,
    };
  }
  const mixedPair = mixedPairs[0];
  if (mixedPair) {
    return {
      title: `Retest ${pairCopy[mixedPair].label.toLowerCase()}`,
      body: `This pair was mixed. Try three more questions of this type. ${pairCopy[mixedPair].drill}`,
    };
  }

  if (pattern.kind === 'positive') {
    return {
      title: 'Check whether the signal transfers',
      body: 'Try three harder data questions in unfamiliar formats. Keep the evidence structure explicit and see whether the same result holds without the familiar displays.',
    };
  }

  return {
    title: 'Add a harder transfer check',
    body: 'Try three questions in a less familiar format and see whether the same approach still works.',
  };
}

export function scoreSnapshot(input: unknown): SnapshotReport {
  const responses = parseResponses(input);
  const pairs = scorePairs(responses);
  const repeatedPattern = buildPattern(pairs);

  return {
    version: 'snapshot-pilot-v2',
    repeatedPattern,
    pairedSignals: pairOrder.map((pairId) => buildSignal(pairs[pairId])),
    unknowns: [
      'Psychology and sociology content',
      'Sustained work across a full passage set',
      'Timing endurance and section pacing',
      'Broad MCAT content coverage',
      'How these signals compare with a longer diagnostic',
      'Whether any miss reflected content knowledge, reasoning, guessing, or a one-off slip',
    ],
    nextDrill: buildNextDrill(repeatedPattern, pairs),
    disclaimer:
      'Use this as a starting point for one short drill, not as a score, readiness judgment, or verdict about your ability.',
  };
}
