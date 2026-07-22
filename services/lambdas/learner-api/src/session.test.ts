import { describe, expect, it } from 'vitest';

import {
  CSRF_COOKIE,
  SESSION_COOKIE,
  hashOpaqueToken,
  parseCookies,
  secureCookie,
  verifyDoubleSubmitCsrf,
} from './session';

describe('learner session boundary', () => {
  it('requires the header, cookie, and session-bound CSRF hash to agree', () => {
    const token = 'c'.repeat(43);
    const expected = hashOpaqueToken(token);

    expect(verifyDoubleSubmitCsrf(token, token, expected)).toBe(true);
    expect(verifyDoubleSubmitCsrf(token, 'x'.repeat(43), expected)).toBe(false);
    expect(verifyDoubleSubmitCsrf(undefined, token, expected)).toBe(false);
  });

  it('drops ambiguous duplicate security cookies', () => {
    const cookies = parseCookies(
      [`${SESSION_COOKIE}=first`, `${SESSION_COOKIE}=second`, `${CSRF_COOKIE}=csrf`],
      undefined,
    );

    expect(cookies[SESSION_COOKIE]).toBeUndefined();
    expect(cookies[CSRF_COOKIE]).toBe('csrf');
  });

  it('rejects response-cookie injection and invalid lifetimes', () => {
    expect(() => secureCookie(SESSION_COOKIE, 'safe\r\nSet-Cookie: stolen=yes', 3600)).toThrow();
    expect(() => secureCookie(SESSION_COOKIE, 'safe-token', 0)).toThrow();
  });
});
