import { HttpAuthorityClient, type AuthorityPort } from '@mcat/client-core';

const baseUrl = import.meta.env.VITE_AUTHORITY_BASE_URL;
if (!baseUrl) throw new Error('VITE_AUTHORITY_BASE_URL is required');

export const authority: AuthorityPort = new HttpAuthorityClient({ baseUrl });
