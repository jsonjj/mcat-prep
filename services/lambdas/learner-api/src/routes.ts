import {
  AttemptCommandSchema,
  CarsDuelOutcomeInputSchema,
  CarsReadinessViewSchema,
  CarsReasoningPatternViewSchema,
  ChoiceIdSchema,
  CommandEnvelopeSchema,
  ContentIdSchema,
  DiagnosticNextSchema,
  ErrorEntryViewSchema,
  GoalCommandSchema,
  GoalViewSchema,
  LessonMasteryViewSchema,
  LessonWarrantViewSchema,
  MasteryMapEntrySchema,
  MasterySeedSchema,
  MistakePatternViewSchema,
  NormalizedLessonCommandSchema,
  NormalizedLessonRunViewSchema,
  NormalizedLessonStartCommandSchema,
  NormalizedLessonStartResponseSchema,
  NormalizedLessonStatusViewSchema,
  PassageAttemptRequestSchema,
  PassageAttemptResponseSchema,
  PassageTodayResponseSchema,
  PracticeAttemptCommandSchema,
  PracticeAttemptResultSchema,
  PracticeFocusSchema,
  PracticeItemViewSchema,
  PracticeQueueViewSchema,
  PracticeResultSchema,
  RepairQueueViewSchema,
  SkillMasteryViewSchema,
  SkillSummarySchema,
  StudyStepViewSchema,
  TodayViewSchema,
  VectorLessonCommandSchema,
  VectorLessonRunViewSchema,
  VectorLessonStartCommandSchema,
  VectorLessonStartResponseSchema,
  VectorLessonStatusViewSchema,
  WrappedViewSchema,
  type CarsDuelOutcomeInput,
  type ChoiceId,
  type CommandEnvelope,
  type ContentId,
  type MasterySeed,
  type PracticeAttemptCommand,
} from '@mcat/contracts';
import {
  parseChatRequest,
  parseRewriteRequest,
  type ChatRequest,
  type RewriteRequest,
} from '@mcat/ai-gateway';

export type RouteId =
  | 'health'
  | 'bootstrap'
  | 'diagnosticNext'
  | 'goal'
  | 'goalView'
  | 'attempt'
  | 'reveal'
  | 'continue'
  | 'recall'
  | 'skills'
  | 'practiceItem'
  | 'practiceAttempt'
  | 'practiceQueue'
  | 'practiceAdaptiveAttempt'
  | 'carsDuel'
  | 'passageToday'
  | 'passageAttempt'
  | 'aiRewrite'
  | 'aiChat'
  | 'practiceTestCompleted'
  | 'practiceTestReviewed'
  | 'masterySeed'
  | 'wrapped'
  | 'resetProgress'
  | 'today'
  | 'session'
  | 'mastery'
  | 'progressSkills'
  | 'progressLessons'
  | 'progressLessonWarrants'
  | 'progressCars'
  | 'errors'
  | 'shakyWins'
  | 'errorPatterns'
  | 'carsReasoningPatterns'
  | 'mistakesRepair'
  | 'vectorLessonStatus'
  | 'vectorLessonStart'
  | 'vectorLessonRun'
  | 'vectorLessonCommand'
  | 'normalizedLessonStatus'
  | 'normalizedLessonStart'
  | 'normalizedLessonRun'
  | 'normalizedLessonCommand';

interface RuntimeSchema<T = unknown> {
  parse(value: unknown): T;
  safeParse(value: unknown): { success: true; data: T } | { success: false };
}

export interface RevealCommandBody {
  readonly envelope: CommandEnvelope;
  readonly revealNow: true;
}

export interface ContinueCommandBody {
  readonly envelope: CommandEnvelope;
}

export interface RecallCommandBody {
  readonly envelope: CommandEnvelope;
  readonly answer: string;
}

export interface PracticeAttemptCommandBody {
  readonly envelope: CommandEnvelope;
  readonly questionId: ContentId;
  readonly choiceId: ChoiceId | null;
}

export interface CarsDuelCommandBody extends CarsDuelOutcomeInput {
  readonly envelope: CommandEnvelope;
}

export interface MasterySeedCommandBody {
  readonly envelope: CommandEnvelope;
  readonly seed: MasterySeed;
}

