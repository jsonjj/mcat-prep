import type { PlannerReason } from '@mcat/domain';
import type { PolicyManifest } from './manifest';

/**
 * Today's Path — the daily learning-plan ENGINE (pure, DOM-free, no I/O, no clock).
 *
 * Same 5-step skeleton as Practice, reused at the activity level:
 *   Build Allowed List → Score Items → Pick Winners → Order List → (Implement).
 *
 * It ORCHESTRATES the existing engines and writes NO mastery. The authority
 * builds a snapshot from its mastery/coverage reads + the client-fed recall load
 * and candidate lessons, calls this engine, and persists/returns the result.
 *
 * Locked decisions (from MCAT_TODAYS_PATH_PLAN §4) are encoded in
 * TODAYS_PATH_CONFIG; the deferred sub-term coefficients are provisional
 * starting values, documented for later tuning.
 */

export const TODAYS_PATH_MANIFEST: PolicyManifest = {
  policyId: 'todays-path',
  version: 'provisional-v1',
  status: 'provisional_active',
  summary:
    'Daily plan engine: reserve mandatory core (CARS/Recall/Review Mistakes), fill the scored ' +
    'block (Lessons/Practice) by value-per-minute with a phase tilt + diminishing returns, order ' +
    'by teaching rules, carry unfinished work forward capped at ~125%. Writes no mastery.',
};

export interface TodaysPathConfig {
  /** Time costs (minutes). 1 slot = 1 minute. */
  readonly costs: {
    readonly carsDuel: number; // 12 fixed
    readonly lesson: number; // 20 flat
    readonly practicePerQuestion: number; // 2 / question
    readonly recallPerCard: number; // 0.33 (20s) / card
    readonly mistakePerItem: number; // 2 / mistake
  };
  /** Block floor–ceilings. */
  readonly blocks: {
    readonly practiceMinQ: number; // 6
    readonly practiceMaxQ: number; // 24
    readonly recallMinCards: number; // 4
    readonly recallMaxCards: number; // 20
    readonly mistakesMin: number; // 5
    readonly mistakesMax: number; // 20
  };
  /** Minimum volumes for the mandatory core to be eligible. */
  readonly eligibility: {
    readonly recallMinDue: number; // >= 5 due
    readonly mistakesMinOpen: number; // >= 3 open
  };
  /** Recall %-of-budget share by review-debt band. */
  readonly recallShare: {
    readonly normal: number; // ~0.25 (20–30%)
    readonly reduceNew: number; // ~0.40
    readonly pauseNew: number; // ~0.60 (50–60%)
  };
  /** Recall card ceiling by band — "Recall 4–20 (flexes higher on debt)". */
  readonly recallCeiling: {
    readonly normal: number; // 20
    readonly reduceNew: number; // 40
    readonly pauseNew: number; // 60
  };
  /** Review-debt band thresholds: debt = recall due-minutes / daily budget. */
  readonly reviewDebt: {
    readonly reduceNewAt: number; // 0.30
    readonly pauseNewAt: number; // 0.50
  };
  /** Base NEW-lesson cap and the max it scales to on larger budgets. */
  readonly newLessonCap: number; // 2 (base, small budgets)
  readonly newLessonCapMax: number; // 6 (large budgets)
  /** Hard ceiling on practice questions in a day (large budgets fill via practice). */
  readonly practiceMaxQHard: number; // 90
  /** No single activity may exceed this; larger workloads split into multiple blocks. */
  readonly maxActivityMinutes: number; // 45
  /** Carry-over ceiling: today's total load <= this * preset. */
  readonly carryOverCapPct: number; // 1.25
  /** Diminishing-returns decay applied per additional pick of the same kind. */
  readonly perRepeatDecay: number; // 0.8
  /** Provisional per-section exam weight (blueprint proxy). */
  readonly sectionExamWeight: Readonly<Record<string, number>>;
  readonly defaultExamWeight: number;
}

