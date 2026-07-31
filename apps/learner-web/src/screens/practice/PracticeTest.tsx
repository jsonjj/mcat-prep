import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button, Callout, Card, Eyebrow, Inline, Stack } from '@mcat/ui-web';
import {
  useMarkPracticeTestReviewed,
  usePracticeTestNext,
  usePracticeTestSummary,
  useSubmitPracticeTestBlock,
} from '../../app/queries';
import {
  loadBlockDrafts,
  saveBlockDrafts,
  type PracticeTestItemView,
  type PracticeTestResultView,
  type Section,
} from '../../app/practice-test-client';
import { useBlockNavigation } from '../../app/use-block-navigation';
import { QuestionPalette } from '../../components/QuestionPalette';

const NO_QUESTIONS: PracticeTestItemView[] = [];

/** Section short labels + colour class, matching the Practice dashboard chart. */
const SECTION_META: Readonly<Record<Section, { label: string; cls: string }>> = {
  cp: { label: 'C/P', cls: 'cp' },
  cars: { label: 'CARS', cls: 'cars' },
  bb: { label: 'B/B', cls: 'bb' },
  ps: { label: 'P/S', cls: 'ps' },
};

interface LaunchState {
  returnTo?: string;
  activityId?: string;
}

/**
 * The periodic practice-test RUNNER. It reuses the diagnostic block-runner's
 * shape exactly — a whole section at a time, freely navigable, drafts held in
 * sessionStorage, one commit per block through one-use tokens — but the form is a
 * fixed blueprint (no adaptive routing) and it is scored at the end by the server
 * against the answer key. On completion it shows a result summary and gates the
 * next test on the learner reviewing this one.
 */
