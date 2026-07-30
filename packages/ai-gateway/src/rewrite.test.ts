import { describe, expect, it } from 'vitest';
import {
  MAX_REWRITE_SOURCE_CHARS,
  buildRewriteMessages,
  buildRewriteSystemPrompt,
  canStepByStep,
  fallbackRewrite,
  findUngroundedNumbers,
  parseRewriteRequest,
  rewriteCacheKey,
  sanitizeRewrite,
} from './rewrite';

const source = {
  rationale: 'At equilibrium the forward and reverse rates are equal, so the ratio Keq stays fixed.',
  choiceRationales: { B: 'B assumes the reaction stops, but the rates only become equal.' },
};

describe('canStepByStep gating', () => {
  it('offers steps for QUANTIFY items', () => {
    expect(canStepByStep({ skill: 'QUANTIFY', section: 'bb', dok: 1 })).toBe(true);
    expect(canStepByStep({ skill: 'quantify', section: 'bb', dok: 1 })).toBe(true);
  });

  it('offers steps for the Chem/Phys (C/P) section', () => {
    expect(canStepByStep({ skill: 'IDENTIFY', section: 'cp', dok: 1 })).toBe(true);
  });

  it('offers steps at DOK >= 2', () => {
    expect(canStepByStep({ skill: 'IDENTIFY', section: 'bb', dok: 2 })).toBe(true);
    expect(canStepByStep({ skill: null, section: 'ps', dok: 3 })).toBe(true);
  });

  it('withholds steps for a low-DOK, non-QUANTIFY, non-C/P item', () => {
    expect(canStepByStep({ skill: 'IDENTIFY', section: 'bb', dok: 1 })).toBe(false);
  });

  it('handles the Study surface where only section is known', () => {
    // Study's LearnerSafeQuestion carries no skill/DOK — gate falls back to section.
    expect(canStepByStep({ skill: null, section: 'cp', dok: null })).toBe(true);
    expect(canStepByStep({ skill: null, section: 'cars', dok: null })).toBe(false);
  });
});

describe('grounded prompt', () => {
  it('the system prompt forbids new facts and answer-key leaks', () => {
    const prompt = buildRewriteSystemPrompt('example').toLowerCase();
    expect(prompt).toContain('only');
    expect(prompt).toMatch(/do not add facts|do not introduce/);
    expect(prompt).toContain('re-express');
    expect(prompt).toMatch(/do not re-state|do not reveal/);
  });

  it('feeds the model ONLY the source explanation and nothing else', () => {
    const messages = buildRewriteMessages('example', source);
    expect(messages[0]!.role).toBe('system');
    const user = messages[1]!;
    expect(user.role).toBe('user');
    // The vetted material is present…
    expect(user.content).toContain(source.rationale);
    expect(user.content).toContain(source.choiceRationales.B);
    // …and the ask reinforces grounding, adding no external facts.
    expect(user.content.toLowerCase()).toContain('add nothing that is not stated above');
    // The question id is never handed to the model as content.
    expect(user.content).not.toContain('question');
  });

  it('asks for numbered steps in steps mode', () => {
    const messages = buildRewriteMessages('steps', source);
    expect(messages[1]!.content.toLowerCase()).toContain('numbered steps');
  });
});

describe('deterministic fallback', () => {
  it('re-states the same source and differs by mode', () => {
    const example = fallbackRewrite('example', source);
    const steps = fallbackRewrite('steps', source);
    expect(example).toContain(source.rationale);
    expect(example).not.toEqual(steps);
    expect(steps).toMatch(/^1\. /m);
  });

  it('introduces no numbers beyond the source (grounded by construction)', () => {
    const numericSource = {
      rationale: 'Double the concentration and the rate rises by a factor of 4 because the order is 2.',
    };
    expect(findUngroundedNumbers(fallbackRewrite('steps', numericSource), numericSource)).toEqual([]);
    expect(findUngroundedNumbers(fallbackRewrite('example', numericSource), numericSource)).toEqual(
      [],
    );
  });
});

