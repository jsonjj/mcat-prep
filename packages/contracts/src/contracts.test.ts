import { describe, expect, it } from 'vitest';
import {
  AcceptedEventSchema,
  AttemptSubmittedSchema,
  ContentIdSchema,
  DecisionReasonViewSchema,
  EVIDENCE_REASON_CODES,
  LearnerEventSchema,
  newEventId,
  newIdempotencyKey,
  newLearnerId,
  SKILL_CLUSTERS,
  CLUSTER_INFO,
  BRAIN_REGION_BY_CLUSTER,
  UtcTimestampSchema,
} from './index';
import * as contractExports from './index';

describe('contracts', () => {
  it('generates branded uuids that validate', () => {
    expect(() => newLearnerId()).not.toThrow();
    expect(() => newEventId()).not.toThrow();
    expect(() => newIdempotencyKey()).not.toThrow();
  });

  it('has 15 clusters, each with info and a thematic brain region', () => {
    expect(SKILL_CLUSTERS).toHaveLength(15);
    for (const cluster of SKILL_CLUSTERS) {
      expect(CLUSTER_INFO[cluster].title.length).toBeGreaterThan(0);
      expect(BRAIN_REGION_BY_CLUSTER[cluster].length).toBeGreaterThan(0);
    }
  });

  it('keeps content ids strict while accepting opaque lesson item ids', () => {
    const lessonItemIdSchema = (contractExports as Record<string, unknown>).LessonItemIdSchema;

    expect(ContentIdSchema.safeParse('ALG-GRAPH-ENTRY-01').success).toBe(false);
    expect(lessonItemIdSchema).toBeDefined();
    if (typeof lessonItemIdSchema === 'object' && lessonItemIdSchema !== null) {
      const safeParse = (
        lessonItemIdSchema as { safeParse: (value: unknown) => { success: boolean } }
      ).safeParse;
      expect(safeParse('ALG-GRAPH-ENTRY-01').success).toBe(true);
    }
  });

  it('validates a well-formed attempt event and rejects a malformed one', () => {
    const now = UtcTimestampSchema.parse(new Date().toISOString());
    const good = {
      eventId: newEventId(),
      learnerId: newLearnerId(),
      idempotencyKey: newIdempotencyKey(),
      occurredAt: now,
      contentRelease: 'synthetic-2026.07',
      policies: [{ policyId: 'diagnostic', version: 'provisional-v1' }],
      type: 'attempt_submitted' as const,
      payload: {
        questionId: 'bb1-enzyme-fixture-0001',
        itemVersion: 1,
        chosenChoiceId: 'B',
        elapsedMs: 42000,
        assistanceLevel: 'A0' as const,
        contentBearingHintUsed: false,
        answerChanges: 0,
        isDiagnosticRetry: false,
      },
    };
    expect(() => AttemptSubmittedSchema.parse(good)).not.toThrow();
    expect(() => LearnerEventSchema.parse(good)).not.toThrow();

    const bad = { ...good, payload: { ...good.payload, chosenChoiceId: 'ZZ' } };
    expect(() => LearnerEventSchema.parse(bad)).toThrow();
  });

  it('preserves accepted learner events and strictly accepts lesson observations in the event union', () => {
    const acceptedAttempt = {
      sequence: 4,
      acceptedAt: '2026-07-27T12:00:01.000Z',
      event: {
        eventId: '11111111-1111-4111-8111-111111111111',
        learnerId: '22222222-2222-4222-8222-222222222222',
        idempotencyKey: '33333333-3333-4333-8333-333333333333',
        occurredAt: '2026-07-27T12:00:00.000Z',
        contentRelease: 'release-created-after-contract',
        policies: [{ policyId: 'mastery', version: 'revision-created-after-contract' }],
        type: 'attempt_submitted' as const,
        payload: {
          questionId: 'question-created-after-contract',
          itemVersion: 1,
          chosenChoiceId: 'A',
          elapsedMs: 42_000,
          assistanceLevel: 'A0' as const,
          contentBearingHintUsed: false,
          answerChanges: 0,
          isDiagnosticRetry: false,
        },
      },
    };
    const lessonObservationSchema = (contractExports as Record<string, unknown>)
      .AcceptedLessonObservationSchema;
    const acceptedLessonObservation = {
      observationId: '44444444-4444-4444-8444-444444444444',
      eventId: '55555555-5555-4555-8555-555555555555',
      learnerId: '22222222-2222-4222-8222-222222222222',
      idempotencyKey: '66666666-6666-4666-8666-666666666666',
      binding: {
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
        firstAttemptImmutable: true,
        authoredAssistanceAffordances: ['A0'],
        candidateEvidenceModes: ['INDEPENDENT'],
        reasoningOperation: 'EXPLAIN',
        representationId: null,
        changedDimensions: [],
        learnerSafeItemRef: 'learner-safe-item-reference',
        serverScoringAuthorityRef: 'trusted-scorer-reference',
      },
      response: {
        questionId: 'question-created-after-contract',
        itemBindingId: 'binding-created-after-contract',
        bindingVersion: 'draft-version-string',
        attemptIndex: 1,
        isRetry: false,
        isDiagnosticRetry: false,
        response: {
          kind: 'MULTIPLE_CHOICE',
          chosenChoiceId: 'A',
        },
        omitted: false,
        elapsedMs: 42_000,
        answerChanges: 0,
        assistanceLevel: 'A0',
        contentBearingHintUsed: false,
        revealUsed: false,
        occurredAt: '2026-07-27T12:00:00.000Z',
      },
      bindingVersion: 'draft-version-string',
      serverItemVersion: 17,
      outcome: 'correct',
      scoringValid: true,
      acceptedAt: '2026-07-27T12:00:01.000Z',
      sequence: 5,
      contentRelease: 'release-created-after-contract',
      policies: [{ policyId: 'mastery', version: 'revision-created-after-contract' }],
    };

    expect(AcceptedEventSchema.safeParse(acceptedAttempt).success).toBe(true);
    expect(
      AcceptedEventSchema.parse({
        ...acceptedAttempt,
        ingestedBy: 'worker-1',
      }),
    ).toEqual(acceptedAttempt);
    expect(lessonObservationSchema).toBeDefined();
    expect(AcceptedEventSchema.safeParse(acceptedLessonObservation).success).toBe(true);
    expect(
      AcceptedEventSchema.safeParse({
        ...acceptedLessonObservation,
        answerKey: 'protected',
      }).success,
    ).toBe(false);

    const isAcceptedLessonObservation = (contractExports as Record<string, unknown>)
      .isAcceptedLessonObservation;
    expect(isAcceptedLessonObservation).toBeTypeOf('function');
    if (typeof isAcceptedLessonObservation === 'function') {
      expect(isAcceptedLessonObservation(AcceptedEventSchema.parse(acceptedAttempt))).toBe(false);
      expect(
        isAcceptedLessonObservation(AcceptedEventSchema.parse(acceptedLessonObservation)),
      ).toBe(true);
    }
  });
});

