import { useEffect, useRef, useState } from 'react';
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
  onAction: (action: LessonActionInput) => void;
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

export function LessonRunner({ step, pending = false, onAction }: LessonRunnerProps) {
  const presentedKey = useRef<string | null>(null);
  const activity = 'activity' in step ? step.activity : null;
  const activityId = activity?.id ?? null;
  const shouldPresent =
    step.status === 'active' && activity !== null && step.availableActions.includes('present');

  useEffect(() => {
    if (!shouldPresent || activityId === null || pending) return;
    const key = `${step.runId}:${activityId}`;
    if (presentedKey.current === key) return;
    presentedKey.current = key;
    onAction({ type: 'present', activityId });
  }, [activityId, onAction, pending, shouldPresent, step.runId]);

  const progressValue = Math.min(
    step.progress.kcCount,
    step.progress.exitedKcCount + (step.progress.kcOrdinal === null ? 0 : 1),
  );

  return (
    <div className="mc-screen mc-study mc-lesson-runner">
      <header className="mc-lesson-runner__header">
        <Eyebrow>V3 lesson · instructional progress</Eyebrow>
        <h1 className="mc-h1">{step.lessonTitle}</h1>
        <label className="mc-fineprint" htmlFor="lesson-kc-progress">
          {step.kcTitle
            ? `Knowledge component ${step.progress.kcOrdinal} of ${step.progress.kcCount}: ${step.kcTitle}`
            : `${step.progress.exitedKcCount} of ${step.progress.kcCount} knowledge components exited`}
        </label>
        <progress
          id="lesson-kc-progress"
          className="mc-lesson-runner__progress"
          max={step.progress.kcCount}
          value={progressValue}
        />
      </header>

      {step.status === 'active' ? (
        <ActiveActivity
          activity={step.activity}
          availableActions={step.availableActions}
          pending={pending}
          onAction={onAction}
        />
      ) : null}

      {step.status === 'route_pending' ||
      step.status === 'feedback_pending' ||
      step.status === 'repair_pending' ? (
        <WaitingStep step={step} pending={pending} onAction={onAction} />
      ) : null}

      {step.status === 'paused' ? (
        <Card elevated aria-live="polite">
          <Stack gap={3}>
            <h2 className="mc-h3">
              {step.plannerReentryRequired ? 'Planner reentry needed' : 'Lesson paused'}
            </h2>
            <p>{step.message}</p>
            {step.availableActions.includes('resume') ? (
              <Button
                variant="primary"
                size="lg"
                disabled={pending}
                onClick={() => onAction({ type: 'resume' })}
              >
                Resume exact checkpoint
              </Button>
            ) : null}
          </Stack>
        </Card>
      ) : null}

      {step.status === 'complete' ? (
        <Callout tone="success" title="Lesson complete">
          {step.message} Lesson completion records instructional exits only.
        </Callout>
      ) : null}

      {step.status === 'handoff' ? (
        <Callout tone="info" title="Returning to your plan">
          {step.message}
        </Callout>
      ) : null}

      {step.status === 'invalid_content' || step.status === 'blocked' ? (
        <Callout tone="danger" title="Lesson unavailable">
          {step.message}
        </Callout>
      ) : null}
    </div>
  );
}

