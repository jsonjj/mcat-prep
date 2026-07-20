import { z } from 'zod';
import { AssistanceLevelSchema, ContentIdSchema } from '@mcat/contracts';

/** Instructional content records (lessons, hints, recall, simulations). All versioned + reviewable. */

export const LessonBlockSchema = z.object({
  kind: z.enum(['model', 'contrast', 'worked_example', 'checklist']),
  heading: z.string().min(1),
  body: z.array(z.string().min(1)).min(1),
});

export const LessonSchema = z.object({
  id: ContentIdSchema,
  skillId: z.string().min(1),
  title: z.string().min(1),
  blocks: z.array(LessonBlockSchema).min(1),
  test_only: z.boolean().default(false),
});
export type Lesson = z.infer<typeof LessonSchema>;

export const HintSchema = z.object({
  level: AssistanceLevelSchema, // A3 most help → A1 minimal cue
  text: z.string().min(1),
  /** Content-bearing hints contaminate independence for that item. */
  contentBearing: z.boolean(),
});

export const HintLadderSchema = z.object({
  questionId: ContentIdSchema,
  hints: z.array(HintSchema).min(1),
});
export type HintLadder = z.infer<typeof HintLadderSchema>;

export const RecallPromptSchema = z.object({
  id: ContentIdSchema,
  skillId: z.string().min(1),
  format: z.enum(['typed_recall', 'equation', 'vocabulary', 'claim_evidence']),
  prompt: z.string().min(1),
  /** Accepted answers (lowercased, trimmed) for objective grading. */
  acceptedAnswers: z.array(z.string().min(1)).min(1),
  explanation: z.string().min(1),
  test_only: z.boolean().default(false),
});
export type RecallPrompt = z.infer<typeof RecallPromptSchema>;

export const SimulationVariableSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  min: z.number(),
  max: z.number(),
  step: z.number().positive(),
  unit: z.string().optional(),
});

export const SimulationSpecSchema = z.object({
  id: ContentIdSchema,
  skillId: z.string().min(1),
  title: z.string().min(1),
  /** Prediction the learner commits to before manipulating. */
  predictionPrompt: z.string().min(1),
  variables: z.array(SimulationVariableSchema).min(1),
  observationLabel: z.string().min(1),
  /** The plain, unseen transfer question that alone can support mastery. */
  transferQuestionId: ContentIdSchema,
  /** The academically-equivalent direct (non-graphical) route description. */
  directRoute: z.object({
    summary: z.string().min(1),
    steps: z.array(z.string().min(1)).min(1),
  }),
  test_only: z.boolean().default(false),
});
export type SimulationSpec = z.infer<typeof SimulationSpecSchema>;
