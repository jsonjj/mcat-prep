import { describe, expect, it } from 'vitest';
import {
  DecisionReasonViewSchema,
  EVIDENCE_REASON_CODES,
  fixedClock,
  MasteryMapEntrySchema,
  QualifiedBktObservationSchema,
  UtcTimestampSchema,
  type QualifiedBktObservation,
  type ReasoningOperation,
  type UtcTimestamp,
} from '@mcat/contracts';
import { loadSyntheticBank, orderedKcsForLesson } from '@mcat/content';
import { EVIDENCE_QUALITY_TIERS, EVIDENCE_REASONS } from '@mcat/domain';
import { MASTERY_THRESHOLD, PRIOR_PL0 } from '@mcat/policies';
import { Authority, BKT_OBSERVATION_FUTURE_SKEW_TOLERANCE_MS } from './authority';
import type { LearnerState } from './types';

const NOW = '2026-07-20T12:00:00.000Z';
const clock = fixedClock(NOW);
const at = (iso: string): UtcTimestamp => UtcTimestampSchema.parse(iso);
const shiftedFromNow = (ms: number): string => new Date(Date.parse(NOW) + ms).toISOString();

function onboard(auth: Authority): LearnerState {
  const state = auth.createGuest();
  let next = auth.diagnosticNext(state);
  while (!next.done) {
    auth.submitDiagnosticAnswer(state, next.questionId!, 'A');
    next = auth.diagnosticNext(state);
  }
  auth.confirmPlan(state, { testDate: null, targetScore: 515, minutesPerWeek: 420 });
  return state;
}

/** Answer the current question step correctly (all synthetic keys are 'A'). */
function answerCorrectly(auth: Authority, state: LearnerState): void {
  auth.submitAttempt(state, 'A');
}

describe('Authority — synthetic enzyme vertical', () => {
  it('locks learning until onboarding is complete', () => {
    const auth = new Authority(loadSyntheticBank(), clock);
    const state = auth.createGuest();
    expect(auth.getSession(state).kind).toBe('locked');
    expect(auth.bootstrap(state).onboardingComplete).toBe(false);
  });

  it('completes the placement-to-protected-proof loop and produces mastery evidence', () => {
    const auth = new Authority(loadSyntheticBank(), clock);
    const state = onboard(auth);
    expect(auth.bootstrap(state).onboardingComplete).toBe(true);

    // Walk the whole path answering correctly.
    for (let guard = 0; guard < 40; guard += 1) {
      const step = auth.getSession(state);
      if (step.kind === 'complete') break;
      if (step.kind === 'lesson' || step.kind === 'simulation') {
        auth.continueStep(state);
      } else if (step.kind === 'recall') {
        auth.submitRecall(state, 'increases; unchanged');
      } else if (step.kind === 'question') {
        answerCorrectly(auth, state);
      }
    }

    const finalStep = auth.getSession(state);
    expect(finalStep.kind).toBe('complete');

    // The warrant reached at least the independent tier. Asserted through the
    // reason codes rather than a rank, because the published view carries no
    // ordinal tier to compare — that is the point of the seam.
    const mastery = auth.getMasteryMap(state).find((m) => m.skillId === 'bb1-enzyme-inhibition')!;
    const satisfiedTierCodes = [
      'INDEPENDENT_EVIDENCE_SATISFIED',
      'RETENTION_EVIDENCE_SATISFIED',
      'STRONG_CONDITIONS_EVIDENCE_SATISFIED',
    ];
    expect(mastery.reasons.filter((r) => satisfiedTierCodes.includes(r.code))).not.toHaveLength(0);

    // Protected evidence was captured.
    expect(state.evidence.some((e) => e.kind === 'protected')).toBe(true);
    // No answer keys leaked into events.
    expect(JSON.stringify(state.events)).not.toContain('correct_choice_id');
    expect(JSON.stringify(state.events)).not.toContain('rationales');
  });

  it('runs Diagnose-Before-Reveal on a miss and records an error entry', () => {
    const auth = new Authority(loadSyntheticBank(), clock);
    const state = onboard(auth);

    // Advance past the lesson to the first independent question.
    expect(auth.getSession(state).kind).toBe('lesson');
    auth.continueStep(state);
    let step = auth.getSession(state);
    expect(step.kind).toBe('question');

    // Miss it.
    auth.submitAttempt(state, 'B');
    step = auth.getSession(state);
    expect(step.kind === 'question' && step.sub === 'cause').toBe(true);

    auth.selectCause(state, 'knew_but_misapplied');
    step = auth.getSession(state);
    expect(step.kind === 'question' && step.sub === 'retry').toBe(true);

    // Unassisted retry (correct) -> reveal.
    auth.submitAttempt(state, 'A');
    step = auth.getSession(state);
    expect(step.kind === 'question' && step.sub === 'reveal').toBe(true);
    if (step.kind === 'question') expect(step.reveal?.correctChoiceId).toBe('A');

    auth.continueStep(state);

    const errors = auth.getErrorLog(state);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]!.cause).toBe('knew_but_misapplied');
    expect(errors[0]!.repaired).toBe(true);

    // The retry did not create independent (mastery) evidence for that item.
    const independentForItem = state.evidence.filter(
      (e) => e.questionId === 'q-enz-indep-competitive' && e.kind === 'independent',
    );
    expect(independentForItem.length).toBe(0);
  });

  it('keeps numeric readiness gated and mastery honest when work is assisted-only', () => {
    const auth = new Authority(loadSyntheticBank(), clock);
    const state = onboard(auth);
    // Reveal-now the first question: subsequent state should not gain independent evidence.
    auth.continueStep(state); // past lesson
    auth.requestReveal(state);
    const step = auth.getSession(state);
    expect(step.kind === 'question' && step.sub === 'reveal').toBe(true);
  });
});

