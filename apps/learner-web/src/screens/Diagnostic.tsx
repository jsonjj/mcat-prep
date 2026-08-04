import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Callout, Card, Eyebrow, Inline, Stack } from '@mcat/ui-web';
import {
  useApplyMasterySeed,
  useBootstrap,
  useDiagnosticNext,
  useSubmitDiagnosticBlock,
} from '../app/queries';
import {
  loadBlockDrafts,
  saveBlockDrafts,
  type DiagnosticItemView,
  type DiagnosticResultView,
} from '../app/diagnostic-client';
import { useBlockNavigation } from '../app/use-block-navigation';
import { BucketGapChart, type BucketGapRow } from '../components/BucketGapChart';
import { PriorityList, priorityFraming, priorityHeading } from '../components/PriorityList';
import { QuestionPalette } from '../components/QuestionPalette';
import { markDiagnosticCompleted } from '../app/diagnostic-status';
import { OnboardingSteps } from '../components/OnboardingSteps';

const CONFIDENCE_SENTENCE: Record<DiagnosticResultView['confidenceLabel'], string> = {
  High: 'We have a clear starting plan for you. We’ll keep sharpening it as you study.',
  Medium: 'We have a solid starting plan and a few areas we’ll confirm in your first week.',
  'Still building': 'We have an early direction — your first week of study will confirm the details.',
};

const NO_QUESTIONS: DiagnosticItemView[] = [];

export function Diagnostic() {
  const navigate = useNavigate();
  const bootstrap = useBootstrap();
  const learnerId = bootstrap.data?.authenticated === true ? bootstrap.data.learnerId : null;
  const next = useDiagnosticNext();
  const submit = useSubmitDiagnosticBlock();

  const questions = next.data?.questions ?? NO_QUESTIONS;
  const stageId = next.data?.stageId ?? null;
  const blockQuestions = useMemo(
    () => questions.map((question) => ({ questionId: question.id })),
    [questions],
  );
  const nav = useBlockNavigation(blockQuestions);
  const { answer: draftAnswer, answers, answeredCount } = nav;

  const [visited, setVisited] = useState<ReadonlySet<string>>(() => new Set<string>());
  const [confirming, setConfirming] = useState(false);
  const headingRef = useRef<HTMLHeadingElement | null>(null);

  // Time on each question, accumulated across every visit to it. The block is
  // navigable, so a single start timestamp would only ever measure the last look.
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

  // A new block is a new sitting as far as timing, review state and the
  // one-per-block confirmation are concerned.
  useEffect(() => {
    elapsedRef.current = {};
    dwellRef.current = { questionId: null, since: Date.now() };
    setConfirming(false);
  }, [stageId]);

  // The server only learns an answer at commit, so drafts live in sessionStorage
  // and are replayed into the block after `useBlockNavigation` has reset for it.
  useEffect(() => {
    if (stageId === null) return;
    const drafts = loadBlockDrafts(
      stageId,
      blockQuestions.map((q) => q.questionId),
    );
    for (const [questionId, choiceId] of Object.entries(drafts)) {
      if (choiceId !== null) draftAnswer(questionId, choiceId);
    }
  }, [stageId, blockQuestions, draftAnswer]);

  // Skipping the empty map matters: this effect and the restore above run in the
  // same commit, and writing `{}` here would erase the drafts before they land.
  useEffect(() => {
    if (stageId === null || answeredCount === 0) return;
    saveBlockDrafts(stageId, answers);
  }, [stageId, answers, answeredCount]);

  // Focus moves to the new stem so keyboard and screen-reader users land on the
  // question they navigated to rather than back at the top of the block.
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
    return <div className="mc-center mc-muted">Preparing your diagnostic…</div>;
  }

  if (next.isError) {
    return (
      <div className="mc-onboarding">
        <Card elevated>
          <Stack gap={4}>
            <h1 className="mc-h2">We hit a snag starting your diagnostic.</h1>
            <Button variant="primary" size="lg" onClick={() => next.refetch()}>
              Try again
            </Button>
          </Stack>
        </Card>
      </div>
    );
  }

  if (next.data.done && next.data.result) {
    return (
      <DiagnosticComplete
        result={next.data.result}
        learnerId={learnerId}
        onContinue={() => navigate('/onboarding/plan')}
      />
    );
  }

  if (!question) {
    return <div className="mc-center mc-muted">Finishing your diagnostic…</div>;
  }

  const progressPct = Math.round(next.data.progress * 100);
  const startNumber = next.data.itemsCommitted + 1;
  const questionNumber = startNumber + nav.currentIndex;
  const totalItems = next.data.totalItems ?? 0;
  const unanswered = questions.length - answeredCount;
  // An answered question has plainly been seen, which also means a refresh
  // mid-block does not send the learner back through everything they drafted.
  const seenWholeBlock = questions.every(
    (q) => visited.has(q.id) || answers[q.id] !== undefined,
  );
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
    <div className="mc-onboarding mc-onboarding--themed">
      <Card elevated className="mc-onboard__card">
        <Stack gap={4}>
          <OnboardingSteps current={2} />
          <Stack gap={2}>
            <Eyebrow>
              Diagnostic · block {next.data.stageNumber} of {next.data.stageCount} · question{' '}
              {questionNumber}
              {totalItems > 0 ? ` of ${totalItems}` : ''}
            </Eyebrow>

            <div
              className="mc-progress"
              role="progressbar"
              aria-valuenow={progressPct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Diagnostic progress"
            >
              <span style={{ width: `${Math.max(6, progressPct)}%` }} />
            </div>
            <p className="mc-fineprint mc-muted mc-diag-progresslabel">
              {progressPct}% through the placement
            </p>
          </Stack>

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
            startNumber={startNumber}
            label="Jump to a question in this block"
          />

          {confirming ? (
            <Callout
              tone={unanswered > 0 ? 'warning' : 'info'}
              title={
                unanswered > 0
                  ? `Submit with ${unanswered} left blank?`
                  : 'Submit this block?'
              }
            >
              <Stack gap={3}>
                <p>
                  {unanswered > 0
                    ? 'A blank counts as “I don’t know”, which is a cleaner signal than a guess. You cannot come back to this block afterwards.'
                    : 'You cannot come back to this block afterwards.'}
                </p>
                {submit.isError ? (
                  <p>
                    That submission did not go through. Your answers are still here — try again, or{' '}
                    <button type="button" className="mc-textbtn" onClick={() => next.refetch()}>
                      reload this block
                    </button>
                    .
                  </p>
                ) : null}
                <Inline>
                  <Button variant="primary" disabled={submit.isPending} onClick={onCommit}>
                    {submit.isPending ? 'Submitting…' : 'Submit block'}
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
            <Stack gap={2}>
              <Button
                variant="primary"
                size="lg"
                fullWidth
                disabled={!seenWholeBlock || submit.isPending}
                onClick={() => setConfirming(true)}
              >
                Review and submit block
              </Button>
              {seenWholeBlock ? null : (
                <p className="mc-fineprint mc-muted">
                  Open every question in this block before submitting it.
                </p>
              )}
            </Stack>
          )}

          <p className="mc-fineprint mc-muted">
            You can change any answer in this block until you submit it. This finds your
            highest-leverage starting point across every area of the test — not a score.
          </p>
        </Stack>
      </Card>
    </div>
  );
}

