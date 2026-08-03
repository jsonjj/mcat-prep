import { describe, expect, it } from 'vitest';
import { zipCorpusRows, type RawProtectedRow, type RawSafeRow } from './corpus';

/**
 * The pure corpus-pull → bank-row mapping the `seed` command relies on: it must zip
 * the safe + protected arrays by id, carry the fields through faithfully, and surface
 * (not swallow) a misaligned or malformed pull.
 */

const safe = (over: Partial<RawSafeRow> = {}): RawSafeRow => ({
  question_id: 'q1',
  section: 'bb',
  cluster: 'BB1',
  kc_id: 'V3-KC-534000',
  lesson_id: 'V3-LES-264096',
  family_id: 'fam-1',
  subject: 'biochemistry',
  primary_skill: 'SIRS2',
  dok_level: 2,
  stem: 'Stem?',
  passage: 'A passage.',
  choices: { A: 'a', B: 'b', C: 'c', D: 'd' },
  status: 'production_candidate',
  ...over,
});

const prot = (over: Partial<RawProtectedRow> = {}): RawProtectedRow => ({
  question_id: 'q1',
  correct_answer: 'B',
  explanations: { A: 'no', B: 'yes', C: 'no', D: 'no' },
  error_models: { A: 'trap', B: 'correct_model', C: 'trap', D: 'trap' },
  ...over,
});

describe('zipCorpusRows', () => {
  it('zips safe + protected rows by question_id and carries fields through', () => {
    const { rows, problems } = zipCorpusRows([safe()], [prot()]);
    expect(problems).toEqual([]);
    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row.safe.question_id).toBe('q1');
    expect(row.safe.choices).toEqual({ A: 'a', B: 'b', C: 'c', D: 'd' });
    expect(row.protected.correct_answer).toBe('B');
    expect(row.protected.error_models).toEqual({
      A: 'trap',
      B: 'correct_model',
      C: 'trap',
      D: 'trap',
    });
  });

  it('defaults a missing reasoning_operation to null and an absent error_models to null', () => {
    // A protected row from an older pull that predates error_models (key omitted).
    const legacyProtected: RawProtectedRow = {
      question_id: 'q1',
      correct_answer: 'B',
      explanations: { A: 'no', B: 'yes', C: 'no', D: 'no' },
    };
    const { rows } = zipCorpusRows([safe()], [legacyProtected]);
    expect(rows[0]!.safe.reasoning_operation).toBeNull();
    expect(rows[0]!.protected.error_models).toBeNull();
  });

  it('normalizes a null passage to an empty string', () => {
    const { rows } = zipCorpusRows([safe({ passage: null })], [prot()]);
    expect(rows[0]!.safe.passage).toBe('');
  });

  it('reports a safe row with no protected pair (never silently drops it)', () => {
    const { rows, problems } = zipCorpusRows([safe({ question_id: 'orphan' })], [prot()]);
    expect(rows).toEqual([]);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('orphan');
    expect(problems[0]).toContain('missing from protected.json');
  });

  it('reports choices missing one of A–D', () => {
    const { rows, problems } = zipCorpusRows(
      [safe({ choices: { A: 'a', B: 'b', C: 'c' } })],
      [prot()],
    );
    expect(rows).toEqual([]);
    expect(problems[0]).toContain('missing one of A–D');
  });
});
