import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { REASONING_OPERATION_INFO } from '@mcat/contracts';
import { Button, Card, Eyebrow } from '@mcat/ui-web';
import { EvidenceAtlas } from '../components/EvidenceAtlas';
import { CarsReadiness } from '../components/CarsReadiness';
import { MasteryRing } from '../components/MasteryRing';
import { useCarsReadiness, useMasteryLessons, useMasterySkills } from '../app/queries';

const toPct = (p: number): number => Math.round(p * 100);

/**
 * On-open stagger between reasoning-skill rings — a gentle cascade that echoes the
 * brain reveal; kept small so the last ring still lands within the ~3s count-up window.
 */
const RING_STAGGER_MS = 40;

/**
 * Label for the CTA under the brain that opens the full curriculum. A calm, plain
 * pointer to the map — it names the destination and makes no mastery claim (that
 * claim lives on the Evidence Atlas, not on a button).
 */
const CURRICULUM_CTA_LABEL = 'Open the curriculum';

/**
 * Plain-language descriptions for the 7 reasoning skills, shown on Progress. Kept
 * local (the canonical REASONING_OPERATION_INFO.description is unchanged) and short
 * so each stays within two lines in the rail.
 */
const SKILL_BLURB: Record<string, string> = {
  IDENTIFY: 'Recognize or recall a concept.',
  PREDICT: 'Given a cause, figure out its effect.',
  EXPLAIN: 'Work backward from a result to why it happened.',
  RELATE: 'See how concepts relate, contrast, or map together.',
  QUANTIFY: 'Apply the right formula to reach a result.',
  DESIGN: 'Evaluate the soundness of a study or method.',
  EVIDENCE: 'Decide what conclusions the data actually support.',
};

/**
 * The badge for BKT decay (`reviewDue`): this memory has decayed below the review
 * line and the capability estimate wants a fresh look. Deliberately NOT the
 * warrant's "Evidence needs refreshing" wording — a different authority answering a
 * different question.
 */
const REVIEW_DUE_LABEL = 'Review due';

/**
 * The badge for a reasoning skill whose BKT `P(L)` has reached the capability cut.
 * This rail carries no evidence warrant, so it may describe the estimate ("Strong")
 * but must not make the mastery claim — that claim lives on the Evidence Atlas.
 */
const AT_CAPABILITY_CUT_LABEL = 'Strong';

/**
 * Left rail — the seven app-wide reasoning skills as compact capability rings. Same
 * data and semantics as the old Skills page (`useMasterySkills` → BKT P(L) pooled
 * across every lesson); strong / review-due are shown with a glyph + label, never
 * color alone. Each ring also carries a short plain-language description (SKILL_BLURB).
 */
