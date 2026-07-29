import { describe, expect, it } from 'vitest';
import {
  axisIds,
  BANK_PROFILES,
  FC_AXIS,
  MST_140_RECOMMENDED,
  planMstForm,
  SEED_PRIOR_CAP,
} from '@mcat/policies';
import { buildDiagnosticBank } from '@mcat/content';
import { DiagnosticBank } from './diagnostic-bank';
import { DiagnosticSessionError, DiagnosticSessionStore } from './diagnostic-session-store';
import {
  bankSupportsProductionForm,
  recordBlock,
  REPORTED_PRIORITY_COUNT,
  resolveBlock,
} from './diagnostic-engine';

const PROTECTED_FIELDS = ['correct_answer', 'explanations', 'correct_choice_id', 'rationales'];

function assertNoLeak(payload: unknown, hint: string): void {
  const json = JSON.stringify(payload);
  for (const field of PROTECTED_FIELDS) {
    expect(json.includes(`"${field}"`), `${hint} leaked ${field}`).toBe(false);
  }
}

/** Answers for a whole block, every question the same choice. */
const uniformAnswers = (
  questionIds: readonly string[],
  choiceId: string | null,
): Record<string, string | null> =>
  Object.fromEntries(questionIds.map((questionId) => [questionId, choiceId]));

/**
 * Drive a whole session to completion one block at a time, through the same
 * token dance the HTTP layer performs.
 */
function runSession(
  bank: DiagnosticBank,
  store: DiagnosticSessionStore,
  choiceFor: (questionId: string, index: number) => string | null = () => 'A',
) {
  const { record } = store.create('client-1');
  const servedViews: unknown[] = [];
  const blocks: string[][] = [];
  for (let guard = 0; guard < 20; guard += 1) {
    const { view, block } = resolveBlock(bank, record);
    servedViews.push(view);
    if (view.done) return { record, view, servedViews, blocks };
    const questionIds = block!.questionIds;
    blocks.push([...questionIds]);
    const token = store.issueBlockToken(record, block!.stageId, questionIds);
    const answers = Object.fromEntries(
      questionIds.map((questionId, i) => [questionId, choiceFor(questionId, i)]),
    );
    const committed = store.consumeBlockToken(record, block!.stageId, token);
    recordBlock(bank, record, committed, answers);
  }
  throw new Error('session did not complete');
}

/**
 * The plan behind the served design. Under contention allocation its
 * `itemsPerBucket` is the balanced deal rather than what any learner receives,
 * so the coverage assertions below check the design's floor instead.
 */
const productionPlan = (bank: DiagnosticBank) =>
  planMstForm(MST_140_RECOMMENDED, bank.formItems, FC_AXIS);

const perBucketCounts = (record: { responses: readonly { cluster: string }[] }) => {
  const seen = new Map<string, number>();
  for (const r of record.responses) seen.set(r.cluster, (seen.get(r.cluster) ?? 0) + 1);
  return seen;
};

/**
 * Whether the bank this environment loaded can deal the served form at all.
 *
 * The suites below drive the real production design, which throws outright if any
 * bucket cannot cover its share. That is the right behaviour when serving, but as
 * a test precondition it turns "this machine has no question bank" into a wall of
 * assertion failures pointing at the engine. The synthetic fallback is sized to
 * satisfy the form (the CI guard at the bottom of this file is what proves it), so
 * this should always be true — it is a diagnosis aid for a partial or drifted bank,
 * not an escape hatch. If these suites ever skip, the fixture is the bug.
 */
const PRODUCTION_FORM_SERVABLE = bankSupportsProductionForm(new DiagnosticBank());

