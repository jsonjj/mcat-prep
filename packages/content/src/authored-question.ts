import { z } from 'zod';
import { CARS_SKILLS, REASONING_OPERATIONS } from '@mcat/contracts';
import {
  QuestionSchema,
  type ChoiceLetter,
  type Question as V7Question,
  type V7ErrorModels,
  type V7Explanations,
} from './schema';
import { assertNoProtectedFields, compileV7Question } from './compile';
import { resolveReasoningOperation } from './reasoning-operation';
import { resolveV7Placement } from './v7-cluster-map';

/**
 * AUTHORING shape for practice-bank questions — the user-facing JSON a human (or
 * a generator) writes and the ingest validates. It mirrors the CARS
 * Passage-of-the-Day authoring contract (`@mcat/contracts` passage-of-the-day):
 * snake_case, the answer key + per-choice diagnostics ride INSIDE the choices, and
 * a pure mapper (`authoredQuestionToV7`) lowers it onto the canonical `V7Question`
 * of record so the rest of the pipeline (compile → protected split → practice bank
 * ports → Mistakes) is unchanged.
 *
 * The shape is deliberately DIFFERENT from `V7Question`: an author names a reasoning
 * operation directly (`skill: "QUANTIFY"`) and tags misconceptions per choice, rather
 * than authoring the `explanations`/`error_models` letter-maps and the SIRS codes the
 * corpus historically used. The mapper does that lowering. See docs/master-build-spec.md
 * WS2 for the misconception model and packages/content/src/schema.ts for v7.
 *
 * SERVER-ONLY after mapping: `correct` / `misconception` / `rationale` / `explanation`
 * are answer-bearing and are split into the protected payload by `compileV7Question`;
 * they never reach a learner-safe surface.
 */

/** The four authored sections. Uppercase, unlike the engine's lowercase `Section`. */
export const AuthoredQuestionSectionSchema = z.enum(['CP', 'BB', 'PS', 'CARS']);
export type AuthoredQuestionSection = z.infer<typeof AuthoredQuestionSectionSchema>;

/** A–D, the only choice ids a question uses. */
export const AuthoredQuestionChoiceIdSchema = z.enum(['A', 'B', 'C', 'D']);

/**
 * One authored choice. Carries the key + diagnostics:
 *   • `correct` — exactly one choice per question is true.
 *   • `misconception` — the trap a wrong option rewards. REQUIRED (non-empty) on
 *     every incorrect choice; MUST be `null` on the correct one.
 *   • `rationale` — why this option is right or wrong; required on all four.
 * All four are SERVER-ONLY.
 */
export const AuthoredQuestionChoiceSchema = z
  .object({
    id: AuthoredQuestionChoiceIdSchema,
    text: z.string().min(1),
    correct: z.boolean(),
    misconception: z.string().min(1).nullable(),
    rationale: z.string().min(1),
  })
  .strict();
export type AuthoredQuestionChoice = z.infer<typeof AuthoredQuestionChoiceSchema>;

const EXPECTED_CHOICE_ORDER = ['A', 'B', 'C', 'D'] as const;

/**
 * The choice-set rules shared by every authored question: exactly A–D in order,
 * exactly one `correct`, and `misconception` null on the correct choice / a
 * non-empty string on each incorrect one. Reported as precise per-choice issues so
 * the ingest can reject a malformed record with an actionable message.
 */
