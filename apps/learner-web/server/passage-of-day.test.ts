import { describe, expect, it } from 'vitest';
import type { CarsSkill, PassageOfTheDayEntry } from '@mcat/contracts';
import { hardcodedPassagePool } from '../../../content/passage-of-the-day/pool';
import { learnerLocalDayIndex, PassageOfDayService } from './passage-of-day';

/** The hardcoded (fallback) pool — the deterministic content these tests assert on. */
const POOL = hardcodedPassagePool();

const DAY_MS = 86_400_000;
const at = (iso: string): Date => new Date(iso);

function mkEntry(id: string): PassageOfTheDayEntry {
  return {
    id,
    slug: id,
    title: `Title ${id}`,
    discipline: 'Test',
    theme: 'humanities',
    body: [`Body of ${id}.`],
    questions: [
      {
        id: `${id}-q1`,
        stem: `Stem ${id}?`,
        choices: [
          { id: 'A', text: 'a', correct: true, misconception: null, rationale: `a is right (${id})` },
          { id: 'B', text: 'b', correct: false, misconception: 'b trap', rationale: 'b misses' },
          { id: 'C', text: 'c', correct: false, misconception: 'c trap', rationale: 'c misses' },
          { id: 'D', text: 'd', correct: false, misconception: 'd trap', rationale: 'd misses' },
        ],
        explanation: `because a (${id})`,
        carsSkill: 'FOC',
        dok: 2,
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
    expect(json).not.toContain('"correct"');
    expect(json).not.toContain('"correctChoiceId"');
    expect(json).not.toContain('"misconception"');
    expect(json).not.toContain('"rationale"');
    expect(json).not.toContain('"explanation"');
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
  const service = new PassageOfDayService(POOL);
  const firstQuestion = POOL[0]!.questions[0]!;
  const correctChoice = firstQuestion.choices.find((c) => c.correct)!;

  it('marks a correct answer and returns the explanation', () => {
    const grade = service.grade(firstQuestion.id, correctChoice.id);
    expect(grade?.correct).toBe(true);
    expect(grade?.correctChoiceId).toBe(correctChoice.id);
    expect((grade?.rationale.length ?? 0) > 0).toBe(true);
  });

  it('marks a wrong answer and returns the chosen option\u2019s rationale', () => {
    const wrong = firstQuestion.choices.find((c) => !c.correct)!;
    const grade = service.grade(firstQuestion.id, wrong.id);
    expect(grade?.correct).toBe(false);
    expect(grade?.choiceRationale).toBe(wrong.rationale);
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
  const THEMES = new Set(['humanities', 'social_science']);
  const SKILLS: readonly CarsSkill[] = ['FOC', 'RWT', 'RBT'];

  it('is well-formed: 10+ unique passages, each with 5\u20137 four-option CARS questions', () => {
    expect(POOL.length).toBeGreaterThanOrEqual(10);
    const passageIds = new Set<string>();
    const slugs = new Set<string>();
    const questionIds = new Set<string>();
    for (const entry of POOL) {
      expect(passageIds.has(entry.id)).toBe(false);
      passageIds.add(entry.id);
      expect(slugs.has(entry.slug)).toBe(false);
      slugs.add(entry.slug);
      expect(entry.slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      expect(entry.title.length).toBeGreaterThan(0);
      expect(entry.discipline.length).toBeGreaterThan(0);
      expect(THEMES.has(entry.theme)).toBe(true);
      expect(entry.body.length).toBeGreaterThan(0);
      expect(entry.questions.length).toBeGreaterThanOrEqual(5);
      expect(entry.questions.length).toBeLessThanOrEqual(7);
      for (const question of entry.questions) {
        expect(questionIds.has(question.id)).toBe(false);
        questionIds.add(question.id);
        expect(question.choices.map((c) => c.id)).toEqual(['A', 'B', 'C', 'D']);
        // Exactly one correct option; the key carries a null misconception.
        const correct = question.choices.filter((c) => c.correct);
        expect(correct).toHaveLength(1);
        expect(correct[0]!.misconception).toBeNull();
        expect(question.explanation.length).toBeGreaterThan(0);
        expect(SKILLS).toContain(question.carsSkill);
        expect(question.dok).toBeGreaterThanOrEqual(1);
        expect(question.dok).toBeLessThanOrEqual(3);
        // Every option carries a rationale; every wrong option a non-empty misconception.
        for (const choice of question.choices) {
          expect(choice.rationale.length).toBeGreaterThan(0);
          if (!choice.correct) {
            expect((choice.misconception ?? '').length).toBeGreaterThan(0);
          }
        }
      }
    }
  });

  it('splits CARS skills 2-2-1 per passage and evenly across the pool', () => {
    // The pool-level even split needs a multiple of three passages (2-2-1 per
    // passage rotates so every three passages sum to 5/5/5).
    expect(POOL.length % 3).toBe(0);
    const total: Record<CarsSkill, number> = { FOC: 0, RWT: 0, RBT: 0 };
    for (const entry of POOL) {
      expect(entry.questions.length).toBe(5);
      const counts: Record<CarsSkill, number> = { FOC: 0, RWT: 0, RBT: 0 };
      for (const question of entry.questions) counts[question.carsSkill] += 1;
      // Two skills get two questions, one gets a single question.
      expect(Object.values(counts).sort((a, b) => a - b)).toEqual([1, 2, 2]);
      for (const skill of SKILLS) total[skill] += counts[skill];
    }
    const perSkill = (POOL.length * 5) / 3;
    expect(total).toEqual({ FOC: perSkill, RWT: perSkill, RBT: perSkill });
  });
});
