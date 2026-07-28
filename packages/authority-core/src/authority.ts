import {
  ContentIdSchema,
  DAILY_MINUTES_DEFAULT,
  DAILY_MINUTES_MAX,
  DAILY_MINUTES_MIN,
  REASONING_OPERATIONS,
  SKILL_CLUSTERS,
  daysBetween,
  newEventId,
  newIdempotencyKey,
  newLearnerId,
  systemClock,
  type BootstrapResponse,
  type BuildTodaysPathInput,
  type TodaysPathView,
  type CarsDuelRubric,
  type CarsReadinessLabel,
  type CarsReadinessView,
  type CarsSkill,
  type Clock,
  type LearnerEvent,
  type LessonMasteryView,
  type MasterySeed,
  type MasteryState,
  type PracticeAttemptCommand,
  type PracticeAttemptResult,
  type PracticeFocus,
  type PracticeQueueItem,
  type PracticeQueueView,
  type ProbableCause,
  type ReasoningOperation,
  type SkillCluster,
  type SkillMasteryView,
  type UtcTimestamp,
} from '@mcat/contracts';
import {
  EvidenceRecordSchema,
  scoreAttempt,
  type CapacityLabel,
  type EvidenceKind,
  type Task,
} from '@mcat/domain';
import {
  activePolicyVersions,
  applyMasteryAttempt,
  bandCenter,
  buildTodaysPath as buildTodaysPathEngine,
  sizeRecall,
  TODAYS_PATH_CONFIG,
  CARS_K_DUEL,
  CARS_K_POTD,
  CARS_V0,
  carsUpdate,
  classifyCapacity,
  computeGhost,
  currentPL,
  evaluateMastery,
  initialMemoryState,
  isCarsOnTrack,
  MASTERY_THRESHOLD,
  overallCarsReadiness,
  PRACTICE_SELECTION_CONFIG,
  practiceSpecId,
  predictedCorrect,
  PRIOR_PL0,
  REVIEW_LINE,
  SEED_CARS_MAX,
  SEED_CARS_MIN,
  SEED_PRIOR_CAP,
  SEED_PRIOR_FLOOR,
  selectPracticeQueue,
  type CarriedActivity,
  type GhostView,
  type MemoryState,
  type PracticeCarsUnit,
  type PracticeSnapshot,
  type PracticeUnit,
  type TodaysPathCandidateLesson,
  type TodaysPathSnapshot,
} from '@mcat/policies';
import { clusterForLesson, loadSyntheticBank, type LoadedBank } from '@mcat/content';
import {
  SyntheticPracticeBankPort,
  type PracticeBankPort,
  type PracticeCandidateUnit,
  type PracticeItemClassification,
  type PracticeRepairTarget,
} from './practice';
import type {
  ErrorEntryView,
  LearnerState,
  MasteryEngineState,
  MasteryMapEntry,
  PracticeItemView,
  PracticeResult,
  SessionSummary,
  StudyPhase,
  StudyStepView,
  TodayView,
  TodaysPathActivityState,
  TodaysPathState,
  WrappedView,
} from './types';

interface PathActivity {
  id: string;
  kind: 'lesson' | 'question' | 'simulation' | 'recall' | 'complete';
  phase?: StudyPhase;
  questionId?: string;
  lessonId?: string;
  specId?: string;
  promptId?: string;
  changeDimensions?: string[];
}

/** The enzyme-inhibition learning path (drives the synthetic vertical). */
const ENZYME_PATH: PathActivity[] = [
  { id: 'lesson', kind: 'lesson', lessonId: 'lesson-enz-inhibition' },
  { id: 'indep1', kind: 'question', phase: 'independent', questionId: 'q-enz-indep-competitive' },
  { id: 'indep2', kind: 'question', phase: 'independent', questionId: 'q-enz-indep-noncompetitive' },
  { id: 'transfer', kind: 'question', phase: 'transfer', questionId: 'q-enz-transfer-lineweaver', changeDimensions: ['representation'] },
  { id: 'passage', kind: 'question', phase: 'passage', questionId: 'q-enz-passage-1' },
  { id: 'sim', kind: 'simulation', specId: 'sim-enz-inhibition' },
  { id: 'simTransfer', kind: 'question', phase: 'transfer', questionId: 'q-enz-sim-transfer-1', changeDimensions: ['domain_context'] },
  { id: 'protected', kind: 'question', phase: 'protected', questionId: 'q-enz-protected-1' },
  { id: 'recall', kind: 'recall', promptId: 'recall-enz-competitive' },
  { id: 'complete', kind: 'complete' },
];

const ENZYME_SKILL = 'bb1-enzyme-inhibition';
const ENZYME_LESSON_ID = 'lesson-enz-inhibition';

/**
 * DEV-ONLY adapter: the synthetic bank tags items with the 8 operation templates
 * (K/Q/E/D/P/A/I/T), not the 7 reasoning operations the mastery engine tracks.
 * This heuristic lets the synthetic vertical populate real mastery numbers in dev;
 * the real v7 producers emit `reasoning_operation` directly (see docs/mastery-pipeline.md §6).
 */
const OPERATION_TAG_TO_REASONING: Readonly<Record<string, ReasoningOperation>> = {
  K: 'IDENTIFY',
  Q: 'QUANTIFY',
  E: 'EVIDENCE',
  D: 'RELATE',
  P: 'EXPLAIN',
  A: 'EXPLAIN',
  I: 'PREDICT',
  T: 'IDENTIFY',
};
// The synthetic bank is intentionally tiny; the placement is a short provisional
// probe (prerequisite skill) and does not reuse items that appear in the study path.
const DIAGNOSTIC_PROBE_IDS = ['q-enz-basics-1'];

const evidenceKindForPhase = (phase: StudyPhase): EvidenceKind => {
  switch (phase) {
    case 'independent':
      return 'independent';
    case 'transfer':
      return 'transfer';
    case 'passage':
      return 'integrated_passage';
    case 'protected':
      return 'protected';
    case 'guided':
      return 'instruction';
  }
};

/**
 * The authoritative engine. Pure with respect to injected `clock`; holds no I/O.
 * Adapters persist `LearnerState` (events are append-only; evidence is derived).
 * In production this runs server-side only (keys never reach the client).
 */
export class Authority {
  readonly bank: LoadedBank;
  private readonly clock: Clock;
  /** Item corpus + per-learner exposure/repair seam for adaptive Practice. */
  readonly practiceBank: PracticeBankPort;

  constructor(
    bank: LoadedBank = loadSyntheticBank(),
    clock: Clock = systemClock,
    practiceBank?: PracticeBankPort,
  ) {
    this.bank = bank;
    this.clock = clock;
    this.practiceBank = practiceBank ?? new SyntheticPracticeBankPort(bank);
  }

  createGuest(): LearnerState {
    return {
      learnerId: newLearnerId(),
      accountState: 'guest',
      createdAt: this.clock.now(),
      onboarding: { diagnosticComplete: false, planConfirmed: false },
      goal: null,
      nextSequence: 0,
      seenIdempotencyKeys: [],
      events: [],
      evidence: [],
      diagnostic: null,
      session: null,
    };
  }

  bootstrap(state: LearnerState): BootstrapResponse {
    return {
      learnerId: state.learnerId,
      accountState: state.accountState,
      bankStatus: this.bank.questions.length > 0 ? 'loaded' : 'not_loaded',
      contentRelease: this.bank.contentRelease,
      apiVersion: 'v1',
      onboardingComplete: state.onboarding.diagnosticComplete && state.onboarding.planConfirmed,
      serverTime: this.clock.now(),
    };
  }

  // ---- Diagnostic ---------------------------------------------------------

  startDiagnostic(state: LearnerState): void {
    if (state.diagnostic === null) {
      state.diagnostic = { itemsScored: 0, seenQuestionIds: [], correctCount: 0, complete: false };
    }
  }

  diagnosticNext(state: LearnerState): { done: boolean; questionId?: string; progress: number } {
    this.startDiagnostic(state);
    const d = state.diagnostic!;
    const remaining = DIAGNOSTIC_PROBE_IDS.filter((id) => !d.seenQuestionIds.includes(id));
    const progress = d.itemsScored / DIAGNOSTIC_PROBE_IDS.length;
    if (remaining.length === 0) {
      d.complete = true;
      state.onboarding.diagnosticComplete = true;
      return { done: true, progress: 1 };
    }
    return { done: false, questionId: remaining[0]!, progress };
  }

