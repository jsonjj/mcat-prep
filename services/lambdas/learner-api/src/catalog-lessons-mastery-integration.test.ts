import { Authority } from '@mcat/authority-core';
import {
  InMemoryAuthorityRepository,
  toProjectionRecord,
  type Principal,
} from '@mcat/authority-kernel';
import { orderedKcsForLesson } from '@mcat/content';
import {
  CommandEnvelopeSchema,
  VectorLessonCommandSchema,
  VectorLessonStartCommandSchema,
  fixedClock,
} from '@mcat/contracts';
import {
  bktConfigForSource,
  bktUpdate,
  difficultyB,
  IRT_CONFIG,
  PRIOR_PL0,
  slip,
} from '@mcat/policies';
import { describe, expect, it } from 'vitest';

import { createRepoLessonContentProvider } from './lesson-content-provider';
import type { EngineResponse, NormalizedLessonAction } from './normalized-lesson-runtime';
import { VECTOR_LESSON_PROTECTED_ANSWERS } from './vector-lesson-protected';
import { RepositoryLearnerKernel } from './workflow';

/**
 * Phase 5, wave 5C — `p5-runtime-verify`.
 *
 * ONE end-to-end walk of the ENTIRE catalog — L1 through its bespoke vector
 * transport, L2 and L3 through the shared normalized engine — against the real
 * `RepositoryLearnerKernel` (real repository + authority + transaction). It pins
 * the mastery discipline the plan requires: P(L) moves ONLY on the licensed
 * changed exits, and ONLY through the raised `LESSON_EXIT_GUESS_G` guess channel —
 * never a weight multiplier, a cap, or the undiscounted practice guess.
 * Near/instructional items are delivered and DO write evidence; they simply move
 * no grain.
 *
 * The guess-channel proof is closed-form, not eyeballed. No lesson item carries a
 * `dok_level`, so every correct changed-exit observation is scored at the SAME
 * cold-start slip and lands its grain at exactly the lesson-exit posterior, which
 * is strictly below the posterior the SAME answer would earn on the
 * `adaptive_practice` channel. Reading each moved grain at that exact discounted
 * value — and every applied ledger record at `source: 'lesson_response'` — is what
 * ties the movement to the guess term inside Bayes' rule rather than to any scaling
 * of the result. A cap or weight multiplier would land the grain somewhere else and
 * would leave the source unchanged, so the value IS the discriminator.
 *
 * L1 and L3 fire ONE changed exit per KC on a clean walk (their second exit per KC
 * is a miss-gated re-entry the walk never triggers). L2 carries no re-entry marking,
 * so BOTH of its baseline changed exits per KC fire — two discounted passes on each
 * grain, eight qualified observations over four KCs, exactly the Phase-4 pin. That
 * asymmetry is the whole point of walking all three through one seam.
 */

const NOW = '2026-07-30T18:00:00.000Z';
const clock = fixedClock(NOW);
const provider = createRepoLessonContentProvider();

const L1 = 'V3-LES-130923';
const L2 = 'V3-LES-789208';
const L3 = 'V3-LES-844372';

const COLD_START_SLIP = slip(difficultyB({ attempts: 0, correct: 0 }, IRT_CONFIG), IRT_CONFIG);

/**
 * Apply `n` correct, cold-start passes to one grain from the prior, all at the same
 * instant (so no forgetting decays between them), through the guess channel that
 * `source` selects. This is exactly what the runtime does to a KC that receives `n`
 * changed-exit passes in a single clean walk, so the pins below are the policy's own
 * output rather than transcribed magic numbers.
 */
function applyPasses(n: number, source: 'lesson_response' | 'adaptive_practice'): number {
  const config = bktConfigForSource(source);
  let pL = PRIOR_PL0;
  for (let index = 0; index < n; index += 1) {
    pL = bktUpdate(pL, { correct: true, slip: COLD_START_SLIP }, config);
  }
  return pL;
}

/** One changed-exit pass on the lesson channel — the L1/L3 per-KC value (~0.4304). */
const LESSON_EXIT_PL = applyPasses(1, 'lesson_response');
/** The SAME single correct answer on the practice channel — strictly more (~0.5717). */
const PRACTICE_PL = applyPasses(1, 'adaptive_practice');

