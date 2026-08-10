import {
  QueryCache,
  QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import type {
  CarsDuelOutcomeInput,
  MasterySeed,
  NormalizedLessonAction,
  VectorLessonAction,
} from '@mcat/contracts';
import {
  isRetryableError,
  isUnauthenticatedError,
  type AttemptTiming,
  type GoalInput,
} from '@mcat/client-core';
import { authority } from './authority';
import { diagnosticClient, type DiagnosticBlockView } from './diagnostic-client';
import { practiceTestClient, type PracticeTestBlockView } from './practice-test-client';
import { CARS_REASONING_KEY, LEARNER_KEYS, TODAYS_PATH_INVALIDATE } from './invalidation-keys';
import { PRACTICE_TEST_ENABLED } from './capabilities';

export const queryClient = new QueryClient({
  // Queries run with `retry: false`, so a single failed read used to surface only
  // wherever it happened to be consumed — and a read consumed during render (or a
  // future suspense/throwOnError path) could bubble up and blank the app. This
  // cache-level handler gives every query error one central landing spot: it is
  // logged here (and can toast once the app grows a toaster) instead of being lost
  // or crashing a screen. Per-query error UI still works exactly as before.
  queryCache: new QueryCache({
    onError: (error, query) => {
      console.error(`Query failed [${String(query.queryKey)}]:`, error);
    },
  }),
  defaultOptions: {
    queries: {
      staleTime: 0,
      refetchOnWindowFocus: false,
      // On load the app fires learner reads in parallel with the `bootstrap` that
      // establishes/refreshes the session cookie. A read that loses that race gets
      // a transient 401, and under a blanket `retry: false` it failed PERMANENTLY:
      // progress/mastery blanked out, and — worse — the Today's-Path GET erroring
      // meant useEnsureTodaysPath never saw `isSuccess`, so the build POST was never
      // sent and the plan hung. Retry unauthorized reads AND server-marked-retryable
      // failures — the transient 503 `unavailable` a cold Lambda instance returns while
      // it is still attaching the lesson catalog (what surfaced as repeated
      // "temporarily unavailable" 503s on /lessons/*/status) — with a growing backoff,
      // so they re-issue once the session/instance is ready. The budget is generous (~6 tries /
      // ~10s) because a COLD RELOAD re-runs the session bootstrap, which rotates the
      // `__Host-` cookie: reads firing in that window 401 until it settles, and the
      // window can exceed the old ~2s/3-try budget — that overflow is exactly what
      // surfaced the lesson "could not be restored" on reload. Genuine sign-out is
      // still handled by RequireAuth (bootstrap), and every other error class still
      // fails fast — no hammering a truly broken endpoint.
      retry: (failureCount, error) =>
        failureCount < 6 && (isUnauthenticatedError(error) || isRetryableError(error)),
      retryDelay: (attempt) => Math.min(300 * 2 ** attempt, 3000),
    },
    mutations: {
      // Same session-race tolerance as reads. A state-changing write (rebuild the
      // plan, set the daily budget, record an activity) that loses the bootstrap race
      // gets a transient 401 — and mutations do NOT retry by default, so the write
      // just failed: a budget change or deck import silently never re-planned the day.
      // A 401 means the request was rejected BEFORE doing anything, so re-issuing it
      // once the session lands is safe (no double-write). Only unauthorized errors
      // retry; every other failure still surfaces immediately. Budget matches the
      // reads (~6 tries / ~10s) to outlast a cold-reload bootstrap.
      retry: (failureCount, error) =>
        failureCount < 6 && (isUnauthenticatedError(error) || isRetryableError(error)),
      retryDelay: (attempt) => Math.min(300 * 2 ** attempt, 3000),
    },
  },
});

/**
 * The Study loop's attempt / reveal / continue mutations go through here. A study
 * miss writes an attempt-log row exactly like a practice miss, so the Mistakes
 * keys have to be in this set too — they are, via ./invalidation-keys.ts.
 */
const invalidateLearner = (qc: QueryClient) =>
  Promise.all(LEARNER_KEYS.map((k) => qc.invalidateQueries({ queryKey: [k] })));

export const useBootstrap = () =>
  useQuery({ queryKey: ['bootstrap'], queryFn: () => authority.bootstrap() });
/** Current goal (exam date / target / weekly minutes) so the Account editor can prefill (WS8). */
export const useGoal = () => useQuery({ queryKey: ['goal'], queryFn: () => authority.getGoal() });
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
/**
 * The evidence WARRANT per lesson — why a mastery claim is withheld — read
 * alongside `useMasteryLessons` and joined by `lessonId` in the Evidence Atlas.
 * Two calls rather than one payload: see `LessonWarrantViewSchema`.
 */
export const useLessonWarrants = () =>
  useQuery({ queryKey: ['lesson-warrants'], queryFn: () => authority.getLessonWarrants() });
/** CARS IRT readiness (gauge + sub-skill bars). */
export const useCarsReadiness = () =>
  useQuery({ queryKey: ['cars-readiness'], queryFn: () => authority.getCarsReadiness() });
export const useErrorLog = () =>
  useQuery({ queryKey: ['errors'], queryFn: () => authority.getErrorLog() });
/** Correct-but-shaky wins worth another rep (Mistakes tab, shaky-wins group). */
export const useShakyWins = () =>
  useQuery({ queryKey: ['shaky-wins'], queryFn: () => authority.getShakyWins() });
/** Recurring misses grouped at KC / cluster grain (Mistakes tab, patterns section). */
export const useMistakePatterns = () =>
  useQuery({ queryKey: ['error-patterns'], queryFn: () => authority.getMistakePatterns() });
/** CARS reasoning-pattern repairs from weak duels (WS7; Mistakes tab, CARS section). */
export const useCarsReasoningPatterns = () =>
  useQuery({
    queryKey: [CARS_REASONING_KEY],
    queryFn: () => authority.getCarsReasoningPatterns(),
  });
export const useSkills = () =>
  useQuery({ queryKey: ['skills'], queryFn: () => authority.getSkills() });
/**
 * Practice-TEST dashboard summary (the amber card on Practice). GATED by
 * {@link PRACTICE_TEST_ENABLED}: the scored-test runner has no deployed backend
 * (dev/preview only), so in production the whole feature is hidden and this query
 * is disabled — it never fires the `/v1/practice-test/summary` read the deployed
 * API does not route. In dev the query runs and returns the learner's real
 * completed sittings (or `null` until they take one). See ./capabilities.ts.
 */
export const usePracticeTestSummary = () =>
  useQuery({
    queryKey: ['practice-test-summary'],
    queryFn: () => authority.getPracticeTestSummary(),
    enabled: PRACTICE_TEST_ENABLED,
  });
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

/**
 * The periodic practice TEST is served by the fixed-form engine over the same
 * learner-safe bank, a whole section-block at a time, through the dedicated
 * {@link practiceTestClient} (one-use block tokens, never an answer key). Starting
 * consults the §6 cadence at the serve boundary, so a `notDue` view is a normal
 * result the runner renders — not an error.
 */
export const usePracticeTestNext = () =>
  useQuery({ queryKey: ['practice-test'], queryFn: () => practiceTestClient.start() });

export function useSubmitPracticeTestBlock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: {
      questionIds: readonly string[];
      answers: Readonly<Record<string, string>>;
      elapsedMs?: Readonly<Record<string, number>>;
    }) => practiceTestClient.submitBlock(v.questionIds, v.answers, v.elapsedMs),
    onSuccess: async (next: PracticeTestBlockView) => {
      qc.setQueryData(['practice-test'], next);
      // A completed sitting moves server state (a scored sitting + queued repairs
      // + the re-opened review gate), so the dashboard summary, the plan, and the
      // Mistakes tab all need refreshing once the last block commits.
      if (next.done) {
        // The deployed backend does not self-persist the scored result (that
        // write is CSRF-gated), so persist it here — a state-changing command the
        // server re-derives from the durable session and records idempotently by
        // sitting id. The dev/preview runner already persisted it (recorder) and
        // reports `resultPersisted`, so we skip the redundant call there.
        if (!next.resultPersisted) {
          const sessionToken = practiceTestClient.getSessionToken();
          if (sessionToken !== null) {
            try {
              await authority.persistPracticeTestResult(sessionToken);
            } catch (error) {
              // Best-effort: the learner already saw the score; the summary just
              // won't refresh until a later retry. Never fail the block commit.
              console.error('Failed to persist practice-test result:', error);
            }
          }
        }
        void Promise.all(
          [...TODAYS_PATH_INVALIDATE, 'practice-test-summary', 'errors', 'error-patterns'].map(
            (k) => qc.invalidateQueries({ queryKey: [k] }),
          ),
        );
      }
    },
  });
}