describe('grounding gate', () => {
  it('flags numeric facts the source never stated', () => {
    expect(findUngroundedNumbers('The pH is 3 and it is 12% dissociated.', { rationale: 'The pH is 3.' })).toEqual(
      ['12'],
    );
  });

  it('passes a re-wording that adds no new numbers', () => {
    expect(
      findUngroundedNumbers('Put simply, the pH sits at 3.', { rationale: 'The pH is 3.' }),
    ).toEqual([]);
  });

  it('does not treat step numbering as new facts', () => {
    const stepped = '1. The pH is 3.\n2. So it is acidic.';
    expect(findUngroundedNumbers(stepped, { rationale: 'The pH is 3, so it is acidic.' })).toEqual([]);
  });

  it('sanitizeRewrite swaps in the fallback when the model invents a number', () => {
    const hallucinated = 'The pH is 3, about 12% dissociated.';
    const result = sanitizeRewrite(hallucinated, 'example', { rationale: 'The pH is 3.' });
    expect(result.fallback).toBe(true);
    expect(findUngroundedNumbers(result.text, { rationale: 'The pH is 3.' })).toEqual([]);
  });

  it('sanitizeRewrite passes grounded output through untouched', () => {
    const grounded = 'Another way: the pH is 3.';
    const result = sanitizeRewrite(grounded, 'example', { rationale: 'The pH is 3.' });
    expect(result).toEqual({ text: grounded, fallback: false });
  });

  it('sanitizeRewrite falls back on empty output', () => {
    expect(sanitizeRewrite('   ', 'example', source).fallback).toBe(true);
  });
});

describe('cache key + request parsing', () => {
  it('keys the cache per (question_id, form, source surface)', () => {
    expect(rewriteCacheKey('q-1', 'example', source)).toBe(rewriteCacheKey('q-1', 'example', source));
    expect(rewriteCacheKey('q-1', 'steps', source)).not.toBe(
      rewriteCacheKey('q-1', 'example', source),
    );
    expect(rewriteCacheKey('q-1', 'example', source)).toMatch(/^q-1::example::[0-9a-f]{8}$/);
  });

  it('separates surfaces: same question + form but a different source cache apart', () => {
    // Practice/Study pass the correct-answer rationale; Mistakes passes the
    // distractor refutation. Keyed on (question, form) alone these collided, so
    // Mistakes could show a re-wording of the correct-answer rationale.
    const correctSurface = { rationale: source.rationale };
    const mistakeSurface = { rationale: source.choiceRationales.B };
    expect(rewriteCacheKey('q-1', 'example', correctSurface)).not.toBe(
      rewriteCacheKey('q-1', 'example', mistakeSurface),
    );
  });

  it('accepts a well-formed request and rejects malformed ones', () => {
    expect(parseRewriteRequest({ questionId: 'q-1', mode: 'example', source })).not.toBeNull();
    expect(parseRewriteRequest({ questionId: 'q-1', mode: 'nope', source })).toBeNull();
    expect(parseRewriteRequest({ questionId: '', mode: 'example', source })).toBeNull();
    expect(parseRewriteRequest({ questionId: 'q-1', mode: 'example', source: {} })).toBeNull();
    expect(parseRewriteRequest(null)).toBeNull();
  });

  it('rejects a source that exceeds the size cap', () => {
    const atCap = { rationale: 'x'.repeat(MAX_REWRITE_SOURCE_CHARS) };
    const overCap = { rationale: 'x'.repeat(MAX_REWRITE_SOURCE_CHARS + 1) };
    expect(parseRewriteRequest({ questionId: 'q-1', mode: 'example', source: atCap })).not.toBeNull();
    expect(parseRewriteRequest({ questionId: 'q-1', mode: 'example', source: overCap })).toBeNull();
    // The cap counts the rationale plus every refutation together.
    const splitOverCap = {
      rationale: 'x'.repeat(MAX_REWRITE_SOURCE_CHARS - 5),
      choiceRationales: { B: 'y'.repeat(10) },
    };
    expect(
      parseRewriteRequest({ questionId: 'q-1', mode: 'example', source: splitOverCap }),
    ).toBeNull();
  });
});
