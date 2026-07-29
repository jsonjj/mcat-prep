import type { CarsSkill, QuestionFormat, ReasoningOperation, Section, SkillCluster } from '@mcat/contracts';
import { SectionSchema } from '@mcat/contracts';
import type { PolicyManifest } from './manifest';

/**
 * Fixed-form assembler for the periodic half-length practice test (WS5, §6).
 *
 * This is the counterpart to the diagnostic's multistage assembler
 * (`diagnostic-mst.ts`), and it reuses that engine's *scaffolding idea* — bucket
 * the bank, deal to a blueprint, never repeat an item within a sitting — while
 * dropping everything adaptive about it. There is no routing, no difficulty
 * ladder, no per-block cut score: a practice test is a fixed form, everyone who
 * sits the same seed sees the same items, and the whole thing is scored at the
 * end by a plain key match (`practice-test-scorer.ts`).
 *
 * Two things separate it from the diagnostic assembler and both are load-bearing:
 *
 *  - **It INCLUDES CARS.** The diagnostic measures the 10 Foundational Concepts
 *    and reaches a concept only through a lesson, so the whole reasoning/CARS
 *    bank is off its axis (`diagnostic-bank.ts` scope accounting). A practice
 *    test is a blueprint-valid exam, and the AAMC blueprint is ~a quarter CARS,
 *    so CARS is a REQUIRED section floor here rather than an excluded one. The
 *    assembler therefore reads the full candidate set (every section), not the
 *    FC-bucketed `formItems`.
 *
 *  - **It VALIDATES BEFORE SERVING.** The multistage planner throws at plan time
 *    if a bucket cannot cover its share; this assembler additionally re-checks
 *    the assembled form against every floor and rebuilds (a fresh tie-break
 *    seed) before it will hand a form back. A test that silently under-covers a
 *    section is a worse failure than a loud one — blueprint coverage IS the
 *    validity claim — so an unmet floor after the rebuild budget is exhausted is
 *    a thrown {@link PracticeTestAssemblyError}, never a short form.
 *
 * Pure functions only. The bank read, the per-learner "already scored" set, and
 * delivery live in the server flow (`apps/learner-web/server/practice-test-*`).
 */

export const PRACTICE_TEST_MANIFEST: PolicyManifest = {
  policyId: 'practice-test-assembler',
  version: 'provisional-v1',
  status: 'provisional_active',
  summary:
    'Fixed-form half-length practice test assembler: deal fresh (never-scored) items to per-section ' +
    'content, per-skill and per-format blueprint FLOORS including CARS, validate the assembled form ' +
    'against every floor before serving, and rebuild on a fresh tie-break seed if any floor is unmet. ' +
    'No adaptive routing; no mastery writes.',
};

/**
 * One deliverable item as the assembler needs to see it. Deliberately the union
 * of what the section, skill and format floors read, and nothing else — the
 * assembler must not be able to see the answer key or the learner.
 */
export interface PracticeTestCandidate {
  readonly questionId: string;
  readonly section: Section;
  /** Content bucket. Null items still count toward the section floor, never a cluster one. */
  readonly cluster: SkillCluster | null;
  /** Science reasoning operation (the skill axis for C/P, B/B, P/S). */
  readonly skill: ReasoningOperation | null;
  /** CARS sub-skill (the skill axis for CARS). */
  readonly carsSkill: CarsSkill | null;
  readonly format: QuestionFormat;
  /** Difficulty proxy (author DOK) until calibration exists; only used for a deterministic spread. */
  readonly dokLevel: number | null;
  readonly familyId: string | null;
  /** Reviewed, published, test-eligible, not protected/test-only. */
  readonly eligible: boolean;
}

/**
 * The blueprint the assembled form must satisfy. Every field is a FLOOR (a
 * minimum), except `totalItems`, which is the exact length the form is filled to.
 * Floors sum below `totalItems` on purpose: the slack is where section balance is
 * topped up after every floor is met.
 */
