import { describe, expect, it } from 'vitest';
import { buildCarsSystemPrompt, buildReflectionPrompt } from './cars';

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
});
