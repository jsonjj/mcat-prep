import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

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
            const temperature = typeof body.temperature === 'number' ? body.temperature : 0.7;

            const upstream = await fetch(`${baseUrl}/chat/completions`, {
              method: 'POST',
              headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
              body: JSON.stringify({ model, messages, max_tokens: maxTokens, temperature }),
            });
            if (!upstream.ok) return json(502, { error: 'upstream_error', status: upstream.status });
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
  return {
    plugins: [react(), aiProxy(env)],
    server: { port: 5173 },
    preview: { port: 4173 },
    // three.js is loaded only in the lazy BrainScene chunk, so a larger chunk here is expected.
    build: { outDir: 'dist', sourcemap: false, target: 'es2022', chunkSizeWarningLimit: 900 },
  };
});
