import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
import react from '@vitejs/plugin-react';
import { aiApiPlugin } from './server/ai-api-plugin';
import { authorityApiPlugin } from './server/authority-api-plugin';
import { diagnosticApiPlugin } from './server/diagnostic-api-plugin';
import { passageApiPlugin } from './server/passage-api-plugin';
import { practiceTestApiPlugin } from './server/practice-test-api-plugin';

/**
 * Dev-only AI proxy: `aiApiPlugin` (see ./server/ai-api-plugin.ts). It keeps the
 * provider key server-side and delegates to the SAME `@mcat/ai-gateway/server`
 * core the production route uses, so dev and prod cannot drift. Mounts
 * `/v1/ai/rewrite` (Explain another way) and `/api/ai/chat` (CARS Duel).
 */

/** `apps/learner-web` → repo root. */
const repoRoot = fileURLToPath(new URL('../../', import.meta.url));

const DEFAULT_LEARNER_WEB_ORIGIN = 'https://localhost:5173';
const DEFAULT_LOCAL_AUTHORITY_TARGET = 'http://127.0.0.1:8790';

export default defineConfig(({ mode }) => {
  // The repo-root `.env.local` configures the local stack as a whole — the API
  // process and this proxy have to agree on the origin-verification secret, and
  // one file is the only way that stays true across restarts. App-level values
  // still win, so `apps/learner-web/.env.local` remains where browser-facing
  // `VITE_*` settings belong.
  const env = { ...loadEnv(mode, repoRoot, ''), ...loadEnv(mode, process.cwd(), '') };
  // `/v1` has three possible dev owners, and only one may be mounted at a time:
  //
  //   real   — set VITE_AUTHORITY_LOCAL to proxy to a local run of the DEPLOYED
  //            learner API (services/local-learner-api) over a real Postgres.
  //            This mode serves the app over HTTPS because that API only accepts
  //            HTTPS origins and issues `__Host-`/`Secure` cookies — the same
  //            rules as production, satisfied rather than relaxed. The proxy also
  //            supplies the `x-mcat-origin-verify` header CloudFront adds in
  //            front of the deployed API.
  //   remote — set VITE_AUTHORITY_PROXY_TARGET to proxy to the deployed authority
  //            server-side, so the browser makes SAME-ORIGIN requests (no browser
  //            CORS). The backend only trusts the deployed origin, so we present
  //            that as the outgoing Origin/Referer.
  //   offline— otherwise the in-process dev authority serves `/v1`, which keeps the
  //            app runnable offline with no deployed backend and no database.
  //
  // Either way this affects the Vite dev server only; the production build never
  // uses `server`/`proxy`.
  const authorityProxyTarget = env.VITE_AUTHORITY_PROXY_TARGET;
  const localAuthority = env.VITE_AUTHORITY_LOCAL;
  const shared = {
    preview: { port: 4173 },
    // three.js is loaded only in the lazy BrainScene chunk, so a larger chunk here is expected.
    build: { outDir: 'dist', sourcemap: false, target: 'es2022', chunkSizeWarningLimit: 900 },
    // The .apkg importer is code-split (keeps sql.js/jszip out of the initial bundle) and is
    // only reached via a dynamic import(). Vite's dev scanner therefore never sees these CJS
    // deps up front, so the first import would trigger an on-demand re-optimize + page reload
    // that makes the in-flight dynamic import reject ("Failed to fetch dynamically imported
    // module"). Pre-bundling them here makes that first dynamic import resolve cleanly.
    optimizeDeps: { include: ['sql.js', 'jszip', 'dompurify', 'idb'] },
  };

  if (localAuthority) {
    const originVerificationSecret = env.ORIGIN_VERIFICATION_SECRET;
    if (!originVerificationSecret) {
      throw new Error(
        'VITE_AUTHORITY_LOCAL is set but ORIGIN_VERIFICATION_SECRET is not. `pnpm dev` writes ' +
          'one to .env.local before it starts anything; run that, or ' +
          '`pnpm --filter @mcat/local-learner-api run ensure-env` once. See ' +
          'docs/runbooks/local-real-stack.md.',
      );
    }
    // Without a project the client falls back to the offline auth stand-in, which
    // posts to `/v1/dev-auth/*` — routes only the in-process authority serves, and
    // it is not the one answering here. Failing now beats a 404 on the sign-in
    // form that reads like the API is broken.
    if (!env.VITE_SUPABASE_URL || !env.VITE_SUPABASE_ANON_KEY) {
      throw new Error(
        'VITE_AUTHORITY_LOCAL is set but VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are not. ' +
          'The real stack authenticates against a real project. See ' +
          'docs/runbooks/local-real-stack.md, or use `pnpm dev:offline`.',
      );
    }
    const learnerWebOrigin = env.LEARNER_WEB_ORIGIN || DEFAULT_LEARNER_WEB_ORIGIN;
    return {
      // No `authorityApiPlugin` here: the local learner API owns `/v1`, and two
      // owners would silently diverge. `practiceTestApiPlugin` stays off for the
      // same reason it does in remote mode — it closes its loop against the
      // in-process authority, which is not the one answering.
      plugins: [react(), basicSsl(), aiApiPlugin(env), diagnosticApiPlugin(), passageApiPlugin()],
      server: {
        port: 5173,
        // `basicSsl` fills in a self-signed certificate here. The browser warns
        // once; accepting it is what makes the origin genuinely `https:`, so the
        // API's HTTPS-only origin check and `Secure` cookies work untouched.
        https: {},
        proxy: {
          '/v1': {
            target: env.VITE_AUTHORITY_LOCAL_TARGET || DEFAULT_LOCAL_AUTHORITY_TARGET,
            changeOrigin: false,
            configure: (proxy) => {
              proxy.on('proxyReq', (proxyReq) => {
                // CloudFront adds this in front of the deployed API so nothing can
                // reach the origin directly. The API verifies it on every route,
                // so the local proxy has to stand in for that edge.
                proxyReq.setHeader('x-mcat-origin-verify', originVerificationSecret);
                proxyReq.setHeader('origin', learnerWebOrigin);
                proxyReq.setHeader('referer', `${learnerWebOrigin}/`);
              });
            },
          },
        },
      },
      ...shared,
    };
  }

  if (authorityProxyTarget) {
    return {
      plugins: [react(), aiApiPlugin(env), diagnosticApiPlugin(), passageApiPlugin()],
      server: {
        port: 5173,
        proxy: {
          '/v1': {
            target: authorityProxyTarget,
            changeOrigin: true,
            secure: true,
            configure: (proxy) => {
              proxy.on('proxyReq', (proxyReq) => {
                proxyReq.setHeader('origin', authorityProxyTarget);
                proxyReq.setHeader('referer', `${authorityProxyTarget}/`);
              });
            },
          },
        },
      },
      ...shared,
    };
  }

  return {
    // Offline mode owns `/v1` in-process, so the practice-test API can close its
    // completion→state loop against that same authority (WS5). In the two proxy
    // modes above it is intentionally NOT mounted: the backend owns the test flow
    // there.
    plugins: [
      react(),
      aiApiPlugin(env),
      // Before the dev authority plugin's `/v1` mount so `/v1/diagnostic/*` and
      // `/v1/practice-test/{next,block}` are answered by the in-memory diagnostic
      // and practice-test runners (same packages as prod) rather than being
      // swallowed by the catch-all `/v1` authority handler — the same ordering the
      // AI plugin relies on for `/v1/ai/*`. The summary read + reviewed hook fall
      // through to the authority below.
      diagnosticApiPlugin(),
      practiceTestApiPlugin(),
      authorityApiPlugin(),
      passageApiPlugin(),
    ],
    server: { port: 5173 },
    ...shared,
  };
});
