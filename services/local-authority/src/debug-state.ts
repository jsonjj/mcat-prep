/**
 * LOCAL-ONLY debug projection of learner mastery and evidence state.
 *
 * This module exists so the lesson → evidence → mastery seam is observable by
 * hand during local manual testing. It is a pure projection: no I/O, no clock
 * read, no randomness, no `process.env` access. Everything it needs — including
 * `now` and each lesson's required KC membership — arrives as an argument, so
 * the whole view is unit-testable without starting a server.
 *
 * It is reachable ONLY from `services/local-authority`, which binds loopback and
 * is never deployed. The deployed Lambda (`services/lambdas/learner-api`) must
 * never register this route, and that is ASSERTED, in
 * `tests/architecture/lesson-mastery-integration.test.ts` under "the local debug
 * route never reaches the deployed lambda". Four independent bans, so no single
 * edit re-opens the route: the lambda manifest declares no dependency on
 * `@mcat/local-authority`; no lambda source imports that package by bare or
 * relative specifier, nor any `debug-state` module; the lambda's route table
 * registers no path matching `/debug/`; and no lambda source so much as names
 * `DEBUG_LEARNER_STATE_PATH`. This package's `index.ts` re-exporting neither
 * `./debug-state` nor `./http-server` is asserted there too.
 *
 * Do not restate here whether a test exists — that sentence has now been wrong
 * in both directions (it claimed a guard that did not exist, then denied one
 * that did). Read the assertions; they import `ROUTES` and
 * `DEBUG_LEARNER_STATE_PATH` from production code, so they fail if the route
 * table or this path changes, and the describe block is the one place that has
 * to stay in step with this comment.
 *
 * PROTECTED MATERIAL. The evidence projection is an explicit field ALLOWLIST,
 * not a spread of the stored record. Answer keys, rationales, scoring authority
 * refs and item content are structurally absent rather than filtered out, so a
 * field added to `EvidenceRecord` tomorrow cannot leak through this view. Assume
 * anything returned here ends up in a log.
 */
import type { LearnerState, MasteryEngineState } from '@mcat/authority-core';
import { REASONING_OPERATIONS, type ReasoningOperation, type UtcTimestamp } from '@mcat/contracts';
import {
  currentPL,
  evaluateEvidence,
  initialMemoryState,
  isDueReview,
  rollUpLessonMastery,
  MASTERY_THRESHOLD,
  PRIOR_PL0,
  type LessonRollupInput,
  type LessonRollupRejectionCode,
  type MemoryState,
} from '@mcat/policies';

/**
 * The warrant map the rollup expects, taken from the rollup's OWN input type
 * rather than named here.
 *
 * `@mcat/domain` is not a dependency of this service, and adding one so a debug
 * projection can spell a tier name would be the wrong trade. Deriving it also
 * means the two cannot drift: a change to what the rollup accepts is a type
 * error here rather than a second definition that still compiles.
 */
type KcEvidenceQuality = LessonRollupInput['kcEvidenceQuality'];

/** Route path, shared by the server and its tests. */
export const DEBUG_LEARNER_STATE_PATH = '/v1/debug/learner-state';

/** Wire-shape version, so a saved curl output can be told apart later. */
export const DEBUG_LEARNER_STATE_SCHEMA = 'debug-learner-state/v1';

/** The explicit opt-in. Absent or unrecognized means the route does not exist. */
export const DEBUG_STATE_OPT_IN_ENV_VAR = 'MCAT_LOCAL_DEBUG_STATE';

/** Allowlist, not a truthiness check: anything else is off. */
const DEBUG_STATE_OPT_IN_VALUES: ReadonlySet<string> = new Set(['1', 'true']);

/**
 * Loopback allowlist of the exact addresses Node reports for a loopback peer.
 * A range test is deliberately avoided — an address this does not recognize is
 * not loopback.
 */
const LOOPBACK_REMOTE_ADDRESSES: ReadonlySet<string> = new Set([
  '127.0.0.1',
  '::1',
  '::ffff:127.0.0.1',
]);

