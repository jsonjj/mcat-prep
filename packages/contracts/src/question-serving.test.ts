import { describe, expect, it } from 'vitest';

import {
  MinimalCueSafeLearnerQuestionWireSchema,
  QuestionAuthoringMetadataWireSchema,
  QuestionSelectionRequestWireSchema,
  learnerQuestionFromWire,
  learnerQuestionToWire,
  selectionRequestFromWire,
  selectionRequestToWire,
} from './question-serving';
import { VersionBoundProtectedAnswerWireSchema } from './question-serving-protected';

const DIGEST = 'a'.repeat(64);
const NOW = '2026-07-23T20:00:00.000Z';

function selectionRequest(): unknown {
  return {
    request_id: '10000000-0000-4000-8000-000000000001',
    learner_id: '10000000-0000-4000-8000-000000000002',
    session_id: '10000000-0000-4000-8000-000000000003',
    requested_at: NOW,
    primary_construct: { construct_type: 'KC', construct_id: 'BIO_KC_001' },
    activity_role: 'DIAGNOSTIC',
    evidence_mode: 'DIAGNOSTIC',
    representations: ['TEXT'],
    context_domains: [],
    calibration_requirement: 'REQUIRED_OPERATIONAL',
    family_reuse_mode: 'FRESH_ONLY',
    content_release: 'v7-reviewed-1',
    content_cutoff: NOW,
    policy_cutoff: NOW,
    policy_versions: {
      eligibility_policy_version: 'ELIGIBILITY_V1',
      selection_policy_version: 'SELECTION_V1',
      exposure_policy_version: 'EXPOSURE_V1',
    },
  };
}

function authoringMetadata(): unknown {
  return {
    question_id: 'synthetic-question-1',
    item_version: 1,
    content_version: 1,
    content_hash: DIGEST,
    content_release: 'v7-reviewed-1',
    content_published_at: NOW,
    mapping_version: 1,
    mapping_hash: DIGEST,
    calibration_version: 1,
    calibration_status: 'OPERATIONAL',
    primary_construct: { construct_type: 'KC', construct_id: 'BIO_KC_001' },
    required_secondary_kcs: [{ kc_id: 'BIO_KC_002', joint_scored: true }],
    incidental_mappings: [{ construct_type: 'SKILL', construct_id: 'SIRS1' }],
    joint_scoring_semantics: 'PRIMARY_AND_REQUIRED_SECONDARIES',
    family_id: 'synthetic-family-1',
    family_version: 1,
    semantic_family_decision: 'CONFIRMED',
    semantic_family_decision_version: 1,
    stimulus_id: null,
    stimulus_version: null,
    testlet_id: 'synthetic-testlet-1',
    testlet_version: 1,
    local_dependence: 'TESTLET',
    representation: 'TEXT',
    context_domain: 'LAB',
    allowed_activity_roles: ['DIAGNOSTIC'],
    allowed_evidence_modes: ['DIAGNOSTIC'],
    rights_status: 'CLEARED',
    model_processing_rights: 'ALLOWED',
    rights_review_version: 1,
    accessibility_status: 'EQUIVALENT',
    accessibility_equivalence_version: 1,
    accessibility_equivalence_hash: DIGEST,
    certification_state: 'CERTIFIED',
    publication_state: 'PUBLISHED',
    retirement_state: 'ACTIVE',
    asset_manifest_digest: DIGEST,
    asset_readiness: 'NOT_REQUIRED',
    reviewer_approvals: [
      {
        review_scope: 'CONTENT',
        reviewer_id: 'synthetic-reviewer',
        approval_version: 1,
        approved_at: NOW,
        approval_digest: DIGEST,
      },
    ],
    source_ledger_digest: DIGEST,
    review_report_digest: DIGEST,
  };
}

