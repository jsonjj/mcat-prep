/**
 * Adaptive Practice selection engine (practice-selection / provisional-v1).
 *
 * PURE, DOM-free layer. Given a per-learner snapshot of mastery + coverage it
 * scores eligible `KC × skill × DOK × difficulty-band` specs (science AND CARS in
 * one unified list), allocates the X requested slots across emergent buckets
 * (science ↔ CARS, train / probe / repair), selects the best spec per slot, and
 * orders them for a good session (interleave, no same-KC back-to-back,
 * prerequisite-before-dependent, CARS distributed).
 *
 * This engine NEVER touches P(L) — it only READS the mastery signal to decide
 * what to serve. Writing mastery back is the authority's job (via the existing
 * mastery-bkt engine). It also never picks concrete items: it emits specs, and
 * the authority pulls one fresh matching item per spec from the real bank.
 *
 * All coefficients are provisional defaults behind PRACTICE_SELECTION_CONFIG and
 * the PRACTICE_SELECTION_MANIFEST; they are meant to be refit from data.
 */
import type { CarsSkill, ReasoningOperation, SkillCluster } from '@mcat/contracts';
import { CLUSTER_INFO, SKILL_CLUSTERS } from '@mcat/contracts';
import { PRIOR_PL0 } from './bkt';
import type { PolicyManifest } from './manifest';

export const PRACTICE_SELECTION_MANIFEST: PolicyManifest = {
  policyId: 'practice-selection',
  version: 'provisional-v1',
  status: 'provisional_active',
  summary:
    'Adaptive Practice slot allocation + spec selection over the mastery signal (weakness × exam-weight × trainability × urgency, with explore/coverage bonuses). Science + CARS unified. Coefficients provisional; difficulty bands DOK/stats-derived.',
};

export type PracticeDomain = 'science' | 'cars';
export type PracticePurpose = 'train' | 'probe' | 'repair';

/** A difficulty band in IRT `b`-space: [lo, hi]. Items are matched to its centre. */
export type DifficultyBand = readonly [number, number];

/**
 * One thing to practise. The authority turns a spec into a stable `specId` and
 * pulls a single FRESH matching item from the bank (see `practiceSpecId`).
 */
export interface PracticeSpec {
  readonly domain: PracticeDomain;
  readonly purpose: PracticePurpose;
  /** Science KC id (present for science specs). */
  readonly kcId?: string;
  /** Science 7-op reasoning axis (present for science specs). */
  readonly skill?: ReasoningOperation;
  /** CARS sub-skill (present for CARS specs). */
  readonly carsSkill?: CarsSkill;
  /** Representative author DOK for cold-start difficulty (optional). */
  readonly dok?: number;
  readonly difficultyBand: DifficultyBand;
}

/** A candidate science unit the learner could practise (already-taught KC). */
export interface PracticeUnit {
  readonly kcId: string;
  readonly skill: ReasoningOperation;
  readonly cluster: SkillCluster;
  /** Current (decayed) P(L) of the KC, 0..1. */
  readonly plKc: number;
  /** Current (decayed) P(L) of the KC's reasoning skill, 0..1. */
  readonly plSkill: number;
  /** The lesson that teaches this KC has been delivered. */
  readonly taught: boolean;
  /** All hard prerequisites of this KC are met. */
  readonly prereqMet: boolean;
  /** Representative author DOK (cold-start difficulty). */
  readonly dok?: number;
  /** Days the KC review is overdue (0 when not due). */
  readonly overdueDays: number;
  /** The learner has never practised this KC (drives the explore bonus). */
  readonly neverPractised: boolean;
  /** Recency penalty input in [0,1] (1 = just practised); 0 when unknown. */
  readonly recency: number;
  /** Direct (1-hop) prerequisite KC ids, for prerequisite-before-dependent order. */
  readonly prereqKcIds?: readonly string[];
}

/** A candidate CARS sub-skill (always eligible; CARS is a skill, not knowledge). */
export interface PracticeCarsUnit {
  readonly carsSkill: CarsSkill;
  /** Current IRT ability V (0 = average; may be negative). */
  readonly v: number;
  /** The learner has never practised this CARS sub-skill. */
  readonly neverPractised: boolean;
  readonly recency: number;
}

/** A KC×skill flagged for a fresh repair rep after a recent unassisted miss. */
export interface PracticeRepairTarget {
  readonly kcId: string;
  readonly skill?: ReasoningOperation;
}

