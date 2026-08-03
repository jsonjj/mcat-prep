import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';

/**
 * Dev-only diagnostic API. The request handlers (and everything they pull in,
 * including `@mcat/diagnostic-runner`/`@mcat/content` and the protected answer
 * key) are loaded lazily through Vite's `ssrLoadModule` so they run only inside
 * the Node dev server and never enter the browser bundle — and so config
 * evaluation / `vite build` never resolves that server-only graph.
 *
 * These middlewares answer the SAME `/v1/diagnostic/*` block contract the
 * deployed learner-API serves in production, so the browser client is identical
 * in dev and prod. They are registered before the dev authority plugin's `/v1`
 * mount (and win over the `/v1` proxy in the real-stack/remote modes), exactly
 * like the AI plugin's `/v1/ai/*` routes, so the in-memory diagnostic answers
 * these paths locally while everything else `/v1/*` goes to the authority/proxy.
 */

type Handler = (request: IncomingMessage, response: ServerResponse) => void;

interface DiagnosticApiModule {
  handleNextRequest: Handler;
  handleBlockRequest: Handler;
}

export function diagnosticApiPlugin(): Plugin {
  return {
    name: 'learner-diagnostic-api',
    async configureServer(server) {
      const mod = (await server.ssrLoadModule(
        '/server/diagnostic-api.ts',
      )) as unknown as DiagnosticApiModule;
      server.middlewares.use('/v1/diagnostic/next', (request, response) => {
        mod.handleNextRequest(request, response);
      });
      server.middlewares.use('/v1/diagnostic/block', (request, response) => {
        mod.handleBlockRequest(request, response);
      });
    },
  };
}
