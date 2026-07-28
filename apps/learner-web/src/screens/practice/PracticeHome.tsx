import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Card, Stack } from '@mcat/ui-web';
import { ATLAS_REGION_GROUPS, DEFAULT_MINUTES_PER_QUESTION } from '@mcat/contracts';
import { CURRICULUM_PHASES } from '../../data/curriculum-v3.generated';
import { useMasteryLessons } from '../../app/queries';

const MIN_QUESTIONS = 1;
const MAX_QUESTIONS = 30;
const DEFAULT_QUESTIONS = 10;
/** A not-yet-mastered lesson at/above this P(L) is "ready to test out". */
const READY_TO_TEST_OUT = 0.7;
const MAX_READY_ROWS = 6;

const clampCount = (n: number): number =>
  Math.max(MIN_QUESTIONS, Math.min(MAX_QUESTIONS, Math.round(n)));

/** lesson_id → display title, from the checked-in curriculum + atlas metadata. */
const LESSON_TITLE: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  for (const rg of ATLAS_REGION_GROUPS) for (const l of rg.lessons) map[l.lesson_id] = l.title;
  for (const phase of CURRICULUM_PHASES)
    for (const mod of phase.modules) for (const lesson of mod.lessons) map[lesson.id] = lesson.shortTitle;
  return map;
})();

/** Title for a lesson id, falling back to a prettified id for ids outside the catalog. */
const lessonTitle = (id: string): string =>
  LESSON_TITLE[id] ??
  id
    .replace(/^(lesson-|v3-les-)/i, '')
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());

/**
 * Practice hub: pick how many test-out reps to run (the only control that affects
 * the session), plus a read-only "Ready to test out" readout of the lessons the
 * learner is closest to mastering — since a clean practice run is what locks them in.
 */
export function PracticeHome() {
  const navigate = useNavigate();
  const lessons = useMasteryLessons();
  const [countStr, setCountStr] = useState(String(DEFAULT_QUESTIONS));

  const estMinutes = clampCount(Number(countStr) || DEFAULT_QUESTIONS) * DEFAULT_MINUTES_PER_QUESTION;

  // Lessons closest to mastery (not yet there) — closest first. Read-only.
  const readyLessons = useMemo(
    () =>
      (lessons.data ?? [])
        .filter((l) => !l.mastered && l.pL >= READY_TO_TEST_OUT)
        .sort((a, b) => b.pL - a.pL)
        .slice(0, MAX_READY_ROWS),
    [lessons.data],
  );

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
            <span className="mc-practice__esttime">≈ {estMinutes} min</span>
          </div>

          <Button variant="primary" size="lg" fullWidth onClick={start}>
            Start practice
          </Button>
        </Stack>
      </Card>

      <section className="mc-practice__stand">
        <div className="mc-practice__standhead">
          <h2 className="mc-h3">Ready to test out</h2>
          {readyLessons.length > 0 ? (
            <p className="mc-muted mc-fineprint">
              Lessons you’re closest to mastering — a clean run locks them in.
            </p>
          ) : null}
        </div>
        {readyLessons.length > 0 ? (
          <ul className="mc-readyout">
            {readyLessons.map((l) => {
              const pct = Math.round(l.pL * 100);
              return (
                <li key={l.lessonId} className="mc-readyout__row">
                  <span className="mc-readyout__title">{lessonTitle(l.lessonId)}</span>
                  <span className="mc-readyout__track" aria-hidden="true">
                    <span className="mc-readyout__fill" style={{ width: `${Math.max(3, pct)}%` }} />
                  </span>
                  <span className="mc-readyout__pct">{pct}%</span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mc-muted">
            Practice a few lessons and the ones you’re closest to mastering will show up here — so you
            can lock them in.
          </p>
        )}
      </section>
    </div>
  );
}
