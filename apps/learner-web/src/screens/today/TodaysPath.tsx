import { Button, Callout, Card, Eyebrow, Stack } from '@mcat/ui-web';
import type { PlanActivityView, TodaysPathView } from '@mcat/contracts';
import { DAILY_MINUTES_PRESETS } from '@mcat/contracts';
import {
  useBuildTodaysPath,
  useConsumeCompletedActivity,
  useEnsureTodaysPath,
  useLaunchPlanActivity,
  useSetDailyBudget,
} from '../../app/today-queries';

const KIND_LABEL: Record<PlanActivityView['kind'], string> = {
  cars_duel: 'CARS Duel',
  recall: 'Recall',
  review_mistakes: 'Review Mistakes',
  lesson: 'Lesson',
  practice: 'Practice',
};

const BAND_NOTE: Record<TodaysPathView['reviewDebtBand'], string | null> = {
  normal: null,
  reduce_new: 'Review is stacking up — new lessons are throttled today so you can catch up.',
  pause_new: 'Recovery mode: new lessons are paused until your review backlog comes down.',
};

const presetLabel = (m: number): string => `${Math.round(m / 60)} hr`;

export function TodaysPath() {
  const path = useEnsureTodaysPath();
  const build = useBuildTodaysPath();
  const setBudget = useSetDailyBudget();
  const launch = useLaunchPlanActivity();
  useConsumeCompletedActivity();

  const view = path.data ?? null;
  const built = view?.built ?? false;

  if (path.isLoading || (path.isSuccess && !built)) {
    return <div className="mc-center mc-muted">Building today’s path…</div>;
  }

  const activities = view?.activities ?? [];
  const current = activities.find((a) => a.activityId === view?.currentActivityId) ?? null;
  const completedCount = activities.filter((a) => a.status === 'complete').length;
  const remainingMinutes = activities
    .filter((a) => a.status === 'ready' || a.status === 'in_progress')
    .reduce((sum, a) => sum + a.estimatedMinutes, 0);
  const allDone = activities.length > 0 && current === null;

  return (
    <div className="mc-screen mc-plan">
      <header className="mc-screen__head">
        <Eyebrow>Today’s Path</Eyebrow>
        <h1 className="mc-h1">
          {view ? `Day ${view.dayNumber}${view.totalDays ? ` of ${view.totalDays}` : ''}` : 'Today'}
        </h1>
        <p className="mc-muted mc-fineprint">
          One plan, run top to bottom. Do this next — we’ll launch each activity and pick up where you
          left off.
        </p>
      </header>

      <Card elevated>
        <Stack gap={3}>
          <div className="mc-plan__budgetrow">
            <div>
              <p className="mc-label">Daily time</p>
              <p className="mc-muted mc-fineprint">
                {view
                  ? `~${view.plannedMinutes} of ${view.dailyBudgetMinutes || view.dailyMinutesPreset} min planned`
                  : ''}
                {view && view.reviewSharePct > 0
                  ? ` · ${Math.round(view.reviewSharePct * 100)}% review`
                  : ''}
              </p>
            </div>
            <div className="mc-segmented" role="radiogroup" aria-label="Daily time budget">
              {DAILY_MINUTES_PRESETS.map((m) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={view?.dailyMinutesPreset === m}
                  className={`mc-segmented__opt ${view?.dailyMinutesPreset === m ? 'is-active' : ''}`}
                  onClick={() =>
                    setBudget.mutate(m, { onSuccess: () => build.mutate({ force: true }) })
                  }
                  disabled={setBudget.isPending || build.isPending}
                >
                  {presetLabel(m)}
                </button>
              ))}
            </div>
          </div>
          {view && BAND_NOTE[view.reviewDebtBand] ? (
            <Callout tone="warning">{BAND_NOTE[view.reviewDebtBand]}</Callout>
          ) : null}
        </Stack>
      </Card>

      {allDone ? (
        <Callout tone="success" title="Path complete">
          You finished today’s path. Anything you skipped will come back tomorrow — capped so it never
          snowballs.
        </Callout>
      ) : current ? (
        <Card elevated className="mc-plan__current">
          <Stack gap={3}>
            <Eyebrow>Do this next</Eyebrow>
            <p className="mc-task__title">{current.title}</p>
            <p className="mc-muted mc-fineprint">
              {KIND_LABEL[current.kind]} · {current.estimatedMinutes} min · {current.detail}
            </p>
            <Button variant="primary" size="lg" fullWidth onClick={() => launch(current)}>
              {current.status === 'in_progress' ? 'Continue' : 'Start'} {current.title}
            </Button>
          </Stack>
        </Card>
      ) : activities.length === 0 ? (
        <Callout tone="info">
          Nothing to schedule yet. Finish onboarding, add some flashcards, or complete a lesson and
          your path will fill in.
        </Callout>
      ) : null}

      <section>
        <div className="mc-screen__head">
          <h2 className="mc-h2">The plan</h2>
          {activities.length > 0 ? (
            <p className="mc-muted mc-fineprint">
              {completedCount} of {activities.length} done · ~{remainingMinutes} min left
            </p>
          ) : null}
        </div>
        {/* The plan runs strictly in order: only the current "up next" activity is
            launchable (from the hero above). Rows are read-only status + time. */}
        <Stack gap={3}>
          {activities.map((a, i) => {
            const done = a.status === 'complete';
            const isCurrent = a.activityId === view?.currentActivityId;
            return (
              <Card key={a.activityId} elevated className={isCurrent ? 'mc-plan__row--current' : ''}>
                <div className="mc-task">
                  <div className="mc-plan__rowtext">
                    <Eyebrow>
                      {i + 1}. {KIND_LABEL[a.kind]}
                      {a.carriedOver ? ' · carried over' : ''}
                    </Eyebrow>
                    <p className="mc-task__title">{a.title}</p>
                    <p className="mc-muted mc-fineprint">
                      {a.estimatedMinutes} min · {a.detail}
                    </p>
                  </div>
                  <div className="mc-plan__rowactions">
                    <span className={`mc-pill ${done ? 'mc-pill--ok' : ''}`}>
                      {done
                        ? 'Done'
                        : a.status === 'snoozed'
                          ? 'Tomorrow'
                          : isCurrent
                            ? 'Up next'
                            : 'Locked'}
                    </span>
                  </div>
                </div>
              </Card>
            );
          })}
        </Stack>
      </section>

      {view && view.freeStudyMinutes > 0 ? (
        <Callout tone="info" title="Free study (optional)">
          ~{view.freeStudyMinutes} min of your budget is unscheduled. Practice is sized to what you
          actually need to review — spend the rest however you like, or bank the time.
        </Callout>
      ) : null}

      <Callout tone="info">
        Today’s Path orchestrates your other tools — it never scores mastery itself. Practice moves
        your mastery; Recall and CARS stay formative.
      </Callout>
    </div>
  );
}
