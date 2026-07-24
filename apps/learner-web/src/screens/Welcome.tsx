import { useNavigate } from 'react-router-dom';
import { Button, Card, Eyebrow, Stack } from '@mcat/ui-web';
import { useBootstrap } from '../app/queries';
import { isDiagnosticCompleted } from '../app/diagnostic-status';
import { BrainAtlas } from '../components/BrainAtlas';

export function Welcome() {
  const navigate = useNavigate();
  const bootstrap = useBootstrap();
  const onboardingComplete = bootstrap.data?.onboardingComplete ?? false;
  // The diagnostic is only "done" when actually completed — skipping it (which
  // still completes onboarding via plan setup) leaves this false, so we keep
  // offering the placement each time until the learner finishes it.
  const diagnosticDone = isDiagnosticCompleted();

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
              {onboardingComplete ? (
                <Button variant="secondary" size="lg" fullWidth onClick={() => navigate('/app')}>
                  Continue without it
                </Button>
              ) : null}
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
