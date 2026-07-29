import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ChoiceId, StudyStepView } from '@mcat/contracts';
import { Button, Callout, Card, Eyebrow, Stack } from '@mcat/ui-web';
import { EVIDENCE_REFRESH_LABEL, evidenceWarrant } from '../components/evidence-language';
import {
  useContinueStep,
  useRequestReveal,
  useSession,
  useSubmitAttempt,
  useSubmitRecall,
} from '../app/queries';

/**
 * The Study loop. A miss reveals immediately — the key plus the refutation of the
 * option this learner actually picked — and the one unassisted retry follows the
 * correction rather than standing in front of it.
 *
 * The learner is never asked why they erred. Experts naming which bias produced an
 * error agree at κ = 0.000–0.063, and students call 81% of their execution errors
 * "simple" against an expert rate of 40%, worst among the weakest students — so a
 * self-reported cause is a field we cannot trust and have decided not to store
 * (docs/design/error-handling-design.md §2.3, §7).
 *
 * This loop still names the key on the first miss. Adaptive Practice defers it to
 * a second miss by product decision (§3.3, amended 2026-07-28); that amendment is
 * scoped to Practice and this flow is deliberately unchanged.
 */

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
  const requestReveal = useRequestReveal();
  const continueStep = useContinueStep();
  const submitRecall = useSubmitRecall();

  const [choice, setChoice] = useState<ChoiceId | null>(null);
  const [recallText, setRecallText] = useState('');

  const step = session.data;
  const stepKey = stepIdentity(step);
  useEffect(() => {
    setChoice(null);
    setRecallText('');
  }, [stepKey]);

  if (session.isLoading || !step) return <div className="mc-center mc-muted">Loading your task…</div>;

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
    const warrant = evidenceWarrant(s.reasons);
    return (
      <div className="mc-screen mc-study">
        <Eyebrow>Session complete</Eyebrow>
        <h1 className="mc-h1">Nice work.</h1>
        <Card elevated>
          <Stack gap={3}>
            <div className="mc-inline">
              <span>
                {warrant.status}
                {warrant.nextGap ? ` Next: ${warrant.nextGap}.` : ''}
              </span>
              {s.refreshNeeded ? (
                <span className="mc-skillbar__tag">◐ {EVIDENCE_REFRESH_LABEL}</span>
              ) : null}
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
        <Reveal reveal={step.reveal} onContinue={() => continueStep.mutate()} />
      ) : (
        <fieldset className="mc-choices">
          <legend className="mc-visually-hidden">Answer choices</legend>
          {q.choices.map((c) => (
            <label key={c.id} className={`mc-choice ${choice === c.id ? 'mc-choice--selected' : ''}`}>
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
          <Callout tone="info" title="Back for a second pass">
            You&apos;ve seen the answer and why your pick missed. Answer it once more from memory —
            this is diagnostic and won&apos;t count as mastery.
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

/**
 * The reveal. `reveal.chosenChoiceId` comes from the server, not from this
 * screen's selection state: the step change clears the local pick, so reading it
 * here would silently drop the one thing the reveal has to say — why the option
 * THEY chose is wrong (§3.3).
 */
function Reveal({
  reveal,
  onContinue,
}: {
  reveal: NonNullable<Extract<StudyStepView, { kind: 'question' }>['reveal']>;
  onContinue: () => void;
}) {
  const chosen = reveal.chosenChoiceId;
  const missed = chosen !== null && chosen !== reveal.correctChoiceId;
  return (
    <Card elevated>
      <Stack gap={3}>
        <div className="mc-inline">
          <span className="mc-reveal__key">Answer: {reveal.correctChoiceId}</span>
        </div>
        <p>{reveal.correctRationale}</p>
        {missed && reveal.choiceRationales[chosen] ? (
          <Callout tone="info" title={`Why ${chosen} misses`}>
            {reveal.choiceRationales[chosen]}
          </Callout>
        ) : null}
        {missed ? (
          <p className="mc-muted mc-fineprint">
            One more unassisted pass at this one before you move on.
          </p>
        ) : null}
        <Button variant="primary" size="lg" onClick={onContinue}>
          {missed ? 'Try it again' : 'Continue'}
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
