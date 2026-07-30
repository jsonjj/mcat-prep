import { describe, expect, it } from 'vitest';
import { UtcTimestampSchema, type Clock } from '@mcat/contracts';
import { loadSyntheticBank, type LoadedBank } from '@mcat/content';
import { Authority } from './authority';
import {
  SyntheticPracticeBankPort,
  type ItemResponseTime,
  type PracticeAnswer,
  type PracticeAttemptLogEntry,
} from './practice';
import type { LearnerState } from './types';

/**
 * WS3 — calibration bands (WS1) + the picked-option misconception join (WS2) on
 * the Mistakes surfaces. These pin: confidently-wrong vs normal on a miss, the
 * separate shaky-wins read (correct answers never enter the error log), the
 * misconception carried on a miss and named as a pattern's leaning, and that
 * every one of these reads moves NO mastery.
 */

const KC_INHIBITION = 'V3-KC-525816';
const CORRECT = 'A';
const WRONG = 'B';
const NOW = UtcTimestampSchema.parse('2026-07-27T12:00:00.000Z');

/** Enzyme items that resolve in the synthetic bank, all in one KC. */
const ITEMS = [
  'q-enz-indep-competitive',
  'q-enz-indep-noncompetitive',
  'q-enz-transfer-lineweaver',
  'q-enz-passage-1',
  'q-enz-protected-1',
] as const;

/** Two items lean toward the SAME misconception; a third toward another. */
const ERROR_MODELS: Record<string, Record<string, string>> = {
  'q-enz-indep-competitive': {
    A: 'correct_model: reads the double-reciprocal correctly',
    B: 'misconception: treats competitive inhibition as irreversible',
    C: 'misconception: swaps Km and Vmax effects',
    D: 'misconception: ignores substrate concentration',
  },
  'q-enz-indep-noncompetitive': {
    A: 'correct_model: reads the double-reciprocal correctly',
    B: 'misconception: treats competitive inhibition as irreversible',
    C: 'misconception: swaps Km and Vmax effects',
    D: 'misconception: ignores substrate concentration',
  },
  'q-enz-transfer-lineweaver': {
    A: 'correct_model: reads the double-reciprocal correctly',
    B: 'misconception: swaps Km and Vmax effects',
    C: 'misconception: swaps Km and Vmax effects',
    D: 'misconception: ignores substrate concentration',
  },
};

/**
 * SyntheticPracticeBankPort that also serves authored error models per item AND
 * lets a test control the population median RT per item — the seam WS1's
 * trusted-median speed branch reads (FIX A). Unset items return no median, so
 * speed falls back to the fixed cutoffs exactly as the base port does.
 */
class ErrorModelBankPort extends SyntheticPracticeBankPort {
  readonly medians = new Map<string, ItemResponseTime>();

  override async getAnswer(questionId: string): Promise<PracticeAnswer | null> {
    const base = await super.getAnswer(questionId);
    if (base === null) return null;
    return { ...base, errorModels: ERROR_MODELS[questionId] ?? null };
  }

  override async itemResponseTimes(
    questionIds: readonly string[],
  ): Promise<ReadonlyMap<string, ItemResponseTime>> {
    const out = new Map<string, ItemResponseTime>();
    for (const id of questionIds) {
      const m = this.medians.get(id);
      if (m) out.set(id, m);
    }
    return out;
  }
}

function learner(): {
  authority: Authority;
  state: LearnerState;
  bank: LoadedBank;
  port: ErrorModelBankPort;
} {
  const bank = loadSyntheticBank();
  const clock: Clock = { now: () => NOW };
  const port = new ErrorModelBankPort(bank);
  const authority = new Authority(bank, clock, port);
  return { authority, state: authority.createGuest(), bank, port };
}

/**
 * Seed one KC with a real, low P(L) as-of NOW (no decay), so the KC is weak on
 * EVIDENCE (recorded state) rather than on the cold-start prior — the distinction
 * FIX B draws. A KC with no state reads as "no signal", never as weak.
 */
function seedKcMastery(state: LearnerState, kcId: string, pL: number): void {
  state.mastery = {
    kc: { [kcId]: { pL, halfLifeDays: 7, lastPracticedAt: NOW, lastDueReviewAt: null } },
    skill: {},
    cars: {},
    practicedLessonIds: [],
    appliedObservationIds: [],
    highestAppliedObservationSequence: null,
  };
}

