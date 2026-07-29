import type { MasterySeed, Section } from '@mcat/contracts';
import { orderedKcsForLesson } from '@mcat/content';
import {
  assembleMstStages,
  computeBayesResult,
  contentionFromResponses,
  contentionSlots,
  FC_AXIS,
  indexAxis,
  kcSeedsFromDiagnostic,
  kcsByFc,
  masterySeedFromUnitSeeds,
  MST_140_RECOMMENDED,
  MST_DESIGNS,
  planMstForm,
  routeFromScore,
  type AssembledStage,
  type DiagnosticClassification,
  type DiagnosticRecommendation,
  type DiagnosticState,
  type FormItem,
  type MstDesign,
} from '@mcat/policies';
import type { DiagnosticBank, DiagnosticItemView } from './diagnostic-bank';
import type { ScoredResponse, SessionRecord } from './diagnostic-session-store';

/**
 * Pure orchestration over the multistage policy: derive the route from the
 * event-sourced responses, replay the form to recover the block the learner is
 * on, and — on completion — compute the diagnostic decision envelope. No I/O,
 * no crypto.
 */

/**
 * What the diagnostic measures and reports on: the 10 AAMC Foundational
 * Concepts.
 *
 * Everything learner-facing about a bucket — its name, its "what this covers"
 * line, its leverage — comes from the axis rather than from the cluster tables,
 * so this constant is the whole of the reporting-partition decision. Two
 * consequences are deliberate and accepted: the reasoning and CARS bank is out
 * of scope here (it is handled elsewhere in the product), and FC leverage is
 * nearly flat, so the reported ordering is driven by severity rather than by
 * unlock weight.
 */
const DIAGNOSTIC_AXIS = FC_AXIS;
const AXIS_BY_ID = indexAxis(DIAGNOSTIC_AXIS);

export { REPORTED_PRIORITY_COUNT } from '@mcat/policies';

/** Learner-facing priority (no numeric confidence — the plan forbids fake precision). */
export interface PriorityView {
  /** Axis bucket id — a Foundational Concept, not a skill cluster. */
  cluster: string;
  title: string;
  tested: string;
  recommendation: DiagnosticRecommendation;
}

export interface ClusterSignalView {
  cluster: string;
  title: string;
  section: Section;
  classification: DiagnosticClassification;
  recommendation: DiagnosticRecommendation;
  /**
   * Gap read in [0,1] and how far to trust it, for the results readout.
   *
   * These are the same numbers the ranking is computed from, so surfacing them
   * tells the learner nothing the ordered priority list does not already imply.
   * `correct` deliberately stays behind: a per-concept score against a known
   * item count is the closest thing the form has to an answer oracle.
   */
  gap: number;
  certainty: number;
  itemsSeen: number;
}

/** The result surfaced to the client: recommendations + word label, never a score. */
export interface DiagnosticResultView {
  confidenceLabel: 'High' | 'Medium' | 'Still building';
  /** At most `REPORTED_PRIORITY_COUNT` areas to start with. */
  topPriorities: PriorityView[];
  stillConfirming: { cluster: string; title: string }[];
  perCluster: ClusterSignalView[];
  itemsScored: number;
  /**
   * Opening BKT priors for the lessons under each measured concept, for the
   * client to hand to the authority.
   *
   * Emitted here because the diagnostic service and the authority are separate
   * surfaces; the authority re-clamps everything it is given, so a tampered seed
   * can still only move a learner's starting point inside the seeding bounds and
   * can never touch a unit they have already practised.
   */
  masterySeed: MasterySeed;
}

export interface DiagnosticBlockView {
  done: boolean;
  progress: number;
  itemsScored: number;
  /**
   * Length of the whole form. Known up front because delivery is multistage
   * rather than adaptively stopped, which is the difference the learner actually
   * feels: they can be told how long this will take before they start.
   */
  totalItems: number;
  /**
   * Identity of the open stage, stable across every re-serve of it. Derived from
   * the route taken, which is itself derived from the committed responses, so a
   * refresh mid-block returns the same id rather than looking like a new stage.
   */
  stageId: string | null;
  /** 1-based, so the learner can be told which block of how many. Zero once the form is done. */
  stageNumber: number;
  stageCount: number;
  /**
   * Items committed in prior stages. The client numbers the open block from
   * `itemsCommitted + 1` so question numbers run continuously across stages.
   */
  itemsCommitted: number;
  /** The whole open stage, in delivery order. Empty once the form is done. */
  questions: DiagnosticItemView[];
  result: DiagnosticResultView | null;
}

