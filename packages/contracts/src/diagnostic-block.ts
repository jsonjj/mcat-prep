import { z } from 'zod';
import { MasterySeedSchema } from './mastery';

/**
 * The block/multistage placement diagnostic wire contract.
 *
 * Delivery is by BLOCK: the server serves a whole multistage stage, the learner
 * revises freely inside it, and one commit scores the block and routes to the
 * next. The response is learner-safe by construction — it carries NO answer key
 * and NO per-item correctness (the diagnostic gives no per-item reveal); only an
 * opaque `sessionToken`, a one-use `blockToken`, and aggregate cluster signals.
 *
 * Served at `POST /v1/diagnostic/next` and `POST /v1/diagnostic/block`. These
 * schemas are the deployed route's response contract (parsed on the way out as a
 * defense-in-depth no-leak guarantee) and mirror the browser client's types.
 */

const SectionSchema = z.enum(['cp', 'cars', 'bb', 'ps']);
const ChoiceIdSchema = z.enum(['A', 'B', 'C', 'D']);
const ClassificationSchema = z.enum([
  'provisionally_ready',
  'likely_weak',
  'unresolved',
  'unsampled',
]);
const RecommendationSchema = z.enum([
  'CONCISE_INSTRUCTION',
  'STANDARD_INSTRUCTION',
  'MISCONCEPTION_INSTRUCTION',
  'PREREQUISITE_SUPPORT_CANDIDATE',
  'DIAGNOSTIC_PROBE',
]);

/** A learner-safe question view for the browser. No key, no explanations. */
export const DiagnosticItemViewSchema = z
  .object({
    id: z.string().min(1),
    section: SectionSchema,
    sectionTitle: z.string(),
    cluster: z.string().min(1),
    clusterTitle: z.string(),
    clusterTested: z.string(),
    passage: z.string(),
    stem: z.string(),
    choices: z.array(z.object({ id: ChoiceIdSchema, text: z.string() }).strict()),
  })
  .strict();
export type DiagnosticItemView = z.infer<typeof DiagnosticItemViewSchema>;

const PriorityViewSchema = z
  .object({
    cluster: z.string().min(1),
    title: z.string(),
    tested: z.string(),
    recommendation: RecommendationSchema,
  })
  .strict();

const ClusterSignalViewSchema = z
  .object({
    cluster: z.string().min(1),
    title: z.string(),
    section: SectionSchema,
    classification: ClassificationSchema,
    recommendation: RecommendationSchema,
    gap: z.number().min(0).max(1),
    certainty: z.number().min(0).max(1),
    itemsSeen: z.number().int().nonnegative(),
  })
  .strict();

/** The result surfaced to the client: recommendations + word label, never a score. */
export const DiagnosticResultViewSchema = z
  .object({
    confidenceLabel: z.enum(['High', 'Medium', 'Still building']),
    topPriorities: z.array(PriorityViewSchema),
    stillConfirming: z.array(z.object({ cluster: z.string().min(1), title: z.string() }).strict()),
    perCluster: z.array(ClusterSignalViewSchema),
    itemsScored: z.number().int().nonnegative(),
    masterySeed: MasterySeedSchema,
  })
  .strict();
export type DiagnosticResultView = z.infer<typeof DiagnosticResultViewSchema>;

/** The whole open stage, plus where in the form the learner stands. */
export const DiagnosticBlockViewSchema = z
  .object({
    done: z.boolean(),
    progress: z.number().min(0).max(1),
    itemsScored: z.number().int().nonnegative(),
    totalItems: z.number().int().nonnegative(),
    stageId: z.string().nullable(),
    stageNumber: z.number().int().nonnegative(),
    stageCount: z.number().int().nonnegative(),
    itemsCommitted: z.number().int().nonnegative(),
    questions: z.array(DiagnosticItemViewSchema),
    result: DiagnosticResultViewSchema.nullable(),
  })
  .strict();
export type DiagnosticBlockView = z.infer<typeof DiagnosticBlockViewSchema>;

/**
 * The wire response for both POST routes: the block view plus the opaque session
 * token and the one-use block token (null once the form is done). Identical in
 * dev, the local authority, and the deployed API.
 */
export const DiagnosticBlockResponseSchema = DiagnosticBlockViewSchema.extend({
  sessionToken: z.string().min(1),
  blockToken: z.string().min(1).nullable(),
}).strict();
export type DiagnosticBlockResponse = z.infer<typeof DiagnosticBlockResponseSchema>;

/** POST /v1/diagnostic/next body: an optional session token to resume. */
export const DiagnosticNextRequestSchema = z
  .object({ sessionToken: z.string().min(1).max(128).optional() })
  .strict();
export type DiagnosticNextRequest = z.infer<typeof DiagnosticNextRequestSchema>;

/** POST /v1/diagnostic/block body: the committed block + one-use token. */
export const DiagnosticBlockRequestSchema = z
  .object({
    sessionToken: z.string().min(1).max(128),
    blockToken: z.string().min(1).max(128),
    stageId: z.string().min(1),
    // `questionId -> choiceId | null`; null is an explicit "not known".
    answers: z.record(z.string(), ChoiceIdSchema.nullable()).optional(),
    // `questionId -> ms spent`; advisory timing only.
    elapsedMs: z.record(z.string(), z.number()).optional(),
  })
  .strict();
export type DiagnosticBlockRequest = z.infer<typeof DiagnosticBlockRequestSchema>;
