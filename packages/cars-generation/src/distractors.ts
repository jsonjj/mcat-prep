/**
 * Distractor families.
 *
 * PROVENANCE WARNING, because this file is the most likely to be mistaken for
 * authority: the familiar family names below — too-extreme, out-of-scope, opposite,
 * half-right, distortion — are [FOLKLORE]. They come from test-prep pedagogy and have
 * never been validated against response data. No study codes reading-comprehension
 * distractors into these families and relates family membership to selection rates or
 * discrimination.
 *
 * They are kept because they are operationally useful: a generator conditioned to
 * produce one distractor per named family produces more varied and less inert
 * distractors than one told simply to "write three wrong answers". Each family is
 * therefore pinned to the peer-reviewed mechanism it is actually a special case of, so
 * the defensible part is separable from the folklore part.
 *
 * See `docs/research/cars-item-design/04-distractor-design.md`.
 */

/**
 * The peer-reviewed mechanisms. Embretson & Wetzel's falsification/confirmation model
 * is the only published mechanistic account of what a distractor does cognitively: the
 * examinee first falsifies options, then confirms among survivors. A distractor's job
 * is to resist falsification. [PEER]
 */
export type DistractorMechanism =
  /** Survives falsification because it is true of the world but not responsive to the stem. */
  | 'true-but-unresponsive'
  /** Survives because it overstates a relation the passage genuinely asserts weakly. */
  | 'intensity-error'
  /** Survives because it covers part of the required content. */
  | 'partial-coverage'
  /** Survives because it inverts a relation the examinee has not tracked carefully. */
  | 'relation-inversion'
  /** Survives because it imports knowledge the examinee has, which the passage does not license. */
  | 'unlicensed-knowledge'
  /** Survives because it answers a question adjacent to the one asked. */
  | 'question-substitution';

export interface DistractorFamily {
  readonly id: string;
  readonly title: string;
  readonly mechanism: DistractorMechanism;
  /** What the option must do to belong to this family. Used as a generation instruction. */
  readonly construction: string;
  /**
   * Whether the option is explicitly falsifiable from the passage.
   *
   * This matters more than it appears. Ozuru et al. found items were *more* difficult
   * when distractors were explicitly falsifiable, and noted that eliminating
   * improbable options draws on general test-taking skill rather than reading
   * comprehension. Falsifiability is therefore a construct-relevance lever, not merely
   * a difficulty lever: a set made entirely of falsifiable distractors rewards
   * test-wiseness. [PEER]
   */
  readonly falsifiableFromPassage: boolean;
}

