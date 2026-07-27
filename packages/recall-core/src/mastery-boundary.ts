/**
 * Recall ↔ mastery boundary ("masteryRecall" — the implementation file describing
 * what the mastery system needs from / with Recall).
 *
 * Hard rule: **Recall never writes mastery.** Flashcards are user-owned *facts*
 * scheduled by FSRS; concept/skill/lesson mastery is the BKT engine's job. The two
 * are deliberately disjoint so nothing double-counts:
 *   - docs/mastery-pipeline.md §0 ("FSRS stays with the separate Recall/flashcards
 *     feature; mastery decay is BKT-based and independent") and §9.5 (Recall boundary).
 *   - MCAT_MASTERY_PLAN.md §9.2 (facts → FSRS; concept/skill mastery → BKT decay).
 *
 * What mastery needs FROM Recall: nothing that can move P(L). Recall must not call
 * `applyMasteryAttempt`, must not write the `mastery_*` tables, and must not import
 * `@mcat/authority-core` or the mastery policies. The ONLY permitted coupling is
 * surfacing recall *minutes* to the daily recap / capacity model (never mastery).
 *
 * What Recall needs FROM mastery: nothing. It is fully decoupled. (A future
 * mastery-driven concept due-review surface is a separate mastery-workstream item
 * that lives in Today's Path/Study, not in this feature.)
 */
import type { RecallSessionReport } from './today-contract';

/** Compile-time + runtime marker asserting the boundary. */
export const RECALL_WRITES_MASTERY = false as const;

export interface RecallMasteryBoundary {
  /** Always false — Recall is fact-only. */
  readonly writesMastery: false;
  /** Recall reads no mastery state. */
  readonly readsMastery: false;
  /** The one permitted coupling: recall minutes may feed the daily capacity/recap. */
  readonly surfacesDailyMinutes: true;
}

export const masteryRecall: RecallMasteryBoundary = {
  writesMastery: false,
  readsMastery: false,
  surfacesDailyMinutes: true,
};

/**
 * The only value Recall exposes toward the mastery/capacity side: minutes spent.
 * This is NOT mastery and must never be fed into BKT/IRT.
 */
export function recallDailyMinutes(report: RecallSessionReport): number {
  return report.minutesSpent;
}
