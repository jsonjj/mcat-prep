import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';

/**
 * Dev-only Passage of the Day API, mounted as an OFFLINE FALLBACK at the REAL
 * `/v1/passage/*` surface the browser now calls in every mode.
 *
 * The passage client routes through the shared authority client at
 * `GET /v1/passage/today/{tz}` and `POST /v1/passage/attempts` (so the feature
 * works in the deployed app, where CloudFront rewrites the old dev-only
 * `/api/passage/*` to the SPA shell). In the two PROXY dev modes — `pnpm dev`
 * (real stack) and the remote-proxy mode — `/v1` is forwarded to a backend that
 * already serves passage (the local learner API or the deployed Lambda), so this
 * plugin stands aside. Only the fully in-process OFFLINE dev authority
 * (`server/authority-api.ts`, which owns `/v1` but has no passage route) needs a
 * local stand-in; there this plugin serves the two routes.
 *
 * `enforce: 'pre'` so these routes register BEFORE the `/v1` authority middleware
 * (which answers every `/v1/*` and never calls next()); without it that catch-all
 * would 404 the passage paths. Like the diagnostic plugin, the handler (and the
 * content pool it pulls in, including answer keys and rationales) is loaded lazily
 * through `ssrLoadModule`, so it runs only inside the Node dev server and never
 * enters the browser bundle.
 */

type Handler = (request: IncomingMessage, response: ServerResponse) => void;

interface PassageApiModule {
  handleTodayRequest: Handler;
  handleAttemptRequest: Handler;
}

export function passageApiPlugin(): Plugin {
  return {
    name: 'learner-passage-api',
    enforce: 'pre',
    async configureServer(server) {
      // Only stand in when nothing else owns `/v1`. When `/v1` is proxied (the
      // real-stack and remote-proxy dev modes), that backend serves passage and
      // this plugin must not shadow it.
      if (server.config.server.proxy?.['/v1'] !== undefined) return;
      const mod = (await server.ssrLoadModule(
        '/server/passage-api.ts',
      )) as unknown as PassageApiModule;
      // tz rides in the path (`/v1/passage/today/{tz}`); this prefix mount catches
      // the tz segment, and the handler reads it off `originalUrl`.
      server.middlewares.use('/v1/passage/today', (request, response) => {
        mod.handleTodayRequest(request, response);
      });
      server.middlewares.use('/v1/passage/attempts', (request, response) => {
        mod.handleAttemptRequest(request, response);
      });
    },
  };
}
