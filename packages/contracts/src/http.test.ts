import { describe, expect, it } from 'vitest';
import {
  AttemptCommandSchema,
  CommandEnvelopeSchema,
  GoalCommandSchema,
  GuestBootstrapResponseSchema,
  HTTP_API,
  HttpApiErrorSchema,
  LearnerSafeQuestionSchema,
  LearnerSnapshotSchema,
  PostRevealResponseSchema,
  PracticeResultSchema,
  StudyStepViewSchema,
} from './index';

const envelope = {
  eventId: '11111111-1111-4111-8111-111111111111',
  idempotencyKey: '22222222-2222-4222-8222-222222222222',
  occurredAt: '2026-07-22T00:00:00.000Z',
  expectedStreamVersion: 0,
  contentRelease: 'synthetic-2026.07',
  taskInstanceId: '33333333-3333-4333-8333-333333333333',
};

const learnerSafeQuestion = {
  id: 'q-enzyme-synthetic',
  version: 1,
  section: 'bb',
  skill_cluster: 'BB1',
  internal_skill_ids: ['bb1-enzyme-inhibition'],
  template_tags: ['K'],
  format: 'discrete_mcq',
  stimulus_id: null,
  stem: 'Which synthetic observation is consistent with the stated model?',
  choices: [
    { id: 'A', text: 'Observation A' },
    { id: 'B', text: 'Observation B' },
    { id: 'C', text: 'Observation C' },
    { id: 'D', text: 'Observation D' },
  ],
  estimated_seconds: 75,
  media_ids: [],
  family_id: 'synthetic-enzyme-family',
};

