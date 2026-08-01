import { describe, expect, it } from 'vitest';
import {
  NormalizedLessonCommandSchema,
  NormalizedLessonRunViewSchema,
  NormalizedLessonStartCommandSchema,
  NormalizedLessonStartResponseSchema,
  NormalizedLessonStatusViewSchema,
} from './lesson-delivery';

const envelope = {
  eventId: '10000000-0000-4000-8000-000000000001',
  idempotencyKey: '10000000-0000-4000-8000-000000000002',
  occurredAt: '2026-07-30T18:00:00.000Z',
  expectedStreamVersion: 3,
  contentRelease: 'synthetic-2026.07',
  taskInstanceId: '10000000-0000-4000-8000-000000000003',
};

const runId = '10000000-0000-4000-8000-000000000004';

describe('normalized-engine lesson delivery contract', () => {
  it('accepts any catalog lesson id shape but rejects malformed ids and extra fields', () => {
    for (const lessonId of ['V3-LES-789208', 'V3-LES-844372']) {
      expect(NormalizedLessonStartCommandSchema.parse({ envelope, lessonId })).toMatchObject({
        lessonId,
      });
    }
    // Not a `V3-LES-######` id.
    expect(
      NormalizedLessonStartCommandSchema.safeParse({ envelope, lessonId: 'V3-KC-789208' }).success,
    ).toBe(false);
    // Strict: no smuggled fields on the start command.
    expect(
      NormalizedLessonStartCommandSchema.safeParse({
        envelope,
        lessonId: 'V3-LES-789208',
        answerKey: 'A',
      }).success,
    ).toBe(false);

    expect(
      NormalizedLessonStartResponseSchema.parse({
        runId,
        disposition: 'RESUMED',
        streamVersion: 4,
      }),
    ).toMatchObject({ disposition: 'RESUMED' });
  });

  it('keeps ids, tokens, and answer material out of learner run views', () => {
    const parsed = NormalizedLessonRunViewSchema.parse({
      runId,
      lessonId: 'V3-LES-844372',
      status: 'IN_PROGRESS',
      paused: false,
      kcId: 'V3-KC-452593',
      kcOrdinal: 1,
      totalKcs: 3,
      screen: {
        kind: 'QUESTION',
        itemId: 'ALG-GRAPH-CHANGED-01',
        kcId: 'V3-KC-452593',
        heading: 'Predict the intercept',
        prompt: 'Which line matches the described change?',
        responseType: 'single_select',
        choices: [
          { choiceId: 'opt-0', text: 'Shift up two units' },
          { choiceId: 'opt-1', text: 'Reflect across the x-axis' },
        ],
      },
    });
    // The learner-facing payload carries no answer surface at all.
    expect(JSON.stringify(parsed)).not.toMatch(/correctChoiceId|correct_option_index|rationale|answerKey/i);
  });

  it('makes a precommit question screen incapable of carrying an answer key', () => {
    const view = {
      runId,
      lessonId: 'V3-LES-789208',
      status: 'IN_PROGRESS',
      paused: false,
      kcId: 'V3-KC-399019',
      kcOrdinal: 1,
      totalKcs: 4,
      screen: {
        kind: 'QUESTION',
        itemId: 'QMS-UNIT-CHANGED-01',
        kcId: 'V3-KC-399019',
        heading: 'Convert and compare',
        prompt: 'Express 2.5 kg in grams.',
        responseType: 'SHORT_RESPONSE',
        choices: [],
      },
    } as const;
    expect(NormalizedLessonRunViewSchema.safeParse(view).success).toBe(true);
    expect(
      NormalizedLessonRunViewSchema.safeParse({
        ...view,
        screen: { ...view.screen, correctChoiceId: 'opt-0', rationale: 'Server-only.' },
      }).success,
    ).toBe(false);
  });

  it('round-trips the terminal and feedback screens without answer bodies', () => {
    for (const screen of [{ kind: 'BLOCKED' }, { kind: 'COMPLETE' }] as const) {
      expect(
        NormalizedLessonRunViewSchema.parse({
          runId,
          lessonId: 'V3-LES-844372',
          status: screen.kind === 'BLOCKED' ? 'BLOCKED' : 'DELIVERY_COMPLETE',
          paused: false,
          kcId: null,
          kcOrdinal: null,
          totalKcs: 3,
          screen,
        }).screen.kind,
      ).toBe(screen.kind);
    }
    expect(
      NormalizedLessonRunViewSchema.parse({
        runId,
        lessonId: 'V3-LES-844372',
        status: 'IN_PROGRESS',
        paused: false,
        kcId: 'V3-KC-452593',
        kcOrdinal: 2,
        totalKcs: 3,
        screen: { kind: 'FEEDBACK', itemId: 'ALG-GRAPH-CHANGED-01', outcome: 'INCORRECT' },
      }).screen,
    ).toMatchObject({ kind: 'FEEDBACK', outcome: 'INCORRECT' });
  });

  it('parses the three committed-response encodings and rejects smuggled outcomes', () => {
    const responses = [
      { kind: 'MULTIPLE_CHOICE', choiceId: 'opt-1' },
      { kind: 'MULTIPLE_CHOICE', choiceId: null },
      { kind: 'SHORT', text: '2500 g' },
      { kind: 'CONSTRUCTED', fields: { f0: 'x + y = 10', f1: '(4, 6)' } },
    ] as const;
    for (const response of responses) {
      expect(
        NormalizedLessonCommandSchema.parse({
          envelope,
          action: { type: 'SUBMIT_RESPONSE', response },
        }).action,
      ).toMatchObject({ type: 'SUBMIT_RESPONSE' });
    }
    expect(
      NormalizedLessonCommandSchema.parse({ envelope, action: { type: 'CONTINUE' } }).action.type,
    ).toBe('CONTINUE');

    // The client cannot claim its own correctness: no `correct`/scoring field
    // rides on the response, and an unknown response kind is rejected.
    expect(
      NormalizedLessonCommandSchema.safeParse({
        envelope,
        action: {
          type: 'SUBMIT_RESPONSE',
          response: { kind: 'MULTIPLE_CHOICE', choiceId: 'opt-1', correct: true },
        },
      }).success,
    ).toBe(false);
    expect(
      NormalizedLessonCommandSchema.safeParse({
        envelope,
        action: { type: 'SUBMIT_RESPONSE', response: { kind: 'ESSAY', text: 'x' } },
      }).success,
    ).toBe(false);
  });

  it('uses explicit availability and pre-start states', () => {
    expect(
      NormalizedLessonStatusViewSchema.parse({
        availability: 'AVAILABLE',
        runState: 'NOT_STARTED',
        actionLabel: 'Start',
      }),
    ).toEqual({ availability: 'AVAILABLE', runState: 'NOT_STARTED', actionLabel: 'Start' });
    expect(
      NormalizedLessonStatusViewSchema.parse({
        availability: 'AVAILABLE',
        runState: 'BLOCKED',
        actionLabel: null,
      }).actionLabel,
    ).toBeNull();
    // Strict: no extra fields on the status view.
    expect(
      NormalizedLessonStatusViewSchema.safeParse({
        availability: 'AVAILABLE',
        runState: 'IN_PROGRESS',
        actionLabel: 'Continue',
        progressPercent: 40,
      }).success,
    ).toBe(false);
  });
});
