import { z } from 'zod';
import { BootstrapEnvelopeSchema, SyncSubmitRequestSchema } from './api';
import {
  SessionExchangeRequestSchema,
  SessionExchangeResponseSchema,
  SignOutResponseSchema,
} from './auth';
import { AttemptCommandSchema, GoalCommandSchema, GoalViewSchema } from './commands';
import {
  DiagnosticBlockRequestSchema,
  DiagnosticBlockResponseSchema,
  DiagnosticNextRequestSchema,
} from './diagnostic-block';
import {
  PracticeTestBlockRequestSchema,
  PracticeTestBlockResponseSchema,
  PracticeTestNextRequestSchema,
  PracticeTestResultRequestSchema,
} from './practice-test-block';
import { ErrorCodeSchema } from './errors';
import { EventIdSchema } from './ids';
import {
  CarsReasoningPatternViewSchema,
  ErrorEntryViewSchema,
  LessonWarrantViewSchema,
  MasteryMapEntrySchema,
  MistakePatternViewSchema,
  RepairQueueViewSchema,
  StudyStepViewSchema,
  TodayViewSchema,
} from './learner-views';
import {
  CarsReadinessViewSchema,
  LessonMasteryViewSchema,
  SkillMasteryViewSchema,
} from './mastery';
import {
  PassageAttemptRequestSchema,
  PassageAttemptResponseSchema,
  PassageTodayResponseSchema,
} from './passage-of-the-day';
import {
  PracticeAttemptCommandSchema,
  PracticeAttemptResultSchema,
  PracticeQueueViewSchema,
} from './practice';
import { PracticeTestSummaryViewSchema } from './practice-test';
import {
  BuildTodaysPathCommandSchema,
  DailyBudgetCommandSchema,
  PlanActivityProgressCommandSchema,
  TodaysPathViewSchema,
} from './todays-path';
import { UtcTimestampSchema } from './time';
import {
  VectorLessonCommandSchema,
  VectorLessonRunViewSchema,
  VectorLessonStartCommandSchema,
  VectorLessonStartResponseSchema,
  VectorLessonStatusViewSchema,
} from './v3-vector-lesson';

export const HttpErrorCodeSchema = z.enum([...ErrorCodeSchema.options, 'stream_conflict']);
export type HttpErrorCode = z.infer<typeof HttpErrorCodeSchema>;

/** Error body safe for client display and telemetry. Arbitrary detail bags are forbidden. */
export const HttpApiErrorSchema = z
  .object({
    code: HttpErrorCodeSchema,
    message: z.string().min(1),
    requestId: z.string().min(1),
    retryable: z.boolean(),
    path: z.string().min(1).optional(),
    currentStreamVersion: z.number().int().nonnegative().optional(),
  })
  .strict();
export type HttpApiError = z.infer<typeof HttpApiErrorSchema>;

export const LearnerSnapshotSchema = z
  .object({
    streamVersion: z.number().int().nonnegative(),
    contentRelease: z.string().min(1),
    today: TodayViewSchema.nullable(),
    session: StudyStepViewSchema,
    masteryMap: z.array(MasteryMapEntrySchema),
    errorLog: z.array(ErrorEntryViewSchema),
    errorPatterns: z.array(MistakePatternViewSchema),
    /**
     * Correct-but-shaky first attempts (WS3): wins that came slowly or landed in
     * a still-weak KC and are worth another rep. Same `ErrorEntryView` shape as
     * `errorLog`, but always `calibration: 'shaky_win'`; kept SEPARATE from
     * `errorLog` so misses-only readers (open-mistakes count, Today's Path repair
     * scheduling) never treat a win as a miss.
     */
    shakyWins: z.array(ErrorEntryViewSchema),
  })
  .strict();
export type LearnerSnapshot = z.infer<typeof LearnerSnapshotSchema>;

export const AcceptedCommandResponseSchema = z
  .object({
    eventId: EventIdSchema,
    sequence: z.number().int().positive(),
    streamVersion: z.number().int().nonnegative(),
    acceptedAt: UtcTimestampSchema,
  })
  .strict();
export type AcceptedCommandResponse = z.infer<typeof AcceptedCommandResponseSchema>;

