import { z } from 'zod';
import {
  LessonRunIdSchema,
  V3ActivityIdSchema,
  V3KcIdSchema,
  V3LessonIdSchema,
  V3RepresentationIdSchema,
} from './ids';
import {
  GroupedLessonFeedbackSchema,
  LessonActivityPhaseSchema,
  LessonDefinitionVersionSchema,
  LessonFeedbackEntrySchema,
  LessonRouteSchema,
} from './lesson-run';
import { AssistanceLevelSchema } from './vocab';

const RepresentationAlternativeSchema = z
  .object({
    shortText: z.string().min(1),
    longDescription: z.string().min(1),
  })
  .strict();

export const LessonTableSpecSchema = z
  .object({
    caption: z.string().min(1),
    columns: z.array(z.string().min(1)).min(1),
    rows: z.array(z.array(z.string())).min(1),
  })
  .strict()
  .superRefine((table, ctx) => {
    table.rows.forEach((row, index) => {
      if (row.length !== table.columns.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['rows', index],
          message: 'table row width must match column count',
        });
      }
    });
  });

export const LessonDiagramSpecSchema = z
  .object({
    width: z.number().positive().max(2_000),
    height: z.number().positive().max(2_000),
    nodes: z
      .array(
        z
          .object({
            id: z.string().regex(/^[a-z][a-z0-9_-]*$/),
            label: z.string().min(1),
            description: z.string().min(1),
            x: z.number().finite(),
            y: z.number().finite(),
            shape: z.enum(['circle', 'rectangle']),
            tone: z.enum(['neutral', 'accent', 'positive', 'warning']),
          })
          .strict(),
      )
      .min(1),
    edges: z.array(
      z
        .object({
          from: z.string().min(1),
          to: z.string().min(1),
          label: z.string().min(1).nullable(),
          directed: z.boolean(),
        })
        .strict(),
    ),
  })
  .strict()
  .superRefine((diagram, ctx) => {
    const nodeIds = new Set(diagram.nodes.map((node) => node.id));
    if (nodeIds.size !== diagram.nodes.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['nodes'],
        message: 'diagram node IDs must be unique',
      });
    }
    diagram.nodes.forEach((node, index) => {
      const horizontalRadius = node.shape === 'circle' ? 36 : 54;
      const verticalRadius = node.shape === 'circle' ? 36 : 30;
      if (
        node.x - horizontalRadius < 0 ||
        node.x + horizontalRadius > diagram.width ||
        node.y - verticalRadius < 0 ||
        node.y + verticalRadius > diagram.height
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['nodes', index],
          message: 'diagram nodes must fit completely inside the declared view bounds',
        });
      }
    });
    diagram.edges.forEach((edge, index) => {
      if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['edges', index],
          message: 'diagram edge endpoints must reference declared nodes',
        });
      }
    });
  });

const LessonChartAxisSchema = z
  .object({
    label: z.string().min(1),
    unit: z.string().min(1).nullable(),
    min: z.number().finite(),
    max: z.number().finite(),
  })
  .strict()
  .refine((axis) => axis.max > axis.min, 'chart axis max must exceed min');

export const LessonChartSpecSchema = z
  .object({
    chartType: z.enum(['line', 'scatter', 'bar']),
    xAxis: LessonChartAxisSchema,
    yAxis: LessonChartAxisSchema,
    series: z
      .array(
        z
          .object({
            id: z.string().regex(/^[a-z][a-z0-9_-]*$/),
            label: z.string().min(1),
            points: z
              .array(
                z
                  .object({
                    x: z.number().finite(),
                    y: z.number().finite(),
                    label: z.string().min(1).nullable(),
                  })
                  .strict(),
              )
              .min(1),
          })
          .strict(),
      )
      .min(1),
    dataTable: LessonTableSpecSchema,
  })
  .strict()
  .superRefine((chart, ctx) => {
    const seriesIds = chart.series.map((series) => series.id);
    if (new Set(seriesIds).size !== seriesIds.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['series'],
        message: 'chart series IDs must be unique',
      });
    }
    chart.series.forEach((series, seriesIndex) => {
      series.points.forEach((point, pointIndex) => {
        if (
          point.x < chart.xAxis.min ||
          point.x > chart.xAxis.max ||
          point.y < chart.yAxis.min ||
          point.y > chart.yAxis.max
        ) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['series', seriesIndex, 'points', pointIndex],
            message: 'chart points must remain inside the declared axes',
          });
        }
      });
    });
    if (chart.chartType === 'bar' && chart.yAxis.min !== 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['yAxis', 'min'],
        message: 'bar charts require a nonnegative zero baseline',
      });
    }
  });

