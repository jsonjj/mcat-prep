import {
  Button,
  Callout,
  CollapsibleSection,
  Divider,
  H1,
  H2,
  Link,
  Pill,
  Row,
  Spacer,
  Stack,
  Table,
  Text,
  UsageBar,
  useCanvasState,
  useHostTheme,
  type SetCanvasState,
} from 'cursor/canvas';
import { Children, isValidElement, useEffect, type ReactNode } from 'react';

type Option = {
  id: string;
  text: string;
  rationale: string;
  feature: ResponseFeature;
  featureSource: 'authored' | 'inferred';
};

type ResponseFeature =
  | 'correct-model'
  | 'angle-reference'
  | 'ray-transform'
  | 'model-selection'
  | 'equation-operation'
  | 'index-direction'
  | 'threshold-direction'
  | 'dispersion-order'
  | 'sign-location'
  | 'power-units'
  | 'stage-ledger'
  | 'ray-state'
  | 'non-targetable';

type Item = {
  id: string;
  family: string;
  stage: string;
  duration: string;
  prompt: string;
  key: string;
  cue: string;
  options: Option[];
};

type Worked = {
  problem: string;
  cue: string;
  principle: string;
  operation: string[];
  check: string;
};

type Repair = {
  title: string;
  focus: string;
  teaching: string;
  item: Item;
  reentry: string;
  targetFeatures: ResponseFeature[];
};

type ExitSet = {
  label: string;
  near: Item;
  changed: Item;
};

type Kc = {
  number: number;
  id: string;
  short: string;
  title: string;
  claim: string;
  objective: string;
  concise: string;
  standard: string;
  repairRelation: string;
  entry: Item;
  disambiguator: Item;
  prediction: Item;
  model: string[];
  targetedContrastByFeature: Partial<Record<ResponseFeature, string>>;
  diagram: 'reflection' | 'refraction' | 'mirror' | 'lens' | 'compound';
  worked: Worked;
  practice: [Item, Item, Item];
  recovery: [Item, Item];
  contrast: string[];
  exits: [ExitSet, ExitSet, ExitSet];
  repairs: [Repair, Repair];
  handoff: string;
};

type ResponseRecord = {
  selection: string;
  committed: boolean;
  correct: boolean;
  assisted: boolean;
  kind: 'answer' | 'not_sure' | 'omission' | 'invalid';
};

type ResponseMap = Record<string, ResponseRecord>;
type BoolMap = Record<string, boolean>;
type StringMap = Record<string, string>;
type NumberMap = Record<string, number>;
type KcStatus = 'not_started' | 'in_progress' | 'simulated_complete' | 'paused';
type StatusMap = Record<string, KcStatus>;
type FamilyExposureMap = Record<string, string[]>;

const LETTERS = ['A', 'B', 'C', 'D'];
const STATE_SCHEMA_VERSION = 'optics-state-v6';
const CONTENT_VERSION = 'V3-LES-443492.canvas-internal-review.2.4.0';
const RUN_VERSION = 'quality-review-run-v3';
const STATE_NAMESPACE = `${STATE_SCHEMA_VERSION}:${CONTENT_VERSION}:${RUN_VERSION}`;
const stateKey = (name: string) => `${STATE_NAMESPACE}:${name}`;
const INITIAL_RUN_ID = 'review-run-001';

type EventRecord = {
  sequence: number;
  runId: string;
  type: string;
  kcId?: string;
  itemId?: string;
  family?: string;
  feature?: string;
  note: string;
  simulationOnly: true;
  contaminated: boolean;
};

type EventInput = Omit<EventRecord, 'sequence' | 'runId' | 'simulationOnly' | 'contaminated'>;

type CapstonePlacementReference = {
  id: 'V3-CAP-081516';
  placement: 'R14-CAP-081516';
  launchBehavior: 'separate-artifact-required';
  hardEdges: Array<{ edgeId: string; sourceKc: string }>;
  nonblockingEdges: Array<{ edgeId: string; sourceKc: string; semantics: string }>;
  lessonMayLaunch: false;
};

const TARGETABLE_FEATURES: ResponseFeature[] = [
  'angle-reference',
  'ray-transform',
  'model-selection',
  'equation-operation',
  'index-direction',
  'threshold-direction',
  'dispersion-order',
  'sign-location',
  'power-units',
  'stage-ledger',
  'ray-state',
];

const AUTHORED_RESPONSE_FEATURES: Record<
  string,
  [ResponseFeature, ResponseFeature, ResponseFeature, ResponseFeature]
> = {
  'K1-E1': ['correct-model', 'angle-reference', 'model-selection', 'angle-reference'],
  'K1-D1': ['angle-reference', 'correct-model', 'model-selection', 'angle-reference'],
  'K1-P1': ['correct-model', 'ray-transform', 'ray-transform', 'ray-transform'],
  'K1-A2': ['correct-model', 'ray-transform', 'ray-transform', 'ray-transform'],
  'K1-A1': ['correct-model', 'ray-transform', 'ray-transform', 'ray-transform'],
  'K1-A0': ['model-selection', 'model-selection', 'correct-model', 'model-selection'],
  'K1-X1': ['correct-model', 'ray-transform', 'ray-transform', 'ray-transform'],
  'K1-X2': ['model-selection', 'model-selection', 'correct-model', 'model-selection'],
  'K1-R1X1': ['correct-model', 'ray-transform', 'ray-transform', 'ray-transform'],
  'K1-R1X2': ['model-selection', 'correct-model', 'model-selection', 'model-selection'],
  'K1-R2X1': ['correct-model', 'ray-transform', 'ray-transform', 'ray-transform'],
  'K1-R2X2': ['model-selection', 'model-selection', 'correct-model', 'model-selection'],
  'K1-R1': ['angle-reference', 'correct-model', 'model-selection', 'angle-reference'],
  'K1-R2': ['correct-model', 'model-selection', 'model-selection', 'model-selection'],

  'K2-E1': ['angle-reference', 'correct-model', 'model-selection', 'angle-reference'],
  'K2-D1': ['threshold-direction', 'index-direction', 'correct-model', 'model-selection'],
  'K2-P1': ['correct-model', 'index-direction', 'model-selection', 'threshold-direction'],
  'K2-A2': ['correct-model', 'model-selection', 'equation-operation', 'threshold-direction'],
  'K2-A1': ['index-direction', 'model-selection', 'correct-model', 'threshold-direction'],
  'K2-A0': ['correct-model', 'dispersion-order', 'model-selection', 'threshold-direction'],
  'K2-X1': ['correct-model', 'index-direction', 'index-direction', 'threshold-direction'],
  'K2-X2': ['threshold-direction', 'threshold-direction', 'correct-model', 'dispersion-order'],
  'K2-R1X1': ['correct-model', 'index-direction', 'index-direction', 'threshold-direction'],
  'K2-R1X2': ['threshold-direction', 'threshold-direction', 'correct-model', 'dispersion-order'],
  'K2-R2X1': ['correct-model', 'index-direction', 'index-direction', 'threshold-direction'],
  'K2-R2X2': ['correct-model', 'index-direction', 'threshold-direction', 'dispersion-order'],
  'K2-R1': ['angle-reference', 'angle-reference', 'correct-model', 'model-selection'],
  'K2-R2': ['correct-model', 'threshold-direction', 'index-direction', 'threshold-direction'],

  'K3-E1': ['sign-location', 'correct-model', 'sign-location', 'model-selection'],
  'K3-D1': ['sign-location', 'correct-model', 'model-selection', 'model-selection'],
  'K3-P1': ['correct-model', 'sign-location', 'sign-location', 'sign-location'],
  'K3-A2': ['correct-model', 'sign-location', 'equation-operation', 'equation-operation'],
  'K3-A1': ['correct-model', 'sign-location', 'equation-operation', 'sign-location'],
  'K3-A0': ['correct-model', 'sign-location', 'model-selection', 'model-selection'],
  'K3-X1': ['correct-model', 'sign-location', 'equation-operation', 'equation-operation'],
  'K3-X2': ['correct-model', 'sign-location', 'equation-operation', 'sign-location'],
  'K3-R1X1': ['correct-model', 'sign-location', 'equation-operation', 'equation-operation'],
  'K3-R1X2': ['correct-model', 'sign-location', 'equation-operation', 'sign-location'],
  'K3-R2X1': ['correct-model', 'equation-operation', 'sign-location', 'equation-operation'],
  'K3-R2X2': ['correct-model', 'sign-location', 'equation-operation', 'sign-location'],
  'K3-R1': ['correct-model', 'sign-location', 'equation-operation', 'sign-location'],
  'K3-R2': ['correct-model', 'sign-location', 'equation-operation', 'model-selection'],

  'K4-E1': ['power-units', 'correct-model', 'model-selection', 'model-selection'],
  'K4-D1': ['sign-location', 'correct-model', 'model-selection', 'model-selection'],
  'K4-P1': ['correct-model', 'sign-location', 'sign-location', 'ray-state'],
  'K4-A2': ['correct-model', 'sign-location', 'equation-operation', 'equation-operation'],
  'K4-A1': ['correct-model', 'power-units', 'power-units', 'sign-location'],
  'K4-A0': ['correct-model', 'sign-location', 'equation-operation', 'model-selection'],
  'K4-X1': ['correct-model', 'power-units', 'power-units', 'sign-location'],
  'K4-X2': ['correct-model', 'sign-location', 'sign-location', 'sign-location'],
  'K4-R1X1': ['correct-model', 'power-units', 'power-units', 'sign-location'],
  'K4-R1X2': ['correct-model', 'sign-location', 'equation-operation', 'model-selection'],
  'K4-R2X1': ['correct-model', 'power-units', 'power-units', 'sign-location'],
  'K4-R2X2': ['correct-model', 'sign-location', 'equation-operation', 'equation-operation'],
  'K4-R1': ['correct-model', 'power-units', 'power-units', 'sign-location'],
  'K4-R2': ['correct-model', 'sign-location', 'equation-operation', 'sign-location'],

  'K5-E1': ['correct-model', 'sign-location', 'equation-operation', 'equation-operation'],
  'K5-E1b': ['correct-model', 'sign-location', 'equation-operation', 'equation-operation'],
  'K5-P1': ['ray-state', 'correct-model', 'stage-ledger', 'stage-ledger'],
  'K5-A2': ['correct-model', 'stage-ledger', 'sign-location', 'ray-state'],
  'K5-A1': ['correct-model', 'ray-state', 'stage-ledger', 'stage-ledger'],
  'K5-A0': ['correct-model', 'sign-location', 'stage-ledger', 'ray-state'],
  'K5-X1': ['correct-model', 'stage-ledger', 'sign-location', 'ray-state'],
  'K5-X2': ['correct-model', 'stage-ledger', 'ray-state', 'stage-ledger'],
  'K5-R1X1': ['correct-model', 'stage-ledger', 'sign-location', 'ray-state'],
  'K5-R1X2': ['correct-model', 'ray-state', 'sign-location', 'stage-ledger'],
  'K5-R2X1': ['correct-model', 'stage-ledger', 'sign-location', 'ray-state'],
  'K5-R2X2': ['correct-model', 'equation-operation', 'stage-ledger', 'ray-state'],
  'K5-R1': ['ray-state', 'correct-model', 'stage-ledger', 'stage-ledger'],
  'K5-R2': ['correct-model', 'stage-ledger', 'ray-state', 'stage-ledger'],

  'K4K5-BRIDGE-CHECK-01': [
    'correct-model',
    'sign-location',
    'equation-operation',
    'equation-operation',
  ],
  'K4K5-BRIDGE-CHECK-REPLACEMENT-01': [
    'equation-operation',
    'correct-model',
    'sign-location',
    'equation-operation',
  ],
  'K4K5-BRIDGE-REENTRY-01': [
    'correct-model',
    'sign-location',
    'equation-operation',
    'equation-operation',
  ],
  'K4K5-BRIDGE-REENTRY-REPLACEMENT-01': [
    'sign-location',
    'equation-operation',
    'correct-model',
    'equation-operation',
  ],
  'EXT-P1': ['correct-model', 'model-selection', 'model-selection', 'model-selection'],
  'EXT-A0': ['correct-model', 'power-units', 'equation-operation', 'power-units'],
};

let itemKeySequence = 0;

function makeItem(config: {
  id: string;
  family: string;
  stage: string;
  duration?: string;
  prompt: string;
  key: string;
  cue: string;
  choices: Array<[string, string, ResponseFeature?]>;
}): Item {
  const originalKeyIndex = LETTERS.indexOf(config.key);
  const desiredKeyIndex = itemKeySequence % LETTERS.length;
  itemKeySequence += 1;
  const offset = (originalKeyIndex - desiredKeyIndex + LETTERS.length) % LETTERS.length;
  const rawOptions = config.choices.map((choice, index) => ({
    text: choice[0],
    rationale: choice[1],
    feature: choice[2] ?? AUTHORED_RESPONSE_FEATURES[config.id]?.[index] ?? 'non-targetable',
    featureSource:
      choice[2] !== undefined || AUTHORED_RESPONSE_FEATURES[config.id] !== undefined
        ? ('authored' as const)
        : ('inferred' as const),
    originalIndex: index,
  }));
  const rotated = rawOptions.map((_, index) => rawOptions[(index + offset) % rawOptions.length]);
  const newKeyIndex = rotated.findIndex((option) => option.originalIndex === originalKeyIndex);
  return {
    id: config.id,
    family: config.family,
    stage: config.stage,
    duration: config.duration ?? '60 s',
    prompt: config.prompt,
    key: LETTERS[newKeyIndex],
    cue: config.cue,
    options: rotated.map((choice, index) => ({
      id: LETTERS[index],
      text: choice.text,
      rationale: choice.rationale,
      feature: choice.feature,
      featureSource: choice.featureSource,
    })),
  };
}

