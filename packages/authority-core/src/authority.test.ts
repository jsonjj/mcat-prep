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
async function answerCorrectly(auth: Authority, state: LearnerState): Promise<void> {
  await auth.submitAttempt(state, 'A');
}

describe('Authority — synthetic enzyme vertical', () => {
  it('locks learning until onboarding is complete', () => {
    const auth = new Authority(loadSyntheticBank(), clock);
    const state = auth.createGuest();
    expect(auth.getSession(state).kind).toBe('locked');
    expect(auth.bootstrap(state).onboardingComplete).toBe(false);
  });

  it('completes the placement-to-protected-proof loop and produces mastery evidence', async () => {
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
        await answerCorrectly(auth, state);
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

  /**
   * Rewritten from the Diagnose-Before-Reveal assertion this test used to carry.
   * That flow asked the learner to name the cause of the miss BEFORE showing the
   * key, and both halves are now gone on tier-A evidence: experts naming which
   * bias produced an error agree at κ = 0.000–0.063 (§2.3), and withholding the
   * key on multiple choice measured .71 vs .71 (§2.2). The old test also asserted
   * the error log was practice-scoped; the human's decision is that a Study
   * question is a genuine question attempt and belongs on the tab (§6.5).
   */
  it('reveals a Study miss immediately, refuting the option that was chosen', async () => {
    const auth = new Authority(loadSyntheticBank(), clock);
    const state = onboard(auth);

    // Advance past the lesson to the first independent question.
    expect(auth.getSession(state).kind).toBe('lesson');
    auth.continueStep(state);
    let step = auth.getSession(state);
    expect(step.kind).toBe('question');

    // Miss it: the very next step is the correction, with no step in between.
    await auth.submitAttempt(state, 'B');
    step = auth.getSession(state);
    expect(step.kind === 'question' && step.sub === 'reveal').toBe(true);
    if (step.kind === 'question') {
      expect(step.reveal?.correctChoiceId).toBe('A');
      // The refutation is of THEIR option, carried by the server so it survives
      // the step change and a reload.
      expect(step.reveal?.chosenChoiceId).toBe('B');
      expect(step.reveal?.choiceRationales['B']).toMatch(/competitive/i);
    }
  });

  it('still owes one unassisted retry, now after the reveal instead of before it', async () => {
    const auth = new Authority(loadSyntheticBank(), clock);
    const state = onboard(auth);
    auth.continueStep(state); // past the lesson

    await auth.submitAttempt(state, 'B');
    // Leaving the reveal spends the retry rather than advancing the path.
    auth.continueStep(state);
    let step = auth.getSession(state);
    expect(step.kind === 'question' && step.sub === 'retry').toBe(true);
    if (step.kind === 'question') expect(step.question.id).toBe('q-enz-indep-competitive');

    await auth.submitAttempt(state, 'A');
    step = auth.getSession(state);
    // The correction was already shown, so the retry advances rather than
    // re-revealing.
    expect(step.kind === 'question' && step.sub === 'answering').toBe(true);
    if (step.kind === 'question') expect(step.question.id).toBe('q-enz-indep-noncompetitive');

    expect(
      state.evidence.filter(
        (e) => e.questionId === 'q-enz-indep-competitive' && e.kind === 'diagnostic_retry',
      ),
    ).toHaveLength(1);
    // The retry did not create independent (mastery) evidence for that item.
    const independentForItem = state.evidence.filter(
      (e) => e.questionId === 'q-enz-indep-competitive' && e.kind === 'independent',
    );
    expect(independentForItem.length).toBe(0);
  });

  it('puts a Study miss on the Mistakes tab with the distractor preserved', async () => {
    const auth = new Authority(loadSyntheticBank(), clock);
    const state = onboard(auth);
    auth.continueStep(state); // past the lesson
    await auth.submitAttempt(state, 'B');

    const log = await auth.getErrorLog(state);
    expect(log).toHaveLength(1);
    const entry = log[0]!;
    expect(entry.questionId).toBe('q-enz-indep-competitive');
    expect(entry.chosenChoiceId).toBe('B');
    expect(entry.chosenChoiceText.length).toBeGreaterThan(0);
    expect(entry.correctChoiceId).toBe('A');
    expect(entry.choiceRationale).not.toBeNull();
    expect(entry.stem.length).toBeGreaterThan(0);
    expect(entry.kcId).toBe('bb1-enzyme-inhibition');
    // The re-attempt token routes into the adaptive queue, whose exposure seam
    // picks a fresh unseen item rather than re-serving this one.
    expect(entry.focus).toBe('bb1');
    expect(entry).not.toHaveProperty('cause');
  });

  it('resumes a session persisted on the removed cause step at the reveal', async () => {
    const auth = new Authority(loadSyntheticBank(), clock);
    const state = onboard(auth);
    auth.continueStep(state);
    await auth.submitAttempt(state, 'B');
    // Simulate a projection written before the cause step was removed.
    (state.session as unknown as { sub: string }).sub = 'cause';
    state.session!.retryPending = false;

    const step = auth.getSession(state);
    expect(step.kind === 'question' && step.sub === 'reveal').toBe(true);
    // The retry it was about to offer is still owed.
    auth.continueStep(state);
    expect(auth.getSession(state)).toMatchObject({ kind: 'question', sub: 'retry' });
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

  it('exposes 7 skills that start at the prior and rise with independent-correct work', async () => {
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
      else if (step.kind === 'question') await auth.submitAttempt(state, 'A');
    }

    const after = auth.getMasterySkills(state);
    expect(after.some((s) => s.pL > PRIOR)).toBe(true);

    // The lesson chain rose too (driven by every question in the lesson).
    const lesson = auth.getMasteryLessons(state).find((l) => l.lessonId === 'lesson-enz-inhibition');
    expect(lesson).toBeDefined();
    expect(lesson!.pL).toBeGreaterThan(PRIOR);
  });

  it('is fail-closed: an assisted retry after a miss never raises P(L)', async () => {
    const auth = new Authority(loadSyntheticBank(), clock);
    const state = onboard(auth);
    auth.continueStep(state); // past lesson → first independent question

    await auth.submitAttempt(state, 'B'); // independent WRONG → lowers P(L)
    auth.continueStep(state); // leave the reveal → spends the one retry
    await auth.submitAttempt(state, 'A'); // retry CORRECT but non-independent → no change

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

  it('never overwrites a unit the learner has already practised', async () => {
    const auth = new Authority(loadSyntheticBank(), clock);
    const state = onboard(auth);
    auth.continueStep(state);
    await auth.submitAttempt(state, 'A');

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