export const LessonSimulationSpecSchema = z
  .object({
    adapter: z.literal('linear_relationship'),
    input: z
      .object({
        id: z.string().regex(/^[a-z][a-z0-9_-]*$/),
        label: z.string().min(1),
        min: z.number().finite(),
        max: z.number().finite(),
        step: z.number().positive(),
        initial: z.number().finite(),
        unit: z.string().min(1).nullable(),
      })
      .strict(),
    outputs: z
      .array(
        z
          .object({
            id: z.string().regex(/^[a-z][a-z0-9_-]*$/),
            label: z.string().min(1),
            slope: z.number().finite(),
            intercept: z.number().finite(),
            unit: z.string().min(1).nullable(),
            decimals: z.number().int().min(0).max(6),
          })
          .strict(),
      )
      .min(1),
  })
  .strict()
  .superRefine((simulation, ctx) => {
    const { input } = simulation;
    if (input.max <= input.min || input.initial < input.min || input.initial > input.max) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['input'],
        message: 'simulation input range and initial value must be valid',
      });
    }
  });

export const SafeLessonAssetRefSchema = z
  .string()
  .regex(
    /^\/lesson-assets\/[a-z0-9][a-z0-9/_-]*\.(?:mp3|m4a|ogg|wav|mp4|webm)$/,
    'reviewed lesson assets must use a local /lesson-assets path',
  );
export const SafeLessonCaptionsRefSchema = z
  .string()
  .regex(
    /^\/lesson-assets\/[a-z0-9][a-z0-9/_-]*\.vtt$/,
    'reviewed captions must use a local /lesson-assets .vtt path',
  );

const RepresentationCommonShape = {
  id: V3RepresentationIdSchema,
  label: z.string().min(1),
};

/** Strict browser-safe representations; none can encode HTML, script, or evaluation keys. */
export const LearnerLessonRepresentationSchema = z.discriminatedUnion('kind', [
  z
    .object({
      ...RepresentationCommonShape,
      kind: z.literal('text'),
      paragraphs: z.array(z.string().min(1)).min(1),
    })
    .strict(),
  z
    .object({
      ...RepresentationCommonShape,
      kind: z.literal('equation'),
      expression: z.string().min(1),
      spoken: z.string().min(1),
      variables: z.array(
        z
          .object({
            symbol: z.string().min(1),
            meaning: z.string().min(1),
            unit: z.string().min(1).nullable(),
          })
          .strict(),
      ),
    })
    .strict(),
  z
    .object({
      ...RepresentationCommonShape,
      kind: z.literal('table'),
      table: LessonTableSpecSchema,
    })
    .strict(),
  z
    .object({
      ...RepresentationCommonShape,
      kind: z.literal('diagram'),
      alternative: RepresentationAlternativeSchema,
      diagram: LessonDiagramSpecSchema,
    })
    .strict(),
  z
    .object({
      ...RepresentationCommonShape,
      kind: z.literal('chart'),
      alternative: RepresentationAlternativeSchema,
      chart: LessonChartSpecSchema,
    })
    .strict(),
  z
    .object({
      ...RepresentationCommonShape,
      kind: z.literal('simulation'),
      alternative: RepresentationAlternativeSchema,
      simulation: LessonSimulationSpecSchema,
    })
    .strict(),
  z
    .object({
      ...RepresentationCommonShape,
      kind: z.literal('animation'),
      alternative: RepresentationAlternativeSchema,
      frames: z
        .array(
          z
            .object({
              label: z.string().min(1),
              description: z.string().min(1),
              diagram: LessonDiagramSpecSchema,
            })
            .strict(),
        )
        .min(2)
        .max(20),
    })
    .strict(),
  z
    .object({
      ...RepresentationCommonShape,
      kind: z.literal('audio'),
      alternative: RepresentationAlternativeSchema,
      assetRef: SafeLessonAssetRefSchema,
      transcript: z.array(z.string().min(1)).min(1),
      captionsRef: SafeLessonCaptionsRefSchema.nullable(),
    })
    .strict(),
  z
    .object({
      ...RepresentationCommonShape,
      kind: z.literal('video'),
      alternative: RepresentationAlternativeSchema,
      assetRef: SafeLessonAssetRefSchema,
      transcript: z.array(z.string().min(1)).min(1),
      captionsRef: SafeLessonCaptionsRefSchema,
    })
    .strict(),
]);
export type LearnerLessonRepresentation = z.infer<typeof LearnerLessonRepresentationSchema>;

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
  z
    .object({
      kind: z.literal('numeric'),
      label: z.string().min(1),
      unitLabel: z.string().min(1).nullable(),
      allowNotSure: z.boolean(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('ordered_steps'),
      legend: z.string().min(1),
      minimumSteps: z.number().int().positive(),
      maximumSteps: z.number().int().positive(),
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
  schemaVersion: z.literal('1.2'),
  runId: LessonRunIdSchema,
  /** Public concurrency version; authority-private feedback/state remains absent. */
  runVersion: z.number().int().min(-1),
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
  groupedFeedback: GroupedLessonFeedbackSchema.nullable(),
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
