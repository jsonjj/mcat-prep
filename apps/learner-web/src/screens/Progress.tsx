import { useNavigate } from 'react-router-dom';
import { REASONING_OPERATION_INFO } from '@mcat/contracts';
import { Button, Card, Eyebrow } from '@mcat/ui-web';
import { EvidenceAtlas } from '../components/EvidenceAtlas';
import { CarsReadiness } from '../components/CarsReadiness';
import { MasteryRing } from '../components/MasteryRing';
import { useMasterySkills } from '../app/queries';

const toPct = (p: number): number => Math.round(p * 100);

/**
 * Label for the CTA under the brain that opens the full curriculum. The final
 * wording is being decided separately — change THIS one constant to update it.
 */
const CURRICULUM_CTA_LABEL = 'Expand Lesson Mastery';

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
 * Left rail — the seven app-wide reasoning skills as compact mastery rings. Same
 * data and semantics as the old Skills page (`useMasterySkills` → BKT P(L) pooled
 * across every lesson); mastered / needs-refresh are shown with a glyph + label,
 * never color alone.
 */
function SkillRail() {
  const skills = useMasterySkills();
  const data = skills.data ?? [];

  return (
    <Card elevated className="mc-progressboard__rail mc-progressboard__rail--skills">
      <Eyebrow>Reasoning skills</Eyebrow>
      {skills.isLoading ? (
        <p className="mc-muted mc-fineprint">Loading your skills…</p>
      ) : data.length === 0 ? (
        <p className="mc-muted mc-fineprint">
          Answer questions on your own to start building skill mastery.
        </p>
      ) : (
        <ul className="mc-skillrings" aria-label="Reasoning skill mastery">
          {data.map((skill) => {
            const info = REASONING_OPERATION_INFO[skill.operation];
            const pct = toPct(skill.pL);
            const status = skill.refreshNeeded
              ? ', needs refresh'
              : skill.mastered
                ? ', mastered'
                : '';
            return (
              <li
                key={skill.operation}
                className="mc-skillring"
                aria-label={`${info.title}: ${pct}% mastery${status}`}
              >
                <MasteryRing pct={pct} mastered={skill.mastered} refreshNeeded={skill.refreshNeeded} />
                <span className="mc-skillring__label" aria-hidden="true">
                  <span className="mc-skillring__head">
                    <span className="mc-skillring__title">{info.title}</span>
                    {skill.refreshNeeded ? (
                      <span className="mc-skillring__tag">◐ Needs refresh</span>
                    ) : skill.mastered ? (
                      <span className="mc-skillring__tag mc-skillring__tag--mastered">★ Mastered</span>
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

/**
 * Progress — one merged dashboard (Concept B). All three evidence views show at
 * once, no tab switching: the reasoning-skill rings (left), the Evidence Atlas
 * brain as the hero (center), and CARS reading ability (right). On a laptop the
 * page widens past the usual 760px shell cap (via `.mc-progressboard--wide`, scoped so
 * no other screen changes) so the three zones sit side by side without scrolling;
 * it stacks vertically on narrower viewports.
 */
export function Progress() {
  const navigate = useNavigate();
  return (
    <div className="mc-screen mc-progressboard mc-progressboard--wide">
      <header className="mc-screen__head mc-progressboard__head">
        <h1 className="mc-h1">Progress</h1>
        <p className="mc-muted">
          Everything at a glance — your reasoning skills, the lessons you have mastered, and your CARS
          readiness.
        </p>
      </header>

      <div className="mc-progressboard__grid">
        <SkillRail />

        <section className="mc-progressboard__center" aria-label="Lessons mastered — Evidence Atlas">
          <div className="mc-masterykey">
            <span className="mc-masterykey__title">Lesson mastery</span>
            <ul className="mc-masterykey__items">
              <li className="mc-masterykey__item">
                <span className="mc-masterykey__dot mc-masterykey__dot--mastered" aria-hidden="true" />
                Mastered
              </li>
              <li className="mc-masterykey__item">
                <span className="mc-masterykey__dot mc-masterykey__dot--progress" aria-hidden="true" />
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
