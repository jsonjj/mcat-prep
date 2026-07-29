import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Authority } from '@mcat/authority-core';
import { loadSyntheticBank } from '@mcat/content';
import { PracticeQuestionSchema, type Clock, type UtcTimestamp } from '@mcat/contracts';
import { createFilePracticeBankPort, FilePracticeBankPort } from './practice-bank-file';
import {
  loadPulledCorpus,
  type PulledCorpus,
  type PulledProtected,
  type PulledQuestion,
} from './db-pull';

/**
 * The file-backed practice bank, exercised against an INLINE corpus. Nothing here
 * reads content/question-bank/.local/db-pull, which is gitignored and absent in
 * CI — the fixture instead reproduces the pull's field names and the shapes that
 * broke practice before: real `V3-KC-*` ids, a `primary_skill` that has to be
 * mapped onto the 7-op reasoning axis, and per-choice explanation prose.
 */

const at = '2026-07-28T12:00:00.000Z' as UtcTimestamp;
const clock: Clock = { now: () => at };

const question = (over: Partial<PulledQuestion> & { question_id: string }): PulledQuestion => ({
  section: 'bb',
  cluster: 'BB1',
  kc_id: 'V3-KC-534000',
  lesson_id: 'V3-LES-264096',
  family_id: 'fam-a',
  subject: 'biochemistry',
  primary_skill: 'SIRS2',
  dok_level: 2,
  stem: `Stem for ${over.question_id}?`,
  passage: 'A secreted enzyme depends on two disulfide bonds.',
  choices: { A: 'option a', B: 'option b', C: 'option c', D: 'option d' },
  status: 'production_candidate',
  ...over,
});

const key = (id: string, correct: 'A' | 'B' | 'C' | 'D' = 'B'): PulledProtected => ({
  question_id: id,
  correct_answer: correct,
  explanations: {
    A: `why A is wrong on ${id}`,
    B: `why B is right on ${id}`,
    C: `why C is wrong on ${id}`,
    D: `why D is wrong on ${id}`,
  },
});

const corpusOf = (questions: PulledQuestion[], keys: PulledProtected[]): PulledCorpus => ({
  questions,
  protectedById: new Map(keys.map((k) => [k.question_id, k])),
});

const CORPUS = corpusOf(
  [
    question({ question_id: 'sirs2-a', dok_level: 1 }),
    question({ question_id: 'sirs2-b', dok_level: 3 }),
    question({
      question_id: 'sirs1-a',
      primary_skill: 'SIRS1',
      kc_id: 'V3-KC-100',
      cluster: 'CP1',
      section: 'cp',
    }),
    question({
      question_id: 'sirs4-a',
      primary_skill: 'SIRS4',
      kc_id: 'V3-KC-200',
      cluster: 'R2',
      section: 'cross_section',
    }),
    question({
      question_id: 'cars-a',
      primary_skill: 'CARS_FOC',
      kc_id: 'V3-KC-900',
      cluster: 'CA1',
      section: 'cars',
    }),
    // Undeliverable rows: held out, and missing a choice.
    question({ question_id: 'retired-a', status: 'retired' }),
    question({ question_id: 'broken-a', choices: { A: 'a', B: 'b', C: 'c', D: '' } }),
    // Deliverable but keyless: nothing to score or refute with.
    question({ question_id: 'keyless-a' }),
  ],
  [
    key('sirs2-a'),
    key('sirs2-b'),
    key('sirs1-a', 'C'),
    key('sirs4-a'),
    key('cars-a'),
    key('retired-a'),
    key('broken-a'),
  ],
);

const port = (): FilePracticeBankPort => new FilePracticeBankPort(CORPUS);

