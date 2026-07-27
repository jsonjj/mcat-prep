import { describe, expect, it } from 'vitest';
import { resolveCarsSkill, resolveReasoningOperation } from './reasoning-operation';

describe('resolveReasoningOperation', () => {
  it('maps SIRS1/3/4 and MATH-ENABLING one-to-one', () => {
    expect(resolveReasoningOperation({ primary_skill: 'SIRS1' })).toBe('IDENTIFY');
    expect(resolveReasoningOperation({ primary_skill: 'SIRS3' })).toBe('DESIGN');
    expect(resolveReasoningOperation({ primary_skill: 'SIRS4' })).toBe('EVIDENCE');
    expect(resolveReasoningOperation({ primary_skill: 'MATH-ENABLING' })).toBe('QUANTIFY');
  });

  it('splits SIRS2 via the construct text (matching the real corpus)', () => {
    expect(
      resolveReasoningOperation({
        primary_skill: 'SIRS2',
        construct: { reasoning_operation_id: 'predict outcome from principle/model' },
      }),
    ).toBe('PREDICT');
    expect(
      resolveReasoningOperation({
        primary_skill: 'SIRS2',
        construct: { reasoning_operation_id: 'select/apply formula' },
      }),
    ).toBe('QUANTIFY');
    expect(
      resolveReasoningOperation({
        primary_skill: 'SIRS2',
        construct: { reasoning_operation_id: 'explain the mechanism behind the result' },
      }),
    ).toBe('EXPLAIN');
  });

  it('defaults ambiguous SIRS2 to EXPLAIN', () => {
    expect(resolveReasoningOperation({ primary_skill: 'SIRS2' })).toBe('EXPLAIN');
    expect(
      resolveReasoningOperation({ primary_skill: 'SIRS2', construct: { reasoning_operation_id: 'unclassifiable' } }),
    ).toBe('EXPLAIN');
  });

  it('treats CARS skills as non-science (null op)', () => {
    expect(resolveReasoningOperation({ primary_skill: 'CARS_FOC' })).toBeNull();
    expect(resolveReasoningOperation({ primary_skill: 'CARS_RBT' })).toBeNull();
  });

  it('honors an explicit authored reasoning_operation over the derivation', () => {
    expect(
      resolveReasoningOperation({ reasoning_operation: 'RELATE', primary_skill: 'SIRS2' }),
    ).toBe('RELATE');
    // An invalid explicit tag is ignored and falls back to derivation.
    expect(
      resolveReasoningOperation({ reasoning_operation: 'NONSENSE', primary_skill: 'SIRS1' }),
    ).toBe('IDENTIFY');
  });

  it('returns null when nothing resolves', () => {
    expect(resolveReasoningOperation({})).toBeNull();
    expect(resolveReasoningOperation({ primary_skill: 'UNKNOWN' })).toBeNull();
  });
});

describe('resolveCarsSkill', () => {
  it('maps CARS codes and rejects non-CARS', () => {
    expect(resolveCarsSkill('CARS_FOC')).toBe('FOC');
    expect(resolveCarsSkill('CARS_RWT')).toBe('RWT');
    expect(resolveCarsSkill('CARS_RBT')).toBe('RBT');
    expect(resolveCarsSkill('SIRS2')).toBeNull();
    expect(resolveCarsSkill(null)).toBeNull();
  });
});
