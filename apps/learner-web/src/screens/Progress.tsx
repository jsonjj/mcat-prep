import { REASONING_OPERATION_INFO } from '@mcat/contracts';
import { Card, Eyebrow } from '@mcat/ui-web';
import { EvidenceAtlas } from '../components/EvidenceAtlas';
import { CarsReadiness } from '../components/CarsReadiness';
import { MasteryRing } from '../components/MasteryRing';
import { useMasterySkills } from '../app/queries';

const toPct = (p: number): number => Math.round(p * 100);

/**
 * The badge for BKT decay (`reviewDue`): this memory has decayed below the
 * review line and the capability estimate wants a fresh look.
 *
 * It is deliberately NOT the warrant's wording. "Evidence needs refreshing"
 * (`EVIDENCE_REFRESH_LABEL`, in `components/evidence-language.ts`) means the
 * supporting evidence has gone stale, which is a different authority answering a
 * different question. Both said "Needs refresh" until 2026-07-29. This one stays
 * here rather than moving into that module: the evidence module is the warrant's
 * copy, and putting a capability string in it would re-blur the boundary the
 * split exists to hold. This rail is its only site.
 */
const REVIEW_DUE_LABEL = 'Review due';

/**
 * Left rail — the seven app-wide reasoning skills as compact mastery rings. Same
 * data and semantics as the old Skills page (`useMasterySkills` → BKT P(L) pooled
 * across every lesson); mastered / review-due are shown with a glyph + label,
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
            const status = skill.reviewDue
              ? `, ${REVIEW_DUE_LABEL.toLowerCase()}`
              : skill.mastered
                ? ', mastered'
                : '';
            return (
              <li
                key={skill.operation}
                className="mc-skillring"
                aria-label={`${info.title}: ${pct}% mastery${status}`}
              >
                <MasteryRing pct={pct} mastered={skill.mastered} reviewDue={skill.reviewDue} />
                <span className="mc-skillring__label" aria-hidden="true">
                  <span className="mc-skillring__title">{info.title}</span>
                  {skill.reviewDue ? (
                    <span className="mc-skillring__tag">◐ {REVIEW_DUE_LABEL}</span>
                  ) : skill.mastered ? (
                    <span className="mc-skillring__tag mc-skillring__tag--mastered">★ Mastered</span>
                  ) : null}
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
  return (
    <div className="mc-screen mc-progressboard mc-progressboard--wide">
      <header className="mc-screen__head mc-progressboard__head">
        <h1 className="mc-h1">Progress</h1>
        <p className="mc-muted">
          Everything at a glance — your reasoning skills, the lessons you have mastered, and your CARS
          reading ability.
        </p>
      </header>

      <div className="mc-progressboard__grid">
        <SkillRail />

        <section className="mc-progressboard__center" aria-label="Lessons mastered — Evidence Atlas">
          <EvidenceAtlas />
        </section>

        <CarsReadiness compact />
      </div>
    </div>
  );
}
