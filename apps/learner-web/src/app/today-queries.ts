import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CandidateLessonInput, RecallLoadInput } from '@mcat/contracts';
import { authority } from './authority';
import { useRecallService } from './recall-queries';
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
