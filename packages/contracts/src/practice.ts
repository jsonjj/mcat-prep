import { z } from 'zod';
import { ChoiceIdSchema } from './commands';
import { CarsSkillSchema, ReasoningOperationSchema } from './vocab';

/**
 * Adaptive Practice DTOs (the count-based "test-out" question engine).
 *
 * These cross the wire between the learner client and the authority. The queue
 * DTOs are LEARNER-SAFE by construction: `PracticeQuestion` has no field that can
 * hold an answer key or rationale, so a queue response can never leak scoring
 * material. Answer material is authorized only in `PracticeAttemptResult`, after
 * the learner has committed a first answer (mirrors the study reveal boundary).
 *
 * The bank the queue draws from is the real v7 Postgres corpus, so ids/section
 * codes are kept permissive strings rather than the compiled study vocab.
 */

export const PracticeDomainSchema = z.enum(['science', 'cars']);
export type PracticeDomain = z.infer<typeof PracticeDomainSchema>;

export const PracticePurposeSchema = z.enum(['train', 'probe', 'repair']);
export type PracticePurpose = z.infer<typeof PracticePurposeSchema>;

/** One answer option — text only, never a rationale. */
export const PracticeChoiceSchema = z
  .object({
    id: ChoiceIdSchema,
    text: z.string().min(1),
  })
  .strict();
export type PracticeChoice = z.infer<typeof PracticeChoiceSchema>;

/**
 * A learner-safe question delivered in a practice queue. This schema cannot
 * represent a correct answer or any rationale (strict + no such fields).
 */
export const PracticeQuestionSchema = z
  .object({
    id: z.string().min(1),
    /** v7 section code, lowercase (bb / cp / ps / cars / cross_section). */
    section: z.string().min(1),
    /** 15-cluster rollup when known (e.g. BB1); null for uncategorized items. */
    cluster: z.string().min(1).nullable(),
    /** Full passage/vignette text, or '' when the item is discrete. */
    passage: z.string(),
    stem: z.string().min(1),
    choices: z.array(PracticeChoiceSchema).length(4),
  })
  .strict();
export type PracticeQuestion = z.infer<typeof PracticeQuestionSchema>;

/**
 * One queued practice rep: a fresh learner-safe item plus the spec that produced
 * it (so the client can echo `specId` on the attempt for repair-on-miss).
 */
export const PracticeQueueItemSchema = z
  .object({
    specId: z.string().min(1),
    domain: PracticeDomainSchema,
    purpose: PracticePurposeSchema,
    kcId: z.string().min(1).nullable(),
    skill: ReasoningOperationSchema.nullable(),
    carsSkill: CarsSkillSchema.nullable(),
    dok: z.number().int().nullable(),
    question: PracticeQuestionSchema,
  })
  .strict();
export type PracticeQueueItem = z.infer<typeof PracticeQueueItemSchema>;

/**
 * Optional weakness focus for a session, a compact lowercase token the authority
 * interprets as a cluster (e.g. `bb1`), a reasoning op (e.g. `explain`), or
 * `cars`. Kept opaque here so the UI can pass a chip value verbatim.
 */
export const PracticeFocusSchema = z
  .string()
  .min(1)
  .max(32)
  .regex(/^[a-z0-9-]+$/, 'lowercase alphanumeric focus token');
export type PracticeFocus = z.infer<typeof PracticeFocusSchema>;

/** The queue the client renders: the ordered items plus its echoed parameters. */
export const PracticeQueueViewSchema = z
  .object({
    requested: z.number().int().nonnegative(),
    focus: PracticeFocusSchema.nullable(),
    items: z.array(PracticeQueueItemSchema),
  })
  .strict();
export type PracticeQueueView = z.infer<typeof PracticeQueueViewSchema>;

/**
 * A practice answer. `firstAttempt` is the client's claim; the authority still
 * decides whether it moves mastery (only a first, unassisted attempt does).
 */
export const PracticeAttemptCommandSchema = z
  .object({
    questionId: z.string().min(1),
    specId: z.string().min(1),
    chosenChoiceId: ChoiceIdSchema.nullable(),
    firstAttempt: z.boolean(),
  })
  .strict();
export type PracticeAttemptCommand = z.infer<typeof PracticeAttemptCommandSchema>;

/** Answer-bearing feedback, authorized only after a practice answer is submitted. */
export const PracticeAttemptResultSchema = z
  .object({
    correct: z.boolean(),
    correctChoiceId: ChoiceIdSchema,
    rationale: z.string().min(1),
    choiceRationales: z.record(ChoiceIdSchema, z.string().min(1)),
  })
  .strict();
export type PracticeAttemptResult = z.infer<typeof PracticeAttemptResultSchema>;
