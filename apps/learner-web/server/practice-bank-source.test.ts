import { describe, expect, it, vi } from 'vitest';
import type { PracticeBankPort } from '@mcat/authority-core';
import {
  practiceBankSourceLine,
  selectPracticeBankSource,
  type PracticeBankSelection,
} from './practice-bank-source';
import { FilePracticeBankPort } from '@mcat/corpus-pull';

/**
 * The source choice is tested with every dependency injected, so none of these
 * cases needs a database or the gitignored corpus pull to be present. That
 * matters twice over: CI has neither, and the whole point of the branch is what
 * happens when one of them is missing.
 */

const corpus = {
  questions: [
    {
      question_id: 'q1',
      section: 'bb',
      cluster: 'BB1',
      kc_id: 'V3-KC-1',
      lesson_id: 'V3-LES-1',
      family_id: 'fam-1',
      subject: 'biochemistry',
      primary_skill: 'SIRS1',
      dok_level: 2,
      stem: 'Stem one?',
      passage: null,
      choices: { A: 'a', B: 'b', C: 'c', D: 'd' },
      status: 'production_candidate',
    },
  ],
  protectedById: new Map([
    [
      'q1',
      {
        question_id: 'q1',
        correct_answer: 'A' as const,
        explanations: { A: 'ka', B: 'kb', C: 'kc', D: 'kd' },
      },
    ],
  ]),
};

const filePort = (): FilePracticeBankPort => new FilePracticeBankPort(corpus);

const fakePostgres = { id: 'postgres' } as unknown as PracticeBankPort;

describe('practice bank source selection', () => {
  it('prefers Postgres when DATABASE_URL is set and never reads the pull', () => {
    const createFilePort = vi.fn(filePort);
    const selection = selectPracticeBankSource({
      databaseUrl: 'postgres://localhost/mcat',
      createPostgresPort: () => fakePostgres,
      createFilePort,
    });

    expect(selection.source).toBe('postgres');
    expect(selection.port).toBe(fakePostgres);
    expect(createFilePort).not.toHaveBeenCalled();
  });

  it('treats a blank DATABASE_URL as absent', () => {
    const selection = selectPracticeBankSource({
      databaseUrl: '   ',
      createPostgresPort: () => fakePostgres,
      createFilePort: filePort,
    });

    expect(selection.source).toBe('file-pull');
  });

  it('uses the local pull when there is no database, reporting what it loaded', () => {
    const selection = selectPracticeBankSource({
      databaseUrl: undefined,
      createFilePort: filePort,
    });

    expect(selection.source).toBe('file-pull');
    expect(selection.port).toBeInstanceOf(FilePracticeBankPort);
    expect(selection.items).toBe(1);
    expect(selection.practisableUnits).toBe(1);
  });

  it('falls back to the synthetic bank when the pull is absent', () => {
    const selection = selectPracticeBankSource({
      databaseUrl: undefined,
      createFilePort: () => null,
    });

    // `undefined` (not a port) is what makes the authority build its own
    // SyntheticPracticeBankPort — the fresh-clone / CI path.
    expect(selection).toEqual({
      source: 'synthetic',
      port: undefined,
      items: null,
      practisableUnits: null,
    });
  });

  it('falls back past a failed pool to the pull, warning once', () => {
    const warn = vi.fn();
    const selection = selectPracticeBankSource({
      databaseUrl: 'postgres://nope',
      createPostgresPort: () => {
        throw new Error('no pool');
      },
      createFilePort: filePort,
      warn,
    });

    expect(selection.source).toBe('file-pull');
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('survives a pull that throws while loading', () => {
    const warn = vi.fn();
    const selection = selectPracticeBankSource({
      databaseUrl: undefined,
      createFilePort: () => {
        throw new Error('malformed json');
      },
      warn,
    });

    expect(selection.source).toBe('synthetic');
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe('practice bank boot line', () => {
  const line = (selection: PracticeBankSelection): string => practiceBankSourceLine(selection);

  it('names the source and the item count in the [dev-authority] style', () => {
    expect(
      line({ source: 'postgres', port: fakePostgres, items: null, practisableUnits: null }),
    ).toMatch(/^\[dev-authority] practice bank: postgres/);
    const pull = line({
      source: 'file-pull',
      port: filePort(),
      items: 2108,
      practisableUnits: 400,
    });
    expect(pull).toMatch(/^\[dev-authority] practice bank: local corpus pull/);
    expect(pull).toContain('2108 items');
    expect(pull).toContain('400 practisable units');
    expect(
      line({ source: 'synthetic', port: undefined, items: null, practisableUnits: null }),
    ).toMatch(/^\[dev-authority] practice bank: synthetic fixture/);
  });
});
