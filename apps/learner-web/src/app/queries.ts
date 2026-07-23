import { QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { LessonActionInput, LessonRunId, ProbableCause } from '@mcat/contracts';
import type { GoalInput } from '@mcat/client-core';
import { authority } from './authority';

export const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 0, refetchOnWindowFocus: false, retry: false } },
});

const LEARNER_KEYS = ['bootstrap', 'today', 'session', 'mastery', 'errors'];
const invalidateLearner = (qc: QueryClient) =>
  Promise.all(LEARNER_KEYS.map((k) => qc.invalidateQueries({ queryKey: [k] })));

export const useBootstrap = () =>
  useQuery({ queryKey: ['bootstrap'], queryFn: () => authority.bootstrap() });
export const useToday = () =>
  useQuery({ queryKey: ['today'], queryFn: () => authority.getToday() });
export const useSession = () =>
  useQuery({ queryKey: ['session'], queryFn: () => authority.getSession() });
export const useMasteryMap = () =>
  useQuery({ queryKey: ['mastery'], queryFn: () => authority.getMasteryMap() });
export const useErrorLog = () =>
  useQuery({ queryKey: ['errors'], queryFn: () => authority.getErrorLog() });
export const useSkills = () =>
  useQuery({ queryKey: ['skills'], queryFn: () => authority.getSkills() });
export const useDiagnosticNext = () =>
  useQuery({ queryKey: ['diagnostic'], queryFn: () => authority.getDiagnosticNext() });

export function useSubmitDiagnostic() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { questionId: string; choiceId: string | null }) =>
      authority.submitDiagnostic(v.questionId, v.choiceId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['diagnostic'] }),
  });
}

export function useConfirmPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (goal: GoalInput) => authority.confirmPlan(goal),
    onSuccess: () => invalidateLearner(qc),
  });
}

export function useSubmitAttempt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (choiceId: string | null) => authority.submitAttempt(choiceId),
    onSuccess: () => invalidateLearner(qc),
  });
}

export function useSelectCause() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (cause: ProbableCause) => authority.selectCause(cause),
    onSuccess: () => invalidateLearner(qc),
  });
}

export function useRequestReveal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => authority.requestReveal(),
    onSuccess: () => invalidateLearner(qc),
  });
}

export function useContinueStep() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => authority.continueStep(),
    onSuccess: () => invalidateLearner(qc),
  });
}

export function useSubmitRecall() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (answer: string) => authority.submitRecall(answer),
    onSuccess: () => invalidateLearner(qc),
  });
}

export function useLessonAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { runId: LessonRunId; runVersion: number; action: LessonActionInput }) =>
      authority.dispatchLessonAction(input.runId, input.runVersion, input.action),
    onSuccess: () => invalidateLearner(qc),
  });
}

export function useResetProgress() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => authority.resetProgress(),
    onSuccess: () => invalidateLearner(qc),
  });
}

export const useWrapped = () =>
  useQuery({ queryKey: ['wrapped'], queryFn: () => authority.getWrapped() });

export const usePracticeItem = (questionId: string) =>
  useQuery({
    queryKey: ['practice', questionId],
    queryFn: () => authority.getPracticeItem(questionId),
  });

export function useCheckPractice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { questionId: string; choiceId: string | null }) =>
      authority.checkPractice(v.questionId, v.choiceId),
    onSuccess: () => invalidateLearner(qc),
  });
}

export function useRecordCarsDuel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => authority.recordCarsDuel(),
    onSuccess: () => invalidateLearner(qc),
  });
}
