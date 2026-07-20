import { Callout, Card, Eyebrow, Stack } from '@mcat/ui-web';
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

  return (
    <div className="mc-screen">
      <header className="mc-screen__head">
        <h1 className="mc-h1">Mistakes</h1>
        <p className="mc-muted">
          Your Second Brain: every miss keeps its reasoning and repair, not just a red mark.
        </p>
      </header>

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
