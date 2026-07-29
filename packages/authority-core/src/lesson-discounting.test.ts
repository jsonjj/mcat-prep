/**
 * Lesson exits, through the real Authority: discounted movement and an
 * evidence-gated claim.
 *
 * Two properties are proved here that a pure-policy test cannot reach, because
 * both are about the wiring rather than the arithmetic:
 *
 *   1. A lesson-exit observation really is scored at the raised guess by the
 *      time it reaches a grain, and moves `P(L)` LESS than a practice answer
 *      does from the same prior on the same grain under the same conditions —
 *      with NO cap anywhere between the engine and the stored value.
 *   2. `mastered` really does require both halves. A lesson whose every
 *      required KC sits at the top of the scale is NOT mastered while its
 *      warrant is thin, and becomes mastered the moment the warrant arrives —
 *      from the same `evaluateEvidence` the Evidence Atlas publishes, not a
 *      second sufficiency rule written for the rollup.
 */
import { describe, expect, it } from 'vitest';
import {
  fixedClock,
  QualifiedBktObservationSchema,
  UtcTimestampSchema,
  type QualifiedBktObservation,
  type ReasoningOperation,
  type UtcTimestamp,
} from '@mcat/contracts';
import { clusterForKc, loadSyntheticBank, orderedKcsForLesson } from '@mcat/content';
import { EvidenceRecordSchema } from '@mcat/domain';
import { GUESS_G, LESSON_EXIT_GUESS_G, MASTERY_THRESHOLD, PRIOR_PL0 } from '@mcat/policies';
import { Authority } from './authority';
import { SyntheticPracticeBankPort, type PracticeItemClassification } from './practice';
import type { LearnerState } from './types';

const NOW = '2026-07-20T12:00:00.000Z';
const clock = fixedClock(NOW);
const at = (iso: string): UtcTimestamp => UtcTimestampSchema.parse(iso);

const LESSON_ID = 'V3-LES-130923';
const LESSON_KCS = orderedKcsForLesson(LESSON_ID)!;
const KC = LESSON_KCS[0]!;
const OPERATION: ReasoningOperation = 'QUANTIFY';

const lessonExit = (overrides: Record<string, unknown> = {}): QualifiedBktObservation =>
  QualifiedBktObservationSchema.parse({
    observationId: crypto.randomUUID(),
    questionId: 'ALG-GRAPH-ENTRY-01',
    itemBindingId: 'V3-LES-130923-ITEM-01',
    bindingVersion: 'internal-draft-1',
    serverItemVersion: 7,
    primaryKcId: KC,
    reasoningOperation: OPERATION,
    correct: true,
    occurredAt: NOW,
    sequence: 1,
    contentRelease: 'synthetic-2026.07',
    policies: [{ policyId: 'mastery-bkt', version: 'provisional-v2' }],
    // A lesson exit is uncalibrated (`dokLevel` absent → b = 0), which is what
    // makes the practice comparison below an apples-to-apples one.
    ...overrides,
  });

/**
 * A practice port that serves the SAME grain a lesson exit targets, uncalibrated.
 *
 * Without it the two channels would differ in KC, reasoning operation, DOK and
 * population stats all at once, and any difference in `P(L)` could be attributed
 * to the item rather than to the channel. Holding all four equal leaves the
 * guess parameter as the only thing that differs.
 */
class SameGrainAsLessonBank extends SyntheticPracticeBankPort {
  override async classify(questionId: string): Promise<PracticeItemClassification | null> {
    const base = await super.classify(questionId);
    return base === null
      ? null
      : {
          ...base,
          domain: 'science',
          kcId: KC,
          skill: OPERATION,
          cluster: clusterForKc(KC),
          dok: null,
          lessonId: LESSON_ID,
        };
  }

  override async questionStats(): Promise<{ attempts: number; correct: number }> {
    return { attempts: 0, correct: 0 };
  }
}

