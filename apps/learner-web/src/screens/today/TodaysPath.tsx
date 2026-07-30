import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Button, Callout, Card, Eyebrow, Stack } from '@mcat/ui-web';
import type { PlanActivityView, TodaysPathView } from '@mcat/contracts';
import { DAILY_MINUTES_MAX, DAILY_MINUTES_MIN } from '@mcat/contracts';
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
  practice_test: 'Practice Test',
};

const BAND_NOTE: Record<TodaysPathView['reviewDebtBand'], string | null> = {
  normal: null,
  reduce_new: 'Review is stacking up — new lessons are throttled today so you can catch up.',
  pause_new: 'Recovery mode: new lessons are paused until your review backlog comes down.',
};

const clampMinutes = (m: number): number =>
  Math.max(DAILY_MINUTES_MIN, Math.min(DAILY_MINUTES_MAX, Math.round(m)));

export function TodaysPath() {
  const path = useEnsureTodaysPath();
  const build = useBuildTodaysPath();
  const setBudget = useSetDailyBudget();
  const launch = useLaunchPlanActivity();
  useConsumeCompletedActivity();

  const view = path.data ?? null;
  const built = view?.built ?? false;
  const budgetMinutes = view ? view.dailyBudgetMinutes || view.dailyMinutesPreset : DAILY_MINUTES_MIN;

  // Free hours + minutes inputs, seeded from the current budget and committed on
  // blur/Enter. They are the source of truth WHILE the learner is editing: committing
  // one field fires an async plan recompute that echoes the same budget back on
  // `view`, and re-seeding both inputs on that echo is what reverted a second field
  // typed during the round-trip (edit hours → tab to minutes → recompute lands →
  // minutes snaps back). So the inputs stay live (never disabled mid-recompute) and we
  // re-seed only for a budget we did NOT just set, and never while a field is focused.
  const [hoursStr, setHoursStr] = useState('');
  const [minsStr, setMinsStr] = useState('');
  const syncedTotalRef = useRef<number | null>(null);
  const editingRef = useRef(false);
  useEffect(() => {
    if (!view) return;
    const total = view.dailyBudgetMinutes || view.dailyMinutesPreset;
    // Our own recompute echo, or the learner is mid-edit → leave the inputs alone.
    if (syncedTotalRef.current === total || editingRef.current) return;
    syncedTotalRef.current = total;
    setHoursStr(String(Math.floor(total / 60)));
    setMinsStr(String(total % 60));
  }, [view?.dailyBudgetMinutes, view?.dailyMinutesPreset]);

  const commitBudget = () => {
    const total = clampMinutes((Number(hoursStr) || 0) * 60 + (Number(minsStr) || 0));
    // Record the committed value BEFORE the mutate so the recompute's echo is
    // recognised as our own and does not clobber the field the learner edits next.
    syncedTotalRef.current = total;
    setHoursStr(String(Math.floor(total / 60)));
    setMinsStr(String(total % 60));
    // Changing the time re-plans the day but keeps everything already finished/started.
    if (total !== budgetMinutes) {
      setBudget.mutate(total, { onSuccess: () => build.mutate({ force: true }) });
    }
  };
  const onBudgetFocus = () => {
    editingRef.current = true;
  };
  const onBudgetBlur = () => {
    editingRef.current = false;
    commitBudget();
  };
  const onBudgetKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
  };

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
      </header>

      <Card elevated>
        <Stack gap={3}>
          <div className="mc-plan__budgetrow">
            <div className="mc-plan__budgetleft">
              <p className="mc-plan__budgetlabel">Daily time</p>
              {view && view.reviewSharePct > 0 ? (
                <span className="mc-plan__reviewbadge">
                  {Math.round(view.reviewSharePct * 100)}% reviewed
                </span>
              ) : null}
            </div>
            <div className="mc-timeinput">
              <input
                className="mc-timeinput__field"
                type="number"
                inputMode="numeric"
                min={2}
                max={6}
                value={hoursStr}
                onChange={(e) => setHoursStr(e.target.value)}
                onFocus={onBudgetFocus}
                onBlur={onBudgetBlur}
                onKeyDown={onBudgetKey}
                aria-label="Hours per day"
              />
              <span className="mc-timeinput__unit">h</span>
              <input
                className="mc-timeinput__field"
                type="number"
                inputMode="numeric"
                min={0}
                max={59}
                value={minsStr}
                onChange={(e) => setMinsStr(e.target.value)}
                onFocus={onBudgetFocus}
                onBlur={onBudgetBlur}
                onKeyDown={onBudgetKey}
                aria-label="Minutes per day"
              />
              <span className="mc-timeinput__unit">m</span>
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
      ) : activities.length === 0 ? (
        <Callout tone="info">
          Nothing to schedule yet. Finish onboarding, add some flashcards, or complete a lesson and
          your path will fill in.
        </Callout>
      ) : null}

      <section>
        <div className="mc-plan__planhead">
          <h2 className="mc-h2">The plan</h2>
          {activities.length > 0 ? (
            <div className="mc-plan__stats">
              <span className="mc-plan__stat">
                {completedCount} of {activities.length} done
              </span>
              <span className="mc-plan__stat">~{remainingMinutes} min left</span>
            </div>
          ) : null}
        </div>
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
                    {isCurrent ? (
                      <Button variant="primary" onClick={() => launch(a)}>
                        {a.status === 'in_progress' ? 'Continue' : 'Start'}
                      </Button>
                    ) : (
                      <span className={`mc-pill ${done ? 'mc-pill--ok' : ''}`}>
                        {done ? 'Finished' : a.status === 'snoozed' ? 'Tomorrow' : 'Locked'}
                      </span>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </Stack>
      </section>
    </div>
  );
}
