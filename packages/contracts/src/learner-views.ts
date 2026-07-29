import { z } from 'zod';
import { ChoiceIdSchema } from './commands';
import { ContentIdSchema } from './ids';
import { PracticeFocusSchema } from './practice';
import { UtcTimestampSchema } from './time';
import {
  AssistanceLevelSchema,
  OperationTagSchema,
  QuestionFormatSchema,
  SectionSchema,
  SkillClusterSchema,
} from './vocab';

/** Browser-deliverable question data. This schema cannot represent a key or rationale. */
export const LearnerSafeChoiceSchema = z
  .object({
    id: ChoiceIdSchema,
    text: z.string().min(1),
  })
  .strict();
export type LearnerSafeChoice = z.infer<typeof LearnerSafeChoiceSchema>;

export const LearnerSafeQuestionSchema = z
  .object({
    id: ContentIdSchema,
    version: z.number().int().positive(),
    section: SectionSchema,
    skill_cluster: SkillClusterSchema,
    internal_skill_ids: z.array(z.string().min(1)).min(1),
    template_tags: z.array(OperationTagSchema).min(1),
    format: QuestionFormatSchema,
    stimulus_id: ContentIdSchema.nullable(),
    stem: z.string().min(1),
    choices: z.array(LearnerSafeChoiceSchema).length(4),
    estimated_seconds: z.number().int().positive(),
    media_ids: z.array(ContentIdSchema),
    family_id: z.string().min(1),
  })
  .strict();
export type LearnerSafeQuestion = z.infer<typeof LearnerSafeQuestionSchema>;

export const StimulusViewSchema = z
  .object({
    id: ContentIdSchema,
    body: z.array(z.string().min(1)).min(1),
  })
  .strict();
export type StimulusView = z.infer<typeof StimulusViewSchema>;

export const LessonBlockViewSchema = z
  .object({
    kind: z.string().min(1),
    heading: z.string().min(1),
    body: z.array(z.string().min(1)).min(1),
  })
  .strict();
export type LessonBlockView = z.infer<typeof LessonBlockViewSchema>;

export const HintViewSchema = z
  .object({
    level: AssistanceLevelSchema,
    text: z.string().min(1),
    contentBearing: z.boolean(),
  })
  .strict();
export type HintView = z.infer<typeof HintViewSchema>;

/**
 * The only study-step DTO that can carry answer material. A handler may return
 * it only after the server has authorized the post-reveal boundary.
 */
export const PostRevealResponseSchema = z
  .object({
    correctChoiceId: ChoiceIdSchema,
    correctRationale: z.string().min(1),
    choiceRationales: z
      .object({
        A: z.string().min(1),
        B: z.string().min(1),
        C: z.string().min(1),
        D: z.string().min(1),
      })
      .strict(),
    /**
     * The option this learner actually picked on the first attempt, so the reveal
     * can refute THAT option rather than the key in general. Server-carried
     * because the diagnostic signal is which wrong answer was chosen (§3.3) and
     * browser-local selection state does not survive the step change or a reload.
     * Null when there was no scored first attempt (Reveal Now).
     */
    chosenChoiceId: ChoiceIdSchema.nullable(),
  })
  .strict();
export type PostRevealResponse = z.infer<typeof PostRevealResponseSchema>;

export const StudyPhaseSchema = z.enum([
  'independent',
  'guided',
  'transfer',
  'passage',
  'protected',
]);
export type StudyPhase = z.infer<typeof StudyPhaseSchema>;

/**
 * No `cause` step: a miss goes straight to feedback, because the seconds after a
 * miss are worth spending on the refutation rather than on a question the learner
 * cannot answer (docs/design/error-handling-design.md §2.3). `retry` survives — it
 * now follows the reveal instead of preceding it.
 *
 * These are the STUDY loop's substates, and the study reveal names the key on the
 * first miss. Adaptive Practice defers the key to a second miss (§3.3, amended
 * 2026-07-28); its step machine is client-local
 * (`apps/learner-web/src/screens/practice/session-flow.ts`) and does not cross this
 * contract, so nothing here changes.
 */
