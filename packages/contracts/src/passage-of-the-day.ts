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

/**
 * Ordinal item difficulty. Deliberately the CARS-generation vocabulary
 * (`@mcat/cars-generation` `DIFFICULTY_TARGETS`) rather than a numeric IRT `b`:
 * CARS cold-start difficulty prediction is weak enough that a number would be
 * unearned precision (see cars-generation `taxonomy.ts`). Mirrored here because
 * `@mcat/contracts` is a pure leaf and cannot depend on cars-generation;
 * `tests/architecture/passage-of-day-contract.test.ts` fails if the two drift.
 */
export const PassageDifficultySchema = z.enum(['accessible', 'moderate', 'demanding']);
export type PassageDifficulty = z.infer<typeof PassageDifficultySchema>;
export const PASSAGE_DIFFICULTIES = PassageDifficultySchema.options;

/** A–D, the only option keys a CARS item uses. */
export const PassageChoiceIdSchema = z.enum(['A', 'B', 'C', 'D']);
export type PassageChoiceId = z.infer<typeof PassageChoiceIdSchema>;
export const PASSAGE_CHOICE_IDS = PassageChoiceIdSchema.options;

export const PassageChoiceSchema = z
  .object({
    id: PassageChoiceIdSchema,
    text: z.string().min(1),
  })
  .strict();
export type PassageChoice = z.infer<typeof PassageChoiceSchema>;

/**
 * Optional per-choice rationales ("why this option misses"), keyed A–D. The 12
 * seed passages carry these; a user-authored passage MAY omit them, in which case
 * only the single `rationale` is shown. SERVER-ONLY, like the key.
 */
export const PassageChoiceRationalesSchema = z
  .object({
    A: z.string().min(1),
    B: z.string().min(1),
    C: z.string().min(1),
    D: z.string().min(1),
  })
  .strict();
export type PassageChoiceRationales = z.infer<typeof PassageChoiceRationalesSchema>;

/** The four option ids, in the fixed A→D order the runner renders. */
const EXPECTED_CHOICE_ORDER = ['A', 'B', 'C', 'D'] as const;

function refineChoices(
  choices: readonly { id: PassageChoiceId }[],
  correctChoiceId: PassageChoiceId,
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
  if (!ids.includes(correctChoiceId)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['correctChoiceId'],
      message: `correctChoiceId ${correctChoiceId} is not one of the choices`,
    });
  }
}

/**
 * The CANONICAL question shape (camelCase). Carries the key + rationales, so it is
 * SERVER-ONLY; the learner-safe projection (no key, no rationale) is produced by
 * the passage selector, not here.
 */
export const PassageQuestionSchema = z
  .object({
    id: z.string().min(1),
    stem: z.string().min(1),
    choices: z.array(PassageChoiceSchema).length(4),
    correctChoiceId: PassageChoiceIdSchema,
    /** Why the correct answer is correct (shown once the learner commits). */
    rationale: z.string().min(1),
    /** Optional per-choice "why it misses" notes; absent → not shown. */
    choiceRationales: PassageChoiceRationalesSchema.optional(),
    /** The AAMC CARS skill the item exercises (FOC / RWT / RBT). */
    carsSkill: CarsSkillSchema,
    /** Depth of knowledge, 1–4. */
    dok: z.number().int().min(1).max(4),
    difficulty: PassageDifficultySchema,
  })
  .strict()
  .superRefine((question, ctx) => refineChoices(question.choices, question.correctChoiceId, ctx));
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

export const AuthoredPassageChoiceSchema = z
  .object({
    id: PassageChoiceIdSchema,
    text: z.string().min(1),
  })
  .strict();

export const AuthoredPassageQuestionSchema = z
  .object({
    cars_skill: CarsSkillSchema,
    dok: z.number().int().min(1).max(4),
    difficulty: PassageDifficultySchema,
    stem: z.string().min(1),
    choices: z.array(AuthoredPassageChoiceSchema).length(4),
    correct_choice_id: PassageChoiceIdSchema,
    explanation: z.string().min(1),
    /** Optional per-choice rationales; all four required if present. */
    choice_rationales: PassageChoiceRationalesSchema.optional(),
  })
  .strict()
  .superRefine((question, ctx) => refineChoices(question.choices, question.correct_choice_id, ctx));
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
      choices: question.choices,
      correctChoiceId: question.correct_choice_id,
      rationale: question.explanation,
      ...(question.choice_rationales === undefined
        ? {}
        : { choiceRationales: question.choice_rationales }),
      carsSkill: question.cars_skill,
      dok: question.dok,
      difficulty: question.difficulty,
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
