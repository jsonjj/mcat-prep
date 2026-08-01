import { z } from 'zod';
import { CarsSkillSchema } from './vocab';

/**
 * Passage of the Day — the content contract for a CARS-style reading passage and
 * its questions.
 *
 * Two shapes live here, and the distinction matters:
 *
 *   • The CANONICAL runtime entry (`PassageOfTheDayEntry`) — camelCase, carries
 *     the answer key + rationales. It is what the server-side selector/grader and
 *     the DB repository speak, and it reconciles the plain interfaces that used to
 *     live only in `content/passage-of-the-day/pool.ts`.
 *
 *   • The AUTHORING shape (`AuthoredPassage`) — snake_case, the user-facing JSON a
 *     human writes and the ingest validates. It mirrors the DB columns 1:1 and is
 *     mapped to the canonical entry by `authoredPassageToEntry`, exactly as the
 *     CARS-Duel `topics.json` maps to `CarsDuelTopic`.
 *
 * These are content SCHEMAS (shapes), not content DATA: the passage pool itself is
 * server-only and never crosses the browser boundary. Keeping the shape here — the
 * same pure layer that already holds `CarsDuelTopicSchema` and the `CarsSkill`
 * enum — lets the DB repo, the ingest tool, and the local dev store all validate
 * against one definition.
 */

/**
 * The two AAMC content groupings a CARS passage is drawn from, ~50/50 across a
 * form. Coarser than the free-text `discipline` (which is display-only): `theme`
 * is the axis the pool is balanced on.
 */
export const PassageThemeSchema = z.enum(['humanities', 'social_science']);
export type PassageTheme = z.infer<typeof PassageThemeSchema>;
export const PASSAGE_THEMES = PassageThemeSchema.options;

// Item difficulty is carried by `dok` (1–3) alone. The former ordinal
// `PassageDifficultySchema` (accessible/moderate/demanding) has been removed so a
// single difficulty axis is authored and stored; a coarse ordinal can be derived
// from `dok` on the fly if the IRT layer ever wants one.

/** A–D, the only option keys a CARS item uses. */
export const PassageChoiceIdSchema = z.enum(['A', 'B', 'C', 'D']);
export type PassageChoiceId = z.infer<typeof PassageChoiceIdSchema>;
export const PASSAGE_CHOICE_IDS = PassageChoiceIdSchema.options;

/**
 * One option (A–D). Every choice is self-describing and carries the key:
 *   • `correct` — exactly one choice per question is true.
 *   • `misconception` — the reasoning trap a wrong option rewards. REQUIRED
 *     (non-empty) on every incorrect choice and MUST be `null` on the correct one.
 *   • `rationale` — why this option is right or wrong; required on all four.
 * `correct` / `misconception` / `rationale` are SERVER-ONLY: the learner-safe view
 * projects each choice down to `{ id, text }`.
 */
export const PassageChoiceSchema = z
  .object({
    id: PassageChoiceIdSchema,
    text: z.string().min(1),
    correct: z.boolean(),
    misconception: z.string().min(1).nullable(),
    rationale: z.string().min(1),
  })
  .strict();
export type PassageChoice = z.infer<typeof PassageChoiceSchema>;

/** The four option ids, in the fixed A→D order the runner renders. */
const EXPECTED_CHOICE_ORDER = ['A', 'B', 'C', 'D'] as const;

/**
 * Structural rules shared by the authoring and canonical question shapes (the two
 * carry identical choices): the four options must be exactly A–D in order, exactly
 * one must be `correct`, and `misconception` must be null on the correct choice and
 * a non-empty string on each incorrect one.
 */
function refineChoices(
  choices: readonly { id: PassageChoiceId; correct: boolean; misconception: string | null }[],
  ctx: z.RefinementCtx,
): void {
  const ids = choices.map((choice) => choice.id);
  if (ids.join(',') !== EXPECTED_CHOICE_ORDER.join(',')) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['choices'],
      message: `choices must be exactly A, B, C, D in order (received ${ids.join(', ') || '(none)'})`,
    });
  }
  const correctCount = choices.filter((choice) => choice.correct).length;
  if (correctCount !== 1) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['choices'],
      message: `exactly one choice must be correct (found ${correctCount})`,
    });
  }
  choices.forEach((choice, index) => {
    if (choice.correct && choice.misconception !== null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['choices', index, 'misconception'],
        message: 'the correct choice must have a null misconception',
      });
    }
    if (!choice.correct && (choice.misconception === null || choice.misconception.length === 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['choices', index, 'misconception'],
        message: 'each incorrect choice must carry a non-empty misconception',
      });
    }
  });
}

