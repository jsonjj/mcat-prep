/**
 * Schemas for generated CARS content, and the safe/protected split.
 *
 * The repository's standing rule is that answer keys and rationales never reach a
 * learner-visible payload; `tools/scanners` and the architecture tests enforce it. This
 * file keeps generated content on the same footing as authored bank content: one type
 * carries everything, and `toSafePassageSet` produces the learner-visible projection
 * with the key and every rationale removed.
 */

import { z } from 'zod';
import { CarsSkillSchema } from '@mcat/contracts/vocab';
import { ARCHETYPES } from './archetypes';
import { DISTRACTOR_FAMILIES } from './distractors';

const archetypeIds = ARCHETYPES.map((a) => a.id) as [string, ...string[]];
const familyIds = DISTRACTOR_FAMILIES.map((f) => f.id) as [string, ...string[]];

export const CHOICE_LABELS = ['A', 'B', 'C', 'D'] as const;
export type ChoiceLabel = (typeof CHOICE_LABELS)[number];

export const GeneratedPassageSchema = z.object({
  id: z.string().min(1),
  blueprintId: z.string().min(1),
  title: z.string().min(3),
  /** Paragraphs as semantic text. Never rasterized, per the accessibility conventions. */
  paragraphs: z.array(z.string().min(20)).min(4),
});

export type GeneratedPassage = z.infer<typeof GeneratedPassageSchema>;

export const GeneratedChoiceSchema = z.object({
  label: z.enum(CHOICE_LABELS),
  text: z.string().min(1),
});

export type GeneratedChoice = z.infer<typeof GeneratedChoiceSchema>;

/**
 * Per-choice rationale. The distractor-family hypothesis is recorded as the error the
 * option was *designed* to catch — an investigation prompt about the item, not a
 * diagnosis of the learner who picked it. That distinction is a standing repo
 * convention and it matters: one selection is not evidence of a misconception.
 */
export const ChoiceRationaleSchema = z.object({
  label: z.enum(CHOICE_LABELS),
  rationale: z.string().min(10),
  /** Absent on the key. */
  family: z.enum(familyIds).optional(),
});

export const GeneratedItemSchema = z.object({
  id: z.string().min(1),
  itemModelId: z.string().min(1),
  /**
   * The family this item belongs to, for calibration inheritance. Items generated from
   * the same item model are siblings, and sibling calibration is the highest-value
   * cold-start route available — but only if the family is recorded at generation time,
   * which is why this is required rather than optional.
   */
  familyId: z.string().min(1),
  archetype: z.enum(archetypeIds),
  skill: CarsSkillSchema,
  stem: z.string().min(10),
  choices: z.array(GeneratedChoiceSchema).length(4),

  // --- Protected below this line. Never sent to a learner before they answer. ---
  correctChoice: z.enum(CHOICE_LABELS),
  rationales: z.array(ChoiceRationaleSchema).length(4),
  /**
   * Quotations from the generated passage that support the key. Required because the
   * adjudication and skill-derivation steps both need to know *where* the key is
   * grounded, and because an author who cannot cite the passage has not written a
   * defensible key.
   */
  evidenceQuotes: z.array(z.string().min(10)).min(1),
});

export type GeneratedItem = z.infer<typeof GeneratedItemSchema>;

export const GeneratedPassageSetSchema = z.object({
  passage: GeneratedPassageSchema,
  items: z.array(GeneratedItemSchema).min(1),
  /** Model and prompt provenance, so a bad batch can be traced and retired. */
  provenance: z.object({
    model: z.string().min(1),
    generatedAt: z.string().datetime(),
    pipelineVersion: z.string().min(1),
  }),
});

export type GeneratedPassageSet = z.infer<typeof GeneratedPassageSetSchema>;

/** The learner-visible projection: no key, no rationales, no evidence quotes. */
export interface SafeItem {
  readonly id: string;
  readonly archetype: string;
  readonly skill: 'FOC' | 'RWT' | 'RBT';
  readonly stem: string;
  readonly choices: readonly GeneratedChoice[];
}

export interface SafePassageSet {
  readonly passage: GeneratedPassage;
  readonly items: readonly SafeItem[];
}

export function toSafePassageSet(set: GeneratedPassageSet): SafePassageSet {
  return {
    passage: set.passage,
    items: set.items.map((item) => ({
      id: item.id,
      archetype: item.archetype,
      skill: item.skill,
      stem: item.stem,
      choices: item.choices,
    })),
  };
}

/**
 * Mirrors `assertNoProtectedFields` from the content package for generated sets, so the
 * same guarantee can be asserted in tests here without a dependency on that package.
 */
export function assertNoProtectedFields(safe: SafePassageSet): void {
  const json = JSON.stringify(safe);
  for (const token of ['correctChoice', 'rationales', 'evidenceQuotes', 'family']) {
    if (json.includes(token)) {
      throw new Error(`safe payload leaked protected field: ${token}`);
    }
  }
}

export function passageWordCount(passage: GeneratedPassage): number {
  return wordsIn(passage.paragraphs.join(' '));
}

export function wordsIn(text: string): number {
  return text.match(/[A-Za-z0-9][A-Za-z0-9'’-]*/g)?.length ?? 0;
}

export function sentencesIn(text: string): readonly string[] {
  return text
    .split(/(?<=[.!?])\s+(?=[A-Z“"'])/)
    .map((s) => s.trim())
    .filter((s) => wordsIn(s) >= 3);
}
