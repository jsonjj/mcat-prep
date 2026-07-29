import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { aiApiPlugin } from './server/ai-api-plugin';
import { authorityApiPlugin } from './server/authority-api-plugin';
import { diagnosticApiPlugin } from './server/diagnostic-api-plugin';

/**
 * Dev-only AI proxy: `aiApiPlugin` (see ./server/ai-api-plugin.ts). It keeps the
 * provider key server-side and delegates to the SAME `@mcat/ai-gateway/server`
 * core the production route uses, so dev and prod cannot drift. Mounts
 * `/api/ai/chat` (CARS Duel) and `/api/ai/rewrite` (Explain another way).
 */

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  // `/v1` has two possible dev owners, and only one may be mounted at a time:
  //
  //   remote — set VITE_AUTHORITY_PROXY_TARGET to proxy to the deployed authority
  //            server-side, so the browser makes SAME-ORIGIN requests (no browser
  //            CORS). The backend only trusts the deployed origin, so we present
  //            that as the outgoing Origin/Referer.
  //   local  — otherwise the in-process dev authority serves `/v1`, which keeps the
  //            app runnable offline with no deployed backend.
  //
  // Either way this affects the Vite dev server only; the production build never
  // uses `server`/`proxy`.
  const authorityProxyTarget = env.VITE_AUTHORITY_PROXY_TARGET;
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

  if (authorityProxyTarget) {
    return {
      plugins: [react(), aiApiPlugin(env), diagnosticApiPlugin()],
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
    plugins: [react(), aiApiPlugin(env), authorityApiPlugin(), diagnosticApiPlugin()],
    server: { port: 5173 },
    ...shared,
  };
});
