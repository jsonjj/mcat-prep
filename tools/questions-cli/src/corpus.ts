import type {
  AuthoredQuestionBankRows,
  PracticeBankProtectedRow,
  PracticeBankSafeRow,
} from '@mcat/content';

/**
 * Pure corpus-pull → bank-row mapping used by the `seed` command. Kept out of
 * `main.ts` (which runs the CLI on import) so it can be unit-tested directly.
 *
 * The seed reads the SAME compiled projection the dev file-bank reads
 * (`content/question-bank/.local/db-pull`: `questions.json` learner-safe rows +
 * `protected.json` answer material), so a seeded Postgres matches the dev bank
 * byte-for-byte. This module only reshapes those two arrays into the
 * `{ safe, protected }` rows `upsertQuestions` consumes; referential integrity is
 * enforced separately by the shared @mcat/content guard.
 */

/** Raw shape of a `questions.json` row — mirrors server db-pull `PulledQuestion`. */
export interface RawSafeRow {
  question_id: string;
  section: string;
  cluster: string | null;
  kc_id: string | null;
  lesson_id: string | null;
  family_id: string | null;
  subject: string | null;
  primary_skill: string | null;
  reasoning_operation?: string | null;
  dok_level: number | null;
  stem: string;
  passage: string | null;
  choices: Record<string, string> | null;
  status: string | null;
}

/** Raw shape of a `protected.json` row — mirrors server db-pull `PulledProtected`. */
export interface RawProtectedRow {
  question_id: string;
  correct_answer: PracticeBankProtectedRow['correct_answer'];
  explanations: Record<string, string>;
  error_models?: Record<string, string> | null;
}

export interface ZipCorpusResult {
  readonly rows: AuthoredQuestionBankRows[];
  /** Per-row problems (missing protected pair, malformed choices) — empty when clean. */
  readonly problems: string[];
}

/**
 * Zip learner-safe rows with their protected pair by `question_id` into the bank
 * rows the upsert consumes. A safe row with no protected pair, or with choices
 * missing any of A–D, is reported in `problems` (never silently dropped) so the
 * caller can refuse to seed a half-written pull.
 */
export function zipCorpusRows(
  safeRows: readonly RawSafeRow[],
  protectedRows: readonly RawProtectedRow[],
): ZipCorpusResult {
  const protectedById = new Map(protectedRows.map((row) => [row.question_id, row] as const));
  const rows: AuthoredQuestionBankRows[] = [];
  const problems: string[] = [];

  for (const raw of safeRows) {
    const prot = protectedById.get(raw.question_id);
    if (prot === undefined) {
      problems.push(
        `  ${raw.question_id}: present in questions.json but missing from protected.json`,
      );
      continue;
    }
    const choices = raw.choices;
    if (
      choices === null ||
      typeof choices.A !== 'string' ||
      typeof choices.B !== 'string' ||
      typeof choices.C !== 'string' ||
      typeof choices.D !== 'string'
    ) {
      problems.push(`  ${raw.question_id}: choices are missing one of A–D`);
      continue;
    }
    const safe: PracticeBankSafeRow = {
      question_id: raw.question_id,
      section: raw.section,
      cluster: raw.cluster,
      kc_id: raw.kc_id,
      lesson_id: raw.lesson_id,
      family_id: raw.family_id,
      subject: raw.subject,
      primary_skill: raw.primary_skill,
      reasoning_operation: raw.reasoning_operation ?? null,
      dok_level: raw.dok_level,
      stem: raw.stem,
      passage: raw.passage ?? '',
      choices: { A: choices.A, B: choices.B, C: choices.C, D: choices.D },
      status: raw.status ?? 'production_candidate',
    };
    const protectedRow: PracticeBankProtectedRow = {
      question_id: prot.question_id,
      correct_answer: prot.correct_answer,
      explanations: prot.explanations as PracticeBankProtectedRow['explanations'],
      error_models: (prot.error_models ?? null) as PracticeBankProtectedRow['error_models'],
    };
    rows.push({ safe, protected: protectedRow });
  }

  return { rows, problems };
}
