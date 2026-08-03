import { KC_TO_LESSON, LESSON_TO_CLUSTER } from './data/v3-cluster-map.data';

/**
 * REFERENTIAL-INTEGRITY GUARD for the question bank ↔ V3 curriculum.
 *
 * The learning system is KC-centric: mastery lives on the ~422 V3 KCs and the
 * section/cluster rollups are DERIVED from a question's `kc_id` (see
 * `v7-cluster-map.ts`). A question that references a KC the curriculum has never
 * heard of — or that declares a `lesson_id` its own KC does not belong to — is a
 * silently-mislinked item: the derivation quietly yields `cluster = null` (or, worse,
 * the WRONG cluster from the KC's real lesson), the item lands in the bank anyway, and
 * adaptive Practice mis-routes it forever. This module makes those cases fail LOUDLY.
 *
 * The in-repo curriculum/cluster data in `packages/content` is the source of truth:
 *   - `KC_TO_LESSON`      the 422 canonical V3 KC ids → their owning lesson.
 *   - `LESSON_TO_CLUSTER` the 114 canonical V3 lesson ids → one of the 15 clusters.
 * Both are generated from the pinned V3 registry (registry_sha256 in the data files).
 *
 * Pure + dependency-free so it can run in three places from ONE definition: the
 * questions ingest (hard per-row reject), a CI/local corpus scan, and the prod seed
 * (defense-in-depth before any write).
 */

/** The 422 canonical V3 KC ids the curriculum defines. */
export const CANONICAL_KC_IDS: ReadonlySet<string> = new Set(Object.keys(KC_TO_LESSON));

/** The 114 canonical V3 lesson ids the curriculum defines. */
export const CANONICAL_LESSON_IDS: ReadonlySet<string> = new Set(Object.keys(LESSON_TO_CLUSTER));

/** Engine content sections that MUST be KC/lesson-routed (science). CARS is not. */
const SCIENCE_SECTIONS: ReadonlySet<string> = new Set(['cp', 'bb', 'ps']);

/**
 * The minimal question shape the guard inspects. Compatible with both the compiled
 * learner-safe bank row (`PracticeBankSafeRow`) and the corpus pull row
 * (`apps/learner-web/server/db-pull.ts` `PulledQuestion`), so ingest and the corpus
 * scan validate the exact same fields.
 */
export interface CurriculumRefRow {
  readonly question_id: string;
  readonly section?: string | null;
  readonly cluster?: string | null;
  readonly kc_id?: string | null;
  readonly lesson_id?: string | null;
}

export type CurriculumRefViolationCode =
  | 'unknown_kc_id'
  | 'unknown_lesson_id'
  | 'kc_lesson_mismatch'
  | 'missing_science_refs'
  | 'unresolved_cluster';

export interface CurriculumRefViolation {
  readonly question_id: string;
  readonly code: CurriculumRefViolationCode;
  readonly message: string;
}

/** Normalize an optional id field: trims, and treats empty string as absent. */
function idOrNull(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/**
 * Validate one row against the curriculum. Returns every violation (a row can trip
 * more than one, e.g. an unknown KC that also leaves the cluster unresolved), each with
 * an actionable message naming the offending ids. An empty array means the row is clean.
 */
export function validateCurriculumRefRow(row: CurriculumRefRow): CurriculumRefViolation[] {
  const violations: CurriculumRefViolation[] = [];
  const kc = idOrNull(row.kc_id);
  const lesson = idOrNull(row.lesson_id);
  const section = idOrNull(row.section)?.toLowerCase() ?? null;
  const cluster = idOrNull(row.cluster);

  const kcKnown = kc !== null && CANONICAL_KC_IDS.has(kc);
  const lessonKnown = lesson !== null && CANONICAL_LESSON_IDS.has(lesson);

  const add = (code: CurriculumRefViolationCode, message: string): void => {
    violations.push({ question_id: row.question_id, code, message });
  };

  if (kc !== null && !kcKnown) {
    add(
      'unknown_kc_id',
      `kc_id "${kc}" is not one of the ${CANONICAL_KC_IDS.size} canonical V3 KCs ` +
        `(packages/content v3-cluster-map).`,
    );
  }
  if (lesson !== null && !lessonKnown) {
    add(
      'unknown_lesson_id',
      `lesson_id "${lesson}" is not one of the ${CANONICAL_LESSON_IDS.size} canonical V3 lessons ` +
        `(packages/content v3-cluster-map).`,
    );
  }
  // The high-value mislink check: the KC exists and the lesson exists, but the KC does
  // not belong to that lesson — the item would silently roll up to the KC's real
  // cluster, not the one it claims. Only checked when both ids resolve (an unknown id
  // is already reported above and its canonical owner is unknowable).
  if (kcKnown && lessonKnown) {
    const owningLesson = KC_TO_LESSON[kc as string];
    if (owningLesson !== lesson) {
      add(
        'kc_lesson_mismatch',
        `kc_id "${kc}" belongs to lesson "${owningLesson}" but the question declares ` +
          `lesson_id "${lesson}" — silently-mislinked question.`,
      );
    }
  }
  // Science items are KC-routed by construction; a missing ref means no mastery grain.
  if (section !== null && SCIENCE_SECTIONS.has(section) && (kc === null || lesson === null)) {
    add(
      'missing_science_refs',
      `a ${section} (science) question must carry both kc_id and lesson_id ` +
        `(kc_id=${kc ?? 'null'}, lesson_id=${lesson ?? 'null'}).`,
    );
  }
  // The literal "do not silently store cluster=null" rule: the KC→lesson→cluster path
  // and the skill facet all failed to resolve a cluster for this row.
  if (cluster === null) {
    add(
      'unresolved_cluster',
      `cluster did not resolve (null): the KC→lesson→cluster path and skill facet all ` +
        `failed. Refusing to store cluster=null.`,
    );
  }

  return violations;
}

/** Validate a batch of rows, returning every violation across all of them. */
export function validateCurriculumRefs(
  rows: readonly CurriculumRefRow[],
): CurriculumRefViolation[] {
  const all: CurriculumRefViolation[] = [];
  for (const row of rows) all.push(...validateCurriculumRefRow(row));
  return all;
}

/** One-line, human-readable rendering of a violation (shared by ingest/scan/seed). */
export function formatCurriculumRefViolation(violation: CurriculumRefViolation): string {
  return `  ${violation.question_id} [${violation.code}] ${violation.message}`;
}
