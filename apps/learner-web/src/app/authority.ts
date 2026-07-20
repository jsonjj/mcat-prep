import { InProcessAuthorityClient, type AuthorityPort } from '@mcat/client-core';
import { createLocalStateStore } from '@mcat/platform-web';
import type { LearnerState } from '@mcat/authority-core';

/**
 * The app's authority client. Locally this is the in-process engine over
 * localStorage; in production this becomes an HTTP adapter to API Gateway with no
 * change to callers. (See ADR 0004.)
 */
const store = createLocalStateStore<LearnerState>('mc.learner-state.v1');

export const authority: AuthorityPort = new InProcessAuthorityClient(store);
