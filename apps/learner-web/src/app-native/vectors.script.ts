import { buildAppNativeLesson, question, relations } from './authoring-helpers';
import type { LessonSectionAuthoring } from './section-authoring';

const VECTOR_KC = 'V3-KC-866848';

function componentMap(caption?: string) {
  return relations(
    'Resolving and recombining vector components',
    'A vector at an angle from the x-axis has an x-component of V cos theta and a y-component of V sin theta. Adding vectors means summing x-components and y-components separately, then recombining with the Pythagorean theorem and an arctangent.',
    [
      {
        label: 'Resolve (angle from x-axis)',
        nodes: [
          { label: 'x-component', detail: 'V cos θ (adjacent)', emphasis: 'active' },
          { label: 'y-component', detail: 'V sin θ (opposite)' },
        ],
        links: ['and'],
      },
      {
        label: 'Recombine',
        continuationLabel: 'sum components, then rebuild the vector',
        nodes: [
          { label: 'Σx, Σy', detail: 'add separately' },
          { label: 'magnitude', detail: '√(Σx² + Σy²)', emphasis: 'active' },
          { label: 'direction', detail: 'arctan(Σy/Σx)' },
        ],
        links: ['then', 'then'],
      },
    ],
    caption,
  );
}

const vectorSection: LessonSectionAuthoring = {
  key: 'vec-components',
  kcId: VECTOR_KC,
  stageLabel: 'Vector components',
  nextActionLabel: 'Finish the lesson',
  starting: question(
    'Find the horizontal component',
    'A 10 N force acts at 30° above the horizontal. What is its horizontal (x) component?',
    [
      ['10 cos30° ≈ 8.7 N', 'Correct. The x-component is adjacent to the angle from the x-axis, so it uses cosine.'],
      ['10 sin30° = 5 N', 'That is the vertical component; sine gives the side opposite the angle.'],
      ['10 tan30° ≈ 5.8 N', 'Tangent relates the two components to each other, not a component to the magnitude.'],
      ['10 N', 'The full magnitude only equals the x-component when the force is horizontal (0°).'],
    ],
    'A',
    'When the angle is measured from the x-axis, the x-component is the adjacent side: Vx = V cos θ = 10 cos30° ≈ 8.7 N.',
    'Which trig function pairs the component adjacent to the angle with the magnitude?',
    'Resolve every vector into perpendicular components before combining.',
    componentMap('Adjacent side uses cosine; opposite side uses sine.'),
  ),
  model: {
    title: 'Split, then add by direction',
    supportingLine: 'Perpendicular components do not interfere with each other.',
    explanation: [
      'A vector has both magnitude and direction. Resolving it means splitting it into perpendicular pieces along the axes. For an angle measured from the x-axis, Vx = V cos θ and Vy = V sin θ.',
      'To add vectors, sum their x-components and their y-components separately, because perpendicular directions are independent. Then rebuild the resultant: its magnitude is √(Σx² + Σy²) and its direction is arctan(Σy / Σx).',
    ],
    visual: componentMap('Resolve each vector, add components, then recombine.'),
    takeaway: 'Add vectors component-by-component; never add magnitudes at different angles directly.',
  },
  understandingCheck: question(
    'Find the vertical component',
    'For the same 10 N force at 30° above the horizontal, what is its vertical (y) component?',
    [
      ['10 sin30° = 5 N', 'Correct. The y-component is opposite the angle from the x-axis, so it uses sine.'],
      ['10 cos30° ≈ 8.7 N', 'That is the horizontal component; cosine gives the adjacent side.'],
      ['5.8 N', 'That comes from tangent, which is not how a component relates to the magnitude.'],
      ['10 N', 'The whole magnitude is not vertical unless the force points straight up.'],
    ],
    'A',
    'The vertical component is opposite the 30° angle, so Vy = V sin θ = 10 sin30° = 5 N.',
    'Opposite side of the angle uses sine.',
  ),
  worked: {
    title: 'Combine two perpendicular vectors',
    supportingLine: 'Use a 3-4-5 triangle to check yourself.',
    explanation: [
      'Suppose one displacement is 3 m east and another is 4 m north. They are already perpendicular, so Σx = 3 and Σy = 4.',
      'The magnitude is √(3² + 4²) = √25 = 5 m. The direction is arctan(4/3) ≈ 53° north of east. Component addition turns two vectors into one clean resultant.',
    ],
    visual: relations(
      'Adding 3 east and 4 north',
      'With x-sum 3 and y-sum 4, the resultant magnitude is 5 and the direction is about 53 degrees north of east.',
      [
        {
          label: 'Resultant',
          nodes: [
            { label: 'Σx = 3', detail: 'east' },
            { label: 'Σy = 4', detail: 'north' },
            { label: '|R| = 5', detail: '@ 53°', emphasis: 'active' },
          ],
          links: ['√(3²+4²)', 'arctan(4/3)'],
        },
      ],
    ),
    takeaway: 'What to notice: perpendicular components combine with the Pythagorean theorem, not by simple addition.',
  },
  guided: question(
    'Pick the right component',
    'A vector V makes angle θ with the x-axis. Which expression gives its component along the x-axis?',
    [
      ['V cos θ', 'Correct. The x-component is adjacent to θ, so it uses cosine.'],
      ['V sin θ', 'That is the y-component, opposite the angle from the x-axis.'],
      ['V tan θ', 'Tangent relates the two components, not a component to the magnitude.'],
      ['V / cos θ', 'Dividing overshoots the magnitude; the component is smaller than V, not larger.'],
    ],
    'A',
    'Measured from the x-axis, the adjacent component is V cos θ.',
    'Adjacent to the angle → cosine.',
  ),
  reducedSupport: question(
    'Resultant of perpendicular vectors',
    'A boat travels 6 km east and then 8 km north. How far is it from the start?',
    [
      ['10 km', 'Correct. √(6² + 8²) = √100 = 10 km.'],
      ['14 km', 'That adds the distances directly, ignoring that they are perpendicular.'],
      ['√(6² − 8²) km', 'Subtracting is not how perpendicular components combine.'],
      ['2 km', 'That would apply only if the legs were opposite along one line.'],
    ],
    'A',
    'The two legs are perpendicular, so the straight-line distance is √(6² + 8²) = 10 km.',
    'Perpendicular legs form a right triangle; use the hypotenuse.',
  ),
  independent: question(
    'Add along one line',
    'Two forces act on a cart along the same horizontal line: 5 N east and 3 N west. What is the net force?',
    [
      ['2 N east', 'Correct. Opposite directions subtract: 5 − 3 = 2 N toward the east.'],
      ['8 N east', 'Opposite directions do not add; they subtract.'],
      ['2 N west', 'The larger force (5 N) points east, so the net is eastward.'],
      ['0 N', 'The forces are unequal, so they do not cancel.'],
    ],
    'A',
    'Along one axis, assign signs by direction: +5 (east) and −3 (west) give a net +2 N, i.e., 2 N east.',
  ),
  near: question(
    'Resolve a different force',
    'A 20 N force acts at 60° above the horizontal. What is its vertical component? (sin60° ≈ 0.87)',
    [
      ['≈ 17 N', 'Correct. Vy = 20 sin60° ≈ 20 × 0.87 ≈ 17 N.'],
      ['10 N', 'That is 20 cos60°, the horizontal component.'],
      ['20 N', 'The full magnitude is vertical only for a straight-up force.'],
      ['≈ 35 N', 'A component can never exceed the magnitude of the vector.'],
    ],
    'A',
    'The vertical component is opposite the 60° angle from the x-axis: Vy = 20 sin60° ≈ 17 N.',
  ),
  changed: question(
    'Angle measured from the vertical',
    'A rope pulls with tension T at an angle θ measured from the vertical. What is the horizontal component of the tension?',
    [
      ['T sin θ', 'Correct. Measured from the vertical, the horizontal side is now opposite the angle, so it uses sine.'],
      ['T cos θ', 'From the vertical axis, cosine gives the vertical component, not the horizontal one.'],
      ['T tan θ', 'Tangent relates the two components, not a component to the tension.'],
      ['T', 'The full tension is horizontal only if the rope is horizontal (θ = 90°).'],
    ],
    'A',
    'The trig function depends on which axis the angle is measured from. From the vertical, the horizontal component is opposite the angle, so it is T sin θ (and the vertical component is T cos θ).',
  ),
  repair: {
    title: 'Set the axis, then match sine and cosine',
    supportingLine: 'The classic mistake is defaulting to cosine for x without checking the reference axis.',
    explanation: [
      'Draw the axes and mark which axis the angle is measured from. The component adjacent to the angle uses cosine; the opposite component uses sine.',
      'Add the x-components and y-components separately, keeping signs by direction. Recombine with magnitude √(Σx² + Σy²) and direction arctan(Σy / Σx).',
    ],
    visual: componentMap('Reference axis decides sine vs cosine; then add components with signs.'),
    strategy: 'Label the reference axis first, assign sine/cosine by adjacent vs opposite, then sum with signs.',
    checkYourThinking: 'Is the angle measured from the x-axis or the y-axis, and did you sign each direction?',
  },
  recap: {
    title: 'You can resolve and combine vectors',
    explanation: [
      'You split vectors into perpendicular components, added them by direction with correct signs, and rebuilt the resultant with the Pythagorean theorem and an arctangent. The same method handles forces, velocities, and displacements.',
    ],
    visual: componentMap('Resolve, add by axis, recombine — the universal vector routine.'),
    takeaway: 'Vectors add by components, and the reference axis decides which function is sine and which is cosine.',
  },
};

