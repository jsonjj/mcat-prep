import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button, Callout, Card, Eyebrow, Stack } from '@mcat/ui-web';
import type { ErrorEntryView, MistakePatternView } from '@mcat/contracts';
import { useErrorLog, useMistakePatterns, useShakyWins } from '../app/queries';

/**
 * Mistakes — the two surfaces of docs/design/error-handling-design.md §6, now
 * ordered by calibration (WS1) and naming the specific trap (WS2/WS3):
 * A. Patterns: recurring misses grouped at KC / cluster grain, with denominators,
 *    and — once a pattern is real — the misconception most leaned toward.
 * B. History: the misses themselves, CONFIDENTLY-WRONG first (a fast, sure miss is
 *    the best thing to correct — hypercorrection), each naming what was picked,
 *    what was right, the refutation shown at the time, and the misconception behind
 *    the picked distractor.
 * Plus a "shaky wins" group: answers that were right but came slowly or in a
 * still-weak KC, worth another rep to lock in.
 *
 * Every row's primary action is "try again", never "read": it routes into the
 * adaptive practice queue with a KC/cluster focus, and that queue's own
 * exposure/repair seam picks a FRESH unseen item, so a re-attempt is real
 * evidence rather than a re-serve of the logged question.
 *
 * Deliberately absent: a self-reported cause headline (κ = 0.000–0.063 between
 * experts, §2.3), a running mistake total, a streak, and any cohort comparison
 * (§6.6 — `question_stats` carries no per-choice base rates to compare against).
 */

/** How many questions a "try again" session serves. */
const RETRY_SET_SIZE = 5;

const dateLabel = (iso: string): string =>
  new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

/** Confidently-wrong misses sort ahead of the rest; recent first within each band. */
const missOrder = (a: ErrorEntryView, b: ErrorEntryView): number => {
  const rank = (e: ErrorEntryView): number => (e.calibration === 'confidently_wrong' ? 0 : 1);
  return rank(a) - rank(b) || Date.parse(b.occurredAt) - Date.parse(a.occurredAt);
};

