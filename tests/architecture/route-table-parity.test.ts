import { describe, expect, it } from 'vitest';

import { HTTP_API } from '../../packages/contracts/src/http';
import { ROUTES } from '../../services/lambdas/learner-api/src/routes';

/**
 * The client's route table and the deployed Lambda's route table are written by
 * hand, in different files, and nothing used to compare them. They drifted: six
 * routes the client calls were never added to the Lambda, so features that worked
 * against the dev server returned 404 in the deployed environment and the gap went
 * unnoticed because no test looked.
 *
 * This is that test. A route added to `HTTP_API` without a matching entry in
 * `ROUTES` now fails here instead of in production.
 */

const signature = (route: { method: string; path: string }): string =>
  `${route.method} ${route.path}`;

/**
 * Routes the client calls that the deployed Lambda genuinely does not serve yet.
 *
 * This is a record of existing debt, not permission to add more. Each entry needs a
 * backing engine in the Lambda before it can be removed, and the test below fails
 * if an entry here is no longer missing — so closing a gap forces deleting its line
 * rather than leaving a stale exemption behind.
 */
const KNOWN_UNIMPLEMENTED: readonly string[] = [
  // Today's Path engine: served by the dev authority only.
  'GET /v1/plan/today/path',
  'POST /v1/plan/today/build',
  'POST /v1/plan/today/activity',
  // Daily-budget editor.
  'PUT /v1/profile/daily-budget',
  // Offline command sync.
  'POST /v1/sync',
  // Scored practice-test engine; the client treats a 404 as "no test taken".
  'GET /v1/practice-test/summary',
];

const deployedSignatures = new Set(ROUTES.map(signature));
const clientRoutes = Object.entries(HTTP_API) as readonly [
  string,
  { readonly method: string; readonly path: string },
][];

describe('learner route-table parity', () => {
  it('serves every client route except the recorded unimplemented ones', () => {
    const missing = clientRoutes
      .filter(([, route]) => !deployedSignatures.has(signature(route)))
      .map(([name, route]) => `${name} (${signature(route)})`)
      .filter((entry) => !KNOWN_UNIMPLEMENTED.some((known) => entry.endsWith(`(${known})`)));

    expect(missing).toEqual([]);
  });

  it('keeps the unimplemented list honest by failing once a gap is closed', () => {
    const stale = KNOWN_UNIMPLEMENTED.filter((entry) => deployedSignatures.has(entry));

    expect(stale).toEqual([]);
  });

  it('serves every credential route the client can call', () => {
    const credentialRoutes = clientRoutes
      .filter(([, route]) => route.path.startsWith('/v1/auth/'))
      .map(([, route]) => signature(route));

    expect(credentialRoutes.length).toBeGreaterThan(0);
    for (const route of credentialRoutes) {
      expect(deployedSignatures.has(route)).toBe(true);
    }
  });

  it('guards every credential route with the credential auth kind', () => {
    const credentialPaths = ROUTES.filter((route) => route.path.startsWith('/v1/auth/'));

    for (const route of credentialPaths) {
      // Sign-out is the one /v1/auth/* route that needs a real session, so it is
      // deliberately a session route rather than a credential one.
      const expected = route.path === '/v1/auth/signout' ? 'session' : 'credential';
      expect({ path: route.path, auth: route.auth }).toEqual({
        path: route.path,
        auth: expected,
      });
      expect(route.stateChanging).toBe(true);
    }
  });
});
