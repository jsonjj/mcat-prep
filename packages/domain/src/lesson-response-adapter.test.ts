import { describe, expect, it } from 'vitest';
import {
  AcceptedLessonObservationSchema,
  AssistanceLevelSchema,
  BKT_ELIGIBLE_EVIDENCE_MODES,
  BKT_QUALIFICATION_REJECTION_CODES,
  CandidateEvidenceModeSchema,
  EventIdSchema,
  IdempotencyKeySchema,
  LearnerIdSchema,
  LessonItemBindingSchema,
  LessonRuntimeResponseFactsSchema,
  QualifiedBktObservationSchema,
  UtcTimestampSchema,
  hasEligibleEvidenceMode,
  isBktQualificationAccepted,
  type CandidateEvidenceMode,
  type LessonItemBinding,
  type LessonRuntimeResponseFacts,
} from '@mcat/contracts';
import { CONTEXTUAL_ONLY_KINDS, EvidenceRecordSchema, isMasteryEligible } from './evidence';
import {
  adaptLessonResponse,
  deriveEvidenceKind,
  isIndependentAdministration,
  normalizeAuthoredLessonBinding,
  parseAuthoredLessonBinding,
  unrecognizedAuthoredBindingKeys,
  type LessonResponseAdapterInput,
  type ServerScoringResolution,
} from './lesson-response-adapter';

type MeasurableBinding = Extract<LessonItemBinding, { measurementKind: 'MEASURABLE' }>;

const OBSERVATION_ID = '3f1c0f2a-0000-4000-8000-000000000001';
const EVIDENCE_ID = '3f1c0f2a-0000-4000-8000-000000000002';
const EVENT_ID = EventIdSchema.parse('3f1c0f2a-0000-4000-8000-000000000003');
const LEARNER_ID = LearnerIdSchema.parse('3f1c0f2a-0000-4000-8000-000000000004');
const IDEMPOTENCY_KEY = IdempotencyKeySchema.parse('3f1c0f2a-0000-4000-8000-000000000005');

/**
 * Deliberately unlike anything on disk in this repo: mixed case, spaces, unicode,
 * punctuation, a four-digit lesson namespace that does not exist, and a question
 * id that is not derived from the binding id. If any of this trips the adapter,
 * the adapter is lesson-specific.
 */
const ALIEN_BINDING_INPUT: Readonly<Record<string, unknown>> = {
  measurementKind: 'MEASURABLE',
  lessonId: 'Λ-COURSE::2099/unit 7',
  itemBindingId: 'binding #77 (alt shape)',
  questionId: 'Q?77?ALT — served',
  activityId: 'ACT  double  space',
  bindingVersion: 'rev/2099.Ω',
  primaryKcId: 'kc::Δ::9917',
  secondaryKcMappings: ['kc::Δ::9918'],
  activityRole: 'SOLO_PRACTICE',
  semanticFamilyId: 'family — 77',
  stimulusLineageId: 'lineage 77 :: original',
  firstAttemptImmutable: true,
  authoredAssistanceAffordances: ['A2', 'VISIBLE_EXPLANATION', 'NOT_SURE_ALLOWED'],
  candidateEvidenceModes: ['INDEPENDENT'],
  reasoningOperation: 'QUANTIFY',
  dokLevel: 3,
  representationId: 'rep — alt',
  changedDimensions: [],
  changedDimensionDetail: 'unknown variable and direction of inference',
  learnerSafeItemRef: 'REF://opaque/77?v=Ω',
  serverScoringAuthorityRef: 'server-only://scorer/77',
};

const parseBinding = (patch: Readonly<Record<string, unknown>> = {}): MeasurableBinding => {
  const binding = LessonItemBindingSchema.parse({ ...ALIEN_BINDING_INPUT, ...patch });
  if (binding.measurementKind !== 'MEASURABLE') throw new Error('expected a measurable binding');
  return binding;
};

const responseFacts = (patch: Readonly<Record<string, unknown>> = {}): LessonRuntimeResponseFacts =>
  LessonRuntimeResponseFactsSchema.parse({
    questionId: 'Q?77?ALT — served',
    itemBindingId: 'binding #77 (alt shape)',
    bindingVersion: 'rev/2099.Ω',
    attemptIndex: 1,
    isRetry: false,
    isDiagnosticRetry: false,
    response: { kind: 'MULTIPLE_CHOICE', chosenChoiceId: 'choice-γ' },
    omitted: false,
    elapsedMs: 31_000,
    answerChanges: 0,
    assistanceLevel: 'A0',
    contentBearingHintUsed: false,
    revealUsed: false,
    occurredAt: '2026-07-27T12:00:00.000Z',
    ...patch,
  });

const VALID_SCORING: ServerScoringResolution = {
  scoringValid: true,
  serverItemVersion: 12,
  outcome: 'correct',
  protectedScoring: false,
};

const NO_ADMINISTRATION_CONDITIONS = {
  mixed: false,
  passage: false,
  timed: false,
  protected: false,
} as const;

const ALL_ADMINISTRATION_CONDITIONS = {
  mixed: true,
  passage: true,
  timed: true,
  protected: true,
} as const;

