import { Authority } from '@mcat/authority-core';
import {
  InMemoryAuthorityRepository,
  toProjectionRecord,
  type Principal,
} from '@mcat/authority-kernel';
import { CommandEnvelopeSchema, fixedClock, type CommandEnvelope } from '@mcat/contracts';
import { describe, expect, it } from 'vitest';

import {
  createRepoLessonRevisionProvider,
  type LessonRevisionProvider,
  type LoadedLessonRevision,
} from './lesson-content-provider';
import { RepositoryLearnerKernel } from './workflow';

const NOW = '2026-07-30T18:00:00.000Z';
const L2 = 'V3-LES-789208';
const L3 = 'V3-LES-844372';
const clock = fixedClock(NOW);

function envelope(
  expectedStreamVersion: number,
  ids: { eventId?: string; idempotencyKey?: string } = {},
): CommandEnvelope {
  return CommandEnvelopeSchema.parse({
    eventId: ids.eventId ?? crypto.randomUUID(),
    idempotencyKey: ids.idempotencyKey ?? crypto.randomUUID(),
    occurredAt: NOW,
    expectedStreamVersion,
    contentRelease: 'synthetic-2026.07',
    taskInstanceId: crypto.randomUUID(),
  });
}

function revisionWithIdentity(
  source: LoadedLessonRevision,
  definitionHash: string,
  firstHeading: string,
): LoadedLessonRevision {
  const revision = structuredClone(source);
  const firstKc = revision.lesson.kcs[0];
  const firstStepId = firstKc?.cleanBaselineSteps[0]?.stepId;
  if (firstKc === undefined || firstStepId === undefined)
    throw new Error('fixture has no entry step');
  const deliverySteps = firstKc.deliverySteps.map((step) =>
    step.stepId === firstStepId ? { ...step, heading: firstHeading } : step,
  );
  const byId = new Map(deliverySteps.map((step) => [step.stepId, step]));
  const kcs = [
    {
      ...firstKc,
      deliverySteps,
      cleanBaselineSteps: firstKc.cleanBaselineSteps.map((step) => byId.get(step.stepId) ?? step),
    },
    ...revision.lesson.kcs.slice(1),
  ];
  return {
    ...revision,
    definitionHash,
    catalogEntry: { ...revision.catalogEntry, activeDefinitionHash: definitionHash },
    lesson: { ...revision.lesson, definitionHash, kcs },
    protectedAuthority: {
      answerKey: { ...revision.protectedAuthority.answerKey, definitionHash },
    },
  };
}

function kernelWith(provider: LessonRevisionProvider) {
  const authority = new Authority(undefined, clock);
  const learner = authority.createGuest();
  learner.onboarding.diagnosticComplete = true;
  const repository = new InMemoryAuthorityRepository([toProjectionRecord(learner, 0, NOW)]);
  const principal: Principal = {
    kind: 'guest',
    learnerId: learner.learnerId,
    sessionId: crypto.randomUUID(),
  };
  const kernel = new RepositoryLearnerKernel({
    repository,
    clock,
    bank: authority.bank,
    lessonRevisionProvider: provider,
  });
  return { kernel, principal, repository };
}

