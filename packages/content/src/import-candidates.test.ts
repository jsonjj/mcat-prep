import { describe, expect, it } from 'vitest';
import { assertNoProtectedFields, compileQuestion } from './compile';
import { importCandidates, parseCandidateQuestion } from './import-candidates';

const CANDIDATE = {
  candidate_id: 'test-bb1-disulfide',
  choices: ['adds peptide bonds', 'becomes RNA', 'codons change', 'loses activity'],
  proposed_key: 'D',
  option_rationales: {
    A: 'Reducing disulfides does not create peptide bonds.',
    B: 'It does not become RNA.',
    C: 'Codons are unaffected by a reducing agent.',
    D: 'Correct: disulfides stabilize tertiary structure.',
  },
  learner_visible: {
    passage: 'A secreted protein requires two disulfide bonds to fold.',
    stem: 'Which outcome is most likely if those bonds are essential?',
  },
  target: { skill: 'BB1', subject: 'biochemistry' },
  blueprint: {
    operation: 'predict structure-function outcome',
    learning_objective: 'Predict consequences of disrupting disulfide-stabilized structure.',
    content_topic: 'disulfide bonds',
  },
  retrieval_item_ids: ['p001-q5'],
};

describe('candidate importer', () => {
  it('maps a candidate to a canonical, unverified draft item', () => {
    const { question, stimulus } = parseCandidateQuestion(CANDIDATE);
    expect(question.skill_cluster).toBe('BB1');
    expect(question.section).toBe('bb');
    expect(question.status).toBe('draft');
    expect(question.correct_choice_id).toBe('D');
    expect(question.delivery.mastery_eligible).toBe(false);
    expect(question.delivery.protected).toBe(true);
    expect(question.provenance.ai_assisted).toBe(true);
    expect(stimulus?.type).toBe('experiment');
  });

  it('compiles to a learner-safe payload with no key or rationales', () => {
    const { question } = parseCandidateQuestion(CANDIDATE);
    const { safe } = compileQuestion(question);
    expect(() => assertNoProtectedFields(safe)).not.toThrow();
    expect(safe).not.toHaveProperty('correct_choice_id');
    expect(safe.choices).toHaveLength(4);
  });

  it('collects errors for malformed lines instead of throwing', () => {
    const text = [JSON.stringify(CANDIDATE), '{ not json', JSON.stringify({ bogus: true })].join('\n');
    const { items, errors } = importCandidates([{ name: 'test.jsonl', text }]);
    expect(items).toHaveLength(1);
    expect(errors).toHaveLength(2);
  });
});
