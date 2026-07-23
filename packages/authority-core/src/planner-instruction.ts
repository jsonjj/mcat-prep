import { deterministicJson } from '@mcat/content';
import {
  PlannerInstructionResolutionSchema,
  type CanonicalPlannerResolutionReasonCode,
  type LessonRunPins,
  type PlannerInstructionResolution,
  type ValidatedPlannerInstruction,
} from '@mcat/contracts';

export type PlannerInstructionAcceptance =
  | {
      kind: 'accepted';
      validated: ValidatedPlannerInstruction;
    }
  | {
      kind: 'rejected';
      resolutionId: string | null;
      kcId: string | null;
      reasonCodes: CanonicalPlannerResolutionReasonCode[];
    };

export interface PlannerInstructionAcceptanceContext {
  pins: LessonRunPins;
  now: string;
  priorResolution: PlannerInstructionResolution | null;
}

const routeToRuntime = (
  route: PlannerInstructionResolution['requestedRoute'],
): ValidatedPlannerInstruction['effectiveRoute'] =>
  route === 'prerequisite_support' ? 'prerequisite' : route;

const prerequisiteQualified = (
  resolution: PlannerInstructionResolution,
): boolean => {
  const candidate = resolution.prerequisiteCandidate;
  if (!candidate || candidate.edgeKind !== 'hard_prerequisite') return false;
  const qualification = candidate.qualification;
  const observations = resolution.directPointOfUseObservations.filter(
    (observation) =>
      observation.predecessorKcId === candidate.predecessorKcId &&
      observation.edgeId === candidate.edgeId &&
      observation.pointOfUseId === candidate.pointOfUseId &&
      observation.valid &&
      observation.assistanceLevel === 'A0' &&
      !observation.contentBearingHintUsed &&
      ['failed', 'uncertain'].includes(observation.outcome),
  );
  return (
    qualification.status === 'qualified' &&
    qualification.allEvidenceValid &&
    qualification.observedDistinctFamilies >= qualification.requiredDistinctFamilies &&
    new Set(observations.map((observation) => observation.familyId)).size >=
      qualification.requiredDistinctFamilies
  );
};

const lineageReplayable = (
  resolution: PlannerInstructionResolution,
  prior: PlannerInstructionResolution | null,
): boolean => {
  if (prior === null) {
    return (
      resolution.supersession.generation === 0 &&
      resolution.supersession.rootResolutionId === resolution.resolutionId &&
      resolution.supersession.supersedesResolutionId === null
    );
  }
  return (
    resolution.supersession.generation === prior.supersession.generation + 1 &&
    resolution.supersession.rootResolutionId === prior.supersession.rootResolutionId &&
    resolution.supersession.supersedesResolutionId === prior.resolutionId &&
    Date.parse(resolution.evidenceCutoff) >= Date.parse(prior.evidenceCutoff)
  );
};

const guessedIdentity = (
  input: unknown,
): { resolutionId: string | null; kcId: string | null } => {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return { resolutionId: null, kcId: null };
  }
  const record = input as Record<string, unknown>;
  return {
    resolutionId: typeof record.resolutionId === 'string' ? record.resolutionId : null,
    kcId: typeof record.kcId === 'string' ? record.kcId : null,
  };
};

/**
 * Accepts only a replayable planner instruction. Entry-probe observations are
 * deliberately absent from this function and can never select the initial route.
 */
