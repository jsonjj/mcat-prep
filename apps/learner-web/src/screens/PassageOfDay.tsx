import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Callout, Card, Eyebrow, Stack } from '@mcat/ui-web';
import type { PracticeResult } from '@mcat/contracts';
import { useCheckPractice, usePracticeItem } from '../app/queries';

const DAILY_ITEM = 'q-enz-passage-1';

export function PassageOfDay() {
  const navigate = useNavigate();
  const item = usePracticeItem(DAILY_ITEM);
  const check = useCheckPractice();
  const [choice, setChoice] = useState<string | null>(null);
  const [result, setResult] = useState<PracticeResult | null>(null);

  if (item.isLoading || !item.data) {
    return <div className="mc-center mc-muted">Loading today’s passage…</div>;
  }

  const q = item.data.question;

  return (
    <div className="mc-screen mc-study">
      <Eyebrow>Passage of the day</Eyebrow>
      <h1 className="mc-h1">Read, reason, decide</h1>
      <p className="mc-muted mc-fineprint">
        A single low-stakes rep. It feeds your Mistakes log but never counts toward mastery on its own.
      </p>

      {item.data.stimulus ? (
        <Card elevated className="mc-stimulus">
          <h2 className="mc-h3">Passage</h2>
          <Stack gap={2}>
            {item.data.stimulus.body.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </Stack>
        </Card>
      ) : null}

      <h2 className="mc-h2">{q.stem}</h2>

      <fieldset className="mc-choices" disabled={!!result}>
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

      {result ? (
        <Card elevated>
          <Stack gap={3}>
            <div className="mc-inline">
              <span className="mc-reveal__key">
                {result.correct ? 'Correct' : 'Answer'}: {result.correctChoiceId}
              </span>
            </div>
            <p>{result.rationale}</p>
            {!result.correct && result.choiceRationale ? (
              <Callout tone="info" title={`Why ${choice} misses`}>
                {result.choiceRationale}
              </Callout>
            ) : null}
            <Button variant="secondary" onClick={() => navigate('/app')}>
              Back to Home
            </Button>
          </Stack>
        </Card>
      ) : (
        <Button
          variant="primary"
          size="lg"
          disabled={choice === null || check.isPending}
          onClick={() =>
            check.mutate({ questionId: DAILY_ITEM, choiceId: choice }, { onSuccess: (r) => setResult(r) })
          }
        >
          Check my answer
        </Button>
      )}
    </div>
  );
}
