import { z } from 'zod';

/**
 * CANONICAL content schema of record — the v7 shape (the format our generated
 * question corpus is authored in). The app "speaks v7": questions are stored,
 * validated, and edited in this shape rather than being converted into the older
 * 15-cluster projection.
 *
 * Key rules:
 * - v7 section + skill codes are accepted NATIVELY (BB/CARS/CP/PS/CROSS_SECTION,
 *   SIRS1-4, CARS_FOC/RBT/RWT, …). We do NOT force-map them to the engine's 15
 *   clusters here — that mapping is a separate, not-yet-finalized decision and
 *   lives as a documented seam in `./v7-cluster-map.ts`.
 * - `correct_answer` + `explanations` are answer-bearing. They live on the
 *   canonical record but are SPLIT OUT by the compiler (`./compile.ts`,
 *   `compileV7Question`) into a protected/server-only payload and must NEVER
 *   reach a learner-safe surface.
 * - Extra/unknown v7 metadata is kept permissively (`.passthrough()`); loading
 *   must not hard-fail on metadata fields we don't model yet.
 * - Every question carries an `assets` list for figures/tables/3D/etc. that will
 *   be generated later. It starts empty ("needed").
 */

const ChoiceLetterSchema = z.enum(['A', 'B', 'C', 'D']);
export type ChoiceLetter = z.infer<typeof ChoiceLetterSchema>;

/** v7 sections, accepted natively (superset of the engine's 4 sections + CROSS_SECTION). */
export const V7SectionSchema = z.enum(['BB', 'CARS', 'CP', 'PS', 'CROSS_SECTION']);
export type V7Section = z.infer<typeof V7SectionSchema>;

/**
 * v7 skill code. Kept permissive on purpose: the corpus uses codes like SIRS1-4
 * and CARS_FOC/RBT/RWT, and new codes may appear. We accept any non-empty string
 * rather than hard-failing, and resolve to engine clusters later via the seam.
 */
export const V7SkillSchema = z.string().min(1);

// ---- Assets (NEW) ---------------------------------------------------------

/** The kinds of generated asset a question may need. `none` = explicitly no asset. */
export const AssetTypeSchema = z.enum([
  'none',
  'table',
  'plot',
  'diagram',
  'molecule_2d',
  'molecule_3d',
  'equation',
  'annotated_diagram',
]);
export type AssetType = z.infer<typeof AssetTypeSchema>;

export const AssetStatusSchema = z.enum(['needed', 'generating', 'ready']);
export type AssetStatus = z.infer<typeof AssetStatusSchema>;

/**
 * One asset slot. A single flexible list per question handles 0/1/several assets,
 * and adding a new `type` later does not change the record shape.
 * - `spec`: the data/description used to GENERATE the asset (authoring input;
 *   also the source for accessibility text). Server-side only — not learner-safe.
 * - `alt`: accessibility alt text (learner-safe).
 * - `storage_key`: link to the rendered file in object storage (S3). null = not
 *   generated yet.
 */
export const AssetSchema = z
  .object({
    type: AssetTypeSchema,
    status: AssetStatusSchema.default('needed'),
    spec: z.string().default(''),
    alt: z.string().default(''),
    storage_key: z.string().nullable().default(null),
  })
  .passthrough();
export type Asset = z.infer<typeof AssetSchema>;

// ---- v7 question ----------------------------------------------------------

/** v7 choices: an object keyed by choice letter → choice text. */
export const V7ChoicesSchema = z.object({
  A: z.string().min(1),
  B: z.string().min(1),
  C: z.string().min(1),
  D: z.string().min(1),
});
export type V7Choices = z.infer<typeof V7ChoicesSchema>;

/**
 * v7 per-choice explanations (answer-bearing). Modeled as a partial letter→text
 * record so shape-validation succeeds even if a record is missing one; the
 * semantic validator (`validateV7Question`) flags incompleteness separately.
 * SERVER-ONLY after compilation.
 */
export const V7ExplanationsSchema = z.record(ChoiceLetterSchema, z.string().min(1));
export type V7Explanations = z.infer<typeof V7ExplanationsSchema>;

/**
 * v7 per-choice error models (answer-revealing → SERVER-ONLY after compilation).
 *
 * A letter→text record: each choice's value names the misconception behind
 * picking it, and the correct choice's value is instead tagged `correct_model`.
 * It is the authored per-distractor diagnostic the Mistakes surface joins on the
 * PICKED option post-answer (WS2/WS3). Modeled as a partial letter record for the
 * same reason as `V7Explanations` — shape-validation must not hard-fail on a row
 * missing one — and it must NEVER reach a learner-safe surface: `compileV7Question`
 * splits it into the protected payload and the leak guard in `./compile.ts` names
 * `error_models` a protected key.
 */
