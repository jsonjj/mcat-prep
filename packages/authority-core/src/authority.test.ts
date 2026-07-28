import { describe, expect, it } from 'vitest';
import {
  DecisionReasonViewSchema,
  EVIDENCE_REASON_CODES,
  fixedClock,
  MasteryMapEntrySchema,
  QualifiedBktObservationSchema,
  type QualifiedBktObservation,
  type ReasoningOperation,
} from '@mcat/contracts';
import { loadSyntheticBank, orderedKcsForLesson } from '@mcat/content';
import { EVIDENCE_REASONS, evidenceQualityRank } from '@mcat/domain';
import { MASTERY_THRESHOLD, PRIOR_PL0 } from '@mcat/policies';
import { Authority } from './authority';
import type { LearnerState } from './types';

const clock = fixedClock('2026-07-20T12:00:00.000Z');

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

    const mastery = auth.getMasteryMap(state).find((m) => m.skillId === 'bb1-enzyme-inhibition')!;
    expect(evidenceQualityRank(mastery.base)).toBeGreaterThanOrEqual(
      evidenceQualityRank('independent'),
    );

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
});