/** Guard 1 of 2: the operator explicitly opted in for this process. */
export function isDebugStateOptedIn(env: Readonly<Record<string, string | undefined>>): boolean {
  const raw = env[DEBUG_STATE_OPT_IN_ENV_VAR];
  return typeof raw === 'string' && DEBUG_STATE_OPT_IN_VALUES.has(raw.trim().toLowerCase());
}

/** Guard 2 of 2: the request arrived over loopback. */
export function isLoopbackRemoteAddress(address: string | null | undefined): boolean {
  return typeof address === 'string' && LOOPBACK_REMOTE_ADDRESSES.has(address.trim().toLowerCase());
}

/** Guard 3 of 3: the request did not come from a web page. */
export function isNonBrowserRequest(originHeader: string | null | undefined): boolean {
  return originHeader === undefined || originHeader === null;
}

export interface DebugStateAccessInput {
  readonly optedIn: boolean;
  readonly remoteAddress: string | null | undefined;
  /**
   * The request's `Origin`. Every browser-issued `fetch`/XHR sets it; `curl`
   * and a top-level navigation do not.
   */
  readonly originHeader: string | null | undefined;
}

/**
 * All three guards, and only all three. They are independent: an opted-in
 * process still refuses a non-loopback peer, a loopback peer still gets nothing
 * without the opt-in, and neither one lets a web page read the payload.
 *
 * The `Origin` guard is deliberately not a CORS decision. CORS asks the browser
 * not to expose a response it has already received; this refuses to produce one
 * at all, so a misconfigured or future-widened origin allowlist cannot turn
 * into an exfiltration path for internal mastery state. This view is a
 * command-line tool.
 */
export function isDebugStateRequestAllowed(input: DebugStateAccessInput): boolean {
  return (
    input.optedIn &&
    isLoopbackRemoteAddress(input.remoteAddress) &&
    isNonBrowserRequest(input.originHeader)
  );
}

/** One KC that currently holds a persisted `P(L)`. */
export interface DebugKcView {
  readonly kcId: string;
  /** Current value, after lazy decay to `now`. */
  readonly pL: number;
  /** The stored value, as-of `lastPracticedAt`. Equal to `pL` when never practiced. */
  readonly storedPL: number;
  readonly mastered: boolean;
  readonly reviewDue: boolean;
  readonly halfLifeDays: number;
  readonly lastPracticedAt: string | null;
}

/** One of the seven primary reasoning operations. */
export interface DebugReasoningOperationView {
  readonly operation: ReasoningOperation;
  readonly pL: number;
  readonly mastered: boolean;
  /** False when no observation has ever targeted this operation (`pL` is the prior). */
  readonly observed: boolean;
}

export interface DebugLessonMemberView {
  readonly kcId: string;
  readonly pL: number;
  /** Both halves: over the cut AND adequately warranted. */
  readonly mastered: boolean;
  /** The warrant half on its own, so a withheld claim says which half failed. */
  readonly evidenceSufficient: boolean;
  readonly reviewDue: boolean;
}

/**
 * A lesson's DERIVED readout. A lesson holds no `P(L)` of its own, and
 * `unavailable` is reported with its rejection code rather than as an empty or
 * zeroed result: "not mapped to a curriculum membership" and "no data yet" are
 * different answers and must not look alike.
 */
export type DebugLessonView =
  | {
      readonly lessonId: string;
      readonly status: 'available';
      readonly pL: number;
      readonly mastered: boolean;
      readonly reviewDue: boolean;
      readonly requiredKcCount: number;
      readonly weakestKcId: string;
      readonly weakestPL: number;
      readonly members: readonly DebugLessonMemberView[];
    }
  | {
      readonly lessonId: string;
      readonly status: 'unavailable';
      readonly rejectionCodes: readonly LessonRollupRejectionCode[];
      readonly missingKcIds: readonly string[];
    };

/** Allowlisted evidence fields. Nothing answer-bearing has a home here. */
export interface DebugEvidenceView {
  readonly evidenceId: string;
  readonly skillId: string;
  readonly cluster: string;
  readonly kind: string;
  readonly outcome: string;
  readonly independent: boolean;
  readonly assistanceLevel: string;
  readonly contentBearingHint: boolean;
  readonly valid: boolean;
  readonly changeDimensions: readonly string[];
  readonly conditions: {
    readonly mixed: boolean;
    readonly passage: boolean;
    readonly timed: boolean;
    readonly protected: boolean;
  };
  readonly occurredAt: string;
  readonly sequence: number;
}

