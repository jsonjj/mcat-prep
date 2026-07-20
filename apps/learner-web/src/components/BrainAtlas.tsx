import type { MasteryMapEntry } from '@mcat/authority-core';

/**
 * The Evidence Atlas — a lightweight 2D luminous stand-in for the future 3D brain
 * (Phase 6). Regions glow only in proportion to real mastery evidence; it is
 * decorative and is hidden from assistive tech (the list route carries meaning).
 */
export function BrainAtlas({ glowing }: { glowing: number }) {
  const intensity = Math.min(1, 0.25 + glowing * 0.25);
  return (
    <div className="mc-atlas" aria-hidden="true">
      <div className="mc-atlas__halo" style={{ opacity: intensity }} />
      <div className="mc-atlas__orb">
        <span className="mc-atlas__lobe mc-atlas__lobe--a" />
        <span className="mc-atlas__lobe mc-atlas__lobe--b" />
        <span className="mc-atlas__lobe mc-atlas__lobe--c" />
        <span className="mc-atlas__core" />
      </div>
      <div className="mc-atlas__reflection" />
    </div>
  );
}

export const countGlowing = (map: MasteryMapEntry[] | undefined): number =>
  (map ?? []).filter((m) => m.base === 'independent' || m.base === 'retained' || m.base === 'strong')
    .length;
