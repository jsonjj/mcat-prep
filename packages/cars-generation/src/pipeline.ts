/**
 * The generation pipeline.
 *
 * Stage order is deliberate and follows one principle: everything deterministic and
 * cheap runs before anything that costs a model call, and every human touch sits where
 * it has the most leverage.
 *
 *   0. Refuse to run from an unapproved blueprint.
 *   1. Generate the passage, then measure it and resample. Measurement, not prompting,
 *      is the control — asking a model to hit a complexity target succeeds about 5% of
 *      the time, while generate-measure-resample is the method with published success.
 *   2. Originality battery. Cheapest check, unrecoverable failure, so it runs early.
 *   3. Generate items from the item models, with distractors specified rather than left
 *      to the model.
 *   4. Deterministic flaw audit. Auto-reject; regeneration is free.
 *   5. Solver ablation battery under option permutation. Routes to review.
 *   6. Exactly-one-defensible-key adjudication. Routes to review.
 *
 * Stages 5 and 6 need a heterogeneous solver ensemble that excludes the generating
 * model. Without one the pipeline still runs and still reports, but it records that the
 * checks did not execute rather than silently passing — an unrun check and a passed
 * check are different states and conflating them is how a harness becomes decorative.
 */

import { type AiChat } from '@mcat/ai-gateway';
import {
  PassageSetBlueprintSchema,
  deriveSkill,
  type ItemModel,
  type PassageSetBlueprint,
} from './blueprint';
import { runDeterministicChecks } from './checks/deterministic';
import { checkOriginality, type OriginalityOptions, type ReferenceDocument } from './checks/originality';
import {
  runSolverBattery,
  type AblationCondition,
  type NamedSolver,
  type SolverBatteryResult,
} from './checks/solver';
import { verdict, type CheckReport, type CheckResult } from './checks/report';
import {
  buildAdjudicationPrompt,
  buildItemPrompt,
  buildPassagePrompt,
  extractJson,
} from './prompts';
import {
  GeneratedItemSchema,
  GeneratedPassageSchema,
  GeneratedPassageSetSchema,
  passageWordCount,
  type GeneratedItem,
  type GeneratedPassage,
  type GeneratedPassageSet,
} from './schema';
import { auditPassage } from './checks/deterministic';

export const PIPELINE_VERSION = 'cars-gen-provisional-v1';

export interface GenerateOptions {
  /** The model that writes passages and items. Never also a solver. */
  readonly generator: AiChat;
  readonly generatorModelId: string;
  /** Heterogeneous ensemble for key verification and the ablations. */
  readonly solvers?: readonly NamedSolver[];
  /**
   * Ablation grid. Defaults to every condition at four rotations, which costs
   * `items × conditions × rotations × solvers` sequential provider calls — 200 for a
   * five-item set on two solvers. Narrowing it trades leakage coverage for cost, so the
   * report records what actually ran rather than implying the full grid.
   */
  readonly solverConditions?: readonly AblationCondition[];
  readonly solverPermutations?: number;
  /** Independent critic for the defensibility adjudication. Must not be the generator. */
  readonly adjudicator?: AiChat;
  readonly referenceCorpus?: readonly ReferenceDocument[];
  readonly originality?: OriginalityOptions;
  /** Bounded resampling for the passage-shape loop. */
  readonly maxPassageAttempts?: number;
  readonly temperature?: number;
  /** Injected for deterministic tests. */
  readonly now?: () => Date;
  readonly idSuffix?: () => string;
}

export interface GenerationResult {
  readonly set: GeneratedPassageSet;
  readonly report: CheckReport;
  readonly verdict: 'accept' | 'review' | 'reject';
  readonly solver?: SolverBatteryResult;
  /** How many passage attempts the shape loop consumed. */
  readonly passageAttempts: number;
}

/** Thrown when generation cannot produce a schema-valid artefact at all. */
export class GenerationFailedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GenerationFailedError';
  }
}

