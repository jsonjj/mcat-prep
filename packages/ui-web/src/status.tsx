import type { MasteryState } from '@mcat/contracts';

export const MASTERY_LABELS: Readonly<Record<MasteryState, string>> = {
  not_assessed: 'Not assessed',
  foundation_needed: 'Foundation needed',
  learning: 'Learning',
  independent: 'Independent',
  retained: 'Retained',
  strong: 'Strong',
  exam_ready_now: 'Exam-ready now',
};

/** Short glyph text (non-emoji) reinforcing state without relying on color. */
const MASTERY_GLYPH: Readonly<Record<MasteryState, string>> = {
  not_assessed: '○',
  foundation_needed: '△',
  learning: '◐',
  independent: '●',
  retained: '◈',
  strong: '★',
  exam_ready_now: '✦',
};

/**
 * Progress badge. State is communicated by label + glyph + ring pattern in
 * addition to color, satisfying "never color alone".
 */
export function MasteryBadge({
  state,
  refreshNeeded = false,
  size = 'md',
}: {
  state: MasteryState;
  refreshNeeded?: boolean;
  size?: 'sm' | 'md';
}) {
  return (
    <span className={`mc-mastery mc-mastery--${state} mc-mastery--${size}`}>
      <span className="mc-mastery__ring" aria-hidden="true">
        <span className="mc-mastery__glyph">{MASTERY_GLYPH[state]}</span>
      </span>
      <span className="mc-mastery__label">
        {MASTERY_LABELS[state]}
        {refreshNeeded ? <span className="mc-mastery__refresh"> · refresh</span> : null}
      </span>
    </span>
  );
}
