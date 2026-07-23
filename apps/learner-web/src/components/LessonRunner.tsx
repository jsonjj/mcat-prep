import { useEffect, useId, useRef, useState, type RefObject } from 'react';
import type {
  LearnerLessonActivity,
  LearnerLessonRepresentation,
  LessonActionInput,
  LessonActivityResponseInput,
  LessonStepView,
} from '@mcat/contracts';
import { Button, Callout, Card, Eyebrow, Stack } from '@mcat/ui-web';

export interface LessonRunnerProps {
  step: LessonStepView;
  pending?: boolean;
  onAction: (action: LessonActionInput) => Promise<void>;
}

const PHASE_LABELS: Record<LearnerLessonActivity['phase'], string> = {
  enter_routing: 'Entry check',
  orient_elicit: 'Orient and elicit',
  build_model: 'Build the model',
  show_expert_decisions: 'Expert decisions',
  completion: 'Completion practice',
  contrast_bound: 'Contrast and bound',
  exit_near: 'Fresh near-use check',
  exit_changed: 'Fresh changed-task check',
  targeted_repair: 'Targeted repair',
  handoff: 'Handoff',
};

/**
 * Tracks network presentation attempts independently from React rendering.
 * A key becomes successful only after the mutation resolves; a failed key
 * remains manually retryable with the same command identity in client-core.
 */
export class PresentationAttemptRegistry {
  private successfulKey: string | null = null;
  private failedKey: string | null = null;
  private inFlightKey: string | null = null;

  shouldAutoAttempt(key: string): boolean {
    return this.successfulKey !== key && this.failedKey !== key && this.inFlightKey !== key;
  }

  async attempt(key: string, mutation: () => Promise<void>, forceRetry = false): Promise<boolean> {
    if (
      this.inFlightKey === key ||
      this.successfulKey === key ||
      (!forceRetry && this.failedKey === key)
    ) {
      return false;
    }
    this.inFlightKey = key;
    try {
      await mutation();
      this.successfulKey = key;
      this.failedKey = null;
      return true;
    } catch (error) {
      this.failedKey = key;
      throw error;
    } finally {
      if (this.inFlightKey === key) this.inFlightKey = null;
    }
  }
}