export interface PracticeTestBlueprint {
  /** Exact length of the assembled form (half of a full 230-item MCAT). */
  readonly totalItems: number;
  /** Minimum items per section — CARS INCLUDED, which is the whole point. */
  readonly sectionFloors: Readonly<Record<Section, number>>;
  /**
   * Minimum items per skill, keyed by reasoning operation OR CARS sub-skill. A
   * skill absent from the map (or floored at 0) is unconstrained; the corpus
   * does not tag every axis densely, so the default blueprint floors only the
   * skills a real bank can reliably supply.
   */
  readonly skillFloors: Readonly<Record<string, number>>;
  /**
   * Minimum items per item format. Same rule as skills: a format floored at 0 is
   * unconstrained, because the pull carries no reliable format column for the
   * graph/experiment variants (`diagnostic-bank.ts` hardcodes `discrete_mcq`).
   */
  readonly formatFloors: Readonly<Partial<Record<QuestionFormat, number>>>;
}

/**
 * The served half-length blueprint.
 *
 * A scored MCAT is 230 questions — 59 C/P, 53 CARS, 59 B/B, 59 P/S — so a
 * half-length test is ~115. The section floors hold each section's share and sum
 * to 110, leaving 5 items of slack for balance top-up. The skill floors ask for
 * broad reasoning coverage in the sciences and all three CARS sub-skills; the
 * format floors ask only for the passage/discrete split the bank actually
 * distinguishes.
 */
export const HALF_LENGTH_BLUEPRINT: PracticeTestBlueprint = {
  totalItems: 115,
  sectionFloors: { cp: 29, cars: 26, bb: 29, ps: 26 },
  skillFloors: {
    // Sciences: keep every reasoning operation on the form so the read is not
    // dominated by recall. Modest floors that a 2k-item bank clears with room.
    IDENTIFY: 4,
    PREDICT: 3,
    EXPLAIN: 3,
    RELATE: 2,
    QUANTIFY: 4,
    DESIGN: 2,
    EVIDENCE: 3,
    // CARS: all three AAMC sub-skills present, weighted toward within/beyond text.
    FOC: 6,
    RWT: 8,
    RBT: 8,
  },
  formatFloors: {
    passage_mcq: 40,
    discrete_mcq: 20,
  },
};

/** The skill axis a candidate contributes to: CARS sub-skill for CARS, else reasoning op. */
export const candidateSkillKey = (c: PracticeTestCandidate): string | null =>
  c.section === 'cars' ? c.carsSkill : c.skill;

/** A single blueprint floor that the assembled form did not meet. */
export interface FloorViolation {
  readonly dimension: 'section' | 'skill' | 'format' | 'total';
  readonly key: string;
  readonly required: number;
  readonly actual: number;
}

/** Counts of an assembled (or partial) form along every floored dimension. */
export interface FormComposition {
  readonly total: number;
  readonly bySection: Readonly<Record<string, number>>;
  readonly bySkill: Readonly<Record<string, number>>;
  readonly byFormat: Readonly<Record<string, number>>;
}

export class PracticeTestAssemblyError extends Error {
  constructor(
    message: string,
    readonly violations: readonly FloorViolation[],
  ) {
    super(message);
    this.name = 'PracticeTestAssemblyError';
  }
}

// Stable, deterministic hash for tie-breaking (FNV-1a), mirrors `diagnostic.ts`.
const hash = (s: string): number => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

/** Count an assembled form along every floored dimension. */
export function composeForm(items: readonly PracticeTestCandidate[]): FormComposition {
  const bySection: Record<string, number> = {};
  const bySkill: Record<string, number> = {};
  const byFormat: Record<string, number> = {};
  for (const item of items) {
    bySection[item.section] = (bySection[item.section] ?? 0) + 1;
    const skill = candidateSkillKey(item);
    if (skill !== null) bySkill[skill] = (bySkill[skill] ?? 0) + 1;
    byFormat[item.format] = (byFormat[item.format] ?? 0) + 1;
  }
  return { total: items.length, bySection, bySkill, byFormat };
}

/**
 * Every blueprint floor the form fails, in a stable dimension order. An empty
 * array is the validate-before-serve pass — this is what the assembler checks,
 * and independently what a caller can assert in a test.
 */
