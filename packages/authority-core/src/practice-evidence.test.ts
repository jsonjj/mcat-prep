import { describe, expect, it } from 'vitest';
import {
  AssistanceLevelSchema,
  EventIdSchema,
  IdempotencyKeySchema,
  LearnerIdSchema,
  LessonItemBindingSchema,
  LessonRuntimeResponseFactsSchema,
  PracticeAttemptCommandSchema,
  UtcTimestampSchema,
  fixedClock,
  type Clock,
  type LessonItemBinding,
  type PracticeAttemptCommand,
} from '@mcat/contracts';
import {
  EvidenceRecordSchema,
  adaptLessonResponse,
  isMasteryEligible,
  type EvidenceRecord,
} from '@mcat/domain';
import { loadSyntheticBank } from '@mcat/content';
import { Authority } from './authority';
import { SyntheticPracticeBankPort, type PracticeItemClassification } from './practice';
import type { LearnerState } from './types';

/**
 * Practice writes the SAME evidence record lessons write.
 *
 * Evidence sufficiency is computed across both channels, so a practice-shaped
 * record that omitted a field lesson evidence carries would make "mastered
 * requires evidence" mean two different things depending on where the evidence
 * came from. These assertions compare the two channels' real outputs against
 * each other rather than each against a description of the other.
 */

const NOW = '2026-07-27T12:00:00.000Z';
const CLOCK = fixedClock(NOW);

function movableClock(initial: string): { clock: Clock; set: (iso: string) => void } {
  let value = UtcTimestampSchema.parse(initial);
  return {
    clock: { now: () => value },
    set: (iso: string) => {
      value = UtcTimestampSchema.parse(iso);
    },
  };
}

function freshLearner(clock: Clock = CLOCK): { authority: Authority; state: LearnerState } {
  const authority = new Authority(undefined, clock);
  return { authority, state: authority.createGuest() };
}

/**
 * Teach every KC the bank can serve, so teach-before-test admits this learner.
 *
 * The queue is gated per-KC on `state.taughtKcIds` — the union of completed
 * lessons' KCs — and that gate fails closed on an EMPTY taught set as well as on
 * a miss, so a guest who has completed no lesson is served no science material
 * at all. Every test in this file is about what an ANSWER records, so each has
 * to get past the gate first; `practice.test.ts` owns the gate itself. Read off
 * the bank's own units so the fixture cannot drift from the material under test.
 */
async function teachTheWholeBank(authority: Authority, state: LearnerState): Promise<void> {
  const units = await authority.practiceBank.listUnits({ limit: 400 });
  state.taughtKcIds = [...new Set(units.map((u) => u.kcId))];
}

async function firstQueuedScienceItem(authority: Authority, state: LearnerState) {
  await teachTheWholeBank(authority, state);
  const queue = await authority.getPracticeQueue(state, 5);
  const item = queue.items.find((i) => i.domain === 'science');
  if (item === undefined) throw new Error('expected a science practice item');
  return item;
}

// ---------------------------------------------------------------------------
// The lesson channel's record, produced by the real adapter
// ---------------------------------------------------------------------------

type MeasurableBinding = Extract<LessonItemBinding, { measurementKind: 'MEASURABLE' }>;

const lessonBinding = (): MeasurableBinding => {
  const binding = LessonItemBindingSchema.parse({
    measurementKind: 'MEASURABLE',
    lessonId: 'V3-LES-130923',
    itemBindingId: 'binding-1',
    questionId: 'Q-1',
    activityId: 'ACT-1',
    bindingVersion: 'rev-1',
    primaryKcId: 'V3-KC-525816',
    activityRole: 'CHANGED_EXIT',
    semanticFamilyId: 'family-1',
    firstAttemptImmutable: true,
    // Deliberately permissive, and deliberately ignored: independence is a
    // runtime fact, so an authored affordance must not reach the record.
    authoredAssistanceAffordances: ['A0'],
    candidateEvidenceModes: ['INDEPENDENT'],
    reasoningOperation: 'EXPLAIN',
    changedDimensions: [],
    learnerSafeItemRef: 'ref://opaque/1',
    serverScoringAuthorityRef: 'server-only://scorer/1',
  });
  if (binding.measurementKind !== 'MEASURABLE') throw new Error('expected a measurable binding');
  return binding;
};