export function LessonRunner({ step, pending = false, onAction }: LessonRunnerProps) {
  const presentationRegistry = useRef(new PresentationAttemptRegistry());
  const headingRef = useRef<HTMLHeadingElement>(null);
  const previousTransition = useRef<string | null>(null);
  const [presentationError, setPresentationError] = useState<string | null>(null);
  const [presenting, setPresenting] = useState(false);
  const activity = 'activity' in step ? step.activity : null;
  const activityId = activity?.id ?? null;
  const shouldPresent =
    step.status === 'active' && activity !== null && step.availableActions.includes('present');
  const presentationKey =
    shouldPresent && activityId !== null ? `${step.runId}:${step.runVersion}:${activityId}` : null;
  const transitionKey = `${step.runId}:${step.runVersion}:${step.status}:${activityId ?? step.kcId ?? 'none'}`;

  const attemptPresentation = async (forceRetry: boolean): Promise<void> => {
    if (presentationKey === null || activityId === null) return;
    setPresentationError(null);
    setPresenting(true);
    try {
      await presentationRegistry.current.attempt(
        presentationKey,
        () => onAction({ type: 'present', activityId }),
        forceRetry,
      );
    } catch {
      setPresentationError(
        'The activity could not be opened. Your checkpoint is unchanged; retry when ready.',
      );
    } finally {
      setPresenting(false);
    }
  };

  useEffect(() => {
    if (
      presentationKey === null ||
      pending ||
      !presentationRegistry.current.shouldAutoAttempt(presentationKey)
    ) {
      return;
    }
    void attemptPresentation(false);
  }, [pending, presentationKey]);

  useEffect(() => {
    if (previousTransition.current !== null && previousTransition.current !== transitionKey) {
      headingRef.current?.focus({ preventScroll: true });
    }
    previousTransition.current = transitionKey;
  }, [transitionKey]);

  return (
    <div className="mc-screen mc-study mc-lesson-runner">
      <header className="mc-lesson-runner__header">
        <Eyebrow>V3 lesson · instructional progress</Eyebrow>
        <h1 className="mc-h1">{step.lessonTitle}</h1>
        <label className="mc-fineprint" htmlFor="lesson-kc-progress">
          {`${step.progress.exitedKcCount} of ${step.progress.kcCount} knowledge components exited`}
          {step.kcTitle && step.progress.kcOrdinal !== null
            ? ` · Current ${step.progress.kcOrdinal} of ${step.progress.kcCount}: ${step.kcTitle}`
            : ''}
        </label>
        <progress
          id="lesson-kc-progress"
          className="mc-lesson-runner__progress"
          max={step.progress.kcCount}
          value={step.progress.exitedKcCount}
        />
      </header>

      {step.groupedFeedback ? (
        <FeedbackEntries
          entries={step.groupedFeedback.entries}
          label={step.groupedFeedback.kind === 'entry' ? 'Entry feedback' : 'Paired exit feedback'}
        />
      ) : null}

      {presentationError && presentationKey !== null ? (
        <Callout tone="danger" title="Activity could not load">
          <Stack gap={2}>
            <p>{presentationError}</p>
            <Button
              variant="secondary"
              disabled={pending || presenting}
              onClick={() => void attemptPresentation(true)}
            >
              Retry opening activity
            </Button>
          </Stack>
        </Callout>
      ) : null}

      {step.status === 'active' ? (
        <ActiveActivity
          activity={step.activity}
          availableActions={step.availableActions}
          pending={pending || presenting}
          headingRef={headingRef}
          onAction={onAction}
        />
      ) : null}

      {step.status === 'planner_resolution_required' ||
      step.status === 'blocked_for_predecessor' ||
      step.status === 'feedback_pending' ||
      step.status === 'repair_pending' ||
      step.status === 'reentry_pending' ? (
        <WaitingStep step={step} pending={pending} headingRef={headingRef} onAction={onAction} />
      ) : null}

      {step.status === 'paused' ? (
        <Card elevated>
          <Stack gap={3}>
            <h2 ref={headingRef} tabIndex={-1} className="mc-h3">
              {step.plannerReentryRequired ? 'Planner reentry needed' : 'Lesson paused'}
            </h2>
            <p>{step.message}</p>
            {step.availableActions.includes('resume') ? (
              <Button
                variant="primary"
                size="lg"
                disabled={pending}
                onClick={() => void onAction({ type: 'resume' })}
              >
                Resume exact checkpoint
              </Button>
            ) : null}
          </Stack>
        </Card>
      ) : null}

      {step.status === 'complete' ? (
        <Card elevated role="status">
          <h2 ref={headingRef} tabIndex={-1} className="mc-h3">
            Lesson complete
          </h2>
          <p>{step.message} Lesson completion records instructional exits only.</p>
        </Card>
      ) : null}

      {step.status === 'handoff' ? (
        <Card elevated role="status">
          <h2 ref={headingRef} tabIndex={-1} className="mc-h3">
            Returning to your plan
          </h2>
          <p>{step.message}</p>
        </Card>
      ) : null}

      {step.status === 'invalid_content' || step.status === 'blocked' ? (
        <Card elevated role="alert">
          <h2 ref={headingRef} tabIndex={-1} className="mc-h3">
            Lesson unavailable
          </h2>
          <p>{step.message}</p>
        </Card>
      ) : null}
    </div>
  );
}

function WaitingStep({
  step,
  pending,
  headingRef,
  onAction,
}: {
  step: Extract<
    LessonStepView,
    {
      status:
        | 'planner_resolution_required'
        | 'blocked_for_predecessor'
        | 'feedback_pending'
        | 'repair_pending'
        | 'reentry_pending';
    }
  >;
  pending: boolean;
  headingRef: RefObject<HTMLHeadingElement>;
  onAction: (action: LessonActionInput) => Promise<void>;
}) {
  const title =
    step.status === 'planner_resolution_required'
      ? 'Planner instruction required'
      : step.status === 'blocked_for_predecessor'
        ? 'Predecessor support required'
        : step.status === 'reentry_pending'
          ? 'Resuming exact repair point'
          : step.status === 'repair_pending'
            ? 'Repair ready'
            : 'Feedback ready';
  return (
    <Card elevated>
      <Stack gap={3}>
        <h2 ref={headingRef} tabIndex={-1} className="mc-h3">
          {title}
        </h2>
        <p>{step.message}</p>
        {step.availableActions.includes('continue') ? (
          <Button
            variant="primary"
            size="lg"
            disabled={pending}
            onClick={() =>
              void onAction({ type: 'continue', activityId: step.activity?.id ?? null })
            }
          >
            Continue
          </Button>
        ) : null}
        {step.availableActions.includes('pause') ? (
          <Button
            variant="text"
            disabled={pending}
            onClick={() => void onAction({ type: 'pause' })}
          >
            Pause lesson
          </Button>
        ) : null}
      </Stack>
    </Card>
  );
}

