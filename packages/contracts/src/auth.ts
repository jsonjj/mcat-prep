import { z } from 'zod';

/**
 * Session-exchange contracts for `/v1/auth/*`.
 *
 * These are the only routes a signed-out visitor may call.
 *
 * Credentials are not handled here at all. Supabase Auth owns sign-up, email
 * confirmation, password reset, and Google OAuth, and the browser talks to it
 * directly. What reaches our API is only the resulting access token, which we
 * verify and trade for the same opaque `__Host-` session cookie guest sessions
 * always used. That keeps the Supabase token out of long-lived browser storage
 * and leaves every downstream route reading one kind of session.
 */

/**
 * A compact JWS: three base64url segments. Shape is checked here purely to
 * reject obvious junk cheaply — authority comes from the signature check on the
 * server, never from this pattern. The cap bounds the request body; real
 * Supabase access tokens are far smaller.
 */
export const AccessTokenSchema = z
  .string()
  .min(16)
  .max(4096)
  .regex(/^[\w-]+\.[\w-]+\.[\w-]+$/, { message: 'Malformed access token.' });

export const SessionExchangeRequestSchema = z.object({ accessToken: AccessTokenSchema }).strict();
export type SessionExchangeRequest = z.infer<typeof SessionExchangeRequestSchema>;

/**
 * Carries no learner data and no tokens. The session rides in the `__Host-`
 * cookie pair the response sets, exactly as it did for guest sessions; the
 * CSRF token is returned in the body because the cookie holding it is
 * deliberately readable only by the browser's same-origin policy, not by script.
 */
export const SessionExchangeResponseSchema = z
  .object({ status: z.literal('signed_in'), csrfToken: z.string().min(32) })
  .strict();
export type SessionExchangeResponse = z.infer<typeof SessionExchangeResponseSchema>;

export const SignOutResponseSchema = z.object({ status: z.literal('signed_out') }).strict();
export type SignOutResponse = z.infer<typeof SignOutResponseSchema>;
