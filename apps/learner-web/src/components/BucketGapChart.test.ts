import { describe, expect, it } from 'vitest';
import {
  bucketRowLabel,
  bucketRowViews,
  certaintyBand,
  clamp01,
  gapRange,
  sortBucketRows,
  type BucketGapRow,
} from './BucketGapChart';

/**
 * Certainty on the form production serves — `MST_140_RECOMMENDED` over the ten
 * Foundational Concepts — as min, the nine deciles, then max, from the
 * 240,000-read measurement `BucketGapChart.tsx` records and
 * `server/certainty-bands.test.ts` re-runs. The bands are cut at the 3rd and
 * 7th of these, so this grid is what pins their occupancy.
 *
 * It replaces a grid measured on a different generating population, which ran
 * 0.450..0.993 with median 0.804 and put the upper cut below the served form's
 * median.
 */
const MEASURED_DECILES = [
  0.3746, 0.6956, 0.7529, 0.7914, 0.8362, 0.8819, 0.9221, 0.9527, 0.9731, 0.9863, 0.9991,
] as const;

const row = (over: Partial<BucketGapRow> & { bucketId: string }): BucketGapRow => ({
  title: over.bucketId,
  gap: 0.5,
  certainty: 0.5,
  itemsSeen: 6,
  ...over,
});

describe('clamp01', () => {
  it('holds values inside the unit range', () => {
    expect(clamp01(-2)).toBe(0);
    expect(clamp01(4)).toBe(1);
    expect(clamp01(0.4)).toBe(0.4);
    expect(clamp01(Number.NaN)).toBe(0);
  });
});

describe('sortBucketRows', () => {
  it('puts the largest gap first', () => {
    const sorted = sortBucketRows([
      row({ bucketId: 'a', gap: 0.2 }),
      row({ bucketId: 'b', gap: 0.9 }),
      row({ bucketId: 'c', gap: 0.5 }),
    ]);

    expect(sorted.map((r) => r.bucketId)).toEqual(['b', 'c', 'a']);
  });

  it('breaks ties on certainty, then title', () => {
    const sorted = sortBucketRows([
      row({ bucketId: 'z', title: 'Zinc', gap: 0.4, certainty: 0.9 }),
      row({ bucketId: 'a', title: 'Acids', gap: 0.4, certainty: 0.9 }),
      row({ bucketId: 'm', title: 'Metabolism', gap: 0.4, certainty: 0.1 }),
    ]);

    expect(sorted.map((r) => r.bucketId)).toEqual(['a', 'z', 'm']);
  });

  it('does not mutate the input', () => {
    const rows = [row({ bucketId: 'a', gap: 0.1 }), row({ bucketId: 'b', gap: 0.8 })];
    sortBucketRows(rows);

    expect(rows.map((r) => r.bucketId)).toEqual(['a', 'b']);
  });
});

describe('bucketRowViews', () => {
  const rows = [
    row({ bucketId: 'a', gap: 0.9 }),
    row({ bucketId: 'b', gap: 0.7 }),
    row({ bucketId: 'c', gap: 0.5 }),
    row({ bucketId: 'd', gap: 0.1 }),
  ];

  it('draws every bucket, not only the reported starting points', () => {
    expect(bucketRowViews(rows, ['a', 'b']).map((v) => v.row.bucketId)).toEqual([
      'a',
      'b',
      'c',
      'd',
    ]);
  });

  it('marks the reported starting points and nothing else', () => {
    expect(bucketRowViews(rows, ['a', 'b']).map((v) => v.isPriority)).toEqual([
      true,
      true,
      false,
      false,
    ]);
  });

  it('marks a bucket wherever it sorts, not by its position', () => {
    expect(
      bucketRowViews(rows, ['d']).filter((v) => v.isPriority).map((v) => v.row.bucketId),
    ).toEqual(['d']);
  });

  it('marks nothing when no priorities are reported', () => {
    expect(bucketRowViews(rows).every((v) => !v.isPriority)).toBe(true);
  });
});

describe('certaintyBand', () => {
  it('cuts at the 7th and 3rd deciles of the measured distribution', () => {
    expect(certaintyBand(0.9527).id).toBe('confident');
    expect(certaintyBand(0.9526).id).toBe('moderate');
    expect(certaintyBand(0.7914).id).toBe('moderate');
    expect(certaintyBand(0.7913).id).toBe('provisional');
  });

  it('sorts the measured spread into the 30/40/30 split those cuts define', () => {
    expect(MEASURED_DECILES.map((c) => certaintyBand(c).id)).toEqual([
      'provisional',
      'provisional',
      'provisional',
      'moderate',
      'moderate',
      'moderate',
      'moderate',
      'confident',
      'confident',
      'confident',
      'confident',
    ]);
  });

  it('reaches every band within the range certainty actually takes', () => {
    expect(new Set(MEASURED_DECILES.map((c) => certaintyBand(c).id)).size).toBe(3);
  });

  it('describes how settled a read is, never how much was asked', () => {
    expect(certaintyBand(0.98).label).toBe('Settled read');
    expect(certaintyBand(0.85).label).toBe('Mostly settled');
    expect(certaintyBand(0.5).label).toBe('Borderline read');
  });
});

