import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button, Callout, Card, Eyebrow, Stack } from '@mcat/ui-web';
import type { PracticeAttemptResult, PracticeQueueItem, RepairItemView } from '@mcat/contracts';
import { useRepairFresh, useRepairQueue, useSubmitPracticeAttempt } from '../../app/practice-queries';
import { feedbackFor, subAfterAttempt, type Feedback, type Sub } from '../practice/session-flow';
import {
  afterFreshAttempt,
  dwellRemainingSeconds,
  dwellSecondsFor,
  freshItemAt,
  isLastMistake,
} from './repair-flow';

/**
 * The guided Review-Mistakes REPAIR runner (docs/mistakes-repair-plan.md).
 *
 * Launched from Today's Path with a `count` of prioritized, servable mistakes. It
 * walks them ONE AT A TIME: the learner REVIEWS each mistake (the same detail
 * visuals the Mistakes dashboard shows — the trap, the pick vs the key, or the CARS
 * passage), then takes a MANDATORY, BOUNDED "try a fresh one" (a real transfer
 * check on the same area, never a re-serve of the logged item):
 *
 *   review → fresh #1 → correct? next : fresh #2 → correct? next : next
 *
 * A correct fresh attempt on the same KC / CARS sub-skill flips the mistake's
 * COMPUTED `resolved` on the next read (via the ordinary practice path — this screen
 * writes no mastery). A miss on both tries advances and leaves it open. When the
 * fresh queue comes back empty at runtime, the review is counted complete and the
 * runner advances rather than dead-ending. After the last mistake it returns to the
 * plan and marks the activity complete.
 */

type ChoiceId = 'A' | 'B' | 'C' | 'D';

interface RunnerState {
  /** How many mistakes the engine sized this slot to. */
  count?: number;
  /** When launched from Today's Path: where to return, and which activity to complete. */
  returnTo?: string;
  activityId?: string;
}

/** The eyebrow label per bucket, so a review reads as its Mistakes-tab group. */
const BUCKET_EYEBROW: Record<RepairItemView['bucket'], string> = {
  tofix: 'To fix',
  patterns: 'Pattern',
  cars: 'CARS reasoning',
  wins: 'Shaky win',
};

/** Default when a caller forgets the count (should not happen from the plan launch). */
const DEFAULT_COUNT = 5;

