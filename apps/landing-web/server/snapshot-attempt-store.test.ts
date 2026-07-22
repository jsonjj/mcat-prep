import { describe, expect, it } from 'vitest';
import { SnapshotAttemptError, SnapshotAttemptStore } from './snapshot-attempt-store';

describe('SnapshotAttemptStore', () => {
  it('allows one score operation per issued attempt', () => {
    const store = new SnapshotAttemptStore();
    const { attemptToken } = store.issue('client-a');
    expect(store.issue('client-a').attemptToken).toBe(attemptToken);

    expect(store.complete(attemptToken, 'submission-a', { report: 'ready' })).toEqual({
      report: 'ready',
    });
    expect(store.complete(attemptToken, 'submission-a', { report: 'new' })).toEqual({
      report: 'ready',
    });
    expect(() => store.complete(attemptToken, 'submission-b', { report: 'changed' })).toThrow(
      new SnapshotAttemptError('This snapshot attempt was already scored.', 409),
    );
  });

  it('expires attempts and limits issuance per client window', () => {
    let now = 1_000;
    const store = new SnapshotAttemptStore({
      ttlMs: 1_000,
      attemptWindowMs: 5_000,
      maxScoredAttemptsPerWindow: 1,
      now: () => now,
    });

    const first = store.issue('client-a');
    expect(store.issue('client-a').attemptToken).toBe(first.attemptToken);
    store.complete(first.attemptToken, 'submission-a', { report: 'ready' });
    expect(() => store.issue('client-a')).toThrow('already generated');

    now += 1_001;
    expect(() => store.complete(first.attemptToken, 'submission-a', {})).toThrow('expired');

    now += 4_000;
    expect(() => store.issue('client-a')).not.toThrow();
  });
});