const seenIds = (record: SessionRecord): Set<string> => {
  const seen = new Set<string>(record.responses.map((r) => r.questionId));
  for (const id of record.pendingBlock?.questionIds ?? []) seen.add(id);
  return seen;
};

/** Rebuild the deterministic selection state from the response log. */
export function deriveState(record: SessionRecord): DiagnosticState {
  const familiesByCluster: Record<string, Set<string>> = {};
  const itemsBySection: Record<Section, number> = { cp: 0, cars: 0, bb: 0, ps: 0 };
  for (const r of record.responses) {
    (familiesByCluster[r.cluster] ??= new Set<string>()).add(r.familyId);
    itemsBySection[r.section] += 1;
  }
  return {
    itemsScored: record.responses.length,
    seenQuestionIds: seenIds(record),
    familiesByCluster: familiesByCluster as DiagnosticState['familiesByCluster'],
    itemsBySection,
    seed: record.seed,
  };
}

/** Score + append one response (event-sourced). Correctness stays server-side. */
function recordAnswer(
  bank: DiagnosticBank,
  record: SessionRecord,
  questionId: string,
  choiceId: string | null,
  elapsedMs: number,
): void {
  // Null placement means the item is not on the reporting axis. The form is
  // assembled from in-scope items only, so this is unreachable in delivery; it
  // stays as the guarantee that an off-axis id submitted by hand is not scored.
  const placement = bank.placement(questionId);
  if (!placement) return;
  const response: ScoredResponse = {
    questionId,
    // The posterior is grouped by this field, so it carries the reporting
    // bucket. `section` stays the item's own, which is what section accounting
    // wants: a concept spans sections but a question does not.
    cluster: placement.bucketId as ScoredResponse['cluster'],
    section: placement.section,
    familyId: placement.familyId,
    correct: bank.score(questionId, choiceId),
    elapsedMs: Number.isFinite(elapsedMs) && elapsedMs > 0 ? Math.min(elapsedMs, 30 * 60 * 1000) : 0,
    seq: record.responses.length,
    ...(placement.dokLevel !== undefined ? { dokLevel: placement.dokLevel } : {}),
  };
  record.responses.push(response);
}

const titleOf = (bucketId: string): string => AXIS_BY_ID.get(bucketId)?.title ?? bucketId;
const testedOf = (bucketId: string): string => AXIS_BY_ID.get(bucketId)?.tested ?? '';

function buildResultView(record: SessionRecord): DiagnosticResultView {
  const result = record.result ?? computeBayesResult(record.responses, undefined, DIAGNOSTIC_AXIS);
  return {
    confidenceLabel: result.confidenceLabel,
    // Narrowed here rather than shipped and hidden: a slot the instrument
    // cannot reproduce should not cross the wire at all. A priority dropped by
    // the cap is not moved into `stillConfirming` — that list means "too little
    // evidence", which is the opposite of a well-measured near-tie — so it
    // reads as an ordinary row on the chart.
    topPriorities: result.topPriorities.map((p) => ({
      cluster: p.cluster,
      title: p.title,
      tested: testedOf(p.cluster),
      recommendation: p.recommendation,
    })),
    stillConfirming: result.stillConfirming.map((cluster) => ({
      cluster,
      title: titleOf(cluster),
    })),
    perCluster: result.perCluster.map((s) => ({
      cluster: s.cluster,
      title: titleOf(s.cluster),
      section: s.section,
      classification: s.classification,
      recommendation: s.recommendation,
      gap: s.gap,
      certainty: s.certainty,
      itemsSeen: s.itemsSeen,
    })),
    itemsScored: result.itemsScored,
    // Seeded at KC grain, because that is the grain the mastery engine stores: a
    // lesson has no `P(L)` of its own, and while this emitted `lessonPriors` the
    // authority had nowhere to put them, so seeding did nothing at all.
    //
    // A concept read is weak evidence about any one KC beneath it, so certainty is
    // attenuated by sqrt(KCs) before the prior is derived. Concepts the form never
    // sampled produce no seed.
    masterySeed: masterySeedFromUnitSeeds(
      kcSeedsFromDiagnostic(result, kcsByFc(orderedKcsForLesson)),
    ),
  };
}

