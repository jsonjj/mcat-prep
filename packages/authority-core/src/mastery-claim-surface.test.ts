import { describe, expect, it } from 'vitest';
import {
  LessonMasteryViewSchema,
  REASONING_OPERATIONS,
  SkillMasteryViewSchema,
  fixedClock,
  type CandidateLessonInput,
  type UtcTimestamp,
} from '@mcat/contracts';
import { loadSyntheticBank, orderedKcsForLesson } from '@mcat/content';
import {
  MASTERY_THRESHOLD,
  initialMemoryState,
  rollUpLessonMastery,
  type MemoryState,
} from '@mcat/policies';
import { Authority } from './authority';
import type { LearnerState } from './types';

/**
 * NO LEARNER-FACING SURFACE CLAIMS MASTERY FROM `P(L)` ALONE.
 *
 * The capability estimate is BKT's and the warrant is the evidence system's;
 * "mastered" asserts both, so a surface holding only the first may report the
 * estimate and may not make the claim. `SkillMasteryView` broke that with a bare
 * `mastered: pL >= MASTERY_THRESHOLD`, measured live at `pL = 0.9622478606`,
 * `mastered: true`, evidence count `0` — and it fed the Progress rings, Home's
 * glowing count and Wrapped, so the most visible mastery claim in the product
 * was the only one that never consulted the evidence system.
 *
 * The state below is the adversarial one: every grain handed its MAXIMUM `P(L)`
 * of 1, and not one evidence record anywhere. Anything still saying "mastered"
 * here is saying it on capability alone.
 *
 * `tests/architecture/mastery-definition-single-source.test.ts` is the other
 * half of this: it forbids a second DEFINITION textually, where this measures
 * the OUTPUT. Neither subsumes the other — a definition can be single and
 * wrong, and an output can be right today for a reason nothing holds in place.
 */

const NOW = '2026-07-20T12:00:00.000Z' as UtcTimestamp;
const clock = fixedClock(NOW);

const LESSON_ID = 'V3-LES-789208';
const membership = orderedKcsForLesson(LESSON_ID);
if (membership === null) throw new Error('the probe lesson must have registry membership');
const LESSON_KCS: readonly string[] = membership;

/** The maximum any grain can hold. Nothing about it is warranted. */
const MAXIMUM_CAPABILITY = (): MemoryState => initialMemoryState(1);

const candidateLessons: CandidateLessonInput[] = [
  {
    lessonId: LESSON_ID,
    slug: 'probe',
    title: 'Probe lesson',
    section: 'bb',
    cluster: null,
    kcCount: LESSON_KCS.length,
    kcIds: [...LESSON_KCS],
    prerequisiteLessonIds: [],
    estimatedMinutes: 20,
  },
];

/** Maximum capability everywhere, zero evidence anywhere. */
function maximumCapabilityNoEvidence(auth: Authority): LearnerState {
  const state = auth.createGuest();
  // Reached through the seed rather than by hand-writing grains, then raised:
  // the seed is capped far below the cut on purpose, so the raise is explicit.
  auth.applyMasterySeed(state, {
    kcPriors: Object.fromEntries(LESSON_KCS.map((kcId) => [kcId, 0.4])),
    skillPriors: {},
    carsAbility: {},
  });
  const mastery = state.mastery!;
  for (const kcId of LESSON_KCS) mastery.kc[kcId] = MAXIMUM_CAPABILITY();
  for (const operation of REASONING_OPERATIONS) mastery.skill[operation] = MAXIMUM_CAPABILITY();
  mastery.practicedLessonIds = [LESSON_ID];
  expect(state.evidence).toHaveLength(0);
  return state;
}

/** Every `mastered` value anywhere in a payload, however deeply nested. */
function masteredValues(payload: unknown, found: boolean[] = []): boolean[] {
  if (Array.isArray(payload)) {
    for (const entry of payload) masteredValues(entry, found);
    return found;
  }
  if (payload !== null && typeof payload === 'object') {
    for (const [key, value] of Object.entries(payload)) {
      if (key === 'mastered' && typeof value === 'boolean') found.push(value);
      masteredValues(value, found);
    }
    return found;
  }
  return found;
}

