import type { Question } from './schema';

/**
 * Compile a canonical question into two artifacts using an ALLOWLIST (never a
 * denylist). The learner-safe payload cannot represent the key or rationales;
 * distractor-family hypotheses are also withheld (diagnostic metadata).
 */
export interface LearnerSafeChoice {
  id: 'A' | 'B' | 'C' | 'D';
  text: string;
}

export interface LearnerSafeQuestion {
  id: string;
  version: number;
  section: Question['section'];
  skill_cluster: Question['skill_cluster'];
  internal_skill_ids: string[];
  template_tags: Question['template_tags'];
  format: Question['format'];
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
  rationales: Question['rationales'];
}

export interface CompiledQuestion {
  safe: LearnerSafeQuestion;
  protected: ProtectedQuestionPayload;
}

export function compileQuestion(q: Question): CompiledQuestion {
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

const PROTECTED_KEYS = ['correct_choice_id', 'rationales', 'distractor_families'] as const;

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