function DiagnosticComplete({
  result,
  learnerId,
  onContinue,
}: {
  result: DiagnosticResultView;
  learnerId: string | null;
  onContinue: () => void;
}) {
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const applySeed = useApplyMasterySeed();
  const seeded = useRef(false);
  const seed = result.masterySeed;

  // A concept the form never reached carries `gap: 0` — absence of evidence,
  // which the chart's point estimate would draw as a confident "nothing to do
  // here". Those concepts are named in prose below the chart instead.
  const { rows, unmeasured } = useMemo(() => {
    const measured: BucketGapRow[] = [];
    const missing: string[] = [];
    for (const signal of result.perCluster) {
      if (signal.itemsSeen === 0) {
        missing.push(signal.title);
        continue;
      }
      measured.push({
        bucketId: signal.cluster,
        title: signal.title,
        gap: signal.gap,
        certainty: signal.certainty,
        itemsSeen: signal.itemsSeen,
      });
    }
    return { rows: measured, unmeasured: missing };
  }, [result.perCluster]);

  const priorityIds = useMemo(
    () => result.topPriorities.map((p) => p.cluster),
    [result.topPriorities],
  );

  useEffect(() => {
    headingRef.current?.focus();
    // Mark the diagnostic as genuinely completed (for THIS learner) so Welcome
    // stops re-offering it to them — while a different account still gets it.
    markDiagnosticCompleted(learnerId);
  }, [learnerId]);

  // Hand the read to the mastery engine. The completed block is re-served on
  // every refetch, so this is guarded to one attempt per mount; the write itself
  // only ever initializes lessons the learner has not practised, so a repeat
  // would be harmless rather than corrupting. A failure is deliberately not
  // surfaced — the learner's plan does not depend on it, and the priors it sets
  // are an opening guess the first few attempts overwrite anyway.
  useEffect(() => {
    // Gated on the grain the seed actually carries. This read `lessonPriors`,
    // which the emitter no longer sends and the authority now rejects.
    if (seeded.current || Object.keys(seed.kcPriors).length === 0) return;
    seeded.current = true;
    applySeed.mutate(seed);
  }, [seed, applySeed]);

  return (
    <div className="mc-onboarding">
      <Card elevated>
        <Stack gap={5}>
          <Eyebrow>Your starting plan</Eyebrow>
          <h1 className="mc-h2" tabIndex={-1} ref={headingRef}>
            Here’s where to start.
          </h1>

          <div className="mc-diag-confidence">
            <span className={`mc-diag-badge mc-diag-badge--${result.confidenceLabel.replace(/\s/g, '-').toLowerCase()}`}>
              Plan confidence: {result.confidenceLabel}
            </span>
            <p className="mc-muted">{CONFIDENCE_SENTENCE[result.confidenceLabel]}</p>
          </div>

          {result.topPriorities.length > 0 ? (
            <Stack gap={3}>
              <h2 className="mc-h3">{priorityHeading(result.topPriorities.length)}</h2>
              <p className="mc-muted">{priorityFraming(result.topPriorities.length)}</p>
              <PriorityList priorities={result.topPriorities} />
            </Stack>
          ) : (
            <Callout tone="info">
              You showed steady work across the board — we’ll start with foundations and confirm as
              you go.
            </Callout>
          )}

          {result.stillConfirming.length > 0 ? (
            <Callout tone="info" title="Still being confirmed">
              We’ll quietly check {formatList(result.stillConfirming.map((s) => s.title))} during your
              first week of study — no separate re-test.
            </Callout>
          ) : null}

          {rows.length > 0 ? (
            <Stack gap={3}>
              <h2 className="mc-h3">Across every area</h2>
              <BucketGapChart rows={rows} priorityIds={priorityIds} />
              {unmeasured.length > 0 ? (
                <p className="mc-fineprint mc-muted">
                  This form did not reach {formatList(unmeasured)}, so there is nothing to show
                  there yet — not a clean bill of health.
                </p>
              ) : null}
            </Stack>
          ) : null}

          <Button variant="primary" size="lg" fullWidth onClick={onContinue}>
            Continue to your plan
          </Button>
        </Stack>
      </Card>
    </div>
  );
}

function formatList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}
