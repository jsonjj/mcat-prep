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

// --- Provisional lesson-unlock frontier (mirrors EvidenceAtlas / the brain) -------------
// P(L) is only tracked per-lesson once a lesson is touched, so "weakest" is computed over
// the full unlocked catalog: real P(L) where we have it, the BKT prior otherwise. This keeps
// the trio in sync with the brain and non-empty even before any practice. Replaced by the
// authored prerequisite map later (unlocked = all prerequisites mastered).
const PRIOR_PL = 0.2;
const UNLOCK_WINDOW = 12;

/** Global teaching-order rank (phase → module → position) for every atlas lesson. */
const LESSON_ORDER: Map<string, number> = (() => {
  const meta = new Map<string, { phaseOrder: number; moduleOrder: number; position: number }>();
  for (const phase of CURRICULUM_PHASES)
    for (const mod of phase.modules)
      for (const lesson of mod.lessons)
        meta.set(lesson.id, {
          phaseOrder: phase.order,
          moduleOrder: mod.order,
          position: lesson.position,
        });
  const ranked = ATLAS_REGION_GROUPS.flatMap((rg) => rg.lessons.map((l) => l.lesson_id))
    .map((id) => ({ id, m: meta.get(id) }))
    .sort(
      (a, b) =>
        (a.m?.phaseOrder ?? 999) - (b.m?.phaseOrder ?? 999) ||
        (a.m?.moduleOrder ?? 999) - (b.m?.moduleOrder ?? 999) ||
        (a.m?.position ?? Number.MAX_SAFE_INTEGER) - (b.m?.position ?? Number.MAX_SAFE_INTEGER),
    );
  const map = new Map<string, number>();
  ranked.forEach((r, i) => map.set(r.id, i));
  return map;
})();

/** Full atlas lesson catalog (id + title), the source of truth for the "weakest" trio. */
const LESSON_CATALOG: Array<{ id: string; title: string }> = ATLAS_REGION_GROUPS.flatMap((rg) =>
  rg.lessons.map((l) => ({ id: l.lesson_id, title: l.title })),
);

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

  // The 3 lowest-mastery *unlocked* lessons: overlay real P(L) where the learner has an
  // entry, default the rest to the prior, exclude locked/mastered — so it's never empty and
  // stays consistent with the brain (see the frontier model above).
  const weakest = useMemo(() => {
    const byId = new Map((lessons.data ?? []).map((l) => [l.lessonId, l] as const));
    const masteredCount = (lessons.data ?? []).filter((l) => l.mastered).length;
    return LESSON_CATALOG.map(({ id }) => {
      const entry = byId.get(id);
      const pL = entry?.pL ?? PRIOR_PL;
      const mastered = entry?.mastered ?? false;
      const rank = LESSON_ORDER.get(id) ?? Number.MAX_SAFE_INTEGER;
      const locked = !(mastered || entry !== undefined || rank < masteredCount + UNLOCK_WINDOW);
      return { lessonId: id, pL, mastered, locked, rank };
    })
      .filter((l) => !l.locked && !l.mastered)
      .sort((a, b) => a.pL - b.pL || a.rank - b.rank)
      .slice(0, WEAKEST_ROWS);
  }, [lessons.data]);

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
