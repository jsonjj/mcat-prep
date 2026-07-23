import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  LessonStepViewSchema,
  type LessonStepView,
} from '@mcat/contracts';
import { LessonRunner } from './LessonRunner';

const common = {
  kind: 'v3_lesson',
  schemaVersion: '1.0',
  runId: '11111111-1111-4111-8111-111111111111',
  lessonId: 'V3-LES-SYNTH-COMPONENT',
  definitionVersion: '3.0.0-test.1',
  lessonTitle: 'Synthetic component fixture',
  kcId: 'V3-KC-SYNTH-COMPONENT',
  kcTitle: 'Fictional control',
  route: 'standard',
  progress: { kcOrdinal: 1, kcCount: 2, exitedKcCount: 0 },
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
        id: 'V3-REP-SYNTH-COMPONENT-1',
        kind: 'diagram',
        label: 'Fictional marker diagram',
        body: [],
        altText: 'Two invented markers aligned side by side.',
        longDescription: 'A non-scientific test diagram containing two matching marks.',
        table: null,
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
    },
    feedback: null,
  },
  availableActions: ['submit_response', 'request_assistance', 'pause'],
  message: null,
});

const render = (step: LessonStepView) =>
  renderToStaticMarkup(
    <LessonRunner step={step} onAction={() => undefined} />,
  );

describe('LessonRunner accessibility and safe rendering', () => {
  it('uses native choice semantics, a named progress control, and not-sure response', () => {
    const html = render(activeStep);

    expect(html).toContain('<fieldset');
    expect(html).toContain('<legend');
    expect(html).toContain('type="radio"');
    expect(html).toContain('I&#x27;m not sure');
    expect(html).toContain('id="lesson-kc-progress"');
    expect(html).toContain('aria-label="Two invented markers aligned side by side."');
    expect(html).not.toContain('correctChoice');
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
    const html = render(step);

    expect(html).toContain('Resume exact checkpoint');
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
        instructionalExitKcIds: [
          'V3-KC-SYNTH-COMPONENT',
          'V3-KC-SYNTH-COMPONENT-2',
        ],
      },
    });
    const html = render(step).toLocaleLowerCase();

    expect(html).toContain('instructional exit');
    expect(html).not.toContain('mastery');
    expect(html).not.toContain('readiness');
  });
});
