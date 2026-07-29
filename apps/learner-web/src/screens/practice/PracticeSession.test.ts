// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { MemoryRouter } from 'react-router-dom';
import type { PracticeQueueItem, PracticeQueueView } from '@mcat/contracts';
import { PracticeSession } from './PracticeSession';

/**
 * Phase 6 gave `PracticeQueueView` two honesty signals — `taughtGap`, true when
 * a real taught set shared nothing with the loaded bank, and `shortfall`,
 * requested minus delivered — and nothing read either one.
 *
 * That mattered most where it was least visible. Failing closed on a taught-set
 * miss means a learner now gets ZERO items instead of wrong ones, which is the
 * right trade only if the empty result explains itself: an unexplained blank is
 * a pedagogical harm swapped for a confusing one. This suite asserts each
 * degraded state renders something a learner can act on, and that the ordinary
 * queue stays quiet.
 */

const queueData = vi.fn<() => PracticeQueueView | undefined>();
const queueState = vi.fn<() => { isLoading: boolean; isError: boolean }>(() => ({
  isLoading: false,
  isError: false,
}));
const mutate = vi.fn();

vi.mock('../../app/practice-queries', () => ({
  usePracticeQueue: () => ({ data: queueData(), ...queueState() }),
  useSubmitPracticeAttempt: () => ({ mutate, isPending: false }),
}));

const item = (id: string): PracticeQueueItem => ({
  specId: `sci:${id}:IDENTIFY:train`,
  domain: 'science',
  purpose: 'train',
  kcId: 'V3-KC-525816',
  skill: 'IDENTIFY',
  carsSkill: null,
  dok: 2,
  question: {
    id,
    section: 'bb',
    cluster: 'BB1',
    passage: '',
    stem: `Stem for ${id}`,
    choices: [
      { id: 'A', text: 'first' },
      { id: 'B', text: 'second' },
      { id: 'C', text: 'third' },
      { id: 'D', text: 'fourth' },
    ],
  },
});

const view = (over: Partial<PracticeQueueView> = {}): PracticeQueueView => ({
  requested: 8,
  focus: null,
  items: [item('q-1'), item('q-2')],
  shortfall: 0,
  taughtGap: false,
  nothingTaught: false,
  ...over,
});

afterEach(() => {
  queueData.mockReset();
  queueState.mockReturnValue({ isLoading: false, isError: false });
  mutate.mockReset();
});

async function render(): Promise<ReactTestRenderer> {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(
      createElement(
        MemoryRouter,
        { initialEntries: [{ pathname: '/app/practice/session', state: { x: 8 } }] },
        createElement(PracticeSession),
      ),
    );
  });
  return renderer;
}

/** All text under a rendered node, flattened — what the learner can read. */
const textOf = (node: unknown): string => {
  const strings: string[] = [];
  const walk = (n: unknown): void => {
    if (typeof n === 'string') strings.push(n);
    else if (Array.isArray(n)) n.forEach(walk);
    else if (n !== null && typeof n === 'object' && 'children' in n) {
      walk((n as { children: unknown }).children);
    }
  };
  walk(node);
  return strings.join(' ');
};

const text = (renderer: ReactTestRenderer): string => textOf(renderer.toJSON());

/**
 * The button whose label contains `label`, so a press can be asserted. Walks
 * the test instance rather than its JSON, since a `TestInstance` exposes the
 * same `children` shape and keeps its `onClick` reachable.
 */
const button = (renderer: ReactTestRenderer, label: string) =>
  renderer.root.findAllByType('button').find((b) => textOf(b).includes(label));