export const QuestionSubStateSchema = z.enum(['answering', 'retry', 'reveal']);
export type QuestionSubState = z.infer<typeof QuestionSubStateSchema>;

/**
 * Evidence-WARRANT reason codes: what the evidence behind a skill covers, how
 * current it is, and what is still missing. None of them states a capability
 * level or an attainment rank. The `*_ACHIEVED` codes this list replaced were
 * evidence-ladder ranks worn as learner-facing attainment language, which is
 * exactly the second mastery scale the seam exists to remove; the capability
 * claim comes from the BKT estimate (`SkillMasteryView.pL`) and nowhere else.
 *
 * These codes are the ONLY warrant vocabulary that crosses to the learner, and
 * the numeric `base` tier no longer does. What that bought is narrower than an
 * earlier version of this comment claimed, and the claim is corrected here
 * rather than left standing: it asserted that a set of codes "cannot be compared
 * and thresholded". It can. `evaluateEvidence` in
 * `packages/policies/src/mastery-policy.ts` emits exactly one of
 * `NO_USEFUL_EVIDENCE`, `INSTRUCTIONAL_EVIDENCE_ONLY`,
 * `INDEPENDENT_EVIDENCE_SATISFIED`, `RETENTION_EVIDENCE_SATISFIED`,
 * `STRONG_CONDITIONS_EVIDENCE_SATISFIED` per entry, mutually exclusive and in
 * ladder order, so a consumer can recover the internal rank losslessly by
 * indexing that list. Removing `base` removed a rank the wire INVITED a client
 * to threshold; it did not make the rank unrecoverable.
 *
 * The real guarantee is narrower and still worth having: no field on this
 * boundary is typed as an ordinal, nothing in the repo compares these codes, and
 * a rival scale now takes deliberate work to rebuild rather than being handed
 * over ready-made. Capability remains `SkillMasteryView.pL` alone.
 *
 * Coarsening the three `*_SATISFIED` codes into one — which is what would make
 * the rank genuinely unrecoverable — is an OWNER decision, not a cleanup: these
 * strings are learner-facing vocabulary, `apps/learner-web` words them as
 * distinct sentences, and collapsing them would lose the "what is still missing"
 * detail this list exists to carry. Not done unilaterally.
 *
 * MIRROR of `EVIDENCE_REASONS` in `packages/domain/src/reason-codes.ts`, which
 * is the producer. It cannot be imported: `@mcat/domain` depends on
 * `@mcat/contracts`, so the reverse import would be a dependency cycle. The two
 * lists MUST stay member-for-member identical — a divergence means the domain
 * emits a code this view rejects at the wire boundary. The cross-package parity
 * assertion belongs in `tests/architecture/`, which may import both.
 */
export const EVIDENCE_REASON_CODES = [
  'NO_USEFUL_EVIDENCE',
  'PREREQUISITE_BLOCKED',
  'INSTRUCTIONAL_EVIDENCE_ONLY',
  'INDEPENDENT_EVIDENCE_SATISFIED',
  'RETENTION_EVIDENCE_SATISFIED',
  'STRONG_CONDITIONS_EVIDENCE_SATISFIED',
  'EVIDENCE_STALE',
  'FRESH_FAILURE',
  'CORRECTION_INVALIDATED_EVIDENCE',
  'INDEPENDENT_EVIDENCE_GAP',
  'TRANSFER_EVIDENCE_GAP',
  'DELAYED_EVIDENCE_GAP',
  'MIXED_EVIDENCE_GAP',
  'PASSAGE_EVIDENCE_GAP',
  'TIMED_EVIDENCE_GAP',
  'PROTECTED_EVIDENCE_GAP',
  'EVIDENCE_GAP',
] as const;

export const EvidenceReasonCodeSchema = z.enum(EVIDENCE_REASON_CODES);
export type EvidenceReasonCode = z.infer<typeof EvidenceReasonCodeSchema>;

