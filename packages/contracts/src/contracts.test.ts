import { describe, expect, it } from 'vitest';
import {
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
});
