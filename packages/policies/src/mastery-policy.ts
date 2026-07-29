/**
 * Evidence-warrant policy.
 *
 * This policy answers "how good and how current is the evidence behind this
 * skill, and what is still missing?" — independence, item-family diversity,
 * transfer breadth, delayed retention, mixed/passage/timed/protected conditions,
 * freshness windows, and explicit recipe gaps.
 *
 * It does NOT define capability. `P(L)`, decay, review-due, the learner-facing
 * mastery percentage and the 0.95 threshold belong to the BKT engine (./bkt.ts,
 * ./forgetting.ts). Planners consume the two as SEPARATE signals: the estimate
 * ("P(L) is 0.94") and the warrant ("transfer and delayed evidence are missing").
 *
 * The recipe mechanics below (slot satisfaction, family counting, change
 * dimensions, delay thresholds, freshness windows, fresh-failure detection) are
 * unchanged; only what the policy PUBLISHES has been reframed.
 */
import { daysBetween, type UtcTimestamp } from '@mcat/contracts';
import {
  isMasteryEligible,
  type DecisionReason,
  type EvidenceGap,
  type EvidenceGapReason,
  type EvidenceKind,
  type EvidenceQualityTier,
  type EvidenceRecipe,
  type EvidenceRecord,
  type EvidenceReason,
  type EvidenceSlotStatus,
  type RecipeSlot,
  type SkillEvidenceState,
} from '@mcat/domain';
import type { PolicyManifest } from './manifest';

export const EVIDENCE_WARRANT_MANIFEST: PolicyManifest = {
  policyId: 'evidence-warrant',
  version: 'evidence-warrant-v2',
  status: 'provisional_active',
  summary:
    'Evidence warrant: cumulative recipe slots (independence, family diversity, transfer, delayed, mixed/passage/timed/protected), freshness overlay, and explicit gaps. Does not define capability — BKT owns P(L) and the mastery threshold.',
};

/**
 * A recipe, plus a policy-local NAME.
 *
 * The name exists because two recipes can legitimately publish the same tier —
 * a stricter route to the same claim — and the tier alone can then no longer
 * identify which recipe is meant. Naming them was the alternative to the bug
 * this replaced: `'transfer' as EvidenceQualityTier`, a cast that manufactured a
 * value the tier enum does not contain, so `evidenceQualityRank('transfer')` was
 * `undefined` and anything comparing ranks silently mis-ordered. A recipe target
 * must always be a real tier; if a route needs its own label, it gets a `name`.
 */
export interface WarrantRecipe extends EvidenceRecipe {
  readonly name: string;
}

export interface EvidenceConfig {
  freshnessDaysGeneral: number;
  freshnessDaysStrong: number;
  recipes: WarrantRecipe[];
}

const STRONG_KINDS: ReadonlySet<EvidenceKind> = new Set<EvidenceKind>([
  'integrated_passage',
  'timed',
  'protected',
]);

