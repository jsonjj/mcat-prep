import { describe, expect, it } from 'vitest';
import { LessonRunEventSchema, LessonRunPinsSchema, LessonRunStateSchema } from './index';

const pins = LessonRunPinsSchema.parse({
  runId: '11111111-1111-4111-8111-111111111111',
  lessonId: 'V3-LES-SYNTH-CONTRACT',
  definitionVersion: '3.0.0-test.1',
  reviewedContentHash: 'a'.repeat(64),
  contentRelease: 'synthetic-contract-test',
  registry: {
    manifestSchemaVersion: 'mcat-v3-lesson-authoring-manifest-2',
    artifactId: 'synthetic-contract-manifest',
    sha256: 'b'.repeat(64),
    phase0FreezeId: 'synthetic-phase-0-freeze',
    canonicalFreezeId: 'synthetic-canonical-freeze',
    graphFreezeId: 'synthetic-graph-freeze',
    sequenceFreezeId: 'synthetic-sequence-freeze',
  },
  policies: [{ policyId: 'lesson-runtime', version: 'v3-foundation-1' }],
});

describe('lesson run contracts', () => {
  it('validates an append-only, version-pinned typed event', () => {
    const parsed = LessonRunEventSchema.parse({
      schemaVersion: '1.1',
      eventId: '22222222-2222-4222-8222-222222222222',
      idempotencyKey: '33333333-3333-4333-8333-333333333333',
      ...pins,
      sequence: 0,
      occurredAt: '2026-07-23T06:00:00.000Z',
      type: 'lesson_run_started',
      payload: {},
    });

    expect(parsed.type).toBe('lesson_run_started');
    expect(parsed.definitionVersion).toBe(pins.definitionVersion);
    expect(parsed.reviewedContentHash).toBe(pins.reviewedContentHash);
    expect(parsed.registry).toEqual(pins.registry);
  });

  it('rejects untyped payload fields and malformed canonical ids', () => {
    const result = LessonRunEventSchema.safeParse({
      schemaVersion: '1.1',
      eventId: '22222222-2222-4222-8222-222222222222',
      idempotencyKey: '33333333-3333-4333-8333-333333333333',
      ...pins,
      lessonId: 'lesson-lowercase',
      sequence: 0,
      occurredAt: '2026-07-23T06:00:00.000Z',
      type: 'lesson_run_started',
      payload: { arbitrary: true },
    });

    expect(result.success).toBe(false);
  });

  it('cannot represent an aggregate mastery field in strict run state', () => {
    const state = LessonRunStateSchema.parse({
      schemaVersion: '1.1',
      pins,
      lineage: {
        rootRunId: pins.runId,
        parentRunId: null,
        generation: 0,
        inheritedFromRunIds: [],
        reviewedContentPins: [
          {
            lessonId: pins.lessonId,
            definitionVersion: pins.definitionVersion,
            reviewedContentHash: pins.reviewedContentHash,
          },
        ],
      },
      status: 'ready',
      currentKcId: 'V3-KC-SYNTH-CONTRACT',
      currentActivityId: 'V3-ACT-SYNTH-CONTRACT',
      phase: 'enter_routing',
      route: null,
      sequenceActivityIds: ['V3-ACT-SYNTH-CONTRACT'],
      sequencePosition: 0,
      sequencePurpose: 'entry',
      assistanceLevel: 'A3',
      consecutiveUnsupportedSuccesses: 0,
      completionContext: null,
      completionAttemptCounts: { A3: 0, A2: 0, A1: 0, A0: 0 },
      completionUsedActivityIds: [],
      completionA0Successes: 0,
      completionReadyForExit: false,
      repairCycles: 0,
      exitedKcIds: [],
      signals: [],
      objectiveFeatures: [],
      exposures: [],
      activePresentation: null,
      lastResponse: null,
      sealedExitResults: [],
      activeExitPairId: null,
      usedExitPairIds: [],
      visibleAssistanceLevel: null,
      feedback: null,
      groupedFeedback: null,
      authorityPrivateFeedback: { sealedEntry: [], sealedExit: [] },
      resumeStatus: null,
      pauseReason: null,
      plannerReentryRequired: false,
      handoffRunId: null,
      handoffPins: null,
      handoffLineage: null,
      appliedEventIds: [],
      appliedIdempotencyKeys: [],
      lastSequence: -1,
      invalidIssues: [],
      transitionErrors: [],
    });

    const aggregateState = {
      ...state,
      masteryState: 'strong',
    };

    expect(LessonRunStateSchema.safeParse(aggregateState).success).toBe(false);
  });
});
