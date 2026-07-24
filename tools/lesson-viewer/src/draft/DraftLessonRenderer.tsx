import { useEffect, useId, useMemo, useRef } from 'react';
import { useCanvasState } from 'cursor/canvas';

import type {
  DraftEntryCheck,
  DraftFigure,
  DraftLesson,
  DraftModelStep,
  DraftPracticeItem,
  DraftPreviewRoute,
  DraftQuestionContent,
  DraftQuestionEvaluation,
  DraftSvgShape,
  DraftTargetedRepair,
} from './contract';
import { DRAFT_PREVIEW_ROUTING_DISCLAIMER, simulateDraftPreviewRoute } from './preview-routing';

const RUNTIME_SCHEMA_VERSION = 1;
const RUNTIME_STORAGE_KEY = 'draft-runtime-v1';

type UnassignedRoute = 'unassigned';
type RuntimeRoute = DraftPreviewRoute | UnassignedRoute;

interface StoredResponse {
  readonly selectedOptionId: string;
  readonly submitted: boolean;
  readonly correct: boolean;
  readonly hintShown: boolean;
}

interface DraftRuntimeState {
  readonly schemaVersion: typeof RUNTIME_SCHEMA_VERSION;
  readonly contentVersion: string;
  readonly screenIndex: number;
  readonly paused: boolean;
  readonly route: RuntimeRoute;
  readonly responses: Readonly<Record<string, StoredResponse>>;
}

type QuestionStage = 'entry' | 'guided' | 'light' | 'solo' | 'near' | 'changed';

type DraftScreen =
  | {
      readonly id: string;
      readonly kind: 'question';
      readonly stage: QuestionStage;
      readonly item: DraftEntryCheck | DraftPracticeItem;
    }
  | { readonly id: string; readonly kind: 'orientation' }
  | { readonly id: string; readonly kind: 'model'; readonly step: DraftModelStep }
  | { readonly id: string; readonly kind: 'worked' }
  | {
      readonly id: string;
      readonly kind: 'repair';
      readonly repair: DraftTargetedRepair;
      readonly sourceQuestionId: string;
    }
  | { readonly id: string; readonly kind: 'recap' };

export interface DraftLessonRendererProps {
  readonly lesson: DraftLesson;
  readonly lessonIndexHref: string;
}

function makeInitialState(contentVersion: string): DraftRuntimeState {
  return {
    schemaVersion: RUNTIME_SCHEMA_VERSION,
    contentVersion,
    screenIndex: 0,
    paused: false,
    route: 'unassigned',
    responses: {},
  };
}

function isStoredResponse(value: unknown): value is StoredResponse {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<StoredResponse>;
  return (
    typeof candidate.selectedOptionId === 'string' &&
    typeof candidate.submitted === 'boolean' &&
    typeof candidate.correct === 'boolean' &&
    typeof candidate.hintShown === 'boolean'
  );
}

function isRuntimeState(value: unknown, contentVersion: string): value is DraftRuntimeState {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<DraftRuntimeState>;
  if (
    candidate.schemaVersion !== RUNTIME_SCHEMA_VERSION ||
    candidate.contentVersion !== contentVersion ||
    typeof candidate.screenIndex !== 'number' ||
    !Number.isInteger(candidate.screenIndex) ||
    candidate.screenIndex < 0 ||
    typeof candidate.paused !== 'boolean' ||
    !['unassigned', 'concise', 'standard', 'support'].includes(candidate.route ?? '') ||
    typeof candidate.responses !== 'object' ||
    candidate.responses === null
  ) {
    return false;
  }

  return Object.values(candidate.responses).every(isStoredResponse);
}

function routeIncludes(step: DraftModelStep, route: DraftPreviewRoute): boolean {
  return step.routes === 'all' || step.routes.includes(route);
}