export interface PracticeAdaptiveAttemptCommandBody {
  readonly envelope: CommandEnvelope;
  readonly command: PracticeAttemptCommand;
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  return Object.keys(value).sort().join(',') === [...expected].sort().join(',');
}

function workflowSchema<T>(parse: (value: Record<string, unknown>) => T | null): RuntimeSchema<T> {
  return {
    parse(value: unknown): T {
      const parsed = this.safeParse(value);
      if (!parsed.success) throw new TypeError('Invalid workflow command body.');
      return parsed.data;
    },
    safeParse(value: unknown): { success: true; data: T } | { success: false } {
      const input = record(value);
      if (input === null) return { success: false };
      const parsed = parse(input);
      return parsed === null ? { success: false } : { success: true, data: parsed };
    },
  };
}

const RevealCommandBodySchema = workflowSchema<RevealCommandBody>((value) => {
  if (!exactKeys(value, ['envelope', 'revealNow']) || value.revealNow !== true) return null;
  const envelope = CommandEnvelopeSchema.safeParse(value.envelope);
  return envelope.success ? { envelope: envelope.data, revealNow: true } : null;
});

const ContinueCommandBodySchema = workflowSchema<ContinueCommandBody>((value) => {
  if (!exactKeys(value, ['envelope'])) return null;
  const envelope = CommandEnvelopeSchema.safeParse(value.envelope);
  return envelope.success ? { envelope: envelope.data } : null;
});

const CARS_DUEL_BODY_KEYS = new Set(['envelope', 'rubric', 'mode', 'topicId', 'intensity']);
const CarsDuelCommandBodySchema = workflowSchema<CarsDuelCommandBody>((value) => {
  // Accept an envelope alone, or an envelope plus the optional formative outcome
  // (rubric + which selection was played, for the WS6 engine). No mastery.
  if (!Object.keys(value).every((key) => CARS_DUEL_BODY_KEYS.has(key))) return null;
  const envelope = CommandEnvelopeSchema.safeParse(value.envelope);
  if (!envelope.success) return null;
  const { envelope: _envelope, ...rest } = value;
  const outcome = CarsDuelOutcomeInputSchema.safeParse(rest);
  return outcome.success ? { envelope: envelope.data, ...outcome.data } : null;
});

const MasterySeedCommandBodySchema = workflowSchema<MasterySeedCommandBody>((value) => {
  if (!exactKeys(value, ['envelope', 'seed'])) return null;
  const envelope = CommandEnvelopeSchema.safeParse(value.envelope);
  if (!envelope.success) return null;
  const seed = MasterySeedSchema.safeParse(value.seed);
  return seed.success ? { envelope: envelope.data, seed: seed.data } : null;
});

const RecallCommandBodySchema = workflowSchema<RecallCommandBody>((value) => {
  if (
    !exactKeys(value, ['envelope', 'answer']) ||
    typeof value.answer !== 'string' ||
    value.answer.trim().length === 0 ||
    value.answer.length > 10_000
  ) {
    return null;
  }
  const envelope = CommandEnvelopeSchema.safeParse(value.envelope);
  return envelope.success ? { envelope: envelope.data, answer: value.answer } : null;
});

const PracticeAttemptCommandBodySchema = workflowSchema<PracticeAttemptCommandBody>((value) => {
  if (!exactKeys(value, ['envelope', 'questionId', 'choiceId'])) return null;
  const envelope = CommandEnvelopeSchema.safeParse(value.envelope);
  const questionId = ContentIdSchema.safeParse(value.questionId);
  const choiceId = ChoiceIdSchema.nullable().safeParse(value.choiceId);
  return envelope.success && questionId.success && choiceId.success
    ? { envelope: envelope.data, questionId: questionId.data, choiceId: choiceId.data }
    : null;
});

