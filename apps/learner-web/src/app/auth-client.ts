import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Where credentials are checked.
 *
 * Two implementations sit behind this: Supabase in any real deployment, and an
 * in-memory dev stand-in when no Supabase project is configured. The stand-in
 * exists to keep the repo's "runs fully offline with no deployed backend"
 * property — the same reason the Vite dev authority exists — not to be a second
 * supported auth system. Anything it makes easy that Supabase makes hard is a
 * bug in the stand-in.
 *
 * Every method returns an access token or nothing. The token is handed straight
 * to `authority.exchangeSession` and then dropped; the app's own session is the
 * `HttpOnly` cookie the authority sets in response.
 */
export interface AuthClient {
  /** True once a project is configured, so the UI can hide what cannot work. */
  readonly supportsGoogle: boolean;
  /**
   * Resolves `signedIn` when the project has email confirmation switched off, and
   * `confirmationRequired` when a link has been sent instead.
   */
  signUp(email: string, password: string): Promise<SignUpOutcome>;
  signIn(email: string, password: string): Promise<string>;
  /** Navigates away; the browser returns to `/auth/callback`. */
  signInWithGoogle(redirectTo: string): Promise<void>;
  requestPasswordReset(email: string, redirectTo: string): Promise<void>;
  /** The token from an email link or OAuth return, or null if this is not one. */
  sessionFromRedirect(): Promise<string | null>;
  /** Only valid inside a recovery redirect, where the link authorises the change. */
  updatePassword(password: string): Promise<string>;
  signOut(): Promise<void>;
}

export type SignUpOutcome =
  | { readonly status: 'signed_in'; readonly accessToken: string }
  | { readonly status: 'confirmation_required' };

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/**
 * A Supabase error is already written for end users ("Invalid login credentials"),
 * and it is deliberately vague about whether an address is registered. Passing it
 * through keeps that property; rewriting it here risks narrowing it.
 */
function rethrow(error: { message: string } | null): void {
  if (error !== null) throw new Error(error.message);
}

class SupabaseAuthClient implements AuthClient {
  readonly supportsGoogle = true;
  readonly #client: SupabaseClient;

  constructor(url: string, anonKey: string) {
    this.#client = createClient(url, anonKey, {
      auth: {
        // The Supabase session is a means to our own cookie, not the thing we
        // keep. Persisting it would leave a second, script-readable credential in
        // localStorage for the whole of its lifetime, which is exactly what the
        // HttpOnly exchange is meant to avoid.
        persistSession: false,
        autoRefreshToken: false,
        // Email links and the OAuth return both come back with the session in the
        // URL fragment, and `sessionFromRedirect` is what reads it.
        detectSessionInUrl: true,
      },
    });
  }

  async signUp(email: string, password: string): Promise<SignUpOutcome> {
    const { data, error } = await this.#client.auth.signUp({ email, password });
    rethrow(error);
    // A session comes back only when the project has email confirmation off.
    const token = data.session?.access_token;
    return token === undefined
      ? { status: 'confirmation_required' }
      : { status: 'signed_in', accessToken: token };
  }

  async signIn(email: string, password: string): Promise<string> {
    const { data, error } = await this.#client.auth.signInWithPassword({ email, password });
    rethrow(error);
    const token = data.session?.access_token;
    if (token === undefined) throw new Error('Sign-in did not return a session.');
    return token;
  }

  async signInWithGoogle(redirectTo: string): Promise<void> {
    const { error } = await this.#client.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo },
    });
    rethrow(error);
  }

  async requestPasswordReset(email: string, redirectTo: string): Promise<void> {
    const { error } = await this.#client.auth.resetPasswordForEmail(email, { redirectTo });
    rethrow(error);
  }

  async sessionFromRedirect(): Promise<string | null> {
    const { data, error } = await this.#client.auth.getSession();
    rethrow(error);
    return data.session?.access_token ?? null;
  }

  async updatePassword(password: string): Promise<string> {
    const { data, error } = await this.#client.auth.updateUser({ password });
    rethrow(error);
    if (data.user === null) throw new Error('That reset link is no longer valid.');
    const { data: session } = await this.#client.auth.getSession();
    const token = session.session?.access_token;
    if (token === undefined) throw new Error('That reset link is no longer valid.');
    return token;
  }

  async signOut(): Promise<void> {
    await this.#client.auth.signOut();
  }
}

/**
 * The offline stand-in. It posts to `/v1/dev-auth/*`, which only the Vite dev
 * middleware serves — the deployed authority has no such routes, so a build that
 * somehow shipped this client would fail loudly rather than authenticate anyone.
 */
class DevAuthClient implements AuthClient {
  // Google needs a real OAuth provider, so the dev stand-in says so rather than
  // rendering a button that cannot work.
  readonly supportsGoogle = false;

  async #post(path: string, body: unknown): Promise<Record<string, unknown>> {
    const response = await fetch(`/v1/dev-auth/${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const payload = (await response.json()) as Record<string, unknown>;
    if (!response.ok) throw new Error(String(payload.message ?? 'That did not work.'));
    return payload;
  }

  async signUp(email: string, password: string): Promise<SignUpOutcome> {
    await this.#post('signup', { email, password });
    return { status: 'confirmation_required' };
  }

  async signIn(email: string, password: string): Promise<string> {
    const payload = await this.#post('signin', { email, password });
    return String(payload.accessToken);
  }

  signInWithGoogle(): Promise<void> {
    return Promise.reject(new Error('Google sign-in needs a configured Supabase project.'));
  }

  async requestPasswordReset(email: string): Promise<void> {
    await this.#post('reset-request', { email });
  }

  /**
   * Dev email links carry the token in the query string, because there is no mail
   * server to click through and the link is printed to the terminal instead.
   * Redeeming it also marks the account confirmed, so a later password sign-in
   * is not refused.
   */
  async sessionFromRedirect(): Promise<string | null> {
    const token = new URLSearchParams(window.location.search).get('dev_token');
    if (token === null) return null;
    const payload = await this.#post('confirm-link', { token });
    return String(payload.accessToken);
  }

  async updatePassword(password: string): Promise<string> {
    const token = new URLSearchParams(window.location.search).get('dev_token');
    const payload = await this.#post('reset-confirm', { token, password });
    return String(payload.accessToken);
  }

  signOut(): Promise<void> {
    return Promise.resolve();
  }
}

/** True when a real project is wired up, which the UI shows so dev is never mistaken for prod. */
export const usingRealAuth = Boolean(supabaseUrl && supabaseAnonKey);

/**
 * Dev only: the link the stand-in last "sent" to this address, so the confirm
 * screen can offer it rather than sending the developer to read the server's
 * console.
 *
 * Deliberately not part of `AuthClient` — a real project has a real inbox, and
 * putting this on the interface would oblige the Supabase client to answer a
 * question that only makes sense offline. Returns null on any failure, since a
 * missing convenience must not turn into a broken screen.
 */
export async function lastDevEmailLink(email: string): Promise<string | null> {
  if (usingRealAuth) return null;
  try {
    const response = await fetch(`/v1/dev-auth/last-link?email=${encodeURIComponent(email)}`);
    if (!response.ok) return null;
    const payload = (await response.json()) as { link?: { path?: string } | null };
    return payload.link?.path ?? null;
  } catch {
    return null;
  }
}

export const authClient: AuthClient =
  supabaseUrl !== undefined && supabaseAnonKey !== undefined
    ? new SupabaseAuthClient(supabaseUrl, supabaseAnonKey)
    : new DevAuthClient();
