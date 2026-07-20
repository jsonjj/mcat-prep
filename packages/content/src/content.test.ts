import { describe, expect, it } from 'vitest';
import { findHardPrerequisiteCycle } from '@mcat/domain';
import { loadSyntheticBank } from './bank';
import { assertNoProtectedFields, compileQuestion } from './compile';
import { assertNoSyntheticInProduction, validateQuestion } from './validate';

describe('synthetic bank', () => {
  const bank = loadSyntheticBank();

  it('loads valid synthetic content with an acyclic prerequisite graph', () => {
    expect(bank.questions.length).toBeGreaterThan(0);
    expect(findHardPrerequisiteCycle(bank.skillGraph)).toBeNull();
    expect(bank.manifest.counts.testOnly).toBe(bank.questions.length);
  });

  it('compiles learner-safe payloads with no answer keys or rationales', () => {
    for (const q of bank.questions) {
      const { safe } = compileQuestion(q);
      expect(() => assertNoProtectedFields(safe)).not.toThrow();
      expect(JSON.stringify(safe)).not.toContain('correct_choice_id');
      expect(JSON.stringify(safe)).not.toContain('rationales');
    }
  });

  it('keeps the answer key only in the protected payload', () => {
    const q = bank.questions.find((x) => x.id === 'q-enz-indep-competitive')!;
    const { protected: prot } = compileQuestion(q);
    expect(prot.correct_choice_id).toBe('A');
  });

  it('rejects synthetic content from production publication', () => {
    const issues = assertNoSyntheticInProduction(bank.questions);
    expect(issues.length).toBe(bank.questions.length);
    expect(issues[0]!.code).toBe('synthetic_in_production');
  });

  it('validates each question has a complete rationale set and a valid key', () => {
    for (const q of bank.questions) {
      expect(validateQuestion(q).filter((i) => i.severity === 'error')).toHaveLength(0);
    }
  });
});