/**
 * A lesson evidence record for exactly the administration practice reports: a
 * correct, independent, unassisted first attempt with no stimulus lineage and
 * no delayed callback. Comparing against anything else would measure two
 * different administrations and call the difference a channel divergence.
 */
function lessonEvidence(): EvidenceRecord {
  const result = adaptLessonResponse({
    binding: lessonBinding(),
    response: LessonRuntimeResponseFactsSchema.parse({
      questionId: 'Q-1',
      itemBindingId: 'binding-1',
      bindingVersion: 'rev-1',
      attemptIndex: 1,
      isRetry: false,
      isDiagnosticRetry: false,
      response: { kind: 'MULTIPLE_CHOICE', chosenChoiceId: 'A' },
      omitted: false,
      elapsedMs: 30_000,
      answerChanges: 0,
      assistanceLevel: 'A0',
      contentBearingHintUsed: false,
      revealUsed: false,
      occurredAt: NOW,
    }),
    scoring: {
      scoringValid: true,
      serverItemVersion: 3,
      outcome: 'correct',
      protectedScoring: false,
    },
    identity: {
      observationId: '3f1c0f2a-0000-4000-8000-000000000001',
      eventId: EventIdSchema.parse('3f1c0f2a-0000-4000-8000-000000000003'),
      learnerId: LearnerIdSchema.parse('3f1c0f2a-0000-4000-8000-000000000004'),
      idempotencyKey: IdempotencyKeySchema.parse('3f1c0f2a-0000-4000-8000-000000000005'),
      evidenceId: '3f1c0f2a-0000-4000-8000-000000000002',
    },
    cluster: 'BB1',
    envelopeBindingVersion: 'rev-1',
    acceptedAt: UtcTimestampSchema.parse(NOW),
    sequence: 4,
    contentRelease: 'release-1',
    policies: [{ policyId: 'mastery-bkt', version: 'provisional-v2' }],
  });
  if (result.evidence === null) throw new Error('expected the lesson adapter to write evidence');
  return result.evidence;
}

/** A wire command. There is no `firstAttempt` claim on it at all. */
const command = (
  questionId: string,
  specId: string,
  chosenChoiceId: 'A' | 'B' | 'C' | 'D' | null,
): PracticeAttemptCommand => ({ questionId, specId, chosenChoiceId });

/** Submit one practice answer and return the evidence records it appended. */
async function submitAndCollect(
  authority: Authority,
  state: LearnerState,
  choose: 'correct' | 'wrong' | 'omitted',
): Promise<{ questionId: string; kcId: string | null; added: EvidenceRecord[] }> {
  const item = await firstQueuedScienceItem(authority, state);
  const answer = await authority.practiceBank.getAnswer(item.question.id);
  if (answer === null) throw new Error('expected an answer for the queued item');
  const chosenChoiceId =
    choose === 'omitted'
      ? null
      : choose === 'correct'
        ? answer.correctChoiceId
        : ((['A', 'B', 'C', 'D'] as const).find((c) => c !== answer.correctChoiceId) ?? null);

  const before = state.evidence.length;
  await authority.submitPracticeAttempt(
    state,
    command(item.question.id, item.specId, chosenChoiceId),
  );
  return { questionId: item.question.id, kcId: item.kcId, added: state.evidence.slice(before) };
}

