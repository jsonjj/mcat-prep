import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Callout, Card, Eyebrow, Stack } from '@mcat/ui-web';
import { useMasterySkills } from '../../app/queries';

const COUNTS = [5, 10, 15] as const;

const OPERATION_LABEL: Record<string, string> = {
  IDENTIFY: 'Identify',
  PREDICT: 'Predict',
  EXPLAIN: 'Explain',
  RELATE: 'Relate',
  QUANTIFY: 'Quantify',
  DESIGN: 'Design',
  EVIDENCE: 'Evidence',
};

interface FocusOption {
  readonly token: string | undefined;
  readonly label: string;
}

/**
 * Practice hub: pick how many test-out reps to run and, optionally, a weakness
 * to focus on. Starting hands off to the session (count + focus in route state).
 */
export function PracticeHome() {
  const navigate = useNavigate();
  const skills = useMasterySkills();
  const [count, setCount] = useState<number>(10);
  const [focus, setFocus] = useState<string | undefined>(undefined);

  const focusOptions = useMemo<FocusOption[]>(() => {
    const weakest = [...(skills.data ?? [])]
      .sort((a, b) => a.pL - b.pL)
      .slice(0, 3)
      .map((s) => ({ token: s.operation.toLowerCase(), label: OPERATION_LABEL[s.operation] ?? s.operation }));
    return [{ token: undefined, label: 'Whole exam' }, ...weakest, { token: 'cars', label: 'CARS' }];
  }, [skills.data]);

  return (
    <div className="mc-screen mc-practice">
      <Eyebrow>Practice</Eyebrow>
      <h1 className="mc-h1">Practice</h1>
      <p className="mc-muted mc-fineprint">
        Independent test-out reps drawn from what you’ve already learned. A correct first try — no
        hints — is what moves your mastery. Untimed. Stop whenever you like.
      </p>

      <Card elevated>
        <Stack gap={4}>
          <div>
            <h2 className="mc-h3">How many questions?</h2>
            <div className="mc-practice__options" role="group" aria-label="Number of questions">
              {COUNTS.map((n) => (
                <button
                  key={n}
                  type="button"
                  className={`mc-practice__chip ${count === n ? 'mc-practice__chip--on' : ''}`}
                  aria-pressed={count === n}
                  onClick={() => setCount(n)}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          <div>
            <h2 className="mc-h3">Focus (optional)</h2>
            <div className="mc-practice__options" role="group" aria-label="Practice focus">
              {focusOptions.map((option) => (
                <button
                  key={option.label}
                  type="button"
                  className={`mc-practice__chip ${focus === option.token ? 'mc-practice__chip--on' : ''}`}
                  aria-pressed={focus === option.token}
                  onClick={() => setFocus(option.token)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <Button
            variant="primary"
            size="lg"
            onClick={() =>
              navigate('/app/practice/session', {
                state: { x: count, ...(focus === undefined ? {} : { focus }) },
              })
            }
          >
            Start practice
          </Button>
        </Stack>
      </Card>

      <Callout tone="info">
        Practice never punishes a miss — a wrong first answer just becomes a quick diagnose, one
        retry, and a full explanation, and it queues that idea to come back fresh.
      </Callout>
    </div>
  );
}
