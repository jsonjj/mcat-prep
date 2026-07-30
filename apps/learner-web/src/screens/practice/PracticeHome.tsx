import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, Card, Eyebrow, Stack } from '@mcat/ui-web';
import { ATLAS_REGION_GROUPS, DEFAULT_MINUTES_PER_QUESTION } from '@mcat/contracts';
import { CURRICULUM_PHASES } from '../../data/curriculum-v3.generated';
import { useMasteryLessons } from '../../app/queries';
import { MasteryRing } from '../../components/MasteryRing';

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

  // The disabled "Start test" note is associated with the button via aria-describedby.
  const soonId = 'mc-test-soon';

  return (
    <div className="mc-screen mc-practice">
      <header className="mc-screen__head">
        <h1 className="mc-h1">Practice</h1>
        <p className="mc-practice__intro">
          Practice pulls fresh questions from lessons you’ve already finished. Get it right on the
          first try — no hints — and your mastery goes up. It’s untimed, so stop whenever you like.
        </p>
      </header>

      <div className="mc-practice__cols">
        {/* LEFT — Practice questions. Fully functional: real mastery data + real
            navigation (count control → session, weakest rings → curriculum). */}
        <Card elevated className="mc-practice__card mc-practice__card--questions">
          <Stack gap={5}>
            <Eyebrow>Practice questions</Eyebrow>

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

            <Button
              variant="primary"
              size="lg"
              fullWidth
              onClick={start}
              className="mc-practice__start"
            >
              Start practice
            </Button>

            <section className="mc-weakest">
              <div className="mc-practice__standhead">
                <h2 className="mc-h3">Your three weakest lessons</h2>
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
                        <MasteryRing pct={pct} tone="review" />
                        <span className="mc-weakest__ringtitle">{lessonTitle(l.lessonId)}</span>
                        <span className="mc-weakest__review" aria-hidden="true">
                          Review →
                        </span>
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
          </Stack>
        </Card>

        {/* RIGHT — Practice test. Presentational ONLY: the test engine is deferred,
            so there is no data yet. Every region shows an honest empty state; no
            scores, ranges, or trends are fabricated. */}
        <Card elevated className="mc-practice__card mc-practice__card--test">
          <Stack gap={5}>
            <div className="mc-testdash__head">
              <Eyebrow>Practice test</Eyebrow>
              <h2 className="mc-h3">Practice Test</h2>
              <p className="mc-muted">Half-length · about 90 min · scored</p>
            </div>

            <div className="mc-testdash__start">
              <Button
                variant="primary"
                size="lg"
                disabled
                aria-label="Start test"
                aria-describedby={soonId}
              >
                Start test
              </Button>
              <p className="mc-muted mc-fineprint mc-testdash__soon" id={soonId}>
                Coming soon — the test itself is still in design.
              </p>
            </div>

            <section className="mc-testdash__section">
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

            <div className="mc-testdash__stats">
              <section className="mc-testdash__stat">
                <h3 className="mc-label">Readiness</h3>
                <p className="mc-testdash__empty mc-muted">Available after your first test.</p>
              </section>
              <section className="mc-testdash__stat">
                <h3 className="mc-label">Estimated range</h3>
                <p className="mc-testdash__empty mc-muted">Available after your first test.</p>
              </section>
            </div>

            <section className="mc-testdash__section">
              <h3 className="mc-label">Past tests</h3>
              <div className="mc-emptyframe">
                <p className="mc-emptyframe__note mc-muted">No tests yet.</p>
              </div>
            </section>
          </Stack>
        </Card>
      </div>
    </div>
  );
}
