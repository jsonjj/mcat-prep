import type { EngineQuestion } from './engine-schema';
import type { Question as V7Question } from './schema';

export interface ValidationIssue {
  code: string;
  path: string;
  message: string;
  severity: 'error' | 'warning';
  received?: string;
  allowed?: string[];
}

// ---- Engine projection validation -----------------------------------------

/** Semantic validation beyond Zod shape checks. Returns actionable issues. */
export function validateQuestion(q: EngineQuestion): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  const choiceIds = q.choices.map((c) => c.id);
  const unique = new Set(choiceIds);
  if (unique.size !== choiceIds.length) {
    issues.push({ code: 'duplicate_choice_id', path: '/choices', message: 'Choice ids must be unique.', severity: 'error' });
  }
  if (!choiceIds.includes(q.correct_choice_id)) {
    issues.push({
      code: 'correct_choice_missing',
      path: '/correct_choice_id',
      message: 'correct_choice_id must reference an existing choice.',
      severity: 'error',
      received: q.correct_choice_id,
      allowed: choiceIds,
    });
  }

  for (const id of choiceIds) {
    if (!q.rationales.choices[id]) {
      issues.push({
        code: 'missing_choice_rationale',
        path: `/rationales/choices/${id}`,
        message: `Every choice needs a rationale (missing ${id}).`,
        severity: 'error',
      });
    }
  }

  const eligible = q.delivery.diagnostic_eligible || q.delivery.mastery_eligible;
  if (eligible) {
    if (q.status !== 'published') {
      issues.push({ code: 'eligible_not_published', path: '/status', message: 'Diagnostic/mastery-eligible content must be published.', severity: 'error', received: q.status });
    }
    if (q.review.content_status !== 'approved' || q.review.accessibility_status !== 'approved') {
      issues.push({ code: 'eligible_not_reviewed', path: '/review', message: 'Eligible content requires approved content + accessibility review.', severity: 'error' });
    }
    if (q.provenance.rights_status !== 'cleared') {
      issues.push({ code: 'eligible_rights_uncleared', path: '/provenance/rights_status', message: 'Eligible content requires cleared rights.', severity: 'error', received: q.provenance.rights_status });
    }
  }
  // Note: whether test_only content may be *eligible* is release-scoped. Synthetic
  // content is eligible within a synthetic release; production is guarded separately
  // by assertNoSyntheticInProduction (which blocks any test_only content entirely).

  return issues;
}

/** Production publication must reject any test-only/synthetic content. */
export function assertNoSyntheticInProduction(questions: readonly EngineQuestion[]): ValidationIssue[] {
  return questions
    .filter((q) => q.delivery.test_only)
    .map((q) => ({
      code: 'synthetic_in_production',
      path: `/questions/${q.id}`,
      message: 'Synthetic/test-only content cannot be published to production.',
      severity: 'error' as const,
    }));
}

// ---- v7 canonical validation ----------------------------------------------

const LETTERS = ['A', 'B', 'C', 'D'] as const;

/**
 * Semantic validation for a v7 question beyond Zod shape checks. Zod already
 * guarantees the core shape; this reports completeness/consistency issues so a
 * load run can surface them without hard-failing the whole batch.
 */
export function validateV7Question(q: V7Question): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // Every choice needs an explanation (the answer-bearing rationale set).
  for (const letter of LETTERS) {
    if (!q.explanations[letter]) {
      issues.push({
        code: 'missing_choice_explanation',
        path: `/explanations/${letter}`,
        message: `Every choice needs an explanation (missing ${letter}).`,
        severity: 'error',
      });
    }
  }

  // correct_answer must reference a real choice (choices always carry A-D).
  if (!LETTERS.includes(q.correct_answer)) {
    issues.push({
      code: 'correct_answer_invalid',
      path: '/correct_answer',
      message: 'correct_answer must be one of A, B, C, D.',
      severity: 'error',
      received: q.correct_answer,
      allowed: [...LETTERS],
    });
  }

  // Assets: a "ready" asset should point at a stored file; a real asset needs alt text.
  q.assets.forEach((a, i) => {
    if (a.status === 'ready' && !a.storage_key) {
      issues.push({
        code: 'asset_ready_without_file',
        path: `/assets/${i}/storage_key`,
        message: 'A "ready" asset must have a storage_key.',
        severity: 'warning',
      });
    }
    if (a.type !== 'none' && a.status === 'ready' && a.alt.trim().length === 0) {
      issues.push({
        code: 'asset_missing_alt',
        path: `/assets/${i}/alt`,
        message: 'A ready non-"none" asset should have accessibility alt text.',
        severity: 'warning',
      });
    }
  });

  return issues;
}
