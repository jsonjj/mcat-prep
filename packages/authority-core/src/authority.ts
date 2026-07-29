import {
  BktObservationAppliedSchema,
  ContentIdSchema,
  DAILY_MINUTES_DEFAULT,
  DAILY_MINUTES_MAX,
  DAILY_MINUTES_MIN,
  QualifiedBktObservationSchema,
  REASONING_OPERATIONS,
  SKILL_CLUSTERS,
  daysBetween,
  newEventId,
  newIdempotencyKey,
  newLearnerId,
  systemClock,
  type BktApplicationRejectionCode,
  type BktClockAdjustment,
  type BktObservationSource,
  type BootstrapResponse,
  type BuildTodaysPathInput,
  type TodaysPathView,
  type CandidateEvidenceMode,
  type CarsDuelRubric,
  type CarsReadinessLabel,
  type CarsReadinessView,
  type CarsSkill,
  type Clock,
  type LearnerEvent,
  type LessonMasteryView,
  type MasterySeed,
  type MistakePatternView,
  type PracticeAttempt,
  type PracticeAttemptResult,
  type PracticeFocus,
  type PracticeQuestion,
  type PracticeQueueItem,
  type PracticeQueueView,
  type PolicyVersion,
  type QualifiedBktObservation,
  type ReasoningOperation,
  type SkillCluster,
  type SkillMasteryView,
  type UtcTimestamp,
} from '@mcat/contracts';
import {
  EvidenceRecordSchema,
  boundOccurredAtToServerTime,
  deriveEvidenceKind,
  isIndependentAdministration,
  scoreAttempt,
  type AdministrationFacts,
  type CapacityLabel,
  type EvidenceKind,
  type EvidenceOutcome,
  type EvidenceReason,
  type EvidenceRecord,
  type SkillEvidenceState,
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
  evaluateEvidence,
  initialMemoryState,
  isCarsOnTrack,
  isLessonRollupAvailable,
  MASTERY_THRESHOLD,
  overallCarsReadiness,
  PRACTICE_SELECTION_CONFIG,
  practiceSpecId,
  predictedCorrect,
  PRIOR_PL0,
  REVIEW_LINE,
  rollUpLessonMastery,
  SEED_CARS_MAX,
  SEED_CARS_MIN,
  SEED_PRIOR_CAP,
  SEED_PRIOR_FLOOR,
  selectPracticeQueue,
  type CarriedActivity,
  type GhostView,
  type LessonRollupResult,
  type MemoryState,
  type PracticeCarsUnit,
  type PracticeSnapshot,
  type PracticeUnit,
  type TodaysPathCandidateLesson,
  type TodaysPathSnapshot,
} from '@mcat/policies';
import {
  clusterForLesson,
  clusterForKc,
  loadSyntheticBank,
  orderedKcsForLesson,
  type LoadedBank,
} from '@mcat/content';
import {
  compiledToPracticeQuestion,
  SyntheticPracticeBankPort,
  type PracticeAnswer,
  type PracticeAttemptLogEntry,
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

/** One node of the loaded skill graph, one of the sources `warrantGrains` unions. */
type SkillNode = LoadedBank['skillGraph']['skills'][number];

/**
 * A hard prerequisite blocks only for these named warrant outcomes. They are
 * the reason-code equivalents of the legacy not-assessed/foundation gate; do
 * not turn this gate back into an ordinal comparison.
 */
const PREREQUISITE_BLOCKING_EVIDENCE_REASONS: ReadonlySet<EvidenceReason> = new Set([
  'NO_USEFUL_EVIDENCE',
  'PREREQUISITE_BLOCKED',
]);

/**
 * `PracticeSnapshot` (from `@mcat/policies`) plus the one fact the selection
 * engine has no use for but `getPracticeQueue` does: whether the taught-set
 * gate in `buildPracticeSnapshot` found a real, non-empty taught set that
 * shared nothing with the loaded bank. Extended locally rather than in the
 * shared policies package, because it is authority-side bookkeeping about
 * WHY a snapshot looks the way it does, not an input the pure engine reads.
 */
interface ScopedPracticeSnapshot extends PracticeSnapshot {
  readonly taughtGapDetected: boolean;
}

/** A grain a warrant is produced for, with the labels a view needs. */
interface WarrantGrain {
  readonly skillId: string;
  readonly cluster: SkillCluster;
  /** Governed label only — never an authored string. See `warrantGrainTitle`. */
  readonly title: string;
}

/**
 * A grain has evidence but no resolvable cluster, so no warrant can be published
 * for it.
 *
 * Thrown rather than skipped. Omitting the grain is what let the evidence
 * authority publish nothing for every lesson KC while every test passed: an
 * absent warrant is indistinguishable from "no evidence yet", so the failure had
 * no symptom. A loud throw names the ids and cannot be mistaken for an empty
 * result.
 */
export class UnresolvedWarrantGrainError extends Error {
  constructor(readonly skillIds: readonly string[]) {
    super(
      `No cluster resolves for warrant-bearing grain(s): ${skillIds.join(', ')}. ` +
        'Evidence exists for them, so they cannot be omitted from the warrant.',
    );
    this.name = 'UnresolvedWarrantGrainError';
  }
}

/** One grain whose cluster sources disagree, with every cluster they claim. */
export interface ConflictingWarrantCluster {
  readonly skillId: string;
  readonly clusters: readonly SkillCluster[];
}

/**
 * A grain's cluster resolves to two different values, so the warrant cannot say
 * where it belongs.
 *
 * Thrown, not resolved by precedence. This is strictly worse than a grain that
 * resolves nowhere: precedence picks one of the disagreeing answers and publishes
 * it confidently, so the routing bug reaches the planner as data rather than as a
 * failure. Unreachable while the registry keeps one owning lesson per KC — which
 * is exactly why it is asserted rather than left to the registry's current shape.
 */
export class ConflictingWarrantClusterError extends Error {
  constructor(readonly conflicts: readonly ConflictingWarrantCluster[]) {
    super(
      'Conflicting clusters for warrant-bearing grain(s): ' +
        conflicts.map((c) => `${c.skillId} claims ${c.clusters.join(' and ')}`).join('; ') +
        '. A grain belongs to exactly one cluster; picking one of the two would ' +
        'publish a confident wrong answer.',
    );
    this.name = 'ConflictingWarrantClusterError';
  }
}

/**
 * The label published for a grain, from a GOVERNED source only.
 *
 * `MasteryMapEntry.title` is a learner-facing field, and `skillId` reaches it
 * from `binding.primary_kc_id` — a string a lesson author writes. Echoing that
 * string as display copy would let an author put words on a learner's screen
 * through an id field, which is the shape of defect this seam spent the whole
 * run removing. So a title comes from one of exactly two governed sources:
 *
 * - the bank's reviewed `SkillNode.title`; or
 * - a KC id that is a member of the SHA-pinned V3 registry, evidenced by its
 *   cluster resolving through `clusterForKc`. That id is a governed structural
 *   identifier, not free author text, and a stable identifier beats a fabricated
 *   sentence.
 *
 * Anything else gets a fixed marker. Membership in the registry is the test, not
 * the shape of the id: no format matching, so a future id scheme needs no change
 * here. No consumer renders this field today (`SkillDetail.tsx` joins on
 * `skillId` and takes its heading from the skills endpoint), so this is
 * prophylactic — which is the point, because the next consumer will trust the
 * field's name.
 */
const UNTITLED_WARRANT_GRAIN = 'Untitled';

const warrantGrainTitle = (
  skillId: string,
  node: SkillNode | undefined,
  registryCluster: SkillCluster | null,
): string => {
  if (node !== undefined) return node.title;
  return registryCluster === null ? UNTITLED_WARRANT_GRAIN : skillId;
};

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
  {
    id: 'indep2',
    kind: 'question',
    phase: 'independent',
    questionId: 'q-enz-indep-noncompetitive',
  },
  {
    id: 'transfer',
    kind: 'question',
    phase: 'transfer',
    questionId: 'q-enz-transfer-lineweaver',
    changeDimensions: ['representation'],
  },
  { id: 'passage', kind: 'question', phase: 'passage', questionId: 'q-enz-passage-1' },
  { id: 'sim', kind: 'simulation', specId: 'sim-enz-inhibition' },
  {
    id: 'simTransfer',
    kind: 'question',
    phase: 'transfer',
    questionId: 'q-enz-sim-transfer-1',
    changeDimensions: ['domain_context'],
  },
  { id: 'protected', kind: 'question', phase: 'protected', questionId: 'q-enz-protected-1' },
  { id: 'recall', kind: 'recall', promptId: 'recall-enz-competitive' },
  { id: 'complete', kind: 'complete' },
];

const ENZYME_SKILL = 'bb1-enzyme-inhibition';
const ENZYME_LESSON_ID = 'lesson-enz-inhibition';

/**
 * What an adaptive-practice item is eligible to serve as, decided by the SERVER.
 *
 * Not an authored declaration and not reachable from one: no byte of item data
 * reaches this list, so the failure mode where an author widens their own
 * item's eligibility cannot occur here. It states a property of the CHANNEL —
 * a corpus item served cold and scored server-side — and `deriveEvidenceKind`
 * still gates it on the administration facts, so a repeat or an assisted
 * attempt resolves to a contextual-only kind regardless.
 */
const PRACTICE_EVIDENCE_MODES: readonly CandidateEvidenceMode[] = ['INDEPENDENT'];

/**
 * The family marker for an item whose corpus row names none.
 *
 * A family satisfies a recipe slot at most once, so collapsing every
 * unknown-family item onto one marker makes them share a single slot — fewer
 * slots filled, never more. Minting a distinct family per item (the questionId,
 * say) would be the generous direction, and generosity is the wrong default for
 * a field that decides how much evidence a learner is credited with.
 */
const UNKNOWN_ITEM_FAMILY = 'fam-unknown';

/**
 * How far ahead of the Authority clock a runner-reported `occurredAt` may be and
 * still be treated as honest clock skew rather than a broken or hostile client.
 *
 * Five minutes, the same allowance Kerberos and most JWT `nbf`/`exp` validators
 * use. It is generous enough for an unsynchronised session server or a device
 * whose clock drifted, and far too small to buy any decay advantage: at the
 * initial 7-day half-life, five minutes of forward drift is a ~0.03% difference
 * in the value read back. Anything beyond it is refused with
 * `OBSERVATION_TIMESTAMP_IN_FUTURE` rather than silently clamped, because a
 * clamp alone would accept the bad claim and leave no signal.
 */
export const BKT_OBSERVATION_FUTURE_SKEW_TOLERANCE_MS = 5 * 60 * 1000;