/** Append one first-attempt row directly (stands in for a scored serve). */
const record = (
  authority: Authority,
  state: LearnerState,
  over: Partial<PracticeAttemptLogEntry> & { questionId: string },
): Promise<void> =>
  authority.practiceBank.recordPracticeAttempt(state.learnerId, {
    kcId: KC_INHIBITION,
    skill: 'EXPLAIN',
    cluster: 'BB1',
    familyId: null,
    chosenChoiceId: WRONG,
    correct: false,
    firstAttempt: true,
    activityType: 'practice',
    occurredAt: UtcTimestampSchema.parse('2026-07-27T12:00:00.000Z'),
    ...over,
  });

describe('WS3 — calibration band on a miss', () => {
  it('bands a fast miss confidently_wrong and a slow miss normal', async () => {
    const { authority, state } = learner();
    await record(authority, state, {
      questionId: 'q-enz-indep-competitive',
      elapsedMs: 5_000, // < 15s fixed-fallback fast cutoff
      answerChanges: 0,
    });
    await record(authority, state, {
      questionId: 'q-enz-indep-noncompetitive',
      elapsedMs: 120_000, // > 90s slow cutoff
      answerChanges: 0,
    });

    const log = await authority.getErrorLog(state);
    const byId = new Map(log.map((e) => [e.questionId, e]));
    expect(byId.get('q-enz-indep-competitive')!.calibration).toBe('confidently_wrong');
    expect(byId.get('q-enz-indep-noncompetitive')!.calibration).toBe('normal');
  });

  it('does not call a fast miss confident when it was flip-flopped repeatedly', async () => {
    const { authority, state } = learner();
    await record(authority, state, {
      questionId: 'q-enz-indep-competitive',
      elapsedMs: 5_000,
      answerChanges: 4,
    });
    expect((await authority.getErrorLog(state))[0]!.calibration).toBe('normal');
  });

  it('names the picked distractor’s misconception, and only the picked one', async () => {
    const { authority, state } = learner();
    await record(authority, state, {
      questionId: 'q-enz-indep-competitive',
      chosenChoiceId: WRONG,
      elapsedMs: 5_000,
    });
    const entry = (await authority.getErrorLog(state))[0]!;
    expect(entry.chosenMisconception).toBe('treats competitive inhibition as irreversible');
    // The full map never rides along — only the one string for the picked option.
    expect(entry).not.toHaveProperty('errorModels');
    expect(JSON.stringify(entry)).not.toContain('correct_model');
    expect(JSON.stringify(entry)).not.toContain('swaps Km and Vmax');
  });
});

describe('WS3 — shaky wins are a separate read, never in the error log', () => {
  it('surfaces a slow correct answer as a shaky win, absent from the error log', async () => {
    const { authority, state } = learner();
    await record(authority, state, {
      questionId: 'q-enz-indep-competitive',
      chosenChoiceId: CORRECT,
      correct: true,
      elapsedMs: 120_000, // slow
    });

    const wins = await authority.getShakyWins(state);
    expect(wins).toHaveLength(1);
    expect(wins[0]!.questionId).toBe('q-enz-indep-competitive');
    expect(wins[0]!.calibration).toBe('shaky_win');
    // A win has no misconception behind the (correct) pick.
    expect(wins[0]!.chosenMisconception).toBeNull();
    // And it is NOT a mistake.
    expect(await authority.getErrorLog(state)).toEqual([]);
  });

  it('does NOT auto-flag a fresh-KC normal-speed win as shaky (the prior is not evidence)', async () => {
    // FIX B: a KC with no recorded state has only the 0.2 cold-start prior, which
    // is not evidence of weakness. A clean, normal-speed win on it is not shaky —
    // this is the pre-mastery-win dilution the old 0.9 review-line cut caused.
    const { authority, state } = learner();
    await record(authority, state, {
      questionId: 'q-enz-indep-competitive',
      chosenChoiceId: CORRECT,
      correct: true,
      elapsedMs: 40_000, // normal speed; KC has no state → not weak
    });
    expect(await authority.getShakyWins(state)).toEqual([]);
  });

  it('surfaces a normal-speed win in a genuinely weak KC (low recorded mastery) as shaky', async () => {
    // FIX B: below WEAK_KC_LINE (0.35) AND backed by real state → genuinely weak.
    const { authority, state } = learner();
    seedKcMastery(state, KC_INHIBITION, 0.3);
    await record(authority, state, {
      questionId: 'q-enz-indep-competitive',
      chosenChoiceId: CORRECT,
      correct: true,
      elapsedMs: 40_000, // normal speed → only the weak-KC arm can make it shaky
    });
    const wins = await authority.getShakyWins(state);
    expect(wins.map((w) => w.questionId)).toEqual(['q-enz-indep-competitive']);
  });
});