const adapt = (
  patch: Partial<LessonResponseAdapterInput> = {},
): ReturnType<typeof adaptLessonResponse> =>
  adaptLessonResponse({
    binding: parseBinding(),
    response: responseFacts(),
    scoring: VALID_SCORING,
    identity: {
      observationId: OBSERVATION_ID,
      eventId: EVENT_ID,
      learnerId: LEARNER_ID,
      idempotencyKey: IDEMPOTENCY_KEY,
      evidenceId: EVIDENCE_ID,
    },
    cluster: 'CP1',
    envelopeBindingVersion: '0.9.9-envelope',
    acceptedAt: UtcTimestampSchema.parse('2026-07-27T12:00:01.000Z'),
    sequence: 4,
    contentRelease: 'release-alt-2099',
    policies: [{ policyId: 'mastery-bkt', version: 'provisional-v1' }],
    ...patch,
  });

const rejectionCodesOf = (result: ReturnType<typeof adaptLessonResponse>): readonly string[] =>
  result.qualification.status === 'rejected' ? result.qualification.rejectionCodes : [];

describe('lesson response adapter — qualification', () => {
  it('qualifies an independent correct first attempt on an eligible binding', () => {
    const result = adapt();

    expect(result.status).toBe('adapted');
    expect(result.evidence).not.toBeNull();
    expect(isBktQualificationAccepted(result.qualification)).toBe(true);
    if (!isBktQualificationAccepted(result.qualification)) return;

    const bkt = result.qualification.observation;
    expect(bkt.correct).toBe(true);
    expect(bkt.primaryKcId).toBe('kc::Δ::9917');
    expect(bkt.reasoningOperation).toBe('QUANTIFY');
    expect(bkt.serverItemVersion).toBe(12);
    expect(bkt.dokLevel).toBe(3);
    expect(QualifiedBktObservationSchema.parse(bkt)).toEqual(bkt);
    expect(Object.keys(bkt)).not.toContain('lessonId');
  });

  it('qualifies an independent incorrect first attempt with correct false', () => {
    const result = adapt({
      scoring: {
        scoringValid: true,
        serverItemVersion: 12,
        outcome: 'incorrect',
        protectedScoring: false,
      },
    });

    expect(isBktQualificationAccepted(result.qualification)).toBe(true);
    if (!isBktQualificationAccepted(result.qualification)) return;
    expect(result.qualification.observation.correct).toBe(false);
    expect(result.evidence?.outcome).toBe('incorrect');
    expect(result.evidence?.independent).toBe(true);
  });

  it('qualifies an omitted independent first attempt with correct false', () => {
    // Omission is an outcome, not a disqualifier. A learner who skips the hard
    // items must still be able to move P(L) downward, or the estimate carries
    // survivorship bias.
    const result = adapt({
      response: responseFacts({
        omitted: true,
        response: { kind: 'MULTIPLE_CHOICE', chosenChoiceId: null },
      }),
      scoring: {
        scoringValid: true,
        serverItemVersion: 12,
        outcome: 'omitted',
        protectedScoring: false,
      },
    });

    expect(isBktQualificationAccepted(result.qualification)).toBe(true);
    if (!isBktQualificationAccepted(result.qualification)) return;
    expect(result.qualification.observation.correct).toBe(false);
    expect(result.evidence?.outcome).toBe('omitted');
    expect(result.evidence?.independent).toBe(true);
  });

  it('preserves an absent dokLevel rather than defaulting it', () => {
    const binding = parseBinding({ dokLevel: undefined });
    const result = adapt({ binding });

    expect(isBktQualificationAccepted(result.qualification)).toBe(true);
    if (!isBktQualificationAccepted(result.qualification)) return;
    expect('dokLevel' in result.qualification.observation).toBe(false);
  });
});