describe('practice writes evidence on every response', () => {
  it('writes exactly one record for a correct answer', async () => {
    const { authority, state } = freshLearner();
    const { questionId, kcId, added } = await submitAndCollect(authority, state, 'correct');

    expect(added).toHaveLength(1);
    expect(added[0]).toMatchObject({
      skillId: kcId,
      questionId,
      outcome: 'correct',
      valid: true,
    });
  });

  /**
   * The one that matters most. Warranting only the answers that went well
   * biases the record toward looking better than the learner's capability is —
   * and the BKT signal moves on a miss either way, so silence here is a warrant
   * that disagrees with the capability estimate it exists to justify.
   */
  it('writes a record for a wrong answer too, rather than falling silent', async () => {
    const { authority, state } = freshLearner();
    const { added } = await submitAndCollect(authority, state, 'wrong');

    expect(added).toHaveLength(1);
    expect(added[0]!.outcome).toBe('incorrect');
    expect(isMasteryEligible(added[0]!)).toBe(false);
  });

  /**
   * An omission is a scored outcome, not a missing one — the same reading the
   * lesson adapter takes. Dropping it would put survivorship bias straight into
   * the warrant: a learner who skips the hard items would never accrue a miss.
   */
  it('records an unanswered item as omitted, not as absent', async () => {
    const { authority, state } = freshLearner();
    const { added } = await submitAndCollect(authority, state, 'omitted');

    expect(added).toHaveLength(1);
    expect(added[0]!.outcome).toBe('omitted');
    expect(isMasteryEligible(added[0]!)).toBe(false);
  });

  it('parses as an EvidenceRecord, so the shared schema is what gates it', async () => {
    const { authority, state } = freshLearner();
    const { added } = await submitAndCollect(authority, state, 'correct');

    expect(EvidenceRecordSchema.parse(added[0])).toEqual(added[0]);
  });
});

describe('practice evidence has the same field shape as lesson evidence', () => {
  /**
   * Derived from the schema rather than listed, so a field added to
   * `EvidenceRecordSchema` fails here until both channels are re-checked
   * against it. A hand-written list is what goes stale silently.
   */
  const requiredKeys = Object.entries(EvidenceRecordSchema.shape)
    .filter(([, schema]) => !schema.isOptional())
    .map(([key]) => key)
    .sort();

  it('scans a non-trivial field set', () => {
    expect(requiredKeys.length).toBeGreaterThan(15);
    for (const key of ['familyId', 'assistanceLevel', 'conditions', 'occurredAt']) {
      expect(requiredKeys).toContain(key);
    }
  });

  it('carries every field the shared schema requires', async () => {
    const { authority, state } = freshLearner();
    const { added } = await submitAndCollect(authority, state, 'correct');

    expect(Object.keys(added[0]!).sort()).toEqual(expect.arrayContaining(requiredKeys));
  });

  /**
   * Set equality, not containment. Containment would pass a practice record
   * that quietly carried an extra field the lesson channel has no notion of,
   * and evidence sufficiency reads both.
   */
  it('carries exactly the fields the lesson channel carries', async () => {
    const { authority, state } = freshLearner();
    const { added } = await submitAndCollect(authority, state, 'correct');

    expect(Object.keys(added[0]!).sort()).toEqual(Object.keys(lessonEvidence()).sort());
  });

  it('records the administration conditions as absent rather than omitting them', async () => {
    const { authority, state } = freshLearner();
    const { added } = await submitAndCollect(authority, state, 'correct');

    expect(Object.keys(added[0]!.conditions).sort()).toEqual(
      Object.keys(lessonEvidence().conditions).sort(),
    );
    expect(added[0]!.conditions).toEqual({
      mixed: false,
      passage: false,
      timed: false,
      protected: false,
      accommodations: [],
    });
  });

  it('reports assistance on the same scale lessons use', async () => {
    const { authority, state } = freshLearner();
    const { added } = await submitAndCollect(authority, state, 'correct');

    const scale = new Set<string>(AssistanceLevelSchema.options);
    expect(scale.has(added[0]!.assistanceLevel)).toBe(true);
    expect(scale.has(lessonEvidence().assistanceLevel)).toBe(true);
    // No hint, scaffold or reveal exists before a practice answer is committed,
    // so A0 is an observed level rather than an assumed one.
    expect(added[0]!.assistanceLevel).toBe('A0');
    expect(added[0]!.contentBearingHint).toBe(false);
  });

  it('carries the item family, so an untouched-family condition works across channels', async () => {
    const bank = loadSyntheticBank();
    const authority = new Authority(bank, CLOCK);
    const state = authority.createGuest();
    const item = await firstQueuedScienceItem(authority, state);
    const expected = bank.questions.find((q) => q.id === item.question.id)?.family_id ?? null;
    expect(expected).not.toBeNull();

    await authority.submitPracticeAttempt(state, command(item.question.id, item.specId, 'A'));

    expect(state.evidence.at(-1)!.familyId).toBe(expected);
  });

  /**
   * A family satisfies a recipe slot at most once, so an item whose corpus row
   * names no family must COLLAPSE onto a shared marker rather than mint one of
   * its own. Minting per item is the tempting spelling and it is the generous
   * direction: it would let n unfamilied items fill n slots.
   */
  it('collapses an unknown family onto one marker rather than minting one per item', async () => {
    class UnfamiliedBank extends SyntheticPracticeBankPort {
      override async classify(questionId: string): Promise<PracticeItemClassification | null> {
        const base = await super.classify(questionId);
        return base === null ? null : { ...base, familyId: null };
      }
    }
    const bank = loadSyntheticBank();
    const authority = new Authority(bank, CLOCK, new UnfamiliedBank(bank));
    const state = authority.createGuest();
    await teachTheWholeBank(authority, state);

    for (const item of (await authority.getPracticeQueue(state, 4)).items) {
      await authority.submitPracticeAttempt(state, command(item.question.id, item.specId, 'A'));
    }

    expect(state.evidence.length).toBeGreaterThan(1);
    const families = new Set(state.evidence.map((e) => e.familyId));
    expect(families.size).toBe(1);
    expect([...families][0]).not.toBe(state.evidence[0]!.questionId);
  });
});