function refineChoices(
  choices: readonly { id: string; correct: boolean; misconception: string | null }[],
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

const CARS_SKILL_SET = new Set<string>(CARS_SKILLS);
const REASONING_OP_SET = new Set<string>(REASONING_OPERATIONS);

const present = (value: string | null | undefined): boolean =>
  value !== null && value !== undefined && value.trim() !== '';

/**
 * One authored practice-bank question. `.strict()` so a typo'd key is rejected
 * rather than silently dropped. The CARS-vs-science field rules are enforced in
 * `superRefine` (they are conditional on `section`, which a flat object shape
 * cannot express):
 *   • science (CP/BB/PS): requires `kc_id`, `lesson_id`, and a `skill` that is one
 *     of the 7 reasoning operations.
 *   • CARS: requires a `passage` or `passage_id`, a `skill` in {FOC,RWT,RBT}, and
 *     DISALLOWS `kc_id`/`lesson_id`.
 */
export const AuthoredQuestionSchema = z
  .object({
    id: z.string().min(1),
    section: AuthoredQuestionSectionSchema,
    /** v3 KC id (`V3-KC-*`) — science only; null/omitted for CARS. */
    kc_id: z.string().min(1).nullable().optional(),
    /** Reasoning op (science) or CARS sub-skill; validated against `section`. */
    skill: z.string().min(1),
    /** Depth of knowledge, 1–3 — the single item-difficulty axis. */
    dok: z.number().int().min(1).max(3),
    /** Owning v3 lesson (`V3-LES-*`) — science only; null/omitted for CARS. */
    lesson_id: z.string().min(1).nullable().optional(),
    /** Shared CARS stimulus id — CARS only; null for standalone science. */
    passage_id: z.string().min(1).nullable().optional(),
    /** Groups variants of the same item. */
    family_id: z.string().min(1),
    /** Required for CARS (inline stimulus); optional science vignette. */
    passage: z.string().optional().default(''),
    stem: z.string().min(1),
    choices: z.array(AuthoredQuestionChoiceSchema).length(4),
    /** Overall worked explanation (folded onto the key's per-choice explanation). */
    explanation: z.string().min(1),
  })
  .strict()
  .superRefine((question, ctx) => {
    refineChoices(question.choices, ctx);

    if (question.section === 'CARS') {
      if (!present(question.passage) && !present(question.passage_id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['passage'],
          message: 'a CARS question requires a non-empty passage or a passage_id',
        });
      }
      if (present(question.kc_id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['kc_id'],
          message: 'a CARS question must not carry kc_id (CARS is not KC-routed)',
        });
      }
      if (present(question.lesson_id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['lesson_id'],
          message: 'a CARS question must not carry lesson_id',
        });
      }
      if (!CARS_SKILL_SET.has(question.skill.trim().toUpperCase())) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['skill'],
          message: `a CARS skill must be one of ${CARS_SKILLS.join(', ')}`,
        });
      }
      return;
    }

    // Science (CP/BB/PS).
    if (!present(question.kc_id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['kc_id'],
        message: 'a science question requires a kc_id',
      });
    }
    if (!present(question.lesson_id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['lesson_id'],
        message: 'a science question requires a lesson_id',
      });
    }
    if (!REASONING_OP_SET.has(question.skill.trim().toUpperCase())) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['skill'],
        message: `a science skill must be one of the 7 reasoning operations (${REASONING_OPERATIONS.join(', ')})`,
      });
    }
  });
export type AuthoredQuestion = z.infer<typeof AuthoredQuestionSchema>;

/** An ingest file is a single authored question or an array of them. */
export const AuthoredQuestionFileSchema = z.union([
  AuthoredQuestionSchema,
  z.array(AuthoredQuestionSchema),
]);

/**
 * Validate a parsed JSON value as an ingest file and return the authored records.
 * Throws a ZodError (with field paths) on the first malformed question, so the
 * ingest can print a precise, per-record rejection.
 */
export function parseAuthoredQuestions(input: unknown): AuthoredQuestion[] {
  const parsed = AuthoredQuestionFileSchema.parse(input);
  return Array.isArray(parsed) ? parsed : [parsed];
}

/**
 * Map one authored question onto the canonical `V7Question` of record.
 *
 * The lowering:
 *   • `correct_answer` ← the `correct: true` choice id.
 *   • `explanations` (letter→text) ← each choice's `rationale`, with the overall
 *     worked `explanation` FOLDED onto the key's entry (so the reveal shows it and
 *     nothing authored is lost).
 *   • `error_models` (letter→text, SERVER-ONLY) ← each wrong choice's
 *     `misconception` (prefixed `misconception:`), the key tagged `correct_model`
 *     — the exact `"<tag>: <text>"` convention `Authority.parseErrorModel` reads.
 *   • `primary_skill`/`reasoning_operation` ← `skill` (science: the op verbatim;
 *     CARS: `CARS_<skill>` so the CARS-skill resolvers recognise it).
 *   • `primary_kc_id` ← `kc_id`, `lesson_id` ← `lesson_id`, `dok_level` ← `dok`.
 * The result is parsed back through `QuestionSchema`, so an authored record that
 * would produce an invalid v7 record fails loudly rather than being stored.
 */
