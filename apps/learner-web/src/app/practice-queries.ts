import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PracticeAttemptCommand } from '@mcat/contracts';
import { authority } from './authority';
import { REPAIR_FRESH_SET_SIZE } from '../screens/mistakes/repair-flow';
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

/**
 * The guided repair queue for the Review-Mistakes runner: the engine-sized subset
 * of `count` prioritized, servable mistakes. Fetched fresh at the start of a run.
 */
export function useRepairQueue(count: number) {
  return useQuery({
    queryKey: ['repair-queue', count],
    queryFn: () => authority.getRepairQueue(count),
    staleTime: 0,
    gcTime: 0,
  });
}

/**
 * The mandatory fresh questions for one repair mistake, served from the ordinary
 * practice queue at the mistake's focus. Keyed by the mistake's `index` (not just
 * the focus) so consecutive mistakes sharing a focus each pull their OWN set rather
 * than reading a cached one; `enabled` gates it to the "fresh" phase.
 */
export function useRepairFresh(index: number, focus: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['repair-fresh', index, focus ?? null],
    queryFn: () => authority.getPracticeQueue(REPAIR_FRESH_SET_SIZE, focus),
    enabled,
    staleTime: 0,
    gcTime: 0,
  });
}

export function useSubmitPracticeAttempt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (command: PracticeAttemptCommand) => authority.submitPracticeAttempt(command),
    onSuccess: () => {
      // Whether this was the scored first attempt is the server's derivation
      // (from its own exposure records) and never reaches the client — the
      // command carries no `firstAttempt` claim and the result carries no
      // signal either. Invalidating on every response is the honest gate: a
      // redundant refetch on a retry is a wasted round trip, not a staleness
      // bug, and reconstructing a client-side guess would just be the removed
      // heuristic under a new name.
      void Promise.all(
        PRACTICE_INVALIDATE_KEYS.map((k) => qc.invalidateQueries({ queryKey: [k] })),
      );
    },
  });
}