const PracticeAdaptiveAttemptCommandBodySchema = workflowSchema<PracticeAdaptiveAttemptCommandBody>(
  (value) => {
    // Required keys, plus OPTIONAL diagnose-before-reveal timing (WS0). The
    // timing keys are allowed but not required: a UI client sends them, and an
    // older or non-UI client omits them and has its timing logged as "not
    // captured". No `firstAttempt` key: the field is gone from
    // `PracticeAttemptCommandSchema` entirely (see packages/contracts/src/practice.ts),
    // so a body that still sends it is rejected as unknown rather than ignored.
    const required = ['envelope', 'questionId', 'specId', 'chosenChoiceId'];
    const allowed = new Set([...required, 'elapsedMs', 'answerChanges']);
    if (
      !required.every((key) => key in value) ||
      !Object.keys(value).every((key) => allowed.has(key))
    ) {
      return null;
    }
    const envelope = CommandEnvelopeSchema.safeParse(value.envelope);
    const { envelope: _envelope, ...rest } = value;
    const command = PracticeAttemptCommandSchema.safeParse(rest);
    return envelope.success && command.success
      ? { envelope: envelope.data, command: command.data }
      : null;
  },
);

const NullablePracticeItemViewSchema: RuntimeSchema = {
  parse(value: unknown) {
    return value === null ? null : PracticeItemViewSchema.parse(value);
  },
  safeParse(value: unknown) {
    if (value === null) return { success: true, data: null };
    const parsed = PracticeItemViewSchema.safeParse(value);
    return parsed.success ? { success: true, data: parsed.data } : { success: false };
  },
};

/**
 * Validates the "Explain it another way" body (WS4) by delegating to the
 * ai-gateway parser — which also enforces the source size cap. Kept as a
 * `RuntimeSchema` so the route flows through the handler's standard body parsing
 * (JSON content-type + byte cap) and its uniform `validation_error` response.
 */
const AiRewriteRequestSchema: RuntimeSchema<RewriteRequest> = {
  parse(value: unknown): RewriteRequest {
    const parsed = parseRewriteRequest(value);
    if (parsed === null) throw new TypeError('Invalid rewrite request.');
    return parsed;
  },
  safeParse(value: unknown) {
    const parsed = parseRewriteRequest(value);
    return parsed === null ? { success: false } : { success: true, data: parsed };
  },
};

/**
 * Validates the CARS Duel opponent body by delegating to the ai-gateway parser —
 * which also enforces the message-count and combined-size caps — mirroring
 * {@link AiRewriteRequestSchema}. Kept as a `RuntimeSchema` so the route flows
 * through the handler's standard body parsing (JSON content-type + byte cap) and
 * its uniform `validation_error` response before any provider spend.
 */
const AiChatRequestSchema: RuntimeSchema<ChatRequest> = {
  parse(value: unknown): ChatRequest {
    const parsed = parseChatRequest(value);
    if (parsed === null) throw new TypeError('Invalid chat request.');
    return parsed;
  },
  safeParse(value: unknown) {
    const parsed = parseChatRequest(value);
    return parsed === null ? { success: false } : { success: true, data: parsed };
  },
};

export interface RouteDefinition {
  readonly id: RouteId;
  readonly method: 'DELETE' | 'GET' | 'POST' | 'PUT';
  readonly path: string;
  readonly auth: 'public' | 'bootstrap' | 'session';
  readonly stateChanging: boolean;
  readonly bodySchema?: RuntimeSchema;
  readonly responseSchema?: RuntimeSchema;
}