describe('Authority — BKT mastery engine (P(L))', () => {
  const PRIOR = 0.2;

  it('exposes 7 skills that start at the prior and rise with independent-correct work', () => {
    const auth = new Authority(loadSyntheticBank(), clock);
    const state = onboard(auth);

    const before = auth.getMasterySkills(state);
    expect(before).toHaveLength(7);
    expect(before.every((s) => Math.abs(s.pL - PRIOR) < 1e-9)).toBe(true);

    for (let guard = 0; guard < 40; guard += 1) {
      const step = auth.getSession(state);
      if (step.kind === 'complete') break;
      if (step.kind === 'lesson' || step.kind === 'simulation') auth.continueStep(state);
      else if (step.kind === 'recall') auth.submitRecall(state, 'increases; unchanged');
      else if (step.kind === 'question') auth.submitAttempt(state, 'A');
    }

    const after = auth.getMasterySkills(state);
    expect(after.some((s) => s.pL > PRIOR)).toBe(true);

    // The synthetic lesson has no BKT chain of its own, and it is not a lesson in
    // the pinned V3 registry, so its rollup FAILS CLOSED by exactly that reason
    // rather than reporting a number nobody can justify.
    expect(auth.getMasteryLessons(state)).toEqual([]);
    const rollups = auth.getLessonRollups(state);
    expect(rollups).toHaveLength(1);
    expect(rollups[0]).toEqual({
      status: 'unavailable',
      lessonId: 'lesson-enz-inhibition',
      rejectionCodes: ['LESSON_KC_MAP_MISSING'],
      missingKcIds: [],
    });
  });

  it('is fail-closed: an assisted retry after a miss never raises P(L)', () => {
    const auth = new Authority(loadSyntheticBank(), clock);
    const state = onboard(auth);
    auth.continueStep(state); // past lesson → first independent question

    auth.submitAttempt(state, 'B'); // independent WRONG → lowers P(L)
    auth.selectCause(state, 'knew_but_misapplied');
    auth.submitAttempt(state, 'A'); // retry CORRECT but non-independent → no change

    const skills = auth.getMasterySkills(state);
    // Nothing was pushed above the prior by the assisted retry...
    expect(skills.every((s) => s.pL <= PRIOR + 1e-9)).toBe(true);
    // ...and the exercised skill was pulled below the prior by the independent miss.
    expect(skills.some((s) => s.pL < PRIOR)).toBe(true);
  });

  it('returns a CARS readiness view that defaults to average and not-on-track', () => {
    const auth = new Authority(loadSyntheticBank(), clock);
    const state = onboard(auth);
    const cars = auth.getCarsReadiness(state);
    expect(cars.skills).toHaveLength(3);
    expect(cars.onTrack).toBe(false);
    expect(cars.overallV).toBeCloseTo(0, 6);
  });
});

// ---------------------------------------------------------------------------
// The lesson → evidence → mastery seam.
// ---------------------------------------------------------------------------

/** A real lesson from the pinned V3 registry, so membership is not invented here. */
const V3_LESSON_ID = 'V3-LES-130923';
const V3_LESSON_KCS = orderedKcsForLesson(V3_LESSON_ID)!;

function qualifiedObservation(
  overrides: Partial<Record<string, unknown>> = {},
): QualifiedBktObservation {
  return QualifiedBktObservationSchema.parse({
    observationId: crypto.randomUUID(),
    questionId: 'ALG-GRAPH-ENTRY-01',
    itemBindingId: 'V3-LES-130923-ITEM-01',
    bindingVersion: 'internal-draft-1',
    serverItemVersion: 7,
    primaryKcId: V3_LESSON_KCS[0]!,
    reasoningOperation: 'QUANTIFY' satisfies ReasoningOperation,
    correct: true,
    occurredAt: '2026-07-20T12:00:00.000Z',
    sequence: 1,
    contentRelease: 'synthetic-2026.07',
    policies: [{ policyId: 'mastery-bkt', version: 'provisional-v1' }],
    ...overrides,
  });
}

