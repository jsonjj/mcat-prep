import { z } from 'zod';
import { CarsDuelRubricSchema } from './mastery';

/**
 * CARS Duel wire contracts (WS6).
 *
 * The CARS Duel is FORMATIVE — it writes no mastery (see `docs/mastery-pipeline.md`
 * §4.6 and `packages/policies/src/cars.ts`). These DTOs describe the SELECTION the
 * engine hands the client to autostart a duel and the topic pool it selects from;
 * the outcome/nudge shape stays `CarsDuelRubricSchema` in `./mastery`.
 */

/** Rebut = the daily anchor (mirrors real CARS: critique someone else's argument). */
export const CarsDuelModeSchema = z.enum(['rebut', 'defend']);
export type CarsDuelMode = z.infer<typeof CarsDuelModeSchema>;

/** System-set only — the learner never picks intensity. Target hold-rate 75–85%. */
export const CarsDuelIntensitySchema = z.enum(['warmup', 'standard', 'challenge']);
export type CarsDuelIntensity = z.infer<typeof CarsDuelIntensitySchema>;

/**
 * The stance the learner is assigned to argue — randomized MCAT-style so the
 * learner never picks their own side. `affirm` argues FOR the proposition,
 * `oppose` argues against it. In Rebut the AI takes the opposite side.
 */
export const CarsDuelSideSchema = z.enum(['affirm', 'oppose']);
export type CarsDuelSide = z.infer<typeof CarsDuelSideSchema>;

/** The ten vetted topic themes (see content/cars-duel/topics.json). */
export const CarsDuelThemeSchema = z.enum([
  'sociology',
  'aesthetics',
  'literature_popculture',
  'history_religion',
  'anthro_ling_geo_health',
  'ethics',
  'political_law',
  'psychology',
  'economics',
  'philosophy',
]);
export type CarsDuelTheme = z.infer<typeof CarsDuelThemeSchema>;

/** The seven vetted argument structures a topic can exercise. */
export const CarsDuelArgumentStructureSchema = z.enum([
  'policy_tradeoff',
  'causal',
  'definitional',
  'normative',
  'evidence_eval',
  'analogy',
  'interpretive',
]);
export type CarsDuelArgumentStructure = z.infer<typeof CarsDuelArgumentStructureSchema>;

/** How charged the proposition is (kept mild by design; never inflammatory). */
export const CarsDuelChargeSchema = z.enum(['neutral', 'mild', 'high']);
export type CarsDuelCharge = z.infer<typeof CarsDuelChargeSchema>;

/** Difficulty band 1 (gentlest) … 5 (hardest) authored per topic. */
export const CarsDuelDifficultySchema = z.number().int().min(1).max(5);

/**
 * One vetted debate topic — the canonical camelCase runtime shape used by the
 * selector and the content loader. The persisted `content/cars-duel/topics.json`
 * and the `cars_duel_topics` table use snake_case (`argument_structure`); the
 * content loader maps to this shape so there is one runtime source of truth.
 */
export const CarsDuelTopicSchema = z
  .object({
    id: z.string().min(1),
    proposition: z.string().min(1),
    theme: CarsDuelThemeSchema,
    argumentStructure: CarsDuelArgumentStructureSchema,
    difficulty: CarsDuelDifficultySchema,
    charge: CarsDuelChargeSchema,
  })
  .strict();
export type CarsDuelTopic = z.infer<typeof CarsDuelTopicSchema>;

/**
 * The fully-resolved selection the engine hands the autostart path: which topic,
 * which mode, the system-set intensity, and the randomized side the learner must
 * argue. Rides on the CARS activity in the daily plan (see `PlanActivityView`).
 */
export const CarsDuelSelectionViewSchema = z
  .object({
    topicId: z.string().min(1),
    proposition: z.string().min(1),
    theme: CarsDuelThemeSchema,
    argumentStructure: CarsDuelArgumentStructureSchema,
    difficulty: CarsDuelDifficultySchema,
    mode: CarsDuelModeSchema,
    intensity: CarsDuelIntensitySchema,
    side: CarsDuelSideSchema,
  })
  .strict();
export type CarsDuelSelectionView = z.infer<typeof CarsDuelSelectionViewSchema>;

/**
 * What the client reports when a duel finishes: the optional formative rubric
 * plus which selection was actually played, so the engine can update its history,
 * intensity rating, and Defend unlock. All optional — a legacy/manual duel with
 * no reported selection still records the low-weight ability nudge from the rubric.
 */
export const CarsDuelOutcomeInputSchema = z
  .object({
    rubric: CarsDuelRubricSchema.optional(),
    mode: CarsDuelModeSchema.optional(),
    topicId: z.string().min(1).optional(),
    intensity: CarsDuelIntensitySchema.optional(),
  })
  .strict();
export type CarsDuelOutcomeInput = z.infer<typeof CarsDuelOutcomeInputSchema>;