describe('FilePracticeBankPort loading', () => {
  it('drops held-out, malformed and keyless rows', async () => {
    const bank = port();

    expect(bank.stats.rows).toBe(8);
    expect(bank.stats.items).toBe(5);
    expect(await bank.getQuestion('retired-a')).toBeNull();
    expect(await bank.getQuestion('broken-a')).toBeNull();
    expect(await bank.getQuestion('keyless-a')).toBeNull();
  });

  it('returns null instead of an empty port when there is no pull', () => {
    // The fresh-clone / CI path: the pull directory is gitignored and absent, so
    // the loader yields nothing and the caller falls back to the synthetic bank.
    expect(loadPulledCorpus(join(tmpdir(), 'mcat-db-pull-does-not-exist'))).toBeNull();
    expect(createFilePracticeBankPort(null)).toBeNull();
    expect(createFilePracticeBankPort(corpusOf([], []))).toBeNull();
  });

  it('serves learner-safe questions that satisfy the wire contract', async () => {
    const question = await port().getQuestion('sirs2-a');

    expect(PracticeQuestionSchema.parse(question)).toEqual({
      id: 'sirs2-a',
      section: 'bb',
      cluster: 'BB1',
      passage: 'A secreted enzyme depends on two disulfide bonds.',
      stem: 'Stem for sirs2-a?',
      choices: [
        { id: 'A', text: 'option a' },
        { id: 'B', text: 'option b' },
        { id: 'C', text: 'option c' },
        { id: 'D', text: 'option d' },
      ],
    });
    expect(JSON.stringify(question)).not.toContain('why B is right');
  });
});

describe('FilePracticeBankPort classification', () => {
  it('maps the corpus field names onto the mastery grain', async () => {
    expect(await port().classify('sirs2-a')).toEqual({
      kcId: 'V3-KC-534000',
      // SIRS2 with no construct text seeds EXPLAIN, as on a content-only database.
      skill: 'EXPLAIN',
      carsSkill: null,
      cluster: 'BB1',
      domain: 'science',
      dok: 1,
      lessonId: 'V3-LES-264096',
      familyId: 'fam-a',
    });
  });

  it('maps each v7 skill code to its reasoning operation', async () => {
    const bank = port();
    expect((await bank.classify('sirs1-a'))?.skill).toBe('IDENTIFY');
    expect((await bank.classify('sirs4-a'))?.skill).toBe('EVIDENCE');
  });

  it('routes CARS items to the CARS track, not the science one', async () => {
    const cars = await port().classify('cars-a');

    expect(cars?.domain).toBe('cars');
    expect(cars?.carsSkill).toBe('FOC');
    expect(cars?.skill).toBeNull();
  });

  it('has no classification for an unknown id', async () => {
    expect(await port().classify('nope')).toBeNull();
  });
});

describe('FilePracticeBankPort units', () => {
  it('exposes one unit per KC × skill × cluster × section, richest first', async () => {
    const units = await port().listUnits({ limit: 400 });

    expect(units.map((u) => [u.kcId, u.skill, u.carsSkill, u.itemCount])).toEqual([
      ['V3-KC-534000', 'EXPLAIN', null, 2],
      ['V3-KC-100', 'IDENTIFY', null, 1],
      ['V3-KC-200', 'EVIDENCE', null, 1],
      ['V3-KC-900', null, 'FOC', 1],
    ]);
  });

  it('averages DOK across the unit, as the Postgres port does', async () => {
    const [richest] = await port().listUnits({ limit: 400 });

    // dok 1 and dok 3 → 2.
    expect(richest?.dok).toBe(2);
  });

  it('survives the snapshot skill/cluster filter — every unit is practisable', async () => {
    const bank = port();
    const units = await bank.listUnits({ limit: 400 });

    // A unit with a null skill or cluster is dropped by buildPracticeSnapshot and
    // is therefore invisible to selection, which looks identical to an empty bank.
    const practisable = units.filter((u) =>
      u.domain === 'cars' ? u.carsSkill !== null : u.skill !== null && u.cluster !== null,
    );
    expect(practisable).toHaveLength(units.length);
    expect(bank.stats.practisableUnits).toBe(units.length);
  });

  it('honours the limit', async () => {
    expect(await port().listUnits({ limit: 2 })).toHaveLength(2);
  });
});

