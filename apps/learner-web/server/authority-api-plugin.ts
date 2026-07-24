import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';

/**
 * Dev-only learner authority API. Like the diagnostic plugin, the handler (and
 * everything it pulls in — `@mcat/authority-core`, `@mcat/content`, answer keys)
 * is loaded lazily through `ssrLoadModule`, so it runs only inside the Node dev
 * server and never enters the browser bundle. This is the backend seam: in
 * production these `/v1` routes are served by the deployed learner API instead.
 */

type Handler = (request: IncomingMessage, response: ServerResponse) => void;

interface AuthorityApiModule {
  handleAuthorityRequest: Handler;
}

export function authorityApiPlugin(): Plugin {
  return {
    name: 'learner-authority-api',
    async configureServer(server) {
      const mod = (await server.ssrLoadModule(
        '/server/authority-api.ts',
      )) as unknown as AuthorityApiModule;
      server.middlewares.use('/v1', (request, response) => {
        mod.handleAuthorityRequest(request, response);
      });
    },
  };
}
