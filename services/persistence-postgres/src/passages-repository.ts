/**
 * Passage of the Day content-pool persistence (migration 0019).
 *
 * The `passages` + `passage_questions` tables are the source of truth for the
 * daily CARS passage. Their canonical seed is the hardcoded pool in
 * `content/passage-of-the-day/pool.ts`; the passage ingest ADDS user-authored
 * passages on top. This module mirrors `cars-duel-topics-repository.ts`: a
 * probe (`hasPassages`), a read (`listPassages` / `getPassagePool`), and an
 * idempotent write (`upsertPassages` / `seedPassages`), all over the same
 * structural `Queryable` the other repositories use.
 *
 * SERVER-ONLY: these tables carry the answer key + rationales, so a read here is
 * projected to a learner-safe view by the passage selector before it reaches the
 * browser — this module never does that projection itself and must not be reached
 * from a learner bundle.
 *
 * FORMATIVE: reading/seeding passages mints no mastery and logs no attempt.
 */
import {
  PassageOfTheDayEntrySchema,
  type PassageChoice,
  type PassageOfTheDayEntry,
  type PassageQuestion,
} from '@mcat/contracts';
import type { Queryable } from './mastery-repository';

interface RawPassageRow extends Record<string, unknown> {
  passage_id: string;
  slug: string;
  title: string;
  discipline: string;
  theme: string;
  body: unknown;
  source: string | null;
  attribution: string | null;
  question_id: string;
  position: number;
  cars_skill: string;
  dok: number;
  stem: string;
  choices: unknown;
  explanation: string;
}

function toQuestion(row: RawPassageRow): PassageQuestion {
  const question: PassageQuestion = {
    id: row.question_id,
    stem: row.stem,
    // The per-choice answer key (correct / misconception / rationale) rides inside
    // the choices JSONB; the contract re-validates it in listPassages.
    choices: row.choices as PassageChoice[],
    explanation: row.explanation,
    carsSkill: row.cars_skill as PassageQuestion['carsSkill'],
    dok: Number(row.dok),
  };
  return question;
}

/**
 * Whether the pool tables exist (migration 0019 applied). Callers that seed on
 * bootstrap probe this first so a content-only dev database (no passage tables)
 * degrades cleanly rather than throwing.
 */
export async function hasPassages(q: Queryable): Promise<boolean> {
  const { rows } = await q.query<{ present: boolean }>(
    `select exists (
       select 1 from information_schema.tables
        where table_schema = 'public' and table_name = 'passages'
     ) as present`,
  );
  return rows[0]?.present === true;
}

/**
 * Read the whole passage pool (each entry validated back through its contract).
 * Ordered by passage creation then id, and questions by position — the stable
 * order the daily rotation walks.
 */
export async function listPassages(q: Queryable): Promise<PassageOfTheDayEntry[]> {
  const { rows } = await q.query<RawPassageRow>(
    `select
       p.passage_id, p.slug, p.title, p.discipline, p.theme, p.body, p.source, p.attribution,
       q.question_id, q.position, q.cars_skill, q.dok, q.stem, q.choices, q.explanation
     from passages p
     join passage_questions q on q.passage_id = p.passage_id
     order by p.created_at, p.passage_id, q.position`,
  );

  const byPassage = new Map<string, PassageOfTheDayEntry>();
  const order: string[] = [];
  for (const row of rows) {
    let entry = byPassage.get(row.passage_id);
    if (entry === undefined) {
      entry = {
        id: row.passage_id,
        slug: row.slug,
        title: row.title,
        discipline: row.discipline,
        theme: row.theme as PassageOfTheDayEntry['theme'],
        body: row.body as string[],
        ...(row.source === null ? {} : { source: row.source }),
        ...(row.attribution === null ? {} : { attribution: row.attribution }),
        questions: [],
      };
      byPassage.set(row.passage_id, entry);
      order.push(row.passage_id);
    }
    entry.questions.push(toQuestion(row));
  }

  return order.map((id) => PassageOfTheDayEntrySchema.parse(byPassage.get(id)));
}

/** Alias matching the loader's vocabulary — the DB read of the whole pool. */
export const getPassagePool = listPassages;

