import { buildAppNativeLesson, question, relations } from './authoring-helpers';
import type { LessonSectionAuthoring } from './section-authoring';

const SLOPE_KC = 'V3-KC-452593';

function slopeMap(caption?: string) {
  return relations(
    'Reading meaning from a graph slope',
    'The slope of a line is the change in the y-axis quantity divided by the change in the x-axis quantity, and it carries the units of y over x. The intercept is the y-value when x is zero, and a steeper line means a larger rate.',
    [
      {
        label: 'Slope = Δy / Δx',
        nodes: [
          { label: 'rise', detail: 'change in y', emphasis: 'active' },
          { label: 'run', detail: 'change in x' },
          { label: 'units', detail: 'y-units per x-unit' },
        ],
        links: ['÷', 'gives'],
      },
      {
        label: 'What the picture tells you',
        continuationLabel: 'read the axes before the shape',
        nodes: [
          { label: 'intercept', detail: 'y at x = 0' },
          { label: 'steeper', detail: 'larger rate', emphasis: 'active' },
          { label: 'sign', detail: '+ rising / − falling' },
        ],
        links: ['then', 'then'],
      },
    ],
    caption,
  );
}

const slopeSection: LessonSectionAuthoring = {
  key: 'graph-slope',
  kcId: SLOPE_KC,
  stageLabel: 'Graph slopes',
  nextActionLabel: 'Finish the lesson',
  starting: question(
    'Read a distance–time slope',
    'On a distance (m) versus time (s) graph, a straight line rises 20 m over 4 s. What does the slope represent, and what is its value?',
    [
      ['Speed, 5 m/s.', 'Correct. Slope = Δy/Δx = 20 m ÷ 4 s = 5 m/s, which is distance per time — speed.'],
      ['Distance, 20 m.', 'Distance is a value on the axis, not the rate the slope measures.'],
      ['Acceleration, 5 m/s².', 'Acceleration is the slope of a velocity–time graph, not a distance–time graph.'],
      ['Time, 4 s.', 'Time is the run, part of the slope, not the slope itself.'],
    ],
    'A',
    'Slope equals rise over run and inherits the units of the axes: meters per second here, which is speed. Numerically, 20 m ÷ 4 s = 5 m/s.',
    'Divide the change in the y-axis quantity by the change in the x-axis quantity, and keep the units.',
    'A slope is a rate: its meaning comes from the axis units.',
    slopeMap('Rise over run, in y-units per x-unit.'),
  ),
  model: {
    title: 'Slope is a rate with units',
    supportingLine: 'Read the axes and their units before interpreting the shape.',
    explanation: [
      'The slope of a line is Δy/Δx, the change in the vertical quantity divided by the change in the horizontal quantity. Its units are the y-axis units divided by the x-axis units, which is what gives the slope its physical meaning.',
      'The y-intercept is the value of y when x = 0. A steeper line means a larger rate, and a negative slope means y decreases as x increases. Always identify the axes and units first, because the same shape can mean different things.',
    ],
    visual: slopeMap('Identify axes and units, then read slope, intercept, and sign.'),
    takeaway: 'Slope = Δy/Δx, and its units tell you which quantity the rate describes.',
  },
  understandingCheck: question(
    'Units set the meaning',
    'On a velocity (m/s) versus time (s) graph, what physical quantity does the slope represent?',
    [
      ['Acceleration, in m/s².', 'Correct. (m/s) ÷ s = m/s², the definition of acceleration.'],
      ['Speed, in m/s.', 'Speed is on the y-axis; the slope is the rate speed changes.'],
      ['Distance, in m.', 'Distance is the area under this graph, not its slope.'],
      ['Force, in N.', 'Force does not appear on these axes at all.'],
    ],
    'A',
    'Slope units are y-units per x-unit: (m/s) per s = m/s². That is acceleration.',
    'Divide the y-axis units by the x-axis units to name the slope.',
  ),
  worked: {
    title: 'Find slope and intercept from points',
    supportingLine: 'Two points give the whole line.',
    explanation: [
      'Take two points on a line: (1, 3) and (5, 11). The slope is (11 − 3) ÷ (5 − 1) = 8 ÷ 4 = 2.',
      'Use one point to find the intercept: 3 = 2(1) + b, so b = 1. The line is y = 2x + 1. Now any x gives its y, and the intercept 1 is the value at x = 0.',
    ],
    visual: relations(
      'Building y = 2x + 1',
      'The slope from (1,3) to (5,11) is 8 over 4, or 2, and substituting a point gives an intercept of 1.',
      [
        {
          label: 'From points to equation',
          nodes: [
            { label: 'slope', detail: '(11−3)/(5−1) = 2' },
            { label: 'intercept', detail: '3 = 2(1)+b → b = 1' },
            { label: 'y = 2x + 1', emphasis: 'active' },
          ],
          links: ['→', '→'],
        },
      ],
    ),
    takeaway: 'What to notice: slope from two points, then one point fixes the intercept.',
  },
  guided: question(
    'Compare steepness',
    'Line P has slope 3 and line Q has slope 1 on the same axes. Which statement is correct?',
    [
      ['Line P is steeper and rises faster than line Q.', 'Correct. A larger slope means a greater rate of increase.'],
      ['Line Q is steeper because it has the smaller number.', 'A smaller slope is less steep, not more.'],
      ['They have the same steepness because both are positive.', 'Positive sign is not the same as equal magnitude.'],
      ['Steepness cannot be compared without the intercepts.', 'Steepness depends only on slope, not on intercept.'],
    ],
    'A',
    'Steepness is set by the magnitude of the slope. Slope 3 rises three units per step versus one for slope 1, so line P is steeper.',
    'Bigger slope magnitude means steeper line.',
  ),
  reducedSupport: question(
    'Interpret the intercept',
    'A line on a cost ($) versus quantity (items) graph is C = 2q + 5. What does the intercept 5 mean?',
    [
      ['A fixed cost of $5 that applies even when zero items are made.', 'Correct. The intercept is the value of C when q = 0.'],
      ['The cost of each additional item.', 'That is the slope, 2 dollars per item, not the intercept.'],
      ['The total cost of 5 items.', 'The intercept is the cost at q = 0, not at q = 5.'],
      ['The number of items you can make for free.', 'The intercept is a cost value, not a quantity.'],
    ],
    'A',
    'The intercept is y at x = 0: here C = 2(0) + 5 = 5, a fixed cost incurred before any items are produced.',
    'Set the x-variable to zero to read the intercept\u2019s meaning.',
  ),
  independent: question(
    'Read a negative slope',
    'On a graph of remaining fuel (L) versus distance driven (km), the line has slope −0.08. What does this mean?',
    [
      ['Fuel decreases by 0.08 L for each kilometer driven.', 'Correct. A negative slope means the y-quantity falls as x increases, at 0.08 L per km.'],
      ['Fuel increases by 0.08 L per km.', 'A negative slope means a decrease, not an increase.'],
      ['The car started with 0.08 L of fuel.', 'That would be the intercept, not the slope.'],
      ['The car drove 0.08 km.', 'Slope is a rate, not a distance.'],
    ],
    'A',
    'A slope of −0.08 L/km means each kilometer driven lowers the remaining fuel by 0.08 liters.',
  ),
  near: question(
    'Slope from two points',
    'A line passes through (2, 10) and (6, 2). What is its slope?',
    [
      ['−2', 'Correct. (2 − 10) ÷ (6 − 2) = −8 ÷ 4 = −2.'],
      ['2', 'The line falls, so the slope is negative.'],
      ['−0.5', 'That inverts rise and run; slope is Δy over Δx, not Δx over Δy.'],
      ['4', 'That is the run alone, not the slope.'],
    ],
    'A',
    'Slope = Δy/Δx = (2 − 10) ÷ (6 − 2) = −8/4 = −2. The negative sign shows the line falls.',
  ),
  changed: question(
    'Read a transformed axis',
    'A reaction is plotted as ln[A] (natural log of concentration) versus time, and the data form a straight line with a negative slope. What does this indicate?',
    [
      [
        'The concentration decays exponentially (first-order), and the slope equals −k.',
        'Correct. A straight line on a ln[A]-versus-time plot signals first-order decay, with slope −k.',
      ],
      [
        'The concentration decreases linearly with time.',
        'A linear decrease would appear straight on a plain [A]-versus-time plot, not on a log plot.',
      ],
      [
        'The reaction is at equilibrium.',
        'Equilibrium would show a flat line, not a steadily falling one.',
      ],
      [
        'The slope has no physical meaning on a log axis.',
        'On a log axis the slope is still meaningful; here it is the negative rate constant.',
      ],
    ],
    'A',
    'When an axis is transformed (here to ln[A]), a straight line reveals the underlying relationship. A straight ln[A]-versus-time line indicates first-order kinetics, and its slope is −k. Always check what the axes actually plot.',
  ),
  repair: {
    title: 'Axes and units before shape',
    supportingLine: 'The frequent error is reading a slope without its units or ignoring a transformed axis.',
    explanation: [
      'Identify what each axis plots and in what units. Compute slope as Δy/Δx from two clear points, and attach the units (y-units per x-unit) to name the quantity.',
      'Check whether an axis is transformed (log or squared). On such axes a straight line encodes a nonlinear relationship, and the slope means something specific, such as a rate constant.',
    ],
    visual: slopeMap('Read axes and units first; then slope, intercept, sign, and any transform.'),
    strategy: 'Label axes and units, take two points, compute Δy/Δx, then interpret with the units.',
    checkYourThinking: 'Do the slope\u2019s units match the quantity you are claiming, and is either axis transformed?',
  },
  recap: {
    title: 'You can read graphs quantitatively',
    explanation: [
      'You computed slopes as rates with units, interpreted intercepts and signs, built a line from two points, and recognized that a transformed axis lets a straight line reveal a nonlinear law.',
    ],
    visual: slopeMap('Axes and units turn a line into a physical or chemical rate.'),
    takeaway: 'A slope is a unit-bearing rate; always read the axes—including transforms—before interpreting.',
  },
};

