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
 * never register this route. What actually enforces that today, in order of
 * strength:
 *
 *   1. The route is registered in exactly one place, `./http-server.ts`, and no
 *      file outside this package references it.
 *   2. `services/lambdas/learner-api/package.json` does not depend on
 *      `@mcat/local-authority`, so the import would not resolve there — and
 *      this package's `index.ts` deliberately does not re-export the HTTP
 *      server, so adding that dependency still would not surface the route.
 *
 * NEITHER IS A TEST. Point 2 is a property of a manifest that anyone can
 * change, so the invariant is currently held by convention. An assertion in
 * `tests/architecture` — that the lambda's route table registers no path
 * containing `/debug/` — is owed and is being written separately; until it
 * lands, do not read this comment as a guarantee.
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
  initialMemoryState,
  isDueReview,
  rollUpLessonMastery,
  MASTERY_THRESHOLD,
  PRIOR_PL0,
  type LessonRollupRejectionCode,
  type MemoryState,
} from '@mcat/policies';

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
  readonly mastered: boolean;
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
function lessonViews(
  lessons: readonly DebugLessonInput[],
  kc: Readonly<Record<string, MemoryState>>,
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
    lessons: lessonViews(input.lessons, mastery.kc, input.now),
    evidence: evidenceViews(input.evidence),
    appliedObservationCount: mastery.appliedObservationIds.length,
    highestAppliedObservationSequence: mastery.highestAppliedObservationSequence,
    practicedLessonIds: [...mastery.practicedLessonIds],
  };
}