describe('diagnostic session store integrity', () => {
  it('rate-limits session creation per client', () => {
    const store = new DiagnosticSessionStore({ maxSessionsPerWindow: 2 });
    store.create('c');
    store.create('c');
    expect(() => store.create('c')).toThrow(DiagnosticSessionError);
    // A different client is unaffected.
    expect(() => store.create('other')).not.toThrow();
  });

  it('rejects an invalid/expired session token', () => {
    const store = new DiagnosticSessionStore();
    expect(() => store.get('nope')).toThrow(DiagnosticSessionError);
  });

  it('resolves a valid session token (resume)', () => {
    const store = new DiagnosticSessionStore();
    const { sessionToken, record } = store.create('c');
    expect(store.get(sessionToken)).toBe(record);
  });

  it('enforces one-use block tokens (a committed block cannot be replayed)', () => {
    const store = new DiagnosticSessionStore();
    const { record } = store.create('c');
    const token = store.issueBlockToken(record, 'stage-0', ['q-1', 'q-2']);
    expect(store.consumeBlockToken(record, 'stage-0', token)).toEqual(['q-1', 'q-2']);
    expect(() => store.consumeBlockToken(record, 'stage-0', token)).toThrow(DiagnosticSessionError);
  });

  it('rejects a token presented against the wrong stage', () => {
    const store = new DiagnosticSessionStore();
    const { record } = store.create('c');
    const token = store.issueBlockToken(record, 'stage-0', ['q-1']);
    expect(() => store.consumeBlockToken(record, 'stage-0.1', token)).toThrow(
      DiagnosticSessionError,
    );
  });

  it('retires the previous token when a block is re-served', () => {
    const store = new DiagnosticSessionStore();
    const { record } = store.create('c');
    const stale = store.issueBlockToken(record, 'stage-0', ['q-1']);
    const fresh = store.issueBlockToken(record, 'stage-0', ['q-1']);
    expect(() => store.consumeBlockToken(record, 'stage-0', stale)).toThrow(DiagnosticSessionError);
    expect(() => store.consumeBlockToken(record, 'stage-0', fresh)).not.toThrow();
  });

  it('hands back the served item list rather than trusting the caller', () => {
    const store = new DiagnosticSessionStore();
    const { record } = store.create('c');
    const served = ['q-1', 'q-2'];
    const token = store.issueBlockToken(record, 'stage-0', served);
    served.push('q-3');
    expect(store.consumeBlockToken(record, 'stage-0', token)).toEqual(['q-1', 'q-2']);
  });
});

