import { describe, expect, it } from 'vitest';

import { scanTrackedFiles } from './protected-field-scan.mjs';

describe('protected content scanner', () => {
  it('rejects answer-bearing candidate JSONL', () => {
    const problems = scanTrackedFiles(['question-bank/candidate.jsonl'], () =>
      JSON.stringify({ proposed_key: 'A', option_rationales: { A: 'answer' } }),
    );

    expect(problems).toEqual(
      expect.arrayContaining([expect.stringContaining('question-bank/candidate.jsonl')]),
    );
  });

  it('allows learner-safe JSONL without protected fields', () => {
    expect(
      scanTrackedFiles(['generated/public/items.jsonl'], () =>
        JSON.stringify({ stem: 'synthetic' }),
      ),
    ).toEqual([]);
  });

  it('rejects protected fields in JSONL outside the candidate directory', () => {
    const problems = scanTrackedFiles(['content/private/item.jsonl'], () =>
      JSON.stringify({ correct_choice_id: 'choice-b', rationale_correct: 'protected' }),
    );

    expect(problems).toEqual([
      'Protected fields found in tracked JSONL outside the server-only fixture allowlist: content/private/item.jsonl',
    ]);
  });

  it('rejects v7 answer-bearing JSONL (correct_answer + explanations) outside the allowlist', () => {
    const problems = scanTrackedFiles(['content/question-bank/items/bb/item.jsonl'], () =>
      JSON.stringify({ correct_answer: 'B', explanations: { A: 'x', B: 'y' } }),
    );

    expect(problems).toEqual([
      'Protected fields found in tracked JSONL outside the server-only fixture allowlist: content/question-bank/items/bb/item.jsonl',
    ]);
  });

  it('allows protected JSONL only in the explicit server-only fixture path', () => {
    expect(
      scanTrackedFiles(['tests/fixtures/server-only/protected/item.jsonl'], () =>
        JSON.stringify({ correct_choice_id: 'choice-b', rationales: { 'choice-b': 'protected' } }),
      ),
    ).toEqual([]);
  });

  it('does not treat the scanner directory as a protected JSONL allowlist', () => {
    const problems = scanTrackedFiles(['tools/scanners/leak.jsonl'], () =>
      JSON.stringify({ proposed_key: 'choice-a' }),
    );

    expect(problems).toEqual([
      'Protected fields found in tracked JSONL outside the server-only fixture allowlist: tools/scanners/leak.jsonl',
    ]);
  });
});