export const HTTP_API = {
  bootstrap: {
    method: 'POST',
    path: '/v1/bootstrap',
    response: BootstrapEnvelopeSchema,
  },
  // Session exchange. The only route callable without a session. Credentials
  // never reach this API — the browser authenticates against Supabase and sends
  // only the resulting access token here.
  authSessionExchange: {
    method: 'POST',
    path: '/v1/auth/session',
    body: SessionExchangeRequestSchema,
    response: SessionExchangeResponseSchema,
  },
  authSignOut: {
    method: 'POST',
    path: '/v1/auth/signout',
    response: SignOutResponseSchema,
  },
  goal: { method: 'PUT', path: '/v1/profile/goal', body: GoalCommandSchema },
  // Read-only goal projection so the Account/Profile editor can prefill (WS8).
  // Same path as the PUT writer, distinguished by method.
  goalView: { method: 'GET', path: '/v1/profile/goal', response: GoalViewSchema },
  today: { method: 'GET', path: '/v1/plan/today', response: TodayViewSchema },
  // Today's Path — the daily learning-plan engine (orchestrates the other engines).
  todaysPath: { method: 'GET', path: '/v1/plan/today/path', response: TodaysPathViewSchema },
  todaysPathBuild: {
    method: 'POST',
    path: '/v1/plan/today/build',
    body: BuildTodaysPathCommandSchema,
    response: TodaysPathViewSchema,
  },
  todaysPathActivity: {
    method: 'POST',
    path: '/v1/plan/today/activity',
    body: PlanActivityProgressCommandSchema,
    response: AcceptedCommandResponseSchema,
  },
  dailyBudget: {
    method: 'PUT',
    path: '/v1/profile/daily-budget',
    body: DailyBudgetCommandSchema,
    response: AcceptedCommandResponseSchema,
  },
  session: { method: 'GET', path: '/v1/learning/session', response: StudyStepViewSchema },
  errors: { method: 'GET', path: '/v1/errors', response: z.array(ErrorEntryViewSchema) },
  /** Recurring-miss patterns at KC / cluster grain (never misconception grain). */
  errorPatterns: {
    method: 'GET',
    path: '/v1/errors/patterns',
    response: z.array(MistakePatternViewSchema),
  },
  /** Correct-but-shaky wins worth another rep (WS3); same view shape as errors. */
  shakyWins: {
    method: 'GET',
    path: '/v1/errors/shaky-wins',
    response: z.array(ErrorEntryViewSchema),
  },
  /** CARS reasoning-pattern repairs from weak duels (WS7); a distinct sub-skill surface. */
  carsReasoningPatterns: {
    method: 'GET',
    path: '/v1/errors/cars-reasoning',
    response: z.array(CarsReasoningPatternViewSchema),
  },
  /**
   * The guided repair queue for the Review-Mistakes runner — a prioritized,
   * servability-filtered, capped subset of the four Mistakes buckets. Path-
   * parameterized (`/v1/mistakes/repair/{limit}`) for the same reason the practice
   * queue is (the authority edge rejects query strings; the client appends the
   * segment).
   */
  mistakesRepair: {
    method: 'GET',
    path: '/v1/mistakes/repair',
    response: RepairQueueViewSchema,
  },
  progressSkills: {
    method: 'GET',
    path: '/v1/progress/skills',
    response: z.array(SkillMasteryViewSchema),
  },
  progressLessons: {
    method: 'GET',
    path: '/v1/progress/lessons',
    response: z.array(LessonMasteryViewSchema),
  },
  /**
   * The lesson-grain evidence warrant, beside `progressLessons` rather than on
   * it: one payload may not carry a capability estimate and the warrant. See
   * `LessonWarrantViewSchema`.
   */
  progressLessonWarrants: {
    method: 'GET',
    path: '/v1/progress/lesson-warrants',
    response: z.array(LessonWarrantViewSchema),
  },
  progressCars: {
    method: 'GET',
    path: '/v1/progress/cars',
    response: CarsReadinessViewSchema,
  },
  attempt: { method: 'POST', path: '/v1/attempts', body: AttemptCommandSchema },
  sync: { method: 'POST', path: '/v1/sync', body: SyncSubmitRequestSchema },
  // Placement DIAGNOSTIC (adaptive multistage). Block-based: `/next` starts or
  // resumes a session and serves the current block; `/block` commits it (one-use
  // block token) and serves the next, or the completed result. Both mutate the
  // learner's own persisted diagnostic session ONLY — no mastery — so like
  // passageAttempt they are session-gated but not CSRF write-gated. The wire
  // carries no answer key and no per-item correctness.
  diagnosticNext: {
    method: 'POST',
    path: '/v1/diagnostic/next',
    body: DiagnosticNextRequestSchema,
    response: DiagnosticBlockResponseSchema,
  },
  diagnosticBlock: {
    method: 'POST',
    path: '/v1/diagnostic/block',
    body: DiagnosticBlockRequestSchema,
    response: DiagnosticBlockResponseSchema,
  },
  // Adaptive Practice (count-based test-out). The queue is path-parameterized
  // (`/v1/practice/queue/{x}` and `/v1/practice/queue/{x}/{focus}`) because the
  // authority edge rejects query strings; the client appends the segments. The
  // adaptive attempt is deliberately namespaced so it never collides with the
  // single-item Passage-of-the-Day `POST /v1/practice/attempts`.
  practiceQueue: { method: 'GET', path: '/v1/practice/queue', response: PracticeQueueViewSchema },
  practiceAdaptiveAttempt: {
    method: 'POST',
    path: '/v1/practice/attempts/adaptive',
    body: PracticeAttemptCommandSchema,
    response: PracticeAttemptResultSchema,
  },
  /**
   * Practice-TEST dashboard summary (the amber card on Practice). The scored
   * full/half-length engine is deferred, so the deployed backend does not serve
   * this yet: a client treats the missing route as `null` (graceful data path),
   * and the card shows its existing "coming soon" states. `null` is also the
   * honest response once the engine ships but the learner has taken no test.
   */
  practiceTestSummary: {
    method: 'GET',
    path: '/v1/practice-test/summary',
    response: PracticeTestSummaryViewSchema.nullable(),
  },
  // Periodic scored practice-test RUNNER (WS5, §6). Block-based, like the
  // diagnostic: `/next` starts (cadence-gated) or resumes a sitting and serves
  // the current block; `/block` commits it (one-use block token) and serves the
  // next / the scored result. Both session-gated but not CSRF write-gated (they
  // mutate only the learner's own practice-test session row, never the
  // projection). The wire carries no answer key and no per-item correctness.
  practiceTestNext: {
    method: 'POST',
    path: '/v1/practice-test/next',
    body: PracticeTestNextRequestSchema,
    response: PracticeTestBlockResponseSchema,
  },
  practiceTestBlock: {
    method: 'POST',
    path: '/v1/practice-test/block',
    body: PracticeTestBlockRequestSchema,
    response: PracticeTestBlockResponseSchema,
  },
  // Persist a completed sitting's SCORED result to the learner projection (the
  // dashboard summary + durable freshness + Mistakes/repair queue). State-changing
  // (CSRF-gated): the server re-derives the score from the durable session, so no
  // score is trusted from the client; idempotent by the sitting id.
  practiceTestResult: {
    method: 'POST',
    path: '/v1/practice-test/result',
    body: PracticeTestResultRequestSchema,
    response: AcceptedCommandResponseSchema,
  },
  /**
   * Passage of the Day — FORMATIVE (writes no mastery). The learner's tz offset
   * rides in the PATH (`/v1/passage/today/{tz}`) because the authority edge
   * rejects query strings; the client appends the segment, exactly like the
   * practice queue's count and the mistakes-repair limit. A `null` passage is the
   * honest "pool is empty" answer the runner renders on-brand.
   */
  passageToday: {
    method: 'GET',
    path: '/v1/passage/today',
    response: PassageTodayResponseSchema,
  },
  /**
   * Scores one passage answer and reveals its explanation. A POST that mutates NO
   * learner state, so it is not `stateChanging` — no CSRF write gate — but it is
   * still session-gated like every /v1 route, so the shared client's cookie auth
   * carries it. Deliberately namespaced away from the adaptive
   * `POST /v1/practice/attempts`.
   */
  passageAttempt: {
    method: 'POST',
    path: '/v1/passage/attempts',
    body: PassageAttemptRequestSchema,
    response: PassageAttemptResponseSchema,
  },
  vectorLessonStatus: {
    method: 'GET',
    path: '/v1/lessons/vectors-and-trigonometry/status',
    response: VectorLessonStatusViewSchema,
  },
  vectorLessonStart: {
    method: 'POST',
    path: '/v1/lessons/vectors-and-trigonometry/start',
    body: VectorLessonStartCommandSchema,
    response: VectorLessonStartResponseSchema,
  },
  vectorLessonRun: {
    method: 'GET',
    path: '/v1/lessons/vectors-and-trigonometry/run',
    response: VectorLessonRunViewSchema,
  },
  vectorLessonCommand: {
    method: 'POST',
    path: '/v1/lessons/vectors-and-trigonometry/commands',
    body: VectorLessonCommandSchema,
    response: AcceptedCommandResponseSchema,
  },
} as const;