describe('learner-facing decision reasons', () => {
  /**
   * The codes `MasteryReasonSchema` used to enumerate. Every one of them names
   * an ATTAINMENT RANK from the old evidence ladder, and an attainment rank is a
   * capability claim. Only the BKT estimate may make a capability claim, so
   * re-adding any of these — even alongside the evidence codes — restores the
   * second learner-facing mastery scale the seam exists to remove.
   */
  const RETIRED_LADDER_RANK_CODES = [
    'DEPENDS_ON_INSTRUCTION',
    'INDEPENDENT_ACHIEVED',
    'TRANSFER_ACHIEVED',
    'RETAINED_ACHIEVED',
    'STRONG_ACHIEVED',
  ];

  it('rejects every retired ladder-rank code, naming the offending value', () => {
    for (const code of RETIRED_LADDER_RANK_CODES) {
      expect(EVIDENCE_REASON_CODES as readonly string[]).not.toContain(code);

      const rejected = DecisionReasonViewSchema.safeParse({ code });
      expect(rejected.success).toBe(false);
      const issue = rejected.error?.issues[0];
      expect(issue?.code).toBe('invalid_enum_value');
      expect(issue?.path).toEqual(['code']);
      expect(issue).toMatchObject({ received: code });
    }
  });

  it('publishes evidence-warrant vocabulary only — no attainment ranks', () => {
    for (const code of EVIDENCE_REASON_CODES) {
      expect(code.endsWith('_ACHIEVED')).toBe(false);
      expect(DecisionReasonViewSchema.parse({ code })).toEqual({ code });
    }
    // Gaps are the point of the vocabulary: they say what is missing, which no
    // rank can express.
    expect(EVIDENCE_REASON_CODES.filter((code) => code.endsWith('_GAP')).length).toBeGreaterThan(0);
  });

  it('rejects an unrecognized code instead of passing it through', () => {
    expect(DecisionReasonViewSchema.safeParse({ code: 'SOMETHING_NEW' }).success).toBe(false);
    expect(DecisionReasonViewSchema.safeParse({ code: 'EVIDENCE_GAP', extra: 'x' }).success).toBe(
      false,
    );
  });
});
