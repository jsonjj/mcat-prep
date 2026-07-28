import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Authority } from '@mcat/authority-core';
import {
  InMemoryAuthorityRepository,
  toProjectionRecord,
  type Principal,
} from '@mcat/authority-kernel';
import { clusterForLesson } from '@mcat/content';
import { buildVectorLessonArtifacts } from '@mcat/content/v3-vector-lesson';
import {
  BKT_ELIGIBLE_EVIDENCE_MODES,
  LessonRuntimeResponseFactsSchema,
  VectorLessonCommandSchema,
  VectorLessonStartCommandSchema,
  fixedClock,
  hasEligibleEvidenceMode,
  type AssistanceLevel,
  type CandidateEvidenceMode,
  type LessonItemBinding,
} from '@mcat/contracts';
import type { ServerScoringResolution } from '@mcat/domain';
import { describe, expect, it } from 'vitest';
import { VECTOR_LESSON_PROTECTED_ANSWERS } from './vector-lesson-protected';
import { loadAuthoredLessonBindings } from './vector-lesson-response-source';
import { RepositoryLearnerKernel, type LessonResponseSubmission } from './workflow';

/**
 * A SECOND lesson through the real recording workflow.
 *
 * `v3-lesson-binding-conformance.test.ts` already proves all three on-disk
 * lessons parse and produce evidence through `adaptLessonResponse`. What it
 * cannot prove is the other half: that a lesson the seam was NOT wired against
 * reaches an accepted observation, a persisted `EvidenceRecord`, and a persisted
 * mastery decision through `RepositoryLearnerKernel` — transaction, cluster
 * resolution, authority, projection and all — with no code added for it.
 *
 * So this file drives `V3-LES-844372` through `handleVectorLessonCommand` and
 * asserts on the PERSISTED PROJECTION before and after, never on a return value.
 *
 * Two halves, and both are load-bearing:
 *
 * 1. The real artifact, exactly as authored. Every one of its bindings takes the
 *    fail-closed `['INSTRUCTIONAL']` default (contract §3.5/§11), and a lesson
 *    runtime cannot observe assistance taken so it must emit `A3` (§3.3, and the
 *    defect commit `9fcaea3`). The correct outcome is therefore evidence
 *    recorded, `mastery` untouched, zero BKT observations — asserted here as the
 *    RIGHT answer, not as a shortfall.
 * 2. The same real artifact with one binding deliberately declared BKT-eligible
 *    by an author, answered cleanly. `P(L)` must move, for every member of the
 *    seven-mode allowlist. Without this half, half 1 would pass just as well
 *    against a seam that was inert.
 *
 * NOT wired here, and deliberately: `V3-LES-844372` has no delivery runtime and
 * no route of its own. The vector lesson's command endpoint is used only as the
 * TRANSPORT that opens a transaction; the submission it records comes from this
 * lesson's own bindings via `dependencies.lessonResponseSubmissions`, which is
 * exactly the seam a second lesson's runtime plugs into (`workflow.ts`,
 * `LessonResponseSubmissionSource`). Everything between that seam and the
 * projection is production code that never learns which lesson ran.
 */

// ---------------------------------------------------------------------------
// The second lesson, read from the artifact rather than transcribed
// ---------------------------------------------------------------------------

const SECOND_LESSON_ID = 'V3-LES-844372';

/** Repo root, then the workspace root the draft artifacts sit beside. */
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const SECOND_LESSON_SCRIPT = join(
  repoRoot,
  '..',
  'research',
  'mcat-curriculum-architecture-v3',
  'lesson-authoring-drafts',
  SECOND_LESSON_ID,
  'lesson-script.json',
);

type Authored = Record<string, unknown>;

interface LoadedLesson {
  readonly lessonId: string;
  readonly artifactVersion: string;
  readonly authored: readonly Authored[];
}

function loadSecondLesson(): LoadedLesson {
  const envelope = JSON.parse(readFileSync(SECOND_LESSON_SCRIPT, 'utf8')) as {
    artifact_version?: unknown;
    payload?: { lesson_id?: unknown; question_evidence_plan?: unknown };
  };
  const payload = envelope.payload ?? {};
  if (typeof payload.lesson_id !== 'string' || typeof envelope.artifact_version !== 'string') {
    throw new Error(`${SECOND_LESSON_SCRIPT} is not a lesson-script envelope.`);
  }
  if (!Array.isArray(payload.question_evidence_plan)) {
    throw new Error(`${SECOND_LESSON_SCRIPT} carries no question_evidence_plan.`);
  }
  return {
    lessonId: payload.lesson_id,
    artifactVersion: envelope.artifact_version,
    authored: payload.question_evidence_plan as readonly Authored[],
  };
}