describe.skipIf(!PRODUCTION_FORM_SERVABLE)('diagnostic block delivery', () => {
  const bank = new DiagnosticBank();

  it('serves a whole stage at once, sized by the design', () => {
    const store = new DiagnosticSessionStore();
    const { record } = store.create('c');
    const plan = productionPlan(bank);

    const { view, block } = resolveBlock(bank, record);
    expect(view.done).toBe(false);
    expect(view.questions.length).toBe(plan.stageSizes[0]);
    expect(block!.questionIds.length).toBe(plan.stageSizes[0]);
    expect(view.questions.map((q) => q.id)).toEqual(block!.questionIds);
    expect(view.stageNumber).toBe(1);
    expect(view.stageCount).toBe(plan.stageSizes.length);
    expect(view.itemsCommitted).toBe(0);
    expect(view.totalItems).toBe(plan.totalItems);
    assertNoLeak(view, 'served block');
  });

  it('re-serves the open stage identically, with a stable stageId', () => {
    const store = new DiagnosticSessionStore();
    const { record } = store.create('c');

    const first = resolveBlock(bank, record);
    // A refresh mid-block: the client asks again without having committed.
    store.issueBlockToken(record, first.block!.stageId, first.block!.questionIds);
    const again = resolveBlock(bank, record);

    expect(again.view.stageId).toBe(first.view.stageId);
    expect(again.block!.questionIds).toEqual(first.block!.questionIds);
    expect(again.view.itemsCommitted).toBe(first.view.itemsCommitted);
  });

  it('re-serves a contention-allocated stage identically too', () => {
    const store = new DiagnosticSessionStore();
    const { record } = store.create('c');

    // Block 1 is the balanced deal for everyone. Only from block 2 on are the
    // slots a function of the response log, which is what a re-serve has to
    // replay to land on the same items.
    const first = resolveBlock(bank, record).block!;
    const token = store.issueBlockToken(record, first.stageId, first.questionIds);
    const committed = store.consumeBlockToken(record, first.stageId, token);
    recordBlock(bank, record, committed, uniformAnswers(committed, 'A'));

    const routed = resolveBlock(bank, record);
    store.issueBlockToken(record, routed.block!.stageId, routed.block!.questionIds);
    const again = resolveBlock(bank, record);

    expect(again.view.stageId).toBe(routed.view.stageId);
    expect(again.block!.questionIds).toEqual(routed.block!.questionIds);
  });

  it('gives each stage its own stageId and numbers items on from the last', () => {
    const store = new DiagnosticSessionStore();
    const { record } = store.create('c');
    const plan = productionPlan(bank);

    const first = resolveBlock(bank, record);
    const token = store.issueBlockToken(record, first.block!.stageId, first.block!.questionIds);
    const committed = store.consumeBlockToken(record, first.block!.stageId, token);
    recordBlock(bank, record, committed, uniformAnswers(committed, 'A'));

    const second = resolveBlock(bank, record);
    expect(second.view.stageId).not.toBe(first.view.stageId);
    expect(second.view.stageNumber).toBe(2);
    expect(second.view.itemsCommitted).toBe(plan.stageSizes[0]);
    // No item is served twice across stages.
    const overlap = second.block!.questionIds.filter((id) => first.block!.questionIds.includes(id));
    expect(overlap).toEqual([]);
  });

  it('scores the answers the block was committed with, not the ones served earlier', () => {
    const store = new DiagnosticSessionStore();
    const { record } = store.create('c');

    const { block } = resolveBlock(bank, record);
    const token = store.issueBlockToken(record, block!.stageId, block!.questionIds);
    const committed = store.consumeBlockToken(record, block!.stageId, token);

    // The learner drafted "A" everywhere, then revised the first item twice
    // before submitting. Only the final draft reaches the server.
    const answers = uniformAnswers(committed, 'A');
    answers[committed[0]!] = 'B';
    answers[committed[0]!] = 'D';
    recordBlock(bank, record, committed, answers);

    expect(record.responses.length).toBe(committed.length);
    expect(record.responses[0]!.correct).toBe(bank.score(committed[0]!, 'D'));
  });

  it('treats a missing answer exactly like an explicit null', () => {
    const store = new DiagnosticSessionStore();

    const withNulls = store.create('c').record;
    const blockA = resolveBlock(bank, withNulls).block!;
    recordBlock(bank, withNulls, blockA.questionIds, uniformAnswers(blockA.questionIds, null));

    const withOmissions = store.create('c').record;
    const blockB = resolveBlock(bank, withOmissions).block!;
    recordBlock(bank, withOmissions, blockB.questionIds, {});

    expect(withOmissions.responses.length).toBe(withNulls.responses.length);
    expect(withOmissions.responses.map((r) => r.correct)).toEqual(
      withNulls.responses.map((r) => r.correct),
    );
    // A blank is "not known", never a lucky hit.
    expect(withNulls.responses.some((r) => r.correct)).toBe(false);
  });

  it('routes on the number correct in the committed block', () => {
    const store = new DiagnosticSessionStore();

    // Two learners, opposite performance: one blank throughout, one answered
    // from the key. Their stage-1 blocks are seeded per session, so the items
    // are not identical across sittings — but the routing module is the same
    // SIZE and difficulty composition (tie-breaks only permute equidifficult
    // items), which is what keeps number-correct routing comparable.
    const weak = store.create('c').record;
    const weakBlock = resolveBlock(bank, weak).block!;
    recordBlock(bank, weak, weakBlock.questionIds, uniformAnswers(weakBlock.questionIds, null));

    const strong = store.create('c').record;
    const strongBlock = resolveBlock(bank, strong).block!;
    expect(strongBlock.questionIds.length).toBe(weakBlock.questionIds.length);
    const keyed = Object.fromEntries(
      strongBlock.questionIds.map((id) => [
        id,
        (['A', 'B', 'C', 'D'] as const).find((choice) => bank.score(id, choice)) ?? null,
      ]),
    );
    recordBlock(bank, strong, strongBlock.questionIds, keyed);

    const weakNext = resolveBlock(bank, weak);
    const strongNext = resolveBlock(bank, strong);
    expect(strong.responses.filter((r) => r.correct).length).toBeGreaterThan(
      weak.responses.filter((r) => r.correct).length,
    );
    expect(strongNext.view.stageId).not.toBe(weakNext.view.stageId);
    expect(strongNext.block!.questionIds).not.toEqual(weakNext.block!.questionIds);
  });

  it('seeds the form per session: two sittings diverge, one sitting replays stably', () => {
    const store = new DiagnosticSessionStore();

    // Same stage-1 route for both (nobody has answered yet), but distinct
    // session tokens: the tie-break must draw different items so the reachable
    // bank is not pinned to one lowest-id form across the whole population.
    const a = store.create('same-device').record;
    const b = store.create('same-device').record;
    const blockA = resolveBlock(bank, a).block!;
    const blockB = resolveBlock(bank, b).block!;
    expect(blockA.questionIds.length).toBe(blockB.questionIds.length);
    expect(blockA.questionIds).not.toEqual(blockB.questionIds);

    // Replaying the same session (the open-block resolution the server does on
    // every request) must be stable — the seed is a function of the token.
    expect(resolveBlock(bank, a).block!.questionIds).toEqual(blockA.questionIds);
  });
});