describe('the practice evidence timestamp is server-bounded', () => {
  /**
   * Structural, not incidental: the attempt command has no field that could
   * carry a time at all, and it is `.strict()`, so a client cannot smuggle one
   * in for the record to prefer.
   */
  it('accepts no client-supplied time on the command at all', () => {
    expect(Object.keys(PracticeAttemptCommandSchema.shape)).not.toContain('occurredAt');
    expect(
      PracticeAttemptCommandSchema.safeParse({
        questionId: 'q',
        specId: 's',
        chosenChoiceId: 'A',
        occurredAt: '2999-01-01T00:00:00.000Z',
      }).success,
    ).toBe(false);
  });

  it('stamps the authority clock, and moves with it', async () => {
    const LATER = '2026-07-27T18:30:00.000Z';
    const { clock, set } = movableClock(NOW);
    const { authority, state } = freshLearner(clock);

    const first = await submitAndCollect(authority, state, 'correct');
    expect(first.added[0]!.occurredAt).toBe(NOW);

    set(LATER);
    const second = await submitAndCollect(authority, state, 'correct');
    expect(second.added[0]!.occurredAt).toBe(LATER);
  });

  /**
   * The record never dates itself ahead of the server's own reading. On this
   * path the reported time IS the server clock, so the bound is a no-op — what
   * this pins is that the value came from the clock and not from the request.
   */
  it('never dates a record ahead of the clock that accepted it', async () => {
    const { clock, set } = movableClock(NOW);
    const { authority, state } = freshLearner(clock);
    await submitAndCollect(authority, state, 'correct');
    set('2026-07-27T13:00:00.000Z');
    await submitAndCollect(authority, state, 'wrong');

    expect(state.evidence.length).toBeGreaterThan(1);
    for (const record of state.evidence) {
      expect(Date.parse(record.occurredAt)).toBeLessThanOrEqual(Date.parse(clock.now()));
    }
  });
});

