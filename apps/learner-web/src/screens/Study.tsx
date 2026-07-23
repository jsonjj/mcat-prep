import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ChoiceId, ProbableCause, StudyStepView } from '@mcat/contracts';
import { Button, Callout, Card, Eyebrow, MasteryBadge, Stack } from '@mcat/ui-web';
import {
  useContinueStep,
  useLessonAction,
  useRequestReveal,
  useSelectCause,
  useSession,
  useSubmitAttempt,
  useSubmitRecall,
} from '../app/queries';
import { LessonRunner } from '../components/LessonRunner';

const CAUSES: { value: ProbableCause; label: string }[] = [
  { value: 'did_not_know_content', label: 'I did not know the content' },
  { value: 'knew_but_misapplied', label: 'I knew it but applied it incorrectly' },
  { value: 'misread_question_or_passage', label: 'I misread the question or passage' },
  { value: 'missed_condition_unit_sign', label: 'I missed a condition, unit, or sign' },
  { value: 'misinterpreted_graph_or_experiment', label: 'I misread the graph or experiment' },
  { value: 'calculation_error', label: 'I made a calculation error' },
  { value: 'rushing_or_time', label: 'I was rushing or ran out of time' },
  { value: 'not_sure', label: 'I am not sure' },
];

const PHASE_LABEL: Record<string, string> = {
  independent: 'Independent check',
  guided: 'Guided practice',
  transfer: 'Transfer',
  passage: 'Passage',
  protected: 'Protected check',
};