describe.skipIf(!PRODUCTION_FORM_SERVABLE)('the design production serves', () => {
  const bank = new DiagnosticBank();

  const firstBlock = (design: string | undefined) => {
    const previous = process.env.MCAT_MST_DESIGN;
    if (design === undefined) delete process.env.MCAT_MST_DESIGN;
    else process.env.MCAT_MST_DESIGN = design;
    try {
      const { record } = new DiagnosticSessionStore().create('c');
      return resolveBlock(bank, record).view;
    } finally {
      if (previous === undefined) delete process.env.MCAT_MST_DESIGN;
      else process.env.MCAT_MST_DESIGN = previous;
    }
  };

  it('serves the recommended design by default', () => {
    const view = firstBlock(undefined);
    expect(view.stageCount).toBe(7);
    expect(view.questions).toHaveLength(20);
    expect(view.totalItems).toBe(140);
  });

  it('will not let the demo override name the superseded 140-item form', () => {
    // `MST 140` is a label prefix both designs answer to, and the override used
    // to resolve it against `MST_DESIGNS` alone — which is how a design the
    // sweep rejected would go on being served under a flag nobody re-read.
    expect(firstBlock('140').stageCount).toBe(7);
    expect(firstBlock('999').stageCount).toBe(7);
  });

  it('keeps the superseded form reachable under a name that says so', () => {
    const view = firstBlock('140-superseded');
    expect(view.stageCount).toBe(4);
    expect(view.questions).toHaveLength(50);
    expect(view.totalItems).toBe(140);
  });

  it('still selects a shorter form for demos', () => {
    const view = firstBlock('60');
    expect(view.stageCount).toBe(3);
    expect(view.totalItems).toBe(60);
  });
});

