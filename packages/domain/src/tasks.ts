import { z } from 'zod';
import { SkillClusterSchema } from '@mcat/contracts';
import { PLANNER_REASONS } from './reason-codes';

export const TaskTypeSchema = z.enum([
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
]);
export type TaskType = z.infer<typeof TaskTypeSchema>;

export const TaskStatusSchema = z.enum([
  'ready',
  'in_progress',
  'blocked',
  'complete',
  'snoozed',
  'needs_connection',
]);
export type TaskStatus = z.infer<typeof TaskStatusSchema>;

export const StudyWindowSchema = z.enum(['morning', 'midday', 'evening']);
export type StudyWindow = z.infer<typeof StudyWindowSchema>;

export const TaskSchema = z.object({
  taskId: z.string().min(1),
  type: TaskTypeSchema,
  title: z.string().min(1),
  skillId: z.string().optional(),
  cluster: SkillClusterSchema.optional(),
  estimatedMinutes: z.number().int().positive(),
  /** Why the planner surfaced this task (audit + "Why this now?"). */
  priorityReason: z.enum(PLANNER_REASONS),
  reasonDetail: z.string().optional(),
  dependencyTaskId: z.string().optional(),
  status: TaskStatusSchema,
  window: StudyWindowSchema.optional(),
  /** Requires connectivity (diagnostic, protected assessment). */
  requiresConnection: z.boolean().default(false),
});
export type Task = z.infer<typeof TaskSchema>;

export const CapacityLabelSchema = z.enum(['on_track', 'tight', 'goal_plan_mismatch', 'rolling']);
export type CapacityLabel = z.infer<typeof CapacityLabelSchema>;

export const DayPlanSchema = z.object({
  date: z.string(), // YYYY-MM-DD (learner local)
  tasks: z.array(TaskSchema),
  /** Fraction of study time reserved for due review (0.20–0.30 target). */
  reviewSharePct: z.number().min(0).max(1),
});
export type DayPlan = z.infer<typeof DayPlanSchema>;

export const StudyPlanSchema = z.object({
  version: z.number().int().nonnegative(),
  generatedAt: z.string(),
  capacityLabel: CapacityLabelSchema,
  days: z.array(DayPlanSchema),
  /** The single highest-priority "Continue" target task id, if any. */
  continueTaskId: z.string().optional(),
});
export type StudyPlan = z.infer<typeof StudyPlanSchema>;
