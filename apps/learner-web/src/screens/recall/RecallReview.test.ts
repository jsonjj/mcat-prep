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
// The plan-completion mutation `RecallReview` fires as its empty-runner safety net.
// Stable identity for the same effect-dependency reason as `service` above.
const planMutate = vi.fn();
const planMutation = { mutate: planMutate, isPending: false };

vi.mock('../../app/recall-queries', () => ({
  useRecallService: () => service,
  useRecordReview: () => mutation,
  useSetSuspended: () => mutation,
  useSoftDeleteCard: () => mutation,
  // Display-only passthrough so a rendered card (the non-empty case below) doesn't
  // need the real media-resolver.
  useResolvedHtml: (html: string) => html,
}));

vi.mock('../../app/today-queries', () => ({
  useRecordPlanActivity: () => planMutation,
}));

afterEach(() => {
  getQueue.mockClear();
  planMutate.mockClear();
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

/**
 * Today's Path is strictly in-order with no skip, so a Recall step launched with an
 * empty queue (reserved as "N due" against 0 actual cards) would pin the plan to
 * itself and lock every later step. `RecallReview` breaks the deadlock by completing
 * the launched step so the plan advances — the runner-side half of the engine guard.
 */
describe('RecallReview empty-runner safety net', () => {
  it('auto-completes an empty step launched from the plan so the plan advances', async () => {
    await renderAt({ returnTo: '/app/today', activityId: 'recall', minutesBudget: 5, maxCards: 8 });

    expect(planMutate).toHaveBeenCalledTimes(1);
    expect(planMutate).toHaveBeenCalledWith({ activityId: 'recall', status: 'complete' });
  });

  it('leaves a standalone (non-plan) empty session alone — nothing to advance', async () => {
    await renderAt({ minutesBudget: 5, maxCards: 8 });

    expect(planMutate).not.toHaveBeenCalled();
  });

  it('does not self-complete when the queue actually has cards', async () => {
    getQueue.mockResolvedValueOnce([
      { id: 'c1', frontHtml: 'q', backHtml: 'a' },
    ]);
    await renderAt({ returnTo: '/app/today', activityId: 'recall', minutesBudget: 5, maxCards: 8 });

    expect(planMutate).not.toHaveBeenCalled();
  });
});