export const ROUTES: readonly RouteDefinition[] = [
  {
    id: 'health',
    method: 'GET',
    path: '/v1/health',
    auth: 'public',
    stateChanging: false,
  },
  {
    id: 'bootstrap',
    method: 'POST',
    path: '/v1/bootstrap',
    auth: 'bootstrap',
    stateChanging: true,
  },
  {
    id: 'diagnosticNext',
    method: 'GET',
    path: '/v1/diagnostic/next',
    auth: 'session',
    stateChanging: false,
    responseSchema: DiagnosticNextSchema,
  },
  {
    id: 'goal',
    method: 'PUT',
    path: '/v1/profile/goal',
    auth: 'session',
    stateChanging: true,
    bodySchema: GoalCommandSchema,
  },
  {
    // Read-only goal projection for the Account/Profile editor prefill (WS8).
    id: 'goalView',
    method: 'GET',
    path: '/v1/profile/goal',
    auth: 'session',
    stateChanging: false,
    responseSchema: GoalViewSchema,
  },
  {
    id: 'attempt',
    method: 'POST',
    path: '/v1/attempts',
    auth: 'session',
    stateChanging: true,
    bodySchema: AttemptCommandSchema,
  },
  {
    id: 'reveal',
    method: 'POST',
    path: '/v1/attempts/reveal',
    auth: 'session',
    stateChanging: true,
    bodySchema: RevealCommandBodySchema,
  },
  {
    id: 'continue',
    method: 'POST',
    path: '/v1/learning/session/continue',
    auth: 'session',
    stateChanging: true,
    bodySchema: ContinueCommandBodySchema,
  },
  {
    id: 'recall',
    method: 'POST',
    path: '/v1/recall',
    auth: 'session',
    stateChanging: true,
    bodySchema: RecallCommandBodySchema,
  },
  {
    id: 'skills',
    method: 'GET',
    path: '/v1/skills',
    auth: 'session',
    stateChanging: false,
    responseSchema: SkillSummarySchema.array(),
  },
  {
    id: 'practiceItem',
    method: 'GET',
    path: '/v1/practice/items/{questionId}',
    auth: 'session',
    stateChanging: false,
    responseSchema: NullablePracticeItemViewSchema,
  },
  {
    id: 'practiceAttempt',
    method: 'POST',
    path: '/v1/practice/attempts',
    auth: 'session',
    stateChanging: true,
    bodySchema: PracticeAttemptCommandBodySchema,
    responseSchema: PracticeResultSchema,
  },
  {
    id: 'practiceQueue',
    method: 'GET',
    // Path-parameterized (`/v1/practice/queue/{x}` [+ `/{focus}`]); the edge
    // rejects query strings, so count + focus ride in the path.
    path: '/v1/practice/queue',
    auth: 'session',
    stateChanging: false,
    responseSchema: PracticeQueueViewSchema,
  },
  {
    id: 'practiceAdaptiveAttempt',
    method: 'POST',
    // Deliberately namespaced so it never collides with the single-item
    // Passage-of-the-Day `POST /v1/practice/attempts`.
    path: '/v1/practice/attempts/adaptive',
    auth: 'session',
    stateChanging: true,
    bodySchema: PracticeAdaptiveAttemptCommandBodySchema,
    responseSchema: PracticeAttemptResultSchema,
  },
  {
    id: 'carsDuel',
    method: 'POST',
    path: '/v1/hooks/cars-duel',
    auth: 'session',
    stateChanging: true,
    bodySchema: CarsDuelCommandBodySchema,
  },
  {
    // Passage of the Day — FORMATIVE, writes no mastery. The learner's tz offset
    // rides in the PATH (`/v1/passage/today/{tz}`) because the edge rejects query
    // strings, exactly as the practice queue's count does.
    id: 'passageToday',
    method: 'GET',
    path: '/v1/passage/today',
    auth: 'session',
    stateChanging: false,
    responseSchema: PassageTodayResponseSchema,
  },
  {
    // Scores one passage answer and reveals its explanation. A POST that mutates
    // NO learner state (like aiRewrite), so it is not `stateChanging` — no CSRF
    // write gate — but still session + origin-verify gated like every /v1 route.
    id: 'passageAttempt',
    method: 'POST',
    path: '/v1/passage/attempts',
    auth: 'session',
    stateChanging: false,
    bodySchema: PassageAttemptRequestSchema,
    responseSchema: PassageAttemptResponseSchema,
  },
  {
    // WS4 "Explain it another way": a grounded, post-reveal re-expression of an
    // explanation the learner has ALREADY seen. It is a POST but mutates no
    // learner state, so it is not `stateChanging` — no CSRF/Origin-required
    // write gate. It still runs behind the same session authorizer,
    // `x-mcat-origin-verify`, per-session rate limiter, and WAF as every other
    // /v1 route, and a cross-origin browser call is still refused by the Origin
    // check. handler.ts dispatches it to ai-gateway `groundedRewrite`; a missing
    // key yields 503 and the client falls back deterministically.
    id: 'aiRewrite',
    method: 'POST',
    path: '/v1/ai/rewrite',
    auth: 'session',
    stateChanging: false,
    bodySchema: AiRewriteRequestSchema,
  },
  {
    // CARS Duel opponent: the same-origin seam the dev proxy stands in for, now
    // served in prod. A POST that mutates NO learner state (the duel outcome is
    // recorded separately via `/v1/hooks/cars-duel`), so it is not
    // `stateChanging` — no CSRF/Origin-required write gate — exactly like
    // `aiRewrite`. It still runs behind the same session authorizer,
    // `x-mcat-origin-verify`, per-session rate limiter, and WAF as every other
    // /v1 route, and a cross-origin browser call is still refused by the Origin
    // check. handler.ts dispatches it to ai-gateway `proxyChat`; the client
    // authors the guarded CARS prompts and the parser caps message count/size, so
    // no key yields 503 and the client shows the opponent as offline (never 500).
    id: 'aiChat',
    method: 'POST',
    path: '/v1/ai/chat',
    auth: 'session',
    stateChanging: false,
    bodySchema: AiChatRequestSchema,
  },
  {
    // WS5: the learner reports a completed periodic test — envelope only, no
    // payload; the authority stamps the date/count off its own clock.
    id: 'practiceTestCompleted',
    method: 'POST',
    path: '/v1/hooks/practice-test/completed',
    auth: 'session',
    stateChanging: true,
    bodySchema: ContinueCommandBodySchema,
  },
  {
    // WS5: the learner reports the prior test's review is done — releases the
    // block-until-reviewed cadence gate. Envelope only.
    id: 'practiceTestReviewed',
    method: 'POST',
    path: '/v1/hooks/practice-test/reviewed',
    auth: 'session',
    stateChanging: true,
    bodySchema: ContinueCommandBodySchema,
  },
  {
    id: 'masterySeed',
    method: 'POST',
    path: '/v1/hooks/mastery-seed',
    auth: 'session',
    stateChanging: true,
    bodySchema: MasterySeedCommandBodySchema,
  },
  {
    id: 'wrapped',
    method: 'GET',
    path: '/v1/hooks/wrapped',
    auth: 'session',
    stateChanging: false,
    responseSchema: WrappedViewSchema,
  },
  {
    id: 'resetProgress',
    method: 'DELETE',
    path: '/v1/account/progress',
    auth: 'session',
    stateChanging: true,
    bodySchema: ContinueCommandBodySchema,
  },
  {
    id: 'today',
    method: 'GET',
    path: '/v1/plan/today',
    auth: 'session',
    stateChanging: false,
    responseSchema: TodayViewSchema,
  },
  {
    id: 'session',
    method: 'GET',
    path: '/v1/learning/session',
    auth: 'session',
    stateChanging: false,
    responseSchema: StudyStepViewSchema,
  },
  {
    id: 'mastery',
    method: 'GET',
    path: '/v1/progress/mastery',
    auth: 'session',
    stateChanging: false,
    responseSchema: MasteryMapEntrySchema.array(),
  },
  {
    id: 'progressSkills',
    method: 'GET',
    path: '/v1/progress/skills',
    auth: 'session',
    stateChanging: false,
    responseSchema: SkillMasteryViewSchema.array(),
  },
  {
    id: 'progressLessons',
    method: 'GET',
    path: '/v1/progress/lessons',
    auth: 'session',
    stateChanging: false,
    responseSchema: LessonMasteryViewSchema.array(),
  },
  {
    id: 'progressLessonWarrants',
    method: 'GET',
    path: '/v1/progress/lesson-warrants',
    auth: 'session',
    stateChanging: false,
    responseSchema: LessonWarrantViewSchema.array(),
  },
  {
    id: 'progressCars',
    method: 'GET',
    path: '/v1/progress/cars',
    auth: 'session',
    stateChanging: false,
    responseSchema: CarsReadinessViewSchema,
  },
  {
    id: 'errors',
    method: 'GET',
    path: '/v1/errors',
    auth: 'session',
    stateChanging: false,
    responseSchema: ErrorEntryViewSchema.array(),
  },
  {
    id: 'shakyWins',
    method: 'GET',
    path: '/v1/errors/shaky-wins',
    auth: 'session',
    stateChanging: false,
    responseSchema: ErrorEntryViewSchema.array(),
  },
  {
    id: 'errorPatterns',
    method: 'GET',
    path: '/v1/errors/patterns',
    auth: 'session',
    stateChanging: false,
    responseSchema: MistakePatternViewSchema.array(),
  },
  {
    id: 'carsReasoningPatterns',
    method: 'GET',
    path: '/v1/errors/cars-reasoning',
    auth: 'session',
    stateChanging: false,
    responseSchema: CarsReasoningPatternViewSchema.array(),
  },
  {
    id: 'mistakesRepair',
    method: 'GET',
    // Path-parameterized (`/v1/mistakes/repair/{limit}`); the edge rejects query
    // strings, so the cap rides in the path like the practice queue's count.
    path: '/v1/mistakes/repair',
    auth: 'session',
    stateChanging: false,
    responseSchema: RepairQueueViewSchema,
  },
  {
    id: 'vectorLessonStatus',
    method: 'GET',
    path: '/v1/lessons/vectors-and-trigonometry/status',
    auth: 'session',
    stateChanging: false,
    responseSchema: VectorLessonStatusViewSchema,
  },
  {
    id: 'vectorLessonStart',
    method: 'POST',
    path: '/v1/lessons/vectors-and-trigonometry/start',
    auth: 'session',
    stateChanging: true,
    bodySchema: VectorLessonStartCommandSchema,
    responseSchema: VectorLessonStartResponseSchema,
  },
  {
    id: 'vectorLessonRun',
    method: 'GET',
    path: '/v1/lessons/vectors-and-trigonometry/run',
    auth: 'session',
    stateChanging: false,
    responseSchema: VectorLessonRunViewSchema,
  },
  {
    id: 'vectorLessonCommand',
    method: 'POST',
    path: '/v1/lessons/vectors-and-trigonometry/commands',
    auth: 'session',
    stateChanging: true,
    bodySchema: VectorLessonCommandSchema,
  },
  // The normalized-engine catalog (L2/L3, and future lessons). One slug-
  // parameterized family matching L1's four-route shape, so a new lesson needs
  // no new route code — only a `NORMALIZED_LESSON_ROUTE_SLUGS` entry. `path` is
  // a template; the real match is the closed-set regex in `routeMatches`.
  {
    id: 'normalizedLessonStatus',
    method: 'GET',
    path: '/v1/lessons/{lessonSlug}/status',
    auth: 'session',
    stateChanging: false,
    responseSchema: NormalizedLessonStatusViewSchema,
  },
  {
    id: 'normalizedLessonStart',
    method: 'POST',
    path: '/v1/lessons/{lessonSlug}/start',
    auth: 'session',
    stateChanging: true,
    bodySchema: NormalizedLessonStartCommandSchema,
    responseSchema: NormalizedLessonStartResponseSchema,
  },
  {
    id: 'normalizedLessonRun',
    method: 'GET',
    path: '/v1/lessons/{lessonSlug}/run',
    auth: 'session',
    stateChanging: false,
    responseSchema: NormalizedLessonRunViewSchema,
  },
  {
    id: 'normalizedLessonCommand',
    method: 'POST',
    path: '/v1/lessons/{lessonSlug}/commands',
    auth: 'session',
    stateChanging: true,
    bodySchema: NormalizedLessonCommandSchema,
  },
] as const;