/** Repeat a clean correct observation until the KC is comfortably above the cut. */
function practiceToMastery(auth: Authority, state: LearnerState, kcId: string): void {
  for (let i = 0; i < 40; i += 1) {
    auth.applyQualifiedBktObservation(state, {
      observation: qualifiedObservation({ primaryKcId: kcId, sequence: i + 1 }),
      lessonId: V3_LESSON_ID,
    });
  }
}

describe('Authority — qualified lesson observations', () => {
  it('registers a real V3 lesson with more than one required KC', () => {
    // Guards the fixtures below: a single-KC lesson could not distinguish a
    // complete membership from a partial one.
    expect(V3_LESSON_KCS.length).toBeGreaterThan(1);
    expect(new Set(V3_LESSON_KCS).size).toBe(V3_LESSON_KCS.length);
  });

  it('moves exactly two grains: the primary KC and the primary reasoning operation', () => {
    const auth = new Authority(loadSyntheticBank(), clock);
    const state = auth.createGuest();

    const applied = auth.applyQualifiedBktObservation(state, {
      observation: qualifiedObservation({ correct: true }),
      lessonId: V3_LESSON_ID,
    });

    expect(applied).toEqual({
      status: 'applied',
      observationId: expect.any(String),
      kcId: V3_LESSON_KCS[0],
      reasoningOperation: 'QUANTIFY',
      reportedOccurredAt: NOW,
      appliedOccurredAt: NOW,
      clockAdjustment: 'none',
      outOfOrder: false,
    });
    expect(Object.keys(state.mastery!.kc)).toEqual([V3_LESSON_KCS[0]]);
    expect(Object.keys(state.mastery!.skill)).toEqual(['QUANTIFY']);
    expect(state.mastery!.lesson).toBeUndefined();

    const skills = auth.getMasterySkills(state);
    const moved = skills.filter((s) => Math.abs(s.pL - PRIOR_PL0) > 1e-9);
    expect(moved.map((s) => s.operation)).toEqual(['QUANTIFY']);
    expect(moved[0]!.pL).toBeGreaterThan(PRIOR_PL0);
  });

  it('lowers the estimate on an incorrect qualified response', () => {
    const auth = new Authority(loadSyntheticBank(), clock);
    const state = auth.createGuest();

    auth.applyQualifiedBktObservation(state, {
      observation: qualifiedObservation({ correct: false }),
      lessonId: V3_LESSON_ID,
    });

    const quantify = auth.getMasterySkills(state).find((s) => s.operation === 'QUANTIFY')!;
    expect(quantify.pL).toBeLessThan(PRIOR_PL0);
  });

  it('refuses a client-asserted independence, capability, or mastery claim', () => {
    const auth = new Authority(loadSyntheticBank(), clock);
    const state = auth.createGuest();

    for (const smuggled of [
      { independent: true },
      { pL: 1 },
      { mastered: true },
      { masteryThreshold: 0.5 },
      { evidenceStatus: 'strong' },
      { lessonId: V3_LESSON_ID },
    ]) {
      const key = Object.keys(smuggled)[0]!;
      expect(() =>
        auth.applyQualifiedBktObservation(state, {
          // The strict schema has no field for any of these, so the cast is the
          // only way a caller could even attempt it.
          observation: {
            ...qualifiedObservation(),
            ...smuggled,
          } as unknown as QualifiedBktObservation,
          lessonId: V3_LESSON_ID,
        }),
      ).toThrow(new RegExp(`Unrecognized key\\(s\\).*'${key}'`));
    }
    expect(state.mastery?.kc ?? {}).toEqual({});
  });

  it('is idempotent on observationId, so a redelivery moves nothing', () => {
    const auth = new Authority(loadSyntheticBank(), clock);
    const state = auth.createGuest();
    const observation = qualifiedObservation({ correct: true });

    expect(auth.applyQualifiedBktObservation(state, { observation }).status).toBe('applied');
    const afterFirst = auth.getMasterySkills(state).find((s) => s.operation === 'QUANTIFY')!.pL;

    expect(auth.applyQualifiedBktObservation(state, { observation }).status).toBe('duplicate');
    const afterSecond = auth.getMasterySkills(state).find((s) => s.operation === 'QUANTIFY')!.pL;

    expect(afterSecond).toBe(afterFirst);
    expect(state.mastery!.appliedObservationIds).toEqual([observation.observationId]);
  });
});