export function authoredQuestionToV7(authored: AuthoredQuestion): V7Question {
  const a = AuthoredQuestionSchema.parse(authored);
  const correct = a.choices.find((choice) => choice.correct);
  if (correct === undefined) {
    // refineChoices already guarantees exactly one; this satisfies the type and
    // guards a caller that bypassed validation.
    throw new Error(`authored question ${a.id} has no correct choice`);
  }

  const explanations: Record<string, string> = {};
  const errorModels: Record<string, string> = {};
  for (const choice of a.choices) {
    explanations[choice.id] =
      choice.id === correct.id ? `${choice.rationale}\n\n${a.explanation}` : choice.rationale;
    errorModels[choice.id] = choice.correct
      ? 'correct_model'
      : `misconception: ${choice.misconception}`;
  }

  const choices = {
    A: a.choices[0]!.text,
    B: a.choices[1]!.text,
    C: a.choices[2]!.text,
    D: a.choices[3]!.text,
  };

  const isCars = a.section === 'CARS';
  const skill = a.skill.trim().toUpperCase();

  const v7Raw = {
    id: a.id,
    section: a.section,
    stem: a.stem,
    passage: a.passage ?? '',
    choices,
    correct_answer: correct.id,
    explanations,
    error_models: errorModels,
    dok_level: a.dok,
    family_id: a.family_id,
    status: 'production_candidate',
    ...(isCars
      ? {
          primary_skill: `CARS_${skill}`,
          ...(present(a.passage_id) ? { passage_id: a.passage_id } : {}),
        }
      : {
          primary_skill: skill,
          reasoning_operation: skill,
          ...(present(a.kc_id) ? { primary_kc_id: a.kc_id } : {}),
          ...(present(a.lesson_id) ? { lesson_id: a.lesson_id } : {}),
        }),
  };

  return QuestionSchema.parse(v7Raw);
}

// ---------------------------------------------------------------------------
// Practice-bank store rows — the two shapes the dev pull + Postgres upsert write.
// These mirror apps/learner-web/server/db-pull.ts (`PulledQuestion` /
// `PulledProtected`) plus the additive `reasoning_operation` column the corpus
// already carries in Postgres (migration 0008). Kept here so the ingest tool and
// the Postgres upsert map from ONE definition.
// ---------------------------------------------------------------------------

/** Learner-safe pull/DB row. NEVER carries answer material. */
export interface PracticeBankSafeRow {
  question_id: string;
  section: string;
  cluster: string | null;
  kc_id: string | null;
  lesson_id: string | null;
  family_id: string | null;
  subject: string | null;
  primary_skill: string | null;
  /** The 7-op reasoning axis; null for CARS. Additive vs the historical pull. */
  reasoning_operation: string | null;
  dok_level: number | null;
  stem: string;
  passage: string;
  choices: { A: string; B: string; C: string; D: string };
  status: string;
}

/** Server-only pull/DB row: key + per-choice explanations + misconceptions. */
export interface PracticeBankProtectedRow {
  question_id: string;
  correct_answer: ChoiceLetter;
  explanations: V7Explanations;
  /** Per-choice misconceptions (WS2); null when the item authored none. */
  error_models: V7ErrorModels | null;
}

export interface AuthoredQuestionBankRows {
  readonly safe: PracticeBankSafeRow;
  readonly protected: PracticeBankProtectedRow;
}

/**
 * Compile one authored question into the { safe, protected } store rows the
 * practice bank reads. Resolves the engine section + 15-cluster rollup (via the
 * KC→lesson→cluster path) and the reasoning operation exactly as the runtime
 * ports do, so an ingested item is classified identically to the pulled corpus.
 * Asserts the safe row is free of protected fields as defense in depth.
 */
export function authoredQuestionToBankRows(authored: AuthoredQuestion): AuthoredQuestionBankRows {
  const v7 = authoredQuestionToV7(authored);
  const { safe, protected: prot } = compileV7Question(v7);
  const placement = resolveV7Placement(v7);
  const reasoningOperation = resolveReasoningOperation(v7);

  const safeRow: PracticeBankSafeRow = {
    question_id: v7.id,
    section: placement.crossSection ? 'cross_section' : (placement.section ?? v7.section.toLowerCase()),
    cluster: placement.cluster,
    kc_id: v7.primary_kc_id ?? null,
    lesson_id: v7.lesson_id ?? null,
    family_id: v7.family_id ?? null,
    subject: v7.subject ?? null,
    primary_skill: v7.primary_skill ?? null,
    reasoning_operation: reasoningOperation,
    dok_level: v7.dok_level ?? null,
    stem: safe.stem,
    passage: safe.passage,
    choices: safe.choices,
    status: v7.status ?? 'production_candidate',
  };
  assertNoProtectedFields(safeRow, `authored:${v7.id}`);

  const protectedRow: PracticeBankProtectedRow = {
    question_id: v7.id,
    correct_answer: prot.correct_answer,
    explanations: prot.explanations,
    error_models: prot.error_models ?? null,
  };

  return { safe: safeRow, protected: protectedRow };
}
