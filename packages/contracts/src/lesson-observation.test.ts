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
  measurementKind: 'MEASURABLE',
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
  authoredAssistanceAffordances: ['A0'],
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
  response: {
    kind: 'MULTIPLE_CHOICE',
    chosenChoiceId: 'choice-a',
  },
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
      'primaryKcId',
      'activityId',
      'semanticFamilyId',
      'firstAttemptImmutable',
      'authoredAssistanceAffordances',
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

  it('separates measurable attempts from non-measurable exposition', () => {
    const bindingSchema = schemaFromIndex('LessonItemBindingSchema');
    const acceptedObservationSchema = schemaFromIndex('AcceptedLessonObservationSchema');
    const nonMeasurableBinding = {
      measurementKind: 'NON_MEASURABLE',
      lessonId: 'lesson-created-after-contract',
      itemBindingId: 'worked-example-created-after-contract',
      primaryKcId: 'kc-created-after-contract',
      secondaryKcMappings: [],
      activityRole: 'WORKED_EXAMPLE',
      semanticFamilyId: 'family-created-after-contract',
      authoredAssistanceAffordances: ['VISIBLE_EXPLANATION'],
      changedDimensions: [],
      learnerSafeItemRef: 'node-created-after-contract',
    };

    expect(bindingSchema.safeParse(nonMeasurableBinding).success).toBe(true);
    expect(bindingSchema.safeParse(without(nonMeasurableBinding, 'measurementKind')).success).toBe(
      false,
    );
    expect(
      bindingSchema.safeParse({
        ...nonMeasurableBinding,
        serverScoringAuthorityRef: 'forbidden-on-exposition',
      }).success,
    ).toBe(false);
    expect(
      acceptedObservationSchema.safeParse({
        ...validAcceptedObservation(),
        binding: nonMeasurableBinding,
      }).success,
    ).toBe(false);
  });

  it('keeps authored assistance affordances separate from runtime assistance used', () => {
    const bindingSchema = schemaFromIndex('LessonItemBindingSchema');
    const responseSchema = schemaFromIndex('LessonRuntimeResponseFactsSchema');

    expect(
      bindingSchema.safeParse({
        ...validBinding(),
        authoredAssistanceAffordances: ['VISIBLE_EXPLANATION', 'NOT_SURE_ALLOWED'],
      }).success,
    ).toBe(true);
    expect(
      responseSchema.safeParse({
        ...validResponse(),
        assistanceLevel: 'A3',
      }).success,
    ).toBe(true);
    expect(
      bindingSchema.safeParse({ ...validBinding(), authoredAssistanceLevel: 'A0' }).success,
    ).toBe(false);
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
    const hasEligibleEvidenceMode =
      functionFromIndex<
        (binding: { readonly candidateEvidenceModes: readonly string[] }) => boolean
      >('hasEligibleEvidenceMode');

    expect(hasEligibleEvidenceMode({ candidateEvidenceModes: ['INDEPENDENT'] })).toBe(true);
    expect(hasEligibleEvidenceMode({ candidateEvidenceModes: ['INSTRUCTIONAL'] })).toBe(false);
    expect(bindingSchema.safeParse({ ...validBinding(), independent: true }).success).toBe(false);
  });

  it('classifies every declared evidence mode against an explicit allowlist', () => {
    // Exhaustive over the enum on purpose. Adding a 14th member must fail here
    // until someone classifies it deliberately, rather than silently granting it
    // BKT access the way a denylist would.
    const hasEligibleEvidenceMode =
      functionFromIndex<
        (binding: { readonly candidateEvidenceModes: readonly string[] }) => boolean
      >('hasEligibleEvidenceMode');
    const allowlist = functionFromIndex<readonly string[]>('BKT_ELIGIBLE_EVIDENCE_MODES');
    const declaredModes = schemaFromIndex('CandidateEvidenceModeSchema') as unknown as {
      readonly options: readonly string[];
    };

    const EXPECTED_ELIGIBILITY: Readonly<Record<string, boolean>> = {
      DIAGNOSTIC: false,
      ENTRY: false,
      INSTRUCTIONAL: false,
      INSTRUCTIONAL_EXIT: false,
      REPAIR_CONFIRMATION: false,
      REHEARSAL_ONLY: false,
      INDEPENDENT: true,
      TRANSFER: true,
      DELAYED: true,
      MIXED: true,
      PASSAGE: true,
      TIMED: true,
      PROTECTED: true,
    };

    // The two sets partition the enum with nothing left over on either side.
    expect([...declaredModes.options].sort()).toEqual(Object.keys(EXPECTED_ELIGIBILITY).sort());
    expect([...allowlist].sort()).toEqual(
      Object.entries(EXPECTED_ELIGIBILITY)
        .filter(([, eligible]) => eligible)
        .map(([mode]) => mode)
        .sort(),
    );

    for (const mode of declaredModes.options) {
      expect(hasEligibleEvidenceMode({ candidateEvidenceModes: [mode] }), mode).toBe(
        EXPECTED_ELIGIBILITY[mode],
      );
    }
  });

  it('requires a reasoning operation exactly for bindings declaring an eligible mode', () => {
    const bindingSchema = schemaFromIndex('LessonItemBindingSchema');
    const declaredModes = schemaFromIndex('CandidateEvidenceModeSchema') as unknown as {
      readonly options: readonly string[];
    };
    const allowlist = new Set(functionFromIndex<readonly string[]>('BKT_ELIGIBLE_EVIDENCE_MODES'));

    for (const mode of declaredModes.options) {
      const withoutOperation = bindingSchema.safeParse({
        ...without(validBinding(), 'reasoningOperation'),
        candidateEvidenceModes: [mode],
      });

      // Four combinations: {eligible, ineligible} x {operation present, absent}.
      if (allowlist.has(mode)) {
        expect(withoutOperation.success, mode).toBe(false);
        if (!withoutOperation.success) {
          const issue = withoutOperation.error.issues.find(
            (candidate) => candidate.message === 'ELIGIBLE_BINDING_MISSING_REASONING_OPERATION',
          );
          expect(issue?.path, mode).toEqual(['reasoningOperation']);
          expect(issue?.params?.rejectionCode, mode).toBe(
            'ELIGIBLE_BINDING_MISSING_REASONING_OPERATION',
          );
        }
      } else {
        // An ineligible mode never needs the governed label, and may still carry
        // one without becoming eligible.
        expect(withoutOperation.success, mode).toBe(true);
      }

      expect(
        bindingSchema.safeParse({ ...validBinding(), candidateEvidenceModes: [mode] }).success,
        mode,
      ).toBe(true);
    }
  });

  it('defaults absent evidence modes to instructional and rejects an empty permission set', () => {
    const bindingSchema = schemaFromIndex('LessonItemBindingSchema');
    const defaulted = bindingSchema.safeParse(without(validBinding(), 'candidateEvidenceModes'));

    expect(defaulted.success).toBe(true);
    if (defaulted.success) {
      expect(
        (defaulted.data as { readonly candidateEvidenceModes: readonly string[] })
          .candidateEvidenceModes,
      ).toEqual(['INSTRUCTIONAL']);
    }
    expect(
      bindingSchema.safeParse({
        ...validBinding(),
        candidateEvidenceModes: [],
      }).success,
    ).toBe(false);
  });

  it('allows bindings to defer an opaque version to the artifact adapter', () => {
    const bindingSchema = schemaFromIndex('LessonItemBindingSchema');

    expect(bindingSchema.safeParse(without(validBinding(), 'bindingVersion')).success).toBe(true);
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

  it('accepts opaque learner-safe references and strict inline learner-safe projections', () => {
    const bindingSchema = schemaFromIndex('LessonItemBindingSchema');
    const projection = {
      prompt: 'Which relation holds?',
      choices: [
        { id: 'A', text: 'First safe option' },
        { id: 'B', text: 'Second safe option' },
      ],
      representationId: null,
    };

    expect(
      bindingSchema.safeParse({
        ...validBinding(),
        learnerSafeItemRef: projection,
      }).success,
    ).toBe(true);
    expect(
      bindingSchema.safeParse({
        ...validBinding(),
        learnerSafeItemRef: {
          ...projection,
          answerKey: 'forbidden',
        },
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

  it('represents multiple-choice and multi-field constructed responses', () => {
    const responseSchema = schemaFromIndex('LessonRuntimeResponseFactsSchema');

    expect(responseSchema.safeParse(validResponse()).success).toBe(true);
    expect(
      responseSchema.safeParse({
        ...validResponse(),
        response: {
          kind: 'CONSTRUCTED',
          fields: {
            equation_1: 'x + y = 4',
            equation_2: 'x - y = 2',
            submission: 'submitted',
          },
        },
      }).success,
    ).toBe(true);
  });

  it('retains explicitly typed optional authoring metadata', () => {
    const bindingSchema = schemaFromIndex('LessonItemBindingSchema');

    expect(
      bindingSchema.safeParse({
        ...validBinding(),
        changedDimensionDetail: '',
        hintPolicy: 'NONE_BEFORE_COMMIT',
        feedbackRelease: 'AFTER_COMMIT',
        omissionPolicy: 'RECORD_AND_ROUTE',
        retryPolicy: 'FRESH_FAMILY_ONLY',
        invalidItemPolicy: 'VOID_AND_REPLACE_FRESH',
        exitFunction: 'NEAR_USE',
        freshnessPolicy: 'UNTOUCHED_FAMILY_REQUIRED',
        publicationEligibility: 'INTERNAL_DRAFT_ONLY',
        solutionPathLineageId: 'path-lineage',
        decisiveCueId: 'cue-id',
        distractorLineageId: 'distractor-id',
        responseFeatureRoutes: [
          {
            responseFieldId: 'equation_1',
            responsePatternId: 'missing-condition-pattern',
            responseFeatureId: 'missing-condition',
            routeKind: 'TARGETED_REPAIR',
            repairFeatureId: 'repair-feature',
          },
        ],
        exactReentryFor: 'CHANGED_EXIT',
        scopeOperationTags: ['CONSTRUCT_SYSTEM'],
        freshnessDivergence: {
          changedFromItemBindingId: 'prior-binding',
          stimulusDifference: 'different context',
          solutionPathDifference: 'different operation sequence',
          distractorDifference: 'different distractors',
        },
        responseMode: 'CONSTRUCTED_SYSTEM_AND_SOLUTION',
        secondaryKcRefs: ['secondary-kc-created-after-contract'],
      }).success,
    ).toBe(true);
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
          response: {
            kind: 'MULTIPLE_CHOICE',
            chosenChoiceId: null,
          },
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