describe('Authority — lesson mastery is a rollup, never a chain', () => {
  it('rolls up a partly started lesson by supplying unstarted KCs explicitly', () => {
    const auth = new Authority(loadSyntheticBank(), clock);
    const state = auth.createGuest();

    auth.applyQualifiedBktObservation(state, {
      observation: qualifiedObservation({ correct: true, primaryKcId: V3_LESSON_KCS[0]! }),
      lessonId: V3_LESSON_ID,
    });

    // Only one of the lesson's KCs has a stored state...
    expect(Object.keys(state.mastery!.kc)).toEqual([V3_LESSON_KCS[0]]);

    // ...yet the rollup still resolves, because every required KC is passed —
    // the unstarted ones at the prior. Passing only the KCs that happen to have
    // a state would fail closed with LESSON_KC_STATE_MISSING here.
    const [rollup] = auth.getLessonRollups(state);
    expect(rollup?.status).toBe('available');
    if (rollup?.status !== 'available') throw new Error('expected an available rollup');

    expect(rollup.view.members.map((m) => m.kcId)).toEqual([...V3_LESSON_KCS]);
    expect(rollup.view.requiredKcCount).toBe(V3_LESSON_KCS.length);
    for (const kcId of V3_LESSON_KCS.slice(1)) {
      expect(rollup.view.members.find((m) => m.kcId === kcId)!.pL).toBeCloseTo(PRIOR_PL0, 12);
    }

    const practiced = rollup.view.members[0]!.pL;
    const expectedMean =
      (practiced + PRIOR_PL0 * (V3_LESSON_KCS.length - 1)) / V3_LESSON_KCS.length;
    expect(rollup.view.pL).toBeCloseTo(expectedMean, 12);
    expect(rollup.view.mastered).toBe(false);
  });

  it('withholds mastery until EVERY required KC clears the cut', () => {
    const auth = new Authority(loadSyntheticBank(), clock);
    const state = auth.createGuest();

    for (const kcId of V3_LESSON_KCS.slice(0, -1)) practiceToMastery(auth, state, kcId);

    const partial = auth.getMasteryLessons(state).find((l) => l.lessonId === V3_LESSON_ID)!;
    // A high mean is deliberately not mastery: the one untouched KC still blocks.
    expect(partial.pL).toBeGreaterThan(0.6);
    expect(partial.mastered).toBe(false);
    const [partialRollup] = auth.getLessonRollups(state);
    if (partialRollup?.status !== 'available') throw new Error('expected an available rollup');
    expect(partialRollup.view.members.filter((m) => !m.mastered).map((m) => m.kcId)).toEqual([
      V3_LESSON_KCS.at(-1),
    ]);
    expect(partialRollup.view.weakestKcId).toBe(V3_LESSON_KCS.at(-1));

    practiceToMastery(auth, state, V3_LESSON_KCS.at(-1)!);

    const complete = auth.getMasteryLessons(state).find((l) => l.lessonId === V3_LESSON_ID)!;
    expect(complete.mastered).toBe(true);
    expect(complete.pL).toBeGreaterThanOrEqual(MASTERY_THRESHOLD);
    expect(complete.cluster).not.toBeNull();
  });

  it('fails closed by name for a lesson with no registry membership', () => {
    const auth = new Authority(loadSyntheticBank(), clock);
    const state = auth.createGuest();

    expect(auth.getLessonRollups(state, ['V3-LES-000000'])).toEqual([
      {
        status: 'unavailable',
        lessonId: 'V3-LES-000000',
        rejectionCodes: ['LESSON_KC_MAP_MISSING'],
        missingKcIds: [],
      },
    ]);
    expect(auth.getMasteryLessons(state, ['V3-LES-000000'])).toEqual([]);
  });

  it('reports only lessons the learner practiced, unless asked for others', () => {
    const auth = new Authority(loadSyntheticBank(), clock);
    const state = auth.createGuest();

    expect(auth.getMasteryLessons(state)).toEqual([]);

    auth.applyQualifiedBktObservation(state, {
      observation: qualifiedObservation({ correct: true }),
      lessonId: V3_LESSON_ID,
    });

    expect(auth.getMasteryLessons(state).map((l) => l.lessonId)).toEqual([V3_LESSON_ID]);
    expect(state.mastery!.practicedLessonIds).toEqual([V3_LESSON_ID]);
    // An unpracticed lesson still rolls up when a caller names it explicitly.
    expect(auth.getMasteryLessons(state, ['V3-LES-789208']).map((l) => l.lessonId)).toEqual([
      'V3-LES-789208',
    ]);
  });
});