export const DISTRACTOR_FAMILIES: readonly DistractorFamily[] = [
  {
    id: 'too-narrow',
    title: 'True but too narrow',
    mechanism: 'partial-coverage',
    construction:
      'State something the passage genuinely supports, but drawn from a single paragraph so it under-covers what the stem asks about.',
    falsifiableFromPassage: false,
  },
  {
    id: 'too-broad',
    title: 'Overreaching generalisation',
    mechanism: 'partial-coverage',
    construction:
      'Generalise beyond what the passage argues, so the option would require evidence the passage never offers.',
    falsifiableFromPassage: false,
  },
  {
    id: 'too-extreme',
    title: 'Correct relation, overstated',
    mechanism: 'intensity-error',
    construction:
      'Take a relation the passage asserts with hedging and restate it absolutely, so only the strength is wrong.',
    falsifiableFromPassage: true,
  },
  {
    id: 'reversal',
    title: 'Inverted relation',
    mechanism: 'relation-inversion',
    construction:
      'Reverse the direction of a causal, temporal, or evaluative relation the passage states, keeping both terms intact.',
    falsifiableFromPassage: true,
  },
  {
    id: 'distortion',
    title: 'Distorted passage claim',
    mechanism: 'intensity-error',
    construction:
      'Reuse the passage vocabulary but attach it to a relation the passage does not assert, so the words are familiar and the proposition is not.',
    falsifiableFromPassage: true,
  },
  {
    id: 'true-but-irrelevant',
    title: 'Supported but unresponsive',
    mechanism: 'true-but-unresponsive',
    construction:
      'State something the passage clearly supports that simply does not answer the stem. This family is the reason a stem must name its target precisely.',
    falsifiableFromPassage: false,
  },
  {
    id: 'outside-knowledge',
    title: 'Plausible on world knowledge',
    mechanism: 'unlicensed-knowledge',
    construction:
      'State something a well-informed reader would believe about the topic that the passage neither states nor implies. This family is the direct test of the no-outside-knowledge rule.',
    falsifiableFromPassage: false,
  },
  {
    id: 'wrong-question',
    title: 'Right answer to a neighbouring question',
    mechanism: 'question-substitution',
    construction:
      'Give the correct answer to a different defensible question about the same passage element.',
    falsifiableFromPassage: false,
  },
  {
    id: 'half-right',
    title: 'Half right, half wrong',
    mechanism: 'partial-coverage',
    construction:
      'Conjoin a supported clause with an unsupported one, so partial reading confirms it.',
    falsifiableFromPassage: true,
  },
  {
    id: 'author-confusion',
    title: 'Reported view mistaken for the author position',
    mechanism: 'question-substitution',
    construction:
      'State a view the passage reports from another party as though the author held it. Requires the passage to contain a reported perspective.',
    falsifiableFromPassage: true,
  },
  {
    id: 'opposite',
    title: 'Contradicts the passage',
    mechanism: 'relation-inversion',
    construction:
      'State the contrary of a passage claim. The weakest family: cheap to falsify and therefore usually inert. Use at most once per item and never twice in a set.',
    falsifiableFromPassage: true,
  },
] as const;

export type DistractorFamilyId = (typeof DISTRACTOR_FAMILIES)[number]['id'];

export function familyById(id: string): DistractorFamily | undefined {
  return DISTRACTOR_FAMILIES.find((f) => f.id === id);
}

/**
 * Expected number of *functional* distractors, from the option-analysis literature.
 * Across four standardized tests the modal count is one; in 480 medical items the mean
 * was 1.82 and only 7.1% of items had four functional distractors. Rodriguez's
 * meta-analysis further shows that reducing four options to three slightly *raises*
 * discrimination, meaning the typical fourth option is mildly harmful. [PEER]
 *
 * CARS is four-option by official rule, so this cannot be acted on by shipping three.
 * It is recorded because it sets the correct expectation: the goal is to make the
 * third distractor non-inert, and to measure inertness once response data exists,
 * rather than to assume four-way plausibility was achieved.
 */
export const EXPECTED_FUNCTIONAL_DISTRACTORS = {
  modal: 1,
  observedMean: 1.82,
  shareOfItemsWithThreeFunctional: 0.071,
} as const;

/**
 * Recommended family assignment per archetype. The three distractors for an item
 * should instantiate three *different* mechanisms, which is the part with mechanistic
 * grounding; the specific family names are the folklore layer.
 *
 * Note the deliberate constraint: at most two of the three distractors should be
 * explicitly falsifiable from the passage. An all-falsifiable set can be solved by
 * elimination alone, which shifts the item off the reading construct. [PEER-derived]
 */
export const MAX_FALSIFIABLE_DISTRACTORS = 2;

export function mechanismsAreDistinct(familyIds: readonly string[]): boolean {
  const mechanisms = new Set<DistractorMechanism>();
  for (const id of familyIds) {
    const family = familyById(id);
    if (!family) return false;
    mechanisms.add(family.mechanism);
  }
  return mechanisms.size === familyIds.length;
}

export function countFalsifiable(familyIds: readonly string[]): number {
  return familyIds.filter((id) => familyById(id)?.falsifiableFromPassage === true).length;
}
