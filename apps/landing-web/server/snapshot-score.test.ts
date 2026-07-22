import { describe, expect, it } from 'vitest';
import { snapshotQuestions } from '../src/diagnostic/questions';
import type { ChoiceId, SnapshotReport, SnapshotSubmission } from '../src/diagnostic/types';
import { SNAPSHOT_ITEM_IDS, SnapshotInputError, scoreSnapshot } from './snapshot-score';

const choices: ChoiceId[] = ['A', 'B', 'C', 'D'];

const correctChoices: Record<string, ChoiceId> = {
  'snapshot-q01': 'B',
  'snapshot-q02': 'C',
  'snapshot-q03': 'A',
  'snapshot-q04': 'C',
  'snapshot-q05': 'D',
  'snapshot-q06': 'A',
  'snapshot-q07': 'C',
  'snapshot-q08': 'A',
  'snapshot-q09': 'B',
  'snapshot-q10': 'D',
  'snapshot-q11': 'B',
  'snapshot-q12': 'D',
};

const representativeWrongChoices: Record<string, ChoiceId> = {
  'snapshot-q01': 'A',
  'snapshot-q02': 'A',
  'snapshot-q03': 'B',
  'snapshot-q04': 'A',
  'snapshot-q05': 'A',
  'snapshot-q06': 'B',
  'snapshot-q07': 'A',
  'snapshot-q08': 'B',
  'snapshot-q09': 'A',
  'snapshot-q10': 'A',
  'snapshot-q11': 'A',
  'snapshot-q12': 'A',
};

function submission(overrides: Partial<Record<string, ChoiceId>> = {}): SnapshotSubmission {
  return {
    attemptToken: 'server-test-attempt',
    responses: SNAPSHOT_ITEM_IDS.map((questionId) => ({
      questionId,
      choiceId: overrides[questionId] ?? correctChoices[questionId] ?? 'A',
    })),
  };
}

function allWrongSubmission(): SnapshotSubmission {
  return submission(representativeWrongChoices);
}

function expectCompleteReport(report: SnapshotReport) {
  expect(report.version).toBe('snapshot-pilot-v2');
  expect(report.repeatedPattern.title.trim()).not.toBe('');
  expect(report.repeatedPattern.body.trim()).not.toBe('');
  expect(report.pairedSignals).toHaveLength(6);
  expect(new Set(report.pairedSignals.map((signal) => signal.id)).size).toBe(6);
  for (const signal of report.pairedSignals) {
    expect(signal.label.trim()).not.toBe('');
    expect(signal.title.trim()).not.toBe('');
    expect(signal.body.trim()).not.toBe('');
  }
  expect(report.unknowns.length).toBeGreaterThan(0);
  expect(report.nextDrill.title.trim()).not.toBe('');
  expect(report.nextDrill.body.trim()).not.toBe('');
  expect(report.disclaimer.trim()).not.toBe('');
}

