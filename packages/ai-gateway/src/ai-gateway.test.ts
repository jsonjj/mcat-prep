import { describe, expect, it } from 'vitest';
import {
  buildCarsSystemPrompt,
  buildDuelRubricPrompt,
  buildReflectionPrompt,
  parseDuelRubric,
} from './cars';

describe('CARS Duel prompts', () => {
  it('encodes the safety guardrails and tone', () => {
    const p = buildCarsSystemPrompt('rebut', 'standard', 'the ethics of memory');
    expect(p.toLowerCase()).toContain('respectful');
    expect(p).toMatch(/never fabricate/i);
    expect(p).toMatch(/never claim to know the student/i);
    expect(p.toLowerCase()).toContain('cars');
    expect(p).toContain('the ethics of memory');
  });

  it('reflection prompt is constructive and declares no winner', () => {
    const r = buildReflectionPrompt();
    expect(r.role).toBe('user');
    expect(r.content.toLowerCase()).toContain('do not declare a winner');
    expect(r.content.toLowerCase()).toContain('strongest point');
  });

  it('rubric prompt asks for a single machine-readable SCORES line', () => {
    const p = buildDuelRubricPrompt();
    expect(p.content).toContain('SCORES position=');
    expect(p.content.toLowerCase()).toContain('0-3');
  });

  it('parses the rubric scores and ignores omitted / out-of-range criteria', () => {
    expect(parseDuelRubric('SCORES position=2 argument=3 application=1')).toEqual({
      position: 2,
      argument: 3,
      application: 1,
    });
    // Omitted criteria are dropped; extra prose is tolerated.
    expect(parseDuelRubric('Nice work. SCORES argument=3')).toEqual({ argument: 3 });
    expect(parseDuelRubric('no scores here')).toEqual({});
  });
});
