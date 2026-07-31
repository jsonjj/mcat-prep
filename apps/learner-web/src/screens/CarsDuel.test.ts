// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { MemoryRouter } from 'react-router-dom';
import { CarsDuel } from './CarsDuel';

/**
 * Today's Path is strictly in-order with no user skip. A CARS Duel step launched
 * from the plan when the AI opponent is unavailable (no dev key → "Your sparring
 * partner is offline") used to dead-end the plan: the offline "Back to plan"
 * returns without a `completedActivityId`, so the step stayed `in_progress` and
 * every later step stayed Locked. `CarsDuel` now breaks that deadlock by
 * completing the launched step so the plan advances — mirroring RecallReview's
 * empty-runner safety net. A standalone (non-plan) duel has nothing to advance
 * and must be left untouched.
 */

// The AI opponent call — rejected here so the duel drops into its offline state,
// exactly as a missing dev AI key does at runtime.
const chat = vi.fn().mockRejectedValue(new Error('AI opponent not connected'));

// The plan-completion mutation the offline safety net fires. Stable identity
// across renders so `CarsDuel`'s effect (which lists it as a dependency) doesn't
// re-fire on it — the same reason RecallReview's test keeps a stable mutation.
const planMutate = vi.fn();
const planMutation = { mutate: planMutate, isPending: false };

vi.mock('@mcat/ai-gateway', () => ({
  // Only `chat` is exercised on the offline path; it rejects to trip `unavailable`.
  HttpAiChat: class {
    chat = chat;
  },
  MAX_ROUNDS: 6,
  DUEL_DIFFICULTY_LABELS: { warmup: 'Warm-up', standard: 'Standard', challenge: 'Challenge' },
  buildCarsSystemPrompt: () => 'system-prompt',
  buildReflectionPrompt: () => ({ role: 'user', content: 'reflect' }),
  buildDuelRubricPrompt: () => ({ role: 'user', content: 'rubric' }),
  parseDuelRubric: () => ({}),
}));

vi.mock('../app/queries', () => ({
  useCarsReadiness: () => ({ data: undefined }),
  useRecordCarsDuel: () => ({ mutate: vi.fn() }),
}));

vi.mock('../app/today-queries', () => ({
  useRecordPlanActivity: () => planMutation,
}));

// A fully-resolved selection, as the plan hands the autostart path (WS6).
const SELECTION = {
  topicId: 'topic-1',
  proposition: 'Whether anonymous authorship strengthens a public argument',
  theme: 'philosophy',
  argumentStructure: 'normative',
  difficulty: 3,
  mode: 'rebut',
  intensity: 'standard',
  side: 'oppose',
};

afterEach(() => {
  chat.mockClear();
  planMutate.mockClear();
});

async function renderAt(state: unknown): Promise<ReactTestRenderer> {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(
      createElement(
        MemoryRouter,
        { initialEntries: [{ pathname: '/app/cars', state }] },
        createElement(CarsDuel),
      ),
    );
  });
  // A second flush so the rejected AI call → `unavailable` state update → the
  // offline safety-net effect all settle before assertions.
  await act(async () => {});
  return renderer;
}

describe('CarsDuel offline safety net', () => {
  it('auto-completes a plan-launched duel that goes offline so the plan advances', async () => {
    await renderAt({
      autostart: true,
      returnTo: '/app/today',
      activityId: 'cars',
      selection: SELECTION,
    });

    // The duel actually reached out to its opponent (and got nothing back).
    expect(chat).toHaveBeenCalled();
    expect(planMutate).toHaveBeenCalledTimes(1);
    expect(planMutate).toHaveBeenCalledWith({ activityId: 'cars', status: 'complete' });
  });

  it('leaves a standalone (non-plan) offline duel alone — nothing to advance', async () => {
    await renderAt({ autostart: true, selection: SELECTION });

    expect(chat).toHaveBeenCalled();
    expect(planMutate).not.toHaveBeenCalled();
  });
});
