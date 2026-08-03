import { createLocalJWKSet, jwtVerify, type JSONWebKeySet } from 'jose';

import type { IdentityProvider, VerifyResult } from './identity-provider.js';

/**
 * Supabase signs user access tokens with an asymmetric key (ES256 by default
 * since October 2025) and publishes the *public* half at
 * `<project>/auth/v1/.well-known/jwks.json`.
 *
 * We pin that key set into configuration at deploy time rather than fetching it
 * at cold start. The Lambda has no egress — the VPC is isolated and there is no
 * NAT — so a runtime fetch would not merely be slow, it would fail. Pinning a
 * public key is safe; it is public by construction.
 *
 * The cost is that key rotation is a deploy, not a refresh. Supabase rotates in
 * stages (standby -> in use -> previously used), and tokens signed by a
 * previously-used key stay valid for their lifetime, so the window to ship a
 * config update is wide. It is still a manual step, and `docs/runbooks` records
 * it. Holding several keys at once is what makes the staged rotation survivable:
 * publish the standby key here *before* promoting it in Supabase and no token is
 * ever rejected.
 */
export interface SupabaseConfig {
  /** Project URL, e.g. `https://abcdefgh.supabase.co`, with no trailing slash. */
  readonly projectUrl: string;
  /** The pinned public key set. May hold several keys to span a rotation. */
  readonly jwks: JSONWebKeySet;
}

/**
 * Supabase stamps every end-user token with this audience. Service-role and
 * anon API keys carry a different one, so requiring it stops someone from
 * presenting the publishable key — which is shipped to every browser — as if it
 * were a signed-in learner.
 */
const USER_AUDIENCE = 'authenticated';

/**
 * An allowlist, not a filter. `jose` would otherwise accept whatever the token's
 * own header asks for, which is the classic algorithm-confusion bypass: a
 * forger flips `alg` to HS256 and signs with the public key as the HMAC secret.
 * Naming only the asymmetric algorithms Supabase actually uses makes that
 * unrepresentable.
 */
const PERMITTED_ALGORITHMS = ['ES256', 'RS256'];

/**
 * `{ projectUrl, jwks }` as published by the identity stack under the handoff
 * secret name. Validated rather than trusted, so a malformed or half-populated
 * secret fails at cold start instead of silently rejecting every sign-in.
 */
export function parseSupabaseConfig(secretString: string): SupabaseConfig {
  let value: unknown;
  try {
    value = JSON.parse(secretString);
  } catch {
    throw new Error('Supabase configuration secret has an invalid shape.');
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Supabase configuration secret has an invalid shape.');
  }
  const { projectUrl, jwks } = value as Record<string, unknown>;

  if (typeof projectUrl !== 'string' || !/^https:\/\/[\w.-]+\/*$/.test(projectUrl)) {
    throw new Error('Supabase configuration secret has an invalid shape.');
  }
  if (jwks === null || typeof jwks !== 'object' || Array.isArray(jwks)) {
    throw new Error('Supabase configuration secret has an invalid shape.');
  }
  const { keys } = jwks as Record<string, unknown>;
  if (!Array.isArray(keys)) {
    throw new Error('Supabase configuration secret has an invalid shape.');
  }
  // An *empty* key set is accepted, unlike a malformed one. That is the state a
  // freshly deployed stack is in before `pnpm supabase:sync-jwks` has run, and
  // throwing here would take down every route in the function — health checks and
  // learner reads included — over a credential problem. Verification rejects every
  // token instead, so the blast radius is sign-in alone.
  // A symmetric key here would mean the legacy shared secret leaked into a field
  // meant for public keys, and would re-open the confusion attack the algorithm
  // allowlist closes. Refuse at load rather than depend on that second defence.
  for (const key of keys) {
    if (key === null || typeof key !== 'object') {
      throw new Error('Supabase configuration secret has an invalid shape.');
    }
    if ((key as Record<string, unknown>).kty === 'oct') {
      throw new Error('Supabase configuration secret must not contain symmetric keys.');
    }
  }

  return {
    projectUrl: projectUrl.replace(/\/+$/, ''),
    jwks: { keys } as JSONWebKeySet,
  };
}

export class SupabaseIdentityProvider implements IdentityProvider {
  readonly #issuer: string;
  readonly #keys: ReturnType<typeof createLocalJWKSet>;

  constructor(config: SupabaseConfig) {
    this.#issuer = `${config.projectUrl}/auth/v1`;
    // Local, so resolving a `kid` never touches the network. An unknown `kid`
    // throws and lands in the `invalid` branch below.
    this.#keys = createLocalJWKSet(config.jwks);
  }

  async verify(accessToken: string): Promise<VerifyResult> {
    try {
      const { payload } = await jwtVerify(accessToken, this.#keys, {
        issuer: this.#issuer,
        audience: USER_AUDIENCE,
        algorithms: PERMITTED_ALGORITHMS,
      });

      // `jose` checks `exp` and `nbf` itself. `sub` it does not require, and a
      // token without one would sail through to become a session keyed on
      // `undefined` — shared by every such caller.
      const subject = payload.sub;
      if (typeof subject !== 'string' || subject.length === 0) {
        return { status: 'invalid' };
      }

      return { status: 'verified', identity: { subject } };
    } catch {
      // Signature, expiry, issuer, audience, algorithm, unknown key, and
      // malformed input all arrive here and are answered identically.
      return { status: 'invalid' };
    }
  }
}