export interface DebugLearnerStateView {
  readonly schema: typeof DEBUG_LEARNER_STATE_SCHEMA;
  readonly learnerId: string;
  readonly streamVersion: number;
  /** Accepted commands on this learner's stream. */
  readonly acceptedEventCount: number;
  readonly now: UtcTimestamp;
  readonly masteryThreshold: number;
  readonly knowledgeComponents: readonly DebugKcView[];
  readonly reasoningOperations: readonly DebugReasoningOperationView[];
  readonly lessons: readonly DebugLessonView[];
  readonly evidence: readonly DebugEvidenceView[];
  /** Qualified observations already applied; a re-delivery must not increase this. */
  readonly appliedObservationCount: number;
  /** Highest applied observation sequence, or null before the first one. */
  readonly highestAppliedObservationSequence: number | null;
  readonly practicedLessonIds: readonly string[];
}

/** A lesson to report, with the membership the caller resolved for it. */
export interface DebugLessonInput {
  readonly lessonId: string;
  /**
   * The lesson's authoritative ordered required KC ids, as returned by
   * `orderedKcsForLesson()`. `null` means no registry membership resolved and is
   * reported as `LESSON_KC_MAP_MISSING` rather than hidden.
   */
  readonly requiredKcIds: readonly string[] | null;
}

export interface DebugLearnerStateInput {
  readonly learnerId: string;
  readonly streamVersion: number;
  readonly acceptedEventCount: number;
  readonly now: UtcTimestamp;
  readonly mastery: MasteryEngineState | undefined;
  readonly evidence: readonly LearnerState['evidence'][number][];
  /** Reported in the given order; a repeated lesson id is reported once. */
  readonly lessons: readonly DebugLessonInput[];
}

const EMPTY_MASTERY: MasteryEngineState = {
  kc: {},
  skill: {},
  cars: {},
  practicedLessonIds: [],
  appliedObservationIds: [],
  highestAppliedObservationSequence: null,
};

function kcViews(
  kc: Readonly<Record<string, MemoryState>>,
  now: UtcTimestamp,
): readonly DebugKcView[] {
  return Object.keys(kc)
    .sort()
    .map((kcId) => {
      const state = kc[kcId]!;
      const pL = currentPL(state, now);
      return {
        kcId,
        pL,
        storedPL: state.pL,
        mastered: pL >= MASTERY_THRESHOLD,
        reviewDue: state.lastPracticedAt !== null && isDueReview(pL),
        halfLifeDays: state.halfLifeDays,
        lastPracticedAt: state.lastPracticedAt,
      };
    });
}

function reasoningOperationViews(
  skill: MasteryEngineState['skill'],
  now: UtcTimestamp,
): readonly DebugReasoningOperationView[] {
  return REASONING_OPERATIONS.map((operation) => {
    const state = skill[operation];
    const pL = state === undefined ? PRIOR_PL0 : currentPL(state, now);
    return {
      operation,
      pL,
      mastered: pL >= MASTERY_THRESHOLD,
      observed: state !== undefined,
    };
  });
}

/**
 * Every required KC is supplied EXPLICITLY, an unstarted one as
 * `initialMemoryState()`. Passing only the KCs that happen to hold a state would
 * make the rollup fail closed with `LESSON_KC_STATE_MISSING` for every
 * partly-started lesson — correct behaviour on its part, useless here.
 */
/**
 * The evidence-warrant tier per grain, so the rollup can decide `mastered` —
 * which needs the warrant as well as `P(L)`.
 *
 * Run here through the same `evaluateEvidence` the Authority uses, over the
 * same records, because this module is a parallel projection of persisted state
 * and reaches no Authority instance (it already re-derives `pL`, `reviewDue`
 * and the rollup the same way).
 *
 * ONE INPUT IS MISSING and it is worth naming: `prerequisiteBlocked`, which
 * only this learner's skill graph can answer and which resolves to
 * `foundation_needed`. That tier is below the sufficiency bar, so the debug
 * view can only ever be MORE permissive than the Authority here — never less —
 * and only for a grain whose prerequisites are unmet.
 */