export function routeFor(method: string, path: string): RouteDefinition | undefined {
  return ROUTES.find((route) => route.method === method && routeMatches(route, path));
}

export function allowedMethodsFor(path: string): readonly string[] {
  return ROUTES.filter((route) => routeMatches(route, path)).map((route) => route.method);
}

const PRACTICE_ITEM_PATH = /^\/v1\/practice\/items\/([a-z0-9]+(?:-[a-z0-9]+)*)$/;
const PRACTICE_QUEUE_PATH = /^\/v1\/practice\/queue\/(\d{1,2})(?:\/([a-z0-9-]{1,32}))?$/;
const MISTAKES_REPAIR_PATH = /^\/v1\/mistakes\/repair\/(\d{1,2})$/;
// `Date.getTimezoneOffset()` is UTC-minus-local in minutes; bounded to ±1440.
const PASSAGE_TODAY_PATH = /^\/v1\/passage\/today\/(-?\d{1,4})$/;

/**
 * The normalized-engine catalog: every non-L1 lesson the shared runtime serves,
 * keyed by URL slug. L1 keeps its own bespoke slug routes above (per-grammar
 * dispatch). This closed set is the SOLE authority for which slugs route to the
 * normalized family — an unregistered slug never matches (it 404s instead of
 * reaching the engine), and the L1 slug can never collide with a normalized
 * match. A new lesson joins the catalog by adding one entry here.
 */
