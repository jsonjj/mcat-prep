import { daysBetween, type UtcTimestamp } from '@mcat/contracts';
import {
  isMasteryEligible,
  type BaseMasteryState,
  type DecisionReason,
  type EvidenceKind,
  type EvidenceRecipe,
  type EvidenceRecord,
  type MasteryReason,
  type MasterySkillState,
  type RecipeSlot,
} from '@mcat/domain';
import type { PolicyManifest } from './manifest';

export const MASTERY_MANIFEST: PolicyManifest = {
  policyId: 'mastery',
  version: 'provisional-v1',
  status: 'provisional_active',
  summary:
    'Cumulative evidence recipes through Strong; freshness overlays Refresh Needed without erasing history.',
};

export interface MasteryConfig {
  freshnessDaysGeneral: number;
  freshnessDaysStrong: number;
  recipes: EvidenceRecipe[];
}

const STRONG_KINDS: ReadonlySet<EvidenceKind> = new Set<EvidenceKind>([
  'integrated_passage',
  'timed',
  'protected',
]);

export const MASTERY_CONFIG: MasteryConfig = {
  freshnessDaysGeneral: 45,
  freshnessDaysStrong: 21,
  recipes: [
    { target: 'independent', slots: [{ kind: 'independent', minFamilies: 2 }] },
    {
      target: 'transfer' as BaseMasteryState, // 'transfer' maps onto the ladder position of retained-precursor
      slots: [
        { kind: 'independent', minFamilies: 2 },
        { kind: 'transfer', minFamilies: 2, changeDimensions: 2 },
      ],
    },
    {
      target: 'retained',
      slots: [
        { kind: 'independent', minFamilies: 2 },
        { kind: 'transfer', minFamilies: 2, changeDimensions: 2 },
        { kind: 'delayed', minFamilies: 1, minDelayHours: 48 },
        { kind: 'mixed', minFamilies: 1 },
      ],
    },
    {
      target: 'strong',
      slots: [
        { kind: 'independent', minFamilies: 2 },
        { kind: 'transfer', minFamilies: 2, changeDimensions: 2 },
        { kind: 'delayed', minFamilies: 1, minDelayHours: 48 },
        { kind: 'mixed', minFamilies: 1 },
        { kind: 'integrated_passage', minFamilies: 1 },
        { kind: 'timed', minFamilies: 1 },
        { kind: 'protected', minFamilies: 1 },
      ],
    },
  ],
};

const windowForKind = (kind: EvidenceKind, cfg: MasteryConfig): number =>
  STRONG_KINDS.has(kind) ? cfg.freshnessDaysStrong : cfg.freshnessDaysGeneral;

const isFresh = (e: EvidenceRecord, now: UtcTimestamp, cfg: MasteryConfig): boolean =>
  daysBetween(e.occurredAt, now) <= windowForKind(e.kind, cfg);

function satisfiesSlot(records: EvidenceRecord[], slot: RecipeSlot): boolean {
  const forKind = records.filter((r) => r.kind === slot.kind);
  const families = new Set(forKind.map((r) => r.familyId));
  if (families.size < slot.minFamilies) return false;

  if (slot.minDelayHours !== undefined) {
    const hasDelayed = forKind.some((r) => (r.delayHours ?? 0) >= slot.minDelayHours!);
    if (!hasDelayed) return false;
  }

  if (slot.changeDimensions !== undefined) {
    const dims = new Set<string>();
    for (const r of forKind) for (const d of r.changeDimensions) dims.add(d);
    if (dims.size < slot.changeDimensions) return false;
  }

  return true;
}

function highestSatisfied(records: EvidenceRecord[], cfg: MasteryConfig): BaseMasteryState | null {
  // Evaluate from most to least demanding.
  for (let i = cfg.recipes.length - 1; i >= 0; i -= 1) {
    const recipe = cfg.recipes[i]!;
    if (recipe.slots.every((slot) => satisfiesSlot(records, slot))) {
      // 'transfer' is a precursor label; on the visible ladder it reads as 'independent'
      // achieved with transfer evidence — surface it as 'independent' unless retained+.
      return recipe.target === ('transfer' as BaseMasteryState) ? 'independent' : recipe.target;
    }
  }
  return null;
}

export interface MasteryInput {
  skillId: string;
  records: EvidenceRecord[];
  now: UtcTimestamp;
  prerequisiteBlocked?: boolean;
  hasInstruction?: boolean;
}

export function evaluateMastery(input: MasteryInput, cfg: MasteryConfig = MASTERY_CONFIG): MasterySkillState {
  const reasons: DecisionReason<MasteryReason>[] = [];
  const eligible = input.records.filter(isMasteryEligible);

  if (input.prerequisiteBlocked) {
    return {
      skillId: input.skillId,
      base: 'foundation_needed',
      refreshNeeded: false,
      supportingEvidenceIds: [],
      freshestByKind: {},
      reasons: [{ code: 'PREREQUISITE_BLOCKED' }],
      policyVersion: MASTERY_MANIFEST.version,
    };
  }

  // Achieved-ever (history preserved) vs currently-fresh.
  const everBase = highestSatisfied(eligible, cfg);
  const freshEligible = eligible.filter((e) => isFresh(e, input.now, cfg));
  const freshBase = highestSatisfied(freshEligible, cfg);

  // Any activity at all (assisted practice, simulation, retries, instruction) places
  // the learner at least at `learning`; `not_assessed` means no records whatsoever.
  const hasAnyActivity = input.records.some((r) => r.valid) || input.hasInstruction === true;

  let base: BaseMasteryState;
  if (everBase !== null) {
    base = everBase;
    reasons.push({ code: `${everBase.toUpperCase()}_ACHIEVED` as MasteryReason });
  } else if (hasAnyActivity) {
    base = 'learning';
    reasons.push({ code: 'DEPENDS_ON_INSTRUCTION' });
  } else {
    base = 'not_assessed';
    reasons.push({ code: 'NO_USEFUL_EVIDENCE' });
  }

  // Fresh failure: a valid, independent, incorrect attempt more recent than supporting success.
  const latestEligibleSeq = eligible.reduce((m, e) => Math.max(m, e.sequence), -1);
  const hasFreshFailure = input.records.some(
    (r) => r.valid && r.independent && r.outcome === 'incorrect' && r.sequence > latestEligibleSeq,
  );

  const stale = everBase !== null && (freshBase === null || freshBase !== everBase);
  const refreshNeeded = everBase !== null && everBase !== 'not_assessed' && (stale || hasFreshFailure);
  if (refreshNeeded) {
    reasons.push({ code: hasFreshFailure ? 'FRESH_FAILURE' : 'EVIDENCE_STALE' });
  }

  const freshestByKind: Partial<Record<EvidenceKind, UtcTimestamp>> = {};
  for (const e of eligible) {
    const current = freshestByKind[e.kind];
    if (current === undefined || Date.parse(e.occurredAt) > Date.parse(current)) {
      freshestByKind[e.kind] = e.occurredAt;
    }
  }

  return {
    skillId: input.skillId,
    base,
    refreshNeeded,
    supportingEvidenceIds: eligible.map((e) => e.evidenceId),
    freshestByKind,
    reasons,
    policyVersion: MASTERY_MANIFEST.version,
  };
}
