import type { Principal } from '@mcat/authority-kernel';

import { hashOpaqueToken, type GuestSessionService } from '../session';

/**
 * Test double for the session store, for suites that exercise HTTP routes rather
 * than the session store itself.
 *
 * Every learner route now demands `principal.kind === 'linked'`, so a test that
 * builds its own guest-shaped fake gets a uniform 401 that looks like a routing
 * bug. Sharing one helper keeps that requirement in a single place.
 */
export interface LinkedSessionDouble {
  readonly sessions: GuestSessionService;
  readonly principal: Principal;
  bootstrapCalls(): number;
  resolveCalls(): number;
  signInSubjects(): readonly string[];
  revokedTokens(): readonly string[];
}

export interface LinkedSessionOptions {
  readonly learnerId: string;
  readonly sessionId: string;
  /** The token that `resolve` accepts. Any other token resolves to null. */
  readonly sessionToken: string;
  /** The token `bootstrap` hands back after rotation. Defaults to `sessionToken`. */
  readonly rotatedSessionToken?: string;
  readonly csrfToken: string;
  readonly maxAgeSeconds?: number;
}

export function createLinkedSessionDouble(options: LinkedSessionOptions): LinkedSessionDouble {
  const principal: Principal = {
    kind: 'linked',
    learnerId: options.learnerId,
    sessionId: options.sessionId,
  };
  const rotated = options.rotatedSessionToken ?? options.sessionToken;
  const maxAgeSeconds = options.maxAgeSeconds ?? 3600;
  const signInSubjects: string[] = [];
  const revokedTokens: string[] = [];
  let bootstrapCalls = 0;
  let resolveCalls = 0;
  let revoked = false;

  const sessions: GuestSessionService = {
    bootstrap: async () => {
      bootstrapCalls += 1;
      return { principal, sessionToken: rotated, csrfToken: options.csrfToken, maxAgeSeconds };
    },
    resolve: async (token) => {
      resolveCalls += 1;
      return token === options.sessionToken && !revoked
        ? { principal, csrfTokenHash: hashOpaqueToken(options.csrfToken) }
        : null;
    },
    signIn: async (_provider, providerSubject) => {
      signInSubjects.push(providerSubject);
      revoked = false;
      return { principal, sessionToken: rotated, csrfToken: options.csrfToken, maxAgeSeconds };
    },
    revoke: async (token) => {
      revokedTokens.push(token);
      if (token === options.sessionToken) revoked = true;
    },
  };

  return {
    sessions,
    principal,
    bootstrapCalls: () => bootstrapCalls,
    resolveCalls: () => resolveCalls,
    signInSubjects: () => signInSubjects,
    revokedTokens: () => revokedTokens,
  };
}
