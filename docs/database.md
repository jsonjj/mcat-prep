# Database guide

How the MCAT Mastery database works, and how to **add**, **edit**, and **read** from it. Written for a mixed audience — short sections, with a [commands cheat-sheet](#commands-cheat-sheet) at the end.

> **Two rules before anything else:** never commit secrets (`.env.local`), and never put answer keys / explanations into a learner-safe payload. Both are enforced by `pnpm run verify`.

---

## 1) Overview
- **Engine:** PostgreSQL. Use **local Postgres** for development, or **Supabase** (managed Postgres) for a hosted/shared DB — the SQL is identical either way.
- **What's stored:** the **2,108 v7 questions** (our generated MCAT question corpus), plus the app's authority data.
- **KC-centric model:** what a learner "knows" is tracked at the **knowledge-component (KC)** level. The **4 sections** (`bb`, `cp`, `ps`, `cars`) and the **15 clusters** (`R1`…`CA2`) are a **rollup/label derived from each question's KC** (`primary_kc_id` → owning lesson → module → cluster) — not the source of truth. `CROSS_SECTION` is its own reasoning strand.

## 2) Tables
The full schema lives in `database/migrations/*.sql`. The question bank is `database/migrations/0006_question_bank.sql`.

- **`questions`** — the **learner-safe** record. Columns: `question_id`, `content_release`, `section`, `cluster`, `kc_id`, `lesson_id`, `family_id`, `subject`, `primary_skill`, `dok_level`, `stem`, `passage`, `choices` (jsonb), `assets` (jsonb), `status`, `created_at`. **No answer key here.**
- **`question_protected`** — **server-only**. `question_id`, `correct_answer` (`A`–`D`), `explanations` (jsonb, per choice).
- **Why they're separate:** the answer key + explanations must **never** reach the browser/learner. Splitting them into a different table means a learner-safe read *cannot* return them, even by mistake.
- The **other authority tables** (learners, events, projections, sessions, rate limits, …) are also in `database/migrations/` (`0001`–`0005`). The same database serves the whole app authority.

## 3) Connecting
The connection is **env-driven** — nothing is hardcoded.

1. `cp .env.example .env.local`, then edit `.env.local`. **`.env.local` is gitignored — never commit it.** The filename matters: the local stack (`pnpm dev`, `pnpm db:migrate`) reads repo-root `.env.local` and nothing else — see [`docs/runbooks/local-real-stack.md`](runbooks/local-real-stack.md).
2. Set two variables (placeholders — use your own values):
   - `DATABASE_URL=postgresql://USER:PASSWORD@HOST:PORT/postgres` (local, Supabase, or Aurora). For the shared Supabase dev project this must be the **transaction pooler on port 6543**: the session pooler on 5432 does not answer, and the direct `db.<ref>.supabase.co` host is IPv6-only.
   - `DATABASE_SSL` = `require` (verify cert, default) · `no-verify` (Supabase / managed Postgres) · `disable` (local only)
3. `pnpm dev` and `pnpm db:migrate` load `.env.local` themselves. The CLIs below read `DATABASE_URL` straight from the environment, so export it or point Node's native loader at the same file (Node ≥ 20.6; no `dotenv` dependency): `node --env-file=.env.local <script>`.

## 4) Reading
Read through the `@mcat/persistence-postgres` seam — don't hand-write answer queries in app code.

**Learner-safe** (explicit column allowlist — cannot return the answer key):
```ts
import {
  createDatabasePoolFromEnv,
  getLearnerSafeQuestion,
  listLearnerSafeQuestions,
  countQuestions,
  countQuestionsBySection,
} from '@mcat/persistence-postgres';

const pool = createDatabasePoolFromEnv();                 // reads DATABASE_URL / DATABASE_SSL
const q = await getLearnerSafeQuestion(pool, 'v7-…');     // stem, choices, assets — NO answer
const cars = await listLearnerSafeQuestions(pool, { section: 'cars', cluster: 'CA1', limit: 20 });
const total = await countQuestions(pool);                 // 2108
const bySection = await countQuestionsBySection(pool);
```

**Server-only** (scoring authority only — NEVER send to the browser):
```ts
import { getQuestionAnswer } from '@mcat/persistence-postgres';
const answer = await getQuestionAnswer(pool, 'v7-…');     // { correct_answer, explanations }
```

**The rule:** answers come **only** from `getQuestionAnswer` (the `question_protected` table). Everything learner-facing uses the learner-safe functions.

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

## 6) Migrations
- SQL migrations live in `database/migrations/NNNN_name.sql` and apply in filename order.
- The runner is `database/src/migrate.ts` → `runMigrations(pool, migrationsDir)`: it creates an `authority_schema_migrations` table, takes an advisory lock, and applies each *unapplied* file in a transaction, with a checksum guard against edits to already-applied files. (AWS runs it via the migration Lambda; locally, `pnpm db:migrate` applies them against the `DATABASE_URL` in your `.env.local`, or you can apply files with `psql -f`.)
- **Add a migration:** create the next-numbered file, e.g. `database/migrations/0007_description.sql`, following the existing style (lowercase SQL, `check` constraints, `timestamptz`). **Never edit an already-applied migration** — the checksum guard will fail.

## 7) Safety rules (please read)
- **Never commit `.env.local` or any secret.** Only `.env.example` (placeholders) is committed.
- **Never put `correct_answer` / `explanations` in a learner-safe payload.** Learner reads use the safe functions; answers come only from `getQuestionAnswer`.
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
cp .env.example .env.local                                 # then edit .env.local (gitignored)
psql "$DATABASE_URL" -f database/migrations/0006_question_bank.sql
psql "$DATABASE_URL" -f content/question-bank/.local/v7-load/seed.sql
psql "$DATABASE_URL" -c 'select section, count(*) from questions group by section order by section;'
```

**See also:** [`docs/question-storage-plan.md`](question-storage-plan.md) (design + the current integration boundary) · [`docs/concept-tree-and-mapping.md`](concept-tree-and-mapping.md) (the KC → cluster mapping).
