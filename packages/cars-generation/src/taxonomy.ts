/**
 * The CARS construct, encoded from the official AAMC framework.
 *
 * Provenance is tracked per constant because it changes how much the value can be
 * trusted. `[OFFICIAL]` is AAMC-published and treated as a hard constraint;
 * `[INFERENCE]` is derived and may be revised freely. See
 * `docs/research/cars-item-design/01-cars-construct-official.md`.
 */

import { type CarsSkill } from '@mcat/contracts/vocab';

/**
 * Official skill-category weights, as a share of scored items. AAMC states these are
 * "approximated to the nearest 5% and will vary from one test to another" — partly
 * because each form carries unscored field-test items — so a blueprint should treat
 * them as targets with tolerance, not exact counts. [OFFICIAL]
 */
export const SKILL_CATEGORY_WEIGHTS: Readonly<Record<CarsSkill, number>> = {
  FOC: 0.3,
  RWT: 0.3,
  RBT: 0.4,
};

/** Tolerance on the weights above, matching AAMC's own "nearest 5%" language. [OFFICIAL] */
export const SKILL_WEIGHT_TOLERANCE = 0.05;

/**
 * Retrieval scope is the structural discriminator between the three categories, and
 * it is the single most important fact in this file. AAMC: "One key difference is in
 * the scope of the information needed to answer the question." [OFFICIAL]
 *
 * Two items with identical stem wording belong to different skill categories
 * depending only on how far apart the evidence supporting the key sits. A generator
 * must therefore derive the skill tag from the evidence spans used to author the key,
 * never from the stem's phrasing.
 */
export type RetrievalScope =
  /** Key resolves within one sentence or its immediate context. Maps to FOC. */
  | 'immediate'
  /** Key requires integrating components distant from one another in the passage. Maps to RWT. */
  | 'distant'
  /** Key requires combining the passage with new information supplied by the stem. Maps to RBT. */
  | 'beyond';

/** The mapping implied by AAMC's scope language. [OFFICIAL, as a direct reading] */
export const SCOPE_TO_SKILL: Readonly<Record<RetrievalScope, CarsSkill>> = {
  immediate: 'FOC',
  distant: 'RWT',
  beyond: 'RBT',
};

/**
 * The six named sub-skills AAMC publishes across the three categories. This list —
 * not the prep industry's eight or nine "question types" — is the authoritative
 * blueprint layer. [OFFICIAL]
 */
export interface SubSkill {
  readonly id: string;
  readonly skill: CarsSkill;
  readonly title: string;
  /** What the examinee must do, close to AAMC's own wording. */
  readonly demand: string;
}

export const SUB_SKILLS: readonly SubSkill[] = [
  {
    id: 'foc-comprehension',
    skill: 'FOC',
    title: 'Understanding the basic components of the text',
    demand:
      'Recognize what the text says explicitly: the meaning of words and phrases in context, the claims made, and the way a statement functions in its immediate surroundings.',
  },
  {
    id: 'foc-inference',
    skill: 'FOC',
    title: 'Inferring meaning from rhetorical devices, word choice, and text structure',
    demand:
      'Read authorial signals — word choice, figurative language, structural placement — to recover meaning that is conveyed rather than stated, within a local context.',
  },
  {
    id: 'rwt-integration',
    skill: 'RWT',
    title: 'Integrating distant components of the text to infer a conclusion',
    demand:
      'Combine claims, examples, or perspectives that appear in separate parts of the passage to reach a conclusion the passage supports but never states in one place.',
  },
  {
    id: 'rwt-evaluation',
    skill: 'RWT',
    title: 'Assessing the credibility, soundness, and support of claims within the text',
    demand:
      'Judge how well the author supports a claim, identify what the argument assumes, and distinguish the author position from views the author reports or paraphrases.',
  },
  {
    id: 'rbt-application',
    skill: 'RBT',
    title: 'Applying or extrapolating passage ideas to new contexts',
    demand:
      'Carry a principle, relationship, or pattern from the passage into a situation the passage never discusses, judging likeness by analogy rather than surface similarity.',
  },
  {
    id: 'rbt-new-information',
    skill: 'RBT',
    title: 'Assessing the impact of new information on passage claims',
    demand:
      'Given information introduced by the stem, determine how it bears on the passage argument — strengthening it, weakening it, or requiring the least revision to accommodate.',
  },
] as const;

export const SUB_SKILL_IDS = SUB_SKILLS.map((s) => s.id);

export type SubSkillId = (typeof SUB_SKILLS)[number]['id'];

