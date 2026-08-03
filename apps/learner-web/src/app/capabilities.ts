/**
 * Client capability flags.
 *
 * ── Periodic scored practice TEST ──────────────────────────────────────────
 * Gated OFF in production, ON in dev.
 *
 * The scored-test RUNNER the app drives (`practiceTestClient` →
 * `POST /api/practice-test/{next,block,review}`) is served ONLY by the
 * dev/preview Vite plugin (`server/practice-test-api-plugin.ts`). The deployed
 * learner PWA is a static CloudFront/S3 SPA whose ONLY backend behaviour routes
 * `/v1/*` to the learner-API Lambda; every `/api/*` path falls through the SPA
 * rewrite to `index.html`, so the runner has no production backend. The
 * dashboard summary (`/v1/practice-test/summary`) is likewise not routed by the
 * deployed API. Rather than leave the Practice-test card in a permanent
 * empty/"coming soon" state, the whole feature is hidden in prod until the
 * runner is wired into the deployed backend.
 *
 * The PLAN side is gated SERVER-side as well: the deployed learner-API reserves
 * no `practice_test` activity (see services/lambdas/learner-api/src/lambda.ts →
 * `practiceTestEnabled`), which is what keeps the strict guided plan from
 * deadlocking on a slot whose runner cannot serve. This client flag therefore
 * only governs presentation (the Practice-test card + route) and a defensive
 * skip of any `practice_test` slot left in a plan built before the gate.
 *
 * Default: `import.meta.env.DEV` — on under `vite dev` / `dev:lesson`, off in a
 * production build. Override explicitly with
 * `VITE_PRACTICE_TEST_ENABLED=(true|false)`.
 *
 * See docs/practice-test-prod.md for exactly what remains to fully enable it.
 */
const practiceTestOverride = import.meta.env.VITE_PRACTICE_TEST_ENABLED;
export const PRACTICE_TEST_ENABLED: boolean =
  practiceTestOverride === 'true'
    ? true
    : practiceTestOverride === 'false'
      ? false
      : Boolean(import.meta.env.DEV);

/**
 * ── Onboarding placement DIAGNOSTIC ─────────────────────────────────────────
 * Gated OFF in production, ON in dev — same shape and rationale as the
 * practice-test flag above.
 *
 * The onboarding placement quiz drives the multistage diagnostic engine through
 * `diagnosticClient` → `POST /api/diagnostic/{block,…}` (see
 * ./diagnostic-client.ts, `BASE = '/api/diagnostic'`), which is served ONLY by
 * the dev/preview Vite plugin (`server/diagnostic-api-plugin.ts`). The deployed
 * learner PWA is a static CloudFront/S3 SPA whose ONLY backend behaviour routes
 * `/v1/*` to the learner-API Lambda; there is no deployed `/v1/diagnostic/*`
 * route, so every `/api/diagnostic/*` path falls through the SPA rewrite to
 * `index.html` and a brand-new learner dead-ends mid-onboarding. Until the
 * diagnostic is wired into the deployed backend, the placement path is hidden in
 * prod: Welcome offers no "Take the placement" CTA and `/onboarding/diagnostic`
 * redirects to plan setup (see ../screens/OnboardingStart.tsx and ./router.tsx).
 *
 * This flag governs PRESENTATION + routing only; dev behaviour (the working
 * quiz) is unchanged.
 *
 * Default: `import.meta.env.DEV` — on under `vite dev` / `dev:offline`, off in a
 * production build. Override explicitly with
 * `VITE_DIAGNOSTIC_ENABLED=(true|false)`.
 */
const diagnosticOverride = import.meta.env.VITE_DIAGNOSTIC_ENABLED;
export const DIAGNOSTIC_ENABLED: boolean =
  diagnosticOverride === 'true'
    ? true
    : diagnosticOverride === 'false'
      ? false
      : Boolean(import.meta.env.DEV);
