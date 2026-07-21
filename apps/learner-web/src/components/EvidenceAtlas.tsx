import { lazy, Suspense, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BRAIN_REGION_BY_CLUSTER,
  CLUSTER_INFO,
  SKILL_CLUSTERS,
  type MasteryState,
  type SkillCluster,
} from '@mcat/contracts';
import { baseStateRank, type BaseMasteryState } from '@mcat/domain';
import { detectCapabilities } from '@mcat/platform-web';
import { Button, MasteryBadge } from '@mcat/ui-web';
import { useMasteryMap } from '../app/queries';
import { BrainAtlas, countGlowing } from './BrainAtlas';
import type { AtlasRegion } from './BrainScene';

const BrainScene = lazy(() => import('./BrainScene'));

/**
 * Anatomically-suggestive (not literal) placement for each cluster's region.
 * Front of the brain is +z; right is +x; up is +y.
 */
const POSITIONS: Record<SkillCluster, [number, number, number]> = {
  R1: [-0.2, 0.95, -0.1], // parietal
  R2: [0, 0.25, -1.5], // occipital
  R3: [0, 0.6, 0.15], // cingulate
  CP1: [-0.5, 0.1, 0.2], // basal ganglia
  CP2: [0, -0.45, -0.45], // midbrain
  CP3: [0.05, 0.05, -0.15], // thalamus
  BB1: [0, -0.35, 0.2], // hypothalamus
  BB2: [-0.05, 0.3, -0.05], // corpus callosum
  BB3: [0, -1.15, -0.35], // medulla
  BB4: [0, -0.8, -0.35], // pons
  PS1: [0.1, 0.45, 1.35], // frontal
  PS2: [0.6, -0.5, 0.55], // amygdala
  PS3: [0.78, -0.05, 0.45], // insula
  CA1: [-0.55, -0.45, -0.05], // hippocampus
  CA2: [1.15, -0.35, 0.35], // temporal
};

const regionLabel = (r: string) => r.replace(/-/g, ' ');

export function EvidenceAtlas() {
  const navigate = useNavigate();
  const mastery = useMasteryMap();
  const caps = useMemo(() => detectCapabilities(), []);
  const [selected, setSelected] = useState<SkillCluster | null>(null);

  const regions: AtlasRegion[] = useMemo(() => {
    const data = mastery.data ?? [];
    return SKILL_CLUSTERS.map((cluster) => {
      const entries = data.filter((m) => m.cluster === cluster);
      const state = entries.reduce<BaseMasteryState>(
        (best, e) =>
          baseStateRank(e.base as BaseMasteryState) > baseStateRank(best)
            ? (e.base as BaseMasteryState)
            : best,
        'not_assessed',
      );
      return {
        cluster,
        title: CLUSTER_INFO[cluster].title,
        region: BRAIN_REGION_BY_CLUSTER[cluster],
        state,
        position: POSITIONS[cluster],
      };
    });
  }, [mastery.data]);

  const sel = selected ? (regions.find((r) => r.cluster === selected) ?? null) : null;

  if (!caps.webgl) {
    return (
      <div className="mc-atlas">
        <BrainAtlas glowing={countGlowing(mastery.data)} />
        <p className="mc-atlas__hint mc-muted mc-fineprint">
          Interactive 3D needs WebGL — showing the calm still view. Everything is also on the Skills
          list.
        </p>
      </div>
    );
  }

  return (
    <div className="mc-atlas">
      <Suspense fallback={<BrainAtlas glowing={countGlowing(mastery.data)} />}>
        <BrainScene
          regions={regions}
          reducedMotion={caps.reducedMotion}
          selected={selected}
          onSelect={setSelected}
        />
      </Suspense>
      <p className="mc-atlas__hint mc-muted mc-fineprint" aria-hidden="true">
        Drag to rotate · tap a glowing region
      </p>
      {sel ? (
        <div className="mc-atlas__panel" role="status">
          <div className="mc-atlas__paneltop">
            <div>
              <span className="mc-upnext__eyebrow">
                {sel.cluster} · {regionLabel(sel.region)}
              </span>
              <p className="mc-atlas__paneltitle">{sel.title}</p>
            </div>
            <MasteryBadge state={sel.state as MasteryState} size="sm" />
          </div>
          <Button variant="secondary" onClick={() => navigate(`/app/skills/${sel.cluster}`)}>
            Open cluster
          </Button>
        </div>
      ) : null}
    </div>
  );
}
