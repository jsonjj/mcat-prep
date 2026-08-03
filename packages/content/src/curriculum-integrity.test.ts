import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  CANONICAL_KC_IDS,
  CANONICAL_LESSON_IDS,
  validateCurriculumRefRow,
  validateCurriculumRefs,
  type CurriculumRefRow,
} from './curriculum-integrity';
import { KC_TO_LESSON } from './data/v3-cluster-map.data';

/**
 * The referential-integrity guard: canonical-set membership, the KC↔lesson mislink
 * check, and — critically — a scan of the real local corpus pull proving the guard
 * does NOT false-positive on the 2,108 valid items already in the bank.
 */

// A real, self-consistent science row: KC + its owning lesson + a resolved cluster.
const KC = 'V3-KC-534000';
const LESSON = KC_TO_LESSON[KC]!; // the KC's canonical owning lesson
const OTHER_LESSON = Object.keys(KC_TO_LESSON)
  .map((kc) => KC_TO_LESSON[kc]!)
  .find((lesson) => lesson !== LESSON)!;

const scienceRow = (over: Partial<CurriculumRefRow> = {}): CurriculumRefRow => ({
  question_id: 'q-science-1',
  section: 'bb',
  cluster: 'BB1',
  kc_id: KC,
  lesson_id: LESSON,
  ...over,
});

describe('canonical id sets', () => {
  it('exposes the 422 KCs and 114 lessons from the in-repo curriculum data', () => {
    expect(CANONICAL_KC_IDS.size).toBe(422);
    expect(CANONICAL_LESSON_IDS.size).toBe(114);
  });
});

describe('validateCurriculumRefRow', () => {
  it('accepts a self-consistent science row', () => {
    expect(validateCurriculumRefRow(scienceRow())).toEqual([]);
  });

  it('accepts a CARS row with no kc/lesson but a resolved cluster', () => {
    expect(
      validateCurriculumRefRow({
        question_id: 'q-cars-1',
        section: 'cars',
        cluster: 'CA1',
        kc_id: null,
        lesson_id: null,
      }),
    ).toEqual([]);
  });

  it('rejects an unknown kc_id', () => {
    const violations = validateCurriculumRefRow(scienceRow({ kc_id: 'V3-KC-000000' }));
    expect(violations.map((v) => v.code)).toContain('unknown_kc_id');
  });

  it('rejects an unknown lesson_id', () => {
    const violations = validateCurriculumRefRow(scienceRow({ lesson_id: 'V3-LES-000000' }));
    expect(violations.map((v) => v.code)).toContain('unknown_lesson_id');
  });

  it('flags a kc/lesson mislink (both resolve, but the KC owns a different lesson)', () => {
    const violations = validateCurriculumRefRow(scienceRow({ lesson_id: OTHER_LESSON }));
    const mismatch = violations.find((v) => v.code === 'kc_lesson_mismatch');
    expect(mismatch).toBeDefined();
    expect(mismatch?.message).toContain(LESSON);
    expect(mismatch?.message).toContain(OTHER_LESSON);
  });

  it('requires kc_id and lesson_id on a science item', () => {
    const violations = validateCurriculumRefRow(
      scienceRow({ kc_id: null, lesson_id: null, cluster: 'BB1' }),
    );
    expect(violations.map((v) => v.code)).toContain('missing_science_refs');
  });

  it('refuses a null cluster (no silent cluster=null)', () => {
    const violations = validateCurriculumRefRow(scienceRow({ cluster: null }));
    expect(violations.map((v) => v.code)).toContain('unresolved_cluster');
  });
});

describe('validateCurriculumRefs (batch)', () => {
  it('aggregates violations across rows and leaves clean rows out', () => {
    const violations = validateCurriculumRefs([
      scienceRow({ question_id: 'ok' }),
      scienceRow({ question_id: 'bad', kc_id: 'V3-KC-000000' }),
    ]);
    expect(violations.every((v) => v.question_id === 'bad')).toBe(true);
    expect(violations.length).toBeGreaterThan(0);
  });
});

/**
 * ZERO-FALSE-POSITIVE gate. The gitignored local pull is the real 2,108-item corpus;
 * when it is present (developer machine) the guard must report exactly zero
 * violations. On a fresh clone / CI the pull is absent and this is skipped so the
 * suite stays green — the fixture cases above still exercise the logic there.
 */
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const PULL_QUESTIONS = join(
  REPO_ROOT,
  'content',
  'question-bank',
  '.local',
  'db-pull',
  'questions.json',
);

describe('local corpus pull', () => {
  it.skipIf(!existsSync(PULL_QUESTIONS))(
    'has zero referential-integrity violations',
    () => {
      const rows = JSON.parse(readFileSync(PULL_QUESTIONS, 'utf8')) as CurriculumRefRow[];
      expect(Array.isArray(rows)).toBe(true);
      expect(rows.length).toBeGreaterThan(0);
      const violations = validateCurriculumRefs(rows);
      expect(violations).toEqual([]);
    },
  );
});
