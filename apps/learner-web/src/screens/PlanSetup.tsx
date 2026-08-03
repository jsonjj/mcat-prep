import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Callout, Card, Eyebrow, Stack } from '@mcat/ui-web';
import { DAILY_MINUTES_PRESETS } from '@mcat/contracts';
import { useConfirmPlan } from '../app/queries';
import { useSetDailyBudget } from '../app/today-queries';
import { OnboardingSteps } from '../components/OnboardingSteps';

/** Middle daily preset — a sensible default the learner can change with one tap. */
const DEFAULT_DAILY_MINUTES: number =
  DAILY_MINUTES_PRESETS[Math.floor(DAILY_MINUTES_PRESETS.length / 2)] ?? 240;

export function PlanSetup() {
  const navigate = useNavigate();
  const confirm = useConfirmPlan();
  const setDailyBudget = useSetDailyBudget();
  const [scheduled, setScheduled] = useState(false);
  const [testDate, setTestDate] = useState('');
  const [target, setTarget] = useState('511');
  const [dailyMinutes, setDailyMinutes] = useState<number>(DEFAULT_DAILY_MINUTES);

  const hoursPerDay = Math.round(dailyMinutes / 60);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (dailyMinutes <= 0) return;
    // One daily choice drives both budgets: the plan's weekly budget
    // (dailyMinutes × 7) and today's daily plan size (setDailyBudget). Navigation
    // waits on the plan being confirmed; the daily-budget set fires alongside.
    setDailyBudget.mutate(dailyMinutes);
    confirm.mutate(
      {
        testDate: scheduled && testDate ? new Date(testDate).toISOString() : null,
        targetScore: Number(target) || null,
        minutesPerWeek: dailyMinutes * 7,
      },
      { onSuccess: () => navigate('/app', { replace: true }) },
    );
  };

  return (
    <div className="mc-onboarding mc-onboarding--themed">
      <Card elevated className="mc-onboard__card">
        <form onSubmit={onSubmit}>
          <Stack gap={5}>
            <OnboardingSteps current={3} />
            <Stack gap={2}>
              <Eyebrow>Plan setup</Eyebrow>
              <h1 className="mc-h2">Let&apos;s shape a plan around your time.</h1>
              <p className="mc-muted">
                Two quick inputs — we build your first path from them, and you can change any of it
                later.
              </p>
            </Stack>

            <Stack gap={2}>
              <span className="mc-label">1 · Test date</span>
              <label className="mc-switch">
                <input
                  type="checkbox"
                  checked={scheduled}
                  onChange={(e) => setScheduled(e.target.checked)}
                />
                <span>I have a scheduled test date</span>
              </label>
              {scheduled ? (
                <input
                  className="mc-input"
                  type="date"
                  aria-label="Test date"
                  value={testDate}
                  onChange={(e) => setTestDate(e.target.value)}
                />
              ) : (
                <p className="mc-muted mc-fineprint">
                  No date yet is fine — you&apos;ll get a rolling plan and can add one later.
                </p>
              )}
            </Stack>

            <Stack gap={2}>
              <label className="mc-label" htmlFor="target">
                2 · Target score
              </label>
              <input
                id="target"
                className="mc-input"
                type="number"
                min={472}
                max={528}
                value={target}
                onChange={(e) => setTarget(e.target.value)}
              />
              <p className="mc-fineprint mc-muted">
                Target changes pacing and optional depth — never correctness or what counts as
                mastery.
              </p>
            </Stack>

            <Stack gap={2}>
              <span className="mc-label" id="daily-minutes-label">
                3 · Daily study time
              </span>
              <div className="mc-segmented" role="radiogroup" aria-labelledby="daily-minutes-label">
                {DAILY_MINUTES_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    role="radio"
                    className={`mc-segmented__opt${dailyMinutes === preset ? ' is-active' : ''}`}
                    aria-checked={dailyMinutes === preset}
                    onClick={() => setDailyMinutes(preset)}
                  >
                    {Math.round(preset / 60)} hr
                  </button>
                ))}
              </div>
              <p className="mc-fineprint mc-muted">
                About {hoursPerDay} {hoursPerDay === 1 ? 'hour' : 'hours'} a day — we size your plan
                to this, not cap what you can study.
              </p>
            </Stack>

            <Callout tone="info" title="This is a planning estimate">
              We compare your time with the work remaining and show trade-offs — we never quietly
              drop required coverage or promise a score.
            </Callout>

            <Button
              variant="primary"
              size="lg"
              fullWidth
              type="submit"
              disabled={confirm.isPending || dailyMinutes <= 0}
            >
              {confirm.isPending ? 'Building your plan…' : 'Generate my plan'}
            </Button>
          </Stack>
        </form>
      </Card>
    </div>
  );
}
