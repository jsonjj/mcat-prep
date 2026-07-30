/**
 * On-open count-up: ramp a value 0 → `target` on mount through ONE rAF loop and
 * return the current eased value. Callers drive BOTH the number and the visual
 * fill (bar width / ring arc) from this single value, so the two can never drift
 * — at every frame the displayed number is `round(value)` and the fill is
 * `value` itself.
 *
 * It replays on every mount, which is what makes the Progress rings and CARS bars
 * re-animate on each visit: the Progress route element remounts on navigation
 * (exactly like the Evidence Atlas brain reveal, which resets its own clock on a
 * fresh mount). `prefers-reduced-motion` short-circuits to the final value with no
 * animation.
 *
 * Presentational only: it never touches the underlying data — `target` is the real
 * value and the loop always ends exactly on it.
 */
import { useEffect, useRef, useState } from 'react';

/**
 * Default ramp length — a deliberate, brain-reveal-paced sweep (~3s). Every Progress
 * count-up (the 7 reasoning rings, the 3 CARS sub-skill bars, and the CARS gauge) reads
 * this same default with the same easing, so they climb in lockstep and settle together.
 */
const DEFAULT_DURATION_MS = 3000;

/** Ease-out cubic: quick to move, gentle to settle. `eased(1) === 1`, so it lands exactly. */
const easeOutCubic = (t: number): number => 1 - (1 - t) ** 3;

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

export interface CountUpOptions {
  /** Ramp length in ms (default ~3s, the brain-reveal pace). */
  durationMs?: number;
  /** Per-item start delay in ms — a small stagger so a group cascades. */
  delayMs?: number;
  /** When false the hook is inert and returns `target` unchanged (no animation). */
  enabled?: boolean;
}

/**
 * Returns the current eased value on the way from 0 up to `target`. Use the SAME
 * return value for the label (`Math.round(value)`) and the fill so they stay in
 * lockstep.
 */
export function useCountUp(target: number, options: CountUpOptions = {}): number {
  const { durationMs = DEFAULT_DURATION_MS, delayMs = 0, enabled = true } = options;

  // Read the motion preference once per mount: it does not change mid-animation,
  // and this keeps matchMedia out of the per-frame path.
  const [reduced] = useState(prefersReducedMotion);
  const animate = enabled && !reduced;

  // Start at 0 when we will animate, so the first paint shows the empty state and
  // there is no flash of the final value before the ramp begins.
  const [value, setValue] = useState<number>(() => (animate ? 0 : target));

  // The live value, read (not depended on) by the effect so a mid-flight `target`
  // change eases from where we are instead of snapping back to 0.
  const valueRef = useRef<number>(value);
  valueRef.current = value;

  useEffect(() => {
    if (!animate) {
      setValue(target);
      return;
    }
    const from = valueRef.current;
    let raf = 0;
    let start: number | null = null;
    const tick = (now: number): void => {
      if (start === null) start = now;
      const elapsed = now - start - delayMs;
      if (elapsed <= 0) {
        raf = requestAnimationFrame(tick);
        return;
      }
      const t = Math.min(1, elapsed / durationMs);
      setValue(from + (target - from) * easeOutCubic(t));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs, delayMs, animate]);

  return value;
}