export const EVIDENCE_CONFIG: EvidenceConfig = {
  freshnessDaysGeneral: 45,
  freshnessDaysStrong: 21,
  recipes: [
    {
      name: 'independent',
      target: 'independent',
      slots: [{ kind: 'independent', minFamilies: 2 }],
    },
    {
      // Independence corroborated by transfer: a strictly stronger route to the
      // SAME published tier, and the precursor to `retained`. It publishes
      // `independent` because that is what it claims; there is no `transfer`
      // tier, and inventing one by cast is what broke the rank comparison.
      name: 'independent_corroborated_by_transfer',
      target: 'independent',
      slots: [
        { kind: 'independent', minFamilies: 2 },
        { kind: 'transfer', minFamilies: 2, changeDimensions: 2 },
      ],
    },
    {
      name: 'retained',
      target: 'retained',
      slots: [
        { kind: 'independent', minFamilies: 2 },
        { kind: 'transfer', minFamilies: 2, changeDimensions: 2 },
        { kind: 'delayed', minFamilies: 1, minDelayHours: 48 },
        { kind: 'mixed', minFamilies: 1 },
      ],
    },
    {
      name: 'strong',
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

const windowForKind = (kind: EvidenceKind, cfg: EvidenceConfig): number =>
  STRONG_KINDS.has(kind) ? cfg.freshnessDaysStrong : cfg.freshnessDaysGeneral;

/**
 * Freshness, with a future-dated record treated as UNTRUSTWORTHY rather than new.
 *
 * `daysBetween` is signed, so a record stamped in the future has a negative age
 * and would otherwise clear every window forever — the freshest evidence on file
 * would be the one with the most broken timestamp. Flooring the age at zero is
 * the wrong repair: age `0` reads as maximally fresh, which is the same failure
 * with a smaller number.
 *
 * A negative age cannot arise from an honest record: `occurredAt` is
 * server-bounded at ingest (`boundOccurredAtToServerTime`), so it can never
 * exceed the acceptance time that precedes any later read. If one is seen here,
 * the timestamp is wrong, and evidence with a wrong timestamp earns no freshness
 * credit. It still counts toward the achieved-ever tier, which is not
 * time-derived, and the resulting mismatch surfaces as `EVIDENCE_STALE`.
 */
const isFresh = (e: EvidenceRecord, now: UtcTimestamp, cfg: EvidenceConfig): boolean => {
  const ageDays = daysBetween(e.occurredAt, now);
  if (ageDays < 0) return false;
  return ageDays <= windowForKind(e.kind, cfg);
};

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

function highestSatisfied(
  records: EvidenceRecord[],
  cfg: EvidenceConfig,
): EvidenceQualityTier | null {
  // Evaluate from most to least demanding. Every `target` is a real tier, so the
  // result needs no remapping — the special case that used to live here existed
  // only to undo the out-of-enum `'transfer'` cast.
  for (let i = cfg.recipes.length - 1; i >= 0; i -= 1) {
    const recipe = cfg.recipes[i]!;
    if (recipe.slots.every((slot) => satisfiesSlot(records, slot))) return recipe.target;
  }
  return null;
}

/** The most demanding recipe: the full warrant whose slots are reported as gaps. */
const fullWarrant = (cfg: EvidenceConfig): WarrantRecipe => cfg.recipes[cfg.recipes.length - 1]!;

/** Why this slot is still open, from most to least specific. */
function gapReasons(records: EvidenceRecord[], slot: RecipeSlot): EvidenceGapReason[] {
  const forKind = records.filter((r) => r.kind === slot.kind);
  if (forKind.length === 0) return ['KIND_ABSENT'];

  const reasons: EvidenceGapReason[] = [];
  if (new Set(forKind.map((r) => r.familyId)).size < slot.minFamilies) {
    reasons.push('FAMILY_DIVERSITY_GAP');
  }
  if (slot.changeDimensions !== undefined) {
    const dims = new Set<string>();
    for (const r of forKind) for (const d of r.changeDimensions) dims.add(d);
    if (dims.size < slot.changeDimensions) reasons.push('CHANGE_DIMENSION_GAP');
  }
  if (
    slot.minDelayHours !== undefined &&
    !forKind.some((r) => (r.delayHours ?? 0) >= slot.minDelayHours!)
  ) {
    reasons.push('DELAY_WINDOW_GAP');
  }
  return reasons;
}

const GAP_REASON_BY_KIND: Partial<Record<EvidenceKind, EvidenceReason>> = {
  independent: 'INDEPENDENT_EVIDENCE_GAP',
  transfer: 'TRANSFER_EVIDENCE_GAP',
  delayed: 'DELAYED_EVIDENCE_GAP',
  mixed: 'MIXED_EVIDENCE_GAP',
  integrated_passage: 'PASSAGE_EVIDENCE_GAP',
  timed: 'TIMED_EVIDENCE_GAP',
  protected: 'PROTECTED_EVIDENCE_GAP',
};

const QUALITY_REASON_BY_TIER: Partial<Record<EvidenceQualityTier, EvidenceReason>> = {
  independent: 'INDEPENDENT_EVIDENCE_SATISFIED',
  retained: 'RETENTION_EVIDENCE_SATISFIED',
  strong: 'STRONG_CONDITIONS_EVIDENCE_SATISFIED',
};

interface SlotPartition {
  satisfied: EvidenceSlotStatus[];
  missing: EvidenceGap[];
}

function partitionSlots(records: EvidenceRecord[], cfg: EvidenceConfig): SlotPartition {
  const warrant = fullWarrant(cfg);
  const satisfied: EvidenceSlotStatus[] = [];
  const missing: EvidenceGap[] = [];

  for (const slot of warrant.slots) {
    const status: EvidenceSlotStatus = {
      target: warrant.target,
      kind: slot.kind,
      requiredFamilies: slot.minFamilies,
      observedFamilies: new Set(records.filter((r) => r.kind === slot.kind).map((r) => r.familyId))
        .size,
    };
    if (satisfiesSlot(records, slot)) satisfied.push(status);
    else missing.push({ ...status, reasons: gapReasons(records, slot) });
  }

  return { satisfied, missing };
}

export interface EvidenceEvaluationInput {
  skillId: string;
  records: EvidenceRecord[];
  now: UtcTimestamp;
  prerequisiteBlocked?: boolean;
  hasInstruction?: boolean;
}

/**
 * Evaluate the evidence warrant for one skill: quality tier reached, freshness,
 * satisfied and missing recipe slots, supporting evidence, and audit reasons.
 */
export function evaluateEvidence(
  input: EvidenceEvaluationInput,
  cfg: EvidenceConfig = EVIDENCE_CONFIG,
): SkillEvidenceState {
  const reasons: DecisionReason<EvidenceReason>[] = [];
  const eligible = input.records.filter(isMasteryEligible);
  const { satisfied, missing } = partitionSlots(eligible, cfg);

  if (input.prerequisiteBlocked) {
    return {
      skillId: input.skillId,
      evidenceQuality: 'foundation_needed',
      freshEvidenceQuality: null,
      refreshNeeded: false,
      satisfiedSlots: satisfied,
      missingSlots: missing,
      supportingEvidenceIds: [],
      freshestByKind: {},
      reasons: [{ code: 'PREREQUISITE_BLOCKED' }],
      policyVersion: EVIDENCE_WARRANT_MANIFEST.version,
    };
  }

  // Quality (achieved-ever, history preserved) vs freshness (currently in window).
  const everTier = highestSatisfied(eligible, cfg);
  const freshEligible = eligible.filter((e) => isFresh(e, input.now, cfg));
  const freshTier = highestSatisfied(freshEligible, cfg);

  // Any activity at all (assisted practice, simulation, retries, instruction) means
  // the evidence is instructional-only; `not_assessed` means no records whatsoever.
  const hasAnyActivity = input.records.some((r) => r.valid) || input.hasInstruction === true;

  let evidenceQuality: EvidenceQualityTier;
  if (everTier !== null) {
    evidenceQuality = everTier;
    reasons.push({ code: QUALITY_REASON_BY_TIER[everTier] ?? 'EVIDENCE_GAP' });
  } else if (hasAnyActivity) {
    evidenceQuality = 'learning';
    reasons.push({ code: 'INSTRUCTIONAL_EVIDENCE_ONLY' });
  } else {
    evidenceQuality = 'not_assessed';
    reasons.push({ code: 'NO_USEFUL_EVIDENCE' });
  }

  /**
   * Fresh failure: a valid, independent, incorrect attempt more recent than the
   * supporting success.
   *
   * `>` is load-bearing and must stay strict. A tie is not evidence of order,
   * and every channel that writes a record numbers it with the sequence its
   * command is accepted at — which is unique per learner, because the projection
   * write requires `current_sequence = sequence - 1`. So two records can only
   * tie if a producer numbered one of them wrong, and relaxing to `>=` would
   * hide that by letting genuinely simultaneous records satisfy an ordering
   * requirement.
   *
   * This was found the other way round: adaptive practice wrote the PRIOR
   * sequence while lesson evidence wrote the next one, so a practice miss could
   * tie with the lesson record before it and a learner who had just failed kept
   * a clean warrant. The fix belonged to the producer
   * (`Authority.submitPracticeAttempt`), not to this comparison.
   */
  const latestEligibleSeq = eligible.reduce((m, e) => Math.max(m, e.sequence), -1);
  const hasFreshFailure = input.records.some(
    (r) => r.valid && r.independent && r.outcome === 'incorrect' && r.sequence > latestEligibleSeq,
  );

  const stale = everTier !== null && (freshTier === null || freshTier !== everTier);
  const refreshNeeded =
    everTier !== null && everTier !== 'not_assessed' && (stale || hasFreshFailure);
  if (refreshNeeded) {
    reasons.push({ code: hasFreshFailure ? 'FRESH_FAILURE' : 'EVIDENCE_STALE' });
  }

  for (const gap of missing) {
    const code = GAP_REASON_BY_KIND[gap.kind];
    reasons.push({ code: code ?? 'EVIDENCE_GAP', detail: gap.reasons.join(',') });
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
    evidenceQuality,
    freshEvidenceQuality: freshTier,
    refreshNeeded,
    satisfiedSlots: satisfied,
    missingSlots: missing,
    supportingEvidenceIds: eligible.map((e) => e.evidenceId),
    freshestByKind,
    reasons,
    policyVersion: EVIDENCE_WARRANT_MANIFEST.version,
  };
}
