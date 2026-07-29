import { describe, expect, it } from 'vitest';
import { BANK_PROFILES, type BankDokCounts } from './data/bank-profiles.generated';
import { CLUSTER_AXIS, FC_AXIS, FC_PLUS_AXIS, axisIds } from './diagnostic-axis';

/**
 * Pins scripts/generate-bank-profiles.mjs against counts measured by hand off
 * `content/question-bank/.local/db-pull/questions.json`.
 *
 * The bank itself is gitignored, so these tests cannot re-derive the numbers —
 * they assert the committed table still says what the bank said when it was
 * generated. A failure means the bank moved and the generator needs re-running,
 * not that the generator is wrong.
 */

const BANK_SIZE = 2108;
/** Questions whose lesson carries no FC tag; all of them are reasoning or CARS. */
const FC_UNTAGGED = 297;
/** Questions the FC axis can measure — the whole bank less the untagged ones. */
const FC_IN_SCOPE = BANK_SIZE - FC_UNTAGGED;

const total = (counts: BankDokCounts): number => counts[0] + counts[1] + counts[2];

const totals = (axisId: keyof typeof BANK_PROFILES): Record<string, number> =>
  Object.fromEntries(Object.entries(BANK_PROFILES[axisId]).map(([id, c]) => [id, total(c)]));

const sum = (axisId: keyof typeof BANK_PROFILES): number =>
  Object.values(BANK_PROFILES[axisId]).reduce((s, c) => s + total(c), 0);

describe('cluster-15 bank profile', () => {
  it('reproduces the measured per-cluster counts', () => {
    expect(totals('cluster-15')).toEqual({
      R1: 63,
      R2: 40,
      R3: 34,
      CP1: 137,
      CP2: 265,
      CP3: 219,
      BB1: 237,
      BB2: 205,
      BB3: 128,
      BB4: 96,
      PS1: 0,
      PS2: 257,
      PS3: 267,
      CA1: 73,
      CA2: 87,
    });
  });

  it('partitions the whole bank', () => {
    expect(sum('cluster-15')).toBe(BANK_SIZE);
  });
});

describe('fc-10 bank profile', () => {
  it('reproduces the measured per-concept counts', () => {
    expect(totals('fc-10')).toEqual({
      FC1: 280,
      FC2: 111,
      FC3: 203,
      FC4: 414,
      FC5: 279,
      FC6: 120,
      FC7: 155,
      FC8: 103,
      FC9: 106,
      FC10: 40,
    });
  });

  /**
   * A partition of what the axis can see. It is not the whole bank — the
   * FC-untagged questions are outside this axis entirely — but every question it
   * does count is counted once, so a simulation cannot draw one underlying
   * question through two buckets.
   */
  it('partitions the in-scope bank', () => {
    expect(sum('fc-10')).toBe(FC_IN_SCOPE);
  });

  /**
   * The two FC axes bucket a question by the same rule — its lesson's first
   * listed concept, which is what `fc-lessons.generated.ts` ships and what
   * production delivers against. Pinned as an identity because the simulation
   * looks the profile up by axis id, so a drift here would silently sweep fc-10
   * against a bank no form could be assembled from.
   */
  it('matches the FC rows of fc-15 bucket for bucket', () => {
    for (const [id, counts] of Object.entries(BANK_PROFILES['fc-10'])) {
      expect(BANK_PROFILES['fc-15'][id], id).toEqual(counts);
    }
  });
});

describe('fc-15 bank profile', () => {
  it('reproduces the measured per-bucket counts', () => {
    expect(totals('fc-15')).toEqual({
      FC1: 280,
      FC2: 111,
      FC3: 203,
      FC4: 414,
      FC5: 279,
      FC6: 120,
      FC7: 155,
      FC8: 103,
      FC9: 106,
      FC10: 40,
      R1: 63,
      R2: 40,
      R3: 34,
      CA1: 73,
      CA2: 87,
    });
  });

  /**
   * The composite's defining property. Unlike fc-10 it must place every question
   * in exactly one bucket, so the simulation cannot draw the same underlying
   * question through two buckets.
   */
  it('assigns every question exactly once', () => {
    expect(sum('fc-15')).toBe(BANK_SIZE);
  });

  it('takes the reasoning and CARS buckets straight from the cluster profile', () => {
    for (const id of ['R1', 'R2', 'R3', 'CA1', 'CA2']) {
      expect(BANK_PROFILES['fc-15'][id]).toEqual(BANK_PROFILES['cluster-15'][id]);
    }
  });

  it('accounts for the FC-untagged questions as exactly the reasoning and CARS clusters', () => {
    const offFc = ['R1', 'R2', 'R3', 'CA1', 'CA2'].reduce(
      (s, id) => s + total(BANK_PROFILES['cluster-15'][id]!),
      0,
    );
    expect(offFc).toBe(FC_UNTAGGED);
  });

  /** The composite is fc-10 plus the five clusters no FC-tagged lesson reaches. */
  it('is fc-10 plus the off-FC clusters, exactly', () => {
    const offFc = ['R1', 'R2', 'R3', 'CA1', 'CA2'].reduce(
      (s, id) => s + total(BANK_PROFILES['cluster-15'][id]!),
      0,
    );
    expect(sum('fc-15')).toBe(sum('fc-10') + offFc);
  });
});

describe('bank profiles against the axes they model', () => {
  const pairs = [
    ['cluster-15', CLUSTER_AXIS],
    ['fc-10', FC_AXIS],
    ['fc-15', FC_PLUS_AXIS],
  ] as const;

  it('covers every axis bucket and nothing else', () => {
    for (const [axisId, axis] of pairs) {
      expect(axis.id).toBe(axisId);
      expect(Object.keys(BANK_PROFILES[axisId])).toEqual(axisIds(axis));
    }
  });

  it('carries three non-negative integer DOK counts per bucket', () => {
    for (const [axisId] of pairs) {
      for (const counts of Object.values(BANK_PROFILES[axisId])) {
        expect(counts).toHaveLength(3);
        for (const n of counts) {
          expect(Number.isInteger(n)).toBe(true);
          expect(n).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });
});
