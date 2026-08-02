/**
 * The credential-store seam.
 *
 * The learner API owns sessions. Credentials belong to Supabase Auth, which the
 * browser talks to directly, so this port answers exactly one question: **is this
 * bearer token genuinely one Supabase issued, and to whom?**
 *
 * The trust model is the important part. The token reaches us from the browser —
 * an untrusted party — so its signature is load-bearing and must be checked
 * offline against a pinned key set. This is the opposite of the previous Cognito
 * arrangement, where the token came back over TLS from our own API call and the
 * signature was redundant. Anything that weakens verification here (accepting
 * `alg: none`, accepting HS256 against a public key, skipping `iss`/`aud`) is a
 * full authentication bypass, not a degradation.
 *
 * The handler depends on this file and never on a JWT library or a network
 * client, so handler tests can substitute a fake.
 */

/** A credential holder, identified the way the identity provider identifies them. */
export interface VerifiedIdentity {
  /**
   * The provider's immutable subject id. This, never the email address, is what
   * `linked_identities` keys on, so changing or re-registering an address can
   * never hand someone another learner's history.
   */
  readonly subject: string;
}

/**
 * Deliberately two-valued. Every rejection reason — bad signature, unknown key,
 * expired, wrong issuer, wrong audience, malformed — collapses to `invalid`, so
 * no route can accidentally tell an attacker which part of their forgery failed.
 */
export type VerifyResult =
  | { readonly status: 'verified'; readonly identity: VerifiedIdentity }
  | { readonly status: 'invalid' };

export interface IdentityProvider {
  /** Verify a Supabase access token and return its subject. Never throws for a bad token. */
  verify(accessToken: string): Promise<VerifyResult>;
}
