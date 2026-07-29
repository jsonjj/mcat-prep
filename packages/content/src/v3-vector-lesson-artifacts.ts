import { createHash } from 'node:crypto';
import type { ReasoningOperation } from '@mcat/contracts';

export const TARGET_LESSON_ID = 'V3-LES-130923' as const;
export const TARGET_GROUPING_ID = 'V3-CL-130923' as const;
export const TARGET_ORDERED_KC_IDS = ['V3-KC-866848', 'V3-KC-700208', 'V3-KC-159529'] as const;

export const VECTOR_LESSON_ROUTES = [
  'CONCISE',
  'STANDARD',
  'MISCONCEPTION',
  'PREREQUISITE_SUPPORT',
] as const;

export type VectorLessonRoute = (typeof VECTOR_LESSON_ROUTES)[number];
export type VectorLessonKcId = (typeof TARGET_ORDERED_KC_IDS)[number];
export type VectorLessonChoiceId = 'A' | 'B' | 'C' | 'D';

export const VECTOR_LESSON_NODE_KINDS = [
  'ENTRY_CHECK_BOUNDARY',
  'ORIENTATION',
  'EXPLANATION',
  'MENTAL_MODEL',
  'EXPERT_THINK_ALOUD',
  'WORKED_EXAMPLE',
  'GUIDED_PRACTICE',
  'LIGHT_SUPPORT_PRACTICE',
  'SOLO_PRACTICE',
  'CONTRAST_BOUNDARY',
  'NEAR_EXIT',
  'CHANGED_EXIT',
  'TARGETED_REPAIR',
  'EXACT_REENTRY',
  'RECAP',
  'TRANSITION',
] as const;

export type VectorLessonNodeKind = (typeof VECTOR_LESSON_NODE_KINDS)[number];

export type VectorLessonActivityRole =
  | 'ENTRY_CHECK'
  | 'WORKED_EXAMPLE'
  | 'GUIDED_PRACTICE'
  | 'LIGHT_SUPPORT_PRACTICE'
  | 'SOLO_PRACTICE'
  | 'NEAR_EXIT'
  | 'CHANGED_EXIT'
  | 'REPAIR_CONFIRMATION'
  | 'REHEARSAL_ONLY';

export interface VectorLessonSafeItem {
  readonly item_id: string;
  readonly item_version: string;
  readonly primary_kc_id: VectorLessonKcId;
  readonly activity_role: VectorLessonActivityRole;
  readonly semantic_family_id: string;
  readonly prompt: string;
  readonly choices: readonly {
    readonly id: VectorLessonChoiceId;
    readonly text: string;
  }[];
  readonly learner_operation: string;
  readonly assistance_state: 'A0' | 'A1' | 'A2' | 'A3';
  readonly changed_dimension: string | null;
  readonly feedback_release_point: 'AFTER_COMMITMENT' | 'VISIBLE_WORKED_INSTRUCTION';
  readonly observed_feature_by_choice: Readonly<Partial<Record<VectorLessonChoiceId, string>>>;
  readonly representation_id: string | null;
  /**
   * Classifies the reasoning demand of an already-authored `CHANGED_EXIT`
   * check, read off its existing `learner_operation` prose — never a new
   * authoring decision. `undefined` for every other activity role: only
   * `CHANGED_EXIT` is licensed for BKT, so only it carries this label.
   */
  readonly reasoning_operation?: ReasoningOperation;
}

interface WorkedExample {
  readonly family_id: string;
  readonly cue: string;
  readonly principle: string;
  readonly operation: string;
  readonly intermediate_state: string;
  readonly rejected_alternative: string;
  readonly check: string;
}

export interface VectorLessonKcAuthoring {
  readonly kc_id: VectorLessonKcId;
  readonly slug: 'vectors' | 'trig' | 'direction';
  readonly canonical_ordinal: 1 | 2 | 3;
  readonly display_label: string;
  readonly objective: string;
  readonly scope_in: readonly string[];
  readonly scope_out: readonly string[];
  readonly source_claim_refs: readonly string[];
  readonly repair_relation_ids: readonly string[];
  readonly representation_ids: readonly string[];
  readonly accessibility_equivalent_ids: readonly string[];
  readonly orientation: readonly string[];
  readonly explanation: readonly string[];
  readonly mental_model: readonly string[];
  readonly expert_think_aloud: readonly string[];
  readonly worked_example: WorkedExample;
  readonly contrast: readonly string[];
  readonly near_repair: readonly string[];
  readonly changed_repair: readonly string[];
  readonly recap: readonly string[];
  readonly items: readonly VectorLessonSafeItem[];
}

const choices = (a: string, b: string, c: string, d: string): VectorLessonSafeItem['choices'] => [
  { id: 'A', text: a },
  { id: 'B', text: b },
  { id: 'C', text: c },
  { id: 'D', text: d },
];

const item = (
  kcId: VectorLessonKcId,
  slug: string,
  role: VectorLessonActivityRole,
  prompt: string,
  answerChoices: VectorLessonSafeItem['choices'],
  operation: string,
  assistance: VectorLessonSafeItem['assistance_state'],
  options: {
    readonly suffix?: string;
    readonly changedDimension?: string;
    readonly observed?: Readonly<Partial<Record<VectorLessonChoiceId, string>>>;
    readonly representationId?: string;
    readonly reasoningOperation?: ReasoningOperation;
  } = {},
): VectorLessonSafeItem => {
  const roleSlug = role.toLowerCase().replaceAll('_', '-');
  const suffix = options.suffix ?? '1';
  return {
    item_id: `vtr-${slug}-${roleSlug}-${suffix}`,
    item_version: 'internal-draft-1',
    primary_kc_id: kcId,
    activity_role: role,
    semantic_family_id: `fam-vtr-${slug}-${roleSlug}-${suffix}`,
    prompt,
    choices: answerChoices,
    learner_operation: operation,
    assistance_state: assistance,
    changed_dimension: options.changedDimension ?? null,
    feedback_release_point: 'AFTER_COMMITMENT',
    observed_feature_by_choice: options.observed ?? {},
    representation_id: options.representationId ?? null,
    ...(options.reasoningOperation === undefined
      ? {}
      : { reasoning_operation: options.reasoningOperation }),
  };
};

const VECTOR_ITEMS: readonly VectorLessonSafeItem[] = [
  item(
    'V3-KC-866848',
    'vec',
    'ENTRY_CHECK',
    'An arrow points 3 units east. If east is positive x, what is its signed x-component?',
    choices('+3', '−3', '0', 'Not sure yet'),
    'Translate one familiar direction into a signed component.',
    'A0',
    { observed: { B: 'reversed the stated axis sign', C: 'treated direction as no component' } },
  ),
  item(
    'V3-KC-866848',
    'vec',
    'GUIDED_PRACTICE',
    'Vector A is (4 east, 1 north). Vector B is (2 west, 3 north). What is A + B?',
    choices('(6 east, 4 north)', '(2 east, 4 north)', '(2 east, 2 south)', '(6 east, 2 south)'),
    'Combine matching signed components with structured support.',
    'A2',
    {
      observed: {
        A: 'added magnitudes without preserving the west sign',
        C: 'reversed the north sum',
      },
      representationId: 'rep-vtr-vector-components',
    },
  ),
  item(
    'V3-KC-866848',
    'vec',
    'GUIDED_PRACTICE',
    'Fresh supported check: A = (2, −1) and B = (−5, 4). What is A + B?',
    choices('(7, 3)', '(−3, −5)', '(−3, 3)', '(3, 3)'),
    'Correct an earlier component setup on a different supported family.',
    'A2',
    {
      suffix: 'fresh',
      observed: {
        A: 'subtracted the negative horizontal component',
        B: 'combined unlike signs as if both were negative',
      },
      representationId: 'rep-vtr-vector-components',
    },
  ),
  item(
    'V3-KC-866848',
    'vec',
    'LIGHT_SUPPORT_PRACTICE',
    'Let A = (5, 2) and B = (1, 4). Compute A − B component by component.',
    choices('(6, 6)', '(4, 2)', '(4, −2)', '(−4, 2)'),
    'Subtract matching components while one checklist cue remains.',
    'A1',
    {
      observed: {
        A: 'added rather than subtracted both components',
        B: 'did not subtract the second component',
      },
      representationId: 'rep-vtr-vector-components',
    },
  ),
  item(
    'V3-KC-866848',
    'vec',
    'LIGHT_SUPPORT_PRACTICE',
    'Fresh one-cue check: compute (−4, 6) − (2, −1) component by component.',
    choices('(−2, 5)', '(−6, 7)', '(−6, 5)', '(−2, 7)'),
    'Use a fresh A1 subtraction family before unsupported work.',
    'A1',
    {
      suffix: 'fresh',
      observed: {
        A: 'added the second vector instead of subtracting it',
        C: 'did not preserve the negative second component during subtraction',
      },
      representationId: 'rep-vtr-vector-components',
    },
  ),
  item(
    'V3-KC-866848',
    'vec',
    'SOLO_PRACTICE',
    'Without a checklist, combine A = (−3, 4) and B = (5, −1).',
    choices('(−8, 5)', '(2, 5)', '(−2, 3)', '(2, 3)'),
    'Add two signed component pairs without assistance.',
    'A0',
    {
      observed: {
        A: 'subtracted the second vector instead of adding it',
        B: 'ignored the negative second component',
      },
      representationId: 'rep-vtr-vector-components',
    },
  ),
  item(
    'V3-KC-866848',
    'vec',
    'NEAR_EXIT',
    'A displacement is (6 east, 2 north), followed by (4 west, 5 south). What is the resultant?',
    choices('(10 east, 7 north)', '(2 east, 3 south)', '(2 east, 7 north)', '(10 east, 3 south)'),
    'Resolve a familiar two-step displacement into the resultant components.',
    'A0',
    {
      suffix: 'initial',
      observed: {
        A: 'added unsigned magnitudes',
        C: 'preserved the south component as north',
      },
      representationId: 'rep-vtr-vector-diagram',
    },
  ),
  item(
    'V3-KC-866848',
    'vec',
    'CHANGED_EXIT',
    'The resultant is R = (1, 4) and A = (−2, 1). If A + B = R, what is B?',
    choices('(−3, −3)', '(−1, 5)', '(3, 3)', '(1, 3)'),
    'Reconstruct a missing vector by changing the unknown and direction of inference.',
    'A0',
    {
      suffix: 'initial',
      changedDimension: 'unknown variable and direction of inference',
      observed: {
        A: 'subtracted the resultant from the known vector',
        B: 'added the known vector instead of isolating the missing vector',
      },
      representationId: 'rep-vtr-vector-components',
      reasoningOperation: 'QUANTIFY',
    },
  ),
  item(
    'V3-KC-866848',
    'vec',
    'REPAIR_CONFIRMATION',
    'A component table shows 6 + (−4) = 10. Which correction addresses the first invalid step?',
    choices(
      'Make both magnitudes positive before adding',
      'Change the north component instead',
      'Drop the west component',
      'Keep the west component negative, so 6 + (−4) = 2',
    ),
    'Identify and correct the first observable sign-handling error.',
    'A0',
    {
      suffix: 'near-1',
      observed: {
        A: 'repeated unsigned-magnitude addition',
        B: 'changed an unrelated component instead of the first invalid step',
        C: 'omitted a required component',
      },
    },
  ),
  item(
    'V3-KC-866848',
    'vec',
    'REPAIR_CONFIRMATION',
    'For (−2, 3) + (5, −7), which setup preserves both direction signs?',
    choices('(−2 + 5, 3 + (−7))', '(2 + 5, 3 + 7)', '(−2 − 5, 3 − (−7))', '(−2 + 5, 3 + 7)'),
    'Set up signed component addition on a fresh family.',
    'A0',
    { suffix: 'near-2' },
  ),
  item(
    'V3-KC-866848',
    'vec',
    'NEAR_EXIT',
    'A path goes (7 west, 1 north), then (2 east, 4 south). What is the resultant?',
    choices('(9 west, 5 north)', '(5 east, 3 north)', '(5 west, 3 south)', '(9 west, 3 south)'),
    'Return to the failed near-use function with a fresh displacement family.',
    'A0',
    {
      suffix: 'reentry',
      observed: { A: 'added unsigned magnitudes at exact reentry' },
      representationId: 'rep-vtr-vector-diagram',
    },
  ),
  item(
    'V3-KC-866848',
    'vec',
    'REPAIR_CONFIRMATION',
    'If A + B = R, which operation isolates B?',
    choices('B = A − R', 'B = R − A', 'B = R + A', 'B = −R − A'),
    'Select the operation that isolates the missing vector.',
    'A0',
    { suffix: 'changed-1', changedDimension: 'symbolic relation' },
  ),
  item(
    'V3-KC-866848',
    'vec',
    'REPAIR_CONFIRMATION',
    'If B = R − A, how should the y-components be written when Ry = 3 and Ay = −2?',
    choices('By = −2 − 3', 'By = 3 − 2', 'By = 3 + (−2)', 'By = 3 − (−2)'),
    'Preserve a negative known component while isolating the missing vector.',
    'A0',
    { suffix: 'changed-2', changedDimension: 'nested sign' },
  ),
  item(
    'V3-KC-866848',
    'vec',
    'CHANGED_EXIT',
    'A = (4, −2) and A + B = R = (−1, 3). What is B?',
    choices('(−5, 5)', '(5, −5)', '(3, 1)', '(−3, 1)'),
    'Return to the failed missing-vector function with a fresh family.',
    'A0',
    {
      suffix: 'reentry',
      changedDimension: 'unknown variable and signed representation',
      representationId: 'rep-vtr-vector-components',
      reasoningOperation: 'QUANTIFY',
    },
  ),
];

