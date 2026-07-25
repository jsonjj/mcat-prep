import { z } from 'zod';
import { CommandEnvelopeSchema, ChoiceIdSchema } from './commands';

export const VectorLessonIdSchema = z.literal('V3-LES-130923');
export type VectorLessonId = z.infer<typeof VectorLessonIdSchema>;

export const VectorLessonRunStateSchema = z.enum([
  'NOT_STARTED',
  'IN_PROGRESS',
  'PAUSED',
  'BLOCKED',
  'DELIVERY_COMPLETE',
]);
export type VectorLessonRunState = z.infer<typeof VectorLessonRunStateSchema>;

export const VectorLessonStartCommandSchema = z
  .object({
    envelope: CommandEnvelopeSchema,
    lessonId: VectorLessonIdSchema,
  })
  .strict();
export type VectorLessonStartCommand = z.infer<typeof VectorLessonStartCommandSchema>;

export const VectorLessonStartResponseSchema = z
  .object({
    runId: z.string().uuid(),
    disposition: z.enum(['STARTED', 'RESUMED', 'ALREADY_COMPLETE']),
    path: z.literal('/app/lessons/vectors-and-trigonometry'),
    streamVersion: z.number().int().nonnegative(),
  })
  .strict();
export type VectorLessonStartResponse = z.infer<typeof VectorLessonStartResponseSchema>;

export const VectorLessonStatusViewSchema = z
  .object({
    availability: z.enum(['AVAILABLE', 'UNAVAILABLE']),
    runState: VectorLessonRunStateSchema,
    actionLabel: z.enum(['Start', 'Continue']).nullable(),
  })
  .strict()
  .superRefine((value, context) => {
    const expectedAction =
      value.availability === 'UNAVAILABLE'
        ? null
        : value.runState === 'NOT_STARTED'
          ? 'Start'
          : value.runState === 'BLOCKED'
            ? null
            : 'Continue';
    if (value.actionLabel !== expectedAction) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Lesson status and action label are inconsistent.',
        path: ['actionLabel'],
      });
    }
  });
export type VectorLessonStatusView = z.infer<typeof VectorLessonStatusViewSchema>;

const VectorLessonProgressSchema = z
  .object({
    currentPart: z.number().int().min(1).max(3),
    totalParts: z.literal(3),
    currentPartLabel: z.string().min(1),
    stageLabel: z.string().min(1),
  })
  .strict();

export const VectorLessonVisualSchema = z
  .object({
    kind: z.enum(['COMPONENTS', 'RIGHT_TRIANGLE', 'DIRECTIONAL']),
    title: z.string().min(1),
    textEquivalent: z.string().min(1),
    tokens: z
      .array(
        z
          .object({
            label: z.string().min(1),
            value: z.string().min(1),
          })
          .strict(),
      )
      .max(8),
  })
  .strict();
export type VectorLessonVisual = z.infer<typeof VectorLessonVisualSchema>;

const ContentScreenSchema = z
  .object({
    kind: z.literal('CONTENT'),
    screenToken: z.string().min(1),
    heading: z.string().min(1),
    body: z.array(z.string().min(1)).min(1),
    primaryActionLabel: z.string().min(1),
    visual: VectorLessonVisualSchema.nullable(),
  })
  .strict();

const QuestionScreenSchema = z
  .object({
    kind: z.literal('QUESTION'),
    screenToken: z.string().min(1),
    heading: z.string().min(1),
    prompt: z.string().min(1),
    choices: z
      .array(
        z
          .object({
            id: ChoiceIdSchema,
            text: z.string().min(1),
          })
          .strict(),
      )
      .length(4),
    primaryActionLabel: z.string().min(1),
    supportActionLabel: z.string().min(1).nullable(),
    support: z
      .object({
        label: z.string().min(1),
        text: z.string().min(1),
      })
      .strict()
      .nullable(),
    visual: VectorLessonVisualSchema.nullable(),
  })
  .strict();

const FeedbackScreenSchema = z
  .object({
    kind: z.literal('FEEDBACK'),
    screenToken: z.string().min(1),
    heading: z.string().min(1),
    outcome: z.enum(['CORRECT', 'TRY_A_DIFFERENT_ANGLE', 'REPAIR_CONFIRMED', 'REPAIR_EXHAUSTED']),
    body: z.array(z.string().min(1)).min(1),
    primaryActionLabel: z.string().min(1),
  })
  .strict();

const CompletionScreenSchema = z
  .object({
    kind: z.literal('COMPLETION'),
    screenToken: z.string().min(1),
    heading: z.literal('You finished this lesson’s required instruction.'),
    body: z.array(z.string().min(1)).max(2),
    primaryActionLabel: z.literal('Back to curriculum'),
  })
  .strict();

const BlockedScreenSchema = z
  .object({
    kind: z.literal('BLOCKED'),
    screenToken: z.string().min(1),
    heading: z.literal('This lesson is paused here.'),
    body: z.array(z.string().min(1)).min(1).max(2),
    primaryActionLabel: z.literal('Back to curriculum'),
  })
  .strict();

const PausedScreenSchema = z
  .object({
    kind: z.literal('PAUSED'),
    screenToken: z.string().min(1),
    heading: z.literal('This lesson is paused.'),
    body: z.array(z.string().min(1)).min(1).max(2),
    primaryActionLabel: z.literal('Back to curriculum'),
  })
  .strict();

export const VectorLessonScreenSchema = z.discriminatedUnion('kind', [
  ContentScreenSchema,
  QuestionScreenSchema,
  FeedbackScreenSchema,
  CompletionScreenSchema,
  BlockedScreenSchema,
  PausedScreenSchema,
]);
export type VectorLessonScreen = z.infer<typeof VectorLessonScreenSchema>;

export const VectorLessonRunViewSchema = z
  .object({
    lessonTitle: z.literal('Vectors and Trigonometry'),
    runId: z.string().uuid(),
    state: z.enum(['IN_PROGRESS', 'PAUSED', 'BLOCKED', 'DELIVERY_COMPLETE']),
    progress: VectorLessonProgressSchema,
    screen: VectorLessonScreenSchema,
  })
  .strict()
  .superRefine((value, context) => {
    const expectedScreenKind = {
      PAUSED: 'PAUSED',
      BLOCKED: 'BLOCKED',
      DELIVERY_COMPLETE: 'COMPLETION',
    } as const;
    const expected = value.state === 'IN_PROGRESS' ? null : expectedScreenKind[value.state];
    const valid =
      expected === null
        ? !['PAUSED', 'BLOCKED', 'COMPLETION'].includes(value.screen.kind)
        : value.screen.kind === expected;
    if (!valid) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Lesson run state and screen kind are inconsistent.',
        path: ['screen', 'kind'],
      });
    }
  });
export type VectorLessonRunView = z.infer<typeof VectorLessonRunViewSchema>;

const VectorLessonActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('CONTINUE') }).strict(),
  z
    .object({
      type: z.literal('SUBMIT_RESPONSE'),
      choiceId: ChoiceIdSchema.nullable(),
    })
    .strict(),
  z.object({ type: z.literal('REQUEST_SUPPORT') }).strict(),
  z.object({ type: z.literal('PAUSE') }).strict(),
]);
export type VectorLessonAction = z.infer<typeof VectorLessonActionSchema>;

export const VectorLessonCommandSchema = z
  .object({
    envelope: CommandEnvelopeSchema,
    runId: z.string().uuid(),
    screenToken: z.string().min(1),
    action: VectorLessonActionSchema,
  })
  .strict();
export type VectorLessonCommand = z.infer<typeof VectorLessonCommandSchema>;
