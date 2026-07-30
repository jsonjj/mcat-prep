import { z } from 'zod';
import { UtcTimestampSchema } from './time';
import { SectionSchema } from './vocab';

/**
 * Practice-TEST dashboard DTOs (the amber card on the Practice hub).
 *
 * This is the SCORED full/half-length practice-EXAM surface, distinct from the
 * count-based adaptive Practice queue in `./practice.ts`: it reports how a
 * learner is trending across a handful of past tests, an overall readiness band,
 * and an estimated scaled-score RANGE (never a single fabricated number).
 *
 * The practice-test ENGINE is deferred, so the deployed backend does not serve a
 * summary yet — the read is a GRACEFUL DATA PATH: a client resolves the missing
 * route to `null`, and the Practice card renders its existing "coming soon" /
 * empty states unchanged. When the engine ships, the same route returns this view
 * (or `null` when the learner has taken no test), and the card fills in. The
 * local mastery simulator is the only producer today.
 */

/** Which kind of practice test a past entry was. */
export const PracticeTestPhaseSchema = z.enum(['baseline', 'half_length', 'full_length']);
export type PracticeTestPhase = z.infer<typeof PracticeTestPhaseSchema>;

/**
 * Overall readiness band. Same three-band vocabulary the CARS readiness gauge
 * uses (`building` → `approaching` → `on_track`), because a learner reading both
 * surfaces should not have to learn two words for the same idea — but it is a
 * SEPARATE enum so the practice-test band can move independently of CARS.
 */
export const PracticeReadinessLabelSchema = z.enum(['building', 'approaching', 'on_track']);
export type PracticeReadinessLabel = z.infer<typeof PracticeReadinessLabelSchema>;

/** MCAT scaled-score bound: 472–528 total across the four sections. */
const ScaledScoreSchema = z.number().int().min(472).max(528);

/** One MCAT section's %-correct on one past test (0–100). */
export const SectionScoreSchema = z
  .object({
    section: SectionSchema,
    pctCorrect: z.number().min(0).max(100),
  })
  .strict();
export type SectionScore = z.infer<typeof SectionScoreSchema>;

/**
 * One past practice test. `sections` carries the per-section %-correct, and the
 * "improvement over time" chart is exactly this series read ACROSS the ordered
 * `pastTests` — there is no separate trend payload to fall out of sync with it.
 */
export const PastPracticeTestSchema = z
  .object({
    testId: z.string().min(1),
    /** Display name, e.g. "Baseline" or "Checkpoint 2". */
    label: z.string().min(1),
    takenOn: UtcTimestampSchema,
    phase: PracticeTestPhaseSchema,
    /** Per-section %-correct for this test (the trend points). */
    sections: z.array(SectionScoreSchema).min(1),
    /** Overall scaled score for this test (472–528). */
    scaledScore: ScaledScoreSchema,
    /** The learner has worked through this test's review. */
    reviewed: z.boolean(),
  })
  .strict();
export type PastPracticeTest = z.infer<typeof PastPracticeTestSchema>;

/** Estimated scaled-score RANGE — deliberately a band, never a single score. */
export const EstimatedScoreRangeSchema = z
  .object({
    low: ScaledScoreSchema,
    high: ScaledScoreSchema,
  })
  .strict()
  .refine((r) => r.low <= r.high, { message: 'estimated score low must be <= high' });
export type EstimatedScoreRange = z.infer<typeof EstimatedScoreRangeSchema>;

/**
 * The practice-test dashboard summary. `pastTests` is CHRONOLOGICAL (earliest
 * first); an empty list is a valid "no tests yet" summary that the card renders
 * the same as a missing one.
 */
export const PracticeTestSummaryViewSchema = z
  .object({
    readinessLabel: PracticeReadinessLabelSchema,
    estimatedScore: EstimatedScoreRangeSchema,
    pastTests: z.array(PastPracticeTestSchema),
  })
  .strict();
export type PracticeTestSummaryView = z.infer<typeof PracticeTestSummaryViewSchema>;
