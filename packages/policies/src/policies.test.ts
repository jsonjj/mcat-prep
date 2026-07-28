import { describe, expect, it } from 'vitest';
import {
  boundOccurredAtToServerTime,
  EVIDENCE_QUALITY_TIERS,
  EvidenceRecordSchema,
  evidenceQualityRank,
  type EvidenceKind,
  type EvidenceRecord,
  type SkillEvidenceState,
  type Task,
} from '@mcat/domain';
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
import {
  evaluateEvidence,
  evaluateMastery,
  EVIDENCE_CONFIG,
  EVIDENCE_WARRANT_MANIFEST,
} from './mastery-policy';
import { classifyCapacity, continueTarget, orderTasks } from './planner';
import { scorePredictionGate } from './readiness';

const NOW = UtcTimestampSchema.parse('2026-07-20T12:00:00.000Z');

/**
 * A server-bounded evidence stamp. `EvidenceRecord.occurredAt` is branded so a
 * raw `UtcTimestamp` cannot be assigned to it, and this is the single producer of
 * the brand — a fixture has to go through the same door production does.
 */
const boundedAt = (iso: string) => {
  const reported = UtcTimestampSchema.parse(iso);
  return boundOccurredAtToServerTime(reported, reported);
};

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
    conditions: {
      mixed: false,
      passage: false,
      timed: false,
      protected: false,
      accommodations: [],
    },
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
      decideAssistance({
        currentLevel: 'A0',
        consecutiveSuccessesAtLevel: 0,
        lastOutcomeCorrect: false,
      }).nextLevel,
    ).toBe('A1');
    expect(
      decideAssistance({
        currentLevel: 'A3',
        consecutiveSuccessesAtLevel: 2,
        lastOutcomeCorrect: true,
      }).nextLevel,
    ).toBe('A2');
    expect(
      decideAssistance({
        currentLevel: 'A0',
        consecutiveSuccessesAtLevel: 5,
        lastOutcomeCorrect: true,
      }).nextLevel,
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
      {
        questionId: 'q1',
        cluster: 'BB1' as const,
        section: 'bb' as const,
        familyId: 'f1',
        format: 'discrete_mcq' as const,
        eligible: true,
      },
      {
        questionId: 'q2',
        cluster: 'R1' as const,
        section: 'cp' as const,
        familyId: 'f2',
        format: 'discrete_mcq' as const,
        eligible: false,
      },
    ];
    const sel = selectNextDiagnostic(state, candidates, DIAGNOSTIC_CONFIG);
    expect(sel.done).toBe(false);
    expect(sel.questionId).toBe('q1'); // q2 is ineligible

    const seen: DiagnosticState = { ...state, seenQuestionIds: new Set(['q1']) };
    expect(selectNextDiagnostic(seen, candidates, DIAGNOSTIC_CONFIG).done).toBe(true);
  });
});