export function validatePracticeTestForm(
  items: readonly PracticeTestCandidate[],
  blueprint: PracticeTestBlueprint,
): FloorViolation[] {
  const comp = composeForm(items);
  const violations: FloorViolation[] = [];

  if (comp.total !== blueprint.totalItems) {
    violations.push({
      dimension: 'total',
      key: 'total',
      required: blueprint.totalItems,
      actual: comp.total,
    });
  }
  for (const section of SectionSchema.options) {
    const required = blueprint.sectionFloors[section] ?? 0;
    const actual = comp.bySection[section] ?? 0;
    if (actual < required) violations.push({ dimension: 'section', key: section, required, actual });
  }
  for (const [key, required] of Object.entries(blueprint.skillFloors)) {
    if (required <= 0) continue;
    const actual = comp.bySkill[key] ?? 0;
    if (actual < required) violations.push({ dimension: 'skill', key, required, actual });
  }
  for (const [key, required] of Object.entries(blueprint.formatFloors)) {
    if ((required ?? 0) <= 0) continue;
    const actual = comp.byFormat[key] ?? 0;
    if (actual < (required ?? 0)) {
      violations.push({ dimension: 'format', key, required: required ?? 0, actual });
    }
  }
  return violations;
}

interface AssemblyState {
  readonly picked: PracticeTestCandidate[];
  readonly used: Set<string>;
  readonly bySection: Record<string, number>;
  readonly bySkill: Record<string, number>;
  readonly byFormat: Record<string, number>;
}

/** How many still-unmet floors this candidate would advance if added. */
function coverageGain(c: PracticeTestCandidate, state: AssemblyState, bp: PracticeTestBlueprint): number {
  let gain = 0;
  if ((state.bySection[c.section] ?? 0) < (bp.sectionFloors[c.section] ?? 0)) gain += 1;
  const skill = candidateSkillKey(c);
  if (skill !== null && (state.bySkill[skill] ?? 0) < (bp.skillFloors[skill] ?? 0)) gain += 1;
  if ((state.byFormat[c.format] ?? 0) < (bp.formatFloors[c.format] ?? 0)) gain += 1;
  return gain;
}

function add(state: AssemblyState, c: PracticeTestCandidate): void {
  state.picked.push(c);
  state.used.add(c.questionId);
  state.bySection[c.section] = (state.bySection[c.section] ?? 0) + 1;
  const skill = candidateSkillKey(c);
  if (skill !== null) state.bySkill[skill] = (state.bySkill[skill] ?? 0) + 1;
  state.byFormat[c.format] = (state.byFormat[c.format] ?? 0) + 1;
}

/**
 * One assembly attempt: cover every floor greedily, then top up to the exact
 * length while holding sections near their blueprint share. Deterministic given
 * `seed`; the seed only breaks ties between equally-suitable items so two
 * sittings do not draw the identical lowest-id form.
 *
 * Returns the picked items even when a floor could not be covered — the caller
 * validates and decides whether to rebuild or throw, which keeps
 * "validate-before-serve" a single checkpoint rather than something re-derived
 * in three places.
 */
function assembleOnce(
  pool: readonly PracticeTestCandidate[],
  blueprint: PracticeTestBlueprint,
  seed: string,
): PracticeTestCandidate[] {
  const state: AssemblyState = {
    picked: [],
    used: new Set<string>(),
    bySection: {},
    bySkill: {},
    byFormat: {},
  };
  const tie = (c: PracticeTestCandidate): number => hash(`${seed}:${c.questionId}`);

  // --- Phase 1: cover every floor, scarcest-first. ---
  // Guarded by the pool size: each iteration adds one item, so it cannot run
  // longer than the pool, and it stops as soon as no unused item advances any
  // unmet floor (which validation then reports as the specific shortfall).
  for (let guard = 0; guard <= pool.length; guard += 1) {
    let best: PracticeTestCandidate | null = null;
    let bestGain = 0;
    let bestTie = 0;
    for (const c of pool) {
      if (state.used.has(c.questionId)) continue;
      const gain = coverageGain(c, state, blueprint);
      if (gain === 0) continue;
      const t = tie(c);
      if (gain > bestGain || (gain === bestGain && (best === null || t < bestTie))) {
        best = c;
        bestGain = gain;
        bestTie = t;
      }
    }
    if (best === null) break; // every remaining floor is either met or unfillable
    add(state, best);
  }

  // --- Phase 2: top up to the exact length, keeping sections near share. ---
  // "Most under its section target" first, so the slack above the floors is not
  // dumped into whichever section happens to sort first.
  const sectionTarget = (section: Section): number => {
    const floorSum = SectionSchema.options.reduce(
      (s, sec) => s + (blueprint.sectionFloors[sec] ?? 0),
      0,
    );
    const floor = blueprint.sectionFloors[section] ?? 0;
    // Distribute the whole length in proportion to the section floors.
    return floorSum > 0 ? (blueprint.totalItems * floor) / floorSum : 0;
  };
  while (state.picked.length < blueprint.totalItems) {
    let best: PracticeTestCandidate | null = null;
    let bestDeficit = -Infinity;
    let bestTie = 0;
    for (const c of pool) {
      if (state.used.has(c.questionId)) continue;
      const deficit = sectionTarget(c.section) - (state.bySection[c.section] ?? 0);
      const t = tie(c);
      if (deficit > bestDeficit || (deficit === bestDeficit && (best === null || t < bestTie))) {
        best = c;
        bestDeficit = deficit;
        bestTie = t;
      }
    }
    if (best === null) break; // pool exhausted before reaching the length
    add(state, best);
  }

  return state.picked;
}

