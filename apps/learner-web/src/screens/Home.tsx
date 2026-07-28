import { Link } from 'react-router-dom';
import { useMasteryMap, useToday } from '../app/queries';
import {
  useConsumeCompletedActivity,
  useEnsureTodaysPath,
  useLaunchPlanActivity,
} from '../app/today-queries';
import { countGlowing } from '../components/BrainAtlas';
import { EvidenceAtlas } from '../components/EvidenceAtlas';
import { GhostCompanion } from '../components/GhostCompanion';
import { WrappedCard } from '../components/WrappedCard';
import { IconPlay, IconRecall, IconMistakesX, IconProgress } from '../components/icons';

const CAPACITY_LABEL: Record<string, string> = {
  on_track: 'On Track',
  tight: 'Tight',
  goal_plan_mismatch: 'Goal–plan',
  rolling: 'Rolling plan',
};

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

export function Home() {
  const today = useToday();
  const path = useEnsureTodaysPath();
  const mastery = useMasteryMap();
  const launch = useLaunchPlanActivity();
  // Activities launched from the plan return HOME; mark the finished one complete here.
  useConsumeCompletedActivity();
  const glowing = countGlowing(mastery.data);

  const plan = path.data ?? null;
  const current = plan?.activities.find((a) => a.activityId === plan.currentActivityId) ?? null;
  const remaining = plan?.activities.filter((a) => a.status === 'ready' || a.status === 'in_progress').length ?? 0;

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

      <GhostCompanion />
      <WrappedCard />

      <EvidenceAtlas variant="home" />

      {current ? (
        <div className="mc-upnext-wrap">
          <button
            type="button"
            className="mc-upnext mc-upnext--btn"
            aria-label={`Start ${current.title}`}
            onClick={() => launch(current)}
          >
            <div className="mc-upnext__text">
              <span className="mc-upnext__eyebrow">Today’s Path · Up next</span>
              <span className="mc-upnext__title">{current.title}</span>
              <span className="mc-upnext__meta">
                {current.estimatedMinutes} min · {remaining} activit
                {remaining === 1 ? 'y' : 'ies'} left
              </span>
            </div>
            <span className="mc-upnext__play" aria-hidden="true">
              <IconPlay />
            </span>
          </button>
          <Link to="/app/today" className="mc-upnext__link">
            View full plan
          </Link>
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

      <div className="mc-home__pills">
        <Link to="/app/recall" className="mc-hpill">
          <IconRecall className="mc-hpill__icon" />
          {today.data?.reviewsDue ?? 0} reviews
        </Link>
        <Link to="/app/mistakes" className="mc-hpill">
          <IconMistakesX className="mc-hpill__icon" />
          {today.data?.repairsOpen ?? 0} repairs
        </Link>
        <span className="mc-hpill">
          <IconProgress className="mc-hpill__icon" />
          {today.data ? (CAPACITY_LABEL[today.data.capacityLabel] ?? today.data.capacityLabel) : '—'}
        </span>
      </div>

      <Link to="/app/practice" className="mc-daily" aria-label="Practice">
        <div className="mc-daily__text">
          <span className="mc-upnext__eyebrow">Test-out reps · adaptive</span>
          <span className="mc-daily__title">Practice</span>
          <span className="mc-upnext__meta">
            Fresh questions from what you’ve learned — a correct first try moves your mastery.
          </span>
        </div>
        <span className="mc-daily__arrow" aria-hidden="true">→</span>
      </Link>

      <Link to="/app/passage" className="mc-daily" aria-label="Passage of the Day">
        <div className="mc-daily__text">
          <span className="mc-upnext__eyebrow">Daily rep · optional</span>
          <span className="mc-daily__title">Passage of the Day</span>
          <span className="mc-upnext__meta">A short reading rep to keep your stamina warm.</span>
        </div>
        <span className="mc-daily__arrow" aria-hidden="true">→</span>
      </Link>

      <Link to="/app/cars" className="mc-daily" aria-label="CARS Duel">
        <div className="mc-daily__text">
          <span className="mc-upnext__eyebrow">AI practice · optional</span>
          <span className="mc-daily__title">CARS Duel</span>
          <span className="mc-upnext__meta">Debate an AI opponent to sharpen your reasoning.</span>
        </div>
        <span className="mc-daily__arrow" aria-hidden="true">→</span>
      </Link>
    </div>
  );
}
