import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { checkDifficultyDistribution, checkEstimatedMinutes, computeQuality } from './index';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const realScript = (dirName: string): unknown =>
  JSON.parse(readFileSync(join(repoRoot, 'content/lessons', dirName, 'lesson-script.json'), 'utf8')) as unknown;

/** Minimal synthetic lesson-script shape the checks read (payload.question_evidence_plan + timing_model). */
function script(opts: {
  itemCount: number;
  minutes?: Record<string, number | null> | undefined;
  difficulty?: (string | number)[] | undefined;
}): unknown {
  const qep = Array.from({ length: opts.itemCount }, (_, i) => ({
    item_id: `it-${i}`,
    ...(opts.difficulty && opts.difficulty[i] !== undefined ? { difficulty: opts.difficulty[i] } : {}),
  }));
  return {
    payload: {
      question_evidence_plan: qep,
      ...(opts.minutes ? { compilation_contract: { timing_model: opts.minutes } } : {}),
    },
  };
}

describe('computed-quality — honest N/A on the real (uncalibrated) catalog', () => {
  for (const dirName of ['v3-les-130923', 'v3-les-789208', 'v3-les-844372']) {
    it(`${dirName}: both checks are explicitly N/A, and the lesson is not blocked`, () => {
      const report = computeQuality(dirName.toUpperCase(), realScript(dirName));
      expect(report.ok, 'N/A must never block').toBe(true);
      const timing = report.checks.find((c) => c.check === 'estimatedMinutes-plausibility');
      const diff = report.checks.find((c) => c.check === 'difficulty-distribution');
      expect(timing?.status).toBe('na'); // timing_model null/absent
      expect(diff?.status).toBe('na'); // no per-item difficulty labels in lesson artifacts
    });
  }
});

describe('checkEstimatedMinutes — detect-then-assert plausibility', () => {
  it('N/A when timing_model is absent', () => {
    expect(checkEstimatedMinutes(script({ itemCount: 10 })).status).toBe('na');
  });
  it('N/A when every *_minutes value is null (the real L1 shape)', () => {
    const s = script({ itemCount: 10, minutes: { estimated_core_segment_minutes: null, estimated_branch_segment_minutes: null } });
    expect(checkEstimatedMinutes(s).status).toBe('na');
  });
  it('PASS when populated total sits in the per-item band', () => {
    // 10 items → band [5, 60]; 30 min is plausible
    const s = script({ itemCount: 10, minutes: { estimated_core_minutes: 20, estimated_branch_minutes: 10 } });
    expect(checkEstimatedMinutes(s).status).toBe('pass');
  });
  it('FAIL when populated total is implausibly small for the item count', () => {
    // 42 items → band [21, 252]; 3 min is implausible
    const s = script({ itemCount: 42, minutes: { estimated_total_minutes: 3 } });
    const c = checkEstimatedMinutes(s);
    expect(c.status).toBe('fail');
    expect(c.detail).toContain('outside the plausible band');
  });
});

describe('checkDifficultyDistribution — detect-then-assert non-degeneracy', () => {
  it('N/A when items carry no difficulty labels (today\u2019s lessons)', () => {
    expect(checkDifficultyDistribution(script({ itemCount: 5 })).status).toBe('na');
  });
  it('PASS on a varied distribution', () => {
    const s = script({ itemCount: 4, difficulty: ['easy', 'medium', 'hard', 'medium'] });
    expect(checkDifficultyDistribution(s).status).toBe('pass');
  });
  it('FAIL on a degenerate (single-label) distribution', () => {
    const s = script({ itemCount: 5, difficulty: ['medium', 'medium', 'medium', 'medium', 'medium'] });
    const c = checkDifficultyDistribution(s);
    expect(c.status).toBe('fail');
    expect(c.detail).toContain('degenerate');
  });
  it('a populated-but-degenerate lesson makes computeQuality.ok false (can gate a future lesson)', () => {
    const s = script({ itemCount: 3, difficulty: ['hard', 'hard', 'hard'] });
    expect(computeQuality('V3-LES-SYNTH', s).ok).toBe(false);
  });
});
