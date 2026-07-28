import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Card, Stack } from '@mcat/ui-web';
import { DEFAULT_MINUTES_PER_QUESTION } from '@mcat/contracts';
import { useMasteryLessons, useMasterySkills } from '../../app/queries';

const MIN_QUESTIONS = 1;
const MAX_QUESTIONS = 30;
const DEFAULT_QUESTIONS = 10;
/** A not-yet-mastered lesson at/above this P(L) counts as "ready to test out". */
const READY_TO_TEST_OUT = 0.7;

const OPERATION_LABEL: Record<string, string> = {
  IDENTIFY: 'Identify',
  PREDICT: 'Predict',
  EXPLAIN: 'Explain',
  RELATE: 'Relate',
  QUANTIFY: 'Quantify',
  DESIGN: 'Design',
  EVIDENCE: 'Evidence',
};

const clampCount = (n: number): number =>
  Math.max(MIN_QUESTIONS, Math.min(MAX_QUESTIONS, Math.round(n)));

/**
 * Practice hub: pick how many test-out reps to run (the only control that affects
 * the session), plus a read-only "Where you stand" readout of the 7 reasoning
 * skills so the learner can see their weak spots before choosing a count.
 */
export function PracticeHome() {
  const navigate = useNavigate();
  const skills = useMasterySkills();
  const lessons = useMasteryLessons();
  const [countStr, setCountStr] = useState(String(DEFAULT_QUESTIONS));

  const estMinutes = clampCount(Number(countStr) || DEFAULT_QUESTIONS) * DEFAULT_MINUTES_PER_QUESTION;

  // 7 reasoning skills, weakest first (read-only — nothing here changes the session).
  const skillRows = useMemo(() => [...(skills.data ?? [])].sort((a, b) => a.pL - b.pL), [skills.data]);
  const masteredSkills = skillRows.filter((s) => s.mastered).length;
  const readyToTestOut = (lessons.data ?? []).filter(
    (l) => !l.mastered && l.pL >= READY_TO_TEST_OUT,
  ).length;

  const start = () => {
    const x = clampCount(Number(countStr) || DEFAULT_QUESTIONS);
    setCountStr(String(x));
    navigate('/app/practice/session', { state: { x } });
  };

  return (
    <div className="mc-screen mc-practice">
      <h1 className="mc-h1">Practice</h1>
      <p className="mc-practice__intro">
        Practice pulls fresh questions from lessons you’ve already finished. Get it right on the first
        try — no hints — and your mastery goes up. It’s untimed, so stop whenever you like.
      </p>

      <Card elevated>
        <Stack gap={4}>
          <div className="mc-practice__count">
            <h2 className="mc-h3">How many questions?</h2>
            <input
              className="mc-timeinput__field mc-practice__countinput"
              type="number"
              inputMode="numeric"
              min={MIN_QUESTIONS}
              max={MAX_QUESTIONS}
              value={countStr}
              onChange={(e) => setCountStr(e.target.value)}
              onBlur={() => setCountStr(String(clampCount(Number(countStr) || DEFAULT_QUESTIONS)))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              }}
              aria-label="Number of questions"
            />
            <span className="mc-practice__esttime">≈ {estMinutes} min · untimed</span>
          </div>

          <Button variant="primary" size="lg" fullWidth onClick={start}>
            Start practice
          </Button>
        </Stack>
      </Card>

      {skillRows.length > 0 ? (
        <section className="mc-practice__stand">
          <div className="mc-practice__standhead">
            <h2 className="mc-h3">Where you stand</h2>
            <p className="mc-muted mc-fineprint">
              {masteredSkills} of {skillRows.length} skills mastered · {readyToTestOut} lesson
              {readyToTestOut === 1 ? '' : 's'} ready to test out
            </p>
          </div>
          <ul className="mc-skillbars">
            {skillRows.map((s) => {
              const pct = Math.round(s.pL * 100);
              return (
                <li key={s.operation} className="mc-skillbar">
                  <span className="mc-skillbar__label">
                    {OPERATION_LABEL[s.operation] ?? s.operation}
                  </span>
                  <span className="mc-skillbar__track" aria-hidden="true">
                    <span
                      className={`mc-skillbar__fill ${s.mastered ? 'mc-skillbar__fill--ok' : ''}`}
                      style={{ width: `${Math.max(3, pct)}%` }}
                    />
                  </span>
                  <span className="mc-skillbar__pct">{pct}%</span>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
