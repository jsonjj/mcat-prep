import { z } from 'zod';
import { CommandEnvelopeSchema } from './commands';

/**
 * Grammar-agnostic lesson-delivery contracts for the Real Lesson Catalog
 * (Phase 5, wave 5C).
 *
 * L1 (`V3-LES-130923`) keeps its bespoke, lesson-specific wire schemas in
 * `v3-vector-lesson.ts` (owner decision: per-grammar dispatch). THESE schemas
 * serve every OTHER catalog lesson — today L2/L3, tomorrow anything the Phase 9
 * authoring template produces — off the shared `NormalizedLesson` engine, so a
 * new lesson needs zero new contract code.
 *
 * The wire shapes mirror the engine's public surface
 * (`services/lambdas/learner-api/src/normalized-lesson-runtime.ts`): the
 * learner-safe run view, the two-shape action, and the three committed-response
 * encodings. None of them can express a correct answer — the run view carries
 * `choiceId` + `text` only, never a key — and every object is `.strict()`, so a
 * server that tried to leak protected material would fail the contract.
 */

/**
 * Any Real-Lesson-Catalog lesson id. The route slug is the authority for WHICH
 * lesson runs; this only constrains the SHAPE of the id a start body carries,
 * and the server rejects a body id that does not match the slug it arrived on
 * (the per-route identity guard L1 also keeps).
 */
export const CatalogLessonIdSchema = z.string().regex(/^V3-LES-\d{6}$/);
export type CatalogLessonId = z.infer<typeof CatalogLessonIdSchema>;

/** Run-view status. Paused is a separate boolean, never a status value here. */
export const NormalizedLessonRunStatusSchema = z.enum([
  'IN_PROGRESS',
  'BLOCKED',
  'DELIVERY_COMPLETE',
]);
export type NormalizedLessonRunStatus = z.infer<typeof NormalizedLessonRunStatusSchema>;

/** Status-endpoint run state — adds the pre-start and paused surfaces. */
export const NormalizedLessonRunStateSchema = z.enum([
  'NOT_STARTED',
  'IN_PROGRESS',
  'PAUSED',
  'BLOCKED',
  'DELIVERY_COMPLETE',
]);
export type NormalizedLessonRunState = z.infer<typeof NormalizedLessonRunStateSchema>;

const NormalizedChoiceSchema = z
  .object({
    choiceId: z.string().min(1),
    // Display strings are intentionally not length-constrained: content — not the
    // wire contract — owns whether an option can be blank.
    text: z.string(),
  })
  .strict();

const NormalizedStructuredFieldSchema = z
  .object({
    fieldId: z.string().min(1),
    label: z.string(),
  })
  .strict();

export const NormalizedLessonResponseControlSchema = z
  .discriminatedUnion('kind', [
    z
      .object({
        kind: z.literal('SINGLE_SELECT'),
        choices: z.array(NormalizedChoiceSchema).min(1),
      })
      .strict(),
    z
      .object({
        kind: z.literal('SHORT_TEXT'),
        inputConvention: z
          .object({
            normalization: z.literal('TRIM_AND_COLLAPSE_WHITESPACE'),
            matching: z.literal('AUTHORED_EQUIVALENTS_ONLY'),
            caseSensitive: z.literal(true),
          })
          .strict(),
      })
      .strict(),
    z
      .object({
        kind: z.literal('STRUCTURED_FIELDS'),
        fields: z.array(NormalizedStructuredFieldSchema).min(1),
      })
      .strict(),
  ])
  .superRefine((control, context) => {
    if (control.kind === 'STRUCTURED_FIELDS') {
      const seen = new Set<string>();
      control.fields.forEach(({ fieldId }, index) => {
        if (seen.has(fieldId)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['fields', index, 'fieldId'],
            message: `duplicate fieldId "${fieldId}"`,
          });
        }
        seen.add(fieldId);
      });
    }
  });
export type NormalizedLessonResponseControl = z.infer<typeof NormalizedLessonResponseControlSchema>;

const ExpositionScreenSchema = z
  .object({
    kind: z.literal('EXPOSITION'),
    heading: z.string(),
    contentBlocks: z.array(z.string()).min(1),
    /** Compatibility text for the current WP-05E renderer. */
    prompt: z.string(),
  })
  .strict();

const QuestionScreenSchema = z
  .object({
    kind: z.literal('QUESTION'),
    itemId: z.string().min(1),
    kcId: z.string().min(1),
    heading: z.string(),
    contentBlocks: z.array(z.string()),
    prompt: z.string(),
    control: NormalizedLessonResponseControlSchema,
    /**
     * Temporary WP-05E compatibility projection. `control` is canonical; this
     * is identical to SINGLE_SELECT.choices and empty for the other controls.
     */
    choices: z.array(NormalizedChoiceSchema),
  })
  .strict();