const SECOND_LESSON = loadSecondLesson();

/** The lesson the seam WAS wired against — read from its own artifact, not typed in. */
const WIRED_LESSON_SCRIPT = buildVectorLessonArtifacts().script;
const WIRED_LESSON_ID = WIRED_LESSON_SCRIPT.payload.lesson_id;

const SECOND_LESSON_ENVELOPE = {
  lessonId: SECOND_LESSON.lessonId,
  artifactVersion: SECOND_LESSON.artifactVersion,
} as const;

/**
 * The second lesson's bindings, loaded through the SAME production loader the
 * vector lesson uses. A test-local normalizer here would prove nothing about
 * whether the shipped loader is generic.
 */
function loadBindings(authored: readonly Authored[]) {
  return loadAuthoredLessonBindings(SECOND_LESSON_ENVELOPE, authored);
}

const SECOND_LESSON_BINDINGS = loadBindings(SECOND_LESSON.authored);

const authoredById = new Map(
  SECOND_LESSON.authored.map((raw) => [String(raw.item_binding_id), raw] as const),
);

function bindingFor(itemBindingId: string): LessonItemBinding {
  const binding = SECOND_LESSON_BINDINGS.bindings.get(itemBindingId);
  if (binding === undefined) {
    throw new Error(`${itemBindingId} did not load, so any assertion about it would be vacuous.`);
  }
  return binding;
}

const measurableBindings = (): readonly LessonItemBinding[] =>
  [...SECOND_LESSON_BINDINGS.bindings.values()].filter(
    (binding) => binding.measurementKind === 'MEASURABLE',
  );

/** A representative measurable binding: the first entry check of the first KC. */
const PROBE_ITEM_ID = 'ALG-GRAPH-ENTRY-01';
const PROBE_KC_ID = 'V3-KC-452593';

// ---------------------------------------------------------------------------
// The second lesson's runtime half — facts only, and no lesson-specific policy
// ---------------------------------------------------------------------------

/**
 * The scored item version this lesson's scoring authority resolves.
 *
 * `SERVER_ITEM_VERSION_RESOLUTION` (§7.1) is caller-resolved by design, and this
 * lesson has no protected answer authority in the repo yet, so the test plays
 * that role. It is deliberately NOT `1`: reusing the vector lesson's number
 * would hide a resolution that had silently fallen through to a shared default.
 */
const SECOND_LESSON_SERVER_ITEM_VERSION = 3;

const VALID_SCORING: ServerScoringResolution = {
  scoringValid: true,
  serverItemVersion: SECOND_LESSON_SERVER_ITEM_VERSION,
  outcome: 'correct',
  protectedScoring: false,
};

interface RuntimeFactOverrides {
  readonly assistanceLevel?: AssistanceLevel;
  readonly contentBearingHintUsed?: boolean;
  readonly revealUsed?: boolean;
  readonly attemptIndex?: number;
  readonly occurredAt?: string;
  readonly mixedAdministration?: boolean;
  readonly passageAdministration?: boolean;
  readonly timedAdministration?: boolean;
}

const NOW = '2026-07-23T18:00:00.000Z';
/** Before the server clock, so an in-range report can be told from a clamped one. */
const IN_RANGE_OCCURRED_AT = '2026-07-23T17:59:30.000Z';
const clock = fixedClock(NOW);

/**
 * One committed response, expressed only in seam vocabulary.
 *
 * `assistanceLevel` defaults to `A3` for the same reason
 * `vector-lesson-response-source.ts` fail-closes it: a lesson runtime that
 * cannot observe the help a learner took must not state a level, and `A3` is the
 * only member of the closed vocabulary that can never satisfy `ASSISTANCE_NOT_A0`.
 * Hint and reveal are left `false` because those two ARE observable from a run's
 * own state machine, which isolates the assistance fail-close as the single
 * runtime reason `P(L)` does not move.
 */