const TRIG_ITEMS: readonly VectorLessonSafeItem[] = [
  item(
    'V3-KC-700208',
    'trig',
    'ENTRY_CHECK',
    'In a right triangle, which side is always opposite the right angle?',
    choices('The hypotenuse', 'The adjacent leg', 'The opposite leg', 'Not sure yet'),
    'Recognize the stable right-triangle reference side.',
    'A0',
  ),
  item(
    'V3-KC-700208',
    'trig',
    'GUIDED_PRACTICE',
    'Relative to angle θ, the adjacent side is 12 and the hypotenuse is 13. Which ratio gives cos θ?',
    choices('13/12', '5/13', '12/13', '12/5'),
    'Choose the trig ratio from named sides with a structured cue.',
    'A2',
    {
      observed: { A: 'inverted adjacent and hypotenuse', B: 'selected the opposite-side ratio' },
      representationId: 'rep-vtr-right-triangle',
    },
  ),
  item(
    'V3-KC-700208',
    'trig',
    'GUIDED_PRACTICE',
    'Fresh supported check: opposite is 9 and hypotenuse is 15. Which value gives sin θ?',
    choices('15/9', '9/12', '12/15', '3/5'),
    'Choose and simplify a sine ratio on a different supported family.',
    'A2',
    {
      suffix: 'fresh',
      observed: { A: 'inverted opposite and hypotenuse', B: 'used the adjacent side' },
      representationId: 'rep-vtr-right-triangle',
    },
  ),
  item(
    'V3-KC-700208',
    'trig',
    'LIGHT_SUPPORT_PRACTICE',
    'Relative to θ, the opposite side is 8 and the adjacent side is 15. What is tan θ?',
    choices('15/8', '8/15', '8/17', '15/17'),
    'Form tangent with one side-label cue.',
    'A1',
    {
      observed: { A: 'inverted opposite and adjacent', C: 'used the hypotenuse' },
      representationId: 'rep-vtr-right-triangle',
    },
  ),
  item(
    'V3-KC-700208',
    'trig',
    'LIGHT_SUPPORT_PRACTICE',
    'Fresh one-cue check: relative to θ, adjacent is 7 and hypotenuse is 25. What is cos θ?',
    choices('25/7', '24/25', '7/25', '7/24'),
    'Use a fresh A1 ratio-selection family before unsupported work.',
    'A1',
    {
      suffix: 'fresh',
      observed: {
        A: 'inverted adjacent and hypotenuse',
        B: 'used the opposite-side length instead of the named adjacent side',
      },
      representationId: 'rep-vtr-right-triangle',
    },
  ),
  item(
    'V3-KC-700208',
    'trig',
    'SOLO_PRACTICE',
    'A right triangle has opposite:adjacent = 5:12. Which expression and approximate angle match θ?',
    choices(
      'θ = tan⁻¹(12/5) ≈ 23°',
      'θ = sin⁻¹(5/12) ≈ 65°',
      'θ = cos⁻¹(5/12) ≈ 23°',
      'θ = tan⁻¹(5/12) ≈ 23°',
    ),
    'Use an inverse trig relationship without assistance.',
    'A0',
    {
      observed: {
        A: 'inverted the tangent ratio without changing the stated angle',
        B: 'used an inverse function that does not match the given sides',
      },
      representationId: 'rep-vtr-trig-equation',
    },
  ),
  item(
    'V3-KC-700208',
    'trig',
    'NEAR_EXIT',
    'A right triangle has a 30° angle and hypotenuse 10. What is the side opposite 30°?',
    choices('5√3', '5', '10√3', '20'),
    'Use a stated 30° special-angle relationship in a familiar triangle.',
    'A0',
    {
      suffix: 'initial',
      observed: { A: 'used the adjacent 30° relationship for the opposite side' },
      representationId: 'rep-vtr-right-triangle',
    },
  ),
  item(
    'V3-KC-700208',
    'trig',
    'CHANGED_EXIT',
    'A 12-unit support cable makes a 60° angle with level ground. What horizontal span does the cable cover?',
    choices('6√3', '12', '6', '12√3'),
    'Translate a verbal physical setup into an adjacent-over-hypotenuse relationship.',
    'A0',
    {
      suffix: 'initial',
      changedDimension: 'verbal physical context and surface-to-structure translation',
      observed: { A: 'used sine for the horizontal side relative to the stated angle' },
      representationId: 'rep-vtr-right-triangle',
      reasoningOperation: 'QUANTIFY',
    },
  ),
  item(
    'V3-KC-700208',
    'trig',
    'REPAIR_CONFIRMATION',
    'The target side is opposite θ and the known side is the hypotenuse. Which relationship should be set up first?',
    choices(
      'sin θ = opposite/hypotenuse',
      'cos θ = opposite/hypotenuse',
      'tan θ = hypotenuse/opposite',
      'sin θ = adjacent/hypotenuse',
    ),
    'Choose the ratio from the exact known and target sides.',
    'A0',
    { suffix: 'near-1', representationId: 'rep-vtr-trig-equation' },
  ),
  item(
    'V3-KC-700208',
    'trig',
    'REPAIR_CONFIRMATION',
    'For a 45° right triangle, which statement preserves the special-angle relationship?',
    choices(
      'The hypotenuse equals either leg',
      'One leg is twice the other',
      'The legs sum to the hypotenuse',
      'The two legs are equal',
    ),
    'Discriminate the 45° special-angle invariant on a fresh family.',
    'A0',
    { suffix: 'near-2' },
  ),
  item(
    'V3-KC-700208',
    'trig',
    'NEAR_EXIT',
    'A 45° right triangle has hypotenuse 8√2. What is the length of either leg?',
    choices('4', '8√2', '8', '16'),
    'Return to special-angle near use with a fresh family.',
    'A0',
    { suffix: 'reentry', representationId: 'rep-vtr-right-triangle' },
  ),
  item(
    'V3-KC-700208',
    'trig',
    'REPAIR_CONFIRMATION',
    'An angle is measured from the horizontal axis. Which trig function connects the horizontal component to the vector magnitude?',
    choices('sine', 'cosine', 'tangent', 'inverse tangent'),
    'Reconnect the stated angle to the adjacent component.',
    'A0',
    { suffix: 'changed-1', changedDimension: 'vector representation' },
  ),
  item(
    'V3-KC-700208',
    'trig',
    'REPAIR_CONFIRMATION',
    'If cos 60° = adjacent/hypotenuse and the adjacent side is 4, which equation isolates the hypotenuse h?',
    choices('h = 4/cos 60°', 'h = 4·cos 60°', 'h = cos 60°/4', 'h = 4/sin 60°'),
    'Isolate a different unknown after choosing the relationship.',
    'A0',
    { suffix: 'changed-2', changedDimension: 'unknown variable' },
  ),
  item(
    'V3-KC-700208',
    'trig',
    'CHANGED_EXIT',
    'A ramp rises 5 units at a 30° angle to the ground. Using sin 30° = rise/ramp length, what is the ramp length?',
    choices('2.5 units', '5√3 units', '20 units', '10 units'),
    'Return to changed-task use with a different unknown and context.',
    'A0',
    {
      suffix: 'reentry',
      changedDimension: 'unknown variable and physical context',
      representationId: 'rep-vtr-trig-equation',
      reasoningOperation: 'QUANTIFY',
    },
  ),
];

const DIRECTION_ITEMS: readonly VectorLessonSafeItem[] = [
  item(
    'V3-KC-159529',
    'dir',
    'ENTRY_CHECK',
    'On a directional diagram, a dot in a circle (⊙) is like seeing an arrow tip. Which direction does it indicate?',
    choices('Into the page', 'Up the page', 'Not sure yet', 'Out of the page'),
    'Interpret a familiar into/out-of-page symbol.',
    'A0',
    { representationId: 'rep-vtr-directional-diagram' },
  ),
  item(
    'V3-KC-159529',
    'dir',
    'GUIDED_PRACTICE',
    'A straight wire carries current out of the page. At a point north of the wire, which way does the magnetic field point?',
    choices('East', 'West', 'Into the page', 'Out of the page'),
    'Apply the current-to-field hand pattern with a guided hand-placement cue.',
    'A2',
    {
      observed: { A: 'reversed the curl direction around the current' },
      representationId: 'rep-vtr-directional-diagram',
    },
  ),
  item(
    'V3-KC-159529',
    'dir',
    'GUIDED_PRACTICE',
    'Fresh supported check: current points out of the page. Which hand setup correctly represents the current-to-field rule?',
    choices(
      'Thumb into the page; fingers curl clockwise',
      'Fingers point out of the page while the thumb circles',
      'Thumb out of the page; fingers curl counterclockwise',
      'Thumb points north; fingers point east',
    ),
    'Select the correct hand assignment rather than repeating a mirrored field outcome.',
    'A2',
    {
      suffix: 'fresh',
      observed: {
        A: 'reversed the stated current before reading the curl',
        B: 'swapped the thumb and curled-finger roles',
      },
      representationId: 'rep-vtr-directional-diagram',
    },
  ),
  item(
    'V3-KC-159529',
    'dir',
    'LIGHT_SUPPORT_PRACTICE',
    'A positive charge moves east through a magnetic field directed north. What is the magnetic-force direction?',
    choices('Into the page', 'East', 'Out of the page', 'North'),
    'Apply the ordered-direction hand pattern with one checklist cue.',
    'A1',
    {
      observed: { A: 'reversed the positive-output direction' },
      changedDimension: 'bounded force application',
      representationId: 'rep-vtr-directional-diagram',
    },
  ),
  item(
    'V3-KC-159529',
    'dir',
    'LIGHT_SUPPORT_PRACTICE',
    'Fresh one-cue check: a positive charge moves north through a magnetic field directed out of the page. What is the force direction?',
    choices('West', 'Into the page', 'Out of the page', 'East'),
    'Use a fresh A1 ordered-direction family before unsupported work.',
    'A1',
    {
      suffix: 'fresh',
      observed: {
        A: 'reversed the positive-charge force direction',
        B: 'selected an input-axis direction rather than the perpendicular output',
      },
      changedDimension: 'bounded force application',
      representationId: 'rep-vtr-directional-diagram',
    },
  ),
  item(
    'V3-KC-159529',
    'dir',
    'SOLO_PRACTICE',
    'An electric-field arrow points north and a magnetic-field arrow points east. Using the ordered right-hand rule, what is the propagation direction?',
    choices('Into the page', 'Out of the page', 'North', 'East'),
    'Determine a propagation direction without assistance.',
    'A0',
    {
      observed: { B: 'reversed the ordered first-to-second direction' },
      representationId: 'rep-vtr-directional-diagram',
    },
  ),
  item(
    'V3-KC-159529',
    'dir',
    'NEAR_EXIT',
    'A straight wire carries current east. At a point north of the wire, which way does the magnetic field point?',
    choices('Into the page', 'East', 'North', 'Out of the page'),
    'Use the current-to-field right-hand rule on a familiar diagram.',
    'A0',
    {
      suffix: 'initial',
      observed: { A: 'reversed the field direction for the stated current and observation point' },
      representationId: 'rep-vtr-directional-diagram',
    },
  ),
  item(
    'V3-KC-159529',
    'dir',
    'CHANGED_EXIT',
    'A positive charge moves out of the page through a magnetic field directed north. What is the magnetic-force direction?',
    choices('East', 'West', 'Into the page', 'Out of the page'),
    'Transform a three-dimensional force-direction representation.',
    'A0',
    {
      suffix: 'initial',
      changedDimension: '3D representation and force context',
      observed: { A: 'reversed the ordered velocity-to-field output' },
      representationId: 'rep-vtr-directional-diagram',
      reasoningOperation: 'PREDICT',
    },
  ),
  item(
    'V3-KC-159529',
    'dir',
    'REPAIR_CONFIRMATION',
    'For a straight current, what should your thumb follow before you read the curl of your fingers?',
    choices(
      'The field direction',
      'The page normal',
      'The conventional-current direction',
      'The nearest compass direction',
    ),
    'Restore the input-output assignment for the current-to-field rule.',
    'A0',
    { suffix: 'near-1' },
  ),
  item(
    'V3-KC-159529',
    'dir',
    'REPAIR_CONFIRMATION',
    'If the current direction reverses while the observation point stays fixed, what must happen to the field direction there?',
    choices(
      'It reverses',
      'It stays unchanged',
      'It becomes parallel to the wire',
      'It becomes zero',
    ),
    'Check the reversal boundary on a fresh family.',
    'A0',
    { suffix: 'near-2' },
  ),
  item(
    'V3-KC-159529',
    'dir',
    'NEAR_EXIT',
    'A straight wire carries current north. At an observation point out of the page from the wire, which way does the magnetic field point?',
    choices('West', 'North', 'Into the page', 'East'),
    'Return to the current-to-field function with a fresh three-dimensional orientation.',
    'A0',
    { suffix: 'reentry', representationId: 'rep-vtr-directional-diagram' },
  ),
  item(
    'V3-KC-159529',
    'dir',
    'REPAIR_CONFIRMATION',
    'For a positive charge, which ordered setup is used before reading the thumb?',
    choices(
      'Fingers along force, then curl toward velocity',
      'Fingers along velocity, then curl toward the field',
      'Thumb along the field, then curl toward velocity',
      'Reverse the result before using the hand',
    ),
    'Restore the ordered velocity-to-field setup.',
    'A0',
    { suffix: 'changed-1', changedDimension: 'ordered inputs' },
  ),
  item(
    'V3-KC-159529',
    'dir',
    'REPAIR_CONFIRMATION',
    'A negative charge has the same velocity and magnetic field as a positive charge. How is its force direction related?',
    choices(
      'It is unchanged',
      'It is always upward',
      'It is reversed',
      'It is always into the page',
    ),
    'Apply the charge-sign boundary after determining the positive-charge output.',
    'A0',
    { suffix: 'changed-2', changedDimension: 'charge sign' },
  ),
  item(
    'V3-KC-159529',
    'dir',
    'CHANGED_EXIT',
    'A negative charge moves east through a magnetic field directed south. What is the magnetic-force direction?',
    choices('Out of the page', 'Into the page', 'East', 'West'),
    'Return to the changed force-direction function with charge-sign reversal.',
    'A0',
    {
      suffix: 'reentry',
      changedDimension: 'charge sign and field orientation',
      representationId: 'rep-vtr-directional-diagram',
      reasoningOperation: 'PREDICT',
    },
  ),
];