describe('FilePracticeBankPort item search', () => {
  it('filters to the requested KC and reasoning operation', async () => {
    const items = await port().findItems(
      { domain: 'science', kcId: 'V3-KC-534000', skill: 'EXPLAIN', targetB: 0 },
      { excludeIds: [], limit: 10 },
    );

    expect(items.map((i) => i.question.id).sort()).toEqual(['sirs2-a', 'sirs2-b']);
    // Uncalibrated corpus: `b` is withheld, DOK is carried for the cold start.
    expect(items.every((i) => i.b === null && i.attempts === 0)).toBe(true);
  });

  it('never returns an excluded (already-seen) item', async () => {
    const items = await port().findItems(
      { domain: 'science', kcId: 'V3-KC-534000', targetB: 0 },
      { excludeIds: ['sirs2-a'], limit: 10 },
    );

    expect(items.map((i) => i.question.id)).toEqual(['sirs2-b']);
  });

  it('ranks by distance from the target difficulty', async () => {
    const bank = port();
    const easy = await bank.findItems(
      { domain: 'science', kcId: 'V3-KC-534000', targetB: -2 },
      { excludeIds: [], limit: 1 },
    );
    const hard = await bank.findItems(
      { domain: 'science', kcId: 'V3-KC-534000', targetB: 2 },
      { excludeIds: [], limit: 1 },
    );

    expect(easy[0]?.question.id).toBe('sirs2-a'); // dok 1
    expect(hard[0]?.question.id).toBe('sirs2-b'); // dok 3
  });

  it('keeps the CARS pool out of science queries and vice versa', async () => {
    const bank = port();
    const science = await bank.findItems(
      { domain: 'science', targetB: 0 },
      { excludeIds: [], limit: 10 },
    );
    const cars = await bank.findItems(
      { domain: 'cars', carsSkill: 'FOC', targetB: 0 },
      { excludeIds: [], limit: 10 },
    );

    expect(science.map((i) => i.question.id)).not.toContain('cars-a');
    expect(cars.map((i) => i.question.id)).toEqual(['cars-a']);
    expect(
      await bank.findItems(
        { domain: 'cars', carsSkill: 'RWT', targetB: 0 },
        { excludeIds: [], limit: 10 },
      ),
    ).toEqual([]);
  });
});

describe('FilePracticeBankPort answers', () => {
  it('carries the key and all four refutations from protected.json', async () => {
    expect(await port().getAnswer('sirs2-a')).toEqual({
      correctChoiceId: 'B',
      rationale: 'why B is right on sirs2-a',
      choiceRationales: {
        A: 'why A is wrong on sirs2-a',
        B: 'why B is right on sirs2-a',
        C: 'why C is wrong on sirs2-a',
        D: 'why D is wrong on sirs2-a',
      },
    });
  });

  it('has no answer for an item it does not serve', async () => {
    expect(await port().getAnswer('keyless-a')).toBeNull();
  });

  it('reports no population stats — difficulty stays the DOK cold start', async () => {
    expect(await port().questionStats()).toEqual({ attempts: 0, correct: 0 });
  });
});

describe('FilePracticeBankPort per-learner bookkeeping', () => {
  it('remembers exposure so an item is not re-served', async () => {
    const bank = port();
    await bank.recordExposure('learner-1', 'sirs2-a', at);

    expect(await bank.recentlySeenIds('learner-1', { withinDays: 14, limit: 10 })).toEqual([
      'sirs2-a',
    ]);
    expect(await bank.recentlySeenIds('learner-2', { withinDays: 14, limit: 10 })).toEqual([]);
  });

  it('forgets exposure older than the window', async () => {
    const bank = port();
    await bank.recordExposure('learner-1', 'sirs2-a', '2026-06-01T00:00:00.000Z' as UtcTimestamp);

    expect(await bank.recentlySeenIds('learner-1', { withinDays: 14, limit: 10 })).toEqual([]);
  });

  it('queues repair against the real KC id, newest first and deduplicated', async () => {
    const bank = port();
    await bank.queueRepair('learner-1', { kcId: 'V3-KC-534000', skill: 'EXPLAIN' }, at);
    await bank.queueRepair('learner-1', { kcId: 'V3-KC-100' }, at);
    await bank.queueRepair('learner-1', { kcId: 'V3-KC-534000' }, at);

    expect(await bank.recentMisses('learner-1', { limit: 10 })).toEqual([
      { kcId: 'V3-KC-534000' },
      { kcId: 'V3-KC-100' },
    ]);
  });

  it('logs one attempt row per item and activity type', async () => {
    const bank = port();
    const entry = {
      questionId: 'sirs2-a',
      kcId: 'V3-KC-534000',
      skill: 'EXPLAIN' as const,
      cluster: 'BB1' as const,
      familyId: 'fam-a',
      chosenChoiceId: 'A' as const,
      correct: false,
      firstAttempt: true,
      activityType: 'practice' as const,
      occurredAt: at,
    };
    await bank.recordPracticeAttempt('learner-1', entry);
    await bank.recordPracticeAttempt('learner-1', { ...entry, chosenChoiceId: 'C' });
    await bank.recordPracticeAttempt('learner-1', { ...entry, activityType: 'study' });

    const rows = await bank.listPracticeAttempts('learner-1', { limit: 10 });
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.activityType).sort()).toEqual(['practice', 'study']);
    expect(rows.find((r) => r.activityType === 'practice')?.chosenChoiceId).toBe('A');
  });
});

