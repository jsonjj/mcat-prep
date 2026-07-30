import { useCallback, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  type CandidateLessonInput,
  type LessonMasteryView,
  type PlanActivityView,
  type RecallLoadInput,
} from '@mcat/contracts';
import { authority } from './authority';
import { REGISTERED_LESSONS, lessonBySlug } from './lesson-catalog';
import { useMasteryLessons } from './queries';
import { useRecallLoad, useRecallService } from './recall-queries';
import { PLAN_ACTIVITY_COMPLETE_INVALIDATE, TODAYS_PATH_INVALIDATE } from './invalidation-keys';

/**
 * Today's Path client hooks. The plan is built SERVER-SIDE, but Recall (fact
 * flashcards) and the servable lesson catalog live on the client — so the client
 * feeds a recall-load summary + candidate lessons into the build command and the
 * authority does the scoring/sizing/ordering + persistence. The lesson candidates
 * come from the registration manifest (`./lesson-catalog`), the app's single
 * servability source, so the planner can only ever schedule a lesson the app can
 * actually serve.
 */

const EMPTY_RECALL_LOAD: RecallLoadInput = {
  dueLearning: 0,
  dueReviews: 0,
  newAvailable: 0,
  due: 0,
  estimatedMinutesForDue: 0,
};

/**
 * The servable lessons offered as Today's Path candidates, straight from the
 * registration manifest. Every field the planner scores on — section, cluster,
 * required KCs, prerequisites, estimated minutes — is threaded from the manifest,
 * which the boot guard has already reconciled against the checked-in curriculum
 * and cluster atlas. Prerequisites are a closed set of registered lessons, so a
 * candidate can never depend on a lesson Today's Path cannot itself complete.
 */
export function buildCandidateLessons(): CandidateLessonInput[] {
  return REGISTERED_LESSONS.map((lesson) => ({
    lessonId: lesson.lessonId,
    slug: lesson.slug,
    title: lesson.title,
    section: lesson.section,
    cluster: lesson.cluster,
    kcCount: lesson.kcIds.length,
    kcIds: [...lesson.kcIds],
    prerequisiteLessonIds: [...lesson.prerequisiteLessonIds],
    estimatedMinutes: lesson.estimatedMinutes,
  }));
}

// ---- Honest catalog-completion state ---------------------------------------
// The daily planner ALWAYS reserves a CARS Duel, so Today's Path is never
// literally empty — the meaningful "empty state" is the servable LESSON catalog
// being finished. That's derived here (not from the plan's activity list, and
// not from how candidates are built) so the screen can say so honestly instead
// of falling through to onboarding copy that implies a lesson is still missing.

export interface CatalogCompletion {
  /** Registered (servable) lessons in the catalog. */
  readonly total: number;
  /** How many of them the learner has finished (see below for the bar). */
  readonly complete: number;
  /** True once every registered lesson is complete (and the catalog is non-empty). */
  readonly allComplete: boolean;
}

/**
 * Whether the learner has finished the entire servable catalog, joining the
 * registration manifest (the servability source of record) to the per-lesson
 * mastery read. A lesson counts as complete only when its WARRANTED mastery claim
 * holds (`LessonMasteryView.mastered`) — the one terminal per-lesson signal the
 * client holds, and deliberately the STRICT bar: the completion state must never
 * overclaim while a lesson is merely delivered-but-not-mastered, because the
 * planner still reinforces those (todays-path.ts §1b). Pure + manifest-injectable
 * so the all-complete state is unit-testable without a live authority.
 */
export function catalogCompletion(
  masteryLessons: readonly Pick<LessonMasteryView, 'lessonId' | 'mastered'>[],
  registered: readonly { readonly lessonId: string }[] = REGISTERED_LESSONS,
): CatalogCompletion {
  const masteredIds = new Set(
    masteryLessons.filter((lesson) => lesson.mastered).map((lesson) => lesson.lessonId),
  );
  const complete = registered.filter((lesson) => masteredIds.has(lesson.lessonId)).length;
  return {
    total: registered.length,
    complete,
    allComplete: registered.length > 0 && complete === registered.length,
  };
}

/**
 * Catalog-completion state for the Today's Path empty state. Reports not-complete
 * while the mastery read is loading, so the plan never flashes a premature
 * "you've finished everything" before the authority has answered.
 */
export function useCatalogComplete(): CatalogCompletion {
  const mastery = useMasteryLessons();
  return catalogCompletion(mastery.data ?? []);
}

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
    // Completing a Review Mistakes activity moves the server's
    // `mistakesReviewedThrough` watermark, so a completion also has to drop the
    // Mistakes tab's caches; in_progress / skipped move nothing there.
    onSuccess: (_result, v) => {
      const keys =
        v.status === 'complete' ? PLAN_ACTIVITY_COMPLETE_INVALIDATE : TODAYS_PATH_INVALIDATE;
      return Promise.all(keys.map((k) => qc.invalidateQueries({ queryKey: [k] })));
    },
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
        case 'lesson': {
          // A scheduled lesson launches on its real manifest route (the same route
          // the Curriculum uses). Candidates only ever come from the manifest, so
          // the slug resolves; the preview-route fallback is a defensive no-op.
          const registered = a.lessonSlug ? lessonBySlug(a.lessonSlug) : undefined;
          if (registered) navigate(registered.routePath, { state });
          else if (a.lessonSlug) navigate(`/app/lesson/${a.lessonSlug}`, { state });
          break;
        }
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
