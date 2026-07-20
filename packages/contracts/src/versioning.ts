import { z } from 'zod';

/**
 * Every consequential decision records the versions that produced it, so derived
 * state can be recomputed and audited deterministically.
 */
export const PolicyVersionSchema = z.object({
  policyId: z.string().min(1),
  version: z.string().min(1),
});
export type PolicyVersion = z.infer<typeof PolicyVersionSchema>;

export const VersionEnvelopeSchema = z.object({
  /** API contract namespace, e.g. "v1". */
  api: z.literal('v1'),
  /** Active content release the client/server agreed on. */
  contentRelease: z.string().min(1),
  /** Policy manifests that interpreted this payload (diagnostic, planner, mastery, ...). */
  policies: z.array(PolicyVersionSchema),
});
export type VersionEnvelope = z.infer<typeof VersionEnvelopeSchema>;

/** Lifecycle status shared by policy manifests and content records. */
export const LifecycleStatusSchema = z.enum([
  'simulation_only',
  'shadow',
  'provisional_active',
  'validated_active',
  'withdrawn',
]);
export type LifecycleStatus = z.infer<typeof LifecycleStatusSchema>;
