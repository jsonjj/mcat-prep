import { createHash, createHmac } from 'node:crypto';

import {
  AuthorityPrivateSelectedCandidateWireSchema,
  QuestionSelectionRequestWireSchema,
  type AuthorityPrivateSelectedCandidateWire,
  type QuestionSelectionRequestWire,
} from '@mcat/contracts/question-serving';

function compareLexical(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => compareLexical(left, right))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  return value;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

export function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function candidateIdentity(candidate: AuthorityPrivateSelectedCandidateWire): object {
  return {
    question_id: candidate.question_id,
    item_version: candidate.item_version,
    content_version: candidate.content_version,
    content_hash: candidate.content_hash,
    mapping_version: candidate.mapping_version,
    mapping_hash: candidate.mapping_hash,
    family_id: candidate.family_id,
    family_version: candidate.family_version,
    stimulus_id: candidate.stimulus_id,
    stimulus_version: candidate.stimulus_version,
    testlet_id: candidate.testlet_id,
    testlet_version: candidate.testlet_version,
  };
}

function assertAuthoritySecret(secret: string | Uint8Array): void {
  const byteLength =
    typeof secret === 'string' ? Buffer.byteLength(secret, 'utf8') : secret.byteLength;
  if (byteLength < 32) {
    throw new Error('The server selection authority secret must contain at least 32 bytes.');
  }
}

export interface DeterministicCandidateRanking {
  readonly request: QuestionSelectionRequestWire;
  readonly requestDigest: string;
  readonly candidateSetDigest: string;
  readonly rankedCandidates: readonly AuthorityPrivateSelectedCandidateWire[];
  decisionDigest(candidate: AuthorityPrivateSelectedCandidateWire): string;
}

/**
 * Stable HMAC ordering. The server secret is never accepted from the request or
 * persisted in a receipt, so request IDs cannot be used as a client oracle.
 */
export function rankEligibleCandidates(
  requestInput: unknown,
  candidateInputs: readonly unknown[],
  authoritySecret: string | Uint8Array,
): DeterministicCandidateRanking {
  assertAuthoritySecret(authoritySecret);
  const request = QuestionSelectionRequestWireSchema.parse(requestInput);
  const candidates = candidateInputs.map((candidate) =>
    AuthorityPrivateSelectedCandidateWireSchema.parse(candidate),
  );
  const requestDigest = sha256(canonicalJson(request));
  const stableCandidates = [...candidates].sort((left, right) =>
    compareLexical(canonicalJson(candidateIdentity(left)), canonicalJson(candidateIdentity(right))),
  );
  const candidateSetDigest = sha256(
    canonicalJson(stableCandidates.map((candidate) => candidateIdentity(candidate))),
  );
  const ranked = stableCandidates
    .map((candidate) => {
      const identity = canonicalJson(candidateIdentity(candidate));
      const rank = createHmac('sha256', authoritySecret)
        .update(`V7_SELECTION_RANK\0${requestDigest}\0${candidateSetDigest}\0${identity}`)
        .digest('hex');
      return { candidate, identity, rank };
    })
    .sort(
      (left, right) =>
        compareLexical(left.rank, right.rank) || compareLexical(left.identity, right.identity),
    )
    .map(({ candidate }) => candidate);

  return {
    request,
    requestDigest,
    candidateSetDigest,
    rankedCandidates: ranked,
    decisionDigest: (candidate) =>
      createHmac('sha256', authoritySecret)
        .update(
          `V7_SELECTION_DECISION\0${requestDigest}\0${candidateSetDigest}\0${canonicalJson(
            candidateIdentity(candidate),
          )}`,
        )
        .digest('hex'),
  };
}
