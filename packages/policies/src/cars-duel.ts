import type {
  CarsDuelIntensity,
  CarsDuelMode,
  CarsDuelSide,
  CarsDuelTopic,
} from '@mcat/contracts';

/**
 * CARS Duel selection engine (WS6) — pure, DOM-free, no I/O, no clock, no RNG of
 * its own (an RNG is injected so selection is deterministic in tests).
 *
 * It decides, for one scheduled duel: which TOPIC (stratified randomization +
 * novelty cooldown + theme/structure spread + difficulty near the learner's
 * band), which MODE (Rebut is the daily anchor; Defend unlocks after sustained
 * Standard Rebut competence, substitutes for the second CARS at an ability-scaled
 * rate, and TAPERS to zero in the final weeks before the exam), the system-set
 * INTENSITY (an Elo-ish ability estimate with hysteresis, targeting a 75–85%
 * hold-rate), and the randomized SIDE the learner must argue (MCAT-style — the
 * learner never picks their stance).
 *
 * The duel stays FORMATIVE: nothing here mints mastery. The engine only reads the
 * learner's own duel history + rating and the exam date; the CARS ability nudge
 * (K=0.08) and the "writes no mastery" guarantee live in the authority.
 */

export interface CarsDuelConfig {
  /** Recent duels whose topics are on novelty cooldown (never repeat within this window). */
  readonly noveltyWindow: number;
  /** Recent duels weighed for theme/structure spread (favor under-represented strata). */
  readonly spreadWindow: number;
  /** Topic difficulty is picked within ±this of the learner's band, widening only if empty. */
  readonly difficultyRadius: number;
  /** Bounded per-learner duel history retained (the selector only needs recency). */
  readonly historyLimit: number;
  /** Elo step size for the intensity ability estimate. */
  readonly eloK: number;
  /** Center of the 75–85% target hold-rate band the intensity estimate steers toward. */
  readonly targetHoldRate: number;
  /** Intensity band thresholds on the ability rating, with a dead zone for hysteresis. */
  readonly intensity: {
    readonly standardEnter: number; // warmup → standard (rating rising)
    readonly warmupExit: number; // standard → warmup (rating falling)
    readonly challengeEnter: number; // standard → challenge (rating rising)
    readonly standardExit: number; // challenge → standard (rating falling)
  };
  /** Defend unlock: ≥ `standardRebuts` Standard Rebut duels at ≥ `holdRate` rolling. */
  readonly defendUnlock: {
    readonly standardRebuts: number;
    readonly holdRate: number;
    readonly rollingWindow: number;
  };
  /** Defend substitution probability by ability band (before taper). */
  readonly defendSubstitution: { readonly mid: number; readonly high: number };
  /** Ability-band thresholds on the rating (Defend is only offered at mid+). */
  readonly abilityBand: { readonly mid: number; readonly high: number };
  /** Defend tapers to 0 across this many days before the exam (the "final ~3 weeks"). */
  readonly defendTaperDays: number;
  /** Difficulty implied by the ability rating maps to `round(center + rating)`. */
  readonly difficultyCenter: number;
}

export const CARS_DUEL_CONFIG: CarsDuelConfig = {
  noveltyWindow: 20,
  spreadWindow: 8,
  difficultyRadius: 1,
  historyLimit: 60,
  eloK: 0.4,
  targetHoldRate: 0.8,
  intensity: {
    standardEnter: 0.4,
    warmupExit: 0.0,
    challengeEnter: 1.2,
    standardExit: 0.8,
  },
  defendUnlock: { standardRebuts: 12, holdRate: 0.75, rollingWindow: 12 },
  defendSubstitution: { mid: 0.12, high: 0.22 },
  abilityBand: { mid: 0.4, high: 1.2 },
  defendTaperDays: 21,
  difficultyCenter: 3,
};

export type CarsDuelAbilityBand = 'low' | 'mid' | 'high';

/** One completed duel, retained so the next selection can spread + gate off it. */
export interface CarsDuelRecord {
  readonly topicId: string;
  readonly theme: string;
  readonly argumentStructure: string;
  readonly mode: CarsDuelMode;
  readonly intensity: CarsDuelIntensity;
  /** Rubric hold-rate in [0,1], or null when the duel produced no gradable rubric. */
  readonly holdRate: number | null;
  readonly at: string;
}

/** Persisted per-learner CARS Duel engine state (formative; never mastery). */
export interface CarsDuelEngineState {
  readonly history: readonly CarsDuelRecord[];
  /** Elo-ish ability estimate (0 = average) driving intensity + topic difficulty. */
  readonly rating: number;
  /** Current system-set intensity — carried so hysteresis can resist flip-flop. */
  readonly intensity: CarsDuelIntensity;
  /** Latched once the Defend unlock threshold is first met. */
  readonly defendUnlocked: boolean;
}

export const initialCarsDuelState = (): CarsDuelEngineState => ({
  history: [],
  rating: 0,
  intensity: 'warmup',
  defendUnlocked: false,
});

