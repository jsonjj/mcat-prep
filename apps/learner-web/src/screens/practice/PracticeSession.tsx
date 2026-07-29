import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button, Callout, Card, Eyebrow, Stack } from '@mcat/ui-web';
import type { PracticeAttemptResult, PracticeQueueItem } from '@mcat/contracts';
import { usePracticeQueue, useSubmitPracticeAttempt } from '../../app/practice-queries';
import { feedbackFor, subAfterAttempt, type Feedback, type Sub } from './session-flow';

type ChoiceId = 'A' | 'B' | 'C' | 'D';

const PURPOSE_LABEL: Record<string, string> = {
  train: 'Practice',
  probe: 'Check-in',
  repair: 'Repair',
};

interface SessionState {
  x?: number;
  focus?: string;
  /** When launched from Today's Path: where to return, and which activity to complete. */
  returnTo?: string;
  activityId?: string;
}

export function PracticeSession() {
  const navigate = useNavigate();
  const location = useLocation();
  const { x = 8, focus, returnTo, activityId } = (location.state as SessionState | null) ?? {};

  const queue = usePracticeQueue(x, focus, true);
  const submit = useSubmitPracticeAttempt();

  const [sequence, setSequence] = useState<PracticeQueueItem[]>([]);
  const [index, setIndex] = useState(0);
  const [choice, setChoice] = useState<ChoiceId | null>(null);
  const [sub, setSub] = useState<Sub>('answering');
  const [result, setResult] = useState<PracticeAttemptResult | null>(null);

  // Seed the working sequence from the loaded queue (once). The sequence is fixed
  // for the session: a miss no longer inserts a step, because the re-test it earns
  // is a *different* item on the same KC × skill and this queue holds at most one
  // item per KC × skill. That re-test is the cross-session repair path's job.
  useEffect(() => {
    const loaded = queue.data?.items ?? [];
    if (loaded.length > 0 && sequence.length === 0) {
      setSequence(loaded);
    }
  }, [queue.data, sequence.length]);

  const item: PracticeQueueItem | undefined = sequence[index];

  // Reset per-step working state whenever the active step changes.
  useEffect(() => {
    if (item === undefined) return;
    setChoice(null);
    setResult(null);
    setSub('answering');
    // Intentionally keyed on `index` only: the step is identified by position.
  }, [index]);

  if (queue.isLoading) {
    return <div className="mc-center mc-muted">Building your practice set…</div>;
  }

  if (queue.isError) {
    return (
      <div className="mc-screen mc-practice">
        <Callout tone="warning" title="Practice is unavailable">
          We couldn’t build a practice set right now. Please try again in a moment.
        </Callout>
        <Button variant="secondary" onClick={() => finish(false)}>
          {returnTo ? 'Back to plan' : 'Back'}
        </Button>
      </div>
    );
  }

  if (item === undefined) {
    return (
      <div className="mc-screen mc-practice">
        <Eyebrow>Practice</Eyebrow>
        <h1 className="mc-h1">Nothing to practice yet</h1>
        <p className="mc-muted">
          There aren’t enough eligible questions for this focus yet. Learn a bit more, then come back.
        </p>
        <Button variant="primary" onClick={() => finish(true)}>
          {returnTo ? 'Back to plan' : 'Back to Practice'}
        </Button>
      </div>
    );
  }

  const q = item.question;
  const isLastStep = index + 1 >= sequence.length;

  const advance = () => {
    if (index + 1 < sequence.length) setIndex(index + 1);
    else finish(true);
  };

  // Return to the plan (or the Practice hub). `complete` marks the plan activity done.
  const finish = (complete: boolean) => {
    if (returnTo) navigate(returnTo, complete ? { state: { completedActivityId: activityId } } : {});
    else navigate('/app/practice');
  };

  const checkAnswer = () => {
    if (choice === null) return;
    submit.mutate(
      { questionId: q.id, specId: item.specId, chosenChoiceId: choice, firstAttempt: true },
      {
        onSuccess: (r) => {
          setResult(r);
          setSub(subAfterAttempt());
        },
      },
    );
  };

  /** The one place a scored result becomes renderable, and it always discloses. */
  const feedback: Feedback | null =
    result === null || sub !== 'reveal' ? null : feedbackFor(result, choice);

  return (
    <div className="mc-screen mc-study mc-practice">
      <div className="mc-practice__progress">
        <Eyebrow>
          {PURPOSE_LABEL[item.purpose] ?? 'Practice'} · Question {index + 1} of {sequence.length}
        </Eyebrow>
        <div
          className="mc-practice__bar"
          role="progressbar"
          aria-valuenow={index + 1}
          aria-valuemin={1}
          aria-valuemax={sequence.length}
        >
          <span style={{ width: `${((index + 1) / sequence.length) * 100}%` }} />
        </div>
      </div>

      {q.passage.trim().length > 0 ? (
        <Card elevated className="mc-stimulus">
          <h2 className="mc-h3">Passage</h2>
          <Stack gap={2}>
            {q.passage.split(/\n{2,}/).map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </Stack>
        </Card>
      ) : null}

      <h1 className="mc-h2">{q.stem}</h1>

      {feedback !== null ? (
        <FeedbackCard feedback={feedback} onContinue={advance} last={isLastStep} />
      ) : (
        <Stack gap={3}>
          <ChoiceList q={q} name={`answer-${index}`} choice={choice} onSelect={setChoice} />
          <Button
            variant="primary"
            size="lg"
            disabled={choice === null || submit.isPending}
            onClick={checkAnswer}
          >
            Check my answer
          </Button>
        </Stack>
      )}
    </div>
  );
}

function ChoiceList({
  q,
  name,
  choice,
  onSelect,
}: {
  q: PracticeQueueItem['question'];
  name: string;
  choice: ChoiceId | null;
  onSelect: (c: ChoiceId) => void;
}) {
  return (
    <fieldset className="mc-choices">
      <legend className="mc-visually-hidden">Answer choices</legend>
      {q.choices.map((c) => (
        <label
          key={c.id}
          className={`mc-choice ${choice === c.id ? 'mc-choice--selected' : ''}`}
        >
          <input
            type="radio"
            name={name}
            value={c.id}
            checked={choice === c.id}
            onChange={() => onSelect(c.id as ChoiceId)}
          />
          <span className="mc-choice__key">{c.id}</span>
          <span className="mc-choice__text">{c.text}</span>
        </label>
      ))}
    </fieldset>
  );
}

/**
 * The answer-side card. Both halves of a miss are shown together: the key with the
 * rationale that explains it, and the refutation of the option the learner chose.
 * A miss also says where the concept comes back, so the immediate disclosure does
 * not read as the end of the matter.
 */
function FeedbackCard({
  feedback,
  onContinue,
  last,
}: {
  feedback: Feedback;
  onContinue: () => void;
  last: boolean;
}) {
  return (
    <Card elevated>
      <Stack gap={3}>
        <div className="mc-inline">
          <span className={`mc-reveal__key ${feedback.correct ? 'mc-reveal__key--ok' : ''}`}>
            {`${feedback.correct ? 'Correct' : 'Answer'}: ${feedback.correctChoiceId}`}
          </span>
        </div>
        <p>{feedback.rationale}</p>
        {feedback.wrongChoiceId !== null && feedback.wrongChoiceRationale !== null ? (
          <Callout tone="info" title={`Why ${feedback.wrongChoiceId} misses`}>
            {feedback.wrongChoiceRationale}
          </Callout>
        ) : null}
        {feedback.correct ? null : (
          <p className="mc-muted mc-fineprint">
            You’ll get a fresh question on this idea in a later session — a gap between the two is
            what makes it stick.
          </p>
        )}
        <Button variant="primary" size="lg" onClick={onContinue}>
          {last ? 'Finish' : 'Next question'}
        </Button>
      </Stack>
    </Card>
  );
}
