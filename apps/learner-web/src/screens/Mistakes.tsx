import { useLocation, useNavigate } from 'react-router-dom';
import { Button, Callout, Card, Eyebrow, Stack } from '@mcat/ui-web';
import { useErrorLog } from '../app/queries';

const CAUSE_LABEL: Record<string, string> = {
  did_not_know_content: 'Content gap',
  knew_but_misapplied: 'Applied incorrectly',
  misread_question_or_passage: 'Misread',
  missed_condition_unit_sign: 'Missed a condition',
  misinterpreted_graph_or_experiment: 'Misread data',
  calculation_error: 'Calculation',
  rushing_or_time: 'Pacing',
  not_sure: 'Unsure',
};

export function Mistakes() {
  const errors = useErrorLog();
  const location = useLocation();
  const navigate = useNavigate();
  // Today's Path routes its "Review Mistakes" slot here (placeholder — no guided
  // repair runner yet; see docs/mistakes-repair-plan.md). Offer a "done" return.
  const navState = location.state as { returnTo?: string; activityId?: string } | null;
  const returnTo = navState?.returnTo;
  const activityId = navState?.activityId;

  return (
    <div className="mc-screen">
      <header className="mc-screen__head">
        <h1 className="mc-h1">Mistakes</h1>
        <p className="mc-muted">
          Your Second Brain: every miss keeps its reasoning and repair, not just a red mark.
        </p>
      </header>

      {returnTo ? (
        <Callout tone="info" title="From today’s path">
          <Stack gap={3}>
            <p className="mc-fineprint">
              Review your open mistakes below. Guided repair (a fresh same-trap item with the
              diagnosis and refutation) is coming soon — for now, revisit and mark this done.
            </p>
            <Button
              variant="primary"
              onClick={() => navigate(returnTo, { state: { completedActivityId: activityId } })}
            >
              Done — back to plan
            </Button>
          </Stack>
        </Callout>
      ) : null}

      {errors.data && errors.data.length > 0 ? (
        <Stack gap={3}>
          {errors.data.map((e) => (
            <Card key={e.questionId} elevated>
              <div className="mc-task">
                <div>
                  <Eyebrow>{e.cause ? CAUSE_LABEL[e.cause] ?? e.cause : 'Reviewed'}</Eyebrow>
                  <p className="mc-task__title">{e.skillId.replace(/-/g, ' ')}</p>
                  <p className="mc-muted mc-fineprint">
                    You chose {e.chosenChoiceId ?? '—'} · {e.repaired ? 'repaired' : 'repair pending'}
                  </p>
                </div>
                <span className={`mc-pill ${e.repaired ? 'mc-pill--ok' : ''}`}>
                  {e.repaired ? 'Repaired' : 'Open'}
                </span>
              </div>
            </Card>
          ))}
        </Stack>
      ) : (
        <Callout tone="success" title="Nothing to review yet">
          When you miss a question, it lands here with its cause and a fresh follow-up. Recurring
          patterns only appear once there&apos;s enough evidence across different items.
        </Callout>
      )}
    </div>
  );
}