describe('an empty queue caused by a taught-set miss', () => {
  it('says the material has not been taught yet and offers a lesson', async () => {
    queueData.mockReturnValue(view({ items: [], shortfall: 8, taughtGap: true }));
    const renderer = await render();
    const rendered = text(renderer);

    // Not a blank, and not phrased as a fault.
    expect(rendered).toContain('Not taught yet');
    expect(rendered).toContain('lessons you’ve already finished');
    expect(rendered).not.toMatch(/error|unavailable|went wrong|couldn’t/i);

    // And it points somewhere: a lesson, not just back where they came from.
    expect(button(renderer, 'Find a lesson')).toBeDefined();
  });

  /**
   * Both exits on this screen close over `finish`, which used to be declared
   * BELOW this early return — so the button rendered and then threw a TDZ
   * `ReferenceError` when pressed. Pressing them is the whole test: a state
   * whose only way out throws is a dead end however good its copy is.
   */
  it('leaves both of its exits pressable', async () => {
    queueData.mockReturnValue(view({ items: [], shortfall: 8, taughtGap: true }));
    const renderer = await render();

    for (const label of ['Find a lesson', 'Back']) {
      const target = button(renderer, label);
      expect(target).toBeDefined();
      await act(async () => {
        target!.props.onClick();
      });
    }
  });

  /**
   * The other cause of an empty queue keeps its own copy. Collapsing the two
   * would tell a learner who has finished the lessons to go finish a lesson.
   */
  it('keeps the supply-shortage wording when there is no taught gap', async () => {
    queueData.mockReturnValue(view({ items: [], shortfall: 8, taughtGap: false }));
    const rendered = text(await render());

    expect(rendered).toContain('Nothing to practice yet');
    expect(rendered).not.toContain('Not taught yet');
    expect(rendered).not.toContain('Find a lesson');
  });
});

/**
 * The day-one state, which did not exist on this screen until the taught-set
 * gate started failing closed on an empty taught set: before that a learner who
 * had finished nothing was served the unfiltered bank, so they never reached an
 * empty queue at all.
 *
 * It gets its own copy because the taught-gap sentence presupposes finished
 * lessons to draw from ("none of the questions we have are from those yet").
 * Said to someone who has finished none, that describes a content shortage on
 * work they have not done.
 */
describe('an empty queue caused by having finished no lesson', () => {
  it('says a lesson comes first, and does not claim a shortage', async () => {
    queueData.mockReturnValue(
      view({ items: [], shortfall: 8, taughtGap: true, nothingTaught: true }),
    );
    const renderer = await render();
    const rendered = text(renderer);

    expect(rendered).toContain('Start with a lesson');
    expect(rendered).toContain('you haven’t finished one yet');
    expect(rendered).not.toMatch(/error|unavailable|went wrong|couldn’t/i);

    // Not the neighbouring states' copy, either of them.
    expect(rendered).not.toContain('Not taught yet');
    expect(rendered).not.toContain('Nothing to practice yet');

    expect(button(renderer, 'Find a lesson')).toBeDefined();
  });

  it('leaves both of its exits pressable', async () => {
    queueData.mockReturnValue(
      view({ items: [], shortfall: 8, taughtGap: true, nothingTaught: true }),
    );
    const renderer = await render();

    for (const label of ['Find a lesson', 'Back']) {
      const target = button(renderer, label);
      expect(target).toBeDefined();
      await act(async () => {
        target!.props.onClick();
      });
    }
  });
});

describe('a session shorter than the learner asked for', () => {
  it('says how short, in the session itself', async () => {
    queueData.mockReturnValue(
      view({ requested: 8, items: [item('q-1'), item('q-2')], shortfall: 6 }),
    );
    const rendered = text(await render());

    // The question is rendering, so this is a real session reporting its own
    // size rather than an empty-state message.
    expect(rendered).toContain('Stem for q-1');
    expect(rendered).toContain('2 of the 8 questions you asked for');
  });

  it('reports a taught gap even when the queue came back full', async () => {
    // Reachable: the taught-set gate drops science units only, so CARS can fill
    // every requested slot and leave `shortfall` at zero with every science
    // question the learner expected still missing.
    queueData.mockReturnValue(view({ requested: 2, shortfall: 0, taughtGap: true }));
    const rendered = text(await render());

    expect(rendered).toContain('Stem for q-1');
    expect(rendered).toContain('lessons you haven’t finished yet');
    expect(rendered).not.toContain('questions you asked for');
  });

  it('says nothing when the queue is exactly what was asked for', async () => {
    queueData.mockReturnValue(view({ requested: 2, shortfall: 0, taughtGap: false }));
    const rendered = text(await render());

    expect(rendered).toContain('Stem for q-1');
    expect(rendered).not.toContain('questions you asked for');
    expect(rendered).not.toContain('sitting out');
  });
});
