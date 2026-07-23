import { describe, expect, it } from 'vitest';
import { LessonChartSpecSchema, LessonDiagramSpecSchema } from './lesson-views';

const diagram = {
  width: 320,
  height: 160,
  nodes: [
    {
      id: 'left',
      label: 'Left',
      description: 'Left synthetic node.',
      x: 60,
      y: 80,
      shape: 'circle' as const,
      tone: 'accent' as const,
    },
    {
      id: 'right',
      label: 'Right',
      description: 'Right synthetic node.',
      x: 250,
      y: 80,
      shape: 'rectangle' as const,
      tone: 'positive' as const,
    },
  ],
  edges: [{ from: 'left', to: 'right', label: null, directed: true }],
};

const chart = {
  chartType: 'line' as const,
  xAxis: { label: 'Input', unit: null, min: 0, max: 10 },
  yAxis: { label: 'Output', unit: null, min: -10, max: 10 },
  series: [
    {
      id: 'result',
      label: 'Synthetic result',
      points: [
        { x: 0, y: -10, label: null },
        { x: 10, y: 10, label: null },
      ],
    },
  ],
  dataTable: {
    caption: 'Synthetic values',
    columns: ['Input', 'Output'],
    rows: [
      ['0', '-10'],
      ['10', '10'],
    ],
  },
};

describe('structured lesson representation contracts', () => {
  it('rejects duplicate diagram nodes and coordinates outside usable view bounds', () => {
    const duplicate = structuredClone(diagram);
    duplicate.nodes[1]!.id = duplicate.nodes[0]!.id;
    expect(LessonDiagramSpecSchema.safeParse(duplicate).success).toBe(false);

    const clipped = structuredClone(diagram);
    clipped.nodes[1]!.x = 300;
    expect(LessonDiagramSpecSchema.safeParse(clipped).success).toBe(false);
    expect(LessonDiagramSpecSchema.safeParse(diagram).success).toBe(true);
  });

  it('rejects duplicate chart series and points outside declared axes', () => {
    const duplicate = structuredClone(chart);
    duplicate.series.push(structuredClone(duplicate.series[0]!));
    expect(LessonChartSpecSchema.safeParse(duplicate).success).toBe(false);

    const outside = structuredClone(chart);
    outside.series[0]!.points[1]!.y = 11;
    expect(LessonChartSpecSchema.safeParse(outside).success).toBe(false);
    expect(LessonChartSpecSchema.safeParse(chart).success).toBe(true);
  });

  it('limits bar charts to a mathematically defined nonnegative zero baseline', () => {
    const invalid = {
      ...structuredClone(chart),
      chartType: 'bar' as const,
      yAxis: { ...chart.yAxis, min: -10 },
    };
    const valid = {
      ...structuredClone(chart),
      chartType: 'bar' as const,
      yAxis: { ...chart.yAxis, min: 0 },
      series: [
        {
          ...structuredClone(chart.series[0]!),
          points: [
            { x: 0, y: 0, label: null },
            { x: 10, y: 10, label: null },
          ],
        },
      ],
    };

    expect(LessonChartSpecSchema.safeParse(invalid).success).toBe(false);
    expect(LessonChartSpecSchema.safeParse(valid).success).toBe(true);
  });
});
