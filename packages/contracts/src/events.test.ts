import { describe, expect, it } from 'vitest';
import {
  BKT_OBSERVATION_SOURCES,
  BktObservationAppliedSchema,
  LearnerEventSchema,
  newEventId,
  newIdempotencyKey,
  newLearnerId,
  UtcTimestampSchema,
  type BktObservationSource,
} from './index';

/**
 * The BKT ledger payload's cross-field guards, exercised.
 *
 * They are `superRefine`s, and `z.infer` of a refined object drops them, so the
 * compiler cannot see a single one of them: a record that contradicts itself
 * type-checks perfectly. Until this file existed the guards had no call site at
 * all — `BktObservationAppliedSchema` was never parsed anywhere, in production
 * or in a test — while two comments in `packages/authority-core` asserted that
 * "the payload's own guard refuses a record that claims otherwise". That is the
 * fifth documented-but-absent guard in this repository.
 *
 * The write path half of the fix is `Authority.recordBktObservationEvent`,
 * which now parses what it appends. This file is the other half: it pins WHAT
 * the guard refuses, so the parse there cannot be weakened without a named
 * failure.
 */

const NOW = UtcTimestampSchema.parse('2026-07-27T12:00:00.000Z');
const EARLIER = UtcTimestampSchema.parse('2026-07-27T11:58:00.000Z');
const OBSERVATION_ID = '44444444-4444-4444-8444-444444444444';

type LedgerPayload = Record<string, unknown>;

function ledgerEvent(payload: LedgerPayload): Record<string, unknown> {
  return {
    type: 'bkt_observation_applied',
    eventId: newEventId(),
    learnerId: newLearnerId(),
    idempotencyKey: newIdempotencyKey(),
    occurredAt: NOW,
    contentRelease: 'synthetic-2026.07',
    policies: [{ policyId: 'mastery-bkt', version: 'provisional-v2' }],
    payload,
  };
}

/** An applied record from a qualified lesson response: identity and ordering. */
function lessonPayload(overrides: LedgerPayload = {}): LedgerPayload {
  return {
    source: 'lesson_response',
    observationId: OBSERVATION_ID,
    observationSequence: 7,
    questionId: 'ALG-GRAPH-ENTRY-01',
    primaryKcId: 'V3-KC-199229',
    reasoningOperation: 'IDENTIFY',
    correct: true,
    reportedOccurredAt: NOW,
    appliedOccurredAt: NOW,
    clockAdjustment: 'none',
    outOfOrder: false,
    rejectionCodes: [],
    ...overrides,
  };
}

/** An applied record from a path scored in-request: no identity, no ordering. */
function inRequestPayload(
  source: BktObservationSource,
  overrides: LedgerPayload = {},
): LedgerPayload {
  return {
    source,
    observationId: null,
    observationSequence: null,
    questionId: 'bb1-enzyme-fixture-0001',
    primaryKcId: 'V3-KC-199229',
    reasoningOperation: 'EXPLAIN',
    correct: false,
    reportedOccurredAt: NOW,
    appliedOccurredAt: NOW,
    clockAdjustment: 'none',
    outOfOrder: false,
    rejectionCodes: [],
    ...overrides,
  };
}

/** The fields a refusal names, so a rejection is asserted BY NAME, not by count. */
function refusedFields(payload: LedgerPayload): string[] {
  const result = BktObservationAppliedSchema.safeParse(ledgerEvent(payload));
  if (result.success) return [];
  return result.error.issues.map((issue) => issue.path.join('.'));
}

