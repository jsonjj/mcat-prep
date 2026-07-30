/**
 * A circular mastery gauge (SVG donut with the percent in the middle).
 *
 * Two color languages, both consistent with the app's mastery palette:
 *   - `tone="mastery"` (default): teal when high, amber when low, deep teal-green
 *     at the capability cut, muted violet when a strong skill has decayed past
 *     its review line. Used by the Progress dashboard's reasoning-skill rail.
 *   - `tone="review"`: always amber (needs-work). Used by the Practice hub's
 *     "needs the most review" rings, where every ring is a weak lesson.
 *
 * Both inputs are BKT's, and both are named for the question they answer.
 * `reviewDue` is BKT decay, the capability authority, and this ring shows no
 * other kind of staleness — it was called `refreshNeeded` while its only caller
 * passed `reviewDue`, the warrant's name on a capability input.
 * `atCapabilityCut` is `P(L)` at or above the cut, and it was called `mastered`
 * for the same reason and with the same consequence: a claim's name on a value
 * that carries no warrant. The CSS suffixes now match — `--reviewdue` and
 * `--atcut`, not `--refresh` and `--mastered` — so the class a reader finds in
 * the stylesheet no longer names a different question from the prop that picks
 * it.
 *
 * The ring is decorative (`aria-hidden`); the surrounding control/list item
 * carries the accessible name and value.
 *
 * `animateOnMount` (Progress rail only) counts the ring up from 0 → `pct` on each
 * mount: the arc offset and the centre number are BOTH derived from one eased
 * value (`useCountUp`), so they can never drift. The arc colour is taken from the
 * final `pct`, not the animating value, so it never flickers class mid-ramp.
 */
import { useCountUp } from '../app/use-count-up';

const HIGH_MASTERY_PCT = 50;

type RingTone = 'mastery' | 'review';

function arcClass(pct: number, atCut: boolean, reviewDue: boolean, tone: RingTone): string {
  if (tone === 'review') return 'mc-ring__arc mc-ring__arc--review';
  if (reviewDue) return 'mc-ring__arc mc-ring__arc--reviewdue';
  if (atCut) return 'mc-ring__arc mc-ring__arc--atcut';
  return pct >= HIGH_MASTERY_PCT ? 'mc-ring__arc mc-ring__arc--high' : 'mc-ring__arc mc-ring__arc--low';
}

export function MasteryRing({
  pct,
  atCapabilityCut = false,
  reviewDue = false,
  tone = 'mastery',
  animateOnMount = false,
  animationDelayMs = 0,
}: {
  pct: number;
  atCapabilityCut?: boolean;
  reviewDue?: boolean;
  tone?: RingTone;
  /** Count the ring up from 0 → `pct` on mount (Progress reasoning-skill rail). */
  animateOnMount?: boolean;
  /** Per-ring start delay so the rail cascades; ignored unless `animateOnMount`. */
  animationDelayMs?: number;
}) {
  const r = 42;
  const circumference = 2 * Math.PI * r;
  // Colour is decided by the FINAL value so the arc class is stable through the ramp.
  const colorPct = Math.max(0, Math.min(100, pct));
  // Both the arc offset and the centre number read this single eased value.
  const shown = useCountUp(pct, { enabled: animateOnMount, delayMs: animationDelayMs });
  const clamped = Math.max(0, Math.min(100, shown));
  const offset = circumference * (1 - clamped / 100);
  return (
    <svg className="mc-ring" viewBox="0 0 100 100" role="img" aria-hidden="true">
      <circle className="mc-ring__track" cx="50" cy="50" r={r} />
      <circle
        className={arcClass(colorPct, atCapabilityCut, reviewDue, tone)}
        cx="50"
        cy="50"
        r={r}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        transform="rotate(-90 50 50)"
        // The rAF loop owns the offset frame-by-frame; the CSS ease would only lag
        // the arc behind the number, so it is switched off while we drive it.
        style={animateOnMount ? { transition: 'none' } : undefined}
      />
      <text className="mc-ring__pct" x="50" y="50" dominantBaseline="central" textAnchor="middle">
        {Math.round(clamped)}%
      </text>
    </svg>
  );
}