const KCS: Kc[] = [
  {
    number: 1,
    id: 'V3-KC-599193',
    short: 'KC 1',
    title: 'Plane reflection',
    claim: 'Apply equality of incidence and reflection angles to ray paths.',
    objective:
      'Given a flat reflector and an incoming ray, I can draw the normal, predict the reflected path, and locate a plane-mirror image without measuring from the surface by mistake.',
    concise: '8 min',
    standard: '12 min',
    repairRelation: 'R14-REM-CP-117',
    entry: makeItem({
      id: 'K1-E1',
      family: 'K1-entry-normal',
      stage: 'Entry route',
      duration: '30 s',
      prompt: 'A ray strikes a horizontal mirror at point P. Which line is the normal?',
      key: 'A',
      cue: 'The normal is perpendicular to the surface at the contact point.',
      choices: [
        ['The vertical line through P', 'It is perpendicular to the horizontal surface at P.'],
        ['The mirror itself', 'That is the surface, not the normal.'],
        [
          'The incoming ray',
          'The ray direction changes from problem to problem; the normal is fixed by the surface.',
        ],
        ['A line fixed at 45°', 'That line is normal only for one special surface orientation.'],
      ],
    }),
    disambiguator: makeItem({
      id: 'K1-D1',
      family: 'K1-entry-angle-reference',
      stage: 'Entry disambiguator',
      duration: '30 s',
      prompt: 'The ray is 25° above the mirror surface. What is its angle of incidence?',
      key: 'B',
      cue: 'Convert a surface angle to a normal angle by subtracting from 90°.',
      choices: [
        ['25°', 'This is measured from the surface.'],
        ['65°', '90° − 25° = 65°, measured from the normal.'],
        ['90°', 'This ignores the ray’s direction.'],
        ['115°', 'This lies outside the acute ray-angle convention used here.'],
      ],
    }),
    prediction: makeItem({
      id: 'K1-P1',
      family: 'K1-predict-vector',
      stage: 'Prediction',
      duration: '45 s',
      prompt:
        'Mirror y = 0. A ray travels from A = (−3, 4) to P = (0, 0). Which point lies on the reflected ray?',
      key: 'A',
      cue: 'Reflect the incoming direction across the normal.',
      choices: [
        [
          '(3, 4)',
          'Reflection preserves the horizontal component and reverses the vertical component.',
        ],
        ['(−3, 4)', 'That would retrace the ray without a corner reflector.'],
        ['(4, 3)', 'This swaps components and changes the angle from the normal.'],
        ['(3, −4)', 'That continues through the mirror instead of reflecting.'],
      ],
    }),
    model: [
      'At the contact point, draw a normal. Measure both angles from that normal. A flat mirror preserves the component parallel to the surface and reverses the perpendicular component, so θr = θi.',
      'To locate an image, extend at least two reflected rays backward with dashed lines. Light does not travel behind the mirror, but it behaves as though it came from the dashed-line intersection.',
      'A point and its plane-mirror image are equally far from the mirror on opposite sides. The image is virtual and upright.',
    ],
    targetedContrastByFeature: {
      'angle-reference':
        'The law compares ray-to-normal angles, not ray-to-surface angles. Convert a supplied surface angle with 90° − θsurface before applying θr = θi.',
    },
    diagram: 'reflection',
    worked: {
      problem:
        'A point source is at (−4, 3), an observer at (6, 4), and the mirror is y = 0. Where must the ray reflect?',
      cue: 'The path must connect a source and observer using one plane reflection.',
      principle: 'Replace the reflected path by a straight path from the source’s virtual image.',
      operation: [
        'Reflect S = (−4, 3) across y = 0 to obtain S′ = (−4, −3).',
        'The line from S′ to O is (−4, −3) + t(10, 7).',
        'Set y = 0: −3 + 7t = 0, so t = 3/7.',
        'x = −4 + 10(3/7) = 2/7. Therefore P = (2/7, 0).',
      ],
      check:
        'The incoming and outgoing horizontal-to-vertical ratios are both 10/7. Both angles from the normal are about 55.0°.',
    },
    practice: [
      makeItem({
        id: 'K1-A2',
        family: 'K1-guided-component',
        stage: 'A2 guided practice',
        prompt:
          'Vertical mirror x = 0; ray A = (−5, 2) → P = (0, 0). Which endpoint is one equal-length reflected step later?',
        key: 'A',
        cue: 'Reverse only the component normal to x = 0.',
        choices: [
          ['(−5, −2)', 'The x component reverses and the y component is preserved.'],
          ['(5, −2)', 'This continues through the mirror.'],
          ['(−2, −5)', 'This swaps components.'],
          ['(−5, 2)', 'This retraces the incident segment without a corner reflector.'],
        ],
      }),
      makeItem({
        id: 'K1-A1',
        family: 'K1-cued-coordinate',
        stage: 'A1 cued practice',
        prompt:
          'Mirror y = 0; A = (−1, 3) → P = (2, 0). Keep the +3 horizontal change and reverse the −3 vertical change. Endpoint?',
        key: 'A',
        cue: 'Preserve the parallel component; reverse the normal component.',
        choices: [
          ['(5, 3)', 'The reflected direction change is (+3, +3).'],
          ['(−1, −3)', 'This reverses both components.'],
          ['(5, −3)', 'This transmits through the mirror.'],
          ['(−1, 3)', 'This returns to the source.'],
        ],
      }),
      makeItem({
        id: 'K1-A0',
        family: 'K1-independent-observer',
        stage: 'A0 independent practice',
        duration: '75 s',
        prompt: 'Mirror y = 0; source (−3, 2), observer (5, 2). What is the reflection point?',
        key: 'C',
        cue: 'Reflect the source, then draw one straight line.',
        choices: [
          ['(−1, 0)', 'This crossing does not give equal normal angles.'],
          ['(0, 0)', 'This crossing does not bisect the straightened path.'],
          [
            '(1, 0)',
            'The line from virtual source (−3, −2) to observer (5, 2) crosses y = 0 at x = 1.',
          ],
          ['(2, 0)', 'This crossing does not give equal normal angles.'],
        ],
      }),
    ],
    recovery: [
      makeItem({
        id: 'K1-A2-RECOVERY',
        family: 'K1-a2-supported-recovery-fresh-v1',
        stage: 'Fresh supported A2 recovery',
        prompt:
          'Mirror y = 0; a ray travels from (−6, 8) to (0, 0). Which equal-length endpoint lies on the reflected ray?',
        key: 'A',
        cue: 'Keep the +6 horizontal change and reverse the −8 vertical change.',
        choices: [
          ['(6, 8)', 'The reflected direction is (+6,+8).', 'correct-model'],
          ['(−6, 8)', 'This retraces the incident segment.', 'ray-transform'],
          ['(8, 6)', 'This swaps the direction components.', 'ray-transform'],
          ['(6, −8)', 'This continues through the mirror.', 'ray-transform'],
        ],
      }),
      makeItem({
        id: 'K1-A1-RECOVERY',
        family: 'K1-a1-supported-recovery-fresh-v1',
        stage: 'Fresh supported A1 recovery',
        prompt: 'Mirror y = 0; source (−4,1), observer (4,3). What is the reflection x-coordinate?',
        key: 'A',
        cue: 'Reflect the source to (−4,−1); the straight line reaches y = 0 one-quarter of the way to the observer.',
        choices: [
          [
            '−2',
            'One-quarter of the 8-unit horizontal change places the crossing at x = −2.',
            'correct-model',
          ],
          ['0', 'The crossing is not the segment midpoint.', 'model-selection'],
          ['+1', 'This does not lie on the straightened source-image path.', 'model-selection'],
          ['+2', 'This places the crossing too far toward the observer.', 'model-selection'],
        ],
      }),
    ],
    contrast: [
      'An angle reported from the surface is complementary to the angle used in the law.',
      'A plane mirror forms no real image behind itself; dashed extensions—not physical rays—meet there.',
      'A single flat mirror does not automatically send a ray back to its source.',
      'Diffuse reflection obeys the same local law, but local normals vary across a rough surface.',
    ],
    exits: [
      {
        label: 'Independent simulation pair',
        near: makeItem({
          id: 'K1-X1',
          family: 'K1-exit-near',
          stage: 'Exit · near use',
          prompt: 'Mirror y = 0; ray (−4, 3) → (0, 0). Which point is on the reflected ray?',
          key: 'A',
          cue: 'Reflect the direction vector across the normal.',
          choices: [
            ['(4, 3)', 'This preserves the parallel component and reverses the normal component.'],
            ['(−4, 3)', 'This is unjustified retracing.'],
            ['(3, 4)', 'This changes the normal angle.'],
            ['(4, −3)', 'This is transmission.'],
          ],
        }),
        changed: makeItem({
          id: 'K1-X2',
          family: 'K1-exit-observer-vertical',
          stage: 'Exit · changed representation',
          duration: '90 s',
          prompt:
            'Vertical mirror x = 0; source (−2, 1), observer (−6, 3). At what y-coordinate does the ray reflect?',
          key: 'C',
          cue: 'Reflect the source across x = 0.',
          choices: [
            ['0.5', 'This is not the crossing of the straightened path.'],
            ['1.0', 'This leaves the reflection point level with the source.'],
            [
              '1.5',
              'The line from virtual source (2, 1) to (−6, 3) reaches x = 0 one-quarter of the way, at y = 1.5.',
            ],
            ['2.0', 'This is not the straightened-path crossing.'],
          ],
        }),
      },
      {
        label: 'Fresh pair for repair branch A',
        near: makeItem({
          id: 'K1-R1X1',
          family: 'K1-repair1-exit-vector',
          stage: 'Fresh exit · near use',
          prompt: 'Mirror y = 0; ray (−5, 12) → (0, 0). Which endpoint lies on the reflected ray?',
          key: 'A',
          cue: 'Reverse only the component normal to the mirror.',
          choices: [
            ['(5, 12)', 'The outgoing direction is (+5, +12).'],
            ['(−5, 12)', 'This retraces without justification.'],
            ['(12, 5)', 'This swaps components.'],
            ['(5, −12)', 'This transmits.'],
          ],
        }),
        changed: makeItem({
          id: 'K1-R1X2',
          family: 'K1-repair1-exit-observer',
          stage: 'Fresh exit · changed representation',
          prompt:
            'Vertical mirror; source (−3, 0), observer (−5, 4). What is the reflection height?',
          key: 'B',
          cue: 'Use the virtual source at (3, 0).',
          choices: [
            ['1.0', 'This is below the straightened-path crossing.'],
            ['1.5', 'The line from (3, 0) to (−5, 4) reaches x = 0 at y = 1.5.'],
            ['2.0', 'This is the midpoint height, but x = 0 is not the segment midpoint.'],
            ['2.5', 'This is above the crossing.'],
          ],
        }),
      },
      {
        label: 'Fresh pair for repair branch B',
        near: makeItem({
          id: 'K1-R2X1',
          family: 'K1-repair2-exit-vector',
          stage: 'Fresh exit · near use',
          prompt: 'Mirror y = 0; ray (−8, 6) → (0, 0). Which endpoint lies on the reflected ray?',
          key: 'A',
          cue: 'Preserve x direction; reverse y direction.',
          choices: [
            ['(8, 6)', 'The reflected direction is (+8, +6).'],
            ['(−8, 6)', 'This is unjustified retracing.'],
            ['(6, 8)', 'This swaps components.'],
            ['(8, −6)', 'This transmits.'],
          ],
        }),
        changed: makeItem({
          id: 'K1-R2X2',
          family: 'K1-repair2-exit-observer',
          stage: 'Fresh exit · changed representation',
          prompt:
            'Mirror y = 0; source (1, 3), observer (7, 1). What is the reflection x-coordinate?',
          key: 'C',
          cue: 'Reflect the source to (1, −3), then find the y = 0 crossing.',
          choices: [
            ['4.0', 'This is too far left.'],
            ['5.0', 'This does not lie on the source-image-to-observer line at y = 0.'],
            [
              '5.5',
              'The line rises 4 units while moving 6; y = 0 occurs 3/4 of the way, at x = 5.5.',
            ],
            ['6.0', 'This is too far right.'],
          ],
        }),
      },
    ],
    repairs: [
      {
        title: 'Repair branch A · Angle reference',
        focus: 'Measure from the normal',
        targetFeatures: ['angle-reference', 'ray-transform', 'equation-operation'],
        teaching:
          'Pause at the point of contact. The law compares ray-to-normal angles, not ray-to-surface angles.',
        item: makeItem({
          id: 'K1-R1',
          family: 'K1-repair-angle-reference',
          stage: 'Repair 1 support',
          prompt: 'A ray is 32° from the mirror surface. What angle is measured from the normal?',
          key: 'B',
          cue: 'The surface and normal are perpendicular.',
          choices: [
            ['32°', 'This repeats the surface angle.'],
            ['58°', '90° − 32° = 58°.'],
            ['90°', 'This ignores the ray.'],
            ['122°', 'This lies outside the acute convention.'],
          ],
        }),
        reentry: 'Use the K1 branch-A fresh near-use and observer-location pair.',
      },
      {
        title: 'Repair branch B · Virtual construction',
        focus: 'Separate rays from extensions',
        targetFeatures: ['sign-location', 'model-selection'],
        teaching:
          'A virtual image is a geometric source for backward extensions, not a place reached by reflected light.',
        item: makeItem({
          id: 'K1-R2',
          family: 'K1-repair-virtual-image',
          stage: 'Repair 2 support',
          prompt:
            'Point (−4, 2) is reflected across the vertical mirror x = 0. Where is its virtual image?',
          key: 'A',
          cue: 'Keep y and reverse the signed perpendicular distance.',
          choices: [
            ['(4, 2)', 'It is equally far on the opposite side of x = 0.'],
            ['(−4, −2)', 'This reflects across the horizontal axis.'],
            ['(4, −2)', 'This changes both coordinates.'],
            ['(0, 2)', 'This places the image on the mirror.'],
          ],
        }),
        reentry:
          'Use the K1 branch-B fresh simulation pair; stop after this cycle if it does not pass.',
      },
    ],
    handoff:
      'You can now preserve an angle at a flat reflector. Next, the path may cross the boundary rather than bounce.',
  },
  {
    number: 2,
    id: 'V3-KC-493500',
    short: 'KC 2',
    title: 'Refraction, dispersion, and TIR',
    claim:
      'Use refractive index, Snell’s law, wavelength-dependent index, and critical conditions.',
    objective:
      'I can use the normal, index order, Snell’s law, wavelength-dependent index, and the critical condition to decide whether a ray bends, separates by wavelength, or remains inside.',
    concise: '11 min',
    standard: '17 min',
    repairRelation: 'R14-REM-CP-100',
    entry: makeItem({
      id: 'K2-E1',
      family: 'K2-entry-angle-reference',
      stage: 'Entry route',
      prompt: 'A ray is drawn 20° above an interface. What angle belongs in Snell’s law?',
      key: 'B',
      cue: 'Subtract the surface angle from 90°.',
      choices: [
        ['20°', 'This is measured from the interface.'],
        ['70°', 'Snell’s-law angles are measured from the normal: 90° − 20°.'],
        ['90°', 'This ignores the ray direction.'],
        ['110°', 'This lies outside the acute ray-angle convention.'],
      ],
    }),
    disambiguator: makeItem({
      id: 'K2-D1',
      family: 'K2-entry-tir-direction',
      stage: 'Entry disambiguator',
      prompt:
        'Light travels from air, n = 1.00, into glass, n = 1.50, at 60°. Can total internal reflection occur?',
      key: 'C',
      cue: 'TIR requires travel from higher index to lower index.',
      choices: [
        ['Yes, because the incident angle is large', 'Angle alone is insufficient.'],
        ['Yes, because glass has larger n', 'This reverses the direction condition.'],
        ['No, because the ray enters the higher-index medium', 'TIR requires n1 > n2.'],
        [
          'No, because reflection never occurs at transparent boundaries',
          'Partial reflection can occur; the statement is too broad.',
        ],
      ],
    }),
    prediction: makeItem({
      id: 'K2-P1',
      family: 'K2-predict-index-order',
      stage: 'Prediction',
      prompt: 'Air n1 = 1.00 to glass n2 = 1.50 at θ1 = 40°. What happens?',
      key: 'A',
      cue: 'Compare n2 with n1.',
      choices: [
        ['Toward the normal; θ2 < 40°', 'Higher n means lower speed and a smaller normal angle.'],
        ['Away from the normal; θ2 > 40°', 'This reverses the index order.'],
        ['Straight; θ2 = 40°', 'This occurs at normal incidence or equal indices, not here.'],
        ['TIR', 'TIR cannot occur from lower to higher index.'],
      ],
    }),
    model: [
      'Draw the normal before using numbers. Entering a higher-index medium bends the ray toward the normal; entering a lower-index medium bends it away.',
      'Use n1 sin θ1 = n2 sin θ2. At an interface frequency stays fixed while speed and wavelength change; λ2/λ1 = n1/n2.',
      'For high-to-low travel, θc = sin⁻¹(n2/n1). Equality is grazing transmission; TIR requires θi > θc.',
      'In ordinary visible dispersion, the larger violet index gives a smaller internal angle than red and usually greater prism deviation.',
    ],
    targetedContrastByFeature: {
      'threshold-direction':
        'A large incidence angle alone is not enough for TIR. Verify high-to-low index order first, then require θi > θc; equality is grazing transmission.',
    },
    diagram: 'refraction',
    worked: {
      problem: 'Acrylic n1 = 1.50 to air n2 = 1.00 at θ1 = 30.0°. Find the transmitted angle.',
      cue: 'This is high-to-low travel, so check TIR before solving for transmission.',
      principle: 'θc = sin⁻¹(1.00/1.50) = 41.8°.',
      operation: [
        '30.0° < 41.8°, so refraction occurs.',
        'sin θ2 = 1.50 sin 30.0° = 0.750.',
        'θ2 = sin⁻¹(0.750) = 48.6°.',
      ],
      check:
        'The ray bends away from the normal, so 48.6° > 30.0°, and the sine input is physical.',
    },
    practice: [
      makeItem({
        id: 'K2-A2',
        family: 'K2-guided-snell',
        stage: 'A2 guided practice',
        prompt: 'Air 1.00 to liquid 1.40 at 30.0°. Complete θ2 = sin⁻¹[(1.00/1.40) sin 30.0°].',
        key: 'A',
        cue: 'Use n1/n2, not n2/n1.',
        choices: [
          ['20.9°', 'The calculation gives sin⁻¹(0.3571) = 20.9°.'],
          ['30.0°', 'This assumes no index change.'],
          ['44.4°', 'This inverts the index ratio.'],
          ['TIR', 'TIR is impossible for low-to-high travel.'],
        ],
      }),
      makeItem({
        id: 'K2-A1',
        family: 'K2-cued-snell',
        stage: 'A1 cued practice',
        prompt:
          'Water 1.33 to air 1.00 at 30.0°. High-to-low means the angle should grow. What is θ2?',
        key: 'C',
        cue: 'First confirm 30.0° is below the 48.8° critical angle.',
        choices: [
          ['22.1°', 'This bends toward the normal.'],
          ['30.0°', 'This ignores the index change.'],
          ['41.7°', 'sin θ2 = 1.33 sin 30.0° gives 41.7°.'],
          ['TIR', '30.0° is below the critical angle.'],
        ],
      }),
      makeItem({
        id: 'K2-A0',
        family: 'K2-independent-dispersion',
        stage: 'A0 independent practice',
        duration: '75 s',
        prompt:
          'Air to polymer at 45.0°, with nR = 1.500 and nV = 1.530. Which internal angles are correct?',
        key: 'A',
        cue: 'Calculate each wavelength with its own index.',
        choices: [
          [
            'Red 28.1°, violet 27.5°',
            'The larger violet index produces the smaller internal angle.',
          ],
          ['Red 27.5°, violet 28.1°', 'This reverses normal dispersion.'],
          ['Both 45.0°', 'This ignores refraction.'],
          ['Red undergoes TIR', 'TIR cannot occur entering the material.'],
        ],
      }),
    ],
    recovery: [
      makeItem({
        id: 'K2-A2-RECOVERY',
        family: 'K2-a2-supported-recovery-fresh-v1',
        stage: 'Fresh supported A2 recovery',
        prompt: 'Air n1 = 1.00 enters glass n2 = 1.50 at 30.0° from the normal. What is θ2?',
        key: 'A',
        cue: 'Use sin θ2 = (1.00/1.50) sin 30.0°.',
        choices: [
          ['19.5°', 'sin⁻¹(1/3) = 19.5°, toward the normal.', 'correct-model'],
          ['30.0°', 'This ignores the index change.', 'index-direction'],
          ['48.6°', 'This reverses the index ratio.', 'equation-operation'],
          ['TIR', 'TIR cannot occur from lower to higher index.', 'threshold-direction'],
        ],
      }),
      makeItem({
        id: 'K2-A1-RECOVERY',
        family: 'K2-a1-supported-recovery-fresh-v1',
        stage: 'Fresh supported A1 recovery',
        prompt: 'Water n1 = 1.33 enters air n2 = 1.00 at 35.0° from the normal. What occurs?',
        key: 'A',
        cue: '35.0° is below water’s 48.8° critical angle; then use Snell’s law.',
        choices: [
          [
            'Refraction at 49.7°',
            'sin θ2 = 1.33 sin 35.0°, giving 49.7° away from the normal.',
            'correct-model',
          ],
          ['Refraction at 25.5°', 'This bends toward the normal.', 'index-direction'],
          ['Refraction at 35.0°', 'This ignores the index change.', 'model-selection'],
          ['TIR', 'The incident angle is below the critical angle.', 'threshold-direction'],
        ],
      }),
    ],
    contrast: [
      'Normal incidence does not bend even though speed and wavelength change.',
      'TIR is absence of a transmitted ray, not strong refraction.',
      'At θi = θc, the transmitted ray runs along the interface; this is not TIR.',
      'The red/violet ordering assumes ordinary visible dispersion; anomalous-dispersion regions are outside this lesson.',
    ],
    exits: [
      {
        label: 'Independent simulation pair',
        near: makeItem({
          id: 'K2-X1',
          family: 'K2-exit-near',
          stage: 'Exit · near use',
          prompt: 'Air 1.00 to glass 1.50 at 50.0°. What is the refracted angle?',
          key: 'A',
          cue: 'Apply Snell’s law, then check the bend direction.',
          choices: [
            ['30.7°', 'sin θ2 = (1/1.5) sin 50.0°, so θ2 = 30.7°.'],
            ['50.0°', 'This ignores refraction.'],
            ['65.9°', 'This reverses the index ratio.'],
            ['TIR', 'TIR cannot occur low-to-high.'],
          ],
        }),
        changed: makeItem({
          id: 'K2-X2',
          family: 'K2-exit-table-dispersion',
          stage: 'Exit · changed representation',
          duration: '90 s',
          prompt:
            'Table: A air 1.00→glass 1.50 at 70°; B glass 1.50→water 1.33 at 55°; C water 1.33→air 1.00 at 50°; D glass 1.50→air 1.00 at 40°. Which row has TIR, and for separate air-to-glass rays nR=1.51, nV=1.53 which color has smaller internal angle?',
          key: 'C',
          cue: 'Check high-to-low thresholds, then compare wavelength-specific indices.',
          choices: [
            [
              'Row A; red',
              'A is low-to-high and cannot undergo TIR; red also has the lower index.',
            ],
            ['Row B; violet', 'B is below its 62.5° critical angle.'],
            [
              'Row C; violet',
              'C exceeds water’s 48.8° critical angle, and the larger violet index gives the smaller internal angle.',
            ],
            ['Row D; equal angles', 'D is below 41.8°, and unequal indices give unequal angles.'],
          ],
        }),
      },
      {
        label: 'Fresh pair for repair branch A',
        near: makeItem({
          id: 'K2-R1X1',
          family: 'K2-repair1-exit-snell',
          stage: 'Fresh exit · near use',
          prompt: 'Air 1.00 → water 1.33 at 37.0°. What is θ2?',
          key: 'A',
          cue: 'Use sin θ2 = (1.00/1.33) sin 37.0°.',
          choices: [
            ['26.9°', 'The Snell calculation gives 26.9°, toward the normal.'],
            ['37.0°', 'This ignores the index change.'],
            ['50.3°', 'This reverses the ratio.'],
            ['TIR', 'Low-to-high travel cannot produce TIR.'],
          ],
        }),
        changed: makeItem({
          id: 'K2-R1X2',
          family: 'K2-repair1-exit-tir-dispersion',
          stage: 'Fresh exit · two-row decision card',
          prompt:
            'Decision card row 1: glass 1.52 → air at 45°. Row 2: separate ordinary air-to-glass red/violet comparison. Which classification completes both rows?',
          key: 'C',
          cue: 'Compute θc, then treat the dispersion comparison separately.',
          choices: [
            [
              'Refraction; red has smaller internal angle',
              '45° exceeds the 41.1° critical angle, and red has the smaller index.',
            ],
            [
              'Refraction; violet has smaller internal angle',
              'The dispersion ordering is right, but transmission does not occur.',
            ],
            [
              'TIR; violet has smaller internal angle',
              '45° > 41.1°, and the larger violet index gives the smaller air-to-material angle.',
            ],
            [
              'TIR; equal internal angles',
              'TIR is right, but wavelength-dependent indices do not give equal angles.',
            ],
          ],
        }),
      },
      {
        label: 'Fresh pair for repair branch B',
        near: makeItem({
          id: 'K2-R2X1',
          family: 'K2-repair2-exit-snell',
          stage: 'Fresh exit · near use',
          prompt: 'Water 1.33 → air at 40.0°. What occurs?',
          key: 'A',
          cue: '40.0° is below water’s 48.8° critical angle.',
          choices: [
            ['Refraction at 58.7°', 'sin θ2 = 1.33 sin 40.0° gives 58.7°.'],
            ['Refraction at 28.9°', 'This bends toward rather than away.'],
            ['Refraction at 40.0°', 'This ignores the index change.'],
            ['TIR', 'The incidence is below the critical angle.'],
          ],
        }),
        changed: makeItem({
          id: 'K2-R2X2',
          family: 'K2-repair2-exit-threshold-dispersion',
          stage: 'Fresh exit · boundary table completion',
          prompt:
            'A boundary table lists glass 1.60 → water 1.33 at 50° and a separate ordinary air-to-material dispersion row. Which combined table entry is correct?',
          key: 'A',
          cue: 'θc = sin⁻¹(1.33/1.60) = 56.2°.',
          choices: [
            [
              'Refraction at 67.2°; violet has the smaller comparison angle',
              '50° is below θc, and violet’s larger index gives the smaller internal angle.',
            ],
            [
              'Refraction at 39.6°; red has the smaller angle',
              'This reverses both bend direction and dispersion order.',
            ],
            [
              'TIR; violet has the smaller angle',
              'The dispersion statement is right, but 50° is below θc.',
            ],
            [
              'Refraction at 67.2°; red has the smaller angle',
              'The refraction result is right, but the dispersion order is reversed.',
            ],
          ],
        }),
      },
    ],
    repairs: [
      {
        title: 'Repair branch A · Angle reference',
        focus: 'Convert before calculating',
        targetFeatures: ['angle-reference', 'equation-operation', 'index-direction'],
        teaching:
          'First convert the given surface angle to the normal angle; only then apply Snell’s law.',
        item: makeItem({
          id: 'K2-R1',
          family: 'K2-repair-angle-reference',
          stage: 'Repair 1 support',
          prompt:
            'A ray is 20° from the surface in air before entering glass n = 1.50. What is the refracted normal angle?',
          key: 'C',
          cue: 'The incident normal angle is 70°.',
          choices: [
            ['13.2°', 'This applies the wrong incident angle.'],
            ['20.0°', 'This repeats the surface angle.'],
            ['38.8°', 'sin θ2 = sin 70°/1.50, so θ2 = 38.8°.'],
            ['70.0°', 'This ignores refraction.'],
          ],
        }),
        reentry: 'Use the K2 branch-A Snell and threshold/dispersion pair.',
      },
      {
        title: 'Repair branch B · Direction and threshold',
        focus: 'Check both TIR conditions',
        targetFeatures: ['threshold-direction', 'dispersion-order', 'sign-location'],
        teaching:
          'A high-to-low boundary permits TIR; incidence must also exceed the critical angle.',
        item: makeItem({
          id: 'K2-R2',
          family: 'K2-repair-threshold',
          stage: 'Repair 2 support',
          prompt: 'n1 = 1.45 → n2 = 1.00 at θi = 44.0°. θc = 43.6°. What occurs?',
          key: 'A',
          cue: 'Compare θi directly with θc.',
          choices: [
            ['TIR', '44.0° is above 43.6° at a high-to-low boundary.'],
            [
              'Transmission at 43.6°',
              '43.6° is the threshold, not the transmitted angle for this incidence.',
            ],
            [
              'Transmission at 44.0°',
              'Equal incident and transmitted angles do not follow across unequal indices.',
            ],
            [
              'Transmission at 64.1°',
              'Snell’s-law inversion would exceed 1; no transmitted ray exists.',
            ],
          ],
        }),
        reentry:
          'Use the K2 branch-B fresh simulation pair; stop after this cycle if it does not pass.',
      },
    ],
    handoff:
      'You can now decide whether a ray crosses, separates by wavelength, or stays inside. Next, a curved reflector creates an image.',
  },
  {
    number: 3,
    id: 'V3-KC-853697',
    short: 'KC 3',
    title: 'Spherical mirrors',
    claim:
      'Use curvature, focal length, and ray/equation conventions to identify real and virtual images.',
    objective:
      'I can classify a spherical mirror, use principal rays or the mirror equation, and report image sign, physical side, orientation, and size.',
    concise: '10 min',
    standard: '16 min',
    repairRelation: 'R14-REM-CP-151',
    entry: makeItem({
      id: 'K3-E1',
      family: 'K3-entry-real-virtual',
      stage: 'Entry route',
      prompt:
        'Reflected rays diverge, but their dashed backward extensions meet behind a mirror. The image is…',
      key: 'B',
      cue: 'Ask whether physical rays or only extensions meet.',
      choices: [
        ['Real and in front', 'A real image requires physical convergence.'],
        ['Virtual and behind', 'Only backward extensions meet behind the mirror.'],
        ['Real and behind', 'No reflected rays travel behind the mirror.'],
        ['Absent', 'A valid virtual intersection defines an image.'],
      ],
    }),
    disambiguator: makeItem({
      id: 'K3-D1',
      family: 'K3-entry-convex-behavior',
      stage: 'Entry disambiguator',
      prompt: 'For a real object, a convex mirror produces…',
      key: 'B',
      cue: 'A convex mirror diverges paraxial reflected rays.',
      choices: [
        ['A real inverted image', 'This describes some concave-mirror cases.'],
        [
          'A virtual upright reduced image',
          'Backward extensions meet behind a convex mirror with 0 < m < 1.',
        ],
        [
          'Either type depending on p',
          'For a real object, a convex mirror stays virtual and reduced.',
        ],
        ['No image', 'Its backward extensions do define an image.'],
      ],
    }),
    prediction: makeItem({
      id: 'K3-P1',
      family: 'K3-predict-concave-region',
      stage: 'Prediction',
      prompt: 'A concave mirror has an object beyond C = 2F. Predict the image.',
      key: 'A',
      cue: 'Use a parallel ray and a center-of-curvature ray.',
      choices: [
        [
          'Real, inverted, reduced, between F and C',
          'The principal rays physically cross in this region.',
        ],
        ['Virtual, upright, enlarged, behind the mirror', 'This describes an object inside F.'],
        ['Real, upright, same size', 'A real single-mirror image is inverted here.'],
        ['Virtual, inverted, reduced', 'Virtual mirror images for this setup are upright.'],
      ],
    }),
    model: [
      'A concave mirror converges paraxial rays and has f > 0. A convex mirror diverges them and has f < 0.',
      'For mirrors, q > 0 means a real image on the object side; q < 0 means a virtual image behind the mirror.',
      'Principal rays: parallel reflects through F; through F reflects parallel; through C retraces. Use at least two rays.',
      'Use 1/p + 1/q = 1/f and m = −q/p. Positive m is upright; negative m is inverted. Under the paraxial approximation, f = R/2.',
    ],
    targetedContrastByFeature: {
      'sign-location':
        'Concave does not mean automatically real. Classify q from the physical ray state: a real object inside the focal length gives q < 0 and a virtual, upright, enlarged image.',
    },
    diagram: 'mirror',
    worked: {
      problem: 'Concave mirror f = +12 cm; real object p = +36 cm, ho = +6 cm.',
      cue: 'Classify the element and signs before substituting.',
      principle: '1/q = 1/12 − 1/36 = 1/18.',
      operation: [
        'q = +18 cm: the image is real and 18 cm on the object side.',
        'm = −18/36 = −0.500.',
        'hi = (−0.500)(6.00 cm) = −3.00 cm.',
        'On the diagram, the image is at x = −18 cm, between F = −12 cm and C = −24 cm.',
      ],
      check: 'The result is real, inverted, and reduced, matching the principal-ray intersection.',
    },
    practice: [
      makeItem({
        id: 'K3-A2',
        family: 'K3-guided-concave',
        stage: 'A2 guided practice',
        prompt: 'Concave mirror f = +10 cm, p = +15 cm, ho = 5 cm. Which result is correct?',
        key: 'A',
        cue: 'Subtract reciprocals before inverting.',
        choices: [
          ['q = +30 cm, hi = −10 cm', '1/q = 1/10 − 1/15 = 1/30; m = −2.'],
          ['q = −30 cm, hi = +10 cm', 'This flips image sign and orientation.'],
          ['q = +6 cm, hi = −2 cm', 'This adds reciprocals rather than subtracting them.'],
          ['q = +25 cm, hi = −5 cm', 'This uses p + f instead of the reciprocal equation.'],
        ],
      }),
      makeItem({
        id: 'K3-A1',
        family: 'K3-cued-convex',
        stage: 'A1 cued practice',
        prompt: 'Convex mirror f = −15 cm, p = 30 cm, ho = 6 cm. Which result is correct?',
        key: 'A',
        cue: 'Convex means f < 0.',
        choices: [
          ['q = −10 cm, hi = +2 cm', '1/q = −1/15 − 1/30 = −1/10; m = +1/3.'],
          ['q = +10 cm, hi = −2 cm', 'This treats the convex mirror as converging.'],
          ['q = −30 cm, hi = +6 cm', 'This incorrectly gives unit magnification.'],
          [
            'q = +30 cm, hi = −6 cm',
            'This is real and unit-size, inconsistent with a convex mirror.',
          ],
        ],
      }),
      makeItem({
        id: 'K3-A0',
        family: 'K3-independent-radius',
        stage: 'A0 independent practice',
        duration: '75 s',
        prompt: 'Concave mirror R = 40 cm; p = 10 cm; ho = 2 cm. Which result is correct?',
        key: 'A',
        cue: 'Convert R to f first.',
        choices: [
          ['q = −20 cm, upright 4 cm', 'f = 20 cm and p < f, so q = −20 cm and m = +2.'],
          ['q = +20 cm, inverted 4 cm', 'This loses the virtual sign.'],
          ['q = −10 cm, upright 2 cm', 'This ignores magnification.'],
          ['Image at infinity', 'That occurs only at p = f.'],
        ],
      }),
    ],
    recovery: [
      makeItem({
        id: 'K3-A2-RECOVERY',
        family: 'K3-a2-supported-recovery-fresh-v1',
        stage: 'Fresh supported A2 recovery',
        prompt: 'Concave mirror f = +12 cm, p = +24 cm, ho = +3 cm. Which result is correct?',
        key: 'A',
        cue: 'At p = 2f, the image is at 2f and has m = −1.',
        choices: [
          [
            'q = +24 cm, hi = −3 cm',
            'The image is real, inverted, and equal-size.',
            'correct-model',
          ],
          ['q = −24 cm, hi = +3 cm', 'This reverses image sign and orientation.', 'sign-location'],
          [
            'q = +8 cm, hi = −1 cm',
            'This adds reciprocals instead of subtracting.',
            'equation-operation',
          ],
          ['q = +36 cm, hi = −4.5 cm', 'This adds linear distances.', 'equation-operation'],
        ],
      }),
      makeItem({
        id: 'K3-A1-RECOVERY',
        family: 'K3-a1-supported-recovery-fresh-v1',
        stage: 'Fresh supported A1 recovery',
        prompt: 'Convex mirror f = −10 cm, p = +30 cm, ho = +4 cm. Which result is correct?',
        key: 'A',
        cue: 'Use 1/q = −1/10 − 1/30.',
        choices: [
          [
            'q = −7.5 cm, hi = +1.0 cm',
            'm = +0.25, so the image is virtual, upright, and reduced.',
            'correct-model',
          ],
          [
            'q = +7.5 cm, hi = −1.0 cm',
            'This treats the convex mirror as converging.',
            'sign-location',
          ],
          ['q = −20 cm, hi = +2.67 cm', 'This is not the reciprocal result.', 'equation-operation'],
          [
            'q = +20 cm, hi = −2.67 cm',
            'This predicts a real convex-mirror image.',
            'sign-location',
          ],
        ],
      }),
    ],
    contrast: [
      'The mirror equation resembles the lens equation, but a positive mirror image lies on the object side.',
      'Concave mirrors can form real or virtual images.',
      'At p = f, reflected rays are parallel and no finite image forms.',
      'f = R/2 is paraxial; spherical aberration outside that approximation is a boundary, not a new objective.',
    ],
    exits: [
      {
        label: 'Independent simulation pair',
        near: makeItem({
          id: 'K3-X1',
          family: 'K3-exit-near',
          stage: 'Exit · near use',
          prompt: 'Concave mirror f = +8 cm, p = 24 cm, ho = 4 cm. Which result is correct?',
          key: 'A',
          cue: 'Solve reciprocal distances, then calculate m = −q/p.',
          choices: [
            [
              'q = +12 cm, hi = −2 cm',
              '1/q = 1/8 − 1/24 = 1/12; the physical image is at x = −12 cm.',
            ],
            ['q = −12 cm, hi = +2 cm', 'This swaps real and virtual.'],
            ['q = +16 cm, hi = −4 cm', 'This uses linear subtraction.'],
            ['q = +6 cm, hi = −1 cm', 'This uses the wrong reciprocal operation.'],
          ],
        }),
        changed: makeItem({
          id: 'K3-X2',
          family: 'K3-exit-ray-diagram',
          stage: 'Exit · changed representation',
          duration: '90 s',
          prompt:
            'Convex mirror at x = 0; virtual focus F = (+6, 0); object base (−12, 0), tip (−12, 2). Which description matches the ray diagram?',
          key: 'A',
          cue: 'For the equation, a convex focus behind the mirror means f = −6 cm.',
          choices: [
            [
              'q = −4 cm; virtual image at x = +4 cm, height +0.667 cm',
              'f = −6, p = 12 gives q = −4 and m = +1/3.',
            ],
            ['q = +4 cm; real image at x = −4 cm', 'This reverses the convex-mirror sign.'],
            ['q = −18 cm; height +3 cm', 'This predicts enlargement rather than reduction.'],
            ['q = +12 cm; height −2 cm', 'This predicts a real same-size image.'],
          ],
        }),
      },
      {
        label: 'Fresh pair for repair branch A',
        near: makeItem({
          id: 'K3-R1X1',
          family: 'K3-repair1-exit-concave',
          stage: 'Fresh exit · near use',
          prompt: 'Concave mirror f = 14 cm, p = 42 cm, ho = 6 cm. Result?',
          key: 'A',
          cue: 'Compute q, then report the mirror-side coordinate.',
          choices: [
            [
              'q = +21 cm, hi = −3 cm, physical x = −21 cm',
              'The reciprocal equation gives q = 21 and m = −0.5.',
            ],
            ['q = −21 cm, hi = +3 cm, x = +21 cm', 'This swaps real and virtual.'],
            ['q = +28 cm, hi = −4 cm', 'This uses linear subtraction.'],
            ['q = +56 cm, hi = −8 cm', 'This uses linear addition.'],
          ],
        }),
        changed: makeItem({
          id: 'K3-R1X2',
          family: 'K3-repair1-exit-convex',
          stage: 'Fresh exit · signed stage-row representation',
          prompt:
            'Complete the stage row: convex mirror | f = −8 cm | p = +24 cm | ho = +3 cm | q, hi, physical x = ?',
          key: 'A',
          cue: 'A virtual mirror image lies behind the mirror.',
          choices: [
            [
              'q = −6 cm, hi = +0.75 cm, physical x = +6 cm',
              '1/q = −1/8 − 1/24 = −1/6; m = +0.25.',
            ],
            ['q = +6 cm, hi = −0.75 cm, x = −6 cm', 'This reverses the convex sign.'],
            ['q = −12 cm, hi = +1.5 cm', 'This uses an incorrect reciprocal result.'],
            ['q = +24 cm, hi = −3 cm', 'This predicts a real unit image.'],
          ],
        }),
      },
      {
        label: 'Fresh pair for repair branch B',
        near: makeItem({
          id: 'K3-R2X1',
          family: 'K3-repair2-exit-radius',
          stage: 'Fresh exit · near use',
          prompt: 'Concave mirror R = 36 cm, p = 54 cm, ho = 6 cm. Result?',
          key: 'A',
          cue: 'First use f = R/2.',
          choices: [
            ['f = 18 cm, q = 27 cm, hi = −3 cm', '1/q = 1/18 − 1/54 = 1/27; m = −0.5.'],
            [
              'f = 36 cm, q = 108 cm, hi = −12 cm',
              'This fails to apply f = R/2 before the mirror equation.',
              'equation-operation',
            ],
            ['f = 18 cm, q = −27 cm, hi = +3 cm', 'This loses the real-image sign.'],
            ['f = 18 cm, q = 36 cm, hi = −4 cm', 'This is not the reciprocal solution.'],
          ],
        }),
        changed: makeItem({
          id: 'K3-R2X2',
          family: 'K3-repair2-exit-convex',
          stage: 'Fresh exit · ray-summary table',
          prompt:
            'A ray-summary table labels a convex mirror f = −12 cm, object p = +18 cm, ho = +5 cm. Which q/hi row is consistent with the diverging rays?',
          key: 'A',
          cue: 'Keep f negative and interpret q physically.',
          choices: [
            ['q = −7.2 cm, hi = +2.0 cm', '1/q = −1/12 − 1/18 = −5/36; m = +0.4.'],
            ['q = +7.2 cm, hi = −2.0 cm', 'This treats the mirror as converging.'],
            ['q = −30 cm, hi = +8.33 cm', 'This incorrectly enlarges the image.'],
            ['q = +30 cm, hi = −8.33 cm', 'This is real and enlarged, impossible here.'],
          ],
        }),
      },
    ],
    repairs: [
      {
        title: 'Repair branch A · Sign classification',
        focus: 'Classify before calculating',
        targetFeatures: ['sign-location', 'model-selection'],
        teaching: 'For a real object, a convex mirror has f < 0 and produces q < 0 with 0 < m < 1.',
        item: makeItem({
          id: 'K3-R1',
          family: 'K3-repair-signs',
          stage: 'Repair 1 support',
          prompt: 'Convex mirror f = −20 cm, p = 60 cm, ho = 4 cm. Which result is consistent?',
          key: 'A',
          cue: 'Use 1/q = 1/f − 1/p.',
          choices: [
            ['q = −15 cm, m = +0.25, hi = +1 cm', 'The image is virtual, upright, and reduced.'],
            ['q = +15 cm, m = −0.25', 'This reverses the convex sign.'],
            ['q = −30 cm, m = +0.50', 'This is not the reciprocal solution.'],
            ['q = +30 cm, m = −0.50', 'This predicts a real convex-mirror image.'],
          ],
        }),
        reentry: 'Use the K3 branch-A concave/convex fresh pair.',
      },
      {
        title: 'Repair branch B · Ray/equation consistency',
        focus: 'Refute “concave always real”',
        targetFeatures: ['equation-operation', 'ray-state', 'sign-location'],
        teaching:
          'A concave mirror with p < f sends reflected rays apart; their backward extensions form an upright virtual image.',
        item: makeItem({
          id: 'K3-R2',
          family: 'K3-repair-concave-inside-focus',
          stage: 'Repair 2 support',
          prompt:
            'Concave mirror f = 9 cm, p = 6 cm, ho = 2 cm. Which result matches both rays and equation?',
          key: 'A',
          cue: 'Because p < f, expect q < 0.',
          choices: [
            ['q = −18 cm, m = +3, hi = +6 cm', 'The image is virtual, upright, and enlarged.'],
            ['q = +18 cm, m = −3', 'This asserts a real image inside the focus.'],
            ['q = −3.6 cm, m = +0.6', 'This uses the wrong reciprocal operation.'],
            ['No image', 'Backward extensions form a valid virtual image.'],
          ],
        }),
        reentry:
          'Use the K3 branch-B fresh simulation pair; stop after this cycle if it does not pass.',
      },
    ],
    handoff:
      'You can now turn a curved reflector into an image location. Next, a lens uses the same reciprocal equation but a different side rule.',
  },
  {
    number: 4,
    id: 'V3-KC-393396',
    short: 'KC 4',
    title: 'Thin lenses',
    claim:
      'Use converging/diverging classification, 1/p + 1/q = 1/f, signs, magnification, and diopters.',
    objective:
      'I can classify a thin lens, use principal rays, solve 1/p + 1/q = 1/f, interpret signs, calculate magnification, and convert focal length to diopters.',
    concise: '11 min',
    standard: '17 min',
    repairRelation: 'R14-REM-CP-086',
    entry: makeItem({
      id: 'K4-E1',
      family: 'K4-entry-power-sign',
      stage: 'Entry route',
      prompt: 'Which power belongs to a diverging lens?',
      key: 'B',
      cue: 'P = 1/f with f in meters.',
      choices: [
        ['Positive', 'Positive power is converging.'],
        ['Negative', 'A diverging lens has f < 0, so P < 0.'],
        ['Zero', 'Zero is an afocal limit, not an ordinary diverging lens.'],
        ['Power has no sign', 'The sign records converging or diverging behavior.'],
      ],
    }),
    disambiguator: makeItem({
      id: 'K4-D1',
      family: 'K4-entry-image-side',
      stage: 'Entry disambiguator',
      prompt: 'A lens has q < 0. Where is the image?',
      key: 'B',
      cue: 'Use the lens physical-side rule, not the mirror rule.',
      choices: [
        ['Opposite the object and real', 'That corresponds to q > 0 for a lens.'],
        [
          'On the object side and virtual',
          'Negative lens image distance lies on the incident side.',
        ],
        ['Behind a mirror', 'This mixes optical elements.'],
        ['Necessarily at the focal point', 'q < 0 does not imply that location.'],
      ],
    }),
    prediction: makeItem({
      id: 'K4-P1',
      family: 'K4-predict-diverging',
      stage: 'Prediction',
      prompt: 'A real object is placed before a diverging lens. Predict the image.',
      key: 'A',
      cue: 'Draw a parallel ray and its backward extension toward the near focus.',
      choices: [
        [
          'Virtual, upright, reduced, object side',
          'This is the real-object behavior of a diverging lens.',
        ],
        ['Real, inverted, enlarged, far side', 'This requires a converging setup.'],
        ['Virtual, inverted, enlarged', 'A diverging-lens virtual image is upright and reduced.'],
        ['Real, upright, reduced', 'Physical rays do not converge after this lens.'],
      ],
    }),
    model: [
      'A converging lens has f > 0; a diverging lens has f < 0.',
      'For a lens, q > 0 is on the side opposite the object and is real. q < 0 is on the object side and is virtual.',
      'Principal rays: parallel goes through—or appears to come from—the appropriate focus; a center ray is undeviated; a ray directed through the near focus exits parallel.',
      'Use 1/p + 1/q = 1/f, m = −q/p, and P = 1/f with f in meters.',
    ],
    targetedContrastByFeature: {
      'sign-location':
        'For a lens, q > 0 means a real image on the far side and q < 0 means a virtual image on the object side. Do not import the mirror-side rule.',
    },
    diagram: 'lens',
    worked: {
      problem: 'A converging lens has P = +5.00 D, p = 30.0 cm, and ho = 2.00 cm.',
      cue: 'Power is supplied; convert focal length before using centimeters.',
      principle: 'f = 1/P = 0.200 m = 20.0 cm.',
      operation: [
        '1/q = 1/20.0 − 1/30.0 = 1/60.0, so q = +60.0 cm.',
        'The image is 60.0 cm on the far side of the lens.',
        'm = −60/30 = −2.00.',
        'hi = (−2.00)(2.00 cm) = −4.00 cm.',
      ],
      check: 'An object between F and 2F gives a real, inverted, enlarged image beyond 2F.',
    },
    practice: [
      makeItem({
        id: 'K4-A2',
        family: 'K4-guided-converging',
        stage: 'A2 guided practice',
        prompt: 'Converging lens f = 14 cm, p = 42 cm, ho = 3 cm. Result?',
        key: 'A',
        cue: 'Use reciprocal distances.',
        choices: [
          ['q = 21 cm, hi = −1.5 cm', '1/q = 1/14 − 1/42 = 1/21; m = −0.5.'],
          ['q = −21 cm, hi = +1.5 cm', 'This flips the image side.'],
          ['q = 56 cm, hi = −4 cm', 'This uses direct addition.'],
          ['q = 28 cm, hi = −2 cm', 'This uses direct subtraction.'],
        ],
      }),
      makeItem({
        id: 'K4-A1',
        family: 'K4-cued-diverging-power',
        stage: 'A1 cued practice',
        prompt: 'Diverging lens P = −4.00 D, p = 50.0 cm, ho = 3.0 cm. Result?',
        key: 'A',
        cue: 'Convert diopters using meters.',
        choices: [
          [
            'f = −25.0 cm, q = −16.7 cm, hi = +1.0 cm',
            'f = −0.250 m; the equation gives q = −16.7 cm and m = +1/3.',
          ],
          ['f = +25.0 cm, q = +50.0 cm', 'This loses the power sign.'],
          ['f = −4.00 cm, q = −3.70 cm', 'This treats diopters as centimeters.'],
          [
            'f = −25.0 cm, q = +16.7 cm',
            'This predicts a real image for a diverging lens with a real object.',
          ],
        ],
      }),
      makeItem({
        id: 'K4-A0',
        family: 'K4-independent-inside-focus',
        stage: 'A0 independent practice',
        duration: '75 s',
        prompt: 'Converging lens f = 8 cm, p = 6 cm, ho = 2 cm. Result?',
        key: 'A',
        cue: 'An object inside the converging focus gives q < 0.',
        choices: [
          ['q = −24 cm, upright 8 cm', '1/q = 1/8 − 1/6 = −1/24; m = +4.'],
          ['q = +24 cm, inverted 8 cm', 'This loses the virtual sign.'],
          ['q = −14 cm, upright 4.67 cm', 'This subtracts distances directly.'],
          ['Image at infinity', 'That occurs only at p = f.'],
        ],
      }),
    ],
    recovery: [
      makeItem({
        id: 'K4-A2-RECOVERY',
        family: 'K4-a2-supported-recovery-fresh-v1',
        stage: 'Fresh supported A2 recovery',
        prompt:
          'A converging lens has P = +4.00 D, p = 50.0 cm, and ho = 2.0 cm. Which result is correct?',
        key: 'A',
        cue: 'Convert f = 1/4.00 m = 25.0 cm before using the lens equation.',
        choices: [
          [
            'f = +25.0 cm, q = +50.0 cm, hi = −2.0 cm',
            'The object is at 2f, giving a real equal-size inverted image.',
            'correct-model',
          ],
          ['f = +4.00 cm, q = +4.35 cm', 'This treats diopters as centimeters.', 'power-units'],
          ['f = −25.0 cm, q = −16.7 cm', 'This reverses the power sign.', 'power-units'],
          ['f = +25.0 cm, q = −50.0 cm', 'This reverses the real-image sign.', 'sign-location'],
        ],
      }),
      makeItem({
        id: 'K4-A1-RECOVERY',
        family: 'K4-a1-supported-recovery-fresh-v1',
        stage: 'Fresh supported A1 recovery',
        prompt:
          'A diverging lens has f = −20 cm, p = +60 cm, and ho = +4 cm. Which result is correct?',
        key: 'A',
        cue: 'Use 1/q = −1/20 − 1/60.',
        choices: [
          [
            'q = −15 cm, hi = +1.0 cm',
            'm = +0.25, so the image is virtual, upright, and reduced.',
            'correct-model',
          ],
          ['q = +15 cm, hi = −1.0 cm', 'This places the image on the wrong side.', 'sign-location'],
          ['q = −40 cm, hi = +2.67 cm', 'This is not the reciprocal result.', 'equation-operation'],
          [
            'q = +40 cm, hi = −2.67 cm',
            'This predicts a real diverging-lens image.',
            'sign-location',
          ],
        ],
      }),
    ],
    contrast: [
      'For a positive lens image distance, look on the far side; for a positive mirror image distance, look on the object side.',
      'Diopters require meters.',
      'A converging lens can form real or virtual images; a diverging lens with a real object forms a virtual upright reduced image.',
      'The thin, paraxial, monochromatic model does not calculate spherical or chromatic aberration.',
    ],
    exits: [
      {
        label: 'Independent simulation pair',
        near: makeItem({
          id: 'K4-X1',
          family: 'K4-exit-near',
          stage: 'Exit · near use',
          prompt: 'P = +10.0 D, p = 30.0 cm, ho = 4.0 cm. Which result is correct?',
          key: 'A',
          cue: 'Convert +10.0 D to f in meters, then centimeters.',
          choices: [
            ['f = 10.0 cm, q = 15.0 cm, hi = −2.0 cm', 'f = 0.100 m; q = 15.0 cm and m = −0.5.'],
            ['f = 0.100 cm, q ≈ 0.100 cm', 'This fails the meter conversion.'],
            ['f = −10.0 cm, q = −7.5 cm', 'This reverses the power sign.'],
            ['f = 10.0 cm, q = −15.0 cm', 'A p > f converging setup forms a real far-side image.'],
          ],
        }),
        changed: makeItem({
          id: 'K4-X2',
          family: 'K4-exit-diagram',
          stage: 'Exit · changed representation',
          duration: '90 s',
          prompt:
            'Object x = −24 cm, lens x = 0. Outgoing rays diverge; backward extensions meet at x = −12 cm. Which description is correct?',
          key: 'A',
          cue: 'Dashed extensions establish q < 0.',
          choices: [
            ['q = −12 cm, f = −24 cm, P = −4.17 D', '1/f = 1/24 − 1/12 = −1/24; f = −0.24 m.'],
            ['q = +12 cm, f = +8 cm', 'This calls a virtual image real.'],
            ['q = −12 cm, f = +24 cm', 'The algebra gives negative focal length.'],
            ['q = +12 cm, f = −24 cm', 'This combines inconsistent geometry and sign.'],
          ],
        }),
      },
      {
        label: 'Fresh pair for repair branch A',
        near: makeItem({
          id: 'K4-R1X1',
          family: 'K4-repair1-exit-power',
          stage: 'Fresh exit · near use',
          prompt: 'P = −5.00 D, p = 40 cm, ho = 6 cm. Result?',
          key: 'A',
          cue: 'f = 1/P in meters.',
          choices: [
            ['f = −20 cm, q = −13.3 cm, hi = +2.0 cm', 'f = −0.200 m; q = −13.3 and m = +1/3.'],
            ['f = +20 cm, q = +40 cm, hi = −6 cm', 'This loses the power sign.'],
            ['f = −5 cm, q = −4.44 cm', 'This treats diopters as centimeters.'],
            ['f = −20 cm, q = +13.3 cm', 'This misplaces a diverging-lens image.'],
          ],
        }),
        changed: makeItem({
          id: 'K4-R1X2',
          family: 'K4-repair1-exit-inside-focus',
          stage: 'Fresh exit · ray-description representation',
          prompt:
            'A ray card shows a converging lens with the object inside the near focus: f = +18 cm, p = +12 cm, ho = +2 cm. Which image description completes the card?',
          key: 'A',
          cue: 'p < f, so expect a virtual image.',
          choices: [
            ['q = −36 cm, hi = +6 cm', '1/q = 1/18 − 1/12 = −1/36; m = +3.'],
            ['q = +36 cm, hi = −6 cm', 'This loses the virtual sign.'],
            ['q = −6 cm, hi = +1 cm', 'This uses direct subtraction.'],
            ['Image at infinity', 'That occurs at p = 18 cm, not 12 cm.'],
          ],
        }),
      },
      {
        label: 'Fresh pair for repair branch B',
        near: makeItem({
          id: 'K4-R2X1',
          family: 'K4-repair2-exit-power',
          stage: 'Fresh exit · near use',
          prompt: 'P = +2.00 D, p = 100 cm, ho = 4 cm. Result?',
          key: 'A',
          cue: 'Convert f = 0.500 m to 50.0 cm.',
          choices: [
            ['f = 50 cm, q = 100 cm, hi = −4 cm', 'The object is at 2f, so q = 2f and m = −1.'],
            ['f = 2 cm, q = 2.04 cm', 'This treats diopters as centimeters.'],
            ['f = −50 cm, q = −33.3 cm', 'This reverses the power sign.'],
            ['f = 50 cm, q = −100 cm', 'This mis-signs the 2f image.'],
          ],
        }),
        changed: makeItem({
          id: 'K4-R2X2',
          family: 'K4-repair2-exit-diagram',
          stage: 'Fresh exit · changed representation',
          prompt:
            'A diagram has p = 27 cm and backward extensions meeting at q = −9 cm. What are f and P?',
          key: 'A',
          cue: 'Use 1/f = 1/p + 1/q, then convert centimeters to meters.',
          choices: [
            ['f = −13.5 cm, P = −7.41 D', '1/f = 1/27 − 1/9 = −2/27; f = −0.135 m.'],
            ['f = +13.5 cm, P = +7.41 D', 'This discards the virtual-image sign.'],
            ['f = −18 cm, P = −5.56 D', 'This uses direct subtraction.'],
            ['f = +36 cm, P = +2.78 D', 'This uses direct addition.'],
          ],
        }),
      },
    ],
    repairs: [
      {
        title: 'Repair branch A · Power and units',
        focus: 'Convert diopters in meters',
        targetFeatures: ['power-units', 'equation-operation'],
        teaching:
          'Power is reciprocal meters. Keep the sign, convert to centimeters only after finding f.',
        item: makeItem({
          id: 'K4-R1',
          family: 'K4-repair-power-units',
          stage: 'Repair 1 support',
          prompt: 'P = +2.50 D and p = 80 cm. Which result is correct?',
          key: 'A',
          cue: 'f = 1/2.50 m = 0.400 m.',
          choices: [
            ['f = +40.0 cm, q = +80 cm, m = −1', 'The object is at 2f.'],
            ['f = +2.50 cm, q = +2.58 cm', 'This treats diopters as centimeters.'],
            ['f = −40.0 cm, q = −26.7 cm', 'This reverses the sign.'],
            ['f = +40.0 cm, q = −80 cm', 'This mis-signs the real 2f image.'],
          ],
        }),
        reentry: 'Use the K4 branch-A power and inside-focus fresh pair.',
      },
      {
        title: 'Repair branch B · Side and sign',
        focus: 'Tie q to the physical ray state',
        targetFeatures: ['sign-location', 'ray-state', 'model-selection'],
        teaching:
          'A diverging lens with a real object has q < 0; the virtual image lies on the object side and is upright.',
        item: makeItem({
          id: 'K4-R2',
          family: 'K4-repair-side-sign',
          stage: 'Repair 2 support',
          prompt: 'Diverging lens f = −18 cm, p = 36 cm, ho = 3 cm. Result?',
          key: 'A',
          cue: 'Compute 1/q = −1/18 − 1/36.',
          choices: [
            ['q = −12 cm, hi = +1 cm', 'm = +1/3, so the image is upright and reduced.'],
            ['q = +12 cm, hi = −1 cm', 'This reverses image side.'],
            ['q = −54 cm, hi = +4.5 cm', 'This incorrectly enlarges the image.'],
            ['q = +54 cm, hi = −4.5 cm', 'This predicts a real enlarged image.'],
          ],
        }),
        reentry:
          'Use the K4 branch-B fresh simulation pair; stop after this cycle if it does not pass.',
      },
    ],
    handoff: 'You can now solve one lens. Next, its image becomes the next element’s object.',
  },
  {
    number: 5,
    id: 'V3-KC-729762',
    short: 'KC 5',
    title: 'Compound thin-element systems',
    claim: 'Propagate object/image relations through combinations of thin optical elements.',
    objective:
      'I can solve each element in order, place every intermediate image on one shared coordinate axis, assign the next object sign from incoming rays, and multiply stage magnifications.',
    concise: '13 min',
    standard: '18 min',
    repairRelation: 'R14-REM-CP-135',
    entry: makeItem({
      id: 'K5-E1',
      family: 'K5-point-of-use-kc4',
      stage: 'Hard-edge point-of-use check',
      prompt: 'A converging lens has f = +10 cm and p = +15 cm. What is q?',
      key: 'A',
      cue: 'Use 1/q = 1/f − 1/p.',
      choices: [
        ['+30 cm', '1/q = 1/10 − 1/15 = 1/30.'],
        ['−30 cm', 'This reverses the real-image sign.'],
        ['+6 cm', 'This adds the reciprocals.'],
        ['+25 cm', 'This adds linear distances.'],
      ],
    }),
    disambiguator: makeItem({
      id: 'K5-E1b',
      family: 'K5-point-of-use-kc4-fresh',
      stage: 'Hard-edge disambiguator',
      prompt: 'A converging lens has f = +8 cm and p = +24 cm. Which result is correct?',
      key: 'A',
      cue: 'Solve q first, then m = −q/p.',
      choices: [
        ['q = +12 cm, m = −0.5', '1/q = 1/8 − 1/24 = 1/12.'],
        ['q = −12 cm, m = +0.5', 'This swaps real and virtual.'],
        ['q = +32 cm, m = −1.33', 'This adds linear distances.'],
        ['q = +16 cm, m = −0.67', 'This subtracts linear distances.'],
      ],
    }),
    prediction: makeItem({
      id: 'K5-P1',
      family: 'K5-predict-virtual-object',
      stage: 'Prediction',
      prompt:
        'Lens 1 would form an image at x = 36 cm. Lens 2 is at x = 24 cm, before those rays meet. What is lens 2’s object distance?',
      key: 'B',
      cue: 'Ask whether incident rays diverge from or converge toward the point.',
      choices: [
        ['+12 cm', 'This ignores that the rays are already converging.'],
        ['−12 cm', 'The point is 12 cm beyond lens 2, so it is a virtual object.'],
        ['+60 cm', 'This combines unrelated coordinates.'],
        ['−60 cm', 'This combines unrelated coordinates with the wrong magnitude.'],
      ],
    }),
    model: [
      'Use one coordinate axis and finish one stage before starting the next.',
      'At element j, decide whether incoming rays diverge from a point on the incident side (pj > 0) or converge toward a point beyond the element (pj < 0).',
      'Solve 1/pj + 1/qj = 1/fj. For left-to-right lenses, place xIj = Lj + qj.',
      'Use that image—not the original object—for the next stage. Multiply magnifications: mtotal = ∏mj.',
      'Only lenses effectively in contact allow Ptotal ≈ ΣPj. Separated lenses require stage-by-stage propagation.',
    ],
    targetedContrastByFeature: {
      'sign-location':
        'The intermediate point’s coordinate side alone does not set p for the next element. Inspect the incident rays: diverging from the point means p > 0; converging toward it means p < 0.',
    },
    diagram: 'compound',
    worked: {
      problem:
        'Object x = −30 cm, ho = +2 cm; lens 1 at 0 with f1 = +10 cm; lens 2 at +35 cm with f2 = +10 cm.',
      cue: 'Finish stage 1 and place its image on the shared axis.',
      principle: 'The image from one element becomes the object for the next.',
      operation: [
        'Stage 1: p1 = 30, q1 = 15, xI1 = 15, m1 = −0.5.',
        'Stage 2: p2 = 35 − 15 = 20.',
        'q2 = 20, xI2 = 35 + 20 = 55, m2 = −1.',
        'mtotal = (−0.5)(−1) = +0.5; hf = (+0.5)(2 cm) = +1 cm.',
      ],
      check:
        'The final image is real relative to lens 2, at x = 55 cm, upright relative to the original, and half-size.',
    },
    practice: [
      makeItem({
        id: 'K5-A2',
        family: 'K5-guided-two-lens',
        stage: 'A2 guided practice',
        prompt:
          'Object x = −24, h = 2; lens 1 x = 0, f = 8; lens 2 x = 32, f = 10. Complete the system.',
        key: 'A',
        cue: 'Subtract xI1 from L2.',
        choices: [
          [
            'I1 = 12, p2 = 20, q2 = 20, I2 = 52, mtotal = +0.5',
            'Stage 1 gives q1 = 12 and m1 = −0.5; stage 2 gives m2 = −1.',
          ],
          ['I1 = 12, p2 = 44, q2 = 12.9', 'This reuses the original object.'],
          ['I1 = −12, p2 = 44, q2 = 12.9', 'This mis-signs stage 1.'],
          [
            'I1 = 12, p2 = −20, q2 = 6.67',
            'A left-side intermediate image is a real object for lens 2 here.',
          ],
        ],
      }),
      makeItem({
        id: 'K5-A1',
        family: 'K5-cued-virtual-object',
        stage: 'A1 cued practice',
        prompt:
          'Object x = −18, h = 2; lens 1 x = 0, f = 12; lens 2 x = 24, f = 8. Lens 1 would focus at x = 36, beyond lens 2. Result?',
        key: 'A',
        cue: 'At lens 2, the incoming rays converge toward x = 36.',
        choices: [
          [
            'p2 = −12, q2 = +4.8, xf = 28.8, mtotal = −0.8',
            'The virtual object gives q2 = 4.8 and m2 = +0.4; m1 = −2.',
          ],
          ['p2 = +12, q2 = +24, xf = 48, mtotal = +4', 'This assigns the wrong object sign.'],
          ['p2 = +42, q2 = 9.88', 'This uses the original object.'],
          ['p2 = −36, q2 = 6.55', 'This uses the first image coordinate as the distance.'],
        ],
      }),
      makeItem({
        id: 'K5-A0',
        family: 'K5-independent-diverging-second',
        stage: 'A0 independent practice',
        duration: '90 s',
        prompt:
          'Object x = −20, h = 3; lens 1 x = 0, f = +10; lens 2 x = 50, f = −15. Final result?',
        key: 'A',
        cue: 'A diverging second lens has f2 < 0.',
        choices: [
          [
            'Final x = 40, virtual relative to lens 2, mtotal = −1/3, height −1 cm',
            'Lens 1 gives I1 = 20, m1 = −1; lens 2 has p2 = 30, q2 = −10, m2 = +1/3.',
          ],
          ['Final x = 60, real, mtotal = +1/3', 'This loses the negative q2.'],
          ['Final x = 80, real, mtotal = +1', 'This fails stage propagation.'],
          [
            'Final x = 20, identical to the intermediate image',
            'The second lens changes the ray state.',
          ],
        ],
      }),
    ],
    recovery: [
      makeItem({
        id: 'K5-A2-RECOVERY',
        family: 'K5-a2-supported-recovery-fresh-v1',
        stage: 'Fresh supported A2 recovery',
        prompt:
          'Object x = −30, h = +2; lens 1 at 0 with f1 = +10; lens 2 at +45 with f2 = +15. Which ledger is correct?',
        key: 'A',
        cue: 'Stage 1 gives I1 = +15; lens 2 then has p2 = 30.',
        choices: [
          [
            'I1 = 15, p2 = 30, q2 = 30, final x = 75, mtotal = +0.5',
            'm1 = −0.5 and m2 = −1.',
            'correct-model',
          ],
          ['I1 = 15, p2 = 75, q2 = 18.75', 'This reuses the original object.', 'stage-ledger'],
          ['I1 = −15, p2 = 60, q2 = 20', 'This mis-signs the stage-1 image.', 'sign-location'],
          [
            'I1 = 15, p2 = −30, q2 = 10',
            'The incident rays diverge from I1 at lens 2.',
            'ray-state',
          ],
        ],
      }),
      makeItem({
        id: 'K5-A1-RECOVERY',
        family: 'K5-a1-supported-recovery-fresh-v1',
        stage: 'Fresh supported A1 recovery',
        prompt:
          'Object x = −24, h = +3; lens 1 at 0 with f1 = +12; lens 2 at +18 with f2 = +6. Which result is correct?',
        key: 'A',
        cue: 'Lens 1 would focus at x = +24, so lens 2 sees p2 = −6.',
        choices: [
          [
            'I1 = 24, p2 = −6, q2 = +3, final x = 21, mtotal = −0.5',
            'm1 = −1 and m2 = +0.5.',
            'correct-model',
          ],
          [
            'I1 = 24, p2 = +6, q2 is undefined',
            'The arriving rays converge toward I1, so p2 is negative.',
            'ray-state',
          ],
          [
            'I1 = −24, p2 = +42, q2 = 7',
            'This mis-signs stage 1 and reuses the wrong point.',
            'stage-ledger',
          ],
          [
            'I1 = 24, p2 = −24, q2 = +4.8',
            'This uses the image coordinate rather than lens-image separation.',
            'stage-ledger',
          ],
        ],
      }),
    ],
    contrast: [
      'Do not reuse the original object at every element.',
      'Do not add powers for separated elements.',
      'A point beyond the next element is a virtual object only when arriving rays converge toward it.',
      'Final real or virtual status is judged relative to the final element; overall orientation comes from the product of stage magnifications.',
    ],
    exits: [
      {
        label: 'Independent simulation pair',
        near: makeItem({
          id: 'K5-X1',
          family: 'K5-exit-near',
          stage: 'Exit · near use',
          duration: '90 s',
          prompt:
            'Object x = −36, h = 3; lens 1 x = 0, f = 12; lens 2 x = 48, f = 20. Which ledger is correct?',
          key: 'A',
          cue: 'Place I1 before determining p2.',
          choices: [
            [
              'I1 = 18, p2 = 30, q2 = 60, xf = 108, mtotal = +1',
              'Stage 1 m = −0.5 and stage 2 m = −2; final image is real, upright, and 3 cm tall.',
            ],
            ['I1 = 18, p2 = 66, q2 = 28.7, xf = 76.7', 'This uses the original object for lens 2.'],
            ['I1 = −18, p2 = 66, q2 = 28.7', 'This mis-signs stage 1.'],
            [
              'I1 = 18, p2 = −30, q2 = 12, xf = 60',
              'The rays diverge from I1 when reaching lens 2, so p2 is positive.',
            ],
          ],
        }),
        changed: makeItem({
          id: 'K5-X2',
          family: 'K5-exit-stage-table-perturbation',
          stage: 'Exit · changed representation',
          duration: '105 s',
          prompt:
            'Stage table: L1 x=0, f=+10, object x=−30 → I1 x=15, m1=−0.5. L2 initially x=45, f=+20. L2 moves to x=55. Which evaluation is valid?',
          key: 'A',
          cue: 'Recompute p2 from the fixed intermediate image coordinate.',
          choices: [
            [
              'p2 = 40, q2 = 40, xf = 95, m2 = −1; final image moves 10 cm left',
              'The moved lens is 40 cm from I1 and q2 = 40.',
            ],
            ['p2 = 85, q2 = 26.2, xf = 81.2', 'This reuses the original object.'],
            [
              'p2 = −40, q2 = 13.3, xf = 68.3',
              'Moving right does not make diverging incident rays converging.',
            ],
            [
              'Nothing changes because focal length is unchanged',
              'Object distance changes when the element moves.',
            ],
          ],
        }),
      },
      {
        label: 'Fresh pair for repair branch A',
        near: makeItem({
          id: 'K5-R1X1',
          family: 'K5-repair1-exit-real-handoff',
          stage: 'Fresh exit · near use',
          duration: '90 s',
          prompt: 'Object −24, h=2; lenses (0,+8), (36,+12). Result?',
          key: 'A',
          cue: 'Use one shared coordinate axis.',
          choices: [
            ['I1=12, p2=24, q2=24, xf=60, mtotal=+0.5', 'm1 = −0.5 and m2 = −1.'],
            ['I1=12, p2=48, q2=16, xf=52', 'This reuses the original object.'],
            ['I1=−12, p2=48, q2=16', 'This mis-signs stage 1.'],
            ['I1=12, p2=−24, q2=8', 'The stage-1 image is on the incident side of lens 2.'],
          ],
        }),
        changed: makeItem({
          id: 'K5-R1X2',
          family: 'K5-repair1-exit-virtual-handoff',
          stage: 'Fresh exit · shared-axis stage ledger',
          duration: '105 s',
          prompt:
            'Complete a shared-axis ledger: object x=−15, h=3; L1=(0,+10); L2=(20,+5). Which row set is consistent?',
          key: 'A',
          cue: 'Lens 1 would focus at x = 30, beyond lens 2.',
          choices: [
            [
              'I1=30, p2=−10, q2=+3.33, xf=23.33, mtotal=−0.667',
              'm1 = −2; m2 = +1/3; the intermediate point is a virtual object for lens 2.',
            ],
            ['I1=30, p2=+10, q2=+10, xf=30, mtotal=+2', 'This assigns the wrong object sign.'],
            ['I1=−30, p2=50, q2=5.56', 'This misplaces the first image.'],
            ['I1=30, p2=−30, q2=4.29', 'This uses the coordinate rather than separation.'],
          ],
        }),
      },
      {
        label: 'Fresh pair for repair branch B',
        near: makeItem({
          id: 'K5-R2X1',
          family: 'K5-repair2-exit-ledger',
          stage: 'Fresh exit · near use',
          duration: '105 s',
          prompt: 'Object −45, h=4; lenses (0,+15), (52.5,+10). Result?',
          key: 'A',
          cue: 'Write one row per element.',
          choices: [
            ['I1=22.5, p2=30, q2=15, xf=67.5, mtotal=+0.25, hf=+1', 'm1 = −0.5 and m2 = −0.5.'],
            ['I1=22.5, p2=97.5, q2=11.1', 'This reuses the original object.'],
            ['I1=−22.5, p2=75, q2=11.5', 'This mis-signs stage 1.'],
            ['I1=22.5, p2=−30, q2=7.5', 'The incident rays diverge from I1 at lens 2.'],
          ],
        }),
        changed: makeItem({
          id: 'K5-R2X2',
          family: 'K5-repair2-exit-perturbation',
          stage: 'Fresh exit · changed representation',
          duration: '105 s',
          prompt:
            'A shared-axis perturbation table fixes I1 at x=20 and f2=+10, then moves lens 2 from x=35 to x=40. Which before/after row is correct?',
          key: 'A',
          cue: 'Recompute p2 and q2 for each lens coordinate.',
          choices: [
            [
              'Initial final x=65, m2=−2; moved final x=60, m2=−1',
              'Initially p2=15,q2=30; after moving p2=20,q2=20.',
            ],
            ['Initial x=50; moved x=70', 'These values do not solve the lens equation.'],
            ['Nothing changes', 'Moving the lens changes p2.'],
            [
              'The moved lens has p2=−20 and final x=46.7',
              'The rays diverge from x=20, so p2 is positive.',
            ],
          ],
        }),
      },
    ],
    repairs: [
      {
        title: 'Repair branch A · Handoff sign',
        focus: 'Inspect incident rays',
        targetFeatures: ['ray-state', 'sign-location'],
        teaching:
          'Ignore labels temporarily. If rays diverge from I1 at lens 2, p2 > 0; if they converge toward I1 beyond lens 2, p2 < 0.',
        item: makeItem({
          id: 'K5-R1',
          family: 'K5-repair-handoff-sign',
          stage: 'Repair 1 support',
          prompt:
            'I1 = 42 cm and lens 2 is at 30 cm. Rays at lens 2 are converging toward I1. What is p2?',
          key: 'B',
          cue: 'The target point is 12 cm beyond the element.',
          choices: [
            ['+12 cm', 'This ignores converging incident rays.'],
            [
              '−12 cm',
              'A point beyond the element toward which incident rays converge is a virtual object.',
            ],
            ['+72 cm', 'This adds coordinates instead of finding separation.'],
            ['−72 cm', 'This has the wrong magnitude.'],
          ],
        }),
        reentry: 'Use the K5 branch-A real-object and virtual-object fresh pair.',
      },
      {
        title: 'Repair branch B · Stage ledger',
        focus: 'One row per element',
        targetFeatures: ['stage-ledger', 'equation-operation', 'model-selection'],
        teaching:
          'For every element record L, object coordinate, signed p, signed q, image coordinate, and stage magnification before moving on.',
        item: makeItem({
          id: 'K5-R2',
          family: 'K5-repair-stage-ledger',
          stage: 'Repair 2 support',
          prompt:
            'Object x=−30; lens 1 at 0 gives I1=+15. Lens 2 is at +45. Which lens-2 row starts correctly?',
          key: 'A',
          cue: 'The rays diverge from I1 and travel 30 cm to lens 2.',
          choices: [
            [
              'L2=45, object x=15, p2=+30',
              'The intermediate image is a real object 30 cm on the incident side.',
            ],
            ['L2=45, object x=−30, p2=+75', 'This reuses the original object.'],
            ['L2=45, object x=15, p2=−30', 'The incident rays are diverging, not converging.'],
            ['L2=45, object x=0, p2=+45', 'The first lens is not the second object.'],
          ],
        }),
        reentry:
          'Use the K5 branch-B fresh simulation pair; stop after this cycle if it does not pass.',
      },
    ],
    handoff:
      'You can now carry an image through a system. Core instruction is complete; the eye application follows without creating another KC.',
  },
];

