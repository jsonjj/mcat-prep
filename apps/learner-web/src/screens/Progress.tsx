import { Callout, Card, Eyebrow, MasteryBadge, Stack } from '@mcat/ui-web';
import type { MasteryState } from '@mcat/contracts';
import { useMasteryMap } from '../app/queries';

export function Progress() {
  const mastery = useMasteryMap();
  const entries = mastery.data ?? [];
  const assessed = entries.filter((e) => e.base !== 'not_assessed');

  return (
    <div className="mc-screen">
      <header className="mc-screen__head">
        <h1 className="mc-h1">Progress</h1>
        <p className="mc-muted">Understandable, freshness-based evidence — not a single number.</p>
      </header>

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