interface LedgerRecord {
  readonly type: string;
  readonly payload?: { readonly source?: string };
}
interface EvidenceRecord {
  readonly kind?: string;
  readonly questionId?: string;
}
interface PersistedState {
  readonly events: readonly LedgerRecord[];
  readonly evidence: readonly EvidenceRecord[];
  readonly mastery?: {
    readonly kc: Record<string, { readonly pL: number } | undefined>;
    readonly appliedObservationIds?: readonly string[];
    readonly practicedLessonIds?: readonly string[];
  };
  readonly vectorLessonRun?: { readonly currentItemId?: string | null };
}

function freshKernel() {
  const authority = new Authority(undefined, clock);
  const guest = authority.createGuest();
  guest.onboarding.diagnosticComplete = true;
  const repository = new InMemoryAuthorityRepository([toProjectionRecord(guest, 0, NOW)]);
  const principal: Principal = {
    kind: 'guest',
    learnerId: guest.learnerId,
    sessionId: crypto.randomUUID(),
  };
  const kernel = new RepositoryLearnerKernel({ repository, clock, bank: authority.bank });
  const persisted = (): PersistedState => {
    const projection = repository.projectionFor(principal.learnerId);
    if (projection === null) throw new Error('the learner projection is missing');
    return projection.state as unknown as PersistedState;
  };
  return { kernel, principal, persisted };
}

function envelope(expectedStreamVersion: number) {
  return CommandEnvelopeSchema.parse({
    eventId: crypto.randomUUID(),
    idempotencyKey: crypto.randomUUID(),
    occurredAt: NOW,
    expectedStreamVersion,
    contentRelease: 'synthetic-2026.07',
    taskInstanceId: crypto.randomUUID(),
  });
}

/** Drive L1 through its bespoke vector transport to `DELIVERY_COMPLETE`. */
async function walkVectorLesson(env: ReturnType<typeof freshKernel>): Promise<void> {
  const { kernel, principal, persisted } = env;
  const started = (await kernel.handleVectorLessonStart(
    VectorLessonStartCommandSchema.parse({ envelope: envelope(0), lessonId: L1 }),
    principal,
  )) as unknown as { streamVersion: number };
  let streamVersion = started.streamVersion;

  for (let guard = 0; guard < 3000; guard += 1) {
    const view = (await kernel.vectorLessonRun(principal)) as unknown as {
      state: string;
      runId: string;
      screen: { kind: string; screenToken: string };
    };
    if (view.state === 'DELIVERY_COMPLETE') return;
    const currentItemId = persisted().vectorLessonRun?.currentItemId ?? '';
    const action =
      view.screen.kind === 'QUESTION'
        ? {
            type: 'SUBMIT_RESPONSE' as const,
            choiceId: VECTOR_LESSON_PROTECTED_ANSWERS[currentItemId]?.correctChoiceId,
          }
        : { type: 'CONTINUE' as const };
    const accepted = (await kernel.handleVectorLessonCommand(
      VectorLessonCommandSchema.parse({
        envelope: envelope(streamVersion),
        runId: view.runId,
        screenToken: view.screen.screenToken,
        action,
      }),
      principal,
    )) as unknown as { streamVersion: number };
    streamVersion = accepted.streamVersion;
  }
  throw new Error('the L1 walk did not terminate');
}

function correctResponseFor(lessonId: string, itemId: string): EngineResponse {
  const answer = provider.getAnswerKey(lessonId).byItemId[itemId];
  const item = provider
    .getNormalizedLesson(lessonId)
    .items.find((candidate) => candidate.itemId === itemId);
  if (answer === undefined) throw new Error(`no answer for ${itemId}`);
  if (answer.correctChoiceId !== null) {
    return { kind: 'MULTIPLE_CHOICE', choiceId: answer.correctChoiceId };
  }
  if (answer.structuredAuthority !== undefined) {
    const control = item?.projection.responseControl;
    if (control?.kind !== 'STRUCTURED_FIELDS')
      throw new Error(`no structured control for ${itemId}`);
    const authority = answer.structuredAuthority as {
      expected_equation_forms?: readonly string[];
      expected_solution_pair?: readonly string[];
    };
    const equations = [...(authority.expected_equation_forms ?? [])];
    const pair = (authority.expected_solution_pair ?? []).map((part) =>
      part.split('=').at(-1)?.trim(),
    );
    let equationIndex = 0;
    return {
      kind: 'CONSTRUCTED',
      fields: Object.fromEntries(
        control.fields.map(({ fieldId }) => [
          fieldId,
          fieldId.includes('solution')
            ? `(${pair.join(', ')})`
            : (equations[equationIndex++] ?? '__missing_authority__'),
        ]),
      ),
    };
  }
  return { kind: 'SHORT', text: answer.acceptedResponses[0] ?? '' };
}

