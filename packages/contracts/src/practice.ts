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

/**
 * The queue the client renders: the ordered items plus its echoed parameters.
 *
 * `shortfall` is `requested - items.length`, always present (0 when the queue
 * is full). Selection can allocate a slot to a KC×skill spec that turns out to
 * have no fresh item left once recently-seen exclusion runs, and silently
 * truncating there left every downstream count assumption wrong with nothing
 * to show for it. `taughtGap` narrows the cause: true when the shortfall (if
 * any) traces to the taught-set gate withholding every science unit the bank
 * offered, as opposed to the bank or fresh-item supply simply running dry.
 *
 * `nothingTaught` narrows it once further, and the extra field earns its place
 * because the honest sentence differs. A gate that withheld everything because
 * the learner's finished lessons do not match the loaded bank means "you have
 * not reached this material"; a gate that withheld everything because the
 * learner has finished NO lesson means "finish a lesson first". Those are
 * different situations with different next steps, and a day-one learner gets
 * the second one — the taught set is empty until a lesson completes, which is
 * why the gate has to fire there at all.
 */
export const PracticeQueueViewSchema = z
  .object({
    requested: z.number().int().nonnegative(),
    focus: PracticeFocusSchema.nullable(),
    items: z.array(PracticeQueueItemSchema),
    shortfall: z.number().int().nonnegative(),
    taughtGap: z.boolean(),
    /** The learner has completed no lesson, so nothing is taught to practise. */
    nothingTaught: z.boolean(),
  })
  .strict();
export type PracticeQueueView = z.infer<typeof PracticeQueueViewSchema>;

/**
 * A practice answer, as it crosses the wire.
 *
 * There is no `firstAttempt` field here. It used to be a browser boolean
 * hardcoded `true`, so every response claimed to be a first attempt and every
 * first-attempt-conditioned rule was permanently satisfied — and it was a
 * claim about server-held state in the first place, which put it in no
 * position to be a claim the client could make. `Authority.submitPracticeAttempt`
 * derives it from the exposure records the server already holds.
 *
 * It was kept, briefly, as an unread field on this schema alone: present on
 * the wire type so the deployed route's exact-key body check would not reject
 * live submissions, but already absent from the type the authority consumed.
 * That was a coordination hazard rather than a fix — a field nothing reads can
 * still be re-trusted by a future author, where a field that does not exist
 * cannot. Removing it here and from the route's key check in the same change
 * closes that gap.
 */
export const PracticeAttemptCommandSchema = z
  .object({
    questionId: z.string().min(1),
    specId: z.string().min(1),
    chosenChoiceId: ChoiceIdSchema.nullable(),
    /**
     * Deliberation time from item presentation to submit, in whole ms, and how
     * many times the selection changed before committing. Both are OPTIONAL and
     * carry no default: a caller that did not measure them (a synthetic test, a
     * non-UI client) omits them, and the authority stores the absence as NULL —
     * "not captured", which WS1 calibration must be able to tell apart from a
     * real `0`. They are behavioural signals only and never award mastery.
     */
    elapsedMs: z.number().int().nonnegative().optional(),
    answerChanges: z.number().int().nonnegative().optional(),
  })
  .strict();
export type PracticeAttemptCommand = z.infer<typeof PracticeAttemptCommandSchema>;

/**
 * The practice answer the AUTHORITY consumes.
 *
 * Historically this was `PracticeAttemptCommandSchema.omit({ firstAttempt: true })`
 * — the wire command with the client's `firstAttempt` claim stripped, so the
 * two schemas could not drift into disagreeing about what else a practice
 * answer carries. With `firstAttempt` gone from the wire schema entirely, the
 * two shapes are identical; this alias is kept so `Authority.submitPracticeAttempt`
 * and its callers keep a name for "the answer the authority consumes" that is
 * independent of "the answer the wire carries," in case the two need to
 * diverge again for an unrelated reason.
 */
export const PracticeAttemptSchema = PracticeAttemptCommandSchema;
export type PracticeAttempt = z.infer<typeof PracticeAttemptSchema>;

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