/**
 * The CANONICAL question shape (camelCase). Carries the key (via each choice's
 * `correct`) plus the per-choice rationales/misconceptions and the overall
 * `explanation`, so it is SERVER-ONLY; the learner-safe projection (no key, no
 * rationale) is produced by the passage selector, not here.
 */
export const PassageQuestionSchema = z
  .object({
    id: z.string().min(1),
    stem: z.string().min(1),
    choices: z.array(PassageChoiceSchema).length(4),
    /** Why the correct answer is correct (shown once the learner commits). */
    explanation: z.string().min(1),
    /** The AAMC CARS skill the item exercises (FOC / RWT / RBT). */
    carsSkill: CarsSkillSchema,
    /** Depth of knowledge, 1–3 — the sole item-difficulty axis. */
    dok: z.number().int().min(1).max(3),
  })
  .strict()
  .superRefine((question, ctx) => refineChoices(question.choices, ctx));
export type PassageQuestion = z.infer<typeof PassageQuestionSchema>;

/** A kebab-case slug: lowercase, digits, single hyphens between segments. */
export const PassageSlugSchema = z
  .string()
  .min(1)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'slug must be kebab-case (lowercase, digits, hyphens)');

/**
 * The CANONICAL passage entry (camelCase). This is the shape the daily selector,
 * the grader, and the Postgres repository all speak. It is a SUPERSET of the
 * historical `PassageOfTheDayEntry` interface (adds `slug`, `theme`, and the
 * per-question CARS labels), so the frontend and grading keep behaving identically.
 */
export const PassageOfTheDayEntrySchema = z
  .object({
    id: z.string().min(1),
    slug: PassageSlugSchema,
    title: z.string().min(1),
    /** Free-text field shown as the eyebrow (e.g. "Aesthetics"). Display only. */
    discipline: z.string().min(1),
    theme: PassageThemeSchema,
    /** The passage text, one string per paragraph. */
    body: z.array(z.string().min(1)).min(1),
    /** Optional provenance note (e.g. "Written for MCAT Mastery"). */
    source: z.string().min(1).optional(),
    /** Optional attribution/credit line. */
    attribution: z.string().min(1).optional(),
    questions: z.array(PassageQuestionSchema).min(1),
  })
  .strict();
export type PassageOfTheDayEntry = z.infer<typeof PassageOfTheDayEntrySchema>;

// ---------------------------------------------------------------------------
// Authoring shape (snake_case) — what a human writes and the ingest validates.
// ---------------------------------------------------------------------------

/**
 * An authored choice is the SAME shape as the canonical one: `{ id, text, correct,
 * misconception, rationale }`. The answer key lives inside the choices — there is
 * no separate `correct_choice_id` or `choice_rationales` map to keep in sync.
 */
export const AuthoredPassageChoiceSchema = PassageChoiceSchema;

export const AuthoredPassageQuestionSchema = z
  .object({
    cars_skill: CarsSkillSchema,
    /** Depth of knowledge, 1–3 — the single difficulty the author sets. */
    dok: z.number().int().min(1).max(3),
    stem: z.string().min(1),
    choices: z.array(AuthoredPassageChoiceSchema).length(4),
    explanation: z.string().min(1),
  })
  .strict()
  .superRefine((question, ctx) => refineChoices(question.choices, ctx));
export type AuthoredPassageQuestion = z.infer<typeof AuthoredPassageQuestionSchema>;

/**
 * One authored passage. Exactly five questions, because the pool balances the
 * three CARS skills 2-2-1 per passage (see the authoring spec); five is what makes
 * the rotation land on an even 5/5/5 every three passages.
 */
export const AuthoredPassageSchema = z
  .object({
    slug: PassageSlugSchema,
    title: z.string().min(1),
    theme: PassageThemeSchema,
    /** Optional display eyebrow; defaults to a label derived from `theme`. */
    discipline: z.string().min(1).optional(),
    body: z.array(z.string().min(1)).min(1),
    source: z.string().min(1).optional(),
    attribution: z.string().min(1).optional(),
    questions: z.array(AuthoredPassageQuestionSchema).length(5),
  })
  .strict();