export const TODAYS_PATH_CONFIG: TodaysPathConfig = {
  costs: {
    carsDuel: 12,
    lesson: 20,
    practicePerQuestion: 2,
    recallPerCard: 1 / 3,
    mistakePerItem: 2,
  },
  blocks: {
    practiceMinQ: 6,
    practiceMaxQ: 24,
    recallMinCards: 4,
    recallMaxCards: 20,
    mistakesMin: 5,
    mistakesMax: 20,
  },
  eligibility: { recallMinDue: 5, mistakesMinOpen: 3 },
  recallShare: { normal: 0.25, reduceNew: 0.4, pauseNew: 0.6 },
  recallCeiling: { normal: 20, reduceNew: 40, pauseNew: 60 },
  reviewDebt: { reduceNewAt: 0.3, pauseNewAt: 0.5 },
  newLessonCap: 2,
  newLessonCapMax: 6,
  practiceMaxQHard: 90,
  maxActivityMinutes: 45,
  carryOverCapPct: 1.25,
  perRepeatDecay: 0.8,
  sectionExamWeight: { bb: 1.0, cp: 0.92, ps: 0.85, cars: 0.8 },
  defaultExamWeight: 0.7,
};

export type TodaysPathActivityKind =
  | 'cars_duel'
  | 'recall'
  | 'review_mistakes'
  | 'lesson'
  | 'practice';

export type ReviewDebtBand = 'normal' | 'reduce_new' | 'pause_new';

export interface TodaysPathRecallLoad {
  readonly dueLearning: number;
  readonly dueReviews: number;
  readonly newAvailable: number;
  readonly due: number;
  readonly estimatedMinutesForDue: number;
}

export interface TodaysPathCandidateLesson {
  readonly lessonId: string;
  readonly slug: string;
  readonly title: string;
  readonly section: string | null;
  readonly cluster: string | null;
  readonly kcCount: number;
  /** True when this lesson's P(L) has already crossed the mastery threshold. */
  readonly mastered: boolean;
  /** True when the lesson's cluster already has evidence (coverage). */
  readonly covered: boolean;
}

/** An activity carried over from a prior day (unfinished), reserved before new planning. */
export interface CarriedActivity {
  readonly activityId: string;
  readonly kind: TodaysPathActivityKind;
  readonly title: string;
  readonly detail: string;
  readonly estimatedMinutes: number;
  readonly count: number | null;
  readonly minutesBudget: number | null;
  readonly focus: string | null;
  readonly lessonSlug: string | null;
  readonly lessonId: string | null;
  readonly priorityReason: PlannerReason;
}

export interface TodaysPathSnapshot {
  readonly planDate: string;
  readonly dailyBudgetMinutes: number;
  readonly dayNumber: number;
  readonly totalDays: number | null;
  /** 0..1 curriculum coverage (clusters with evidence / all clusters). Drives the phase tilt. */
  readonly coveragePct: number;
  readonly recall: TodaysPathRecallLoad;
  readonly mistakesOpen: number;
  readonly practiceAvailable: boolean;
  /** 0..1 aggregate weakness of taught material (higher = more worth practicing). */
  readonly practiceWeakness: number;
  readonly candidateLessons: readonly TodaysPathCandidateLesson[];
  readonly carryOver: readonly CarriedActivity[];
}

export interface PlannedActivity {
  readonly activityId: string;
  readonly kind: TodaysPathActivityKind;
  readonly title: string;
  readonly detail: string;
  readonly estimatedMinutes: number;
  readonly count: number | null;
  readonly minutesBudget: number | null;
  readonly focus: string | null;
  readonly lessonSlug: string | null;
  readonly lessonId: string | null;
  readonly priorityReason: PlannerReason;
  readonly carriedOver: boolean;
}

export interface TodaysPathResult {
  readonly planDate: string;
  readonly dailyBudgetMinutes: number;
  readonly plannedMinutes: number;
  readonly reviewSharePct: number;
  readonly reviewDebtBand: ReviewDebtBand;
  readonly activities: readonly PlannedActivity[];
}

const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));
const clamp = (x: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, x));

// ---- Step: review-debt band --------------------------------------------------

export function reviewDebtBand(
  recall: TodaysPathRecallLoad,
  budgetMinutes: number,
  cfg: TodaysPathConfig = TODAYS_PATH_CONFIG,
): ReviewDebtBand {
  const debt = budgetMinutes > 0 ? recall.estimatedMinutesForDue / budgetMinutes : 0;
  if (debt >= cfg.reviewDebt.pauseNewAt) return 'pause_new';
  if (debt >= cfg.reviewDebt.reduceNewAt) return 'reduce_new';
  return 'normal';
}

function recallShareFor(band: ReviewDebtBand, cfg: TodaysPathConfig): number {
  if (band === 'pause_new') return cfg.recallShare.pauseNew;
  if (band === 'reduce_new') return cfg.recallShare.reduceNew;
  return cfg.recallShare.normal;
}

