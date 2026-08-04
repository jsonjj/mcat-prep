import type { Section, UtcTimestamp } from '@mcat/contracts';
import {
  assemblePracticeTest,
  HALF_LENGTH_BLUEPRINT,
  poolSupportsPracticeTest,
  remeasureMastery,
  scorePracticeTest,
  sittingObservations,
  validatePracticeTestForm,
  type DatedUnitObservation,
  type PracticeTestBlueprint,
  type PracticeTestScoredItem,
  type SectionScore,
  type ClusterScore,
  type PracticeTestReviewTarget,
  type UnitRemeasure,
} from '@mcat/policies';
import {
  PRACTICE_TEST_SECTION_ORDER,
  type PracticeTestBank,
  type PracticeTestItemView,
} from './bank';
import type { ScoredResponse, SessionRecord } from '@mcat/diagnostic-runner';

/**
 * Pure orchestration for the periodic practice test (WS5).
 *
 * This is the diagnostic engine's fixed-form sibling. It reuses the SAME session
 * store — opaque token, SHA-256, append-only responses, one-use block tokens —
 * and the same result-envelope idea, and drops the one thing that made the
 * diagnostic adaptive: there is no routing. The form is assembled once from the
 * session seed, dealt section by section, and scored at the end by a plain key
 * match. Which block comes next is a function of how many items have been
 * committed, never of how many were correct.
 *
 * The form is reconstructed from `(bank candidates, the learner's already-scored
 * set, the session seed)` on every request, exactly as the diagnostic replays
 * its route — so a refresh mid-sitting returns the same items — and the learner's
 * scored set only grows when a sitting COMPLETES, which is what keeps the form
 * stable across a single sitting while guaranteeing the next sitting is fresh.
 */

/** The result envelope a completed practice test returns. */
export interface PracticeTestResultView {
  itemsScored: number;
  correct: number;
  perSection: SectionScore[];
  perCluster: ClusterScore[];
  /** Ids the learner missed — the review flow reveals + repairs these. */
  missedQuestionIds: string[];
  /** Science misses as review-queue targets (most-missed KC first). */
  reviewTargets: PracticeTestReviewTarget[];
  /** Decay-weighted per-cluster capability re-measure across the learner's test history. */
  remeasure: UnitRemeasure[];
  /** True — a served form always passed validate-before-serve; carried for the client. */
  blueprintMet: boolean;
}

export interface PracticeTestBlockView {
  done: boolean;
  progress: number;
  itemsScored: number;
  /** Length of the whole fixed form, known before the learner starts. */
  totalItems: number;
  /** The open block's section, or null once the form is done. */
  section: Section | null;
  sectionTitle: string | null;
  /** 1-based block number; 0 once done. */
  blockNumber: number;
  blockCount: number;
  /** Items committed in earlier blocks; the open block numbers on from here. */
  itemsCommitted: number;
  questions: PracticeTestItemView[];
  result: PracticeTestResultView | null;
}

/**
 * The DURABLE per-learner freshness the engine reads to assemble a sitting and
 * re-measure across history (WS5, §6, Task 1). It used to live in the in-memory
 * server bank, so a restart lost it; it now rides `LearnerState.practiceTests`
 * (via the authority) and is passed in per request, which is what makes the
 * never-reuse guarantee and the decay-weighted re-measure survive a restart.
 */
export interface PracticeTestFreshness {
  /** Item ids scored on prior COMPLETED sittings — excluded so the form is fresh. */
  readonly scoredIds: ReadonlySet<string>;
  /** Dated per-unit observations from prior sittings — the re-measure history. */
  readonly unitHistory: readonly DatedUnitObservation[];
}

/**
 * The freshness mutations a just-COMPLETED sitting produces, handed back to the
 * caller to PERSIST (WS5, §6, Task 1). The engine no longer writes these to the
 * bank; it returns them exactly once — on the completion transition — so the
 * durable store (`LearnerState.practiceTests`) is the single source of truth and
 * a re-serve of a finished sitting cannot double-count them.
 */
export interface PracticeTestFinalize {
  /** Every item scored on this sitting → merged into the never-reuse set. */
  readonly scoredItemIds: string[];
  /** This sitting's per-unit observations → appended to the re-measure history. */
  readonly unitObservations: DatedUnitObservation[];
}

/**
 * A section-ordered block of the assembled form. `section` names it; the block
 * token machinery keys on the string id, so it is stable across a re-serve.
 */
interface FormBlock {
  section: Section;
  questionIds: string[];
}

/**
 * Cached result per session record, so a re-served done view is byte-stable and
 * the finalize side effects (mark scored, append history) run exactly once — the
 * `SessionRecord` shape is shared with the diagnostic and not widened for this.
 */
const resultCache = new WeakMap<SessionRecord, PracticeTestResultView>();

