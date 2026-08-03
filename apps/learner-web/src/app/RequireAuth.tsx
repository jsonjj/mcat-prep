import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { isUnauthenticatedError } from '@mcat/client-core';
import { useBootstrap } from './queries';

/**
 * The single place the app decides whether a visitor may see learner surfaces.
 *
 * Authentication is answered by bootstrap, so the guard reads it rather than any
 * local flag — there is no client-side notion of "signed in" that could drift
 * from what the authority will actually honour.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const location = useLocation();
  const bootstrap = useBootstrap();

  if (bootstrap.isLoading) {
    return <div className="mc-center mc-muted">Restoring your session…</div>;
  }

  const signedOut =
    isUnauthenticatedError(bootstrap.error) || bootstrap.data?.authenticated === false;

  if (signedOut) {
    // Remember where they were headed so sign-in can resume it.
    return <Navigate to="/signin" replace state={{ from: location.pathname + location.search }} />;
  }

  if (bootstrap.error) {
    return (
      <div className="mc-center mc-muted">
        We couldn’t reach your account just now. Please refresh to try again.
      </div>
    );
  }

  return <>{children}</>;
}