/** Mark the just-completed test reviewed (releases the §6 gate); refresh the summary + plan. */
export function useMarkPracticeTestReviewed() {
  const qc = useQueryClient();
  return useMutation({
    // Review is a projection write (releases the block-until-reviewed gate), so it
    // goes through the authority command, not the bare runner client.
    mutationFn: () => authority.recordPracticeTestReviewed(),
    onSuccess: () =>
      Promise.all(
        [...TODAYS_PATH_INVALIDATE, 'practice-test-summary'].map((k) =>
          qc.invalidateQueries({ queryKey: [k] }),
        ),
      ),
  });
}

export function useConfirmPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (goal: GoalInput) => authority.confirmPlan(goal),
    // Completing onboarding flips `bootstrap.onboardingComplete`, which the app-access
    // gate reads — so this is one of the few places that MUST refetch bootstrap now that
    // it is no longer in LEARNER_KEYS (which every gameplay write shares).
    onSuccess: () =>
      Promise.all([invalidateLearner(qc), qc.invalidateQueries({ queryKey: ['bootstrap'] })]),
  });
}

export function useSubmitAttempt() {
  const qc = useQueryClient();
  return useMutation({
    // The Study UI captures diagnose-before-reveal timing (WS0) and passes it
    // here; the choice stays the primary argument so the call site reads plainly.
    mutationFn: (vars: { choiceId: string | null; timing?: AttemptTiming }) =>
      authority.submitAttempt(vars.choiceId, vars.timing),
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

// Normalized-engine catalog hooks (L2/L3 and any future template lesson). Each is
// slug-scoped so one player component serves the entire non-L1 catalog; L1 keeps its
// four bespoke hooks above (per-grammar dispatch).

export function useNormalizedLessonStatus(slug: string) {
  return useQuery({
    queryKey: ['normalized-lesson-status', slug],
    queryFn: () => authority.getNormalizedLessonStatus(slug),
  });
}

export function useStartNormalizedLesson(slug: string, lessonId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => authority.startNormalizedLesson(slug, lessonId),
    onSuccess: () => {
      void invalidateLearner(qc);
    },
  });
}

export function useNormalizedLessonRun(slug: string, enabled = true) {
  return useQuery({
    queryKey: ['normalized-lesson-run', slug],
    queryFn: () => authority.getNormalizedLessonRun(slug),
    // The run only exists after a start; the player enables this once status (or a
    // fresh start) says the lesson is under way, so we never fetch a run that isn't there.
    enabled: enabled && slug !== '',
  });
}

export function useSubmitNormalizedLessonAction(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (action: NormalizedLessonAction) =>
      authority.submitNormalizedLessonAction(slug, action),
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
    // A reset can move onboarding/auth-relevant state, so refetch bootstrap explicitly
    // (it is intentionally no longer in LEARNER_KEYS).
    onSuccess: () =>
      Promise.all([invalidateLearner(qc), qc.invalidateQueries({ queryKey: ['bootstrap'] })]),
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
    mutationFn: (outcome?: CarsDuelOutcomeInput) => authority.recordCarsDuel(outcome),
    onSuccess: () => invalidateLearner(qc),
  });
}
