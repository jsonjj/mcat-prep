import { useNavigate } from 'react-router-dom';
import { Button, Callout, Card, Eyebrow, Stack, useTheme, type ThemePreference } from '@mcat/ui-web';
import { useBootstrap, useResetProgress } from '../app/queries';

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
