import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button, Callout, Card, Eyebrow, Stack } from '@mcat/ui-web';
import type { PracticeAttemptResult, PracticeQueueItem } from '@mcat/contracts';
import { usePracticeQueue, useSubmitPracticeAttempt } from '../../app/practice-queries';
import {
  feedbackFor,
  queueNotices,
  resurfaceAt,
  subAfterFirstAttempt,
  subAfterSecondAttempt,
  type Feedback,
  type QueueNotice,
  type Sub,
} from './session-flow';

type ChoiceId = 'A' | 'B' | 'C' | 'D';

const PURPOSE_LABEL: Record<string, string> = {
  train: 'Practice',
  probe: 'Check-in',
  repair: 'Repair',
};

/**
 * The learner-facing sentence for one degraded-queue fact. Plain statements of
 * what happened: a taught gap is a "not yet", not a fault, and a short session
 * is worth saying up front rather than letting the learner find out when the
 * questions run out.
 */
const noticeText = (notice: QueueNotice, delivered: number, requested: number): string =>
  notice === 'taught-gap'
    ? 'Some questions are sitting out — they come from lessons you haven’t finished yet.'
    : `Shorter set than usual: ${delivered} of the ${requested} questions you asked for were available today.`;

/** One empty-queue state: what happened, and whether a lesson is the way out. */
interface EmptyState {
  title: string;
  body: string;
  /** Offer the curriculum. Only where a lesson is genuinely the next step. */
  findLesson: boolean;
}

/**
 * Which empty-queue state the learner is in, most specific first.
 *
 * Three causes, three sentences. The taught-set gate can withhold every science
 * question for two quite different reasons, and until 2026-07-29 only one of
 * them existed as far as this screen was concerned — the gate did not run at
 * all on an empty taught set, so a learner who had finished nothing was served
 * the unfiltered bank instead of any of these states. Now that it fails closed
 * there, `nothingTaught` is the common case rather than the exotic one: it is
 * every learner's first visit.
 *
 * It gets its own copy rather than reusing the taught-gap wording, because that
 * wording says "none of the questions we have are from those yet", which
 * presupposes finished lessons to draw from. Told to a learner who has finished
 * none, it reads as a content shortage on work they have done — the opposite of
 * the truth, and it hides the one action that helps.
 */