describe('lesson response adapter — evidence without BKT', () => {
  const nonQualifying: readonly [string, Record<string, unknown>, string][] = [
    ['guided at A2', { assistanceLevel: 'A2' }, 'ASSISTANCE_NOT_A0'],
    ['assisted at A1', { assistanceLevel: 'A1' }, 'ASSISTANCE_NOT_A0'],
    ['content-bearing hint', { contentBearingHintUsed: true }, 'CONTENT_BEARING_HINT_USED'],
    ['reveal', { revealUsed: true }, 'REVEAL_USED'],
    ['retry', { isRetry: true }, 'RETRY_USED'],
    ['diagnostic retry', { isDiagnosticRetry: true }, 'RETRY_USED'],
    ['second attempt', { attemptIndex: 2 }, 'NOT_FIRST_ATTEMPT'],
    [
      'an assisted omission',
      {
        omitted: true,
        response: { kind: 'MULTIPLE_CHOICE', chosenChoiceId: null },
        assistanceLevel: 'A2',
      },
      'ASSISTANCE_NOT_A0',
    ],
  ];

  for (const [label, patch, code] of nonQualifying) {
    it(`records evidence but no BKT observation for ${label}`, () => {
      const result = adapt({
        response: responseFacts(patch),
        scoring:
          patch.omitted === true
            ? {
                scoringValid: true,
                serverItemVersion: 12,
                outcome: 'omitted',
                protectedScoring: false,
              }
            : VALID_SCORING,
      });

      expect(result.status).toBe('adapted');
      expect(result.evidence).not.toBeNull();
      expect(result.qualification.status).toBe('rejected');
      expect(rejectionCodesOf(result)).toContain(code);
      expect(EvidenceRecordSchema.parse(result.evidence)).toEqual(result.evidence);
    });
  }

  it('marks assisted evidence non-independent and mastery-ineligible', () => {
    const result = adapt({ response: responseFacts({ assistanceLevel: 'A2' }) });

    expect(result.evidence?.independent).toBe(false);
    expect(result.evidence?.kind).toBe('instruction');
    expect(result.evidence === null || isMasteryEligible(result.evidence)).toBe(false);
  });

  it('classifies a diagnostic retry as diagnostic_retry evidence', () => {
    const result = adapt({ response: responseFacts({ isDiagnosticRetry: true }) });
    expect(result.evidence?.kind).toBe('diagnostic_retry');
  });

  it('records evidence but no BKT for an INSTRUCTIONAL-only binding that is otherwise perfect', () => {
    const binding = parseBinding({
      candidateEvidenceModes: ['INSTRUCTIONAL'],
      reasoningOperation: undefined,
    });
    const result = adapt({ binding });

    expect(result.evidence).not.toBeNull();
    expect(result.evidence?.kind).toBe('instruction');
    // Independence is a runtime fact and stays true even though BKT is closed.
    expect(result.evidence?.independent).toBe(true);
    expect(rejectionCodesOf(result)).toEqual(['INDEPENDENT_EVIDENCE_MODE_NOT_DECLARED']);
  });

  it('accumulates every applicable rejection code in a deterministic order', () => {
    const binding = parseBinding({
      candidateEvidenceModes: ['INSTRUCTIONAL'],
      reasoningOperation: undefined,
    });
    const result = adapt({
      binding,
      response: responseFacts({
        bindingVersion: 'rev/OTHER',
        attemptIndex: 3,
        assistanceLevel: 'A1',
        contentBearingHintUsed: true,
        revealUsed: true,
        isRetry: true,
      }),
    });

    expect(rejectionCodesOf(result)).toEqual([
      'BINDING_VERSION_MISMATCH',
      'INDEPENDENT_EVIDENCE_MODE_NOT_DECLARED',
      'NOT_FIRST_ATTEMPT',
      'ASSISTANCE_NOT_A0',
      'CONTENT_BEARING_HINT_USED',
      'REVEAL_USED',
      'RETRY_USED',
    ]);
  });
});

describe('lesson response adapter — fail-closed paths', () => {
  it('emits BINDING_NOT_FOUND and nothing else when no binding resolves', () => {
    const result = adapt({ binding: null });

    expect(result.status).toBe('binding_unresolved');
    expect(result.observation).toBeNull();
    expect(result.evidence).toBeNull();
    expect(rejectionCodesOf(result)).toEqual(['BINDING_NOT_FOUND']);
  });

  it('emits neither evidence nor BKT for a non-measurable worked example', () => {
    const binding = LessonItemBindingSchema.parse({
      measurementKind: 'NON_MEASURABLE',
      lessonId: 'Λ-COURSE::2099/unit 7',
      itemBindingId: 'worked #1',
      primaryKcId: 'kc::Δ::9917',
      activityRole: 'WORKED_EXAMPLE',
      semanticFamilyId: 'family — worked',
      authoredAssistanceAffordances: ['VISIBLE_EXPLANATION'],
      changedDimensions: [],
      learnerSafeItemRef: 'NODE:worked-1',
    });
    const result = adapt({ binding });

    expect(result.status).toBe('not_measurable');
    expect(result.observation).toBeNull();
    expect(result.evidence).toBeNull();
    expect(result.qualification.status).toBe('rejected');
  });

  it('emits no evidence and no BKT when server scoring is invalid', () => {
    const result = adapt({ scoring: { scoringValid: false } });

    expect(result.status).toBe('adapted');
    expect(result.evidence).toBeNull();
    expect(rejectionCodesOf(result)).toEqual(['SERVER_SCORING_INVALID']);
    expect(result.observation?.scoringValid).toBe(false);
    expect(result.observation?.serverItemVersion).toBeUndefined();
    expect(result.observation?.outcome).toBe('omitted');
    expect(AcceptedLessonObservationSchema.parse(result.observation)).toEqual(result.observation);
  });

  it('never lets an omission and an unresolvable scoring mapping share a code', () => {
    const omitted = adapt({
      response: responseFacts({
        omitted: true,
        response: { kind: 'MULTIPLE_CHOICE', chosenChoiceId: null },
      }),
      scoring: {
        scoringValid: true,
        serverItemVersion: 12,
        outcome: 'omitted',
        protectedScoring: false,
      },
    });
    const unscorable = adapt({ scoring: { scoringValid: false } });

    // `SERVER_SCORING_INVALID` means exactly one thing: no serverItemVersion
    // mapping resolved. It suppresses both outputs and nothing else emits it.
    expect(rejectionCodesOf(omitted)).toEqual([]);
    expect(omitted.qualification.status).toBe('qualified');
    expect(omitted.evidence).not.toBeNull();

    expect(rejectionCodesOf(unscorable)).toEqual(['SERVER_SCORING_INVALID']);
    expect(unscorable.qualification.status).toBe('rejected');
    expect(unscorable.evidence).toBeNull();
  });

  it('emits neither evidence nor BKT for a worked example authored without a first-attempt policy', () => {
    const parsed = parseAuthoredLessonBinding(
      { lessonId: 'lesson-x', artifactVersion: '1.0.0' },
      {
        item_binding_id: 'worked-no-policy',
        primary_kc_id: 'kc-1',
        activity_role: 'WORKED_EXAMPLE',
        semantic_family_id: 'fam-1',
        assistance_available: 'VISIBLE_EXPLANATION',
        learner_safe_projection_ref: 'NODE:worked-no-policy',
      },
    );

    expect(parsed.status).toBe('parsed');
    if (parsed.status !== 'parsed') return;
    expect(parsed.measurementKind).toBe('NON_MEASURABLE');

    const result = adapt({ binding: parsed.binding });
    expect(result.status).toBe('not_measurable');
    expect(result.observation).toBeNull();
    expect(result.evidence).toBeNull();
    expect(result.qualification.status).toBe('rejected');
  });

  it('rejects a version mismatch while still recording evidence', () => {
    const result = adapt({ response: responseFacts({ bindingVersion: 'rev/DIFFERENT' }) });

    expect(result.evidence).not.toBeNull();
    expect(rejectionCodesOf(result)).toEqual(['BINDING_VERSION_MISMATCH']);
  });

  it('rejects an eligible binding with no reasoningOperation', () => {
    const eligibleWithoutOperation = {
      ...parseBinding({ candidateEvidenceModes: ['INSTRUCTIONAL'], reasoningOperation: undefined }),
      candidateEvidenceModes: ['TRANSFER'] as readonly CandidateEvidenceMode[],
    } as MeasurableBinding;
    const result = adapt({ binding: eligibleWithoutOperation });

    expect(rejectionCodesOf(result)).toEqual(['ELIGIBLE_BINDING_MISSING_REASONING_OPERATION']);
    expect(result.evidence).not.toBeNull();
  });

  it('rejects a binding that does not preserve the first attempt', () => {
    const mutable = {
      ...parseBinding(),
      firstAttemptImmutable: false as unknown as true,
    } as MeasurableBinding;
    const result = adapt({ binding: mutable });

    expect(rejectionCodesOf(result)).toEqual(['FIRST_ATTEMPT_NOT_IMMUTABLE']);
  });

  it('treats an unresolvable binding version as an unresolved binding', () => {
    const result = adapt({
      binding: parseBinding({ bindingVersion: undefined }),
      envelopeBindingVersion: '',
    });

    expect(result.status).toBe('binding_unresolved');
    expect(rejectionCodesOf(result)).toEqual(['BINDING_NOT_FOUND']);
  });

  it('only emits codes from the frozen list', () => {
    const frozen = new Set<string>(BKT_QUALIFICATION_REJECTION_CODES);
    const samples = [
      adapt({ binding: null }),
      adapt({ scoring: { scoringValid: false } }),
      adapt({ response: responseFacts({ assistanceLevel: 'A3', revealUsed: true }) }),
    ];
    for (const sample of samples) {
      for (const code of rejectionCodesOf(sample)) expect(frozen.has(code)).toBe(true);
    }
  });
});