/**
 * How far BEHIND the Authority clock a reported `occurredAt` may be and still be
 * used as the decay baseline. Symmetric with the future tolerance, and five
 * minutes for the same reasons.
 *
 * A monotonic grain floor already stops a late claim rewinding a grain that has
 * history. It cannot help on a grain's FIRST write, where the floor is `null`,
 * and there the reported time was accepted verbatim: a claim dated 2020 produced
 * `currentPL = 5.4e-104`, and identical evidence delivered old-then-recent
 * versus recent-then-old produced `0.1497` versus `0.8624` — a 5.8× spread in the
 * learner-facing number from delivery order alone.
 *
 * The claim is CLAMPED, never refused. Refusing any backdating would undo the
 * deliberate choice to detect rather than enforce ordering: delayed and offline
 * submissions are normal and their evidence must not be discarded. Clamping keeps
 * the answer and only declines to apply a decay penalty the server cannot verify.
 *
 * Why this width. Order-dependence cannot be eliminated while the reported time
 * is honoured at all, only bounded — and it is bounded by the decay across the
 * window, which at the initial 7-day half-life is ~0.03%. A wider window (a day:
 * ~9%) would leave a spread a learner could see. The cost is the opposite
 * direction: a genuinely long-delayed submission has its decay baseline treated
 * as recent, which is generous. That is the right way to be wrong here — the
 * elapsed time is unverifiable, the server prefers its own clock over an
 * unverifiable claim, and the WARRANT timestamp is bounded separately against
 * `acceptedAt` and keeps the honest time, so freshness, delay and retention are
 * unaffected. Only the memory baseline moves, and `P(L)` still requires real
 * correct answers to rise: the clamp cannot manufacture evidence.
 */
export const BKT_OBSERVATION_PAST_SKEW_TOLERANCE_MS = 5 * 60 * 1000;

const instant = (t: UtcTimestamp): number => Date.parse(t);
const shiftedBy = (t: UtcTimestamp, deltaMs: number): UtcTimestamp =>
  new Date(instant(t) + deltaMs).toISOString() as UtcTimestamp;
const earlierOf = (a: UtcTimestamp, b: UtcTimestamp): UtcTimestamp =>
  instant(a) <= instant(b) ? a : b;
const laterOf = (a: UtcTimestamp, b: UtcTimestamp): UtcTimestamp =>
  instant(a) >= instant(b) ? a : b;

/** The server-bounded decay clock actually used, with what it took to get there. */
interface BoundedDecayClock {
  /** The time the step treated as reported, whoever generated it. */
  reportedAt: UtcTimestamp;
  appliedAt: UtcTimestamp;
  clockAdjustment: BktClockAdjustment;
}

/**
 * Who generated the time a caller offers the single write path.
 *
 * The two cases are not interchangeable and must not be spelled the same way.
 * A `server` time is the Authority's own clock, read inside the step, so there
 * is nothing to verify. A `caller` time is a runtime FACT reported by something
 * the server does not control (contract §2) and is therefore checked — refused
 * outright when implausibly ahead, clamped otherwise.
 *
 * Making the distinction part of the INPUT is the point. `reportedAt:
 * UtcTimestamp` accepted both with one spelling, so the future-skew refusal
 * could only live in the one caller that happened to know its time was
 * untrusted, and every other path was safe by contingency — its `reportedAt`
 * merely happened to be server-generated. A fourth path accepting a client time
 * has to name it `caller` to compile, and naming it is what applies the guard.
 */
type ReportedTime =
  | { readonly origin: 'server' }
  | { readonly origin: 'caller'; readonly at: UtcTimestamp };

/** A server-generated time, read inside the step. The common case. */
const SERVER_REPORTED_TIME: ReportedTime = { origin: 'server' };

/**
 * The single write path refused a caller-reported time before anything moved.
 *
 * Thrown rather than returned deliberately. A refusal is the fail-closed
 * outcome, so a caller that has not thought about it must abort its write, not
 * receive a value it can ignore and carry on with — which is the shape of every
 * fail-open in this codebase's ledger. `applyQualifiedBktObservation` catches
 * it and turns it into the audited `rejected` result the contract specifies.
 */
export class BktObservationRefusedError extends Error {
  readonly rejectionCodes: readonly BktApplicationRejectionCode[];

  constructor(rejectionCodes: readonly BktApplicationRejectionCode[]) {
    super(`The BKT write path refused the observation: ${rejectionCodes.join(', ')}.`);
    this.name = 'BktObservationRefusedError';
    this.rejectionCodes = rejectionCodes;
  }
}

/** Outcome of applying one `QualifiedBktObservation`. */
export type QualifiedBktApplication = {
  observationId: string;
  /** The two grains this observation targets, echoed for audit. */
  kcId: string;
  reasoningOperation: ReasoningOperation;
} & (
  | {
      status: 'applied';
      /** The runner's verbatim claim, retained even when it was not used. */
      reportedOccurredAt: UtcTimestamp;
      /** The bounded, monotonic decay clock the grains were written with. */
      appliedOccurredAt: UtcTimestamp;
      clockAdjustment: BktClockAdjustment;
      /**
       * An observation with a higher `sequence` was already applied. The BKT
       * update still happened — see `applyQualifiedBktObservation`.
       */
      outOfOrder: boolean;
    }
  /** Already applied under this `observationId`; nothing moved at all. */
  | { status: 'duplicate' }
  /** Refused before anything moved. Never partially applied. */
  | { status: 'rejected'; rejectionCodes: readonly BktApplicationRejectionCode[] }
);

/**
 * Focus token a "try again" action carries into the practice queue. The queue's
 * own repair seam (`recentMisses` → `queueRepair`) then picks a FRESH unseen item
 * in the missed KC, so this only has to narrow the pool — it must never identify
 * the item, or the re-attempt would be a re-serve.
 */
const focusFor = (
  cluster: SkillCluster | null,
  skill: ReasoningOperation | null,
): PracticeFocus | null =>
  cluster !== null ? cluster.toLowerCase() : skill !== null ? skill.toLowerCase() : null;

/** `kc-acid-base-buffers` → `kc acid base buffers`, for a display label. */
const humanize = (id: string): string => id.replace(/[-_]+/g, ' ').trim();

