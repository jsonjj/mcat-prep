import { z } from 'zod';
import { OperationTagSchema, SectionSchema, SkillClusterSchema } from '@mcat/contracts';

/**
 * Types for the internal skill graph. The *data* (which skills, which edges)
 * lives in `content/curriculum` and is loaded as a versioned record; these are
 * the shapes the engine reasons over.
 */

export const SkillEdgeKindSchema = z.enum([
  'hard_prerequisite', // directed, acyclic; blocks productive work
  'soft_prerequisite', // advisory ordering only
  'confusable_with', // symmetric; supports purposeful interleaving
  'section_application', // requires domain-specific use
  'transfer_variant', // construct-preserving changed task
]);
export type SkillEdgeKind = z.infer<typeof SkillEdgeKindSchema>;

export const SkillEdgeSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  kind: SkillEdgeKindSchema,
});
export type SkillEdge = z.infer<typeof SkillEdgeSchema>;

export const SkillDefinitionSchema = z.object({
  skillId: z.string().min(1),
  cluster: SkillClusterSchema,
  title: z.string().min(1),
  /** One observable knowledge-in-use objective. */
  objective: z.string().min(1),
  sections: z.array(SectionSchema).min(1),
  operations: z.array(OperationTagSchema).min(1),
  /** Blueprint coverage references (not links to copied official items). */
  blueprintRefs: z.array(z.string()).default([]),
  commonConfusions: z.array(z.string()).default([]),
  /** Whether this skill is required for curriculum coverage or a prerequisite/support skill. */
  scope: z.enum(['required', 'prerequisite', 'supporting']).default('required'),
});
export type SkillDefinition = z.infer<typeof SkillDefinitionSchema>;

export const SkillGraphSchema = z.object({
  version: z.string().min(1),
  skills: z.array(SkillDefinitionSchema),
  edges: z.array(SkillEdgeSchema),
});
export type SkillGraph = z.infer<typeof SkillGraphSchema>;

/** Detect a cycle among hard-prerequisite edges (must be a DAG). Returns a cycle path or null. */
export function findHardPrerequisiteCycle(graph: SkillGraph): string[] | null {
  const adjacency = new Map<string, string[]>();
  for (const skill of graph.skills) adjacency.set(skill.skillId, []);
  for (const edge of graph.edges) {
    if (edge.kind !== 'hard_prerequisite') continue;
    const list = adjacency.get(edge.from);
    if (list) list.push(edge.to);
  }

  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map<string, number>();
  const parent = new Map<string, string | null>();
  for (const id of adjacency.keys()) color.set(id, WHITE);

  const buildCycle = (start: string, end: string): string[] => {
    const path = [end];
    let current: string | null = start;
    while (current !== null && current !== end) {
      path.push(current);
      current = parent.get(current) ?? null;
    }
    path.push(end);
    return path.reverse();
  };

  const stack: Array<{ node: string; iterator: number }> = [];
  for (const root of adjacency.keys()) {
    if (color.get(root) !== WHITE) continue;
    parent.set(root, null);
    stack.push({ node: root, iterator: 0 });
    color.set(root, GRAY);
    while (stack.length > 0) {
      const frame = stack[stack.length - 1]!;
      const neighbors = adjacency.get(frame.node) ?? [];
      if (frame.iterator < neighbors.length) {
        const next = neighbors[frame.iterator]!;
        frame.iterator += 1;
        const c = color.get(next) ?? WHITE;
        if (c === GRAY) return buildCycle(frame.node, next);
        if (c === WHITE) {
          parent.set(next, frame.node);
          color.set(next, GRAY);
          stack.push({ node: next, iterator: 0 });
        }
      } else {
        color.set(frame.node, BLACK);
        stack.pop();
      }
    }
  }
  return null;
}
