import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import type { NormalizedLessonAction, NormalizedLessonScreen } from '@mcat/contracts';
import { Button, Callout } from '@mcat/ui-web';
import {
  useNormalizedLessonRun,
  useNormalizedLessonStatus,
  useStartNormalizedLesson,
  useSubmitNormalizedLessonAction,
} from '../app/queries';
import { lessonById } from '../app/lesson-catalog';

/**
 * The shared player for every normalized-engine catalog lesson (L2/L3 today, any
 * Phase-9 authoring-template lesson tomorrow). It is the L2/L3 counterpart to L1's
 * bespoke {@link VectorLesson}: same server-authoritative discipline — the client
 * never sees an answer key, the server owns every scoring decision — but driven by
 * the grammar-agnostic `NormalizedLessonRunView` wire shape rather than L1's
 * vector-specific one, so one component serves the whole non-L1 catalog.
 *
 * WHICH lesson runs is fixed by the route (the manifest routes each registered
 * lesson to `/app/lessons/<slug>`), so this takes only a `lessonId` and resolves
 * the rest from the registration manifest. It starts (or resumes) on mount, then
 * renders the current screen and commits each learner response through the slug-
 * routed command seam.
 */

const COMPLETION_COPY = 'You finished this lesson’s required instruction.';

export function CatalogLesson({ lessonId }: { lessonId: string }) {
  const navigate = useNavigate();
  const lesson = lessonById(lessonId);
  const slug = lesson?.slug ?? '';

  const status = useNormalizedLessonStatus(slug);
  const start = useStartNormalizedLesson(slug, lessonId);
  const submit = useSubmitNormalizedLessonAction(slug);
  const startAttempted = useRef(false);

  const runState = status.data?.runState;
  const unavailable = status.data?.availability === 'UNAVAILABLE';
  const alreadyUnderWay =
    runState === 'IN_PROGRESS' ||
    runState === 'PAUSED' ||
    runState === 'BLOCKED' ||
    runState === 'DELIVERY_COMPLETE';

  // Auto-start exactly once when the lesson is available but not yet begun. A
  // lesson already under way (or complete) is resumed by the run query instead.
  useEffect(() => {
    if (unavailable || alreadyUnderWay || startAttempted.current) return;
    if (runState !== 'NOT_STARTED' || start.isPending) return;
    startAttempted.current = true;
    start.mutate();
  }, [unavailable, alreadyUnderWay, runState, start]);

  const runEnabled = slug !== '' && !unavailable && (alreadyUnderWay || start.isSuccess);
  const run = useNormalizedLessonRun(slug, runEnabled);
  const view = run.data;

  const screenKey = view?.screen.kind === 'QUESTION' ? view.screen.itemId : view?.screen.kind;
  const focusTargetRef = useRef<HTMLElement | null>(null);
  const refetchRun = run.refetch;
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => focusTargetRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [screenKey]);

  useEffect(() => {
    const previousTitle = document.title;
    if (lesson) document.title = `${lesson.title} | MCAT Mastery`;
    return () => {
      document.title = previousTitle;
    };
  }, [lesson]);

  useEffect(() => {
    if (submit.isError) void refetchRun();
  }, [refetchRun, submit.isError]);

  const backToCurriculum = (): void => navigate('/app/curriculum');

  if (!lesson) {
    return (
      <div className="mc-vector-lesson mc-vector-lesson--state">
        <Callout tone="warning" title="This lesson isn’t available">
          That lesson isn’t part of the current catalog.
        </Callout>
        <div className="mc-vector-lesson__state-actions">
          <Button variant="secondary" onClick={backToCurriculum}>
            Back to curriculum
          </Button>
        </div>
      </div>
    );
  }

  // The synthetic local authority does not persist lesson runs (like L1 here), so
  // it reports the lesson unavailable rather than serving a run. Say so plainly
  // instead of spinning; the persisted authority delivers the real thing.
  if (unavailable) {
    return (
      <div className="mc-vector-lesson mc-vector-lesson--state">
        <Callout tone="info" title="This lesson isn’t runnable in this environment">
          {lesson.title} runs on the persisted learning authority. Your progress is unchanged.
        </Callout>
        <div className="mc-vector-lesson__state-actions">
          <Button variant="secondary" onClick={backToCurriculum}>
            Back to curriculum
          </Button>
        </div>
      </div>
    );
  }

  if (status.isLoading || start.isPending || (runEnabled && run.isLoading)) {
    return <div className="mc-center mc-muted">Restoring your exact lesson checkpoint…</div>;
  }

  if (status.isError || run.isError || !view) {
    return (
      <div className="mc-vector-lesson mc-vector-lesson--state">
        <Callout tone="warning" title="The lesson could not be restored">
          Your saved checkpoint has not been changed. Try loading it again.
        </Callout>
        <div className="mc-vector-lesson__state-actions">
          <Button
            variant="primary"
            onClick={() => {
              void status.refetch();
              void run.refetch();
            }}
          >
            Try again
          </Button>
          <Button variant="secondary" onClick={backToCurriculum}>
            Back to curriculum
          </Button>
        </div>
      </div>
    );
  }

  const send = (action: NormalizedLessonAction): void => {
    submit.mutate(action, { onSuccess: () => void run.refetch() });
  };

  const progressLabel =
    view.kcOrdinal !== null && view.totalKcs > 0
      ? `Concept ${view.kcOrdinal} of ${view.totalKcs}`
      : `${view.totalKcs} ${view.totalKcs === 1 ? 'concept' : 'concepts'}`;

  return (
    <article
      className="mc-vector-lesson"
      aria-labelledby="mc-catalog-lesson-heading"
      aria-busy={submit.isPending}
    >
      <header className="mc-vector-lesson__header">
        <div>
          <p className="mc-vector-lesson__progress">{progressLabel}</p>
          <p className="mc-vector-lesson__stage">{lesson.title}</p>
        </div>
        {view.screen.kind !== 'COMPLETE' && view.screen.kind !== 'BLOCKED' ? (
          <button
            type="button"
            className="mc-textbtn mc-vector-lesson__pause"
            disabled={submit.isPending}
            onClick={backToCurriculum}
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

      <CatalogLessonScreen
        screen={view.screen}
        pending={submit.isPending}
        focusTargetRef={focusTargetRef}
        onAction={send}
        onReturn={backToCurriculum}
      />
    </article>
  );
}

function CatalogLessonScreen({
  screen,
  pending,
  focusTargetRef,
  onAction,
  onReturn,
}: {
  screen: NormalizedLessonScreen;
  pending: boolean;
  focusTargetRef: React.MutableRefObject<HTMLElement | null>;
  onAction: (action: NormalizedLessonAction) => void;
  onReturn: () => void;
}) {
  const setFocusTarget = (element: HTMLElement | null): void => {
    focusTargetRef.current = element;
  };

  if (screen.kind === 'EXPOSITION') {
    return (
      <section className="mc-vector-lesson__screen">
        <h1 id="mc-catalog-lesson-heading" ref={setFocusTarget} tabIndex={-1} className="mc-h1">
          {screen.heading}
        </h1>
        <div className="mc-vector-lesson__body">
          <p>{screen.prompt}</p>
        </div>
        <Button
          variant="primary"
          size="lg"
          disabled={pending}
          onClick={() => onAction({ type: 'CONTINUE' })}
        >
          {pending ? 'Saving…' : 'Continue'}
        </Button>
      </section>
    );
  }

  if (screen.kind === 'QUESTION') {
    return (
      <QuestionScreen
        screen={screen}
        pending={pending}
        setFocusTarget={setFocusTarget}
        onAction={onAction}
      />
    );
  }

  if (screen.kind === 'FEEDBACK') {
    return (
      <section className="mc-vector-lesson__screen mc-vector-lesson__feedback">
        <h1
          id="mc-catalog-lesson-heading"
          ref={setFocusTarget}
          tabIndex={-1}
          className={`mc-h1 ${screen.outcome === 'CORRECT' ? 'mc-reveal__key--ok' : 'mc-reveal__key--wrong'}`}
        >
          {screen.outcome === 'CORRECT' ? 'Correct' : 'Not quite'}
        </h1>
        <Button
          variant="primary"
          size="lg"
          disabled={pending}
          onClick={() => onAction({ type: 'CONTINUE' })}
        >
          {pending ? 'Saving…' : 'Continue'}
        </Button>
      </section>
    );
  }

  if (screen.kind === 'BLOCKED') {
    return (
      <section className="mc-vector-lesson__screen mc-vector-lesson__terminal">
        <h1 id="mc-catalog-lesson-heading" ref={setFocusTarget} tabIndex={-1} className="mc-h1">
          Let’s pause here
        </h1>
        <div className="mc-vector-lesson__body">
          <p>This lesson needs a support step that isn’t ready yet. Your progress is saved.</p>
        </div>
        <Button variant="primary" size="lg" onClick={onReturn}>
          Back to curriculum
        </Button>
      </section>
    );
  }

  return (
    <section className="mc-vector-lesson__screen mc-vector-lesson__terminal">
      <h1 id="mc-catalog-lesson-heading" ref={setFocusTarget} tabIndex={-1} className="mc-h1">
        {COMPLETION_COPY}
      </h1>
      <Button variant="primary" size="lg" onClick={onReturn}>
        Back to curriculum
      </Button>
    </section>
  );
}

function QuestionScreen({
  screen,
  pending,
  setFocusTarget,
  onAction,
}: {
  screen: Extract<NormalizedLessonScreen, { kind: 'QUESTION' }>;
  pending: boolean;
  setFocusTarget: (element: HTMLElement | null) => void;
  onAction: (action: NormalizedLessonAction) => void;
}) {
  const [choice, setChoice] = useState<string | null>(null);
  const [text, setText] = useState('');
  const isMultipleChoice = screen.choices.length > 0;

  // A fresh question clears any prior selection/text so nothing leaks across items.
  useEffect(() => {
    setChoice(null);
    setText('');
  }, [screen.itemId]);

  const submitResponse = (event: FormEvent): void => {
    event.preventDefault();
    if (isMultipleChoice) {
      if (choice !== null) {
        onAction({
          type: 'SUBMIT_RESPONSE',
          response: { kind: 'MULTIPLE_CHOICE', choiceId: choice },
        });
      }
      return;
    }
    const trimmed = text.trim();
    onAction({
      type: 'SUBMIT_RESPONSE',
      response: { kind: 'SHORT', text: trimmed === '' ? null : trimmed },
    });
  };

  const canSubmit = isMultipleChoice ? choice !== null : text.trim() !== '';

  return (
    <section className="mc-vector-lesson__screen">
      <h1 id="mc-catalog-lesson-heading" ref={setFocusTarget} tabIndex={-1} className="mc-h1">
        {screen.heading}
      </h1>
      <form onSubmit={submitResponse}>
        <fieldset className="mc-vector-lesson__choices">
          <legend className="mc-vector-lesson__prompt">{screen.prompt}</legend>
          {isMultipleChoice ? (
            screen.choices.map((option) => (
              <label
                key={option.choiceId}
                className={`mc-vector-choice${choice === option.choiceId ? ' mc-vector-choice--selected' : ''}`}
              >
                <input
                  type="radio"
                  name="catalog-lesson-response"
                  value={option.choiceId}
                  checked={choice === option.choiceId}
                  onChange={() => setChoice(option.choiceId)}
                />
                <span className="mc-vector-choice__marker" aria-hidden="true">
                  {option.choiceId}
                </span>
                <span>{option.text}</span>
              </label>
            ))
          ) : (
            <input
              type="text"
              className="mc-input"
              name="catalog-lesson-response"
              value={text}
              onChange={(event) => setText(event.target.value)}
              aria-label="Your response"
              autoComplete="off"
            />
          )}
        </fieldset>

        <div className="mc-vector-lesson__actions">
          <Button type="submit" variant="primary" size="lg" disabled={!canSubmit || pending}>
            {pending ? 'Saving…' : 'Submit response'}
          </Button>
          <button
            type="button"
            className="mc-textbtn"
            disabled={pending}
            onClick={() =>
              onAction({
                type: 'SUBMIT_RESPONSE',
                response: isMultipleChoice
                  ? { kind: 'MULTIPLE_CHOICE', choiceId: null }
                  : { kind: 'SHORT', text: null },
              })
            }
          >
            Skip this response
          </button>
        </div>
      </form>
    </section>
  );
}
