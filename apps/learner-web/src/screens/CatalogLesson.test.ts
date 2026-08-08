// @vitest-environment jsdom
import { createElement, type ReactElement } from 'react';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { NormalizedLessonRunView, NormalizedLessonScreen } from '@mcat/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CatalogLesson } from './CatalogLesson';

const hooks = vi.hoisted(() => ({
  status: vi.fn(),
  start: vi.fn(),
  run: vi.fn(),
  submit: vi.fn(),
}));

vi.mock('../app/queries', () => ({
  useNormalizedLessonStatus: () => hooks.status(),
  useStartNormalizedLesson: () => hooks.start(),
  useNormalizedLessonRun: () => hooks.run(),
  useSubmitNormalizedLessonAction: () => hooks.submit(),
}));

const submitMutate = vi.fn();
const startMutate = vi.fn();
const statusRefetch = vi.fn();
const runRefetch = vi.fn();
const focusHeadings: string[] = [];

const view = (screen: NormalizedLessonScreen): NormalizedLessonRunView => ({
  runId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  lessonId: 'V3-LES-789208',
  status:
    screen.kind === 'BLOCKED'
      ? 'BLOCKED'
      : screen.kind === 'COMPLETE'
        ? 'DELIVERY_COMPLETE'
        : 'IN_PROGRESS',
  paused: false,
  kcId: screen.kind === 'COMPLETE' ? null : 'V3-KC-TEST',
  kcOrdinal: screen.kind === 'COMPLETE' ? null : 1,
  totalKcs: 2,
  screen,
});

const exposition = (
  heading: string,
  blocks: string[],
  prompt = 'COMPATIBILITY_PROMPT_SENTINEL',
): NormalizedLessonScreen => ({
  kind: 'EXPOSITION',
  heading,
  contentBlocks: blocks,
  prompt,
});

const question = (
  control: Extract<NormalizedLessonScreen, { kind: 'QUESTION' }>['control'],
  overrides: Partial<Extract<NormalizedLessonScreen, { kind: 'QUESTION' }>> = {},
): Extract<NormalizedLessonScreen, { kind: 'QUESTION' }> => ({
  kind: 'QUESTION',
  itemId: 'item-1',
  kcId: 'V3-KC-TEST',
  heading: 'Apply the model',
  contentBlocks: ['Use only the information shown here.'],
  prompt: 'What response follows?',
  control,
  choices: [],
  ...overrides,
});

const textOf = (node: unknown): string => {
  const strings: string[] = [];
  const walk = (value: unknown): void => {
    if (typeof value === 'string' || typeof value === 'number') strings.push(String(value));
    else if (Array.isArray(value)) value.forEach(walk);
    else if (value !== null && typeof value === 'object' && 'children' in value) {
      walk((value as { children: unknown }).children);
    }
  };
  walk(node);
  return strings.join(' ');
};

const button = (renderer: ReactTestRenderer, label: string): ReactTestInstance => {
  const match = renderer.root
    .findAllByType('button')
    .find((candidate) => textOf(candidate).includes(label));
  if (!match) throw new Error(`button "${label}" not found`);
  return match;
};

const lessonElement = (): ReactElement =>
  createElement(
    MemoryRouter,
    {
      initialEntries: ['/app/lessons/v3-les-789208'],
      future: { v7_startTransition: true, v7_relativeSplatPath: true },
    },
    createElement(
      Routes,
      null,
      createElement(Route, {
        path: '/app/lessons/v3-les-789208',
        element: createElement(CatalogLesson, { lessonId: 'V3-LES-789208' }),
      }),
      createElement(Route, {
        path: '/app/curriculum',
        element: createElement('p', null, 'Curriculum destination'),
      }),
    ),
  );

const renderLesson = async (): Promise<ReactTestRenderer> => {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(lessonElement(), {
      createNodeMock(element) {
        if (element.type === 'h1') {
          return {
            focus: () => focusHeadings.push(textOf(element.props.children)),
          };
        }
        return null;
      },
    });
  });
  return renderer;
};

const showScreen = (screen: NormalizedLessonScreen): void => {
  hooks.status.mockReturnValue({
    data: { availability: 'AVAILABLE', runState: 'IN_PROGRESS', actionLabel: 'Continue' },
    isLoading: false,
    isError: false,
    refetch: statusRefetch,
  });
  hooks.start.mockReturnValue({
    mutate: startMutate,
    isPending: false,
    isSuccess: false,
    isError: false,
  });
  hooks.run.mockReturnValue({
    data: view(screen),
    isLoading: false,
    isError: false,
    refetch: runRefetch,
  });
};

beforeEach(() => {
  vi.clearAllMocks();
  focusHeadings.length = 0;
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  hooks.submit.mockReturnValue({
    mutate: submitMutate,
    isPending: false,
    isError: false,
  });
});