// A stable uint32 from the session seed (FNV-1a), so within-section delivery
// order is per-sitting but replays identically — mirrors the diagnostic engine.
function seedHash(seed: string, questionId: string): number {
  let h = 0x811c9dc5;
  const s = `${seed}:${questionId}`;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Assemble this sitting's fixed form and split it into section-ordered blocks.
 * Deterministic given the session seed and the learner's already-scored set.
 */
function assembleBlocks(
  bank: PracticeTestBank,
  record: SessionRecord,
  excludeIds: ReadonlySet<string>,
  blueprint: PracticeTestBlueprint,
): { blocks: FormBlock[]; totalItems: number } {
  const assembled = assemblePracticeTest(bank.candidates, {
    excludeIds,
    seed: record.seed,
    blueprint,
  });
  const bySection = new Map<Section, string[]>();
  for (const item of assembled.items) {
    const list = bySection.get(item.section) ?? [];
    list.push(item.questionId);
    bySection.set(item.section, list);
  }
  const blocks: FormBlock[] = [];
  for (const section of PRACTICE_TEST_SECTION_ORDER) {
    const ids = bySection.get(section);
    if (ids === undefined || ids.length === 0) continue;
    // Stable per-sitting delivery order within the section.
    ids.sort((a, b) => seedHash(record.seed, a) - seedHash(record.seed, b));
    blocks.push({ section, questionIds: ids });
  }
  return { blocks, totalItems: assembled.items.length };
}

/** The scored items of a completed sitting, joined back to their classification. */
function scoredItems(bank: PracticeTestBank, record: SessionRecord): PracticeTestScoredItem[] {
  const items: PracticeTestScoredItem[] = [];
  for (const r of record.responses) {
    const c = bank.classify(r.questionId);
    if (c === null) continue;
    items.push({
      questionId: r.questionId,
      section: c.section,
      cluster: c.cluster,
      kcId: c.kcId,
      skill: c.skill,
      carsSkill: c.carsSkill,
      correct: r.correct,
    });
  }
  return items;
}

/**
 * Build the completed-test result envelope and, on the FIRST build for this
 * sitting, the freshness mutations the caller must persist ({@link
 * PracticeTestFinalize}). Pure: the decay-weighted re-measure reads the passed-in
 * `unitHistory` (the durable history from prior sittings, NOT including this one,
 * which sits at `now` and carries full weight), and the scored-set + this
 * sitting's observations are RETURNED rather than written to the bank — the
 * durable store owns them now (Task 1).
 *
 * Cached per record so the envelope is byte-stable across re-serves; `finalize`
 * is present only on the cache-miss (the completion transition) so the caller
 * persists the mutations exactly once and a re-serve cannot double-count them.
 */
function buildResult(
  bank: PracticeTestBank,
  record: SessionRecord,
  unitHistory: readonly DatedUnitObservation[],
  now: UtcTimestamp,
): { result: PracticeTestResultView; finalize: PracticeTestFinalize | undefined } {
  const cached = resultCache.get(record);
  if (cached !== undefined) return { result: cached, finalize: undefined };

  const items = scoredItems(bank, record);
  const score = scorePracticeTest(items);
  const current = sittingObservations(items, now);
  // Re-measure over the whole history INCLUDING this sitting: the durable prior
  // history plus this sitting's observations, which sit at `now` (full weight).
  const remeasure = remeasureMastery([...unitHistory, ...current], now);

  const result: PracticeTestResultView = {
    itemsScored: score.itemsScored,
    correct: score.correct,
    perSection: [...score.perSection],
    perCluster: [...score.perCluster],
    missedQuestionIds: [...score.missedQuestionIds],
    reviewTargets: [...score.reviewTargets],
    remeasure,
    blueprintMet: true,
  };
  resultCache.set(record, result);

  // Hand the caller the freshness to persist: the scored set (freshness for the
  // next sitting) and this sitting's observations (the re-measure history).
  return {
    result,
    finalize: {
      scoredItemIds: record.responses.map((r) => r.questionId),
      unitObservations: current,
    },
  };
}

/** Whether this bank can deal a blueprint-valid form given the excluded (already-scored) ids. */
export function bankSupportsPracticeTest(
  bank: PracticeTestBank,
  excludeIds: ReadonlySet<string> = new Set<string>(),
  blueprint: PracticeTestBlueprint = HALF_LENGTH_BLUEPRINT,
): boolean {
  return poolSupportsPracticeTest(bank.candidates, {
    excludeIds,
    blueprint,
  });
}

/** Score + append one whole block, in the order the server served it. */
export function recordPracticeTestBlock(
  bank: PracticeTestBank,
  record: SessionRecord,
  questionIds: readonly string[],
  answers: Readonly<Record<string, string | null>>,
  elapsedMs: Readonly<Record<string, number>> = {},
): void {
  for (const questionId of questionIds) {
    const c = bank.classify(questionId);
    if (c === null) continue;
    const ms = elapsedMs[questionId] ?? 0;
    const response: ScoredResponse = {
      questionId,
      cluster: c.cluster,
      section: c.section,
      familyId: c.familyId,
      correct: bank.score(questionId, answers[questionId] ?? null),
      elapsedMs: Number.isFinite(ms) && ms > 0 ? Math.min(ms, 30 * 60 * 1000) : 0,
      seq: record.responses.length,
      ...(c.dokLevel !== undefined ? { dokLevel: c.dokLevel } : {}),
    };
    record.responses.push(response);
  }
}

interface ResolveOptions {
  now: UtcTimestamp;
  blueprint?: PracticeTestBlueprint;
}

/**
 * Resolve the current block. An open block re-serves identically however many
 * times it is asked for; when every block is committed, score the form, build
 * the result envelope, and hand back the freshness to persist ({@link
 * PracticeTestFinalize}). Returns the served block (if any) so the caller can
 * mint a one-use block token — the same contract the diagnostic's `resolveBlock`
 * has — plus `finalize` on the commit that COMPLETES the sitting (absent on a
 * re-serve of an already-finished one, so the caller persists it exactly once).
 */
export function resolvePracticeTestBlock(
  bank: PracticeTestBank,
  record: SessionRecord,
  freshness: PracticeTestFreshness,
  opts: ResolveOptions,
): {
  view: PracticeTestBlockView;
  block: { blockId: string; questionIds: string[] } | null;
  finalize?: PracticeTestFinalize;
} {
  const blueprint = opts.blueprint ?? HALF_LENGTH_BLUEPRINT;

  // Done view is built from the response log only — never by re-assembling. Once
  // a sitting completes, its items are marked scored (durably), so re-assembling
  // would deal a DIFFERENT (or infeasible) form from the shrunken fresh pool. The
  // log is the stable source of truth for a finished sitting.
  const doneView = (): {
    view: PracticeTestBlockView;
    finalize: PracticeTestFinalize | undefined;
  } => {
    const { result, finalize } = buildResult(bank, record, freshness.unitHistory, opts.now);
    return {
      view: {
        done: true,
        progress: 1,
        itemsScored: record.responses.length,
        totalItems: Math.max(1, record.responses.length),
        section: null,
        sectionTitle: null,
        blockNumber: 0,
        blockCount: new Set(record.responses.map((r) => r.section)).size,
        itemsCommitted: record.responses.length,
        questions: [],
        result,
      },
      finalize,
    };
  };

  // A re-serve of an already-finished sitting: the result was built (and its
  // freshness handed back) on the transition below, so `buildResult` is a cache
  // hit here and no `finalize` is surfaced again.
  if (record.completed) return { view: doneView().view, block: null };

  // Assemble from the fresh pool (excludeIds fixed for the whole sitting, since
  // items are only marked scored at completion) — stable across re-serves.
  const { blocks, totalItems } = assembleBlocks(bank, record, freshness.scoredIds, blueprint);
  const denom = Math.max(1, totalItems);

  // Which block is open: walk the section blocks accumulating sizes until one
  // extends past the number of committed responses. No routing — the next block
  // is simply the next section.
  let committed = 0;
  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index]!;
    if (record.responses.length < committed + block.questionIds.length) {
      const questions = block.questionIds
        .map((id) => bank.view(id))
        .filter((v): v is PracticeTestItemView => v !== null);
      return {
        view: {
          done: false,
          progress: Math.min(0.98, record.responses.length / denom),
          itemsScored: record.responses.length,
          totalItems: denom,
          section: block.section,
          sectionTitle: questions[0]?.sectionTitle ?? null,
          blockNumber: index + 1,
          blockCount: blocks.length,
          itemsCommitted: committed,
          questions,
          result: null,
        },
        block: { blockId: `section-${block.section}`, questionIds: block.questionIds },
      };
    }
    committed += block.questionIds.length;
  }

  // Every block committed → complete. `buildResult` (via doneView) scores the
  // form once and returns the freshness the caller persists.
  record.completed = true;
  const done = doneView();
  return { view: done.view, block: null, ...(done.finalize ? { finalize: done.finalize } : {}) };
}

/** Independent validation of a served form against its blueprint (for tests/telemetry). */
export function validateServedForm(
  bank: PracticeTestBank,
  record: SessionRecord,
  excludeIds: ReadonlySet<string>,
  blueprint: PracticeTestBlueprint = HALF_LENGTH_BLUEPRINT,
): ReturnType<typeof validatePracticeTestForm> {
  const { blocks } = assembleBlocks(bank, record, excludeIds, blueprint);
  const ids = new Set(blocks.flatMap((b) => b.questionIds));
  const items = bank.candidates.filter((c) => ids.has(c.questionId));
  return validatePracticeTestForm(items, blueprint);
}
