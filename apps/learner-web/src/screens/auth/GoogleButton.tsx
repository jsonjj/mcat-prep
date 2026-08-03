import { Button, Stack } from '@mcat/ui-web';
import { authClient } from '../../app/auth-client';
import { useGoogleSignIn } from '../../app/auth-queries';

/**
 * Hidden entirely when no Supabase project is configured, which is the offline dev
 * default. A disabled button would imply the option exists and is momentarily
 * unavailable; it does not exist in that build at all.
 */
export function GoogleButton({ label }: { label: string }) {
  const google = useGoogleSignIn();
  if (!authClient.supportsGoogle) return null;

  return (
    <Stack gap={3}>
      <div className="mc-auth__divider">
        <span>or</span>
      </div>
      <Button
        variant="secondary"
        size="lg"
        fullWidth
        type="button"
        disabled={google.isPending}
        onClick={() => google.mutate()}
      >
        {google.isPending ? 'Redirecting…' : label}
      </Button>
      {google.error ? <p className="mc-fineprint mc-muted">{google.error.message}</p> : null}
    </Stack>
  );
}
