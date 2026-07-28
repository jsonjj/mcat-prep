import { leverageOf, type ConfidenceLabel, type DiagnosticResponse } from './diagnostic';
import { axisIds, indexAxis, type DiagnosticAxis } from './diagnostic-axis';
import type { FormItem } from './diagnostic-session';
import {
  BAYES_DIAGNOSTIC_CONFIG,
  CONTENTION_FLOOR,
  computeBayesResult,
  contentionFromResponses,
  type BayesDiagnosticConfig,
} from './diagnostic-bayes';
import {
  normalCdf,
  type SimItem,
  type SimLearner,
  type SimRunOptions,
} from './diagnostic-simulation';

/**
 * Multistage testing (MST) as an alternative *delivery* design, for simulation only.
 *
 * The adaptive engine in `diagnostic-bayes` re-decides after every single item.
 * MST instead serves fixed blocks: everyone takes the same routing module, their
 * number-correct routes them to an easier or harder module for the next stage,
 * and so on. Far fewer adaptive decisions, in exchange for content coverage that
 * is fixed before the sitting starts and blocks the learner can review within.
 *
 * **MST changes item SELECTION, not SCORING.** Responses are scored by the same
 * `computeBayesResult` posterior the adaptive arm uses. The question this exists
 * to answer is "does staged fixed-allocation delivery lose accuracy versus
 * item-level adaptive selection, at equal item count?", and that question is
 * meaningless the moment the two arms score differently. Do not add a
 * measurement model here.
 *
 * Nothing here is production code: no persistence, no API contract, no UI.
 */

// --- Item difficulty --------------------------------------------------------

/**
 * Author DOK → difficulty proxy, mirroring `diagnostic-bayes`'s `DOK_DIFFICULTY`.
 *
 * Module assembly targets the *labelled* difficulty an operational form builder
 * can see, never `SimItem.trueDifficulty`. The true parameter is ground truth
 * the real assembler does not have, and reaching for it would let MST quietly
 * sidestep the `misspecified` and `systematic` calibration modes — the two modes
 * the comparison is actually about.
 */
const DOK_DIFFICULTY: Readonly<Record<number, number>> = { 1: -1, 2: 0, 3: 1, 4: 1.8 };

const difficultyOf = (item: FormItem): number => DOK_DIFFICULTY[item.dokLevel] ?? 0;

/** Difficulty targets the bank's DOK 1–3 labels can actually hit, easiest first. */
const DIFFICULTY_LADDER: readonly number[] = [1, 2, 3].map((dok) => DOK_DIFFICULTY[dok]!);

/**
 * Target difficulty for each module at a stage, easiest first, spread evenly
 * across the ladder the bank can reach. Two modules give easy/hard, three give
 * easy/medium/hard, and a single module sits in the middle.
 */
export function moduleDifficulties(modules: number): number[] {
  const lo = DIFFICULTY_LADDER[0]!;
  const hi = DIFFICULTY_LADDER[DIFFICULTY_LADDER.length - 1]!;
  if (modules <= 1) return [(lo + hi) / 2];
  return Array.from({ length: modules }, (_, m) => lo + ((hi - lo) * m) / (modules - 1));
}

// --- Routing ----------------------------------------------------------------

/** The engine's assumed item parameters, mirrored from `diagnostic-bayes`. */
const ASSUMED_DISCRIMINATION = 1.5;
const GUESSING = 0.25;

/** Expected proportion correct at ability θ on a module of the given difficulty. */
const assumedProportionCorrect = (theta: number, difficulty: number): number =>
  GUESSING + (1 - GUESSING) / (1 + Math.exp(-ASSUMED_DISCRIMINATION * (theta - difficulty)));

