/**
 * Check results and gating policy.
 *
 * Two design rules here, both taken directly from the evidence rather than from taste.
 *
 * First, **every check records its score, not just a verdict.** None of the thresholds
 * in `calibration.ts` is externally validated, so they will all be re-tuned once real
 * response data exists — and a boolean cannot be re-tuned. Scores are retained even
 * when a check passes.
 *
 * Second, **auto-reject and route-to-review are different actions,** because the costs
 * are asymmetric. The one published harness with a measured confusion matrix ran at
 * precision 0.60, meaning it sent roughly two healthy items to review for every three
 * genuinely broken ones caught. That is acceptable for routing and unacceptable for
 * rejection. Mechanical flaws — where the fault is deterministic and regeneration is
 * free — are auto-rejected; judgement calls are routed.
 */

/** What a failing check should cause. */
export type CheckSeverity =
  /** Deterministic, mechanical fault. Regenerate without human involvement. */
  | 'reject'
  /** Probabilistic signal. Send to a human with the reason named. */
  | 'review'
  /** Recorded for calibration only; never gates. */
  | 'info';

export interface CheckResult {
  readonly id: string;
  readonly severity: CheckSeverity;
  readonly passed: boolean;
  /** Human-readable statement of what was found. Shown to the reviewer verbatim. */
  readonly detail: string;
  /** Retained on pass and fail alike, so thresholds can be re-derived later. */
  readonly score?: number;
  readonly threshold?: number;
  /** Absent for set-level checks. */
  readonly itemId?: string;
}

export interface CheckReport {
  readonly results: readonly CheckResult[];
}

export function rejected(report: CheckReport): readonly CheckResult[] {
  return report.results.filter((r) => !r.passed && r.severity === 'reject');
}

export function needsReview(report: CheckReport): readonly CheckResult[] {
  return report.results.filter((r) => !r.passed && r.severity === 'review');
}

/** A set is publishable only if nothing was auto-rejected and nothing awaits review. */
export function verdict(report: CheckReport): 'accept' | 'review' | 'reject' {
  if (rejected(report).length > 0) return 'reject';
  if (needsReview(report).length > 0) return 'review';
  return 'accept';
}

export function summarize(report: CheckReport): string {
  const lines: string[] = [];
  const order: CheckSeverity[] = ['reject', 'review', 'info'];
  for (const severity of order) {
    const failures = report.results.filter((r) => !r.passed && r.severity === severity);
    if (failures.length === 0) continue;
    lines.push(`${severity.toUpperCase()} (${failures.length}):`);
    for (const failure of failures) {
      const scope = failure.itemId ? `[${failure.itemId}] ` : '[set] ';
      lines.push(`  ${scope}${failure.id}: ${failure.detail}`);
    }
  }
  const passed = report.results.filter((r) => r.passed).length;
  lines.push(`${passed}/${report.results.length} checks passed — verdict: ${verdict(report)}`);
  return lines.join('\n');
}
