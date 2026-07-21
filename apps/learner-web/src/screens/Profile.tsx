import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Callout, Card, Eyebrow, Stack, useTheme, type ThemePreference } from '@mcat/ui-web';
import { useBootstrap, useResetProgress } from '../app/queries';
import { isGhostOptedOut, setGhostOptOut } from '../components/GhostCompanion';

const THEMES: { value: ThemePreference; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

export function Profile() {
  const navigate = useNavigate();
  const bootstrap = useBootstrap();
  const reset = useResetProgress();
  const { preference, setPreference } = useTheme();
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
          Account: {bootstrap.data?.accountState ?? 'guest'} · content release{' '}
          {bootstrap.data?.contentRelease ?? '—'}
        </p>
      </header>

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
          <Eyebrow>Reset</Eyebrow>
          <Callout tone="warning" title="Start over">
            This clears local progress on this device (a development convenience).
          </Callout>
          <Button
            variant="danger"
            onClick={() => reset.mutate(undefined, { onSuccess: () => navigate('/', { replace: true }) })}
          >
            Reset local progress
          </Button>
        </Stack>
      </Card>
    </div>
  );
}
