/**
 * Persistence for the mastery engine's per-user state (see
 * database/migrations/0007_mastery.sql and docs/mastery-pipeline.md).
 *
 * Functions accept a structural `Queryable` so they run against a `Pool` for
 * reads and inside the authority transaction's client for writes. `p_l` is stored
 * as-of `last_practiced_at`; callers apply lazy decay on read (see @mcat/policies
 * `currentPL`).
 */

/** Anything with a pg-style `query` (Pool, PoolClient, or a transaction client). */
export interface Queryable {
  query<R extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values?: readonly unknown[],
  ): Promise<{ rows: R[] }>;
}

// Lesson mastery is a derived rollup of its member KCs' mastery, computed on
// read — it has exactly one source of truth and is never stored as its own
// grain. Do not add 'lesson' back here; that would create a second, competing
// source with no arbiter. See docs/mastery-pipeline.md.
export type MasteryGrain = 'kc' | 'skill';

const GRAIN: Readonly<Record<MasteryGrain, { table: string; key: string }>> = {
  kc: { table: 'mastery_kc', key: 'kc_id' },
  skill: { table: 'mastery_skill', key: 'operation' },
};

/** Persisted memory state for one unit (timestamps as ISO strings). */
export interface MemoryStateRow {
  pL: number;
  halfLifeDays: number;
  lastPracticedAt: string | null;
  lastDueReviewAt: string | null;
}

export interface KeyedMemoryStateRow extends MemoryStateRow {
  key: string;
}

interface RawMemoryRow extends Record<string, unknown> {
  key?: string;
  p_l: number;
  half_life_days: number;
  last_practiced_at: Date | string | null;
  last_due_review_at: Date | string | null;
}

const iso = (value: Date | string | null): string | null => {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString() : value;
};

const toState = (row: RawMemoryRow): MemoryStateRow => ({
  pL: Number(row.p_l),
  halfLifeDays: Number(row.half_life_days),
  lastPracticedAt: iso(row.last_practiced_at),
  lastDueReviewAt: iso(row.last_due_review_at),
});

export async function getMasteryUnit(
  q: Queryable,
  grain: MasteryGrain,
  learnerId: string,
  key: string,
): Promise<MemoryStateRow | null> {
  const { table, key: keyCol } = GRAIN[grain];
  const { rows } = await q.query<RawMemoryRow>(
    `select p_l, half_life_days, last_practiced_at, last_due_review_at
       from ${table} where learner_id = $1 and ${keyCol} = $2`,
    [learnerId, key],
  );
  const row = rows[0];
  return row ? toState(row) : null;
}

export async function upsertMasteryUnit(
  q: Queryable,
  grain: MasteryGrain,
  learnerId: string,
  key: string,
  state: MemoryStateRow,
  updatedAt: string,
): Promise<void> {
  const { table, key: keyCol } = GRAIN[grain];
  await q.query(
    `insert into ${table}
       (learner_id, ${keyCol}, p_l, half_life_days, last_practiced_at, last_due_review_at, updated_at)
     values ($1, $2, $3, $4, $5, $6, $7)
     on conflict (learner_id, ${keyCol}) do update set
       p_l = excluded.p_l,
       half_life_days = excluded.half_life_days,
       last_practiced_at = excluded.last_practiced_at,
       last_due_review_at = excluded.last_due_review_at,
       updated_at = excluded.updated_at`,
    [
      learnerId,
      key,
      state.pL,
      state.halfLifeDays,
      state.lastPracticedAt,
      state.lastDueReviewAt,
      updatedAt,
    ],
  );
}

export async function listMasteryUnits(
  q: Queryable,
  grain: MasteryGrain,
  learnerId: string,
): Promise<KeyedMemoryStateRow[]> {
  const { table, key: keyCol } = GRAIN[grain];
  const { rows } = await q.query<RawMemoryRow>(
    `select ${keyCol} as key, p_l, half_life_days, last_practiced_at, last_due_review_at
       from ${table} where learner_id = $1`,
    [learnerId],
  );
  return rows.map((row) => ({ key: String(row.key), ...toState(row) }));
}

// ---- CARS ability (IRT; no half-life) -------------------------------------

export interface CarsAbilityRow {
  skill: string;
  v: number;
}

interface RawCarsRow extends Record<string, unknown> {
  cars_skill: string;
  v: number;
}

export async function listCarsAbility(q: Queryable, learnerId: string): Promise<CarsAbilityRow[]> {
  const { rows } = await q.query<RawCarsRow>(
    'select cars_skill, v from cars_ability where learner_id = $1',
    [learnerId],
  );
  return rows.map((row) => ({ skill: String(row.cars_skill), v: Number(row.v) }));
}

export async function upsertCarsAbility(
  q: Queryable,
  learnerId: string,
  skill: string,
  v: number,
  updatedAt: string,
): Promise<void> {
  await q.query(
    `insert into cars_ability (learner_id, cars_skill, v, updated_at)
     values ($1, $2, $3, $4)
     on conflict (learner_id, cars_skill) do update set v = excluded.v, updated_at = excluded.updated_at`,
    [learnerId, skill, v, updatedAt],
  );
}