describe.skipIf(!PRODUCTION_FORM_SERVABLE)('diagnostic engine end-to-end', () => {
  const bank = new DiagnosticBank();

  it('runs from start to a completed, coverage-honoring result', () => {
    const store = new DiagnosticSessionStore();
    const { record, view, blocks } = runSession(bank, store);
    expect(view.done).toBe(true);
    expect(view.result).not.toBeNull();
    expect(view.questions).toEqual([]);

    // The engine delivers a multistage form, so length is fixed by the design
    // rather than decided by an early-stopping rule. Asserting the exact total
    // is the point: a learner is told up front how long the test is, and a
    // regression that reintroduced variable length would be a product change.
    const plan = productionPlan(bank);
    expect(record.responses.length).toBe(plan.totalItems);
    expect(blocks.map((b) => b.length)).toEqual([...plan.stageSizes]);

    // Coverage is guaranteed by construction on every route, not on average.
    // Contention allocation spends later blocks unevenly, so what holds per
    // learner is the design's floor rather than the balanced deal.
    const seen = perBucketCounts(record);
    for (const bucket of plan.itemsPerBucket.keys()) {
      expect(seen.get(bucket) ?? 0, bucket).toBeGreaterThanOrEqual(
        MST_140_RECOMMENDED.minItemsPerBucket,
      );
    }
    expect([...seen.values()].reduce((s, n) => s + n, 0)).toBe(plan.totalItems);
    // Every Foundational Concept is populated, unlike the cluster axis's empty
    // PS1, so the guarantee covers the whole reporting axis with nothing excused.
    expect(plan.uncoverableBuckets).toEqual([]);
    expect([...plan.itemsPerBucket.keys()]).toEqual(axisIds(FC_AXIS));
    // A result with a word label and priorities — never a numeric confidence.
    expect(['High', 'Medium', 'Still building']).toContain(view.result!.confidenceLabel);
    assertNoLeak(view.result, 'result view');
    expect(JSON.stringify(view.result).includes('internalConfidence')).toBe(false);
  });

  it('honours coverage on a route no all-A learner takes', () => {
    const store = new DiagnosticSessionStore();
    const plan = productionPlan(bank);
    // Answer from the key, which routes to the top module at every decision.
    const { record } = runSession(
      bank,
      store,
      (questionId) => (['A', 'B', 'C', 'D'] as const).find((c) => bank.score(questionId, c)) ?? null,
    );

    const seen = perBucketCounts(record);
    for (const bucket of plan.itemsPerBucket.keys()) {
      expect(seen.get(bucket) ?? 0, bucket).toBeGreaterThanOrEqual(
        MST_140_RECOMMENDED.minItemsPerBucket,
      );
    }
    expect(new Set(record.responses.map((r) => r.questionId)).size).toBe(plan.totalItems);
  });

  it('spends later blocks unevenly, which is what contention allocation buys', () => {
    const store = new DiagnosticSessionStore();
    const plan = productionPlan(bank);
    const { record } = runSession(bank, store);

    // The balanced deal would hand every concept the same 14 items. If the
    // served form reproduces it exactly, the slot overrides never reached
    // assembly and the design is a raised-cuts one wearing its label.
    const seen = perBucketCounts(record);
    const balanced = [...plan.itemsPerBucket.values()];
    expect([...plan.itemsPerBucket.keys()].map((b) => seen.get(b) ?? 0)).not.toEqual(balanced);
  });

  it('never leaks protected fields in any served block', () => {
    const store = new DiagnosticSessionStore();
    const { servedViews } = runSession(bank, store);
    for (const view of servedViews) assertNoLeak(view, 'served view');
  });

  it('serves only items the Foundational Concept axis can place', () => {
    const store = new DiagnosticSessionStore();
    const { record, blocks } = runSession(bank, store);

    for (const questionId of blocks.flat()) {
      expect(bank.bucket(questionId), `${questionId} is off the reporting axis`).not.toBeNull();
    }
    // Reasoning and CARS carry no FC, so an item from either would have to have
    // come from outside the assembled pool.
    const clusters = new Set(
      blocks.flat().map((id) => bank.placement(id)?.cluster ?? 'unplaced'),
    );
    for (const offAxis of ['R1', 'R2', 'R3', 'CA1', 'CA2']) {
      expect(clusters.has(offAxis as never)).toBe(false);
    }
    expect(new Set(record.responses.map((r) => r.cluster))).toEqual(new Set(axisIds(FC_AXIS)));
  });

  it('accounts for the items the axis cannot reach rather than dropping them', () => {
    const { eligible, inScope, outOfScope, outOfScopeByCluster } = bank.scope;
    expect(inScope + outOfScope).toBe(eligible);
    expect(outOfScope).toBeGreaterThan(0);
    // Everything excluded is reasoning or CARS — the FC-untagged part of the bank
    // — plus the empty-by-design PS1. The real corpus has no PS1 items, so it
    // shows only R/CA; the synthetic fixture keeps a couple of PS1 items for
    // cluster coverage, and those are legitimately off the FC axis too.
    const OFF_FC = ['CA1', 'CA2', 'PS1', 'R1', 'R2', 'R3'];
    expect(Object.keys(outOfScopeByCluster).every((c) => OFF_FC.includes(c))).toBe(true);
    for (const reasoning of ['CA1', 'CA2', 'R1', 'R2', 'R3']) {
      expect(outOfScopeByCluster[reasoning] ?? 0, reasoning).toBeGreaterThan(0);
    }
    expect(Object.values(outOfScopeByCluster).reduce((s, n) => s + n, 0)).toBe(outOfScope);
  });

  it('buckets the bank exactly as the swept partition profile does', () => {
    // The sweep's conclusions only apply to what ships if the shipped map cuts
    // the bank the same way. The comparison is against the FC rows of `fc-15`,
    // not `fc-10`: only `fc-15` is a partition, resolving a multi-FC lesson to
    // its first listed concept, which is the rule this map follows. The `fc-10`
    // column counts a multi-FC question once per concept it carries, so it runs
    // fat in exactly FC2/FC4/FC5/FC10 and sums to more than the bank holds.
    const counts: Record<string, [number, number, number]> = {};
    for (const item of bank.formItems) {
      const row = (counts[item.bucketId] ??= [0, 0, 0]);
      row[item.dokLevel - 1] += 1;
    }
    const partition = Object.fromEntries(
      axisIds(FC_AXIS).map((id) => [id, BANK_PROFILES['fc-15'][id]]),
    );
    expect(counts).toEqual(partition);
  });

  it('carries a gap, a certainty and an item count for every concept', () => {
    const store = new DiagnosticSessionStore();
    const { record, view } = runSession(bank, store);
    const perCluster = view.result!.perCluster;

    expect(perCluster.map((s) => s.cluster)).toEqual(axisIds(FC_AXIS));
    for (const signal of perCluster) {
      expect(signal.gap).toBeGreaterThanOrEqual(0);
      expect(signal.gap).toBeLessThanOrEqual(1);
      expect(signal.certainty).toBeGreaterThanOrEqual(0);
      expect(signal.certainty).toBeLessThanOrEqual(1);
      expect(signal.itemsSeen).toBeGreaterThan(0);
      // The learner-facing concept name, not a bare id — the chart labels rows
      // with this and cannot reach the axis itself from the browser.
      expect(signal.title).not.toBe(signal.cluster);
    }
    // Every scored item is accounted for under exactly one concept.
    expect(perCluster.reduce((sum, s) => sum + s.itemsSeen, 0)).toBe(record.responses.length);
  });

  it('reports the gap the ranking was computed from', () => {
    const store = new DiagnosticSessionStore();
    const { view } = runSession(bank, store);
    const result = view.result!;

    // The chart and the ranked list must read the same numbers. Re-deriving the
    // priority order from the wire `gap` alone reproduces `topPriorities`, so a
    // gap field that drifted out of step with the ranking would fail here
    // rather than quietly draw a different picture beneath the same list.
    const order = new Map(axisIds(FC_AXIS).map((id, i) => [id, i]));
    const unlock = new Map(FC_AXIS.buckets.map((b) => [b.id, b.unlockWeight]));
    const ranked = [...result.perCluster]
      .filter((s) => s.itemsSeen > 0)
      .map((s) => ({ cluster: s.cluster, leverage: s.gap * (1 + (unlock.get(s.cluster) ?? 0)) }))
      .sort(
        (a, b) =>
          b.leverage - a.leverage || (order.get(a.cluster) ?? 0) - (order.get(b.cluster) ?? 0),
      );

    expect(ranked.slice(0, REPORTED_PRIORITY_COUNT).map((p) => p.cluster)).toEqual(
      result.topPriorities.map((p) => p.cluster),
    );
  });

  it('reports two starting points rather than three', () => {
    const store = new DiagnosticSessionStore();
    const { view } = runSession(bank, store);
    const result = view.result!;

    // The third slot does not survive a re-sit: worst-case agreement between
    // two sittings is 76.4% on a reported top three against 89.6% on a top two.
    expect(REPORTED_PRIORITY_COUNT).toBe(2);
    expect(result.topPriorities).toHaveLength(REPORTED_PRIORITY_COUNT);
    // Narrowing the list is not narrowing the read — the chart still has every
    // concept to draw, including whichever one the cap dropped.
    expect(result.perCluster.map((s) => s.cluster)).toEqual(axisIds(FC_AXIS));
  });

  it('reports how much was seen per concept but never how much was right', () => {
    const store = new DiagnosticSessionStore();
    const { view } = runSession(bank, store);

    // `ClusterSignal.correct` stays server-side deliberately: a per-concept
    // score against a published item count is the closest the result view could
    // come to an answer oracle.
    for (const signal of view.result!.perCluster) {
      expect(signal).not.toHaveProperty('correct');
    }
    expect(JSON.stringify(view.result).includes('"correct"')).toBe(false);
    assertNoLeak(view.result, 'widened result view');
  });

  it('emits lesson priors that can never reach mastery', () => {
    const store = new DiagnosticSessionStore();
    // Answer from the key throughout: the strongest read the form can produce,
    // and so the one that pushes seeded priors as high as they can go.
    const { view } = runSession(
      bank,
      store,
      (questionId) => (['A', 'B', 'C', 'D'] as const).find((c) => bank.score(questionId, c)) ?? null,
    );
    const seed = view.result!.masterySeed;
    const priors = Object.values(seed.lessonPriors);

    expect(priors.length).toBeGreaterThan(0);
    for (const prior of priors) expect(prior).toBeLessThanOrEqual(SEED_PRIOR_CAP);
    // CARS is off the diagnostic's axis, so it seeds no ability at all.
    expect(seed.carsAbility).toEqual({});
    expect(seed.kcPriors).toEqual({});
    expect(seed.skillPriors).toEqual({});
  });

  it('produces identical delivery for the same seed', () => {
    const store = new DiagnosticSessionStore({ randomToken: (() => {
      let n = 0;
      return () => `token-${(n += 1)}`;
    })() });
    const a = runSession(bank, store);
    const store2 = new DiagnosticSessionStore({ randomToken: (() => {
      let n = 0;
      return () => `token-${(n += 1)}`;
    })() });
    const b = runSession(bank, store2);
    expect(a.record.responses.map((r) => r.questionId)).toEqual(
      b.record.responses.map((r) => r.questionId),
    );
  });
});