export interface CarsDuelSelectionInput {
  readonly topics: readonly CarsDuelTopic[];
  readonly state: CarsDuelEngineState;
  /** 0 = the daily Rebut anchor; ≥1 = a second CARS on longer days (Defend-eligible). */
  readonly slotIndex: number;
  /** Days until the exam (from `goal.testDate`, WS8), or null for a rolling plan. */
  readonly daysUntilTest: number | null;
  /** Injected RNG in [0,1) so selection is deterministic under test. */
  readonly rng: () => number;
  /** Additional topic ids to avoid (e.g. the anchor's topic when picking a second). */
  readonly excludeTopicIds?: readonly string[];
}

export interface CarsDuelSelection {
  readonly mode: CarsDuelMode;
  readonly intensity: CarsDuelIntensity;
  readonly side: CarsDuelSide;
  readonly topic: CarsDuelTopic;
}

const clamp = (x: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, x));

/**
 * Elo-ish ability update from one duel's hold-rate: nudge the rating toward the
 * target hold-rate band (75–85%). Holding ABOVE the ~80% center means the current
 * intensity is too easy (rating rises → escalate); holding below means it is too
 * hard (rating falls → ease off). A null hold-rate (ungraded duel) leaves the
 * rating unchanged. The intensity is a self-correcting equilibrium: at the right
 * level the learner holds ~80% and the rating stops moving.
 */
export function updateCarsDuelRating(
  rating: number,
  holdRate: number | null,
  cfg: CarsDuelConfig = CARS_DUEL_CONFIG,
): number {
  if (holdRate === null) return rating;
  return rating + cfg.eloK * (clamp(holdRate, 0, 1) - cfg.targetHoldRate);
}

/**
 * Next intensity band from the current band + rating, with hysteresis: the enter
 * and exit thresholds differ, so a rating idling inside the dead zone holds the
 * band instead of oscillating. Steps at most one band per duel.
 */
export function nextCarsDuelIntensity(
  current: CarsDuelIntensity,
  rating: number,
  cfg: CarsDuelConfig = CARS_DUEL_CONFIG,
): CarsDuelIntensity {
  const t = cfg.intensity;
  if (current === 'warmup') return rating >= t.standardEnter ? 'standard' : 'warmup';
  if (current === 'challenge') return rating < t.standardExit ? 'standard' : 'challenge';
  // standard
  if (rating >= t.challengeEnter) return 'challenge';
  if (rating < t.warmupExit) return 'warmup';
  return 'standard';
}

/** Ability band from the rating (Defend substitution is only offered at mid+). */
export function carsDuelAbilityBand(
  rating: number,
  cfg: CarsDuelConfig = CARS_DUEL_CONFIG,
): CarsDuelAbilityBand {
  if (rating >= cfg.abilityBand.high) return 'high';
  if (rating >= cfg.abilityBand.mid) return 'mid';
  return 'low';
}

/**
 * Whether Defend has unlocked: at least `standardRebuts` Standard-intensity Rebut
 * duels with a gradable rubric, AND a rolling hold-rate over the most recent such
 * duels at or above the threshold.
 */
export function isDefendUnlocked(
  history: readonly CarsDuelRecord[],
  cfg: CarsDuelConfig = CARS_DUEL_CONFIG,
): boolean {
  const standardRebuts = history.filter(
    (r) => r.mode === 'rebut' && r.intensity === 'standard' && r.holdRate !== null,
  );
  if (standardRebuts.length < cfg.defendUnlock.standardRebuts) return false;
  const rolling = standardRebuts.slice(-cfg.defendUnlock.rollingWindow);
  const mean = rolling.reduce((sum, r) => sum + (r.holdRate ?? 0), 0) / rolling.length;
  return mean >= cfg.defendUnlock.holdRate;
}

/**
 * Defend taper factor in [0,1]: full weight until the final `defendTaperDays`,
 * then linearly to 0 on exam day. Null test date (rolling plan) never tapers.
 */
export function defendTaperFactor(
  daysUntilTest: number | null,
  cfg: CarsDuelConfig = CARS_DUEL_CONFIG,
): number {
  if (daysUntilTest === null) return 1;
  if (daysUntilTest <= 0) return 0;
  if (daysUntilTest >= cfg.defendTaperDays) return 1;
  return daysUntilTest / cfg.defendTaperDays;
}

/** Defend substitution probability for the second CARS, ability-scaled then tapered. */
export function defendSubstitutionProbability(
  rating: number,
  daysUntilTest: number | null,
  cfg: CarsDuelConfig = CARS_DUEL_CONFIG,
): number {
  const band = carsDuelAbilityBand(rating, cfg);
  const base = band === 'high' ? cfg.defendSubstitution.high : band === 'mid' ? cfg.defendSubstitution.mid : 0;
  return base * defendTaperFactor(daysUntilTest, cfg);
}

