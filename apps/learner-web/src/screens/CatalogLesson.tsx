import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { NormalizedLessonAction, NormalizedLessonScreen } from '@mcat/contracts';
import { Button, Callout } from '@mcat/ui-web';
import {
  useNormalizedLessonRun,
  useNormalizedLessonStatus,
  useStartNormalizedLesson,
  useSubmitNormalizedLessonAction,
} from '../app/queries';
import { useRecordPlanActivity } from '../app/today-queries';
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
type FeedbackOutcome = Extract<NormalizedLessonScreen, { kind: 'FEEDBACK' }>['outcome'];
const FEEDBACK_HEADINGS: Record<FeedbackOutcome, string> = {
  CORRECT: 'Correct',
  INCORRECT: 'Not quite',
  OMITTED: 'Response skipped',
  INVALID: 'Check your response',
};

export function CatalogLesson({ lessonId }: { lessonId: string }) {
  const navigate = useNavigate();
  const location = useLocation();
  const recordPlan = useRecordPlanActivity();
  // Today's Path launches a lesson with a return target + the plan activity id, so
  // finishing it advances the plan; opened straight from the Curriculum, both are absent.
  const navState = location.state as { returnTo?: string; activityId?: string } | null;
  const returnTo = navState?.returnTo;
  const planActivityId = navState?.activityId;
  const fromPlan = Boolean(returnTo && planActivityId);
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

  // The canonical wire has no public screen token. A stable serialization moves
  // focus for every real screen change while avoiding refocus on an identical
  // authoritative refetch (including consecutive screens of the same kind).
  const screenKey = view === undefined ? undefined : JSON.stringify(view.screen);
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

  // A lesson launched from Today's Path advances the plan when it finishes: mark the plan
  // activity complete the moment the run reaches COMPLETE (once), regardless of how the
  // learner then leaves the screen. Opened straight from the Curriculum (no plan activity
  // id), this is a no-op.
  const planCompletionRecorded = useRef(false);
  useEffect(() => {
    if (view?.screen.kind !== 'COMPLETE' || !planActivityId || planCompletionRecorded.current) {
      return;
    }
    planCompletionRecorded.current = true;
    recordPlan.mutate({ activityId: planActivityId, status: 'complete' });
  }, [view, planActivityId, recordPlan]);

  // Return to the plan when launched from Today's Path, else the curriculum. Completion is
  // recorded by the effect above, so pausing or leaving a lesson never marks it done.
  const backToCurriculum = (): void => navigate(returnTo ?? '/app/curriculum');
  const retryRestore = (): void => {
    if (runState === 'NOT_STARTED' && start.isError) {
      start.mutate();
      return;
    }
    void status.refetch();
    if (runEnabled) void run.refetch();
  };

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

  if (status.isError || start.isError || run.isError || !view) {
    return (
      <div className="mc-vector-lesson mc-vector-lesson--state">
        <Callout tone="warning" title="The lesson could not be restored">
          Your saved checkpoint has not been changed. Try loading it again.
        </Callout>
        <div className="mc-vector-lesson__state-actions">
          <Button variant="primary" onClick={retryRestore}>
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

  const restart = (): void => {
    // A blocked run is a spent dead-end; starting again begins a fresh attempt (the server
    // discards the blocked run and re-starts on the active revision). Guard the auto-start
    // effect and refetch both reads so the fresh run renders immediately.
    startAttempted.current = true;
    start.mutate(undefined, {
      onSuccess: () => {
        void status.refetch();
        void run.refetch();
      },
    });
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
      <span className="mc-visually-hidden" aria-live="polite" aria-atomic="true">
        {submit.isPending ? 'Saving your lesson checkpoint.' : ''}
      </span>

      <CatalogLessonScreen
        screen={view.screen}
        pending={submit.isPending}
        restarting={start.isPending}
        fromPlan={fromPlan}
        focusTargetRef={focusTargetRef}
        onAction={send}
        onReturn={backToCurriculum}
        onRestart={restart}
      />
    </article>
  );
}

function CatalogLessonScreen({
  screen,
  pending,
  restarting,
  fromPlan,
  focusTargetRef,
  onAction,
  onReturn,
  onRestart,
}: {
  screen: NormalizedLessonScreen;
  pending: boolean;
  restarting: boolean;
  fromPlan: boolean;
  focusTargetRef: React.MutableRefObject<HTMLElement | null>;
  onAction: (action: NormalizedLessonAction) => void;
  onReturn: () => void;
  onRestart: () => void;
}) {
  const returnLabel = fromPlan ? 'Back to plan' : 'Back to curriculum';
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
          {screen.contentBlocks.map((block, index) => (
            <p key={`${index}-${block.slice(0, 16)}`}>{block}</p>
          ))}
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
        key={screen.itemId}
        screen={screen}
        pending={pending}
        setFocusTarget={setFocusTarget}
        onAction={onAction}
      />
    );
  }

  if (screen.kind === 'FEEDBACK') {
    const heading = FEEDBACK_HEADINGS[screen.outcome];
    return (
      <section className="mc-vector-lesson__screen mc-vector-lesson__feedback">
        <h1
          id="mc-catalog-lesson-heading"
          ref={setFocusTarget}
          tabIndex={-1}
          className={`mc-h1 ${
            screen.outcome === 'CORRECT' ? 'mc-reveal__key--ok' : 'mc-reveal__key--wrong'
          }`}
        >
          {heading}
        </h1>
        <div className="mc-vector-lesson__body" role="status" aria-atomic="true">
          <p>{screen.message}</p>
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

  if (screen.kind === 'BLOCKED') {
    return (
      <section className="mc-vector-lesson__screen mc-vector-lesson__terminal">
        <h1 id="mc-catalog-lesson-heading" ref={setFocusTarget} tabIndex={-1} className="mc-h1">
          Let’s pause here
        </h1>
        <div className="mc-vector-lesson__body">
          <p>You can restart this lesson to try it again, or come back to it later.</p>
        </div>
        <div className="mc-vector-lesson__state-actions">
          <Button variant="primary" size="lg" disabled={restarting} onClick={onRestart}>
            {restarting ? 'Restarting…' : 'Restart lesson'}
          </Button>
          <Button variant="secondary" size="lg" onClick={onReturn}>
            {returnLabel}
          </Button>
        </div>
      </section>
    );
  }

  return (
    <section className="mc-vector-lesson__screen mc-vector-lesson__terminal">
      <h1 id="mc-catalog-lesson-heading" ref={setFocusTarget} tabIndex={-1} className="mc-h1">
        {COMPLETION_COPY}
      </h1>
      <Button variant="primary" size="lg" onClick={onReturn}>
        {returnLabel}
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
  const controlId = useId();
  const [choice, setChoice] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [fieldValues, setFieldValues] = useState<string[]>(() =>
    screen.control.kind === 'STRUCTURED_FIELDS' ? screen.control.fields.map(() => '') : [],
  );

  const submitResponse = (event: FormEvent): void => {
    event.preventDefault();
    if (screen.control.kind === 'SINGLE_SELECT') {
      if (choice !== null) {
        onAction({
          type: 'SUBMIT_RESPONSE',
          response: { kind: 'MULTIPLE_CHOICE', choiceId: choice },
        });
      }
      return;
    }
    if (screen.control.kind === 'SHORT_TEXT') {
      const normalized = text.trim().replace(/\s+/g, ' ');
      onAction({
        type: 'SUBMIT_RESPONSE',
        response: { kind: 'SHORT', text: normalized === '' ? null : normalized },
      });
      return;
    }
    onAction({
      type: 'SUBMIT_RESPONSE',
      response: {
        kind: 'CONSTRUCTED',
        fields: screen.control.fields.map(({ fieldId }, index) => {
          const trimmed = fieldValues[index]?.trim() ?? '';
          return { fieldId, value: trimmed === '' ? null : trimmed };
        }),
      },
    });
  };

  const skipResponse = (): void => {
    if (screen.control.kind === 'SINGLE_SELECT') {
      onAction({
        type: 'SUBMIT_RESPONSE',
        response: { kind: 'MULTIPLE_CHOICE', choiceId: null },
      });
      return;
    }
    if (screen.control.kind === 'SHORT_TEXT') {
      onAction({ type: 'SUBMIT_RESPONSE', response: { kind: 'SHORT', text: null } });
      return;
    }
    onAction({
      type: 'SUBMIT_RESPONSE',
      response: {
        kind: 'CONSTRUCTED',
        fields: screen.control.fields.map(({ fieldId }) => ({ fieldId, value: null })),
      },
    });
  };

  const canSubmit =
    screen.control.kind === 'SINGLE_SELECT'
      ? choice !== null
      : screen.control.kind === 'SHORT_TEXT'
        ? text.trim() !== ''
        : screen.control.fields.every((_, index) => fieldValues[index]?.trim() !== '');

  return (
    <section className="mc-vector-lesson__screen">
      <h1 id="mc-catalog-lesson-heading" ref={setFocusTarget} tabIndex={-1} className="mc-h1">
        {screen.heading}
      </h1>
      {screen.contentBlocks.length > 0 ? (
        <div className="mc-vector-lesson__body">
          {screen.contentBlocks.map((block, index) => (
            <p key={`${index}-${block.slice(0, 16)}`}>{block}</p>
          ))}
        </div>
      ) : null}
      <form onSubmit={submitResponse}>
        <fieldset className="mc-vector-lesson__choices">
          <legend className="mc-vector-lesson__prompt">{screen.prompt}</legend>
          {screen.control.kind === 'SINGLE_SELECT' ? (
            screen.control.choices.map((option, index) => {
              const optionId = `${controlId}-choice-${index}`;
              return (
                <label
                  key={option.choiceId}
                  htmlFor={optionId}
                  className={`mc-vector-choice${choice === option.choiceId ? ' mc-vector-choice--selected' : ''}`}
                >
                  <input
                    id={optionId}
                    type="radio"
                    name="catalog-lesson-response"
                    value={option.choiceId}
                    checked={choice === option.choiceId}
                    onChange={() => setChoice(option.choiceId)}
                  />
                  <span className="mc-vector-choice__marker" aria-hidden="true">
                    {index + 1}
                  </span>
                  <span>{option.text}</span>
                </label>
              );
            })
          ) : screen.control.kind === 'SHORT_TEXT' ? (
            <div className="mc-vector-lesson__field">
              <label className="mc-label" htmlFor={`${controlId}-text`}>
                Your response
              </label>
              <input
                id={`${controlId}-text`}
                type="text"
                className="mc-input"
                name="catalog-lesson-response"
                value={text}
                onChange={(event) => setText(event.target.value)}
                aria-describedby={`${controlId}-convention`}
                autoComplete="off"
              />
              <p id={`${controlId}-convention`} className="mc-vector-lesson__convention">
                Use the authored wording and capitalization. Extra spaces are normalized.
              </p>
            </div>
          ) : (
            <div className="mc-vector-lesson__fields">
              {screen.control.fields.map((field, index) => {
                const fieldId = `${controlId}-field-${index}`;
                return (
                  <div key={field.fieldId} className="mc-vector-lesson__field">
                    <label className="mc-label" htmlFor={fieldId}>
                      {field.label || `Response ${index + 1}`}
                    </label>
                    <input
                      id={fieldId}
                      type="text"
                      className="mc-input"
                      name={field.fieldId}
                      value={fieldValues[index] ?? ''}
                      onChange={(event) => {
                        const nextValue = event.target.value;
                        setFieldValues((current) =>
                          current.map((value, valueIndex) =>
                            valueIndex === index ? nextValue : value,
                          ),
                        );
                      }}
                      autoComplete="off"
                    />
                  </div>
                );
              })}
            </div>
          )}
        </fieldset>

        <div className="mc-vector-lesson__actions">
          <Button type="submit" variant="primary" size="lg" disabled={!canSubmit || pending}>
            {pending ? 'Saving…' : 'Submit response'}
          </Button>
          <button type="button" className="mc-textbtn" disabled={pending} onClick={skipResponse}>
            Skip this response
          </button>
        </div>
      </form>
    </section>
  );
}
