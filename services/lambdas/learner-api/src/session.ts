import { createHash, timingSafeEqual } from 'node:crypto';
import type { Principal } from '@mcat/authority-kernel';

export const SESSION_COOKIE = '__Host-mcat_session';
export const CSRF_COOKIE = '__Host-mcat_csrf';

export interface BootstrapGuestSession {
  readonly principal: Principal;
  readonly sessionToken: string;
  readonly csrfToken: string;
  readonly maxAgeSeconds: number;
}

export interface ResolvedGuestSession {
  readonly principal: Principal;
  readonly csrfTokenHash: string;
}

/** Implementations persist only hashes, enforce expiry/revocation, and rotate on bootstrap. */
export interface GuestSessionService {
  bootstrap(existingSessionToken: string | null): Promise<BootstrapGuestSession>;
  resolve(sessionToken: string): Promise<ResolvedGuestSession | null>;
  /**
   * Exchange a verified identity-provider subject for a session, creating the
   * learner on first sign-in. The caller must already have proven the subject.
   */
  signIn(provider: string, providerSubject: string): Promise<BootstrapGuestSession>;
  /** Invalidate one session so the cookie cannot be replayed after sign-out. */
  revoke(sessionToken: string): Promise<void>;
}

export function hashOpaqueToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

function safeHashEquals(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left, 'hex');
  const rightBytes = Buffer.from(right, 'hex');
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

export function verifyDoubleSubmitCsrf(
  headerToken: string | undefined,
  cookieToken: string | undefined,
  expectedHash: string,
): boolean {
  if (
    headerToken === undefined ||
    cookieToken === undefined ||
    headerToken.length > 256 ||
    cookieToken.length > 256
  ) {
    return false;
  }
  const headerHash = hashOpaqueToken(headerToken);
  const cookieHash = hashOpaqueToken(cookieToken);
  return safeHashEquals(headerHash, cookieHash) && safeHashEquals(headerHash, expectedHash);
}

/**
 * Double-submit check for the signed-out credential routes.
 *
 * There is no session yet, so there is no stored hash to compare against; the
 * guarantee is only that the caller could read the `__Host-` CSRF cookie, which a
 * cross-site page cannot do. That is exactly the property these routes need — they
 * authorize nothing, they only accept credentials.
 */
export function verifyStatelessDoubleSubmitCsrf(
  headerToken: string | undefined,
  cookieToken: string | undefined,
): boolean {
  if (
    headerToken === undefined ||
    cookieToken === undefined ||
    !/^[A-Za-z0-9_-]{32,256}$/.test(headerToken) ||
    !/^[A-Za-z0-9_-]{32,256}$/.test(cookieToken)
  ) {
    return false;
  }
  return safeHashEquals(hashOpaqueToken(headerToken), hashOpaqueToken(cookieToken));
}

export function parseCookies(
  eventCookies: readonly string[] | undefined,
  cookieHeader: string | undefined,
): Readonly<Record<string, string>> {
  const pairs = [...(eventCookies ?? []), ...(cookieHeader === undefined ? [] : [cookieHeader])]
    .flatMap((line) => line.split(';'))
    .map((part) => part.trim())
    .filter(Boolean);
  const result: Record<string, string> = {};
  const duplicates = new Set<string>();
  for (const pair of pairs) {
    const separator = pair.indexOf('=');
    if (separator <= 0) continue;
    const name = pair.slice(0, separator).trim();
    const value = pair.slice(separator + 1).trim();
    if (name in result) duplicates.add(name);
    else result[name] = value;
  }
  for (const duplicate of duplicates) delete result[duplicate];
  return result;
}

export function secureCookie(name: string, value: string, maxAgeSeconds: number): string {
  if (
    (name !== SESSION_COOKIE && name !== CSRF_COOKIE) ||
    !/^[A-Za-z0-9_-]{8,256}$/.test(value) ||
    !Number.isSafeInteger(maxAgeSeconds) ||
    maxAgeSeconds <= 0 ||
    maxAgeSeconds > 31 * 24 * 60 * 60
  ) {
    throw new Error('Invalid secure-cookie parameters.');
  }
  return `${name}=${value}; Path=/; Max-Age=${maxAgeSeconds}; HttpOnly; Secure; SameSite=Lax`;
}