  submitDiagnosticAnswer(state: LearnerState, questionId: string, choiceId: string | null): void {
    this.startDiagnostic(state);
    const d = state.diagnostic!;
    if (d.seenQuestionIds.includes(questionId)) return;
    const compiled = this.bank.compiled.get(questionId);
    if (!compiled) return;
    const correct = choiceId === compiled.protected.correct_choice_id;
    d.seenQuestionIds.push(questionId);
    d.itemsScored += 1;
    if (correct) d.correctCount += 1;
    this.recordEvent(
      state,
      this.attemptEvent(state, questionId, choiceId, { assistanceLevel: 'A0', isDiagnosticRetry: false }),
    );
    // Placement evidence is contextual only (never mastery), attributed to the probed skill.
    const probedSkill = this.bank.questions.find((q) => q.id === questionId)?.internal_skill_ids[0] ?? ENZYME_SKILL;
    this.appendEvidence(state, {
      skillId: probedSkill,
      kind: 'placement',
      questionId,
      phase: 'independent',
      correct,
      independent: false,
      changeDimensions: [],
    });
  }

  confirmPlan(
    state: LearnerState,
    goal: { testDate: string | null; targetScore: number | null; minutesPerWeek: number },
  ): void {
    state.goal = goal;
    state.onboarding.planConfirmed = true;
  }

  // ---- Today / plan -------------------------------------------------------

  /**
   * Shared day framing (capacity label, day number/total, coverage, ghost) used by
   * both the legacy Today view and the Today's Path engine so they never drift.
   */
  private dayContext(state: LearnerState): {
    capacityLabel: CapacityLabel;
    dayNumber: number;
    totalDays: number | null;
    coveragePct: number;
    clustersWithEvidence: Set<string>;
    ghost: GhostView;
  } {
    const capacityLabel = classifyCapacity({
      availableMinutesPerWeek: state.goal?.minutesPerWeek ?? 300,
      weeksRemaining: state.goal?.testDate ? this.weeksUntil(state.goal.testDate) : null,
      requiredP50Minutes: 1800,
      requiredP80Minutes: 2600,
    });
    const dayNumber = Math.max(1, Math.floor(daysBetween(state.createdAt, this.clock.now())) + 1);
    const totalDays = state.goal?.testDate
      ? Math.max(1, Math.round(daysBetween(state.createdAt, state.goal.testDate as unknown as UtcTimestamp)))
      : null;
    const clustersWithEvidence = new Set(
      this.getMasteryMap(state)
        .filter((m) => m.base !== 'not_assessed')
        .map((m) => m.cluster),
    );
    const coveragePct = clustersWithEvidence.size / SKILL_CLUSTERS.length;
    let lastEvidenceAt: string | null = null;
    for (const e of state.evidence) {
      if (lastEvidenceAt === null || e.occurredAt > lastEvidenceAt) lastEvidenceAt = e.occurredAt;
    }
    const lastActiveDaysAgo =
      lastEvidenceAt !== null
        ? Math.floor(daysBetween(lastEvidenceAt as unknown as UtcTimestamp, this.clock.now()))
        : null;
    const ghost = computeGhost({
      scheduled: Boolean(state.goal?.testDate),
      dayNumber,
      totalDays,
      coveragePct,
      lastActiveDaysAgo,
    });
    return { capacityLabel, dayNumber, totalDays, coveragePct, clustersWithEvidence, ghost };
  }

  getToday(state: LearnerState): TodayView {
    const ctx = this.dayContext(state);
    const sessionActive = state.session !== null && !this.sessionComplete(state);
    const tasks: Task[] = [
      {
        taskId: 'task-enzyme',
        type: sessionActive ? 'independent_check' : 'lesson',
        title: 'Enzyme inhibition',
        skillId: ENZYME_SKILL,
        cluster: 'BB1',
        estimatedMinutes: 25,
        priorityReason: sessionActive ? 'UNFINISHED_CHECKPOINT' : 'NEW_LEARNING',
        reasonDetail: sessionActive
          ? 'Resume exactly where you left off.'
          : 'Your placement suggests starting here.',
        status: sessionActive ? 'in_progress' : 'ready',
        requiresConnection: false,
      },
      {
        taskId: 'task-quick',
        type: 'quick_practice',
        title: 'Quick practice',
        estimatedMinutes: 5,
        priorityReason: 'OVERDUE_REVIEW',
        status: 'ready',
        requiresConnection: false,
      },
    ];
    const repairsOpen = this.getErrorLog(state).filter((e) => !e.repaired).length;
    return {
      capacityLabel: ctx.capacityLabel,
      continueTaskId: 'task-enzyme',
      tasks,
      reviewSharePct: 0.25,
      dayNumber: ctx.dayNumber,
      totalDays: ctx.totalDays,
      reviewsDue: 0,
      repairsOpen,
      ghost: ctx.ghost,
    };
  }

  // ---- Today's Path — daily learning-plan engine --------------------------
  // Orchestrates the other engines (CARS/Recall/Lessons/Practice/Review Mistakes)
  // and WRITES NO MASTERY. It reads mastery/coverage + a client-fed recall load +
  // candidate lessons, sizes the day to the preset, and persists an ordered plan.

  /**
   * Learner-local plan date with a 4 AM rollover. `offsetMinutes` is the client's
   * `Date.getTimezoneOffset()` (UTC − local, in minutes); 0 falls back to UTC.
   */
  private planDateFor(nowIso: string, offsetMinutes: number): string {
    const localMs = Date.parse(nowIso) - offsetMinutes * 60_000 - 4 * 60 * 60 * 1000;
    return new Date(localMs).toISOString().slice(0, 10);
  }

  private timezoneOffset(state: LearnerState): number {
    return state.timezoneOffsetMinutes ?? 0;
  }

  /** Default daily study budget when the learner hasn't set one (4 hours). */
  private defaultDailyPreset(): number {
    return DAILY_MINUTES_DEFAULT;
  }

  private dailyPreset(state: LearnerState): number {
    return state.goal?.dailyMinutesPreset ?? this.defaultDailyPreset();
  }

  /** Set the daily time-budget in minutes (any value from 2 to 6 hours; clamped). */
  setDailyBudget(state: LearnerState, minutesPerDay: number): void {
    const clamped = Math.max(
      DAILY_MINUTES_MIN,
      Math.min(DAILY_MINUTES_MAX, Math.round(minutesPerDay)),
    );
    state.goal =
      state.goal === null
        ? {
            testDate: null,
            targetScore: null,
            minutesPerWeek: clamped * 7,
            dailyMinutesPreset: clamped,
          }
        : { ...state.goal, dailyMinutesPreset: clamped };
  }

  /**
   * Increment the COUNT-ONLY open-mistake tally (independent misses from Practice /
   * CARS / Lessons). We deliberately store no mistake content — that's the mistakes
   * section's job; the count only decides when to schedule/inject a Mistakes session.
   */
  recordMistake(state: LearnerState, _source?: string): void {
    state.mistakeCount = (state.mistakeCount ?? 0) + 1;
  }

  /** Read the current day's plan (built:false when none exists for today yet). */
  getTodaysPath(state: LearnerState): TodaysPathView {
    return this.todaysPathView(state);
  }