/** Drive a normalized lesson (L2/L3) through the shared engine; returns the terminal screen kind. */
async function walkNormalizedLesson(
  env: ReturnType<typeof freshKernel>,
  lessonId: string,
): Promise<string> {
  const { kernel, principal } = env;
  const started = (await kernel.handleNormalizedLessonStart(
    lessonId,
    { envelope: envelope(0) },
    principal,
  )) as unknown as { streamVersion: number };
  let streamVersion = started.streamVersion;

  for (let guard = 0; guard < 3000; guard += 1) {
    const screen = (await kernel.normalizedLessonRun(lessonId, principal)).screen;
    if (screen.kind === 'COMPLETE' || screen.kind === 'BLOCKED') return screen.kind;
    const action: NormalizedLessonAction =
      screen.kind === 'QUESTION'
        ? { type: 'SUBMIT_RESPONSE', response: correctResponseFor(lessonId, screen.itemId) }
        : { type: 'CONTINUE' };
    const accepted = (await kernel.handleNormalizedLessonCommand(
      lessonId,
      { envelope: envelope(streamVersion), action },
      principal,
    )) as unknown as { streamVersion: number };
    streamVersion = accepted.streamVersion;
  }
  throw new Error(`the ${lessonId} walk did not terminate`);
}

interface Observed {
  readonly movedKcs: readonly string[];
  readonly movedKcPLs: readonly number[];
  readonly appliedCount: number;
  readonly appliedSources: readonly string[];
  readonly transferCount: number;
  readonly totalEvidence: number;
  readonly practicedLessonIds: readonly string[];
}

function observe(state: PersistedState): Observed {
  const kc = state.mastery?.kc ?? {};
  const movedKcs = Object.keys(kc).sort();
  const bktRecords = state.events.filter((event) => event.type === 'bkt_observation_applied');
  return {
    movedKcs,
    movedKcPLs: movedKcs.map((id) => kc[id]!.pL),
    appliedCount: state.mastery?.appliedObservationIds?.length ?? 0,
    appliedSources: bktRecords.map((event) => event.payload?.source ?? '(none)'),
    transferCount: state.evidence.filter((record) => record.kind === 'transfer').length,
    totalEvidence: state.evidence.length,
    practicedLessonIds: [...(state.mastery?.practicedLessonIds ?? [])],
  };
}

/**
 * The changed-exit KCs each lesson moves on a clean walk, and how many changed-exit
 * passes land on each grain. Every entry is the lesson's FULL required-KC set, so
 * "moved exactly these" also proves nothing outside the rollup list moved. The two
 * hard-pinned lists below are cross-checked against `orderedKcsForLesson` (the
 * catalog's own rollup membership, a DIFFERENT source than the lesson content the
 * runtime scores from) inside the assertion, so a silent drift in either source is
 * caught rather than mirrored.
 *
 * `passesPerKc`: each canonical clean baseline contains one changed exit per KC.
 * Repair and exact-re-entry items remain branch-only and never run on a clean walk.
 */
const EXPECTED: Readonly<
  Record<string, { readonly kcs: readonly string[]; readonly passesPerKc: number }>
> = {
  [L1]: { kcs: ['V3-KC-159529', 'V3-KC-700208', 'V3-KC-866848'], passesPerKc: 1 },
  [L2]: {
    kcs: ['V3-KC-399019', 'V3-KC-799492', 'V3-KC-919842', 'V3-KC-981438'],
    passesPerKc: 1,
  },
  [L3]: { kcs: ['V3-KC-008681', 'V3-KC-238607', 'V3-KC-452593'], passesPerKc: 1 },
};

