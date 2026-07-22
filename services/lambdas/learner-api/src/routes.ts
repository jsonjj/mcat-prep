import {
  AttemptCommandSchema,
  ErrorEntryViewSchema,
  GoalCommandSchema,
  MasteryMapEntrySchema,
  StudyStepViewSchema,
  TodayViewSchema,
} from '@mcat/contracts';

export type RouteId =
  | 'health'
  | 'bootstrap'
  | 'goal'
  | 'attempt'
  | 'today'
  | 'session'
  | 'mastery'
  | 'errors';

interface RuntimeSchema<T = unknown> {
  parse(value: unknown): T;
  safeParse(value: unknown): { success: true; data: T } | { success: false };
}

export interface RouteDefinition {
  readonly id: RouteId;
  readonly method: 'GET' | 'POST' | 'PUT';
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
    id: 'errors',
    method: 'GET',
    path: '/v1/errors',
    auth: 'session',
    stateChanging: false,
    responseSchema: ErrorEntryViewSchema.array(),
  },
] as const;

export function routeFor(method: string, path: string): RouteDefinition | undefined {
  return ROUTES.find((route) => route.method === method && route.path === path);
}

export function allowedMethodsFor(path: string): readonly string[] {
  return ROUTES.filter((route) => route.path === path).map((route) => route.method);
}
