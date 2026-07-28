import {
  ContentIdSchema,
  REASONING_OPERATIONS,
  SKILL_CLUSTERS,
  daysBetween,
  newEventId,
  newIdempotencyKey,
  newLearnerId,
  systemClock,
  type BootstrapResponse,
  type CarsDuelRubric,
  type CarsReadinessLabel,
  type CarsReadinessView,
  type CarsSkill,
  type Clock,
  type LearnerEvent,
  type LessonMasteryView,
  type MasterySeed,
  type MasteryState,
  type ProbableCause,
  type ReasoningOperation,
  type SkillMasteryView,
  type UtcTimestamp,
} from '@mcat/contracts';
import { EvidenceRecordSchema, scoreAttempt, type EvidenceKind, type Task } from '@mcat/domain';
import {
  activePolicyVersions,
  applyMasteryAttempt,
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
  predictedCorrect,
  PRIOR_PL0,
  REVIEW_LINE,
  SEED_CARS_MAX,
  SEED_CARS_MIN,
  SEED_PRIOR_CAP,
  SEED_PRIOR_FLOOR,
  type MemoryState,
} from '@mcat/policies';
import { clusterForLesson, loadSyntheticBank, type LoadedBank } from '@mcat/content';
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

  constructor(bank: LoadedBank = loadSyntheticBank(), clock: Clock = systemClock) {
    this.bank = bank;
    this.clock = clock;
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

  getToday(state: LearnerState): TodayView {
    const capacityLabel = classifyCapacity({
      availableMinutesPerWeek: state.goal?.minutesPerWeek ?? 300,
      weeksRemaining: state.goal?.testDate ? this.weeksUntil(state.goal.testDate) : null,
      requiredP50Minutes: 1800,
      requiredP80Minutes: 2600,
    });
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
    const dayNumber = Math.max(1, Math.floor(daysBetween(state.createdAt, this.clock.now())) + 1);
    const totalDays = state.goal?.testDate
      ? Math.max(1, Math.round(daysBetween(state.createdAt, state.goal.testDate as unknown as UtcTimestamp)))
      : null;
    const repairsOpen = this.getErrorLog(state).filter((e) => !e.repaired).length;

    // Ghost companion: derived only from the learner's own goal, timeline, and coverage.
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

    return {
      capacityLabel,
      continueTaskId: 'task-enzyme',
      tasks,
      reviewSharePct: 0.25,
      dayNumber,
      totalDays,
      reviewsDue: 0,
      repairsOpen,
      ghost,
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
      for (const [criterion, skill] of map) {
        const score = rubric[criterion];
        if (score !== undefined) this.updateCarsAbility(state, skill, score / 3, CARS_K_DUEL);
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
