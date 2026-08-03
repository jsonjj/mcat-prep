import { HttpAuthorityClient, type AuthPort, type AuthorityPort } from '@mcat/client-core';

const configured = import.meta.env.VITE_AUTHORITY_BASE_URL;
if (!configured) throw new Error('VITE_AUTHORITY_BASE_URL is required');

// DEV-ONLY: a relative value (e.g. "/") routes requests through the Vite dev proxy
// (see vite.config.ts) as a same-origin call, so the browser never makes a cross-origin
// request and local dev is not blocked by CORS. In a production build `import.meta.env.DEV`
// is false, so this branch is dropped and the configured value must be the absolute remote
// authority origin — the remote-authority boundary is unchanged in production.
const baseUrl =
  import.meta.env.DEV && configured.startsWith('/')
    ? new URL(configured, window.location.origin).toString()
    : configured;

export const authority: AuthorityPort & AuthPort = new HttpAuthorityClient({ baseUrl });
