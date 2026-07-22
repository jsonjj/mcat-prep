import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer, type ServerResponse } from 'node:http';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleBetaLeadRequest } from './beta-lead-api';
import { handleAttemptRequest, handleScoreRequest } from './snapshot-api';

const distDirectory = fileURLToPath(new URL('../dist/', import.meta.url));

const contentTypes: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function setSecurityHeaders(response: ServerResponse) {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.setHeader('X-Frame-Options', 'DENY');
  response.setHeader(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  );
  response.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
  );
}

function serveFile(path: string, response: ServerResponse, requestMethod: string | undefined) {
  response.statusCode = 200;
  response.setHeader(
    'Content-Type',
    contentTypes[extname(path).toLowerCase()] ?? 'application/octet-stream',
  );
  response.setHeader(
    'Cache-Control',
    path.includes(`${join('dist', 'assets')}`) || path.includes('/assets/')
      ? 'public, max-age=31536000, immutable'
      : 'no-cache',
  );
  if (requestMethod === 'HEAD') {
    response.end();
    return;
  }
  createReadStream(path).pipe(response);
}

function resolveStaticPath(pathname: string): string | null {
  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    return null;
  }

  const relativePath = decodedPath === '/' ? 'index.html' : decodedPath.replace(/^\/+/, '');
  const candidate = resolve(distDirectory, relativePath);
  if (!candidate.startsWith(resolve(distDirectory) + '/')) return null;
  if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  return join(distDirectory, 'index.html');
}

export function createLandingServer() {
  return createServer((request, response) => {
    setSecurityHeaders(response);

    const requestUrl = new URL(request.url ?? '/', 'http://landing.local');
    if (requestUrl.pathname === '/api/snapshot/attempt') {
      handleAttemptRequest(request, response);
      return;
    }
    if (requestUrl.pathname === '/api/snapshot/score') {
      handleScoreRequest(request, response);
      return;
    }
    if (requestUrl.pathname === '/api/beta-updates') {
      handleBetaLeadRequest(request, response);
      return;
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.statusCode = 405;
      response.setHeader('Allow', 'GET, HEAD');
      response.end('Method not allowed');
      return;
    }

    const staticPath = resolveStaticPath(requestUrl.pathname);
    if (!staticPath) {
      response.statusCode = 400;
      response.end('Bad request');
      return;
    }
    serveFile(staticPath, response, request.method);
  });
}

const entryPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (entryPath === fileURLToPath(import.meta.url)) {
  const parsedPort = Number.parseInt(process.env.PORT ?? '4175', 10);
  const port = Number.isFinite(parsedPort) ? parsedPort : 4175;
  const host = process.env.HOST ?? '0.0.0.0';
  const server = createLandingServer();

  server.listen(port, host, () => {
    process.stdout.write(`Landing server listening on http://${host}:${port}\n`);
  });

  const shutdown = () => {
    server.close(() => process.exit(0));
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
