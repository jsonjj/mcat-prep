import { useNavigate } from 'react-router-dom';
import { Button, Card, Eyebrow, Stack } from '@mcat/ui-web';
import { useMasteryMap, useToday } from '../app/queries';
import { BrainAtlas, countGlowing } from '../components/BrainAtlas';

const CAPACITY_LABEL: Record<string, string> = {
  on_track: 'On track',
  tight: 'Tight',
  goal_plan_mismatch: 'Goal–plan mismatch',
  rolling: 'Rolling plan',
};

export function Home() {
  const navigate = useNavigate();
  const today = useToday();
  const mastery = useMasteryMap();
  const glowing = countGlowing(mastery.data);
  const upNext = today.data?.tasks.find((t) => t.taskId === today.data?.continueTaskId) ?? today.data?.tasks[0];

  return (
    <div className="mc-home">
      <header className="mc-home__head">
        <Eyebrow>MCAT Mastery</Eyebrow>
        <h1 className="mc-home__title">Your next step</h1>
        <p className="mc-muted">
          {glowing > 0 ? `${glowing} skill${glowing === 1 ? '' : 's'} glowing` : 'Fresh start'}
          {today.data ? ` · ${CAPACITY_LABEL[today.data.capacityLabel] ?? today.data.capacityLabel}` : ''}
        </p>
      </header>

      <div className="mc-home__atlas">
        <BrainAtlas glowing={glowing} />
      </div>

      {upNext ? (
        <Card elevated className="mc-upnext">
          <div className="mc-upnext__row">
            <div>
              <Eyebrow>Up next</Eyebrow>
              <p className="mc-upnext__title">{upNext.title}</p>
              <p className="mc-muted mc-fineprint">
                {upNext.estimatedMinutes} min · {upNext.reasonDetail ?? 'Recommended next'}
              </p>
            </div>
            <span className="mc-upnext__badge">{upNext.estimatedMinutes}m</span>
          </div>
        </Card>
      ) : null}

      <Stack gap={3}>
        <Button variant="primary" size="lg" fullWidth onClick={() => navigate('/app/learn')}>
          Continue
        </Button>
        <button type="button" className="mc-quickpractice" onClick={() => navigate('/app/recall')}>
          Quick practice · 5 min
        </button>
      </Stack>
    </div>
  );
}