describe('gapRange', () => {
  it('collapses to the point estimate when fully certain', () => {
    expect(gapRange(0.6, 1)).toEqual({ lo: 0.6, hi: 0.6 });
  });

  it('widens as certainty falls', () => {
    const shaky = gapRange(0.5, 0.2);
    const solid = gapRange(0.5, 0.8);

    expect(shaky.hi - shaky.lo).toBeGreaterThan(solid.hi - solid.lo);
  });

  it('never leaves the drawable 0..1 scale', () => {
    const high = gapRange(0.95, 0);
    expect(high.lo).toBeCloseTo(0.45);
    expect(high.hi).toBe(1);

    const low = gapRange(0.05, 0);
    expect(low.lo).toBe(0);
    expect(low.hi).toBeCloseTo(0.55);
  });

  it('draws a visible whisker at the typical measured certainty', () => {
    const { lo, hi } = gapRange(0.5, MEASURED_DECILES[5]);

    expect((hi - lo) / 2).toBeCloseTo(0.059, 3);
  });

  it('keeps even the widest and tightest measured reads drawable', () => {
    const widest = gapRange(0.5, MEASURED_DECILES[0]);
    expect(widest.hi - widest.lo).toBeCloseTo(0.625, 3);
    expect(widest.lo).toBeGreaterThanOrEqual(0);
    expect(widest.hi).toBeLessThanOrEqual(1);

    const tightest = gapRange(0.5, MEASURED_DECILES[MEASURED_DECILES.length - 1]);
    expect(tightest.hi - tightest.lo).toBeGreaterThan(0);
  });

  /**
   * Three bands are only worth having if the middle one is a visible span
   * rather than a label on a mark nobody can distinguish from its neighbours.
   * The whisker at the lower cut is over four times the width of the whisker at
   * the upper one — 21% of the track against 5% — which is wider separation
   * than the 2.5x the three-way split was originally justified on.
   */
  it('separates the two cuts by more than four times the whisker width', () => {
    const width = (certainty: number): number => {
      const { lo, hi } = gapRange(0.5, certainty);
      return hi - lo;
    };

    expect(width(MEASURED_DECILES[3])).toBeCloseTo(0.209, 3);
    expect(width(MEASURED_DECILES[7])).toBeCloseTo(0.047, 3);
    expect(width(MEASURED_DECILES[3]) / width(MEASURED_DECILES[7])).toBeGreaterThan(4);
  });

  /**
   * The least settled read the served form produces sits below anything earlier
   * forms exercised, so its whisker is the widest ever drawn — and it is what
   * the track's 9px whisker over 13px bar is sized against. At either gap
   * extreme clamping halves it rather than letting a caliper end run past the
   * edge, so the widest drawn span is 31% of the scale and never the whole of it.
   */
  it('clamps the widest measured read at both ends of the scale', () => {
    for (const gap of [0, 1]) {
      const { lo, hi } = gapRange(gap, MEASURED_DECILES[0]);

      expect(lo).toBeGreaterThanOrEqual(0);
      expect(hi).toBeLessThanOrEqual(1);
      expect(hi - lo).toBeCloseTo(0.313, 3);
    }
  });

  it('stays inside the track for every measured certainty at any gap', () => {
    for (const certainty of MEASURED_DECILES) {
      for (const gap of [0, 0.05, 0.5, 0.95, 1]) {
        const { lo, hi } = gapRange(gap, certainty);

        expect(lo).toBeGreaterThanOrEqual(0);
        expect(hi).toBeLessThanOrEqual(1);
        expect(hi).toBeGreaterThanOrEqual(lo);
      }
    }
  });
});

describe('bucketRowLabel', () => {
  it('states the estimate, its range, how settled it is and the evidence', () => {
    expect(
      bucketRowLabel(
        row({
          bucketId: 'amino',
          title: 'Amino acids',
          gap: 0.8,
          certainty: MEASURED_DECILES[1],
          itemsSeen: 14,
        }),
      ),
    ).toBe(
      'Amino acids: likely gap 80 percent, plausible range 65 to 95 percent. Borderline read. 14 questions seen.',
    );
  });

  it('keeps the item count out of the sentence that names the band', () => {
    const label = bucketRowLabel(
      row({ bucketId: 'amino', title: 'Amino acids', certainty: MEASURED_DECILES[8], itemsSeen: 4 }),
    );

    expect(label).toContain('Settled read. 4 questions seen.');
  });

  it('says "1 question" rather than "1 questions"', () => {
    expect(bucketRowLabel(row({ bucketId: 'x', title: 'X', itemsSeen: 1 }))).toContain(
      '1 question seen.',
    );
  });
});
