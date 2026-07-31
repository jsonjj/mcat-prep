import {
  BktObservationAppliedSchema,
  CARS_SKILL_INFO,
  ContentIdSchema,
  DAILY_MINUTES_DEFAULT,
  DAILY_MINUTES_MAX,
  DAILY_MINUTES_MIN,
  QualifiedBktObservationSchema,
  REASONING_OPERATIONS,
  SKILL_CLUSTERS,
  UtcTimestampSchema,
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
  type CalibrationBand,
  type CarsDuelOutcomeInput,
  type CarsDuelSelectionView,
  type CarsReadinessLabel,
  type CarsReadinessView,
  type CarsReasoningPatternView,
  type CarsSkill,
  type Clock,
  type GoalView,
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
  type RepairItemView,
  type RepairQueueView,
  type PastPracticeTest,
  type PracticeTestSummaryView,
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
  type EvidenceQualityTier,
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
  classifyCalibration,
  classifyCapacity,
  computeGhost,
  currentPL,
  decidePracticeTest,
  evaluateEvidence,
  initialMemoryState,
  isAtCapabilityCut,
  isCarsOnTrack,
  isLessonRollupAvailable,
  overallCarsReadiness,
  PRACTICE_SELECTION_CONFIG,
  PRACTICE_TEST_TIER_MINUTES,
  estimatePracticeTestScaled,
  practiceReadinessLabel,
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
  selectCarsDuel,
  recordCarsDuelOutcome,
  initialCarsDuelState,
  rubricToR,
  isWeakCarsDuel,
  weakestCarsSkill,
  type CarriedActivity,
  type DatedUnitObservation,
  type GhostView,
  type ItemResponseTime,
  type LessonRollupResult,
  type MemoryState,
  type PracticeCarsUnit,
  type PracticeSnapshot,
  type PracticeTestLengthTier,
  type PracticeUnit,
  type TodaysPathCandidateLesson,
  type TodaysPathSnapshot,
} from '@mcat/policies';
import {
  CARS_DUEL_TOPICS,
  CARS_DUEL_TOPICS_BY_ID,
  clusterForLesson,
  clusterForKc,
  loadSyntheticBank,
  orderedKcsForLesson,
  type LoadedBank,
} from '@mcat/content';
import {
  corroborateMasterySeed,
  MasterySeedNotCorroboratedError,
} from './mastery-seed-corroboration';
import {
  compiledToPracticeQuestion,
  SyntheticPracticeBankPort,
  type PracticeAnswer,
  type PracticeAttemptLogEntry,
  type PracticeAttemptRefusal,
  type PracticeBankPort,
  type PracticeCandidateUnit,
  type PracticeItemClassification,
  type PracticeRepairTarget,
} from './practice';
import type {
  CarsReasoningRepair,
  ErrorEntryView,
  LearnerState,
  LessonWarrantView,
  MasteryEngineState,
  MasteryMapEntry,
  OpenPracticeTestSitting,
  PracticeItemView,
  PracticeResult,
  PracticeTestCompletion,
  PracticeTestSittingRecord,
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
 * `PracticeSnapshot` (from `@mcat/policies`) plus the two facts the selection
 * engine has no use for but `getPracticeQueue` does: whether the taught-set
 * gate in `buildPracticeSnapshot` withheld every science unit the bank offered,
 * and whether the learner has been taught anything at all. Extended locally
 * rather than in the shared policies package, because it is authority-side
 * bookkeeping about WHY a snapshot looks the way it does, not an input the pure
 * engine reads.
 *
 * Two fields rather than one because they answer different questions and the
 * learner-facing sentence differs: "the questions we hold are not from your
 * finished lessons" is not "you have not finished a lesson". They cannot
 * disagree, because both read the one taught set — see `taughtKcSet`.
 */
interface ScopedPracticeSnapshot extends PracticeSnapshot {
  readonly taughtGapDetected: boolean;
  readonly nothingTaughtYet: boolean;
}

/**
 * The learner's taught-KC set: the union of their completed lessons' KCs, as
 * `todaysPathSnapshot` cached it. The ONE derivation, so the gate and the
 * "nothing taught yet" report can never describe different sets.
 *
 * Absent and empty are the same value here on purpose. They were once told
 * apart — see the teach-before-test docblock in `buildPracticeSnapshot`.
 */
const taughtKcSet = (state: LearnerState): ReadonlySet<string> => new Set(state.taughtKcIds ?? []);

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
 * The server did not issue this practice attempt, so it will not score it.
 *
 * Thrown rather than returned, and thrown BEFORE the answer key is read, so a
 * caller who was never served the item learns nothing about it — not whether it
 * exists, not what its answer is, and not what the queue would have chosen. The
 * transport decides the status code; every practice route maps this to the same
 * refusal the single-item route already gives an unassigned question.
 */
export class PracticeAttemptNotAuthorizedError extends Error {
  constructor(
    readonly reason: PracticeAttemptRefusal,
    readonly questionId: string,
  ) {
    super(
      `This practice attempt was not issued by the server (${reason}). ` +
        'An adaptive-practice answer is only accepted for an item the queue served ' +
        'to this learner, under the spec and content release it was served with.',
    );
    this.name = 'PracticeAttemptNotAuthorizedError';
  }
}

/**
 * How long a served item stays answerable.
 *
 * Long enough that no single sitting can outlast it, short enough that a queue
 * response is not a standing permission a caller can bank. The client refetches
 * the queue on every mount, and every serve re-issues, so the window renews for
 * anyone actually using the product; only a caller holding a response aside
 * meets the expiry at all.
 */
const PRACTICE_ATTEMPT_GRANT_TTL_MS = 12 * 60 * 60 * 1000;

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
 * The channel each write path's observations arrive on — named once each,
 * because two things now read the source and they must agree.
 *
 * The BKT engine reads it to pick the `guess` term, so a lesson exit is
 * believed less than a practice answer; the ledger reads it to record what
 * moved the grain. Two literals per path would let a future edit discount one
 * thing and audit another, and the disagreement would be invisible — both
 * halves would still be a valid `BktObservationSource`.
 *
 * `tests/architecture/mastery-write-path.test.ts` asserts this set against
 * `BKT_OBSERVATION_SOURCES` and forbids a bare source literal anywhere else in
 * this file.
 */
const LESSON_OBSERVATION_SOURCE = 'lesson_response' as const satisfies BktObservationSource;
const PRACTICE_OBSERVATION_SOURCE = 'adaptive_practice' as const satisfies BktObservationSource;
const STUDY_OBSERVATION_SOURCE = 'synthetic_study' as const satisfies BktObservationSource;

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

/**
 * The misconception a learner leaned toward across a KC group's missed items: the
 * mode of the picked misconceptions over the DISTINCT missed items. Null when no
 * missed item carried one. A tie resolves to the first reached in insertion order
 * (the strict `>` below never lets a later equal count overtake the incumbent); the
 * group's items are inserted in `listPracticeAttempts` order, which is newest-first,
 * so a tie resolves to the MOST-RECENTLY-missed item's misconception — a stable,
 * defensible pick, not a claim of strict dominance.
 */
const leaningMisconceptionOf = (
  missedItems: ReadonlySet<string>,
  misconceptionByItem: ReadonlyMap<string, string | null>,
): string | null => {
  const counts = new Map<string, number>();
  for (const questionId of missedItems) {
    const misconception = misconceptionByItem.get(questionId);
    if (misconception === null || misconception === undefined) continue;
    counts.set(misconception, (counts.get(misconception) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [misconception, count] of counts) {
    if (count > bestCount) {
      best = misconception;
      bestCount = count;
    }
  }
  return best;
};

/**
 * A repair item built from an `ErrorEntryView` — a "To fix" open miss or a shaky
 * "Win". The runner re-shows exactly what the Mistakes dashboard does (stem, the
 * pick vs the key, the trap, the refutation) before the mandatory fresh one. A win
 * carries the key as its pick and no trap/refutation, which its `calibration`
 * (`shaky_win`) and null `chosenMisconception`/`choiceRationale` already encode.
 */
const repairItemFromEntry = (
  bucket: 'tofix' | 'wins',
  e: ErrorEntryView,
  estMinutes: number,
): RepairItemView => ({
  bucket,
  focus: e.focus,
  freshFocus: e.focus,
  estMinutes,
  label: null,
  questionId: e.questionId,
  stem: e.stem,
  chosenChoiceId: e.chosenChoiceId,
  chosenChoiceText: e.chosenChoiceText,
  correctChoiceId: e.correctChoiceId,
  correctChoiceText: e.correctChoiceText,
  chosenMisconception: e.chosenMisconception,
  choiceRationale: e.choiceRationale,
  calibration: e.calibration,
  missedItems: null,
  attemptedItems: null,
  assertable: false,
  leaningMisconception: null,
  holdRatePct: null,
});

/**
 * A repair item for a recurring-miss pattern — an AGGREGATE, so it carries no
 * single question: the runner shows the KC/cluster label, the honest denominator,
 * and the leaned-toward misconception, then serves a fresh one in the pattern's focus.
 */
const repairItemFromPattern = (p: MistakePatternView, estMinutes: number): RepairItemView => ({
  bucket: 'patterns',
  focus: p.focus,
  freshFocus: p.focus,
  estMinutes,
  label: p.label,
  questionId: null,
  stem: null,
  chosenChoiceId: null,
  chosenChoiceText: '',
  correctChoiceId: null,
  correctChoiceText: '',
  chosenMisconception: null,
  choiceRationale: null,
  calibration: null,
  missedItems: p.missedItems,
  attemptedItems: p.attemptedItems,
  assertable: p.assertable,
  leaningMisconception: p.leaningMisconception,
  holdRatePct: null,
});

/**
 * A repair item for a CARS reasoning-pattern repair: the sub-skill title, the duel
 * hold-rate, and the pinned passage stem (nullable if the item retired — the
 * sub-skill focus still launches a fresh CARS passage).
 */
const repairItemFromCars = (c: CarsReasoningPatternView, estMinutes: number): RepairItemView => ({
  bucket: 'cars',
  focus: c.focus,
  freshFocus: c.focus,
  estMinutes,
  label: c.title,
  questionId: c.questionId,
  stem: c.passageStem,
  chosenChoiceId: null,
  chosenChoiceText: '',
  correctChoiceId: null,
  correctChoiceText: '',
  chosenMisconception: null,
  choiceRationale: null,
  calibration: null,
  missedItems: null,
  attemptedItems: null,
  assertable: false,
  leaningMisconception: null,
  holdRatePct: c.holdRatePct,
});

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
 * The serve-boundary decision for STARTING a practice test (WS5, §6): whether one
 * is due right now and the length tier it should be dealt at. The dev practice-
 * test API consults this before creating a session, so a test cannot be started
 * off-cadence — the §6 rules are enforced at the serving boundary, not only in
 * Today's Path.
 */
export interface PracticeTestServeGate {
  readonly due: boolean;
  readonly reason: string;
  readonly tier: PracticeTestLengthTier;
  /**
   * When NOT due, the earliest `YYYY-MM-DD` a test could next be served (or null
   * when it cannot be computed — blocked on review, blackout, or not unlocked).
   * Carried so a refused start can tell the learner WHEN, not just that it was
   * refused. Null when `due` (there is no "next" — it is now).
   */
  readonly nextEligibleDate: string | null;
}

/** Reverse of {@link PRACTICE_TEST_TIER_MINUTES}: a reserved duration → its tier. */
function tierFromReservedMinutes(minutes: number): PracticeTestLengthTier {
  for (const tier of ['short', 'standard', 'long'] as const) {
    if (PRACTICE_TEST_TIER_MINUTES[tier] === minutes) return tier;
  }
  return 'standard';
}

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
    // Allocated before any write, because `recordEvent` below moves
    // `nextSequence`. See `appendEvidence`.
    const acceptedSequence = state.nextSequence + 1;
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
      sequence: acceptedSequence,
    });
  }

  confirmPlan(
    state: LearnerState,
    goal: { testDate: string | null; targetScore: number | null; minutesPerWeek: number },
  ): void {
    // Preserve the Today's Path daily-time preset across a goal edit. It is set on
    // a separate seam (`setDailyBudget`), so replacing the whole goal object here —
    // which is what onboarding does — would silently reset a learner's chosen daily
    // budget every time they edit their exam date from the Account tab (WS8).
    const dailyMinutesPreset = state.goal?.dailyMinutesPreset;
    state.goal = {
      ...goal,
      ...(dailyMinutesPreset === undefined ? {} : { dailyMinutesPreset }),
    };
    state.onboarding.planConfirmed = true;
  }

  /**
   * Read-only goal projection for the Account/Profile editor to prefill (WS8).
   * Null fields when no plan is confirmed yet. The daily-time preset is
   * deliberately omitted — it is read through the Today's Path budget seam.
   */
  getGoal(state: LearnerState): GoalView {
    return {
      testDate: (state.goal?.testDate ?? null) as GoalView['testDate'],
      targetScore: state.goal?.targetScore ?? null,
      minutesPerWeek: state.goal?.minutesPerWeek ?? null,
    };
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

  /**
   * The per-day cap on repair items. The engine scales the actual slot from ~3 to
   * this by the daily budget; the snapshot's `mistakesRepairable` is this list
   * capped here, so the two never disagree on the ceiling.
   */
  private static readonly REPAIR_MAX_ITEMS = TODAYS_PATH_CONFIG.mistakesReserved.capMax;

  /**
   * The guided repair queue for the Review-Mistakes runner
   * (docs/mistakes-repair-plan.md).
   *
   * A prioritized, SERVABILITY-FILTERED, capped subset of the four Mistakes buckets
   * — the same four the tab renders — in the fixed order the runner feeds them:
   * `To fix → Patterns → CARS → Wins`. A repair is included only when its mandatory
   * "try a fresh one" is actually SERVABLE:
   *  - science (tofix / wins / kc-grain patterns): the miss's KC must be non-null
   *    AND taught — the practice queue is taught-gated per-KC, and a `kcId: null`
   *    miss can never be flipped by `Authority.resolved` — and it must carry a focus;
   *  - CARS reasoning-pattern repairs: always kept — the CARS queue bypasses the
   *    taught gate, and a retired pinned passage still launches the sub-skill focus.
   *
   * A READ composed of four reads, none of which moves mastery; the fresh attempt
   * the runner then serves is scored through the ordinary practice path, so
   * resolution stays COMPUTED (a later correct fresh attempt flips `resolved` on the
   * next read). Nothing is written here.
   */
  async getRepairQueue(state: LearnerState, limit: number): Promise<RepairQueueView> {
    const requested = Math.max(0, Math.min(Math.floor(limit), Authority.REPAIR_MAX_ITEMS));
    return { requested, items: await this.buildRepairItems(state, requested) };
  }

  /**
   * The ordered, servable, capped repair items — shared by `getRepairQueue` and the
   * snapshot's `mistakesRepairable` count so the slot the engine sizes and the queue
   * the runner reads are one derivation.
   */
  private async buildRepairItems(state: LearnerState, limit: number): Promise<RepairItemView[]> {
    const cap = Math.max(0, Math.min(Math.floor(limit), Authority.REPAIR_MAX_ITEMS));
    if (cap === 0) return [];
    const taught = taughtKcSet(state);
    const estMinutes = TODAYS_PATH_CONFIG.costs.mistakePerItem;

    // The four buckets. `openMistakes` filters the same `getErrorLog` read used for
    // patterns, so read the log ONCE and filter locally rather than reading twice.
    const [errorLog, patterns, cars, shakyWins] = await Promise.all([
      this.getErrorLog(state),
      this.getMistakePatterns(state),
      this.getCarsReasoningPatterns(state),
      this.getShakyWins(state),
    ]);
    const clearedThrough = state.mistakesReviewedThrough ?? null;
    const openLog = errorLog.filter(
      (e) => !e.resolved && (clearedThrough === null || e.occurredAt > clearedThrough),
    );

    // Servable iff a fresh one can be served: taught KC (the per-KC gate) + a focus.
    const servableScience = (kcId: string | null, focus: PracticeFocus | null): boolean =>
      kcId !== null && focus !== null && taught.has(kcId);

    const items: RepairItemView[] = [];

    // 1) To fix — open science misses, confidently-wrong first (hypercorrection),
    //    most-recent within each band. `kcId: null` (CARS) misses are dropped here;
    //    the CARS bucket owns reasoning repairs.
    const tofix = openLog
      .filter((e) => servableScience(e.kcId, e.focus))
      .sort(
        (a, b) =>
          (a.calibration === 'confidently_wrong' ? 0 : 1) -
            (b.calibration === 'confidently_wrong' ? 0 : 1) ||
          Date.parse(b.occurredAt) - Date.parse(a.occurredAt),
      );
    for (const e of tofix) items.push(repairItemFromEntry('tofix', e, estMinutes));

    // 2) Patterns — recurring misses at KC grain whose KC is taught (already
    //    worst-first from `getMistakePatterns`). A cluster-grain pattern is a
    //    `kcId: null` aggregate that can never resolve, so it is dropped.
    for (const p of patterns) {
      if (p.grain !== 'kc' || p.focus === null || !taught.has(p.key)) continue;
      items.push(repairItemFromPattern(p, estMinutes));
    }

    // 3) CARS — the OPEN reasoning-pattern repairs (already open-first, recent-first),
    //    always servable because the CARS queue bypasses the taught gate.
    for (const c of cars) {
      if (c.resolved) continue;
      items.push(repairItemFromCars(c, estMinutes));
    }

    // 4) Wins — shaky wins worth another rep, servable science only.
    for (const w of shakyWins) {
      if (!servableScience(w.kcId, w.focus)) continue;
      items.push(repairItemFromEntry('wins', w, estMinutes));
    }

    return items.slice(0, cap);
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

    // WS6: resolve each CARS Duel activity's {mode, topicId, intensity, side} from
    // the formative engine before persisting, so the autostart path never picks its
    // own topic/mode/intensity/stance. Carried duels keep the selection they were
    // built with (only newly-planned ones are resolved).
    this.enrichCarsDuelSelections(state, activities);

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
    // The TRIGGER is the pile-up (open misses since the last review); the SIZE is
    // what the runner can actually repair (servable + capped), so a pile-up of
    // untaught misses never injects a session that would dead-end on an empty queue.
    this.maybeInjectMistakesSession(
      plan,
      (await this.openMistakes(state)).length,
      (await this.buildRepairItems(state, Authority.REPAIR_MAX_ITEMS)).length,
    );
    const next = plan.activities.find((a) => a.status === 'ready' || a.status === 'in_progress');
    plan.currentActivityId = next?.activityId ?? null;
  }

  private static readonly MISTAKES_SESSION_THRESHOLD = 5;

  /** Inject a Mistakes session mid-day when enough misses pile up (bumps the last item to tomorrow). */
  private maybeInjectMistakesSession(
    plan: TodaysPathState,
    openMistakes: number,
    repairable: number,
  ): void {
    if (openMistakes < Authority.MISTAKES_SESSION_THRESHOLD) return;
    // Nothing servable to repair → injecting would open an empty runner. Skip.
    if (repairable <= 0) return;
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
    // Size to what the runner can serve (repairable is already capped), ~3 min each.
    const count = repairable;
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
        // Preserve a carried CARS Duel's resolved selection so it is not re-picked.
        ...(a.carsDuel === undefined ? {} : { carsDuel: a.carsDuel }),
      }));
  }

  /** Whole days from now until the exam (WS8's `goal.testDate`), or null for a rolling plan. */
  private daysUntilTest(state: LearnerState): number | null {
    const testDate = state.goal?.testDate;
    if (!testDate) return null;
    return Math.floor(daysBetween(this.clock.now(), testDate as unknown as UtcTimestamp));
  }

  /**
   * Resolve the CARS Duel selection for each cars_duel activity in the plan (WS6):
   * Rebut is the daily anchor; Defend can substitute for the second CARS once
   * unlocked, scaled by ability and tapered toward the exam. Difficulty/topic are
   * spread with novelty cooldown, and the argued side is randomized (the learner
   * never picks their stance). Only NEW activities are resolved — a carried duel
   * keeps the selection it was built with.
   */
  private enrichCarsDuelSelections(
    state: LearnerState,
    activities: TodaysPathActivityState[],
  ): void {
    const carsActivities = activities.filter((a) => a.kind === 'cars_duel');
    if (carsActivities.length === 0) return;
    const engineState = state.carsDuel ?? initialCarsDuelState();
    const daysUntilTest = this.daysUntilTest(state);
    const excludeTopicIds: string[] = [];
    carsActivities.forEach((activity, slotIndex) => {
      if (activity.carsDuel !== undefined) {
        excludeTopicIds.push(activity.carsDuel.topicId);
        return;
      }
      const selection = selectCarsDuel({
        topics: CARS_DUEL_TOPICS,
        state: engineState,
        slotIndex,
        daysUntilTest,
        rng: Math.random,
        excludeTopicIds,
      });
      const view: CarsDuelSelectionView = {
        topicId: selection.topic.id,
        proposition: selection.topic.proposition,
        theme: selection.topic.theme,
        argumentStructure: selection.topic.argumentStructure,
        difficulty: selection.topic.difficulty,
        mode: selection.mode,
        intensity: selection.intensity,
        side: selection.side,
      };
      activity.carsDuel = view;
      excludeTopicIds.push(selection.topic.id);
    });
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
    // P(L) map that feeds scoreLesson's learning-need term (avoid computing twice).
    const candidateLessonIds = input.candidateLessons.map((lesson) => lesson.lessonId);
    const masteryLessons = this.getMasteryLessons(state, candidateLessonIds);
    const masteredLessonIds = new Set(
      masteryLessons.filter((l) => l.mastered).map((l) => l.lessonId),
    );
    const pLByLesson = new Map(masteryLessons.map((l) => [l.lessonId, l.pL]));
    const completed = new Set(state.completedLessons ?? []);
    const now = this.clock.now();
    // "This material has been put in front of the learner" — delivery OR the
    // claim, which is the right union for teach-before-test and for prerequisite
    // release. It is NOT the mastery claim, and it is deliberately not the value
    // published as `mastered` below.
    const done = (id: string): boolean => completed.has(id) || masteredLessonIds.has(id);

    // Prereq pipeline: unlocked = all prereqs done; dependentsCount = how many
    // candidates list this lesson as a prerequisite. An actual graph's leaf must
    // remain zero, rather than silently regaining the old KC-count proxy.
    const hasPrerequisiteGraph = input.candidateLessons.some(
      (lesson) => lesson.prerequisiteLessonIds.length > 0,
    );
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
        if (!isAtCapabilityCut(pL)) practiceReviewNeed += 1;
      }
    }

    // WS5 (§6): schedule the periodic half-length practice test on cadence. The
    // schedule itself is decided ENTIRELY by policies (`decidePracticeTest`) from
    // the persisted cadence slice + the goal's exam date — this only reads that
    // state and hands the decision to the engine, which reserves the sitting when
    // `due`. Gated on `practiceUnlocked` (teach-before-test: a test measures
    // teaching, so there must be enough teaching to measure before one is offered;
    // the same gate Practice uses). Writes no mastery.
    const pt = state.practiceTests;
    // Stage signal for the LENGTH tier: blend current mastery (mean reasoning-op
    // P(L)) with lesson completion; days-to-exam is added inside the policy. Both
    // are learner reads the snapshot already has — no new mastery is written.
    const skillStates = Object.values(state.mastery?.skill ?? {});
    const masteryPct =
      skillStates.length > 0
        ? skillStates.reduce((sum, ms) => sum + currentPL(ms, now), 0) / skillStates.length
        : 0;
    const lessonCompletionPct =
      input.candidateLessons.length > 0 ? completed.size / input.candidateLessons.length : 0;
    const testDecision = decidePracticeTest({
      today: planDate,
      examDate: state.goal?.testDate ?? null,
      lastTestDate: pt?.lastTestDate ?? null,
      // Absent state has nothing to block on; the decision ignores this when no
      // prior test exists anyway.
      lastTestReviewed: pt?.lastTestReviewed ?? true,
      testsCompleted: pt?.testsCompleted ?? 0,
      masteryPct,
      lessonCompletionPct,
    });
    const practiceTest = practiceUnlocked
      ? {
          due: testDecision.due,
          phase: testDecision.phase,
          tier: testDecision.tier,
          // Sized to the decided length tier (short ≈ 40m, standard ≈ 90m, long ≈ 3h).
          estimatedMinutes: PRACTICE_TEST_TIER_MINUTES[testDecision.tier],
          reason: testDecision.reason,
        }
      : undefined;

    const candidateLessons: TodaysPathCandidateLesson[] = input.candidateLessons.map((l) => ({
      lessonId: l.lessonId,
      slug: l.slug,
      title: l.title,
      section: l.section,
      cluster: l.cluster,
      kcCount: l.kcCount,
      // Two facts, two fields. `|| completed.has(...)` used to sit on `mastered`,
      // which taught the planner that finishing an instructional lesson at
      // P(L) = 0.2 with zero evidence was the same as having mastered it — and
      // since the planner drops mastered lessons, the material became
      // unreachable. Completion is delivery (contract §9) and is published as
      // such; the planner decides separately what to do with each.
      mastered: masteredLessonIds.has(l.lessonId),
      delivered: completed.has(l.lessonId),
      covered: l.cluster !== null && ctx.clustersWithEvidence.has(l.cluster),
      unlocked: l.prerequisiteLessonIds.every((p) => done(p)),
      dependentsCount: hasPrerequisiteGraph ? (dependents.get(l.lessonId) ?? 0) : null,
      estimatedMinutes: l.estimatedMinutes,
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
      // Servable, prioritized, capped — what the runner can ACTUALLY repair today,
      // which is what the engine sizes the slot from (never the raw open count).
      mistakesRepairable: (await this.buildRepairItems(state, Authority.REPAIR_MAX_ITEMS)).length,
      practiceUnlocked,
      practiceReviewNeed,
      candidateLessons,
      carryOver,
      ...(practiceTest ? { practiceTest } : {}),
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
        ...(a.carsDuel === undefined ? {} : { carsDuel: a.carsDuel }),
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
  async submitAttempt(
    state: LearnerState,
    choiceId: string | null,
    /**
     * Diagnose-before-reveal timing captured by the Study UI (WS0). Optional so
     * non-UI callers (tests) still compile; absent means "not captured" and is
     * logged as NULL rather than a false `0`.
     */
    timing?: { elapsedMs: number; answerChanges: number },
  ): Promise<void> {
    // Allocated before any write. This path appends TWO events on a first answer
    // — the attempt and the BKT ledger record — so reading `nextSequence` at the
    // append would stamp the evidence one past the sequence this command is
    // accepted at, on a record that is `independent` and mastery-eligible. See
    // `appendEvidence`.
    const acceptedSequence = state.nextSequence + 1;
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
          elapsedMs: timing?.elapsedMs,
          answerChanges: timing?.answerChanges,
        }),
      );

      // The first answering attempt is INDEPENDENT (A0, no hint, not a retry, not
      // revealed), so it moves P(L) — up on correct, down on wrong. Retries and
      // reveals below are non-independent and never touch mastery (fail-closed).
      this.updateMasteryForAttempt(state, activity.questionId!, choiceId === correctId);
      await this.logStudyAttempt(state, activity, choiceId, choiceId === correctId, timing);

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
          sequence: acceptedSequence,
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
          sequence: acceptedSequence,
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
          elapsedMs: timing?.elapsedMs,
          answerChanges: timing?.answerChanges,
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
        sequence: acceptedSequence,
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
    timing?: { elapsedMs: number; answerChanges: number },
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
      // Diagnose-before-reveal timing (WS0). NULL when the UI did not measure it,
      // which WS1 must tell apart from a genuine `0`.
      elapsedMs: timing?.elapsedMs ?? null,
      answerChanges: timing?.answerChanges ?? null,
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

  // ---- Mastery engine (BKT/IRT, mastery-bkt) -------------------------------
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
   * HOW MUCH an observation is believed is decided here too, by handing the
   * engine `input.source`. That is the whole of lesson discounting: a lesson
   * exit is scored with a higher `guess`, so the Bayes update itself yields a
   * smaller move. Nothing on this path bounds, caps or scales the value the
   * engine returns — a cap would pin the grain and break decay (see
   * `LESSON_EXIT_GUESS_G`).
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
       * Which channel produced this observation. The engine reads it to pick
       * the `guess` term, so a lesson-exit response is believed less than a
       * practice answer; it is also the `source` the caller writes on the
       * ledger record, taken from this same constant so the two cannot
       * disagree about one attempt.
       */
      source: BktObservationSource;
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
      // How much this channel's evidence is worth is the engine's decision, not
      // this method's: the Authority hands over the source and the policy picks
      // the guess. Nothing here scales, caps or otherwise touches what comes
      // back — `result.states` is written to the grains verbatim.
      source: input.source,
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
      // Undiscounted: the study loop serves the synthetic bank cold, with no
      // instruction immediately before it. Same constant the ledger reads.
      source: STUDY_OBSERVATION_SOURCE,
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
        source: STUDY_OBSERVATION_SOURCE,
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
   *
   * IT IS BELIEVED LESS THAN A PRACTICE ANSWER, AND ONLY THAT. A lesson exit
   * asks about material the learner was shown moments ago, so a learner without
   * durable capability gets it right far more often than chance — which is a
   * statement about `guess`, so that is where it is applied
   * (`LESSON_EXIT_GUESS_G`). `P(L)` then moves by whatever smaller amount Bayes
   * yields. What comes back is written verbatim: this path holds no ceiling and
   * no maximum delta, because pinning the value would make the planner see
   * permanent unmet need and would leave decay able only to push the grain
   * down.
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
        // The same `lesson_response` the ledger identity below carries, and
        // what makes this observation a DISCOUNTED one inside the engine.
        source: LESSON_OBSERVATION_SOURCE,
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
      source: LESSON_OBSERVATION_SOURCE,
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

  /**
   * The 7 reasoning-skill readouts for the Skills page (percentages).
   *
   * PUBLISHES NO MASTERY CLAIM, and the field name is what enforces that. It
   * used to publish `mastered: pL >= MASTERY_THRESHOLD` — a second definition
   * of `mastered`, standing beside the composed one in the lesson rollup and
   * disagreeing with it, feeding the Progress rings, Home's glowing count and
   * Wrapped. `669fbcf` gated the rollup on evidence and left this behind, so
   * the product's most visible mastery claim was the one that skipped the gate.
   *
   * The warrant is not conjoined here because there is nothing to conjoin:
   * `skillWarrants` produces grains keyed by KC id, and no evidence record is
   * ever keyed to a reasoning operation, so the warrant set at this grain is
   * empty for every learner. See `SkillMasteryViewSchema` for the measurement.
   */
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
        atCapabilityCut: isAtCapabilityCut(pL),
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
   *
   * BOTH AUTHORITIES ARE SUPPLIED, because `mastered` is a claim that needs
   * both: the capability estimate from BKT and the warrant from the evidence
   * system. The warrant arrives from `skillWarrants` — the same computation the
   * warrant surface publishes — rather than a second sufficiency check written
   * here, so the rollup and the Evidence Atlas can never disagree about whether
   * one grain is adequately evidenced.
   */
  getLessonRollups(state: LearnerState, lessonIds?: readonly string[]): LessonRollupResult[] {
    const m = this.ensureMastery(state);
    const now = this.clock.now();
    // Once for the whole call: the warrant is computed over every grain, and
    // recomputing it per lesson would be the same answer at N times the cost.
    const kcEvidenceQuality = this.evidenceQualityByGrain(state);
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
      return rollUpLessonMastery({ lessonId, requiredKcIds, kcStates, kcEvidenceQuality, now });
    });
  }

  /**
   * The evidence-warrant tier per grain, keyed by grain id.
   *
   * A grain with no entry is one the evidence system has never seen, and the
   * rollup reads that as "no warrant" — which is the honest reading and fails
   * closed. Deliberately NOT a defaulted tier: writing `not_assessed` for an
   * absent grain would make "we have nothing on this" and "we assessed it and
   * found nothing" the same value.
   */
  private evidenceQualityByGrain(state: LearnerState): Record<string, EvidenceQualityTier> {
    const byGrain: Record<string, EvidenceQualityTier> = {};
    for (const { evidence } of this.skillWarrants(state)) {
      byGrain[evidence.skillId] = evidence.evidenceQuality;
    }
    return byGrain;
  }

  /**
   * The warrant REASON CODES per grain, keyed by grain id — the same list
   * `getMasteryMap` publishes, indexed for the lesson-grain join below.
   *
   * Kept separate from {@link evidenceQualityByGrain} rather than folded into
   * it, because the tier is package-private and the reason codes are the thing
   * that crosses the wire; one map carrying both would put an ordinal one
   * property access away from every caller that only wanted the codes.
   */
  private evidenceReasonsByGrain(state: LearnerState): Record<string, MasteryMapEntry['reasons']> {
    const byGrain: Record<string, MasteryMapEntry['reasons']> = {};
    for (const { evidence } of this.skillWarrants(state)) {
      byGrain[evidence.skillId] = [...evidence.reasons];
    }
    return byGrain;
  }

  /**
   * Per-lesson readout for the Evidence Atlas brain nodes on Progress, rolled up
   * from each lesson's required member KCs (see {@link getLessonRollups}). A
   * lesson whose membership does not resolve is omitted rather than reported as
   * `0` or as vacuously mastered; `getLessonRollups` carries the reason why.
   *
   * `mastered` here is the composed claim — every required KC over the cut AND
   * adequately warranted — not a `P(L)` comparison. `pL` continues to publish
   * the capability estimate on its own, so the planner still sees a strong
   * lesson as strong even while the claim is withheld for want of evidence.
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

  /**
   * Per-lesson evidence WARRANT for the Evidence Atlas: why a lesson's mastery
   * claim is being withheld, as reason codes.
   *
   * The companion to {@link getMasteryLessons}, joined by `lessonId`, and
   * deliberately not merged into it — `LessonWarrantViewSchema` records why, and
   * an architecture assertion enforces it. Without this, a learner who perfects
   * a lesson reads "In progress" forever with nothing on the page saying that
   * the capability half is done and the evidence half is what is open.
   *
   * THE REASONS BELONG TO ONE MEMBER KC, because a lesson has no warrant of its
   * own any more than it has a `P(L)`: the claim is `members.every(...)`, so the
   * honest explanation is the member that makes it false. Warrant-insufficient
   * members come first and only then merely-below-the-cut ones, because `pL`
   * already has a learner-facing surface and the warrant has none — reporting a
   * SATISFIED warrant on a lesson whose claim is withheld would be the same
   * unexplained state one grain down.
   *
   * A grain the evidence system has never seen reports `NO_USEFUL_EVIDENCE`
   * rather than an empty list, matching `getSessionSummary`; empty is reserved
   * for a mastered lesson, where nothing is being withheld at all.
   */
  getLessonWarrants(state: LearnerState, lessonIds?: readonly string[]): LessonWarrantView[] {
    const reasonsByGrain = this.evidenceReasonsByGrain(state);
    return this.getLessonRollups(state, lessonIds)
      .filter(isLessonRollupAvailable)
      .map(({ view }) => {
        const limiting =
          view.members.find((member) => !member.evidenceSufficient) ??
          view.members.find((member) => !member.mastered);
        return {
          lessonId: view.lessonId,
          reasons:
            limiting === undefined
              ? []
              : (reasonsByGrain[limiting.kcId] ?? [{ code: 'NO_USEFUL_EVIDENCE' as const }]),
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
   *
   * CORROBORATION RUNS HERE, not in front of this. The cap bounds how far a
   * prior may move and says nothing about WHICH units get moved, and the planner
   * ranks on exactly that. `corroborateMasterySeed` refuses any payload the one
   * real producer could not have emitted; it used to sit at the lambda route,
   * where the in-process dev authority — a second real caller — bypassed it
   * entirely. A check at one route is bypassable by every other caller, so it
   * belongs at the door all of them pass through.
   *
   * Refusal THROWS and moves nothing: the whole payload is refused rather than
   * filtered down to the entries that pass, because keeping the acceptable half
   * of a payload the server has already judged dishonest is how a restriction
   * loses to a permission.
   *
   * One consequence worth naming: the producer emits `kcPriors` only, so
   * corroboration refuses any `skillPriors` or `carsAbility` outright and the
   * two clamps below can no longer be reached with a non-empty record. They
   * stay because `MasterySeed` still declares those grains, and a clamp that is
   * only unreachable while a sibling check holds is worth keeping.
   */
  applyMasterySeed(state: LearnerState, seed: MasterySeed): void {
    const corroboration = corroborateMasterySeed(seed);
    if (corroboration.status === 'refused') {
      throw new MasterySeedNotCorroboratedError(corroboration.reason, corroboration.detail);
    }
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

  // ---- Adaptive Practice (test-out; the `practice-selection` policy) -------
  // Named by policy id alone: the version belongs to
  // `PRACTICE_SELECTION_MANIFEST` and nowhere else. This line used to spell the
  // pair, which was true and still owed — an in-step second copy is exactly what
  // the twelve stale `mastery-bkt` citations were before their bump, and
  // `tests/architecture/policy-version-single-source.test.ts` can only catch the
  // spelling once it drifts.
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
   * taught-set gate withholding every science unit, not to the bank running
   * dry, and `nothingTaught` narrows it once further: the gate withheld
   * everything because the learner has finished no lesson yet, which is a day
   * one learner rather than a curriculum mismatch and needs a different
   * sentence.
   *
   * SERVING IS NOT AN EXPOSURE. This method writes no exposure: an item handed
   * to a learner who never answers it stays eligible for the next queue, and
   * only `submitPracticeAttempt` calls `recordExposure`. That is deliberate,
   * because one record carries two facts — `recentlySeenIds` reads it for
   * rotation and `submitPracticeAttempt` derives `firstAttempt` from its count
   * — so counting a serve would make every practice answer a repeat and stop
   * P(L) moving at all. The cost accepted in exchange is that an abandoned item
   * can come back. Enforced, not merely stated:
   * `practice-exposure-timing.test.ts` fails on a serve-time exposure write
   * anywhere in this method, and measures both sides of the trade. A third
   * state — served-but-unanswered, distinct from both — is the option that
   * would avoid each harm, and is recorded as deferred work in
   * `key-docs/roadmap-todo.md`.
   *
   * SERVING IS AN AUTHORIZATION, and that is a different record. Each served
   * item gets a `PracticeAttemptGrant`: the server's own note that it handed
   * THIS learner THIS item under THIS spec and content release, expiring, and
   * spendable once as a capability claim. `submitPracticeAttempt` refuses an
   * answer with no matching grant, which is what puts everything decided in
   * this method — teach-before-test, the taught-set gate, selection itself —
   * in front of every scored practice answer rather than only in front of the
   * ones a client chose to route through the queue. The grant store is separate
   * from the exposure store precisely so this write cannot become the
   * serve-time exposure the paragraph above rules out.
   */
  async getPracticeQueue(
    state: LearnerState,
    x: number,
    focus?: PracticeFocus,
  ): Promise<PracticeQueueView> {
    const requested = Math.max(0, Math.min(Math.floor(x), 50));
    const focusToken = focus ?? null;
    if (requested === 0) {
      // No gate ran, so there is no gap to report — but "you have finished no
      // lessons" is a fact about the learner and true whatever was asked for,
      // read through the same single derivation the gate uses.
      return {
        requested: 0,
        focus: focusToken,
        items: [],
        shortfall: 0,
        taughtGap: false,
        nothingTaught: taughtKcSet(state).size === 0,
      };
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

    // Issue after the queue is settled, so a grant only ever exists for an item
    // that is actually being handed over. Issuing per candidate inside the loop
    // would authorize items the shortfall path discarded.
    const expiresAt = UtcTimestampSchema.parse(
      new Date(Date.parse(now) + PRACTICE_ATTEMPT_GRANT_TTL_MS).toISOString(),
    );
    for (const item of items) {
      await this.practiceBank.issueAttemptGrant(state.learnerId, {
        questionId: item.question.id,
        specId: item.specId,
        contentRelease: this.bank.contentRelease,
        expiresAt,
      });
    }

    return {
      requested,
      focus: focusToken,
      items,
      shortfall: Math.max(0, requested - items.length),
      taughtGap: snapshot.taughtGapDetected,
      nothingTaught: snapshot.nothingTaughtYet,
    };
  }

  /**
   * Score one practice answer, for an item the server issued to this learner.
   *
   * AUTHORIZATION FIRST, before the answer key is read. `cmd.specId` used to be
   * parsed and then never looked at by this method, which meant the whole of
   * `getPracticeQueue` — teach-before-test, the taught-set gate, selection —
   * could be skipped simply by not calling it: a forged spec plus any corpus
   * question id bought an independent evidence record and a BKT write. A field
   * the server merely reads is not a gate. What gates now is a
   * `PracticeAttemptGrant` the server itself issued at serve time and can
   * verify: it must exist for this learner and this question, and carry this
   * spec and the current content release, unexpired.
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
   * evidence record rather than silence. A repeat is still ADMITTED — the grant
   * is one-use for the capability claim, not one-use for the request — because
   * refusing it would delete a documented outcome rather than gate anything: a
   * second answer to an item already answered moves nothing either way. A
   * lesson is NOT a grain — practice records the lesson for the rollup's
   * routing only (see `applyPracticeMastery`). Answer material is returned only
   * here (post-submit), never in the queue.
   */
  async submitPracticeAttempt(
    state: LearnerState,
    cmd: PracticeAttempt,
  ): Promise<PracticeAttemptResult> {
    const now = this.clock.now();
    const authorization = await this.practiceBank.consumeAttemptGrant(state.learnerId, {
      questionId: cmd.questionId,
      specId: cmd.specId,
      contentRelease: this.bank.contentRelease,
      now,
    });
    if (authorization.status === 'refused') {
      throw new PracticeAttemptNotAuthorizedError(authorization.reason, cmd.questionId);
    }

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

    /**
     * The accepted-stream sequence this response's evidence will carry,
     * ALLOCATED here rather than read off the state as it stands.
     *
     * `state.nextSequence` is the sequence of the last accepted command, so
     * writing it into the record stamped this response with the sequence of the
     * one BEFORE it. Lesson evidence has always carried `nextSequence + 1`, the
     * sequence this command will be accepted at
     * (`services/lambdas/learner-api/src/workflow.ts`), so the two channels were
     * counting from different places by exactly one — and a practice answer
     * could therefore SHARE a sequence with the lesson record immediately
     * preceding it.
     *
     * That is not a cosmetic mismatch. `evaluateEvidence` detects a fresh
     * failure by strict sequence ordering, so a miss that tied with the
     * preceding lesson record was not "more recent than" it, `FRESH_FAILURE`
     * never fired, and a learner who had just demonstrably failed kept a clean
     * warrant. Measured as `[0, 1, 3, 3]`, the last of those an independent
     * incorrect practice answer, with `refreshNeeded` still false.
     *
     * Allocating it cannot collide across channels, because the accepted
     * sequence is strictly serialized per learner: the projection write requires
     * `current_sequence = sequence - 1`, so two commands can never be accepted
     * at the same number. Within this one command it is also the value
     * `recordBktObservationEvent` advances `nextSequence` to, so the record and
     * the stream agree rather than merely being close.
     */
    const acceptedSequence = state.nextSequence + 1;

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
     *
     * The exposure count remains the derivation — unwindowed, so a repeat a
     * year later is still a repeat. `authorization.firstUse` is the SECOND
     * server-held fact saying the same thing, and the two must agree for a
     * capability claim: a grant already spent cannot buy another one, whatever
     * the exposure store says. They can only disagree if one of the two writes
     * landed without the other, and in that direction the answer is to score
     * the response as a repeat rather than to credit an attempt the server can
     * only half account for.
     */
    const exposure = await this.practiceBank.recordExposure(state.learnerId, cmd.questionId, now);
    const firstAttempt = exposure.priorExposures === 0 && authorization.firstUse;

    // Emit the attempt event adaptive practice never used to (WS0). The Study
    // path has always appended one before its mastery write; practice appended
    // only the BKT ledger record, so a practice answer's response time and
    // answer-changes reached nothing. Recorded here — after the exposure write
    // that decides `firstAttempt`, before the mastery write below — so the event
    // sits ahead of the ledger record on the stream exactly as Study's does, and
    // the evidence keeps the `acceptedSequence` allocated at entry. It carries
    // the real timing from the command; the payload's non-nullable fields fall
    // back to `0` for a caller that sent none. No mastery, no evidence: an event
    // on the append-only stream, nothing more.
    this.recordEvent(
      state,
      this.attemptEvent(state, cmd.questionId, cmd.chosenChoiceId, {
        assistanceLevel: 'A0',
        isDiagnosticRetry: false,
        elapsedMs: cmd.elapsedMs,
        answerChanges: cmd.answerChanges,
      }),
    );

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
        sequence: acceptedSequence,
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
        // Diagnose-before-reveal timing (WS0). NULL when the command carried
        // none, which WS1 must tell apart from a genuine `0`.
        elapsedMs: cmd.elapsedMs ?? null,
        answerChanges: cmd.answerChanges ?? null,
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
     * FAILS CLOSED, WITH NO SPECIAL CASE FOR AN EMPTY TAUGHT SET. The filter
     * used to run only when the set was non-empty, on the reading that the true
     * ABSENCE of a taught set — no lesson completions recorded at all — is a
     * different fact from a taught claim that missed, and so has no claim to
     * violate. The distinction is real; the conclusion drawn from it was wrong,
     * because absence is not an edge case. It is every learner's FIRST state:
     * `state.taughtKcIds` is empty until `todaysPathSnapshot` writes it from
     * completed lessons, so a brand-new learner who opened Practice before
     * opening a lesson fell through to the unfiltered corpus and was served
     * real scored items on material nothing had taught them — with
     * `taughtGapDetected` false, so no caller could even report it. That is
     * exactly the state failing closed on a miss exists to prevent, arriving
     * through the one door left open, and on the most common path there is.
     *
     * An empty result is a signal a caller can act on; wrong material reaching
     * a learner is a harm no caller can undo. So the set is read once and
     * applied unconditionally, and the two facts a caller needs are reported
     * separately: `taughtGapDetected` says the gate withheld everything the
     * bank offered, `nothingTaughtYet` says the learner has finished nothing
     * yet. `getPracticeQueue` publishes both, so an empty science queue never
     * has to speak for itself.
     */
    const taught = taughtKcSet(state);
    const scopedUnits = scienceUnits.filter((u) => taught.has(u.kcId));
    const taughtGapDetected = scienceUnits.length > 0 && scopedUnits.length === 0;

    return {
      units: scopedUnits,
      cars: carsUnits,
      repairs: repairs.map((r) => (r.skill ? { kcId: r.kcId, skill: r.skill } : { kcId: r.kcId })),
      coveredClusters: covered,
      taughtGapDetected,
      nothingTaughtYet: taught.size === 0,
    };
  }

  private filterByFocus(
    units: readonly PracticeCandidateUnit[],
    focus: PracticeFocus | null,
  ): readonly PracticeCandidateUnit[] {
    if (focus === null) return units;
    const upper = focus.toUpperCase();
    if (upper === 'CARS') return units.filter((u) => u.domain === 'cars');
    // WS7: a CARS sub-skill focus (`cars-foc` / `cars-rwt` / `cars-rbt`) narrows to
    // that one sub-skill's CARS units, so a Mistakes "practice this passage" repair
    // drills the flagged reasoning skill rather than all of CARS.
    const carsSkillFocus = /^CARS-(FOC|RWT|RBT)$/.exec(upper);
    if (carsSkillFocus !== null) {
      const skill = carsSkillFocus[1] as CarsSkill;
      return units.filter((u) => u.domain === 'cars' && u.carsSkill === skill);
    }
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
    administration: { firstAttempt: boolean; now: UtcTimestamp; sequence: number },
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

    const record = this.practiceEvidence({
      questionId,
      skillId: classification.kcId,
      cluster,
      familyId: classification.familyId,
      outcome,
      firstAttempt: administration.firstAttempt,
      occurredAt: administration.now,
      sequence: administration.sequence,
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
      // The undiscounted channel: a practice item is met cold, with nothing
      // just shown to reproduce, so it is scored at the plain guess rate. Same
      // constant the ledger record below carries.
      source: PRACTICE_OBSERVATION_SOURCE,
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
        source: PRACTICE_OBSERVATION_SOURCE,
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
  private practiceEvidence(input: {
    questionId: string;
    skillId: string;
    cluster: SkillCluster;
    familyId: string | null;
    outcome: EvidenceOutcome;
    firstAttempt: boolean;
    occurredAt: UtcTimestamp;
    /** The accepted-stream sequence, allocated by `submitPracticeAttempt`. */
    sequence: number;
  }): EvidenceRecord {
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
      // The sequence this command WILL be accepted at, not the one before it.
      // The lesson channel's records are numbered the same way, and
      // `evaluateEvidence` compares the two strictly, so an off-by-one here is
      // the difference between a fresh failure that fires and one that ties with
      // the record it should outrank. See `submitPracticeAttempt`.
      sequence: input.sequence,
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
    // Allocated before any write. See `appendEvidence`.
    const acceptedSequence = state.nextSequence + 1;
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
      sequence: acceptedSequence,
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
   *
   * This path appends no event of its own, so it used to stamp its records with
   * the sequence of the command BEFORE it. Harmless as it stood — a `placement`
   * record is contextual-only, so it can never be the mastery-eligible record
   * `latestEligibleSeq` reads, and `independent: false` means it can never be a
   * fresh failure either — but it was the same off-by-one `b845489` fixed on the
   * practice channel, kept alive by two properties of these two records rather
   * than by anything structural. The kind is now the reason the record is
   * contextual, not the reason its number is safe.
   *
   * ASYNC since WS7: a duel below the competence bar also pins a specific real
   * CARS bank item as a spaced Mistakes repair, which needs the item corpus (the
   * async `practiceBank`). All the synchronous, mastery-free work above still runs
   * first and unchanged; the bank read is awaited only at the end. The repair path
   * writes NO mastery either — it stores a formative pointer, nothing more.
   */
  async recordCarsDuel(state: LearnerState, outcome?: CarsDuelOutcomeInput): Promise<void> {
    const rubric = outcome?.rubric;
    const holdRate = rubric ? rubricToR(rubric) : null;
    const acceptedSequence = state.nextSequence + 1;
    for (const cluster of ['CA1', 'CA2'] as const) {
      this.appendEvidence(state, {
        skillId: `cars-${cluster.toLowerCase()}`,
        kind: 'placement',
        questionId: 'cars-duel',
        phase: 'independent',
        correct: true,
        independent: false,
        changeDimensions: [],
        sequence: acceptedSequence,
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
    // Fold the duel into the FORMATIVE CARS Duel engine state (WS6): the rolling
    // history + intensity rating + Defend unlock latch that shape which duel is
    // served next. This mints NO mastery — the only capability signal a duel emits
    // is the low-weight ability nudge above (CARS_K_DUEL). Recorded only when the
    // autostart path reports which topic/mode/intensity was served; a bare
    // rubric-only call still nudges the ability but adds no selection history.
    const topic =
      outcome?.topicId !== undefined ? CARS_DUEL_TOPICS_BY_ID.get(outcome.topicId) : undefined;
    if (topic && outcome?.mode !== undefined && outcome.intensity !== undefined) {
      state.carsDuel = recordCarsDuelOutcome(state.carsDuel ?? initialCarsDuelState(), {
        topic,
        mode: outcome.mode,
        intensity: outcome.intensity,
        holdRate,
        at: this.clock.now(),
      });
    }
    // WS7: a duel below the competence bar becomes a concrete, spaced repair —
    // the weakest rubric dimension names a CARS sub-skill, and a specific real
    // CARS bank item targeting it is pinned into Mistakes. FORMATIVE: this writes
    // no mastery (it appends only to `state.carsRepairs`), and it runs on the
    // rubric alone, so a manual (topic-less) duel can still earn a repair.
    if (rubric && isWeakCarsDuel(rubric)) {
      const skill = weakestCarsSkill(rubric);
      if (skill !== null) {
        await this.enqueueCarsReasoningRepair(state, skill, holdRate ?? 0);
      }
    }
  }

  /**
   * Pin a specific real CARS bank item as a spaced reasoning-pattern repair for
   * one sub-skill (WS7). Keeps at most ONE repair per sub-skill: a fresh weak duel
   * refreshes the pinned item and the trigger time in place rather than stacking
   * duplicates, so the surface never shows the same weakness twice.
   *
   * A READ of the item corpus and a WRITE of a formative pointer — never mastery.
   * If the bank has no CARS item for the sub-skill (or none the learner has not
   * just seen), nothing is pinned: a repair with no passage to practise would be a
   * dead end, so the absence is left as-is rather than invented.
   */
  private async enqueueCarsReasoningRepair(
    state: LearnerState,
    skill: CarsSkill,
    holdRate: number,
  ): Promise<void> {
    const recentlySeen = await this.practiceBank.recentlySeenIds(state.learnerId, {
      withinDays: 30,
      limit: 200,
    });
    const candidates = await this.practiceBank.findItems(
      { domain: 'cars', carsSkill: skill, targetB: 0 },
      { excludeIds: recentlySeen, limit: 8 },
    );
    // Prefer an item the port confirms is in this sub-skill; fall back to the first
    // CARS candidate (the synthetic port reports carsSkill:null but still serves
    // CARS items). No candidate at all → no repair to pin.
    const chosen = candidates.find((c) => c.carsSkill === skill) ?? candidates[0];
    if (chosen === undefined) return;
    const repair: CarsReasoningRepair = {
      skill,
      questionId: chosen.question.id,
      holdRate,
      createdAt: this.clock.now(),
    };
    const others = (state.carsRepairs ?? []).filter((r) => r.skill !== skill);
    state.carsRepairs = [...others, repair];
  }

  /**
   * Passage of the Day: a measured CARS answer updates the sub-skill ability at
   * full weight (K=0.3). PotD wires this in once real CARS passages are served
   * (see docs/mastery-pipeline.md §5.4).
   */
  recordCarsPassage(state: LearnerState, skill: CarsSkill, correct: boolean): void {
    this.updateCarsAbility(state, skill, correct ? 1 : 0, CARS_K_POTD);
  }

  /** Initialize the WS5 cadence slice on first touch (older projections lack it). */
  private ensurePracticeTests(state: LearnerState): NonNullable<LearnerState['practiceTests']> {
    if (state.practiceTests === undefined) {
      state.practiceTests = { lastTestDate: null, lastTestReviewed: true, testsCompleted: 0 };
    }
    return state.practiceTests;
  }

  /**
   * Record that a sitting has STARTED (WS5, §6, Task 4). Stamps the open sitting
   * so an incomplete one is durably tracked rather than left to linger only in
   * the in-memory session store. A fresh start while one is already open
   * SUPERSEDES it — the prior sitting was abandoned (never completed, so it never
   * touched `lastTestDate`/`testsCompleted` and cadence math is unaffected) — so
   * at most one sitting is ever open, the JSON-blob equivalent of 0016's
   * one-open unique index. Writes NO mastery.
   */
  recordPracticeTestStarted(state: LearnerState, started: OpenPracticeTestSitting): void {
    const tests = this.ensurePracticeTests(state);
    tests.openSitting = {
      sittingId: started.sittingId,
      startedAt: started.startedAt,
      tier: started.tier,
    };
  }

  /**
   * Record that a periodic half-length practice test was COMPLETED (WS5, §6).
   *
   * This is the first half of the completion→state loop the Today's-Path
   * scheduler closes: it stamps the last-test day (learner-local, the same 4 AM
   * rollover the plan uses), increments the completed count, and — critically —
   * marks the review as NOT yet done, which is what lets `decidePracticeTest`
   * block the NEXT test until this one has been reviewed. Recording is the whole
   * effect; a test re-measures capability through WS5's own decay-weighted scorer,
   * so this writes NO mastery (mirrors the formative `recordCarsDuel` seam).
   */
  recordPracticeTestCompleted(state: LearnerState): void {
    const tests = this.ensurePracticeTests(state);
    tests.lastTestDate = this.planDateFor(this.clock.now(), this.timezoneOffset(state));
    tests.lastTestReviewed = false;
    tests.testsCompleted += 1;
  }

  /**
   * Record a completed test's SCORED RESULT (WS5, §6): the same cadence-state
   * bump as {@link recordPracticeTestCompleted}, plus the persisted sitting the
   * dashboard summary reads (trends / readiness / estimated range / past tests),
   * plus enqueuing every science miss into the repair/Mistakes queue.
   *
   * GUARDRAIL: this writes NO mastery. A test re-measures capability through
   * WS5's own decay-weighted scorer, and the misses become spaced-repair targets
   * exactly like a practice miss (`queueRepair`, deduplicated by KC) — neither
   * mints BKT mastery beyond the single-door write path.
   */
  async recordPracticeTestResult(
    state: LearnerState,
    completion: PracticeTestCompletion,
  ): Promise<void> {
    this.recordPracticeTestCompleted(state);
    const tests = this.ensurePracticeTests(state);
    const sitting: PracticeTestSittingRecord = {
      sittingId: completion.sittingId,
      takenOn: completion.takenOn,
      tier: completion.tier,
      itemsScored: completion.itemsScored,
      correct: completion.correct,
      sections: completion.sections.map((s) => ({ section: s.section, pctCorrect: s.pctCorrect })),
      scaledScore: completion.scaledScore,
      reviewed: false,
    };
    tests.sittings = [...(tests.sittings ?? []), sitting];

    // DURABLE FRESHNESS (Task 1): merge this sitting's scored items into the
    // never-reuse set and append its per-unit observations to the re-measure
    // history — both on the persisted state now, not the in-memory server bank,
    // so a restart cannot re-deal a scored item or forget the decay-weighted
    // history. Deduped; order-preserving so the history stays chronological.
    if (completion.scoredItemIds && completion.scoredItemIds.length > 0) {
      const scored = new Set(tests.scoredItemIds ?? []);
      for (const id of completion.scoredItemIds) scored.add(id);
      tests.scoredItemIds = [...scored];
    }
    if (completion.unitObservations && completion.unitObservations.length > 0) {
      tests.unitHistory = [...(tests.unitHistory ?? []), ...completion.unitObservations];
    }
    // The sitting completed → it is no longer open (Task 4).
    tests.openSitting = null;

    // Misses → the SAME attempt log adaptive practice writes (Task 2), so a
    // finished test's misses surface in `/app/mistakes` "To fix" (getErrorLog
    // reads this log) and its items feed the pattern denominators. The authority
    // stamps the log-only fields (first attempt, activity, when) so the caller
    // ships only what it scored from the key. Idempotent per item × activity.
    for (const attempt of completion.attempts ?? []) {
      await this.practiceBank.recordPracticeAttempt(state.learnerId, {
        questionId: attempt.questionId,
        kcId: attempt.kcId,
        skill: attempt.skill,
        cluster: attempt.cluster,
        familyId: attempt.familyId,
        chosenChoiceId: attempt.chosenChoiceId,
        correct: attempt.correct,
        firstAttempt: true,
        activityType: 'practice',
        occurredAt: completion.takenOn,
        elapsedMs: attempt.elapsedMs,
      });
    }

    // Misses → repair queue, deduplicated by KC (a test that missed the same KC
    // twice queues it once). CARS misses carry no KC and are not per-KC repairs,
    // so the scorer already excludes them from `reviewTargets`.
    const seen = new Set<string>();
    for (const target of completion.reviewTargets) {
      if (seen.has(target.kcId)) continue;
      seen.add(target.kcId);
      await this.practiceBank.queueRepair(
        state.learnerId,
        target.skill ? { kcId: target.kcId, skill: target.skill } : { kcId: target.kcId },
        completion.takenOn,
      );
    }
  }

  /**
   * Record that the last completed test's REVIEW is done (WS5, §6) — the second
   * half of the loop. It releases the block-until-reviewed gate so the cadence
   * can schedule the next test, and marks the most recent stored sitting reviewed
   * so the dashboard's per-test "Reviewed" badge is honest. A review with no
   * prior completion is a no-op it tolerates rather than a state it invents.
   * Writes NO mastery.
   */
  recordPracticeTestReviewed(state: LearnerState): void {
    const tests = this.ensurePracticeTests(state);
    tests.lastTestReviewed = true;
    const sittings = tests.sittings;
    if (sittings && sittings.length > 0) sittings[sittings.length - 1]!.reviewed = true;
  }

  /**
   * The Practice-test dashboard summary, built from the learner's REAL completed
   * sittings (WS5, §6) — null until at least one test is scored, exactly the
   * "no summary yet" answer the graceful client path already tolerates. The
   * per-section trend points ARE each sitting's `sections`; readiness and the
   * estimated RANGE are re-derived from the most recent sitting's %-correct via
   * the conservative estimate policy (never a single fabricated score).
   */
  /**
   * The serve-boundary gate for STARTING a practice test (WS5, §6). Due-ness is
   * the pure §6 cadence (which needs no candidate-lesson list, so it is exact
   * server-side) gated on practice being unlocked; the length tier prefers the
   * one the current day's plan already reserved (built with the real candidate
   * list) and falls back to a state-only stage read. Writes nothing.
   */
  practiceTestServeGate(state: LearnerState): PracticeTestServeGate {
    const now = this.clock.now();
    const planDate = this.planDateFor(now, this.timezoneOffset(state));
    const practiceUnlocked =
      (state.completedLessons?.length ?? 0) >= TODAYS_PATH_CONFIG.practiceUnlockLessons;
    const skillStates = Object.values(state.mastery?.skill ?? {});
    const masteryPct =
      skillStates.length > 0
        ? skillStates.reduce((sum, ms) => sum + currentPL(ms, now), 0) / skillStates.length
        : 0;
    const decision = decidePracticeTest({
      today: planDate,
      examDate: state.goal?.testDate ?? null,
      lastTestDate: state.practiceTests?.lastTestDate ?? null,
      lastTestReviewed: state.practiceTests?.lastTestReviewed ?? true,
      testsCompleted: state.practiceTests?.testsCompleted ?? 0,
      masteryPct,
      // The candidate list is a client input to `buildTodaysPath`, absent at the
      // serve boundary, so the plan's already-decided tier is preferred below.
      lessonCompletionPct: 0,
    });
    const plannedTest =
      state.plan?.planDate === planDate
        ? state.plan.activities.find((a) => a.kind === 'practice_test')
        : undefined;
    const tier = plannedTest
      ? tierFromReservedMinutes(plannedTest.estimatedMinutes)
      : decision.tier;
    const due = practiceUnlocked && decision.due;
    return {
      due,
      reason: practiceUnlocked ? decision.reason : 'not_unlocked',
      tier,
      // Carry the cadence's next-eligible day on a refusal so the client can say
      // WHEN, not just that it refused; null when due or not computable.
      nextEligibleDate: due ? null : decision.nextEligibleDate,
    };
  }

  /**
   * The DURABLE freshness the server engine needs to assemble the next sitting
   * and re-measure across history (WS5, §6, Task 1): the never-reuse item set and
   * the dated per-unit observation history, both read straight off the persisted
   * `practiceTests` slice. This is what makes freshness + the decay-weighted
   * re-measure survive a restart — the server bank no longer holds them. Reads
   * only; returns fresh copies so a caller cannot mutate the stored arrays.
   */
  practiceTestFreshness(state: LearnerState): {
    scoredItemIds: string[];
    unitHistory: DatedUnitObservation[];
  } {
    return {
      scoredItemIds: [...(state.practiceTests?.scoredItemIds ?? [])],
      unitHistory: [...(state.practiceTests?.unitHistory ?? [])],
    };
  }

  getPracticeTestSummary(state: LearnerState): PracticeTestSummaryView | null {
    const sittings = state.practiceTests?.sittings ?? [];
    if (sittings.length === 0) return null;
    const pastTests: PastPracticeTest[] = sittings.map((s, index) => ({
      testId: s.sittingId,
      label: index === 0 ? 'Baseline' : `Checkpoint ${index + 1}`,
      takenOn: s.takenOn,
      // The contract's phase names the test's LENGTH: the first sitting is the
      // baseline, a long-tier sitting is a full-length, everything else half.
      phase: index === 0 ? 'baseline' : s.tier === 'long' ? 'full_length' : 'half_length',
      sections: s.sections.map((sec) => ({ section: sec.section, pctCorrect: sec.pctCorrect })),
      scaledScore: s.scaledScore,
      reviewed: s.reviewed,
    }));
    const latest = sittings[sittings.length - 1]!;
    const latestPct = latest.itemsScored > 0 ? (latest.correct / latest.itemsScored) * 100 : 0;
    const est = estimatePracticeTestScaled(latestPct, latest.itemsScored);
    return {
      readinessLabel: practiceReadinessLabel(latestPct),
      estimatedScore: { low: est.low, high: est.high },
      pastTests,
    };
  }

  /**
   * `skillsGlowing` is a CAPABILITY reading and comes from BKT, via the very same
   * `getMasterySkills` call Home reads, so the two screens cannot disagree. It
   * used to threshold the ordinal evidence tier at `>= independent`, which let a
   * learner see "3 skills glowing" on Wrapped and "0" on Home in one session.
   *
   * "Glowing" is deliberately not "mastered": it counts operations whose `P(L)`
   * is at the capability cut, and it makes no claim about warrant. The field it
   * reads is named for what it is, so a future reader cannot mistake this for
   * the mastery claim the way `mastered` invited.
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
      skillsGlowing: this.getMasterySkills(state).filter((s) => s.atCapabilityCut).length,
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
   * Parse one authored error-model value into whether it is the key's model and
   * its human text. The corpus writes `"<tag>: <text>"` — `misconception` for a
   * distractor, `correct_model` for the key (a few legacy rows use the space
   * spelling `"correct model"`, tolerated). Returns the text without the tag.
   */
  private static parseErrorModel(raw: string): { readonly correctModel: boolean; readonly text: string } {
    const match = /^\s*(correct[_ ]model|misconception)\s*:?\s*([\s\S]*)$/i.exec(raw);
    if (match === null) return { correctModel: false, text: raw.trim() };
    const correctModel = /^correct[_ ]model$/i.test(match[1]!);
    const text = (match[2] ?? '').trim();
    return { correctModel, text: text.length > 0 ? text : raw.trim() };
  }

  /**
   * The misconception behind the PICKED choice, for a post-answer surface (WS3).
   * Null when there is no error model, nothing was picked, the value is empty, or
   * the pick was the keyed choice — a `correct_model` tag is not a misconception.
   * Only ever the picked option; the full `error_models` map stays server-only.
   */
  private static pickedMisconception(
    errorModels: Record<string, string> | null | undefined,
    choiceId: string | null,
  ): string | null {
    if (!errorModels || choiceId === null) return null;
    const raw = errorModels[choiceId];
    if (typeof raw !== 'string' || raw.trim() === '') return null;
    const parsed = Authority.parseErrorModel(raw);
    return parsed.correctModel ? null : parsed.text;
  }

  /**
   * The calibration band for one logged attempt (WS1). A READ: it reads the KC's
   * current P(L), the attempt's WS0 timing, and the item's POPULATION median RT,
   * and moves NO mastery. Speed is banded against the item median once it clears
   * the classifier's sample floor (`itemMedianTime`, fetched in batch by the
   * caller), falling back to the fixed cutoffs when no trusted median exists.
   *
   * `kcMastery` is null for a KC-less item (CARS) AND for a KC the learner has no
   * recorded state in. The cold-start prior is NOT evidence of weakness — reading
   * a never-observed KC as `PRIOR_PL0` (0.2) is what made almost every early
   * science win band `shaky_win` and diluted the worst-first signal — so a fresh
   * KC reads as "no signal" (null) here and the weak-KC arm needs at least one
   * real observation to fire. A KC with state reads its decayed P(L).
   */
  private calibrationFor(
    state: LearnerState,
    attempt: PracticeAttemptLogEntry,
    itemMedianTime: ItemResponseTime | null,
  ): CalibrationBand {
    const now = this.clock.now();
    const kcState = attempt.kcId === null ? undefined : state.mastery?.kc[attempt.kcId];
    const kcMastery = kcState ? currentPL(kcState, now) : null;
    return classifyCalibration(
      attempt.correct,
      attempt.elapsedMs ?? null,
      attempt.answerChanges ?? null,
      kcMastery,
      itemMedianTime,
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
    // One batched read of the population median RT per missed item, so speed is
    // banded against the item (spec §11.2) rather than a one-size cutoff.
    const itemMedians = await this.practiceBank.itemResponseTimes(
      misses.map((m) => m.questionId),
    );
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
          // The log this row was read from (practice vs study), so a consumer can
          // tell apart the same item missed on both surfaces (unique per activity).
          source: miss.activityType,
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
          // WS1 band (a miss is confidently_wrong or normal) + WS2/WS3 join: the
          // picked distractor's authored misconception, post-answer, one string.
          calibration: this.calibrationFor(state, miss, itemMedians.get(miss.questionId) ?? null),
          chosenMisconception: Authority.pickedMisconception(answer.errorModels, miss.chosenChoiceId),
          resolved: Authority.resolved(attempts, miss),
          focus: focusFor(miss.cluster, miss.skill),
        };
        return entry;
      }),
    );
    return hydrated.filter((e): e is ErrorEntryView => e !== null);
  }

  /**
   * Correct-but-shaky first attempts (WS3). The WS1 classifier bands a win
   * `shaky_win` when it came slowly or landed in a KC still below the review line
   * — a win worth another rep. Deliberately SEPARATE from `getErrorLog`: a shaky
   * win is a CORRECT answer, and folding it in would make every misses-only
   * reader (`openMistakes`, the Today's Path repair count, `getWrapped`) treat a
   * win as a miss. Reuses `ErrorEntryView` (calibration always `shaky_win`); the
   * picked choice is the key, so there is no refutation and no misconception.
   *
   * A READ — computes bands and hydrates content, moves no mastery.
   */
  async getShakyWins(state: LearnerState): Promise<ErrorEntryView[]> {
    const attempts = await this.practiceBank.listPracticeAttempts(state.learnerId, {
      limit: Authority.ATTEMPT_LOG_LIMIT,
    });
    const firstWins = attempts.filter((a) => a.correct && a.firstAttempt);
    // Batch the population median RT for the candidate wins before banding, so a
    // slow win is judged against the item median, not a fixed cutoff.
    const itemMedians = await this.practiceBank.itemResponseTimes(
      firstWins.map((w) => w.questionId),
    );
    const wins = firstWins.filter(
      (a) => this.calibrationFor(state, a, itemMedians.get(a.questionId) ?? null) === 'shaky_win',
    );
    const hydrated = await Promise.all(
      wins.map(async (win) => {
        const content = await this.hydrateAttempt(win);
        // A win whose item left the corpus can no longer be re-attempted; drop it.
        if (content === null) return null;
        const { question, answer } = content;
        const textOf = (id: string | null): string =>
          id === null ? '' : (question.choices.find((c) => c.id === id)?.text ?? '');
        const entry: ErrorEntryView = {
          questionId: win.questionId,
          source: win.activityType,
          kcId: win.kcId,
          skillId: win.skill,
          cluster: win.cluster,
          familyId: win.familyId,
          occurredAt: win.occurredAt,
          stem: question.stem,
          // On a win the learner picked the key, so chosen === correct.
          chosenChoiceId: win.chosenChoiceId,
          chosenChoiceText: textOf(win.chosenChoiceId),
          correctChoiceId: answer.correctChoiceId,
          correctChoiceText: textOf(answer.correctChoiceId),
          // Nothing to refute on a correct pick, and no misconception behind it.
          choiceRationale: null,
          calibration: 'shaky_win',
          chosenMisconception: null,
          // A win is not an open miss; resolution is a misses-only concept.
          resolved: false,
          focus: focusFor(win.cluster, win.skill),
        };
        return entry;
      }),
    );
    return hydrated.filter((e): e is ErrorEntryView => e !== null);
  }

  /**
   * The picked distractor's authored misconception for one missed attempt (WS3),
   * for the pattern "leaning" tally. Study misses have none (the engine
   * projection carries no error models); practice misses read the port's answer.
   */
  private async missedMisconception(entry: PracticeAttemptLogEntry): Promise<string | null> {
    if (entry.correct || entry.activityType === 'study') return null;
    const answer = await this.practiceBank.getAnswer(entry.questionId);
    return Authority.pickedMisconception(answer?.errorModels ?? null, entry.chosenChoiceId);
  }

  /**
   * Surface A — recurring misses, grouped at KC grain (falling back to cluster
   * for items with no KC, e.g. CARS). Practice and study attempts group together:
   * the grain is a property of the content, not of the surface it was served on.
   *
   * The GRAIN is still KC / cluster — NOT a misconception grain. The pattern now
   * also NAMES the misconception most leaned toward across the group's distinct
   * missed items (`error_models`, ~100% filled per Phase-0, joined server-side
   * on the picked distractor), but only once the pattern is assertable, so a
   * small-sample artefact never gets a confident label. Every row still counts
   * DISTINCT items, carries its denominator, and hedges below the floor.
   */
  async getMistakePatterns(state: LearnerState): Promise<MistakePatternView[]> {
    const attempts = await this.practiceBank.listPracticeAttempts(state.learnerId, {
      limit: Authority.ATTEMPT_LOG_LIMIT,
    });
    // Pre-pass: the picked misconception for each DISTINCT missed item, so the
    // per-group "leaning" is a tally over items and hydration happens once each.
    const missedFirst = attempts.filter((a) => a.firstAttempt && !a.correct);
    const misconceptionByItem = new Map<string, string | null>();
    await Promise.all(
      missedFirst.map(async (miss) => {
        if (misconceptionByItem.has(miss.questionId)) return;
        misconceptionByItem.set(miss.questionId, await this.missedMisconception(miss));
      }),
    );
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
      const assertable =
        group.attempted.size >= Authority.PATTERN_ASSERT_ITEMS &&
        group.missed.size >= Authority.PATTERN_ASSERT_MISSES;
      patterns.push({
        grain: group.grain,
        key: group.key,
        label: group.label,
        missedItems: group.missed.size,
        attemptedItems: group.attempted.size,
        lastMissedAt: group.lastMissedAt,
        assertable,
        // Named only once the pattern is real; the mode of the picked
        // misconceptions across the group's distinct missed items, else null.
        leaningMisconception: assertable ? leaningMisconceptionOf(group.missed, misconceptionByItem) : null,
        focus: focusFor(group.cluster, group.skill),
      });
    }
    return patterns.sort(
      (a, b) =>
        b.missedItems - a.missedItems || Date.parse(b.lastMissedAt) - Date.parse(a.lastMissedAt),
    );
  }

  /**
   * Surface C (WS7) — CARS reasoning-pattern repairs from weak duels. A distinct
   * surface from the KC/cluster patterns above: each entry is one CARS sub-skill a
   * weak duel flagged, plus the specific real CARS passage pinned to repair it.
   *
   * A READ. Resolution is COMPUTED here, never stored, mirroring
   * `Authority.resolved`: a repair is resolved once the learner records a LATER
   * correct CARS answer in the SAME sub-skill (whether the pinned passage itself
   * or any sibling in the sub-skill — "completes the offered repair"). The
   * classification of each correct CARS answer is read back through the same port
   * that served it, so this stays free of any stored outcome that could go stale.
   * Moves NO mastery.
   */
  async getCarsReasoningPatterns(state: LearnerState): Promise<CarsReasoningPatternView[]> {
    const repairs = state.carsRepairs ?? [];
    if (repairs.length === 0) return [];
    const attempts = await this.practiceBank.listPracticeAttempts(state.learnerId, {
      limit: Authority.ATTEMPT_LOG_LIMIT,
    });
    // The CARS sub-skill of each distinct correctly-answered item, resolved once
    // through the port (a CARS item carries no sub-skill on the attempt log, so it
    // is read back from the corpus). Only correct answers can resolve a repair.
    //
    // Dedup is done in TWO deterministic passes rather than a check-then-set inside
    // one `Promise.all`. The previous shape read `correctByItem.get`, then `await`ed
    // `classify`, then `set` — so two correct attempts on the SAME item could both
    // pass the staleness check before either wrote, and whichever `set` happened to
    // settle last (order not guaranteed) decided the stored timestamp. Here the
    // latest timestamp per item is chosen by a pure synchronous reduce first, then
    // each DISTINCT item is classified exactly once, so no two promises touch the
    // same key and the result cannot depend on settle order.
    const latestCorrectAt = new Map<string, string>();
    for (const a of attempts) {
      if (!a.correct) continue;
      const seen = latestCorrectAt.get(a.questionId);
      if (seen === undefined || Date.parse(a.occurredAt) > Date.parse(seen)) {
        latestCorrectAt.set(a.questionId, a.occurredAt);
      }
    }
    const correctByItem = new Map<string, { at: string; skill: CarsSkill | null }>();
    await Promise.all(
      [...latestCorrectAt].map(async ([questionId, at]) => {
        const classification = await this.practiceBank.classify(questionId);
        correctByItem.set(questionId, { at, skill: classification?.carsSkill ?? null });
      }),
    );
    const resolvedFor = (repair: CarsReasoningRepair): boolean => {
      const createdMs = Date.parse(repair.createdAt);
      for (const { at, skill } of correctByItem.values()) {
        if (skill === repair.skill && Date.parse(at) > createdMs) return true;
      }
      return false;
    };
    const views = await Promise.all(
      repairs.map(async (repair): Promise<CarsReasoningPatternView> => {
        // Re-show the pinned passage's stem; a retired item degrades to null rather
        // than dropping the repair (the sub-skill focus still launches practice).
        const question = await this.practiceBank.getQuestion(repair.questionId);
        return {
          skill: repair.skill,
          title: CARS_SKILL_INFO[repair.skill].title,
          holdRatePct: Math.round(Math.max(0, Math.min(1, repair.holdRate)) * 100),
          questionId: repair.questionId,
          passageStem: question?.stem ?? null,
          focus: `cars-${repair.skill.toLowerCase()}`,
          flaggedAt: repair.createdAt,
          resolved: resolvedFor(repair),
        };
      }),
    );
    // Open first, then most-recently-flagged first within each group.
    return views.sort(
      (a, b) =>
        Number(a.resolved) - Number(b.resolved) || Date.parse(b.flaggedAt) - Date.parse(a.flaggedAt),
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
    opts: {
      assistanceLevel: 'A0' | 'A1' | 'A2' | 'A3';
      isDiagnosticRetry: boolean;
      /**
       * Diagnose-before-reveal timing, threaded from the command (WS0). Absent
       * on the surfaces that do not measure it (diagnostic, PotD), where the
       * event schema's non-nullable fields fall back to `0`. `| undefined` is
       * explicit so a caller may forward an unmeasured value under
       * `exactOptionalPropertyTypes`.
       */
      elapsedMs?: number | undefined;
      answerChanges?: number | undefined;
    },
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
        elapsedMs: opts.elapsedMs ?? 0,
        assistanceLevel: opts.assistanceLevel,
        contentBearingHintUsed: false,
        answerChanges: opts.answerChanges ?? 0,
        isDiagnosticRetry: opts.isDiagnosticRetry,
      },
    };
  }

  /**
   * Append one evidence record, numbered with the sequence its COMMAND is
   * accepted at.
   *
   * `sequence` is a required input rather than read off `state.nextSequence`
   * here, and that is the whole point. `nextSequence` is the sequence of the last
   * accepted command on entry, and `recordEvent` advances it in place — so what
   * this method would read depends on how many events a sibling call happened to
   * append first. Measured before this became a parameter: `recordCarsDuel`
   * appends no event and stamped the PRIOR sequence, `submitAttempt` appends both
   * an attempt and a BKT ledger record and stamped one PAST the accepted
   * sequence, and only the two paths that append exactly one event landed on it.
   * Three call sites, three different answers to one question.
   *
   * That is not cosmetic. `evaluateEvidence` decides a fresh failure by strict
   * sequence ordering against the highest mastery-eligible record, so an
   * overshooting `independent`-kind record raises the bar above the sequence any
   * later command can reach, and the next genuine independent miss TIES rather
   * than outranks it — `FRESH_FAILURE` never fires and a learner who has just
   * demonstrably failed keeps a clean warrant. That is the same defect `b845489`
   * fixed on the practice channel, reached from the other direction.
   *
   * So every caller allocates the accepted sequence ONCE, at entry, before any
   * write: `state.nextSequence + 1`, which is what the kernel will persist
   * (`projection.sequence + 1`) and what the lesson channel already passes to the
   * adapter. Two records from the same command share it, which is correct — they
   * are one command.
   */
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
      /** The accepted-stream sequence, allocated by the calling command at entry. */
      sequence: number;
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
      sequence: input.sequence,
      contentRelease: this.bank.contentRelease,
      policies: activePolicyVersions(),
    });
    state.evidence.push(record);
  }
}