describe('the BKT ledger payload refuses a record that contradicts itself', () => {
  it('accepts every shape the Authority actually writes', () => {
    // Anti-vacuity: if the real shapes did not parse, every rejection below
    // would pass for the wrong reason.
    expect(refusedFields(lessonPayload())).toEqual([]);
    expect(refusedFields(inRequestPayload('adaptive_practice'))).toEqual([]);
    expect(refusedFields(inRequestPayload('synthetic_study'))).toEqual([]);

    // A late lesson response: applied, ordered behind one already seen.
    expect(refusedFields(lessonPayload({ outOfOrder: true }))).toEqual([]);

    // A clamped record: the claim survives verbatim, the applied clock does not.
    expect(
      refusedFields(
        lessonPayload({
          reportedOccurredAt: EARLIER,
          appliedOccurredAt: NOW,
          clockAdjustment: 'held_at_last_practiced',
        }),
      ),
    ).toEqual([]);

    // A refusal: no applied clock at all, and the verbatim claim retained.
    expect(
      refusedFields(
        lessonPayload({
          appliedOccurredAt: null,
          rejectionCodes: ['OBSERVATION_TIMESTAMP_IN_FUTURE'],
        }),
      ),
    ).toEqual([]);
  });

  it('covers every declared source, so a new one cannot arrive untested', () => {
    expect(BKT_OBSERVATION_SOURCES).toEqual([
      'lesson_response',
      'adaptive_practice',
      'synthetic_study',
    ]);
  });

  // -- the source and the identity fields are two derivations of one fact -----

  it('refuses a lesson record that has lost its observation id', () => {
    expect(refusedFields(lessonPayload({ observationId: null }))).toEqual([
      'payload.observationId',
    ]);
  });

  it('refuses an in-request record that invented an observation id', () => {
    for (const source of ['adaptive_practice', 'synthetic_study'] as const) {
      expect(
        refusedFields(inRequestPayload(source, { observationId: OBSERVATION_ID })),
        `${source} carrying an observationId was accepted.`,
      ).toEqual(['payload.observationId']);
    }
  });

  it('refuses a lesson record that has lost its ordering value', () => {
    expect(refusedFields(lessonPayload({ observationSequence: null }))).toEqual([
      'payload.observationSequence',
    ]);
  });

  it('refuses an in-request record that claims to be out of order', () => {
    // Nothing could have decided it: there is no sequence to order against.
    for (const source of ['adaptive_practice', 'synthetic_study'] as const) {
      expect(
        refusedFields(inRequestPayload(source, { outOfOrder: true })),
        `${source} claiming outOfOrder was accepted.`,
      ).toEqual(['payload.outOfOrder']);
    }
  });

  // -- the outcome is derived twice as well ----------------------------------

  it('refuses a record that was applied and refused at once', () => {
    expect(
      refusedFields(lessonPayload({ rejectionCodes: ['OBSERVATION_TIMESTAMP_IN_FUTURE'] })),
    ).toEqual(['payload.appliedOccurredAt']);
  });

  it('refuses a record with no applied clock and no reason for its absence', () => {
    expect(refusedFields(lessonPayload({ appliedOccurredAt: null }))).toEqual([
      'payload.appliedOccurredAt',
    ]);
  });

  it('refuses a clock adjustment the two times do not corroborate', () => {
    // `clockAdjustment` is a third derivation of the same fact, so it has to
    // agree with the pair it describes in both directions.
    expect(
      refusedFields(lessonPayload({ reportedOccurredAt: EARLIER, clockAdjustment: 'none' })),
    ).toEqual(['payload.clockAdjustment']);
    expect(refusedFields(lessonPayload({ clockAdjustment: 'bounded_to_server_clock' }))).toEqual([
      'payload.clockAdjustment',
    ]);
  });

  it('compares the two times as instants, not as strings', () => {
    // The fields are two `UtcTimestamp`s, not two spellings of one; a record
    // that used the claim verbatim must not be refused for writing it as
    // `+00:00` rather than `Z`.
    expect(
      refusedFields(
        lessonPayload({ appliedOccurredAt: UtcTimestampSchema.parse('2026-07-27T12:00:00+00:00') }),
      ),
    ).toEqual([]);
  });

  // -- the guard is reachable from the event union it belongs to -------------

  it('applies through LearnerEventSchema, which is how a replay would parse it', () => {
    expect(() => LearnerEventSchema.parse(ledgerEvent(lessonPayload()))).not.toThrow();
    expect(() =>
      LearnerEventSchema.parse(ledgerEvent(lessonPayload({ observationId: null }))),
    ).toThrow();
  });

  it('strips nothing and admits nothing: the payload is strict', () => {
    // Zod reports an unrecognized key against the object, not the key, so the
    // message is what names it. A smuggled `pL` is the reason this is `.strict()`.
    const result = BktObservationAppliedSchema.safeParse(ledgerEvent(lessonPayload({ pL: 0.99 })));
    expect(result.success).toBe(false);
    expect(result.success ? '' : result.error.issues[0]!.message).toContain('pL');
  });
});
