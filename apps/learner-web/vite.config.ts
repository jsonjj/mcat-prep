import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { authorityApiPlugin } from './server/authority-api-plugin';
import { diagnosticApiPlugin } from './server/diagnostic-api-plugin';

/**
 * Dev-only AI proxy. The provider key stays server-side (read from an untracked
 * .env), never in the client bundle. This mirrors the future backend seam: swap
 * this middleware for an API Gateway route and the client is unchanged.
 * Defaults target any OpenAI-compatible chat-completions endpoint.
 */
function aiProxy(env: Record<string, string>): Plugin {
  const apiKey = env.AI_API_KEY;
  const baseUrl = env.AI_BASE_URL ?? 'https://api.openai.com/v1';
  const model = env.AI_MODEL ?? 'gpt-4o-mini';
  return {
    name: 'mcat-ai-proxy',
    configureServer(server) {
      server.middlewares.use('/api/ai/chat', (req, res) => {
        const json = (status: number, body: unknown) => {
          res.statusCode = status;
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify(body));
        };
        if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });
        if (!apiKey) return json(503, { error: 'ai_not_configured' });

        let raw = '';
        req.on('data', (c) => (raw += c));
        req.on('error', () => json(500, { error: 'read_failure' }));
        req.on('end', async () => {
          try {
            const body = JSON.parse(raw || '{}') as {
              messages?: unknown;
              maxOutputTokens?: number;
              temperature?: number;
            };
            const messages = Array.isArray(body.messages) ? body.messages.slice(-20) : [];
            const maxTokens = Math.min(Number(body.maxOutputTokens) || 320, 320);
            // Note: `temperature` intentionally omitted — some newer models (e.g. claude-sonnet-5)
            // reject it as deprecated. Models use their own default.

            const upstream = await fetch(`${baseUrl}/chat/completions`, {
              method: 'POST',
              headers: {
                'content-type': 'application/json',
                authorization: `Bearer ${apiKey}`,
                // TrueFoundry/promptlens gateways may require these (from the Playground snippet).
                'X-TFY-METADATA': '{}',
                'X-TFY-LOGGING-CONFIG': '{"enabled": true}',
              },
              body: JSON.stringify({ model, messages, max_tokens: maxTokens }),
            });
            if (!upstream.ok) {
              let detail = '';
              try {
                detail = (await upstream.text()).slice(0, 300);
              } catch {
                /* ignore unreadable body */
              }
              return json(502, { error: 'upstream_error', status: upstream.status, detail });
            }
            const data = (await upstream.json()) as {
              choices?: { message?: { content?: string } }[];
            };
            json(200, { text: data.choices?.[0]?.message?.content ?? '' });
          } catch {
            json(500, { error: 'proxy_failure' });
          }
        });
      });
    },
  };
}

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
      plugins: [react(), aiProxy(env), diagnosticApiPlugin()],
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
    plugins: [react(), aiProxy(env), authorityApiPlugin(), diagnosticApiPlugin()],
    server: { port: 5173 },
    ...shared,
  };
});
