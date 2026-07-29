import type { CarsSkill, ReasoningOperation, Section, SkillCluster, UtcTimestamp } from '@mcat/contracts';

/**
 * Fixed-form scorer + mastery re-measure for the periodic practice test (WS5, §6).
 *
 * The diagnostic scores an *adaptive* form with a Bayesian posterior
 * (`computeBayesResult`) because its whole question is "did staged selection lose
 * accuracy". A practice test asks nothing of the kind: it is a fixed blueprint
 * form, so scoring is a plain key match summed per section / cluster, and the
 * only modelling choice is how a run of tests over weeks is turned back into a
 * current capability read.
 *
 * That is the **decay-weighted re-measure**. A single test's accuracy is a noisy
 * snapshot, and an old test's accuracy is stale — the learner has studied since —
 * so re-measuring a unit averages every test that touched it, weighting each by
 * `2^(-ageDays / halfLife)`. The most recent sitting dominates and a months-old
 * one barely counts, which is exactly the testing-effect + spacing rationale for
 * running periodic tests at all: recent retrieval is the signal, and it is
 * re-weighted toward the present rather than averaged flat with the past.
 *
 * This produces a READ, not a mastery write. The BKT grains are moved only by the
 * single-door write path in the authority (`stepDirectGrains`); this re-measure
 * is an assessment signal the result envelope carries, alongside the review
 * targets the misses populate. Pure functions only.
 */

/** One scored item of a completed practice test, with the metadata the read needs. */
export interface PracticeTestScoredItem {
  readonly questionId: string;
  readonly section: Section;
  readonly cluster: SkillCluster | null;
  readonly kcId: string | null;
  readonly skill: ReasoningOperation | null;
  readonly carsSkill: CarsSkill | null;
  readonly correct: boolean;
}

/** A per-section score line. */
export interface SectionScore {
  readonly section: Section;
  readonly itemsScored: number;
  readonly correct: number;
  /** correct / itemsScored, or 0 when the section had no items. */
  readonly accuracy: number;
}

/** A per-cluster score line. */
export interface ClusterScore {
  readonly cluster: SkillCluster;
  readonly itemsScored: number;
  readonly correct: number;
  readonly accuracy: number;
}

/**
 * A repair target the review queue is populated from. Structurally the authority's
 * `PracticeRepairTarget`; redeclared here so the policy layer does not depend on
 * the authority (the dependency runs the other way).
 */
export interface PracticeTestReviewTarget {
  readonly kcId: string;
  readonly skill?: ReasoningOperation;
}

/** The scored result of one completed practice test. */
export interface PracticeTestScore {
  readonly itemsScored: number;
  readonly correct: number;
  readonly perSection: readonly SectionScore[];
  readonly perCluster: readonly ClusterScore[];
  /** Question ids the learner missed — the set the review flow reveals + repairs. */
  readonly missedQuestionIds: readonly string[];
  /**
   * Science misses as review targets, most-missed KC first, deduplicated. CARS
   * misses are not queued here — CARS repair is its own skill axis (WS7), not a
   * per-KC repair.
   */
  readonly reviewTargets: readonly PracticeTestReviewTarget[];
}

const accuracy = (correct: number, total: number): number => (total > 0 ? correct / total : 0);

/**
 * Score a completed fixed form: totals, per-section and per-cluster lines, the
 * missed-item set, and the science review targets. Deterministic; sections and
 * clusters come out in first-seen order for a stable envelope.
 */
