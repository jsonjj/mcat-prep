import { z } from 'zod';
import {
  EventIdSchema,
  IdempotencyKeySchema,
  LessonRunIdSchema,
  V3ActivityIdSchema,
  V3KcIdSchema,
  V3LessonIdSchema,
} from './ids';
import { UtcTimestampSchema } from './time';
import { PolicyVersionSchema } from './versioning';
import { AssistanceLevelSchema } from './vocab';

/** Version pin for a canonical lesson definition, not a publication claim. */
export const LessonDefinitionVersionSchema = z
  .string()
  .regex(/^\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?$/, 'semantic lesson definition version');
export type LessonDefinitionVersion = z.infer<typeof LessonDefinitionVersionSchema>;

export const LessonRouteSchema = z.enum(['concise', 'standard', 'prerequisite', 'misconception']);
export type LessonRoute = z.infer<typeof LessonRouteSchema>;

export const LessonActivityPhaseSchema = z.enum([
  'enter_routing',
  'orient_elicit',
  'build_model',
  'show_expert_decisions',
  'completion',
  'contrast_bound',
  'exit_near',
  'exit_changed',
  'targeted_repair',
  'handoff',
]);
export type LessonActivityPhase = z.infer<typeof LessonActivityPhaseSchema>;

export const LessonResponseOutcomeSchema = z.enum(['correct', 'incorrect', 'not_sure']);
export type LessonResponseOutcome = z.infer<typeof LessonResponseOutcomeSchema>;

export const LessonRunPinsSchema = z
  .object({
    runId: LessonRunIdSchema,
    lessonId: V3LessonIdSchema,
    definitionVersion: LessonDefinitionVersionSchema,
    contentRelease: z.string().min(1),
    policies: z.array(PolicyVersionSchema).min(1),
  })
  .strict();
export type LessonRunPins = z.infer<typeof LessonRunPinsSchema>;

export const LessonFeedbackEntrySchema = z
  .object({
    activityId: V3ActivityIdSchema,
    tone: z.enum(['correct', 'incorrect', 'information']),
    message: z.string().min(1),
  })
  .strict();
export type LessonFeedbackEntry = z.infer<typeof LessonFeedbackEntrySchema>;

export const LessonRunStatusSchema = z.enum([
  'ready',
  'active',
  'awaiting_route',
  'awaiting_exit_feedback',
  'awaiting_repair',
  'paused',
  'complete',
  'handoff',
  'invalid_content',
  'blocked',
]);
export type LessonRunStatus = z.infer<typeof LessonRunStatusSchema>;

export const FamilyExposureSchema = z
  .object({
    familyId: z.string().min(1),
    activityIds: z.array(V3ActivityIdSchema).min(1),
    firstSeenSequence: z.number().int().nonnegative(),
    revealed: z.boolean(),
    feedbackSeen: z.boolean(),
  })
  .strict();
export type FamilyExposure = z.infer<typeof FamilyExposureSchema>;

export const SignalEvidenceSchema = z
  .object({
    signalId: z.string().min(1),
    familyIds: z.array(z.string().min(1)).min(1),
  })
  .strict();
export type SignalEvidence = z.infer<typeof SignalEvidenceSchema>;

export const ExitCheckResultSchema = z
  .object({
    activityId: V3ActivityIdSchema,
    familyId: z.string().min(1),
    role: z.enum(['near', 'changed']),
    outcome: LessonResponseOutcomeSchema,
    passedUnsupported: z.boolean(),
    contamination: z
      .enum([
        'none',
        'prior_family_exposure',
        'paired_family_reuse',
        'revealed',
        'assisted',
        'support_not_a0',
      ])
      .nullable(),
  })
  .strict();
export type ExitCheckResult = z.infer<typeof ExitCheckResultSchema>;

export const LessonRunStateSchema = z
  .object({
    schemaVersion: z.literal('1.0'),
    pins: LessonRunPinsSchema,
    status: LessonRunStatusSchema,
    currentKcId: V3KcIdSchema.nullable(),
    currentActivityId: V3ActivityIdSchema.nullable(),
    phase: LessonActivityPhaseSchema.nullable(),
    route: LessonRouteSchema.nullable(),
    sequenceActivityIds: z.array(V3ActivityIdSchema),
    sequencePosition: z.number().int().nonnegative(),
    assistanceLevel: AssistanceLevelSchema,
    consecutiveUnsupportedSuccesses: z.number().int().nonnegative(),
    repairCycles: z.number().int().min(0).max(2),
    exitedKcIds: z.array(V3KcIdSchema),
    signals: z.array(SignalEvidenceSchema),
    exposures: z.array(FamilyExposureSchema),
    activePresentation: z
      .object({
        activityId: V3ActivityIdSchema,
        familyId: z.string().min(1),
        freshAtPresentation: z.boolean(),
      })
      .strict()
      .nullable(),
    lastResponse: z
      .object({
        activityId: V3ActivityIdSchema,
        outcome: LessonResponseOutcomeSchema,
        assisted: z.boolean(),
        revealed: z.boolean(),
      })
      .strict()
      .nullable(),
    sealedExitResults: z.array(ExitCheckResultSchema).max(2),
    visibleAssistanceLevel: AssistanceLevelSchema.nullable(),
    feedback: z
      .object({
        sealed: z.boolean(),
        entries: z.array(LessonFeedbackEntrySchema),
      })
      .strict()
      .nullable(),
    resumeStatus: z
      .enum(['active', 'awaiting_route', 'awaiting_exit_feedback', 'awaiting_repair'])
      .nullable(),
    pauseReason: z.enum(['learner', 'interruption', 'repair_exhausted']).nullable(),
    plannerReentryRequired: z.boolean(),
    handoffRunId: LessonRunIdSchema.nullable(),
    appliedEventIds: z.array(EventIdSchema),
    appliedIdempotencyKeys: z.array(IdempotencyKeySchema),
    lastSequence: z.number().int().min(-1),
    invalidIssues: z.array(z.string().min(1)),
    transitionErrors: z.array(z.string().min(1)),
  })
  .strict();
