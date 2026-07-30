import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, Card, Eyebrow, Stack } from '@mcat/ui-web';
import {
  ATLAS_REGION_GROUPS,
  DEFAULT_MINUTES_PER_QUESTION,
  type EstimatedScoreRange,
  type PastPracticeTest,
  type PracticeReadinessLabel,
  type Section,
} from '@mcat/contracts';
import { CURRICULUM_PHASES } from '../../data/curriculum-v3.generated';
import { useMasteryLessons, usePracticeTestSummary } from '../../app/queries';
import { useLaunchPlanActivity, useTodaysPath } from '../../app/today-queries';
import { MasteryRing } from '../../components/MasteryRing';
import { IconCheck, IconClock } from '../../components/icons';

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

/**
 * Global teaching-order rank (phase → module → position) for every atlas lesson.
 * Used only to break ties when two done lessons share a P(L) (earlier-taught first).
 */
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

  // The 3 weakest lessons the learner has actually DONE. `getMasteryLessons` returns a row
  // only for lessons that carry real practice evidence — a fresh learner gets none — which
  // is exactly the "finished" set Practice draws its questions from ("Practice pulls fresh
  // questions from lessons you've already finished"). So the trio is ranked straight from
  // those rows, never the full catalog with a BKT-prior overlay of un-started lessons.
  // Sorted by P(L) ascending (earlier-taught breaks ties) and capped at three; the lowest
  // three show even when every done lesson is already mastered. Empty ONLY when nothing is
  // done yet, which is the single "do a lesson first" state.
  const weakest = useMemo(() => {
    return [...(lessons.data ?? [])]
      .sort(
        (a, b) =>
          a.pL - b.pL ||
          (LESSON_ORDER.get(a.lessonId) ?? Number.MAX_SAFE_INTEGER) -
            (LESSON_ORDER.get(b.lessonId) ?? Number.MAX_SAFE_INTEGER),
      )
      .slice(0, WEAKEST_ROWS);
  }, [lessons.data]);

  // Practice-TEST dashboard summary, now served from the learner's REAL completed
  // sittings (WS5). Until they have taken one it resolves to null → the card keeps
  // its empty/next-due states; once a test is scored each region fills from the
  // summary. A present-but-empty summary reads the same as a missing one;
  // `dashboard` is the non-null value the regions render from.
  const testSummary = usePracticeTestSummary();
  const summary = testSummary.data ?? null;
  const dashboard = summary !== null && summary.pastTests.length > 0 ? summary : null;

  // A practice test is startable when today's plan reserved one that has not been
  // run yet (the plan owns cadence + length tier). Launching it goes through the
  // shared plan-activity runner path, and the serve boundary re-checks the §6
  // cadence, so a stale tile can never start an off-cadence sitting.
  const todaysPath = useTodaysPath();
  const launch = useLaunchPlanActivity();
  const dueTest =
    todaysPath.data?.activities.find(
      (a) => a.kind === 'practice_test' && a.status !== 'complete' && a.status !== 'skipped',
    ) ?? null;

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
                // Reachable ONLY before the learner has finished a single lesson: Practice
                // pulls fresh questions from finished lessons, so there is nothing to rank
                // yet. Preview the three rings that WILL populate here with muted, dashed
                // GHOST skeletons (no real numbers, no navigation), then the copy that
                // explains what fills them — so the section reads as "three rings will show
                // up once you finish lessons" rather than as an empty line of text.
                <div className="mc-weakest__empty">
                  <div className="mc-weakest__rings mc-weakest__rings--ghost" aria-hidden="true">
                    {[0, 1, 2].map((i) => (
                      <div key={i} className="mc-weakest__ghost">
                        <svg className="mc-ring mc-ring--ghost" viewBox="0 0 100 100" aria-hidden="true">
                          <circle
                            className="mc-ring__track mc-ring__track--ghost"
                            cx="50"
                            cy="50"
                            r="42"
                          />
                          <circle
                            className="mc-ring__arc mc-ring__arc--ghost"
                            cx="50"
                            cy="50"
                            r="42"
                          />
                          <text
                            className="mc-ring__ghostmark"
                            x="50"
                            y="50"
                            dominantBaseline="central"
                            textAnchor="middle"
                          >
                            &mdash;
                          </text>
                        </svg>
                        <span className="mc-weakest__ringtitle mc-weakest__ghosttitle">Lesson</span>
                      </div>
                    ))}
                  </div>
                  <p className="mc-muted">
                    Finish a lesson to see your weakest spots here — Practice pulls fresh questions
                    from lessons you&rsquo;ve already finished.
                  </p>
                </div>
              )}
            </section>
          </Stack>
        </Card>

        {/* RIGHT — Practice test. The scored-test engine is deferred, so the real
            backend serves no summary and `dashboard` is null: every region shows the
            same honest empty state laid out where its real content will live, and
            nothing is faked. When a summary IS present (today, only the local mastery
            simulator), each region fills in from it — no other visual change. */}
        <Card elevated className="mc-practice__card mc-practice__card--test">
          <Stack gap={4}>
            <div className="mc-testdash__head">
              <Eyebrow>Practice test</Eyebrow>
              <h2 className="mc-h3">Practice Test</h2>
              <p className="mc-muted mc-testdash__sub">
                {dueTest ? `about ${dueTest.estimatedMinutes} min · scored` : 'scored · length adapts'}
              </p>
            </div>

            <hr className="mc-practice__rule" />

            <div className="mc-testdash__grid">
              <section className="mc-testdash__section mc-testdash__trends">
                <h3 className="mc-label">Improvement over time</h3>
                {dashboard ? (
                  <TrendChart pastTests={dashboard.pastTests} />
                ) : (
                  <div
                    className="mc-emptyframe mc-emptyframe--chart"
                    role="img"
                    aria-label="No section trends yet"
                  >
                    <p className="mc-emptyframe__note mc-muted">
                      Your section trends will appear here after your first checkpoint.
                    </p>
                  </div>
                )}
              </section>

              <div className="mc-testdash__side">
                <section className="mc-testdash__stat">
                  <h3 className="mc-label">Readiness</h3>
                  {dashboard ? (
                    <ReadinessPill label={dashboard.readinessLabel} />
                  ) : (
                    <p className="mc-testdash__empty mc-muted">Available after your first test.</p>
                  )}
                </section>
                <section className="mc-testdash__stat">
                  <h3 className="mc-label">Estimated range</h3>
                  {dashboard ? (
                    <EstimatedRange range={dashboard.estimatedScore} />
                  ) : (
                    <p className="mc-testdash__empty mc-muted">Available after your first test.</p>
                  )}
                </section>
              </div>
            </div>

            <section className="mc-testdash__section">
              <h3 className="mc-label">Past tests</h3>
              {dashboard ? (
                <PastTestsStrip pastTests={dashboard.pastTests} />
              ) : (
                <div className="mc-emptyframe mc-emptyframe--strip">
                  <p className="mc-emptyframe__note mc-muted">No tests yet.</p>
                </div>
              )}
            </section>

            {dueTest ? (
              <button
                type="button"
                className="mc-teststart mc-teststart--ready"
                onClick={() => launch(dueTest)}
                aria-label={`Start practice test — about ${dueTest.estimatedMinutes} minutes`}
              >
                <span className="mc-teststart__main">
                  <IconClock className="mc-teststart__icon" />
                  <span className="mc-teststart__label">Start test</span>
                </span>
                <span className="mc-teststart__soon">&#8776; {dueTest.estimatedMinutes} min</span>
              </button>
            ) : (
              <button
                type="button"
                className="mc-teststart"
                disabled
                aria-label="No practice test due yet"
              >
                <span className="mc-teststart__main">
                  <IconClock className="mc-teststart__icon" />
                  <span className="mc-teststart__label">Start test</span>
                </span>
                <span className="mc-teststart__soon">
                  {dashboard ? 'next one on your plan' : 'after your first checkpoint'}
                </span>
              </button>
            )}
          </Stack>
        </Card>
      </div>
    </div>
  );
}

