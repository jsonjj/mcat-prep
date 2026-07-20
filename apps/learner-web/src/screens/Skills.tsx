import { Link } from 'react-router-dom';
import { CLUSTER_INFO, SKILL_CLUSTERS, type MasteryState, type SkillCluster } from '@mcat/contracts';
import { baseStateRank, type BaseMasteryState } from '@mcat/domain';
import { Card, Eyebrow, MasteryBadge } from '@mcat/ui-web';
import { useMasteryMap } from '../app/queries';

export function Skills() {
  const mastery = useMasteryMap();

  const clusterState = (cluster: SkillCluster): BaseMasteryState => {
    const entries = (mastery.data ?? []).filter((m) => m.cluster === cluster);
    if (entries.length === 0) return 'not_assessed';
    return entries.reduce<BaseMasteryState>(
      (best, e) => (baseStateRank(e.base) > baseStateRank(best) ? e.base : best),
      'not_assessed',
    );
  };

  return (
    <div className="mc-screen">
      <header className="mc-screen__head">
        <h1 className="mc-h1">Skills</h1>
        <p className="mc-muted">
          The 15 clusters are a thematic map — a calm list route to everything, no 3D required.
        </p>
      </header>

      <div className="mc-skillgrid">
        {SKILL_CLUSTERS.map((cluster) => {
          const info = CLUSTER_INFO[cluster];
          return (
            <Link key={cluster} to={`/app/skills/${cluster}`} className="mc-skillcard">
              <Card elevated>
                <Eyebrow>{cluster}</Eyebrow>
                <p className="mc-skillcard__title">{info.title}</p>
                <MasteryBadge state={clusterState(cluster) as MasteryState} size="sm" />
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