/** Sub-skills belonging to a category. */
export function subSkillsFor(skill: CarsSkill): readonly SubSkill[] {
  return SUB_SKILLS.filter((s) => s.skill === skill);
}

/**
 * The disciplines AAMC names as passage sources: 11 humanities and 12 social
 * sciences, with content split roughly 50/50 between the two. [OFFICIAL]
 *
 * "Studies of diverse cultures" is listed by AAMC under both groupings, so it is
 * recorded once per group rather than deduplicated.
 */
export const HUMANITIES_DISCIPLINES = [
  'architecture',
  'art',
  'dance',
  'ethics',
  'literature',
  'music',
  'philosophy',
  'popular culture',
  'religion',
  'theater',
  'studies of diverse cultures',
] as const;

export const SOCIAL_SCIENCE_DISCIPLINES = [
  'anthropology',
  'archaeology',
  'economics',
  'education',
  'geography',
  'history',
  'linguistics',
  'political science',
  'population health',
  'psychology',
  'sociology',
  'studies of diverse cultures',
] as const;

export type ContentDomain = 'humanities' | 'social-sciences';

export const CONTENT_DOMAIN_WEIGHTS: Readonly<Record<ContentDomain, number>> = {
  humanities: 0.5,
  'social-sciences': 0.5,
};

export function disciplinesFor(domain: ContentDomain): readonly string[] {
  return domain === 'humanities' ? HUMANITIES_DISCIPLINES : SOCIAL_SCIENCE_DISCIPLINES;
}

/**
 * Section-form constraints. [OFFICIAL]
 *
 * Passage word count is stated by AAMC as 500-600 words. The corpus profile in
 * `docs/research/cars-item-design/corpus-structural-profile.json` measures a median
 * of 613 with a maximum of 750 under OCR, which over-counts slightly; the official
 * range is used as the authoring target and the measured range informs the tolerance
 * in `calibration.ts`.
 */
export const FORM_BLUEPRINT = {
  totalItems: 53,
  passageCount: 9,
  itemsPerPassageMin: 5,
  itemsPerPassageMax: 7,
  passageWordsMin: 500,
  passageWordsMax: 600,
  minutes: 90,
  optionsPerItem: 4,
} as const;

/**
 * Registered organisational schemes for a passage. AAMC names the first three as
 * examples, tied to particular disciplines. [OFFICIAL for the first three,
 * [INFERENCE] for the remainder]
 */
export const RHETORICAL_STRUCTURES = [
  'cause-and-effect',
  'chronological',
  'point-and-counterpoint',
  'thesis-and-illustration',
  'problem-and-proposed-solution',
  'concession-and-rebuttal',
] as const;

export type RhetoricalStructure = (typeof RHETORICAL_STRUCTURES)[number];

/**
 * Thesis position within the passage. This is the best-evidenced difficulty lever
 * available and it costs nothing: main-idea items are easiest when the thesis sits in
 * the opening sentences and hardest when it sits mid-text, replicated across SAT and
 * GRE. [PEER — Freedle & Kostin; see 05-difficulty-drivers.md]
 */
export const THESIS_POSITIONS = ['opening', 'mid-text', 'delayed-close', 'distributed'] as const;

export type ThesisPosition = (typeof THESIS_POSITIONS)[number];

/**
 * Ordinal difficulty targets. Deliberately ordinal, not an IRT b-value: the
 * literature ceiling on cold-start difficulty prediction is roughly 18% of variance,
 * and LLM difficulty ratings average Spearman 0.13 on comparable items. Emitting a
 * numeric difficulty would be unearned precision, which
 * `docs/policies/public-claims.md` forbids. [PEER]
 */
export const DIFFICULTY_TARGETS = ['accessible', 'moderate', 'demanding'] as const;

export type DifficultyTarget = (typeof DIFFICULTY_TARGETS)[number];

/**
 * Author tone and purpose vocabularies, both named by AAMC. Recorded so a passage
 * blueprint can specify them and a tone item can be keyed against a declared value
 * rather than a post-hoc guess. [OFFICIAL]
 */
export const AUTHOR_TONES = [
  'authoritative',
  'humorous',
  'satirical',
  'skeptical',
  'sympathetic',
  'detached',
  'admiring',
  'critical',
  'ambivalent',
] as const;

export const AUTHOR_PURPOSES = ['persuade', 'instruct', 'inform', 'entertain'] as const;

export type AuthorTone = (typeof AUTHOR_TONES)[number];
export type AuthorPurpose = (typeof AUTHOR_PURPOSES)[number];
