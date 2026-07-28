import { SKILL_CLUSTERS } from '@mcat/contracts';
import { describe, expect, it } from 'vitest';
import { GENERATED_UNLOCK_WEIGHT } from './data/unlock-weights.generated';
import { UNLOCK_WEIGHT } from './diagnostic';

/**
 * Tripwire for the leverage table.
 *
 * The plan wants leverage ranked off the real prerequisite graph rather than a
 * hand-tuned table. The derivation exists (scripts/generate-unlock-weights.mjs)
 * but is not adopted, because today's registry graph is too sparse to rank
 * anything: most clusters gate nothing at all.
 *
 * If these expectations start failing, the graph has been populated and the
 * decision should be revisited — switching UNLOCK_WEIGHT over to
 * GENERATED_UNLOCK_WEIGHT is then a one-line change.
 */
describe('prerequisite-derived unlock weights', () => {
  const zeroed = SKILL_CLUSTERS.filter((c) => GENERATED_UNLOCK_WEIGHT[c] === 0);

  it('is still too sparse to rank leverage', () => {
    expect(zeroed.length).toBeGreaterThanOrEqual(8);
  });

  it('still disagrees with the plan about reasoning foundations being top leverage', () => {
    // The plan's worked example: fixing basic quantitative reasoning (R1) also
    // helps physics, so it should outrank a content cluster.
    expect(GENERATED_UNLOCK_WEIGHT.R1).toBeLessThan(GENERATED_UNLOCK_WEIGHT.CP3);
    expect(UNLOCK_WEIGHT.R1).toBeGreaterThan(UNLOCK_WEIGHT.CP3);
  });

  it('covers every cluster so adoption needs no fallback', () => {
    for (const c of SKILL_CLUSTERS) {
      expect(typeof GENERATED_UNLOCK_WEIGHT[c]).toBe('number');
    }
  });
});