  /** Build (and persist) today's plan; idempotent per day unless `force`. */
  buildTodaysPath(state: LearnerState, input: BuildTodaysPathInput): TodaysPathView {
    const now = this.clock.now();
    // Persist the learner's timezone so reads (which have no request body) use the
    // same local day boundary as the build.
    if (input.timezoneOffsetMinutes !== undefined) {
      state.timezoneOffsetMinutes = input.timezoneOffsetMinutes;
    }
    const planDate = this.planDateFor(now, this.timezoneOffset(state));
    if (state.plan && state.plan.planDate === planDate && !input.force) {
      // Plan already exists for today: don't rebuild, but if Recall just became
      // available (e.g. the learner added their first deck), inject it as the next
      // step so it surfaces immediately with a card count.
      this.maybeInjectRecall(state, input.recallLoad);
      return this.todaysPathView(state);
    }
    // Rebuilding TODAY (e.g. the learner changed their daily time): keep everything
    // they've already finished or started, and only re-plan the remaining time.
    const prior = state.plan && state.plan.planDate === planDate ? state.plan : null;
    const kept = prior
      ? prior.activities.filter((a) => a.status === 'complete' || a.status === 'in_progress')
      : [];
    const keptMinutes = kept.reduce((sum, a) => sum + a.estimatedMinutes, 0);

    const preset = this.dailyPreset(state);
    const ctx = this.dayContext(state);
    const carryOver = this.carryOverFrom(state.plan ?? null, planDate);
    // The engine plans only the time left after what's already done today.
    const engineBudget = Math.max(0, preset - keptMinutes);
    const snapshot = this.todaysPathSnapshot(state, input, planDate, engineBudget, ctx, carryOver);
    const result = buildTodaysPathEngine(snapshot, TODAYS_PATH_CONFIG);
    // Dedupe by activityId as a safety net (the engine already avoids re-scheduling
    // a carried kind/lesson, so collisions shouldn't occur).
    const seen = new Set<string>();
    const activities: TodaysPathActivityState[] = [];
    for (const a of result.activities) {
      if (seen.has(a.activityId)) continue;
      seen.add(a.activityId);
      activities.push({ ...a, status: 'ready' });
    }
    if (prior) {
      // Restore progress on any activity that reappears in the new plan...
      const priorById = new Map(prior.activities.map((a) => [a.activityId, a] as const));
      for (const a of activities) {
        const p = priorById.get(a.activityId);
        if (p && (p.status === 'complete' || p.status === 'in_progress')) a.status = p.status;
      }
      // ...and keep finished/in-progress items that didn't reappear, at the front, so
      // the learner still sees what they already did (never re-offered as new work).
      const newIds = new Set(activities.map((a) => a.activityId));
      const preserved = prior.activities.filter(
        (a) => (a.status === 'complete' || a.status === 'in_progress') && !newIds.has(a.activityId),
      );
      if (preserved.length > 0) activities.unshift(...preserved);
    }

    const plannedMinutes = activities.reduce((sum, a) => sum + a.estimatedMinutes, 0);
    const reviewMinutes = activities
      .filter((a) => a.kind === 'recall' || a.kind === 'review_mistakes')
      .reduce((sum, a) => sum + a.estimatedMinutes, 0);
    state.plan = {
      planDate: result.planDate,
      dailyMinutesPreset: preset,
      dailyBudgetMinutes: preset,
      plannedMinutes,
      freeStudyMinutes: Math.max(0, preset - plannedMinutes),
      reviewSharePct: plannedMinutes > 0 ? Math.min(1, reviewMinutes / plannedMinutes) : 0,
      reviewDebtBand: result.reviewDebtBand,
      version: (state.plan?.version ?? 0) + 1,
      generatedAt: now,
      currentActivityId:
        activities.find((a) => a.status === 'ready' || a.status === 'in_progress')?.activityId ??
        null,
      activities,
      mistakesSessions: activities.filter((a) => a.kind === 'review_mistakes').length,
    };
    return this.todaysPathView(state);
  }

  /** Advance the guided runner: mark one activity in_progress / complete / skipped. */
  recordPlanActivity(
    state: LearnerState,
    activityId: string,
    status: 'in_progress' | 'complete' | 'skipped',
  ): void {
    const plan = state.plan;
    if (!plan) return;
    const activity = plan.activities.find((a) => a.activityId === activityId);
    if (!activity) return;
    activity.status = status;
    if (status === 'complete') {
      if (activity.kind === 'lesson' && activity.lessonId !== null) {
        const done = new Set(state.completedLessons ?? []);
        done.add(activity.lessonId);
        state.completedLessons = [...done];
      }
      // Completing a Mistakes session clears the (count-only) open tally — the real
      // repair runner will replace this placeholder resolution later.
      if (activity.kind === 'review_mistakes') state.mistakeCount = 0;
    }
    // Dynamic: if independent misses have piled up during the day, inject a Mistakes
    // session as the next step and push the last still-ready activity to tomorrow.
    this.maybeInjectMistakesSession(plan, state.mistakeCount ?? 0);
    const next = plan.activities.find((a) => a.status === 'ready' || a.status === 'in_progress');
    plan.currentActivityId = next?.activityId ?? null;
  }

  private static readonly MISTAKES_SESSION_THRESHOLD = 5;

  /** Inject a Mistakes session mid-day when enough misses pile up (bumps the last item to tomorrow). */
  private maybeInjectMistakesSession(plan: TodaysPathState, openMistakes: number): void {
    if (openMistakes < Authority.MISTAKES_SESSION_THRESHOLD) return;
    const cap = plan.dailyBudgetMinutes >= TODAYS_PATH_CONFIG.carsSecondAtBudget ? 3 : 2;
    if (plan.mistakesSessions >= cap) return;
    // Don't stack a second while one is still pending.
    if (
      plan.activities.some(
        (a) => a.kind === 'review_mistakes' && (a.status === 'ready' || a.status === 'in_progress'),
      )
    ) {
      return;
    }
    const count = Math.min(openMistakes, TODAYS_PATH_CONFIG.blocks.mistakesMax);
    const minutes = Math.min(
      count * TODAYS_PATH_CONFIG.costs.mistakePerItem,
      TODAYS_PATH_CONFIG.maxActivityMinutes,
    );
    const session: TodaysPathActivityState = {
      activityId: `review-mistakes:${plan.mistakesSessions + 1}`,
      kind: 'review_mistakes',
      title: 'Review Mistakes',
      detail: `${count} mistake${count === 1 ? '' : 's'} piled up today — clear them before they stack.`,
      estimatedMinutes: minutes,
      count,
      minutesBudget: null,
      focus: null,
      lessonSlug: null,
      lessonId: null,
      priorityReason: 'UNRESOLVED_ERROR',
      status: 'ready',
      carriedOver: false,
    };
    // Bump the LAST still-ready activity to tomorrow so the day stays within budget.
    for (let i = plan.activities.length - 1; i >= 0; i -= 1) {
      if (plan.activities[i]!.status === 'ready') {
        plan.activities[i]!.status = 'snoozed';
        break;
      }
    }
    // Insert the session as the next up (before the first remaining ready item).
    const firstReadyIdx = plan.activities.findIndex((a) => a.status === 'ready');
    const insertAt = firstReadyIdx === -1 ? plan.activities.length : firstReadyIdx;
    plan.activities.splice(insertAt, 0, session);
    plan.mistakesSessions += 1;
  }

  /**
   * Inject a Recall block into today's existing plan when it wasn't scheduled at
   * build time (no cards then) but cards are now due — e.g. the learner just added
   * their first deck. Placed as the NEXT ready item (the very first when nothing is
   * started yet), sized exactly like the build so Recall gets a card count to stop at.
   */
  private maybeInjectRecall(
    state: LearnerState,
    recallLoad: BuildTodaysPathInput['recallLoad'],
  ): void {
    const plan = state.plan;
    if (!plan) return;
    // Already have a Recall block today (pending or done) — never duplicate it.
    if (plan.activities.some((a) => a.kind === 'recall')) return;
    const sized = sizeRecall(recallLoad, plan.dailyBudgetMinutes, TODAYS_PATH_CONFIG);
    if (!sized) return;
    const recall: TodaysPathActivityState = {
      activityId: 'recall',
      kind: 'recall',
      title: 'Recall',
      detail: `${sized.cards} flashcard${sized.cards === 1 ? '' : 's'} due (spaced repetition).`,
      estimatedMinutes: Math.max(1, sized.minutes),
      count: sized.cards,
      minutesBudget: sized.minutes,
      focus: null,
      lessonSlug: null,
      lessonId: null,
      priorityReason: 'OVERDUE_REVIEW',
      status: 'ready',
      carriedOver: false,
    };
    // Next ready item (index 0 when nothing is started yet). An in-progress activity
    // is left alone; Recall slots in right after it.
    const firstReadyIdx = plan.activities.findIndex((a) => a.status === 'ready');
    const insertAt = firstReadyIdx === -1 ? plan.activities.length : firstReadyIdx;
    plan.activities.splice(insertAt, 0, recall);
    // Refresh derived fields the view reads straight off the plan.
    plan.plannedMinutes = plan.activities.reduce((sum, a) => sum + a.estimatedMinutes, 0);
    plan.freeStudyMinutes = Math.max(0, plan.dailyBudgetMinutes - plan.plannedMinutes);
    const reviewMinutes = plan.activities
      .filter((a) => a.kind === 'recall' || a.kind === 'review_mistakes')
      .reduce((sum, a) => sum + a.estimatedMinutes, 0);
    plan.reviewSharePct =
      plan.plannedMinutes > 0 ? Math.min(1, reviewMinutes / plan.plannedMinutes) : 0;
    const next = plan.activities.find((a) => a.status === 'ready' || a.status === 'in_progress');
    plan.currentActivityId = next?.activityId ?? null;
  }

