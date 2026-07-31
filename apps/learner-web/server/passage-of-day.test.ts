import { describe, expect, it } from 'vitest';
import {
  PASSAGE_OF_THE_DAY_POOL,
  type PassageChoiceId,
  type PassageOfTheDayEntry,
} from '../../../content/passage-of-the-day/pool';
import {
  learnerLocalDayIndex,
  PassageOfDayService,
  passageOfDayService,
} from './passage-of-day';

const CHOICE_IDS: readonly PassageChoiceId[] = ['A', 'B', 'C', 'D'];
const DAY_MS = 86_400_000;
const at = (iso: string): Date => new Date(iso);

function mkEntry(id: string): PassageOfTheDayEntry {
  return {
    id,
    title: `Title ${id}`,
    discipline: 'Test',
    body: [`Body of ${id}.`],
    questions: [
      {
        id: `${id}-q1`,
        stem: `Stem ${id}?`,
        choices: [
          { id: 'A', text: 'a' },
          { id: 'B', text: 'b' },
          { id: 'C', text: 'c' },
          { id: 'D', text: 'd' },
        ],
        correctChoiceId: 'A',
        rationale: `because a (${id})`,
        choiceRationales: { A: 'a is right', B: 'b misses', C: 'c misses', D: 'd misses' },
      },
    ],
  };
}

describe('learnerLocalDayIndex', () => {
  it('is stable across a single learner-local day (4 AM rollover, UTC)', () => {
    // Day boundary at 04:00Z when tz=0: [04:00Z, next 04:00Z) is one index.
    expect(learnerLocalDayIndex(at('2026-07-30T04:00:00Z'), 0)).toBe(
      learnerLocalDayIndex(at('2026-07-31T03:59:59Z'), 0),
    );
  });

  it('increments by one when the local day rolls over', () => {
    expect(learnerLocalDayIndex(at('2026-07-31T04:00:00Z'), 0)).toBe(
      learnerLocalDayIndex(at('2026-07-30T04:00:00Z'), 0) + 1,
    );
  });

  it('treats time before the 4 AM rollover as the previous day', () => {
    expect(learnerLocalDayIndex(at('2026-07-30T03:59:59Z'), 0)).toBe(
      learnerLocalDayIndex(at('2026-07-30T04:00:00Z'), 0) - 1,
    );
  });

  it('shifts the boundary by the timezone offset', () => {
    // A learner at UTC-5 (offset 300): 08:30Z is 03:30 local, still before the
    // 4 AM local rollover, so it belongs to the previous local day than 10:00Z
    // (05:00 local, after rollover).
    const before = learnerLocalDayIndex(at('2026-07-30T08:30:00Z'), 300);
    const after = learnerLocalDayIndex(at('2026-07-30T10:00:00Z'), 300);
    expect(after).toBe(before + 1);
  });
});

