import { describe, expect, it } from 'vitest';
import { BAYES_DIAGNOSTIC_CONFIG } from '@mcat/policies';
import { DiagnosticBank } from './diagnostic-bank';
import { DiagnosticSessionError, DiagnosticSessionStore } from './diagnostic-session-store';
import { recordAnswer, resolveNext } from './diagnostic-engine';

const PROTECTED_FIELDS = ['correct_answer', 'explanations', 'correct_choice_id', 'rationales'];

function assertNoLeak(payload: unknown, hint: string): void {
  const json = JSON.stringify(payload);
  for (const field of PROTECTED_FIELDS) {
    expect(json.includes(`"${field}"`), `${hint} leaked ${field}`).toBe(false);
  }
}

/** Drive a whole session to completion, always answering "A". */
function runSession(bank: DiagnosticBank, store: DiagnosticSessionStore) {
  const { record } = store.create('client-1');
  let served = 0;
  const servedViews: unknown[] = [];
  for (let guard = 0; guard < 200; guard += 1) {
    const { view, servedQuestionId } = resolveNext(bank, record);
    servedViews.push(view);
    if (view.done) return { record, served, view, servedViews };
    const token = store.issueItemToken(record, servedQuestionId!);
    store.consumeItemToken(record, servedQuestionId!, token);
    recordAnswer(bank, record, servedQuestionId!, 'A', 30_000);
    served += 1;
  }
  throw new Error('session did not complete');
}

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

  it('enforces one-use item tokens (no repeatable oracle for a served item)', () => {
    const store = new DiagnosticSessionStore();
    const { record } = store.create('c');
    const token = store.issueItemToken(record, 'q-1');
    store.consumeItemToken(record, 'q-1', token); // first use ok
    expect(() => store.consumeItemToken(record, 'q-1', token)).toThrow(DiagnosticSessionError); // reuse rejected
  });

  it('rejects a token for the wrong question id', () => {
    const store = new DiagnosticSessionStore();
    const { record } = store.create('c');
    const token = store.issueItemToken(record, 'q-1');
    expect(() => store.consumeItemToken(record, 'q-2', token)).toThrow(DiagnosticSessionError);
  });
});

describe('diagnostic engine end-to-end', () => {
  const bank = new DiagnosticBank();

  it('runs from start to a completed, coverage-honoring result', () => {
    const store = new DiagnosticSessionStore();
    const { record, served, view } = runSession(bank, store);
    expect(view.done).toBe(true);
    expect(view.result).not.toBeNull();
    // The engine runs the active Bayesian adaptive path (BAYES_DIAGNOSTIC_CONFIG),
    // which early-stops between its min/max once the read settles. The legacy
    // balanced-coverage router config (DIAGNOSTIC_CONFIG, 30/60) is a fallback the
    // engine does not use, so assert against the config the engine actually applies.
    expect(served).toBeGreaterThanOrEqual(BAYES_DIAGNOSTIC_CONFIG.minItems);
    expect(served).toBeLessThanOrEqual(BAYES_DIAGNOSTIC_CONFIG.maxItems);
    expect(record.responses.length).toBe(served);
    // A result with a word label and priorities — never a numeric confidence.
    expect(['High', 'Medium', 'Still building']).toContain(view.result!.confidenceLabel);
    assertNoLeak(view.result, 'result view');
    expect(JSON.stringify(view.result).includes('internalConfidence')).toBe(false);
  });

  it('never leaks protected fields in any served item view', () => {
    const store = new DiagnosticSessionStore();
    const { servedViews } = runSession(bank, store);
    for (const view of servedViews) assertNoLeak(view, 'served view');
  });

  it('re-serves the pending item idempotently (deterministic resume)', () => {
    const store = new DiagnosticSessionStore();
    const { record } = store.create('c');
    const first = resolveNext(bank, record).servedQuestionId;
    // Without answering, resolving again returns the SAME item.
    const again = resolveNext(bank, record).servedQuestionId;
    expect(first).toBe(again);
  });

  it('produces identical selection order for the same seed', () => {
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