const EXTENSION_ITEMS: Item[] = [
  makeItem({
    id: 'EXT-P1',
    family: 'EXT-eye-accommodation',
    stage: 'Governed extension prediction',
    prompt:
      'The retina is fixed. When the viewed object moves closer, what must a normally accommodating eye do?',
    key: 'A',
    cue: 'A closer object sends more divergent rays into the eye.',
    choices: [
      [
        'Increase optical power and shorten focal length',
        'More power keeps the real image on the fixed retina.',
      ],
      ['Decrease power and lengthen focal length', 'This moves focus farther behind the retina.'],
      ['Move the retina backward', 'The governed model treats retinal position as fixed.'],
      ['Make the retinal image virtual', 'Physical light must reach the retina.'],
    ],
  }),
  makeItem({
    id: 'EXT-A0',
    family: 'EXT-eye-correction-fresh',
    stage: 'Governed extension application',
    duration: '90 s',
    prompt:
      'A simplified farsighted eye has near point 0.800 m and must view an object at 0.250 m. A touching correction lens should have what power?',
    key: 'A',
    cue: 'Use p = +0.250 m and q = −0.800 m.',
    choices: [
      ['+2.75 D', 'P = 1/0.250 + 1/(−0.800) = 4.00 − 1.25 = +2.75 D.'],
      ['−2.75 D', 'This reverses the correction type.'],
      ['+5.25 D', 'This adds reciprocal magnitudes.'],
      ['−5.25 D', 'This combines sign and magnitude errors.'],
    ],
  }),
];

const K5_BRIDGE_CHECK = makeItem({
  id: 'K4K5-BRIDGE-CHECK-01',
  family: 'K4K5-point-of-use-bridge-fresh-v1',
  stage: 'KC 4 → KC 5 point-of-use bridge',
  duration: '60 s',
  prompt:
    'A converging lens has f = +9.0 cm, p = +18.0 cm, and ho = +4.0 cm. Which stage record is correct?',
  key: 'A',
  cue: 'At p = 2f, the image is at 2f with m = −1.',
  choices: [
    [
      'q = +18.0 cm, m = −1.00, hi = −4.0 cm',
      'The real image is on the far side and inverted at equal size.',
      'correct-model',
    ],
    [
      'q = −18.0 cm, m = +1.00, hi = +4.0 cm',
      'This reverses the real-image sign and orientation.',
      'sign-location',
    ],
    [
      'q = +6.0 cm, m = −0.333, hi = −1.33 cm',
      'This adds reciprocals instead of subtracting 1/p from 1/f.',
      'equation-operation',
    ],
    [
      'q = +27.0 cm, m = −1.50, hi = −6.0 cm',
      'This adds focal and object distances linearly.',
      'equation-operation',
    ],
  ],
});

const K5_BRIDGE_CHECK_REPLACEMENT = makeItem({
  id: 'K4K5-BRIDGE-CHECK-REPLACEMENT-01',
  family: 'K4K5-point-of-use-bridge-invalid-replacement-v1',
  stage: 'Dedicated unexposed bridge-check replacement',
  duration: '60 s',
  prompt:
    'A converging lens has f = +15.0 cm, p = +30.0 cm, and ho = +6.0 cm. Which stage record is correct?',
  key: 'B',
  cue: 'At p = 2f, q = 2f and m = −1.',
  choices: [
    [
      'q = +10.0 cm, m = −0.333, hi = −2.0 cm',
      'This adds reciprocals rather than subtracting.',
      'equation-operation',
    ],
    [
      'q = +30.0 cm, m = −1.00, hi = −6.0 cm',
      'The real image is inverted and equal-size at 2f.',
      'correct-model',
    ],
    [
      'q = −30.0 cm, m = +1.00, hi = +6.0 cm',
      'This reverses image side and orientation.',
      'sign-location',
    ],
    ['q = +45.0 cm, m = −1.50, hi = −9.0 cm', 'This adds linear distances.', 'equation-operation'],
  ],
});

const K5_BRIDGE_REENTRY = makeItem({
  id: 'K4K5-BRIDGE-REENTRY-01',
  family: 'K4K5-point-of-use-reentry-fresh-v1',
  stage: 'Fresh KC 4 bridge reentry',
  duration: '60 s',
  prompt:
    'A converging lens has f = +12.0 cm, p = +36.0 cm, and ho = +4.0 cm. Which stage record is correct?',
  key: 'A',
  cue: 'Use 1/q = 1/12 − 1/36, then m = −q/p.',
  choices: [
    [
      'q = +18.0 cm, m = −0.500, hi = −2.0 cm',
      'The reciprocal equation gives q = +18.0 cm and a real inverted half-size image.',
      'correct-model',
    ],
    [
      'q = −18.0 cm, m = +0.500, hi = +2.0 cm',
      'This swaps the lens image side and orientation.',
      'sign-location',
    ],
    [
      'q = +24.0 cm, m = −0.667, hi = −2.67 cm',
      'This uses linear subtraction rather than reciprocal distances.',
      'equation-operation',
    ],
    [
      'q = +48.0 cm, m = −1.33, hi = −5.33 cm',
      'This uses linear addition rather than the imaging equation.',
      'equation-operation',
    ],
  ],
});

const K5_BRIDGE_REENTRY_REPLACEMENT = makeItem({
  id: 'K4K5-BRIDGE-REENTRY-REPLACEMENT-01',
  family: 'K4K5-point-of-use-reentry-invalid-replacement-v1',
  stage: 'Dedicated unexposed bridge-reentry replacement',
  duration: '60 s',
  prompt:
    'A converging lens has f = +10.0 cm, p = +30.0 cm, and ho = +6.0 cm. Which stage record is correct?',
  key: 'C',
  cue: 'Use 1/q = 1/10 − 1/30, then m = −q/p.',
  choices: [
    [
      'q = −15.0 cm, m = +0.500, hi = +3.0 cm',
      'This reverses image side and orientation.',
      'sign-location',
    ],
    [
      'q = +20.0 cm, m = −0.667, hi = −4.0 cm',
      'This is not the reciprocal result.',
      'equation-operation',
    ],
    [
      'q = +15.0 cm, m = −0.500, hi = −3.0 cm',
      'The reciprocal equation gives a real inverted half-size image.',
      'correct-model',
    ],
    [
      'q = +40.0 cm, m = −1.33, hi = −8.0 cm',
      'This adds focal and object distances.',
      'equation-operation',
    ],
  ],
});

const CAPSTONE_PLACEMENT: CapstonePlacementReference = {
  id: 'V3-CAP-081516',
  placement: 'R14-CAP-081516',
  launchBehavior: 'separate-artifact-required',
  hardEdges: [
    { edgeId: 'V3-EDG-476152', sourceKc: 'V3-KC-493500' },
    { edgeId: 'V3-EDG-748598', sourceKc: 'V3-KC-853697' },
    { edgeId: 'V3-EDG-570038', sourceKc: 'V3-KC-729762' },
  ],
  nonblockingEdges: [
    { edgeId: 'V3-EDG-731587', sourceKc: 'V3-KC-393396', semantics: 'CAPSTONE_COMPONENT_READY' },
  ],
  lessonMayLaunch: false,
};