export const VECTOR_LESSON_KCS: readonly VectorLessonKcAuthoring[] = [
  {
    kc_id: 'V3-KC-866848',
    slug: 'vectors',
    canonical_ordinal: 1,
    display_label: 'Resolve and combine vectors',
    objective:
      'Represent vector components and add or subtract vectors geometrically or algebraically.',
    scope_in: ['vector components', 'addition', 'subtraction'],
    scope_out: ['dot products', 'cross products', 'calculus'],
    source_claim_refs: ['BB-SA-0008', 'CP-SA-008', 'V3-SA-AAMC-MATH-P077'],
    repair_relation_ids: ['R14-REM-BB-129', 'R14-REM-CP-156'],
    representation_ids: ['rep-vtr-vector-components', 'rep-vtr-vector-diagram'],
    accessibility_equivalent_ids: ['a11y-vtr-vector-components', 'a11y-vtr-vector-diagram'],
    orientation: [
      'Focus on one job: translate each vector into signed horizontal and vertical parts, then combine matching parts.',
      'This covers components, addition, and subtraction. It does not use dot products, cross products, or calculus.',
      'Because this is the first curriculum lesson, the starting check is only a low-stakes baseline and cannot complete this skill.',
    ],
    explanation: [
      'A vector carries both size and direction. Components describe how much of that vector lies along each chosen axis.',
      'Choose positive axis directions first. East/right and north/up are common positive choices; west/left and south/down then carry negative signs.',
      'For addition, add x with x and y with y. For subtraction, subtract x from x and y from y. Never add bare magnitudes while discarding direction.',
    ],
    mental_model: [
      'Treat each vector as an ordered pair: (horizontal, vertical). The pair is a ledger whose signs preserve direction.',
      'Operation: align like components, apply the stated addition or subtraction, then translate the resulting signs back into directions.',
      'Check: when two signed contributions oppose on one axis, the resultant magnitude cannot exceed the larger input magnitude on that axis.',
    ],
    expert_think_aloud: [
      'Cue: one arrow points west, so its horizontal component must be negative under an east-positive axis.',
      'Principle: vectors combine by matching components, not by adding unsigned lengths.',
      'Operation: write both ordered pairs before calculating. Intermediate state: x terms together; y terms together.',
      'Check: compare each resultant sign with the dominant direction on that axis.',
    ],
    worked_example: {
      family_id: 'fam-vtr-vec-worked-1',
      cue: 'A = (3 east, 4 north) and B = (2 west, 1 north).',
      principle: 'Write west as a negative horizontal component.',
      operation: 'A + B = (3 + (−2), 4 + 1).',
      intermediate_state: 'The horizontal component is 1 east; the vertical component is 5 north.',
      rejected_alternative: '(5 east, 5 north) incorrectly treats west as an unsigned magnitude.',
      check: 'The eastward part becomes smaller because the second vector points west.',
    },
    contrast: [
      'Holding the vectors fixed while changing “A + B” to “A − B” changes the operation on every matching component.',
      'A zero resultant requires cancellation on each axis; equal magnitudes alone are not enough unless their directions oppose on the same axis.',
    ],
    near_repair: [
      'Return to the signed-component ledger. Mark west and south negative before performing any arithmetic.',
      'Correct the first component where an opposite direction was treated as positive, then verify the other axis independently.',
    ],
    changed_repair: [
      'The missing-vector relation changes the direction of inference: from A + B = R, isolate B by subtracting A from R.',
      'Apply R − A separately on both axes, keeping parentheses around negative components.',
    ],
    recap: [
      'Vectors become manageable when direction is preserved as component signs.',
      'You can now combine known vectors and reconstruct a missing vector. Next, right-triangle relationships connect a vector’s magnitude and angle to those components.',
    ],
    items: VECTOR_ITEMS,
  },
  {
    kc_id: 'V3-KC-700208',
    slug: 'trig',
    canonical_ordinal: 2,
    display_label: 'Use basic trigonometry',
    objective:
      'Use sine, cosine, tangent, inverses, stated special-angle values, and 30/45/60-degree right-triangle relationships.',
    scope_in: ['basic and inverse trigonometry', 'stated special-angle relationships'],
    scope_out: ['calculus', 'unlisted trigonometric identities'],
    source_claim_refs: ['BB-SA-0008', 'CP-SA-008', 'V3-SA-AAMC-MATH-P077'],
    repair_relation_ids: ['R14-REM-BB-109', 'R14-REM-CP-129'],
    representation_ids: ['rep-vtr-right-triangle', 'rep-vtr-trig-equation'],
    accessibility_equivalent_ids: ['a11y-vtr-right-triangle', 'a11y-vtr-trig-equation'],
    orientation: [
      'Focus on choosing a right-triangle relationship from the angle, known side, and target side.',
      'This includes sine, cosine, tangent, their inverses, and stated 30°/45°/60° relationships. It excludes calculus and unlisted identities.',
      'The vector component work you just completed provides one point of use, but each trigonometry response remains its own skill evidence.',
    ],
    explanation: [
      'First name sides relative to the chosen acute angle: opposite lies across from it, adjacent touches it without being the hypotenuse, and the hypotenuse lies opposite the right angle.',
      'Use sin = opposite/hypotenuse, cos = adjacent/hypotenuse, and tan = opposite/adjacent.',
      'If the angle is unknown, use the inverse of the ratio you selected. Do not switch ratios merely because the numbers look familiar.',
    ],
    mental_model: [
      'Known side + target side selects the ratio. The chosen angle determines which leg is opposite and which is adjacent.',
      'Operation: label first, choose the ratio second, substitute third, isolate the unknown fourth.',
      'Check: sine and cosine for an acute angle lie between 0 and 1; a side cannot exceed the hypotenuse.',
    ],
    expert_think_aloud: [
      'Cue: the horizontal component touches the angle and the full vector is the hypotenuse.',
      'Principle: adjacent over hypotenuse selects cosine.',
      'Operation: horizontal = magnitude × cos(angle). Intermediate state: preserve units while evaluating the stated special angle.',
      'Check: a component’s magnitude should not exceed the original vector magnitude.',
    ],
    worked_example: {
      family_id: 'fam-vtr-trig-worked-1',
      cue: 'A 3–4–5 right triangle is viewed from the angle opposite the side of length 3.',
      principle: 'Opposite = 3, adjacent = 4, hypotenuse = 5 for this chosen angle.',
      operation: 'sin θ = 3/5, cos θ = 4/5, and tan θ = 3/4.',
      intermediate_state: 'To recover the angle, θ = tan⁻¹(3/4), about 37°.',
      rejected_alternative: 'tan⁻¹(4/3) refers to the other acute angle, not the stated one.',
      check: 'The smaller angle is opposite the shorter leg, so about 37° is plausible.',
    },
    contrast: [
      'When the reference angle changes to the other acute angle, the two legs swap opposite/adjacent roles while the hypotenuse stays fixed.',
      'A changed name or number does not change the required relationship; changing the representation or unknown can.',
    ],
    near_repair: [
      'Relabel the triangle from the stated angle. Circle the known side and underline the target side.',
      'Select the one ratio containing exactly those two side names before substituting values.',
    ],
    changed_repair: [
      'Translate the vector or physical diagram into a right triangle without changing the angle reference.',
      'State whether the target component is adjacent or opposite, then isolate the requested unknown.',
    ],
    recap: [
      'Trig starts with side roles, not memorized number patterns: label, select, substitute, isolate, check.',
      'The same right-triangle model links angles to vector components. Next, directional rules handle perpendicular directions that a flat component calculation alone does not settle.',
    ],
    items: TRIG_ITEMS,
  },
  {
    kc_id: 'V3-KC-159529',
    slug: 'direction',
    canonical_ordinal: 3,
    display_label: 'Apply right-hand rules',
    objective:
      'Determine authorized field, force, or propagation directions using the right-hand rule.',
    scope_in: ['right-hand directional rule'],
    scope_out: ['dot products', 'cross products', 'calculus'],
    source_claim_refs: ['BB-SA-0008', 'CP-SA-008', 'V3-SA-AAMC-MATH-P077', 'CP-SA-015'],
    repair_relation_ids: ['R14-REM-BB-042', 'R14-REM-CP-046'],
    representation_ids: ['rep-vtr-directional-diagram', 'rep-vtr-vector-direction'],
    accessibility_equivalent_ids: ['a11y-vtr-directional-diagram', 'a11y-vtr-vector-direction'],
    orientation: [
      'Focus on assigning the given directions to the correct parts of the right hand, then reading the requested output direction.',
      'This lesson uses directional diagrams for authorized current–field, positive-charge force, and propagation relationships. It does not teach dot products, cross products, or calculus.',
      'Magnetic-force contexts are a bounded application of the same directional procedure; they do not create another required skill.',
    ],
    explanation: [
      'For a straight conventional current, point the right thumb with the current; curled fingers show the magnetic-field direction around the wire.',
      'For an ordered pair such as positive-charge velocity then magnetic field, point fingers along the first direction, curl toward the second, and read the thumb as the positive output.',
      'For electromagnetic propagation, point fingers along the electric field, curl toward the magnetic field, and read the thumb as the propagation direction.',
      'For a negative charge, determine the positive-charge output first and then reverse it. The order of the two input directions matters.',
    ],
    mental_model: [
      'Assign → align → curl → read → apply sign. Each hand part has one job.',
      'Into the page (⊗) is like seeing an arrow tail; out of the page (⊙) is like seeing its tip.',
      'Check: reversing one input reverses the output when all other features stay fixed.',
    ],
    expert_think_aloud: [
      'Cue: the question asks for field around a straight current, so the thumb follows current and curled fingers supply field.',
      'Principle: do not swap that assignment with the ordered-pair force pattern.',
      'Operation: align the hand physically or mentally, then inspect the requested location. Intermediate state: name the page axis before choosing into or out.',
      'Check: reverse the current as a boundary test; the field at the same point must reverse.',
    ],
    worked_example: {
      family_id: 'fam-vtr-dir-worked-1',
      cue: 'A straight wire carries conventional current upward; inspect a point to the right.',
      principle: 'Thumb follows current; fingers curl around the wire.',
      operation: 'With the thumb up, the fingers pass into the page on the wire’s right side.',
      intermediate_state: 'The requested field direction is into the page.',
      rejected_alternative:
        'Out of the page results from reversing the current or inspecting the opposite side.',
      check: 'Reversing the current to downward reverses the field at the same point.',
    },
    contrast: [
      'Changing a positive charge to a negative charge reverses the force output after the hand rule; it does not reverse the hand setup inputs.',
      'Swapping the first and second ordered directions reverses the output, even though the same two arrows remain present.',
    ],
    near_repair: [
      'Name the requested relationship before placing the hand. For current-to-field, thumb = current and curl = field.',
      'Keep the observation point fixed, align the current, and read the curl only at that point.',
    ],
    changed_repair: [
      'For force, assign fingers to positive-charge velocity and curl toward the magnetic field before reading the thumb.',
      'Only after finding the positive-charge output should a negative charge reverse the direction.',
    ],
    recap: [
      'Directional rules are reliable when each given direction is assigned before the hand is moved.',
      'Across the lesson, components preserve signed direction, trig connects direction to magnitude and angle, and the right-hand rule resolves perpendicular direction. You have finished the required instruction only after both fresh exit functions for this KC succeed.',
    ],
    items: DIRECTION_ITEMS,
  },
] as const;

const REGISTRY_BINDING = {
  registry_artifact_id: 'MCAT-V3-AUTHORITATIVE-REGISTRY-2026-07-22-01',
  registry_sha256: '635c39e9c0ebb28a3892399449aa9b74893aae3264924cd739b92b6e370ba26a',
  phase_0_freeze_id: 'MCAT-V3-PHASE0-FRZ-2026-07-22-01',
  canonical_freeze_id: 'MCAT-V3-CANONICAL-FRZ-2026-07-22-01',
  graph_freeze_id: 'MCAT-V3-GRAPH-FRZ-2026-07-22-01',
  sequence_freeze_id: 'MCAT-V3-SEQUENCE-FRZ-2026-07-22-01',
  manifest_schema_id: 'mcat-v3-lessons-public',
  manifest_schema_version: '1',
  manifest_sha256: '1ab18b78f830602401d5673d941346a5d6b31befcee774866a839300df62916d',
  lesson_id: TARGET_LESSON_ID,
  grouping_id: TARGET_GROUPING_ID,
  ordered_kc_ids: [...TARGET_ORDERED_KC_IDS],
  ordered_required_kc_ids: [...TARGET_ORDERED_KC_IDS],
} as const;

const AUTHORS = [
  {
    identity: 'gpt-5.6-sol-max',
    role: 'PRIMARY_AUTHOR_AND_IMPLEMENTER',
    run_id: 'V3-LES-130923-INTERNAL-DRAFT-2026-07-23',
    contribution: 'Original internal-draft lesson content, artifacts, and implementation.',
  },
] as const;

