import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CarsDuelTopicSchema } from '@mcat/contracts';
import type { CarsDuelIntensity, CarsDuelMode, CarsDuelTopic } from '@mcat/contracts';
import { describe, expect, it } from 'vitest';
import {
  CARS_DUEL_CONFIG,
  carsDuelAbilityBand,
  decideCarsDuelMode,
  defendSubstitutionProbability,
  defendTaperFactor,
  initialCarsDuelState,
  isDefendUnlocked,
  nextCarsDuelIntensity,
  randomizeCarsDuelSide,
  recordCarsDuelOutcome,
  selectCarsDuel,
  selectCarsDuelTopic,
  targetDifficulty,
  updateCarsDuelRating,
  type CarsDuelEngineState,
  type CarsDuelRecord,
} from './cars-duel';

const THEMES = ['ethics', 'aesthetics', 'philosophy', 'economics', 'psychology'] as const;
const STRUCTURES = ['causal', 'normative', 'analogy', 'definitional'] as const;

function topic(id: string, over: Partial<CarsDuelTopic> = {}): CarsDuelTopic {
  return {
    id,
    proposition: `Proposition ${id}`,
    theme: 'ethics',
    argumentStructure: 'causal',
    difficulty: 3,
    charge: 'neutral',
    ...over,
  } as CarsDuelTopic;
}

/** A broad synthetic pool spanning every difficulty, theme, and structure. */
function broadPool(): CarsDuelTopic[] {
  const out: CarsDuelTopic[] = [];
  let n = 0;
  for (let d = 1; d <= 5; d += 1) {
    for (const theme of THEMES) {
      for (const argumentStructure of STRUCTURES) {
        n += 1;
        out.push(topic(`t-${n}`, { theme, argumentStructure, difficulty: d as 1 }));
      }
    }
  }
  return out;
}

/** Deterministic PRNG (mulberry32) for statistical spread assertions. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** RNG that replays a fixed sequence (for exercising exact branches). */
function seqRng(values: readonly number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length]!;
}

function record(over: Partial<CarsDuelRecord> = {}): CarsDuelRecord {
  return {
    topicId: 't-1',
    theme: 'ethics',
    argumentStructure: 'causal',
    mode: 'rebut',
    intensity: 'standard',
    holdRate: 0.8,
    at: '2026-01-01T00:00:00.000Z',
    ...over,
  };
}

function stateWith(over: Partial<CarsDuelEngineState> = {}): CarsDuelEngineState {
  return { ...initialCarsDuelState(), ...over };
}

/**
 * The REAL vetted 150-topic pool, read from the canonical source the seed + content
 * embed both derive from (snake_case → the camelCase runtime shape). Loaded here so
 * the reachability guarantee is asserted against the ACTUAL content the eval flagged,
 * not a synthetic stand-in — without taking a package dependency on @mcat/content.
 */
function loadVettedPool(): CarsDuelTopic[] {
  const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
  const rows = JSON.parse(
    readFileSync(join(repoRoot, 'content/cars-duel/topics.json'), 'utf8'),
  ) as ReadonlyArray<Record<string, unknown>>;
  return rows.map((r) =>
    CarsDuelTopicSchema.parse({
      id: r.id,
      proposition: r.proposition,
      theme: r.theme,
      argumentStructure: r.argument_structure,
      difficulty: r.difficulty,
      charge: r.charge,
    }),
  );
}

/**
 * Simulate many consecutive daily selections at a FIXED rating: each drawn topic is
 * folded back into history with a null hold-rate so the rating — and therefore the
 * difficulty band — never moves, while novelty cooldown + theme/structure spread
 * rotate exactly as they would across many days. Returns every topic drawn.
 */
function drawMany(
  pool: readonly CarsDuelTopic[],
  rating: number,
  draws: number,
  seed: number,
): CarsDuelTopic[] {
  const rng = mulberry32(seed);
  let state = stateWith({ rating });
  const picked: CarsDuelTopic[] = [];
  for (let i = 0; i < draws; i += 1) {
    const chosen = selectCarsDuelTopic({ topics: pool, state, rng });
    picked.push(chosen);
    state = recordCarsDuelOutcome(state, {
      topic: chosen,
      mode: 'rebut',
      intensity: state.intensity,
      holdRate: null, // keep the rating (hence the difficulty band) fixed across the run
      at: '2026-01-01T00:00:00.000Z',
    });
  }
  return picked;
}

