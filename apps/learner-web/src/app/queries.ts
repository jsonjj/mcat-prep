import { QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CarsDuelRubric,
  MasterySeed,
  ProbableCause,
  VectorLessonAction,
} from '@mcat/contracts';
import type { GoalInput } from '@mcat/client-core';
import { authority } from './authority';
import { diagnosticClient, type DiagnosticBlockView } from './diagnostic-client';

export const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 0, refetchOnWindowFocus: false, retry: false } },
});

const LEARNER_KEYS = [
  'bootstrap',
  'today',
  'session',
  'mastery',
  'mastery-skills',
  'mastery-lessons',
  'cars-readiness',
  'errors',
  'vector-lesson-status',
  'vector-lesson-run',
];
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
/** BKT mastery: the 7 reasoning-skill readouts (Skills page). */
export const useMasterySkills = () =>
  useQuery({ queryKey: ['mastery-skills'], queryFn: () => authority.getMasterySkills() });
/** BKT mastery: per-lesson P(L) (Progress brain). */
export const useMasteryLessons = () =>
  useQuery({ queryKey: ['mastery-lessons'], queryFn: () => authority.getMasteryLessons() });
/** CARS IRT readiness (gauge + sub-skill bars). */
export const useCarsReadiness = () =>
  useQuery({ queryKey: ['cars-readiness'], queryFn: () => authority.getCarsReadiness() });
export const useErrorLog = () =>
  useQuery({ queryKey: ['errors'], queryFn: () => authority.getErrorLog() });
export const useSkills = () =>
  useQuery({ queryKey: ['skills'], queryFn: () => authority.getSkills() });
/**
 * The diagnostic is served by the real multistage engine over the v7
 * learner-safe bank (dev/preview Vite plugin; API Gateway in prod), a whole
 * block at a time. It is wired through the dedicated {@link diagnosticClient}
 * rather than the generic authority port because it carries one-use block
 * tokens and never receives an answer key.
 */
export const useDiagnosticNext = () =>
  useQuery({ queryKey: ['diagnostic'], queryFn: () => diagnosticClient.start() });

export function useSubmitDiagnosticBlock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: {
      questionIds: readonly string[];
      answers: Readonly<Record<string, string>>;
      elapsedMs?: Readonly<Record<string, number>>;
    }) => diagnosticClient.submitBlock(v.questionIds, v.answers, v.elapsedMs),
    // The commit response already contains the next block/result — seed the cache
    // directly to avoid re-serving (and re-tokenizing) it.
    onSuccess: (next: DiagnosticBlockView) => qc.setQueryData(['diagnostic'], next),
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

export function useVectorLessonStatus() {
  return useQuery({
    queryKey: ['vector-lesson-status'],
    queryFn: () => authority.getVectorLessonStatus(),
  });
}

export function useStartVectorLesson() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => authority.startVectorLesson(),
    onSuccess: () => {
      void invalidateLearner(qc);
    },
  });
}

export function useVectorLessonRun() {
  return useQuery({
    queryKey: ['vector-lesson-run'],
    queryFn: () => authority.getVectorLessonRun(),
  });
}

export function useSubmitVectorLessonAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { runId: string; screenToken: string; action: VectorLessonAction }) =>
      authority.submitVectorLessonAction(input.runId, input.screenToken, input.action),
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

/**
 * Hand the finished diagnostic's opening priors to the authority.
 *
 * This is the only point at which the diagnostic touches mastery. It initializes
 * unpractised lessons and nothing else, so it is safe to fire once on completion
 * and safe to have no effect when it runs again.
 */
export function useApplyMasterySeed() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (seed: MasterySeed) => authority.applyMasterySeed(seed),
    onSuccess: () => invalidateLearner(qc),
  });
}

export function useRecordCarsDuel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (rubric?: CarsDuelRubric) => authority.recordCarsDuel(rubric),
    onSuccess: () => invalidateLearner(qc),
  });
}
