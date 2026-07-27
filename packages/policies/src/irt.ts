/**
 * IRT measurement layer for the mastery engine (mastery-bkt / provisional-v1).
 *
 * Turns a question's difficulty into the BKT engine's difficulty-aware *slip*.
 * Difficulty `b` is the population log-odds of being wrong; it is UNCALIBRATED
 * until an item has enough attempts, so before that we cold-start from the
 * author DOK label (the same uncalibrated proxy the diagnostic already uses).
 *
 * Pure functions only. See docs/mastery-pipeline.md §4.2–4.3.
 */

/** Slip difficulty anchor = the mastery cut (85% rule). */
export const SLIP_ANCHOR_M = 1.7;
/** Maximum slip bound (well-established item). */
export const MAX_SLIP_SM = 0.1;
/** `b` stays cold-started (DOK-derived) until an item clears this many attempts. */
export const MIN_ATTEMPTS_FOR_B = 20;
/** `p` is clamped to this range so `b` cannot diverge on all-right/all-wrong items. */
const P_CLAMP = 0.02;

export interface IrtConfig {
  slipAnchor: number;
  maxSlip: number;
  minAttemptsForB: number;
}

export const IRT_CONFIG: IrtConfig = {
  slipAnchor: SLIP_ANCHOR_M,
  maxSlip: MAX_SLIP_SM,
  minAttemptsForB: MIN_ATTEMPTS_FOR_B,
};

/**
 * DOK → cold-start difficulty `b`. Easy (low DOK) → negative; hard → positive.
 * DOK 5–6 (rare) clamp to the DOK-4 ceiling + a nudge. Unknown DOK → 0 (neutral).
 */
export function coldStartB(dokLevel: number | undefined): number {
  switch (dokLevel) {
    case 1:
      return -1.0;
    case 2:
      return -0.3;
    case 3:
      return 0.4;
    case 4:
      return 1.0;
    default:
      if (dokLevel !== undefined && dokLevel >= 5) return 1.4;
      return 0;
  }
}

export interface DifficultyInput {
  /** Total population attempts on this exact question. */
  attempts: number;
  /** Population correct count on this question. */
  correct: number;
  /** Author depth-of-knowledge (1–6), used only as a cold-start proxy. */
  dokLevel?: number;
}

/**
 * Population difficulty `b = ln((1 - p) / p)`, once the item has > minAttempts
 * attempts; otherwise a DOK cold-start. `p` is clamped so `b ∈ [-~3.9, ~3.9]`.
 */
export function difficultyB(input: DifficultyInput, cfg: IrtConfig = IRT_CONFIG): number {
  if (input.attempts <= cfg.minAttemptsForB || input.attempts <= 0) {
    return coldStartB(input.dokLevel);
  }
  const raw = input.correct / input.attempts;
  const p = Math.min(1 - P_CLAMP, Math.max(P_CLAMP, raw));
  return Math.log((1 - p) / p);
}

/**
 * Difficulty-aware slip: `C = m - b; D = 1 + e^C; S = S_m / D`.
 * Easy item (b negative) → slip near 0; hard item (b positive) → slip → S_m.
 */
export function slip(b: number, cfg: IrtConfig = IRT_CONFIG): number {
  const c = cfg.slipAnchor - b;
  const d = 1 + Math.exp(c);
  return cfg.maxSlip / d;
}
