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
  /** Practice unlocks only after this many lessons are completed. */
  readonly practiceUnlockLessons: number; // 3
  /** Practice is sized to review need: ~this many questions per weak/overdue taught KC. */
  readonly questionsPerReviewKc: number; // 2
  /** A 2nd CARS Duel is added on presets at/above this many minutes. */
  readonly carsSecondAtBudget: number; // 240 (4 hr)
  /**
   * Reserved short Review-Mistakes "spacer" sessions, planned every day so the
   * ordering can break up long same-kind runs (back-to-back practice/lessons) and
   * so a short error check-in always appears. 2/day normally, 3 on longer budgets;
   * each session is kept short (min–max items) — real pile-ups still trigger the
   * authority's mid-day injector on top of these.
   */
  readonly mistakesReserved: {
    readonly perDay: number; // 2
    readonly perDayLongBudget: number; // 3 (>= carsSecondAtBudget)
    readonly minItems: number; // 3 (short floor — a short session still appears)
    readonly maxItems: number; // 8 (short ceiling — keep each session short)
  };
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
  practiceUnlockLessons: 3,
  questionsPerReviewKc: 2,
  carsSecondAtBudget: 240,
  mistakesReserved: { perDay: 2, perDayLongBudget: 3, minItems: 3, maxItems: 8 },
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
  /** True when this lesson's P(L) has already crossed the mastery threshold (or was completed). */
  readonly mastered: boolean;
  /** True when the lesson's cluster already has evidence (coverage). */
  readonly covered: boolean;
  /** All prerequisite lessons are complete (authority-computed). Locked lessons are never offered. */
  readonly unlocked: boolean;
  /** How many other candidate lessons this one unlocks (downstream dependents) — drives "how much it unlocks". */
  readonly dependentsCount: number;
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
  /** Count-only open mistakes (past days); the mistakes section owns the actual items. */
  readonly mistakesOpen: number;
  /** Practice is unlocked once enough lessons are completed (teach-before-test gate). */
  readonly practiceUnlocked: boolean;
  /** Number of already-taught KCs that are weak/overdue — Practice is sized to this, not the budget. */
  readonly practiceReviewNeed: number;
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
  /** Leftover budget offered as optional free study (practice is bounded to review need). */
  readonly freeStudyMinutes: number;
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
  if (band === 'pause_new') return 0; // debt recovery: no new lessons today
  if (band === 'reduce_new') return cfg.newLessonCap; // throttle to the base cap
  // Normal: FILL the whole budget with new lessons when they're available (bounded
  // only by the candidate list). Practice then fills any remainder once unlocked.
  return Math.ceil(budgetMinutes / cfg.costs.lesson);
}

// ---- Step: core sizing (by due-volume / debt) --------------------------------

/**
 * Size the Recall block for a recall load + budget, or null when there aren't
 * enough due cards. Sized as a %-of-budget share flexing with review debt, within
 * the card floor/ceiling. Shared by the full build AND the authority's mid-day
 * "a deck was just added" recall injection so both size it identically (and both
 * hand Recall an explicit card count that it honors and stops at).
 */
export function sizeRecall(
  recall: TodaysPathRecallLoad,
  budgetMinutes: number,
  cfg: TodaysPathConfig = TODAYS_PATH_CONFIG,
): { cards: number; minutes: number } | null {
  if (recall.due < cfg.eligibility.recallMinDue) return null;
  const band = reviewDebtBand(recall, budgetMinutes, cfg);
  const share = recallShareFor(band, cfg);
  const ceiling = recallCeilingFor(band, cfg);
  const byBudget = Math.round((share * budgetMinutes) / cfg.costs.recallPerCard);
  const available = recall.due + recall.newAvailable;
  const cards = Math.min(clamp(byBudget, cfg.blocks.recallMinCards, ceiling), available);
  if (cards <= 0) return null;
  return { cards, minutes: Math.round(cards * cfg.costs.recallPerCard) };
}

interface CoreSizes {
  readonly recallCards: number | null; // null = skip
  readonly recallMinutes: number;
}