const FeedbackScreenSchema = z
  .object({
    kind: z.literal('FEEDBACK'),
    itemId: z.string().min(1),
    outcome: z.enum(['CORRECT', 'INCORRECT', 'OMITTED', 'INVALID']),
    message: z.string().min(1),
  })
  .strict();

const BlockedScreenSchema = z.object({ kind: z.literal('BLOCKED') }).strict();

const CompleteScreenSchema = z.object({ kind: z.literal('COMPLETE') }).strict();

export const NormalizedLessonScreenSchema = z.discriminatedUnion('kind', [
  ExpositionScreenSchema,
  QuestionScreenSchema,
  FeedbackScreenSchema,
  BlockedScreenSchema,
  CompleteScreenSchema,
]);
export type NormalizedLessonScreen = z.infer<typeof NormalizedLessonScreenSchema>;

/** Learner-safe current-screen view. Never carries an answer key. */
export const NormalizedLessonRunViewSchema = z
  .object({
    runId: z.string().uuid(),
    lessonId: CatalogLessonIdSchema,
    status: NormalizedLessonRunStatusSchema,
    paused: z.boolean(),
    /** The KC under delivery, or null once the lesson is complete. */
    kcId: z.string().min(1).nullable(),
    /** 1-based canonical position of `kcId`; null past the last KC. */
    kcOrdinal: z.number().int().nonnegative().nullable(),
    totalKcs: z.number().int().nonnegative(),
    screen: NormalizedLessonScreenSchema,
  })
  .strict();
export type NormalizedLessonRunView = z.infer<typeof NormalizedLessonRunViewSchema>;

export const NormalizedLessonStatusViewSchema = z
  .object({
    availability: z.enum(['AVAILABLE', 'UNAVAILABLE']),
    runState: NormalizedLessonRunStateSchema,
    actionLabel: z.enum(['Start', 'Continue']).nullable(),
  })
  .strict();
export type NormalizedLessonStatusView = z.infer<typeof NormalizedLessonStatusViewSchema>;

export const NormalizedLessonStartCommandSchema = z
  .object({
    envelope: CommandEnvelopeSchema,
    lessonId: CatalogLessonIdSchema,
  })
  .strict();
export type NormalizedLessonStartCommand = z.infer<typeof NormalizedLessonStartCommandSchema>;

export const NormalizedLessonStartResponseSchema = z
  .object({
    runId: z.string().uuid(),
    disposition: z.enum(['STARTED', 'RESUMED', 'ALREADY_COMPLETE']),
    streamVersion: z.number().int().nonnegative(),
  })
  .strict();
export type NormalizedLessonStartResponse = z.infer<typeof NormalizedLessonStartResponseSchema>;

/**
 * A committed response, in the three encodings the engine scores. Structured
 * fields remain an ordered list until runtime validation so duplicate IDs
 * cannot be hidden by JSON-object key replacement.
 */
const NormalizedStructuredResponseFieldSchema = z
  .object({
    fieldId: z.string().min(1),
    value: z.string().nullable(),
  })
  .strict();

export const NormalizedLessonResponseSchema = z
  .discriminatedUnion('kind', [
    z
      .object({ kind: z.literal('MULTIPLE_CHOICE'), choiceId: z.string().min(1).nullable() })
      .strict(),
    z.object({ kind: z.literal('SHORT'), text: z.string().nullable() }).strict(),
    z
      .object({
        kind: z.literal('CONSTRUCTED'),
        fields: z.array(NormalizedStructuredResponseFieldSchema).min(1),
      })
      .strict(),
  ])
  .superRefine((response, context) => {
    if (response.kind === 'CONSTRUCTED') {
      const seen = new Set<string>();
      response.fields.forEach(({ fieldId }, index) => {
        if (seen.has(fieldId)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['fields', index, 'fieldId'],
            message: `duplicate fieldId "${fieldId}"`,
          });
        }
        seen.add(fieldId);
      });
    }
  });
export type NormalizedLessonResponse = z.infer<typeof NormalizedLessonResponseSchema>;

export const NormalizedLessonActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('CONTINUE') }).strict(),
  z
    .object({ type: z.literal('SUBMIT_RESPONSE'), response: NormalizedLessonResponseSchema })
    .strict(),
]);
export type NormalizedLessonAction = z.infer<typeof NormalizedLessonActionSchema>;

export const NormalizedLessonCommandSchema = z
  .object({
    envelope: CommandEnvelopeSchema,
    action: NormalizedLessonActionSchema,
  })
  .strict();
export type NormalizedLessonCommand = z.infer<typeof NormalizedLessonCommandSchema>;
