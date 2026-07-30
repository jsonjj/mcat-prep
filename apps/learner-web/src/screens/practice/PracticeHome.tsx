import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, Card, Eyebrow, Stack } from '@mcat/ui-web';
import { ATLAS_REGION_GROUPS, DEFAULT_MINUTES_PER_QUESTION } from '@mcat/contracts';
import { CURRICULUM_PHASES } from '../../data/curriculum-v3.generated';
import { useMasteryLessons } from '../../app/queries';
import { MasteryRing } from '../../components/MasteryRing';
import { IconClock } from '../../components/icons';

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

/**
 * Practice hub: pick how many test-out reps to run (the only control that affects
 * the session), plus a read-only trio of the lessons the learner's mastery is lowest
 * on — each links into the curriculum so they can find and revisit it.
 */
export function PracticeHome() {
  const navigate = useNavigate();
  const lessons = useMasteryLessons();
  const [count, setCount] = useState(DEFAULT_QUESTIONS);

  const estMinutes = count * DEFAULT_MINUTES_PER_QUESTION;

  // The 3 lowest-mastery *unlocked* lessons: overlay real P(L) where the learner has an
  // entry, default the rest to the prior (`getMasteryLessons` only returns *practiced*
  // lessons, so a fresh learner has none — the catalog + prior keep the trio populated),
  // exclude locked/mastered. `weakest` is empty ONLY once every unlocked lesson is mastered.
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
    navigate('/app/practice/session', { state: { x: count } });
  };

  return (
    <div className="mc-screen mc-practice">
      <header className="mc-screen__head">
        <h1 className="mc-h1">Practice</h1>
      </header>

      <div className="mc-practice__cols">
        {/* LEFT — Practice questions. Fully functional: real mastery data + real
            navigation (count stepper → session, weakest rings → curriculum). */}
        <Card elevated className="mc-practice__card mc-practice__card--questions">
          <Stack gap={4}>
            <Eyebrow>Practice questions</Eyebrow>

            <div className="mc-practice__count">
              <h2 className="mc-h3">How many questions?</h2>
              {/* A −/+ stepper (not a bare input): two round buttons flank a large,
                  boxed live count. The group carries the accessible name; each
                  button says which direction it steps. */}
              <div className="mc-stepper" role="group" aria-label="Number of questions">
                <button
                  type="button"
                  className="mc-stepper__btn"
                  onClick={() => setCount((c) => clampCount(c - 1))}
                  disabled={count <= MIN_QUESTIONS}
                  aria-label="Fewer questions"
                >
                  &#8722;
                </button>
                <span className="mc-stepper__value" aria-live="polite">
                  {count}
                </span>
                <button
                  type="button"
                  className="mc-stepper__btn"
                  onClick={() => setCount((c) => clampCount(c + 1))}
                  disabled={count >= MAX_QUESTIONS}
                  aria-label="More questions"
                >
                  +
                </button>
              </div>
              <span className="mc-practice__esttime">&#8776; {estMinutes} min</span>
            </div>

            <Button
              variant="primary"
              size="lg"
              fullWidth
              onClick={start}
              className="mc-practice__start"
            >
              Start practice
            </Button>

            <hr className="mc-practice__rule" />

            <section className="mc-weakest">
              <h2 className="mc-h3 mc-weakest__title">Your three weakest lessons</h2>
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
                        <MasteryRing pct={pct} tone="review" />
                        <span className="mc-weakest__ringtitle">{lessonTitle(l.lessonId)}</span>
                        <span className="mc-weakest__review" aria-hidden="true">
                          Review &rarr;
                        </span>
                      </Link>
                    );
                  })}
                </div>
              ) : (
                // Reachable only when every unlocked lesson is already mastered — a
                // positive state, not a "no data yet" prompt.
                <p className="mc-muted">
                  You&rsquo;ve mastered every lesson unlocked so far — nice work. New weak spots
                  will appear here as you unlock more.
                </p>
              )}
            </section>
          </Stack>
        </Card>

        {/* RIGHT — Practice test. Presentational ONLY: the test engine is deferred,
            so there is no data yet. Every region shows an honest empty state laid
            out where its real content will live; no scores/ranges/trends are faked. */}
        <Card elevated className="mc-practice__card mc-practice__card--test">
          <Stack gap={4}>
            <div className="mc-testdash__head">
              <Eyebrow>Practice test</Eyebrow>
              <h2 className="mc-h3">Practice Test</h2>
              <p className="mc-muted mc-testdash__sub">about 90 min &middot; scored</p>
            </div>

            <hr className="mc-practice__rule" />

            <div className="mc-testdash__grid">
              <section className="mc-testdash__section mc-testdash__trends">
                <h3 className="mc-label">Improvement over time</h3>
                <div
                  className="mc-emptyframe mc-emptyframe--chart"
                  role="img"
                  aria-label="No section trends yet"
                >
                  <p className="mc-emptyframe__note mc-muted">
                    Your section trends will appear here after your first checkpoint.
                  </p>
                </div>
              </section>

              <div className="mc-testdash__side">
                <section className="mc-testdash__stat">
                  <h3 className="mc-label">Readiness</h3>
                  <p className="mc-testdash__empty mc-muted">Available after your first test.</p>
                </section>
                <section className="mc-testdash__stat">
                  <h3 className="mc-label">Estimated range</h3>
                  <p className="mc-testdash__empty mc-muted">Available after your first test.</p>
                </section>
              </div>
            </div>

            <section className="mc-testdash__section">
              <h3 className="mc-label">Past tests</h3>
              <div className="mc-emptyframe mc-emptyframe--strip">
                <p className="mc-emptyframe__note mc-muted">No tests yet.</p>
              </div>
            </section>

            <button type="button" className="mc-teststart" disabled aria-label="Start test — coming soon">
              <span className="mc-teststart__main">
                <IconClock className="mc-teststart__icon" />
                <span className="mc-teststart__label">Start test</span>
              </span>
              <span className="mc-teststart__soon">coming soon</span>
            </button>
          </Stack>
        </Card>
      </div>
    </div>
  );
}
