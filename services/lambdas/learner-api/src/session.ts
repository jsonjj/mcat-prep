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