export function Study() {
  const navigate = useNavigate();
  const session = useSession();
  const submitAttempt = useSubmitAttempt();
  const selectCause = useSelectCause();
  const requestReveal = useRequestReveal();
  const continueStep = useContinueStep();
  const submitRecall = useSubmitRecall();
  const lessonAction = useLessonAction();

  const [choice, setChoice] = useState<ChoiceId | null>(null);
  const [recallText, setRecallText] = useState('');

  const step = session.data;
  const stepKey = stepIdentity(step);
  useEffect(() => {
    setChoice(null);
    setRecallText('');
  }, [stepKey]);

  if (session.isLoading || !step)
    return <div className="mc-center mc-muted">Loading your task…</div>;

  if (step.kind === 'locked') {
    return (
      <div className="mc-screen">
        <Callout tone="info" title="Learning is locked">
          {step.reason}
        </Callout>
        <Button variant="primary" onClick={() => navigate('/')}>
          Finish setup
        </Button>
      </div>
    );
  }

  if (step.kind === 'v3_lesson') {
    return (
      <LessonRunner
        step={step}
        pending={lessonAction.isPending}
        onAction={(action) =>
          lessonAction.mutateAsync({
            runId: step.runId,
            runVersion: step.runVersion,
            action,
          })
        }
      />
    );
  }

  if (step.kind === 'lesson') {
    return (
      <div className="mc-screen mc-study">
        <Eyebrow>Lesson</Eyebrow>
        <h1 className="mc-h1">{step.title}</h1>
        <Stack gap={4}>
          {step.blocks.map((b, i) => (
            <Card key={i} elevated>
              <h2 className="mc-h3">{b.heading}</h2>
              <Stack gap={2}>
                {b.body.map((p, j) => (
                  <p key={j}>{p}</p>
                ))}
              </Stack>
            </Card>
          ))}
          <Button variant="primary" size="lg" onClick={() => continueStep.mutate()}>
            Start practice
          </Button>
        </Stack>
      </div>
    );
  }

  if (step.kind === 'simulation') {
    return (
      <div className="mc-screen mc-study">
        <Eyebrow>Simulation · optional</Eyebrow>
        <h1 className="mc-h1">Predict, then check</h1>
        <Card elevated>
          <Stack gap={3}>
            <p>
              Commit to a prediction, adjust the inhibitor, and watch the rate curve respond. Prefer
              text? A step-by-step direct route gives the same evidence.
            </p>
            <Callout tone="info">
              A simulation never awards mastery on its own — the unseen question right after is what
              counts.
            </Callout>
          </Stack>
        </Card>
        <Button variant="primary" size="lg" onClick={() => continueStep.mutate()}>
          Continue to the unseen question
        </Button>
      </div>
    );
  }

  if (step.kind === 'recall') {
    return (
      <div className="mc-screen mc-study">
        <Eyebrow>Recall</Eyebrow>
        <h1 className="mc-h2">{step.prompt}</h1>
        <Stack gap={3}>
          <input
            className="mc-input"
            aria-label="Your answer"
            value={recallText}
            onChange={(e) => setRecallText(e.target.value)}
            placeholder="Type your answer"
          />
          <Button
            variant="primary"
            size="lg"
            disabled={recallText.trim().length === 0 || submitRecall.isPending}
            onClick={() => submitRecall.mutate(recallText)}
          >
            Submit
          </Button>
        </Stack>
      </div>
    );
  }

  if (step.kind === 'complete') {
    const s = step.summary;
    return (
      <div className="mc-screen mc-study">
        <Eyebrow>Session complete</Eyebrow>
        <h1 className="mc-h1">Nice work.</h1>
        <Card elevated>
          <Stack gap={3}>
            <div className="mc-inline">
              <span>Current evidence:</span>
              <MasteryBadge state={s.masteryState} refreshNeeded={s.refreshNeeded} />
            </div>
            <ul className="mc-evidence">
              {Object.entries(s.evidenceCounts).map(([kind, n]) => (
                <li key={kind}>
                  <span className="mc-evidence__kind">{kind.replace(/_/g, ' ')}</span>
                  <span className="mc-evidence__n">{n}</span>
                </li>
              ))}
            </ul>
          </Stack>
        </Card>
        <Button variant="primary" size="lg" onClick={() => navigate('/app')}>
          Back to Home
        </Button>
      </div>
    );
  }

  // question
  const q = step.question;
  return (
    <div className="mc-screen mc-study">
      <Eyebrow>{PHASE_LABEL[step.phase] ?? step.phase}</Eyebrow>
      {step.stimulus ? (
        <Card elevated className="mc-stimulus">
          <h2 className="mc-h3">Experiment</h2>
          <Stack gap={2}>
            {step.stimulus.body.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </Stack>
        </Card>
      ) : null}

      <h1 className="mc-h2">{q.stem}</h1>

      {step.phase === 'protected' && step.sub === 'answering' ? (
        <Callout tone="warning" title="Protected check">
          No hints or feedback until you submit. This is unseen proof.
        </Callout>
      ) : null}

      {step.sub === 'reveal' && step.reveal ? (
        <Reveal reveal={step.reveal} chosen={choice} onContinue={() => continueStep.mutate()} />
      ) : step.sub === 'cause' ? (
        <CausePicker onPick={(c) => selectCause.mutate(c)} pending={selectCause.isPending} />
      ) : (
        <fieldset className="mc-choices">
          <legend className="mc-visually-hidden">Answer choices</legend>
          {q.choices.map((c) => (
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
      )}

      {step.sub === 'answering' ? (
        <Stack gap={2}>
          <Button
            variant="primary"
            size="lg"
            disabled={choice === null || submitAttempt.isPending}
            onClick={() => submitAttempt.mutate(choice)}
          >
            {step.phase === 'protected' ? 'Submit' : 'Check my answer'}
          </Button>
          {step.phase !== 'protected' ? (
            <button type="button" className="mc-textbtn" onClick={() => requestReveal.mutate()}>
              Reveal answer (this stops it counting as independent)
            </button>
          ) : null}
        </Stack>
      ) : null}

      {step.sub === 'retry' ? (
        <Stack gap={2}>
          <Callout tone="info">
            One unassisted retry. This is diagnostic — it won&apos;t count as mastery.
          </Callout>
          <Button
            variant="primary"
            size="lg"
            disabled={choice === null || submitAttempt.isPending}
            onClick={() => submitAttempt.mutate(choice)}
          >
            Try once more
          </Button>
        </Stack>
      ) : null}
    </div>
  );
}

function CausePicker({
  onPick,
  pending,
}: {
  onPick: (c: ProbableCause) => void;
  pending: boolean;
}) {
  return (
    <Card elevated>
      <Stack gap={3}>
        <h2 className="mc-h3">Before the answer — what happened?</h2>
        <p className="mc-muted mc-fineprint">
          Naming the cause is more useful than the key. You&apos;ll get one unassisted retry next.
        </p>
        <div className="mc-causegrid">
          {CAUSES.map((c) => (
            <button
              key={c.value}
              type="button"
              className="mc-cause"
              disabled={pending}
              onClick={() => onPick(c.value)}
            >
              {c.label}
            </button>
          ))}
        </div>
      </Stack>
    </Card>
  );
}

function Reveal({
  reveal,
  chosen,
  onContinue,
}: {
  reveal: NonNullable<Extract<StudyStepView, { kind: 'question' }>['reveal']>;
  chosen: ChoiceId | null;
  onContinue: () => void;
}) {
  return (
    <Card elevated>
      <Stack gap={3}>
        <div className="mc-inline">
          <span className="mc-reveal__key">Answer: {reveal.correctChoiceId}</span>
        </div>
        <p>{reveal.correctRationale}</p>
        {chosen && chosen !== reveal.correctChoiceId && reveal.choiceRationales[chosen] ? (
          <Callout tone="info" title={`Why ${chosen} misses`}>
            {reveal.choiceRationales[chosen]}
          </Callout>
        ) : null}
        <Button variant="primary" size="lg" onClick={onContinue}>
          Continue
        </Button>
      </Stack>
    </Card>
  );
}

function stepIdentity(step: StudyStepView | undefined): string {
  if (!step) return 'none';
  if (step.kind === 'question') return `q:${step.question.id}:${step.sub}`;
  if (step.kind === 'lesson') return `lesson:${step.lessonId}`;
  if (step.kind === 'recall') return `recall:${step.promptId}`;
  if (step.kind === 'simulation') return `sim:${step.specId}`;
  return step.kind;
}
