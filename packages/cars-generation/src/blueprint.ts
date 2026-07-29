/**
 * Passage blueprints and item models — the structural artefacts that generation runs
 * from.
 *
 * WHY THE ARCHITECTURE IS SHAPED THIS WAY. The strongest published result in the
 * item-generation literature is not about prompting: it is that moving human review
 * *upstream to a reusable template* produces items that blinded expert panels cannot
 * distinguish from committee-written ones (42% detection, worse than chance), and that
 * a hybrid pipeline where a human approves the template before generation reached
 * 96.2% expert-key agreement — the best numbers anywhere in the review. Free-form
 * generation, by contrast, has a stable 25-40% defect rate.
 *
 * So the unit of human approval here is the blueprint, not the item. A reviewed
 * blueprint is also what creates item *families*, which the calibration literature
 * rates the highest-value cold-start route and which free-form generation throws away.
 *
 * A blueprint contains no prose. It is a specification: what the passage must argue,
 * where the thesis sits, which archetype each item instantiates, and what class of
 * error each distractor must embody. Source material is abstracted into blueprints by a
 * human; the source prose never enters a prompt.
 */

import { z } from 'zod';
import { CarsSkillSchema } from '@mcat/contracts/vocab';
import { ARCHETYPES } from './archetypes';
import { DISTRACTOR_FAMILIES } from './distractors';
import {
  AUTHOR_PURPOSES,
  AUTHOR_TONES,
  DIFFICULTY_TARGETS,
  RHETORICAL_STRUCTURES,
  THESIS_POSITIONS,
} from './taxonomy';

const archetypeIds = ARCHETYPES.map((a) => a.id) as [string, ...string[]];
const familyIds = DISTRACTOR_FAMILIES.map((f) => f.id) as [string, ...string[]];

/**
 * A perspective the passage reports without endorsing. At least one is required,
 * because several archetypes are unbuildable without it: perspective-attribution has
 * no key, and the `author-confusion` distractor family has nothing to draw on. This is
 * the most common structural reason a generated passage cannot support a full item set.
 */
export const ReportedPerspectiveSchema = z.object({
  /** How the passage refers to the holder of the view. */
  party: z.string().min(2),
  /** The position attributed to them, as a proposition. */
  position: z.string().min(10),
  /** Whether the author agrees, disagrees, or withholds judgement. */
  authorStance: z.enum(['endorses', 'rejects', 'qualifies', 'withholds']),
});

export type ReportedPerspective = z.infer<typeof ReportedPerspectiveSchema>;

/**
 * The specification a passage is generated from. Every field here is a control the
 * generator must honour and a downstream check can verify — which is the point:
 * "generate a CARS passage" is unverifiable, whereas "the thesis must appear in the
 * closing paragraph" is checkable.
 */
export const PassageBlueprintSchema = z.object({
  id: z.string().min(1),
  domain: z.enum(['humanities', 'social-sciences']),
  discipline: z.string().min(3),
  /**
   * The subject matter. Must be specific enough to constrain generation but must not
   * require outside knowledge to follow — the passage carries its own definitions.
   */
  topic: z.string().min(10),
  /** The claim the passage exists to support, stated as a proposition. */
  thesis: z.string().min(20),
  /**
   * Where the thesis sits. The best-evidenced difficulty lever available and it is
   * free: main-idea items are easiest with an opening thesis and hardest mid-text,
   * replicated across two testing programmes.
   */
  thesisPosition: z.enum(THESIS_POSITIONS),
  structure: z.enum(RHETORICAL_STRUCTURES),
  tone: z.enum(AUTHOR_TONES),
  purpose: z.enum(AUTHOR_PURPOSES),
  /** Ordinal only. A numeric difficulty here would be unearned precision. */
  difficulty: z.enum(DIFFICULTY_TARGETS),
  /**
   * Claims the author asserts with hedging. Required, and not decoration: hedged
   * claims are what make intensity-error distractors possible, so a passage with no
   * qualified claims cannot support the `too-extreme` family.
   */
  hedgedClaims: z.array(z.string().min(10)).min(2),
  reportedPerspectives: z.array(ReportedPerspectiveSchema).min(1),
  /**
   * Specialized terms the passage must define in place. This is how the
   * no-outside-knowledge rule is satisfied: the constraint is self-containment of the
   * text, not familiarity of the topic. AAMC states plainly that some passage topics
   * will be unfamiliar.
   */
  termsToDefineInPlace: z.array(z.string().min(2)).default([]),
  /** Paragraph-by-paragraph plan. Length drives the passage's paragraph count. */
  paragraphPlan: z
    .array(
      z.object({
        role: z.string().min(3),
        content: z.string().min(10),
      }),
    )
    .min(4),
});

export type PassageBlueprint = z.infer<typeof PassageBlueprintSchema>;

/**
 * The specification for one item. The distractor plan is the load-bearing part: the
 * distractor stage is where LLM generation fails roughly twice as often as everything
 * else — 70% of generated stems and keys were judged valid against only 37% of
 * distractor sets — so distractors are specified rather than left to the model.
 */