describe('CatalogLesson canonical screens', () => {
  it('renders every exposition content block in authored order without compatibility or protected data', async () => {
    const screen = {
      ...exposition('Canonical exposition', ['First authored block', 'Second authored block']),
      answerKey: 'PROTECTED_KEY_SENTINEL',
      protectedRef: 'PROTECTED_REF_SENTINEL',
    } as unknown as NormalizedLessonScreen;
    showScreen(screen);

    const renderer = await renderLesson();
    const rendered = textOf(renderer.toJSON());

    expect(rendered.indexOf('First authored block')).toBeLessThan(
      rendered.indexOf('Second authored block'),
    );
    expect(rendered).not.toContain('COMPATIBILITY_PROMPT_SENTINEL');
    expect(rendered).not.toContain('PROTECTED_KEY_SENTINEL');
    expect(rendered).not.toContain('PROTECTED_REF_SENTINEL');
  });

  it('uses the canonical single-select control and submits its exact response shape', async () => {
    showScreen(
      question(
        {
          kind: 'SINGLE_SELECT',
          choices: [
            { choiceId: 'alpha', text: 'Canonical alpha' },
            { choiceId: 'beta', text: 'Canonical beta' },
          ],
        },
        {
          choices: [{ choiceId: 'compat', text: 'PROTECTED_COMPATIBILITY_CHOICE' }],
        },
      ),
    );

    const renderer = await renderLesson();
    const radios = renderer.root
      .findAllByType('input')
      .filter((input) => input.props.type === 'radio');

    expect(radios).toHaveLength(2);
    expect(textOf(renderer.toJSON())).toContain('Canonical alpha');
    expect(textOf(renderer.toJSON())).not.toContain('PROTECTED_COMPATIBILITY_CHOICE');
    for (const radio of radios) {
      expect(radio.props.id).toEqual(expect.any(String));
      expect(
        renderer.root
          .findAllByType('label')
          .some((label) => label.props.htmlFor === radio.props.id),
      ).toBe(true);
    }

    await act(async () => radios[1].props.onChange());
    await act(async () => {
      renderer.root.findByType('form').props.onSubmit({ preventDefault: vi.fn() });
    });

    expect(submitMutate).toHaveBeenCalledWith(
      {
        type: 'SUBMIT_RESPONSE',
        response: { kind: 'MULTIPLE_CHOICE', choiceId: 'beta' },
      },
      expect.any(Object),
    );
    expect(JSON.stringify(submitMutate.mock.calls)).not.toMatch(/PROTECTED|answerKey|protectedRef/);
  });

  it('labels short text, explains its authored convention, and submits the canonical shape', async () => {
    showScreen(
      question({
        kind: 'SHORT_TEXT',
        inputConvention: {
          normalization: 'TRIM_AND_COLLAPSE_WHITESPACE',
          matching: 'AUTHORED_EQUIVALENTS_ONLY',
          caseSensitive: true,
        },
      }),
    );

    const renderer = await renderLesson();
    const input = renderer.root
      .findAllByType('input')
      .find((candidate) => candidate.props.type === 'text');
    expect(input).toBeDefined();
    expect(
      renderer.root.findAllByType('label').some((label) => label.props.htmlFor === input!.props.id),
    ).toBe(true);
    expect(textOf(renderer.toJSON())).toContain(
      'Use the authored wording and capitalization. Extra spaces are normalized.',
    );

    await act(async () =>
      input!.props.onChange({ target: { value: '  NADH \t oxidation   state  ' } }),
    );
    await act(async () => {
      renderer.root.findByType('form').props.onSubmit({ preventDefault: vi.fn() });
    });

    expect(submitMutate).toHaveBeenCalledWith(
      {
        type: 'SUBMIT_RESPONSE',
        response: { kind: 'SHORT', text: 'NADH oxidation state' },
      },
      expect.any(Object),
    );
  });

  it('submits every structured field exactly once in authored order', async () => {
    showScreen(
      question({
        kind: 'STRUCTURED_FIELDS',
        fields: [
          { fieldId: 'first-step', label: 'First step' },
          { fieldId: 'second-step', label: 'Second step' },
          { fieldId: 'final-step', label: 'Final step' },
        ],
      }),
    );

    const renderer = await renderLesson();
    const inputs = renderer.root
      .findAllByType('input')
      .filter((candidate) => candidate.props.type === 'text');
    expect(inputs).toHaveLength(3);
    expect(new Set(inputs.map((input) => input.props.name)).size).toBe(3);
    for (const input of inputs) {
      expect(
        renderer.root
          .findAllByType('label')
          .some((label) => label.props.htmlFor === input.props.id),
      ).toBe(true);
    }
    expect(button(renderer, 'Submit response').props.disabled).toBe(true);

    await act(async () => inputs[0].props.onChange({ target: { value: 'one' } }));
    await act(async () => inputs[1].props.onChange({ target: { value: 'two' } }));
    await act(async () => inputs[2].props.onChange({ target: { value: 'three' } }));
    expect(button(renderer, 'Submit response').props.disabled).toBe(false);
    await act(async () => {
      renderer.root.findByType('form').props.onSubmit({ preventDefault: vi.fn() });
    });

    expect(submitMutate).toHaveBeenCalledWith(
      {
        type: 'SUBMIT_RESPONSE',
        response: {
          kind: 'CONSTRUCTED',
          fields: [
            { fieldId: 'first-step', value: 'one' },
            { fieldId: 'second-step', value: 'two' },
            { fieldId: 'final-step', value: 'three' },
          ],
        },
      },
      expect.any(Object),
    );
  });

  it('retains skip by submitting every authored structured field once with a null value', async () => {
    showScreen(
      question({
        kind: 'STRUCTURED_FIELDS',
        fields: [
          { fieldId: 'left', label: 'Left side' },
          { fieldId: 'right', label: 'Right side' },
        ],
      }),
    );
    const renderer = await renderLesson();

    await act(async () => button(renderer, 'Skip this response').props.onClick());

    expect(submitMutate).toHaveBeenCalledWith(
      {
        type: 'SUBMIT_RESPONSE',
        response: {
          kind: 'CONSTRUCTED',
          fields: [
            { fieldId: 'left', value: null },
            { fieldId: 'right', value: null },
          ],
        },
      },
      expect.any(Object),
    );
  });

  it.each([
    ['CORRECT', 'Correct'],
    ['INCORRECT', 'Not quite'],
    ['OMITTED', 'Response skipped'],
    ['INVALID', 'Check your response'],
  ] as const)(
    'distinguishes %s feedback and announces its safe message once',
    async (outcome, heading) => {
      const message = `Learner-safe ${outcome.toLowerCase()} message`;
      showScreen({ kind: 'FEEDBACK', itemId: `item-${outcome}`, outcome, message });

      const renderer = await renderLesson();
      const rendered = textOf(renderer.toJSON());
      const statuses = renderer.root
        .findAll((node) => node.props.role === 'status')
        .filter((node) => textOf(node).includes(message));

      expect(textOf(renderer.root.findByType('h1'))).toBe(heading);
      expect(rendered.match(new RegExp(message, 'g'))).toHaveLength(1);
      expect(statuses).toHaveLength(1);
      expect(focusHeadings).toContain(heading);
    },
  );

  it('moves focus on same-kind exposition, question, and feedback transitions', async () => {
    showScreen(exposition('First explanation', ['First block']));
    const renderer = await renderLesson();
    expect(focusHeadings).toContain('First explanation');

    focusHeadings.length = 0;
    showScreen(exposition('Second explanation', ['Second block']));
    await act(async () => renderer.update(lessonElement()));
    expect(focusHeadings).toContain('Second explanation');

    focusHeadings.length = 0;
    showScreen(
      question({
        kind: 'SINGLE_SELECT',
        choices: [{ choiceId: 'A', text: 'Choice A' }],
      }),
    );
    await act(async () => renderer.update(lessonElement()));
    expect(focusHeadings).toContain('Apply the model');

    focusHeadings.length = 0;
    showScreen({
      kind: 'FEEDBACK',
      itemId: 'item-1',
      outcome: 'CORRECT',
      message: 'That response follows from the model.',
    });
    await act(async () => renderer.update(lessonElement()));
    expect(focusHeadings).toContain('Correct');
  });

  it('reissues a failed initial start and can recover from the dead end', async () => {
    hooks.status.mockReturnValue({
      data: { availability: 'AVAILABLE', runState: 'NOT_STARTED', actionLabel: 'Start' },
      isLoading: false,
      isError: false,
      refetch: statusRefetch,
    });
    hooks.start.mockReturnValue({
      mutate: startMutate,
      isPending: false,
      isSuccess: false,
      isError: true,
    });
    hooks.run.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
      refetch: runRefetch,
    });

    const renderer = await renderLesson();
    expect(startMutate).toHaveBeenCalledTimes(1);

    await act(async () => button(renderer, 'Try again').props.onClick());
    expect(startMutate).toHaveBeenCalledTimes(2);

    showScreen(exposition('Recovered lesson', ['The idempotent start recovered.']));
    await act(async () => renderer.update(lessonElement()));
    expect(textOf(renderer.toJSON())).toContain('Recovered lesson');
  });

  it('retains lesson-local pause and return', async () => {
    showScreen(exposition('Pauseable lesson', ['Checkpoint content']));
    const renderer = await renderLesson();

    await act(async () => button(renderer, 'Pause and return').props.onClick());

    expect(textOf(renderer.toJSON())).toContain('Curriculum destination');
  });
});