function ActiveActivity({
  activity,
  availableActions,
  pending,
  headingRef,
  onAction,
}: {
  activity: LearnerLessonActivity;
  availableActions: LessonStepView['availableActions'];
  pending: boolean;
  headingRef: RefObject<HTMLHeadingElement>;
  onAction: (action: LessonActionInput) => Promise<void>;
}) {
  const [choiceId, setChoiceId] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [numericValue, setNumericValue] = useState('');
  const [unit, setUnit] = useState('');
  const [orderedSteps, setOrderedSteps] = useState('');
  const [notSure, setNotSure] = useState(false);

  useEffect(() => {
    setChoiceId(null);
    setText('');
    setNumericValue('');
    setUnit('');
    setOrderedSteps('');
    setNotSure(false);
  }, [activity.id]);

  const parsedNumber = Number(numericValue);
  const stepLines = orderedSteps
    .split('\n')
    .map((step) => step.trim())
    .filter(Boolean);
  const canSubmit =
    availableActions.includes('submit_response') &&
    (notSure ||
      (activity.response.kind === 'choice' && choiceId !== null) ||
      (activity.response.kind === 'text' && text.trim().length > 0) ||
      (activity.response.kind === 'numeric' &&
        numericValue.trim().length > 0 &&
        Number.isFinite(parsedNumber)) ||
      (activity.response.kind === 'ordered_steps' &&
        stepLines.length >= activity.response.minimumSteps &&
        stepLines.length <= activity.response.maximumSteps));

  const submit = () => {
    let response: LessonActivityResponseInput;
    if (notSure) response = { kind: 'not_sure' };
    else if (activity.response.kind === 'choice' && choiceId !== null) {
      response = { kind: 'choice', choiceId };
    } else if (activity.response.kind === 'text' && text.trim().length > 0) {
      response = { kind: 'text', text: text.trim() };
    } else if (
      activity.response.kind === 'numeric' &&
      numericValue.trim().length > 0 &&
      Number.isFinite(parsedNumber)
    ) {
      response = { kind: 'numeric', value: parsedNumber, unit: unit.trim() || null };
    } else if (activity.response.kind === 'ordered_steps' && stepLines.length > 0) {
      response = { kind: 'ordered_steps', steps: stepLines };
    } else return;
    void onAction({
      type: 'submit_response',
      activityId: activity.id,
      response,
      elapsedMs: null,
    });
  };

  return (
    <>
      <section aria-labelledby={`activity-${activity.id}`}>
        <Eyebrow>
          {PHASE_LABELS[activity.phase]} · support {activity.assistance.currentLevel}
        </Eyebrow>
        <h2 ref={headingRef} tabIndex={-1} id={`activity-${activity.id}`} className="mc-h2">
          {activity.title}
        </h2>
        {activity.prompt ? <p className="mc-lesson-runner__prompt">{activity.prompt}</p> : null}
        <Stack gap={3}>
          {activity.instructions.map((instruction, index) => (
            <p key={index}>{instruction}</p>
          ))}
          {activity.representations.map((representation) => (
            <Representation key={representation.id} representation={representation} />
          ))}
        </Stack>
      </section>

      {activity.assistance.visibleHint ? (
        <Callout tone="info" title={`Support ${activity.assistance.currentLevel}`}>
          {activity.assistance.visibleHint}
        </Callout>
      ) : null}

      {activity.feedback && !activity.feedback.sealed ? (
        <FeedbackEntries entries={activity.feedback.entries} label="Activity feedback" />
      ) : null}

      {availableActions.includes('submit_response') && activity.response.kind === 'choice' ? (
        <fieldset className="mc-choices">
          <legend className="mc-h3">{activity.response.legend}</legend>
          {activity.response.choices.map((choice) => (
            <label
              key={choice.id}
              className={`mc-choice ${choiceId === choice.id && !notSure ? 'mc-choice--selected' : ''}`}
            >
              <input
                type="radio"
                name={`lesson-response-${activity.id}`}
                value={choice.id}
                checked={choiceId === choice.id && !notSure}
                onChange={() => {
                  setChoiceId(choice.id);
                  setNotSure(false);
                }}
              />
              <span className="mc-choice__text">{choice.label}</span>
            </label>
          ))}
          {activity.response.allowNotSure ? (
            <label className={`mc-choice ${notSure ? 'mc-choice--selected' : ''}`}>
              <input
                type="radio"
                name={`lesson-response-${activity.id}`}
                value="not_sure"
                checked={notSure}
                onChange={() => {
                  setNotSure(true);
                  setChoiceId(null);
                }}
              />
              <span className="mc-choice__text">I&apos;m not sure</span>
            </label>
          ) : null}
        </fieldset>
      ) : null}

      {availableActions.includes('submit_response') && activity.response.kind === 'text' ? (
        <div>
          <label className="mc-label" htmlFor={`lesson-text-${activity.id}`}>
            {activity.response.label}
          </label>
          <textarea
            id={`lesson-text-${activity.id}`}
            className="mc-input mc-lesson-runner__textarea"
            value={text}
            placeholder={activity.response.placeholder ?? undefined}
            onChange={(event) => {
              setText(event.target.value);
              setNotSure(false);
            }}
          />
        </div>
      ) : null}

      {availableActions.includes('submit_response') && activity.response.kind === 'numeric' ? (
        <div className="mc-lesson-runner__numeric">
          <label className="mc-label" htmlFor={`lesson-number-${activity.id}`}>
            {activity.response.label}
          </label>
          <input
            id={`lesson-number-${activity.id}`}
            className="mc-input"
            type="number"
            inputMode="decimal"
            value={numericValue}
            onChange={(event) => {
              setNumericValue(event.target.value);
              setNotSure(false);
            }}
          />
          {activity.response.unitLabel ? (
            <>
              <label className="mc-label" htmlFor={`lesson-unit-${activity.id}`}>
                {activity.response.unitLabel}
              </label>
              <input
                id={`lesson-unit-${activity.id}`}
                className="mc-input"
                value={unit}
                onChange={(event) => setUnit(event.target.value)}
              />
            </>
          ) : null}
        </div>
      ) : null}

      {availableActions.includes('submit_response') &&
      activity.response.kind === 'ordered_steps' ? (
        <div>
          <label className="mc-label" htmlFor={`lesson-steps-${activity.id}`}>
            {activity.response.legend} (one step per line)
          </label>
          <textarea
            id={`lesson-steps-${activity.id}`}
            className="mc-input mc-lesson-runner__textarea"
            value={orderedSteps}
            onChange={(event) => {
              setOrderedSteps(event.target.value);
              setNotSure(false);
            }}
          />
        </div>
      ) : null}

      {availableActions.includes('submit_response') &&
      activity.response.kind !== 'none' &&
      activity.response.kind !== 'choice' &&
      activity.response.allowNotSure ? (
        <label className="mc-switch">
          <input
            type="checkbox"
            checked={notSure}
            onChange={(event) => setNotSure(event.target.checked)}
          />
          I&apos;m not sure
        </label>
      ) : null}

      <Stack gap={2}>
        {availableActions.includes('submit_response') ? (
          <Button variant="primary" size="lg" disabled={!canSubmit || pending} onClick={submit}>
            Submit response
          </Button>
        ) : null}
        {availableActions.includes('continue') ? (
          <Button
            variant="primary"
            size="lg"
            disabled={pending}
            onClick={() => void onAction({ type: 'continue', activityId: activity.id })}
          >
            Continue
          </Button>
        ) : null}
        {availableActions.includes('request_hint') ? (
          <Button
            variant="secondary"
            disabled={pending}
            onClick={() => void onAction({ type: 'request_hint', activityId: activity.id })}
          >
            Add support
          </Button>
        ) : null}
        {availableActions.includes('request_reveal') ? (
          <Button
            variant="text"
            disabled={pending}
            onClick={() => void onAction({ type: 'request_reveal', activityId: activity.id })}
          >
            Reveal support
          </Button>
        ) : null}
        {availableActions.includes('pause') ? (
          <Button
            variant="text"
            disabled={pending}
            onClick={() => void onAction({ type: 'pause' })}
          >
            Pause lesson
          </Button>
        ) : null}
      </Stack>
    </>
  );
}

