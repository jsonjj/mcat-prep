/**
 * Compact step indicator for the guided onboarding flow
 * (Welcome → Placement → Plan). A calm progress hint; labelled for screen
 * readers and otherwise decorative.
 */
export function OnboardingSteps({ current, total = 3 }: { current: number; total?: number }) {
  return (
    <div className="mc-steps" role="group" aria-label={`Step ${current} of ${total}`}>
      <span className="mc-steps__label">
        Step {current} of {total}
      </span>
      <span className="mc-steps__pills" aria-hidden="true">
        {Array.from({ length: total }, (_, i) => {
          const n = i + 1;
          const state = n === current ? ' is-active' : n < current ? ' is-done' : '';
          return <span key={n} className={`mc-steps__pill${state}`} />;
        })}
      </span>
    </div>
  );
}