/**
 * The CI guard. Every `bank` above is `new DiagnosticBank()`, which prefers the
 * gitignored real pull when it is on disk — so on a developer machine those
 * suites exercise the real corpus. CI has no pull and the loader falls back to
 * the synthetic fixture, but that fallback must be proven to assemble the form
 * whether or not the pull happens to be present. This block therefore builds the
 * bank from the synthetic builder EXPLICITLY, so the guarantee is checked in
 * every environment, not only the one where the real bank is absent.
 */
describe('the synthetic fallback bank assembles the production form (CI guard)', () => {
  const syntheticBank = new DiagnosticBank(buildDiagnosticBank());

  it('mirrors the real bank FC profile bucket-for-bucket', () => {
    const counts: Record<string, [number, number, number]> = {};
    for (const item of syntheticBank.formItems) {
      const row = (counts[item.bucketId] ??= [0, 0, 0]);
      row[item.dokLevel - 1] += 1;
    }
    const partition = Object.fromEntries(
      axisIds(FC_AXIS).map((id) => [id, BANK_PROFILES['fc-15'][id]]),
    );
    expect(counts).toEqual(partition);
  });

  it('plans the 140-item production form without running any bucket dry', () => {
    const plan = planMstForm(MST_140_RECOMMENDED, syntheticBank.formItems, FC_AXIS);
    expect(plan.totalItems).toBe(140);
    expect(plan.uncoverableBuckets).toEqual([]);
    expect([...plan.itemsPerBucket.keys()]).toEqual(axisIds(FC_AXIS));
  });

  it('resolves every stage of a full sitting to a completed result', () => {
    const store = new DiagnosticSessionStore();
    const { record, view, blocks } = runSession(syntheticBank, store);
    const plan = productionPlan(syntheticBank);

    // Drove all 7 stages to completion for this route.
    expect(view.done).toBe(true);
    expect(view.result).not.toBeNull();
    expect(blocks.length).toBe(plan.stageSizes.length);
    expect(record.responses.length).toBe(plan.totalItems);

    // Coverage honoured on this route: every concept meets the design floor.
    const seen = perBucketCounts(record);
    for (const bucket of plan.itemsPerBucket.keys()) {
      expect(seen.get(bucket) ?? 0, bucket).toBeGreaterThanOrEqual(
        MST_140_RECOMMENDED.minItemsPerBucket,
      );
    }
    assertNoLeak(view.result, 'synthetic result view');
  });

  it('also assembles the top-scoring route, where no bucket may repeat an item', () => {
    const store = new DiagnosticSessionStore();
    const { record } = runSession(
      syntheticBank,
      store,
      (questionId) =>
        (['A', 'B', 'C', 'D'] as const).find((c) => syntheticBank.score(questionId, c)) ?? null,
    );
    expect(new Set(record.responses.map((r) => r.questionId)).size).toBe(140);
  });
});