function FeedbackEntries({
  entries,
  label,
}: {
  entries: Array<{
    activityId: string;
    tone: 'correct' | 'incorrect' | 'information';
    message: string;
  }>;
  label: string;
}) {
  return (
    <section
      className="mc-lesson-runner__feedback"
      role="status"
      aria-live="polite"
      aria-atomic="true"
      aria-label={label}
    >
      <h3 className="mc-h3">{label}</h3>
      {entries.map((entry) => (
        <div
          key={`${entry.activityId}-${entry.message}`}
          className={`mc-lesson-runner__feedback-entry mc-lesson-runner__feedback-entry--${entry.tone}`}
        >
          {entry.message}
        </div>
      ))}
    </section>
  );
}

function SemanticTable({
  table,
}: {
  table: Extract<LearnerLessonRepresentation, { kind: 'table' }>['table'];
}) {
  return (
    <div className="mc-lesson-runner__table-wrap">
      <table>
        <caption>{table.caption}</caption>
        <thead>
          <tr>
            {table.columns.map((column) => (
              <th key={column} scope="col">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((cell, cellIndex) => (
                <td key={cellIndex}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DiagramGraphic({
  label,
  description,
  diagram,
}: {
  label: string;
  description: string;
  diagram: Extract<LearnerLessonRepresentation, { kind: 'diagram' }>['diagram'];
}) {
  const generatedId = useId().replace(/:/g, '');
  const titleId = `diagram-title-${generatedId}`;
  const descriptionId = `diagram-description-${generatedId}`;
  const markerId = `diagram-arrow-${generatedId}`;
  const nodes = new Map(diagram.nodes.map((node) => [node.id, node]));
  return (
    <svg
      className="mc-lesson-runner__svg"
      viewBox={`0 0 ${diagram.width} ${diagram.height}`}
      role="img"
      aria-labelledby={`${titleId} ${descriptionId}`}
      preserveAspectRatio="xMidYMid meet"
    >
      <title id={titleId}>{label}</title>
      <desc id={descriptionId}>{description}</desc>
      <defs>
        <marker
          id={markerId}
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" className="mc-lesson-runner__arrow" />
        </marker>
      </defs>
      {diagram.edges.map((edge, index) => {
        const from = nodes.get(edge.from)!;
        const to = nodes.get(edge.to)!;
        const middleX = (from.x + to.x) / 2;
        const middleY = (from.y + to.y) / 2;
        return (
          <g key={`${edge.from}-${edge.to}-${index}`}>
            <line
              x1={from.x}
              y1={from.y}
              x2={to.x}
              y2={to.y}
              className="mc-lesson-runner__edge"
              markerEnd={edge.directed ? `url(#${markerId})` : undefined}
            />
            {edge.label ? (
              <text x={middleX} y={middleY - 8} textAnchor="middle">
                {edge.label}
              </text>
            ) : null}
          </g>
        );
      })}
      {diagram.nodes.map((node) => (
        <g key={node.id}>
          {node.shape === 'circle' ? (
            <circle
              cx={node.x}
              cy={node.y}
              r="36"
              className={`mc-lesson-runner__node mc-lesson-runner__node--${node.tone}`}
            />
          ) : (
            <rect
              x={node.x - 54}
              y={node.y - 30}
              width="108"
              height="60"
              rx="8"
              className={`mc-lesson-runner__node mc-lesson-runner__node--${node.tone}`}
            />
          )}
          <text x={node.x} y={node.y + 4} textAnchor="middle">
            {node.label}
          </text>
        </g>
      ))}
    </svg>
  );
}

function DiagramRepresentation({
  representation,
}: {
  representation: Extract<LearnerLessonRepresentation, { kind: 'diagram' }>;
}) {
  return (
    <figure className="mc-lesson-runner__alternative">
      <figcaption>{representation.label}</figcaption>
      <DiagramGraphic
        label={representation.label}
        description={representation.alternative.longDescription}
        diagram={representation.diagram}
      />
      <details>
        <summary>Text description</summary>
        <p>{representation.alternative.longDescription}</p>
      </details>
    </figure>
  );
}

function ChartRepresentation({
  representation,
}: {
  representation: Extract<LearnerLessonRepresentation, { kind: 'chart' }>;
}) {
  const generatedId = useId().replace(/:/g, '');
  const titleId = `chart-title-${generatedId}`;
  const descriptionId = `chart-description-${generatedId}`;
  const { chart } = representation;
  const width = 640;
  const height = 360;
  const left = 72;
  const top = 30;
  const innerWidth = 530;
  const innerHeight = 260;
  const scaleX = (value: number) =>
    left + ((value - chart.xAxis.min) / (chart.xAxis.max - chart.xAxis.min)) * innerWidth;
  const scaleY = (value: number) =>
    top +
    innerHeight -
    ((value - chart.yAxis.min) / (chart.yAxis.max - chart.yAxis.min)) * innerHeight;
  const totalPoints = chart.series.reduce((count, series) => count + series.points.length, 0);
  const barWidth = Math.max(8, (innerWidth / Math.max(totalPoints, 1)) * 0.55);
  const barBaselineY = scaleY(0);
  return (
    <figure className="mc-lesson-runner__alternative">
      <figcaption>{representation.label}</figcaption>
      <svg
        className="mc-lesson-runner__svg"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-labelledby={`${titleId} ${descriptionId}`}
        preserveAspectRatio="xMidYMid meet"
      >
        <title id={titleId}>{representation.label}</title>
        <desc id={descriptionId}>{representation.alternative.longDescription}</desc>
        <line
          x1={left}
          y1={top}
          x2={left}
          y2={top + innerHeight}
          className="mc-lesson-runner__axis"
        />
        <line
          x1={left}
          y1={top + innerHeight}
          x2={left + innerWidth}
          y2={top + innerHeight}
          className="mc-lesson-runner__axis"
        />
        <text x={left + innerWidth / 2} y={height - 20} textAnchor="middle">
          {chart.xAxis.label}
          {chart.xAxis.unit ? ` (${chart.xAxis.unit})` : ''}
        </text>
        <text
          x="18"
          y={top + innerHeight / 2}
          textAnchor="middle"
          transform={`rotate(-90 18 ${top + innerHeight / 2})`}
        >
          {chart.yAxis.label}
          {chart.yAxis.unit ? ` (${chart.yAxis.unit})` : ''}
        </text>
        {chart.series.map((series, seriesIndex) => {
          const points = series.points.map((point) => `${scaleX(point.x)},${scaleY(point.y)}`);
          return (
            <g
              key={series.id}
              className={`mc-lesson-runner__series mc-lesson-runner__series--${seriesIndex % 4}`}
              aria-label={series.label}
            >
              {chart.chartType === 'line' ? (
                <polyline points={points.join(' ')} fill="none" />
              ) : null}
              {series.points.map((point, pointIndex) =>
                chart.chartType === 'bar' ? (
                  <rect
                    key={pointIndex}
                    x={scaleX(point.x) - barWidth / 2}
                    y={scaleY(point.y)}
                    width={barWidth}
                    height={barBaselineY - scaleY(point.y)}
                  />
                ) : (
                  <circle key={pointIndex} cx={scaleX(point.x)} cy={scaleY(point.y)} r="5" />
                ),
              )}
            </g>
          );
        })}
      </svg>
      <p className="mc-fineprint">{representation.alternative.shortText}</p>
      <SemanticTable table={chart.dataTable} />
    </figure>
  );
}

function SimulationRepresentation({
  representation,
}: {
  representation: Extract<LearnerLessonRepresentation, { kind: 'simulation' }>;
}) {
  const { input, outputs } = representation.simulation;
  const [value, setValue] = useState(input.initial);
  return (
    <Card elevated={false} aria-label={representation.label}>
      <Stack gap={2}>
        <h3 className="mc-h3">{representation.label}</h3>
        <p>{representation.alternative.shortText}</p>
        <label htmlFor={`simulation-${representation.id}`}>
          {input.label}: {value}
          {input.unit ? ` ${input.unit}` : ''}
        </label>
        <input
          id={`simulation-${representation.id}`}
          type="range"
          min={input.min}
          max={input.max}
          step={input.step}
          value={value}
          onChange={(event) => setValue(Number(event.target.value))}
        />
        {outputs.map((output) => (
          <output
            key={output.id}
            className="mc-lesson-runner__simulation-output"
            htmlFor={`simulation-${representation.id}`}
          >
            {output.label}: {(output.slope * value + output.intercept).toFixed(output.decimals)}
            {output.unit ? ` ${output.unit}` : ''}
          </output>
        ))}
        <details>
          <summary>Text description</summary>
          <p>{representation.alternative.longDescription}</p>
        </details>
      </Stack>
    </Card>
  );
}

function AnimationRepresentation({
  representation,
}: {
  representation: Extract<LearnerLessonRepresentation, { kind: 'animation' }>;
}) {
  const [frame, setFrame] = useState(0);
  const current = representation.frames[frame]!;
  return (
    <figure className="mc-lesson-runner__alternative">
      <figcaption>{representation.label}</figcaption>
      <DiagramGraphic
        label={`${representation.label}: ${current.label}`}
        description={current.description}
        diagram={current.diagram}
      />
      <div className="mc-lesson-runner__frame-controls">
        <button
          type="button"
          disabled={frame === 0}
          onClick={() => setFrame((value) => Math.max(0, value - 1))}
        >
          Previous frame
        </button>
        <span>
          Frame {frame + 1} of {representation.frames.length}: {current.label}
        </span>
        <button
          type="button"
          disabled={frame === representation.frames.length - 1}
          onClick={() => setFrame((value) => Math.min(representation.frames.length - 1, value + 1))}
        >
          Next frame
        </button>
      </div>
      <p>{representation.alternative.longDescription}</p>
    </figure>
  );
}

function MediaRepresentation({
  representation,
}: {
  representation: Extract<LearnerLessonRepresentation, { kind: 'audio' | 'video' }>;
}) {
  return (
    <figure className="mc-lesson-runner__alternative">
      <figcaption>{representation.label}</figcaption>
      {representation.kind === 'video' ? (
        <video controls preload="metadata">
          <source src={representation.assetRef} />
          <track kind="captions" src={representation.captionsRef} srcLang="en" label="English" />
        </video>
      ) : (
        <audio controls preload="metadata" src={representation.assetRef} />
      )}
      <details>
        <summary>Transcript</summary>
        {representation.transcript.map((paragraph, index) => (
          <p key={index}>{paragraph}</p>
        ))}
      </details>
    </figure>
  );
}

function Representation({ representation }: { representation: LearnerLessonRepresentation }) {
  if (representation.kind === 'text') {
    return (
      <Card elevated={false} aria-label={representation.label}>
        {representation.paragraphs.map((paragraph, index) => (
          <p key={index}>{paragraph}</p>
        ))}
      </Card>
    );
  }
  if (representation.kind === 'equation') {
    return (
      <figure className="mc-lesson-runner__alternative">
        <figcaption>{representation.label}</figcaption>
        <div className="mc-lesson-runner__equation" role="math" aria-label={representation.spoken}>
          <code>{representation.expression}</code>
        </div>
        {representation.variables.length > 0 ? (
          <dl className="mc-lesson-runner__variables">
            {representation.variables.map((variable) => (
              <div key={variable.symbol}>
                <dt>{variable.symbol}</dt>
                <dd>
                  {variable.meaning}
                  {variable.unit ? ` (${variable.unit})` : ''}
                </dd>
              </div>
            ))}
          </dl>
        ) : null}
      </figure>
    );
  }
  if (representation.kind === 'table') return <SemanticTable table={representation.table} />;
  if (representation.kind === 'diagram') {
    return <DiagramRepresentation representation={representation} />;
  }
  if (representation.kind === 'chart') {
    return <ChartRepresentation representation={representation} />;
  }
  if (representation.kind === 'simulation') {
    return <SimulationRepresentation representation={representation} />;
  }
  if (representation.kind === 'animation') {
    return <AnimationRepresentation representation={representation} />;
  }
  return <MediaRepresentation representation={representation} />;
}
