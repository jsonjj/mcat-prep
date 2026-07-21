import type { MasteryMapEntry } from '@mcat/authority-core';

/**
 * The Evidence Atlas hero — an iridescent glass brain (original generated asset).
 * Decorative and hidden from assistive tech; the Skills list route carries the
 * actual meaning. A future phase swaps this for an interactive, region-segmented
 * WebGL brain; the still asset already delivers the reference look.
 */
export function BrainAtlas({ glowing = 0 }: { glowing?: number }) {
  const intensity = Math.min(1, 0.55 + glowing * 0.12);
  return (
    <div className="mc-brainhero" aria-hidden="true">
      <div className="mc-brainhero__halo" style={{ opacity: intensity }} />
      <img className="mc-brainhero__img" src="/assets/brain-hero.png" alt="" decoding="async" />
    </div>
  );
}

export const countGlowing = (map: MasteryMapEntry[] | undefined): number =>
  (map ?? []).filter((m) => m.base === 'independent' || m.base === 'retained' || m.base === 'strong')
    .length;
