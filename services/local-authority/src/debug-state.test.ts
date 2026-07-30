import type { MasteryEngineState } from '@mcat/authority-core';
import { REASONING_OPERATIONS, type UtcTimestamp } from '@mcat/contracts';
import { initialMemoryState, MASTERY_THRESHOLD, PRIOR_PL0, type MemoryState } from '@mcat/policies';
import { describe, expect, it } from 'vitest';
import {
  buildDebugLearnerState,
  isDebugStateOptedIn,
  isDebugStateRequestAllowed,
  isLoopbackRemoteAddress,
  isNonBrowserRequest,
  type DebugLearnerStateInput,
} from './debug-state';

const NOW = '2026-07-27T12:00:00.000Z' as UtcTimestamp;

/** Obviously-synthetic 64-hex content hashes; two distinct so a swap would show. */
const SAMPLE_CONTENT_SHA = 'ab'.repeat(32);
const OTHER_CONTENT_SHA = 'cd'.repeat(32);

const practiced = (pL: number, lastPracticedAt = NOW): MemoryState => ({
  ...initialMemoryState(pL),
  lastPracticedAt,
});

const mastery = (overrides: Partial<MasteryEngineState> = {}): MasteryEngineState => ({
  kc: {},
  skill: {},
  cars: {},
  practicedLessonIds: [],
  appliedObservationIds: [],
  highestAppliedObservationSequence: null,
  ...overrides,
});

/** Deliberately carries answer-bearing keys the allowlist must not copy through. */
const evidenceRecord = (
  overrides: Record<string, unknown> = {},
): DebugLearnerStateInput['evidence'][number] =>
  ({
    evidenceId: '11111111-1111-4111-8111-111111111111',
    skillId: 'V3-KC-866848',
    cluster: 'quantitative_reasoning',
    kind: 'independent',
    outcome: 'correct',
    independent: true,
    assistanceLevel: 'A0',
    contentBearingHint: false,
    questionId: 'ALG-GRAPH-NEAR-01',
    itemVersion: 1,
    familyId: 'fam-vtr-1',
    valid: true,
    changeDimensions: ['representation'],
    conditions: {
      mixed: false,
      passage: false,
      timed: false,
      protected: false,
      accommodations: [],
    },
    occurredAt: NOW,
    sequence: 3,
    contentRelease: 'synthetic-1',
    policies: [],
    ...overrides,
  }) as unknown as DebugLearnerStateInput['evidence'][number];

const baseInput = (overrides: Partial<DebugLearnerStateInput> = {}): DebugLearnerStateInput => ({
  learnerId: 'learner-1',
  streamVersion: 4,
  acceptedEventCount: 4,
  now: NOW,
  mastery: undefined,
  evidence: [],
  lessons: [],
  ...overrides,
});