function sizeCore(snap: TodaysPathSnapshot, cfg: TodaysPathConfig): CoreSizes {
  // Recall only (Review Mistakes are reserved as short spacer sessions in buildTodaysPath).
  const recall = sizeRecall(snap.recall, snap.dailyBudgetMinutes, cfg);
  return { recallCards: recall?.cards ?? null, recallMinutes: recall?.minutes ?? 0 };
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
  // How much it unlocks: real downstream-dependent count when the prereq map is
  // present; falls back to KC count as a proxy until then.
  const unlock =
    lesson.dependentsCount > 0 ? clamp01(lesson.dependentsCount / 4) : clamp01(lesson.kcCount / 6);
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

  const core = sizeCore(snap, cfg);
  const carriedKinds = new Set(carried.map((c) => c.kind));

  // --- Reserve the mandatory core (skip a kind already carried over). ---
  const coreActivities: PlannedActivity[] = [];
  let spent = 0;

  // CARS Duel — every day (1 near the middle; a 2nd on longer presets, ordered at
  // ~1/3 and ~2/3). Fixed cost; placement handled in orderActivities.
  if (!carriedKinds.has('cars_duel')) {
    const carsWanted = snap.dailyBudgetMinutes >= cfg.carsSecondAtBudget ? 2 : 1;
    for (let c = 0; c < carsWanted; c += 1) {
      if (spent + cfg.costs.carsDuel > budgetForNew) break;
      coreActivities.push({
        activityId: carsWanted === 1 ? 'cars-duel' : `cars-duel:${c + 1}`,
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

  // Review Mistakes — RESERVED as short "spacer" sessions (2–3/day), planned even
  // when nothing is open yet ("a short session still appears"). Ordering interleaves
  // them so they break up long same-kind runs (back-to-back practice/lessons), and
  // misses that pile up during the day are caught by the next reserved session (the
  // authority also injects an extra one mid-day on a real pile-up). Execution is a
  // placeholder for now (links to the Mistakes page — no repair runner yet).
  const mistakesWanted =
    snap.dailyBudgetMinutes >= cfg.carsSecondAtBudget
      ? cfg.mistakesReserved.perDayLongBudget
      : cfg.mistakesReserved.perDay;
  const carriedMistakes = carried.filter((c) => c.kind === 'review_mistakes').length;
  const mistakesToReserve = Math.max(0, mistakesWanted - carriedMistakes);
  const mistakesPerSession = clamp(
    Math.ceil(snap.mistakesOpen / Math.max(1, mistakesWanted)),
    cfg.mistakesReserved.minItems,
    cfg.mistakesReserved.maxItems,
  );
  const mistakesSessionMinutes = mistakesPerSession * cfg.costs.mistakePerItem;
  for (let m = 0; m < mistakesToReserve; m += 1) {
    if (spent + mistakesSessionMinutes > budgetForNew) break;
    const ordinal = carriedMistakes + m;
    coreActivities.push({
      activityId: ordinal === 0 ? 'review-mistakes' : `review-mistakes:${ordinal + 1}`,
      kind: 'review_mistakes',
      title: 'Review Mistakes',
      detail: 'Quick error check-in — clear anything that piled up (formative — never mastery).',
      estimatedMinutes: mistakesSessionMinutes,
      count: mistakesPerSession,
      minutesBudget: null,
      focus: null,
      lessonSlug: null,
      lessonId: null,
      priorityReason: 'UNRESOLVED_ERROR',
      carriedOver: false,
    });
    spent += mistakesSessionMinutes;
  }

  // --- Scored block: NEW lessons first (prioritized), then BOUNDED practice. ---
  // Practice is sized to real review need (weak/overdue taught KCs), NOT to fill the
  // budget; leftover time becomes optional "free study". Early days skew to new
  // lessons (little taught yet → little to review); as coverage grows and new lessons
  // deplete, practice naturally takes over.
  const lessonCap = newLessonCapFor(band, snap.dailyBudgetMinutes, cfg);

  const carriedLessonSlugs = new Set(
    carried.filter((c) => c.kind === 'lesson' && c.lessonSlug !== null).map((c) => c.lessonSlug as string),
  );
  const practiceEnabled = snap.practiceUnlocked && !carried.some((c) => c.kind === 'practice');

  const scoredBlock: PlannedActivity[] = [];
  let remaining = budgetForNew - spent;

  // 1) New lessons: only UNLOCKED (prereqs met) + not mastered/carried, best score
  //    first, up to the (band + budget) cap. Same-cluster picks diminish via coverage.
  const coveredNow = new Set<string>();
  const rankedLessons = snap.candidateLessons
    .filter((l) => l.unlocked && !l.mastered && !carriedLessonSlugs.has(l.slug))
    .map((l) => ({ l, base: scoreLesson(l, snap, cfg) }))
    .sort((a, b) => b.base - a.base || a.l.slug.localeCompare(b.l.slug));

  let lessonsPicked = 0;
  for (const { l } of rankedLessons) {
    if (lessonsPicked >= lessonCap || remaining < cfg.costs.lesson) break;
    const covered = l.cluster !== null ? coveredNow.has(l.cluster) || l.covered : l.covered;
    scoredBlock.push({
      activityId: `lesson:${l.slug}`,
      kind: 'lesson',
      title: l.title,
      detail: 'New lesson — teach before testing.',
      estimatedMinutes: cfg.costs.lesson,
      count: null,
      minutesBudget: null,
      focus: null,
      lessonSlug: l.slug,
      lessonId: l.lessonId,
      priorityReason: covered ? 'COVERAGE_GAP' : 'NEW_LEARNING',
      carriedOver: false,
    });
    if (l.cluster !== null) coveredNow.add(l.cluster);
    lessonsPicked += 1;
    remaining -= cfg.costs.lesson;
  }

  // 2) Practice FILLS the remaining budget once unlocked (per-KC teach-before-test),
  //    so the whole day is planned. Split into <=45-min blocks + spread by ordering.
  //    (Priority already went to new lessons above; practice is the reinforcement fill,
  //    which naturally grows as new lessons deplete.)
  let practiceQs = 0;
  if (practiceEnabled) {
    practiceQs = Math.max(0, Math.floor(remaining / cfg.costs.practicePerQuestion));
    remaining -= practiceQs * cfg.costs.practicePerQuestion;
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
        title: 'Practice',
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
  const freeStudyMinutes = Math.max(0, snap.dailyBudgetMinutes - plannedMinutes);
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
    freeStudyMinutes,
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

/** Max-spread a set so no two same-kind items are adjacent when avoidable. */
function maxSpread(items: readonly PlannedActivity[]): PlannedActivity[] {
  const rank: Record<TodaysPathActivityKind, number> = {
    recall: 0,
    lesson: 1,
    cars_duel: 2,
    review_mistakes: 3,
    practice: 4,
  };
  const buckets = new Map<TodaysPathActivityKind, PlannedActivity[]>();
  for (const a of items) {
    const arr = buckets.get(a.kind) ?? [];
    arr.push(a);
    buckets.set(a.kind, arr);
  }
  const result: PlannedActivity[] = [];
  let last: TodaysPathActivityKind | null = null;
  while (result.length < items.length) {
    const remaining = [...buckets.entries()].filter(([, arr]) => arr.length > 0);
    let pool = remaining.filter(([k]) => k !== last);
    if (pool.length === 0) pool = remaining;
    pool.sort((a, b) => b[1].length - a[1].length || rank[a[0]] - rank[b[0]]);
    const [kind, arr] = pool[0]!;
    result.push(arr.shift()!);
    last = kind;
  }
  return result;
}

/**
 * Ordering rules:
 *  - Recall is ALWAYS first (when present); otherwise the day opens on a lesson.
 *  - Lessons / Practice / Review-Mistakes are max-spread so no two of the same kind
 *    run back-to-back (variety — the reason for the per-activity time cap).
 *  - CARS is placed ~middle (1) or ~1/3 and ~2/3 (2); inserting it between non-CARS
 *    items never creates a same-kind adjacency.
 */
export function orderActivities(activities: readonly PlannedActivity[]): PlannedActivity[] {
  const recall = activities.filter((a) => a.kind === 'recall');
  // Recall pinned first; everything else (incl. CARS) is max-spread so no two of the
  // same kind are adjacent when feasible (CARS participates so it can break up practice).
  const seq: PlannedActivity[] = [...recall, ...maxSpread(activities.filter((a) => a.kind !== 'recall'))];

  // Nudge CARS toward ~middle (1) or ~1/3 & ~2/3 (2) via adjacency-safe swaps.
  placeCars(seq);
  return seq;
}

/** Move CARS toward its target fraction(s) with swaps that never create a same-kind adjacency. */
function placeCars(seq: PlannedActivity[]): void {
  const n = seq.length;
  if (n < 3) return;
  const carsIndexes = (): number[] =>
    seq.reduce<number[]>((acc, a, i) => (a.kind === 'cars_duel' ? [...acc, i] : acc), []);
  const idxs = carsIndexes();
  if (idxs.length === 0) return;
  const targets =
    idxs.length === 1 ? [Math.round(n / 2)] : [Math.round(n / 3), Math.round((2 * n) / 3)];
  for (let k = 0; k < idxs.length && k < targets.length; k += 1) {
    const from = carsIndexes()[k]!;
    const to = Math.max(1, Math.min(n - 2, targets[k]!));
    if (from === to) continue;
    const displaced = seq[to]!.kind;
    if (displaced === 'cars_duel') continue;
    const okFrom = seq[from - 1]?.kind !== displaced && seq[from + 1]?.kind !== displaced;
    const okTo = seq[to - 1]?.kind !== 'cars_duel' && seq[to + 1]?.kind !== 'cars_duel';
    if (okFrom && okTo) {
      const tmp = seq[from]!;
      seq[from] = seq[to]!;
      seq[to] = tmp;
    }
  }
}
