import { REASONING_OPERATIONS, type CarsSkill, type ReasoningOperation } from '@mcat/contracts';

/**
 * Resolve a question's reasoning operation (the 7-skill mastery axis) and CARS
 * sub-skill from the v7 tags. The corpus does not tag the 7 operations directly;
 * it has `primary_skill` (SIRS1-4 / CARS_*) and a free-text
 * `construct.reasoning_operation_id`. This is the deterministic seed mapping from
 * docs/mastery-pipeline.md §6 (SME may override by authoring an explicit
 * `reasoning_operation`). See docs/mastery-pipeline.md.
 */

const OP_SET = new Set<string>(REASONING_OPERATIONS);

/** Normalize an already-authored operation string to a valid 7-op, or null. */
function normalizeOp(value: string | null | undefined): ReasoningOperation | null {
  if (!value) return null;
  const upper = value.trim().toUpperCase();
  return OP_SET.has(upper) ? (upper as ReasoningOperation) : null;
}

/**
 * Keyword table for disambiguating SIRS2 (and as a last-resort fallback) from the
 * free-text `construct.reasoning_operation_id`. Ordered so the most distinctive
 * operations match first (e.g. "select/apply formula" → QUANTIFY before EXPLAIN).
 */
const CONSTRUCT_KEYWORDS: ReadonlyArray<readonly [ReasoningOperation, readonly string[]]> = [
  ['QUANTIFY', ['select/apply formula', 'apply formula', 'select formula', 'calculat', 'comput', 'quantif', 'equation', 'estimate']],
  ['PREDICT', ['predict', 'outcome', 'what happens', 'perturbation', 'forward']],
  ['EXPLAIN', ['explain', 'mechanism', 'account for', 'why', 'backward']],
  ['RELATE', ['relate', 'compare', 'mapping', 'match', 'structure-function', 'structure–function', 'entity', 'role']],
  ['DESIGN', ['design', 'control', 'confound', 'validity', 'study design', 'methodolog']],
  ['EVIDENCE', ['evidence', 'interpret', 'significan', 'correlation', 'what the data', 'licenses', 'support the claim']],
  ['IDENTIFY', ['identify', 'recognize', 'recall', 'define']],
];

function opFromConstructText(text: string | null | undefined): ReasoningOperation | null {
  if (!text) return null;
  const t = text.toLowerCase();
  for (const [op, keywords] of CONSTRUCT_KEYWORDS) {
    if (keywords.some((k) => t.includes(k))) return op;
  }
  return null;
}

/** The minimal question shape needed to resolve the reasoning operation. */
export interface ReasoningOperationInput {
  /** An explicit authored operation (SME override), if present. */
  reasoning_operation?: string | undefined;
  primary_skill?: string | undefined;
  construct?: { reasoning_operation_id?: string | undefined } | undefined;
}

/**
 * Resolve the 7-op reasoning operation for a v7 question.
 *   1. An explicit authored `reasoning_operation` wins.
 *   2. SIRS1/3/4 and MATH-ENABLING map one-to-one; SIRS2 splits via the construct text.
 *   3. CARS skills are NOT science operations → null (they use the CARS IRT track).
 *   4. Fallback: keyword-match the construct text.
 * Returns null if nothing resolves (a data-integrity signal for callers).
 */
export function resolveReasoningOperation(q: ReasoningOperationInput): ReasoningOperation | null {
  const explicit = normalizeOp(q.reasoning_operation);
  if (explicit) return explicit;

  const skill = q.primary_skill?.trim().toUpperCase();
  const constructText = q.construct?.reasoning_operation_id;

  switch (skill) {
    case 'SIRS1':
      return 'IDENTIFY';
    case 'SIRS3':
      return 'DESIGN';
    case 'SIRS4':
      return 'EVIDENCE';
    case 'MATH-ENABLING':
    case 'MATH_ENABLING':
      return 'QUANTIFY';
    case 'SIRS2':
      // SIRS2 (~45% of the exam) splits into its four operations; default EXPLAIN
      // when the construct text is ambiguous.
      return opFromConstructText(constructText) ?? 'EXPLAIN';
    default:
      break;
  }

  if (skill && skill.startsWith('CARS')) return null;
  return opFromConstructText(constructText);
}

/** Resolve a CARS sub-skill from a v7 `primary_skill` code, or null if not CARS. */
export function resolveCarsSkill(skill: string | null | undefined): CarsSkill | null {
  switch (skill?.trim().toUpperCase()) {
    case 'CARS_FOC':
      return 'FOC';
    case 'CARS_RWT':
      return 'RWT';
    case 'CARS_RBT':
      return 'RBT';
    default:
      return null;
  }
}
