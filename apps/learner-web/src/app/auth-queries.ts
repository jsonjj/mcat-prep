import { useMutation, useQueryClient } from '@tanstack/react-query';
import { authClient, type SignUpOutcome } from './auth-client';
import { authority } from './authority';
import { queryClient } from './queries';

/**
 * Crossing an identity boundary invalidates every cached read, so both sign-in and
 * sign-out clear the whole cache rather than a key list — a stale answer from the
 * previous identity must never render for the next one.
 */
async function resetLearnerCache(qc: ReturnType<typeof useQueryClient>): Promise<void> {
  qc.clear();
  await qc.invalidateQueries();
}

export interface Credentials {
  readonly email: string;
  readonly password: string;
}

/**
 * Where the browser comes back to after an email link or the Google round trip.
 * Absolute because Supabase requires it, and it must also be listed under the
 * project's redirect allowlist or Supabase refuses the redirect.
 */
export const authCallbackUrl = (): string => `${window.location.origin}/auth/callback`;

export function useSignUp() {
  const qc = useQueryClient();
  return useMutation<SignUpOutcome, Error, Credentials>({
    mutationFn: async ({ email, password }) => {
      const outcome = await authClient.signUp(email, password);
      // A project with confirmation switched off signs the learner straight in, so
      // the token is spent immediately rather than asking them to sign in again.
      if (outcome.status === 'signed_in') await authority.exchangeSession(outcome.accessToken);
      return outcome;
    },
    onSuccess: async (outcome) => {
      if (outcome.status === 'signed_in') await resetLearnerCache(qc);
    },
  });
}

export function useSignIn() {
  const qc = useQueryClient();
  return useMutation<void, Error, Credentials>({
    mutationFn: async ({ email, password }) => {
      const accessToken = await authClient.signIn(email, password);
      await authority.exchangeSession(accessToken);
    },
    onSuccess: () => resetLearnerCache(qc),
  });
}

/** Navigates away on success, so there is no local state to settle afterwards. */
export function useGoogleSignIn() {
  return useMutation<void, Error, void>({
    mutationFn: () => authClient.signInWithGoogle(authCallbackUrl()),
  });
}

/**
 * Completes an email-link or OAuth return by trading the Supabase session for ours.
 * Resolves `false` when the URL carries no session, which is what a learner who
 * bookmarked or reloaded the callback looks like.
 */
export function useCompleteRedirect() {
  const qc = useQueryClient();
  return useMutation<boolean, Error, void>({
    mutationFn: async () => {
      const accessToken = await authClient.sessionFromRedirect();
      if (accessToken === null) return false;
      await authority.exchangeSession(accessToken);
      return true;
    },
    onSuccess: async (exchanged) => {
      if (exchanged) await resetLearnerCache(qc);
    },
  });
}

export function useRequestPasswordReset() {
  return useMutation<void, Error, string>({
    mutationFn: (email) => authClient.requestPasswordReset(email, authCallbackUrl()),
  });
}

export function useUpdatePassword() {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: async (password) => {
      const accessToken = await authClient.updatePassword(password);
      await authority.exchangeSession(accessToken);
    },
    onSuccess: () => resetLearnerCache(qc),
  });
}

export function useSignOut() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      // Ours first: it is the one that actually gates the learner's data, so if
      // only one of the two can succeed it must be that one.
      await authority.signOut();
      await authClient.signOut();
    },
    // Settled, not success: a sign-out that failed on the server still dropped the
    // local session, so leaving the cache populated would show a phantom account.
    onSettled: () => resetLearnerCache(qc),
  });
}

/**
 * Drop the cached bootstrap so the next render re-asks the authority who the caller
 * is. Used by the route guard when a call comes back `unauthorized` mid-session.
 */
export function invalidateAuthentication(): void {
  void queryClient.invalidateQueries({ queryKey: ['bootstrap'] });
}