export const DecisionReasonViewSchema = z
  .object({
    code: EvidenceReasonCodeSchema,
    detail: z.string().min(1).optional(),
  })
  .strict();

/**
 * End-of-session summary. It reports the evidence WARRANT for the skill just
 * practiced — which slots the evidence fills and which are still open — as
 * `reasons`, the same non-ordinal code list `MasteryMapEntrySchema` carries.
 *
 * It deliberately publishes no tier. The field used to be `masteryState`, an
 * ordinal evidence rank, and every consumer that read it ended up presenting
 * evidence sufficiency as attainment however it was worded. The learner-facing
 * capability claim is BKT's `SkillMasteryView.pL` / `mastered` and nothing here.
 */
export const SessionSummarySchema = z
  .object({
    skillId: z.string().min(1),
    /** WARRANT staleness. BKT's decay question is `SkillMasteryView.reviewDue`. */
    refreshNeeded: z.boolean(),
    reasons: z.array(DecisionReasonViewSchema),
    evidenceCounts: z.record(z.string(), z.number().int().nonnegative()),
  })
  .strict();
export type SessionSummary = z.infer<typeof SessionSummarySchema>;

const QuestionStepBaseShape = {
  kind: z.literal('question'),
  phase: StudyPhaseSchema,
  question: LearnerSafeQuestionSchema,
  stimulus: StimulusViewSchema.nullable(),
  hint: HintViewSchema.nullable(),
  skillId: z.string().min(1),
};

export const UnrevealedQuestionStepViewSchema = z
  .object({
    ...QuestionStepBaseShape,
    sub: z.enum(['answering', 'retry']),
    reveal: z.null(),
  })
  .strict();

export const RevealedQuestionStepViewSchema = z
  .object({
    ...QuestionStepBaseShape,
    sub: z.literal('reveal'),
    reveal: PostRevealResponseSchema,
  })
  .strict();

export const StudyStepViewSchema = z.union([
  z
    .object({
      kind: z.literal('lesson'),
      lessonId: ContentIdSchema,
      title: z.string().min(1),
      blocks: z.array(LessonBlockViewSchema).min(1),
      skillId: z.string().min(1),
    })
    .strict(),
  UnrevealedQuestionStepViewSchema,
  RevealedQuestionStepViewSchema,
  z
    .object({
      kind: z.literal('simulation'),
      specId: ContentIdSchema,
      skillId: z.string().min(1),
    })
    .strict(),
  z
    .object({
      kind: z.literal('recall'),
      promptId: ContentIdSchema,
      prompt: z.string().min(1),
      format: z.string().min(1),
      skillId: z.string().min(1),
    })
    .strict(),
  z
    .object({
      kind: z.literal('complete'),
      skillId: z.string().min(1),
      summary: SessionSummarySchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal('locked'),
      reason: z.string().min(1),
    })
    .strict(),
]);
export type StudyStepView = z.infer<typeof StudyStepViewSchema>;

export const PlannerReasonSchema = z.enum([
  'UNFINISHED_CHECKPOINT',
  'PREREQUISITE_BLOCKER',
  'FAILED_REPAIR',
  'FRESHNESS_RISK',
  'OVERDUE_REVIEW',
  'UNRESOLVED_ERROR',
  'PASSAGE_GAP',
  'TIMED_GAP',
  'PROTECTED_GAP',
  'TAUGHT_NOT_MASTERED',
  'COVERAGE_GAP',
  'CARS_CONTACT',
  'NEW_LEARNING',
  'OPTIONAL_DEPTH',
  'CAPACITY_CONSTRAINT',
]);