describe('debug state guards', () => {
  it('treats the opt-in as an allowlist and defaults to off', () => {
    expect(isDebugStateOptedIn({})).toBe(false);
    expect(isDebugStateOptedIn({ MCAT_LOCAL_DEBUG_STATE: undefined })).toBe(false);
    expect(isDebugStateOptedIn({ MCAT_LOCAL_DEBUG_STATE: '' })).toBe(false);
    expect(isDebugStateOptedIn({ MCAT_LOCAL_DEBUG_STATE: '0' })).toBe(false);
    expect(isDebugStateOptedIn({ MCAT_LOCAL_DEBUG_STATE: 'false' })).toBe(false);
    expect(isDebugStateOptedIn({ MCAT_LOCAL_DEBUG_STATE: 'yes' })).toBe(false);
    expect(isDebugStateOptedIn({ MCAT_LOCAL_DEBUG_STATE: 'on' })).toBe(false);
    expect(isDebugStateOptedIn({ MCAT_LOCAL_DEBUG_STATE: '1' })).toBe(true);
    expect(isDebugStateOptedIn({ MCAT_LOCAL_DEBUG_STATE: ' TRUE ' })).toBe(true);
  });

  it('recognizes only the exact loopback peer addresses', () => {
    for (const address of ['127.0.0.1', '::1', '::ffff:127.0.0.1']) {
      expect(isLoopbackRemoteAddress(address), address).toBe(true);
    }
    for (const address of [
      undefined,
      null,
      '',
      '10.0.0.5',
      '192.168.1.4',
      '::ffff:10.0.0.5',
      '127.0.0.2',
      '0.0.0.0',
      'localhost',
    ]) {
      expect(isLoopbackRemoteAddress(address), String(address)).toBe(false);
    }
  });

  it('requires ALL THREE guards — none is sufficient alone', () => {
    const allowed = { optedIn: true, remoteAddress: '127.0.0.1', originHeader: undefined };
    expect(isDebugStateRequestAllowed(allowed)).toBe(true);

    // Loopback and no Origin, but the opt-in is absent.
    expect(isDebugStateRequestAllowed({ ...allowed, optedIn: false })).toBe(false);
    // Opted in and no Origin, but the peer is not loopback.
    expect(isDebugStateRequestAllowed({ ...allowed, remoteAddress: '10.0.0.5' })).toBe(false);
    // Opted in and no Origin, but the peer address is unknown.
    expect(isDebugStateRequestAllowed({ ...allowed, remoteAddress: undefined })).toBe(false);
    // Opted in and loopback, but a web page is asking.
    expect(isDebugStateRequestAllowed({ ...allowed, originHeader: 'http://127.0.0.1:5173' })).toBe(
      false,
    );
    expect(isDebugStateRequestAllowed({ ...allowed, originHeader: 'http://localhost:31337' })).toBe(
      false,
    );
    expect(isDebugStateRequestAllowed({ ...allowed, originHeader: 'null' })).toBe(false);
    expect(
      isDebugStateRequestAllowed({
        optedIn: false,
        remoteAddress: '10.0.0.5',
        originHeader: 'http://evil.example.com',
      }),
    ).toBe(false);
  });

  it('treats any Origin at all as a browser request', () => {
    expect(isNonBrowserRequest(undefined)).toBe(true);
    expect(isNonBrowserRequest(null)).toBe(true);
    // Even an allowlisted dev origin: CORS decides what a page may READ, this
    // decides whether the payload is produced.
    expect(isNonBrowserRequest('http://127.0.0.1:5173')).toBe(false);
    expect(isNonBrowserRequest('')).toBe(false);
    expect(isNonBrowserRequest('null')).toBe(false);
  });
});

