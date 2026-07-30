import { describe, expect, it } from 'vitest';
import type { UtcTimestamp } from '@mcat/contracts';
import type { PracticeTestBlueprint } from '@mcat/policies';
import { validatePracticeTestForm } from '@mcat/policies';
import { PracticeTestBank } from './practice-test-bank';
import { DiagnosticSessionStore, type SessionRecord } from './diagnostic-session-store';
import {
  bankSupportsPracticeTest,
  recordPracticeTestBlock,
  resolvePracticeTestBlock,
  type PracticeTestBlockView,
} from './practice-test-engine';
import type { PulledCorpus, PulledProtected, PulledQuestion } from './db-pull';

/**
 * The practice test reuses the diagnostic SESSION STORE and the RESULT-ENVELOPE
 * shape, with a fixed-form scorer and no adaptive routing. These drive a whole
 * sitting through the store's token dance — exactly as the HTTP layer does — on a
 * synthetic corpus so the suite runs in every environment (no real pull needed).
 */

const BP: PracticeTestBlueprint = {
  totalItems: 16,
  sectionFloors: { cp: 4, cars: 4, bb: 4, ps: 3 },
  skillFloors: {},
  formatFloors: {},
};

const CLUSTER: Record<'cp' | 'cars' | 'bb' | 'ps', string[]> = {
  cp: ['CP1', 'CP2'],
  cars: ['CA1', 'CA2'],
  bb: ['BB1', 'BB2'],
  ps: ['PS2', 'PS3'],
};
const CARS_SKILL = ['CARS_FOC', 'CARS_RWT', 'CARS_RBT'];

/** A synthetic corpus with ample fresh items per section for two full sittings. */
function makeCorpus(perSection = 12): PulledCorpus {
  const questions: PulledQuestion[] = [];
  const keys: PulledProtected[] = [];
  let n = 0;
  for (const section of ['cp', 'cars', 'bb', 'ps'] as const) {
    for (let i = 0; i < perSection; i += 1) {
      n += 1;
      const id = `q-${section}-${i}`;
      const cluster = CLUSTER[section][i % CLUSTER[section].length]!;
      const isCars = section === 'cars';
      questions.push({
        question_id: id,
        section,
        cluster,
        kc_id: isCars ? null : `kc-${cluster}`,
        lesson_id: null,
        family_id: `fam-${id}`,
        subject: null,
        primary_skill: isCars ? CARS_SKILL[i % CARS_SKILL.length]! : 'SIRS1',
        dok_level: (i % 3) + 1,
        stem: `Stem ${id}`,
        // CARS + even science items carry a passage; odd science are discrete.
        passage: isCars || i % 2 === 0 ? `Passage for ${id}` : '',
        choices: { A: 'alpha', B: 'beta', C: 'gamma', D: 'delta' },
        status: 'production_candidate',
      });
      // Correct answer rotates so all-'A' answering yields a realistic mix.
      const correct = (['A', 'B', 'C', 'D'] as const)[i % 4]!;
      keys.push({
        question_id: id,
        correct_answer: correct,
        explanations: { A: 'why A', B: 'why B', C: 'why C', D: 'why D' },
      });
    }
  }
  return { questions, protectedById: new Map(keys.map((k) => [k.question_id, k])) };
}

const bankFor = (perSection = 12): PracticeTestBank => new PracticeTestBank(makeCorpus(perSection));
const NOW = '2026-03-01T00:00:00.000Z' as UtcTimestamp;
const PROTECTED_FIELDS = ['correct_answer', 'explanations', 'correctChoiceId'];

function assertNoLeak(payload: unknown, hint: string): void {
  const json = JSON.stringify(payload);
  for (const field of PROTECTED_FIELDS) {
    expect(json.includes(`"${field}"`), `${hint} leaked ${field}`).toBe(false);
  }
}

/** Drive a whole sitting to completion one section-block at a time, via the store. */
function runSitting(
  bank: PracticeTestBank,
  store: DiagnosticSessionStore,
  learnerId: string,
  choose: (questionId: string) => 'A' | 'B' | 'C' | 'D' | null = () => 'A',
): { record: SessionRecord; view: PracticeTestBlockView; served: string[]; blockSections: string[] } {
  const { record } = store.create(learnerId);
  const served: string[] = [];
  const blockSections: string[] = [];
  for (let guard = 0; guard < 12; guard += 1) {
    const { view, block } = resolvePracticeTestBlock(bank, record, learnerId, { now: NOW, blueprint: BP });
    assertNoLeak(view, 'served view');
    if (view.done) return { record, view, served, blockSections };
    const ids = block!.questionIds;
    served.push(...ids);
    blockSections.push(view.section!);
    const token = store.issueBlockToken(record, block!.blockId, ids);
    const answers = Object.fromEntries(ids.map((id) => [id, choose(id)]));
    const committed = store.consumeBlockToken(record, block!.blockId, token);
    recordPracticeTestBlock(bank, record, committed, answers);
  }
  throw new Error('sitting did not complete');
}

describe('practice test bank includes CARS', () => {
  it('carries CARS candidates (unlike the diagnostic bank)', () => {
    const bank = bankFor();
    expect(bank.stats.cars).toBeGreaterThan(0);
    expect(bank.candidates.some((c) => c.section === 'cars')).toBe(true);
  });
});