function evidenceQualityByGrain(
  records: readonly LearnerState['evidence'][number][],
  now: UtcTimestamp,
): KcEvidenceQuality {
  const byGrain: Record<string, ReturnType<typeof evaluateEvidence>['evidenceQuality']> = {};
  for (const skillId of new Set(records.map((record) => record.skillId))) {
    const forGrain = records.filter((record) => record.skillId === skillId);
    byGrain[skillId] = evaluateEvidence({
      skillId,
      records: [...forGrain],
      now,
      hasInstruction: forGrain.length > 0,
    }).evidenceQuality;
  }
  return byGrain;
}

function lessonViews(
  lessons: readonly DebugLessonInput[],
  kc: Readonly<Record<string, MemoryState>>,
  kcEvidenceQuality: KcEvidenceQuality,
  now: UtcTimestamp,
): readonly DebugLessonView[] {
  const seen = new Set<string>();
  const views: DebugLessonView[] = [];
  for (const lesson of lessons) {
    if (seen.has(lesson.lessonId)) continue;
    seen.add(lesson.lessonId);

    const kcStates: Record<string, MemoryState> = {};
    for (const kcId of lesson.requiredKcIds ?? []) {
      kcStates[kcId] = kc[kcId] ?? initialMemoryState();
    }
    const result = rollUpLessonMastery({
      lessonId: lesson.lessonId,
      requiredKcIds: lesson.requiredKcIds,
      kcStates,
      kcEvidenceQuality,
      now,
    });
    if (result.status === 'unavailable') {
      views.push({
        lessonId: result.lessonId,
        status: 'unavailable',
        rejectionCodes: result.rejectionCodes,
        missingKcIds: result.missingKcIds,
      });
      continue;
    }
    const { view } = result;
    views.push({
      lessonId: view.lessonId,
      status: 'available',
      pL: view.pL,
      mastered: view.mastered,
      reviewDue: view.reviewDue,
      requiredKcCount: view.requiredKcCount,
      weakestKcId: view.weakestKcId,
      weakestPL: view.weakestPL,
      members: view.members.map((member) => ({
        kcId: member.kcId,
        pL: member.pL,
        mastered: member.mastered,
        evidenceSufficient: member.evidenceSufficient,
        reviewDue: member.reviewDue,
      })),
    });
  }
  return views;
}

function evidenceViews(
  records: readonly LearnerState['evidence'][number][],
): readonly DebugEvidenceView[] {
  return records.map((record) => ({
    evidenceId: record.evidenceId,
    skillId: record.skillId,
    cluster: record.cluster,
    kind: record.kind,
    outcome: record.outcome,
    independent: record.independent,
    assistanceLevel: record.assistanceLevel,
    contentBearingHint: record.contentBearingHint,
    valid: record.valid,
    changeDimensions: [...record.changeDimensions],
    conditions: {
      mixed: record.conditions.mixed,
      passage: record.conditions.passage,
      timed: record.conditions.timed,
      protected: record.conditions.protected,
    },
    occurredAt: record.occurredAt,
    sequence: record.sequence,
  }));
}

/** Project a learner's persisted state into the local debug view. Pure. */
export function buildDebugLearnerState(input: DebugLearnerStateInput): DebugLearnerStateView {
  const mastery = input.mastery ?? EMPTY_MASTERY;
  return {
    schema: DEBUG_LEARNER_STATE_SCHEMA,
    learnerId: input.learnerId,
    streamVersion: input.streamVersion,
    acceptedEventCount: input.acceptedEventCount,
    now: input.now,
    masteryThreshold: MASTERY_THRESHOLD,
    knowledgeComponents: kcViews(mastery.kc, input.now),
    reasoningOperations: reasoningOperationViews(mastery.skill, input.now),
    lessons: lessonViews(
      input.lessons,
      mastery.kc,
      evidenceQualityByGrain(input.evidence, input.now),
      input.now,
    ),
    evidence: evidenceViews(input.evidence),
    appliedObservationCount: mastery.appliedObservationIds.length,
    highestAppliedObservationSequence: mastery.highestAppliedObservationSequence,
    practicedLessonIds: [...mastery.practicedLessonIds],
  };
}