export const TaskViewSchema = z
  .object({
    taskId: z.string().min(1),
    type: z.enum([
      'diagnostic',
      'lesson',
      'guided_practice',
      'independent_check',
      'diagnose_repair',
      'transfer',
      'recall',
      'mixed_practice',
      'passage',
      'timed_assessment',
      'protected_assessment',
      'simulation',
      'quick_practice',
    ]),
    title: z.string().min(1),
    skillId: z.string().min(1).optional(),
    cluster: SkillClusterSchema.optional(),
    estimatedMinutes: z.number().int().positive(),
    priorityReason: PlannerReasonSchema,
    reasonDetail: z.string().min(1).optional(),
    dependencyTaskId: z.string().min(1).optional(),
    status: z.enum(['ready', 'in_progress', 'blocked', 'complete', 'snoozed', 'needs_connection']),
    window: z.enum(['morning', 'midday', 'evening']).optional(),
    requiresConnection: z.boolean(),
  })
  .strict();
export type TaskView = z.infer<typeof TaskViewSchema>;

export const GhostViewSchema = z
  .object({
    state: z.enum(['ahead', 'on_track', 'behind', 'idle']),
    headline: z.string().min(1),
    message: z.string().min(1),
    expectedPct: z.number().min(0).max(1).nullable(),
    actualPct: z.number().min(0).max(1),
    daysIdle: z.number().int().nonnegative().nullable(),
  })
  .strict();
export type GhostView = z.infer<typeof GhostViewSchema>;

export const TodayViewSchema = z
  .object({
    capacityLabel: z.enum(['on_track', 'tight', 'goal_plan_mismatch', 'rolling']),
    continueTaskId: z.string().min(1).nullable(),
    tasks: z.array(TaskViewSchema),
    reviewSharePct: z.number().min(0).max(1),
    dayNumber: z.number().int().positive(),
    totalDays: z.number().int().positive().nullable(),
    reviewsDue: z.number().int().nonnegative(),
    repairsOpen: z.number().int().nonnegative(),
    ghost: GhostViewSchema,
  })
  .strict();
export type TodayView = z.infer<typeof TodayViewSchema>;

export const EvidenceKindSchema = z.enum([
  'placement',
  'instruction',
  'diagnostic_retry',
  'independent',
  'transfer',
  'delayed',
  'mixed',
  'integrated_passage',
  'timed',
  'protected',
  'external_full_length',
  'simulation',
  'explanation',
  'pacing',
]);

/**
 * One skill's evidence warrant: which recipe slots the evidence fills, how fresh
 * it is, and what is still open — reported only as `reasons`, never as a rank.
 *
 * The ordinal `base` tier this used to publish is gone. It stayed internal to
 * `packages/authority-core`, where the planner and the coverage counters may
 * legitimately compare tiers; it no longer crosses the wire, because every
 * learner-facing consumer that could read a rank eventually thresholded it and
 * re-created a second mastery scale beside BKT. `SkillMasteryView.pL` /
 * `mastered` is the only capability claim the learner ever sees.
 */
export const MasteryMapEntrySchema = z
  .object({
    skillId: z.string().min(1),
    /**
     * The warrant is stale or contradicted by a fresh failure. This is the
     * EVIDENCE system's question and it is not BKT decay — that is
     * `SkillMasteryView.reviewDue`. A planner consumes both, separately.
     */
    refreshNeeded: z.boolean(),
    supportingEvidenceIds: z.array(z.string().uuid()),
    freshestByKind: z.record(EvidenceKindSchema, UtcTimestampSchema),
    reasons: z.array(DecisionReasonViewSchema),
    policyVersion: z.string().min(1),
    cluster: SkillClusterSchema,
    title: z.string().min(1),
  })
  .strict();
export type MasteryMapEntry = z.infer<typeof MasteryMapEntrySchema>;

/**
 * One practice miss, carrying the content the learner needs to act on it.
 *
 * Answer material is authorized here because the learner already answered and
 * already saw the reveal: the row re-shows what they were told at the time.
 * There is deliberately NO self-reported cause field — experts naming the cause
 * of an error agree at κ = 0.000–0.063 and learner self-report is biased worst
 * in the weakest learners (docs/design/error-handling-design.md §2.3).
 */
