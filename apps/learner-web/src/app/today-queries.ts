import { useCallback, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CandidateLessonInput, PlanActivityView, RecallLoadInput } from '@mcat/contracts';
import { authority } from './authority';
import { useRecallLoad, useRecallService } from './recall-queries';
import { APP_NATIVE_LESSONS } from '../app-native';

/**
 * Today's Path client hooks. The plan is built SERVER-SIDE, but Recall (fact
 * flashcards) and the app-native lesson catalog live on the client — so the
 * client feeds a recall-load summary + candidate lessons into the build command
 * and the authority does the scoring/sizing/ordering + persistence.
 */

const EMPTY_RECALL_LOAD: RecallLoadInput = {
  dueLearning: 0,
  dueReviews: 0,
  newAvailable: 0,
  due: 0,
  estimatedMinutesForDue: 0,
};

/** MCAT section code for a lesson subject (provisional exam-weight bucket). */
function sectionForSubject(subject: string): string | null {
  const s = subject.toLowerCase();
  if (/cars|critical analysis|reasoning skills/.test(s)) return 'cars';
  if (/biochem|biology|bio\b/.test(s)) return 'bb';
  if (/chem|physics|phys/.test(s)) return 'cp';
  if (/psych|socio|behav/.test(s)) return 'ps';
  return null;
}

/** The app-native lessons offered as Today's Path candidates (client-owned catalog). */
export function buildCandidateLessons(): CandidateLessonInput[] {
  return APP_NATIVE_LESSONS.map(({ script }) => ({
    lessonId: script.id,
    slug: script.slug,
    title: script.title,
    section: sectionForSubject(script.subject),
    cluster: null,
    kcCount: script.requiredKcs.length,
    kcIds: script.requiredKcs.map((kc) => kc.id),
    // Empty until the authored prerequisite map is provided; the engine is ready to
    // honor it (unlock-gating, prereqs-first, score-by-downstream) as soon as it is.
    prerequisiteLessonIds: [],
    estimatedMinutes: script.estimatedMinutes,
  }));
}

const TODAYS_PATH_INVALIDATE = ['today', 'todays-path', 'bootstrap'];

export const useTodaysPath = () =>
  useQuery({ queryKey: ['todays-path'], queryFn: () => authority.getTodaysPath() });

export function useBuildTodaysPath() {
  const qc = useQueryClient();
  const service = useRecallService();
  return useMutation({
    mutationFn: async (opts?: { force?: boolean }) => {
      const load = service ? await service.estimateLoad() : null;
      const recallLoad: RecallLoadInput = load
        ? {
            dueLearning: load.dueLearning,
            dueReviews: load.dueReviews,
            newAvailable: load.newAvailable,
            due: load.due,
            estimatedMinutesForDue: load.estimatedMinutesForDue,
          }
        : EMPTY_RECALL_LOAD;
      return authority.buildTodaysPath({
        recallLoad,
        candidateLessons: buildCandidateLessons(),
        force: opts?.force ?? false,
        timezoneOffsetMinutes: new Date().getTimezoneOffset(),
      });
    },
    onSuccess: (view) => {
      qc.setQueryData(['todays-path'], view);
      void Promise.all(TODAYS_PATH_INVALIDATE.map((k) => qc.invalidateQueries({ queryKey: [k] })));
    },
  });
}

export function useRecordPlanActivity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { activityId: string; status: 'in_progress' | 'complete' | 'skipped' }) =>
      authority.recordPlanActivity(v.activityId, v.status),
    onSuccess: () =>
      Promise.all(TODAYS_PATH_INVALIDATE.map((k) => qc.invalidateQueries({ queryKey: [k] }))),
  });
}

export function useSetDailyBudget() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (minutesPerDay: number) => authority.setDailyBudget(minutesPerDay),
    onSuccess: () =>
      Promise.all(TODAYS_PATH_INVALIDATE.map((k) => qc.invalidateQueries({ queryKey: [k] }))),
  });
}

/** Card count below which Recall isn't scheduled (mirrors the engine's recallMinDue). */
const RECALL_MIN_DUE = 5;

/**
 * Ensure today's plan exists and stays current on a hub screen (Home / Today's Path):
 * builds it on first view, and — if the learner adds their first deck mid-day — re-runs
 * the build so Recall is injected as the next step. Self-limiting: it only fires when a
 * build/refresh is actually warranted, and at most once per (day, need).
 */
export function useEnsureTodaysPath() {
  const path = useTodaysPath();
  const load = useRecallLoad();
  const build = useBuildTodaysPath();
  const attempted = useRef<string | null>(null);
  useEffect(() => {
    if (!path.isSuccess || build.isPending) return;
    const view = path.data;
    const due = load.data?.due ?? 0;
    const hasRecall = view?.activities.some((a) => a.kind === 'recall') ?? false;
    const needsBuild = !view?.built;
    const needsRecall = Boolean(view?.built) && !hasRecall && due >= RECALL_MIN_DUE;
    if (!needsBuild && !needsRecall) return;
    const sig = `${view?.planDate ?? 'none'}:${needsBuild ? 'build' : 'recall'}`;
    if (attempted.current === sig) return; // a no-op server response must not loop
    attempted.current = sig;
    build.mutate(undefined);
  }, [path.isSuccess, path.data, load.data, build]);
  return path;
}

/**
 * Launch a plan activity in the guided runner: mark it in-progress and open the
 * matching engine, telling each one how much to do (Recall cards/minutes, Practice
 * question count, CARS defaults). On finish the activity returns to HOME, which marks
 * it complete and surfaces the next step.
 */
export function useLaunchPlanActivity() {
  const navigate = useNavigate();
  const record = useRecordPlanActivity();
  return useCallback(
    (a: PlanActivityView): void => {
      record.mutate({ activityId: a.activityId, status: 'in_progress' });
      const state = { returnTo: '/app', activityId: a.activityId } as const;
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
    },
    [navigate, record],
  );
}

/**
 * On a hub screen that activities return to (Home / Today's Path), mark the returned
 * activity complete once, then clear the history state so a refresh can't re-mark it.
 */
export function useConsumeCompletedActivity() {
  const location = useLocation();
  const navigate = useNavigate();
  const record = useRecordPlanActivity();
  const consumed = useRef(false);
  useEffect(() => {
    const state = location.state as { completedActivityId?: string } | null;
    const completedActivityId = state?.completedActivityId;
    if (!completedActivityId || consumed.current) return;
    consumed.current = true;
    record.mutate(
      { activityId: completedActivityId, status: 'complete' },
      { onSettled: () => navigate(location.pathname, { replace: true, state: null }) },
    );
  }, [location, navigate, record]);
}
