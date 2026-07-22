import { useEffect, useRef, useState } from 'react';
import { ThemeToggle } from '../components/ThemeToggle';
import { ArrowRightIcon, CheckIcon, CloseIcon, CompassIcon } from '../components/icons';
import { SNAPSHOT_EXPECTED_MINUTES, SNAPSHOT_QUESTION_COUNT, snapshotQuestions } from './questions';
import { SnapshotVisual } from './SnapshotVisual';
import type { ChoiceId, SnapshotReport, SnapshotSubmission, SnapshotQuestion } from './types';

type SnapshotScreen = 'intro' | 'questions' | 'submitting' | 'report';

interface SnapshotExperienceProps {
  onExit: () => void;
  onEmailUpdates: (originId: string, source: 'snapshot-intro' | 'snapshot-report') => void;
}

class SnapshotServiceError extends Error {
  constructor(readonly status: number) {
    super('Snapshot service request failed.');
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

function isAttemptResponse(value: unknown): value is { attemptToken: string } {
  return (
    isObject(value) &&
    typeof value.attemptToken === 'string' &&
    value.attemptToken.length >= 32 &&
    typeof value.expiresInSeconds === 'number'
  );
}

function isSnapshotReport(value: unknown): value is SnapshotReport {
  return (
    isObject(value) &&
    value.version === 'snapshot-pilot-v2' &&
    isObject(value.repeatedPattern) &&
    (value.repeatedPattern.kind === 'positive' ||
      value.repeatedPattern.kind === 'friction' ||
      value.repeatedPattern.kind === 'none') &&
    typeof value.repeatedPattern.title === 'string' &&
    typeof value.repeatedPattern.body === 'string' &&
    Array.isArray(value.pairedSignals) &&
    value.pairedSignals.length === 6 &&
    value.pairedSignals.every(
      (signal) =>
        isObject(signal) &&
        typeof signal.id === 'string' &&
        typeof signal.label === 'string' &&
        (signal.state === 'limited-positive' ||
          signal.state === 'mixed' ||
          signal.state === 'drill-target') &&
        typeof signal.title === 'string' &&
        typeof signal.body === 'string',
    ) &&
    isStringArray(value.unknowns) &&
    isObject(value.nextDrill) &&
    typeof value.nextDrill.title === 'string' &&
    typeof value.nextDrill.body === 'string' &&
    typeof value.disclaimer === 'string'
  );
}

async function postJson(path: string, payload?: unknown): Promise<unknown> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 10_000);
  const init: RequestInit = {
    method: 'POST',
    signal: controller.signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload ?? {}),
  };

  try {
    const response = await fetch(path, init);
    const text = await response.text();
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
    if (!response.ok) throw new SnapshotServiceError(response.status);
    return body;
  } catch (requestError) {
    if (requestError instanceof SnapshotServiceError) throw requestError;
    throw new SnapshotServiceError(0);
  } finally {
    window.clearTimeout(timeout);
  }
}

