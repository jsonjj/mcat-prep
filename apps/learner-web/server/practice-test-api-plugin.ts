import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';

/**
 * Dev-only periodic practice test API (WS5). Mounted ONLY in local mode (i.e.
 * alongside `authorityApiPlugin`, when `/v1` is served in-process rather than
 * proxied to a deployed backend), because the completion→state loop it closes
 * records into the SAME in-process dev authority that serves `/v1`.
 *
 * Like the diagnostic plugin, the handlers (and everything they pull in — the
 * corpus, answer keys, `@mcat/local-authority`) load lazily through
 * `ssrLoadModule`, so they run only inside the Node dev server. The authority
 * module resolves to the one cached instance the `/v1` plugin uses, so recording
 * a completed/reviewed test moves the very `LearnerState` Today's Path reads.
 */

/** Structural mirror of the authority's serve gate + scored-result completion (WS5). */
interface ServeGate {
  due: boolean;
  reason: string;
  tier: 'short' | 'standard' | 'long';
}
interface CompletionPayload {
  sittingId: string;
  takenOn: string;
  tier: 'short' | 'standard' | 'long';
  itemsScored: number;
  correct: number;
  sections: { section: string; pctCorrect: number }[];
  scaledScore: number;
  reviewTargets: { kcId: string; skill?: string }[];
}

interface PracticeTestRecorder {
  gate(): Promise<ServeGate> | ServeGate;
  recordCompleted(completion?: CompletionPayload): Promise<void> | void;
  recordReviewed(): Promise<void> | void;
}

interface PracticeTestApiModule {
  handlePracticeTestNextRequest: (
    request: IncomingMessage,
    response: ServerResponse,
    bank?: unknown,
    recorder?: PracticeTestRecorder,
  ) => void;
  handlePracticeTestBlockRequest: (
    request: IncomingMessage,
    response: ServerResponse,
    bank?: unknown,
    recorder?: PracticeTestRecorder,
  ) => void;
  handlePracticeTestReviewRequest: (
    request: IncomingMessage,
    response: ServerResponse,
    recorder?: PracticeTestRecorder,
  ) => void;
}

interface AuthorityApiModule {
  client: {
    practiceTestServeGate(): ServeGate;
    recordPracticeTestCompleted(): Promise<void>;
    recordPracticeTestResult(completion: CompletionPayload): Promise<void>;
    recordPracticeTestReviewed(): Promise<void>;
  };
}

export function practiceTestApiPlugin(): Plugin {
  return {
    name: 'learner-practice-test-api',
    async configureServer(server) {
      const mod = (await server.ssrLoadModule(
        '/server/practice-test-api.ts',
      )) as unknown as PracticeTestApiModule;
      // The SAME in-process authority the `/v1` surface uses (Vite dedupes SSR
      // modules by id), so the loop writes to the learner Today's Path reads.
      const authority = (await server.ssrLoadModule(
        '/server/authority-api.ts',
      )) as unknown as AuthorityApiModule;
      const recorder: PracticeTestRecorder = {
        // Enforce §6 cadence at the serving boundary: consult the authority
        // before a new sitting is created, and hand back the length tier.
        gate: () => authority.client.practiceTestServeGate(),
        // A completed sitting persists its SCORED result (dashboard summary +
        // repair queue); without a result payload it degrades to counters only.
        recordCompleted: (completion) =>
          completion
            ? authority.client.recordPracticeTestResult(completion)
            : authority.client.recordPracticeTestCompleted(),
        recordReviewed: () => authority.client.recordPracticeTestReviewed(),
      };
      server.middlewares.use('/api/practice-test/next', (request, response) => {
        mod.handlePracticeTestNextRequest(request, response, undefined, recorder);
      });
      server.middlewares.use('/api/practice-test/block', (request, response) => {
        mod.handlePracticeTestBlockRequest(request, response, undefined, recorder);
      });
      server.middlewares.use('/api/practice-test/review', (request, response) => {
        mod.handlePracticeTestReviewRequest(request, response, recorder);
      });
    },
  };
}
