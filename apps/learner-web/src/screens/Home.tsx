import { Link } from 'react-router-dom';
import { useMasterySkills, useToday } from '../app/queries';
import {
  useConsumeCompletedActivity,
  useEnsureTodaysPath,
  useLaunchPlanActivity,
} from '../app/today-queries';
import { EvidenceAtlas } from '../components/EvidenceAtlas';
import { WrappedCard } from '../components/WrappedCard';
import { IconPlay } from '../components/icons';

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

// Label for the secondary button that opens the full ordered day plan (/app/today).
const PLAN_LABEL = 'View plan';

export function Home() {
  const today = useToday();
  const path = useEnsureTodaysPath();
  const launch = useLaunchPlanActivity();
  // Activities launched from the plan return HOME; mark the finished one complete here.
  useConsumeCompletedActivity();

  const plan = path.data ?? null;
  const current = plan?.activities.find((a) => a.activityId === plan.currentActivityId) ?? null;
  const remaining =
    plan?.activities.filter((a) => a.status === 'ready' || a.status === 'in_progress').length ?? 0;

  // "Glowing" is a capability claim, so it counts BKT-mastered reasoning skills —
  // the same seven the Skills page shows, reached from "All skills" below.
  const skills = useMasterySkills();
  const glowing = (skills.data ?? []).filter((s) => s.mastered).length;

  const dayLabel = today.data
    ? `Day ${today.data.dayNumber}${today.data.totalDays ? ` of ${today.data.totalDays}` : ''}`
    : 'Welcome back';

  return (
    <div className="mc-home">
      <header className="mc-home__greeting">
        <p className="mc-home__hello">{greeting()}</p>
        <h1 className="mc-home__day">{dayLabel}</h1>
        <p className="mc-home__sub">
          {glowing > 0 ? `${glowing} skill${glowing === 1 ? '' : 's'} glowing` : 'A calm place to begin'}
        </p>
      </header>

      <EvidenceAtlas variant="home" />

      {current ? (
        <div className="mc-upnext mc-upnext--running">
          <div className="mc-upnext__text">
            <span className="mc-upnext__eyebrow">Today’s Path · Up next</span>
            <span className="mc-upnext__title">{current.title}</span>
            <span className="mc-upnext__meta">
              {current.estimatedMinutes} min · {remaining} activit
              {remaining === 1 ? 'y' : 'ies'} left
            </span>
          </div>
          <div className="mc-upnext__actions">
            <Link to="/app/today" className="mc-upnext__planbtn">
              {PLAN_LABEL}
            </Link>
            <button
              type="button"
              className="mc-upnext__play mc-upnext__play--btn"
              onClick={() => launch(current)}
              aria-label={`Start ${current.title}`}
            >
              <IconPlay />
            </button>
          </div>
        </div>
      ) : (
        <Link to="/app/today" className="mc-upnext" aria-label="Today’s Path">
          <div className="mc-upnext__text">
            <span className="mc-upnext__eyebrow">Today’s Path</span>
            <span className="mc-upnext__title">
              {plan?.built ? 'Today’s path complete' : 'Start today’s plan'}
            </span>
            <span className="mc-upnext__meta">
              {plan?.built ? 'Nice work — review it or rest' : 'Build a plan sized to your day'}
            </span>
          </div>
          <span className="mc-upnext__play" aria-hidden="true">
            <IconPlay />
          </span>
        </Link>
      )}

      <Link to="/app/passage" className="mc-upnext mc-passage" aria-label="Passage of the Day">
        <div className="mc-upnext__text">
          <span className="mc-upnext__eyebrow">Daily reading rep · optional</span>
          <span className="mc-upnext__title">Passage of the Day</span>
          <span className="mc-upnext__meta">A short reading rep to keep your stamina warm.</span>
        </div>
        <span className="mc-upnext__play mc-passage__play" aria-hidden="true">
          <IconPlay />
        </span>
      </Link>

      <WrappedCard />
    </div>
  );
}
