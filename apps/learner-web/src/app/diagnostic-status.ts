/**
 * Tracks whether the learner has actually *completed* the diagnostic, as opposed
 * to skipping it. Onboarding can complete via plan setup alone (skipping the
 * diagnostic), so this flag is what lets us keep re-offering the placement each
 * time until it's genuinely finished. Client-side + demo-scoped (localStorage).
 */
const KEY = 'mc.diagnostic.completed.v1';

export function markDiagnosticCompleted(): void {
  try {
    localStorage.setItem(KEY, '1');
  } catch {
    /* storage unavailable — flag stays unset for this session */
  }
}

export function isDiagnosticCompleted(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}
