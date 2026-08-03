import { useEffect, useRef } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { Stack } from '@mcat/ui-web';
import { useCompleteRedirect } from '../../app/auth-queries';
import { AuthCard } from './AuthCard';
import { ResetPassword } from './ResetPassword';

/**
 * Where every email link and the Google round trip come back to.
 *
 * All of them arrive the same way — a Supabase session in the URL — so they share
 * one landing route and differ only in where they go next. A recovery link stops
 * here to set a new password; everything else trades the session for ours and
 * continues into the app.
 */
export function AuthCallback() {
  const [params] = useSearchParams();
  const complete = useCompleteRedirect();
  const started = useRef(false);

  // Supabase marks recovery links so the app can tell "you are signed in" from
  // "you are signed in *to change your password*". Without this a reset link
  // would silently drop the learner into the app with the old password intact.
  const isRecovery = params.get('type') === 'recovery';

  useEffect(() => {
    // Guarded because the exchange rotates the session cookie, so running it twice
    // (as React 18 strict mode would) spends a token that is already gone.
    if (isRecovery || started.current) return;
    started.current = true;
    complete.mutate();
  }, [isRecovery, complete]);

  if (isRecovery) return <ResetPassword />;

  if (complete.isSuccess && complete.data) return <Navigate to="/app" replace />;

  const failed = complete.isError || (complete.isSuccess && !complete.data);
  if (failed) {
    return (
      <AuthCard
        eyebrow="Sign-in"
        title="That link didn’t work."
        error={complete.error}
        footer={
          <p className="mc-fineprint mc-muted">
            <Link to="/signin">Back to sign in</Link>
          </p>
        }
      >
        <p className="mc-muted">
          It may have expired or already been used. Request a new one and try again.
        </p>
      </AuthCard>
    );
  }

  return (
    <AuthCard eyebrow="Sign-in" title="Signing you in…">
      <Stack gap={3}>
        <p className="mc-muted">One moment.</p>
      </Stack>
    </AuthCard>
  );
}