describe('no learner-facing surface claims mastery from P(L) alone', () => {
  it('publishes the capability half of a reasoning skill under its own name', () => {
    const auth = new Authority(loadSyntheticBank(), clock);
    const state = maximumCapabilityNoEvidence(auth);

    const skills = auth.getMasterySkills(state);
    expect(skills).toHaveLength(7);
    for (const skill of skills) {
      expect(skill.pL).toBe(1);
      expect(skill.atCapabilityCut).toBe(true);
      expect(
        'mastered' in skill,
        'SkillMasteryView carries no evidence warrant, so a field called `mastered` on it is a ' +
          'claim with nothing behind it. Publish `atCapabilityCut`.',
      ).toBe(false);
    }
  });

  it('refuses a `mastered` field at the wire boundary, not merely in the type', () => {
    // The schema is `.strict()`, so this is enforced on the parse rather than by
    // the compiler alone — a hand-built payload cannot smuggle the field back.
    const [first] = auth().getMasterySkills(maximumCapabilityNoEvidence(auth()));
    expect(SkillMasteryViewSchema.safeParse(first).success).toBe(true);
    expect(
      SkillMasteryViewSchema.safeParse({ ...first, mastered: true }).success,
      'SkillMasteryViewSchema accepted a `mastered` field. A strict schema is what keeps the ' +
        'claim off a view that cannot support it.',
    ).toBe(false);
  });

  it('withholds the lesson claim at maximum capability with no warrant', () => {
    const authority = auth();
    const state = maximumCapabilityNoEvidence(authority);

    const [lesson] = authority.getMasteryLessons(state);
    expect(lesson).toBeDefined();
    expect(LessonMasteryViewSchema.safeParse(lesson).success).toBe(true);
    // The capability estimate is published IN FULL — a withheld claim is not a
    // zero to the planner — and the claim is still withheld.
    expect(lesson!.pL).toBe(1);
    expect(lesson!.pL).toBeGreaterThanOrEqual(MASTERY_THRESHOLD);
    expect(lesson!.mastered).toBe(false);

    const rollup = authority.getLessonRollups(state, [LESSON_ID])[0]!;
    expect(rollup.status).toBe('available');
    if (rollup.status !== 'available') throw new Error('unreachable');
    // Named, so a future reader can see WHICH half failed rather than inferring.
    for (const member of rollup.view.members) {
      expect(member.pL).toBe(1);
      expect(member.evidenceSufficient).toBe(false);
      expect(member.mastered).toBe(false);
    }
  });

  it('says nothing is mastered on ANY surface, at maximum capability with no evidence', async () => {
    const authority = auth();
    const state = maximumCapabilityNoEvidence(authority);
    await authority.buildTodaysPath(state, {
      recallLoad: {
        dueLearning: 0,
        dueReviews: 0,
        newAvailable: 0,
        due: 0,
        estimatedMinutesForDue: 0,
      },
      candidateLessons,
      force: true,
    });

    const surfaces: Record<string, unknown> = {
      skills: authority.getMasterySkills(state),
      lessons: authority.getMasteryLessons(state),
      warrants: authority.getMasteryMap(state),
      rollups: authority.getLessonRollups(state, [LESSON_ID]),
      wrapped: await authority.getWrapped(state),
      cars: authority.getCarsReadiness(state),
      today: authority.getTodaysPath(state),
      bootstrap: authority.bootstrap(state),
    };

    for (const [name, payload] of Object.entries(surfaces)) {
      const claims = masteredValues(payload);
      expect(
        claims.filter((value) => value),
        `${name} claims mastery with zero evidence records on file. Every published ` +
          "`mastered` is the rollup's composed claim, and the warrant half is unmet here.",
      ).toEqual([]);
    }

    // Anti-vacuity for the sweep: at least one `mastered` field was actually
    // reached, so "no true values" is not "no values".
    expect(masteredValues(surfaces.lessons).length).toBeGreaterThan(0);
    expect(masteredValues(surfaces.rollups).length).toBeGreaterThan(0);

    // "Glowing" is the capability reading and it is FULL, which is what makes
    // the withheld claim above a gate rather than an outage.
    expect((await authority.getWrapped(state)).skillsGlowing).toBe(7);
  });

  it('grants the claim once the warrant half is met, so the gate is not a constant', () => {
    // The positive control, taken at the definition rather than through the
    // lesson channel — which cannot satisfy the independence slot at all
    // (`tests/architecture/lesson-mastery-reachability.test.ts`), so routing the
    // control through it would prove nothing about the gate.
    const kcStates: Record<string, MemoryState> = Object.fromEntries(
      LESSON_KCS.map((kcId) => [kcId, MAXIMUM_CAPABILITY()]),
    );
    const warranted = rollUpLessonMastery({
      lessonId: LESSON_ID,
      requiredKcIds: LESSON_KCS,
      kcStates,
      kcEvidenceQuality: Object.fromEntries(LESSON_KCS.map((kcId) => [kcId, 'independent'])),
      now: NOW,
    });
    expect(warranted.status).toBe('available');
    if (warranted.status !== 'available') throw new Error('unreachable');
    expect(warranted.view.mastered).toBe(true);

    // And one unwarranted member is enough to withhold it again.
    const [firstKc, ...restKcs] = LESSON_KCS;
    const partlyWarranted = rollUpLessonMastery({
      lessonId: LESSON_ID,
      requiredKcIds: LESSON_KCS,
      kcStates,
      kcEvidenceQuality: Object.fromEntries(restKcs.map((kcId) => [kcId, 'independent'])),
      now: NOW,
    });
    expect(partlyWarranted.status).toBe('available');
    if (partlyWarranted.status !== 'available') throw new Error('unreachable');
    expect(partlyWarranted.view.mastered).toBe(false);
    expect(
      partlyWarranted.view.members.find((member) => member.kcId === firstKc)?.evidenceSufficient,
    ).toBe(false);
  });
});

const auth = (): Authority => new Authority(loadSyntheticBank(), clock);
