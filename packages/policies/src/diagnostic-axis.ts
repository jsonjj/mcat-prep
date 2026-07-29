import type { ClusterInfo } from '@mcat/contracts';
import { CLUSTER_INFO, SKILL_CLUSTERS } from '@mcat/contracts';
import { UNLOCK_WEIGHT } from './diagnostic';

/**
 * The set of buckets a diagnostic measures and reports on.
 *
 * The engine previously reached straight for `SKILL_CLUSTERS`, `CLUSTER_INFO` and
 * `UNLOCK_WEIGHT` at module scope, which hard-wired it to the 15 skill clusters.
 * Nothing in the mathematics depends on *which* partition is used — only on there
 * being one, with a leverage weight per bucket — so the partition is now an
 * argument.
 *
 * This exists so the simulation can sweep the 10 AAMC Foundational Concepts
 * without a contracts migration. It is plumbing: `CLUSTER_AXIS` reproduces the
 * previous hard-wired behaviour exactly, and production passes it.
 */
export interface AxisBucket {
  id: string;
  /** Learner-facing name. */
  title: string;
  /** Learner-facing "what this covers" line, shown beside a reported priority. */
  tested: string;
  section: ClusterInfo['section'];
  /**
   * Leverage multiplier — how much downstream content this bucket unlocks.
   * Feeds item selection and the reported priority ordering.
   */
  unlockWeight: number;
}

export interface DiagnosticAxis {
  /** Identifies the axis in sweep output, e.g. 'cluster-15' or 'fc-10'. */
  id: string;
  buckets: readonly AxisBucket[];
}

/** Bucket ids in their canonical order — the engine's iteration list. */
export const axisIds = (axis: DiagnosticAxis): readonly string[] =>
  axis.buckets.map((b) => b.id);

/** Index an axis for O(1) lookup. Build once per run, not per item. */
export function indexAxis(axis: DiagnosticAxis): ReadonlyMap<string, AxisBucket> {
  return new Map(axis.buckets.map((b) => [b.id, b]));
}

/**
 * The 15 skill clusters, assembled from the existing contracts tables. Passing
 * this must leave engine behaviour bit-identical to the hard-wired version —
 * that equivalence is the acceptance test for the injection change.
 */
export const CLUSTER_AXIS: DiagnosticAxis = {
  id: 'cluster-15',
  buckets: SKILL_CLUSTERS.map((c) => ({
    id: c,
    title: CLUSTER_INFO[c].title,
    tested: CLUSTER_INFO[c].tested,
    section: CLUSTER_INFO[c].section,
    unlockWeight: UNLOCK_WEIGHT[c] ?? 0,
  })),
};

export { FC_AXIS, FC_PLUS_AXIS, fcForLesson, kcsByFc, lessonsByFc } from './diagnostic-axis-fc';