describe('PassageOfDayService selection', () => {
  const pool = [mkEntry('p0'), mkEntry('p1'), mkEntry('p2')];
  const service = new PassageOfDayService(pool);

  it('serves the same passage all day', () => {
    const morning = service.entryForDay(at('2026-01-01T05:00:00Z'), 0);
    const night = service.entryForDay(at('2026-01-01T20:00:00Z'), 0);
    expect(morning?.id).toBe(night?.id);
  });

  it('rotates each day and cycles through the whole pool before repeating', () => {
    const start = Date.parse('2026-01-01T12:00:00Z');
    const ids = [0, 1, 2, 3, 4].map(
      (k) => service.entryForDay(new Date(start + k * DAY_MS), 0)?.id,
    );
    // Consecutive days differ...
    expect(ids[0]).not.toBe(ids[1]);
    expect(ids[1]).not.toBe(ids[2]);
    // ...all three appear before any repeats (cycle through the pool)...
    expect(new Set([ids[0], ids[1], ids[2]]).size).toBe(3);
    // ...and only then does it repeat, in order.
    expect(ids[3]).toBe(ids[0]);
    expect(ids[4]).toBe(ids[1]);
  });

  it('keeps a passage-of-day view learner-safe (no key, no rationale)', () => {
    const view = service.todayView(at('2026-01-01T12:00:00Z'), 0);
    expect(view).not.toBeNull();
    const json = JSON.stringify(view);
    expect(json).not.toContain('"correctChoiceId"');
    expect(json).not.toContain('"rationale"');
    expect(json).not.toContain('"choiceRationales"');
    expect(json).not.toContain('"choiceRationale"');
  });

  it('reports poolSize, an in-range dayIndex, and a YYYY-MM-DD local date', () => {
    const view = service.todayView(at('2026-01-01T12:00:00Z'), 0);
    expect(view?.poolSize).toBe(pool.length);
    expect(view?.dayIndex).toBeGreaterThanOrEqual(0);
    expect(view?.dayIndex).toBeLessThan(pool.length);
    expect(view?.localDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('handles an empty pool gracefully', () => {
    const empty = new PassageOfDayService([]);
    expect(empty.size).toBe(0);
    expect(empty.todayView(new Date(), 0)).toBeNull();
    expect(empty.entryForDay(new Date(), 0)).toBeNull();
    expect(empty.grade('anything', 'A')).toBeNull();
  });
});

describe('PassageOfDayService grading', () => {
  const service = passageOfDayService;
  const firstQuestion = PASSAGE_OF_THE_DAY_POOL[0]!.questions[0]!;

  it('marks a correct answer and returns the explanation', () => {
    const grade = service.grade(firstQuestion.id, firstQuestion.correctChoiceId);
    expect(grade?.correct).toBe(true);
    expect(grade?.correctChoiceId).toBe(firstQuestion.correctChoiceId);
    expect((grade?.rationale.length ?? 0) > 0).toBe(true);
  });

  it('marks a wrong answer and returns the chosen option\u2019s rationale', () => {
    const wrong = CHOICE_IDS.find((c) => c !== firstQuestion.correctChoiceId)!;
    const grade = service.grade(firstQuestion.id, wrong);
    expect(grade?.correct).toBe(false);
    expect(grade?.choiceRationale).toBe(firstQuestion.choiceRationales[wrong]);
  });

  it('treats a null (no) answer as incorrect with no per-choice rationale', () => {
    const grade = service.grade(firstQuestion.id, null);
    expect(grade?.correct).toBe(false);
    expect(grade?.choiceRationale).toBeNull();
  });

  it('returns null for an unknown question id', () => {
    expect(service.grade('not-a-real-question', 'A')).toBeNull();
  });
});

describe('the shipped pool', () => {
  it('is well-formed: 10+ unique passages, each with 1\u20132 four-option questions', () => {
    expect(PASSAGE_OF_THE_DAY_POOL.length).toBeGreaterThanOrEqual(10);
    const passageIds = new Set<string>();
    const questionIds = new Set<string>();
    for (const entry of PASSAGE_OF_THE_DAY_POOL) {
      expect(passageIds.has(entry.id)).toBe(false);
      passageIds.add(entry.id);
      expect(entry.title.length).toBeGreaterThan(0);
      expect(entry.discipline.length).toBeGreaterThan(0);
      expect(entry.body.length).toBeGreaterThan(0);
      expect(entry.questions.length).toBeGreaterThanOrEqual(1);
      expect(entry.questions.length).toBeLessThanOrEqual(2);
      for (const question of entry.questions) {
        expect(questionIds.has(question.id)).toBe(false);
        questionIds.add(question.id);
        expect(question.choices.map((c) => c.id)).toEqual(['A', 'B', 'C', 'D']);
        expect(CHOICE_IDS).toContain(question.correctChoiceId);
        expect(question.rationale.length).toBeGreaterThan(0);
        for (const id of CHOICE_IDS) {
          expect(question.choiceRationales[id].length).toBeGreaterThan(0);
        }
      }
    }
  });
});
