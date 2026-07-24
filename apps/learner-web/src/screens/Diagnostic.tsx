import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Callout, Card, Eyebrow, Stack } from '@mcat/ui-web';
import { useDiagnosticNext, useSubmitDiagnostic } from '../app/queries';
import type { ChoiceId, DiagnosticResultView } from '../app/diagnostic-client';
import { markDiagnosticCompleted } from '../app/diagnostic-status';
import { ensureSeeded } from '../app/recall-schedule';

const CONFIDENCE_SENTENCE: Record<DiagnosticResultView['confidenceLabel'], string> = {
  High: 'We have a clear starting plan for you. We’ll keep sharpening it as you study.',
  Medium: 'We have a solid starting plan and a few areas we’ll confirm in your first week.',
  'Still building': 'We have an early direction — your first week of study will confirm the details.',
};

export function Diagnostic() {
  const navigate = useNavigate();
  const next = useDiagnosticNext();
  const submit = useSubmitDiagnostic();
  const [choice, setChoice] = useState<ChoiceId | null>(null);

  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const startedAtRef = useRef<number>(Date.now());
  const previousSectionRef = useRef<string | null>(null);
  const question = next.data?.question ?? null;

  // Section transition is computed against the last committed item's section.
  const isSectionChange =
    question !== null &&
    previousSectionRef.current !== null &&
    previousSectionRef.current !== question.section;

  // Reset per-item state, note the new section, and move focus to the question
  // heading so keyboard/screen-reader users land on the new prompt.
  const questionId = question?.id ?? null;
  const questionSection = question?.section ?? null;
  useEffect(() => {
    if (questionId === null) return;
    setChoice(null);
    startedAtRef.current = Date.now();
    previousSectionRef.current = questionSection;
    headingRef.current?.focus();
  }, [questionId, questionSection]);

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
    return <DiagnosticComplete result={next.data.result} onContinue={() => navigate('/onboarding/plan')} />;
  }

  if (!question) {
    return <div className="mc-center mc-muted">Finishing your diagnostic…</div>;
  }

  const progressPct = Math.round(next.data.progress * 100);
  const questionNumber = next.data.itemsScored + 1;

  const onSubmit = () => {
    submit.mutate({
      questionId: question.id,
      choiceId: choice,
      elapsedMs: Date.now() - startedAtRef.current,
    });
  };

  // "I don't know" submits no choice. The engine scores a null answer as
  // not-known — cleaner signal than forcing a lucky guess into the estimate.
  const onDontKnow = () => {
    submit.mutate({
      questionId: question.id,
      choiceId: null,
      elapsedMs: Date.now() - startedAtRef.current,
    });
  };

  // Skipping placement: seed a neutral recall schedule and go straight to plan
  // setup. The learner can still take the diagnostic later.
  const onSkip = () => {
    ensureSeeded(null);
    navigate('/onboarding/plan');
  };

  return (
    <div className="mc-onboarding">
      <Card elevated>
        <Stack gap={4}>
          <Eyebrow>Diagnostic · question {questionNumber}</Eyebrow>

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

          {isSectionChange ? (
            <Callout tone="info" title={`Now: ${question.sectionTitle}`}>
              We’re shifting to a new area of the test. Take your time.
            </Callout>
          ) : null}

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
                className={`mc-choice ${choice === c.id ? 'mc-choice--selected' : ''}`}
              >
                <input
                  type="radio"
                  name="answer"
                  value={c.id}
                  checked={choice === c.id}
                  onChange={() => setChoice(c.id)}
                />
                <span className="mc-choice__key">{c.id}</span>
                <span className="mc-choice__text">{c.text}</span>
              </label>
            ))}
          </fieldset>

          <Button
            variant="primary"
            size="lg"
            fullWidth
            disabled={choice === null || submit.isPending}
            onClick={onSubmit}
          >
            {submit.isPending ? 'Saving…' : 'Submit and continue'}
          </Button>

          <Button
            variant="secondary"
            size="lg"
            fullWidth
            disabled={submit.isPending}
            onClick={onDontKnow}
          >
            I don’t know — skip this question
          </Button>

          <p className="mc-fineprint mc-muted">
            This finds your highest-leverage starting point across every area of the test — not a
            score. Answer as you would on test day.
          </p>

          <button type="button" className="mc-textbtn mc-diag-skip" onClick={onSkip}>
            Skip the diagnostic for now
          </button>
        </Stack>
      </Card>
    </div>
  );
}

function DiagnosticComplete({
  result,
  onContinue,
}: {
  result: DiagnosticResultView;
  onContinue: () => void;
}) {
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  useEffect(() => {
    headingRef.current?.focus();
    // Seed the topic-recall schedule from this placement (idempotent).
    ensureSeeded(result);
    // Mark the diagnostic as genuinely completed so Welcome stops re-offering it.
    markDiagnosticCompleted();
  }, [result]);

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
              <h2 className="mc-h3">Focus here first</h2>
              <ol className="mc-diag-priorities">
                {result.topPriorities.map((p, i) => (
                  <li key={p.cluster} className="mc-diag-priority">
                    <span className="mc-diag-priority__rank">{i + 1}</span>
                    <span className="mc-diag-priority__body">
                      <strong>{p.title}</strong>
                      <span className="mc-muted mc-fineprint">{p.tested}</span>
                    </span>
                  </li>
                ))}
              </ol>
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
