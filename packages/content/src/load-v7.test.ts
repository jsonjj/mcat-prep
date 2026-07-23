import { describe, expect, it } from 'vitest';
import { assertNoProtectedFields, compileV7Question } from './compile';
import { loadV7Jsonl, parseV7Question, summarizeV7 } from './load-v7';
import { QuestionSchema } from './schema';
import { validateV7Question } from './validate';

// Synthetic, fictional v7 record (never real MCAT material).
const V7_RECORD = {
  id: 'v7-test-disulfide-0001',
  section: 'BB',
  subject: 'biochemistry',
  primary_skill: 'SIRS2',
  primary_kc_id: 'V3-KC-000000',
  family_id: 'fam-test-disulfide',
  stem: 'If required disulfide bonds are reduced, what is the most likely outcome?',
  passage: 'A secreted protein requires two disulfide bonds to fold into its active shape.',
  choices: {
    A: 'Hydrophobic packing fully compensates and activity rises.',
    B: 'Loss of covalent cross-links loosens the active shape and activity falls.',
    C: 'The peptide backbone is hydrolyzed.',
    D: 'The protein becomes a nucleic acid.',
  },
  correct_answer: 'B',
  explanations: {
    A: 'Noncovalent packing does not replace the required disulfides.',
    B: 'Correct: disulfides are covalent braces for tertiary structure.',
    C: 'Reduction does not hydrolyze the backbone.',
    D: 'Reduction does not change the molecule into a nucleic acid.',
  },
  dok_level: 2,
  status: 'production_candidate',
};

describe('v7 loader', () => {
  it('parses a v7 record and defaults assets to an empty list', () => {
    const q = parseV7Question(V7_RECORD);
    expect(q.section).toBe('BB');
    expect(q.primary_skill).toBe('SIRS2');
    expect(q.assets).toEqual([]);
    expect(q.schema_version).toBe('v7');
  });

  it('keeps unknown v7 metadata rather than hard-failing', () => {
    const q = parseV7Question({ ...V7_RECORD, empirical_calibration: { p_value: 0.42 }, novel_field: 'x' });
    expect((q as Record<string, unknown>).novel_field).toBe('x');
  });

  it('compiles a learner-safe payload with no answer key or explanations', () => {
    const q = parseV7Question(V7_RECORD);
    const { safe, protected: prot } = compileV7Question(q);
    expect(() => assertNoProtectedFields(safe)).not.toThrow();
    const json = JSON.stringify(safe);
    expect(json).not.toContain('correct_answer');
    expect(json).not.toContain('explanations');
    // The protected payload carries the answer material.
    expect(prot.correct_answer).toBe('B');
    expect(prot.explanations.B).toContain('Correct');
  });

  it('does not leak an asset generation spec to the learner-safe payload', () => {
    const q = parseV7Question({
      ...V7_RECORD,
      assets: [{ type: 'plot', status: 'needed', spec: 'secret generation spec', alt: 'a plot' }],
    });
    const { safe } = compileV7Question(q);
    expect(JSON.stringify(safe)).not.toContain('secret generation spec');
    expect(safe.assets[0]).toMatchObject({ type: 'plot', status: 'needed', alt: 'a plot', storage_key: null });
  });

  it('collects errors for malformed / invalid lines instead of throwing', () => {
    const bad = JSON.stringify({ ...V7_RECORD, section: 'NOT_A_SECTION' });
    const text = [JSON.stringify(V7_RECORD), '{ not json', bad].join('\n');
    const { items, errors } = loadV7Jsonl([{ name: 'test.jsonl', text }]);
    expect(items).toHaveLength(1);
    expect(errors).toHaveLength(2);
  });

  it('flags a missing per-choice explanation as a semantic error', () => {
    const q = QuestionSchema.parse({
      ...V7_RECORD,
      explanations: { A: 'a', B: 'b', C: 'c' }, // missing D
    });
    const issues = validateV7Question(q);
    expect(issues.some((i) => i.code === 'missing_choice_explanation' && i.severity === 'error')).toBe(true);
  });

  it('summarizes counts by section and passage/asset presence', () => {
    const result = loadV7Jsonl([{ name: 'test.jsonl', text: JSON.stringify(V7_RECORD) }]);
    const summary = summarizeV7(result);
    expect(summary.total).toBe(1);
    expect(summary.bySection.BB).toBe(1);
    expect(summary.withPassage).toBe(1);
    expect(summary.withAssets).toBe(0);
  });
});
