import type { EngineQuestion } from './engine-schema';
import type { Asset, ChoiceLetter, Question as V7Question, V7Explanations } from './schema';

/**
 * Compile a canonical question into two artifacts using an ALLOWLIST (never a
 * denylist). The learner-safe payload cannot represent the key or rationales.
 *
 * Two shapes are supported:
 * - `compileV7Question` — the canonical v7 record (see `./schema.ts`). This is the
 *   path used for the production corpus. `correct_answer` + `explanations` are
 *   split into a protected/server-only payload.
 * - `compileQuestion` — the engine projection (see `./engine-schema.ts`) used by
 *   the synthetic bank + authority engine. Kept for the existing study loop.
 */

// ---- Engine projection compile (existing study loop) ----------------------

export interface LearnerSafeChoice {
  id: 'A' | 'B' | 'C' | 'D';
  text: string;
}

export interface LearnerSafeQuestion {
  id: string;
  version: number;
  section: EngineQuestion['section'];
  skill_cluster: EngineQuestion['skill_cluster'];
  internal_skill_ids: string[];
  template_tags: EngineQuestion['template_tags'];
  format: EngineQuestion['format'];
  stimulus_id: string | null;
  stem: string;
  choices: LearnerSafeChoice[];
  estimated_seconds: number;
  media_ids: string[];
  family_id: string;
}

export interface ProtectedQuestionPayload {
  id: string;
  version: number;
  correct_choice_id: 'A' | 'B' | 'C' | 'D';
  rationales: EngineQuestion['rationales'];
}

export interface CompiledQuestion {
  safe: LearnerSafeQuestion;
  protected: ProtectedQuestionPayload;
}

export function compileQuestion(q: EngineQuestion): CompiledQuestion {
  const safe: LearnerSafeQuestion = {
    id: q.id,
    version: q.version,
    section: q.section,
    skill_cluster: q.skill_cluster,
    internal_skill_ids: [...q.internal_skill_ids],
    template_tags: [...q.template_tags],
    format: q.format,
    stimulus_id: q.stimulus_id,
    stem: q.stem,
    choices: q.choices.map((c) => ({ id: c.id, text: c.text })),
    estimated_seconds: q.estimated_seconds,
    media_ids: [...q.media_ids],
    family_id: q.family_id,
  };
  const protectedPayload: ProtectedQuestionPayload = {
    id: q.id,
    version: q.version,
    correct_choice_id: q.correct_choice_id,
    rationales: q.rationales,
  };
  return { safe, protected: protectedPayload };
}

// ---- v7 canonical compile (production corpus) -----------------------------

/** An asset as shipped to the browser: NO generation `spec` (authoring-only). */
export interface LearnerSafeAsset {
  type: Asset['type'];
  status: Asset['status'];
  alt: string;
  storage_key: string | null;
}

/**
 * Browser-deliverable v7 question. This shape cannot represent `correct_answer`
 * or `explanations`, and drops each asset's authoring `spec`.
 */
export interface LearnerSafeV7Question {
  id: string;
  section: V7Question['section'];
  subject: string | null;
  primary_skill: string | null;
  family_id: string | null;
  stem: string;
  passage: string;
  choices: { A: string; B: string; C: string; D: string };
  assets: LearnerSafeAsset[];
}

/** Server-only answer material for a v7 question. */
export interface ProtectedV7Payload {
  id: string;
  correct_answer: ChoiceLetter;
  explanations: V7Explanations;
}

export interface CompiledV7Question {
  safe: LearnerSafeV7Question;
  protected: ProtectedV7Payload;
}

export function compileV7Question(q: V7Question): CompiledV7Question {
  const safe: LearnerSafeV7Question = {
    id: q.id,
    section: q.section,
    subject: q.subject ?? null,
    primary_skill: q.primary_skill ?? null,
    family_id: q.family_id ?? null,
    stem: q.stem,
    passage: q.passage ?? '',
    choices: { A: q.choices.A, B: q.choices.B, C: q.choices.C, D: q.choices.D },
    assets: q.assets.map((a) => ({
      type: a.type,
      status: a.status,
      alt: a.alt,
      storage_key: a.storage_key,
    })),
  };
  const protectedPayload: ProtectedV7Payload = {
    id: q.id,
    correct_answer: q.correct_answer,
    explanations: q.explanations,
  };
  return { safe, protected: protectedPayload };
}

// ---- Leak guard -----------------------------------------------------------

/**
 * Field names that must never appear in a learner-safe payload. Covers both the
 * engine projection (`correct_choice_id`, `rationales`, `distractor_families`)
 * and the canonical v7 shape (`correct_answer`, `explanations`), plus common
 * candidate synonyms.
 */
const PROTECTED_KEYS = [
  'correct_choice_id',
  'correct_answer',
  'rationales',
  'explanations',
  'distractor_families',
  'option_rationales',
  'proposed_key',
] as const;

/** Guard: assert an object about to reach a learner-safe surface has no protected fields. */
export function assertNoProtectedFields(payload: unknown, pathHint = '<payload>'): void {
  const seen = new Set<unknown>();
  const walk = (value: unknown, path: string): void => {
    if (value === null || typeof value !== 'object') return;
    if (seen.has(value)) return;
    seen.add(value);
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if ((PROTECTED_KEYS as readonly string[]).includes(key)) {
        throw new Error(`Protected field "${key}" found in learner-safe payload at ${path}.${key}`);
      }
      walk(child, `${path}.${key}`);
    }
  };
  walk(payload, pathHint);
}