describe('CARS Duel — intensity (Elo-ish with hysteresis)', () => {
  it('nudges the rating up above the target band and down below it', () => {
    // Above ~80% hold-rate ⇒ intensity is too easy ⇒ escalate (rating up).
    expect(updateCarsDuelRating(0, 0.95)).toBeGreaterThan(0);
    // Below the band ⇒ intensity is too hard ⇒ ease off (rating down).
    expect(updateCarsDuelRating(0, 0.4)).toBeLessThan(0);
    // At the target center the rating is at equilibrium.
    expect(updateCarsDuelRating(0.5, CARS_DUEL_CONFIG.targetHoldRate)).toBeCloseTo(0.5, 10);
  });

  it('leaves the rating unchanged for an ungraded (null hold-rate) duel', () => {
    expect(updateCarsDuelRating(0.31, null)).toBe(0.31);
  });

  it('applies hysteresis: the dead zone holds the current band instead of oscillating', () => {
    // Warmup only promotes once past the (higher) enter threshold.
    expect(nextCarsDuelIntensity('warmup', 0.3)).toBe('warmup');
    expect(nextCarsDuelIntensity('warmup', 0.5)).toBe('standard');
    // Standard holds through the 0.0–0.4 dead zone rather than dropping to warmup.
    expect(nextCarsDuelIntensity('standard', 0.3)).toBe('standard');
    expect(nextCarsDuelIntensity('standard', -0.1)).toBe('warmup');
    expect(nextCarsDuelIntensity('standard', 1.3)).toBe('challenge');
    // Challenge holds through the 0.8–1.2 dead zone rather than dropping to standard.
    expect(nextCarsDuelIntensity('challenge', 1.0)).toBe('challenge');
    expect(nextCarsDuelIntensity('challenge', 0.7)).toBe('standard');
  });

  it('ramps warmup → standard → challenge under sustained strong performance', () => {
    let state = initialCarsDuelState();
    expect(state.intensity).toBe('warmup');
    const seen: CarsDuelIntensity[] = [state.intensity];
    for (let i = 0; i < 24; i += 1) {
      state = recordCarsDuelOutcome(state, {
        topic: topic(`t-${i}`),
        mode: 'rebut',
        intensity: state.intensity,
        holdRate: 0.95,
        at: '2026-01-01T00:00:00.000Z',
      });
      seen.push(state.intensity);
    }
    expect(state.rating).toBeGreaterThan(CARS_DUEL_CONFIG.intensity.challengeEnter);
    expect(state.intensity).toBe('challenge');
    // Monotonic, one-band-at-a-time ramp with no skipped band.
    expect(seen).toContain<CarsDuelIntensity>('standard');
    const order: Record<CarsDuelIntensity, number> = { warmup: 0, standard: 1, challenge: 2 };
    for (let i = 1; i < seen.length; i += 1) {
      expect(order[seen[i]!] - order[seen[i - 1]!]).toBeLessThanOrEqual(1);
    }
  });

  it('ramps back down when the learner is consistently over-matched', () => {
    let state = stateWith({ rating: 1.4, intensity: 'challenge' });
    for (let i = 0; i < 12; i += 1) {
      state = recordCarsDuelOutcome(state, {
        topic: topic(`t-${i}`),
        mode: 'rebut',
        intensity: state.intensity,
        holdRate: 0.2,
        at: '2026-01-01T00:00:00.000Z',
      });
    }
    expect(state.intensity).toBe('warmup');
  });
});

