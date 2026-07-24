import { describe, expect, it } from 'vitest';
import {
  VectorLessonCommandSchema,
  VectorLessonRunViewSchema,
  VectorLessonStartCommandSchema,
  VectorLessonStartResponseSchema,
  VectorLessonStatusViewSchema,
} from './v3-vector-lesson';

const envelope = {
  eventId: '10000000-0000-4000-8000-000000000001',
  idempotencyKey: '10000000-0000-4000-8000-000000000002',
  occurredAt: '2026-07-23T18:00:00.000Z',
  expectedStreamVersion: 3,
  contentRelease: 'synthetic-2026.07',
  taskInstanceId: '10000000-0000-4000-8000-000000000003',
};

describe('V3-LES-130923 learner API contract', () => {
  it('accepts only the target lesson start command and a server acceptance response', () => {
    expect(
      VectorLessonStartCommandSchema.parse({
        envelope,
        lessonId: 'V3-LES-130923',
      }),
    ).toMatchObject({ lessonId: 'V3-LES-130923' });

    expect(
      VectorLessonStartCommandSchema.safeParse({
        envelope,
        lessonId: 'V3-LES-789208',
      }).success,
    ).toBe(false);

    expect(
      VectorLessonStartResponseSchema.parse({
        runId: '10000000-0000-4000-8000-000000000004',
        disposition: 'STARTED',
        path: '/app/lessons/vectors-and-trigonometry',
        streamVersion: 4,
      }),
    ).toMatchObject({ disposition: 'STARTED' });
  });

  it('keeps route and assistance codes out of learner run views', () => {
    const parsed = VectorLessonRunViewSchema.parse({
      lessonTitle: 'Vectors and Trigonometry',
      runId: '10000000-0000-4000-8000-000000000004',
      state: 'IN_PROGRESS',
      progress: {
        currentPart: 1,
        totalParts: 3,
        currentPartLabel: 'Resolve and combine vectors',
        stageLabel: 'Focus now',
      },
      screen: {
        kind: 'CONTENT',
        screenToken: 'screen-opaque-1',
        heading: 'Focus now',
        body: ['Preserve direction as a sign before combining components.'],
        primaryActionLabel: 'Continue',
        visual: null,
      },
    });

    const serialized = JSON.stringify(parsed);
    expect(serialized).not.toMatch(/STANDARD|CONCISE|MISCONCEPTION|PREREQUISITE_SUPPORT/);
    expect(serialized).not.toMatch(/"A[0-3]"/);
    expect(serialized).not.toMatch(/V3-(?:KC|LES)-/);
  });

  it('makes precommit question DTOs incapable of carrying answer fields or feedback', () => {
    const question = {
      lessonTitle: 'Vectors and Trigonometry',
      runId: '10000000-0000-4000-8000-000000000004',
      state: 'IN_PROGRESS',
      progress: {
        currentPart: 1,
        totalParts: 3,
        currentPartLabel: 'Resolve and combine vectors',
        stageLabel: 'Final check',
      },
      screen: {
        kind: 'QUESTION',
        screenToken: 'screen-opaque-2',
        heading: 'Final check',
        prompt: 'A displacement is 6 east, then 4 west. What is the horizontal result?',
        choices: [
          { id: 'A', text: '2 east' },
          { id: 'B', text: '10 east' },
          { id: 'C', text: '2 west' },
          { id: 'D', text: '10 west' },
        ],
        primaryActionLabel: 'Check my answer',
        supportActionLabel: null,
        support: null,
        visual: null,
      },
    };
    expect(VectorLessonRunViewSchema.safeParse(question).success).toBe(true);
    expect(
      VectorLessonRunViewSchema.safeParse({
        ...question,
        screen: {
          ...question.screen,
          correctChoiceId: 'A',
          rationale: 'Server-only before commitment.',
        },
      }).success,
    ).toBe(false);
  });

  it('allows answer-bearing feedback only in the post-commit feedback variant', () => {
    expect(
      VectorLessonRunViewSchema.parse({
        lessonTitle: 'Vectors and Trigonometry',
        runId: '10000000-0000-4000-8000-000000000004',
        state: 'IN_PROGRESS',
        progress: {
          currentPart: 1,
          totalParts: 3,
          currentPartLabel: 'Resolve and combine vectors',
          stageLabel: 'Feedback',
        },
        screen: {
          kind: 'FEEDBACK',
          screenToken: 'screen-opaque-3',
          heading: 'Check the component signs',
          outcome: 'TRY_A_DIFFERENT_ANGLE',
          body: ['The westward component must stay negative before the components combine.'],
          primaryActionLabel: 'Review the model',
        },
      }).screen.kind,
    ).toBe('FEEDBACK');
  });

  it('represents a paused run without exposing enabled lesson actions', () => {
    expect(
      VectorLessonRunViewSchema.parse({
        lessonTitle: 'Vectors and Trigonometry',
        runId: '10000000-0000-4000-8000-000000000004',
        state: 'PAUSED',
        progress: {
          currentPart: 2,
          totalParts: 3,
          currentPartLabel: 'Use basic trigonometry',
          stageLabel: 'Paused',
        },
        screen: {
          kind: 'PAUSED',
          screenToken: 'screen-paused',
          heading: 'This lesson is paused.',
          body: ['Continue from the curriculum to restore this exact checkpoint.'],
          primaryActionLabel: 'Back to curriculum',
        },
      }).state,
    ).toBe('PAUSED');
  });

  it('uses strict idempotent lesson commands and explicit availability states', () => {
    expect(
      VectorLessonCommandSchema.parse({
        envelope,
        runId: '10000000-0000-4000-8000-000000000004',
        screenToken: 'screen-opaque-2',
        action: { type: 'SUBMIT_RESPONSE', choiceId: 'A' },
      }),
    ).toMatchObject({ action: { type: 'SUBMIT_RESPONSE' } });
    expect(
      VectorLessonCommandSchema.safeParse({
        envelope,
        runId: '10000000-0000-4000-8000-000000000004',
        screenToken: 'screen-opaque-2',
        action: { type: 'SUBMIT_RESPONSE', choiceId: 'A', answerKey: 'A' },
      }).success,
    ).toBe(false);

    expect(
      VectorLessonStatusViewSchema.parse({
        availability: 'AVAILABLE',
        runState: 'IN_PROGRESS',
        actionLabel: 'Continue',
      }),
    ).toEqual({
      availability: 'AVAILABLE',
      runState: 'IN_PROGRESS',
      actionLabel: 'Continue',
    });
    expect(
      VectorLessonStatusViewSchema.safeParse({
        availability: 'AVAILABLE',
        runState: 'BLOCKED',
        actionLabel: 'Continue',
      }).success,
    ).toBe(false);
  });
});