  private carryOverFrom(prev: TodaysPathState | null, planDate: string): CarriedActivity[] {
    if (!prev || prev.planDate === planDate) return [];
    return prev.activities
      .filter((a) => a.status === 'ready' || a.status === 'in_progress' || a.status === 'snoozed')
      .map((a) => ({
        activityId: a.activityId,
        kind: a.kind,
        title: a.title,
        detail: a.detail,
        estimatedMinutes: a.estimatedMinutes,
        count: a.count,
        minutesBudget: a.minutesBudget,
        focus: a.focus,
        lessonSlug: a.lessonSlug,
        lessonId: a.lessonId,
        priorityReason: a.priorityReason,
      }));
  }

  private todaysPathSnapshot(
    state: LearnerState,
    input: BuildTodaysPathInput,
    planDate: string,
    preset: number,
    ctx: ReturnType<Authority['dayContext']>,
    carryOver: CarriedActivity[],
  ): TodaysPathSnapshot {
    const masteredLessonIds = new Set(
      this.getMasteryLessons(state)
        .filter((l) => l.mastered)
        .map((l) => l.lessonId),
    );
    const completed = new Set(state.completedLessons ?? []);
    const now = this.clock.now();
    const done = (id: string): boolean => completed.has(id) || masteredLessonIds.has(id);

    // Prereq pipeline (ready for the authored map): unlocked = all prereqs done;
    // dependentsCount = how many candidates list this lesson as a prerequisite.
    const dependents = new Map<string, number>();
    for (const l of input.candidateLessons) {
      for (const p of l.prerequisiteLessonIds) dependents.set(p, (dependents.get(p) ?? 0) + 1);
    }

    // Per-KC teach-before-test: taught KCs = union of completed lessons' KCs.
    const taughtKcIds = new Set<string>();
    for (const l of input.candidateLessons) {
      if (done(l.lessonId)) for (const kc of l.kcIds) taughtKcIds.add(kc);
    }
    state.taughtKcIds = [...taughtKcIds];

    // Practice unlocks after N completed lessons; sized to review need (# taught KCs
    // not yet mastered), bounded — not budget-fill.
    const practiceUnlocked = completed.size >= TODAYS_PATH_CONFIG.practiceUnlockLessons;
    let practiceReviewNeed = 0;
    if (practiceUnlocked) {
      for (const kc of taughtKcIds) {
        const st = state.mastery?.kc[kc];
        const pL = st ? currentPL(st, now) : PRIOR_PL0;
        if (pL < MASTERY_THRESHOLD) practiceReviewNeed += 1;
      }
    }

    const candidateLessons: TodaysPathCandidateLesson[] = input.candidateLessons.map((l) => ({
      lessonId: l.lessonId,
      slug: l.slug,
      title: l.title,
      section: l.section,
      cluster: l.cluster,
      kcCount: l.kcCount,
      mastered: masteredLessonIds.has(l.lessonId) || completed.has(l.lessonId),
      covered: l.cluster !== null && ctx.clustersWithEvidence.has(l.cluster),
      unlocked: l.prerequisiteLessonIds.every((p) => done(p)),
      dependentsCount: dependents.get(l.lessonId) ?? 0,
    }));

    return {
      planDate,
      dailyBudgetMinutes: preset,
      dayNumber: ctx.dayNumber,
      totalDays: ctx.totalDays,
      coveragePct: ctx.coveragePct,
      recall: input.recallLoad,
      mistakesOpen: state.mistakeCount ?? 0,
      practiceUnlocked,
      practiceReviewNeed,
      candidateLessons,
      carryOver,
    };
  }

  private todaysPathView(state: LearnerState): TodaysPathView {
    const ctx = this.dayContext(state);
    const planDate = this.planDateFor(this.clock.now(), this.timezoneOffset(state));
    const preset = this.dailyPreset(state);
    const plan = state.plan && state.plan.planDate === planDate ? state.plan : null;
    if (plan === null) {
      return {
        built: false,
        planDate,
        dailyMinutesPreset: preset,
        dailyBudgetMinutes: 0,
        plannedMinutes: 0,
        capacityLabel: ctx.capacityLabel,
        dayNumber: ctx.dayNumber,
        totalDays: ctx.totalDays,
        reviewSharePct: 0,
        reviewDebtBand: 'normal',
        activities: [],
        currentActivityId: null,
        freeStudyMinutes: 0,
        ghost: ctx.ghost,
      };
    }
    return {
      built: true,
      planDate: plan.planDate,
      dailyMinutesPreset: plan.dailyMinutesPreset,
      dailyBudgetMinutes: plan.dailyBudgetMinutes,
      plannedMinutes: plan.plannedMinutes,
      capacityLabel: ctx.capacityLabel,
      dayNumber: ctx.dayNumber,
      totalDays: ctx.totalDays,
      reviewSharePct: plan.reviewSharePct,
      reviewDebtBand: plan.reviewDebtBand,
      activities: plan.activities.map((a) => ({
        activityId: a.activityId,
        kind: a.kind,
        title: a.title,
        detail: a.detail,
        estimatedMinutes: a.estimatedMinutes,
        count: a.count,
        minutesBudget: a.minutesBudget,
        focus: a.focus,
        lessonSlug: a.lessonSlug,
        lessonId: a.lessonId,
        priorityReason: a.priorityReason,
        status: a.status,
        carriedOver: a.carriedOver,
      })),
      currentActivityId: plan.currentActivityId,
      freeStudyMinutes: plan.freeStudyMinutes,
      ghost: ctx.ghost,
    };
  }

  // ---- Study session ------------------------------------------------------

  startSession(state: LearnerState, skillId: string = ENZYME_SKILL): void {
    if (state.session === null || state.session.skillId !== skillId) {
      state.session = {
        skillId,
        pathIndex: 0,
        sub: 'answering',
        currentFirstChoiceId: null,
        revealed: false,
      };
    }
  }

  private currentActivity(state: LearnerState): PathActivity | null {
    if (state.session === null) return null;
    return ENZYME_PATH[state.session.pathIndex] ?? null;
  }

  sessionComplete(state: LearnerState): boolean {
    const activity = this.currentActivity(state);
    return activity === null || activity.kind === 'complete';
  }

  getSession(state: LearnerState): StudyStepView {
    if (!state.onboarding.planConfirmed) {
      return { kind: 'locked', reason: 'Finish placement and plan setup to unlock learning.' };
    }
    this.startSession(state);
    const s = state.session!;
    const activity = this.currentActivity(state);
    if (activity === null || activity.kind === 'complete') {
      return { kind: 'complete', skillId: s.skillId, summary: this.buildSummary(state, s.skillId) };
    }
    if (activity.kind === 'lesson') {
      const lesson = this.bank.lessons.find((l) => l.id === activity.lessonId)!;
      return {
        kind: 'lesson',
        lessonId: lesson.id,
        title: lesson.title,
        skillId: s.skillId,
        blocks: lesson.blocks.map((b) => ({ kind: b.kind, heading: b.heading, body: b.body })),
      };
    }
    if (activity.kind === 'simulation') {
      return { kind: 'simulation', specId: activity.specId!, skillId: s.skillId };
    }
    if (activity.kind === 'recall') {
      const prompt = this.bank.recallPrompts.find((r) => r.id === activity.promptId)!;
      return { kind: 'recall', promptId: prompt.id, prompt: prompt.prompt, format: prompt.format, skillId: s.skillId };
    }
    // question
    const compiled = this.bank.compiled.get(activity.questionId!)!;
    const stimulus =
      compiled.safe.stimulus_id !== null
        ? this.bank.stimuli.find((st) => st.id === compiled.safe.stimulus_id) ?? null
        : null;
    const reveal =
      s.sub === 'reveal'
        ? {
            correctChoiceId: compiled.protected.correct_choice_id,
            correctRationale: compiled.protected.rationales.correct,
            choiceRationales: compiled.protected.rationales.choices as Record<string, string>,
          }
        : null;
    return {
      kind: 'question',
      phase: activity.phase!,
      sub: s.sub,
      question: compiled.safe,
      stimulus: stimulus ? { id: stimulus.id, body: stimulus.body } : null,
      hint: null,
      reveal,
      skillId: s.skillId,
    };
  }

