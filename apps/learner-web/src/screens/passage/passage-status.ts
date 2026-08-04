/**
 * Tracks whether THIS learner has finished today's Passage of the Day, so the
 * once-a-day reading rep closes after one completion instead of being repeatable.
 *
 * The passage is deliberately off the authority kernel (it writes no state), so
 * completion is remembered client-side, keyed by (learner, local day). The key
 * uses the passage view's own `localDate` — the same learner-local day (4 AM
 * rollover) the server rotates the passage on — so it resets automatically each
 * day and never leaks one account's completion to another on a shared browser.
 * Mirrors diagnostic-status.ts.
 */
const PREFIX = 'mc.passage.done.v1';

const keyFor = (learnerId: string, localDate: string): string => `${PREFIX}:${learnerId}:${localDate}`;

export function markPassageDone(learnerId: string | null | undefined, localDate: string): void {
  if (!learnerId || !localDate) return;
  try {
    localStorage.setItem(keyFor(learnerId, localDate), '1');
  } catch {
    /* storage unavailable — the passage just stays repeatable this session */
  }
}

export function isPassageDone(
  learnerId: string | null | undefined,
  localDate: string | null | undefined,
): boolean {
  if (!learnerId || !localDate) return false;
  try {
    return localStorage.getItem(keyFor(learnerId, localDate)) === '1';
  } catch {
    return false;
  }
}