describe('AWS v1 learner HTTP contracts', () => {
  it('requires client-generated idempotency and event identity', () => {
    const parsed = CommandEnvelopeSchema.safeParse({
      eventId: envelope.eventId,
      occurredAt: envelope.occurredAt,
    });

    expect(parsed.success).toBe(false);
  });

  it('never accepts learner ownership in a command envelope', () => {
    expect(CommandEnvelopeSchema.keyof().options).not.toContain('learnerId');
    expect(
      CommandEnvelopeSchema.safeParse({ ...envelope, learnerId: envelope.eventId }).success,
    ).toBe(false);
  });

  it('accepts only a complete strict command envelope', () => {
    expect(CommandEnvelopeSchema.parse(envelope)).toEqual(envelope);
    expect(CommandEnvelopeSchema.safeParse({ ...envelope, sequence: 1 }).success).toBe(false);
  });

  it('defines strict goal and attempt commands without an ownership field', () => {
    expect(
      GoalCommandSchema.parse({
        envelope,
        goal: { testDate: null, targetScore: 511, minutesPerWeek: 420 },
      }),
    ).toEqual({
      envelope,
      goal: { testDate: null, targetScore: 511, minutesPerWeek: 420 },
    });
    expect(
      AttemptCommandSchema.parse({
        envelope,
        questionId: 'q-enzyme-synthetic',
        choiceId: 'A',
        elapsedMs: 42_000,
        assistanceLevel: 'A0',
        contentBearingHintUsed: false,
        answerChanges: 0,
        isDiagnosticRetry: false,
      }),
    ).toMatchObject({ questionId: 'q-enzyme-synthetic', choiceId: 'A' });
    expect(
      AttemptCommandSchema.safeParse({
        envelope,
        learnerId: envelope.eventId,
        questionId: 'q-enzyme-synthetic',
        choiceId: 'A',
        elapsedMs: 42_000,
        assistanceLevel: 'A0',
        contentBearingHintUsed: false,
        answerChanges: 0,
        isDiagnosticRetry: false,
      }).success,
    ).toBe(false);
  });

  it('accepts an MCAT test date as a calendar date, not a timestamp', () => {
    const command = {
      envelope,
      goal: { testDate: '2026-09-12', targetScore: 511, minutesPerWeek: 420 },
    };
    expect(GoalCommandSchema.safeParse(command).success).toBe(true);
    expect(
      GoalCommandSchema.safeParse({
        ...command,
        goal: { ...command.goal, testDate: '2026-09-12T00:00:00.000Z' },
      }).success,
    ).toBe(false);
    expect(
      GoalCommandSchema.safeParse({
        ...command,
        goal: { ...command.goal, testDate: '2026-02-30' },
      }).success,
    ).toBe(false);
  });

  it('rejects protected and unknown fields from learner-safe questions at every object level', () => {
    expect(LearnerSafeQuestionSchema.parse(learnerSafeQuestion)).toEqual(learnerSafeQuestion);
    expect(
      LearnerSafeQuestionSchema.safeParse({
        ...learnerSafeQuestion,
        correct_choice_id: 'A',
      }).success,
    ).toBe(false);
    expect(
      LearnerSafeQuestionSchema.safeParse({
        ...learnerSafeQuestion,
        choices: learnerSafeQuestion.choices.map((choice, index) =>
          index === 0 ? { ...choice, rationale: 'protected' } : choice,
        ),
      }).success,
    ).toBe(false);
  });

  it('permits answer material only in explicit post-reveal response schemas', () => {
    const reveal = {
      correctChoiceId: 'A',
      correctRationale: 'Authorized after the reveal boundary.',
      choiceRationales: {
        A: 'Authorized explanation A.',
        B: 'Authorized explanation B.',
        C: 'Authorized explanation C.',
        D: 'Authorized explanation D.',
      },
      // Which option was picked, so the reveal refutes that one and not the key in
      // general. Nullable (Reveal Now has no attempt) but never omitted, so a
      // server that forgets it fails the contract instead of silently degrading to
      // a generic explanation.
      chosenChoiceId: 'B',
    };
    expect(
      StudyStepViewSchema.safeParse({
        kind: 'question',
        phase: 'independent',
        sub: 'reveal',
        question: learnerSafeQuestion,
        stimulus: null,
        hint: null,
        reveal,
        skillId: 'bb1-enzyme-inhibition',
      }).success,
    ).toBe(true);
    expect(
      StudyStepViewSchema.safeParse({
        kind: 'question',
        phase: 'independent',
        sub: 'answering',
        question: learnerSafeQuestion,
        stimulus: null,
        hint: null,
        reveal,
        skillId: 'bb1-enzyme-inhibition',
      }).success,
    ).toBe(false);
    expect(
      PracticeResultSchema.safeParse({
        correct: true,
        correctChoiceId: 'A',
        rationale: 'Authorized after submission.',
        choiceRationale: 'Authorized explanation A.',
      }).success,
    ).toBe(true);
    const { chosenChoiceId: _omitted, ...withoutChosen } = reveal;
    expect(PostRevealResponseSchema.safeParse(withoutChosen).success).toBe(false);
    expect(PostRevealResponseSchema.safeParse({ ...reveal, chosenChoiceId: null }).success).toBe(
      true,
    );
  });

  it('requires authoritative stream metadata in bootstrap and snapshot responses', () => {
    const bootstrap = {
      learnerId: envelope.eventId,
      accountState: 'guest',
      bankStatus: 'loaded',
      contentRelease: envelope.contentRelease,
      apiVersion: 'v1',
      onboardingComplete: false,
      serverTime: envelope.occurredAt,
      streamVersion: 0,
      csrfToken: 'csrf-token-with-at-least-32-characters',
    };
    expect(GuestBootstrapResponseSchema.safeParse(bootstrap).success).toBe(true);
    expect(
      GuestBootstrapResponseSchema.safeParse({ ...bootstrap, streamVersion: undefined }).success,
    ).toBe(false);

    const snapshot = {
      streamVersion: 0,
      contentRelease: envelope.contentRelease,
      today: null,
      session: { kind: 'locked', reason: 'Finish onboarding.' },
      masteryMap: [],
      errorLog: [],
      errorPatterns: [],
    };
    expect(LearnerSnapshotSchema.safeParse(snapshot).success).toBe(true);
    expect(
      LearnerSnapshotSchema.safeParse({ ...snapshot, learnerId: envelope.eventId }).success,
    ).toBe(false);
  });

  it('uses strict structured errors and stable endpoint metadata', () => {
    expect(
      HttpApiErrorSchema.parse({
        code: 'stream_conflict',
        message: 'The learner stream changed.',
        requestId: 'request-123',
        retryable: false,
        currentStreamVersion: 4,
      }),
    ).toMatchObject({ code: 'stream_conflict', currentStreamVersion: 4 });
    expect(
      HttpApiErrorSchema.safeParse({
        code: 'forbidden',
        message: 'Forbidden.',
        requestId: 'request-123',
        retryable: false,
        details: { protected: 'not allowed' },
      }).success,
    ).toBe(false);

    expect(HTTP_API.bootstrap).toMatchObject({ method: 'POST', path: '/v1/bootstrap' });
    expect(HTTP_API.goal).toMatchObject({ method: 'PUT', path: '/v1/profile/goal' });
    expect(HTTP_API.today).toMatchObject({ method: 'GET', path: '/v1/plan/today' });
    expect(HTTP_API.session).toMatchObject({ method: 'GET', path: '/v1/learning/session' });
    expect(HTTP_API.attempt).toMatchObject({ method: 'POST', path: '/v1/attempts' });
    expect(HTTP_API.sync).toMatchObject({ method: 'POST', path: '/v1/sync' });
  });
});