function submissionFor(
  binding: LessonItemBinding,
  overrides: RuntimeFactOverrides = {},
  scoring: ServerScoringResolution = VALID_SCORING,
): LessonResponseSubmission {
  const bindingVersion = binding.bindingVersion ?? SECOND_LESSON.artifactVersion;
  const questionId =
    binding.measurementKind === 'MEASURABLE' ? binding.questionId : binding.itemBindingId;
  return {
    lessonId: SECOND_LESSON.lessonId,
    envelopeBindingVersion: SECOND_LESSON.artifactVersion,
    binding,
    bindingResolution: { status: 'parsed', unrecognizedKeys: [] },
    response: LessonRuntimeResponseFactsSchema.parse({
      questionId,
      itemBindingId: binding.itemBindingId,
      bindingVersion,
      attemptIndex: overrides.attemptIndex ?? 1,
      isRetry: false,
      isDiagnosticRetry: false,
      response: { kind: 'MULTIPLE_CHOICE', chosenChoiceId: 'B' },
      omitted: false,
      elapsedMs: 41_000,
      answerChanges: 0,
      assistanceLevel: overrides.assistanceLevel ?? 'A3',
      contentBearingHintUsed: overrides.contentBearingHintUsed ?? false,
      revealUsed: overrides.revealUsed ?? false,
      mixedAdministration: overrides.mixedAdministration ?? false,
      passageAdministration: overrides.passageAdministration ?? false,
      timedAdministration: overrides.timedAdministration ?? false,
      occurredAt: overrides.occurredAt ?? IN_RANGE_OCCURRED_AT,
    }),
    scoring,
  };
}

// ---------------------------------------------------------------------------
// Harness: the real kernel, the real repository, the real transaction
// ---------------------------------------------------------------------------

function envelope(expectedStreamVersion: number) {
  return {
    eventId: crypto.randomUUID(),
    idempotencyKey: crypto.randomUUID(),
    occurredAt: NOW,
    expectedStreamVersion,
    contentRelease: 'synthetic-2026.07',
    taskInstanceId: crypto.randomUUID(),
  };
}

interface PersistedMastery {
  readonly kc: Record<string, { readonly pL: number } | undefined>;
  readonly skill: Record<string, { readonly pL: number } | undefined>;
  readonly appliedObservationIds?: readonly string[];
  readonly practicedLessonIds?: readonly string[];
}

interface PersistedState {
  readonly evidence: readonly Record<string, unknown>[];
  readonly mastery?: PersistedMastery;
  readonly events: readonly { readonly type: string; readonly payload: Authored }[];
}

interface LessonResponseRecord {
  readonly status: string;
  readonly observationId: string | null;
  readonly evidenceId: string | null;
  readonly evidenceKind: string | null;
  readonly bkt: string;
  readonly rejectionCodes: readonly string[];
  readonly binding: { readonly resolution: string; readonly unrecognizedKeys: readonly string[] };
}

interface Probe {
  /** The projection as actually stored, re-read on every call. */
  persisted(): PersistedState;
  /** Queue one submission, advance the transport by one accepted command. */
  submit(submission: LessonResponseSubmission): Promise<LessonResponseRecord | undefined>;
  /** Advance the transport without offering the recorder anything. */
  advance(): Promise<void>;
}

