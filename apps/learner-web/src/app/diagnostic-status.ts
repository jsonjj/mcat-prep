/**
 * Tracks whether *this learner* has actually completed the diagnostic, as opposed
 * to skipping it. Onboarding can complete via plan setup alone (skipping the
 * diagnostic), so this flag is what lets us keep re-offering the placement each
 * time until it's genuinely finished.
 *
 * Client-side + demo-scoped (localStorage), but keyed BY LEARNER: the flag used
 * to be a single browser-wide key, so any account that signed in on a browser
 * where the placement had ever been completed was told "already done" and skipped
 * straight past the placement. Scoping to the learner id fixes that — a fresh
 * account starts with the placement offered, and completion is remembered only
 * for the account that finished it.
 */
const KEY_PREFIX = 'mc.diagnostic.completed.v1';

const keyFor = (learnerId: string): string => `${KEY_PREFIX}:${learnerId}`;

export function markDiagnosticCompleted(learnerId: string | null | undefined): void {
  if (!learnerId) return;
  try {
    localStorage.setItem(keyFor(learnerId), '1');
  } catch {
    /* storage unavailable — flag stays unset for this session */
  }
}

export function isDiagnosticCompleted(learnerId: string | null | undefined): boolean {
  if (!learnerId) return false;
  try {
    return localStorage.getItem(keyFor(learnerId)) === '1';
  } catch {
    return false;
  }
}