  /** Learner submits an answer for the current question step. */
  submitAttempt(state: LearnerState, choiceId: string | null): void {
    this.startSession(state);
    const s = state.session!;
    const activity = this.currentActivity(state);
    if (activity === null || activity.kind !== 'question') return;
    const compiled = this.bank.compiled.get(activity.questionId!)!;
    const correctId = compiled.protected.correct_choice_id;
    const phase = activity.phase!;

    if (s.sub === 'answering') {
      s.currentFirstChoiceId = choiceId;
      this.recordEvent(state, this.attemptEvent(state, activity.questionId!, choiceId, { assistanceLevel: 'A0', isDiagnosticRetry: false }));

      // The first answering attempt is INDEPENDENT (A0, no hint, not a retry, not
      // revealed), so it moves P(L) — up on correct, down on wrong. Retries and
      // reveals below are non-independent and never touch mastery (fail-closed).
      this.updateMasteryForAttempt(state, activity.questionId!, choiceId === correctId);

      if (phase === 'protected') {
        // No feedback during a protected block; record protected evidence and advance.
        this.appendEvidence(state, {
          skillId: s.skillId,
          kind: 'protected',
          questionId: activity.questionId!,
          phase,
          correct: choiceId === correctId,
          independent: true,
          changeDimensions: [],
          conditions: { protected: true },
        });
        this.advance(state);
        return;
      }

      const scored = scoreAttempt({
        correctChoiceId: correctId,
        chosenChoiceId: choiceId,
        assistanceLevel: 'A0',
        contentBearingHint: false,
        isDiagnosticRetry: false,
        revealed: false,
      });
      if (scored.outcome === 'correct') {
        this.appendEvidence(state, {
          skillId: s.skillId,
          kind: evidenceKindForPhase(phase),
          questionId: activity.questionId!,
          phase,
          correct: true,
          independent: scored.independent,
          changeDimensions: activity.changeDimensions ?? [],
          conditions: phase === 'passage' ? { passage: true } : {},
        });
        this.advance(state);
      } else {
        s.sub = 'cause';
      }
      return;
    }

    if (s.sub === 'retry') {
      this.recordEvent(state, this.attemptEvent(state, activity.questionId!, choiceId, { assistanceLevel: 'A0', isDiagnosticRetry: true }));
      // Retry is diagnostic evidence only — never independent/mastery.
      this.appendEvidence(state, {
        skillId: s.skillId,
        kind: 'diagnostic_retry',
        questionId: activity.questionId!,
        phase,
        correct: choiceId === correctId,
        independent: false,
        changeDimensions: [],
      });
      s.sub = 'reveal';
    }
  }

  selectCause(state: LearnerState, cause: ProbableCause): void {
    this.startSession(state);
    const s = state.session;
    const activity = this.currentActivity(state);
    if (!s || !activity || activity.kind !== 'question' || s.sub !== 'cause') return;
    this.recordEvent(state, {
      type: 'cause_selected',
      eventId: newEventId(),
      learnerId: state.learnerId,
      idempotencyKey: newIdempotencyKey(),
      occurredAt: this.clock.now(),
      contentRelease: this.bank.contentRelease,
      policies: activePolicyVersions(),
      payload: { questionId: ContentIdSchema.parse(activity.questionId!), cause },
    });
    s.sub = 'retry';
  }

  requestReveal(state: LearnerState): void {
    this.startSession(state);
    const s = state.session;
    const activity = this.currentActivity(state);
    if (!s || !activity || activity.kind !== 'question') return;
    const revealNow = s.sub === 'answering';
    s.revealed = true;
    this.recordEvent(state, {
      type: 'reveal_requested',
      eventId: newEventId(),
      learnerId: state.learnerId,
      idempotencyKey: newIdempotencyKey(),
      occurredAt: this.clock.now(),
      contentRelease: this.bank.contentRelease,
      policies: activePolicyVersions(),
      payload: { questionId: ContentIdSchema.parse(activity.questionId!), revealNow },
    });
    s.sub = 'reveal';
  }

  /** Advance from a non-question step (lesson/simulation/recall) or after a reveal. */
  continueStep(state: LearnerState): void {
    this.startSession(state);
    this.advance(state);
  }

  submitRecall(state: LearnerState, answer: string): boolean {
    this.startSession(state);
    const s = state.session;
    const activity = this.currentActivity(state);
    if (!s || !activity || activity.kind !== 'recall') return false;
    const prompt = this.bank.recallPrompts.find((r) => r.id === activity.promptId)!;
    const normalized = answer.trim().toLowerCase();
    const correct = prompt.acceptedAnswers.some((a) => a.trim().toLowerCase() === normalized);
    this.recordEvent(state, {
      type: 'review_rated',
      eventId: newEventId(),
      learnerId: state.learnerId,
      idempotencyKey: newIdempotencyKey(),
      occurredAt: this.clock.now(),
      contentRelease: this.bank.contentRelease,
      policies: activePolicyVersions(),
      payload: { reviewObjectId: ContentIdSchema.parse(prompt.id), rating: correct ? 'good' : 'again', elapsedMs: 0 },
    });
    this.advance(state);
    return correct;
  }

  // ---- Views --------------------------------------------------------------

  getMasteryMap(state: LearnerState): MasteryMapEntry[] {
    const now = this.clock.now();
    return this.bank.skillGraph.skills.map((skill) => {
      const records = state.evidence.filter((e) => e.skillId === skill.skillId);
      const prereqBlocked = this.isPrerequisiteBlocked(state, skill.skillId);
      const mastery = evaluateMastery({
        skillId: skill.skillId,
        records,
        now,
        prerequisiteBlocked: prereqBlocked,
        hasInstruction: records.length > 0,
      });
      return { ...mastery, cluster: skill.cluster, title: skill.title };
    });
  }

  // ---- Mastery engine (BKT/IRT, mastery-bkt / provisional-v1) --------------
  // P(L) replaces the evidence ladder for the learner-facing mastery number.
  // Runs ONLY for independent attempts; the ladder above still logs evidence.

  private ensureMastery(state: LearnerState): MasteryEngineState {
    if (!state.mastery) state.mastery = { kc: {}, skill: {}, lesson: {}, cars: {} };
    return state.mastery;
  }

  /** Derive the mastery grain (KC / 7-op / lesson / DOK) for a bank item. */
  private masteryTarget(
    questionId: string,
    fallbackSkill: string,
  ): { kcKey: string; op: ReasoningOperation; lessonId: string; dok: number | undefined } {
    const q = this.bank.questions.find((x) => x.id === questionId);
    const kcKey = q?.internal_skill_ids[0] ?? fallbackSkill;
    const op = OPERATION_TAG_TO_REASONING[q?.template_tags[0] ?? 'K'] ?? 'IDENTIFY';
    return { kcKey, op, lessonId: ENZYME_LESSON_ID, dok: q?.difficulty };
  }

  /** Apply one independent attempt to the KC / skill / lesson chains (+ prereqs). */
  private updateMasteryForAttempt(state: LearnerState, questionId: string, correct: boolean): void {
    const m = this.ensureMastery(state);
    const target = this.masteryTarget(questionId, state.session?.skillId ?? ENZYME_SKILL);
    const now = this.clock.now();

    const prereqKeys = this.bank.skillGraph.edges
      .filter((e) => e.kind === 'hard_prerequisite' && e.to === target.kcKey)
      .map((e) => e.from);
    const prerequisites = prereqKeys.map((k) => m.kc[k] ?? initialMemoryState());

    const result = applyMasteryAttempt({
      correct,
      now,
      // In-memory dev never crosses the calibration floor, so `b` is DOK-derived.
      questionStats: { attempts: 0, correct: 0 },
      ...(target.dok !== undefined ? { dokLevel: target.dok } : {}),
      states: {
        kc: m.kc[target.kcKey] ?? initialMemoryState(),
        skill: m.skill[target.op] ?? initialMemoryState(),
        lesson: m.lesson[target.lessonId] ?? initialMemoryState(),
      },
      prerequisites,
    });

    m.kc[target.kcKey] = result.states.kc;
    m.skill[target.op] = result.states.skill;
    m.lesson[target.lessonId] = result.states.lesson;
    prereqKeys.forEach((k, i) => {
      const next = result.prerequisites[i];
      if (next) m.kc[k] = next;
    });
  }

