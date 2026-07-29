import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The gitignored local corpus pull (`content/question-bank/.local/db-pull`,
 * produced by .tmp/db-pull.mjs) as it sits on disk.
 *
 * This is the ONE reader of those files. Both server-side consumers — the
 * Bayesian diagnostic (`diagnostic-bank.ts`) and the adaptive-practice bank
 * port (`practice-bank-file.ts`) — map from this shape rather than parsing the
 * JSON again, so the field names of the pull are only spelled out in one place.
 *
 * Node-only: `protected.json` carries answer keys and explanation prose, so this
 * module must never be reachable from the browser bundle.
 */

/** One learner-safe row of `questions.json`, with the corpus' own field names. */
export interface PulledQuestion {
  question_id: string;
  section: string;
  cluster: string | null;
  /** v3 knowledge-component id (`V3-KC-*`) — the science mastery grain. */
  kc_id: string | null;
  lesson_id: string | null;
  family_id: string | null;
  subject: string | null;
  /** v7 skill code: SIRS1-4 / MATH-ENABLING / CARS_FOC|RWT|RBT. */
  primary_skill: string | null;
  dok_level: number | null;
  stem: string;
  passage: string | null;
  choices: Record<string, string> | null;
  status: string | null;
}

/** One row of `protected.json`. SERVER-ONLY: key + per-choice explanations. */
export interface PulledProtected {
  question_id: string;
  correct_answer: 'A' | 'B' | 'C' | 'D';
  explanations: Record<string, string>;
  /**
   * Per-choice authored misconceptions (WS2). SERVER-ONLY, like `explanations`.
   * Optional/nullable so an older pull produced before the re-publish reads as
   * "no error models" rather than failing to load; the reader passes it through
   * untouched, and the join that surfaces the picked option's misconception
   * degrades to null when it is absent.
   */
  error_models?: Record<string, string> | null;
}

export interface PulledCorpus {
  readonly questions: readonly PulledQuestion[];
  readonly protectedById: ReadonlyMap<string, PulledProtected>;
}

/** Where the pull lives, relative to this module (apps/learner-web/server). */
export function dbPullDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  // apps/learner-web/server → repo root
  return join(here, '..', '..', '..', 'content', 'question-bank', '.local', 'db-pull');
}

/**
 * Read the pull, or return null when it is absent or malformed — the normal case
 * on a fresh clone and in CI, where callers fall back to the synthetic fixtures.
 */
export function loadPulledCorpus(dir: string = dbPullDir()): PulledCorpus | null {
  try {
    const questions = JSON.parse(
      readFileSync(join(dir, 'questions.json'), 'utf8'),
    ) as PulledQuestion[];
    const keys = JSON.parse(readFileSync(join(dir, 'protected.json'), 'utf8')) as PulledProtected[];
    if (!Array.isArray(questions) || questions.length === 0 || !Array.isArray(keys)) return null;
    return {
      questions,
      protectedById: new Map(keys.map((k) => [k.question_id, k])),
    };
  } catch {
    return null;
  }
}