export function scorePracticeTest(items: readonly PracticeTestScoredItem[]): PracticeTestScore {
  const bySection = new Map<Section, { itemsScored: number; correct: number }>();
  const byCluster = new Map<SkillCluster, { itemsScored: number; correct: number }>();
  const missedQuestionIds: string[] = [];
  // KC -> { misses, skill } so review targets can be ranked worst-first.
  const missesByKc = new Map<string, { misses: number; skill: ReasoningOperation | undefined }>();
  let correctTotal = 0;

  for (const item of items) {
    const section = bySection.get(item.section) ?? { itemsScored: 0, correct: 0 };
    section.itemsScored += 1;
    if (item.correct) section.correct += 1;
    bySection.set(item.section, section);

    if (item.cluster !== null) {
      const cluster = byCluster.get(item.cluster) ?? { itemsScored: 0, correct: 0 };
      cluster.itemsScored += 1;
      if (item.correct) cluster.correct += 1;
      byCluster.set(item.cluster, cluster);
    }

    if (item.correct) {
      correctTotal += 1;
      continue;
    }
    missedQuestionIds.push(item.questionId);
    // Science misses with a KC are the repair grain the queue uses. CARS misses
    // (carsSkill set, kcId null) fall through — they are not per-KC repairs.
    if (item.section !== 'cars' && item.kcId !== null) {
      const entry = missesByKc.get(item.kcId) ?? { misses: 0, skill: item.skill ?? undefined };
      entry.misses += 1;
      if (entry.skill === undefined && item.skill !== null) entry.skill = item.skill;
      missesByKc.set(item.kcId, entry);
    }
  }

  const perSection: SectionScore[] = [...bySection.entries()].map(([section, s]) => ({
    section,
    itemsScored: s.itemsScored,
    correct: s.correct,
    accuracy: accuracy(s.correct, s.itemsScored),
  }));
  const perCluster: ClusterScore[] = [...byCluster.entries()].map(([cluster, c]) => ({
    cluster,
    itemsScored: c.itemsScored,
    correct: c.correct,
    accuracy: accuracy(c.correct, c.itemsScored),
  }));

  const reviewTargets: PracticeTestReviewTarget[] = [...missesByKc.entries()]
    .sort((a, b) => b[1].misses - a[1].misses || (a[0] < b[0] ? -1 : 1))
    .map(([kcId, entry]) =>
      entry.skill !== undefined ? { kcId, skill: entry.skill } : { kcId },
    );

  return {
    itemsScored: items.length,
    correct: correctTotal,
    perSection,
    perCluster,
    missedQuestionIds,
    reviewTargets,
  };
}

// --- Decay-weighted mastery re-measure --------------------------------------

/** Grain a re-measured unit is tracked at. Kept beside the read, never inferred. */
export type PracticeTestUnitGrain = 'kc' | 'skill' | 'cars' | 'cluster' | 'section';

/**
 * One unit's result on ONE sitting: how many of that unit's items the learner
 * got right, out of how many the sitting served, and when the sitting happened.
 */
export interface DatedUnitObservation {
  readonly unitId: string;
  readonly grain: PracticeTestUnitGrain;
  readonly correct: number;
  readonly total: number;
  readonly at: UtcTimestamp;
}

export interface RemeasureConfig {
  /**
   * Days for a test's weight to halve. At 30 a test from a month ago counts half
   * as much as today's, one from two months ago a quarter — the spacing horizon
   * periodic tests run on, so the freshest retrieval dominates the read.
   */
  readonly halfLifeDays: number;
}

export const PRACTICE_TEST_REMEASURE_CONFIG: RemeasureConfig = { halfLifeDays: 30 };

const DAY_MS = 86_400_000;

/** `2^(-ageDays / halfLife)`: 1 at age 0, halving every `halfLife` days. */
export function decayWeight(ageDays: number, halfLifeDays: number): number {
  if (halfLifeDays <= 0) return ageDays <= 0 ? 1 : 0;
  if (ageDays <= 0) return 1;
  return Math.pow(2, -ageDays / halfLifeDays);
}

/** A re-measured capability read for one unit. */
export interface UnitRemeasure {
  readonly unitId: string;
  readonly grain: PracticeTestUnitGrain;
  /** Decay-weighted accuracy in [0,1] — the re-measured capability read. */
  readonly remeasured: number;
  /** Sum of decay weights × items, i.e. the effective evidence behind the read. */
  readonly weightedItems: number;
  /** How many sittings contributed. */
  readonly sittings: number;
}

