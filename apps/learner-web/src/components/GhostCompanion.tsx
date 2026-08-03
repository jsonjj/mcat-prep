const GHOST_OPTOUT_KEY = 'mc.ghost.optout';

/**
 * Ghost (supportive pace companion) opt-out helpers.
 *
 * The `GhostCompanion` component that once rendered the companion was never
 * mounted anywhere (its only entry point linked to the retired `/app/learn`
 * loop), so it was removed. These two localStorage helpers stay because the
 * Account screen (screens/Profile.tsx) still exposes the on/off toggle, and the
 * engine-side Ghost state is surfaced elsewhere.
 */
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