describe('CARS Duel — Defend unlock threshold', () => {
  const standardRebut = (holdRate: number) => record({ intensity: 'standard', mode: 'rebut', holdRate });

  it('unlocks after ≥12 Standard Rebut duels at ≥75% rolling hold-rate', () => {
    const history = Array.from({ length: 12 }, () => standardRebut(0.8));
    expect(isDefendUnlocked(history)).toBe(true);
  });

  it('stays locked below the count', () => {
    const history = Array.from({ length: 11 }, () => standardRebut(0.9));
    expect(isDefendUnlocked(history)).toBe(false);
  });

  it('stays locked when the rolling hold-rate is under threshold', () => {
    const history = Array.from({ length: 12 }, () => standardRebut(0.7));
    expect(isDefendUnlocked(history)).toBe(false);
  });

  it('counts only Standard-intensity Rebut duels (not warmup/challenge, not Defend)', () => {
    const history = [
      ...Array.from({ length: 8 }, () => standardRebut(0.9)),
      ...Array.from({ length: 8 }, () => record({ intensity: 'warmup', mode: 'rebut', holdRate: 0.9 })),
      ...Array.from({ length: 8 }, () => record({ intensity: 'standard', mode: 'defend', holdRate: 0.9 })),
    ];
    expect(isDefendUnlocked(history)).toBe(false);
  });

  it('reads the rolling window, so recent strong Standard Rebut play can unlock', () => {
    const history = [
      ...Array.from({ length: 4 }, () => standardRebut(0.2)),
      ...Array.from({ length: 12 }, () => standardRebut(0.85)),
    ];
    expect(isDefendUnlocked(history)).toBe(true);
  });

  it('latches unlocked in engine state and never re-locks', () => {
    let state = stateWith({ defendUnlocked: false });
    for (let i = 0; i < 12; i += 1) {
      state = recordCarsDuelOutcome(state, {
        topic: topic(`t-${i}`),
        mode: 'rebut',
        intensity: 'standard',
        holdRate: 0.85,
        at: '2026-01-01T00:00:00.000Z',
      });
    }
    expect(state.defendUnlocked).toBe(true);
    // A later weak duel does not re-lock Defend.
    const after = recordCarsDuelOutcome(state, {
      topic: topic('t-weak'),
      mode: 'rebut',
      intensity: 'standard',
      holdRate: 0.1,
      at: '2026-02-01T00:00:00.000Z',
    });
    expect(after.defendUnlocked).toBe(true);
  });
});

describe('CARS Duel — Defend substitution rate by ability + taper (reads test date)', () => {
  it('classifies ability bands off the rating', () => {
    expect(carsDuelAbilityBand(0.1)).toBe('low');
    expect(carsDuelAbilityBand(0.5)).toBe('mid');
    expect(carsDuelAbilityBand(1.3)).toBe('high');
  });

  it('substitutes Defend at ~10–15% for mid ability and ~20–25% for high (no taper)', () => {
    const mid = defendSubstitutionProbability(0.5, null);
    const high = defendSubstitutionProbability(1.5, null);
    expect(mid).toBeGreaterThanOrEqual(0.1);
    expect(mid).toBeLessThanOrEqual(0.15);
    expect(high).toBeGreaterThanOrEqual(0.2);
    expect(high).toBeLessThanOrEqual(0.25);
    // Dead-zone fix: an unlocked learner whose rating has drifted into the low band
    // still substitutes at a small NON-ZERO floor (never a misleading 0%), and that
    // floor stays below the mid rate.
    const low = defendSubstitutionProbability(0.1, null);
    expect(low).toBeGreaterThan(0);
    expect(low).toBeLessThan(mid);
  });

  it('tapers Defend to zero across the final ~3 weeks before the exam', () => {
    expect(defendTaperFactor(null)).toBe(1); // rolling plan: no taper
    expect(defendTaperFactor(30)).toBe(1); // outside the window
    expect(defendTaperFactor(21)).toBe(1); // at the window edge
    expect(defendTaperFactor(0)).toBe(0); // exam day
    expect(defendTaperFactor(10)).toBeCloseTo(10 / 21, 5); // linear ramp down
    // The taper strictly decreases as the exam nears.
    expect(defendTaperFactor(7)).toBeLessThan(defendTaperFactor(14));
  });

  it('folds the taper into the substitution probability', () => {
    const full = defendSubstitutionProbability(1.5, null);
    const tapered = defendSubstitutionProbability(1.5, 7);
    expect(tapered).toBeCloseTo(full * (7 / 21), 5);
    expect(defendSubstitutionProbability(1.5, 0)).toBe(0);
  });
});

