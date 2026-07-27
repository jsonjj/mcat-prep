import { Link } from 'react-router-dom';
import { Callout, Card, Eyebrow, Stack } from '@mcat/ui-web';
import { useMasterySkills } from '../app/queries';
import { EvidenceAtlas } from '../components/EvidenceAtlas';

/** Starting BKT prior; a skill that has moved off it has some evidence. */
const PRIOR = 0.2;

export function Progress() {
  const skills = useMasterySkills();
  const assessed = (skills.data ?? []).filter((s) => Math.abs(s.pL - PRIOR) > 1e-6);

  return (
    <div className="mc-screen">
      <header className="mc-screen__head">
        <h1 className="mc-h1">Progress</h1>
        <p className="mc-muted">
          Your Evidence Atlas fills in as you master lessons on your own. Drag to rotate, tap a
          region to open it — your seven reasoning skills are on the Skills tab.
        </p>
      </header>

      <EvidenceAtlas />

      <Card elevated>
        <Stack gap={2}>
          <Eyebrow>Readiness trend</Eyebrow>
          <p className="mc-h3">
            {assessed.length === 0 ? 'Insufficient evidence yet' : 'Strengthening'}
          </p>
          <Callout tone="info" title="Score prediction is off">
            A numeric MCAT prediction stays hidden until the model is validated and you have enough
            recent, broad evidence. Until then we show direction, not a scaled score.
          </Callout>
        </Stack>
      </Card>

      <Link to="/app/wrapped" className="mc-daily" aria-label="See your Wrapped recap">
        <div className="mc-daily__text">
          <span className="mc-upnext__eyebrow">Your Wrapped · private</span>
          <span className="mc-daily__title">See your recap</span>
          <span className="mc-upnext__meta">A keepable summary of the evidence you have built.</span>
        </div>
        <span className="mc-daily__arrow" aria-hidden="true">
          →
        </span>
      </Link>
    </div>
  );
}
