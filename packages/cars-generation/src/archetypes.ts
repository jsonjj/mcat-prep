/**
 * The operational item-archetype layer.
 *
 * IMPORTANT PROVENANCE NOTE: AAMC publishes no archetype names. The familiar
 * eight-name taxonomy circulating as "the AAMC question types" is a prep-publisher
 * invention. Everything in this file is therefore [INFERENCE] — an operational layer
 * built on top of the six [OFFICIAL] sub-skills in `taxonomy.ts`, which remain the
 * authoritative blueprint. Archetypes exist here because a generator needs a concrete
 * task specification; they carry no claim of official status.
 *
 * See `docs/research/cars-item-design/03-item-archetypes.md`.
 */

import { type CarsSkill } from '@mcat/contracts/vocab';
import { type RetrievalScope, type SubSkillId } from './taxonomy';

/**
 * Whether the options complete the stem as sentence fragments or stand as full
 * independent sentences. The corpus profile shows this tracks retrieval scope:
 * comprehension items tend to use short phrase completions with the stem ending in a
 * colon (measured in 43% of items), while items that introduce new information use
 * longer full-sentence options.
 */
export type ChoiceGeometry = 'phrase-completion' | 'full-sentence';

export interface Archetype {
  readonly id: string;
  readonly title: string;
  readonly subSkill: SubSkillId;
  readonly skill: CarsSkill;
  /** The scope that makes this archetype's key resolvable, and thus its skill tag. */
  readonly scope: RetrievalScope;
  /** What the examinee has to do, stated as a cognitive operation. */
  readonly operation: string;
  /**
   * What makes the key defensible under AAMC's "one defensible and demonstrably
   * correct response option" standard. This is the instruction the author (or the
   * generating model) must satisfy, and it is what the adjudication check tests.
   */
  readonly keyRequirement: string;
  /**
   * Abstract stem shapes. These are structural skeletons with slots, not sentences
   * copied from any source. They exist to keep generated stems in a register that
   * matches the format's conventions.
   */
  readonly stemShapes: readonly string[];
  readonly choiceGeometry: ChoiceGeometry;
  /**
   * How many distinct passage locations the key must draw on. Drives the evidence
   * -span requirement and, through it, the skill tag.
   */
  readonly minEvidenceSpans: number;
}