export function Mistakes() {
  const errors = useErrorLog();
  const shakyWins = useShakyWins();
  const patterns = useMistakePatterns();
  const location = useLocation();
  const navigate = useNavigate();
  const [showResolved, setShowResolved] = useState(false);
  // Today's Path routes its "Review Mistakes" slot here and expects a way back
  // that marks the activity complete.
  const navState = location.state as { returnTo?: string; activityId?: string } | null;
  const returnTo = navState?.returnTo;
  const activityId = navState?.activityId;

  const all = errors.data ?? [];
  const open = all.filter((e) => !e.resolved);
  const resolvedCount = all.length - open.length;
  const rows = [...(showResolved ? all : open)].sort(missOrder);
  const shaky = shakyWins.data ?? [];
  const patternRows = patterns.data ?? [];
  const nothingToShow = patternRows.length === 0 && rows.length === 0 && shaky.length === 0;

  /**
   * Hand the re-attempt to the ordinary practice queue. The focus token narrows it
   * to the missed area; the queue's exposure/repair seam is what guarantees the
   * item is fresh, so there is no second selector here. When Today's Path sent the
   * learner here, its return contract rides along, so finishing the re-attempt
   * completes the Review Mistakes activity.
   */
  const tryAgain = (focus: string | null): void => {
    navigate('/app/practice/session', {
      state: {
        x: RETRY_SET_SIZE,
        ...(focus === null ? {} : { focus }),
        ...(returnTo === undefined ? {} : { returnTo, activityId }),
      },
    });
  };

  return (
    <div className="mc-screen">
      <header className="mc-screen__head">
        <h1 className="mc-h1">Mistakes</h1>
        <p className="mc-muted">
          Every miss keeps the question, the answer you picked, and why it missed — and sends you
          back in on a fresh question, not the same one. The ones you were sure about come first.
        </p>
      </header>

      {returnTo ? (
        <Callout tone="info" title="From today’s path">
          <Stack gap={3}>
            <p className="mc-fineprint">
              Work through the misses below — each one hands you a fresh question in the same area.
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

      {patternRows.length > 0 ? (
        <section>
          <h2 className="mc-h3">What keeps coming up</h2>
          <Stack gap={3}>
            {patternRows.map((p) => (
              <PatternRow key={`${p.grain}:${p.key}`} pattern={p} onTryAgain={tryAgain} />
            ))}
          </Stack>
        </section>
      ) : null}

      {rows.length > 0 ? (
        <section>
          <div className="mc-task">
            <h2 className="mc-h3">{showResolved ? 'All misses' : 'Still open'}</h2>
            {resolvedCount > 0 ? (
              <Button variant="text" onClick={() => setShowResolved(!showResolved)}>
                {showResolved ? 'Hide cleared' : `Show ${resolvedCount} cleared`}
              </Button>
            ) : null}
          </div>
          <Stack gap={3}>
            {rows.map((e) => (
              <ErrorRow key={e.questionId} entry={e} onTryAgain={tryAgain} />
            ))}
          </Stack>
        </section>
      ) : null}

      {shaky.length > 0 ? (
        <section>
          <h2 className="mc-h3">Wins worth locking in</h2>
          <p className="mc-muted mc-fineprint">
            You got these right, but slowly or in an area that isn’t solid yet — a fresh rep makes
            the win stick.
          </p>
          <Stack gap={3}>
            {shaky.map((e) => (
              <ShakyWinRow key={e.questionId} entry={e} onTryAgain={tryAgain} />
            ))}
          </Stack>
        </section>
      ) : null}

      {nothingToShow ? (
        <Callout tone="success" title="Nothing open right now">
          When you miss a practice question it lands here with the answer you picked and why it
          missed. Recurring patterns appear once there’s evidence across several different
          questions.
        </Callout>
      ) : null}
    </div>
  );
}

/**
 * A pattern row. The denominator is never optional: "3 of 7 questions" is a
 * claim a learner can check, "3 mistakes" is not. Below the assertion floor the
 * copy hedges instead of naming a weakness — Ellerton & Clements found the
 * careless share of errors on a single item ranged from 1% to 71%, so a
 * small-sample "pattern" is most likely an artifact of which items came up. The
 * leaned-toward misconception is named only once the pattern is assertable, for
 * the same reason.
 */
function PatternRow({
  pattern,
  onTryAgain,
}: {
  pattern: MistakePatternView;
  onTryAgain: (focus: string | null) => void;
}) {
  return (
    <Card elevated>
      <div className="mc-task">
        <div>
          <Eyebrow>{pattern.grain === 'kc' ? 'Knowledge component' : 'Cluster'}</Eyebrow>
          <p className="mc-task__title">{pattern.label}</p>
          <p className="mc-muted mc-fineprint">
            {pattern.missedItems} of {pattern.attemptedItems} question
            {pattern.attemptedItems === 1 ? '' : 's'} missed here
            {pattern.assertable
              ? ' — enough to call this a weak spot.'
              : ' — too few so far to call it a pattern.'}
          </p>
          {pattern.leaningMisconception !== null ? (
            <p className="mc-fineprint">
              <span className="mc-muted">Most often: </span>
              {pattern.leaningMisconception}
            </p>
          ) : null}
        </div>
        <Button variant="primary" onClick={() => onTryAgain(pattern.focus)}>
          Practice this
        </Button>
      </div>
    </Card>
  );
}

function ErrorRow({
  entry,
  onTryAgain,
}: {
  entry: ErrorEntryView;
  onTryAgain: (focus: string | null) => void;
}) {
  const confidentlyWrong = entry.calibration === 'confidently_wrong';
  return (
    <Card elevated>
      <Stack gap={3}>
        <div className="mc-task">
          <Eyebrow>{dateLabel(entry.occurredAt)}</Eyebrow>
          <span>
            {confidentlyWrong ? (
              <span className="mc-pill mc-pill--warn">Confidently wrong</span>
            ) : null}
            {entry.resolved ? <span className="mc-pill mc-pill--ok">Cleared</span> : null}
          </span>
        </div>
        <p className="mc-task__title">{entry.stem}</p>
        <Stack gap={1}>
          <p className="mc-fineprint">
            <span className="mc-muted">You picked </span>
            {entry.chosenChoiceId ?? '—'}
            {entry.chosenChoiceText ? ` · ${entry.chosenChoiceText}` : ''}
          </p>
          <p className="mc-fineprint">
            <span className="mc-muted">Correct answer </span>
            {entry.correctChoiceId}
            {entry.correctChoiceText ? ` · ${entry.correctChoiceText}` : ''}
          </p>
        </Stack>
        {entry.chosenMisconception !== null ? (
          <p className="mc-fineprint">
            <span className="mc-muted">The trap: </span>
            {entry.chosenMisconception}
          </p>
        ) : null}
        {entry.choiceRationale !== null ? (
          <Callout tone="info" title={`Why ${entry.chosenChoiceId ?? 'that'} misses`}>
            {entry.choiceRationale}
          </Callout>
        ) : null}
        <Button variant="primary" onClick={() => onTryAgain(entry.focus)}>
          Try a fresh one
        </Button>
      </Stack>
    </Card>
  );
}

/**
 * A shaky win: a correct first attempt the calibration read flagged as slow or in
 * a still-weak KC. There is no refutation to show (the pick was the key) and no
 * misconception — the row's job is to route a fresh rep in the same area to
 * convert a shaky win into a solid one.
 */
function ShakyWinRow({
  entry,
  onTryAgain,
}: {
  entry: ErrorEntryView;
  onTryAgain: (focus: string | null) => void;
}) {
  return (
    <Card elevated>
      <Stack gap={3}>
        <div className="mc-task">
          <Eyebrow>{dateLabel(entry.occurredAt)}</Eyebrow>
          <span className="mc-pill">Shaky win</span>
        </div>
        <p className="mc-task__title">{entry.stem}</p>
        <p className="mc-fineprint">
          <span className="mc-muted">You answered </span>
          {entry.correctChoiceId}
          {entry.correctChoiceText ? ` · ${entry.correctChoiceText}` : ''}
          <span className="mc-muted"> — correct.</span>
        </p>
        <Button variant="primary" onClick={() => onTryAgain(entry.focus)}>
          Try a fresh one
        </Button>
      </Stack>
    </Card>
  );
}
