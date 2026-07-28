import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button, Callout, Card, Eyebrow, Stack } from '@mcat/ui-web';
import type { PlanActivityView, TodaysPathView } from '@mcat/contracts';
import { DAILY_MINUTES_PRESETS } from '@mcat/contracts';
import {
  useBuildTodaysPath,
  useRecordPlanActivity,
  useSetDailyBudget,
  useTodaysPath,
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

/** Read the guided-runner return signal from history state (set by launched engines). */
interface ReturnState {
  completedActivityId?: string;
}

export function TodaysPath() {
  const navigate = useNavigate();
  const location = useLocation();
  const path = useTodaysPath();
  const build = useBuildTodaysPath();
  const record = useRecordPlanActivity();
  const setBudget = useSetDailyBudget();

  const view = path.data ?? null;
  const built = view?.built ?? false;

  // Auto-build once when there is no plan for today yet (feeds the client recall load).
  const triggeredBuild = useRef(false);
  useEffect(() => {
    if (!path.isSuccess || built || build.isPending || triggeredBuild.current) return;
    triggeredBuild.current = true;
    build.mutate(undefined);
  }, [path.isSuccess, built, build]);

  // When a launched activity returns here, mark it complete (guided one-at-a-time).
  const consumedReturn = useRef(false);
  useEffect(() => {
    const state = location.state as ReturnState | null;
    const completedActivityId = state?.completedActivityId;
    if (!completedActivityId || consumedReturn.current) return;
    consumedReturn.current = true;
    record.mutate(
      { activityId: completedActivityId, status: 'complete' },
      { onSettled: () => navigate(location.pathname, { replace: true, state: null }) },
    );
  }, [location, navigate, record]);

  const launch = (a: PlanActivityView): void => {
    record.mutate({ activityId: a.activityId, status: 'in_progress' });
    const state = { returnTo: '/app/today', activityId: a.activityId } as const;
    switch (a.kind) {
      case 'cars_duel':
        navigate('/app/cars', { state: { ...state, autostart: true } });
        break;
      case 'recall':
        navigate('/app/recall/review', {
          state: {
            ...state,
            minutesBudget: a.minutesBudget ?? undefined,
            maxCards: a.count ?? undefined,
          },
        });
        break;
      case 'lesson':
        if (a.lessonSlug) navigate(`/app/lesson/${a.lessonSlug}`, { state });
        break;
      case 'practice':
        navigate('/app/practice/session', {
          state: { ...state, x: a.count ?? 8, focus: a.focus ?? undefined },
        });
        break;
      case 'review_mistakes':
        navigate('/app/mistakes', { state });
        break;
    }
  };

  const skip = (a: PlanActivityView): void => {
    record.mutate({ activityId: a.activityId, status: 'skipped' });
  };

  if (path.isLoading || (!built && build.isPending)) {
    return <div className="mc-center mc-muted">Building today’s path…</div>;
  }

  const activities = view?.activities ?? [];
  const current = activities.find((a) => a.activityId === view?.currentActivityId) ?? null;
  const completedCount = activities.filter((a) => a.status === 'complete').length;
  const skippedCount = activities.filter((a) => a.status === 'skipped').length;
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
              {completedCount} of {activities.length} done
              {skippedCount > 0 ? ` · ${skippedCount} skipped` : ''}
            </p>
          ) : null}
        </div>
        <Stack gap={3}>
          {activities.map((a, i) => {
            const done = a.status === 'complete';
            const skipped = a.status === 'skipped';
            const isCurrent = a.activityId === view?.currentActivityId;
            const startLabel = a.status === 'in_progress' ? 'Continue' : 'Start';
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
                      {done ? 'Done' : skipped ? 'Skipped' : isCurrent ? 'Up next' : 'Ready'}
                    </span>
                    {/* The current activity is launched from the hero above; the row
                        only offers Skip so there's a single primary "Start" CTA. */}
                    {!done && !skipped && !isCurrent ? (
                      <Button
                        variant="secondary"
                        onClick={() => launch(a)}
                        aria-label={`${startLabel} ${a.title}`}
                      >
                        {startLabel}
                      </Button>
                    ) : null}
                    {!done && !skipped ? (
                      <button
                        type="button"
                        className="mc-textbtn"
                        onClick={() => skip(a)}
                        disabled={record.isPending}
                        aria-label={`Skip ${a.title}`}
                      >
                        Skip
                      </button>
                    ) : null}
                  </div>
                </div>
              </Card>
            );
          })}
        </Stack>
      </section>

      <Callout tone="info">
        Today’s Path orchestrates your other tools — it never scores mastery itself. Practice moves
        your mastery; Recall and CARS stay formative.
      </Callout>
    </div>
  );
}