// --- Practice-test dashboard (populated states) --------------------------------
// Rendered ONLY when a summary is present (today, only from the local mastery
// simulator). Pure presentation of the DTO — a dependency-free SVG line chart, a
// readiness pill, a semicircular estimated-range gauge, and a past-tests strip —
// laid out in the same regions the empty states occupy.

/** The four MCAT sections, in chart order, with their short labels + colour class. */
const TREND_SECTIONS: ReadonlyArray<{ section: Section; label: string; cls: string }> = [
  { section: 'cp', label: 'C/P', cls: 'cp' },
  { section: 'cars', label: 'CARS', cls: 'cars' },
  { section: 'bb', label: 'B/B', cls: 'bb' },
  { section: 'ps', label: 'P/S', cls: 'ps' },
];

const READINESS_TEXT: Record<PracticeReadinessLabel, string> = {
  building: 'Building',
  approaching: 'Approaching',
  on_track: 'On track',
};

/** UTC month/day, so a fixed timestamp renders the same date in every timezone. */
const testDateLabel = (iso: string): string =>
  new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });

const round1 = (v: number): number => Math.round(v * 10) / 10;

/**
 * "Improvement over time": one line per section, plotting each past test's
 * %-correct in chronological order inside a subtly tinted, framed plot area.
 * Dependency-free SVG; a single point renders as a dot (no line). The section %s
 * ARE the trend — there is no separate series. The last point of each line gets a
 * hollow marker so the eye lands on "where they are now".
 */