const REPAIR_INCREMENT_MINUTES: NumberMap = {
  'V3-KC-599193': 3,
  'V3-KC-493500': 4,
  'V3-KC-853697': 4,
  'V3-KC-393396': 4,
  'V3-KC-729762': 4,
};
const MAXIMUM_REPAIR_MINUTES =
  2 * Object.values(REPAIR_INCREMENT_MINUTES).reduce((sum, minutes) => sum + minutes, 0);

const BRIDGE_CHECK_MINUTES = 1;
const BRIDGE_CHECK_REPLACEMENT_MINUTES = 1;
const BRIDGE_REPAIR_MODEL_MINUTES = 2;
const BRIDGE_CONFIRMATION_MINUTES = 1;
const BRIDGE_CONFIRMATION_REPLACEMENT_MINUTES = 1;

const BRIDGE_EPISODE_TIMING = {
  ownership: 'separate-hard-edge-episode' as const,
  relation: 'R14-REM-CP-086 + V3-EDG-403420',
  countsAgainstKc4RepairCap: false,
  countsAgainstKc5RepairCap: false,
  checkMinutes: BRIDGE_CHECK_MINUTES,
  checkReplacementMinutes: BRIDGE_CHECK_REPLACEMENT_MINUTES,
  repairModelMinutes: BRIDGE_REPAIR_MODEL_MINUTES,
  confirmationMinutes: BRIDGE_CONFIRMATION_MINUTES,
  confirmationReplacementMinutes: BRIDGE_CONFIRMATION_REPLACEMENT_MINUTES,
  directPassMinutes: BRIDGE_CHECK_MINUTES,
  worstValidMinutes:
    BRIDGE_CHECK_MINUTES +
    BRIDGE_CHECK_REPLACEMENT_MINUTES +
    BRIDGE_REPAIR_MODEL_MINUTES +
    BRIDGE_CONFIRMATION_MINUTES +
    BRIDGE_CONFIRMATION_REPLACEMENT_MINUTES,
};

const TIMING_CONTRACT = {
  conciseCoreMinutes: 53,
  standardCoreMinutes: 80,
  transitionMinutes: 4,
  repairIncrementMinutes: REPAIR_INCREMENT_MINUTES,
  maximumRepairsPerKc: 2,
  maximumRepairMinutes: MAXIMUM_REPAIR_MINUTES,
  conciseKcShellMinutes: 53 + 4,
  standardKcShellMinutes: 80 + 4,
  conciseNormalPathMinutes: 53 + 4 + BRIDGE_EPISODE_TIMING.directPassMinutes,
  standardNormalPathMinutes: 80 + 4 + BRIDGE_EPISODE_TIMING.directPassMinutes,
  worstValidCoreBranchMinutes:
    80 + 4 + MAXIMUM_REPAIR_MINUTES + BRIDGE_EPISODE_TIMING.worstValidMinutes,
  eyeExtensionMinutes: 8,
  optionalBreakCount: 2,
  optionalBreakMinutesEach: 5,
  optionalBreakMinutesTotal: 10,
  conciseNormalWithEyeMinutes: 53 + 4 + BRIDGE_EPISODE_TIMING.directPassMinutes + 8,
  standardNormalWithEyeMinutes: 80 + 4 + BRIDGE_EPISODE_TIMING.directPassMinutes + 8,
  worstValidWithEyeMinutes:
    80 + 4 + MAXIMUM_REPAIR_MINUTES + BRIDGE_EPISODE_TIMING.worstValidMinutes + 8,
  worstValidWithEyeAndBreaksMinutes:
    80 + 4 + MAXIMUM_REPAIR_MINUTES + BRIDGE_EPISODE_TIMING.worstValidMinutes + 8 + 10,
};

const DEFAULT_SCREENS: StringMap = {
  'V3-KC-599193': 'entry',
  'V3-KC-493500': 'entry',
  'V3-KC-853697': 'entry',
  'V3-KC-393396': 'entry',
  'V3-KC-729762': 'bridge_intro',
};

const DEFAULT_STATUS: StatusMap = {
  'V3-KC-599193': 'in_progress',
  'V3-KC-493500': 'not_started',
  'V3-KC-853697': 'not_started',
  'V3-KC-393396': 'not_started',
  'V3-KC-729762': 'not_started',
};

const DEFAULT_ROUTES: StringMap = {
  'V3-KC-599193': 'standard',
  'V3-KC-493500': 'standard',
  'V3-KC-853697': 'standard',
  'V3-KC-393396': 'standard',
  'V3-KC-729762': 'standard',
};

const DEFAULT_ROUTE_FEATURES: StringMap = {
  'V3-KC-599193': '',
  'V3-KC-493500': '',
  'V3-KC-853697': '',
  'V3-KC-393396': '',
  'V3-KC-729762': '',
};

const DEFAULT_REPAIR_SELECTIONS: StringMap = {
  'V3-KC-599193': '0',
  'V3-KC-493500': '0',
  'V3-KC-853697': '0',
  'V3-KC-393396': '0',
  'V3-KC-729762': '0',
};

const DEFAULT_REPAIR_FEATURES: StringMap = {
  'V3-KC-599193': '',
  'V3-KC-493500': '',
  'V3-KC-853697': '',
  'V3-KC-393396': '',
  'V3-KC-729762': '',
};

const DEFAULT_ZEROES: NumberMap = {
  'V3-KC-599193': 0,
  'V3-KC-493500': 0,
  'V3-KC-853697': 0,
  'V3-KC-393396': 0,
  'V3-KC-729762': 0,
};

function allKcItems(kc: Kc): Item[] {
  return [
    kc.entry,
    kc.disambiguator,
    kc.prediction,
    ...kc.practice,
    ...kc.recovery,
    ...kc.exits.flatMap((set) => [set.near, set.changed]),
    ...kc.repairs.map((repair) => repair.item),
  ];
}

const ALL_LESSON_ITEMS: Item[] = [
  ...KCS.flatMap((kc) => allKcItems(kc)),
  ...EXTENSION_ITEMS,
  K5_BRIDGE_CHECK,
  K5_BRIDGE_CHECK_REPLACEMENT,
  K5_BRIDGE_REENTRY,
  K5_BRIDGE_REENTRY_REPLACEMENT,
];

function presentedItemsForScreen(
  kc: Kc,
  screen: string,
  nearVariant: number,
  changedVariant: number,
  repairSelection: string,
  responses?: ResponseMap,
): Item[] {
  if (kc.number === 5 && screen === 'bridge_gate') return [K5_BRIDGE_CHECK];
  if (kc.number === 5 && screen === 'bridge_gate_replacement') {
    return [K5_BRIDGE_CHECK_REPLACEMENT];
  }
  if (kc.number === 5 && screen === 'bridge_reentry') return [K5_BRIDGE_REENTRY];
  if (kc.number === 5 && screen === 'bridge_reentry_replacement') {
    return [K5_BRIDGE_REENTRY_REPLACEMENT];
  }
  if (screen === 'entry') {
    const entryResponse = responses?.[kc.entry.id];
    return entryResponse?.committed && !entryResponse.correct
      ? [kc.entry, kc.disambiguator]
      : [kc.entry];
  }
  if (screen === 'prediction') return [kc.prediction];
  if (screen === 'a2') return [kc.practice[0]];
  if (screen === 'a1') return [kc.practice[1]];
  if (screen === 'a0') return [kc.practice[2]];
  if (screen === 'a2_recovery') return [kc.recovery[0]];
  if (screen === 'a1_recovery') return [kc.recovery[1]];
  if (screen === 'exit') {
    return [kc.exits[Math.min(nearVariant, 2)].near, kc.exits[Math.min(changedVariant, 2)].changed];
  }
  if (screen === 'repair_check') {
    return [kc.repairs[repairSelection === '1' ? 1 : 0].item];
  }
  return [];
}

function statusLabel(status: KcStatus): string {
  if (status === 'not_started') return 'Not started';
  if (status === 'in_progress') return 'In progress';
  if (status === 'simulated_complete') return 'Complete';
  return 'Review needed';
}

function DiagramViewport({ label, children }: { label: string; children: ReactNode }) {
  const theme = useHostTheme();
  const content = isValidElement<{ children?: ReactNode }>(children)
    ? Children.toArray(children.props.children)
    : Children.toArray(children);
  const [visual, ...textEquivalent] = content;

  return (
    <Stack gap={8}>
      <div
        className="ray-diagram"
        role="group"
        tabIndex={0}
        aria-label={`${label}. Focus or tap enlarges the diagram. Use Close enlarged diagram or press Escape to return.`}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            const activeElement = document.activeElement;
            if (
              activeElement instanceof HTMLElement &&
              event.currentTarget.contains(activeElement)
            ) {
              activeElement.blur();
            }
            event.currentTarget.blur();
          }
        }}
        style={{ background: theme.bg.editor }}
      >
        <button
          type="button"
          className="diagram-close"
          onClick={(event) => event.currentTarget.blur()}
        >
          Close enlarged diagram
        </button>
        <div className="diagram-scroll">{visual}</div>
      </div>
      <details className="lesson-visual-details">
        <summary>Read the diagram as text</summary>
        <Stack gap={8}>{textEquivalent}</Stack>
      </details>
    </Stack>
  );
}

function ReflectionDiagram() {
  const theme = useHostTheme();
  return (
    <DiagramViewport label="Plane-mirror ray trace">
      <Stack gap={8}>
        <svg
          role="img"
          aria-labelledby="reflection-title reflection-desc"
          viewBox="0 0 640 340"
          style={{ width: '100%', minHeight: 220, color: theme.text.primary }}
        >
          <title id="reflection-title">Plane-mirror reflection and virtual image</title>
          <desc id="reflection-desc">
            Source S above a horizontal mirror sends a solid incident ray to P. A solid reflected
            ray travels from P to observer O. A dashed backward extension from P reaches virtual
            image S prime below the mirror. A dot-dash normal passes vertically through P.
          </desc>
          <defs>
            <marker
              id="reflection-arrow"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill={theme.text.primary} />
            </marker>
          </defs>
          <line x1="40" y1="170" x2="600" y2="170" stroke={theme.stroke.focused} strokeWidth="3" />
          <line
            x1="331.4"
            y1="20"
            x2="331.4"
            y2="320"
            stroke={theme.text.tertiary}
            strokeWidth="2"
            strokeDasharray="3 5 10 5"
          />
          <line
            x1="160"
            y1="50"
            x2="331.4"
            y2="170"
            stroke={theme.category.blue}
            strokeWidth="3"
            markerEnd="url(#reflection-arrow)"
          />
          <line
            x1="331.4"
            y1="170"
            x2="560"
            y2="10"
            stroke={theme.category.blue}
            strokeWidth="3"
            markerEnd="url(#reflection-arrow)"
          />
          <line
            x1="331.4"
            y1="170"
            x2="160"
            y2="290"
            stroke={theme.category.orange}
            strokeWidth="2"
            strokeDasharray="7 6"
          />
          <circle cx="160" cy="50" r="5" fill={theme.text.primary} />
          <circle
            cx="160"
            cy="290"
            r="5"
            fill={theme.bg.editor}
            stroke={theme.text.secondary}
            strokeWidth="2"
          />
          <circle cx="331.4" cy="170" r="5" fill={theme.accent.primary} />
          <circle cx="560" cy="10" r="5" fill={theme.text.primary} />
          <text x="132" y="38" fill={theme.text.secondary}>
            S (−4, 3)
          </text>
          <text x="120" y="314" fill={theme.text.secondary}>
            S′ (−4, −3)
          </text>
          <text x="340" y="162" fill={theme.text.secondary}>
            P (2/7, 0)
          </text>
          <text x="548" y="32" fill={theme.text.secondary}>
            O (6, 4)
          </text>
          <text x="48" y="160" fill={theme.text.tertiary}>
            mirror y = 0
          </text>
          <text x="340" y="38" fill={theme.text.tertiary}>
            normal
          </text>
        </svg>
        <Text size="small" tone="secondary">
          Solid = physical ray · dashed = virtual backward extension · dot-dash = normal.
        </Text>
        <Table
          headers={['Feature', 'Mathematical coordinates', 'Meaning']}
          rows={[
            ['Mirror', 'y = 0', 'Horizontal reflecting boundary'],
            ['Source / image', 'S(−4,3), S′(−4,−3)', 'Equal perpendicular distances'],
            ['Path', 'S → P → O', 'Physical incident and reflected light'],
            ['Extension', 'P → S′', 'Apparent origin only; no light behind mirror'],
          ]}
          striped
        />
      </Stack>
    </DiagramViewport>
  );
}

function RefractionDiagram() {
  const theme = useHostTheme();
  return (
    <DiagramViewport label="Refraction ray trace">
      <Stack gap={8}>
        <svg
          role="img"
          aria-labelledby="refraction-title refraction-desc"
          viewBox="0 0 640 300"
          style={{ width: '100%', minHeight: 220, color: theme.text.primary }}
        >
          <title id="refraction-title">Air-to-glass refraction measured from the normal</title>
          <desc id="refraction-desc">
            A ray in air approaches the origin from upper left at forty degrees from the downward
            normal. In glass it continues down and right at 25.4 degrees, closer to the normal.
          </desc>
          <defs>
            <marker
              id="refraction-arrow"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill={theme.text.primary} />
            </marker>
          </defs>
          <rect x="30" y="35" width="580" height="115" fill={theme.fill.quaternary} />
          <rect x="30" y="150" width="580" height="115" fill={theme.fill.tertiary} />
          <line x1="30" y1="150" x2="610" y2="150" stroke={theme.stroke.focused} strokeWidth="2" />
          <line
            x1="320"
            y1="28"
            x2="320"
            y2="272"
            stroke={theme.text.tertiary}
            strokeWidth="2"
            strokeDasharray="3 5 10 5"
          />
          <line
            x1="230"
            y1="43"
            x2="320"
            y2="150"
            stroke={theme.category.blue}
            strokeWidth="3"
            markerEnd="url(#refraction-arrow)"
          />
          <line
            x1="320"
            y1="150"
            x2="380"
            y2="277"
            stroke={theme.category.blue}
            strokeWidth="3"
            markerEnd="url(#refraction-arrow)"
          />
          <path
            d="M320 95 A55 55 0 0 0 285 108"
            fill="none"
            stroke={theme.category.orange}
            strokeWidth="2"
          />
          <path
            d="M320 205 A55 55 0 0 1 350 200"
            fill="none"
            stroke={theme.category.orange}
            strokeWidth="2"
          />
          <text x="48" y="60" fill={theme.text.secondary}>
            medium 1 · air · n₁ = 1.00
          </text>
          <text x="48" y="245" fill={theme.text.secondary}>
            medium 2 · glass · n₂ = 1.50
          </text>
          <text x="330" y="48" fill={theme.text.tertiary}>
            normal x = 0
          </text>
          <text x="438" y="142" fill={theme.text.tertiary}>
            interface y = 0
          </text>
          <text x="262" y="102" fill={theme.text.secondary}>
            θ₁ = 40.0°
          </text>
          <text x="350" y="208" fill={theme.text.secondary}>
            θ₂ = 25.4°
          </text>
          <text x="328" y="142" fill={theme.text.secondary}>
            P
          </text>
        </svg>
        <Text size="small" tone="secondary">
          Angles are from the dot-dash normal. The lower angle is smaller because n₂ &gt; n₁.
        </Text>
        <Table
          headers={['Feature', 'Coordinates / value', 'Meaning']}
          rows={[
            ['Interface', 'y = 0', 'Air above; glass below'],
            ['Normal', 'x = 0', 'Reference for both angles'],
            ['Incident endpoint', '(−4 sin40°, 4 cos40°)', 'Approaches P at 40.0°'],
            [
              'Refracted endpoint',
              '(4 sin25.374°, −4 cos25.374°)',
              'Continues at 25.4° toward normal',
            ],
          ]}
          striped
        />
      </Stack>
    </DiagramViewport>
  );
}

function MirrorDiagram() {
  const theme = useHostTheme();
  return (
    <DiagramViewport label="Concave-mirror principal-ray trace">
      <Stack gap={8}>
        <svg
          role="img"
          aria-labelledby="mirror-title mirror-desc"
          viewBox="0 0 640 300"
          style={{ width: '100%', minHeight: 220, color: theme.text.primary }}
        >
          <title id="mirror-title">Concave mirror principal-ray image</title>
          <desc id="mirror-desc">
            A six-centimeter upright object at x minus 36 centimeters stands left of a concave
            mirror at x zero. Reflected rays physically cross at x minus 18 centimeters and three
            centimeters below the axis, forming a real inverted image.
          </desc>
          <defs>
            <marker
              id="mirror-arrow"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill={theme.text.primary} />
            </marker>
          </defs>
          <line
            x1="40"
            y1="155"
            x2="600"
            y2="155"
            stroke={theme.text.tertiary}
            strokeWidth="2"
            strokeDasharray="3 5 10 5"
          />
          <path
            d="M565 40 Q540 155 565 270"
            fill="none"
            stroke={theme.stroke.focused}
            strokeWidth="4"
          />
          <line
            x1="108"
            y1="155"
            x2="108"
            y2="83"
            stroke={theme.text.primary}
            strokeWidth="3"
            markerEnd="url(#mirror-arrow)"
          />
          <line
            x1="324"
            y1="155"
            x2="324"
            y2="191"
            stroke={theme.text.primary}
            strokeWidth="3"
            markerEnd="url(#mirror-arrow)"
          />
          <line x1="108" y1="83" x2="540" y2="83" stroke={theme.category.blue} strokeWidth="3" />
          <line
            x1="540"
            y1="83"
            x2="324"
            y2="191"
            stroke={theme.category.blue}
            strokeWidth="3"
            markerEnd="url(#mirror-arrow)"
          />
          <line x1="108" y1="83" x2="540" y2="191" stroke={theme.category.orange} strokeWidth="3" />
          <line
            x1="540"
            y1="191"
            x2="324"
            y2="191"
            stroke={theme.category.orange}
            strokeWidth="3"
            markerEnd="url(#mirror-arrow)"
          />
          <circle cx="396" cy="155" r="4" fill={theme.accent.primary} />
          <circle cx="252" cy="155" r="4" fill={theme.accent.primary} />
          <text x="382" y="174" fill={theme.text.secondary}>
            F (−12, 0)
          </text>
          <text x="238" y="174" fill={theme.text.secondary}>
            C (−24, 0)
          </text>
          <text x="42" y="145" fill={theme.text.tertiary}>
            optical axis
          </text>
          <text x="78" y="70" fill={theme.text.secondary}>
            object +6 cm
          </text>
          <text x="294" y="214" fill={theme.text.secondary}>
            image −3 cm
          </text>
          <text x="526" y="30" fill={theme.text.secondary}>
            V (0, 0)
          </text>
        </svg>
        <Text size="small" tone="secondary">
          Paraxial vertex-plane construction; the curve marks the concave mirror class. Solid
          reflected rays physically meet, so q = +18 cm even though the plotted x-coordinate is −18
          cm.
        </Text>
        <Table
          headers={['Feature', 'Coordinates', 'Sign / interpretation']}
          rows={[
            ['Mirror vertex', 'V(0,0), reflective side left', 'Concave; f = +12 cm'],
            ['Object', 'base (−36,0), tip (−36,6)', 'p = +36 cm'],
            ['Image', 'base (−18,0), tip (−18,−3)', 'q = +18 cm; real, inverted'],
            ['Focus / center', 'F(−12,0), C(−24,0)', 'Image lies between F and C'],
          ]}
          striped
        />
      </Stack>
    </DiagramViewport>
  );
}

function LensDiagram() {
  const theme = useHostTheme();
  return (
    <DiagramViewport label="Converging-lens principal-ray trace">
      <Stack gap={8}>
        <svg
          role="img"
          aria-labelledby="lens-title lens-desc"
          viewBox="0 0 760 300"
          style={{ width: '100%', minHeight: 220, color: theme.text.primary }}
        >
          <title id="lens-title">Converging thin-lens principal-ray image</title>
          <desc id="lens-desc">
            A two-centimeter upright object at x minus 30 centimeters sends one parallel ray and one
            center ray through a converging lens at x zero. The rays meet at x plus 60 centimeters,
            four centimeters below the axis.
          </desc>
          <defs>
            <marker
              id="lens-arrow"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill={theme.text.primary} />
            </marker>
          </defs>
          <line
            x1="30"
            y1="150"
            x2="735"
            y2="150"
            stroke={theme.text.tertiary}
            strokeWidth="2"
            strokeDasharray="3 5 10 5"
          />
          <path
            d="M340 38 Q312 150 340 262 M340 38 Q368 150 340 262"
            fill="none"
            stroke={theme.stroke.focused}
            strokeWidth="3"
          />
          <line
            x1="160"
            y1="150"
            x2="160"
            y2="110"
            stroke={theme.text.primary}
            strokeWidth="3"
            markerEnd="url(#lens-arrow)"
          />
          <line
            x1="700"
            y1="150"
            x2="700"
            y2="230"
            stroke={theme.text.primary}
            strokeWidth="3"
            markerEnd="url(#lens-arrow)"
          />
          <line x1="160" y1="110" x2="340" y2="110" stroke={theme.category.blue} strokeWidth="3" />
          <line
            x1="340"
            y1="110"
            x2="700"
            y2="230"
            stroke={theme.category.blue}
            strokeWidth="3"
            markerEnd="url(#lens-arrow)"
          />
          <line
            x1="160"
            y1="110"
            x2="700"
            y2="230"
            stroke={theme.category.orange}
            strokeWidth="3"
            markerEnd="url(#lens-arrow)"
          />
          <circle cx="220" cy="150" r="4" fill={theme.accent.primary} />
          <circle cx="460" cy="150" r="4" fill={theme.accent.primary} />
          <text x="202" y="170" fill={theme.text.secondary}>
            Fnear −20
          </text>
          <text x="448" y="170" fill={theme.text.secondary}>
            Ffar +20
          </text>
          <text x="36" y="140" fill={theme.text.tertiary}>
            optical axis
          </text>
          <text x="128" y="98" fill={theme.text.secondary}>
            object
          </text>
          <text x="674" y="254" fill={theme.text.secondary}>
            image
          </text>
          <text x="348" y="50" fill={theme.text.secondary}>
            lens x = 0
          </text>
        </svg>
        <Text size="small" tone="secondary">
          The parallel ray refracts through the far focus; the center ray is undeviated.
        </Text>
        <Table
          headers={['Feature', 'Coordinates', 'Sign / interpretation']}
          rows={[
            ['Lens', 'center (0,0)', 'Converging; f = +20 cm'],
            ['Object', 'base (−30,0), tip (−30,2)', 'p = +30 cm'],
            ['Image', 'base (+60,0), tip (+60,−4)', 'q = +60 cm; real, inverted'],
            ['Foci', '(−20,0), (+20,0)', 'Image is beyond 2F'],
          ]}
          striped
        />
      </Stack>
    </DiagramViewport>
  );
}

function CompoundDiagram() {
  const theme = useHostTheme();
  return (
    <DiagramViewport label="Two-lens ray trace on one coordinate axis">
      <Stack gap={8}>
        <svg
          role="img"
          aria-labelledby="compound-title compound-desc"
          viewBox="0 0 820 300"
          style={{ width: '100%', minHeight: 220, color: theme.text.primary }}
        >
          <title id="compound-title">Two-lens propagation on one coordinate axis</title>
          <desc id="compound-desc">
            An upright object at x minus 30 centimeters is imaged by lens 1 at x zero to an inverted
            intermediate image at x plus 15. Lens 2 at x plus 35 uses that intermediate image as a
            real object and forms an upright final image at x plus 55.
          </desc>
          <defs>
            <marker
              id="compound-arrow"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill={theme.text.primary} />
            </marker>
          </defs>
          <line
            x1="30"
            y1="150"
            x2="790"
            y2="150"
            stroke={theme.text.tertiary}
            strokeWidth="2"
            strokeDasharray="3 5 10 5"
          />
          <path
            d="M300 45 Q275 150 300 255 M300 45 Q325 150 300 255"
            fill="none"
            stroke={theme.stroke.focused}
            strokeWidth="3"
          />
          <path
            d="M580 45 Q555 150 580 255 M580 45 Q605 150 580 255"
            fill="none"
            stroke={theme.stroke.focused}
            strokeWidth="3"
          />
          <line
            x1="60"
            y1="150"
            x2="60"
            y2="80"
            stroke={theme.text.primary}
            strokeWidth="3"
            markerEnd="url(#compound-arrow)"
          />
          <line
            x1="420"
            y1="150"
            x2="420"
            y2="185"
            stroke={theme.text.primary}
            strokeWidth="3"
            markerEnd="url(#compound-arrow)"
          />
          <line
            x1="740"
            y1="150"
            x2="740"
            y2="115"
            stroke={theme.text.primary}
            strokeWidth="3"
            markerEnd="url(#compound-arrow)"
          />
          <polyline
            points="60,80 300,80 420,185"
            fill="none"
            stroke={theme.category.blue}
            strokeWidth="3"
            markerEnd="url(#compound-arrow)"
          />
          <polyline
            points="60,80 300,150 420,185"
            fill="none"
            stroke={theme.category.orange}
            strokeWidth="3"
            markerEnd="url(#compound-arrow)"
          />
          <polyline
            points="420,185 580,185 740,115"
            fill="none"
            stroke={theme.category.blue}
            strokeWidth="3"
            markerEnd="url(#compound-arrow)"
          />
          <polyline
            points="420,185 580,150 740,115"
            fill="none"
            stroke={theme.category.orange}
            strokeWidth="3"
            markerEnd="url(#compound-arrow)"
          />
          <text x="32" y="66" fill={theme.text.secondary}>
            object x = −30
          </text>
          <text x="34" y="140" fill={theme.text.tertiary}>
            shared optical axis
          </text>
          <text x="275" y="35" fill={theme.text.secondary}>
            L1 x = 0
          </text>
          <text x="388" y="207" fill={theme.text.secondary}>
            I1 x = 15
          </text>
          <text x="555" y="35" fill={theme.text.secondary}>
            L2 x = 35
          </text>
          <text x="700" y="103" fill={theme.text.secondary}>
            If x = 55
          </text>
        </svg>
        <Text size="small" tone="secondary">
          The intermediate image is the second lens’s object. Heights show two inversions and an
          upright final image.
        </Text>
        <Table
          headers={['Stage', 'Element / object', 'Result']}
          rows={[
            ['1', 'L1 = 0; object x = −30; p1 = +30', 'q1 = +15; I1 = +15; m1 = −0.5'],
            ['2', 'L2 = +35; object x = +15; p2 = +20', 'q2 = +20; If = +55; m2 = −1'],
            ['Total', 'mtotal = m1m2', '+0.5; final height +1 cm'],
          ]}
          striped
        />
      </Stack>
    </DiagramViewport>
  );
}

function EyeDiagram() {
  const theme = useHostTheme();
  return (
    <DiagramViewport label="Eye and retina ray trace">
      <Stack gap={8}>
        <svg
          role="img"
          aria-labelledby="eye-title eye-desc"
          viewBox="0 0 640 260"
          style={{ width: '100%', minHeight: 200, color: theme.text.primary }}
        >
          <title id="eye-title">Governed eye-as-optical-instrument model</title>
          <desc id="eye-desc">
            Parallel rays enter from the left, pass through an effective converging eye lens at x
            zero, and meet as a real inverted image on the fixed retina at x plus 1.8 centimeters.
          </desc>
          <defs>
            <marker
              id="eye-arrow"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill={theme.text.primary} />
            </marker>
          </defs>
          <line
            x1="30"
            y1="130"
            x2="610"
            y2="130"
            stroke={theme.text.tertiary}
            strokeWidth="2"
            strokeDasharray="3 5 10 5"
          />
          <path
            d="M310 35 Q275 130 310 225 M310 35 Q345 130 310 225"
            fill="none"
            stroke={theme.stroke.focused}
            strokeWidth="3"
          />
          <path
            d="M570 35 Q610 130 570 225"
            fill="none"
            stroke={theme.stroke.focused}
            strokeWidth="4"
          />
          <line x1="40" y1="70" x2="310" y2="70" stroke={theme.category.blue} strokeWidth="3" />
          <line
            x1="310"
            y1="70"
            x2="570"
            y2="150"
            stroke={theme.category.blue}
            strokeWidth="3"
            markerEnd="url(#eye-arrow)"
          />
          <line x1="40" y1="190" x2="310" y2="190" stroke={theme.category.orange} strokeWidth="3" />
          <line
            x1="310"
            y1="190"
            x2="570"
            y2="150"
            stroke={theme.category.orange}
            strokeWidth="3"
            markerEnd="url(#eye-arrow)"
          />
          <text x="42" y="55" fill={theme.text.secondary}>
            distant parallel rays
          </text>
          <text x="36" y="120" fill={theme.text.tertiary}>
            optical axis
          </text>
          <text x="270" y="25" fill={theme.text.secondary}>
            effective eye lens x = 0
          </text>
          <text x="540" y="25" fill={theme.text.secondary}>
            retina x = +1.8 cm
          </text>
          <text x="500" y="174" fill={theme.text.secondary}>
            real image
          </text>
        </svg>
        <Text size="small" tone="secondary">
          Simplified eye model; the labels show the lens plane and fixed retinal plane.
        </Text>
        <Table
          headers={['Feature', 'Model value', 'Interpretation']}
          rows={[
            ['Effective eye lens', 'x = 0', 'Compact converging cornea-plus-lens model'],
            ['Retina', 'x = +1.8 cm', 'Fixed image plane'],
            ['Distant input', 'Parallel rays', 'p approaches infinity'],
            ['Clear image', 'At retina', 'Real and inverted; physical light reaches retina'],
          ]}
          striped
        />
      </Stack>
    </DiagramViewport>
  );
}

function Diagram({ kind }: { kind: Kc['diagram'] }) {
  if (kind === 'reflection') return <ReflectionDiagram />;
  if (kind === 'refraction') return <RefractionDiagram />;
  if (kind === 'mirror') return <MirrorDiagram />;
  if (kind === 'lens') return <LensDiagram />;
  return <CompoundDiagram />;
}

function EquationStrip({ kind }: { kind: 'reflection' | 'refraction' | 'imaging' | 'compound' }) {
  const theme = useHostTheme();
  const formula =
    kind === 'reflection'
      ? 'θr = θi'
      : kind === 'refraction'
        ? 'n₁ sin θ₁ = n₂ sin θ₂  ·  θc = sin⁻¹(n₂/n₁), n₁ > n₂'
        : kind === 'imaging'
          ? '1/p + 1/q = 1/f  ·  m = −q/p  ·  P = 1/f(m)'
          : 'xIj = Lj + qj  ·  pj+1 from ray state  ·  mtotal = ∏mj';
  return (
    <div
      role="math"
      aria-label={
        kind === 'reflection'
          ? 'theta reflected equals theta incident'
          : kind === 'refraction'
            ? 'n one sine theta one equals n two sine theta two; critical angle equals inverse sine of n two over n one'
            : kind === 'imaging'
              ? 'one over p plus one over q equals one over f; magnification equals negative q over p; power equals one over focal length in meters'
              : 'image coordinate equals element coordinate plus q; determine each next p from ray state; total magnification is the product of stage magnifications'
      }
      style={{
        padding: '10px 12px',
        borderLeft: `3px solid ${theme.accent.primary}`,
        background: theme.fill.quaternary,
        color: theme.text.primary,
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        fontSize: 14,
        overflowX: 'auto',
      }}
    >
      {formula}
    </div>
  );
}

const LEARNER_FEATURE_LABELS: Record<ResponseFeature, string> = {
  'correct-model': 'choosing the optical rule',
  'angle-reference': 'measuring angles from the normal',
  'ray-transform': 'changing the correct ray component',
  'model-selection': 'choosing the right optical model',
  'equation-operation': 'using reciprocal distances',
  'index-direction': 'predicting the bend direction',
  'threshold-direction': 'checking when total internal reflection can occur',
  'dispersion-order': 'ordering colors by refractive index',
  'sign-location': 'connecting image side to its sign',
  'power-units': 'converting diopters and meters',
  'stage-ledger': 'carrying one image into the next stage',
  'ray-state': 'deciding whether arriving rays converge or diverge',
  'non-targetable': 'the current optics decision',
};