  private refreshNeeded(st: MemoryState, decayed: number): boolean {
    return st.lastPracticedAt !== null && decayed < REVIEW_LINE && st.pL >= REVIEW_LINE;
  }

  /** The 7 reasoning-skill readouts for the Skills page (percentages). */
  getMasterySkills(state: LearnerState): SkillMasteryView[] {
    const m = this.ensureMastery(state);
    const now = this.clock.now();
    return REASONING_OPERATIONS.map((operation) => {
      const st = m.skill[operation];
      const pL = st ? currentPL(st, now) : PRIOR_PL0;
      return {
        operation,
        pL,
        refreshNeeded: st ? this.refreshNeeded(st, pL) : false,
        mastered: pL >= MASTERY_THRESHOLD,
      };
    });
  }

  /** Per-lesson mastery for the Evidence Atlas brain nodes on Progress. */
  getMasteryLessons(state: LearnerState): LessonMasteryView[] {
    const m = this.ensureMastery(state);
    const now = this.clock.now();
    return Object.entries(m.lesson).map(([lessonId, st]) => {
      const pL = currentPL(st, now);
      return {
        lessonId,
        cluster: clusterForLesson(lessonId) ?? null,
        pL,
        refreshNeeded: this.refreshNeeded(st, pL),
        mastered: pL >= MASTERY_THRESHOLD,
      };
    });
  }

  /** CARS readiness (gauge + 3 sub-skill bars). */
  getCarsReadiness(state: LearnerState): CarsReadinessView {
    const m = this.ensureMastery(state);
    const skills = (['FOC', 'RWT', 'RBT'] as const).map((skill) => {
      const v = m.cars[skill] ?? CARS_V0;
      return { skill, v, pct: predictedCorrect(v, 0) };
    });
    const overallV = overallCarsReadiness(m.cars.FOC ?? 0, m.cars.RWT ?? 0, m.cars.RBT ?? 0);
    const onTrack = isCarsOnTrack(overallV);
    const label: CarsReadinessLabel = onTrack ? 'on_track' : overallV >= 0.85 ? 'approaching' : 'building';
    return { skills, overallV, overallPct: predictedCorrect(overallV, 0), onTrack, label };
  }

  /** Update one CARS sub-skill ability (PotD uses K=0.3; the Duel uses K=0.08). */
  updateCarsAbility(state: LearnerState, skill: CarsSkill, r: number, k: number, b = 0): void {
    const m = this.ensureMastery(state);
    m.cars[skill] = carsUpdate(m.cars[skill] ?? CARS_V0, { r, b, k });
  }

  /**
   * Consume diagnostic seeds (never mastery): initialize unpracticed priors only.
   *
   * The cap is re-applied here rather than trusted from the producer. Seeds are
   * built where the diagnostic runs and reach the authority over the wire, so
   * this is the last point at which "a read can move where you start, never
   * whether you have mastered something" can be enforced; `SEED_PRIOR_CAP` sits
   * far below BKT's 0.95 mastery threshold, which is what makes the guarantee
   * hold whatever a caller sends.
   */
  applyMasterySeed(state: LearnerState, seed: MasterySeed): void {
    const m = this.ensureMastery(state);
    const capped = (prior: number): number => Math.min(SEED_PRIOR_CAP, Math.max(SEED_PRIOR_FLOOR, prior));
    for (const [kcId, prior] of Object.entries(seed.kcPriors)) {
      if (!m.kc[kcId]) m.kc[kcId] = initialMemoryState(capped(prior));
    }
    for (const [op, prior] of Object.entries(seed.skillPriors)) {
      const operation = op as ReasoningOperation;
      if (!m.skill[operation]) m.skill[operation] = initialMemoryState(capped(prior));
    }
    for (const [lessonId, prior] of Object.entries(seed.lessonPriors)) {
      if (!m.lesson[lessonId]) m.lesson[lessonId] = initialMemoryState(capped(prior));
    }
    for (const [skill, v] of Object.entries(seed.carsAbility)) {
      const cars = skill as CarsSkill;
      if (m.cars[cars] === undefined) m.cars[cars] = Math.min(SEED_CARS_MAX, Math.max(SEED_CARS_MIN, v));
    }
  }

  // ---- Adaptive Practice (test-out; practice-selection / provisional-v1) --
  // Server-authoritative WRITE path: a first, unassisted answer moves P(L)
  // through the existing mastery-bkt engine. Items come from the injected bank
  // port (real Postgres corpus in prod, synthetic fallback in dev/tests).

  /**
   * Build the ordered queue of up to `x` fresh practice items. Reads the mastery
   * signal + bank catalog into a snapshot, asks the pure selection engine for
   * specs, then pulls one fresh matching item per spec (excluding recently-seen
   * and anything already queued). Missing specs are skipped (graceful).
   */
  async getPracticeQueue(
    state: LearnerState,
    x: number,
    focus?: PracticeFocus,
  ): Promise<PracticeQueueView> {
    const requested = Math.max(0, Math.min(Math.floor(x), 50));
    const focusToken = focus ?? null;
    if (requested === 0) return { requested: 0, focus: focusToken, items: [] };

    const now = this.clock.now();
    const [units, repairs, recentlySeen] = await Promise.all([
      this.practiceBank.listUnits({ limit: 400 }),
      this.practiceBank.recentMisses(state.learnerId, { limit: 20 }),
      this.practiceBank.recentlySeenIds(state.learnerId, { withinDays: 14, limit: 500 }),
    ]);

    const snapshot = this.buildPracticeSnapshot(state, units, repairs, now, focusToken);
    const specs = selectPracticeQueue(snapshot, requested, PRACTICE_SELECTION_CONFIG);

    const served = new Set<string>(recentlySeen);
    const items: PracticeQueueItem[] = [];
    for (const spec of specs) {
      const candidates = await this.practiceBank.findItems(
        {
          domain: spec.domain,
          ...(spec.kcId !== undefined ? { kcId: spec.kcId } : {}),
          ...(spec.skill !== undefined ? { skill: spec.skill } : {}),
          ...(spec.carsSkill !== undefined ? { carsSkill: spec.carsSkill } : {}),
          targetB: bandCenter(spec.difficultyBand),
        },
        { excludeIds: [...served], limit: 8 },
      );
      const chosen = candidates.find((c) => !served.has(c.question.id));
      if (chosen === undefined) continue;
      served.add(chosen.question.id);
      items.push({
        specId: practiceSpecId(spec),
        domain: spec.domain,
        purpose: spec.purpose,
        kcId: chosen.kcId ?? spec.kcId ?? null,
        skill: chosen.skill ?? spec.skill ?? null,
        carsSkill: chosen.carsSkill ?? spec.carsSkill ?? null,
        dok: chosen.dok ?? spec.dok ?? null,
        question: chosen.question,
      });
      if (items.length >= requested) break;
    }

    return { requested, focus: focusToken, items };
  }

