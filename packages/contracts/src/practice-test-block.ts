import { z } from 'zod';
import { CommandEnvelopeSchema } from './commands';

/**
 * The periodic scored practice-test RUNNER wire contract (WS5, §6).
 *
 * The diagnostic runner's fixed-form sibling. Delivery is by BLOCK: the server
 * serves a whole section, the learner revises freely inside it, and one commit
 * scores the block and serves the next. The response is learner-safe by
 * construction — it carries NO answer key and NO per-item correctness; only an
 * opaque `sessionToken`, a one-use `blockToken`, learner-safe question views, and
 * the aggregate scored result once the form is done.
 *
 * Served at `POST /v1/practice-test/next` and `POST /v1/practice-test/block`
 * (session-gated, not CSRF write-gated, like the diagnostic). The SCORED result
 * is persisted to the learner projection by the separate, CSRF-gated
 * `POST /v1/practice-test/result`, which the client fires once the runner reports
 * `done` and the block response's `resultPersisted` is false (the deployed
 * backend does not self-persist; the dev/preview runner does, and reports true).
 */

const SectionSchema = z.enum(['cp', 'cars', 'bb', 'ps']);
const ChoiceIdSchema = z.enum(['A', 'B', 'C', 'D']);

/** A learner-safe question view for the browser. No key, no explanations. */
export const PracticeTestItemViewSchema = z
  .object({
    id: z.string().min(1),
    section: SectionSchema,
    sectionTitle: z.string(),
    cluster: z.string().min(1),
    clusterTitle: z.string(),
    passage: z.string(),
    stem: z.string(),
    choices: z.array(z.object({ id: ChoiceIdSchema, text: z.string() }).strict()),
  })
  .strict();
export type PracticeTestItemView = z.infer<typeof PracticeTestItemViewSchema>;

const PracticeTestSectionScoreSchema = z
  .object({
    section: SectionSchema,
    itemsScored: z.number().int().nonnegative(),
    correct: z.number().int().nonnegative(),
    accuracy: z.number().min(0).max(1),
  })
  .strict();

const PracticeTestClusterScoreSchema = z
  .object({
    cluster: z.string().min(1),
    itemsScored: z.number().int().nonnegative(),
    correct: z.number().int().nonnegative(),
    accuracy: z.number().min(0).max(1),
  })
  .strict();

/**
 * The scored-result envelope for a completed sitting. Learner-safe: it carries
 * aggregate section/cluster scores and the ids the learner missed (which the
 * review flow reveals), but NO answer key and NO per-item correctness. The
 * server-only review targets + re-measure are stripped before this crosses the
 * wire — they feed the durable persist path, not the browser.
 */
export const PracticeTestResultViewSchema = z
  .object({
    itemsScored: z.number().int().nonnegative(),
    correct: z.number().int().nonnegative(),
    perSection: z.array(PracticeTestSectionScoreSchema),
    perCluster: z.array(PracticeTestClusterScoreSchema),
    missedQuestionIds: z.array(z.string()),
    blueprintMet: z.boolean(),
  })
  .strict();
export type PracticeTestResultView = z.infer<typeof PracticeTestResultViewSchema>;

/** The whole open block, plus where in the fixed form the learner stands. */
export const PracticeTestBlockViewSchema = z
  .object({
    done: z.boolean(),
    progress: z.number().min(0).max(1),
    itemsScored: z.number().int().nonnegative(),
    totalItems: z.number().int().nonnegative(),
    section: SectionSchema.nullable(),
    sectionTitle: z.string().nullable(),
    blockId: z.string().nullable(),
    blockNumber: z.number().int().nonnegative(),
    blockCount: z.number().int().nonnegative(),
    itemsCommitted: z.number().int().nonnegative(),
    questions: z.array(PracticeTestItemViewSchema),
    result: PracticeTestResultViewSchema.nullable(),
  })
  .strict();
export type PracticeTestBlockView = z.infer<typeof PracticeTestBlockViewSchema>;

/**
 * The wire response for both POST routes: the block view plus the opaque session
 * token, the one-use block token (null once done), and `resultPersisted` — true
 * only when the serving backend already persisted the scored sitting (the
 * dev/preview runner does; the deployed backend does not, so the client fires the
 * separate result write). Identical shape in dev and the deployed API.
 */
export const PracticeTestBlockResponseSchema = PracticeTestBlockViewSchema.extend({
  sessionToken: z.string().min(1),
  blockToken: z.string().min(1).nullable(),
  resultPersisted: z.boolean(),
}).strict();
export type PracticeTestBlockResponse = z.infer<typeof PracticeTestBlockResponseSchema>;

/** POST /v1/practice-test/next body: an optional session token to resume. */
export const PracticeTestNextRequestSchema = z
  .object({ sessionToken: z.string().min(1).max(128).optional() })
  .strict();
export type PracticeTestNextRequest = z.infer<typeof PracticeTestNextRequestSchema>;

/** POST /v1/practice-test/block body: the committed block + its one-use token. */
export const PracticeTestBlockRequestSchema = z
  .object({
    sessionToken: z.string().min(1).max(128),
    blockToken: z.string().min(1).max(128),
    blockId: z.string().min(1),
    // `questionId -> choiceId | null`; null is an explicit "not known".
    answers: z.record(z.string(), ChoiceIdSchema.nullable()).optional(),
    // `questionId -> ms spent`; advisory timing only.
    elapsedMs: z.record(z.string(), z.number()).optional(),
  })
  .strict();
export type PracticeTestBlockRequest = z.infer<typeof PracticeTestBlockRequestSchema>;

/**
 * POST /v1/practice-test/result body: persist a completed sitting's SCORED
 * result to the learner projection. State-changing (CSRF-gated), so it carries a
 * command envelope; the server re-derives the score from the durable session by
 * `sessionToken` (the browser never sees a key), so no score is trusted from the
 * client. Idempotent by the sitting id the server reads from the session.
 */
export const PracticeTestResultRequestSchema = z
  .object({
    envelope: CommandEnvelopeSchema,
    sessionToken: z.string().min(1).max(128),
  })
  .strict();
export type PracticeTestResultRequest = z.infer<typeof PracticeTestResultRequestSchema>;