export const V7ErrorModelsSchema = z.record(ChoiceLetterSchema, z.string().min(1));
export type V7ErrorModels = z.infer<typeof V7ErrorModelsSchema>;

const V7ConstructSchema = z
  .object({
    reasoning_operation_id: z.string().optional(),
    topic_id: z.string().optional(),
  })
  .passthrough();

const V7SurfaceSchema = z
  .object({
    context_domain: z.string().optional(),
    distractor_structure: z.string().optional(),
    representation: z.string().optional(),
    value_set: z.string().optional(),
  })
  .passthrough();

export const V7QuestionSchema = z
  .object({
    /** Optional envelope; v7 drops don't include it. Defaults for new authoring. */
    schema_version: z.string().default('v7'),

    // --- Learner-facing core (required) ---
    id: z.string().min(1),
    section: V7SectionSchema,
    stem: z.string().min(1),
    choices: V7ChoicesSchema,
    /** Present on all corpus rows; may be a full passage or a short vignette. */
    passage: z.string().optional().default(''),

    // --- Protected (SERVER-ONLY; split out by compileV7Question) ---
    correct_answer: ChoiceLetterSchema,
    explanations: V7ExplanationsSchema,

    // --- Classification / routing metadata (optional) ---
    subject: z.string().optional(),
    primary_skill: V7SkillSchema.optional(),
    /**
     * The 7-op reasoning-operation mastery axis (IDENTIFY/PREDICT/EXPLAIN/RELATE/
     * QUANTIFY/DESIGN/EVIDENCE). Kept permissive; when absent it is derived from
     * `primary_skill` + `construct.reasoning_operation_id` via
     * `resolveReasoningOperation` (see docs/mastery-pipeline.md §6).
     */
    reasoning_operation: z.string().optional(),
    primary_kc_id: z.string().optional(),
    primary_kc_label: z.string().optional(),
    secondary_skills: z.array(z.string()).optional(),
    secondary_kc_ids: z.array(z.string()).optional(),
    covered_kc_ids: z.array(z.string()).optional(),
    family_id: z.string().optional(),
    dok_level: z.number().int().optional(),
    dok_rationale: z.string().optional(),
    construct: V7ConstructSchema.optional(),
    surface: V7SurfaceSchema.optional(),
    transfer_dimensions_changed: z.unknown().optional(),
    lesson_id: z.string().optional(),
    lesson_label: z.string().optional(),
    pool: z.string().optional(),
    source_item_id: z.string().optional(),
    source_pool: z.string().optional(),
    quality: z.unknown().optional(),
    status: z.string().optional(),

    // --- Protected diagnostic (SERVER-ONLY; split out by compileV7Question) ---
    /**
     * Per-choice authored misconceptions. Was `z.unknown()` and dropped at
     * compile (0 live items); now modeled and carried into the protected payload
     * (WS2). Answer-revealing, so it never reaches a learner-safe surface.
     */
    error_models: V7ErrorModelsSchema.optional(),

    // --- Pipeline / QA bookkeeping (optional; accepted, not modeled) ---
    empirical_calibration: z.unknown().optional(),
    exposure_status: z.unknown().optional(),
    human_sme_review: z.unknown().optional(),
    certification_stage: z.unknown().optional(),

    // --- NEW: generated-asset slots (start empty) ---
    assets: z.array(AssetSchema).default([]),
  })
  // Keep any extra/unknown v7 metadata rather than hard-failing on it.
  .passthrough();
export type V7Question = z.infer<typeof V7QuestionSchema>;

/** Alias: the canonical `Question` is the v7 question. */
export const QuestionSchema = V7QuestionSchema;
export type Question = V7Question;

// ---- v7 stimulus (shared passages; optional/for future dedupe) ------------

/**
 * A shared stimulus (e.g., a CARS passage referenced by several items). v7
 * currently inlines `passage` on each question; this schema exists so shared
 * passages can be stored once and generated into `stimulus.schema.json`.
 */
export const V7StimulusSchema = z
  .object({
    schema_version: z.string().default('v7'),
    id: z.string().min(1),
    section: V7SectionSchema,
    /** Passage text as paragraphs. */
    body: z.array(z.string().min(1)).min(1),
    assets: z.array(AssetSchema).default([]),
  })
  .passthrough();
export type V7Stimulus = z.infer<typeof V7StimulusSchema>;

/** Alias: the canonical `Stimulus` is the v7 stimulus. */
export const StimulusSchema = V7StimulusSchema;
export type Stimulus = V7Stimulus;