const INPUT_BINDINGS = [
  {
    input_id: 'MCAT-V3-AUTHORITATIVE-REGISTRY-2026-07-22-01',
    version: 'mcat-v3-authoritative-registry-1',
    sha256: REGISTRY_BINDING.registry_sha256,
    kind: 'CURRICULUM_REGISTRY',
    use: 'Identity, scope, order, source anchors, attachments, holds, and placement.',
  },
  {
    input_id: 'MCAT-V3-LEARNER-FACING-LESSONS',
    version: 'mcat-v3-lessons-public-1',
    sha256: REGISTRY_BINDING.manifest_sha256,
    kind: 'GENERATED_MANIFEST',
    use: 'Learner label and convenience placement cross-check only.',
  },
  {
    input_id: 'AAMC-2020-SUPPLIED-CEILING',
    version: '2020-supplied',
    sha256: '324858748d5e7396b4441f659fec94a4b5f590ea87d9de73b3f2f7c56848132d',
    kind: 'SOURCE_CEILING',
    use: 'Scope obligation only; no expressive prose or source question reused.',
  },
] as const;

const internalDraftSchemaHash = (schemaId: string, payloadFields: readonly string[]): string =>
  createHash('sha256')
    .update(
      JSON.stringify({
        schema_id: schemaId,
        schema_version: '0.1-candidate-local-1',
        common_envelope_fields: [
          'artifact_type',
          'artifact_id',
          'artifact_version',
          'artifact_status',
          'schema_binding',
          'content_sha256',
          'registry_binding',
          'authors',
          'reviewers',
          'input_bindings',
          'dependency_bindings',
          'lineage',
          'payload',
        ],
        payload_fields: payloadFields,
        unknown_fields: 'REJECT',
      }),
    )
    .digest('hex');

const SCHEMA_BINDINGS = {
  LESSON_SCRIPT: {
    schema_id: 'mcat-spec04-lesson-script-internal-draft',
    schema_version: '0.1-candidate-local-1',
    schema_sha256: internalDraftSchemaHash('mcat-spec04-lesson-script-internal-draft', [
      'lesson_id',
      'grouping_id',
      'ordered_kc_ids',
      'ordered_required_kc_ids',
      'throughline',
      'scope_and_non_goals',
      'source_ledger_ref',
      'route_policy_ref',
      'nodes',
      'activities',
      'kc_scripts',
      'question_evidence_plan',
      'transitions',
      'attachment_bindings',
      'compilation_contract',
    ]),
    canonicalization_profile: 'INTERNAL_DRAFT_SORTED_JSON_SHA256_V1',
  },
  KC_COVERAGE_MATRIX: {
    schema_id: 'mcat-spec04-kc-coverage-internal-draft',
    schema_version: '0.1-candidate-local-1',
    schema_sha256: internalDraftSchemaHash('mcat-spec04-kc-coverage-internal-draft', [
      'lesson_id',
      'ordered_required_kc_ids',
      'lesson_script_id',
      'lesson_script_sha256',
      'rows',
      'automated_questions',
      'matrix_status',
    ]),
    canonicalization_profile: 'INTERNAL_DRAFT_SORTED_JSON_SHA256_V1',
  },
  LESSON_PRESENTATION_PLAN: {
    schema_id: 'mcat-spec04-presentation-internal-draft',
    schema_version: '0.1-candidate-local-1',
    schema_sha256: internalDraftSchemaHash('mcat-spec04-presentation-internal-draft', [
      'lesson_id',
      'lesson_script_id',
      'lesson_script_sha256',
      'kc_coverage_matrix_id',
      'kc_coverage_matrix_sha256',
      'learner_rhythm',
      'screens',
      'node_to_screen_map',
      'representation_plans',
      'progressive_disclosure_rules',
      'learner_reviewer_separation',
      'responsive_acceptance',
      'accessibility_acceptance',
      'browser_evidence_plan',
      'presentation_status',
    ]),
    canonicalization_profile: 'INTERNAL_DRAFT_SORTED_JSON_SHA256_V1',
  },
  LESSON_QUALITY_REPORT: {
    schema_id: 'mcat-spec04-quality-report-internal-draft',
    schema_version: '0.1-candidate-local-1',
    schema_sha256: internalDraftSchemaHash('mcat-spec04-quality-report-internal-draft', [
      'lesson_id',
      'review_scope',
      'role_assignments',
      'independence_checks',
      'script_gate',
      'presentation_gate',
      'integrated_gate',
      'findings',
      'evidence_refs',
      'claim_limits',
      'open_decisions',
      'final_gate_status',
      'release_eligibility',
    ]),
    canonicalization_profile: 'INTERNAL_DRAFT_SORTED_JSON_SHA256_V1',
  },
} as const;

interface ScriptNode {
  readonly node_id: string;
  readonly node_kind: VectorLessonNodeKind;
  readonly primary_kc_id: VectorLessonKcId;
  readonly secondary_kc_refs: readonly string[];
  readonly route_eligibility: readonly VectorLessonRoute[];
  readonly learner_content_blocks: readonly {
    readonly block_kind: 'PROSE' | 'WORKED_REASONING';
    readonly text: string;
  }[];
  readonly representation_ids: readonly string[];
  readonly activity_ids: readonly string[];
  readonly checkpoint_ref: string;
  readonly source_claim_refs: readonly string[];
}

interface ScriptActivity {
  readonly activity_id: string;
  readonly primary_kc_id: VectorLessonKcId;
  readonly learner_operation: string;
  readonly assistance_available: readonly string[];
  readonly item_binding_ids: readonly string[];
  readonly semantic_family_ids: readonly string[];
  readonly feedback_timing: string;
  readonly response_handling: string;
  readonly authorized_next_node_ids: readonly string[];
}

const nodeId = (kc: VectorLessonKcAuthoring, suffix: string) => `vtr-${kc.slug}-node-${suffix}`;
const activityId = (kc: VectorLessonKcAuthoring, suffix: string) =>
  `vtr-${kc.slug}-activity-${suffix}`;
const checkpointId = (kc: VectorLessonKcAuthoring, suffix: string) =>
  `vtr-${kc.slug}-checkpoint-${suffix}`;

function nodesFor(kc: VectorLessonKcAuthoring): ScriptNode[] {
  const make = (
    suffix: string,
    kind: VectorLessonNodeKind,
    content: readonly string[],
    options: {
      readonly activities?: readonly string[];
      readonly representations?: readonly string[];
    } = {},
  ): ScriptNode => ({
    node_id: nodeId(kc, suffix),
    node_kind: kind,
    primary_kc_id: kc.kc_id,
    secondary_kc_refs: [],
    route_eligibility: [...VECTOR_LESSON_ROUTES],
    learner_content_blocks: content.map((text) => ({
      block_kind: kind === 'WORKED_EXAMPLE' ? 'WORKED_REASONING' : 'PROSE',
      text,
    })),
    representation_ids: [...(options.representations ?? [])],
    activity_ids: [...(options.activities ?? [])],
    checkpoint_ref: checkpointId(kc, suffix),
    source_claim_refs: [...kc.source_claim_refs],
  });

  const itemByRole = (role: VectorLessonActivityRole, suffix?: string) =>
    kc.items.filter(
      (candidate) =>
        candidate.activity_role === role &&
        (suffix === undefined || candidate.item_id.endsWith(suffix)),
    );
  const itemActivities = (items: readonly VectorLessonSafeItem[]) =>
    items.map((candidate) => activityId(kc, candidate.item_id));

  const worked = kc.worked_example;
  return [
    make(
      'entry',
      'ENTRY_CHECK_BOUNDARY',
      [
        'This starting check is low stakes. It cannot complete an exit or choose your lesson route.',
      ],
      { activities: itemActivities(itemByRole('ENTRY_CHECK')) },
    ),
    make('orientation', 'ORIENTATION', kc.orientation, {
      representations: kc.representation_ids,
    }),
    make('explanation', 'EXPLANATION', kc.explanation, {
      representations: kc.representation_ids,
    }),
    make('model', 'MENTAL_MODEL', kc.mental_model, {
      representations: kc.representation_ids,
    }),
    make('think-aloud', 'EXPERT_THINK_ALOUD', kc.expert_think_aloud, {
      representations: kc.representation_ids,
    }),
    make(
      'worked',
      'WORKED_EXAMPLE',
      [
        `Cue: ${worked.cue}`,
        `Principle: ${worked.principle}`,
        `Operation: ${worked.operation}`,
        `Intermediate state: ${worked.intermediate_state}`,
        `Rejected alternative: ${worked.rejected_alternative}`,
        `Check: ${worked.check}`,
      ],
      { activities: [activityId(kc, 'worked')], representations: kc.representation_ids },
    ),
    make(
      'guided',
      'GUIDED_PRACTICE',
      ['Complete one consequential step with structured support. Feedback follows commitment.'],
      { activities: itemActivities(itemByRole('GUIDED_PRACTICE')) },
    ),
    make(
      'light',
      'LIGHT_SUPPORT_PRACTICE',
      ['Use one remaining cue, then commit to the full operation.'],
      { activities: itemActivities(itemByRole('LIGHT_SUPPORT_PRACTICE')) },
    ),
    make('solo', 'SOLO_PRACTICE', ['Now perform the operation without answer-bearing support.'], {
      activities: itemActivities(itemByRole('SOLO_PRACTICE')),
    }),
    make('contrast', 'CONTRAST_BOUNDARY', kc.contrast, {
      representations: kc.representation_ids,
    }),
    make(
      'near-exit',
      'NEAR_EXIT',
      ['Final check, part 1: use the model on a fresh familiar structure without help.'],
      {
        activities: itemActivities(itemByRole('NEAR_EXIT')),
        representations: kc.representation_ids,
      },
    ),
    make(
      'changed-exit',
      'CHANGED_EXIT',
      [
        'Final check, part 2: preserve the same skill while the representation, context, unknown, or inference changes.',
      ],
      {
        activities: itemActivities(itemByRole('CHANGED_EXIT')),
        representations: kc.representation_ids,
      },
    ),
    make('repair-near', 'TARGETED_REPAIR', kc.near_repair, {
      activities: itemActivities(
        itemByRole('REPAIR_CONFIRMATION').filter((candidate) =>
          candidate.item_id.includes('-near-'),
        ),
      ),
      representations: kc.representation_ids,
    }),
    make('repair-changed', 'TARGETED_REPAIR', kc.changed_repair, {
      activities: itemActivities(
        itemByRole('REPAIR_CONFIRMATION').filter((candidate) =>
          candidate.item_id.includes('-changed-'),
        ),
      ),
      representations: kc.representation_ids,
    }),
    make(
      'reentry-near',
      'EXACT_REENTRY',
      ['Return to the exact near-use function with an untouched family.'],
      {
        activities: itemActivities(itemByRole('NEAR_EXIT', 'reentry')),
        representations: kc.representation_ids,
      },
    ),
    make(
      'reentry-changed',
      'EXACT_REENTRY',
      ['Return to the exact changed-task function with an untouched family.'],
      {
        activities: itemActivities(itemByRole('CHANGED_EXIT', 'reentry')),
        representations: kc.representation_ids,
      },
    ),
    make('recap', 'RECAP', kc.recap),
  ];
}

function activitiesFor(kc: VectorLessonKcAuthoring): ScriptActivity[] {
  const authorizedNextNodes = (safeItem: VectorLessonSafeItem): string[] => {
    switch (safeItem.activity_role) {
      case 'ENTRY_CHECK':
        return [nodeId(kc, 'orientation')];
      case 'GUIDED_PRACTICE':
        return [nodeId(kc, 'guided'), nodeId(kc, 'light'), nodeId(kc, 'repair-near')];
      case 'LIGHT_SUPPORT_PRACTICE':
        return safeItem.item_id.endsWith('fresh')
          ? [nodeId(kc, 'solo')]
          : [nodeId(kc, 'solo'), nodeId(kc, 'repair-near')];
      case 'SOLO_PRACTICE':
        return [nodeId(kc, 'contrast')];
      case 'NEAR_EXIT':
        return [nodeId(kc, 'changed-exit'), nodeId(kc, 'repair-near')];
      case 'CHANGED_EXIT':
        return [nodeId(kc, 'recap'), nodeId(kc, 'repair-changed')];
      case 'REPAIR_CONFIRMATION':
        return safeItem.item_id.includes('-changed-')
          ? [nodeId(kc, 'repair-changed'), nodeId(kc, 'reentry-changed')]
          : [nodeId(kc, 'repair-near'), nodeId(kc, 'reentry-near')];
      default:
        return [nodeId(kc, 'guided')];
    }
  };
  const activityForItem = (safeItem: VectorLessonSafeItem): ScriptActivity => ({
    activity_id: activityId(kc, safeItem.item_id),
    primary_kc_id: kc.kc_id,
    learner_operation: safeItem.learner_operation,
    assistance_available: [safeItem.assistance_state],
    item_binding_ids: [safeItem.item_id],
    semantic_family_ids: [safeItem.semantic_family_id],
    feedback_timing: safeItem.feedback_release_point,
    response_handling:
      safeItem.activity_role === 'NEAR_EXIT' || safeItem.activity_role === 'CHANGED_EXIT'
        ? 'PRESERVE_FIRST_ATTEMPT_THEN_EXIT_OR_BOUNDED_EXACT_REPAIR'
        : safeItem.activity_role === 'REPAIR_CONFIRMATION'
          ? 'REPAIR_PROCESS_ONLY_THEN_FRESH_EXACT_REENTRY'
          : 'INSTRUCTION_ONLY_NO_INDEPENDENT_EVIDENCE',
    authorized_next_node_ids: authorizedNextNodes(safeItem),
  });
  return [
    {
      activity_id: activityId(kc, 'worked'),
      primary_kc_id: kc.kc_id,
      learner_operation: 'Follow cue → principle → operation → intermediate state → check.',
      assistance_available: ['A3'],
      item_binding_ids: [],
      semantic_family_ids: [kc.worked_example.family_id],
      feedback_timing: 'VISIBLE_WORKED_INSTRUCTION',
      response_handling: 'INSTRUCTION_ONLY',
      authorized_next_node_ids: [nodeId(kc, 'guided')],
    },
    ...kc.items.map(activityForItem),
  ];
}

