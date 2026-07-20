import { describe, expect, it } from 'vitest';
import { EvidenceRecordSchema, type EvidenceRecord, type Task } from '@mcat/domain';
import { UtcTimestampSchema } from '@mcat/contracts';
import { clampDueToExam, intervalDays, schedule } from './fsrs';
import { decideAssistance } from './assistance';
import {
  DIAGNOSTIC_CONFIG,
  isCoverageComplete,
  selectNextDiagnostic,
  shouldStop,
  type DiagnosticState,
} from './diagnostic';
import { evaluateMastery } from './mastery-policy';
import { classifyCapacity, continueTarget, orderTasks } from './planner';
import { scorePredictionGate } from './readiness';

const NOW = UtcTimestampSchema.parse('2026-07-20T12:00:00.000Z');

let seq = 0;
const mkEv = (over: Partial<EvidenceRecord>): EvidenceRecord =>
  EvidenceRecordSchema.parse({
    evidenceId: crypto.randomUUID(),
    skillId: 'bb1-enzyme-inhibition',
    cluster: 'BB1',
    operation: 'K',
    kind: 'independent',
    independent: true,
    assistanceLevel: 'A0',
    contentBearingHint: false,
    questionId: 'bb1-fixture-0001',
    itemVersion: 1,
    familyId: 'fam-a',
    changeDimensions: [],
    conditions: { mixed: false, passage: false, timed: false, protected: false, accommodations: [] },
    outcome: 'correct',
    valid: true,
    occurredAt: NOW,
    sequence: (seq += 1),
    contentRelease: 'synthetic-2026.07',
    policies: [{ policyId: 'mastery', version: 'provisional-v1' }],
    ...over,
  });

describe('fsrs', () => {
  it('orders first-review intervals again <= hard <= good <= easy', () => {
    const again = schedule(null, 'again', NOW);
    const hard = schedule(null, 'hard', NOW);
    const good = schedule(null, 'good', NOW);
    const easy = schedule(null, 'easy', NOW);
    expect(again.stability).toBeLessThanOrEqual(hard.stability);
    expect(hard.stability).toBeLessThanOrEqual(good.stability);
    expect(good.stability).toBeLessThanOrEqual(easy.stability);
    // intervalDays is monotonic in stability.
    expect(intervalDays(again.stability)).toBeLessThanOrEqual(intervalDays(easy.stability));
  });

  it('produces a due date after now and clamps to the exam', () => {
    const good = schedule(null, 'good', NOW);
    expect(Date.parse(good.due)).toBeGreaterThan(Date.parse(NOW));
    const exam = UtcTimestampSchema.parse('2026-07-25T12:00:00.000Z');
    const far = schedule({ ...good, stability: 999 }, 'easy', NOW);
    const clamped = clampDueToExam(far.due, exam);
    expect(Date.parse(clamped)).toBeLessThan(Date.parse(exam));
  });
});

describe('assistance', () => {
  it('escalates after a failure and fades after successes', () => {
    expect(
      decideAssistance({ currentLevel: 'A0', consecutiveSuccessesAtLevel: 0, lastOutcomeCorrect: false }).nextLevel,
    ).toBe('A1');
    expect(
      decideAssistance({ currentLevel: 'A3', consecutiveSuccessesAtLevel: 2, lastOutcomeCorrect: true }).nextLevel,
    ).toBe('A2');
    expect(
      decideAssistance({ currentLevel: 'A0', consecutiveSuccessesAtLevel: 5, lastOutcomeCorrect: true }).nextLevel,
    ).toBe('A0');
  });
});

describe('diagnostic', () => {
  const emptyState = (): DiagnosticState => ({
    itemsScored: 0,
    seenQuestionIds: new Set(),
    familiesByCluster: {},
    itemsBySection: { cp: 0, cars: 0, bb: 0, ps: 0 },
    seed: 'seed-1',
  });

  it('is not complete initially and does not stop', () => {
    const state = emptyState();
    expect(isCoverageComplete(state, DIAGNOSTIC_CONFIG)).toBe(false);
    expect(shouldStop(state, DIAGNOSTIC_CONFIG)).toBe(false);
  });

  it('selects a feasible unseen candidate and stops when none remain', () => {
    const state = emptyState();
    const candidates = [
      { questionId: 'q1', cluster: 'BB1' as const, section: 'bb' as const, familyId: 'f1', format: 'discrete_mcq' as const, eligible: true },
      { questionId: 'q2', cluster: 'R1' as const, section: 'cp' as const, familyId: 'f2', format: 'discrete_mcq' as const, eligible: false },
    ];
    const sel = selectNextDiagnostic(state, candidates, DIAGNOSTIC_CONFIG);
    expect(sel.done).toBe(false);
    expect(sel.questionId).toBe('q1'); // q2 is ineligible

    const seen: DiagnosticState = { ...state, seenQuestionIds: new Set(['q1']) };
    expect(selectNextDiagnostic(seen, candidates, DIAGNOSTIC_CONFIG).done).toBe(true);
  });
});