function TrendChart({ pastTests }: { pastTests: readonly PastPracticeTest[] }) {
  const W = 336;
  const H = 184;
  const ml = 34;
  const mr = 14;
  const mt = 12;
  const mb = 34;
  const plotW = W - ml - mr;
  const plotH = H - mt - mb;
  const plotR = ml + plotW;
  const plotB = mt + plotH;
  const n = pastTests.length;
  const xAt = (i: number): number => ml + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const yAt = (pct: number): number => mt + (1 - Math.max(0, Math.min(100, pct)) / 100) * plotH;
  const gridlines = [0, 25, 50, 75, 100];
  const series = TREND_SECTIONS.map((s) => {
    const pts = pastTests
      .map((t, i) => {
        const score = t.sections.find((x) => x.section === s.section);
        return score ? { x: xAt(i), y: yAt(score.pctCorrect) } : null;
      })
      .filter((p): p is { x: number; y: number } => p !== null);
    return { ...s, pts };
  });
  return (
    <div className="mc-trend">
      <svg
        className="mc-trend__svg"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Section percent-correct across ${n} past test${n === 1 ? '' : 's'}`}
      >
        {/* A soft tinted panel + hairline frame so the chart reads as its own surface. */}
        <rect
          className="mc-trend__plot"
          x={ml}
          y={mt}
          width={plotW}
          height={plotH}
          rx={10}
        />
        {gridlines.map((g) => (
          <g key={g}>
            {/* 0% / 100% ride the frame; only the interior lines are drawn. */}
            {g > 0 && g < 100 ? (
              <line
                className="mc-trend__grid"
                x1={ml}
                y1={round1(yAt(g))}
                x2={plotR}
                y2={round1(yAt(g))}
              />
            ) : null}
            <text className="mc-trend__axis" x={ml - 8} y={round1(yAt(g)) + 3} textAnchor="end">
              {g}%
            </text>
          </g>
        ))}
        {pastTests.map((t, i) => (
          <text
            key={t.testId}
            className="mc-trend__axis"
            x={round1(xAt(i))}
            y={plotB + 18}
            textAnchor="middle"
          >
            {testDateLabel(t.takenOn)}
          </text>
        ))}
        {series.map((l) => (
          <g key={l.section} className={`mc-trend__series mc-trend__series--${l.cls}`}>
            {l.pts.length > 1 ? (
              <polyline
                className="mc-trend__line"
                points={l.pts.map((p) => `${round1(p.x)},${round1(p.y)}`).join(' ')}
              />
            ) : null}
            {l.pts.map((p, i) => (
              <circle
                key={i}
                className={
                  i === l.pts.length - 1 ? 'mc-trend__dot mc-trend__dot--last' : 'mc-trend__dot'
                }
                cx={round1(p.x)}
                cy={round1(p.y)}
                r={i === l.pts.length - 1 ? 3.8 : 3}
              />
            ))}
          </g>
        ))}
      </svg>
      <ul className="mc-trend__legend">
        {TREND_SECTIONS.map((s) => (
          <li key={s.section} className={`mc-trend__key mc-trend__key--${s.cls}`}>
            <span className="mc-trend__swatch" aria-hidden="true" />
            {s.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Readiness band as a pill: a check for on-track, a status dot otherwise. */
function ReadinessPill({ label }: { label: PracticeReadinessLabel }) {
  return (
    <span className={`mc-readypill mc-readypill--${label}`}>
      {label === 'on_track' ? (
        <IconCheck className="mc-readypill__icon" />
      ) : (
        <span className="mc-readypill__dot" aria-hidden="true" />
      )}
      {READINESS_TEXT[label]}
    </span>
  );
}

/** Estimated scaled-score RANGE as a semicircular gauge — a band, never a point. */
function EstimatedRange({ range }: { range: EstimatedScoreRange }) {
  const MIN = 472;
  const MAX = 528;
  const center = (range.low + range.high) / 2;
  const frac = Math.max(0, Math.min(1, (center - MIN) / (MAX - MIN)));
  const R = 80;
  const cx = 100;
  const cy = 92;
  const arcLen = Math.PI * R;
  const arc = `M${cx - R},${cy} A${R},${R} 0 0 1 ${cx + R},${cy}`;
  return (
    <div className="mc-estrange">
      <svg
        className="mc-estrange__svg"
        viewBox="0 0 200 108"
        role="img"
        aria-label={`Estimated scaled score ${range.low} to ${range.high}`}
      >
        <path className="mc-estrange__track" d={arc} />
        <path
          className="mc-estrange__fill"
          d={arc}
          strokeDasharray={`${round1(frac * arcLen)} ${round1(arcLen)}`}
        />
        <text className="mc-estrange__value" x={cx} y={cy - 16} textAnchor="middle">
          {range.low}&ndash;{range.high}
        </text>
      </svg>
      <p className="mc-estrange__note mc-muted">estimate, not a single score</p>
    </div>
  );
}

/** Horizontal strip of past tests + a deferred "next test" placeholder. */
function PastTestsStrip({ pastTests }: { pastTests: readonly PastPracticeTest[] }) {
  return (
    <div className="mc-pasttests">
      {pastTests.map((t) => {
        const overall = Math.round(
          t.sections.reduce((sum, s) => sum + s.pctCorrect, 0) / Math.max(1, t.sections.length),
        );
        return (
          <div key={t.testId} className="mc-pasttest">
            <div className="mc-pasttest__name">{t.label}</div>
            <div className="mc-pasttest__date">{testDateLabel(t.takenOn)}</div>
            <div className="mc-pasttest__score">
              {t.scaledScore}
              <span className="mc-pasttest__pct">{overall}%</span>
            </div>
            {t.reviewed ? (
              <span className="mc-pasttest__reviewed">
                <IconCheck className="mc-pasttest__reviewedicon" />
                Reviewed
              </span>
            ) : (
              <span className="mc-pasttest__pending">Review due</span>
            )}
          </div>
        );
      })}
      <div className="mc-pasttest mc-pasttest--next" aria-hidden="true">
        <IconClock className="mc-pasttest__nexticon" />
        <div className="mc-pasttest__name">Next test</div>
        <div className="mc-pasttest__date mc-muted">Coming soon</div>
      </div>
    </div>
  );
}
