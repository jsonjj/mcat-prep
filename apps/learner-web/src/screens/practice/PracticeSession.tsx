import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button, Callout, Card, Eyebrow, Stack } from '@mcat/ui-web';
import type { PracticeAttemptResult, PracticeQueueItem } from '@mcat/contracts';
import { usePracticeQueue, useSubmitPracticeAttempt } from '../../app/practice-queries';
import { resurfaceAt, subAfterFirstAttempt, type Sub } from './session-flow';

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

/** A step in the working sequence: a first attempt, or a spaced second go. */
interface Slot {
  item: PracticeQueueItem;
  kind: 'first' | 'retry';
  firstChoice?: ChoiceId;
}

export function PracticeSession() {
  const navigate = useNavigate();
  const location = useLocation();
  const { x = 8, focus, returnTo, activityId } = (location.state as SessionState | null) ?? {};

  const queue = usePracticeQueue(x, focus, true);
  const submit = useSubmitPracticeAttempt();

  const [sequence, setSequence] = useState<Slot[]>([]);
  const [index, setIndex] = useState(0);
  const [choice, setChoice] = useState<ChoiceId | null>(null);
  const [firstChoice, setFirstChoice] = useState<ChoiceId | null>(null);
  const [sub, setSub] = useState<Sub>('answering');
  const [result, setResult] = useState<PracticeAttemptResult | null>(null);
  // First-attempt results, kept so a deferred second go can reveal locally
  // (the second go is learning-only — no extra server scoring).
  const [resultsByQ, setResultsByQ] = useState<Record<string, PracticeAttemptResult>>({});

  // Seed the working sequence from the loaded queue (once).
  useEffect(() => {
    const loaded = queue.data?.items ?? [];
    if (loaded.length > 0 && sequence.length === 0) {
      setSequence(loaded.map((item) => ({ item, kind: 'first' as const })));
    }
  }, [queue.data, sequence.length]);

  const slot: Slot | undefined = sequence[index];

  // Reset per-step working state whenever the active step changes.
  useEffect(() => {
    if (slot === undefined) return;
    setChoice(null);
    if (slot.kind === 'retry') {
      setFirstChoice(slot.firstChoice ?? null);
      setResult(resultsByQ[slot.item.question.id] ?? null);
      setSub('retry');
    } else {
      setFirstChoice(null);
      setResult(null);
      setSub('answering');
    }
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

  if (slot === undefined) {
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

  const item = slot.item;
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
    setFirstChoice(choice);
    submit.mutate(
      { questionId: q.id, specId: item.specId, chosenChoiceId: choice, firstAttempt: true },
      {
        onSuccess: (r) => {
          setResult(r);
          setResultsByQ((m) => ({ ...m, [q.id]: r }));
          setSub(subAfterFirstAttempt(r.correct));
        },
      },
    );
  };

  /** A missed first attempt still earns its spaced second go. */
  const resurfacing = slot.kind === 'first' && result !== null && !result.correct;

  /**
   * Leaving the reveal. On a missed first attempt this re-inserts the item
   * ~RETRY_GAP questions later for a second pass — the spaced resurface is
   * retained; only the cause-asking step in front of it is gone. On the last
   * remaining step the clamp lands it immediately after this one, which is the
   * behaviour the cause picker used to produce.
   */
  const onRevealContinue = () => {
    if (resurfacing && firstChoice !== null) {
      const insertAt = resurfaceAt(index, sequence.length);
      const retrySlot: Slot = { item, kind: 'retry', firstChoice };
      setSequence((seq) => {
        const next = [...seq];
        next.splice(insertAt, 0, retrySlot);
        return next;
      });
      // insertAt is never below index + 1, so the next step always exists.
      setIndex(index + 1);
      return;
    }
    advance();
  };

  const submitRetry = () => {
    if (choice === null) return;
    setSub('reveal'); // learning-only: reveal locally from the first-attempt result
  };

  // Which wrong choice to refute in the reveal: the latest wrong pick.
  const wrongChoice =
    result !== null && choice !== null && choice !== result.correctChoiceId
      ? choice
      : result !== null && firstChoice !== null && firstChoice !== result.correctChoiceId
        ? firstChoice
        : null;

  return (
    <div className="mc-screen mc-study mc-practice">
      <div className="mc-practice__progress">
        <Eyebrow>
          {PURPOSE_LABEL[item.purpose] ?? 'Practice'}
          {slot.kind === 'retry' ? ' · Second try' : ''} · Question {index + 1} of {sequence.length}
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

      {sub === 'reveal' && result !== null ? (
        <RevealCard
          result={result}
          wrongChoice={wrongChoice}
          onContinue={onRevealContinue}
          last={isLastStep}
          resurfacing={resurfacing}
        />
      ) : sub === 'retry' ? (
        <Stack gap={3}>
          <Callout tone="info" title="Back for a second pass">
            You picked {firstChoice ?? '—'} earlier and saw why it misses. Answer it again from
            memory.
          </Callout>
          <ChoiceList
            q={q}
            name={`retry-${index}`}
            choice={choice}
            onSelect={setChoice}
            disabledChoice={firstChoice}
          />
          <Button variant="primary" size="lg" disabled={choice === null} onClick={submitRetry}>
            Try once more
          </Button>
        </Stack>
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
  disabledChoice,
}: {
  q: PracticeQueueItem['question'];
  name: string;
  choice: ChoiceId | null;
  onSelect: (c: ChoiceId) => void;
  disabledChoice?: ChoiceId | null;
}) {
  return (
    <fieldset className="mc-choices">
      <legend className="mc-visually-hidden">Answer choices</legend>
      {q.choices.map((c) => {
        const isTried = !!disabledChoice && c.id === disabledChoice;
        return (
          <label
            key={c.id}
            className={`mc-choice ${choice === c.id ? 'mc-choice--selected' : ''} ${
              isTried ? 'mc-choice--tried' : ''
            }`}
          >
            <input
              type="radio"
              name={name}
              value={c.id}
              checked={choice === c.id}
              disabled={isTried}
              onChange={() => onSelect(c.id as ChoiceId)}
            />
            <span className="mc-choice__key">{c.id}</span>
            <span className="mc-choice__text">{c.text}</span>
            {isTried ? <span className="mc-choice__note">your first answer</span> : null}
          </label>
        );
      })}
    </fieldset>
  );
}

function RevealCard({
  result,
  wrongChoice,
  onContinue,
  last,
  resurfacing,
}: {
  result: PracticeAttemptResult;
  wrongChoice: ChoiceId | null;
  onContinue: () => void;
  last: boolean;
  resurfacing: boolean;
}) {
  return (
    <Card elevated>
      <Stack gap={3}>
        <div className="mc-inline">
          <span className={`mc-reveal__key ${result.correct ? 'mc-reveal__key--ok' : ''}`}>
            {result.correct ? 'Correct' : 'Answer'}: {result.correctChoiceId}
          </span>
        </div>
        <p>{result.rationale}</p>
        {wrongChoice !== null && result.choiceRationales[wrongChoice] ? (
          <Callout tone="info" title={`Why ${wrongChoice} misses`}>
            {result.choiceRationales[wrongChoice]}
          </Callout>
        ) : null}
        {resurfacing ? (
          <p className="mc-muted mc-fineprint">
            {last
              ? 'One more pass at this one before you finish.'
              : 'This one comes back in a few questions — a short gap helps it stick.'}
          </p>
        ) : null}
        <Button variant="primary" size="lg" onClick={onContinue}>
          {resurfacing && last ? 'Try it again' : last ? 'Finish' : 'Next question'}
        </Button>
      </Stack>
    </Card>
  );
}