function questionPlanFor(kc: VectorLessonKcAuthoring) {
  return kc.items.map((safeItem) => ({
    item_binding_id: safeItem.item_id,
    activity_id: activityId(kc, safeItem.item_id),
    primary_kc_id: kc.kc_id,
    secondary_kc_mappings: [],
    activity_role: safeItem.activity_role,
    semantic_family_id: safeItem.semantic_family_id,
    stimulus_lineage: {
      lineage_id: `lineage:${safeItem.semantic_family_id}`,
      scenario_signature: safeItem.item_id,
      solution_path_signature: safeItem.learner_operation,
      rationale_lineage_isolated: true,
    },
    first_attempt_immutable: true,
    assistance_state: safeItem.assistance_state,
    hint_availability:
      safeItem.assistance_state === 'A2'
        ? 'STRUCTURED_SUPPORT'
        : safeItem.assistance_state === 'A1'
          ? 'ONE_BOUNDED_CUE'
          : 'NONE',
    reveal_availability: 'AFTER_COMMITMENT_ONLY',
    feedback_release_point: safeItem.feedback_release_point,
    omission_behavior: 'RECORD_DISTINCT_OMISSION_AND_PRESERVE_EXPOSURE',
    retry_behavior: 'NO_SAME_ITEM_FIRST_ATTEMPT_REPLACEMENT',
    invalid_item_behavior: 'VOID_SCORE_PRESERVE_EXPOSURE_USE_UNTOUCHED_REPLACEMENT_OR_HANDOFF',
    near_or_changed_function:
      safeItem.activity_role === 'NEAR_EXIT'
        ? 'NEAR_USE'
        : safeItem.activity_role === 'CHANGED_EXIT'
          ? 'CHANGED_TASK'
          : null,
    changed_dimension: safeItem.changed_dimension,
    freshness_rule: 'PRESENTATION_EXPOSES_WHOLE_FAMILY',
    learner_safe_projection: {
      prompt: safeItem.prompt,
      choices: safeItem.choices.map((choice) => ({ ...choice })),
      representation_id: safeItem.representation_id,
    },
    server_answer_authority_ref: `server-only:${safeItem.item_id}:internal-draft-1`,
    server_rationale_authority_ref: `server-only:${safeItem.item_id}:internal-draft-1`,
    publication_eligibility: 'INTERNAL_DRAFT_ONLY',
    // CHANGED_EXIT is the one activity role licensed to move BKT — a
    // changed-context first attempt is `TRANSFER` evidence, never
    // `INSTRUCTIONAL`. NEAR_EXIT stays on the legacy instructional-only
    // label: a near-transfer exit is teaching, not evidence, and licensing it
    // would let restatement count as demonstrated capability.
    ...(safeItem.activity_role === 'CHANGED_EXIT'
      ? {
          candidate_evidence_modes: ['TRANSFER'],
          reasoning_operation: safeItem.reasoning_operation,
        }
      : {
          evidence_eligibility:
            safeItem.activity_role === 'NEAR_EXIT'
              ? 'INSTRUCTIONAL_EXIT_ONLY'
              : 'INSTRUCTION_TELEMETRY_ONLY',
        }),
  }));
}

function commonEnvelope<T extends keyof typeof SCHEMA_BINDINGS>(
  artifactType: T,
  artifactId: string,
) {
  return {
    artifact_type: artifactType,
    artifact_id: artifactId,
    artifact_version: '0.1.0-internal-draft',
    artifact_status: 'DRAFT' as const,
    schema_binding: { ...SCHEMA_BINDINGS[artifactType] },
    content_sha256: '',
    registry_binding: structuredClone(REGISTRY_BINDING),
    authors: structuredClone(AUTHORS),
    reviewers: [],
    input_bindings: structuredClone(INPUT_BINDINGS),
    dependency_bindings: {},
    lineage: {
      supersedes: null,
      change_reason: 'Initial internal-draft implementation for exactly V3-LES-130923.',
      authoring_run_id: 'V3-LES-130923-INTERNAL-DRAFT-2026-07-23',
      derived_input_ids: INPUT_BINDINGS.map((binding) => binding.input_id),
    },
  };
}

function buildScript() {
  const nodes = VECTOR_LESSON_KCS.flatMap(nodesFor);
  const activities = VECTOR_LESSON_KCS.flatMap(activitiesFor);
  const questionEvidencePlan = VECTOR_LESSON_KCS.flatMap(questionPlanFor);

  return {
    ...commonEnvelope('LESSON_SCRIPT', 'V3-LSCR-130923'),
    payload: {
      lesson_id: TARGET_LESSON_ID,
      grouping_id: TARGET_GROUPING_ID,
      ordered_kc_ids: [...TARGET_ORDERED_KC_IDS],
      ordered_required_kc_ids: [...TARGET_ORDERED_KC_IDS],
      throughline:
        'Preserve direction as signed components, connect magnitude and angle with right-triangle relationships, then resolve perpendicular directions with an authorized right-hand rule—while keeping each KC’s exit and repair state separate.',
      scope_and_non_goals: {
        concise_scope:
          'Resolve or combine vectors and use the listed basic trigonometry and right-hand rule at authorized points of use.',
        exclusions: ['vector dot products', 'vector cross products', 'calculus'],
        extension_boundary:
          'V3-EXT-351964 supplies a bounded magnetic-field/Lorentz-force application for V3-KC-159529 and creates no additional required KC or completion credit.',
      },
      source_ledger_ref: {
        ledger_id: 'V3-SOURCE-CROSSWALK-INTERNAL-GENERATED-VIEW',
        version: 'mcat-v3-source-crosswalk-1',
        sha256: 'a87fd1634a5a9e9dd522293ef98db10b783971f02e0bdfbf558b276cc0b9cea3',
        copied_expressive_prose_allowed: false,
        rights_approval_status: 'BLOCKED',
      },
      route_policy_ref: {
        policy_id: 'V3-LES-130923-INTERNAL-PILOT-ROUTE',
        version: 'uncalibrated-internal-pilot-v1',
        production_resolution: 'SERVER_CREATED_STANDARD',
        routes: [...VECTOR_LESSON_ROUTES],
        entry_check_can_select_route: false,
        required_kc_bypass_enabled: false,
      },
      nodes,
      activities,
      kc_scripts: VECTOR_LESSON_KCS.map((kc) => {
        const roleActivities = (role: VectorLessonActivityRole) =>
          kc.items
            .filter((safeItem) => safeItem.activity_role === role)
            .map((safeItem) => activityId(kc, safeItem.item_id));
        const routeCoverage = Object.fromEntries(
          VECTOR_LESSON_ROUTES.map((route) => [
            route,
            nodes.filter((node) => node.primary_kc_id === kc.kc_id).map((node) => node.node_id),
          ]),
        );
        return {
          kc_id: kc.kc_id,
          canonical_ordinal: kc.canonical_ordinal,
          objective_ref: `objective:${kc.kc_id}`,
          scope_in_refs: kc.scope_in.map((_, index) => `scope-in:${kc.kc_id}:${index + 1}`),
          scope_out_refs: kc.scope_out.map((_, index) => `scope-out:${kc.kc_id}:${index + 1}`),
          source_claim_refs: [...kc.source_claim_refs],
          prerequisite_point_refs: [],
          entry_check_boundary_id: nodeId(kc, 'entry'),
          orientation_node_id: nodeId(kc, 'orientation'),
          explanation_node_ids: [nodeId(kc, 'explanation')],
          mental_model_node_ids: [nodeId(kc, 'model')],
          expert_think_aloud_node_ids: [nodeId(kc, 'think-aloud')],
          worked_example_node_ids: [nodeId(kc, 'worked')],
          guided_activity_ids: roleActivities('GUIDED_PRACTICE'),
          light_support_activity_ids: roleActivities('LIGHT_SUPPORT_PRACTICE'),
          solo_activity_ids: roleActivities('SOLO_PRACTICE'),
          contrast_boundary_node_ids: [nodeId(kc, 'contrast')],
          near_exit_binding: {
            node_id: nodeId(kc, 'near-exit'),
            activity_ids: roleActivities('NEAR_EXIT'),
          },
          changed_exit_binding: {
            node_id: nodeId(kc, 'changed-exit'),
            activity_ids: roleActivities('CHANGED_EXIT'),
          },
          misconception_feature_ids: kc.items.flatMap((safeItem) =>
            Object.values(safeItem.observed_feature_by_choice).map(
              (feature) =>
                `observed:${safeItem.item_id}:${createHash('sha256')
                  .update(feature ?? '')
                  .digest('hex')
                  .slice(0, 10)}`,
            ),
          ),
          repair_bindings: [
            {
              failed_function: 'NEAR_USE',
              node_id: nodeId(kc, 'repair-near'),
              confirmation_activity_ids: roleActivities('REPAIR_CONFIRMATION').filter((id) =>
                id.includes('-near-'),
              ),
              registry_repair_template_ids: [...kc.repair_relation_ids],
              registry_template_activation: 'NOT_AN_INITIAL_LEARNER_TASK',
              origin_sequence_relation_id: 'R14-FD-130923',
              finite_internal_pilot_cycles: 2,
              policy_status: 'UNCALIBRATED_INTERNAL_PILOT',
            },
            {
              failed_function: 'CHANGED_TASK',
              node_id: nodeId(kc, 'repair-changed'),
              confirmation_activity_ids: roleActivities('REPAIR_CONFIRMATION').filter((id) =>
                id.includes('-changed-'),
              ),
              registry_repair_template_ids: [...kc.repair_relation_ids],
              registry_template_activation: 'NOT_AN_INITIAL_LEARNER_TASK',
              origin_sequence_relation_id: 'R14-FD-130923',
              finite_internal_pilot_cycles: 2,
              policy_status: 'UNCALIBRATED_INTERNAL_PILOT',
            },
          ],
          exact_reentry_bindings: [
            {
              failed_function: 'NEAR_USE',
              node_id: nodeId(kc, 'reentry-near'),
              checkpoint_id: checkpointId(kc, 'near-exit'),
              fresh_item_id: kc.items.find(
                (safeItem) =>
                  safeItem.activity_role === 'NEAR_EXIT' && safeItem.item_id.endsWith('reentry'),
              )?.item_id,
            },
            {
              failed_function: 'CHANGED_TASK',
              node_id: nodeId(kc, 'reentry-changed'),
              checkpoint_id: checkpointId(kc, 'changed-exit'),
              fresh_item_id: kc.items.find(
                (safeItem) =>
                  safeItem.activity_role === 'CHANGED_EXIT' && safeItem.item_id.endsWith('reentry'),
              )?.item_id,
            },
          ],
          representation_ids: [...kc.representation_ids],
          accessibility_equivalent_ids: [...kc.accessibility_equivalent_ids],
          route_node_coverage: routeCoverage,
          recap_node_id: nodeId(kc, 'recap'),
        };
      }),
      question_evidence_plan: questionEvidencePlan,
      transitions: VECTOR_LESSON_KCS.flatMap((kc, index) => [
        {
          transition_id: `vtr-${kc.slug}-instruction-sequence`,
          from_node_id: nodeId(kc, 'entry'),
          to_node_id: nodeId(kc, 'orientation'),
          predicate: 'ENTRY_COMMITTED_OR_SKIPPED_WITH_EXPOSURE_PRESERVED',
        },
        {
          transition_id: `vtr-${kc.slug}-exit-sequence`,
          from_node_id: nodeId(kc, 'near-exit'),
          to_node_id: nodeId(kc, 'changed-exit'),
          predicate: 'NEAR_USE_FUNCTION_PASSED_UNSUPPORTED',
        },
        {
          transition_id: `vtr-${kc.slug}-handoff`,
          from_node_id: nodeId(kc, 'recap'),
          to_node_id:
            VECTOR_LESSON_KCS[index + 1] === undefined
              ? 'vtr-lesson-delivery-complete'
              : nodeId(VECTOR_LESSON_KCS[index + 1]!, 'entry'),
          predicate: 'KC_INSTRUCTIONAL_EXIT_RECORDED_AND_RECAP_ACKNOWLEDGED',
        },
      ]),
      attachment_bindings: [
        {
          attachment_id: 'V3-EXT-351964',
          attachment_type: 'EXTENSION',
          host_kc_id: 'V3-KC-159529',
          handling: 'BOUNDED_APPLICATION_NO_SEPARATE_CREDIT',
        },
        {
          attachment_id: 'V3-SUP-900001',
          attachment_type: 'SECONDARY_DISPLAY_SUPPORT',
          host_kc_id: 'V3-KC-866848',
          handling: 'OPTIONAL_BELOW_CEILING_ARITHMETIC_SUPPORT_ONLY_NO_KC_BYPASS_NO_CREDIT',
        },
        {
          attachment_id: 'V3-HOLD-110006',
          attachment_type: 'GOVERNANCE_ONLY',
          host_kc_id: 'V3-KC-159529',
          handling: 'INACTIVE_BLOCKS_VALIDATION_AND_PRODUCTION_CLAIMS',
        },
      ],
      compilation_contract: {
        compiler_id: 'V3-LES-130923-TARGET-SPECIFIC-COMPILER',
        compiler_version: 'internal-draft-v1',
        expected_node_count: nodes.length,
        expected_item_count: questionEvidencePlan.length,
        checkpoint_strategy: 'AFTER_EACH_PRESENTED_OR_COMMITTED_SCREEN',
        protected_fields_server_only: true,
        learner_safe_dto_closed: true,
        reviewer_metadata_compiles_out: true,
        timing_model: {
          timing_policy_version: 'v3-les-130923-uncalibrated-segment-hypothesis-v1',
          estimated_core_segment_minutes: null,
          estimated_branch_segment_minutes: null,
          estimated_kc_core_minutes: null,
          estimated_kc_branch_minutes: null,
          estimated_shell_core_minutes: null,
          estimated_shell_branch_minutes: null,
          interpretation: 'VERSIONED_PILOT_HYPOTHESES_NOT_NUMERIC_THRESHOLDS',
        },
      },
    },
  };
}

