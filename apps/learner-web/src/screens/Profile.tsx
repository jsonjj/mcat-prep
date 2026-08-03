import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Callout, Card, Eyebrow, Stack } from '@mcat/ui-web';
import { DAILY_MINUTES_PRESETS } from '@mcat/contracts';
import { useBootstrap, useConfirmPlan, useGoal } from '../app/queries';
import { useSignOut } from '../app/auth-queries';
import { useBuildTodaysPath, useSetDailyBudget, useTodaysPath } from '../app/today-queries';

/** Middle daily preset — the fallback weekly budget derives from this. */
const DEFAULT_DAILY_MINUTES: number =
  DAILY_MINUTES_PRESETS[Math.floor(DAILY_MINUTES_PRESETS.length / 2)] ?? 240;

export function Profile() {
  const navigate = useNavigate();
  const bootstrap = useBootstrap();
  // Narrowed once: the signed-out arm of the envelope carries no learner fields,
  // and RequireAuth means we should never actually be rendering in that state.
  const account = bootstrap.data?.authenticated === true ? bootstrap.data : undefined;
  const signOut = useSignOut();
  const todaysPath = useTodaysPath();
  const setBudget = useSetDailyBudget();
  const buildPath = useBuildTodaysPath();
  // Goal editor (WS8): exam date / target, saved via the same useConfirmPlan seam
  // onboarding uses. Prefilled from the read-only goal view. Weekly minutes are no
  // longer edited here — the single daily-study-time choice below drives them.
  const goal = useGoal();
  const confirmGoal = useConfirmPlan();
  const [scheduled, setScheduled] = useState(false);
  const [testDate, setTestDate] = useState('');
  const [target, setTarget] = useState('511');
  useEffect(() => {
    const g = goal.data;
    if (!g) return;
    setScheduled(g.testDate !== null);
    setTestDate(g.testDate ?? '');
    if (g.targetScore !== null) setTarget(String(g.targetScore));
  }, [goal.data]);
  // The plan's weekly budget now follows the daily study-time choice
  // (dailyMinutes × 7). Saving the goal must never zero it, so derive it from the
  // loaded daily budget, falling back to the goal's existing weekly value, then a
  // sensible default — never 0.
  const dailyBudget = todaysPath.data?.dailyMinutesPreset ?? null;
  const minutesPerWeek =
    dailyBudget !== null ? dailyBudget * 7 : (goal.data?.minutesPerWeek ?? DEFAULT_DAILY_MINUTES * 7);
  const saveGoal = (e: FormEvent) => {
    e.preventDefault();
    if (minutesPerWeek <= 0) return;
    confirmGoal.mutate({
      testDate: scheduled && testDate ? new Date(testDate).toISOString() : null,
      targetScore: Number(target) || null,
      minutesPerWeek,
    });
  };

  return (
    <div className="mc-screen">
      <header className="mc-screen__head">
        <h1 className="mc-h1">Profile &amp; settings</h1>
        <p className="mc-muted">
          Account: {account?.accountState ?? '—'} · content release {account?.contentRelease ?? '—'}
        </p>
      </header>

      <Card elevated>
        <form onSubmit={saveGoal}>
          <Stack gap={3}>
            <Eyebrow>Exam date &amp; goal</Eyebrow>
            <Stack gap={2}>
              <span className="mc-label">Test date</span>
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
                  No date yet is fine — you&apos;ll keep a rolling plan and can add one anytime.
                </p>
              )}
            </Stack>

            <Stack gap={2}>
              <label className="mc-label" htmlFor="goal-target">
                Target score
              </label>
              <input
                id="goal-target"
                className="mc-input"
                type="number"
                min={472}
                max={528}
                value={target}
                onChange={(e) => setTarget(e.target.value)}
              />
            </Stack>

            <p className="mc-muted mc-fineprint">
              Your exam date paces the plan and tapers CARS Duel&apos;s harder Defend rounds in the
              final weeks. It never changes correctness or what counts as mastery.
            </p>
            {confirmGoal.isSuccess ? <Callout tone="success">Goal saved.</Callout> : null}
            <Button
              variant="primary"
              type="submit"
              disabled={confirmGoal.isPending || minutesPerWeek <= 0}
            >
              {confirmGoal.isPending ? 'Saving…' : 'Save goal'}
            </Button>
          </Stack>
        </form>
      </Card>

      <Card elevated>
        <Stack gap={3}>
          <Eyebrow>Daily study time</Eyebrow>
          <div className="mc-segmented" role="radiogroup" aria-label="Daily study time">
            {DAILY_MINUTES_PRESETS.map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={todaysPath.data?.dailyMinutesPreset === m}
                className={`mc-segmented__opt ${todaysPath.data?.dailyMinutesPreset === m ? 'is-active' : ''}`}
                onClick={() =>
                  setBudget.mutate(m, { onSuccess: () => buildPath.mutate({ force: true }) })
                }
                disabled={setBudget.isPending || buildPath.isPending}
              >
                {Math.round(m / 60)} hr
              </button>
            ))}
          </div>
          <p className="mc-muted mc-fineprint">
            Today&apos;s Path sizes your daily plan to this budget (2–6 hours).
          </p>
        </Stack>
      </Card>

      <Card elevated>
        <Stack gap={3}>
          <Eyebrow>Session</Eyebrow>
          <p className="mc-muted mc-fineprint">
            Signing out ends this session everywhere it was used. Your progress stays on your
            account and comes back when you sign in again.
          </p>
          <Button
            variant="secondary"
            disabled={signOut.isPending}
            onClick={() =>
              signOut.mutate(undefined, {
                // onSettled, not onSuccess: the client drops the local session even
                // when the server call fails, so staying on a learner screen would
                // show an account we can no longer read.
                onSettled: () => navigate('/', { replace: true }),
              })
            }
          >
            {signOut.isPending ? 'Signing out…' : 'Sign out'}
          </Button>
        </Stack>
      </Card>
    </div>
  );
}
