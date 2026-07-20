import { z } from 'zod';
import {
  AssistanceLevelSchema,
  ContentIdSchema,
  OperationTagSchema,
  PolicyVersionSchema,
  SkillClusterSchema,
  UtcTimestampSchema,
} from '@mcat/contracts';

/**
 * The evidence model is the product's spine. Every attempt/review produces an
 * immutable evidence record describing *what kind* of evidence it is and under
 * *what conditions* it was produced. Mastery is computed only from records that
 * independently satisfy an evidence recipe (see @mcat/policies).
 */

export const EvidenceKindSchema = z.enum([
  'placement', // diagnostic placement — never mastery
  'instruction', // assisted/guided — never mastery
  'diagnostic_retry', // after a miss — never mastery
  'independent', // fresh A0 near-use
  'transfer', // changed-context A0
  'delayed', // delayed retrieval
  'mixed', // mixed-selection
  'integrated_passage', // multi-skill passage
  'timed', // timed conditions (separate dimension)
  'protected', // server-scored unseen proof
  'external_full_length', // self-reported full length
  'simulation', // simulation interaction — never mastery
  'explanation', // self-explanation/diagnosis — never mastery
  'pacing', // Ghost/pacing — never mastery
]);
export type EvidenceKind = z.infer<typeof EvidenceKindSchema>;

/** Kinds that can *never* independently satisfy a mastery recipe. */
export const CONTEXTUAL_ONLY_KINDS: ReadonlySet<EvidenceKind> = new Set<EvidenceKind>([
  'placement',
  'instruction',
  'diagnostic_retry',
  'simulation',
  'explanation',
  'pacing',
  'external_full_length',
]);

export const ChangeDimensionSchema = z.enum([
  'domain_context',
  'representation',
  'passage_or_data',
  'required_operation',
  'section_application',
]);
export type ChangeDimension = z.infer<typeof ChangeDimensionSchema>;

export const EvidenceOutcomeSchema = z.enum(['correct', 'incorrect', 'omitted']);
export type EvidenceOutcome = z.infer<typeof EvidenceOutcomeSchema>;

export const EvidenceConditionsSchema = z.object({
  mixed: z.boolean().default(false),
  passage: z.boolean().default(false),
  timed: z.boolean().default(false),
  protected: z.boolean().default(false),
  accommodations: z.array(z.string()).default([]),
});
export type EvidenceConditions = z.infer<typeof EvidenceConditionsSchema>;

export const EvidenceRecordSchema = z.object({
  evidenceId: z.string().uuid(),
  skillId: z.string().min(1),
  cluster: SkillClusterSchema,
  operation: OperationTagSchema,
  kind: EvidenceKindSchema,
  /** True only when A0, no content-bearing hint, not a retry, and not revealed. */
  independent: z.boolean(),
  assistanceLevel: AssistanceLevelSchema,
  contentBearingHint: z.boolean(),
  questionId: ContentIdSchema,
  itemVersion: z.number().int().positive(),
  /** Item family the question belongs to; a family satisfies a recipe slot at most once. */
  familyId: z.string().min(1),
  stimulusId: ContentIdSchema.optional(),
  changeDimensions: z.array(ChangeDimensionSchema).default([]),
  /** Hours since the prior related evidence, if this is a delayed callback. */
  delayHours: z.number().nonnegative().optional(),
  conditions: EvidenceConditionsSchema,
  outcome: EvidenceOutcomeSchema,
  /** False if the underlying content was retired/invalidated by a correction. */
  valid: z.boolean().default(true),
  occurredAt: UtcTimestampSchema,
  sequence: z.number().int().nonnegative(),
  contentRelease: z.string().min(1),
  policies: z.array(PolicyVersionSchema),
});
export type EvidenceRecord = z.infer<typeof EvidenceRecordSchema>;

/** Does this record, on its face, look like it could fill a mastery recipe slot? */
export const isMasteryEligible = (e: EvidenceRecord): boolean =>
  e.valid &&
  e.outcome === 'correct' &&
  e.independent &&
  !e.contentBearingHint &&
  !CONTEXTUAL_ONLY_KINDS.has(e.kind);