/** Recall card ceiling for a band — flexes higher on debt so the %-share is reachable. */
function recallCeilingFor(band: ReviewDebtBand, cfg: TodaysPathConfig): number {
  if (band === 'pause_new') return cfg.recallCeiling.pauseNew;
  if (band === 'reduce_new') return cfg.recallCeiling.reduceNew;
  return cfg.recallCeiling.normal;
}

/**
 * Max new lessons for a band + budget. High debt throttles new work regardless of
 * budget; on a normal day the cap scales up so larger presets can admit more new
 * lessons (instead of the day capping out well under the chosen budget).
 */
function newLessonCapFor(
  band: ReviewDebtBand,
  budgetMinutes: number,
  cfg: TodaysPathConfig,
): number {
  if (band === 'pause_new') return 0;
  if (band === 'reduce_new') return 1;
  return clampInt(Math.floor(budgetMinutes / 90), cfg.newLessonCap, cfg.newLessonCapMax);
}

/** Practice-question ceiling scaled to the budget so large presets fill via reinforcement. */
function practiceMaxQFor(budgetMinutes: number, cfg: TodaysPathConfig): number {
  return clampInt(Math.floor(budgetMinutes / 4), cfg.blocks.practiceMaxQ, cfg.practiceMaxQHard);
}

const clampInt = (x: number, lo: number, hi: number): number =>
  Math.max(lo, Math.min(hi, Math.round(x)));

// ---- Step: core sizing (by due-volume / debt) --------------------------------

interface CoreSizes {
  readonly recallCards: number | null; // null = skip
  readonly recallMinutes: number;
  readonly mistakesCount: number | null; // null = skip
  readonly mistakesMinutes: number;
}

function sizeCore(
  snap: TodaysPathSnapshot,
  band: ReviewDebtBand,
  cfg: TodaysPathConfig,
): CoreSizes {
  // Recall: only when enough due cards; sized as a %-of-budget share flexing with debt.
  let recallCards: number | null = null;
  let recallMinutes = 0;
  if (snap.recall.due >= cfg.eligibility.recallMinDue) {
    const share = recallShareFor(band, cfg);
    const ceiling = recallCeilingFor(band, cfg);
    const byBudget = Math.round((share * snap.dailyBudgetMinutes) / cfg.costs.recallPerCard);
    const available = snap.recall.due + snap.recall.newAvailable;
    recallCards = clamp(byBudget, cfg.blocks.recallMinCards, ceiling);
    recallCards = Math.min(recallCards, available);
    recallMinutes = Math.round(recallCards * cfg.costs.recallPerCard);
  }

  // Review Mistakes: only when enough open; sized by open volume (capped). Placeholder
  // execution today (links to the Mistakes page — no repair runner yet).
  let mistakesCount: number | null = null;
  let mistakesMinutes = 0;
  if (snap.mistakesOpen >= cfg.eligibility.mistakesMinOpen) {
    mistakesCount = Math.min(snap.mistakesOpen, cfg.blocks.mistakesMax);
    mistakesMinutes = mistakesCount * cfg.costs.mistakePerItem;
  }

  return { recallCards, recallMinutes, mistakesCount, mistakesMinutes };
}

// ---- Step: score the scored block (lessons + practice) -----------------------

/** Lesson score — differentiated by every driver that has data (never a flat score). */
export function scoreLesson(
  lesson: TodaysPathCandidateLesson,
  snap: TodaysPathSnapshot,
  cfg: TodaysPathConfig,
): number {
  const examWeight =
    (lesson.section !== null ? cfg.sectionExamWeight[lesson.section.toLowerCase()] : undefined) ??
    cfg.defaultExamWeight;
  // How much it unlocks: KC count as a proxy (real DAG unlock-count is thin today).
  const unlock = clamp01(lesson.kcCount / 6);
  // Coverage/deadline urgency: uncovered clusters climb as test day nears.
  const pressure = snap.totalDays !== null ? clamp01(snap.dayNumber / snap.totalDays) : 0.3;
  const coverageUrgency = (lesson.covered ? 0.4 : 1.0) * (0.6 + 0.4 * pressure);
  return clamp01(examWeight * (0.5 + 0.5 * unlock) * coverageUrgency);
}

