import type { LifecycleStatus, PolicyVersion } from '@mcat/contracts';

/**
 * Every policy exports a manifest. Lifecycle gates which policies may drive
 * learner-visible outcomes: `simulation_only`/`shadow` cannot; `provisional_active`
 * may with clear "provisional" framing; `validated_active` may make firm claims.
 */
export interface PolicyManifest {
  readonly policyId: string;
  readonly version: string;
  readonly status: LifecycleStatus;
  readonly summary: string;
}

export const asPolicyVersion = (m: PolicyManifest): PolicyVersion => ({
  policyId: m.policyId,
  version: m.version,
});