describe('lesson response adapter — BKT eligibility is an allowlist', () => {
  /**
   * Written out by hand, exhaustively, and cross-checked against the enum below.
   * A denylist (`mode !== 'INSTRUCTIONAL'`) would make a newly added 14th mode
   * BKT-eligible the moment it landed; this map makes it fail instead.
   */
  const EXPECTED_ELIGIBILITY: Readonly<Record<CandidateEvidenceMode, boolean>> = {
    DIAGNOSTIC: false,
    ENTRY: false,
    INSTRUCTIONAL: false,
    INSTRUCTIONAL_EXIT: false,
    REPAIR_CONFIRMATION: false,
    REHEARSAL_ONLY: false,
    INDEPENDENT: true,
    TRANSFER: true,
    DELAYED: true,
    MIXED: true,
    PASSAGE: true,
    TIMED: true,
    PROTECTED: true,
  };

  it('partitions the declared enum with nothing left over', () => {
    expect([...CandidateEvidenceModeSchema.options].sort()).toEqual(
      Object.keys(EXPECTED_ELIGIBILITY).sort(),
    );
    expect([...BKT_ELIGIBLE_EVIDENCE_MODES].sort()).toEqual(
      Object.entries(EXPECTED_ELIGIBILITY)
        .filter(([, eligible]) => eligible)
        .map(([mode]) => mode)
        .sort(),
    );
    expect(BKT_ELIGIBLE_EVIDENCE_MODES).toHaveLength(7);
  });

  for (const mode of CandidateEvidenceModeSchema.options) {
    const eligible = EXPECTED_ELIGIBILITY[mode];
    it(`${eligible ? 'qualifies' : 'refuses to qualify'} a clean first attempt on a ${mode} binding`, () => {
      const result = adapt({ binding: parseBinding({ candidateEvidenceModes: [mode] }) });

      expect(hasEligibleEvidenceMode({ candidateEvidenceModes: [mode] })).toBe(eligible);
      expect(isBktQualificationAccepted(result.qualification)).toBe(eligible);
      if (!eligible) {
        expect(rejectionCodesOf(result)).toEqual(['INDEPENDENT_EVIDENCE_MODE_NOT_DECLARED']);
      }
      // Evidence is recorded either way.
      expect(result.evidence).not.toBeNull();
    });
  }

  it('never lets a BKT-eligible mode route to contextual-only evidence', () => {
    // The defect this allowlist fixes: a mode that moves P(L) while emitting
    // evidence that can never fill a recipe slot.
    for (const mode of BKT_ELIGIBLE_EVIDENCE_MODES) {
      const kind = deriveEvidenceKind([mode], responseFacts(), ALL_ADMINISTRATION_CONDITIONS);
      expect(CONTEXTUAL_ONLY_KINDS.has(kind), mode).toBe(false);
    }
    for (const mode of CandidateEvidenceModeSchema.options.filter(
      (candidate) => !EXPECTED_ELIGIBILITY[candidate],
    )) {
      expect(
        CONTEXTUAL_ONLY_KINDS.has(
          deriveEvidenceKind([mode], responseFacts(), ALL_ADMINISTRATION_CONDITIONS),
        ),
        mode,
      ).toBe(true);
    }
  });

  it('closes BKT for the default INSTRUCTIONAL-only permission set', () => {
    expect(hasEligibleEvidenceMode({ candidateEvidenceModes: ['INSTRUCTIONAL'] })).toBe(false);
    expect(hasEligibleEvidenceMode({ candidateEvidenceModes: ['INSTRUCTIONAL', 'TRANSFER'] })).toBe(
      true,
    );
    // An ineligible mode alongside an eligible one does not close the path, and
    // an ineligible mode carrying a reasoning operation does not open it.
    expect(
      hasEligibleEvidenceMode({ candidateEvidenceModes: ['ENTRY', 'REPAIR_CONFIRMATION'] }),
    ).toBe(false);
  });

  it('classifies a multi-mode binding by its least-credit mode', () => {
    const response = responseFacts();
    expect(
      deriveEvidenceKind(['INDEPENDENT', 'PROTECTED'], response, ALL_ADMINISTRATION_CONDITIONS),
    ).toBe('independent');
    expect(deriveEvidenceKind(['PROTECTED'], response, ALL_ADMINISTRATION_CONDITIONS)).toBe(
      'protected',
    );
    expect(deriveEvidenceKind(['ENTRY'], response, ALL_ADMINISTRATION_CONDITIONS)).toBe(
      'placement',
    );
  });
});