/** Narrow a loose choice id to the four deliverable options (null when skipped). */
const asChoiceId = (value: string | null): 'A' | 'B' | 'C' | 'D' | null =>
  value === 'A' || value === 'B' || value === 'C' || value === 'D' ? value : null;

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
      this.attemptEvent(state, questionId, choiceId, {
        assistanceLevel: 'A0',
        isDiagnosticRetry: false,
      }),
    );
    // Placement evidence is contextual only (never mastery), attributed to the probed skill.
    const probedSkill =
      this.bank.questions.find((q) => q.id === questionId)?.internal_skill_ids[0] ?? ENZYME_SKILL;
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
      ? Math.max(
          1,
          Math.round(daysBetween(state.createdAt, state.goal.testDate as unknown as UtcTimestamp)),
        )
      : null;
    // Ghost companion: derived only from the learner's own goal, timeline, and
    // coverage. Reads the internal warrant, since "has any evidence at all" is a
    // tier comparison and the published view no longer carries the tier.
    const clustersWithEvidence = new Set(
      this.skillWarrants(state)
        .filter(({ evidence }) => evidence.evidenceQuality !== 'not_assessed')
        .map(({ grain }) => grain.cluster),
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

  async getToday(state: LearnerState): Promise<TodayView> {
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
    const repairsOpen = (await this.getErrorLog(state)).filter((e) => !e.resolved).length;
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
   * Mistakes the Review-Mistakes slot can actually show: unresolved question
   * misses (practice and study) the learner has not already been walked through
   * today.
   *
   * This is the same list the Mistakes tab renders, deliberately. The slot used
   * to be sized from a bare `state.mistakeCount` that stored no content, so it
   * could promise "3 mistakes piled up" and open an empty page. Sizing it from
   * the tab's own source makes that divergence unrepresentable.
   *
   * Recall lapses, in-lesson comprehension checks and CARS duels are excluded
   * because they are never displayed here (docs/design/error-handling-design.md
   * §6.5): those happen during acquisition or scheduling, where errorful
   * generation is the mechanism doing the work rather than a fault to repair.
   * Including study misses moves this threshold earlier in the day, which is the
   * intended effect — the slot is sized from real repairable content either way.
   */
  async openMistakes(state: LearnerState): Promise<ErrorEntryView[]> {
    const clearedThrough = state.mistakesReviewedThrough ?? null;
    return (await this.getErrorLog(state)).filter(
      (e) => !e.resolved && (clearedThrough === null || e.occurredAt > clearedThrough),
    );
  }

  /** Read the current day's plan (built:false when none exists for today yet). */
  getTodaysPath(state: LearnerState): TodaysPathView {
    return this.todaysPathView(state);
  }

  /** Build (and persist) today's plan; idempotent per day unless `force`. */
  async buildTodaysPath(state: LearnerState, input: BuildTodaysPathInput): Promise<TodaysPathView> {
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
    const snapshot = await this.todaysPathSnapshot(
      state,
      input,
      planDate,
      engineBudget,
      ctx,
      carryOver,
    );
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
  async recordPlanActivity(
    state: LearnerState,
    activityId: string,
    status: 'in_progress' | 'complete' | 'skipped',
  ): Promise<void> {
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
      // Completing a Mistakes session stops those misses from re-scheduling one.
      // It does NOT hide them from the Mistakes tab: a mistake is resolved by a
      // correct answer on a fresh item in the same KC, not by having been read.
      if (activity.kind === 'review_mistakes') state.mistakesReviewedThrough = this.clock.now();
    }
    // Dynamic: if independent misses have piled up during the day, inject a Mistakes
    // session as the next step and push the last still-ready activity to tomorrow.
    this.maybeInjectMistakesSession(plan, (await this.openMistakes(state)).length);
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

  private async todaysPathSnapshot(
    state: LearnerState,
    input: BuildTodaysPathInput,
    planDate: string,
    preset: number,
    ctx: ReturnType<Authority['dayContext']>,
    carryOver: CarriedActivity[],
  ): Promise<TodaysPathSnapshot> {
    // Single mastery read, reused for both the mastered-id gate and the per-lesson
    // P(L) map that feeds scoreLesson's minor mastery nudge (avoid computing twice).
    const candidateLessonIds = input.candidateLessons.map((lesson) => lesson.lessonId);
    const masteryLessons = this.getMasteryLessons(state, candidateLessonIds);
    const masteredLessonIds = new Set(
      masteryLessons.filter((l) => l.mastered).map((l) => l.lessonId),
    );
    const pLByLesson = new Map(masteryLessons.map((l) => [l.lessonId, l.pL]));
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
      // Untracked lessons have no memory state yet → fall back to the P(L)_0 prior.
      pL: pLByLesson.get(l.lessonId) ?? PRIOR_PL0,
    }));

    return {
      planDate,
      dailyBudgetMinutes: preset,
      dayNumber: ctx.dayNumber,
      totalDays: ctx.totalDays,
      coveragePct: ctx.coveragePct,
      recall: input.recallLoad,
      mistakesOpen: (await this.openMistakes(state)).length,
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
        retryPending: false,
      };
      return;
    }
    // A session persisted mid-flight on the removed cause step resumes at the
    // reveal it should have been given, with its retry still owed. The cast is the
    // point: 'cause' is no longer representable in the type, but it is still
    // representable in a stored projection, and without this a resumed session
    // would render no control at all.
    const s = state.session;
    if ((s.sub as string) === 'cause') {
      s.sub = 'reveal';
      s.retryPending = true;
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
      return {
        kind: 'recall',
        promptId: prompt.id,
        prompt: prompt.prompt,
        format: prompt.format,
        skillId: s.skillId,
      };
    }
    // question
    const compiled = this.bank.compiled.get(activity.questionId!)!;
    const stimulus =
      compiled.safe.stimulus_id !== null
        ? (this.bank.stimuli.find((st) => st.id === compiled.safe.stimulus_id) ?? null)
        : null;
    const reveal =
      s.sub === 'reveal'
        ? {
            correctChoiceId: compiled.protected.correct_choice_id,
            correctRationale: compiled.protected.rationales.correct,
            choiceRationales: compiled.protected.rationales.choices as Record<string, string>,
            // Which option THEY picked, so the reveal can refute that specific
            // reasoning rather than restate the key (§3.3). Read off session state
            // rather than the browser's selection, which does not survive the step.
            chosenChoiceId: asChoiceId(s.currentFirstChoiceId),
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

  /**
   * Learner submits an answer for the current question step.
   *
   * A missed first attempt goes STRAIGHT to the reveal, which names the key and
   * refutes the option they actually picked. The learner is not asked what
   * happened first: experts naming the cause of an error agree at κ = 0.000–0.063
   * and learner self-report is biased worst in the weakest learners (§2.3). The
   * 2026-07-28 amendment to §3.3, which defers the key to a second miss, is scoped
   * to adaptive Practice and leaves this path as it is.
   * Study's one unassisted retry survives — `retryPending` spends it when the
   * learner leaves the reveal, so it now follows the correction instead of
   * standing in front of it.
   */
  async submitAttempt(state: LearnerState, choiceId: string | null): Promise<void> {
    this.startSession(state);
    const s = state.session!;
    const activity = this.currentActivity(state);
    if (activity === null || activity.kind !== 'question') return;
    const compiled = this.bank.compiled.get(activity.questionId!)!;
    const correctId = compiled.protected.correct_choice_id;
    const phase = activity.phase!;

    if (s.sub === 'answering') {
      s.currentFirstChoiceId = choiceId;
      this.recordEvent(
        state,
        this.attemptEvent(state, activity.questionId!, choiceId, {
          assistanceLevel: 'A0',
          isDiagnosticRetry: false,
        }),
      );

      // The first answering attempt is INDEPENDENT (A0, no hint, not a retry, not
      // revealed), so it moves P(L) — up on correct, down on wrong. Retries and
      // reveals below are non-independent and never touch mastery (fail-closed).
      this.updateMasteryForAttempt(state, activity.questionId!, choiceId === correctId);
      await this.logStudyAttempt(state, activity, choiceId, choiceId === correctId);

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
        s.sub = 'reveal';
        s.retryPending = true;
      }
      return;
    }

    if (s.sub === 'retry') {
      this.recordEvent(
        state,
        this.attemptEvent(state, activity.questionId!, choiceId, {
          assistanceLevel: 'A0',
          isDiagnosticRetry: true,
        }),
      );
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
      // The correction was already shown before this retry, so there is nothing
      // left to reveal — move on.
      this.advance(state);
    }
  }

  /**
   * Log one Study first attempt into the SAME attempt log adaptive Practice
   * writes, tagged `activity_type = 'study'`, so a Study miss reaches the Mistakes
   * tab with the distractor the learner chose.
   *
   * `kcId` is the item's `kc_ids[0]` — a v3 KC id, the SAME grain and the same id
   * space adaptive Practice logs from `questions.kc_id`. It used to be
   * `internal_skill_ids[0]`, a skill-graph node (`bb1-enzyme-inhibition`), which
   * could never compare equal to a corpus KC id (`V3-KC-525816`); a study miss and
   * a practice miss on one concept therefore formed two patterns instead of one.
   * The lesson graph and the corpus share all 422 of their KCs, so this is a
   * field-selection fix, not a translation between id spaces. `internal_skill_ids`
   * is untouched and still resolves the display skill and the prerequisite edges.
   *
   * The other three grain columns already agreed with Practice and are unchanged:
   * `skill` is the item's 7-op reasoning operation, `cluster` its 15-cluster
   * rollup, `familyId` its item family.
   *
   * Additive and read-only downstream: it changes no scoring, no mastery, no
   * evidence and no exposure. It deliberately does NOT call `queueRepair`. That is
   * now a scope decision rather than an id-space limitation — a study KC WOULD
   * match corpus items — and the re-attempt path is the `focus` token on the
   * Mistakes row, which the practice queue's own exposure seam resolves to a fresh
   * unseen item. Spending a queue slot from here is a separate change.
   *
   * Guided-phase questions are excluded: those are in-lesson comprehension checks
   * during acquisition, where errorful generation is the mechanism doing the work,
   * and §6.5 keeps them off this surface.
   */
  private async logStudyAttempt(
    state: LearnerState,
    activity: PathActivity,
    choiceId: string | null,
    correct: boolean,
  ): Promise<void> {
    const questionId = activity.questionId;
    if (questionId === undefined || activity.phase === 'guided') return;
    const q = this.bank.questions.find((x) => x.id === questionId);
    await this.practiceBank.recordPracticeAttempt(state.learnerId, {
      questionId,
      kcId: q?.kc_ids[0] ?? null,
      skill: this.masteryTarget(questionId, state.session?.skillId ?? ENZYME_SKILL).op,
      cluster: q?.skill_cluster ?? null,
      familyId: q?.family_id ?? null,
      chosenChoiceId: asChoiceId(choiceId),
      correct,
      firstAttempt: true,
      activityType: 'study',
      occurredAt: this.clock.now(),
    });
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

  /**
   * Advance from a non-question step (lesson/simulation/recall) or after a reveal.
   *
   * Leaving the reveal on a missed item spends the one unassisted retry rather
   * than advancing. This is the same reordering adaptive Practice made: the retry
   * is kept, only the answer-withholding in front of it is gone.
   */
  continueStep(state: LearnerState): void {
    this.startSession(state);
    const s = state.session!;
    if (s.sub === 'reveal' && s.retryPending === true) {
      s.sub = 'retry';
      s.retryPending = false;
      return;
    }
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
      payload: {
        reviewObjectId: ContentIdSchema.parse(prompt.id),
        rating: correct ? 'good' : 'again',
        elapsedMs: 0,
      },
    });
    this.advance(state);
    return correct;
  }

  // ---- Views --------------------------------------------------------------

  /**
   * Every grain a warrant must be produced for, with the labels a view needs.
   *
   * The bank's skill graph is NOT the answer. It holds two synthetic enzyme ids,
   * while lesson evidence is keyed on `binding.primaryKcId`, a `V3-KC-*`. Driving
   * the warrant off the graph alone meant the evidence authority published no
   * tier, no satisfied or missing slot, no `freshestByKind` and no reason code
   * for any grain a lesson writes — an empty set, silently, for exactly the
   * signals the planner is specified to consume. Every seam test still passed,
   * because `evaluateEvidence` is skillId-agnostic and nothing downstream read
   * what the adapter wrote.
   *
   * So the enumeration is the union of three sources:
   *
   * 1. the loaded skill graph — the synthetic vertical's own grains;
   * 2. every `skillId` that actually has an evidence record;
   * 3. the required KCs of every practiced lesson, so a KC with NO evidence
   *    still reports its gaps. "You have practiced this lesson and this KC has
   *    nothing behind it" is the most actionable warrant there is, and it cannot
   *    be expressed by omitting the KC.
   *
   * `cluster` is resolved from three sources — the graph node, the grain's own
   * evidence records (`EvidenceRecord.cluster` is required and caller-resolved),
   * and `clusterForKc` — and they MUST agree. Resolving nowhere throws
   * {@link UnresolvedWarrantGrainError}; resolving to two different clusters
   * throws {@link ConflictingWarrantClusterError}. Neither is silently absorbed:
   * a grain whose routing disagrees with itself is in a worse state than one that
   * resolves nowhere, because precedence would publish a confident wrong answer
   * instead of an error.
   */
  private warrantGrains(state: LearnerState): WarrantGrain[] {
    const graphSkills = new Map<string, SkillNode>(
      this.bank.skillGraph.skills.map((skill) => [skill.skillId, skill]),
    );
    const clustersFromRecords = new Map<string, Set<SkillCluster>>();
    const ordered: string[] = [...graphSkills.keys()];
    const seen = new Set<string>(ordered);

    const consider = (skillId: string): void => {
      if (seen.has(skillId)) return;
      seen.add(skillId);
      ordered.push(skillId);
    };

    for (const record of state.evidence) {
      // EVERY cluster the evidence claims, not the first: precedence between two
      // disagreeing records is the fail-quiet this collects in order to reject.
      // A persisted projection is untrusted JSON, so an absent value is possible
      // even though the type forbids it.
      const claimed = record.cluster as SkillCluster | undefined;
      if (claimed !== undefined) {
        const claims = clustersFromRecords.get(record.skillId) ?? new Set<SkillCluster>();
        claims.add(claimed);
        clustersFromRecords.set(record.skillId, claims);
      }
      consider(record.skillId);
    }
    for (const lessonId of state.mastery?.practicedLessonIds ?? []) {
      for (const kcId of orderedKcsForLesson(lessonId) ?? []) consider(kcId);
    }

    const grains: WarrantGrain[] = [];
    const unresolved: string[] = [];
    const conflicting: ConflictingWarrantCluster[] = [];

    for (const skillId of ordered) {
      const node = graphSkills.get(skillId);
      const candidates = new Set<SkillCluster>(clustersFromRecords.get(skillId) ?? []);
      if (node !== undefined) candidates.add(node.cluster);
      const registryCluster = clusterForKc(skillId);
      if (registryCluster !== null) candidates.add(registryCluster);

      if (candidates.size === 0) {
        unresolved.push(skillId);
        continue;
      }
      if (candidates.size > 1) {
        conflicting.push({ skillId, clusters: [...candidates].sort() });
        continue;
      }

      grains.push({
        skillId,
        cluster: [...candidates][0]!,
        title: warrantGrainTitle(skillId, node, registryCluster),
      });
    }

    // Conflicts first: a contradictory grain is the more dangerous of the two,
    // and reporting all of both is what makes one bad registry change legible.
    if (conflicting.length > 0) throw new ConflictingWarrantClusterError(conflicting);
    if (unresolved.length > 0) throw new UnresolvedWarrantGrainError(unresolved);
    return grains;
  }

  /**
   * INTERNAL evidence warrant per grain, tier included.
   *
   * `evidenceQuality` is an ordinal, and ordinals are legitimate here: the
   * planner and the coverage counters compare them. It stops at the package
   * boundary. Anything learner-facing goes through {@link getMasteryMap}, which
   * projects this without the tier — see the note there.
   */
  private skillWarrants(
    state: LearnerState,
  ): { grain: WarrantGrain; evidence: SkillEvidenceState }[] {
    const now = this.clock.now();
    return this.warrantGrains(state).map((grain) => {
      const records = state.evidence.filter((e) => e.skillId === grain.skillId);
      return {
        grain,
        evidence: evaluateEvidence({
          skillId: grain.skillId,
          records,
          now,
          prerequisiteBlocked: this.isPrerequisiteBlocked(state, grain.skillId),
          hasInstruction: records.length > 0,
        }),
      };
    });
  }

  /**
   * The evidence WARRANT per skill as the learner sees it: which recipe slots the
   * evidence fills, how fresh it is, and what is missing — as reason codes. Not a
   * capability estimate; that is `getMasterySkills`.
   *
   * The ordinal `evidenceQuality` tier is deliberately NOT projected. It is the
   * only thing a consumer could threshold, and every consumer that read it
   * eventually did: the deleted `countGlowing` ranked it, `getWrapped` ranked it,
   * and the session badge ordered its wording by it — three rival mastery scales
   * grown from one published integer. Reason codes carry the same warrant without
   * an axis to compare along.
   */
  getMasteryMap(state: LearnerState): MasteryMapEntry[] {
    return this.skillWarrants(state).map(({ grain, evidence }) => ({
      skillId: evidence.skillId,
      refreshNeeded: evidence.refreshNeeded,
      supportingEvidenceIds: [...evidence.supportingEvidenceIds],
      freshestByKind: evidence.freshestByKind,
      reasons: [...evidence.reasons],
      policyVersion: evidence.policyVersion,
      cluster: grain.cluster,
      title: grain.title,
    }));
  }

  // ---- Mastery engine (BKT/IRT, mastery-bkt / provisional-v1) --------------
  // P(L) is the only learner-facing capability number; the evidence warrant
  // above is a separate signal. A qualified response moves exactly two grains.
  // Runs ONLY for independent attempts (fail-closed).

  private ensureMastery(state: LearnerState): MasteryEngineState {
    const existing = state.mastery;
    // Truthiness, not `=== undefined`: a pre-seam projection may deserialize
    // with `mastery: null`, and this is the one function whose job is tolerating
    // whatever a legacy projection holds. Narrowing it to `undefined` turned a
    // tolerated legacy value into a crash.
    if (!existing) {
      state.mastery = {
        kc: {},
        skill: {},
        cars: {},
        practicedLessonIds: [],
        appliedObservationIds: [],
        highestAppliedObservationSequence: null,
      };
      return state.mastery;
    }
    // A projection persisted before these fields existed deserializes without
    // them; backfill rather than trusting the cast.
    existing.practicedLessonIds ??= [];
    existing.appliedObservationIds ??= [];
    existing.highestAppliedObservationSequence ??= null;
    return existing;
  }

  /** Record a lesson as practiced. Routing for the rollup only; never a BKT target. */
  private recordPracticedLesson(m: MasteryEngineState, lessonId: string): void {
    if (!m.practicedLessonIds.includes(lessonId)) m.practicedLessonIds.push(lessonId);
  }

  /**
   * Bound a reported time into a decay clock the server is willing to write.
   *
   * `stepMemory` and `reinforcePrerequisite` both assign `lastPracticedAt = now`
   * unconditionally, and `currentPL` decays from it, so whoever supplies `now`
   * controls decay, review-due, and the mastery cut. A runner-reported
   * `occurredAt` therefore cannot be used raw: forward-dating it buys permanent
   * mastery, and back-dating it wipes a real estimate through lazy decay over
   * the invented gap. Both are the client writing a mastery claim, which
   * contract §10 prohibits.
   *
   * The clamp is two-sided:
   *
   *   appliedAt = max( serverNow - pastTolerance, min(grainFloor, serverNow), min(reportedAt, serverNow) )
   *
   * - **Never ahead of the server clock.** The Authority's own clock is the
   *   ceiling. (An implausibly future claim is refused before reaching here; see
   *   `BKT_OBSERVATION_FUTURE_SKEW_TOLERANCE_MS`.)
   * - **Never rewinds a grain.** `grainFloor` is the newest `lastPracticedAt`
   *   among the grains this observation writes, so no grain's clock can move
   *   backwards. A legitimately delayed observation still applies its BKT
   *   evidence — only the decay clock is held — because discarding it would
   *   silently lose real evidence.
   * - **Never further into the past than the server will vouch for.** The grain
   *   floor is `null` on a grain's FIRST write, and without a third bound the
   *   clamp degenerated there: an arbitrarily backdated claim became the decay
   *   baseline, measured at `currentPL = 5.4e-104`, and `P(L)` came out
   *   arrival-order dependent (0.1497 vs 0.8624 for identical evidence).
   *   `serverNow - BKT_OBSERVATION_PAST_SKEW_TOLERANCE_MS` closes it.
   *
   * The grain floor is itself capped at `serverNow`: a stored future timestamp is
   * invalid on its face, so it must not become a permanent floor, and this makes
   * any state poisoned before the clamp existed heal on the next write.
   *
   * `applyMasteryAttempt` takes one `now` for all the grains it steps, so the
   * floor is the maximum across them. A grain lagging behind its siblings is
   * therefore pulled forward to their shared floor rather than rewinding them —
   * bounded above by `serverNow` and by activity the server itself accepted.
   *
   * The floor spans only the grains this observation actually WRITES. Counting a
   * grain that is left untouched lets it drag the clock forward for no reason:
   * prerequisites are reinforced on a correct answer only, so on a miss they are
   * excluded, which is worth doing precisely because the shift is small enough
   * (~3 days, ~0.005 of `pL`) to go unnoticed.
   */
  private boundDecayClock(
    m: MasteryEngineState,
    times: { serverNow: UtcTimestamp; reportedAt: UtcTimestamp },
    grainKeys: { kcIds: readonly string[]; operation: ReasoningOperation },
  ): BoundedDecayClock {
    // The clock is read ONCE per write, by the caller, and both bounds are taken
    // against that single reading. Reading it again here would let the two
    // readings disagree, and on a server-generated time that is the only way
    // `appliedAt` could ever diverge from `reportedAt` — a clamp reported
    // against a path that has nothing to clamp.
    const { serverNow, reportedAt } = times;
    const ceiling = earlierOf(reportedAt, serverNow);
    const serverFloor = shiftedBy(serverNow, -BKT_OBSERVATION_PAST_SKEW_TOLERANCE_MS);

    const touched: readonly (MemoryState | undefined)[] = [
      ...grainKeys.kcIds.map((kcId) => m.kc[kcId]),
      m.skill[grainKeys.operation],
    ];
    let grainFloor: UtcTimestamp | null = null;
    for (const state of touched) {
      const practicedAt = state?.lastPracticedAt ?? null;
      if (practicedAt === null) continue;
      grainFloor = grainFloor === null ? practicedAt : laterOf(grainFloor, practicedAt);
    }

    const cappedGrainFloor = grainFloor === null ? null : earlierOf(grainFloor, serverNow);
    const floor = cappedGrainFloor === null ? serverFloor : laterOf(cappedGrainFloor, serverFloor);
    const appliedAt = laterOf(floor, ceiling);

    // Which bound decided, so the ledger says what actually happened. A grain's
    // own history wins the `held_at_last_practiced` label; the server clock
    // deciding either end — future ceiling or past window — is
    // `bounded_to_server_clock`.
    const heldByGrain =
      cappedGrainFloor !== null && instant(appliedAt) === instant(cappedGrainFloor);
    const clockAdjustment: BktClockAdjustment =
      instant(appliedAt) === instant(reportedAt)
        ? 'none'
        : heldByGrain
          ? 'held_at_last_practiced'
          : 'bounded_to_server_clock';

    return { reportedAt, appliedAt, clockAdjustment };
  }

  /**
   * Move the two direct BKT grains, plus the indirect one-hop prerequisite
   * reinforcement. The single write path for `P(L)`: the synthetic study
   * vertical, `applyQualifiedBktObservation` and adaptive practice all go
   * through it, so none can acquire a grain the others lack, and none can write
   * an unbounded decay clock.
   *
   * BOTH HALVES of the clock invariant live here, which is the whole reason the
   * door exists. Below tolerance the claim is CLAMPED (`boundDecayClock`); above
   * it the claim is REFUSED with `OBSERVATION_TIMESTAMP_IN_FUTURE`. The refusal
   * used to live in `applyQualifiedBktObservation` alone, so the other paths
   * were safe only because their reported time happened to be server-generated
   * — contingent reasoning of exactly the kind the clamp was moved in here to
   * eliminate. A fourth path that accepts a client time now inherits the refusal
   * by construction rather than by remembering to re-implement it.
   *
   * Enforced structurally, not by discipline:
   * `tests/architecture/mastery-write-path.test.ts` fails the build if
   * `applyMasteryAttempt` or `boundDecayClock` is reached from anywhere else.
   */
  private stepDirectGrains(
    m: MasteryEngineState,
    input: {
      kcId: string;
      operation: ReasoningOperation;
      correct: boolean;
      /**
       * The time to decay from, and who generated it. A `caller` time is
       * refused when implausibly ahead of the Authority clock and bounded
       * otherwise; it is never written raw.
       */
      reportedAt: ReportedTime;
      dokLevel: number | undefined;
      /**
       * Population stats for the item, when the caller has them: they carry the
       * calibrated IRT difficulty. Absent means uncalibrated, so `b` falls back
       * to the DOK cold start — which is what the synthetic bank and the lesson
       * corpus both are.
       */
      questionStats?: { attempts: number; correct: number };
    },
  ): BoundedDecayClock {
    // Refused BEFORE any grain is read or written, so a rejected observation is
    // never partially applied.
    const serverNow = this.clock.now();
    const reportedAt = input.reportedAt.origin === 'server' ? serverNow : input.reportedAt.at;
    if (
      input.reportedAt.origin === 'caller' &&
      instant(reportedAt) - instant(serverNow) > BKT_OBSERVATION_FUTURE_SKEW_TOLERANCE_MS
    ) {
      throw new BktObservationRefusedError(['OBSERVATION_TIMESTAMP_IN_FUTURE']);
    }

    const prereqKeys = this.bank.skillGraph.edges
      .filter((e) => e.kind === 'hard_prerequisite' && e.to === input.kcId)
      .map((e) => e.from);

    // `reinforcePrerequisite` runs on a correct answer only, so on a miss the
    // prerequisite grains are not written and must not raise the floor.
    const writtenKcIds = input.correct ? [input.kcId, ...prereqKeys] : [input.kcId];
    const clock = this.boundDecayClock(
      m,
      { serverNow, reportedAt },
      {
        kcIds: writtenKcIds,
        operation: input.operation,
      },
    );

    const result = applyMasteryAttempt({
      correct: input.correct,
      now: clock.appliedAt,
      // Uncalibrated by default: an in-memory bank never crosses the calibration
      // floor, so `b` is DOK-derived unless the caller supplied real stats.
      questionStats: input.questionStats ?? { attempts: 0, correct: 0 },
      ...(input.dokLevel !== undefined ? { dokLevel: input.dokLevel } : {}),
      states: {
        kc: m.kc[input.kcId] ?? initialMemoryState(),
        reasoningOperation: m.skill[input.operation] ?? initialMemoryState(),
      },
      prerequisites: prereqKeys.map((k) => m.kc[k] ?? initialMemoryState()),
    });

    m.kc[input.kcId] = result.states.kc;
    m.skill[input.operation] = result.states.reasoningOperation;
    prereqKeys.forEach((k, i) => {
      const next = result.prerequisites[i];
      if (next) m.kc[k] = next;
    });

    return clock;
  }

  /** Derive the two BKT grains (+ DOK) for a synthetic bank item. */
  private masteryTarget(
    questionId: string,
    fallbackSkill: string,
  ): { kcKey: string; op: ReasoningOperation; dok: number | undefined } {
    const q = this.bank.questions.find((x) => x.id === questionId);
    const kcKey = q?.internal_skill_ids[0] ?? fallbackSkill;
    const op = OPERATION_TAG_TO_REASONING[q?.template_tags[0] ?? 'K'] ?? 'IDENTIFY';
    return { kcKey, op, dok: q?.difficulty };
  }

  /**
   * Apply one independent synthetic-path attempt to the two grains (+ prereqs).
   *
   * The study loop's first answering attempt, reached in production from
   * `POST /v1/attempts` through `submitAttempt`. It is scored inside the
   * request, so the step reads the Authority clock itself and no client-reported
   * time touches the decay baseline.
   *
   * The ledger record is appended AFTER the attempt event, and that ordering is
   * load-bearing: `applyAttempt` in the authority kernel rewrites the event at
   * the index it recorded, so the attempt must stay first in the slice this call
   * appends to.
   */
  private updateMasteryForAttempt(state: LearnerState, questionId: string, correct: boolean): void {
    const m = this.ensureMastery(state);
    const target = this.masteryTarget(questionId, state.session?.skillId ?? ENZYME_SKILL);
    const clock = this.stepDirectGrains(m, {
      kcId: target.kcKey,
      operation: target.op,
      correct,
      reportedAt: SERVER_REPORTED_TIME,
      dokLevel: target.dok,
    });
    this.recordPracticedLesson(m, ENZYME_LESSON_ID);

    // Every capability write leaves a ledger record, whatever moved it. This
    // path moved `P(L)` with no record at all until now, which is the same
    // defect the practice path had: the clamp applies, but nothing survives to
    // show what it applied to. There is no observation id or sequence here —
    // the study loop scores in-request, so there is nothing to deduplicate
    // against and nothing to order.
    this.recordBktObservationEvent(
      state,
      {
        source: 'synthetic_study',
        observationId: null,
        observationSequence: null,
        questionId,
        primaryKcId: target.kcKey,
        reasoningOperation: target.op,
        correct,
        reportedOccurredAt: clock.reportedAt,
        contentRelease: this.bank.contentRelease,
        policies: activePolicyVersions(),
      },
      {
        appliedOccurredAt: clock.appliedAt,
        clockAdjustment: clock.clockAdjustment,
        outOfOrder: false,
        rejectionCodes: [],
      },
    );
  }

  /**
   * SERVER-ONLY. Apply one already-qualified lesson response to BKT.
   *
   * `observation` is the sole input the BKT engine accepts from a lesson, and it
   * is re-parsed here through the strict `QualifiedBktObservationSchema`: the
   * shape has no `independent`, `pL`, `mastered`, `masteryThreshold`,
   * `evidenceStatus` or `kind` field, so a caller cannot assert any of them and
   * an unrecognized key is rejected rather than ignored. Qualification itself
   * (both gates in lesson-evidence-mastery-contract §5) happens upstream in
   * `adaptLessonResponse`; this method never re-decides it and never manufactures
   * it.
   *
   * Exactly two grains move: `primaryKcId` and `reasoningOperation` (§8.2).
   * `lessonId` is deliberately NOT part of the observation — it is passed
   * separately as routing/audit only, recorded so the lesson rollup knows which
   * lessons to report, and it never influences a `P(L)`.
   *
   * Idempotent on `observationId` (§12): a re-delivered accepted response
   * resolves to `duplicate` and moves nothing, not even routing state.
   *
   * THE REPORTED TIME IS NOT TRUSTED. `observation.occurredAt` comes from the
   * lesson runner (§2), so it is refused outright when implausibly ahead of the
   * Authority clock, and otherwise bounded and made monotonic before it can
   * become a decay clock (see `boundDecayClock`). The verbatim claim is kept in
   * the ledger either way, so the clamp cannot erase the evidence that a client
   * misreported.
   *
   * `observation.sequence` is compared against the highest already applied. An
   * out-of-order arrival is RECORDED, not refused: delayed and reordered
   * delivery is normal, and dropping a legitimately earlier observation would
   * silently lose real evidence. The clamp is what keeps the resulting state
   * sane, since a late arrival can no longer rewind a grain's clock.
   */
  applyQualifiedBktObservation(
    state: LearnerState,
    input: { observation: QualifiedBktObservation; lessonId?: string },
  ): QualifiedBktApplication {
    const observation = QualifiedBktObservationSchema.parse(input.observation);
    const identity = {
      observationId: observation.observationId,
      kcId: observation.primaryKcId,
      reasoningOperation: observation.reasoningOperation,
    } as const;
    const m = this.ensureMastery(state);

    if (m.appliedObservationIds.includes(observation.observationId)) {
      return { ...identity, status: 'duplicate' };
    }

    const highestApplied = m.highestAppliedObservationSequence;
    const outOfOrder = highestApplied !== null && observation.sequence <= highestApplied;

    // The future-skew refusal is NOT re-checked here. It belongs to
    // `stepDirectGrains`, alongside the clamp that is the other half of the same
    // invariant, so no write path can route around it; this method only turns
    // the refusal into the audited result the contract specifies.
    let clock: BoundedDecayClock;
    try {
      clock = this.stepDirectGrains(m, {
        kcId: observation.primaryKcId,
        operation: observation.reasoningOperation,
        correct: observation.correct,
        reportedAt: { origin: 'caller', at: observation.occurredAt },
        dokLevel: observation.dokLevel,
      });
    } catch (error) {
      if (!(error instanceof BktObservationRefusedError)) throw error;
      const { rejectionCodes } = error;
      this.recordBktObservationEvent(state, this.lessonObservationLedgerIdentity(observation), {
        appliedOccurredAt: null,
        clockAdjustment: 'none',
        outOfOrder: false,
        rejectionCodes,
      });
      return { ...identity, status: 'rejected', rejectionCodes };
    }

    m.appliedObservationIds.push(observation.observationId);
    if (!outOfOrder) m.highestAppliedObservationSequence = observation.sequence;
    if (input.lessonId !== undefined && input.lessonId.trim().length > 0) {
      this.recordPracticedLesson(m, input.lessonId.trim());
    }

    this.recordBktObservationEvent(state, this.lessonObservationLedgerIdentity(observation), {
      appliedOccurredAt: clock.appliedAt,
      clockAdjustment: clock.clockAdjustment,
      outOfOrder,
      rejectionCodes: [],
    });

    return {
      ...identity,
      status: 'applied',
      reportedOccurredAt: observation.occurredAt,
      appliedOccurredAt: clock.appliedAt,
      clockAdjustment: clock.clockAdjustment,
      outOfOrder,
    };
  }

  /**
   * Append the audit record for one attempt that reached the BKT engine. The
   * ONE writer of this record, for every `source`: a second writer is how the
   * practice path came to move `P(L)` with no ledger entry at all.
   *
   * Written for applications and refusals alike; a duplicate lesson observation
   * writes nothing, because the original record already stands. `occurredAt` on
   * the envelope is when the SERVER acted, so the caller's claim only ever
   * appears as `payload.reportedOccurredAt`.
   *
   * The record is PARSED through `BktObservationAppliedSchema` here, not merely
   * typed as it. The payload's cross-field guards are `superRefine`s, which
   * `z.infer` drops, so the compiler cannot see them and a record contradicting
   * itself — a practice write carrying an observation id, an applied clock on a
   * refusal — would type-check and append cleanly. This is the only writer, so
   * parsing here makes those guards live on the whole write path at one call
   * site. Deliberately NOT in `recordEvent`: that appends every event type and
   * would turn one narrow ledger invariant into a repo-wide re-parse.
   */
  private recordBktObservationEvent(
    state: LearnerState,
    attempt: {
      source: BktObservationSource;
      /** The observation's identity, or `null` on a source that has none. */
      observationId: string | null;
      observationSequence: number | null;
      questionId: string;
      primaryKcId: string;
      reasoningOperation: ReasoningOperation;
      correct: boolean;
      reportedOccurredAt: UtcTimestamp;
      contentRelease: string;
      policies: readonly PolicyVersion[];
    },
    outcome: {
      appliedOccurredAt: UtcTimestamp | null;
      clockAdjustment: BktClockAdjustment;
      outOfOrder: boolean;
      rejectionCodes: readonly BktApplicationRejectionCode[];
    },
  ): void {
    const event = BktObservationAppliedSchema.parse({
      type: 'bkt_observation_applied',
      eventId: newEventId(),
      learnerId: state.learnerId,
      idempotencyKey: newIdempotencyKey(),
      occurredAt: this.clock.now(),
      contentRelease: attempt.contentRelease,
      policies: [...attempt.policies],
      payload: {
        source: attempt.source,
        observationId: attempt.observationId,
        observationSequence: attempt.observationSequence,
        questionId: attempt.questionId,
        primaryKcId: attempt.primaryKcId,
        reasoningOperation: attempt.reasoningOperation,
        correct: attempt.correct,
        reportedOccurredAt: attempt.reportedOccurredAt,
        appliedOccurredAt: outcome.appliedOccurredAt,
        clockAdjustment: outcome.clockAdjustment,
        outOfOrder: outcome.outOfOrder,
        rejectionCodes: [...outcome.rejectionCodes],
      },
    });
    this.recordEvent(state, event);
  }

  /** The audit identity of one qualified lesson response. */
  private lessonObservationLedgerIdentity(observation: QualifiedBktObservation): {
    source: BktObservationSource;
    observationId: string;
    observationSequence: number;
    questionId: string;
    primaryKcId: string;
    reasoningOperation: ReasoningOperation;
    correct: boolean;
    reportedOccurredAt: UtcTimestamp;
    contentRelease: string;
    policies: readonly PolicyVersion[];
  } {
    return {
      source: 'lesson_response',
      observationId: observation.observationId,
      observationSequence: observation.sequence,
      questionId: observation.questionId,
      primaryKcId: observation.primaryKcId,
      reasoningOperation: observation.reasoningOperation,
      correct: observation.correct,
      reportedOccurredAt: observation.occurredAt,
      contentRelease: observation.contentRelease,
      policies: observation.policies,
    };
  }

  /**
   * BKT review-due for one grain: it was at or above the review line when last
   * practiced and has decayed below it since.
   *
   * This is capability, and it is NOT the evidence warrant's `refreshNeeded`
   * ("the warrant is stale or contradicted"). The two used to publish under one
   * field name, which is how a planner reading both would have collapsed them.
   */
  private decayedBelowReviewLine(st: MemoryState, decayed: number): boolean {
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
        reviewDue: st ? this.decayedBelowReviewLine(st, pL) : false,
        mastered: pL >= MASTERY_THRESHOLD,
      };
    });
  }

  /**
   * Lesson rollups, with their rejections, for audit and inspection.
   *
   * A lesson has no BKT state; each view is derived from the lesson's required
   * member KCs. The membership comes from `orderedKcsForLesson` — the pinned
   * curriculum registry — and never from whichever KCs happen to have a state,
   * because those two differ exactly when the caller is under-supplied.
   *
   * Every required KC is therefore supplied EXPLICITLY: a KC the learner has
   * never practiced is passed as `initialMemoryState()`, not omitted. Omitting
   * it would make every partly-started lesson fail closed with
   * `LESSON_KC_STATE_MISSING`, which is the rollup correctly refusing to tell a
   * complete membership apart from a partial one.
   *
   * `lessonIds` defaults to the lessons this learner has practiced. A lesson
   * with no registry membership yields `status: 'unavailable'` and never a
   * fabricated number.
   */
  getLessonRollups(state: LearnerState, lessonIds?: readonly string[]): LessonRollupResult[] {
    const m = this.ensureMastery(state);
    const now = this.clock.now();
    // Deduplicated the way `rollUpLessonMastery` dedupes KC ids: a lesson named
    // twice is one lesson, and two identical rows would double-count it in any
    // caller that aggregates.
    const ids = [...new Set(lessonIds ?? m.practicedLessonIds)];
    return ids.map((lessonId) => {
      const requiredKcIds = orderedKcsForLesson(lessonId);
      const kcStates: Record<string, MemoryState> = {};
      for (const kcId of requiredKcIds ?? []) {
        kcStates[kcId] = m.kc[kcId] ?? initialMemoryState();
      }
      return rollUpLessonMastery({ lessonId, requiredKcIds, kcStates, now });
    });
  }

  /**
   * Per-lesson readout for the Evidence Atlas brain nodes on Progress, rolled up
   * from each lesson's required member KCs (see {@link getLessonRollups}). A
   * lesson whose membership does not resolve is omitted rather than reported as
   * `0` or as vacuously mastered; `getLessonRollups` carries the reason why.
   */
  getMasteryLessons(state: LearnerState, lessonIds?: readonly string[]): LessonMasteryView[] {
    return this.getLessonRollups(state, lessonIds)
      .filter(isLessonRollupAvailable)
      .map(({ view }) => ({
        lessonId: view.lessonId,
        cluster: clusterForLesson(view.lessonId) ?? null,
        pL: view.pL,
        reviewDue: view.reviewDue,
        mastered: view.mastered,
      }));
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
    const label: CarsReadinessLabel = onTrack
      ? 'on_track'
      : overallV >= 0.85
        ? 'approaching'
        : 'building';
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
    const capped = (prior: number): number =>
      Math.min(SEED_PRIOR_CAP, Math.max(SEED_PRIOR_FLOOR, prior));
    for (const [kcId, prior] of Object.entries(seed.kcPriors)) {
      if (!m.kc[kcId]) m.kc[kcId] = initialMemoryState(capped(prior));
    }
    for (const [op, prior] of Object.entries(seed.skillPriors)) {
      const operation = op as ReasoningOperation;
      if (!m.skill[operation]) m.skill[operation] = initialMemoryState(capped(prior));
    }
    for (const [skill, v] of Object.entries(seed.carsAbility)) {
      const cars = skill as CarsSkill;
      if (m.cars[cars] === undefined)
        m.cars[cars] = Math.min(SEED_CARS_MAX, Math.max(SEED_CARS_MIN, v));
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
   * and anything already queued).
   *
   * A spec can still come up with nothing at the pull step — the exact KC×skill
   * combination the engine chose may have no fresh item left once recently-seen
   * exclusion is applied, even though the unit looked eligible going in. That
   * shortfall is counted (`shortfall = requested - items.length`) and returned
   * on the view rather than left for the caller to infer from a shorter array;
   * see `PracticeQueueView.shortfall`. `taughtGap` carries the more specific
   * signal that the shortfall (if any) traces to `buildPracticeSnapshot`'s
   * taught-set gate finding zero overlap, not to the bank running dry.
   */
  async getPracticeQueue(
    state: LearnerState,
    x: number,
    focus?: PracticeFocus,
  ): Promise<PracticeQueueView> {
    const requested = Math.max(0, Math.min(Math.floor(x), 50));
    const focusToken = focus ?? null;
    if (requested === 0) {
      return { requested: 0, focus: focusToken, items: [], shortfall: 0, taughtGap: false };
    }

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

    return {
      requested,
      focus: focusToken,
      items,
      shortfall: Math.max(0, requested - items.length),
      taughtGap: snapshot.taughtGapDetected,
    };
  }

  /**
   * Score one practice answer.
   *
   * Every response records exposure and writes an evidence record. On a FIRST
   * attempt — a fact this method DERIVES, never one the request supplies — it
   * also moves the P(L) mastery signal through the Authority's single
   * `stepDirectGrains` step (BKT on the two capability grains, the primary KC
   * and the primary reasoning operation; IRT `carsUpdate` at measurement weight
   * for CARS), records population stats, logs the chosen distractor, and queues
   * a KC×skill repair on a miss.
   *
   * A repeat is learning-only: no P(L), no ledger record, and a contextual-only
   * evidence record rather than silence. A lesson is NOT a grain — practice
   * records the lesson for the rollup's routing only (see
   * `applyPracticeMastery`). Answer material is returned only here
   * (post-submit), never in the queue.
   */
  async submitPracticeAttempt(
    state: LearnerState,
    cmd: PracticeAttempt,
  ): Promise<PracticeAttemptResult> {
    const answer = await this.practiceBank.getAnswer(cmd.questionId);
    if (answer === null) {
      throw new Error(`Practice item ${cmd.questionId} is unavailable.`);
    }
    // One derivation of the outcome, shared by the returned result, the BKT
    // signal and the evidence record. An unanswered item is `omitted`, a scored
    // outcome rather than a missing one — the same reading the lesson adapter
    // takes, and the reason a learner who skips the hard items still accrues a
    // record rather than a silence.
    const outcome: EvidenceOutcome =
      cmd.chosenChoiceId === null
        ? 'omitted'
        : cmd.chosenChoiceId === answer.correctChoiceId
          ? 'correct'
          : 'incorrect';
    const correct = outcome === 'correct';
    const now = this.clock.now();

    /**
     * Whether this is the learner's first answer to this item, DERIVED.
     *
     * The wire command carries a `firstAttempt` claim and this method cannot
     * read it: `PracticeAttempt` does not have the field. It arrived as a
     * browser boolean hardcoded `true`, so every response asserted a first
     * attempt and every first-attempt-conditioned rule was permanently
     * satisfied — but the deeper problem is that it is a claim about state only
     * the SERVER holds, which no client is in a position to make. Validating
     * the claim against the exposure records and warning on a mismatch would
     * have left it on the path for every request that is not actively hostile.
     *
     * The count comes back from the write that increments it, so a repeat
     * submitted concurrently with its original cannot have both read zero.
     */
    const exposure = await this.practiceBank.recordExposure(state.learnerId, cmd.questionId, now);
    const firstAttempt = exposure.priorExposures === 0;

    const classification = await this.practiceBank.classify(cmd.questionId);
    if (classification !== null) {
      const stats = await this.practiceBank.questionStats(cmd.questionId);
      // Every response, first or repeat: a repeat records contextual-only
      // evidence and moves no grain, which is a different thing from leaving no
      // trace of the answer at all. `now` reaches the evidence record only —
      // the BKT decay clock is still read inside `stepDirectGrains`, because
      // the ledger's reported and applied times must come from one reading or
      // `clockAdjustment` can describe a clamp that never happened.
      this.applyPracticeMastery(state, cmd.questionId, classification, outcome, stats, {
        firstAttempt,
        now,
      });
    }

    if (firstAttempt) {
      await this.practiceBank.recordAttempt(cmd.questionId, correct, now);
      // Log the first attempt WITH the chosen distractor. Which wrong answer they
      // picked is the diagnostic signal (docs/design/error-handling-design.md §1);
      // it used to reach only an unread event payload. Correct attempts are logged
      // too so the pattern section has a denominator. Read-only downstream: this
      // changes no scoring, mastery, exposure or repair behaviour.
      await this.practiceBank.recordPracticeAttempt(state.learnerId, {
        questionId: cmd.questionId,
        kcId: classification?.kcId ?? null,
        skill: classification?.skill ?? null,
        cluster: classification?.cluster ?? null,
        familyId: classification?.familyId ?? null,
        chosenChoiceId: cmd.chosenChoiceId,
        correct,
        firstAttempt,
        activityType: 'practice',
        occurredAt: now,
      });
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
  ): ScopedPracticeSnapshot {
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
      // `itemCount` is the bank's declared supply for this KC × skill unit
      // (see `PracticeCandidateUnit.itemCount`). A unit with nothing behind it
      // must never occupy a selection slot only to come up empty when the
      // authority later tries to pull a concrete item for it.
      if (u.itemCount <= 0) continue;
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

    /**
     * Per-KC teach-before-test: only serve KCs the learner has been taught
     * (union of completed lessons' KCs, cached at plan-build).
     *
     * FAILS CLOSED. A taught set that shares nothing with the loaded bank is a
     * MISS, not an invitation to widen back out to the unfiltered corpus — that
     * used to serve untaught material dressed up as graceful degradation. An
     * empty result is a signal a caller can act on; wrong material reaching a
     * learner is a harm no caller can undo. `taughtGapDetected` on the returned
     * snapshot is exactly that signal, so `getPracticeQueue` can surface it
     * rather than let a mysteriously-empty science queue speak for itself.
     *
     * Only the true ABSENCE of a taught set (no lesson completions recorded at
     * all — a guest who has never run Today's Path) skips the filter: there is
     * no taught claim to violate yet, which is a different fact from a taught
     * claim that missed.
     */
    const taught =
      state.taughtKcIds && state.taughtKcIds.length > 0 ? new Set(state.taughtKcIds) : null;
    const scopedUnits = taught ? scienceUnits.filter((u) => taught.has(u.kcId)) : scienceUnits;
    const taughtGapDetected =
      taught !== null && scienceUnits.length > 0 && scopedUnits.length === 0;

    return {
      units: scopedUnits,
      cars: carsUnits,
      repairs: repairs.map((r) => (r.skill ? { kcId: r.kcId, skill: r.skill } : { kcId: r.kcId })),
      coveredClusters: covered,
      taughtGapDetected,
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

  /**
   * Apply one practice answer to the mastery signal, and write the warrant for
   * it in the same breath.
   *
   * Science goes through `stepDirectGrains`, the same door the lesson path and
   * the synthetic study path use. It used to call `applyMasteryAttempt` inline,
   * which reached the grains without the bounded monotonic decay clock: the
   * write still succeeded, so decay simply stopped applying on this path and
   * nothing failed. Routing it here rather than calling `boundDecayClock`
   * alongside is deliberate — a second caller of the clamp is a duplicated
   * invariant, and the next writer copies the duplicate.
   *
   * The capability write and the evidence record are ONE unit. Practice moved
   * `P(L)` and wrote no evidence at all, which made it a channel that changed a
   * learner's capability estimate with nothing on record to justify it — and
   * because evidence sufficiency is computed across channels, the absence read
   * as "this learner has no warrant here" rather than as a missing writer. So a
   * response that cannot produce a record does not move a grain either; see the
   * cluster refusal below.
   *
   * CARS is the IRT authority, not BKT: no capability grain moves, so it writes
   * no BKT ledger record. It writes no evidence record here either — the
   * evidence/warrant surface is keyed to the BKT grains, and a CARS warrant
   * grain vocabulary is a separate question from this one.
   */
  private applyPracticeMastery(
    state: LearnerState,
    questionId: string,
    classification: PracticeItemClassification,
    outcome: EvidenceOutcome,
    stats: { attempts: number; correct: number },
    administration: { firstAttempt: boolean; now: UtcTimestamp },
  ): void {
    const m = this.ensureMastery(state);
    const correct = outcome === 'correct';
    if (classification.domain === 'cars') {
      if (classification.carsSkill === null || !administration.firstAttempt) return;
      m.cars[classification.carsSkill] = carsUpdate(m.cars[classification.carsSkill] ?? CARS_V0, {
        r: correct ? 1 : 0,
        b: 0,
        k: CARS_K_POTD,
      });
      return;
    }
    if (classification.kcId === null || classification.skill === null) return;

    /**
     * The grain's cluster, registry first.
     *
     * `EvidenceRecord.cluster` is caller-resolved and `warrantGrains` requires
     * every source that claims a cluster for a grain to AGREE, throwing rather
     * than picking a winner. Reading the SHA-pinned registry first and using
     * the corpus column only where the registry is silent makes a disagreement
     * unrepresentable from this writer: what lands in the record is what
     * `clusterForKc` will report back, or the only claim there was.
     *
     * No cluster at all means no record can be written, and therefore no grain
     * may move: an unwarranted capability write is the defect this method
     * exists to close, and a record with an unroutable grain is worse still —
     * `warrantGrains` throws on it, taking every OTHER grain's warrant down
     * with it.
     */
    const cluster = clusterForKc(classification.kcId) ?? classification.cluster;
    if (cluster === null) return;

    const record = this.practiceEvidence(state, {
      questionId,
      skillId: classification.kcId,
      cluster,
      familyId: classification.familyId,
      outcome,
      firstAttempt: administration.firstAttempt,
      occurredAt: administration.now,
    });
    state.evidence.push(record);

    // Only a first attempt is capability evidence. A repeat has already had the
    // answer and the rationale shown to it, so its record above is
    // contextual-only and nothing below runs.
    if (!administration.firstAttempt) return;

    const clock = this.stepDirectGrains(m, {
      kcId: classification.kcId,
      operation: classification.skill,
      correct,
      // Practice is scored inside the request, so the step reads the Authority
      // clock itself; the bound is a no-op on it except where a grain's own
      // history is newer, which is monotonicity doing its job rather than a
      // clamp. Nothing a client sent reaches the decay clock on this path.
      reportedAt: SERVER_REPORTED_TIME,
      dokLevel: classification.dok ?? undefined,
      questionStats: stats,
    });

    // The rollup reports the lessons a learner has practised, and practice
    // reaches KCs that belong to lessons. Without this a lesson practised only
    // here never enters `practicedLessonIds`, so the default
    // `getMasteryLessons(state)` silently omits it — the lesson looks unstudied
    // to the planner while its KCs carry real evidence.
    if (classification.lessonId !== null && classification.lessonId.trim().length > 0) {
      this.recordPracticedLesson(m, classification.lessonId.trim());
    }

    // Every capability write leaves a ledger record, whatever moved it. There is
    // no observation id or sequence here: practice is scored in-request, so
    // there is nothing to deduplicate against and nothing to order — and a
    // record claiming otherwise is refused by the payload's own guard, which
    // `recordBktObservationEvent` runs rather than merely typing against.
    this.recordBktObservationEvent(
      state,
      {
        source: 'adaptive_practice',
        observationId: null,
        observationSequence: null,
        questionId,
        primaryKcId: classification.kcId,
        reasoningOperation: classification.skill,
        correct,
        // The step's own reading of the clock, not this method's `now`: the
        // ledger's two times must come from one source, or `clockAdjustment`
        // and the pair it describes can disagree by a millisecond of drift.
        reportedOccurredAt: clock.reportedAt,
        contentRelease: this.bank.contentRelease,
        policies: activePolicyVersions(),
      },
      {
        appliedOccurredAt: clock.appliedAt,
        clockAdjustment: clock.clockAdjustment,
        outOfOrder: false,
        rejectionCodes: [],
      },
    );
  }

  /**
   * The warrant for one practice answer, in the SAME shape lesson evidence
   * carries — because evidence sufficiency is computed across both channels,
   * and a slimmer practice-specific record would make "mastered requires
   * evidence" mean one thing for a lesson and another for a question.
   *
   * Practice genuinely faces fewer administration conditions than a lesson
   * exit does. Every one of them is recorded as ABSENT rather than omitted:
   *
   * - `mixed` — the queue may interleave grains, but a submit sees one item and
   *   has no view of the queue it came from, so the condition is unobservable
   *   here. Unobservable fails closed to false; crediting it would fill the
   *   mixed recipe slot on a claim nothing checked.
   * - `passage` — an item can carry a stimulus, but the recipe slot means
   *   passage-integrated multi-skill administration, which is a stronger claim
   *   than "this item had text above it".
   * - `timed` — practice is untimed.
   * - `protected` — practice serves the general corpus, not a held-out
   *   server-scored pool.
   * - `accommodations` — none are modelled on this path.
   *
   * `operation` is omitted for the same reason lesson evidence omits it: the
   * `OperationTag` authoring-analysis axis has no honest source here, and the
   * item's reasoning operation is a different axis that already reaches BKT.
   */
  private practiceEvidence(
    state: LearnerState,
    input: {
      questionId: string;
      skillId: string;
      cluster: SkillCluster;
      familyId: string | null;
      outcome: EvidenceOutcome;
      firstAttempt: boolean;
      occurredAt: UtcTimestamp;
    },
  ): EvidenceRecord {
    /**
     * The administration, as the server observed it.
     *
     * `assistanceLevel: 'A0'` is an observation, not the lesson runtime's
     * fail-closed default: adaptive practice offers no hint, no scaffold and no
     * reveal before an answer is committed, so there is no help that could have
     * been taken. `isRetry` is the one fact the client cannot be asked for —
     * see `submitPracticeAttempt`, which derives it from the exposure records
     * the server holds.
     */
    const facts: AdministrationFacts = {
      assistanceLevel: 'A0',
      contentBearingHintUsed: false,
      revealUsed: false,
      isRetry: !input.firstAttempt,
      isDiagnosticRetry: false,
    };
    const conditions = {
      mixed: false,
      passage: false,
      timed: false,
      protected: false,
      accommodations: [],
    };
    return EvidenceRecordSchema.parse({
      evidenceId: crypto.randomUUID(),
      skillId: input.skillId,
      cluster: input.cluster,
      // The same function the lesson adapter classifies with, so one attempt
      // cannot be called independent by one channel and instructional by the
      // other. PRACTICE_EVIDENCE_MODES says what the CHANNEL is eligible to
      // serve as; the administration facts still outrank it, so a repeat
      // resolves to a contextual-only kind however the channel is declared.
      kind: deriveEvidenceKind(PRACTICE_EVIDENCE_MODES, facts, conditions),
      independent: isIndependentAdministration(facts),
      assistanceLevel: facts.assistanceLevel,
      contentBearingHint: facts.contentBearingHintUsed,
      questionId: input.questionId,
      itemVersion: 1,
      familyId: input.familyId ?? UNKNOWN_ITEM_FAMILY,
      changeDimensions: [],
      conditions,
      outcome: input.outcome,
      valid: true,
      // Through the one producer of the branded server-bounded type rather than
      // assigned raw. The ceiling IS this reading, so the bound is a no-op — but
      // routing through it is what makes "never a client-supplied time" a
      // property of the type rather than of this call site's discipline.
      occurredAt: boundOccurredAtToServerTime(input.occurredAt, input.occurredAt),
      sequence: state.nextSequence,
      contentRelease: this.bank.contentRelease,
      policies: activePolicyVersions(),
    });
  }

  // ---- Practice hooks (Passage of the Day, etc.) ------------------------

  getPracticeItem(questionId: string): PracticeItemView | null {
    const compiled = this.bank.compiled.get(questionId);
    if (!compiled) return null;
    const stimulus =
      compiled.safe.stimulus_id !== null
        ? (this.bank.stimuli.find((s) => s.id === compiled.safe.stimulus_id) ?? null)
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
      this.attemptEvent(state, questionId, choiceId, {
        assistanceLevel: 'A0',
        isDiagnosticRetry: false,
      }),
    );
    // Low-stakes daily practice: contextual evidence only (never mastery).
    const skillId =
      this.bank.questions.find((q) => q.id === questionId)?.internal_skill_ids[0] ?? ENZYME_SKILL;
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
      choiceRationale: choiceId && choiceId !== correctId ? (rationales[choiceId] ?? null) : null,
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
        if (score !== undefined) {
          this.updateCarsAbility(state, skill, score / 3, CARS_K_DUEL);
        }
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

  /**
   * `skillsGlowing` is a CAPABILITY claim and comes from BKT, via the very same
   * `getMasterySkills` call Home reads, so the two screens cannot disagree. It
   * used to threshold the ordinal evidence tier at `>= independent`, which let a
   * learner see "3 skills glowing" on Wrapped and "0" on Home in one session.
   *
   * `skillsTouched` still reads the warrant, and correctly: "have I met this at
   * all" is coverage, not attainment, and it makes no claim about capability.
   */
  async getWrapped(state: LearnerState): Promise<WrappedView> {
    const counts: Record<string, number> = {};
    for (const e of state.evidence) counts[e.kind] = (counts[e.kind] ?? 0) + 1;
    return {
      dayNumber: Math.max(1, Math.floor(daysBetween(state.createdAt, this.clock.now())) + 1),
      skillsTouched: this.skillWarrants(state).filter(
        ({ evidence }) => evidence.evidenceQuality !== 'not_assessed',
      ).length,
      skillsGlowing: this.getMasterySkills(state).filter((s) => s.mastered).length,
      evidenceCounts: counts,
      repairsCompleted: (await this.getErrorLog(state)).filter((e) => e.resolved).length,
      protectedPassed: state.evidence.filter(
        (e) => e.kind === 'protected' && e.outcome === 'correct',
      ).length,
    };
  }

  // ---- Mistakes ------------------------------------------------------------
  // Surface B (history) and Surface A (patterns) of docs/design/error-handling-design.md.
  // Both read the attempt log, which is the only place the chosen distractor
  // survives. Display scope is QUESTION ATTEMPTS — adaptive Practice and the Study
  // path (§6.5). What stays out: an FSRS "Again" is the scheduler hitting its
  // target retention, not a mistake, and an in-lesson comprehension check happens
  // during acquisition where errorful generation is the mechanism doing the work.
  // Neither is written to this log at all, so the scope is enforced at the write.

  /** How many logged attempts the Mistakes surfaces read back. */
  private static readonly ATTEMPT_LOG_LIMIT = 500;

  /**
   * Distinct items in a group before a pattern may be ASSERTED rather than
   * hedged. No study sets this number. Ellerton & Clements found the careless
   * share of errors on a single question ranged from 1% to 71%, so item variance
   * plausibly dominates learner variance and a small-n "pattern" is most likely
   * an artifact of which items came up (§6.5 rule 5).
   */
  private static readonly PATTERN_ASSERT_ITEMS = 5;
  private static readonly PATTERN_ASSERT_MISSES = 3;
  /** Below this a group is not shown at all — one miss is an error, not a pattern. */
  private static readonly PATTERN_MIN_MISSES = 2;

  /**
   * A miss is resolved when a LATER first attempt on a DIFFERENT item in the same
   * KC was correct — i.e. the fresh-item re-attempt landed. Re-answering the same
   * item is not resolution (Karpicke & Roediger: re-testing the logged item is the
   * measure that shows nothing, §9), and the practice queue never re-serves.
   */
  private static resolved(
    attempts: readonly PracticeAttemptLogEntry[],
    miss: PracticeAttemptLogEntry,
  ): boolean {
    if (miss.kcId === null) return false;
    const missedAt = Date.parse(miss.occurredAt);
    return attempts.some(
      (a) =>
        a.correct &&
        a.kcId === miss.kcId &&
        a.questionId !== miss.questionId &&
        Date.parse(a.occurredAt) > missedAt,
    );
  }

  /**
   * Re-read the content behind one logged attempt.
   *
   * The two surfaces serve items from different corpora, so a row is hydrated from
   * the corpus it was served out of: adaptive Practice from the injected bank port
   * (real v7 Postgres in prod), the Study path from the authored lesson bank this
   * authority holds. Routing on `activityType` rather than trying both keeps the
   * practice path — the one that could not see a single miss before migration 0010
   * — free of any dependency on the synthetic bank being loaded.
   */
  private async hydrateAttempt(
    entry: PracticeAttemptLogEntry,
  ): Promise<{ question: PracticeQuestion; answer: PracticeAnswer } | null> {
    if (entry.activityType === 'study') {
      const compiled = this.bank.compiled.get(entry.questionId);
      if (compiled === undefined) return null;
      return {
        question: compiledToPracticeQuestion(this.bank, compiled),
        answer: {
          correctChoiceId: compiled.protected.correct_choice_id,
          rationale: compiled.protected.rationales.correct,
          choiceRationales: compiled.protected.rationales.choices as Record<string, string>,
        },
      };
    }
    const [question, answer] = await Promise.all([
      this.practiceBank.getQuestion(entry.questionId),
      this.practiceBank.getAnswer(entry.questionId),
    ]);
    return question === null || answer === null ? null : { question, answer };
  }

  /**
   * Surface B — the question history. One row per missed item, carrying the stem,
   * what the learner picked, what was correct, and the refutation they were shown.
   *
   * The previous implementation walked `attempt_submitted` events and required
   * `this.bank.compiled.get(questionId)` to resolve, which scoped it to the
   * 6-question synthetic demo bank; adaptive practice emits no such event, so not
   * one practice miss could ever appear. The event store is untouched — only the
   * error log's source moved.
   */
  async getErrorLog(state: LearnerState): Promise<ErrorEntryView[]> {
    const attempts = await this.practiceBank.listPracticeAttempts(state.learnerId, {
      limit: Authority.ATTEMPT_LOG_LIMIT,
    });
    const misses = attempts.filter((a) => !a.correct && a.firstAttempt);
    const hydrated = await Promise.all(
      misses.map(async (miss) => {
        const content = await this.hydrateAttempt(miss);
        // An item retired from its corpus since the miss can no longer be shown
        // back, and re-attempting it is impossible; drop it rather than render a
        // row with no content.
        if (content === null) return null;
        const { question, answer } = content;
        const textOf = (id: string | null): string =>
          id === null ? '' : (question.choices.find((c) => c.id === id)?.text ?? '');
        const entry: ErrorEntryView = {
          questionId: miss.questionId,
          kcId: miss.kcId,
          skillId: miss.skill,
          cluster: miss.cluster,
          familyId: miss.familyId,
          occurredAt: miss.occurredAt,
          stem: question.stem,
          chosenChoiceId: miss.chosenChoiceId,
          chosenChoiceText: textOf(miss.chosenChoiceId),
          correctChoiceId: answer.correctChoiceId,
          correctChoiceText: textOf(answer.correctChoiceId),
          choiceRationale:
            miss.chosenChoiceId === null
              ? null
              : (answer.choiceRationales[miss.chosenChoiceId] ?? null),
          resolved: Authority.resolved(attempts, miss),
          focus: focusFor(miss.cluster, miss.skill),
        };
        return entry;
      }),
    );
    return hydrated.filter((e): e is ErrorEntryView => e !== null);
  }

  /**
   * Surface A — recurring misses, grouped at KC grain (falling back to cluster
   * for items with no KC, e.g. CARS). Practice and study attempts group together:
   * the grain is a property of the content, not of the surface it was served on.
   *
   * NOT grouped at misconception grain: `error_models` is populated on 0 of the
   * 2,108 corpus items, so the best-validated grain has no data. Every row counts
   * DISTINCT items, carries its denominator, and hedges below the assertion floor.
   */
  async getMistakePatterns(state: LearnerState): Promise<MistakePatternView[]> {
    const attempts = await this.practiceBank.listPracticeAttempts(state.learnerId, {
      limit: Authority.ATTEMPT_LOG_LIMIT,
    });
    interface Group {
      grain: 'kc' | 'cluster';
      key: string;
      label: string;
      attempted: Set<string>;
      missed: Set<string>;
      lastMissedAt: UtcTimestamp | null;
      cluster: SkillCluster | null;
      skill: ReasoningOperation | null;
    }
    const groups = new Map<string, Group>();
    for (const attempt of attempts) {
      if (!attempt.firstAttempt) continue;
      const grain = attempt.kcId !== null ? 'kc' : 'cluster';
      const key = attempt.kcId ?? attempt.cluster;
      if (key === null) continue;
      const group = groups.get(`${grain}:${key}`) ?? {
        grain,
        key,
        label: grain === 'kc' ? humanize(key) : key,
        attempted: new Set<string>(),
        missed: new Set<string>(),
        lastMissedAt: null,
        cluster: attempt.cluster,
        skill: attempt.skill,
      };
      group.attempted.add(attempt.questionId);
      if (!attempt.correct) {
        group.missed.add(attempt.questionId);
        if (group.lastMissedAt === null || attempt.occurredAt > group.lastMissedAt) {
          group.lastMissedAt = attempt.occurredAt;
        }
      }
      groups.set(`${grain}:${key}`, group);
    }
    const patterns: MistakePatternView[] = [];
    for (const group of groups.values()) {
      if (group.missed.size < Authority.PATTERN_MIN_MISSES || group.lastMissedAt === null) continue;
      patterns.push({
        grain: group.grain,
        key: group.key,
        label: group.label,
        missedItems: group.missed.size,
        attemptedItems: group.attempted.size,
        lastMissedAt: group.lastMissedAt,
        assertable:
          group.attempted.size >= Authority.PATTERN_ASSERT_ITEMS &&
          group.missed.size >= Authority.PATTERN_ASSERT_MISSES,
        focus: focusFor(group.cluster, group.skill),
      });
    }
    return patterns.sort(
      (a, b) =>
        b.missedItems - a.missedItems || Date.parse(b.lastMissedAt) - Date.parse(a.lastMissedAt),
    );
  }

  /**
   * End-of-session summary: the warrant for the skill just practiced, as reason
   * codes. No tier — the screen used to pick its sentence out of an ordered list
   * keyed by the evidence rank, which is the same rival scale under new wording.
   * A skill with no warrant at all reports the explicit `NO_USEFUL_EVIDENCE`
   * code rather than an empty list, so the absence is stated and not inferred.
   */
  buildSummary(state: LearnerState, skillId: string): SessionSummary {
    const warrant = this.skillWarrants(state).find((w) => w.grain.skillId === skillId)?.evidence;
    const counts: Record<string, number> = {};
    for (const e of state.evidence.filter((x) => x.skillId === skillId)) {
      counts[e.kind] = (counts[e.kind] ?? 0) + 1;
    }
    return {
      skillId,
      refreshNeeded: warrant?.refreshNeeded ?? false,
      reasons: warrant ? [...warrant.reasons] : [{ code: 'NO_USEFUL_EVIDENCE' }],
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
    s.retryPending = false;
  }

  /**
   * A WARRANT gate, not a capability one: a hard prerequisite blocks while the
   * warrant emits an absence or blocked-prerequisite reason. Deliberately kept
   * on the evidence side after the split, because "we have not seen enough of
   * the right evidence yet" is a different question from "how likely is success
   * right now?", and a planner gating a high-consequence action should require
   * both an acceptable `P(L)` (`getMasterySkills`) AND a sufficient warrant. Two
   * signals consulted together are not a second mastery number.
   */
  private isPrerequisiteBlocked(state: LearnerState, skillId: string): boolean {
    const hardPrereqs = this.bank.skillGraph.edges
      .filter((e) => e.kind === 'hard_prerequisite' && e.to === skillId)
      .map((e) => e.from);
    if (hardPrereqs.length === 0) return false;
    for (const prereq of hardPrereqs) {
      const records = state.evidence.filter((e) => e.skillId === prereq);
      const evidence = evaluateEvidence({ skillId: prereq, records, now: this.clock.now() });
      if (evidence.reasons.some(({ code }) => PREREQUISITE_BLOCKING_EVIDENCE_REASONS.has(code))) {
        return true;
      }
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
