import { Link } from 'react-router-dom';
import { Callout, Card, Eyebrow, MasteryBadge, Stack } from '@mcat/ui-web';
import type { MasteryState } from '@mcat/contracts';
import { useMasteryMap } from '../app/queries';
import { EvidenceAtlas } from '../components/EvidenceAtlas';

export function Progress() {
  const mastery = useMasteryMap();
  const entries = mastery.data ?? [];
  const assessed = entries.filter((e) => e.base !== 'not_assessed');

  return (
    <div className="mc-screen">
      <header className="mc-screen__head">
        <h1 className="mc-h1">Progress</h1>
        <p className="mc-muted">
          Your Evidence Atlas fills in as regions earn mastery. Drag to rotate, tap a region to open
          it — everything is also in the Skills list.
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
        <span className="mc-daily__arrow" aria-hidden="true">→</span>
      </Link>

      <h2 className="mc-h2">Skills with evidence</h2>
      {assessed.length > 0 ? (
        <Stack gap={2}>
          {assessed.map((e) => (
            <Card key={e.skillId} elevated>
              <div className="mc-task">
                <div>
                  <p className="mc-task__title">{e.title}</p>
                  <p className="mc-muted mc-fineprint">{e.cluster}</p>
                </div>
                <MasteryBadge state={e.base as MasteryState} refreshNeeded={e.refreshNeeded} />
              </div>
            </Card>
          ))}
        </Stack>
      ) : (
        <Callout tone="info">Complete a learning session to start building evidence.</Callout>
      )}
    </div>
  );
}