describe('administration conditions come from the runtime, not the author', () => {
  it('ignores declared modes entirely when stamping conditions', () => {
    const declaresEverything = parseBinding({
      candidateEvidenceModes: ['TIMED', 'PASSAGE', 'MIXED', 'PROTECTED'],
    });

    const notAdministered = adapt({ binding: declaresEverything, accommodations: ['extra-time'] });
    expect(notAdministered.evidence?.conditions).toEqual({
      ...NO_ADMINISTRATION_CONDITIONS,
      accommodations: ['extra-time'],
    });

    const administered = adapt({
      binding: declaresEverything,
      response: responseFacts({
        mixedAdministration: true,
        passageAdministration: true,
        timedAdministration: true,
      }),
      scoring: { ...VALID_SCORING, protectedScoring: true },
    });
    expect(administered.evidence?.conditions).toEqual({
      ...ALL_ADMINISTRATION_CONDITIONS,
      accommodations: [],
    });
  });

  it('stamps a condition the runner reports even when no mode declares it', () => {
    const result = adapt({
      binding: parseBinding({ candidateEvidenceModes: ['INDEPENDENT'] }),
      response: responseFacts({ timedAdministration: true }),
    });

    expect(result.evidence?.conditions.timed).toBe(true);
  });

  it('takes `protected` from the server scoring resolution, never from a declared mode', () => {
    const declared = adapt({ binding: parseBinding({ candidateEvidenceModes: ['PROTECTED'] }) });
    expect(declared.evidence?.conditions.protected).toBe(false);
    // Gated out of the kind too: an unprotected administration is not protected
    // evidence, whatever the binding declares.
    expect(declared.evidence?.kind).toBe('instruction');

    const serverDetermined = adapt({
      binding: parseBinding({ candidateEvidenceModes: ['PROTECTED'] }),
      scoring: { ...VALID_SCORING, protectedScoring: true },
    });
    expect(serverDetermined.evidence?.conditions.protected).toBe(true);
    expect(serverDetermined.evidence?.kind).toBe('protected');
  });

  it('will not let a declared mode mint an evidence kind the administration did not earn', () => {
    // Recipe slots key on `kind`, so this is the same author-manufactured
    // warrant as a fabricated condition flag.
    for (const [mode, gate] of [
      ['TIMED', 'timedAdministration'],
      ['PASSAGE', 'passageAdministration'],
      ['MIXED', 'mixedAdministration'],
    ] as const) {
      const ungated = adapt({ binding: parseBinding({ candidateEvidenceModes: [mode] }) });
      expect(ungated.evidence?.kind, mode).toBe('instruction');

      const gated = adapt({
        binding: parseBinding({ candidateEvidenceModes: [mode] }),
        response: responseFacts({ [gate]: true }),
      });
      expect(gated.evidence?.kind, mode).not.toBe('instruction');
    }
  });

  it('defaults every unreported administration condition to false', () => {
    const parsed = LessonRuntimeResponseFactsSchema.parse({
      questionId: 'q',
      itemBindingId: 'ib',
      bindingVersion: 'v',
      attemptIndex: 1,
      isRetry: false,
      isDiagnosticRetry: false,
      response: { kind: 'MULTIPLE_CHOICE', chosenChoiceId: 'a' },
      omitted: false,
      elapsedMs: 0,
      answerChanges: 0,
      assistanceLevel: 'A0',
      contentBearingHintUsed: false,
      revealUsed: false,
      occurredAt: '2026-07-27T12:00:00.000Z',
    });

    expect(parsed.mixedAdministration).toBe(false);
    expect(parsed.passageAdministration).toBe(false);
    expect(parsed.timedAdministration).toBe(false);
  });
});