describe('Authority — the evidence warrant stays a separate signal', () => {
  it('publishes only reason codes the learner-facing view accepts', () => {
    // The view mirrors the domain enum across a package boundary that cannot be
    // closed by an import (@mcat/domain depends on @mcat/contracts). This is the
    // seam where a divergence would actually bite: the map below is produced
    // from domain codes and validated by the contracts schema.
    expect([...EVIDENCE_REASON_CODES].sort()).toEqual([...EVIDENCE_REASONS].sort());

    const auth = new Authority(loadSyntheticBank(), clock);
    const state = onboard(auth);
    auth.continueStep(state);
    auth.submitAttempt(state, 'A');

    const entries = auth.getMasteryMap(state);
    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      expect(() => MasteryMapEntrySchema.parse(entry)).not.toThrow();
      expect(entry.reasons.length).toBeGreaterThan(0);
      for (const reason of entry.reasons) {
        expect(() => DecisionReasonViewSchema.parse(reason)).not.toThrow();
        expect(reason.code.endsWith('_ACHIEVED')).toBe(false);
      }
    }
  });

  it('publishes no ordinal evidence tier on any learner-facing view', () => {
    // The regression this pins: an ordinal tier can be compared and thresholded,
    // so wherever one crossed to a consumer it grew back into a rival mastery
    // scale. Asserting on *values* rather than on a field name, because the
    // previous fix renamed the consumer and kept reading the same ordinal.
    const auth = new Authority(loadSyntheticBank(), clock);
    const state = onboard(auth);
    auth.continueStep(state);
    auth.submitAttempt(state, 'A');

    const tierValues: readonly string[] = EVIDENCE_QUALITY_TIERS;
    const carriesATier = (view: unknown): boolean =>
      Object.values(view as Record<string, unknown>).some(
        (value) => typeof value === 'string' && tierValues.includes(value),
      );

    for (const entry of auth.getMasteryMap(state)) {
      expect(carriesATier(entry)).toBe(false);
    }
    expect(carriesATier(auth.buildSummary(state, 'bb1-enzyme-inhibition'))).toBe(false);
  });

  it('agrees with Home about how many skills are glowing, because both are BKT', () => {
    // B-2: `skillsGlowing` used to threshold the evidence tier at `>= independent`
    // while Home counted BKT `mastered`, so a learner could read "3 glowing" on
    // Wrapped and "0" on Home in one session. Identity, not approximation.
    const auth = new Authority(loadSyntheticBank(), clock);
    const state = onboard(auth);
    for (let i = 0; i < 40; i += 1) {
      const step = auth.getSession(state);
      if (step.kind === 'complete') break;
      if (step.kind === 'lesson' || step.kind === 'simulation') auth.continueStep(state);
      else if (step.kind === 'recall') auth.submitRecall(state, 'increases; unchanged');
      else if (step.kind === 'question') answerCorrectly(auth, state);
    }

    const homeGlowing = auth.getMasterySkills(state).filter((s) => s.mastered).length;
    expect(auth.getWrapped(state).skillsGlowing).toBe(homeGlowing);
  });
});

