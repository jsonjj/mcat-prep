import { Link, useNavigate } from 'react-router-dom';
import { Button, Callout, Card, Eyebrow, Stack } from '@mcat/ui-web';
import { useRecallLoad } from '../../app/recall-queries';

/** Recall tab landing: due summary + entry points. Flashcards are user-owned facts. */
export function RecallHome() {
  const navigate = useNavigate();
  const load = useRecallLoad();
  const data = load.data;
  const due = data?.due ?? 0;
  const newAvailable = data?.newAvailable ?? 0;
  const nothing = !load.isLoading && due === 0 && newAvailable === 0;

  return (
    <div className="mc-screen">
      <header className="mc-screen__head">
        <h1 className="mc-h1">Recall</h1>
        <p className="mc-muted">
          Your own flashcards, scheduled with spaced repetition. Private to you, and always here when
          a card is due.
        </p>
      </header>

      <Card elevated>
        <Stack gap={4}>
          {load.isLoading ? (
            <p className="mc-muted">Checking your deck…</p>
          ) : nothing ? (
            <Stack gap={2}>
              <Eyebrow>Your deck is empty</Eyebrow>
              <p className="mc-muted">
                Add a few cards or import an Anki deck and Recall will schedule them for you.
              </p>
            </Stack>
          ) : due === 0 ? (
            <Stack gap={2}>
              <Eyebrow>All caught up</Eyebrow>
              <p className="mc-muted">
                Nothing is due right now.{' '}
                {newAvailable > 0 ? `${newAvailable} new card${newAvailable === 1 ? '' : 's'} ready when you are.` : ''}
              </p>
              {newAvailable > 0 ? (
                <Button variant="secondary" size="lg" fullWidth onClick={() => navigate('/app/recall/review')}>
                  Learn new cards
                </Button>
              ) : null}
            </Stack>
          ) : (
            <Stack gap={4}>
              <Eyebrow>Ready to review</Eyebrow>
              <div className="mc-recall__stats">
                <Stat label="Due now" value={due} />
                <Stat label="New" value={newAvailable} />
                <Stat label="~min" value={data?.estimatedMinutesForDue ?? 0} />
              </div>
              <Button variant="primary" size="lg" fullWidth onClick={() => navigate('/app/recall/review')}>
                Start review
              </Button>
            </Stack>
          )}

          <div className="mc-recall__actions">
            <Link to="/app/recall/new" className="mc-textbtn">
              + Add cards
            </Link>
            <Link to="/app/recall/import" className="mc-textbtn">
              Import Anki deck
            </Link>
          </div>
        </Stack>
      </Card>

      <Callout tone="info" title="How Recall works">
        Cards you create or import are scheduled with FSRS so each one returns right before you’d
        forget it. Rate every card Again / Hard / Good / Easy — only “Again” counts as a miss. Recall
        strengthens memory facts; it never claims mastery.
      </Callout>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="mc-recall__stat">
      <span className="mc-recall__stat-value">{value}</span>
      <span className="mc-recall__stat-label">{label}</span>
    </div>
  );
}