describe('lesson response adapter — the lesson never decides', () => {
  it('ignores authored assistance affordances when deriving independence', () => {
    const permissive = parseBinding({ authoredAssistanceAffordances: ['A0'] });
    const result = adapt({
      binding: permissive,
      response: responseFacts({ assistanceLevel: 'A3' }),
    });

    expect(result.evidence?.independent).toBe(false);
    expect(rejectionCodesOf(result)).toContain('ASSISTANCE_NOT_A0');
  });

  it('treats an A0 affordance with an A0 runtime level as independent only via the runtime fact', () => {
    expect(isIndependentAdministration(responseFacts())).toBe(true);
    expect(isIndependentAdministration(responseFacts({ assistanceLevel: 'A1' }))).toBe(false);
    expect(isIndependentAdministration(responseFacts({ isRetry: true }))).toBe(false);
  });

  it('never writes a reasoning operation into the OperationTag evidence axis', () => {
    const result = adapt();
    expect(result.evidence).not.toBeNull();
    expect(result.evidence && 'operation' in result.evidence).toBe(false);
  });

  it('copies authored changedDimensions verbatim and never parses prose', () => {
    const empty = adapt();
    expect(empty.evidence?.changeDimensions).toEqual([]);

    const unmapped = adapt({
      binding: parseBinding({
        changedDimensions: [],
        changedDimensionDetail: 'bounded force application',
      }),
    });
    expect(unmapped.evidence?.changeDimensions).toEqual([]);

    const authored = adapt({
      binding: parseBinding({ changedDimensions: ['representation', 'domain_context'] }),
    });
    expect(authored.evidence?.changeDimensions).toEqual(['representation', 'domain_context']);
  });

  it('is pure: repeated calls agree and the inputs are not mutated', () => {
    const binding = parseBinding();
    const response = responseFacts();
    const snapshot = JSON.stringify({ binding, response });

    expect(adapt({ binding, response })).toEqual(adapt({ binding, response }));
    expect(JSON.stringify({ binding, response })).toBe(snapshot);
  });
});

describe('lesson response adapter — response and item shapes', () => {
  it('adapts a constructed multi-field response', () => {
    const response = responseFacts({
      response: {
        kind: 'CONSTRUCTED',
        fields: { slope_value: '2.5', axis_label: 'log concentration', units: null },
      },
    });
    const result = adapt({ response });

    expect(isBktQualificationAccepted(result.qualification)).toBe(true);
    expect(result.observation?.response.response.kind).toBe('CONSTRUCTED');
    expect(AcceptedLessonObservationSchema.parse(result.observation)).toEqual(result.observation);
  });

  it('accepts an opaque learner-safe ref and an inline projection alike', () => {
    const opaque = adapt();
    const inline = adapt({
      binding: parseBinding({
        learnerSafeItemRef: {
          prompt: 'Which model governs the plotted data?',
          choices: [
            { id: 'a', text: 'linear' },
            { id: 'b', text: 'exponential' },
          ],
          representationId: 'rep — alt',
          responseFieldIds: ['slope_value'],
        },
      }),
    });

    expect(isBktQualificationAccepted(opaque.qualification)).toBe(true);
    expect(isBktQualificationAccepted(inline.qualification)).toBe(true);
    expect(inline.evidence?.questionId).toBe('Q?77?ALT — served');
  });

  it('carries lesson-shaped ids through to the evidence record unchanged', () => {
    const result = adapt();

    expect(result.evidence?.skillId).toBe('kc::Δ::9917');
    expect(result.evidence?.familyId).toBe('family — 77');
    expect(result.evidence?.stimulusId).toBe('lineage 77 :: original');
    expect(result.evidence?.itemVersion).toBe(12);
    expect(result.evidence?.cluster).toBe('CP1');
  });
});

