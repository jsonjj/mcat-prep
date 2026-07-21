import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useToday } from '../app/queries';

const GHOST_OPTOUT_KEY = 'mc.ghost.optout';

export function isGhostOptedOut(): boolean {
  try {
    return localStorage.getItem(GHOST_OPTOUT_KEY) === '1';
  } catch {
    return false;
  }
}

export function setGhostOptOut(optedOut: boolean): void {
  try {
    if (optedOut) localStorage.setItem(GHOST_OPTOUT_KEY, '1');
    else localStorage.removeItem(GHOST_OPTOUT_KEY);
  } catch {
    /* storage unavailable */
  }
}

/**
 * Supportive pace companion. Reads the engine-derived Ghost state (own goal +
 * timeline + coverage only) and greets/celebrates/reframes. Never blocks; can be
 * turned off entirely in Profile for learners it stresses rather than motivates.
 */
export function GhostCompanion() {
  const today = useToday();
  const [optedOut] = useState(isGhostOptedOut);
  const ghost = today.data?.ghost;
  if (!ghost || optedOut) return null;

  const showCta = ghost.state === 'behind' || ghost.state === 'idle';

  return (
    <aside className={`mc-ghost mc-ghost--${ghost.state}`} aria-label="Pace companion">
      <span className="mc-ghost__orb" aria-hidden="true" />
      <div className="mc-ghost__body">
        <p className="mc-ghost__headline">{ghost.headline}</p>
        <p className="mc-ghost__message">{ghost.message}</p>
      </div>
      {showCta ? (
        <Link to="/app/learn" className="mc-ghost__cta">
          One rep →
        </Link>
      ) : null}
    </aside>
  );
}
