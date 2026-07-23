import { describe, expect, it } from 'vitest';
import {
  LessonActionCommandSchema,
  LessonRunEventSchema,
  LessonRunLineageSchema,
  LessonRunPinsSchema,
  LessonRunStateSchema,
} from './index';

const pins = LessonRunPinsSchema.parse({
  runId: '11111111-1111-4111-8111-111111111111',
  learnerId: '88888888-8888-4888-8888-888888888888',
  streamId: '99999999-9999-4999-8999-999999999999',
  taskInstanceId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  taskKind: 'lesson_initial_instruction',
  targetKcId: 'V3-KC-SYNTH-CONTRACT',
  plannerResolutionId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  evidenceCutoff: '2026-07-23T05:59:00.000Z',
  lessonId: 'V3-LES-SYNTH-CONTRACT',
  definitionVersion: '4.0.0-test.1',
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
  it('keeps aggregate stream concurrency separate from the public lesson run version', () => {
    const command = LessonActionCommandSchema.parse({
      envelope: {
        eventId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        idempotencyKey: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        occurredAt: '2026-07-23T19:02:00.000Z',
        expectedStreamVersion: 41,
        contentRelease: pins.contentRelease,
        taskInstanceId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      },
      runId: pins.runId,
      expectedRunVersion: 7,
      action: { type: 'pause' },
    });

    expect(command.envelope.expectedStreamVersion).toBe(41);
    expect(command.expectedRunVersion).toBe(7);
  });

  it('does not permit a learner command to claim lesson delivery completion', () => {
    expect(
      LessonActionCommandSchema.safeParse({
        envelope: {
          eventId: '19191919-1919-4191-8191-191919191919',
          idempotencyKey: '20202020-2020-4202-8202-202020202020',
          occurredAt: '2026-07-23T19:02:00.000Z',
          expectedStreamVersion: 41,
          contentRelease: pins.contentRelease,
          taskInstanceId: pins.taskInstanceId,
        },
        runId: pins.runId,
        expectedRunVersion: 7,
        action: { type: 'lesson_delivery_completed' },
      }).success,
    ).toBe(false);
  });

  it('validates an append-only, version-pinned typed event', () => {
    const parsed = LessonRunEventSchema.parse({
      schemaVersion: '2.0',
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
      schemaVersion: '2.0',
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

  it('keeps validity incidents void and learner omissions explicitly not-sure', () => {
    const base = {
      schemaVersion: '2.0',
      eventId: '26262626-2626-4262-8262-262626262626',
      idempotencyKey: '27272727-2727-4272-8272-272727272727',
      ...pins,
      sequence: 0,
      occurredAt: '2026-07-23T06:00:00.000Z',
      type: 'lesson_response_evaluated',
      payload: {
        kcId: pins.targetKcId,
        activityId: 'V3-ACT-SYNTH-CONTRACT',
        familyId: 'synthetic-family',
        responseDigest: 'c'.repeat(64),
        responseKind: 'omission',
        elapsedMs: null,
        assistanceLevel: 'A0',
        assisted: false,
        revealed: false,
        diagnosticSignalIds: [],
        objectiveFeatureIds: [],
        authorityFeedback: [
          {
            activityId: 'V3-ACT-SYNTH-CONTRACT',
            tone: 'information',
            message: 'Synthetic administration record.',
          },
        ],
      },
    };

    expect(
      LessonRunEventSchema.safeParse({
        ...base,
        payload: {
          ...base.payload,
          outcome: null,
          omissionType: 'inaccessible',
          validForEvidence: false,
        },
      }).success,
    ).toBe(true);
    expect(
      LessonRunEventSchema.safeParse({
        ...base,
        payload: {
          ...base.payload,
          outcome: 'incorrect',
          omissionType: 'inaccessible',
          validForEvidence: true,
        },
      }).success,
    ).toBe(false);
    expect(
      LessonRunEventSchema.safeParse({
        ...base,
        payload: {
          ...base.payload,
          outcome: 'not_sure',
          omissionType: 'intentional_skip',
          validForEvidence: true,
        },
      }).success,
    ).toBe(true);
  });

  it('cannot represent an aggregate mastery field in strict run state', () => {
    const state = LessonRunStateSchema.parse({
      schemaVersion: '2.0',
      pins,
      lineage: {
        rootRunId: pins.runId,
        parentRunId: null,
        generation: 0,
        reentryHistory: [],
        kcReentryCounts: [],
        inheritedFromRunIds: [],
        inheritedExposure: { sourceRunIds: [], families: [] },
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
      validatedPlannerInstruction: null,
      plannerResolutionHistory: [],
      plannerResolutionRejectionCodes: [],
      returnSupportToPlanner: false,
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
      repairReentry: {
        failedExitFunction: null,
        originState: null,
        originCheckpointId: null,
        originExitPairId: null,
        preservedSuccesses: [],
        preservationDecision: null,
        invalidationReason: null,
        reentryState: null,
        reentryCheckpointId: null,
      },
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
      currentCheckpoint: null,
      kcCheckpoints: [],
      checkpointCommits: [],
      timing: {
        shellStartedAt: null,
        currentKcStartedAt: null,
        observations: [],
      },
      resumeStatus: null,
      pauseReason: null,
      plannerReentryRequired: false,
      handoffRunId: null,
      handoffPins: null,
      handoffLineage: null,
      handoffResolution: null,
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

  it('derives per-KC reentry counts exactly from immutable lineage history', () => {
    const firstChildRunId = '44444444-4444-4444-8444-444444444444';
    const secondChildRunId = '55555555-5555-4555-8555-555555555555';
    const valid = {
      rootRunId: pins.runId,
      parentRunId: firstChildRunId,
      generation: 2,
      reentryHistory: [
        { runId: firstChildRunId, targetKcId: 'V3-KC-SYNTH-FIRST' },
        { runId: secondChildRunId, targetKcId: 'V3-KC-SYNTH-SECOND' },
      ],
      kcReentryCounts: [
        { kcId: 'V3-KC-SYNTH-FIRST', count: 1 },
        { kcId: 'V3-KC-SYNTH-SECOND', count: 1 },
      ],
      inheritedFromRunIds: [pins.runId, firstChildRunId],
      inheritedExposure: {
        sourceRunIds: [pins.runId, firstChildRunId],
        families: [],
      },
      reviewedContentPins: [
        {
          lessonId: pins.lessonId,
          definitionVersion: pins.definitionVersion,
          reviewedContentHash: pins.reviewedContentHash,
        },
      ],
    };

    expect(LessonRunLineageSchema.safeParse(valid).success).toBe(true);
    expect(
      LessonRunLineageSchema.safeParse({
        ...valid,
        kcReentryCounts: [{ kcId: 'V3-KC-SYNTH-SECOND', count: 1 }],
      }).success,
    ).toBe(false);
  });
});