// --- Multistage delivery ----------------------------------------------------

/**
 * The delivered form: the design the assumption sweep in
 * `packages/policies/src/diagnostic-mst-sweep.test.ts` recommends.
 *
 * `MCAT_MST_DESIGN` selects a shorter form for demos, by the length in a
 * design's label. It is resolved against the served design *before*
 * `MST_DESIGNS`, so `140` can no longer name the superseded four-stage form
 * that shares that prefix — a demo flag that quietly serves a design the sweep
 * rejected is worse than no flag. That form stays reachable for a comparison,
 * but only under a name that says what it is.
 */
const SUPERSEDED_140 = 'MST 140 (50 + 3 x 30, 3-way)';

const productionDesign = (): MstDesign => {
  const wanted = process.env.MCAT_MST_DESIGN;
  if (wanted === undefined) return MST_140_RECOMMENDED;
  if (wanted === '140-superseded') {
    return MST_DESIGNS.find((d) => d.label === SUPERSEDED_140) ?? MST_140_RECOMMENDED;
  }
  return (
    [MST_140_RECOMMENDED, ...MST_DESIGNS].find((d) => d.label.startsWith(`MST ${wanted}`)) ??
    MST_140_RECOMMENDED
  );
};

/**
 * Whether a bank can actually deal the form production serves.
 *
 * `planMstForm` throws when any bucket cannot cover its share without repeating
 * an item, which is the correct behaviour at serve time — a short form is worse
 * than a loud failure. But it makes "the bank is missing" and "the planner is
 * broken" look identical to a caller, and the real corpus is a gitignored local
 * pull: on CI and on a fresh clone the loader falls back to the synthetic
 * fixture, so the throw is the expected state rather than a defect. Callers that
 * need to branch on capability (tests that skip, a diagnostic-availability
 * check) ask here instead of catching a string.
 */
export function bankSupportsProductionForm(bank: DiagnosticBank): boolean {
  try {
    planMstForm(productionDesign(), bank.formItems, DIAGNOSTIC_AXIS);
    return true;
  } catch {
    return false;
  }
}

interface MstPosition {
  /** Module taken at each stage so far, stage 1 always 0. Identifies the open stage. */
  routePath: number[];
  /** The open stage, or null once every stage has been committed. */
  stage: AssembledStage<FormItem> | null;
  itemsCommitted: number;
  stageCount: number;
  totalItems: number;
}

/**
 * Where in the form this learner stands, derived entirely from their answers.
 *
 * Nothing about the route or the content is stored: each committed stage is
 * re-scored against its own cut scores to recover which module came next, and
 * — under contention allocation — the same response prefix is replayed to
 * recover the slot split that stage was dealt. That keeps the engine's existing
 * event-sourced contract — state is a function of the response log — and means
 * an interrupted sitting resumes on exactly the block it left, with the same
 * items in the same order.
 */
/**
 * A stable uint32 from the session's random token (FNV-1a), so a sitting's form
 * is seeded per-session: the same token replays to the same items on every
 * request (event-sourced resume still holds), while different sittings break
 * item ties differently instead of all drawing the identical lowest-id form.
 */
