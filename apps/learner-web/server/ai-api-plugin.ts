import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import type { AiProxyConfig } from '@mcat/ai-gateway/server';

/**
 * Dev-only AI proxy plugin. The provider key stays server-side (read from an
 * untracked `.env` via Vite's `loadEnv`), never in the client bundle. Like the
 * authority/diagnostic plugins, the handler module is loaded lazily through
 * `ssrLoadModule`, so the Node-only route code (and its `@mcat/ai-gateway/server`
 * dependency) runs only inside the dev server.
 *
 * This mirrors the production seam: BOTH AI routes are served same-origin under
 * `/v1/ai/*`, which the deployed learner-API answers in prod (behind its session
 * auth + `x-mcat-origin-verify` + WAF) and this middleware answers locally — the
 * client is unchanged either way. Both are registered before the dev authority
 * plugin's `/v1` mount, so they win for those exact paths. Mounts
 * `/v1/ai/rewrite` (Explain another way) and `/v1/ai/chat` (CARS Duel opponent).
 */
interface AiRouteModule {
  handleAiChatRequest(
    req: IncomingMessage,
    res: ServerResponse,
    config: AiProxyConfig,
  ): Promise<void>;
  handleAiRewriteRequest(
    req: IncomingMessage,
    res: ServerResponse,
    config: AiProxyConfig,
  ): Promise<void>;
}

export function aiApiPlugin(env: Record<string, string>): Plugin {
  const config: AiProxyConfig = {
    apiKey: env.AI_API_KEY,
    baseUrl: env.AI_BASE_URL || undefined,
    model: env.AI_MODEL || undefined,
  };
  return {
    name: 'mcat-ai-proxy',
    async configureServer(server) {
      const mod = (await server.ssrLoadModule('/server/ai-route.ts')) as unknown as AiRouteModule;
      server.middlewares.use('/v1/ai/rewrite', (req, res) => {
        void mod.handleAiRewriteRequest(req, res, config);
      });
      server.middlewares.use('/v1/ai/chat', (req, res) => {
        void mod.handleAiChatRequest(req, res, config);
      });
    },
  };
}