describe('mastery policy', () => {
  it('is not_assessed with no evidence', () => {
    expect(evaluateMastery({ skillId: 's', records: [], now: NOW }).base).toBe('not_assessed');
  });

  it('reaches independent with two independent successes from two families', () => {
    const records = [mkEv({ familyId: 'fam-a' }), mkEv({ familyId: 'fam-b' })];
    expect(evaluateMastery({ skillId: 's', records, now: NOW }).base).toBe('independent');
  });

  it('never advances from simulation/assisted evidence alone', () => {
    const sim = [mkEv({ kind: 'simulation', familyId: 'fam-a' }), mkEv({ kind: 'simulation', familyId: 'fam-b' })];
    expect(evaluateMastery({ skillId: 's', records: sim, now: NOW }).base).toBe('learning');
    const assisted = [
      mkEv({ independent: false, assistanceLevel: 'A2', familyId: 'fam-a' }),
      mkEv({ independent: false, assistanceLevel: 'A2', familyId: 'fam-b' }),
    ];
    expect(evaluateMastery({ skillId: 's', records: assisted, now: NOW }).base).toBe('learning');
  });

  it('reaches strong with the full evidence recipe', () => {
    const records = [
      mkEv({ kind: 'independent', familyId: 'fam-a' }),
      mkEv({ kind: 'independent', familyId: 'fam-b' }),
      mkEv({ kind: 'transfer', familyId: 'fam-a', changeDimensions: ['representation'] }),
      mkEv({ kind: 'transfer', familyId: 'fam-b', changeDimensions: ['domain_context'] }),
      mkEv({ kind: 'delayed', familyId: 'fam-a', delayHours: 50 }),
      mkEv({ kind: 'mixed', familyId: 'fam-b' }),
      mkEv({ kind: 'integrated_passage', familyId: 'fam-a', conditions: { mixed: false, passage: true, timed: false, protected: false, accommodations: [] } }),
      mkEv({ kind: 'timed', familyId: 'fam-b', conditions: { mixed: false, passage: false, timed: true, protected: false, accommodations: [] } }),
      mkEv({ kind: 'protected', familyId: 'fam-a', conditions: { mixed: false, passage: false, timed: false, protected: true, accommodations: [] } }),
    ];
    expect(evaluateMastery({ skillId: 's', records, now: NOW }).base).toBe('strong');
  });

  it('overlays refresh_needed on stale evidence without erasing the base state', () => {
    const stale = UtcTimestampSchema.parse('2026-01-01T12:00:00.000Z'); // >45d before NOW
    const records = [
      mkEv({ familyId: 'fam-a', occurredAt: stale }),
      mkEv({ familyId: 'fam-b', occurredAt: stale }),
    ];
    const state = evaluateMastery({ skillId: 's', records, now: NOW });
    expect(state.base).toBe('independent');
    expect(state.refreshNeeded).toBe(true);
  });
});

describe('planner', () => {
  it('classifies capacity', () => {
    expect(classifyCapacity({ availableMinutesPerWeek: 600, weeksRemaining: null, requiredP50Minutes: 1, requiredP80Minutes: 1 })).toBe('rolling');
    expect(classifyCapacity({ availableMinutesPerWeek: 600, weeksRemaining: 10, requiredP50Minutes: 3000, requiredP80Minutes: 4000 })).toBe('on_track');
    expect(classifyCapacity({ availableMinutesPerWeek: 300, weeksRemaining: 10, requiredP50Minutes: 2500, requiredP80Minutes: 4000 })).toBe('tight');
    expect(classifyCapacity({ availableMinutesPerWeek: 100, weeksRemaining: 10, requiredP50Minutes: 2500, requiredP80Minutes: 4000 })).toBe('goal_plan_mismatch');
  });

  it('orders prerequisite repair before new learning and finds the Continue target', () => {
    const tasks: Task[] = [
      { taskId: 't-new', type: 'lesson', title: 'New', estimatedMinutes: 20, priorityReason: 'NEW_LEARNING', status: 'ready', requiresConnection: false },
      { taskId: 't-prereq', type: 'diagnose_repair', title: 'Repair', estimatedMinutes: 15, priorityReason: 'PREREQUISITE_BLOCKER', status: 'ready', requiresConnection: false },
    ];
    expect(orderTasks(tasks)[0]!.taskId).toBe('t-prereq');
    expect(continueTarget(tasks)?.taskId).toBe('t-prereq');
  });
});

describe('readiness', () => {
  it('keeps numeric prediction off until the model is validated', () => {
    const dataMet = scorePredictionGate({
      modelValidated: false,
      independentAttempts: 500,
      perSectionIndependent: { cp: 100, cars: 100, bb: 100, ps: 100 },
      recentFullLengths: 3,
      hasOfficialResult: true,
    });
    expect(dataMet.numericAllowed).toBe(false);
    expect(dataMet.reasons).toContain('product_model_not_validated');
  });
});
