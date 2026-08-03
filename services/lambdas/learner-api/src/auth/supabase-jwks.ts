import type { JSONWebKeySet } from 'jose';

/**
 * Reading a Supabase project's PUBLIC signing keys.
 *
 * Two callers, one deliberate difference. `pnpm supabase:sync-jwks` runs this at
 * deploy time and pins the result into Secrets Manager, because the Lambda's
 * subnets have no egress. A local run of the same API (see
 * `services/local-learner-api`) has egress, so it fetches at startup instead.
 * The fetch and — more importantly — the refusal to accept anything but public
 * key material are shared so the two paths cannot drift.
 */

/** Supabase project refs are exactly twenty lowercase letters. */
const PROJECT_REF = /^[a-z]{20}$/;

export function supabaseProjectUrl(projectRef: string): string {
  if (!PROJECT_REF.test(projectRef)) {
    throw new Error(`"${projectRef}" is not a Supabase project ref (20 lowercase letters).`);
  }
  return `https://${projectRef}.supabase.co`;
}

export function supabaseJwksUrl(projectUrl: string): string {
  return `${projectUrl.replace(/\/+$/, '')}/auth/v1/.well-known/jwks.json`;
}

/**
 * The project's published key set, or a thrown error explaining which
 * precondition failed. An empty key set is a failure here — unlike in
 * `parseSupabaseConfig`, where it is the legitimate pre-sync state — because a
 * project that publishes no keys is still on the legacy shared JWT secret and
 * nothing signed by it could ever verify.
 */
export async function fetchSupabaseJwks(projectUrl: string): Promise<JSONWebKeySet> {
  const response = await fetch(supabaseJwksUrl(projectUrl));
  if (!response.ok) {
    throw new Error(`Supabase returned ${response.status} ${response.statusText}.`);
  }
  const payload = (await response.json()) as { keys?: unknown };
  const keys = payload.keys;
  if (!Array.isArray(keys) || keys.length === 0) {
    throw new Error(
      'That project published no signing keys. Is it still on the legacy JWT secret? ' +
        'Migrate it at Dashboard -> Settings -> JWT Keys first.',
    );
  }
  // A private or symmetric key here would mean something other than the public
  // JWKS was fetched. Refuse rather than let secret material be handled, logged,
  // and reviewed as if it were public.
  for (const key of keys as readonly Record<string, unknown>[]) {
    if (key === null || typeof key !== 'object' || key.kty === 'oct' || key.d !== undefined) {
      throw new Error('Refusing that key set: it contains non-public key material.');
    }
  }
  return { keys } as JSONWebKeySet;
}
