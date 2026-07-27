import { z } from 'zod';
import { CarsSkillSchema, ReasoningOperationSchema, SkillClusterSchema } from './vocab';

/**
 * Mastery pipeline DTOs (mastery-bkt / provisional-v1).
 *
 * The engine tracks a probability `P(L)` per unit (KC / 7-skill / lesson) and an
 * IRT ability `V` per CARS sub-skill. These are the learner-safe view/seed shapes
 * that cross the wire. KC-grain `P(L)` is stored but never displayed, so it has no
 * view DTO here. See docs/mastery-pipeline.md.
 */

const Probability = z.number().min(0).max(1);

/**
 * Seed values emitted once by the diagnostic and applied by the mastery engine.
 * Seeds only — never mastery. Priors are asymmetric & capped upstream (≤ 0.4).
 */
export const MasterySeedSchema = z
  .object({
    /** primary_kc_id → prior P(L)_0. */
    kcPriors: z.record(z.string().min(1), Probability),
    /** reasoning operation → prior P(L)_0. */
    skillPriors: z.record(ReasoningOperationSchema, Probability),
    /** CARS sub-skill → initial ability V_0 (may be negative). */
    carsAbility: z.record(CarsSkillSchema, z.number()),
  })
  .strict();
export type MasterySeed = z.infer<typeof MasterySeedSchema>;

/** One of the 7 reasoning-skill readouts shown on the Skills page. */
export const SkillMasteryViewSchema = z
  .object({
    operation: ReasoningOperationSchema,
    /** Current mastery probability (post-decay), 0–1. */
    pL: Probability,
    /** Evidence decayed below the review line or contradicted by a fresh miss. */
    refreshNeeded: z.boolean(),
    mastered: z.boolean(),
  })
  .strict();
export type SkillMasteryView = z.infer<typeof SkillMasteryViewSchema>;

/** Per-lesson mastery used to drive the Evidence Atlas brain nodes on Progress. */
export const LessonMasteryViewSchema = z
  .object({
    lessonId: z.string().min(1),
    cluster: SkillClusterSchema.nullable(),
    pL: Probability,
    refreshNeeded: z.boolean(),
    mastered: z.boolean(),
  })
  .strict();
export type LessonMasteryView = z.infer<typeof LessonMasteryViewSchema>;

export const CarsReadinessLabelSchema = z.enum(['building', 'approaching', 'on_track']);
export type CarsReadinessLabel = z.infer<typeof CarsReadinessLabelSchema>;

/** One CARS sub-skill readout: raw ability `V` + a display accuracy `pct = σ(V)`. */
export const CarsSkillReadinessSchema = z
  .object({
    skill: CarsSkillSchema,
    v: z.number(),
    pct: Probability,
  })
  .strict();
export type CarsSkillReadiness = z.infer<typeof CarsSkillReadinessSchema>;

/** The CARS readiness view (gauge + 3 sub-skill bars). */
export const CarsReadinessViewSchema = z
  .object({
    skills: z.array(CarsSkillReadinessSchema),
    overallV: z.number(),
    overallPct: Probability,
    onTrack: z.boolean(),
    label: CarsReadinessLabelSchema,
  })
  .strict();
export type CarsReadinessView = z.infer<typeof CarsReadinessViewSchema>;
