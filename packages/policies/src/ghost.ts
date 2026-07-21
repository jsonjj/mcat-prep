import type { PolicyManifest } from './manifest';

/**
 * Ghost pacing companion (provisional-v1).
 *
 * A supportive self-pacer derived ONLY from the learner's own goal, timeline, and
 * coverage. It never invents peer/percentile comparisons and never blocks learning.
 * Tuned to celebrate as readily as it nudges (anti-anxiety): "behind" is always
 * reframed as a gentle, shame-free next step.
 */
export const GHOST_MANIFEST: PolicyManifest = {
  policyId: 'ghost',
  version: 'provisional-v1',
  status: 'provisional_active',
  summary:
    'Supportive self-pacing companion from own goal/timeline/coverage; never peer comparison; never blocks learning.',
};

export type GhostState = 'ahead' | 'on_track' | 'behind' | 'idle';

export interface GhostView {
  state: GhostState;
  headline: string;
  message: string;
  /** Expected coverage fraction by now (0..1) when a test date is set; null on a rolling plan. */
  expectedPct: number | null;
  /** Actual coverage fraction (0..1). */
  actualPct: number;
  /** Days since last activity; null if the learner has never studied. */
  daysIdle: number | null;
}

export interface GhostInput {
  scheduled: boolean;
  dayNumber: number;
  totalDays: number | null;
  /** 0..1 fraction of clusters with any real evidence. */
  coveragePct: number;
  /** Days since last activity; null if never active. */
  lastActiveDaysAgo: number | null;
}

const IDLE_DAYS = 2;
const PACE_BAND = 0.05;

const COPY: Record<GhostState, { headline: string; message: string }> = {
  ahead: {
    headline: 'Ahead of pace',
    message:
      "You're ahead of your own plan — lovely. Bank a little rest if you want it; momentum is already on your side.",
  },
  on_track: {
    headline: 'Right on pace',
    message: 'On pace with the version of you aiming for that goal. One solid rep keeps it honest.',
  },
  behind: {
    headline: "Let's catch up gently",
    message:
      'A steady you would be a bit further along — no shame in it. One focused rep now, and we rebuild from there.',
  },
  idle: {
    headline: 'Welcome back',
    message:
      "It's been a few days. A tiny five-minute rep counts far more than a perfect hour that never happens.",
  },
};

export function computeGhost(input: GhostInput): GhostView {
  let state: GhostState;
  let expectedPct: number | null = null;

  if (input.lastActiveDaysAgo !== null && input.lastActiveDaysAgo >= IDLE_DAYS) {
    state = 'idle';
  } else if (input.scheduled && input.totalDays && input.totalDays > 0) {
    expectedPct = Math.max(0, Math.min(1, input.dayNumber / input.totalDays));
    if (input.coveragePct >= expectedPct + PACE_BAND) state = 'ahead';
    else if (input.coveragePct >= expectedPct - PACE_BAND) state = 'on_track';
    else state = 'behind';
  } else {
    // Rolling plan (no test date): no schedule pressure — stay encouraging.
    state = 'on_track';
  }

  return {
    state,
    headline: COPY[state].headline,
    message: COPY[state].message,
    expectedPct,
    actualPct: input.coveragePct,
    daysIdle: input.lastActiveDaysAgo,
  };
}
