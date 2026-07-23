import { describe, expect, it } from 'vitest';

import { rankEligibleCandidates } from './question-selection';

const DIGEST_A = 'a'.repeat(64);
const DIGEST_B = 'b'.repeat(64);
const SECRET = 'synthetic-authority-secret-that-is-long-enough';

function request(requestId = '20000000-0000-4000-8000-000000000001') {
  return {
    request_id: requestId,
    learner_id: '20000000-0000-4000-8000-000000000002',
    session_id: '20000000-0000-4000-8000-000000000003',
    requested_at: '2026-07-23T20:00:00.000Z',
    primary_construct: { construct_type: 'KC', construct_id: 'BIO_KC_001' },
    activity_role: 'DIAGNOSTIC',
    evidence_mode: 'DIAGNOSTIC',
    representations: [],
    context_domains: [],
    calibration_requirement: 'REQUIRED_OPERATIONAL',
    family_reuse_mode: 'FRESH_ONLY',
    content_release: 'v7-reviewed-1',
    content_cutoff: '2026-07-23T19:00:00.000Z',
    policy_cutoff: '2026-07-23T19:00:00.000Z',
    policy_versions: {
      eligibility_policy_version: 'ELIGIBILITY_V1',
      selection_policy_version: 'SELECTION_V1',
      exposure_policy_version: 'EXPOSURE_V1',
    },
  };
}

function candidate(id: string, familyId: string, digest = DIGEST_A) {
  return {
    question_id: id,
    item_version: 1,
    content_version: 1,
    content_hash: digest,
    mapping_version: 1,
    mapping_hash: DIGEST_B,
    content_release: 'v7-reviewed-1',
    family_id: familyId,
    family_version: 1,
    stimulus_id: null,
    stimulus_version: null,
    testlet_id: null,
    testlet_version: null,
    local_dependence: 'INDEPENDENT',
    representation: 'TEXT',
    context_domain: 'LAB',
    stem: `Synthetic stem ${id}`,
    passage: '',
    choices: { A: 'One', B: 'Two', C: 'Three', D: 'Four' },
    assets: [],
  };
}

describe('deterministic authority selection', () => {
  const candidates = [
    candidate('synthetic-q-1', 'synthetic-family-1'),
    candidate('synthetic-q-2', 'synthetic-family-2'),
    candidate('synthetic-q-3', 'synthetic-family-3'),
  ];

  it('is replayable regardless of candidate query order', () => {
    const first = rankEligibleCandidates(request(), candidates, SECRET);
    const second = rankEligibleCandidates(request(), [...candidates].reverse(), SECRET);

    expect(first.requestDigest).toBe(second.requestDigest);
    expect(first.candidateSetDigest).toBe(second.candidateSetDigest);
    expect(first.rankedCandidates.map(({ question_id }) => question_id)).toEqual(
      second.rankedCandidates.map(({ question_id }) => question_id),
    );
    expect(first.decisionDigest(first.rankedCandidates[0]!)).toBe(
      second.decisionDigest(second.rankedCandidates[0]!),
    );
  });

  it('binds request constraints, content versions, and candidate set', () => {
    const baseline = rankEligibleCandidates(request(), candidates, SECRET);
    const changedRequest = rankEligibleCandidates(
      { ...request(), activity_role: 'TRANSFER_CHECK' },
      candidates,
      SECRET,
    );
    const changedCandidate = rankEligibleCandidates(
      request(),
      [candidate('synthetic-q-1', 'synthetic-family-1', DIGEST_B), ...candidates.slice(1)],
      SECRET,
    );

    expect(changedRequest.requestDigest).not.toBe(baseline.requestDigest);
    expect(changedCandidate.candidateSetDigest).not.toBe(baseline.candidateSetDigest);
  });

  it('uses an unpersisted authority secret and rejects weak secrets', () => {
    const first = rankEligibleCandidates(request(), candidates, SECRET);
    const second = rankEligibleCandidates(
      request(),
      candidates,
      'another-synthetic-authority-secret-long-enough',
    );

    expect(first.decisionDigest(first.rankedCandidates[0]!)).not.toBe(
      second.decisionDigest(first.rankedCandidates[0]!),
    );
    expect(() => rankEligibleCandidates(request(), candidates, 'short')).toThrow(
      'at least 32 bytes',
    );
    expect(JSON.stringify(first)).not.toContain(SECRET);
  });
});
