import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Button, Callout, Card, Eyebrow, Stack } from '@mcat/ui-web';
import { fetchTodaysPassage, gradePassage } from './passage/passage-client';
import type { PassageChoiceId, PassageGrade, PassageQuestionView } from './passage/passage-client';

/**
 * Passage of the Day — a formative CARS-style reading rep.
 *
 * The passage rotates daily from a vetted pool (server-selected by the learner's
 * local day) and is scored server-side with an explanation reveal. It is
 * display + score ONLY: it writes no mastery, logs no mistake, and never routes
 * through the authority kernel — a low-stakes rep to keep reading stamina warm.
 */

function revealClass(
  choiceId: PassageChoiceId,
  picked: PassageChoiceId | null,
  grade: PassageGrade | null,
): string {
  if (grade === null) return picked === choiceId ? 'mc-choice--selected' : '';
  if (choiceId === grade.correctChoiceId) return 'mc-choice--correct';
  if (choiceId === picked) return 'mc-choice--incorrect';
  return '';
}

function PassageQuestionCard({
  question,
  index,
  total,
}: {
  question: PassageQuestionView;
  index: number;
  total: number;
}) {
  const [choice, setChoice] = useState<PassageChoiceId | null>(null);
  const [grade, setGrade] = useState<PassageGrade | null>(null);
  const check = useMutation({
    mutationFn: () => gradePassage(question.id, choice),
    onSuccess: (g) => setGrade(g),
  });

  const locked = grade !== null;

  return (
    <Card elevated as="section" className="mc-potd__q">
      <Stack gap={3}>
        {total > 1 ? (
          <p className="mc-potd__qcount">
            Question {index + 1} of {total}
          </p>
        ) : null}
        <h2 className="mc-h3">{question.stem}</h2>

        <fieldset className="mc-choices" disabled={locked || check.isPending}>
          <legend className="mc-visually-hidden">Answer choices</legend>
          {question.choices.map((c) => (
            <label key={c.id} className={`mc-choice ${revealClass(c.id, choice, grade)}`}>
              <input
                type="radio"
                name={`answer-${question.id}`}
                value={c.id}
                checked={choice === c.id}
                onChange={() => setChoice(c.id)}
              />
              <span className="mc-choice__key">{c.id}</span>
              <span className="mc-choice__text">{c.text}</span>
            </label>
          ))}
        </fieldset>

        {grade ? (
          <Stack gap={2}>
            <div className="mc-inline">
              <span className={`mc-reveal__key ${grade.correct ? 'mc-reveal__key--ok' : ''}`}>
                {grade.correct ? 'Correct' : 'Answer'}: {grade.correctChoiceId}
              </span>
            </div>
            <p>{grade.rationale}</p>
            {!grade.correct && grade.choiceRationale ? (
              <Callout tone="info" title={`Why ${choice} misses`}>
                {grade.choiceRationale}
              </Callout>
            ) : null}
          </Stack>
        ) : (
          <Button
            variant="primary"
            size="lg"
            disabled={choice === null || check.isPending}
            loading={check.isPending}
            onClick={() => check.mutate()}
          >
            Check my answer
          </Button>
        )}

        {check.isError ? (
          <Callout tone="warning" title="Couldn’t score that">
            Something went wrong scoring your answer. Please try again.
          </Callout>
        ) : null}
      </Stack>
    </Card>
  );
}

export function PassageOfDay() {
  const navigate = useNavigate();
  const today = useQuery({ queryKey: ['passage-today'], queryFn: fetchTodaysPassage });

  if (today.isLoading) {
    return <div className="mc-center mc-muted">Loading today’s passage…</div>;
  }

  if (today.isError) {
    return (
      <div className="mc-screen mc-study mc-potd">
        <header className="mc-potd__head">
          <Eyebrow>Passage of the day</Eyebrow>
          <h1 className="mc-h1">Read, reason, decide</h1>
        </header>
        <Callout tone="warning" title="Passage unavailable">
          Today’s passage couldn’t be loaded. Check your connection and try again.
        </Callout>
        <div className="mc-potd__foot">
          <Button variant="primary" onClick={() => void today.refetch()}>
            Try again
          </Button>
          <Button variant="text" onClick={() => navigate('/app')}>
            Back to Home
          </Button>
        </div>
      </div>
    );
  }

  const passage = today.data;
  if (!passage) {
    return (
      <div className="mc-screen mc-study mc-potd">
        <header className="mc-potd__head">
          <Eyebrow>Passage of the day</Eyebrow>
          <h1 className="mc-h1">Read, reason, decide</h1>
        </header>
        <Callout tone="info" title="No passage today">
          The passage library is quiet right now. Check back soon — the daily reading rep rotates
          through a growing pool.
        </Callout>
        <div className="mc-potd__foot">
          <Button variant="secondary" onClick={() => navigate('/app')}>
            Back to Home
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mc-screen mc-study mc-potd">
      <header className="mc-potd__head">
        <Eyebrow>Passage of the day · {passage.discipline}</Eyebrow>
        <h1 className="mc-h1">{passage.title}</h1>
        <p className="mc-muted mc-fineprint">
          A short CARS-style reading rep — everything you need is in the passage. It’s formative
          only: read closely, reason it through, and check your thinking. It never counts toward
          mastery.
        </p>
      </header>

      <Card elevated className="mc-stimulus mc-potd__passage">
        <p className="mc-potd__passagelabel">Passage</p>
        <Stack gap={2}>
          {passage.body.map((paragraph, i) => (
            <p key={i}>{paragraph}</p>
          ))}
        </Stack>
      </Card>

      {passage.questions.map((question, i) => (
        <PassageQuestionCard
          key={question.id}
          question={question}
          index={i}
          total={passage.questions.length}
        />
      ))}

      <div className="mc-potd__foot">
        <Button variant="secondary" onClick={() => navigate('/app')}>
          Back to Home
        </Button>
      </div>
    </div>
  );
}