function buildScreens(
  lesson: DraftLesson,
  route: RuntimeRoute,
  responses: Readonly<Record<string, StoredResponse>>,
): DraftScreen[] {
  const screens: DraftScreen[] = lesson.entryChecks.map((item) => ({
    id: `entry:${item.id}`,
    kind: 'question',
    stage: 'entry',
    item,
  }));
  const activeRoute = route === 'unassigned' ? 'standard' : route;
  const repairById = new Map(lesson.targetedRepairs.map((repair) => [repair.id, repair]));

  const appendQuestion = (stage: Exclude<QuestionStage, 'entry'>, item: DraftPracticeItem) => {
    screens.push({
      id: `${stage}:${item.id}`,
      kind: 'question',
      stage,
      item,
    });

    const response = responses[item.id];
    const repairId = item.evaluation.repairId;
    const repair = repairId === undefined ? undefined : repairById.get(repairId);
    if (response?.submitted === true && !response.correct && repair !== undefined) {
      screens.push({
        id: `repair:${item.id}:${repair.id}`,
        kind: 'repair',
        repair,
        sourceQuestionId: item.id,
      });
    }
  };

  screens.push({ id: 'orientation', kind: 'orientation' });
  lesson.modelSteps
    .filter((step) => routeIncludes(step, activeRoute))
    .forEach((step) => screens.push({ id: `model:${step.id}`, kind: 'model', step }));
  screens.push({ id: `worked:${lesson.workedExample.id}`, kind: 'worked' });

  lesson.practice.guided.forEach((item) => appendQuestion('guided', item));
  lesson.practice.light.forEach((item) => appendQuestion('light', item));
  lesson.practice.solo.forEach((item) => appendQuestion('solo', item));
  lesson.exits.near.forEach((item) => appendQuestion('near', item));
  lesson.exits.changed.forEach((item) => appendQuestion('changed', item));
  screens.push({ id: 'recap', kind: 'recap' });

  return screens;
}

function screenLabel(screen: DraftScreen): string {
  if (screen.kind === 'question') {
    const labels: Record<QuestionStage, string> = {
      entry: 'Starting check',
      guided: 'Guided practice',
      light: 'Less help',
      solo: 'On your own',
      near: 'Final check',
      changed: 'Final check',
    };
    return labels[screen.stage];
  }
  if (screen.kind === 'orientation' || screen.kind === 'repair') return 'Focus now';
  if (screen.kind === 'model' || screen.kind === 'worked') return 'Build the model';
  return 'Final check';
}

function screenTitle(screen: DraftScreen, lesson: DraftLesson): string {
  if (screen.kind === 'question') return screen.item.title;
  if (screen.kind === 'orientation') return lesson.orientation.title;
  if (screen.kind === 'model') return screen.step.title;
  if (screen.kind === 'worked') return lesson.workedExample.title;
  if (screen.kind === 'repair') return screen.repair.title;
  return lesson.recap.title;
}

function toneClass(tone: string | undefined): string {
  return `draft-figure-tone--${tone ?? 'primary'}`;
}

function SvgShape({ shape, markerId }: { shape: DraftSvgShape; markerId: string }) {
  const className = `draft-svg-shape ${toneClass(shape.tone)}${
    'filled' in shape && shape.filled ? ' draft-svg-shape--filled' : ''
  }`;

  switch (shape.kind) {
    case 'line':
      return (
        <line
          className={className}
          x1={shape.x1}
          y1={shape.y1}
          x2={shape.x2}
          y2={shape.y2}
          markerEnd={shape.arrowEnd ? `url(#${markerId})` : undefined}
        />
      );
    case 'rect':
      return (
        <rect
          className={className}
          x={shape.x}
          y={shape.y}
          width={shape.width}
          height={shape.height}
          rx={shape.radius ?? 0}
        />
      );
    case 'circle':
      return <circle className={className} cx={shape.cx} cy={shape.cy} r={shape.radius} />;
    case 'path':
      return <path className={className} d={shape.d} />;
    case 'text':
      return (
        <text
          className={`${className} draft-svg-text`}
          x={shape.x}
          y={shape.y}
          textAnchor={shape.anchor ?? 'start'}
          fontWeight={shape.weight === 'bold' ? 700 : 400}
        >
          {shape.text}
        </text>
      );
  }
}

