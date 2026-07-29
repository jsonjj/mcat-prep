// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { MemoryRouter } from 'react-router-dom';
import { RecallReview } from './RecallReview';

/**
 * Today's Path hands Recall a scheduler budget via router state (see
 * `today-queries.ts`'s `useLaunchPlanActivity`). This suite proves `RecallReview`
 * actually threads that budget into `service.getQueue`, rather than the silent
 * regression this guards against: calling `getQueue({})` and ignoring the
 * planner entirely while still returning a queue that looks fine.
 */

const getQueue = vi.fn().mockResolvedValue([]);
// A stable object identity across renders, matching the real `useRecallService`
// (memoized via a module-level cache) — a fresh object every render would make
// `RecallReview`'s effect dependency array (which includes `service`) re-fire
// on every render regardless of the budget wiring under test.
const service = { getQueue };
const mutation = { mutateAsync: vi.fn(), isPending: false };

vi.mock('../../app/recall-queries', () => ({
  useRecallService: () => service,
  useRecordReview: () => mutation,
  useSetSuspended: () => mutation,
  useSoftDeleteCard: () => mutation,
}));

afterEach(() => {
  getQueue.mockClear();
});

async function renderAt(state: unknown): Promise<ReactTestRenderer> {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(
      createElement(
        MemoryRouter,
        { initialEntries: [{ pathname: '/app/recall/review', state }] },
        createElement(RecallReview),
      ),
    );
  });
  return renderer;
}

describe('RecallReview budget wiring', () => {
  it("honors Today's Path minutesBudget and maxCards instead of getQueue({})", async () => {
    // Deliberately not a round "sensible default" — proves the real planner
    // value made it through rather than a hardcoded fallback.
    await renderAt({ returnTo: '/app', activityId: 'recall', minutesBudget: 17, maxCards: 6 });

    expect(getQueue).toHaveBeenCalledTimes(1);
    expect(getQueue).toHaveBeenCalledWith({ minutesBudget: 17, maxCards: 6 });
  });

  it('surfaces an absent planner budget as undefined, never a hardcoded default', async () => {
    await renderAt(null);

    expect(getQueue).toHaveBeenCalledTimes(1);
    expect(getQueue).toHaveBeenCalledWith({ minutesBudget: undefined, maxCards: undefined });
  });

  it('re-queries when navigating in with a different budget (no stale-closure default)', async () => {
    await renderAt({ minutesBudget: 3, maxCards: 1 });
    expect(getQueue).toHaveBeenLastCalledWith({ minutesBudget: 3, maxCards: 1 });

    await renderAt({ minutesBudget: 42, maxCards: 9 });
    expect(getQueue).toHaveBeenLastCalledWith({ minutesBudget: 42, maxCards: 9 });
  });
});