export function MistakesRepair() {
  const navigate = useNavigate();
  const location = useLocation();
  const { count = DEFAULT_COUNT, returnTo, activityId } = (location.state as RunnerState | null) ?? {};

  const queue = useRepairQueue(count);
  const submit = useSubmitPracticeAttempt();

  const [sequence, setSequence] = useState<RepairItemView[]>([]);
  const [index, setIndex] = useState(0);
  // 'review' shows the mistake; 'fresh' serves the mandatory transfer question.
  const [phase, setPhase] = useState<'review' | 'fresh'>('review');
  // Which fresh attempt (0-based) — also the index into the served fresh queue.
  const [tryCount, setTryCount] = useState(0);
  const [choice, setChoice] = useState<ChoiceId | null>(null);
  const [sub, setSub] = useState<Sub>('answering');
  const [answerChanges, setAnswerChanges] = useState(0);
  const startedAtRef = useRef<number>(Date.now());
  const [result, setResult] = useState<PracticeAttemptResult | null>(null);
  // Mandatory READING dwell on each mistake's review: when it started, which mistake
  // it belongs to (so it starts once, on the initial review, and never on a retry),
  // and a ticking clock that drives the on-screen countdown.
  const reviewStartRef = useRef<number>(0);
  const dwellIndexRef = useRef<number | null>(null);
  const [dwellNowMs, setDwellNowMs] = useState<number>(0);

  // Seed the working sequence from the loaded queue once; it is fixed for the run.
  useEffect(() => {
    const loaded = queue.data?.items ?? [];
    if (loaded.length > 0 && sequence.length === 0) setSequence(loaded);
  }, [queue.data, sequence.length]);

  const item: RepairItemView | undefined = sequence[index];

  // Fetch the mandatory fresh questions for THIS mistake (keyed by index so a repeat
  // focus still pulls its own set). Enabled only in the fresh phase.
  const fresh = useRepairFresh(index, item?.freshFocus ?? undefined, phase === 'fresh');
  const freshItems = fresh.data?.items ?? [];
  const freshItem: PracticeQueueItem | undefined = freshItemAt(freshItems, tryCount);

  /** Return to the plan (or the Mistakes tab). `complete` marks the plan activity done. */
  const finish = (complete: boolean): void => {
    if (returnTo) navigate(returnTo, complete ? { state: { completedActivityId: activityId } } : {});
    else navigate('/app/mistakes');
  };

  /** Move to the next mistake's review, or finish after the last one. */
  const advance = (): void => {
    if (isLastMistake(index, sequence.length)) {
      finish(true);
      return;
    }
    setIndex(index + 1);
    setPhase('review');
    setTryCount(0);
  };

  // Reset the per-question working state whenever the active step changes (a new
  // mistake, entering the fresh phase, or the second try).
  useEffect(() => {
    setChoice(null);
    setAnswerChanges(0);
    startedAtRef.current = Date.now();
    setResult(null);
    setSub('answering');
  }, [index, phase, tryCount]);

  // The review dwell clock. It STARTS once per mistake — the first time that
  // mistake's review is shown (guarded by `dwellIndexRef`, so entering/leaving the
  // fresh phase or a second try never restarts it), and it RESETS when a new
  // mistake's review begins. It ticks only while the review is on screen and the
  // dwell is still running, then stops. The gate itself is the pure
  // `dwellRemainingSeconds` below; this effect only supplies a live `now`.
  useEffect(() => {
    if (phase !== 'review' || item === undefined) return;
    if (dwellIndexRef.current !== index) {
      dwellIndexRef.current = index;
      reviewStartRef.current = Date.now();
      setDwellNowMs(Date.now());
    }
    const dwellMs = dwellSecondsFor(item.bucket) * 1000;
    if (Date.now() - reviewStartRef.current >= dwellMs) return;
    const id = setInterval(() => {
      setDwellNowMs(Date.now());
      if (Date.now() - reviewStartRef.current >= dwellMs) clearInterval(id);
    }, 250);
    return () => clearInterval(id);
  }, [phase, index, item?.bucket]);

  if (queue.isLoading) {
    return <div className="mc-center mc-muted">Building your repair set…</div>;
  }

  if (queue.isError) {
    return (
      <div className="mc-screen mc-practice">
        <Callout tone="warning" title="Repair is unavailable">
          We couldn’t build your repair set right now. Please try again in a moment.
        </Callout>
        <Button variant="secondary" onClick={() => finish(false)}>
          {returnTo ? 'Back to plan' : 'Back'}
        </Button>
      </div>
    );
  }

  // No servable mistakes to repair (e.g. everything resolved between plan and launch):
  // not a dead end — mark the activity done and return.
  if (item === undefined) {
    return (
      <div className="mc-screen mc-practice">
        <Eyebrow>Review Mistakes</Eyebrow>
        <h1 className="mc-h1">You’re all caught up</h1>
        <p className="mc-muted">
          Nothing to repair right now — every miss lands in Mistakes, worst-first, so you can fix it
          fast.
        </p>
        <Button variant="primary" onClick={() => finish(true)}>
          {returnTo ? 'Back to plan' : 'Back to Mistakes'}
        </Button>
      </div>
    );
  }

  const progress = (
    <div className="mc-practice__progress">
      <Eyebrow>
        {BUCKET_EYEBROW[item.bucket]} · Mistake {index + 1} of {sequence.length}
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
  );

  // ---- REVIEW phase: re-show the mistake, then launch the mandatory fresh one. ----
  if (phase === 'review') {
    // The mandatory reading dwell: the fresh-one CTA stays gated until the learner
    // has spent the content-aware dwell on this review. Derived purely from the
    // elapsed time (a live `dwellNowMs` tick), so the gate itself has no side effects.
    const dwellRemaining = dwellRemainingSeconds(item.bucket, dwellNowMs - reviewStartRef.current);
    const dwellLocked = dwellRemaining > 0;
    return (
      <div className="mc-screen mc-study mc-practice">
        {progress}
        <Card elevated className="mc-mistakes__detailcard">
          <RepairReview item={item} />
          <div className="mc-mdetail__actions">
            <Button
              variant="primary"
              size="lg"
              // Focusable + announced while gated (not natively `disabled`), so the
              // countdown and the reason reach assistive tech; the click is a no-op
              // until the dwell elapses.
              aria-disabled={dwellLocked}
              title={dwellLocked ? 'Read the explanation first' : undefined}
              onClick={() => {
                if (!dwellLocked) setPhase('fresh');
              }}
            >
              {dwellLocked ? `Read this — ${dwellRemaining}s` : 'Start the fresh one'}
            </Button>
            {dwellLocked ? (
              <p className="mc-fineprint mc-muted" role="status" aria-live="polite">
                Take a moment to read what went wrong — the fresh question unlocks in {dwellRemaining}
                s.
              </p>
            ) : null}
          </div>
        </Card>
      </div>
    );
  }

  // ---- FRESH phase: serve + grade one transfer question (2-try rule). ----
  if (fresh.isLoading) {
    return (
      <div className="mc-screen mc-practice">
        {progress}
        <div className="mc-center mc-muted" role="status">
          Finding a fresh question…
        </div>
      </div>
    );
  }

  // Empty-queue guard: the focus had no (or no second) fresh item. Don't dead-end —
  // count the review complete and move on.
  if (freshItem === undefined) {
    return (
      <div className="mc-screen mc-practice">
        {progress}
        <Card elevated>
          <Stack gap={3}>
            <p className="mc-muted">
              No fresh question is available for this one right now — we’ll count it reviewed and
              come back to it another day.
            </p>
            <Button variant="primary" size="lg" onClick={advance}>
              {isLastMistake(index, sequence.length) ? 'Finish' : 'Next mistake'}
            </Button>
          </Stack>
        </Card>
      </div>
    );
  }

  const q = freshItem.question;

  const selectAnswer = (c: ChoiceId): void => {
    if (choice !== null && choice !== c) setAnswerChanges((n) => n + 1);
    setChoice(c);
  };

  const checkAnswer = (): void => {
    if (choice === null) return;
    submit.mutate(
      {
        questionId: q.id,
        specId: freshItem.specId,
        chosenChoiceId: choice,
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

  const onFeedbackContinue = (correct: boolean): void => {
    const next = afterFreshAttempt(tryCount, correct);
    if (next.kind === 'advance') advance();
    else setTryCount(next.tryCount);
  };

  const feedback: Feedback | null =
    result === null || sub !== 'reveal' ? null : feedbackFor(result, choice);
  const secondTry = tryCount > 0;

  return (
    <div className="mc-screen mc-study mc-practice">
      {progress}
      <p className="mc-muted mc-fineprint">
        {secondTry ? 'One more fresh question on this idea.' : 'A fresh question on the same idea.'}
      </p>

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
        <RepairFeedbackCard
          feedback={feedback}
          last={isLastMistake(index, sequence.length)}
          canRetry={!feedback.correct && !secondTry}
          onContinue={() => onFeedbackContinue(feedback.correct)}
        />
      ) : (
        <Stack gap={3}>
          <ChoiceList q={q} name={`repair-${index}-${tryCount}`} choice={choice} onSelect={selectAnswer} />
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

/**
 * The per-bucket REVIEW card — the same content the Mistakes dashboard shows for
 * this row, re-expressed here so the learner sees what tripped them up before the
 * fresh one. Answer material is authorized because they already answered these.
 */
function RepairReview({ item }: { item: RepairItemView }) {
  if (item.bucket === 'patterns') {
    return (
      <div className="mc-mdetail">
        <Eyebrow>Pattern</Eyebrow>
        <p className="mc-mdetail__stem">{item.label ?? 'A recurring weak spot'}</p>
        {item.missedItems !== null && item.attemptedItems !== null ? (
          <p className="mc-muted mc-fineprint">
            {item.missedItems} of {item.attemptedItems} question
            {item.attemptedItems === 1 ? '' : 's'} missed here
            {item.assertable
              ? ' — enough to call this a weak spot.'
              : ' — too few so far to call it a pattern.'}
          </p>
        ) : null}
        {item.leaningMisconception !== null ? (
          <p className="mc-fineprint">
            <span className="mc-muted">Most often: </span>
            {item.leaningMisconception}
          </p>
        ) : null}
      </div>
    );
  }

  if (item.bucket === 'cars') {
    return (
      <div className="mc-mdetail">
        <Eyebrow>CARS reasoning</Eyebrow>
        <p className="mc-mdetail__stem">{item.label ?? 'A CARS reasoning pattern'}</p>
        {item.holdRatePct !== null ? (
          <p className="mc-muted mc-fineprint">
            A recent CARS Duel held at {item.holdRatePct}% here — below the ~75% mark, so this skill
            is worth a focused rep.
          </p>
        ) : null}
        {item.stem !== null ? (
          <Callout tone="info" title="Practice passage">
            {item.stem}
          </Callout>
        ) : null}
      </div>
    );
  }

  if (item.bucket === 'wins') {
    return (
      <div className="mc-mdetail">
        <Eyebrow>Shaky win</Eyebrow>
        {item.stem !== null ? <p className="mc-mdetail__stem">{item.stem}</p> : null}
        <p className="mc-fineprint">
          <span className="mc-muted">You answered </span>
          {item.correctChoiceId}
          {item.correctChoiceText ? ` · ${item.correctChoiceText}` : ''}
          <span className="mc-muted"> — correct, but slowly or in a still-weak area.</span>
        </p>
      </div>
    );
  }

  // tofix — the miss itself.
  const confidentlyWrong = item.calibration === 'confidently_wrong';
  return (
    <div className="mc-mdetail">
      <Eyebrow>{confidentlyWrong ? 'Confidently wrong' : 'To fix'}</Eyebrow>
      {item.stem !== null ? <p className="mc-mdetail__stem">{item.stem}</p> : null}
      <div className="mc-mdetail__answers">
        <p className="mc-answerline mc-answerline--wrong">
          <span>
            <span className="mc-answerline__lead">You picked </span>
            {item.chosenChoiceId ?? '—'}
            {item.chosenChoiceText ? ` · ${item.chosenChoiceText}` : ''}
          </span>
        </p>
        <p className="mc-answerline mc-answerline--right">
          <span>
            <span className="mc-answerline__lead">Correct </span>
            {item.correctChoiceId}
            {item.correctChoiceText ? ` · ${item.correctChoiceText}` : ''}
          </span>
        </p>
      </div>
      {item.chosenMisconception !== null ? (
        <p className="mc-mdetail__trap">
          <span className="mc-mdetail__trapbody">
            <span className="mc-muted">The trap: </span>
            <span className="mc-mdetail__traptext">{item.chosenMisconception}</span>
          </span>
        </p>
      ) : null}
      {item.choiceRationale !== null ? (
        <Callout tone="info" title={`Why ${item.chosenChoiceId ?? 'that'} misses`}>
          {item.choiceRationale}
        </Callout>
      ) : null}
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
 * The answer-side card for a graded fresh attempt. Discloses in full on every
 * attempt (right or wrong): the key with its rationale, and the refutation of the
 * option the learner picked. On a first miss it says a second fresh question is
 * coming; on a spent second try or a correct answer it moves on.
 */
function RepairFeedbackCard({
  feedback,
  last,
  canRetry,
  onContinue,
}: {
  feedback: Feedback;
  last: boolean;
  canRetry: boolean;
  onContinue: () => void;
}) {
  const label = canRetry ? 'Try one more' : last ? 'Finish' : 'Next mistake';
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
        {canRetry ? (
          <p className="mc-muted mc-fineprint">
            Not quite — here’s one more fresh question on the same idea.
          </p>
        ) : null}
        <Button variant="primary" size="lg" onClick={onContinue}>
          {label}
        </Button>
      </Stack>
    </Card>
  );
}