export async function generatePassageSet(
  blueprintInput: PassageSetBlueprint,
  options: GenerateOptions,
): Promise<GenerationResult> {
  const blueprint = PassageSetBlueprintSchema.parse(blueprintInput);
  const now = options.now ?? (() => new Date());
  const suffix = options.idSuffix ?? (() => Math.random().toString(36).slice(2, 8));

  // Stage 0. Upstream approval is the control the evidence actually supports, so it is
  // a precondition rather than a warning.
  if (!blueprint.approvedBy) {
    throw new GenerationFailedError(
      'blueprint is not approved; a human must approve the blueprint before items are generated from it',
    );
  }

  const results: CheckResult[] = [];

  // Stage 1. Generate the passage, measure it, resample on failure.
  const maxAttempts = options.maxPassageAttempts ?? 3;
  let passage: GeneratedPassage | null = null;
  let attempts = 0;
  let lastShapeFailures: readonly CheckResult[] = [];

  while (attempts < maxAttempts && passage === null) {
    attempts += 1;
    const candidate = await generatePassage(blueprint, options, suffix);
    // Shape is measured on the artefact, never trusted from the prompt.
    const shape = auditPassage({
      passage: candidate,
      items: [],
      provenance: {
        model: options.generatorModelId,
        generatedAt: now().toISOString(),
        pipelineVersion: PIPELINE_VERSION,
      },
    } as GeneratedPassageSet);
    const blocking = shape.filter((r) => !r.passed && r.severity === 'reject');
    if (blocking.length === 0) {
      passage = candidate;
    } else {
      lastShapeFailures = blocking;
    }
  }

  if (!passage) {
    throw new GenerationFailedError(
      `passage failed shape gates after ${attempts} attempts: ${lastShapeFailures
        .map((f) => `${f.id} (${f.detail})`)
        .join('; ')}`,
    );
  }

  results.push({
    id: 'passage-resampling',
    severity: 'info',
    passed: true,
    detail: `passage accepted on attempt ${attempts} of ${maxAttempts} (${passageWordCount(passage)} words)`,
    score: attempts,
  });

  // Stage 2. Originality, before any further spend.
  results.push(
    ...(await checkOriginality(
      passage.paragraphs.join('\n\n'),
      options.referenceCorpus ?? [],
      options.originality ?? {},
    )),
  );

  // Stage 3. Items, one per item model.
  const items: GeneratedItem[] = [];
  for (const model of blueprint.items) {
    const item = await generateItem(model, passage, options, suffix);
    items.push(item);
  }

  const set = GeneratedPassageSetSchema.parse({
    passage,
    items,
    provenance: {
      model: options.generatorModelId,
      generatedAt: now().toISOString(),
      pipelineVersion: PIPELINE_VERSION,
    },
  });

  // Stage 4. Deterministic audit.
  results.push(...runDeterministicChecks(set));

  // Stage 5. Solver ablations.
  let solver: SolverBatteryResult | undefined;
  if (options.solvers && options.solvers.length > 0) {
    solver = await runSolverBattery(set, {
      solvers: options.solvers,
      generatingModelId: options.generatorModelId,
      ...(options.solverConditions ? { conditions: options.solverConditions } : {}),
      ...(options.solverPermutations === undefined
        ? {}
        : { permutations: options.solverPermutations }),
    });
    results.push(...solver.results);
  } else {
    results.push({
      id: 'solver-ensemble-present',
      severity: 'review',
      passed: false,
      detail:
        'no solver ensemble configured, so key verification and passage-blind leakage were not tested',
    });
  }

  // Stage 6. Defensibility adjudication.
  if (options.adjudicator) {
    for (const item of set.items) {
      results.push(await adjudicate(item, passage, options.adjudicator));
    }
  } else {
    results.push({
      id: 'adjudication-present',
      severity: 'review',
      passed: false,
      detail: 'no adjudicator configured, so single-defensible-key was not verified',
    });
  }

  const report: CheckReport = { results };
  return {
    set,
    report,
    verdict: verdict(report),
    ...(solver ? { solver } : {}),
    passageAttempts: attempts,
  };
}

async function generatePassage(
  blueprint: PassageSetBlueprint,
  options: GenerateOptions,
  suffix: () => string,
): Promise<GeneratedPassage> {
  const response = await options.generator.chat({
    messages: buildPassagePrompt(blueprint.passage),
    temperature: options.temperature ?? 0.8,
    maxOutputTokens: 2000,
  });
  const raw = extractJson(response.text) as Record<string, unknown>;
  return GeneratedPassageSchema.parse({
    id: `${blueprint.passage.id}-p-${suffix()}`,
    blueprintId: blueprint.passage.id,
    title: raw.title,
    paragraphs: raw.paragraphs,
  });
}

async function generateItem(
  model: ItemModel,
  passage: GeneratedPassage,
  options: GenerateOptions,
  suffix: () => string,
): Promise<GeneratedItem> {
  const response = await options.generator.chat({
    messages: buildItemPrompt(model, passage),
    temperature: options.temperature ?? 0.7,
    maxOutputTokens: 1200,
  });
  const raw = extractJson(response.text) as Record<string, unknown>;

  return GeneratedItemSchema.parse({
    id: `${model.id}-i-${suffix()}`,
    itemModelId: model.id,
    // The item model is the family: siblings generated from it inherit calibration, and
    // that inheritance is only available if the family is recorded at generation time.
    familyId: model.id,
    archetype: model.archetype,
    // Derived, never taken from the model's own claim: the skill category follows from
    // retrieval scope, and a generator asked to self-label will label from stem wording.
    skill: deriveSkill(model),
    stem: raw.stem,
    choices: raw.choices,
    correctChoice: raw.correctChoice,
    rationales: raw.rationales,
    evidenceQuotes: raw.evidenceQuotes,
  });
}

async function adjudicate(
  item: GeneratedItem,
  passage: GeneratedPassage,
  adjudicator: AiChat,
): Promise<CheckResult> {
  try {
    const response = await adjudicator.chat({
      messages: buildAdjudicationPrompt(item, passage),
      temperature: 0,
      maxOutputTokens: 1500,
    });
    const raw = extractJson(response.text) as {
      defensibleLabels?: unknown;
      verdict?: unknown;
      notes?: unknown;
    };
    const labels = Array.isArray(raw.defensibleLabels) ? raw.defensibleLabels.map(String) : [];
    const single = labels.length === 1 && labels[0] === item.correctChoice;
    return {
      id: 'adjudication-single-defensible',
      severity: 'review',
      passed: single,
      detail: single
        ? 'exactly one defensible option, matching the authored key'
        : `adjudicator found defensible options [${labels.join(', ')}] against authored key ${item.correctChoice}${
            typeof raw.notes === 'string' && raw.notes ? ` — ${raw.notes}` : ''
          }`,
      score: labels.length,
      threshold: 1,
      itemId: item.id,
    };
  } catch (error) {
    return {
      id: 'adjudication-single-defensible',
      severity: 'review',
      passed: false,
      detail: `adjudication failed: ${error instanceof Error ? error.message : String(error)}`,
      itemId: item.id,
    };
  }
}