function buildCoverage(script: ReturnType<typeof buildScript>) {
  const rows = VECTOR_LESSON_KCS.map((kc) => {
    const roleItems = (role: VectorLessonActivityRole) =>
      kc.items.filter((safeItem) => safeItem.activity_role === role);
    const teachingIds = [
      nodeId(kc, 'orientation'),
      nodeId(kc, 'explanation'),
      nodeId(kc, 'think-aloud'),
      nodeId(kc, 'worked'),
    ];
    const modelIds = [nodeId(kc, 'model')];
    const practiceIds = [
      ...roleItems('GUIDED_PRACTICE'),
      ...roleItems('LIGHT_SUPPORT_PRACTICE'),
      ...roleItems('SOLO_PRACTICE'),
    ].map((safeItem) => activityId(kc, safeItem.item_id));
    const exitIds = [nodeId(kc, 'near-exit'), nodeId(kc, 'changed-exit')];
    const repairIds = [nodeId(kc, 'repair-near'), nodeId(kc, 'repair-changed')];
    const routeRecord = {
      teaching_ids: teachingIds,
      model_ids: modelIds,
      practice_ids: practiceIds,
      exit_ids: exitIds,
      repair_ids: repairIds,
      recap_ids: [nodeId(kc, 'recap')],
      coverage_status: 'PASS' as const,
    };
    const prerequisiteSupportRouteRecord = {
      ...structuredClone(routeRecord),
      coverage_status: 'BLOCKED' as const,
      reason: 'NO_CANONICAL_HARD_PREDECESSOR_SCHEMA_NA_STATUS_UNAVAILABLE',
    };
    return {
      kc_id: kc.kc_id,
      canonical_ordinal: kc.canonical_ordinal,
      objective_ref: `objective:${kc.kc_id}`,
      scope_in_refs: kc.scope_in.map((_, index) => `scope-in:${kc.kc_id}:${index + 1}`),
      scope_out_refs: kc.scope_out.map((_, index) => `scope-out:${kc.kc_id}:${index + 1}`),
      source_claim_refs: [...kc.source_claim_refs],
      prerequisite_point_refs: [],
      explanation_node_ids: [nodeId(kc, 'explanation')],
      mental_model_node_ids: [nodeId(kc, 'model')],
      worked_example_node_ids: [nodeId(kc, 'worked')],
      guided_activity_ids: roleItems('GUIDED_PRACTICE').map((safeItem) =>
        activityId(kc, safeItem.item_id),
      ),
      light_support_activity_ids: roleItems('LIGHT_SUPPORT_PRACTICE').map((safeItem) =>
        activityId(kc, safeItem.item_id),
      ),
      solo_activity_ids: roleItems('SOLO_PRACTICE').map((safeItem) =>
        activityId(kc, safeItem.item_id),
      ),
      near_exit_item_ids: roleItems('NEAR_EXIT').map((safeItem) => safeItem.item_id),
      near_exit_family_ids: roleItems('NEAR_EXIT').map((safeItem) => safeItem.semantic_family_id),
      changed_exit_item_ids: roleItems('CHANGED_EXIT').map((safeItem) => safeItem.item_id),
      changed_exit_family_ids: roleItems('CHANGED_EXIT').map(
        (safeItem) => safeItem.semantic_family_id,
      ),
      misconception_feature_ids: kc.items.flatMap((safeItem) =>
        Object.keys(safeItem.observed_feature_by_choice).map(
          (choice) => `observed:${safeItem.item_id}:${choice}`,
        ),
      ),
      repair_node_ids: repairIds,
      repair_family_ids: roleItems('REPAIR_CONFIRMATION').map(
        (safeItem) => safeItem.semantic_family_id,
      ),
      exact_reentry_refs: [
        `reentry:${kc.kc_id}:NEAR_USE:${nodeId(kc, 'reentry-near')}`,
        `reentry:${kc.kc_id}:CHANGED_TASK:${nodeId(kc, 'reentry-changed')}`,
      ],
      representation_ids: [...kc.representation_ids],
      accessibility_equivalent_ids: [...kc.accessibility_equivalent_ids],
      route_coverage: {
        concise: structuredClone(routeRecord),
        standard: structuredClone(routeRecord),
        misconception: structuredClone(routeRecord),
        prerequisite_support: prerequisiteSupportRouteRecord,
      },
      compiled_node_evidence: {
        compiler_id: script.payload.compilation_contract.compiler_id,
        reachable_node_ids: script.payload.nodes
          .filter((node) => node.primary_kc_id === kc.kc_id)
          .map((node) => node.node_id),
        orphan_node_ids: [],
      },
      row_status: 'BLOCKED' as const,
    };
  });

  return {
    ...commonEnvelope('KC_COVERAGE_MATRIX', 'V3-KCOV-130923'),
    dependency_bindings: {
      lesson_script_id: script.artifact_id,
      lesson_script_sha256: script.content_sha256,
    },
    payload: {
      lesson_id: TARGET_LESSON_ID,
      ordered_required_kc_ids: [...TARGET_ORDERED_KC_IDS],
      lesson_script_id: script.artifact_id,
      lesson_script_sha256: script.content_sha256,
      rows,
      automated_questions: [
        {
          check_id: 'VTR-COV-ORDER',
          question: 'Do matrix rows equal ordered_required_kc_ids in exact order?',
          expected: true,
        },
        {
          check_id: 'VTR-COV-FAMILIES',
          question: 'Are all authored semantic families unique and near/changed families separate?',
          expected: true,
        },
        {
          check_id: 'VTR-COV-ROUTES',
          question:
            'Can prerequisite-support coverage be marked applicable without a canonical hard predecessor?',
          expected: false,
          status: 'BLOCKED_SCHEMA_CLARIFICATION_REQUIRED',
        },
      ],
      matrix_status: 'BLOCKED' as const,
    },
  };
}

function progressLabel(kind: VectorLessonNodeKind): string {
  switch (kind) {
    case 'ENTRY_CHECK_BOUNDARY':
      return 'Starting check';
    case 'ORIENTATION':
      return 'Focus now';
    case 'EXPLANATION':
    case 'MENTAL_MODEL':
    case 'EXPERT_THINK_ALOUD':
      return 'Explain';
    case 'WORKED_EXAMPLE':
      return 'Worked example';
    case 'GUIDED_PRACTICE':
      return 'Guided practice';
    case 'LIGHT_SUPPORT_PRACTICE':
      return 'Less help';
    case 'SOLO_PRACTICE':
      return 'On your own';
    case 'CONTRAST_BOUNDARY':
      return 'Compare';
    case 'NEAR_EXIT':
    case 'CHANGED_EXIT':
      return 'Final check';
    case 'TARGETED_REPAIR':
      return 'Review and retry';
    case 'EXACT_REENTRY':
      return 'Fresh check';
    case 'RECAP':
      return 'Recap';
    case 'TRANSITION':
      return 'Continue';
  }
}

