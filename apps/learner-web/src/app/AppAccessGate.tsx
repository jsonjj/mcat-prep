import { Navigate, Outlet } from 'react-router-dom';
import { RequireAuth } from './RequireAuth';
import { useBootstrap } from './queries';

/**
 * The shared gate for every `/app` branch. Authentication remains centralized in
 * RequireAuth; this inner check preserves the mandatory placement + plan gate
 * without coupling either decision to a visual shell.
 */
export function AppAccessGate() {
  return (
    <RequireAuth>
      <CompletedOnboardingGate />
    </RequireAuth>
  );
}

function CompletedOnboardingGate() {
  const bootstrap = useBootstrap();

  if (bootstrap.isLoading) {
    return <div className="mc-center mc-muted">Restoring your session…</div>;
  }

  if (bootstrap.data?.authenticated === true && !bootstrap.data.onboardingComplete) {
    return <Navigate to="/onboarding" replace />;
  }

  return <Outlet />;
}