export function acceptPlannerInstructionResolution(
  input: unknown,
  context: PlannerInstructionAcceptanceContext,
): PlannerInstructionAcceptance {
  if (input === undefined || input === null) {
    return {
      kind: 'rejected',
      resolutionId: null,
      kcId: null,
      reasonCodes: ['RESOLUTION_MISSING'],
    };
  }
  const parsed = PlannerInstructionResolutionSchema.safeParse(input);
  if (!parsed.success) {
    return {
      kind: 'rejected',
      ...guessedIdentity(input),
      reasonCodes: ['RESOLUTION_CONTRACT_INVALID'],
    };
  }
  const resolution = parsed.data;
  const { pins } = context;
  const fatal: CanonicalPlannerResolutionReasonCode[] = [];
  if (resolution.resolutionId !== pins.plannerResolutionId) {
    fatal.push('RESOLUTION_IDENTITY_MISMATCH');
  }
  if (resolution.learnerId !== pins.learnerId) fatal.push('LEARNER_IDENTITY_MISMATCH');
  if (resolution.lessonId !== pins.lessonId) fatal.push('LESSON_IDENTITY_MISMATCH');
  if (resolution.kcId !== pins.targetKcId) fatal.push('KC_IDENTITY_MISMATCH');
  if (resolution.taskKind === 'diagnostic_probe') {
    fatal.push('DIAGNOSTIC_PROBE_FORBIDDEN');
  } else if (resolution.taskKind !== pins.taskKind) {
    fatal.push('TASK_KIND_MISMATCH');
  }
  if (
    resolution.definitionVersion !== pins.definitionVersion ||
    resolution.reviewedContentHash !== pins.reviewedContentHash
  ) {
    fatal.push('DEFINITION_PIN_MISMATCH');
  }
  if (deterministicJson(resolution.registry) !== deterministicJson(pins.registry)) {
    fatal.push('REGISTRY_PIN_MISMATCH');
  }
  if (deterministicJson(resolution.policies) !== deterministicJson(pins.policies)) {
    fatal.push('POLICY_PIN_MISMATCH');
  }
  if (resolution.evidenceCutoff !== pins.evidenceCutoff) {
    fatal.push('EVIDENCE_CUTOFF_MISMATCH');
  }
  if (Date.parse(resolution.expiresAt) <= Date.parse(context.now)) {
    fatal.push('RESOLUTION_EXPIRED');
  }
  if (!lineageReplayable(resolution, context.priorResolution)) {
    fatal.push('SUPERSESSION_LINEAGE_UNREPLAYABLE');
  }
  if (fatal.length > 0) {
    return {
      kind: 'rejected',
      resolutionId: resolution.resolutionId,
      kcId: resolution.kcId,
      reasonCodes: fatal,
    };
  }

  const downgrade: CanonicalPlannerResolutionReasonCode[] = [];
  const provenance = resolution.diagnosticProvenance;
  if (resolution.requestedRoute === 'concise') {
    if (provenance.freshness === 'stale') downgrade.push('CONCISE_PROVENANCE_STALE');
    if (
      provenance.conflict ||
      provenance.decisionClass !== 'concise_eligible' ||
      provenance.recommendedAction !== 'deliver_concise_instruction'
    ) {
      downgrade.push('CONCISE_PROVENANCE_CONFLICTING');
    }
  }
  if (resolution.requestedRoute === 'misconception') {
    if (provenance.freshness === 'stale') {
      downgrade.push('MISCONCEPTION_PROVENANCE_STALE');
    }
    if (
      provenance.conflict ||
      provenance.decisionClass !== 'misconception_hypothesis' ||
      provenance.recommendedAction !== 'deliver_misconception_repair'
    ) {
      downgrade.push('MISCONCEPTION_PROVENANCE_CONFLICTING');
    }
  }

  let supportReturnedToPlanner = false;
  let blockedForPredecessor = false;
  if (resolution.requestedRoute === 'prerequisite_support') {
    if (!prerequisiteQualified(resolution)) {
      downgrade.push('PREREQUISITE_QUALIFICATION_INVALID');
      downgrade.push('PREREQUISITE_SUPPORT_RETURNED_TO_PLANNER');
      supportReturnedToPlanner = true;
    } else {
      const selected = resolution.blockingCandidates.find(
        (candidate) =>
          candidate.candidateId === resolution.selectedBlockingCandidateId,
      );
      blockedForPredecessor = selected?.gapClass === 'blocking_predecessor';
    }
  }

  const downgraded = downgrade.length > 0;
  return {
    kind: 'accepted',
    validated: {
      resolution,
      disposition: downgraded ? 'downgraded' : 'accepted',
      effectiveRoute: downgraded ? 'standard' : routeToRuntime(resolution.requestedRoute),
      reasonCodes: downgraded ? downgrade : ['ACCEPTED'],
      supportReturnedToPlanner,
      blockedForPredecessor,
    },
  };
}
