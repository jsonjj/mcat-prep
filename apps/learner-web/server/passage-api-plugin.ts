import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';

/**
 * Dev-only Passage of the Day API. Like the diagnostic plugin, the handler (and
 * the content pool it pulls in, including answer keys and rationales) is loaded
 * lazily through Vite's `ssrLoadModule`, so it runs only inside the Node dev
 * server and never enters the browser bundle. Mounted at `/api/passage/*` so it
 * is served locally in both dev modes (in-process `/v1` and remote-proxy),
 * exactly like `/api/diagnostic/*`.
 */

type Handler = (request: IncomingMessage, response: ServerResponse) => void;

interface PassageApiModule {
  handleTodayRequest: Handler;
  handleAttemptRequest: Handler;
}

export function passageApiPlugin(): Plugin {
  return {
    name: 'learner-passage-api',
    async configureServer(server) {
      const mod = (await server.ssrLoadModule('/server/passage-api.ts')) as unknown as PassageApiModule;
      server.middlewares.use('/api/passage/today', (request, response) => {
        mod.handleTodayRequest(request, response);
      });
      server.middlewares.use('/api/passage/attempts', (request, response) => {
        mod.handleAttemptRequest(request, response);
      });
    },
  };
}
