import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useMasterySkills } from '../app/queries';
import {
  useConsumeCompletedActivity,
  useEnsureTodaysPath,
  useLaunchPlanActivity,
} from '../app/today-queries';
import { EvidenceAtlas } from '../components/EvidenceAtlas';
import { WrappedCard } from '../components/WrappedCard';
import { IconPlay } from '../components/icons';
import { fetchTodaysPassage } from './passage/passage-client';

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

// Label for the secondary button that opens the full ordered day plan (/app/today).
const PLAN_LABEL = 'View plan';

export function Home() {
  const path = useEnsureTodaysPath();
  const launch = useLaunchPlanActivity();
  // Activities launched from the plan return to the plan (/app/today); this consumer
  // is a safety net for any completion that still lands back here on Home.
  useConsumeCompletedActivity();

  const plan = path.data ?? null;
  const current = plan?.activities.find((a) => a.activityId === plan.currentActivityId) ?? null;
  const remaining =
    plan?.activities.filter((a) => a.status === 'ready' || a.status === 'in_progress').length ?? 0;

  // "Glowing" is a capability reading, so it counts reasoning skills whose BKT
  // P(L) is at the capability cut — the same seven the Progress rail shows, and
  // read from the same field, so the two screens cannot disagree. It is
  // deliberately not a mastery claim: this view carries no evidence warrant.
  const skills = useMasterySkills();
  const glowing = (skills.data ?? []).filter((s) => s.atCapabilityCut).length;

  // Today's rotating passage, so the Home card previews the real reading rep. It
  // shares the runner's query key (one fetch, warm cache on navigation) and is
  // purely decorative here: any loading/error/empty state falls back to the
  // generic copy so Home never surfaces a failure of this optional feature.
  const passage = useQuery({ queryKey: ['passage-today'], queryFn: fetchTodaysPassage });
  const potd = passage.data ?? null;

  // Read the "Day N of M" straight from the plan (getTodaysPath) — the SAME source
  // the Today's Path screen shows — so Home and Today can never disagree on the day.
  // Home previously read `useToday` (getToday), which surfaced its own day count and
  // drifted from the plan (Home "Day 1" vs Today "Day 56 of 90" for one learner).
  const dayLabel = plan
    ? `Day ${plan.dayNumber}${plan.totalDays ? ` of ${plan.totalDays}` : ''}`
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

      <Link
        to="/app/passage"
        className="mc-upnext mc-passage mc-passage--hero"
        aria-label={
          potd ? `Passage of the Day: ${potd.title}` : 'Passage of the Day'
        }
      >
        <div className="mc-upnext__text">
          <span className="mc-upnext__eyebrow">
            Passage of the Day{potd ? ` · ${potd.discipline}` : ''}
          </span>
          <span className="mc-upnext__title">{potd ? potd.title : 'Read, reason, decide'}</span>
          <span className="mc-upnext__meta">
            {potd
              ? 'A short CARS-style reading rep · formative, never counts toward mastery'
              : 'A short CARS-style reading rep to keep your stamina warm.'}
          </span>
        </div>
        <span className="mc-upnext__play mc-passage__play" aria-hidden="true">
          <IconPlay />
        </span>
      </Link>

      <WrappedCard />
    </div>
  );
}
