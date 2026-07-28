import { z } from 'zod';
import {
  ContentIdSchema,
  DistractorFamilySchema,
  OperationTagSchema,
  QuestionFormatSchema,
  SectionSchema,
  SkillClusterSchema,
} from '@mcat/contracts';

/**
 * ENGINE PROJECTION schema (the 15-cluster / 4-section model the study engine,
 * planner, mastery, and learner-safe wire DTOs are keyed on).
 *
 * The canonical *authored* schema of record is v7 (see `./schema.ts`). This file
 * holds the engine's internal question representation used by the synthetic bank
 * (`./bank.ts`), the authority engine, and `compileQuestion`. v7 content reaches
 * this projection only through the (not-yet-finalized) adapter seam in
 * `./v7-cluster-map.ts`.
 *
 * Answer keys and rationales live here but are split out by the compiler
 * (see `./compile.ts`) so they never reach a learner-safe payload.
 */

export const ContentStatusSchema = z.enum(['draft', 'reviewed', 'published', 'retired']);
export type ContentStatus = z.infer<typeof ContentStatusSchema>;

export const ReviewSchema = z.object({
  content_status: z.enum(['pending', 'approved', 'changes_requested']),
  copy_status: z.enum(['pending', 'approved', 'changes_requested']),
  accessibility_status: z.enum(['pending', 'approved', 'changes_requested']),
  reviewer_ids: z.array(z.string()).default([]),
});

export const ProvenanceSchema = z.object({
  origin: z.enum(['original', 'licensed']),
  source_refs: z.array(z.string()).default([]),
  rights_status: z.enum(['cleared', 'pending', 'restricted']),
  ai_assisted: z.boolean().default(false),
});

export const ChoiceSchema = z.object({
  id: z.enum(['A', 'B', 'C', 'D']),
  text: z.string().min(1),
  distractor_families: z.array(DistractorFamilySchema).default([]),
});

export const EngineMediaSchema = z.object({
  id: ContentIdSchema,
  kind: z.enum(['image', 'diagram', 'table', 'chart']),
  alt: z.string().min(1),
  long_description: z.string().optional(),
  /** Semantic data payload (e.g., table rows) — never rasterized text. */
  data: z.unknown().optional(),
});
export type EngineMedia = z.infer<typeof EngineMediaSchema>;

export const EngineStimulusSchema = z.object({
  schema_version: z.literal('1.0'),
  id: ContentIdSchema,
  version: z.number().int().positive(),
  status: ContentStatusSchema,
  type: z.enum(['passage', 'experiment', 'figure', 'dataset']),
  section: SectionSchema,
  /** Paragraphs / structured blocks as semantic text. */
  body: z.array(z.string().min(1)).min(1),
  media_ids: z.array(ContentIdSchema).default([]),
  provenance: ProvenanceSchema,
  test_only: z.boolean().default(false),
});
export type EngineStimulus = z.infer<typeof EngineStimulusSchema>;

export const EngineQuestionSchema = z.object({
  schema_version: z.literal('1.0'),
  id: ContentIdSchema,
  version: z.number().int().positive(),
  status: ContentStatusSchema,
  section: SectionSchema,
  skill_cluster: SkillClusterSchema,
  internal_skill_ids: z.array(z.string().min(1)).min(1),
  /**
   * The v3 knowledge component(s) the item assesses, most specific first.
   *
   * This is the KC grain the mastery model and the Mistakes patterns are keyed
   * on, and it is the SAME id space as the lesson graph
   * (`curriculum/v3/v3-lesson-authoring-manifest.json`) and the v7 corpus
   * `questions.kc_id` column: 422 KCs in each, all 422 shared. `internal_skill_ids`
   * is a different thing — a node in the internal skill graph (`./bank.ts`), which
   * is what resolves a display skill and the prerequisite edges.
   *
   * Optional because the engine projection predates the KC grain; an item without
   * one groups at cluster grain rather than being dropped.
   */
  kc_ids: z.array(z.string().min(1)).default([]),
  template_tags: z.array(OperationTagSchema).min(1),
  learning_objective: z.string().min(1),
  format: QuestionFormatSchema,
  difficulty: z.number().int().min(1).max(5),
  stimulus_id: ContentIdSchema.nullable(),
  stem: z.string().min(1),
  choices: z.array(ChoiceSchema).length(4),
  /** SERVER-ONLY after compilation. */
  correct_choice_id: z.enum(['A', 'B', 'C', 'D']),
  /** SERVER-ONLY after compilation. */
  rationales: z.object({
    correct: z.string().min(1),
    choices: z.record(z.enum(['A', 'B', 'C', 'D']), z.string().min(1)),
  }),
  prerequisite_ids: z.array(z.string()).default([]),
  content_tags: z.array(z.string()).default([]),
  estimated_seconds: z.number().int().positive(),
  media_ids: z.array(ContentIdSchema).default([]),
  /** Item family; a family satisfies a mastery recipe slot at most once. */
  family_id: z.string().min(1),
  provenance: ProvenanceSchema,
  review: ReviewSchema,
  delivery: z.object({
    diagnostic_eligible: z.boolean(),
    mastery_eligible: z.boolean(),
    protected: z.boolean(),
    test_only: z.boolean(),
  }),
});
export type EngineQuestion = z.infer<typeof EngineQuestionSchema>;

export const BankManifestSchema = z.object({
  contentRelease: z.string().min(1),
  publishedAt: z.string(),
  counts: z.object({
    questions: z.number().int().nonnegative(),
    stimuli: z.number().int().nonnegative(),
    testOnly: z.number().int().nonnegative(),
  }),
  /** Coverage by cluster (number of distinct families). */
  familiesByCluster: z.record(SkillClusterSchema, z.number().int().nonnegative()).default({}),
});
export type BankManifest = z.infer<typeof BankManifestSchema>;