describe('v7 question-serving wire contracts', () => {
  it('accepts an exact reviewed authoring projection and rejects unknown corpus fields', () => {
    expect(() => QuestionAuthoringMetadataWireSchema.parse(authoringMetadata())).not.toThrow();
    expect(() =>
      QuestionAuthoringMetadataWireSchema.parse({
        ...(authoringMetadata() as object),
        human_sme_review: { status: 'claimed-reviewed' },
      }),
    ).toThrow();
  });

  it('requires version, family, rights, accessibility, and calibration fields', () => {
    for (const field of [
      'item_version',
      'family_id',
      'rights_status',
      'accessibility_status',
      'calibration_status',
      'reviewer_approvals',
    ]) {
      const value = { ...(authoringMetadata() as Record<string, unknown>) };
      delete value[field];
      expect(
        () => QuestionAuthoringMetadataWireSchema.parse(value),
        `missing ${field} must fail`,
      ).toThrow();
    }
  });

  it('rejects inconsistent testlet dependence and joint-scoring metadata', () => {
    expect(() =>
      QuestionAuthoringMetadataWireSchema.parse({
        ...(authoringMetadata() as object),
        local_dependence: 'INDEPENDENT',
      }),
    ).toThrow();
    expect(() =>
      QuestionAuthoringMetadataWireSchema.parse({
        ...(authoringMetadata() as object),
        joint_scoring_semantics: 'PRIMARY_ONLY',
      }),
    ).toThrow();
  });

  it('round-trips selection requests bijectively', () => {
    const wire = QuestionSelectionRequestWireSchema.parse(selectionRequest());
    expect(selectionRequestToWire(selectionRequestFromWire(wire))).toEqual(wire);
  });

  it('rejects client-controlled selector/oracle fields', () => {
    for (const [field, value] of [
      ['seed', 'predictable'],
      ['candidate_ids', ['synthetic-question-1']],
      ['question_id', 'synthetic-question-1'],
      ['family_id', 'synthetic-family-1'],
      ['sort', 'question_id'],
      ['limit', 1],
    ] as const) {
      expect(() =>
        QuestionSelectionRequestWireSchema.parse({
          ...(selectionRequest() as object),
          [field]: value,
        }),
      ).toThrow();
    }
  });

  it('permits family reuse only for rehearsal-only requests', () => {
    expect(() =>
      QuestionSelectionRequestWireSchema.parse({
        ...(selectionRequest() as object),
        family_reuse_mode: 'REHEARSAL_ONLY',
      }),
    ).toThrow();
  });

  it('round-trips only the minimal cue-safe learner view', () => {
    const internal = {
      presentationId: '10000000-0000-4000-8000-000000000004',
      stem: 'Synthetic stem?',
      passage: '',
      choices: [
        { choiceId: 'A' as const, text: 'One' },
        { choiceId: 'B' as const, text: 'Two' },
        { choiceId: 'C' as const, text: 'Three' },
        { choiceId: 'D' as const, text: 'Four' },
      ],
      assets: [
        {
          url: 'https://example.invalid/synthetic.png',
          altText: 'Synthetic plot',
          mediaType: 'image/png',
        },
      ],
    };
    const wire = learnerQuestionToWire(internal);
    expect(learnerQuestionFromWire(wire)).toEqual(internal);

    for (const forbidden of [
      'correct_answer',
      'answer_key',
      'correctChoice',
      'explanations',
      'rationale',
      'solution',
      'family_id',
      'kc_id',
      'lesson_id',
      'dok_level',
      'certification_state',
      'source_ledger_digest',
    ]) {
      expect(() =>
        MinimalCueSafeLearnerQuestionWireSchema.parse({
          ...wire,
          [forbidden]: 'leak',
        }),
      ).toThrow();
    }
  });

  it('keeps the version-bound answer in the server-only strict contract', () => {
    expect(() =>
      VersionBoundProtectedAnswerWireSchema.parse({
        presentation_id: '10000000-0000-4000-8000-000000000004',
        learner_id: '10000000-0000-4000-8000-000000000002',
        question_id: 'synthetic-question-1',
        item_version: 1,
        answer_version: 1,
        answer_hash: DIGEST,
        correct_answer: 'B',
        explanations: {
          A: 'Synthetic A explanation.',
          B: 'Synthetic B explanation.',
          C: 'Synthetic C explanation.',
          D: 'Synthetic D explanation.',
        },
        exposure_mode: 'FRESH_EVIDENCE',
        authorized_at: NOW,
      }),
    ).not.toThrow();
  });
});