describe('CARS Duel — mode decision (Rebut anchor, Defend second slot)', () => {
  const unlockedHigh = stateWith({ defendUnlocked: true, rating: 1.5, intensity: 'standard' });

  it('always makes the daily anchor (slot 0) a Rebut, even when Defend is unlocked', () => {
    expect(
      decideCarsDuelMode({ state: unlockedHigh, slotIndex: 0, daysUntilTest: null, rng: () => 0 }),
    ).toBe<CarsDuelMode>('rebut');
  });

  it('never offers Defend on the second slot until it is unlocked', () => {
    const locked = stateWith({ defendUnlocked: false, rating: 1.5 });
    expect(
      decideCarsDuelMode({ state: locked, slotIndex: 1, daysUntilTest: null, rng: () => 0 }),
    ).toBe<CarsDuelMode>('rebut');
  });

  it('substitutes Defend on the second slot under the probability, else Rebut', () => {
    expect(
      decideCarsDuelMode({ state: unlockedHigh, slotIndex: 1, daysUntilTest: null, rng: () => 0 }),
    ).toBe<CarsDuelMode>('defend');
    expect(
      decideCarsDuelMode({ state: unlockedHigh, slotIndex: 1, daysUntilTest: null, rng: () => 0.99 }),
    ).toBe<CarsDuelMode>('rebut');
  });

  it('suppresses Defend entirely on exam day via the taper (regardless of RNG)', () => {
    expect(
      decideCarsDuelMode({ state: unlockedHigh, slotIndex: 1, daysUntilTest: 0, rng: () => 0 }),
    ).toBe<CarsDuelMode>('rebut');
  });

  it('substitutes Defend at a higher rate for high vs mid ability', () => {
    const high = defendSubstitutionProbability(1.5, null);
    const mid = defendSubstitutionProbability(0.5, null);
    expect(high).toBeGreaterThan(mid);
  });

  it('still offers Defend to an unlocked learner whose rating drifted into the low band (no dead zone)', () => {
    // Unlocked (latched) but rating below the mid ability cut — the exact state the
    // old `0` low band stranded, where Defend was "unlocked" yet never offered.
    const unlockedLow = stateWith({ defendUnlocked: true, rating: 0.1, intensity: 'standard' });
    expect(carsDuelAbilityBand(unlockedLow.rating)).toBe('low');
    // A draw under the (non-zero) floor now yields a Defend rather than always Rebut.
    expect(
      decideCarsDuelMode({ state: unlockedLow, slotIndex: 1, daysUntilTest: null, rng: () => 0 }),
    ).toBe<CarsDuelMode>('defend');
    // The floor is still small: a mid-range draw falls back to Rebut.
    expect(
      decideCarsDuelMode({ state: unlockedLow, slotIndex: 1, daysUntilTest: null, rng: () => 0.5 }),
    ).toBe<CarsDuelMode>('rebut');
    // And the taper still suppresses it entirely on exam day.
    expect(
      decideCarsDuelMode({ state: unlockedLow, slotIndex: 1, daysUntilTest: 0, rng: () => 0 }),
    ).toBe<CarsDuelMode>('rebut');
  });
});

describe('CARS Duel — topic selector (cooldown, spread, difficulty band)', () => {
  it('never repeats a topic inside the novelty cooldown window', () => {
    const pool = Array.from({ length: 25 }, (_, i) =>
      topic(`t-${i + 1}`, { difficulty: 3, theme: THEMES[i % THEMES.length]! }),
    );
    const history: CarsDuelRecord[] = Array.from({ length: CARS_DUEL_CONFIG.noveltyWindow }, (_, i) =>
      record({ topicId: `t-${i + 1}` }),
    );
    const cooldown = new Set(history.map((r) => r.topicId));
    for (let trial = 0; trial < 50; trial += 1) {
      const picked = selectCarsDuelTopic({
        topics: pool,
        state: stateWith({ history }),
        rng: mulberry32(trial + 1),
      });
      expect(cooldown.has(picked.id)).toBe(false);
    }
  });

  it('also excludes caller-supplied topic ids (e.g. the anchor when picking a second)', () => {
    const pool = Array.from({ length: 6 }, (_, i) => topic(`t-${i + 1}`, { difficulty: 3 }));
    const picked = selectCarsDuelTopic({
      topics: pool,
      state: initialCarsDuelState(),
      rng: () => 0,
      excludeTopicIds: ['t-1'],
    });
    expect(picked.id).not.toBe('t-1');
  });

  it('spreads across themes/structures, favoring under-represented strata', () => {
    const pool = [
      topic('a1', { theme: 'ethics', argumentStructure: 'causal', difficulty: 3 }),
      topic('a2', { theme: 'ethics', argumentStructure: 'causal', difficulty: 3 }),
      topic('b1', { theme: 'aesthetics', argumentStructure: 'normative', difficulty: 3 }),
    ];
    const history = Array.from({ length: 4 }, () =>
      record({ theme: 'ethics', argumentStructure: 'causal', topicId: 'seen' }),
    );
    // Recent history saturates ethics/causal, so the under-represented aesthetics
    // topic must be chosen despite ethics topics also being available.
    for (let trial = 0; trial < 20; trial += 1) {
      const picked = selectCarsDuelTopic({
        topics: pool,
        state: stateWith({ history }),
        rng: mulberry32(trial + 7),
      });
      expect(picked.theme).toBe('aesthetics');
    }
  });

  it('picks a difficulty near the learner’s band', () => {
    const pool = Array.from({ length: 5 }, (_, i) => topic(`d-${i + 1}`, { difficulty: (i + 1) as 1 }));
    const high = selectCarsDuelTopic({
      topics: pool,
      state: stateWith({ rating: 2 }),
      rng: () => 0.5,
    });
    expect(high.difficulty).toBeGreaterThanOrEqual(4);
    const low = selectCarsDuelTopic({
      topics: pool,
      state: stateWith({ rating: -2 }),
      rng: () => 0.5,
    });
    expect(low.difficulty).toBeLessThanOrEqual(2);
  });

  it('maps the rating to a bounded target difficulty band', () => {
    expect(targetDifficulty(0)).toBe(3);
    expect(targetDifficulty(5)).toBe(5);
    expect(targetDifficulty(-5)).toBe(1);
  });

  it('draws a spread of themes across many independent selections (stratified randomization)', () => {
    const pool = broadPool();
    const themes = new Set<string>();
    for (let trial = 0; trial < 200; trial += 1) {
      const picked = selectCarsDuelTopic({
        topics: pool,
        state: initialCarsDuelState(),
        rng: mulberry32(trial * 2654435761),
      });
      themes.add(picked.theme);
    }
    expect(themes.size).toBe(THEMES.length);
  });
});

