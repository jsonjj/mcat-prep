import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';

/**
 * Dev-only recall API. Like the diagnostic plugin, the handler (and the
 * server-only bank + answer key it reuses) is loaded through `ssrLoadModule`, so
 * it runs only inside the Node dev server and never enters the browser bundle.
 */

type Handler = (request: IncomingMessage, response: ServerResponse) => void;

interface RecallApiModule {
  handleRecallQuestion: Handler;
  handleRecallAnswer: Handler;
}

export function recallApiPlugin(): Plugin {
  return {
    name: 'learner-recall-api',
    async configureServer(server) {
      const mod = (await server.ssrLoadModule('/server/recall-api.ts')) as unknown as RecallApiModule;
      server.middlewares.use('/api/recall/question', (request, response) => {
        mod.handleRecallQuestion(request, response);
      });
      server.middlewares.use('/api/recall/answer', (request, response) => {
        mod.handleRecallAnswer(request, response);
      });
    },
  };
}