/**
 * Count passages in the pool (0 ⇒ unseeded). A light COUNT for the prod cold-start
 * content-health probe — unlike {@link listPassages} it materializes no rows.
 */
export async function countPassages(q: Queryable): Promise<number> {
  const { rows } = await q.query<{ n: number }>('select count(*)::int as n from passages');
  return Number(rows[0]?.n ?? 0);
}

function placeholders(rowCount: number, columnsPerRow: number, casts: readonly string[]): string {
  const rows: string[] = [];
  let n = 0;
  for (let r = 0; r < rowCount; r += 1) {
    const cells: string[] = [];
    for (let c = 0; c < columnsPerRow; c += 1) {
      n += 1;
      cells.push(`$${n}${casts[c] ?? ''}`);
    }
    rows.push(`(${cells.join(', ')})`);
  }
  return rows.join(', ');
}

/**
 * Idempotently upsert a set of passages and their questions. A passage's question
 * set is REPLACED wholesale (delete-then-insert), so re-ingesting a passage whose
 * question list changed cannot leave orphaned rows behind. Passages not named in
 * `entries` are left untouched — user-authored passages are ADDED, not a
 * replacement of the pool. Returns the number of passages written.
 *
 * Runs several statements; pass a transaction client as `q` for atomicity (the
 * ingest/seed tool does). Validates every entry against its contract first, so a
 * malformed entry fails before any write.
 */
export async function upsertPassages(
  q: Queryable,
  entries: readonly PassageOfTheDayEntry[],
): Promise<number> {
  if (entries.length === 0) return 0;
  const validated = entries.map((entry) => PassageOfTheDayEntrySchema.parse(entry));

  const passageParams: unknown[] = [];
  for (const entry of validated) {
    passageParams.push(
      entry.id,
      entry.slug,
      entry.title,
      entry.discipline,
      entry.theme,
      JSON.stringify(entry.body),
      entry.source ?? null,
      entry.attribution ?? null,
    );
  }
  await q.query(
    `insert into passages
       (passage_id, slug, title, discipline, theme, body, source, attribution)
     values ${placeholders(validated.length, 8, ['', '', '', '', '', '::jsonb', '', ''])}
     on conflict (passage_id) do update set
       slug = excluded.slug,
       title = excluded.title,
       discipline = excluded.discipline,
       theme = excluded.theme,
       body = excluded.body,
       source = excluded.source,
       attribution = excluded.attribution`,
    passageParams,
  );

  // Replace each named passage's question set cleanly.
  await q.query(`delete from passage_questions where passage_id = any($1::text[])`, [
    validated.map((entry) => entry.id),
  ]);

  const questionParams: unknown[] = [];
  let questionCount = 0;
  for (const entry of validated) {
    entry.questions.forEach((question, index) => {
      questionCount += 1;
      // The answer key + per-choice rationales/misconceptions ride inside `choices`.
      questionParams.push(
        question.id,
        entry.id,
        index + 1,
        question.carsSkill,
        question.dok,
        question.stem,
        JSON.stringify(question.choices),
        question.explanation,
      );
    });
  }
  if (questionCount > 0) {
    await q.query(
      `insert into passage_questions
         (question_id, passage_id, position, cars_skill, dok, stem, choices, explanation)
       values ${placeholders(questionCount, 8, ['', '', '', '', '', '', '::jsonb', ''])}
       on conflict (question_id) do update set
         passage_id = excluded.passage_id,
         position = excluded.position,
         cars_skill = excluded.cars_skill,
         dok = excluded.dok,
         stem = excluded.stem,
         choices = excluded.choices,
         explanation = excluded.explanation`,
      questionParams,
    );
  }

  return validated.length;
}

/**
 * Seed the pool (idempotent upsert). A thin alias over `upsertPassages` for the
 * bootstrap/seed vocabulary the other repos use; the caller supplies the entries
 * (the canonical hardcoded pool for the initial seed).
 */
export async function seedPassages(
  q: Queryable,
  entries: readonly PassageOfTheDayEntry[],
): Promise<number> {
  return upsertPassages(q, entries);
}