async function startProbe(): Promise<Probe> {
  const authority = new Authority(undefined, clock);
  const guest = authority.createGuest();
  guest.onboarding.diagnosticComplete = true;
  const repository = new InMemoryAuthorityRepository([toProjectionRecord(guest, 0, NOW)]);
  const principal: Principal = {
    kind: 'guest',
    learnerId: guest.learnerId,
    sessionId: crypto.randomUUID(),
  };

  const queued: LessonResponseSubmission[] = [];
  const kernel = new RepositoryLearnerKernel({
    repository,
    clock,
    bank: authority.bank,
    // The second lesson's runtime half. Nothing below this line knows it exists.
    lessonResponseSubmissions: () => queued.splice(0, 1),
  });

  let streamVersion = 0;
  const started = (await kernel.handleVectorLessonStart(
    VectorLessonStartCommandSchema.parse({
      envelope: envelope(streamVersion),
      lessonId: WIRED_LESSON_ID,
    }),
    principal,
  )) as { streamVersion: number };
  streamVersion = started.streamVersion;

  const persisted = (): PersistedState => {
    const projection = repository.projectionFor(principal.learnerId);
    if (projection === null) throw new Error('the learner projection is missing');
    return projection.state as unknown as PersistedState;
  };

  const advance = async (): Promise<void> => {
    const view = (await kernel.vectorLessonRun(principal)) as unknown as {
      state: string;
      runId: string;
      screen: { kind: string; screenToken: string };
    };
    if (view.state !== 'IN_PROGRESS') {
      throw new Error(
        `The transport lesson reached ${view.state} before this probe finished. Every ` +
          'assertion after this point would be vacuous; shorten the probe rather than ' +
          'swallowing this.',
      );
    }
    const run = repository.projectionFor(principal.learnerId)?.state.vectorLessonRun as
      | { currentItemId: string | null }
      | undefined;
    const action =
      view.screen.kind === 'QUESTION'
        ? {
            type: 'SUBMIT_RESPONSE',
            choiceId:
              VECTOR_LESSON_PROTECTED_ANSWERS[run?.currentItemId ?? '']?.correctChoiceId ?? null,
          }
        : { type: 'CONTINUE' };
    const accepted = (await kernel.handleVectorLessonCommand(
      VectorLessonCommandSchema.parse({
        envelope: envelope(streamVersion),
        runId: view.runId,
        screenToken: view.screen.screenToken,
        action,
      }),
      principal,
    )) as { streamVersion: number };
    streamVersion = accepted.streamVersion;
  };

  return {
    persisted,
    advance,
    submit: async (submission) => {
      queued.push(submission);
      await advance();
      if (queued.length > 0) {
        throw new Error('The workflow never asked for the queued submission.');
      }
      const events = repository.eventsFor(principal.learnerId);
      return events.at(-1)?.payload.lessonResponse as LessonResponseRecord | undefined;
    },
  };
}

// ---------------------------------------------------------------------------
// It really is a different lesson
// ---------------------------------------------------------------------------