/** Everything the engine needs, all pre-computed by the authority (no I/O, no clock). */
export interface PracticeSnapshot {
  readonly units: readonly PracticeUnit[];
  readonly cars: readonly PracticeCarsUnit[];
  /** Open repair targets (recent misses), highest priority first. */
  readonly repairs: readonly PracticeRepairTarget[];
  /** Distinct clusters that already carry practice evidence (coverage bonus input). */
  readonly coveredClusters: ReadonlySet<SkillCluster>;
}

export interface PracticeSlotAllocation {
  readonly train: number;
  readonly probe: number;
  readonly repair: number;
  readonly cars: number;
}

export interface PracticeSelectionConfig {
  /** Weakness = 1 − (kcWeight·P(L)_kc + skillWeight·P(L)_skill). */
  readonly weaknessKcWeight: number;
  readonly weaknessSkillWeight: number;
  /** Urgency = 1 + λ·min(overdueDays, overdueClampDays)/overdueClampDays. */
  readonly urgencyLambda: number;
  readonly overdueClampDays: number;
  /** γ: additive bonus for a never-practised unit (exploration). */
  readonly exploreBonus: number;
  /** ν: additive bonus when the unit's cluster has no coverage yet. */
  readonly coverageBonus: number;
  /** τ: recency penalty weight (subtractive). */
  readonly recencyPenalty: number;
  /** p: fraction of the science budget reserved for probes (uncertainty). */
  readonly probeFraction: number;
  /** Max fraction of the science budget spendable on repairs. */
  readonly maxRepairFraction: number;
  /** Half-width of a difficulty band, in `b`-space. */
  readonly bandWidth: number;
  /** Logit offsets: target success ~80% (train), ~55% (probe), ~85% (repair). */
  readonly logitTrain: number;
  readonly logitProbe: number;
  readonly logitRepair: number;
  /** Ability clamp so a saturated/empty P(L) cannot diverge θ. */
  readonly abilityClamp: number;
}

export const PRACTICE_SELECTION_CONFIG: PracticeSelectionConfig = {
  weaknessKcWeight: 0.6,
  weaknessSkillWeight: 0.4,
  urgencyLambda: 1.0,
  overdueClampDays: 30,
  exploreBonus: 0.15,
  coverageBonus: 0.1,
  recencyPenalty: 0.2,
  probeFraction: 0.1,
  maxRepairFraction: 0.3,
  bandWidth: 0.5,
  logitTrain: 1.3863, // logit(0.80)
  logitProbe: 0.2007, // logit(0.55)
  logitRepair: 1.7346, // logit(0.85)
  abilityClamp: 4,
};

// ---- Exam weights (provisional) -------------------------------------------
// The four scored sections carry equal weight; within a section the weight is
// split evenly across its clusters. CARS weight is split across its 3 sub-skills.
const SECTION_WEIGHT = 0.25;

const clustersInSection = (section: string): number =>
  SKILL_CLUSTERS.filter((c) => CLUSTER_INFO[c].section === section).length;

/** Provisional normalized exam weight for a science cluster. */
export function examWeightForCluster(cluster: SkillCluster): number {
  const section = CLUSTER_INFO[cluster].section;
  const n = clustersInSection(section);
  return n === 0 ? 0 : SECTION_WEIGHT / n;
}

/** Provisional normalized exam weight for one CARS sub-skill. */
export function carsExamWeight(): number {
  return SECTION_WEIGHT / 3;
}

const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));

/** Map a P(L) in (0,1) to a clamped ability θ in `b`-space (log-odds). */
export function abilityFromPL(pL: number, cfg: PracticeSelectionConfig = PRACTICE_SELECTION_CONFIG): number {
  const p = clamp(pL, 1e-3, 1 - 1e-3);
  return clamp(Math.log(p / (1 - p)), -cfg.abilityClamp, cfg.abilityClamp);
}

/** Map a CARS ability V straight through as θ (already in the same space). */
const carsAbilityToTheta = (v: number, cfg: PracticeSelectionConfig): number =>
  clamp(v, -cfg.abilityClamp, cfg.abilityClamp);

/**
 * Priority of one science unit:
 *   weakness × exam_weight × trainability × urgency + explore + coverage − recency
 * Ineligible units (untaught or prereq-blocked) score 0 (trainability = 0).
 */