function seedFromToken(token: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < token.length; i += 1) {
    h ^= token.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function mstPosition(bank: DiagnosticBank, record: SessionRecord): MstPosition {
  const design = productionDesign();
  const assemblySeed = seedFromToken(record.seed);
  // The bank's own array, by identity: `planMstForm` keys its item pools on it,
  // and the open block is resolved by replaying the whole form on every request,
  // so building a fresh array here would defeat that cache each time.
  const items = bank.formItems;
  const plan = planMstForm(design, items, DIAGNOSTIC_AXIS);
  // The buckets the plan actually deals to, not every axis id: handing
  // `contentionSlots` a bucket the bank cannot populate would allocate slots
  // that `assembleMstStages` then has no item for.
  const coverable = [...plan.itemsPerBucket.keys()];

  const routePath = [0];
  const slotOverrides: (readonly string[] | undefined)[] = [];
  let itemsCommitted = 0;
  for (;;) {
    const index = routePath.length - 1;
    const size = plan.slotsByStage[index]?.length;
    if (size === undefined) break;
    // Aimed at the responses committed before this stage, which is what makes
    // it replayable: the same log yields the same weights, so a re-serve of an
    // open block deals it the same slots. Stage 1 has no responses to aim it
    // with and stays the balanced deal.
    if (design.allocation === 'contention' && index > 0) {
      slotOverrides[index] = contentionSlots(
        size,
        coverable,
        contentionFromResponses(
          record.responses.slice(0, itemsCommitted),
          undefined,
          DIAGNOSTIC_AXIS,
        ),
      );
    }
    const assembled = assembleMstStages(
      design,
      items,
      DIAGNOSTIC_AXIS,
      routePath,
      slotOverrides,
      assemblySeed,
    );
    const stage = assembled[index];
    if (stage === undefined) break;
    if (record.responses.length < itemsCommitted + stage.items.length) {
      return {
        routePath,
        stage,
        itemsCommitted,
        stageCount: plan.slotsByStage.length,
        totalItems: plan.totalItems,
      };
    }
    const correct = record.responses
      .slice(itemsCommitted, itemsCommitted + stage.items.length)
      .filter((r) => r.correct).length;
    itemsCommitted += stage.items.length;
    if (stage.cutsToNext === null) break;
    routePath.push(routeFromScore(correct, stage.cutsToNext));
  }

  return {
    routePath,
    stage: null,
    itemsCommitted,
    stageCount: plan.slotsByStage.length,
    totalItems: plan.totalItems,
  };
}

/**
 * The route names the stage. Under contention allocation it no longer *fixes*
 * the stage's content — the response log does that too — but the two move
 * together: a learner reaches a given route with exactly one response prefix,
 * so naming the stage after the route still survives a re-serve without
 * anything being persisted, and still changes the moment the learner routes on.
 */
const stageIdFor = (routePath: readonly number[]): string => `stage-${routePath.join('.')}`;

/** Score + append one whole block, in the order the server served it. */
export function recordBlock(
  bank: DiagnosticBank,
  record: SessionRecord,
  questionIds: readonly string[],
  answers: Readonly<Record<string, string | null>>,
  elapsedMs: Readonly<Record<string, number>> = {},
): void {
  for (const questionId of questionIds) {
    // A missing entry is committed as "not known", the same as an explicit null:
    // routing counts number-correct over the whole block, so a short payload must
    // never shorten the block.
    recordAnswer(bank, record, questionId, answers[questionId] ?? null, elapsedMs[questionId] ?? 0);
  }
}

/**
 * Resolve the current block. An open stage is re-served identically however many
 * times it is asked for; when every stage is committed, compute and cache the
 * diagnostic result. Returns the served block (if any) so the caller can mint a
 * one-use block token.
 */
export function resolveBlock(
  bank: DiagnosticBank,
  record: SessionRecord,
): { view: DiagnosticBlockView; block: { stageId: string; questionIds: string[] } | null } {
  const position = mstPosition(bank, record);
  const denom = Math.max(1, position.totalItems);

  const doneView = (): DiagnosticBlockView => ({
    done: true,
    progress: 1,
    itemsScored: record.responses.length,
    totalItems: denom,
    stageId: null,
    stageNumber: 0,
    stageCount: position.stageCount,
    itemsCommitted: position.itemsCommitted,
    questions: [],
    result: buildResultView(record),
  });

  if (record.completed) return { view: doneView(), block: null };

  if (position.stage === null) {
    record.completed = true;
    record.result = computeBayesResult(record.responses, undefined, DIAGNOSTIC_AXIS);
    record.pendingBlock = null;
    return { view: doneView(), block: null };
  }

  const stageId = stageIdFor(position.routePath);
  const questionIds = position.stage.items.map((i) => i.questionId);
  const questions = questionIds
    .map((id) => bank.view(id))
    .filter((view): view is DiagnosticItemView => view !== null);

  return {
    view: {
      done: false,
      progress: Math.min(0.98, record.responses.length / denom),
      itemsScored: record.responses.length,
      totalItems: denom,
      stageId,
      stageNumber: position.routePath.length,
      stageCount: position.stageCount,
      itemsCommitted: position.itemsCommitted,
      questions,
      result: null,
    },
    block: { stageId, questionIds },
  };
}