describe('WS1 — per-item median RT threads into calibration (FIX A)', () => {
  it('bands a miss fast against a TRUSTED item median where the fixed cutoff would not', async () => {
    // 40s item median (>= the 20-sample floor) puts the fast cut at 20s, so an 18s
    // miss is fast. The fixed fallback fast cut is 15s, so WITHOUT a trusted median
    // this same 18s miss bands `normal` — proof the median branch is doing work.
    const { authority, state, port } = learner();
    port.medians.set('q-enz-indep-competitive', { medianMs: 40_000, sampleSize: 20 });
    await record(authority, state, {
      questionId: 'q-enz-indep-competitive',
      elapsedMs: 18_000,
      answerChanges: 0,
    });
    expect((await authority.getErrorLog(state))[0]!.calibration).toBe('confidently_wrong');
  });

  it('falls back to the fixed cutoff when the item median is below the sample floor', async () => {
    // Same 40s median but only 19 samples → not trusted → the 15s fixed fast cut
    // applies, and 18s is over it → a normal miss, not confidently wrong.
    const { authority, state, port } = learner();
    port.medians.set('q-enz-indep-competitive', { medianMs: 40_000, sampleSize: 19 });
    await record(authority, state, {
      questionId: 'q-enz-indep-competitive',
      elapsedMs: 18_000,
      answerChanges: 0,
    });
    expect((await authority.getErrorLog(state))[0]!.calibration).toBe('normal');
  });

  it('bands a win slow against a trusted item median (item-relative, not the fixed 90s)', async () => {
    // 30s median → slow cut 45s; a 60s win is over it, yet under the 90s fixed slow
    // cut, so only the item median can call it slow. A solid KC isolates the speed
    // axis from the weak-KC arm.
    const { authority, state, port } = learner();
    port.medians.set('q-enz-indep-competitive', { medianMs: 30_000, sampleSize: 40 });
    seedKcMastery(state, KC_INHIBITION, 0.99);
    await record(authority, state, {
      questionId: 'q-enz-indep-competitive',
      chosenChoiceId: CORRECT,
      correct: true,
      elapsedMs: 60_000,
    });
    const wins = await authority.getShakyWins(state);
    expect(wins.map((w) => w.questionId)).toEqual(['q-enz-indep-competitive']);
  });
});

describe('WS3 — pattern names the leaning misconception once assertable', () => {
  it('reports the most-leaned misconception across the missed items', async () => {
    const { authority, state } = learner();
    // 3 misses (2 sharing a misconception) + 2 correct → 5 attempted, 3 missed: assertable.
    await record(authority, state, { questionId: ITEMS[0], chosenChoiceId: WRONG });
    await record(authority, state, { questionId: ITEMS[1], chosenChoiceId: WRONG });
    await record(authority, state, { questionId: ITEMS[2], chosenChoiceId: WRONG });
    await record(authority, state, { questionId: ITEMS[3], chosenChoiceId: CORRECT, correct: true });
    await record(authority, state, { questionId: ITEMS[4], chosenChoiceId: CORRECT, correct: true });

    const patterns = await authority.getMistakePatterns(state);
    expect(patterns).toHaveLength(1);
    const pattern = patterns[0]!;
    expect(pattern.assertable).toBe(true);
    expect(pattern.missedItems).toBe(3);
    expect(pattern.attemptedItems).toBe(5);
    // items 0 and 1 both lean "treats competitive inhibition as irreversible" (2),
    // item 2 leans "swaps Km and Vmax effects" (1) → the mode wins.
    expect(pattern.leaningMisconception).toBe('treats competitive inhibition as irreversible');
  });

  it('withholds the leaning misconception below the assertion floor', async () => {
    const { authority, state } = learner();
    await record(authority, state, { questionId: ITEMS[0], chosenChoiceId: WRONG });
    await record(authority, state, { questionId: ITEMS[1], chosenChoiceId: WRONG });
    const pattern = (await authority.getMistakePatterns(state))[0]!;
    expect(pattern.assertable).toBe(false);
    expect(pattern.leaningMisconception).toBeNull();
  });
});

describe('WS3 — the calibration + misconception reads move no mastery', () => {
  it('leaves mastery untouched across all three reads', async () => {
    const { authority, state } = learner();
    await record(authority, state, { questionId: ITEMS[0], chosenChoiceId: WRONG, elapsedMs: 5_000 });
    await record(authority, state, {
      questionId: ITEMS[1],
      chosenChoiceId: CORRECT,
      correct: true,
      elapsedMs: 120_000,
    });
    const before = JSON.stringify(state.mastery ?? null);
    await authority.getErrorLog(state);
    await authority.getShakyWins(state);
    await authority.getMistakePatterns(state);
    expect(JSON.stringify(state.mastery ?? null)).toBe(before);
  });
});