const { script: GRAPHS_SLOPES_SCRIPT, presentation: GRAPHS_SLOPES_PRESENTATION } =
  buildAppNativeLesson({
    id: 'V3-LES-844372',
    contentVersion: 'app-native-graphs-v1.0.0',
    slug: 'graphs-and-slopes',
    title: 'Interpret graph scales and slopes',
    internalTitle: 'Algebraic and graphical model translation · app-native candidate',
    subject: 'Chemical & physical foundations',
    description:
      'Read slopes as unit-bearing rates, interpret intercepts and signs, build lines from points, and recognize what a transformed axis reveals.',
    estimatedMinutes: 13,
    requiredKcs: [
      {
        id: SLOPE_KC,
        title: 'Interpret graph scales and slopes',
        learnerOutcome:
          'Interpret the slope and intercept of a graph, including units and transformed axes.',
        previewCoverage: 'complete-review-focus',
      },
      {
        id: 'V3-KC-008681',
        title: 'Solve algebraic systems',
        learnerOutcome: 'Recall that a line\u2019s equation supports algebraic solving.',
        previewCoverage: 'boundary-map-only',
      },
      {
        id: 'V3-KC-238607',
        title: 'Use logarithmic relationships',
        learnerOutcome: 'Recognize that log axes linearize exponential and power laws.',
        previewCoverage: 'boundary-map-only',
      },
    ],
    teachingObjective:
      'Given a graph or two points, compute and interpret the slope and intercept with correct units and account for transformed axes.',
    intro: {
      id: 'graph-intro',
      title: 'Interpret graph scales and slopes',
      outcome: 'Turn a line into a unit-bearing rate and interpret intercepts, signs, and transforms.',
      details: [
        'Compute slope as Δy/Δx, attach units, and check whether an axis is transformed before interpreting.',
      ],
      kcIds: [SLOPE_KC],
    },
    sections: [slopeSection],
    completion: {
      id: 'graph-complete',
      title: 'You can interpret graphs with confidence',
      summary:
        'You read slopes as rates with units, interpreted intercepts and signs, built lines from points, and decoded a transformed axis.',
      takeaways: [
        'Slope = Δy/Δx, and its units name the physical rate.',
        'The intercept is the y-value at x = 0; a steeper line means a larger rate.',
        'On a transformed axis, a straight line encodes a nonlinear relationship.',
      ],
      nextStep: 'Apply slope reading to kinetics, thermodynamics, and lab-data passages.',
      kcIds: [SLOPE_KC],
    },
  });

export { GRAPHS_SLOPES_SCRIPT, GRAPHS_SLOPES_PRESENTATION };
