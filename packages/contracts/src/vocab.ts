import { z } from 'zod';

/**
 * Controlled vocabulary shared across domain, policies, content, and UI.
 * These are stable enums; changing them is a versioned migration.
 */

/** The four MCAT sections (content sections, lowercase). */
export const SectionSchema = z.enum(['cp', 'cars', 'bb', 'ps']);
export type Section = z.infer<typeof SectionSchema>;

/** The 15 learner-facing skill clusters. */
export const SkillClusterSchema = z.enum([
  'R1',
  'R2',
  'R3',
  'CP1',
  'CP2',
  'CP3',
  'BB1',
  'BB2',
  'BB3',
  'BB4',
  'PS1',
  'PS2',
  'PS3',
  'CA1',
  'CA2',
]);
export type SkillCluster = z.infer<typeof SkillClusterSchema>;

export const SKILL_CLUSTERS: readonly SkillCluster[] = SkillClusterSchema.options;

export interface ClusterInfo {
  readonly cluster: SkillCluster;
  readonly title: string;
  readonly section: Section;
  readonly tested: string;
}

/** Learner-facing titles (understandable layer). */
export const CLUSTER_INFO: Readonly<Record<SkillCluster, ClusterInfo>> = {
  R1: { cluster: 'R1', title: 'Quantitative Reasoning', section: 'cp', tested: 'Relationships, calculations, estimation, units, and signs' },
  R2: { cluster: 'R2', title: 'Data and Representations', section: 'cp', tested: 'Graphs, tables, diagrams, equations, and translating between them' },
  R3: { cluster: 'R3', title: 'Experiments and Evidence', section: 'cp', tested: 'Variables, controls, comparisons, causality, evidence, and claim scope' },
  CP1: { cluster: 'CP1', title: 'Mechanics and Fluids', section: 'cp', tested: 'Motion, forces, energy, momentum, pressure, flow, and buoyancy' },
  CP2: { cluster: 'CP2', title: 'Electricity, Waves, and Optics', section: 'cp', tested: 'Circuits, fields, magnetism, sound, light, and optical systems' },
  CP3: { cluster: 'CP3', title: 'Chemical Systems', section: 'cp', tested: 'Atomic structure, bonding, solutions, acids, reactions, equilibrium, organic chemistry, and lab methods' },
  BB1: { cluster: 'BB1', title: 'Biomolecules and Metabolism', section: 'bb', tested: 'Proteins, enzymes, inhibition, metabolism, and bioenergetics' },
  BB2: { cluster: 'BB2', title: 'Cells and Genetics', section: 'bb', tested: 'Cells, membranes, transport, inheritance, gene expression, and biotechnology' },
  BB3: { cluster: 'BB3', title: 'Signaling and Organ Systems', section: 'bb', tested: 'Signaling, homeostasis, nervous, endocrine, cardiovascular, respiratory, renal, and digestive systems' },
  BB4: { cluster: 'BB4', title: 'Immunity and Development', section: 'bb', tested: 'Immune responses, reproduction, development, and hormonal control' },
  PS1: { cluster: 'PS1', title: 'Research and Statistics', section: 'ps', tested: 'Study design, measurement, bias, data interpretation, and causal claims' },
  PS2: { cluster: 'PS2', title: 'Mind and Behavior', section: 'ps', tested: 'Sensation, learning, memory, cognition, emotion, motivation, and mental health' },
  PS3: { cluster: 'PS3', title: 'People and Society', section: 'ps', tested: 'Identity, personality, social influence, culture, institutions, inequality, and health' },
  CA1: { cluster: 'CA1', title: 'Passage Structure and Evidence', section: 'cars', tested: 'Thesis, paragraph function, claims, textual evidence, tone, and perspective' },
  CA2: { cluster: 'CA2', title: 'Inference and Argument', section: 'cars', tested: 'Assumptions, scope, argument strength, application, synthesis, distractors, and timing' },
};

/** Thematic (NOT neuroscientifically literal) brain-region mapping for navigation. */
export const BRAIN_REGION_BY_CLUSTER: Readonly<Record<SkillCluster, string>> = {
  R1: 'parietal-lobe',
  R2: 'occipital-lobe',
  R3: 'cingulate-cortex',
  CP1: 'basal-ganglia',
  CP2: 'midbrain',
  CP3: 'thalamus',
  BB1: 'hypothalamus',
  BB2: 'corpus-callosum',
  BB3: 'medulla-oblongata',
  BB4: 'pons',
  PS1: 'frontal-lobe',
  PS2: 'amygdala',
  PS3: 'insular-cortex',
  CA1: 'hippocampus',
  CA2: 'temporal-lobe',
};

/** Operation templates: what the learner must *do* with knowledge. */
export const OperationTagSchema = z.enum(['K', 'Q', 'E', 'D', 'P', 'A', 'I', 'T']);
export type OperationTag = z.infer<typeof OperationTagSchema>;

