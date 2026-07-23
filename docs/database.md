# Database guide

How the MCAT Mastery database works, and how to **add**, **edit**, and **read** from it. Written for a mixed audience — short sections, with a [commands cheat-sheet](#commands-cheat-sheet) at the end.

> **Two rules before anything else:** never commit secrets (`.env`), and never put answer keys / explanations into a learner-safe payload. Both are enforced by `pnpm run verify`.

---

## 1) Overview

- **Engine:** PostgreSQL. Use **local Postgres** for development, or **Supabase** (managed Postgres) for a hosted/shared DB — the SQL is identical either way.
- **Question inventory:** the v7 loader reports 2,108 schema-valid rows. Those counts are inventory, not production eligibility or evidence of calibration, originality, rights clearance, accessibility, or certification.
- **KC-centric model:** what a learner "knows" is tracked at the **knowledge-component (KC)** level. The **4 sections** (`bb`, `cp`, `ps`, `cars`) and the **15 clusters** (`R1`…`CA2`) are a **rollup/label derived from each question's KC** (`primary_kc_id` → owning lesson → module → cluster) — not the source of truth. `CROSS_SECTION` is its own reasoning strand.

## 2) Tables

The full schema lives in `database/migrations/*.sql`. Imported inventory is in `0006_question_bank.sql`; fail-closed serving is in `0007_question_serving_eligibility.sql`.

- **`questions`** — administrative imported inventory. It excludes answer values but includes family, KC, lesson, skill, DOK, status, and other learner cues. It is not a learner DTO or selector.
- **`question_protected`** — server-only legacy unversioned answer material for inspection/backfill.
- **`question_serving_versions`**, mappings, and approvals — immutable exact reviewed snapshots. Existing imported rows receive no automatic serving version and therefore remain ineligible.
- **`question_protected_versions`** — server-only answer material bound to exact item versions.
- **selection/receipt/reservation/presentation/exposure/invalidation tables** — atomic authority state that prevents fresh-family and local-dependence reuse.
- The **other authority tables** (learners, events, projections, sessions, rate limits, …) are also in `database/migrations/` (`0001`–`0005`). The same database serves the whole app authority.

## 3) Connecting

The connection is **env-driven** — nothing is hardcoded.

1. `cp .env.example .env`, then edit `.env`. **`.env` is gitignored — never commit it.**
2. Set two variables (placeholders — use your own values):
   - `DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/postgres` (local, Supabase Session pooler, or Aurora)
   - `DATABASE_SSL` = `require` (verify cert, default) · `no-verify` (Supabase / managed Postgres) · `disable` (local only)
3. Load it with Node's native loader (Node ≥ 20.6; no `dotenv` dependency): `node --env-file=.env <script>`.

## 4) Reading

Read through the `@mcat/persistence-postgres` seam — don't hand-write answer queries in app code.

**Administrative inventory** (metadata-bearing; never return directly to learners):

```ts
import {
  createDatabasePoolFromEnv,
  getAdministrativeQuestion,
  listAdministrativeQuestions,
  countQuestions,
  countQuestionsBySection,
} from '@mcat/persistence-postgres';

const pool = createDatabasePoolFromEnv(); // reads DATABASE_URL / DATABASE_SSL
const q = await getAdministrativeQuestion(pool, 'v7-…');
const cars = await listAdministrativeQuestions(pool, {
  section: 'cars',
  cluster: 'CA1',
  limit: 20,
});
const total = await countQuestions(pool); // inventory count only
const bySection = await countQuestionsBySection(pool);
```

**Production authorization** applies all contextual gates and records exposure atomically:

```ts
import { authorizeQuestionPresentation } from '@mcat/persistence-postgres';
const authorization = await authorizeQuestionPresentation(pool, authorityRequest, {
  selectionAuthoritySecret: process.env.QUESTION_SELECTION_SECRET!,
});
// Only authorization.learner_view may cross the learner boundary.
```

**Server-only scoring** is an explicit subpath and requires presentation + learner identity:

```ts
import { getVersionBoundProtectedAnswer } from '@mcat/persistence-postgres/server/question-scoring';
const answer = await getVersionBoundProtectedAnswer(pool, presentationId, learnerId);
```

The legacy `getLegacyAdministrativeQuestionAnswer` accessor is inspection/backfill-only and must not score production attempts.

## 5) Adding / editing questions

Questions are authored in the **v7 shape**. The canonical schema is Zod in `packages/content/src/schema.ts`; generated JSON Schemas are in `content/question-bank/schema/`.

A v7 record needs at least: `id`, `section` (`BB|CP|PS|CARS|CROSS_SECTION`), `stem`, `choices` `{A,B,C,D}`, `correct_answer`, `explanations` `{A..D}`, plus classification (`primary_kc_id`, `lesson_id`, `primary_skill`, …) and an **`assets`** list.

**`assets`** (figures/tables/3D — generated later): each is `{ type, status, spec, alt, storage_key }`.

- `type` ∈ `none | table | plot | diagram | molecule_2d | molecule_3d | equation | annotated_diagram`
- `status` ∈ `needed | generating | ready` (starts empty / `needed`)
- Fill `spec` (what to generate) later; once rendered, upload the file to storage and set `storage_key`.

**Pipeline — v7 JSONL → validated → DB:**

```bash
# 1) validate the corpus (Zod shape + semantic checks)
pnpm --filter @mcat/content-cli start -- load-v7 [path-to-v7.jsonl]
# 2) build the DB seed (derives section + cluster, splits answers into question_protected)
pnpm --filter @mcat/content-cli start -- db-seed [path-to-v7.jsonl]
#    -> writes content/question-bank/.local/v7-load/seed.sql   (gitignored; contains answers)
# 3) apply schema + seed to your DB
psql "$DATABASE_URL" -f database/migrations/0006_question_bank.sql
psql "$DATABASE_URL" -f content/question-bank/.local/v7-load/seed.sql
```

- **Add:** put the new record in the v7 JSONL, re-run `db-seed`, re-apply `seed.sql`. The inserts use `on conflict (question_id) do nothing`, so re-running is safe and won't duplicate.
- **Edit:** because of `on conflict do nothing`, the seed will **not** overwrite an existing row. To change one, either `delete from questions where question_id = '…'` first (it cascades to `question_protected`) and re-seed, or run a targeted `update`.
- **Retire:** update its `status`, or `delete from questions where question_id = '…'` (cascades to the protected row).
- **Validate authored JSON files** in a folder: `pnpm --filter @mcat/content-cli start -- validate <dir>`. `validateV7Question` requires every choice to have an explanation and a valid `correct_answer`, and warns on `assets` marked `ready` without a `storage_key` / `alt`.

Answer material stays server-only end-to-end: `compileV7Question` (`packages/content/src/compile.ts`) splits `correct_answer` + `explanations` out of the learner-safe payload, and the seed writes them only into `question_protected`.

This import workflow populates administrative inventory only. It does not create `question_serving_versions`, review approvals, family/local-dependence decisions, or versioned protected answers. Migration 0007 intentionally has no bulk backfill.

## 6) Migrations

- SQL migrations live in `database/migrations/NNNN_name.sql` and apply in filename order.
- The runner is `database/src/migrate.ts` → `runMigrations(pool, migrationsDir)`: it creates an `authority_schema_migrations` table, takes an advisory lock, and applies each _unapplied_ file in a transaction, with a checksum guard against edits to already-applied files. (AWS runs it via the migration Lambda; locally you can apply files with `psql -f`.)
- **Add a migration:** create the next-numbered file, e.g. `database/migrations/0008_description.sql`, following the existing style (lowercase SQL, `check` constraints, `timestamptz`). **Never edit an already-applied migration** — the checksum guard will fail.

## 7) Safety rules (please read)

- **Never commit `.env` or any secret.** Only `.env.example` (placeholders) is committed.
- **Never put protected answer material or routing/review cues in a learner payload.** Production delivery returns only the minimal view created by atomic presentation authorization.
- The **protected-content scan** (`pnpm run scan:protected`, part of `pnpm run verify`) fails the build if answer fields appear in tracked learner-safe files. Keep `verify` green before pushing.
- The `.local/` seed bundle (which contains answers) is **gitignored** — never commit it.

## Commands cheat-sheet

```bash
# install + full gate (lint, typecheck, tests, protected-content scan)
pnpm install
pnpm run verify

# content pipeline
pnpm --filter @mcat/content-cli start -- validate <dir>    # validate authored v7 JSON files
pnpm --filter @mcat/content-cli start -- load-v7 [path]     # validate + compile the v7 corpus
pnpm --filter @mcat/content-cli start -- db-seed [path]     # build seed.sql (gitignored)
pnpm --filter @mcat/content-cli start -- schemas           # regenerate JSON Schemas

# connect + apply to a DB (PLACEHOLDERS ONLY — never paste a real URL/password here)
cp .env.example .env                                       # then edit .env (gitignored)
psql "$DATABASE_URL" -f database/migrations/0006_question_bank.sql
psql "$DATABASE_URL" -f database/migrations/0007_question_serving_eligibility.sql
psql "$DATABASE_URL" -f content/question-bank/.local/v7-load/seed.sql
psql "$DATABASE_URL" -c 'select section, count(*) from questions group by section order by section;'
```

**See also:** [`docs/question-storage-plan.md`](question-storage-plan.md) (design + the current integration boundary) · [`docs/concept-tree-and-mapping.md`](concept-tree-and-mapping.md) (the KC → cluster mapping).
