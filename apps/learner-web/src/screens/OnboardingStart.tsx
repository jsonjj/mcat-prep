import { useNavigate } from 'react-router-dom';
import { Button, Card, Eyebrow, Stack } from '@mcat/ui-web';
import { useBootstrap } from '../app/queries';
import { isDiagnosticCompleted } from '../app/diagnostic-status';
import { DIAGNOSTIC_ENABLED } from '../app/capabilities';
import { BrainAtlas } from '../components/BrainAtlas';
import { OnboardingSteps } from '../components/OnboardingSteps';

/**
 * The first screen behind the login wall. This used to be the public landing page;
 * now that an account exists before anyone gets here, it does the one thing that
 * needs a learner: offer the placement.
 *
 * The placement diagnostic has no deployed backend (dev/preview only), so it is
 * gated by {@link DIAGNOSTIC_ENABLED}. When off (production) there is nothing to
 * place against, so this screen offers a single path straight to plan setup and
 * never surfaces "Take the placement". In dev the flag is on and behaviour is
 * unchanged. See ../app/capabilities.ts.
 */
export function OnboardingStart() {
  const navigate = useNavigate();
  const bootstrap = useBootstrap();
  const learnerId = bootstrap.data?.authenticated === true ? bootstrap.data.learnerId : null;
  const onboardingComplete =
    (bootstrap.data?.authenticated === true && bootstrap.data.onboardingComplete) ?? false;
  // The diagnostic is only "done" when actually completed — skipping it (which
  // still completes onboarding via plan setup) leaves this false, so we keep
  // offering the placement each time until the learner finishes it. Keyed by
  // learner id so a fresh account is never told a previous account's placement
  // counts as theirs (which is what skipped the placement entirely).
  const diagnosticDone = isDiagnosticCompleted(learnerId);

  // Where we land depends on whether a plan exists yet: AppShell bounces back
  // here until onboarding completes, so a first-time learner goes to plan setup
  // rather than /app.
  const onSkip = () => {
    navigate(onboardingComplete ? '/app' : '/onboarding/plan');
  };

  return (
    <div className="mc-welcome">
      <div className="mc-welcome__hero">
        <BrainAtlas glowing={onboardingComplete ? 3 : 0} />
      </div>
      <Card elevated className="mc-welcome__card">
        <Stack gap={4}>
          <OnboardingSteps current={1} />
          <Eyebrow>MCAT Mastery</Eyebrow>
          <h1 className="mc-welcome__title">One calm next step, backed by your own evidence.</h1>
          <p className="mc-muted">
            {DIAGNOSTIC_ENABLED
              ? 'We start with a short, provisional placement — not a graded test — then build a plan that adapts as you learn. Your progress is private by default.'
              : 'We build a plan that adapts as you learn, then keep sharpening it from your own evidence. Your progress is private by default.'}
          </p>
          <ul className="mc-expect">
            <li>A plan that adapts to your own evidence</li>
            <li>Short daily paths — one clear step at a time</li>
            <li>Private by default — no scores shared</li>
          </ul>
          {diagnosticDone ? (
            <div className="mc-cta-hero">
              {/*
                Onboarding is only complete once a plan is confirmed (bootstrap's
                `onboardingComplete` = a `today` plan exists and the session is
                unlocked). A learner who finished the placement but not plan setup
                must go to plan setup, not `/app` — AppShell bounces `/app` straight
                back here while onboarding is incomplete, which read as "Continue
                does nothing". Mirror `onSkip`.
              */}
              <Button
                variant="primary"
                size="lg"
                fullWidth
                onClick={() => navigate(onboardingComplete ? '/app' : '/onboarding/plan')}
              >
                Continue
              </Button>
            </div>
          ) : DIAGNOSTIC_ENABLED ? (
            // Single placement CTA (Skip removed): the guided flow starts here.
            <div className="mc-cta-hero">
              <Button
                variant="primary"
                size="lg"
                fullWidth
                onClick={() => navigate('/onboarding/diagnostic')}
              >
                Take the placement
              </Button>
            </div>
          ) : (
            // Placement gated off (no deployed diagnostic backend): a single path
            // straight to plan setup, so a new learner in prod never dead-ends on a
            // quiz that cannot load.
            <div className="mc-cta-hero">
              <Button variant="primary" size="lg" fullWidth onClick={onSkip}>
                {onboardingComplete ? 'Continue' : 'Build my plan'}
              </Button>
            </div>
          )}
          {DIAGNOSTIC_ENABLED ? (
            <p className="mc-fineprint">
              No score is guaranteed. Placement is provisional and refines as you go.
            </p>
          ) : null}
        </Stack>
      </Card>
    </div>
  );
}
