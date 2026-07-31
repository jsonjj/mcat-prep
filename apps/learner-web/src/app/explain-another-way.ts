import {
  fallbackRewrite,
  rewriteCacheKey,
  sanitizeRewrite,
  type GroundedRationale,
  type RewriteMode,
  type StepByStepGate,
} from '@mcat/ai-gateway';

/**
 * Client seam for "Explain it another way" (WS4). It POSTs the (already
 * revealed) vetted source to the grounded rewrite route, caches the answer per
 * `(question_id, form, source-surface)`, and degrades to the deterministic
 * templated re-statement whenever the route is unavailable — a 503 / missing
 * key, or an unwired route (which SPA-rewrites to HTML and fails to parse).
 *
 * The endpoint defaults to the same-origin `/v1/ai/rewrite` route, served by the
 * learner-API in prod (behind its session auth + WAF) and by the dev-server AI
 * middleware locally. It can be repointed with `VITE_AI_REWRITE_URL`. The
 * provider key is never here.
 */

export interface RewriteResult {
  readonly text: string;
  /** True when the deterministic re-statement was used instead of a model rewrite. */
  readonly fallback: boolean;
}

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

const DEFAULT_ENDPOINT =
  (import.meta.env.VITE_AI_REWRITE_URL as string | undefined) ?? '/v1/ai/rewrite';

// Per-(question_id, form, source-surface) cache. Module-level so re-opening the
// same question and the same form is instant and never costs a second call.
// Folding the source surface into the key keeps Practice/Study (correct-answer
// rationale) and Mistakes (distractor refutation) in separate slots.
const cache = new Map<string, RewriteResult>();

export interface RewriteInput {
  questionId: string;
  mode: RewriteMode;
  source: GroundedRationale;
  /**
   * The learner-safe "Step by step" gate (skill / section / DOK). Sent so the route
   * can enforce the gate SERVER-SIDE too, not just by the client hiding the button.
   */
  gate?: StepByStepGate;
  /** Override the route (defaults to VITE_AI_REWRITE_URL or /api/ai/rewrite). */
  endpoint?: string;
  /** Override the transport in tests. */
  fetchImpl?: FetchLike;
}

export async function requestRewrite(input: RewriteInput): Promise<RewriteResult> {
  const key = rewriteCacheKey(input.questionId, input.mode, input.source);
  const cached = cache.get(key);
  if (cached !== undefined) return cached;
  const result = await fetchRewrite(input);
  // Only cache a SUCCESSFUL grounded rewrite. A `fallback` result means either a
  // transient route failure (503 / network / non-2xx) or the grounding gate firing;
  // caching it would PIN the deterministic re-statement for the rest of the session
  // so a later successful call could never replace it. Leaving it uncached lets the
  // next open retry the route.
  if (!result.fallback) cache.set(key, result);
  return result;
}

async function fetchRewrite(input: RewriteInput): Promise<RewriteResult> {
  const endpoint = input.endpoint ?? DEFAULT_ENDPOINT;
  const doFetch = input.fetchImpl ?? fetch;
  try {
    const response = await doFetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        questionId: input.questionId,
        mode: input.mode,
        source: input.source,
        // Forwarded so the route can enforce the step gate server-side.
        gate: input.gate ?? null,
      }),
    });
    if (!response.ok) throw new Error(`rewrite_unavailable_${response.status}`);
    const data = (await response.json()) as { text?: unknown; fallback?: unknown };
    const text = typeof data.text === 'string' ? data.text : '';
    // Defense in depth: re-run the grounding gate client-side even though the
    // server already did, so a hallucinated number can never reach the learner.
    const sanitized = sanitizeRewrite(text, input.mode, input.source);
    return { text: sanitized.text, fallback: sanitized.fallback || data.fallback === true };
  } catch {
    return { text: fallbackRewrite(input.mode, input.source), fallback: true };
  }
}

/** Test-only: reset the per-(question, form) cache between cases. */
export function clearRewriteCache(): void {
  cache.clear();
}
