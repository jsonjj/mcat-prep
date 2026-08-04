// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { MemoryRouter } from 'react-router-dom';
import type { PracticeTestBlockView } from '../../app/practice-test-client';
import { PracticeTest } from './PracticeTest';

/**
 * Smoke coverage for the fixed-form practice-test RUNNER: that it delivers a
 * block, renders the completion summary, and shows the "no test due" state when
 * the serve boundary refuses to start one off-cadence. The queries are mocked so
 * the screen is exercised without a server (the block-by-block engine + scoring
 * are covered in `server/practice-test.test.ts`).
 */

const nextData = vi.fn<() => PracticeTestBlockView | undefined>();
const submit = vi.fn();
const markReviewed = vi.fn();
const summaryData = vi.fn<() => { estimatedScore: { low: number; high: number } } | undefined>(
  () => undefined,
);

vi.mock('../../app/queries', () => ({
  usePracticeTestNext: () => ({
    data: nextData(),
    isLoading: nextData() === undefined,
    isError: false,
    refetch: vi.fn(),
  }),
  useSubmitPracticeTestBlock: () => ({ mutate: submit, isPending: false, isError: false }),
  useMarkPracticeTestReviewed: () => ({ mutate: markReviewed, isPending: false }),
  usePracticeTestSummary: () => ({ data: summaryData() }),
}));

const block = (over: Partial<PracticeTestBlockView> = {}): PracticeTestBlockView => ({
  done: false,
  progress: 0.1,
  itemsScored: 0,
  totalItems: 30,
  section: 'cp',
  sectionTitle: 'Chemical & Physical Foundations',
  blockId: 'section-cp',
  blockNumber: 1,
  blockCount: 4,
  itemsCommitted: 0,
  questions: [
    {
      id: 'q-1',
      section: 'cp',
      sectionTitle: 'Chemical & Physical Foundations',
      cluster: 'CP1',
      clusterTitle: 'Cluster',
      passage: '',
      stem: 'Stem for q-1',
      choices: [
        { id: 'A', text: 'first' },
        { id: 'B', text: 'second' },
        { id: 'C', text: 'third' },
        { id: 'D', text: 'fourth' },
      ],
    },
  ],
  result: null,
  resultPersisted: false,
  notDue: null,
  ...over,
});

const doneView = (): PracticeTestBlockView =>
  block({
    done: true,
    progress: 1,
    itemsScored: 30,
    section: null,
    sectionTitle: null,
    blockId: null,
    blockNumber: 0,
    questions: [],
    result: {
      itemsScored: 30,
      correct: 18,
      perSection: [
        { section: 'cp', itemsScored: 8, correct: 5, accuracy: 5 / 8 },
        { section: 'cars', itemsScored: 7, correct: 3, accuracy: 3 / 7 },
        { section: 'bb', itemsScored: 8, correct: 6, accuracy: 6 / 8 },
        { section: 'ps', itemsScored: 7, correct: 4, accuracy: 4 / 7 },
      ],
      perCluster: [],
      missedQuestionIds: ['q-2', 'q-3'],
      blueprintMet: true,
    },
  });

afterEach(() => {
  nextData.mockReset();
  submit.mockReset();
  markReviewed.mockReset();
  summaryData.mockReturnValue(undefined);
});

async function render(): Promise<ReactTestRenderer> {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(
      createElement(
        MemoryRouter,
        {
          initialEntries: [
            { pathname: '/app/practice/test', state: { returnTo: '/app/practice' } },
          ],
        },
        createElement(PracticeTest),
      ),
    );
  });
  return renderer;
}

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

// Collapse whitespace: JSX interpolation splits a line like `section {n} of {m}`
// into separate text nodes, which `textOf` re-joins with spaces.
const text = (renderer: ReactTestRenderer): string =>
  textOf(renderer.toJSON()).replace(/\s+/g, ' ');
const button = (renderer: ReactTestRenderer, label: string) =>
  renderer.root.findAllByType('button').find((b) => textOf(b).includes(label));

describe('practice-test runner — delivering a block', () => {
  it('renders the current section block, its question, and its choices', async () => {
    nextData.mockReturnValue(block());
    const rendered = text(await render());
    expect(rendered).toContain('Stem for q-1');
    expect(rendered).toContain('first');
    // Per-section progress framing: the question count is this section's (1 of 1 in
    // this single-question mock), with the section indicated — not "of 30/59".
    expect(rendered).toContain('Question 1 of 1');
    expect(rendered).toContain('Section 1 of 4');
  });

  it('submits the block once the whole block has been seen', async () => {
    nextData.mockReturnValue(block());
    const renderer = await render();
    // A single-question block is fully seen on mount → the submit CTA is live.
    const review = button(renderer, 'Review and submit section');
    expect(review).toBeDefined();
    await act(async () => {
      review!.props.onClick();
    });
    const confirm = button(renderer, 'Submit section');
    expect(confirm).toBeDefined();
    await act(async () => {
      confirm!.props.onClick();
    });
    expect(submit).toHaveBeenCalledTimes(1);
    expect(submit.mock.calls[0]![0].questionIds).toEqual(['q-1']);
  });
});

describe('practice-test runner — completion summary', () => {
  it('shows the score, per-section breakdown, and a review gate', async () => {
    nextData.mockReturnValue(doneView());
    summaryData.mockReturnValue({ estimatedScore: { low: 496, high: 506 } });
    const renderer = await render();
    const rendered = text(renderer);
    expect(rendered).toContain('18 / 30');
    expect(rendered).toContain('By section');
    // The honest, labelled estimated RANGE from the summary.
    expect(rendered).toContain('496');
    expect(rendered).toContain('estimate, not a single score');
    expect(rendered).toContain('2 to review');

    // Finishing marks the test reviewed (releasing the §6 next-test gate).
    const finish = button(renderer, 'Mark reviewed & finish');
    expect(finish).toBeDefined();
    await act(async () => {
      finish!.props.onClick();
    });
    expect(markReviewed).toHaveBeenCalledTimes(1);
  });
});

describe('practice-test runner — no test due', () => {
  it('renders the empty/next-due state when the serve boundary refuses to start', async () => {
    nextData.mockReturnValue(block({ notDue: { reason: 'not_due_recent' }, questions: [] }));
    const rendered = text(await render());
    expect(rendered).toContain('No practice test is due right now.');
    expect(rendered).not.toContain('Stem for');
  });
});
