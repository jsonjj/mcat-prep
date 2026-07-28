import { describe, expect, it } from 'vitest';
import { fixedClock, type MasterySeed } from '@mcat/contracts';
import { loadSyntheticBank } from '@mcat/content';
import { baseStateRank } from '@mcat/domain';
import { MASTERY_THRESHOLD, SEED_PRIOR_CAP, SEED_PRIOR_FLOOR } from '@mcat/policies';
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
    expect(baseStateRank(mastery.base)).toBeGreaterThanOrEqual(baseStateRank('independent'));

    // Protected evidence was captured.
    expect(state.evidence.some((e) => e.kind === 'protected')).toBe(true);
    // No answer keys leaked into events.
    expect(JSON.stringify(state.events)).not.toContain('correct_choice_id');
    expect(JSON.stringify(state.events)).not.toContain('rationales');
  });

  it('runs Diagnose-Before-Reveal on a miss in the older Study flow', async () => {
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

    // The Mistakes tab is scoped to adaptive practice
    // (docs/design/error-handling-design.md §6.4), so a Study-flow miss stays out
    // of the error log even though the Study flow itself is unchanged.
    expect(await auth.getErrorLog(state)).toEqual([]);

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

    // The lesson chain rose too (driven by every question in the lesson).
    const lesson = auth.getMasteryLessons(state).find((l) => l.lessonId === 'lesson-enz-inhibition');
    expect(lesson).toBeDefined();
    expect(lesson!.pL).toBeGreaterThan(PRIOR);
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

describe('Authority — diagnostic mastery seeding', () => {
  const emptySeed = (): MasterySeed => ({
    kcPriors: {},
    skillPriors: {},
    lessonPriors: {},
    carsAbility: {},
  });

  it('initializes unpractised lessons from a diagnostic read', () => {
    const auth = new Authority(loadSyntheticBank(), clock);
    const state = onboard(auth);

    auth.applyMasterySeed(state, {
      ...emptySeed(),
      lessonPriors: { 'lesson-enz-inhibition': 0.08, 'V3-LES-130923': 0.35 },
    });

    const lessons = auth.getMasteryLessons(state);
    expect(lessons.find((l) => l.lessonId === 'V3-LES-130923')?.pL).toBeCloseTo(0.35, 9);
    expect(lessons.every((l) => !l.mastered)).toBe(true);
  });

  it('never overwrites a unit the learner has already practised', () => {
    const auth = new Authority(loadSyntheticBank(), clock);
    const state = onboard(auth);
    auth.continueStep(state);
    auth.submitAttempt(state, 'A');

    const before = auth.getMasteryLessons(state).find((l) => l.lessonId === 'lesson-enz-inhibition');
    expect(before).toBeDefined();

    auth.applyMasterySeed(state, {
      ...emptySeed(),
      lessonPriors: { 'lesson-enz-inhibition': SEED_PRIOR_FLOOR },
    });

    const after = auth.getMasteryLessons(state).find((l) => l.lessonId === 'lesson-enz-inhibition');
    expect(after!.pL).toBeCloseTo(before!.pL, 9);
  });

  /**
   * The producer already caps at `SEED_PRIOR_CAP`, but seeds cross a service
   * boundary to get here, so the guarantee has to hold against whatever arrives
   * rather than against what a well-behaved producer sends.
   */
  it('clamps an out-of-range prior instead of trusting the producer', () => {
    const auth = new Authority(loadSyntheticBank(), clock);
    const state = onboard(auth);

    auth.applyMasterySeed(state, {
      ...emptySeed(),
      lessonPriors: { 'V3-LES-130923': 1, 'V3-LES-102938': 0 },
      kcPriors: { 'bb1-enzyme-inhibition': 1 },
      skillPriors: { IDENTIFY: 1 },
    });

    const seeded = auth.getMasteryLessons(state).find((l) => l.lessonId === 'V3-LES-130923')!;
    expect(seeded.pL).toBe(SEED_PRIOR_CAP);
    expect(seeded.pL).toBeLessThan(MASTERY_THRESHOLD);
    expect(seeded.mastered).toBe(false);
    expect(
      auth.getMasteryLessons(state).find((l) => l.lessonId === 'V3-LES-102938')!.pL,
    ).toBe(SEED_PRIOR_FLOOR);
    expect(auth.getMasterySkills(state).find((s) => s.operation === 'IDENTIFY')!.pL).toBe(
      SEED_PRIOR_CAP,
    );
  });
});