function DraftFigureView({ figure }: { figure: DraftFigure }) {
  const rawId = useId();
  const figureId = `draft-figure-${rawId.replaceAll(':', '')}`;
  const markerId = `${figureId}-arrow`;

  if (figure.kind === 'flow') {
    return (
      <figure className="draft-figure">
        <div className="draft-flow" role="img" aria-label={figure.alt}>
          {figure.steps.map((step, index) => (
            <div className="draft-flow__unit" key={`${step.label}-${index}`} aria-hidden="true">
              <div className={`draft-flow__step ${toneClass(step.tone)}`}>
                <strong>{step.label}</strong>
                {step.detail === undefined ? null : <span>{step.detail}</span>}
              </div>
              {index < figure.steps.length - 1 ? (
                <span className="draft-flow__arrow" aria-hidden="true">
                  →
                </span>
              ) : null}
            </div>
          ))}
        </div>
        {figure.caption === undefined ? null : <figcaption>{figure.caption}</figcaption>}
      </figure>
    );
  }

  if (figure.kind === 'comparison') {
    return (
      <figure className="draft-figure">
        <div className="draft-comparison" role="img" aria-label={figure.alt}>
          {figure.items.map((item, index) => (
            <section
              className={`draft-comparison__item ${toneClass(item.tone)}`}
              key={`${item.heading}-${index}`}
              aria-hidden="true"
            >
              <strong>{item.heading}</strong>
              <ul>
                {item.lines.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </section>
          ))}
        </div>
        {figure.caption === undefined ? null : <figcaption>{figure.caption}</figcaption>}
      </figure>
    );
  }

  const titleId = `${figureId}-title`;
  return (
    <figure className="draft-figure">
      <svg
        className="draft-svg"
        viewBox={figure.viewBox.join(' ')}
        role="img"
        aria-labelledby={titleId}
      >
        <title id={titleId}>{figure.alt}</title>
        <defs>
          <marker
            id={markerId}
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="7"
            markerHeight="7"
            orient="auto-start-reverse"
          >
            <path className="draft-svg-arrowhead" d="M 0 0 L 10 5 L 0 10 z" />
          </marker>
        </defs>
        {figure.shapes.map((shape, index) => (
          <SvgShape shape={shape} markerId={markerId} key={`${shape.kind}-${index}`} />
        ))}
      </svg>
      {figure.caption === undefined ? null : <figcaption>{figure.caption}</figcaption>}
    </figure>
  );
}

function QuestionView({
  item,
  response,
  onSelect,
  onSubmit,
  onShowHint,
  routeNotice,
}: {
  item: DraftQuestionContent & { readonly evaluation: DraftQuestionEvaluation };
  response: StoredResponse | undefined;
  onSelect: (optionId: string) => void;
  onSubmit: () => void;
  onShowHint: () => void;
  routeNotice?: DraftPreviewRoute;
}) {
  const promptId = useId();
  const contextId = `${promptId}-context`;
  const selectedOptionId = response?.selectedOptionId;
  const submitted = response?.submitted ?? false;
  const feedback =
    submitted && selectedOptionId !== undefined
      ? item.evaluation.feedbackByOption[selectedOptionId]
      : undefined;

  return (
    <div className="draft-question">
      {item.context === undefined ? null : (
        <div className="draft-question__context" id={contextId}>
          {item.context}
        </div>
      )}

      <fieldset
        className="draft-options"
        aria-describedby={item.context === undefined ? undefined : contextId}
      >
        <legend id={promptId}>{item.prompt}</legend>
        {item.options.map((option) => (
          <label
            className={`draft-option${
              selectedOptionId === option.id ? ' draft-option--selected' : ''
            }`}
            key={option.id}
          >
            <input
              type="radio"
              name={item.id}
              value={option.id}
              checked={selectedOptionId === option.id}
              disabled={submitted}
              onChange={() => onSelect(option.id)}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </fieldset>

      {!submitted && item.hint !== undefined ? (
        response?.hintShown ? (
          <aside className="draft-hint" role="status">
            <strong>Hint</strong>
            <span>{item.hint}</span>
          </aside>
        ) : (
          <button type="button" className="draft-text-button" onClick={onShowHint}>
            Show a hint
          </button>
        )
      ) : null}

      {!submitted ? (
        <button
          type="button"
          className="draft-button draft-button--primary"
          disabled={selectedOptionId === undefined || selectedOptionId === ''}
          onClick={onSubmit}
        >
          Check answer
        </button>
      ) : (
        <div
          className={`draft-feedback ${
            response?.correct ? 'draft-feedback--correct' : 'draft-feedback--repair'
          }`}
          role="status"
          aria-live="polite"
        >
          <strong>
            {response?.correct ? 'That reasoning works.' : 'Pause and adjust the model.'}
          </strong>
          {feedback === undefined ? null : <p>{feedback}</p>}
          <p>{item.evaluation.explanation}</p>
        </div>
      )}

      {routeNotice === undefined ? null : (
        <aside className="draft-route-notice">
          <strong>{`Preview path: ${routeNotice}`}</strong>
          <span>{DRAFT_PREVIEW_ROUTING_DISCLAIMER}</span>
        </aside>
      )}
    </div>
  );
}

function OrientationView({ lesson, route }: { lesson: DraftLesson; route: DraftPreviewRoute }) {
  return (
    <div className="draft-reading">
      {lesson.orientation.plainLanguage.map((paragraph) => (
        <p key={paragraph}>{paragraph}</p>
      ))}
      <aside className="draft-focus-box">
        <strong>Question to keep in view</strong>
        <span>{lesson.orientation.focusQuestion}</span>
      </aside>
      <p className="draft-path-note">{lesson.orientation.previewPathNotes[route]}</p>
    </div>
  );
}

function ModelView({ step }: { step: DraftModelStep }) {
  return (
    <div className="draft-reading">
      {step.explanation.map((paragraph) => (
        <p key={paragraph}>{paragraph}</p>
      ))}
      {step.figure === undefined ? null : <DraftFigureView figure={step.figure} />}
      <aside className="draft-takeaway">
        <strong>Keep this</strong>
        <span>{step.takeaway}</span>
      </aside>
    </div>
  );
}

function WorkedExampleView({ lesson }: { lesson: DraftLesson }) {
  const example = lesson.workedExample;
  return (
    <div className="draft-reading">
      <p className="draft-worked-setup">{example.setup}</p>
      {example.figure === undefined ? null : <DraftFigureView figure={example.figure} />}
      <ol className="draft-reasoning-steps">
        {example.steps.map((step) => (
          <li key={step.label}>
            <strong>{step.label}</strong>
            <span>{step.reasoning}</span>
          </li>
        ))}
      </ol>
      <aside className="draft-takeaway">
        <strong>Conclusion</strong>
        <span>{example.conclusion}</span>
      </aside>
    </div>
  );
}

function RepairView({ repair }: { repair: DraftTargetedRepair }) {
  return (
    <div className="draft-reading">
      {repair.explanation.map((paragraph) => (
        <p key={paragraph}>{paragraph}</p>
      ))}
      {repair.figure === undefined ? null : <DraftFigureView figure={repair.figure} />}
      <aside className="draft-focus-box">
        <strong>Use this strategy</strong>
        <span>{repair.strategy}</span>
      </aside>
      <p className="draft-check-thinking">
        <strong>Check your thinking: </strong>
        {repair.checkYourThinking}
      </p>
    </div>
  );
}

function RecapView({ lesson }: { lesson: DraftLesson }) {
  return (
    <div className="draft-reading">
      <p>{lesson.recap.summary}</p>
      <ul className="draft-recap-list">
        {lesson.recap.takeaways.map((takeaway) => (
          <li key={takeaway}>{takeaway}</li>
        ))}
      </ul>
      <aside className="draft-takeaway">
        <strong>Next step</strong>
        <span>{lesson.recap.nextStep}</span>
      </aside>
      <p className="draft-preview-caveat">
        This preview is for visual and content authoring only. It does not record mastery.
      </p>
    </div>
  );
}

export function DraftLessonRenderer({ lesson, lessonIndexHref }: DraftLessonRendererProps) {
  const initialState = useMemo(
    () => makeInitialState(lesson.metadata.contentVersion),
    [lesson.metadata.contentVersion],
  );
  const [persistedState, setPersistedState] = useCanvasState<unknown>(
    RUNTIME_STORAGE_KEY,
    initialState,
  );
  const validPersistedState = isRuntimeState(persistedState, lesson.metadata.contentVersion);
  const state = validPersistedState ? persistedState : initialState;

  useEffect(() => {
    if (!validPersistedState) setPersistedState(initialState);
  }, [initialState, setPersistedState, validPersistedState]);

  const updateState = (update: (current: DraftRuntimeState) => DraftRuntimeState) => {
    setPersistedState((current: unknown) =>
      update(isRuntimeState(current, lesson.metadata.contentVersion) ? current : initialState),
    );
  };

  const screens = useMemo(
    () => buildScreens(lesson, state.route, state.responses),
    [lesson, state.responses, state.route],
  );
  const currentIndex = Math.min(state.screenIndex, Math.max(0, screens.length - 1));
  const current = screens[currentIndex];
  const headingRef = useRef<HTMLHeadingElement>(null);
  const headingId = useId();

  useEffect(() => {
    if (state.screenIndex !== currentIndex) {
      updateState((currentState) => ({ ...currentState, screenIndex: currentIndex }));
    }
  }, [currentIndex, state.screenIndex]);

  useEffect(() => {
    headingRef.current?.focus();
  }, [current?.id]);

  if (current === undefined) return null;

  const setResponse = (itemId: string, response: StoredResponse) => {
    updateState((currentState) => ({
      ...currentState,
      responses: { ...currentState.responses, [itemId]: response },
    }));
  };

  const selectOption = (item: DraftEntryCheck | DraftPracticeItem, optionId: string) => {
    const existing = state.responses[item.id];
    if (existing?.submitted) return;
    setResponse(item.id, {
      selectedOptionId: optionId,
      submitted: false,
      correct: false,
      hintShown: existing?.hintShown ?? false,
    });
  };

  const showHint = (item: DraftEntryCheck | DraftPracticeItem) => {
    const existing = state.responses[item.id];
    if (existing?.submitted) return;
    setResponse(item.id, {
      selectedOptionId: existing?.selectedOptionId ?? '',
      submitted: false,
      correct: false,
      hintShown: true,
    });
  };

  const submitResponse = (item: DraftEntryCheck | DraftPracticeItem) => {
    const existing = state.responses[item.id];
    if (existing === undefined || existing.selectedOptionId === '' || existing.submitted) return;

    updateState((currentState) => {
      const nextResponse: StoredResponse = {
        ...existing,
        submitted: true,
        correct: existing.selectedOptionId === item.evaluation.correctOptionId,
      };
      const nextResponses = { ...currentState.responses, [item.id]: nextResponse };
      const allEntryChecksSubmitted = lesson.entryChecks.every(
        (check) => nextResponses[check.id]?.submitted === true,
      );
      const selectedEntryOptions = Object.fromEntries(
        lesson.entryChecks.map((check) => [check.id, nextResponses[check.id]?.selectedOptionId]),
      );

      return {
        ...currentState,
        responses: nextResponses,
        route: allEntryChecksSubmitted
          ? simulateDraftPreviewRoute(lesson.entryChecks, selectedEntryOptions)
          : currentState.route,
      };
    });
  };

  const goBack = () => {
    updateState((currentState) => ({
      ...currentState,
      screenIndex: Math.max(0, currentIndex - 1),
    }));
  };
  const goNext = () => {
    updateState((currentState) => ({
      ...currentState,
      screenIndex: Math.min(screens.length - 1, currentIndex + 1),
    }));
  };
  const reset = () => setPersistedState(initialState);
  const activeRoute: DraftPreviewRoute = state.route === 'unassigned' ? 'standard' : state.route;
  const currentResponse =
    current.kind === 'question' ? state.responses[current.item.id] : undefined;
  const canContinue = current.kind !== 'question' || currentResponse?.submitted === true;
  const finalEntryId = lesson.entryChecks[lesson.entryChecks.length - 1]?.id;
  const routeNotice =
    current.kind === 'question' &&
    current.stage === 'entry' &&
    current.item.id === finalEntryId &&
    state.route !== 'unassigned'
      ? state.route
      : undefined;
  const progressPercent = Math.round(((currentIndex + 1) / screens.length) * 100);

  if (state.paused) {
    return (
      <section className="draft-paused" aria-labelledby={`${headingId}-paused`}>
        <p className="draft-stage-label">Paused</p>
        <h1 id={`${headingId}-paused`}>Your place is saved on this device.</h1>
        <p>
          Resume when you are ready, or reset this local preview to inspect the opening experience
          again.
        </p>
        <div className="draft-paused__actions">
          <button
            type="button"
            className="draft-button draft-button--primary"
            onClick={() => updateState((currentState) => ({ ...currentState, paused: false }))}
          >
            Resume
          </button>
          <button type="button" className="draft-button" onClick={reset}>
            Reset preview
          </button>
        </div>
      </section>
    );
  }

  return (
    <article className="draft-lesson" aria-labelledby={headingId}>
      {currentIndex === 0 ? (
        <p className="draft-preview-caveat">
          Internal-only preview: answers ship in the client bundle even though they stay out of the
          learner page until submission. This is not a production-safe delivery path.
        </p>
      ) : null}
      <div className="draft-progress">
        <div className="draft-progress__labels">
          <span className="draft-stage-label" aria-live="polite">
            {screenLabel(current)}
          </span>
          <span>{`Step ${currentIndex + 1} of ${screens.length}`}</span>
        </div>
        <div
          className="draft-progress__track"
          role="progressbar"
          aria-label="Lesson progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progressPercent}
          aria-valuetext={`Step ${currentIndex + 1} of ${screens.length}`}
        >
          <span style={{ width: `${progressPercent}%` }} />
        </div>
      </div>

      <section className="draft-screen">
        <header className="draft-screen__header">
          <h1 id={headingId} ref={headingRef} tabIndex={-1}>
            {screenTitle(current, lesson)}
          </h1>
        </header>

        {current.kind === 'question' ? (
          <QuestionView
            item={current.item}
            response={currentResponse}
            onSelect={(optionId) => selectOption(current.item, optionId)}
            onSubmit={() => submitResponse(current.item)}
            onShowHint={() => showHint(current.item)}
            routeNotice={routeNotice}
          />
        ) : null}
        {current.kind === 'orientation' ? (
          <OrientationView lesson={lesson} route={activeRoute} />
        ) : null}
        {current.kind === 'model' ? <ModelView step={current.step} /> : null}
        {current.kind === 'worked' ? <WorkedExampleView lesson={lesson} /> : null}
        {current.kind === 'repair' ? <RepairView repair={current.repair} /> : null}
        {current.kind === 'recap' ? <RecapView lesson={lesson} /> : null}
      </section>

      <nav className="draft-navigation" aria-label="Lesson controls">
        <button
          type="button"
          className="draft-button"
          disabled={currentIndex === 0}
          onClick={goBack}
        >
          Back
        </button>
        <button
          type="button"
          className="draft-text-button"
          onClick={() => updateState((currentState) => ({ ...currentState, paused: true }))}
        >
          Pause
        </button>
        <button type="button" className="draft-text-button" onClick={reset}>
          Reset
        </button>
        {current.kind === 'recap' ? (
          <a className="draft-button draft-button--primary" href={lessonIndexHref}>
            Return to lessons
          </a>
        ) : (
          <button
            type="button"
            className="draft-button draft-button--primary draft-navigation__next"
            disabled={!canContinue}
            onClick={goNext}
          >
            Next
          </button>
        )}
      </nav>
    </article>
  );
}