export const NORMALIZED_LESSON_ROUTE_SLUGS: Readonly<Record<string, string>> = {
  'v3-les-789208': 'V3-LES-789208',
  'v3-les-844372': 'V3-LES-844372',
};

const NORMALIZED_LESSON_SLUG_GROUP = Object.keys(NORMALIZED_LESSON_ROUTE_SLUGS).join('|');
const normalizedLessonPathFor = (verb: string): RegExp =>
  new RegExp(`^/v1/lessons/(?:${NORMALIZED_LESSON_SLUG_GROUP})/${verb}$`);
const NORMALIZED_LESSON_STATUS_PATH = normalizedLessonPathFor('status');
const NORMALIZED_LESSON_START_PATH = normalizedLessonPathFor('start');
const NORMALIZED_LESSON_RUN_PATH = normalizedLessonPathFor('run');
const NORMALIZED_LESSON_COMMANDS_PATH = normalizedLessonPathFor('commands');
const NORMALIZED_LESSON_SLUG_PATH = /^\/v1\/lessons\/([a-z0-9-]+)\/(?:status|start|run|commands)$/;

/**
 * The catalog lesson id a normalized-lesson request targets, or null when the
 * slug is unregistered (including L1's own slug). The route match already
 * guarantees a registered slug for a matched `normalizedLesson*` route; this is
 * how the handler recovers the lesson id from the path to drive the engine.
 */