export function PracticeTest() {
  const navigate = useNavigate();
  const location = useLocation();
  const launch = (location.state as LaunchState | null) ?? {};
  const next = usePracticeTestNext();
  const submit = useSubmitPracticeTestBlock();

  const questions = next.data?.questions ?? NO_QUESTIONS;
  const blockId = next.data?.blockId ?? null;
  const blockQuestions = useMemo(
    () => questions.map((question) => ({ questionId: question.id })),
    [questions],
  );
  const nav = useBlockNavigation(blockQuestions);
  const { answer: draftAnswer, answers, answeredCount } = nav;

  const [visited, setVisited] = useState<ReadonlySet<string>>(() => new Set<string>());
  const [confirming, setConfirming] = useState(false);
  const headingRef = useRef<HTMLHeadingElement | null>(null);

  // Time on each question, accumulated across every visit (the block is navigable).
  const elapsedRef = useRef<Record<string, number>>({});
  const dwellRef = useRef<{ questionId: string | null; since: number }>({
    questionId: null,
    since: Date.now(),
  });

  const question = questions[nav.currentIndex] ?? null;
  const currentId = question?.id ?? null;

  const flushDwell = useCallback(() => {
    const now = Date.now();
    const open = dwellRef.current;
    if (open.questionId !== null) {
      elapsedRef.current[open.questionId] =
        (elapsedRef.current[open.questionId] ?? 0) + (now - open.since);
    }
    dwellRef.current = { questionId: null, since: now };
  }, []);

  // A new block is a new sitting as far as timing + confirmation go.
  useEffect(() => {
    elapsedRef.current = {};
    dwellRef.current = { questionId: null, since: Date.now() };
    setConfirming(false);
  }, [blockId]);

  // Drafts live in sessionStorage (the server only learns an answer at commit).
  useEffect(() => {
    if (blockId === null) return;
    const drafts = loadBlockDrafts(
      blockId,
      blockQuestions.map((q) => q.questionId),
    );
    for (const [questionId, choiceId] of Object.entries(drafts)) {
      if (choiceId !== null) draftAnswer(questionId, choiceId);
    }
  }, [blockId, blockQuestions, draftAnswer]);

  useEffect(() => {
    if (blockId === null || answeredCount === 0) return;
    saveBlockDrafts(blockId, answers);
  }, [blockId, answers, answeredCount]);

  useEffect(() => {
    if (currentId === null) return;
    dwellRef.current = { questionId: currentId, since: Date.now() };
    setVisited((seen) => (seen.has(currentId) ? seen : new Set(seen).add(currentId)));
    headingRef.current?.focus();
  }, [currentId]);

  const goTo = (index: number) => {
    flushDwell();
    nav.goTo(index);
  };

  if (next.isLoading || !next.data) {
    return <div className="mc-center mc-muted">Preparing your practice test…</div>;
  }

  if (next.isError) {
    return (
      <div className="mc-screen mc-practice">
        <Card elevated>
          <Stack gap={4}>
            <h1 className="mc-h2">We hit a snag starting your practice test.</h1>
            <Inline>
              <Button variant="primary" size="lg" onClick={() => next.refetch()}>
                Try again
              </Button>
              <Button variant="text" onClick={() => navigate('/app/practice')}>
                Back to Practice
              </Button>
            </Inline>
          </Stack>
        </Card>
      </div>
    );
  }

  // The serve boundary refused to start a sitting (no test due on the §6 cadence).
  if (next.data.notDue) {
    return <NoTestDue navigate={navigate} />;
  }

  if (next.data.done && next.data.result) {
    return (
      <PracticeTestComplete
        result={next.data.result}
        returnTo={launch.returnTo ?? '/app/practice'}
        activityId={launch.activityId ?? null}
      />
    );
  }

  if (!question) {
    return <div className="mc-center mc-muted">Scoring your practice test…</div>;
  }

  const progressPct = Math.round(next.data.progress * 100);
  const unanswered = questions.length - answeredCount;
  const seenWholeBlock = questions.every((q) => visited.has(q.id) || answers[q.id] !== undefined);
  const isFlagged = nav.flagged.has(question.id);

  const onCommit = () => {
    flushDwell();
    submit.mutate({
      questionIds: blockQuestions.map((q) => q.questionId),
      answers,
      elapsedMs: elapsedRef.current,
    });
  };

  return (
    <div className="mc-screen mc-practice">
      <Card elevated>
        <Stack gap={4}>
          {/* Per-section framing so the count matches the section navigator below
              (which shows only this section's items), not the whole fixed form. */}
          <Eyebrow>
            Practice test · Question {nav.currentIndex + 1} of {questions.length} (Section{' '}
            {next.data.blockNumber} of {next.data.blockCount})
          </Eyebrow>

          <div
            className="mc-progress"
            role="progressbar"
            aria-valuenow={progressPct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Practice test progress"
          >
            <span style={{ width: `${Math.max(6, progressPct)}%` }} />
          </div>

          <p className="mc-diag-section" aria-hidden="true">
            {question.sectionTitle}
          </p>

          {question.passage ? (
            <div className="mc-diag-passage" aria-label="Passage">
              {question.passage.split('\n').map((para, i) => (
                <p key={i}>{para}</p>
              ))}
            </div>
          ) : null}

          <h1 className="mc-h2" tabIndex={-1} ref={headingRef}>
            {question.stem}
          </h1>

          <fieldset className="mc-choices">
            <legend className="mc-visually-hidden">Answer choices</legend>
            {question.choices.map((c) => (
              <label
                key={c.id}
                className={`mc-choice ${answers[question.id] === c.id ? 'mc-choice--selected' : ''}`}
              >
                <input
                  type="radio"
                  name={`answer-${question.id}`}
                  value={c.id}
                  checked={answers[question.id] === c.id}
                  onChange={() => nav.answer(question.id, c.id)}
                />
                <span className="mc-choice__key">{c.id}</span>
                <span className="mc-choice__text">{c.text}</span>
              </label>
            ))}
          </fieldset>

          <Inline style={{ justifyContent: 'space-between' }}>
            <Inline>
              <Button
                variant="secondary"
                disabled={nav.currentIndex === 0}
                onClick={() => {
                  flushDwell();
                  nav.previous();
                }}
              >
                Previous
              </Button>
              <Button
                variant="secondary"
                aria-pressed={isFlagged}
                onClick={() => nav.toggleFlag(question.id)}
              >
                {isFlagged ? 'Unflag this question' : 'Flag for review'}
              </Button>
            </Inline>
            <Button
              variant="secondary"
              disabled={nav.currentIndex >= questions.length - 1}
              onClick={() => {
                flushDwell();
                nav.next();
              }}
            >
              Next
            </Button>
          </Inline>

          <QuestionPalette
            questions={blockQuestions}
            currentIndex={nav.currentIndex}
            answers={answers}
            flagged={nav.flagged}
            onSelect={goTo}
            // Per-section numbering (1..N within this section), matching the header.
            startNumber={1}
            label="Jump to a question in this section"
          />

          {confirming ? (
            <Callout
              tone={unanswered > 0 ? 'warning' : 'info'}
              title={unanswered > 0 ? `Submit with ${unanswered} left blank?` : 'Submit this section?'}
            >
              <Stack gap={3}>
                <p>
                  {unanswered > 0
                    ? 'A blank is scored as incorrect. You cannot come back to this section afterwards.'
                    : 'You cannot come back to this section afterwards.'}
                </p>
                {submit.isError ? (
                  <p>
                    That submission did not go through. Your answers are still here — try again, or{' '}
                    <button type="button" className="mc-textbtn" onClick={() => next.refetch()}>
                      reload this section
                    </button>
                    .
                  </p>
                ) : null}
                <Inline>
                  <Button variant="primary" disabled={submit.isPending} onClick={onCommit}>
                    {submit.isPending ? 'Submitting…' : 'Submit section'}
                  </Button>
                  <Button
                    variant="text"
                    disabled={submit.isPending}
                    onClick={() => setConfirming(false)}
                  >
                    Keep working
                  </Button>
                </Inline>
              </Stack>
            </Callout>
          ) : (
            <Button
              variant="primary"
              size="lg"
              fullWidth
              disabled={!seenWholeBlock || submit.isPending}
              onClick={() => setConfirming(true)}
            >
              Review and submit section
            </Button>
          )}
        </Stack>
      </Card>
    </div>
  );
}

function NoTestDue({ navigate }: { navigate: ReturnType<typeof useNavigate> }) {
  return (
    <div className="mc-screen mc-practice">
      <Card elevated>
        <Stack gap={4}>
          <Eyebrow>Practice test</Eyebrow>
          <h1 className="mc-h2">No practice test is due right now.</h1>
          <p className="mc-muted">
            Practice tests are spaced out on your plan — a little less often early on, more often as
            your exam nears. Keep studying and we&rsquo;ll schedule your next checkpoint automatically.
          </p>
          <Inline>
            <Button variant="primary" size="lg" onClick={() => navigate('/app/practice')}>
              Back to Practice
            </Button>
          </Inline>
        </Stack>
      </Card>
    </div>
  );
}

const round = (v: number): number => Math.round(v);

function PracticeTestComplete({
  result,
  returnTo,
  activityId,
}: {
  result: PracticeTestResultView;
  returnTo: string;
  activityId: string | null;
}) {
  const navigate = useNavigate();
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const markReviewed = useMarkPracticeTestReviewed();
  // The estimated RANGE + readiness are re-derived server-side from this sitting;
  // the summary query refetched when the last block committed, so read it here.
  const summary = usePracticeTestSummary();

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  const overallPct = result.itemsScored > 0 ? (result.correct / result.itemsScored) * 100 : 0;
  const missed = result.missedQuestionIds.length;
  const est = summary.data?.estimatedScore ?? null;

  const finish = () => {
    markReviewed.mutate();
    navigate(returnTo, { state: activityId ? { completedActivityId: activityId } : null });
  };

  return (
    <div className="mc-screen mc-practice">
      <Card elevated>
        <Stack gap={5}>
          <Eyebrow>Practice test complete</Eyebrow>
          <h1 className="mc-h2" tabIndex={-1} ref={headingRef}>
            You scored {result.correct} / {result.itemsScored} ({round(overallPct)}%)
          </h1>

          {est ? (
            <Stack gap={1}>
              <p className="mc-h3">
                Estimated score: {est.low}&ndash;{est.high}
              </p>
              <p className="mc-fineprint mc-muted">estimate, not a single score</p>
            </Stack>
          ) : null}

          <Stack gap={3}>
            <h2 className="mc-h3">By section</h2>
            <div className="mc-testresult__sections">
              {result.perSection.map((s) => {
                const meta = SECTION_META[s.section as Section] ?? { label: s.section, cls: 'cp' };
                const pct = round(s.accuracy * 100);
                return (
                  <div key={s.section} className="mc-testresult__row">
                    <span className="mc-testresult__label">{meta.label}</span>
                    <span
                      className="mc-testresult__bar"
                      role="img"
                      aria-label={`${meta.label}: ${pct} percent correct`}
                    >
                      <span
                        className={`mc-testresult__fill mc-testresult__fill--${meta.cls}`}
                        style={{ width: `${Math.max(2, pct)}%` }}
                      />
                    </span>
                    <span className="mc-testresult__pct">{pct}%</span>
                  </div>
                );
              })}
            </div>
          </Stack>

          <Callout tone={missed > 0 ? 'warning' : 'info'} title={missed > 0 ? `${missed} to review` : 'Nothing missed'}>
            {missed > 0
              ? 'Your missed questions are queued in Mistakes. Review them to lock in the gains — your next practice test unlocks once you do.'
              : 'A clean sheet — no misses to repair. Your next practice test will be scheduled on your plan.'}
          </Callout>

          <Stack gap={2}>
            {missed > 0 ? (
              <Button variant="secondary" size="lg" fullWidth onClick={() => navigate('/app/mistakes')}>
                Review my mistakes
              </Button>
            ) : null}
            <Button
              variant="primary"
              size="lg"
              fullWidth
              disabled={markReviewed.isPending}
              onClick={finish}
            >
              {markReviewed.isPending ? 'Saving…' : 'Mark reviewed & finish'}
            </Button>
          </Stack>
        </Stack>
      </Card>
    </div>
  );
}
