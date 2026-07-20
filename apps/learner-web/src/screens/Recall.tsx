import { useNavigate } from 'react-router-dom';
import { Button, Callout, Card, Eyebrow, Stack } from '@mcat/ui-web';

export function Recall() {
  const navigate = useNavigate();
  return (
    <div className="mc-screen">
      <header className="mc-screen__head">
        <h1 className="mc-h1">Recall</h1>
        <p className="mc-muted">Spaced review scheduled by FSRS — bounded so it never becomes a backlog.</p>
      </header>
      <Card elevated>
        <Stack gap={3}>
          <Eyebrow>Recall lab</Eyebrow>
          <p>
            Scheduled reviews appear here and inside your daily plan. Ratings adjust when a card
            returns — they never award mastery on their own.
          </p>
          <Callout tone="info">
            For now, recall is woven into your current learning session. Keep going and you&apos;ll hit
            a recall check in context.
          </Callout>
          <Button variant="primary" size="lg" onClick={() => navigate('/app/learn')}>
            Go to today&apos;s work
          </Button>
        </Stack>
      </Card>
    </div>
  );
}
