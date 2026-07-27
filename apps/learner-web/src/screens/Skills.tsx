import { REASONING_OPERATION_INFO } from '@mcat/contracts';
import { Callout } from '@mcat/ui-web';
import { useMasterySkills } from '../app/queries';

const toPct = (p: number): number => Math.round(p * 100);

/**
 * The Skills page shows the seven reasoning skills as mastery percentages driven
 * by the BKT engine (`P(L)` per operation, pooled across every lesson). Mastered
 * and "needs refresh" are conveyed by a glyph + label, never color alone.
 */
export function Skills() {
  const skills = useMasterySkills();
  const data = skills.data ?? [];

  return (
    <div className="mc-screen">
      <header className="mc-screen__head">
        <h1 className="mc-h1">Skills</h1>
        <p className="mc-muted">
          Your seven reasoning skills, shown as current mastery. Each pools every question you answer
          on your own, across all lessons.
        </p>
      </header>

      {skills.isLoading ? (
        <Callout tone="info">Loading your skills…</Callout>
      ) : data.length === 0 ? (
        <Callout tone="info">Answer questions on your own to start building skill mastery.</Callout>
      ) : (
        <ul className="mc-skillbars" aria-label="Reasoning skill mastery">
          {data.map((skill) => {
            const info = REASONING_OPERATION_INFO[skill.operation];
            const value = toPct(skill.pL);
            const fillClass = skill.refreshNeeded
              ? 'mc-skillbar__fill mc-skillbar__fill--refresh'
              : skill.mastered
                ? 'mc-skillbar__fill mc-skillbar__fill--mastered'
                : 'mc-skillbar__fill';
            const valueText = `${info.title}: ${value}% mastery${
              skill.refreshNeeded ? ', needs refresh' : skill.mastered ? ', mastered' : ''
            }`;
            return (
              <li key={skill.operation} className="mc-skillbar">
                <div className="mc-skillbar__head">
                  <span className="mc-skillbar__label">{info.title}</span>
                  <span className="mc-skillbar__meta">
                    {skill.refreshNeeded ? (
                      <span className="mc-skillbar__tag">◐ Needs refresh</span>
                    ) : skill.mastered ? (
                      <span className="mc-skillbar__tag mc-skillbar__tag--mastered">★ Mastered</span>
                    ) : null}
                    <span className="mc-skillbar__pct">{value}%</span>
                  </span>
                </div>
                <div
                  className="mc-skillbar__track"
                  role="meter"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={value}
                  aria-valuetext={valueText}
                >
                  <div className={fillClass} style={{ width: `${value}%` }} />
                </div>
                <p className="mc-skillbar__desc mc-muted">{info.description}</p>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
