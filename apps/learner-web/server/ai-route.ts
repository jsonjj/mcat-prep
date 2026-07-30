import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  groundedRewrite,
  proxyChat,
  type AiProxyConfig,
  type AiRouteResult,
} from '@mcat/ai-gateway/server';

/**
 * Dev AI route handlers. Loaded lazily via `ssrLoadModule` (see
 * `ai-api-plugin.ts`) so the provider key and this Node-only code never enter
 * the browser bundle. They delegate to the SAME `@mcat/ai-gateway/server` core
 * the production route uses, so dev and prod cannot drift: this is the backend
 * seam the dev proxy stands in for.
 */

type Route = (body: unknown, config: AiProxyConfig) => Promise<AiRouteResult>;

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(body));
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
    });
    req.on('error', reject);
    req.on('end', () => {
      try {
        resolve(JSON.parse(raw.length > 0 ? raw : '{}'));
      } catch {
        reject(new Error('invalid_json'));
      }
    });
  });
}

async function handle(
  req: IncomingMessage,
  res: ServerResponse,
  config: AiProxyConfig,
  route: Route,
): Promise<void> {
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'method_not_allowed' });
    return;
  }
  let body: unknown;
  try {
    body = await readJsonBody(req);
  } catch {
    sendJson(res, 400, { error: 'invalid_json' });
    return;
  }
  const result = await route(body, config);
  sendJson(res, result.status, result.json);
}

/** `POST /api/ai/chat` — generic proxy (CARS Duel). */
export async function handleAiChatRequest(
  req: IncomingMessage,
  res: ServerResponse,
  config: AiProxyConfig,
): Promise<void> {
  await handle(req, res, config, proxyChat);
}

/** `POST /v1/ai/rewrite` — grounded "Explain it another way". */
export async function handleAiRewriteRequest(
  req: IncomingMessage,
  res: ServerResponse,
  config: AiProxyConfig,
): Promise<void> {
  await handle(req, res, config, groundedRewrite);
}