function WaitingStep({
  step,
  pending,
  onAction,
}: {
  step: Extract<
    LessonStepView,
    { status: 'route_pending' | 'feedback_pending' | 'repair_pending' }
  >;
  pending: boolean;
  onAction: (action: LessonActionInput) => void;
}) {
  return (
    <Card elevated aria-live="polite">
      <Stack gap={3}>
        <p>{step.message}</p>
        {step.activity?.feedback && !step.activity.feedback.sealed ? (
          <Feedback activity={step.activity} />
        ) : null}
        {step.availableActions.includes('continue') && step.activity ? (
          <Button
            variant="primary"
            size="lg"
            disabled={pending}
            onClick={() => onAction({ type: 'continue', activityId: step.activity!.id })}
          >
            Continue
          </Button>
        ) : null}
        {step.availableActions.includes('pause') ? (
          <Button variant="text" disabled={pending} onClick={() => onAction({ type: 'pause' })}>
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
  onAction,
}: {
  activity: LearnerLessonActivity;
  availableActions: LessonStepView['availableActions'];
  pending: boolean;
  onAction: (action: LessonActionInput) => void;
}) {
  const [choiceId, setChoiceId] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [notSure, setNotSure] = useState(false);

  useEffect(() => {
    setChoiceId(null);
    setText('');
    setNotSure(false);
  }, [activity.id]);

  const canSubmit =
    availableActions.includes('submit_response') &&
    (notSure ||
      (activity.response.kind === 'choice' && choiceId !== null) ||
      (activity.response.kind === 'text' && text.trim().length > 0));

  const submit = () => {
    let response: LessonActivityResponseInput;
    if (notSure) {
      response = { kind: 'not_sure' };
    } else if (activity.response.kind === 'choice' && choiceId !== null) {
      response = { kind: 'choice', choiceId };
    } else if (activity.response.kind === 'text' && text.trim().length > 0) {
      response = { kind: 'text', text: text.trim() };
    } else {
      return;
    }
    onAction({ type: 'submit_response', activityId: activity.id, response });
  };

  return (
    <>
      <section aria-labelledby={`activity-${activity.id}`}>
        <Eyebrow>
          {PHASE_LABELS[activity.phase]} · support {activity.assistance.currentLevel}
        </Eyebrow>
        <h2 id={`activity-${activity.id}`} className="mc-h2">
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

      {activity.feedback && !activity.feedback.sealed ? <Feedback activity={activity} /> : null}

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
          {activity.response.allowNotSure ? (
            <label className="mc-switch">
              <input
                type="checkbox"
                checked={notSure}
                onChange={(event) => setNotSure(event.target.checked)}
              />
              I&apos;m not sure
            </label>
          ) : null}
        </div>
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
            onClick={() => onAction({ type: 'continue', activityId: activity.id })}
          >
            Continue
          </Button>
        ) : null}
        {availableActions.includes('request_assistance') ? (
          <Button
            variant="secondary"
            disabled={pending}
            onClick={() => onAction({ type: 'request_assistance', activityId: activity.id })}
          >
            Add support
          </Button>
        ) : null}
        {availableActions.includes('pause') ? (
          <Button variant="text" disabled={pending} onClick={() => onAction({ type: 'pause' })}>
            Pause lesson
          </Button>
        ) : null}
      </Stack>
    </>
  );
}

function Feedback({ activity }: { activity: LearnerLessonActivity }) {
  if (!activity.feedback || activity.feedback.sealed) return null;
  return (
    <div aria-live="polite" className="mc-lesson-runner__feedback">
      {activity.feedback.entries.map((entry) => (
        <Callout
          key={`${entry.activityId}-${entry.message}`}
          tone={
            entry.tone === 'correct' ? 'success' : entry.tone === 'incorrect' ? 'warning' : 'info'
          }
        >
          {entry.message}
        </Callout>
      ))}
    </div>
  );
}

function Representation({ representation }: { representation: LearnerLessonRepresentation }) {
  if (representation.kind === 'table' && representation.table) {
    return (
      <div className="mc-lesson-runner__table-wrap">
        <table>
          <caption>{representation.table.caption}</caption>
          <thead>
            <tr>
              {representation.table.columns.map((column) => (
                <th key={column} scope="col">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {representation.table.rows.map((row, rowIndex) => (
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
  if (representation.kind === 'text') {
    return (
      <Card elevated={false} aria-label={representation.label}>
        {representation.body.map((paragraph, index) => (
          <p key={index}>{paragraph}</p>
        ))}
      </Card>
    );
  }
  return (
    <figure className="mc-lesson-runner__alternative">
      <figcaption>{representation.label}</figcaption>
      <div role="img" aria-label={representation.altText ?? representation.label}>
        {representation.longDescription ?? representation.altText}
      </div>
    </figure>
  );
}