export function normalizedLessonIdFor(path: string): string | null {
  const slug = NORMALIZED_LESSON_SLUG_PATH.exec(path)?.[1];
  if (slug === undefined) return null;
  return NORMALIZED_LESSON_ROUTE_SLUGS[slug] ?? null;
}

function routeMatches(route: RouteDefinition, path: string): boolean {
  if (route.id === 'practiceItem') return PRACTICE_ITEM_PATH.test(path);
  if (route.id === 'practiceQueue') return PRACTICE_QUEUE_PATH.test(path);
  if (route.id === 'mistakesRepair') return MISTAKES_REPAIR_PATH.test(path);
  if (route.id === 'passageToday') return PASSAGE_TODAY_PATH.test(path);
  if (route.id === 'normalizedLessonStatus') return NORMALIZED_LESSON_STATUS_PATH.test(path);
  if (route.id === 'normalizedLessonStart') return NORMALIZED_LESSON_START_PATH.test(path);
  if (route.id === 'normalizedLessonRun') return NORMALIZED_LESSON_RUN_PATH.test(path);
  if (route.id === 'normalizedLessonCommand') return NORMALIZED_LESSON_COMMANDS_PATH.test(path);
  return route.path === path;
}

/** The learner's timezone offset (minutes) from the passage-today path, or null. */
export function passageTzFromPath(path: string): number | null {
  const match = PASSAGE_TODAY_PATH.exec(path);
  if (match === null) return null;
  const tz = Number.parseInt(match[1]!, 10);
  return Number.isFinite(tz) && Math.abs(tz) <= 1440 ? tz : null;
}

/** Extract the requested repair-item cap from the repair-queue path (null when absent/invalid). */
export function mistakesRepairLimit(path: string): number | null {
  const match = MISTAKES_REPAIR_PATH.exec(path);
  if (match === null) return null;
  const limit = Number.parseInt(match[1]!, 10);
  return Number.isInteger(limit) && limit >= 1 ? limit : null;
}

export function practiceQuestionId(path: string): ContentId | null {
  const value = PRACTICE_ITEM_PATH.exec(path)?.[1];
  const parsed = ContentIdSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export interface PracticeQueueParams {
  readonly x: number;
  readonly focus: string | null;
}

/** Extract the requested count (+ optional focus token) from the queue path. */
export function practiceQueueParams(path: string): PracticeQueueParams | null {
  const match = PRACTICE_QUEUE_PATH.exec(path);
  if (match === null) return null;
  const x = Number.parseInt(match[1]!, 10);
  if (!Number.isInteger(x) || x < 1) return null;
  const rawFocus = match[2];
  if (rawFocus === undefined) return { x, focus: null };
  const focus = PracticeFocusSchema.safeParse(rawFocus);
  return focus.success ? { x, focus: focus.data } : null;
}