/**
 * The two halves of a BKT practice write are one unit: the capability estimate
 * and the record that justifies it. Asserting each separately would pass a
 * build in which one of them had stopped happening.
 *
 * Scoped to BKT deliberately. CARS is the IRT authority and its ability is not
 * `P(L)`; the boundary is pinned below rather than left as an implied gap.
 */
describe('the BKT half of practice never moves without warranting it', () => {
  /** The synthetic bank always routes, so the fail-closed path needs a port that does not. */
  class UnroutableClusterBank extends SyntheticPracticeBankPort {
    override async classify(questionId: string): Promise<PracticeItemClassification | null> {
      const base = await super.classify(questionId);
      return base === null ? null : { ...base, kcId: 'not-in-any-registry', cluster: null };
    }
  }

  it('writes a record for the same grain the BKT step moved', async () => {
    const { authority, state } = freshLearner();
    const { kcId, added } = await submitAndCollect(authority, state, 'correct');

    expect(kcId).not.toBeNull();
    expect(state.mastery!.kc[kcId!]).toBeDefined();
    expect(added[0]!.skillId).toBe(kcId);
  });

  it('moves nothing when no cluster resolves, rather than moving it unwarranted', async () => {
    const bank = loadSyntheticBank();
    const authority = new Authority(bank, CLOCK, new UnroutableClusterBank(bank));
    const state = authority.createGuest();
    const item = await firstQueuedScienceItem(authority, state);

    await authority.submitPracticeAttempt(state, command(item.question.id, item.specId, 'A'));

    expect(state.evidence).toEqual([]);
    expect(state.mastery?.kc ?? {}).toEqual({});
    expect(state.events.filter((e) => e.type === 'bkt_observation_applied')).toEqual([]);
  });

  /**
   * A record whose grain resolves nowhere makes the warrant unreadable for
   * every grain at once — `warrantGrains` throws rather than omitting it — so
   * the refusal above is what keeps the read path alive.
   */
  it('leaves the warrant readable after an unroutable item', async () => {
    const bank = loadSyntheticBank();
    const authority = new Authority(bank, CLOCK, new UnroutableClusterBank(bank));
    const state = authority.createGuest();
    const item = await firstQueuedScienceItem(authority, state);
    await authority.submitPracticeAttempt(state, command(item.question.id, item.specId, 'A'));

    expect(() => authority.getMasteryMap(state)).not.toThrow();
  });

  /**
   * The CARS boundary, stated rather than implied. A CARS practice answer moves
   * the IRT ability and writes no evidence record — so the invariant above is
   * genuinely scoped to BKT, and this is the one place that says so.
   *
   * Deliberate: the warrant surface is keyed to the BKT capability grains, and
   * giving CARS one means choosing a grain vocabulary for it. The existing
   * `cars-ca1`/`cars-ca2` duel grains are the obvious candidate and the corpus
   * cluster column is nullable for CARS rows, so the change can silently stop
   * the ability moving if it is made carelessly. That is its own task.
   */
  it('leaves the CARS ability outside the evidence surface, as a stated boundary', async () => {
    class CarsPracticeBank extends SyntheticPracticeBankPort {
      override async classify(questionId: string): Promise<PracticeItemClassification | null> {
        const base = await super.classify(questionId);
        return base === null
          ? null
          : { ...base, domain: 'cars', carsSkill: 'FOC', kcId: null, skill: null, cluster: 'CA1' };
      }
    }
    const bank = loadSyntheticBank();
    const authority = new Authority(bank, CLOCK, new CarsPracticeBank(bank));
    const state = authority.createGuest();
    const item = await firstQueuedScienceItem(authority, state);

    await authority.submitPracticeAttempt(state, command(item.question.id, item.specId, 'A'));

    expect(state.mastery!.cars.FOC).toBeDefined();
    expect(state.evidence).toEqual([]);
  });
});