/**
 * Decay-weighted accuracy of a unit across every sitting that touched it:
 *
 *   remeasured = Σ_s w_s · correct_s / Σ_s w_s · total_s,   w_s = 2^(-age_s / H)
 *
 * Weighting at the item level (not the sitting level) so a 30-item sitting counts
 * for more than a 3-item one at the same age, which is the honest thing when
 * sittings differ in how much they sampled the unit. Returns null for a unit with
 * no items at all.
 */
export function decayWeightedAccuracy(
  observations: readonly DatedUnitObservation[],
  now: UtcTimestamp,
  halfLifeDays: number = PRACTICE_TEST_REMEASURE_CONFIG.halfLifeDays,
): number | null {
  const nowMs = Date.parse(now);
  let num = 0;
  let den = 0;
  for (const obs of observations) {
    if (obs.total <= 0) continue;
    const ageDays = Math.max(0, (nowMs - Date.parse(obs.at)) / DAY_MS);
    const w = decayWeight(ageDays, halfLifeDays);
    num += w * obs.correct;
    den += w * obs.total;
  }
  return den > 0 ? num / den : null;
}

/**
 * Re-measure every unit in a test history by decay-weighted averaging.
 *
 * `observations` is the whole per-unit history — every prior sitting's per-unit
 * result plus the sitting just completed (which sits at `now` and so carries the
 * full weight). Units are returned in first-seen order for a stable envelope.
 */
export function remeasureMastery(
  observations: readonly DatedUnitObservation[],
  now: UtcTimestamp,
  cfg: RemeasureConfig = PRACTICE_TEST_REMEASURE_CONFIG,
): UnitRemeasure[] {
  const nowMs = Date.parse(now);
  const byUnit = new Map<
    string,
    { grain: PracticeTestUnitGrain; num: number; den: number; sittings: number }
  >();
  const order: string[] = [];
  for (const obs of observations) {
    if (obs.total <= 0) continue;
    const ageDays = Math.max(0, (nowMs - Date.parse(obs.at)) / DAY_MS);
    const w = decayWeight(ageDays, cfg.halfLifeDays);
    const entry = byUnit.get(obs.unitId);
    if (entry === undefined) {
      byUnit.set(obs.unitId, {
        grain: obs.grain,
        num: w * obs.correct,
        den: w * obs.total,
        sittings: 1,
      });
      order.push(obs.unitId);
    } else {
      entry.num += w * obs.correct;
      entry.den += w * obs.total;
      entry.sittings += 1;
    }
  }
  return order.map((unitId) => {
    const entry = byUnit.get(unitId)!;
    return {
      unitId,
      grain: entry.grain,
      remeasured: entry.den > 0 ? entry.num / entry.den : 0,
      weightedItems: entry.den,
      sittings: entry.sittings,
    };
  });
}

/**
 * Turn one completed test's scored items into that sitting's per-cluster unit
 * observations, dated `at`. The caller concatenates these with the stored
 * history of earlier sittings before calling {@link remeasureMastery}.
 */
export function sittingObservations(
  items: readonly PracticeTestScoredItem[],
  at: UtcTimestamp,
): DatedUnitObservation[] {
  const byCluster = new Map<SkillCluster, { correct: number; total: number }>();
  for (const item of items) {
    if (item.cluster === null) continue;
    const entry = byCluster.get(item.cluster) ?? { correct: 0, total: 0 };
    entry.total += 1;
    if (item.correct) entry.correct += 1;
    byCluster.set(item.cluster, entry);
  }
  return [...byCluster.entries()].map(([cluster, e]) => ({
    unitId: cluster,
    grain: 'cluster' as const,
    correct: e.correct,
    total: e.total,
    at,
  }));
}