function buildPresentation(
  script: ReturnType<typeof buildScript>,
  coverage: ReturnType<typeof buildCoverage>,
) {
  const screens = script.payload.nodes.map((node) => {
    const kc = VECTOR_LESSON_KCS.find((candidate) => candidate.kc_id === node.primary_kc_id)!;
    return {
      screen_id: node.node_id.replace('-node-', '-screen-'),
      screen_kind: node.node_kind,
      script_node_ids: [node.node_id],
      primary_job:
        node.node_kind === 'ENTRY_CHECK_BOUNDARY'
          ? 'Commit a low-stakes baseline response.'
          : node.node_kind === 'TARGETED_REPAIR'
            ? 'Repair the failed operation, then commit a fresh confirmation.'
            : node.node_kind === 'EXACT_REENTRY'
              ? 'Perform the exact failed function without support.'
              : node.activity_ids.length > 0 && node.node_kind !== 'WORKED_EXAMPLE'
                ? 'Perform the current KC operation.'
                : 'Understand one current reasoning move.',
      primary_action:
        node.activity_ids.length > 0 && node.node_kind !== 'WORKED_EXAMPLE'
          ? 'COMMIT_RESPONSE'
          : 'CONTINUE',
      learner_heading: `${progressLabel(node.node_kind)}: ${kc.display_label}`,
      progress_label: progressLabel(node.node_kind),
      important_callout_count: node.node_kind === 'TARGETED_REPAIR' ? 1 : 0,
      collapsed_detail_ids: [],
      representation_ids: [...node.representation_ids],
      focus_target:
        node.activity_ids.length > 0 && node.node_kind !== 'WORKED_EXAMPLE'
          ? 'SCREEN_HEADING_THEN_FEEDBACK_REGION_AFTER_COMMITMENT'
          : 'SCREEN_HEADING',
      keyboard_order:
        node.activity_ids.length > 0 && node.node_kind !== 'WORKED_EXAMPLE'
          ? ['HEADING', 'PROMPT', 'CHOICES', 'PRIMARY_ACTION']
          : ['HEADING', 'CONTENT', 'PRIMARY_ACTION'],
      responsive_behavior:
        'SINGLE_COLUMN_REFLOW_320PX_NO_PRIMARY_HORIZONTAL_SCROLL_200_PERCENT_ZOOM',
      reviewer_only_refs: [],
    };
  });

  const representationPlans = [
    {
      representation_id: 'rep-vtr-vector-components',
      target_kc_id: 'V3-KC-866848',
      script_node_ids: script.payload.nodes
        .filter((node) => node.representation_ids.includes('rep-vtr-vector-components'))
        .map((node) => node.node_id),
      representation_type: 'SIGNED_COMPONENT_LEDGER',
      encoded_information:
        'Horizontal and vertical magnitudes with explicit signs and axis labels.',
      decisive_feature: 'Direction remains encoded by sign while like axes align.',
      learner_operation: 'Translate, add, subtract, or isolate matching components.',
      prose_advantage: 'The ledger makes sign preservation and axis alignment inspectable.',
      signaling_plan: 'Axis labels and signs are always printed; no correct option is highlighted.',
      interaction_warrant:
        'A committed component choice diagnoses the first observable sign or operation divergence.',
      text_nonvisual_equivalent:
        'A semantic ordered-pair statement supplies the same signed inputs and requires the same component operation without stating the result.',
      construct_preservation_judgment:
        'INTERNAL_CANDIDATE_PENDING_INDEPENDENT_ACCESSIBILITY_REVIEW',
      reviewer: null,
      reduced_motion_fallback: 'STATIC_ONLY_NO_MOTION_REQUIRED',
      small_screen_behavior: 'Ordered pairs wrap as text; axes remain adjacent to values.',
    },
    {
      representation_id: 'rep-vtr-vector-diagram',
      target_kc_id: 'V3-KC-866848',
      script_node_ids: script.payload.nodes
        .filter((node) => node.representation_ids.includes('rep-vtr-vector-diagram'))
        .map((node) => node.node_id),
      representation_type: 'TEXTUAL_VECTOR_DIRECTION_STATEMENT',
      encoded_information:
        'Compass direction, magnitude, and signed-axis relation in semantic text.',
      decisive_feature:
        'Opposing arrows create signed rather than unsigned component contributions.',
      learner_operation: 'Translate arrows into signed components before combining.',
      prose_advantage: 'The structured statement exposes direction-to-sign translation.',
      signaling_plan:
        'Every direction and magnitude is explicit; color and position carry no meaning.',
      interaction_warrant: 'No drag interaction; answer selection carries the operation.',
      text_nonvisual_equivalent:
        'Each arrow is stated as a magnitude plus compass direction, requiring the same sign translation and resultant computation.',
      construct_preservation_judgment:
        'INTERNAL_CANDIDATE_PENDING_INDEPENDENT_ACCESSIBILITY_REVIEW',
      reviewer: null,
      reduced_motion_fallback: 'STATIC_TEXT_ONLY',
      small_screen_behavior: 'Direction statements wrap within the content column.',
    },
    {
      representation_id: 'rep-vtr-right-triangle',
      target_kc_id: 'V3-KC-700208',
      script_node_ids: script.payload.nodes
        .filter((node) => node.representation_ids.includes('rep-vtr-right-triangle'))
        .map((node) => node.node_id),
      representation_type: 'TEXTUAL_RIGHT_TRIANGLE_RELATION',
      encoded_information: 'Reference angle and named side roles/lengths in semantic text.',
      decisive_feature:
        'Opposite and adjacent are relative to the selected angle; hypotenuse is stable.',
      learner_operation: 'Choose and apply the ratio containing the known and target sides.',
      prose_advantage:
        'The structured relation keeps side roles explicit without a decorative figure.',
      signaling_plan: 'Labels name givens only; no ratio or answer is highlighted.',
      interaction_warrant: 'Semantic radio response preserves the relationship selection.',
      text_nonvisual_equivalent:
        'The prompt states the reference angle and names each side’s role and length without supplying the ratio or result.',
      construct_preservation_judgment:
        'INTERNAL_CANDIDATE_PENDING_INDEPENDENT_ACCESSIBILITY_REVIEW',
      reviewer: null,
      reduced_motion_fallback: 'STATIC_ONLY_NO_MOTION_REQUIRED',
      small_screen_behavior: 'Side-role statements wrap without horizontal scrolling.',
    },
    {
      representation_id: 'rep-vtr-trig-equation',
      target_kc_id: 'V3-KC-700208',
      script_node_ids: script.payload.nodes
        .filter((node) => node.representation_ids.includes('rep-vtr-trig-equation'))
        .map((node) => node.node_id),
      representation_type: 'SEMANTIC_EQUATION',
      encoded_information: 'Named side ratio and unknown isolation.',
      decisive_feature: 'The equation includes exactly the known and requested quantities.',
      learner_operation: 'Select, substitute, and isolate.',
      prose_advantage: 'The equation preserves intermediate algebraic state.',
      signaling_plan: 'Math is rendered as text with spoken operators; no answer cue.',
      interaction_warrant: 'Answer choice commits the equation or bounded value.',
      text_nonvisual_equivalent: 'Plain-language ratio plus linearized equation text.',
      construct_preservation_judgment:
        'INTERNAL_CANDIDATE_PENDING_INDEPENDENT_ACCESSIBILITY_REVIEW',
      reviewer: null,
      reduced_motion_fallback: 'STATIC_ONLY_NO_MOTION_REQUIRED',
      small_screen_behavior: 'Equation wraps at operators without side scrolling.',
    },
    {
      representation_id: 'rep-vtr-directional-diagram',
      target_kc_id: 'V3-KC-159529',
      script_node_ids: script.payload.nodes
        .filter((node) => node.representation_ids.includes('rep-vtr-directional-diagram'))
        .map((node) => node.node_id),
      representation_type: 'TEXTUAL_3D_DIRECTION_KEY',
      encoded_information: 'Compass axes plus labeled into-page and out-of-page symbols.',
      decisive_feature: 'Ordered perpendicular directions determine the requested output.',
      learner_operation: 'Assign, align, curl, read, and apply charge sign when stated.',
      prose_advantage:
        'The semantic direction key keeps perpendicular axes and page depth explicit.',
      signaling_plan:
        '⊙ and ⊗ always include text labels; no color or position alone carries meaning.',
      interaction_warrant:
        'No inaccessible hand-drag simulation; the same spatial inference is required from labeled directions.',
      text_nonvisual_equivalent:
        'The prompt names all vectors using east/west/north/south/into/out directions and asks for the missing output; it does not narrate the hand result.',
      construct_preservation_judgment:
        'INTERNAL_CANDIDATE_PENDING_INDEPENDENT_ACCESSIBILITY_REVIEW',
      reviewer: null,
      reduced_motion_fallback: 'STATIC_ONLY_NO_MOTION_REQUIRED',
      small_screen_behavior: 'Direction-key entries stack in one semantic column.',
    },
    {
      representation_id: 'rep-vtr-vector-direction',
      target_kc_id: 'V3-KC-159529',
      script_node_ids: script.payload.nodes
        .filter((node) => node.representation_ids.includes('rep-vtr-vector-direction'))
        .map((node) => node.node_id),
      representation_type: 'ORDERED_DIRECTION_LIST',
      encoded_information: 'First input, second input, requested output, and sign condition.',
      decisive_feature: 'Input order and charge sign remain explicit.',
      learner_operation: 'Map each stated direction to its hand-rule role and infer output.',
      prose_advantage:
        'The ordered list prevents role swapping while preserving spatial reasoning.',
      signaling_plan: 'Ordinal labels identify inputs but do not state the output.',
      interaction_warrant: 'Semantic choices require the same output inference.',
      text_nonvisual_equivalent: 'The representation is already semantic text.',
      construct_preservation_judgment:
        'INTERNAL_CANDIDATE_PENDING_INDEPENDENT_ACCESSIBILITY_REVIEW',
      reviewer: null,
      reduced_motion_fallback: 'STATIC_ONLY_NO_MOTION_REQUIRED',
      small_screen_behavior: 'List reflows naturally within 320 px.',
    },
  ];

  return {
    ...commonEnvelope('LESSON_PRESENTATION_PLAN', 'V3-LPPL-130923'),
    dependency_bindings: {
      lesson_script_id: script.artifact_id,
      lesson_script_sha256: script.content_sha256,
      kc_coverage_matrix_id: coverage.artifact_id,
      kc_coverage_matrix_sha256: coverage.content_sha256,
    },
    payload: {
      lesson_id: TARGET_LESSON_ID,
      lesson_script_id: script.artifact_id,
      lesson_script_sha256: script.content_sha256,
      kc_coverage_matrix_id: coverage.artifact_id,
      kc_coverage_matrix_sha256: coverage.content_sha256,
      learner_rhythm: [
        'Starting check',
        'Focus now',
        'Explain',
        'Worked example',
        'Guided practice',
        'Less help',
        'On your own',
        'Final check',
        'Review and exact fresh re-entry when needed',
        'Recap',
        'Completion',
      ],
      screens,
      node_to_screen_map: screens.map((screen) => ({
        node_id: screen.script_node_ids[0]!,
        screen_id: screen.screen_id,
      })),
      representation_plans: representationPlans,
      progressive_disclosure_rules: {
        one_primary_job: true,
        one_primary_action: true,
        optional_detail_collapsed: true,
        required_teaching_never_hidden: true,
        important_callout_maximum: 1,
      },
      learner_reviewer_separation: {
        learner_route_contains_reviewer_controls: false,
        internal_ids_displayed: false,
        hashes_displayed: false,
        route_or_assistance_codes_displayed: false,
        preview_notice_location: 'LESSON_SHELL_ONCE',
      },
      responsive_acceptance: {
        desktop: 'INTERNAL_AUTOMATED_BROWSER_EVIDENCE_CAPTURED',
        width_375: 'NO_PRIMARY_HORIZONTAL_SCROLL_REQUIRED',
        width_320: 'CRITICAL_FIT_REQUIRED',
        zoom_200_percent: 'REFLOW_REQUIRED',
      },
      accessibility_acceptance: {
        semantic_html_first: true,
        keyboard_only: true,
        visible_focus: true,
        focus_moves_to_heading_or_feedback: true,
        wcag_aa_contrast: true,
        reduced_motion: true,
        minimum_pointer_target_css_px: 24,
        diagram_text_equivalents: true,
        independent_human_review_status: 'BLOCKED',
      },
      browser_evidence_plan: [
        'desktop-light-happy-path',
        'desktop-dark-repair-reentry',
        'mobile-375-refresh-resume',
        'mobile-320-critical-fit',
        'keyboard-focus-reduced-motion',
        'zoom-200-no-primary-overflow',
      ],
      presentation_status: 'BLOCKED' as const,
    },
  };
}

function buildQuality(
  script: ReturnType<typeof buildScript>,
  coverage: ReturnType<typeof buildCoverage>,
  presentation: ReturnType<typeof buildPresentation>,
) {
  return {
    ...commonEnvelope('LESSON_QUALITY_REPORT', 'V3-LQRP-130923'),
    dependency_bindings: {
      lesson_script_id: script.artifact_id,
      lesson_script_sha256: script.content_sha256,
      kc_coverage_matrix_id: coverage.artifact_id,
      kc_coverage_matrix_sha256: coverage.content_sha256,
      lesson_presentation_plan_id: presentation.artifact_id,
      lesson_presentation_plan_sha256: presentation.content_sha256,
    },
    payload: {
      lesson_id: TARGET_LESSON_ID,
      review_scope:
        'Internal automated and agent review for one interactive lesson; no independent human approval or production publication.',
      role_assignments: [
        {
          role: 'PRIMARY_AUTHOR_AND_IMPLEMENTER',
          identity: 'gpt-5.6-sol-max',
          independent: false,
          status: 'COMPLETE_INTERNAL_DRAFT',
        },
        ...[
          'CURRICULUM_BINDING_REVIEWER',
          'DOMAIN_FACTUAL_REVIEWER',
          'INSTRUCTIONAL_DESIGN_REVIEWER',
          'QUESTION_EVIDENCE_REVIEWER',
          'NOVICE_CLARITY_REVIEWER',
          'SOURCE_RIGHTS_REVIEWER',
          'INDEPENDENT_BLIND_SOLVER',
          'ACCESSIBILITY_REVIEWER',
          'FINAL_APPROVER',
        ].map((role) => ({
          role,
          identity: null,
          independent: true,
          status: 'BLOCKED_EXTERNAL_HUMAN_REQUIRED',
        })),
      ],
      independence_checks: [
        {
          check: 'PRIMARY_AUTHOR_NOT_FINAL_APPROVER',
          status: 'BLOCKED',
          reason: 'No independent final approver assigned.',
        },
        {
          check: 'QUESTION_AUTHOR_NOT_BLIND_SOLVER',
          status: 'BLOCKED',
          reason: 'No independent keyless blind solver assigned.',
        },
        {
          check: 'PROSE_AUTHOR_NOT_RIGHTS_APPROVER',
          status: 'BLOCKED',
          reason: 'No source-rights approver assigned.',
        },
      ],
      script_gate: {
        gate_status: 'BLOCKED',
        check_results: [
          { check_id: 'SCRIPT-AUTOMATED-STRUCTURE', status: 'PASS' },
          {
            check_id: 'SCRIPT-PREREQUISITE-ROUTE-APPLICABILITY',
            status: 'BLOCKED',
          },
          { check_id: 'SCRIPT-INDEPENDENT-SME', status: 'BLOCKED' },
          { check_id: 'SCRIPT-LEARNING-SCIENCE', status: 'BLOCKED' },
          { check_id: 'SCRIPT-BLIND-SOLVE', status: 'BLOCKED' },
          { check_id: 'SCRIPT-SOURCE-RIGHTS', status: 'BLOCKED' },
        ],
        evidence_refs: ['V3-KCOV-130923'],
        reviewer_identities: [],
        reviewed_dependency_hashes: [script.content_sha256],
      },
      presentation_gate: {
        gate_status: 'BLOCKED',
        check_results: [
          { check_id: 'PRESENTATION-PLAN-STRUCTURE', status: 'PASS' },
          { check_id: 'PRESENTATION-TARGETED-BROWSER-SMOKE', status: 'PASS' },
          {
            check_id: 'PRESENTATION-SPEC04-EXHAUSTIVE-BROWSER-EVIDENCE',
            status: 'BLOCKED',
          },
          { check_id: 'PRESENTATION-HUMAN-ACCESSIBILITY', status: 'BLOCKED' },
        ],
        evidence_refs: [
          'V3-LPPL-130923',
          'tests/browser/evidence/v3-les-130923/browser-report.json#sha256=ca22e8277bc0264e008400d4a29254da3752b5096ceb3c99d63084800735e615',
        ],
        reviewer_identities: [],
        reviewed_dependency_hashes: [presentation.content_sha256],
      },
      integrated_gate: {
        gate_status: 'BLOCKED',
        check_results: [
          { check_id: 'INTEGRATED-TARGETED-RUNTIME', status: 'PASS' },
          {
            check_id: 'INTEGRATED-SPEC04-EXHAUSTIVE-RUNTIME-EVIDENCE',
            status: 'BLOCKED',
          },
          { check_id: 'INTEGRATED-LEARNER-BUNDLE-SCAN', status: 'PASS' },
          { check_id: 'INTEGRATED-BUILD-TYPECHECK-LINT', status: 'PASS' },
          { check_id: 'INTEGRATED-TARGET-FORMAT', status: 'PASS' },
          {
            check_id: 'REPOSITORY-GLOBAL-FORMAT',
            status: 'BLOCKED',
            reason:
              'Repository-wide Prettier check reports 57 unrelated pre-existing files; target lesson files pass focused formatting.',
          },
          { check_id: 'INTEGRATED-PRODUCTION-SCHEMA-PINS', status: 'BLOCKED' },
          { check_id: 'INTEGRATED-PRODUCTION-COMPILER-PIN', status: 'BLOCKED' },
          { check_id: 'INTEGRATED-CALIBRATED-EXIT-POLICY', status: 'BLOCKED' },
        ],
        evidence_refs: [
          'services/lambdas/learner-api/src/vector-lesson-runtime.test.ts',
          'services/lambdas/learner-api/src/vector-lesson-api.test.ts',
          'packages/contracts/src/v3-vector-lesson.test.ts',
          'packages/client-core/src/v3-vector-lesson-http.test.ts',
          'tests/architecture/vector-lesson-ui-contract.test.ts',
          'tools/scanners/vector-lesson-bundle-scan.mjs',
        ],
        reviewer_identities: [],
        reviewed_dependency_hashes: [
          script.content_sha256,
          coverage.content_sha256,
          presentation.content_sha256,
        ],
      },
      findings: [
        {
          finding_id: 'VTR-FINDING-EXTERNAL-REVIEWS',
          severity: 'P1',
          affected_artifact_hash: script.content_sha256,
          affected_path: 'payload.role_assignments',
          reproducible_evidence:
            'Required independent reviewer identities and receipts are absent.',
          required_correction:
            'Complete SME, learning-science, blind-solve, accessibility, rights, and final approval.',
          owner: 'EXTERNAL_HUMAN_REVIEW_OWNERS',
          status: 'OPEN_BLOCKED',
          retest_scope: 'All four exact artifact hashes and learner build.',
        },
        {
          finding_id: 'VTR-FINDING-PRODUCTION-PINS',
          severity: 'P1',
          affected_artifact_hash: presentation.content_sha256,
          affected_path: 'schema_binding',
          reproducible_evidence: 'Spec 04 Appendix H leaves production schema/compiler pins open.',
          required_correction:
            'Pin production schemas, canonicalization, compiler, renderer, DTO, and harness through the named authorities.',
          owner: 'CONTENT_AND_LESSON_PLATFORM_OWNERS',
          status: 'OPEN_BLOCKED',
          retest_scope: 'Artifact validation, compile parity, runtime, and browser evidence.',
        },
        {
          finding_id: 'VTR-FINDING-PREREQUISITE-ROUTE-APPLICABILITY',
          severity: 'P2',
          affected_artifact_hash: coverage.content_sha256,
          affected_path: 'payload.rows[*].route_coverage.prerequisite_support',
          reproducible_evidence:
            'All target KCs have no canonical hard predecessor, while the candidate matrix schema provides no NOT_APPLICABLE route status.',
          required_correction:
            'Schema and policy owners must define the nonapplicable coverage disposition; runtime continues to downgrade attempted support resolutions to STANDARD.',
          owner: 'LESSON_PLATFORM_AND_POLICY_OWNERS',
          status: 'OPEN_BLOCKED',
          retest_scope: 'Coverage schema, route validator, matrix status, and branch simulation.',
        },
      ],
      evidence_refs: [
        'V3-KCOV-130923',
        'tests/browser/evidence/v3-les-130923/browser-report.json#sha256=ca22e8277bc0264e008400d4a29254da3752b5096ceb3c99d63084800735e615',
        'services/lambdas/learner-api/src/vector-lesson-runtime.test.ts',
        'services/lambdas/learner-api/src/vector-lesson-api.test.ts',
        'tools/scanners/vector-lesson-bundle-scan.mjs',
      ],
      claim_limits: {
        learner_validated: false,
        efficacy_established: false,
        mastery_calibrated: false,
        readiness_validated: false,
        production_published: false,
      },
      open_decisions: [
        'Production schema and canonicalization pins',
        'Independent source-rights approval',
        'Independent SME and learning-science review',
        'Independent blind solve and final approval',
        'Calibrated exit, fading, and repair policies',
        'Learner validation and efficacy evaluation',
        'Signed browser and assistive-technology support matrix',
        'Prerequisite-support matrix disposition for KCs with no hard predecessor',
        'Origin-specific canonical repair-template activation at first delivery',
      ],
      final_gate_status: 'BLOCKED' as const,
      release_eligibility: 'INTERNAL_DRAFT_ONLY' as const,
    },
  };
}

