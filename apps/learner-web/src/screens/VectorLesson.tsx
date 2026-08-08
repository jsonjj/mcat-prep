import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import type { VectorLessonAction, VectorLessonScreen, VectorLessonVisual } from '@mcat/contracts';
import { Button, Callout } from '@mcat/ui-web';
import { useSubmitVectorLessonAction, useVectorLessonRun } from '../app/queries';

const COMPLETION_COPY = 'You finished this lesson’s required instruction.';

export function VectorLesson() {
  const navigate = useNavigate();
  const lesson = useVectorLessonRun();
  const submit = useSubmitVectorLessonAction();
  const [choice, setChoice] = useState<'A' | 'B' | 'C' | 'D' | null>(null);
  const focusTargetRef = useRef<HTMLElement | null>(null);
  const screenToken = lesson.data?.screen.screenToken;
  const refetchLesson = lesson.refetch;

  useEffect(() => {
    setChoice(null);
    const frame = window.requestAnimationFrame(() => focusTargetRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [screenToken]);

  useEffect(() => {
    const previousTitle = document.title;
    document.title = 'Vectors and Trigonometry | MCAT Mastery';
    return () => {
      document.title = previousTitle;
    };
  }, []);

  useEffect(() => {
    if (submit.isError) void refetchLesson();
  }, [refetchLesson, submit.isError]);

  if (lesson.isLoading) {
    return <div className="mc-center mc-muted">Restoring your exact lesson checkpoint…</div>;
  }

  if (lesson.isError || !lesson.data) {
    return (
      <div className="mc-vector-lesson mc-vector-lesson--state">
        <Callout tone="warning" title="The lesson could not be restored">
          Your saved checkpoint has not been changed. Try loading it again.
        </Callout>
        <div className="mc-vector-lesson__state-actions">
          <Button variant="primary" onClick={() => void lesson.refetch()}>
            Try again
          </Button>
          <Button variant="secondary" onClick={() => navigate('/app/curriculum')}>
            Back to curriculum
          </Button>
        </div>
      </div>
    );
  }

  const run = lesson.data;
  const send = (action: VectorLessonAction, options: { onSuccess?: () => void } = {}): void => {
    submit.mutate(
      {
        runId: run.runId,
        screenToken: run.screen.screenToken,
        action,
      },
      options.onSuccess === undefined ? undefined : { onSuccess: options.onSuccess },
    );
  };

  return (
    <article
      className="mc-vector-lesson"
      aria-labelledby="mc-vector-lesson-heading"
      aria-busy={submit.isPending}
    >
      {/* Dev-only draft marker. Gated to `import.meta.env.DEV` so it never ships in a
          production build; the `INTERNAL_DRAFT_ONLY` literal stays in source for the
          vector-lesson UI contract test. */}
      {import.meta.env.DEV ? (
        <div className="mc-vector-lesson__preview" role="note">
          INTERNAL_DRAFT_ONLY
        </div>
      ) : null}
      <header className="mc-vector-lesson__header">
        <div>
          <p className="mc-vector-lesson__progress">
            Part {run.progress.currentPart} of {run.progress.totalParts}
            <span aria-hidden="true"> · </span>
            <span>{run.progress.currentPartLabel}</span>
          </p>
          <p className="mc-vector-lesson__stage">{run.progress.stageLabel}</p>
        </div>
        {run.screen.kind !== 'COMPLETION' && run.screen.kind !== 'BLOCKED' ? (
          <button
            type="button"
            className="mc-textbtn mc-vector-lesson__pause"
            disabled={submit.isPending}
            onClick={() =>
              send({ type: 'PAUSE' }, { onSuccess: () => navigate('/app/curriculum') })
            }
          >
            Pause and return
          </button>
        ) : null}
      </header>

      {submit.isError ? (
        <div className="mc-vector-lesson__error" role="alert">
          We could not confirm whether that action was saved. Restoring the authoritative
          checkpoint…
        </div>
      ) : null}
      <span className="mc-visually-hidden" role="status" aria-live="polite">
        {submit.isPending ? 'Saving your lesson checkpoint.' : ''}
      </span>

      <LessonScreen
        screen={run.screen}
        choice={choice}
        pending={submit.isPending}
        focusTargetRef={focusTargetRef}
        onChoice={setChoice}
        onAction={(action) => send(action)}
        onReturn={() => navigate('/app/curriculum')}
      />
    </article>
  );
}

function LessonScreen({
  screen,
  choice,
  pending,
  focusTargetRef,
  onChoice,
  onAction,
  onReturn,
}: {
  screen: VectorLessonScreen;
  choice: 'A' | 'B' | 'C' | 'D' | null;
  pending: boolean;
  focusTargetRef: React.MutableRefObject<HTMLElement | null>;
  onChoice: (choice: 'A' | 'B' | 'C' | 'D') => void;
  onAction: (action: VectorLessonAction) => void;
  onReturn: () => void;
}) {
  const setFocusTarget = (element: HTMLElement | null): void => {
    focusTargetRef.current = element;
  };

  if (screen.kind === 'CONTENT') {
    return (
      <section className="mc-vector-lesson__screen">
        <h1 id="mc-vector-lesson-heading" ref={setFocusTarget} tabIndex={-1} className="mc-h1">
          {screen.heading}
        </h1>
        <div className="mc-vector-lesson__body">
          {screen.body.map((paragraph, index) => (
            <p key={`${index}-${paragraph.slice(0, 12)}`}>{paragraph}</p>
          ))}
        </div>
        {screen.visual ? <LessonVisual visual={screen.visual} /> : null}
        <Button
          variant="primary"
          size="lg"
          disabled={pending}
          onClick={() => onAction({ type: 'CONTINUE' })}
        >
          {pending ? 'Saving…' : screen.primaryActionLabel}
        </Button>
      </section>
    );
  }

  if (screen.kind === 'QUESTION') {
    const submitResponse = (event: FormEvent): void => {
      event.preventDefault();
      if (choice !== null) onAction({ type: 'SUBMIT_RESPONSE', choiceId: choice });
    };
    return (
      <section className="mc-vector-lesson__screen">
        <h1 id="mc-vector-lesson-heading" ref={setFocusTarget} tabIndex={-1} className="mc-h1">
          {screen.heading}
        </h1>
        {screen.visual ? <LessonVisual visual={screen.visual} /> : null}
        <form onSubmit={submitResponse}>
          <fieldset className="mc-vector-lesson__choices">
            <legend className="mc-vector-lesson__prompt">{screen.prompt}</legend>
            {screen.choices.map((option) => (
              <label
                key={option.id}
                className={`mc-vector-choice${choice === option.id ? ' mc-vector-choice--selected' : ''}`}
              >
                <input
                  type="radio"
                  name="vector-lesson-response"
                  value={option.id}
                  checked={choice === option.id}
                  onChange={() => onChoice(option.id)}
                />
                <span className="mc-vector-choice__marker" aria-hidden="true">
                  {option.id}
                </span>
                <span>{option.text}</span>
              </label>
            ))}
          </fieldset>

          {screen.support ? (
            <aside className="mc-vector-lesson__cue" aria-live="polite">
              <strong>{screen.support.label}</strong>
              <p>{screen.support.text}</p>
            </aside>
          ) : null}

          <div className="mc-vector-lesson__actions">
            <Button type="submit" variant="primary" size="lg" disabled={choice === null || pending}>
              {pending ? 'Saving…' : screen.primaryActionLabel}
            </Button>
            {screen.supportActionLabel ? (
              <button
                type="button"
                className="mc-textbtn"
                disabled={pending}
                onClick={() => onAction({ type: 'REQUEST_SUPPORT' })}
              >
                {screen.supportActionLabel}
              </button>
            ) : null}
            <button
              type="button"
              className="mc-textbtn"
              disabled={pending}
              onClick={() => onAction({ type: 'SUBMIT_RESPONSE', choiceId: null })}
            >
              Skip this response
            </button>
          </div>
        </form>
      </section>
    );
  }

  if (screen.kind === 'FEEDBACK') {
    return (
      <section className="mc-vector-lesson__screen mc-vector-lesson__feedback">
        <h1
          id="mc-vector-lesson-heading"
          ref={setFocusTarget}
          tabIndex={-1}
          className={`mc-h1 ${
            screen.outcome === 'CORRECT' || screen.outcome === 'REPAIR_CONFIRMED'
              ? 'mc-reveal__key--ok'
              : 'mc-reveal__key--wrong'
          }`}
        >
          {screen.heading}
        </h1>
        <div className="mc-vector-lesson__body" role="status" aria-live="polite">
          {screen.body.map((paragraph, index) => (
            <p key={`${index}-${paragraph.slice(0, 12)}`}>{paragraph}</p>
          ))}
        </div>
        <Button
          variant="primary"
          size="lg"
          disabled={pending}
          onClick={() => onAction({ type: 'CONTINUE' })}
        >
          {pending ? 'Saving…' : screen.primaryActionLabel}
        </Button>
      </section>
    );
  }

  return (
    <section className="mc-vector-lesson__screen mc-vector-lesson__terminal">
      <h1 id="mc-vector-lesson-heading" ref={setFocusTarget} tabIndex={-1} className="mc-h1">
        {screen.kind === 'COMPLETION' ? COMPLETION_COPY : screen.heading}
      </h1>
      <div className="mc-vector-lesson__body">
        {screen.body.map((paragraph, index) => (
          <p key={`${index}-${paragraph.slice(0, 12)}`}>{paragraph}</p>
        ))}
      </div>
      <Button variant="primary" size="lg" onClick={onReturn}>
        {screen.primaryActionLabel}
      </Button>
    </section>
  );
}

function LessonVisual({ visual }: { visual: VectorLessonVisual }) {
  return (
    <figure className={`mc-vector-visual mc-vector-visual--${visual.kind.toLowerCase()}`}>
      <figcaption>{visual.title}</figcaption>
      <p className="mc-vector-visual__equivalent">{visual.textEquivalent}</p>
      <dl className="mc-vector-visual__tokens">
        {visual.tokens.map((token) => (
          <div key={token.label}>
            <dt>{token.label}</dt>
            <dd>{token.value}</dd>
          </div>
        ))}
      </dl>
    </figure>
  );
}