// ---- Steps: pick winners + order ---------------------------------------------

/** The full engine: build → score → pick → order, with carry-over reserved first. */
export function buildTodaysPath(
  snap: TodaysPathSnapshot,
  cfg: TodaysPathConfig = TODAYS_PATH_CONFIG,
): TodaysPathResult {
  const band = reviewDebtBand(snap.recall, snap.dailyBudgetMinutes, cfg);
  const carryCap = Math.round(snap.dailyBudgetMinutes * cfg.carryOverCapPct);

  // --- Reserve carry-over first (capped at ~125% of the preset). ---
  const carried: PlannedActivity[] = [];
  let carriedMinutes = 0;
  for (const c of snap.carryOver) {
    if (carriedMinutes + c.estimatedMinutes > carryCap) break;
    carried.push({ ...c, carriedOver: true });
    carriedMinutes += c.estimatedMinutes;
  }

  // New planning budget: fill up to the preset, counting carried minutes toward it,
  // and never let the total exceed the ~125% cap.
  const budgetForNew = Math.max(
    0,
    Math.min(snap.dailyBudgetMinutes - carriedMinutes, carryCap - carriedMinutes),
  );

  const core = sizeCore(snap, band, cfg);
  const carriedKinds = new Set(carried.map((c) => c.kind));

  // --- Reserve the mandatory core (skip a kind already carried over). ---
  const coreActivities: PlannedActivity[] = [];
  let spent = 0;

  // CARS Duel — every day, fixed cost, placed mid later.
  if (!carriedKinds.has('cars_duel') && spent + cfg.costs.carsDuel <= budgetForNew) {
    coreActivities.push({
      activityId: 'cars-duel',
      kind: 'cars_duel',
      title: 'CARS Duel',
      detail: 'Sharpen reasoning against an AI sparring partner (formative — never mastery).',
      estimatedMinutes: cfg.costs.carsDuel,
      count: null,
      minutesBudget: null,
      focus: null,
      lessonSlug: null,
      lessonId: null,
      priorityReason: 'CARS_CONTACT',
      carriedOver: false,
    });
    spent += cfg.costs.carsDuel;
  }

  // Recall — near the beginning; sized by due-volume/debt.
  if (
    !carriedKinds.has('recall') &&
    core.recallCards !== null &&
    spent + core.recallMinutes <= budgetForNew
  ) {
    coreActivities.push({
      activityId: 'recall',
      kind: 'recall',
      title: 'Recall',
      detail: `${core.recallCards} flashcard${core.recallCards === 1 ? '' : 's'} due (spaced repetition).`,
      estimatedMinutes: Math.max(1, core.recallMinutes),
      count: core.recallCards,
      minutesBudget: core.recallMinutes,
      focus: null,
      lessonSlug: null,
      lessonId: null,
      priorityReason: 'OVERDUE_REVIEW',
      carriedOver: false,
    });
    spent += Math.max(1, core.recallMinutes);
  }

  // Review Mistakes — near the end; reserved now, ordered later.
  if (
    !carriedKinds.has('review_mistakes') &&
    core.mistakesCount !== null &&
    spent + core.mistakesMinutes <= budgetForNew
  ) {
    coreActivities.push({
      activityId: 'review-mistakes',
      kind: 'review_mistakes',
      title: 'Review Mistakes',
      detail: `${core.mistakesCount} open mistake${core.mistakesCount === 1 ? '' : 's'} to revisit.`,
      estimatedMinutes: core.mistakesMinutes,
      count: core.mistakesCount,
      minutesBudget: null,
      focus: null,
      lessonSlug: null,
      lessonId: null,
      priorityReason: 'UNRESOLVED_ERROR',
      carriedOver: false,
    });
    spent += core.mistakesMinutes;
  }

  // --- Fill the scored block by value-per-minute (phase tilt + diminishing returns). ---
  const phase = clamp01(snap.coveragePct); // 0 early → 1 late
  const lessonTilt = 1 - 0.5 * phase; // new lessons weighted early
  const practiceTilt = 0.5 + 0.5 * phase; // reinforcement weighted late
  const lessonCap = newLessonCapFor(band, snap.dailyBudgetMinutes, cfg);
  const practiceMaxQ = practiceMaxQFor(snap.dailyBudgetMinutes, cfg);

  // Don't re-schedule a kind/lesson that's already carried over (prevents duplicate
  // activity ids like a second `practice` or the same `lesson:<slug>`).
  const carriedLessonSlugs = new Set(
    carried.filter((c) => c.kind === 'lesson' && c.lessonSlug !== null).map((c) => c.lessonSlug as string),
  );
  const practiceEnabled = snap.practiceAvailable && !carried.some((c) => c.kind === 'practice');

  // Re-scoreable lesson candidates (exclude mastered + already-carried). `covered`
  // mutates as we pick so same-cluster lessons diminish.
  const lessons = snap.candidateLessons
    .filter((l) => !l.mastered && !carriedLessonSlugs.has(l.slug))
    .map((l) => ({ ...l }));
  const coveredNow = new Set<string>(
    lessons.filter((l) => l.covered && l.cluster !== null).map((l) => l.cluster as string),
  );

  const scoredBlock: PlannedActivity[] = [];
  let lessonsPicked = 0;
  let practiceQs = 0;
  let remaining = budgetForNew - spent;

  // Practice value scales with COVERAGE (how much taught material exists to reinforce),
  // so early days favor new lessons and reinforcement climbs as coverage completes —
  // this, with the tilt, is what makes new-vs-reteach emerge instead of practice (a
  // cheap 2-min unit) always out-competing a 20-min lesson on raw value-per-minute.
  const practiceValue = clamp01(snap.practiceWeakness * Math.max(0.1, snap.coveragePct));

  // Greedy: at each step pick the higher value-per-minute option that still fits.
  for (let guard = 0; guard < 64; guard += 1) {
    // Best remaining lesson (re-scored against current coverage + diminishing returns).
    let bestLessonIdx = -1;
    let bestLessonVpm = 0;
    if (lessonsPicked < lessonCap && remaining >= cfg.costs.lesson) {
      for (let i = 0; i < lessons.length; i += 1) {
        const l = lessons[i]!;
        const covered = l.cluster !== null ? coveredNow.has(l.cluster) : l.covered;
        const value = scoreLesson({ ...l, covered }, snap, cfg);
        const vpm =
          ((value * lessonTilt) / cfg.costs.lesson) * Math.pow(cfg.perRepeatDecay, lessonsPicked);
        if (vpm > bestLessonVpm) {
          bestLessonVpm = vpm;
          bestLessonIdx = i;
        }
      }
    }

    // Practice increment: first chunk is the floor (6 q); then +2 q up to the ceiling (24 q).
    let practiceVpm = 0;
    let practiceInc = 0;
    let practiceIncMinutes = 0;
    if (practiceEnabled && practiceQs < practiceMaxQ) {
      practiceInc =
        practiceQs === 0
          ? cfg.blocks.practiceMinQ
          : Math.min(2, practiceMaxQ - practiceQs);
      practiceIncMinutes = practiceInc * cfg.costs.practicePerQuestion;
      if (practiceIncMinutes <= remaining) {
        const chunk = Math.floor(practiceQs / cfg.blocks.practiceMinQ);
        practiceVpm =
          ((practiceValue * practiceTilt) / cfg.costs.practicePerQuestion) *
          Math.pow(cfg.perRepeatDecay, chunk);
      } else {
        practiceInc = 0;
      }
    }

    const canLesson = bestLessonIdx >= 0 && bestLessonVpm > 0;
    const canPractice = practiceInc > 0 && practiceVpm > 0;
    if (!canLesson && !canPractice) break;

    if (canLesson && (!canPractice || bestLessonVpm >= practiceVpm)) {
      const chosen = lessons.splice(bestLessonIdx, 1)[0]!;
      scoredBlock.push({
        activityId: `lesson:${chosen.slug}`,
        kind: 'lesson',
        title: chosen.title,
        detail: 'New lesson — teach before testing.',
        estimatedMinutes: cfg.costs.lesson,
        count: null,
        minutesBudget: null,
        focus: null,
        lessonSlug: chosen.slug,
        lessonId: chosen.lessonId,
        priorityReason: chosen.covered ? 'COVERAGE_GAP' : 'NEW_LEARNING',
        carriedOver: false,
      });
      if (chosen.cluster !== null) coveredNow.add(chosen.cluster);
      lessonsPicked += 1;
      remaining -= cfg.costs.lesson;
    } else {
      practiceQs += practiceInc;
      remaining -= practiceIncMinutes;
    }
  }

  // Split the practice questions into blocks no longer than maxActivityMinutes,
  // sized evenly (no tiny leftover), so no single activity runs too long. Ordering
  // then spreads them through the day. Blocks get unique ids (`practice:N`).
  if (practiceQs > 0) {
    const focus = pickPracticeFocus(snap);
    const perBlockMaxQ = Math.max(
      1,
      Math.floor(cfg.maxActivityMinutes / cfg.costs.practicePerQuestion),
    );
    const numBlocks = Math.max(1, Math.ceil(practiceQs / perBlockMaxQ));
    const baseSize = Math.floor(practiceQs / numBlocks);
    const remainder = practiceQs % numBlocks;
    for (let b = 0; b < numBlocks; b += 1) {
      const size = baseSize + (b < remainder ? 1 : 0);
      if (size <= 0) continue;
      const minutes = size * cfg.costs.practicePerQuestion;
      scoredBlock.push({
        activityId: numBlocks === 1 ? 'practice' : `practice:${b + 1}`,
        kind: 'practice',
        title: numBlocks === 1 ? 'Practice' : `Practice ${b + 1} of ${numBlocks}`,
        detail: `${size} adaptive question${size === 1 ? '' : 's'} — a first correct try moves mastery.`,
        estimatedMinutes: minutes,
        count: size,
        minutesBudget: minutes,
        focus,
        lessonSlug: null,
        lessonId: null,
        priorityReason: 'NEW_LEARNING',
        carriedOver: false,
      });
    }
  }

  const ordered = orderActivities([...carried, ...coreActivities, ...scoredBlock]);
  const plannedMinutes = ordered.reduce((sum, a) => sum + a.estimatedMinutes, 0);
  const reviewSharePct =
    plannedMinutes > 0
      ? clamp01(
          ordered
            .filter((a) => a.kind === 'recall' || a.kind === 'review_mistakes')
            .reduce((sum, a) => sum + a.estimatedMinutes, 0) / plannedMinutes,
        )
      : 0;

  return {
    planDate: snap.planDate,
    dailyBudgetMinutes: snap.dailyBudgetMinutes,
    plannedMinutes,
    reviewSharePct,
    reviewDebtBand: band,
    activities: ordered,
  };
}