export function priorityScore(
  unit: PracticeUnit,
  snapshot: Pick<PracticeSnapshot, 'coveredClusters'>,
  cfg: PracticeSelectionConfig = PRACTICE_SELECTION_CONFIG,
): number {
  const trainability = unit.taught && unit.prereqMet ? 1 : 0;
  if (trainability === 0) return 0;
  const weakness = clamp(
    1 - (cfg.weaknessKcWeight * unit.plKc + cfg.weaknessSkillWeight * unit.plSkill),
    0,
    1,
  );
  const examWeight = examWeightForCluster(unit.cluster);
  const urgency =
    1 + cfg.urgencyLambda * (clamp(unit.overdueDays, 0, cfg.overdueClampDays) / cfg.overdueClampDays);
  const explore = unit.neverPractised ? cfg.exploreBonus : 0;
  const coverage = snapshot.coveredClusters.has(unit.cluster) ? 0 : cfg.coverageBonus;
  const recency = cfg.recencyPenalty * clamp(unit.recency, 0, 1);
  return Math.max(0, weakness * examWeight * urgency + explore + coverage - recency);
}

/** Priority of one CARS sub-skill (weakness from ability + explore/recency). */
export function carsPriorityScore(
  unit: PracticeCarsUnit,
  cfg: PracticeSelectionConfig = PRACTICE_SELECTION_CONFIG,
): number {
  // Weakness from ability: σ(−V) is high when the learner is weak (low V).
  const weakness = 1 / (1 + Math.exp(unit.v));
  const explore = unit.neverPractised ? cfg.exploreBonus : 0;
  const recency = cfg.recencyPenalty * clamp(unit.recency, 0, 1);
  return Math.max(0, weakness * carsExamWeight() + explore - recency);
}

/**
 * The difficulty band for a purpose around ability θ. Train aims easier (~80%),
 * probe aims at the measurement point (~55%), repair aims easiest (~85%).
 */
export function difficultyBandFor(
  purpose: PracticePurpose,
  theta: number,
  cfg: PracticeSelectionConfig = PRACTICE_SELECTION_CONFIG,
): DifficultyBand {
  const offset =
    purpose === 'train' ? cfg.logitTrain : purpose === 'repair' ? cfg.logitRepair : cfg.logitProbe;
  const center = theta - offset;
  return [center - cfg.bandWidth, center + cfg.bandWidth];
}

/** The centre of a band (the target `b` the authority matches items against). */
export const bandCenter = (band: DifficultyBand): number => (band[0] + band[1]) / 2;

const roundClamp = (value: number, max: number): number => clamp(Math.round(value), 0, max);

/**
 * Allocate the X slots across emergent buckets. CARS share emerges from the
 * relative priority mass of CARS vs science; within the science budget, repairs
 * are capped and probes take a small fixed fraction, the rest is train. The four
 * buckets always sum to X (given enough candidates).
 */
export function allocateSlots(
  snapshot: PracticeSnapshot,
  x: number,
  cfg: PracticeSelectionConfig = PRACTICE_SELECTION_CONFIG,
): PracticeSlotAllocation {
  const total = Math.max(0, Math.floor(x));
  if (total === 0) return { train: 0, probe: 0, repair: 0, cars: 0 };

  const eligibleScience = snapshot.units.filter((u) => u.taught && u.prereqMet);
  const scienceMass = eligibleScience.reduce((sum, u) => sum + priorityScore(u, snapshot, cfg), 0);
  const carsMass = snapshot.cars.reduce((sum, u) => sum + carsPriorityScore(u, cfg), 0);
  const totalMass = scienceMass + carsMass;

  let cars =
    snapshot.cars.length === 0 || totalMass <= 0
      ? 0
      : roundClamp((carsMass / totalMass) * total, total);
  // Never let CARS crowd out science entirely when science is available.
  if (cars === total && eligibleScience.length > 0) cars = total - 1;
  if (eligibleScience.length === 0 && snapshot.cars.length > 0) cars = total;

  let scienceBudget = total - cars;
  if (eligibleScience.length === 0) scienceBudget = 0;

  const repairsAvailable = snapshot.repairs.length;
  const repair = Math.min(
    Math.floor(scienceBudget * cfg.maxRepairFraction),
    repairsAvailable,
    scienceBudget,
  );
  const probe = Math.min(roundClamp(scienceBudget * cfg.probeFraction, scienceBudget - repair), scienceBudget - repair);
  const train = scienceBudget - repair - probe;

  // Any slots unusable because science ran dry spill back to CARS if possible.
  const assigned = train + probe + repair + cars;
  const leftover = total - assigned;
  if (leftover > 0 && snapshot.cars.length > 0) cars += leftover;

  return { train, probe, repair, cars };
}