describe('evidence warrant policy', () => {
  const fullWarrant = (): EvidenceRecord[] => [
    mkEv({ kind: 'independent', familyId: 'fam-a' }),
    mkEv({ kind: 'independent', familyId: 'fam-b' }),
    mkEv({ kind: 'transfer', familyId: 'fam-a', changeDimensions: ['representation'] }),
    mkEv({ kind: 'transfer', familyId: 'fam-b', changeDimensions: ['domain_context'] }),
    mkEv({ kind: 'delayed', familyId: 'fam-a', delayHours: 50 }),
    mkEv({ kind: 'mixed', familyId: 'fam-b' }),
    mkEv({
      kind: 'integrated_passage',
      familyId: 'fam-a',
      conditions: {
        mixed: false,
        passage: true,
        timed: false,
        protected: false,
        accommodations: [],
      },
    }),
    mkEv({
      kind: 'timed',
      familyId: 'fam-b',
      conditions: {
        mixed: false,
        passage: false,
        timed: true,
        protected: false,
        accommodations: [],
      },
    }),
    mkEv({
      kind: 'protected',
      familyId: 'fam-a',
      conditions: {
        mixed: false,
        passage: false,
        timed: false,
        protected: true,
        accommodations: [],
      },
    }),
  ];

  const gapFor = (state: SkillEvidenceState, kind: EvidenceKind) =>
    state.missingSlots.find((g) => g.kind === kind);

  it('reports no useful evidence and the whole warrant as missing with no records', () => {
    const state = evaluateEvidence({ skillId: 's', records: [], now: NOW });
    expect(state.evidenceQuality).toBe('not_assessed');
    expect(state.satisfiedSlots).toEqual([]);
    expect(state.missingSlots.map((g) => g.kind)).toEqual([
      'independent',
      'transfer',
      'delayed',
      'mixed',
      'integrated_passage',
      'timed',
      'protected',
    ]);
    expect(state.reasons.map((r) => r.code)).toContain('NO_USEFUL_EVIDENCE');
  });

  it('records independent-quality evidence from two families and names the remaining gaps', () => {
    const records = [mkEv({ familyId: 'fam-a' }), mkEv({ familyId: 'fam-b' })];
    const state = evaluateEvidence({ skillId: 's', records, now: NOW });
    expect(state.evidenceQuality).toBe('independent');
    expect(state.satisfiedSlots.map((s) => s.kind)).toEqual(['independent']);
    expect(state.missingSlots.map((g) => g.kind)).toEqual([
      'transfer',
      'delayed',
      'mixed',
      'integrated_passage',
      'timed',
      'protected',
    ]);
    expect(state.reasons.map((r) => r.code)).toContain('INDEPENDENT_EVIDENCE_SATISFIED');
    expect(state.reasons.map((r) => r.code)).toContain('TRANSFER_EVIDENCE_GAP');
    expect(state.reasons.map((r) => r.code)).toContain('DELAYED_EVIDENCE_GAP');
    expect(state.supportingEvidenceIds).toHaveLength(2);
  });

  it('never counts simulation/assisted evidence toward the warrant', () => {
    const sim = [
      mkEv({ kind: 'simulation', familyId: 'fam-a' }),
      mkEv({ kind: 'simulation', familyId: 'fam-b' }),
    ];
    const simState = evaluateEvidence({ skillId: 's', records: sim, now: NOW });
    expect(simState.evidenceQuality).toBe('learning');
    expect(simState.supportingEvidenceIds).toEqual([]);
    expect(gapFor(simState, 'independent')?.reasons).toContain('KIND_ABSENT');

    const assisted = [
      mkEv({ independent: false, assistanceLevel: 'A2', familyId: 'fam-a' }),
      mkEv({ independent: false, assistanceLevel: 'A2', familyId: 'fam-b' }),
    ];
    expect(evaluateEvidence({ skillId: 's', records: assisted, now: NOW }).evidenceQuality).toBe(
      'learning',
    );
  });

  it('satisfies the whole warrant with the full recipe and reports zero gaps', () => {
    const state = evaluateEvidence({ skillId: 's', records: fullWarrant(), now: NOW });
    expect(state.evidenceQuality).toBe('strong');
    expect(state.missingSlots).toEqual([]);
    expect(state.satisfiedSlots).toHaveLength(7);
  });

  it('distinguishes evidence quality (history) from freshness (currency)', () => {
    const stale = boundedAt('2026-01-01T12:00:00.000Z'); // >45d before NOW
    const state = evaluateEvidence({
      skillId: 's',
      records: [
        mkEv({ familyId: 'fam-a', occurredAt: stale }),
        mkEv({ familyId: 'fam-b', occurredAt: stale }),
      ],
      now: NOW,
    });
    expect(state.evidenceQuality).toBe('independent'); // history is never erased
    expect(state.freshEvidenceQuality).toBeNull();
    expect(state.refreshNeeded).toBe(true);
    expect(state.reasons.map((r) => r.code)).toContain('EVIDENCE_STALE');

    const fresh = evaluateEvidence({
      skillId: 's',
      records: [mkEv({ familyId: 'fam-a' }), mkEv({ familyId: 'fam-b' })],
      now: NOW,
    });
    expect(fresh.evidenceQuality).toBe('independent');
    expect(fresh.freshEvidenceQuality).toBe('independent');
    expect(fresh.refreshNeeded).toBe(false);
    expect(fresh.reasons.map((r) => r.code)).not.toContain('EVIDENCE_STALE');
  });

  it('treats a future-dated record as untrustworthy, not as maximally fresh', () => {
    // `daysBetween` is signed, so a future stamp has a NEGATIVE age and would
    // otherwise clear every freshness window forever. Flooring the age at zero
    // would be the same defect with a smaller number: age 0 reads as brand new.
    const poisoned = [
      mkEv({ familyId: 'fam-a', occurredAt: boundedAt('2999-01-01T00:00:00.000Z') }),
      mkEv({ familyId: 'fam-b', occurredAt: boundedAt('2999-01-01T00:00:00.000Z') }),
    ];
    const honestlyStale = [
      mkEv({ familyId: 'fam-a', occurredAt: boundedAt('2025-06-16T12:00:00.000Z') }),
      mkEv({ familyId: 'fam-b', occurredAt: boundedAt('2025-06-16T12:00:00.000Z') }),
    ];

    const poisonedState = evaluateEvidence({ skillId: 's', records: poisoned, now: NOW });
    const staleState = evaluateEvidence({ skillId: 's', records: honestlyStale, now: NOW });

    // The poisoned record reads exactly like genuinely stale evidence.
    expect(poisonedState.freshEvidenceQuality).toBeNull();
    expect(poisonedState.refreshNeeded).toBe(true);
    expect(poisonedState.reasons.map((r) => r.code)).toContain('EVIDENCE_STALE');
    expect(poisonedState.freshEvidenceQuality).toBe(staleState.freshEvidenceQuality);
    expect(poisonedState.refreshNeeded).toBe(staleState.refreshNeeded);

    // History is still never erased: the achieved-ever tier is not time-derived.
    expect(poisonedState.evidenceQuality).toBe('independent');

    // And it cannot outlast a decade of real time either.
    const laterState = evaluateEvidence({
      skillId: 's',
      records: poisoned,
      now: UtcTimestampSchema.parse('2036-07-20T12:00:00.000Z'),
    });
    expect(laterState.freshEvidenceQuality).toBeNull();
    expect(laterState.refreshNeeded).toBe(true);
  });

  it('still credits a record stamped in the same instant as the read', () => {
    // The boundary between "no elapsed time" and "negative elapsed time" must
    // fall on the right side: zero age is fresh, below zero is not.
    const state = evaluateEvidence({
      skillId: 's',
      records: [
        mkEv({ familyId: 'fam-a', occurredAt: boundedAt(NOW) }),
        mkEv({ familyId: 'fam-b', occurredAt: boundedAt(NOW) }),
      ],
      now: NOW,
    });

    expect(state.freshEvidenceQuality).toBe('independent');
    expect(state.refreshNeeded).toBe(false);
  });

  it('applies the tighter strong-condition freshness window to passage/timed/protected evidence', () => {
    const thirtyDaysAgo = boundedAt('2026-06-20T12:00:00.000Z'); // <45d, >21d
    const records = fullWarrant().map((r) =>
      r.kind === 'timed' ? { ...r, occurredAt: thirtyDaysAgo } : r,
    );
    const state = evaluateEvidence({ skillId: 's', records, now: NOW });
    expect(state.evidenceQuality).toBe('strong');
    expect(state.freshEvidenceQuality).toBe('retained'); // timed evidence aged out of its 21d window
    expect(state.refreshNeeded).toBe(true);
    expect(state.freshestByKind.timed).toBe(thirtyDaysAgo);
  });

  it('flags a fresh independent failure as a refresh even when evidence is current', () => {
    const records = [
      mkEv({ familyId: 'fam-a' }),
      mkEv({ familyId: 'fam-b' }),
      mkEv({ familyId: 'fam-c', outcome: 'incorrect' }),
    ];
    const state = evaluateEvidence({ skillId: 's', records, now: NOW });
    expect(state.evidenceQuality).toBe('independent');
    expect(state.refreshNeeded).toBe(true);
    expect(state.reasons.map((r) => r.code)).toContain('FRESH_FAILURE');
  });

  it('reports an explicit family-diversity gap', () => {
    const records = [mkEv({ familyId: 'fam-a' }), mkEv({ familyId: 'fam-a' })];
    const state = evaluateEvidence({ skillId: 's', records, now: NOW });
    expect(state.evidenceQuality).toBe('learning');
    expect(gapFor(state, 'independent')).toEqual({
      target: 'strong',
      kind: 'independent',
      requiredFamilies: 2,
      observedFamilies: 1,
      reasons: ['FAMILY_DIVERSITY_GAP'],
    });
    expect(state.reasons.map((r) => r.code)).toContain('INDEPENDENT_EVIDENCE_GAP');
  });

  it('reports an explicit change-dimension gap on transfer evidence', () => {
    const records = [
      mkEv({ kind: 'transfer', familyId: 'fam-a', changeDimensions: ['representation'] }),
      mkEv({ kind: 'transfer', familyId: 'fam-b', changeDimensions: ['representation'] }),
    ];
    const gap = gapFor(evaluateEvidence({ skillId: 's', records, now: NOW }), 'transfer');
    expect(gap?.observedFamilies).toBe(2);
    expect(gap?.reasons).toEqual(['CHANGE_DIMENSION_GAP']);
  });

  it('reports an explicit delay-window gap on too-early delayed evidence', () => {
    const records = [mkEv({ kind: 'delayed', familyId: 'fam-a', delayHours: 12 })];
    const gap = gapFor(evaluateEvidence({ skillId: 's', records, now: NOW }), 'delayed');
    expect(gap?.reasons).toEqual(['DELAY_WINDOW_GAP']);
    expect(gap?.observedFamilies).toBe(1);
  });

  it('fails closed to foundation_needed when a prerequisite is blocked', () => {
    const state = evaluateEvidence({
      skillId: 's',
      records: fullWarrant(),
      now: NOW,
      prerequisiteBlocked: true,
    });
    expect(state.evidenceQuality).toBe('foundation_needed');
    expect(state.supportingEvidenceIds).toEqual([]);
    expect(state.reasons.map((r) => r.code)).toEqual(['PREREQUISITE_BLOCKED']);
  });

  it('keeps the deprecated evaluateMastery wrapper projecting the legacy ladder shape', () => {
    const records = [mkEv({ familyId: 'fam-a' }), mkEv({ familyId: 'fam-b' })];
    const legacy = evaluateMastery({ skillId: 's', records, now: NOW });
    expect(legacy.base).toBe('independent');
    expect(legacy.refreshNeeded).toBe(false);
    expect(legacy.policyVersion).toBe(EVIDENCE_WARRANT_MANIFEST.version);
  });
});