export const ItemModelSchema = z.object({
  id: z.string().min(1),
  archetype: z.enum(archetypeIds),
  /**
   * The skill tag is *derived*, never asserted by the generator. It follows from the
   * retrieval scope of the evidence spans, because that is what officially
   * distinguishes the categories. Recorded here so a blueprint can be audited, but
   * `deriveSkill` is the authority.
   */
  skill: CarsSkillSchema,
  /** What the key must establish, as a proposition. The generator writes prose for it. */
  keyProposition: z.string().min(10),
  /**
   * Which parts of the passage the key rests on, by paragraph index. Two or more
   * non-adjacent spans is what makes an item Reasoning Within the Text rather than
   * Foundations; a single span makes it Foundations however the stem is worded.
   */
  evidenceParagraphs: z.array(z.number().int().nonnegative()).min(1),
  /** One entry per distractor. Exactly three, since CARS is a four-option format. */
  distractorPlan: z
    .array(
      z.object({
        family: z.enum(familyIds),
        /** What this specific distractor must say, so the model cannot drift. */
        intent: z.string().min(10),
      }),
    )
    .length(3),
  /**
   * Information supplied by the stem itself. Required for Reasoning Beyond the Text
   * archetypes and forbidden otherwise — an item that smuggles new information into a
   * comprehension stem is mis-tagged.
   */
  stemSuppliedInformation: z.string().min(10).optional(),
});

export type ItemModel = z.infer<typeof ItemModelSchema>;

/** A blueprint plus its item models: the complete reviewable unit. */
export const PassageSetBlueprintSchema = z
  .object({
    passage: PassageBlueprintSchema,
    items: z.array(ItemModelSchema).min(1),
    /**
     * Set when a human has reviewed and approved this blueprint. The pipeline refuses
     * to publish items from an unapproved blueprint, because upstream approval is the
     * control the evidence actually supports.
     */
    approvedBy: z.string().min(1).optional(),
    approvedAt: z.string().datetime().optional(),
  })
  .superRefine((set, ctx) => {
    const paragraphCount = set.passage.paragraphPlan.length;
    for (const [index, item] of set.items.entries()) {
      for (const paragraph of item.evidenceParagraphs) {
        if (paragraph >= paragraphCount) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['items', index, 'evidenceParagraphs'],
            message: `references paragraph ${paragraph} but the plan has ${paragraphCount}`,
          });
        }
      }
      const archetype = ARCHETYPES.find((a) => a.id === item.archetype);
      if (!archetype) continue;
      if (archetype.scope === 'beyond' && item.stemSuppliedInformation === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['items', index, 'stemSuppliedInformation'],
          message: `archetype ${archetype.id} reasons beyond the text and requires stem-supplied information`,
        });
      }
      if (archetype.scope !== 'beyond' && item.stemSuppliedInformation !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['items', index, 'stemSuppliedInformation'],
          message: `archetype ${archetype.id} resolves within the text and must not supply new information`,
        });
      }
      if (item.evidenceParagraphs.length < archetype.minEvidenceSpans) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['items', index, 'evidenceParagraphs'],
          message: `archetype ${archetype.id} needs at least ${archetype.minEvidenceSpans} evidence spans`,
        });
      }
    }
  });

export type PassageSetBlueprint = z.infer<typeof PassageSetBlueprintSchema>;

/**
 * Derives the skill tag from retrieval scope, which is what officially distinguishes
 * the categories. Never trust a self-reported tag: a generator asked to label its own
 * output will label from stem wording, and stem wording does not determine the
 * category.
 *
 * `beyond` wins outright because stem-supplied information defines Reasoning Beyond
 * the Text. Otherwise the discriminator is whether the key needs non-adjacent spans.
 */
export function deriveSkill(item: Pick<ItemModel, 'archetype' | 'evidenceParagraphs'> & {
  readonly stemSuppliedInformation?: string | undefined;
}): 'FOC' | 'RWT' | 'RBT' {
  if (item.stemSuppliedInformation !== undefined) return 'RBT';
  const archetype = ARCHETYPES.find((a) => a.id === item.archetype);
  if (archetype?.scope === 'beyond') return 'RBT';

  const paragraphs = [...new Set(item.evidenceParagraphs)].sort((a, b) => a - b);
  if (paragraphs.length < 2) return 'FOC';
  // Adjacent paragraphs still count as an immediate context; integration requires
  // spans that are genuinely distant from one another.
  const spansDistantParagraphs = paragraphs.some((p, i) => i > 0 && p - (paragraphs[i - 1] ?? p) > 1);
  return spansDistantParagraphs || paragraphs.length > 2 ? 'RWT' : 'FOC';
}

/**
 * Checks a set's skill mix against the official 30/30/40 weighting. Reported rather
 * than enforced at the set level: with 5-7 items per passage, a single set cannot hit
 * the weights, which are a property of the 53-item form.
 */
export function skillMix(items: readonly ItemModel[]): Record<'FOC' | 'RWT' | 'RBT', number> {
  const mix = { FOC: 0, RWT: 0, RBT: 0 };
  for (const item of items) mix[deriveSkill(item)] += 1;
  return mix;
}