  /**
   * Score one practice answer. On a FIRST, unassisted attempt this moves the
   * P(L) mastery signal (BKT for science KC/skill/lesson, IRT `carsUpdate` at
   * measurement weight for CARS), records exposure + population stats, and
   * queues a KC×skill repair on a miss. Retries are learning-only (no P(L)).
   * Answer material is returned only here (post-submit), never in the queue.
   */
  async submitPracticeAttempt(
    state: LearnerState,
    cmd: PracticeAttemptCommand,
  ): Promise<PracticeAttemptResult> {
    const answer = await this.practiceBank.getAnswer(cmd.questionId);
    if (answer === null) {
      throw new Error(`Practice item ${cmd.questionId} is unavailable.`);
    }
    const correct = cmd.chosenChoiceId !== null && cmd.chosenChoiceId === answer.correctChoiceId;
    const now = this.clock.now();

    if (cmd.firstAttempt) {
      const classification = await this.practiceBank.classify(cmd.questionId);
      const stats = await this.practiceBank.questionStats(cmd.questionId);
      if (classification !== null) {
        this.applyPracticeMastery(state, classification, correct, stats, now);
      }
      await this.practiceBank.recordAttempt(cmd.questionId, correct, now);
      await this.practiceBank.recordExposure(state.learnerId, cmd.questionId, now);
      // A first, unassisted (independent) miss increments the mistake count for the
      // Today's Path mistakes-session scheduler (count only — no item stored here).
      if (!correct) this.recordMistake(state, 'practice');
      if (!correct && classification?.domain === 'science' && classification.kcId !== null) {
        await this.practiceBank.queueRepair(
          state.learnerId,
          classification.skill
            ? { kcId: classification.kcId, skill: classification.skill }
            : { kcId: classification.kcId },
          now,
        );
      }
    }

    return {
      correct,
      correctChoiceId: answer.correctChoiceId,
      rationale: answer.rationale,
      choiceRationales: answer.choiceRationales,
    };
  }

  private buildPracticeSnapshot(
    state: LearnerState,
    units: readonly PracticeCandidateUnit[],
    repairs: readonly PracticeRepairTarget[],
    now: UtcTimestamp,
    focus: PracticeFocus | null,
  ): PracticeSnapshot {
    const m = state.mastery;
    const focused = this.filterByFocus(units, focus);

    const covered = new Set<SkillCluster>();
    const scienceUnits: PracticeUnit[] = [];
    const carsUnits: PracticeCarsUnit[] = [];

    for (const u of focused) {
      if (u.domain === 'cars') {
        if (u.carsSkill === null) continue;
        const v = m?.cars[u.carsSkill];
        carsUnits.push({
          carsSkill: u.carsSkill,
          v: v ?? CARS_V0,
          neverPractised: v === undefined,
          recency: 0,
        });
        continue;
      }
      if (u.skill === null || u.cluster === null) continue;
      const kcState = m?.kc[u.kcId];
      const skillState = m?.skill[u.skill];
      const neverPractised = kcState === undefined;
      if (!neverPractised) covered.add(u.cluster);
      scienceUnits.push({
        kcId: u.kcId,
        skill: u.skill,
        cluster: u.cluster,
        plKc: kcState ? currentPL(kcState, now) : PRIOR_PL0,
        plSkill: skillState ? currentPL(skillState, now) : PRIOR_PL0,
        // Provisional: real-bank items imply available instruction and no
        // per-learner prerequisite gate yet (see docs/practice-engine.md).
        taught: true,
        prereqMet: true,
        ...(u.dok !== null ? { dok: u.dok } : {}),
        overdueDays: kcState ? this.overduePracticeDays(kcState, now) : 0,
        neverPractised,
        recency: 0,
      });
    }

    // Per-KC teach-before-test: only serve KCs the learner has been taught (union of
    // completed lessons' KCs, cached at plan-build). Falls back to unfiltered when the
    // taught set doesn't intersect the loaded bank (e.g. dev synthetic bank) so local
    // practice still works.
    const taught =
      state.taughtKcIds && state.taughtKcIds.length > 0 ? new Set(state.taughtKcIds) : null;
    const taughtUnits = taught ? scienceUnits.filter((u) => taught.has(u.kcId)) : scienceUnits;
    const scopedUnits = taughtUnits.length > 0 ? taughtUnits : scienceUnits;

    return {
      units: scopedUnits,
      cars: carsUnits,
      repairs: repairs.map((r) => (r.skill ? { kcId: r.kcId, skill: r.skill } : { kcId: r.kcId })),
      coveredClusters: covered,
    };
  }

  private filterByFocus(
    units: readonly PracticeCandidateUnit[],
    focus: PracticeFocus | null,
  ): readonly PracticeCandidateUnit[] {
    if (focus === null) return units;
    const upper = focus.toUpperCase();
    if (upper === 'CARS') return units.filter((u) => u.domain === 'cars');
    if ((SKILL_CLUSTERS as readonly string[]).includes(upper)) {
      return units.filter((u) => u.cluster === (upper as SkillCluster));
    }
    if ((REASONING_OPERATIONS as readonly string[]).includes(upper)) {
      return units.filter((u) => u.skill === (upper as ReasoningOperation));
    }
    return units;
  }

  private overduePracticeDays(st: MemoryState, now: UtcTimestamp): number {
    if (st.lastPracticedAt === null) return 0;
    if (currentPL(st, now) >= REVIEW_LINE) return 0;
    return Math.max(0, daysBetween(st.lastPracticedAt, now));
  }

  private applyPracticeMastery(
    state: LearnerState,
    classification: PracticeItemClassification,
    correct: boolean,
    stats: { attempts: number; correct: number },
    now: UtcTimestamp,
  ): void {
    const m = this.ensureMastery(state);
    if (classification.domain === 'cars') {
      if (classification.carsSkill === null) return;
      m.cars[classification.carsSkill] = carsUpdate(m.cars[classification.carsSkill] ?? CARS_V0, {
        r: correct ? 1 : 0,
        b: 0,
        k: CARS_K_POTD,
      });
      return;
    }
    if (classification.kcId === null || classification.skill === null) return;

    const prereqKeys = this.bank.skillGraph.edges
      .filter((e) => e.kind === 'hard_prerequisite' && e.to === classification.kcId)
      .map((e) => e.from);
    const prerequisites = prereqKeys.map((k) => m.kc[k] ?? initialMemoryState());

    const result = applyMasteryAttempt({
      correct,
      now,
      questionStats: stats,
      ...(classification.dok !== null ? { dokLevel: classification.dok } : {}),
      states: {
        kc: m.kc[classification.kcId] ?? initialMemoryState(),
        skill: m.skill[classification.skill] ?? initialMemoryState(),
        lesson:
          classification.lessonId !== null
            ? (m.lesson[classification.lessonId] ?? initialMemoryState())
            : initialMemoryState(),
      },
      prerequisites,
    });

    m.kc[classification.kcId] = result.states.kc;
    m.skill[classification.skill] = result.states.skill;
    if (classification.lessonId !== null) m.lesson[classification.lessonId] = result.states.lesson;
    prereqKeys.forEach((k, i) => {
      const next = result.prerequisites[i];
      if (next) m.kc[k] = next;
    });
  }

  // ---- Practice hooks (Passage of the Day, etc.) ------------------------

  getPracticeItem(questionId: string): PracticeItemView | null {
    const compiled = this.bank.compiled.get(questionId);
    if (!compiled) return null;
    const stimulus =
      compiled.safe.stimulus_id !== null
        ? this.bank.stimuli.find((s) => s.id === compiled.safe.stimulus_id) ?? null
        : null;
    return {
      question: compiled.safe,
      stimulus: stimulus ? { id: stimulus.id, body: stimulus.body } : null,
    };
  }

  checkPractice(state: LearnerState, questionId: string, choiceId: string | null): PracticeResult {
    const compiled = this.bank.compiled.get(questionId)!;
    const correctId = compiled.protected.correct_choice_id;
    const correct = choiceId === correctId;
    this.recordEvent(
      state,
      this.attemptEvent(state, questionId, choiceId, { assistanceLevel: 'A0', isDiagnosticRetry: false }),
    );
    // Low-stakes daily practice: contextual evidence only (never mastery).
    const skillId = this.bank.questions.find((q) => q.id === questionId)?.internal_skill_ids[0] ?? ENZYME_SKILL;
    this.appendEvidence(state, {
      skillId,
      kind: 'placement',
      questionId,
      phase: 'independent',
      correct,
      independent: false,
      changeDimensions: [],
    });
    const rationales = compiled.protected.rationales.choices as Record<string, string>;
    return {
      correct,
      correctChoiceId: correctId,
      rationale: compiled.protected.rationales.correct,
      choiceRationale: choiceId && choiceId !== correctId ? rationales[choiceId] ?? null : null,
    };
  }

