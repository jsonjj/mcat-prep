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
  LessonProviderError,
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

  it('scores and attributes a committed response against the run-pinned revision after an active switch', async () => {
    const base = await createRepoLessonRevisionProvider().loadActiveRevision({ lessonId: L2 });
    const firstItem = base.lesson.items.find((item) => item.scored);
    if (firstItem?.projection.responseControl?.kind !== 'SINGLE_SELECT') {
      throw new Error('the L2 first scored item must be single-select');
    }
    const itemId = firstItem.itemId;
    const oldBase = revisionWithIdentity(base, '3'.repeat(64), 'Old scored revision');
    const oldRevision: LoadedLessonRevision = {
      ...oldBase,
      authoredBindings: {
        ...oldBase.authoredBindings,
        entries: oldBase.authoredBindings.entries.map((entry) =>
          entry.item_binding_id === itemId ? { ...entry, binding_version: 'binding-old' } : entry,
        ),
      },
    };
    const oldAnswer = oldRevision.protectedAuthority.answerKey.byItemId[itemId];
    if (oldAnswer?.correctChoiceId === null || oldAnswer === undefined) {
      throw new Error('the old answer is missing');
    }
    const newCorrect = firstItem.projection.responseControl.choices.find(
      (choice) => choice.choiceId !== oldAnswer.correctChoiceId,
    )?.choiceId;
    if (newCorrect === undefined) throw new Error('the new revision needs another authored choice');
    const newBase = revisionWithIdentity(base, '4'.repeat(64), 'New active scored revision');
    const newRevision: LoadedLessonRevision = {
      ...newBase,
      authoredBindings: {
        ...newBase.authoredBindings,
        entries: newBase.authoredBindings.entries.map((entry) =>
          entry.item_binding_id === itemId ? { ...entry, binding_version: 'binding-new' } : entry,
        ),
      },
      protectedAuthority: {
        answerKey: {
          ...newBase.protectedAuthority.answerKey,
          byItemId: {
            ...newBase.protectedAuthority.answerKey.byItemId,
            [itemId]: { ...oldAnswer, correctChoiceId: newCorrect },
          },
        },
      },
    };
    let active = oldRevision;
    const provider: LessonRevisionProvider = {
      listActiveCatalogEntries: async () => [active.catalogEntry],
      resolveSlug: async () => ({
        lessonId: active.lessonId,
        slug: active.catalogEntry.slug,
        activeDefinitionHash: active.definitionHash,
      }),
      loadActiveRevision: async () => active,
      loadExactRevision: async (_lessonId, definitionHash) =>
        definitionHash === oldRevision.definitionHash ? oldRevision : newRevision,
    };
    const { kernel, principal, repository } = kernelWith(provider);
    const started = (await kernel.handleNormalizedLessonStart(
      L2,
      { envelope: envelope(0) },
      principal,
    )) as unknown as { streamVersion: number };
    active = newRevision;
    const view = await kernel.normalizedLessonRun(L2, principal);
    if (view.screen.kind !== 'QUESTION') throw new Error('the pinned question was not served');
    expect(view.screen.itemId).toBe(itemId);
    expect(oldAnswer.correctChoiceId).not.toBe(newCorrect);

    await kernel.handleNormalizedLessonCommand(
      L2,
      {
        envelope: envelope(started.streamVersion),
        action: {
          type: 'SUBMIT_RESPONSE',
          response: { kind: 'MULTIPLE_CHOICE', choiceId: oldAnswer.correctChoiceId },
        },
      },
      principal,
    );

    const state = repository.projectionFor(principal.learnerId)?.state as
      | {
          evidence?: readonly {
            outcome?: string;
            itemVersion?: number;
            lessonAttribution?: Readonly<Record<string, unknown>>;
          }[];
        }
      | undefined;
    expect(state?.evidence).toHaveLength(1);
    expect(state?.evidence?.[0]).toMatchObject({
      outcome: 'correct',
      itemVersion: 1,
      lessonAttribution: {
        lessonId: L2,
        definitionHash: oldRevision.definitionHash,
        itemBindingId: itemId,
        bindingVersion: 'binding-old',
        serverItemVersion: 1,
      },
    });
    expect(repository.eventsFor(principal.learnerId).at(-1)?.payload.lessonResponse).toMatchObject({
      assistance: {
        level: 'A0',
        observed: true,
        requested: false,
        taken: false,
      },
      firstAttempt: true,
    });
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

  it('self-heals a run whose pinned revision no longer resolves instead of 503ing', async () => {
    // The learner starts against one revision; the lesson is later re-normalized, so its
    // definitionHash moves and the old pinned revision is no longer served. Previously
    // that made /status and /run throw REVISION_NOT_FOUND forever ("could not be
    // restored"). Now the stale run is reset and the lesson restarts on the active one.
    const base = await createRepoLessonRevisionProvider().loadActiveRevision({ lessonId: L2 });
    const oldRevision = revisionWithIdentity(base, '5'.repeat(64), 'Stale entry heading');
    const newRevision = revisionWithIdentity(base, '6'.repeat(64), 'Fresh entry heading');
    let active = oldRevision;
    const provider: LessonRevisionProvider = {
      listActiveCatalogEntries: async () => [active.catalogEntry],
      resolveSlug: async () => ({
        lessonId: active.lessonId,
        slug: active.catalogEntry.slug,
        activeDefinitionHash: active.definitionHash,
      }),
      loadActiveRevision: async () => active,
      loadExactRevision: async (lessonId, definitionHash) => {
        if (lessonId === L2 && definitionHash === active.definitionHash) return active;
        throw new LessonProviderError(
          'REVISION_NOT_FOUND',
          `revision ${lessonId}@${definitionHash} was not found`,
          { lessonId, definitionHash },
        );
      },
    };
    const { kernel, principal } = kernelWith(provider);

    const started = (await kernel.handleNormalizedLessonStart(
      L2,
      { envelope: envelope(0) },
      principal,
    )) as unknown as { streamVersion: number };
    // Content moved: the active pointer advances and the old exact revision is gone.
    active = newRevision;

    // Status must not throw — the unresumable run reports NOT_STARTED so the client
    // offers a clean start rather than dead-ending.
    const status = await kernel.normalizedLessonStatus(L2, principal);
    expect(status.runState).toBe('NOT_STARTED');
    expect(status.actionLabel).toBe('Start');

    // A fresh start overwrites the stale run and pins to the ACTIVE revision.
    await kernel.handleNormalizedLessonStart(
      L2,
      { envelope: envelope(started.streamVersion) },
      principal,
    );
    const view = await kernel.normalizedLessonRun(L2, principal);
    expect(view.screen).toMatchObject({ heading: 'Fresh entry heading' });
  });
});