export type LessonRunState = z.infer<typeof LessonRunStateSchema>;

const LessonRunEventBaseSchema = z
  .object({
    schemaVersion: z.literal('1.0'),
    eventId: EventIdSchema,
    idempotencyKey: IdempotencyKeySchema,
    runId: LessonRunIdSchema,
    lessonId: V3LessonIdSchema,
    definitionVersion: LessonDefinitionVersionSchema,
    contentRelease: z.string().min(1),
    policies: z.array(PolicyVersionSchema).min(1),
    sequence: z.number().int().nonnegative(),
    occurredAt: UtcTimestampSchema,
  })
  .strict();

const withEvent = <TType extends string, T extends z.ZodRawShape>(
  type: TType,
  payload: z.ZodObject<T>,
) =>
  LessonRunEventBaseSchema.extend({
    type: z.literal(type),
    payload: payload.strict(),
  }).strict();

export const LessonRunStartedEventSchema = withEvent('lesson_run_started', z.object({}));

export const LessonActivityPresentedEventSchema = withEvent(
  'lesson_activity_presented',
  z.object({
    kcId: V3KcIdSchema,
    activityId: V3ActivityIdSchema,
    familyId: z.string().min(1),
  }),
);

export const LessonResponseEvaluatedEventSchema = withEvent(
  'lesson_response_evaluated',
  z.object({
    kcId: V3KcIdSchema,
    activityId: V3ActivityIdSchema,
    familyId: z.string().min(1),
    outcome: LessonResponseOutcomeSchema,
    assistanceLevel: AssistanceLevelSchema,
    assisted: z.boolean(),
    revealed: z.boolean(),
    diagnosticSignalIds: z.array(z.string().min(1)),
    feedback: z.array(LessonFeedbackEntrySchema).optional(),
  }),
);

export const LessonActivityCompletedEventSchema = withEvent(
  'lesson_activity_completed',
  z.object({
    kcId: V3KcIdSchema,
    activityId: V3ActivityIdSchema,
  }),
);

export const LessonRouteSelectedEventSchema = withEvent(
  'lesson_route_selected',
  z.object({
    kcId: V3KcIdSchema,
    route: LessonRouteSchema,
  }),
);

export const LessonAssistanceRevealedEventSchema = withEvent(
  'lesson_assistance_revealed',
  z.object({
    kcId: V3KcIdSchema,
    activityId: V3ActivityIdSchema,
    level: AssistanceLevelSchema,
  }),
);

export const LessonExitFeedbackReleasedEventSchema = withEvent(
  'lesson_exit_feedback_released',
  z.object({
    kcId: V3KcIdSchema,
    feedback: z.array(LessonFeedbackEntrySchema).length(2),
  }),
);

export const LessonRepairStartedEventSchema = withEvent(
  'lesson_repair_started',
  z.object({
    kcId: V3KcIdSchema,
    repairRouteId: z.string().min(1),
  }),
);

export const KcInstructionalExitEventSchema = withEvent(
  'kc_instructional_exit',
  z.object({
    kcId: V3KcIdSchema,
  }),
);

export const LessonRunPausedEventSchema = withEvent(
  'lesson_run_paused',
  z.object({
    reason: z.enum(['learner', 'interruption']),
  }),
);

export const LessonRunResumedEventSchema = withEvent('lesson_run_resumed', z.object({}));

export const LessonPlannerReentryHandoffEventSchema = withEvent(
  'lesson_planner_reentry_handoff',
  z.object({
    nextRunId: LessonRunIdSchema,
  }),
);

export const LessonInvalidContentDetectedEventSchema = withEvent(
  'lesson_invalid_content_detected',
  z.object({
    issueCodes: z.array(z.string().min(1)).min(1),
  }),
);

export const LessonRunEventSchema = z.discriminatedUnion('type', [
  LessonRunStartedEventSchema,
  LessonActivityPresentedEventSchema,
  LessonResponseEvaluatedEventSchema,
  LessonActivityCompletedEventSchema,
  LessonRouteSelectedEventSchema,
  LessonAssistanceRevealedEventSchema,
  LessonExitFeedbackReleasedEventSchema,
  LessonRepairStartedEventSchema,
  KcInstructionalExitEventSchema,
  LessonRunPausedEventSchema,
  LessonRunResumedEventSchema,
  LessonPlannerReentryHandoffEventSchema,
  LessonInvalidContentDetectedEventSchema,
]);
export type LessonRunEvent = z.infer<typeof LessonRunEventSchema>;

/** Raw learner response accepted only by the authority command boundary. */
export const LessonActivityResponseInputSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('choice'), choiceId: z.string().min(1) }).strict(),
  z.object({ kind: z.literal('text'), text: z.string().min(1).max(10_000) }).strict(),
  z.object({ kind: z.literal('not_sure') }).strict(),
]);
export type LessonActivityResponseInput = z.infer<typeof LessonActivityResponseInputSchema>;
