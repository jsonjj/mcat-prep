/**
 * Computed quality checks (Real Lesson Catalog, Phase 3, Stream 3C) — deterministic,
 * free, permanent replacements for two rubric dimensions (decision register 2026-07-29).
 *
 * Two of the four computed checks already live in the merge gate — evidence independence
 * is R11 (semantic-family isolation) and declared-vs-actual KC coverage is R14 (completeness).
 * This module adds the other two: `estimatedMinutes` plausibility and difficulty-label
 * distribution.
 *
 * REALITY (verified 2026-07-30): the three real lessons carry NO calibrated timing — L1's
 * `timing_model` is entirely null ("uncalibrated pilot hypotheses"), L2/L3 omit it — and NO
 * per-item difficulty labels (difficulty is a v7 question-bank property, not a lesson property).
 * So both checks are honestly N/A on today's catalog. They are DETECT-THEN-ASSERT: they find
 * their input and only judge when a lesson actually populates it. N/A is returned EXPLICITLY
 * (never a silent pass), and a populated-but-implausible value FAILS so the check can gate a
 * future lesson. Pure (no IO); the CLI wrapper feeds parsed artifacts and treats FAIL as a gate.
 */

export type QualityStatus = 'pass' | 'fail' | 'na';

export interface QualityCheck {
  readonly check: string;
  readonly status: QualityStatus;
  readonly detail: string;
}

export interface QualityReport {
  readonly lessonId: string;
  /** ok unless a check actually FAILED (N/A never blocks). */
  readonly ok: boolean;
  readonly checks: readonly QualityCheck[];
}

const asRec = (v: unknown): Record<string, unknown> | undefined =>
  v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;
const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const payloadOf = (lessonScriptJson: unknown): Record<string, unknown> | undefined =>
  asRec(asRec(lessonScriptJson)?.payload);

/** The assessment items a lesson exercises — `payload.question_evidence_plan` (present in all three grammars). */
function items(lessonScriptJson: unknown): Record<string, unknown>[] {
  return asArray(payloadOf(lessonScriptJson)?.question_evidence_plan)
    .map(asRec)
    .filter((x): x is Record<string, unknown> => x !== undefined);
}

/**
 * `estimatedMinutes` plausibility against item count. Collects every numeric `*_minutes`
 * value in `payload.compilation_contract.timing_model`; N/A when none is populated (today's
 * lessons). When populated, the total must sit in a sane per-item band [0.5·N, 6·N] minutes,
 * else FAIL (a lesson claiming 2 or 500 minutes for 42 items is implausible).
 */
export function checkEstimatedMinutes(lessonScriptJson: unknown): QualityCheck {
  const timing = asRec(asRec(payloadOf(lessonScriptJson)?.compilation_contract)?.timing_model);
  const minutes = timing
    ? Object.entries(timing)
        .filter(([k]) => k.endsWith('_minutes'))
        .map(([, v]) => v)
        .filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
    : [];
  const n = items(lessonScriptJson).length;
  if (minutes.length === 0) {
    return {
      check: 'estimatedMinutes-plausibility',
      status: 'na',
      detail: `no calibrated timing to judge (timing_model absent or all-null; ${n} items)`,
    };
  }
  const total = minutes.reduce((a, b) => a + b, 0);
  const lo = 0.5 * n;
  const hi = 6 * n;
  const ok = n > 0 && total >= lo && total <= hi;
  return {
    check: 'estimatedMinutes-plausibility',
    status: ok ? 'pass' : 'fail',
    detail: ok
      ? `${total} min across ${n} items is within [${lo}, ${hi}]`
      : `${total} min for ${n} items is outside the plausible band [${lo}, ${hi}]`,
  };
}

const DIFFICULTY_KEYS = ['difficulty', 'difficulty_label', 'difficulty_band', 'dok_level'] as const;

/**
 * Difficulty-label distribution across items. N/A when items carry no difficulty field
 * (today's lessons — difficulty is a question-bank property). When present, the distribution
 * must not be degenerate: at least two distinct labels AND no single label exceeding 90% of
 * labelled items, else FAIL.
 */
export function checkDifficultyDistribution(lessonScriptJson: unknown): QualityCheck {
  const labels: string[] = [];
  for (const it of items(lessonScriptJson)) {
    for (const key of DIFFICULTY_KEYS) {
      const v = it[key];
      if (typeof v === 'string' && v.length > 0) labels.push(v);
      else if (typeof v === 'number') labels.push(String(v));
    }
  }
  if (labels.length === 0) {
    return {
      check: 'difficulty-distribution',
      status: 'na',
      detail: 'no per-item difficulty labels in lesson artifacts (difficulty is a question-bank property)',
    };
  }
  const counts = new Map<string, number>();
  for (const l of labels) counts.set(l, (counts.get(l) ?? 0) + 1);
  const distinct = counts.size;
  const maxShare = Math.max(...counts.values()) / labels.length;
  const ok = distinct >= 2 && maxShare <= 0.9;
  const spread = [...counts.entries()].map(([k, v]) => `${k}:${v}`).join(', ');
  return {
    check: 'difficulty-distribution',
    status: ok ? 'pass' : 'fail',
    detail: ok
      ? `${distinct} labels over ${labels.length} items (${spread}); max share ${(maxShare * 100).toFixed(0)}%`
      : `degenerate distribution (${spread}); need >=2 labels and max share <=90%`,
  };
}

/** Run both computed-quality checks for one lesson. `ok` is false only on an actual FAIL. */
export function computeQuality(lessonId: string, lessonScriptJson: unknown): QualityReport {
  const checks = [checkEstimatedMinutes(lessonScriptJson), checkDifficultyDistribution(lessonScriptJson)];
  return { lessonId, ok: !checks.some((c) => c.status === 'fail'), checks };
}
