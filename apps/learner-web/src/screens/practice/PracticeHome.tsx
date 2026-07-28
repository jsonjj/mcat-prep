import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, Card, Stack } from '@mcat/ui-web';
import { ATLAS_REGION_GROUPS, DEFAULT_MINUTES_PER_QUESTION } from '@mcat/contracts';
import { CURRICULUM_PHASES } from '../../data/curriculum-v3.generated';
import { useMasteryLessons } from '../../app/queries';

const MIN_QUESTIONS = 1;
const MAX_QUESTIONS = 30;
const DEFAULT_QUESTIONS = 10;
const WEAKEST_ROWS = 3;

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

/** A circular mastery gauge (amber = low mastery / needs work). */
function MasteryRing({ pct }: { pct: number }) {
  const r = 42;
  const circumference = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, pct));
  const offset = circumference * (1 - clamped / 100);
  return (
    <svg className="mc-ring" viewBox="0 0 100 100" role="img" aria-hidden="true">
      <circle className="mc-ring__track" cx="50" cy="50" r={r} />
      <circle
        className="mc-ring__arc"
        cx="50"
        cy="50"
        r={r}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        transform="rotate(-90 50 50)"
      />
      <text className="mc-ring__pct" x="50" y="50" dominantBaseline="central" textAnchor="middle">
        {pct}%
      </text>
    </svg>
  );
}

/**
 * Practice hub: pick how many test-out reps to run (the only control that affects
 * the session), plus a read-only trio of the lessons the learner's mastery is lowest
 * on — each links into the curriculum so they can find and revisit it.
 */
export function PracticeHome() {
  const navigate = useNavigate();
  const lessons = useMasteryLessons();
  const [countStr, setCountStr] = useState(String(DEFAULT_QUESTIONS));

  const estMinutes = clampCount(Number(countStr) || DEFAULT_QUESTIONS) * DEFAULT_MINUTES_PER_QUESTION;

  const weakest = useMemo(
    () =>
      (lessons.data ?? [])
        .filter((l) => !l.mastered)
        .sort((a, b) => a.pL - b.pL)
        .slice(0, WEAKEST_ROWS),
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

      <section className="mc-weakest">
        <div className="mc-practice__standhead">
          <h2 className="mc-h3">Needs the most review</h2>
          {weakest.length > 0 ? (
            <p className="mc-muted mc-fineprint">
              The lessons your mastery is lowest on — tap one to find it in the curriculum.
            </p>
          ) : null}
        </div>
        {weakest.length > 0 ? (
          <div className="mc-weakest__rings">
            {weakest.map((l) => {
              const pct = Math.round(l.pL * 100);
              return (
                <Link
                  key={l.lessonId}
                  to={`/app/curriculum?lesson=${encodeURIComponent(l.lessonId)}`}
                  className="mc-weakest__ring"
                  aria-label={`${lessonTitle(l.lessonId)} — ${pct}% mastery. Open in curriculum.`}
                >
                  <MasteryRing pct={pct} />
                  <span className="mc-weakest__ringtitle">{lessonTitle(l.lessonId)}</span>
                </Link>
              );
            })}
          </div>
        ) : (
          <p className="mc-muted">
            Practice a few lessons and the ones you need to review most will show up here.
          </p>
        )}
      </section>
    </div>
  );
}