describe('the Mistakes pipeline over the file-backed bank', () => {
  /**
   * The regression this guards: the error log hydrates a practice miss through
   * `getQuestion` + `getAnswer` on the injected port. That used to resolve against
   * the synthetic bank, so swapping the corpus underneath is exactly the change
   * that could leave every Mistakes row blank.
   */
  it('shows a real item back with its stem, both options and the refutation', async () => {
    const authority = new Authority(loadSyntheticBank(), clock, port());
    const state = authority.createGuest();

    const result = await authority.submitPracticeAttempt(state, {
      questionId: 'sirs2-a',
      specId: 'spec-1',
      chosenChoiceId: 'A',
    });
    expect(result.correct).toBe(false);
    expect(result.choiceRationales.A).toBe('why A is wrong on sirs2-a');

    const [entry, ...rest] = await authority.getErrorLog(state);
    expect(rest).toHaveLength(0);
    expect(entry).toMatchObject({
      questionId: 'sirs2-a',
      kcId: 'V3-KC-534000',
      skillId: 'EXPLAIN',
      cluster: 'BB1',
      stem: 'Stem for sirs2-a?',
      chosenChoiceId: 'A',
      chosenChoiceText: 'option a',
      correctChoiceId: 'B',
      correctChoiceText: 'option b',
      choiceRationale: 'why A is wrong on sirs2-a',
      resolved: false,
    });
  });

  it('groups two misses on the same KC into one pattern at the real KC grain', async () => {
    const authority = new Authority(loadSyntheticBank(), clock, port());
    const state = authority.createGuest();
    for (const questionId of ['sirs2-a', 'sirs2-b']) {
      await authority.submitPracticeAttempt(state, {
        questionId,
        specId: 'spec-1',
        chosenChoiceId: 'A',
      });
    }

    const patterns = await authority.getMistakePatterns(state);
    const kc = patterns.find((p) => p.grain === 'kc' && p.key === 'V3-KC-534000');
    expect(kc).toMatchObject({ missedItems: 2, attemptedItems: 2 });
    expect(patterns.every((p) => p.attemptedItems >= p.missedItems)).toBe(true);
  });

  it('builds a queue of real items and never re-serves an answered one', async () => {
    const authority = new Authority(loadSyntheticBank(), clock, port());
    const state = authority.createGuest();

    const first = await authority.getPracticeQueue(state, 3);
    expect(first.items.length).toBeGreaterThan(0);
    expect(first.items.every((i) => !i.question.id.startsWith('q-enz-'))).toBe(true);

    // Exposure is recorded when an item is ANSWERED, so answering the first queue
    // is what must keep those items out of the next one.
    const servedFirst = first.items.map((i) => i.question.id);
    for (const item of first.items) {
      await authority.submitPracticeAttempt(state, {
        questionId: item.question.id,
        specId: item.specId,
        chosenChoiceId: 'A',
      });
    }

    const second = await authority.getPracticeQueue(state, 3);
    for (const id of second.items.map((i) => i.question.id)) {
      expect(servedFirst).not.toContain(id);
    }
  });
});
