/*
 * Public shell cache only. API/auth traffic and private responses are always
 * network-only; arbitrary same-origin GET responses are never admitted.
 */
const SHELL_CACHE = 'mc-shell-v3';
const STATIC_SHELL_PATHS = new Set(['/', '/index.html', '/manifest.webmanifest']);
const HASHED_STATIC_ASSET = /^\/assets\/[a-z0-9/_-]+-[a-z0-9]{8,}\.[a-z0-9]+$/i;

function isCacheableStaticRequest(req, url) {
  return (
    req.method === 'GET' &&
    url.origin === self.location.origin &&
    url.search === '' &&
    (STATIC_SHELL_PATHS.has(url.pathname) || HASHED_STATIC_ASSET.test(url.pathname))
  );
}

function isCacheableStaticResponse(res) {
  const cacheControl = (res.headers.get('cache-control') ?? '').toLowerCase();
  const vary = (res.headers.get('vary') ?? '').toLowerCase();
  return (
    res.ok &&
    res.type === 'basic' &&
    !res.redirected &&
    !cacheControl.includes('no-store') &&
    !cacheControl.includes('private') &&
    !vary.includes('cookie') &&
    !vary.includes('authorization') &&
    !res.headers.has('set-cookie')
  );
}

async function precacheShell() {
  const cache = await caches.open(SHELL_CACHE);
  await Promise.allSettled(
    [...STATIC_SHELL_PATHS].map(async (path) => {
      const req = new Request(path, { credentials: 'omit', cache: 'reload' });
      const res = await fetch(req);
      if (isCacheableStaticResponse(res)) await cache.put(req, res);
    }),
  );
}

self.addEventListener('install', (event) => {
  event.waitUntil(precacheShell());
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== SHELL_CACHE).map((key) => caches.delete(key))),
      ),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  if (
    url.pathname.startsWith('/v1') ||
    url.pathname.startsWith('/auth') ||
    req.headers.has('authorization')
  ) {
    event.respondWith(fetch(req));
    return;
  }

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(async () => {
        const cache = await caches.open(SHELL_CACHE);
        return (await cache.match('/')) ?? Response.error();
      }),
    );
    return;
  }

  if (!isCacheableStaticRequest(req, url)) return;

  event.respondWith(
    caches.open(SHELL_CACHE).then(async (cache) => {
      const cached = await cache.match(req);
      if (cached) return cached;

      const res = await fetch(req);
      if (isCacheableStaticResponse(res)) await cache.put(req, res.clone());
      return res;
    }),
  );
});
