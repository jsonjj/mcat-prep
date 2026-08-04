import type {
  ChoiceId,
  ReasoningOperation,
  Section,
  SkillCluster,
  UtcTimestamp,
} from '@mcat/contracts';
import {
  estimatePracticeTestScaled,
  type DatedUnitObservation,
  type PracticeTestLengthTier,
} from '@mcat/policies';
import type { SessionRecord } from '@mcat/diagnostic-runner';
import type { PracticeTestBank } from './bank';
import type { PracticeTestFinalize, PracticeTestResultView } from './engine';

/**
 * One per-item attempt the completion carries into the authority's attempt log
 * (Task 2). Structurally identical to `@mcat/authority-core`'s
 * `PracticeTestAttempt`, defined here so the runner never depends UP the stack.
 */
export interface PracticeTestAttemptPayload {
  readonly questionId: string;
  readonly kcId: string | null;
  readonly skill: ReasoningOperation | null;
  readonly cluster: SkillCluster | null;
  readonly familyId: string | null;
  readonly chosenChoiceId: ChoiceId | null;
  readonly correct: boolean;
  readonly elapsedMs: number | null;
}

/**
 * The scored-result payload the completion recorder persists (WS5, §6).
 * Structurally identical to `@mcat/authority-core`'s `PracticeTestCompletion`
 * (all fields present here, so it is assignable to that type's optional ones),
 * so both the dev runner and the deployed learner-API build it the SAME way and
 * hand it to `Authority.recordPracticeTestResult`.
 */
export interface PracticeTestCompletionResult {
  readonly sittingId: string;
  readonly takenOn: UtcTimestamp;
  readonly tier: PracticeTestLengthTier;
  readonly itemsScored: number;
  readonly correct: number;
  readonly sections: ReadonlyArray<{ section: Section; pctCorrect: number }>;
  readonly scaledScore: number;
  readonly reviewTargets: ReadonlyArray<{ kcId: string; skill?: ReasoningOperation }>;
  /** Every item scored this sitting → the durable never-reuse set (Task 1). */
  readonly scoredItemIds: readonly string[];
  /** This sitting's per-unit observations → the durable re-measure history (Task 1). */
  readonly unitObservations: readonly DatedUnitObservation[];
  /** Per-item attempts → the Mistakes/error-log + pattern queue (Task 2). */
  readonly attempts: readonly PracticeTestAttemptPayload[];
}

export interface PracticeTestCompletionInput {
  /** The learner's chosen option per item across the sitting's blocks. */
  readonly picked: ReadonlyMap<string, ChoiceId | null>;
  /** The end-to-end sitting id (minted at START, reused at completion). */
  readonly sittingId: string;
  readonly tier: PracticeTestLengthTier;
  readonly now: UtcTimestamp;
}

/**
 * Turn a completed sitting into the scored-result the authority persists.
 *
 * The per-section %-correct are the dashboard's trend points; the scaled score
 * is the conservative estimate midpoint (the range is re-derived on read). It
 * also carries the DURABLE freshness (`finalize`, Task 1) and the per-item
 * ATTEMPTS (Task 2) so the authority can persist the never-reuse set + re-measure
 * history and feed the same Mistakes/error-log queue adaptive practice uses. The
 * attempts are built from the response log joined to the bank classification and
 * the picked options accumulated across the sitting's blocks.
 */
export function buildPracticeTestCompletion(
  bank: PracticeTestBank,
  record: SessionRecord,
  result: PracticeTestResultView,
  finalize: PracticeTestFinalize,
  input: PracticeTestCompletionInput,
): PracticeTestCompletionResult {
  const overallPct = result.itemsScored > 0 ? (result.correct / result.itemsScored) * 100 : 0;
  const attempts: PracticeTestAttemptPayload[] = record.responses.map((r) => {
    const c = bank.classify(r.questionId);
    return {
      questionId: r.questionId,
      kcId: c?.kcId ?? null,
      skill: c?.skill ?? null,
      cluster: c?.cluster ?? null,
      familyId: c?.familyId ?? r.familyId ?? null,
      chosenChoiceId: input.picked.get(r.questionId) ?? null,
      correct: r.correct,
      // The engine stores 0 for an uncaptured time; the log wants NULL ("not
      // captured") to keep it apart from a real instant 0 (WS0).
      elapsedMs: r.elapsedMs > 0 ? r.elapsedMs : null,
    };
  });
  return {
    sittingId: input.sittingId,
    takenOn: input.now,
    tier: input.tier,
    itemsScored: result.itemsScored,
    correct: result.correct,
    sections: result.perSection.map((s) => ({
      section: s.section,
      pctCorrect: Math.round(s.accuracy * 100),
    })),
    scaledScore: estimatePracticeTestScaled(overallPct, result.itemsScored).point,
    reviewTargets: result.reviewTargets.map((t) =>
      t.skill !== undefined ? { kcId: t.kcId, skill: t.skill } : { kcId: t.kcId },
    ),
    scoredItemIds: finalize.scoredItemIds,
    unitObservations: finalize.unitObservations,
    attempts,
  };
}