const FEATURE_VISUAL_TRACES: Record<ResponseFeature, string> = {
  'correct-model':
    'Name the boundary or element first, then follow only the physical ray segments it permits.',
  'angle-reference': 'Find the normal at the contact point and compare each angle to that line.',
  'ray-transform':
    'Separate the ray direction into a component along the surface and a component perpendicular to it; reverse only the perpendicular component.',
  'model-selection':
    'Use solid lines for traveling light and dashed lines only for backward extensions.',
  'equation-operation':
    'Mark p and f on the picture, write 1/q = 1/f − 1/p, and invert only after the reciprocal subtraction.',
  'index-direction':
    'Compare each ray to the normal: the higher-index side must have the smaller angle.',
  'threshold-direction':
    'Trace the ray from the higher-index side first, then compare its normal angle with the critical angle.',
  'dispersion-order':
    'The color with the larger index lies closer to the normal inside the material.',
  'sign-location':
    'Point to the image side before assigning q; then use the arrow direction to check the sign of magnification.',
  'power-units':
    'Write focal length beside the lens in meters before converting power with P = 1/f.',
  'stage-ledger':
    'Circle the first image I1, then measure from I1—not the original object—to the next lens.',
  'ray-state':
    'At the next lens, ask whether the arriving rays spread from I1 or head toward I1 before choosing the sign of p.',
  'non-targetable': 'Trace one physical ray from its start to the next optical decision.',
};

const MODEL_TRACE_NOTES: Record<number, string[]> = {
  1: [
    'At P, start with the dot-dash normal. Compare each solid blue segment to that line, not to the mirror.',
    'Follow the solid ray only to the mirror. Behind the mirror, switch to the dashed extension; it marks an apparent source, not traveling light.',
    'Compare S and S′: their perpendicular distances from the mirror match while their sides reverse.',
  ],
  2: [
    'Follow the blue ray from air into glass. It turns toward the vertical normal because the second index is larger.',
    'The picture predicts θ₂ < θ₁; the index ratio in Snell’s law must preserve that direction.',
    'For high-to-low travel, first imagine the transmitted ray opening away from the normal. Only angles beyond the critical value remove that ray.',
    'A larger violet index would place the violet ray slightly closer to the normal than the red ray.',
  ],
  3: [
    'The parallel blue ray reflects through F. A second principal ray confirms where the solid rays cross.',
    'The solid rays meet on the object side, so this plotted intersection is a real image with q > 0.',
    'Use one parallel ray and one second principal ray; their intersection fixes the image before any arithmetic check.',
    'The image arrow lies below the axis, matching negative magnification from m = −q/p.',
  ],
  4: [
    'A ray parallel to the axis bends through the far focus of this converging lens.',
    'The two solid rays meet on the far side, so q is positive and the image is real.',
    'Trace the orange center ray straight through the lens; its crossing with the blue ray fixes the image.',
    'The image is twice as tall and below the axis, matching m = −2 from the equation.',
  ],
  5: [
    'Read every location on the same horizontal axis: object, lens 1, intermediate image, lens 2, final image.',
    'At lens 2, the rays are diverging from I1 on its left, so I1 is a real object for lens 2.',
    'Finish lens 1 and place I1 before measuring the distance from I1 to lens 2.',
    'Start stage 2 at I1, not at the original object. The second pair of rays ends at the final image.',
    'Because the lenses are separated, the space between them matters; follow both stages rather than adding powers.',
  ],
};

function learnerPhase(screen: string): 'Check' | 'Learn' | 'Practice' | 'Final check' {
  if (
    screen === 'entry' ||
    screen === 'route_result' ||
    screen === 'prediction' ||
    screen.includes('bridge_gate') ||
    screen.includes('bridge_reentry')
  ) {
    return 'Check';
  }
  if (screen === 'a2' || screen === 'a1' || screen === 'a0' || screen.includes('_recovery')) {
    return 'Practice';
  }
  if (screen === 'exit' || screen === 'handoff' || screen === 'pause') {
    return 'Final check';
  }
  return 'Learn';
}

