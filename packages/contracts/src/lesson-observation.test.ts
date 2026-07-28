import { describe, expect, it } from 'vitest';
import * as contractExports from './index';

interface SafeParseFailure {
  readonly success: false;
  readonly error: {
    readonly issues: readonly {
      readonly message: string;
      readonly path: readonly (string | number)[];
      readonly params?: {
        readonly rejectionCode?: unknown;
      };
    }[];
  };
}

interface SafeParseSuccess {
  readonly success: true;
  readonly data: unknown;
}

interface RuntimeSchema {
  safeParse(input: unknown): SafeParseFailure | SafeParseSuccess;
}

const schemaFromIndex = (name: string): RuntimeSchema => {
  const schema = (contractExports as Record<string, unknown>)[name];
  expect(schema, `${name} must be exported from the contracts index`).toBeDefined();
  return schema as RuntimeSchema;
};

const functionFromIndex = <T>(name: string): T => {
  const value = (contractExports as Record<string, unknown>)[name];
  expect(value, `${name} must be exported from the contracts index`).toBeDefined();
  return value as T;
};

const without = (input: Record<string, unknown>, field: string): Record<string, unknown> =>
  Object.fromEntries(Object.entries(input).filter(([key]) => key !== field));

const validBinding = (): Record<string, unknown> => ({
  lessonId: 'lesson-created-after-contract',
  itemBindingId: 'binding-created-after-contract',
  questionId: 'question-created-after-contract',
  bindingVersion: 'draft-version-string',
  activityId: 'activity-created-after-contract',
  primaryKcId: 'kc-created-after-contract',
  secondaryKcMappings: [],
  activityRole: 'SOLO_PRACTICE',
  semanticFamilyId: 'family-created-after-contract',
  stimulusLineageId: 'lineage-created-after-contract',
  firstAttemptImmutable: true,
  authoredAssistanceLevel: 'A0',
  candidateEvidenceModes: ['INDEPENDENT'],
  reasoningOperation: 'EXPLAIN',
  representationId: 'custom-representation-created-after-contract',
  changedDimensions: [],
  changedDimensionDetail: 'compound author-reviewed context change',
  learnerSafeItemRef: 'learner-safe-item-reference',
  serverScoringAuthorityRef: 'trusted-scorer-reference',
  serverRationaleAuthorityRef: 'trusted-rationale-reference',
});

const validResponse = (): Record<string, unknown> => ({
  questionId: 'question-created-after-contract',
  itemBindingId: 'binding-created-after-contract',
  bindingVersion: 'draft-version-string',
  attemptIndex: 1,
  isRetry: false,
  isDiagnosticRetry: false,
  chosenChoiceId: 'choice-a',
  omitted: false,
  elapsedMs: 42_000,
  answerChanges: 0,
  assistanceLevel: 'A0',
  contentBearingHintUsed: false,
  revealUsed: false,
  occurredAt: '2026-07-27T12:00:00.000Z',
});

const validAcceptedObservation = (): Record<string, unknown> => ({
  observationId: '11111111-1111-4111-8111-111111111111',
  eventId: '22222222-2222-4222-8222-222222222222',
  learnerId: '33333333-3333-4333-8333-333333333333',
  idempotencyKey: '44444444-4444-4444-8444-444444444444',
  binding: validBinding(),
  response: validResponse(),
  bindingVersion: 'draft-version-string',
  serverItemVersion: 17,
  outcome: 'correct',
  scoringValid: true,
  acceptedAt: '2026-07-27T12:00:01.000Z',
  sequence: 9,
  contentRelease: 'release-created-after-contract',
  policies: [{ policyId: 'mastery', version: 'revision-created-after-contract' }],
});

