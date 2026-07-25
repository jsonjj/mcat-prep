import '@fontsource-variable/fraunces';
import '@fontsource/atkinson-hyperlegible/400.css';
import '@fontsource/atkinson-hyperlegible/700.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import '@mcat/design-tokens/tokens.css';
import '@mcat/ui-web/styles.css';
import './styles/app.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router-dom';
import { ThemeProvider } from '@mcat/ui-web';
import { queryClient } from './app/queries';
import { router } from './app/router';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('#root not found');

createRoot(rootEl).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider initial="light">
        <RouterProvider router={router} />
      </ThemeProvider>
    </QueryClientProvider>
  </StrictMode>,
);

// Register a minimal service worker (shell caching only; never caches APIs/keys).
// Production only — the SW must never run against the dev server.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* offline shell is a progressive enhancement */
    });
  });
} else if ('serviceWorker' in navigator && import.meta.env.DEV) {
  // DEV self-heal: a service worker left over from a production build/preview on
  // this origin keeps serving a stale, cache-first shell + bundle — so local edits
  // never appear, even after a hard refresh or clearing cookies (neither removes a
  // service worker). In dev we proactively unregister any SW and drop its caches,
  // then reload once if a stale SW was still controlling the page. This branch is
  // dropped from the production bundle, so the PWA is unaffected.
  void (async () => {
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      if (regs.length === 0) return;
      await Promise.all(regs.map((r) => r.unregister()));
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
      if (navigator.serviceWorker.controller && !sessionStorage.getItem('mc.sw.healed')) {
        sessionStorage.setItem('mc.sw.healed', '1');
        location.reload();
      }
    } catch {
      /* best-effort dev cleanup */
    }
  })();
}