export type AuthoredPassage = z.infer<typeof AuthoredPassageSchema>;

/**
 * An ingest file is either a single authored passage or an array of them.
 * `parseAuthoredPassages` normalizes both to an array.
 */
export const AuthoredPassageFileSchema = z.union([
  AuthoredPassageSchema,
  z.array(AuthoredPassageSchema),
]);

// ---------------------------------------------------------------------------
// Learner-safe wire DTOs — what crosses to the browser (dev Vite API and the
// production /v1/passage/* route). No key, no rationale on the view; the grade
// is returned only after the learner commits an answer.
// ---------------------------------------------------------------------------

export const PassageChoiceViewSchema = z
  .object({ id: PassageChoiceIdSchema, text: z.string() })
  .strict();
export type PassageChoiceView = z.infer<typeof PassageChoiceViewSchema>;

export const PassageQuestionViewSchema = z
  .object({
    id: z.string(),
    stem: z.string(),
    choices: z.array(PassageChoiceViewSchema),
  })
  .strict();
export type PassageQuestionView = z.infer<typeof PassageQuestionViewSchema>;

export const PassageTodayViewSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    discipline: z.string(),
    body: z.array(z.string()),
    questions: z.array(PassageQuestionViewSchema),
    dayIndex: z.number().int(),
    poolSize: z.number().int(),
    localDate: z.string(),
  })
  .strict();
export type PassageTodayView = z.infer<typeof PassageTodayViewSchema>;

/** The `GET /v1/passage/today` (and dev `/api/passage/today`) response body. */
export const PassageTodayResponseSchema = z
  .object({ passage: PassageTodayViewSchema.nullable() })
  .strict();

export const PassageGradeSchema = z
  .object({
    correct: z.boolean(),
    correctChoiceId: PassageChoiceIdSchema,
    rationale: z.string(),
    choiceRationale: z.string().nullable(),
  })
  .strict();
export type PassageGrade = z.infer<typeof PassageGradeSchema>;

/** The `POST .../passage/attempts` request body. */
export const PassageAttemptRequestSchema = z
  .object({
    questionId: z.string().min(1),
    choiceId: PassageChoiceIdSchema.nullable(),
  })
  .strict();
export type PassageAttemptRequest = z.infer<typeof PassageAttemptRequestSchema>;

/** The `POST .../passage/attempts` response body. */
export const PassageAttemptResponseSchema = z.object({ grade: PassageGradeSchema }).strict();

/** Human label for the coarse theme, used when a passage omits `discipline`. */
export function passageThemeLabel(theme: PassageTheme): string {
  return theme === 'humanities' ? 'Humanities' : 'Social Science';
}

/**
 * Map one authored (snake_case) passage to the canonical runtime entry. Question
 * ids are derived from the slug + 1-based position (`<slug>-q<n>`), so a re-ingest
 * of the same passage produces stable ids the grader can key on.
 */
export function authoredPassageToEntry(authored: AuthoredPassage): PassageOfTheDayEntry {
  const entry: PassageOfTheDayEntry = {
    id: authored.slug,
    slug: authored.slug,
    title: authored.title,
    discipline: authored.discipline ?? passageThemeLabel(authored.theme),
    theme: authored.theme,
    body: authored.body,
    ...(authored.source === undefined ? {} : { source: authored.source }),
    ...(authored.attribution === undefined ? {} : { attribution: authored.attribution }),
    questions: authored.questions.map((question, index) => ({
      id: `${authored.slug}-q${index + 1}`,
      stem: question.stem,
      // The authored choice IS the canonical choice (id/text/correct/misconception/
      // rationale), so it carries over unchanged — the key travels with the option.
      choices: question.choices,
      explanation: question.explanation,
      carsSkill: question.cars_skill,
      dok: question.dok,
    })),
  };
  return PassageOfTheDayEntrySchema.parse(entry);
}

/**
 * Validate a parsed JSON value as an ingest file and return canonical entries.
 * Throws a ZodError (with field paths) on the first malformed passage, so the
 * ingest can print a precise, per-passage rejection.
 */
export function parseAuthoredPassages(input: unknown): PassageOfTheDayEntry[] {
  const parsed = AuthoredPassageFileSchema.parse(input);
  const authored = Array.isArray(parsed) ? parsed : [parsed];
  return authored.map(authoredPassageToEntry);
}
