import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useWrapped } from '../app/queries';

const DISMISSED_KEY = 'mc.wrapped.dismissedWeek';

const weekIndex = (day: number) => Math.floor((day - 1) / 7);
function dismissedWeek(): number {
  try {
    return Number(localStorage.getItem(DISMISSED_KEY) ?? '-1');
  } catch {
    return -1;
  }
}

/**
 * Wrapped as a moment: a quiet weekly recap teaser that *arrives* on Home once a
 * week and can be dismissed. The full recap always lives at /app/wrapped and in
 * Progress, so dismissing never hides it for good.
 */
export function WrappedCard() {
  const wrapped = useWrapped();
  const [dismissed, setDismissed] = useState(dismissedWeek);
  const w = wrapped.data;
  if (!w) return null;

  const wk = weekIndex(w.dayNumber);
  if (wk < 1 || dismissed >= wk) return null;

  const totalReps = Object.values(w.evidenceCounts).reduce((a, b) => a + b, 0);
  const dismiss = () => {
    try {
      localStorage.setItem(DISMISSED_KEY, String(wk));
    } catch {
      /* storage unavailable */
    }
    setDismissed(wk);
  };

  return (
    <aside className="mc-daily mc-wrappedcard" aria-label="Your week recap">
      <div className="mc-daily__text">
        <span className="mc-upnext__eyebrow">Your week</span>
        <span className="mc-daily__title">
          {w.skillsGlowing} glowing · {totalReps} reps
        </span>
        <span className="mc-upnext__meta">A quick recap of the evidence you built.</span>
      </div>
      <div className="mc-wrappedcard__actions">
        <Link to="/app/wrapped" className="mc-wrappedcard__cta">
          See recap →
        </Link>
        <button type="button" className="mc-textbtn mc-wrappedcard__dismiss" onClick={dismiss}>
          Dismiss
        </button>
      </div>
    </aside>
  );
}