function QuestionContent({ question }: { question: SnapshotQuestion }) {
  return (
    <>
      {question.passage ? (
        <article className="snapshot-passage" aria-label="Passage">
          <p className="snapshot-passage__label">Passage</p>
          {question.passage.split('\n\n').map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </article>
      ) : null}

      {question.stimulus ? <p className="snapshot-stimulus">{question.stimulus}</p> : null}
      {question.visual ? <SnapshotVisual visual={question.visual} /> : null}
    </>
  );
}

export function SnapshotExperience({ onExit, onEmailUpdates }: SnapshotExperienceProps) {
  const [screen, setScreen] = useState<SnapshotScreen>('intro');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [responses, setResponses] = useState<Partial<Record<string, ChoiceId>>>({});
  const [report, setReport] = useState<SnapshotReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attemptToken, setAttemptToken] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const introFocusRef = useRef<HTMLHeadingElement>(null);
  const questionFocusRef = useRef<HTMLDivElement>(null);
  const reportFocusRef = useRef<HTMLHeadingElement>(null);

  const currentQuestion = snapshotQuestions[currentIndex];
  const selectedChoice = currentQuestion ? responses[currentQuestion.id] : undefined;
  const answeredCount = Object.keys(responses).length;

  useEffect(() => {
    if (screen === 'submitting') return;
    window.scrollTo({ top: 0 });
    if (screen === 'intro') introFocusRef.current?.focus({ preventScroll: true });
    if (screen === 'questions') questionFocusRef.current?.focus({ preventScroll: true });
    if (screen === 'report') reportFocusRef.current?.focus({ preventScroll: true });
  }, [currentIndex, screen]);

  const exitSnapshot = () => {
    if (
      screen === 'questions' &&
      answeredCount > 0 &&
      !window.confirm('Leave the snapshot? Your answers will not be saved.')
    ) {
      return;
    }
    onExit();
  };

  const beginSnapshot = async () => {
    setStarting(true);
    setError(null);
    try {
      const body = await postJson('/api/snapshot/attempt');
      if (!isAttemptResponse(body)) throw new SnapshotServiceError(502);
      setAttemptToken(body.attemptToken);
      setScreen('questions');
    } catch (startError) {
      setError(
        startError instanceof SnapshotServiceError && startError.status === 429
          ? 'This single-process pilot allows one generated report per 24-hour attempt window.'
          : 'The snapshot could not be started right now. Please try again in a few minutes.',
      );
    } finally {
      setStarting(false);
    }
  };

  const submitSnapshot = async () => {
    const orderedResponses = snapshotQuestions.flatMap((question) => {
      const choiceId = responses[question.id];
      return choiceId ? [{ questionId: question.id, choiceId }] : [];
    });
    if (orderedResponses.length !== SNAPSHOT_QUESTION_COUNT || !attemptToken) return;

    const submission: SnapshotSubmission = { attemptToken, responses: orderedResponses };
    setScreen('submitting');
    setError(null);

    try {
      const body = await postJson('/api/snapshot/score', submission);
      if (!isSnapshotReport(body)) throw new SnapshotServiceError(502);
      setReport(body);
      setScreen('report');
    } catch (submitError) {
      if (submitError instanceof SnapshotServiceError && submitError.status === 401) {
        setAttemptToken(null);
        setError('This attempt expired before it was scored. Start a new attempt to continue.');
        setScreen('intro');
        return;
      }
      if (submitError instanceof SnapshotServiceError && submitError.status === 409) {
        setError(
          'This attempt was already scored with a different answer set and cannot be rescored.',
        );
        setScreen('questions');
        return;
      }
      if (submitError instanceof SnapshotServiceError && submitError.status === 502) {
        setError('The report response was interrupted. Retry without changing your answers.');
        setScreen('questions');
        return;
      }
      setError('The report could not be generated. Your answers remain here; please try again.');
      setScreen('questions');
    }
  };

  const goForward = () => {
    if (!selectedChoice) return;
    if (currentIndex < snapshotQuestions.length - 1) {
      setCurrentIndex((index) => index + 1);
      return;
    }
    void submitSnapshot();
  };

  if (screen === 'intro') {
    return (
      <div className="snapshot-page snapshot-page--intro">
        <a className="lp-skip-link" href="#snapshot-main">
          Skip to snapshot introduction
        </a>
        <header className="snapshot-header">
          <button className="lp-brand snapshot-brand-button" type="button" onClick={onExit}>
            <span className="lp-brand__mark" aria-hidden="true" />
            <span className="lp-brand__name">MCAT Mastery</span>
          </button>
          <div className="snapshot-header__actions">
            <span className="lp-pill lp-pill--preview">Snapshot pilot</span>
            <ThemeToggle />
          </div>
        </header>

        <main id="snapshot-main" className="snapshot-intro" tabIndex={-1}>
          <div className="snapshot-intro__copy">
            <p className="lp-eyebrow">Prep Pattern Snapshot</p>
            <h1 ref={introFocusRef} tabIndex={-1}>
              Twelve questions. One careful starting signal.
            </h1>
            <p className="snapshot-intro__lede">
              This short set looks for answer patterns that repeat across paired questions. It gives
              you a provisional pattern report and one drill to test next—not a score or readiness
              judgment.
            </p>

            <div className="snapshot-intro__stats" aria-label="Snapshot details">
              <p>
                <strong>{SNAPSHOT_QUESTION_COUNT}</strong>
                questions
              </p>
              <p>
                <strong>About {SNAPSHOT_EXPECTED_MINUTES}</strong>
                minutes
              </p>
              <p>
                <strong>No email</strong>
                to see your report
              </p>
            </div>

            <button
              className="lp-button lp-button--primary lp-button--large"
              type="button"
              disabled={starting}
              onClick={() => void beginSnapshot()}
            >
              {starting ? 'Starting securely…' : 'Start the snapshot'}
              {!starting ? <ArrowRightIcon /> : null}
            </button>
            {error ? (
              <p className="snapshot-intro__error" role="alert">
                {error}
              </p>
            ) : null}
            <button
              id="snapshot-beta-updates-intro"
              className="snapshot-text-button"
              type="button"
              onClick={() => onEmailUpdates('snapshot-beta-updates-intro', 'snapshot-intro')}
            >
              Not taking it now? Get beta updates
            </button>
            <button className="snapshot-text-button" type="button" onClick={onExit}>
              Return to the landing page
            </button>
          </div>

          <aside className="snapshot-intro__limits">
            <span className="snapshot-intro__icon">
              <CompassIcon />
            </span>
            <p className="lp-eyebrow">What this pilot can—and cannot—do</p>
            <h2>A conversation starter, not a compressed full-length.</h2>
            <ul>
              <li>
                <CheckIcon />
                Six paired probes across CARS and selected science reasoning
              </li>
              <li>
                <CheckIcon />
                Four data questions form the strict repetition check; every pair remains visible
              </li>
              <li>
                <CloseIcon />
                No psychology/sociology, endurance, broad content, or score estimate
              </li>
            </ul>
            <p>
              These candidate items are still awaiting independent scientific, originality, and
              learner validation. Your responses are used only to generate the report and are not
              stored by this prototype.
            </p>
          </aside>
        </main>
      </div>
    );
  }

  if (screen === 'report' && report) {
    return (
      <div className="snapshot-page snapshot-page--report">
        <header className="snapshot-header snapshot-header--contained">
          <button className="lp-brand snapshot-brand-button" type="button" onClick={onExit}>
            <span className="lp-brand__mark" aria-hidden="true" />
            <span className="lp-brand__name">MCAT Mastery</span>
          </button>
          <ThemeToggle />
        </header>

        <main className="snapshot-report">
          <div className="snapshot-report__heading">
            <p className="lp-eyebrow">Your Prep Pattern Snapshot</p>
            <h1 ref={reportFocusRef} tabIndex={-1}>
              Evidence first. Interpretation second.
            </h1>
            <p>
              This report keeps all six paired observations visible, then looks for a narrowly
              repeated answer pattern. It does not display or interpret a total score.
            </p>
          </div>

          <section
            className={`snapshot-pattern snapshot-pattern--${report.repeatedPattern.kind}`}
            aria-labelledby="repeated-pattern-title"
          >
            <p className="lp-eyebrow">Repeated pattern</p>
            <h2 id="repeated-pattern-title">{report.repeatedPattern.title}</h2>
            <p>{report.repeatedPattern.body}</p>
          </section>

          <section className="snapshot-report__section" aria-labelledby="paired-signals-title">
            <div className="snapshot-report__section-heading">
              <p className="lp-eyebrow">Paired observations</p>
              <h2 id="paired-signals-title">Every pair stays visible.</h2>
            </div>
            <div className="snapshot-signals">
              {report.pairedSignals.map((signal) => (
                <article
                  className={`snapshot-signal snapshot-signal--${signal.state}`}
                  key={signal.id}
                >
                  <p className="snapshot-signal__label">{signal.label}</p>
                  <h3>{signal.title}</h3>
                  <p>{signal.body}</p>
                </article>
              ))}
            </div>
          </section>

          <div className="snapshot-report__split">
            <section className="snapshot-unknowns" aria-labelledby="unknowns-title">
              <p className="lp-eyebrow">Still unknown</p>
              <h2 id="unknowns-title">This snapshot leaves important territory unmeasured.</h2>
              <ul>
                {report.unknowns.map((unknown) => (
                  <li key={unknown}>{unknown}</li>
                ))}
              </ul>
            </section>

            <section className="snapshot-next" aria-labelledby="next-drill-title">
              <span className="snapshot-next__icon">
                <CompassIcon />
              </span>
              <p className="lp-eyebrow">Try next</p>
              <h2 id="next-drill-title">{report.nextDrill.title}</h2>
              <p>{report.nextDrill.body}</p>
            </section>
          </div>

          <section className="snapshot-report__actions" aria-label="Next actions">
            <div>
              <h2>Keep the result in proportion.</h2>
              <p>{report.disclaimer}</p>
              <small>
                Responses were processed only to generate this report and were not stored. This
                pilot item set is still awaiting independent scientific, originality, and
                real-learner validation.
              </small>
            </div>
            <div>
              <button
                id="snapshot-beta-updates-report"
                className="lp-button lp-button--primary lp-button--large"
                type="button"
                onClick={() => onEmailUpdates('snapshot-beta-updates-report', 'snapshot-report')}
              >
                Get beta updates
                <ArrowRightIcon />
              </button>
              <button className="snapshot-text-button" type="button" onClick={onExit}>
                Return to landing page
              </button>
            </div>
          </section>
        </main>
      </div>
    );
  }

  if (!currentQuestion) return null;

  return (
    <div className="snapshot-page snapshot-page--question">
      <header className="snapshot-header snapshot-header--question">
        <button className="lp-brand snapshot-brand-button" type="button" onClick={exitSnapshot}>
          <span className="lp-brand__mark" aria-hidden="true" />
          <span className="lp-brand__name">MCAT Mastery</span>
        </button>
        <button className="snapshot-exit-button" type="button" onClick={exitSnapshot}>
          Exit snapshot
          <span className="snapshot-exit-button__note">Answers will not be saved</span>
          <CloseIcon />
        </button>
      </header>

      <div className="snapshot-progress">
        <span style={{ width: `${((currentIndex + 1) / snapshotQuestions.length) * 100}%` }} />
      </div>
      {screen === 'submitting' ? (
        <p className="lp-visually-hidden snapshot-live-status" role="status">
          Generating your pattern report…
        </p>
      ) : null}

      <main className="snapshot-question" aria-busy={screen === 'submitting'}>
        <div
          className="snapshot-question__meta"
          ref={questionFocusRef}
          tabIndex={-1}
          aria-live="polite"
        >
          <span>
            Question {currentIndex + 1} of {snapshotQuestions.length}
          </span>
          <span>{currentQuestion.domain}</span>
        </div>

        <div className="snapshot-question__layout">
          <div className="snapshot-question__evidence">
            <QuestionContent question={currentQuestion} />
          </div>

          <section className="snapshot-question__answer" aria-labelledby="snapshot-question-title">
            <p className="lp-eyebrow">{currentQuestion.skillLabel}</p>
            <h1 id="snapshot-question-title">{currentQuestion.stem}</h1>

            <fieldset className="snapshot-choices">
              <legend className="lp-visually-hidden">Select one answer</legend>
              {currentQuestion.choices.map((choice) => (
                <label
                  className={`snapshot-choice ${
                    selectedChoice === choice.id ? 'snapshot-choice--selected' : ''
                  }`}
                  key={choice.id}
                >
                  <input
                    type="radio"
                    name={`answer-${currentQuestion.id}`}
                    value={choice.id}
                    checked={selectedChoice === choice.id}
                    onChange={() =>
                      setResponses((current) => ({
                        ...current,
                        [currentQuestion.id]: choice.id,
                      }))
                    }
                  />
                  <span className="snapshot-choice__letter" aria-hidden="true">
                    {choice.id}
                  </span>
                  <span>{choice.text}</span>
                </label>
              ))}
            </fieldset>

            {error ? (
              <p className="snapshot-question__error" role="alert">
                {error}
              </p>
            ) : null}

            <div className="snapshot-question__controls">
              <button
                className="lp-button lp-button--secondary"
                type="button"
                disabled={currentIndex === 0 || screen === 'submitting'}
                onClick={() => setCurrentIndex((index) => Math.max(0, index - 1))}
              >
                Previous
              </button>
              <button
                className="lp-button lp-button--primary"
                type="button"
                disabled={!selectedChoice || screen === 'submitting'}
                onClick={goForward}
              >
                {screen === 'submitting'
                  ? 'Generating report…'
                  : currentIndex === snapshotQuestions.length - 1
                    ? 'Generate my report'
                    : 'Next question'}
                {screen !== 'submitting' ? <ArrowRightIcon /> : null}
              </button>
            </div>
            <p className="snapshot-question__privacy">
              No answer feedback is shown between questions. Responses are not stored.
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