describe('Prep Pattern Snapshot scoring', () => {
  it('keeps all six pair observations visible for an all-keyed profile', () => {
    const report = scoreSnapshot(submission());

    expect(report.repeatedPattern.kind).toBe('positive');
    expect(report.pairedSignals.every((signal) => signal.state === 'limited-positive')).toBe(true);
    expect(report.nextDrill.title).toBe('Check whether the signal transfers');
    expect(report).not.toHaveProperty('score');
    expect(report).not.toHaveProperty('correctAnswers');
    expect(JSON.stringify(report)).not.toContain('sourceCandidateId');
    expect(JSON.stringify(report)).not.toContain('rationale');
    expectCompleteReport(report);
  });

  it('does not invent one repeated cause for a broad all-wrong profile', () => {
    const report = scoreSnapshot(allWrongSubmission());

    expect(report.repeatedPattern.kind).toBe('none');
    expect(report.repeatedPattern.title).toContain('four-item data check');
    expect(report.pairedSignals.every((signal) => signal.state === 'drill-target')).toBe(true);
    expect(report.nextDrill.title).toBe('Choose one of several tied retest areas');
    expect(report.nextDrill.body).toContain('does not rank these tied options');
  });

  it('names friction only when one answer feature repeats at least three times across subpairs', () => {
    const report = scoreSnapshot(
      submission({
        'snapshot-q02': 'A',
        'snapshot-q06': 'C',
        'snapshot-q08': 'B',
        'snapshot-q12': 'C',
      }),
    );

    expect(report.repeatedPattern.kind).toBe('friction');
    expect(report.repeatedPattern.body).toContain(
      'swapped which feature changed and which stayed constant',
    );
    expect(report.repeatedPattern.body).toContain('not why they were selected');
    expect(report.pairedSignals).toHaveLength(6);
    expect(report.nextDrill.title).toBe('Make the evidence structure explicit');
  });

  it('keeps four data misses with unrelated answer features uncertain', () => {
    const report = scoreSnapshot(
      submission({
        'snapshot-q02': 'B',
        'snapshot-q06': 'B',
        'snapshot-q08': 'D',
        'snapshot-q12': 'C',
      }),
    );

    expect(report.repeatedPattern.kind).toBe('none');
    expect(report.repeatedPattern.body).toContain('did not repeat one answer feature');
    expect(report.pairedSignals.find((signal) => signal.id === 'REP-P')?.state).toBe(
      'drill-target',
    );
    expect(report.pairedSignals.find((signal) => signal.id === 'REP-DYN')?.state).toBe(
      'drill-target',
    );
  });

  it('does not call a three-of-four data result a complete repeated signal', () => {
    const report = scoreSnapshot(submission({ 'snapshot-q12': 'C' }));

    expect(report.repeatedPattern.kind).toBe('none');
    expect(report.repeatedPattern.title).toContain('Three matches');
    expect(report.pairedSignals.find((signal) => signal.id === 'REP-DYN')?.state).toBe('mixed');
    expect(report.nextDrill.title).toBe('Retest assay and time-course evidence');
  });

  it('does not let positive data answers override larger non-data weaknesses', () => {
    const report = scoreSnapshot(
      submission({
        'snapshot-q01': 'A',
        'snapshot-q03': 'B',
        'snapshot-q04': 'A',
        'snapshot-q05': 'A',
        'snapshot-q07': 'A',
        'snapshot-q09': 'A',
        'snapshot-q10': 'A',
        'snapshot-q11': 'A',
      }),
    );

    expect(report.repeatedPattern.kind).toBe('positive');
    expect(report.nextDrill.title).toBe('Choose one of several tied retest areas');
    expect(report.nextDrill.body).toContain('qualified argument reasoning');
    expect(report.nextDrill.body).toContain('multi-step quantitative setup');
    expect(report.pairedSignals).toHaveLength(6);
  });

  it.each([
    ['ARG-Q', { 'snapshot-q01': 'A', 'snapshot-q07': 'A' }],
    ['REP-P', { 'snapshot-q02': 'A', 'snapshot-q08': 'B' }],
    ['QUANT-M', { 'snapshot-q03': 'B', 'snapshot-q09': 'A' }],
    ['CAUSE', { 'snapshot-q04': 'A', 'snapshot-q10': 'A' }],
    ['DESIGN', { 'snapshot-q05': 'A', 'snapshot-q11': 'A' }],
    ['REP-DYN', { 'snapshot-q06': 'B', 'snapshot-q12': 'A' }],
  ] as Array<[string, Partial<Record<string, ChoiceId>>]>)(
    'targets a struggling %s pair when every other pair is positive',
    (pairId, overrides) => {
      const report = scoreSnapshot(submission(overrides));
      const signal = report.pairedSignals.find((entry) => entry.id === pairId);

      expect(signal?.state).toBe('drill-target');
      expect(report.nextDrill.title.toLowerCase()).toContain('retest');
      expect(report.nextDrill.body).toContain('Try three more questions');
    },
  );

  it('describes selected-answer features without presenting them as causes', () => {
    const referencePointReport = scoreSnapshot(submission({ 'snapshot-q03': 'B' }));
    const modelReport = scoreSnapshot(submission({ 'snapshot-q09': 'C' }));

    expect(
      referencePointReport.pairedSignals.find((signal) => signal.id === 'QUANT-M')?.body,
    ).toContain('wrong local comparison or reference point');
    expect(modelReport.pairedSignals.find((signal) => signal.id === 'QUANT-M')?.body).toContain(
      'relationship that did not match the quantity',
    );
    expect(JSON.stringify(referencePointReport)).toContain(
      'describes the answer feature, not why it was selected',
    );
  });

  it('handles every answer combination within each of the six pairs', () => {
    const pairs = [
      ['ARG-Q', 'snapshot-q01', 'snapshot-q07'],
      ['REP-P', 'snapshot-q02', 'snapshot-q08'],
      ['QUANT-M', 'snapshot-q03', 'snapshot-q09'],
      ['CAUSE', 'snapshot-q04', 'snapshot-q10'],
      ['DESIGN', 'snapshot-q05', 'snapshot-q11'],
      ['REP-DYN', 'snapshot-q06', 'snapshot-q12'],
    ] as const;
    let profileCount = 0;

    for (const [pairId, firstId, secondId] of pairs) {
      for (const firstChoice of choices) {
        for (const secondChoice of choices) {
          const report = scoreSnapshot(
            submission({ [firstId]: firstChoice, [secondId]: secondChoice }),
          );
          const signal = report.pairedSignals.find((entry) => entry.id === pairId);
          const correctCount =
            Number(firstChoice === correctChoices[firstId]) +
            Number(secondChoice === correctChoices[secondId]);
          const expectedState =
            correctCount === 2 ? 'limited-positive' : correctCount === 1 ? 'mixed' : 'drill-target';

          expect(signal?.state).toBe(expectedState);
          expect(signal?.body.trim()).not.toBe('');
          expectCompleteReport(report);
          profileCount += 1;
        }
      }
    }

    expect(profileCount).toBe(96);
  });

  it('makes named repeated patterns rare under the 256 data-answer combinations', () => {
    const counts = { positive: 0, friction: 0, none: 0 };
    const dataIds = ['snapshot-q02', 'snapshot-q08', 'snapshot-q06', 'snapshot-q12'];

    for (const q02 of choices) {
      for (const q08 of choices) {
        for (const q06 of choices) {
          for (const q12 of choices) {
            const selected = [q02, q08, q06, q12];
            const overrides = Object.fromEntries(
              dataIds.map((questionId, index) => [questionId, selected[index]]),
            ) as Record<string, ChoiceId>;
            counts[scoreSnapshot(submission(overrides)).repeatedPattern.kind] += 1;
          }
        }
      }
    }

    expect(counts).toEqual({ positive: 1, friction: 12, none: 243 });
  });

  it('returns a complete report across 20,736 scoring equivalence profiles', () => {
    const dataIds = ['snapshot-q02', 'snapshot-q08', 'snapshot-q06', 'snapshot-q12'];
    const nonDataStates: Array<Partial<Record<string, ChoiceId>>> = [];
    const pairProfiles = [
      {
        P: {},
        M: { 'snapshot-q07': 'A' },
        F: { 'snapshot-q01': 'A', 'snapshot-q07': 'A' },
      },
      {
        P: {},
        M: { 'snapshot-q09': 'A' },
        F: { 'snapshot-q03': 'B', 'snapshot-q09': 'A' },
      },
      {
        P: {},
        M: { 'snapshot-q10': 'A' },
        F: { 'snapshot-q04': 'A', 'snapshot-q10': 'A' },
      },
      {
        P: {},
        M: { 'snapshot-q11': 'A' },
        F: { 'snapshot-q05': 'A', 'snapshot-q11': 'A' },
      },
    ] as const;

    for (const argumentState of ['P', 'M', 'F'] as const) {
      for (const quantitativeState of ['P', 'M', 'F'] as const) {
        for (const causeState of ['P', 'M', 'F'] as const) {
          for (const designState of ['P', 'M', 'F'] as const) {
            nonDataStates.push({
              ...pairProfiles[0][argumentState],
              ...pairProfiles[1][quantitativeState],
              ...pairProfiles[2][causeState],
              ...pairProfiles[3][designState],
            });
          }
        }
      }
    }

    let profileCount = 0;
    for (const q02 of choices) {
      for (const q08 of choices) {
        for (const q06 of choices) {
          for (const q12 of choices) {
            const selected = [q02, q08, q06, q12];
            const dataOverrides = Object.fromEntries(
              dataIds.map((questionId, index) => [questionId, selected[index]]),
            ) as Record<string, ChoiceId>;
            for (const nonDataOverrides of nonDataStates) {
              expectCompleteReport(
                scoreSnapshot(submission({ ...dataOverrides, ...nonDataOverrides })),
              );
              profileCount += 1;
            }
          }
        }
      }
    }

    expect(profileCount).toBe(20_736);
  });

  it('keeps the rendered question set synchronized with the server rules', () => {
    expect(snapshotQuestions.map((question) => question.id)).toEqual(SNAPSHOT_ITEM_IDS);
    for (const question of snapshotQuestions) {
      expect(question.choices.map((choice) => choice.id).sort()).toEqual(choices);
    }
    expect(
      scoreSnapshot(submission()).pairedSignals.every(
        (signal) => signal.state === 'limited-positive',
      ),
    ).toBe(true);
  });

  it('rejects incomplete, duplicate, and unknown responses', () => {
    expect(() => scoreSnapshot({ responses: [] })).toThrow(SnapshotInputError);

    const duplicate = submission();
    duplicate.responses[11] = { questionId: 'snapshot-q01', choiceId: 'B' };
    expect(() => scoreSnapshot(duplicate)).toThrow('Each question may be answered only once.');

    const unknown = submission();
    unknown.responses[0] = { questionId: 'snapshot-q99', choiceId: 'A' };
    expect(() => scoreSnapshot(unknown)).toThrow('unknown question or choice');
  });
});