export const ARCHETYPES: readonly Archetype[] = [
  {
    id: 'meaning-in-context',
    title: 'Meaning in context',
    subSkill: 'foc-comprehension',
    skill: 'FOC',
    scope: 'immediate',
    operation:
      'Recover the sense a word or phrase carries in this passage, as against its ordinary or dictionary sense.',
    keyRequirement:
      'The key must be the sense the surrounding sentences force. At least one distractor should be the common dictionary sense that the context rules out.',
    stemShapes: [
      'The word "{term}" ({location}) most nearly means:',
      'By "{phrase}" ({location}), the author most likely means:',
      'As used in the passage, "{term}" refers to:',
    ],
    choiceGeometry: 'phrase-completion',
    minEvidenceSpans: 1,
  },
  {
    id: 'explicit-claim',
    title: 'Explicit claim retrieval',
    subSkill: 'foc-comprehension',
    skill: 'FOC',
    scope: 'immediate',
    operation: 'Locate what the passage states and distinguish it from what it merely suggests.',
    keyRequirement:
      'The key must be supportable by quoting a single span. Distractors must be locally plausible but contradicted or unaddressed by that span.',
    stemShapes: [
      'According to the passage, {subject}:',
      'The author claims that {subject}:',
      'The passage states that {subject}:',
    ],
    choiceGeometry: 'phrase-completion',
    minEvidenceSpans: 1,
  },
  {
    id: 'rhetorical-function',
    title: 'Function of a passage element',
    subSkill: 'foc-inference',
    skill: 'FOC',
    scope: 'immediate',
    operation:
      'Identify the job a specific element does in the argument, as distinct from what it says.',
    keyRequirement:
      'The key must name the element\'s argumentative role. Distractors should name roles the element does not play, including roles other elements genuinely do play.',
    stemShapes: [
      'The author mentions {element} ({location}) most likely in order to:',
      'The reference to {element} ({location}) serves primarily to:',
      'The discussion of {element} functions in the passage as:',
    ],
    choiceGeometry: 'phrase-completion',
    minEvidenceSpans: 1,
  },
  {
    id: 'author-attitude',
    title: "Author's attitude or tone",
    subSkill: 'foc-inference',
    skill: 'FOC',
    scope: 'immediate',
    operation: 'Read evaluative stance from word choice and framing rather than explicit statement.',
    keyRequirement:
      'The key must match the tone declared in the passage blueprint, and be recoverable from specific evaluative language. Distractors should vary the stance on direction and on intensity, since a tone item that varies only direction is trivially halved.',
    stemShapes: [
      "The author's attitude toward {subject} is best described as:",
      'The author regards {subject} with:',
      'In discussing {subject}, the author is most nearly:',
    ],
    choiceGeometry: 'phrase-completion',
    minEvidenceSpans: 1,
  },
  {
    id: 'central-thesis',
    title: 'Central thesis',
    subSkill: 'rwt-integration',
    skill: 'RWT',
    scope: 'distant',
    operation: 'Identify the claim the whole passage exists to support.',
    keyRequirement:
      'The key must cover the passage argument without exceeding it. The characteristic distractor pair is one true-but-too-narrow option drawn from a single paragraph and one too-broad option that outruns what the passage argues.',
    stemShapes: [
      'The main idea of the passage is that:',
      'The central thesis of the passage is that:',
      'The passage as a whole is primarily concerned with:',
    ],
    choiceGeometry: 'full-sentence',
    minEvidenceSpans: 3,
  },
  {
    id: 'integrative-inference',
    title: 'Integrative inference',
    subSkill: 'rwt-integration',
    skill: 'RWT',
    scope: 'distant',
    operation:
      'Combine claims stated in separate parts of the passage into a conclusion stated in none of them.',
    keyRequirement:
      'The key must follow from at least two spans that are not adjacent, and must not be stated verbatim anywhere. If it can be supported from one span the item is a Foundations item mislabelled.',
    stemShapes: [
      'The passage implies that {subject}:',
      'Based on the passage, one would most reasonably conclude that {subject}:',
      'The passage suggests that {subject}:',
    ],
    choiceGeometry: 'full-sentence',
    minEvidenceSpans: 2,
  },
  {
    id: 'implicit-assumption',
    title: 'Implicit assumption',
    subSkill: 'rwt-evaluation',
    skill: 'RWT',
    scope: 'distant',
    operation: 'Identify an unstated premise the argument requires in order to work.',
    keyRequirement:
      'The key must be a proposition whose denial breaks the inference the author draws. Test it that way: negate the candidate and confirm the argument fails.',
    stemShapes: [
      'The author\'s argument about {subject} depends on the assumption that:',
      'In arguing that {claim}, the author assumes:',
      'Which of the following does the author take for granted?',
    ],
    choiceGeometry: 'full-sentence',
    minEvidenceSpans: 2,
  },
  {
    id: 'perspective-attribution',
    title: 'Attributing a reported perspective',
    subSkill: 'rwt-evaluation',
    skill: 'RWT',
    scope: 'distant',
    operation:
      'Separate the author position from a view the author reports, summarises, or paraphrases.',
    keyRequirement:
      'The key must state the view held by the named party, not the author. The strongest distractor is the author position itself, which is why the passage must contain at least one reported perspective the author does not share.',
    stemShapes: [
      'The passage suggests that {party} believed that:',
      'According to the passage, {party} would most likely hold that:',
      '{party} is presented in the passage as maintaining that:',
    ],
    choiceGeometry: 'full-sentence',
    minEvidenceSpans: 2,
  },
  {
    id: 'principle-application',
    title: 'Applying a passage principle to a new case',
    subSkill: 'rbt-application',
    skill: 'RBT',
    scope: 'beyond',
    operation:
      'Carry a relationship from the passage into a situation the passage never mentions, judging likeness by analogy rather than by surface features.',
    keyRequirement:
      'The key must instantiate the same underlying relation as the passage principle while sharing no surface subject matter with it. A distractor that shares the passage topic but not the relation is the intended trap and should be present.',
    stemShapes: [
      'Which of the following situations is most analogous to {passageRelation}?',
      'The principle the author applies to {subject} would, if extended, best support:',
      "Based on the author's reasoning, which case would most likely be judged {predicate}?",
    ],
    choiceGeometry: 'full-sentence',
    minEvidenceSpans: 2,
  },
  {
    id: 'new-information-effect',
    title: 'Effect of new information',
    subSkill: 'rbt-new-information',
    skill: 'RBT',
    scope: 'beyond',
    operation:
      'Judge how information supplied by the stem bears on a passage claim: strengthening, weakening, or demanding the least revision.',
    keyRequirement:
      'The key must bear on the specific claim named in the stem, not on the topic generally. Every option must be information genuinely absent from the passage, otherwise the item collapses into a retrieval item.',
    stemShapes: [
      "Which of the following, if true, would most weaken the author's claim that {claim}?",
      "Which of the following, if true, would most strengthen the author's central argument?",
      'Suppose {newFact}. This finding would most directly:',
      'Which of the following, if added to the passage, would require the least change in the author\'s argument?',
    ],
    choiceGeometry: 'full-sentence',
    minEvidenceSpans: 1,
  },
] as const;

export type ArchetypeId = (typeof ARCHETYPES)[number]['id'];

export function archetypeById(id: string): Archetype | undefined {
  return ARCHETYPES.find((a) => a.id === id);
}

export function archetypesForSkill(skill: CarsSkill): readonly Archetype[] {
  return ARCHETYPES.filter((a) => a.skill === skill);
}

/**
 * Shannon entropy of an archetype mix, normalised to [0,1] against a uniform mix over
 * the archetypes actually present. Used as a batch-level diversity gate: a generator
 * left unguided collapses onto two or three archetypes.
 */
export function archetypeDiversity(ids: readonly string[]): number {
  if (ids.length === 0) return 0;
  const counts = new Map<string, number>();
  for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
  if (counts.size <= 1) return 0;
  let entropy = 0;
  for (const n of counts.values()) {
    const p = n / ids.length;
    entropy -= p * Math.log2(p);
  }
  return entropy / Math.log2(counts.size);
}
