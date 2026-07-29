import type { CapacityLabel, PlannerReason, Task } from '@mcat/domain';
import type { PolicyManifest } from './manifest';

export const PLANNER_MANIFEST: PolicyManifest = {
  policyId: 'planner',
  version: 'provisional-v1',
  status: 'provisional_active',
  summary: 'Capacity classification (P50/P80 + buffer) and priority-reason task ordering.',
};

export interface PlannerConfig {
  disruptionBuffer: number; // multiply P80 by (1 + buffer)
  reviewShareTarget: number; // 0.20–0.30
}

export const PLANNER_CONFIG: PlannerConfig = {
  disruptionBuffer: 0.1,
  reviewShareTarget: 0.25,
};

export interface CapacityInput {
  availableMinutesPerWeek: number;
  /** Null when the learner has no scheduled test date (rolling plan). */
  weeksRemaining: number | null;
  requiredP50Minutes: number;
  requiredP80Minutes: number;
}

export function classifyCapacity(input: CapacityInput, cfg: PlannerConfig = PLANNER_CONFIG): CapacityLabel {
  if (input.weeksRemaining === null) return 'rolling';
  const capacity = input.availableMinutesPerWeek * input.weeksRemaining;
  const bufferedP80 = input.requiredP80Minutes * (1 + cfg.disruptionBuffer);
  if (capacity >= bufferedP80) return 'on_track';
  if (capacity >= input.requiredP50Minutes) return 'tight';
  return 'goal_plan_mismatch';
}

/** Lower number = higher priority. Prerequisite repair and freshness beat new learning. */
const PRIORITY_RANK: Readonly<Record<PlannerReason, number>> = {
  UNFINISHED_CHECKPOINT: 0,
  PREREQUISITE_BLOCKER: 1,
  FAILED_REPAIR: 2,
  FRESHNESS_RISK: 3,
  OVERDUE_REVIEW: 4,
  UNRESOLVED_ERROR: 5,
  PASSAGE_GAP: 6,
  TIMED_GAP: 7,
  PROTECTED_GAP: 8,
  // Reinforcing material already taught outranks teaching something new, and
  // ranks below every repair: a withheld claim is not a fault to fix.
  TAUGHT_NOT_MASTERED: 9,
  COVERAGE_GAP: 10,
  CARS_CONTACT: 11,
  NEW_LEARNING: 12,
  OPTIONAL_DEPTH: 13,
  CAPACITY_CONSTRAINT: 14,
};

export const priorityRank = (reason: PlannerReason): number => PRIORITY_RANK[reason];

/** Stable ordering of ready tasks by priority. Blocked/snoozed/complete sink to the bottom. */
export function orderTasks(tasks: readonly Task[]): Task[] {
  const activeRank = (t: Task): number => (t.status === 'ready' || t.status === 'in_progress' ? 0 : 1);
  return [...tasks]
    .map((t, i) => ({ t, i }))
    .sort((a, b) => {
      const byActive = activeRank(a.t) - activeRank(b.t);
      if (byActive !== 0) return byActive;
      const byReason = priorityRank(a.t.priorityReason) - priorityRank(b.t.priorityReason);
      if (byReason !== 0) return byReason;
      return a.i - b.i; // stable
    })
    .map((x) => x.t);
}

/** The Continue target is the first in-progress/ready task after ordering. */
export function continueTarget(tasks: readonly Task[]): Task | null {
  const ordered = orderTasks(tasks);
  return ordered.find((t) => t.status === 'in_progress') ?? ordered.find((t) => t.status === 'ready') ?? null;
}
