import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button, Callout, Card, Eyebrow, Stack } from '@mcat/ui-web';
import type { PracticeAttemptResult, PracticeQueueItem } from '@mcat/contracts';
import { ExplainAnotherWay } from '../../components/ExplainAnotherWay';
import { usePracticeQueue, useSubmitPracticeAttempt } from '../../app/practice-queries';
import {
  feedbackFor,
  queueNotices,
  subAfterAttempt,
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
  // Diagnose-before-reveal capture (WS0): how long the learner deliberated before
  // the first attempt, and how many times they changed the selection first. A ref
  // for the start instant (so it triggers no re-render) and a counter for the
  // changes, both reset per step below. Sent only on the first attempt — the step
  // that lands on `feedback`/`reveal` — since the local retry is not re-scored.
  const startedAtRef = useRef<number>(Date.now());
  const [answerChanges, setAnswerChanges] = useState(0);
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

  /**
   * Return to the plan (or the Practice hub). `complete` marks the plan activity
   * done.
   *
   * Declared ABOVE the early returns below, not beside the other handlers. Every
   * degraded branch of this screen offers a way out, and a `const` read from a
   * branch that returns before the declaration is evaluated throws on click
   * rather than navigating — so the errored and empty states each had a button
   * that could only fail. See `PracticeSession.test.ts`.
   */
  const finish = (complete: boolean) => {
    if (returnTo)
      navigate(returnTo, complete ? { state: { completedActivityId: activityId } } : {});
    else navigate('/app/practice');
  };

  // Reset per-step working state whenever the active step changes.
  useEffect(() => {
    if (item === undefined) return;
    setChoice(null);
    setAnswerChanges(0);
    startedAtRef.current = Date.now();
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

  /**
   * An empty queue has three quite different causes and used to give one answer
   * to all of them. Neither taught-set state is a shortage — one is material the
   * learner has not reached yet, the other is a learner who has not started —
   * and the useful next step for both is a lesson, so each says which it is and
   * offers one instead of dead-ending on a Back button. See `emptyStateFor`.
   */
  if (item === undefined) {
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

  const q = item.question;
  const isLastStep = index + 1 >= sequence.length;

  /**
   * What the authority said about the SHAPE of this queue, as opposed to its
   * contents. Both were reported and read by nothing, which left a short session
   * to announce itself by ending early. Counted off the delivered queue rather
   * than `sequence.length` — they are equal now that a miss inserts no step, but
   * the delivered count is what `requested` is a promise about.
   */
  const requested = queue.data?.requested ?? 0;
  const delivered = queue.data?.items.length ?? 0;
  const notices = queueNotices(queue.data);

  const advance = () => {
    if (index + 1 < sequence.length) setIndex(index + 1);
    else finish(true);
  };

  // Count a selection change only when it replaces an earlier pick — the first
  // choice on a fresh question is not a change.
  const selectAnswer = (c: ChoiceId) => {
    if (choice !== null && choice !== c) setAnswerChanges((n) => n + 1);
    setChoice(c);
  };

  const checkAnswer = () => {
    if (choice === null) return;
    submit.mutate(
      {
        questionId: q.id,
        specId: item.specId,
        chosenChoiceId: choice,
        // The diagnose-before-reveal signal for this first attempt (WS0).
        elapsedMs: Math.max(0, Date.now() - startedAtRef.current),
        answerChanges,
      },
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
        {notices.some((n) => n !== 'taught-gap') ? (
          <p className="mc-muted mc-fineprint">
            {notices
              .filter((n) => n !== 'taught-gap')
              .map((notice) => noticeText(notice, delivered, requested))
              .join(' ')}
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
        <>
          <FeedbackCard feedback={feedback} onContinue={advance} last={isLastStep} />
          {/* Post-reveal only: re-express the disclosed rationale, never a first miss. */}
          {feedback.rationale !== null ? (
            <ExplainAnotherWay
              questionId={q.id}
              source={{
                rationale: feedback.rationale,
                ...(feedback.wrongChoiceId !== null && feedback.wrongChoiceRationale !== null
                  ? {
                      choiceRationales: { [feedback.wrongChoiceId]: feedback.wrongChoiceRationale },
                    }
                  : {}),
              }}
              gate={{ skill: item.skill, section: q.section, dok: item.dok }}
            />
          ) : null}
        </>
      ) : (
        <Stack gap={3}>
          <ChoiceList q={q} name={`answer-${index}`} choice={choice} onSelect={selectAnswer} />
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
        <label key={c.id} className={`mc-choice ${choice === c.id ? 'mc-choice--selected' : ''}`}>
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
          <span
            className={`mc-reveal__key ${feedback.correct ? 'mc-reveal__key--ok' : 'mc-reveal__key--wrong'}`}
          >
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
