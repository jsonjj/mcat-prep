import { z } from 'zod';
import {
  LessonRunIdSchema,
  V3ActivityIdSchema,
  V3KcIdSchema,
  V3LessonIdSchema,
  V3RepresentationIdSchema,
} from './ids';
import {
  LessonActivityPhaseSchema,
  LessonDefinitionVersionSchema,
  LessonFeedbackEntrySchema,
  LessonRouteSchema,
} from './lesson-run';
import { AssistanceLevelSchema } from './vocab';

/** Strict browser-safe representation. It cannot encode evaluation keys or diagnostic mappings. */
export const LearnerLessonRepresentationSchema = z
  .object({
    id: V3RepresentationIdSchema,
    kind: z.enum([
      'text',
      'equation',
      'table',
      'diagram',
      'graph',
      'animation',
      'audio',
      'video',
      'simulation',
    ]),
    label: z.string().min(1),
    body: z.array(z.string().min(1)),
    altText: z.string().min(1).nullable(),
    longDescription: z.string().min(1).nullable(),
    table: z
      .object({
        caption: z.string().min(1),
        columns: z.array(z.string().min(1)).min(1),
        rows: z.array(z.array(z.string())).min(1),
      })
      .strict()
      .nullable(),
  })
  .strict();
export type LearnerLessonRepresentation = z.infer<
  typeof LearnerLessonRepresentationSchema
>;

export const LearnerLessonResponseSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('none') }).strict(),
  z
    .object({
      kind: z.literal('choice'),
      legend: z.string().min(1),
      choices: z
        .array(
          z
            .object({
              id: z.string().min(1),
              label: z.string().min(1),
            })
            .strict(),
        )
        .min(2),
      allowNotSure: z.boolean(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('text'),
      label: z.string().min(1),
      placeholder: z.string().min(1).nullable(),
      allowNotSure: z.boolean(),
    })
    .strict(),
]);
export type LearnerLessonResponse = z.infer<typeof LearnerLessonResponseSchema>;

export const LearnerLessonActivitySchema = z
  .object({
    id: V3ActivityIdSchema,
    kcId: V3KcIdSchema,
    phase: LessonActivityPhaseSchema,
    title: z.string().min(1),
    prompt: z.string().min(1).nullable(),
    instructions: z.array(z.string().min(1)),
    representations: z.array(LearnerLessonRepresentationSchema),
    response: LearnerLessonResponseSchema,
    assistance: z
      .object({
        currentLevel: AssistanceLevelSchema,
        visibleHint: z.string().min(1).nullable(),
        canRequestMore: z.boolean(),
      })
      .strict(),
    feedback: z
      .object({
        sealed: z.boolean(),
        entries: z.array(LessonFeedbackEntrySchema),
      })
      .strict()
      .nullable(),
  })
  .strict();
export type LearnerLessonActivity = z.infer<typeof LearnerLessonActivitySchema>;

export const LessonRunnerActionSchema = z.enum([
  'present',
  'submit_response',
  'continue',
  'request_assistance',
  'pause',
  'resume',
]);
export type LessonRunnerActionName = z.infer<typeof LessonRunnerActionSchema>;

const LessonStepCommonShape = {
  kind: z.literal('v3_lesson'),
  schemaVersion: z.literal('1.0'),
  runId: LessonRunIdSchema,
  lessonId: V3LessonIdSchema,
  definitionVersion: LessonDefinitionVersionSchema,
  lessonTitle: z.string().min(1),
  kcId: V3KcIdSchema.nullable(),
  kcTitle: z.string().min(1).nullable(),
  route: LessonRouteSchema.nullable(),
  progress: z
    .object({
      kcOrdinal: z.number().int().positive().nullable(),
      kcCount: z.number().int().positive(),
      exitedKcCount: z.number().int().nonnegative(),
    })
    .strict(),
};

export const ActiveLessonStepViewSchema = z
  .object({
    ...LessonStepCommonShape,
    status: z.literal('active'),
    activity: LearnerLessonActivitySchema,
    availableActions: z.array(LessonRunnerActionSchema),
    message: z.string().min(1).nullable(),
  })
  .strict();

export const WaitingLessonStepViewSchema = z
  .object({
    ...LessonStepCommonShape,
    status: z.enum(['route_pending', 'feedback_pending', 'repair_pending']),
    activity: LearnerLessonActivitySchema.nullable(),
    availableActions: z.array(LessonRunnerActionSchema),
    message: z.string().min(1),
  })
  .strict();

export const PausedLessonStepViewSchema = z
  .object({
    ...LessonStepCommonShape,
    status: z.literal('paused'),
    activity: z.null(),
    availableActions: z.array(LessonRunnerActionSchema),
    message: z.string().min(1),
    plannerReentryRequired: z.boolean(),
  })
  .strict();

export const CompleteLessonStepViewSchema = z
  .object({
    ...LessonStepCommonShape,
    status: z.literal('complete'),
    activity: z.null(),
    availableActions: z.array(LessonRunnerActionSchema),
    message: z.string().min(1),
    completion: z
      .object({
        kind: z.literal('lesson_completion'),
        instructionalExitKcIds: z.array(V3KcIdSchema),
      })
      .strict(),
  })
  .strict();

export const HandoffLessonStepViewSchema = z
  .object({
    ...LessonStepCommonShape,
    status: z.literal('handoff'),
    activity: z.null(),
    availableActions: z.array(LessonRunnerActionSchema),
    message: z.string().min(1),
    nextRunId: LessonRunIdSchema,
  })
  .strict();

export const InvalidLessonStepViewSchema = z
  .object({
    ...LessonStepCommonShape,
    status: z.enum(['invalid_content', 'blocked']),
    activity: z.null(),
    availableActions: z.array(LessonRunnerActionSchema),
    message: z.string().min(1),
    issueCodes: z.array(z.string().min(1)),
  })
  .strict();

export const LessonStepViewSchema = z.discriminatedUnion('status', [
  ActiveLessonStepViewSchema,
  WaitingLessonStepViewSchema,
  PausedLessonStepViewSchema,
  CompleteLessonStepViewSchema,
  HandoffLessonStepViewSchema,
  InvalidLessonStepViewSchema,
]);
export type LessonStepView = z.infer<typeof LessonStepViewSchema>;