describe('buildDebugLearnerState', () => {
  it('reports every reasoning operation, unobserved ones at the prior', () => {
    const view = buildDebugLearnerState(
      baseInput({
        mastery: mastery({ skill: { IDENTIFY: practiced(0.71) } }),
      }),
    );

    expect(view.reasoningOperations.map((o) => o.operation)).toEqual([...REASONING_OPERATIONS]);
    const identify = view.reasoningOperations.find((o) => o.operation === 'IDENTIFY')!;
    expect(identify).toEqual({
      operation: 'IDENTIFY',
      pL: 0.71,
      atCapabilityCut: false,
      observed: true,
    });
    for (const operation of view.reasoningOperations.filter((o) => o.operation !== 'IDENTIFY')) {
      expect(operation).toEqual({
        operation: operation.operation,
        pL: PRIOR_PL0,
        atCapabilityCut: false,
        observed: false,
      });
    }
    expect(view.masteryThreshold).toBe(MASTERY_THRESHOLD);
  });

  it('reports each KC with its decayed and stored P(L)', () => {
    const view = buildDebugLearnerState(
      baseInput({
        now: '2026-08-03T12:00:00.000Z' as UtcTimestamp,
        // One half-life (7 days) after the last practice.
        mastery: mastery({
          kc: { 'V3-KC-700208': practiced(0.8), 'V3-KC-159529': initialMemoryState() },
        }),
      }),
    );

    expect(view.knowledgeComponents.map((k) => k.kcId)).toEqual(['V3-KC-159529', 'V3-KC-700208']);
    const decayed = view.knowledgeComponents.find((k) => k.kcId === 'V3-KC-700208')!;
    expect(decayed.storedPL).toBe(0.8);
    expect(decayed.pL).toBeCloseTo(0.4, 10);
    expect(decayed.reviewDue).toBe(true);
    // Never practiced: no decay applies and it can never be "due".
    const unstarted = view.knowledgeComponents.find((k) => k.kcId === 'V3-KC-159529')!;
    expect(unstarted).toMatchObject({ pL: PRIOR_PL0, storedPL: PRIOR_PL0, reviewDue: false });
  });

  it('rolls a partly-started lesson up over its WHOLE membership', () => {
    const view = buildDebugLearnerState(
      baseInput({
        // Only one of the lesson's three required KCs has ever been practiced.
        mastery: mastery({
          kc: { 'V3-KC-866848': practiced(0.98) },
          practicedLessonIds: ['V3-LES-130923'],
          appliedObservationIds: ['obs-1', 'obs-2'],
          highestAppliedObservationSequence: 7,
        }),
        lessons: [
          {
            lessonId: 'V3-LES-130923',
            requiredKcIds: ['V3-KC-866848', 'V3-KC-700208', 'V3-KC-159529'],
            deliveredContentSha256: SAMPLE_CONTENT_SHA,
          },
        ],
      }),
    );

    const lesson = view.lessons[0]!;
    expect(lesson.status).toBe('available');
    if (lesson.status !== 'available') throw new Error('unreachable');
    expect(lesson.deliveredContentSha256).toBe(SAMPLE_CONTENT_SHA);
    expect(lesson.requiredKcCount).toBe(3);
    expect(lesson.members.map((m) => m.kcId)).toEqual([
      'V3-KC-866848',
      'V3-KC-700208',
      'V3-KC-159529',
    ]);
    // The two unstarted members are supplied at the prior, not dropped.
    expect(lesson.pL).toBeCloseTo((0.98 + PRIOR_PL0 + PRIOR_PL0) / 3, 10);
    expect(lesson.mastered).toBe(false);
    expect(lesson.weakestKcId).toBe('V3-KC-700208');
    expect(lesson.weakestPL).toBe(PRIOR_PL0);
    expect(view.appliedObservationCount).toBe(2);
    expect(view.highestAppliedObservationSequence).toBe(7);
    expect(view.practicedLessonIds).toEqual(['V3-LES-130923']);
  });

  it('surfaces the rejection code for a lesson with no registry membership', () => {
    const view = buildDebugLearnerState(
      baseInput({
        lessons: [
          // Served an old revision, then lost its curriculum membership: the
          // rollup is unavailable, but the delivered revision still attributes
          // whatever evidence that run produced.
          {
            lessonId: 'lesson-enz-inhibition',
            requiredKcIds: null,
            deliveredContentSha256: OTHER_CONTENT_SHA,
          },
          { lessonId: 'V3-LES-EMPTY', requiredKcIds: [], deliveredContentSha256: null },
        ],
      }),
    );

    expect(view.lessons).toEqual([
      {
        lessonId: 'lesson-enz-inhibition',
        status: 'unavailable',
        deliveredContentSha256: OTHER_CONTENT_SHA,
        rejectionCodes: ['LESSON_KC_MAP_MISSING'],
        missingKcIds: [],
      },
      {
        lessonId: 'V3-LES-EMPTY',
        status: 'unavailable',
        deliveredContentSha256: null,
        rejectionCodes: ['LESSON_KC_MAP_EMPTY'],
        missingKcIds: [],
      },
    ]);
  });

  it('reports a repeated lesson id once', () => {
    const view = buildDebugLearnerState(
      baseInput({
        lessons: [
          {
            lessonId: 'V3-LES-130923',
            requiredKcIds: ['V3-KC-866848'],
            deliveredContentSha256: SAMPLE_CONTENT_SHA,
          },
          {
            lessonId: 'V3-LES-130923',
            requiredKcIds: ['V3-KC-866848'],
            deliveredContentSha256: SAMPLE_CONTENT_SHA,
          },
        ],
      }),
    );
    expect(view.lessons).toHaveLength(1);
  });

  it('forwards the delivered content revision on both arms, null before a run', () => {
    const view = buildDebugLearnerState(
      baseInput({
        mastery: mastery({ kc: { 'V3-KC-866848': practiced(0.5) } }),
        lessons: [
          // Delivered and rolls up.
          {
            lessonId: 'V3-LES-130923',
            requiredKcIds: ['V3-KC-866848'],
            deliveredContentSha256: SAMPLE_CONTENT_SHA,
          },
          // Available membership, but never started: revision is null, not a hash.
          {
            lessonId: 'V3-LES-789208',
            requiredKcIds: ['V3-KC-866848'],
            deliveredContentSha256: null,
          },
          // Unavailable rollup, yet the served revision is still attributed.
          {
            lessonId: 'lesson-enz-inhibition',
            requiredKcIds: null,
            deliveredContentSha256: OTHER_CONTENT_SHA,
          },
        ],
      }),
    );

    const [delivered, unstarted, unavailable] = view.lessons;
    expect(delivered).toMatchObject({
      lessonId: 'V3-LES-130923',
      status: 'available',
      deliveredContentSha256: SAMPLE_CONTENT_SHA,
    });
    expect(unstarted).toMatchObject({
      lessonId: 'V3-LES-789208',
      status: 'available',
      deliveredContentSha256: null,
    });
    expect(unavailable).toMatchObject({
      lessonId: 'lesson-enz-inhibition',
      status: 'unavailable',
      deliveredContentSha256: OTHER_CONTENT_SHA,
    });
  });

  it('copies only allowlisted evidence fields', () => {
    const view = buildDebugLearnerState(
      baseInput({
        evidence: [
          evidenceRecord({
            correct_choice_id: 'B',
            rationales: { B: 'because' },
            answer_authority_ref: 'PROTECTED_ITEMS:alg-graph-near-01',
            stem: 'What is the magnitude of the resultant?',
          }),
        ],
      }),
    );

    expect(Object.keys(view.evidence[0]!).sort()).toEqual(
      [
        'assistanceLevel',
        'changeDimensions',
        'cluster',
        'conditions',
        'contentBearingHint',
        'evidenceId',
        'independent',
        'kind',
        'occurredAt',
        'outcome',
        'sequence',
        'skillId',
        'valid',
      ].sort(),
    );
    const json = JSON.stringify(view);
    for (const token of [
      'correct_choice_id',
      'correctChoiceId',
      'rationale',
      'authority_ref',
      'authorityRef',
      'PROTECTED_ITEMS',
      'stem',
      'questionId',
      'familyId',
    ]) {
      expect(json, `debug view must not contain ${token}`).not.toContain(token);
    }
  });

  it('is a pure function of its inputs', () => {
    const input = baseInput({
      mastery: mastery({
        kc: { 'V3-KC-866848': practiced(0.5) },
        skill: { PREDICT: practiced(0.6) },
        practicedLessonIds: ['V3-LES-130923'],
        appliedObservationIds: ['obs-1'],
        highestAppliedObservationSequence: 1,
      }),
      evidence: [evidenceRecord()],
      lessons: [
        {
          lessonId: 'V3-LES-130923',
          requiredKcIds: ['V3-KC-866848'],
          deliveredContentSha256: SAMPLE_CONTENT_SHA,
        },
      ],
    });
    const snapshot = structuredClone(input);

    expect(buildDebugLearnerState(input)).toEqual(buildDebugLearnerState(input));
    expect(input).toEqual(snapshot);
  });
});
