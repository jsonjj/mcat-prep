import { useNavigate } from 'react-router-dom';
import { Button, Card, Eyebrow, Stack } from '@mcat/ui-web';

/**
 * CARS Duel landing: a calm on-ramp into the AI debate that sharpens critical
 * analysis & reasoning for the CARS section. There's no win/lose — Start hands
 * off to the duel itself, which owns the mode/difficulty/topic setup.
 */
export function CarsDuelHome() {
  const navigate = useNavigate();

  return (
    <div className="mc-screen">
      <Eyebrow>CARS Duel</Eyebrow>
      <h1 className="mc-h1">Debate an AI to sharpen your reasoning</h1>
      <p className="mc-muted">
        CARS Duel is an AI debate that strengthens the critical analysis &amp; reasoning skills the
        CARS section rewards. There’s no win or lose — it ends with a constructive reflection on how
        you argued.
      </p>

      <Card elevated>
        <Stack gap={4}>
          <Button variant="primary" size="lg" fullWidth onClick={() => navigate('/app/cars')}>
            Start CARS Duel
          </Button>
        </Stack>
      </Card>
    </div>
  );
}