describe('the second lesson is genuinely not the lesson the seam was wired against', () => {
  it('is a different artifact with a different authoring dialect', () => {
    expect(SECOND_LESSON.lessonId).toBe(SECOND_LESSON_ID);
    expect(SECOND_LESSON.lessonId).not.toBe(WIRED_LESSON_ID);
    expect(SECOND_LESSON.artifactVersion).not.toBe(WIRED_LESSON_SCRIPT.artifact_version);
    expect(SECOND_LESSON.authored).toHaveLength(33);

    const authoredKeys = (bindings: readonly Authored[]): ReadonlySet<string> =>
      new Set(bindings.flatMap((binding) => Object.keys(binding)));
    const second = authoredKeys(SECOND_LESSON.authored);
    const wired = authoredKeys(
      WIRED_LESSON_SCRIPT.payload.question_evidence_plan as unknown as readonly Authored[],
    );

    // The two lessons spell the same facts with different author keys, so the
    // adapter is being exercised on aliases the wired lesson never uses. If a
    // future re-cut made these agree, this lesson stops being a second dialect
    // and the assertion should be pointed at one that still is.
    for (const key of [
      'first_attempt_policy',
      'assistance_available',
      'learner_safe_projection_ref',
      'answer_authority_ref',
      'stimulus_lineage_id',
    ]) {
      expect(second.has(key), `${SECOND_LESSON_ID} no longer authors ${key}`).toBe(true);
      expect(wired.has(key), `${WIRED_LESSON_ID} now also authors ${key}`).toBe(false);
    }
    for (const key of [
      'first_attempt_immutable',
      'assistance_state',
      'learner_safe_projection',
      'server_answer_authority_ref',
      'stimulus_lineage',
    ]) {
      expect(wired.has(key), `${WIRED_LESSON_ID} no longer authors ${key}`).toBe(true);
      expect(second.has(key), `${SECOND_LESSON_ID} now also authors ${key}`).toBe(false);
    }

    // Its item ids are a shape the global `ContentId` brand rejects (§3.9), so
    // no id-format assumption can be hiding anywhere on this path.
    expect(PROBE_ITEM_ID).toMatch(/[A-Z]/);
    expect(bindingFor(PROBE_ITEM_ID).primaryKcId).toBe(PROBE_KC_ID);
  });

  it('loads every binding through the production loader with nothing withheld', () => {
    expect(SECOND_LESSON_BINDINGS.issues).toEqual([]);
    expect(SECOND_LESSON_BINDINGS.bindings.size).toBe(SECOND_LESSON.authored.length);
    expect(measurableBindings()).toHaveLength(30);
    expect(SECOND_LESSON.authored.length - measurableBindings().length).toBe(3);

    // Its cluster resolves from the shipped registry, so no mapping was added
    // for it (§7.3 — `cluster` is caller-resolved and never lesson-specific).
    expect(clusterForLesson(SECOND_LESSON.lessonId)).toBe('R1');

    // Every binding takes the fail-closed default and none is BKT-eligible.
    for (const binding of SECOND_LESSON_BINDINGS.bindings.values()) {
      expect(binding.candidateEvidenceModes, binding.itemBindingId).toEqual(['INSTRUCTIONAL']);
      expect(hasEligibleEvidenceMode(binding), binding.itemBindingId).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// Half 1 — the real artifact: evidence yes, P(L) no
// ---------------------------------------------------------------------------

describe('a second real lesson records evidence and moves no P(L)', () => {
  it('persists one evidence record with a server-bounded timestamp and no mastery', async () => {
    const probe = await startProbe();

    const before = probe.persisted();
    expect(before.evidence).toEqual([]);
    expect(before.mastery).toBeUndefined();

    // A future-dated runner claim: the record must be clamped to the server's
    // acceptance time, or a lesson response sits inside every freshness window
    // forever.
    const recorded = await probe.submit(
      submissionFor(bindingFor(PROBE_ITEM_ID), { occurredAt: '2027-04-01T00:00:00.000Z' }),
    );

    const after = probe.persisted();
    expect(after.evidence).toHaveLength(1);
    expect(after.evidence[0]).toMatchObject({
      skillId: PROBE_KC_ID,
      cluster: 'R1',
      kind: 'instruction',
      independent: false,
      assistanceLevel: 'A3',
      questionId: PROBE_ITEM_ID,
      familyId: 'ALG-GRAPH-FAM-ENTRY-01',
      stimulusId: 'GRAPH-ENTRY-SCALE-LABELS',
      itemVersion: SECOND_LESSON_SERVER_ITEM_VERSION,
      outcome: 'correct',
      valid: true,
      occurredAt: NOW,
    });

    // The accepted observation exists and is identified on the ledger.
    expect(recorded?.status).toBe('adapted');
    expect(recorded?.observationId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(recorded?.evidenceKind).toBe('instruction');
    expect(recorded?.binding).toEqual({ resolution: 'parsed', unrecognizedKeys: [] });

    // The two deliberate fail-closes, and NOTHING else, are why P(L) held still.
    expect(recorded?.bkt).toBe('not_qualified');
    expect([...(recorded?.rejectionCodes ?? [])].sort()).toEqual([
      'ASSISTANCE_NOT_A0',
      'INDEPENDENT_EVIDENCE_MODE_NOT_DECLARED',
    ]);

    // Capability is untouched: not zeroed, not seeded — absent.
    expect(after.mastery).toBeUndefined();
    expect(after.events.filter((event) => event.type === 'bkt_observation_applied')).toEqual([]);
  });

  it('preserves an in-range runner time, so the clamp above is a ceiling not an overwrite', async () => {
    const probe = await startProbe();
    await probe.submit(submissionFor(bindingFor(PROBE_ITEM_ID)));
    expect(probe.persisted().evidence[0]).toMatchObject({ occurredAt: IN_RANGE_OCCURRED_AT });
  });

  it('records every measurable binding and leaves mastery absent across all of them', async () => {
    const probe = await startProbe();
    const measurable = measurableBindings();
    expect(measurable.length).toBeGreaterThan(1);

    for (const binding of measurable) {
      const evidenceBefore = probe.persisted().evidence.length;
      const recorded = await probe.submit(submissionFor(binding));
      expect(recorded?.status, binding.itemBindingId).toBe('adapted');
      expect(recorded?.bkt, binding.itemBindingId).toBe('not_qualified');
      expect(probe.persisted().evidence.length, binding.itemBindingId).toBe(evidenceBefore + 1);
    }

    const after = probe.persisted();
    expect(after.evidence).toHaveLength(measurable.length);
    expect(new Set(after.evidence.map((record) => record.evidenceId)).size).toBe(measurable.length);
    expect(new Set(after.evidence.map((record) => record.kind))).toEqual(new Set(['instruction']));
    // All three of the lesson's required KCs produced evidence, so this is the
    // whole lesson and not one activity of it.
    expect(new Set(after.evidence.map((record) => record.skillId))).toEqual(
      new Set(['V3-KC-452593', 'V3-KC-008681', 'V3-KC-238607']),
    );
    expect(after.mastery).toBeUndefined();
  });

  it("produces nothing at all for the lesson's exposition bindings", async () => {
    const probe = await startProbe();
    const exposition = [...SECOND_LESSON_BINDINGS.bindings.values()].filter(
      (binding) => binding.measurementKind === 'NON_MEASURABLE',
    );
    expect(exposition).toHaveLength(3);

    for (const binding of exposition) {
      const recorded = await probe.submit(submissionFor(binding));
      expect(recorded?.status, binding.itemBindingId).toBe('not_measurable');
      expect(recorded?.observationId, binding.itemBindingId).toBeNull();
      expect(recorded?.evidenceId, binding.itemBindingId).toBeNull();
    }
    expect(probe.persisted().evidence).toEqual([]);
    expect(probe.persisted().mastery).toBeUndefined();
  });

  it('writes no evidence when this lesson resolves no server item version', async () => {
    const probe = await startProbe();
    const recorded = await probe.submit(
      submissionFor(bindingFor(PROBE_ITEM_ID), {}, { scoringValid: false }),
    );
    expect(recorded?.rejectionCodes).toContain('SERVER_SCORING_INVALID');
    expect(recorded?.evidenceId).toBeNull();
    expect(probe.persisted().evidence).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Half 2 — the same lesson, declared eligible: P(L) moves
// ---------------------------------------------------------------------------

/** The evidence kind each allowlisted mode routes to on a clean administration. */
const KIND_FOR_MODE: Readonly<Record<string, string>> = {
  INDEPENDENT: 'independent',
  TRANSFER: 'transfer',
  DELAYED: 'delayed',
  MIXED: 'mixed',
  PASSAGE: 'integrated_passage',
  TIMED: 'timed',
  PROTECTED: 'protected',
};

/**
 * The probe binding as an author and reviewer would deliberately publish it for
 * measurement: one declared mode plus the governed `reasoning_operation` that
 * §6 makes a hard stop. Nothing else about the artifact changes, and it is
 * normalized by the same production loader.
 */
function eligibleBinding(mode: CandidateEvidenceMode): LessonItemBinding {
  const authored = authoredById.get(PROBE_ITEM_ID);
  if (authored === undefined) throw new Error(`${PROBE_ITEM_ID} is not in the artifact.`);
  const load = loadBindings([
    { ...authored, candidate_evidence_modes: [mode], reasoning_operation: 'RELATE' },
  ]);
  expect(load.issues, `the ${mode} binding did not load cleanly`).toEqual([]);
  const binding = load.bindings.get(PROBE_ITEM_ID);
  if (binding === undefined) throw new Error(`the ${mode} binding was withheld.`);
  expect(hasEligibleEvidenceMode(binding)).toBe(true);
  return binding;
}

/** The runtime facts of a clean, unassisted, uncontaminated first look. */
const CLEAN_FIRST_ATTEMPT: RuntimeFactOverrides = {
  assistanceLevel: 'A0',
  contentBearingHintUsed: false,
  revealUsed: false,
  attemptIndex: 1,
};

describe('the same seam moves P(L) once a binding is deliberately declared eligible', () => {
  it('names every allowlisted mode, so the loop below cannot silently shrink', () => {
    expect([...BKT_ELIGIBLE_EVIDENCE_MODES].sort()).toEqual(Object.keys(KIND_FOR_MODE).sort());
    expect(BKT_ELIGIBLE_EVIDENCE_MODES).toHaveLength(7);
  });

  for (const mode of BKT_ELIGIBLE_EVIDENCE_MODES) {
    it(`persists a P(L) movement and matching evidence for ${mode}`, async () => {
      const probe = await startProbe();

      const before = probe.persisted();
      expect(before.mastery).toBeUndefined();
      expect(before.evidence).toEqual([]);

      // The runner reports the conditions it actually administered under, so the
      // record's kind matches the declaration instead of being manufactured by
      // it. `protected` is the exception: it is the scoring authority's
      // statement about the item, not something a runner can observe (§7.3), so
      // it travels on the scoring resolution.
      const recorded = await probe.submit(
        submissionFor(
          eligibleBinding(mode),
          {
            ...CLEAN_FIRST_ATTEMPT,
            mixedAdministration: mode === 'MIXED',
            passageAdministration: mode === 'PASSAGE',
            timedAdministration: mode === 'TIMED',
          },
          mode === 'PROTECTED' ? { ...VALID_SCORING, protectedScoring: true } : VALID_SCORING,
        ),
      );

      const after = probe.persisted();
      expect(recorded?.status).toBe('adapted');
      expect(recorded?.rejectionCodes).toEqual([]);
      expect(recorded?.bkt).toBe('applied');
      expect(recorded?.evidenceKind).toBe(KIND_FOR_MODE[mode]);

      // The persisted capability estimate moved off the prior, on both grains.
      const kc = after.mastery?.kc[PROBE_KC_ID];
      expect(kc, `${mode} left no KC state behind`).toBeDefined();
      expect(kc?.pL).toBeGreaterThan(0.2);
      expect(after.mastery?.skill.RELATE?.pL).toBeGreaterThan(0.2);
      expect(after.mastery?.appliedObservationIds).toHaveLength(1);
      expect(after.mastery?.appliedObservationIds?.[0]).toBe(recorded?.observationId);
      // Routing/audit only — the lesson itself has no BKT state (§8.2).
      expect(after.mastery?.practicedLessonIds).toEqual([SECOND_LESSON_ID]);
      expect(Object.keys(after.mastery?.kc ?? {})).toEqual([PROBE_KC_ID]);

      // The warrant landed too, and carries no capability estimate.
      expect(after.evidence).toHaveLength(1);
      expect(after.evidence[0]).toMatchObject({
        skillId: PROBE_KC_ID,
        kind: KIND_FOR_MODE[mode],
        independent: true,
        assistanceLevel: 'A0',
      });
      expect(Object.keys(after.evidence[0] ?? {})).not.toContain('pL');

      const applications = after.events.filter((event) => event.type === 'bkt_observation_applied');
      expect(applications).toHaveLength(1);
      expect(applications[0]?.payload).toMatchObject({
        primaryKcId: PROBE_KC_ID,
        reasoningOperation: 'RELATE',
        correct: true,
        rejectionCodes: [],
      });
    });
  }

  it('moves P(L) exactly once per accepted response, not once per replay of the state', async () => {
    const probe = await startProbe();
    await probe.submit(submissionFor(eligibleBinding('TRANSFER'), CLEAN_FIRST_ATTEMPT));
    const afterFirst = probe.persisted();
    const firstPl = afterFirst.mastery?.kc[PROBE_KC_ID]?.pL;
    expect(firstPl).toBeGreaterThan(0.2);

    // An accepted lesson command that offers the recorder nothing must not
    // re-apply the observation already on the ledger.
    await probe.advance();
    const afterIdle = probe.persisted();
    expect(afterIdle.mastery?.kc[PROBE_KC_ID]?.pL).toBe(firstPl);
    expect(afterIdle.mastery?.appliedObservationIds).toHaveLength(1);
    expect(afterIdle.evidence).toHaveLength(1);
  });

  it('still refuses an eligible binding that was not answered independently', async () => {
    // The declaration is a permission, not an outcome (§3.5). This is the same
    // eligible binding as above, answered with help taken.
    const probe = await startProbe();
    const recorded = await probe.submit(
      submissionFor(eligibleBinding('INDEPENDENT'), { ...CLEAN_FIRST_ATTEMPT, revealUsed: true }),
    );
    expect(recorded?.rejectionCodes).toContain('REVEAL_USED');
    expect(recorded?.bkt).toBe('not_qualified');
    expect(probe.persisted().mastery).toBeUndefined();
    // The administration is still documented as evidence, downgraded to instruction.
    expect(probe.persisted().evidence).toHaveLength(1);
    expect(probe.persisted().evidence[0]).toMatchObject({
      kind: 'instruction',
      independent: false,
    });
  });
});