/**
 * Select the concrete specs for the allocation, greedily per bucket. Science
 * train/probe come off the priority-sorted eligible units (probes prefer the
 * most uncertain, i.e. P(L) nearest 0.5); repairs come off the recent-miss list;
 * CARS come off the CARS priority order. No KC is used twice.
 */
export function selectSpecs(
  snapshot: PracticeSnapshot,
  x: number,
  cfg: PracticeSelectionConfig = PRACTICE_SELECTION_CONFIG,
): PracticeSpec[] {
  const allocation = allocateSlots(snapshot, x, cfg);
  const specs: PracticeSpec[] = [];
  // De-dup at the KC×skill grain so a KC exercised through several reasoning
  // skills can still contribute more than one spec (session-level KC repetition
  // is separated by `orderSpecs`).
  const usedUnit = new Set<string>();
  const unitKey = (kcId: string, skill?: ReasoningOperation): string => `${kcId}::${skill ?? ''}`;

  const unitByKc = new Map(snapshot.units.map((u) => [u.kcId, u]));
  const thetaFor = (u: PracticeUnit | undefined): number =>
    u === undefined ? abilityFromPL(PRIOR_PL0, cfg) : abilityFromPL(0.6 * u.plKc + 0.4 * u.plSkill, cfg);

  // Repairs first (a recent miss is the most actionable evidence).
  for (const target of snapshot.repairs) {
    if (specs.filter((s) => s.purpose === 'repair').length >= allocation.repair) break;
    const unit = unitByKc.get(target.kcId);
    const skill = target.skill ?? unit?.skill;
    if (usedUnit.has(unitKey(target.kcId, skill))) continue;
    usedUnit.add(unitKey(target.kcId, skill));
    specs.push({
      domain: 'science',
      purpose: 'repair',
      kcId: target.kcId,
      ...(skill ? { skill } : {}),
      ...(unit?.dok !== undefined ? { dok: unit.dok } : {}),
      difficultyBand: difficultyBandFor('repair', thetaFor(unit), cfg),
    });
  }

  const eligible = snapshot.units
    .filter((u) => u.taught && u.prereqMet && !usedUnit.has(unitKey(u.kcId, u.skill)))
    .map((u) => ({ u, score: priorityScore(u, snapshot, cfg) }))
    .sort((a, b) => b.score - a.score);

  // Probes: most uncertain among the (remaining) eligible units.
  const byUncertainty = [...eligible].sort(
    (a, b) => Math.abs(a.u.plKc - 0.5) - Math.abs(b.u.plKc - 0.5),
  );
  for (const { u } of byUncertainty) {
    if (specs.filter((s) => s.purpose === 'probe').length >= allocation.probe) break;
    if (usedUnit.has(unitKey(u.kcId, u.skill))) continue;
    usedUnit.add(unitKey(u.kcId, u.skill));
    specs.push({
      domain: 'science',
      purpose: 'probe',
      kcId: u.kcId,
      skill: u.skill,
      ...(u.dok !== undefined ? { dok: u.dok } : {}),
      difficultyBand: difficultyBandFor('probe', thetaFor(u), cfg),
    });
  }

  // Train: the highest-priority remaining eligible units.
  for (const { u } of eligible) {
    if (specs.filter((s) => s.purpose === 'train').length >= allocation.train) break;
    if (usedUnit.has(unitKey(u.kcId, u.skill))) continue;
    usedUnit.add(unitKey(u.kcId, u.skill));
    specs.push({
      domain: 'science',
      purpose: 'train',
      kcId: u.kcId,
      skill: u.skill,
      ...(u.dok !== undefined ? { dok: u.dok } : {}),
      difficultyBand: difficultyBandFor('train', thetaFor(u), cfg),
    });
  }

  // CARS (measurement → probe-style band around ability).
  const carsSorted = [...snapshot.cars]
    .map((u) => ({ u, score: carsPriorityScore(u, cfg) }))
    .sort((a, b) => b.score - a.score);
  for (const { u } of carsSorted) {
    if (specs.filter((s) => s.domain === 'cars').length >= allocation.cars) break;
    specs.push({
      domain: 'cars',
      purpose: 'probe',
      carsSkill: u.carsSkill,
      difficultyBand: difficultyBandFor('probe', carsAbilityToTheta(u.v, cfg), cfg),
    });
  }

  return specs;
}

