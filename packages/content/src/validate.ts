import type { Question } from './schema';

export interface ValidationIssue {
  code: string;
  path: string;
  message: string;
  severity: 'error' | 'warning';
  received?: string;
  allowed?: string[];
}

/** Semantic validation beyond Zod shape checks. Returns actionable issues. */
export function validateQuestion(q: Question): ValidationIssue[] {
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
export function assertNoSyntheticInProduction(questions: readonly Question[]): ValidationIssue[] {
  return questions
    .filter((q) => q.delivery.test_only)
    .map((q) => ({
      code: 'synthetic_in_production',
      path: `/questions/${q.id}`,
      message: 'Synthetic/test-only content cannot be published to production.',
      severity: 'error' as const,
    }));
}
