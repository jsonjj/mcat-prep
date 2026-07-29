/**
 * The package surface is the in-process client ONLY.
 *
 * `./http-server` is deliberately not re-exported. It registers the local debug
 * route, and `apps/learner-web` depends on this package, so re-exporting it put
 * the route-registering module in a shipped app's import graph for no reason —
 * the server is started as a process (`pnpm --filter @mcat/local-authority run
 * dev`), never imported by a consumer. Its own tests import the module path
 * directly.
 */
export * from './in-process';