type ArtifactWithHash = { content_sha256: string };

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`)
    .join(',')}}`;
}

function contentHash<T extends ArtifactWithHash>(artifact: T): string {
  const { content_sha256: _omitted, ...hashable } = artifact;
  return createHash('sha256').update(canonicalize(hashable), 'utf8').digest('hex');
}

function withHash<T extends ArtifactWithHash>(artifact: T): T {
  return { ...artifact, content_sha256: contentHash(artifact) };
}

export function buildVectorLessonArtifacts() {
  const script = withHash(buildScript());
  const coverage = withHash(buildCoverage(script));
  const presentation = withHash(buildPresentation(script, coverage));
  const quality = withHash(buildQuality(script, coverage, presentation));
  return { script, coverage, presentation, quality };
}

const COMMON_KEYS = [
  'artifact_type',
  'artifact_id',
  'artifact_version',
  'artifact_status',
  'schema_binding',
  'content_sha256',
  'registry_binding',
  'authors',
  'reviewers',
  'input_bindings',
  'dependency_bindings',
  'lineage',
  'payload',
] as const;

const PAYLOAD_KEYS = {
  LESSON_SCRIPT: [
    'lesson_id',
    'grouping_id',
    'ordered_kc_ids',
    'ordered_required_kc_ids',
    'throughline',
    'scope_and_non_goals',
    'source_ledger_ref',
    'route_policy_ref',
    'nodes',
    'activities',
    'kc_scripts',
    'question_evidence_plan',
    'transitions',
    'attachment_bindings',
    'compilation_contract',
  ],
  KC_COVERAGE_MATRIX: [
    'lesson_id',
    'ordered_required_kc_ids',
    'lesson_script_id',
    'lesson_script_sha256',
    'rows',
    'automated_questions',
    'matrix_status',
  ],
  LESSON_PRESENTATION_PLAN: [
    'lesson_id',
    'lesson_script_id',
    'lesson_script_sha256',
    'kc_coverage_matrix_id',
    'kc_coverage_matrix_sha256',
    'learner_rhythm',
    'screens',
    'node_to_screen_map',
    'representation_plans',
    'progressive_disclosure_rules',
    'learner_reviewer_separation',
    'responsive_acceptance',
    'accessibility_acceptance',
    'browser_evidence_plan',
    'presentation_status',
  ],
  LESSON_QUALITY_REPORT: [
    'lesson_id',
    'review_scope',
    'role_assignments',
    'independence_checks',
    'script_gate',
    'presentation_gate',
    'integrated_gate',
    'findings',
    'evidence_refs',
    'claim_limits',
    'open_decisions',
    'final_gate_status',
    'release_eligibility',
  ],
} as const;

const SCRIPT_NODE_KEYS = [
  'node_id',
  'node_kind',
  'primary_kc_id',
  'secondary_kc_refs',
  'route_eligibility',
  'learner_content_blocks',
  'representation_ids',
  'activity_ids',
  'checkpoint_ref',
  'source_claim_refs',
] as const;

const SCRIPT_ACTIVITY_KEYS = [
  'activity_id',
  'primary_kc_id',
  'learner_operation',
  'assistance_available',
  'item_binding_ids',
  'semantic_family_ids',
  'feedback_timing',
  'response_handling',
  'authorized_next_node_ids',
] as const;

/**
 * Keys every question binding carries regardless of activity role.
 *
 * `evidence_eligibility` vs. `candidate_evidence_modes` + `reasoning_operation`
 * is role-conditional, not a fixed field: only `CHANGED_EXIT` is licensed for
 * BKT, so only it carries the pair. See {@link questionBindingKeysFor}.
 */
const QUESTION_BINDING_COMMON_KEYS = [
  'item_binding_id',
  'activity_id',
  'primary_kc_id',
  'secondary_kc_mappings',
  'activity_role',
  'semantic_family_id',
  'stimulus_lineage',
  'first_attempt_immutable',
  'assistance_state',
  'hint_availability',
  'reveal_availability',
  'feedback_release_point',
  'omission_behavior',
  'retry_behavior',
  'invalid_item_behavior',
  'near_or_changed_function',
  'changed_dimension',
  'freshness_rule',
  'learner_safe_projection',
  'server_answer_authority_ref',
  'server_rationale_authority_ref',
  'publication_eligibility',
] as const;

const questionBindingKeysFor = (activityRole: VectorLessonActivityRole): readonly string[] =>
  activityRole === 'CHANGED_EXIT'
    ? [...QUESTION_BINDING_COMMON_KEYS, 'candidate_evidence_modes', 'reasoning_operation']
    : [...QUESTION_BINDING_COMMON_KEYS, 'evidence_eligibility'];

const COVERAGE_ROW_KEYS = [
  'kc_id',
  'canonical_ordinal',
  'objective_ref',
  'scope_in_refs',
  'scope_out_refs',
  'source_claim_refs',
  'prerequisite_point_refs',
  'explanation_node_ids',
  'mental_model_node_ids',
  'worked_example_node_ids',
  'guided_activity_ids',
  'light_support_activity_ids',
  'solo_activity_ids',
  'near_exit_item_ids',
  'near_exit_family_ids',
  'changed_exit_item_ids',
  'changed_exit_family_ids',
  'misconception_feature_ids',
  'repair_node_ids',
  'repair_family_ids',
  'exact_reentry_refs',
  'representation_ids',
  'accessibility_equivalent_ids',
  'route_coverage',
  'compiled_node_evidence',
  'row_status',
] as const;

const PRESENTATION_SCREEN_KEYS = [
  'screen_id',
  'screen_kind',
  'script_node_ids',
  'primary_job',
  'primary_action',
  'learner_heading',
  'progress_label',
  'important_callout_count',
  'collapsed_detail_ids',
  'representation_ids',
  'focus_target',
  'keyboard_order',
  'responsive_behavior',
  'reviewer_only_refs',
] as const;

function exactKeys(value: object, expected: readonly string[]): boolean {
  return Object.keys(value).sort().join('|') === [...expected].sort().join('|');
}

function protectedFieldPaths(value: unknown, path = '$'): string[] {
  if (value === null || typeof value !== 'object') return [];
  if (Array.isArray(value)) {
    return value.flatMap((itemValue, index) => protectedFieldPaths(itemValue, `${path}[${index}]`));
  }
  const forbidden = new Set([
    'correct_choice_id',
    'correct_answer',
    'answer_key',
    'scoring_logic',
    'protected_rationale',
    'rationales',
    'explanations',
  ]);
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) => [
    ...(forbidden.has(key) ? [`${path}.${key}`] : []),
    ...protectedFieldPaths(child, `${path}.${key}`),
  ]);
}

export function validateVectorLessonArtifacts(
  artifacts: ReturnType<typeof buildVectorLessonArtifacts>,
): string[] {
  const issues: string[] = [];
  const artifactList = Object.values(artifacts);
  for (const artifact of artifactList) {
    if (!exactKeys(artifact, COMMON_KEYS)) {
      issues.push(`${artifact.artifact_id}: common envelope is not closed`);
    }
    const expectedPayloadKeys = PAYLOAD_KEYS[artifact.artifact_type];
    if (!exactKeys(artifact.payload, expectedPayloadKeys)) {
      issues.push(`${artifact.artifact_id}: payload is not closed`);
    }
    if (contentHash(artifact) !== artifact.content_sha256) {
      issues.push(`${artifact.artifact_id}: content hash mismatch`);
    }
    if (artifact.registry_binding.lesson_id !== TARGET_LESSON_ID) {
      issues.push(`${artifact.artifact_id}: wrong lesson binding`);
    }
    if (
      JSON.stringify(artifact.registry_binding.ordered_required_kc_ids) !==
      JSON.stringify(TARGET_ORDERED_KC_IDS)
    ) {
      issues.push(`${artifact.artifact_id}: wrong required KC order`);
    }
  }

  const { script, coverage, presentation, quality } = artifacts;
  if (
    coverage.dependency_bindings.lesson_script_sha256 !== script.content_sha256 ||
    presentation.dependency_bindings.lesson_script_sha256 !== script.content_sha256 ||
    presentation.dependency_bindings.kc_coverage_matrix_sha256 !== coverage.content_sha256 ||
    quality.dependency_bindings.lesson_script_sha256 !== script.content_sha256 ||
    quality.dependency_bindings.kc_coverage_matrix_sha256 !== coverage.content_sha256 ||
    quality.dependency_bindings.lesson_presentation_plan_sha256 !== presentation.content_sha256
  ) {
    issues.push('artifact dependency hash graph mismatch');
  }

  if (
    JSON.stringify(coverage.payload.rows.map((row) => row.kc_id)) !==
    JSON.stringify(TARGET_ORDERED_KC_IDS)
  ) {
    issues.push('coverage rows do not equal the canonical required KC order');
  }

  const nodeIds = script.payload.nodes.map((node) => node.node_id);
  if (new Set(nodeIds).size !== nodeIds.length) issues.push('duplicate script node ID');
  for (const node of script.payload.nodes) {
    if (!exactKeys(node, SCRIPT_NODE_KEYS)) {
      issues.push(`${node.node_id}: node record is not closed`);
    }
  }
  const activityIds = script.payload.activities.map((activity) => activity.activity_id);
  if (new Set(activityIds).size !== activityIds.length) issues.push('duplicate activity ID');
  for (const activity of script.payload.activities) {
    if (!exactKeys(activity, SCRIPT_ACTIVITY_KEYS)) {
      issues.push(`${activity.activity_id}: activity record is not closed`);
    }
  }
  const familyIds = script.payload.question_evidence_plan.map(
    (binding) => binding.semantic_family_id,
  );
  if (new Set(familyIds).size !== familyIds.length) issues.push('duplicate semantic family ID');
  for (const binding of script.payload.question_evidence_plan) {
    if (!exactKeys(binding, questionBindingKeysFor(binding.activity_role))) {
      issues.push(`${binding.item_binding_id}: question binding is not closed`);
    }
  }
  for (const row of coverage.payload.rows) {
    if (!exactKeys(row, COVERAGE_ROW_KEYS)) {
      issues.push(`${row.kc_id}: coverage row is not closed`);
    }
  }
  for (const screen of presentation.payload.screens) {
    if (!exactKeys(screen, PRESENTATION_SCREEN_KEYS)) {
      issues.push(`${screen.screen_id}: presentation screen is not closed`);
    }
  }
  if (protectedFieldPaths(script.payload.question_evidence_plan).length > 0) {
    issues.push('learner-safe question plan contains protected fields');
  }
  for (const kc of VECTOR_LESSON_KCS) {
    const kinds = new Set(
      script.payload.nodes
        .filter((node) => node.primary_kc_id === kc.kc_id)
        .map((node) => node.node_kind),
    );
    for (const kind of VECTOR_LESSON_NODE_KINDS.filter((candidate) => candidate !== 'TRANSITION')) {
      if (!kinds.has(kind)) issues.push(`${kc.kc_id}: missing ${kind}`);
    }
    const roleFamilies = (role: VectorLessonActivityRole) =>
      script.payload.question_evidence_plan
        .filter((binding) => binding.primary_kc_id === kc.kc_id && binding.activity_role === role)
        .map((binding) => binding.semantic_family_id);
    if (roleFamilies('NEAR_EXIT').some((family) => roleFamilies('CHANGED_EXIT').includes(family))) {
      issues.push(`${kc.kc_id}: near and changed exit family collision`);
    }
  }
  return issues;
}

export function canonicalVectorLessonArtifactJson(
  artifact: ReturnType<typeof buildVectorLessonArtifacts>[keyof ReturnType<
    typeof buildVectorLessonArtifacts
  >],
): string {
  return `${JSON.stringify(artifact, null, 2)}\n`;
}