/** One clean, correct, unassisted record — the shape a mastery recipe accepts. */
function independentRecord(state: LearnerState, skillId: string, familyId: string): void {
  state.evidence.push(
    EvidenceRecordSchema.parse({
      evidenceId: crypto.randomUUID(),
      skillId,
      cluster: clusterForKc(skillId),
      kind: 'independent',
      independent: true,
      assistanceLevel: 'A0',
      contentBearingHint: false,
      questionId: `${skillId}-${familyId}`,
      itemVersion: 1,
      familyId,
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
      sequence: state.evidence.length + 1,
      contentRelease: 'synthetic-2026.07',
      policies: [],
    }),
  );
}

const kcPL = (state: LearnerState, kcId = KC): number => state.mastery!.kc[kcId]!.pL;

/**
 * Teach every KC the bank can serve, so teach-before-test admits this learner.
 *
 * The practice queue is gated per-KC on `state.taughtKcIds` and fails closed on
 * an EMPTY taught set as well as on a miss, so a guest who has completed no
 * lesson is served no science material. The comparisons below need the practice
 * channel to actually deliver an item.
 */
async function teachTheWholeBank(authority: Authority, state: LearnerState): Promise<void> {
  const units = await authority.practiceBank.listUnits({ limit: 400 });
  state.taughtKcIds = [...new Set(units.map((u) => u.kcId))];
}

const lessonView = (auth: Authority, state: LearnerState) =>
  auth.getMasteryLessons(state, [LESSON_ID]).find((l) => l.lessonId === LESSON_ID)!;

describe('a lesson exit moves P(L) less than a practice answer, via the guess', () => {
  it('is scored at the raised guess where practice is scored at the plain one', async () => {
    const bank = loadSyntheticBank();

    const lessonAuth = new Authority(bank, clock);
    const lessonState = lessonAuth.createGuest();
    lessonAuth.applyQualifiedBktObservation(lessonState, {
      observation: lessonExit(),
      lessonId: LESSON_ID,
    });

    const practiceAuth = new Authority(bank, clock, new SameGrainAsLessonBank(bank));
    const practiceState = practiceAuth.createGuest();
    await teachTheWholeBank(practiceAuth, practiceState);
    const queue = await practiceAuth.getPracticeQueue(practiceState, 5);
    const item = queue.items.find((i) => i.domain === 'science')!;
    const answer = await practiceAuth.practiceBank.getAnswer(item.question.id);
    await practiceAuth.submitPracticeAttempt(practiceState, {
      questionId: item.question.id,
      specId: item.specId,
      chosenChoiceId: answer!.correctChoiceId,
    });

    // Both start from the same 0.2 prior on the same uncalibrated grain and
    // answer correctly. The only difference is how much the channel is believed.
    expect(LESSON_EXIT_GUESS_G).toBe(2 * GUESS_G);
    expect(kcPL(lessonState)).toBeCloseTo(0.430401, 6); // +0.2304 from the prior
    expect(kcPL(practiceState)).toBeCloseTo(0.571692, 6); // +0.3717 from the prior
    expect(kcPL(lessonState)).toBeLessThan(kcPL(practiceState));

    // Discounted, not ignored: the lesson still moved capability by a lot.
    expect(kcPL(lessonState)).toBeGreaterThan(PRIOR_PL0);
  });

  it('reaches and passes the mastery cut, so nothing on the path is capping it', async () => {
    // A ceiling, a max-delta or a soft cap at any value below 1 would show up
    // as a trajectory that stops climbing. This one climbs to the cut in five
    // correct exits and keeps going, which is what lets the grain express real
    // mastery and lets decay mean something afterwards.
    const auth = new Authority(loadSyntheticBank(), clock);
    const state = auth.createGuest();

    const trajectory: number[] = [];
    for (let i = 0; i < 12; i += 1) {
      auth.applyQualifiedBktObservation(state, {
        observation: lessonExit({ sequence: i + 1 }),
        lessonId: LESSON_ID,
      });
      const pL = kcPL(state);
      if (i > 0) expect(pL).toBeGreaterThan(trajectory[i - 1]!);
      trajectory.push(pL);
    }

    expect(trajectory.findIndex((p) => p >= MASTERY_THRESHOLD) + 1).toBe(5);
    expect(trajectory.at(-1)!).toBeGreaterThan(0.999);
  });
});