/** Inverse standard normal CDF, by bisection on the harness's {@link normalCdf}. */
const probit = (p: number): number => {
  let lo = -6;
  let hi = 6;
  for (let i = 0; i < 48; i += 1) {
    const mid = (lo + hi) / 2;
    if (normalCdf(mid) < p) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
};

/**
 * Equal-mass ability bands under the N(0,1) prior the scoring engine already
 * assumes — the only quantiles the design justifies without new information.
 *
 * These do NOT produce equal-sized bands against the harness's cohort, whose
 * overall ability measures mean -0.38, sd 0.75 rather than N(0,1) because
 * `makeLearner` subtracts deficits from a standard-normal base. Three modules
 * fill roughly 42/47/11 instead of a third each. That is a real disagreement
 * between the engine's prior and the generative model, not a bug to tune away
 * here: re-centring on the cohort would fit the design to assumptions the sweep
 * exists to vary. Sweep `routingQuantiles` instead — routing is very sensitive
 * to them, and moving them from [0.2,0.4] to [0.6,0.8] swings top-module
 * occupancy from 65% to 2%.
 */
export const defaultRoutingQuantiles = (modules: number): number[] =>
  Array.from({ length: Math.max(0, modules - 1) }, (_, k) => (k + 1) / modules);

/**
 * Number-correct cuts separating adjacent modules, ascending.
 *
 * Derived rather than picked: take the ability that separates two bands, push it
 * through the same 3PL the engine assumes, at the difficulty of the module the
 * learner just sat, and scale by that module's length. Because the cut is
 * computed against the module actually taken, routing is ability-referenced —
 * someone who took the hard module needs fewer correct to stay in the top band,
 * so a correctly-routed learner is not dragged back toward the middle.
 */
export function cutScoresFor(
  itemsInStage: number,
  stageDifficulty: number,
  quantiles: readonly number[],
): number[] {
  return quantiles.map((q) =>
    Math.ceil(itemsInStage * assumedProportionCorrect(probit(q), stageDifficulty)),
  );
}

/** Module index for a number-correct score: how many cuts it clears. */
export const routeFromScore = (correct: number, cuts: readonly number[]): number =>
  cuts.reduce((module, cut) => (correct >= cut ? module + 1 : module), 0);

// --- Design -----------------------------------------------------------------

export interface MstDesign {
  label: string;
  /** Number of stages, including the routing stage. */
  stages: number;
  /** Items served per stage. Either one number for all, or per-stage. */
  itemsPerStage: number | readonly number[];
  /** Difficulty levels available at each stage after the first (e.g. 2 = easy/hard, 3 = easy/medium/hard). */
  modulesPerStage: number;
  /** How many items each bucket is guaranteed across the whole form. */
  minItemsPerBucket: number;
  /**
   * Ability quantiles separating adjacent modules, ascending, of length
   * `modulesPerStage - 1`. Defaults to equal-mass bands. Exposed so a sweep can
   * ask how much of a result rests on where the cuts happen to sit.
   */
  routingQuantiles?: readonly number[];
  /**
   * How a stage's slots are shared out between buckets.
   *
   * - `balanced` — the round-robin deal, identical for every learner. Content
   *   is fixed before the sitting starts.
   * - `contention` — later stages spend more of their slots on the buckets
   *   still contesting the reporting cut, within {@link CONTENTION_SLOT_FLOOR}
   *   and {@link CONTENTION_SLOT_CAP} of an even share.
   *
   * Routing adapts *difficulty*; this is the only thing in the design that
   * adapts *allocation*, and allocation is where most of MST's measured deficit
   * against item-level selection sits. It costs the property that a sitting can
   * be rebuilt from its route alone: a contention-allocated form is a function
   * of the responses, not just of which modules were taken.
   */
  allocation?: 'balanced' | 'contention';
}

/**
 * Candidate designs at the lengths the adaptive sweep already compares, so the
 * two delivery models can be read off against each other at equal item count.
 *
 * `minItemsPerBucket` is set to `total / 15` — what an even split across every
 * axis bucket yields — rather than to the larger floor the 14 *populated*
 * buckets would allow. Filling the bank's PS1 hole should never turn a design
 * infeasible.
 */
export const MST_DESIGNS: readonly MstDesign[] = [
  // A longer routing stage buys a more reliable first route, which is the
  // highest-leverage decision in the panel; later stages can be shorter.
  { label: 'MST 60 (3 x 20, easy/hard)', stages: 3, itemsPerStage: [24, 18, 18], modulesPerStage: 2, minItemsPerBucket: 4 },
  { label: 'MST 90 (3 x 30, 3-way)', stages: 3, itemsPerStage: 30, modulesPerStage: 3, minItemsPerBucket: 6 },
  { label: 'MST 140 (50 + 3 x 30, 3-way)', stages: 4, itemsPerStage: [50, 30, 30, 30], modulesPerStage: 3, minItemsPerBucket: 9 },
  { label: 'MST 200 (4 x 50, 3-way)', stages: 4, itemsPerStage: 50, modulesPerStage: 3, minItemsPerBucket: 13 },
];

/**
 * The 140-item design the sweep recommends, and the one
 * `PLAN_BARS.testRetestReportedMstAt140` is aimed at.
 *
 * Two things separate it from `MST 140 (50 + 3 x 30)`, and neither is stage
 * count. Measured on `fc-10` over the three worlds every arm fails in, at 1500
 * learners a cell (worst-world reported reproducibility, then true #1):
 *
 *   50 + 3 x 30, three routes, equal-mass cuts      79.9%   82.3%
 *   7 x 20,      six routes,   equal-mass cuts      80.2%   82.3%
 *   7 x 20 + raised cuts                            81.9%   84.3%
 *   7 x 20 + contention slots                       83.3%   86.4%
 *   7 x 20 + both                                   84.7%   87.5%
 *   item-level adaptive                             86.9%   87.3%
 *
 * Doubling the routing decisions is worth 0.3 points. What the extra stages are
 * for is that they are the only place the other two levers can act: cuts can
 * only be re-aimed at a stage boundary, and slots can only be re-allocated at
 * one. Six boundaries at 20 items apiece is the most of both that stays above a
 * reviewable block.
 *
 * Cuts sit above equal mass because the bank's DOK ladder sits above this
 * cohort. Equal-mass bands under the engine's N(0,1) prior route on an ability
 * scale the realised cohort does not occupy — it measures around −0.38 — and a
 * learner routed upward is served items above their ability, which buy less
 * than easier ones would. Re-aiming the cuts *downward*, onto the realised
 * cohort, evens out module occupancy and makes accuracy worse in all 24 worlds;
 * these cuts do the opposite of both.
 */
export const MST_140_RECOMMENDED: MstDesign = {
  label: 'MST 140 (7 x 20, 3-way, contention)',
  stages: 7,
  itemsPerStage: 20,
  modulesPerStage: 3,
  // What contention allocation guarantees, not what it typically serves: the
  // routing stage's even 2, then a floor of 1 from each of the six that follow.
  minItemsPerBucket: 8,
  routingQuantiles: [0.45, 0.75],
  allocation: 'contention',
};

const resolveStageSizes = (design: MstDesign): number[] => {
  if (!Number.isInteger(design.stages) || design.stages < 1) {
    throw new Error(
      `MST design "${design.label}": stages must be a positive integer, got ${design.stages}.`,
    );
  }
  if (!Number.isInteger(design.modulesPerStage) || design.modulesPerStage < 1) {
    throw new Error(
      `MST design "${design.label}": modulesPerStage must be a positive integer, got ${design.modulesPerStage}.`,
    );
  }
  const sizes =
    typeof design.itemsPerStage === 'number'
      ? Array.from({ length: design.stages }, () => design.itemsPerStage as number)
      : [...design.itemsPerStage];
  if (sizes.length !== design.stages) {
    throw new Error(
      `MST design "${design.label}": itemsPerStage lists ${sizes.length} stages but stages is ${design.stages}.`,
    );
  }
  if (sizes.some((n) => !Number.isInteger(n) || n < 1)) {
    throw new Error(
      `MST design "${design.label}": every stage needs at least one item, got [${sizes.join(', ')}].`,
    );
  }
  return sizes;
};

// --- Form assembly ----------------------------------------------------------

/**
 * Bank items grouped by bucket id and ordered by question id.
 *
 * Assembly consumes no randomness at all: an MST form is fixed before anyone
 * sits it, so two learners who route the same way must see the same items. The
 * seeded `rng` is spent only on responses.
 */
// Keyed by the array identity, so the element type is irrelevant to the cache;
// `bucketPools` restores it on the way out.
const poolCache = new WeakMap<object, Map<string, FormItem[]>>();

const bucketPools = <T extends FormItem>(bank: readonly T[]): Map<string, T[]> => {
  const cached = poolCache.get(bank) as Map<string, T[]> | undefined;
  if (cached !== undefined) return cached;
  const pools = new Map<string, T[]>();
  for (const item of bank) {
    const list = pools.get(item.bucketId) ?? [];
    list.push(item);
    pools.set(item.bucketId, list);
  }
  for (const list of pools.values()) list.sort((a, b) => (a.questionId < b.questionId ? -1 : 1));
  poolCache.set(bank, pools);
  return pools;
};

export interface MstFormPlan {
  totalItems: number;
  stageSizes: readonly number[];
  /**
   * Bucket id for every slot of every stage, under the balanced deal. Identical
   * for all modules at a stage — modules differ in difficulty, never in content
   * — so the coverage guarantee holds on every route through the panel rather
   * than on average. A `contention` design overrides these per routed stage;
   * what survives there is {@link guaranteedPerBucket}, not this split.
   */
  slotsByStage: readonly (readonly string[])[];
  /**
   * Items each bucket receives across the whole form under the balanced deal,
   * whatever route is taken. Under `contention` it is the deal the routing
   * stage still uses and the pool sizing is checked against, not a count of
   * what any one learner is served.
   */
  itemsPerBucket: ReadonlyMap<string, number>;
  /** Axis buckets with no item in the bank. Excluded from the guarantee. */
  uncoverableBuckets: readonly string[];
}

/**
 * Lay out the content of every module, ahead of any response.
 *
 * Slots are dealt round-robin over the buckets and then cut into stages, which
 * splits the form as evenly as an integer allocation can and makes the per-bucket
 * total a property of the design rather than of the route a learner happens to
 * take. This is the guarantee that distinguishes MST from adaptive selection,
 * so a bank that cannot honour it throws instead of quietly serving fewer.
 *
 * A bucket with no items at all is a hole in the bank, not a failure of the
 * design — the harness deliberately inherits the real corpus's empty PS1 — so
 * uncoverable buckets are excluded, exactly as `selectNextBayes` excludes
 * unpopulated clusters from its own breadth floor.
 */
export function planMstForm(
  design: MstDesign,
  bank: readonly FormItem[],
  axis: DiagnosticAxis,
): MstFormPlan {
  const stageSizes = resolveStageSizes(design);
  const totalItems = stageSizes.reduce((s, n) => s + n, 0);
  const pools = bucketPools(bank);

  const ids = axisIds(axis);
  const coverable = ids.filter((id) => (pools.get(id)?.length ?? 0) > 0);
  const uncoverableBuckets = ids.filter((id) => (pools.get(id)?.length ?? 0) === 0);
  if (coverable.length === 0) {
    throw new Error(
      `MST design "${design.label}": no item in the bank maps to any bucket of axis "${axis.id}". ` +
        'Bank items are bucketed by their cluster id, so the axis must be keyed by the same ids.',
    );
  }

  const guaranteed = guaranteedPerBucket(stageSizes, coverable.length, design);
  if (guaranteed < design.minItemsPerBucket) {
    throw new Error(
      `MST design "${design.label}": ${totalItems} items across ${coverable.length} populated buckets ` +
        `guarantees only ${guaranteed} per bucket, short of the required ${design.minItemsPerBucket}. ` +
        `Lengthen the form to at least ${design.minItemsPerBucket * coverable.length} items or lower the floor.`,
    );
  }

  const slots = Array.from({ length: totalItems }, (_, i) => coverable[i % coverable.length]!);
  const slotsByStage: string[][] = [];
  let cursor = 0;
  for (const size of stageSizes) {
    slotsByStage.push(slots.slice(cursor, cursor + size));
    cursor += size;
  }

  const itemsPerBucket = new Map<string, number>();
  for (const id of coverable) itemsPerBucket.set(id, 0);
  for (const id of slots) itemsPerBucket.set(id, itemsPerBucket.get(id)! + 1);

  // Checked against the most any bucket could be asked for, not against the
  // balanced deal: a contention-allocated form spends more than an even share on
  // a contested bucket, and running dry mid-sitting is not a recoverable state.
  const ceiling =
    design.allocation === 'contention' ? maxPerBucket(stageSizes, coverable.length) : 0;
  for (const [id, needed] of itemsPerBucket) {
    const available = pools.get(id)!.length;
    const want = Math.max(needed, ceiling);
    if (available < want) {
      throw new Error(
        `MST design "${design.label}": bucket "${id}" needs ${want} items but the bank holds ${available}. ` +
          'Items may not repeat within a sitting, so the form cannot be assembled.',
      );
    }
  }

  return { totalItems, stageSizes, slotsByStage, itemsPerBucket, uncoverableBuckets };
}

/**
 * Difficulty target per slot of the routing module: the ladder cycled against
 * the bucket round-robin rather than with it.
 *
 * A naive `slot % ladder` cycle lines up with the `slot % buckets` deal whenever
 * the ladder length divides the bucket count — which it does at 3 and 15 — and
 * every bucket would then be probed at one fixed difficulty for the whole
 * routing stage.
 */
const routingTargets = (slots: readonly string[], buckets: number): number[] =>
  slots.map(
    (_, i) =>
      DIFFICULTY_LADDER[(i + Math.floor(i / Math.max(1, buckets))) % DIFFICULTY_LADDER.length]!,
  );

// --- Contention allocation --------------------------------------------------

/**
 * Bounds on how far a stage may move from an even split, as multiples of an
 * even share.
 *
 * The floor is what keeps the coverage guarantee meaningful — a bucket the
 * engine has decided about still gets sampled, so a wrong early decision is
 * recoverable — and the cap is what keeps a thin bucket's pool from running
 * out. Both are stated in shares rather than items so they travel across stage
 * sizes.
 */
export const CONTENTION_SLOT_FLOOR = 0.5;
export const CONTENTION_SLOT_CAP = 2;

const boundsFor = (stageSize: number, buckets: number): { floor: number; cap: number } => {
  const even = stageSize / Math.max(1, buckets);
  return {
    floor: Math.max(0, Math.floor(even * CONTENTION_SLOT_FLOOR)),
    cap: Math.max(1, Math.ceil(even * CONTENTION_SLOT_CAP)),
  };
};

/**
 * Items each bucket is guaranteed across the whole form under a design's
 * allocation rule.
 *
 * Under `balanced` this is the round-robin share. Under `contention` the
 * routing stage is still balanced — there are no responses to aim it with — and
 * every later stage contributes only its floor, so the guarantee is genuinely
 * lower and is reported rather than assumed.
 */
export function guaranteedPerBucket(stageSizes: readonly number[], buckets: number, design: MstDesign): number {
  const total = stageSizes.reduce((s, n) => s + n, 0);
  if (design.allocation !== 'contention') return Math.floor(total / Math.max(1, buckets));
  return stageSizes.reduce(
    (s, size, stage) =>
      s + (stage === 0 ? Math.floor(size / Math.max(1, buckets)) : boundsFor(size, buckets).floor),
    0,
  );
}

/** Most items one bucket can draw under contention allocation. Bounds the pool needed. */
const maxPerBucket = (stageSizes: readonly number[], buckets: number): number =>
  stageSizes.reduce(
    (s, size, stage) =>
      s + (stage === 0 ? Math.ceil(size / Math.max(1, buckets)) : boundsFor(size, buckets).cap),
    0,
  );

/**
 * Share one stage's slots out by contention, best-contested first.
 *
 * Largest-remainder on the same weight the item-level selector applies —
 * `floor + (1 - floor) × contention` — so the two designs aim at the same
 * boundary and differ only in how coarsely they can act on it. Buckets are
 * emitted in canonical order rather than in weight order: within a routed stage
 * every slot carries the same difficulty target, so slot order carries no
 * signal and a stable order keeps the form reproducible.
 */
export function contentionSlots(
  stageSize: number,
  bucketIds: readonly string[],
  contention: ReadonlyMap<string, number>,
): string[] {
  const { floor, cap } = boundsFor(stageSize, bucketIds.length);
  const weights = bucketIds.map(
    (id) => CONTENTION_FLOOR + (1 - CONTENTION_FLOOR) * (contention.get(id) ?? 1),
  );
  const weightSum = weights.reduce((s, w) => s + w, 0) || 1;

  // The whole stage is shared out by weight and the bounds are repaired
  // afterwards, rather than the floor being reserved first and only the
  // remainder weighted. Reserving first looks safer and is not: at two items a
  // bucket per block, holding one back leaves the weighted part a single item
  // wide, and largest-remainder then hands it straight back to whichever bucket
  // rounded down — which reproduced an even split exactly, weights and all.
  const exact = weights.map((w) => (stageSize * w) / weightSum);
  const counts = exact.map((x) => Math.floor(x));
  const order = bucketIds.map((_, i) => i);
  const byRemainder = [...order].sort((a, b) => (exact[b]! % 1) - (exact[a]! % 1) || a - b);
  let spare = stageSize - counts.reduce((s, n) => s + n, 0);
  for (const i of byRemainder) {
    if (spare <= 0) break;
    counts[i]! += 1;
    spare -= 1;
  }

  // Repair against the bounds, taking from the most-served bucket and giving to
  // the least, so the stage total is preserved exactly.
  const take = (from: number[], predicate: (i: number) => boolean): number | undefined =>
    from.find(predicate);
  for (let guard = 0; guard < stageSize * 2; guard += 1) {
    const short = order.find((i) => counts[i]! < floor);
    const over = order.find((i) => counts[i]! > cap);
    if (short === undefined && over === undefined) break;
    const richest = [...order].sort((a, b) => counts[b]! - counts[a]! || a - b);
    const poorest = [...richest].reverse();
    if (short !== undefined) {
      const donor = take(richest, (i) => counts[i]! > floor + 1);
      if (donor === undefined) break;
      counts[donor]! -= 1;
      counts[short]! += 1;
    } else if (over !== undefined) {
      const taker = take(poorest, (i) => counts[i]! < cap);
      if (taker === undefined) break;
      counts[over]! -= 1;
      counts[taker]! += 1;
    }
  }

  const out: string[] = [];
  bucketIds.forEach((id, i) => {
    for (let k = 0; k < counts[i]!; k += 1) out.push(id);
  });
  return out;
}

const pickModuleItems = <T extends FormItem>(
  slots: readonly string[],
  targets: readonly number[],
  pools: ReadonlyMap<string, readonly T[]>,
  used: Set<string>,
  label: string,
): T[] => {
  const picked: T[] = [];
  for (let i = 0; i < slots.length; i += 1) {
    const bucket = slots[i]!;
    const target = targets[i]!;
    const pool = pools.get(bucket) ?? [];
    // Tracked by index rather than by value: narrowing `T | undefined` fails for
    // an unconstrained-nullability generic.
    let bestIndex = -1;
    let bestGap = Infinity;
    // Ties fall to the lowest question id. Item order within a (bucket, DOK)
    // group carries no signal in any calibration mode, so this is an arbitrary
    // but stable choice rather than a biased one.
    for (let j = 0; j < pool.length; j += 1) {
      const item = pool[j]!;
      if (used.has(item.questionId)) continue;
      const gap = Math.abs(difficultyOf(item) - target);
      if (gap < bestGap) {
        bestGap = gap;
        bestIndex = j;
      }
    }
    if (bestIndex < 0) {
      throw new Error(
        `MST design "${label}": bucket "${bucket}" ran out of unused items mid-form. ` +
          'planMstForm should have caught this.',
      );
    }
    const best = pool[bestIndex]!;
    used.add(best.questionId);
    picked.push(best);
  }
  return picked;
};

// --- Form assembly (shared by simulation and production) --------------------

export interface AssembledStage<T> {
  items: T[];
  /**
   * Number-correct cuts deciding which module comes next, or null on the final
   * stage. Computed from the difficulty actually served rather than the
   * difficulty requested.
   */
  cutsToNext: number[] | null;
}

/**
 * Assemble the modules a learner sees, given the route they took.
 *
 * Assembly is path-dependent — items already served are not repeated, so which
 * items a later stage draws depends on which modules preceded it — and it
 * consumes no randomness at all. Both properties matter operationally: a sitting
 * can be reconstructed exactly from its inputs, which is what lets the server
 * resume an interrupted session, and what lets a simulated form and a delivered
 * form be the same form.
 *
 * Pass the route taken so far; the returned array has one entry per stage in it.
 *
 * Under `allocation: 'contention'` the route is not one of those inputs on its
 * own, and reconstruction needs the response log as well: pass `slotOverrides`,
 * one entry per routed stage, from {@link contentionSlots} over
 * {@link contentionFromResponses} of the responses committed before that stage.
 * Stage 1 is always the balanced deal.
 */
export function assembleMstStages<T extends FormItem>(
  design: MstDesign,
  bank: readonly T[],
  axis: DiagnosticAxis,
  routePath: readonly number[],
  slotOverrides: readonly (readonly string[] | undefined)[] = [],
): AssembledStage<T>[] {
  const plan = planMstForm(design, bank, axis);
  const pools = bucketPools(bank);
  const ladder = moduleDifficulties(design.modulesPerStage);
  const quantiles = design.routingQuantiles ?? defaultRoutingQuantiles(design.modulesPerStage);
  if (quantiles.length !== design.modulesPerStage - 1) {
    throw new Error(
      `MST design "${design.label}": ${design.modulesPerStage} modules need ${design.modulesPerStage - 1} ` +
        `routing quantiles, got ${quantiles.length}.`,
    );
  }
  if (routePath.length > 0 && routePath[0] !== 0) {
    throw new Error(
      `MST design "${design.label}": stage 1 is the routing module and is the same for everyone, ` +
        `so routePath must start at 0; got ${routePath[0]}.`,
    );
  }

  const used = new Set<string>();
  const out: AssembledStage<T>[] = [];
  const stages = Math.min(routePath.length, plan.slotsByStage.length);

  for (let stage = 0; stage < stages; stage += 1) {
    const slots = slotOverrides[stage] ?? plan.slotsByStage[stage]!;
    const module = routePath[stage]!;
    const targets =
      stage === 0
        ? routingTargets(slots, plan.itemsPerBucket.size)
        : slots.map(() => ladder[module] ?? ladder[ladder.length - 1]!);
    const items = pickModuleItems(slots, targets, pools, used, design.label);
    const isLast = stage + 1 >= plan.slotsByStage.length;
    const served = items.reduce((s, item) => s + difficultyOf(item), 0) / Math.max(1, items.length);
    out.push({
      items,
      cutsToNext: isLast ? null : cutScoresFor(items.length, served, quantiles),
    });
  }
  return out;
}

/** Total stages in a form, before anyone sits it. */
export const mstStageCount = (design: MstDesign, bank: readonly FormItem[], axis: DiagnosticAxis): number =>
  planMstForm(design, bank, axis).slotsByStage.length;

// --- One simulated sitting --------------------------------------------------

export interface MstRun {
  itemsServed: number;
  /** The priorities the report names — `REPORTED_PRIORITY_COUNT` of them. */
  reported: string[];
  /**
   * Every sampled bucket ranked by reported leverage, best first. Carried so a
   * caller can score a report shape the engine no longer emits — the top-three
   * telemetry the adaptive arm is compared on, in particular.
   */
  ranked: { bucket: string; leverage: number }[];
  confidenceLabel: ConfidenceLabel;
  internalConfidence: number;
  unresolved: number;
  /** Which difficulty module was taken at each stage, for diagnosing routing behaviour. */
  routePath: number[];
  /** Cuts applied at each routing decision, `stages - 1` of them. */
  cutScores: number[][];
  /** Every item served, in order. Lets a caller check coverage and non-repetition. */
  servedItemIds: string[];
  /** Whether each served item was answered correctly, aligned with the ids above. */
  servedCorrect: boolean[];
}

/**
 * Run one learner through an MST panel and score the result with the adaptive
 * arm's own posterior.
 *
 * `cfg` reaches only `computeBayesResult`, where it supplies the classification
 * thresholds; its `minItems`/`maxItems` are ignored, because length here is the
 * design's business and not the stopping rule's.
 */
export function simulateMstSitting(
  learner: SimLearner,
  bank: readonly SimItem[],
  design: MstDesign,
  axis: DiagnosticAxis,
  rng: () => number,
  cfg: BayesDiagnosticConfig = BAYES_DIAGNOSTIC_CONFIG,
  opts: SimRunOptions = {},
): MstRun {
  const plan = planMstForm(design, bank, axis);

  const careless = opts.carelessRate ?? 0;
  const fatigue = opts.fatigue ?? 0;

  const responses: DiagnosticResponse[] = [];
  const cutScores: number[][] = [];
  const sections = indexAxis(axis);
  // Stage 1 is the routing module, the same for everyone, so it is always 0.
  const routePath: number[] = [0];
  const slotOverrides: (readonly string[] | undefined)[] = [];
  const coverable = [...plan.itemsPerBucket.keys()];

  for (let stage = 0; stage < plan.slotsByStage.length; stage += 1) {
    if (design.allocation === 'contention' && stage > 0) {
      slotOverrides[stage] = contentionSlots(
        plan.slotsByStage[stage]!.length,
        coverable,
        contentionFromResponses(responses, cfg, axis),
      );
    }
    // Re-derived from the route each stage rather than carried along, so that a
    // sitting and a resumed sitting assemble identically. Stage counts are small.
    const assembled = assembleMstStages(design, bank, axis, routePath, slotOverrides);
    const { items, cutsToNext } = assembled[stage]!;

    let correct = 0;
    for (const item of items) {
      // Response generation is `simulateSitting`'s, transcribed so the two arms
      // are comparable: same 3PL with a 0.25 guessing floor, same linear fatigue
      // drift, same two rng draws per item whichever careless branch is taken.
      // The one difference is the drift denominator — progress through an MST
      // sitting is measured against the form's own length, not `cfg.maxItems`,
      // which no longer describes how long the learner is sitting there.
      const drift = fatigue * (responses.length / Math.max(1, plan.totalItems));
      const theta = (learner.theta[item.cluster] ?? 0) - drift;
      const logistic = 1 / (1 + Math.exp(-item.trueDiscrimination * (theta - item.trueDifficulty)));
      const p = 0.25 + 0.75 * logistic;
      const isCorrect = rng() < careless ? rng() < 0.25 : rng() < p;
      if (isCorrect) correct += 1;

      responses.push({
        questionId: item.questionId,
        cluster: item.cluster,
        section: sections.get(item.cluster)!.section,
        familyId: item.questionId,
        correct: isCorrect,
        elapsedMs: 60_000,
        dokLevel: item.dokLevel,
      });
    }

    if (cutsToNext !== null) {
      cutScores.push(cutsToNext);
      routePath.push(routeFromScore(correct, cutsToNext));
    }
  }

  const result = computeBayesResult(responses, cfg, axis);
  const unlock = indexAxis(axis);
  const order = new Map(axisIds(axis).map((id, i) => [id, i]));
  return {
    itemsServed: responses.length,
    reported: result.topPriorities.map((p) => p.cluster),
    ranked: result.perCluster
      .filter((s) => s.itemsSeen > 0)
      .map((s) => ({
        bucket: s.cluster as string,
        leverage: leverageOf(s.gap, unlock.get(s.cluster)?.unlockWeight ?? 0),
      }))
      .sort(
        (a, b) =>
          b.leverage - a.leverage || (order.get(a.bucket) ?? 0) - (order.get(b.bucket) ?? 0),
      ),
    confidenceLabel: result.confidenceLabel,
    internalConfidence: result.internalConfidence,
    unresolved: result.perCluster.filter(
      (s) => s.classification === 'unresolved' || s.classification === 'unsampled',
    ).length,
    routePath,
    cutScores,
    servedItemIds: responses.map((r) => r.questionId),
    servedCorrect: responses.map((r) => r.correct),
  };
}

/** How many items each bucket actually received, for checking the coverage guarantee. */
export function bucketCounts(
  run: MstRun,
  bank: readonly SimItem[],
): ReadonlyMap<string, number> {
  const byId = new Map<string, string>(bank.map((i) => [i.questionId, i.cluster]));
  const counts = new Map<string, number>();
  for (const id of run.servedItemIds) {
    const bucket = byId.get(id);
    if (bucket === undefined) continue;
    counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
  }
  return counts;
}