const { script: VECTORS_SCRIPT, presentation: VECTORS_PRESENTATION } = buildAppNativeLesson({
  id: 'V3-LES-130923',
  contentVersion: 'app-native-vectors-v1.0.0',
  slug: 'vectors-and-components',
  title: 'Resolve and combine vectors',
  internalTitle: 'Vectors, trigonometry, and directional rules · app-native candidate',
  subject: 'Chemical & physical foundations',
  description:
    'Resolve vectors into perpendicular components with sine and cosine, add them by direction, and recombine with the Pythagorean theorem.',
  estimatedMinutes: 13,
  requiredKcs: [
    {
      id: VECTOR_KC,
      title: 'Resolve and combine vectors',
      learnerOutcome:
        'Resolve a vector into components and combine multiple vectors into a single resultant.',
      previewCoverage: 'complete-review-focus',
    },
    {
      id: 'V3-KC-700208',
      title: 'Use basic trigonometry',
      learnerOutcome: 'Apply sine, cosine, and the Pythagorean theorem to right triangles.',
      previewCoverage: 'boundary-map-only',
    },
    {
      id: 'V3-KC-159529',
      title: 'Apply right-hand rules',
      learnerOutcome: 'Recognize that directional cross-product rules build on vector reasoning.',
      previewCoverage: 'boundary-map-only',
    },
  ],
  teachingObjective:
    'Given vectors described by magnitude and angle, resolve them into components and compute the magnitude and direction of their resultant.',
  intro: {
    id: 'vec-intro',
    title: 'Resolve and combine vectors',
    outcome: 'Turn magnitudes and angles into components, then combine them into one resultant.',
    details: [
      'Use sine and cosine to resolve vectors, add them by direction, and rebuild the resultant.',
    ],
    kcIds: [VECTOR_KC],
  },
  sections: [vectorSection],
  completion: {
    id: 'vec-complete',
    title: 'You can work vectors by components',
    summary:
      'You resolved vectors with sine and cosine, added them component-by-component with signs, and recombined them into a magnitude and direction.',
    takeaways: [
      'The component adjacent to the angle uses cosine; the opposite uses sine.',
      'Add x-components and y-components separately, keeping signs by direction.',
      'Recombine with magnitude √(Σx² + Σy²) and direction arctan(Σy/Σx).',
    ],
    nextStep: 'Apply component reasoning to forces and motion in later physics lessons.',
    kcIds: [VECTOR_KC],
  },
});

export { VECTORS_SCRIPT, VECTORS_PRESENTATION };
