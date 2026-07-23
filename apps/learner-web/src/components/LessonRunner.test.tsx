import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { LessonStepViewSchema, type LessonStepView } from '@mcat/contracts';
import { LessonRunner, PresentationAttemptRegistry } from './LessonRunner';

const common = {
  kind: 'v3_lesson',
  schemaVersion: '2.0',
  runId: '11111111-1111-4111-8111-111111111111',
  runVersion: 7,
  lessonId: 'V3-LES-SYNTH-COMPONENT',
  definitionVersion: '4.0.0-test.1',
  lessonTitle: 'Synthetic component fixture',
  kcId: 'V3-KC-SYNTH-COMPONENT',
  kcTitle: 'Fictional control',
  route: 'standard',
  checkpointId: 'kc-component.completion-a2',
  progress: { kcOrdinal: 1, kcCount: 2, exitedKcCount: 0 },
  groupedFeedback: null,
} as const;

const activeStep = LessonStepViewSchema.parse({
  ...common,
  status: 'active',
  activity: {
    id: 'V3-ACT-SYNTH-COMPONENT-1',
    kcId: common.kcId,
    phase: 'completion',
    title: 'Choose a fictional marker',
    prompt: 'Which invented marker aligns?',
    instructions: ['Use the synthetic rule.'],
    representations: [
      {
        id: 'V3-REP-SYNTH-COMPONENT-DIAGRAM',
        kind: 'diagram',
        label: 'Fictional marker diagram',
        alternative: {
          shortText: 'Two invented markers.',
          longDescription: 'Two invented markers aligned side by side.',
        },
        diagram: {
          width: 320,
          height: 160,
          nodes: [
            {
              id: 'left',
              label: 'Left',
              description: 'Left invented marker.',
              x: 70,
              y: 80,
              shape: 'circle',
              tone: 'accent',
            },
            {
              id: 'right',
              label: 'Right',
              description: 'Right invented marker.',
              x: 250,
              y: 80,
              shape: 'rectangle',
              tone: 'positive',
            },
          ],
          edges: [{ from: 'left', to: 'right', label: 'aligns', directed: true }],
        },
      },
      {
        id: 'V3-REP-SYNTH-COMPONENT-CHART',
        kind: 'chart',
        label: 'Fictional values chart',
        alternative: {
          shortText: 'Output rises with input.',
          longDescription: 'A line joins zero-zero and one-one.',
        },
        chart: {
          chartType: 'line',
          xAxis: { label: 'Input', unit: null, min: 0, max: 1 },
          yAxis: { label: 'Output', unit: null, min: 0, max: 1 },
          series: [
            {
              id: 'fixture',
              label: 'Fixture series',
              points: [
                { x: 0, y: 0, label: null },
                { x: 1, y: 1, label: null },
              ],
            },
          ],
          dataTable: {
            caption: 'Fictional chart values',
            columns: ['Input', 'Output'],
            rows: [
              ['0', '0'],
              ['1', '1'],
            ],
          },
        },
      },
      {
        id: 'V3-REP-SYNTH-COMPONENT-EQUATION',
        kind: 'equation',
        label: 'Fictional equation',
        expression: 'y = 2x + 1',
        spoken: 'Y equals two X plus one.',
        variables: [{ symbol: 'x', meaning: 'Fictional input', unit: null }],
      },
      {
        id: 'V3-REP-SYNTH-COMPONENT-SIMULATION',
        kind: 'simulation',
        label: 'Fictional slider',
        alternative: {
          shortText: 'A slider changes a deterministic output.',
          longDescription: 'The output is two times the selected input plus one.',
        },
        simulation: {
          adapter: 'linear_relationship',
          input: {
            id: 'input',
            label: 'Input',
            min: 0,
            max: 2,
            step: 1,
            initial: 1,
            unit: null,
          },
          outputs: [
            {
              id: 'output',
              label: 'Output',
              slope: 2,
              intercept: 1,
              unit: null,
              decimals: 0,
            },
          ],
        },
      },
    ],
    response: {
      kind: 'choice',
      legend: 'Choose one response',
      choices: [
        { id: 'left', label: 'Left invented marker' },
        { id: 'right', label: 'Right invented marker' },
      ],
      allowNotSure: true,
    },
    assistance: {
      currentLevel: 'A2',
      visibleHint: null,
      canRequestMore: true,
      canReveal: true,
    },
    feedback: null,
  },
  availableActions: ['submit_response', 'request_hint', 'request_reveal', 'pause'],
  message: null,
});

const render = (step: LessonStepView) =>
  renderToStaticMarkup(<LessonRunner step={step} onAction={async () => undefined} />);

