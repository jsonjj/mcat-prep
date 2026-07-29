import { CARS_SKILL_INFO, type CarsReadinessLabel } from '@mcat/contracts';
import { Card, Eyebrow, VisuallyHidden } from '@mcat/ui-web';
import { useCarsReadiness } from '../app/queries';

/**
 * CARS reading-ability readout, shown as a card inside the Progress page (not a
 * separate tab). A semicircular dial marks overall ability against the on-track
 * target; the three CARS sub-skills reuse the Skills-page bars for consistency.
 * Ability is an IRT `V` (never a scaled score); it grows from Passage of the Day
 * and, more gently, the CARS Duel.
 *
 * `compact` is the Progress-dashboard variant: a tighter card that abbreviates the
 * sub-skills to FOC / RWT / RBT (full names kept for assistive tech) so it sits in
 * the right rail beside the brain without vertical scroll.
 */

const CX = 130;
const CY = 130;
const R = 100;
const ARC_LEN = Math.PI * R;
// Display window for the ability V (roughly -2 = building, +3 = strong).
const V_MIN = -2;
const V_MAX = 3;
const ON_TRACK_V = 1.7;
const ARC = `M30,130 A100,100 0 0 1 230,130`;

const frac = (v: number): number => Math.min(1, Math.max(0, (v - V_MIN) / (V_MAX - V_MIN)));
const pointAt = (f: number, r: number): { x: number; y: number } => {
  const a = ((180 - 180 * f) * Math.PI) / 180;
  return { x: CX + r * Math.cos(a), y: CY - r * Math.sin(a) };
};
const r1 = (n: number): number => Math.round(n * 10) / 10;

const LABEL_TEXT: Record<CarsReadinessLabel, string> = {
  building: 'Building',
  approaching: 'Approaching',
  on_track: 'On-track',
};

export function CarsReadiness({ compact = false }: { compact?: boolean } = {}) {
  const cars = useCarsReadiness();
  const d = cars.data;
  if (!d) return null;

  const f = frac(d.overallV);
  const targetF = frac(ON_TRACK_V);
  const marker = pointAt(f, R);
  const tickIn = pointAt(targetF, R - 9);
  const tickOut = pointAt(targetF, R + 11);
  const tickLabel = pointAt(targetF, R + 22);

  return (
    <Card elevated className={compact ? 'mc-cars mc-cars--compact' : 'mc-cars'}>
      <Eyebrow>CARS reading ability</Eyebrow>
      <div className="mc-cars-gauge">
        <svg viewBox="0 0 260 152" role="img" aria-label={`Reading ability: ${LABEL_TEXT[d.label]}`}>
          <defs>
            <linearGradient id="mcCarsFill" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="var(--mc-primary)" />
              <stop offset="1" stopColor="var(--mc-retained)" />
            </linearGradient>
          </defs>
          <path className="mc-cars-gauge__track" d={ARC} />
          <path
            className="mc-cars-gauge__fill"
            d={ARC}
            strokeDasharray={`${r1(f * ARC_LEN)} ${r1(ARC_LEN)}`}
          />
          <line
            className="mc-cars-gauge__tick"
            x1={r1(tickIn.x)}
            y1={r1(tickIn.y)}
            x2={r1(tickOut.x)}
            y2={r1(tickOut.y)}
          />
          <text className="mc-cars-gauge__ticktext" x={r1(tickLabel.x)} y={r1(tickLabel.y)}>
            On-track
          </text>
          <text className="mc-cars-gauge__end" x="26" y="150" textAnchor="middle">
            Building
          </text>
          <text className="mc-cars-gauge__end" x="234" y="150" textAnchor="middle">
            Strong
          </text>
          <circle className="mc-cars-gauge__markerglow" cx={r1(marker.x)} cy={r1(marker.y)} r="11" />
          <circle className="mc-cars-gauge__marker" cx={r1(marker.x)} cy={r1(marker.y)} r="6" />
        </svg>
        <p className="mc-cars-gauge__word">{LABEL_TEXT[d.label]}</p>
        {compact ? null : (
          <p className="mc-muted mc-fineprint">
            On-track once the marker passes the tick — never a scaled score.
          </p>
        )}
      </div>

      <ul className="mc-skillbars mc-cars-subskills" aria-label="CARS sub-skills">
        {d.skills.map((s) => {
          const pct = Math.round(s.pct * 100);
          const full = CARS_SKILL_INFO[s.skill].title;
          return (
            <li key={s.skill} className="mc-skillbar">
              <div className="mc-skillbar__head">
                <span className="mc-skillbar__label" title={compact ? full : undefined}>
                  {compact ? s.skill : full}
                  {compact ? <VisuallyHidden> — {full}</VisuallyHidden> : null}
                </span>
                <span className="mc-skillbar__meta">
                  <span className="mc-skillbar__pct">{pct}%</span>
                </span>
              </div>
              <div className="mc-skillbar__track">
                <div className="mc-skillbar__fill" style={{ width: `${pct}%` }} />
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