describe('Authority — the runner does not control the BKT decay clock', () => {
  /** Every `bkt_observation_applied` record in ledger order. */
  const ledger = (state: LearnerState) =>
    state.events.filter((e) => e.type === 'bkt_observation_applied');

  const kcState = (state: LearnerState, kcId: string) => state.mastery!.kc[kcId]!;

  it('uses an honest reported time verbatim', () => {
    const auth = new Authority(loadSyntheticBank(), clock);
    const state = auth.createGuest();
    const reportedAt = shiftedFromNow(-90 * 60 * 1000);

    const result = auth.applyQualifiedBktObservation(state, {
      observation: qualifiedObservation({ occurredAt: reportedAt }),
      lessonId: V3_LESSON_ID,
    });

    expect(result).toMatchObject({
      status: 'applied',
      clockAdjustment: 'none',
      reportedOccurredAt: reportedAt,
      appliedOccurredAt: reportedAt,
    });
    expect(kcState(state, V3_LESSON_KCS[0]!).lastPracticedAt).toBe(reportedAt);
  });

  it('refuses an implausibly future timestamp outright, moving nothing', () => {
    const auth = new Authority(loadSyntheticBank(), clock);
    const state = auth.createGuest();
    const reportedAt = shiftedFromNow(BKT_OBSERVATION_FUTURE_SKEW_TOLERANCE_MS + 1);

    const result = auth.applyQualifiedBktObservation(state, {
      observation: qualifiedObservation({ occurredAt: reportedAt }),
      lessonId: V3_LESSON_ID,
    });

    expect(result).toEqual({
      status: 'rejected',
      observationId: expect.any(String),
      kcId: V3_LESSON_KCS[0],
      reasoningOperation: 'QUANTIFY',
      rejectionCodes: ['OBSERVATION_TIMESTAMP_IN_FUTURE'],
    });
    expect(state.mastery!.kc).toEqual({});
    expect(state.mastery!.skill).toEqual({});
    expect(state.mastery!.appliedObservationIds).toEqual([]);
    // The refusal is still auditable, with the runner's claim intact.
    expect(ledger(state)).toHaveLength(1);
    expect(ledger(state)[0]!.payload).toMatchObject({
      reportedOccurredAt: reportedAt,
      appliedOccurredAt: null,
      rejectionCodes: ['OBSERVATION_TIMESTAMP_IN_FUTURE'],
    });
  });

  it('draws the skew line exactly at the tolerance', () => {
    const auth = new Authority(loadSyntheticBank(), clock);

    const accepted = auth.applyQualifiedBktObservation(auth.createGuest(), {
      observation: qualifiedObservation({
        occurredAt: shiftedFromNow(BKT_OBSERVATION_FUTURE_SKEW_TOLERANCE_MS),
      }),
    });
    const refused = auth.applyQualifiedBktObservation(auth.createGuest(), {
      observation: qualifiedObservation({
        occurredAt: shiftedFromNow(BKT_OBSERVATION_FUTURE_SKEW_TOLERANCE_MS + 1),
      }),
    });

    // At the tolerance the claim is honest skew: applied, but pulled back to the
    // server clock rather than trusted.
    expect(accepted).toMatchObject({
      status: 'applied',
      clockAdjustment: 'bounded_to_server_clock',
      appliedOccurredAt: NOW,
    });
    expect(refused).toMatchObject({ status: 'rejected' });
  });

  it('never lets a clamped claim read as fresher than the server clock', () => {
    const auth = new Authority(loadSyntheticBank(), clock);
    const state = auth.createGuest();
    const reportedAt = shiftedFromNow(60 * 1000);

    const result = auth.applyQualifiedBktObservation(state, {
      observation: qualifiedObservation({ occurredAt: reportedAt }),
      lessonId: V3_LESSON_ID,
    });

    expect(result).toMatchObject({
      status: 'applied',
      clockAdjustment: 'bounded_to_server_clock',
      reportedOccurredAt: reportedAt,
      appliedOccurredAt: NOW,
    });
    expect(kcState(state, V3_LESSON_KCS[0]!).lastPracticedAt).toBe(NOW);
    // The clamp corrected the claim; it did not erase it.
    expect(ledger(state)[0]!.payload).toMatchObject({
      reportedOccurredAt: reportedAt,
      appliedOccurredAt: NOW,
      clockAdjustment: 'bounded_to_server_clock',
    });
  });

  it('cannot be talked into permanent mastery by 120 future-dated observations', () => {
    // The reviewer's measured attack: 40 correct observations per KC, all stamped
    // 2999-01-01, previously produced pL 1 / mastered true / reviewDue false that
    // still read as 1 a decade later.
    const auth = new Authority(loadSyntheticBank(), clock);
    const state = auth.createGuest();

    const results = V3_LESSON_KCS.flatMap((kcId) =>
      Array.from({ length: 40 }, (_unused, i) =>
        auth.applyQualifiedBktObservation(state, {
          observation: qualifiedObservation({
            primaryKcId: kcId,
            sequence: i + 1,
            occurredAt: '2999-01-01T00:00:00.000Z',
          }),
          lessonId: V3_LESSON_ID,
        }),
      ),
    );

    expect(results).toHaveLength(120);
    expect(results.every((r) => r.status === 'rejected')).toBe(true);
    expect(state.mastery!.kc).toEqual({});
    expect(state.mastery!.skill).toEqual({});

    const [rollup] = auth.getLessonRollups(state, [V3_LESSON_ID]);
    if (rollup?.status !== 'available') throw new Error('expected an available rollup');
    expect(rollup.view.mastered).toBe(false);
    expect(rollup.view.pL).toBeCloseTo(PRIOR_PL0, 12);
    expect(rollup.view.members.every((m) => m.pL === PRIOR_PL0)).toBe(true);

    // And nothing has been parked in the future for a later read to discover.
    const decadeLater = new Authority(loadSyntheticBank(), fixedClock('2036-07-20T12:00:00.000Z'));
    const [later] = decadeLater.getLessonRollups(state, [V3_LESSON_ID]);
    if (later?.status !== 'available') throw new Error('expected an available rollup');
    expect(later.view.mastered).toBe(false);
    expect(ledger(state)).toHaveLength(120);
  });

  it('cannot be talked into wiping a mastered KC with one backdated observation', () => {
    // The reviewer's measured attack: one *correct*, fully qualified observation
    // stamped 2024-01-01 previously dropped a mastered KC from 1.0 to 9.67e-11 by
    // rewinding lastPracticedAt and letting lazy decay run over the invented gap.
    const auth = new Authority(loadSyntheticBank(), clock);
    const state = auth.createGuest();
    const kcId = V3_LESSON_KCS[0]!;
    practiceToMastery(auth, state, kcId);

    const before = { ...kcState(state, kcId) };
    const pLBefore = auth.getLessonRollups(state, [V3_LESSON_ID])[0];
    if (pLBefore?.status !== 'available') throw new Error('expected an available rollup');
    const memberBefore = pLBefore.view.members.find((m) => m.kcId === kcId)!;
    expect(memberBefore.mastered).toBe(true);

    const result = auth.applyQualifiedBktObservation(state, {
      observation: qualifiedObservation({
        primaryKcId: kcId,
        correct: true,
        sequence: 999,
        occurredAt: '2024-01-01T00:00:00.000Z',
      }),
      lessonId: V3_LESSON_ID,
    });

    expect(result).toMatchObject({
      status: 'applied',
      clockAdjustment: 'held_at_last_practiced',
      reportedOccurredAt: at('2024-01-01T00:00:00.000Z'),
      appliedOccurredAt: before.lastPracticedAt,
    });

    const after = kcState(state, kcId);
    expect(after.lastPracticedAt).toBe(before.lastPracticedAt);

    const pLAfter = auth.getLessonRollups(state, [V3_LESSON_ID])[0];
    if (pLAfter?.status !== 'available') throw new Error('expected an available rollup');
    const memberAfter = pLAfter.view.members.find((m) => m.kcId === kcId)!;
    // A correct answer must not lower the estimate at all, let alone by ~1.0.
    expect(memberAfter.mastered).toBe(true);
    expect(memberAfter.pL).toBeGreaterThanOrEqual(memberBefore.pL);
    expect(memberBefore.pL - memberAfter.pL).toBe(0);
  });

  it('holds the decay clock but still applies the evidence of a late miss', () => {
    const auth = new Authority(loadSyntheticBank(), clock);
    const state = auth.createGuest();
    const kcId = V3_LESSON_KCS[0]!;
    // Three corrects, not forty: a `pL` saturated at exactly 1 is an absorbing
    // state for a miss under the shipped BKT update, which would make this test
    // pass without proving anything.
    for (let i = 0; i < 3; i += 1) {
      auth.applyQualifiedBktObservation(state, {
        observation: qualifiedObservation({ primaryKcId: kcId, sequence: i + 1 }),
        lessonId: V3_LESSON_ID,
      });
    }
    const pLBefore = kcState(state, kcId).pL;
    expect(pLBefore).toBeLessThan(1);

    auth.applyQualifiedBktObservation(state, {
      observation: qualifiedObservation({
        primaryKcId: kcId,
        correct: false,
        sequence: 999,
        occurredAt: '2024-01-01T00:00:00.000Z',
      }),
      lessonId: V3_LESSON_ID,
    });

    // Only the clock was held. The incorrect answer is real evidence and still
    // moves the estimate down — the clamp must not become a way to discard it.
    expect(kcState(state, kcId).pL).toBeLessThan(pLBefore);
    expect(kcState(state, kcId).lastPracticedAt).toBe(at(NOW));
  });

  it('detects an out-of-order arrival without discarding it', () => {
    const auth = new Authority(loadSyntheticBank(), clock);
    const state = auth.createGuest();

    const fifth = auth.applyQualifiedBktObservation(state, {
      observation: qualifiedObservation({ sequence: 5 }),
      lessonId: V3_LESSON_ID,
    });
    const pLAfterFifth = kcState(state, V3_LESSON_KCS[0]!).pL;

    const second = auth.applyQualifiedBktObservation(state, {
      observation: qualifiedObservation({ sequence: 2 }),
      lessonId: V3_LESSON_ID,
    });

    expect(fifth).toMatchObject({ status: 'applied', outOfOrder: false });
    expect(second).toMatchObject({ status: 'applied', outOfOrder: true });
    // Applied, not dropped: delayed delivery is normal and the evidence is real.
    expect(kcState(state, V3_LESSON_KCS[0]!).pL).toBeGreaterThan(pLAfterFifth);
    // The high-water mark does not regress, so a third late arrival is still flagged.
    expect(state.mastery!.highestAppliedObservationSequence).toBe(5);
    expect(ledger(state)[1]!.payload).toMatchObject({
      observationSequence: 2,
      outOfOrder: true,
    });
  });

  it('leaves a duplicate inert, including routing state and the ledger', () => {
    const auth = new Authority(loadSyntheticBank(), clock);
    const state = auth.createGuest();
    const observation = qualifiedObservation({ sequence: 3 });

    auth.applyQualifiedBktObservation(state, { observation, lessonId: V3_LESSON_ID });
    const after = JSON.stringify(state.mastery);

    const replay = auth.applyQualifiedBktObservation(state, {
      observation,
      lessonId: 'V3-LES-789208',
    });

    expect(replay).toEqual({
      status: 'duplicate',
      observationId: observation.observationId,
      kcId: V3_LESSON_KCS[0],
      reasoningOperation: 'QUANTIFY',
    });
    // "Moves nothing" now covers routing state too, not just P(L).
    expect(JSON.stringify(state.mastery)).toBe(after);
    expect(state.mastery!.practicedLessonIds).toEqual([V3_LESSON_ID]);
    expect(ledger(state)).toHaveLength(1);
  });
});

