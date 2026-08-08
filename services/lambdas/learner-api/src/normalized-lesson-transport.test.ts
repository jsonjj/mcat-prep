import { Authority } from '@mcat/authority-core';
import {
  InMemoryAuthorityRepository,
  toProjectionRecord,
  type Principal,
} from '@mcat/authority-kernel';
import { CommandEnvelopeSchema, fixedClock } from '@mcat/contracts';
import { describe, expect, it } from 'vitest';

import { createRepoLessonContentProvider } from './lesson-content-provider';
import type { EngineResponse, NormalizedLessonAction } from './normalized-lesson-runtime';
import { RepositoryLearnerKernel } from './workflow';

/**
 * The normalized-engine lesson transport (Phase 5, wave 5C.1).
 *
 * `handleNormalizedLessonStart` / `handleNormalizedLessonCommand` /
 * `normalizedLessonRun` give L2 and L3 a real server transport — a persisted run
 * slot, start/resume, and per-command delivery — feeding the SAME generic
 * `recordLessonResponse`. This drives BOTH lessons through the real
 * `RepositoryLearnerKernel` (real repository + authority + transaction) and
 * asserts on the PERSISTED PROJECTION: each walks to completion, records
 * evidence, and moves P(L) on its licensed changed exits. L1's bespoke transport
 * is untouched and unused here.
 */

const NOW = '2026-07-30T18:00:00.000Z';
const clock = fixedClock(NOW);
const L2 = 'V3-LES-789208';
const L3 = 'V3-LES-844372';
const provider = createRepoLessonContentProvider();

function correctResponseFor(lessonId: string, itemId: string): EngineResponse {
  const answer = provider.getAnswerKey(lessonId).byItemId[itemId];
  const item = provider
    .getNormalizedLesson(lessonId)
    .items.find((candidate) => candidate.itemId === itemId);
  if (answer === undefined) throw new Error(`no answer for ${itemId}`);
  if (answer.correctChoiceId !== null)
    return { kind: 'MULTIPLE_CHOICE', choiceId: answer.correctChoiceId };
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

interface PersistedState {
  readonly evidence: readonly { readonly kind?: string; readonly skillId?: string }[];
  readonly mastery?: {
    readonly kc: Record<string, { readonly pL: number } | undefined>;
    readonly practicedLessonIds?: readonly string[];
  };
  readonly normalizedLessonRuns?: Record<string, { readonly status: string } | undefined>;
}

interface StartResult {
  readonly runId: string;
  readonly disposition: string;
  readonly streamVersion: number;
}

async function startProbe(lessonId: string) {
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

  let streamVersion = 0;
  const started = (await kernel.handleNormalizedLessonStart(
    lessonId,
    { envelope: envelope(streamVersion) },
    principal,
  )) as unknown as StartResult;
  streamVersion = started.streamVersion;

  const persisted = (): PersistedState => {
    const projection = repository.projectionFor(principal.learnerId);
    if (projection === null) throw new Error('the learner projection is missing');
    return projection.state as unknown as PersistedState;
  };
  const view = () => kernel.normalizedLessonRun(lessonId, principal);
  const send = async (action: NormalizedLessonAction) => {
    const accepted = (await kernel.handleNormalizedLessonCommand(
      lessonId,
      { envelope: envelope(streamVersion), action },
      principal,
    )) as unknown as { streamVersion: number };
    streamVersion = accepted.streamVersion;
  };
  const restart = async (): Promise<StartResult> => {
    const result = (await kernel.handleNormalizedLessonStart(
      lessonId,
      { envelope: envelope(streamVersion) },
      principal,
    )) as unknown as StartResult;
    streamVersion = result.streamVersion;
    return result;
  };
  const walk = async () => {
    for (let guard = 0; guard < 3000; guard += 1) {
      const screen = (await view()).screen;
      if (screen.kind === 'COMPLETE' || screen.kind === 'BLOCKED') return screen;
      await send(
        screen.kind === 'QUESTION'
          ? { type: 'SUBMIT_RESPONSE', response: correctResponseFor(lessonId, screen.itemId) }
          : { type: 'CONTINUE' },
      );
    }
    throw new Error(`${lessonId} walk did not terminate`);
  };

  return { started, persisted, view, send, restart, walk };
}

describe('normalized-engine lesson transport drives L2/L3 through the real kernel', () => {
  it('L3 starts, walks to completion, and moves P(L) on a licensed changed-exit KC', async () => {
    const probe = await startProbe(L3);
    expect(probe.started.disposition).toBe('STARTED');
    expect(probe.started.runId).toMatch(/[0-9a-f-]{36}/);

    const final = await probe.walk();
    expect(final.kind).toBe('COMPLETE');

    const state = probe.persisted();
    expect(state.normalizedLessonRuns?.[L3]?.status).toBe('DELIVERY_COMPLETE');
    // Evidence written, with at least one transfer warrant from a licensed changed exit.
    expect(state.evidence.length).toBeGreaterThan(0);
    expect(state.evidence.some((record) => record.kind === 'transfer')).toBe(true);
    // P(L) moved on the GRAPH changed-exit KC and the lesson is audited.
    expect(state.mastery?.kc['V3-KC-452593']?.pL ?? 0).toBeGreaterThan(0.2);
    expect(state.mastery?.practicedLessonIds).toContain(L3);
  });

  it('L2 starts, walks to completion, and records evidence + P(L) through the same generic path', async () => {
    const probe = await startProbe(L2);
    const final = await probe.walk();
    expect(final.kind).toBe('COMPLETE');

    const state = probe.persisted();
    expect(state.normalizedLessonRuns?.[L2]?.status).toBe('DELIVERY_COMPLETE');
    expect(state.evidence.length).toBeGreaterThan(0);
    expect(state.evidence.some((record) => record.kind === 'transfer')).toBe(true);
    expect(Object.keys(state.mastery?.kc ?? {}).length).toBeGreaterThan(0);
    expect(state.mastery?.practicedLessonIds).toContain(L2);
  });

  it('a second start on an in-progress run resumes it rather than restarting', async () => {
    const probe = await startProbe(L3);
    const first = await probe.view();
    await probe.send(
      first.screen.kind === 'QUESTION'
        ? { type: 'SUBMIT_RESPONSE', response: correctResponseFor(L3, first.screen.itemId) }
        : { type: 'CONTINUE' },
    );

    const resumed = await probe.restart();
    expect(resumed.disposition).toBe('RESUMED');
    expect(resumed.runId).toBe(probe.started.runId);
  });

  it('rejects a command before the lesson is started', async () => {
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

    await expect(kernel.normalizedLessonRun(L3, principal)).rejects.toThrow(/Start this lesson/);
  });
});