const validQualifiedObservation = (): Record<string, unknown> => ({
  observationId: '11111111-1111-4111-8111-111111111111',
  questionId: 'question-created-after-contract',
  itemBindingId: 'binding-created-after-contract',
  bindingVersion: 'draft-version-string',
  serverItemVersion: 17,
  primaryKcId: 'kc-created-after-contract',
  reasoningOperation: 'EXPLAIN',
  correct: true,
  occurredAt: '2026-07-27T12:00:00.000Z',
  sequence: 9,
  contentRelease: 'release-created-after-contract',
  policies: [{ policyId: 'mastery', version: 'revision-created-after-contract' }],
});

describe('lesson observation contracts', () => {
  it('accepts arbitrary lesson and KC identifiers without a registry union', () => {
    const bindingSchema = schemaFromIndex('LessonItemBindingSchema');

    const parsed = bindingSchema.safeParse(validBinding());

    expect(parsed.success).toBe(true);
  });

  it('fails closed when immutable binding metadata is missing', () => {
    const bindingSchema = schemaFromIndex('LessonItemBindingSchema');
    const requiredMetadata = [
      'lessonId',
      'itemBindingId',
      'questionId',
      'bindingVersion',
      'primaryKcId',
      'activityId',
      'semanticFamilyId',
      'firstAttemptImmutable',
      'authoredAssistanceLevel',
      'candidateEvidenceModes',
      'changedDimensions',
      'learnerSafeItemRef',
      'serverScoringAuthorityRef',
    ];

    for (const field of requiredMetadata) {
      const parsed = bindingSchema.safeParse(without(validBinding(), field));
      expect(parsed.success).toBe(false);
      if (!parsed.success) {
        expect(parsed.error.issues.map((issue) => issue.path)).toContainEqual([field]);
      }
    }
  });

  it('requires immutable first attempts to be literally true', () => {
    const bindingSchema = schemaFromIndex('LessonItemBindingSchema');
    const parsed = bindingSchema.safeParse({
      ...validBinding(),
      firstAttemptImmutable: false,
    });

    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.map((issue) => issue.path)).toContainEqual([
        'firstAttemptImmutable',
      ]);
    }
  });

  it('rejects unknown and protected material from an immutable binding', () => {
    const bindingSchema = schemaFromIndex('LessonItemBindingSchema');
    const protectedFields = [
      'answerKey',
      'correctAnswer',
      'correctChoiceId',
      'scoringLogic',
      'protectedRationale',
      'rationales',
      'explanations',
    ];

    for (const field of protectedFields) {
      expect(bindingSchema.safeParse({ ...validBinding(), [field]: 'protected' }).success).toBe(
        false,
      );
    }

    expect(bindingSchema.safeParse({ ...validBinding(), unexpected: 'value' }).success).toBe(false);
  });

  it('uses candidate modes rather than a client-supplied independent flag', () => {
    const bindingSchema = schemaFromIndex('LessonItemBindingSchema');
    const hasIndependentEvidenceMode = functionFromIndex<
      (binding: { readonly candidateEvidenceModes: readonly string[] }) => boolean
    >('hasIndependentEvidenceMode');

    expect(hasIndependentEvidenceMode({ candidateEvidenceModes: ['INDEPENDENT'] })).toBe(true);
    expect(bindingSchema.safeParse({ ...validBinding(), independent: true }).success).toBe(false);
  });

  it('requires a reasoning operation exactly when an eligible mode is declared', () => {
    const bindingSchema = schemaFromIndex('LessonItemBindingSchema');
    const eligibleWithoutOperation = without(validBinding(), 'reasoningOperation');
    const eligibleWithoutOperationResult = bindingSchema.safeParse(eligibleWithoutOperation);

    expect(eligibleWithoutOperationResult.success).toBe(false);
    if (!eligibleWithoutOperationResult.success) {
      const issue = eligibleWithoutOperationResult.error.issues.find(
        (candidate) => candidate.message === 'ELIGIBLE_BINDING_MISSING_REASONING_OPERATION',
      );
      expect(issue?.path).toEqual(['reasoningOperation']);
      expect(issue?.params?.rejectionCode).toBe('ELIGIBLE_BINDING_MISSING_REASONING_OPERATION');
    }

    expect(bindingSchema.safeParse(validBinding()).success).toBe(true);

    const nonEligibleWithoutOperation = {
      ...without(validBinding(), 'reasoningOperation'),
      candidateEvidenceModes: ['INSTRUCTIONAL'],
    };
    expect(bindingSchema.safeParse(nonEligibleWithoutOperation).success).toBe(true);
    expect(
      bindingSchema.safeParse({
        ...validBinding(),
        candidateEvidenceModes: ['INSTRUCTIONAL'],
        reasoningOperation: 'EXPLAIN',
      }).success,
    ).toBe(true);
  });

  it('keeps DOK optional while limiting it to the closed V3 range', () => {
    const bindingSchema = schemaFromIndex('LessonItemBindingSchema');
    const dokLevelSchema = schemaFromIndex('DokLevelSchema');

    expect(bindingSchema.safeParse(validBinding()).success).toBe(true);
    expect(
      bindingSchema.safeParse({
        ...without(validBinding(), 'reasoningOperation'),
        candidateEvidenceModes: ['INSTRUCTIONAL'],
      }).success,
    ).toBe(true);
    expect(bindingSchema.safeParse({ ...validBinding(), dokLevel: 3 }).success).toBe(true);
    expect(dokLevelSchema.safeParse(1).success).toBe(true);
    expect(dokLevelSchema.safeParse(4).success).toBe(true);
    expect(dokLevelSchema.safeParse(0).success).toBe(false);
    expect(dokLevelSchema.safeParse(5).success).toBe(false);
  });

  it('uses open representations and explicit authored changed dimensions', () => {
    const bindingSchema = schemaFromIndex('LessonItemBindingSchema');
    const representationIdSchema = schemaFromIndex('RepresentationIdSchema');

    expect(representationIdSchema.safeParse('new-representation-created-later').success).toBe(true);
    expect(representationIdSchema.safeParse(null).success).toBe(true);
    expect(representationIdSchema.safeParse('').success).toBe(false);
    expect(
      bindingSchema.safeParse({
        ...validBinding(),
        representationId: null,
        changedDimensions: [],
        changedDimensionDetail: 'unmapped prose remains raw detail',
      }).success,
    ).toBe(true);
    expect(
      bindingSchema.safeParse({
        ...validBinding(),
        changedDimensions: ['unknown-variable'],
      }).success,
    ).toBe(false);
  });

  it('keeps semantic structure as open non-state authoring metadata', () => {
    const bindingSchema = schemaFromIndex('LessonItemBindingSchema');

    expect(
      bindingSchema.safeParse({
        ...validBinding(),
        semanticStructure: {
          representation: 'factor expression',
          context: '',
          operation: 'orient a supplied factor',
          unknown: 'setup',
          authoringNote: 'future lesson metadata',
        },
      }).success,
    ).toBe(true);
    expect(
      bindingSchema.safeParse({
        ...validBinding(),
        semanticStructure: {
          pedagogicalFrame: '',
          futureLessonAxis: 'free-text value',
        },
      }).success,
    ).toBe(true);
  });

  it('keeps binding versions opaque and server item versions numeric', () => {
    const responseSchema = schemaFromIndex('LessonRuntimeResponseFactsSchema');
    const acceptedObservationSchema = schemaFromIndex('AcceptedLessonObservationSchema');

    expect(responseSchema.safeParse(validResponse()).success).toBe(true);
    expect(responseSchema.safeParse({ ...validResponse(), answerKey: 'protected' }).success).toBe(
      false,
    );
    expect(acceptedObservationSchema.safeParse(validAcceptedObservation()).success).toBe(true);
    expect(
      acceptedObservationSchema.safeParse({
        ...validAcceptedObservation(),
        serverItemVersion: 'draft-version-string',
      }).success,
    ).toBe(false);
  });

  it('couples resolved item versions to scoring validity', () => {
    const acceptedObservationSchema = schemaFromIndex('AcceptedLessonObservationSchema');
    const invalidScoring = without(
      {
        ...validAcceptedObservation(),
        scoringValid: false,
        outcome: 'omitted',
        response: {
          ...validResponse(),
          chosenChoiceId: null,
          omitted: true,
        },
      },
      'serverItemVersion',
    );

    expect(acceptedObservationSchema.safeParse(invalidScoring).success).toBe(true);

    const invalidWithResolvedVersion = acceptedObservationSchema.safeParse({
      ...validAcceptedObservation(),
      scoringValid: false,
    });
    expect(invalidWithResolvedVersion.success).toBe(false);
    if (!invalidWithResolvedVersion.success) {
      expect(invalidWithResolvedVersion.error.issues.map((issue) => issue.path)).toContainEqual([
        'serverItemVersion',
      ]);
    }

    const validWithoutResolvedVersion = acceptedObservationSchema.safeParse(
      without(validAcceptedObservation(), 'serverItemVersion'),
    );
    expect(validWithoutResolvedVersion.success).toBe(false);
    if (!validWithoutResolvedVersion.success) {
      expect(validWithoutResolvedVersion.error.issues.map((issue) => issue.path)).toContainEqual([
        'serverItemVersion',
      ]);
    }
  });

  it('rejects unknown nested keys in accepted observation snapshots', () => {
    const acceptedObservationSchema = schemaFromIndex('AcceptedLessonObservationSchema');
    const bindingUnknown = acceptedObservationSchema.safeParse({
      ...validAcceptedObservation(),
      binding: {
        ...validBinding(),
        untrustedBindingField: 'rejected',
      },
    });
    const responseUnknown = acceptedObservationSchema.safeParse({
      ...validAcceptedObservation(),
      response: {
        ...validResponse(),
        untrustedResponseField: 'rejected',
      },
    });

    expect(bindingUnknown.success).toBe(false);
    expect(responseUnknown.success).toBe(false);
  });

  it('keeps qualified BKT output limited to the two direct grains', () => {
    const qualifiedObservationSchema = schemaFromIndex('QualifiedBktObservationSchema');

    expect(qualifiedObservationSchema.safeParse(validQualifiedObservation()).success).toBe(true);
    for (const prohibitedField of [
      'lessonId',
      'pL',
      'mastered',
      'masteryThreshold',
      'evidenceStatus',
      'kind',
      'independent',
    ]) {
      expect(
        qualifiedObservationSchema.safeParse({
          ...validQualifiedObservation(),
          [prohibitedField]: 'not-permitted',
        }).success,
      ).toBe(false);
    }
  });

  it('models qualified and rejected BKT results with fail-closed codes', () => {
    const resultSchema = schemaFromIndex('BktQualificationResultSchema');
    const isBktQualificationAccepted = functionFromIndex<
      (result: { readonly status: 'qualified' | 'rejected' }) => boolean
    >('isBktQualificationAccepted');

    expect(
      resultSchema.safeParse({
        status: 'qualified',
        observation: validQualifiedObservation(),
      }).success,
    ).toBe(true);
    expect(
      resultSchema.safeParse({
        status: 'rejected',
        rejectionCodes: ['SERVER_SCORING_INVALID'],
      }).success,
    ).toBe(true);
    expect(
      resultSchema.safeParse({
        status: 'rejected',
        rejectionCodes: ['NOT_A_LOCKED_REJECTION_CODE'],
      }).success,
    ).toBe(false);
    expect(
      isBktQualificationAccepted({
        status: 'qualified',
      }),
    ).toBe(true);
    expect(
      isBktQualificationAccepted({
        status: 'rejected',
      }),
    ).toBe(false);
  });
});