/**
 * Order the selected specs for a good session:
 *  - prerequisite KCs before their dependents,
 *  - never the same KC back-to-back,
 *  - CARS distributed rather than clumped.
 * Deterministic; falls back gracefully when constraints conflict.
 */
export function orderSpecs(
  specs: readonly PracticeSpec[],
  snapshot: Pick<PracticeSnapshot, 'units'>,
): PracticeSpec[] {
  if (specs.length <= 1) return [...specs];

  const prereqByKc = new Map<string, ReadonlySet<string>>();
  for (const u of snapshot.units) {
    prereqByKc.set(u.kcId, new Set(u.prereqKcIds ?? []));
  }
  const selectedKcs = new Set(
    specs.filter((s) => s.domain === 'science' && s.kcId).map((s) => s.kcId as string),
  );

  // Prerequisite depth among the SELECTED KCs (0 = no selected prereqs).
  const depthCache = new Map<string, number>();
  const depthOf = (kcId: string, seen: ReadonlySet<string> = new Set()): number => {
    if (depthCache.has(kcId)) return depthCache.get(kcId)!;
    if (seen.has(kcId)) return 0; // cycle guard
    const prereqs = [...(prereqByKc.get(kcId) ?? [])].filter(
      (p) => selectedKcs.has(p) && p !== kcId,
    );
    const depth =
      prereqs.length === 0
        ? 0
        : 1 + Math.max(...prereqs.map((p) => depthOf(p, new Set([...seen, kcId]))));
    depthCache.set(kcId, depth);
    return depth;
  };

  const keyed = specs.map((spec, index) => ({
    spec,
    index,
    kc: spec.domain === 'science' ? (spec.kcId ?? `s${index}`) : `cars:${spec.carsSkill}`,
    depth: spec.domain === 'science' && spec.kcId ? depthOf(spec.kcId) : 0,
  }));

  // Prerequisite-before-dependent as the primary key; stable index as tiebreak.
  const remaining = keyed.sort((a, b) => a.depth - b.depth || a.index - b.index);

  const ordered: typeof remaining = [];
  let lastKc: string | null = null;
  let lastDomain: PracticeDomain | null = null;
  while (remaining.length > 0) {
    // Prefer the first candidate whose KC differs from the last, and that does
    // not stack CARS on CARS — but never violate prerequisite depth ordering:
    // only look among the minimal remaining depth tier.
    const minDepth = remaining[0]!.depth;
    const tierEnd = remaining.findIndex((r) => r.depth > minDepth);
    const tier = tierEnd === -1 ? remaining.length : tierEnd;

    let pickIndex = 0;
    for (let i = 0; i < tier; i += 1) {
      const candidate = remaining[i]!;
      const sameKc = candidate.kc === lastKc;
      const stackedCars = candidate.spec.domain === 'cars' && lastDomain === 'cars';
      if (!sameKc && !stackedCars) {
        pickIndex = i;
        break;
      }
    }
    const [picked] = remaining.splice(pickIndex, 1);
    ordered.push(picked!);
    lastKc = picked!.kc;
    lastDomain = picked!.spec.domain;
  }

  return ordered.map((o) => o.spec);
}

/** Convenience: select then order the queue for X slots. */
export function selectPracticeQueue(
  snapshot: PracticeSnapshot,
  x: number,
  cfg: PracticeSelectionConfig = PRACTICE_SELECTION_CONFIG,
): PracticeSpec[] {
  return orderSpecs(selectSpecs(snapshot, x, cfg), snapshot);
}

/**
 * A stable id for a spec, used to link a delivered item back to its spec (for
 * repair-on-miss and telemetry). Deterministic in the spec fields.
 */
export function practiceSpecId(spec: PracticeSpec): string {
  const parts =
    spec.domain === 'cars'
      ? ['cars', spec.carsSkill ?? '', spec.purpose]
      : ['sci', spec.kcId ?? '', spec.skill ?? '', spec.dok === undefined ? '' : `d${spec.dok}`, spec.purpose];
  return parts.join(':').replace(/:+$/, '').replace(/::+/g, ':');
}