/** Fold one completed duel into the engine state (rating, intensity, unlock latch). */
export function recordCarsDuelOutcome(
  state: CarsDuelEngineState,
  outcome: {
    readonly topic: Pick<CarsDuelTopic, 'id' | 'theme' | 'argumentStructure'>;
    readonly mode: CarsDuelMode;
    readonly intensity: CarsDuelIntensity;
    readonly holdRate: number | null;
    readonly at: string;
  },
  cfg: CarsDuelConfig = CARS_DUEL_CONFIG,
): CarsDuelEngineState {
  const record: CarsDuelRecord = {
    topicId: outcome.topic.id,
    theme: outcome.topic.theme,
    argumentStructure: outcome.topic.argumentStructure,
    mode: outcome.mode,
    intensity: outcome.intensity,
    holdRate: outcome.holdRate,
    at: outcome.at,
  };
  const history = [...state.history, record].slice(-cfg.historyLimit);
  const rating = updateCarsDuelRating(state.rating, outcome.holdRate, cfg);
  return {
    history,
    rating,
    intensity: nextCarsDuelIntensity(state.intensity, rating, cfg),
    // Latched: once unlocked, Defend stays available (the taper, not a re-lock,
    // is what removes it near the exam).
    defendUnlocked: state.defendUnlocked || isDefendUnlocked(history, cfg),
  };
}

/** Difficulty band (1–5) the learner's rating puts them near. */
export function targetDifficulty(rating: number, cfg: CarsDuelConfig = CARS_DUEL_CONFIG): number {
  return clamp(Math.round(cfg.difficultyCenter + rating), 1, 5);
}

/**
 * Decide the mode for a scheduled duel. Rebut is the daily anchor (always). Defend
 * only substitutes for a second+ CARS, only once unlocked, at an ability-scaled &
 * tapered probability — otherwise Rebut.
 */
export function decideCarsDuelMode(
  input: Pick<CarsDuelSelectionInput, 'state' | 'slotIndex' | 'daysUntilTest' | 'rng'>,
  cfg: CarsDuelConfig = CARS_DUEL_CONFIG,
): CarsDuelMode {
  if (input.slotIndex <= 0 || !input.state.defendUnlocked) return 'rebut';
  const p = defendSubstitutionProbability(input.state.rating, input.daysUntilTest, cfg);
  return input.rng() < p ? 'defend' : 'rebut';
}

/**
 * Pick one topic: exclude novelty-cooldown (and caller-excluded) topics, restrict
 * to difficulty near the learner's band (widening only if that band is empty),
 * then favor the least-recently-seen theme/structure strata and randomize within
 * the best-spread bucket.
 */
export function selectCarsDuelTopic(
  input: Pick<CarsDuelSelectionInput, 'topics' | 'state' | 'rng' | 'excludeTopicIds'>,
  cfg: CarsDuelConfig = CARS_DUEL_CONFIG,
): CarsDuelTopic {
  const { topics, state, rng } = input;
  if (topics.length === 0) throw new Error('CARS Duel selection requires a non-empty topic pool.');

  const cooldown = new Set<string>([
    ...state.history.slice(-cfg.noveltyWindow).map((r) => r.topicId),
    ...(input.excludeTopicIds ?? []),
  ]);
  const fresh = topics.filter((t) => !cooldown.has(t.id));
  // If cooldown would exclude everything (tiny pool), ignore it rather than fail.
  const pool = fresh.length > 0 ? fresh : topics;

  // Difficulty near the learner's band, widening the radius only if the band is empty.
  const target = targetDifficulty(state.rating, cfg);
  let banded = pool;
  for (let radius = cfg.difficultyRadius; radius <= 4; radius += 1) {
    const within = pool.filter((t) => Math.abs(t.difficulty - target) <= radius);
    if (within.length > 0) {
      banded = within;
      break;
    }
  }

  // Spread: penalize themes/structures seen in the recent window; keep the minimum.
  const recent = state.history.slice(-cfg.spreadWindow);
  const themeCount = new Map<string, number>();
  const structureCount = new Map<string, number>();
  for (const r of recent) {
    themeCount.set(r.theme, (themeCount.get(r.theme) ?? 0) + 1);
    structureCount.set(r.argumentStructure, (structureCount.get(r.argumentStructure) ?? 0) + 1);
  }
  const penalty = (t: CarsDuelTopic): number =>
    (themeCount.get(t.theme) ?? 0) + (structureCount.get(t.argumentStructure) ?? 0);
  const minPenalty = Math.min(...banded.map(penalty));
  const best = banded.filter((t) => penalty(t) === minPenalty);

  // Stratified randomization within the best-spread bucket.
  const index = Math.min(best.length - 1, Math.floor(clamp(rng(), 0, 0.999999) * best.length));
  return best[index]!;
}

/** Randomized stance the learner must argue — the learner never picks their side. */
export function randomizeCarsDuelSide(rng: () => number): CarsDuelSide {
  return rng() < 0.5 ? 'affirm' : 'oppose';
}

/** Resolve one full duel selection: mode, intensity, side, and topic. */
export function selectCarsDuel(
  input: CarsDuelSelectionInput,
  cfg: CarsDuelConfig = CARS_DUEL_CONFIG,
): CarsDuelSelection {
  return {
    mode: decideCarsDuelMode(input, cfg),
    intensity: input.state.intensity,
    side: randomizeCarsDuelSide(input.rng),
    topic: selectCarsDuelTopic(input, cfg),
  };
}
