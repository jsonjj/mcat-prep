import {
  AttemptCommandSchema,
  CarsDuelRubricSchema,
  CarsReadinessViewSchema,
  ChoiceIdSchema,
  CommandEnvelopeSchema,
  ContentIdSchema,
  DiagnosticNextSchema,
  ErrorEntryViewSchema,
  GoalCommandSchema,
  LessonMasteryViewSchema,
  MasteryMapEntrySchema,
  MasterySeedSchema,
  MistakePatternViewSchema,
  PracticeAttemptCommandSchema,
  PracticeAttemptResultSchema,
  PracticeFocusSchema,
  PracticeItemViewSchema,
  PracticeQueueViewSchema,
  PracticeResultSchema,
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
  type CarsDuelRubric,
  type ChoiceId,
  type CommandEnvelope,
  type ContentId,
  type MasterySeed,
  type PracticeAttemptCommand,
} from '@mcat/contracts';

export type RouteId =
  | 'health'
  | 'bootstrap'
  | 'diagnosticNext'
  | 'goal'
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
  | 'masterySeed'
  | 'wrapped'
  | 'resetProgress'
  | 'today'
  | 'session'
  | 'mastery'
  | 'progressSkills'
  | 'progressLessons'
  | 'progressCars'
  | 'errors'
  | 'errorPatterns'
  | 'vectorLessonStatus'
  | 'vectorLessonStart'
  | 'vectorLessonRun'
  | 'vectorLessonCommand';

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

export interface CarsDuelCommandBody {
  readonly envelope: CommandEnvelope;
  readonly rubric?: CarsDuelRubric;
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

const CarsDuelCommandBodySchema = workflowSchema<CarsDuelCommandBody>((value) => {
  // Accept an envelope alone, or an envelope plus an optional formative rubric.
  if (!Object.keys(value).every((key) => key === 'envelope' || key === 'rubric')) return null;
  const envelope = CommandEnvelopeSchema.safeParse(value.envelope);
  if (!envelope.success) return null;
  if (!('rubric' in value)) return { envelope: envelope.data };
  const rubric = CarsDuelRubricSchema.safeParse(value.rubric);
  return rubric.success ? { envelope: envelope.data, rubric: rubric.data } : null;
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
    if (!exactKeys(value, ['envelope', 'questionId', 'specId', 'chosenChoiceId', 'firstAttempt'])) {
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
    id: 'errorPatterns',
    method: 'GET',
    path: '/v1/errors/patterns',
    auth: 'session',
    stateChanging: false,
    responseSchema: MistakePatternViewSchema.array(),
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
] as const;

export function routeFor(method: string, path: string): RouteDefinition | undefined {
  return ROUTES.find((route) => route.method === method && routeMatches(route, path));
}

export function allowedMethodsFor(path: string): readonly string[] {
  return ROUTES.filter((route) => routeMatches(route, path)).map((route) => route.method);
}

const PRACTICE_ITEM_PATH = /^\/v1\/practice\/items\/([a-z0-9]+(?:-[a-z0-9]+)*)$/;
const PRACTICE_QUEUE_PATH = /^\/v1\/practice\/queue\/(\d{1,2})(?:\/([a-z0-9-]{1,32}))?$/;

function routeMatches(route: RouteDefinition, path: string): boolean {
  if (route.id === 'practiceItem') return PRACTICE_ITEM_PATH.test(path);
  if (route.id === 'practiceQueue') return PRACTICE_QUEUE_PATH.test(path);
  return route.path === path;
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
