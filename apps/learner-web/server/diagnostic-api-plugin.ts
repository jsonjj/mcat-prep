import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';

/**
 * Dev-only diagnostic API. The request handlers (and everything they pull in,
 * including `@mcat/content` and the protected answer key) are loaded lazily
 * through Vite's `ssrLoadModule` so they run only inside the Node dev server and
 * never enter the browser bundle — and so config evaluation / `vite build` never
 * resolves that server-only graph. This is the future backend seam: swap these
 * middlewares for API Gateway routes and the client is unchanged.
 *
 * Production/preview serving is intentionally out of scope for this pass (the
 * diagnostic is delivered by an API Gateway route there); see the build report.
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
      server.middlewares.use('/api/diagnostic/next', (request, response) => {
        mod.handleNextRequest(request, response);
      });
      server.middlewares.use('/api/diagnostic/block', (request, response) => {
        mod.handleBlockRequest(request, response);
      });
    },
  };
}
