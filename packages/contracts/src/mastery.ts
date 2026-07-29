import { z } from 'zod';
import { CarsSkillSchema, ReasoningOperationSchema, SkillClusterSchema } from './vocab';

/**
 * Mastery pipeline DTOs (mastery-bkt).
 *
 * The engine tracks a probability `P(L)` on exactly two grains — the primary KC
 * and the primary reasoning operation — plus an IRT ability `V` per CARS
 * sub-skill. A lesson has no `P(L)` of its own; its view is rolled up from its
 * required member KCs on read. These are the learner-safe view/seed shapes that
 * cross the wire. KC-grain `P(L)` is stored but never displayed, so it has no
 * view DTO here. See docs/mastery-pipeline.md and
 * docs/lesson-evidence-mastery-contract.md §9.
 */

const Probability = z.number().min(0).max(1);

/**
 * CARS Duel grading rubric — each micro-judgment scored 0–3 on what the response
 * exercised (omit criteria the duel didn't touch). Maps Position→FOC,
 * Argument→RWT, Application→RBT and updates the CARS ability at low (formative)
 * weight. See docs/mastery-pipeline.md §5.4.
 */
const RubricScore = z.number().int().min(0).max(3);
export const CarsDuelRubricSchema = z
  .object({
    position: RubricScore.optional(),
    argument: RubricScore.optional(),
    application: RubricScore.optional(),
  })
  .strict();
export type CarsDuelRubric = z.infer<typeof CarsDuelRubricSchema>;

/**
 * Seed values emitted once by the diagnostic and applied by the mastery engine.
 * Seeds only — never mastery. Priors are asymmetric & capped upstream (≤ 0.4) and
 * re-clamped on arrival, because a seed crosses a service boundary to get here.
 *
 * There is NO `lessonPriors` key, and its absence is load-bearing. A lesson has no
 * stored `P(L)`: its readout is rolled up from its required member KCs on read, so
 * a lesson-grain prior has no destination in the engine. While the key was
 * declared here the authority simply ignored it, and the diagnostic producer
 * emitted nothing else — so diagnostic seeding was a complete no-op that no check
 * reported. `.strict()` is what turns that silence into a named rejection: a
 * producer still sending `lessonPriors` now fails validation instead of being
 * quietly dropped. Widening this schema to accept it again re-creates the stored
 * lesson grain at a different layer; distribute the read over the lesson's
 * required member KCs instead (`kcsByFc` in @mcat/policies).
 */
export const MasterySeedSchema = z
  .object({
    /** primary_kc_id → prior P(L)_0. The grain the diagnostic seeds. */
    kcPriors: z.record(z.string().min(1), Probability),
    /** reasoning operation → prior P(L)_0. Open for a producer that measures them. */
    skillPriors: z.record(ReasoningOperationSchema, Probability),
    /** CARS sub-skill → initial ability V_0 (may be negative). */
    carsAbility: z.record(CarsSkillSchema, z.number()),
  })
  .strict();
export type MasterySeed = z.infer<typeof MasterySeedSchema>;

/**
 * One of the 7 reasoning-skill readouts shown on the Skills page.
 *
 * PURE CAPABILITY, AND IT SAYS SO. This view carries no evidence warrant, so it
 * publishes no mastery claim: `atCapabilityCut` replaced a field called
 * `mastered` on 2026-07-29, which was a bare `pL >= 0.95` and therefore the one
 * learner-facing mastery claim that skipped the evidence gate `669fbcf` put on
 * the lesson rollup. Probed at the time: `pL = 0.9622478606`, `mastered: true`,
 * evidence count 0.
 *
 * The claim was not composed here instead, and the reason is measured rather
 * than assumed: `EvidenceRecord.skillId` is a KC id, never a reasoning
 * operation, so `Authority.skillWarrants` produces zero grains at this grain —
 * zero even after a full synthetic run that reaches
 * `INDEPENDENT_EVIDENCE_SATISFIED` on its KCs. Conjoining a warrant that has no
 * producer would not gate the claim, it would make it the constant `false` for
 * every learner on every path. Until something writes evidence per reasoning
 * operation, the honest publication is the capability half under its own name.
 */
export const SkillMasteryViewSchema = z
  .object({
    operation: ReasoningOperationSchema,
    /** Current mastery probability (post-decay), 0–1. */
    pL: Probability,
    /**
     * BKT decay: `P(L)` has fallen below the review line since it was last
     * practiced, so the memory is due. NOT `MasteryMapEntry.refreshNeeded`, which
     * says the evidence WARRANT is stale or contradicted. Two questions, two
     * authorities: a planner reads both and must not merge them, which is what
     * one shared field name previously invited.
     */
    reviewDue: z.boolean(),
    /**
     * The CAPABILITY half only: `P(L)` is at or above the cut
     * (`isAtCapabilityCut` in `@mcat/policies`). It is not mastery and must not
     * be rendered as mastery — the claim needs a warrant this view does not
     * carry. `LessonMasteryView.mastered` is the composed claim.
     */
    atCapabilityCut: z.boolean(),
  })
  .strict();
export type SkillMasteryView = z.infer<typeof SkillMasteryViewSchema>;

/**
 * Per-lesson readout for the Evidence Atlas brain nodes on Progress. Every field
 * is DERIVED from the lesson's required member KCs by `rollUpLessonMastery`; a
 * lesson has no BKT state of its own and no lesson observation exists.
 *
 * `pL` is the arithmetic MEAN of the members' current (lazily decayed) `P(L)`.
 * It is a display value, not a probability of lesson mastery, and MUST NOT be
 * compared against `MASTERY_THRESHOLD` — `mastered` is true only when EVERY
 * required member KC is individually at or above the threshold, so a high mean
 * with one weak KC is correctly not mastered. `reviewDue` is true when any
 * previously practiced required KC is due for review; it is BKT decay, not the
 * evidence warrant's `refreshNeeded`. The field keeps the name `pL` because
 * `apps/learner-web` reads it; renaming it to `meanMemberPL` is owed by the UI
 * follow-up.
 *
 * A lesson whose required-KC membership cannot be resolved emits no entry at
 * all (fail-closed); it is never reported as `0` or as vacuously mastered.
 */
export const LessonMasteryViewSchema = z
  .object({
    lessonId: z.string().min(1),
    cluster: SkillClusterSchema.nullable(),
    pL: Probability,
    reviewDue: z.boolean(),
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