describe('LessonRunner accessibility and safe rendering', () => {
  it('uses native response semantics, accurate exited progress, and focusable transition heading', () => {
    const html = render(activeStep);

    expect(html).toContain('<fieldset');
    expect(html).toContain('<legend');
    expect(html).toContain('type="radio"');
    expect(html).toContain('I&#x27;m not sure');
    expect(html).toContain('id="lesson-kc-progress"');
    expect(html).toContain('value="0"');
    expect(html).toContain('tabindex="-1"');
    expect(html).not.toContain('correctChoice');
  });

  it('renders accessible semantic diagrams, charts, equations, and controlled simulations', () => {
    const html = render(activeStep);

    expect(html).toContain('<svg');
    expect(html).toContain('<title');
    expect(html).toContain('<desc');
    expect(html).toContain('Fictional chart values');
    expect(html).toContain('<table');
    expect(html).toContain('role="math"');
    expect(html).toContain('type="range"');
    expect(html).not.toContain('dangerouslySetInnerHTML');
    expect(html).not.toContain('<script');
  });

  it('renders bars from the reviewed zero baseline', () => {
    const input = structuredClone(activeStep);
    const chartRepresentation = input.activity?.representations.find(
      (representation) => representation.kind === 'chart',
    );
    if (!chartRepresentation || chartRepresentation.kind !== 'chart') {
      throw new Error('Expected the synthetic chart representation.');
    }
    chartRepresentation.chart.chartType = 'bar';
    chartRepresentation.chart.yAxis = { label: 'Output', unit: null, min: 0, max: 10 };
    chartRepresentation.chart.series[0]!.points = [
      { x: 0, y: 5, label: null },
      { x: 1, y: 10, label: null },
    ];
    const html = render(LessonStepViewSchema.parse(input));

    expect(html).toContain('<rect');
    expect(html).toContain('height="130"');
    expect(html).toContain('height="260"');
  });

  it('does not render assistance after the current response is committed', () => {
    const input = structuredClone(activeStep);
    if (!input.activity) throw new Error('Expected the active synthetic activity.');
    input.activity.assistance.canRequestMore = false;
    input.availableActions = ['continue', 'pause'];
    input.activity.feedback = {
      sealed: false,
      entries: [
        {
          activityId: input.activity.id,
          tone: 'correct',
          message: 'The synthetic response was committed.',
        },
      ],
    };
    const html = render(LessonStepViewSchema.parse(input));

    expect(html).toContain('The synthetic response was committed.');
    expect(html).toContain('>Continue<');
    expect(html).not.toContain('Add support');
    expect(html).not.toContain('Submit response');
  });

  it('announces grouped feedback once through one atomic live region', () => {
    if (!activeStep.activity)
      throw new Error('Expected the active fixture to include an activity.');
    const step = LessonStepViewSchema.parse({
      ...activeStep,
      groupedFeedback: {
        kind: 'entry',
        entries: [
          {
            activityId: activeStep.activity.id,
            tone: 'information',
            message: 'Grouped synthetic rationale.',
          },
        ],
      },
    });
    const html = render(step);

    expect(html.match(/aria-live="polite"/g)).toHaveLength(1);
    expect(html).toContain('aria-atomic="true"');
    expect(html).toContain('Grouped synthetic rationale');
  });

  it('announces invalid content as an alert with no action control', () => {
    const step = LessonStepViewSchema.parse({
      ...common,
      status: 'invalid_content',
      activity: null,
      availableActions: [],
      message: 'The synthetic definition is invalid.',
      issueCodes: ['fixture_invalid'],
    });
    const html = render(step);

    expect(html).toContain('role="alert"');
    expect(html).toContain('Lesson unavailable');
    expect(html).not.toContain('<button');
  });

  it('offers exact checkpoint resume only for resumable pauses', () => {
    const step = LessonStepViewSchema.parse({
      ...common,
      status: 'paused',
      activity: null,
      availableActions: ['resume'],
      message: 'Paused at the exact current checkpoint.',
      plannerReentryRequired: false,
    });

    expect(render(step)).toContain('Resume exact checkpoint');
  });

  it('describes completion only as instructional exit', () => {
    const step = LessonStepViewSchema.parse({
      ...common,
      kcId: null,
      kcTitle: null,
      route: null,
      progress: { kcOrdinal: null, kcCount: 2, exitedKcCount: 2 },
      status: 'complete',
      activity: null,
      availableActions: [],
      message: 'Every required KC reached instructional exit.',
      completion: {
        kind: 'lesson_completion',
        orderedRequiredKcIds: ['V3-KC-SYNTH-COMPONENT', 'V3-KC-SYNTH-COMPONENT-2'],
        instructionalExitKcIds: ['V3-KC-SYNTH-COMPONENT', 'V3-KC-SYNTH-COMPONENT-2'],
      },
    });
    const html = render(step).toLocaleLowerCase();

    expect(html).toContain('instructional exit');
    expect(html).not.toContain('mastery');
    expect(html).not.toContain('readiness');
  });
});

describe('auto-presentation retry registry', () => {
  it('marks success only after resolution and permits one manual retry after failure', async () => {
    const registry = new PresentationAttemptRegistry();
    let calls = 0;
    const mutation = async () => {
      calls += 1;
      if (calls === 1) throw new Error('transient failure');
    };

    expect(registry.shouldAutoAttempt('run:activity')).toBe(true);
    await expect(registry.attempt('run:activity', mutation)).rejects.toThrow('transient failure');
    expect(registry.shouldAutoAttempt('run:activity')).toBe(false);
    await expect(registry.attempt('run:activity', mutation, true)).resolves.toBe(true);
    expect(calls).toBe(2);
    expect(registry.shouldAutoAttempt('run:activity')).toBe(false);
  });
});
