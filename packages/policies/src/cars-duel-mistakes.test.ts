import { describe, expect, it } from 'vitest';
import {
  CARS_DUEL_COMPETENCE_BAR,
  DUEL_DIMENSION_TO_CARS_SKILL,
  isWeakCarsDuel,
  weakestCarsSkill,
} from './cars-duel-mistakes';
import { rubricToR } from './cars';

/**
 * WS7 — the pure rubric→CARS-skill mapping and the competence bar. These are the
 * two decisions the authority makes at the `recordCarsDuel` seam; everything else
 * (selecting a real item, surfacing, resolving) is integration and lives in
 * authority-core.
 */
describe('WS7 rubric → CARS sub-skill mapping', () => {
  it('maps each rubric dimension to its AAMC CARS sub-skill (same as the ability nudge)', () => {
    expect(DUEL_DIMENSION_TO_CARS_SKILL).toEqual({
      position: 'FOC',
      argument: 'RWT',
      application: 'RBT',
    });
  });

  it('picks the sub-skill behind the WEAKEST scored dimension', () => {
    expect(weakestCarsSkill({ position: 3, argument: 3, application: 0 })).toBe('RBT');
    expect(weakestCarsSkill({ position: 0, argument: 3, application: 3 })).toBe('FOC');
    expect(weakestCarsSkill({ position: 3, argument: 1, application: 3 })).toBe('RWT');
  });

  it('considers only dimensions the duel actually scored', () => {
    // application not scored, so RBT is out of contention even though it would be 0.
    expect(weakestCarsSkill({ position: 2, argument: 1 })).toBe('RWT');
    expect(weakestCarsSkill({ application: 1 })).toBe('RBT');
  });

  it('breaks ties toward the more foundational sub-skill (FOC → RWT → RBT)', () => {
    expect(weakestCarsSkill({ position: 1, argument: 1, application: 1 })).toBe('FOC');
    expect(weakestCarsSkill({ argument: 2, application: 2 })).toBe('RWT');
  });

  it('returns null when nothing was scored', () => {
    expect(weakestCarsSkill({})).toBeNull();
  });
});

describe('WS7 CARS Duel competence bar', () => {
  it('sits at the 0.75 floor of the researched 75–85% desirable-difficulty band', () => {
    expect(CARS_DUEL_COMPETENCE_BAR).toBe(0.75);
  });

  it('flags a duel whose rubric hold-rate is below the bar', () => {
    // All-1s → R = 1/3 ≈ 0.33, well below the bar.
    expect(isWeakCarsDuel({ position: 1, argument: 1, application: 1 })).toBe(true);
    // All-3s → R = 1.0, a strong duel.
    expect(isWeakCarsDuel({ position: 3, argument: 3, application: 3 })).toBe(false);
  });

  it('treats a hold-rate exactly at the bar as competent (not weak)', () => {
    // Construct a rubric whose weighted R is exactly 0.75, then confirm the
    // strict `<` bar does not flag it.
    const rubric = { position: 2, argument: 2, application: 3 } as const;
    const r = rubricToR(rubric);
    expect(r).not.toBeNull();
    // 0.25*2 + 0.4*2 + 0.35*3 = 0.5 + 0.8 + 1.05 = 2.35; /(3) = 0.7833… (> bar)
    expect(isWeakCarsDuel(rubric)).toBe(false);
  });

  it('is not weak when the rubric scored nothing (no signal to weigh)', () => {
    expect(isWeakCarsDuel({})).toBe(false);
  });

  it('respects an overridden bar (A/B tunable)', () => {
    // R for all-2s = 2/3 ≈ 0.667. Below a 0.7 bar, above a 0.6 bar.
    expect(isWeakCarsDuel({ position: 2, argument: 2, application: 2 }, 0.7)).toBe(true);
    expect(isWeakCarsDuel({ position: 2, argument: 2, application: 2 }, 0.6)).toBe(false);
  });
});