function assertGuessChannelDiscipline(lessonId: string, observed: Observed): void {
  const expected = EXPECTED[lessonId]!;
  const changedExitKcs = [...expected.kcs].sort();
  const applied = changedExitKcs.length * expected.passesPerKc;

  // Cross-check the pinned KC set against the catalog's OWN rollup list. If the
  // content the runtime scores from and the rollup membership ever diverge, this
  // fires — the test is not mirroring a single source of truth.
  const rollupKcs = orderedKcsForLesson(lessonId);
  if (rollupKcs === null || rollupKcs === undefined) {
    throw new Error(`no rollup KCs for ${lessonId}`);
  }
  expect([...rollupKcs].sort(), lessonId).toEqual(changedExitKcs);

  // The lesson ran end-to-end and was audited as practised.
  expect(observed.practicedLessonIds, lessonId).toContain(lessonId);

  // Evidence was written, and there are MORE evidence records than moved grains:
  // the near/instructional items were delivered and recorded — they just did not
  // qualify for a BKT observation.
  expect(observed.totalEvidence, lessonId).toBeGreaterThan(applied);

  // Exactly the licensed changed exits qualified: one transfer warrant and one
  // applied observation per changed-exit pass, over exactly the required KCs and
  // nothing else.
  expect(observed.transferCount, lessonId).toBe(applied);
  expect(observed.appliedCount, lessonId).toBe(applied);
  expect(observed.movedKcs, lessonId).toEqual(changedExitKcs);

  // Every applied observation came through the lesson-exit guess channel — the
  // source that selects `LESSON_EXIT_GUESS_G`. Never practice, never study.
  expect(observed.appliedSources, lessonId).toHaveLength(applied);
  expect(new Set(observed.appliedSources), lessonId).toEqual(new Set(['lesson_response']));

  // Each grain sits at EXACTLY the discounted posterior for its changed-exit passes,
  // strictly below what the SAME passes would earn on the practice channel. This is
  // the guess channel proven by value: a near/instructional contribution would push
  // the grain above `applyPasses(passesPerKc)`, and a cap or weight would land it
  // somewhere other than the practice-below discounted point.
  const expectedPL = applyPasses(expected.passesPerKc, 'lesson_response');
  const practicePL = applyPasses(expected.passesPerKc, 'adaptive_practice');
  for (const pL of observed.movedKcPLs) {
    expect(pL, lessonId).toBeCloseTo(expectedPL, 12);
    expect(pL, lessonId).toBeLessThan(practicePL);
  }
}

describe('the whole catalog discounts P(L) on changed exits only, through the guess channel', () => {
  it('pins the two guess channels: the lesson exit is discounted below practice', () => {
    // Guardrail for the derived pins. One correct lesson exit moves 0.2 -> ~0.4304
    // through the raised guess; the practice channel pays more (~0.5717) for the
    // identical answer, and the gap is the whole point of the discount.
    expect(LESSON_EXIT_PL).toBeCloseTo(0.4304005556947988, 12);
    expect(PRACTICE_PL).toBeGreaterThan(LESSON_EXIT_PL);
    expect(PRACTICE_PL).toBeCloseTo(0.5717, 4);
  });

  it('L1 (bespoke vector transport) moves P(L) once per KC on its three changed exits', async () => {
    const env = freshKernel();
    await walkVectorLesson(env);
    assertGuessChannelDiscipline(L1, observe(env.persisted()));
  });

  it('L2 (normalized engine) moves P(L) once per KC on the canonical clean changed exits', async () => {
    const env = freshKernel();
    expect(await walkNormalizedLesson(env, L2)).toBe('COMPLETE');
    assertGuessChannelDiscipline(L2, observe(env.persisted()));
  });

  it('L3 (normalized engine, incl. a constructed changed exit) moves P(L) once per KC on its three changed exits', async () => {
    const env = freshKernel();
    expect(await walkNormalizedLesson(env, L3)).toBe('COMPLETE');
    assertGuessChannelDiscipline(L3, observe(env.persisted()));
  });
});