describe('a lesson is mastered only with the warrant to say so', () => {
  /** Drive every required KC of the lesson well past the cut, warrant or not. */
  function driveEveryKcOverTheCut(auth: Authority, state: LearnerState): void {
    let sequence = 0;
    for (const kcId of LESSON_KCS) {
      for (let i = 0; i < 20; i += 1) {
        sequence += 1;
        auth.applyQualifiedBktObservation(state, {
          observation: lessonExit({ primaryKcId: kcId, sequence }),
          lessonId: LESSON_ID,
        });
      }
    }
  }

  it('withholds mastery from a lesson at the top of the scale with thin evidence', () => {
    const auth = new Authority(loadSyntheticBank(), clock);
    const state = auth.createGuest();
    driveEveryKcOverTheCut(auth, state);

    const [rollup] = auth.getLessonRollups(state, [LESSON_ID]);
    if (rollup?.status !== 'available') throw new Error('expected an available rollup');

    // The capability half could not be stronger...
    expect(rollup.view.members.every((m) => m.pL >= MASTERY_THRESHOLD)).toBe(true);
    expect(rollup.view.pL).toBeGreaterThanOrEqual(MASTERY_THRESHOLD);
    // ...and the claim is still refused, on every member, for want of a warrant.
    expect(rollup.view.members.every((m) => m.evidenceSufficient)).toBe(false);
    expect(rollup.view.mastered).toBe(false);
    expect(lessonView(auth, state).mastered).toBe(false);
  });

  it('grants it once every required KC carries the warrant too', () => {
    const auth = new Authority(loadSyntheticBank(), clock);
    const state = auth.createGuest();
    driveEveryKcOverTheCut(auth, state);
    expect(lessonView(auth, state).mastered).toBe(false);

    // The independence recipe: correct, unassisted evidence across two item
    // families. Nothing else about the learner changes.
    for (const kcId of LESSON_KCS) {
      independentRecord(state, kcId, `${kcId}-fam-a`);
      independentRecord(state, kcId, `${kcId}-fam-b`);
    }

    const [rollup] = auth.getLessonRollups(state, [LESSON_ID]);
    if (rollup?.status !== 'available') throw new Error('expected an available rollup');
    expect(rollup.view.members.every((m) => m.evidenceSufficient)).toBe(true);
    expect(rollup.view.mastered).toBe(true);
    expect(lessonView(auth, state).mastered).toBe(true);
  });

  it('one unwarranted KC is enough to withhold the claim', () => {
    // The gate is per required KC, the same way the capability cut is: a lesson
    // is not mastered because most of it is.
    const auth = new Authority(loadSyntheticBank(), clock);
    const state = auth.createGuest();
    driveEveryKcOverTheCut(auth, state);
    for (const kcId of LESSON_KCS.slice(0, -1)) {
      independentRecord(state, kcId, `${kcId}-fam-a`);
      independentRecord(state, kcId, `${kcId}-fam-b`);
    }

    const [rollup] = auth.getLessonRollups(state, [LESSON_ID]);
    if (rollup?.status !== 'available') throw new Error('expected an available rollup');
    expect(rollup.view.members.filter((m) => !m.evidenceSufficient).map((m) => m.kcId)).toEqual([
      LESSON_KCS.at(-1),
    ]);
    expect(rollup.view.mastered).toBe(false);
  });

  it('reads the same warrant the Evidence Atlas publishes, not a second one', () => {
    // One derivation of "is this grain adequately evidenced". If the rollup
    // computed its own, the learner could be told the warrant is satisfied on
    // the Atlas while the lesson refuses to call itself mastered, or worse.
    const auth = new Authority(loadSyntheticBank(), clock);
    const state = auth.createGuest();
    driveEveryKcOverTheCut(auth, state);
    independentRecord(state, KC, 'fam-a');
    independentRecord(state, KC, 'fam-b');

    const [rollup] = auth.getLessonRollups(state, [LESSON_ID]);
    if (rollup?.status !== 'available') throw new Error('expected an available rollup');
    const sufficientKcs = rollup.view.members
      .filter((m) => m.evidenceSufficient)
      .map((m) => m.kcId);
    const satisfiedOnTheAtlas = auth
      .getMasteryMap(state)
      .filter((entry) => entry.reasons.some((r) => r.code === 'INDEPENDENT_EVIDENCE_SATISFIED'))
      .map((entry) => entry.skillId);

    expect(sufficientKcs).toEqual([KC]);
    expect(satisfiedOnTheAtlas).toEqual([KC]);
  });

  it('is satisfiable from the practice channel, so the gate is not lesson-only', async () => {
    // Practice writes an evidence record on every response in the same shape
    // lesson evidence carries, so warrant can accrue from either side. A gate
    // only one channel could ever satisfy would be a gate on the channel.
    const bank = loadSyntheticBank();
    const auth = new Authority(bank, clock, new SameGrainAsLessonBank(bank));
    const state = auth.createGuest();
    await teachTheWholeBank(auth, state);

    const queue = await auth.getPracticeQueue(state, 6);
    const answered: string[] = [];
    for (const item of queue.items.filter((i) => i.domain === 'science').slice(0, 2)) {
      const answer = await auth.practiceBank.getAnswer(item.question.id);
      await auth.submitPracticeAttempt(state, {
        questionId: item.question.id,
        specId: item.specId,
        chosenChoiceId: answer!.correctChoiceId,
      });
      answered.push(item.question.id);
    }
    expect(answered.length).toBe(2);

    const written = state.evidence.filter((e) => e.skillId === KC);
    expect(written).toHaveLength(2);
    expect(written.every((e) => e.independent && e.kind === 'independent')).toBe(true);
    // Two families is what the independence recipe asks for; the synthetic
    // corpus gives each item its own, so two answers clear it.
    expect(new Set(written.map((e) => e.familyId)).size).toBe(2);

    const [rollup] = auth.getLessonRollups(state, [LESSON_ID]);
    if (rollup?.status !== 'available') throw new Error('expected an available rollup');
    expect(rollup.view.members.find((m) => m.kcId === KC)!.evidenceSufficient).toBe(true);
  });

  it('publishes the capability estimate regardless, so a withheld claim is not a zero', () => {
    // The reason the conservatism lives in the gate and not in a cap: the
    // planner still reads a strong lesson as strong through `pL`, so it does
    // not re-teach known material while the warrant is being earned.
    const auth = new Authority(loadSyntheticBank(), clock);
    const state = auth.createGuest();
    driveEveryKcOverTheCut(auth, state);

    const view = lessonView(auth, state);
    expect(view.mastered).toBe(false);
    expect(view.pL).toBeGreaterThanOrEqual(MASTERY_THRESHOLD);
  });

  it('treats a lesson with no activity at all as neither mastered nor warranted', () => {
    const auth = new Authority(loadSyntheticBank(), clock);
    const state = auth.createGuest();
    const [rollup] = auth.getLessonRollups(state, [LESSON_ID]);
    if (rollup?.status !== 'available') throw new Error('expected an available rollup');
    expect(rollup.view.members.every((m) => m.pL === PRIOR_PL0)).toBe(true);
    expect(rollup.view.members.every((m) => !m.evidenceSufficient)).toBe(true);
    expect(rollup.view.mastered).toBe(false);
    expect(at(NOW)).toBe(NOW);
  });
});