function LearnerProgress({ kc, screen }: { kc: Kc; screen: string }) {
  const phases = ['Check', 'Learn', 'Practice', 'Final check'] as const;
  const currentPhase = learnerPhase(screen);
  const currentIndex = phases.indexOf(currentPhase);
  const progress = ((currentIndex + 1) / phases.length) * 100;

  return (
    <div className="lesson-progress">
      <div className="lesson-progress__topline">
        <Text size="small" tone="secondary">{`Topic ${kc.number} of 5`}</Text>
        <Text size="small" tone="secondary">
          {currentPhase}
        </Text>
      </div>
      <div
        className="lesson-progress__track"
        role="progressbar"
        aria-label={`Progress through ${kc.title}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress}
      >
        <span style={{ width: `${progress}%` }} />
      </div>
      <ol className="lesson-progress__phases">
        {phases.map((phase, index) => (
          <li key={phase} aria-current={index === currentIndex ? 'step' : undefined}>
            {phase}
          </li>
        ))}
      </ol>
    </div>
  );
}

function Question({
  item,
  responses,
  setResponses,
  hints,
  setHints,
  isExit = false,
  revealFeedback = true,
  kcId,
  onEvent,
  familyExposures,
  runId,
  reviewerExposedThisRun,
  onCommitted,
}: {
  item: Item;
  responses: ResponseMap;
  setResponses: SetCanvasState<ResponseMap>;
  hints: BoolMap;
  setHints: SetCanvasState<BoolMap>;
  isExit?: boolean;
  revealFeedback?: boolean;
  kcId?: string;
  onEvent?: (event: EventInput) => void;
  familyExposures: FamilyExposureMap;
  runId: string;
  reviewerExposedThisRun: boolean;
  onCommitted?: (response: ResponseRecord) => void;
}) {
  const theme = useHostTheme();
  const response = responses[item.id];
  const committed = response?.committed ?? false;
  const selected = response?.selection ?? '';
  const assisted = hints[item.id] ?? false;
  const promptId = `${item.id}-prompt`;
  const familyRuns = familyExposures[item.family] ?? [];
  const rehearsalOnly =
    familyRuns.some((exposedRunId) => exposedRunId !== runId) ||
    familyRuns.filter((exposedRunId) => exposedRunId === runId).length > 1 ||
    (reviewerExposedThisRun && familyRuns.includes(runId));

  const choose = (selection: string) => {
    if (committed) return;
    const option = item.options.find((candidate) => candidate.id === selection);
    setResponses((previous) => ({
      ...previous,
      [item.id]: {
        selection,
        committed: false,
        correct: selection === item.key,
        assisted,
        kind: 'answer',
      },
    }));
    onEvent?.({
      type: 'response_selected',
      kcId,
      itemId: item.id,
      family: item.family,
      feature: option?.feature,
      note: 'Selection changed before commitment.',
    });
  };

  const commit = (kind: ResponseRecord['kind'] = 'answer') => {
    if (committed) return;
    const selection =
      kind === 'answer'
        ? selected
        : kind === 'not_sure'
          ? '__not_sure__'
          : kind === 'omission'
            ? '__omission__'
            : '__invalid__';
    if (kind === 'answer' && !selection) return;
    const option = item.options.find((candidate) => candidate.id === selection);
    const nextResponse: ResponseRecord = {
      selection,
      committed: true,
      correct: kind === 'answer' && selection === item.key,
      assisted: hints[item.id] ?? false,
      kind,
    };
    setResponses((previous) => ({
      ...previous,
      [item.id]: nextResponse,
    }));
    onEvent?.({
      type: kind === 'invalid' ? 'item_marked_invalid' : 'attempt_submitted',
      kcId,
      itemId: item.id,
      family: item.family,
      feature: option?.feature ?? kind,
      note: `Committed ${kind} response; simulation only.`,
    });
    onCommitted?.(nextResponse);
  };

  const requestHint = () => {
    setHints((previous) => ({ ...previous, [item.id]: true }));
    onEvent?.({
      type: 'hint_requested',
      kcId,
      itemId: item.id,
      family: item.family,
      note: isExit
        ? 'Exit simulation marked assisted; fresh family required.'
        : 'Instructional attempt marked assisted.',
    });
  };

  const selectedOption = item.options.find((option) => option.id === response?.selection);
  const keyOption = item.options.find((option) => option.id === item.key);

  return (
    <section className="lesson-question" aria-labelledby={promptId}>
      <Stack gap={12}>
        {rehearsalOnly && (
          <Callout tone="warning" title="Review question">
            You have seen this question before. Use it to practice; the lesson will use a fresh
            final check when one is available.
          </Callout>
        )}
        <Text weight="semibold" as="p" style={{ margin: 0 }}>
          <span id={promptId}>{item.prompt}</span>
        </Text>
        <fieldset
          aria-labelledby={promptId}
          disabled={committed}
          style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}
        >
          <legend
            style={{
              position: 'absolute',
              width: 1,
              height: 1,
              overflow: 'hidden',
              clip: 'rect(0 0 0 0)',
            }}
          >
            Choose one response
          </legend>
          <div style={{ display: 'grid', gap: 8 }}>
            {item.options.map((option) => {
              const active = selected === option.id;
              const showCorrect = committed && revealFeedback && option.id === item.key;
              const showIncorrect = committed && revealFeedback && active && option.id !== item.key;
              const borderColor = showCorrect
                ? theme.category.green
                : showIncorrect
                  ? theme.category.red
                  : active
                    ? theme.accent.primary
                    : theme.stroke.secondary;
              return (
                <label
                  key={option.id}
                  className="lesson-choice"
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '22px 24px minmax(0, 1fr)',
                    gap: 10,
                    alignItems: 'center',
                    width: '100%',
                    minHeight: 48,
                    padding: '11px 14px',
                    textAlign: 'left',
                    color: theme.text.primary,
                    background: active ? theme.fill.secondary : theme.bg.editor,
                    border: `1px solid ${borderColor}`,
                    borderRadius: 12,
                    cursor: committed ? 'default' : 'pointer',
                  }}
                >
                  <input
                    type="radio"
                    name={`question-${item.id}`}
                    value={option.id}
                    checked={active}
                    disabled={committed}
                    onChange={() => choose(option.id)}
                    style={{ margin: 0, accentColor: theme.accent.control }}
                  />
                  <span
                    aria-hidden="true"
                    style={{
                      color: active ? theme.accent.primary : theme.text.secondary,
                      fontWeight: 700,
                    }}
                  >
                    {option.id}
                  </span>
                  <span>{option.text}</span>
                </label>
              );
            })}
          </div>
        </fieldset>
        {!committed && (
          <div className="lesson-question__actions">
            <Button
              variant="primary"
              disabled={!selected}
              onClick={() => commit('answer')}
              style={{ width: '100%' }}
            >
              Check answer
            </Button>
            <details className="lesson-question-more">
              <summary>Need help or another option?</summary>
              <div className="lesson-question-more__actions">
                <Button variant="secondary" onClick={() => commit('not_sure')}>
                  I’m not sure
                </Button>
                <Button variant="ghost" onClick={requestHint} disabled={assisted}>
                  {assisted ? 'Hint shown' : 'Show hint'}
                </Button>
                <Button variant="ghost" onClick={() => commit('omission')}>
                  Skip for now
                </Button>
                <Button variant="ghost" onClick={() => commit('invalid')}>
                  Report a problem
                </Button>
              </div>
            </details>
          </div>
        )}
        {assisted && !committed && (
          <Callout tone={isExit ? 'warning' : 'info'} title={isExit ? 'Hint used' : 'Hint'}>
            {isExit
              ? `${item.cue} After this set, the lesson will offer a fresh final check so you can try without the hint.`
              : item.cue}
          </Callout>
        )}
        <div role="status" aria-live="polite" aria-atomic="true">
          {committed && !revealFeedback && (
            <Callout tone="neutral" title="Response recorded">
              Response recorded. Results remain hidden until this set closes.
            </Callout>
          )}
          {committed && revealFeedback && response.kind === 'not_sure' && (
            <Stack gap={8}>
              <Callout tone="info" title="Let’s make the step smaller">
                No answer was scored. Open the hint, then use it to identify the next ray or
                equation decision.
              </Callout>
              {!hints[item.id] ? (
                <Button variant="secondary" onClick={requestHint}>
                  Show hint
                </Button>
              ) : (
                <Text tone="secondary">{item.cue}</Text>
              )}
            </Stack>
          )}
          {committed && revealFeedback && response.kind === 'omission' && (
            <Stack gap={8}>
              <Callout tone="neutral" title="Skipped for now">
                No answer was scored. Review the hint before continuing.
              </Callout>
              {!hints[item.id] ? (
                <Button variant="secondary" onClick={requestHint}>
                  Show hint
                </Button>
              ) : (
                <Text tone="secondary">{item.cue}</Text>
              )}
            </Stack>
          )}
          {committed && revealFeedback && response.kind === 'invalid' && (
            <Callout tone="warning" title="Question problem reported">
              This question will not count. Continue to a fresh question when one is available.
            </Callout>
          )}
          {committed && revealFeedback && response.kind === 'answer' && (
            <Callout
              tone={response.correct ? 'success' : 'warning'}
              title={response.correct ? 'Correct' : 'Not yet'}
            >
              {response.correct
                ? selectedOption?.rationale
                : `${selectedOption?.rationale ?? 'That choice does not match the ray model.'} Best answer: ${keyOption?.text}. ${keyOption?.rationale}`}
              {response.assisted ? ' You used a hint on this attempt.' : ''}
            </Callout>
          )}
        </div>
      </Stack>
    </section>
  );
}

function ContinueButton({
  label,
  disabled,
  onClick,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <div className="lesson-continue">
      <Button variant="primary" disabled={disabled} onClick={onClick} style={{ width: '100%' }}>
        {label}
      </Button>
    </div>
  );
}

function RouteSummary({
  kc,
  route,
  routeFeature,
}: {
  kc: Kc;
  route: string;
  routeFeature: string;
}) {
  const support =
    route === 'targeted' && routeFeature
      ? ` We’ll spend extra time on ${LEARNER_FEATURE_LABELS[routeFeature as ResponseFeature] ?? 'this decision'}.`
      : '';
  return (
    <Text tone="secondary">
      {route === 'concise' ? kc.concise : kc.standard}
      {support}
    </Text>
  );
}

function LearnerKc({
  kc,
  screen,
  route,
  routeFeature,
  responses,
  setResponses,
  hints,
  setHints,
  repairCycle,
  setRepairCycle,
  nearVariant,
  changedVariant,
  setNearVariant,
  setChangedVariant,
  setScreen,
  setRoute,
  setRouteFeature,
  setStatus,
  repairSelection,
  setRepairSelection,
  repairFeature,
  setRepairFeature,
  contaminated,
  familyExposures,
  runId,
  reviewerExposedThisRun,
  onEvent,
  goToTarget,
}: {
  kc: Kc;
  screen: string;
  route: string;
  routeFeature: string;
  responses: ResponseMap;
  setResponses: SetCanvasState<ResponseMap>;
  hints: BoolMap;
  setHints: SetCanvasState<BoolMap>;
  repairCycle: number;
  setRepairCycle: SetCanvasState<NumberMap>;
  nearVariant: number;
  changedVariant: number;
  setNearVariant: SetCanvasState<NumberMap>;
  setChangedVariant: SetCanvasState<NumberMap>;
  setScreen: SetCanvasState<StringMap>;
  setRoute: SetCanvasState<StringMap>;
  setRouteFeature: SetCanvasState<StringMap>;
  setStatus: SetCanvasState<StatusMap>;
  repairSelection: string;
  setRepairSelection: SetCanvasState<StringMap>;
  repairFeature: string;
  setRepairFeature: SetCanvasState<StringMap>;
  contaminated: boolean;
  familyExposures: FamilyExposureMap;
  runId: string;
  reviewerExposedThisRun: boolean;
  onEvent: (event: EventInput) => void;
  goToTarget: (target: string) => void;
}) {
  const familyIsRehearsal = (family: string) => {
    const exposedRuns = familyExposures[family] ?? [];
    return (
      exposedRuns.some((exposedRunId) => exposedRunId !== runId) ||
      exposedRuns.filter((exposedRunId) => exposedRunId === runId).length > 1 ||
      (reviewerExposedThisRun && exposedRuns.includes(runId))
    );
  };
  const familyIsGloballyFresh = (family: string) => (familyExposures[family] ?? []).length === 0;
  const questionIntegrityProps = { familyExposures, runId, reviewerExposedThisRun };

  const committedMissFeature = (item: Item): ResponseFeature | undefined => {
    const response = responses[item.id];
    if (
      !response?.committed ||
      response.kind !== 'answer' ||
      response.correct ||
      response.assisted ||
      familyIsRehearsal(item.family)
    ) {
      return undefined;
    }
    const option = item.options.find((candidate) => candidate.id === response.selection);
    if (
      !option ||
      option.featureSource !== 'authored' ||
      !TARGETABLE_FEATURES.includes(option.feature)
    ) {
      return undefined;
    }
    return option.feature;
  };

  const repeatedRouteFeatures = (items: Item[]): ResponseFeature[] => {
    const features = items
      .map((item) => committedMissFeature(item))
      .filter((feature): feature is ResponseFeature => feature !== undefined);
    return TARGETABLE_FEATURES.filter(
      (candidate) => features.filter((feature) => feature === candidate).length >= 2,
    );
  };
  const routeFeatureIsRepeated = repeatedRouteFeatures([
    kc.entry,
    kc.disambiguator,
    kc.prediction,
  ]).includes(routeFeature as ResponseFeature);
  const authorizedContrast = routeFeatureIsRepeated
    ? kc.targetedContrastByFeature[routeFeature as ResponseFeature]
    : undefined;
  const effectiveRoute = route === 'targeted' && !authorizedContrast ? 'standard' : route;

  const updateScreen = (next: string, explicitItems?: Item[]) => {
    setScreen((previous) => ({ ...previous, [kc.id]: next }));
    onEvent({
      type: 'lesson_checkpoint_completed',
      kcId: kc.id,
      note: `Moved to ${next}.`,
    });
    const presentedItems =
      explicitItems ??
      presentedItemsForScreen(kc, next, nearVariant, changedVariant, repairSelection, responses);
    presentedItems.forEach((item) => {
      onEvent({
        type: 'item_family_presented',
        kcId: kc.id,
        itemId: item.id,
        family: item.family,
        note: 'Screen-level family presentation retained across response-run reset.',
      });
    });
  };

  const routeAfterEntry = () => {
    const repeatedFeatures = repeatedRouteFeatures([kc.entry, kc.disambiguator]);
    const matchingFeature = repeatedFeatures.find(
      (feature) => kc.targetedContrastByFeature[feature] !== undefined,
    );
    const nextRoute = matchingFeature ? 'targeted' : 'standard';
    setRoute((previous) => ({ ...previous, [kc.id]: nextRoute }));
    setRouteFeature((previous) => ({
      ...previous,
      [kc.id]: matchingFeature ?? '',
    }));
    onEvent({
      type: 'entry_route_closed',
      kcId: kc.id,
      feature: matchingFeature ?? repeatedFeatures[0] ?? 'non-targetable',
      note: matchingFeature
        ? `Targeted support authorized by two committed, unassisted ${matchingFeature} misses and the matching KC contrast.`
        : repeatedFeatures.length > 0
          ? `Repeated feature ${repeatedFeatures.join('|')} has no explicitly authorized KC contrast; route failed closed to standard support.`
          : 'No repeated whitelisted authored feature; route fails closed to standard support.',
    });
    updateScreen('route_result');
  };

  const finishPrediction = () => {
    const repeatedFeatures = repeatedRouteFeatures([kc.entry, kc.disambiguator, kc.prediction]);
    const matchingFeature = repeatedFeatures.find(
      (feature) => kc.targetedContrastByFeature[feature] !== undefined,
    );
    if (matchingFeature) {
      setRoute((previous) => ({ ...previous, [kc.id]: 'targeted' }));
      setRouteFeature((previous) => ({
        ...previous,
        [kc.id]: matchingFeature,
      }));
      onEvent({
        type: 'prediction_route_confirmed',
        kcId: kc.id,
        feature: matchingFeature,
        note: `Targeted contrast authorized by repeated authored ${matchingFeature} misses.`,
      });
    } else {
      setRoute((previous) => ({ ...previous, [kc.id]: 'standard' }));
      setRouteFeature((previous) => ({ ...previous, [kc.id]: '' }));
      if (repeatedFeatures.length > 0) {
        onEvent({
          type: 'prediction_route_failed_closed',
          kcId: kc.id,
          feature: repeatedFeatures.join('|'),
          note: 'Repeated feature had no matching explicitly authorized contrast; standard support retained.',
        });
      }
    }
    updateScreen('model');
  };

  const practiceIndex = screen === 'a2' ? 0 : screen === 'a1' ? 1 : 2;
  const practiceItem = kc.practice[practiceIndex];

  if (kc.number === 5 && screen === 'bridge_intro') {
    return (
      <Stack gap={16}>
        <div>
          <Text size="small" tone="tertiary">
            From one lens to two
          </Text>
          <H1>The first image can become the next lens’s object</H1>
          <Text>
            Finish lens 1, mark its image on the shared axis, then look at the rays as they reach
            lens 2. That image point—not the original object—sets the next object distance.
          </Text>
        </div>
        <CompoundDiagram />
        <ContinueButton
          label="Try one quick check"
          onClick={() => updateScreen('bridge_gate', [K5_BRIDGE_CHECK])}
        />
      </Stack>
    );
  }

  if (kc.number === 5 && (screen === 'bridge_gate' || screen === 'bridge_gate_replacement')) {
    const isReplacement = screen === 'bridge_gate_replacement';
    const bridgeItem = isReplacement ? K5_BRIDGE_CHECK_REPLACEMENT : K5_BRIDGE_CHECK;
    const bridgeResponse = responses[bridgeItem.id];
    const rehearsalOnly = familyIsRehearsal(bridgeItem.family);
    const bridgePassed = Boolean(
      bridgeResponse?.committed &&
        bridgeResponse.kind === 'answer' &&
        bridgeResponse.correct &&
        !bridgeResponse.assisted &&
        !rehearsalOnly,
    );
    const invalidOrReused = Boolean(
      bridgeResponse?.committed && (bridgeResponse.kind === 'invalid' || rehearsalOnly),
    );
    return (
      <Stack gap={16}>
        <div>
          <Text size="small" tone="tertiary">
            One-lens handoff
          </Text>
          <H1>{isReplacement ? 'Try a fresh quick check' : 'Quick handoff check'}</H1>
          <Text>
            Find the image made by this lens. In the next topic, that image location will be handed
            to lens 2.
          </Text>
        </div>
        <Question
          item={bridgeItem}
          responses={responses}
          setResponses={setResponses}
          hints={hints}
          setHints={setHints}
          kcId="V3-KC-393396"
          onEvent={onEvent}
          {...questionIntegrityProps}
        />
        {bridgeResponse?.committed && (
          <ContinueButton
            label={
              bridgePassed
                ? 'Start two-lens systems'
                : invalidOrReused && !isReplacement
                  ? 'Try a fresh question'
                  : invalidOrReused
                    ? 'Review the handoff'
                    : 'Review the missed lens step'
            }
            onClick={() => {
              const nextScreen = bridgePassed
                ? 'entry'
                : invalidOrReused && !isReplacement
                  ? 'bridge_gate_replacement'
                  : invalidOrReused
                    ? 'bridge_invalid_hold'
                    : 'bridge_repair';
              onEvent({
                type: bridgePassed
                  ? 'hard_edge_bridge_passed'
                  : invalidOrReused
                    ? 'invalid_bridge_family_replaced_without_repair'
                    : 'hard_edge_episode_model_started',
                kcId: 'V3-KC-393396',
                itemId: bridgeItem.id,
                family: bridgeItem.family,
                feature: bridgePassed
                  ? 'correct-model'
                  : bridgeResponse.kind === 'answer'
                    ? bridgeItem.options.find((option) => option.id === bridgeResponse.selection)
                        ?.feature
                    : bridgeResponse.kind,
                note: bridgePassed
                  ? `V3-EDG-403420 point-of-use confirmation passed in the separate ${BRIDGE_EPISODE_TIMING.directPassMinutes}-minute direct episode.`
                  : invalidOrReused
                    ? 'Invalid or reused bridge family does not consume repair and cannot clear the edge.'
                    : 'Separate hard-edge episode opens its 2-minute R14-REM-CP-086 model; no KC repair counter increments and R14-REM-CP-135 remains reserved for KC 5.',
              });
              updateScreen(nextScreen);
            }}
          />
        )}
      </Stack>
    );
  }

  if (kc.number === 5 && screen === 'bridge_repair') {
    const sourceItem = responses[K5_BRIDGE_CHECK_REPLACEMENT.id]?.committed
      ? K5_BRIDGE_CHECK_REPLACEMENT
      : K5_BRIDGE_CHECK;
    const sourceResponse = responses[sourceItem.id];
    const missedFeature =
      sourceResponse?.kind === 'answer' &&
      !sourceResponse.correct &&
      !sourceResponse.assisted &&
      !familyIsRehearsal(sourceItem.family)
        ? sourceItem.options.find((option) => option.id === sourceResponse.selection)?.feature
        : 'non-targetable';
    const teaching =
      missedFeature === 'sign-location'
        ? 'A real image made by a converging lens lies on the far side, so q is positive. Because the image is inverted, its magnification and height are negative.'
        : missedFeature === 'equation-operation'
          ? 'Lens distances combine as reciprocals: first write 1/q = 1/f − 1/p, then invert only after the subtraction.'
          : 'Trace the single-lens image first: place the image where the physical rays meet, then carry that location forward.';
    return (
      <Stack gap={16}>
        <Text size="small" tone="tertiary">
          Review before a fresh check
        </Text>
        <H1>{`Focus on ${LEARNER_FEATURE_LABELS[missedFeature ?? 'correct-model']}`}</H1>
        <Text>{teaching}</Text>
        <EquationStrip kind="imaging" />
        <LensDiagram />
        <ContinueButton
          label="Try a fresh handoff check"
          onClick={() => {
            onEvent({
              type: 'hard_edge_episode_model_completed',
              kcId: 'V3-KC-393396',
              note: `${BRIDGE_EPISODE_TIMING.repairModelMinutes}-minute separate bridge model closed before reentry confirmation; KC repair counters unchanged.`,
            });
            updateScreen('bridge_reentry');
          }}
        />
      </Stack>
    );
  }

  if (kc.number === 5 && (screen === 'bridge_reentry' || screen === 'bridge_reentry_replacement')) {
    const isReplacement = screen === 'bridge_reentry_replacement';
    const reentryItem = isReplacement ? K5_BRIDGE_REENTRY_REPLACEMENT : K5_BRIDGE_REENTRY;
    const reentryResponse = responses[reentryItem.id];
    const rehearsalOnly = familyIsRehearsal(reentryItem.family);
    const reentryPassed = Boolean(
      reentryResponse?.committed &&
        reentryResponse.kind === 'answer' &&
        reentryResponse.correct &&
        !reentryResponse.assisted &&
        !rehearsalOnly,
    );
    const invalidOrReused = Boolean(
      reentryResponse?.committed && (reentryResponse.kind === 'invalid' || rehearsalOnly),
    );
    return (
      <Stack gap={16}>
        <Text size="small" tone="tertiary">
          Fresh handoff check
        </Text>
        <H1>{isReplacement ? 'Try one more fresh example' : 'Use the repaired lens step'}</H1>
        <Question
          item={reentryItem}
          responses={responses}
          setResponses={setResponses}
          hints={hints}
          setHints={setHints}
          kcId="V3-KC-393396"
          onEvent={onEvent}
          {...questionIntegrityProps}
        />
        {reentryResponse?.committed && (
          <ContinueButton
            label={
              reentryPassed
                ? 'Start two-lens systems'
                : invalidOrReused && !isReplacement
                  ? 'Try a fresh question'
                  : invalidOrReused
                    ? 'Review the handoff'
                    : 'Pause and review the lens model'
            }
            onClick={() => {
              const nextScreen = reentryPassed
                ? 'entry'
                : invalidOrReused && !isReplacement
                  ? 'bridge_reentry_replacement'
                  : invalidOrReused
                    ? 'bridge_invalid_hold'
                    : 'bridge_pause';
              onEvent({
                type: reentryPassed
                  ? 'kc_resumed_at_reentry'
                  : invalidOrReused
                    ? 'invalid_bridge_reentry_replaced_without_repair'
                    : 'kc_paused_for_repair',
                kcId: 'V3-KC-393396',
                itemId: reentryItem.id,
                family: reentryItem.family,
                feature: reentryPassed
                  ? 'correct-model'
                  : reentryResponse.kind === 'answer'
                    ? reentryItem.options.find((option) => option.id === reentryResponse.selection)
                        ?.feature
                    : reentryResponse.kind,
                note: reentryPassed
                  ? 'Unassisted unexposed KC 4 reentry passed; KC 5 begins without consuming a KC 5 repair.'
                  : invalidOrReused
                    ? 'Invalid or reused confirmation branches to a dedicated replacement without consuming repair or pausing.'
                    : reentryResponse.assisted
                      ? 'Assisted reentry cannot clear V3-EDG-403420.'
                      : 'KC 4 bridge remains unresolved under R14-REM-CP-086.',
              });
              if (nextScreen === 'bridge_pause') {
                setStatus((previous) => ({ ...previous, [kc.id]: 'paused' }));
              }
              updateScreen(nextScreen);
            }}
          />
        )}
      </Stack>
    );
  }

  if (kc.number === 5 && screen === 'bridge_invalid_hold') {
    return (
      <Stack gap={16}>
        <Text size="small" tone="tertiary">
          Handoff review
        </Text>
        <H1>Review the single-lens model</H1>
        <Callout tone="warning" title="A fresh check is not available">
          The available questions have already been used. Review the diagram now, then return to the
          lesson map.
        </Callout>
        <Row gap={8} wrap>
          <Button variant="primary" onClick={() => updateScreen('bridge_review_reentry')}>
            Review the lens model
          </Button>
          <Button variant="secondary" onClick={() => goToTarget('map')}>
            Return to lesson map
          </Button>
        </Row>
      </Stack>
    );
  }

  if (kc.number === 5 && screen === 'bridge_pause') {
    return (
      <Stack gap={16}>
        <Text size="small" tone="tertiary">
          Handoff paused
        </Text>
        <H1>Review one lens before continuing</H1>
        <Callout tone="warning" title="More review is needed">
          The handoff is not secure yet. Revisit how image distance and sign connect to the ray
          diagram.
        </Callout>
        <Row gap={8} wrap>
          <Button
            variant="primary"
            onClick={() => {
              setStatus((previous) => ({ ...previous, [kc.id]: 'in_progress' }));
              onEvent({
                type: 'kc_resumed_at_reentry',
                kcId: 'V3-KC-393396',
                note: 'Resumed KC 4 model review; exposed bridge families remain rehearsal-only across response runs.',
              });
              updateScreen('bridge_review_reentry');
            }}
          >
            Resume lens review
          </Button>
          <Button variant="secondary" onClick={() => goToTarget('map')}>
            Return to lesson map
          </Button>
        </Row>
      </Stack>
    );
  }

  if (kc.number === 5 && screen === 'bridge_review_reentry') {
    return (
      <Stack gap={16}>
        <Text size="small" tone="tertiary">
          Single-lens review
        </Text>
        <H1>Connect the equation to the image</H1>
        <EquationStrip kind="imaging" />
        <Text>
          Use 1/q = 1/f − 1/p. Then use the sign of q to place the image on the diagram before
          carrying that point to another lens.
        </Text>
        <Diagram kind="lens" />
        <Button variant="secondary" onClick={() => goToTarget('map')}>
          Return to lesson map
        </Button>
      </Stack>
    );
  }

  if (screen === 'entry') {
    const entry = responses[kc.entry.id];
    const needsDisambiguator = entry?.committed && !entry.correct;
    const ready =
      entry?.committed && (!needsDisambiguator || responses[kc.disambiguator.id]?.committed);
    return (
      <Stack gap={16}>
        <div>
          <Text size="small" tone="tertiary">{`Topic ${kc.number} of 5 · Starting check`}</Text>
          <H1>{kc.title}</H1>
        </div>
        <Question
          item={kc.entry}
          responses={responses}
          setResponses={setResponses}
          hints={hints}
          setHints={setHints}
          revealFeedback={false}
          kcId={kc.id}
          onEvent={onEvent}
          onCommitted={(response) => {
            if (!response.correct) {
              onEvent({
                type: 'item_family_presented',
                kcId: kc.id,
                itemId: kc.disambiguator.id,
                family: kc.disambiguator.family,
                note: 'Required disambiguator became visible after the entry response.',
              });
            }
          }}
          {...questionIntegrityProps}
        />
        {needsDisambiguator && (
          <Question
            item={kc.disambiguator}
            responses={responses}
            setResponses={setResponses}
            hints={hints}
            setHints={setHints}
            revealFeedback={false}
            kcId={kc.id}
            onEvent={onEvent}
            {...questionIntegrityProps}
          />
        )}
        <ContinueButton
          label="See what to learn next"
          disabled={!ready}
          onClick={routeAfterEntry}
        />
      </Stack>
    );
  }

  if (screen === 'route_result') {
    const entry = responses[kc.entry.id];
    const hadDisambiguator = Boolean(entry?.committed && !entry.correct);
    return (
      <Stack gap={16}>
        <div>
          <Text size="small" tone="tertiary">
            Starting check complete
          </Text>
          <H1>Start with the right support</H1>
          <RouteSummary
            kc={kc}
            route={effectiveRoute}
            routeFeature={effectiveRoute === 'targeted' ? routeFeature : ''}
          />
        </div>
        <Question
          item={kc.entry}
          responses={responses}
          setResponses={setResponses}
          hints={hints}
          setHints={setHints}
          kcId={kc.id}
          onEvent={onEvent}
          {...questionIntegrityProps}
        />
        {hadDisambiguator && (
          <Question
            item={kc.disambiguator}
            responses={responses}
            setResponses={setResponses}
            hints={hints}
            setHints={setHints}
            kcId={kc.id}
            onEvent={onEvent}
            {...questionIntegrityProps}
          />
        )}
        <ContinueButton label="Make a prediction" onClick={() => updateScreen('prediction')} />
      </Stack>
    );
  }

  if (screen === 'prediction') {
    return (
      <Stack gap={16}>
        <H1>{kc.title}</H1>
        <Text>
          Choose what you expect the ray or image to do. Then compare your prediction with the
          worked visual trace.
        </Text>
        <Question
          item={kc.prediction}
          responses={responses}
          setResponses={setResponses}
          hints={hints}
          setHints={setHints}
          kcId={kc.id}
          onEvent={onEvent}
          {...questionIntegrityProps}
        />
        <ContinueButton
          label="See the visual rule"
          disabled={!responses[kc.prediction.id]?.committed}
          onClick={finishPrediction}
        />
      </Stack>
    );
  }

  const modelRuleMatch = screen.match(/^model_rule_(\d+)$/);
  if (screen === 'model' || modelRuleMatch) {
    const ruleIndex = modelRuleMatch ? Number(modelRuleMatch[1]) : 0;
    const safeRuleIndex = Math.min(ruleIndex, kc.model.length - 1);
    const equationKind =
      kc.diagram === 'reflection'
        ? 'reflection'
        : kc.diagram === 'refraction'
          ? 'refraction'
          : kc.diagram === 'compound'
            ? 'compound'
            : 'imaging';
    const nextScreen =
      safeRuleIndex + 1 < kc.model.length ? `model_rule_${safeRuleIndex + 1}` : 'worked';
    return (
      <Stack gap={18}>
        <div>
          <Text
            size="small"
            tone="tertiary"
          >{`Visual rule ${safeRuleIndex + 1} of ${kc.model.length}`}</Text>
          <H1>{kc.title}</H1>
        </div>
        <Diagram kind={kc.diagram} />
        <section className="worked-decision">
          <H2>Trace this decision</H2>
          <Text>{MODEL_TRACE_NOTES[kc.number]?.[safeRuleIndex] ?? kc.model[safeRuleIndex]}</Text>
        </section>
        {safeRuleIndex === kc.model.length - 1 && <EquationStrip kind={equationKind} />}
        {effectiveRoute === 'targeted' && authorizedContrast && safeRuleIndex === 0 && (
          <div className="worked-decision">
            <Text as="span" weight="semibold">
              Watch for:{' '}
            </Text>
            <Text as="span">{authorizedContrast}</Text>
          </div>
        )}
        <ContinueButton
          label={nextScreen === 'worked' ? 'Start the worked trace' : 'Next visual rule'}
          onClick={() => updateScreen(nextScreen)}
        />
      </Stack>
    );
  }

  if (screen === 'worked') {
    return (
      <Stack gap={16}>
        <div>
          <Text size="small" tone="tertiary">
            Worked trace · Set up
          </Text>
          <H1>What must the construction find?</H1>
          <Text>{kc.worked.problem}</Text>
        </div>
        <Diagram kind={kc.diagram} />
        <section className="worked-decision">
          <H2>First decision</H2>
          <Text>{kc.worked.cue}</Text>
        </section>
        <ContinueButton
          label="Choose the construction rule"
          onClick={() => updateScreen('worked_principle')}
        />
      </Stack>
    );
  }

  if (screen === 'worked_principle') {
    return (
      <Stack gap={16}>
        <div>
          <Text size="small" tone="tertiary">
            Worked trace · Construction
          </Text>
          <H1>Choose the rule</H1>
          <Text>{kc.worked.problem}</Text>
        </div>
        <Diagram kind={kc.diagram} />
        <section className="worked-decision">
          <H2>Construction decision</H2>
          <Text>{kc.worked.principle}</Text>
        </section>
        <ContinueButton label="Work the first step" onClick={() => updateScreen('worked_step_0')} />
      </Stack>
    );
  }

  const workedStepMatch = screen.match(/^worked_step_(\d+)$/);
  if (workedStepMatch) {
    const stepIndex = Math.min(Number(workedStepMatch[1]), kc.worked.operation.length - 1);
    const nextScreen =
      stepIndex + 1 < kc.worked.operation.length ? `worked_step_${stepIndex + 1}` : 'worked_check';
    return (
      <Stack gap={16}>
        <div>
          <Text
            size="small"
            tone="tertiary"
          >{`Worked decision ${stepIndex + 1} of ${kc.worked.operation.length}`}</Text>
          <H1>Follow one step</H1>
          <Text size="small" tone="secondary">
            {kc.worked.problem}
          </Text>
        </div>
        <Diagram kind={kc.diagram} />
        <section className="worked-decision">
          <H2>{`Decision ${stepIndex + 1}`}</H2>
          <Text>{kc.worked.operation[stepIndex]}</Text>
        </section>
        <ContinueButton
          label={
            nextScreen === 'worked_check' ? 'Check the finished trace' : 'Next worked decision'
          }
          onClick={() => updateScreen(nextScreen)}
        />
      </Stack>
    );
  }

  if (screen === 'worked_check') {
    return (
      <Stack gap={16}>
        <div>
          <Text size="small" tone="tertiary">
            Worked trace · Check
          </Text>
          <H1>Does the result match the rays?</H1>
        </div>
        <Diagram kind={kc.diagram} />
        <section className="worked-decision">
          <H2>Visual check</H2>
          <Text>{kc.worked.check}</Text>
        </section>
        <ContinueButton label="Practice with guidance" onClick={() => updateScreen('a2')} />
      </Stack>
    );
  }

  if (screen === 'a2' || screen === 'a1' || screen === 'a0') {
    const next = screen === 'a2' ? 'a1' : screen === 'a1' ? 'a0' : 'contrast';
    const practiceResponse = responses[practiceItem.id];
    const independentPass = Boolean(
      practiceResponse?.committed &&
        practiceResponse.kind === 'answer' &&
        practiceResponse.correct &&
        !practiceResponse.assisted &&
        !familyIsRehearsal(practiceItem.family),
    );
    const requiresRecovery =
      screen !== 'a0' && Boolean(practiceResponse?.committed) && !independentPass;
    const continuePractice = () => {
      if (requiresRecovery) {
        updateScreen(`${screen}_recovery_teach`);
      } else {
        updateScreen(next);
      }
    };
    return (
      <Stack gap={16}>
        <div>
          <Text size="small" tone="tertiary">
            {screen === 'a2'
              ? 'Practice with guidance'
              : screen === 'a1'
                ? 'Practice with a cue'
                : 'Practice on your own'}
          </Text>
          <H1>{kc.title}</H1>
        </div>
        <Question
          item={practiceItem}
          responses={responses}
          setResponses={setResponses}
          hints={hints}
          setHints={setHints}
          kcId={kc.id}
          onEvent={onEvent}
          {...questionIntegrityProps}
        />
        {screen !== 'a0' && practiceResponse?.committed && (
          <Text tone="secondary">
            {independentPass
              ? 'You’re ready to try the same idea with less guidance.'
              : 'Review the specific missed step, then try it in a fresh example.'}
          </Text>
        )}
        <ContinueButton
          label={
            requiresRecovery
              ? 'Review the missed step'
              : next === 'contrast'
                ? 'Compare nearby rules'
                : 'Try with less guidance'
          }
          disabled={!practiceResponse?.committed}
          onClick={continuePractice}
        />
      </Stack>
    );
  }

  if (screen === 'a2_recovery_teach' || screen === 'a1_recovery_teach') {
    const recoveryIndex = screen === 'a2_recovery_teach' ? 0 : 1;
    const sourceItem = kc.practice[recoveryIndex];
    const sourceResponse = responses[sourceItem.id];
    const responseFeature =
      sourceResponse?.kind === 'answer'
        ? sourceItem.options.find((option) => option.id === sourceResponse.selection)?.feature
        : undefined;
    const feature =
      sourceResponse?.kind === 'answer' &&
      !sourceResponse.correct &&
      !sourceResponse.assisted &&
      !familyIsRehearsal(sourceItem.family)
        ? (responseFeature ?? 'non-targetable')
        : 'non-targetable';
    const recoveryItem = kc.recovery[recoveryIndex];
    const recoveryScreen = recoveryIndex === 0 ? 'a2_recovery' : 'a1_recovery';
    return (
      <Stack gap={16}>
        <div>
          <Text size="small" tone="tertiary">
            Review before a fresh example
          </Text>
          <H1>{`Focus on ${LEARNER_FEATURE_LABELS[feature]}`}</H1>
        </div>
        <Diagram kind={kc.diagram} />
        <section className="worked-decision">
          <H2>Trace the missed decision</H2>
          <Text>{FEATURE_VISUAL_TRACES[feature]}</Text>
        </section>
        <ContinueButton
          label="Try a fresh guided example"
          onClick={() => {
            setHints((previous) => ({ ...previous, [recoveryItem.id]: true }));
            onEvent({
              type: 'fresh_supported_recovery_started',
              kcId: kc.id,
              itemId: recoveryItem.id,
              family: recoveryItem.family,
              feature: sourceResponse?.kind === 'answer' ? responseFeature : sourceResponse?.kind,
              note: `${recoveryIndex === 0 ? 'A2' : 'A1'} did not meet the unassisted performance condition.`,
            });
            updateScreen(recoveryScreen, [recoveryItem]);
          }}
        />
      </Stack>
    );
  }

  if (screen === 'a2_recovery' || screen === 'a1_recovery') {
    const recoveryIndex = screen === 'a2_recovery' ? 0 : 1;
    const recoveryItem = kc.recovery[recoveryIndex];
    const recoveryResponse = responses[recoveryItem.id];
    const recoveryPassed = Boolean(
      recoveryResponse?.committed &&
        recoveryResponse.kind === 'answer' &&
        recoveryResponse.correct &&
        !familyIsRehearsal(recoveryItem.family),
    );
    const next = recoveryIndex === 0 ? 'a1' : 'a0';
    return (
      <Stack gap={16}>
        <Text size="small" tone="tertiary">
          Fresh guided example
        </Text>
        <H1>Use the hint on one new problem</H1>
        <Question
          item={recoveryItem}
          responses={responses}
          setResponses={setResponses}
          hints={hints}
          setHints={setHints}
          kcId={kc.id}
          onEvent={onEvent}
          {...questionIntegrityProps}
        />
        {recoveryResponse?.committed && (
          <ContinueButton
            label={recoveryPassed ? 'Continue with less guidance' : 'Return to the visual model'}
            onClick={() => {
              onEvent({
                type: recoveryPassed
                  ? 'fresh_supported_recovery_completed'
                  : 'practice_paused_for_support',
                kcId: kc.id,
                itemId: recoveryItem.id,
                family: recoveryItem.family,
                feature:
                  recoveryResponse.kind === 'answer'
                    ? recoveryItem.options.find(
                        (option) => option.id === recoveryResponse.selection,
                      )?.feature
                    : recoveryResponse.kind,
                note: recoveryPassed
                  ? 'Supported recovery passed.'
                  : 'Supported recovery did not pass; fade stopped.',
              });
              if (!recoveryPassed) {
                setStatus((previous) => ({ ...previous, [kc.id]: 'paused' }));
              }
              updateScreen(recoveryPassed ? next : 'practice_pause');
            }}
          />
        )}
      </Stack>
    );
  }

  if (screen === 'practice_pause') {
    return (
      <Stack gap={16}>
        <Text size="small" tone="tertiary">
          Practice paused
        </Text>
        <H1>Return to the picture before continuing</H1>
        <Callout tone="warning" title="Review the ray rule">
          The guided example is not secure yet. Revisit the diagram and connect the ray intersection
          to the equation.
        </Callout>
        <Row gap={8} wrap>
          <Button
            variant="primary"
            onClick={() => {
              setStatus((previous) => ({ ...previous, [kc.id]: 'in_progress' }));
              onEvent({
                type: 'kc_resumed_at_reentry',
                kcId: kc.id,
                note: 'Resumed at review-only model after a fading pause.',
              });
              updateScreen('review_reentry');
            }}
          >
            Review the visual model
          </Button>
          <Button variant="secondary" onClick={() => goToTarget('map')}>
            Return to lesson map
          </Button>
        </Row>
      </Stack>
    );
  }

  if (screen === 'contrast') {
    return (
      <Stack gap={16}>
        <div>
          <Text size="small" tone="tertiary">
            Compare nearby rules
          </Text>
          <H1>What changes—and what does not</H1>
        </div>
        <ul style={{ margin: 0, paddingLeft: 22 }}>
          {kc.contrast.map((point) => (
            <li key={point} style={{ marginBottom: 8 }}>
              <Text as="span">{point}</Text>
            </li>
          ))}
        </ul>
        <Callout tone="neutral" title="Choose by what happens to the ray">
          Flat reflector: equal normal angles. Transparent boundary: indices and Snell; check TIR.
          Curved mirror: mirror rays and signs. Thin lens: lens rays and signs. Multiple elements:
          finish one stage, then hand its image forward.
        </Callout>
        <ContinueButton label="Begin final check" onClick={() => updateScreen('exit')} />
      </Stack>
    );
  }

  if (screen === 'exit') {
    const near = kc.exits[Math.min(nearVariant, 2)].near;
    const changed = kc.exits[Math.min(changedVariant, 2)].changed;
    const nearResponse = responses[near.id];
    const changedResponse = responses[changed.id];
    const bothClosed = Boolean(nearResponse?.committed && changedResponse?.committed);
    const nearRehearsal = familyIsRehearsal(near.family);
    const changedRehearsal = familyIsRehearsal(changed.family);
    const validNear = Boolean(
      nearResponse?.correct &&
        !nearResponse.assisted &&
        nearResponse.kind === 'answer' &&
        !nearRehearsal,
    );
    const validChanged = Boolean(
      changedResponse?.correct &&
        !changedResponse.assisted &&
        changedResponse.kind === 'answer' &&
        !changedRehearsal,
    );
    const replacementIds = [
      nearResponse?.assisted ||
      nearRehearsal ||
      (nearResponse?.committed && nearResponse.kind !== 'answer')
        ? 'near'
        : '',
      changedResponse?.assisted ||
      changedRehearsal ||
      (changedResponse?.committed && changedResponse.kind !== 'answer')
        ? 'changed'
        : '',
    ].filter(Boolean);
    const passed = bothClosed && validNear && validChanged;

    const replaceUnresolved = () => {
      const replacementVariant = [1, 2].find(
        (variant) =>
          variant !== nearVariant &&
          variant !== changedVariant &&
          !responses[kc.exits[variant].near.id]?.committed &&
          !responses[kc.exits[variant].changed.id]?.committed &&
          familyIsGloballyFresh(kc.exits[variant].near.family) &&
          familyIsGloballyFresh(kc.exits[variant].changed.family),
      );
      const exhausted = replacementVariant === undefined;
      if (replacementVariant !== undefined) {
        setNearVariant((previous) => ({ ...previous, [kc.id]: replacementVariant }));
        setChangedVariant((previous) => ({ ...previous, [kc.id]: replacementVariant }));
        [kc.exits[replacementVariant].near, kc.exits[replacementVariant].changed].forEach(
          (item) => {
            onEvent({
              type: 'item_family_presented',
              kcId: kc.id,
              itemId: item.id,
              family: item.family,
              note: 'Complete replacement pair presentation retained across response-run reset.',
            });
          },
        );
      }
      onEvent({
        type: exhausted ? 'kc_paused_for_repair' : 'fresh_exit_replacement_presented',
        kcId: kc.id,
        note: exhausted
          ? 'No complete unexposed replacement pair remains.'
          : `The ${replacementIds.join(' and ')} position triggered replacement of the complete pair because it was assisted, unresolved, invalid, or rehearsal-only. Prior exposures remain append-only.`,
      });
      if (exhausted) {
        setStatus((previous) => ({ ...previous, [kc.id]: 'paused' }));
        updateScreen('pause');
      }
    };

    const startRepair = () => {
      const nextCycle = repairCycle + 1;
      if (nextCycle > 2) {
        setStatus((previous) => ({ ...previous, [kc.id]: 'paused' }));
        updateScreen('pause');
        return;
      }
      const failedFeatures = [
        { item: near, response: nearResponse },
        { item: changed, response: changedResponse },
      ]
        .map(({ item, response }) => {
          if (
            response?.kind !== 'answer' ||
            response.correct ||
            response.assisted ||
            familyIsRehearsal(item.family)
          ) {
            return undefined;
          }
          const option = item.options.find((candidate) => candidate.id === response.selection);
          return option?.featureSource === 'authored' &&
            TARGETABLE_FEATURES.includes(option.feature)
            ? option.feature
            : undefined;
        })
        .filter((feature): feature is ResponseFeature => feature !== undefined);
      const scores = kc.repairs.map(
        (repair) =>
          repair.targetFeatures.filter((feature) => failedFeatures.includes(feature)).length,
      );
      const candidates = [0, 1]
        .filter((candidate) => scores[candidate] > 0)
        .sort((left, right) => scores[right] - scores[left]);
      const selectedRepair = candidates.find((candidate) => {
        const targetVariant = candidate + 1;
        const repairItem = kc.repairs[candidate].item;
        const targetPair = kc.exits[targetVariant];
        return (
          !responses[repairItem.id]?.committed &&
          !responses[targetPair.near.id]?.committed &&
          !responses[targetPair.changed.id]?.committed &&
          familyIsGloballyFresh(repairItem.family) &&
          familyIsGloballyFresh(targetPair.near.family) &&
          familyIsGloballyFresh(targetPair.changed.family)
        );
      });
      if (selectedRepair === undefined) {
        setStatus((previous) => ({ ...previous, [kc.id]: 'paused' }));
        onEvent({
          type: 'kc_paused_for_repair',
          kcId: kc.id,
          feature: failedFeatures.join('|'),
          note: 'No fresh repair branch had positive authored-feature compatibility and a complete unexposed reentry pair; failed closed.',
        });
        updateScreen('pause');
        return;
      }
      const targetVariant = selectedRepair + 1;
      setRepairCycle((previous) => ({ ...previous, [kc.id]: nextCycle }));
      setRepairSelection((previous) => ({ ...previous, [kc.id]: String(selectedRepair) }));
      setRepairFeature((previous) => ({ ...previous, [kc.id]: failedFeatures.join('|') }));
      setNearVariant((previous) => ({ ...previous, [kc.id]: targetVariant }));
      setChangedVariant((previous) => ({ ...previous, [kc.id]: targetVariant }));
      onEvent({
        type: 'exact_kc_repair_activity_started',
        kcId: kc.id,
        feature: failedFeatures.join('|'),
        note: `Selected ${kc.repairs[selectedRepair].title} from option response-feature metadata; cycle number only enforces the bound.`,
      });
      updateScreen('repair');
    };

    const recordExit = () => {
      setStatus((previous) => ({ ...previous, [kc.id]: 'simulated_complete' }));
      onEvent({
        type: 'simulated_kc_completion',
        kcId: kc.id,
        note: contaminated
          ? 'Pair passed in a reviewer-exposed or retained-family run; contaminated simulation only.'
          : 'Independent learner-mode simulation passed; internal quality review emits no evidence.',
      });
      updateScreen('handoff');
    };

    return (
      <Stack gap={16}>
        <div>
          <Text size="small" tone="tertiary">
            Final check
          </Text>
          <H1>Use the model in two forms</H1>
          <Text>
            Answer both questions before results appear. Use no hint if you can; if you need one,
            the lesson will offer a fresh pair.
          </Text>
        </div>
        <Question
          item={near}
          responses={responses}
          setResponses={setResponses}
          hints={hints}
          setHints={setHints}
          isExit
          revealFeedback={bothClosed}
          kcId={kc.id}
          onEvent={onEvent}
          {...questionIntegrityProps}
        />
        <Question
          item={changed}
          responses={responses}
          setResponses={setResponses}
          hints={hints}
          setHints={setHints}
          isExit
          revealFeedback={bothClosed}
          kcId={kc.id}
          onEvent={onEvent}
          {...questionIntegrityProps}
        />
        {bothClosed && (
          <Callout
            tone={passed ? 'success' : replacementIds.length > 0 ? 'info' : 'warning'}
            title={
              passed
                ? 'Final check complete'
                : replacementIds.length > 0
                  ? 'Try a fresh pair'
                  : 'Review one exact feature'
            }
          >
            {passed
              ? 'Both answers are correct. You’re ready to connect this topic to the next one.'
              : replacementIds.length > 0
                ? 'A hint, skipped answer, reported problem, or previously seen question means you need a fresh pair.'
                : repairCycle < 2
                  ? 'The answers point to one specific feature to review before another fresh pair.'
                  : 'Pause here and return to the visual model.'}
          </Callout>
        )}
        {bothClosed && passed && (
          <ContinueButton label="Complete this topic" onClick={recordExit} />
        )}
        {bothClosed && !passed && replacementIds.length > 0 && (
          <ContinueButton label="Try a fresh pair" onClick={replaceUnresolved} />
        )}
        {bothClosed && !passed && replacementIds.length === 0 && repairCycle < 2 && (
          <ContinueButton label="Review the missed feature" onClick={startRepair} />
        )}
        {bothClosed && !passed && replacementIds.length === 0 && repairCycle >= 2 && (
          <ContinueButton
            label="Pause and review"
            onClick={() => {
              setStatus((previous) => ({ ...previous, [kc.id]: 'paused' }));
              updateScreen('pause');
            }}
          />
        )}
      </Stack>
    );
  }

  if (screen === 'repair') {
    const repairIndex = repairSelection === '1' ? 1 : 0;
    const repair = kc.repairs[repairIndex];
    const missedFeatures = repairFeature
      .split('|')
      .filter((feature): feature is ResponseFeature =>
        TARGETABLE_FEATURES.includes(feature as ResponseFeature),
      );
    const targetedMisses = missedFeatures.filter((feature) =>
      repair.targetFeatures.includes(feature),
    );
    const learnerFeatures =
      targetedMisses.length > 0
        ? targetedMisses.map((feature) => LEARNER_FEATURE_LABELS[feature]).join(' and ')
        : repair.focus.toLowerCase();
    const visualFeature = targetedMisses[0] ?? repair.targetFeatures[0] ?? 'correct-model';
    return (
      <Stack gap={16}>
        <div>
          <Text size="small" tone="tertiary">{`Focused review ${repairCycle} of 2`}</Text>
          <H1>{`Review ${learnerFeatures}`}</H1>
          <Text>{repair.teaching}</Text>
        </div>
        <Diagram kind={kc.diagram} />
        <section className="worked-decision">
          <H2>{`Look for ${LEARNER_FEATURE_LABELS[visualFeature]}`}</H2>
          <Text>{FEATURE_VISUAL_TRACES[visualFeature]}</Text>
        </section>
        <ContinueButton
          label="Try a fresh example"
          onClick={() => updateScreen('repair_check', [repair.item])}
        />
      </Stack>
    );
  }

  if (screen === 'repair_check') {
    const repairIndex = repairSelection === '1' ? 1 : 0;
    const repair = kc.repairs[repairIndex];
    const repairResponse = responses[repair.item.id];
    const repairInvalid = repairResponse?.committed && repairResponse.kind === 'invalid';
    const nextVariant = Math.max(nearVariant, changedVariant);
    const replaceInvalidRepair = () => {
      const replacementIndex = repairIndex === 0 ? 1 : 0;
      const replacement = kc.repairs[replacementIndex];
      const replacementVariant = replacementIndex + 1;
      const replacementPair = kc.exits[replacementVariant];
      const storedFeatures = repairFeature
        .split('|')
        .filter((feature): feature is ResponseFeature =>
          TARGETABLE_FEATURES.includes(feature as ResponseFeature),
        );
      const hasPositiveCompatibility = replacement.targetFeatures.some((feature) =>
        storedFeatures.includes(feature),
      );
      if (
        !hasPositiveCompatibility ||
        responses[replacement.item.id]?.committed ||
        responses[replacementPair.near.id]?.committed ||
        responses[replacementPair.changed.id]?.committed ||
        !familyIsGloballyFresh(replacement.item.family) ||
        !familyIsGloballyFresh(replacementPair.near.family) ||
        !familyIsGloballyFresh(replacementPair.changed.family)
      ) {
        setStatus((previous) => ({ ...previous, [kc.id]: 'paused' }));
        onEvent({
          type: 'kc_paused_for_repair',
          kcId: kc.id,
          note: 'Invalid repair item had no alternate branch with positive feature compatibility and fully fresh repair/reentry families.',
        });
        updateScreen('pause');
        return;
      }
      setRepairSelection((previous) => ({ ...previous, [kc.id]: String(replacementIndex) }));
      setNearVariant((previous) => ({ ...previous, [kc.id]: replacementVariant }));
      setChangedVariant((previous) => ({ ...previous, [kc.id]: replacementVariant }));
      onEvent({
        type: 'invalid_item_replaced_without_cycle',
        kcId: kc.id,
        itemId: repair.item.id,
        family: repair.item.family,
        note: `Opened ${replacement.item.family}; repair-cycle count unchanged.`,
      });
      onEvent({
        type: 'item_family_presented',
        kcId: kc.id,
        itemId: replacement.item.id,
        family: replacement.item.family,
        note: 'Alternate positively compatible repair family presented and retained.',
      });
    };
    const reopenExit = () => {
      const targetPair = kc.exits[nextVariant];
      const targetIds = [targetPair.near.id, targetPair.changed.id];
      const alreadyExposed =
        targetIds.some((id) => responses[id]?.committed) ||
        !familyIsGloballyFresh(targetPair.near.family) ||
        !familyIsGloballyFresh(targetPair.changed.family);
      if (alreadyExposed) {
        onEvent({
          type: 'invalid_runtime_state_recovered',
          kcId: kc.id,
          note: 'Target exit family was already exposed; paused instead of deleting append-only history.',
        });
        setStatus((previous) => ({ ...previous, [kc.id]: 'paused' }));
        updateScreen('pause');
        return;
      }
      setNearVariant((previous) => ({ ...previous, [kc.id]: nextVariant }));
      setChangedVariant((previous) => ({ ...previous, [kc.id]: nextVariant }));
      onEvent({
        type: 'exact_kc_repair_activity_completed',
        kcId: kc.id,
        itemId: repair.item.id,
        family: repair.item.family,
        feature: repair.targetFeatures.join('|'),
        note: 'Opening an unexposed fresh exit pair.',
      });
      updateScreen('exit', [targetPair.near, targetPair.changed]);
    };
    return (
      <Stack gap={16}>
        <div>
          <Text size="small" tone="tertiary">
            Fresh example
          </Text>
          <H1>Apply the repaired feature</H1>
        </div>
        <Question
          item={repair.item}
          responses={responses}
          setResponses={setResponses}
          hints={hints}
          setHints={setHints}
          kcId={kc.id}
          onEvent={onEvent}
          {...questionIntegrityProps}
        />
        <ContinueButton
          label={repairInvalid ? 'Try a different fresh example' : 'Return to the final check'}
          disabled={!repairResponse?.committed}
          onClick={repairInvalid ? replaceInvalidRepair : reopenExit}
        />
      </Stack>
    );
  }

  if (screen === 'handoff') {
    const nextKc = KCS[kc.number];
    return (
      <Stack gap={16}>
        <Text size="small" tone="tertiary">{`Topic ${kc.number} of 5 complete`}</Text>
        <H1>Connect to the next idea</H1>
        <Callout tone="success" title={kc.title}>
          {kc.number === 5
            ? 'You can now carry an image through a system. The eye application uses the same image-building ideas.'
            : kc.handoff}
        </Callout>
        <Row gap={8} wrap>
          {nextKc ? (
            <Button variant="primary" onClick={() => goToTarget(nextKc.id)}>
              {`Open Topic ${nextKc.number}`}
            </Button>
          ) : (
            <Button variant="primary" onClick={() => goToTarget('extension')}>
              Explore the eye application
            </Button>
          )}
          <Button variant="secondary" onClick={() => goToTarget('map')}>
            Return to lesson map
          </Button>
        </Row>
      </Stack>
    );
  }

  if (screen === 'pause') {
    return (
      <Stack gap={16}>
        <Text size="small" tone="tertiary">
          Topic paused
        </Text>
        <H1>Return to the visual model</H1>
        <Callout tone="warning" title="More review is needed">
          The fresh checks still show uncertainty. Revisit the diagram and worked decisions before
          continuing.
        </Callout>
        {kc.number === 5 && (
          <Text>
            For two-lens systems, first secure the single-lens image, then use that image as the
            next object.
          </Text>
        )}
        <Row gap={8} wrap>
          <Button
            variant="primary"
            onClick={() => {
              setStatus((previous) => ({ ...previous, [kc.id]: 'in_progress' }));
              onEvent({
                type: 'kc_resumed_at_reentry',
                kcId: kc.id,
                note: 'Resumed in review-only model reentry; exposed families remain rehearsal-only across response runs.',
              });
              updateScreen('review_reentry');
            }}
          >
            Review the visual model
          </Button>
          <Button variant="secondary" onClick={() => goToTarget('map')}>
            Return to lesson map
          </Button>
        </Row>
      </Stack>
    );
  }

  if (screen === 'review_reentry') {
    return (
      <Stack gap={16}>
        <Text size="small" tone="tertiary">
          Visual model review
        </Text>
        <H1>Trace the ray rule again</H1>
        <Diagram kind={kc.diagram} />
        <EquationStrip
          kind={
            kc.diagram === 'reflection'
              ? 'reflection'
              : kc.diagram === 'refraction'
                ? 'refraction'
                : kc.diagram === 'compound'
                  ? 'compound'
                  : 'imaging'
          }
        />
        {kc.model.map((paragraph) => (
          <div key={paragraph}>
            <Text>{paragraph}</Text>
          </div>
        ))}
        <Button variant="secondary" onClick={() => goToTarget('map')}>
          Return to lesson map
        </Button>
      </Stack>
    );
  }

  return (
    <Stack gap={16}>
      <H1>Return to a safe lesson step</H1>
      <Callout tone="warning" title="This page could not be restored">
        Your answers are still saved. Return to the visual model or the lesson map.
      </Callout>
      <Row gap={8} wrap>
        <Button
          variant="primary"
          onClick={() => {
            onEvent({
              type: 'invalid_runtime_state_recovered',
              kcId: kc.id,
              note: `Recovered unknown screen ${screen} to review-only model reentry without reusing item families.`,
            });
            setStatus((previous) => ({ ...previous, [kc.id]: 'in_progress' }));
            updateScreen('review_reentry');
          }}
        >
          Recover at model review
        </Button>
        <Button variant="secondary" onClick={() => goToTarget('map')}>
          Return to lesson map
        </Button>
      </Row>
    </Stack>
  );
}

function LessonMap({
  statuses,
  goToTarget,
  extensionDone,
}: {
  statuses: StatusMap;
  goToTarget: (target: string) => void;
  extensionDone: boolean;
}) {
  const completed = KCS.filter((kc) => statuses[kc.id] === 'simulated_complete').length;
  const allCore = completed === KCS.length;
  const nextKc = KCS.find((kc) => statuses[kc.id] !== 'simulated_complete') ?? KCS[0];
  const actionLabel =
    completed === 0
      ? 'Begin starting check'
      : allCore && !extensionDone
        ? 'Explore the eye application'
        : allCore
          ? 'Review the lesson'
          : `Continue Topic ${nextKc.number}`;

  return (
    <div className="lesson-start">
      <p className="lesson-start__context">
        Chemical &amp; physical foundations · Geometrical optics
      </p>
      <H1>Predict images with lenses and mirrors</H1>
      <p className="lesson-start__summary">
        {completed === 0
          ? 'Begin with one short ray question so the lesson can choose the right support.'
          : allCore
            ? 'Your core lesson is complete; revisit the model or apply it to the eye.'
            : `Pick up with Topic ${nextKc.number}, where your saved place is ready.`}
      </p>
      <Button
        variant="primary"
        style={{ width: '100%' }}
        onClick={() => goToTarget(allCore && !extensionDone ? 'extension' : nextKc.id)}
      >
        {actionLabel}
      </Button>
      <details className="lesson-disclosure">
        <summary>What this lesson covers</summary>
        <div>
          <p>
            Trace reflection and refraction, then use ray diagrams and sign conventions for mirrors,
            lenses, and two-lens systems.
          </p>
          <p>An optional eye application follows the five core topics.</p>
        </div>
      </details>
    </div>
  );
}

function ExtensionView({
  responses,
  setResponses,
  hints,
  setHints,
  done,
  setDone,
  familyExposures,
  runId,
  reviewerExposedThisRun,
  onEvent,
  goToTarget,
}: {
  responses: ResponseMap;
  setResponses: SetCanvasState<ResponseMap>;
  hints: BoolMap;
  setHints: SetCanvasState<BoolMap>;
  done: boolean;
  setDone: SetCanvasState<boolean>;
  familyExposures: FamilyExposureMap;
  runId: string;
  reviewerExposedThisRun: boolean;
  onEvent: (event: EventInput) => void;
  goToTarget: (target: string) => void;
}) {
  const allCommitted = EXTENSION_ITEMS.every((item) => responses[item.id]?.committed);
  const accommodationCommitted = Boolean(responses[EXTENSION_ITEMS[0].id]?.committed);
  const correctionCommitted = Boolean(responses[EXTENSION_ITEMS[1].id]?.committed);

  if (!accommodationCommitted) {
    return (
      <Stack gap={18}>
        <div>
          <Text size="small" tone="tertiary">
            Optional application · Step 1 of 2
          </Text>
          <H1>The eye as an optical instrument</H1>
          <Text>
            Treat the cornea and eye lens as one converging system. A clear image is real and lands
            on the fixed retina.
          </Text>
        </div>
        <EyeDiagram />
        <Question
          item={EXTENSION_ITEMS[0]}
          responses={responses}
          setResponses={setResponses}
          hints={hints}
          setHints={setHints}
          kcId="V3-EXT-011872"
          onEvent={onEvent}
          familyExposures={familyExposures}
          runId={runId}
          reviewerExposedThisRun={reviewerExposedThisRun}
        />
        <Button variant="secondary" onClick={() => goToTarget('map')}>
          Return to lesson map
        </Button>
      </Stack>
    );
  }

  if (!correctionCommitted) {
    return (
      <Stack gap={18}>
        <div>
          <Text size="small" tone="tertiary">
            Optional application · Step 2 of 2
          </Text>
          <H1>Place a corrective image where the eye can use it</H1>
        </div>
        <EyeDiagram />
        <section className="worked-decision">
          <H2>Worked decision</H2>
          <Text>
            A simplified myopic eye has far point 0.500 m. For a distant object, the correction
            makes q = −0.500 m, so P = −2.00 D. Negative power means a diverging lens.
          </Text>
        </section>
        <Question
          item={EXTENSION_ITEMS[1]}
          responses={responses}
          setResponses={setResponses}
          hints={hints}
          setHints={setHints}
          kcId="V3-EXT-011872"
          onEvent={onEvent}
          familyExposures={familyExposures}
          runId={runId}
          reviewerExposedThisRun={reviewerExposedThisRun}
        />
        <Button variant="secondary" onClick={() => goToTarget('map')}>
          Return to lesson map
        </Button>
      </Stack>
    );
  }

  return (
    <Stack gap={18}>
      <div>
        <Text size="small" tone="tertiary">
          Optional application complete
        </Text>
        <H1>One lens model, two eye decisions</H1>
        <Text>
          You connected accommodation and corrective power to a fixed retinal image. This simplified
          physics model is not clinical guidance.
        </Text>
      </div>
      <EyeDiagram />
      {done && (
        <Callout tone="success" title="Application complete">
          You can return to the lesson map or review either eye decision later.
        </Callout>
      )}
      <Row gap={8} wrap>
        {!done && (
          <Button
            variant="primary"
            disabled={!allCommitted}
            onClick={() => {
              setDone(true);
              onEvent({
                type: 'extension_context_completed',
                kcId: 'V3-EXT-011872',
                note: 'Governed eye context completed; canAffectEvidence=false.',
              });
            }}
          >
            Complete eye application
          </Button>
        )}
        <Button variant="secondary" onClick={() => goToTarget('map')}>
          Return to lesson map
        </Button>
      </Row>
    </Stack>
  );
}

const REVIEW_SECTIONS = [
  'Manifest',
  'Screen map',
  'Item bank',
  'Conventions',
  'Branch tests',
  'Evidence',
  'Event log',
  'Capstone placement',
  'Accessibility',
  'Sources',
  'Publication gates',
];

function ReviewerView({
  section,
  setSection,
  eventLog,
  contaminated,
  runId,
  statuses,
  familyExposures,
}: {
  section: string;
  setSection: SetCanvasState<string>;
  eventLog: EventRecord[];
  contaminated: boolean;
  runId: string;
  statuses: StatusMap;
  familyExposures: FamilyExposureMap;
}) {
  return (
    <Stack gap={18}>
      <div>
        <Text size="small" tone="tertiary">
          Internal quality-review · simulation contract · {runId}
        </Text>
        <H1>V3-LES-443492 review surface</H1>
        <Text>
          Reviewer mode exposes every keyed family and permanently contaminates current and later
          response runs that reuse them. No result from this artifact may be called blind,
          untouched, instructional-exit evidence, or mastery evidence.
        </Text>
      </div>
      <Callout tone="warning" title="Key exposure contamination">
        {contaminated
          ? 'reviewer_key_exposure or retained family exposure is recorded. Neither learner mode nor a response-run reset clears it.'
          : 'Entering this surface must set reviewer_key_exposure before any keys are used.'}
      </Callout>
      <Row gap={6} wrap>
        {REVIEW_SECTIONS.map((name) => (
          <span key={name}>
            <Pill active={section === name} onClick={() => setSection(name)}>
              {name}
            </Pill>
          </span>
        ))}
      </Row>
      <Divider />
      {section === 'Manifest' && <ReviewerManifest />}
      {section === 'Screen map' && <ReviewerScreenMap />}
      {section === 'Item bank' && <ReviewerItemBank />}
      {section === 'Conventions' && <ReviewerConventions />}
      {section === 'Branch tests' && <ReviewerBranchTests />}
      {section === 'Evidence' && <ReviewerEvidence />}
      {section === 'Event log' && (
        <ReviewerEventLog
          eventLog={eventLog}
          activeRunId={runId}
          activeRunContaminated={contaminated}
          familyExposures={familyExposures}
        />
      )}
      {section === 'Capstone placement' && <ReviewerCapstonePlacement statuses={statuses} />}
      {section === 'Accessibility' && <ReviewerAccessibility />}
      {section === 'Sources' && <ReviewerSources />}
      {section === 'Publication gates' && <ReviewerGates />}
    </Stack>
  );
}

function ReviewerManifest() {
  return (
    <Stack gap={16}>
      <H2>Canonical manifest</H2>
      <Table
        headers={['Field', 'Exact value']}
        rows={[
          ['Registry artifact', 'MCAT-V3-AUTHORITATIVE-REGISTRY-2026-07-22-01'],
          ['SHA-256', '635c39e9c0ebb28a3892399449aa9b74893aae3264924cd739b92b6e370ba26a'],
          [
            'Canonical / graph / sequence freezes',
            'MCAT-V3-CANONICAL-FRZ-2026-07-22-01 · MCAT-V3-GRAPH-FRZ-2026-07-22-01 · MCAT-V3-SEQUENCE-FRZ-2026-07-22-01',
          ],
          ['Lesson / grouping', 'V3-LES-443492 · V3-CL-443492'],
          ['Throughline', 'reflection or refraction → single element → compound image'],
          [
            'Artifact status',
            'INTERNAL_QUALITY_REVIEW · simulation only · not publication or evidence runtime',
          ],
          ['State binding', `${STATE_SCHEMA_VERSION} · ${CONTENT_VERSION} · ${RUN_VERSION}`],
          [
            'Response-run reset',
            'Clears mutable responses only; family exposure and contamination persist, so reused families remain rehearsal-only',
          ],
          ['Content version', CONTENT_VERSION],
          ['reviewed_content_hash', 'PENDING_PUBLICATION_GATE'],
          ['Timing contract', 'Normalized table below; external-only capstone time is excluded'],
          [
            'KC4→KC5 overlay ownership',
            `${BRIDGE_EPISODE_TIMING.ownership} · ${BRIDGE_EPISODE_TIMING.relation} · countsAgainstKc4RepairCap=${BRIDGE_EPISODE_TIMING.countsAgainstKc4RepairCap} · countsAgainstKc5RepairCap=${BRIDGE_EPISODE_TIMING.countsAgainstKc5RepairCap}`,
          ],
          [
            'Recommended breaks',
            'Optional 5 min after KC 2 and 5 min after KC 4; excluded from instructional totals',
          ],
          [
            'Open holds',
            'V3-HOLD-110003 learner validation absent; V3-HOLD-110005 hard-edge and representation readiness provisional',
          ],
        ]}
        striped
      />
      <H2>Ordered KCs and timing</H2>
      <Table
        headers={[
          'Order',
          'Canonical ID',
          'Claim',
          'Concise / standard',
          'Authorized targeted feature',
          'Each repair',
          'Exact repair',
        ]}
        rows={KCS.map((kc) => [
          String(kc.number),
          kc.id,
          kc.claim,
          `${kc.concise} / ${kc.standard}`,
          Object.keys(kc.targetedContrastByFeature).join(', '),
          `+${TIMING_CONTRACT.repairIncrementMinutes[kc.id]} min`,
          kc.repairRelation,
        ])}
        striped
      />
      <H2>Authorized targeted contrasts</H2>
      <Table
        headers={['KC', 'Repeated feature required', 'Only authorized contrast']}
        rows={KCS.flatMap((kc) =>
          Object.entries(kc.targetedContrastByFeature).map(([feature, contrast]) => [
            kc.id,
            feature,
            contrast,
          ]),
        )}
        striped
      />
      <H2>Normalized timing contract</H2>
      <Table
        headers={['Scope', 'Minutes', 'Included / excluded']}
        rows={[
          [
            'Concise KC content',
            String(TIMING_CONTRACT.conciseCoreMinutes),
            'Five concise KC allocations; no transitions, repair, bridge, eye, or breaks',
          ],
          [
            'Standard KC content',
            String(TIMING_CONTRACT.standardCoreMinutes),
            'Five standard KC allocations; no transitions, repair, bridge, eye, or breaks',
          ],
          [
            'Transitions',
            String(TIMING_CONTRACT.transitionMinutes),
            'Four 1-minute KC-to-KC transitions',
          ],
          [
            'Concise KC shell',
            String(TIMING_CONTRACT.conciseKcShellMinutes),
            'Concise KC content + transitions; bridge excluded',
          ],
          [
            'Standard KC shell',
            String(TIMING_CONTRACT.standardKcShellMinutes),
            'Standard KC content + transitions; bridge excluded',
          ],
          [
            'Bridge check',
            String(BRIDGE_EPISODE_TIMING.checkMinutes),
            'Required separate hard-edge episode; direct pass ends the episode',
          ],
          [
            'Bridge invalid-check replacement',
            String(BRIDGE_EPISODE_TIMING.checkReplacementMinutes),
            'Conditional dedicated replacement; no KC repair cycle',
          ],
          [
            'Bridge repair/model',
            String(BRIDGE_EPISODE_TIMING.repairModelMinutes),
            'Conditional R14-REM-CP-086 model; outside both KC repair counters',
          ],
          [
            'Bridge confirmation',
            String(BRIDGE_EPISODE_TIMING.confirmationMinutes),
            'Conditional unassisted reentry confirmation',
          ],
          [
            'Bridge invalid-confirmation replacement',
            String(BRIDGE_EPISODE_TIMING.confirmationReplacementMinutes),
            'Conditional dedicated replacement; no KC repair cycle',
          ],
          [
            'Bridge worst valid episode',
            String(BRIDGE_EPISODE_TIMING.worstValidMinutes),
            'Check + check replacement + model + confirmation + confirmation replacement',
          ],
          [
            'Concise normal path',
            String(TIMING_CONTRACT.conciseNormalPathMinutes),
            'Concise KC shell + direct 1-minute bridge check',
          ],
          [
            'Standard normal path',
            String(TIMING_CONTRACT.standardNormalPathMinutes),
            'Standard KC shell + direct 1-minute bridge check',
          ],
          [
            'Maximum KC repair increment',
            String(TIMING_CONTRACT.maximumRepairMinutes),
            'Two in-microcycle repairs per KC: KC1 2×3; KC2–KC5 2×4; bridge excluded',
          ],
          [
            'Worst valid core branch',
            String(TIMING_CONTRACT.worstValidCoreBranchMinutes),
            '80 standard KC + 4 transitions + 38 KC repair + 6 bridge episode',
          ],
          [
            'Governed eye extension',
            String(TIMING_CONTRACT.eyeExtensionMinutes),
            'Separate from five-KC core; no evidence state',
          ],
          [
            'Concise normal + eye',
            String(TIMING_CONTRACT.conciseNormalWithEyeMinutes),
            'Concise normal path + eye; excludes optional breaks',
          ],
          [
            'Standard normal + eye',
            String(TIMING_CONTRACT.standardNormalWithEyeMinutes),
            'Standard normal path + eye; excludes optional breaks',
          ],
          [
            'Worst valid + eye',
            String(TIMING_CONTRACT.worstValidWithEyeMinutes),
            'Worst valid core branch + eye; excludes optional breaks',
          ],
          [
            'Optional breaks',
            String(TIMING_CONTRACT.optionalBreakMinutesTotal),
            `${TIMING_CONTRACT.optionalBreakCount} × ${TIMING_CONTRACT.optionalBreakMinutesEach} min; after KC2 and KC4`,
          ],
          [
            'Worst valid + eye + breaks',
            String(TIMING_CONTRACT.worstValidWithEyeAndBreaksMinutes),
            'Maximum scheduled envelope; capstone excluded',
          ],
        ]}
        striped
      />
      <Callout tone="warning" title="Hard-edge episode is not a third KC4 repair">
        The bridge model is governed by {BRIDGE_EPISODE_TIMING.relation} after KC4 completion. It
        never increments KC4’s or KC5’s two-cycle in-microcycle repair counter. The episode permits
        one check, at most one check replacement, one model, one confirmation, and at most one
        confirmation replacement—up to {BRIDGE_EPISODE_TIMING.worstValidMinutes} minutes.
      </Callout>
      <H2>Graph and sequence</H2>
      <Table
        headers={['Record', 'Semantics']}
        rows={[
          [
            'V3-EDG-403420',
            'KC 4 → KC 5; separate 1–6 minute hard-edge episode at image-to-next-object transfer; outside both KC repair caps',
          ],
          ['V3-EDG-476152', 'KC 2 → capstone; hard at combined judgment'],
          ['V3-EDG-570038', 'KC 5 → capstone; hard'],
          ['V3-EDG-748598', 'KC 3 → capstone; hard'],
          ['V3-EDG-731587', 'KC 4 → capstone; nonblocking CAPSTONE_COMPONENT_READY'],
          ['V3-EDG-345877', 'V3-KC-814479 → KC 5; nonblocking SIRS APPLIED_TO point'],
          [
            'First delivery',
            'R14-FD-443492 · phase V3-PHS-462809 · module V3-MOD-230689 · global event 125',
          ],
          ['Internal order', 'R14-INTERNAL-443492 · exactly the five KCs'],
          ['Capstone placement', 'R14-CAP-081516 · module event 5 · global event 129'],
          [
            'Revisit',
            'R14-RV-443492 · changed representation, new integration, reduced scaffolding',
          ],
        ]}
        striped
      />
      <Callout tone="warning" title="Authority ceiling">
        Source ceiling is the supplied 2020 AAMC content, page 63, FC4/4D. Present-day AAMC
        authority was not refreshed; learner validation is absent.
      </Callout>
    </Stack>
  );
}

function ReviewerScreenMap() {
  return (
    <Stack gap={16}>
      <H2>Learner screen map</H2>
      <Table
        headers={['Checkpoint', 'Learner function', 'Evidence effect', 'Transition']}
        rows={[
          [
            'KC5 bridge_intro',
            'Plain-language image→next-object explanation with compound SVG; no item',
            'None',
            'bridge_gate',
          ],
          [
            'KC5 bridge_gate',
            '1-minute unexposed, unassisted point-of-use check',
            'Separate hard-edge episode; no KC repair count',
            'KC 5 entry, 1-minute invalid replacement, or model',
          ],
          [
            'KC5 bridge_repair',
            '2-minute KC4 operation model; no edge-clear item',
            'Separate hard-edge episode; neither KC repair counter increments',
            '1-minute separate bridge_reentry',
          ],
          [
            'KC5 bridge_reentry',
            '1-minute unexposed confirmation after model',
            'Clears simulated edge only if correct and unassisted',
            'KC 5 entry, 1-minute invalid replacement, or hold',
          ],
          [
            'KC5 invalid replacement',
            'Dedicated 1-minute family for invalid/reused check or confirmation',
            'No KC repair count and no automatic pause',
            'KC 5 entry, model, or fail-closed hold',
          ],
          [
            'entry',
            'Fresh prerequisite probe; disambiguator after unresolved/miss; feedback withheld',
            'Routing only',
            'Target only after two same-feature misses with a matching KC-authorized contrast',
          ],
          [
            'route_result',
            'Close routing before revealing entry/disambiguator feedback',
            'Routing only',
            'Prediction',
          ],
          ['prediction', 'Commit before model reveal', 'Simulation telemetry', 'Model'],
          [
            'model / model_rule_n',
            'One visual rule per screen with SVG, prose summary, and worked trace note; exact authorized contrast appears only on rule 1',
            'None',
            'Next visual rule or worked',
          ],
          [
            'worked / worked_principle',
            'Construction goal and governing principle on separate SVG-first screens',
            'Simulation telemetry',
            'worked_step_0',
          ],
          [
            'worked_step_n / worked_check',
            'One operation per screen, then a ray/result consistency check',
            'Simulation telemetry',
            'A2; standalone artifact has no authorized concise bypass',
          ],
          [
            'A2',
            'Guided calculation or construction',
            'Simulation telemetry',
            'Advance only after correct unassisted performance; otherwise fresh supported recovery',
          ],
          [
            'A1',
            'One remaining cue',
            'Simulation telemetry',
            'Advance only after correct unassisted performance; otherwise fresh supported recovery',
          ],
          [
            'A2/A1 recovery_teach',
            'Selected authored response feature is explained with its SVG before the recovery family is presented; unresolved responses stay non-causal',
            'No item exposure',
            'Stage-specific recovery',
          ],
          [
            'A2/A1 recovery',
            'Stage-specific fresh family with supplied cue',
            'Supported simulation telemetry',
            'Next fade only after correct recovery; otherwise practice pause',
          ],
          ['A0', 'Independent practice item', 'Simulation telemetry only', 'Contrast'],
          ['contrast', 'Boundary cases and model selector', 'None', 'Two-item exit'],
          [
            'exit',
            'Near-use + changed representation; identical neutral acknowledgment until both close',
            'Reused families are rehearsal-only',
            'Handoff, globally fresh replacement, or feature-targeted repair',
          ],
          [
            'repair cycle 1',
            'Exact selected feature is taught with its SVG before any fresh item appears',
            'No evidence',
            'repair_check',
          ],
          [
            'repair cycle 2',
            'Same positive-compatibility and global-freshness rule; teaching remains separate from the item',
            'No evidence',
            'repair_check, then final fresh pair or fail-closed pause',
          ],
          [
            'repair_check',
            'Only the positively compatible fresh repair item appears',
            'No evidence',
            'Branch-matched unexposed fresh pair',
          ],
          ['pause', 'Bounded termination after second failed cycle', 'No exit', 'Planner control'],
          [
            'review_reentry',
            'Resume model review without reusing exposed A0 families',
            'No evidence',
            'New authored family required for freshness',
          ],
          [
            'invalid screen',
            'Preserve history and show explicit recovery controls',
            'No penalty',
            'Entry or map',
          ],
          ['handoff', 'Exact successor cue', 'Simulated completion preserved', 'Next KC'],
        ]}
        striped
      />
      <H2>Unlock map</H2>
      <Text>
        Learner navigation is sequential. Reviewer-key and family exposure persist across
        response-run resets; reused families are rehearsal-only and cannot regain independent
        status. KC 5 is inaccessible until KC 4 is simulated complete, then dedicated confirmation,
        repair/model, reentry, and invalid-item replacement families enforce V3-EDG-403420 with
        R14-REM-CP-086. R14-REM-CP-135 is reserved for KC 5. The eye extension follows core; the
        capstone launches only from a separate artifact.
      </Text>
    </Stack>
  );
}

function ItemInspector({ item }: { item: Item }) {
  return (
    <CollapsibleSection
      title={`${item.id} · ${item.stage}`}
      trailing={<Text size="small" tone="tertiary">{`Key ${item.key} · ${item.duration}`}</Text>}
    >
      <Stack gap={8}>
        <Text weight="semibold">{item.prompt}</Text>
        <Text size="small" tone="secondary">{`Family: ${item.family} · Cue: ${item.cue}`}</Text>
        <Table
          headers={[
            'Choice',
            'Learner-facing response',
            'Response feature',
            'Feature source',
            'Reviewer rationale',
          ]}
          rows={item.options.map((option) => [
            option.id === item.key ? `${option.id} · KEY` : option.id,
            option.text,
            option.feature,
            option.featureSource,
            option.rationale,
          ])}
          rowTone={item.options.map((option) => (option.id === item.key ? 'success' : undefined))}
          striped
        />
      </Stack>
    </CollapsibleSection>
  );
}

function ReviewerItemBank() {
  const reviewItems = ALL_LESSON_ITEMS;
  const fullyAuthoredItems = reviewItems.filter((item) =>
    item.options.every((option) => option.featureSource === 'authored'),
  );
  const authoredOptionCount = reviewItems.reduce(
    (sum, item) =>
      sum + item.options.filter((option) => option.featureSource === 'authored').length,
    0,
  );
  const keyFeatureIssues = reviewItems.filter(
    (item) => item.options.find((option) => option.id === item.key)?.feature !== 'correct-model',
  ).length;
  const incompatibleExitOptions = KCS.flatMap((kc) =>
    kc.exits.flatMap((exitSet) =>
      [exitSet.near, exitSet.changed].flatMap((item) =>
        item.options
          .filter((option) => option.id !== item.key)
          .filter(
            (option) =>
              !kc.repairs.some((repair) => repair.targetFeatures.includes(option.feature)),
          ),
      ),
    ),
  ).length;
  const metadataComplete =
    fullyAuthoredItems.length === reviewItems.length &&
    keyFeatureIssues === 0 &&
    incompatibleExitOptions === 0;
  return (
    <Stack gap={10}>
      <H2>Complete item bank, keys, and rationales</H2>
      <Text tone="secondary">
        All learner choices, keys, cues, families, durations, and objective response rationales are
        exposed below.
      </Text>
      <Callout tone="neutral" title="Key-position policy">
        Choice payloads are deterministically rotated in canonical declaration order so correct
        positions are distributed A→D without changing any verified calculation, rationale, or
        response feature.
      </Callout>
      <Callout
        tone={metadataComplete ? 'success' : 'danger'}
        title={metadataComplete ? 'Authored routing metadata complete' : 'Metadata gate failed'}
      >
        {fullyAuthoredItems.length} of {reviewItems.length} items expose authored metadata on every
        option; {authoredOptionCount} option features are authored, {keyFeatureIssues} keyed options
        have a non-correct feature, and {incompatibleExitOptions} exit distractors lack a positively
        compatible repair branch. Defaulted metadata is never eligible for targeted routing or
        repair selection.
      </Callout>
      <Table
        headers={['Key position', 'Item count']}
        rows={LETTERS.map((letter) => [
          letter,
          String(reviewItems.filter((item) => item.key === letter).length),
        ])}
        striped
      />
      <Text size="small" tone="secondary">
        Recomputed after adding both invalid-item replacement families:{' '}
        {LETTERS.map(
          (letter) => `${letter}=${reviewItems.filter((item) => item.key === letter).length}`,
        ).join(' · ')}
        . With 86 items, adjacent totals differ by at most one.
      </Text>
      {KCS.map((kc) => (
        <div key={kc.id}>
          <CollapsibleSection
            title={`${kc.short} · ${kc.title}`}
            count={allKcItems(kc).length}
            defaultOpen={kc.number === 1}
          >
            <Stack gap={4}>
              <Table
                headers={['Repair branch', 'Target response features', 'Canonical relation']}
                rows={kc.repairs.map((repair) => [
                  repair.title,
                  repair.targetFeatures.join(', '),
                  kc.repairRelation,
                ])}
                striped
              />
              {allKcItems(kc).map((item) => (
                <div key={item.id}>
                  <ItemInspector item={item} />
                </div>
              ))}
            </Stack>
          </CollapsibleSection>
        </div>
      ))}
      <CollapsibleSection title="Governed extension" count={EXTENSION_ITEMS.length}>
        {EXTENSION_ITEMS.map((item) => (
          <div key={item.id}>
            <ItemInspector item={item} />
          </div>
        ))}
      </CollapsibleSection>
      <CollapsibleSection title="KC 4 → KC 5 dedicated bridge" count={4}>
        {[
          K5_BRIDGE_CHECK,
          K5_BRIDGE_CHECK_REPLACEMENT,
          K5_BRIDGE_REENTRY,
          K5_BRIDGE_REENTRY_REPLACEMENT,
        ].map((item) => (
          <div key={item.id}>
            <ItemInspector item={item} />
          </div>
        ))}
      </CollapsibleSection>
    </Stack>
  );
}

function ReviewerConventions() {
  return (
    <Stack gap={16}>
      <H2>Equations and sign conventions</H2>
      <Table
        headers={['Domain', 'Exact convention', 'Required check']}
        rows={[
          [
            'Coordinates',
            '+x right; +y up; screen conversion reverses visual y',
            'Every diagram supplies a coordinate table and prose equivalent',
          ],
          [
            'Angles',
            'Measured from normal; 0° ≤ θ ≤ 90°; degree mode',
            'Surface angles must be converted',
          ],
          ['Reflection', 'θr = θi', 'Parallel component preserved; normal component reversed'],
          ['Refraction', 'n = c/v; n1 sinθ1 = n2 sinθ2', 'Frequency fixed; λ2/λ1 = n1/n2'],
          [
            'TIR',
            'θc = sin⁻¹(n2/n1), n1 > n2; TIR only θi > θc',
            'Equality is grazing transmission',
          ],
          ['Imaging', '1/p + 1/q = 1/f; m = hi/ho = −q/p', 'Report sign and physical location'],
          [
            'Real / virtual object',
            'p > 0 when incident rays diverge from point; p < 0 when they converge toward point beyond element',
            'Use ray state, not label alone',
          ],
          [
            'Mirrors',
            'concave f>0; convex f<0; q>0 object side real; q<0 behind mirror virtual',
            'f = R/2 only paraxially',
          ],
          [
            'Lenses',
            'converging f>0; diverging f<0; q>0 far side real; q<0 object side virtual',
            'Positive q has different side than mirror',
          ],
          ['Power', 'P = 1/f with f in meters; unit diopter', 'Preserve focal-length sign'],
          [
            'Compound',
            'For left-to-right lenses xIj = Lj + qj; mtotal = ∏mj',
            'Finish each stage before the next',
          ],
        ]}
        striped
      />
      <H2>Model selector</H2>
      <Text>
        Flat reflective boundary → equal angles about normal. Transparent boundary → indices and
        Snell; check TIR before transmission. Curved mirror → mirror rays and mirror signs. Thin
        lens → lens rays and lens signs. Multiple elements → finish one element and make its image
        the next object.
      </Text>
    </Stack>
  );
}

function ReviewerBranchTests() {
  const tests = [
    [
      '1',
      'All five exit pairs pass',
      'Five simulated_kc_completion events; never emit instructional-exit or mastery evidence.',
    ],
    [
      '2',
      'Concise route requested',
      'Reject in this standalone artifact because no signed prior-evidence packet is attached; fail closed to standard support.',
    ],
    ['3', 'Missing route telemetry', 'Standard supportive route; never infer readiness.'],
    [
      '4',
      'Help on exit',
      'Item marked assisted; identical pre-close acknowledgment; replace complete pair after set feedback, without consuming repair.',
    ],
    [
      '5',
      'One exit miss',
      'No exit; select only a globally fresh repair/reentry branch with positive authored-feature compatibility; otherwise pause.',
    ],
    [
      '6',
      'Omission or Not sure',
      'Unresolved/supportive route; never label misconception from omission.',
    ],
    [
      '7',
      'Invalid bridge or reentry item',
      'Preserve response; branch to its dedicated unexposed replacement without consuming repair or automatically pausing.',
    ],
    [
      '8',
      'KC 5 point-of-use unresolved',
      'The separate R14-REM-CP-086 + V3-EDG-403420 model episode closes before unexposed reentry; neither KC repair counter changes and R14-REM-CP-135 stays reserved.',
    ],
    ['9', 'Second failed repair cycle', 'kc_paused_for_repair; planner regains control.'],
    [
      '10',
      'Pause/resume',
      'Resume review-only at explicit reentry; append-only exposure remains and only newly authored unexposed content can support another independent A0.',
    ],
    ['11', 'Extension completes', 'extension_context_completed only; no evidence state.'],
    [
      '12',
      'Capstone reference',
      'No runnable capstone here; external launcher derives eligibility from hard edges and rechecks canonical state.',
    ],
    ['13', 'SIRS edge unresolved', 'May increase support but cannot block KC 5.'],
    ['14', 'Attempted adaptive bypass', 'Reject; currently_authorized_bypass=false.'],
    [
      '15',
      'Reviewer keys opened',
      'Append reviewer_key_exposure; retain every keyed family exposure across all later response runs.',
    ],
    [
      '16',
      'First exit position commits',
      'Show the same neutral acknowledgment for every response kind; reveal no correctness.',
    ],
    [
      '17',
      'Entry answer or omission commits',
      'Withhold key/rationale until required disambiguator closes and route_result opens.',
    ],
    [
      '18',
      'A2/A1 is missed, helped, omitted, or invalid',
      'Do not fade; open the stage-specific fresh supported recovery family.',
    ],
    [
      '19',
      'Confirmed new run',
      'Reset mutable responses, increment run ID, retain family exposure, label reused families rehearsal-only, and never restore independent status.',
    ],
    [
      '20',
      'Two route misses have different tags',
      'Fail closed to standard support; targeted routing requires the same whitelisted authored feature twice.',
    ],
    [
      '21',
      'Route miss is helped or reused',
      'Exclude it from targeted-feature counting even when its selected option has an authored feature.',
    ],
    [
      '22',
      'Assisted bridge reentry is correct',
      'Do not clear V3-EDG-403420; pause under R14-REM-CP-086 without consuming R14-REM-CP-135.',
    ],
    [
      '23',
      'No positive fresh repair branch',
      'Fail closed to kc_paused_for_repair; never choose a zero-score or previously exposed fallback.',
    ],
    [
      '24',
      'Dedicated bridge replacement is itself invalid/reused',
      'Enter explicit fail-closed hold without consuming repair, marking KC 5 paused, or clearing the edge.',
    ],
    [
      '25',
      'A displayed family is reopened or survives reset',
      'Presentation count remains append-only; label the family rehearsal-only and exclude it from route, fade, exit, bridge, and fresh-repair decisions.',
    ],
    [
      '26',
      'Two misses repeat an unauthorized feature',
      'Fail closed to standard support and display no targeted contrast; only the KC’s explicit feature→contrast mapping may authorize one.',
    ],
    [
      '27',
      'K3-R2X1 selects f=R distractor',
      'Record equation-operation and route only to the compatible ray/equation repair branch; never select sign classification from this response.',
    ],
    [
      '28',
      'Longest valid bridge path',
      'Count 1 check + 1 check replacement + 2 model + 1 confirmation + 1 confirmation replacement = 6 minutes outside both KC repair caps.',
    ],
    [
      '29',
      'Timing totals recomputed',
      `Concise normal=${TIMING_CONTRACT.conciseNormalPathMinutes}; standard normal=${TIMING_CONTRACT.standardNormalPathMinutes}; worst core=${TIMING_CONTRACT.worstValidCoreBranchMinutes}; worst + eye=${TIMING_CONTRACT.worstValidWithEyeMinutes}; worst + eye + breaks=${TIMING_CONTRACT.worstValidWithEyeAndBreaksMinutes}.`,
    ],
  ];
  return (
    <Stack gap={16}>
      <H2>Deterministic branch tests</H2>
      <Table headers={['#', 'Condition', 'Required result']} rows={tests} striped />
      <Callout tone="info" title="Runtime implementation">
        The Canvas persists version-bound target, checkpoint, route, authorized route feature,
        response commitments, assistance flags, exit variants, feature-selected repairs, KC states,
        contamination, run identity, cross-run family exposure, extension completion, and an
        append-only prototype event log.
      </Callout>
    </Stack>
  );
}

function ReviewerEvidence() {
  return (
    <Stack gap={16}>
      <H2>Event and evidence semantics</H2>
      <Table
        headers={['Event / content', 'Permitted semantics']}
        rows={[
          [
            'Production kc_microcycle_started',
            'Required contract; durable production delivery is not implemented here',
          ],
          [
            'Prototype item_family_presented / response_selected / attempt_submitted',
            'Conservative screen/navigation exposure plus interaction records with run, item, family, feature, assistance, and simulation fields',
          ],
          [
            'Targeted route',
            'Requires two committed, incorrect, unassisted, non-rehearsal misses with one identical whitelisted authored feature and that KC’s exact feature→contrast authorization; otherwise standard',
          ],
          [
            'Persistent family registry',
            'Retained across response-run reset; reused families are rehearsal-only and cannot recover independent status',
          ],
          [
            'entry / prediction / worked / A2 / A1 / helped A0',
            'Internal simulation or routing telemetry only',
          ],
          [
            'Unassisted microcycle A0 practice',
            'Internal simulation telemetry; not downstream mastery',
          ],
          [
            'Two independent exit simulations pass',
            'Record simulated_kc_completion only; never emit kc_instructional_exit_recorded',
          ],
          ['Repair teaching', 'exact_kc_repair_activity_started/completed; no evidence'],
          [
            'KC4→KC5 bridge model',
            'Separate 1–6 minute hard-edge episode; consumes neither KC4 nor KC5 in-microcycle repair counter',
          ],
          ['Two failed repair cycles', 'kc_paused_for_repair; no KC exit'],
          [
            'Five simulated completions',
            'Display internal run completion only; no lesson_delivery_completed event',
          ],
          ['Eye extension', 'extension_context_completed; canAffectEvidence=false'],
          [
            'Capstone',
            'Typed placement reference only; separate artifact must evaluate hard edges and own its result',
          ],
          ['SIRS perturbation', 'Primary KC 5; no secondary credit to V3-KC-814479'],
        ]}
        striped
      />
      <Text>
        The prototype log carries run, event, KC, item, family, response feature,
        contamination/simulation semantics, and notes. Registry hashes, policy signatures, durable
        delivery, and timing clocks remain production-contract requirements outside this Canvas.
      </Text>
      <Callout tone="warning" title="Integrity rule">
        One simulation pass plus one fail does not complete a KC simulation. Reviewer and family
        exposure are irreversible across response-run reset. Later failures never delete history;
        repair may open only with positive authored-feature compatibility and globally fresh branch
        families.
      </Callout>
    </Stack>
  );
}

function ReviewerEventLog({
  eventLog,
  activeRunId,
  activeRunContaminated,
  familyExposures,
}: {
  eventLog: EventRecord[];
  activeRunId: string;
  activeRunContaminated: boolean;
  familyExposures: FamilyExposureMap;
}) {
  const reviewerRunIds = new Set(
    eventLog.filter((event) => event.type === 'reviewer_key_exposure').map((event) => event.runId),
  );
  const familyRows = Object.entries(familyExposures)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([family, exposedRuns]) => {
      const uniqueRuns = Array.from(new Set(exposedRuns));
      const reviewerExposed = exposedRuns.some((exposedRunId) => reviewerRunIds.has(exposedRunId));
      return [
        family,
        uniqueRuns.join(', '),
        String(exposedRuns.length),
        reviewerExposed || exposedRuns.length > 1
          ? 'reused/reviewer-exposed · rehearsal only'
          : 'first presentation · retained',
      ];
    });
  return (
    <Stack gap={16}>
      <H2>Prototype append-only event and exposure log</H2>
      <Text>
        This implemented prototype records interaction-observed family exposure, reviewer-declared
        exposure of every keyed family, assistance, routing, bridge, repair, pause, reentry, and
        simulated completion. It is local review instrumentation, not the production evidence
        pipeline.
      </Text>
      <Table
        headers={[
          'Seq',
          'Run',
          'Mode',
          'Integrity',
          'Type',
          'KC / item',
          'Family / feature',
          'Note',
        ]}
        rows={eventLog.map((event) => [
          String(event.sequence),
          event.runId,
          event.simulationOnly ? 'simulation only' : 'invalid state',
          event.contaminated || (activeRunContaminated && event.runId === activeRunId)
            ? 'contaminated run'
            : 'learner-mode at event',
          event.type,
          [event.kcId, event.itemId].filter(Boolean).join(' · ') || 'run',
          [event.family, event.feature].filter(Boolean).join(' · ') || 'n/a',
          event.note,
        ])}
        striped
        stickyHeader
      />
      {familyRows.length > 0 && (
        <CollapsibleSection title="Persistent family exposure registry" count={familyRows.length}>
          <Table
            headers={['Family', 'Exposure run IDs', 'Presentation count', 'Current integrity']}
            rows={familyRows}
            striped
            stickyHeader
          />
        </CollapsibleSection>
      )}
      <Callout tone="warning" title="Production contract remains external">
        This prototype records conservative screen/navigation presentation. Server-authoritative
        visibility clocks, item validity, durable delivery, policy signatures, and cross-device
        identity remain required for publication and are not implemented by the Canvas host.
      </Callout>
    </Stack>
  );
}

function ReviewerCapstonePlacement({ statuses }: { statuses: StatusMap }) {
  const hardRows = CAPSTONE_PLACEMENT.hardEdges.map((edge) => [
    edge.edgeId,
    edge.sourceKc,
    'hard',
    statuses[edge.sourceKc] === 'simulated_complete'
      ? 'simulated component complete'
      : 'not complete in simulation',
  ]);
  const nonblockingRows = CAPSTONE_PLACEMENT.nonblockingEdges.map((edge) => [
    edge.edgeId,
    edge.sourceKc,
    edge.semantics,
    statuses[edge.sourceKc] === 'simulated_complete'
      ? 'simulated component complete'
      : 'not complete in simulation',
  ]);
  const hardReady = CAPSTONE_PLACEMENT.hardEdges.every(
    (edge) => statuses[edge.sourceKc] === 'simulated_complete',
  );
  return (
    <Stack gap={16}>
      <H2>Typed external capstone placement</H2>
      <Table
        headers={['Field', 'Typed value']}
        rows={[
          ['Canonical ID', CAPSTONE_PLACEMENT.id],
          ['Placement', CAPSTONE_PLACEMENT.placement],
          ['Launch behavior', CAPSTONE_PLACEMENT.launchBehavior],
          ['Lesson may launch', String(CAPSTONE_PLACEMENT.lessonMayLaunch)],
        ]}
        striped
      />
      <Table
        headers={['Edge', 'Source KC', 'Semantics', 'This run']}
        rows={[...hardRows, ...nonblockingRows]}
        striped
      />
      <Callout tone={hardReady ? 'info' : 'neutral'} title="Derived eligibility preview only">
        {hardReady
          ? 'The three canonical hard sources—KC 2, KC 3, and KC 5—are simulated complete. This does not launch or authorize the capstone; the external artifact must evaluate canonical state again.'
          : 'At least one canonical hard source—KC 2, KC 3, or KC 5—is not simulated complete. KC 4 is nonblocking CAPSTONE_COMPONENT_READY and is not promoted to a hard edge.'}
      </Callout>
    </Stack>
  );
}

function ReviewerAccessibility() {
  return (
    <Stack gap={16}>
      <H2>Accessibility contract</H2>
      <Table
        headers={['Requirement', 'Implementation']}
        rows={[
          [
            'Noncolor ray coding',
            'Solid physical rays; dashed virtual extensions; dot-dash normals/axes; labels and tables repeat meaning',
          ],
          [
            'Diagram semantics',
            'Each SVG has title, desc, role=img, exact coordinate table, and prose equivalent',
          ],
          [
            'Diagram inspection',
            'Focusable/tappable viewport enlarges in place; Escape closes; small screens keep labels readable in a contained horizontal scroller',
          ],
          [
            'Response access',
            'Native same-name radio inputs with labels, checked state, keyboard arrows, and no drag-only interaction',
          ],
          [
            'Commit order',
            'Prompt → native radio choices → commit / Not sure / omission / cue / item issue → feedback / continue',
          ],
          [
            'Math speech',
            'Equation strips use role=math with spoken aria-label and visible symbolic text',
          ],
          [
            'Reflow',
            'Topic navigation becomes a compact top stepper below 860 px; actions stack and diagrams remain contained at 320/375 px',
          ],
          ['Motion', 'No required animation; all ray states are static'],
          [
            'Contrast',
            'All colors derive from host semantic tokens; color never carries the only answer cue',
          ],
          [
            'Feedback language',
            'Describes the objective response feature; does not assert learner cause',
          ],
          [
            'Live feedback',
            'Polite atomic status regions announce commitments, support, and feedback',
          ],
          [
            'Exit concealment',
            'Identical neutral acknowledgment appears for every committed position until both exit responses close',
          ],
        ]}
        striped
      />
    </Stack>
  );
}

function ReviewerSources() {
  const sources = [
    [
      'OpenStax · Law of Reflection',
      'https://openstax.org/books/university-physics-volume-3/pages/1-2-the-law-of-reflection',
    ],
    [
      'OpenStax · Plane Mirrors',
      'https://openstax.org/books/university-physics-volume-3/pages/2-1-images-formed-by-plane-mirrors',
    ],
    [
      'OpenStax · Refraction',
      'https://openstax.org/books/university-physics-volume-3/pages/1-3-refraction',
    ],
    [
      'OpenStax · Total Internal Reflection',
      'https://openstax.org/books/university-physics-volume-3/pages/1-4-total-internal-reflection',
    ],
    [
      'OpenStax · Dispersion',
      'https://openstax.org/books/university-physics-volume-3/pages/1-5-dispersion',
    ],
    [
      'OpenStax · Spherical Mirrors',
      'https://openstax.org/books/university-physics-volume-3/pages/2-2-spherical-mirrors',
    ],
    [
      'OpenStax · Thin Lenses',
      'https://openstax.org/books/university-physics-volume-3/pages/2-4-thin-lenses',
    ],
    [
      'OpenStax · The Eye',
      'https://openstax.org/books/university-physics-volume-3/pages/2-5-the-eye',
    ],
    [
      'OpenStax · Microscopes and Telescopes',
      'https://openstax.org/books/university-physics-volume-3/pages/2-8-microscopes-and-telescopes',
    ],
    [
      'Physics Classroom · Mirror equation',
      'https://www.physicsclassroom.com/tutorial/reflection-and-mirrors/concave-mirrors/mirror-equation',
    ],
    [
      'Physics Classroom · Lens mathematics',
      'https://www.physicsclassroom.com/tutorial/refraction-and-lenses/lenses/mathematics-of-lenses',
    ],
    [
      'Physics Classroom · Critical angle',
      'https://www.physicsclassroom.com/tutorial/refraction-and-lenses/total-internal-reflection/critical-angle',
    ],
    [
      'NIST · Refractive index and wavelength',
      'https://emtoolbox.nist.gov/wavelength/documentation.asp',
    ],
  ];
  return (
    <Stack gap={16}>
      <H2>Physics verification and provenance</H2>
      <Text>
        Sources were accessed 2026-07-22 for equations, conventions, and calculation checks. Learner
        wording, figures, coordinates, numbers, and response sets are original; no protected
        question or prose was copied.
      </Text>
      <div style={{ display: 'grid', gap: 8 }}>
        {sources.map(([label, url]) => (
          <div key={url} className="source-row">
            <Text weight="semibold">{label}</Text>
            <Link href={url}>{url}</Link>
          </div>
        ))}
      </div>
      <Callout tone="neutral" title="Calculation status">
        All numerical keys were independently recalculated. Final publication still requires
        independent blind solve and two physics SME reproductions against the exact implementation
        hash.
      </Callout>
    </Stack>
  );
}

function ReviewerGates() {
  const gates = [
    [
      'Canonical fidelity',
      'Exact lesson, grouping, KC order, attachments, graph, sequence, and hold semantics.',
    ],
    ['Physics', 'Two independent SMEs reproduce every key and physical-side interpretation.'],
    [
      'Blind solve',
      'Must occur in a separate artifact with never-exposed families; no response-run reset in this Canvas restores freshness.',
    ],
    [
      'Construct alignment',
      'Each KC measures its claim; eye remains extension; capstone remains separate.',
    ],
    [
      'Family isolation',
      'Entry, instruction, exit, repair, downstream, and capstone are not renumbered clones.',
    ],
    [
      'Feedback',
      'Each rationale describes an objective response feature without causal learner labels.',
    ],
    [
      'Accessibility',
      'Keyboard, screen reader, reflow, math speech, reduced motion, and line-pattern redundancy pass.',
    ],
    [
      'Runtime safety',
      'Correct, incorrect, omission, Not sure, help, invalid, retry, reveal, pause, resume, and repair limit terminate.',
    ],
    [
      'Evidence integrity',
      'Guided/revealed/reused content cannot award downstream evidence; capstone cannot credit child KCs.',
    ],
    [
      'Rights and originality',
      'Original prose, numbers, figures, and questions; similarity review passes.',
    ],
    [
      'Provenance',
      'Registry hash, freeze IDs, URLs, access date, and content-version linkage are exact.',
    ],
    [
      'Final approval',
      'author ≠ blind solver ≠ final approver; physics, accessibility, rights, and architecture approvals bind exact hash.',
    ],
  ];
  return (
    <Stack gap={16}>
      <H2>Binary publication gates</H2>
      <Table
        headers={['Gate', 'Pass condition', 'Current state']}
        rows={gates.map(([gate, condition]) => [gate, condition, 'PENDING independent review'])}
        rowTone={gates.map(() => 'warning')}
        striped
      />
      <Callout tone="warning" title="Internal quality-review only">
        This Canvas is intentionally a simulation surface. reviewed_content_hash remains
        PENDING_PUBLICATION_GATE, and production event/evidence behavior requires a separate
        implementation and approval.
      </Callout>
    </Stack>
  );
}

function SideNavigation({
  activeTarget,
  statuses,
  reviewMode,
  goToTarget,
  allCore,
}: {
  activeTarget: string;
  statuses: StatusMap;
  reviewMode: boolean;
  goToTarget: (target: string) => void;
  allCore: boolean;
}) {
  const theme = useHostTheme();
  const firstOpen = KCS.findIndex((kc) => statuses[kc.id] !== 'simulated_complete');
  return (
    <nav
      className="lesson-navigation"
      aria-label="Lesson navigation"
      style={{ position: 'sticky', top: 12, alignSelf: 'start', background: theme.bg.editor }}
    >
      <div className="lesson-nav-list">
        <button
          className="nav-map"
          type="button"
          onClick={() => goToTarget('map')}
          aria-current={activeTarget === 'map' ? 'page' : undefined}
          style={{
            padding: '8px 6px',
            textAlign: 'left',
            color: activeTarget === 'map' ? theme.text.primary : theme.text.secondary,
            background: activeTarget === 'map' ? theme.fill.secondary : 'transparent',
            border: 0,
            borderRadius: 4,
            font: 'inherit',
            cursor: 'pointer',
          }}
        >
          Map
        </button>
        <span className="nav-section-label">
          <Text size="small" tone="tertiary">
            TOPICS
          </Text>
        </span>
        {KCS.map((kc, index) => {
          const accessible = reviewMode || index <= (firstOpen === -1 ? 4 : firstOpen);
          const active = activeTarget === kc.id;
          return (
            <button
              className="nav-topic"
              key={kc.id}
              type="button"
              disabled={!accessible}
              onClick={() => goToTarget(kc.id)}
              aria-current={active ? 'step' : undefined}
              style={{
                display: 'grid',
                gridTemplateColumns: '26px minmax(0,1fr)',
                gap: 7,
                padding: '7px 6px',
                textAlign: 'left',
                color: active ? theme.text.primary : theme.text.secondary,
                background: active ? theme.fill.secondary : 'transparent',
                border: 0,
                borderRadius: 4,
                opacity: accessible ? 1 : 0.45,
                cursor: accessible ? 'pointer' : 'not-allowed',
                font: 'inherit',
              }}
            >
              <span
                style={{
                  color:
                    statuses[kc.id] === 'simulated_complete'
                      ? theme.category.green
                      : theme.text.tertiary,
                }}
              >
                {statuses[kc.id] === 'simulated_complete' ? '✓' : String(index + 1)}
              </span>
              <span className="nav-topic-copy">
                <span className="nav-topic-label">{`Topic ${index + 1}`}</span>
                <span className="nav-topic-title"> · {kc.title}</span>
                <br />
                <span
                  className="nav-topic-status"
                  style={{ color: theme.text.tertiary, fontSize: 11 }}
                >
                  {statusLabel(statuses[kc.id])}
                </span>
              </span>
            </button>
          );
        })}
        <button
          className="nav-extension"
          type="button"
          disabled={!reviewMode && !allCore}
          onClick={() => goToTarget('extension')}
          style={{
            padding: '7px 6px',
            textAlign: 'left',
            color: activeTarget === 'extension' ? theme.text.primary : theme.text.secondary,
            background: activeTarget === 'extension' ? theme.fill.secondary : 'transparent',
            border: 0,
            borderRadius: 4,
            opacity: reviewMode || allCore ? 1 : 0.45,
            cursor: reviewMode || allCore ? 'pointer' : 'not-allowed',
            font: 'inherit',
          }}
        >
          Eye application
        </button>
      </div>
    </nav>
  );
}

export default function GeometricalOpticsLessonCanvas({ reviewMode }: { reviewMode: boolean }) {
  const theme = useHostTheme();
  const [activeTarget, setActiveTarget] = useCanvasState<string>(stateKey('active-target'), 'map');
  const [screens, setScreens] = useCanvasState<StringMap>(stateKey('screens'), DEFAULT_SCREENS);
  const [routes, setRoutes] = useCanvasState<StringMap>(stateKey('routes'), DEFAULT_ROUTES);
  const [routeFeatures, setRouteFeatures] = useCanvasState<StringMap>(
    stateKey('route-features'),
    DEFAULT_ROUTE_FEATURES,
  );
  const [responses, setResponses] = useCanvasState<ResponseMap>(stateKey('responses'), {});
  const [hints, setHints] = useCanvasState<BoolMap>(stateKey('hints'), {});
  const [statuses, setStatuses] = useCanvasState<StatusMap>(stateKey('statuses'), DEFAULT_STATUS);
  const [repairCycles, setRepairCycles] = useCanvasState<NumberMap>(
    stateKey('repair-cycles'),
    DEFAULT_ZEROES,
  );
  const [repairSelections, setRepairSelections] = useCanvasState<StringMap>(
    stateKey('repair-selections'),
    DEFAULT_REPAIR_SELECTIONS,
  );
  const [repairFeatures, setRepairFeatures] = useCanvasState<StringMap>(
    stateKey('repair-features'),
    DEFAULT_REPAIR_FEATURES,
  );
  const [nearVariants, setNearVariants] = useCanvasState<NumberMap>(
    stateKey('near-variants'),
    DEFAULT_ZEROES,
  );
  const [changedVariants, setChangedVariants] = useCanvasState<NumberMap>(
    stateKey('changed-variants'),
    DEFAULT_ZEROES,
  );
  const [extensionDone, setExtensionDone] = useCanvasState<boolean>(
    stateKey('extension-done'),
    false,
  );
  const [reviewSection, setReviewSection] = useCanvasState<string>(
    stateKey('review-section'),
    'Manifest',
  );
  const [runSequence, setRunSequence] = useCanvasState<number>(stateKey('run-sequence'), 1);
  const [runId, setRunId] = useCanvasState<string>(stateKey('run-id'), INITIAL_RUN_ID);
  const [contaminated, setContaminated] = useCanvasState<boolean>(
    stateKey('integrity-contaminated'),
    false,
  );
  const [resetArmed, setResetArmed] = useCanvasState<boolean>(stateKey('reset-armed'), false);
  const [familyExposures, setFamilyExposures] = useCanvasState<FamilyExposureMap>(
    stateKey('family-exposures'),
    {},
  );
  const [eventLog, setEventLog] = useCanvasState<EventRecord[]>(stateKey('event-log'), [
    {
      sequence: 1,
      runId: INITIAL_RUN_ID,
      type: 'internal_review_run_started',
      note: `Bound to ${STATE_SCHEMA_VERSION}, ${CONTENT_VERSION}, and ${RUN_VERSION}.`,
      simulationOnly: true,
      contaminated: false,
    },
  ]);

  const completed = KCS.filter((kc) => statuses[kc.id] === 'simulated_complete').length;
  const allCore = completed === KCS.length;
  const reviewerExposedThisRun = eventLog.some(
    (event) => event.runId === runId && event.type === 'reviewer_key_exposure',
  );
  const reviewerFamiliesExposedThisRun = ALL_LESSON_ITEMS.every((item) =>
    (familyExposures[item.family] ?? []).includes(runId),
  );
  const reviewerExposureReady =
    contaminated && reviewerExposedThisRun && reviewerFamiliesExposedThisRun;

  useEffect(() => {
    if (!reviewMode || reviewerExposureReady) return;

    setContaminated(true);
    setFamilyExposures((previous) => {
      const next = { ...previous };
      ALL_LESSON_ITEMS.forEach((item) => {
        const priorRuns = next[item.family] ?? [];
        if (!priorRuns.includes(runId)) next[item.family] = [...priorRuns, runId];
      });
      return next;
    });
    setEventLog((previous) => {
      if (
        previous.some((event) => event.runId === runId && event.type === 'reviewer_key_exposure')
      ) {
        return previous;
      }
      return [
        ...previous,
        {
          sequence: (previous[previous.length - 1]?.sequence ?? 0) + 1,
          runId,
          type: 'reviewer_key_exposure',
          note: 'Reviewer route exposed every keyed family; all are retained as rehearsal-only across later runs.',
          simulationOnly: true,
          contaminated: true,
        },
      ];
    });
  }, [reviewMode, reviewerExposureReady, runId, setContaminated, setEventLog, setFamilyExposures]);

  const appendEvent = (event: EventInput) => {
    const familyWasPreviouslyExposed = Boolean(
      event.family && (familyExposures[event.family]?.length ?? 0) > 0,
    );
    if (event.family && event.type === 'item_family_presented') {
      if (familyWasPreviouslyExposed) setContaminated(true);
      setFamilyExposures((previous) => {
        const priorRuns = previous[event.family as string] ?? [];
        return { ...previous, [event.family as string]: [...priorRuns, runId] };
      });
    }
    setEventLog((previous) => [
      ...previous,
      {
        ...event,
        sequence: (previous[previous.length - 1]?.sequence ?? 0) + 1,
        runId,
        simulationOnly: true,
        contaminated:
          contaminated ||
          event.type === 'reviewer_key_exposure' ||
          (event.type === 'item_family_presented' && familyWasPreviouslyExposed),
      },
    ]);
  };

  const goToTarget = (target: string) => {
    if (target === 'capstone') {
      appendEvent({
        type: 'invalid_runtime_state_recovered',
        note: 'A stale inline-capstone target was redirected to the lesson map; capstone launches separately.',
      });
      setActiveTarget('map');
      return;
    }
    setActiveTarget(target);
    const kc = KCS.find((candidate) => candidate.id === target);
    if (kc && statuses[kc.id] === 'not_started') {
      setStatuses((previous) => ({ ...previous, [kc.id]: 'in_progress' }));
    }
    appendEvent({
      type: 'navigation_target_opened',
      kcId: kc?.id,
      note: `Opened ${target}.`,
    });
    if (
      !reviewMode &&
      kc &&
      !(kc.number === 5 && statuses['V3-KC-393396'] !== 'simulated_complete')
    ) {
      presentedItemsForScreen(
        kc,
        screens[kc.id] ?? 'entry',
        nearVariants[kc.id] ?? 0,
        changedVariants[kc.id] ?? 0,
        repairSelections[kc.id] ?? '0',
        responses,
      ).forEach((item) => {
        appendEvent({
          type: 'item_family_presented',
          kcId: kc.id,
          itemId: item.id,
          family: item.family,
          note: 'Navigation-level family presentation retained across response-run reset.',
        });
      });
    }
    if (!reviewMode && target === 'extension' && allCore) {
      EXTENSION_ITEMS.forEach((item) => {
        appendEvent({
          type: 'item_family_presented',
          kcId: 'V3-EXT-011872',
          itemId: item.id,
          family: item.family,
          note: 'Extension family presentation retained across response-run reset.',
        });
      });
    }
  };

  const confirmNewRun = () => {
    const nextSequence = runSequence + 1;
    const nextRunId = `review-run-${String(nextSequence).padStart(3, '0')}`;
    const hasRetainedExposure = Object.values(familyExposures).some(
      (exposedRuns) => exposedRuns.length > 0,
    );
    setRunSequence(nextSequence);
    setRunId(nextRunId);
    setActiveTarget('map');
    setScreens({ ...DEFAULT_SCREENS });
    setRoutes({ ...DEFAULT_ROUTES });
    setRouteFeatures({ ...DEFAULT_ROUTE_FEATURES });
    setResponses({});
    setHints({});
    setStatuses({ ...DEFAULT_STATUS });
    setRepairCycles({ ...DEFAULT_ZEROES });
    setRepairSelections({ ...DEFAULT_REPAIR_SELECTIONS });
    setRepairFeatures({ ...DEFAULT_REPAIR_FEATURES });
    setNearVariants({ ...DEFAULT_ZEROES });
    setChangedVariants({ ...DEFAULT_ZEROES });
    setExtensionDone(false);
    setReviewSection('Manifest');
    setContaminated(hasRetainedExposure);
    setResetArmed(false);
    setEventLog((previous) => [
      ...previous,
      {
        sequence: (previous[previous.length - 1]?.sequence ?? 0) + 1,
        runId: nextRunId,
        type: 'confirmed_new_internal_review_run',
        note: `Mutable responses reset under ${STATE_SCHEMA_VERSION}, ${CONTENT_VERSION}, and ${RUN_VERSION}. Family exposure persists; reused families remain rehearsal-only and independent status is not restored.`,
        simulationOnly: true,
        contaminated: hasRetainedExposure,
      },
    ]);
  };

  const activeKc = KCS.find((kc) => kc.id === activeTarget);

  return (
    <div
      className={
        reviewMode ? 'optics-root optics-root--reviewer' : 'optics-root optics-root--learner'
      }
      style={{ color: theme.text.primary }}
    >
      <div
        className={
          reviewMode ? 'optics-shell optics-shell--reviewer' : 'optics-shell optics-shell--learner'
        }
      >
        {reviewMode ? (
          <SideNavigation
            activeTarget={activeTarget}
            statuses={statuses}
            reviewMode={reviewMode}
            goToTarget={goToTarget}
            allCore={allCore}
          />
        ) : null}
        <main className="optics-main">
          <Stack gap={reviewMode ? 16 : 20}>
            {reviewMode ? (
              <Row justify="end">
                <Text size="small" tone="secondary">
                  {`${runId} · ${completed} of 5 simulations`}
                </Text>
              </Row>
            ) : null}
            {reviewMode && (
              <>
                <Callout tone="warning" title="Internal quality-review · simulation only">
                  This Canvas is not a production lesson, evidence runtime, blind solve, or capstone
                  launcher. No interaction may emit or be described as untouched instructional-exit
                  or mastery evidence.
                </Callout>
                <Row gap={8} align="center" wrap>
                  <Text
                    size="small"
                    tone="tertiary"
                  >{`${STATE_SCHEMA_VERSION} · ${CONTENT_VERSION} · ${RUN_VERSION}`}</Text>
                  <Spacer />
                  {!resetArmed ? (
                    <Button variant="ghost" onClick={() => setResetArmed(true)}>
                      New response run
                    </Button>
                  ) : (
                    <>
                      <Text size="small" tone="secondary">
                        Reset responses while retaining every family exposure as rehearsal-only?
                      </Text>
                      <Button variant="primary" onClick={confirmNewRun}>
                        Confirm new run
                      </Button>
                      <Button variant="secondary" onClick={() => setResetArmed(false)}>
                        Cancel
                      </Button>
                    </>
                  )}
                </Row>
                {contaminated && (
                  <Callout tone="warning" title="Run remains contaminated">
                    Reviewer keys or retained family exposure prevent independent status. A new
                    response run clears answers only; it never clears family exposure or
                    contamination.
                  </Callout>
                )}
                <UsageBar
                  total={5}
                  topLeftLabel="Internal core simulation progress"
                  topRightLabel={`${completed}/5 complete`}
                  segments={KCS.filter((kc) => statuses[kc.id] === 'simulated_complete').map(
                    (kc) => ({
                      id: kc.id,
                      value: 1,
                      color: 'blue' as const,
                    }),
                  )}
                />
              </>
            )}
            {!reviewMode &&
              activeKc &&
              !(activeKc.number === 5 && statuses['V3-KC-393396'] !== 'simulated_complete') && (
                <LearnerProgress kc={activeKc} screen={screens[activeKc.id] ?? 'entry'} />
              )}
            {reviewMode ? (
              reviewerExposureReady ? (
                <ReviewerView
                  section={reviewSection}
                  setSection={setReviewSection}
                  eventLog={eventLog}
                  contaminated={contaminated}
                  runId={runId}
                  statuses={statuses}
                  familyExposures={familyExposures}
                />
              ) : (
                <Callout tone="neutral" title="Preparing reviewer surface">
                  Recording keyed-family exposure before reviewer content opens.
                </Callout>
              )
            ) : activeTarget === 'map' ? (
              <LessonMap
                statuses={statuses}
                goToTarget={goToTarget}
                extensionDone={extensionDone}
              />
            ) : activeTarget === 'extension' ? (
              allCore ? (
                <ExtensionView
                  responses={responses}
                  setResponses={setResponses}
                  hints={hints}
                  setHints={setHints}
                  done={extensionDone}
                  setDone={setExtensionDone}
                  familyExposures={familyExposures}
                  runId={runId}
                  reviewerExposedThisRun={reviewerExposedThisRun}
                  onEvent={appendEvent}
                  goToTarget={goToTarget}
                />
              ) : (
                <Callout tone="warning" title="Extension locked">
                  Complete all five topics first.
                </Callout>
              )
            ) : activeKc ? (
              activeKc.number === 5 && statuses['V3-KC-393396'] !== 'simulated_complete' ? (
                <Stack gap={16}>
                  <Text size="small" tone="tertiary">
                    Topic 5 of 5
                  </Text>
                  <H1>Finish the single-lens topic first</H1>
                  <Callout tone="warning" title="Two-lens systems build on Topic 4">
                    Complete the thin-lens final check. Then you’ll see how its image becomes the
                    next lens’s object.
                  </Callout>
                  <Button variant="primary" onClick={() => goToTarget('V3-KC-393396')}>
                    Return to Topic 4
                  </Button>
                </Stack>
              ) : (
                <LearnerKc
                  kc={activeKc}
                  screen={screens[activeKc.id] ?? 'entry'}
                  route={routes[activeKc.id] ?? 'standard'}
                  routeFeature={routeFeatures[activeKc.id] ?? ''}
                  responses={responses}
                  setResponses={setResponses}
                  hints={hints}
                  setHints={setHints}
                  repairCycle={repairCycles[activeKc.id] ?? 0}
                  setRepairCycle={setRepairCycles}
                  nearVariant={nearVariants[activeKc.id] ?? 0}
                  changedVariant={changedVariants[activeKc.id] ?? 0}
                  setNearVariant={setNearVariants}
                  setChangedVariant={setChangedVariants}
                  setScreen={setScreens}
                  setRoute={setRoutes}
                  setRouteFeature={setRouteFeatures}
                  setStatus={setStatuses}
                  repairSelection={repairSelections[activeKc.id] ?? '0'}
                  setRepairSelection={setRepairSelections}
                  repairFeature={repairFeatures[activeKc.id] ?? ''}
                  setRepairFeature={setRepairFeatures}
                  contaminated={contaminated}
                  familyExposures={familyExposures}
                  runId={runId}
                  reviewerExposedThisRun={reviewerExposedThisRun}
                  onEvent={appendEvent}
                  goToTarget={goToTarget}
                />
              )
            ) : (
              <Stack gap={12}>
                <Callout tone="danger" title="Unknown lesson target">
                  This saved page could not be opened. Your answers are still saved.
                </Callout>
                <Button
                  variant="primary"
                  onClick={() => {
                    appendEvent({
                      type: 'invalid_runtime_state_recovered',
                      note: `Recovered unknown target ${activeTarget} to lesson map.`,
                    });
                    setActiveTarget('map');
                  }}
                >
                  Recover to lesson map
                </Button>
              </Stack>
            )}
          </Stack>
        </main>
      </div>
    </div>
  );
}
