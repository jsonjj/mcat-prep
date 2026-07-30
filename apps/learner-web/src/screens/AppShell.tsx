import { Navigate, NavLink, Outlet } from 'react-router-dom';
import { SkipLink, useTheme } from '@mcat/ui-web';
import { useBootstrap } from '../app/queries';
import {
  IconBrain,
  IconCarsDuel,
  IconCurriculum,
  IconHome,
  IconMistakesX,
  IconMoon,
  IconPractice,
  IconProgress,
  IconSun,
  IconToday,
} from '../components/icons';

const NAV = [
  { to: '/app', end: true, label: 'Home', Icon: IconHome },
  { to: '/app/curriculum', end: false, label: 'Curriculum', Icon: IconCurriculum },
  { to: '/app/recall', end: false, label: 'Recall', Icon: IconBrain },
  { to: '/app/mistakes', end: false, label: 'Mistakes', Icon: IconMistakesX },
  { to: '/app/progress', end: false, label: 'Progress', Icon: IconProgress },
];

const TODAY_ITEM = { to: '/app/today', end: false, label: 'Today', Icon: IconToday };
const PRACTICE_ITEM = { to: '/app/practice', end: false, label: 'Practice', Icon: IconPractice };
const CARS_ITEM = { to: '/app/cars', end: false, label: 'CARS Duel', Icon: IconCarsDuel };
// Account (exam date / goal + settings) is TEMPORARILY HIDDEN for now. The screen
// (screens/Profile.tsx), its /app/profile route, the backend goal.testDate storage,
// bootstrap goal exposure, and the CARS Defend-taper wiring all remain intact — only
// the UI entry points are removed so this is trivially reversible. To restore:
// re-add `IconUser` to the icon import above, uncomment ACCOUNT_ITEM, re-add it to
// SIDEBAR, re-add the /app/profile route in router.tsx, and restore the header link.
// const ACCOUNT_ITEM = { to: '/app/profile', end: false, label: 'Account', Icon: IconUser };

// Desktop sidebar order: Today's Path sits right under Home; Practice sits above
// Recall; CARS Duel sits just below Recall. The mobile bottom nav stays the shared
// five-item NAV so the longest label ("Curriculum") never overflows a narrow phone
// — Today's Path, Practice, and CARS Duel are reached from elsewhere on mobile.
// (Account is temporarily hidden — see the note above.)
const SIDEBAR = [
  NAV[0],
  TODAY_ITEM,
  NAV[1],
  PRACTICE_ITEM,
  NAV[2],
  CARS_ITEM,
  NAV[3],
  NAV[4],
];

export function AppShell() {
  const bootstrap = useBootstrap();
  const { resolved, setPreference } = useTheme();

  if (bootstrap.isLoading) {
    return <div className="mc-center mc-muted">Restoring your session…</div>;
  }
  if (bootstrap.data && !bootstrap.data.onboardingComplete) {
    // Learning stays locked until placement + plan are complete.
    return <Navigate to="/" replace />;
  }

  return (
    <div className="mc-shell">
      <SkipLink targetId="main" />
      <header className="mc-shell__header">
        <a className="mc-brand" href="/app">
          <span className="mc-brand__mark" aria-hidden="true" />
          <span className="mc-brand__name">MCAT Mastery</span>
        </a>
        <div className="mc-shell__header-actions">
          <button
            type="button"
            className="mc-iconbtn"
            aria-label={resolved === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            onClick={() => setPreference(resolved === 'dark' ? 'light' : 'dark')}
          >
            {resolved === 'dark' ? <IconSun /> : <IconMoon />}
          </button>
          {/* Account entry point (header user icon → /app/profile) temporarily hidden.
              Restore this NavLink alongside the sidebar ACCOUNT_ITEM and the
              /app/profile route to bring the Account page back. */}
        </div>
      </header>

      <nav className="mc-sidebar" aria-label="Primary">
        {/* Desktop order puts Practice right above Recall; the mobile bottom nav
            below stays the five-item shared NAV. The Skills view is now merged into
            Progress (its 7 reasoning-skill rings live there). */}
        {SIDEBAR.map(({ to, end, label, Icon }) => (
          <NavLink key={to} to={to} end={end} className="mc-navitem">
            <Icon className="mc-navitem__icon" />
            <span className="mc-navitem__label">{label}</span>
          </NavLink>
        ))}
      </nav>

      <main id="main" className="mc-shell__main" tabIndex={-1}>
        <Outlet />
      </main>

      <nav className="mc-bottomnav" aria-label="Primary">
        {NAV.map(({ to, end, label, Icon }) => (
          <NavLink key={to} to={to} end={end} className="mc-tab">
            <Icon className="mc-tab__icon" />
            <span className="mc-tab__label">{label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
