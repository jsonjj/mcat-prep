import { useNavigate } from 'react-router-dom';
import { Button, Callout, Card, Eyebrow, Stack } from '@mcat/ui-web';
import { useWrapped } from '../app/queries';

const KIND_LABEL: Record<string, string> = {
  placement: 'placement reps',
  guided: 'guided reps',
  independent: 'independent checks',
  transfer: 'transfer wins',
  protected: 'protected proofs',
  recall: 'recall reviews',
};

export function Wrapped() {
  const navigate = useNavigate();
  const wrapped = useWrapped();
  if (wrapped.isLoading || !wrapped.data) {
    return <div className="mc-center mc-muted">Gathering your evidence…</div>;
  }
  const w = wrapped.data;
  const totalReps = Object.values(w.evidenceCounts).reduce((a, b) => a + b, 0);

  return (
    <div className="mc-screen">
      <header className="mc-screen__head">
        <Eyebrow>Your Wrapped · private</Eyebrow>
        <h1 className="mc-h1">Day {w.dayNumber}, and counting.</h1>
        <p className="mc-muted">A recap of evidence you built — just for you.</p>
      </header>

      <div className="mc-wrapped">
        <div className="mc-wrapped__stat">
          <p className="mc-wrapped__value">{w.skillsGlowing}</p>
          <p className="mc-muted mc-fineprint">skills glowing</p>
        </div>
        <div className="mc-wrapped__stat">
          <p className="mc-wrapped__value">{w.skillsTouched}</p>
          <p className="mc-muted mc-fineprint">skills touched</p>
        </div>
        <div className="mc-wrapped__stat">
          <p className="mc-wrapped__value">{totalReps}</p>
          <p className="mc-muted mc-fineprint">total reps logged</p>
        </div>
        <div className="mc-wrapped__stat">
          <p className="mc-wrapped__value">{w.protectedPassed}</p>
          <p className="mc-muted mc-fineprint">protected proofs</p>
        </div>
      </div>

      {totalReps > 0 ? (
        <Card elevated>
          <Stack gap={2}>
            <p className="mc-label">Where the reps went</p>
            <ul className="mc-evidence">
              {Object.entries(w.evidenceCounts).map(([kind, n]) => (
                <li key={kind}>
                  <span className="mc-evidence__kind">{KIND_LABEL[kind] ?? kind.replace(/_/g, ' ')}</span>
                  <span className="mc-evidence__n">{n}</span>
                </li>
              ))}
            </ul>
          </Stack>
        </Card>
      ) : (
        <Callout tone="info">Your recap fills in as you study. Come back after a few sessions.</Callout>
      )}

      <Callout tone="info">
        Wrapped is never a leaderboard and is never shared automatically. Numbers describe effort and
        evidence, not a predicted score.
      </Callout>

      <Button variant="secondary" onClick={() => navigate('/app')}>
        Back to Home
      </Button>
    </div>
  );
}