  /**
   * CARS Duel is an AI sparring session, so it can never mint mastery. It logs
   * contextual (placement-kind) evidence to the two CARS clusters so the Atlas
   * reflects the reps without treating an AI as proof.
   */
  recordCarsDuel(state: LearnerState, rubric?: CarsDuelRubric): void {
    for (const cluster of ['CA1', 'CA2'] as const) {
      this.appendEvidence(state, {
        skillId: `cars-${cluster.toLowerCase()}`,
        kind: 'placement',
        questionId: 'cars-duel',
        phase: 'independent',
        correct: true,
        independent: false,
        changeDimensions: [],
        cluster,
        operation: 'A',
        familyId: 'fam-cars-duel',
      });
    }
    // Formative CARS ability nudge (low weight): each rubric criterion updates its
    // sub-skill. Position→FOC, Argument→RWT, Application→RBT; R = score/3.
    if (rubric) {
      const map: ReadonlyArray<readonly [keyof CarsDuelRubric, CarsSkill]> = [
        ['position', 'FOC'],
        ['argument', 'RWT'],
        ['application', 'RBT'],
      ];
      const scores: number[] = [];
      for (const [criterion, skill] of map) {
        const score = rubric[criterion];
        if (score !== undefined) {
          this.updateCarsAbility(state, skill, score / 3, CARS_K_DUEL);
          scores.push(score);
        }
      }
      // A "failed" duel (mean rubric < 2 of 3) counts toward the mistake tally.
      if (scores.length > 0 && scores.reduce((a, b) => a + b, 0) / scores.length < 2) {
        this.recordMistake(state, 'cars');
      }
    }
  }

  /**
   * Passage of the Day: a measured CARS answer updates the sub-skill ability at
   * full weight (K=0.3). PotD wires this in once real CARS passages are served
   * (see docs/mastery-pipeline.md §5.4).
   */
  recordCarsPassage(state: LearnerState, skill: CarsSkill, correct: boolean): void {
    this.updateCarsAbility(state, skill, correct ? 1 : 0, CARS_K_POTD);
  }

  getWrapped(state: LearnerState): WrappedView {
    const map = this.getMasteryMap(state);
    const counts: Record<string, number> = {};
    for (const e of state.evidence) counts[e.kind] = (counts[e.kind] ?? 0) + 1;
    return {
      dayNumber: Math.max(1, Math.floor(daysBetween(state.createdAt, this.clock.now())) + 1),
      skillsTouched: map.filter((m) => m.base !== 'not_assessed').length,
      skillsGlowing: map.filter((m) => ['independent', 'retained', 'strong'].includes(m.base)).length,
      evidenceCounts: counts,
      repairsCompleted: this.getErrorLog(state).filter((e) => e.repaired).length,
      protectedPassed: state.evidence.filter((e) => e.kind === 'protected' && e.outcome === 'correct').length,
    };
  }

  getErrorLog(state: LearnerState): ErrorEntryView[] {
    const causeByQuestion = new Map<string, ProbableCause>();
    for (const ev of state.events) {
      if (ev.type === 'cause_selected') causeByQuestion.set(ev.payload.questionId, ev.payload.cause);
    }
    const entries: ErrorEntryView[] = [];
    const seen = new Set<string>();
    for (const ev of state.events) {
      if (ev.type !== 'attempt_submitted') continue;
      const qid = ev.payload.questionId;
      const compiled = this.bank.compiled.get(qid);
      if (!compiled) continue;
      const wrong = ev.payload.chosenChoiceId !== compiled.protected.correct_choice_id;
      if (wrong && !ev.payload.isDiagnosticRetry && !seen.has(qid)) {
        seen.add(qid);
        entries.push({
          questionId: qid,
          skillId: ENZYME_SKILL,
          occurredAt: ev.occurredAt,
          chosenChoiceId: ev.payload.chosenChoiceId,
          cause: causeByQuestion.get(qid) ?? null,
          repaired: state.evidence.some(
            (e) => e.questionId === qid && e.kind === 'diagnostic_retry',
          ),
        });
      }
    }
    return entries;
  }

  buildSummary(state: LearnerState, skillId: string): SessionSummary {
    const map = this.getMasteryMap(state).find((m) => m.skillId === skillId);
    const counts: Record<string, number> = {};
    for (const e of state.evidence.filter((x) => x.skillId === skillId)) {
      counts[e.kind] = (counts[e.kind] ?? 0) + 1;
    }
    return {
      skillId,
      masteryState: (map?.base ?? 'not_assessed') as MasteryState,
      refreshNeeded: map?.refreshNeeded ?? false,
      evidenceCounts: counts,
    };
  }

  // ---- Internals ----------------------------------------------------------

  private advance(state: LearnerState): void {
    const s = state.session;
    if (!s) return;
    s.pathIndex = Math.min(s.pathIndex + 1, ENZYME_PATH.length - 1);
    s.sub = 'answering';
    s.currentFirstChoiceId = null;
    s.revealed = false;
  }

  private isPrerequisiteBlocked(state: LearnerState, skillId: string): boolean {
    const hardPrereqs = this.bank.skillGraph.edges
      .filter((e) => e.kind === 'hard_prerequisite' && e.to === skillId)
      .map((e) => e.from);
    if (hardPrereqs.length === 0) return false;
    for (const prereq of hardPrereqs) {
      const records = state.evidence.filter((e) => e.skillId === prereq);
      const m = evaluateMastery({ skillId: prereq, records, now: this.clock.now() });
      if (m.base === 'not_assessed' || m.base === 'foundation_needed') return true;
    }
    return false;
  }

  private weeksUntil(dateIso: string): number {
    const ms = Date.parse(dateIso) - Date.parse(this.clock.now());
    return Math.max(0, ms / (1000 * 60 * 60 * 24 * 7));
  }

  private recordEvent(state: LearnerState, event: LearnerEvent): void {
    if (state.seenIdempotencyKeys.includes(event.idempotencyKey)) return;
    state.seenIdempotencyKeys.push(event.idempotencyKey);
    state.events.push(event);
    state.nextSequence += 1;
  }

  private attemptEvent(
    state: LearnerState,
    questionId: string,
    choiceId: string | null,
    opts: { assistanceLevel: 'A0' | 'A1' | 'A2' | 'A3'; isDiagnosticRetry: boolean },
  ): LearnerEvent {
    return {
      type: 'attempt_submitted',
      eventId: newEventId(),
      learnerId: state.learnerId,
      idempotencyKey: newIdempotencyKey(),
      occurredAt: this.clock.now(),
      contentRelease: this.bank.contentRelease,
      policies: activePolicyVersions(),
      payload: {
        questionId: ContentIdSchema.parse(questionId),
        itemVersion: 1,
        chosenChoiceId: choiceId,
        elapsedMs: 0,
        assistanceLevel: opts.assistanceLevel,
        contentBearingHintUsed: false,
        answerChanges: 0,
        isDiagnosticRetry: opts.isDiagnosticRetry,
      },
    };
  }

  private appendEvidence(
    state: LearnerState,
    input: {
      skillId: string;
      kind: EvidenceKind;
      questionId: string;
      phase: StudyPhase;
      correct: boolean;
      independent: boolean;
      changeDimensions: string[];
      conditions?: { mixed?: boolean; passage?: boolean; timed?: boolean; protected?: boolean };
      /** Overrides for evidence not backed by a bank question (e.g., CARS Duel). */
      cluster?: string;
      operation?: string;
      familyId?: string;
    },
  ): void {
    const q = this.bank.questions.find((x) => x.id === input.questionId);
    const record = EvidenceRecordSchema.parse({
      evidenceId: crypto.randomUUID(),
      skillId: input.skillId,
      cluster: input.cluster ?? q?.skill_cluster ?? 'BB1',
      operation: input.operation ?? q?.template_tags[0] ?? 'K',
      kind: input.kind,
      independent: input.independent,
      assistanceLevel: 'A0',
      contentBearingHint: false,
      questionId: input.questionId,
      itemVersion: 1,
      familyId: input.familyId ?? q?.family_id ?? 'fam-unknown',
      changeDimensions: input.changeDimensions,
      conditions: {
        mixed: input.conditions?.mixed ?? false,
        passage: input.conditions?.passage ?? false,
        timed: input.conditions?.timed ?? false,
        protected: input.conditions?.protected ?? false,
        accommodations: [],
      },
      outcome: input.correct ? 'correct' : 'incorrect',
      valid: true,
      occurredAt: this.clock.now(),
      sequence: state.nextSequence,
      contentRelease: this.bank.contentRelease,
      policies: activePolicyVersions(),
    });
    state.evidence.push(record);
  }
}