describe('Authority — legacy mastery state on read', () => {
  it('rebuilds a persisted `mastery: null` instead of throwing', () => {
    const auth = new Authority(loadSyntheticBank(), clock);
    const state = auth.createGuest();
    // A pre-seam projection can deserialize with an explicit null here; the
    // declared type describes what we write, not what we may read.
    (state as { mastery: unknown }).mastery = null;

    expect(() => auth.getMasterySkills(state)).not.toThrow();
    expect(state.mastery).toEqual({
      kc: {},
      skill: {},
      cars: {},
      practicedLessonIds: [],
      appliedObservationIds: [],
      highestAppliedObservationSequence: null,
    });
  });

  it('reports a lesson named twice only once', () => {
    const auth = new Authority(loadSyntheticBank(), clock);
    const state = auth.createGuest();

    expect(auth.getMasteryLessons(state, [V3_LESSON_ID, V3_LESSON_ID, V3_LESSON_ID])).toHaveLength(
      1,
    );
  });
});

describe('Authority — the decay-clock floor spans only the grains it writes', () => {
  // The synthetic graph's one hard prerequisite: basics → inhibition.
  const DEPENDENT_KC = 'bb1-enzyme-inhibition';
  const PREREQ_KC = 'bb1-enzyme-kinetics-basics';
  const LATE_REPORT = '2026-07-17T12:00:00.000Z'; // three days before NOW

  /**
   * Give the prerequisite a `lastPracticedAt` of NOW and nothing else. It is
   * primed under a DIFFERENT reasoning operation on purpose: the operation grain
   * is written by every observation, so reusing `QUANTIFY` here would raise the
   * floor legitimately and the prerequisite's contribution would be invisible.
   */
  function primePrerequisiteOnly(auth: Authority, state: LearnerState): void {
    auth.applyQualifiedBktObservation(state, {
      observation: qualifiedObservation({
        primaryKcId: PREREQ_KC,
        reasoningOperation: 'IDENTIFY',
        sequence: 1,
      }),
    });
    expect(state.mastery!.kc[PREREQ_KC]!.lastPracticedAt).toBe(at(NOW));
    expect(state.mastery!.kc[DEPENDENT_KC]).toBeUndefined();
    expect(state.mastery!.skill.QUANTIFY).toBeUndefined();
  }

  it('excludes a prerequisite from the floor when the answer is wrong', () => {
    const auth = new Authority(loadSyntheticBank(), clock);
    const state = auth.createGuest();
    primePrerequisiteOnly(auth, state);

    // An incorrect answer does not reinforce prerequisites, so the prerequisite
    // is not written and must not drag this observation's clock forward.
    const result = auth.applyQualifiedBktObservation(state, {
      observation: qualifiedObservation({
        primaryKcId: DEPENDENT_KC,
        correct: false,
        sequence: 2,
        occurredAt: LATE_REPORT,
      }),
    });

    expect(result).toMatchObject({
      status: 'applied',
      clockAdjustment: 'none',
      appliedOccurredAt: at(LATE_REPORT),
    });
    expect(state.mastery!.kc[DEPENDENT_KC]!.lastPracticedAt).toBe(at(LATE_REPORT));
    // The untouched prerequisite is left exactly where it was.
    expect(state.mastery!.kc[PREREQ_KC]!.lastPracticedAt).toBe(at(NOW));
  });

  it('includes a prerequisite in the floor when the answer is right, because it is written', () => {
    const auth = new Authority(loadSyntheticBank(), clock);
    const state = auth.createGuest();
    primePrerequisiteOnly(auth, state);

    // A correct answer DOES reinforce the prerequisite, stamping it with this
    // observation's clock, so excluding it from the floor would rewind it.
    const result = auth.applyQualifiedBktObservation(state, {
      observation: qualifiedObservation({
        primaryKcId: DEPENDENT_KC,
        correct: true,
        sequence: 2,
        occurredAt: LATE_REPORT,
      }),
    });

    expect(result).toMatchObject({
      status: 'applied',
      clockAdjustment: 'held_at_last_practiced',
      appliedOccurredAt: at(NOW),
    });
    expect(state.mastery!.kc[PREREQ_KC]!.lastPracticedAt).toBe(at(NOW));
  });
});