/**
 * The 7 reasoning operations — the learner-facing "skill" axis tracked by the
 * mastery engine (BKT `P(L)` per operation) and shown on the Skills page. AAMC's
 * four SIRS skills are the reporting frame, but SIRS2 (~45% of the exam) is split
 * into its four real operations (PREDICT/EXPLAIN/RELATE/QUANTIFY); SIRS1/3/4 map
 * one-to-one. See docs/mastery-pipeline.md §6.
 */
export const ReasoningOperationSchema = z.enum([
  'IDENTIFY',
  'PREDICT',
  'EXPLAIN',
  'RELATE',
  'QUANTIFY',
  'DESIGN',
  'EVIDENCE',
]);
export type ReasoningOperation = z.infer<typeof ReasoningOperationSchema>;

export const REASONING_OPERATIONS: readonly ReasoningOperation[] = ReasoningOperationSchema.options;

export interface ReasoningOperationInfo {
  readonly operation: ReasoningOperation;
  readonly title: string;
  /** Closest AAMC skill anchor (reporting frame). */
  readonly aamc: string;
  readonly description: string;
}

export const REASONING_OPERATION_INFO: Readonly<Record<ReasoningOperation, ReasoningOperationInfo>> = {
  IDENTIFY: { operation: 'IDENTIFY', title: 'Identify', aamc: 'Skill 1', description: 'Recognize, recall, or define the concept a scenario shows.' },
  PREDICT: { operation: 'PREDICT', title: 'Predict', aamc: 'SIRS2', description: 'Given a perturbation, work forward to what happens (cause → effect).' },
  EXPLAIN: { operation: 'EXPLAIN', title: 'Explain', aamc: 'SIRS2', description: 'Given an observation, work backward to the mechanism (why).' },
  RELATE: { operation: 'RELATE', title: 'Relate', aamc: 'SIRS2', description: 'Map entity ↔ role or compare two cases (relational reasoning).' },
  QUANTIFY: { operation: 'QUANTIFY', title: 'Quantify', aamc: 'Skill 1/2', description: 'Pick and run the right relationship (select + compute).' },
  DESIGN: { operation: 'DESIGN', title: 'Design', aamc: 'Skill 3', description: 'Judge or choose a method or study (controls, confounds, validity).' },
  EVIDENCE: { operation: 'EVIDENCE', title: 'Evidence', aamc: 'Skill 4', description: 'Decide what the data licenses (interpretation of results).' },
};

/**
 * The three AAMC CARS skills, tracked separately as IRT abilities (not BKT). The
 * question bank already tags these as `CARS_FOC / CARS_RWT / CARS_RBT`.
 */
export const CarsSkillSchema = z.enum(['FOC', 'RWT', 'RBT']);
export type CarsSkill = z.infer<typeof CarsSkillSchema>;

export const CARS_SKILLS: readonly CarsSkill[] = CarsSkillSchema.options;

export const CARS_SKILL_INFO: Readonly<Record<CarsSkill, { readonly skill: CarsSkill; readonly title: string }>> = {
  FOC: { skill: 'FOC', title: 'Foundations of Comprehension' },
  RWT: { skill: 'RWT', title: 'Reasoning Within the Text' },
  RBT: { skill: 'RBT', title: 'Reasoning Beyond the Text' },
};

/** Item formats. */
export const QuestionFormatSchema = z.enum([
  'discrete_mcq',
  'passage_mcq',
  'graph_mcq',
  'experiment_mcq',
]);
export type QuestionFormat = z.infer<typeof QuestionFormatSchema>;

/** Distractor-family hypotheses (investigation prompts, never certain diagnoses). */
export const DistractorFamilySchema = z.enum([
  'missing_knowledge',
  'wrong_relationship',
  'unit_or_sign',
  'calculation',
  'graph_or_data',
  'experimental_design',
  'misread_condition',
  'scope_or_relevance',
  'outside_knowledge',
  'pacing_or_guess',
  'answer_change',
  'other',
]);
export type DistractorFamily = z.infer<typeof DistractorFamilySchema>;

/**
 * The historical evidence ladder is DELETED from this package, not merely unused.
 * It was a seven-member ordinal (`not_assessed` … `exam_ready_now`) exported as
 * `MasteryStateSchema`, and a dormant ordinal on the public contract surface is
 * one import away from becoming a second mastery scale.
 *
 * Capability is BKT's `SkillMasteryView.pL` / `atCapabilityCut`; the warrant crosses the
 * wire only as `EVIDENCE_REASON_CODES`. The ordinal tier itself stays behind the
 * private `Authority.skillWarrants` as `EVIDENCE_QUALITY_TIERS`
 * (`packages/domain/src/mastery.ts`) and has no mirror here on purpose.
 *
 * `tests/architecture/contracts-ladder-ban.test.ts` fails if any ladder returns
 * to `packages/contracts` under any name.
 */

/** Assistance ladder: A3 worked model → A0 fully independent. */
export const AssistanceLevelSchema = z.enum(['A3', 'A2', 'A1', 'A0']);
export type AssistanceLevel = z.infer<typeof AssistanceLevelSchema>;

/** FSRS review ratings. */
export const ReviewRatingSchema = z.enum(['again', 'hard', 'good', 'easy']);
export type ReviewRating = z.infer<typeof ReviewRatingSchema>;