function emptyStateFor(
  view: { taughtGap: boolean; nothingTaught: boolean } | undefined,
): EmptyState {
  if (view?.nothingTaught === true) {
    return {
      title: 'Start with a lesson',
      body: 'Practice pulls its questions from lessons you’ve finished, and you haven’t finished one yet. Complete a lesson and its questions will show up here.',
      findLesson: true,
    };
  }
  if (view?.taughtGap === true) {
    return {
      title: 'Not taught yet',
      body: 'Practice only pulls questions from lessons you’ve already finished, and none of the questions we have are from those yet. Finish a lesson and they’ll turn up here.',
      findLesson: true,
    };
  }
  return {
    title: 'Nothing to practice yet',
    body: 'There aren’t enough eligible questions for this focus yet. Learn a bit more, then come back.',
    findLesson: false,
  };
}

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
  // First-attempt results, kept so a deferred second go can score and disclose
  // locally (the second go is learning-only — no extra server scoring). These
  // hold the key, and are never handed to a component: everything rendered goes
  // through `feedbackFor`, which nulls the key out on a first miss.
  const [resultsByQ, setResultsByQ] = useState<Record<string, PracticeAttemptResult>>({});

  // Seed the working sequence from the loaded queue (once).
  useEffect(() => {
    const loaded = queue.data?.items ?? [];
    if (loaded.length > 0 && sequence.length === 0) {
      setSequence(loaded.map((item) => ({ item, kind: 'first' as const })));
    }
  }, [queue.data, sequence.length]);

  const slot: Slot | undefined = sequence[index];

  /**
   * Return to the plan (or the Practice hub). `complete` marks the plan
   * activity done.
   *
   * Declared ABOVE the early returns below, not beside the other handlers.
   * Every degraded branch of this screen offers a way out, and a `const` read
   * from a branch that returns before the declaration is evaluated throws on
   * click rather than navigating — so the errored and empty states each had a
   * button that could only fail. See `PracticeSession.test.ts`.
   */
  const finish = (complete: boolean) => {
    if (returnTo) navigate(returnTo, complete ? { state: { completedActivityId: activityId } } : {});
    else navigate('/app/practice');
  };

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

  /**
   * An empty queue has three quite different causes and used to give one answer
   * to all of them. Neither taught-set state is a shortage — one is material the
   * learner has not reached yet, the other is a learner who has not started —
   * and the useful next step for both is a lesson, so each says which it is and
   * offers one instead of dead-ending on a Back button. See `emptyStateFor`.
   */
  if (slot === undefined) {
    const empty = emptyStateFor(queue.data);
    return (
      <div className="mc-screen mc-practice">
        <Eyebrow>Practice</Eyebrow>
        <h1 className="mc-h1">{empty.title}</h1>
        <p className="mc-muted">{empty.body}</p>
        {empty.findLesson ? (
          <Button variant="primary" onClick={() => navigate('/app/curriculum')}>
            Find a lesson
          </Button>
        ) : null}
        <Button variant={empty.findLesson ? 'secondary' : 'primary'} onClick={() => finish(true)}>
          {returnTo ? 'Back to plan' : 'Back to Practice'}
        </Button>
      </div>
    );
  }

  const item = slot.item;
  const q = item.question;
  const isLastStep = index + 1 >= sequence.length;

  /**
   * What the authority said about the SHAPE of this queue, as opposed to its
   * contents. Both were reported and read by nothing, which left a short
   * session to announce itself by ending early. Counted off the delivered queue
   * rather than `sequence.length`, because a missed item is re-inserted for its
   * second go and would otherwise make the session look longer than it is.
   */
  const requested = queue.data?.requested ?? 0;
  const delivered = queue.data?.items.length ?? 0;
  const notices = queueNotices(queue.data);

  const advance = () => {
    if (index + 1 < sequence.length) setIndex(index + 1);
    else finish(true);
  };

  const checkAnswer = () => {
    if (choice === null) return;
    setFirstChoice(choice);
    submit.mutate(
      { questionId: q.id, specId: item.specId, chosenChoiceId: choice },
      {
        onSuccess: (r) => {
          setResult(r);
          setResultsByQ((m) => ({ ...m, [q.id]: r }));
          setSub(subAfterFirstAttempt(r.correct));
        },
      },
    );
  };

  /**
   * A missed first attempt still earns its spaced second go — and `feedback` is
   * reachable only from a missed first attempt, so the step itself is the test.
   */
  const resurfacing = slot.kind === 'first' && sub === 'feedback';

  /**
   * Leaving the answer-side card. On a missed first attempt this re-inserts the
   * item ~RETRY_GAP questions later for a second pass — the spaced resurface is
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
    // Learning-only: scored and disclosed locally from the first-attempt result,
    // so no second command is sent and no duplicate mistake row can be written.
    setSub(subAfterSecondAttempt());
  };

  /**
   * The one place a scored result becomes renderable. `sub` decides disclosure and
   * the pick is the option chosen on THIS attempt, so a first miss yields a card
   * with no key in it at all.
   */
  const feedback: Feedback | null =
    result === null || (sub !== 'feedback' && sub !== 'reveal')
      ? null
      : feedbackFor(result, choice ?? firstChoice, sub);

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
        {notices.length > 0 ? (
          <p className="mc-muted mc-fineprint">
            {notices.map((notice) => noticeText(notice, delivered, requested)).join(' ')}
          </p>
        ) : null}
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
        <FeedbackCard
          feedback={feedback}
          onContinue={onRevealContinue}
          last={isLastStep}
          resurfacing={resurfacing}
        />
      ) : sub === 'retry' ? (
        <Stack gap={3}>
          <Callout tone="info" title="Back for a second pass">
            You picked {firstChoice ?? '—'} earlier and saw why it misses. Take another run at it —
            the answer comes after this one.
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

/**
 * The answer-side card, for both disclosure levels. It takes a redacted
 * {@link Feedback} and never a `PracticeAttemptResult`, so on a first miss the key
 * is not present in this component to render, style, or label a choice with.
 */
function FeedbackCard({
  feedback,
  onContinue,
  last,
  resurfacing,
}: {
  feedback: Feedback;
  onContinue: () => void;
  last: boolean;
  resurfacing: boolean;
}) {
  return (
    <Card elevated>
      <Stack gap={3}>
        <div className="mc-inline">
          <span className={`mc-reveal__key ${feedback.correct ? 'mc-reveal__key--ok' : ''}`}>
            {feedback.correctChoiceId === null
              ? 'Not quite'
              : `${feedback.correct ? 'Correct' : 'Answer'}: ${feedback.correctChoiceId}`}
          </span>
        </div>
        {feedback.rationale !== null ? <p>{feedback.rationale}</p> : null}
        {feedback.wrongChoiceId !== null && feedback.wrongChoiceRationale !== null ? (
          <Callout tone="info" title={`Why ${feedback.wrongChoiceId} misses`}>
            {feedback.wrongChoiceRationale}
          </Callout>
        ) : null}
        {resurfacing ? (
          <p className="mc-muted mc-fineprint">
            {last
              ? 'One more pass at this one before you finish — we’re holding the answer until then.'
              : 'This one comes back in a few questions — a short gap helps it stick. We’re holding the answer until then.'}
          </p>
        ) : null}
        <Button variant="primary" size="lg" onClick={onContinue}>
          {resurfacing && last ? 'Try it again' : last ? 'Finish' : 'Next question'}
        </Button>
      </Stack>
    </Card>
  );
}
