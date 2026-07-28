import { describe, expect, it } from 'vitest';
import {
  AcceptedEventSchema,
  AttemptSubmittedSchema,
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
        authoredAssistanceLevel: 'A0',
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
        chosenChoiceId: 'A',
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
