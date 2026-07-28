import { Link, useNavigate } from 'react-router-dom';
import { Button, Callout, Card, Eyebrow, Stack } from '@mcat/ui-web';
import { useMasteryMap, useToday } from '../app/queries';
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

const REASON_TEXT: Record<string, string> = {
  UNFINISHED_CHECKPOINT: 'Resume where you left off',
  NEW_LEARNING: 'New learning',
  OVERDUE_REVIEW: 'Due review',
  PREREQUISITE_BLOCKER: 'Prerequisite first',
};

const CLUSTER_NAMES: Record<string, string> = {
  BB1: 'Biomolecules & Metabolism',
  BB2: 'Cells & Genetics',
  BB3: 'Signaling & Organ Systems',
  BB4: 'Immunity & Development',
};

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

export function Home() {
  const navigate = useNavigate();
  const today = useToday();
  const mastery = useMasteryMap();
  const glowing = countGlowing(mastery.data);
  const upNext = today.data?.tasks.find((t) => t.taskId === today.data?.continueTaskId) ?? today.data?.tasks[0];

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

      {upNext ? (
        <Link to="/app/learn" className="mc-upnext" aria-label={`Continue: ${upNext.title}`}>
          <div className="mc-upnext__text">
            <span className="mc-upnext__eyebrow">Up next</span>
            <span className="mc-upnext__title">{upNext.title}</span>
            <span className="mc-upnext__meta">
              {upNext.estimatedMinutes} min
              {upNext.cluster ? ` · ${CLUSTER_NAMES[upNext.cluster] ?? upNext.cluster}` : ''}
            </span>
          </div>
          <span className="mc-upnext__play" aria-hidden="true">
            <IconPlay />
          </span>
        </Link>
      ) : null}

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

      {today.data && today.data.tasks.length > 0 ? (
        <section className="mc-home__plan">
          <div className="mc-screen__head">
            <h2 className="mc-h2">Today’s plan</h2>
            <p className="mc-muted mc-fineprint">
              About {Math.round(today.data.reviewSharePct * 100)}% of study time is reserved for review.
            </p>
          </div>

          <Stack gap={3}>
            {today.data.tasks.map((task) => (
              <Card key={task.taskId} elevated>
                <div className="mc-task">
                  <div>
                    <Eyebrow>{REASON_TEXT[task.priorityReason] ?? 'Recommended'}</Eyebrow>
                    <p className="mc-task__title">{task.title}</p>
                    <p className="mc-muted mc-fineprint">
                      {task.estimatedMinutes} min · {task.reasonDetail ?? ''}
                    </p>
                  </div>
                  <Button
                    variant={task.status === 'in_progress' ? 'primary' : 'secondary'}
                    onClick={() => navigate(task.type === 'quick_practice' ? '/app/recall' : '/app/learn')}
                  >
                    {task.status === 'in_progress' ? 'Continue' : 'Start'}
                  </Button>
                </div>
              </Card>
            ))}
          </Stack>

          <Callout tone="info">
            Miss a day? Nothing piles up as shame — the plan recalculates from what you actually
            complete.
          </Callout>

          <div className="mc-home__pills">
            <Link to="/app/learn" className="mc-hpill">
              Keep going →
            </Link>
            <Link to="/app/skills" className="mc-hpill">
              All skills
            </Link>
          </div>
        </section>
      ) : null}
    </div>
  );
}
