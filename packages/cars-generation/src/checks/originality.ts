/**
 * Originality battery.
 *
 * Runs before anything that costs a model call, because it is the cheapest check and
 * the one whose failure is not recoverable downstream.
 *
 * SCOPE AND HONEST LIMITS. Two layers are implemented: exact n-gram containment and
 * shingled Jaccard similarity. A third layer — sentence-embedding cosine — is left as
 * an injected function because this package holds no embedding model; callers that have
 * one should supply it.
 *
 * What this cannot do, and no published method can: detect **non-literal** copying of
 * argument structure, event sequence, or rhetorical shape. That runs 2.3-5.9% in the
 * memorization literature, can exceed literal copying, and is invisible to n-gram
 * methods. The residual risk is handled architecturally instead — generation runs from
 * abstract blueprints rather than from source prose, so there is no channel through
 * which source wording could survive into output.
 *
 * Note also that no source anywhere defines how dissimilar a generated passage must be
 * from a corpus to be *defensibly original*; that is a legal question, not a technical
 * one, and nothing here is legal advice. These gates demonstrate diligence; they do not
 * establish a standard.
 */

import { ORIGINALITY } from '../calibration';
import { type CheckResult } from './report';

function tokens(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9][a-z0-9'’-]*/g) ?? []).filter((t) => t.length > 0);
}

function ngrams(words: readonly string[], n: number): Set<string> {
  const grams = new Set<string>();
  for (let i = 0; i + n <= words.length; i += 1) {
    grams.add(words.slice(i, i + n).join(' '));
  }
  return grams;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const x of a) if (b.has(x)) shared += 1;
  return shared / (a.size + b.size - shared);
}

/**
 * A reference corpus for comparison. Callers supply whatever source text they hold; the
 * documents never need to be stored in this repository, and this package never persists
 * them.
 */
export interface ReferenceDocument {
  readonly id: string;
  readonly text: string;
}

export interface OriginalityOptions {
  /** Optional embedding-similarity layer, supplied by callers that have a model. */
  readonly embeddingSimilarity?: (a: string, b: string) => Promise<number>;
  readonly embeddingMax?: number;
}

export async function checkOriginality(
  candidate: string,
  corpus: readonly ReferenceDocument[],
  options: OriginalityOptions = {},
): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  const candidateTokens = tokens(candidate);

  if (corpus.length === 0) {
    // Reported rather than silently passing: an empty corpus means the check did not
    // run, which is a different state from "the candidate is original".
    results.push({
      id: 'originality-corpus-present',
      severity: 'review',
      passed: false,
      detail: 'no reference corpus supplied, so originality was not verified',
    });
    return results;
  }

  const candidateGrams = ngrams(candidateTokens, ORIGINALITY.ngramWords);
  const candidateShingles = ngrams(candidateTokens, ORIGINALITY.shingleWords);

  let worstOverlapDoc: string | null = null;
  let sharedGramCount = 0;
  let worstJaccard = 0;
  let worstJaccardDoc: string | null = null;

  for (const doc of corpus) {
    const docTokens = tokens(doc.text);
    const docGrams = ngrams(docTokens, ORIGINALITY.ngramWords);
    let shared = 0;
    for (const gram of candidateGrams) if (docGrams.has(gram)) shared += 1;
    if (shared > sharedGramCount) {
      sharedGramCount = shared;
      worstOverlapDoc = doc.id;
    }

    const similarity = jaccard(candidateShingles, ngrams(docTokens, ORIGINALITY.shingleWords));
    if (similarity > worstJaccard) {
      worstJaccard = similarity;
      worstJaccardDoc = doc.id;
    }
  }

  results.push({
    id: 'originality-ngram-containment',
    severity: 'reject',
    passed: sharedGramCount === 0,
    detail:
      sharedGramCount === 0
        ? `no shared ${ORIGINALITY.ngramWords}-word sequence with ${corpus.length} reference document(s)`
        : `${sharedGramCount} shared ${ORIGINALITY.ngramWords}-word sequence(s) with ${worstOverlapDoc}`,
    score: sharedGramCount,
    threshold: 0,
  });

  results.push({
    id: 'originality-jaccard',
    severity: 'reject',
    passed: worstJaccard <= ORIGINALITY.jaccardMax,
    detail: `highest shingled Jaccard similarity ${worstJaccard.toFixed(4)}${worstJaccardDoc ? ` against ${worstJaccardDoc}` : ''}`,
    score: worstJaccard,
    threshold: ORIGINALITY.jaccardMax,
  });

  if (options.embeddingSimilarity) {
    const threshold = options.embeddingMax ?? 0.85;
    let worst = 0;
    let worstDoc: string | null = null;
    for (const doc of corpus) {
      const similarity = await options.embeddingSimilarity(candidate, doc.text);
      if (similarity > worst) {
        worst = similarity;
        worstDoc = doc.id;
      }
    }
    results.push({
      id: 'originality-embedding',
      severity: 'review',
      passed: worst <= threshold,
      detail: `highest embedding cosine ${worst.toFixed(4)}${worstDoc ? ` against ${worstDoc}` : ''}`,
      score: worst,
      threshold,
    });
  } else {
    results.push({
      id: 'originality-embedding',
      severity: 'info',
      passed: true,
      detail: 'embedding layer not supplied; paraphrase-level reuse was not tested',
    });
  }

  return results;
}