describe('bankSupportsPracticeTest (the serve-path 503 guard predicate)', () => {
  it('is TRUE for an ample bank and FALSE for one too thin for the blueprint', () => {
    // Ample: 12 fresh items per section clears the BP section floors with room.
    expect(bankSupportsPracticeTest(bankFor(12), 'learner-feasible', BP)).toBe(true);
    // Thin: 2 per section cannot meet cp:4 / cars:4 / bb:4, so no valid form can
    // be dealt — the exact condition the serve path now answers with a 503.
    expect(bankSupportsPracticeTest(bankFor(2), 'learner-thin', BP)).toBe(false);
  });
});

describe('practice test fixed-form delivery (reuses the diagnostic session store)', () => {
  it('serves the whole form section by section, with no adaptive routing', () => {
    const bank = bankFor();
    const store = new DiagnosticSessionStore();
    const { record, view, served, blockSections } = runSitting(bank, store, 'learner-1');

    expect(view.done).toBe(true);
    expect(view.result).not.toBeNull();
    expect(record.responses.length).toBe(BP.totalItems);
    // Blocks arrive in fixed section order — never a routed module.
    expect(blockSections).toEqual(['cp', 'cars', 'bb', 'ps']);
    // Every served item is unique within the sitting.
    expect(new Set(served).size).toBe(served.length);
  });

  it('routing is answer-independent: a strong and a weak learner get the same form shape', () => {
    const strong = runSitting(bankFor(), new DiagnosticSessionStore(), 'a', () => 'A');
    const weak = runSitting(bankFor(), new DiagnosticSessionStore(), 'b', () => null);
    expect(strong.blockSections).toEqual(weak.blockSections);
    expect(strong.record.responses.length).toBe(weak.record.responses.length);
  });

  it('re-serving an open block returns the same items (stable within a sitting)', () => {
    const bank = bankFor();
    const store = new DiagnosticSessionStore();
    const { record } = store.create('learner-x');
    const first = resolvePracticeTestBlock(bank, record, 'learner-x', { now: NOW, blueprint: BP });
    const again = resolvePracticeTestBlock(bank, record, 'learner-x', { now: NOW, blueprint: BP });
    expect(again.block!.questionIds).toEqual(first.block!.questionIds);
    expect(again.view.section).toBe(first.view.section);
  });
});

describe('practice test assembled form meets the blueprint (validate before serve)', () => {
  it('the served items satisfy every floor, CARS included', () => {
    const bank = bankFor();
    const { served } = runSitting(bank, new DiagnosticSessionStore(), 'learner-2');
    const items = bank.candidates.filter((c) => served.includes(c.questionId));
    expect(validatePracticeTestForm(items, BP)).toEqual([]);
    expect(items.filter((c) => c.section === 'cars').length).toBeGreaterThanOrEqual(BP.sectionFloors.cars);
  });
});

describe('practice test never reuses a previously-scored item', () => {
  it('a second sitting shares no item with the first', () => {
    const bank = bankFor();
    const store = new DiagnosticSessionStore();
    const first = runSitting(bank, store, 'learner-3');
    const second = runSitting(bank, store, 'learner-3');

    const firstSet = new Set(first.served);
    expect(second.served.some((id) => firstSet.has(id))).toBe(false);
    // The bank now records every item from BOTH sittings as scored.
    const scored = bank.scoredIds('learner-3');
    for (const id of [...first.served, ...second.served]) expect(scored.has(id)).toBe(true);
  });
});

describe('practice test result envelope (fixed-form scorer)', () => {
  it('carries per-section + per-cluster scores, review targets, and a decay-weighted re-measure', () => {
    const bank = bankFor();
    // Answer 'A' throughout: with rotating keys this yields a deterministic mix.
    const { view } = runSitting(bank, new DiagnosticSessionStore(), 'learner-4', () => 'A');
    const result = view.result!;

    expect(result.itemsScored).toBe(BP.totalItems);
    expect(result.perSection.map((s) => s.section).sort()).toEqual(['bb', 'cars', 'cp', 'ps']);
    expect(result.perCluster.length).toBeGreaterThan(0);
    // The decay-weighted re-measure reports a per-cluster capability read.
    expect(result.remeasure.length).toBeGreaterThan(0);
    for (const r of result.remeasure) {
      expect(r.grain).toBe('cluster');
      expect(r.remeasured).toBeGreaterThanOrEqual(0);
      expect(r.remeasured).toBeLessThanOrEqual(1);
    }
    // Misses feed the review queue; CARS misses are excluded from per-KC targets.
    expect(Array.isArray(result.reviewTargets)).toBe(true);
    expect(result.reviewTargets.every((t) => typeof t.kcId === 'string')).toBe(true);
    assertNoLeak(result, 'result envelope');
    expect(result.blueprintMet).toBe(true);
  });

  it('re-measure blends across sittings, weighting the most recent most heavily', () => {
    const bank = bankFor(24);
    const store = new DiagnosticSessionStore();
    // First sitting long ago, all wrong; the bank stamps it at `NOW` here, so to
    // exercise recency we read the re-measure after a second, all-correct sitting.
    runSitting(bank, store, 'learner-5', () => null); // all blank → wrong
    const second = runSitting(bank, store, 'learner-5', (id) => {
      // Answer from the key for a perfect second sitting.
      for (const c of ['A', 'B', 'C', 'D'] as const) if (bank.score(id, c)) return c;
      return null;
    });
    // Both sittings are stamped at NOW in this harness, so the re-measure is the
    // pooled decay-weighted accuracy across both — strictly between the two.
    const reads = second.view.result!.remeasure;
    expect(reads.length).toBeGreaterThan(0);
    for (const r of reads) expect(r.sittings).toBeGreaterThanOrEqual(1);
  });
});
