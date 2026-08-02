import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Callout, Card, Eyebrow, Stack, useTheme, type ThemePreference } from '@mcat/ui-web';
import { DAILY_MINUTES_PRESETS } from '@mcat/contracts';
import { useBootstrap, useConfirmPlan, useGoal, useResetProgress } from '../app/queries';
import { useSignOut } from '../app/auth-queries';
import { useBuildTodaysPath, useSetDailyBudget, useTodaysPath } from '../app/today-queries';
import { isGhostOptedOut, setGhostOptOut } from '../components/GhostCompanion';

const THEMES: { value: ThemePreference; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

export function Profile() {
  const navigate = useNavigate();
  const bootstrap = useBootstrap();
  // Narrowed once: the signed-out arm of the envelope carries no learner fields,
  // and RequireAuth means we should never actually be rendering in that state.
  const account = bootstrap.data?.authenticated === true ? bootstrap.data : undefined;
  const reset = useResetProgress();
  const signOut = useSignOut();
  const { preference, setPreference } = useTheme();
  const todaysPath = useTodaysPath();
  const setBudget = useSetDailyBudget();
  const buildPath = useBuildTodaysPath();
  // Goal editor (WS8): exam date / target / weekly minutes, saved via the same
  // useConfirmPlan seam onboarding uses. Prefilled from the read-only goal view.
  const goal = useGoal();
  const confirmGoal = useConfirmPlan();
  const [scheduled, setScheduled] = useState(false);
  const [testDate, setTestDate] = useState('');
  const [target, setTarget] = useState('511');
  const [hours, setHours] = useState('7');
  useEffect(() => {
    const g = goal.data;
    if (!g) return;
    setScheduled(g.testDate !== null);
    setTestDate(g.testDate ?? '');
    if (g.targetScore !== null) setTarget(String(g.targetScore));
    if (g.minutesPerWeek !== null) setHours(String(Math.round((g.minutesPerWeek / 60) * 2) / 2));
  }, [goal.data]);
  const parsedHours = Number(hours);
  const minutesPerWeek =
    Number.isFinite(parsedHours) && parsedHours > 0 ? Math.round(parsedHours * 60) : 0;
  const saveGoal = (e: FormEvent) => {
    e.preventDefault();
    if (minutesPerWeek <= 0) return;
    confirmGoal.mutate({
      testDate: scheduled && testDate ? new Date(testDate).toISOString() : null,
      targetScore: Number(target) || null,
      minutesPerWeek,
    });
  };
  const [ghostOn, setGhostOn] = useState(() => !isGhostOptedOut());
  const [remindersOn, setRemindersOn] = useState(() => {
    try {
      return localStorage.getItem('mc.reminders.enabled') === '1';
    } catch {
      return false;
    }
  });
  const [permBlocked, setPermBlocked] = useState(false);

  const toggleReminders = async (want: boolean) => {
    if (!want) {
      setRemindersOn(false);
      try {
        localStorage.removeItem('mc.reminders.enabled');
      } catch {
        /* storage unavailable */
      }
      return;
    }
    if (typeof Notification === 'undefined') {
      setPermBlocked(true);
      return;
    }
    let perm = Notification.permission;
    if (perm === 'default') perm = await Notification.requestPermission();
    if (perm === 'granted') {
      setRemindersOn(true);
      setPermBlocked(false);
      try {
        localStorage.setItem('mc.reminders.enabled', '1');
      } catch {
        /* storage unavailable */
      }
    } else {
      setPermBlocked(true);
      setRemindersOn(false);
    }
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

            <Stack gap={2}>
              <label className="mc-label" htmlFor="goal-hours">
                Weekly study time
              </label>
              <div className="mc-input-suffix">
                <input
                  id="goal-hours"
                  className="mc-input"
                  type="number"
                  min={1}
                  max={80}
                  step={0.5}
                  inputMode="decimal"
                  value={hours}
                  onChange={(e) => setHours(e.target.value)}
                />
                <span className="mc-input-suffix__unit">hours / week</span>
              </div>
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
          <Eyebrow>Appearance</Eyebrow>
          <div className="mc-segmented" role="radiogroup" aria-label="Theme">
            {THEMES.map((t) => (
              <button
                key={t.value}
                type="button"
                role="radio"
                aria-checked={preference === t.value}
                className={`mc-segmented__opt ${preference === t.value ? 'is-active' : ''}`}
                onClick={() => setPreference(t.value)}
              >
                {t.label}
              </button>
            ))}
          </div>
        </Stack>
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
          <Eyebrow>Pace companion</Eyebrow>
          <label className="mc-switch">
            <input
              type="checkbox"
              checked={ghostOn}
              onChange={(e) => {
                setGhostOn(e.target.checked);
                setGhostOptOut(!e.target.checked);
              }}
            />
            <span>Show the Ghost pace companion on Home</span>
          </label>
          <p className="mc-muted mc-fineprint">
            A gentle, supportive nudge based only on your own goal and pace — never other test-takers.
            Turn it off anytime if it adds pressure rather than motivation.
          </p>
        </Stack>
      </Card>

      <Card elevated>
        <Stack gap={3}>
          <Eyebrow>Reminders</Eyebrow>
          <label className="mc-switch">
            <input
              type="checkbox"
              checked={remindersOn}
              onChange={(e) => void toggleReminders(e.target.checked)}
            />
            <span>Gentle study reminders</span>
          </label>
          {permBlocked ? (
            <Callout tone="info">
              Notifications are blocked in your browser settings — the app will still nudge you in-app.
            </Callout>
          ) : null}
          <p className="mc-muted mc-fineprint">
            In-app and on-entry nudges work now. Scheduled reminders when the app is closed arrive with
            the backend, and nothing is ever sent without your permission.
          </p>
        </Stack>
      </Card>

      <Card elevated>
        <Stack gap={3}>
          <Eyebrow>Privacy &amp; data</Eyebrow>
          <p className="mc-muted mc-fineprint">
            You&apos;re pseudonymous by default. We don&apos;t require your name, school, or medical
            information. Export and deletion are supported in the full build.
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

      <Card elevated>
        <Stack gap={3}>
          <Eyebrow>Reset</Eyebrow>
          <Callout tone="warning" title="Start over">
            This clears local progress on this device (a development convenience).
          </Callout>
          <Button
            variant="danger"
            onClick={() =>
              reset.mutate(undefined, {
                // Onboarding, not the homepage: the account survives a progress
                // reset, so the learner needs the placement again, not a sign-in pitch.
                onSuccess: () => navigate('/onboarding', { replace: true }),
              })
            }
          >
            Reset local progress
          </Button>
        </Stack>
      </Card>
    </div>
  );
}
