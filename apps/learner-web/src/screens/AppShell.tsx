import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { SkipLink, useTheme } from '@mcat/ui-web';
import { useBootstrap } from '../app/queries';
import {
  IconBrain,
  IconCurriculum,
  IconHome,
  IconMistakesX,
  IconMoon,
  IconProgress,
  IconSun,
  IconUser,
} from '../components/icons';

const NAV = [
  { to: '/app', end: true, label: 'Home', Icon: IconHome },
  { to: '/app/curriculum', end: false, label: 'Curriculum', Icon: IconCurriculum },
  { to: '/app/recall', end: false, label: 'Recall', Icon: IconBrain },
  { to: '/app/mistakes', end: false, label: 'Mistakes', Icon: IconMistakesX },
  { to: '/app/progress', end: false, label: 'Progress', Icon: IconProgress },
];

export function AppShell() {
  const bootstrap = useBootstrap();
  const navigate = useNavigate();
  const { resolved, setPreference } = useTheme();

  if (bootstrap.isLoading) {
    return <div className="mc-center mc-muted">Restoring your session…</div>;
  }
  if (bootstrap.data && !bootstrap.data.onboardingComplete) {
    // Learning stays locked until placement + plan are complete.
    navigate('/', { replace: true });
    return null;
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
          <NavLink to="/app/profile" className="mc-iconbtn" aria-label="Profile and settings">
            <IconUser />
          </NavLink>
        </div>
      </header>

      <nav className="mc-sidebar" aria-label="Primary">
        {NAV.map(({ to, end, label, Icon }) => (
          <NavLink key={to} to={to} end={end} className="mc-navitem">
            <Icon className="mc-navitem__icon" />
            <span className="mc-navitem__label">{label}</span>
          </NavLink>
        ))}
        <NavLink to="/app/skills" className="mc-navitem">
          <IconProgress className="mc-navitem__icon" />
          <span className="mc-navitem__label">Skills</span>
        </NavLink>
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
