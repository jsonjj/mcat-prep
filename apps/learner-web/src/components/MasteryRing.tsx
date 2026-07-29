/**
 * A circular mastery gauge (SVG donut with the percent in the middle).
 *
 * Two color languages, both consistent with the app's mastery palette:
 *   - `tone="mastery"` (default): teal when high, amber when low, deep teal-green
 *     once mastered, muted violet when a mastered skill has decayed past its
 *     review line. Used by the Progress dashboard's reasoning-skill rail.
 *   - `tone="review"`: always amber (needs-work). Used by the Practice hub's
 *     "needs the most review" rings, where every ring is a weak lesson.
 *
 * `reviewDue` is BKT decay, the capability authority, and this ring shows no
 * other kind of staleness. It was called `refreshNeeded` while its only caller
 * passed `reviewDue` — the warrant's name on a capability input — which is the
 * same conflation the learner-facing "Needs refresh" copy carried.
 *
 * The ring is decorative (`aria-hidden`); the surrounding control/list item
 * carries the accessible name and value.
 */
const HIGH_MASTERY_PCT = 50;

type RingTone = 'mastery' | 'review';

function arcClass(pct: number, mastered: boolean, reviewDue: boolean, tone: RingTone): string {
  if (tone === 'review') return 'mc-ring__arc mc-ring__arc--review';
  if (reviewDue) return 'mc-ring__arc mc-ring__arc--refresh';
  if (mastered) return 'mc-ring__arc mc-ring__arc--mastered';
  return pct >= HIGH_MASTERY_PCT ? 'mc-ring__arc mc-ring__arc--high' : 'mc-ring__arc mc-ring__arc--low';
}

export function MasteryRing({
  pct,
  mastered = false,
  reviewDue = false,
  tone = 'mastery',
}: {
  pct: number;
  mastered?: boolean;
  reviewDue?: boolean;
  tone?: RingTone;
}) {
  const r = 42;
  const circumference = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, pct));
  const offset = circumference * (1 - clamped / 100);
  return (
    <svg className="mc-ring" viewBox="0 0 100 100" role="img" aria-hidden="true">
      <circle className="mc-ring__track" cx="50" cy="50" r={r} />
      <circle
        className={arcClass(clamped, mastered, reviewDue, tone)}
        cx="50"
        cy="50"
        r={r}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        transform="rotate(-90 50 50)"
      />
      <text className="mc-ring__pct" x="50" y="50" dominantBaseline="central" textAnchor="middle">
        {Math.round(clamped)}%
      </text>
    </svg>
  );
}
