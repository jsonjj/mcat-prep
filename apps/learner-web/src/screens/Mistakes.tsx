import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button, Callout, Card, Eyebrow, Stack } from '@mcat/ui-web';
import type { ErrorEntryView, MistakePatternView } from '@mcat/contracts';
import { useErrorLog, useMistakePatterns } from '../app/queries';

/**
 * Mistakes — the two surfaces of docs/design/error-handling-design.md §6:
 * A. Patterns: recurring misses grouped at KC / cluster grain, with denominators.
 * B. History: the misses themselves, each showing what was picked, what was
 *    right, and the refutation the learner was shown at the time.
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

export function Mistakes() {
  const errors = useErrorLog();
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
  const rows = showResolved ? all : open;

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
          back in on a fresh question, not the same one.
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

      {(patterns.data ?? []).length > 0 ? (
        <section>
          <h2 className="mc-h3">What keeps coming up</h2>
          <Stack gap={3}>
            {patterns.data!.map((p) => (
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
      ) : (
        <Callout tone="success" title="Nothing open right now">
          When you miss a practice question it lands here with the answer you picked and why it
          missed. Recurring patterns appear once there’s evidence across several different
          questions.
        </Callout>
      )}
    </div>
  );
}

/**
 * A pattern row. The denominator is never optional: "3 of 7 questions" is a
 * claim a learner can check, "3 mistakes" is not. Below the assertion floor the
 * copy hedges instead of naming a weakness — Ellerton & Clements found the
 * careless share of errors on a single item ranged from 1% to 71%, so a
 * small-sample "pattern" is most likely an artifact of which items came up.
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
  return (
    <Card elevated>
      <Stack gap={3}>
        <div className="mc-task">
          <Eyebrow>{dateLabel(entry.occurredAt)}</Eyebrow>
          {entry.resolved ? <span className="mc-pill mc-pill--ok">Cleared</span> : null}
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