describe('authored artifact normalization', () => {
  const envelope = { lessonId: 'V3-LES-XXXXXX', artifactVersion: '9.9.9-envelope' };

  /** The shape of a real scored exit binding, in authored snake_case. */
  const MEASURABLE_AUTHORED_BINDING: Readonly<Record<string, unknown>> = {
    item_binding_id: 'ALG-GRAPH-NEAR-01',
    activity_id: 'ALG-GRAPH-NEAR-01',
    primary_kc_id: 'V3-KC-452593',
    secondary_kc_refs: [],
    activity_role: 'NEAR_EXIT',
    semantic_family_id: 'ALG-GRAPH-FAM-NEAR-01',
    stimulus_lineage_id: 'GRAPH-NEAR-POSITION-TIME',
    first_attempt_policy: 'IMMUTABLE',
    assistance_available: 'A0',
    learner_safe_projection_ref: 'GRAPH_LINEAR_FINAL',
    answer_authority_ref: 'PROTECTED_ITEMS:ALG-GRAPH-NEAR-01',
    rationale_authority_ref: 'PROTECTED_ITEMS:ALG-GRAPH-NEAR-01',
  };

  it('resolves the envelope version when the binding omits one', () => {
    const { value } = normalizeAuthoredLessonBinding(envelope, { item_binding_id: 'x' });
    expect(value.bindingVersion).toBe('9.9.9-envelope');
  });

  it('prefers an authored binding or item version over the envelope', () => {
    expect(
      normalizeAuthoredLessonBinding(envelope, { item_version: 'internal-draft-1' }).value
        .bindingVersion,
    ).toBe('internal-draft-1');
    expect(
      normalizeAuthoredLessonBinding(envelope, { binding_version: 'bv-2' }).value.bindingVersion,
    ).toBe('bv-2');
  });

  it('classifies a worked example as exposition from its role alone', () => {
    expect(
      normalizeAuthoredLessonBinding(envelope, { activity_role: 'WORKED_EXAMPLE' }).measurementKind,
    ).toBe('NON_MEASURABLE');
    expect(
      normalizeAuthoredLessonBinding(envelope, {
        activity_role: 'WORKED_EXAMPLE',
        first_attempt_policy: 'SOME_OTHER_REVIEWED_STRING',
      }).measurementKind,
    ).toBe('NON_MEASURABLE');
    expect(
      normalizeAuthoredLessonBinding(envelope, { activity_role: 'SOLO_PRACTICE' }).measurementKind,
    ).toBe('MEASURABLE');
  });

  it('normalizes every legacy evidence-eligibility label to instructional-only', () => {
    for (const legacy of [
      'INSTRUCTION_TELEMETRY_ONLY',
      'NON_EXIT_INSTRUCTIONAL_ONLY',
      'INSTRUCTIONAL_ONLY',
      'INSTRUCTIONAL_EXIT_ONLY',
    ]) {
      expect(
        normalizeAuthoredLessonBinding(envelope, { evidence_eligibility: legacy }).value
          .candidateEvidenceModes,
      ).toEqual(['INSTRUCTIONAL']);
    }
  });

  it('maps legacy labels inside an authored array and de-duplicates', () => {
    expect(
      normalizeAuthoredLessonBinding(envelope, {
        candidate_evidence_modes: ['INSTRUCTIONAL_ONLY', 'INSTRUCTIONAL', 'TRANSFER'],
      }).value.candidateEvidenceModes,
    ).toEqual(['INSTRUCTIONAL', 'TRANSFER']);
  });

  it('leaves an unauthored mode set to the contract default', () => {
    const parsed = parseAuthoredLessonBinding(envelope, {
      item_binding_id: 'ib-1',
      activity_id: 'act-1',
      primary_kc_id: 'kc-1',
      activity_role: 'ENTRY_CHECK',
      semantic_family_id: 'fam-1',
      first_attempt_policy: 'IMMUTABLE',
      assistance_available: 'A0',
      learner_safe_projection_ref: 'NODE:ib-1',
      answer_authority_ref: 'server://scorer',
    });

    expect(parsed.status).toBe('parsed');
    if (parsed.status !== 'parsed') return;
    expect(parsed.binding.candidateEvidenceModes).toEqual(['INSTRUCTIONAL']);
  });

  it('unwraps a legacy stimulus lineage object and passes a lineage string through', () => {
    expect(
      normalizeAuthoredLessonBinding(envelope, {
        stimulus_lineage: { lineage_id: 'lineage:abc', scenario_signature: 'sig' },
      }).value.stimulusLineageId,
    ).toBe('lineage:abc');
    expect(
      normalizeAuthoredLessonBinding(envelope, { stimulus_lineage: 'plain-lineage' }).value
        .stimulusLineageId,
    ).toBe('plain-lineage');
  });

  it('keys an inline learner-safe projection without touching an opaque ref', () => {
    const inline = normalizeAuthoredLessonBinding(envelope, {
      learner_safe_projection: {
        prompt: 'p',
        representation_id: 'rep-1',
        response_field_ids: ['f1'],
        choices: [{ id: 'a', text: 't' }],
      },
    }).value.learnerSafeItemRef;

    expect(inline).toEqual({
      prompt: 'p',
      representationId: 'rep-1',
      responseFieldIds: ['f1'],
      choices: [{ id: 'a', text: 't' }],
    });
    expect(
      normalizeAuthoredLessonBinding(envelope, { learner_safe_prompt_ref: 'REF:opaque?v=1' }).value
        .learnerSafeItemRef,
    ).toBe('REF:opaque?v=1');
  });

  it('rejects an inline projection carrying answer material', () => {
    const parsed = parseAuthoredLessonBinding(envelope, {
      item_binding_id: 'ib-1',
      primary_kc_id: 'kc-1',
      activity_role: 'SOLO_PRACTICE',
      semantic_family_id: 'fam-1',
      first_attempt_policy: 'IMMUTABLE',
      assistance_available: 'A0',
      answer_authority_ref: 'server://scorer',
      learner_safe_projection: { prompt: 'p', correctChoiceId: 'b' },
    });

    expect(parsed.status).toBe('invalid');
  });

  it('retains raw changed-dimension prose without inferring canonical dimensions', () => {
    const { value } = normalizeAuthoredLessonBinding(envelope, {
      construct_preserving_change: { changed_dimension: 'unknown variable and direction' },
    });

    expect(value.changedDimensions).toEqual([]);
    expect(value.changedDimensionDetail).toBe('unknown variable and direction');
  });

  it('tags an authored assistance level so it can never be read as a runtime level', () => {
    for (const [authored, expected] of [
      ['A0', 'AUTHORED_ASSISTANCE_LEVEL_A0'],
      ['A1', 'AUTHORED_ASSISTANCE_LEVEL_A1'],
      ['A2', 'AUTHORED_ASSISTANCE_LEVEL_A2'],
      ['A3', 'AUTHORED_ASSISTANCE_LEVEL_A3'],
    ]) {
      expect(
        normalizeAuthoredLessonBinding(envelope, { assistance_state: authored }).value
          .authoredAssistanceAffordances,
      ).toEqual([expected]);
    }

    // Genuine affordances survive untouched, including inside a mixed array.
    expect(
      normalizeAuthoredLessonBinding(envelope, {
        assistance_available: ['A2', 'VISIBLE_EXPLANATION', 'NOT_SURE_ALLOWED'],
      }).value.authoredAssistanceAffordances,
    ).toEqual(['AUTHORED_ASSISTANCE_LEVEL_A2', 'VISIBLE_EXPLANATION', 'NOT_SURE_ALLOWED']);
  });

  it('leaves no normalized affordance parseable as an AssistanceLevel', () => {
    for (const lessonKey of ['assistance_state', 'assistance_available']) {
      const affordances = normalizeAuthoredLessonBinding(envelope, { [lessonKey]: 'A0' }).value
        .authoredAssistanceAffordances;
      expect(Array.isArray(affordances)).toBe(true);
      for (const affordance of affordances as readonly unknown[]) {
        expect(AssistanceLevelSchema.safeParse(affordance).success).toBe(false);
      }
    }
  });

  it('reports author keys it does not map', () => {
    expect(unrecognizedAuthoredBindingKeys({ item_binding_id: 'x', activity_role: 'r' })).toEqual(
      [],
    );
    expect(unrecognizedAuthoredBindingKeys({ brand_new_authoring_key: 1 })).toEqual([
      'brand_new_authoring_key',
    ]);
  });

  it('surfaces unrecognized keys on the parse path itself, on both branches', () => {
    // The check used to exist only in the conformance test, so it protected
    // lessons already on disk and nothing else. It now travels with every parse.
    const parsed = parseAuthoredLessonBinding(envelope, {
      ...MEASURABLE_AUTHORED_BINDING,
      brand_new_authoring_key: 'added tomorrow',
      another_unmapped_key: 42,
    });
    expect(parsed.status).toBe('parsed');
    expect(parsed.unrecognizedKeys).toEqual(['brand_new_authoring_key', 'another_unmapped_key']);

    const invalid = parseAuthoredLessonBinding(envelope, {
      item_binding_id: 42,
      brand_new_authoring_key: 'x',
    });
    expect(invalid.status).toBe('invalid');
    expect(invalid.unrecognizedKeys).toEqual(['brand_new_authoring_key']);

    expect(
      parseAuthoredLessonBinding(envelope, MEASURABLE_AUTHORED_BINDING).unrecognizedKeys,
    ).toEqual([]);
  });

  it('rejects a worked example that still carries attempt-bearing fields', () => {
    // The reviewer's case: a real measurable exit binding with ONLY
    // `activity_role` changed. It must not become exposition with its scoring
    // authority and question id silently dropped.
    const contradictory = parseAuthoredLessonBinding(envelope, {
      ...MEASURABLE_AUTHORED_BINDING,
      activity_role: 'WORKED_EXAMPLE',
    });

    expect(contradictory.status).toBe('invalid');
    if (contradictory.status !== 'invalid') return;
    expect(contradictory.measurementKind).toBe('NON_MEASURABLE');
    // Four named contradictions, including the `PROTECTED_ITEMS:` scoring ref
    // that used to be dropped in silence. No `questionId` issue here because
    // this artifact authors none, and the legacy `item_binding_id` fallback is
    // a derivation that exposition never receives.
    expect(new Set(contradictory.issues.map((issue) => issue.path.join('.')))).toEqual(
      new Set([
        'activityId',
        'firstAttemptImmutable',
        'serverScoringAuthorityRef',
        'serverRationaleAuthorityRef',
      ]),
    );
  });

  it('accepts a worked example whose attempt-bearing fields are absent or explicitly null', () => {
    // `null` is the authored spelling of "not applicable" and is not a
    // contradiction — this is the shape real worked examples use.
    const exposition = parseAuthoredLessonBinding(envelope, {
      item_binding_id: 'worked-1',
      activity_id: null,
      primary_kc_id: 'kc-1',
      activity_role: 'WORKED_EXAMPLE',
      semantic_family_id: 'fam-1',
      first_attempt_policy: 'NOT_APPLICABLE_WORKED_REASONING',
      assistance_available: 'VISIBLE_EXPLANATION',
      learner_safe_projection_ref: 'NODE:worked-1',
      answer_authority_ref: null,
      rationale_authority_ref: null,
    });

    expect(exposition.status).toBe('parsed');
    if (exposition.status !== 'parsed') return;
    expect(exposition.measurementKind).toBe('NON_MEASURABLE');
  });

  it('rejects an exposition binding carrying a question id on its own', () => {
    const contradictory = parseAuthoredLessonBinding(envelope, {
      item_binding_id: 'worked-2',
      question_id: 'scored-item-7',
      primary_kc_id: 'kc-1',
      activity_role: 'WORKED_EXAMPLE',
      semantic_family_id: 'fam-1',
      assistance_available: 'VISIBLE_EXPLANATION',
      learner_safe_projection_ref: 'NODE:worked-2',
    });

    expect(contradictory.status).toBe('invalid');
    if (contradictory.status !== 'invalid') return;
    expect(contradictory.issues.map((issue) => issue.path.join('.'))).toEqual(['questionId']);
  });

  it('never throws on a malformed artifact', () => {
    const parsed = parseAuthoredLessonBinding(envelope, { item_binding_id: 42 });
    expect(parsed.status).toBe('invalid');
    if (parsed.status !== 'invalid') return;
    expect(parsed.issues.length).toBeGreaterThan(0);
  });
});