describe('CARS Duel — topic selector theme reachability across ability bands', () => {
  it('keeps EVERY vetted theme reachable for a struggling learner (targetDifficulty 1)', () => {
    // rating ≲ -1.5 ⇒ targetDifficulty 1 ⇒ band {1,2}. In the vetted pool philosophy is
    // authored only at difficulty 3 & 5, so a band-first selector permanently starves it
    // (and ethics has no difficulty-1 items). Every theme must still surface over draws.
    const pool = loadVettedPool();
    expect(targetDifficulty(-2)).toBe(1);
    const allThemes = new Set(pool.map((t) => t.theme));
    const seenThemes = new Set(drawMany(pool, -2, 600, 12345).map((t) => t.theme));
    expect(seenThemes).toEqual(allThemes);
    // The two themes the read-only eval flagged, named explicitly (regression guard).
    expect(seenThemes.has('philosophy')).toBe(true);
    expect(seenThemes.has('ethics')).toBe(true);
  });

  it('keeps in-band difficulty the default bias, using out-of-band only at a theme’s nearest tier', () => {
    const pool = loadVettedPool();
    const target = targetDifficulty(-2); // 1 ⇒ band {1,2}
    const picks = drawMany(pool, -2, 600, 2024);
    // "Difficulty near the band" stays the default: the large majority of draws are in-band
    // (reachability re-admits an out-of-band theme, it does not flood the learner with them).
    const inBand = picks.filter((t) => Math.abs(t.difficulty - target) <= CARS_DUEL_CONFIG.difficultyRadius);
    expect(inBand.length / picks.length).toBeGreaterThan(0.8);
    // Philosophy has NO in-band item, so it surfaces out-of-band — but only at its NEAREST
    // tier (difficulty 3), never the far difficulty-5 items: nearest-difficulty re-admission,
    // not arbitrary out-of-band noise.
    const philDiffs = new Set(picks.filter((t) => t.theme === 'philosophy').map((t) => t.difficulty));
    expect(philDiffs).toEqual(new Set([3]));
  });

  it('preserves reachability and the in-band bias for a high-ability learner too', () => {
    const pool = loadVettedPool();
    const target = targetDifficulty(2); // 5 ⇒ band {4,5}
    expect(target).toBe(5);
    const picks = drawMany(pool, 2, 400, 777);
    // Every theme still reachable at the top band…
    expect(new Set(picks.map((t) => t.theme))).toEqual(new Set(pool.map((t) => t.theme)));
    // …and in-band difficulty dominates even harder here: every theme has an in-band item,
    // so out-of-band only occurs on rare novelty-cooldown overflow of a thin theme.
    const inBand = picks.filter((t) => Math.abs(t.difficulty - target) <= CARS_DUEL_CONFIG.difficultyRadius);
    expect(inBand.length / picks.length).toBeGreaterThan(0.95);
  });

  it('re-admits a band-missing theme at its nearest difficulty while keeping in-band themes in-band (synthetic)', () => {
    // Reproduce the vetted gap in miniature, but with a deep enough in-band set (> the
    // novelty window) that the pre-fix band-first filter never runs dry — so pre-fix the
    // stranded theme is cleanly starved, not accidentally rescued by radius-widening.
    const inBandThemes = ['aesthetics', 'ethics', 'economics', 'psychology', 'sociology'] as const;
    const pool: CarsDuelTopic[] = [];
    inBandThemes.forEach((theme, ti) => {
      for (let k = 0; k < 5; k += 1) {
        pool.push(
          topic(`${theme}-in-${k}`, {
            theme,
            argumentStructure: STRUCTURES[(ti + k) % STRUCTURES.length]!,
            difficulty: (k % 2 === 0 ? 1 : 2) as 1,
          }),
        );
      }
    });
    // economics ALSO has an out-of-band item — it must NEVER be pulled out of band, since
    // economics is already reachable in-band.
    pool.push(topic('economics-out', { theme: 'economics', argumentStructure: 'analogy', difficulty: 4 }));
    // philosophy exists ONLY outside a struggling learner's band → it must be re-admitted
    // at its nearest tier (4): the reachability guarantee.
    pool.push(topic('philosophy-a', { theme: 'philosophy', argumentStructure: 'normative', difficulty: 4 }));
    pool.push(topic('philosophy-b', { theme: 'philosophy', argumentStructure: 'causal', difficulty: 4 }));

    const picks = drawMany(pool, -2, 300, 42); // targetDifficulty 1 ⇒ band {1,2}
    const seenThemes = new Set(picks.map((t) => t.theme));
    // Reachability: every theme surfaces, including the otherwise band-missing one.
    expect(seenThemes).toEqual(new Set([...inBandThemes, 'philosophy']));
    for (const t of picks) {
      // philosophy (no in-band item) surfaces only at its NEAREST tier (4)…
      if (t.theme === 'philosophy') expect(t.difficulty).toBe(4);
      // …and economics, already reachable in-band, is never pulled out of band.
      if (t.theme === 'economics') expect(t.difficulty).toBeLessThanOrEqual(2);
    }
  });
});