/** Focus token for the Practice call (weakest section proxy); null = whole exam. */
function pickPracticeFocus(_snap: TodaysPathSnapshot): string | null {
  // Provisional: no focus by default (whole exam). A future refinement can derive a
  // cluster/reasoning-op focus from per-skill weakness.
  return null;
}

/**
 * Order by teaching rules (NOT score order):
 * Recall early · new lessons early · teach-before-test · CARS mid · alternate kinds ·
 * Review Mistakes near the end but not last · end on not-the-hardest · rule-priority tie-break.
 */
export function orderActivities(activities: readonly PlannedActivity[]): PlannedActivity[] {
  const recall = activities.filter((a) => a.kind === 'recall');
  const lessons = activities.filter((a) => a.kind === 'lesson');
  const practice = activities.filter((a) => a.kind === 'practice');
  const cars = activities.filter((a) => a.kind === 'cars_duel');
  const mistakes = activities.filter((a) => a.kind === 'review_mistakes');

  // Interleave lessons + practice blocks so multiple practice sets are SPREAD
  // through the day (alternate kinds), a lesson leading each pair (teach-before-test).
  const interleaved: PlannedActivity[] = [];
  for (let i = 0, j = 0; i < lessons.length || j < practice.length; ) {
    if (i < lessons.length) interleaved.push(lessons[i++]!);
    if (j < practice.length) interleaved.push(practice[j++]!);
  }

  // Base teaching order: recall → interleaved(lessons+practice) → mistakes.
  const base: PlannedActivity[] = [...recall, ...interleaved, ...mistakes];

  // CARS mid: insert around the middle so it breaks up the block (interleaving break).
  if (cars.length > 0) {
    const mid = Math.max(1, Math.floor(base.length / 2));
    base.splice(Math.min(mid, base.length), 0, ...cars);
  }

  // Review Mistakes near the end but NOT last: if it landed last, swap it earlier.
  const lastIdx = base.length - 1;
  if (base.length >= 2 && base[lastIdx]!.kind === 'review_mistakes') {
    const tmp = base[lastIdx]!;
    base[lastIdx] = base[lastIdx - 1]!;
    base[lastIdx - 1] = tmp;
  }

  return base;
}