export const ErrorEntryViewSchema = z
  .object({
    /** Practice ids come from the v7 corpus, which is looser than `ContentId`. */
    questionId: z.string().min(1),
    kcId: z.string().min(1).nullable(),
    /** The 7-op reasoning operation the item exercises. */
    skillId: z.string().min(1).nullable(),
    cluster: z.string().min(1).nullable(),
    familyId: z.string().min(1).nullable(),
    occurredAt: UtcTimestampSchema,
    stem: z.string().min(1),
    chosenChoiceId: ChoiceIdSchema.nullable(),
    chosenChoiceText: z.string(),
    correctChoiceId: ChoiceIdSchema,
    correctChoiceText: z.string(),
    /** The per-choice refutation that was shown when the miss happened. */
    choiceRationale: z.string().min(1).nullable(),
    /** A later correct first attempt on a FRESH item in the same KC landed. */
    resolved: z.boolean(),
    /** Focus token for a fresh re-attempt in this area (never a re-serve). */
    focus: PracticeFocusSchema.nullable(),
  })
  .strict();
export type ErrorEntryView = z.infer<typeof ErrorEntryViewSchema>;

/**
 * A recurring-miss pattern, grouped at CONTENT grain (KC / cluster / reasoning
 * operation) and stated as a claim about the learner's answers.
 *
 * Misconception grain is not offered: `error_models` is populated on 0 of the
 * 2,108 corpus items, so the best-validated grain has no data behind it. KC
 * grain is the defensible thin version the spec permits (§6.5).
 *
 * `attemptedItems` is the denominator and must always be displayed with
 * `missedItems`; `assertable` is false when the sample is below the floor, and
 * the copy must hedge rather than assert (§6.5 rule 5).
 */
export const MistakePatternViewSchema = z
  .object({
    grain: z.enum(['kc', 'cluster', 'skill']),
    key: z.string().min(1),
    label: z.string().min(1),
    /** Distinct items missed — never attempts, which are not independent. */
    missedItems: z.number().int().nonnegative(),
    /** Distinct items attempted in this group. The denominator. */
    attemptedItems: z.number().int().positive(),
    lastMissedAt: UtcTimestampSchema,
    assertable: z.boolean(),
    focus: PracticeFocusSchema.nullable(),
  })
  .strict();
export type MistakePatternView = z.infer<typeof MistakePatternViewSchema>;

export const SkillSummarySchema = z
  .object({
    skillId: z.string().min(1),
    cluster: SkillClusterSchema,
    title: z.string().min(1),
    objective: z.string().min(1),
  })
  .strict();
export type SkillSummary = z.infer<typeof SkillSummarySchema>;

export const DiagnosticNextSchema = z
  .object({
    done: z.boolean(),
    question: LearnerSafeQuestionSchema.nullable(),
    progress: z.number().min(0).max(1),
  })
  .strict();
export type DiagnosticNext = z.infer<typeof DiagnosticNextSchema>;

export const PracticeItemViewSchema = z
  .object({
    question: LearnerSafeQuestionSchema,
    stimulus: StimulusViewSchema.nullable(),
  })
  .strict();
export type PracticeItemView = z.infer<typeof PracticeItemViewSchema>;

/** Answer-bearing feedback authorized only after the practice response is submitted. */
export const PracticeResultSchema = z
  .object({
    correct: z.boolean(),
    correctChoiceId: ChoiceIdSchema,
    rationale: z.string().min(1),
    choiceRationale: z.string().min(1).nullable(),
  })
  .strict();
export type PracticeResult = z.infer<typeof PracticeResultSchema>;

export const WrappedViewSchema = z
  .object({
    dayNumber: z.number().int().positive(),
    skillsTouched: z.number().int().nonnegative(),
    skillsGlowing: z.number().int().nonnegative(),
    evidenceCounts: z.record(z.string(), z.number().int().nonnegative()),
    repairsCompleted: z.number().int().nonnegative(),
    protectedPassed: z.number().int().nonnegative(),
  })
  .strict();
export type WrappedView = z.infer<typeof WrappedViewSchema>;