describe('CARS Duel — randomized side (learner never picks their stance)', () => {
  it('assigns affirm/oppose from the RNG', () => {
    expect(randomizeCarsDuelSide(() => 0.2)).toBe('affirm');
    expect(randomizeCarsDuelSide(() => 0.8)).toBe('oppose');
  });

  it('produces both sides across draws', () => {
    const rng = mulberry32(99);
    const sides = new Set(Array.from({ length: 40 }, () => randomizeCarsDuelSide(rng)));
    expect(sides).toEqual(new Set(['affirm', 'oppose']));
  });
});

describe('CARS Duel — full selection', () => {
  it('resolves mode, intensity, side, and a valid topic for the daily anchor', () => {
    const pool = broadPool();
    const selection = selectCarsDuel({
      topics: pool,
      state: initialCarsDuelState(),
      slotIndex: 0,
      daysUntilTest: null,
      rng: seqRng([0.1, 0.9, 0.3]),
    });
    expect(selection.mode).toBe('rebut');
    expect(selection.intensity).toBe('warmup');
    expect(['affirm', 'oppose']).toContain(selection.side);
    expect(pool.some((t) => t.id === selection.topic.id)).toBe(true);
  });

  it('can yield a Defend on the second slot when unlocked and the draw lands', () => {
    const pool = broadPool();
    const selection = selectCarsDuel({
      topics: pool,
      state: stateWith({ defendUnlocked: true, rating: 1.5, intensity: 'standard' }),
      slotIndex: 1,
      daysUntilTest: null,
      // First draw (mode) low → Defend; remaining draws feed side/topic.
      rng: seqRng([0.0, 0.4, 0.6]),
    });
    expect(selection.mode).toBe('defend');
    expect(selection.intensity).toBe('standard');
  });
});

describe('CARS Duel — engine state bookkeeping', () => {
  it('appends history and bounds it to the retention limit', () => {
    let state = initialCarsDuelState();
    for (let i = 0; i < CARS_DUEL_CONFIG.historyLimit + 10; i += 1) {
      state = recordCarsDuelOutcome(state, {
        topic: topic(`t-${i}`),
        mode: 'rebut',
        intensity: 'standard',
        holdRate: 0.8,
        at: '2026-01-01T00:00:00.000Z',
      });
    }
    expect(state.history).toHaveLength(CARS_DUEL_CONFIG.historyLimit);
    // The oldest entries are the ones dropped.
    expect(state.history[0]!.topicId).toBe('t-10');
  });
});
