import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Stack } from '@mcat/ui-web';
import { lastDevEmailLink, usingRealAuth } from '../../app/auth-client';
import { AuthCard } from './AuthCard';

/**
 * Shown after sign-up and after a password-reset request.
 *
 * There is no code to type: Supabase's default templates send a link, and asking
 * for a six-digit code would mean editing those templates before sign-up works at
 * all. The learner leaves this page by clicking through their inbox, which lands
 * them on `/auth/callback`.
 *
 * The copy is identical whether or not the address was already registered, so
 * neither this screen nor the request behind it can be used to test who has an
 * account. The offline dev note below is the one exception, and only because it
 * stands in for an inbox, which tells its owner the same thing.
 */
export function CheckEmail() {
  const location = useLocation();
  const email = (location.state as { email?: string } | null)?.email;
  const devLink = useLastDevEmailLink(email);

  return (
    <AuthCard
      eyebrow="One more step"
      title="Check your email."
      intro={
        email === undefined
          ? 'We sent you a link. Open it to finish signing in.'
          : `We sent a link to ${email}. Open it to finish signing in.`
      }
      footer={
        <p className="mc-fineprint mc-muted">
          Wrong address? <Link to="/signup">Start over</Link>
        </p>
      }
    >
      <Stack gap={3}>
        <p className="mc-muted">
          The link expires after a while. If it stops working, request a new one from the sign-in
          page.
        </p>
        {usingRealAuth ? null : (
          <div className="mc-auth__devnote">
            <p className="mc-fineprint mc-muted">
              No Supabase project is configured, so no mail was sent. This stands in for the link
              you would have been emailed.
            </p>
            {devLink === null ? (
              <p className="mc-fineprint mc-muted">No link has been issued yet.</p>
            ) : (
              <Link to={devLink}>Open the link</Link>
            )}
          </div>
        )}
      </Stack>
    </AuthCard>
  );
}

/**
 * The offline link for this address, fetched once on mount. Null before it
 * arrives, under a real project, and when the screen was reached directly rather
 * than through a form — all of which the caller renders as "nothing to offer".
 */
function useLastDevEmailLink(email: string | undefined): string | null {
  const [link, setLink] = useState<string | null>(null);
  useEffect(() => {
    if (email === undefined) return;
    let cancelled = false;
    void lastDevEmailLink(email).then((value) => {
      if (!cancelled) setLink(value);
    });
    return () => {
      cancelled = true;
    };
  }, [email]);
  return link;
}