describe('normalized lesson transport revision boundary', () => {
  it('loads an in-progress run by its exact definition after the active pointer changes', async () => {
    const base = await createRepoLessonRevisionProvider().loadActiveRevision({ lessonId: L2 });
    const oldRevision = revisionWithIdentity(base, '1'.repeat(64), 'Old exact entry heading');
    const newRevision = revisionWithIdentity(base, '2'.repeat(64), 'New active entry heading');
    let active = oldRevision;
    const exactLoads: string[] = [];
    const provider: LessonRevisionProvider = {
      listActiveCatalogEntries: async () => [active.catalogEntry],
      resolveSlug: async () => ({
        lessonId: active.lessonId,
        slug: active.catalogEntry.slug,
        activeDefinitionHash: active.definitionHash,
      }),
      loadActiveRevision: async () => active,
      loadExactRevision: async (lessonId, definitionHash) => {
        exactLoads.push(`${lessonId}:${definitionHash}`);
        if (lessonId === L2 && definitionHash === oldRevision.definitionHash) return oldRevision;
        if (lessonId === L2 && definitionHash === newRevision.definitionHash) return newRevision;
        throw new Error('revision not found');
      },
    };
    const { kernel, principal } = kernelWith(provider);

    await kernel.handleNormalizedLessonStart(L2, { envelope: envelope(0) }, principal);
    active = newRevision;

    const view = await kernel.normalizedLessonRun(L2, principal);
    expect(view.screen).toMatchObject({
      kind: 'QUESTION',
      heading: 'Old exact entry heading',
    });
    expect(exactLoads).toContain(`${L2}:${oldRevision.definitionHash}`);
    expect(JSON.stringify(view)).not.toContain(newRevision.definitionHash);
  });

  it('returns the same feedback for an idempotent command replay and stores one response', async () => {
    const revision = await createRepoLessonRevisionProvider().loadActiveRevision({ lessonId: L2 });
    const provider: LessonRevisionProvider = {
      listActiveCatalogEntries: async () => [revision.catalogEntry],
      resolveSlug: async () => ({
        lessonId: revision.lessonId,
        slug: revision.catalogEntry.slug,
        activeDefinitionHash: revision.definitionHash,
      }),
      loadActiveRevision: async () => revision,
      loadExactRevision: async () => revision,
    };
    const { kernel, principal, repository } = kernelWith(provider);
    const started = (await kernel.handleNormalizedLessonStart(
      L2,
      { envelope: envelope(0) },
      principal,
    )) as unknown as { streamVersion: number };
    const run = await kernel.normalizedLessonRun(L2, principal);
    if (run.screen.kind !== 'QUESTION' || run.screen.control.kind !== 'SINGLE_SELECT') {
      throw new Error('single-select entry question expected');
    }
    const answer = revision.protectedAuthority.answerKey.byItemId[run.screen.itemId];
    if (answer?.correctChoiceId === null || answer === undefined) throw new Error('answer missing');
    const replayEnvelope = envelope(started.streamVersion, {
      eventId: '10000000-0000-4000-8000-000000000011',
      idempotencyKey: '10000000-0000-4000-8000-000000000012',
    });
    const command = {
      envelope: replayEnvelope,
      action: {
        type: 'SUBMIT_RESPONSE' as const,
        response: { kind: 'MULTIPLE_CHOICE' as const, choiceId: answer.correctChoiceId },
      },
    };

    const first = await kernel.handleNormalizedLessonCommand(L2, command, principal);
    const firstFeedback = await kernel.normalizedLessonRun(L2, principal);
    const replay = await kernel.handleNormalizedLessonCommand(L2, command, principal);
    const replayFeedback = await kernel.normalizedLessonRun(L2, principal);

    expect(replay).toEqual(first);
    expect(replayFeedback).toEqual(firstFeedback);
    const persisted = repository.projectionFor(principal.learnerId)?.state as
      | { normalizedLessonRuns?: Record<string, { responses?: Record<string, unknown> }> }
      | undefined;
    expect(Object.keys(persisted?.normalizedLessonRuns?.[L2]?.responses ?? {})).toHaveLength(1);
  });

  it('rejects a requested lesson id that disagrees with the persisted run lesson id', async () => {
    const provider = createRepoLessonRevisionProvider();
    const { kernel, principal, repository } = kernelWith(provider);
    await kernel.handleNormalizedLessonStart(L2, { envelope: envelope(0) }, principal);
    const projection = repository.projectionFor(principal.learnerId);
    if (projection === null) throw new Error('learner projection missing');
    const state = structuredClone(projection.state) as {
      normalizedLessonRuns?: Record<string, { lessonId?: string }>;
    };
    const persistedL2Run = state.normalizedLessonRuns?.[L2];
    if (state.normalizedLessonRuns === undefined || persistedL2Run === undefined) {
      throw new Error('persisted L2 run missing');
    }
    state.normalizedLessonRuns[L3] = persistedL2Run;
    repository.seedProjection({ ...projection, state: state as typeof projection.state });

    await expect(kernel.normalizedLessonRun(L3, principal)).rejects.toThrow(
      'The persisted run does not match the requested lesson.',
    );
  });
});