function SkillRail() {
  const skills = useMasterySkills();
  const data = skills.data ?? [];

  return (
    <Card elevated className="mc-progressboard__rail mc-progressboard__rail--skills">
      <Eyebrow>Reasoning skills</Eyebrow>
      {skills.isError ? (
        // A failed read must not read as "you haven't started" (the empty copy below).
        <p className="mc-muted mc-fineprint">
          We couldn’t load your skills just now.{' '}
          <button type="button" className="mc-textbtn" onClick={() => void skills.refetch()}>
            Try again
          </button>
        </p>
      ) : skills.isLoading ? (
        <p className="mc-muted mc-fineprint" role="status">
          Loading your skills…
        </p>
      ) : data.length === 0 ? (
        <p className="mc-muted mc-fineprint">
          Answer questions on your own to start building skill mastery.
        </p>
      ) : (
        <ul className="mc-skillrings" aria-label="Reasoning skill mastery">
          {data.map((skill, index) => {
            const info = REASONING_OPERATION_INFO[skill.operation];
            const pct = toPct(skill.pL);
            const status = skill.reviewDue
              ? `, ${REVIEW_DUE_LABEL.toLowerCase()}`
              : skill.atCapabilityCut
                ? `, ${AT_CAPABILITY_CUT_LABEL.toLowerCase()}`
                : '';
            return (
              <li
                key={skill.operation}
                className="mc-skillring"
                aria-label={`${info.title}: ${pct}%${status}`}
              >
                <MasteryRing
                  pct={pct}
                  atCapabilityCut={skill.atCapabilityCut}
                  reviewDue={skill.reviewDue}
                  animateOnMount
                  animationDelayMs={index * RING_STAGGER_MS}
                />
                <span className="mc-skillring__label" aria-hidden="true">
                  <span className="mc-skillring__head">
                    <span className="mc-skillring__title">{info.title}</span>
                    {skill.reviewDue ? (
                      <span className="mc-skillring__tag">◐ {REVIEW_DUE_LABEL}</span>
                    ) : skill.atCapabilityCut ? (
                      <span className="mc-skillring__tag mc-skillring__tag--atcut">
                        ★ {AT_CAPABILITY_CUT_LABEL}
                      </span>
                    ) : null}
                  </span>
                  <span className="mc-skillring__desc">
                    {SKILL_BLURB[skill.operation] ?? info.description}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

const MCAT_MIN = 472;
const MCAT_MAX = 528;

const mean = (xs: readonly number[]): number =>
  xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;
const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));

/**
 * A deliberately simple readiness → score estimate. We blend the evidence we already
 * have on this page — lesson mastery and reasoning-skill capability (the three
 * science/reasoning sections, weighted 3) with CARS reading ability (one section,
 * weighted 1) — into a single 0–1 readiness, then map it linearly onto the 472–528
 * MCAT scale. Only the signals a learner actually has are counted, so someone who
 * hasn't touched CARS yet isn't dragged down by a missing section. This is a
 * motivational estimate from in-app evidence, not an official AAMC score predictor.
 */
function estimateMcatScore(input: {
  readonly lessons?: readonly { readonly pL: number }[];
  readonly skills?: readonly { readonly pL: number }[];
  readonly cars?: { readonly overallPct: number } | undefined;
}): number | null {
  const content: number[] = [];
  if (input.lessons && input.lessons.length > 0) content.push(mean(input.lessons.map((l) => l.pL)));
  if (input.skills && input.skills.length > 0) content.push(mean(input.skills.map((s) => s.pL)));
  const hasContent = content.length > 0;
  const hasCars = input.cars !== undefined;
  if (!hasContent && !hasCars) return null;

  const parts: { value: number; weight: number }[] = [];
  if (hasContent) parts.push({ value: mean(content), weight: 3 });
  if (hasCars) parts.push({ value: clamp01(input.cars?.overallPct ?? 0), weight: 1 });
  const readiness =
    parts.reduce((a, p) => a + p.value * p.weight, 0) / parts.reduce((a, p) => a + p.weight, 0);

  return Math.round(MCAT_MIN + clamp01(readiness) * (MCAT_MAX - MCAT_MIN));
}

/**
 * The estimated-score hero box. Sits at the top-center of the dashboard (above the
 * lesson-mastery key) as a plain white card: a big number, a label, and a small "?"
 * in the top-right that toggles a one-paragraph, plain-language explanation of how the
 * estimate is derived. Reuses the same three reads the rest of the page already loads,
 * so it adds no new network cost.
 */
function EstimatedScore() {
  const lessons = useMasteryLessons();
  const skills = useMasterySkills();
  const cars = useCarsReadiness();
  const [showInfo, setShowInfo] = useState(false);

  const score = estimateMcatScore({
    lessons: lessons.data,
    skills: skills.data,
    cars: cars.data ?? undefined,
  });
  const stillLoading = lessons.isLoading || skills.isLoading || cars.isLoading;

  return (
    <div className="mc-scorebox">
      <button
        type="button"
        className="mc-scorebox__info"
        aria-label="How is this score estimated?"
        aria-expanded={showInfo}
        onClick={() => setShowInfo((v) => !v)}
      >
        ?
      </button>
      <span className="mc-scorebox__label">Estimated MCAT score</span>
      {score !== null ? (
        <>
          <span className="mc-scorebox__value">{score}</span>
          <span className="mc-scorebox__hint">on the 472–528 scale</span>
        </>
      ) : stillLoading ? (
        <span className="mc-scorebox__value mc-scorebox__value--muted" role="status">
          …
        </span>
      ) : (
        <>
          <span className="mc-scorebox__value mc-scorebox__value--muted">—</span>
          <span className="mc-scorebox__hint">Finish a few lessons to see your estimate.</span>
        </>
      )}
      {showInfo ? (
        <div className="mc-scorebox__popover" role="dialog" aria-label="How this score is estimated">
          <p>
            A quick estimate from your evidence so far: your lesson mastery and reasoning skills
            (about ¾) plus your CARS reading ability (about ¼), placed on the 472–528 MCAT scale.
          </p>
          <p className="mc-scorebox__fine">
            It moves as you learn, and it’s a guide — not an official score predictor.
          </p>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Progress — one merged dashboard (Concept B). All three evidence views show at
 * once, no tab switching: the reasoning-skill rings (left), the Evidence Atlas
 * brain as the hero (center), and CARS readiness (right). On a laptop the page
 * widens past the usual 760px shell cap (via `.mc-progressboard--wide`, scoped so
 * no other screen changes) so the three zones sit side by side without scrolling;
 * it stacks vertically on narrower viewports.
 */
export function Progress() {
  const navigate = useNavigate();
  return (
    <div className="mc-screen mc-progressboard mc-progressboard--wide">
      <header className="mc-screen__head mc-progressboard__head">
        <h1 className="mc-h1">Progress</h1>
      </header>

      <div className="mc-progressboard__grid">
        <SkillRail />

        <section className="mc-progressboard__center" aria-label="Lessons mastered — Evidence Atlas">
          <EstimatedScore />
          <div className="mc-masterykey">
            <span className="mc-masterykey__title">Lesson mastery</span>
            <ul className="mc-masterykey__items">
              <li className="mc-masterykey__item">
                <span
                  className="mc-masterykey__dot mc-masterykey__dot--mastered"
                  aria-hidden="true"
                />
                Mastered
              </li>
              <li className="mc-masterykey__item">
                <span
                  className="mc-masterykey__dot mc-masterykey__dot--progress"
                  aria-hidden="true"
                />
                In progress
              </li>
              <li className="mc-masterykey__item">
                <span className="mc-masterykey__dot mc-masterykey__dot--locked" aria-hidden="true" />
                Locked
              </li>
            </ul>
          </div>
          <EvidenceAtlas />
          <Button
            variant="primary"
            size="lg"
            className="mc-progressboard__cta"
            onClick={() => navigate('/app/curriculum')}
          >
            {CURRICULUM_CTA_LABEL}
          </Button>
        </section>

        <CarsReadiness compact />
      </div>
    </div>
  );
}
