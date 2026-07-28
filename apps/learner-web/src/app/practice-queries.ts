import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PracticeAttemptCommand } from '@mcat/contracts';
import { authority } from './authority';
import { PRACTICE_INVALIDATE_KEYS } from './invalidation-keys';

/**
 * React Query hooks for adaptive Practice. The queue is fetched fresh when a
 * session starts (the server picks unseen items each time), and each answer is
 * scored server-authoritatively; a first correct unassisted attempt moves P(L)
 * and writes (or clears) a mistake, so mastery/progress views AND the Mistakes
 * tab's own keys are invalidated after a scored attempt — see
 * ./invalidation-keys.ts.
 */

/** Fetch a queue of `x` fresh practice items. Disabled until `enabled` is true. */
export function usePracticeQueue(x: number, focus: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['practice-queue', x, focus ?? null],
    queryFn: () => authority.getPracticeQueue(x, focus),
    enabled,
    // Each start should pull a fresh set; never reuse a stale queue.
    staleTime: 0,
    gcTime: 0,
  });
}

export function useSubmitPracticeAttempt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (command: PracticeAttemptCommand) => authority.submitPracticeAttempt(command),
    onSuccess: (_result, command) => {
      // Only a scored first attempt changes mastery; skip churn on retries.
      if (command.firstAttempt) {
        void Promise.all(
          PRACTICE_INVALIDATE_KEYS.map((k) => qc.invalidateQueries({ queryKey: [k] })),
        );
      }
    },
  });
}