export interface AssembleOptions {
  /** Previously-scored item ids — never reused, so a test is always fresh. */
  readonly excludeIds?: ReadonlySet<string>;
  readonly blueprint?: PracticeTestBlueprint;
  /** Per-sitting seed; different sittings draw different forms, same seed replays identically. */
  readonly seed?: string;
  /** How many fresh-seed rebuilds to try when a validation fails before giving up. */
  readonly maxRebuilds?: number;
}

export interface AssembledPracticeTest {
  readonly items: readonly PracticeTestCandidate[];
  readonly blueprint: PracticeTestBlueprint;
  readonly composition: FormComposition;
  /** How many rebuilds were needed before a form validated (0 = first pass). */
  readonly rebuilds: number;
}

/**
 * Assemble a half-length practice test, or throw {@link PracticeTestAssemblyError}.
 *
 *  1. Drop everything that is not eligible or has already been scored (fresh
 *     items only — a periodic test never re-serves an item the learner has been
 *     scored on).
 *  2. Assemble a form that covers every floor and hits the exact length.
 *  3. VALIDATE it against every floor. If it fails, REBUILD with a fresh
 *     tie-break seed, up to `maxRebuilds` times. Only a form that passes step 3
 *     is returned; if none does, the last attempt's violations are thrown.
 */
export function assemblePracticeTest(
  candidates: readonly PracticeTestCandidate[],
  options: AssembleOptions = {},
): AssembledPracticeTest {
  const blueprint = options.blueprint ?? HALF_LENGTH_BLUEPRINT;
  const excludeIds = options.excludeIds ?? new Set<string>();
  const baseSeed = options.seed ?? 'practice-test';
  const maxRebuilds = options.maxRebuilds ?? 3;

  const pool = candidates.filter((c) => c.eligible && !excludeIds.has(c.questionId));

  let lastViolations: FloorViolation[] = [];
  for (let attempt = 0; attempt <= maxRebuilds; attempt += 1) {
    const items = assembleOnce(pool, blueprint, `${baseSeed}#${attempt}`);
    const violations = validatePracticeTestForm(items, blueprint);
    if (violations.length === 0) {
      return { items, blueprint, composition: composeForm(items), rebuilds: attempt };
    }
    lastViolations = violations;
  }

  throw new PracticeTestAssemblyError(
    `Could not assemble a blueprint-valid practice test from ${pool.length} fresh items after ` +
      `${maxRebuilds + 1} attempts. Unmet floors: ` +
      lastViolations.map((v) => `${v.dimension}:${v.key} ${v.actual}/${v.required}`).join(', '),
    lastViolations,
  );
}

/**
 * Whether a candidate pool can supply a blueprint-valid form at all, without
 * throwing. The server's availability check — the analogue of the diagnostic's
 * `bankSupportsProductionForm` — so "the bank is too thin" and "the assembler is
 * broken" do not look identical to a caller.
 */
export function poolSupportsPracticeTest(
  candidates: readonly PracticeTestCandidate[],
  options: AssembleOptions = {},
): boolean {
  try {
    assemblePracticeTest(candidates, options);
    return true;
  } catch {
    return false;
  }
}
