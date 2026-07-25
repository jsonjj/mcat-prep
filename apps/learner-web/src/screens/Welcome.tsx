import { useNavigate } from 'react-router-dom';
import { Button, Card, Eyebrow, Stack } from '@mcat/ui-web';
import { useBootstrap } from '../app/queries';
import { isDiagnosticCompleted } from '../app/diagnostic-status';
import { ensureSeeded } from '../app/recall-schedule';
import { BrainAtlas } from '../components/BrainAtlas';

export function Welcome() {
  const navigate = useNavigate();
  const bootstrap = useBootstrap();
  const onboardingComplete = bootstrap.data?.onboardingComplete ?? false;
  // The diagnostic is only "done" when actually completed — skipping it (which
  // still completes onboarding via plan setup) leaves this false, so we keep
  // offering the placement each time until the learner finishes it.
  const diagnosticDone = isDiagnosticCompleted();

  // Skipping placement seeds a neutral recall schedule so Recall still has
  // something to serve. Where we land depends on whether a plan exists yet:
  // AppShell bounces back here until onboarding completes, so a first-time
  // learner goes to plan setup rather than /app.
  const onSkip = () => {
    ensureSeeded(null);
    navigate(onboardingComplete ? '/app' : '/onboarding/plan');
  };

  return (
    <div className="mc-welcome">
      <div className="mc-welcome__hero">
        <BrainAtlas glowing={onboardingComplete ? 3 : 0} />
      </div>
      <Card elevated className="mc-welcome__card">
        <Stack gap={4}>
          <Eyebrow>MCAT Mastery</Eyebrow>
          <h1 className="mc-welcome__title">One calm next step, backed by your own evidence.</h1>
          <p className="mc-muted">
            We start with a short, provisional placement — not a graded test — then build a plan
            that adapts as you learn. Your progress is private by default.
          </p>
          {diagnosticDone ? (
            <Button variant="primary" size="lg" fullWidth onClick={() => navigate('/app')}>
              Continue
            </Button>
          ) : (
            <>
              <Button
                variant="primary"
                size="lg"
                fullWidth
                onClick={() => navigate('/onboarding/diagnostic')}
              >
                {onboardingComplete ? 'Take the placement' : 'Begin placement'}
              </Button>
              <Button variant="secondary" size="lg" fullWidth onClick={onSkip}>
                {onboardingComplete ? 'Continue without it' : 'Skip for now'}
              </Button>
            </>
          )}
          <p className="mc-fineprint">
            No score is guaranteed. Placement is provisional and refines as you go.
          </p>
        </Stack>
      </Card>
    </div>
  );
}
