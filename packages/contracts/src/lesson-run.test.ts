import { describe, expect, it } from 'vitest';
import { LessonRunEventSchema, LessonRunPinsSchema, LessonRunStateSchema } from './index';

const pins = LessonRunPinsSchema.parse({
  runId: '11111111-1111-4111-8111-111111111111',
  lessonId: 'V3-LES-SYNTH-CONTRACT',
  definitionVersion: '3.0.0-test.1',
  contentRelease: 'synthetic-contract-test',
  policies: [{ policyId: 'lesson-runtime', version: 'v3-foundation-1' }],
});

describe('lesson run contracts', () => {
  it('validates an append-only, version-pinned typed event', () => {
    const parsed = LessonRunEventSchema.parse({
      schemaVersion: '1.0',
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
  });

  it('rejects untyped payload fields and malformed canonical ids', () => {
    const result = LessonRunEventSchema.safeParse({
      schemaVersion: '1.0',
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
    const state = {
      schemaVersion: '1.0',
      pins,
      status: 'ready',
      currentKcId: 'V3-KC-SYNTH-CONTRACT',
      currentActivityId: 'V3-ACT-SYNTH-CONTRACT',
      phase: 'enter_routing',
      route: null,
      sequenceActivityIds: ['V3-ACT-SYNTH-CONTRACT'],
      sequencePosition: 0,
      assistanceLevel: 'A3',
      consecutiveUnsupportedSuccesses: 0,
      repairCycles: 0,
      exitedKcIds: [],
      signals: [],
      exposures: [],
      activePresentation: null,
      lastResponse: null,
      sealedExitResults: [],
      visibleAssistanceLevel: null,
      feedback: null,
      resumeStatus: null,
      pauseReason: null,
      plannerReentryRequired: false,
      handoffRunId: null,
      appliedEventIds: [],
      appliedIdempotencyKeys: [],
      lastSequence: -1,
      invalidIssues: [],
      transitionErrors: [],
      masteryState: 'strong',
    };

    expect(LessonRunStateSchema.safeParse(state).success).toBe(false);
  });
});
