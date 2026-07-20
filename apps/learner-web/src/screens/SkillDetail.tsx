import { Link, useNavigate, useParams } from 'react-router-dom';
import { CLUSTER_INFO, type MasteryState, type SkillCluster } from '@mcat/contracts';
import { Button, Callout, Card, Eyebrow, MasteryBadge, Stack } from '@mcat/ui-web';
import { useMasteryMap, useSkills } from '../app/queries';

export function SkillDetail() {
  const { skillId } = useParams();
  const navigate = useNavigate();
  const cluster = skillId as SkillCluster | undefined;
  const info = cluster && cluster in CLUSTER_INFO ? CLUSTER_INFO[cluster] : null;
  const skills = useSkills();
  const mastery = useMasteryMap();

  if (!info) {
    return (
      <div className="mc-screen">
        <Callout tone="warning" title="Unknown skill">
          <Link to="/app/skills">Back to all skills</Link>
        </Callout>
      </div>
    );
  }

  const clusterSkills = (skills.data ?? []).filter((s) => s.cluster === cluster);
  const hasContent = clusterSkills.length > 0;

  return (
    <div className="mc-screen">
      <p>
        <Link to="/app/skills" className="mc-textbtn">
          ← All skills
        </Link>
      </p>
      <header className="mc-screen__head">
        <Eyebrow>{cluster}</Eyebrow>
        <h1 className="mc-h1">{info.title}</h1>
        <p className="mc-muted">{info.tested}</p>
      </header>

      {hasContent ? (
        <Stack gap={3}>
          {clusterSkills.map((s) => {
            const m = (mastery.data ?? []).find((x) => x.skillId === s.skillId);
            return (
              <Card key={s.skillId} elevated>
                <Stack gap={2}>
                  <p className="mc-task__title">{s.title}</p>
                  <p className="mc-muted mc-fineprint">{s.objective}</p>
                  <MasteryBadge
                    state={(m?.base ?? 'not_assessed') as MasteryState}
                    refreshNeeded={m?.refreshNeeded ?? false}
                    size="sm"
                  />
                </Stack>
              </Card>
            );
          })}
          <Button variant="primary" size="lg" onClick={() => navigate('/app/learn')}>
            Start learning
          </Button>
        </Stack>
      ) : (
        <Callout tone="info" title="Content coming">
          This cluster&apos;s reviewed content isn&apos;t loaded yet. The app is content-independent —
          skills activate the moment a valid, reviewed bank is published, with no app change.
        </Callout>
      )}
    </div>
  );
}
