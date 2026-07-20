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

/** Learner-visible mastery states (see policies for the underlying evidence track). */
export const MasteryStateSchema = z.enum([
  'not_assessed',
  'foundation_needed',
  'learning',
  'independent',
  'retained',
  'strong',
  'exam_ready_now',
]);
export type MasteryState = z.infer<typeof MasteryStateSchema>;

/** `refresh_needed` is an overlay on the achieved state, not a base state. */
export const RefreshOverlaySchema = z.boolean();

/** Assistance ladder: A3 worked model → A0 fully independent. */
export const AssistanceLevelSchema = z.enum(['A3', 'A2', 'A1', 'A0']);
export type AssistanceLevel = z.infer<typeof AssistanceLevelSchema>;

/** FSRS review ratings. */
export const ReviewRatingSchema = z.enum(['again', 'hard', 'good', 'easy']);
export type ReviewRating = z.infer<typeof ReviewRatingSchema>;
