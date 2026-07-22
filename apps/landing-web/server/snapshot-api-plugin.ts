import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import { handleBetaLeadRequest } from './beta-lead-api';
import { handleAttemptRequest, handleScoreRequest } from './snapshot-api';

interface MiddlewareStack {
  use: (
    route: string,
    handler: (request: IncomingMessage, response: ServerResponse, next: () => void) => void,
  ) => void;
}

function attachSnapshotApi(middlewares: MiddlewareStack) {
  middlewares.use('/api/snapshot/attempt', (request, response) => {
    handleAttemptRequest(request, response);
  });
  middlewares.use('/api/snapshot/score', (request, response) => {
    handleScoreRequest(request, response);
  });
  middlewares.use('/api/beta-updates', (request, response) => {
    handleBetaLeadRequest(request, response);
  });
}

export function snapshotApiPlugin(): Plugin {
  return {
    name: 'landing-snapshot-api',
    configureServer(server) {
      attachSnapshotApi(server.middlewares);
    },
    configurePreviewServer(server) {
      attachSnapshotApi(server.middlewares);
    },
  };
}
