import { describe, expect, it } from 'vitest';
import { buildDiagnosticBank, type DiagnosticItem } from '@mcat/content';
import {
  DiagnosticBank,
  DiagnosticSessionError,
  InMemoryDiagnosticSessions,
  resolveDiagnosticBankItems,
  serveDiagnosticBlock,
  serveDiagnosticNext,
  type DiagnosticBlockResponse,
} from './index';

/**
 * The deployed-equivalent smoke: the promoted serving core (bank + engine +
 * session integrity) driven exactly as the learner-API handler and the local
 * authority drive it — through `serveDiagnosticNext`/`serveDiagnosticBlock` over
 * an in-memory session store, against the synthetic fixture bank. Plus the bank
 * source seam (postgres → local pull → fixture).
 */

const bank = (): DiagnosticBank => new DiagnosticBank(buildDiagnosticBank());

const noLeak = (payload: unknown): void => {
  const json = JSON.stringify(payload);
  for (const field of ['correct_answer', 'explanations', 'correct_choice_id', '"correct"', 'tokenHash']) {
    expect(json.includes(field), `leaked ${field}`).toBe(false);
  }
};

const answerAll = (view: DiagnosticBlockResponse, choice: string): Record<string, string> =>
  Object.fromEntries(view.questions.map((q) => [q.id, choice]));

describe('diagnostic bank source seam', () => {
  const fixtureItems = buildDiagnosticBank();
  const fakeItems: DiagnosticItem[] = [fixtureItems[0]!];

  it('prefers postgres when it returns items', async () => {
    const result = await resolveDiagnosticBankItems({
      loadFromPostgres: async () => fakeItems,
      loadFromLocalPull: () => fixtureItems,
      loadFixture: () => fixtureItems,
    });
    expect(result.source).toBe('postgres');
    expect(result.items).toBe(fakeItems);
  });

  it('falls back to the local pull when postgres is empty', async () => {
    const result = await resolveDiagnosticBankItems({
      loadFromPostgres: async () => [],
      loadFromLocalPull: () => fixtureItems,
      loadFixture: () => [],
      warn: () => {},
    });
    expect(result.source).toBe('local-pull');
    expect(result.items).toBe(fixtureItems);
  });

  it('falls back to the fixture when postgres throws and there is no local pull', async () => {
    const result = await resolveDiagnosticBankItems({
      loadFromPostgres: async () => {
        throw new Error('no db');
      },
      loadFromLocalPull: () => null,
      loadFixture: () => fixtureItems,
      warn: () => {},
    });
    expect(result.source).toBe('fixture');
    expect(result.items).toBe(fixtureItems);
  });

  it('uses the fixture when no postgres loader is supplied and no pull is present', async () => {
    const result = await resolveDiagnosticBankItems({
      loadFromLocalPull: () => null,
      loadFixture: () => fixtureItems,
    });
    expect(result.source).toBe('fixture');
  });
});

describe('serve core over an in-memory session (deployed-equivalent path)', () => {
  it('drives a whole sitting start → block → … → completed result', async () => {
    const b = bank();
    const store = new InMemoryDiagnosticSessions();

    let view = await serveDiagnosticNext(b, store, 'learner-1', {});
    expect(view.done).toBe(false);
    expect(view.stageNumber).toBe(1);
    expect(view.questions.length).toBeGreaterThan(0);
    expect(typeof view.sessionToken).toBe('string');
    expect(typeof view.blockToken).toBe('string');
    noLeak(view);

    const served: string[][] = [];
    for (let guard = 0; guard < 20 && !view.done; guard += 1) {
      served.push(view.questions.map((q) => q.id));
      view = await serveDiagnosticBlock(b, store, 'learner-1', {
        sessionToken: view.sessionToken,
        blockToken: view.blockToken,
        stageId: view.stageId,
        answers: answerAll(view, 'A'),
      });
      noLeak(view);
    }

    expect(view.done).toBe(true);
    expect(view.result).not.toBeNull();
    const all = served.flat();
    expect(view.itemsScored).toBe(all.length);
    expect(new Set(all).size).toBe(all.length);
    expect(Object.keys(view.result!.masterySeed.kcPriors).length).toBeGreaterThan(0);
  });

  it('re-serves an open block on resume, minting a fresh one-use token', async () => {
    const b = bank();
    const store = new InMemoryDiagnosticSessions();
    const first = await serveDiagnosticNext(b, store, 'learner-1', {});
    const again = await serveDiagnosticNext(b, store, 'learner-1', {
      sessionToken: first.sessionToken,
    });
    expect(again.stageId).toBe(first.stageId);
    expect(again.questions.map((q) => q.id)).toEqual(first.questions.map((q) => q.id));
    expect(again.blockToken).not.toBe(first.blockToken);
  });

  it('refuses a replayed block token (a committed block cannot re-submit)', async () => {
    const b = bank();
    const store = new InMemoryDiagnosticSessions();
    const first = await serveDiagnosticNext(b, store, 'learner-1', {});
    const commit = () =>
      serveDiagnosticBlock(b, store, 'learner-1', {
        sessionToken: first.sessionToken,
        blockToken: first.blockToken,
        stageId: first.stageId,
        answers: answerAll(first, 'A'),
      });
    await commit();
    await expect(commit()).rejects.toMatchObject({ status: 409 });
  });

  it('binds a session to its learner: another learner cannot resume or commit it', async () => {
    const b = bank();
    const store = new InMemoryDiagnosticSessions();
    const first = await serveDiagnosticNext(b, store, 'learner-1', {});
    await expect(
      serveDiagnosticNext(b, store, 'learner-2', { sessionToken: first.sessionToken }),
    ).rejects.toBeInstanceOf(DiagnosticSessionError);
    await expect(
      serveDiagnosticBlock(b, store, 'learner-2', {
        sessionToken: first.sessionToken,
        blockToken: first.blockToken,
        stageId: first.stageId,
        answers: answerAll(first, 'A'),
      }),
    ).rejects.toMatchObject({ status: 401 });
  });

  it('rejects an expired/unknown session token with 401', async () => {
    const b = bank();
    const store = new InMemoryDiagnosticSessions();
    await expect(
      serveDiagnosticNext(b, store, 'learner-1', { sessionToken: 'nope' }),
    ).rejects.toMatchObject({ status: 401 });
  });
});
