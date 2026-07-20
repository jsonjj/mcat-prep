import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Callout, Card, Eyebrow, Stack } from '@mcat/ui-web';
import { useDiagnosticNext, useSubmitDiagnostic } from '../app/queries';

export function Diagnostic() {
  const navigate = useNavigate();
  const next = useDiagnosticNext();
  const submit = useSubmitDiagnostic();
  const [choice, setChoice] = useState<string | null>(null);

  useEffect(() => {
    if (next.data?.done) navigate('/onboarding/plan', { replace: true });
  }, [next.data?.done, navigate]);

  if (next.isLoading || !next.data) {
    return <div className="mc-center mc-muted">Preparing your placement…</div>;
  }
  const q = next.data.question;
  if (!q) {
    return <div className="mc-center mc-muted">Finishing placement…</div>;
  }

  const onSubmit = () => {
    submit.mutate(
      { questionId: q.id, choiceId: choice },
      { onSuccess: () => setChoice(null) },
    );
  };

  return (
    <div className="mc-onboarding">
      <Card elevated>
        <Stack gap={4}>
          <Eyebrow>Placement · provisional</Eyebrow>
          <div
            className="mc-progress"
            role="progressbar"
            aria-valuenow={Math.round(next.data.progress * 100)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Placement progress"
          >
            <span style={{ width: `${Math.max(6, next.data.progress * 100)}%` }} />
          </div>
          <h1 className="mc-h2">{q.stem}</h1>
          <fieldset className="mc-choices">
            <legend className="mc-visually-hidden">Answer choices</legend>
            {q.choices.map((c) => (
              <label key={c.id} className={`mc-choice ${choice === c.id ? 'mc-choice--selected' : ''}`}>
                <input
                  type="radio"
                  name="answer"
                  value={c.id}
                  checked={choice === c.id}
                  onChange={() => setChoice(c.id)}
                />
                <span className="mc-choice__key">{c.id}</span>
                <span className="mc-choice__text">{c.text}</span>
              </label>
            ))}
          </fieldset>
          <Callout tone="info">
            This is provisional placement across a limited synthetic bank — it identifies a starting
            point, not mastery.
          </Callout>
          <Button variant="primary" size="lg" fullWidth disabled={choice === null || submit.isPending} onClick={onSubmit}>
            {submit.isPending ? 'Saving…' : 'Submit and continue'}
          </Button>
        </Stack>
      </Card>
    </div>
  );
}
