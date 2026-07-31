import type { ReasoningOperation } from '@mcat/contracts';

/**
 * L1 (V3-LES-130923) authoring DATA and constants — the identifiers, node/role
 * vocabulary, and the `VECTOR_LESSON_KCS` server-side scoring/feedback authority
 * that the L1 runtime and its protected module still consume directly.
 *
 * The build FUNCTIONS that once turned this data into the four on-disk artifacts
 * (`buildVectorLessonArtifacts` / `validateVectorLessonArtifacts` /
 * `canonicalVectorLessonArtifactJson`) were removed in the Real Lesson Catalog
 * Phase 7: L1's artifacts are now vendored under `content/lessons/v3-les-130923/`
 * like every other lesson, and every `.script` read was repointed at that
 * vendored `lesson-script.json` (proven byte-equal to the old generator output by
 * the validator's rehash rules R3/R5). The content-hash standard now lives in
 * `lesson-validator/canonical.ts`; the structural guarantees the generator's test
 * suite held (G1–G11) are covered by the validator's R1–R15 (see
 * `generator-removal-coverage-proof.md`). This file is therefore inert data with
 * no build logic and no `node:crypto` dependency.
 */

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