describe('planner', () => {
  it('classifies capacity', () => {
    expect(
      classifyCapacity({
        availableMinutesPerWeek: 600,
        weeksRemaining: null,
        requiredP50Minutes: 1,
        requiredP80Minutes: 1,
      }),
    ).toBe('rolling');
    expect(
      classifyCapacity({
        availableMinutesPerWeek: 600,
        weeksRemaining: 10,
        requiredP50Minutes: 3000,
        requiredP80Minutes: 4000,
      }),
    ).toBe('on_track');
    expect(
      classifyCapacity({
        availableMinutesPerWeek: 300,
        weeksRemaining: 10,
        requiredP50Minutes: 2500,
        requiredP80Minutes: 4000,
      }),
    ).toBe('tight');
    expect(
      classifyCapacity({
        availableMinutesPerWeek: 100,
        weeksRemaining: 10,
        requiredP50Minutes: 2500,
        requiredP80Minutes: 4000,
      }),
    ).toBe('goal_plan_mismatch');
  });

  it('orders prerequisite repair before new learning and finds the Continue target', () => {
    const tasks: Task[] = [
      {
        taskId: 't-new',
        type: 'lesson',
        title: 'New',
        estimatedMinutes: 20,
        priorityReason: 'NEW_LEARNING',
        status: 'ready',
        requiresConnection: false,
      },
      {
        taskId: 't-prereq',
        type: 'diagnose_repair',
        title: 'Repair',
        estimatedMinutes: 15,
        priorityReason: 'PREREQUISITE_BLOCKER',
        status: 'ready',
        requiresConnection: false,
      },
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

describe('evidence warrant — every recipe target is a real tier', () => {
  /**
   * `TRANSFER_PRECURSOR = 'transfer' as EvidenceQualityTier` manufactured a value
   * the enum does not contain, so `evidenceQualityRank('transfer')` was
   * `undefined` and any rank comparison silently mis-ordered. A cast cannot be
   * caught by the type system, so this asserts the property directly.
   */
  it('publishes only tiers the rank function knows', () => {
    for (const recipe of EVIDENCE_CONFIG.recipes) {
      expect(EVIDENCE_QUALITY_TIERS as readonly string[]).toContain(recipe.target);
      expect(evidenceQualityRank(recipe.target)).toBeTypeOf('number');
      expect(Number.isNaN(evidenceQualityRank(recipe.target))).toBe(false);
    }
  });

  it('names each recipe, since two may publish the same tier', () => {
    const names = EVIDENCE_CONFIG.recipes.map((r) => r.name);
    expect(new Set(names).size).toBe(names.length);
    // The transfer route is a stricter path to `independent`, not a tier of its own.
    expect(
      EVIDENCE_CONFIG.recipes.filter((r) => r.target === 'independent').map((r) => r.name),
    ).toEqual(['independent', 'independent_corroborated_by_transfer']);
  });

  it('reaches `retained` only with delayed and mixed evidence, unchanged by the rename', () => {
    // Guards the behaviour the deleted special case used to produce: transfer
    // evidence corroborates independence, it does not promote past it.
    const withTransfer = evaluateEvidence({
      skillId: 's',
      records: [
        mkEv({ familyId: 'fam-a' }),
        mkEv({ familyId: 'fam-b' }),
        mkEv({ kind: 'transfer', familyId: 'fam-c', changeDimensions: ['representation'] }),
        mkEv({ kind: 'transfer', familyId: 'fam-d', changeDimensions: ['domain_context'] }),
      ],
      now: NOW,
    });

    expect(withTransfer.evidenceQuality).toBe('independent');
    expect(withTransfer.reasons.map((r) => r.code)).toContain('INDEPENDENT_EVIDENCE_SATISFIED');
  });
});
