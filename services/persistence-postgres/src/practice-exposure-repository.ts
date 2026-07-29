/**
 * Postgres-backed adaptive Practice bank port + per-learner exposure/repair
 * bookkeeping (see database/migrations/0009_practice.sql).
 *
 * This is the CONCRETE `PracticeBankPort` the deployed authority (learner-api)
 * and the dev in-process authority inject. It reads the real v7 corpus through
 * the learner-safe seam and the server-only answer accessor, and owns the two
 * practice tables (practice_exposure, practice_repair) + population stats.
 *
 * SCHEMA-AWARE: it probes once whether the mastery/practice schema is present.
 * Against a content-only database (just `questions`/`question_protected`, e.g. a
 * dev bank where migrations 0007–0009 haven't been applied) it degrades safely:
 *   - derives the 7-op reasoning skill in-app from `primary_skill` when the
 *     `reasoning_operation` column is absent,
 *   - uses the DOK cold-start for difficulty when `question_stats` is absent,
 *   - keeps exposure/repair in-memory when those tables are absent.
 * Against the full deployed schema it uses the richer columns/tables.
 *
 * Answer material is read ONLY in `getAnswer` (server-only `question_protected`)
 * and never enters a queue payload.
 */
import type { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import type {
  AttemptActivityType,
  PracticeAnswer,
  PracticeAttemptAuthorization,
  PracticeAttemptGrant,
  PracticeAttemptLogEntry,
  PracticeBankItem,
  PracticeBankPort,
  PracticeCandidateUnit,
  PracticeExposure,
  PracticeItemClassification,
  PracticeItemQuery,
  PracticeRepairTarget,
  StoredPracticeAttemptGrant,
} from '@mcat/authority-core';
import { adjudicateAttemptGrant } from '@mcat/authority-core';
import type {
  CarsSkill,
  PracticeDomain,
  PracticeQuestion,
  ReasoningOperation,
  SkillCluster,
  UtcTimestamp,
} from '@mcat/contracts';
import {
  findPracticeItems,
  getQuestionAnswer,
  LEARNER_SAFE_COLUMNS,
  type LearnerSafeQuestion,
  type PracticePoolItem,
} from './question-bank-repository';
import { getQuestionStat, recordQuestionAttempt } from './question-stats-repository';
import {
  hasPracticeAttemptLog,
  listPracticeAttempts,
  recordPracticeAttempt,
} from './practice-attempt-repository';

const REASONING_OPERATIONS = new Set<string>([
  'IDENTIFY',
  'PREDICT',
  'EXPLAIN',
  'RELATE',
  'QUANTIFY',
  'DESIGN',
  'EVIDENCE',
]);

const carsSkillOf = (primarySkill: string | null | undefined): CarsSkill | null => {
  switch (primarySkill?.trim().toUpperCase()) {
    case 'CARS_FOC':
      return 'FOC';
    case 'CARS_RWT':
      return 'RWT';
    case 'CARS_RBT':
      return 'RBT';
    default:
      return null;
  }
};

/**
 * Derive the 7-op reasoning axis from the v7 `primary_skill` code — the fallback
 * used when the corpus has no `reasoning_operation` column. Mirrors the SIRS→op
 * mapping in @mcat/content `resolveReasoningOperation` (SIRS2 defaults to EXPLAIN
 * without the construct text). CARS codes are not science operations → null.
 */
const opFromPrimarySkill = (primarySkill: string | null | undefined): ReasoningOperation | null => {
  switch (primarySkill?.trim().toUpperCase()) {
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
      return 'EXPLAIN';
    default:
      return null;
  }
};

const domainOf = (section: string | null, primarySkill: string | null | undefined): PracticeDomain =>
  section === 'cars' || carsSkillOf(primarySkill) !== null ? 'cars' : 'science';

const reasoningOpOf = (value: string | null | undefined): ReasoningOperation | null =>
  value !== null && value !== undefined && REASONING_OPERATIONS.has(value)
    ? (value as ReasoningOperation)
    : null;

/** The authored op column if present+valid, else derived from primary_skill. */
const skillOf = (
  reasoningOperation: string | null | undefined,
  primarySkill: string | null | undefined,
): ReasoningOperation | null => reasoningOpOf(reasoningOperation) ?? opFromPrimarySkill(primarySkill);

const asCluster = (value: string | null): SkillCluster | null => value as SkillCluster | null;

/** `listPracticeAttempts` already filters to the displayed types; this narrows. */
const activityTypeOf = (value: string): AttemptActivityType =>
  value === 'study' ? 'study' : 'practice';

const toChoices = (raw: unknown): PracticeQuestion['choices'] => {
  const map = (raw ?? {}) as Record<string, string>;
  return (['A', 'B', 'C', 'D'] as const).map((id) => ({ id, text: map[id] ?? '' }));
};

const toPracticeQuestion = (row: LearnerSafeQuestion): PracticeQuestion => ({
  id: row.question_id,
  section: row.section,
  cluster: row.cluster,
  passage: row.passage ?? '',
  stem: row.stem,
  choices: toChoices(row.choices),
});

const toBankItem = (row: PracticePoolItem): PracticeBankItem => {
  const domain = domainOf(row.section, row.primary_skill);
  return {
    question: toPracticeQuestion(row),
    b: row.attempts > 20 ? row.b : null,
    attempts: row.attempts,
    correct: row.correct,
    dok: row.dok_level,
    kcId: row.kc_id,
    skill: domain === 'science' ? skillOf(row.reasoning_operation, row.primary_skill) : null,
    carsSkill: carsSkillOf(row.primary_skill),
    cluster: asCluster(row.cluster),
    domain,
  };
};

interface UnitRow {
  kc_id: string | null;
  reasoning_operation?: string | null;
  primary_skill: string | null;
  cluster: string | null;
  section: string | null;
  dok: number | null;
  item_count: number;
}

interface RepairRow {
  kc_id: string;
  skill: string | null;
}

interface Schema {
  hasReasoningOp: boolean;
  hasQuestionStats: boolean;
  hasExposure: boolean;
  hasRepair: boolean;
  /** Migrations 0010 + 0011 (the question attempt log) have been applied. */
  hasAttemptLog: boolean;
  /** Migration 0013 (server-issued practice attempt grants) has been applied. */
  hasAttemptGrant: boolean;
}

interface MemExposure {
  count: number;
  lastSeenAt: string;
}

/** The concrete practice bank port over a Postgres pool (RDS Proxy in prod). */
export class PostgresPracticeBankPort implements PracticeBankPort {
  private schemaPromise?: Promise<Schema>;
  // In-memory fallbacks used only when the practice tables aren't present
  // (content-only dev DB); keeps rotation/repair working within the session.
  private readonly memExposure = new Map<string, Map<string, MemExposure>>();
  private readonly memMisses = new Map<
    string,
    { kcId: string; skill?: ReasoningOperation; at: string }[]
  >();
  private readonly memAttempts = new Map<string, PracticeAttemptLogEntry[]>();
  private readonly memGrants = new Map<string, Map<string, StoredPracticeAttemptGrant>>();

  constructor(private readonly pool: Pool) {}

  private schema(): Promise<Schema> {
    return (this.schemaPromise ??= this.probeSchema());
  }

  private async probeSchema(): Promise<Schema> {
    const tables = await this.pool.query<{ table_name: string }>(
      `select table_name from information_schema.tables
        where table_schema = 'public' and table_name = any($1)`,
      [['question_stats', 'practice_exposure', 'practice_repair', 'practice_attempt_grant']],
    );
    const present = new Set(tables.rows.map((r) => r.table_name));
    const col = await this.pool.query(
      `select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'questions'
          and column_name = 'reasoning_operation' limit 1`,
    );
    return {
      hasReasoningOp: (col.rowCount ?? 0) > 0,
      hasQuestionStats: present.has('question_stats'),
      hasExposure: present.has('practice_exposure'),
      hasRepair: present.has('practice_repair'),
      hasAttemptLog: await hasPracticeAttemptLog(this.pool),
      hasAttemptGrant: present.has('practice_attempt_grant'),
    };
  }

  async listUnits({ limit }: { limit: number }): Promise<PracticeCandidateUnit[]> {
    const schema = await this.schema();
    const opCol = schema.hasReasoningOp ? 'reasoning_operation,' : '';
    const opGroup = schema.hasReasoningOp ? ', reasoning_operation' : '';
    const { rows } = await this.pool.query<UnitRow>(
      `select kc_id, ${opCol} primary_skill, cluster, section,
              round(avg(dok_level))::int as dok, count(*)::int as item_count
         from questions
        where (status is null or status not in
               ('held_out','holdout','retired','archived','draft','rejected'))
        group by kc_id, primary_skill, cluster, section${opGroup}
        order by item_count desc
        limit $1`,
      [Math.min(Math.max(limit, 1), 2000)],
    );
    const units: PracticeCandidateUnit[] = [];
    for (const row of rows) {
      const domain = domainOf(row.section, row.primary_skill);
      if (domain === 'cars') {
        const carsSkill = carsSkillOf(row.primary_skill);
        if (carsSkill === null) continue;
        units.push({
          kcId: row.kc_id ?? `cars:${carsSkill}`,
          skill: null,
          carsSkill,
          cluster: asCluster(row.cluster),
          section: row.section ?? 'cars',
          domain: 'cars',
          dok: row.dok,
          lessonId: null,
          itemCount: Number(row.item_count),
        });
        continue;
      }
      if (row.kc_id === null) continue; // science mastery needs a KC to route to
      units.push({
        kcId: row.kc_id,
        skill: skillOf(row.reasoning_operation, row.primary_skill),
        carsSkill: null,
        cluster: asCluster(row.cluster),
        section: row.section ?? 'bb',
        domain: 'science',
        dok: row.dok,
        lessonId: null,
        itemCount: Number(row.item_count),
      });
    }
    return units;
  }

  async findItems(
    query: PracticeItemQuery,
    { excludeIds, limit }: { excludeIds: readonly string[]; limit: number },
  ): Promise<PracticeBankItem[]> {
    const schema = await this.schema();
    const rows = await findPracticeItems(this.pool, {
      bBand: [query.targetB - 0.5, query.targetB + 0.5],
      excludeIds,
      limit,
      hasReasoningOp: schema.hasReasoningOp,
      hasQuestionStats: schema.hasQuestionStats,
      ...(query.domain === 'science'
        ? {
            ...(query.kcId !== undefined ? { kcId: query.kcId } : {}),
            // Filter by the op column only when it exists; otherwise KC + difficulty
            // select the pool and the item's operation is derived for attribution.
            ...(schema.hasReasoningOp && query.skill !== undefined
              ? { reasoningOp: query.skill }
              : {}),
          }
        : {
            section: 'cars',
            ...(query.carsSkill !== undefined
              ? { primarySkill: `CARS_${query.carsSkill}` }
              : {}),
          }),
    });
    return rows.map(toBankItem);
  }

  private async learnerSafeRow(questionId: string): Promise<LearnerSafeQuestion | null> {
    const schema = await this.schema();
    const columns = (
      schema.hasReasoningOp
        ? LEARNER_SAFE_COLUMNS
        : LEARNER_SAFE_COLUMNS.filter((c) => c !== 'reasoning_operation')
    ).join(', ');
    const { rows } = await this.pool.query(
      `select ${columns} from questions where question_id = $1`,
      [questionId],
    );
    return (rows[0] as LearnerSafeQuestion | undefined) ?? null;
  }

  async classify(questionId: string): Promise<PracticeItemClassification | null> {
    const row = await this.learnerSafeRow(questionId);
    if (row === null) return null;
    const domain = domainOf(row.section, row.primary_skill);
    return {
      kcId: row.kc_id,
      skill: domain === 'science' ? skillOf(row.reasoning_operation, row.primary_skill) : null,
      carsSkill: carsSkillOf(row.primary_skill),
      cluster: asCluster(row.cluster),
      domain,
      dok: row.dok_level,
      lessonId: row.lesson_id,
      familyId: row.family_id,
    };
  }

  async getQuestion(questionId: string): Promise<PracticeQuestion | null> {
    const row = await this.learnerSafeRow(questionId);
    return row === null ? null : toPracticeQuestion(row);
  }

  async getAnswer(questionId: string): Promise<PracticeAnswer | null> {
    const answer = await getQuestionAnswer(this.pool, questionId);
    if (answer === null) return null;
    const explanations = answer.explanations ?? {};
    return {
      correctChoiceId: answer.correct_answer,
      rationale: explanations[answer.correct_answer] ?? 'See the per-choice explanations.',
      choiceRationales: explanations,
    };
  }

  async questionStats(questionId: string): Promise<{ attempts: number; correct: number }> {
    const schema = await this.schema();
    if (!schema.hasQuestionStats) return { attempts: 0, correct: 0 };
    return (await getQuestionStat(this.pool, questionId)) ?? { attempts: 0, correct: 0 };
  }

  async recordAttempt(questionId: string, correct: boolean, now: string): Promise<void> {
    const schema = await this.schema();
    if (!schema.hasQuestionStats) return; // no population stats table (dev content DB)
    await recordQuestionAttempt(this.pool, questionId, correct, now);
  }

  async recentlySeenIds(
    learnerId: string,
    { withinDays, limit }: { withinDays: number; limit: number },
  ): Promise<string[]> {
    const schema = await this.schema();
    if (!schema.hasExposure) {
      const map = this.memExposure.get(learnerId);
      if (map === undefined) return [];
      const cutoff = Date.now() - Math.max(0, withinDays) * 86_400_000;
      return [...map.entries()]
        .filter(([, e]) => Date.parse(e.lastSeenAt) >= cutoff)
        .sort((a, b) => Date.parse(b[1].lastSeenAt) - Date.parse(a[1].lastSeenAt))
        .slice(0, limit)
        .map(([id]) => id);
    }
    const { rows } = await this.pool.query<{ question_id: string }>(
      `select question_id from practice_exposure
        where learner_id = $1 and last_seen_at >= (now() - ($2 || ' days')::interval)
        order by last_seen_at desc
        limit $3`,
      [learnerId, String(Math.max(0, withinDays)), Math.min(Math.max(limit, 1), 2000)],
    );
    return rows.map((r) => r.question_id);
  }

  /**
   * `seen_count` comes back from the upsert that increments it, so the prior
   * count the authority derives `firstAttempt` from is read and written in one
   * statement. A separate `select` would leave a window in which two concurrent
   * submissions of the same item both read zero and both counted as first.
   *
   * `returning` is on the whole statement, so it reports the post-increment
   * value on both branches of the upsert: 1 on the insert, n+1 on the update.
   */
  async recordExposure(
    learnerId: string,
    questionId: string,
    now: string,
  ): Promise<PracticeExposure> {
    const schema = await this.schema();
    if (!schema.hasExposure) {
      const map = this.memExposure.get(learnerId) ?? new Map<string, MemExposure>();
      const entry = map.get(questionId);
      const priorExposures = entry?.count ?? 0;
      map.set(questionId, { count: priorExposures + 1, lastSeenAt: now });
      this.memExposure.set(learnerId, map);
      return { priorExposures };
    }
    const { rows } = await this.pool.query<{ seen_count: number }>(
      `insert into practice_exposure (learner_id, question_id, last_seen_at, seen_count)
       values ($1, $2, $3, 1)
       on conflict (learner_id, question_id) do update set
         last_seen_at = excluded.last_seen_at,
         seen_count = practice_exposure.seen_count + 1
       returning seen_count`,
      [learnerId, questionId, now],
    );
    // No row back means the write did not land, and an unknown history must not
    // read as an empty one: fail closed to "seen before" rather than crediting
    // an attempt the server cannot vouch for.
    const seen = rows[0]?.seen_count;
    return { priorExposures: seen === undefined ? 1 : Math.max(0, Number(seen) - 1) };
  }

  /**
   * Record that the queue served one item, replacing any earlier grant for it.
   *
   * `consumed_at` resets on the upsert, and that is correct: the queue only
   * re-serves an item once the rotation window has released it, so a re-serve
   * IS a fresh authorization. It is not a fresh FIRST attempt — that stays with
   * `practice_exposure.seen_count`, which is unwindowed and untouched here.
   *
   * With migration 0013 absent (a content-only dev database) grants fall back
   * to process memory, exactly as exposure and repair already do. The failure
   * mode differs, though, and it is worth naming: an in-memory grant store
   * behind more than one process refuses legitimate answers rather than
   * admitting illegitimate ones. That is the safe direction, but it does mean
   * the deployed path depends on the migration having run.
   */
  async issueAttemptGrant(learnerId: string, grant: PracticeAttemptGrant): Promise<void> {
    const schema = await this.schema();
    if (!schema.hasAttemptGrant) {
      const map = this.memGrants.get(learnerId) ?? new Map<string, StoredPracticeAttemptGrant>();
      map.set(grant.questionId, { ...grant, consumedAt: null });
      this.memGrants.set(learnerId, map);
      return;
    }
    await this.pool.query(
      `insert into practice_attempt_grant
         (learner_id, question_id, spec_id, content_release, issued_at, expires_at, consumed_at)
       values ($1, $2, $3, $4, now(), $5, null)
       on conflict (learner_id, question_id) do update set
         spec_id = excluded.spec_id,
         content_release = excluded.content_release,
         issued_at = excluded.issued_at,
         expires_at = excluded.expires_at,
         consumed_at = null`,
      [learnerId, grant.questionId, grant.specId, grant.contentRelease, grant.expiresAt],
    );
  }

  /**
   * Spend the grant for one item, in one statement.
   *
   * The conditional `update ... where consumed_at is null` is the atomic half:
   * of two concurrent submissions of the same item, exactly one can see
   * `firstUse: true`, whatever the interleaving. The follow-up `select` runs
   * only when that update matched nothing, and it decides between "already
   * spent" (still authorized, as a repeat) and the four refusals. It is a
   * classification, not a gate, so its non-atomicity costs nothing.
   */
  async consumeAttemptGrant(
    learnerId: string,
    claim: { questionId: string; specId: string; contentRelease: string; now: UtcTimestamp },
  ): Promise<PracticeAttemptAuthorization> {
    const schema = await this.schema();
    if (!schema.hasAttemptGrant) {
      const map = this.memGrants.get(learnerId);
      const entry = map?.get(claim.questionId);
      const outcome = adjudicateAttemptGrant(entry, claim);
      if (outcome.status === 'authorized' && outcome.firstUse && entry !== undefined) {
        map!.set(claim.questionId, { ...entry, consumedAt: claim.now });
      }
      return outcome;
    }

    const spent = await this.pool.query(
      `update practice_attempt_grant
          set consumed_at = $5::timestamptz
        where learner_id = $1
          and question_id = $2
          and spec_id = $3
          and content_release = $4
          and consumed_at is null
          and expires_at >= $5::timestamptz`,
      [learnerId, claim.questionId, claim.specId, claim.contentRelease, claim.now],
    );
    if ((spent.rowCount ?? 0) === 1) return { status: 'authorized', firstUse: true };

    const { rows } = await this.pool.query<{
      spec_id: string;
      content_release: string;
      expires_at: Date | string;
      consumed_at: Date | string | null;
    }>(
      `select spec_id, content_release, expires_at, consumed_at
         from practice_attempt_grant
        where learner_id = $1 and question_id = $2`,
      [learnerId, claim.questionId],
    );
    const row = rows[0];
    return adjudicateAttemptGrant(
      row === undefined
        ? undefined
        : {
            questionId: claim.questionId,
            specId: row.spec_id,
            contentRelease: row.content_release,
            expiresAt: new Date(row.expires_at).toISOString() as UtcTimestamp,
            consumedAt: row.consumed_at === null ? null : new Date(row.consumed_at).toISOString(),
          },
      claim,
    );
  }

  async recentMisses(
    learnerId: string,
    { limit }: { limit: number },
  ): Promise<PracticeRepairTarget[]> {
    const schema = await this.schema();
    if (!schema.hasRepair) {
      const list = this.memMisses.get(learnerId) ?? [];
      const seen = new Set<string>();
      const out: PracticeRepairTarget[] = [];
      for (const miss of [...list].reverse()) {
        if (seen.has(miss.kcId)) continue;
        seen.add(miss.kcId);
        out.push(miss.skill ? { kcId: miss.kcId, skill: miss.skill } : { kcId: miss.kcId });
        if (out.length >= limit) break;
      }
      return out;
    }
    const { rows } = await this.pool.query<RepairRow>(
      `select distinct on (kc_id) kc_id, skill from practice_repair
        where learner_id = $1 and resolved_at is null
        order by kc_id, created_at desc
        limit $2`,
      [learnerId, Math.min(Math.max(limit, 1), 100)],
    );
    return rows.map((r) =>
      r.skill && REASONING_OPERATIONS.has(r.skill)
        ? { kcId: r.kc_id, skill: r.skill as ReasoningOperation }
        : { kcId: r.kc_id },
    );
  }

  async queueRepair(learnerId: string, target: PracticeRepairTarget, now: string): Promise<void> {
    const schema = await this.schema();
    if (!schema.hasRepair) {
      const list = this.memMisses.get(learnerId) ?? [];
      list.push(
        target.skill
          ? { kcId: target.kcId, skill: target.skill, at: now }
          : { kcId: target.kcId, at: now },
      );
      this.memMisses.set(learnerId, list);
      return;
    }
    await this.pool.query(
      `insert into practice_repair (learner_id, kc_id, skill, created_at)
       values ($1, $2, $3, $4)`,
      [learnerId, target.kcId, target.skill ?? null, now],
    );
  }

  async recordPracticeAttempt(learnerId: string, entry: PracticeAttemptLogEntry): Promise<void> {
    const schema = await this.schema();
    if (!schema.hasAttemptLog) {
      const list = this.memAttempts.get(learnerId) ?? [];
      if (
        list.some(
          (e) => e.questionId === entry.questionId && e.activityType === entry.activityType,
        )
      ) {
        return;
      }
      list.push(entry);
      this.memAttempts.set(learnerId, list);
      return;
    }
    await recordPracticeAttempt(this.pool, randomUUID(), {
      learnerId,
      questionId: entry.questionId,
      kcId: entry.kcId,
      skill: entry.skill,
      familyId: entry.familyId,
      cluster: entry.cluster,
      chosenChoiceId: entry.chosenChoiceId,
      isCorrect: entry.correct,
      firstAttempt: entry.firstAttempt,
      activityType: entry.activityType,
      occurredAt: entry.occurredAt,
    });
  }

  async listPracticeAttempts(
    learnerId: string,
    { limit }: { limit: number },
  ): Promise<PracticeAttemptLogEntry[]> {
    const schema = await this.schema();
    if (!schema.hasAttemptLog) {
      return [...(this.memAttempts.get(learnerId) ?? [])]
        .sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt))
        .slice(0, Math.max(0, limit));
    }
    const rows = await listPracticeAttempts(this.pool, learnerId, { limit });
    return rows.map((row) => ({
      questionId: row.questionId,
      kcId: row.kcId,
      skill: reasoningOpOf(row.skill),
      cluster: asCluster(row.cluster),
      familyId: row.familyId,
      chosenChoiceId: (row.chosenChoiceId as 'A' | 'B' | 'C' | 'D' | null) ?? null,
      correct: row.isCorrect,
      firstAttempt: row.firstAttempt,
      // Carried through, not defaulted: the reader hydrates a study row from the
      // authored lesson bank and a practice row from the v7 corpus, so collapsing
      // both to 'practice' would send every study miss looking in the wrong place.
      activityType: activityTypeOf(row.activityType),
      occurredAt: row.occurredAt as PracticeAttemptLogEntry['occurredAt'],
    }));
  }
}

/** Build the Postgres practice bank port from a pool. */
export function createPostgresPracticeBankPort(pool: Pool): PostgresPracticeBankPort {
  return new PostgresPracticeBankPort(pool);
}
