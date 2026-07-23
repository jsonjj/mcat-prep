import { describe, expect, it } from 'vitest';
import {
  CanonicalLearnerEventSchema,
  canonicalLearnerEventBytes,
  canonicalLearnerEventDigest,
  canonicalLearnerEventJson,
  parseCanonicalLearnerEventWire,
  serializeCanonicalLearnerEvent,
  type CanonicalLearnerEvent,
} from './index';

const event = (): CanonicalLearnerEvent =>
  CanonicalLearnerEventSchema.parse({
    schemaVersion: '1.0',
    streamId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    streamSequence: 7,
    eventId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    eventType: 'ENTRY_ROUTE_DOWNGRADED',
    occurredAt: '2026-07-23T20:00:00.000Z',
    acceptedAt: '2026-07-23T20:00:00.050Z',
    actor: { actorType: 'AUTHORITY', actorId: 'lesson-authority' },
    learnerId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    idempotencyKey: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    causationId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    correlationId: null,
    decisionContext: {
      evidenceCutoff: '2026-07-23T19:59:00.000Z',
      registry: {
        manifestSchemaVersion: 'mcat-v3-lesson-authoring-manifest-2',
        artifactId: 'registry-é',
        sha256: 'a'.repeat(64),
        phase0FreezeId: 'phase-0',
        canonicalFreezeId: 'canonical',
        graphFreezeId: 'graph',
        sequenceFreezeId: 'sequence',
      },
      contentRelease: 'synthetic-release',
      definitionVersion: '4.0.0-test.1',
      reviewedContentHash: 'b'.repeat(64),
      policyVersions: [{ policyId: 'lesson-runtime', version: 'v4' }],
      modelVersions: [],
    },
    payload: {
      runId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
      lessonId: 'V3-LES-SYNTH-WIRE',
      kcId: 'V3-KC-SYNTH-WIRE',
      resolutionId: '11111111-1111-4111-8111-111111111111',
      requestedRoute: 'MISCONCEPTION',
      selectedRoute: 'STANDARD',
      reasonCodes: ['MISCONCEPTION_PROVENANCE_STALE'],
      supportReturnedToPlanner: false,
    },
  });

describe('canonical lesson learner-event wire boundary', () => {
  it('round-trips bijectively with snake_case fields and uppercase enum values', () => {
    const internal = event();
    const wire = serializeCanonicalLearnerEvent(internal);

    expect(wire.event_type).toBe('ENTRY_ROUTE_DOWNGRADED');
    expect(wire).not.toHaveProperty('eventType');
    expect((wire.decision_context as Record<string, unknown>).evidence_cutoff).toBe(
      internal.decisionContext.evidenceCutoff,
    );
    expect(parseCanonicalLearnerEventWire(wire)).toEqual(internal);
    expect(() => parseCanonicalLearnerEventWire(internal)).toThrow();
  });

  it('binds deterministic hashes and replay material to canonical wire bytes', () => {
    const internal = event();
    const wire = serializeCanonicalLearnerEvent(internal);
    const reordered = Object.fromEntries(Object.entries(wire).reverse());

    expect(parseCanonicalLearnerEventWire(reordered)).toEqual(internal);
    expect(canonicalLearnerEventJson(internal)).toBe(
      new TextDecoder().decode(canonicalLearnerEventBytes(internal)),
    );
    expect(canonicalLearnerEventDigest(internal)).toMatch(/^[a-f0-9]{64}$/);
    expect(canonicalLearnerEventDigest(parseCanonicalLearnerEventWire(reordered))).toBe(
      canonicalLearnerEventDigest(internal),
    );
  });

  it('rejects unknown payload fields instead of silently losing semantics', () => {
    const wire = serializeCanonicalLearnerEvent(event());
    (wire.payload as Record<string, unknown>).private_event_type =
      'lesson_route_selected';

    expect(() => parseCanonicalLearnerEventWire(wire)).toThrow();
  });
});
